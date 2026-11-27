/* =====================================================================
   STREET ARCHIVE — Google Sheet backend (Google Apps Script)
   ---------------------------------------------------------------------
   Paste this whole file into Extensions → Apps Script of your Google
   Sheet, fill in GOOGLE_CLIENT_ID, run setup() once, then
   Deploy → New deployment → Web app.  Full steps: README.md.

   - GET  (site loads)          → APPROVED rows only, no private columns
   - POST {action:"submit"}     → signed-in user adds a meet/crew (unapproved,
                                  or live at once if the user is "trusted")
   - POST {action:"mine"}       → the signed-in user's own posts + status
   - Users tab                  → tick "banned" to block, "trusted" to auto-approve,
                                  "admin" to get the in-site admin panel
   - POST {action:"whoami"}     → signed-in user's role (admin / trusted)
   - POST {action:"admin_*"}    → admins list / approve / archive / restore / delete / update (edit a meet)
   ===================================================================== */

// From Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web).
// Must be the SAME value as googleClientId in the website's js/config.js.
// Leave "" to allow posting without sign-in (not recommended once public).
var GOOGLE_CLIENT_ID = "470626874651-bpmhitt7pfe3knrraamdqt6jtpmtpjgd.apps.googleusercontent.com";

// Max posts per account per 24 hours (trusted users are exempt).
var DAILY_LIMIT = 5;

// Where to send "new submission" emails. "" = your own Google account. "off" = no emails.
var NOTIFY_EMAIL = "";

var TZ = "Asia/Manila";

var SHEETS = {
  Meets: ["submitted_at", "approved", "id", "title", "type", "host", "start", "end", "place", "lat", "lng", "details", "link", "contact", "submitted_by", "archived"],
  Crews: ["submitted_at", "approved", "id", "name", "area", "color", "radius_km", "lat", "lng", "logo", "link", "tags", "contact", "submitted_by", "archived"],
  Users: ["user_id", "email", "name", "first_seen", "last_seen", "posts", "trusted", "banned", "admin", "notes"]
};
// Never sent to the website:
var PRIVATE = ["submitted_at", "approved", "contact", "submitted_by", "archived"];
// Stored as plain text so Sheets doesn't turn them into dates/numbers:
var TEXT_COLS = ["id", "host", "start", "end", "color", "logo", "link", "tags", "contact", "title", "name", "place", "area", "details", "submitted_by", "user_id", "email", "notes"];

/* ---------- run once from the editor (safe to re-run; adds missing columns) ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (name) {
    var want = SHEETS[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var have = sh.getLastRow() > 0 ? sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String) : [];
    var cols = have.filter(Boolean);
    want.forEach(function (c) { if (cols.indexOf(c) === -1) cols.push(c); });
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold").setBackground("#111").setFontColor("#ffd400");
    sh.setFrozenRows(1);
    cols.forEach(function (c, i) {
      if (TEXT_COLS.indexOf(c) > -1) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat("@");
    });
    sh.autoResizeColumns(1, cols.length);
  });
  var def = ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/* ---------- website reads approved rows ---------- */
function doGet() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("public");
  if (hit) return json_(hit, true);
  var ss = SpreadsheetApp.getActive();
  var out = { crews: publicRows_(ss, "Crews"), events: publicRows_(ss, "Meets"), updated: new Date().toISOString() };
  var body = JSON.stringify(out);
  if (body.length < 90000) cache.put("public", body, 30);
  return json_(body, true);
}

function publicRows_(ss, name) {
  return rows_(ss, name).filter(function (o) { return isTrue_(o.approved) && !isTrue_(o.archived); }).map(function (o) {
    var pub = {};
    Object.keys(o).forEach(function (h) {
      if (PRIVATE.indexOf(h) > -1 || h.charAt(0) === "_") return;
      var v = o[h];
      if (v instanceof Date) v = Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm");
      pub[h] = v === null ? "" : v;
    });
    return pub;
  });
}

