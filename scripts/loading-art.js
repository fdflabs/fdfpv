/*
 * loading-art.js: the key art behind the title, rendered by the game.
 *
 * WHAT THIS MAKES. Two raw frames of the Itaipu map at sunset with a war
 * Striker (src/render/attackers.js, the pusher delta) banking close to the
 * camera, rendered by the real shell on the real GPU: `wide`, 16:9, for a
 * desktop, and `tall`, a phone's portrait, composed on its own because no
 * crop of the wide frame holds both the Striker and the spillway.
 * tools/loading-art/grade.py turns them into the shipped files in
 * assets/keyart/. Nothing in either picture is painted or generated:
 * every pixel of a raw frame is the renderer's, and the grade is a curve,
 * a split tone and a vignette.
 *
 * THE ONE THING THAT IS NOT THE MAP AS SHIPPED: THE SUN. Itaipu's sun is
 * the satellite's, 65.8 degrees up at 10:49 (look/light.js), and it never
 * changes. Key art wants a low sun and long light on the water, so this
 * run serves the page a copy of look/light.js and look/sky.js with the
 * sun's constants (and the sky's, which are tied to it) rewritten, through
 * an overlay tree of symlinks: the game's files are not touched and the
 * shell cannot tell. SUNSET below is every value changed. The rewrite is
 * by exact string, and a pattern that is no longer in the file stops the
 * run rather than silently shooting noon.
 *
 * THE SHOTS below are the design, the same rule as scripts/posters.js:
 * parked by hand, and each says what it frames.
 *
 * REGENERATE, DO NOT EDIT:
 *
 *     SIM_GPU=1 node scripts/loading-art.js OUT_DIR [SHOT,SHOT]
 *     python3 tools/loading-art/grade.py OUT_DIR assets/keyart [SHOT,SHOT]
 *
 * OUT_DIR is outside the repository: the raw frames are working files.
 * About two minutes on this machine's GPU.
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

import {
  mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * Sunset. Azimuth clockwise from north, as light.js's: 298 degrees is
 * where the sun sets over the reservoir in the southern winter, and 5
 * degrees up is low enough to lay a road of light down the river below
 * the spillway. The colour is a low sun's through a long path of air and
 * the irradiance is under noon's; the post chain's meter sets the
 * exposure either way. The zenith deepens, the haze warms, and the cloud
 * deck the sky already draws is let in thicker, because a clear sunset is
 * a flat one.
 */
const SUNSET = {
  az: 298,
  elev: 5,
  sun: [1.0, 0.58, 0.3],
  irradiance: 2.6,
  zenith: [0.02, 0.06, 0.18],
  haze: [0.28, 0.23, 0.21],
  cloudEdge: [0.5, 0.66],
};

/*
 * Each shot: the window it is rendered at, the camera (x, y, z, look at
 * x, y, z, world metres, Y up, as scripts/posters.js, and the vertical
 * lens in degrees), and the Striker, placed `ahead` metres along the view
 * and `right` and `up` across it, then turned: `yaw` degrees from its nose
 * pointing back at the camera (see the pose below), `pitch` and `bank`.
 */
const SHOTS = [
  /*
   * From over the right bank below the dam, looking north west up the
   * river: the spillway's chutes and their plume in the middle, the sun's
   * road down the river under them, the main dam's buttresses and the
   * powerhouse running off to the right and the reservoir behind all of
   * it. The Striker is up on the left against the sun, whose disc sits
   * just clear of the fin, diving toward the dam. The right third is the
   * dam and sky, which is where the wordmark goes.
   */
  {
    name: 'wide',
    w: 3840,
    h: 2160,
    camera: [200, 450, 300, -850, 260, -1150, 48],
    striker: {
      ahead: 5.6, right: -2.1, up: 0.15, yaw: 108, pitch: -8, bank: -30,
    },
  },
  /*
   * A phone's portrait, from further east so the spillway and the sun
   * line up in a lens only 32 degrees wide: the sun and the sky at the
   * top where the wordmark goes, the Striker across the middle with the
   * sun under its wing, the chutes, the plume and the river below.
   */
  {
    name: 'tall',
    w: 1170,
    h: 2532,
    camera: [490, 430, 5, -982, 290, -1028, 64],
    striker: {
      ahead: 7.2, right: 0.2, up: 1.0, yaw: 104, pitch: -12, bank: -32,
    },
  },
  /*
   * The landing page's (landing.html): the wide shot's ground, a moment
   * into a kill. The fireball is right of the middle, against the dam, where
   * the page has no words, a second with its shockwave still out beyond
   * it and a third dying by the spillway, and the Striker that got
   * through banks away on the left. A phone shows a crop of this one
   * round the fireball; no portrait shot is made. `booms` are the war's own explosions
   * (src/render/explosion.js), each placed as the Striker is and stopped
   * at `age` seconds: `size` as play() takes it.
   */
  {
    name: 'boom-wide',
    w: 3840,
    h: 2160,
    camera: [200, 450, 300, -850, 260, -1150, 48],
    striker: {
      ahead: 11, right: -4.2, up: 0.6, yaw: 150, pitch: -14, bank: 24,
    },
    booms: [
      { ahead: 300, right: 40, up: -45, size: 3, age: 0.55 },
      { ahead: 600, right: 190, up: -60, size: 2.2, age: 0.25 },
      { ahead: 520, right: -70, up: -70, size: 3, age: 1.1 },
    ],
  },
];

