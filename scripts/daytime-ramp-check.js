/*
 * daytime-ramp-check.js: a war mission's light moving across its stages
 * on Itaipu without a rebuild (TECH-NEEDS T1.11; src/maps/itaipu/look/
 * index.js THE RAMP), the real shell at High on GPU.
 *
 *     SIM_GPU=1 node scripts/daytime-ramp-check.js      (npm run daytime:ramp)
 *
 * Built with `?time=A&toward=B` (src/main.js soloClock: the clock a war
 * room's mission tells, standing at A with B to come), the look is moved
 * by its setLocalTime, as src/main.js daytimeFrame moves it on the room's
 * clock. Against worlds built at one time, each its own page:
 *
 *   ends      at A's hour every number the light is drawn with (the
 *             sun's colour and strength, the sky's, the post chain's and
 *             the meter's, the night fill, the towns' lights) is the world
 *             built at A's; at B's hour B's, but for the sun's (the
 *             moon's) direction, which a ramp holds at its daylight
 *             time's. Dusk into dark (Lights Out) and the dawn (The Long
 *             Night).
 *   flag      the night flag, and every reader of it (src/share/daytime.js
 *             daytimeNow: detection's light, the sounds), turns where the
 *             sun crosses NIGHT_SIN, on the same hour as the room's clock
 *             names night, with no rebuild
 *   lamps     the towns' lights are out at the golden hour and on at
 *             night, as many lamp pixels as the world built at night's
 *             (within half); put out at night
 *             by the grid (setPower, as src/share/war/grid.js hands the
 *             room's outages in), the lamp pixels go with them, and come
 *             back when the grid gives them back
 *   picture   the frame at each end is the world built at that end's
 *             within a tenth of a stop of mean light (the moon's
 *             direction aside, at night within a stop)
 *
 * Exit 0 on a pass, 1 otherwise.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import {
  TIME_HOUR, hourAfter, isNightSun, sunSinAt,
} from '../src/share/daytime.js';
import { DISTRICTS } from '../src/share/war/grid.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'itaipu', graphics: 'high', graphicsAuto: false, sound: false, airframeAsked: true, timeOfDay: 'own' });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/* The crest at night, toward Foz do Iguacu (scripts/itaipu-views.js
 * night-crest): the dam's lamps, the powerhouse and the towns past it. */
const CAM = [-313.8, 226.7, -1818.0, 1500, 160, 2600];
const FOV = 60;

/* Every number the light is drawn with, from the page. */
const STATE = `(() => {
  const scene = window.__mapScene();
  const look = scene.userData.itaipu.look;
  const sun = [];
  let ambient = 0;
  scene.traverse((o) => {
    if (o.isDirectionalLight) sun.push(o);
    if (o.isHemisphereLight) ambient += o.intensity;
  });
  const a = (v) => (v && v.toArray ? v.toArray() : v);
  const sky = scene.getObjectByName('sky').material.uniforms;
  const post = scene.userData.post;
  const g = post.grade.material.uniforms;
  const meter = post.composer.passes.find((p) => p.tapMat);
  const m = meter ? meter.tapMat.uniforms : null;
  const fx = look.night();
  let glows = null;
  scene.traverse((o) => {
    if (o.isPoints && o.material.uniforms && o.material.uniforms.uNight) glows = o;
  });
  const d = sun[0].position.clone().sub(sun[0].target.position).normalize();
  return JSON.stringify({
    sun: sun.map((l) => [...a(l.color), l.intensity]),
    dir: a(d),
    ambient,
    sky: [a(sky.uSunCol.value), a(sky.uZenith.value), a(sky.uHaze.value), a(sky.uAirSun.value), sky.uDisc.value, sky.uStars.value],
    background: a(scene.background),
    post: [a(g.uSunCol.value), a(g.uHaze.value), g.uMie.value, g.uExposure.value, g.uKey.value, g.uContrast.value],
    meter: m ? [a(m.uSunCol.value), a(m.uHaze.value), m.uMie.value] : null,
    lamps: fx ? Math.max(...fx.levels()) : 0,
    blink: glows ? glows.material.uniforms.uNight.value : 0,
    flag: scene.userData.timeOfDay,
    look: look.time,
    span: look.span,
  });
})()`;

/* The frame now, as the pilot sees it: mean linear light, and the share
 * of pixels a lamp's glow makes (linear light over LAMP_LUM and warmer
 * or whiter than the night around it). */
