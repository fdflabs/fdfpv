/*
 * combat-water-check.js: toilet paper on the water, on the real shell.
 *
 * The owner, 2026-09-29: "the paper tail rips when on water, this should
 * not happen". Two headless pages in one private room on the Swiss valley:
 * A flies the Timber on floats, which starts afloat on the lake, B a five
 * inch held high out of the way (a round wants two pilots). A round is
 * started, and A rests afloat, takes off from the water, flies a circuit
 * and lands on it again, towing its fifty metres throughout.
 *
 * Two things are held, because "rips" can be either:
 *
 *   THE PAPER. It never parts on the water: no tear, no cut, no second
 *     lay (a lay is what a teleport of the tail does), fifty links on the
 *     tail at the end. A float plane never gets near the owner's 120 km/h,
 *     and the fastest the tow point went is printed against it.
 *   THE DRAWING. Paper resting on the lake is drawn lying flat on it,
 *     never through it: every vertex of every ribbon over the lake is at
 *     least CLEAR_M above the water as the GPU drew it there
 *     (window.__water), and no cross section lying on the water stands on
 *     edge, on A's screen and on B's, afloat before the take off and after
 *     the landing. Before the fix half the vertices were under the water,
 *     and the ribbon showed as dashes on it, which is what "rips" was.
 *
 *   npm run combat:water [rooms url]
 *
 * With no rooms url it starts edge/rooms/node.js on a free port with a
 * scratch database, as combat:restart does. SIM_GPU=1 flies it at the
 * sim's own speed; on SwiftShader the circuit takes several minutes.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { TEAR_SPEED_MPS } from '../src/game/streamer.js';
import { FULL_LINKS } from '../edge/rooms/combat.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/*
 * How far above the drawn water a ribbon's vertex must be. The shell's
 * camera has a 0.2 m near plane, so a 24 bit depth buffer tells apart
 * surfaces a few millimetres apart at a hundred metres, beyond which the
 * lake's detailed patch is not drawn at all: a centimetre is clear of the
 * water on screen, where a vertex on the surface fights it.
 */
const CLEAR_M = 0.01;

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

let server = null;
let scratch = null;
let rooms = process.argv[2];
if (!rooms) {
  scratch = mkdtempSync(join(tmpdir(), 'fdfpv-combat-water-'));
  const { startRooms } = await import('../edge/rooms/node.js');
  server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
  rooms = `http://127.0.0.1:${server.port}`;
}

function seedFor(id) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = false;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

/*
 * What the paper did, counted in the page: every lay, every part that
 * came off (a tear or a cut) and the fastest the tow point went, from the
 * streamer the shell steps. The module is the page's own, so patching its
 * class reaches the shell's paper.
 */
const WATCH = `import('/src/game/streamer.js').then((m) => {
  const P = m.Streamer.prototype;
  const w = window.__paperWatch = { lays: 0, parts: [], fastest: 0 };
  const step = P.step;
  P.step = function (...a) {
    step.apply(this, a);
    if (this.attached) {
      w.fastest = Math.max(w.fastest, this.speed);
    }
  };
  const lay = P.lay;
  P.lay = function (...a) {
    w.lays += 1;
    return lay.apply(this, a);
  };
  const split = P.split;
  P.split = function (k, kind) {
    w.parts.push({ kind, keep: k, speed: this.speed });
    return split.call(this, k, kind);
  };
  return true;
})`;

/*
 * Every ribbon's vertices against the water drawn under them: how many
 * are over the lake, how many less than CLEAR_M above it, the least; and
 * of the ribbon's cross sections at nodes the paper's physics rests on the
 * water (within a centimetre of the still surface, on this page's chains,
 * its own and the peers'), how many stand on edge, one edge more than
 * FLAT_M above the other: a ribbon twisting through the water, not lying
 * on it.
 */
