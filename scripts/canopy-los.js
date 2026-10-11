/*
 * canopy-los.js: the Interior's canopy hides what it should and shows
 * what it should, the same in Node and the browser, and the drawn trees
 * agree with it (TECH-NEEDS N2 `canopy:los`).
 *
 *     node scripts/canopy-los.js              the room's half, Node only
 *     SIM_GPU=1 node scripts/canopy-los.js --browser
 *                                             and the page's half: the
 *                                             same answers in the page,
 *                                             and the drawn crowns
 *
 * THE ORBITS. Each authored point is looked at from 12 bearings at five
 * depressions (30, 45, 60, 75 and 88 degrees) from 900 m away, as a
 * survey or an orbiting ISR sees it, at a person's chest (1.2 m), and:
 *
 *   under the crowns  (a trunk's foot by each concealment route between
 *                     its openings, 25 m from any of them) blocked from
 *                     every pose at 75 degrees and over and from all but
 *                     UNDER_SEEN of the 60 (the forest is 93 % closed,
 *                     as a real one is not quite, and a rare low line
 *                     threads the gaps between the crowns' lobes);
 *   in a gap          (each route's two, 7 to 9 m) open from overhead
 *                     (88 degrees) from every bearing, and hidden from
 *                     most bearings at 30;
 *   in a clearing     (each route's, 16 to 18 m) open from every bearing
 *                     at 60 degrees and over;
 *   the camp          (Claro Viejo, 30 m) open from every bearing at 45
 *                     and over;
 *   the narrow opening open from overhead;
 *   open ground       (the cañada's grass, Pista Cero) open from every
 *                     pose at 45 degrees and over, and from most at 30
 *                     (across a narrow strip of grass, the forest beside
 *                     it stands in the way of a low look).
 *
 * THE WALK. Along each concealment route, a walker every 10 m is looked at
 * from the 60 orbit poses; the share that sees it is printed, so the
 * reacquisition rhythm the script needs (lost under the crowns, found at
 * a gap, a clearing, the crossing, the opening) is a number, and the run
 * fails if any opening on a route is never seen or the stretches between
 * them are not mostly hidden.
 *
 * DETERMINISM. 4000 seeded lines over the corridor, their answers hashed:
 * the digest is printed, and with --browser the page computes it again
 * with the same modules and must match it to the bit.
 *
 * THE DRAWN CROWNS (--browser). The map is built and the camera parked
 * 120 m over the camp. The near and mid tiers are drawn alone, by their
 * own shaders (which cut each crown to its lobes, crownshape.js), and
 * 3000 lines from the eye to a person's chest on the ground round the
 * camp are asked of the pixel each lands on and of canopyBlocks. A
 * disagreement is allowed only where the line passes within SKIN_M of a
 * lobe's surface (the clumps' hollows, a pixel's width): any other fails
 * the run, and the agreement must be at least AGREE. It is the drawn
 * picture that is tested, so a gap a pilot sees through is one the room
 * leaves open.
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
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWorldBytes } from '../src/share/interior/node.js';
import { makeWorld } from '../src/share/interior/world.js';
import {
  landEdit, OPENINGS, PLACES, opened,
} from '../src/share/interior/places.js';
import { makeCanopy, hash01 } from '../src/share/interior/canopy.js';
import { LOBES, LOBE_DATA } from '../src/render/library/crownshape.js';
import { makeRoutes, ROUTES, CONCEAL_POINTS } from '../src/share/interior/routes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const browser = process.argv.includes('--browser');
const SKIN_M = 0.6;
/* How many of the 60 orbit poses may see a point under the crowns: the
 * 7 % the forest is open, of 60, rounded down. It was 2 while a crown
 * was a whole ellipsoid; lobed crowns (crownshape.js) open their edges
 * as a real crown's are, and a low look threads them a little more. */
const UNDER_SEEN = 4;
const AGREE = 0.97;
const CHEST = 1.2;
const SLANT = 900;
const DEPS = [30, 45, 60, 75, 88];
const BEARINGS = 12;

const world = makeWorld({ ...readWorldBytes(), edits: landEdit });
const canopy = makeCanopy(world);
const routes = makeRoutes(world);

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

/* The orbit poses round a ground point: [{ dep, from }]. Trigonometry is
 * the check's, not the room's: it only places cameras. */
function orbit(x, z) {
  const g = world.groundAt(x, z) + CHEST;
  const out = [];
  for (const dep of DEPS) {
    const e = (dep * Math.PI) / 180;
    for (let b = 0; b < BEARINGS; b += 1) {
      const a = (b / BEARINGS) * Math.PI * 2;
      out.push({ dep, from: [x + SLANT * Math.cos(e) * Math.sin(a), g + SLANT * Math.sin(e), z - SLANT * Math.cos(e) * Math.cos(a)] });
    }
  }
  return { to: [x, g, z], poses: out };
}

