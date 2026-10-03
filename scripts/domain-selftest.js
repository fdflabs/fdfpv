/*
 * domain-selftest.js: the move to the game's own domain, in Node.
 *
 *     node scripts/domain-selftest.js      (npm run domain:selftest)
 *
 * Which servers the page picks (src/share/api.js, and the three readers of
 * it: rooms.js, cloud.js, board.js) on the new domain, its www, the old
 * GitHub Pages address and loopback, and the probe's fallback to the VM's
 * bare address while the API name's DNS spreads. Then the rooms server's
 * origin allowlist (edge/rooms/front.js), through its own fetch handler,
 * and the Caddyfile's two sites. The Caddyfile is read as text here; it
 * is run for real with `caddy validate` by deploy/vm/install.sh.
 *
 * Nothing here touches a network: fetch is a stand in, and the page's
 * window and storage are stand ins too.
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

import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = globalThis.localStorage;
const win = new EventTarget();
win.location = { search: '', hostname: 'paraguayandronecombatsimulator.com', href: 'https://paraguayandronecombatsimulator.com/' };
win.localStorage = globalThis.localStorage;
win.sessionStorage = globalThis.sessionStorage;
globalThis.window = win;

const api = await import('../src/share/api.js');
const { roomsOrigin } = await import('../src/share/rooms.js');
const { tracksOrigin } = await import('../src/share/cloud.js');
const { boardOrigin, PRODUCTION_BOARD_ORIGIN } = await import('../src/share/board.js');
const front = (await import('../edge/rooms/front.js')).default;
const { originAllowed } = await import('../edge/rooms/front.js');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const NAME = 'https://api.paraguayandronecombatsimulator.com';
const ADDRESS = 'https://129.151.39.48';

function at(hostname) {
  win.location = { search: '', hostname, href: `https://${hostname}/` };
}

/* A fetch that answers per origin: true is a 200, false a refused
 * connection, as a name that does not resolve yet fails. */
function fetchFor(answers) {
  const asked = [];
  const impl = (url) => {
    asked.push(url);
    const origin = new URL(url).origin;
    return answers[origin] ? Promise.resolve(new Response('{"ok":true}', { status: 200 })) : Promise.reject(new TypeError('fetch failed'));
  };
  return { impl, asked };
}

console.log('the servers the page picks');
check('the API is the VM by name', api.API_ORIGIN === NAME && api.FALLBACK_API_ORIGIN === ADDRESS);
check('before any probe, the name', api.apiOrigin() === NAME);
for (const host of ['paraguayandronecombatsimulator.com', 'www.paraguayandronecombatsimulator.com', 'fdflabs.github.io']) {
  at(host);
  check(`on ${host}: rooms, tracks and board all at the name`,
    roomsOrigin() === NAME && tracksOrigin() === NAME && boardOrigin() === `${NAME}/board`,
    `${roomsOrigin()} ${tracksOrigin()} ${boardOrigin()}`);
}
at('127.0.0.1');
check('on loopback: no rooms, no tracks, the local board', roomsOrigin() === null && tracksOrigin() === '' && boardOrigin() === 'http://127.0.0.1:3180',
  `${roomsOrigin()} ${tracksOrigin()} ${boardOrigin()}`);
check('the board constant is the name\'s /board', PRODUCTION_BOARD_ORIGIN === `${NAME}/board`);

