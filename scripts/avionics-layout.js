/*
 * avionics-layout.js: the Avionics HUD (src/ui/avionicshud.js,
 * docs/AVIONICS-HUD.md) on the real shell, at 1280x720 and 1920x1080:
 *
 *   SIM_GPU=1 npm run check:avionics-layout [-- outdir] [--owner]
 *
 * One page at a time. Per size, the 7 inch (a combat airframe) seated on
 * Itaipu in a private room with this pilot alone in it, and what must
 * hold on the boxes the page itself drew:
 *
 *   - the Avionics HUD is what a combat airframe flies with by default
 *   - every panel and tape is inside the window
 *   - no two of them overlap
 *   - none meets the game's own furniture (chips, music dock, gimbals)
 *   - U steps the inset small, medium, large: each drawn at its own
 *     pixels, each larger on screen, and all of the above again at each
 *   - then in a live war, all of that again, and no panel meets the war
 *     HUD's box, its callouts or the markers' radar
 *
 * And the per airframe default and override, at 1280x720: the 5 inch
 * flies with the FPV OSD; the 7 inch with Avionics, whose state goes to
 * DEGRADED when GNSS and VIO are both denied (and only then); I puts its
 * sensor full screen, J then makes it thermal and the HUD THERMAL, and I
 * again restores the pilot's picture; a medium inset is kept across a
 * reload; a pilot who
 * sets the 7 inch to the FPV OSD gets it after a reload.
 *
 * And a phone on its side (844x390, touch), alone, at each inset size.
 *
 * And the owner's scene ("overlays too obtrusive"): the Striker in a live
 * war over Itaipu, thrown nose on at mission 1's first Striker coming
 * head on (his two loiterers are round 3's, minutes in), the AI tracking, at 1280x720, 1625x1034 (his screenshot's) and the phone,
 * at each declutter level Y gives (standard first, the default):
 *
 *   - nothing opaque (a fill at least half solid, or a corner panel) in
 *     the middle of the picture, between the tapes' inner edges and in
 *     the middle third of its height: the reticle and the track boxes
 *     are lines
 *   - one marker an object: no war marker drawn on an object the HUD has
 *     a box on, and the war's kind in that box's tag
 *   - no two of the HUD's words on each other, nor on a panel
 *   - MINIMAL hides the corner panels; the level is kept as a setting
 *
 * Pictures go in outdir (build/avionics-layout by default); look at them.
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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'avionics-layout');
const SIZES = [[1280, 720], [1920, 1080]];
/* A phone on its side, the pilot's thumbs on the screen. */
const PHONE = [844, 390];
/* The owner's screenshot of the obtrusive overlays. */
const OWNER = [1625, 1034];
/* The owner's scene's throw, m/s: over the Striker's prop stall (13). */
const CRUISE_MS = 22;
/* The inset's pixels at each size, src/render/sensorview.js. */
const INSET_PX = { small: [320, 200], medium: [480, 300], large: [640, 400] };

/* The radar's geometry, from warmarkers.js, and the copy avionicshud.js
 * keeps of it: they must agree, or the panels dodge a radar that is not
 * there. */