const FLAT_M = 0.01;
const drawn = (surfaceY) => `(() => {
  const c = window.__combat();
  const rest = [];
  for (const ch of [...(c.paper ? c.paper.chains : []), ...c.peers.flatMap((p) => p.chains)]) {
    for (const n of ch.nodes) {
      if (Math.abs(n[1] - ${surfaceY}) < 0.01) {
        rest.push(n);
      }
    }
  }
  const layer = window.__mapScene().getObjectByName('streamers');
  const meshes = [];
  layer.traverse((o) => {
    if (o.name === 'streamer' && o.visible && o.geometry.drawRange.count > 0) {
      meshes.push(o);
    }
  });
  let over = 0;
  let low = 0;
  let least = Infinity;
  let lying = 0;
  let edgeOn = 0;
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position').array;
    const nodes = m.geometry.drawRange.count / 6 + 1;
    for (let v = 0; v < nodes * 2; v += 1) {
      /* Not over the lake: no plant water there, and the drawn height is
       * whatever the probe met. */
      const w = window.__water(pos[v * 3], pos[v * 3 + 2]);
      if (!w || w.plant == null || w.drawn == null) {
        continue;
      }
      const clear = pos[v * 3 + 1] - w.drawn;
      over += 1;
      least = Math.min(least, clear);
      if (clear < ${CLEAR_M}) {
        low += 1;
      }
    }
    for (let i = 0; i < nodes; i += 1) {
      const mx = (pos[i * 6] + pos[i * 6 + 3]) / 2;
      const mz = (pos[i * 6 + 2] + pos[i * 6 + 5]) / 2;
      if (!rest.some((n) => (n[0] - mx) * (n[0] - mx) + (n[2] - mz) * (n[2] - mz) < 0.04)) {
        continue;
      }
      lying += 1;
      if (Math.abs(pos[i * 6 + 1] - pos[i * 6 + 4]) > ${FLAT_M}) {
        edgeOn += 1;
      }
    }
  }
  return { ribbons: meshes.length, over, low, least, lying, edgeOn };
})()`;

/*
 * The pilot, in the page, once a frame (scripts/floats-shell.js's, on the
 * Timber): afloat a while, full throttle onto the step and off, a climb to
 * ten metres, a descent and a flare back onto the water, and slowed.
 */
