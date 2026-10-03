/*
 * hangarcard.js: the Hangar hub's picture, drawn by the game.
 *
 * Home's three hubs each wear a frame of the real renderer (src/ui/ui.js
 * HUBS): Operations Itaipu's poster, Flight Club the Swiss valley's. The
 * Hangar's is an aircraft on the bench: the Turbo Timber, the trainer a
 * new pilot is seated in (FIRST_AIRFRAME), three quarters from the front
 * on the craft preview's plain stage under the showcase's lights, through
 * the game's own post pass (tests/browser/craft-preview.html). No AI art:
 * the pictures on the front door are the game's (docs/redesign/PLAN.md).
 *
 * REGENERATE, DO NOT EDIT, like scripts/gatecards.js:
 *
 *     npm run gen:hangarcard
 *
 * Writes assets/gate/hangar.jpg, 900 by 560, the gate pictures' size.
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
import { writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'assets', 'gate', 'hangar.jpg');
const W = 900;
const H = 560;

const page = await openPage({ root, width: W, height: H, url: '/tests/browser/craft-preview.html?craft=timber' });
try {
  await page.until('window.__previewReady === true', 60000);
  await page.evaluate('window.__preview.launcher(false); window.__preview.chute(0); window.__preview.flaps(0); window.__preview.gear(0); window.__preview.sun()');
  await page.evaluate('window.__preview.rest(true)');
  await page.evaluate('window.__preview.surfaces(0, 0, 0, 0)');
  await page.evaluate('window.__preview.spin(0.6, false)');
  /* Azimuth, elevation (degrees), distance, target (metres): the craft
   * preview's three quarter front, a little further out so the whole
   * airframe sits in the card's picture with room above it. */
  await page.evaluate('window.__preview.view(-35, 16, 3.6, 0, 0.05, 0.05)');
  await page.sleep(500);
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  await writeFile(out, Buffer.from(data, 'base64'));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  if (errs.length) {
    throw new Error(`page errors: ${errs.slice(0, 3).join(' | ')}`);
  }
  console.log(`wrote ${out}`);
} finally {
  await page.close();
}
