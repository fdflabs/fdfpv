/*
 * crash-shots.js: the crash shell's pictures, flown in the real shell.
 *
 *   SIM_GPU=1 node scripts/crash-shots.js --out DIR [--only ID[,ID...]] [--w=1280 --h=720]
 *
 * docs/CRASH-PLAN.md, Phase A item 4: the look of a crash is judged on
 * pictures, and the crash suite's own sheets (tests/crash/sheet.html) draw
 * a Node run's craft pose on a bare map. These are the other half: the
 * page a pilot loads, index.html, with its crash damage setting on, a
 * scenario thrown at a real solid of a real map through window.__crashThrow,
 * and the frames the shell draws from then on: before, impact, the parts in
 * the air, at rest, from a fixed camera beside the spot, plus the FPV
 * picture where the scenario is about the feed. What broke is read back
 * from window.__crash() and written beside each frame as JSON.
 *
 * What it proves and what it does not. The pictures show the shell drawing
 * what the plant reports: the pieces where the plant puts them, the debris
 * on the surface that was hit, the feed failing, the camera changing. Which
 * parts break at which speed is the crash core's tuning, not this, and a
 * scenario whose hit did not break what it aims at still yields its frames
 * (and says so) so the look of whatever did happen can be judged.
 *
 * Frames go to DIR (default ~/.cache/fdfpv-crash-shots), outside the
 * repository, because pictures are not committed (CLAUDE.md), and outside
 * /tmp, which is a small tmpfs here. Exit 0 when every scenario ran and the
 * page logged no console error, 1 otherwise.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * THE SCENARIOS. Each names its aircraft and map, and a `throw`: page side
 * code (a function body, run in the page) that finds a target in the world
 * and returns { at: [x, y, z] the spot, cam: [x, y, z] the observer,
 * throw: the argument for window.__crashThrow, after: optional key letter
 * to press once thrown }. A feed scenario seats the craft instead and
 * returns { seated: true }; its frames are the pilot's own picture.
 */
