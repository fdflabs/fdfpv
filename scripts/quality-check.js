/*
 * quality-check.js: the graphics presets (src/render/quality.js) and GPU
 * detection (src/render/gpuinfo.js), held to the machines they name. Every
 * preset has a field pixel budget, no real screen exceeds the render target
 * memory budget, screens at or below 1080p keep the authored ratio, the
 * Render scale slider still scales, no note promises a planting lever, and
 * real renderer strings are classified integrated or discrete correctly.
 * Arithmetic on the table only. Run with npm run lint:quality.
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

/*
 * The table is numbers with a comment saying which machine each row is for,
 * and nothing checked that the numbers still meant what the comment said.
 * Three defects lived there at once, all found by reading: the race field
 * had no pixel budget, so a 1440x900 laptop at 2x rendered 5.2 Mpx through
 * three full resolution passes, about twice the target ceiling; detection
 * returned High for everything that was not a Deck, phone or iPad, including
 * the integrated chips the Medium row names; and a note promised thinned
 * planting on a map with no planting lever. Those are arithmetic, not
 * opinion, so they are checked every run. A frame is not measured: that
 * needs a GPU, and this has to run on a laptop with no browser open.
 */

import { GRAPHICS_IDS, qualityFor, pixelRatioFor } from '../src/render/quality.js';
import { isIntegratedGpu } from '../src/render/gpuinfo.js';

/*
 * From the P5 budget in tests/thresholds.json: the field's chain at 1600x900
 * measured 90.2 MB, 33.6 MB of it the fixed 2048 shadow map, so 56.6 MB is
 * carried by 1.44 Mpx (two RGBA16F composer targets, the normal target and
 * the bloom ladder). The shadow map is fixed size and added separately.
 */
const BYTES_PER_PIXEL = 56.6e6 / 1.44e6;
const BUDGET_MB = 120;
const SHADOW_BYTES_PER_TEXEL = 8;
/* Screens at or below this many pixels are 1080p or smaller. */
const FULL_HD_PIXELS = 2.074e6;

/* Real configurations: the MacBook Air, the commonest laptop panel, an iPhone. */
const SCREENS = [
  ['MacBook Air 1440x900', 1440, 900, 2],
  ['laptop 1366x768', 1366, 768, 1],
  ['desktop 1920x1080', 1920, 1080, 1],
  ['desktop 2560x1440', 2560, 1440, 1],
  ['desktop 3840x2160', 3840, 2160, 1],
  ['Steam Deck 1280x800', 1280, 800, 1],
  ['iPhone 430x932', 430, 932, 3],
].map(([name, w, h, dpr]) => ({ name, w, h, dpr }));

/*
 * Real browser strings. Discrete parts are here because patterns share words
 * with integrated ones: "Radeon Graphics" is an APU and "Radeon RX 7900" is
 * not, "Iris Xe" is integrated and "Arc A770" is not.
 */
const INTEGRATED = [
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) HD Graphics 520, D3D11)',
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX Vega 8 Graphics, D3D11)',
  'Mali-G78',
  'Adreno (TM) 650',
  'PowerVR Rogue GE8320',
];
const DISCRETE = [
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, D3D11)',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
  'Apple GPU',
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
];

/*
 * No world has a planting lever: the freestyle town's foliage setting was the
 * only one and went with the town. A note naming a lever the preset does not
 * pull sends a pilot looking for a change that never comes.
 */
const PLANTING = /plant|foliage|tree|grass/i;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

/* pixelRatioFor reads the device ratio and viewport from the global window only. */
function ratioOn(id, scale, w, h, dpr) {
  globalThis.window = { devicePixelRatio: dpr, innerWidth: w, innerHeight: h };
  return pixelRatioFor(id, scale);
}

for (const id of GRAPHICS_IDS) {
  const budget = qualityFor(id).field?.pixelBudget;
  const finite = Number.isFinite(budget);
  record(`${id}: field has a pixel budget`, finite && budget > 0,
    finite ? `${(budget / 1e6).toFixed(2)} Mpx` : 'MISSING, so a dense panel renders unbounded');
}

/* This is the check that would have caught the 5.2 Mpx MacBook (about 237 MB against 120). */
for (const id of GRAPHICS_IDS) {
  const { shadowMap } = qualityFor(id).field;
  for (const { name, w, h, dpr } of SCREENS) {
    const pr = ratioOn(id, 1, w, h, dpr);
    const mpx = w * h * pr * pr / 1e6;
    const mb = mpx * BYTES_PER_PIXEL + shadowMap * shadowMap * SHADOW_BYTES_PER_TEXEL / 1e6;
    const over = mb > BUDGET_MB ? `  <-- over the ${BUDGET_MB} MB budget` : '';
    record(`${id}: ${name}`, mb <= BUDGET_MB,
      `ratio ${pr.toFixed(2)}, ${mpx.toFixed(2)} Mpx, about ${mb.toFixed(0)} MB of targets${over}`);
  }
}

/*
 * The budgets are the 1080p pixel count the ceiling was measured at, so the
 * fix for dense panels must not quietly change the frame everything else was
 * measured on. Low's own 0.85 downscale is a table choice, not a clamp.
 */
for (const id of GRAPHICS_IDS) {
  const preset = qualityFor(id);
  const authored = Math.min(1, preset.pixelRatioCap) * preset.resolutionScale;
  for (const { name, w, h } of SCREENS.filter((s) => s.dpr === 1 && s.w * s.h <= FULL_HD_PIXELS)) {
    const pr = ratioOn(id, 1, w, h, 1);
    record(`${id}: ${name} keeps its authored ratio`, Math.abs(pr - authored) < 0.001,
      `${pr.toFixed(3)} against the table's ${authored.toFixed(3)}`);
  }
}

for (const id of GRAPHICS_IDS) {
  const full = ratioOn(id, 1, 1920, 1080, 1);
  const half = ratioOn(id, 0.5, 1920, 1080, 1);
  record(`${id}: Render scale still scales`, half < full,
    `100 percent gives ${full.toFixed(3)}, 50 percent gives ${half.toFixed(3)}`);
}

for (const id of GRAPHICS_IDS) {
  const planting = PLANTING.test(String(qualityFor(id).note ?? ''));
  record(`${id}: note does not promise a planting lever no world has`, !planting,
    planting ? 'promises planting, and no world has a planting lever' : 'no planting claim');
}

for (const raw of INTEGRATED) {
  record(`integrated: ${raw.slice(0, 54)}`, isIntegratedGpu(raw) === true,
    'recognised, so a detected High comes down to Medium');
}
for (const raw of DISCRETE) {
  record(`discrete:   ${raw.slice(0, 54)}`, isIntegratedGpu(raw) === false,
    'left alone, so it keeps the authored look');
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('quality-check: the presets, against the machines they name');
console.log('');
for (const { name, ok, detail } of results) {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name.padEnd(width)}  ${detail}`);
}
const clean = results.filter((r) => r.ok).length;
console.log('');
console.log(`${clean} of ${results.length} checks clean`);
process.exit(clean === results.length ? 0 : 1);
