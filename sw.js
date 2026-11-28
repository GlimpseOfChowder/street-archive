/* Street Archive service worker — makes the site installable and quick to open.
   - Pages and our own files: try the network first (always fresh), fall back to the
     saved copy when offline or the signal is bad.
   - Versioned libraries (Leaflet, Supabase from unpkg): saved once, reused.
   - Database, sign-in, map tiles and everything else: not touched. */
var VERSION = "sa-20261128w";
var CORE = ["./", "index.html", "styles.css", "script.js", "js/config.js", "js/backend.js",
            "data/crews.js", "data/events.js", "club_logos/site_logo.png", "icons/icon-192.png", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // versioned libraries: cache first
  if (url.hostname === "unpkg.com") {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;              // database, tiles, Google etc.
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // our pages & files: network first, saved copy as backup
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.type === "basic") { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
    });
  }));
});
