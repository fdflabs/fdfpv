/*
 * contact-golden.js: the shell's contact pass, step for step, against a
 * record.
 *
 * Between two plant steps the shell may change the plant's state: the
 * ground under the craft is raised into it, and src/main.js's obstacle
 * pass resolves the craft against walls, poles and roofs and hands the
 * plant a new velocity. That code runs only in the page, and its output
 * feeds every later step, so a rewrite of it has to give the same state,
 * bit for bit, on every step. window.__stepTrace hashes, per step since a
 * throw, the state in, the ground plane handed over and the state out;
 * this records those hashes for a fixed set of throws and compares them.
 *
 * Each throw is staged on the plant's clock: the craft is thrown fresh
 * (back to the plant's first step) with the lap clock at zero and held,
 * the sticks set, then released, so the frames the page happens to draw
 * do not change what the plant is handed. The first STEPS steps are kept,
 * fewer when a wreck comes to rest sooner (the shell stops stepping it at a
 * frame) or when the recording runs part (the page's per frame decisions,
 * a crash or a landing, act at a frame's end): see the recording below.
 *
 *   node scripts/contact-golden.js            compare with the record
 *   node scripts/contact-golden.js --record   write the record (old code!)
 *   node scripts/contact-golden.js --record --add
 *                                    record only the throws the record does
 *                                    not have yet, and add them to it: a row
 *                                    already there is never written again
 *
 * The record is tests/fixtures/contact-golden.json. Browser: run it through
 * ~/.cache/run-check.sh.
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

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { MOVE } from '../src/maps/itaipu/town/model.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'contact-golden.json');
const RECORD_RUNS = Number(process.env.RECORD_RUNS) || 3;
const STEPS = 1500;
const WAIT = 300000;
/* Each drawn frame steps FRAME_MS of sim time (window.__frameMs). */
const FRAME_MS = 100;
const STALL_FRAMES = 20;
const recording = process.argv.includes('--record');
const adding = recording && process.argv.includes('--add');

/* Every plan searches from the map's spawn, a constant, never from the
 * craft: after R the craft hovers and drifts for as long as the page takes
 * to ask, so a search from where it is found a different pole from run to
 * run and the same inputs gave a different throw. */
const SPAWN_JS = 'const SPAWN = () => { const p = window.__map().spawn; return { worldX: p.x, worldZ: p.z }; };';

/*
 * The throws. Each `plan` runs in the page and returns the throw (world
 * metres, degrees, m/s) and the sticks, found from the map itself so the
 * spot is the same on every run.
 */
