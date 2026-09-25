/*
 * crash-feel.js: the crashes a pilot meets, staged in the real shell, with
 * their numbers and a contact sheet each.
 *
 *   SIM_GPU=1 npm run crash:feel -- [--out DIR] [--only ID[,ID...]] [--no-audit]
 *
 * FEEL_DEBUG=1 prints each step. --only skips the drawing check.
 *
 * docs/CRASH-PLAN.md, "The finish line, changed by the owner": the crash
 * loop ends when the crashes a pilot meets look and feel right. This loads
 * index.html with crash damage on, seats each aircraft by its full id on
 * the map where a pilot would meet the crash, throws it with
 * window.__crashThrow and lets the plant run. It records what broke and
 * when (window.__crashLog), the hardest load against its limit, and how
 * the wreck came to rest: how long it took, how far it slid, which way up
 * it lies, whether it is still creeping or jittering, and whether any
 * piece is drawn sunk into the surface or rests clear of it. A wreck the
 * shell perches (a plane with its pack out) or parks (a quad on its back)
 * is at rest; so is one the shell stops stepping for any other reason,
 * which the report names. Four frames go on a sheet (before, impact, the
 * parts, at rest) from a chase camera, the shell's own for a plane and
 * one the script stands behind a quad, and a fifth close on the worst
 * piece when one is sunk or floating.
 *
 * Before the scenarios it checks the wreck's drawing on every airframe
 * (the owner's Bombshell bug, 2026-09-25): break every part and fail if
 * any piece carries a vertex farther than DRAW_BOUND outside its part's
 * hull box (window.__wreckAudit).
 *
 * The numbers are evidence for a judgement, not bands: the judgement is
 * made on the sheets against docs/CRASH-REFERENCES.md. The script fails
 * (exit 1) only when a scenario could not be staged, the drawing check
 * fails, or the page logged a console error.
 *
 * Frames and sheets go to DIR (default ~/.cache/fdfpv-crash-feel), outside
 * the repository, because pictures are not committed (CLAUDE.md). One
 * browser at a time.
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
import { AIRFRAMES, airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* How far a drawn piece's farthest vertex may stand outside its part's
 * grown hull box, metres. A triangle goes to the part that holds its
 * centre, so a piece may reach past its box by a seam triangle's size:
 * with every part of every airframe broken the worst is 0.10 m (a float's
 * struts). The Bombshell's slab, a hidden box drawn, stood 0.57 m out, and
 * the Slow Stick's whole fuselage stick on its boom 0.52 m. */
const DRAW_BOUND = 0.15;

/* A wreck is at rest when the craft moves slower than this, m/s, with no
 * free part flying, for REST_HOLD_S of sim time; a scenario that has not
 * come to rest by REST_LIMIT_S is reported as still moving. */
const REST_SPEED = 0.15;
const REST_HOLD_S = 0.6;
const REST_LIMIT_S = 14;
/* After rest, how long the wreck is watched for creep and jitter. */
const WATCH_S = 2;

/*
 * THE SCENARIOS. Each seats an aircraft by its full id on a map and runs a
 * `plan`: page side code (a function body) that finds the spot and returns
 * { throw: the argument for window.__crashThrow, dir: [x, z] the direction
 * of travel, what: a line on where it aimed }. `chase` is the camera: 'shell'
 * for a plane's own chase view, 'script' for one this script stands behind
 * the craft (a quad has no chase view until its feed dies).
 */
const THROWS = {
  /* Level at `speed` past a point P, whose side is `side` metres to the
   * left of the track (negative: right), from `run` metres out. */
  past: `(P, dir, side, speed, run, y) => {
    const fx = dir[0], fz = dir[1];
    const lx = fz, lz = -fx;
    const x = P[0] - lx * side - fx * run, z = P[2] - lz * side - fz * run;
    return { x, y, z, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: 0, vx: fx * speed, vy: 0, vz: fz * speed };
  }`,
};