/* ---------- POST: submit / mine ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.website) return json_({ ok: true }); // honeypot: bots fill hidden fields

    var user = null;
    if (GOOGLE_CLIENT_ID) {
      user = verifyGoogle_(d.idToken);
      if (!user) return json_({ ok: false, auth: true, error: "Please sign in again." });
    }
    var ss = SpreadsheetApp.getActive();

    if (d.action === "mine") {
      if (!user) return json_({ ok: true, items: [] });
      return json_({ ok: true, items: mine_(ss, user.email) });
    }

    lock.waitLock(10000);
    var u = user ? upsertUser_(ss, user) : null;
    var admin = !!(u && isTrue_(u.admin) && !isTrue_(u.banned));

    if (d.action === "whoami") {
      return json_({ ok: true, admin: admin, trusted: !!(u && (isTrue_(u.trusted) || admin)), banned: !!(u && isTrue_(u.banned)) });
    }
    if (String(d.action || "").indexOf("admin_") === 0) {
      if (!admin) return json_({ ok: false, error: "Admins only." });
      return json_(adminAction_(ss, d));
    }

    if (u && isTrue_(u.banned)) return json_({ ok: false, error: "This account can't post. Contact the admin if you think this is a mistake." });
    var trusted = u && (isTrue_(u.trusted) || admin);
    if (u && !trusted && postsToday_(ss, user.email) >= DAILY_LIMIT) return json_({ ok: false, error: "Daily limit reached (" + DAILY_LIMIT + " posts). Try again tomorrow." });

    var lat = Number(d.lat), lng = Number(d.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return json_({ ok: false, error: "Pick a location on the map." });

    var now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    var by = user ? user.email : "";
    var DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    var name, label, rec;

    if (d.kind === "meet") {
      if (!clean_(d.title) || !DT.test(d.start || "")) return json_({ ok: false, error: "Meet name and start time are required." });
      name = "Meets"; label = clean_(d.title, 80);
      rec = { submitted_at: now, approved: !!trusted, id: uniqueId_(ss, name, slug_(d.title) + "-" + d.start.slice(0, 10)),
        title: label, type: ["meet", "cruise", "show", "track"].indexOf(d.type) > -1 ? d.type : "meet",
        host: clean_(d.host, 40), start: d.start, end: DT.test(d.end || "") ? d.end : "", place: clean_(d.place, 120),
        lat: round_(lat), lng: round_(lng), details: clean_(d.details, 500), link: url_(d.link), contact: clean_(d.contact, 120), submitted_by: by };
    } else if (d.kind === "crew") {
      if (!clean_(d.name)) return json_({ ok: false, error: "Crew name is required." });
      name = "Crews"; label = clean_(d.name, 60);
      rec = { submitted_at: now, approved: !!trusted, id: uniqueId_(ss, name, slug_(d.name)), name: label, area: clean_(d.area, 80),
        color: /^#[0-9a-f]{6}$/i.test(d.color || "") ? d.color : "#ff3b3b", radius_km: Math.min(30, Math.max(0.5, Number(d.radius) || 3)),
        lat: round_(lat), lng: round_(lng), logo: url_(d.logo) || (/^club_logos\/[\w.\-]+$/.test(d.logo || "") ? d.logo : ""),
        link: url_(d.link), tags: clean_(d.tags, 80), contact: clean_(d.contact, 120), submitted_by: by };
    } else {
      return json_({ ok: false, error: "Unknown submission type." });
    }

    var sh = ss.getSheetByName(name);
    if (!sh) { setup(); sh = ss.getSheetByName(name); }
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.appendRow(head.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ""; }));
    var rn = sh.getLastRow(), ac = head.indexOf("approved") + 1;
    if (ac > 0) { sh.getRange(rn, ac).insertCheckboxes(); if (trusted) sh.getRange(rn, ac).setValue(true); }
    if (u) bumpPosts_(ss, user.sub);
    if (trusted) CacheService.getScriptCache().remove("public");
    else notify_(ss, name, label, by);
    return json_({ ok: true, live: !!trusted });
  } catch (err) {
    return json_({ ok: false, error: "Server error, try again." });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Google sign-in check ---------- */
function verifyGoogle_(token) {
  if (!token || typeof token !== "string" || token.length > 4096) return null;
  var cache = CacheService.getScriptCache();
  var key = "tok:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var t = JSON.parse(res.getContentText());
  var now = Math.floor(Date.now() / 1000);
  if (t.aud !== GOOGLE_CLIENT_ID) return null;
  if (t.iss !== "accounts.google.com" && t.iss !== "https://accounts.google.com") return null;
  if (String(t.email_verified) !== "true" || Number(t.exp) < now) return null;
  var user = { sub: String(t.sub), email: String(t.email).toLowerCase(), name: String(t.name || "") };
  cache.put(key, JSON.stringify(user), Math.max(1, Math.min(600, Number(t.exp) - now)));
  return user;
}

