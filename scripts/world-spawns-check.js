/*
 * world-spawns-check.js: every start on every world is somewhere an
 * aircraft can start (docs/redesign/COMPLETENESS.md item 50, phase 29).
 * Headless, one page per world, graphics low, nothing flown.
 *
 *   node scripts/world-spawns-check.js [map ...]   every buildable world by default
 *
 * The starts are what the shell can seat (src/main.js __spawnStarts): the
 * map's own, what spawnFor answers each kind and each ?spawn= wish, each
 * water body's float start; then each of those moved to every seat of a
 * room's row (src/game/slots.js slotSpawn), and the pilots' stations
 * behind the map's own. Each is read off the seated map, the same
 * height, water and solids the plant meets, and judged by START below:
 *
 *   ground  seated on the ground with nothing over it, not in water,
 *           nothing solid nearer a point a metre over it than what it
 *           stands on (a deck is a solid a metre down), and nothing
 *           within CLEAR_M of a point CLEAR_M over that;
 *   float   on a water body's surface, the same clearance;
 *   air     AIR_MIN_M or more over whatever is under it;
 *   stand   (a station) on the ground, not in water, a metre clear;
 *
 * and every start but a station faces a flyable way: a line from a metre
 * over the seat, climbing RISE metres a metre, stays over the ground and
 * FACE_CLEAR_M from every solid out to FACE_M ahead.
 *
 * NEGATIVE CONTROLS, per world, through the same probe and the same judge:
 * a start in the air under the ground, a start inside the nearest solid
 * found round the map's own, one standing FACE_STAND_M short of a solid
 * and facing it, and a ground start on a float start's water. Each must
 * fail for the reason it was built to fail, or the check proves nothing.
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
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { MAPS } from '../src/maps/registry.js';
import { SLOT_RIGHT_M, slotSpawn, stationFor } from '../src/game/slots.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WORLDS = MAPS.filter((m) => m.load).map((m) => m.id);
const maps = process.argv.slice(2).length ? process.argv.slice(2) : WORLDS;

/* m: what a seat must have clear round a point a metre over it; the
 * room row's own spacing is 8 m (slots.js), so 2 m is a craft's span and
 * a margin, not a neighbour. */
const CLEAR_M = 2;
/* m: a station is a person standing. */
const STAND_CLEAR_M = 1;
/* m: an air start is at least this over what is under it. */
const AIR_MIN_M = 100;
/* The facing line: climbs a metre in four (14 degrees, a gentle climb
 * out for a plane at its takeoff speed), out to FACE_M, and keeps
 * FACE_CLEAR_M from every solid. */
const RISE = 0.25;
const FACE_M = 150;
const FACE_STEP_M = 5;
const FACE_CLEAR_M = 1;
/* m: how far off a seat may be from the water's surface and count as on
 * it, and how far over the surface a ground seat must be to be dry. */
const WET_M = 0.5;
/* m: a roof or deck over the seat by more than this covers it. */
const COVER_M = 0.05;
/* The negative controls' solid is looked for this far round the map's
 * own start, on a grid this fine. */
const SEARCH_M = 8000;
const SEARCH_STEP_M = 25;
const FACE_STAND_M = 15;
const SOLID_TALL_M = 6;
const SOLID_HITS = 40;
const SOLID_APART_M = 50;

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
const f1 = (v) => (v == null || !Number.isFinite(v) ? 'none' : v.toFixed(1));

/*
 * The facts at each start, read in the page: seat, the height the shell
 * seats it at (src/main.js spawnHeight; an air start's own height); top,
 * the highest surface from above; bare, the ground under every roof;
 * water, the surface of the water body there or null; floor, the nearest
 * solid to a metre over the seat (a deck under it reads 1); gap, the nearest
 * solid to a metre over the seat (null: none within reach); and along the
 * facing line the least room over the ground and the nearest solid.
 */
const PROBE = `(async (pts) => {
  const solid = (x, y, z, r) => { const g = window.__nearSolid(x, y, z, r); return g == null ? Infinity : g; };
  const ground = (x, z) => window.__surface(x, z, window.__surface(x, z, -1000));
  return pts.map((p) => {
    const top = window.__heightAt(p.x, p.z);
    const bare = window.__surface(p.x, p.z, -1000);
    const seat = p.air ? p.air.y : p.y != null ? window.__surface(p.x, p.z, p.y) : ground(p.x, p.z);
    const w = window.__waterSample(p.x, p.z);
    const water = w && w.shell != null && Number.isFinite(w.shell) ? w.shell : null;
    const floor = solid(p.x, seat + 1, p.z, 2);
    const gap = solid(p.x, seat + 1 + ${CLEAR_M}, p.z, ${CLEAR_M} + 2);
    let faceRoom = Infinity;
    let faceGap = Infinity;
    let faceAt = null;
    const s = Math.sin(p.yaw || 0);
    const c = Math.cos(p.yaw || 0);
    for (let d = ${FACE_STEP_M}; d <= ${FACE_M}; d += ${FACE_STEP_M}) {
      const x = p.x - s * d;
      const z = p.z - c * d;
      const y = seat + 1 + d * ${RISE};
      const room = y - window.__heightAt(x, z);
      const g = solid(x, y, z, ${FACE_CLEAR_M} + 1);
      if (room < faceRoom) { faceRoom = room; }
      if (g < faceGap) { faceGap = g; faceAt = d; }
    }
    return { top, bare, seat, water, floor: Number.isFinite(floor) ? floor : null, gap: Number.isFinite(gap) ? gap : null,
      faceRoom, faceGap: Number.isFinite(faceGap) ? faceGap : null, faceAt };
  });
})`;

