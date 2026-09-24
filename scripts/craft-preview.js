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
 *   node scripts/craft-preview.js [sky|wing] [outDir] [--lite]
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

const page = await openPage({
  root, width: 1280, height: 800, url: `/tests/browser/craft-preview.html?craft=${craft}${lite ? '&lite=1' : ''}`,
});
try {
  await page.until('window.__previewReady === true', 60000);
  await mkdir(outDir, { recursive: true });
  const scale = craft === 'sky' ? 1 : 0.6;
  for (const [name, surf, cam, blur] of VIEWS) {
    const [az, el, dist, tx, ty, tz] = cam;
    await page.evaluate(`window.__preview.surfaces(${surf.join(',')})`);
    await page.evaluate(`window.__preview.spin(0.6, ${Boolean(blur)})`);
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
  if (craft === 'sky') {
    const box = (n) => page.evaluate(`window.__preview.box('${n}')`);
    const cases = [
      ['aileron-left', [FULL, 0, 0, 0], (a, b) => b.max[1] - a.max[1]],
      ['aileron-right', [0, FULL, 0, 0], (a, b) => b.max[1] - a.max[1]],
      ['elevator', [0, 0, FULL, 0], (a, b) => b.max[1] - a.max[1]],
      ['rudder-left', [0, 0, 0, FULL], (a, b) => a.min[0] - b.min[0]],
      ['rudder-right', [0, 0, 0, FULL], (a, b) => a.min[0] - b.min[0]],
    ];
    for (const [name, surf, moved] of cases) {
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
  if (craft === 'sky') {
    await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
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
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: drawn ${drawn.toFixed(4)} m, SKY_DIMS ${claimed.toFixed(4)} m`);
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
