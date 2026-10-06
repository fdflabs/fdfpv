/*
 * interior-collide.js: on the Interior's map, what a craft can hit is what
 * is drawn, and what is drawn is what it can hit (TECH-NEEDS N1
 * `interior:collide`: no invisible walls, no flying through the
 * buildings, the bridge or the mast), as a sweep rather than a list of
 * places, after scripts/collide-audit-itaipu.js's drawn and phantom.
 *
 *     SIM_GPU=1 node scripts/interior-collide.js
 *
 * In headless Chromium, the map built by the shell:
 *
 *   drawn     drawn but not solid: points on every triangle of every
 *             solid mesh the map draws (the walls, the roofs, the
 *             concrete: built.js; the camp's props when they land), one a
 *             square metre, each within TOL of a collider, a roof or the
 *             ground. A point further is a fly through.
 *   phantom   solid but not drawn: points on every collider's outside, a
 *             metre apart, 5 cm out, not inside another solid nor under
 *             the ground or a roof, each within NEAR of a drawn
 *             triangle. A point further is an invisible wall.
 *   roofs     every building's roof is ground from above (the surface over
 *             its middle is its ridge or plate, not the ground under it),
 *             and the bridge's deck is ground from above and the water's
 *             surface from under it;
 *   under     a craft flies under Puente Doble: the middle of each span,
 *             between the water and the deck, is clear of every solid.
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
import { BRIDGES, BUILDINGS, CAMP_PROPS } from '../src/share/interior/places.js';
import { RIVER } from '../src/share/interior/hydro.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TOL = 0.3;
const NEAR = 1.0;
/* The meshes that stand for solid things; roads, water and trees are
 * not (the trees are the canopy's, canopy:los). */
const SOLID_MESHES = ['interior-walls', 'interior-roofs', 'interior-concrete', 'interior-camp-solid', 'interior-camp-mast', 'interior-machines'];

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

