/*
 * war-latejoin-two-page.js: a pilot joining a war already under way, on
 * the real shell (src/main.js's own wiring) and the real rooms server,
 * run in this process (edge/rooms/node.js):
 *
 *   SIM_GPU=1 npm run war:latejoin [-- outdir]
 *
 * A makes a private room on Itaipu and starts mission 1 alone. Once its
 * first round's waves are all in the air, B joins by the room's code and
 * flies. What must hold:
 *   - B is one of the match's players at once: the room has its token,
 *     both pages show its row and its share of the rack (4 to 8)
 *   - B's screen draws the attackers alive, the same ids at the same
 *     room ms as A's, to the micrometre (routes.js, the same numbers)
 *   - B launches: the room takes its poses and its takeoff, and B,
 *     held on the Striker's path, takes it, and both pages hear it
 *   - the next wave the room announces (round 2's Loiterers, n 1 and
 *     per 0.75) is sized for 2 on both screens, as the births each page
 *     heard on its own socket say
 *
 * Pictures go in outdir (build/war-latejoin by default, not committed).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { FLAG_CRASHED, FLAG_SPAWNING } from '../src/share/roomwire.js';
import { MISSIONS, waveSize } from '../src/share/war/missions/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const itaipu1 = MISSIONS['itaipu-1'];
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'war-latejoin');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

/* Every war text frame the rooms socket brings, kept for the check: what
 * this page's own socket was told, births above all. */
const TAP_SEED = `(() => {
  const Native = window.WebSocket;
  const heard = [];
  window.__warHeard = heard;
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      if (/\\/v2\\//.test(String(url))) {
        this.addEventListener('message', (ev) => {
          if (typeof ev.data === 'string' && ev.data.includes('"born"')) {
            heard.push(JSON.parse(ev.data));
          }
        });
      }
    }
  };
})();`;

function seedFor(colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.livery = { '5inch': { regions: { frame: colour } } };
  s.parts = {};
  return [TAP_SEED, `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const throwTo = (p, at, fresh) => p.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh}, showCraft: true })`);
/* Held at `at`, a whole airframe that can go off: begun 40 m over it, so
 * it has left its spawn (ROOM_SPAWN_M) when thrown down onto it, as
 * scripts/war-twopage.js holds its pilots. */
async function hold(p, at) {
  await throwTo(p, [at[0], at[1] + 40, at[2]], true);
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  await p.sleep(300);
  await throwTo(p, at, false);
}
const warOf = (p) => p.evaluate('window.__war()');
const nowOf = (p) => p.evaluate('window.__rooms().roomNow');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* The view without what only differs by when it was read. */
const same = (v) => JSON.stringify({ ...v, f: undefined });
/* The births a page's socket was told, by id. */
const bornOf = (p) => p.evaluate('window.__warHeard.flatMap((m) => m.agents)');

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-war-late-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const roomWarOf = () => {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
  return room ? room.host.core.war : null;
};
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`A pilot joining a war under way, two pages, rooms at ${rooms}`);

const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
const pages = [a, b];
const names = ['A', 'B'];