/* Each depression's count of bearings that see the point. */
function seenBy(x, z) {
  const { to, poses } = orbit(x, z);
  const n = Object.fromEntries(DEPS.map((d) => [d, 0]));
  for (const p of poses) {
    if (!canopy.canopyBlocks(p.from, to)) {
      n[p.dep] += 1;
    }
  }
  return n;
}
const fmt = (n) => DEPS.map((d) => `${d}:${String(n[d]).padStart(2)}`).join(' ');

/* THE AUTHORED POINTS. */
const opening = (id) => OPENINGS.find((o) => o.id === id);
const points = [];
for (const k of ['west', 'mid', 'east']) {
  for (const g of ['gap-1', 'gap-2']) {
    const o = opening(`${k}-${g}`);
    points.push({ id: `${k}-${g}`, kind: 'gap', at: o.at });
  }
  const c = opening(`${k}-clearing`);
  points.push({ id: `${k}-clearing`, kind: 'clearing', at: c.at });
}
points.push({ id: 'claro-viejo', kind: 'camp', at: PLACES.claroViejo.at });
const narrow = opening('narrow-opening').points;
points.push({ id: 'narrow-opening', kind: 'narrow', at: [(narrow[0][0] + narrow[1][0]) / 2, (narrow[0][1] + narrow[1][1]) / 2] });
points.push({ id: 'canada-grass', kind: 'open', at: [PLACES.canada.at[0] + 0, PLACES.canada.at[1] + 120] });
points.push({ id: 'pista-cero', kind: 'open', at: PLACES.pistaCero.at });
/* Under the crowns: the foot of the trunk nearest the middle of each
 * route's stretch between its first gap and the path crossing, and
 * between the crossing and the clearing, that stands at least 25 m from
 * every opening (a trunk on a clearing's edge is seen across it, and
 * should be). */
for (const k of ['west', 'mid', 'east']) {
  const pts = ROUTES[`conceal-${k}-a`].pts;
  for (const [i, j] of [[CONCEAL_POINTS.gap1, CONCEAL_POINTS['path-crossing']], [CONCEAL_POINTS['path-crossing'], CONCEAL_POINTS.clearing]]) {
    const mx = (pts[i][0] + pts[j][0]) / 2;
    const mz = (pts[i][1] + pts[j][1]) / 2;
    const near = canopy.treesIn(mx - 40, mz - 40, mx + 40, mz + 40, []).filter((t) => !opened(t.x, t.z, 30)).sort((a, b) => (a.x - mx) ** 2 + (a.z - mz) ** 2 - ((b.x - mx) ** 2 + (b.z - mz) ** 2));
    if (!near.length) {
      fail(`conceal-${k}: no tree within 40 m of its stretch's middle and 25 m from an opening`);
      continue;
    }
    points.push({ id: `under-${k}-${i}-${j}`, kind: 'under', at: [near[0].x + 0.5, near[0].z] });
  }
}

const EXPECT = {
  under: (n) => (DEPS.reduce((a, d) => a + n[d], 0) <= UNDER_SEEN && n[75] === 0 && n[88] === 0) || `seen from more than ${UNDER_SEEN} of the 60 poses, or from overhead`,
  gap: (n) => (n[88] === BEARINGS && n[30] <= BEARINGS / 2) || 'not open overhead, or open from most bearings at 30 degrees',
  clearing: (n) => (n[60] === BEARINGS && n[75] === BEARINGS && n[88] === BEARINGS) || 'not open from every bearing at 60 degrees and over',
  camp: (n) => [45, 60, 75, 88].every((d) => n[d] === BEARINGS) || 'not open from every bearing at 45 degrees and over',
  narrow: (n) => n[88] >= BEARINGS - 1 || 'not open overhead',
  open: (n) => ([45, 60, 75, 88].every((d) => n[d] === BEARINGS) && n[30] >= BEARINGS - 3) || 'not open from every pose at 45 degrees and over, or from most at 30',
};
console.log('the orbits: bearings of 12 that see the point, by depression');
for (const p of points) {
  const n = seenBy(p.at[0], p.at[1]);
  const ok = EXPECT[p.kind](n);
  console.log(`  ${p.id.padEnd(22)} ${p.kind.padEnd(8)} ${fmt(n)}${ok === true ? '' : '  <- '}`);
  if (ok !== true) {
    fail(`${p.id} (${p.kind}): ${ok}`);
  }
}

