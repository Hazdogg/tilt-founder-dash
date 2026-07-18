// Netlify Function: live Shopify metrics for Tilt Energy.
// Proxies the Shopify Admin API so the store token never reaches the browser.
// Env vars (Netlify → Site settings → Environment variables):
//   SHOPIFY_STORE  e.g. "tiltenergy.myshopify.com"  (the *.myshopify.com domain)
//   SHOPIFY_TOKEN  Admin API access token from a custom app (scopes: read_orders)
// Requires Node 18+ (global fetch), which is Netlify's default.

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

exports.handler = async function () {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) return json(400, { error: "Shopify not configured (set SHOPIFY_STORE and SHOPIFY_TOKEN)." });

  const api = `https://${store}/admin/api/2024-10`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

  // Pull orders from the start of the month ~7 months back
  const since = new Date();
  since.setMonth(since.getMonth() - 7);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  let url = `${api}/orders.json?status=any&created_at_min=${encodeURIComponent(since.toISOString())}&limit=250&fields=id,created_at,total_price,current_total_price`;
  let orders = [];
  try {
    for (let i = 0; i < 12 && url; i++) {
      const res = await fetch(url, { headers });
      if (!res.ok) return json(res.status, { error: "Shopify API error", detail: await res.text() });
      const data = await res.json();
      orders = orders.concat(data.orders || []);
      const link = res.headers.get("link") || "";
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
  } catch (e) {
    return json(502, { error: "Shopify fetch failed", detail: String(e) });
  }

  const now = Date.now(), d30 = now - 30 * 864e5, d60 = now - 60 * 864e5;
  let rev30 = 0, ord30 = 0, rev60 = 0, ord60 = 0;
  const monthMap = {};
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    const amt = parseFloat(o.total_price || o.current_total_price || 0) || 0;
    if (t >= d30) { rev30 += amt; ord30++; }
    else if (t >= d60) { rev60 += amt; ord60++; }
    const mk = (o.created_at || "").slice(0, 7);
    if (mk) { monthMap[mk] = monthMap[mk] || { rev: 0, ord: 0 }; monthMap[mk].rev += amt; monthMap[mk].ord++; }
  }

  // Build a 7-month series ending with the current month
  const months = [];
  const cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0);
  const m = new Date(cur); m.setMonth(m.getMonth() - 6);
  for (; m <= cur; m.setMonth(m.getMonth() + 1)) {
    const mk = m.toISOString().slice(0, 7);
    const e = monthMap[mk] || { rev: 0, ord: 0 };
    months.push({ label: m.toLocaleString("en", { month: "short" }), revenue: round2(e.rev), orders: e.ord });
  }
  const curMk = new Date().toISOString().slice(0, 7);
  const mtd = monthMap[curMk] ? monthMap[curMk].rev : 0;

  return json(200, {
    currency: "AUD",
    revenue30: round2(rev30), revenuePrev30: round2(rev60),
    orders30: ord30, ordersPrev30: ord60,
    aov30: ord30 ? round2(rev30 / ord30) : 0, aovPrev30: ord60 ? round2(rev60 / ord60) : 0,
    mtdRevenue: round2(mtd),
    months,
    fetchedAt: new Date().toISOString()
  });
};
