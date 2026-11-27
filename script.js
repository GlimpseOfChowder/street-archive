/* =====================================================================
   STREET ARCHIVE — app logic
   Data: data/crews.js + data/events.js, plus approved rows from the Google
   Sheet (js/config.js -> sheetApiUrl). Free on GitHub Pages.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- load approved submissions from the Google Sheet ----------------
     js/config.js -> sheetApiUrl. Waits up to ~5 s; if the Sheet is slow or down we
     use the last copy saved in this browser, then the built-in data files only. */
  var BOOT_CFG = window.SA_CONFIG || {};
  var API = /^https:\/\/script\.google(usercontent)?\.com\//.test(BOOT_CFG.sheetApiUrl || "") ? BOOT_CFG.sheetApiUrl : "";
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
    var timer = setTimeout(function () { var c = cacheGet(); go(c, c ? "Showing saved data — live list is slow to load." : "Couldn't load submitted meets right now."); }, 5000);
    fetch(API, { method: "GET" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !Array.isArray(d.events)) throw new Error("bad data");
      cacheSet(d); clearTimeout(timer); go(d);
    }).catch(function () { clearTimeout(timer); var c = cacheGet(); go(c, c ? "Offline — showing saved data." : ""); });
  }

  function start(REMOTE, bootNote) {
  var CFG = window.SA_CONFIG || {};
  var CREWS = mergeById((window.SA_CREWS || []).slice(), (REMOTE.crews || []).map(remoteCrew).filter(Boolean));
  var RAW_EVENTS = mergeById((window.SA_EVENTS || []).slice(), (REMOTE.events || []).map(remoteEvent).filter(Boolean));

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
      turf: { center: [lat, lng], radius: Math.round((num(r.radius_km) || 3) * 1000) }, _src: "sheet" };
  }
  function remoteEvent(r) {
    var lat = num(r.lat), lng = num(r.lng);
    if (!str(r.id) || !str(r.title) || !str(r.start) || lat === null || lng === null) return null;
    return { id: str(r.id), title: str(r.title), type: str(r.type) || "meet", host: str(r.host),
      start: str(r.start), end: str(r.end) || undefined, place: str(r.place), coords: [lat, lng],
      details: str(r.details), link: str(r.link), _src: "sheet" };
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
        (c.tags && c.tags.length ? "<br>" + c.tags.map(function (x) { return "<span class='tag tag-type'>" + esc(x) + "</span>"; }).join("") : "") +
        "</div></div>" + adminButtons("crew", c);
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
    return html + "</div>";
  }

  $("#btn-turf").onclick = function () {
    var on = map.hasLayer(turfLayer);
    if (on) map.removeLayer(turfLayer); else map.addLayer(turfLayer);
    this.classList.toggle("active", !on);
  };

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
    html += "<span class='tag tag-type'>" + esc(TYPE_LABEL[e.type] || "Meet") + "</span>" + (e.sample ? "<span class='tag tag-sample'>Sample</span>" : "") + (isLive(e) ? "<span class='tag tag-live'>Live</span>" : "");
    html += "<h3>" + esc(e.title) + "</h3>";
    html += "<div class='sub'><span class='when'>" + esc(fmtFull.format(e.startD)) + (e.end ? " – " + esc(fmtTime.format(e.endD)) : "") + "</span> · <span class='countdown'>" + esc(countdown(e)) + "</span></div>";
    if (host) html += "<div class='crew-row' style='--c:" + esc(host.color) + "'>" + (host.logo ? "<img src='" + esc(host.logo) + "' alt=''>" : "") + "<div>Hosted by <a data-goto-crew='" + esc(host.id) + "' href='#'>" + esc(host.name) + "</a></div></div>";
    if (e.place) html += "<p>📍 " + esc(e.place) + "</p>";
    if (e.details) html += "<p>" + esc(e.details) + "</p>";
    html += "<div class='actions'>";
    html += "<button class='btn sm" + (reminders[e.id] ? " btn-accent" : "") + "' data-remind='" + esc(e.id) + "'>" + (reminders[e.id] ? "🔔 Reminder on" : "🔔 Remind me") + "</button>";
    html += "<button class='btn sm' data-ics='" + esc(e.id) + "'>📅 Calendar</button>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://waze.com/ul?ll=" + dest + "&navigate=yes'>Waze</a>";
    html += "<a class='btn sm' target='_blank' rel='noopener' href='https://www.google.com/maps/dir/?api=1&destination=" + dest + "'>Maps</a>";
    html += "<button class='btn sm' data-share='meet=" + esc(e.id) + "'>Share</button>";
    if (link) html += "<a class='btn sm' target='_blank' rel='noopener' href='" + esc(link) + "'>Event page ↗</a>";
    html += "</div>" + adminButtons("meet", e) + "<div>";
    return html + "</div></div>";
  }

  /* ---------------- popup / list click delegation ---------------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-goto-meet],[data-goto-crew],[data-remind],[data-ics],[data-share]");
    if (!t) return;
    ev.preventDefault();
    if (t.dataset.gotoMeet) focusMeet(t.dataset.gotoMeet);
    else if (t.dataset.gotoCrew) focusCrew(t.dataset.gotoCrew);
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
      // (served by our Google Sheet backend) brings up the native "Add to Calendar" sheet.
      if (API && e._src === "sheet") window.location.href = API + "?ics=" + encodeURIComponent(e.id);
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
  })();

  $$(".tab").forEach(function (b) {
    b.onclick = function () {
      $$(".tab").forEach(function (x) { x.classList.toggle("active", x === b); });
      $("#tab-meets").hidden = b.dataset.tab !== "meets";
      $("#tab-crews").hidden = b.dataset.tab !== "crews";
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
        "<p><span class='countdown'>" + esc(countdown(e)) + "</span> · " + esc(fmtTime.format(e.startD)) + (host ? " · " + esc(host.name) : "") + dist + "</p>" +
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
    EVENTS.forEach(function (e) { if ((e.title + " " + (e.place || "")).toLowerCase().indexOf(q) > -1) out.push({ kind: "Meet", label: e.title, sub: fmtFull.format(e.startD), go: function () { focusMeet(e.id); } }); });
    return out.slice(0, 8);
  }
  function showResults(items) {
    hlIdx = -1;
    if (!items.length) { sBox.hidden = true; return; }
    sBox.innerHTML = "";
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.innerHTML = "<span>" + esc(it.label) + (it.sub ? " <span class='muted'>· " + esc(it.sub) + "</span>" : "") + "</span><small>" + esc(it.kind) + "</small>";
      b.onclick = function () { sBox.hidden = true; if (it.kind !== "Place" || !/^Search places/.test(it.label)) sInput.blur(); it.go(); };
      sBox.appendChild(b);
    });
    sBox.hidden = false;
  }
  // Crews & meets filter as you type. Place search hits OpenStreetMap Nominatim,
  // whose usage policy (operations.osmfoundation.org/policies/nominatim/) forbids
  // search-as-you-type and allows max 1 request/second for the whole site —
  // so places are only looked up when the user presses Enter / taps the row.
  var lastGeo = 0;
  function placeRow(q) {
    return { kind: "Place", label: "Search places for “" + q + "”", sub: "", go: function () { searchPlaces(q); } };
  }
  function searchPlaces(q) {
    if (Date.now() - lastGeo < 1100) return;
    lastGeo = Date.now();
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ph&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.length) { toast("No places found", "Try a city or landmark name."); return; }
        if (res.length === 1) { map.flyTo([+res[0].lat, +res[0].lon], 14); return; }
        showResults(res.map(function (p) {
          return { kind: "Place", label: p.display_name.split(",").slice(0, 2).join(","), sub: "", go: function () { map.flyTo([+p.lat, +p.lon], 14); } };
        }));
        sInput.focus();
      }).catch(function () { toast("Place search unavailable", "Try again in a moment."); });
  }
  sInput.addEventListener("input", function () {
    var q = sInput.value.trim();
    if (q.length < 2) { sBox.hidden = true; return; }
    showResults(searchItems(q).concat([placeRow(q)]));
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
      renderMeets();
    }, function () {
      toast("Couldn't get your location", "Allow location access in your browser settings.");
      if (meetFilter === "near") { meetFilter = "all"; $$("#meet-filters .chip").forEach(function (x) { x.classList.toggle("active", x.dataset.f === "all"); }); renderMeets(); }
    }, { enableHighAccuracy: true, timeout: 10000 });
  }
  $("#btn-locate").onclick = locate;

  /* ---------------- Google sign-in (needed to post when configured) ---------------- */
  var CLIENT_ID = (CFG.googleClientId || "").trim();
  var AUTH_ON = !!(API && CLIENT_ID);
  var auth = store.get("auth", null); // { token, exp, name, email, picture }
  function authValid() { return !!(auth && auth.token && auth.exp * 1000 > Date.now() + 60000); }
  function decodeJwt(t) {
    try {
      var p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      p += "===".slice((p.length + 3) % 4);
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(p), function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2); }).join("")));
    } catch (e) { return null; }
  }
  function gis() { return window.google && google.accounts && google.accounts.id ? google.accounts.id : null; }
  function whenGis(cb, tries) {
    if (gis()) return cb();
    if ((tries || 0) > 50) return; // ~10 s, script blocked/offline
    setTimeout(function () { whenGis(cb, (tries || 0) + 1); }, 200);
  }
  function onCredential(resp) {
    var p = decodeJwt(resp && resp.credential);
    if (!p) { toast("Sign-in failed", "Please try again."); return; }
    auth = { token: resp.credential, exp: p.exp, name: p.name || p.email, email: p.email, picture: p.picture || "" };
    store.set("auth", auth); store.set("wasSignedIn", true);
    renderAccount(); updateGate(); loadRole();
    toast("Signed in", "Welcome, " + (auth.name || "").split(" ")[0] + "!");
  }
  function signOut() {
    auth = null; store.set("auth", null); store.set("wasSignedIn", false);
    var g = gis(); if (g) g.disableAutoSelect();
    renderAccount(); updateGate(); $("#acct-menu").hidden = true;
    ROLE = { admin: false, trusted: false }; $("#acct-admin").hidden = true; document.body.classList.remove("is-admin");
    toast("Signed out");
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
    if (authValid() || (auth && auth.email)) {
      btn.innerHTML = auth.picture ? "<img src='" + esc(auth.picture) + "' alt='' referrerpolicy='no-referrer'>" : "<b>" + esc(initials(auth.name || "?")) + "</b>";
      btn.title = auth.email;
      $("#acct-name").textContent = auth.name || "";
      $("#acct-email").textContent = auth.email || "";
      $("#acct-in").hidden = false; $("#acct-out").hidden = true;
      var expired = !authValid();
      $("#acct-expired").hidden = !expired;
      if (expired) renderGisButton($("#gsi-reauth-btn"), true);
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
    fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "mine", idToken: auth.token }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.auth) { list.innerHTML = "<li class='muted'>Session expired — sign in again.</li>"; auth.token = ""; store.set("auth", auth); return; }
        var items = res.items || [];
        list.innerHTML = items.length ? items.map(function (it) {
          return "<li" + (it.approved && it.kind === "meet" && eventById[it.id] ? " data-goto-meet='" + esc(it.id) + "'" : it.approved && crewById[it.id] ? " data-goto-crew='" + esc(it.id) + "'" : "") + ">" +
            "<span class='tag " + (it.approved ? "tag-live" : "tag-sample") + "'>" + (it.archived ? "Archived" : it.approved ? "Live" : "Pending") + "</span>" +
            esc(it.label) + " <span class='muted'>· " + esc(it.kind) + "</span></li>";
        }).join("") : "<li class='muted'>No posts yet. Tap + to add a meet or your crew.</li>";
      }).catch(function () { list.innerHTML = "<li class='muted'>Couldn't load your posts.</li>"; });
  }
  if (AUTH_ON) {
    whenGis(function () {
      gis().initialize({ client_id: CLIENT_ID, callback: onCredential, auto_select: true, cancel_on_tap_outside: true, use_fedcm_for_prompt: true });
      // Returning users get signed back in quietly when their 1-hour token has expired.
      if (!authValid() && store.get("wasSignedIn", false)) gis().prompt();
      renderAccount(); updateGate();
    });
    $("#acct-btn").onclick = function (e) {
      e.stopPropagation();
      var m = $("#acct-menu"); m.hidden = !m.hidden;
      if (!m.hidden && auth && auth.email) loadMine();
    };
    $("#acct-signout").onclick = signOut;
    document.addEventListener("click", function (e) { if (!e.target.closest("#account")) $("#acct-menu").hidden = true; });
  }
  renderAccount();

  /* ---------------- admin tools (Users tab → tick "admin") ---------------- */
  var ROLE = { admin: false, trusted: false };
  function api(body) {
    body.idToken = auth && auth.token;
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function loadRole() {
    if (!AUTH_ON || !authValid()) { ROLE = { admin: false, trusted: false }; $("#acct-admin").hidden = true; return; }
    api({ action: "whoami" }).then(function (r) {
      if (!r || !r.ok) return;
      ROLE = { admin: !!r.admin, trusted: !!r.trusted };
      $("#acct-admin").hidden = !ROLE.admin;
      if (ROLE.admin) document.body.classList.add("is-admin");
    }).catch(function () {});
  }
  function adminButtons(k, item) {
    if (!ROLE.admin) return "";
    if (item._src !== "sheet") return "<div class='admin-row muted'>Admin: this " + k + " is in the site's data files — edit it on GitHub.</div>";
    return "<div class='admin-row'><span>Admin</span>" +
      (k === "meet" ? "<button class='btn sm btn-accent' data-admin-edit='" + esc(item.id) + "'>Edit</button>" : "") +
      "<button class='btn sm' data-admin-act='admin_archive' data-kind='" + k + "' data-id='" + esc(item.id) + "' data-label='" + esc(item.name || item.title) + "'>Archive</button>" +
      "<button class='btn sm btn-danger' data-admin-act='admin_delete' data-kind='" + k + "' data-id='" + esc(item.id) + "' data-label='" + esc(item.name || item.title) + "'>Delete</button></div>";
  }
  var adminDirty = false, adminTab = "pending", adminItems = [];
  function adminDo(btn) {
    var act = btn.dataset.adminAct, label = btn.dataset.label || btn.dataset.id;
    if (act === "admin_delete" && !window.confirm("Permanently delete “" + label + "”? This can't be undone.\n(Tip: Archive hides it but keeps it.)")) return;
    btn.disabled = true;
    api({ action: act, kind: btn.dataset.kind, id: btn.dataset.id }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "Failed");
      var verb = { admin_approve: "Approved", admin_archive: "Archived", admin_restore: "Restored", admin_delete: "Deleted" }[act];
      toast(verb + ": " + label);
      adminDirty = true;
      if (!$("#admin-panel").hidden) loadAdmin();
      else setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) { btn.disabled = false; toast("Couldn't do that", e.message); });
  }
  function loadAdmin() {
    var list = $("#admin-list");
    if (!adminItems.length) list.innerHTML = "<li class='muted'>Loading…</li>";
    api({ action: "admin_list" }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      adminItems = r.items || [];
      renderAdmin();
    }).catch(function (e) { list.innerHTML = "<li class='muted'>Couldn't load: " + esc(e.message || "") + "</li>"; });
  }
  function renderAdmin() {
    var counts = { pending: 0, live: 0, archived: 0 };
    adminItems.forEach(function (i) { counts[i.status]++; });
    $$("#admin-tabs .chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.t === adminTab);
      c.querySelector("b").textContent = counts[c.dataset.t] || 0;
    });
    var items = adminItems.filter(function (i) { return i.status === adminTab; });
    $("#admin-list").innerHTML = items.length ? items.map(function (i) {
      var btns = [];
      if (i.status === "pending") btns.push(["admin_approve", "Approve", "btn-accent"], ["admin_archive", "Archive", ""]);
      if (i.status === "live") btns.push(["admin_archive", "Archive", ""]);
      if (i.status === "archived") btns.push(["admin_restore", "Restore", ""]);
      btns.push(["admin_delete", "Delete", "btn-danger"]);
      var editBtn = i.kind !== "meet" ? "" : i.status === "archived"
        ? "<button class='btn sm btn-accent' data-admin-edit='" + esc(i.id) + "' data-repost='1' title='Change the date and put it back on the map'>Repost…</button>"
        : "<button class='btn sm' data-admin-edit='" + esc(i.id) + "'>Edit</button>";
      var when = i.kind === "meet" && i.start ? (function () { var d = parseDate(i.start); return d ? fmtFull.format(d) : i.start; })() : "";
      return "<li class='admin-item'>" +
        "<div class='ai-main'><span class='tag tag-type'>" + esc(i.kind) + "</span><b>" + esc(i.label) + "</b>" +
        "<div class='muted'>" + esc([when, i.where].filter(Boolean).join(" · ")) + "</div>" +
        "<div class='muted small'>by " + esc(i.by || "—") + " · " + esc(i.submitted_at) +
        (i.lat !== "" && i.lat != null ? " · <a href='https://www.google.com/maps?q=" + esc(i.lat) + "," + esc(i.lng) + "' target='_blank' rel='noopener'>map</a>" : "") + "</div></div>" +
        "<div class='ai-btns'>" + editBtn + btns.map(function (b) {
          return "<button class='btn sm " + b[2] + "' data-admin-act='" + b[0] + "' data-kind='" + esc(i.kind) + "' data-id='" + esc(i.id) + "' data-label='" + esc(i.label) + "'>" + b[1] + "</button>";
        }).join("") + "</div></li>";
    }).join("") : "<li class='muted'>Nothing " + adminTab + ".</li>";
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
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-admin-act]"); if (!b) return;
      e.preventDefault(); e.stopPropagation(); adminDo(b);
    });
    whenGis(loadRole);
  }

  /* ---------------- submit modal ---------------- */
  var modal = $("#modal"), form = $("#submit-form"), kind = "meet", picked = null, pickMarker = null;
  $("#host-select").innerHTML = "<option value=''>— Open / independent —</option>" +
    CREWS.map(function (c) { return "<option value='" + esc(c.id) + "'>" + esc(c.name) + "</option>"; }).join("");

  function openModal() { if (editing) { editing = null; form.reset(); picked = null; $("#pick-coords").textContent = "No location yet"; } setFormMode(false); modal.hidden = false; updateGate(); resetDates(); }
  function closeModal() {
    if (editing && adminDirty) { setTimeout(function () { location.reload(); }, 300); }
    modal.hidden = true; modal.classList.remove("picking"); $("#pick-hint").hidden = true;
    map.getContainer().classList.remove("picking-map");
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  }
  $("#btn-submit").onclick = openModal;
  $$("[data-close]", modal).forEach(function (b) { b.onclick = closeModal; });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  $$(".seg-btn").forEach(function (b) {
    b.onclick = function () {
      kind = b.dataset.kind;
      $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
      $(".kind-meet").hidden = kind !== "meet";
      $(".kind-crew").hidden = kind !== "crew";
      $("#out").hidden = true;
    };
  });

  /* ---------------- admin: edit a meet (reuses the submit form) ---------------- */
  var editing = null; // { id } while editing an existing meet
  function setFormMode(edit) {
    $("#modal-title").textContent = edit ? "Edit meet" : "Put it on the map";
    $(".seg").hidden = !!edit;
    $$(".only-sheet").forEach(function (el) { el.hidden = !!edit || !API; });
    $("#submit-go").textContent = edit ? "Save changes" : (API ? "Submit for approval" : "Generate entry");
  }
  function findMeetForEdit(id) {
    var e = eventById[id];
    if (e) return { id: e.id, title: e.title, type: e.type, host: e.host, start: e.start, end: e.end || "",
                    place: e.place, details: e.details, link: e.link, coords: e.coords };
    var i = adminItems.filter(function (x) { return x.kind === "meet" && x.id === id; })[0];
    if (i) return { id: i.id, title: i.label, type: i.type, host: i.host, start: i.start, end: i.end || "",
                    place: i.where, details: i.details, link: i.link, coords: [Number(i.lat), Number(i.lng)] };
    return null;
  }
  function openEdit(id, repost) {
    var m = findMeetForEdit(id);
    if (!m) { toast("Couldn't find that meet", "Refresh and try again."); return; }
    if (!$("#admin-panel").hidden) $("#admin-panel").hidden = true; // keep adminDirty so the map refreshes after
    map.closePopup();
    form.reset(); $("#out").hidden = true;
    editing = { id: m.id, repost: !!repost };
    kind = "meet";
    $$(".seg-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.kind === "meet"); });
    $(".kind-meet").hidden = false; $(".kind-crew").hidden = true;
    setFormMode(true);
    var hostSel = $("#host-select");
    if (m.host && !hostSel.querySelector("option[value='" + m.host.replace(/'/g, "") + "']")) {
      var o = document.createElement("option"); o.value = m.host; o.textContent = m.host; hostSel.appendChild(o);
    }
    var set = function (n, v) { var el = form.elements[n]; if (el) el.value = v == null ? "" : v; };
    set("title", m.title); set("type", m.type || "meet"); set("host", m.host || "");
    set("start_date", (m.start || "").slice(0, 10)); set("start_time", (m.start || "").slice(11, 16));
    set("end_date", (m.end || "").slice(0, 10)); set("end_time", (m.end || "").slice(11, 16));
    set("place", m.place); set("details", m.details); set("link", m.link);
    $$("#submit-form input[type=date]").forEach(function (d) { d.min = ""; }); // past/ongoing meets are editable
    picked = (m.coords && isFinite(m.coords[0])) ? [m.coords[0], m.coords[1]] : null;
    $("#pick-coords").textContent = picked ? picked.join(", ") + " (tap 📍 to move)" : "No location yet";
    if (picked) { if (pickMarker) pickMarker.setLatLng(picked); else pickMarker = L.marker(picked).addTo(map); }
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
    var b = e.target.closest("[data-admin-edit]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!ROLE.admin) return;
    openEdit(b.dataset.adminEdit, b.dataset.repost === "1");
  });

  function startPick() {
    modal.classList.add("picking"); $("#pick-hint").hidden = false;
    map.getContainer().classList.add("picking-map");
    map.once("click", onPick);
  }
  function onPick(e) {
      map.closePopup();
      picked = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
      if (pickMarker) pickMarker.setLatLng(picked);
      else pickMarker = L.marker(picked).addTo(map);
      $("#pick-coords").textContent = picked.join(", ");
      endPick();
  }
  function endPick() {
    modal.classList.remove("picking"); $("#pick-hint").hidden = true;
    map.getContainer().classList.remove("picking-map");
  }
  $("#btn-pick").onclick = startPick;
  $("#pick-cancel").onclick = function () { map.off("click", onPick); endPick(); };

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "entry"; }
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
    $$(".only-sheet").forEach(function (el) { el.hidden = false; });
  }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = Object.fromEntries(new FormData(form).entries());
    var when = composeWhen(f); f.start = when.start; f.end = when.end;
    if (!picked) { toast("Pick a location first", "Tap “📍 Pick location on map”."); return; }
    if (kind === "meet" && (!f.title || !f.start)) { toast("Meet name, start date and start time are required"); return; }
    if (kind === "crew" && !f.name) { toast("Crew name is required"); return; }

    var logo = (f.logo || "").trim();
    var logoPath = /^https?:\/\//i.test(logo) ? logo : (logo ? "club_logos/" + logo : "");

    // ---- Admin edit: save changes to an existing meet ----
    if (editing && API) {
      if (sending) return;
      sending = true;
      var sbtn = $("#submit-go"); sbtn.disabled = true; sbtn.textContent = "Saving…";
      api({ action: "admin_update", kind: "meet", id: editing.id, title: f.title, type: f.type, host: f.host,
            start: f.start, end: f.end, place: f.place, details: f.details, link: f.link, lat: picked[0], lng: picked[1] })
        .then(function (r) {
          if (r.auth) { auth.token = ""; store.set("auth", auth); updateGate(); throw new Error("Your session expired — sign in again."); }
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
      var payload = kind === "meet"
        ? { kind: "meet", title: f.title, type: f.type, host: f.host, start: f.start, end: f.end, place: f.place, details: f.details, link: f.link }
        : { kind: "crew", name: f.name, area: f.area, color: f.color, radius: f.radius, logo: logoPath, link: f.pagelink, tags: f.tags };
      payload.lat = picked[0]; payload.lng = picked[1]; payload.contact = f.contact; payload.website = f.website;
      payload.action = "submit"; if (AUTH_ON) payload.idToken = auth && auth.token;
      if (AUTH_ON && !authValid()) { sending = false; btn.disabled = false; btn.textContent = "Submit for approval"; updateGate(); toast("Please sign in again", "Your session expired."); return; }
      // text/plain body = no CORS preflight, which Apps Script can't answer
      fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.auth) { auth.token = ""; store.set("auth", auth); updateGate(); throw new Error("Your session expired — sign in again."); }
          if (!res.ok) throw new Error(res.error || "Couldn't send");
          closeModal(); form.reset(); picked = null; $("#pick-coords").textContent = "No location yet"; $("#dt-hint").textContent = "";
          if (res.live) { toast("Posted — it's live ✅", "Refreshing the map…", 4000); setTimeout(function () { location.reload(); }, 1800); }
          else toast("Sent for approval ✅", (kind === "meet" ? "Your meet" : "Your crew") + " will show on the map once an admin approves it. Check “My posts” under your account.", 7000);
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
    var m = location.hash.match(/^#(meet|crew)=(.+)$/);
    if (!m) return;
    var id = decodeURIComponent(m[2]);
    if (m[1] === "meet") focusMeet(id); else focusCrew(id);
  }
  window.addEventListener("hashchange", fromHash);
  setTimeout(fromHash, 300);

  // Keep countdowns fresh
  setInterval(renderMeets, 60000);
  checkReminders();
  if (bootNote) setTimeout(function () { toast(bootNote); }, 1500);
  } // end start()
})();