const THROWS = [
  /* On Itaipu, a world PDCS keeps: its crest's walls and poles and its
   * town's roofs. These replaced the same throws on the Alps and the Swiss
   * valley, recorded on the code those were before they left with their
   * maps (the combat-only cut, 2026-10-20). */
  {
    id: 'itaipu-quad-wall',
    what: 'the interceptor into the face of an Itaipu wall at 25 m/s',
    airframe: 'interceptor',
    map: 'itaipu',
    plan: `
      const s = SPAWN();
      const w = window.__crashSolids(s.worldX, s.worldZ, 600, 'wall').find((c) => {
        if (!c.box || c.b[0] - c.a[0] < 4) return false;
        const x = (c.a[0] + c.b[0]) / 2;
        const g = window.__heightAt(x, c.b[2] + 4);
        if (c.a[1] > g + 0.5 || c.b[1] < g + 3) return false;
        for (let d = 0.6; d <= 4.5; d += 0.6) {
          if (!(window.__nearSolid(x, g + 1.6, c.b[2] + d, 0.5) > 0.45)) return false;
        }
        return true;
      });
      const x = (w.a[0] + w.b[0]) / 2;
      const y = window.__heightAt(x, w.b[2] + 4) + 1.6;
      return { throw: { x, y, z: w.b[2] + 4.5, yaw: 0, pitch: -25, vx: 0, vy: 0, vz: -25 }, stick: [0, 0, 0, 0] };`,
  },
  {
    id: 'itaipu-quad-wall-glance',
    what: 'the interceptor glancing along an Itaipu wall at 12 m/s, throttle up',
    airframe: 'interceptor',
    map: 'itaipu',
    plan: `
      const s = SPAWN();
      const w = window.__crashSolids(s.worldX, s.worldZ, 600, 'wall').find((c) => {
        if (!c.box || c.b[0] - c.a[0] < 8) return false;
        const x = (c.a[0] + c.b[0]) / 2;
        const g = window.__heightAt(x, c.b[2] + 1);
        return !(c.a[1] > g + 0.5 || c.b[1] < g + 3);
      });
      const y = window.__heightAt(w.a[0] - 3, w.b[2] + 0.6) + 2;
      return { throw: { x: w.a[0] - 3, y, z: w.b[2] + 0.5, yaw: -80, pitch: -10, vx: 12, vy: 0, vz: -1.5 }, stick: [0, 0, 0, 0.45] };`,
  },
  {
    id: 'itaipu-quad-pole',
    what: 'the interceptor into an Itaipu pole at 15 m/s',
    airframe: 'interceptor',
    map: 'itaipu',
    plan: `
      const s = SPAWN();
      for (const p of window.__crashSolids(s.worldX, s.worldZ, 800, 'pole')) {
        if (p.r < 0.1) continue;
        const g = window.__heightAt(p.a[0], p.a[2]);
        const y = g + 2.2;
        if (Math.max(p.a[1], p.b[1]) < y + 1) continue;
        for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x0 = p.a[0] - fx * 9, z0 = p.a[2] - fz * 9;
          let clear = true;
          for (let d = 0; d <= 7 && clear; d += 1) {
            const x = x0 + fx * d, z = z0 + fz * d;
            clear = window.__nearSolid(x, y, z, 0.8) > 0.75 && window.__heightAt(x, z) < y - 1.4;
          }
          if (clear) {
            return { throw: { x: x0, y, z: z0, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: -20, vx: fx * 15, vy: 0, vz: fz * 15 }, stick: [0, 0, 0, 0.2] };
          }
        }
      }
      return null;`,
  },
  {
    id: 'itaipu-quad-roof',
    what: 'the interceptor dropped onto an Itaipu roof at 8 m/s, 35 degrees down',
    airframe: 'interceptor',
    map: 'itaipu',
    plan: `
      const s = SPAWN();
      const roofs = (window.__roofs() || []).slice()
        .sort((u, v) => Math.hypot(u.x - s.worldX, u.z - s.worldZ) - Math.hypot(v.x - s.worldX, v.z - s.worldZ));
      const a = 35 * Math.PI / 180;
      for (const r of roofs) {
        const top = window.__surface(r.x, r.z, 1e4);
        const x = r.x - 2 * Math.cos(a), z = r.z, y = top + 2 * Math.sin(a) + 0.4;
        if (!(window.__nearSolid(x, y, z, 0.8) > 0.75)) continue;
        return { throw: { x, y, z, yaw: -90, pitch: -35, vx: 8 * Math.cos(a), vy: -8 * Math.sin(a), vz: 0 }, stick: [0, 0, 0, 0] };
      }
      return null;`,
  },
  {
    id: 'itaipu-quad-ground-skid',
    what: 'the interceptor skidding into the Itaipu ground at 18 m/s, 15 degrees down',
    airframe: 'interceptor',
    map: 'itaipu',
    plan: `
      const s = SPAWN();
      const x = s.worldX + 25, z = s.worldZ + 12, y = window.__heightAt(x, z) + 1.5;
      const a = 15 * Math.PI / 180;
      return { throw: { x, y, z, yaw: 90, pitch: -15, vx: -18 * Math.cos(a), vy: -18 * Math.sin(a), vz: 0 }, stick: [0, 0, 0, 0] };`,
  },
];

/* One more for the slide itself, crash damage off: a corner hit on the
 * diagonal, two faces in one pass, on the dam's own blocks round the
 * spawn (in the map's tree, not the town's streamed set). The search
 * stays inside MOVE of the spawn: a town building's corner 675 m out was
 * a whole box in the set round the spawn and its fine boxes in the set
 * round the throw, and the swap fell where the host's frames did (the
 * recording runs parted at step 705); a corner on the Interior 7.9 km
 * from its spawn parted at step 101 (2026-10-21). The long skate along a
 * wall comes back below, on a dam block's face. */
