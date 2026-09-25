/*
 * craft-preview.js: pictures of one aircraft model, headless, without the
 * shell.
 *
 * A model can be looked at before it is in the airframe table: this loads
 * tests/browser/craft-preview.html, which builds the model on a plain stage
 * through the game's post pass, and takes a fixed set of views, front,
 * three quarter, side, top, below and close ups, neutral and with the
 * surfaces at full throw, and prints what the model costs in draws and
 * triangles.
 *
 *   node scripts/craft-preview.js [sky|cub|glider|bramor|stick|timber] [outDir] [--lite]
 *
 * Pictures go to outDir, by default a directory under the system temp,
 * and are not committed (CLAUDE.md).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const lite = process.argv.includes('--lite');
const craft = args[0] ?? 'sky';
const outDir = args[1] ?? join(tmpdir(), `craft-preview-${craft}`);

/* Full throw for the pictures: 20 degrees, which is what a Skyhunter's
 * surfaces reach on their horns. */
const FULL = (20 * Math.PI) / 180;

/*
 * Each view: a name, the surfaces (left aileron, right aileron, elevator,
 * rudder), and the camera (azimuth, elevation, distance, target x y z,
 * fov). The deflected set is right roll aileron, up elevator and left
 * rudder, so every hinge can be read against the convention in one frame.
 */
const DEFLECT = [-FULL, FULL, FULL, FULL];
const NEUTRAL = [0, 0, 0, 0];
const VIEWS = [
  ['front', NEUTRAL, [0, 4, 4.2, 0, 0, 0.2]],
  ['three-quarter', NEUTRAL, [-140, 28, 4.0, 0, 0, 0.2]],
  ['three-quarter-front', NEUTRAL, [-35, 25, 4.0, 0, 0, 0.2]],
  ['side', NEUTRAL, [90, 0, 4.0, 0, 0, 0.23]],
  ['top', NEUTRAL, [0, 90, 4.4, 0, 0, 0.2]],
  ['below', NEUTRAL, [0, -90, 4.4, 0, 0, 0.2]],
  ['deflected-three-quarter', DEFLECT, [-150, 25, 4.0, 0, 0, 0.2]],
  ['deflected-rear', DEFLECT, [180, 12, 4.0, 0, 0, 0.2]],
  ['deflected-top', DEFLECT, [0, 90, 4.4, 0, 0, 0.2]],
  ['tail-close', DEFLECT, [-145, 22, 1.4, 0, 0.06, 0.77]],
  ['tail-side', DEFLECT, [90, 0, 1.0, 0.232, 0.06, 0.77]],
  ['tail-top', DEFLECT, [0, 90, 1.0, 0, 0.06, 0.77]],
  ['aileron-right', DEFLECT, [150, 6, 1.3, 0.6, 0.05, 0.1]],
  ['aileron-left', DEFLECT, [-150, 6, 1.3, -0.6, 0.05, 0.1]],
  ['prop-close', NEUTRAL, [-150, 18, 0.9, 0, 0.03, 0.26]],
  ['prop-blur', NEUTRAL, [-150, 18, 0.9, 0, 0.03, 0.26], true],
  ['nose-close', NEUTRAL, [-30, 18, 0.9, 0, 0, -0.30]],
];

/*
 * The Cub's own set, aimed at its parts: the craft frame puts its spinner
 * at z = -0.26 and its rudder at +0.64. A fourth camera field of true sits
 * it on its wheels at rest, so the side view shows the taildragger's
 * stance. Its deflected set is the same as the Skyhunter's, plus the
 * tailwheel, which turns with the rudder.
 */
