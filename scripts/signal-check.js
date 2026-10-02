/*
 * signal-check.js: prove the war mode's radio (src/game/signal.js) on the
 * real Itaipu ground, and the three places it reaches: the link
 * (src/input/link.js setSignal), the picture (src/render/fpvfail.js
 * signal) and the planes' failsafe (PlaneFailsafe, on the real module).
 *
 * The ground is the pipeline's tiles in FDFPV_ITAIPU_DATA (by default
 * ~/Desktop/fdfpv-itaipu-data), read the way the page reads them: every
 * level and the hero, then engine.js
 * finestAt's walk from the hero down and its two triangles a cell. The
 * walk is restated here, as scripts/town-check.js restates it, because
 * engine.js imports three.js and Node has none; the water is water.json's
 * outlines through src/game/water.js insideWater itself.
 *
 *   node scripts/signal-check.js           every check
 *   node scripts/signal-check.js --hash    print the determinism hash only
 *                                          (the check runs this in a
 *                                          second process and compares)
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

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
  decode, HERO, TILE_CELLS, TILE_SAMPLES, cellOf,
} from '../src/maps/terrain/frame.js';
import {
  ITAIPU_FRAME, LANDMARKS, RESERVOIR_Y, RIVER_Y,
} from '../src/maps/itaipu/terrain/frame.js';
import { insideWater } from '../src/game/water.js';
import {
  signalQuality, stationPoint, snowFor, linkDegradeFor, LinkWatch, PlaneFailsafe, FAILSAFE_RC,
  DEGRADE_DELAY_MS, LOST_AFTER_MS, AIRFRAME_LOST_AFTER_MS,
} from '../src/game/signal.js';
import { RcLink } from '../src/input/link.js';
import { createFpvFail } from '../src/render/fpvfail.js';
import { loadSim } from '../tests/lib/simmod.js';
import {
  must, attitude, wingDebug, skyPrelude, bramorPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const HASH_ONLY = process.argv.includes('--hash');

let passed = 0;
let failed = 0;
function check(what, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}${detail ? `  (${detail})` : ''}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
}

/* ------------------------------------------------------------ the ground */

