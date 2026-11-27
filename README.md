# Street Archive

A GTA / NFS-style turf map for car crews: club territories, meets, cruises and shows.
Runs 100% free — no backend, no accounts, no API keys.

## Files

| File | What it's for |
|---|---|
| `data/crews.js` | Crews / clubs and their turf (circle or polygon). **Edit this to add crews.** |
| `data/events.js` | Meets, cruises, shows. **Edit this to post meets.** Delete the 3 `sample` entries once you have real ones. |
| `js/config.js` | Map keys, Google Sheet link, start position, reminder lead time. |
| `privacy.html` | Privacy policy (linked from the site footer and Google sign-in screen). |
| `google-apps-script/Code.gs` | The Google Sheet backend — paste into Apps Script (see below). |
| `club_logos/` | Square crew logos (jpg/png). |
| `script.js`, `styles.css`, `index.html` | The app. |
| `_backup_v1/` | Your original version, untouched. |

## Adding stuff (no coding)

- **With the Google Sheet set up (below):** anyone taps **+ Submit**, fills it in, picks the spot on the map → it lands in your Sheet → you tick **approved**.
- **Without it:** **+ Submit** generates a block of text — **Copy** it into `data/crews.js` or `data/events.js` inside the `[ ... ]` list, save, upload.

Crews whose turf centres are within ~600 m share one turf automatically (striped in both crews' colours, logos side by side).

## Google Sheet database (submissions + approval)

Visitors' **+ Submit** goes into a Google Sheet. You tick **approved** and it shows on the map
(within ~30 s). Free; no server. Code is in `google-apps-script/Code.gs`.

### One-time setup (~15 min)
1. Go to https://sheets.new (signed in to the Google account that should own the data). Name it **Street Archive DB**.
2. **Extensions → Apps Script**. Delete what's in `Code.gs`, paste the whole contents of `google-apps-script/Code.gs`, click 💾 Save.
3. In the function dropdown at the top pick **setup** → **Run**. Approve the permissions:
   *Review permissions → choose your account → Advanced → Go to (project) (unsafe) → Allow.*
   ("Unsafe" just means Google hasn't reviewed your own private script.) The Sheet now has **Meets** and **Crews** tabs.
4. **Deploy → New deployment** → ⚙ gear → **Web app**.
   Execute as: **Me** · Who has access: **Anyone** → **Deploy**. Copy the **Web app URL** (ends in `/exec`).
5. Paste it into `js/config.js → sheetApiUrl`, save, upload `js/config.js` to GitHub.

### Daily use
- New submission → you get an email → open the Sheet → tick **approved**. Untick to hide it again.
- You can fix typos straight in the Sheet. Delete a row to remove it for good.
- `contact` and `submitted_by` (the poster's email) are only visible to you in the Sheet — the website never receives them.
- Crew logos: paste an image link in `logo`, or put the file in `club_logos/` on GitHub and type just the file name.
- `data/crews.js` / `data/events.js` still work too (good for your core crews). If an id exists in both, the file wins.
- Emails: set `NOTIFY_EMAIL` at the top of the script (`"off"` to stop).

### If you change Code.gs later
**Deploy → Manage deployments → ✏ edit → Version: New version → Deploy.** (Same URL; just saving isn't enough.)

## Google sign-in (required to post)

Browsing stays open to everyone; posting needs a Google account. Every post is tied to the
account (private — only you see it in the Sheet). Anti-spam built in:
**5 posts/day per account**, **Users** tab → tick **banned** to block someone, tick **trusted**
so their posts go live without approval (and skip the daily limit).

### One-time setup (~10 min, free)
1. https://console.cloud.google.com → project dropdown → **New project** → name it *Street Archive* → Create (make sure it's selected).
2. Menu → **Google Auth Platform** → **Get started**: App name *Street Archive*, your support email,
   Audience **External**, contact email → **Create**.
3. **Clients → Create client** → Application type **Web application**, name *Street Archive web*.
   **Authorized JavaScript origins** → add:
   - `https://glimpseofchowder.github.io`
   - `http://localhost:8080` (and `http://localhost`, `http://127.0.0.1:5500` if you use Live Server)
   Leave *redirect URIs* empty → **Create**. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
4. **Audience → Publish app** (status *In production*) so anyone can sign in, not just test users.
   We only ask for name + email, so Google doesn't need to review it.
5. Paste the Client ID in **two** places:
   - `js/config.js → googleClientId`
   - top of the Apps Script → `GOOGLE_CLIENT_ID`
6. In Apps Script: run **setup** again (it adds the Users tab + new columns, and asks for one extra
   permission — "connect to an external service", used to check Google sign-ins).
   Then **Deploy → Manage deployments → ✏ → New version → Deploy**.

Sign-in doesn't work when opening `index.html` by double-click — use the live site or localhost.
Once public with sign-in, you're collecting emails → add a short privacy policy page (also needed for Play Store).

## Running it locally

Double-click `index.html`, or (better — reminders and Near me work more reliably)
run a tiny server in the folder: `python -m http.server 8080` → open http://localhost:8080
(your VS Code launch config already points there).

## Free hosting — GitHub Pages

1. Create a free GitHub account → **New repository** → name it `street-archive` (Public).
2. **Add file → Upload files** → drag in everything in this folder (except `_backup_v1` if you like) → Commit.
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / root → Save.
4. Site goes live at `https://<your-username>.github.io/street-archive/` in ~1 min.
   To update later, edit the files on GitHub (pencil icon) or re-upload.

Share links like `…/street-archive/#meet=<id>` or `#crew=<id>` open straight to that meet/crew.

## What "notifications" do right now (free tier)

- **🔔 Remind me** — browser notification + in-app alert before the meet, **while the site is open in a tab**.
- **📅 Calendar** — downloads an `.ics` with a built-in alarm (or one-tap Google Calendar). This is the reliable alert today: works even when the site is closed.
- **NEW badge** — meets posted since your last visit are flagged.
- **24h heads-up** — opening the site shows anything happening in the next 24 hours.

## Roadmap — when you want it "real" (still free tiers)

1. ~~Let people submit without you copy-pasting~~ — done: Google Sheet database.
2. **Live database + logins** — [Supabase](https://supabase.com) free tier (Postgres + auth + storage for logos). Move `crews`/`events` into tables; crew admins log in and post their own meets; you approve.
3. **True push notifications (site closed, phone locked)** — add a service worker + [OneSignal](https://onesignal.com) free tier or Firebase Cloud Messaging. Users "follow" a crew or an area and get pinged on new meets.
4. **Installable app** — add a `manifest.json` so it can be "Added to Home Screen" like an app (PWA). Pairs with #3.
5. **Turf wars / reputation** — RSVPs ("pulling up"), crew attendance stats, turf strength shading, verified-crew badges.

## Before going public — checklist

- **Dark map key:** get a free CARTO key at https://carto.com/basemaps/apikey, paste it into `js/config.js → cartoKey`, and restrict it to your GitHub Pages domain. Without it the Night map uses Esri's dark grey map. Free tier: 5M tile requests/month non-commercial (1M commercial).
- **Esri maps (fallback dark map + Satellite):** fine for a hobby site. For a store app, create a free ArcGIS Location Platform account and check their terms.
- **Place search** uses OpenStreetMap Nominatim: max 1 request/second for the whole site, no search-as-you-type (the app only searches places on Enter). Policy: https://operations.osmfoundation.org/policies/nominatim/ — if the site gets busy, move to a free-tier geocoder (LocationIQ, Stadia, OpenCage).
- **Crew logos & links:** get each crew's OK before listing them.
- **Keep the attribution line** (bottom right) — it's required by the map providers.

## Google Play (later)

The site is a web app, so the Play Store route is: make it a PWA (manifest + service worker + 512px icon) → wrap it with https://www.pwabuilder.com (Trusted Web Activity) → upload.
- Play developer account: one-time US$25.
- New personal accounts must run a closed test with 12+ testers for 14 continuous days before going public.
- Needs a privacy policy URL (the app uses location) and the Data safety form.
- The wrapper needs `/.well-known/assetlinks.json` at the **root** of your domain — a project site (`username.github.io/street-archive`) can't do that; use a `username.github.io` repo (add an empty `.nojekyll` file) or a custom domain.
- Describe it as meets/shows/cruises — avoid anything that reads as promoting illegal street racing (Play's dangerous-activities policy).

## Credits / limits

Map data © OpenStreetMap contributors; dark tiles © CARTO; satellite © Esri. All free for low-traffic
sites — if Street Archive gets big, switch tiles to a free-tier key from MapTiler or Stadia Maps.
Place search uses OpenStreetMap Nominatim (fair use: light traffic only).