try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  }
  const code = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  check('page A makes a private room on Itaipu', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.evaluate(`window.__warDo('start', '${itaipu1.id}')`);
  await a.until("window.__war().view.state === 'live'", 30000 + (itaipu1.prepMs ?? 0));
  const goAt = (await warOf(a)).view.goAt;
  const seatA = await a.evaluate('window.__rooms().seat');
  /* Round 1's waves are all told by +2 s (2 s ahead of their births at
   * +2 and +4 s); B comes once they are all in the air. */
  await a.until(`window.__war().view.wave >= 3 && window.__rooms().roomNow > ${goAt + 5000}`, 30000);
  const alone = (await warOf(a)).view;
  check('A flies mission 1 alone: the rack is its 4 airframes', alone.rack === itaipu1.airframes && alone.rackMax === itaipu1.airframes,
    `rack ${alone.rack}/${alone.rackMax}, wave ${alone.wave}`);
  const born0 = await bornOf(a);
  check('the waves told before B came are sized for one', born0.length > 0 && born0.every((x) => x.n === waveSize(itaipu1.waves[x.wave], 1)),
    born0.map((x) => `${x.kind} n ${x.n}`).join(', '));

  /* B joins by the room's code, mid war. */
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  const seatB = await b.evaluate('window.__rooms().seat');
  const joinedAt = await nowOf(b);
  console.log(`  info  seats A ${seatA}, B ${seatB}; the go at room ms ${goAt}, B in at +${((joinedAt - goAt) / 1000).toFixed(1)} s`);
  const w = roomWarOf();
  const core = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war === w).host.core;
  const seatOfB = [...core.seats.values()].find((x) => x.seat === seatB);
  check('the room has B as one of the match\'s players at once, by its token', w.players(core).includes(seatB) && w.match.players[seatB].token === seatOfB.token,
    `players ${Object.keys(w.match.players).join()}`);
  await b.until(`window.__war().view.state === 'live' && window.__war().view.rackMax === ${2 * itaipu1.airframes}`, 15000).catch(() => {});
  await a.until(`window.__war().view.rackMax === ${2 * itaipu1.airframes}`, 15000).catch(() => {});
  const [va, vb] = await Promise.all(pages.map(warOf));
  check('both pages show B\'s row and its share of the rack: 8 of 8', same(va.view) === same(vb.view) && va.view.rack === 2 * itaipu1.airframes
    && va.view.rackMax === 2 * itaipu1.airframes && va.view.scores.some((r) => r.seat === seatB && !r.gone),
  `A ${va.view.rack}/${va.view.rackMax}, B ${vb.view.rack}/${vb.view.rackMax}, scores ${JSON.stringify(va.view.scores)}`);

  /* B's screen: the attackers alive, as A's, at one room ms. */
  const t = Math.floor(Math.min(await nowOf(a), await nowOf(b))) - 1500;
  const [la, lb] = await Promise.all(pages.map((p) => p.evaluate(`window.__warAt(${t})`)));
  const scripted = la.filter((x) => x.kind !== 'hunter');
  const off = scripted.reduce((m, x) => {
    const y = lb.find((q) => q.id === x.id);
    return Math.max(m, y ? dist(x.p, y.p) : Infinity);
  }, 0);
  check('B\'s screen draws every attacker alive, the same ids at the same places as A\'s', la.length > 0 && la.map((x) => x.id).join() === lb.map((x) => x.id).join() && off < 1e-6,
    `${lb.length} on B, ${la.length} on A, worst ${off} m`);

  /* B flies: the war's begin puts it in the air. */
  await b.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  const strike = (await b.evaluate(`window.__warAt(${Math.floor(await nowOf(b)) + 15000})`)).find((x) => x.kind === 'strike');
  check('B\'s screen has the Striker flying on for 15 s more', Boolean(strike), strike ? `id ${strike.id}` : 'none');
  const tHit = Math.floor(await nowOf(b)) + 15000;
  const P = (await b.evaluate(`window.__warAt(${tHit})`)).find((x) => x.id === strike.id).p;
  await hold(a, [P[0] + 300, P[1] + 60, P[2]]);
  await hold(b, P);
  await b.until('window.__rooms().spawning === false', SPAWN_MS + 10000);
  /* The room marks a fresh flight spawning for SPAWN_MS after the page
   * stops saying so (edge/rooms/safety.js). */
  const newest = () => roomWarOf().seats.get(seatB)?.track.s.at(-1);
  for (let k = 0; k < 40 && !(newest() && !(newest().flags & (FLAG_CRASHED | FLAG_SPAWNING))); k += 1) {
    await b.sleep(250);
  }
  const last = newest();
  const mode = await b.evaluate('window.__craftState().mode');
  check('B launches: in flight, and the room judges its poses, whole and past its spawn', mode === 'flight' && Boolean(last) && last.t > joinedAt
    && !(last.flags & (FLAG_CRASHED | FLAG_SPAWNING)), last ? `${mode}, newest pose at room ms ${last.t}, flags 0x${last.flags.toString(16)}` : `${mode}, no samples`);
  await shot(b, '1-B-on-the-strikers-path');
  await b.until(`window.__war().log.some((e) => e.type === 'boom' && e.seat === ${seatB})`, 40000).catch(() => {});
  await a.until(`window.__war().log.some((e) => e.type === 'dead' && e.by === ${seatB})`, 10000).catch(() => {});
  const [ka, kb] = await Promise.all(pages.map(warOf));
  const deadA = ka.log.find((e) => e.type === 'dead' && e.by === seatB);
  const deadB = kb.log.find((e) => e.type === 'dead' && e.by === seatB);
  check('B takes the Striker, and both pages hear it the same', deadA && deadB && deadB.mine && deadA.ids.join() === deadB.ids.join() && deadA.ids.includes(strike.id)
    && deadA.at === deadB.at, deadA ? `ids ${deadA.ids} at ${deadA.at}` : 'none');
  await a.until(`window.__war().view.scores.some((r) => r.seat === ${seatB} && r.kills >= 1)`, 10000).catch(() => {});
  const ks = (await warOf(a)).view.scores.find((r) => r.seat === seatB);
  check('B\'s kill is on A\'s screen', ks && ks.kills >= 1, JSON.stringify(ks));

  /* The next wave the room tells: round 2's first, sized for two. */
  const next = itaipu1.waves.findIndex((x) => (x.round ?? 0) === 1);
  const want = waveSize(itaipu1.waves[next], 2);
  console.log(`  info  waiting for round 1 to end and wave ${next + 1} (${itaipu1.waves[next].kind}, n ${itaipu1.waves[next].n} per ${itaipu1.waves[next].per}) to be told`);
  await a.until(`window.__warHeard.some((m) => m.agents.some((x) => x.wave === ${next}))`, 400000);
  await b.until(`window.__warHeard.some((m) => m.agents.some((x) => x.wave === ${next}))`, 20000);
  const [ba, bb] = await Promise.all(pages.map(bornOf));
  const ofA = ba.filter((x) => x.wave === next);
  const ofB = bb.filter((x) => x.wave === next);
  check(`the next wave is sized for 2 on both screens: ${want} ${itaipu1.waves[next].kind}s, not ${waveSize(itaipu1.waves[next], 1)}`, ofA.length === want && ofA.every((x) => x.n === want)
    && JSON.stringify(ofA) === JSON.stringify(ofB), `A ${ofA.length} (n ${ofA.map((x) => x.n)}), B ${ofB.length}`);
  await shot(b, '2-B-next-wave');
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ war: window.__war && window.__war().view, rooms: window.__rooms && window.__rooms().phase })').catch((x) => String(x));
    console.log(`  page ${names[i]}: ${String(st).slice(0, 1500)}`);
    console.log(`  page ${names[i]} errors: ${p.errors.slice(0, 5).join(' | ')}`);
  }
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  for (const p of pages) {
    await p.close();
  }
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
