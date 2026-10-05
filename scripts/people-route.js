/*
 * people-route.js: every authored route of the Interior's Mission 1 walks
 * as authored (TECH-NEEDS N3 `people:route`, N4 `vehicles:route`).
 *
 *     node scripts/people-route.js              Node only
 *     node scripts/people-route.js --browser    and the same poses in a page
 *
 * For every route in src/share/interior/routes.js, walked on its own
 * clock (ms since the contact started it) every STEP_MS over one lap of a
 * loop or until a route is over:
 *
 *   deterministic  every pose hashed; walked twice, the digests match,
 *                  and with --browser the page's digest matches Node's;
 *   on the ground  each pose's height is the shared ground under it (plus
 *                  the lookout's deck), the ground the map draws;
 *   no walls       no stretch of a route passes through a building's walls
 *                  (places.js BUILDINGS, the turned boxes built.js makes
 *                  solid);
 *   no river       no stretch is in Río Sereno's channel but on Puente
 *                  Doble's deck;
 *   in the map     every pose inside the played square;
 *   no jumps       no pose further from the last than its speed allows;
 *   actions        every action one of routes.js ACTIONS, and a route's
 *                  first pose at its first point (ms is route local).
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

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWorldBytes } from '../src/share/interior/node.js';
import { makeWorld } from '../src/share/interior/world.js';
import { inPlay } from '../src/share/interior/frame.js';
import {
  BRIDGES, BUILDINGS, landEdit, nearestOnLine,
} from '../src/share/interior/places.js';
import { RIVER } from '../src/share/interior/hydro.js';
import { makeRoutes, ACTIONS, ROUTES } from '../src/share/interior/routes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const STEP_MS = 500;
const browser = process.argv.includes('--browser');
const world = makeWorld({ ...readWorldBytes(), edits: landEdit });

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

function walk(routes) {
  const h = createHash('sha256');
  const out = {};
  for (const id of routes.ids) {
    const r = routes.route(id);
    const total = routes.total(id);
    const poses = [];
    for (let ms = 0; ms <= total + STEP_MS; ms += STEP_MS) {
      const p = routes.poseOnRoute(id, ms);
      poses.push(p);
      h.update(p ? `${id}|${ms}|${p.x}|${p.y}|${p.z}|${p.action};` : `${id}|${ms}|gone;`);
      if (!p && !r.loop) {
        break;
      }
    }
    out[id] = poses;
  }
  return { poses: out, digest: h.digest('hex').slice(0, 16) };
}

const routes = makeRoutes(world);
const first = walk(routes);
const again = walk(makeRoutes(world));
console.log(`${routes.ids.length} routes, digest ${first.digest}`);
if (again.digest !== first.digest) {
  fail(`walked twice, the routes differ (${first.digest}, ${again.digest})`);
}

/* A building's walls as a turned box, the same one built.js makes solid,
 * with a hand's breadth round it. */
const walls = BUILDINGS.filter((b) => b.kind !== 'openshed').map((b) => ({
  id: b.id, c: b.at, u: b.dir, hw: b.w / 2 + 0.2, hd: b.d / 2 + 0.2,
}));
function inWalls(x, z) {
  for (const w of walls) {
    const dx = x - w.c[0];
    const dz = z - w.c[1];
    if (Math.abs(dx * w.u[0] + dz * w.u[1]) < w.hw && Math.abs(-dx * w.u[1] + dz * w.u[0]) < w.hd) {
      return w.id;
    }
  }
  return null;
}
const minWidth = Math.min(...RIVER.width);
function inRiver(x, z) {
  const n = nearestOnLine(RIVER.points, x, z);
  if (n.d > minWidth / 2) {
    return false;
  }
  return !BRIDGES.some((b) => {
    const cx = (b.from[0] + b.to[0]) / 2;
    const cz = (b.from[1] + b.to[1]) / 2;
    const len = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]);
    const dx = x - cx;
    const dz = z - cz;
    return Math.abs(dx * b.dir[0] + dz * b.dir[1]) < len / 2 && Math.abs(-dx * b.dir[1] + dz * b.dir[0]) < b.width / 2;
  });
}

