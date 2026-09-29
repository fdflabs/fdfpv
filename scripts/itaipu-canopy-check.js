/*
 * itaipu-canopy-check.js: package G's promises for Itaipu's vegetation,
 * measured in the real shell (docs/ITAIPU-PLAN.md section 14, row G).
 *
 *   node scripts/itaipu-canopy-check.js [--shots=DIR]
 *   SIM_GPU=1 for the machine's GPU instead of SwiftShader
 *   --shots=DIR a picture of each crown throw at rest into DIR (outside
 *               the repository: pictures are not committed)
 *
 * One page, the Itaipu map, a Turbo Timber seated, crash damage on:
 *
 *   under       swiss2's tree-crown regression on a near tree of this map
 *               (scripts/tree-check.js has the owner's report): a Timber
 *               flown level at 4.6 m over the grass, 79 km/h, beside a
 *               lone tree's trunk (its wing tip 0.5 m clear of the bark)
 *               and under its crown, passes without touching anything of
 *               the tree: no plant event on foliage or wood, no entry into
 *               a crown, no contact with a trunk or a crown. The tree is
 *               one with its lowest drawn leaf over the path at least a
 *               metre over the craft, on flat ground, in no forest.
 *   crown       one thrown into the same crown is held: at rest more than
 *               a metre up, the plant's inTree flag set, and a point of
 *               the drawn craft inside a drawn clump of leaves.
 *   volume      a craft below the canopy's top in closed forest, far from
 *               any near tree, gets a canopy contact through the contact
 *               pass's canopy call (src/main.js: kind canopy, no
 *               collider), and one thrown 2 m over the top and climbing
 *               does not.
 *   refill      moving 450 m refills the near trees, every slice of the
 *               refill (the part's adds and the grid's steps) under 2 ms,
 *               at most 4 000 near trees; and at the densest point of the
 *               hero the same, with the streamed set's size printed.
 *
 * Every tree is found in the part's own planting and its crown in swiss2's
 * crown generator, which is what the drawing is made from
 * (src/maps/itaipu/vegetation/). The streamed set follows the camera while
 * a capture has placed it (src/main.js focus), so the camera is parked
 * where each test flies and the set settles there first.
 *
 * Headless Chromium through tests/lib/page.js. Exits 1 on any failure.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const shotsDir = arg('shots', '');

/* The owner's pass: 4.6 m over the grass at 79 km/h, the wing tip half a
 * metre off the bark, and a metre at least between the craft and the
 * lowest leaf over its path. */
const UNDER_AGL = 4.6;
const UNDER_V = 79 / 3.6;
/* Nose down a little, the trim that holds a gliding Timber level at that
 * speed: thrown level it balloons a metre up by the trunk. */
const UNDER_PITCH = Number(process.env.UNDER_PITCH ?? -2);
const BARK_CLEAR = 0.5;
const LEAF_CLEAR = 1.0;
/* The half span the tree is picked for, m: over a Timber's. */
const HALF_BOUND = 1.0;
/* Past the crown's edge by this, m, or this long on the plant's clock. */
const UNDER_PAST = 3;
const UNDER_S = 4;
/* The throws into a crown, scripts/tree-check.js's. */
const CROWN_THROWS = [
  { id: 'middle', off: 0, h: 0.5, v: 13 },
  { id: 'side', off: 0.8, h: 0.5, v: 18 },
  { id: 'low', off: 0.3, h: 0.12, v: 15 },
  { id: 'far side', off: -0.9, h: 0.35, v: 22 },
  { id: 'top', off: 0.2, h: 0.92, v: 20 },
  { id: 'under rim', off: 0.7, h: 0.08, v: 12 },
];
/* Held: at rest this far over the ground, m, under REST_V for REST_POLLS
 * polls 100 ms apart. */