/* Why a start with these facts is not one, as a list of reasons; empty
 * when it is. */
function START(kind, f) {
  const why = [];
  const gap = f.gap == null ? Infinity : f.gap;
  const floor = f.floor == null ? Infinity : f.floor;
  if (kind === 'air') {
    if (!(f.seat - f.top >= AIR_MIN_M)) {
      why.push('ground');
    }
  } else if (kind === 'float') {
    if (f.water == null || Math.abs(f.seat - f.water) > WET_M) {
      why.push('water');
    }
  } else {
    if (!(f.seat >= f.bare - COVER_M)) {
      why.push('ground');
    }
    if (f.top > f.seat + COVER_M) {
      why.push('covered');
    }
    if (f.water != null && !(f.seat > f.water + WET_M)) {
      why.push('water');
    }
  }
  if (!(floor >= 1 - COVER_M) || !(gap > (kind === 'stand' ? STAND_CLEAR_M : CLEAR_M))) {
    why.push('solid');
  }
  if (kind !== 'stand' && (!(f.faceRoom > 0) || (f.faceGap != null && !(f.faceGap > FACE_CLEAR_M)))) {
    why.push('facing');
  }
  return why;
}

function kindOf(start, float) {
  if (start.air) {
    return 'air';
  }
  return float ? 'float' : 'ground';
}

function describe(kind, f) {
  const over = kind === 'air' ? `${f1(f.seat - f.top)} m over the ground` : `seat ${f1(f.seat)}, top ${f1(f.top)}`;
  const wet = f.water == null ? 'dry' : `water at ${f1(f.water)}`;
  const face = kind === 'stand' ? '' : `, ahead ${f1(f.faceRoom)} m room, solid ${f.faceGap == null ? 'none' : `${f1(f.faceGap)} m at ${f.faceAt} m`}`;
  return `${over}, ${wet}, ${f.floor == null ? 'nothing' : `${f1(f.floor)} m`} from a metre up and ${f.gap == null ? 'nothing' : `${f1(f.gap)} m`} from ${1 + CLEAR_M} m up to a solid${face}`;
}

