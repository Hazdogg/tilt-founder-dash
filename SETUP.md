# Setup — Firebase + Netlify

Recommended split (both free tiers):
- **Firebase** = Google sign-in + Firestore (your data, synced across devices)
- **Netlify** = hosts the site + runs the live API (Shopify + Outlook)

Work top to bottom. Tick each box as you go.

---

## PART 1 — Firebase (auth + data sync)  ~10 min

- [ ] **1.1** Go to https://console.firebase.google.com → **Add project** → name it (e.g. `tilt-cockpit`) → create. (Analytics optional.)
- [ ] **1.2** Left menu **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
- [ ] **1.3** **Build → Firestore Database → Create database →** Start in **production mode** → pick a location (e.g. `australia-southeast1`) → Enable.
- [ ] **1.4** Firestore → **Rules** tab → paste the contents of `firestore.rules` → **Publish**.
      (This lets each signed-in user read/write only their own document.)
- [ ] **1.5** **Project settings** (gear, top-left) → scroll to **Your apps → Web app** (`</>`) → register app (nickname anything, skip Hosting checkbox) → copy the **`firebaseConfig`** object shown.
- [ ] **1.6** Open `index.html`, search for **`FIREBASE_CONFIG`** (near the bottom, inside `<script>`), and paste your values:
      ```js
      var FIREBASE_CONFIG = {
        apiKey: "…",
        authDomain: "tilt-cockpit.firebaseapp.com",
        projectId: "tilt-cockpit",
        appId: "…"
      };
      ```
- [ ] **1.7** Authentication → **Settings → Authorized domains → Add domain** → add your Netlify URL once you have it (Part 2), e.g. `tilt-cockpit.netlify.app`. (Google sign-in is blocked on domains not listed here.)

✅ Sign-in + sync are now ready. (You'll click the **sync chip** top-right and sign in after deploying.)

---

## PART 2 — Netlify (hosting + live API)  ~10 min

- [ ] **2.1** Go to https://app.netlify.com → **Add new site → Deploy manually** → drag the whole **`Personal Dash`** folder onto the page.
      (It includes `netlify.toml` + `netlify/functions/`, so the API deploys automatically.)
- [ ] **2.2** You now have a URL like `https://<name>.netlify.app`. Go back to **Firebase → Auth → Authorized domains** and add it (step 1.7).
- [ ] **2.3** **Shopify token:** Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app** → **Configure Admin API scopes** → tick **`read_orders`** → Save → **Install app** → copy the **Admin API access token** (`shpat_…`).
- [ ] **2.4** **Outlook / Azure app:**
      - https://portal.azure.com → **Microsoft Entra ID → App registrations → New registration** (Single tenant) → Register.
      - **API permissions → Add a permission → Microsoft Graph → Application permissions → `Calendars.Read`** → Add → then **Grant admin consent** (button at top).
      - **Certificates & secrets → New client secret** → copy the **Value** (not the Secret ID).
      - **Overview** → copy **Application (client) ID** and **Directory (tenant) ID**.
- [ ] **2.5** Netlify → your site → **Site configuration → Environment variables → Add** these:
      | Key | Value |
      |---|---|
      | `SHOPIFY_STORE` | `tiltenergy.myshopify.com` |
      | `SHOPIFY_TOKEN` | the `shpat_…` token |
      | `MS_TENANT_ID` | Directory (tenant) ID |
      | `MS_CLIENT_ID` | Application (client) ID |
      | `MS_CLIENT_SECRET` | the client secret **Value** |
      | `OUTLOOK_USER` | `harry@tiltenergy.com.au` |
      | `OUTLOOK_TZ` | `Australia/Perth` |
- [ ] **2.6** **Redeploy** (Deploys → Trigger deploy → Deploy site) so the new env vars + your `FIREBASE_CONFIG` edit go live.

✅ Open your Netlify URL. The Business tab note should read **“live from Shopify”** and the agenda **“live from Outlook”**. Click the sync chip → **Sign in** with Google.

### Quick API test (optional)
Visit these directly in the browser — they should return JSON, not an error:
- `https://<name>.netlify.app/api/shopify`
- `https://<name>.netlify.app/api/outlook`

---

## Not sure which `*.myshopify.com` domain?
It's your **permanent** store domain (Shopify admin → Settings → Domains → shows the `xxxx.myshopify.com`). In this project it also appeared as `a69eb6.myshopify.com` — either the vanity `tiltenergy.myshopify.com` or that one works, as long as the token belongs to the same store.

---

## Alternative — run EVERYTHING on Firebase (skip Netlify)
Only if you'd rather not use Netlify. Requires the Firebase **Blaze** plan (outbound network calls aren't allowed on the free Spark plan; Blaze is pay-as-you-go and effectively free at this volume).

1. Install tools + log in: `npm i -g firebase-tools && firebase login`
2. Edit `.firebaserc` → replace `YOUR_FIREBASE_PROJECT_ID` with your project id.
3. `cd functions && npm install && cd ..`
4. Add these two rewrites to `firebase.json` under `hosting` (before the catch-all `**` rewrite):
   ```json
   { "source": "/api/shopify", "function": "shopify" },
   { "source": "/api/outlook", "function": "outlook" },
   ```
5. Set secrets + env:
   ```bash
   firebase functions:secrets:set SHOPIFY_TOKEN
   firebase functions:secrets:set MS_CLIENT_SECRET
   ```
   and set the non-secret vars (`SHOPIFY_STORE`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `OUTLOOK_USER`, `OUTLOOK_TZ`) in the Google Cloud console for the functions, or via a `functions/.env` file.
6. Deploy: `firebase deploy` (hosting + functions + rules).

The front-end is identical — it just calls `/api/shopify` and `/api/outlook` on whatever host serves it.