const SWEEP = /* js */ `(() => {
  const SOLID = ${JSON.stringify(SOLID_MESHES)};
  const TOL = ${TOL};
  const NEAR = ${NEAR};
  const col = window.__mapScene().userData.interior.colliders;
  const scene = window.__mapScene();
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh && SOLID.includes(o.name)) meshes.push(o); });
  /* Every drawn triangle, world, in a 4 m bucket grid for the nearest. */
  const tris = [];
  for (const m of meshes) {
    m.updateMatrixWorld();
    const p = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const n = idx ? idx.count : p.count;
    const v = (k) => { const i = idx ? idx.getX(k) : k; const e = m.matrixWorld.elements;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
    for (let k = 0; k < n; k += 3) { tris.push([v(k), v(k + 1), v(k + 2), m.name]); }
  }
  const B = 4;
  const grid = new Map();
  const key = (i, j) => i * 100000 + j;
  tris.forEach((t, k) => {
    const xs = t.slice(0, 3).map((q) => q[0]);
    const zs = t.slice(0, 3).map((q) => q[2]);
    for (let i = Math.floor((Math.min(...xs) - NEAR) / B); i <= Math.floor((Math.max(...xs) + NEAR) / B); i += 1) {
      for (let j = Math.floor((Math.min(...zs) - NEAR) / B); j <= Math.floor((Math.max(...zs) + NEAR) / B); j += 1) {
        const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k);
      }
    }
  });
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  /* Point to triangle distance (Ericson's closest point). */
  function triDist(p, [a, b, c]) {
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    let q;
    if (d1 <= 0 && d2 <= 0) q = a; else {
      const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp);
      if (d3 >= 0 && d4 <= d3) q = b; else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; } else {
          const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp);
          if (d6 >= 0 && d5 <= d6) q = c; else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; } else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; } else {
                const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den;
                q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
              }
            }
          }
        }
      }
    }
    const d = sub(p, q); return Math.sqrt(dot(d, d));
  }
  function nearestTri(p) {
    const list = grid.get(key(Math.floor(p[0] / B), Math.floor(p[2] / B))) || [];
    let best = Infinity;
    for (const k of list) best = Math.min(best, triDist(p, tris[k]));
    return best;
  }
  const surface = (x, z, fromY) => window.__surface(x, z, fromY);
  /* DRAWN: a point a square metre on every triangle. */
  let drawnPts = 0;
  const misses = [];
  for (const [a, b, c, name] of tris) {
    const ab = sub(b, a), ac = sub(c, a);
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const area = Math.sqrt(dot(cr, cr)) / 2;
    const n = Math.max(1, Math.min(400, Math.round(area)));
    for (let s = 0; s < n; s += 1) {
      let u = (((s + 0.5) * 0.618034) % 1), v = (((s + 0.5) * 0.754878 + 0.31) % 1);
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const p = [a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v];
      drawnPts += 1;
      if (col.gapAt(p[0], p[1], p[2], TOL) <= TOL) continue;
      if (Math.abs(surface(p[0], p[2], p[1] + TOL) - p[1]) <= TOL) continue;
      misses.push({ name, p: p.map((x) => Math.round(x * 10) / 10) });
    }
  }
  /* PHANTOM: points on every collider's outside near the built meshes. */
  /* The frozen set's arrays (src/game/collide.js FROZEN): 2 a turned box. */
  const TURNED = 2;
  let phantomPts = 0;
  const phantoms = [];
  const test = (p) => {
    if (col.gapAt(p[0], p[1], p[2], 0.01) <= 0.01) return;
    if (surface(p[0], p[2], 1e9) >= p[1]) return;
    phantomPts += 1;
    const d = nearestTri(p);
    if (d > NEAR) phantoms.push({ p: p.map((x) => Math.round(x * 10) / 10), d: Math.round(d * 100) / 100 });
  };
  for (let i = 0; i < col.count; i += 1) {
    if (col.fbox[i] === TURNED) {
      const ux = col.fux[i], uz = col.fuz[i];
      const u0 = col.fu0[i], u1 = col.fu1[i], w0 = col.fw0[i], w1 = col.fw1[i], y0 = col.fay[i], y1 = col.fby[i];
      const at = (u, w, y) => [u * ux - w * uz, y, u * uz + w * ux];
      const nu = Math.max(1, Math.ceil(u1 - u0)), nw = Math.max(1, Math.ceil(w1 - w0)), ny = Math.max(1, Math.ceil(y1 - y0));
      for (let a = 0; a <= nu; a += 1) for (let c = 0; c <= ny; c += 1) {
        const u = u0 + (u1 - u0) * a / nu, y = y0 + (y1 - y0) * c / ny;
        test(at(u, w0 - 0.05, y)); test(at(u, w1 + 0.05, y));
      }
      for (let b = 0; b <= nw; b += 1) for (let c = 0; c <= ny; c += 1) {
        const w = w0 + (w1 - w0) * b / nw, y = y0 + (y1 - y0) * c / ny;
        test(at(u0 - 0.05, w, y)); test(at(u1 + 0.05, w, y));
      }
      for (let a = 0; a <= nu; a += 1) for (let b = 0; b <= nw; b += 1) {
        test(at(u0 + (u1 - u0) * a / nu, w0 + (w1 - w0) * b / nw, y1 + 0.05));
      }
    } else if (col.fbox[i] === 0 && col.fr[i] > 0) {
      const r = col.fr[i] + 0.05;
      const len = Math.hypot(col.fbx[i] - col.fax[i], col.fby[i] - col.fay[i], col.fbz[i] - col.faz[i]);
      const n = Math.max(1, Math.ceil(len));
      for (let s = 0; s <= n; s += 1) {
        const f = s / n;
        const cx = col.fax[i] + (col.fbx[i] - col.fax[i]) * f, cy = col.fay[i] + (col.fby[i] - col.fay[i]) * f, cz = col.faz[i] + (col.fbz[i] - col.faz[i]) * f;
        for (let k = 0; k < 8; k += 1) { const a = k / 8 * 6.2832; test([cx + r * Math.cos(a), cy, cz + r * Math.sin(a)]); }
      }
    }
  }
  return { meshes: meshes.map((m) => m.name), tris: tris.length, drawnPts, misses: misses.length, missList: misses.filter((m, k) => k % Math.max(1, Math.floor(misses.length / 12)) === 0).slice(0, 12), phantomPts, phantoms: phantoms.length, phantomList: phantoms.filter((m, k) => k % Math.max(1, Math.floor(phantoms.length / 12)) === 0).slice(0, 12), colliders: col.count };
})()`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=interior' });
try {
  await page.until('window.__map && window.__map().id === "interior" && window.__map().ready', 180000);
  const r = await page.evaluate(SWEEP);
  console.log(`solid meshes ${r.meshes.join(', ')}: ${r.tris} triangles, ${r.colliders} colliders`);
  console.log(`drawn: ${r.drawnPts} points on drawn triangles, ${r.misses} further than ${TOL} m from any solid, roof or ground`);
  for (const m of r.missList) {
    console.log(`    ${m.name} at ${m.p.join(', ')}`);
  }
  if (r.misses) {
    fail(`${r.misses} drawn points a craft would fly through`);
  }
  console.log(`phantom: ${r.phantomPts} points on colliders' outsides, ${r.phantoms} further than ${NEAR} m from anything drawn`);
  for (const p of r.phantomList) {
    console.log(`    at ${p.p.join(', ')}, ${p.d} m from a drawn triangle`);
  }
  if (r.phantoms) {
    fail(`${r.phantoms} collider points with nothing drawn within ${NEAR} m: invisible walls`);
  }
  /* ROOFS. */
  const roofs = await page.evaluate(`(${JSON.stringify(BUILDINGS.map((b) => ({ id: b.id, at: b.at, kind: b.kind })))}).map((b) => ({ ...b, top: window.__surface(b.at[0], b.at[1], 1e9), ground: window.__surface(b.at[0], b.at[1], -1e9) }))`);
  let flat = 0;
  for (const b of roofs) {
    if (!(b.top > b.ground + 1.5)) {
      flat += 1;
      fail(`${b.id}: its roof is not ground from above (${b.top.toFixed(2)} over ground ${b.ground.toFixed(2)})`);
    }
  }
  console.log(`roofs: ${roofs.length - flat} of ${roofs.length} buildings are ground from above`);
  for (const b of BRIDGES) {
    const cx = (b.from[0] + b.to[0]) / 2;
    const cz = (b.from[1] + b.to[1]) / 2;
    const s = await page.evaluate(`[window.__surface(${cx}, ${cz}, 1e9), window.__surface(${cx}, ${cz}, ${b.deckY - 3})]`);
    console.log(`bridge ${b.id}: from above ${s[0].toFixed(2)} (deck ${b.deckY}), from under ${s[1].toFixed(2)}`);
    if (Math.abs(s[0] - b.deckY) > 0.05) {
      fail(`${b.id}: its deck is not ground from above`);
    }
    if (!(s[1] < b.deckY - 2)) {
      fail(`${b.id}: under its deck, the surface is the deck`);
    }
    /* UNDER: the middle of each span, half way between the water and the
     * deck's underside. */
    const level = RIVER.level[RIVER.points.reduce((bi, p, k) => ((p[0] - cx) ** 2 + (p[1] - cz) ** 2 < (RIVER.points[bi][0] - cx) ** 2 + (RIVER.points[bi][1] - cz) ** 2 ? k : bi), 0)];
    for (const f of [0.25, 0.75]) {
      const x = b.from[0] + (b.to[0] - b.from[0]) * f;
      const z = b.from[1] + (b.to[1] - b.from[1]) * f;
      const y = (level + b.deckY - b.deckThick) / 2;
      const gap = await page.evaluate(`window.__mapScene().userData.interior.colliders.gapAt(${x}, ${y}, ${z}, 5)`);
      console.log(`  under span ${f === 0.25 ? 1 : 2}: ${(b.deckY - b.deckThick - level).toFixed(2)} m of air over the water, nearest solid ${gap.toFixed(2)} m`);
      if (!(gap > 0.6)) {
        fail(`${b.id}: under span ${f === 0.25 ? 1 : 2} a craft meets a solid ${gap.toFixed(2)} m away`);
      }
    }
  }
  /* THE MAST: solid standing, nothing solid where it stood once it is
   * down, solid again when it stands. */
  {
    const [x, z] = CAMP_PROPS.mast.at;
    const probe = `(() => { const u = window.__mapScene().userData.interior; const g = u.world.groundAt(${x}, ${z});
      return u.colliders.gapAt(${x}, g + ${CAMP_PROPS.mast.h / 2}, ${z}, 2); })()`;
    const up = await page.evaluate(probe);
    await page.evaluate('(window.__map && window.__mapScene().userData.interior.life.setCamp({ mast: 1 }), "")');
    const down = await page.evaluate(probe);
    await page.evaluate('(window.__mapScene().userData.interior.life.setCamp({ mast: 0 }), "")');
    const again = await page.evaluate(probe);
    console.log(`mast: solid ${up.toFixed(2)} m away standing, ${Number.isFinite(down) ? down.toFixed(2) : 'nothing'} down, ${again.toFixed(2)} standing again`);
    if (!(up < 0.05) || Number.isFinite(down) && down < 1 || !(again < 0.05)) {
      fail('the mast\'s solid does not follow it down and up');
    }
  }
  const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  for (const e of real) {
    fail(`console: ${e}`);
  }
} finally {
  await page.close();
}

if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log('PASS, every drawn solid solid, every solid drawn, every roof landable, the bridge flown under');
}