console.log('the probe');
{
  api.resetApiProbe();
  const f = fetchFor({ [NAME]: true, [ADDRESS]: true });
  const got = await api.probeApi({ fetchImpl: f.impl });
  check('the name answers: the name, and the address is never asked', got === NAME && f.asked.length === 1 && f.asked[0] === `${NAME}/api/health`, f.asked.join(' '));
}
{
  api.resetApiProbe();
  const f = fetchFor({ [NAME]: false, [ADDRESS]: true });
  const got = await api.probeApi({ fetchImpl: f.impl });
  check('the name fails and the address answers: the address', got === ADDRESS && api.apiOrigin() === ADDRESS, got);
  at('paraguayandronecombatsimulator.com');
  check('and rooms, tracks and board follow it', roomsOrigin() === ADDRESS && tracksOrigin() === ADDRESS && boardOrigin() === `${ADDRESS}/board`,
    `${roomsOrigin()} ${tracksOrigin()} ${boardOrigin()}`);
  check('nothing about it is stored', ![...store.keys()].some((k) => /rooms|tracks\.origin|board\.origin/.test(k)), [...store.keys()].join(' '));
  const again = await api.probeApi({ fetchImpl: () => { throw new Error('asked twice'); } });
  check('one probe a page: a second call is the first answer', again === ADDRESS);
}
{
  api.resetApiProbe();
  const f = fetchFor({});
  const got = await api.probeApi({ fetchImpl: f.impl });
  check('neither answers (offline): the name stays', got === NAME && f.asked.length === 2, got);
}
{
  api.resetApiProbe();
  const timed = (url, init) => new Promise((resolve, reject) => {
    if (url.startsWith(ADDRESS)) {
      resolve(new Response('{}', { status: 200 }));
      return;
    }
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  /* AbortSignal.timeout's timer does not hold Node open; this one does. */
  const hold = setTimeout(() => {}, 5000);
  const got = await api.probeApi({ fetchImpl: timed, timeoutMs: 50 });
  clearTimeout(hold);
  check('a name that hangs is given up on: the address', got === ADDRESS, got);
}
{
  api.resetApiProbe();
  const status500 = (url) => Promise.resolve(new Response('', { status: url.startsWith(NAME) ? 502 : 200 }));
  const got = await api.probeApi({ fetchImpl: status500 });
  check('a name that answers but not ok (a 502) while the address answers: the address', got === ADDRESS, got);
}
api.resetApiProbe();
store.clear();

console.log('the rooms server\'s origins');
const allowed = [
  'https://paraguayandronecombatsimulator.com',
  'https://www.paraguayandronecombatsimulator.com',
  'https://fdflabs.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8123',
];
const refused = [
  'http://paraguayandronecombatsimulator.com',
  'https://paraguayandronecombatsimulator.com.evil.example',
  'https://evil.paraguayandronecombatsimulator.com',
  'https://api.paraguayandronecombatsimulator.com',
  'https://example.com',
];
for (const origin of allowed) {
  const res = await front.fetch(new Request('https://api.paraguayandronecombatsimulator.com/v2/create', { method: 'OPTIONS', headers: { origin } }), {});
  check(`${origin} gets its CORS answer`, originAllowed(origin) && res.status === 204 && res.headers.get('access-control-allow-origin') === origin,
    `${res.status} ${res.headers.get('access-control-allow-origin')}`);
}
for (const origin of refused) {
  const res = await front.fetch(new Request('https://api.paraguayandronecombatsimulator.com/v2/create', { method: 'OPTIONS', headers: { origin } }), {});
  check(`${origin} is refused`, !originAllowed(origin) && res.status === 403, String(res.status));
}

console.log('the tracks server');
{
  const http = readFileSync(new URL('../tracks-api/http.js', import.meta.url), 'utf8');
  check('answers every origin (no allowlist to extend)', /'access-control-allow-origin': '\*'/.test(http));
}

console.log('the Caddyfile');
{
  const caddy = readFileSync(new URL('../deploy/vm/Caddyfile', import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const block = (head) => {
    const i = caddy.indexOf(`\n${head} {`);
    if (i < 0) {
      return null;
    }
    let depth = 0;
    for (let j = caddy.indexOf('{', i); j < caddy.length; j += 1) {
      depth += caddy[j] === '{' ? 1 : caddy[j] === '}' ? -1 : 0;
      if (depth === 0) {
        return caddy.slice(i, j + 1);
      }
    }
    return null;
  };
  const servers = block('(servers)');
  check('one snippet holds the board, tracks and rooms routes',
    Boolean(servers) && /127\.0\.0\.1:3180/.test(servers) && /handle \/api\/\*[\s\S]*127\.0\.0\.1:8787/.test(servers) && /127\.0\.0\.1:8797/.test(servers));
  const ip = block('129.151.39.48');
  check('the bare address keeps its shortlived certificate and imports the routes', Boolean(ip) && /profile shortlived/.test(ip) && /import servers/.test(ip));
  const name = block('api.paraguayandronecombatsimulator.com');
  check('the API name imports the same routes', Boolean(name) && /import servers/.test(name));
  check('nothing else: the bare address and the API name are the only sites',
    (caddy.match(/^\S[^\n]*\{\s*$/gm) || []).map((l) => l.trim()).join(' | ') === '(servers) { | 129.151.39.48 { | api.paraguayandronecombatsimulator.com {',
    (caddy.match(/^\S[^\n]*\{\s*$/gm) || []).map((l) => l.trim()).join(' | '));
  check('the game\'s apex and www are not here (GitHub Pages serves them)',
    !/^(www\.)?paraguayandronecombatsimulator\.com\b/m.test(caddy));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