const CUB_VIEWS = [
  ['front', NEUTRAL, [0, 4, 3.4, 0, 0, 0]],
  ['three-quarter', NEUTRAL, [-140, 24, 3.0, 0, 0, 0.1]],
  ['three-quarter-front', NEUTRAL, [-35, 20, 3.0, 0, 0, 0.05]],
  ['side', NEUTRAL, [90, 0, 3.0, 0, 0, 0.19]],
  ['side-rest', NEUTRAL, [90, 3, 3.0, 0, 0, 0.19], false, true],
  ['three-quarter-rest', NEUTRAL, [-45, 12, 2.6, 0, 0, 0.1], false, true],
  ['top', NEUTRAL, [0, 90, 3.4, 0, 0, 0.19]],
  ['below', NEUTRAL, [0, -90, 3.4, 0, 0, 0.19]],
  ['deflected-three-quarter', DEFLECT, [-150, 25, 3.0, 0, 0, 0.1]],
  ['deflected-rear', DEFLECT, [180, 12, 3.0, 0, 0, 0.1]],
  ['deflected-top', DEFLECT, [0, 90, 3.4, 0, 0, 0.19]],
  ['cowl-close', NEUTRAL, [-40, 12, 0.75, 0, 0, -0.18]],
  ['cowl-side', NEUTRAL, [90, 5, 0.75, 0, 0, -0.17]],
  ['prop-close', NEUTRAL, [-20, 10, 0.9, 0, 0, -0.23]],
  ['prop-blur', NEUTRAL, [-20, 10, 0.9, 0, 0, -0.23], true],
  ['cabin-close', NEUTRAL, [-70, 15, 0.8, 0, 0.03, 0.0]],
  ['tail-close', DEFLECT, [-145, 20, 0.9, 0, 0.06, 0.55]],
  ['tail-side', DEFLECT, [90, 0, 0.8, 0, 0.06, 0.55]],
  ['tail-top', DEFLECT, [0, 90, 0.9, 0, 0.06, 0.55]],
  ['tailwheel-below', DEFLECT, [180, -40, 0.45, 0, -0.01, 0.58]],
  ['gear-close', NEUTRAL, [-60, 0, 0.8, 0, -0.10, -0.08]],
  ['gear-front', NEUTRAL, [0, -5, 0.9, 0, -0.08, -0.08]],
  ['aileron-right', DEFLECT, [150, 6, 1.1, 0.5, 0.1, 0.0]],
  ['aileron-left', DEFLECT, [-150, 6, 1.1, -0.5, 0.1, 0.0]],
];

/*
 * The Radian's set: its spinner is at z = -0.31, its fin at +0.83, and it
 * is 2 m across, so the whole views stand further off. A fifth camera
 * field is the motor's rate for the folding prop, rad/s: 0 folds it, and
 * the prop views show it both ways. Its deflected set is the Cub's.
 */
const GLIDER_VIEWS = [
  ['front', NEUTRAL, [0, 4, 5.4, 0, 0.03, 0], false, false, 0],
  ['three-quarter', NEUTRAL, [-140, 24, 5.0, 0, 0, 0.2], false, false, 0],
  ['three-quarter-front', NEUTRAL, [-35, 20, 5.0, 0, 0, 0.1], false, false, 0],
  ['side', NEUTRAL, [90, 0, 3.6, 0, 0.05, 0.26], false, false, 0],
  ['top', NEUTRAL, [0, 90, 5.4, 0, 0, 0.2], false, false, 0],
  ['below', NEUTRAL, [0, -90, 5.4, 0, 0, 0.2], false, false, 0],
  ['deflected-three-quarter', DEFLECT, [-150, 25, 5.0, 0, 0, 0.2], false, false, 0],
  ['deflected-rear', DEFLECT, [180, 12, 5.0, 0, 0, 0.2], false, false, 0],
  ['deflected-top', DEFLECT, [0, 90, 5.4, 0, 0, 0.2], false, false, 0],
  ['nose-folded', NEUTRAL, [-40, 12, 0.8, 0, 0, -0.22], false, false, 0],
  ['nose-folded-top', NEUTRAL, [0, 90, 0.8, 0, 0, -0.22], false, false, 0],
  ['nose-open', NEUTRAL, [-40, 12, 0.8, 0, 0, -0.22], false, false, 900],
  ['nose-open-front', NEUTRAL, [0, 5, 0.9, 0, 0, -0.25], false, false, 900],
  ['nose-blur', NEUTRAL, [-40, 12, 0.8, 0, 0, -0.22], true, false, 900],
  ['canopy-side', NEUTRAL, [90, 5, 0.9, 0, 0.02, -0.12], false, false, 0],
  ['tail-close', DEFLECT, [-145, 20, 1.1, 0, 0.12, 0.72], false, false, 0],
  ['tail-side', DEFLECT, [90, 0, 1.0, 0, 0.12, 0.72], false, false, 0],
  ['tail-top', DEFLECT, [0, 90, 1.0, 0, 0.1, 0.72], false, false, 0],
  ['tip-right', DEFLECT, [150, 10, 1.4, 0.75, 0.12, 0.05], false, false, 0],
  ['tip-left', DEFLECT, [-150, 10, 1.4, -0.75, 0.12, 0.05], false, false, 0],
];