THROWS.push({
  id: 'itaipu-quad-corner-nodamage',
  what: 'the interceptor into the corner of an Itaipu dam block on the diagonal at 12 m/s, crash damage off',
  airframe: 'interceptor',
  map: 'itaipu',
  damage: false,
  plan: `
    const s = SPAWN();
    for (const c of window.__crashSolids(s.worldX, s.worldZ, ${MOVE}, 'wall')) {
      if (!c.box) continue;
      /* A box in its own frame (collide.js addTurnedBox), a plain one in the world's. */
      const [ux, uz, u0, u1, w0, w1] = c.turned || [1, 0, c.a[0], c.b[0], c.a[2], c.b[2]];
      if (u1 - u0 < 3 || w1 - w0 < 3) continue;
      for (const [su, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const u = su > 0 ? u1 : u0, w = sw > 0 ? w1 : w0;
        const cx = u * ux - w * uz, cz = u * uz + w * ux;
        /* The diagonal out of that corner, between its two faces. */
        const dx = (su * ux - sw * uz) * Math.SQRT1_2, dz = (su * uz + sw * ux) * Math.SQRT1_2;
        const g = window.__heightAt(cx + dx, cz + dz);
        if (c.a[1] > g + 0.5 || c.b[1] < g + 3) continue;
        const y = g + 1.6;
        const x0 = cx + 6 * dx, z0 = cz + 6 * dz;
        let clear = true;
        for (let d = 0; d <= 4.5 && clear; d += 0.5) {
          const x = x0 - d * dx, z = z0 - d * dz;
          clear = window.__nearSolid(x, y, z, 0.9) > 0.6 && window.__heightAt(x, z) < y - 1;
        }
        if (clear) {
          return { throw: { x: x0, y, z: z0, yaw: Math.atan2(dx, dz) * 180 / Math.PI, pitch: -20, vx: -12 * dx, vy: 0, vz: -12 * dz }, stick: [0, 0, 0, 0.3] };
        }
      }
    }
    return null;`,
});

/* With crash damage off the plant does not own the contact, and the
 * shell's pass resolves every hit itself: the same throws again that way. */
for (const th of THROWS.filter((t) => ['itaipu-quad-wall', 'itaipu-quad-wall-glance', 'itaipu-quad-pole'].includes(t.id))) {
  THROWS.push({ ...th, id: `${th.id}-nodamage`, what: `${th.what}, crash damage off`, damage: false });
}

/*
 * A skate, a wall and a roof that touch where the throws above do not
 * (2026-10-21). The wall throw above is planned in the world's frame and
 * the Itaipu wall it finds is a turned box, so with crash damage off it
 * runs up the dam's ground beside the wall and meets none; the roof throw
 * lands on a bridge deck with nothing under it. The skate and the wall
 * here plan in each box's own frame (collide.js addTurnedBox), and the
 * roof is a top over walls, all on the dam within MOVE of the spawn, in
 * the map's tree, as the corner throw is. Appended last, they leave every
 * page's earlier throws as they were.
 */
const FACES_JS = `
    const s = SPAWN();
    /* Walls in the map's own tree only: an index under the static count. */
    const st = window.__colliders().static;
    const index = new Map(window.__colliderBoxes(s.worldX, s.worldZ, ${MOVE} + 50).map((b) => [[b[0], b[2], b[3], b[5]].join(','), b[6]]));
    const faces = [];
    for (const c of window.__crashSolids(s.worldX, s.worldZ, ${MOVE}, 'wall')) {
      if (!c.box || !(index.get([c.a[0], c.a[2], c.b[0], c.b[2]].join(',')) < st)) continue;
      const [ux, uz, u0, u1, w0, w1] = c.turned || [1, 0, c.a[0], c.b[0], c.a[2], c.b[2]];
      const W = (u, w) => [u * ux - w * uz, u * uz + w * ux];
      /* Each face from the end it starts at, along it (t), its outward
       * normal (n) on t's left, as the Alps skate had its wall. */
      faces.push(
        { c, len: u1 - u0, o: W(u0, w1), t: [ux, uz], n: [-uz, ux] },
        { c, len: u1 - u0, o: W(u1, w0), t: [-ux, -uz], n: [uz, -ux] },
        { c, len: w1 - w0, o: W(u1, w1), t: [uz, -ux], n: [ux, uz] },
        { c, len: w1 - w0, o: W(u0, w0), t: [-uz, ux], n: [-ux, -uz] },
      );
    }`;
