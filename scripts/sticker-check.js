/*
 * sticker-check.js: the paint shop's decals lie on the skin they were
 * placed on, in the hangar's model and in the flying one.
 *
 *   node scripts/sticker-check.js [--shots DIR]
 *
 * For the Skyhunter, the Timber, the Cub, the Striker and the 7 inch: a stripe on the wing's top
 * skin, a roundel under the wing and a number on the fuselage's left side,
 * each placed where a ray from off the model meets the skin (the hangar's
 * pick, src/render/carousel3d.js), and the two wing ones again at 400 mm,
 * a size the paint shop allows. Then:
 *
 *   1. On each model as the hangar builds it and as the flight builds it
 *      (src/render/craft.js: worldScale and the measurement box), every
 *      decal triangle sits on skin that is drawn and has none over it
 *      (offSkin below).
 *   2. The same liveries stored the way the paint shop stores them,
 *      flown on swiss2: the flying model's decals are the flight build's
 *      of step 1, triangle for triangle, every one on skin drawn in the
 *      scene, and none reaches below the lowest skin drawn.
 *
 * With --shots, the flying models are photographed from behind and above
 * at 4, 12 and 20 m into DIR.
 *
 * Headless Chromium through tests/lib/page.js. Exits 1 on any failure.
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
import { mkdir, writeFile } from 'node:fs/promises';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shotsAt = process.argv.indexOf('--shots');
const shotDir = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
const IDS = ['sky1800', 'timber1500', 'cub1400', 'striker2500', '7inch'];
/* The larger size of the two wing decals, metres. */
const BIG = 0.4;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const settings = {
  ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, IDS[0]),
  airframeAsked: true,
  map: 'swiss2',
  freestyleMap: 'swiss2',
  graphics: 'high',
  graphicsAuto: false,
  flightMode: 'angle',
  fpsCap: 0,
  crashDamage: false,
  wingView: 'chase',
  sound: false,
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.stickerCheckSeeded) {
    Object.assign(s, ${JSON.stringify(settings)}, { stickerCheckSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

/*
 * The test, as page source. `offSkin(group, dir)` walks every decal
 * triangle of a model and counts two failures: OFF, its middle is further
 * than DECAL_LIFT plus a millimetre from the nearest skin drawn, so it
 * hangs in the air; and UNDER, skin drawn lies over it within 20 mm out
 * along `dir`, the one decal's normal in the world frame, so it is printed
 * on a face buried inside the airframe. UNDER is only asked of one decal
 * copy at a time, whose direction is known. With the lowest point of the
 * decals and of the skin. Written without src/render/decals.js's own list of targets, which is the
 * thing under test: skin here is any mesh under the group with nothing
 * hidden on the way up to it, that is not a decal and not an ink hull
 * (drawn inside out, and scaled up round the mesh's origin, so it stands
 * off the skin by design). The group itself may be hidden: a quad's pilot
 * looks through its camera, so the shell hides the flown model whole, and
 * that hides its stickers with its skin, never one from the other.
 */
const HELPERS = `
  const THREE = await import('three');
  const { DECAL_LIFT } = await import('/src/render/decals.js');
  const ON = DECAL_LIFT + 0.001;
  const OVER = 0.02;
  const shownIn = (o, top) => { for (let p = o; p && p !== top; p = p.parent) { if (!p.visible) return false; } return true; };
  /* A spinning part, a blade or a prop disc, is not skin: a blade that
   * stopped over the fuselage does not hide what is painted under it. */
  const spinning = (o, spins) => { for (let p = o; p; p = p.parent) { if (spins.has(p)) return true; } return false; };
  const skinOf = (group, spins = new Set()) => {
    const out = [];
    group.traverse((o) => {
      const mats = o.isMesh ? [].concat(o.material) : [];
      if (o.isMesh && !o.userData.decal && o.name !== 'paint-decals' && mats.every((m) => m.side !== THREE.BackSide) && shownIn(o, group) && !spinning(o, spins)) out.push(o);
    });
    return out;
  };
  /* The skin's triangles in the world frame, hashed by CELL metre cubes
   * over their bounds grown by ON, for the nearest skin to a point. */
  const CELL = 0.02;
  const hashOf = (skin) => {
    const cells = new Map();
    for (const m of skin) {
      const p = m.geometry.attributes.position;
      const idx = m.geometry.index;
      const cnt = idx ? idx.count : p.count;
      for (let t = 0; t + 2 < cnt; t += 3) {
        const tri = new THREE.Triangle();
        tri.a.fromBufferAttribute(p, idx ? idx.getX(t) : t).applyMatrix4(m.matrixWorld);
        tri.b.fromBufferAttribute(p, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(m.matrixWorld);
        tri.c.fromBufferAttribute(p, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(m.matrixWorld);
        const lo = tri.a.clone().min(tri.b).min(tri.c).subScalar(ON).divideScalar(CELL).floor();
        const hi = tri.a.clone().max(tri.b).max(tri.c).addScalar(ON).divideScalar(CELL).floor();
        for (let x = lo.x; x <= hi.x; x += 1) for (let y = lo.y; y <= hi.y; y += 1) for (let z = lo.z; z <= hi.z; z += 1) {
          const k = x + ',' + y + ',' + z;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(tri);
        }
      }
    }
    return cells;
  };
  const cp = new THREE.Vector3();
  const nearest = (cells, v) => {
    let best = Infinity;
    for (const tri of cells.get(Math.floor(v.x / CELL) + ',' + Math.floor(v.y / CELL) + ',' + Math.floor(v.z / CELL)) || []) {
      best = Math.min(best, tri.closestPointToPoint(v, cp).distanceTo(v));
    }
    return best;
  };
  const offSkin = (group, dir = null, spins = new Set()) => {
    group.updateMatrixWorld(true);
    const skin = skinOf(group, spins);
    const cells = hashOf(skin);
    const ray = new THREE.Raycaster();
    ray.layers.enableAll();
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    const n = new THREE.Vector3(); const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3();
    let triangles = 0; let off = 0; let under = 0; let worst = 0; let decalLow = Infinity;
    const where = [];
    const note = (what, mid, extra) => { if (where.length < 3) where.push([what, ...mid.toArray().map((v) => +v.toFixed(3)), extra]); };
    group.traverse((o) => {
      if (o.name !== 'paint-decals') return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, i + 2).applyMatrix4(o.matrixWorld);
        decalLow = Math.min(decalLow, a.y, b.y, c.y);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        /* Slivers the clipping leaves, under a square millimetre, carry
         * no picture and no reliable normal. */
        if (n.length() < 2e-6) continue;
        n.normalize();
        triangles += 1;
        const mid = a.clone().add(b).add(c).divideScalar(3);
        const gap = nearest(cells, mid);
        if (gap > ON) {
          off += 1;
          worst = Math.max(worst, gap);
          note('off', mid, Number.isFinite(gap) ? +gap.toFixed(4) : 'no skin within 20 mm');
          continue;
        }
        if (!dir) {
          continue;
        }
        ray.set(mid.clone().addScaledVector(dir, 1e-4), dir);
        ray.far = OVER;
        const over = ray.intersectObjects(skin, false)[0];
        if (over) {
          under += 1;
          note('under', mid, [over.object.name, +over.distance.toFixed(4)]);
        }
      }
    });
    let skinLow = Infinity;
    for (const s of skin) { skinLow = Math.min(skinLow, new THREE.Box3().setFromObject(s).min.y); }
    return { triangles, off, under, worst: Number.isFinite(worst) ? (worst * 1000).toFixed(1) + ' mm' : 'over 20 mm', where, decalLow: +decalLow.toFixed(4), skinLow: +skinLow.toFixed(4) };
  };
`;

const page = await openPage({ root, width: 1100, height: 880, seed });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);

  /* 1. The builders' models: the placements, and every decal on skin. */
  const built = await page.evaluate(`(async () => {
    ${HELPERS}
    const { craftBuilderFor } = await import('/src/render/craft.js');
    const { dressLivery } = await import('/src/render/livery.js');
    const { newDecal } = await import('/configs/paint.js');
    const { airframeById } = await import('/configs/airframes.js');
    const out = {};
    for (const id of ${JSON.stringify(IDS)}) {
      const hangar = craftBuilderFor(id)({ name: 'sticker-hangar', fog: false });
      hangar.group.updateMatrixWorld(true);
      const skin = skinOf(hangar.group);
      /* The first hit of a ray from off the model whose normal passes
       * want(n), as the hangar's pick gives it: the point and the outward
       * normal in the group's frame. */
      const pick = (origins, dir, want) => {
        const ray = new THREE.Raycaster();
        ray.layers.enableAll();
        for (const o of origins) {
          ray.set(new THREE.Vector3(...o), new THREE.Vector3(...dir));
          const h = ray.intersectObjects(skin, false)[0];
          if (!h) continue;
          const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
          if (n.dot(ray.ray.direction) > 0) n.negate();
          if (want(n)) return { p: h.point.toArray(), n: n.toArray() };
        }
        return null;
      };
      const half = airframeById(id).dims.bodyWidth / 2;
      const zs = [0, -0.03, 0.03, -0.06, 0.06, 0.09];
      const x = 0.35 * half;
      const top = pick(zs.map((z) => [x, 3, z]), [0, -1, 0], (n) => n.y > 0.8);
      const under = pick(zs.map((z) => [x, -3, z]), [0, 1, 0], (n) => n.y < -0.8);
      const sideAt = [];
      for (const y of [0, -0.02, 0.02, -0.04, 0.04]) for (const z of [-0.2, -0.1, 0, 0.1]) sideAt.push([-3, y, z]);
      const side = pick(sideAt, [1, 0, 0], (n) => n.x < -0.8);
      const at = { top, under, side };
      const missing = Object.keys(at).filter((k) => !at[k]);
      if (missing.length) { out[id] = { missing }; continue; }
      const decals = [
        newDecal('stripe', top.p, top.n, { c: '#1f4fd8', c2: '#0e1213' }),
        newDecal('roundel', under.p, under.n),
        newDecal('num', side.p, side.n),
        { ...newDecal('stripe', top.p, top.n, { c: '#e8c21f', c2: '#0e1213' }), s: ${BIG}, a: 3 },
        { ...newDecal('roundel', under.p, under.n), s: ${BIG} },
      ];
      /* Each decal and its mirror image as a decal of its own, so each
       * copy's direction is known to the UNDER test. */
      const copies = decals.flatMap((d) => [{ ...d, m: false }, { ...d, m: false, p: [-d.p[0], d.p[1], d.p[2]], n: [-d.n[0], d.n[1], d.n[2]] }]);
      const row = { decals, builds: {} };
      for (const [tag, opts] of [['hangar', { name: 'sticker-hangar', fog: false }], ['flight', { name: 'craft', fog: true, worldScale: true, measure: true }]]) {
        const craft = craftBuilderFor(id)(opts);
        const spins = new Set([...(craft.blades || []), ...(craft.discs || [])]);
        const sum = { triangles: 0, off: 0, under: 0, worst: 0, where: [] };
        for (const d of copies) {
          dressLivery(craft, id, { colours: {}, finishes: {}, decals: [d] });
          const r = offSkin(craft.group, new THREE.Vector3(...d.n).normalize(), spins);
          sum.triangles += r.triangles;
          sum.off += r.off;
          sum.under += r.under;
          sum.worst = r.worst === 'over 20 mm' || sum.worst === 'over 20 mm' ? 'over 20 mm' : Math.max(sum.worst, parseFloat(r.worst));
          sum.where.push(...r.where.slice(0, 3 - sum.where.length));
        }
        dressLivery(craft, id, { colours: {}, finishes: {}, decals });
        sum.whole = offSkin(craft.group).triangles;
        row.builds[tag] = sum;
      }
      out[id] = row;
    }
    return out;
  })()`);

  const liveries = {};
  for (const id of IDS) {
    const row = built[id];
    if (row.missing) {
      check(`${id}: the placements`, false, `no skin found for ${row.missing.join(', ')}`);
      continue;
    }
    liveries[id] = { decals: row.decals, triangles: row.builds.flight.whole };
    const at = (d) => `${d.p.map((v) => v.toFixed(3)).join(', ')} facing ${d.n.map((v) => v.toFixed(2)).join(', ')}`;
    console.log(`${id}: wing top at ${at(row.decals[0])}; under the wing at ${at(row.decals[1])}; fuselage side at ${at(row.decals[2])}`);
    for (const [tag, r] of Object.entries(row.builds)) {
      check(`${id}, the ${tag} model: every decal triangle on drawn skin`,
        r.triangles > 0 && r.off === 0 && r.under === 0,
        `${r.triangles} triangles, ${r.off} off the skin (worst ${typeof r.worst === 'number' ? `${r.worst} mm` : r.worst}), ${r.under} under other skin${r.where.length ? `, e.g. ${JSON.stringify(r.where)}` : ''}`);
    }
  }

  /* 2. Stored as the paint shop stores them, and flown. */
  await page.evaluate(`(() => {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.livery = { ...(s.livery || {}), ...${JSON.stringify(Object.fromEntries(Object.entries(liveries).map(([id, e]) => [id, { regions: {}, decals: e.decals }])))} };
    localStorage.setItem(k, JSON.stringify(s));
    return true;
  })()`);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  if (shotDir) {
    await mkdir(shotDir, { recursive: true });
  }
  for (const id of Object.keys(liveries)) {
    if (await page.evaluate(`window.__craft().run !== ${JSON.stringify(id)}`)) {
      await page.evaluate(`window.__ui.swapTo(${JSON.stringify(id)}).then(() => true)`);
      await page.until(`window.__craft().run === ${JSON.stringify(id)}`, 60000);
    }
    const n = liveries[id].decals.length;
    await page.until(`window.__craftPaint().id === ${JSON.stringify(id)} && window.__craftPaint().decals.decals === ${n}`, 60000).catch(() => {});
    const flown = await page.evaluate(`(async () => {
      ${HELPERS}
      let craft = null;
      window.__mapScene().traverse((o) => { if (o.name === 'craft' && o.userData.decalLayer) craft = o; });
      if (!craft) return null;
      return offSkin(craft);
    })()`);
    check(`${id}, flown: every decal triangle on drawn skin, and the decals are the ones tested above`,
      Boolean(flown) && flown.triangles > 0 && flown.off === 0 && flown.triangles === liveries[id].triangles,
      flown ? `${flown.triangles} triangles (the flight build above made ${liveries[id].triangles}), ${flown.off} off the skin (worst ${flown.worst})${flown.where.length ? `, e.g. ${JSON.stringify(flown.where)}` : ''}` : 'no flying model with decals in the scene');
    check(`${id}, flown: nothing hangs below the aircraft`,
      Boolean(flown) && flown.decalLow >= flown.skinLow - 0.001,
      flown ? `lowest decal point ${flown.decalLow} m, lowest skin ${flown.skinLow} m (world y)` : 'no flying model');
    if (!shotDir) {
      continue;
    }
    for (const d of [4, 12, 20]) {
      await page.evaluate(`(async () => {
        const THREE = await import('three');
        let craft = null;
        window.__mapScene().traverse((o) => { if (o.name === 'craft' && o.userData.decalLayer) craft = o; });
        craft.updateMatrixWorld(true);
        const p = new THREE.Vector3().setFromMatrixPosition(craft.matrixWorld);
        const eye = new THREE.Vector3(-0.25 * ${d}, 0.55 * ${d}, ${d}).applyMatrix4(craft.matrixWorld);
        window.__setCam(eye.x, eye.y, eye.z, p.x, p.y, p.z, 30);
        return true;
      })()`);
      await page.sleep(2500);
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      const path = join(shotDir, `${id}-${d}m.png`);
      await writeFile(path, Buffer.from(data, 'base64'));
      console.log(`  shot ${path}`);
    }
    await page.evaluate('window.__setCam(null); true');
  }

  const errors = page.errors.filter((e) => !e.startsWith('network:'));
  check('with no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await page.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
