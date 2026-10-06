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

window.__golden = {
  names: () => Object.keys(cases),
  run: async (name) => JSON.stringify(await cases[name]()),
};
window.__goldenReady = true;