THROWS.push({
  id: 'itaipu-quad-skate-nodamage',
  what: 'the interceptor skating along the face of an Itaipu dam block, 4 degrees into it at 10 m/s, rolled into it, crash damage off',
  airframe: 'interceptor',
  map: 'itaipu',
  damage: false,
  plan: `${FACES_JS}
    const a = 4 * Math.PI / 180;
    for (const { c, len, o, t, n } of faces) {
      if (len < 14) continue;
      const x0 = o[0] + 1.5 * t[0] + n[0], z0 = o[1] + 1.5 * t[1] + n[1];
      const g = window.__heightAt(x0, z0);
      if (c.a[1] > g + 0.5 || c.b[1] < g + 3) continue;
      const y = g + 1.5;
      let clear = window.__nearSolid(x0, y, z0, 0.9) > 0.5;
      for (let d = 1; d <= 8 && clear; d += 1) {
        clear = window.__heightAt(x0 + d * t[0], z0 + d * t[1]) < y - 0.8;
      }
      if (!clear) continue;
      const fx = Math.cos(a) * t[0] - Math.sin(a) * n[0], fz = Math.cos(a) * t[1] - Math.sin(a) * n[1];
      return { throw: { x: x0, y, z: z0, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: -15, roll: 25, vx: 10 * fx, vy: 0, vz: 10 * fz }, stick: [0.2, 0, 0, 0.55] };
    }
    return null;`,
});
THROWS.push({
  id: 'itaipu-quad-wall-face-nodamage',
  what: 'the interceptor square into the face of an Itaipu dam block at 25 m/s, crash damage off',
  airframe: 'interceptor',
  map: 'itaipu',
  damage: false,
  plan: `${FACES_JS}
    for (const { c, len, o, t, n } of faces) {
      if (len < 4) continue;
      const at = (d) => [o[0] + t[0] * len / 2 + n[0] * d, o[1] + t[1] * len / 2 + n[1] * d];
      const g = window.__heightAt(...at(4));
      if (c.a[1] > g + 0.5 || c.b[1] < g + 3) continue;
      const y = g + 1.6;
      let clear = true;
      for (let d = 0.6; d <= 4.5 && clear; d += 0.6) {
        const [x, z] = at(d);
        clear = window.__nearSolid(x, y, z, 0.5) > 0.45 && window.__heightAt(x, z) < y - 1;
      }
      if (!clear) continue;
      const [x, z] = at(4.5);
      return { throw: { x, y, z, yaw: Math.atan2(n[0], n[1]) * 180 / Math.PI, pitch: -25, vx: -25 * n[0], vy: 0, vz: -25 * n[1] }, stick: [0, 0, 0, 0] };
    }
    return null;`,
});
/* The roof throw's drop onto a top that stands over walls: the record's
 * solids, which its cover lets the craft through (roofs.js cover). */
