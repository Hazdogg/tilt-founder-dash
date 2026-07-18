// Netlify Function: live Outlook calendar for harry@tiltenergy.com.au
// Uses Microsoft Graph with the OAuth2 client-credentials (app-only) flow, so the
// secret never reaches the browser. Returns events in Perth local time.
// Env vars (Netlify → Site settings → Environment variables):
//   MS_TENANT_ID      Azure AD directory (tenant) ID
//   MS_CLIENT_ID      App registration (client) ID
//   MS_CLIENT_SECRET  App registration client secret value
//   OUTLOOK_USER      (optional) mailbox to read — defaults to harry@tiltenergy.com.au
//   OUTLOOK_TZ        (optional) IANA tz — defaults to Australia/Perth
// The app registration needs Application permission "Calendars.Read" with admin consent.
// Requires Node 18+ (global fetch).

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

exports.handler = async function () {
  const tenant = process.env.MS_TENANT_ID;
  const cid = process.env.MS_CLIENT_ID;
  const secret = process.env.MS_CLIENT_SECRET;
  const user = process.env.OUTLOOK_USER || "harry@tiltenergy.com.au";
  const tz = process.env.OUTLOOK_TZ || "Australia/Perth";
  if (!tenant || !cid || !secret) return json(400, { error: "Outlook not configured (set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)." });

  try {
    // 1) App-only access token
    const tokRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cid, client_secret: secret,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials"
      })
    });
    if (!tokRes.ok) return json(tokRes.status, { error: "Token error", detail: await tokRes.text() });
    const { access_token } = await tokRes.json();

    // 2) Wide window (-1d..+2d UTC); the client filters to its own local "today".
    const start = new Date(Date.now() - 24 * 3600e3);
    const end = new Date(Date.now() + 48 * 3600e3);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/calendarView`
      + `?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}`
      + `&$orderby=${encodeURIComponent("start/dateTime")}&$top=50`
      + `&$select=${encodeURIComponent("subject,start,end,location,isCancelled,showAs")}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Prefer: `outlook.timezone="${tz}"` } });
    if (!res.ok) return json(res.status, { error: "Graph error", detail: await res.text() });
    const data = await res.json();

    const events = (data.value || []).filter(function (e) { return !e.isCancelled; }).map(function (e) {
      const sdt = e.start && e.start.dateTime ? e.start.dateTime : "";
      const edt = e.end && e.end.dateTime ? e.end.dateTime : "";
      const loc = e.location && e.location.displayName ? e.location.displayName : "";
      return {
        date: sdt.slice(0, 10),          // yyyy-mm-dd in Perth time (from Prefer header)
        time: sdt.slice(11, 16),         // HH:MM
        title: e.subject || "(no title)",
        sub: loc || (edt ? "until " + edt.slice(11, 16) : "")
      };
    });

    return json(200, { user, timezone: tz, events, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return json(502, { error: "Outlook fetch failed", detail: String(e) });
  }
};
