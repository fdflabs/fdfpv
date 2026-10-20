/*
 * itaipu-spawns-check.js: package H's promises for Itaipu, measured
 * (docs/ITAIPU-PLAN.md sections 10, 11 and 14, row H).
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/itaipu-spawns-check.js
 *       [--only=spawns,rooms,attract] [--shots=DIR]
 *
 * In headless Chromium (tests/lib/page.js), the map built by the shell with
 * each class's default aircraft seated (src/ui/ui.js FIRST_AIRFRAME for
 * the planes, the five inch, and the Timber on floats), crash damage on:
 *
 *   spawns      every start the map has for the class (src/maps/itaipu/
 *               spawns.js, and ?spawn= for the river and the air) is where
 *               it says, and 2 s of the plant's clock after the run starts
 *               the aircraft has taken no damage and is settled: at rest on
 *               its ground, afloat on its body, or in the air clear of
 *               everything;
 *   rooms       every seat of a room of eight at the planes', the quads'
 *               and the reservoir's spawn (src/game/slots.js, the spawn's
 *               own row) settles the same way, the planes on the crest;
 *   attract     the title's flight is 30 m clear of the ground, the water,
 *               every roof, the forest's canopy and every collider round
 *               it, all the way round, and has the dam in its lens for a
 *               share of the loop that is printed.
 *
 * --shots=DIR (default ~/Desktop/fdfpv-loop/itaipu/h-spawns) takes a
 * picture of each spawn and of the title's flight. Pictures are evidence
 * for one look, never committed.
 *
 * Exits 1 on any failure.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, FIRST_AIRFRAME, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { slotSpawn, SLOT_RIGHT_M } from '../src/game/slots.js';
import { CREST_SPAWN, AIR_SPAWN } from '../src/maps/itaipu/spawns.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const opts = { only: 'spawns,rooms,attract', shots: join(homedir(), 'Desktop', 'fdfpv-loop', 'itaipu', 'h-spawns') };
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (!m || !(m[1] in opts)) {
    throw new Error(`itaipu-spawns-check: unknown argument ${a}`);
  }
  opts[m[1]] = m[2];
}
const ONLY = new Set(opts.only.split(','));

/* Section 14, row H. */
const SETTLE_S = 2;
const ATTRACT_CLEAR = 30;
/* At rest: slower than this, m/s, and on the ground it spawned on within
 * this, m. */
const REST_SPEED = 0.3;
const REST_Y = 0.5;
/* The lens's half angle the dam counts as in the title's frame at, the
 * attract camera's 44 degree vertical field (src/render/attract.js). */
const LENS_HALF = (22 * Math.PI) / 180;
/* What the title shows as the dam: the main dam's crest, the powerhouse
 * and the spillway's gates (docs/ITAIPU-PLAN.md section 2). */
const DAM_POINTS = [[59, 225, -1672], [58, 148, -1600], [-982, 215, -1028]];

const PLANE = FIRST_AIRFRAME;
const QUAD = 'interceptor';
const FLOAT = 'timber1500f';

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

/* -------------------------------------------------------------- Node */

const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));

/* ----------------------------------------------------------- Browser */