for (const id of routes.ids) {
  const r = ROUTES[id];
  const poses = first.poses[id];
  if (!poses[0]) {
    fail(`${id}: no pose at its start`);
    continue;
  }
  const [x0, z0] = r.pts[0];
  if (Math.hypot(poses[0].x - x0, poses[0].z - z0) > 1e-6) {
    fail(`${id}: its pose at 0 ms is not its first point`);
  }
  let worst = 0;
  poses.forEach((p, k) => {
    if (!p) {
      return;
    }
    const gy = world.groundAt(p.x, p.z) + (r.deck || 0);
    worst = Math.max(worst, Math.abs(p.y - gy));
    if (!ACTIONS.includes(p.action)) {
      fail(`${id}: action ${p.action} is not one of routes.js ACTIONS`);
    }
    if (!inPlay(p.x, p.z)) {
      fail(`${id}: at ${k * STEP_MS} ms it is outside the played square`);
    }
    const q = poses[k - 1];
    if (q) {
      const step = Math.hypot(p.x - q.x, p.z - q.z);
      const max = (r.speed * STEP_MS) / 1000 + 1e-6;
      if (step > max && !(r.loop && k > 0 && step < 1e-3)) {
        fail(`${id}: jumps ${step.toFixed(2)} m in ${STEP_MS} ms at ${k * STEP_MS} ms, over its ${r.speed} m/s`);
      }
    }
  });
  if (worst > 1e-9) {
    fail(`${id}: stands up to ${worst} m off the ground`);
  }
  /* Its stretches, every half metre. */
  for (let k = 0; k + 1 < r.pts.length; k += 1) {
    const [ax, az] = r.pts[k];
    const [bx, bz] = r.pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let s = 0; s <= n; s += 1) {
      const x = ax + ((bx - ax) * s) / n;
      const z = az + ((bz - az) * s) / n;
      const wall = inWalls(x, z);
      if (wall) {
        fail(`${id}: its stretch ${k} passes through ${wall}'s walls`);
        break;
      }
      if (!r.vehicle || r.vehicle !== 'boat') {
        if (inRiver(x, z)) {
          fail(`${id}: its stretch ${k} crosses Río Sereno off the bridge`);
          break;
        }
      }
    }
  }
}
console.log(`walked every ${STEP_MS} ms: ${Object.values(first.poses).reduce((a, p) => a + p.length, 0)} poses`);

if (browser) {
  const { openPage } = await import('../tests/lib/page.js');
  const page = await openPage({ root, width: 800, height: 450, url: '/index.html' });
  try {
    await page.until('window.__map && window.__map() && window.__map().ready', 180000);
    const pageDigest = await page.evaluate(`(async () => {
      const w = await import('/src/share/interior/world.js');
      const p = await import('/src/share/interior/places.js');
      const r = await import('/src/share/interior/routes.js');
      const world = w.makeWorld({ ...(await w.fetchWorldBytes()), edits: p.landEdit });
      const routes = r.makeRoutes(world);
      let text = '';
      for (const id of routes.ids) {
        const route = routes.route(id);
        const total = routes.total(id);
        for (let ms = 0; ms <= total + ${STEP_MS}; ms += ${STEP_MS}) {
          const q = routes.poseOnRoute(id, ms);
          text += q ? id + '|' + ms + '|' + q.x + '|' + q.y + '|' + q.z + '|' + q.action + ';' : id + '|' + ms + '|gone;';
          if (!q && !route.loop) { break; }
        }
      }
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    })()`);
    console.log(`page digest ${pageDigest}`);
    if (pageDigest !== first.digest) {
      fail(`the page's routes differ from Node's (${pageDigest} against ${first.digest})`);
    }
  } finally {
    await page.close();
  }
}

if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS, every route deterministic, on the ground, clear of walls and the river${browser ? ', the same in the page' : ''}`);
}
