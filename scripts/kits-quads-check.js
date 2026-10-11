/*
 * kits-quads-check.js: the combat quads' visual part kits in the real
 * shell (docs/KITS.md section 8, PR 3). Every option of every slot is built
 * in the page and its box held to the stock machine's plus 1 cm (the
 * referee meets configs/hulls.js, made from stock, so a kit must never
 * draw outside it); then each quad is opened in the hangar wearing a kit
 * from a seeded settings blob and pictured, every option shown on one of
 * the three.
 *
 * usage: node scripts/kits-quads-check.js [outdir]
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
import { slotsFor } from '../configs/kits.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'kits-quads-check'));
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

const QUADS = ['7inch', '10inch', 'interceptor'];
/* Between them every option of every slot is pictured once. */
const WORN = {
  '7inch': { arms: 'cutout', top: 'vented', mount: 'cage', antenna: 'dualt' },
  '10inch': { arms: 'blade', top: 'armoured', mount: 'plates', antenna: 'pagoda' },
  interceptor: { arms: 'tapered', top: 'vented', antenna: 'pagoda' },
};

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: 'low',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
    livery: ${JSON.stringify(Object.fromEntries(QUADS.map((id) => [id, { kit: { v: 1, parts: WORN[id] } }])))},
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function boxes(page) {
  console.log('1. every option inside the stock box (+1 cm)');
  const options = Object.fromEntries(QUADS.map((id) => [id, slotsFor(id)]));
  const got = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { craftBuilderFor } = await import('./src/render/craft.js');
    const options = ${JSON.stringify(options)};
    const out = [];
    for (const [id, slots] of Object.entries(options)) {
      const shape = (kit) => {
        const g = craftBuilderFor(id)({ fog: false, kit }).group;
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g);
        const pts = [];
        g.traverse((o) => {
          if (o.isMesh && o.geometry.attributes.position) {
            const a = o.geometry.attributes.position;
            const v = new THREE.Vector3();
            for (let i = 0; i < a.count; i += 7) {
              v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
              pts.push(v.x.toFixed(5), v.y.toFixed(5), v.z.toFixed(5));
            }
          }
        });
        return { box, sig: pts.join(',') };
      };
      const boxOf = (kit) => shape(kit).box;
      const stock = boxOf(undefined);
      const stockSig = shape(undefined).sig;
      for (const s of slots) {
        for (const option of s.options.slice(1)) {
          const { box: b, sig } = shape({ [s.id]: option });
          const past = Math.max(...['x', 'y', 'z'].flatMap((a) => [stock.min[a] - b.min[a], b.max[a] - stock.max[a]]));
          out.push({ id, slot: s.id, option, past, drawn: sig !== stockSig });
        }
      }
    }
    return out;
  })()`);
  for (const r of got) {
    say(r.past <= 0.01 && r.drawn, `${r.id} ${r.slot} ${r.option}: drawn differently from stock ${r.drawn}, ${(Math.max(0, r.past) * 1000).toFixed(1)} mm past the stock box`);
  }
}

/* What a room draws for another pilot (src/render/peers.js
 * buildPeerCraft), from the profile the room passes on untouched
 * (src/share/roomwire.js checkProfile): the kit in its livery is drawn. */
async function peers(page) {
  console.log('3. another pilot in a room wears their kit');
  const got = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { buildPeerCraft } = await import('./src/render/peers.js');
    const sig = (c) => {
      const pts = [];
      c.group.updateMatrixWorld(true);
      c.group.traverse((o) => {
        if (o.isMesh && o.geometry.attributes.position) {
          pts.push(o.geometry.attributes.position.count);
        }
      });
      return pts.join(',');
    };
    const out = {};
    for (const [id, parts] of Object.entries(${JSON.stringify(WORN)})) {
      const base = { airframe: id, map: 'swiss2', figure: 0, parts: null };
      const plain = buildPeerCraft({ ...base, livery: null });
      const kitted = buildPeerCraft({ ...base, livery: { kit: { v: 1, parts } } });
      out[id] = sig(plain) !== sig(kitted);
      plain.dispose();
      kitted.dispose();
    }
    return out;
  })()`);
  for (const [id, drawn] of Object.entries(got)) {
    say(drawn, `${id}: a peer with a kit is drawn differently from one without`);
  }
  /* A peer's LEDs run their pattern as it is posed each frame. */
  const chase = await page.evaluate(`(async () => {
    const { buildPeerCraft } = await import('./src/render/peers.js');
    const rig = buildPeerCraft({ airframe: '7inch', map: 'swiss2', figure: 0, parts: null,
      livery: { lights: { v: 1, led: '#00b7ff', pattern: 'chase' } } });
    const drawn = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    const p = { flags: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, vx: 0, vy: 0, vz: 0 };
    const lit = (simT) => {
      rig.pose(drawn, p, 0.016, simT, 720, 70);
      return [0, 1, 2, 3].map((m) => rig.group.getObjectByName('led-' + m).material.color.getHex() === 0x00b7ff ? 1 : 0).join('');
    };
    const out = [0, 0.11, 0.22, 0.33].map(lit);
    rig.dispose();
    return out;
  })()`);
  say(chase.join() === '1000,0100,0010,0001', `7inch: a peer's LEDs chase as it is posed: ${chase.join(' ')}`);
}

async function pictures(page) {
  console.log('2. each quad in the hangar wearing its kit');
  for (const id of QUADS) {
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
    await page.tap('KeyC');
    await page.until(`window.__ui.hangar.isOpen && window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
    await page.until('Boolean(window.__carouselStats().camera)', 120000);
    await page.sleep(1500);
    const kit = await page.evaluate(`JSON.stringify((window.__ui.settings.livery[${JSON.stringify(id)}] || {}).kit || null)`);
    say(kit === JSON.stringify({ v: 1, parts: WORN[id] }), `${id}: the seeded kit loaded: ${kit}`);
    await shot(page, `${id}-kit`);
    /* Close up from above, where arms, top plate and antennas read. */
    await page.click('.hangar [data-key="view-top"]');
    await page.sleep(2500);
    for (let i = 0; i < 6; i += 1) {
      await page.tap('KeyU');
    }
    await page.sleep(2000);
    await shot(page, `${id}-kit-top`);
    await page.tap('Escape');
    await page.until('!window.__ui.hangar.isOpen', 5000);
    await page.evaluate('window.__ui.carousel.close(); true');
  }
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await boxes(page);
    await pictures(page);
    await peers(page);
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