async function loadGround() {
  const manifest = JSON.parse(await readFile(join(DATA, 'manifest.json'), 'utf8'));
  const tiles = new Map();
  const load = async (level, i, j) => {
    const b = await readFile(join(DATA, level === HERO ? `hero/${i}_${j}.bin` : `${level}/${i}_${j}.bin`));
    tiles.set(`${level}:${i}:${j}`, new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2).slice());
  };
  const jobs = [];
  for (const l of manifest.levels) {
    for (let j = 0; j < l.grid; j += 1) {
      for (let i = 0; i < l.grid; i += 1) {
        jobs.push(load(l.level, i, j));
      }
    }
  }
  for (const [i, j] of manifest.hero.tiles) {
    jobs.push(load(HERO, i, j));
  }
  await Promise.all(jobs);
  const get = (level, i, j) => tiles.get(`${level}:${i}:${j}`) ?? null;
  const HALF = ITAIPU_FRAME.half;
  const EXTENT = ITAIPU_FRAME.extent;
  const finestAt = (x, z) => {
    for (let level = HERO; level <= ITAIPU_FRAME.coarsest; level += 1) {
      const cell = cellOf(level);
      const gx = (x + HALF) / cell;
      const gz = (z + HALF) / cell;
      const ci = Math.floor(gx);
      const cj = Math.floor(gz);
      const ti = Math.floor(Math.min(ci, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const tj = Math.floor(Math.min(cj, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const d = get(level, ti, tj);
      if (!d) {
        continue;
      }
      const lx = Math.min(TILE_CELLS - 1, ci - ti * TILE_CELLS);
      const lz = Math.min(TILE_CELLS - 1, cj - tj * TILE_CELLS);
      const fu = Math.min(1, gx - ti * TILE_CELLS - lx);
      const fv = Math.min(1, gz - tj * TILE_CELLS - lz);
      const k = lz * TILE_SAMPLES + lx;
      const h00 = decode(d[k]);
      const h10 = decode(d[k + 1]);
      const h01 = decode(d[k + TILE_SAMPLES]);
      const h11 = decode(d[k + TILE_SAMPLES + 1]);
      if (fu + fv <= 1) {
        return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
      }
      return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
    }
    throw new Error(`no tile holds (${x}, ${z})`);
  };
  const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
  const bodies = water.map((b) => ({ kind: 'lake', surfaceY: b.y, outline: b.outline.map(([x, z]) => ({ x, z })) }));
  const waterAt = (x, z) => {
    for (const b of bodies) {
      if (insideWater(b, x, z)) {
        return b.surfaceY;
      }
    }
    return -Infinity;
  };
  return { finestAt, waterAt };
}

const { finestAt, waterAt } = await loadGround();
const groundAt = (x, z) => Math.max(finestAt(x, z), waterAt(x, z));

/*
 * The scene. The pilot stands at the Mirante on the Brazilian bank below
 * the dam. The craft is down in the gorge, on the river where it bends
 * west, 1.7 km away with the gorge's east wall between them; then the
 * same spot 400 m up. The relay circles over the gorge 300 m above the
 * river, where both the Mirante and the bend are in sight.
 */
const STATION = stationPoint(LANDMARKS.mirante, finestAt, waterAt);
const GORGE = { x: -750, z: 300 };
const LOW = { x: GORGE.x, y: groundAt(GORGE.x, GORGE.z) + 10, z: GORGE.z };
const HIGH = { x: GORGE.x, y: groundAt(GORGE.x, GORGE.z) + 400, z: GORGE.z };
const RELAY_AT = { x: -350, z: -350 };
const RELAY = {
  x: RELAY_AT.x, y: groundAt(RELAY_AT.x, RELAY_AT.z) + 300, z: RELAY_AT.z, airframe: 'sky1800',
};
const base = { station: STATION, finestAt, waterAt, waterTop: RESERVOIR_Y };

/* The determinism hash: a grid of calls over the gorge, every result's
 * bytes. Positions and relays vary so the hash covers every branch. */
function determinismHash(waterTop = RESERVOIR_Y) {
  const h = createHash('sha256');
  const f = new Float64Array(1);
  const u = new Uint8Array(f.buffer);
  for (let i = 0; i < 40; i += 1) {
    for (let j = 0; j < 40; j += 1) {
      const x = -1500 + i * 60;
      const z = -1500 + j * 90;
      const craft = { x, y: groundAt(x, z) + (i * 7 + j * 3) % 120 + 3, z };
      const r = signalQuality({
        ...base,
        waterTop,
        craft,
        relays: (i + j) % 3 === 0 ? [RELAY] : [],
        jammers: (i * j) % 5 === 0 ? [{ x: x + 200, y: craft.y, z: z - 100 }] : [],
      });
      f[0] = r.q;
      h.update(u);
      h.update(`${r.blocked ? 1 : 0}${r.via}`);
    }
  }
  return h.digest('hex');
}

if (HASH_ONLY) {
  console.log(determinismHash());
  process.exit(0);
}

console.log('signal-check');
console.log(`  data ${DATA}`);

/* ---------------------------------------------------------- the ground */

console.log('\nthe ground as the radio sees it');
check('the Mirante stands about 172 m up', Math.abs(STATION.y - 1.5 - 172) < 3, `${(STATION.y - 1.5).toFixed(2)} m`);
check('the gorge at the bend is the river, 103.5', waterAt(GORGE.x, GORGE.z) === RIVER_Y
  && groundAt(GORGE.x, GORGE.z) === RIVER_Y, `ground ${finestAt(GORGE.x, GORGE.z).toFixed(2)}, water ${waterAt(GORGE.x, GORGE.z)}`);
check('the reservoir reads 219.0 over the terrain', groundAt(0, -2500) === RESERVOIR_Y,
  `terrain ${finestAt(0, -2500).toFixed(2)}`);

/* ------------------------------------------------------- the four cases */

console.log('\nline of sight over the gorge');
const low = signalQuality({ ...base, craft: LOW });
check('low in the gorge, the gorge wall blocks the Mirante', low.blocked && low.q === 0, `q ${low.q}, blocked ${low.blocked}`);
const high = signalQuality({ ...base, craft: HIGH });
const dHigh = Math.hypot(HIGH.x - STATION.x, HIGH.y - STATION.y, HIGH.z - STATION.z);
const rangeHigh = dHigh <= 1500 ? 1 : (4000 - dHigh) / 2500;
check('400 m up over the same spot, the line is clear', !high.blocked && high.q > 0.5, `q ${high.q.toFixed(4)}`);
check('and q is the range rule at that distance', high.q === rangeHigh, `${dHigh.toFixed(1)} m, range ${rangeHigh.toFixed(4)}`);

const relayed = signalQuality({ ...base, craft: LOW, relays: [RELAY] });
check('a relay 300 m over the gorge restores the low craft', relayed.q > 0.9 && relayed.via === 0 && relayed.blocked,
  `q ${relayed.q.toFixed(4)}, via ${relayed.via}, direct blocked ${relayed.blocked}`);
const notRelay = signalQuality({ ...base, craft: LOW, relays: [{ ...RELAY, airframe: 'quad5' }] });
check('a quad in the same place is no relay', notRelay.q === 0 && notRelay.via === -1, `q ${notRelay.q}`);
const lowRelay = signalQuality({
  ...base, craft: LOW, relays: [{ ...RELAY, y: groundAt(RELAY_AT.x, RELAY_AT.z) + 140 }],
});
check('a relay under 150 m over the ground is no relay', lowRelay.q === 0, `q ${lowRelay.q}`);
const jam = { x: HIGH.x + 300, y: HIGH.y, z: HIGH.z };
const jammed = signalQuality({ ...base, craft: HIGH, jammers: [jam] });
check('a jammer 300 m from the craft halves q', jammed.q === high.q * 0.5,
  `${high.q.toFixed(4)} to ${jammed.q.toFixed(4)}`);
const farJam = signalQuality({ ...base, craft: HIGH, jammers: [{ ...jam, x: HIGH.x + 700 }] });
check('a jammer past 600 m does nothing', farJam.q === high.q);
const far = signalQuality({ ...base, craft: { x: STATION.x, y: STATION.y + 4100, z: STATION.z } });
check('4 100 m straight up is out of range', far.q === 0 && !far.blocked);

console.log('\ndeterminism');
const h1 = determinismHash();
const h2 = determinismHash();
const h3 = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--hash'], { encoding: 'utf8' }).trim();
check('two runs in one process are bit identical', h1 === h2, h1.slice(0, 16));
check('and a second process agrees', h1 === h3, h3.slice(0, 16));
check('skipping the water over its highest surface changes no answer', determinismHash(Infinity) === h1);

console.log('\ncost');
function perCall(label, args) {
  const N = 20000;
  for (let i = 0; i < 2000; i += 1) {
    signalQuality(args);
  }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) {
    signalQuality(args);
  }
  const us = Number(process.hrtime.bigint() - t0) / 1e3 / N;
  console.log(`  ${label.padEnd(58)} ${us.toFixed(2)} us a call`);
  return us;
}
/* Most of a call is the ground function, which is the caller's: the
 * terrain walk, and the water's point in polygon test over two outlines of
 * 232 corners each. Timed apart so the number says whose cost it is. */
{
  const N = 200000;
  let sink = 0;
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) {
    sink += finestAt(-500 + (i % 1000), -300);
  }
  const tFinest = Number(process.hrtime.bigint() - t0) / N;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) {
    sink += Math.max(waterAt(-500 + (i % 1000), -300), 0);
  }
  const tWater = Number(process.hrtime.bigint() - t0) / N;
  console.log(`  ground samples: finestAt ${tFinest.toFixed(0)} ns, waterAt ${tWater.toFixed(0)} ns (${sink > 0 ? 'ok' : ''})`);
  console.log(`  a 1.7 km leg is ${Math.ceil(dHigh / 20) - 1} samples`);
}
perCall('clear, 1.7 km, no relays', { ...base, craft: HIGH });
perCall('the same, water asked at every sample (no waterTop)', { ...base, craft: HIGH, waterTop: Infinity });
perCall('the same, terrain only (no waterAt)', { ...base, craft: HIGH, waterAt: null });
perCall('blocked, 1.7 km, one relay carrying it', { ...base, craft: LOW, relays: [RELAY] });
const seven = Array.from({ length: 7 }, (_, k) => ({ ...RELAY, x: RELAY.x + k * 150 }));
const worst = perCall('blocked, seven relays, two jammers (a full war room)', {
  ...base, craft: LOW, relays: seven, jammers: [jam, { ...jam, z: jam.z + 500 }],
});
check('a full room\'s worst case costs under 0.5 ms a frame', worst < 500, `${worst.toFixed(1)} us`);