const ROOF_WALLS = {
  id: 'itaipu-quad-roof-walls',
  what: 'the interceptor dropped onto an Itaipu dam top over its walls at 8 m/s, 35 degrees down',
  airframe: 'interceptor',
  map: 'itaipu',
  plan: `
    const s = SPAWN();
    const st = window.__colliders().static;
    const a = 35 * Math.PI / 180;
    const tops = window.__roofs().map((r, i) => ({ r, i, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }))
      .filter(({ r }) => r.solids.length && r.solids.every((j) => j < st))
      .map((o) => ({ ...o, d: Math.hypot(o.x - s.worldX, o.z - s.worldZ) }))
      .filter((o) => o.d < ${MOVE})
      .sort((u, v) => u.d - v.d || u.i - v.i);
    for (const { i, x, z } of tops) {
      const top = window.__roofTop(i, x, z);
      if (!(top === window.__surface(x, z, 1e4))) continue;
      const x0 = x - 2 * Math.cos(a), y0 = top + 2 * Math.sin(a) + 0.4;
      if (!(window.__roofTop(i, x0, z) === window.__surface(x0, z, 1e4))) continue;
      if (!(window.__nearSolid(x0, y0, z, 0.8) > 0.75)) continue;
      return { throw: { x: x0, y: y0, z, yaw: -90, pitch: -35, vx: 8 * Math.cos(a), vy: -8 * Math.sin(a), vz: 0 }, stick: [0, 0, 0, 0] };
    }
    return null;`,
};
THROWS.push(ROOF_WALLS, { ...ROOF_WALLS, id: `${ROOF_WALLS.id}-nodamage`, what: `${ROOF_WALLS.what}, crash damage off`, damage: false });

/*
 * The pole throw again with the streamed set made to refill at REFILL_AT,
 * through the map's streamer as a pilot crossing MOVE refills it. With
 * crash damage on the swap declares the crash world again from where the
 * craft is (src/main.js crashBeforeStep), so the step the swap lands at
 * is in the trace. It must land there on the sim clock: flown in frames
 * of FRAME_MS and of a 60 Hz frame's 17 ms, both must give this record
 * (CLAUDE.md: a dropped frame must change nothing about the trajectory).
 * The swap lands SWAP_STEPS (500) after the refill starts
 * (src/maps/itaipu.js), at step 800, where the crash world it declares
 * moves the trace (it parts from itaipu-quad-pole there); one refilled
 * from 200 swaps at 700, which this throw's crash world does not feel, and
 * would guard nothing. When the swap was a frame's, frames of 100 ms put
 * it at step 600 and of 17 ms at one this throw does not feel, and the
 * two parted at step 600 (2026-10-21). Appended last, on the damage on
 * page.
 */
const REFILL_AT = 300;
THROWS.push({
  ...THROWS.find((t) => t.id === 'itaipu-quad-pole'),
  id: 'itaipu-quad-pole-refill',
  what: `the interceptor into an Itaipu pole at 15 m/s, the streamed set refilled from step ${REFILL_AT}, in frames of ${FRAME_MS} and 17 ms`,
  refillAt: REFILL_AT,
  frames: [FRAME_MS, 17],
});

function seed(airframe, map, damage) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map,
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: damage,
    sound: false,
    /* CONTACT_LIVERY: a livery map to fly the throws in, held to the same
     * stock record (scripts/kits-replay.js: a visual kit is pixels only). */
    ...(process.env.CONTACT_LIVERY ? { livery: JSON.parse(process.env.CONTACT_LIVERY) } : {}),
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on defaults and the record says so. */ }`];
}

const PASS_FIELDS = ['resolved', 'resting', 'buried', 'sepFail', 'dvZero', 'inbound', 'outbound', 'plantHeld', 'unheld'];
const PASS = `JSON.parse(JSON.stringify(window.__contacts()))`;

/* Where the town's streamed set stands as `s` (src/maps/itaipu/town/model.js
 * `near`), undefined off Itaipu, and `far(x, z)`: the shell would refill it
 * round a pilot there (the model's wants()). */
/* The town's own record of where its set was filled, live (the map's
 * stats hand out a copy). */
const NEAR = 'window.__mapScene().userData.itaipu.parts.town.stream.near';
const TOWN_JS = `const m = window.__map(); const s = m.parts && m.parts.town && m.parts.town.stream;
  const far = (x, z) => !(Math.hypot(x - s.x, z - s.z) < ${MOVE});`;

async function throwAt(page, plan) {
  const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({
    ...plan.throw, hold: true, fresh: true, clockMs: 0, showCraft: true,
  })}))`).then(JSON.parse);
  if (!thrown.ok) {
    throw new Error(`throw refused: ${JSON.stringify(thrown)}`);
  }
}