async function open(airframe, query = '') {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map: 'itaipu',
    graphics: 'high',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
    fpsCap: 0,
    /* The in-page pilots fly the quad on the angle loop, and the chase
     * view puts a plane in its own picture. */
    flightMode: 'angle',
    wingView: 'chase',
  };
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    url: `/index.html?map=itaipu${query}`,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(settings)});
      localStorage.setItem(k, JSON.stringify(s));
      localStorage.setItem('webfpv.airhint.v2', '1');
      localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    } catch (e) { /* Storage refused; the checks below say so. */ }
    navigator.getGamepads = () => [];`],
  });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 400000);
  } catch (e) {
    await page.close();
    throw e;
  }
  return page;
}

/* Until the terrain has built what the camera asks for (scripts/
 * itaipu-check.js settle). */
async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 3', 60000);
  }
}

async function shoot(page, name) {
  if (!opts.shots) {
    return;
  }
  await mkdir(resolve(opts.shots), { recursive: true });
  await settle(page);
  await page.evaluate("(() => { for (const n of document.querySelectorAll('body > *:not(canvas)')) { if (!n.querySelector('canvas')) { n.dataset.shown = n.style.visibility; n.style.visibility = 'hidden'; } } return 1; })()");
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
  await page.evaluate("(() => { for (const n of document.querySelectorAll('[data-shown]')) { n.style.visibility = n.dataset.shown; delete n.dataset.shown; } return 1; })()");
  const file = join(resolve(opts.shots), `${name}.jpg`);
  await writeFile(file, Buffer.from(r.data, 'base64'));
  console.log(`  picture ${file}`);
}

const STATE = `(() => {
  const s = window.__craftState();
  const c = window.__crash();
  return {
    x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, simT: c.simT, events: c.events, wrecked: c.wrecked,
    flags: c.flagNames.join('|'), upY: s.up ? s.up.y : 1, floats: s.floats ? s.floats.state.slice() : null,
    ground: window.__surface(s.worldX, s.worldZ, s.worldY - 0.5), crashed: s.crashed,
  };
})()`;
const state = async (page) => page.evaluate(STATE);

/* `s` seconds on the plant's clock. */
async function waitSim(page, s) {
  const t0 = (await state(page)).simT;
  await page.until(`window.__crash().simT > ${t0 + s}`, 240000);
}

/* Start a flight from the title and wait until it is flying. */
async function fly(page) {
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 240000);
  /* A quad's first flight opens on the intro's orbit round it, which
   * moves the drawn craft; the run is the pilot's once it is over. */
  await page.until('(() => { const i = window.__intro(); return !i.orbiting && !i.approaching && !i.zooming; })()', 60000);
}

/*
 * What a start must be after SETTLE_S on the plant's clock: no damage
 * event, not wrecked, and by its kind at rest on its ground, afloat on its
 * body, or up in the air with room under it.
 */
function judge(kind, a, b, want) {
  const damage = b.events - a.events;
  const common = !b.wrecked && !b.crashed && damage === 0;
  const where = `(${f1(b.x)}, ${f2(b.y)}, ${f1(b.z)}), ${f2(b.speed)} m/s, damage events ${damage}${b.flags ? ` (${b.flags})` : ''}`;
  if (kind === 'ground') {
    const ok = common && b.speed < REST_SPEED && b.y - b.ground < REST_Y && b.upY > 0.9
      && Math.hypot(b.x - want.x, b.z - want.z) < 2 && (want.y == null || Math.abs(b.ground - want.y) < 0.05);
    return { ok, detail: `${where}, ${f2(b.y - b.ground)} m over the ${want.surface} at ${f2(b.ground)}, up ${f2(b.upY)}` };
  }
  if (kind === 'water') {
    const wet = b.floats ? b.floats[4] + b.floats[5] : 0;
    const ok = common && b.floats && b.floats[9] === want.body && wet > 0 && Math.abs(b.y - want.y) < 1 && b.speed < 1.5;
    return { ok, detail: `${where}, afloat on body ${b.floats ? b.floats[9] : 'none'} (want ${want.body}), wetted ${f2(wet)} m` };
  }
  const ok = common && b.y - b.ground > 300;
  return { ok, detail: `${where}, ${f1(b.y - b.ground)} m over the ${b.ground > 219.001 ? 'ground' : 'water'}` };
}

/*
 * SETTLE_S of the plant's clock from the start the shell made. On the
 * ground that start is parked, and the shell does not step a parked
 * aircraft until the pilot throttles up (src/main.js, "Sitting on the
 * ground"), so there it is let go: thrown from its own parked pose at
 * rest with the sticks centred, as dam-check.js sets a Timber down, and
 * the plant must hold it there on the ground the start is on, until
 * SETTLE_S has passed or the shell has parked it again.
 */
async function settleAt(page, kind, yaw) {
  if (kind === 'ground') {
    const p = await page.evaluate(`(() => {
      const s = window.__craftState();
      return { x: s.worldX, y: s.worldY, z: s.worldZ, pitch: Math.asin(Math.max(-1, Math.min(1, s.fwd.y))) * 180 / Math.PI };
    })()`);
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    const thrown = await page.evaluate(`window.__crashThrow(${JSON.stringify({
      x: p.x, y: p.y, z: p.z, yaw: (yaw * 180) / Math.PI, pitch: p.pitch, hold: true, fresh: true,
    })})`);
    if (!thrown || thrown.ok === false) {
      throw new Error(`the parked pose would not take: ${JSON.stringify(thrown)}`);
    }
    await page.sleep(300);
    await page.evaluate('window.__releasePose()');
  }
  const a = await state(page);
  if (kind === 'ground') {
    /* Or until the shell has judged it landed and parked it again, which a
     * quad at rest is within a few steps, and stops the clock. */
    await page.sleep(SETTLE_S * 1000);
    await page.until(`window.__crash().simT > ${a.simT + SETTLE_S} || window.__craftState().landed`, 240000);
  } else {
    await waitSim(page, SETTLE_S);
  }
  return { a, b: await state(page) };
}

/* One page per aircraft and ?spawn=, its default start and every start
 * the query picks. */
async function spawnsFor(airframe, cls) {
  const cases = cls !== 'float'
    ? [['', 'crest road', 'ground', { x: CREST_SPAWN.x, z: CREST_SPAWN.z, y: 225, surface: 'crest road' }]]
    : [
        ['', 'reservoir', 'water', { body: 0, y: water[0].y }],
        ['&spawn=river', 'river', 'water', { body: 1, y: water[1].y }],
      ];
  cases.push(['&spawn=air', 'air', 'air', null]);
  for (const [query, label, kind, want] of cases) {
    const page = await open(airframe, query);
    try {
      await fly(page);
      const sp = await page.evaluate('window.__map().spawn');
      const at = kind === 'air' ? AIR_SPAWN : kind === 'water' ? water[want.body].spawn : want;
      check(`${cls} spawn, ${label}: where spawns.js says`,
        Math.hypot(sp.x - at.x, sp.z - at.z) < 0.01,
        `run spawn (${f1(sp.x)}, ${f2(sp.y)}, ${f1(sp.z)}) yaw ${f2(sp.yaw)}`);
      const { a, b } = await settleAt(page, kind, sp.yaw);
      const j = judge(kind, a, b, want);
      check(`${cls} spawn, ${label}: settles in ${SETTLE_S} s with no damage (${airframe})`, j.ok, j.detail);
      await shoot(page, `${cls}-${label.replace(/ /g, '-')}`);
      if (cls === 'plane' && !query) {
        await crestPlace(page);
      }
      if (ONLY.has('attract') && cls === 'quad' && !query) {
        await attract(page);
      }
      if (ONLY.has('rooms') && !query) {
        await rooms(page, cls, kind, want, sp);
      }
      const errors = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
      check(`${cls} ${label}: no page error`, errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
    } finally {
      await page.close();
    }
  }
}

/*
 * Where the crest start stands (src/maps/itaipu/spawns.js): past the east
 * intake gantry the dam part built (its survey, sites.intakeGantries), on
 * the side away from the intakes, 100 to 200 m from the nearest of them
 * (dam.json), facing back along the crest; a straight run of RUNWAY m
 * ahead of it on the crest road with nothing solid within RUNWAY_SIDE of
 * the centre line at the heights a plane rolls and lifts off at; and every
 * seat of a room's column on the road with nothing within SEAT_CLEAR.
 */
const RUNWAY = 400;
const RUNWAY_SIDE = 2.5;
const SEAT_CLEAR = 2.5;
async function crestPlace(page) {
  const dam = JSON.parse(await readFile(join(DATA, 'dam.json'), 'utf8'));
  const intakes = dam.find((e) => e.part === 'intakes').points;
  const seats = SLOT_RIGHT_M.map((_, i) => slotSpawn(CREST_SPAWN, i));
  const r = JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const g = window.__mapScene().userData.itaipu.parts.dam.survey().sites.intakeGantries;
    const sp = ${JSON.stringify(CREST_SPAWN)};
    const f = [-Math.sin(sp.yaw), -Math.cos(sp.yaw)];
    const r = [f[1] * -1, f[0]];
    let worst = 99, at = null, off = 0;
    for (let d = 0; d <= ${RUNWAY}; d += 2) {
      for (const side of [-${RUNWAY_SIDE}, 0, ${RUNWAY_SIDE}]) {
        const x = sp.x + f[0] * d + r[0] * side;
        const z = sp.z + f[1] * d + r[1] * side;
        if (Math.abs(window.__heightAt(x, z) - 225) > 0.05) { off += 1; }
      }
      const x = sp.x + f[0] * d;
      const z = sp.z + f[1] * d;
      for (const h of [0.5, 1.5, 3]) {
        const q = window.__nearSolid(x, 225 + h, z, 10);
        if (q != null && q < h - 0.05 && q < worst) { worst = q; at = [x, 225 + h, z]; }
      }
    }
    const seats = ${JSON.stringify(seats)}.map((p) => {
      let m = 99;
      for (const h of [0.5, 1.5, 3]) {
        const q = window.__nearSolid(p.x, 225 + h, p.z, 10);
        if (q != null && q < h - 0.05) { m = Math.min(m, q); }
      }
      return { x: p.x, z: p.z, ground: window.__heightAt(p.x, p.z), clear: m };
    });
    return { gantries: g, worst, at, off, seats };
  })())`));
  const g = r.gantries.reduce((a, b) => (Math.hypot(b.x - CREST_SPAWN.x, b.z - CREST_SPAWN.z) < Math.hypot(a.x - CREST_SPAWN.x, a.z - CREST_SPAWN.z) ? b : a));
  const nearest = Math.min(...intakes.map(([x, z]) => Math.hypot(x - CREST_SPAWN.x, z - CREST_SPAWN.z)));
  const fx = -Math.sin(CREST_SPAWN.yaw);
  const fz = -Math.cos(CREST_SPAWN.yaw);
  /* Ahead of the start: toward the gantry and the intakes beyond it. */
  const gantryAhead = (g.x - CREST_SPAWN.x) * fx + (g.z - CREST_SPAWN.z) * fz;
  const intakesAhead = intakes.every(([x, z]) => (x - CREST_SPAWN.x) * fx + (z - CREST_SPAWN.z) * fz > gantryAhead);
  check('crest start: past the intake gantry, away from the intakes, 100 to 200 m from the nearest',
    gantryAhead > 0 && intakesAhead && nearest >= 100 && nearest <= 200,
    `gantry at (${f1(g.x)}, ${f1(g.z)}) ${f1(gantryAhead)} m ahead along the road, every intake beyond it, nearest ${f1(nearest)} m`);
  check(`crest start: ${RUNWAY} m of straight crest road ahead, nothing within ${RUNWAY_SIDE} m of the line`,
    r.off === 0 && !(r.worst < RUNWAY_SIDE),
    `${r.off} samples off the 225 m road; nearest solid ${r.at ? `${f2(r.worst)} m at ${JSON.stringify(r.at.map((v) => +v.toFixed(1)))}` : 'over 10 m'}`);
  const badSeat = r.seats.findIndex((p) => Math.abs(p.ground - 225) > 0.05 || p.clear < SEAT_CLEAR);
  check(`crest start: all ${r.seats.length} room seats on the road, nothing within ${SEAT_CLEAR} m`, badSeat < 0,
    r.seats.map((p, i) => `${i + 1} (${f2(p.x)}, ${f2(p.z)}) ${p.clear < 99 ? f1(p.clear) : '>10'} m`).join(', '));
}