/* ------------------------------------------------------- what q does */

console.log('\nthe rules q drives');
check('no snow at 0.5 and up', snowFor(0.5) === 0 && snowFor(1) === 0);
check('full snow at 0', snowFor(0) === 1 && snowFor(0.25) === 0.5);
const d0 = linkDegradeFor(0.3, false);
const d1 = linkDegradeFor(0.25 / 2, false);
const d2 = linkDegradeFor(0, false);
const dl = linkDegradeFor(0, true);
check('the link is untouched at 0.25 and up', d0.delayMs === 0 && d0.lossPpm === 0);
check('below it, 120 ms late with loss rising to 90 %', d1.delayMs === DEGRADE_DELAY_MS && d1.lossPpm === 450000
  && d2.lossPpm === 900000, `${d1.lossPpm} and ${d2.lossPpm} ppm`);
check('a lost link loses every packet', dl.lossPpm === 1e6);

const watch = new LinkWatch();
watch.update(0, 1000);
const early = watch.lost;
watch.update(0, 1000 + LOST_AFTER_MS);
const lostAt = watch.lost;
watch.update(0, 1000 + LOST_AFTER_MS + AIRFRAME_LOST_AFTER_MS - 1);
const notYet = watch.airframeLost;
watch.update(0, 1000 + LOST_AFTER_MS + AIRFRAME_LOST_AFTER_MS);
check('q at 0 for 0.5 s loses the link, not before', !early && lostAt);
check('3 s lost loses the airframe, not before', !notYet && watch.airframeLost);
watch.update(0.4, 9000);
check('the link comes back with q, the airframe stays lost', !watch.lost && watch.airframeLost);