const digest = (xs) => createHash('sha256').update(xs.join(',')).digest('hex').slice(0, 24);

async function stage(page, th) {
  await page.tap('KeyR');
  await page.until('window.__crash().flags === 0 && !window.__crash().wrecked', 30000);
  if (th.refillAt !== undefined) {
    /* A refill row's set was refilled round its throw, within MOVE of the
     * spawn, so R leaves it there: each staging starts from one refilled
     * round the spawn, made to want it and put there (a put fills the set
     * where it puts the craft, src/main.js streamToCraft). */
    await page.until('(() => { const m = window.__map(); const c = window.__craftState(); return Math.hypot(c.worldX - m.spawn.x, c.worldZ - m.spawn.z) < 1; })()', 30000);
    const fills = await page.evaluate(`${NEAR}.fills`);
    await page.evaluate(`(() => { ${NEAR}.x = NaN; const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()`);
    await page.until(`${NEAR}.fills !== ${fills}`, 60000);
  }
  /* A map that streams colliders round the pilot (Itaipu's town walls,
   * src/maps/itaipu.js) holds the set round where the craft was before R
   * until it refills: the shell's spot 1.5 km off the spawn on a page's
   * first throw, a throw's own spot after it. A plan reads that set, so it
   * waits for the one round the spawn; read early, the corner plan found a
   * different corner by the host's load (2026-10-20). */
  await page.until(`(() => {
    const m = window.__map();
    const s = m.parts && m.parts.town && m.parts.town.stream;
    return !s || (!s.pending && Math.hypot(s.x - m.spawn.x, s.z - m.spawn.z) < 1);
  })()`, 60000);
  await page.sleep(300);
  const plan = await page.evaluate(`JSON.stringify((() => { ${SPAWN_JS} ${th.plan} })())`).then(JSON.parse);
  if (!plan) {
    throw new Error('no spot on the map fits the throw');
  }
  /* A spot over MOVE from the set's centre starts a refill round it, and
   * the refill runs only while the craft flies: it swapped in 400 to 700
   * steps after the release, as the host's frames fell, and the swap
   * reorders the statics the pass walks, so a throw's digests moved by
   * the load (a town corner, 2026-10-20). Such a spot (the roof's) is flown
   * once first, free, until its set is in, and then thrown again from the
   * same plan. */
  const away = await page.evaluate(`(() => { ${TOWN_JS} return !!s && far(${plan.throw.x}, ${plan.throw.z}); })()`);
  if (away) {
    await throwAt(page, plan);
    await page.evaluate('window.__releasePose()');
    await page.until(`(() => { ${TOWN_JS} const c = window.__craftState(); return !s.pending && !far(c.worldX, c.worldZ); })()`, 60000);
  }
  await throwAt(page, plan);
  if (th.refillAt !== undefined && !await page.evaluate(`window.__refillAt(${th.refillAt})`)) {
    throw new Error(`${th.id}: the map streams nothing to refill`);
  }
  await page.evaluate(`window.__stick(${plan.stick.join(',')})`);
  await page.sleep(400);
  const passBefore = await page.evaluate(PASS);
  const groundBefore = await page.evaluate('window.__ground().contactSteps');
  const FILLS = `(() => { ${TOWN_JS} return s ? s.fills : 0; })()`;
  const fillsBefore = await page.evaluate(FILLS);
  await page.evaluate('window.__releasePose()');
  /* Until the trace is long enough, or the plant has stopped (a wreck at
   * rest is no longer stepped). Stopped is counted in the page's frames,
   * not in wall time: a 2 core runner on SwiftShader drew no frame for over
   * 4 s after a swiss2 throw, and a wall clock wait cut that trace at 0 to
   * 300 steps. STALL_FRAMES frames of FRAME_MS are 2 s of the sim's time. */
  await page.evaluate(`(() => {
    if (window.__goldenFrames !== undefined) return;
    window.__goldenFrames = 0;
    const tick = () => { window.__goldenFrames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  let lastN = -1;
  let since = 0;
  const giveUp = Date.now() + WAIT;
  for (;;) {
    if (Date.now() > giveUp) {
      throw new Error(`${th.id}: the page drew no ${STALL_FRAMES} frames in ${WAIT} ms`);
    }
    const { n, frames } = await page.evaluate('JSON.stringify({ n: window.__stepTrace().n, frames: window.__goldenFrames })').then(JSON.parse);
    if (n >= STEPS) break;
    if (n !== lastN) {
      lastN = n;
      since = frames;
    } else if (frames - since > STALL_FRAMES) {
      break;
    }
    await page.sleep(100);
  }
  const trace = await page.evaluate('JSON.stringify(window.__stepTrace())').then(JSON.parse);
  const fillsAfter = await page.evaluate(FILLS);
  const refills = th.refillAt === undefined ? 0 : 1;
  if (fillsAfter - fillsBefore !== refills) {
    throw new Error(`${th.id}: the town's set refilled ${fillsAfter - fillsBefore} times inside the trace, not ${refills} (fill ${fillsBefore} to ${fillsAfter})`);
  }
  /* What the throw met and which branches of the pass it ran (the pass's
   * counters run for the page's life, so the difference over the throw),
   * so the record states what it pins. */
  const passAfter = await page.evaluate(PASS);
  const met = await page.evaluate(`JSON.stringify((() => {
    const c = window.__contacts();
    return { obstacleEvents: c.obstacle.length, contactEvents: c.log.length, damage: window.__crashLog().map((e) => e.part + ':' + e.type) };
  })())`).then(JSON.parse);
  met.pass = Object.fromEntries(PASS_FIELDS.map((f) => [f, passAfter[f] - passBefore[f]]));
  /* The steps the craft stood on the ground or a roof: a roof is ground
   * (roofs.js), so this is what a roof throw met. */
  met.groundSteps = await page.evaluate('window.__ground().contactSteps') - groundBefore;
  await page.evaluate('window.__stick()');
  return {
    n: Math.min(trace.n, STEPS),
    pre: trace.pre.slice(0, STEPS),
    plane: trace.plane.slice(0, STEPS),
    post: trace.post.slice(0, STEPS),
    throw: plan.throw,
    met,
  };
}