const SCENARIOS = [
  {
    id: 'cub-pole',
    item: 1,
    what: 'a Cub at 14 m/s, its left wingtip catching a power pole in the swiss2 valley',
    airframe: 'cub1400',
    map: 'swiss2',
    chase: 'shell',
    plan: `
      const past = ${THROWS.past};
      const s = window.__craftState();
      const semi = ${airframeById('cub1400').dims.bodyWidth / 2};
      for (const p of window.__crashSolids(s.worldX, s.worldZ, 800, 'pole')) {
        const g = window.__heightAt(p.a[0], p.a[2]);
        const y = g + 2.2;
        if (Math.max(p.a[1], p.b[1]) < y + 1) {
          continue;
        }
        for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = past(p.a, dir, semi * 0.75, 14, 9, y);
          let clear = true;
          /* Open air along the run, up to 2 m short of the pole itself. */
          for (let d = 0; d <= 7 && clear; d += 1) {
            const x = t.x + dir[0] * d, z = t.z + dir[1] * d;
            clear = window.__nearSolid(x, y, z, 0.8) > 0.75 && window.__heightAt(x, z) < y - 1.4;
          }
          if (clear) {
            return { throw: t, dir, at: p.a, what: 'pole at ' + p.a.map((v) => v.toFixed(1)).join(',') + ', radius ' + p.r.toFixed(2) + ' m' };
          }
        }
      }
      return null;`,
  },
  {
    id: 'cub-corner',
    item: 1,
    what: 'a Cub at 14 m/s, its left wingtip catching a building corner in the swiss2 village',
    airframe: 'cub1400',
    map: 'swiss2',
    chase: 'shell',
    plan: `
      const past = ${THROWS.past};
      const s = window.__craftState();
      const semi = ${airframeById('cub1400').dims.bodyWidth / 2};
      for (const w of window.__crashSolids(s.worldX, s.worldZ, 3000, 'wall')) {
        if (!w.box || w.b[1] - w.a[1] < 3.5 || w.b[0] - w.a[0] < 4 || w.b[2] - w.a[2] < 4) {
          continue;
        }
        /* Along -z past the +x,+z corner, the left tip 0.15 m inside it. */
        const P = [w.b[0], 0, w.b[2]];
        const dir = [0, -1];
        const g = window.__heightAt(P[0] + 0.5, P[2] + 3);
        const y = Math.max(w.a[1] + 1.8, g + 1.8);
        if (y > w.b[1] - 0.8) {
          continue;
        }
        const t = past(P, dir, semi - 0.15, 14, 9, y);
        let clear = true;
        /* Open air along the run, up to 2 m short of the corner. */
        for (let d = 0; d <= 7 && clear; d += 0.5) {
          const x = t.x + dir[0] * d, z = t.z + dir[1] * d;
          clear = window.__nearSolid(x, y, z, 0.8) > 0.75 && window.__heightAt(x, z) < y - 1.2;
        }
        if (clear) {
          return { throw: t, dir, at: P, what: 'wall box ' + w.a.map((v) => v.toFixed(1)).join(',') + ' to ' + w.b.map((v) => v.toFixed(1)).join(',') };
        }
      }
      return null;`,
  },
  {
    id: 'sky-cartwheel',
    item: 2,
    what: 'a Skyhunter banked 75 degrees, low and sinking at 17 m/s: the wingtip catches the grass',
    airframe: 'sky1800',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 1.9;
      return { throw: { x, y, z, yaw: 90, pitch: -8, roll: 75, vx: -17, vy: -3, vz: 0 }, dir: [-1, 0], what: 'grass beside the strip' };`,
  },
  {
    id: 'timber-cartwheel',
    item: 2,
    what: 'a Timber banked 70 degrees, low and sinking at 13 m/s: the wingtip catches the grass',
    airframe: 'timber1500',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 1.6;
      return { throw: { x, y, z, yaw: 90, pitch: -8, roll: 70, vx: -13, vy: -2.5, vz: 0 }, dir: [-1, 0], what: 'grass beside the strip' };`,
  },
  {
    id: 'cub-stall',
    item: 3,
    what: 'a Cub at 8 m, slow and nose high with the throttle closed: it stalls and mushes in',
    airframe: 'cub1400',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 8;
      return { throw: { x, y, z, yaw: 90, pitch: 18, vx: -7, vy: 0, vz: 0 }, dir: [-1, 0], what: '8 m over the grass at 7 m/s' };`,
  },
  {
    id: 'sky-stall',
    item: 3,
    what: 'a Skyhunter at 8 m, slow and nose high with the throttle closed: it stalls and mushes in',
    airframe: 'sky1800',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 8;
      return { throw: { x, y, z, yaw: 90, pitch: 18, vx: -8, vy: 0, vz: 0 }, dir: [-1, 0], what: '8 m over the grass at 8 m/s' };`,
  },
  {
    id: 'cub-nose-over',
    item: 4,
    what: 'a Cub on its take off roll at 6 m/s on the grass, full power and the stick held full forward: the tail comes up too early and it goes over its nose',
    airframe: 'cub1400',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      /* Level, its wheels just clear of the grass. */
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + ${airframeById('cub1400').dims.vHalfDown + 0.03};
      return { throw: { x, y, z, yaw: 90, pitch: 0, vx: -6, vy: 0, vz: 0 }, dir: [-1, 0], stick: [0, -1, 0, 1], what: 'mown grass, level on its wheels' };`,
  },
  {
    id: 'timber-nose-over',
    item: 4,
    what: 'a Timber on its take off roll at 6 m/s on the grass, full power and the stick held full forward: the tail comes up too early and it goes over its nose',
    airframe: 'timber1500',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      /* Level, its wheels just clear of the grass. */
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + ${airframeById('timber1500').dims.vHalfDown + 0.03};
      return { throw: { x, y, z, yaw: 90, pitch: 0, vx: -6, vy: 0, vz: 0 }, dir: [-1, 0], stick: [0, -1, 0, 1], what: 'mown grass, level on its wheels' };`,
  },
  {
    id: 'float-nose-dig',
    item: 5,
    what: 'a Cub on floats landing nose low at 15 m/s on the lake: the bows dig in',
    airframe: 'cub1400f',
    map: 'swiss2',
    chase: 'shell',
    plan: `
      const w = window.__crashWater()[0];
      const x = w.spawn.x, z = w.spawn.z, y = w.surfaceY + 1.4;
      const fx = -Math.sin(w.spawn.yaw), fz = -Math.cos(w.spawn.yaw);
      return { throw: { x, y, z, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: -14, vx: fx * 15, vy: -2.5, vz: fz * 15 }, dir: [fx, fz], what: 'the lake, surface y ' + w.surfaceY.toFixed(2) };`,
  },
  ...[15, 30].map((v) => ({
    id: `quad-gate-${v}`,
    item: 6,
    what: `a five inch clipping a gate post at ${v} m/s with an arm`,
    airframe: '5inch',
    map: 'custom',
    trackFile: 'tests/fixtures/course-reference.json',
    chase: 'script',
    plan: `
      const s = window.__craftState();
      const posts = window.__crashSolids(s.worldX, s.worldZ, 400, 'gate')
        .filter((c) => !c.box && Math.abs(c.a[0] - c.b[0]) < 0.01 && Math.abs(c.a[2] - c.b[2]) < 0.01);
      const p = posts[0];
      const x = p.a[0], z = p.a[2], y = Math.min(p.a[1], p.b[1]) + 1.0;
      const ax = 1, az = 0.35;
      const n = Math.hypot(ax, az);
      const dx = ax / n, dz = az / n;
      /* The centre passes 7 cm outside the post: an arm and its prop are
       * across it however the quad is turned. */
      const off = p.r + 0.07;
      const sx = x - dx * 8 - dz * off, sz = z - dz * 8 + dx * off;
      /* Thrown up a little so it arrives at arm height, not on the grass. */
      const t = 8 / ${v};
      return { throw: { x: sx, y: y + 0.4, z: sz, yaw: Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: -20, vx: dx * ${v}, vy: 9.81 * t / 2 - 0.4 / t, vz: dz * ${v} }, dir: [dx, dz], at: p.a, stick: [0, 0, 0, 0.3], what: 'gate post radius ' + p.r.toFixed(3) + ' m, props turning at a third of the throttle' };`,
  })),
  {
    id: 'quad-wall',
    item: 6,
    what: 'a five inch into the face of a wall at 25 m/s',
    airframe: '5inch',
    map: 'city',
    chase: 'script',
    plan: `
      const s = window.__craftState();
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
      return { throw: { x, y, z: w.b[2] + 4.5, yaw: 0, pitch: -25, vx: 0, vy: 0, vz: -25 }, dir: [0, -1], what: 'wall face at z ' + w.b[2].toFixed(1) };`,
  },
  {
    id: 'bombshell-ground',
    item: 7,
    what: 'the Bombshell diving into the grass at 15 m/s, 30 degrees down',
    airframe: 'bombshell1118',
    map: 'airfield',
    chase: 'shell',
    plan: `
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 10, y = window.__heightAt(x, z) + 3;
      const a = 30 * Math.PI / 180;
      return { throw: { x, y, z, yaw: 90, pitch: -30, vx: -15 * Math.cos(a), vy: -15 * Math.sin(a), vz: 0 }, dir: [-1, 0], what: 'mown grass' };`,
  },
  {
    id: 'bombshell-roof',
    item: 7,
    what: 'the Bombshell flown hard onto a metal roof at 12 m/s, 40 degrees down',
    airframe: 'bombshell1118',
    map: 'swiss2',
    chase: 'shell',
    plan: `
      const roofs = (window.__roofs() || []).filter((r) => r.material === 'metal');
      const s = window.__craftState();
      roofs.sort((u, v) => Math.hypot(u.x - s.worldX, u.z - s.worldZ) - Math.hypot(v.x - s.worldX, v.z - s.worldZ));
      for (const r of roofs) {
        const top = window.__surface(r.x, r.z, 1e4);
        const a = 40 * Math.PI / 180;
        /* Along the ridge, from 2.5 m out, so it lands on the roof: the
         * Bombshell floats, and from farther out it glides clean over. */
        const along = r.hd >= r.hw;
        const fx = along ? 0 : 1, fz = along ? 1 : 0;
        const x = r.x - fx * 2.5 * Math.cos(a), z = r.z - fz * 2.5 * Math.cos(a);
        const y = top + 2.5 * Math.sin(a) + 0.3;
        if (!(window.__nearSolid(x, y, z, 0.8) > 0.75)) {
          continue;
        }
        return { throw: { x, y, z, yaw: Math.atan2(-fx, -fz) * 180 / Math.PI, pitch: -40, vx: fx * 12 * Math.cos(a), vy: -12 * Math.sin(a), vz: fz * 12 * Math.cos(a) }, dir: [fx, fz], what: 'metal roof at ' + r.x.toFixed(0) + ',' + r.z.toFixed(0) + ', top y ' + top.toFixed(2) };
      }
      return null;`,
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

const outArg = argValue('out', join(homedir(), '.cache', 'fdfpv-crash-feel'));
const outDir = isAbsolute(outArg) ? outArg : join(root, outArg);
const only = argValue('only', '');
const audit = !process.argv.includes('--no-audit') && !only;
const W = 1280;
const H = 720;

function seeds(airframe, map) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true,
    map,
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
    wingView: 'chase',
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

async function trackSeed(file) {
  if (!file) {
    return [];
  }
  const doc = await readFile(join(root, file), 'utf8');
  const cls = JSON.parse(doc).trackClass;
  const key = cls === 'micro' ? 'webfpv.trackbuilder.autosave.micro.v1'
    : cls === 'wing' ? 'webfpv.trackbuilder.autosave.wing.v1'
      : 'webfpv.trackbuilder.autosave.v1';
  return [`try { localStorage.setItem(${JSON.stringify(key)}, JSON.stringify(${doc})); } catch (e) { /* refused */ }`];
}

async function open(airframe, map, trackFile) {
  const page = await openPage({
    root, width: W, height: H, url: `/index.html?map=${map}`, seed: [...seeds(airframe, map), ...await trackSeed(trackFile)],
  });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 240000);
  await page.sleep(1500);
  const seated = await page.evaluate('JSON.stringify([window.__map().id, window.__craft().run])').then(JSON.parse);
  if (seated[0] !== map || seated[1] !== airframe) {
    await page.close();
    throw new Error(`the page seated ${seated.join(' ')}, not ${map} ${airframe}`);
  }
  return page;
}

const simT = (page) => page.evaluate('window.__crash().simT');

async function frame(page) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  return data;
}

