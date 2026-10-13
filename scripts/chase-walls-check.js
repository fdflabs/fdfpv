/*
 * chase-walls-check.js: the chase camera in the page, against the seated
 * map's solids (docs/redesign/COMPLETENESS.md item 51, phase 29).
 *
 *   node scripts/chase-walls-check.js [map ...]   alps and itaipu by default
 *
 * The default plane, chase view, graphics low. Its camera is read at the
 * map's start for the way it hangs off the craft; then the plane is put
 * down CRAFT_GAP_M out from a tall solid (scripts/lib/solids.js) with that
 * solid where the camera hangs: on Itaipu that is the dam. When the
 * camera has settled:
 *
 *   control  the arm the camera hung at the start, put on the plane here
 *            and held over the ground as src/main.js chaseCamera holds it,
 *            looks through the solid, so the case is one the old camera
 *            got wrong;
 *   camera   the camera, and every point of its line to the craft, is
 *            CAMERA_CLEAR_M from every solid (src/render/chasearm.js).
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
import { SETTINGS_KEY, FIRST_AIRFRAME, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { CAMERA_CLEAR_M } from '../src/render/chasearm.js';
import { FIND_SOLIDS } from './lib/solids.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['alps', 'itaipu'];

/* m: the craft is put down this far from the solid's nearest point. */
const CRAFT_GAP_M = 2;

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
const f2 = (v) => (v == null || !Number.isFinite(v) ? 'clear' : v.toFixed(2));

/* The least gap to a solid along a line, every centimetre, in the page. */
const LINE_GAP = `((a, b) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.01));
  let least = Infinity;
  for (let k = 0; k <= n; k += 1) {
    const f = k / n;
    const g = window.__nearSolid(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, 5);
    least = Math.min(least, g == null ? Infinity : g);
  }
  return Number.isFinite(least) ? least : null;
})`;

const POSE = `(() => { const s = window.__craftState(); return { craft: { x: s.worldX, y: s.worldY, z: s.worldZ }, camera: s.camera }; })()`;

/* Until the camera holds still to a centimetre over a few frames. */
async function settled(page) {
  let last = null;
  for (let k = 0; k < 120; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    const p = await page.evaluate(POSE);
    if (last && Math.hypot(p.camera.x - last.camera.x, p.camera.y - last.camera.y, p.camera.z - last.camera.z) < 0.01) {
      return p;
    }
    last = p;
  }
  throw new Error('the chase camera did not settle');
}

/* Where to put the craft: from each solid, walk away along `dir` (the
 * camera's side, reversed) until a point a metre and a half over open dry
 * ground is CRAFT_GAP_M clear, and keep it when the arm the old camera
 * would hang there (`arm`, the camera's offset at the start, held half a
 * metre over the ground as chaseCamera holds it) looks through a solid. The first such point, or
 * null. The control below asserts the same of the arm the page settles. */
const PLACE = `((hits, dir, arm, rest) => {
  const ground = (x, z) => window.__surface(x, z, window.__surface(x, z, -1000));
  const through = (a, b) => {
    for (let k = 0; k <= 200; k += 1) {
      const f = k / 200;
      const g = window.__nearSolid(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, 1);
      if (g != null && g < ${CAMERA_CLEAR_M}) { return true; }
    }
    return false;
  };
  for (const h of hits) {
    for (let d = 0.25; d < 40; d += 0.25) {
      const x = h.x - dir.x * d;
      const z = h.z - dir.z * d;
      const y = ground(x, z);
      const g = window.__nearSolid(x, y + 1.5, z, ${CRAFT_GAP_M} + 1);
      if (g == null || g < ${CRAFT_GAP_M}) { continue; }
      const w = window.__waterSample(x, z);
      if (window.__heightAt(x, z) > y + 0.05 || (w && w.shell != null)) { break; }
      const craft = { x, y: y + rest, z };
      const aim = { x: x + arm.x, y: craft.y + arm.y, z: z + arm.z };
      aim.y = Math.max(aim.y, window.__heightAt(aim.x, aim.z) + 0.5);
      if (through(craft, aim)) { return { x, z, solid: h, ground: y }; }
      break;
    }
  }
  return null;
})`;