/* ------------------------------------------------------------- the link */

console.log('\nthe link under a signal');
function pumpRun(link, ms, blockMs, perBlock) {
  const out = [];
  link.reset(0);
  const pick = (atMs) => ({ roll: atMs, pitch: 0, yaw: 0, throttle: 0.5 });
  for (let t = blockMs; t <= ms; t += blockMs) {
    if (perBlock) {
      perBlock(link, t - blockMs);
    }
    out.push(...link.pump(t, pick));
  }
  return out;
}
const same = (x, y) => x.length === y.length && x.every((p, i) => p.tMs === y[i].tMs && p.rc.roll === y[i].rc.roll);
const plain = pumpRun(new RcLink('elrs250', 0xABCD1234), 2000, 16);
const zeroSig = pumpRun(new RcLink('elrs250', 0xABCD1234), 2000, 16, (l, at) => l.setSignal(0, 0, null, at));
check('a signal of nothing leaves a preset bit identical', same(plain, zeroSig), `${plain.length} packets`);
check('and leaves perfect the identity', (() => {
  const l = new RcLink('perfect');
  l.setSignal(0, 0, null, 0);
  return l.isPerfect();
})());

const lag = new RcLink('perfect');
lag.reset(0);
lag.nextMs = 12345;
lag.setSignal(DEGRADE_DELAY_MS, 0, null, 400);
check('perfect under a signal is not the identity, and takes the shell\'s slot clock', !lag.isPerfect() && lag.nextMs === 400);
const lagged = lag.pump(800, (atMs) => ({ roll: atMs, pitch: 0, yaw: 0, throttle: 0.5 }));
check('a degraded packet is stamped on its slot and carries sticks 120 ms old',
  lagged.length === 100 && lagged.every((p) => p.tMs - p.rc.roll === DEGRADE_DELAY_MS), `${lagged.length} packets`);
