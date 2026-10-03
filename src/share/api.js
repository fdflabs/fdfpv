/*
 * api.js: where the deployed page finds its servers, named once.
 *
 * The rooms server (edge/rooms/node.js), the tracks and accounts server
 * (tracks-api/node.js) and the board (fdflabs/fdfpv-leaderboard, mounted at
 * /board) all answer at one origin on the owner's VM, behind Caddy
 * (deploy/vm/Caddyfile). src/share/rooms.js, cloud.js and board.js read it
 * from here; their ?rooms=, ?tracks= and ?board= overrides still outrank it.
 *
 * The game moved to its own domain on 3 October 2026. API_ORIGIN is the
 * VM by name. FALLBACK_API_ORIGIN is the same VM by address, which is what
 * the page used before, and it stays only while the name's DNS spreads and
 * Caddy fetches the name's certificate: until then a lookup or a handshake
 * for the name fails, and probeApi() moves this page to the address. Once
 * the name answers everywhere, delete the fallback and the probe. The
 * Cloudflare Workers the VM replaced, fdfpv-rooms and fdfpv-tracks on
 * fdfretes.workers.dev, are still deployed, and naming them here is the
 * way back to them.
 *
 * Requests made before the probe answers go to the name. While the name
 * does not resolve, such a request fails as a server that is down does,
 * and each caller already lives with that: rooms retry, uploads retry,
 * the board has deadlines.
 *
 * The probe's answer lives in this module only, never in localStorage: a
 * stored address would pin a pilot to it after the name works.
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

export const API_ORIGIN = 'https://api.paraguayandronecombatsimulator.com';
export const FALLBACK_API_ORIGIN = 'https://129.151.39.48';

/* The game's own domain, apex first. The apex is canonical; GitHub Pages
 * sends www to it. */
export const SITE_ORIGIN = 'https://paraguayandronecombatsimulator.com';

/* Every host the simulator is deployed at. fdflabs.github.io stays while
 * the old address is still served or redirected (DEPLOY.md, The move to
 * the game's own domain). */
export const SITE_HOSTS = [
  'paraguayandronecombatsimulator.com',
  'www.paraguayandronecombatsimulator.com',
  'fdflabs.github.io',
];

const PROBE_PATH = '/api/health';
const PROBE_TIMEOUT_MS = 4000;

let chosen = API_ORIGIN;
let probing = null;

export function apiOrigin() {
  return chosen;
}

async function answers(origin, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(`${origin}${PROBE_PATH}`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/*
 * Asks the name, and only when it does not answer, the address. Resolves
 * to the origin chosen, once per page; later calls get the same promise.
 * When neither answers the name is kept, so a page that came up offline
 * reaches the name when the network returns.
 */
export function probeApi({ fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  if (!probing) {
    probing = (async () => {
      if (await answers(API_ORIGIN, fetchImpl, timeoutMs)) {
        return chosen;
      }
      if (await answers(FALLBACK_API_ORIGIN, fetchImpl, timeoutMs)) {
        chosen = FALLBACK_API_ORIGIN;
      }
      return chosen;
    })();
  }
  return probing;
}

/* For the selftest: forget the probe, as a fresh page would. */
export function resetApiProbe() {
  chosen = API_ORIGIN;
  probing = null;
}