/* THE WALK. */
console.log('the walk: share of the 60 orbit poses that see a walker, every 10 m (# seen by more than a fifth)');
for (const k of ['west', 'mid', 'east']) {
  const id = `conceal-${k}-a`;
  const r = ROUTES[id];
  const total = routes.total(id);
  let line = '';
  let seenAt = 0;
  let samples = 0;
  for (let ms = 0; ms <= total; ms += (10 / r.speed) * 1000) {
    const p = routes.poseOnRoute(id, ms);
    const { to, poses } = orbit(p.x, p.z);
    const s = poses.filter((q) => !canopy.canopyBlocks(q.from, to)).length / poses.length;
    line += s > 0.2 ? '#' : s > 0 ? '+' : '.';
    samples += 1;
    seenAt += s > 0.2 ? 1 : 0;
  }
  console.log(`  ${id.padEnd(16)} ${line}`);
  for (const [name, i] of Object.entries(CONCEAL_POINTS)) {
    if (name === 'forest-edge') {
      continue;
    }
    const [x, z] = r.pts[i];
    const n = seenBy(x, z);
    if (!DEPS.some((d) => n[d] > 0)) {
      fail(`${id}: its ${name} is seen from no pose`);
    }
  }
  if (seenAt / samples > 0.5) {
    fail(`${id}: a walker is in plain sight over ${(100 * seenAt / samples).toFixed(0)} % of the route, so the canopy hides too little of it`);
  }
}

/* DETERMINISM AND SPEED. */
function seededLines() {
  const out = [];
  const [cx, cz] = PLACES.sectorCharlie.at;
  for (let k = 0; k < 4000; k += 1) {
    const tx = cx + (hash01(k, 1, 77) - 0.5) * 1600;
    const tz = cz + (hash01(k, 2, 77) - 0.5) * 1600;
    const ty = world.groundAt(tx, tz) + 1 + 2 * hash01(k, 3, 77);
    const fx = tx + (hash01(k, 4, 77) - 0.5) * 2400;
    const fz = tz + (hash01(k, 5, 77) - 0.5) * 2400;
    const fy = ty + 80 + 1500 * hash01(k, 6, 77);
    out.push([[fx, fy, fz], [tx, ty, tz]]);
  }
  return out;
}
const lines = seededLines();
const t0 = performance.now();
const answers = lines.map(([a, b]) => (canopy.canopyBlocks(a, b) ? '1' : '0')).join('');
const usEach = ((performance.now() - t0) * 1000) / lines.length;
const trees = canopy.treesIn(-200, -200, 200, 200, []).map((t) => `${t.x},${t.z},${t.h},${t.r},${t.ry}`).join(';');
const digest = createHash('sha256').update(answers).update(trees).digest('hex').slice(0, 16);
console.log(`determinism: 4000 lines, ${answers.split('').filter((c) => c === '1').length} blocked, digest ${digest}; ${usEach.toFixed(1)} us a line`);
if (!(usEach < 200)) {
  fail(`a line of sight takes ${usEach.toFixed(0)} us, too slow for the room to ask per contact per second`);
}