const HELD_CLEAR = 1.0;
const REST_V = 0.2;
const REST_POLLS = 5;
const REST_LIMIT_MS = 12000;
/* Section 13 and 9. */
const SLICE_MS = 2;
const NEAR_MAX = 4000;
const STREAM_MAX = 25000;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const settings = {
  ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'timber1500'),
  airframeAsked: true,
  map: 'itaipu',
  graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
  graphicsAuto: false,
  crashDamage: true,
  sound: false,
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

/* Installed once in the page: the planting, each tree's drawn clumps in
 * the world, and the drawn craft's points. */
const HELPERS = `(async () => {
  const P = await import('/src/maps/itaipu/vegetation/plant.js');
  const sp = await import('/src/maps/swiss2/vegetation/species.js');
  const THREE = window.__three;
  const veg = window.__mapScene().userData.itaipu.parts.vegetation;
  const f = veg.forest;
  const model = P.KINDS.map((v) => sp.crownClumps(v).clumps);
  /* Tree t's drawn clumps, where the drawing puts them (draw.js put). */
  const clumps = (t) => {
    const S = f.s[t];
    const c = P.YAW_COS[f.yaw[t]] * S;
    const sn = P.YAW_SIN[f.yaw[t]] * S;
    return model[f.k[t]].map((q) => ({
      x: f.x[t] + c * q.c.x + sn * q.c.z,
      y: f.y[t] - 0.2 + S * q.c.y,
      z: f.z[t] - sn * q.c.x + c * q.c.z,
      r: q.rc * S * sp.CLUMP_REACH,
    }));
  };
  const craftPoints = () => {
    const obj = window.__mapScene().getObjectByName(window.__craft().drawn);
    const s = window.__craftState();
    if (!obj) {
      return [[s.worldX, s.worldY, s.worldZ]];
    }
    obj.updateMatrixWorld(true);
    const out = [];
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry.attributes.position) {
        return;
      }
      const p = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 60));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        out.push([v.x, v.y, v.z]);
      }
    });
    return out;
  };
  /* Half the drawn craft's width across (lx, lz), m. */
  const halfSpan = (lx, lz) => {
    const s = window.__craftState();
    let w = 0;
    for (const p of craftPoints()) {
      w = Math.max(w, Math.abs((p[0] - s.worldX) * lx + (p[2] - s.worldZ) * lz));
    }
    return w;
  };
  /* The trees within r of (x, z). */
  const around = (x, z, r) => {
    const { n, cell, start, items } = f.grid;
    const out = [];
    const i0 = Math.max(0, Math.floor((x - r + P.HALF) / cell));
    const i1 = Math.min(n - 1, Math.floor((x + r + P.HALF) / cell));
    const j0 = Math.max(0, Math.floor((z - r + P.HALF) / cell));
    const j1 = Math.min(n - 1, Math.floor((z + r + P.HALF) / cell));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        for (let q = start[j * n + i]; q < start[j * n + i + 1]; q += 1) {
          const t = items[q];
          if (Math.hypot(f.x[t] - x, f.z[t] - z) <= r) {
            out.push(t);
          }
        }
      }
    }
    return out;
  };
  /* The nearest drawn clump to any point of the craft, over its reach. */
  const inClump = (t) => {
    let best = Infinity;
    for (const c of clumps(t)) {
      for (const p of craftPoints()) {
        best = Math.min(best, Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) / c.r);
      }
    }
    return best;
  };
  window.__vegCheck = { P, f, veg, clumps, craftPoints, halfSpan, around, inClump };
  return 'ok';
})()`;

/* A lone tree to fly under: alone (no tree within 20 m), in no forest
 * (the canopy call answers -Infinity for 40 m round), on ground flat to
 * half a metre 40 m round, with a heading whose path beside the trunk
 * has its lowest drawn leaf at least UNDER_AGL + LEAF_CLEAR over the
 * ground, for a craft `half` metres either side of its path. Nearest the
 * spawn first, or tree `only`. Returns the tree, its heading and its
 * path. */