const SCENARIOS = [
  {
    id: 'quad-gate',
    what: 'a five inch clipping a gate post at 22 m/s: props off',
    airframe: '5inch',
    map: 'custom',
    course: 'tests/fixtures/course-reference.json',
    throw: `
      const s = window.__craftState();
      const posts = window.__crashSolids(s.worldX, s.worldZ, 400, 'gate')
        .filter((c) => !c.box && Math.abs(c.a[0] - c.b[0]) < 0.01 && Math.abs(c.a[2] - c.b[2]) < 0.01);
      const p = posts[0];
      const x = p.a[0], z = p.a[2], y = Math.min(p.a[1], p.b[1]) + 1.0;
      /* Fly past the post so an arm and its prop catch it, not the frame. */
      const ax = 1, az = 0.35;
      const n = Math.hypot(ax, az);
      const dx = ax / n, dz = az / n;
      const off = p.r + 0.12;
      /* Thrown up a little, so it arrives at arm height rather than on the
       * grass in front of the post. */
      const sx = x - dx * 12 - dz * off, sz = z - dz * 12 + dx * off;
      return {
        at: [x + dx * 0.6, y - 0.5, z + dz * 0.6],
        cam: [x - dz * 2.2 - dx * 0.8, y + 0.2, z + dx * 2.2 - dz * 0.8],
        throw: { x: sx, y: y + 0.4, z: sz, yaw: Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: -20, vx: dx * 22, vy: 2.6, vz: dz * 22 },
      };`,
  },
  {
    id: 'quad-wall',
    what: 'a five inch into the face of a wall at 25 m/s: an arm breaks',
    airframe: '5inch',
    map: 'city',
    throw: `
      const s = window.__craftState();
      /* A wall standing on the ground with open air in front of its +z face
       * for the run up. */
      const w = window.__crashSolids(s.worldX, s.worldZ, 600, 'wall').find((c) => {
        if (!c.box || (c.b[0] - c.a[0]) < 4) {
          return false;
        }
        const x = (c.a[0] + c.b[0]) / 2;
        const g = window.__heightAt(x, c.b[2] + 4);
        if (c.a[1] > g + 0.5 || c.b[1] < g + 3) {
          return false;
        }
        for (let d = 0.6; d <= 4.5; d += 0.6) {
          if (!(window.__nearSolid(x, g + 1.6, c.b[2] + d, 0.5) > 0.45)) {
            return false;
          }
        }
        return true;
      });
      const x = (w.a[0] + w.b[0]) / 2;
      const y = window.__heightAt(x, w.b[2] + 4) + 1.6;
      const z = w.b[2];
      return {
        at: [x, y - 0.9, z + 0.5],
        cam: [x + 1.7, y + 0.2, z + 2.3],
        throw: { x, y, z: z + 4.5, yaw: 0, pitch: -25, vx: 0, vy: 0, vz: -25 },
      };`,
  },
  {
    id: 'plane-nose-in',
    what: 'a Cub nosing into the grass at 22 m/s, 50 degrees down: the prop goes',
    airframe: 'cub1400',
    map: 'airfield',
    throw: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ - 10, y = window.__heightAt(x, z) + 5;
      return {
        at: [x - 3.4, y - 5, z],
        cam: [x - 3.4 - 5, y - 3.8, z + 5],
        throw: { x, y, z, yaw: 90, pitch: -50, vx: -22 * Math.cos(50 * Math.PI / 180), vy: -22 * Math.sin(50 * Math.PI / 180), vz: 0 },
      };`,
  },
  {
    id: 'plane-cartwheel',
    what: 'a Skyhunter banked 75 degrees, low and sinking at 18 m/s: the wingtip catches',
    airframe: 'sky1800',
    map: 'airfield',
    throw: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 1.9;
      return {
        at: [x - 6, y - 1.9, z],
        cam: [x - 6, y + 0.6, z + 8],
        throw: { x, y, z, yaw: 90, pitch: -8, roll: 75, vx: -17, vy: -3, vz: 0 },
      };`,
  },
  {
    id: 'plane-tree',
    what: 'a Timber flown into a tree crown at 13 m/s: caught in the branches',
    airframe: 'timber1500',
    map: 'swiss2',
    throw: `
      const s = window.__craftState();
      const crowns = window.__crashSolids(s.worldX, s.worldZ, 3000, 'canopy').filter((c) => !c.box && c.r > 2);
      const c = crowns[0];
      const x = c.a[0], y = c.a[1], z = c.a[2];
      return {
        at: [x + c.r * 0.6, y, z],
        cam: [x + c.r * 1.3 + 4, y + 0.8, z + c.r * 0.9 + 4],
        throw: { x: x + c.r + 7, y: y + 0.4, z, yaw: 90, pitch: -3, vx: -13, vy: -0.5, vz: 0 },
      };`,
  },
  {
    id: 'float-nose-dig',
    what: 'a Cub on floats landing nose down at 15 m/s: the bows dig in',
    airframe: 'cub1400f',
    map: 'swiss2',
    throw: `
      const w = window.__crashWater()[0];
      const x = w.spawn.x, z = w.spawn.z, y = w.surfaceY + 1.4;
      const fx = -Math.sin(w.spawn.yaw), fz = -Math.cos(w.spawn.yaw);
      return {
        at: [x + fx * 3, y - 1.2, z + fz * 3],
        cam: [x + fx * 3 - fz * 6, y + 0.6, z + fz * 3 + fx * 6],
        throw: { x, y, z, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: -14, vx: fx * 15, vy: -2.5, vz: fz * 15 },
      };`,
  },
  {
    id: 'bramor-chute-trees',
    what: 'a Bramor coming down under its chute into a tree',
    airframe: 'bramor2300',
    map: 'swiss2',
    throw: `
      const s = window.__craftState();
      const crowns = window.__crashSolids(s.worldX, s.worldZ, 3000, 'canopy').filter((c) => !c.box && c.r > 2);
      const c = crowns[0];
      const x = c.a[0], y = c.a[1] + c.r + 9, z = c.a[2];
      return {
        at: [x, c.a[1] + c.r, z],
        cam: [x + 9, c.a[1] + c.r + 3, z + 9],
        throw: { x, y, z, yaw: 0, pitch: 0, vx: 0, vy: -1, vz: -9 },
        after: 'P',
      };`,
    restMs: 12000,
  },
  {
    id: 'fpv-camera-knocked',
    what: 'the FPV picture when the camera is knocked askew, then the antenna torn off, then the pack ejected',
    airframe: '5inch',
    map: 'custom',
    course: 'tests/fixtures/course-reference.json',
    throw: `
      /* Sat on the grass at the start, looking down the track, so the
       * failures are the only thing that changes in the picture. */
      const s = window.__craftState();
      window.__placeCraft(s.worldX, s.worldY + 1, s.worldZ);
      window.__seatCraft('flat');
      window.__setCam(null);
      return { seated: true };`,
  },
];

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) {
    return hit.slice(name.length + 3);
  }
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outArg = argValue('out', join(homedir(), '.cache', 'fdfpv-crash-shots'));
const outDir = isAbsolute(outArg) ? outArg : join(root, outArg);
const only = argValue('only', '');
const W = Number(argValue('w', 1280));
const H = Number(argValue('h', 720));

