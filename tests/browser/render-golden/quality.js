/*
 * render-golden/quality.js: src/render/quality.js's presets whole, the
 * names it accepts, first run detection on the user agents it tells apart,
 * and the pixel ratio over a grid of screens, render scales and dynamic
 * resolution steps.
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

import {
  GRAPHICS_IDS, normalizeGraphics, qualityFor, graphicsLabel, graphicsNote,
  detectDefaultGraphics, pixelRatioFor, applyPixelRatio,
} from '../../../src/render/quality.js';

const IDS = ['low', 'medium', 'high', 'LOW', 'Medium', ' high', 'ultra', '', null, undefined, 0, 'high ', 'constructor', '__proto__', 'toString'];

/* The page's own window, its pixel ratio and size, replaced for the length
 * of `fn` and put back. */
function withWindow({ dpr, w, h }, fn) {
  const keep = ['devicePixelRatio', 'innerWidth', 'innerHeight'].map((k) => [k, Object.getOwnPropertyDescriptor(window, k)]);
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    for (const [k, d] of keep) {
      if (d) {
        Object.defineProperty(window, k, d);
      } else {
        delete window[k];
      }
    }
  }
}

function withNavigator(fake, fn) {
  const keep = Object.getOwnPropertyDescriptor(window, 'navigator');
  Object.defineProperty(window, 'navigator', { value: fake, configurable: true });
  try {
    return fn();
  } finally {
    if (keep) {
      Object.defineProperty(window, 'navigator', keep);
    } else {
      delete window.navigator;
    }
  }
}

const AGENTS = {
  windows: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', maxTouchPoints: 0 },
  mac: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', maxTouchPoints: 0 },
  ipad: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', maxTouchPoints: 5 },
  macTwoTouch: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 2 },
  iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 },
  ipod: { userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', maxTouchPoints: 5 },
  android: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36', maxTouchPoints: 5 },
  steamDeck: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; Steam Deck) AppleWebKit/537.36 Chrome/129.0', maxTouchPoints: 10 },
  steamOs: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) SteamOS/3.5', maxTouchPoints: 0 },
  steamPlatform: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0', maxTouchPoints: 0, userAgentData: { platform: 'SteamOS Holo' } },
  linuxPlatform: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0', maxTouchPoints: 0, userAgentData: { platform: 'Linux' } },
  emptyPlatform: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', userAgentData: { platform: '' } },
  bare: {},
};

const DPRS = [1, 1.25, 1.5, 2, 2.625, 3, 0];
const SCALES = [1, 0.85, 0.75, 0.5, 0.3];
const VIEWPORTS = [null, { w: 1280, h: 800 }, { w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 }, { w: 2560, h: 1440 }, { w: 3840, h: 2160 }, { w: 430, h: 932 }, { w: 0, h: 0 }, { w: 800, h: 0 }];
const DYNS = [1, 0.9, 0.7, 0.5, 0.2, 1.2];
const WINDOW = { w: 1600, h: 900 };

export function cases() {
  return {
    ids: () => GRAPHICS_IDS,
    presets: () => GRAPHICS_IDS.map((id) => qualityFor(id)),
    names: () => IDS.map((id) => [String(id), normalizeGraphics(id), qualityFor(id).id, graphicsLabel(id), graphicsNote(id)]),
    /* Callers may hold on to a preset: every name for one gives the same
     * object. */
    identity: () => IDS.map((id) => [String(id), qualityFor(id) === qualityFor(normalizeGraphics(id))]),
    detect: () => Object.fromEntries(Object.entries(AGENTS).map(([k, nav]) => [k, withNavigator(nav, detectDefaultGraphics)])),
    pixelRatio: () => {
      const rows = [];
      for (const id of GRAPHICS_IDS) {
        for (const dpr of DPRS) {
          withWindow({ dpr, ...WINDOW }, () => {
            for (const scale of SCALES) {
              for (const vp of VIEWPORTS) {
                rows.push([id, dpr, scale, vp && `${vp.w}x${vp.h}`, ...DYNS.map((dyn) => pixelRatioFor(id, scale, vp, dyn))]);
              }
            }
          });
        }
      }
      return rows;
    },
    /* The window itself as the viewport, at sizes that leave it null. */
    pixelRatioWindow: () => [[1920, 1080], [0, 0], [3840, 0]].map(([w, h]) => withWindow({ dpr: 2, w, h }, () => [w, h, pixelRatioFor('high'), pixelRatioFor('medium', 0.5, null, 0.5)])),
    defaults: () => withWindow({ dpr: 1.5, w: 2560, h: 1440 }, () => [pixelRatioFor('low'), pixelRatioFor('high'), pixelRatioFor()]),
    apply: () => withWindow({ dpr: 2, w: 1440, h: 900 }, () => {
      const set = [];
      const shell = { pixelRatio: 0, renderer: { setPixelRatio: (pr) => set.push(pr) } };
      const back = applyPixelRatio(shell, 'high', 0.75, { w: 2560, h: 1440 }, 0.5);
      const back2 = applyPixelRatio(shell, 'low');
      return { back, back2, set, kept: shell.pixelRatio };
    }),
  };
}