const PICK = (half, only = -1) => `JSON.stringify((() => {
  const { P, f, veg, clumps, around } = window.__vegCheck;
  const sp = window.__map().spawn;
  const ground = (x, z) => window.__heightAt(x, z);
  const lone = [];
  for (let t = 0; t < f.count; t += 1) {
    if (f.k[t] === P.K_LONE && (${only} < 0 || t === ${only})) {
      lone.push(t);
    }
  }
  lone.sort((a, b) => Math.hypot(f.x[a] - sp.x, f.z[a] - sp.z) - Math.hypot(f.x[b] - sp.x, f.z[b] - sp.z));
  const crown = veg.crowns;
  for (const t of lone) {
    const x = f.x[t];
    const z = f.z[t];
    if (around(x, z, 20).length > 1) {
      continue;
    }
    let ok = true;
    const g0 = ground(x, z);
    for (let k = 0; k < 16 && ok; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [10, 25, 40]) {
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (veg.canopyAt(px, pz) > -Infinity || Math.abs(ground(px, pz) - g0) > 0.5) {
          ok = false;
        }
      }
    }
    if (!ok) {
      continue;
    }
    const cs = clumps(t);
    const reach = Math.max(...cs.map((c) => Math.hypot(c.x - x, c.z - z) + c.r));
    const bark = crown[f.k[t]].trunkR * f.s[t];
    const off = bark + ${half} + ${BARK_CLEAR};
    let best = null;
    for (let h = 0; h < 24; h += 1) {
      const a = (h / 24) * Math.PI * 2;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const lx = uz;
      const lz = -ux;
      let leaf = Infinity;
      let over = 0;
      for (const c of cs) {
        const across = Math.abs((c.x - x) * lx + (c.z - z) * lz - off);
        if (across < c.r + ${half}) {
          const d = Math.max(0, across - ${half});
          leaf = Math.min(leaf, c.y - Math.sqrt(c.r * c.r - d * d));
          over += 1;
        }
      }
      if (over > 0 && (!best || leaf > best.leaf)) {
        best = { ux, uz, lx, lz, leaf, over };
      }
    }
    if (best && best.leaf - g0 >= ${UNDER_AGL + LEAF_CLEAR}) {
      return { t, x, z, y: g0, reach, bark, off, lowest: Math.min(...cs.map((c) => c.y - c.r)) - g0, height: f.s[t] * P.KINDS[f.k[t]].h, ...best, leafAgl: best.leaf - g0 };
    }
  }
  return null;
})())`;

/* The touches of a tree in what the page logged since the throw: the
 * plant's events on foliage or wood or into a crown, and the shell's and
 * the plant's contacts with a trunk or a crown. */
const TOUCHES = `JSON.stringify((() => {
  const woody = (k) => k === 'tree' || k === 'canopy';
  const c = window.__contacts();
  return {
    tree: window.__crashLog().filter((e) => e.type === 'tree' || e.surface === 'foliage' || e.surface === 'wood').map((e) => ({ t: e.t, what: e.type + ' ' + e.part + ' on ' + e.surface }))
      .concat(c.log.filter((e) => woody(e.kind)).map((e) => ({ t: e.t, what: 'shell contact ' + e.kind })))
      .concat(c.obstacle.filter((e) => woody(e.kind)).map((e) => ({ t: e.t, what: 'plant contact ' + e.kind }))),
    other: [...new Set(window.__crashLog().map((e) => e.type + ' on ' + e.surface).concat(c.log.map((e) => 'shell ' + e.kind), c.obstacle.map((e) => 'plant ' + e.kind)))].join(', '),
  };
})())`;

/* The refill's own numbers, read without window.__map(), whose whole
 * stats allocate enough to set off a collection inside the slice being
 * timed. */
const STREAM = `JSON.stringify((() => {
  const it = window.__mapScene().userData.itaipu;
  const c = window.__colliders();
  return { s: it.stream, near: it.parts.vegetation.near, c: { streamed: c.streamed, streamGen: c.streamGen } };
})())`;