lag.setSignal(0, 0, null, 800);
check('and the link is the identity again once the signal clears', lag.isPerfect());

const lossy = new RcLink('perfect', 0x13572468);
lossy.setSignal(DEGRADE_DELAY_MS, linkDegradeFor(0, false).lossPpm, null, 0);
let lossThrough = 0;
for (let t = 16; t <= 20000; t += 16) {
  lossThrough += lossy.pump(t, (atMs) => ({ roll: atMs, pitch: 0, yaw: 0, throttle: 0.5 })).length;
}
const lossOut = { length: lossThrough };
const lossFrac = lossy.dropped / lossy.sent;
/* 5 000 draws: one binomial sigma is 0.42 %, so 1.5 % is 3.5 sigma. */
check('q at 0 loses about 90 % of packets', Math.abs(lossFrac - 0.9) < 0.015,
  `${(lossFrac * 100).toFixed(2)} % of ${lossy.sent}, ${lossOut.length} through`);
const cut = new RcLink('elrs250', 0x2468ACE0);
cut.setSignal(DEGRADE_DELAY_MS, 1e6, null, 0);
check('a lost link lets nothing through', cut.pump(2000, () => ({ roll: 1, pitch: 0, yaw: 0, throttle: 1 })).length === 0);

const fsLink = new RcLink('elrs250', 0x2468ACE0);
fsLink.setSignal(DEGRADE_DELAY_MS, 1e6, FAILSAFE_RC, 0);
const fsOut = fsLink.pump(1000, () => ({ roll: 1, pitch: 1, yaw: 1, throttle: 1 }));
check('under a receiver failsafe every slot carries the failsafe sticks, throttle cut',
  fsOut.length === 250 && fsOut.every((p) => p.rc === FAILSAFE_RC && p.rc.throttle === 0), `${fsOut.length} packets`);
let mono = true;
for (let i = 1; i < fsOut.length; i += 1) {
  mono = mono && fsOut[i].tMs >= fsOut[i - 1].tMs;
}
check('in non decreasing stamp order', mono);

/* ---------------------------------------------------------- the picture */

console.log('\nthe picture, with crash damage off');
{
  const ctx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
    fillRect() {},
  };
  globalThis.document = {
    createElement: () => ({ setAttribute() {}, style: {}, getContext: () => ctx }),
  };
  const view = { after() {}, style: {} };
  const feed = createFpvFail(view);
  feed.update(0, true);
  check('no damage and a good signal: no overlay', feed.element.style.display !== 'block');
  feed.signal(snowFor(0.2));
  feed.update(16, true);
  check('a weak signal breaks the feed up with no damage flag set',
    feed.element.style.display === 'block' && feed.level(16).snow === snowFor(0.2) && feed.deadSince() < 0,
    `snow ${feed.level(16).snow}`);
  feed.signal(snowFor(0));
  check('q at 0 is full static', feed.level(32).snow === 1);
  feed.signal(0);
  feed.update(48, true);
  check('and the picture clears with the signal', feed.element.style.display === 'none');
  delete globalThis.document;
}

