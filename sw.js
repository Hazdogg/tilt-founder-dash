// Service worker for the Tilt Energy Founder Cockpit.
// Goal: make the app installable and openable offline, WITHOUT ever caching
// live API responses (those must stay fresh). Bump CACHE to ship an update.
var CACHE = "cockpit-v1";
var SHELL = ["/", "/index.html", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Never touch live data — always hit the network so it can't go stale.
  if (url.pathname.indexOf("/api/") === 0) return;

  // Page navigations: network-first so updates land, fall back to cached shell offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("/index.html", copy); });
        return res;
      }).catch(function () { return caches.match("/index.html"); })
    );
    return;
  }

  // Same-origin static assets: cache-first, refresh in the background.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});