/* Park the camera over (x, z), `up` metres over the ground, and wait
 * until the streamed set has been refilled round it (the camera is the
 * focus while a capture places it) and no refill is in progress. The
 * move must be far enough to want a refill: one 2 km away first, with
 * `viaFar`, makes sure of it. Returns the stream's stats before the last
 * move and after its refill. */
async function settleAt(page, x, z, up = 60, viaFar = false) {
  if (viaFar) {
    const fx = x > 0 ? x - 2000 : x + 2000;
    await settleAt(page, fx, z, up);
  }
  const g = await page.evaluate(`window.__heightAt(${x}, ${z})`);
  const before = JSON.parse(await page.evaluate(STREAM));
  await page.evaluate(`window.__setCam(${x}, ${g + up}, ${z}, ${x + 40}, ${g}, ${z + 40}, 60)`);
  const t0 = Date.now();
  let st = before;
  while (Date.now() - t0 < 60000) {
    await page.sleep(100);
    st = JSON.parse(await page.evaluate(STREAM));
    const round = Math.hypot(st.near.x - x, st.near.z - z) < 1;
    if (round && st.s.refills > before.s.refills && st.near.colliders > 0) {
      return { before, after: st };
    }
  }
  throw new Error(`the streamed set did not refill round ${x.toFixed(0)}, ${z.toFixed(0)} in 60 s: ${JSON.stringify(st.near)}`);
}