const constOf = (file, name) => {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(readFileSync(join(root, file), 'utf8'));
  if (!m) {
    throw new Error(`${file} has no ${name}`);
  }
  return Number(m[1]);
};
const RADAR_PX = constOf('src/ui/warmarkers.js', 'RADAR_PX');
const RADAR_TOP_PX = constOf('src/ui/warmarkers.js', 'RADAR_TOP_PX');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const meets = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const box = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`;

function seed(airframe) {
  const s = seatAirframe({ airframe, rates: airframeById(airframe).rates }, airframe);
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.parts = {};
  /* Written once: a reload keeps what the page stored since. */
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.avxSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { avxSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

async function fly(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
}

const READ = `JSON.stringify({
  avx: window.__avionicsHud(),
  osd: window.__fpvOsd().on,
  furniture: [...document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal, .osd-sticks, .osd-air')]
    .filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
  war: [...document.querySelectorAll('.war-hud, .war-calls')]
    .filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => [e.className, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0)
    .map(([c, r]) => ({ c, x: r.left, y: r.top, w: r.width, h: r.height })),
  vw: innerWidth, vh: innerHeight,
})`;

/* The panels and tapes against the window, each other and the furniture. */
function judge(got, label) {
  const items = [
    ...Object.entries(got.avx.panels).map(([id, r]) => ({ id, ...r })),
    ...Object.entries(got.avx.tapes).map(([id, r]) => ({ id: `${id} tape`, ...r })),
  ];
  console.log(`  info  ${items.map((r) => `${r.id} ${box(r)}`).join('; ')}`);
  const out = items.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > got.vw || r.y + r.h > got.vh);
  check(`${label}: every panel and tape is inside the window`, out.length === 0, out.map((r) => `${r.id} ${box(r)}`).join(' | '));
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (meets(items[i], items[j])) {
        pairs.push(`${items[i].id} x ${items[j].id}`);
      }
    }
  }
  check(`${label}: no two overlap`, pairs.length === 0, pairs.join(' | '));
  const panels = items.filter((r) => !r.id.endsWith('tape'));
  const hit = [];
  for (const p of panels) {
    for (const f of got.furniture) {
      if (meets(p, f)) {
        hit.push(`${p.id} x ${box(f)}`);
      }
    }
  }
  check(`${label}: no panel meets the game's chips, dock or gimbals`, hit.length === 0, hit.join(' | '));
  return panels;
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function layout(width, height, rooms) {
  console.log(`${width}x${height}, 7 inch`);
  const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width, height, seed: seed('7inch') });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
    await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
    await fly(page);
    await page.until('window.__avionicsHud().on', 120000).catch(() => {});
    await page.sleep(1500);
    let got = JSON.parse(await page.evaluate(READ));
    check('a combat airframe flies with the Avionics HUD by default', got.avx.on && !got.osd, `avionics ${got.avx.on}, FPV OSD ${got.osd}, room ${code}`);
    if (!got.avx.on) {
      /* Nothing to measure: the panels of a hidden HUD are all 0x0. */
      await shot(page, `avionics-${width}x${height}-not-up`);
      return;
    }
    judge(got, 'alone');
    await shot(page, `avionics-${width}x${height}-alone`);
    await insetSizes(page, `${width}x${height}`, true);

    await page.evaluate("window.__warDo('start', 'itaipu-1')");
    await page.until("window.__war().view.state === 'live' && window.__war().hud.output !== ''", 30000);
    await page.until('window.__war().view.alive > 0 && window.__war().markers.on', 60000);
    /* The panels are placed once a second, from what is up. */
    await page.sleep(2500);
    got = JSON.parse(await page.evaluate(READ));
    check('still the Avionics HUD in a war', got.avx.on, `state ${got.avx.state}`);
    const panels = judge(got, 'war');
    const radar = { c: 'radar', x: got.vw - RADAR_PX * 2 - 18, y: RADAR_TOP_PX - 20, w: RADAR_PX * 2, h: RADAR_PX * 2 + 20 };
    const hud = got.war.find((r) => r.c === 'war-hud');
    check('the war HUD is up', Boolean(hud), got.war.map((r) => `${r.c} ${box(r)}`).join(' | '));
    const hit = [];
    for (const p of panels) {
      for (const w of [...got.war, radar]) {
        if (meets(p, w)) {
          hit.push(`${p.id} ${box(p)} x ${w.c} ${box(w)}`);
        }
      }
    }
    check('war: no panel meets the war HUD, its callouts or the radar', hit.length === 0, hit.join(' | '));
    const left = got.avx.tapes.speed;
    check('war: the speed tape clears the war HUD\'s column', !hud || hud.x + hud.w <= left.x, hud ? `HUD to x ${Math.round(hud.x + hud.w)}, tape from x ${Math.round(left.x)}` : '');
    await shot(page, `avionics-${width}x${height}-war`);
    /* The large inset in the war: clear of the war HUD and the radar too. */
    await page.tap('KeyU');
    await page.tap('KeyU');
    await page.until("window.__avionics.state().sensor.inset === 'large'", 10000).catch(() => {});
    await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
    await page.sleep(300);
    got = JSON.parse(await page.evaluate(READ));
    const large = judge(got, 'war large inset');
    const hitLarge = [];
    for (const p of large) {
      for (const w of [...got.war, radar]) {
        if (meets(p, w)) {
          hitLarge.push(`${p.id} ${box(p)} x ${w.c} ${box(w)}`);
        }
      }
    }
    check('war large inset: no panel meets the war HUD, its callouts or the radar', hitLarge.length === 0, hitLarge.join(' | '));
    await shot(page, `avionics-${width}x${height}-war-inset-large`);
    await page.tap('KeyU');
    await page.until("window.__avionics.state().sensor.inset === 'small'", 10000).catch(() => {});
    /* The AI on (H), for the picture: what it tracks depends on where the
     * waves are, so the count is reported, not asserted. */
    await page.evaluate('window.__avionics.ai(true); true');
    await page.sleep(4000);
    const st = JSON.parse(await page.evaluate('JSON.stringify(window.__avionics.state())'));
    console.log(`  info  AI on: HUD ${st.hud.state}, ${st.tracks} confirmed tracks`);
    await shot(page, `avionics-${width}x${height}-war-ai`);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * The sensor full screen (I) and thermal in it (J), docs/AVIONICS-HUD.md
 * sections 5 and 9, by the pilot's own keys: I puts the sensor full screen
 * and hides the inset, J steps to an IR mode, the HUD goes THERMAL (the AI
 * is off and nothing is degraded here), and I again gives the pilot's
 * picture and the inset back.
 */
