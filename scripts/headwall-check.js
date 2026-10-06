/*
 * headwall-check.js: the Alps headwall's ledge is grass to the crash
 * model, as it is drawn, and its face is rock.
 *
 *     node scripts/headwall-check.js
 *
 * The headwall's ground grid (src/maps/alps/nature.js buildHeadwall) is
 * what a craft meets there. The ledge on top of the face is drawn as
 * turf, but its grid once read as rock, so a five inch let down on it at
 * 3.5 m/s broke its camera where the same landing on grass does not. Two
 * rows, on the real page with crash damage on, flying the interceptor:
 *
 *   ledge   the map's material at a point on the ledge is grass, and a
 *           quad dropped on it at 3.5 m/s is given grass by the plant,
 *           loses no camera and is not wrecked.
 *   throw   a quad thrown level into the face at 3.5 m/s touches it and is
 *           given rock on every contact at the wall (it then falls to the
 *           foot, which is turf).
 *
 * Exit 0 when every row passes and the page logged no error, 1 otherwise.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAP = 'alps';
const AIRFRAME = 'interceptor';
const SPEED = 3.5;
const FLY_MS = 3000;

const settings = {
  ...seatAirframe({ airframe: AIRFRAME, rates: airframeById(AIRFRAME).rates }, AIRFRAME),
  airframeAsked: true, map: MAP, graphics: 'low', graphicsAuto: false, crashDamage: true, sound: false,
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

/*
 * Page side: where the headwall is, found on the drawn mesh. Rays down
 * through the ledge at the band's middle, and a ray along +x into the face
 * six metres under the lip, from the pool's side.
 */
const SITE = `(() => {
  const T = window.__three;
  const scene = window.__mapScene();
  scene.updateMatrixWorld(true);
  const wall = scene.getObjectByName('headwall');
  /* A ray meets only the side a material draws; the face's winding is the drawn one. */
  wall.material.side = T.DoubleSide;
  const box = new T.Box3().setFromObject(wall);
  /* Off the band's middle, where the stream runs over the ledge and a craft is in water. */
  const z = (box.min.z + box.max.z) / 2 + 60;
  const rc = new T.Raycaster();
  /* The ledge at this z: the level hits of rays down across the wall's span;
   * the middle of them, the face where the first of them begins. */
  const level = [];
  for (let x = box.min.x; x <= box.max.x; x += 1) {
    rc.set(new T.Vector3(x, box.max.y + 50, z), new T.Vector3(0, -1, 0));
    const hit = rc.intersectObject(wall, false)[0];
    if (hit && hit.face.normal.y > 0.9) {
      level.push(hit.point);
    }
  }
  const top = level[Math.floor(level.length / 2)];
  const lip = level[0];
  rc.set(new T.Vector3(box.min.x - 30, lip.y - 6, z), new T.Vector3(1, 0, 0));
  const face = rc.intersectObject(wall, false)[0].point;
  return { ledge: { x: top.x, y: top.y, z, width: level.length }, face: { x: face.x, y: face.y, z } };
})()`;

const SAMPLE = `(() => {
  const g = window.__ground();
  const c = window.__crash();
  const s = window.__craftState();
  return { material: g.material, contacts: g.contactSteps, flags: c.flagNames, wrecked: c.wrecked, x: s.worldX, y: s.worldY, speed: s.speed };
})()`;

async function fly(page, at, throwing) {
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...throwing, ...at, hold: true })})`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await page.sleep(300);
  await page.evaluate('window.__releasePose()');
  const log = [];
  const t0 = Date.now();
  while (Date.now() - t0 < FLY_MS) {
    log.push(await page.evaluate(`JSON.stringify(${SAMPLE})`).then(JSON.parse));
    await page.sleep(30);
  }
  return log;
}

const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${MAP}`, seed });
let failed = 0;
const row = (name, ok, facts) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${MAP} headwall ${name}: ${JSON.stringify(facts)}`);
  failed += ok ? 0 : 1;
};
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.evaluate('window.__drawOff(true)');
  const site = await page.evaluate(`JSON.stringify(${SITE})`).then(JSON.parse);
  const { ledge, face } = site;

  const ledgeMat = await page.evaluate(`window.__surfaceMaterial(${ledge.x}, ${ledge.z}, ${ledge.y})`);
  const log = await fly(page, { x: ledge.x, y: ledge.y + 0.3, z: ledge.z }, { yaw: 0, pitch: 0, vx: 0, vy: -SPEED, vz: 0 });
  const touched = log.filter((r) => r.contacts > log[0].contacts);
  const materials = [...new Set(log.map((r) => r.material))];
  const last = log[log.length - 1];
  row('ledge', ledgeMat === 'grass' && touched.length > 0 && materials.every((m) => m === 'grass') && !last.flags.includes('cameraLost') && !last.wrecked,
    { map: ledgeMat, plant: materials, flags: last.flags, wrecked: last.wrecked, contactSteps: touched.length });

  const hit = await fly(page, { x: face.x - 4, y: face.y, z: face.z }, { yaw: -90, pitch: 0, vx: SPEED, vy: 0, vz: 0 });
  if (process.argv.includes('--verbose')) {
    hit.forEach((r) => console.log(JSON.stringify(r)));
  }
  /* Contacts at the wall; the quad then falls down it to the foot, which is turf. */
  const onFace = hit.filter((r) => r.contacts > hit[0].contacts && Math.abs(r.x - face.x) < 3);
  const seen = [...new Set(onFace.map((r) => r.material))];
  row('throw', onFace.length > 0 && seen.every((m) => m === 'rock'), { contactSteps: onFace.length, plant: seen, reachedX: +hit[hit.length - 1].x.toFixed(1), faceX: +face.x.toFixed(1) });

  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  failed += errs.length;
} finally {
  await page.close();
}
console.log(failed ? `${failed} failure(s)` : 'headwall ledge is grass, face is rock');
process.exit(failed ? 1 : 0);
