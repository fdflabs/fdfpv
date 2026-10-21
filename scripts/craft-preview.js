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
 *   node scripts/craft-preview.js [bramor] [outDir] [--lite]
 *
 * The Bramor is the one fixed wing with a builder of its own here
 * (tests/browser/craft-preview.js BUILDERS); the quads and the Striker
 * are drawn by the shell's own builders.
 *
 * Pictures go to outDir, by default a directory under the system temp,
 * and are not committed (CLAUDE.md).
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
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const lite = process.argv.includes('--lite');
const craft = args[0] ?? 'bramor';
const outDir = args[1] ?? join(tmpdir(), `craft-preview-${craft}`);

/* Full throw for the pictures: 20 degrees. */
const FULL = (20 * Math.PI) / 180;

/*
 * Each view: a name, the surfaces (left aileron, right aileron, elevator,
 * rudder), and the camera (azimuth, elevation, distance, target x y z,
 * fov).
 */
const NEUTRAL = [0, 0, 0, 0];

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
  ['motor-side', NEUTRAL, [90, 4, 0.55, 0, 0.07, 0.30], false, false, 900],
  ['motor-rear', NEUTRAL, [180, 10, 0.55, 0, 0.08, 0.35], false, false, 900],
  ['motor-above', NEUTRAL, [-160, 55, 0.6, 0, 0.07, 0.28], false, false, 900],
  ['motor-below', NEUTRAL, [-150, -25, 0.6, 0, 0.05, 0.28], false, false, 900],
  ['motor-folded-side', NEUTRAL, [90, 4, 0.55, 0, 0.07, 0.30], false, false, 0],
  ['winglet', NEUTRAL, [-120, 15, 1.4, 1.1, 0.1, 0.1], false, false, 900],
  ['chute-open', NEUTRAL, [-120, 5, 9.0, 0, 1.6, 0.1], false, false, 0, 'window.__preview.chute(1)'],
  ['chute-opening', NEUTRAL, [-120, 5, 9.0, 0, 1.6, 0.1], false, false, 0, 'window.__preview.chute(0.3)'],
  ['chute-down', NEUTRAL, [-60, 30, 6.0, 0, 0, 1.0], false, false, 0, 'window.__preview.chute(1, true)'],
  ['launcher', NEUTRAL, [-110, 12, 7.0, 0, 0.6, 1.2], false, false, 0, 'window.__preview.launcher(true)'],
  ['launcher-front', NEUTRAL, [-25, 10, 6.0, 0, 0.8, 0.6], false, false, 0, 'window.__preview.launcher(true)'],
];

const page = await openPage({
  root, width: 1280, height: 800, url: `/tests/browser/craft-preview.html?craft=${craft}${lite ? '&lite=1' : ''}`,
});
try {
  await page.until('window.__previewReady === true', 60000);
  await mkdir(outDir, { recursive: true });
  const scale = 1;
  const views = BRAMOR_VIEWS;
  for (const [name, surf, cam, blur, rest, omega, setup] of views) {
    const [az, el, dist, tx, ty, tz] = cam;
    await page.evaluate('window.__preview.launcher(false); window.__preview.chute(0); window.__preview.sun()');
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
   * The surface convention as numbers: each elevon alone to +20 degrees
   * must move its part's box the way the contract says, trailing edge up
   * lifting the box's top.
   */
  await page.evaluate('window.__preview.rest(false)');
  const up = (a, b) => b.max[1] - a.max[1];
  const CASES = {
    bramor: [
      ['elevon-left', [FULL, 0, 0, 0], up],
      ['elevon-right', [0, FULL, 0, 0], up],
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
  if (craft === 'bramor') {
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
  const cost = await page.evaluate('window.__preview.count()');
  console.log(`${craft}${lite ? ' lite' : ''}: ${cost.draws} draws, ${cost.tris} triangles`);
  if (page.errors.length) {
    console.log(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await page.close();
}