async function fullScreenThermal(page) {
  const SENSOR = 'JSON.stringify({ s: window.__avionics.state().sensor, hud: window.__avionicsHud().state, '
    + "pip: getComputedStyle(document.querySelector('.avx-pip')).display })";
  let got = JSON.parse(await page.evaluate(SENSOR));
  check('the pilot\'s picture by default, inset shown', got.s.mainView === 'eo' && got.pip !== 'none', `main ${got.s.mainView}, inset ${got.pip}`);
  const startMode = got.s.mode;
  await page.tap('KeyI');
  await page.until("window.__avionics.state().sensor.mainView === 'sensor'", 10000).catch(() => {});
  await page.until("getComputedStyle(document.querySelector('.avx-pip')).display === 'none'", 5000).catch(() => {});
  got = JSON.parse(await page.evaluate(SENSOR));
  check('I puts the sensor full screen and hides the inset', got.s.mainView === 'sensor' && got.pip === 'none' && got.s.mode === startMode,
    `main ${got.s.mainView}, inset ${got.pip}, mode ${got.s.mode}`);
  await page.tap('KeyJ');
  await page.until(`window.__avionics.state().sensor.mode !== ${JSON.stringify(startMode)}`, 10000).catch(() => {});
  await page.until("window.__avionicsHud().state === 'THERMAL'", 10000).catch(() => {});
  got = JSON.parse(await page.evaluate(SENSOR));
  check('J then shows thermal full screen', got.s.mainView === 'sensor' && (got.s.mode === 'ir_wh' || got.s.mode === 'ir_bh' || got.s.mode === 'fusion'),
    `main ${got.s.mainView}, mode ${got.s.mode}`);
  check('the HUD state reads THERMAL', got.hud === 'THERMAL', `HUD ${got.hud}`);
  /* Two frames, so the picture is the thermal one and not the frame the
   * key landed in. */
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  await shot(page, 'avionics-1280x720-thermal-full-screen');
  await page.tap('KeyI');
  await page.until("window.__avionics.state().sensor.mainView === 'eo'", 10000).catch(() => {});
  await page.until("getComputedStyle(document.querySelector('.avx-pip')).display !== 'none'", 5000).catch(() => {});
  got = JSON.parse(await page.evaluate(SENSOR));
  check('I again restores the pilot\'s picture and the inset, and THERMAL ends', got.s.mainView === 'eo' && got.pip !== 'none' && got.hud !== 'THERMAL',
    `main ${got.s.mainView}, inset ${got.pip}, HUD ${got.hud}`);
  await shot(page, 'avionics-1280x720-pilot-view-again');
}

/*
 * U steps the inset small, medium, large and back to small. At each size
 * the inset is drawn at its own pixels (not a stretched 320x200), is never
 * narrower than small, and the layout rows hold again. `roomy`: a larger
 * size is also larger on screen. Not on the phone, whose right column
 * under the chips and the top right panel leaves under 60 px of height for
 * the picture, so medium and large keep small's footprint there.
 */