if (browser) {
  const { openPage } = await import('../tests/lib/page.js');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=interior' });
  try {
    await page.until('window.__map && window.__map().id === "interior" && window.__map().ready', 180000);
    /* The same digest from the same modules in the page. */
    const pageDigest = await page.evaluate(`(async () => {
      const w = await import('/src/share/interior/world.js');
      const p = await import('/src/share/interior/places.js');
      const c = await import('/src/share/interior/canopy.js');
      const world = w.makeWorld({ ...(await w.fetchWorldBytes()), edits: p.landEdit });
      const canopy = c.makeCanopy(world);
      const lines = ${JSON.stringify(lines)};
      const answers = lines.map(([a, b]) => (canopy.canopyBlocks(a, b) ? '1' : '0')).join('');
      const trees = canopy.treesIn(-200, -200, 200, 200, []).map((t) => t.x + ',' + t.z + ',' + t.h + ',' + t.r + ',' + t.ry).join(';');
      const data = new TextEncoder().encode(answers + trees);
      const h = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    })()`);
    console.log(`page digest ${pageDigest}`);
    if (pageDigest !== digest) {
      fail(`the page's canopy answers differ from Node's (${pageDigest} against ${digest})`);
    }
    /* The drawn crowns, the camera parked over the camp: the near and mid
     * tiers drawn alone by their own shaders, which cut each crown to its
     * lobes, and every line from the eye to a point on the ground asked
     * of the pixel it lands on and of canopyBlocks. */
    const [cx, cz] = PLACES.claroViejo.at;
    const cy = world.groundAt(cx, cz);
    const eye = [cx, cy + 120, cz + 40];
    await page.evaluate(`(window.__setCam(${eye[0]}, ${eye[1]}, ${eye[2]}, ${cx}, ${cy}, ${cz}, 44), "")`);
    await page.until(`(() => { const u = window.__mapScene().userData.interior; return u.trees.stats().pending === 0 && u.trees.stats().near > 0; })()`, 60000);
    await page.sleep(1000);
    const rays = [];
    for (let k = 0; k < 3000; k += 1) {
      const tx = cx + (hash01(k, 11, 5) - 0.5) * 180;
      const tz = cz + (hash01(k, 12, 5) - 0.5) * 160;
      rays.push([eye, [tx, world.groundAt(tx, tz) + CHEST, tz]]);
    }
    const drawn = await page.evaluate(`(async () => {
      const THREE = await import('three');
      const u = window.__mapScene().userData.interior;
      const W = 1280;
      const H = 720;
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setSize(W, H, false);
      renderer.setClearColor(0xff00ff, 1);
      const camera = new THREE.PerspectiveCamera(44, W / H, 0.5, 4000);
      camera.position.set(${eye.join(', ')});
      camera.lookAt(${cx}, ${cy}, ${cz});
      camera.updateMatrixWorld();
      const scene = new THREE.Scene();
      const tiers = [u.trees.near, u.trees.mid];
      const homes = tiers.map((m) => m.parent);
      for (const m of tiers) {
        scene.add(m);
      }
      const target = new THREE.WebGLRenderTarget(W, H);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const px = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
      renderer.setRenderTarget(null);
      tiers.forEach((m, i) => homes[i].add(m));
      target.dispose();
      renderer.dispose();
      const v = new THREE.Vector3();
      return ${JSON.stringify(rays)}.map(([, b]) => {
        v.set(...b).project(camera);
        if (Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98 || v.z > 1) {
          return -1;
        }
        const x = Math.round((v.x * 0.5 + 0.5) * (W - 1));
        const y = Math.round((v.y * 0.5 + 0.5) * (H - 1));
        const i = (y * W + x) * 4;
        return px[i] === 255 && px[i + 1] === 0 && px[i + 2] === 255 ? 0 : 1;
      });
    })()`);
    /* How close a line comes to a crown's lobes' skin, metres. */
    const skin = ([a, b]) => {
      let best = Infinity;
      const xs = [a[0], b[0]];
      const zs = [a[2], b[2]];
      for (const t of canopy.treesIn(Math.min(...xs) - 8, Math.min(...zs) - 8, Math.max(...xs) + 8, Math.max(...zs) + 8, [])) {
        for (let s = 0; s <= 400; s += 1) {
          const f = s / 400;
          const qx = (a[0] + (b[0] - a[0]) * f - t.x) / t.r;
          const qy = (a[1] + (b[1] - a[1]) * f - t.cy) / t.ry;
          const qz = (a[2] + (b[2] - a[2]) * f - t.z) / t.r;
          for (let k = 0; k < LOBES; k += 1) {
            const i = (t.lobe * LOBES + k) * 4;
            const d = Math.hypot(qx - LOBE_DATA[i], qy - LOBE_DATA[i + 1], qz - LOBE_DATA[i + 2]) - LOBE_DATA[i + 3];
            best = Math.min(best, Math.abs(d) * Math.min(t.r, t.ry));
          }
        }
      }
      return best;
    };
    let agree = 0;
    let hard = 0;
    let asked = 0;
    rays.forEach((ray, k) => {
      if (drawn[k] < 0) {
        return;
      }
      asked += 1;
      const room = canopy.canopyBlocks(ray[0], ray[1]) ? 1 : 0;
      if (room === drawn[k]) {
        agree += 1;
        return;
      }
      const s = skin(ray);
      if (s > SKIN_M) {
        hard += 1;
        if (hard <= 5) {
          console.log(`  disagreement ${s.toFixed(2)} m from a crown's skin: room ${room} drawn ${drawn[k]} ${JSON.stringify(ray)}`);
        }
      }
    });
    const share = agree / asked;
    console.log(`drawn crowns: ${(100 * share).toFixed(1)} % of ${asked} lines in view agree with canopyBlocks; ${hard} disagree away from a crown's skin`);
    if (share < AGREE) {
      fail(`only ${(100 * share).toFixed(1)} % of lines agree with the drawn crowns, under ${100 * AGREE} %`);
    }
    if (hard) {
      fail(`${hard} lines disagree with the drawn crowns more than ${SKIN_M} m from any crown's skin`);
    }
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
  } finally {
    await page.close();
  }
}

if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS, the canopy hides and shows as authored${browser ? ', the same in the page, and as drawn' : ''}`);
}