/*
 * The Bramor's own set: a 2.3 m wing, so the cameras stand further off,
 * its elevons (only the first two surfaces mean anything), the gimbal
 * ball, the prop open and folded, the canopy open and on the grass, and
 * the catapult. The seventh field is what to set up before the shot.
 */
const B_DEFLECT = [-FULL / 2, FULL / 2, 0, 0];
const BRAMOR_VIEWS = [
  ['front', NEUTRAL, [0, 4, 5.5, 0, 0, 0], false, false, 900],
  ['three-quarter', NEUTRAL, [-140, 28, 5.2, 0, 0, 0.1], false, false, 900],
  ['three-quarter-front', NEUTRAL, [-35, 25, 5.2, 0, 0, 0], false, false, 900],
  ['side', NEUTRAL, [90, 0, 4.2, 0, 0, 0.1], false, false, 900],
  ['top', NEUTRAL, [0, 90, 5.6, 0, 0, 0.1], false, false, 900],
  ['below', NEUTRAL, [0, -90, 5.6, 0, 0, 0.1], false, false, 900],
  ['deflected-rear', B_DEFLECT, [180, 12, 5.0, 0, 0, 0.1], false, false, 900],
  ['deflected-top', B_DEFLECT, [0, 90, 5.6, 0, 0, 0.1], false, false, 900],
  ['nose-close', NEUTRAL, [-30, 12, 0.9, 0, -0.01, -0.33], false, false, 900],
  ['nose-front', NEUTRAL, [0, 5, 0.7, 0, -0.01, -0.36], false, false, 900],
  ['tail-close', NEUTRAL, [-150, 22, 1.2, 0, 0.06, 0.30], false, false, 900],
  ['prop-folded', NEUTRAL, [-120, 30, 1.2, 0, 0.06, 0.30], false, false, 0],
  ['prop-blur', NEUTRAL, [-150, 22, 1.2, 0, 0.06, 0.30], true, false, 900],
  ['winglet', NEUTRAL, [-120, 15, 1.4, 1.1, 0.1, 0.1], false, false, 900],
  ['chute-open', NEUTRAL, [-120, 5, 9.0, 0, 1.6, 0.1], false, false, 0, 'window.__preview.chute(1)'],
  ['chute-opening', NEUTRAL, [-120, 5, 9.0, 0, 1.6, 0.1], false, false, 0, 'window.__preview.chute(0.3)'],
  ['chute-down', NEUTRAL, [-60, 30, 6.0, 0, 0, 1.0], false, false, 0, 'window.__preview.chute(1, true)'],
  ['launcher', NEUTRAL, [-110, 12, 7.0, 0, 0.6, 1.2], false, false, 0, 'window.__preview.launcher(true)'],
  ['launcher-front', NEUTRAL, [-25, 10, 6.0, 0, 0.8, 0.6], false, false, 0, 'window.__preview.launcher(true)'],
];

/*
 * The Slow Stick's own set: its prop at z = -0.31, its tail at +0.63, and
 * the same rest flag as the Cub's, since it stands on a tailwheel too.
 */