/* Every rewrite, as [file, from, to]. `from` must appear exactly once. */
function rewrites() {
  const f = (a) => a.map((v) => v.toFixed(4)).join(', ');
  return [
    ['src/maps/itaipu/look/light.js', 'export const SUN_AZIMUTH_DEG = 90.1;', `export const SUN_AZIMUTH_DEG = ${SUNSET.az};`],
    ['src/maps/itaipu/look/light.js', 'export const SUN_ELEVATION_DEG = 65.8;', `export const SUN_ELEVATION_DEG = ${SUNSET.elev};`],
    ['src/maps/itaipu/look/light.js', 'export const SUN_COLOR = new THREE.Color(1.0, 0.93, 0.82);', `export const SUN_COLOR = new THREE.Color(${f(SUNSET.sun)});`],
    ['src/maps/itaipu/look/light.js', 'export const SUN_IRRADIANCE = 3.51;', `export const SUN_IRRADIANCE = ${SUNSET.irradiance};`],
    ['src/maps/itaipu/look/sky.js', 'const ZENITH = new THREE.Color().setRGB(0.035, 0.15, 0.43, THREE.LinearSRGBColorSpace);',
      `const ZENITH = new THREE.Color().setRGB(${f(SUNSET.zenith)}, THREE.LinearSRGBColorSpace);`],
    ['src/maps/itaipu/look/sky.js', 'haze: new THREE.Color().setRGB(0.31, 0.37, 0.47, THREE.LinearSRGBColorSpace),',
      `haze: new THREE.Color().setRGB(${f(SUNSET.haze)}, THREE.LinearSRGBColorSpace),`],
    ['src/maps/itaipu/look/sky.js', 'const CLOUD_EDGE = 0.58;', `const CLOUD_EDGE = ${SUNSET.cloudEdge[0]};`],
  ];
}

/*
 * A tree that serves the repository with some files replaced: every entry
 * a symlink to the real one, except the directories on the way to a
 * replaced file, which are real directories of symlinks, and the replaced
 * files themselves. tests/lib/server.js follows the links. Removing the
 * tree removes the links, never what they point at.
 */
