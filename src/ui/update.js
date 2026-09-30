/*
 * update.js: notice that a newer deploy is out, so a tab open for hours
 * can offer a reload instead of running old code beside new data.
 *
 * The deploy stamps its version twice from the same commit (see
 * scripts/stamp-version.js): into this page's <meta name="fdfpv-version">,
 * which came with the import map every module here was loaded through, and
 * into version.json at the site root. This asks for version.json with
 * cache: 'no-store', so the answer is the deployed one and not a copy the
 * HTTP cache kept for its ten minutes, every few minutes and whenever the
 * tab comes back into view. A page with no stamp, served from a checkout
 * or a harness, asks nothing.
 *
 * A plain location.reload() is enough to leave the old version behind.
 * Chrome revalidates the document on a reload and serves subresources by
 * their normal cache rules, so before the stamp a reload inside max-age
 * still ran cached modules. The revalidated page names every module at
 * ?v=<new version>, URLs the cache has never seen. Measured by
 * scripts/version-reload-check.js against a server sending max-age=600.
 *
 * A room survives the reload by itself: src/share/rooms.js keeps the code
 * and the seat token in sessionStorage and main.js rejoins on the next
 * load.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* Pages deploys a few times an hour on a busy day; a tiny no-store fetch
 * this often costs nothing next to the poses a room sends. */
const CHECK_MS = 3 * 60 * 1000;

export function pageVersion() {
  return document.querySelector('meta[name="fdfpv-version"]')?.content || null;
}

/* Calls onChange(true) when the deployed version stops being this page's,
 * and onChange(false) if it comes back (a revert). Returns the check, to
 * ask again now (a room just joined), or a no-op on a page with no stamp. */
export function watchVersion(onChange) {
  const own = pageVersion();
  if (!own) {
    return () => {};
  }
  let deployed = own;
  let asking = false;
  const check = async () => {
    if (asking) {
      return;
    }
    asking = true;
    try {
      const res = await fetch(new URL('version.json', document.baseURI), { cache: 'no-store' });
      const body = res.ok ? await res.json() : null;
      const seen = body && typeof body.version === 'string' ? body.version : null;
      if (seen && seen !== deployed) {
        deployed = seen;
        onChange(seen !== own);
      }
    } catch (e) {
      /* Offline, or a body that is not JSON. Neither says a new version is
       * out, and the next check asks again. */
    } finally {
      asking = false;
    }
  };
  setInterval(check, CHECK_MS);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      check();
    }
  });
  check();
  return check;
}