/* The craft now, and every drawn piece's gap to the surface under it:
 * negative is sunk into it, positive floating over it. Only drawn meshes
 * count, every vertex, in the world. */
const READ = `JSON.stringify((() => {
  const T = window.__three;
  const s = window.__craftState();
  const c = window.__crash();
  const scene = window.__mapScene();
  const wreck = scene.getObjectByName('wreck');
  const craft = wreck && wreck.parent ? wreck.parent.children.find((o) => o.name === 'craft' && o.children.length > 0) : null;
  const v = new T.Vector3();
  /* The lowest drawn vertex against the surface under it, the surface
   * read once per mesh under its lowest vertex: a piece is small against
   * the ground's curve, and a read per vertex costs seconds. */
  const low = (root) => {
    let min = Infinity, at = null;
    root.updateMatrixWorld(true);
    root.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
      for (let o = m; o && o !== root.parent; o = o.parent) if (!o.visible) return;
      const p = m.geometry.attributes.position;
      /* Through the index: a craft mesh that lost a part draws a shorter
       * index over its whole vertex buffer. */
      const idx = m.geometry.index;
      const n = idx ? idx.count : p.count;
      let lo = Infinity, lx = 0, lz = 0;
      for (let i = 0; i < n; i += 1) {
        v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        if (v.y < lo) { lo = v.y; lx = v.x; lz = v.z; }
      }
      if (lo === Infinity) return;
      const g = window.__surface(lx, lz, lo + 0.3);
      if (lo - g < min) { min = lo - g; at = [lx, lo, lz]; }
    });
    return { gap: min, at };
  };
  const audit = window.__wreckAudit();
  const pieces = wreck ? wreck.children.filter((p) => p.visible).map((p) => {
    const a = audit.find((r) => p.name === 'wreck-' + r.kind + '-' + r.part);
    const hull = a && a.hullLow ? a.hullLow[1] - window.__surface(a.hullLow[0], a.hullLow[2], a.hullLow[1] + 0.3) : null;
    /* A part riding a broken parent (a fin on its boom) lies where the
     * parent lies; only a part on its own can float. */
    const onParent = a ? audit.some((r) => r.part === a.parent && r.free) : false;
    return { name: p.name, ...low(p), free: a ? a.free && !onParent : false, hull };
  }) : [];
  const vis = craft ? craft.visible : false;
  if (craft) craft.visible = true;
  const body = craft ? low(craft) : null;
  if (craft) craft.visible = vis;
  return {
    simT: c.simT, x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, up: s.up, vel: s.vel,
    free: c.freeBodies, flags: c.flagNames, wrecked: c.wrecked, debris: c.debris, feed: c.feed, chase: c.chase,
    banner: s.banner, bodyGap: body ? body.gap : null, pieces,
  };
})())`;