async function overlay(files) {
  const top = await mkdtemp(join(tmpdir(), 'fdfpv-loading-art-'));
  const dirsOnPath = new Set();
  for (const rel of Object.keys(files)) {
    const parts = rel.split('/');
    for (let k = 1; k < parts.length; k += 1) {
      dirsOnPath.add(parts.slice(0, k).join('/'));
    }
  }
  async function fill(rel) {
    const src = rel ? join(root, rel) : root;
    const dst = rel ? join(top, rel) : top;
    await mkdir(dst, { recursive: true });
    for (const e of await readdir(src, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (dirsOnPath.has(r)) {
        await fill(r);
      } else if (Object.hasOwn(files, r)) {
        await writeFile(join(dst, e.name), files[r]);
      } else {
        await symlink(join(src, e.name), join(dst, e.name));
      }
    }
  }
  await fill('');
  return top;
}

/*
 * The Striker, through the war's own renderer: createAttackers and an
 * update with one attacker, exactly what the war mode does each frame.
 * Its pose is built from the camera's axes so a shot's numbers read as the
 * picture does. Nose -z in the body frame: yaw 0 points the nose back
 * along the ray from the camera to the Striker, so near 90 is a side view.
 * Not exactly 90, because the prop is 1.4 m aft of the centre and at five
 * metres its own ray is about fifteen degrees off; the shots' yaws are
 * what puts the disc edge on.
 */
function placeStriker(camera, striker) {
  const [cx, cy, cz, lx, ly, lz] = camera;
  return `(async () => {
    const THREE = window.__three;
    if (!window.__artLayer) {
      const { createAttackers } = await import('/src/render/attackers.js');
      window.__artLayer = createAttackers();
      window.__mapScene().add(window.__artLayer.group);
    }
    const eye = new THREE.Vector3(${cx}, ${cy}, ${cz});
    const fwd = new THREE.Vector3(${lx}, ${ly}, ${lz}).sub(eye).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const s = ${JSON.stringify(striker)};
    const p = eye.clone().addScaledVector(fwd, s.ahead).addScaledVector(right, s.right).addScaledVector(up, s.up);
    const ray = p.clone().sub(eye);
    const face = Math.atan2(ray.x, ray.z);
    const d = Math.PI / 180;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch * d, face + s.yaw * d, s.bank * d, 'YXZ'));
    window.__artLayer.update([{ id: 1, kind: 'strike', p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] }]);
    return 'striker';
  })()`;
}

/*
 * The shot's explosions, through the war's own layer, each thrown at its
 * age and stepped once so the pools are written. Nothing steps them
 * after, so the frame that is photographed is that instant.
 */
function placeBooms(camera, booms) {
  const [cx, cy, cz, lx, ly, lz] = camera;
  return `(async () => {
    const THREE = window.__three;
    if (!window.__artBooms) {
      const { createExplosions } = await import('/src/render/explosion.js');
      window.__artBooms = createExplosions();
      window.__mapScene().add(window.__artBooms.group);
    }
    const eye = new THREE.Vector3(${cx}, ${cy}, ${cz});
    const fwd = new THREE.Vector3(${lx}, ${ly}, ${lz}).sub(eye).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    window.__artBooms.clear();
    for (const b of ${JSON.stringify(booms)}) {
      const p = eye.clone().addScaledVector(fwd, b.ahead).addScaledVector(right, b.right).addScaledVector(up, b.up);
      window.__artBooms.play([p.x, p.y, p.z], b.size, b.age);
    }
    window.__artBooms.update(1 / 600);
    return 'booms';
  })()`;
}

/* A third argument names the shots to render, comma separated; without
 * it, all of them. */
const only = process.argv[3] ? process.argv[3].split(',') : null;
const outDir = resolve(process.argv[2] || '');
if (!process.argv[2] || outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error('loading-art: name an output folder outside the repository');
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('loading-art: run with SIM_GPU=1; the software rasteriser is not the look');
}
await mkdir(outDir, { recursive: true });

const files = {};
for (const [file, from, to] of rewrites()) {
  const text = files[file] ?? await readFile(join(root, file), 'utf8');
  if (text.split(from).length !== 2) {
    throw new Error(`loading-art: ${file} no longer has exactly one "${from}"; update the rewrite`);
  }
  files[file] = text.replace(from, to);
}
const served = await overlay(files);

const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the graphics check below says so. */ }`];

const page = await openPage({
  root: served, width: SHOTS[0].w, height: SHOTS[0].h, url: '/index.html?map=itaipu', seed,
});
try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`loading-art: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false,
    }, page.sessionId);
    const [cx, cy, cz] = shot.camera;
    const ground = await page.evaluate(`window.__heightAt(${cx}, ${cz})`);
    if (!(ground < cy - 1)) {
      throw new Error(`loading-art: ${shot.name}'s camera at y ${cy} is under the ground, ${ground}`);
    }
    await page.evaluate(`(window.__setCam(${shot.camera.join(',')}), "")`);
    await page.evaluate(placeStriker(shot.camera, shot.striker));
    /* The terrain and the shadows settle round the parked camera, as
     * itaipu-views.js waits for them. */
    for (let k = 0; k < 2; k += 1) {
      await page.evaluate('window.__cf = window.__boot().frames');
      await page.until('window.__boot().frames > window.__cf + 2', 60000);
      await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 180000);
    }
    await page.sleep(3000);
    await page.evaluate(placeBooms(shot.camera, shot.booms || []));
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
    console.log(`${shot.name} ${shot.w}x${shot.h} -> ${join(outDir, `${shot.name}.png`)}`);
  }
  const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  if (real.length) {
    throw new Error(`loading-art: console errors:\n${real.join('\n')}`);
  }
} finally {
  await page.close();
  await rm(served, { recursive: true, force: true });
}
