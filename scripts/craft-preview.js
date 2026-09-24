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
 *   node scripts/craft-preview.js [sky|wing|cub] [outDir] [--lite]
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

const page = await openPage({
  root, width: 1280, height: 800, url: `/tests/browser/craft-preview.html?craft=${craft}${lite ? '&lite=1' : ''}`,
});
try {
  await page.until('window.__previewReady === true', 60000);
  await mkdir(outDir, { recursive: true });
  const scale = craft === 'wing' ? 0.6 : 1;
  for (const [name, surf, cam, blur, rest] of craft === 'cub' ? CUB_VIEWS : VIEWS) {
    const [az, el, dist, tx, ty, tz] = cam;
    await page.evaluate(`window.__preview.rest(${Boolean(rest)})`);
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
    cub: [
      ['aileron-left', [FULL, 0, 0, 0], up],
      ['aileron-right', [0, FULL, 0, 0], up],
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
  if (craft === 'sky' || craft === 'cub') {
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
  if (craft === 'cub') {
    await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
    const d = await page.evaluate('window.__preview.dims');
    const wheels = [
      ['main left', 'cub-black', -1, d.contact.mainLeft],
      ['main right', 'cub-black', 1, d.contact.mainRight],
      ['tail', 'tyre-tail', 0, d.contact.tail],
    ];
    for (const [what, mesh, side, claimed] of wheels) {
      const drawn = await page.evaluate(`window.__preview.lowest('${mesh}', ${side})`);
      const off = Math.hypot(drawn[0] - claimed[0], drawn[1] - claimed[1], drawn[2] - claimed[2]);
      const ok = off <= 0.001;
      const f = (p) => p.map((c) => c.toFixed(4)).join(', ');
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} wheel lowest point: drawn (${f(drawn)}), CUB_DIMS (${f(claimed)}) m`);
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
  const cost = await page.evaluate('window.__preview.count()');
  console.log(`${craft}${lite ? ' lite' : ''}: ${cost.draws} draws, ${cost.tris} triangles`);
  if (page.errors.length) {
    console.log(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await page.close();
}