const LAMP_LUM = 0.5;
const picture = async (p) => {
  const { data } = await p.cdp.send('Page.captureScreenshot', { format: 'png' }, p.sessionId);
  return JSON.parse(await p.evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const lin = (u) => { const v = u / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    let sum = 0;
    let lamps = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
      sum += l;
      if (l > ${LAMP_LUM}) lamps += 1;
    }
    return JSON.stringify({ mean: sum / n, lamps: lamps / n });
  })()`));
};

const BOOT_MS = 600000;
const LIMIT_MS = 40 * 60000;
let open = null;
setTimeout(async () => {
  console.log(`  FAIL  the check ran past its hard limit of ${LIMIT_MS / 60000} min`);
  setTimeout(() => process.exit(1), 10000).unref();
  await Promise.allSettled([open && open.close()]);
  process.exit(1);
}, LIMIT_MS).unref();

/* Until the terrain has built what the camera asks for and the streamer
 * is idle (scripts/itaipu-views.js settle), then the meter's time. */
async function settle(p) {
  for (let k = 0; k < 2; k += 1) {
    await p.evaluate('window.__cf = window.__boot().frames');
    await p.until('window.__boot().frames > window.__cf + 2', 60000);
    await p.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
  }
  await p.sleep(4000);
}

const boot = async (query) => {
  const p = await openPage({
    root, url: `/index.html?map=itaipu&${query}`, width: 960, height: 540, seed,
  });
  open = p;
  await p.until('window.__shellReady === true', BOOT_MS);
  await p.until("window.__map && window.__map().ready && window.__map().id === 'itaipu'", BOOT_MS);
  await p.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await p.evaluate(`(window.__setCam(${CAM.join(',')}, ${FOV}), "")`);
  await settle(p);
  return p;
};

const refused = /^network: .*ERR_CONNECTION_REFUSED/;
const quiet = (p) => p.errors.filter((e) => !refused.test(e));

/* Two states' numbers equal but the listed keys, to 1e-6 relative. */
const near = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
function differ(a, b, skip = []) {
  const flat = (v, path, out) => {
    if (Array.isArray(v)) {
      v.forEach((w, i) => flat(w, `${path}[${i}]`, out));
    } else {
      out.push([path, v]);
    }
    return out;
  };
  const out = [];
  for (const k of Object.keys(a)) {
    if (skip.includes(k)) continue;
    const fa = flat(a[k], k, []);
    const fb = flat(b[k], k, []);
    if (fa.length !== fb.length) {
      out.push(`${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
      continue;
    }
    fa.forEach(([path, x], i) => {
      const y = fb[i][1];
      if (typeof x === 'number' ? !near(x, y) : x !== y) out.push(`${path}: ${x} vs ${y}`);
    });
  }
  return out;
}
const stops = (a, b) => Math.abs(Math.log2(a / b));
const PICTURE_KEYS = ['look', 'span', 'dir'];

/* A world built at one named time: its numbers and its frame. */
async function staticWorld(time) {
  const p = await boot(`time=${time}`);
  try {
    const state = JSON.parse(await p.evaluate(STATE));
    const pic = await picture(p);
    check(`${time}, built at it: no page error`, quiet(p).length === 0, quiet(p).slice(0, 3).join(' | ').slice(0, 600));
    return { state, pic };
  } finally {
    await p.close();
  }
}

const daytime = (p) => p.evaluate('JSON.stringify(window.__daytime())').then(JSON.parse);
const setHour = (p, h) => p.evaluate(`(window.__mapScene().userData.itaipu.look.setLocalTime(${h}), "")`);
const frames = (p, n) => p.evaluate(`(async () => { for (let i = 0; i < ${n}; i += 1) await new Promise((r) => requestAnimationFrame(r)); return true; })()`);