function seeds(sc) {
  const out = [];
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, sc.airframe),
    airframeAsked: true,
    map: sc.map,
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
  };
  out.push(`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    /* The weight slider's first flight hint, which sits over the middle
     * of every frame until it is answered. */
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`);
  return out;
}

async function courseSeed(sc) {
  if (!sc.course) {
    return [];
  }
  const doc = await readFile(join(root, sc.course), 'utf8');
  const cls = JSON.parse(doc).trackClass;
  const key = cls === 'micro' ? 'webfpv.trackbuilder.autosave.micro.v1'
    : cls === 'wing' ? 'webfpv.trackbuilder.autosave.wing.v1'
      : 'webfpv.trackbuilder.autosave.v1';
  return [`try { localStorage.setItem(${JSON.stringify(key)}, JSON.stringify(${doc})); } catch (e) { /* refused */ }`];
}

async function shoot(page, name, meta) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  const state = await page.evaluate('JSON.stringify({ crash: window.__crash(), craft: (() => { const s = window.__craftState(); return { x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, up: s.up, banner: s.banner }; })() })');
  await writeFile(join(outDir, `${name}.json`), `${JSON.stringify({ ...meta, ...JSON.parse(state) }, null, 1)}\n`);
  return JSON.parse(state);
}

async function run(sc) {
  const page = await openPage({ root, width: W, height: H, seed: [...seeds(sc), ...await courseSeed(sc)] });
  const log = [];
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready', 120000);
    await page.sleep(1500);
    const mapNow = await page.evaluate('window.__map().id');
    if (mapNow !== sc.map) {
      throw new Error(`the page seated map ${mapNow}, not ${sc.map}`);
    }
    const plan = await page.evaluate(`(() => { ${sc.throw} })()`);
    if (plan.seated) {
      await page.sleep(600);
      await shoot(page, `${sc.id}-1-before`, { scenario: sc.id, frame: 'before' });
      await fpvSequence(page, sc, log);
      return log;
    }
    const cam = plan.cam;
    const at = plan.at;
    const setCam = cam
      ? `window.__setCam(${cam.join(',')}, ${at.join(',')}, 55)`
      : 'window.__setCam(null)';
    const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true })}))`);
    await page.evaluate(setCam);
    await page.sleep(400);
    log.push(`plan: at ${at.map((v) => v.toFixed(2)).join(',')} throw ${JSON.stringify(plan.throw)}`);
    log.push(`thrown ${thrown}`);
    if (plan.after) {
      await page.tap(`Key${plan.after}`);
    }
    const before = await shoot(page, `${sc.id}-1-before`, { scenario: sc.id, frame: 'before' });
    await page.evaluate('window.__releasePose()');
    log.push(`before: events ${before.crash.events}`);
    /* Impact: the first frame the plant has reported damage, or the first
     * contact the craft's speed shows, whichever comes first. */
    const t0 = Date.now();
    let impact = null;
    while (Date.now() - t0 < 6000) {
      const c = await page.evaluate('JSON.stringify(window.__crash())').then(JSON.parse);
      if (c.events > 0) {
        impact = c;
        break;
      }
      await page.sleep(15);
    }
    log.push(impact ? `impact after ${Date.now() - t0} ms` : 'no damage event within 6 s');
    await shoot(page, `${sc.id}-2-impact`, { scenario: sc.id, frame: 'impact' });
    await page.sleep(260);
    const parts = await shoot(page, `${sc.id}-3-parts`, { scenario: sc.id, frame: 'parts' });
    log.push(`parts: ${parts.crash.pieces.map((p) => p.kind).join(',') || 'none'}; free ${parts.crash.freeBodies}; flags ${parts.crash.flagNames.join(',')}`);
    /* At rest: nothing moving for half a second, or the scenario's limit. */
    const restLimit = sc.restMs ?? 7000;
    const t1 = Date.now();
    let still = 0;
    while (Date.now() - t1 < restLimit) {
      const s = await page.evaluate('JSON.stringify({ free: window.__crash().freeBodies, speed: window.__craftState().speed })').then(JSON.parse);
      still = s.free === 0 && s.speed < 0.2 ? still + 1 : 0;
      if (still >= 5) {
        break;
      }
      await page.sleep(100);
    }
    const rest = await shoot(page, `${sc.id}-4-rest`, { scenario: sc.id, frame: 'rest' });
    log.push(`rest after ${Date.now() - t1} ms: wrecked ${rest.crash.wrecked}, pieces ${rest.crash.pieces.map((p) => p.kind).join(',') || 'none'}, flags ${rest.crash.flagNames.join(',')}, banner ${JSON.stringify(rest.craft.banner)}`);
    /* And what the pilot sees now: the FPV lens, or the chase camera if the
     * feed died. */
    await page.evaluate('window.__setCam(null)');
    await page.sleep(1800);
    const pilot = await shoot(page, `${sc.id}-5-pilot`, { scenario: sc.id, frame: 'pilot' });
    log.push(`pilot view: chase ${pilot.crash.chase}, feed ${JSON.stringify(pilot.crash.feed)}`);
    return log;
  } finally {
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    const refused = page.errors.length - errs.length;
    log.push(`console errors ${errs.length}${refused ? ` (plus ${refused} refused connections to an absent local board)` : ''}`);
    for (const e of errs) {
      log.push(`  ERR ${e}`);
    }
    run.errors = (run.errors ?? 0) + errs.length;
    await page.close();
  }
}

/* The feed failing, one failure at a time, from the pilot's seat. */
async function fpvSequence(page, sc, log) {
  const partIndex = async (kind) => page.evaluate(`window.__crash().parts.indexOf(${JSON.stringify(kind)})`);
  const camera = await partIndex('camera');
  const antenna = await partIndex('antenna');
  const battery = await partIndex('battery');
  log.push(`camera ${await page.evaluate(`window.__crashSetDamage(${camera}, 0.6)`)}`);
  await page.sleep(400);
  await shoot(page, `${sc.id}-2-knocked`, { scenario: sc.id, frame: 'camera knocked' });
  log.push(`antenna ${await page.evaluate(`window.__crashBreak(${antenna})`)}`);
  await page.sleep(1100);
  await shoot(page, `${sc.id}-3-antenna`, { scenario: sc.id, frame: 'antenna lost' });
  log.push(`battery ${await page.evaluate(`window.__crashBreak(${battery})`)}`);
  await page.sleep(120);
  const black = await shoot(page, `${sc.id}-4-battery`, { scenario: sc.id, frame: 'battery ejected' });
  log.push(`feed ${JSON.stringify(black.crash.feed)} flags ${black.crash.flagNames.join(',')}`);
  await page.sleep(2200);
  const chase = await shoot(page, `${sc.id}-5-chase`, { scenario: sc.id, frame: 'chase after the feed died' });
  log.push(`chase ${chase.crash.chase}, wrecked ${chase.crash.wrecked}, banner ${JSON.stringify(chase.craft.banner)}`);
}

await mkdir(outDir, { recursive: true });
const want = only ? new Set(only.split(',')) : null;
let failed = 0;
for (const sc of SCENARIOS) {
  if (want && !want.has(sc.id)) {
    continue;
  }
  console.log(`\n${sc.id}: ${sc.what}`);
  try {
    const log = await run(sc);
    for (const l of log) {
      console.log(`  ${l}`);
    }
  } catch (e) {
    failed += 1;
    console.log(`  FAILED ${e.message}`);
  }
}
console.log(`\nframes in ${outDir}; ${failed} scenario(s) failed to run; ${run.errors ?? 0} console error(s)`);
process.exit(failed || run.errors ? 1 : 0);
