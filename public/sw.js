/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "landing.html",
    "revision": "df17d57631c2e198fc57499543aa02d6"
  }, {
    "url": "index.html",
    "revision": "2a27f40ef39165836564c17211c7affa"
  }, {
    "url": "forecaster.css",
    "revision": "982f5ecf853a865498054332d865b4fe"
  }, {
    "url": "styles/forecaster.css",
    "revision": "f7a3026273372bd7acc7493b743d76da"
  }, {
    "url": "scripts/saas-subscription.js",
    "revision": "721a258be01e953f031a5fdbc6cd40e7"
  }, {
    "url": "scripts/pwa-bridge.js",
    "revision": "c4b2a6a6622fb0e09a9e48a97814e33e"
  }, {
    "url": "scripts/github-sync.js",
    "revision": "79c856286c92ef37ea132aaf3b273ed5"
  }, {
    "url": "scripts/extended-features.js",
    "revision": "7cc58c1ab797121538964cb5c420abc2"
  }, {
    "url": "scripts/cloud-sync.js",
    "revision": "a0fa2f39459ac6c6b278302af355916e"
  }, {
    "url": "scripts/auth-manager.js",
    "revision": "91db250b3c30b32a04d24f08a6a535e8"
  }, {
    "url": "scripts/app-modules.js",
    "revision": "60786638ddfa9aaae8368969abdbbacf"
  }, {
    "url": "scripts/app-core.js",
    "revision": "c99ded60cd1ad14f5d39db031c87080a"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "7abbc47db3bff2869f25e3740db000d6"
  }, {
    "url": "favicon.ico",
    "revision": "11fc7a51caadb7db708b9f2437fbbe0d"
  }, {
    "url": "icon.svg",
    "revision": "dc198088ef7e92e00113b9f034980cec"
  }, {
    "url": "pwa-192x192.png",
    "revision": "70c464b722bf833f2d85f4d8d0760222"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9db3aa5ee4c31043d235dfae23252b73"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "5208c25d53096f2fe2c07561a608efcf"
  }, {
    "url": "manifest.webmanifest",
    "revision": "0eb9a19b56a087cbb5430e7238d5f9be"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
