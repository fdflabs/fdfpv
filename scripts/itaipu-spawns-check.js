/*
 * itaipu-spawns-check.js: package H's promises for Itaipu, measured
 * (docs/ITAIPU-PLAN.md sections 10, 11 and 14, row H).
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/itaipu-spawns-check.js
 *       [--only=spawns,rooms,attract,courses] [--course=NAME] [--shots=DIR]
 *
 * In Node:
 *
 *   documents   docs/itaipu-courses/*.json are what scripts/itaipu-
 *               courses.js writes, so the courses flown below are the ones
 *               shipped.
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
 *               share of the loop that is printed;
 *   courses     each course loads in the builder with the seated class's
 *               default aircraft and the builder lists no racing line
 *               warning; its test flight is flown by a pilot in the page
 *               along the builder's own line, and one lap closes clean on
 *               the race's sim clock with no damage.
 *
 * --course=NAME flies only the course whose file starts with NAME.
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
import { key } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, FIRST_AIRFRAME, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { slotSpawn, SLOT_RIGHT_M } from '../src/game/slots.js';
import { CREST_SPAWN, AIR_SPAWN } from '../src/maps/itaipu/spawns.js';
import { COURSES, courseDocument } from './itaipu-courses.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const opts = { only: 'spawns,rooms,attract,courses', course: '', shots: join(homedir(), 'Desktop', 'fdfpv-loop', 'itaipu', 'h-spawns') };
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
/* The longest a lap may take on the plant's clock before it counts as not
 * flown, s. */
const LAP_LIMIT_S = 600;

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

for (const c of COURSES) {
  const want = `${JSON.stringify(courseDocument(c), null, 2)}\n`;
  const had = await readFile(join(root, 'docs', 'itaipu-courses', c.file), 'utf8').catch(() => '');
  check(`document ${c.file}`, had === want, had === want ? `${c.gates.length} gates, as scripts/itaipu-courses.js writes it` : 'differs from scripts/itaipu-courses.js; run it');
}
const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
const LIBRARY = Object.fromEntries(COURSES.map((c) => [c.id, courseDocument(c)]));

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
      localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify(LIBRARY))});
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

/*
 * THE PILOTS, once a frame on the plant's clock, each following the
 * builder's own racing line (__build.linePoints): the nearest point of it
 * at or after the last one, searched a little way ahead so the lap is
 * flown in order, and an aim point `look` metres further on.
 *
 * The plane's is scripts/map-plane-check.js planePilot's: L1 guidance
 * (Park, Deyst and How, 2004) to a bank hold on the roll stick, the
 * line's height on a pitch hold, the throttle on the speed.
 *
 * The quad's flies the five inch on the angle loop with its heading held:
 * the velocity it wants is toward the aim point at `speed`, the stick
 * tilts it toward that in the heading's frame, and the throttle holds the
 * vertical part round a hover it learns.
 */
