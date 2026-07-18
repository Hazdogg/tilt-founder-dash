// OPTIONAL — Firebase Cloud Functions version of the live API.
// Only needed if you host the API on Firebase instead of Netlify.
// (Netlify's netlify/functions/*.js already cover this for the recommended split.)
// Firebase Functions that make outbound calls require the Blaze (pay-as-you-go) plan.
//
// Deploy:  firebase deploy --only functions
// Env vars: set with `firebase functions:config` is deprecated — use runtime env / secrets:
//   firebase functions:secrets:set SHOPIFY_TOKEN
//   firebase functions:secrets:set MS_CLIENT_SECRET
//   ...and plain env for the non-secret ids (see .env in this folder or the console).

const { onRequest } = require("firebase-functions/v2/https");

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

const shopify = onRequest({ cors: true, secrets: ["SHOPIFY_TOKEN"] }, async (req, res) => {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) { res.status(400).json({ error: "Shopify not configured." }); return; }
  const api = `https://${store}/admin/api/2024-10`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const since = new Date(); since.setMonth(since.getMonth() - 7); since.setDate(1); since.setHours(0, 0, 0, 0);
  let url = `${api}/orders.json?status=any&created_at_min=${encodeURIComponent(since.toISOString())}&limit=250&fields=id,created_at,total_price,current_total_price`;
  let orders = [];
  try {
    for (let i = 0; i < 12 && url; i++) {
      const r = await fetch(url, { headers });
      if (!r.ok) { res.status(r.status).json({ error: "Shopify API error", detail: await r.text() }); return; }
      const data = await r.json();
      orders = orders.concat(data.orders || []);
      const link = r.headers.get("link") || "";
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
  } catch (e) { res.status(502).json({ error: "Shopify fetch failed", detail: String(e) }); return; }

  const now = Date.now(), d30 = now - 30 * 864e5, d60 = now - 60 * 864e5;
  let rev30 = 0, ord30 = 0, rev60 = 0, ord60 = 0; const monthMap = {};
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    const amt = parseFloat(o.total_price || o.current_total_price || 0) || 0;
    if (t >= d30) { rev30 += amt; ord30++; } else if (t >= d60) { rev60 += amt; ord60++; }
    const mk = (o.created_at || "").slice(0, 7);
    if (mk) { monthMap[mk] = monthMap[mk] || { rev: 0, ord: 0 }; monthMap[mk].rev += amt; monthMap[mk].ord++; }
  }
  const months = []; const cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0);
  const m = new Date(cur); m.setMonth(m.getMonth() - 6);
  for (; m <= cur; m.setMonth(m.getMonth() + 1)) {
    const mk = m.toISOString().slice(0, 7); const e = monthMap[mk] || { rev: 0, ord: 0 };
    months.push({ label: m.toLocaleString("en", { month: "short" }), revenue: round2(e.rev), orders: e.ord });
  }
  const curMk = new Date().toISOString().slice(0, 7); const mtd = monthMap[curMk] ? monthMap[curMk].rev : 0;
  res.set("Cache-Control", "no-store").json({
    currency: "AUD", revenue30: round2(rev30), revenuePrev30: round2(rev60),
    orders30: ord30, ordersPrev30: ord60,
    aov30: ord30 ? round2(rev30 / ord30) : 0, aovPrev30: ord60 ? round2(rev60 / ord60) : 0,
    mtdRevenue: round2(mtd), months, fetchedAt: new Date().toISOString()
  });
});

const outlook = onRequest({ cors: true, secrets: ["MS_CLIENT_SECRET"] }, async (req, res) => {
  const tenant = process.env.MS_TENANT_ID, cid = process.env.MS_CLIENT_ID, secret = process.env.MS_CLIENT_SECRET;
  const user = process.env.OUTLOOK_USER || "harry@tiltenergy.com.au";
  const tz = process.env.OUTLOOK_TZ || "Australia/Perth";
  if (!tenant || !cid || !secret) { res.status(400).json({ error: "Outlook not configured." }); return; }
  try {
    const tokRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cid, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
    });
    if (!tokRes.ok) { res.status(tokRes.status).json({ error: "Token error", detail: await tokRes.text() }); return; }
    const { access_token } = await tokRes.json();
    const start = new Date(Date.now() - 24 * 3600e3), end = new Date(Date.now() + 48 * 3600e3);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/calendarView`
      + `?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}`
      + `&$orderby=${encodeURIComponent("start/dateTime")}&$top=50`
      + `&$select=${encodeURIComponent("subject,start,end,location,isCancelled")}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Prefer: `outlook.timezone="${tz}"` } });
    if (!r.ok) { res.status(r.status).json({ error: "Graph error", detail: await r.text() }); return; }
    const data = await r.json();
    const events = (data.value || []).filter((e) => !e.isCancelled).map((e) => {
      const sdt = e.start && e.start.dateTime ? e.start.dateTime : "";
      const edt = e.end && e.end.dateTime ? e.end.dateTime : "";
      const loc = e.location && e.location.displayName ? e.location.displayName : "";
      return { date: sdt.slice(0, 10), time: sdt.slice(11, 16), title: e.subject || "(no title)", sub: loc || (edt ? "until " + edt.slice(11, 16) : "") };
    });
    res.set("Cache-Control", "no-store").json({ user, timezone: tz, events, fetchedAt: new Date().toISOString() });
  } catch (e) { res.status(502).json({ error: "Outlook fetch failed", detail: String(e) }); }
});

module.exports = { shopify, outlook };
