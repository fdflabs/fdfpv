/*
 * frames.js: the crash suite's pictures, four per scenario, in headless
 * Chrome on the map the scenario names, then the contact sheets.
 *
 * Called by scripts/crash-suite.js --sheets with the report it just wrote;
 * or on its own against a report on disk:
 *
 *   SIM_GPU=1 node tools/crash/frames.js [DIR]
 *
 * Each scenario is posed from its recorded trace (report.json samples,
 * every 20 ms) at four moments: before (400 ms ahead of the impact), the
 * impact, just after (150 ms on) and at rest (or the end of the run),
 * through a chase camera that sits behind the approach and off to one
 * side, so the thing it hit is in frame. One page per map and aircraft,
 * because a map is the expensive part. Frames go to DIR/frames, sheets to
 * DIR/sheets via tools/crash/sheet.py. Pictures are not committed.
 *
 * SIM_GPU=1 renders on this machine's GPU (tests/lib/page.js); without it
 * Chrome's software rasteriser draws the same frames far more slowly.
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

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../../tests/lib/page.js';
import { airframeById } from '../../configs/airframes.js';

/* Chrome leaves its own scratch directories beside the profile page.js
 * removes. The directory is the suite's alone, so they go too. */
async function sweepChromeScratch(dir) {
  for (const name of await readdir(dir)) {
    if (name.startsWith('com.google.Chrome.')) {
      await rm(join(dir, name), { recursive: true, force: true });
    }
  }
}

const W = 960;
const H = 540;

/* The pose nearest a moment, from the 20 ms samples. */
function poseAt(samples, ms) {
  let best = samples[0];
  for (const r of samples) {
    if (r[0] <= ms) {
      best = r;
    } else {
      break;
    }
  }
  return best;
}

/* A chase camera: behind the approach, raised, and swung 35 deg to the
 * right of it, at a distance that frames the aircraft and what it met. */
function chase(scn, pose, dir) {
  const d = airframeById(scn.airframe).dims;
  const span = Math.max(d.bodyWidth ?? 0.3, d.bodyLength ?? 0.3, 2 * (d.arm + (d.hullR ?? d.propR)));
  const dist = Math.max(1.4, 3.2 * span);
  const a = 35 * Math.PI / 180;
  const bx = -dir[0] * Math.cos(a) - dir[1] * Math.sin(a);
  const by = dir[0] * Math.sin(a) - dir[1] * Math.cos(a);
  const pos = [pose[1], pose[2], pose[3]];
  return {
    pos,
    quat: [pose[4], pose[5], pose[6], pose[7]],
    cam: [pos[0] + bx * dist, pos[1] + by * dist, pos[2] + 0.4 * dist],
    look: pos,
    fov: 50,
  };
}

export async function takeSheets({ root, out, report }) {
  process.env.TMPDIR = process.env.TMPDIR ?? join(homedir(), '.cache', 'fdfpv-crash-tmp');
  await mkdir(process.env.TMPDIR, { recursive: true });
  const framesDir = join(out, 'frames');
  await mkdir(framesDir, { recursive: true });
  const groups = new Map();
  for (const s of report.scenarios) {
    if (!s.frames) {
      continue;
    }
    const water = s.craft === 'timberf' || s.craft === 'cubf';
    const key = `${s.map}|${s.airframe}|${water ? 1 : 0}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(s);
  }
  for (const [key, list] of groups) {
    const [map, airframe, water] = key.split('|');
    const page = await openPage({ root, url: `/tests/crash/sheet.html?map=${map}&craft=${airframe}&water=${water}`, width: W, height: H });
    try {
      await page.until('window.__crashSheet', 60000);
      const built = await page.evaluate('window.__crashSheet.ready');
      for (const s of list) {
        await page.evaluate(`window.__crashSheet.solids(${JSON.stringify(s.solids)}, ${JSON.stringify(s.sheetGround ?? null)})`);
        const before = poseAt(s.samples, s.frames.before);
        const hv = Math.hypot(before[8], before[9]);
        let dir = hv > 0.5 ? [before[8] / hv, before[9] / hv] : null;
        if (!dir) {
          /* Standing still before it: the heading instead. */
          const [w, x, y, z] = [before[4], before[5], before[6], before[7]];
          const fx = 1 - 2 * (y * y + z * z);
          const fy = 2 * (x * y + w * z);
          const fl = Math.hypot(fx, fy) || 1;
          dir = [fx / fl, fy / fl];
        }
        for (const which of ['before', 'impact', 'after', 'rest']) {
          const pose = poseAt(s.samples, s.frames[which]);
          await page.evaluate(`window.__crashSheet.show(${JSON.stringify(chase(s, pose, dir))})`);
          const shot = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
          await writeFile(join(framesDir, `${s.id}-${which}.jpg`), Buffer.from(shot.data, 'base64'));
        }
      }
      console.log(`frames: ${map} (${built.map}) with ${airframe}, ${list.length} scenarios`);
      if (page.errors.length) {
        console.log(`  page errors: ${page.errors.slice(0, 3).join(' | ')}`);
      }
    } finally {
      await page.close();
      await sweepChromeScratch(process.env.TMPDIR);
    }
  }
  const sheetsDir = join(out, 'sheets');
  await mkdir(sheetsDir, { recursive: true });
  const r = spawnSync('python3', [join(root, 'tools/crash/sheet.py'), join(out, 'summary.json'), framesDir, sheetsDir], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status !== 0) {
    throw new Error(`sheet.py failed: ${r.stderr}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const out = resolve(process.argv[2] ?? join(homedir(), '.cache', 'fdfpv-crash'));
  const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
  await takeSheets({ root, out, report });
}
