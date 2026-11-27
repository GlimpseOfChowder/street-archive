/* =====================================================================
   STREET ARCHIVE — app logic
   Data: data/crews.js + data/events.js, plus approved rows from the Google
   Sheet (js/config.js -> sheetApiUrl). Free on GitHub Pages.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- load the map data from Supabase (js/backend.js) ----------------
     Waits up to ~6 s; if the database is slow or down we use the last copy saved
     in this browser, then the built-in data files only. */
  var BOOT_CFG = window.SA_CONFIG || {};
  var BE = window.SA_BACKEND;          // null = no database configured
  var API = BE ? "supabase" : "";
  function cacheGet() { try { return JSON.parse(localStorage.getItem("sa:remote") || "null"); } catch (e) { return null; } }
  function cacheSet(d) { try { localStorage.setItem("sa:remote", JSON.stringify(d)); } catch (e) {} }
  var started = false;
  function go(remote, note) {
    if (started) return; started = true;
    var b = document.getElementById("boot"); if (b) { b.classList.add("done"); setTimeout(function () { b.remove(); }, 400); }
    start(remote || { crews: [], events: [] }, note);
  }
  if (!API) go(null);
  else {
    var timer = setTimeout(function () { var c = cacheGet(); go(c, c ? "Showing saved data — live list is slow to load." : "Couldn't load submitted meets right now."); }, 6000);
    BE.load().then(function (d) {
      if (!d || !Array.isArray(d.events)) throw new Error("bad data");
      cacheSet(d); clearTimeout(timer); go(d);
    }).catch(function () { clearTimeout(timer); var c = cacheGet(); go(c, c ? "Offline — showing saved data." : ""); });
  }

  function start(REMOTE, bootNote) {
  var CFG = window.SA_CONFIG || {};
  var CREWS = mergeById((window.SA_CREWS || []).slice(), (REMOTE.crews || []).map(remoteCrew).filter(Boolean));
  var RAW_EVENTS = mergeById((window.SA_EVENTS || []).slice(), (REMOTE.events || []).map(remoteEvent).filter(Boolean));
  var PLACES = (REMOTE.places || []).map(remotePlace).filter(Boolean);

  // Local data files win if the same id exists in both places.
  function mergeById(local, remote) {
    var ids = {}; local.forEach(function (x) { ids[x.id] = 1; });
    return local.concat(remote.filter(function (x) { return x.id && !ids[x.id]; }));
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function str(v) { return v == null ? "" : String(v).trim(); }
  function goodLogo(v) { v = str(v); return /^https:\/\//i.test(v) || /^club_logos\/[\w.\-]+$/i.test(v) ? v : ""; }
  function remoteCrew(r) {
    var lat = num(r.lat), lng = num(r.lng);
    if (!str(r.id) || !str(r.name) || lat === null || lng === null) return null;
    var logo = str(r.logo);
    if (logo && !/^https?:/i.test(logo) && !/^club_logos\//.test(logo)) logo = "club_logos/" + logo;
    return { id: str(r.id), name: str(r.name), area: str(r.area), link: str(r.link), logo: goodLogo(logo),
      color: /^#[0-9a-f]{6}$/i.test(str(r.color)) ? str(r.color) : "#ff3b3b",
      tags: str(r.tags) ? str(r.tags).split(",").map(str).filter(Boolean) : [],
      turf: { center: [lat, lng], radius: Math.round((num(r.radius_km) || 3) * 1000) }, verified: !!r.verified, _src: "sheet" };
  }
  function remotePlace(r) {
    var lat = num(r.lat), lng = num(r.lng);
    if (!str(r.id) || !str(r.name) || lat === null || lng === null) return null;
    return { id: str(r.id), name: str(r.name), category: str(r.category) || "mechanic",
      tags: str(r.tags) ? str(r.tags).split(",").map(str).filter(Boolean) : [],
      area: str(r.area), phone: str(r.phone), hours: str(r.hours), link: str(r.link), details: str(r.details),
      coords: [lat, lng], _src: "sheet" };
  }
  function remoteEvent(r) {
    var lat = num(r.lat), lng = num(r.lng);
    if (!str(r.id) || !str(r.title) || !str(r.start) || lat === null || lng === null) return null;
    return { id: str(r.id), title: str(r.title), type: str(r.type) || "meet", host: str(r.host),
      start: str(r.start), end: str(r.end) || undefined, place: str(r.place), coords: [lat, lng],
      details: str(r.details), link: str(r.link), visibility: str(r.visibility) || "public",
      by: str(r.by), by_id: str(r.by_id), _src: "sheet" };
  }
  var TZ = "Asia/Manila";
  var LABEL_ZOOM = 11;

  /* ---------------- helpers ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function parseDate(s) {
    if (!s) return null;
    if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(s)) s += "+08:00"; // default to PH time
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }
  var fmtFull = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  var fmtTime = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  var fmtDay = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, day: "numeric" });
  var fmtMon = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, month: "short" });
  function countdown(ev) {
    var now = Date.now();
    if (isLive(ev)) return "LIVE NOW";
    var ms = ev.startD - now;
    if (ms < 0) return "ended";
    var m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d > 0) return "in " + d + "d " + h + "h";
    if (h > 0) return "in " + h + "h " + mm + "m";
    return "in " + mm + "m";
  }
  function km(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    var x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("sa:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("sa:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  function toast(title, body, ms) {
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<b>" + esc(title) + "</b>" + (body ? "<span class='muted'>" + esc(body) + "</span>" : "");
    $("#toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 4500);
  }
  function initials(name) { return name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }

  /* ---------------- data prep ---------------- */
  var GOING = REMOTE.going || {};   // meet id -> how many are pulling up
  var crewById = {};
  CREWS.forEach(function (c) { crewById[c.id] = c; c.color = c.color || "#ffd400"; });

  var EVENTS = RAW_EVENTS.map(function (e) {
    var ev = Object.assign({}, e);
    ev.startD = parseDate(e.start);
    ev.endD = parseDate(e.end) || (ev.startD && new Date(ev.startD.getTime() + 4 * 36e5));
    return ev;
  }).filter(function (ev) {
    // hide 12 h after the event finished
    return ev.startD && ev.coords && ev.endD.getTime() + 12 * 36e5 > Date.now();
  }).sort(function (a, b) { return a.startD - b.startD; });
  var eventById = {};
  EVENTS.forEach(function (e) { eventById[e.id] = e; });
  function isLive(ev) { var n = Date.now(); return ev.startD <= n && n <= ev.endD; }

  /* ---------------- map ---------------- */
  var map = L.map("map", { zoomControl: false, worldCopyJump: true })
    .setView(CFG.center || [15.1, 120.8], CFG.zoom || 9);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Basemaps. CARTO's dark map needs a free API key (carto.com/basemaps/apikey)
  // set in js/config.js -> cartoKey. Without one we use Esri's dark grey map.
  // OSM's tile server refuses pages opened straight from disk (file://), so the
  // Street map falls back to Esri there.
  var LOCAL_FILE = location.protocol === "file:";
  // Live site uses cartoKey; localhost / 127.0.0.1 uses cartoKeyLocal (CARTO
  // requires local hosts on a separate key). Opened from disk = no key (Esri map).
  var IS_LOCALHOST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var CARTO_KEY = (LOCAL_FILE ? "" : IS_LOCALHOST ? (CFG.cartoKeyLocal || "") : (CFG.cartoKey || "")).trim();
  var esri = function (path, max) {
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/" + path + "/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: max || 19, attribution: "Tiles &copy; Esri" });
  };
  var BASEMAPS = [
    { name: "Night", cls: "style-night", layer: CARTO_KEY
        ? L.tileLayer("https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=" + encodeURIComponent(CARTO_KEY), {
            maxZoom: 20, maxNativeZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attribution/">CARTO</a>' })
        : L.layerGroup([esri("Canvas/World_Dark_Gray_Base", 16), esri("Canvas/World_Dark_Gray_Reference", 16)]) },
    { name: "Street", cls: "", layer: LOCAL_FILE
        ? esri("World_Street_Map")
        : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }) },
    { name: "Satellite", cls: "", layer: esri("World_Imagery") }
  ];
  var baseIdx = store.get("basemap", 0) % BASEMAPS.length;
  function setBase(i, announce) {
    BASEMAPS.forEach(function (b) { if (map.hasLayer(b.layer)) map.removeLayer(b.layer); });
    baseIdx = i;
    BASEMAPS[i].layer.addTo(map);
    map.getContainer().classList.toggle("style-night", BASEMAPS[i].cls === "style-night");
    store.set("basemap", i);
    if (announce) {
      var n = $("#layer-name"); n.textContent = BASEMAPS[i].name; n.classList.add("show");
      clearTimeout(setBase.t); setBase.t = setTimeout(function () { n.classList.remove("show"); }, 1200);
    }
  }
  setBase(baseIdx);
  $("#btn-layer").onclick = function () { setBase((baseIdx + 1) % BASEMAPS.length, true); };

  function updateLabels() { map.getContainer().classList.toggle("show-labels", map.getZoom() >= LABEL_ZOOM); }
  map.on("zoomend", updateLabels); updateLabels();

  /* ---------------- turf (GTA-style hatched territory) ---------------- */
  var turfRenderer = L.svg({ padding: 0.5 }).addTo(map);
  var svgNS = "http://www.w3.org/2000/svg";
  var defs = document.createElementNS(svgNS, "defs");
  turfRenderer._container.insertBefore(defs, turfRenderer._container.firstChild);

  function hatch(id, colors) {
    var w = 7 * colors.length + 7 * (colors.length === 1 ? 1 : 0);
    var p = document.createElementNS(svgNS, "pattern");
    p.setAttribute("id", id);
    p.setAttribute("patternUnits", "userSpaceOnUse");
    p.setAttribute("width", w); p.setAttribute("height", w);
    p.setAttribute("patternTransform", "rotate(45)");
    var bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("width", w); bg.setAttribute("height", w);
    bg.setAttribute("fill", colors[0]); bg.setAttribute("fill-opacity", colors.length > 1 ? "0.08" : "0.13");
    p.appendChild(bg);
    colors.forEach(function (c, i) {
      var r = document.createElementNS(svgNS, "rect");
      r.setAttribute("x", i * 7); r.setAttribute("width", 3); r.setAttribute("height", w);
      r.setAttribute("fill", c); r.setAttribute("fill-opacity", "0.42");
      p.appendChild(r);
    });
    defs.appendChild(p);
    return "url(#" + id + ")";
  }

  // Crews whose circle turfs share (roughly) the same centre share one turf (striped in both colours).
  var turfs = [];
  CREWS.forEach(function (c) {
    if (!c.turf) return;
    if (c.turf.center) {
      var g = turfs.find(function (t) { return t.center && km(t.center, c.turf.center) < 0.6; });
      if (g) { g.crews.push(c); g.radius = Math.max(g.radius, c.turf.radius || 3000); return; }
      turfs.push({ center: c.turf.center, radius: c.turf.radius || 3000, crews: [c] });
    } else if (c.turf.polygon) {
      turfs.push({ polygon: c.turf.polygon, crews: [c] });
    }
  });

  var turfLayer = L.layerGroup().addTo(map);
  var blipLayer = L.layerGroup().addTo(map);
  var crewMarker = {}; // crew id -> marker

  turfs.forEach(function (t, i) {
    var colors = t.crews.map(function (c) { return c.color; });
    var style = {
      renderer: turfRenderer,
      color: colors[0],
      weight: 2, opacity: 0.8,
      fillColor: hatch("turf-" + i, colors), fillOpacity: 1
    };
    var shape = t.center ? L.circle(t.center, Object.assign({ radius: t.radius }, style))
                         : L.polygon(t.polygon, style);
    shape.bindPopup(function () { return turfPopup(t); }, { maxWidth: Math.min(300, window.innerWidth - 50), autoPanPaddingTopLeft: [12, 80], autoPanPaddingBottomRight: [12, 90] });
    turfLayer.addLayer(shape);

    var pos = t.center || shape.getBounds().getCenter();
    var stack = t.crews.map(function (c) {
      return "<div class='blip' style='--c:" + esc(c.color) + "'>" +
        (c.logo ? "<img src='" + esc(c.logo) + "' alt='' onerror=\"this.replaceWith(Object.assign(document.createElement('div'),{className:'initials',textContent:'" + esc(initials(c.name)) + "'}))\">"
                : "<div class='initials'>" + esc(initials(c.name)) + "</div>") + "</div>";
    }).join("");
    var w = 46 + (t.crews.length - 1) * 30;
    var names = t.crews.map(function (c) { return c.name; }).join(" & ");
    var icon = L.divIcon({
      className: "blip-wrap", iconSize: [w, 46], iconAnchor: [w / 2, 23], popupAnchor: [0, -22],
      html: "<div class='blip-stack'>" + stack + "</div><div class='blip-name'>" + esc(names) + "</div>"
    });
    var m = L.marker(pos, { icon: icon, title: names, riseOnHover: true })
      .bindPopup(function () { return turfPopup(t); }, { maxWidth: Math.min(300, window.innerWidth - 50), autoPanPaddingTopLeft: [12, 80], autoPanPaddingBottomRight: [12, 90] });
    blipLayer.addLayer(m);
    t.crews.forEach(function (c) { crewMarker[c.id] = m; c._turf = t; c._pos = pos; });
  });

  function turfPopup(t) {
    var html = "<div class='pop'>";
    html += "<h3>" + esc(t.crews.map(function (c) { return c.name; }).join(" & ")) + "</h3>";
    html += "<div class='sub'>" + esc(t.crews[0].area || "") + "</div>";
    t.crews.forEach(function (c) {
      var link = safeUrl(c.link);
      html += "<div class='crew-row' style='--c:" + esc(c.color) + "'>" +
        (c.logo ? "<img src='" + esc(c.logo) + "' alt=''>" : "") +
        "<div>" + (link ? "<a href='" + esc(link) + "' target='_blank' rel='noopener'>" + esc(c.name) + " ↗</a>" : "<b>" + esc(c.name) + "</b>") +
        (c.verified ? " <span class='verified' title='Verified crew'>✔</span>" : "") +
        (c.tags && c.tags.length ? "<br>" + c.tags.map(function (x) { return "<span class='tag tag-type'>" + esc(x) + "</span>"; }).join("") : "") +
        "</div></div>" + crewButtons(c) + adminButtons("crew", c);
    });
    var ids = t.crews.map(function (c) { return c.id; });
    var ups = EVENTS.filter(function (e) { return ids.indexOf(e.host) > -1; }).slice(0, 3);
    if (ups.length) {
      html += "<div class='upcoming'><b>Upcoming</b>";
      ups.forEach(function (e) {
        html += "<div><a data-goto-meet='" + esc(e.id) + "'>" + esc(e.title) + "</a> <span class='muted'>· " + esc(countdown(e)) + "</span></div>";
      });
      html += "</div>";
    }
    html += "<div class='actions'><button class='btn sm' data-share='crew=" + esc(t.crews[0].id) + "'>Share</button></div>";
    t.crews.forEach(function (c) { html += reportLink("crew", c, t.crews.length > 1 ? c.name : ""); });
    return html + "</div>";
  }

  $("#btn-turf").onclick = function () {
    var on = map.hasLayer(turfLayer);
    if (on) map.removeLayer(turfLayer); else map.addLayer(turfLayer);
    this.classList.toggle("active", !on);
  };

  /* ---------------- places: mechanic shops, car washes & more ---------------- */
  var PLACE_CATS = {
    mechanic:  { label: "Mechanic",     color: "#4da3ff", icon: "M22.7 19 13.6 9.9c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4Z" },
    carwash:   { label: "Car wash",     color: "#2dd4bf", icon: "M12 2.7c-.3 0-.5.1-.7.4C9.2 6.1 6 10.5 6 14a6 6 0 0 0 12 0c0-3.5-3.2-7.9-5.3-10.9-.2-.3-.4-.4-.7-.4Z" },
    detailing: { label: "Detailing",    color: "#c084fc", icon: "M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2Zm7 13 1 2.6 2.6 1-2.6 1L19 22l-1-2.4-2.6-1 2.6-1L19 15Z" },
    tint:      { label: "Tint & Wrap",  color: "#94a3b8", icon: "M3 5h18v4H3V5Zm0 6h18v8H3v-8Zm2 2v4h14v-4H5Z" },
    tires:     { label: "Tires & Mags", color: "#f97316", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" },
    parts:     { label: "Parts",        color: "#facc15", icon: "M21 7.5 12 2 3 7.5v9L12 22l9-5.5v-9ZM12 4.3l6.4 3.9L12 12 5.6 8.2 12 4.3Z" }
  };
  var PLACE_TAGS = ["JDM", "Euro", "American", "Korean", "Diesel", "Tuning / ECU", "Engine", "Transmission", "Suspension",
    "Brakes", "Bodywork / Paint", "Electrical", "Aircon", "Exhaust", "Wheels / Alignment", "Ceramic coating", "PPF",
    "Interior", "Motorcycle", "24/7"];
  // Which specialties make sense for each type of place (the submit form only shows these).
  var TAGS_BY_CAT = {
    mechanic:  ["JDM", "Euro", "American", "Korean", "Diesel", "Tuning / ECU", "Engine", "Transmission", "Suspension",
                "Brakes", "Bodywork / Paint", "Electrical", "Aircon", "Exhaust", "Wheels / Alignment", "Motorcycle", "24/7"],
    carwash:   ["Ceramic coating", "24/7"],
    detailing: ["Ceramic coating", "PPF", "Interior", "Bodywork / Paint", "Motorcycle"],
    tint:      ["PPF", "Ceramic coating", "Motorcycle"],
    tires:     ["Wheels / Alignment", "Brakes", "Suspension", "Motorcycle", "24/7"],
    parts:     ["JDM", "Euro", "American", "Korean", "Diesel", "Engine", "Suspension", "Exhaust", "Brakes", "Electrical", "Motorcycle"]
  };
  function catOf(p) { return PLACE_CATS[p.category] || PLACE_CATS.mechanic; }
  function placeSvg(p, size) { return "<svg viewBox='0 0 24 24' width='" + size + "' height='" + size + "'><path d='" + catOf(p).icon + "'/></svg>"; }
  var placeById = {};
  PLACES.forEach(function (p) { placeById[p.id] = p; });
  var placeLayer = L.layerGroup().addTo(map);
  var placeMarker = {};
  PLACES.forEach(function (p) {
    var c = catOf(p);
    var icon = L.divIcon({ className: "blip-wrap", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14],
      html: "<div class='place-blip' style='--c:" + c.color + "'>" + placeSvg(p, 15) + "</div>" });
    var m = L.marker(p.coords, { icon: icon, title: p.name, zIndexOffset: 200 }).bindPopup(function () { return placePopup(p); }, { maxWidth: Math.min(320, window.innerWidth - 50), autoPanPaddingTopLeft: [12, 80], autoPanPaddingBottomRight: [12, 90] });
    placeLayer.addLayer(m); placeMarker[p.id] = m;
  });
  function placePopup(p) {
    var c = catOf(p), dest = p.coords[0] + "," + p.coords[1], link = safeUrl(p.link);
    var html = "<div class='pop'><span class='tag' style='background:" + c.color + "22;color:" + c.color + "'>" + esc(c.label) + "</span>";
    html += "<h3>" + esc(p.name) + "</h3>";
    if (p.area) html += "<div class='sub'>📍 " + esc(p.area) + "</div>";
    if (p.tags.length) html += "<div class='ptags'>" + p.tags.map(function (t) { return "<span class='tag tag-type'>" + esc(t) + "</span>"; }).join("") + "</div>";
    if (p.hours) html += "<p>🕒 " + esc(p.hours) + "</p>";
    if (p.details) html += "<p>" + esc(p.details) + "</p>";
    html += "<div class='actions'>";
    if (p.phone) html += "<a class='btn sm btn-accent' href='tel:" + esc(p.phone.replace(/[^\d+]/g, "")) + "'>📞 Call</a>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://waze.com/ul?ll=" + dest + "&navigate=yes'>Waze</a>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://www.google.com/maps/dir/?api=1&destination=" + dest + "'>Maps</a>";
    if (link) html += "<a class='btn sm' target='_blank' rel='noopener' href='" + esc(link) + "'>Page ↗</a>";
    html += "<button class='btn sm' data-share='place=" + esc(p.id) + "'>Share</button>";
    return html + "</div>" + adminButtons("place", p) + reportLink("place", p) + "</div>";
  }
  function focusPlace(id) {
    var p = placeById[id], m = placeMarker[id]; if (!p) return;
    if (!map.hasLayer(placeLayer)) { map.addLayer(placeLayer); $("#btn-places").classList.add("active"); }
    closePanelOnMobile();
    map.flyTo(p.coords, Math.max(map.getZoom(), 15), { duration: 0.8 });
    map.once("moveend", function () { m.openPopup(); });
    history.replaceState(null, "", "#place=" + encodeURIComponent(id));
  }
  $("#btn-places").onclick = function () {
    var on = map.hasLayer(placeLayer);
    if (on) map.removeLayer(placeLayer); else map.addLayer(placeLayer);
    this.classList.toggle("active", !on);
  };
  var placeCat = "all", placeTag = "";
  function renderPlaceFilters() {
    var cats = Object.keys(PLACE_CATS).filter(function (k) { return PLACES.some(function (p) { return p.category === k; }); });
    $("#place-filters").innerHTML = "<button class='chip" + (placeCat === "all" ? " active" : "") + "' data-pc='all'>All</button>" +
      cats.map(function (k) { return "<button class='chip" + (placeCat === k ? " active" : "") + "' data-pc='" + k + "'>" + esc(PLACE_CATS[k].label) + "</button>"; }).join("");
    $$("#place-filters .chip").forEach(function (c) { c.onclick = function () { placeCat = c.dataset.pc; renderPlaceFilters(); renderPlaces(); }; });
    var used = {}; PLACES.forEach(function (p) { p.tags.forEach(function (t) { used[t] = 1; }); });
    $("#place-tag").innerHTML = "<option value=''>All specialties</option>" + Object.keys(used).sort().map(function (t) {
      return "<option" + (t === placeTag ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
    $("#place-tag").hidden = !Object.keys(used).length;
  }
  $("#place-tag").onchange = function () { placeTag = this.value; renderPlaces(); };
  function renderPlaces() {
    $("#place-count").textContent = PLACES.length;
    var list = PLACES.filter(function (p) { return (placeCat === "all" || p.category === placeCat) && (!placeTag || p.tags.indexOf(placeTag) > -1); });
    if (myPos) list.sort(function (a, b) { return km(myPos, a.coords) - km(myPos, b.coords); });
    else list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    $("#place-list").innerHTML = list.length ? list.map(function (p) {
      var c = catOf(p);
      return "<li class='card' data-goto-place='" + esc(p.id) + "' style='--c:" + c.color + "'>" +
        "<div class='place-ico' style='--c:" + c.color + "'>" + placeSvg(p, 20) + "</div>" +
        "<div class='meta'><h4>" + esc(p.name) + "</h4><p>" + esc(c.label) + (p.area ? " · " + esc(p.area) : "") + (myPos ? " · " + km(myPos, p.coords).toFixed(0) + " km" : "") + "</p>" +
        (p.tags.length ? "<p>" + esc(p.tags.join(" · ")) + "</p>" : "") + "</div></li>";
    }).join("") : "<li class='empty'>" + (PLACES.length ? "Nothing matches that filter." : "No shops yet.<br>Know a good mechanic or car wash? Tap <b>+</b> → <b>Add a shop</b>.") + "</li>";
  }

  /* ---------------- meets ---------------- */
  var FLAG = "<svg viewBox='0 0 24 24'><path d='M5 3h2v18H5V3Zm3 1h11l-2 4 2 4H8V4Z'/></svg>";
  var meetLayer = L.layerGroup().addTo(map);
  var meetMarker = {};
  EVENTS.forEach(function (e) {
    var icon = L.divIcon({
      className: "blip-wrap", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -14],
      html: "<div class='meet-blip" + (isLive(e) ? " live" : "") + "'><div class='pulse'></div><div class='core'>" + FLAG + "</div></div>"
    });
    var m = L.marker(e.coords, { icon: icon, title: e.title, zIndexOffset: 500 })
      .bindPopup(function () { return meetPopup(e); }, { maxWidth: Math.min(320, window.innerWidth - 50), autoPanPaddingTopLeft: [12, 80], autoPanPaddingBottomRight: [12, 90] });
    meetLayer.addLayer(m);
    meetMarker[e.id] = m;
  });

  var TYPE_LABEL = { meet: "Meet", cruise: "Cruise", show: "Car show", track: "Track day" };
  function meetPopup(e) {
    var host = crewById[e.host];
    var reminders = store.get("reminders", {});
    var link = safeUrl(e.link);
    var dest = e.coords[0] + "," + e.coords[1];
    var html = "<div class='pop'>";
    html += "<span class='tag tag-type'>" + esc(TYPE_LABEL[e.type] || "Meet") + "</span>" + (e.sample ? "<span class='tag tag-sample'>Sample</span>" : "") + (e.visibility === "crew" ? "<span class='tag tag-sample'>Crew only</span>" : "") + (isLive(e) ? "<span class='tag tag-live'>Live</span>" : "");
    html += "<h3>" + esc(e.title) + "</h3>";
    html += "<div class='sub'><span class='when'>" + esc(fmtFull.format(e.startD)) + (e.end ? " – " + esc(fmtTime.format(e.endD)) : "") + "</span> · <span class='countdown'>" + esc(countdown(e)) + "</span></div>";
    if (host) html += "<div class='crew-row' style='--c:" + esc(host.color) + "'>" + (host.logo ? "<img src='" + esc(host.logo) + "' alt=''>" : "") + "<div>Hosted by <a data-goto-crew='" + esc(host.id) + "' href='#'>" + esc(host.name) + "</a></div></div>";
    if (e.place) html += "<p>📍 " + esc(e.place) + "</p>";
    if (e.details) html += "<p>" + esc(e.details) + "</p>";
    if (e.by_id) html += "<div class='posted-by'>Posted by <a href='#' data-profile='" + esc(e.by_id) + "'>" + esc(e.by || "a member") + "</a></div>";
    html += rsvpBlock(e);
    html += "<div class='actions'>";
    html += "<button class='btn sm" + (reminders[e.id] ? " btn-accent" : "") + "' data-remind='" + esc(e.id) + "'>" + (reminders[e.id] ? "🔔 Reminder on" : "🔔 Remind me") + "</button>";
    html += "<button class='btn sm' data-ics='" + esc(e.id) + "'>📅 Calendar</button>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://waze.com/ul?ll=" + dest + "&navigate=yes'>Waze</a>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://www.google.com/maps/dir/?api=1&destination=" + dest + "'>Maps</a>";
    html += "<button class='btn sm' data-share='meet=" + esc(e.id) + "'>Share</button>";
    if (link) html += "<a class='btn sm' target='_blank' rel='noopener' href='" + esc(link) + "'>Event page ↗</a>";
    html += "</div>" + adminButtons("meet", e) + crewAdminRow(e) + reportLink("meet", e) + "<div>";
    return html + "</div></div>";
  }

  /* ---------------- popup / list click delegation ---------------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-goto-meet],[data-goto-crew],[data-goto-place],[data-remind],[data-ics],[data-share]");
    if (!t) return;
    ev.preventDefault();
    if (t.dataset.gotoMeet) focusMeet(t.dataset.gotoMeet);
    else if (t.dataset.gotoCrew) focusCrew(t.dataset.gotoCrew);
    else if (t.dataset.gotoPlace) focusPlace(t.dataset.gotoPlace);
    else if (t.dataset.remind) toggleReminder(t.dataset.remind, t);
    else if (t.dataset.ics) downloadIcs(eventById[t.dataset.ics]);
    else if (t.dataset.share) share(t.dataset.share);
  });

  function closePanelOnMobile() { if (mq.matches) setSheet("peek"); }
  function focusMeet(id) {
    var e = eventById[id], m = meetMarker[id]; if (!e) return;
    closePanelOnMobile();
    map.flyTo(e.coords, Math.max(map.getZoom(), 14), { duration: 0.8 });
    map.once("moveend", function () { m.openPopup(); });
    history.replaceState(null, "", "#meet=" + encodeURIComponent(id));
  }
  function focusCrew(id) {
    var c = crewById[id], m = crewMarker[id]; if (!c || !m) return;
    closePanelOnMobile();
    map.flyTo(c._pos, Math.max(map.getZoom(), 12), { duration: 0.8 });
    map.once("moveend", function () { m.openPopup(); });
    history.replaceState(null, "", "#crew=" + encodeURIComponent(id));
  }

  function share(hash) {
    var url = location.href.split("#")[0] + "#" + hash;
    var title = "Street Archive";
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    copy(url, "Link copied", "Paste it in your GC or FB post.");
  }
  function copy(text, okTitle, okBody) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { toast(okTitle, okBody); })
      .catch(function () { window.prompt("Copy this:", text); });
  }

  /* ---------------- calendar export (.ics + Google) ---------------- */
  function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function downloadIcs(e) {
    if (!e) return;
    var host = crewById[e.host];
    var desc = [e.details, host ? "Host: " + host.name : "", e.link].filter(Boolean).join("\\n");
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Street Archive//EN", "BEGIN:VEVENT",
      "UID:" + e.id + "@street-archive", "DTSTAMP:" + icsDate(new Date()),
      "DTSTART:" + icsDate(e.startD), "DTEND:" + icsDate(e.endD),
      "SUMMARY:" + e.title.replace(/[,;]/g, "\\$&"),
      "LOCATION:" + (e.place || "").replace(/[,;]/g, "\\$&"),
      "GEO:" + e.coords[0] + ";" + e.coords[1],
      "DESCRIPTION:" + desc.replace(/[,;]/g, "\\$&"),
      "BEGIN:VALARM", "TRIGGER:-PT" + (CFG.reminderMinutesBefore || 60) + "M", "ACTION:DISPLAY", "DESCRIPTION:" + e.title, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ];
    var ics = lines.join("\r\n");
    var ua = navigator.userAgent || "";
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      // iOS can't "download" a calendar file from a page. Opening a real .ics URL
      // (served by our Supabase "ics" function) brings up the native "Add to Calendar" sheet.
      if (BE && e._src === "sheet" && e.visibility !== "crew") window.location.href = BE.icsUrl(e.id);
      else window.location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    } else {
      var blob = new Blob([ics], { type: "text/calendar" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = e.id + ".ics";
      document.body.appendChild(a); a.click(); a.remove();
    }
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.title) +
      "&dates=" + icsDate(e.startD) + "/" + icsDate(e.endD) + "&location=" + encodeURIComponent((e.place || "") + " (" + e.coords.join(",") + ")") +
      "&details=" + encodeURIComponent(desc.replace(/\\n/g, "\n"));
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<b>" + (isIOS ? "Opening your Calendar…" : "Calendar file downloaded") + "</b><span class='muted'>Using Google Calendar? <a target='_blank' rel='noopener' style='color:var(--acc)' href='" + esc(g) + "'>Add it there instead</a></span>";
    $("#toasts").appendChild(el); setTimeout(function () { el.remove(); }, 8000);
  }

  /* ---------------- reminders (free, in-browser) ---------------- */
  function toggleReminder(id, btn) {
    var r = store.get("reminders", {});
    if (r[id]) { delete r[id]; store.set("reminders", r); toast("Reminder removed"); }
    else {
      r[id] = { fired: false }; store.set("reminders", r);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      toast("Reminder set 🔔", "We'll ping you " + (CFG.reminderMinutesBefore || 60) + " min before while Street Archive is open. Add to Calendar for a guaranteed alert.", 6500);
    }
    if (btn) {
      var on = !!store.get("reminders", {})[id];
      btn.classList.toggle("btn-accent", on);
      btn.textContent = on ? "🔔 Reminder on" : "🔔 Remind me";
    }
    renderMeets();
  }
  function checkReminders() {
    var r = store.get("reminders", {}), changed = false, lead = (CFG.reminderMinutesBefore || 60) * 60000;
    Object.keys(r).forEach(function (id) {
      var e = eventById[id];
      if (!e) { delete r[id]; changed = true; return; }
      if (!r[id].fired && e.startD - Date.now() <= lead) {
        r[id].fired = true; changed = true;
        var body = (e.place || "") + " · " + fmtTime.format(e.startD);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification("🏁 " + e.title + " " + countdown(e), { body: body, icon: "club_logos/site_logo.png", tag: e.id }); } catch (x) {}
        }
        toast("🏁 " + e.title, countdown(e) + " · " + body, 10000);
      }
    });
    if (changed) store.set("reminders", r);
  }
  setInterval(checkReminders, 30000);

  /* ---------------- side panel (desktop) / bottom sheet (mobile) ---------------- */
  var panel = $("#panel");
  var mq = window.matchMedia("(max-width: 720px)");
  var sheet = "peek";
  function sheetPx(state) {
    var h = panel.offsetHeight || window.innerHeight - 64;
    if (state === "full") return h;
    if (state === "half") return Math.round(window.innerHeight * 0.5);
    return 74; // peek: handle + tabs
  }
  function setSheet(state) {
    sheet = state;
    panel.style.transform = "";
    document.documentElement.style.setProperty("--sheet-visible", sheetPx(state) + "px");
    document.body.classList.toggle("sheet-full", state === "full");
  }
  function setPanel(open) {
    if (mq.matches) { setSheet(open ? "full" : "peek"); return; }
    panel.classList.toggle("collapsed", !open);
    document.body.classList.toggle("panel-closed", !open);
  }
  $("#panel-toggle").onclick = function () { setPanel(panel.classList.contains("collapsed")); };
  function applyLayout() {
    if (mq.matches) { panel.classList.remove("collapsed"); document.body.classList.remove("panel-closed"); setSheet(sheet); }
    else { document.documentElement.style.removeProperty("--sheet-visible"); document.body.classList.remove("sheet-full"); panel.style.transform = ""; }
  }
  (mq.addEventListener ? mq.addEventListener("change", applyLayout) : mq.addListener(applyLayout));
  window.addEventListener("resize", function () { if (mq.matches) setSheet(sheet); });
  applyLayout();

  // Drag the sheet by its handle or tab bar; snaps to peek / half / full.
  (function () {
    var startY = 0, startVis = 0, lastY = 0, lastT = 0, vel = 0, dragging = false, moved = false;
    function down(e) {
      if (!mq.matches) return;
      dragging = true; moved = false;
      startY = lastY = e.clientY; lastT = Date.now(); vel = 0;
      startVis = sheetPx(sheet);
      panel.classList.add("dragging");
    }
    function move(e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      if (Math.abs(dy) > 6) moved = true;
      var now = Date.now();
      vel = (e.clientY - lastY) / Math.max(1, now - lastT); lastY = e.clientY; lastT = now;
      var vis = Math.min(sheetPx("full"), Math.max(60, startVis - dy));
      panel.style.transform = "translateY(" + (panel.offsetHeight - vis) + "px)";
    }
    function up(e) {
      if (!dragging) return;
      dragging = false; panel.classList.remove("dragging");
      if (!moved) { panel.style.transform = ""; return; }
      // One swipe is enough: up opens fully, down collapses.
      var dy = e.clientY - startY, target;
      if (Math.abs(vel) > 0.3 || Math.abs(dy) > 40) target = dy < 0 ? "full" : "peek";
      else target = sheet;
      setSheet(target);
      suppressClick = true; setTimeout(function () { suppressClick = false; }, 50);
    }
    var suppressClick = false;
    [$("#sheet-handle"), $(".tabs")].forEach(function (el) { el.addEventListener("pointerdown", down); });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    $(".tabs").addEventListener("click", function (e) { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
    $("#sheet-handle").addEventListener("click", function () { if (!suppressClick) setSheet(sheet === "peek" ? "full" : "peek"); });

    // Swipe the list itself: pulling down while it's scrolled to the top
    // (or swiping up while peeking) moves the sheet instead of scrolling,
    // so the phone's pull-to-refresh never kicks in.
    var tb = null, ty0 = 0, tx0 = 0, tyLast = 0, txLast = 0, ttLast = 0, tvel = 0, txVel = 0, tmode = null, tTarget = null;
    $$(".tab-body").forEach(function (body) {
      body.addEventListener("touchstart", function (e) {
        if (!mq.matches || e.touches.length > 1) { tmode = "scroll"; return; }
        tb = body; tmode = null; tvel = 0; txVel = 0; tTarget = e.target;
        ty0 = tyLast = e.touches[0].clientY; tx0 = txLast = e.touches[0].clientX; ttLast = Date.now();
        startVis = sheetPx(sheet);
      }, { passive: true });
      body.addEventListener("touchmove", function (e) {
        if (tmode === "scroll" || tb !== body) return;
        var y = e.touches[0].clientY, dy = y - ty0, dx = e.touches[0].clientX - tx0;
        if (tmode === null) {
          if (Math.abs(dy) < 3 && Math.abs(dx) < 3) return;
          var atTop = body.scrollTop <= 0;
          if (Math.abs(dx) > Math.abs(dy)) {
            // sideways: chip rows / dropdowns keep their own scrolling; anywhere else flips tabs
            tmode = (tTarget && tTarget.closest && tTarget.closest(".chips, select, input, textarea")) ? "scroll" : "tab";
            if (tmode === "tab") body.classList.add("tab-dragging");
          }
          else if (sheet !== "full" || (dy > 0 && atTop)) tmode = e.cancelable ? "sheet" : "scroll";
          else tmode = "scroll";
          if (tmode === "sheet") panel.classList.add("dragging");
        }
        if (tmode === "tab") {
          if (e.cancelable) e.preventDefault();
          var nowX = Date.now();
          txVel = (e.touches[0].clientX - txLast) / Math.max(1, nowX - ttLast); txLast = e.touches[0].clientX; ttLast = nowX;
          var i = tabIndex(), edge = (dx > 0 && i === 0) || (dx < 0 && i === TAB_ORDER.length - 1);
          var move = dx * (edge ? 0.15 : 0.45);                                 // resist at the first / last tab
          body.style.transform = "translateX(" + move + "px)";
          body.style.opacity = String(1 - Math.min(0.35, Math.abs(move) / 400));
          return;
        }
        if (tmode !== "sheet") return;
        e.preventDefault();
        var now = Date.now();
        tvel = (y - tyLast) / Math.max(1, now - ttLast); tyLast = y; ttLast = now;
        var vis = Math.min(sheetPx("full"), Math.max(60, startVis - dy));
        panel.style.transform = "translateY(" + (panel.offsetHeight - vis) + "px)";
      }, { passive: false });
      function tend() {
        if (tmode === "tab") {
          var dx = txLast - tx0, i = tabIndex(), next = i + (dx < 0 ? 1 : -1);
          body.classList.remove("tab-dragging");
          body.style.transform = ""; body.style.opacity = "";
          if ((Math.abs(dx) > 60 || Math.abs(txVel) > 0.45) && next >= 0 && next < TAB_ORDER.length) switchTab(TAB_ORDER[next], dx < 0 ? "left" : "right");
        }
        if (tmode === "sheet") {
          panel.classList.remove("dragging");
          var dy = tyLast - ty0;
          setSheet((Math.abs(tvel) > 0.3 || Math.abs(dy) > 50) ? (dy < 0 ? "full" : "peek") : sheet);
        }
        tmode = null; tb = null;
      }
      body.addEventListener("touchend", tend);
      body.addEventListener("touchcancel", tend);
    });
  })();

  var TAB_ORDER = ["meets", "crews", "places"];
  function tabIndex() { var a = $(".tab.active"); return Math.max(0, TAB_ORDER.indexOf(a ? a.dataset.tab : "meets")); }
  // from = "left" means the new tab slides in from the right (you swiped left)
  function switchTab(name, from) {
    var btn = $(".tab[data-tab='" + name + "']"); if (!btn) return;
    btn.onclick();
    var body = $("#tab-" + name);
    if (from && body) {
      body.classList.remove("slide-from-left", "slide-from-right"); void body.offsetWidth;
      body.classList.add(from === "left" ? "slide-from-right" : "slide-from-left");
    }
  }
  $$(".tab").forEach(function (b) {
    b.onclick = function () {
      $$(".tab").forEach(function (x) { x.classList.toggle("active", x === b); });
      $("#tab-meets").hidden = b.dataset.tab !== "meets";
      $("#tab-crews").hidden = b.dataset.tab !== "crews";
      $("#tab-places").hidden = b.dataset.tab !== "places";
      if (b.dataset.tab === "meets") markSeen();
      if (mq.matches && sheet === "peek") setSheet("full");
    };
  });

  var meetFilter = "all", myPos = null;
  $$("#meet-filters .chip").forEach(function (c) {
    c.onclick = function () {
      meetFilter = c.dataset.f;
      $$("#meet-filters .chip").forEach(function (x) { x.classList.toggle("active", x === c); });
      if (meetFilter === "near" && !myPos) locate();
      renderMeets();
    };
  });

  var seen = store.get("seen", null);
  var firstVisit = seen === null;
  seen = seen || [];
  function isNew(e) { return !firstVisit && seen.indexOf(e.id) === -1; }
  function markSeen() {
    store.set("seen", EVENTS.map(function (e) { return e.id; }).concat(seen).slice(0, 500));
    setTimeout(function () { $("#new-badge").hidden = true; }, 4000);
  }

  function renderMeets() {
    var list = EVENTS.slice(), rem = store.get("reminders", {});
    if (meetFilter === "week") list = list.filter(function (e) { return e.startD - Date.now() < 7 * 864e5; });
    if (meetFilter === "saved") list = list.filter(function (e) { return rem[e.id]; });
    if (meetFilter === "near") {
      if (!myPos) { $("#meet-list").innerHTML = "<li class='empty'>Finding your location…</li>"; return; }
      list.sort(function (a, b) { return km(myPos, a.coords) - km(myPos, b.coords); });
    }
    if (!list.length) {
      $("#meet-list").innerHTML = "<li class='empty'>" + (meetFilter === "saved" ? "No reminders yet. Open a meet and tap 🔔." : "No meets here yet.<br>Hit <b>+ Submit</b> to post one.") + "</li>";
      return;
    }
    $("#meet-list").innerHTML = list.map(function (e) {
      var host = crewById[e.host];
      var dist = myPos ? " · " + km(myPos, e.coords).toFixed(0) + " km" : "";
      return "<li class='card' data-goto-meet='" + esc(e.id) + "' style='--c:" + esc(host ? host.color : "var(--acc)") + "'>" +
        "<div class='date'><b>" + esc(fmtDay.format(e.startD)) + "</b><span>" + esc(fmtMon.format(e.startD)) + "</span></div>" +
        "<div class='meta'><h4>" + (isNew(e) ? "<span class='tag tag-new'>New</span>" : "") + (e.sample ? "<span class='tag tag-sample'>Sample</span>" : "") + (rem[e.id] ? "🔔 " : "") + esc(e.title) + "</h4>" +
        "<p><span class='countdown'>" + esc(countdown(e)) + "</span> · " + esc(fmtTime.format(e.startD)) + (host ? " · " + esc(host.name) : "") + dist +
        (GOING[e.id] ? " · <span class='going-n'>🚗 " + GOING[e.id] + "</span>" : "") + (MYRSVP && MYRSVP[e.id] !== undefined ? " <span class='going-me'>✓ going</span>" : "") + "</p>" +
        "<p>" + esc(e.place || "") + "</p></div></li>";
    }).join("");
  }

  function renderCrews() {
    $("#crew-count").textContent = CREWS.length;
    var sorted = CREWS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $("#crew-list").innerHTML = sorted.map(function (c) {
      var n = EVENTS.filter(function (e) { return e.host === c.id; }).length;
      return "<li class='card' data-goto-crew='" + esc(c.id) + "' style='--c:" + esc(c.color) + "'>" +
        (c.logo ? "<img class='logo' src='" + esc(c.logo) + "' alt=''>" : "<div class='logo'></div>") +
        "<div class='meta'><h4>" + esc(c.name) + "</h4><p>" + esc(c.area || "") + "</p>" +
        "<p>" + (n ? n + " upcoming meet" + (n > 1 ? "s" : "") : "No meets posted") + "</p></div></li>";
    }).join("") || "<li class='empty'>No crews yet.</li>";
  }

  /* ---------------- search ---------------- */
  var sInput = $("#search"), sBox = $("#search-results"), hlIdx = -1;
  function searchItems(q) {
    q = q.toLowerCase();
    var out = [];
    CREWS.forEach(function (c) { if ((c.name + " " + (c.area || "") + " " + (c.tags || []).join(" ")).toLowerCase().indexOf(q) > -1) out.push({ kind: "Crew", label: c.name, sub: c.area, go: function () { focusCrew(c.id); } }); });
    PLACES.forEach(function (p) { if ((p.name + " " + (p.area || "") + " " + p.tags.join(" ") + " " + catOf(p).label).toLowerCase().indexOf(q) > -1) out.push({ kind: catOf(p).label, label: p.name, sub: p.area, go: function () { focusPlace(p.id); } }); });
    EVENTS.forEach(function (e) { if ((e.title + " " + (e.place || "")).toLowerCase().indexOf(q) > -1) out.push({ kind: "Meet", label: e.title, sub: fmtFull.format(e.startD), go: function () { focusMeet(e.id); } }); });
    return out.slice(0, 8);
  }
  function showResults(items) {
    hlIdx = -1;
    if (!items.length) { sBox.hidden = true; return; }
    sBox.innerHTML = "";
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.innerHTML = "<span class='sr-main'><span class='sr-label'>" + esc(it.label) + "</span>" + (it.sub ? "<span class='sr-sub'>" + esc(it.sub) + "</span>" : "") + "</span><small>" + esc(it.kind) + "</small>";
      b.onclick = function () { sBox.hidden = true; if (it.kind !== "Place" || !/^Search places/.test(it.label)) sInput.blur(); it.go(); };
      sBox.appendChild(b);
    });
    sBox.hidden = false;
  }
  // Place suggestions as you type come from Photon (photon.komoot.io): free,
  // OpenStreetMap data, built for search-as-you-type. We wait until the user
  // pauses typing, cancel stale requests and cache answers to stay "fair use".
  // Nominatim (no search-as-you-type allowed) is only the Enter-key fallback.
  var PH_BBOX = "116.9,4.5,126.7,21.3";
  var photonCache = {}, photonCtl = null;
  function photon(q, cb) {
    var key = q.toLowerCase();
    if (photonCache[key]) { cb(photonCache[key]); return; }
    if (photonCtl) photonCtl.abort();
    photonCtl = window.AbortController ? new AbortController() : null;
    var c = map.getCenter();
    fetch("https://photon.komoot.io/api/?limit=6&lang=en&bbox=" + PH_BBOX + "&lat=" + c.lat.toFixed(3) + "&lon=" + c.lng.toFixed(3) +
          "&q=" + encodeURIComponent(q), photonCtl ? { signal: photonCtl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var seen = {};
        var out = (j.features || []).map(function (f) {
          var pr = f.properties || {}, xy = (f.geometry || {}).coordinates || [];
          var name = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(" ") || pr.city || "";
          var sub = [];
          [pr.name ? pr.street : "", pr.district || pr.locality, pr.city, pr.state].forEach(function (x) { if (x && x !== name && sub.indexOf(x) < 0) sub.push(x); });
          return { name: name, sub: sub.slice(0, 3).join(", "), lat: +xy[1], lng: +xy[0], area: pr.osm_key === "place" || pr.osm_key === "boundary" };
        }).filter(function (x) {
          var k = x.name + "|" + x.sub;
          if (!x.name || !isFinite(x.lat) || seen[k]) return false;
          seen[k] = 1; return true;
        });
        photonCache[key] = out; cb(out);
      })
      .catch(function (e) { if (!e || e.name !== "AbortError") cb(null); });
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  var lastGeo = 0;
  function placeRow(q) {
    return { kind: "Place", label: "Search places for “" + q + "”", sub: "", go: function () { searchPlaces(q); } };
  }
  function geocode(q, cb) {
    if (Date.now() - lastGeo < 1100) { cb(null); return; }
    lastGeo = Date.now();
    var b = map.getBounds(); // prefer results near what's on screen
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ph&viewbox=" +
          [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map(function (n) { return n.toFixed(4); }).join(",") +
          "&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(cb).catch(function () { cb([]); });
  }
  function searchPlaces(q) {
    geocode(q, function (res) {
        if (res === null) return;
        if (!res.length) { toast("No places found", "Try a city or landmark name."); return; }
        if (res.length === 1) { map.flyTo([+res[0].lat, +res[0].lon], 14); return; }
        showResults(res.map(function (p) {
          return { kind: "Place", label: p.display_name.split(",").slice(0, 2).join(","), sub: "", go: function () { map.flyTo([+p.lat, +p.lon], 14); } };
        }));
        sInput.focus();
    });
  }
  var suggestPlacesMain = debounce(function (q) {
    photon(q, function (res) {
      if (sInput.value.trim() !== q) return;                 // user kept typing
      var local = searchItems(q);
      if (!res) { showResults(local.concat([placeRow(q)])); return; }  // Photon down: Enter → Nominatim
      showResults(local.concat(res.map(function (p) {
        return { kind: "Place", label: p.name, sub: p.sub, go: function () { map.flyTo([p.lat, p.lng], p.area ? 13 : 16); } };
      })));
    });
  }, 350);
  sInput.addEventListener("input", function () {
    var q = sInput.value.trim();
    if (q.length < 2) { sBox.hidden = true; return; }
    showResults(searchItems(q).concat([placeRow(q)]));
    if (q.length >= 3) suggestPlacesMain(q);
  });
  sInput.addEventListener("keydown", function (e) {
    var btns = $$("button", sBox);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (!btns.length) return;
      hlIdx = (hlIdx + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
      btns.forEach(function (b, i) { b.classList.toggle("hl", i === hlIdx); });
    } else if (e.key === "Enter") { var b = btns[Math.max(hlIdx, 0)]; if (b) b.click(); }
    else if (e.key === "Escape") { sBox.hidden = true; }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".search")) sBox.hidden = true; });

  /* ---------------- locate me ---------------- */
  var meMarker = null;
  function locate() {
    if (!navigator.geolocation) { toast("Location not supported on this browser"); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      myPos = [p.coords.latitude, p.coords.longitude];
      if (!meMarker) meMarker = L.marker(myPos, { icon: L.divIcon({ className: "", html: "<div class='me-dot'></div>", iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(map);
      else meMarker.setLatLng(myPos);
      map.flyTo(myPos, 12);
      renderMeets(); renderPlaces();
    }, function () {
      toast("Couldn't get your location", "Allow location access in your browser settings.");
      if (meetFilter === "near") { meetFilter = "all"; $$("#meet-filters .chip").forEach(function (x) { x.classList.toggle("active", x.dataset.f === "all"); }); renderMeets(); }
    }, { enableHighAccuracy: true, timeout: 10000 });
  }
  $("#btn-locate").onclick = locate;

  /* ---------------- Google sign-in (needed to post when configured) ---------------- */
  var CLIENT_ID = (CFG.googleClientId || "").trim();
  var AUTH_ON = !!(API && CLIENT_ID);
  // Signed-in state lives in Supabase (it renews sessions automatically).
  var auth = BE ? BE.user() : null; // { id, name, email, picture }
  function authValid() { return !!(BE && BE.isSignedIn()); }
  function gis() { return window.google && google.accounts && google.accounts.id ? google.accounts.id : null; }
  function whenGis(cb, tries) {
    if (gis()) return cb();
    if ((tries || 0) > 50) return; // ~10 s, script blocked/offline
    setTimeout(function () { whenGis(cb, (tries || 0) + 1); }, 200);
  }
  function onCredential(resp) {
    if (!resp || !resp.credential) { toast("Sign-in failed", "Please try again."); return; }
    BE.signInWithGoogle(resp.credential).then(function (u) {
      auth = u;
      renderAccount(); updateGate(); loadRole(); loadMyCrews(); MYCARS = null; loadMyRsvps();
      toast("Signed in", "Welcome, " + ((auth && auth.name) || "").split(" ")[0] + "!");
      // crew-only meets you belong to appear after a refresh of the data
      BE.load().then(function (d) { cacheSet(d); }).catch(function () {});
    }).catch(function (e) { toast("Sign-in failed", (e && e.message) || "Please try again."); });
  }
  function signOut() {
    BE.signOut().then(function () {
      auth = null;
      var g = gis(); if (g) g.disableAutoSelect();
      renderAccount(); updateGate(); $("#acct-menu").hidden = true;
      ROLE = { admin: false, trusted: false }; $("#acct-admin").hidden = true; document.body.classList.remove("is-admin");
      MY = {}; adminWaiting = 0; renderMyCrews(); MYRSVP = {}; MYCARS = null; renderMeets();
      // forget crew-only meets on this device
      var c = cacheGet(); if (c && c.events) { c.events = c.events.filter(function (x) { return x.visibility !== "crew"; }); cacheSet(c); }
      toast("Signed out");
      if (EVENTS.some(function (x) { return x.visibility === "crew"; })) setTimeout(function () { location.reload(); }, 800);
    });
  }
  function renderGisButton(el, wide) {
    whenGis(function () {
      el.innerHTML = "";
      gis().renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", width: wide ? 260 : undefined });
    });
  }
  function renderAccount() {
    var box = $("#account"); if (!AUTH_ON) { box.hidden = true; return; }
    box.hidden = false;
    var btn = $("#acct-btn");
    if (authValid() && auth) {
      btn.innerHTML = auth.picture ? "<img src='" + esc(auth.picture) + "' alt='' referrerpolicy='no-referrer'>" : "<b>" + esc(initials(auth.name || "?")) + "</b>";
      btn.title = auth.email;
      $("#acct-name").textContent = auth.name || "";
      $("#acct-email").textContent = auth.email || "";
      $("#acct-in").hidden = false; $("#acct-out").hidden = true;
      $("#acct-expired").hidden = true;
    } else {
      btn.innerHTML = "<svg viewBox='0 0 24 24'><path d='M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5Z'/></svg>";
      btn.title = "Sign in";
      $("#acct-in").hidden = true; $("#acct-out").hidden = false;
      renderGisButton($("#gsi-menu-btn"), true);
    }
  }
  function updateGate() {
    var need = AUTH_ON && !authValid();
    $("#signin-gate").hidden = !need;
    $("#submit-form").hidden = need;
    if (need) {
      $("#gate-msg").textContent = LOCAL_FILE ? "Sign-in only works on the live site (or localhost) — not when opening the file directly." :
        "Sign in with Google to post. It keeps fake meets out — your email is only seen by the admin, never shown on the map.";
      renderGisButton($("#gsi-modal-btn"), true);
    }
  }
  function loadMine() {
    var list = $("#acct-posts");
    if (!authValid()) { list.innerHTML = "<li class='muted'>Session expired — sign in again to see your posts.</li>"; return; }
    list.innerHTML = "<li class='muted'>Loading…</li>";
    BE.call({ action: "mine" })
      .then(function (res) {
        if (res.auth) { list.innerHTML = "<li class='muted'>Please sign in again.</li>"; return; }
        var items = res.items || [];
        list.innerHTML = items.length ? items.map(function (it) {
          var go = it.approved && it.kind === "meet" && eventById[it.id] ? " data-goto-meet='" + esc(it.id) + "'"
                 : it.approved && it.kind === "crew" && crewById[it.id] ? " data-goto-crew='" + esc(it.id) + "'"
                 : it.approved && it.kind === "place" && placeById[it.id] ? " data-goto-place='" + esc(it.id) + "'" : "";
          return "<li class='my-post'><div class='mp-main'" + go + ">" +
            "<span class='tag " + (it.approved ? "tag-live" : it.flagged ? "tag-flagged" : "tag-sample") + "'" +
            (it.flagged ? " title='Hidden after reports — the admin will check it'" : "") + ">" +
            (it.archived ? "Archived" : it.approved ? "Live" : it.flagged ? "Under review" : "Pending") + "</span>" +
            esc(it.label) + " <span class='muted'>· " + esc(KIND_NAME[it.kind] || it.kind) + "</span></div>" +
            "<div class='mp-btns'><button class='btn sm' data-edit='" + esc(it.id) + "' data-kind='" + esc(it.kind) + "'>Edit</button>" +
            "<button class='btn sm btn-danger' data-del='" + esc(it.id) + "' data-kind='" + esc(it.kind) + "'>Delete</button></div></li>";
        }).join("") : "<li class='muted'>No posts yet. Tap + to add a meet or your crew.</li>";
      }).catch(function () { list.innerHTML = "<li class='muted'>Couldn't load your posts.</li>"; });
  }
  if (AUTH_ON) {
    BE.googleNonce().then(function (nonce) {
      whenGis(function () {
        gis().initialize({ client_id: CLIENT_ID, callback: onCredential, nonce: nonce, auto_select: false, cancel_on_tap_outside: true });
        renderAccount(); updateGate();
      });
    });
    BE.onAuthChange(function () {
      var was = auth && auth.id;
      auth = BE.user(); renderAccount(); updateGate();
      if ((auth && auth.id) !== was) { loadRole(); loadMyCrews(); MYCARS = null; loadMyRsvps(); }   // signed in / out / switched account
    });
    $("#acct-btn").onclick = function (e) {
      e.stopPropagation();
      var m = $("#acct-menu"); m.hidden = !m.hidden;
      if (!m.hidden && auth && auth.email) { loadMine(); loadMyCrews(); loadAdminCounts(); }
    };
    $("#acct-signout").onclick = signOut;
    document.addEventListener("click", function (e) { if (!e.target.closest("#account")) $("#acct-menu").hidden = true; });
  }
  renderAccount();

  /* ---------------- admin tools (Users tab → tick "admin") ---------------- */
  var ROLE = { admin: false, trusted: false };
  function api(body) { return BE.call(body); }
  function loadRole() {
    if (!AUTH_ON || !authValid()) { ROLE = { admin: false, trusted: false }; $("#acct-admin").hidden = true; return; }
    api({ action: "whoami" }).then(function (r) {
      if (!r || !r.ok) return;
      ROLE = { admin: !!r.admin, trusted: !!r.trusted };
      $("#acct-admin").hidden = !ROLE.admin;
      loadAdminCounts();
      if (ROLE.admin) document.body.classList.add("is-admin");
    }).catch(function () {});
  }
  // "⚑ Report" at the bottom of a popup (not for your own posts / data-file entries)
  function reportLink(k, item, label) {
    if (item._src !== "sheet") return "";
    return "<div class='report-row' data-report-box><a href='#' data-report='" + esc(item.id) + "' data-kind='" + k + "'>⚑ Report" +
      (label ? " " + esc(label) : "") + "</a></div>";
  }
  var REPORT_REASONS = ["Fake / spam", "Wrong info or location", "Offensive", "Already over / closed"];
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-report]");
    if (a) {
      e.preventDefault(); e.stopPropagation();
      if (!authValid()) { toast("Sign in to report", "Tap the account button at the top right."); return; }
      var box = a.closest("[data-report-box]");
      box.innerHTML = "<span class='muted small'>What's wrong?</span>" + REPORT_REASONS.map(function (r) {
        return "<button class='btn sm' data-report-send='" + esc(a.dataset.report) + "' data-kind='" + esc(a.dataset.kind) + "' data-reason='" + esc(r) + "'>" + esc(r) + "</button>";
      }).join("");
      return;
    }
    var b = e.target.closest("[data-report-send]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var row = b.closest("[data-report-box]");
    $$("button", row).forEach(function (x) { x.disabled = true; });
    api({ action: "report", kind: b.dataset.kind, id: b.dataset.reportSend, reason: b.dataset.reason }).then(function (r) {
      if (r.auth) throw new Error("Please sign in again.");
      if (!r.ok) throw new Error(r.error);
      row.innerHTML = "<span class='muted small'>Reported — thanks. If others report it too, it's hidden until the admin checks.</span>";
    }).catch(function (err) {
      row.innerHTML = "<span class='muted small'>" + esc(err.message || "Couldn't send the report.") + "</span>";
    });
  });

  function crewAdminRow(e) {
    if (ROLE.admin || e._src !== "sheet" || !e.host || !runsCrew(e.host)) return "";
    return "<div class='admin-row'><span>Crew admin</span>" +
      "<button class='btn sm btn-accent' data-edit='" + esc(e.id) + "' data-kind='meet'>Edit</button>" +
      "<button class='btn sm' data-manage='" + esc(e.host) + "'>Manage crew meets</button></div>";
  }
  function adminButtons(k, item) {
    if (!ROLE.admin) return "";
    if (item._src !== "sheet") return "<div class='admin-row muted'>Admin: this " + k + " is in the site's data files — edit it on GitHub.</div>";
    return "<div class='admin-row'><span>Admin</span>" +
      "<button class='btn sm btn-accent' data-edit='" + esc(item.id) + "' data-kind='" + k + "'>Edit</button>" +
      "<button class='btn sm' data-admin-act='admin_archive' data-kind='" + k + "' data-id='" + esc(item.id) + "' data-label='" + esc(item.name || item.title) + "'>Archive</button>" +
      "<button class='btn sm btn-danger' data-admin-act='admin_delete' data-kind='" + k + "' data-id='" + esc(item.id) + "' data-label='" + esc(item.name || item.title) + "'>Delete</button></div>";
  }
  var adminDirty = false, adminTab = "pending", adminKind = "all", adminItems = [];
  function adminDo(btn) {
    var act = btn.dataset.adminAct, label = btn.dataset.label || btn.dataset.id;
    if (act === "admin_delete" && !window.confirm("Permanently delete “" + label + "”? This can't be undone.\n(Tip: Archive hides it but keeps it.)")) return;
    btn.disabled = true;
    api({ action: act, kind: btn.dataset.kind, id: btn.dataset.id }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "Failed");
      var verb = { admin_approve: "Approved", admin_archive: "Archived", admin_restore: "Restored", admin_delete: "Deleted", admin_reviewed: "Marked as reviewed" }[act];
      toast(verb + ": " + label);
      adminDirty = true;
      if (!$("#admin-panel").hidden) loadAdmin();
      else setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) { btn.disabled = false; toast("Couldn't do that", e.message); });
  }
  var joinReqs = [];
  function loadAdmin() {
    var list = $("#admin-list");
    if (!adminItems.length) list.innerHTML = "<li class='muted'>Loading…</li>";
    Promise.all([api({ action: "admin_list" }), api({ action: "join_requests" })]).then(function (rr) {
      var r = rr[0];
      if (!r.ok) throw new Error(r.error);
      adminItems = r.items || [];
      joinReqs = (rr[1] && rr[1].ok && rr[1].items) || [];
      renderAdmin(); loadAdminCounts();
    }).catch(function (e) { list.innerHTML = "<li class='muted'>Couldn't load: " + esc(e.message || "") + "</li>"; });
  }
  function renderAdmin() {
    var counts = { pending: 0, flagged: 0, live: 0, archived: 0 };
    adminItems.forEach(function (i) { counts[i.status]++; });
    counts.requests = joinReqs.length;
    $$("#admin-tabs .chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.t === adminTab);
      c.querySelector("b").textContent = counts[c.dataset.t] || 0;
    });
    $("#admin-kinds").hidden = adminTab === "requests";
    if (adminTab === "requests") {
      $("#admin-list").innerHTML = joinReqs.length ? joinReqs.map(function (q) {
        return "<li class='admin-item'><div class='ai-main'><span class='tag tag-type'>Join</span><b>" + esc(q.name) + "</b> → " + esc(q.crew) +
          "<div class='muted small'>asked " + esc(q.at) + "</div></div><div class='ai-btns'>" +
          "<button class='btn sm' data-manage='" + esc(q.crew_id) + "'>Open crew</button></div></li>";
      }).join("") : "<li class='muted'>No join requests.</li>";
      return;
    }
    // second row: what kind of post (counts are for the selected status)
    var inTab = adminItems.filter(function (i) { return i.status === adminTab; });
    var kc = { all: inTab.length, meet: 0, crew: 0, place: 0, edited: 0 };
    inTab.forEach(function (i) { kc[i.kind]++; if (i.edited) kc.edited++; });
    if (adminKind !== "all" && !kc[adminKind]) adminKind = "all";
    $$("#admin-kinds .chip").forEach(function (c) {
      var k = c.dataset.k;
      c.classList.toggle("active", k === adminKind);
      c.querySelector("b").textContent = kc[k];
      c.hidden = k === "edited" && !kc.edited;
    });
    var items = inTab.filter(function (i) { return adminKind === "all" || (adminKind === "edited" ? !!i.edited : i.kind === adminKind); });
    $("#admin-list").innerHTML = items.length ? items.map(function (i) {
      var btns = [];
      if (i.status === "pending") btns.push(["admin_approve", "Approve", "btn-accent"], ["admin_archive", "Archive", ""]);
      if (i.status === "live") btns.push(["admin_archive", "Archive", ""]);
      if (i.status === "archived") btns.push(["admin_restore", "Restore", ""]);
      if (i.status === "flagged") btns.push(["admin_restore", "Keep it", "btn-accent"], ["admin_archive", "Take down", ""]);
      btns.push(["admin_delete", "Delete", "btn-danger"]);
      var editBtn = (i.kind === "meet" && i.status === "archived")
        ? "<button class='btn sm btn-accent' data-edit='" + esc(i.id) + "' data-kind='meet' data-repost='1' title='Change the date and put it back on the map'>Repost…</button>"
        : "<button class='btn sm' data-edit='" + esc(i.id) + "' data-kind='" + esc(i.kind) + "'>Edit</button>";
      if (i.edited && i.status === "live") btns.unshift(["admin_reviewed", "Looks OK", ""]);
      var when = i.kind === "meet" && i.start ? (function () { var d = parseDate(i.start); return d ? fmtFull.format(d) : i.start; })() : "";
      return "<li class='admin-item'>" +
        "<div class='ai-main'><span class='tag tag-type'>" + esc(KIND_NAME[i.kind] || i.kind) + "</span>" +
        (i.edited ? "<span class='tag tag-edited' title='Changed by the poster'>Edited " + esc(i.edited) + "</span>" : "") + "<b>" + esc(i.label) + "</b>" +
        (i.reports && i.reports.length ? "<div class='ai-reports'>⚑ " + i.reports.length + " report" + (i.reports.length > 1 ? "s" : "") + ": " +
          esc(i.reports.join(" · ")) + "</div>" : "") +
        "<div class='muted'>" + esc([when, i.where].filter(Boolean).join(" · ")) + "</div>" +
        "<div class='muted small'>by " + esc(i.by || "—") + " · " + esc(i.submitted_at) +
        (i.lat !== "" && i.lat != null ? " · <a href='https://www.google.com/maps?q=" + esc(i.lat) + "," + esc(i.lng) + "' target='_blank' rel='noopener'>map</a>" : "") + "</div></div>" +
        "<div class='ai-btns'>" + editBtn + btns.map(function (b) {
          return "<button class='btn sm " + b[2] + "' data-admin-act='" + b[0] + "' data-kind='" + esc(i.kind) + "' data-id='" + esc(i.id) + "' data-label='" + esc(i.label) + "'>" + b[1] + "</button>";
        }).join("") + "</div></li>";
    }).join("") : "<li class='muted'>Nothing " + adminTab + (adminKind === "all" ? "" : " here") + ".</li>";
  }
  function openAdmin() {
    $("#acct-menu").hidden = true;
    $("#admin-panel").hidden = false; adminDirty = false;
    loadAdmin();
  }
  function closeAdmin() {
    $("#admin-panel").hidden = true;
    if (adminDirty) { toast("Refreshing the map…"); setTimeout(function () { location.reload(); }, 600); }
  }
  if (AUTH_ON) {
    $("#acct-admin").onclick = openAdmin;
    $$("[data-admin-close]").forEach(function (b) { b.onclick = closeAdmin; });
    $("#admin-panel").addEventListener("click", function (e) { if (e.target.id === "admin-panel") closeAdmin(); });
    $$("#admin-tabs .chip").forEach(function (c) { c.onclick = function () { adminTab = c.dataset.t; renderAdmin(); }; });
    $$("#admin-kinds .chip").forEach(function (c) { c.onclick = function () { adminKind = c.dataset.k; renderAdmin(); }; });
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-admin-act]"); if (!b) return;
      e.preventDefault(); e.stopPropagation(); adminDo(b);
    });
    BE.ready.then(loadRole);
  }

  /* ---------------- crews: members, join requests, crew admins ---------------- */
  var MY = {};            // crew_id -> { role, status, requests, name, logo }
  var crewBadge = 0, adminWaiting = 0;
  function updateBadge() {
    $("#acct-btn").classList.toggle("has-badge", authValid() && (crewBadge + adminWaiting) > 0);
    var ab = $("#acct-admin"); if (ab) ab.textContent = "Admin panel" + (adminWaiting ? " · " + adminWaiting : "");
  }
  function loadAdminCounts() {
    if (!ROLE.admin || !authValid()) { adminWaiting = 0; updateBadge(); return Promise.resolve(); }
    return api({ action: "admin_counts" }).then(function (r) {
      if (r && r.ok) { adminWaiting = r.pending + r.reported + r.requests; updateBadge(); }
    }).catch(function () {});
  }
  // Keep lists fresh without reloading the page: re-check when you come back to the
  // tab/app, and every 90 s while it's on screen. Only small counts/lists, never the whole map.
  var lastRefresh = 0;
  function refreshLive(force) {
    if (!AUTH_ON || !authValid() || document.visibilityState === "hidden") return;
    if (!force && Date.now() - lastRefresh < 20000) return;
    lastRefresh = Date.now();
    loadMyCrews();
    loadAdminCounts();
    if (!$("#crew-panel").hidden && panelCrew) loadCrewPanel();
    if (ROLE.admin && !$("#admin-panel").hidden) loadAdmin();
    if (!$("#acct-menu").hidden) loadMine();
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refreshLive(); });
  window.addEventListener("focus", function () { refreshLive(); });
  setInterval(function () { refreshLive(true); }, 90000);
  var MEMBERS_N = {};     // crew_id -> active member count
  if (BE) BE.memberCounts().then(function (n) { MEMBERS_N = n || {}; }).catch(function () {});
  function runsCrew(id) { var m = MY[id]; return !!(m && m.status === "active" && (m.role === "owner" || m.role === "admin")); }
  function memberOf(id) { var m = MY[id]; return !!(m && m.status === "active"); }
  function loadMyCrews() {
    if (!AUTH_ON || !authValid()) { MY = {}; renderMyCrews(); return Promise.resolve(); }
    return api({ action: "my_crews" }).then(function (r) {
      if (!r.ok) return;
      MY = {}; (r.items || []).forEach(function (x) { MY[x.crew_id] = x; });
      renderMyCrews(); updateVisibilityField();
    }).catch(function () {});
  }
  var ROLE_LABEL = { owner: "Owner", admin: "Crew admin", member: "Member" };
  function renderMyCrews() {
    var box = $("#acct-crews"), list = $("#acct-crew-list"); if (!box) return;
    var ids = Object.keys(MY);
    box.hidden = !ids.length;
    var badge = 0;
    list.innerHTML = ids.map(function (id) {
      var m = MY[id], c = crewById[id];
      badge += runsCrew(id) ? m.requests : 0;
      var tag = m.status === "pending" ? "<span class='tag tag-sample'>Requested</span>" : "<span class='tag tag-type'>" + esc(ROLE_LABEL[m.role] || m.role) + "</span>";
      return "<li class='my-post'><div class='mp-main'" + (c ? " data-goto-crew='" + esc(id) + "'" : "") + ">" + tag + esc(m.name) + "</div>" +
        "<div class='mp-btns'>" + (runsCrew(id) || ROLE.admin ? "<button class='btn sm" + (runsCrew(id) && m.requests ? " btn-accent" : "") + "' data-manage='" + esc(id) + "'>Manage" +
          (runsCrew(id) && m.requests ? " · " + m.requests : "") + "</button>" : "") + "</div></li>";
    }).join("");
    crewBadge = badge; updateBadge();
  }
  // Buttons under a crew in its map popup.
  function crewButtons(c) {
    if (c._src !== "sheet" || !AUTH_ON) return "";
    var n = MEMBERS_N[c.id] || 0, m = MY[c.id], id = esc(c.id), b = "";
    if (!authValid() || !m) b = "<button class='btn sm btn-accent' data-join='" + id + "'>Request to join</button>";
    else if (m.status === "pending") b = "<span class='muted small'>Request sent</span><button class='btn sm' data-leave='" + id + "' data-what='cancel'>Cancel</button>";
    else if (runsCrew(c.id)) b = "<button class='btn sm btn-accent' data-manage='" + id + "'>Manage crew" + (m.requests ? " · " + m.requests + " new" : "") + "</button>";
    else b = "<span class='tag tag-live'>✓ " + esc(ROLE_LABEL[m.role] || "Member") + "</span><button class='btn sm' data-leave='" + id + "' data-what='leave'>Leave</button>";
    if (ROLE.admin && !runsCrew(c.id)) b += "<button class='btn sm' data-manage='" + id + "'>Manage</button>";
    return "<div class='crew-btns'><span class='muted small'>👥 " + n + " member" + (n === 1 ? "" : "s") + "</span>" + b + "</div>";
  }
  document.addEventListener("click", function (e) {
    var j = e.target.closest("[data-join]"), l = e.target.closest("[data-leave]"), mg = e.target.closest("[data-manage]");
    if (!j && !l && !mg) return;
    e.preventDefault(); e.stopPropagation();
    if (!authValid()) { toast("Sign in first", "Tap the account button at the top right, then ask to join."); return; }
    if (mg) { openCrewPanel(mg.dataset.manage); return; }
    if (j) {
      j.disabled = true;
      api({ action: "join_crew", crew_id: j.dataset.join }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        toast(r.status === "active" ? "You're in ✅" : "Request sent ✅", r.status === "active" ? "" : "The crew's admins (or the site admin) will accept it.", 5000);
        return loadMyCrews();
      }).then(function () { map.closePopup(); }).catch(function (err) { j.disabled = false; toast("Couldn't send", err.message); });
      return;
    }
    if (!l.classList.contains("confirm")) {
      l.classList.add("confirm"); l.dataset.txt = l.textContent; l.textContent = l.dataset.what === "cancel" ? "Tap again to cancel" : "Tap again to leave";
      setTimeout(function () { if (l.isConnected) { l.classList.remove("confirm"); l.textContent = l.dataset.txt; } }, 4000);
      return;
    }
    l.disabled = true;
    api({ action: "leave_crew", crew_id: l.dataset.leave }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      toast(l.dataset.what === "cancel" ? "Request cancelled" : "You left the crew");
      var hadCrewOnly = EVENTS.some(function (x) { return x.host === l.dataset.leave && x.visibility === "crew"; });
      return loadMyCrews().then(function () { map.closePopup(); if (hadCrewOnly) setTimeout(function () { location.reload(); }, 800); });
    }).catch(function (err) { l.disabled = false; toast("Couldn't do that", err.message); });
  });

  // ---- Manage crew panel ----
  var panelCrew = null, crewDirty = false;
  function openCrewPanel(id) {
    panelCrew = id; crewDirty = false;
    $("#acct-menu").hidden = true; map.closePopup();
    if (!$("#admin-panel").hidden) $("#admin-panel").hidden = true;  // keep adminDirty
    var c = crewById[id];
    $("#crew-panel-title").textContent = c ? c.name : (MY[id] && MY[id].name) || "Crew";
    $("#crew-panel").hidden = false;
    loadCrewPanel();
  }
  function closeCrewPanel() {
    $("#crew-panel").hidden = true; panelCrew = null;
    if (crewDirty) { toast("Refreshing the map…"); setTimeout(function () { location.reload(); }, 600); }
  }
  function loadCrewPanel() {
    var id = panelCrew; if (!id) return;
    $("#crew-panel-body").innerHTML = "<p class='muted'>Loading…</p>";
    api({ action: "crew_panel", crew_id: id }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      if (panelCrew === id) renderCrewPanel(id, r);
    }).catch(function (e) { $("#crew-panel-body").innerHTML = "<p class='muted'>Couldn't load: " + esc(e.message || "") + "</p>"; });
  }
  function renderCrewPanel(id, r) {
    var mine = MY[id] || {}, iOwn = mine.status === "active" && mine.role === "owner";
    var site = ROLE.admin, canMembers = runsCrew(id) || site;
    var hasOwner = r.members.some(function (m) { return m.role === "owner" && m.status === "active"; });
    var me = auth && auth.id;
    var av = function (m) { return m.avatar ? "<img src='" + esc(m.avatar) + "' alt='' referrerpolicy='no-referrer'>" : "<b>" + esc(initials(m.name || "?")) + "</b>"; };
    var btn = function (act, uidv, label, cls) {
      return "<button class='btn sm " + (cls || "") + "' data-mact='" + act + "' data-uid='" + esc(uidv) + "'>" + label + "</button>";
    };
    var pending = r.members.filter(function (m) { return m.status === "pending"; });
    var active = r.members.filter(function (m) { return m.status === "active"; });
    var rank = { owner: 0, admin: 1, member: 2 };
    active.sort(function (a, b) { return rank[a.role] - rank[b.role]; });
    var h = "";
    if (!hasOwner) h += "<p class='crew-note'>This crew has no leader yet. When its leader asks to join, tap <b>Accept as owner</b>.</p>";
    h += "<div class='crew-actions'>" +
      (canMembers ? "<button class='btn sm btn-accent' data-crew-newmeet='" + esc(id) + "'>+ Crew meet</button>" : "") +
      (canMembers ? "<button class='btn sm' data-edit='" + esc(id) + "' data-kind='crew'>Edit crew details</button>" : "") + "</div>";
    if (canMembers) {
      h += "<h5>Join requests <b>" + pending.length + "</b></h5>";
      h += pending.length ? "<ul class='member-list'>" + pending.map(function (m) {
        return "<li><span class='mav'>" + av(m) + "</span><a href='#' class='mname' data-profile='" + esc(m.user_id) + "'>" + esc(m.name) + "<small>asked " + esc(m.since.slice(0, 10)) + "</small></a><span class='mbtns'>" +
          (site && !hasOwner ? btn("make_owner", m.user_id, "Accept as owner", "btn-accent") + btn("accept", m.user_id, "Accept as member", "") : btn("accept", m.user_id, "Accept", "btn-accent")) +
          btn("decline", m.user_id, "Decline", "btn-danger") + "</span></li>";
      }).join("") + "</ul>" : "<p class='muted small'>No one waiting.</p>";
    }
    h += "<h5>Members <b>" + active.length + "</b></h5><ul class='member-list'>" + active.map(function (m) {
      var b = "";
      if (canMembers && m.user_id !== me && m.role !== "owner") {
        if (m.role === "member") b += btn("promote", m.user_id, "Make admin", "");
        if (m.role === "admin" && (iOwn || site)) b += btn("demote", m.user_id, "Make member", "");
        if (m.role === "member" || iOwn || site) b += btn("remove", m.user_id, "Remove", "btn-danger");
      }
      if (site && m.role !== "owner") b += btn("make_owner", m.user_id, "Make owner", "");
      return "<li><span class='mav'>" + av(m) + "</span><a href='#' class='mname' data-profile='" + esc(m.user_id) + "'>" + esc(m.name) + (m.user_id === me ? " <small>(you)</small>" : "") + "</a>" +
        "<span class='tag " + (m.role === "member" ? "tag-sample" : "tag-type") + "'>" + esc(ROLE_LABEL[m.role]) + "</span><span class='mbtns'>" + b + "</span></li>";
    }).join("") + (active.length ? "" : "<li class='muted small'>No members yet.</li>") + "</ul>";
    if (canMembers) {
      h += "<h5>Crew meets</h5>";
      h += r.meets.length ? "<ul class='member-list'>" + r.meets.map(function (m) {
        var d = parseDate(m.start), st = { pending: "Pending", live: "Live", archived: "Archived", flagged: "Reported" }[m.status] || m.status;
        var b = "";
        if (m.status === "pending") b += "<button class='btn sm btn-accent' data-cmeet='admin_approve' data-id='" + esc(m.id) + "'>Approve</button>";
        if (m.status !== "flagged") b += "<button class='btn sm' data-edit='" + esc(m.id) + "' data-kind='meet'>Edit</button>";
        if (m.status === "live" || m.status === "pending") b += "<button class='btn sm' data-cmeet='admin_archive' data-id='" + esc(m.id) + "'>Archive</button>";
        b += "<button class='btn sm btn-danger' data-cmeet='admin_delete' data-id='" + esc(m.id) + "'>Delete</button>";
        return "<li><span class='mname'>" + esc(m.title) + "<small>" + esc(d ? fmtFull.format(d) : "") + (m.by ? " · by " + esc(m.by) : "") + "</small></span>" +
          "<span class='tag " + (m.status === "live" ? "tag-live" : "tag-sample") + "'>" + st + "</span>" +
          (m.visibility === "crew" ? "<span class='tag tag-type'>Crew only</span>" : "") + "<span class='mbtns'>" + b + "</span></li>";
      }).join("") + "</ul>" : "<p class='muted small'>No meets yet.</p>";
    }
    if (!canMembers) h += "<p class='muted small'>Only the crew's owner and admins can manage it.</p>";
    $("#crew-panel-body").innerHTML = h;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mact]"), cm = e.target.closest("[data-cmeet]"), nm = e.target.closest("[data-crew-newmeet]");
    if (!b && !cm && !nm) return;
    e.preventDefault(); e.stopPropagation();
    if (nm) {
      var cid = nm.dataset.crewNewmeet;
      $("#crew-panel").hidden = true; crewDirty = false; panelCrew = null;
      openModal(); showKind("meet");
      form.elements.host.value = cid;
      form.elements.visibility.value = memberOf(cid) ? "crew" : "public";
      updateVisibilityField();
      return;
    }
    var el = b || cm, danger = /remove|decline|admin_delete/.test(b ? b.dataset.mact : cm.dataset.cmeet);
    if (danger && !el.classList.contains("confirm")) {
      el.classList.add("confirm"); el.dataset.txt = el.textContent; el.textContent = "Tap again";
      setTimeout(function () { if (el.isConnected) { el.classList.remove("confirm"); el.textContent = el.dataset.txt; } }, 4000);
      return;
    }
    el.disabled = true;
    var req = b ? { action: "member", act: b.dataset.mact, crew_id: panelCrew, user_id: b.dataset.uid }
                : { action: cm.dataset.cmeet, kind: "meet", id: cm.dataset.id };
    api(req).then(function (r) {
      if (!r.ok) throw new Error(r.error || "Not allowed");
      crewDirty = crewDirty || !!cm || (b && b.dataset.uid === (auth && auth.id));
      var done = { accept: "Accepted", decline: "Declined", remove: "Removed", promote: "Now a crew admin", demote: "Now a member",
                   make_owner: "Now the owner", admin_approve: "Approved", admin_archive: "Archived", admin_delete: "Deleted" }[b ? b.dataset.mact : cm.dataset.cmeet];
      toast(done || "Done");
      loadMyCrews(); loadCrewPanel();
      if (ROLE.admin && !$("#admin-panel").hidden) loadAdmin();
    }).catch(function (err) { el.disabled = false; el.classList.remove("confirm"); if (el.dataset.txt) el.textContent = el.dataset.txt; toast("Couldn't do that", err.message); });
  });
  if (AUTH_ON) {
    $$("[data-crew-close]").forEach(function (b) { b.onclick = closeCrewPanel; });
    $("#crew-panel").addEventListener("click", function (e) { if (e.target.id === "crew-panel") closeCrewPanel(); });
    BE.ready.then(loadMyCrews);   // after the saved sign-in is restored (not just when Google's script loads)
  }

  // "Who can see it" on the meet form. Crew-only needs a host crew you're a member of:
  // picking "Crew members only" fills in your crew as host (your first one if you have several).
  function myMemberCrews() { return Object.keys(MY).filter(memberOf); }
  function updateVisibilityField(changed) {
    var sel = form && form.elements.visibility; if (!sel) return;
    var hostSel = form.elements.host, opt = sel.querySelector("option[value=crew]");
    var mine = myMemberCrews();
    opt.disabled = !mine.length;
    opt.textContent = mine.length ? "Crew members only" : "Crew members only (join a crew first)";
    if (sel.value === "crew" && !memberOf(hostSel.value)) {
      if (changed === "visibility" && mine.length) hostSel.value = mine[0];   // chose crew-only: host = your crew
      else sel.value = "public";                                              // changed host to a crew you're not in
    }
    var host = hostSel.value, hostName = (crewById[host] || MY[host] || {}).name || "this crew";
    $("#vis-hint").textContent = sel.value === "crew"
      ? "Only members of " + hostName + " will see it." + (mine.length > 1 ? " Change the host crew above to pick another of your crews." : "")
      : (!mine.length ? "Join a crew to post meets only its members can see." : "");
  }

  /* ---------------- profiles, My Garage, "Pulling up", badges ---------------- */
  var MYRSVP = {};      // meet id -> car id ("" = no car) for meets you're pulling up to
  var MYCARS = null;    // your cars (loaded with your profile / when choosing a car)
  var FOUNDING_BEFORE = new Date("2027-03-01T00:00:00+08:00");
  var KIND_LABEL = { daily: "Daily", project: "Project", track: "Track", show: "Show car", other: "Other" };
  function carName(c) { return [c.year, c.make, c.model].filter(Boolean).join(" "); }
  function loadMyRsvps() {
    if (!AUTH_ON || !authValid()) { MYRSVP = {}; return Promise.resolve(); }
    return api({ action: "my_rsvps" }).then(function (r) { if (r && r.ok) { MYRSVP = r.items; renderMeets(); } }).catch(function () {});
  }
  function loadMyCars() {
    if (MYCARS || !authValid()) return Promise.resolve(MYCARS || []);
    return BE.profile({}).then(function (r) { MYCARS = r && r.ok ? r.cars : []; return MYCARS; });
  }
  function meetOver(e) { return e.endD && e.endD.getTime() < Date.now(); }
  function rsvpBlock(e) {
    if (e._src !== "sheet" || !BE) return "";
    var n = GOING[e.id] || 0, mine = MYRSVP[e.id] !== undefined, over = meetOver(e), id = esc(e.id);
    var h = "<div class='rsvp' data-rsvp-box='" + id + "'><div class='rsvp-top'>" +
      "<span class='rsvp-n'>🚗 <b>" + n + "</b> " + (over ? "pulled up" : "pulling up") + "</span>" +
      (n ? "<a href='#' data-going='" + id + "'>See who</a>" : "") + "</div>";
    if (!over) h += mine
      ? "<button class='btn sm btn-accent rsvp-btn' data-unrsvp='" + id + "'>✓ You're pulling up</button>"
      : "<button class='btn sm rsvp-btn' data-rsvp='" + id + "'>I'm pulling up</button>";
    return h + "<div class='rsvp-extra'></div></div>";
  }
  function refreshRsvpBox(id) {
    var e = eventById[id], box = document.querySelector("[data-rsvp-box='" + id + "']");
    if (e && box) box.outerHTML = rsvpBlock(e);
    renderMeets();
  }
  function sendRsvp(id, carId) {
    return api({ action: "rsvp", meet_id: id, car_id: carId || null }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      if (MYRSVP[id] === undefined) GOING[id] = (GOING[id] || 0) + 1;
      MYRSVP[id] = carId || "";
      refreshRsvpBox(id);
      toast("See you there 🚗", "Tap 🔔 Remind me so you don't miss it.", 3500);
    });
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-rsvp],[data-unrsvp],[data-rsvp-car],[data-going],[data-profile]");
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.dataset.profile) { openProfile(t.dataset.profile); return; }
    if (t.dataset.going) {
      var box = t.closest("[data-rsvp-box]").querySelector(".rsvp-extra");
      if (box.dataset.open === "going") { box.innerHTML = ""; box.dataset.open = ""; return; }
      box.dataset.open = "going"; box.innerHTML = "<span class='muted small'>Loading…</span>";
      BE.going({ meet_id: t.dataset.going }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        box.innerHTML = r.items.length ? "<ul class='going-list'>" + r.items.map(function (g) {
          return "<li><a href='#' data-profile='" + esc(g.user_id) + "'><span class='mav sm'>" +
            (g.avatar ? "<img src='" + esc(g.avatar) + "' alt='' referrerpolicy='no-referrer'>" : "<b>" + esc(initials(g.name)) + "</b>") +
            "</span>" + esc(g.name) + "</a>" + (g.car ? "<small>" + esc(g.car) + "</small>" : "") + "</li>";
        }).join("") + "</ul>" : "<span class='muted small'>No one yet.</span>";
      }).catch(function (e) { box.innerHTML = "<span class='muted small'>" + esc(e.message || "Couldn't load") + "</span>"; });
      return;
    }
    if (!authValid()) { toast("Sign in first", "Tap the account button at the top right."); return; }
    var id = t.dataset.rsvp || t.dataset.unrsvp || t.dataset.rsvpCar;
    if (t.dataset.unrsvp) {
      if (!t.classList.contains("confirm")) {
        t.classList.add("confirm"); t.textContent = "Tap again to cancel";
        setTimeout(function () { if (t.isConnected) { t.classList.remove("confirm"); t.textContent = "✓ You're pulling up"; } }, 4000);
        return;
      }
      t.disabled = true;
      api({ action: "unrsvp", meet_id: id }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        delete MYRSVP[id]; GOING[id] = Math.max(0, (GOING[id] || 1) - 1); refreshRsvpBox(id);
      }).catch(function (e) { t.disabled = false; toast("Couldn't cancel", e.message); });
      return;
    }
    if (t.dataset.rsvpCar !== undefined) {   // picked a car
      t.closest(".rsvp-extra").querySelectorAll("button").forEach(function (b) { b.disabled = true; });
      sendRsvp(id, t.dataset.car).catch(function (e) { toast("Couldn't save", e.message); refreshRsvpBox(id); });
      return;
    }
    // "I'm pulling up": ask which car if you have more than one
    t.disabled = true;
    loadMyCars().then(function (cars) {
      if (cars.length <= 1) return sendRsvp(id, cars[0] ? cars[0].id : "");
      var box = t.closest("[data-rsvp-box]").querySelector(".rsvp-extra");
      box.dataset.open = "cars";
      box.innerHTML = "<span class='muted small'>Bringing which car?</span><div class='rsvp-cars'>" + cars.map(function (c) {
        return "<button class='btn sm' data-rsvp-car='" + esc(id) + "' data-car='" + esc(c.id) + "'>" + esc(c.nickname || carName(c)) + "</button>";
      }).join("") + "<button class='btn sm' data-rsvp-car='" + esc(id) + "' data-car=''>Not sure yet</button></div>";
    }).catch(function (e) { t.disabled = false; toast("Couldn't save", e.message); });
  });

  // ---- profile panel ----
  var profileId = null;
  function openProfile(id) {
    profileId = id || (auth && auth.id);
    if (!profileId) return;
    $("#acct-menu").hidden = true; map.closePopup();
    ["#crew-panel", "#admin-panel"].forEach(function (s) { if (!$(s).hidden) $(s).hidden = true; });
    $("#profile-panel").hidden = false;
    $("#profile-body").innerHTML = "<p class='muted'>Loading…</p>";
    BE.profile({ user_id: profileId }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      if (r.me) MYCARS = r.cars;
      renderProfile(r);
    }).catch(function (e) { $("#profile-body").innerHTML = "<p class='muted'>Couldn't load: " + esc(e.message || "") + "</p>"; });
  }
  function badgesFor(r) {
    var b = [], st = r.stats;
    if (r.profile.admin) b.push(["⭐", "Street Archive admin"]);
    if (new Date(r.profile.joined) < FOUNDING_BEFORE) b.push(["🏁", "Founding member"]);
    if (r.crews.some(function (c) { return c.role === "owner"; })) b.push(["👑", "Crew owner"]);
    else if (r.crews.some(function (c) { return c.role === "admin"; })) b.push(["🛡️", "Crew admin"]);
    if (r.crews.some(function (c) { return c.verified; })) b.push(["✔", "Verified crew"]);
    if (st.posted >= 5) b.push(["🎤", "Organizer · 5+ meets"]); else if (st.posted >= 1) b.push(["📣", "Meet host"]);
    if (st.attended >= 10) b.push(["🏆", "Veteran · 10+ meets"]); else if (st.attended >= 5) b.push(["🔥", "Regular · 5+ meets"]); else if (st.attended >= 1) b.push(["🚗", "First meet"]);
    if (st.cars >= 3) b.push(["🔧", "Collector · 3+ cars"]); else if (st.cars >= 1) b.push(["🔧", "Garage"]);
    return b;
  }
  function renderProfile(r) {
    var p = r.profile, h = "";
    var joined = new Date(p.joined), link = safeUrl(p.link);
    h += "<div class='prof-head'><span class='mav lg'>" + (p.avatar ? "<img src='" + esc(p.avatar) + "' alt='' referrerpolicy='no-referrer'>" : "<b>" + esc(initials(p.name || "?")) + "</b>") + "</span>" +
      "<div><h2>" + esc(p.name || "Member") + "</h2><div class='muted small'>Member since " + esc(fmtMon.format(joined)) + " " + joined.getFullYear() +
      " · " + r.stats.attended + " meet" + (r.stats.attended === 1 ? "" : "s") + " attended</div>" +
      (link ? "<a class='prof-link' href='" + esc(link) + "' target='_blank' rel='noopener'>" + esc(link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + " ↗</a>" : "") + "</div></div>";
    var badges = badgesFor(r);
    if (badges.length) h += "<div class='badges'>" + badges.map(function (x) { return "<span class='badge-chip' title='" + esc(x[1]) + "'>" + x[0] + " " + esc(x[1]) + "</span>"; }).join("") + "</div>";
    if (p.bio) h += "<p class='prof-bio'>" + esc(p.bio).replace(/\n/g, "<br>") + "</p>";
    if (r.me) h += "<div class='crew-actions'><button class='btn sm' data-prof-edit>Edit profile</button><button class='btn sm btn-accent' data-car-new>+ Add a car</button></div>";
    // crews
    h += "<h5>Crews <b>" + r.crews.length + "</b></h5>";
    h += r.crews.length ? "<div class='prof-crews'>" + r.crews.map(function (c) {
      return "<a href='#' class='prof-crew' data-goto-crew='" + esc(c.id) + "' style='--c:" + esc(c.color || "#ffd400") + "'>" +
        (c.logo ? "<img src='" + esc(goodLogo(c.logo) || "") + "' alt=''>" : "") + "<span>" + esc(c.name) + (c.verified ? " <span class='verified'>✔</span>" : "") +
        "<small>" + esc(ROLE_LABEL[c.role] || "Member") + "</small></span></a>";
    }).join("") + "</div>" : "<p class='muted small'>" + (r.me ? "Not in a crew yet — open a crew on the map and tap Request to join." : "Not in a crew yet.") + "</p>";
    // garage
    h += "<h5>Garage <b>" + r.cars.length + "</b></h5>";
    h += r.cars.length ? "<div class='garage'>" + r.cars.map(function (c) {
      return "<div class='car-card'>" + (c.photo_url ? "<img src='" + esc(c.photo_url) + "' alt='' loading='lazy'>" : "<div class='car-ph'>🚗</div>") +
        "<div class='car-meta'><b>" + esc(c.nickname || carName(c)) + "</b>" + (c.nickname ? "<small>" + esc(carName(c)) + "</small>" : "") +
        "<span class='tag tag-type'>" + esc(KIND_LABEL[c.kind] || c.kind) + "</span>" +
        (c.mods ? "<p>" + esc(c.mods).replace(/\n/g, "<br>") + "</p>" : "") +
        (r.me ? "<div class='mbtns'><button class='btn sm' data-car-edit='" + esc(c.id) + "'>Edit</button><button class='btn sm btn-danger' data-car-del='" + esc(c.id) + "'>Remove</button></div>" : "") +
        "</div></div>";
    }).join("") + "</div>" : "<p class='muted small'>" + (r.me ? "Show off your build — tap + Add a car." : "No cars added yet.") + "</p>";
    // meets
    if (r.me && r.going.length) {
      h += "<h5>Pulling up to</h5><ul class='member-list'>" + r.going.map(function (m) {
        var d = parseDate(m.start);
        return "<li><a href='#' class='mname' data-goto-meet='" + esc(m.id) + "'>" + esc(m.title) + "<small>" + esc(d ? fmtFull.format(d) : "") + "</small></a></li>";
      }).join("") + "</ul>";
    }
    if (r.meets.length) {
      h += "<h5>Upcoming meets they're hosting</h5><ul class='member-list'>" + r.meets.map(function (m) {
        var d = parseDate(m.start);
        return "<li><a href='#' class='mname' data-goto-meet='" + esc(m.id) + "'>" + esc(m.title) + "<small>" + esc(d ? fmtFull.format(d) : "") + "</small></a>" +
          (m.visibility === "crew" ? "<span class='tag tag-type'>Crew only</span>" : "") + "</li>";
      }).join("") + "</ul>";
    }
    $("#profile-title").textContent = r.me ? "My profile" : "Profile";
    $("#profile-body").innerHTML = h;
    $("#profile-body").dataset.json = JSON.stringify({ name: p.name, bio: p.bio, link: p.link });
  }
  function closeProfile() { $("#profile-panel").hidden = true; profileId = null; }
  // jump to a meet / crew from a profile
  $("#profile-panel").addEventListener("click", function (e) {
    if (e.target.id === "profile-panel") { closeProfile(); return; }
    if (e.target.closest("[data-goto-meet],[data-goto-crew]")) closeProfile();
  }, true);

  // edit profile (inline form)
  document.addEventListener("click", function (e) {
    var ed = e.target.closest("[data-prof-edit]"), sv = e.target.closest("[data-prof-save]"), cn = e.target.closest("[data-prof-cancel]");
    if (!ed && !sv && !cn) return;
    e.preventDefault();
    if (cn) { openProfile(profileId); return; }
    if (ed) {
      var cur = JSON.parse($("#profile-body").dataset.json || "{}");
      $("#profile-body").innerHTML = "<form id='prof-form' class='prof-form'>" +
        "<label>Name<input name='name' maxlength='40' value='" + esc(cur.name || "") + "'></label>" +
        "<label>Bio <span class='muted'>(optional)</span><textarea name='bio' rows='3' maxlength='300' placeholder='Your build, your crew, what you drive…'>" + esc(cur.bio || "") + "</textarea></label>" +
        "<label>Instagram / FB / TikTok <span class='muted'>(optional)</span><input name='link' maxlength='200' placeholder='@yourhandle or https://…' value='" + esc(cur.link || "") + "'></label>" +
        "<p class='muted small'>Your email is never shown. Your photo comes from your Google account.</p>" +
        "<div class='modal-actions'><button type='button' class='btn' data-prof-cancel>Cancel</button><button type='button' class='btn btn-accent' data-prof-save>Save</button></div></form>";
      return;
    }
    var f = $("#prof-form"); sv.disabled = true;
    api({ action: "save_profile", name: f.elements.name.value, bio: f.elements.bio.value, link: f.elements.link.value }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      toast("Profile saved ✅");
      if (auth) { auth.name = f.elements.name.value.trim(); renderAccount(); }
      openProfile(profileId);
    }).catch(function (err) { sv.disabled = false; toast("Couldn't save", err.message); });
  });

  // ---- car form (add / edit) ----
  var carEditing = null, carBlob = null;
  function openCarForm(car) {
    carEditing = car || null; carBlob = null;
    var f = $("#car-form"); f.reset();
    $("#car-title").textContent = car ? "Edit car" : "Add a car";
    if (car) ["year", "make", "model", "nickname", "kind", "mods"].forEach(function (k) { f.elements[k].value = car[k] == null ? "" : car[k]; });
    var prev = $("#car-preview");
    prev.innerHTML = car && car.photo_url ? "<img src='" + esc(car.photo_url) + "' alt=''>" : "";
    $("#car-photo-note").textContent = car && car.photo_url ? "Pick a new photo to replace it." : "One photo — it's shrunk on your phone before uploading.";
    $("#car-panel").hidden = false;
  }
  function closeCarForm() { $("#car-panel").hidden = true; carEditing = null; carBlob = null; }
  // shrink a photo on the device: max 1280 px, JPEG, under ~450 KB
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(u);
        var max = 1280, w = img.naturalWidth, h = img.naturalHeight;
        function attempt(maxSide, q) {
          var k = Math.min(1, maxSide / Math.max(w, h)), c = document.createElement("canvas");
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) {
            if (!b) return reject(new Error("Couldn't read that photo."));
            if (b.size > 450 * 1024 && (q > 0.5 || maxSide > 800)) return attempt(q > 0.5 ? maxSide : Math.round(maxSide * 0.8), q > 0.5 ? q - 0.1 : q);
            resolve(b);
          }, "image/jpeg", q);
        }
        attempt(max, 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error("That file doesn't look like a photo (try a JPG or PNG).")); };
      img.src = u;
    });
  }
  $("#car-photo").addEventListener("change", function () {
    var file = this.files && this.files[0]; if (!file) return;
    $("#car-photo-note").textContent = "Preparing photo…";
    shrinkImage(file).then(function (b) {
      carBlob = b;
      $("#car-preview").innerHTML = "<img src='" + URL.createObjectURL(b) + "' alt=''>";
      $("#car-photo-note").textContent = "Ready · " + Math.round(b.size / 1024) + " KB";
    }).catch(function (e) { carBlob = null; $("#car-photo-note").textContent = e.message; });
  });
  $("#car-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, btn = $("#car-save");
    if (!f.elements.make.value.trim()) { toast("Add the make", "e.g. Honda, Toyota, Mitsubishi"); return; }
    btn.disabled = true; btn.textContent = carBlob ? "Uploading photo…" : "Saving…";
    var up = carBlob ? api({ action: "upload_car_photo", blob: carBlob }) : Promise.resolve({ ok: true, url: carEditing ? carEditing.photo_url : "" });
    up.then(function (r) {
      if (!r.ok) throw new Error(r.error || "Photo upload failed");
      btn.textContent = "Saving…";
      return api({ action: "save_car", id: carEditing && carEditing.id, year: f.elements.year.value, make: f.elements.make.value, model: f.elements.model.value,
                   nickname: f.elements.nickname.value, kind: f.elements.kind.value, mods: f.elements.mods.value,
                   photo_url: r.url || "", old_photo: carEditing ? carEditing.photo_url : "" });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      toast(carEditing ? "Car updated ✅" : "Added to your garage 🚗");
      closeCarForm(); MYCARS = null; openProfile(auth && auth.id);
    }).catch(function (err) { toast("Couldn't save", err.message); })
      .then(function () { btn.disabled = false; btn.textContent = "Save"; });
  });
  document.addEventListener("click", function (e) {
    var nw = e.target.closest("[data-car-new]"), ed = e.target.closest("[data-car-edit]"), dl = e.target.closest("[data-car-del]"), cl = e.target.closest("[data-car-close]");
    if (!nw && !ed && !dl && !cl) return;
    e.preventDefault();
    if (cl) { closeCarForm(); return; }
    if (nw) { openCarForm(null); return; }
    var id = (ed || dl).dataset.carEdit || (ed || dl).dataset.carDel;
    var car = (MYCARS || []).filter(function (c) { return c.id === id; })[0];
    if (ed) { if (car) openCarForm(car); return; }
    if (!dl.classList.contains("confirm")) {
      dl.classList.add("confirm"); dl.textContent = "Tap again";
      setTimeout(function () { if (dl.isConnected) { dl.classList.remove("confirm"); dl.textContent = "Remove"; } }, 4000);
      return;
    }
    dl.disabled = true;
    api({ action: "delete_car", id: id }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      toast("Removed from your garage"); MYCARS = null; openProfile(auth && auth.id);
    }).catch(function (err) { dl.disabled = false; toast("Couldn't remove", err.message); });
  });
  if (AUTH_ON) {
    $$("[data-profile-close]").forEach(function (b) { b.onclick = closeProfile; });
    $("#car-panel").addEventListener("click", function (e) { if (e.target.id === "car-panel") closeCarForm(); });
    $("#acct-profile").onclick = function () { openProfile(auth && auth.id); };
    BE.ready.then(loadMyRsvps);
  }

  /* ---------------- submit modal ---------------- */
  var modal = $("#modal"), form = $("#submit-form"), kind = "meet", picked = null, pickMarker = null;
  $("#host-select").innerHTML = "<option value=''>— Open / independent —</option>" +
    CREWS.map(function (c) { return "<option value='" + esc(c.id) + "'>" + esc(c.name) + "</option>"; }).join("");

  form.elements.host.addEventListener("change", function () { updateVisibilityField("host"); });
  form.elements.visibility.addEventListener("change", function () { updateVisibilityField("visibility"); });
  function openModal() { if (editing) { editing = null; form.reset(); renderTagChips(); picked = null; $("#pick-coords").textContent = "No location yet"; } setFormMode(false); updateVisibilityField();
    if (authValid()) loadMyCrews();   // pick up crews you joined since the page loaded
    modal.hidden = false; updateGate(); resetDates(); }
  function closeModal() {
    if (editing && adminDirty) { setTimeout(function () { location.reload(); }, 300); }
    modal.hidden = true; modal.classList.remove("picking"); $("#pick-hint").hidden = true; map.off("click", onPick);
    map.getContainer().classList.remove("picking-map");
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  }
  $("#btn-submit").onclick = openModal;
  $$("[data-close]", modal).forEach(function (b) { b.onclick = closeModal; });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  $$(".seg-btn").forEach(function (b) {
    b.onclick = function () { showKind(b.dataset.kind); $("#out").hidden = true; };
  });

  /* ---------------- edit a post (poster or admin; reuses the submit form) ---------------- */
  var editing = null; // { kind, id, repost } while editing an existing post
  var KIND_NAME = { meet: "meet", crew: "crew", place: "shop" };
  function setFormMode(edit, k) {
    $("#modal-title").textContent = edit ? "Edit " + KIND_NAME[k || "meet"] : "Put it on the map";
    $(".seg").hidden = !!edit;
    $$(".only-sheet").forEach(function (el) { el.hidden = true; });
    $("#submit-go").textContent = edit ? "Save changes" : (API ? "Submit for approval" : "Generate entry");
  }
  function showKind(k) {
    kind = k;
    $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.kind === k); });
    $(".kind-meet").hidden = k !== "meet"; $(".kind-crew").hidden = k !== "crew"; $(".kind-place").hidden = k !== "place";
  }
  function openEdit(k, id, repost) {
    if (!authValid()) { toast("Please sign in again"); return; }
    $("#acct-menu").hidden = true;
    if (!$("#admin-panel").hidden) $("#admin-panel").hidden = true; // keep adminDirty so the map refreshes after
    $("#crew-panel").hidden = true;
    map.closePopup();
    toast("Opening…", "", 1200);
    api({ action: "get", kind: k, id: id }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "Couldn't load it");
      fillEdit(r.item, !!repost);
    }).catch(function (e) { toast("Couldn't open that post", e.message); });
  }
  function fillEdit(m, repost) {
    form.reset(); $("#out").hidden = true;
    editing = { kind: m.kind, id: m.id, repost: repost };
    showKind(m.kind);
    setFormMode(true, m.kind);
    var set = function (n, v) { var el = form.elements[n]; if (el) el.value = v == null ? "" : v; };
    if (m.kind === "meet") {
      var hostSel = $("#host-select");
      if (m.host && !hostSel.querySelector("option[value='" + m.host.replace(/'/g, "") + "']")) {
        var o = document.createElement("option"); o.value = m.host; o.textContent = m.host; hostSel.appendChild(o);
      }
      set("title", m.title); set("type", m.type || "meet"); set("host", m.host || "");
      set("start_date", (m.start || "").slice(0, 10)); set("start_time", (m.start || "").slice(11, 16));
      set("end_date", (m.end || "").slice(0, 10)); set("end_time", (m.end || "").slice(11, 16));
      set("place", m.place); set("details", m.details); set("link", m.link);
      set("visibility", m.visibility || "public"); updateVisibilityField();
      $$("#submit-form input[type=date]").forEach(function (d) { d.min = ""; }); // past/ongoing meets are editable
    } else if (m.kind === "crew") {
      set("name", m.name); set("area", m.area); set("color", m.color || "#ff3b3b"); set("radius", m.radius || 3);
      set("logo", (m.logo || "").replace(/^club_logos\//, "")); set("pagelink", m.link); set("tags", m.tags);
    } else {
      set("pname", m.name); set("pcategory", m.category || "mechanic"); renderTagChips();
      $$("#ptag-chips input").forEach(function (i) { i.checked = (m.tags || []).indexOf(i.value) > -1; });
      set("parea", m.area); set("hours", m.hours); set("phone", m.phone); set("plink", m.link); set("pdetails", m.details);
    }
    picked = (m.coords && isFinite(m.coords[0]) && m.coords[0] !== null) ? [m.coords[0], m.coords[1]] : null;
    if (picked) setPin(picked);
    $("#pick-coords").textContent = picked ? picked.join(", ") + " (tap 📍 to move)" : "No location yet";
    if (repost) {
      $("#modal-title").textContent = "Repost meet";
      $("#submit-go").textContent = "Repost";
      // suggest a fresh date: same weekday/time, next occurrence from today
      var today = phTodayISO();
      if (form.elements.start_date.value < today) {
        var len = 0;
        if (m.end) { var sD = parseDate(m.start), eD = parseDate(m.end); if (sD && eD) len = Math.round((eD - sD) / 864e5); }
        form.elements.start_date.value = today;
        form.elements.end_date.value = len > 0 ? (function (d) { for (var k = 0; k < len; k++) d = addDay(d); return d; })(today) : "";
      }
      $$("#submit-form input[type=date]").forEach(function (d) { d.min = today; });
    }
    modal.hidden = false; updateGate(); updateDtHint();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openEdit(b.dataset.kind || "meet", b.dataset.edit, b.dataset.repost === "1");
  });
  // Delete your own post: tap once, then tap again to confirm.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!b.classList.contains("confirm")) {
      b.classList.add("confirm"); b.dataset.txt = b.textContent; b.textContent = "Tap again to delete";
      setTimeout(function () { if (b.isConnected) { b.classList.remove("confirm"); b.textContent = b.dataset.txt; } }, 4000);
      return;
    }
    b.disabled = true; b.textContent = "Deleting…";
    api({ action: "delete", kind: b.dataset.kind, id: b.dataset.del }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "Couldn't delete");
      toast("Deleted", "Refreshing the map…", 2500);
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (err) { b.disabled = false; b.classList.remove("confirm"); b.textContent = b.dataset.txt; toast("Couldn't delete", err.message); });
  });

  // Picking a spot: tap the map, drag the pin, search a place/address, paste
  // coordinates or a Google Maps link, or use the phone's GPS.
  var pickBefore = null;
  function setPin(ll, fly) {
    picked = [+(+ll[0]).toFixed(6), +(+ll[1]).toFixed(6)];
    if (pickMarker) pickMarker.setLatLng(picked);
    else {
      pickMarker = L.marker(picked, { draggable: true }).addTo(map);
      pickMarker.on("dragend", function () { var p = pickMarker.getLatLng(); setPin([p.lat, p.lng]); });
    }
    $("#pick-coords").textContent = picked.join(", ");
    if (fly) map.flyTo(picked, Math.max(map.getZoom(), 17));
    $("#pick-done").hidden = false;
    $("#pick-msg").textContent = "Pin set — drag it or tap the map to adjust";
  }
  function startPick() {
    pickBefore = picked ? picked.slice() : null;
    modal.classList.add("picking"); $("#pick-hint").hidden = false;
    $("#pick-done").hidden = !picked; $("#pick-results").hidden = true; $("#pick-q").value = "";
    $("#pick-msg").textContent = picked ? "Drag the pin or tap the map to move it" : "Search above, or tap the map to drop the pin";
    map.getContainer().classList.add("picking-map");
    map.on("click", onPick);
  }
  function onPick(e) { map.closePopup(); setPin([e.latlng.lat, e.latlng.lng]); }
  function endPick() {
    map.off("click", onPick);
    modal.classList.remove("picking"); $("#pick-hint").hidden = true;
    map.getContainer().classList.remove("picking-map");
  }
  // Coordinates or a Google Maps URL pasted in the box.
  function parseCoords(q) {
    var m = q.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || q.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
            q.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (!m) return null;
    var lat = +m[1], lng = +m[2];
    return (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? [lat, lng] : null;
  }
  function pickSearch() {
    var q = $("#pick-q").value.trim(), box = $("#pick-results");
    if (q.length < 2) return;
    var c = parseCoords(q);
    if (c) { box.hidden = true; setPin(c, true); return; }
    if (/goo\.gl|maps\.app/.test(q)) {
      $("#pick-msg").textContent = "Short Google links can't be read. In Google Maps, long-press the spot and copy the numbers (e.g. 14.5547, 121.0244) instead.";
      return;
    }
    $("#pick-msg").textContent = "Searching…";
    photon(q, function (pres) {
      if (pres && pres.length) { showPickResults(pres); $("#pick-msg").textContent = "Pick a result, then fine-tune the pin"; return; }
      nominatimPick(q);
    });
  }
  function nominatimPick(q) {
    var box = $("#pick-results");
    geocode(q, function (res) {
      if (res === null) { $("#pick-msg").textContent = "Search is busy — try again in a second."; return; }
      if (!res.length) { box.hidden = true; $("#pick-msg").textContent = "Nothing found. Try a street, barangay, mall or landmark nearby, then tap the map."; return; }
      box.innerHTML = "";
      res.forEach(function (p) {
        var parts = p.display_name.split(","), b = document.createElement("button");
        b.type = "button";
        b.innerHTML = "<b>" + esc(parts[0]) + "</b><span>" + esc(parts.slice(1, 4).join(",").trim()) + "</span>";
        b.onclick = function () { box.hidden = true; setPin([+p.lat, +p.lon], true); };
        box.appendChild(b);
      });
      box.hidden = false;
      $("#pick-msg").textContent = "Pick a result, then fine-tune the pin";
    });
  }
  function showPickResults(res) {
    var box = $("#pick-results");
    box.innerHTML = "";
    res.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<b>" + esc(p.name) + "</b><span>" + esc(p.sub) + "</span>";
      b.onclick = function () { box.hidden = true; setPin([p.lat, p.lng], true); };
      box.appendChild(b);
    });
    box.hidden = !res.length;
  }
  var suggestPick = debounce(function (q) {
    photon(q, function (res) {
      if ($("#pick-q").value.trim() !== q || !res) return;
      showPickResults(res);
      $("#pick-msg").textContent = res.length ? "Pick a result, then fine-tune the pin" : "No matches yet — keep typing, or try a landmark nearby";
    });
  }, 350);
  $("#pick-q").addEventListener("input", function () {
    var q = this.value.trim();
    if (q.length < 3 || parseCoords(q) || /^https?:|goo\.gl/.test(q)) { if (q.length < 3) $("#pick-results").hidden = true; return; }
    suggestPick(q);
  });
  $("#pick-go").onclick = pickSearch;
  $("#pick-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); pickSearch(); } });
  $("#pick-here").onclick = function () {
    if (!navigator.geolocation) return;
    $("#pick-msg").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(function (pos) { setPin([pos.coords.latitude, pos.coords.longitude], true); },
      function () { $("#pick-msg").textContent = "Couldn't get your location — allow location access, or search instead."; },
      { enableHighAccuracy: true, timeout: 10000 });
  };
  $("#btn-pick").onclick = startPick;
  $("#pick-done").onclick = endPick;
  $("#pick-cancel").onclick = function () {
    if (pickBefore) setPin(pickBefore);
    else { picked = null; if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; } $("#pick-coords").textContent = "No location yet"; }
    endPick();
  };

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "entry"; }
  $("#pcategory").innerHTML = Object.keys(PLACE_CATS).map(function (k) { return "<option value='" + k + "'>" + esc(PLACE_CATS[k].label) + "</option>"; }).join("");
  function renderTagChips() {
    var cat = $("#pcategory").value, keep = {};
    $$("#ptag-chips input:checked").forEach(function (i) { keep[i.value] = 1; });
    var tags = TAGS_BY_CAT[cat] || PLACE_TAGS;
    $("#ptag-chips").innerHTML = tags.map(function (t) {
      return "<label class='chip chip-check'><input type='checkbox' name='ptag' value='" + esc(t) + "'" + (keep[t] ? " checked" : "") + "><span>" + esc(t) + "</span></label>"; }).join("");
  }
  $("#pcategory").addEventListener("change", renderTagChips);
  renderTagChips();

  /* ---------------- date / time pickers ---------------- */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function phTodayISO() { // today's date in Manila time, YYYY-MM-DD
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p;
  }
  function addDay(iso) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  // Builds "YYYY-MM-DDTHH:MM" start/end. End date defaults to start date;
  // an end time earlier than the start time means the meet runs past midnight.
  function composeWhen(f) {
    var start = f.start_date && f.start_time ? f.start_date + "T" + f.start_time : "";
    var end = "";
    if (start && f.end_time) {
      var ed = f.end_date || f.start_date;
      if (!f.end_date && f.end_time <= f.start_time) ed = addDay(f.start_date);
      end = ed + "T" + f.end_time;
      if (end <= start) end = "";
    } else if (start && f.end_date) {
      end = f.end_date + "T23:59";
    }
    return { start: start, end: end };
  }
  function updateDtHint() {
    var f = Object.fromEntries(new FormData(form).entries());
    var w = composeWhen(f), el = $("#dt-hint");
    if (!w.start) { el.textContent = ""; return; }
    var s = parseDate(w.start), e = w.end ? parseDate(w.end) : null;
    el.textContent = "📅 " + fmtFull.format(s) + (e ? " → " + (w.end.slice(0, 10) === w.start.slice(0, 10) ? fmtTime.format(e) : fmtFull.format(e)) : "");
  }
  $$("#submit-form input.dt").forEach(function (inp) {
    // open the native picker when tapping anywhere on the field
    inp.addEventListener("click", function () { try { inp.showPicker(); } catch (e) {} });
    inp.addEventListener("change", updateDtHint);
    inp.addEventListener("input", updateDtHint);
  });
  function resetDates() {
    var today = phTodayISO();
    $$("#submit-form input[type=date]").forEach(function (d) { d.min = today; });
    var sd = $("input[name=start_date]");
    if (!sd.value) sd.value = today;
    $("input[name=end_date]").min = sd.value || today;
    updateDtHint();
  }
  $("input[name=start_date]").addEventListener("change", function () { $("input[name=end_date]").min = this.value; });

  var sending = false;
  if (API) {
    $("#submit-go").textContent = "Submit for approval";
    $$(".only-sheet").forEach(function (el) { el.hidden = true; });
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = Object.fromEntries(new FormData(form).entries());
    var when = composeWhen(f); f.start = when.start; f.end = when.end;
    if (!picked) { toast("Pick a location first", "Tap “📍 Pick location on map”."); return; }
    if (kind === "meet" && (!f.title || !f.start)) { toast("Meet name, start date and start time are required"); return; }
    if (kind === "crew" && !f.name) { toast("Crew name is required"); return; }
    if (kind === "place" && !f.pname) { toast("Shop / place name is required"); return; }
    if (kind === "place" && !API) { toast("Shops need the database", "Set supabaseUrl / supabaseKey in js/config.js."); return; }

    var logo = (f.logo || "").trim();
    var logoPath = /^https?:\/\//i.test(logo) ? logo : (logo ? "club_logos/" + logo : "");

    function payloadFor(k) {
      var pl = k === "meet"
        ? { kind: "meet", title: f.title, type: f.type, host: f.host, visibility: f.visibility || "public", start: f.start, end: f.end, place: f.place, details: f.details, link: f.link }
        : k === "place"
        ? { kind: "place", name: f.pname, category: f.pcategory, area: f.parea, tags: new FormData(form).getAll("ptag").join(", "),
            hours: f.hours, phone: f.phone, link: f.plink, details: f.pdetails }
        : { kind: "crew", name: f.name, area: f.area, color: f.color, radius: f.radius, logo: logoPath, link: f.pagelink, tags: f.tags };
      pl.lat = picked[0]; pl.lng = picked[1];
      return pl;
    }

    // ---- Edit: save changes to an existing post (yours, or any if you're the admin) ----
    if (editing && API) {
      if (sending) return;
      sending = true;
      var sbtn = $("#submit-go"); sbtn.disabled = true; sbtn.textContent = "Saving…";
      var up = payloadFor(editing.kind); up.action = "update"; up.id = editing.id;
      api(up)
        .then(function (r) {
          if (r.auth) { updateGate(); throw new Error("Please sign in again."); }
          if (!r.ok) throw new Error(r.error || "Couldn't save");
          if (editing.repost) return api({ action: "admin_restore", kind: "meet", id: editing.id }).then(function (r2) {
            if (!r2.ok) throw new Error(r2.error || "Saved, but couldn't put it back on the map");
            return "reposted";
          });
        })
        .then(function (res) {
          editing = null; adminDirty = false; closeModal();
          toast(res === "reposted" ? "Reposted ✅" : "Saved ✅", "Refreshing the map…", 3000);
          setTimeout(function () { location.reload(); }, 900);
        })
        .catch(function (err) { toast("Couldn't save", err.message); })
        .then(function () { sending = false; sbtn.disabled = false; if (editing) sbtn.textContent = editing.repost ? "Repost" : "Save changes"; });
      return;
    }

    // ---- Live mode: send to the Google Sheet for approval ----
    if (API) {
      if (sending) return;
      sending = true;
      var btn = $("#submit-go"); btn.disabled = true; btn.textContent = "Sending…";
      var payload = payloadFor(kind); payload.contact = f.contact; payload.website = f.website;
      payload.action = "submit";
      if (AUTH_ON && !authValid()) { sending = false; btn.disabled = false; btn.textContent = "Submit for approval"; updateGate(); toast("Please sign in again", "Your session expired."); return; }
      BE.call(payload)
        .then(function (res) {
          if (res.auth) { updateGate(); throw new Error("Please sign in again."); }
          if (!res.ok) throw new Error(res.error || "Couldn't send");
          closeModal(); form.reset(); picked = null; $("#pick-coords").textContent = "No location yet"; $("#dt-hint").textContent = "";
          if (res.live) { toast("Posted — it's live ✅", "Refreshing the map…", 4000); setTimeout(function () { location.reload(); }, 1800); }
          else toast("Sent for approval ✅", ({ meet: "Your meet", crew: "Your crew", place: "The shop" }[kind]) + " will show on the map once an admin approves it. Check “My posts” under your account.", 7000);
        })
        .catch(function (err) { toast("Couldn't send", (err && err.message && err.message !== "Failed to fetch") ? err.message : "Check your connection and try again."); })
        .then(function () { sending = false; btn.disabled = false; btn.textContent = "Submit for approval"; });
      return;
    }

    // ---- No Sheet configured: generate a block to paste into the data files ----
    var obj, file;
    if (kind === "meet") {
      obj = { id: slug(f.title) + "-" + f.start.slice(0, 10), title: f.title, type: f.type, host: f.host, start: f.start };
      if (f.end) obj.end = f.end;
      obj.place = f.place; obj.coords = picked; obj.details = f.details; obj.link = f.link;
      file = "data/events.js";
    } else {
      obj = { id: slug(f.name), name: f.name, logo: logoPath, color: f.color, area: f.area, link: f.pagelink,
              tags: (f.tags || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean),
              turf: { center: picked, radius: Math.round((+f.radius || 3) * 1000) } };
      file = "data/crews.js";
    }
    var code = JSON.stringify(obj, null, 2).replace(/"([a-z]+)":/g, "$1:")
      .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, "[$1, $2]") + ",";
    $("#out-file").textContent = file;
    $("#out-code").textContent = code;
    $("#out").hidden = false;
    var send = $("#btn-send");
    if (safeUrl(CFG.submitFormUrl)) { send.hidden = false; send.href = CFG.submitFormUrl; } else send.hidden = true;
    $("#out").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("#btn-copy").onclick = function () { copy($("#out-code").textContent, "Copied", "Paste it into " + $("#out-file").textContent); };

  /* ---------------- boot ---------------- */
  renderMeets();
  renderCrews();
  renderPlaceFilters(); renderPlaces();

  var newCount = EVENTS.filter(isNew).length;
  if (newCount) { $("#new-badge").textContent = newCount + " new"; $("#new-badge").hidden = false; }
  if (!$("#tab-meets").hidden && !newCount) markSeen();
  if (firstVisit) markSeen();

  // Heads-up for anything in the next 24 h
  var soon = EVENTS.filter(function (e) { return isLive(e) || e.startD - Date.now() < 864e5; });
  if (soon.length) setTimeout(function () {
    toast(soon.length === 1 ? "🏁 " + soon[0].title : "🏁 " + soon.length + " meets in the next 24h", soon.length === 1 ? countdown(soon[0]) + " · " + (soon[0].place || "") : "Check the Meets tab.", 7000);
  }, 900);

  // Deep links: #meet=id or #crew=id
  function fromHash() {
    var m = location.hash.match(/^#(meet|crew|place)=(.+)$/);
    if (!m) return;
    var id = decodeURIComponent(m[2]);
    if (m[1] === "meet") focusMeet(id); else if (m[1] === "place") focusPlace(id); else focusCrew(id);
  }
  window.addEventListener("hashchange", fromHash);
  setTimeout(fromHash, 300);

  // Keep countdowns fresh
  setInterval(renderMeets, 60000);
  checkReminders();
  if (bootNote) setTimeout(function () { toast(bootNote); }, 1500);
  } // end start()
})();