/* The same, without the surface gaps, for the loops that poll. */
const FAST = `JSON.stringify((() => {
  const s = window.__craftState();
  const c = window.__crash();
  return { simT: c.simT, x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, up: s.up, free: c.freeBodies, landed: s.landed || s.turtleParked };
})())`;

async function chaseCam(page, dir, span) {
  const s = await page.evaluate('JSON.stringify(window.__craftState())').then(JSON.parse);
  const back = Math.max(1.6, span * 6);
  await page.evaluate(`window.__setCam(${s.worldX - dir[0] * back}, ${s.worldY + back * 0.35}, ${s.worldZ - dir[1] * back}, ${s.worldX}, ${s.worldY}, ${s.worldZ}, 60)`);
}

/* A sheet: the four frames two by two, with the numbers under them, drawn
 * in a second tab of the same browser and captured whole. */
async function sheet(page, name, title, frames, lines) {
  const { targetId } = await page.cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await page.cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p = {}) => page.cdp.send(m, p, sessionId);
  try {
    const fw = 960;
    const fh = 540;
    const textH = 34 + 19 * lines.length;
    const width = fw * 2;
    const height = 40 + fh * Math.ceil(frames.length / 2) + textH;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${f.data}"><figcaption>${f.label}</figcaption></figure>`).join('');
    const html = `<style>
      body{margin:0;background:#111;color:#e8e8e8;font:15px/19px monospace}
      h1{margin:0;height:40px;font:bold 20px/40px sans-serif;padding:0 12px}
      main{display:grid;grid-template-columns:${fw}px ${fw}px}
      figure{margin:0;position:relative;width:${fw}px;height:${fh}px}
      img{width:${fw}px;height:${fh}px;display:block}
      figcaption{position:absolute;left:8px;top:6px;background:#000a;padding:2px 8px;font:bold 17px sans-serif}
      pre{margin:0;padding:8px 12px;white-space:pre-wrap}
    </style><h1>${title}</h1><main>${cells}</main><pre>${lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n')}</pre>`;
    await send('Runtime.evaluate', { expression: `document.open(); document.write(${JSON.stringify(html)}); document.close();` });
    await send('Runtime.evaluate', {
      expression: 'Promise.all([...document.images].map((i) => i.decode()))', awaitPromise: true,
    });
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    const path = join(outDir, `${name}-sheet.jpg`);
    await writeFile(path, Buffer.from(data, 'base64'));
    return path;
  } finally {
    await page.cdp.send('Target.closeTarget', { targetId });
  }
}

