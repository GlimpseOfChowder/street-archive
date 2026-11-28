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
    if (/reports_pkey/.test(m)) return "You already reported this — thanks!";
    return m;
  }
  function uid() { return session && session.user ? session.user.id : null; }
  function table(kind) { return { meet: "meets", crew: "crews", place: "places" }[kind]; }

  /* ---------- reading the map (public data; crew-only meets appear for members) ---------- */
  function load() {
    return ready.then(function () {
      return Promise.all([
        sb.from("crews").select("id,name,area,color,radius_km,lat,lng,logo_url,link,tags,verified").eq("status", "live"),
        sb.from("meets").select("id,title,type,host_crew,visibility,start_at,end_at,place,lat,lng,details,link,created_by,author:created_by(display_name)").eq("status", "live"),
        sb.from("places").select("id,name,category,tags,area,lat,lng,phone,hours,link,details").eq("status", "live"),
        sb.rpc("rsvp_counts"),
        sb.from("crew_turfs").select("id,crew_id,area,lat,lng,radius_km")
      ]);
    }).then(function (res) {
      res.slice(0, 3).forEach(function (r) { if (r.error) throw r.error; });
      var going = {};
      if (!res[3].error) (res[3].data || []).forEach(function (x) { going[x.meet_id] = Number(x.n) || 0; });
      return {
        going: going,
        turfs: res[4] && !res[4].error ? res[4].data : [],
        crews: res[0].data.map(function (c) {
          return { id: c.id, name: c.name, area: c.area, color: c.color, radius_km: c.radius_km, lat: c.lat, lng: c.lng,
                   logo: c.logo_url, link: c.link, tags: (c.tags || []).join(", "), verified: !!c.verified };
        }),
        events: res[1].data.map(function (m) {
          return { id: m.id, title: m.title, type: m.type, host: m.host_crew || "", visibility: m.visibility,
                   start: toLocal(m.start_at), end: toLocal(m.end_at), place: m.place, lat: m.lat, lng: m.lng,
                   details: m.details, link: m.link, by_id: m.created_by || "", by: m.author && m.author.display_name ? m.author.display_name : "" };
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
          return { kind: kind, id: x.id, label: x[label], approved: x.status === "live", archived: x.status === "archived",
                   flagged: x.status === "flagged", submitted_at: x.created_at };
        });
      });
    };
    return Promise.all([q("meets", "title", "meet"), q("crews", "name", "crew"), q("places", "name", "place")]).then(function (a) {
      var items = a[0].concat(a[1], a[2]).sort(function (x, y) { return x.submitted_at < y.submitted_at ? 1 : -1; }).slice(0, 50);
      return { ok: true, items: items };
    });
  }

  // Anyone signed in can report a live post; 3 reports hide it until the admin decides.
  function report(d) {
    if (!table(d.kind)) return Promise.resolve({ ok: false, error: "Unknown type." });
    return sb.from("reports").insert({ kind: d.kind, item_id: d.id, reason: clean(d.reason, 200) }).then(function (r) {
      if (r.error) throw r.error;
      return { ok: true };
    });
  }

  /* ---------- profiles & My Garage ---------- */
  function profile(d) {
    var id = d.user_id || uid(), me = id === uid();
    var qs = [
      sb.from("profiles").select("id,display_name,avatar_url,bio,link,created_at,is_admin").eq("id", id).maybeSingle(),
      sb.rpc("profile_stats", { uid: id }),
      sb.from("crew_members").select("crew_id,role,status,crew:crew_id(name,logo_url,color,verified,status)").eq("user_id", id).eq("status", "active"),
      sb.from("cars").select("*").eq("owner", id).order("created_at"),
      sb.from("meets").select("id,title,start_at,visibility").eq("created_by", id).eq("status", "live").gte("start_at", new Date(Date.now() - 12 * 36e5).toISOString()).order("start_at").limit(10)
    ];
    if (me) qs.push(sb.from("rsvps").select("meet_id,meet:meet_id(title,start_at,status)").eq("user_id", id));
    return Promise.all(qs).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      var p = res[0].data;
      if (!p) return { ok: false, error: "This profile doesn't exist anymore." };
      var st = (res[1].data && res[1].data[0]) || {};
      return { ok: true, me: me, profile: {
          id: p.id, name: p.display_name, avatar: p.avatar_url, bio: p.bio, link: p.link, joined: p.created_at, admin: !!p.is_admin },
        stats: { posted: +st.meets_posted || 0, attended: +st.meets_attended || 0, cars: +st.cars || 0, led: +st.crews_led || 0 },
        crews: res[2].data.filter(function (x) { return x.crew && x.crew.status === "live"; }).map(function (x) {
          return { id: x.crew_id, role: x.role, name: x.crew.name, logo: x.crew.logo_url, color: x.crew.color, verified: !!x.crew.verified }; }),
        cars: res[3].data,
        meets: res[4].data.map(function (m) { return { id: m.id, title: m.title, start: toLocal(m.start_at), visibility: m.visibility }; }),
        going: me ? res[5].data.filter(function (x) { return x.meet && x.meet.status === "live" && new Date(x.meet.start_at) > Date.now() - 12 * 36e5; })
          .map(function (x) { return { id: x.meet_id, title: x.meet.title, start: toLocal(x.meet.start_at) }; })
          .sort(function (a, b) { return a.start < b.start ? -1 : 1; }) : [] };
    });
  }
  function multiline(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max); }
  function socialLink(s) {
    s = String(s || "").trim();
    if (/^@[\w.]{1,40}$/.test(s)) return "https://instagram.com/" + s.slice(1);   // "@handle" = Instagram
    if (s && !/^https?:/i.test(s) && /^[\w.-]+\.[a-z]{2,}\//i.test(s)) s = "https://" + s;
    return url(s);
  }
  function avatarPath(u) { var m = /\/object\/public\/avatars\/(.+)$/.exec(u || ""); return m ? m[1] : ""; }
  function saveProfile(d) {
    var row = { display_name: clean(d.name, 40), bio: multiline(d.bio, 300), link: socialLink(d.link) };
    if (!row.display_name) return Promise.resolve({ ok: false, error: "Your name can't be empty." });
    if (d.avatar !== undefined) row.avatar_url = d.avatar || "";
    return sb.from("profiles").update(row).eq("id", uid()).select("id").then(function (r) {
      var res = expectOne(r);
      // tidy up: remove the previous uploaded photo when it was replaced
      if (res.ok && d.avatar !== undefined && d.old_avatar && d.old_avatar !== row.avatar_url && avatarPath(d.old_avatar))
        sb.storage.from("avatars").remove([avatarPath(d.old_avatar)]);
      return res;
    });
  }
  function uploadAvatar(d) {
    var path = uid() + "/" + Date.now().toString(36) + ".jpg";
    return sb.storage.from("avatars").upload(path, d.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      return { ok: true, url: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl };
    });
  }
  // Crew logos live in the uploader's own folder of the "avatars" bucket.
  function uploadLogo(d) {
    var path = uid() + "/crew-" + Date.now().toString(36) + ".jpg";
    return sb.storage.from("avatars").upload(path, d.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      return { ok: true, url: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl };
    });
  }
  // Phone notifications: remember / forget this device for the signed-in person.
  function pushSave(d) {
    return sb.rpc("save_push_sub", { p_endpoint: d.endpoint, p_p256dh: d.p256dh, p_auth: d.auth }).then(function (r) {
      if (r.error) throw r.error; return { ok: true };
    });
  }
  function pushRemove(d) {
    return sb.rpc("remove_push_sub", { p_endpoint: d.endpoint }).then(function (r) {
      if (r.error) throw r.error; return { ok: true };
    });
  }
  // Your name + photo as saved in your profile (may differ from Google's).
  function myBasics() {
    return sb.from("profiles").select("display_name,avatar_url").eq("id", uid()).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      return { ok: true, name: r.data ? r.data.display_name : "", avatar: r.data ? r.data.avatar_url : "" };
    });
  }
  function uploadCarPhoto(d) {
    var path = uid() + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".jpg";
    return sb.storage.from("cars").upload(path, d.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      return { ok: true, url: sb.storage.from("cars").getPublicUrl(path).data.publicUrl };
    });
  }
  function photoPath(u) { var m = /\/object\/public\/cars\/(.+)$/.exec(u || ""); return m ? m[1] : ""; }
  function saveCar(d) {
    var y = parseInt(d.year, 10);
    var row = { year: y >= 1950 && y <= 2030 ? y : null, make: clean(d.make, 40), model: clean(d.model, 60), nickname: clean(d.nickname, 40),
                kind: ["daily", "project", "track", "show", "other"].indexOf(d.kind) > -1 ? d.kind : "daily", mods: multiline(d.mods, 500), photo_url: d.photo_url || "" };
    if (!row.make) return Promise.resolve({ ok: false, error: "Add the make (e.g. Honda)." });
    var q = d.id ? sb.from("cars").update(row).eq("id", d.id) : sb.from("cars").insert(row);
    return q.select("id").then(function (r) {
      var res = expectOne(r);
      if (res.ok && d.old_photo && d.old_photo !== row.photo_url && photoPath(d.old_photo)) sb.storage.from("cars").remove([photoPath(d.old_photo)]);
      return res;
    });
  }
  function deleteCar(d) {
    return sb.from("cars").delete().eq("id", d.id).select("id,photo_url").then(function (r) {
      var res = expectOne(r);
      if (res.ok && r.data[0].photo_url && photoPath(r.data[0].photo_url)) sb.storage.from("cars").remove([photoPath(r.data[0].photo_url)]);
      return res;
    });
  }
  /* ---------- "Pulling up" ---------- */
  function myRsvps() {
    return sb.from("rsvps").select("meet_id,car_id").eq("user_id", uid()).then(function (r) {
      if (r.error) throw r.error;
      var m = {}; r.data.forEach(function (x) { m[x.meet_id] = x.car_id || ""; });
      return { ok: true, items: m };
    });
  }
  function rsvp(d) {
    return sb.from("rsvps").upsert({ meet_id: d.meet_id, user_id: uid(), car_id: d.car_id || null }, { onConflict: "meet_id,user_id" })
      .select("meet_id").then(expectOne);
  }
  function unrsvp(d) { return sb.from("rsvps").delete().eq("meet_id", d.meet_id).eq("user_id", uid()).select("meet_id").then(expectOne); }
  function going(d) {
    return ready.then(function () {
      return sb.from("rsvps").select("user_id,created_at,profile:user_id(display_name,avatar_url),car:car_id(year,make,model,nickname)")
        .eq("meet_id", d.meet_id).order("created_at").limit(100);
    }).then(function (r) {
      if (r.error) throw r.error;
      return { ok: true, items: r.data.map(function (x) {
        var c = x.car;
        return { user_id: x.user_id, name: (x.profile || {}).display_name || "Someone", avatar: (x.profile || {}).avatar_url || "",
                 car: c ? (c.nickname ? c.nickname + " · " : "") + [c.year, c.make, c.model].filter(Boolean).join(" ") : "" };
      }) };
    });
  }

  /* ---------- extra turf locations (crew owners / admins) ---------- */
  function saveTurf(d) {
    var lat = Number(d.lat), lng = Number(d.lng);
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve({ ok: false, error: "Pick the location on the map." });
    var row = { area: clean(d.area, 80), lat: lat, lng: lng, radius_km: Math.min(30, Math.max(0.5, Number(d.radius) || 3)) };
    var q = d.id ? sb.from("crew_turfs").update(row).eq("id", d.id) : sb.from("crew_turfs").insert(Object.assign({ crew_id: d.crew_id }, row));
    return q.select("id").then(expectOne);
  }
  function deleteTurf(d) { return sb.from("crew_turfs").delete().eq("id", d.id).select("id").then(expectOne); }

  /* ---------- feedback ---------- */
  // Works signed in or not; only the admin can read it back.
  function sendFeedback(d) {
    var msg = multiline(d.message, 1000);
    if (msg.length < 3) return Promise.resolve({ ok: false, error: "Tell us a little more." });
    return ready.then(function () {
      return sb.from("feedback").insert({ kind: ["bug", "idea", "other"].indexOf(d.kind) > -1 ? d.kind : "other", message: msg,
        contact: clean(d.contact, 200), page: clean(d.page, 300), device: clean(d.device, 300) });
    }).then(function (r) { if (r.error) throw r.error; return { ok: true }; })
      .catch(function (e) { return { ok: false, error: friendly(e) }; });
  }
  function feedbackList() {
    return sb.from("feedback").select("id,kind,message,contact,page,device,status,created_at,user_id,author:user_id(display_name)")
      .order("created_at", { ascending: false }).limit(200).then(function (r) {
        if (r.error) throw r.error;
        return { ok: true, items: r.data.map(function (x) {
          return { id: x.id, kind: x.kind, message: x.message, contact: x.contact, page: x.page, device: x.device, status: x.status,
                   at: toLocal(x.created_at).replace("T", " "), user_id: x.user_id || "", by: x.author && x.author.display_name ? x.author.display_name : "" };
        }) };
      });
  }
  function feedbackAction(d) {
    var q = sb.from("feedback");
    var r = d.act === "delete" ? q.delete().eq("id", d.id) : q.update({ status: d.act === "reopen" ? "new" : "done" }).eq("id", d.id);
    return r.select("id").then(expectOne);
  }

  /* ---------- crews: membership ---------- */
  // Your crews (any status) + how many join requests wait in crews you run.
  function myCrews() {
    var me = uid();
    return sb.from("crew_members").select("crew_id,role,status,crew:crew_id(name,logo_url,color,status)").eq("user_id", me).then(function (r) {
      if (r.error) throw r.error;
      var rows = r.data || [];
      var run = rows.filter(function (x) { return x.status === "active" && (x.role === "owner" || x.role === "admin"); }).map(function (x) { return x.crew_id; });
      var q = run.length
        ? sb.from("crew_members").select("crew_id").eq("status", "pending").in("crew_id", run)
        : Promise.resolve({ data: [] });
      return Promise.resolve(q).then(function (p) {
        if (p.error) throw p.error;
        var waiting = {};
        (p.data || []).forEach(function (x) { waiting[x.crew_id] = (waiting[x.crew_id] || 0) + 1; });
        return { ok: true, items: rows.map(function (x) {
          var c = x.crew || {};
          return { crew_id: x.crew_id, role: x.role, status: x.status, name: c.name || x.crew_id, logo: c.logo_url || "", color: c.color || "",
                   crew_status: c.status || "", requests: waiting[x.crew_id] || 0 };
        }) };
      });
    });
  }
  function joinCrew(d) {
    return sb.from("crew_members").insert({ crew_id: d.crew_id, user_id: uid() }).select("role,status").single().then(function (r) {
      if (r.error) { if (r.error.code === "23505") return { ok: false, error: "You already asked to join this crew." }; throw r.error; }
      return { ok: true, status: r.data.status, role: r.data.role };
    });
  }
  function leaveCrew(d) {
    return sb.from("crew_members").delete().eq("crew_id", d.crew_id).eq("user_id", uid()).select("crew_id").then(expectOne);
  }
  // Members + requests + this crew's meets (only crew admins / site admin see pending ones).
  function crewPanel(d) {
    return Promise.all([
      sb.from("crew_members").select("user_id,role,status,created_at,profile:user_id(display_name,avatar_url)").eq("crew_id", d.crew_id).order("created_at"),
      sb.from("meets").select("id,title,start_at,status,visibility,created_by,author:created_by(display_name)").eq("host_crew", d.crew_id).order("start_at", { ascending: false }).limit(30)
    ]).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      var ids = res[0].data.filter(function (m) { return m.status === "active"; }).map(function (m) { return m.user_id; });
      var carsQ = ids.length ? sb.from("cars").select("id,owner,year,make,model,nickname,kind,photo_url").in("owner", ids).order("created_at").limit(60) : Promise.resolve({ data: [] });
      return Promise.resolve(carsQ).then(function (cr) { if (cr.error) throw cr.error; return [res, cr.data || []]; });
    }).then(function (both) {
      var res = both[0], cars = both[1];
      return { ok: true, cars: cars,
        members: res[0].data.map(function (m) {
          var pr = m.profile || {};
          return { user_id: m.user_id, role: m.role, status: m.status, name: pr.display_name || "Member", avatar: pr.avatar_url || "", since: toLocal(m.created_at) };
        }),
        meets: res[1].data.map(function (m) {
          return { id: m.id, title: m.title, start: toLocal(m.start_at), status: m.status, visibility: m.visibility,
                   by: m.author && m.author.display_name ? m.author.display_name : "", mine: m.created_by === uid() };
        }) };
    });
  }
  // accept / decline / remove / promote / demote / make_owner (site admin)
  function memberAction(d) {
    var q = function () { return sb.from("crew_members"); };
    var one = function (b) { return b.eq("crew_id", d.crew_id).eq("user_id", d.user_id).select("user_id").then(expectOne); };
    if (d.act === "accept") return one(q().update({ status: "active" }));
    if (d.act === "decline" || d.act === "remove") return one(q().delete());
    if (d.act === "promote") return one(q().update({ role: "admin", status: "active" }));
    if (d.act === "demote") return one(q().update({ role: "member" }));
    if (d.act === "make_owner") {
      // one owner per crew: the current owner (if any) becomes an admin
      return q().update({ role: "admin" }).eq("crew_id", d.crew_id).eq("role", "owner").neq("user_id", d.user_id).then(function (r) {
        if (r.error) throw r.error;
        return one(q().update({ role: "owner", status: "active" }));
      });
    }
    return Promise.resolve({ ok: false, error: "Unknown action." });
  }
  // Site admin: every pending join request (mostly for crews without a leader yet).
  function joinRequests() {
    return sb.from("crew_members").select("crew_id,user_id,created_at,profile:user_id(display_name,avatar_url),crew:crew_id(name)")
      .eq("status", "pending").order("created_at").then(function (r) {
        if (r.error) throw r.error;
        return { ok: true, items: r.data.map(function (x) {
          return { crew_id: x.crew_id, crew: (x.crew || {}).name || x.crew_id, user_id: x.user_id,
                   name: (x.profile || {}).display_name || "Someone", avatar: (x.profile || {}).avatar_url || "", at: toLocal(x.created_at).replace("T", " ") };
        }) };
      });
  }
  // Public: how many active members each crew has (for popups).
  function memberCounts() {
    return ready.then(function () {
      return sb.from("crew_members").select("crew_id").eq("status", "active");
    }).then(function (r) {
      if (r.error) throw r.error;
      var n = {}; r.data.forEach(function (x) { n[x.crew_id] = (n[x.crew_id] || 0) + 1; });
      return n;
    });
  }

  // Site admin: how many things are waiting (head-only count queries — tiny).
  function adminCounts() {
    var c = function (tbl, col, val) { return sb.from(tbl).select(col === "status" && tbl === "crew_members" ? "crew_id" : "id", { count: "exact", head: true }).eq(col, val); };
    var qs = [c("meets", "status", "pending"), c("crews", "status", "pending"), c("places", "status", "pending"),
              c("meets", "status", "flagged"), c("crews", "status", "flagged"), c("places", "status", "flagged"),
              c("crew_members", "status", "pending"), sb.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new")];
    return Promise.all(qs).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      var n = res.map(function (r) { return r.count || 0; });
      return { ok: true, pending: n[0] + n[1] + n[2], reported: n[3] + n[4] + n[5], requests: n[6], feedback: n[7] };
    });
  }

  function whoami() {
    return sb.rpc("my_flags").then(function (r) {
      if (r.error) throw r.error;
      var p = (r.data && r.data[0]) || {};
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
    var qs = Object.keys(cols).map(function (t) { return sb.from(t).select(cols[t]).order("created_at", { ascending: false }); });
    qs.push(sb.from("reports").select("kind,item_id,reason,created_at"));
    return Promise.all(qs)
      .then(function (res) {
        res.forEach(function (r) { if (r.error) throw r.error; });
        var reps = {};
        res[3].data.forEach(function (r) { var k = r.kind + ":" + r.item_id; (reps[k] = reps[k] || []).push(r.reason || "no reason"); });
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
        items.forEach(function (i) { i.reports = reps[i.kind + ":" + i.id] || []; });
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
      if (d.action === "report") return report(d);
      if (d.action === "my_crews") return myCrews();
      if (d.action === "profile") return profile(d);
      if (d.action === "save_profile") return saveProfile(d);
      if (d.action === "upload_avatar") return uploadAvatar(d);
      if (d.action === "upload_logo") return uploadLogo(d);
      if (d.action === "push_save") return pushSave(d);
      if (d.action === "push_remove") return pushRemove(d);
      if (d.action === "my_basics") return myBasics();
      if (d.action === "upload_car_photo") return uploadCarPhoto(d);
      if (d.action === "save_car") return saveCar(d);
      if (d.action === "delete_car") return deleteCar(d);
      if (d.action === "my_rsvps") return myRsvps();
      if (d.action === "rsvp") return rsvp(d);
      if (d.action === "unrsvp") return unrsvp(d);
      if (d.action === "join_crew") return joinCrew(d);
      if (d.action === "leave_crew") return leaveCrew(d);
      if (d.action === "crew_panel") return crewPanel(d);
      if (d.action === "member") return memberAction(d);
      if (d.action === "join_requests") return joinRequests();
      if (d.action === "admin_counts") return adminCounts();
      if (d.action === "feedback_list") return feedbackList();
      if (d.action === "save_turf") return saveTurf(d);
      if (d.action === "delete_turf") return deleteTurf(d);
      if (d.action === "feedback_action") return feedbackAction(d);
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
    var g = md.avatar_url || md.picture || "";
    return { id: u.id, email: u.email || md.email || "", name: md.full_name || md.name || u.email || "", picture: g, googlePicture: g };
  }

  window.SA_BACKEND = {
    ready: ready,
    load: load,
    sendFeedback: sendFeedback,
    crewPanel: function (d) { return ready.then(function () { return crewPanel(d); }).catch(function (e) { return { ok: false, error: friendly(e) }; }); },
    profile: function (d) { return ready.then(function () { return profile(d); }).catch(function (e) { return { ok: false, error: friendly(e) }; }); },
    going: function (d) { return going(d).catch(function (e) { return { ok: false, error: friendly(e) }; }); },
    memberCounts: memberCounts,
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
