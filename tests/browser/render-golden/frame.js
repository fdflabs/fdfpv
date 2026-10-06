/*
 * render-golden/frame.js: every conversion in src/render/frame.js over a
 * grid of inputs, signed zeros told apart, and the objects they write into
 * handed back.
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
import * as frame from '../../../src/render/frame.js';

const VALUES = [0, -0, 1, -2.5, 0.1, 1e-300, 12345.678, -Infinity, NaN];
/* JSON has no -0, so zeros carry their sign as text. */
const tag = (v) => (Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : v);
const triples = [];
for (let i = 0; i < VALUES.length; i++) {
  triples.push([VALUES[i], VALUES[(i + 3) % VALUES.length], VALUES[(i + 5) % VALUES.length]]);
}
triples.push([1, 2, 3], [-0.25, 7, -9.5]);

function intoVector(fn, args) {
  const out = new THREE.Vector3(9, 9, 9);
  const back = fn(...args, out);
  return [back === out, tag(out.x), tag(out.y), tag(out.z)];
}

function intoPlain(fn, args) {
  const out = { x: 9, y: 9, z: 9, w: 9, extra: 1 };
  const back = fn(...args, out);
  return [back === out, ...Object.keys(out).map((k) => `${k}=${tag(out[k])}`)];
}

function intoQuat(fn, args) {
  const out = new THREE.Quaternion(9, 9, 9, 9);
  const back = fn(...args, out);
  return [back === out, tag(out.x), tag(out.y), tag(out.z), tag(out.w)];
}

export function cases() {
  return {
    exports: () => Object.keys(frame).sort(),
    scale: () => [frame.WORLD_SCALE, ...VALUES.map((v) => tag(frame.simLenToWorld(v)))],
    simPosToThree: () => triples.map((t) => intoVector(frame.simPosToThree, t)),
    docPosToThree: () => triples.map((t) => intoVector(frame.docPosToThree, t)),
    bodyPosToModel: () => triples.map((t) => frame.bodyPosToModel(...t).map(tag)),
    threePosToSim: () => triples.map((t) => intoPlain(frame.threePosToSim, t)),
    threeDirToSim: () => triples.map((t) => intoPlain(frame.threeDirToSim, t)),
    threePosToDoc: () => triples.map((t) => intoPlain(frame.threePosToDoc, t)),
    simQuatToThree: () => triples.map((t) => intoQuat(frame.simQuatToThree, [t[0], ...t])),
    docQuatToThree: () => triples.map((t) => intoQuat(frame.docQuatToThree, [t[2], ...t])),
    threeQuatToDoc: () => triples.map((t) => intoPlain(frame.threeQuatToDoc, [...t, t[1]])),
  };
}