async function insetSizes(page, label, roomy) {
  const INSET = `JSON.stringify({ size: window.__avionics.state().sensor.inset,
    px: [window.__sensors.pip.width, window.__sensors.pip.height],
    css: document.querySelector('.avx-pip').getBoundingClientRect().width })`;
  let before = JSON.parse(await page.evaluate(INSET));
  const smallCss = before.css;
  check(`${label}: the inset starts small at 320x200`, before.size === 'small' && before.px.join('x') === '320x200', `${before.size} ${before.px.join('x')}`);
  for (const size of ['medium', 'large', 'small']) {
    await page.tap('KeyU');
    await page.until(`window.__avionics.state().sensor.inset === '${size}'`, 10000).catch(() => {});
    /* The panels are placed again on the change; two frames for it. */
    await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
    await page.sleep(300);
    const got = JSON.parse(await page.evaluate(INSET));
    const want = INSET_PX[size].join('x');
    const grew = !roomy || (size === 'small' ? got.css < before.css : got.css > before.css);
    check(`${label}: U gives the ${size} inset, drawn at ${want}, not narrower than small${roomy ? `, ${size === 'small' ? 'smaller' : 'larger'} on screen` : ''}`,
      got.size === size && got.px.join('x') === want && got.css >= smallCss - 0.5 && grew,
      `${got.size} ${got.px.join('x')}, ${Math.round(got.css)} css px after ${Math.round(before.css)}`);
    judge(JSON.parse(await page.evaluate(READ)), `${label} ${size} inset`);
    if (size !== 'small') {
      await shot(page, `avionics-${label}-inset-${size}`);
    }
    before = got;
  }
}