/* ---------- users ---------- */
function upsertUser_(ss, user) {
  var sh = ss.getSheetByName("Users");
  if (!sh) { setup(); sh = ss.getSheetByName("Users"); }
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
  var all = rows_(ss, "Users");
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].user_id) === user.sub) {
      sh.getRange(all[i]._row, head.indexOf("last_seen") + 1).setValue(now);
      return all[i];
    }
  }
  var rec = { user_id: user.sub, email: user.email, name: user.name, first_seen: now, last_seen: now, posts: 0, trusted: false, banned: false, admin: false, notes: "" };
  sh.appendRow(head.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ""; }));
  var rn = sh.getLastRow();
  ["trusted", "banned", "admin"].forEach(function (c) { var ci = head.indexOf(c) + 1; if (ci > 0) sh.getRange(rn, ci).insertCheckboxes(); });
  return rec;
}
function bumpPosts_(ss, sub) {
  var sh = ss.getSheetByName("Users");
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  rows_(ss, "Users").forEach(function (u) {
    if (String(u.user_id) === sub) sh.getRange(u._row, head.indexOf("posts") + 1).setValue((Number(u.posts) || 0) + 1);
  });
}
function postsToday_(ss, email) {
  var since = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, "yyyy-MM-dd HH:mm");
  var n = 0;
  ["Meets", "Crews"].forEach(function (name) {
    rows_(ss, name).forEach(function (o) {
      var at = o.submitted_at instanceof Date ? Utilities.formatDate(o.submitted_at, TZ, "yyyy-MM-dd HH:mm") : String(o.submitted_at);
      if (String(o.submitted_by).toLowerCase() === email && at >= since) n++;
    });
  });
  return n;
}
function mine_(ss, email) {
  var out = [];
  [["Meets", "meet", "title"], ["Crews", "crew", "name"]].forEach(function (x) {
    rows_(ss, x[0]).forEach(function (o) {
      if (String(o.submitted_by).toLowerCase() !== email) return;
      var at = o.submitted_at instanceof Date ? Utilities.formatDate(o.submitted_at, TZ, "yyyy-MM-dd HH:mm") : String(o.submitted_at);
      out.push({ kind: x[1], id: String(o.id), label: String(o[x[2]]), approved: isTrue_(o.approved) && !isTrue_(o.archived), archived: isTrue_(o.archived), submitted_at: at });
    });
  });
  return out.sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; }).slice(0, 50);
}


/* ---------- admin ---------- */
function adminAction_(ss, d) {
  if (d.action === "admin_list") {
    var items = [];
    [["Meets", "meet", "title", "place"], ["Crews", "crew", "name", "area"]].forEach(function (x) {
      rows_(ss, x[0]).forEach(function (o) {
        var at = o.submitted_at instanceof Date ? Utilities.formatDate(o.submitted_at, TZ, "yyyy-MM-dd HH:mm") : String(o.submitted_at);
        var st = o.start instanceof Date ? Utilities.formatDate(o.start, TZ, "yyyy-MM-dd'T'HH:mm") : String(o.start || "");
        var en = o.end instanceof Date ? Utilities.formatDate(o.end, TZ, "yyyy-MM-dd'T'HH:mm") : String(o.end || "");
        items.push({ kind: x[1], id: String(o.id), label: String(o[x[2]]), where: String(o[x[3]] || ""), start: st, end: en,
          type: String(o.type || ""), host: String(o.host || ""), details: String(o.details || ""), link: String(o.link || ""),
          by: String(o.submitted_by || ""), submitted_at: at, lat: o.lat, lng: o.lng,
          status: isTrue_(o.archived) ? "archived" : isTrue_(o.approved) ? "live" : "pending" });
      });
    });
    items.sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; });
    return { ok: true, items: items };
  }
  var name = d.kind === "meet" ? "Meets" : d.kind === "crew" ? "Crews" : "";
  if (!name) return { ok: false, error: "Unknown type." };
  var sh = ss.getSheetByName(name);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var row = null;
  rows_(ss, name).forEach(function (o) { if (String(o.id) === String(d.id)) row = o; });
  if (!row) return { ok: false, error: "Not found (it may only exist in the site's data files)." };
  var ac = head.indexOf("approved") + 1, xc = head.indexOf("archived") + 1;
  function setBox(col, val) { if (col > 0) { var r = sh.getRange(row._row, col); r.insertCheckboxes(); r.setValue(val); } }
  if (d.action === "admin_approve") { setBox(ac, true); setBox(xc, false); }
  else if (d.action === "admin_archive") { setBox(xc, true); }
  else if (d.action === "admin_restore") { setBox(xc, false); setBox(ac, true); }
  else if (d.action === "admin_delete") { sh.deleteRow(row._row); }
  else if (d.action === "admin_update") {
    if (name !== "Meets") return { ok: false, error: "Only meets can be edited for now." };
    var DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    var lat = Number(d.lat), lng = Number(d.lng);
    if (!clean_(d.title) || !DT.test(d.start || "")) return { ok: false, error: "Meet name and start time are required." };
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: "Pick a location on the map." };
    var upd = { title: clean_(d.title, 80), type: ["meet", "cruise", "show", "track"].indexOf(d.type) > -1 ? d.type : "meet",
      host: clean_(d.host, 40), start: d.start, end: DT.test(d.end || "") ? d.end : "", place: clean_(d.place, 120),
      lat: round_(lat), lng: round_(lng), details: clean_(d.details, 500), link: url_(d.link) };
    Object.keys(upd).forEach(function (k) { var ci = head.indexOf(k) + 1; if (ci > 0) sh.getRange(row._row, ci).setValue(upd[k]); });
  }
  else return { ok: false, error: "Unknown action." };
  CacheService.getScriptCache().remove("public");
  return { ok: true };
}

