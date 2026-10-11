/*
 * kits-planes-check.js: the planes' and the Striker's visual part kits in
 * the real shell (docs/KITS.md section 8, PR 6). Every option of every
 * slot of every drawn plane family is built in the page, held to the
 * stock machine's box plus 1 cm (the referee meets configs/hulls.js, made
 * from stock) and to being drawn differently from stock; a float variant
 * wears its plane's kit, so it is built too. Then each option is drawn on
 * its own in a small studio, two views a picture, and each family is
 * opened in the hangar wearing a kit from a seeded settings blob.
 *
 * usage: node scripts/kits-planes-check.js [outdir]
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { DRAWN, slotsFor } from '../configs/kits.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'kits-planes-check'));
await mkdir(outDir, { recursive: true });

let failed = 0;
let passed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const QUADS = new Set(['7inch', '10inch', 'interceptor']);
const FAMILIES = [...DRAWN].filter((id) => !QUADS.has(id));
/* The float variants wear their plane's entry (configs/liveries.js
 * liveryKey), so they are built with its kit as well; on floats there are
 * no wheels, so a wheels option must draw the float plane exactly stock. */
const VARIANTS = { cub1400: ['cub1400f'], timber1500: ['timber1500f'] };
const ON_FLOATS = new Set(Object.values(VARIANTS).flat());
/* The seeded kit: each slot's first option, so the hangar shows one of
 * each slot at once; the studio pictures every option. */
const WORN = Object.fromEntries(FAMILIES.map((id) => [id, Object.fromEntries(slotsFor(id).map((s) => [s.id, s.options[1]]))]));

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: 'low',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
    livery: ${JSON.stringify(Object.fromEntries(FAMILIES.map((id) => [id, { kit: { v: 1, parts: WORN[id] } }])))},
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

/*
 * Box and signature of what is SEEN: hidden things (a launcher before
 * launch) are left out, so a kit part cannot hide inside a rail's box.
 * The signature takes positions and each mesh's colour, since a tint
 * moves no vertex.
 */
const SHAPE = `const shape = (THREE, g) => {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const pts = [];
  const v = new THREE.Vector3();
  g.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) { return; }
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 1) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
      if (i % 7 === 0) { pts.push(v.x.toFixed(5), v.y.toFixed(5), v.z.toFixed(5)); }
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    pts.push(mats.map((m) => (m.color ? m.color.getHexString() : '-') + (m.emissive ? m.emissive.getHexString() : '')).join('/'));
  });
  return { box, sig: pts.join(',') };
};`;

