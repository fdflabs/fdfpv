/*
 * render-golden.js: the page scripts/render-golden.js records and compares.
 *
 * Each module under tests/browser/render-golden/ is one src/render or
 * src/art module's cases. A case builds something from that module on a
 * stage of its own and returns a plain JSON value describing what came
 * out. The values are recorded from the code as it stands and committed
 * (tests/fixtures/render-golden/), so a later rewrite of the module has to
 * produce the same values: they pin behaviour without reading the
 * implementation.
 *
 * A case may only depend on its inputs. Anything that varies with the GPU
 * (a driver's extension list, a timer) stays out of the value, because CI
 * renders on SwiftShader and this machine on a card, and both must agree.
 *
 * The page takes the case modules to load from ?modules=a,b so that a new
 * module's cases are a new file and touch nothing else.
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

import * as THREE from 'three';

/* One renderer for every case, at a fixed size, as a stage. */
const W = 640;
const H = 360;
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const stage = { renderer, W, H };

const modules = (new URLSearchParams(location.search).get('modules') || '').split(',').filter(Boolean);
const cases = {};
for (const name of modules) {
  const mod = await import(`./render-golden/${name}.js`);
  for (const [k, fn] of Object.entries(mod.cases(stage))) {
    cases[`${name}/${k}`] = fn;
  }
}

/* Decodes a PNG data URL into RGBA pixels. */
async function pixelsOfPng(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

window.__golden = {
  names: () => Object.keys(cases),
  run: async (name) => JSON.stringify(await cases[name]()),
  /* How two recorded pictures differ: same size, the largest channel
   * difference, and how many pixels differ at all. */
  compareImages: async (a, b) => {
    const [pa, pb] = await Promise.all([pixelsOfPng(a), pixelsOfPng(b)]);
    if (pa.w !== pb.w || pa.h !== pb.h) {
      return { same: false, size: [pa.w, pa.h, pb.w, pb.h] };
    }
    let maxDiff = 0;
    let pixels = 0;
    for (let i = 0; i < pa.data.length; i += 4) {
      let worst = 0;
      for (let c = 0; c < 4; c++) {
        worst = Math.max(worst, Math.abs(pa.data[i + c] - pb.data[i + c]));
      }
      maxDiff = Math.max(maxDiff, worst);
      pixels += worst > 0 ? 1 : 0;
    }
    return { same: true, maxDiff, pixels, of: pa.w * pa.h };
  },
};
window.__goldenReady = true;