/* ---------------------------------------------------- the planes' rule */

console.log('\nthe planes\' failsafe, on the real module');
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');
must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.4, 0), 'ground');
{
  /* The Skyhunter in Manual, climbing out banked hard right under power,
   * then the link goes. The rule must level it and cut the motor. */
  must(sim.reset(), 'reset');
  must(sim.e.sim_wing_set_stab(0), 'manual');
  skyPrelude(sim);
  const bank = 35 * Math.PI / 180;
  must(sim.e.sim_set_pose(0, 0, 150, Math.cos(bank / 2), Math.sin(bank / 2), 0, 0), 'pose');
  must(sim.e.sim_wing_launch(16), 'launch');
  const fs = new PlaneFailsafe();
  const link = new RcLink('elrs250', 0x5EED);
  let clock = 0;
  let s = null;
  const pilot = () => ({ roll: 0.2, pitch: 0.1, yaw: 0, throttle: 0.8 });
  const flyMs = (ms, lost) => {
    for (let t = 0; t < ms; t += 16) {
      const rc = fs.update(lost, sim.e, { chute: false });
      link.setSignal(lost ? DEGRADE_DELAY_MS : 0, lost ? 1e6 : 0, rc, clock);
      clock += 16;
      for (const p of link.pump(clock, pilot)) {
        must(sim.input(p.tMs / 1000, p.rc.roll, p.rc.pitch, p.rc.yaw, p.rc.throttle), 'input');
      }
      must(sim.step(16), 'step');
      s = sim.readState().state;
    }
  };
  flyMs(400, false);
  const before = attitude(s).bank;
  flyMs(6000, true);
  const after = attitude(s).bank;
  const thrust = wingDebug(sim)[8];
  check('on loss the wing goes to Stabilised', sim.e.sim_wing_stab() === 1 && fs.active);
  check('and levels its wings from a hard bank', Math.abs(after) < 5 * Math.PI / 180,
    `${(before * 180 / Math.PI).toFixed(1)} to ${(after * 180 / Math.PI).toFixed(1)} deg`);
  check('with the throttle cut', Math.abs(thrust) < 0.05, `thrust ${thrust.toFixed(3)} N`);
  check('still flying, gliding down', s[3] > 50, `z ${s[3].toFixed(1)} m`);
  flyMs(100, false);
  check('the link back puts the pilot\'s Manual back', sim.e.sim_wing_stab() === 0 && !fs.active);
}
{
  must(sim.reset(), 'reset');
  must(sim.e.sim_wing_set_stab(2), 'acro');
  bramorPrelude(sim);
  must(sim.e.sim_set_pose(0, 0, 120, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(18), 'launch');
  const fs = new PlaneFailsafe();
  const rc = fs.update(true, sim.e, { chute: true });
  for (let ms = 0; ms < 2500; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, rc.roll, rc.pitch, rc.yaw, rc.throttle), 'input');
    must(sim.step(RC_STEP_MS), 'step');
  }
  const open = sim.e.sim_wing_chute_open();
  check('the Bramor pulls its chute on loss', open > 0.9, `open ${open.toFixed(2)}`);
  fs.update(false, sim.e, { chute: true });
  check('and gets its Acro back with the link, chute still out', sim.e.sim_wing_stab() === 2 && sim.e.sim_wing_chute_open() > 0.9);
  const ground = new PlaneFailsafe();
  must(sim.reset(), 'reset');
  bramorPrelude(sim);
  ground.update(true, sim.e, { chute: true, airborne: false });
  check('on the ground it does not', sim.e.sim_wing_chute_open() === 0);
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exitCode = failed ? 1 : 0;
