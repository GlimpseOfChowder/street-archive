/* =====================================================================
   STREET ARCHIVE — Supabase backend
   ---------------------------------------------------------------------
   Everything the site needs from the database goes through SA_BACKEND.
   Settings come from js/config.js (supabaseUrl, supabaseKey).
   Security is enforced by the database itself (Row Level Security +
   triggers in supabase/schema.sql) — this file only asks politely.
   ===================================================================== */
(function () {
  "use strict";
  var CFG = window.SA_CONFIG || {};
  var URL_ = (CFG.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = CFG.supabaseKey || "";
  var TZ = "Asia/Manila";

  if (!URL_ || !KEY || !window.supabase || !window.supabase.createClient) {
    window.SA_BACKEND = null; // site runs on the built-in data files only
    return;
  }

  var sb = window.supabase.createClient(URL_, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "sa-auth" }
  });

  /* ---------- helpers ---------- */
  var session = null;
  var ready = sb.auth.getSession().then(function (r) { session = r.data.session; return session; })
    .catch(function () { session = null; return null; });
  var listeners = [];
  sb.auth.onAuthStateChange(function (_event, s) {
    session = s;
    listeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  });

  // "2026-12-12T13:00:00+00:00" -> "2026-12-12T21:00" (Manila wall time, what the site uses)
  var fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  function toLocal(iso) {
    if (!iso) return "";
    var p = {}; fmt.formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  // "2026-12-12T21:00" (Manila) -> "2026-12-12T21:00:00+08:00"
  function fromLocal(s) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s || "") ? s + ":00+08:00" : null; }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "entry"; }
  function url(s) { s = String(s || "").trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 300) : ""; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 200); }
  function tagList(s) { return (Array.isArray(s) ? s : String(s || "").split(",")).map(function (t) { return clean(t, 30); }).filter(Boolean).slice(0, 25); }
  function friendly(err) {
    var m = (err && (err.message || err.details)) || "Something went wrong.";
    if (/violates check constraint/i.test(m)) return "Some details aren't valid — check the name, times and location.";
    if (/JWT|not authenticated|permission denied/i.test(m)) return "Please sign in again.";
    return m;
  }
  function uid() { return session && session.user ? session.user.id : null; }
  function table(kind) { return { meet: "meets", crew: "crews", place: "places" }[kind]; }

  /* ---------- reading the map (public data; crew-only meets appear for members) ---------- */
  function load() {
    return ready.then(function () {
      return Promise.all([
        sb.from("crews").select("id,name,area,color,radius_km,lat,lng,logo_url,link,tags").eq("status", "live"),
        sb.from("meets").select("id,title,type,host_crew,visibility,start_at,end_at,place,lat,lng,details,link").eq("status", "live"),
        sb.from("places").select("id,name,category,tags,area,lat,lng,phone,hours,link,details").eq("status", "live")
      ]);
    }).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      return {
        crews: res[0].data.map(function (c) {
          return { id: c.id, name: c.name, area: c.area, color: c.color, radius_km: c.radius_km, lat: c.lat, lng: c.lng,
                   logo: c.logo_url, link: c.link, tags: (c.tags || []).join(", ") };
        }),
        events: res[1].data.map(function (m) {
          return { id: m.id, title: m.title, type: m.type, host: m.host_crew || "", visibility: m.visibility,
                   start: toLocal(m.start_at), end: toLocal(m.end_at), place: m.place, lat: m.lat, lng: m.lng,
                   details: m.details, link: m.link };
        }),
        places: res[2].data.map(function (p) {
          return { id: p.id, name: p.name, category: p.category, tags: (p.tags || []).join(", "), area: p.area,
                   lat: p.lat, lng: p.lng, phone: p.phone, hours: p.hours, link: p.link, details: p.details };
        })
      };
    });
  }

  /* ---------- writing ---------- */
  function insertWithUniqueId(tbl, row, base) {
    var n = 1;
    function attempt() {
      row.id = n === 1 ? base : (base + "-" + n).slice(0, 80);
      return sb.from(tbl).insert(row).select("status").single().then(function (r) {
        if (r.error && r.error.code === "23505" && n < 20) { n++; return attempt(); } // id taken
        if (r.error) throw r.error;
        return r.data;
      });
    }
    return attempt();
  }

  // Turns form fields into a database row (shared by "submit" and "update").
  function buildRow(d) {
    var lat = Number(d.lat), lng = Number(d.lng);
    if (!isFinite(lat) || !isFinite(lng)) return { error: "Pick a location on the map." };
    var row, base;
    if (d.kind === "meet") {
      var start = fromLocal(d.start);
      if (!clean(d.title) || !start) return { error: "Meet name and start time are required." };
      row = { title: clean(d.title, 80), type: d.type || "meet", host_crew: d.host || null,
              start_at: start, end_at: fromLocal(d.end), place: clean(d.place, 120),
              lat: lat, lng: lng, details: clean(d.details, 500), link: url(d.link) };
      if (d.visibility != null) row.visibility = d.visibility === "crew" ? "crew" : "public";
      base = (slug(d.title) + "-" + d.start.slice(0, 10)).slice(0, 70);
    } else if (d.kind === "crew") {
      if (!clean(d.name)) return { error: "Crew name is required." };
      row = { name: clean(d.name, 60), area: clean(d.area, 80),
              color: /^#[0-9a-f]{6}$/i.test(d.color || "") ? d.color : "#ff3b3b",
              radius_km: Math.min(30, Math.max(0.5, Number(d.radius) || 3)), lat: lat, lng: lng,
              logo_url: url(d.logo) || (/^club_logos\/[\w.\-]+$/.test(d.logo || "") ? d.logo : ""),
              link: url(d.link), tags: tagList(d.tags) };
      base = slug(d.name);
    } else if (d.kind === "place") {
      if (!clean(d.name)) return { error: "Shop name is required." };
      row = { name: clean(d.name, 60), category: d.category || "mechanic", tags: tagList(d.tags), area: clean(d.area, 80),
              lat: lat, lng: lng, phone: clean(d.phone, 40).replace(/[^\d+\-() ]/g, ""), hours: clean(d.hours, 80),
              link: url(d.link), details: clean(d.details, 500) };
      base = slug(d.name);
    } else return { error: "Unknown submission type." };
    return { row: row, base: base };
  }

  function submit(d) {
    var b = buildRow(d);
    if (b.error) return Promise.resolve({ ok: false, error: b.error });
    if (d.kind === "meet" && b.row.visibility == null) b.row.visibility = "public";
    return insertWithUniqueId(table(d.kind), b.row, b.base).then(function (r) { return { ok: true, live: r.status === "live" }; });
  }

  // Edit an existing post. The database only lets the poster or an admin do this.
  function update(d) {
    var tbl = table(d.kind);
    if (!tbl) return Promise.resolve({ ok: false, error: "Unknown type." });
    var b = buildRow(d);
    if (b.error) return Promise.resolve({ ok: false, error: b.error });
    return sb.from(tbl).update(b.row).eq("id", d.id).select("id").then(expectOne);
  }
  function remove(d) {
    var tbl = table(d.kind);
    if (!tbl) return Promise.resolve({ ok: false, error: "Unknown type." });
    return sb.from(tbl).delete().eq("id", d.id).select("id").then(expectOne);
  }

  // One post, shaped for the edit form.
  function get(d) {
    var tbl = table(d.kind);
    if (!tbl) return Promise.resolve({ ok: false, error: "Unknown type." });
    return sb.from(tbl).select("*").eq("id", d.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var x = r.data;
      if (!x) return { ok: false, error: "Not found, or you can't edit it." };
      var it = { kind: d.kind, id: x.id, status: x.status, coords: [x.lat, x.lng] };
      if (d.kind === "meet") {
        it.title = x.title; it.type = x.type; it.host = x.host_crew || ""; it.visibility = x.visibility;
        it.start = toLocal(x.start_at); it.end = toLocal(x.end_at); it.place = x.place; it.details = x.details; it.link = x.link;
      } else if (d.kind === "crew") {
        it.name = x.name; it.area = x.area; it.color = x.color; it.radius = x.radius_km; it.logo = x.logo_url;
        it.link = x.link; it.tags = (x.tags || []).join(", ");
      } else {
        it.name = x.name; it.category = x.category; it.area = x.area; it.tags = x.tags || []; it.hours = x.hours;
        it.phone = x.phone; it.link = x.link; it.details = x.details;
      }
      return { ok: true, item: it };
    });
  }

  function mine() {
    var me = uid();
    var q = function (tbl, label, kind) {
      return sb.from(tbl).select("id," + label + ",status,created_at").eq("created_by", me).then(function (r) {
        if (r.error) throw r.error;
        return r.data.map(function (x) {
          return { kind: kind, id: x.id, label: x[label], approved: x.status === "live", archived: x.status === "archived", submitted_at: x.created_at };
        });
      });
    };
    return Promise.all([q("meets", "title", "meet"), q("crews", "name", "crew"), q("places", "name", "place")]).then(function (a) {
      var items = a[0].concat(a[1], a[2]).sort(function (x, y) { return x.submitted_at < y.submitted_at ? 1 : -1; }).slice(0, 50);
      return { ok: true, items: items };
    });
  }

  function whoami() {
    return sb.from("profiles").select("is_admin,is_trusted,is_banned").eq("id", uid()).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var p = r.data || {};
      return { ok: true, admin: !!p.is_admin && !p.is_banned, trusted: !!(p.is_trusted || p.is_admin) && !p.is_banned, banned: !!p.is_banned };
    });
  }

  /* ---------- admin ---------- */
  function adminList() {
    var cols = {
      meets: "id,title,type,host_crew,start_at,end_at,place,lat,lng,details,link,status,created_at,edited_at,author:created_by(display_name)",
      crews: "id,name,area,lat,lng,tags,status,created_at,edited_at,author:created_by(display_name)",
      places: "id,name,category,area,tags,lat,lng,status,created_at,edited_at,author:created_by(display_name)"
    };
    return Promise.all(Object.keys(cols).map(function (t) { return sb.from(t).select(cols[t]).order("created_at", { ascending: false }); }))
      .then(function (res) {
        res.forEach(function (r) { if (r.error) throw r.error; });
        var by = function (x) { return x.author && x.author.display_name ? x.author.display_name : "admin import"; };
        var at = function (x) { return toLocal(x.created_at).replace("T", " "); };
        var ed = function (x) { return x.edited_at ? toLocal(x.edited_at).replace("T", " ") : ""; };
        var items = []
          .concat(res[0].data.map(function (m) { return { kind: "meet", id: m.id, label: m.title, where: m.place, start: toLocal(m.start_at), end: toLocal(m.end_at),
            type: m.type, host: m.host_crew || "", details: m.details, link: m.link, by: by(m), submitted_at: at(m), lat: m.lat, lng: m.lng, status: m.status, edited: ed(m) }; }))
          .concat(res[1].data.map(function (c) { return { kind: "crew", id: c.id, label: c.name, where: c.area, start: "", tags: (c.tags || []).join(", "),
            by: by(c), submitted_at: at(c), lat: c.lat, lng: c.lng, status: c.status, edited: ed(c) }; }))
          .concat(res[2].data.map(function (p) { return { kind: "place", id: p.id, label: p.name, where: p.area, start: "", type: p.category, tags: (p.tags || []).join(", "),
            by: by(p), submitted_at: at(p), lat: p.lat, lng: p.lng, status: p.status, edited: ed(p) }; }));
        items.sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; });
        return { ok: true, items: items };
      });
  }
  function expectOne(r) {
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) return { ok: false, error: "Not allowed, or it no longer exists." };
    return { ok: true };
  }
  function adminAction(d) {
    var tbl = table(d.kind);
    if (!tbl) return Promise.resolve({ ok: false, error: "Unknown type." });
    if (d.action === "admin_delete") return remove(d);
    if (d.action === "admin_update") return update(d);
    if (d.action === "admin_reviewed") return sb.from(tbl).update({ edited_at: null }).eq("id", d.id).select("id").then(expectOne);
    var status = { admin_approve: "live", admin_archive: "archived", admin_restore: "live" }[d.action];
    if (status) {
      var patch = { status: status };
      if (status === "live") patch.edited_at = null;  // approving = the admin has seen the latest version
      return sb.from(tbl).update(patch).eq("id", d.id).select("id").then(expectOne);
    }
    return Promise.resolve({ ok: false, error: "Unknown action." });
  }

  /* ---------- one entry point, same answers the old Sheet backend gave ---------- */
  function call(d) {
    return ready.then(function () {
      if (!uid()) return { ok: false, auth: true, error: "Please sign in." };
      if (d.action === "whoami") return whoami();
      if (d.action === "mine") return mine();
      if (d.action === "submit") return submit(d);
      if (d.action === "get") return get(d);
      if (d.action === "update") return update(d);
      if (d.action === "delete") return remove(d);
      if (d.action === "admin_list") return adminList();
      if (String(d.action || "").indexOf("admin_") === 0) return adminAction(d);
      return { ok: false, error: "Unknown action." };
    }).catch(function (e) { return { ok: false, error: friendly(e) }; });
  }

  /* ---------- Google sign-in (Google button -> Supabase session) ---------- */
  var rawNonce = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  var hashedNonce = crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)).then(function (buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  });
  function signInWithGoogle(idToken) {
    return sb.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce }).then(function (r) {
      if (r.error) throw r.error;
      session = r.data.session;
      return user();
    });
  }
  function signOut() { return sb.auth.signOut().then(function () { session = null; }); }
  function user() {
    if (!session || !session.user) return null;
    var u = session.user, md = u.user_metadata || {};
    return { id: u.id, email: u.email || md.email || "", name: md.full_name || md.name || u.email || "", picture: md.avatar_url || md.picture || "" };
  }

  window.SA_BACKEND = {
    ready: ready,
    load: load,
    call: call,
    user: user,
    isSignedIn: function () { return !!(session && session.user); },
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    googleNonce: function () { return hashedNonce; },
    onAuthChange: function (fn) { listeners.push(fn); },
    icsUrl: function (id) { return URL_ + "/functions/v1/ics?id=" + encodeURIComponent(id); }
  };
})();