/* Every seat of a room of eight at this spawn, each put there as a
 * respawn does and given SETTLE_S. */
async function rooms(page, cls, kind, want, sp) {
  const home = cls === 'float' ? water[0].spawn : CREST_SPAWN;
  const bad = [];
  let worst = '';
  for (let i = 1; i < SLOT_RIGHT_M.length; i += 1) {
    const p = slotSpawn(home, i);
    await page.evaluate(`window.__respawn(${p.x}, ${p.z}, ${p.yaw}, ${p.y ?? 'undefined'})`);
    await page.sleep(100);
    const { a, b } = await settleAt(page, kind, p.yaw);
    const j = judge(kind, a, b, { ...want, x: p.x, z: p.z });
    if (!j.ok) {
      bad.push(i);
      worst = worst || `seat ${i + 1}: ${j.detail}`;
    }
  }
  check(`${cls} room: seats 2 to 8 settle in ${SETTLE_S} s with no damage`, bad.length === 0,
    bad.length ? `${bad.length} did not, first ${worst}` : `${SLOT_RIGHT_M.length - 1} seats${home.slots ? ', in a column down the crest road' : ''}`);
}

/* The title's flight, sampled round its whole loop. */
async function attract(page) {
  const r = JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const a = window.__attract(2000);
    const parts = window.__mapScene().userData.itaipu.parts;
    const canopy = (x, z) => Math.max(...Object.values(parts).map((p) => (p.canopyAt ? p.canopyAt(x, z) : -Infinity)));
    const dam = ${JSON.stringify(DAM_POINTS)};
    let low = Infinity, lowAt = null, near = Infinity, nearAt = null, inLens = 0;
    const lens = [];
    for (const p of a.samples) {
      const over = p.y - Math.max(window.__heightAt(p.x, p.z), canopy(p.x, p.z));
      if (over < low) { low = over; lowAt = [p.x, p.y, p.z]; }
      const g = window.__nearSolid(p.x, p.y, p.z, 200);
      if (g != null && g < near) { near = g; nearAt = [p.x, p.y, p.z]; }
      let best = Infinity;
      for (const d of dam) {
        const v = [d[0] - p.x, d[1] - p.y, d[2] - p.z];
        const n = Math.hypot(v[0], v[1], v[2]);
        best = Math.min(best, Math.acos(Math.max(-1, Math.min(1, (v[0] * p.dx + v[1] * p.dy + v[2] * p.dz) / n))));
      }
      if (best < ${LENS_HALF}) { inLens += 1; lens.push(p); }
    }
    const pick = [0.1, 0.45, 0.8].map((f) => lens[Math.floor(f * (lens.length - 1))]).filter(Boolean);
    return { kind: a.kind, period: a.periodMs, n: a.samples.length, low, lowAt, near, nearAt, inLens, pick };
  })())`));
  check(`attract: ${ATTRACT_CLEAR} m over the ground, water, roofs and canopy all the way round`, r.low >= ATTRACT_CLEAR,
    `${r.n} samples of a ${r.kind} loop of ${f1(r.period / 1000)} s, lowest ${f1(r.low)} m at ${JSON.stringify(r.lowAt.map((v) => Math.round(v)))}`);
  check(`attract: ${ATTRACT_CLEAR} m from every collider`, r.near >= ATTRACT_CLEAR,
    Number.isFinite(r.near) ? `nearest ${f1(r.near)} m at ${JSON.stringify(r.nearAt.map((v) => Math.round(v)))}` : 'no collider within 200 m of any sample');
  const share = r.inLens / r.n;
  check('attract: the dam is in the lens', share >= 0.25, `the main dam, the powerhouse or the spillway within ${Math.round((LENS_HALF * 180) / Math.PI)} degrees of the view for ${f1(share * 100)} % of the loop`);
  for (let k = 0; k < r.pick.length; k += 1) {
    const p = r.pick[k];
    await page.evaluate(`window.__setCam(${p.x}, ${p.y}, ${p.z}, ${p.x + p.dx * 100}, ${p.y + p.dy * 100}, ${p.z + p.dz * 100}, 44)`);
    await shoot(page, `attract-${k + 1}`);
  }
  await page.evaluate('window.__setCam()');
}

async function main() {
  if (ONLY.has('spawns') || ONLY.has('rooms') || ONLY.has('attract')) {
    await spawnsFor(PLANE, 'plane');
    await spawnsFor(QUAD, 'quad');
    await spawnsFor(FLOAT, 'float');
  }
}

try {
  await main();
} catch (e) {
  check('the run', false, e && e.stack ? e.stack : String(e));
}
const failed = checks.filter((ok) => !ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