const PILOT = `(() => {
  const L = window.__circuit = { phase: 'afloat', done: false };
  let tPhase = performance.now();
  let onStep = false;
  let dryMs = 0;
  let lastT = tPhase;
  const next = (p) => { L.phase = p; tPhase = performance.now(); };
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (!c || c.mode !== 'flight' || !c.fwd || !c.floats) {
      requestAnimationFrame(tick);
      return;
    }
    const pitch = Math.asin(Math.max(-1, Math.min(1, c.fwd.y)));
    const right = { y: c.fwd.z * c.up.x - c.fwd.x * c.up.z };
    const roll = Math.max(-1, Math.min(1, 3 * right.y - 0.15 * (c.rates ? c.rates.p : 0)));
    const hold = (deg) => Math.max(-1, Math.min(1, 3 * (deg * Math.PI / 180 - pitch) + 0.3 * (c.rates ? c.rates.q : 0)));
    const f = c.floats.state;
    const wet = f[4] + f[5] > 0;
    const height = c.worldY - window.__circuitLake;
    const inPhase = (now - tPhase) / 1000;
    let sticks = [0, 0, 0, 0];
    if (L.phase === 'afloat') {
      if (inPhase > 3) next('takeoff');
    } else if (L.phase === 'takeoff') {
      if (!onStep && f[0] < 0.25 * 1.934 * 9.81 && inPhase > 0.3) onStep = true;
      sticks = [roll, !onStep || c.speed > 7.5 ? 1 : hold(4), 0, 1];
      dryMs = wet ? 0 : dryMs + dt;
      if (dryMs > 300) next('climb');
      if (inPhase > 120) next('failed');
    } else if (L.phase === 'climb') {
      sticks = [roll, hold(8), 0, 0.8];
      if (height > 10) next('cruise');
    } else if (L.phase === 'cruise') {
      sticks = [roll, hold(1), 0, 0.6];
      if (inPhase > 6) next('descend');
    } else if (L.phase === 'descend') {
      sticks = [roll, hold(-5), 0, 0.15];
      if (height < 1.2) next('flare');
    } else if (L.phase === 'flare') {
      sticks = [roll, hold(7), 0, 0];
      if (wet) next('touchdown');
      if (inPhase > 120) next('failed');
    } else if (L.phase === 'touchdown') {
      sticks = [roll, 1, 0, 0];
      if (c.speed < 1.0) next('slowed');
      if (inPhase > 180) next('failed');
    } else if (L.phase === 'slowed') {
      if (inPhase > 3) { L.done = true; }
    } else {
      L.done = true;
    }
    L.speed = Math.max(L.speed || 0, c.speed);
    L.top = Math.max(L.top || 0, height);
    window.__stick(sticks[0], sticks[1], sticks[2], sticks[3]);
    if (!L.done) {
      requestAnimationFrame(tick);
    } else {
      window.__stick(0, 0, 0, 0);
    }
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`toilet paper on the water, two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 960, height: 540, seed: seedFor('timber1500f') });
const b = await openPage({ root, url, width: 640, height: 360, seed: seedFor('interceptor') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
    await p.tap('KeyZ');
  }
  await a.evaluate(WATCH);
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  const lake = (await a.evaluate('window.__crashWater()'))[0];
  const start = await a.evaluate('window.__craftState()');
  check('A, on floats, starts afloat on the lake', Boolean(lake && start.floats && start.floats.onWater), lake ? `surface ${lake.surfaceY} m` : 'no lake');
  await a.evaluate(`window.__circuitLake = ${lake.surfaceY}; true`);
  /* B held up over the lake, eighty metres to the side of where A will
   * fly and a hundred ahead, so B's screen sees A's paper from where a
   * pilot in the room would, and its own paper hangs onto the water too. */
  await b.evaluate(`(() => {
    const x = ${start.worldX + 80}, z = ${start.worldZ - 100};
    window.__crashThrow({ x, y: ${lake.surfaceY + 45}, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true });
    return true;
  })()`);
  await a.evaluate("window.__ui.act('friends-combat-3'); true");
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'on'", 60000);
  }
  await a.sleep(3000);

  const resting = await a.evaluate(`(() => {
    const c = window.__combat();
    const nodes = c.paper.chains[0].nodes;
    return { links: c.paper.links, chains: c.paper.chains.length, onWater: nodes.filter((n) => Math.abs(n[1] - ${lake.surfaceY}) < 0.01).length, n: nodes.length };
  })()`);
  check('afloat, A tows its fifty metres whole, lying on the water behind it', resting.links === FULL_LINKS && resting.chains === 1 && resting.onWater >= FULL_LINKS * 0.8,
    `${resting.links} m, ${resting.chains} chain, ${resting.onWater} of ${resting.n} nodes on the water`);
  const drawnA = await a.evaluate(drawn(lake.surfaceY));
  check(`on A's screen the paper lying on the lake is drawn on it, every vertex ${CLEAR_M * 100} cm or more above the water drawn there`, drawnA.over > FULL_LINKS && drawnA.low === 0,
    `${drawnA.low} of ${drawnA.over} vertices lower, the least ${(drawnA.least * 100).toFixed(1)} cm`);
  check('and lies flat on it, not on edge', drawnA.lying > FULL_LINKS * 0.8 && drawnA.edgeOn === 0,
    `${drawnA.edgeOn} of ${drawnA.lying} cross sections lying on the water stand on edge`);
  await b.until('window.__combat().peers[0] && window.__combat().peers[0].chains.length > 0', 10000);
  const drawnB = await b.evaluate(drawn(lake.surfaceY));
  check('and on B\'s screen, A\'s paper and B\'s own where it reaches the lake, the same', drawnB.over > FULL_LINKS && drawnB.low === 0 && drawnB.lying > FULL_LINKS * 0.8 && drawnB.edgeOn === 0,
    `${drawnB.low} of ${drawnB.over} vertices lower, the least ${(drawnB.least * 100).toFixed(1)} cm, ${drawnB.edgeOn} of ${drawnB.lying} on edge`);

  await a.evaluate(PILOT);
  const t0 = Date.now();
  let phase = '';
  while (Date.now() - t0 < 900000) {
    const c = await a.evaluate('window.__circuit');
    if (c.phase !== phase) {
      phase = c.phase;
      console.log(`  A ${phase}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    if (c.done) {
      break;
    }
    await a.sleep(1000);
  }
  const circuit = await a.evaluate('window.__circuit');
  check('A takes off from the water, flies a circuit and lands on it again', circuit.done && circuit.phase === 'slowed' && circuit.top > 8,
    `${circuit.phase}, top ${(circuit.top || 0).toFixed(1)} m, ${(circuit.speed || 0).toFixed(1)} m/s at most`);
  await a.sleep(3000);
  const watch = await a.evaluate('window.__paperWatch');
  check('the tow point never went near the owner\'s 120 km/h', watch.fastest < TEAR_SPEED_MPS,
    `${(watch.fastest * 3.6).toFixed(1)} km/h at most`);
  check('and the paper never parted: no tear, no cut, never laid again', watch.parts.length === 0 && watch.lays === 1,
    `${watch.parts.length} parts off ${JSON.stringify(watch.parts)}, ${watch.lays} lays`);
  const after = await a.evaluate('(() => { const c = window.__combat(); return { links: c.paper.links, chains: c.paper.chains.length }; })()');
  check('afloat again, still fifty metres on the tail', after.links === FULL_LINKS && after.chains === 1,
    `${after.links} m, ${after.chains} chain`);
  const landedA = await a.evaluate(drawn(lake.surfaceY));
  check('and still drawn lying on the water, not through it', landedA.over > FULL_LINKS && landedA.low === 0 && landedA.lying > FULL_LINKS * 0.8 && landedA.edgeOn === 0,
    `${landedA.low} of ${landedA.over} vertices lower, the least ${(landedA.least * 100).toFixed(1)} cm, ${landedA.edgeOn} of ${landedA.lying} on edge`);

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  if (server) {
    await server.stop();
    rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
