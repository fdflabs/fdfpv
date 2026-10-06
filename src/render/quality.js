/*
 * quality.js: the graphics presets, Low, Medium and High, defined here and
 * nowhere else.
 *
 * Three named presets rather than a page of sliders: the menu is driven
 * from a radio, and console racers settled long ago on a few named levels
 * with a line saying who each is for. Switching preset rebuilds the world,
 * because what it changes (the shadow map, the ink outline, bloom) is set
 * when the world is built.
 *
 * Every preset is WebGL and none needs a discrete GPU, WebGPU or compute.
 * failIfMajorPerformanceCaveat stays false, so a machine with only a
 * software rasteriser still boots. The session asks for high-performance,
 * so a laptop with two GPUs draws on the discrete one; the presets scale
 * resolution and effects, never the device. Secondary contexts (orbit
 * thumbnails, the settings craft) ask for low-power so they do not take
 * the Steam Deck's only GPU.
 *
 * The machines each preset is built for, at 60 fps where the hardware
 * holds it (a Deck runs its 40 Hz mode): High a 2021 PC or strong laptop
 * (RTX 3060 class, Intel Xe, M1), Medium a 2020 laptop iGPU (UHD 620,
 * Iris Plus, MX350), Low the Deck's APU at 800p, where fill rate is what
 * runs out. Grass density is not a lever at any preset.
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

import { str } from '../strings/index.js';

export const GRAPHICS_IDS = ['low', 'medium', 'high'];

/*
 * One row per preset. The shadow map's size decides the rest of the
 * shadow fields (none at all at size 0), and every preset shades the same
 * 72 m around the craft.
 *
 * ratioCap and renderScale: the device pixel ratio is capped, then scaled.
 * Low's 1 then 0.85 puts a Deck's 1280 by 800 at about 1088 by 680.
 *
 * pixelBudget is the most pixels a frame may render, whatever the ratio
 * says: 1920 by 1080, the resolution at which the render targets were
 * brought under the project's 120 MB ceiling, so no screen renders more
 * than the one that budget was measured on. A 1080p screen at a ratio of 1
 * sits on it untouched; a 1440 by 900 laptop at 2x comes down from 5.2 Mpx.
 * Low's is 1080p times its own 0.85 squared, which leaves a 1080p screen at
 * its authored ratio and stays above the 1.2 Mpx floor below.
 *
 * Notes never promise planting: no world has a planting lever since the
 * freestyle town went (2026-09-28). scripts/quality-check.js holds them to
 * that.
 */
const ROWS = [
  { id: 'low', name: 'Low', note: 'quality.steam_deck_and_similar_handhelds_lower', ratioCap: 1, renderScale: 0.85, shadowMap: 0, outline: false, bloom: false, pixelBudget: 1.5e6 },
  { id: 'medium', name: 'Medium', note: 'quality.a_2020_era_laptop_with_integrated', ratioCap: 1.25, renderScale: 1, shadowMap: 1024, outline: true, bloom: false, pixelBudget: 2.07e6 },
  { id: 'high', name: 'High', note: 'quality.a_2021_era_pc_or_a', ratioCap: 2, renderScale: 1, shadowMap: 2048, outline: true, bloom: true, pixelBudget: 2.07e6 },
];

/* Built once: a preset is the same object every time it is asked for. */
const PRESETS = Object.fromEntries(ROWS.map((r) => [r.id, {
  id: r.id,
  name: r.name,
  note: str(r.note),
  pixelRatioCap: r.ratioCap,
  resolutionScale: r.renderScale,
  shadows: r.shadowMap > 0,
  field: {
    shadowMap: r.shadowMap,
    shadowFilter: r.shadowMap > 0 ? 'pcfsoft' : 'none',
    shadowHalf: 72,
    outline: r.outline,
    bloom: r.bloom,
    pixelBudget: r.pixelBudget,
  },
}]));

/* Anything that is not a preset's id, in any case, is High. */
export function normalizeGraphics(id) {
  const lower = String(id || '').toLowerCase();
  return Object.hasOwn(PRESETS, lower) ? lower : 'high';
}

export function qualityFor(id) {
  return PRESETS[normalizeGraphics(id)];
}

export function graphicsLabel(id) {
  return qualityFor(id).name;
}

export function graphicsNote(id) {
  return qualityFor(id).note;
}

/*
 * The preset a first run starts on. The caller decides whether this is a
 * first run: a stored choice, even from a save older than the setting,
 * is honoured instead. Handhelds and phones start Low, because the first
 * flight has to hold its frame rate and a phone GPU behind a 3x screen
 * does not hold High. An iPad reports itself as a Mac and gives itself
 * away by touch points no Mac has.
 */
export function detectDefaultGraphics() {
  if (typeof navigator === 'undefined') {
    return 'high';
  }
  const agent = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform;
  const handheld = /Steam Deck|SteamOS/i.test(agent)
    || /Android|iPhone|iPod/i.test(agent)
    || ((navigator.maxTouchPoints || 0) > 2 && /Mac/i.test(agent))
    || Boolean(platform && /Steam/i.test(String(platform)));
  return handheld ? 'low' : 'high';
}

/* No frame is paced below this many pixels to buy time (rubric F4): a
 * 1080p panel is not dropped to 720p. */
const PACING_FLOOR_PIXELS = 1.2e6;

/* Below half a pixel per CSS pixel, text drawn into the world is no longer
 * legible. */
const MIN_RATIO = 0.5;

/* The window's size in CSS pixels, when there is a window with one. */
function windowViewport() {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

/*
 * The renderer's pixel ratio for a preset. `scale` is the pilot's Render
 * scale, multiplied in rather than replacing the preset's own scale: the
 * preset speaks for a class of machine, the slider for one pilot's.
 * `viewport` defaults to the window. `dyn` is dynamic resolution's factor.
 *
 * In order: the capped and scaled ratio; then the pixel budget, a ceiling
 * that only touches a frame over it, applied to monitors at 1x too (a
 * budget that let 1440p and 4K through would not hold the 120 MB ceiling);
 * then dynamic resolution, after the budget so a budget clamped screen can
 * still drop, but never below the pacing floor, nor raising a ratio already
 * under it; and the legibility floor over all.
 */
export function pixelRatioFor(id, scale = 1, viewport = null, dyn = 1) {
  const preset = qualityFor(id);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const vp = viewport || windowViewport();
  const area = vp && vp.w > 0 && vp.h > 0 ? vp.w * vp.h : 0;
  let ratio = Math.min(dpr, preset.pixelRatioCap) * preset.resolutionScale * scale;
  if (area > 0) {
    ratio = Math.min(ratio, Math.sqrt(preset.field.pixelBudget / area));
  }
  if (dyn < 1) {
    const lowest = area > 0 ? Math.min(Math.sqrt(PACING_FLOOR_PIXELS / area), ratio) : ratio;
    ratio = Math.max(lowest, ratio * dyn);
  }
  return Math.max(MIN_RATIO, ratio);
}

export function applyPixelRatio(shell, id, scale = 1, viewport = null, dyn = 1) {
  const ratio = pixelRatioFor(id, scale, viewport, dyn);
  shell.pixelRatio = ratio;
  shell.renderer.setPixelRatio(ratio);
  return ratio;
}