function pilot(kind, path, { speed, look }) {
  return `(() => {
    const P = ${JSON.stringify(path)};
    const N = P.length;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let k = 0;
    let lift = 0;
    window.__pilot = true;
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      if (!c || c.mode !== 'flight' || !c.fwd || !c.up) { requestAnimationFrame(step); return; }
      const pos = [c.worldX, c.worldY, c.worldZ];
      let best = k;
      let bestD = Infinity;
      for (let j = k; j < Math.min(N, k + 80); j += 1) {
        const d = Math.hypot(P[j][0] - pos[0], P[j][1] - pos[1], P[j][2] - pos[2]);
        if (d < bestD) { bestD = d; best = j; }
      }
      k = best;
      let a = k;
      while (a < N - 1 && Math.hypot(P[a][0] - pos[0], P[a][1] - pos[1], P[a][2] - pos[2]) < ${look}) { a += 1; }
      const aim = P[a];
      const v = c.vel || { x: 0, y: 0, z: 0 };
      window.__pilotAt = k;
      if (${JSON.stringify(kind)} === 'plane') {
        const pitch = Math.asin(cl(c.fwd.y, -1, 1));
        const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
        const bank = Math.asin(cl(-right.y, -1, 1));
        const p = c.rates ? c.rates.p : 0;
        const q = c.rates ? c.rates.q : 0;
        const vh = Math.hypot(v.x, v.z) || 1;
        const dx = aim[0] - pos[0];
        const dz = aim[2] - pos[2];
        const dl = Math.hypot(dx, dz) || 1;
        const eta = Math.atan2((v.x * dz - v.z * dx) / (vh * dl), (v.x * dx + v.z * dz) / (vh * dl));
        const acc = 2 * vh * vh * Math.sin(cl(eta, -Math.PI / 2, Math.PI / 2)) / Math.max(dl, 5);
        const bankT = cl(Math.atan(acc / 9.81), -0.9, 0.9);
        const hT = P[k][1];
        const pitchT = cl(0.03 + 0.05 * (hT - pos[1]) - 0.08 * v.y + 0.12 * Math.abs(bank), -0.3, 0.35);
        const thr = cl(0.55 + 0.12 * (${speed} - c.speed) + 0.06 * (hT - pos[1]) + 0.25 * Math.abs(bank), 0.1, 1);
        window.__stick(cl(2.5 * (bankT - bank) - 0.15 * p, -1, 1), cl(3 * (pitchT - pitch) + 0.3 * q, -1, 1), 0, thr);
      } else {
        /* Along the line at speed, and back onto it: the velocity it
         * wants is the line's own direction here plus the way back to
         * its nearest point, and the tilt is the acceleration that
         * closes the gap, through the angle loop's 55 degree stick. */
        const near = P[k];
        const nx = P[Math.min(N - 1, k + 3)];
        const tl = Math.hypot(nx[0] - near[0], nx[1] - near[1], nx[2] - near[2]) || 1;
        /* Slower into a bend: by how far the line turns in the next 15
         * m, down to a third of the speed for a right angle or more. */
        const far = P[Math.min(N - 1, k + 15)];
        const far2 = P[Math.min(N - 1, k + 18)];
        const fl = Math.hypot(far2[0] - far[0], far2[1] - far[1], far2[2] - far[2]) || 1;
        const bend = Math.acos(cl(((nx[0] - near[0]) * (far2[0] - far[0]) + (nx[1] - near[1]) * (far2[1] - far[1]) + (nx[2] - near[2]) * (far2[2] - far[2])) / (tl * fl), -1, 1));
        const pace = ${speed} * cl(1 - bend / 2.4, 0.35, 1);
        const want = [0, 1, 2].map((i) => ((nx[i] - near[i]) / tl) * pace + cl(2 * (near[i] - pos[i]), -3, 3));
        const f = [c.fwd.x, c.fwd.z];
        const fn = Math.hypot(f[0], f[1]) || 1;
        const fx = f[0] / fn;
        const fz = f[1] / fn;
        const ax = 2 * (want[0] - v.x);
        const az = 2 * (want[2] - v.z);
        const along = ax * fx + az * fz;
        const side = ax * -fz + az * fx;
        const dy = want[1] - v.y;
        lift = cl(lift + 0.004 * dy, -0.25, 0.25);
        const tilt = (a) => Math.atan(a / 9.81) / 0.96;
        window.__trace = window.__trace || [];
        const simT = window.__crash().simT;
        if (!(simT < (window.__traceAt || 0) + 0.25)) {
          window.__traceAt = simT;
          window.__trace.push([+simT.toFixed(2), k, ...pos.map((q) => +q.toFixed(2)), ...near.map((q) => +q.toFixed(2)), window.__race().next]);
        }
        window.__stick(cl(tilt(side), -0.6, 0.6), cl(-tilt(along), -0.6, 0.6), 0, cl(0.37 + lift + 0.12 * dy, 0.05, 0.95));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`;
}