/* Progress, for a run that seems stuck: FEEL_DEBUG=1. */
const note = (m) => {
  if (process.env.FEEL_DEBUG === '1') {
    console.log(`    [${new Date().toISOString().slice(11, 19)}] ${m}`);
  }
};

const fmt = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));
const attitude = (up) => {
  if (!up) {
    return 'unknown';
  }
  if (up.y > 0.7) {
    return `upright (up.y ${fmt(up.y)})`;
  }
  if (up.y < -0.7) {
    return `inverted (up.y ${fmt(up.y)})`;
  }
  return `on its side or nose (up.y ${fmt(up.y)})`;
};

async function stage(page, sc) {
  const plan = await page.evaluate(`JSON.stringify((() => { ${sc.plan} })())`).then(JSON.parse);
  if (!plan) {
    throw new Error('no spot on the map fits the scenario');
  }
  const span = airframeById(sc.airframe).dims.bodyWidth;
  /* A fresh aircraft for every scenario on the same page: R, the pilot's
   * own reset, which clears the damage and the wreck. */
  note('reset');
  await page.tap('KeyR');
  await page.until('window.__crash().flags === 0 && !window.__crash().wrecked', 30000);
  await page.sleep(300);
  const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true, showCraft: true })}))`).then(JSON.parse);
  if (!thrown.ok) {
    throw new Error(`throw refused: ${JSON.stringify(thrown)}`);
  }
  if (sc.chase === 'script') {
    await chaseCam(page, plan.dir, span);
  } else {
    await page.evaluate('window.__setCam(null)');
  }
  await page.sleep(700);
  const frames = [{ label: 'before', data: await frame(page) }];
  const t0 = await simT(page);
  note(`thrown, sim ${fmt(t0)} s`);
  const release = await page.evaluate(FAST).then(JSON.parse);
  if (plan.stick) {
    await page.evaluate(`window.__stick(${plan.stick.join(',')})`);
  }
  await page.evaluate('window.__releasePose()');
  /* Impact: the first damage event. */
  let impact = null;
  let closest = Infinity;
  let seenT = -1;
  let seenAt = Date.now();
  for (;;) {
    const now = await simT(page);
    if (now !== seenT) {
      seenT = now;
      seenAt = Date.now();
    } else if (Date.now() - seenAt > 4000) {
      /* Stopped with no damage event: the shell's own crash, a perch. */
      note(`the plant stopped at sim ${fmt(now)} s before any damage event`);
      break;
    }
    const log = await page.evaluate('JSON.stringify(window.__crashLog())').then(JSON.parse);
    if (plan.at) {
      const c = await page.evaluate(FAST).then(JSON.parse);
      closest = Math.min(closest, Math.hypot(c.x - plan.at[0], c.z - plan.at[2]));
    }
    if (log.length > 0) {
      impact = log[0];
      break;
    }
    if (await simT(page) - t0 > 6) {
      break;
    }
    if (sc.chase === 'script') {
      await chaseCam(page, plan.dir, span);
    }
    await page.sleep(15);
  }
  if (sc.chase === 'script') {
    await chaseCam(page, plan.dir, span);
  }
  frames.push({ label: `impact ${impact ? `t+${fmt(impact.t - t0)} s, ${impact.part} ${impact.type}` : 'none in 6 s'}`, data: await frame(page) });
  const tImpact = impact ? impact.t : await simT(page);
  note(`impact ${impact ? JSON.stringify(impact) : 'none'}`);
  await page.until(`window.__crash().simT >= ${tImpact + 0.35}`, 8000).catch(() => note('the plant did not reach the parts frame'));
  if (sc.chase === 'script') {
    await chaseCam(page, plan.dir, span);
  }
  const partsRead = await page.evaluate(READ).then(JSON.parse);
  frames.push({ label: `parts t+${fmt(partsRead.simT - t0)} s, ${partsRead.pieces.length} pieces, ${partsRead.debris} debris`, data: await frame(page) });
  /* At rest, on the plant's clock. */
  let still = -1;
  let r = partsRead;
  let maxSpeedLate = 0;
  let lastT = -1;
  let lastChange = Date.now();
  let frozen = null;
  for (;;) {
    r = await page.evaluate(FAST).then(JSON.parse);
    if (r.simT !== lastT) {
      lastT = r.simT;
      lastChange = Date.now();
    } else if (Date.now() - lastChange > 4000) {
      /* The shell has stopped stepping the plant for a reason it does not
       * call a perch: said in the report, taken as the end of the crash. */
      frozen = await page.evaluate(`JSON.stringify((() => { const s = window.__craftState(); return { mode: s.mode, landed: s.landed, crashed: s.crashed, turtle: s.turtle, turtleWait: s.turtleWait, turtleParked: s.turtleParked, turtleFlip: s.turtleFlip, banner: s.banner }; })())`);
      break;
    }
    /* A wreck with its pack out is perched once it lies still, and a quad
     * on its back is parked for turtle mode: the shell stops stepping
     * either, which is rest. */
    if (r.landed) {
      break;
    }
    if (r.speed < REST_SPEED && r.free === 0) {
      still = still < 0 ? r.simT : still;
      if (r.simT - still >= REST_HOLD_S) {
        break;
      }
    } else {
      still = -1;
    }
    if (r.simT - tImpact > REST_LIMIT_S) {
      break;
    }
    if (sc.chase === 'script') {
      await chaseCam(page, plan.dir, span);
    }
    await page.sleep(80);
  }
  const atRest = r.landed || frozen !== null || (still >= 0 && r.simT - still >= REST_HOLD_S);
  if (frozen) {
    note(`the plant stopped at sim ${fmt(r.simT)} s: ${frozen}`);
  }
  const restT = r.simT;
  /* Watched after rest: creep and jitter of the craft. */
  note(`rest loop done, sim ${fmt(r.simT)} s, speed ${fmt(r.speed)}`);
  const track = [];
  const wall2 = Date.now();
  while (!r.landed && !frozen && (await simT(page)) - restT < WATCH_S) {
    if (Date.now() - wall2 > 60000) {
      break;
    }
    const w = await page.evaluate(FAST).then(JSON.parse);
    track.push(w);
    maxSpeedLate = Math.max(maxSpeedLate, w.speed);
    await page.sleep(80);
  }
  const last = await page.evaluate(READ).then(JSON.parse);
  const creep = Math.hypot(last.x - r.x, last.y - r.y, last.z - r.z);
  const mean = track.reduce((a, w) => [a[0] + w.x / track.length, a[1] + w.y / track.length, a[2] + w.z / track.length], [0, 0, 0]);
  const jitter = track.reduce((m, w) => Math.max(m, Math.hypot(w.x - mean[0], w.y - mean[1], w.z - mean[2])), 0);
  if (sc.chase === 'script') {
    await chaseCam(page, plan.dir, span);
  }
  await page.sleep(300);
  frames.push({ label: `${atRest ? 'at rest' : 'still moving'} t+${fmt(last.simT - t0)} s`, data: await frame(page) });
  await page.evaluate('window.__stick()');
  const log = await page.evaluate('JSON.stringify(window.__crashLog())').then(JSON.parse);
  const breaks = log.filter((e) => e.type === 'break');
  const hardest = log.reduce((m, e) => (e.ratio > (m ? m.ratio : -1) ? e : m), null);
  const forceMax = log.reduce((m, e) => (e.force > (m ? m.force : -1) ? e : m), null);
  const counts = {};
  for (const e of log) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  const slide = Math.hypot(last.x - (impact ? partsRead.x : release.x), last.z - (impact ? partsRead.z : release.z));
  /* Sunk is the drawing: its lowest vertex under the surface. Floating is
   * the plant: a free part whose hull's lowest corner stands clear of the
   * surface at rest (a part still on the wreck rides it wherever it lies). */
  const sunk = last.pieces.filter((p) => p.gap < -0.03).map((p) => `${p.name} ${fmt(p.gap * 100, 0)} cm`);
  const floatingPieces = last.pieces.filter((p) => p.free && p.hull != null && p.hull > 0.05);
  const floating = floatingPieces.map((p) => `${p.name} hull +${fmt(p.hull * 100, 0)} cm`);
  /* The worst of them seen close, a fifth frame. */
  const worst = [...last.pieces.filter((p) => p.gap < -0.03), ...floatingPieces]
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  if (worst && worst.at) {
    const [x, y, z] = worst.at;
    await page.evaluate(`window.__setCam(${x + 0.8}, ${y + 0.45}, ${z + 0.8}, ${x}, ${y}, ${z}, 50)`);
    await page.sleep(500);
    frames.push({ label: `close: ${worst.name}, lowest vertex ${fmt(worst.gap * 100, 0)} cm from the surface`, data: await frame(page) });
    await page.evaluate('window.__setCam(null)');
  }
  const result = {
    id: sc.id,
    item: sc.item,
    what: sc.what,
    aimed: plan.what,
    throw: plan.throw,
    impact: impact ? { t: impact.t - t0, part: impact.part, type: impact.type, closing: impact.closing, surface: impact.surface } : null,
    breaks: breaks.map((e) => ({ t: +(e.t - t0).toFixed(3), part: e.part, ratio: +e.ratio.toFixed(2), force: +e.force.toFixed(1), moment: +e.moment.toFixed(2), surface: e.surface })),
    counts,
    hardest: hardest ? { part: hardest.part, type: hardest.type, ratio: hardest.ratio, t: hardest.t - t0 } : null,
    forceMax: forceMax ? { part: forceMax.part, force: forceMax.force, t: forceMax.t - t0 } : null,
    rest: {
      atRest, perched: r.landed, frozen, t: last.simT - t0, sinceImpact: last.simT - tImpact, attitude: attitude(last.up), up: last.up, slide,
      creep, jitter, maxSpeedAfterRest: maxSpeedLate, bodyGap: last.bodyGap,
      pieces: last.pieces.length, sunk, floating, flags: last.flags, wrecked: last.wrecked, banner: last.banner,
    },
    debrisAtParts: partsRead.debris,
  };
  const lines = [
    `${sc.what}. Aimed at ${plan.what}.${plan.at ? ` The craft's centre passed ${fmt(closest)} m from it before the first event.` : ''}`,
    `impact: ${impact ? `t+${fmt(impact.t - t0)} s on ${impact.surface}, ${impact.part} ${impact.type} closing ${fmt(impact.closing)} m/s` : 'none'}; debris particles at +0.35 s: ${partsRead.debris}`,
    `breaks: ${breaks.length ? breaks.map((e) => `${e.part} t+${fmt(e.t - t0)} (${fmt(e.ratio)}x, ${fmt(e.force, 0)} N)`).join(', ') : 'none'}`,
    `events: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}; hardest ${hardest ? `${hardest.part} ${hardest.type} ${fmt(hardest.ratio)}x its limit` : '-'}; peak force ${forceMax ? `${fmt(forceMax.force, 0)} N on ${forceMax.part}` : '-'}`,
    `rest: ${atRest ? `at rest ${fmt(last.simT - tImpact)} s after impact${r.landed ? ' (perched or parked: the shell stopped stepping it)' : ''}${frozen ? ` (the shell stopped stepping it: ${frozen})` : ''}` : `still moving ${fmt(last.simT - tImpact)} s after impact`}, ${attitude(last.up)}, slid ${fmt(slide)} m after the parts frame; creep ${fmt(creep * 100, 1)} cm and jitter ${fmt(jitter * 100, 1)} cm over ${WATCH_S} s; body gap ${fmt((last.bodyGap ?? 0) * 100, 1)} cm`,
    `pieces: ${last.pieces.length}; sunk: ${sunk.join(', ') || 'none'}; floating: ${floating.join(', ') || 'none'}`,
    `flags: ${last.flags.join(', ') || 'none'}; banner ${JSON.stringify(last.banner)}`,
  ];
  await writeFile(join(outDir, `${sc.id}.json`), `${JSON.stringify(result, null, 1)}\n`);
  return { lines, frames, title: `${sc.item}. ${sc.id} (${sc.airframe} on ${sc.map})` };
}

/* Item 0's check: every airframe, every part broken, no piece carrying a
 * vertex past DRAW_BOUND outside its part's box. */
async function drawingCheck() {
  let bad = 0;
  for (const a of AIRFRAMES) {
    const page = await open(a.id, 'airfield');
    try {
      await page.evaluate(`(() => { const s = window.__craftState(); window.__crashThrow({ x: s.worldX + 20, y: window.__heightAt(s.worldX + 20, s.worldZ) + 20, z: s.worldZ, yaw: 90, pitch: 0, vx: 0, vy: 0, vz: 0, hold: true }); })()`);
      await page.sleep(300);
      const n = await page.evaluate('window.__crash().parts.length');
      for (let i = 1; i < n; i += 1) {
        await page.evaluate(`window.__crashBreak(${i})`);
      }
      await page.until(`window.__crash().pieces.length >= ${n - 1}`, 30000).catch(() => {});
      const rows = await page.evaluate('JSON.stringify(window.__wreckAudit())').then(JSON.parse);
      const worst = rows.reduce((m, r) => (r.overhang > m.overhang ? r : m), { overhang: 0, kind: '-', mesh: '-' });
      const ok = rows.length === n - 1 && worst.overhang <= DRAW_BOUND;
      bad += ok ? 0 : 1;
      console.log(`  ${ok ? 'pass' : 'FAIL'}  ${a.id}: ${rows.length} of ${n - 1} parts drawn as pieces, worst ${fmt(worst.overhang, 3)} m past its box (${worst.kind}, mesh ${worst.mesh || '-'})`);
      bad += await finish(page);
    } catch (e) {
      await page.close();
      throw e;
    }
  }
  return bad;
}

let consoleErrors = 0;
async function finish(page) {
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  consoleErrors += errs.length;
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  await page.close();
  return 0;
}

await mkdir(outDir, { recursive: true });
let failed = 0;
if (audit) {
  console.log(`\n0. the wreck's drawing: every airframe, every part broken, nothing drawn past ${DRAW_BOUND} m outside its part`);
  failed += await drawingCheck();
}
const want = only ? new Set(only.split(',')) : null;
const list = SCENARIOS.filter((sc) => !want || want.has(sc.id));
/* One page per aircraft and map, the scenarios on it run in turn. */
const groups = new Map();
for (const sc of list) {
  const key = `${sc.airframe} ${sc.map} ${sc.trackFile ?? ''}`;
  groups.set(key, [...(groups.get(key) ?? []), sc]);
}
const sheets = [];
for (const scs of groups.values()) {
  let page = null;
  try {
    page = await open(scs[0].airframe, scs[0].map, scs[0].trackFile);
  } catch (e) {
    failed += scs.length;
    console.log(`\n${scs.map((s) => s.id).join(', ')}: FAILED to open: ${e.message}`);
    continue;
  }
  /* The sheets are drawn in a second tab once the page's scenarios are
   * done: a page left in the background draws no frames, so its plant
   * stops, and it no longer takes keys. */
  const staged = [];
  for (const sc of scs) {
    console.log(`\n${sc.item}. ${sc.id}: ${sc.what}`);
    try {
      const done = await stage(page, sc);
      for (const l of done.lines) {
        console.log(`  ${l}`);
      }
      staged.push({ sc, ...done });
    } catch (e) {
      failed += 1;
      console.log(`  FAILED ${e.message}`);
    }
  }
  for (const d of staged) {
    const path = await sheet(page, d.sc.id, d.title, d.frames, d.lines);
    console.log(`  sheet ${path}`);
    sheets.push(path);
  }
  await finish(page);
}
console.log(`\n${sheets.length} sheet(s) in ${outDir}; ${failed} failure(s); ${consoleErrors} console error(s)`);
process.exit(failed || consoleErrors ? 1 : 0);