async function boxes(page) {
  console.log('1. every option drawn differently and inside the stock box (+1 cm)');
  const plan = FAMILIES.flatMap((id) => [id, ...(VARIANTS[id] ?? [])].map((build) => ({ id, build, slots: slotsFor(id), floats: ON_FLOATS.has(build) })));
  const got = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { craftBuilderFor } = await import('./src/render/craft.js');
    ${SHAPE}
    const out = [];
    for (const { id, build, slots, floats } of ${JSON.stringify(plan)}) {
      const make = (kit) => shape(THREE, craftBuilderFor(build)({ fog: false, kit }).group);
      const stock = make(undefined);
      const allStock = make(Object.fromEntries(slots.map((s) => [s.id, 'stock'])));
      out.push({ id, build, slot: 'all', option: 'stock', past: 0, drawn: allStock.sig !== stock.sig, stockCheck: true });
      for (const s of slots) {
        for (const option of s.options.slice(1)) {
          const { box: b, sig } = make({ [s.id]: option });
          const past = Math.max(...['x', 'y', 'z'].flatMap((a) => [stock.box.min[a] - b.min[a], b.max[a] - stock.box.max[a]]));
          out.push({ id, build, slot: s.id, option, past, drawn: sig !== stock.sig, inert: floats && s.id === 'wheels' });
        }
      }
    }
    return out;
  })()`);
  for (const r of got) {
    if (r.inert) {
      say(!r.drawn && r.past <= 0, `${r.build} ${r.slot} ${r.option}: on floats, draws exactly stock`);
    } else if (r.stockCheck) {
      say(!r.drawn, `${r.build}: every slot set to stock draws exactly the stock model`);
    } else {
      say(r.past <= 0.01 && r.drawn, `${r.build} ${r.slot} ${r.option}: drawn differently ${r.drawn}, ${(Math.max(0, r.past) * 1000).toFixed(1)} mm past the stock box`);
    }
  }
}

/* Each option alone on the model in a studio of its own (no map, no
 * hangar), so every option is seen and not only the seeded ones: a three
 * quarter view from above, a side view, and a close up on whatever the
 * option changed (the vertices stock does not have, or the meshes whose
 * colour moved). */
async function studio(page) {
  console.log('2. every option drawn in the studio');
  const plan = FAMILIES.map((id) => ({ id, slots: slotsFor(id) }));
  const got = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { craftBuilderFor } = await import('./src/render/craft.js');
    const canvas = document.createElement('canvas');
    const W = 1500;
    const H = 420;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false);
    renderer.setScissorTest(true);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fa3b4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6470, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, -3);
    scene.add(sun);
    const meshes = (g) => {
      const list = [];
      g.updateMatrixWorld(true);
      g.traverseVisible((o) => { if (o.isMesh && o.geometry.attributes.position) { list.push(o); } });
      return list;
    };
    const points = (list) => {
      const keys = new Set();
      const v = new THREE.Vector3();
      for (const o of list) {
        const a = o.geometry.attributes.position;
        for (let i = 0; i < a.count; i += 1) {
          v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
          keys.add(v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4));
        }
      }
      return keys;
    };
    const out = [];
    for (const { id, slots } of ${JSON.stringify(plan)}) {
      const stockMeshes = meshes(craftBuilderFor(id)({ fog: false }).group);
      const stockKeys = points(stockMeshes);
      const stockColours = new Set(stockMeshes.map((o) => o.material.color && o.material.color.getHexString()));
      for (const s of slots) {
        /* Stock last, close up on where its options changed things. */
        const slotFocus = new THREE.Box3();
        for (const option of [...s.options.slice(1), 'stock']) {
          const g = craftBuilderFor(id)({ fog: false, kit: { [s.id]: option } }).group;
          scene.add(g);
          const list = meshes(g);
          const box = new THREE.Box3();
          const diff = new THREE.Box3();
          const v = new THREE.Vector3();
          for (const o of list) {
            box.expandByObject(o);
            const a = o.geometry.attributes.position;
            const recoloured = o.material.color && !stockColours.has(o.material.color.getHexString());
            for (let i = 0; i < a.count; i += 1) {
              v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
              if (recoloured || !stockKeys.has(v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4))) {
                diff.expandByPoint(v);
              }
            }
          }
          slotFocus.union(diff);
          const focus = option === 'stock' ? slotFocus : diff;
          const views = [
            { at: box, d: [-1.1, 0.9, -1.3], fit: 1 },
            { at: box, d: [-1, 0.05, 0], fit: 1 },
            { at: focus, d: [-1.0, 0.7, -0.8], fit: 1.6 },
          ];
          views.forEach((view, i) => {
            const c = view.at.getCenter(new THREE.Vector3());
            const r = Math.max(0.06, view.at.getSize(new THREE.Vector3()).length() / 2) * view.fit;
            const cam = new THREE.PerspectiveCamera(30, (W / 3) / H, r / 50, r * 40);
            cam.position.copy(c).addScaledVector(new THREE.Vector3(...view.d).normalize(), r / Math.sin((15 * Math.PI) / 180));
            cam.lookAt(c);
            renderer.setViewport(i * W / 3, 0, W / 3, H);
            renderer.setScissor(i * W / 3, 0, W / 3, H);
            renderer.render(scene, cam);
          });
          out.push({ name: id + '-' + s.id + '-' + option, url: canvas.toDataURL('image/png') });
          scene.remove(g);
        }
      }
    }
    renderer.dispose();
    return out;
  })()`);
  for (const { name, url } of got) {
    await writeFile(join(outDir, 'studio', `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  say(got.length > 0, `${got.length} studio pictures in ${join(outDir, 'studio')}`);
}

async function pictures(page) {
  console.log('3. each family in the hangar wearing its kit');
  for (const id of FAMILIES) {
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
    await page.tap('KeyC');
    await page.until(`window.__ui.hangar.isOpen && window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
    await page.until('Boolean(window.__carouselStats().camera)', 120000);
    await page.sleep(1500);
    const kit = await page.evaluate(`JSON.stringify((window.__ui.settings.livery[${JSON.stringify(id)}] || {}).kit || null)`);
    say(kit === JSON.stringify({ v: 1, parts: WORN[id] }), `${id}: the seeded kit loaded: ${kit}`);
    /* The Kit tab offers every option of every slot, stock included. */
    await page.click('.hangar [data-key="tab-kit"]');
    await page.until("window.__ui.hangar.tab === 'kit'", 5000);
    const shown = await page.evaluate(`document.querySelectorAll('.hangar .kit-tab [data-key^="kit-"]').length`);
    const want = slotsFor(id).reduce((n, s) => n + s.options.length, 0);
    say(shown === want, `${id}: the Kit tab offers ${shown} slot options, ${want} in the catalogue`);
    for (const view of ['top', 'left']) {
      await page.click(`.hangar [data-key="view-${view}"]`);
      await page.sleep(2500);
      await shot(page, `${id}-kit-${view}`);
    }
    await page.tap('Escape');
    await page.until('!window.__ui.hangar.isOpen', 5000);
    await page.evaluate('window.__ui.carousel.close(); true');
  }
}

async function main() {
  await mkdir(join(outDir, 'studio'), { recursive: true });
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    say(FAMILIES.length > 0, `drawn plane families: ${FAMILIES.join(', ')}`);
    await boxes(page);
    await studio(page);
    await pictures(page);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
  } finally {
    await page.close();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