async function shot(page, name) {
  if (!shotsDir) {
    return;
  }
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(shotsDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function main() {
  if (shotsDir) {
    await mkdir(resolve(shotsDir), { recursive: true });
  }
  const page = await openPage({
    root, width: 960, height: 540, url: '/index.html?map=itaipu', seed,
  });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
    await page.sleep(1000);
    await page.evaluate(HELPERS, 60000);
    await page.evaluate("(() => { const n = document.getElementById('ui'); if (n) { n.style.display = 'none'; } return 1; })()");

    /* The tree, picked for a craft of a metre either side, which the
     * Timber is inside (measured below). */
    const guess = JSON.parse(await page.evaluate(PICK(HALF_BOUND), 120000));
    if (!guess) {
      throw new Error('no lone tree with room under its crown found in the hero');
    }

    /* The set round the tree before the first throw, which is the one
     * that declares the crash world, and the camera left there, so no
     * refill moves the trees' indices under the plant while it flies at
     * them (src/main.js declareCrashWorld collects the trees once a map). */
    await settleAt(page, guess.x, guess.z, 60, true);

    /* The craft's half span, level, measured on the drawn Timber held
     * 30 m over the tree's ground. */
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, hold: true, x: guess.x - guess.ux * 40, y: guess.y + 30, z: guess.z - guess.uz * 40, yaw: 90 })})`);
    await page.sleep(300);
    const half = await page.evaluate('window.__vegCheck.halfSpan(0, 1)');
    if (!(half <= HALF_BOUND)) {
      throw new Error(`the Timber's half span is ${half} m, over the ${HALF_BOUND} m its tree was picked for`);
    }
    const tree = JSON.parse(await page.evaluate(PICK(half, guess.t), 120000));
    console.log(`tree ${tree.t} at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}: ${tree.height.toFixed(1)} m tall, lowest leaf ${tree.lowest.toFixed(2)} m up, `
      + `${tree.leafAgl.toFixed(2)} m over the path ${tree.off.toFixed(2)} m off the trunk (bark ${tree.bark.toFixed(2)}, half span ${half.toFixed(2)}), crown reach ${tree.reach.toFixed(1)} m`);
    await page.evaluate(`window.__setCam(${tree.x + tree.lx * 25 - tree.ux * 10}, ${tree.y + 7}, ${tree.z + tree.lz * 25 - tree.uz * 10}, ${tree.x}, ${tree.y + 4}, ${tree.z}, 60)`);
    await page.sleep(300);

    /* UNDER THE CROWN: from a few metres short of the crown, so what is
     * judged is the craft under it, not how far it drifted on the way. */
    const run = tree.reach + 6;
    const yaw = (Math.atan2(-tree.ux, -tree.uz) * 180) / Math.PI;
    const y = tree.y + UNDER_AGL;
    await page.evaluate(`window.__crashThrow(${JSON.stringify({
      fresh: true,
      x: tree.x + tree.lx * tree.off - tree.ux * run,
      y,
      z: tree.z + tree.lz * tree.off - tree.uz * run,
      yaw,
      pitch: UNDER_PITCH,
      vx: tree.ux * UNDER_V,
      vy: 0,
      vz: tree.uz * UNDER_V,
    })})`);
    const sim0 = await page.evaluate('window.__crash().simT');
    let simT = sim0;
    let past = false;
    let inTree = false;
    let low = Infinity;
    let top = -Infinity;
    let rise = -Infinity;
    const t0 = Date.now();
    while (simT - sim0 < UNDER_S && Date.now() - t0 < 90000 && !past) {
      await page.sleep(30);
      const st = JSON.parse(await page.evaluate('JSON.stringify({ s: window.__craftState(), f: window.__crash().flagNames, t: window.__crash().simT, top: Math.max(...window.__vegCheck.craftPoints().map((p) => p[1])) })'));
      simT = st.t;
      if (!inTree && st.f.includes('inTree')) {
        inTree = st.t;
      }
      const along = (st.s.worldX - tree.x) * tree.ux + (st.s.worldZ - tree.z) * tree.uz;
      /* The drawn craft, while it is under the crown's extent, once a
       * frame has drawn it where the throw put it. */
      if (st.t - sim0 > 0.05 && Math.abs(along) <= tree.reach) {
        low = Math.min(low, st.s.worldY - tree.y);
        top = Math.max(top, st.top);
        rise = Math.max(rise, st.top - st.s.worldY);
      }
      past = along > tree.reach + UNDER_PAST;
    }
    const touch = JSON.parse(await page.evaluate(TOUCHES));
    if (inTree) {
      touch.tree.push({ t: inTree, what: 'inTree flag' });
    }
    const under = top < tree.leaf;
    check('a Timber at 4.6 m under a near crown passes untouched',
      past && under && touch.tree.length === 0,
      `${UNDER_V.toFixed(1)} m/s at ${UNDER_AGL} m over the grass, ${tree.off.toFixed(2)} m off the trunk: ${past ? 'got past' : 'DID NOT GET PAST'} the crown; under it `
      + `${low.toFixed(2)} m over the ground at its lowest and its top (${rise.toFixed(2)} m over its centre) ${(tree.leaf - top).toFixed(2)} m under the lowest leaf over it${under ? '' : ' (CLIMBED INTO THE LEAVES)'}; `
      + `${touch.tree.length ? `TOUCHED ${touch.tree.map((e) => e.what).join('; ')}` : 'touched nothing of the tree'}${touch.other ? ` [${touch.other}]` : ''}`);

    /* INTO THE CROWN: scripts/tree-check.js's throws, across the crown's
     * width (off, of its reach, + to the approach's left) and up its
     * height (h, 0 its lowest leaf, 1 its highest), from both sides. */
    const cs = JSON.parse(await page.evaluate(`JSON.stringify(window.__vegCheck.clumps(${tree.t}))`));
    const lo = Math.min(...cs.map((c) => c.y - c.r));
    const hi = Math.max(...cs.map((c) => c.y + c.r));
    const rows = [];
    for (const side of [1, -1]) {
      const ux = tree.ux * side;
      const uz = tree.uz * side;
      const lx = uz;
      const lz = -ux;
      for (const pass of CROWN_THROWS) {
        const ty = lo + pass.h * (hi - lo);
        const tx = tree.x + lx * pass.off * tree.reach;
        const tz = tree.z + lz * pass.off * tree.reach;
        await page.evaluate(`window.__crashThrow(${JSON.stringify({
          fresh: true,
          x: tx - ux * (tree.reach + 8),
          y: ty,
          z: tz - uz * (tree.reach + 8),
          yaw: (Math.atan2(-ux, -uz) * 180) / Math.PI,
          pitch: -3,
          vx: ux * pass.v,
          vy: -0.5,
          vz: uz * pass.v,
        })})`);
        const w0 = Date.now();
        let still = 0;
        while (Date.now() - w0 < REST_LIMIT_MS && still < REST_POLLS) {
          await page.sleep(100);
          const sv = await page.evaluate('window.__craftState().speed');
          still = sv < REST_V ? still + 1 : 0;
        }
        const s = JSON.parse(await page.evaluate('JSON.stringify(window.__craftState())'));
        const flags = await page.evaluate('window.__crash().flagNames.join(",")');
        const clump = await page.evaluate(`window.__vegCheck.inClump(${tree.t})`);
        const events = await page.evaluate("[...new Set(window.__crashLog().map((e) => e.type + ' ' + e.part + ' on ' + e.surface))].slice(0, 4).join('; ')");
        const row = {
          id: `${pass.id}, side ${side}`, v: pass.v, rest: still >= REST_POLLS, clear: s.groundClearance, flags, clump,
        };
        row.held = row.rest && row.clear > HELD_CLEAR && flags.split(',').includes('inTree');
        rows.push(row);
        console.log(`into the crown, ${row.id}, ${pass.v} m/s at y ${ty.toFixed(1)}: ${row.rest ? 'at rest' : 'moving'} at ${s.worldX.toFixed(1)}, ${s.worldY.toFixed(1)}, ${s.worldZ.toFixed(1)}, `
          + `${row.clear.toFixed(2)} m up, nearest drawn clump ${clump.toFixed(2)} of its reach, ${row.held ? 'HELD' : 'not held'} {${events}}`);
        if (row.held) {
          await page.evaluate(`window.__setCam(${s.worldX + lx * 9 - ux * 4}, ${s.worldY + 2.5}, ${s.worldZ + lz * 9 - uz * 4}, ${s.worldX}, ${s.worldY}, ${s.worldZ}, 55)`);
          await page.sleep(700);
          await shot(page, `crown-held-${pass.id.replace(/ /g, '')}-${side > 0 ? 'a' : 'b'}`);
        }
      }
    }
    const held = rows.filter((r) => r.held);
    check('one thrown into the crown is held, inside a drawn clump',
      held.length > 0 && held.every((r) => r.clump < 1),
      `${held.length} of ${rows.length} held; nearest drawn clump of each held craft ${held.map((r) => r.clump.toFixed(2)).join(', ') || '-'} of its reach`);

    /* THE FOREST VOLUME, where the set holds no tree: the closed forest
     * point with the tallest canopy at least 900 m from where the set is,
     * a Timber 3 m under its top and one 2 m over it, climbing. */
    const dense = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const { veg } = window.__vegCheck;
      const at = window.__map().parts.vegetation.near;
      let best = null;
      for (let z = -5000; z <= 5000; z += 50) {
        for (let x = -5000; x <= 5000; x += 50) {
          if (Math.hypot(x - at.x, z - at.z) < 900) {
            continue;
          }
          const top = veg.canopyAt(x, z);
          const g = window.__heightAt(x, z);
          if (top - g >= 8 && (!best || Math.hypot(x - at.x, z - at.z) < best.d)) {
            best = { x, z, top, g, d: Math.hypot(x - at.x, z - at.z) };
          }
        }
      }
      return best;
    })())`, 120000));
    const volumeThrow = async (yy, vy, throttle, seconds) => {
      await page.evaluate(`window.__stick(0, 0, 0, ${throttle})`);
      await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: dense.x, y: yy, z: dense.z, yaw: 0, vy, vz: -6 })})`);
      const s0 = await page.evaluate('window.__crash().simT');
      let t = s0;
      let volume = false;
      let lowest = Infinity;
      const w0 = Date.now();
      while (t - s0 < seconds && Date.now() - w0 < 60000) {
        await page.sleep(25);
        const st = JSON.parse(await page.evaluate('JSON.stringify({ t: window.__crash().simT, k: window.__craftState().lastHitKind, i: window.__craftState().lastHitIndex, y: window.__craftState().worldY })'));
        t = st.t;
        volume = volume || (st.k === 'canopy' && st.i === -1);
        lowest = Math.min(lowest, st.y);
      }
      await page.evaluate('window.__stick(0, 0, 0, 0)');
      return { volume, lowest, simS: t - s0 };
    };
    const inside = await volumeThrow(dense.top - 3, 0, 0, 0.5);
    check('a craft below the canopy top in dense forest gets a canopy contact through the hook',
      inside.volume,
      `at ${dense.x}, ${dense.z}, ${dense.d.toFixed(0)} m from the near set, canopy top ${dense.top.toFixed(1)} (${(dense.top - dense.g).toFixed(1)} m over the ground), `
      + `thrown 3 m under it: ${inside.volume ? 'canopy contact from the volume' : 'NO canopy contact from the volume'} over ${inside.simS.toFixed(2)} s`);
    const over = await volumeThrow(dense.top + 2, 4, 1, 0.6);
    check('and one 2 m over it, climbing, gets none',
      !over.volume && over.lowest > dense.top,
      `lowest ${(over.lowest - dense.top).toFixed(2)} m over the top, ${over.volume ? 'A CANOPY CONTACT' : 'no canopy contact'} over ${over.simS.toFixed(2)} s`);

    /* THE REFILL: 450 m on from the tree, and then the densest point of
     * the hero. */
    const moves = [];
    const away = await page.evaluate(`JSON.stringify((() => {
      for (let k = 0; k < 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        const x = ${tree.x} + Math.cos(a) * 450;
        const z = ${tree.z} + Math.sin(a) * 450;
        if (Math.abs(x) < 4800 && Math.abs(z) < 4800) {
          return { x, z };
        }
      }
      return null;
    })())`);
    moves.push(['450 m on', JSON.parse(away)]);
    moves.push(['the densest point', JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const { P, f } = window.__vegCheck;
      let best = null;
      for (let z = -4900; z <= 4900; z += 200) {
        for (let x = -4900; x <= 4900; x += 200) {
          const got = P.nearTrees(f, x, z);
          const key = got.trees.length / Math.max(1, got.reach * got.reach);
          if (!best || key > best.key) {
            best = { x, z, key };
          }
        }
      }
      return best;
    })())`, 120000))]);
    for (const [name, at] of moves) {
      const { before, after } = await settleAt(page, at.x, at.z, 200);
      const slices = after.s.lastSlicesMs;
      const maxMs = Math.max(...slices);
      check(`moving to ${name} refills the near trees in slices under ${SLICE_MS} ms`,
        after.s.refills > before.s.refills && maxMs < SLICE_MS,
        `${at.x.toFixed(0)}, ${at.z.toFixed(0)}: ${slices.length} slices in ${after.s.frames} frames, the longest ${maxMs.toFixed(2)} ms (${slices.join(', ')})`);
      check(`at ${name}, at most ${NEAR_MAX} near trees and the streamed set under ${STREAM_MAX}`,
        after.near.trees <= NEAR_MAX && after.c.streamed < STREAM_MAX && after.c.streamed >= after.near.colliders,
        `${after.near.trees} trees whole to ${after.near.reach.toFixed(0)} m, ${after.c.streamed} streamed colliders (the part's ${after.near.colliders}), streamGen ${after.c.streamGen}`);
    }

    const errors = (page.errors || []).filter((e) => !/favicon/.test(e));
    check('with no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`${checks.length - failed} of ${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

await main();