for (const map of maps) {
  console.log(map);
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, FIRST_AIRFRAME),
    airframeAsked: true,
    map,
    freestyleMap: map,
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
    fpsCap: 0,
    wingView: 'chase',
  };
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* storage refused; the map check below says so */ }
  navigator.getGamepads = () => [];`];
  const page = await openPage({ root, width: 960, height: 540, seed });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until(`window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready && window.__map().id === ${JSON.stringify(map)}`, 400000);
    await page.until('(() => { const i = window.__intro(); return !i.orbiting && !i.approaching && !i.zooming; })()', 60000);
    const home = await page.evaluate('window.__map().spawn');
    const at0 = await settled(page);
    const hx = at0.camera.x - at0.craft.x;
    const hz = at0.camera.z - at0.craft.z;
    const hl = Math.hypot(hx, hz);
    check(`${map}: the chase view hangs the camera behind the plane`, hl > 1, `${f2(hl)} m out level; craft ${JSON.stringify(at0.craft)}, camera ${JSON.stringify(at0.camera)}`);
    const dir = { x: hx / hl, z: hz / hl };
    const hits = await page.evaluate(`${FIND_SOLIDS}(${JSON.stringify(home)})`);
    const arm = { x: at0.camera.x - at0.craft.x, y: at0.camera.y - at0.craft.y, z: at0.camera.z - at0.craft.z };
    const rest = at0.craft.y - (await page.evaluate(`window.__surface(${at0.craft.x}, ${at0.craft.z}, ${at0.craft.y})`));
    const spot = await page.evaluate(`${PLACE}(${JSON.stringify(hits)}, ${JSON.stringify(dir)}, ${JSON.stringify(arm)}, ${rest})`);
    if (!spot) {
      check(`${map}: open ground ${CRAFT_GAP_M} m from one of ${hits.length} solids`, false, 'none');
      continue;
    }
    await page.evaluate(`window.__respawn(${spot.x}, ${spot.z}, ${home.yaw})`);
    const p = await settled(page);
    console.log(`  note  craft (${f2(p.craft.x)}, ${f2(p.craft.y)}, ${f2(p.craft.z)}), camera (${f2(p.camera.x)}, ${f2(p.camera.y)}, ${f2(p.camera.z)}), at the start the camera hung (${f2(hx)}, ${f2(at0.camera.y - at0.craft.y)}, ${f2(hz)}) off the plane`);
    const len = Math.hypot(p.camera.x - p.craft.x, p.camera.y - p.craft.y, p.camera.z - p.craft.z);
    const full = { x: p.craft.x + arm.x, y: p.craft.y + arm.y, z: p.craft.z + arm.z };
    full.y = Math.max(full.y, (await page.evaluate(`window.__heightAt(${full.x}, ${full.z})`)) + 0.5);
    const fullGap = await page.evaluate(`${LINE_GAP}(${JSON.stringify(p.craft)}, ${JSON.stringify(full)})`);
    check(`${map} control: at (${f2(spot.x)}, ${f2(spot.z)}), ${CRAFT_GAP_M} m from a solid, the arm the start hung looks through it`,
      fullGap != null && fullGap < CAMERA_CLEAR_M, `least on its line ${f2(fullGap)} m`);
    const gap = await page.evaluate(`${LINE_GAP}(${JSON.stringify(p.craft)}, ${JSON.stringify(p.camera)})`);
    check(`${map}: the camera and its line to the plane are ${CAMERA_CLEAR_M} m clear`,
      gap == null || gap >= CAMERA_CLEAR_M - 0.01, `arm ${f2(len)} of ${f2(Math.hypot(arm.x, arm.y, arm.z))} m, least on its line ${f2(gap)} m`);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check(`${map}: no page error`, errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
