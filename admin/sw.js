"use strict";

var CACHE_NAME = "commerce-research-admin-v1";

var APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./css/style.css",
  "./js/admin.js",
  "./js/dashboard.js",
  "./manifest.webmanifest",
  "../js/config.js",
  "../icons/icon-192.png",
  "../icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  /*
   * Ne jamais mettre en cache les données/API privées.
   */
  if (
    url.origin === self.location.origin &&
    url.pathname.indexOf("/rest/") !== -1
  ) {
    return;
  }

  if (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.indexOf("/auth/") !== -1
  ) {
    return;
  }

  /*
   * Pour les fichiers de l'application :
   * cache d'abord, réseau en secours.
   */
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        return cached;
      }

      return fetch(request).then(function (response) {
        if (
          response &&
          response.ok &&
          url.origin === self.location.origin
        ) {
          var copy = response.clone();

          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }

        return response;
      });
    })
  );
});