/* The phone: the layout, alone, at each inset size. */
async function phone() {
  const [width, height] = PHONE;
  console.log(`${width}x${height} phone, 7 inch`);
  const page = await openPage({ root, width, height, touch: true, seed: seed('7inch') });
  try {
    await fly(page);
    await page.until('window.__avionicsHud().on', 120000).catch(() => {});
    await page.sleep(1500);
    const got = JSON.parse(await page.evaluate(READ));
    check('phone: the 7 inch flies with the Avionics HUD', got.avx.on, `avionics ${got.avx.on}`);
    if (!got.avx.on) {
      return;
    }
    judge(got, 'phone');
    await shot(page, `avionics-${width}x${height}-phone`);
    await insetSizes(page, `${width}x${height}`, false);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('phone: no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * The owner's scene. Mission 1's first Striker is sampled twice for its
 * heading, and our Striker thrown 900 m ahead of it on that line, nose
 * on, so the two close for a quarter of a minute while the AI tracks it. (The FPV pair, 0.25 m across, is under what the sensor
 * detects at that range.)
 */
const SCENE = `JSON.stringify((() => {
  const hud = window.__avionicsHud();
  const m = window.__war().markers;
  const panels = [...document.querySelectorAll('.avx-panel')].filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
  return { hud, marks: m.marks || [], panels, vw: innerWidth, vh: innerHeight, state: window.__avionics.state().hud.state };
})())`;

/* The middle of the picture, the pilot's: between the tapes' inner
 * edges (the HUD's own frame round it), the middle third of the height. */
function judgeScene(got, label) {
  const t = got.hud.tapes;
  const third = { x: t.speed.x + t.speed.w, y: got.vh / 3, w: t.agl.x - (t.speed.x + t.speed.w), h: got.vh / 3 };
  const solid = [...(got.hud.fills || []).filter((f) => f.alpha >= 0.5), ...got.panels.map((r) => ({ ...r, alpha: 1 }))].filter((f) => meets(f, third));
  check(`${label}: nothing opaque in the middle, between the tapes (the reticle and the boxes are lines)`, solid.length === 0, solid.map((f) => `${box(f)} alpha ${f.alpha}`).join(' | '));
  const claims = got.hud.claims || [];
  const inClaim = (k) => claims.some((c) => Math.hypot(k.x - c.x, k.y - c.y) <= c.r);
  const twice = got.marks.filter((k) => !k.claimed && inClaim(k));
  const boxed = got.marks.filter((k) => k.claimed);
  check(`${label}: one marker an object (no war marker on a HUD box)`, twice.length === 0 && boxed.every((k) => inClaim(k)),
    `${claims.length} boxes, ${boxed.length} war markers stood down, ${got.marks.length - boxed.length} drawn${twice.length ? `, doubled: ${twice.map((k) => k.tag).join(',')}` : ''}`);
  const texts = got.hud.texts || [];
  const pairs = [];
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      if (meets(texts[i], texts[j])) {
        pairs.push(`"${texts[i].text}" x "${texts[j].text}"`);
      }
    }
    for (const p of got.panels) {
      if (meets(texts[i], p)) {
        pairs.push(`"${texts[i].text}" x panel ${box(p)}`);
      }
    }
  }
  check(`${label}: no two of the HUD's words overlap, nor meet a panel`, texts.length > 0 && pairs.length === 0, pairs.slice(0, 6).join(' | ') || `${texts.length} words`);
}

async function ownerScene(width, height, rooms, touch = false) {
  const label = `owner ${width}x${height}`;
  console.log(`${width}x${height}${touch ? ' phone' : ''}, the Striker, the owner's scene`);
  const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width, height, touch, seed: seed('striker2500') });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
    await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
    await fly(page);
    await page.until('window.__avionicsHud().on', 120000).catch(() => {});
    await page.evaluate("window.__warDo('start', 'itaipu-1')");
    await page.until("window.__war().view.state === 'live'", 30000);
    const them = "window.__warAt(window.__rooms().roomNow).filter((a) => a.kind === 'strike')";
    await page.until(`${them}.length >= 1`, 60000);
    const a = await page.evaluate(`${them}.map((x) => x.p)`);
    await page.sleep(1000);
    const b = await page.evaluate(`${them}.map((x) => x.p)`);
    const mid = (ps) => [0, 1, 2].map((k) => ps.reduce((sum, q) => sum + q[k], 0) / ps.length);
    const p0 = mid(a);
    const p1 = mid(b);
    const v = p1.map((x, k) => x - p0[k]);
    const vn = Math.hypot(v[0], v[2]) || 1;
    const at = [p1[0] + (v[0] / vn) * 900, p1[1] + 15, p1[2] + (v[2] / vn) * 900];
    const d = p1.map((x, k) => x - at[k]);
    const yaw = (Math.atan2(-d[0], -d[2]) * 180) / Math.PI;
    const pitch = (Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180) / Math.PI;
    /* Flying, not held: the sensor runs on the sim's clock, which a held
     * pose stops. Thrown at a cruise along the nose, it glides on at it. */
    const dn = Math.hypot(...d);
    const vel = d.map((x) => (x / dn) * CRUISE_MS);
    await page.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: ${yaw}, pitch: ${pitch}, roll: 0, vx: ${vel[0]}, vy: ${vel[1]}, vz: ${vel[2]}, hold: false, fresh: false, showCraft: true })`);
    await page.evaluate('window.__avionics.ai(true); true');
    await page.until("window.__avionicsHud().state === 'TRACK' && (window.__avionicsHud().claims || []).some((c) => c.tag)", 20000).catch(() => {});
    await page.sleep(600);
    for (const level of ['standard', 'minimal', 'full']) {
      const got = JSON.parse(await page.evaluate(SCENE));
      check(`${label} ${level}: the HUD is at ${level}, tracking`, got.hud.level === level && got.state === 'TRACK', `level ${got.hud.level}, HUD ${got.state}`);
      judgeScene(got, `${label} ${level}`);
      const tagged = (got.hud.claims || []).filter((c) => c.tag);
      if (level !== 'minimal') {
        check(`${label} ${level}: the primary's tag carries the war's kind`, tagged.length > 0 && (got.hud.texts || []).some((t) => tagged.some((c) => t.text.startsWith(c.tag))),
          tagged.map((c) => c.tag).join(',') || 'no kind');
      } else {
        check(`${label} minimal: the corner panels are hidden`, got.panels.length === 0, `${got.panels.length} shown`);
      }
      await shot(page, `owner-${width}x${height}-${level}`);
      await page.tap('KeyY');
      await page.until(`window.__avionicsHud().level !== '${level}'`, 10000).catch(() => {});
      /* The notice the key raised, gone before the next read. */
      await page.sleep(2000);
    }
    const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').avxLevel`);
    check(`${label}: Y steps standard, minimal, full and back, and the level is kept`, stored === 'standard', `stored ${stored}`);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check(`${label}: no page error`, errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

async function defaults() {
  console.log('1280x720, the default and the override');
  let page = await openPage({ root, width: 1280, height: 720, seed: seed('5inch') });
  try {
    await fly(page);
    await page.until('window.__fpvOsd().on || window.__avionicsHud().on', 120000).catch(() => {});
    const got = JSON.parse(await page.evaluate(READ));
    check('the 5 inch flies with the FPV OSD', got.osd && !got.avx.on, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
  } finally {
    await page.close();
  }
  page = await openPage({ root, width: 1280, height: 720, seed: seed('7inch') });
  try {
    await fly(page);
    await page.until('window.__avionicsHud().on', 120000).catch(() => {});
    let got = JSON.parse(await page.evaluate(READ));
    check('the 7 inch flies with the Avionics HUD', got.avx.on && !got.osd, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
    /* The navigation sources' degraded path, through the test hook. */
    await page.evaluate("window.__avionics.deny('gnss', true); true");
    await page.sleep(600);
    let st = JSON.parse(await page.evaluate('JSON.stringify(window.__avionics.state())'));
    check('GNSS denied: navigation falls back to VIO, not DEGRADED', st.tel.nav.source === 'VIO' && st.hud.state !== 'DEGRADED',
      `nav ${st.tel.nav.source}, HUD ${st.hud.state}`);
    await page.evaluate("window.__avionics.deny('vio', true); true");
    await page.sleep(600);
    st = JSON.parse(await page.evaluate('JSON.stringify(window.__avionics.state())'));
    const shown = JSON.parse(await page.evaluate(READ)).avx;
    check('GNSS and VIO denied: dead reckoning, and the HUD says DEGRADED for nav', st.tel.nav.source === 'DR'
      && shown.state === 'DEGRADED' && shown.reasons.includes('nav'), `nav ${st.tel.nav.source}, HUD ${shown.state} ${shown.reasons.join(',')}`);
    await shot(page, 'avionics-1280x720-degraded');
    await page.evaluate("window.__avionics.deny('gnss', false); window.__avionics.deny('vio', false); true");
    await page.sleep(600);
    st = JSON.parse(await page.evaluate('JSON.stringify(window.__avionics.state())'));
    check('and back to GNSS when they return', st.tel.nav.source === 'GNSS' && st.hud.state !== 'DEGRADED', `nav ${st.tel.nav.source}, HUD ${st.hud.state}`);
    await fullScreenThermal(page);
    /* The inset's size is a setting: medium survives a reload. */
    await page.tap('KeyU');
    await page.until("window.__avionics.state().sensor.inset === 'medium'", 10000).catch(() => {});
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await fly(page);
    await page.until('window.__avionicsHud().on', 120000).catch(() => {});
    const kept = JSON.parse(await page.evaluate('JSON.stringify({ size: window.__avionics.state().sensor.inset, px: [window.__sensors.pip.width, window.__sensors.pip.height] })'));
    check('the inset\'s size is kept across a reload', kept.size === 'medium' && kept.px.join('x') === '480x300', `${kept.size} ${kept.px.join('x')}`);
    /* What the menu's HUD style row writes for the seated airframe. */
    await page.evaluate(`(() => {
      const s = window.__ui.settings;
      s.hudStyleBy = { ...s.hudStyleBy, [s.airframe]: 'osd' };
      window.__ui.persistSettings();
      return true;
    })()`);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await fly(page);
    await page.until('window.__fpvOsd().on || window.__avionicsHud().on', 120000).catch(() => {});
    got = JSON.parse(await page.evaluate(READ));
    check('the pilot\'s choice for the 7 inch sticks after a reload', got.osd && !got.avx.on, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
  } finally {
    await page.close();
  }
}

const avx = readFileSync(join(root, 'src/ui/avionicshud.js'), 'utf8');
check('avionicshud.js keeps warmarkers.js\'s radar geometry',
  avx.includes(`const RADAR_PX = ${RADAR_PX};`) && avx.includes(`const RADAR_TOP_PX = ${RADAR_TOP_PX};`), `RADAR_PX ${RADAR_PX}, RADAR_TOP_PX ${RADAR_TOP_PX}`);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-avx-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
try {
  const rooms = `http://127.0.0.1:${server.port}`;
  /* --owner: the owner's scene alone, for its pictures. */
  if (!process.argv.includes('--owner')) {
    for (const [w, h] of SIZES) {
      await layout(w, h, rooms);
    }
    await defaults();
    await phone();
  }
  await ownerScene(1280, 720, rooms);
  await ownerScene(OWNER[0], OWNER[1], rooms);
  await ownerScene(PHONE[0], PHONE[1], rooms, true);
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