/* CONTACT_ONLY=<id>,... stages only those throws, for working on one. */
const only = process.env.CONTACT_ONLY ? process.env.CONTACT_ONLY.split(',') : null;
const kept = adding ? JSON.parse(readFileSync(RECORD, 'utf8')) : {};
const ACTIVE = THROWS.filter((t) => (!only || only.includes(t.id)) && !(t.id in kept));

async function sample() {
  const out = {};
  const groups = new Map();
  for (const th of ACTIVE) {
    const key = `${th.airframe}@${th.map}@${th.damage !== false}`;
    groups.set(key, [...(groups.get(key) ?? []), th]);
  }
  for (const [key, list] of groups) {
    const [airframe, map, damage] = key.split('@');
    const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${map}`, seed: seed(airframe, map, damage === 'true') });
    try {
      await page.until('window.__shellReady && window.__map && window.__map().ready', WAIT);
      await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()');
      await page.until("window.__mode === 'flight'", 60000);
      await page.evaluate('window.__drawOff(true)');
      /* A frame of a fixed 100 ms, so the shell's once a frame decisions (a
       * perch) act at the same step every run (window.__frameMs). */
      await page.evaluate(`window.__frameMs(${FRAME_MS})`);
      for (const th of list) {
        out[th.id] = await stage(page, th);
        /* The same throw in frames of other lengths, held to the same record. */
        out[th.id].also = [];
        for (const ms of (th.frames ?? []).slice(1)) {
          await page.evaluate(`window.__frameMs(${ms})`);
          out[th.id].also.push(await stage(page, th));
          await page.evaluate(`window.__frameMs(${FRAME_MS})`);
        }
      }
    } finally {
      await page.close();
    }
  }
  return out;
}

/* The first step two traces part at, or -1. */
function partAt(a, b, n) {
  for (let k = 0; k < n; k += 1) {
    if (a.pre[k] !== b.pre[k] || a.plane[k] !== b.plane[k] || a.post[k] !== b.post[k]) {
      return k;
    }
  }
  return -1;
}

if (recording) {
  const runs = [];
  for (let i = 0; i < RECORD_RUNS; i += 1) {
    console.log(`recording run ${i + 1} of ${RECORD_RUNS}`);
    runs.push(await sample());
  }
  const record = {};
  let bad = 0;
  for (const th of ACTIVE) {
    /*
     * The steps every run is sure to agree on. Some of what the page does
     * runs once per drawn frame (the crash and landing decisions), so once
     * the flight gives it something to act on, the step it acts at is the
     * end of whichever frame noticed. A frame steps at most FRAME_DT_MAX
     * (100) steps, so the event lies within the 100 steps before the first
     * step any two runs part at, and the record stops 100 steps short of
     * that: a later run whose frames fell earlier still agrees up to there.
     */
    const traces = runs.flatMap((r) => [r[th.id], ...r[th.id].also]);
    let n = Math.min(...traces.map((t) => t.n));
    let parted = -1;
    for (const t of traces.slice(1)) {
      const k = partAt(traces[0], t, n);
      if (k >= 0 && (parted < 0 || k < parted)) {
        parted = k;
      }
    }
    if (parted >= 0) {
      n = Math.max(0, parted - 100);
      console.log(`  ${th.id}: the recording runs part at step ${parted + 1}; kept the ${n} before the frame that could have acted`);
    }
    if (n < 100) {
      bad += 1;
      console.log(`  ${th.id}: only ${n} reproducible steps; the throw is no use as a record`);
    }
    const t = runs[0][th.id];
    record[th.id] = {
      what: th.what,
      steps: n,
      pre: digest(t.pre.slice(0, n)),
      plane: digest(t.plane.slice(0, n)),
      post: digest(t.post.slice(0, n)),
      throw: t.throw,
      met: t.met,
    };
    console.log(`  ${th.id}: ${n} steps, met ${JSON.stringify(t.met)}`);
  }
  if (bad > 0) {
    console.log('contact-golden: not recorded, the runs disagree');
    process.exit(1);
  }
  if (adding) {
    if (ACTIVE.length === 0) {
      console.log('contact-golden: every throw has its row already, nothing added');
      process.exit(0);
    }
    /* Spliced in after the opening brace, so every row already there stays
     * byte for byte what it was. */
    const rows = JSON.stringify(record, null, 1).slice(2, -2);
    writeFileSync(RECORD, readFileSync(RECORD, 'utf8').replace(/^\{\n/, `{\n${rows},\n`));
    console.log(`contact-golden: added ${ACTIVE.map((t) => t.id).join(', ')} to ${RECORD}`);
    process.exit(0);
  }
  if (only) {
    console.log('contact-golden: a trial of some throws, not written');
    process.exit(0);
  }
  writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`);
  console.log(`contact-golden: recorded ${RECORD}`);
  process.exit(0);
}

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const now = await sample();
let failed = 0;
for (const th of ACTIVE) {
  const want = record[th.id];
  const n = want.steps;
  const frames = th.frames ?? [FRAME_MS];
  [now[th.id], ...now[th.id].also].forEach((got, k) => {
    const label = frames.length > 1 ? `${th.id} (${frames[k]} ms frames)` : th.id;
    if (JSON.stringify(got.throw) !== JSON.stringify(want.throw)) {
      failed += 1;
      console.log(`  FAIL  ${label}: the throw moved (the map changed under the plan, not the pass): ${JSON.stringify(got.throw)}`);
      return;
    }
    const enough = got.n >= n;
    const same = enough
      && digest(got.pre.slice(0, n)) === want.pre
      && digest(got.plane.slice(0, n)) === want.plane
      && digest(got.post.slice(0, n)) === want.post;
    if (!same) {
      failed += 1;
    }
    console.log(`  ${same ? 'pass' : 'FAIL'}  ${label}: ${n} steps${enough ? '' : `, only ${got.n} traced`}  (${th.what})`);
  });
}
if (failed > 0) {
  console.log(`contact-golden: ${failed} FAILED`);
  process.exit(1);
}
console.log('contact-golden: ok');