/* A ramp from `from` to `to`, against the worlds built at each end. */
async function ramp(from, to, ends) {
  const h0 = TIME_HOUR[from];
  const h1 = hourAfter(h0, to);
  const p = await boot(`time=${from}&toward=${to}`);
  try {
    const built = JSON.parse(await p.evaluate(STATE));
    check(`built once for both (${built.span})`, built.span && built.span.join() === `${from},${to}` && built.look === from);
    const start = await picture(p);
    const startOff = differ(ends[from].state, built, PICTURE_KEYS.concat(from === 'night' ? ['dir'] : []));
    check(`at ${from}'s hour every number is the world built at ${from}'s${from === 'night' ? ' (the moon where the morning\'s sun will be)' : ''}`,
      startOff.length === 0, startOff.slice(0, 6).join(' | '));
    if (from !== 'night') {
      check(`and its frame is that world's within a tenth of a stop (${start.mean.toFixed(4)} vs ${ends[from].pic.mean.toFixed(4)})`,
        stops(start.mean, ends[from].pic.mean) < 0.1);
    }

    /* The flag turns where the sun crosses NIGHT_SIN, the readers with it. */
    const steps = 24;
    let turnedAt = null;
    let disagree = 0;
    for (let k = 0; k <= steps; k += 1) {
      const h = h0 + ((h1 - h0) * k) / steps;
      await setHour(p, h);
      await frames(p, 3);
      const d = await daytime(p);
      const want = isNightSun(sunSinAt(h));
      if ((d.flag === 'night') !== want || d.night !== want || (d.light === 0.05) !== want) disagree += 1;
      if (turnedAt === null && (d.flag === 'night') !== (from === 'night')) turnedAt = h;
      if (!d.ready || d.built !== from) disagree += 100;
    }
    check(`the night flag and its readers turn where the sun crosses NIGHT_SIN (${turnedAt?.toFixed(2)} h), no rebuild`, disagree === 0 && turnedAt !== null,
      `${disagree} steps disagree`);

    await setHour(p, h1);
    await settle(p);
    const end = JSON.parse(await p.evaluate(STATE));
    const endPic = await picture(p);
    const endOff = differ(ends[to].state, end, PICTURE_KEYS.concat(to === 'night' ? ['dir'] : []));
    check(`at ${to}'s hour every number is the world built at ${to}'s${to === 'night' ? ' (but the moon\'s direction)' : ''}`,
      endOff.length === 0, endOff.slice(0, 6).join(' | '));
    const tol = to === 'night' ? 1 : 0.1;
    check(`and its frame is that world's within ${tol} stop (${endPic.mean.toFixed(4)} vs ${ends[to].pic.mean.toFixed(4)})`,
      stops(endPic.mean, ends[to].pic.mean) < tol);
    const night = to === 'night' ? end : built;
    const day = to === 'night' ? built : end;
    const nightPic = to === 'night' ? endPic : start;
    check(`the towns' lights: out by day (${day.lamps}), on at night (${night.lamps}, ${(nightPic.lamps * 1e4).toFixed(1)} lamp pixels per 10 000, the world built at night ${(ends.night.pic.lamps * 1e4).toFixed(1)})`,
      day.lamps === 0 && day.blink === 0 && night.lamps === 1 && night.blink === 1 && nightPic.lamps > ends.night.pic.lamps / 2);
    if (to === 'night') {
      /* The grid's outages at night, and the lights back. */
      const dark = JSON.stringify(DISTRICTS.map(() => 0));
      await p.evaluate(`(window.__mapScene().userData.itaipu.look.setPower(${dark}), "")`);
      await frames(p, 30);
      const out = await picture(p);
      const outState = JSON.parse(await p.evaluate(STATE));
      await p.evaluate(`(window.__mapScene().userData.itaipu.look.setPower(${JSON.stringify(DISTRICTS.map(() => 1))}), "")`);
      await frames(p, 30);
      const back = await picture(p);
      check(`every district cut at night puts its lights out (${(out.lamps * 1e4).toFixed(1)} lamp pixels per 10 000 against ${(endPic.lamps * 1e4).toFixed(1)}), and they come back with the grid (${(back.lamps * 1e4).toFixed(1)})`,
        outState.lamps === 0 && out.lamps < endPic.lamps / 4 && back.lamps > endPic.lamps * 0.75);
    }
    check('no page error', quiet(p).length === 0, quiet(p).slice(0, 3).join(' | ').slice(0, 600));
  } finally {
    await p.close();
  }
}

const ends = {};
for (const t of ['golden', 'night', 'morning']) {
  console.log(`Itaipu built at ${t}`);
  ends[t] = await staticWorld(t);
  console.log(`  frame mean ${ends[t].pic.mean.toFixed(4)}, lamp pixels ${(ends[t].pic.lamps * 1e4).toFixed(1)} per 10 000`);
}
console.log('Lights Out: the golden hour into the night');
await ramp('golden', 'night', ends);
console.log('The Long Night: the night into the morning');
await ramp('night', 'morning', ends);

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