const STICK_VIEWS = [
  ['front', NEUTRAL, [0, 4, 3.2, 0, 0, 0]],
  ['front-level', NEUTRAL, [0, 0, 3.2, 0, 0.05, 0]],
  ['three-quarter', NEUTRAL, [-140, 24, 3.0, 0, 0, 0.15]],
  ['three-quarter-front', NEUTRAL, [-35, 20, 3.0, 0, 0, 0.05]],
  ['side', NEUTRAL, [90, 0, 3.0, 0, 0, 0.16]],
  ['side-rest', NEUTRAL, [90, 3, 3.0, 0, 0, 0.16], false, true],
  ['three-quarter-rest', NEUTRAL, [-45, 14, 2.6, 0, 0, 0.1], false, true],
  ['top', NEUTRAL, [0, 90, 3.2, 0, 0, 0.16]],
  ['below', NEUTRAL, [0, -90, 3.2, 0, 0, 0.16]],
  ['deflected-three-quarter', DEFLECT, [-150, 25, 3.0, 0, 0, 0.15]],
  ['deflected-rear', DEFLECT, [180, 12, 3.0, 0, 0, 0.15]],
  ['nose-close', NEUTRAL, [-40, 12, 0.7, 0, -0.02, -0.25]],
  ['prop-blur', NEUTRAL, [-20, 10, 0.9, 0, 0, -0.28], true],
  ['wing-root', NEUTRAL, [-60, 30, 0.7, 0, 0.03, -0.02]],
  ['tail-close', DEFLECT, [-145, 20, 0.9, 0, 0.06, 0.55]],
  ['tail-side', DEFLECT, [90, 0, 0.8, 0, 0.08, 0.56]],
  ['tail-top', DEFLECT, [0, 90, 0.9, 0, 0.06, 0.55]],
  ['gear-front', NEUTRAL, [0, -5, 0.9, 0, -0.08, -0.15]],
  ['gear-side', NEUTRAL, [90, 0, 0.8, 0, -0.07, -0.12]],
];

/*
 * The Timber's own set: its spinner at z = -0.33, its rudder at +0.72,
 * resting on its tailwheel as the Cub does, and the flaps, which are what
 * it is for: half and full, from the side and from behind, where the slot
 * they open shows.
 */
const FLAPS_HALF = 'window.__preview.flaps(0.3137)';
const FLAPS_FULL = 'window.__preview.flaps(0.5705)';
const TIMBER_VIEWS = [
  ['front', NEUTRAL, [0, 4, 3.6, 0, 0, 0]],
  ['front-level', NEUTRAL, [0, 0, 3.6, 0, 0.05, 0]],
  ['three-quarter', NEUTRAL, [-140, 24, 3.2, 0, 0, 0.15]],
  ['three-quarter-front', NEUTRAL, [-35, 20, 3.2, 0, 0, 0.05]],
  ['side', NEUTRAL, [90, 0, 3.2, 0, 0, 0.19]],
  ['side-rest', NEUTRAL, [90, 3, 3.2, 0, 0, 0.19], false, true],
  ['three-quarter-rest', NEUTRAL, [-45, 12, 2.8, 0, 0, 0.1], false, true],
  ['front-rest', NEUTRAL, [-12, 6, 2.6, 0, 0.05, 0.0], false, true],
  ['top', NEUTRAL, [0, 90, 3.6, 0, 0, 0.19]],
  ['below', NEUTRAL, [0, -90, 3.6, 0, 0, 0.19]],
  ['deflected-three-quarter', DEFLECT, [-150, 25, 3.2, 0, 0, 0.15]],
  ['deflected-rear', DEFLECT, [180, 12, 3.2, 0, 0, 0.15]],
  ['flaps-half-side', NEUTRAL, [90, 4, 1.6, 0.2, 0.05, -0.05], false, false, undefined, FLAPS_HALF],
  ['flaps-full-side', NEUTRAL, [90, 4, 1.6, 0.2, 0.05, -0.05], false, false, undefined, FLAPS_FULL],
  ['flaps-full-rear', NEUTRAL, [160, 10, 1.6, 0.25, 0.05, 0.0], false, false, undefined, FLAPS_FULL],
  ['flaps-full-rest', NEUTRAL, [-120, 14, 2.8, 0, 0, 0.1], false, true, undefined, FLAPS_FULL],
  ['slat-close', NEUTRAL, [70, 12, 0.55, 0.45, 0.08, -0.06]],
  ['nose-close', NEUTRAL, [-40, 12, 0.8, 0, -0.01, -0.25]],
  ['prop-blur', NEUTRAL, [-20, 10, 0.9, 0, 0, -0.29], true],
  ['cabin-close', NEUTRAL, [-70, 15, 0.9, 0, 0.03, 0.05]],
  ['tail-close', DEFLECT, [-145, 20, 1.0, 0, 0.06, 0.62]],
  ['tail-side', DEFLECT, [90, 0, 0.9, 0, 0.06, 0.62]],
  ['tail-top', DEFLECT, [0, 90, 1.0, 0, 0.06, 0.62]],
  ['gear-front', NEUTRAL, [0, -5, 1.0, 0, -0.10, -0.06]],
  ['gear-close', NEUTRAL, [-60, 0, 0.9, 0, -0.10, -0.06]],
  ['tip-close', NEUTRAL, [-110, 8, 0.7, -0.72, 0.05, -0.05]],
];