async function worldStarts(page, map) {
  const listed = await page.evaluate('window.__spawnStarts()');
  const seen = new Set();
  const out = [];
  const add = (label, start, kind) => {
    const key = `${kind} ${start.x.toFixed(2)} ${start.z.toFixed(2)} ${(start.yaw || 0).toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ label, start, kind });
    }
  };
  for (const { label, start, float } of listed) {
    if (!start) {
      check(`${map} ${label}: the shell has a start`, false, 'null');
      continue;
    }
    const kind = kindOf(start, float);
    add(label, start, kind);
    for (let i = 1; i < SLOT_RIGHT_M.length; i += 1) {
      add(`${label} seat ${i}`, slotSpawn(start, i), kind);
    }
  }
  const home = listed[0].start;
  for (let i = 0; i < SLOT_RIGHT_M.length; i += 1) {
    add(`station ${i}`, { ...stationFor(home, i), yaw: home.yaw, y: home.y }, 'stand');
  }
  return { out, home, wet: listed.find((l) => l.float && !l.start.air) };
}

/* Up to SOLID_HITS points round `home`, each inside a solid from a metre
 * over the ground to SOLID_TALL_M over it and SOLID_APART_M from the
 * others, nearest first. Tall, because the facing control's line
 * passes a low wall: 15 m out it is 4.75 m up, and a fence that low is no
 * reason to turn. The grid finds a tall solid within a step, then each
 * move goes the solid's gap toward whichever of eight bearings is nearer
 * it, so a thin wall the grid steps over is still entered. */
const FIND_SOLID = `((h) => {
  const ground = (x, z) => window.__surface(x, z, window.__surface(x, z, -1000));
  const gap = (x, z) => {
    const y = ground(x, z);
    const a = window.__nearSolid(x, y + 1, z, ${SEARCH_STEP_M});
    const b = window.__nearSolid(x, y + ${SOLID_TALL_M}, z, ${SEARCH_STEP_M});
    return Math.max(a == null ? Infinity : a, b == null ? Infinity : b);
  };
  const enter = (x, z) => {
    let g = gap(x, z);
    for (let k = 0; k < 40 && g > 0; k += 1) {
      let best = null;
      for (let a = 0; a < 8; a += 1) {
        const nx = x + Math.cos(a * Math.PI / 4) * Math.max(0.25, g);
        const nz = z + Math.sin(a * Math.PI / 4) * Math.max(0.25, g);
        const ng = gap(nx, nz);
        if (best === null || ng < best[2]) { best = [nx, nz, ng]; }
      }
      if (!(best[2] < g)) { return null; }
      [x, z, g] = best;
    }
    return g === 0 ? { x, z } : null;
  };
  const hits = [];
  for (let r = ${SEARCH_STEP_M}; r <= ${SEARCH_M} && hits.length < ${SOLID_HITS}; r += ${SEARCH_STEP_M}) {
    for (let x = -r; x <= r; x += ${SEARCH_STEP_M}) {
      for (let z = -r; z <= r; z += ${SEARCH_STEP_M}) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r || !(gap(h.x + x, h.z + z) < ${SEARCH_STEP_M})) { continue; }
        const at = enter(h.x + x, h.z + z);
        if (at && hits.length < ${SOLID_HITS} && hits.every((o) => Math.hypot(o.x - at.x, o.z - at.z) > ${SOLID_APART_M})) { hits.push(at); }
      }
    }
  }
  return hits;
})`;

async function controls(page, map, home, wet) {
  const cases = [];
  const [under] = await page.evaluate(`${PROBE}([${JSON.stringify(home)}])`);
  cases.push(['an air start under the ground', { ...home, y: undefined, air: { y: under.top - 5 } }, 'air', 'ground']);
  const hits = await page.evaluate(`${FIND_SOLID}(${JSON.stringify(home)})`);
  if (hits.length) {
    const hit = hits[0];
    cases.push([`a start inside a solid at (${f1(hit.x)}, ${f1(hit.z)})`, { x: hit.x, z: hit.z, yaw: 0 }, 'ground', 'solid']);
    /* Facing a solid from FACE_STAND_M short of it, on ground that is
     * otherwise a start (a solid inside a dam has no such ground): which
     * stand is chosen by every reason but facing, so the assertion below
     * is still facing's own. */
    const stands = hits.flatMap((at) => [0, 1, 2, 3, 4, 5, 6, 7].map((b) => {
      const ux = Math.cos((b * Math.PI) / 4);
      const uz = Math.sin((b * Math.PI) / 4);
      return { x: at.x - ux * FACE_STAND_M, z: at.z - uz * FACE_STAND_M, yaw: Math.atan2(-ux, -uz), at };
    }));
    const standFacts = await page.evaluate(`${PROBE}(${JSON.stringify(stands)})`);
    const k = standFacts.findIndex((f) => START('ground', f).every((w) => w === 'facing'));
    if (k >= 0) {
      const { at } = stands[k];
      cases.push([`a start ${FACE_STAND_M} m short of a solid at (${f1(at.x)}, ${f1(at.z)}), facing it`, stands[k], 'ground', 'facing']);
    } else {
      check(`${map} control: a clear stand ${FACE_STAND_M} m short of one of ${hits.length} solids, on any of eight bearings`, false, 'none');
    }
  } else {
    check(`${map} control: a solid within ${SEARCH_M} m of the map's start to stand a control in`, false, 'none found');
  }
  if (wet) {
    cases.push(['a ground start on the floats\' water', { x: wet.start.x, z: wet.start.z, yaw: wet.start.yaw }, 'ground', 'water']);
  } else {
    console.log(`  note  ${map} has no float start, so no water control`);
  }
  const facts = await page.evaluate(`${PROBE}(${JSON.stringify(cases.map((c) => c[1]))})`);
  cases.forEach(([name, , kind, want], j) => {
    const why = START(kind, facts[j]);
    check(`${map} control, ${name}: refused for ${want}`, why.includes(want), `refused for ${why.join(', ') || 'nothing'}; ${describe(kind, facts[j])}`);
  });
}

for (const map of maps) {
  console.log(map);
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { map: ${JSON.stringify(map)}, freestyleMap: ${JSON.stringify(map)}, graphics: 'low', graphicsAuto: false, sound: false, fpsCap: 0, airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* storage refused; the map check below says so */ }
  navigator.getGamepads = () => [];`];
  const page = await openPage({ root, width: 960, height: 540, seed });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    /* The title shows a world of its own; flying seats the chosen one. */
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until(`window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready && window.__map().id === ${JSON.stringify(map)}`, 400000);
    const { out, home, wet } = await worldStarts(page, map);
    const facts = await page.evaluate(`${PROBE}(${JSON.stringify(out.map((o) => o.start))})`);
    out.forEach((o, k) => {
      const why = START(o.kind, facts[k]);
      check(`${map} ${o.label} (${o.kind} at ${f1(o.start.x)}, ${f1(o.start.z)})`, why.length === 0,
        `${why.length ? `refused for ${why.join(', ')}; ` : ''}${describe(o.kind, facts[k])}`);
    });
    await controls(page, map, home, wet);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check(`${map}: no page error`, errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
