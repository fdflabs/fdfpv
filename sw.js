/*
 * sw.js: keep what a deploy cannot change in a cache the next load reads
 * without asking the network, and ask the network first for what it can.
 *
 * GitHub Pages sends max-age=600 on every file. After those ten minutes a
 * returning pilot's load revalidates every module, the wasm and every asset
 * it touches, one round trip each, and with no network the game does not
 * boot at all. This worker answers three kinds of request from its caches:
 *
 * - A module or the wasm at ?v=<this deploy>. scripts/stamp-version.js
 *   gives every one a URL no other deploy shares, so the URL is the content.
 * - A file the deploy lists in ASSETS (audio, images, fonts, data), keyed by
 *   the file's content hash. These are fetched at bare paths that every
 *   deploy shares, so the hash and not the URL says whether a cached copy is
 *   this deploy's. A file whose hash changed is fetched again; the rest stay.
 * - A three.js or muxer build from the CDN at a pinned version.
 *
 * Pages (navigations) are asked of the network first, and served from the
 * cache only when the network fails, so a new deploy's HTML, which names
 * the new ?v= URLs, is always what a connected pilot loads. version.json and
 * this file are never touched here: src/ui/update.js polls version.json with
 * cache: 'no-store', and the browser checks this file on every navigation.
 *
 * The deploy stamps VERSION and ASSETS (scripts/stamp-version.js), so every
 * deploy is a new worker. It takes over at once instead of waiting for the
 * last tab of the old one to close: a tab of the old deploy then gets the new
 * deploy's assets, which is what the HTTP cache already gave it once its ten
 * minutes ran out, and the reload prompt is already offering that tab a
 * reload. The other order, a new page served old assets, is the one that
 * matters, and update.js closes it by asking for the new worker as soon as it
 * sees the new version, before the pilot presses Reload.
 *
 * An unstamped checkout never registers this (update.js registers only a
 * page that carries a version), so the harness and local serving are as
 * they were.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

const VERSION = 'dev';
const ASSETS = {};

const PAGES = 'fdfpv-pages';
const MODULES = 'fdfpv-modules';
const FILES = 'fdfpv-assets';
const CDN = 'fdfpv-cdn';
const KEEP = new Set([PAGES, MODULES, FILES, CDN]);

/* A jsDelivr npm URL with an exact version, which jsDelivr never changes. */
const PINNED_CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[^/]+\/)?[^/@]+@\d+\.\d+\.\d+\//;

const scope = new URL(self.registration.scope);

/* The site relative path of a same-origin URL, or null outside the scope. */
function sitePath(url) {
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
    ? decodeURIComponent(url.pathname.slice(scope.pathname.length))
    : null;
}

/* Only a whole, readable answer is kept: never a 206, an error, a redirect
 * or an opaque response the page could not have read either. */
function keepable(res) {
  return res.status === 200 && (res.type === 'basic' || res.type === 'cors');
}

async function cacheFirst(cacheName, key, fill) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  if (hit) {
    return hit;
  }
  const res = await fill();
  if (keepable(res)) {
    await cache.put(key, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (keepable(res)) {
      await cache.put(request.url, res.clone());
    }
    return res;
  } catch (e) {
    const hit = await cache.match(request.url, { ignoreSearch: true });
    if (hit) {
      return hit;
    }
    throw e;
  }
}

function route(request) {
  if (request.method !== 'GET' || request.headers.has('range')) {
    return null;
  }
  const url = new URL(request.url);
  if (url.origin !== scope.origin) {
    return PINNED_CDN.test(url.href) ? () => cacheFirst(CDN, url.href, () => fetch(request)) : null;
  }
  const path = sitePath(url);
  if (path === null || path === 'version.json' || path === 'sw.js') {
    return null;
  }
  if (request.mode === 'navigate') {
    return () => networkFirst(request);
  }
  if (url.searchParams.get('v') === VERSION) {
    return () => cacheFirst(MODULES, url.href, () => fetch(request));
  }
  const hash = Object.hasOwn(ASSETS, path) ? ASSETS[path] : null;
  if (hash && !url.search) {
    /* no-cache: a copy the HTTP cache kept from the last deploy must not
     * be stored under this deploy's hash. */
    const key = new URL(`${url.pathname}?sw=${hash}`, url).href;
    return () => cacheFirst(FILES, key, () => fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }));
  }
  return null;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

/* Drops what the deploy no longer names: modules of other versions, assets
 * whose hash moved or that left the site, and caches of an older layout. */
async function prune() {
  for (const name of await caches.keys()) {
    if (!KEEP.has(name)) {
      await caches.delete(name);
    }
  }
  const modules = await caches.open(MODULES);
  for (const req of await modules.keys()) {
    if (new URL(req.url).searchParams.get('v') !== VERSION) {
      await modules.delete(req);
    }
  }
  const files = await caches.open(FILES);
  for (const req of await files.keys()) {
    const url = new URL(req.url);
    if (ASSETS[sitePath(url)] !== url.searchParams.get('sw')) {
      await files.delete(req);
    }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(prune().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const answer = route(event.request);
  if (answer) {
    event.respondWith(answer());
  }
});