const page = await openPage({
  root, width: 1280, height: 800, url: `/tests/browser/craft-preview.html?craft=${craft}${lite ? '&lite=1' : ''}`,
});
try {
  await page.until('window.__previewReady === true', 60000);
  await mkdir(outDir, { recursive: true });
  const scale = 1;
  const views = { cub: CUB_VIEWS, glider: GLIDER_VIEWS, bramor: BRAMOR_VIEWS, stick: STICK_VIEWS, timber: TIMBER_VIEWS }[craft] ?? VIEWS;
  for (const [name, surf, cam, blur, rest, omega, setup] of views) {
    const [az, el, dist, tx, ty, tz] = cam;
    await page.evaluate('window.__preview.launcher(false); window.__preview.chute(0); window.__preview.flaps(0)');
    await page.evaluate(`window.__preview.rest(${Boolean(rest)})`);
    if (setup) {
      await page.evaluate(setup);
    }
    await page.evaluate(`window.__preview.surfaces(${surf.join(',')})`);
    if (omega === undefined) {
      await page.evaluate(`window.__preview.spin(0.6, ${Boolean(blur)})`);
    } else {
      await page.evaluate(`window.__preview.prop(${omega})`);
      if (blur) {
        await page.evaluate('window.__preview.spin(0.6, true)');
      }
    }
    await page.evaluate(`window.__preview.view(${az}, ${el}, ${dist * scale}, ${tx}, ${ty}, ${tz * scale})`);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const path = join(outDir, `${craft}-${name}.png`);
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(`shot ${path}`);
  }
  /*
   * The surface convention as numbers, for a craft with four surfaces: each
   * one alone to +20 degrees must move its part's box the way the contract
   * says. Trailing edge up lifts the box's top; trailing edge left pushes
   * its left side further left.
   */
  await page.evaluate('window.__preview.rest(false)');
  const up = (a, b) => b.max[1] - a.max[1];
  const left = (a, b) => a.min[0] - b.min[0];
  const CASES = {
    sky: [
      ['aileron-left', [FULL, 0, 0, 0], up],
      ['aileron-right', [0, FULL, 0, 0], up],
      ['elevator', [0, 0, FULL, 0], up],
      ['rudder-left', [0, 0, 0, FULL], left],
      ['rudder-right', [0, 0, 0, FULL], left],
    ],
    bramor: [
      ['elevon-left', [FULL, 0, 0, 0], up],
      ['elevon-right', [0, FULL, 0, 0], up],
    ],
    cub: [
      ['aileron-left', [FULL, 0, 0, 0], up],
      ['aileron-right', [0, FULL, 0, 0], up],
      ['elevator', [0, 0, FULL, 0], up],
      ['rudder', [0, 0, 0, FULL], left],
      ['tailwheel', [0, 0, 0, FULL], left],
    ],
    glider: [
      ['aileron-left', [FULL, 0, 0, 0], up],
      ['aileron-right', [0, FULL, 0, 0], up],
      ['elevator', [0, 0, FULL, 0], up],
      ['rudder', [0, 0, 0, FULL], left],
    ],
    timber: [
      ['aileron-left', [FULL, 0, 0, 0], up],
      ['aileron-right', [0, FULL, 0, 0], up],
      ['elevator', [0, 0, FULL, 0], up],
      ['rudder', [0, 0, 0, FULL], left],
      ['tailwheel', [0, 0, 0, FULL], left],
    ],
    stick: [
      ['elevator', [0, 0, FULL, 0], up],
      ['rudder', [0, 0, 0, FULL], left],
      ['tailwheel', [0, 0, 0, FULL], left],
    ],
  };
  if (CASES[craft]) {
    const box = (n) => page.evaluate(`window.__preview.box('${n}')`);
    for (const [name, surf, moved] of CASES[craft]) {
      await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
      const a = await box(name);
      await page.evaluate(`window.__preview.surfaces(${surf.join(',')})`);
      const b = await box(name);
      const mm = moved(a, b) * 1000;
      const ok = mm > 5;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} +20 deg moves its trailing edge ${mm.toFixed(1)} mm the contract's way`);
      if (!ok) {
        process.exitCode = 1;
      }
    }
  }
  /* The published numbers against the drawn vertices, to 2 mm. */
  if (craft === 'sky' || craft === 'cub' || craft === 'glider' || craft === 'bramor' || craft === 'stick' || craft === 'timber') {
    await page.evaluate('window.__preview.launcher(false); window.__preview.chute(0)');
    await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
    await page.evaluate('window.__preview.prop(0)');
    const e = await page.evaluate('window.__preview.extents()');
    const d = await page.evaluate('window.__preview.dims');
    const rows = [
      ['half span', e.xMax, d.span / 2],
      ['nose', e.zMin, d.noseZ],
      ['tail', e.zMax, d.tailZ],
      ['up', e.yMax, d.vHalfUp],
      ['down', -e.yMin, d.vHalfDown],
    ];
    for (const [what, drawn, claimed] of rows) {
      const ok = Math.abs(drawn - claimed) <= 0.002;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: drawn ${drawn.toFixed(4)} m, ${craft.toUpperCase()}_DIMS ${claimed.toFixed(4)} m`);
      if (!ok) {
        process.exitCode = 1;
      }
    }
  }
  /*
   * The Cub's wheels: the lowest drawn vertex of each tyre against the
   * contact points CUB_DIMS gives the physics, to 1 mm, and the prop's
   * spin: a blade pointing up must go right, +x, under a positive step of
   * the shell's spin, which is clockwise seen from the cockpit.
   */
  if (craft === 'cub' || craft === 'stick' || craft === 'timber') {
    await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
    const d = await page.evaluate('window.__preview.dims');
    const blackMesh = { cub: 'cub-black', stick: 'slowstick-black', timber: 'timber-tyres' }[craft];
    const wheels = [
      ['main left', blackMesh, -1, d.contact.mainLeft],
      ['main right', blackMesh, 1, d.contact.mainRight],
      ['tail', 'tyre-tail', 0, d.contact.tail],
    ];
    for (const [what, mesh, side, claimed] of wheels) {
      const drawn = await page.evaluate(`window.__preview.lowest('${mesh}', ${side})`);
      const off = Math.hypot(drawn[0] - claimed[0], drawn[1] - claimed[1], drawn[2] - claimed[2]);
      const ok = off <= 0.001;
      const f = (p) => p.map((c) => c.toFixed(4)).join(', ');
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} wheel lowest point: drawn (${f(drawn)}), ${craft.toUpperCase()}_DIMS (${f(claimed)}) m`);
      if (!ok) {
        process.exitCode = 1;
      }
    }
    const r = d.rest;
    const c = r.contact;
    const f = (p) => p.map((v) => v.toFixed(4)).join(', ');
    console.log(`rest: ${r.pitchDeg.toFixed(2)} deg nose up, CG ${r.cgHeight.toFixed(4)} m over the ground, `
      + `contacts main (${f(c.mainRight)}) tail (${f(c.tail)})`);
    const spin = await page.evaluate('window.__preview.spinProbe()');
    const cw = spin.before[1] > 0 && spin.after[0] > spin.before[0] && spin.axis[2] < -0.99;
    console.log(`${cw ? 'ok  ' : 'FAIL'} prop: axis (${f(spin.axis)}), a blade up at x ${spin.before[0].toFixed(4)} `
      + `goes to x ${spin.after[0].toFixed(4)}: clockwise from the cockpit`);
    if (!cw) {
      process.exitCode = 1;
    }
  }
  /*
   * The Timber's flaps: each lowered to the full 32.7 degrees must drop its
   * trailing edge, the box's bottom, and move it aft, the slotted flap's
   * two motions, and both the same.
   */
  if (craft === 'timber') {
    await page.evaluate('window.__preview.surfaces(0, 0, 0, 0); window.__preview.flaps(0)');
    const box = (n) => page.evaluate(`window.__preview.box('${n}')`);
    for (const name of ['flap-left', 'flap-right']) {
      await page.evaluate('window.__preview.flaps(0)');
      const a = await box(name);
      await page.evaluate(FLAPS_FULL);
      const b = await box(name);
      const down = (a.min[1] - b.min[1]) * 1000;
      const aft = (b.max[2] - a.max[2]) * 1000;
      const ok = down > 20 && aft > -2;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} full lowers its trailing edge ${down.toFixed(1)} mm and moves it ${aft.toFixed(1)} mm aft`);
      if (!ok) {
        process.exitCode = 1;
      }
    }
    await page.evaluate('window.__preview.flaps(0)');
  }
  /*
   * The Radian's folding prop: folded, the disc is gone and every blade
   * vertex lies aft of the prop's plane, but for the 4 mm of blade root
   * and yoke at the hinge, and within 6 cm of the thrust line, along the
   * nose; open, the blades reach the disc's radius in the prop's plane.
   * And the spin's sense, as the Cub's.
   */
  if (craft === 'glider') {
    const d = await page.evaluate('window.__preview.dims');
    const f = (p) => p.map((v) => v.toFixed(4)).join(', ');
    const probe = (omega) => page.evaluate(`(() => {
      window.__preview.prop(${omega});
      return window.__preview.bladeExtent();
    })()`);
    const folded = await probe(0);
    const okFold = folded.fold > 0.999 && !folded.disc && folded.zMin > d.propZ - 0.004 && folded.rMax < 0.06;
    console.log(`${okFold ? 'ok  ' : 'FAIL'} folded: fold ${folded.fold.toFixed(3)}, disc ${folded.disc ? 'shown' : 'hidden'}, `
      + `blades from z ${folded.zMin.toFixed(4)} (the prop's plane ${d.propZ.toFixed(4)}) to ${folded.zMax.toFixed(4)}, `
      + `${folded.rMax.toFixed(4)} m off the thrust line at most`);
    const open = await probe(900);
    const okOpen = open.fold < 0.001 && open.disc && Math.abs(open.rMax - d.propR) < 0.004 && open.zMax - open.zMin < 0.03;
    console.log(`${okOpen ? 'ok  ' : 'FAIL'} open: fold ${open.fold.toFixed(3)}, disc ${open.disc ? 'shown' : 'hidden'}, `
      + `blades reach ${open.rMax.toFixed(4)} m against the disc's ${d.propR.toFixed(4)}, ${((open.zMax - open.zMin) * 1000).toFixed(1)} mm deep`);
    const spin = await page.evaluate('window.__preview.spinProbe()');
    const cw = spin.before[1] > 0 && spin.after[0] > spin.before[0] && spin.axis[2] < -0.99;
    console.log(`${cw ? 'ok  ' : 'FAIL'} prop: axis (${f(spin.axis)}), a blade up at x ${spin.before[0].toFixed(4)} `
      + `goes to x ${spin.after[0].toFixed(4)}: clockwise from the cockpit`);
    if (!okFold || !okOpen || !cw) {
      process.exitCode = 1;
    }
  }
  const cost = await page.evaluate('window.__preview.count()');
  console.log(`${craft}${lite ? ' lite' : ''}: ${cost.draws} draws, ${cost.tris} triangles`);
  if (page.errors.length) {
    console.log(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await page.close();
}