/* ---------- one-time: copy the original crews into the Sheet (run from the editor) ---------- */
function seedCrews() {
  setup();
  var crews = [
    ["dts", "Downtown Society", "Capas, Tarlac", "#ff3b3b", 4, 15.3358, 120.58935, "club_logos/dts.jpg", "https://www.facebook.com/profile.php?id=61567140809882", ""],
    ["noinvite", "No Invite", "Tarlac City", "#a855f7", 4.5, 15.4847, 120.5861, "club_logos/noinvite.jpg", "https://www.facebook.com/Team.NoInvte", ""],
    ["hotcakes", "Hotcakes", "Pampanga", "#ffb020", 2.5, 15.182224, 120.574117, "club_logos/hotcakes.jpg", "https://www.facebook.com/profile.php?id=61577142807450", ""],
    ["sbc", "Sarapbuhaycrew", "Pampanga", "#22d3ee", 2.5, 15.1764068, 120.5206831, "club_logos/sbc.jpg", "https://www.facebook.com/sarapbuhaycrew", ""],
    ["juiced", "juiced", "Manila", "#39ff88", 3.5, 14.5995, 120.9842, "club_logos/juiced.jpg", "https://www.facebook.com/profile.php?id=61555461780515", ""],
    ["stancepilipinas", "Stance Pilipinas", "Manila", "#ff4fd8", 3.5, 14.5995, 120.9842, "club_logos/spmf.jpg", "https://www.facebook.com/stancepilipinas", "Stance"]
  ];
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName("Crews");
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var have = rows_(ss, "Crews").map(function (o) { return String(o.id); });
  var now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
  crews.forEach(function (c) {
    if (have.indexOf(c[0]) > -1) return;
    var rec = { submitted_at: now, approved: true, archived: false, id: c[0], name: c[1], area: c[2], color: c[3], radius_km: c[4], lat: c[5], lng: c[6], logo: c[7], link: c[8], tags: c[9], contact: "", submitted_by: "admin" };
    sh.appendRow(head.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ""; }));
    var rn = sh.getLastRow();
    ["approved", "archived"].forEach(function (k) { var ci = head.indexOf(k) + 1; if (ci > 0) { sh.getRange(rn, ci).insertCheckboxes(); sh.getRange(rn, ci).setValue(rec[k]); } });
  });
  CacheService.getScriptCache().remove("public");
}

/* ---------- helpers ---------- */
function rows_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = values.shift().map(String);
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { if (h) o[h] = r[j]; });
    return o;
  });
}
function isTrue_(v) { return v === true || /^(true|yes|y|1|✓)$/i.test(String(v).trim()); }
function json_(obj, isString) {
  return ContentService.createTextOutput(isString ? obj : JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().replace(/^[=+\-@]+/, "").trim().slice(0, max || 200); }
function url_(s) { s = String(s || "").trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 300) : ""; }
function round_(n) { return Math.round(n * 1e6) / 1e6; }
function slug_(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "entry"; }
function uniqueId_(ss, name, base) {
  var ids = rows_(ss, name).map(function (o) { return String(o.id); });
  var id = base, n = 2;
  while (ids.indexOf(id) > -1) id = base + "-" + n++;
  return id;
}
function notify_(ss, name, label, by) {
  if (NOTIFY_EMAIL === "off") return;
  try {
    var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, "Street Archive: new " + (name === "Meets" ? "meet" : "crew") + " — " + label,
      "\"" + label + "\" was submitted" + (by ? " by " + by : "") + ".\n\nTick 'approved' to publish it:\n" + ss.getUrl() +
      "\n\nSpam? Tick 'banned' for that account in the Users tab.");
  } catch (e) {}
}
