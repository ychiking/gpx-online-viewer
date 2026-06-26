const APP_CACHE = "ychiking-app-v20";
const TILE_CACHE = "ychiking-offline-tiles-v1";
const RUNTIME_CACHE = "ychiking-runtime-v20";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "https://ychiking.github.io/gpx-online-viewer/webicon.png",
  "./fonts/MaterialIcons-Regular.woff2",
  "./fonts/MaterialIcons-Regular.ttf",
  "./fonts/MaterialIcons-Regular.eot"
];

const TILE_HOSTS = [
  "tile.openstreetmap.org",
  "tile.opentopomap.org",
  "tile.happyman.idv.tw",
  "wmts.nlsc.gov.tw",
  "gis.sinica.edu.tw"
];

function isTileRequest(url) {
  return TILE_HOSTS.some(function(host) {
    return url.hostname === host || url.hostname.endsWith("." + host);
  });
}

const FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

function isFontRequest(url) {
  return FONT_HOSTS.some(function(host) {
    return url.hostname === host || url.hostname.endsWith("." + host);
  });
}

function offlineTileResponse() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <rect width="256" height="256" fill="#eeeeee"/>
      <path d="M0 0L256 256M256 0L0 256" stroke="#dddddd" stroke-width="2"/>
      <text x="128" y="126" font-size="15" font-family="sans-serif" text-anchor="middle" fill="#888">離線地圖</text>
      <text x="128" y="148" font-size="12" font-family="sans-serif" text-anchor="middle" fill="#999">尚未下載此區塊</text>
    </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", function(event) {
  self.skipWaiting();

  event.waitUntil(
    caches.open(APP_CACHE).then(function(cache) {
      return Promise.all(
        APP_SHELL.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return (
                key !== APP_CACHE &&
                key !== TILE_CACHE &&
                key !== RUNTIME_CACHE
              );
            })
            .map(function(key) {
              return caches.delete(key);
            })
        );
      })
    ])
  );
});

self.addEventListener("message", function(event) {
  const data = event.data || {};

  if (data.type === "PRECACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then(function(cache) {
        return Promise.all(
          data.urls.map(function(url) {
            return fetch(new Request(url, { mode: "no-cors" }))
              .then(function(response) {
                return cache.put(url, response.clone());
              })
              .catch(function() {});
          })
        );
      })
    );
  }
});

self.addEventListener("fetch", function(event) {
  const request = event.request;

  if (!request || request.method !== "GET") return;

  const url = new URL(request.url);

  if (isFontRequest(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(function(cache) {
        return cache.match(request, { ignoreVary: true }).then(function(cached) {
          if (cached) return cached;

          return fetch(request).then(function(response) {
            if (response && (response.ok || response.type === "opaque")) {
              cache.put(request, response.clone()).catch(function() {});
            }
            return response;
          }).catch(function() {
            return cached;
          });
        });
      })
    );
    return;
  }

  if (isTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async function(cache) {
        const cached =
          await cache.match(request, { ignoreVary: true }) ||
          await cache.match(url.href, { ignoreVary: true });

        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(request, response.clone()).catch(function() {});
          }
          return response;
        } catch (err) {
          return offlineTileResponse();
        }
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(function(cached) {
        return cached || fetch(request).then(function(response) {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then(function(cache) {
              cache.put(request, clone).catch(function() {});
            });
          }
          return response;
        }).catch(function() {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return cached;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(function(response) {
      if (response && (response.ok || response.type === "opaque")) {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then(function(cache) {
          cache.put(request, clone).catch(function() {});
        });
      }
      return response;
    }).catch(function() {
      return caches.match(request, { ignoreVary: true });
    })
  );
});
