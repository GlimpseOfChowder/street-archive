# Street Archive

A GTA / NFS-style turf map for car crews in the Philippines: club territories, meets, cruises,
shows, and car places (mechanic shops, car washes, detailing, tint, tires, parts).
Social pages use the name **Street Archive: Car Scene Map** (@streetarchivemap).

Runs on free tiers: **GitHub Pages** (website), **Supabase** (database + accounts),
**Google sign-in**, and CARTO / Esri / OpenStreetMap (maps).
Browsing is open to everyone; posting needs a Google account.

## Files

| File / folder | What it's for |
|---|---|
| `index.html`, `script.js`, `styles.css` | The app. |
| `js/config.js` | Supabase link + public key, Google client ID, map key, reminder lead time. |
| `js/backend.js` | Talks to Supabase (loading the map, posting, editing, admin, reports). |
| `data/crews.js`, `data/events.js` | Optional hard-coded entries (empty — everything lives in Supabase now). |
| `privacy.html` | Privacy policy (linked from the footer and the Google sign-in screen). |
| `club_logos/` | Crew logos (type just the file name in the crew form). |
| `supabase/` | Database setup: `schema.sql` + `update-1…4` (already applied), the `ics` calendar function, and `keep-alive.yml`. |
| `.github/workflows/keep-alive.yml` | (on GitHub only) pings Supabase daily so the free project never pauses; emails you if it's down. |
| `beta/` | Test copy of the site — try changes at `…/street-archive/beta/` before replacing the main files. |
| `google-apps-script/` | The old Google Sheet backend (retired; kept for reference). |
| `_backup_v1/` | Older versions of every file (`*.v8-sheet.*` = last Google Sheet version). |

**Never upload** `dbpwd.txt` or any Supabase *secret* / *service_role* key. The publishable key in
`js/config.js` is meant to be public.

**When updating:** upload `index.html` together with any changed `script.js` / `styles.css` / `js/*.js`
(index.html carries a `?v=` version tag so phones don't mix old and new files).

## How posting works

- Anyone signed in taps **+ Submit** → meet, crew or shop → picks the spot (tap the map, search a
  place, paste coordinates / a Google Maps link, or "I'm here").
- New posts wait in **Pending** until the admin approves — except:
  - **trusted** accounts (tick `is_trusted` in Supabase → Table Editor → profiles), and
  - **automatic trust**: 3+ approved posts and no strikes → posts go live right away.
- Posters can **Edit / Delete** their own posts (account menu → My posts). Edits keep the status;
  edits to live posts get an **Edited** tag in the admin panel (tap **Looks OK** to clear).
- Limits: **2 posts/day for accounts under 7 days old**, 5/day after that (trusted: no limit).

## Admin panel (account menu → Admin panel)

Tabs **Pending / Reported / Live / Archived**, filtered by **Meets / Crews / Shops / Edited**.
- **Approve**, **Archive** (hide but keep), **Restore**, **Delete**, **Edit**, **Repost…** (archived meets).
- **Reported:** 3 reports from different accounts (or 1 from you) hide a post. **Keep it** puts it back
  and clears the reports; **Take down** / **Delete** removes it.
- **Strikes:** archiving/deleting someone's *pending* or *reported* post gives them a strike, which turns
  off automatic trust. Reset in Supabase → profiles → `strikes`.
- **Ban:** Supabase → Table Editor → profiles → tick `is_banned`.
- **Make someone admin:** tick `is_admin` (they must sign in once first).
- Edits you make directly in the Supabase Table Editor skip all the posting rules.

## Free-plan limits (Supabase)

No card on file → you can't be billed. Free: 500 MB database, 5 GB egress/month, 50,000 monthly
sign-ins, unlimited API requests. Paused after 7 days with no activity (the keep-alive job prevents
that). Check **Supabase → Usage** occasionally; a scheduled usage check also reports on the 1st and 15th.

## Notifications today

- **🔔 Remind me** — alert before the meet while the site is open.
- **📅 Calendar** — Android: Google Calendar; iPhone: opens Apple Calendar (served by the Supabase
  `ics` function). Works even when the site is closed.
- **NEW badge** and a **24h heads-up** for upcoming meets.

## Roadmap

1. ~~Database + accounts (Supabase)~~ · ~~shops & car washes~~ · ~~edit/delete own posts~~ · ~~reports & auto-trust~~
2. **Crew roles** — join requests, crew admins approve members and post crew-only meets.
3. **Installable web app (PWA) + real push notifications** — Android and iPhone (Add to Home Screen).
4. **Google Play** — wrap the PWA (Trusted Web Activity). US$25 once; new personal accounts need a
   closed test with 12+ testers for 14 days. Needs `/.well-known/assetlinks.json` at the domain root
   (a `username.github.io` repo or a custom domain).
5. **Profiles / My Garage, RSVPs, badges**, then the money-making ideas.
6. App Store only if it grows enough to justify US$99/year (Apple often rejects website-in-a-frame apps).

## Running it locally

`python -m http.server 8080` in this folder → http://localhost:8080 (Google sign-in needs
localhost or the live site, not a double-clicked file).

## Credits / limits

Map data © OpenStreetMap contributors; dark tiles © CARTO; satellite © Esri. Place search uses
OpenStreetMap Nominatim (max 1 request/second, no search-as-you-type). Get each crew's OK before
listing their logo. Describe events as meets/shows/cruises — nothing that promotes street racing.
