# Tilt Energy — Founder Cockpit

A single-file, self-contained founder + life dashboard (`index.html`). No build step, no
framework. It works instantly offline, saving to your browser. Add a Firebase config and it
also **syncs across every device** you sign in on.

- **Tabs:** Home (daily overview) · Business · Personal · Journal
- **Data:** saved locally in the browser under `dash-*` keys; mirrored to Firebase Firestore
  when signed in. There is also an **Export / Import backup** (JSON) in the Journal tab.

---

## 1. Run it locally

Just open `index.html` in a browser. Everything works except cross-device sync (that needs
Firebase, below).

---

## 2. Deploy the hosting

You can use **either** Netlify **or** Firebase Hosting — pick one (or both). Data sync uses
Firebase Firestore regardless of where you host.

### Option A — Netlify (easiest)
1. Go to https://app.netlify.com → **Add new site → Deploy manually**.
2. Drag the whole `Personal Dash` folder onto the page. Done — you get a URL like
   `https://your-site.netlify.app`.
   (Or connect the folder as a Git repo for auto-deploys. `netlify.toml` is already set up.)

### Option B — Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
# edit .firebaserc and replace YOUR_FIREBASE_PROJECT_ID with your project id
firebase deploy --only hosting
```
You get a URL like `https://your-project.web.app`.

---

## 3. Turn on cross-device sync (Firebase)

1. Create a project at https://console.firebase.google.com.
2. **Build → Authentication → Get started → Sign-in method → enable Google.**
3. **Build → Firestore Database → Create database** (Production mode is fine).
4. Deploy the security rules in `firestore.rules` (they let each user read/write only their
   own data):
   ```bash
   firebase deploy --only firestore:rules
   ```
   (or paste the contents of `firestore.rules` into Firestore → Rules → Publish.)
5. **Project settings → General → Your apps → Web app** (create one if needed) and copy the
   `firebaseConfig` values.
6. Open `index.html`, find `FIREBASE_CONFIG` (near the bottom, in the `<script>`), and paste
   your values:
   ```js
   var FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     appId: "…"
   };
   ```
7. **Authentication → Settings → Authorized domains:** add your Netlify domain
   (`your-site.netlify.app`) and/or Firebase domain (`your-project.web.app`) so Google
   sign-in is allowed there.
8. Redeploy.

Now click the **sync chip** (top-right) → **Sign in** with Google. Your data uploads, and on
any other device you sign in on, it downloads automatically. The chip shows **Synced** when
it's connected.

---

## How syncing works
- Your working copy lives in the browser (`localStorage`). Every change is also pushed to
  `dashboards/{your-uid}` in Firestore (debounced ~1s).
- On sign-in, if the cloud copy is newer than this device's, it's pulled down and the page
  reloads with it. Simple last-write-wins across devices for a single user.
- No config or not signed in → everything still works locally; use **Export backup** for a
  portable copy.

## Live data — Shopify + Outlook (Netlify Functions)
The dashboard calls two serverless endpoints on load. They live in `netlify/functions/` and
run on **Netlify** (Node 18+). Secrets stay server-side and never reach the browser. If the
endpoints aren't configured (or you open the file locally / in the Claude preview), the app
quietly keeps the built-in snapshot — nothing breaks.

- `GET /api/shopify` → live revenue / orders / AOV (30-day + prior 30-day) and a 7-month series
- `GET /api/outlook` → today's calendar for **harry@tiltenergy.com.au** in **Perth** time

### A. Shopify token
1. Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**.
2. **Configure Admin API scopes** → enable `read_orders` (add `read_products` if you extend it).
3. **Install app**, then copy the **Admin API access token** (`shpat_…`).
4. In Netlify → **Site settings → Environment variables**, add:
   - `SHOPIFY_STORE` = `tiltenergy.myshopify.com` (your permanent `*.myshopify.com` domain)
   - `SHOPIFY_TOKEN` = the `shpat_…` token

### B. Outlook (Microsoft Graph, app-only)
1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID → App registrations → New registration** (single tenant is fine).
2. **API permissions → Add a permission → Microsoft Graph → Application permissions → `Calendars.Read`**, then **Grant admin consent**.
3. **Certificates & secrets → New client secret** → copy the secret **Value**.
4. From **Overview**, copy the **Application (client) ID** and **Directory (tenant) ID**.
5. In Netlify env vars, add:
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
   - `OUTLOOK_USER` = `harry@tiltenergy.com.au` (optional; this is the default)
   - `OUTLOOK_TZ` = `Australia/Perth` (optional; the default)

Redeploy after adding env vars. The agenda then pulls straight from your Outlook each load
(live Outlook events replace the seeded ones; any events you add by hand are kept). The sync
note under the Business tab flips to **“live from Shopify”** and the agenda to **“live from Outlook”**.

> Hosting on Firebase instead of Netlify? Use **Firebase Cloud Functions** for the same two
> endpoints and a `firebase.json` rewrite mapping `/api/**` to them — the front-end code is
> identical. Ask and I'll generate the Firebase-Functions versions.

## Files
| File | Purpose |
|---|---|
| `index.html` | The entire app |
| `netlify.toml` | Netlify hosting config |
| `firebase.json` | Firebase Hosting + Firestore config |
| `.firebaserc` | Firebase project id (edit this) |
| `firestore.rules` | Per-user security rules |