/* One course: into the builder on it, its warnings, its test flight. */
async function course(airframe, cls, c) {
  const page = await open(airframe);
  try {
    await page.until('!!window.__build', 60000);
    await page.evaluate(`window.__ui.onBuild({ map: 'itaipu', id: ${JSON.stringify(c.id)} }).then(() => { window.__opened = true; }, (e) => { window.__opened = String(e); }); true`);
    await page.until(`window.__opened && window.__build.state().state === 'building' && window.__build.state().doc && window.__build.state().doc.id === ${JSON.stringify(c.id)}`, 120000);
    await page.until('window.__build.state().line.samples > 0', 60000);
    const st = await page.evaluate('window.__build.state()');
    check(`course ${c.name}: loads in the builder`, st.map === 'itaipu' && st.gates.length === c.gates.length,
      `${st.gates.length} gates, the line worked out for the ${st.line.craft}`);
    check(`course ${c.name}: no racing line warning for the ${st.line.craft}`, st.line.craft === airframe && st.warnings.length === 0,
      st.warnings.length ? JSON.stringify(st.warnings.slice(0, 4)) : `${st.line.samples} samples, slowest corner ${f1(st.line.slowest)} m/s`);
    const line = await page.evaluate('window.__build.linePoints(1)');
    let len = 0;
    for (let i = 0; i < line.length; i += 1) {
      const a = line[i];
      const b = line[(i + 1) % line.length];
      len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    console.log(`  ${c.name}: racing line ${f1(len / 1000)} km`);
    /* From the start behind the start gate, round the lap, and on past
     * the start gate again. */
    const g0 = st.gates[0];
    const back = [];
    for (let s = 40; s > 0; s -= 1) {
      back.push(g0.centre.map((v, i) => v - g0.travel[i] * s));
    }
    const path = [...back, ...line.map((p) => p.slice(0, 3)), ...line.slice(0, 200).map((p) => p.slice(0, 3))];

    await key(page, 'KeyB');
    await page.until("window.__build.state().state === 'testing' && window.__craftState().mode === 'flight'", 60000);
    await shoot(page, `course-${c.file.replace('.json', '')}-start`);
    const a = await state(page);
    await page.evaluate(pilot(cls, path, cls === 'plane' ? { speed: 18, look: 40 } : { speed: 6, look: 5 }));
    await page.evaluate('window.__drawOff(true)');
    await page.until(`window.__race().laps.length >= 1 || window.__crash().wrecked || window.__crash().events > ${a.events}
      || window.__crash().simT - ${a.simT} > ${LAP_LIMIT_S}`, 3600000).catch(() => {});
    await page.evaluate('window.__drawOff(false)');
    await page.evaluate('window.__pilot = false');
    const r = await page.evaluate('({ laps: window.__race().laps.slice(), next: window.__race().next, at: window.__pilotAt, trace: window.__trace || [] })');
    if (!r.laps.length && r.trace.length) {
      const file = join(resolve(process.env.TMPDIR || '/tmp'), `itaipu-${cls}-trace.json`);
      await writeFile(file, JSON.stringify(r.trace));
      console.log(`  the flight every quarter second, [simT, line point, x, y, z, line x, y, z, next gate]: ${file}`);
    }
    const b = await state(page);
    const damage = b.events - a.events;
    check(`course ${c.name}: a clean lap with the ${airframe} on the sim clock`, r.laps.length >= 1 && damage === 0 && !b.wrecked,
      r.laps.length ? `lap ${f2(r.laps[0] / 1000)} s, damage events ${damage}`
        : `no lap: next gate ${r.next}, line point ${r.at} of ${path.length}, at (${f1(b.x)}, ${f1(b.y)}, ${f1(b.z)}) ${f1(b.speed)} m/s, damage events ${damage} ${b.flags}, ${f1(b.simT - a.simT)} s flown`);
    const errors = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    check(`course ${c.name}: no page error`, errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
}

async function main() {
  if (ONLY.has('spawns') || ONLY.has('rooms') || ONLY.has('attract')) {
    await spawnsFor(PLANE, 'plane');
    await spawnsFor(QUAD, 'quad');
    await spawnsFor(FLOAT, 'float');
  }
  if (ONLY.has('courses')) {
    for (const [airframe, cls, c] of [[PLANE, 'plane', COURSES[0]], [QUAD, 'quad', COURSES[1]]]) {
      if (!opts.course || c.file.startsWith(opts.course)) {
        await course(airframe, cls, c);
      }
    }
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
