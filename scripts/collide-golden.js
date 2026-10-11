/*
 * collide-golden.js: src/game/collide.js held to the exact outputs it gave
 * when tests/fixtures/collide-golden.json was written. npm run collide:golden.
 *
 * collide.js is the craft's whole meeting with the world: the sweep that
 * says what the craft touched this frame and the normal and depth the
 * contact is solved with, the gap and axis queries trick detection reads,
 * the turtle and upright quaternions written into the plant's pose, the
 * clip watch, and the airframe's live dimensions. Its numbers feed the
 * plant, so a recorded flight replays bit for bit only while every one of
 * them does. crash-rules-selftest, turned-box-check, grid-check and
 * build-selftest check what those numbers mean; this pins the numbers
 * themselves, so a clean room rewrite has to give the same doubles, the
 * same signed zeros, the same tie picks and the same throws.
 *
 * What a case says is only what a caller can see: return values, the hit
 * and axis report fields, the views (fax ... fw1, pass) to their length
 * after every change of set, counts, stats(), grid.size and the identity
 * of its cells across set changes, moving box centres, every thrown
 * message, the thirteen airframe bindings through the live namespace, the
 * shapes and identities of returned objects, and the arguments a callback
 * was handed. Internal fields are never read. Inputs are the worlds the
 * node checks build (crash-rules-selftest, build-selftest, grid-check,
 * turned-box-check, buildWorld from wall-check, orbit-check and
 * path-check), the walls src/render/library/roofs.js stands under roofs and the
 * turned boxes src/maps/interior/sink.js makes, seeded worlds of every
 * primitive and kind, every airframe in configs/airframes.js, and every
 * fixed wing's part hull as the plant reports it.
 *
 * Two families pin things the spec calls judgement calls, each kept in
 * cases of its own so they can be dropped alone: prebuild-* (count and
 * baseCount undefined before build, hitPen undefined until the first hit,
 * hitArmX..Z never reset) and nxyz-* (nx, ny, nz after the queries that
 * use the axis to point arithmetic internally, which only axisToPoint
 * promises).
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { goldenMain, seeded } from './lib/golden.js';
import { buildWorld } from './lib/flightrig.js';
import * as m from '../src/game/collide.js';
import { airframeHull, THREE_BODY } from '../src/game/airframehull.js';
import { simLenToWorld } from '../src/render/frame.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { CRAFT } from '../tests/crash/scenarios.js';
import {
  flatTop, gableTop, pyramidTop, recordAt, shedTop, standWalls,
} from '../src/render/library/roofs.js';
import { solidBox } from '../src/maps/interior/sink.js';

const { Colliders, KINDS } = m;
const FIXTURE = new URL('../tests/fixtures/collide-golden.json', import.meta.url);

/*
 * Every fixed wing's part table as dist/sim.wasm reports it
 * (src/game/damage.js table(), read after sim_set_airframe(simId) and
 * sim_reset()), each part [boxMin x, y, z, boxMax x, y, z] in plant body
 * metres; main.js seatCraftParts turns the same table into the hull it
 * hands setCraftParts. Copied here once rather than read from the plant on
 * every run, so a change to the plant's parts cannot move a record that is
 * about collide.js.
 */
const HULL_TABLES = {
  sky1800: [
    [-0.235, -0.068, -0.1195, 0.385, 0.068, 0.06],
    [-0.163, 0.068, 0.03, 0.0817, 0.9, 0.098],
    [-0.163, -0.9, 0.03, 0.0817, -0.068, 0.098],
    [-0.16, 0.4, 0.05, -0.1, 0.82, 0.075],
    [-0.16, -0.82, 0.05, -0.1, -0.4, 0.075],
    [-0.8, -0.238, 0.045, -0.02, 0.238, 0.057],
    [-0.785, -0.228, 0.045, -0.705, 0.228, 0.057],
    [-0.835, -0.228, 0.046, -0.785, 0.228, 0.056],
    [-0.79, 0.228, 0.029, -0.69, 0.236, 0.219],
    [-0.79, -0.236, 0.029, -0.69, -0.228, 0.219],
    [-0.84, 0.228, 0.035, -0.79, 0.236, 0.21],
    [-0.84, -0.236, 0.035, -0.79, -0.228, 0.21],
    [-0.26, -0.018, 0.014, -0.235, 0.018, 0.05],
    [-0.268, -0.1397, -0.10769999999999999, -0.268, 0.1397, 0.1717],
    [0.02, -0.025, -0.09, 0.18, 0.025, -0.04],
    [0.092, -0.05, 0.03, 0.325, 0.05, 0.06],
    [0.345, -0.017, -0.017, 0.385, 0.007, 0.007],
    [-0.15, -0.02, 0.055, -0.15, -0.02, 0.145],
  ],
  cub1400: [
    [-0.35, -0.0475, -0.056, 0.22, 0.0475, 0.098],
    [-0.604, -0.03, -0.03, -0.35, 0.03, 0.07],
    [-0.542, -0.189, 0.037, -0.482, 0.189, 0.049],
    [-0.604, -0.189, 0.038, -0.542, 0.189, 0.048],
    [-0.578, -0.004, 0.04, -0.52, 0.004, 0.16],
    [-0.64, -0.004, 0.006, -0.578, 0.004, 0.16],
    [-0.1485, 0.048, 0.087, 0.06, 0.7, 0.123],
    [-0.1485, -0.7, 0.087, 0.06, -0.048, 0.123],
    [-0.1485, 0.36, 0.093, -0.09, 0.645, 0.11],
    [-0.1485, -0.645, 0.093, -0.09, -0.36, 0.11],
    [0.2, -0.018, -0.016, 0.226, 0.018, 0.02],
    [0.23, -0.1397, -0.1377, 0.23, 0.1397, 0.1417],
    [0.07, -0.017, -0.054, 0.175, 0.017, -0.02],
    [-0.1, -0.045, 0.08, 0.06, 0.045, 0.1],
    [0.06, 0.03, -0.1677, 0.09, 0.13, -0.05],
    [0.06, -0.13, -0.1677, 0.09, -0.03, -0.05],
    [-0.608, -0.004, -0.039, -0.584, 0.004, -0.021],
    [0.15, -0.01, 0.047, 0.177, 0.01, 0.067],
    [-0.16, 0, 0.07, -0.16, 0, 0.14],
  ],
  radian2000: [
    [-0.3, -0.042, -0.052, 0.2945, 0.042, 0.07],
    [-0.7795, -0.02, 0.01, -0.3, 0.02, 0.05],
    [-0.7395, -0.2385, 0.07, -0.6515, 0.2385, 0.08],
    [-0.7685, -0.2385, 0.071, -0.7395, 0.2385, 0.079],
    [-0.78, -0.004, 0.045, -0.55, 0.004, 0.268],
    [-0.8315, -0.004, 0.095, -0.785, 0.004, 0.2],
    [-0.137, 0.042, 0.021, 0.063, 1, 0.14],
    [-0.137, -1, 0.021, 0.063, -0.042, 0.14],
    [-0.137, 0.55, 0.06, -0.087, 0.95, 0.11],
    [-0.137, -0.95, 0.06, -0.087, -0.55, 0.11],
    [0.255, -0.015, -0.023, 0.285, 0.015, 0.007],
    [0.293, -0.1238, -0.1318, 0.293, 0.1238, 0.11579999999999999],
    [0.08, -0.015, -0.035, 0.17, 0.015, -0.005],
    [0.067, -0.04, 0.03, 0.2725, 0.04, 0.071],
    [0.215, -0.01, 0.025, 0.24, 0.01, 0.045],
    [-0.05, 0, 0.06, -0.05, 0, 0.13],
  ],
  bramor2300: [
    [-0.332, -0.3, -0.065, 0.4097, 0.3, 0.087],
    [-0.467, 0.3, -0.009, 0.05, 1.15, 0.025],
    [-0.467, -1.15, -0.009, 0.05, -0.3, 0.025],
    [-0.46, 0.45, 0, -0.28, 1.1, 0.02],
    [-0.46, -1.1, 0, -0.28, -0.45, 0.02],
    [-0.557, 1.135, 0.014, -0.353, 1.15, 0.25],
    [-0.557, -1.15, 0.014, -0.353, -1.135, 0.25],
    [-0.345, -0.025, 0.062, -0.32, 0.025, 0.112],
    [-0.35, -0.1524, -0.06540000000000001, -0.35, 0.1524, 0.2394],
    [-0.05, -0.045, -0.05, 0.15, 0.045, 0.03],
    [0.01, -0.05, 0.06, 0.17, 0.05, 0.072],
    [0.3097, -0.05, -0.062, 0.4117, 0.05, 0.038],
    [-0.06, -0.041, 0.07, -0.06, -0.041, 0.11],
  ],
  slowstick1180: [
    [-0.25, -0.005, -0.0075, 0.286, 0.005, 0.0025],
    [-0.61, -0.005, -0.0075, -0.25, 0.005, 0.0025],
    [-0.537, -0.2, 0.0025, -0.46, 0.2, 0.0075],
    [-0.6, -0.22, 0.0025, -0.537, 0.22, 0.0075],
    [-0.54, -0.0025, 0.0075, -0.452, 0.0025, 0.1975],
    [-0.632, -0.0025, 0.0075, -0.54, 0.0025, 0.1975],
    [-0.2033, -0.588, 0.0275, 0.1, 0.588, 0.15],
    [0.258, -0.012, -0.03, 0.3, 0.012, 0.005],
    [0.31, -0.1397, -0.1422, 0.31, 0.1397, 0.1372],
    [0.119, -0.015, -0.0245, 0.191, 0.015, -0.0075],
    [0.105, 0, -0.1625, 0.195, 0.09, -0.0075],
    [0.105, -0.09, -0.1625, 0.195, 0, -0.0075],
    [-0.581, -0.004, -0.072, -0.555, 0.004, -0.0075],
    [0.205, -0.009, 0.0065, 0.232, 0.009, 0.0265],
    [-0.1, 0, 0.0025, -0.1, 0, 0.0725],
  ],
  timber1500: [
    [-0.36, -0.057, -0.07, 0.28, 0.057, 0.074],
    [-0.65, -0.035, -0.04, -0.36, 0.035, 0.05],
    [-0.605, -0.28, 0, -0.515, 0.28, 0.012],
    [-0.665, -0.28, 0.001, -0.605, 0.28, 0.011],
    [-0.65, -0.005, 0.05, -0.54, 0.005, 0.195],
    [-0.715, -0.005, -0.036, -0.65, 0.005, 0.195],
    [-0.18, 0.057, 0.023, 0.076, 0.7775, 0.097],
    [-0.18, -0.7775, 0.023, 0.076, -0.057, 0.097],
    [-0.18, 0.34, 0.07, -0.115, 0.7, 0.09],
    [-0.18, -0.7, 0.07, -0.115, -0.34, 0.09],
    [0.255, -0.02, -0.02, 0.285, 0.02, 0.02],
    [0.29, -0.1397, -0.1397, 0.29, 0.1397, 0.1397],
    [0.09, -0.022, -0.05, 0.21, 0.022, -0.01],
    [-0.18, -0.05, 0.055, 0.063, 0.05, 0.074],
    [0.03, 0.03, -0.232, 0.08, 0.169, -0.07],
    [0.03, -0.169, -0.232, 0.08, -0.03, -0.07],
    [-0.665, -0.006, -0.086, -0.635, 0.006, -0.04],
    [0.19, -0.01, 0.039, 0.217, 0.01, 0.059],
    [-0.2, 0, 0.06, -0.2, 0, 0.13],
  ],
  timber1500f: [
    [-0.36, -0.057, -0.04340000000000001, 0.28, 0.057, 0.1006],
    [-0.65, -0.035, -0.013400000000000002, -0.36, 0.035, 0.0766],
    [-0.605, -0.28, 0.0266, -0.515, 0.28, 0.038599999999999995],
    [-0.665, -0.28, 0.0276, -0.605, 0.28, 0.037599999999999995],
    [-0.65, -0.005, 0.0766, -0.54, 0.005, 0.22160000000000002],
    [-0.715, -0.005, -0.009399999999999999, -0.65, 0.005, 0.22160000000000002],
    [-0.18, 0.057, 0.0496, 0.076, 0.7775, 0.1236],
    [-0.18, -0.7775, 0.0496, 0.076, -0.057, 0.1236],
    [-0.18, 0.34, 0.0966, -0.115, 0.7, 0.1166],
    [-0.18, -0.7, 0.0966, -0.115, -0.34, 0.1166],
    [0.255, -0.02, 0.006599999999999998, 0.285, 0.02, 0.0466],
    [0.29, -0.1397, -0.11309999999999999, 0.29, 0.1397, 0.1663],
    [0.09, -0.022, -0.023400000000000004, 0.21, 0.022, 0.016599999999999997],
    [-0.18, -0.05, 0.0816, 0.063, 0.05, 0.1006],
    [0.19, -0.01, 0.06559999999999999, 0.217, 0.01, 0.0856],
    [-0.2, 0, 0.0866, -0.2, 0, 0.15660000000000002],
    [-0.39, 0.13749999999999998, -0.2484, 0.33, 0.2225, -0.1734],
    [-0.39, -0.2225, -0.2484, 0.33, -0.13749999999999998, -0.1734],
  ],
  cub1400f: [
    [-0.35, -0.0475, -0.0296, 0.22, 0.0475, 0.12440000000000001],
    [-0.604, -0.03, -0.003599999999999999, -0.35, 0.03, 0.09640000000000001],
    [-0.542, -0.189, 0.0634, -0.482, 0.189, 0.0754],
    [-0.604, -0.189, 0.0644, -0.542, 0.189, 0.0744],
    [-0.578, -0.004, 0.0664, -0.52, 0.004, 0.1864],
    [-0.64, -0.004, 0.0324, -0.578, 0.004, 0.1864],
    [-0.1485, 0.048, 0.1134, 0.06, 0.7, 0.1494],
    [-0.1485, -0.7, 0.1134, 0.06, -0.048, 0.1494],
    [-0.1485, 0.36, 0.1194, -0.09, 0.645, 0.1364],
    [-0.1485, -0.645, 0.1194, -0.09, -0.36, 0.1364],
    [0.2, -0.018, 0.0104, 0.226, 0.018, 0.0464],
    [0.23, -0.1397, -0.11129999999999998, 0.23, 0.1397, 0.1681],
    [0.07, -0.017, -0.0276, 0.175, 0.017, 0.0063999999999999994],
    [-0.1, -0.045, 0.1064, 0.06, 0.045, 0.1264],
    [0.15, -0.01, 0.07339999999999999, 0.177, 0.01, 0.09340000000000001],
    [-0.16, 0, 0.09640000000000001, -0.16, 0, 0.16640000000000002],
    [-0.45, 0.10999999999999999, -0.2186, 0.27, 0.19, -0.1386],
    [-0.45, -0.19, -0.2186, 0.27, -0.10999999999999999, -0.1386],
  ],
  bombshell1118: [
    [-0.13, -0.027, -0.066, 0.155, 0.027, 0.064],
    [-0.652, -0.026, -0.058, -0.13, 0.026, 0.057],
    [-0.615, -0.206, 0, -0.496, 0.206, 0.004],
    [-0.652, -0.19, 0, -0.615, 0.19, 0.004],
    [-0.563, -0.003, 0, -0.477, 0.003, 0.124],
    [-0.652, -0.003, 0, -0.563, 0.003, 0.12],
    [-0.128, -0.04, 0.062, 0.063, 0.04, 0.084],
    [-0.128, 0.04, 0.058, 0.063, 0.559, 0.175],
    [-0.128, -0.559, 0.058, 0.063, -0.04, 0.175],
    [0.107, -0.01, -0.015, 0.16, 0.01, 0.047],
    [0.17, -0.0889, -0.0942, 0.17, 0.0889, 0.08360000000000001],
    [0.07, -0.015, -0.055, 0.13, 0.015, -0.03],
    [0.03, 0, -0.146, 0.08, 0.098, -0.065],
    [0.03, -0.098, -0.146, 0.08, 0, -0.065],
    [-0.59, -0.003, -0.046, -0.565, 0.003, -0.024],
    [0.1, -0.0095, 0.021, 0.125, 0.0095, 0.041],
    [-0.193, 0, 0.04, -0.19, 0, 0.105],
  ],
  kadet1981: [
    [-0.276, -0.048, -0.165, 0.335, 0.048, 0.074],
    [-1.014, -0.047, -0.165, -0.276, 0.047, 0.061],
    [-1.032, -0.394, -0.038, -0.905, 0.394, -0.028],
    [-1.108, -0.394, -0.036, -1.032, 0.394, -0.03],
    [-1.027, -0.004, -0.028, -0.808, 0.004, 0.246],
    [-1.108, -0.004, -0.127, -1.027, 0.004, 0.246],
    [-0.276, -0.089, 0.074, 0.098, 0.089, 0.122],
    [-0.276, 0.089, 0.074, 0.098, 0.991, 0.196],
    [-0.276, -0.991, 0.074, 0.098, -0.089, 0.196],
    [0.335, -0.03, -0.04, 0.43, 0.06, 0.064],
    [0.446, -0.1524, -0.1651, 0.446, 0.1524, 0.13970000000000002],
    [0.17, -0.02, -0.13, 0.23, 0.02, -0.1],
    [-0.12, 0, -0.307, -0.06, 0.19, -0.165],
    [-0.12, -0.19, -0.307, -0.06, 0, -0.165],
    [0.28, -0.02, -0.307, 0.345, 0.02, -0.1],
    [0.2, -0.01, 0.047, 0.225, 0.01, 0.067],
    [-0.35, 0, 0.05, -0.33, 0, 0.14],
  ],
  uglystik1567: [
    [-0.196, -0.051, -0.053, 0.2985, 0.051, 0.052],
    [-0.785, -0.051, -0.053, -0.196, 0.051, 0.05],
    [-0.793, -0.277, -0.057, -0.648, 0.277, -0.048],
    [-0.838, -0.283, -0.056, -0.793, 0.283, -0.049],
    [-0.785, -0.003, -0.03, -0.592, 0.003, 0.1735],
    [-0.886, -0.003, -0.035, -0.785, 0.003, 0.1735],
    [-0.196, -0.145, 0.028, 0.119, 0.145, 0.077],
    [-0.231, 0.145, 0.028, 0.119, 0.784, 0.104],
    [-0.231, -0.784, 0.028, 0.119, -0.145, 0.104],
    [0.2985, -0.08, -0.04, 0.4, 0.035, 0.06],
    [0.41, -0.1524, -0.1567, 0.41, 0.1524, 0.1481],
    [0.05, -0.02, -0.05, 0.11, 0.02, -0.02],
    [-0.05, 0, -0.165, 0, 0.215, -0.053],
    [-0.05, -0.215, -0.165, 0, 0, -0.053],
    [0.26, -0.02, -0.167, 0.3, 0.02, -0.053],
    [0.165, -0.01, 0.048, 0.19, 0.01, 0.068],
    [-0.3, 0, 0.033, -0.28, 0, 0.12],
  ],
  tigermoth1803: [
    [-0.25, -0.06, -0.12, 0.205, 0.06, 0.06],
    [-1.05, -0.06, -0.12, -0.25, 0.06, 0.06],
    [-0.886, -0.3025, 0.002, -0.755, 0.3025, 0.014],
    [-1.039, -0.3, 0.003, -0.886, 0.3, 0.013],
    [-0.886, -0.003, 0.01, -0.8, 0.003, 0.18],
    [-1.07, -0.003, -0.073, -0.886, 0.003, 0.246],
    [-0.168, 0, 0.195, 0.183, 0.9, 0.262],
    [-0.168, -0.9, 0.195, 0.183, 0, 0.262],
    [-0.269, 0.0625, -0.122, 0.07, 0.9, -0.031],
    [-0.269, -0.9, -0.122, 0.07, -0.0625, -0.031],
    [-0.268, 0.35, -0.09, -0.195, 0.89, -0.05],
    [-0.268, -0.89, -0.09, -0.195, -0.35, -0.05],
    [0.205, -0.045, -0.06, 0.365, 0.045, 0.05],
    [0.3808, -0.1524, -0.14500000000000002, 0.3808, 0.1524, 0.1598],
    [0.07, -0.02, -0.1, 0.13, 0.02, -0.07],
    [0.1, 0, -0.292, 0.2, 0.18, -0.12],
    [0.1, -0.18, -0.292, 0.2, 0, -0.12],
    [-1.05, -0.008, -0.125, -1.02, 0.008, -0.073],
    [-0.112, -0.01, 0.07, -0.088, 0.01, 0.09],
    [-0.4, 0, 0.03, -0.4, 0, 0.11],
  ],
  p51d1450: [
    [-0.3, -0.057, -0.129, 0.34, 0.057, 0.137],
    [-0.8, -0.05, -0.11, -0.3, 0.05, 0.1],
    [-0.69, -0.258, 0.044, -0.638, 0.258, 0.056],
    [-0.745, -0.258, 0.045, -0.69, 0.258, 0.055],
    [-0.76, -0.006, 0.06, -0.64, 0.006, 0.23],
    [-0.833, -0.006, -0.02, -0.76, 0.006, 0.23],
    [-0.203, 0.057, -0.074, 0.11, 0.725, 0.016],
    [-0.203, -0.725, -0.074, 0.11, -0.057, 0.016],
    [-0.13, 0.45, -0.022, -0.075, 0.68, -0.002],
    [-0.13, -0.68, -0.022, -0.075, -0.45, -0.002],
    [0.3, -0.025, -0.012, 0.345, 0.025, 0.038],
    [0.3578, -0.1778, -0.16490000000000002, 0.3578, 0.1778, 0.1907],
    [0.06, -0.022, -0.075, 0.2, 0.022, -0.03],
    [-0.2, -0.045, 0.08, 0.1, 0.045, 0.137],
    [0.04, 0.205, -0.257, 0.09, 0.258, -0.07],
    [0.04, -0.258, -0.257, 0.09, -0.205, -0.07],
    [-0.585, -0.01, -0.109, -0.543, 0.01, -0.06],
    [-0.105, -0.01, 0.0764, -0.08, 0.01, 0.0964],
    [-0.35, 0, 0.08, -0.35, 0, 0.15],
  ],
  f16878: [
    [-0.3, -0.065, -0.075, 0.55, 0.065, 0.07],
    [-0.596, -0.06, -0.045, -0.3, 0.06, 0.055],
    [-0.548, 0.088, -0.016, -0.338, 0.245, -0.004],
    [-0.548, -0.245, -0.016, -0.338, -0.088, -0.004],
    [-0.55, -0.005, 0.055, -0.29, 0.005, 0.265],
    [-0.56, -0.004, 0.075, -0.5, 0.004, 0.24],
    [-0.23, 0.065, -0.008, 0.132, 0.41, 0.008],
    [-0.23, -0.41, -0.008, 0.132, -0.065, 0.008],
    [-0.23, 0.117, -0.004, -0.18, 0.3, 0.004],
    [-0.23, -0.3, -0.004, -0.18, -0.117, 0.004],
    [-0.27, -0.037, -0.037, -0.21, 0.037, 0.037],
    [0.28, -0.021, -0.02, 0.42, 0.021, 0.024],
    [0.24, -0.035, 0.04, 0.46, 0.035, 0.075],
    [0.55, -0.03, -0.03, 0.69, 0.03, 0.03],
    [-0.075, 0.09, -0.146, -0.03, 0.115, -0.06],
    [-0.075, -0.115, -0.146, -0.03, -0.09, -0.06],
    [0.28, -0.01, -0.146, 0.312, 0.01, -0.065],
    [0.398, -0.01, 0.048, 0.422, 0.01, 0.068],
    [0.08, 0, 0.065, 0.1, 0, 0.14],
  ],
  zagi1219: [
    [-0.098, -0.0635, -0.012, 0.2032, 0.0635, 0.025],
    [-0.2531, 0.0635, -0.012, 0.1687, 0.6096, 0.015],
    [-0.2531, -0.6096, -0.012, 0.1687, -0.0635, 0.015],
    [-0.2531, 0.0635, -0.004, -0.0762, 0.608, 0.004],
    [-0.2531, -0.608, -0.004, -0.0762, -0.0635, 0.004],
    [-0.2675, 0.6081, 0.006, -0.1278, 0.6096, 0.133],
    [-0.2675, -0.6096, 0.006, -0.1278, -0.6081, 0.133],
    [-0.093, -0.014, -0.004, -0.058, 0.014, 0.024],
    [-0.098, -0.0635, -0.0535, -0.098, 0.0635, 0.0735],
    [0.071, -0.052, -0.01, 0.107, 0.052, 0.012],
    [0.155, -0.01, 0.012, 0.18, 0.01, 0.032],
    [-0.04, 0, 0.025, -0.04, 0, 0.075],
  ],
  nrj1490: [
    [-0.07, -0.013, -0.042, 0.19, 0.013, -0.012],
    [-0.7, -0.0045, -0.0245, -0.07, 0.0045, -0.0155],
    [-0.587, -0.15, -0.03, -0.532, 0.15, -0.026],
    [-0.617, -0.13, -0.0295, -0.587, 0.13, -0.0265],
    [-0.65, -0.002, -0.016, -0.56, 0.002, 0.18],
    [-0.7, -0.002, -0.008, -0.65, 0.002, 0.16],
    [-0.096, 0.013, -0.012, 0.066, 0.745, 0.083],
    [-0.096, -0.745, -0.012, 0.066, -0.013, 0.083],
    [-0.096, 0.08, -0.004, -0.056, 0.7, 0.08],
    [-0.096, -0.7, -0.004, -0.056, -0.08, 0.08],
    [0.17, -0.008, -0.039, 0.235, 0.008, -0.025],
    [0.19, -0.012, -0.038, 0.259, 0.012, -0.014],
  ],
  striker2500: [
    [-0.874, -0.17, -0.1504, 1.546, 0.17, 0.1896],
    [-0.834, 0.17, -0.0824, 0.706, 1.235, -0.0184],
    [-0.834, -1.235, -0.0824, 0.706, -0.17, -0.0184],
    [-0.834, 0.32, -0.0614, -0.684, 1.12, -0.0394],
    [-0.834, -1.12, -0.0614, -0.684, -0.32, -0.0394],
    [-0.954, 1.235, -0.1704, -0.554, 1.251, 0.2496],
    [-0.954, -1.251, -0.1704, -0.554, -1.235, 0.2496],
    [-1.034, -0.21, -0.0404, -0.874, 0.21, 0.1196],
    [-1.124, -0.381, -0.3614, -1.124, 0.381, 0.4006],
    [0.866, -0.06, -0.0904, 1.026, 0.06, 0.0196],
    [1.206, -0.17, -0.1504, 1.546, 0.17, 0.1896],
    [1.466, -0.02, -0.0004, 1.526, 0.02, 0.0396],
  ],
};

/* The five inch the crash scenarios seat (tests/crash/scenarios.js), whose
 * dims give exactly the module's initial bindings: every case but the
 * first seats it, so a case means the same alone (--dump) as in the run. */
const PLANT0 = CRAFT.plant0.dims;
const BINDINGS = [
  'CRAFT_ARM', 'CRAFT_PROP_R', 'CRAFT_HULL_R', 'CRAFT_R', 'CRAFT_WORLD_R', 'CRAFT_WORLD_ARM_AXIS', 'CRAFT_WORLD_HULL',
  'CRAFT_V_DOWN', 'CRAFT_V_UP', 'CRAFT_V_HALF', 'CRAFT_V_OFF', 'CRAFT_WORLD_V_HALF', 'CRAFT_WORLD_V_OFF',
];
const HIT = [
  'hitIndex', 'hitKind', 'hitT', 'hitPen', 'hitOverlap', 'hitNormalDot', 'hitNx', 'hitNy', 'hitNz', 'hitMoving',
  'hitArm', 'hitArmX', 'hitArmY', 'hitArmZ', 'hitPart',
];
const AXIS = ['axisFound', 'axisGap', 'axisDx', 'axisDy', 'axisDz', 'axisCx', 'axisCy', 'axisCz'];
const VIEWS = [
  'fax', 'fay', 'faz', 'fbx', 'fby', 'fbz', 'fr', 'fkind', 'fbox', 'pass', 'fux', 'fuz', 'fu0', 'fu1', 'fw0', 'fw1',
];
const MOVING = ['movingCx', 'movingCy', 'movingCz', 'movingPx', 'movingPy', 'movingPz'];

/* Read through the namespace, never destructured: they are live. */
const bindings = () => BINDINGS.map((k) => m[k]);
const hitOut = (c, k) => [k, ...HIT.map((f) => c[f])];
const axisOut = (c, found) => [found, ...AXIS.map((f) => c[f])];

function seat() {
  m.setCraftAirframe(PLANT0);
  m.setCraftParts(null);
}

function sayState(s, tag, c) {
  s.say(`${tag} counts`, [c.built, c.count, c.baseCount, c.staticCount, c.streamCount, c.streamGen, c.staticGen,
    c.movingCount, c.softKinds, c.retired(), c.grid ? c.grid.size : null]);
  s.say(`${tag} stats`, c.stats());
}

function sayViews(s, tag, c) {
  for (const v of VIEWS) {
    s.say(`${tag} ${v}`, c[v]);
  }
  s.say(`${tag} moving`, MOVING.map((f) => c[f]));
}

/* ------------------------------------------------------------------ inputs */

function unitVec(r) {
  for (;;) {
    const x = r.range(-1, 1);
    const y = r.range(-1, 1);
    const z = r.range(-1, 1);
    const n = x * x + y * y + z * z;
    if (n > 1e-4 && n <= 1) {
      const inv = 1 / Math.sqrt(n);
      return [x * inv, y * inv, z * inv];
    }
  }
}

/* [x, y, z, w], the order hit and contactPatch take. */
function unitQuat(r) {
  for (;;) {
    const q = [r.range(-1, 1), r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)];
    const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
    if (n > 1e-4 && n <= 1) {
      const inv = 1 / Math.sqrt(n);
      return q.map((v) => v * inv);
    }
  }
}

const H = Math.SQRT1_2;
/* Level, inverted, yawed a quarter, knife edge, nose down, a third turn
 * about the diagonal, level written with w = -1, and one a hair off unit
 * as a sim step's renormalisation leaves it. */
const ATTS = [[0, 0, 0, 1], [1, 0, 0, 0], [0, H, 0, H], [0, 0, H, H], [H, 0, 0, H], [0.5, 0.5, 0.5, 0.5],
  [0, 0, 0, -1], [0, 0.0001, 0, 1.0000001], [-0, -0, -0, 1]];
const attitude = (r) => (r.chance(0.3) ? r.pick(ATTS) : unitQuat(r));

/* Travel lengths: none, sub micron, a 1 ms step, a frame, a fast frame,
 * and long chords that cross many cells. */
const LENS = [0, 1e-7, 0.004, 0.05, 0.3, 1, 2.5, 8, 30];
/* Vertical semi-axes: 0, thin, the five inch's spans, CRAFT_WORLD_R, more. */
const VHS = [0, 0.02, 0.038, 0.0415, 0.045, 0.1, 0.1735, 0.3];
const VOFFS = [0, -0, -0.0035, 0.004, 0.05, -0.2];
const MAXRS = [0, 0.01, 0.1, 0.5, 1, 3, 12, -1];

const add3 = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];

/* A point on or around collider i, read from the views, as a caller
 * aiming at a solid would. */
function near(c, r, i, slack) {
  if (c.fbox[i]) {
    return [0, 1, 2].map((a) => {
      const lo = [c.fax, c.fay, c.faz][a][i];
      const hi = [c.fbx, c.fby, c.fbz][a][i];
      return lo + (hi - lo) * r.range(-0.2, 1.2) + r.range(-slack, slack);
    });
  }
  const u = r.range(-0.2, 1.2);
  const rr = c.fr[i] + slack;
  return [
    c.fax[i] + (c.fbx[i] - c.fax[i]) * u + r.range(-rr, rr),
    c.fay[i] + (c.fby[i] - c.fay[i]) * u + r.range(-rr, rr),
    c.faz[i] + (c.fbz[i] - c.faz[i]) * u + r.range(-rr, rr),
  ];
}

/* A target point: a static collider mostly, a moving box sometimes, open
 * air now and then. w carries the moving boxes' half extents (which no
 * caller can read back) and the world's middle and spread. */
function target(c, r, w) {
  if (c.movingCount > 0 && r.chance(0.15)) {
    const i = r.int(0, c.movingCount - 1);
    const h = w.movingH[i];
    return [c.movingCx[i] + r.range(-1.3, 1.3) * h[0], c.movingCy[i] + r.range(-1.3, 1.3) * h[1],
      c.movingCz[i] + r.range(-1.3, 1.3) * h[2]];
  }
  if (c.count > 0 && r.chance(0.9)) {
    return near(c, r, r.int(0, c.count - 1), 0.6);
  }
  return [w.centre[0] + r.range(-w.spread, w.spread), w.centre[1] + r.range(-3, 15),
    w.centre[2] + r.range(-w.spread, w.spread)];
}

/* A frame's travel: from a target outward, or an approach that runs
 * through it. */
function travel(c, r, w) {
  const t = target(c, r, w);
  const d = unitVec(r);
  if (r.chance(0.5)) {
    return [t, add3(t, d, r.pick(LENS))];
  }
  return [add3(t, d, -r.range(0.5, 25)), add3(t, d, r.range(-0.5, 3))];
}

/* One sweep, called every way main.js, flightrig and the checks call it:
 * defaults omitted, vh alone, the full attitude with the airframe's own
 * span, vh passed as undefined (the default applies), and no vOff. */
function hitCall(s, label, c, r, k, p, q) {
  let args;
  switch (k % 5) {
    case 0:
      args = [...p, ...q];
      break;
    case 1:
      args = [...p, ...q, r.pick(VHS)];
      break;
    case 2: {
      const a = attitude(r);
      args = [...p, ...q, m.craftVerticalHalf(r.range(-0.1, 1.1)), ...a, m.craftVerticalOffset()];
      break;
    }
    case 3: {
      const a = attitude(r);
      args = [...p, ...q, undefined, ...a, r.pick(VOFFS)];
      break;
    }
    default: {
      const a = attitude(r);
      args = [...p, ...q, r.pick(VHS), a[0], a[1], a[2], a[3]];
    }
  }
  const kind = c.hit(...args);
  s.say(label, [args, hitOut(c, kind)]);
  const mid = [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5, (p[2] + q[2]) * 0.5];
  s.say(`${label} then`, [c.interiorOfHit(...q), c.interiorOfHit(...mid), c.crossedHit(...p, ...q)]);
}

function indexWhere(c, r, pred) {
  for (let tries = 0; tries < 30 && c.count > 0; tries += 1) {
    const i = r.int(0, c.count - 1);
    if (pred(c.fbox[i])) {
      return i;
    }
  }
  return -1;
}

/*
 * Every query, n of each, against a built set. Each says its inputs with
 * its outputs, so a dump line reads on its own.
 */
function sweep(s, tag, c, r, w, n) {
  for (let k = 0; k < n.hit; k += 1) {
    const [p, q] = travel(c, r, w);
    hitCall(s, `${tag} hit${k}`, c, r, k, p, q);
  }
  for (let k = 0; k < n.gap; k += 1) {
    const p = target(c, r, w);
    const maxR = r.pick(MAXRS);
    let args;
    if (k % 3 === 0) {
      args = [...p, maxR];
    } else {
      args = [...p, maxR, r.chance(0.4), r.chance(0.4) ? r.int(0, (1 << KINDS.length) - 1) : 0];
    }
    s.say(`${tag} gap${k}`, [args, c.gapAt(...args)]);
  }
  for (let k = 0; k < n.axis; k += 1) {
    const p = target(c, r, w);
    const maxR = r.pick(MAXRS);
    const found = c.axisAt(...p, maxR);
    s.say(`${tag} axis${k}`, [p, maxR, axisOut(c, found)]);
  }
  for (let k = 0; k < n.inside; k += 1) {
    const i = r.int(-1, (c.count ?? 0) + 1);
    const p = i >= 0 && i < c.count ? near(c, r, i, 0.3) : target(c, r, w);
    s.say(`${tag} interiorAt${k}`, [i, p, c.interiorAt(i, ...p)]);
  }
  for (let k = 0; k < n.cross; k += 1) {
    const i = r.int(-1, (c.count ?? 0) + 1);
    const t = i >= 0 && i < c.count ? near(c, r, i, 0.3) : target(c, r, w);
    const d = unitVec(r);
    const p = add3(t, d, -r.range(0, 6));
    const q = add3(t, d, r.range(-1, 6));
    s.say(`${tag} crossedStatic${k}`, [i, p, q, c.crossedStatic(i, ...p, ...q)]);
  }
  for (let k = 0; k < n.box; k += 1) {
    const i = indexWhere(c, r, (b) => b !== 0);
    if (i < 0) {
      break;
    }
    const p = near(c, r, i, 1);
    s.say(`${tag} boxGap${k}`, [i, p, c.boxGap(i, ...p)]);
  }
  for (let k = 0; k < n.atp; k += 1) {
    const i = indexWhere(c, r, (b) => b === 0);
    if (i < 0) {
      break;
    }
    const p = near(c, r, i, 1);
    const ret = c.axisToPoint(i, ...p);
    s.say(`${tag} axisToPoint${k}`, [i, p, ret, c.nx, c.ny, c.nz]);
  }
  for (let i = -1; i <= c.movingCount; i += 1) {
    const [p, q] = travel(c, r, w);
    s.say(`${tag} crossedMoving${i}`, [p, q, c.crossedMoving(i, ...p, ...q)]);
  }
}

const FULL = { hit: 90, gap: 50, axis: 40, inside: 25, cross: 25, box: 12, atp: 12 };
const LIGHT = { hit: 30, gap: 15, axis: 12, inside: 8, cross: 8, box: 4, atp: 4 };

/* ------------------------------------------------------------- seeded worlds */

/*
 * The seeded worlds: every primitive (capsule, zero length capsule, post,
 * sphere, box given with its corners either way round, turned box with a
 * unit or a non unit direction, long thin chords like the town's wires,
 * radii of 0 and below), every kind, sweeps on some capsules, and moving
 * boxes added before and after build. Coordinates carry full doubles so
 * the single precision freeze rounds every one; one world sits out at the
 * Friendship Bridge's x and one by the grid's edge.
 */
const WORLDS = [
  { seed: 101, n: 6, centre: [0, 0, 0], spread: 4, longs: false, moving: 1 },
  { seed: 102, n: 40, centre: [0, 0, 0], spread: 10, longs: true, moving: 2 },
  { seed: 103, n: 120, centre: [37.5, 2, -12.25], spread: 30, longs: true, moving: 3 },
  { seed: 104, n: 60, centre: [-812.123456789, 40.5, 333.3333333], spread: 14, longs: false, moving: 0 },
  { seed: 105, n: 90, centre: [-1500.987654, 120.75, 9535.123456], spread: 20, longs: true, moving: 2 },
  { seed: 106, n: 30, centre: [-16300.5, 3, 16310.25], spread: 6, longs: false, moving: 1 },
  { seed: 107, n: 250, centre: [4, 1, -4], spread: 60, longs: true, moving: 3 },
  { seed: 108, n: 25, centre: [0.1, 0.2, 0.3], spread: 1.5, longs: false, moving: 1 },
];

const RADII = [0.005, 0.02, 0.05, 0.15, 0.4, 1.2];

/* Adds to a Colliders or a refill; says what each add returned (the
 * object itself, or an index) when s is given. */
function addRandom(s, tag, list, r, w, n, sweeps) {
  const [cx, cy, cz] = w.centre;
  const sp = w.spread;
  const rets = [];
  for (let j = 0; j < n; j += 1) {
    const kind = KINDS[r.int(0, KINDS.length - 1)];
    const a = [cx + r.range(-sp, sp), cy + r.range(-2, 12), cz + r.range(-sp, sp)];
    const rad = r.pick(RADII) * r.range(0.5, 1.5);
    const prim = r.int(0, 10);
    let ret;
    let cap = null;
    switch (prim) {
      case 0:
      case 1: {
        const d = unitVec(r);
        const L = r.pick([0, 0.3, 2, 7, 15]) * r.next();
        cap = [a[0], a[1], a[2], a[0] + d[0] * L, a[1] + d[1] * L, a[2] + d[2] * L, rad];
        ret = list.add(kind, ...cap);
        break;
      }
      case 2: {
        const y1 = r.chance(0.1) ? a[1] - 1 : a[1] + r.range(0.5, 12);
        cap = [a[0], a[1], a[2], a[0], y1, a[2], rad];
        ret = list.addPost(kind, a[0], a[2], a[1], y1, rad);
        break;
      }
      case 3:
        cap = [a[0], a[1], a[2], a[0], a[1], a[2], rad * 2];
        ret = list.addSphere(kind, a[0], a[1], a[2], rad * 2);
        break;
      case 4:
      case 5:
        ret = list.addBox(kind, a[0], a[1], a[2], a[0] + r.range(-6, 6), a[1] + r.range(-4, 8), a[2] + r.range(-6, 6));
        break;
      case 6:
      case 7: {
        let ux = r.range(-1, 1);
        let uz = r.range(-1, 1);
        if (r.chance(0.3)) {
          [ux, uz] = r.pick([[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, 0.8], [3, 4], [-0.25, 7]]);
        }
        const l = Math.sqrt(ux * ux + uz * uz);
        if (l < 1e-3) {
          ux = 1;
          uz = 0;
        }
        const dx = ux / Math.sqrt(ux * ux + uz * uz);
        const dz = uz / Math.sqrt(ux * ux + uz * uz);
        const u = a[0] * dx + a[2] * dz;
        const wv = -a[0] * dz + a[2] * dx;
        const hu = r.range(0.1, 8);
        const hw = r.range(0.05, 3);
        ret = list.addTurnedBox(kind, ux, uz, u - hu, u + hu, a[1], a[1] + r.range(0, 9), wv - hw, wv + hw);
        break;
      }
      case 8: {
        const d = unitVec(r);
        const L = w.longs ? r.range(30, 220) : r.range(0, 3);
        cap = [a[0], a[1] + 10, a[2], a[0] + d[0] * L, a[1] + 10 + d[1] * L * 0.1, a[2] + d[2] * L, r.range(0.008, 0.03)];
        ret = list.add(w.longs ? 'wire' : kind, ...cap);
        break;
      }
      case 9: {
        const odd = r.pick([0, -0.1, 1e-9, 3.5]);
        cap = [a[0], a[1], a[2], a[0] + r.range(-2, 2), a[1], a[2] + r.range(-2, 2), odd];
        ret = list.add(kind, ...cap);
        break;
      }
      default: {
        cap = [a[0], a[1], a[2], a[0] + 0.5, a[1] + 0.5, a[2], rad];
        ret = list.add(kind, ...cap);
      }
    }
    rets.push(ret === list ? 'this' : ret);
    if (sweeps && cap && cap[6] >= 0 && r.chance(0.15)) {
      const i = list.ax.length - 1;
      const rr = cap[6];
      const rect = [Math.min(cap[0], cap[3]) - rr - r.pick([0, r.range(0, 10)]),
        Math.min(cap[2], cap[5]) - rr - r.range(0, 10),
        Math.max(cap[0], cap[3]) + rr + r.range(0, 10),
        Math.max(cap[2], cap[5]) + rr + r.pick([0, r.range(0, 10)])];
      const back = list.sweep(i, ...rect);
      sweeps.push({ i, rect, r: rr, cap, back: back === list });
    }
  }
  if (s) {
    s.say(`${tag} adds`, rets);
    s.say(`${tag} ax.length`, list.ax.length);
    if (sweeps) {
      s.say(`${tag} sweeps`, sweeps.map((x) => [x.i, x.rect, x.back]));
    }
  }
}

/* Builds a seeded world; says its construction when s is given. */
function makeWorld(s, w) {
  const r = seeded(w.seed);
  const c = new Colliders();
  const sweeps = [];
  const world = { ...w, movingH: [], sweeps };
  const before = w.moving ? r.int(0, w.moving) : 0;
  for (let j = 0; j < before; j += 1) {
    const h = [r.range(0.2, 3), r.range(0.2, 2), r.range(0.2, 6)];
    world.movingH.push(h);
    const i = c.addMoving(r.pick(['train', 'boom', 'obstacle']), ...h);
    if (s) {
      s.say('addMoving before build', i);
    }
  }
  addRandom(s, 'static', c, r, world, w.n, sweeps);
  c.build();
  for (let j = before; j < w.moving; j += 1) {
    const h = [r.range(0.2, 3), r.range(0.2, 2), r.range(0.2, 6)];
    world.movingH.push(h);
    const i = c.addMoving(r.pick(['train', 'boom', 'obstacle']), ...h);
    if (s) {
      s.say('addMoving after build', i);
    }
  }
  for (let i = 0; i < c.movingCount; i += 1) {
    const at = target(c, r, world);
    c.seatMoving(i, ...at);
    if (r.chance(0.5)) {
      c.setMovingCentre(i, at[0] + r.range(-0.5, 0.5), at[1], at[2] + r.range(-0.5, 0.5));
    }
  }
  return { c, world };
}

/* Random capsules for setBuilt, as buildmode's worldCaps hands them. */
function randomCaps(r, w, n) {
  const caps = [];
  for (let j = 0; j < n; j += 1) {
    const a = [w.centre[0] + r.range(-w.spread, w.spread), w.centre[1] + r.range(0, 4), w.centre[2] + r.range(-w.spread, w.spread)];
    const d = unitVec(r);
    const L = r.range(0, 2.5);
    caps.push({
      kind: r.pick(['gate', 'pylon', 'banner', 'hoop', 'pole']), ax: a[0], ay: a[1], az: a[2],
      bx: a[0] + d[0] * L, by: a[1] + d[1] * L, bz: a[2] + d[2] * L, r: r.pick([0.02, 0.024, 0.05, 0.5]),
    });
  }
  return caps;
}

/* Runs a refill to the end at budget b (or the default with b
 * undefined), saying each step's answer. */
function stepOut(fill, b, limit = 100000) {
  const steps = [];
  for (let k = 0; k < limit; k += 1) {
    const done = b === undefined ? fill.step() : fill.step(b);
    steps.push(done);
    if (done) {
      return steps;
    }
  }
  steps.push('gave up');
  return steps;
}

const PHASES = ['static', 'filtered', 'built', 'stream', 'mutated', 'moving', 'combo'];

/* Run-length of a step sequence, so a refill of many steps reads short. */
function runs(steps) {
  const out = [];
  for (const v of steps) {
    const last = out[out.length - 1];
    if (last && last[0] === v) {
      last[1] += 1;
    } else {
      out.push([v, 1]);
    }
  }
  return out;
}

function worldCase(w, phase) {
  return {
    id: `world-${w.seed}-${phase}`,
    run(s) {
      seat();
      const { c, world } = makeWorld(phase === 'static' ? s : null, w);
      const r = seeded(w.seed * 7919 + PHASES.indexOf(phase));
      const tag = phase;
      if (phase === 'static') {
        sayState(s, 'built', c);
        sayViews(s, 'built', c);
        s.say('kindName', [-1, 0, 1, 7, 13, 14, 1.5, NaN].map((k) => c.kindName(k)));
        sweep(s, tag, c, r, world, FULL);
        sayState(s, 'after', c);
        return;
      }
      if (phase === 'filtered') {
        /* The crash world's pass flags and the shell's soft kinds: the
         * sweep passes through them, gapAt and axisAt do not. */
        for (let i = 0; i < c.count; i += 1) {
          if (r.chance(0.25)) {
            c.pass[i] = r.pick([1, 2, 255]);
          }
        }
        c.softKinds = (1 << KINDS.indexOf('tree')) | (1 << KINDS.indexOf('canopy')) | (r.chance(0.5) ? 1 << KINDS.indexOf('wire') : 0);
        sayViews(s, tag, c);
        sweep(s, tag, c, r, world, LIGHT);
        c.softKinds = -1;
        sweep(s, `${tag} all-soft`, c, r, world, { ...LIGHT, hit: 15 });
        return;
      }
      if (phase === 'built') {
        const cellsBefore = new Map(c.grid);
        for (const n of [r.int(1, 8), r.int(0, 3), 0]) {
          const caps = randomCaps(r, world, n);
          s.call(`setBuilt ${n}`, () => (c.setBuilt(caps) === c ? 'this' : 'other'));
          sayState(s, `${tag} ${n}`, c);
          sayViews(s, `${tag} ${n}`, c);
          sweep(s, `${tag} ${n}`, c, r, world, LIGHT);
        }
        s.say('static grid kept', c.grid.size === cellsBefore.size && [...c.grid].every(([k, v]) => cellsBefore.get(k) === v));
        return;
      }
      if (phase === 'stream') {
        const cellsBefore = new Map(c.grid);
        for (const b of [undefined, 7, m.STREAM_SLICE / 2, 1, Infinity]) {
          const fill = c.streamFill();
          addRandom(s, `${tag} fill`, fill, r, world, r.int(0, Math.max(3, w.n >> 1)), null);
          s.say(`${tag} steps at ${b}`, runs(stepOut(fill, b)));
          sayState(s, `${tag} ${b}`, c);
          sayViews(s, `${tag} ${b}`, c);
          sweep(s, `${tag} ${b}`, c, r, world, LIGHT);
        }
        s.say('static grid kept', c.grid.size === cellsBefore.size && [...c.grid].every(([k, v]) => cellsBefore.get(k) === v));
        return;
      }
      if (phase === 'mutated') {
        const cellsBefore = new Map(c.grid);
        for (let round = 0; round < 3; round += 1) {
          for (let k = 0; k < 4 && c.staticCount > 0; k += 1) {
            const i = r.int(0, c.staticCount - 1);
            s.call(`retire ${i}`, () => (c.retire(i) === c ? 'this' : 'other'));
          }
          for (let k = 0; k < 2 && c.staticCount > 0; k += 1) {
            const i = r.int(0, c.staticCount - 1);
            s.call(`restore ${i}`, () => (c.restore(i) === c ? 'this' : 'other'));
          }
          for (const sw of world.sweeps) {
            const [x0, z0, x1, z1] = sw.rect;
            /* Somewhere inside the sweep, or out of it now and then. */
            const out = r.chance(0.15) ? r.range(1, 5) : 0;
            const ax = r.range(x0 + sw.r, x1 - sw.r) + out;
            const az = r.range(z0 + sw.r, z1 - sw.r);
            const bx = Math.min(x1 - sw.r, Math.max(x0 + sw.r, ax + r.range(-1, 1)));
            const bz = Math.min(z1 - sw.r, Math.max(z0 + sw.r, az + r.range(-1, 1)));
            const ay = sw.cap[1] + r.range(-1, 1);
            const by = sw.cap[4] + r.range(-1, 1);
            s.call(`moveCapsule ${sw.i}`, () => (c.moveCapsule(sw.i, [ax, ay, az], [bx, by, bz]) === c ? 'this' : 'other'));
          }
          for (let k = 0; k < 3; k += 1) {
            const i = indexWhere(c, r, (b) => b !== 0);
            if (i < 0) {
              break;
            }
            const y0 = c.fay[i] + r.range(-1, 1);
            const y1 = y0 + r.range(-0.2, 4);
            s.call(`setBoxExtentY ${i}`, () => (c.setBoxExtentY(i, y0, y1) === c ? 'this' : 'other'));
            const top = c.fay[i] + r.range(-0.3, 5);
            s.call(`setBoxTop ${i}`, () => (c.setBoxTop(i, top) === c ? 'this' : 'other'));
          }
          s.say(`${tag} ${round} retired`, [c.retired(), c.staticGen, c.streamGen]);
          sayViews(s, `${tag} ${round}`, c);
          sweep(s, `${tag} ${round}`, c, r, world, LIGHT);
        }
        s.say('static grid kept', c.grid.size === cellsBefore.size && [...c.grid].every(([k, v]) => cellsBefore.get(k) === v));
        return;
      }
      if (phase === 'moving') {
        for (let j = 0; j < 2; j += 1) {
          const h = [r.range(0.2, 3), r.range(0.2, 2), r.range(0.2, 6)];
          world.movingH.push(h);
          s.say('addMoving', c.addMoving('train', ...h));
          const at = target(c, r, world);
          s.say('seatMoving', c.seatMoving(c.movingCount - 1, ...at) === c);
        }
        for (let frame = 0; frame < 12; frame += 1) {
          for (let i = 0; i < c.movingCount; i += 1) {
            const back = c.setMovingCentre(i, c.movingCx[i] + r.range(-0.6, 0.6), c.movingCy[i] + r.range(-0.1, 0.1),
              c.movingCz[i] + r.range(-0.6, 0.6));
            if (back !== c) {
              s.say('setMovingCentre returned', 'other');
            }
          }
          s.say(`${tag} ${frame} centres`, MOVING.map((f) => c[f]));
          for (let k = 0; k < 6; k += 1) {
            const i = r.int(0, c.movingCount - 1);
            const h = world.movingH[i];
            const t = [c.movingCx[i] + r.range(-1, 1) * h[0], c.movingCy[i] + r.range(-1, 1) * h[1], c.movingCz[i] + r.range(-1, 1) * h[2]];
            const d = unitVec(r);
            const p = add3(t, d, -r.range(0.2, 6));
            const q = add3(t, d, r.range(-0.5, 2));
            hitCall(s, `${tag} ${frame} hit${k}`, c, r, k, p, q);
            /* The box moves on between the hit and the questions about it:
             * interiorOfHit and crossedHit read its centre now. */
            c.setMovingCentre(i, c.movingCx[i] + 0.3, c.movingCy[i], c.movingCz[i]);
            s.say(`${tag} ${frame} moved on`, [c.interiorOfHit(...q), c.crossedHit(...p, ...q), c.crossedMoving(i, ...p, ...q)]);
          }
        }
        return;
      }
      /* combo: what survives a set change. */
      for (let i = 0; i < c.staticCount; i += 1) {
        if (r.chance(0.3)) {
          c.pass[i] = 1;
        }
      }
      c.setBuilt(randomCaps(r, world, 3));
      c.pass.fill(1, c.baseCount);
      if (c.staticCount > 1) {
        c.retire(1);
      }
      sayViews(s, 'combo flagged', c);
      const fill = c.streamFill();
      addRandom(s, 'combo fill', fill, r, world, 5, null);
      s.say('combo steps', runs(stepOut(fill, 3)));
      sayState(s, 'combo swapped', c);
      sayViews(s, 'combo swapped', c);
      c.pass.fill(1, c.staticCount);
      c.setBuilt(randomCaps(r, world, 2));
      sayViews(s, 'combo rebuilt', c);
      sweep(s, 'combo', c, r, world, LIGHT);
      const empty = c.streamFill();
      s.say('combo empty steps', runs(stepOut(empty, 0)));
      sayState(s, 'combo emptied', c);
      sayViews(s, 'combo emptied', c);
      c.restore(1);
      sweep(s, 'combo emptied', c, r, world, LIGHT);
    },
  };
}

/* ------------------------------------------------------------- part hulls */

const tableOf = (rows) => rows.map((b) => ({ cg: [0, 0, 0], boxMin: b.slice(0, 3), boxMax: b.slice(3, 6) }));
const hullOf = (rows) => airframeHull(tableOf(rows), THREE_BODY, simLenToWorld(1));

/* turned-box-check's three part wing and grid-check's one part wing. */
const HAND_HULLS = {
  'turned-box-wing': [[-0.1, -0.08, -0.6, 0.1, 0.08, 0.4], [-0.7, -0.02, -0.15, 0.7, 0.02, 0.15],
    [-0.25, -0.02, 0.35, 0.25, 0.15, 0.5]],
  'grid-check-wing': [[-0.3, -0.6, -0.05, 0.3, 0.6, 0.05]],
};

/* A world for the wings: boxes, turned boxes, posts, wires and a train,
 * each in reach of a 1 to 2.5 m span. */
const PARTS_WORLD = { seed: 201, n: 80, centre: [12.5, 3, -40.25], spread: 18, longs: true, moving: 2 };

function partsCase(id, rows, how) {
  return {
    id: `parts-${id}${how ? `-${how}` : ''}`,
    run(s) {
      seat();
      const af = AIRFRAMES.find((a) => a.id === id);
      if (af) {
        m.setCraftAirframe(af.dims);
      }
      const hull = hullOf(rows);
      if (how === 'dead') {
        /* Parts gone, as hullFromPartsState leaves them after a break. */
        for (let k = 1; k < hull.n; k += 3) {
          hull.live[k] = 0;
        }
        hull.shift[0] = 0.01;
        hull.shift[1] = -0.02;
        hull.shift[2] = 0.005;
      } else if (how === 'none-left') {
        hull.live.fill(0);
      }
      s.say('setCraftParts', m.setCraftParts(hull));
      s.say('craftParts is the hull', m.craftParts() === hull);
      const { c, world } = makeWorld(null, PARTS_WORLD);
      const r = seeded(PARTS_WORLD.seed * 31 + id.length + (how ? how.length : 0));
      for (let k = 0; k < 70; k += 1) {
        const [p, q] = travel(c, r, world);
        hitCall(s, `hit${k}`, c, r, k, p, q);
      }
      /* vh and vOff are ignored with parts seated: the same travel asked
       * with others. */
      for (let k = 0; k < 6; k += 1) {
        const [p, q] = travel(c, r, world);
        const a = attitude(r);
        const one = hitOut(c, c.hit(...p, ...q, 0.01, ...a, 0));
        const two = hitOut(c, c.hit(...p, ...q, 0.5, ...a, 0.3));
        s.say(`ignored${k}`, [p, q, a, one, two]);
      }
      for (let i = 0; i < c.count; i += 1) {
        if (i % 4 === 0) {
          c.pass[i] = 1;
        }
      }
      c.softKinds = 1 << KINDS.indexOf('wire');
      for (let k = 0; k < 20; k += 1) {
        const [p, q] = travel(c, r, world);
        hitCall(s, `filtered${k}`, c, r, k, p, q);
      }
      sayState(s, 'end', c);
      m.setCraftParts(null);
      s.say('craftParts cleared', m.craftParts());
    },
  };
}

/* ------------------------------------------------------------------ airframes */

const SIN_TILTS = [-1, -0, 0, 1e-12, 0.25, 0.5, Math.SQRT1_2, 0.99, 1, 1.5, NaN, Infinity, -Infinity];
const US = [-1, -0, 0, 1e-9, 0.1, 0.25, 0.5, 0.75, 0.9, 1 - 1e-9, 1, 2, NaN, Infinity];

/* crash-rules-selftest's reach rig: a floor slab with its top at 0 and a
 * ceiling slab with its bottom at 1, walked onto level and inverted. */
function reachRig() {
  const c = new Colliders();
  c.addBox('wall', -5, -1, -5, 5, 0, 5);
  c.addBox('wall', -5, 1, -5, 5, 3, 5);
  c.build();
  return c;
}

function firstTouch(c, from, to, inverted) {
  const vh = m.craftVerticalHalf(0);
  const vo = m.craftVerticalOffset();
  const n = 500;
  for (let i = 0; i <= n; i += 1) {
    const y = from + (to - from) * (i / n);
    const k = c.hit(0, y, 0, 0, y, 0, vh, inverted ? 1 : 0, 0, 0, inverted ? 0 : 1, vo);
    if (k >= 0) {
      return [i, y, hitOut(c, k)];
    }
  }
  return null;
}

function airframeRun(s, dims) {
  s.call('setCraftAirframe', () => m.setCraftAirframe(dims));
  s.say('bindings', bindings());
  s.say('craftVerticalHalf', SIN_TILTS.map((v) => m.craftVerticalHalf(v)));
  s.say('craftVerticalOffset', m.craftVerticalOffset());
  s.say('clearances', [m.dirtClearance(), m.turtleClearance(), m.turtleLift(), m.snapClearance()]);
  s.say('turtleFlipLift', US.map((u) => m.turtleFlipLift(u)));
  const tc = m.turtleClearance();
  s.say('shouldEnterTurtle at the clearance', [tc - 1e-9, tc, tc + 1e-9].map((cl) => m.shouldEnterTurtle(-1, 0, 0, false, cl, false)));
  const dc = m.dirtClearance();
  s.say('upsetOnDirt at the clearance', [dc - 1e-9, dc, dc + 1e-9].map((cl) => m.upsetOnDirt(0.2, cl, true)));
  const r = seeded(301);
  for (let k = 0; k < 30; k += 1) {
    const n = unitVec(r);
    const q = attitude(r);
    s.say(`contactPatch${k}`, [n, q, m.contactPatch(...n, ...q)]);
  }
  const rig = reachRig();
  s.say('touch below', firstTouch(rig, 0.45, 0.0, false));
  s.say('touch above', firstTouch(rig, 0.55, 1.0, false));
  s.say('touch below inverted', firstTouch(rig, 0.45, 0.0, true));
  s.say('touch above inverted', firstTouch(rig, 0.55, 1.0, true));
  const { c, world } = makeWorld(null, WORLDS[1]);
  for (let k = 0; k < 25; k += 1) {
    const [p, q] = travel(c, r, world);
    hitCall(s, `hit${k}`, c, r, k, p, q);
  }
  s.say('craftRadius', c.stats().craftRadius);
}

/* Shapes a caller could hand setCraftAirframe beyond the table's: the
 * legacy single vHalf, hullR left out or null, no arm (NaN through), the
 * two throws (whose partial assignments stay), zero and NaN spans, and the
 * falsy values that change nothing. */
const ODD_DIMS = {
  'legacy-vhalf': { arm: 0.1, propR: 0.05, vHalf: 0.04 },
  'vhalf-fallback': { arm: 0.1, propR: 0.05, hullR: 0.07, vHalfDown: 0.03, vHalf: 0.05 },
  'no-hullr': { arm: 0.12, propR: 0.06, vHalfDown: 0.03, vHalfUp: 0.05 },
  'null-hullr': { arm: 0.12, propR: 0.06, hullR: null, vHalfDown: 0.03, vHalfUp: 0.05 },
  'no-arm': { propR: 0.05, vHalfDown: 0.03, vHalfUp: 0.03 },
  'hull-inside-prop': { arm: 0.1, propR: 0.08, hullR: 0.05, vHalfDown: 0.03, vHalfUp: 0.03 },
  'no-vertical': { arm: 0.1, propR: 0.05 },
  'zero-down': { arm: 0.1, propR: 0.05, vHalfDown: 0, vHalfUp: 0.03 },
  'nan-up': { arm: 0.1, propR: 0.05, vHalfDown: 0.03, vHalfUp: NaN },
  'negative-arm': { arm: -0.05, propR: 0.05, hullR: 0.05, vHalfDown: 0.02, vHalfUp: 0.02 },
};

function airframeCases() {
  const out = [];
  for (const af of AIRFRAMES) {
    out.push({
      id: `airframe-${af.id}`,
      run(s) {
        seat();
        airframeRun(s, af.dims);
        seat();
      },
    });
  }
  out.push({ id: 'airframe-plant0', run(s) { seat(); airframeRun(s, PLANT0); seat(); } });
  for (const [name, dims] of Object.entries(ODD_DIMS)) {
    out.push({
      id: `airframe-odd-${name}`,
      run(s) {
        /* From a seat that differs from the dims in every binding, so a
         * partial assignment before a throw shows. */
        seat();
        m.setCraftAirframe(AIRFRAMES.find((a) => a.id === 'interceptor').dims);
        s.say('before', bindings());
        airframeRun(s, dims);
        seat();
      },
    });
  }
  out.push({
    id: 'airframe-falsy',
    run(s) {
      seat();
      m.setCraftAirframe(AIRFRAMES.find((a) => a.id === '10inch').dims);
      for (const v of [null, undefined, 0, '', false, NaN]) {
        s.call(`setCraftAirframe(${String(v)})`, () => m.setCraftAirframe(v));
        s.say('bindings', bindings());
      }
      s.say('no argument', [m.setCraftAirframe(), bindings()]);
      seat();
    },
  });
  /* A sequence, as a session changes airframe: each seat replaces the
   * last whole, and the frozen five inch spans never move. */
  out.push({
    id: 'airframe-sequence',
    run(s) {
      seat();
      for (const id of ['striker2500', '7inch', 'zagi1219', 'interceptor', 'nrj1490', '10inch']) {
        m.setCraftAirframe(AIRFRAMES.find((a) => a.id === id).dims);
        s.say(id, [bindings(), m.dirtClearance(), m.turtleClearance(), m.turtleLift(), m.craftVerticalHalf(0.3)]);
      }
      seat();
      s.say('back to the five inch', bindings());
    },
  });
  return out;
}

/* --------------------------------------------------------- free functions */

const NUMS = [-Infinity, -100, -1, -0.5, -0, 0, 1e-12, 0.08, 0.5, 1, 2, 2.5, 3, 4, 10, 18, 25, 50, 100, Infinity, NaN];

function freeCases() {
  return [
    {
      id: 'exports',
      run(s) {
        seat();
        s.say('names', Object.keys(m).sort().map((k) => `${k}:${typeof m[k]}`));
        const values = {};
        for (const k of Object.keys(m).sort()) {
          if (typeof m[k] !== 'function') {
            values[k] = m[k];
          }
        }
        s.say('values', values);
        s.say('snapClearance is turtleClearance', m.snapClearance === m.turtleClearance);
        s.say('KINDS is an array', Array.isArray(m.KINDS));
      },
    },
    {
      id: 'contact-material',
      run(s) {
        for (const k of [...KINDS, 'none', '', undefined, null, 'Wall', 0, 7]) {
          s.say(`contactMaterial(${String(k)})`, m.contactMaterial(k));
        }
        s.say('a new object each call', m.contactMaterial('wall') !== m.contactMaterial('wall'));
      },
    },
    {
      id: 'hit-outcome',
      run(s) {
        const closings = [-1, -0, 0, 1, 17.999999, 18, 18.000001, 100, NaN, Infinity, -Infinity, undefined, null];
        for (const k of [...KINDS, 'none', undefined]) {
          s.say(`hitOutcome(${String(k)})`, closings.map((v) => m.hitOutcome(k, v)));
          s.say(`hitOutcome(${String(k)}, upDot)`, closings.map((v) => m.hitOutcome(k, v, 0.9)));
        }
      },
    },
    {
      id: 'thrust-into-face',
      run(s) {
        const r = seeded(401);
        for (let k = 0; k < 60; k += 1) {
          const n = unitVec(r);
          const u = unitVec(r);
          s.say(`thrustIntoFace${k}`, [n, u, m.thrustIntoFace(...n, ...u)]);
        }
        s.say('edges', [
          m.thrustIntoFace(0, 1, 0, 0, -0.5, 0), m.thrustIntoFace(0, 1, 0, 0, -0.4999999, 0),
          m.thrustIntoFace(NaN, 1, 0, 0, -1, 0), m.thrustIntoFace(0, 0, 0, 0, 0, 0), m.thrustIntoFace(1, 0, 0, -1, 0, 0),
        ]);
      },
    },
    {
      id: 'perch-and-ground',
      run(s) {
        const tilts = [-1, 0, 24.9, 25, 25.1, 49.9, 50, 50.1, 90, NaN];
        const speeds = [-1, 0, 1, 2, 2.0001, 3, 3.0001, 4, 4.0001, 10, 10.0001, NaN];
        const rates = [0, 2.5, 2.5001, NaN];
        for (const t of tilts) {
          s.say(`canPerch tilt ${t}`, speeds.map((v) => rates.map((w) => m.canPerch(t, v, w))));
          s.say(`groundOutcome tilt ${t}`, speeds.map((d) => speeds.map((h) => m.groundOutcome(d, h, t))));
        }
      },
    },
    {
      id: 'pass-scoring',
      run(s) {
        seat();
        const dc = m.dirtClearance();
        const upzs = [-1, 0, 0.49, 0.5, 0.51, 1, NaN];
        const clears = [-1, 0, dc - 1e-9, dc, dc + 1e-9, 1, NaN];
        s.say('upsetOnDirt', upzs.map((u) => clears.map((cl) => [m.upsetOnDirt(u, cl, false), m.upsetOnDirt(u, cl, true)])));
        const grounds = {
          flat: () => 0,
          slope: (x, z) => x * 0.25 - z * 0.125,
          mound: (x) => (x > 1.5 ? 4 : 0),
          nan: () => NaN,
        };
        const legs = [
          [[0, 1, 0], [4, 1, 0]], [[0, 0.1, 0], [4, 0.05, 2]], [[0, 3, 0], [4, -0.5, 0]], [[0, 0.3, 0], [3, 0.3, 0]],
          [[-2, 0.2, -2], [2, 0.25, 2]], [[0, -0.05, 0], [0, -0.05, 0]],
        ];
        for (const [name, fn] of Object.entries(grounds)) {
          for (const [prev, curr] of legs) {
            for (const [clearance, upz, hits] of [[1, 1, 0], [0.1, 0.3, 2], [dc, 0.6, 0], [0.05, NaN, 1]]) {
              const calls = [];
              const heightAt = (...a) => {
                calls.push(a);
                return fn(...a);
              };
              const p = { x: prev[0], y: prev[1], z: prev[2] };
              const q = { x: curr[0], y: curr[1], z: curr[2] };
              const ok = m.shouldScorePass(p, q, { heightAt, clearance, upz, hits });
              s.say(`shouldScorePass ${name}`, [prev, curr, clearance, upz, hits, ok, calls]);
            }
          }
        }
        /* Exactly on the buried margin: 1 - 0.1 is 0.9 in doubles. */
        for (const y of [0.9, 0.8999999999999999, 0.9000000000000001]) {
          const calls = [];
          const ok = m.shouldScorePass({ x: 0, y, z: 0 }, { x: 2, y, z: 0 }, {
            heightAt: (...a) => { calls.push(a); return 1; }, clearance: 5, upz: 1, hits: 0,
          });
          s.say(`shouldScorePass on the margin ${y}`, [ok, calls]);
        }
        for (const heightAt of [undefined, 5, null, 'x']) {
          s.say(`shouldScorePass heightAt ${String(heightAt)}`, [
            m.shouldScorePass({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { heightAt, clearance: 0.01, upz: 0.1, hits: 0 }),
            m.shouldScorePass({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { heightAt, clearance: 1, upz: 0.1, hits: 0 }),
          ]);
        }
      },
    },
    {
      id: 'turtle-gates',
      run(s) {
        seat();
        const tc = m.turtleClearance();
        const upzs = [-1, -0.36, -0.35, -0.34, 0, NaN];
        const speeds = [0, 0.99, 1, NaN];
        const rates = [0, 7.99, 8];
        const contacts = [false, true, 0, 3, 'x', undefined, null];
        const clears = [0, tc - 1e-9, tc, 1, NaN];
        for (const skip of [false, true, 1, 0]) {
          for (const u of upzs) {
            s.say(`shouldEnterTurtle skip ${skip} upz ${u}`,
              speeds.map((v) => rates.map((w) => contacts.map((ct) => clears.map((cl) => m.shouldEnterTurtle(u, v, w, ct, cl, skip))))));
          }
        }
        s.say('shouldSnapUpright', contacts.map((ct) => clears.map((cl) => m.shouldSnapUpright(-1, 0, 0, ct, cl, false))));
        s.say('shouldExitTurtle', NUMS.map((v) => m.shouldExitTurtle(v)));
        s.say('shouldExitTurtle edge', [0.5, 0.5000001].map((v) => m.shouldExitTurtle(v)));
        const flags = [false, true, 0, 2, undefined];
        s.say('shouldParkTurtle', flags.map((wt) => [0, 0.079, 0.08, NaN].map((st) => [0, 0.99, 1, NaN]
          .map((rt) => flags.map((ct) => m.shouldParkTurtle(wt, st, rt, ct))))));
        s.say('turtleFlipEase', US.map((u) => m.turtleFlipEase(u)));
        s.say('turtleFlipLift', US.map((u) => m.turtleFlipLift(u)));
        const r = seeded(402);
        const us = [];
        for (let k = 0; k < 40; k += 1) {
          us.push(r.next());
        }
        s.say('turtleFlip seeded', us.map((u) => [u, m.turtleFlipEase(u), m.turtleFlipLift(u)]));
      },
    },
    {
      id: 'turtle-slerp',
      run(s) {
        const r = seeded(403);
        const ts = [-1, -0, 0, 0.0004, 0.00049, 0.0005, 0.001, 0.25, 0.5, 0.999, 0.9995, 0.9996, 1 - 1e-9, 1, 2, NaN, Infinity];
        const toWXYZ = (q) => [q[3], q[0], q[1], q[2]];
        for (let k = 0; k < 120; k += 1) {
          const a = toWXYZ(attitude(r));
          let b = toWXYZ(attitude(r));
          if (k % 7 === 3) {
            b = a.map((v) => -v);
          } else if (k % 7 === 5) {
            b = a.slice();
          } else if (k % 11 === 4) {
            b = [a[0] + 1e-10, a[1], a[2] - 1e-10, a[3]];
          }
          const t = k < ts.length * 2 ? ts[k % ts.length] : r.next();
          if (k % 2) {
            const out = [9, 9, 9, 9];
            const got = m.turtleSlerpQuat(...a, ...b, t, out);
            s.say(`slerp${k}`, [a, b, t, got === out, got]);
          } else {
            const got = m.turtleSlerpQuat(...a, ...b, t);
            s.say(`slerp${k}`, [a, b, t, got]);
          }
        }
        s.say('a new array each call', m.turtleSlerpQuat(1, 0, 0, 0, 1, 0, 0, 0, 0.5) !== m.turtleSlerpQuat(1, 0, 0, 0, 1, 0, 0, 0, 0.5));
        s.say('zero quaternions', [m.turtleSlerpQuat(0, 0, 0, 0, 0, 0, 0, 0, 0.5), m.turtleSlerpQuat(0, 0, 0, 0, 1, 0, 0, 0, 0.3)]);
      },
    },
    {
      id: 'upright-plant-quat',
      run(s) {
        const r = seeded(404);
        for (let k = 0; k < 120; k += 1) {
          const q = attitude(r);
          s.say(`upright${k}`, [q, m.uprightPlantQuat(q[3], q[0], q[1], q[2])]);
        }
        const edges = [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0], [H, 0, 0, H], [H, 0, 0, -H], [0, H, H, 0],
          [1e-7, 0, 0, 1], [0, 0, 0, 0], [NaN, 0, 0, 0], [-1, 0, 0, 0], [0.5, 0.5, 0.5, 0.5], [0, 0, 1e-10, 1]];
        for (const q of edges) {
          s.say(`upright edge ${q}`, m.uprightPlantQuat(...q));
        }
        s.say('a new array each call', m.uprightPlantQuat(1, 0, 0, 0) !== m.uprightPlantQuat(1, 0, 0, 0));
      },
    },
    {
      id: 'contact-patch',
      run(s) {
        seat();
        const r = seeded(405);
        const out = { x: 7, y: 7, z: 7, w: 'kept' };
        for (let k = 0; k < 120; k += 1) {
          const n = k % 9 === 0 ? r.pick([[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, -1], [H, H, 0], [0, 0, 0]]) : unitVec(r);
          const q = attitude(r);
          if (k % 2) {
            const got = m.contactPatch(...n, ...q, out);
            s.say(`patch${k}`, [n, q, got === out, got]);
          } else {
            s.say(`patch${k}`, [n, q, m.contactPatch(...n, ...q)]);
          }
        }
        s.say('a new object each call', m.contactPatch(0, 1, 0, 0, 0, 0, 1) !== m.contactPatch(0, 1, 0, 0, 0, 0, 1));
        s.say('falsy out', [m.contactPatch(0, 1, 0, 0, 0, 0, 1, null), m.contactPatch(0, 1, 0, 0, 0, 0, 1, 0)]);
        /* A motor exactly on the band's edge, level, against a normal
         * (-a, 0, -b): motor 3 is deepest at A a + A b and motor 1 sits at
         * A a - A b, which for a b found here equals the deepest less the
         * band in doubles, so the band's >= decides whether it counts. */
        const A = m.CRAFT_WORLD_ARM_AXIS;
        const edges = [];
        for (const a of [0.6, 0.8, 0.31]) {
          const b0 = m.CONTACT_PATCH_BAND / (2 * A);
          for (let k = -4000; k <= 4000; k += 1) {
            const b = b0 * (1 + k * Number.EPSILON);
            if (A * a - A * b === (A * a + A * b) - m.CONTACT_PATCH_BAND) {
              edges.push([a, b]);
              break;
            }
          }
        }
        s.say('band edge normals', edges);
        for (const [a, b] of edges) {
          s.say(`band edge ${a}`, [m.contactPatch(-a, 0, -b, 0, 0, 0, 1), m.contactPatch(-a, 0, -b * (1 + 4 * Number.EPSILON), 0, 0, 0, 1)]);
        }
      },
    },
    {
      id: 'clip-watch-shape',
      run(s) {
        const a = m.makeClipWatch();
        s.say('makeClipWatch', a);
        s.say('a new object each call', a !== m.makeClipWatch());
        Object.assign(a, {
          insideMs: 5, stuckMs: 6, buriedMs: 7, ax: 1, ay: 2, az: 3, haveAnchor: true, thrashMs: 9, tx: 4, ty: 5, tz: 6, haveThrash: true,
        });
        s.say('resetClipWatch returns it', m.resetClipWatch(a) === a);
        s.say('reset', a);
        const other = { extra: 1, tz: 4, insideMs: 3 };
        m.resetClipWatch(other);
        s.say('reset of a foreign object', other);
      },
    },
    ...clipWatchCases(),
  ];
}

/* The clip watch, ticked: crash-rules-selftest's scenes written out, then
 * seeded frame streams that toggle every field the tick reads. */
function clipWatchCases() {
  const base = {
    launchStaging: false, hold: false, poseLock: false, spawnGrace: false, landed: false, turtle: false,
    interiorDepth: -1, unresolved: false, roofContact: false, buriedDepth: 0, x: 0, y: 1, z: 0, contact: false,
    takingOff: false, rateMag: 0, throttle: 0.2,
  };
  const scenes = {
    'open-air': [[{}, 16, 70]],
    bounce: [[{ unresolved: true, interiorDepth: 0.02 }, 16, 1], [{ unresolved: false }, 16, 60]],
    inside: [[{ interiorDepth: 0.03 }, 16, 15]],
    deep: [[{ interiorDepth: 0.08 }, 16, 2], [{ interiorDepth: 0.0799 }, 16, 2]],
    stuck: [[{ unresolved: true, interiorDepth: 0.011 }, 16, 30]],
    'stuck-drifting': [[{ unresolved: true, interiorDepth: 0.011, x: 'drift' }, 16, 40]],
    'stuck-roof': [[{ unresolved: true, interiorDepth: 0.011, roofContact: true }, 16, 30]],
    buried: [[{ buriedDepth: 0.22 }, 16, 14], [{ buriedDepth: 0.2199 }, 16, 2]],
    'buried-landed': [[{ buriedDepth: 0.5, landed: true }, 16, 14]],
    thrash: [[{ contact: true, rateMag: 12 }, 16, 50]],
    'thrash-throttle': [[{ contact: 1, throttle: 0.55 }, 16, 50]],
    'thrash-moving': [[{ contact: true, rateMag: 20, x: 'drift' }, 16, 60]],
    'thrash-taking-off': [[{ contact: true, rateMag: 20, takingOff: true }, 16, 60]],
    exempt: [[{ unresolved: true, interiorDepth: 0.05 }, 16, 10], [{ hold: true }, 16, 1], [{ unresolved: true, interiorDepth: 0.05 }, 16, 5],
      [{ spawnGrace: 1 }, 16, 1], [{ poseLock: 'yes' }, 16, 1], [{ launchStaging: true }, 16, 1]],
    'odd-dt': [[{ interiorDepth: 0.03 }, -5, 3], [{ interiorDepth: 0.03 }, NaN, 3], [{ interiorDepth: 0.03 }, 0, 3],
      [{ interiorDepth: 0.03 }, 200, 1]],
    'nan-depth': [[{ interiorDepth: NaN, buriedDepth: NaN, unresolved: true }, 16, 30]],
    /* Ticks that land every timer exactly on its threshold: 10 ms frames
     * reach 180, 350 and 700 to the millisecond, and the travels below are
     * exactly the limits (0.4 and 0.6 are their own square roots' squares
     * in doubles). */
    'exact-inside': [[{ interiorDepth: 0.03 }, 10, 19]],
    'exact-buried': [[{ buriedDepth: 0.3 }, 10, 19]],
    'exact-stuck': [[{ unresolved: true, interiorDepth: 0.011 }, 10, 34], [{ unresolved: true, interiorDepth: 0.011, x: 0.4 }, 10, 2]],
    'exact-stuck-short': [[{ unresolved: true, interiorDepth: 0.011 }, 10, 34], [{ unresolved: true, interiorDepth: 0.011, x: 0.39999999 }, 10, 2]],
    'exact-thrash': [[{ contact: true, rateMag: 12 }, 10, 69], [{ contact: true, rateMag: 12, x: 0.6 }, 10, 2]],
    'exact-thrash-short': [[{ contact: true, rateMag: 12 }, 10, 69], [{ contact: true, rateMag: 12, x: 0.59999999 }, 10, 2]],
  };
  /*
   * From a fresh watch 'stuck' can never fire: every tick that counts
   * stuckMs counts insideMs too, so 'inside' at 180 ms always comes first.
   * The watch is the caller's object, though, and its fields are its
   * state, so these start from a watch whose insideMs is held back, which
   * reaches the stuck branch and its travel test.
   */
  const preload = { 'preloaded-stuck': -400, 'preloaded-stuck-short': -400, 'preloaded-stuck-moving': -400 };
  const stuckAt = (x) => [[{ unresolved: true, interiorDepth: 0.011 }, 10, 34], [{ unresolved: true, interiorDepth: 0.011, x }, 10, 3]];
  scenes['preloaded-stuck'] = stuckAt(0.4);
  scenes['preloaded-stuck-short'] = stuckAt(0.39999999);
  scenes['preloaded-stuck-moving'] = [[{ unresolved: true, interiorDepth: 0.02, x: 'drift' }, 10, 58]];
  const cases = [];
  for (const [name, script] of Object.entries(scenes)) {
    cases.push({
      id: `clip-${name}`,
      run(s) {
        const w = m.makeClipWatch();
        if (name in preload) {
          w.insideMs = preload[name];
        }
        let tick = 0;
        for (const [over, dt, n] of script) {
          for (let k = 0; k < n; k += 1) {
            const sample = { ...base, ...over };
            if (sample.x === 'drift') {
              sample.x = tick * 0.031;
            }
            tick += 1;
            const got = m.clipWatchTick(w, sample, dt);
            s.say(`tick${tick}`, [got, Object.values(w)]);
          }
        }
      },
    });
  }
  for (const seed of [501, 502, 503, 504]) {
    cases.push({
      id: `clip-seeded-${seed}`,
      run(s) {
        const r = seeded(seed);
        const w = m.makeClipWatch();
        const sample = { ...base };
        for (let k = 0; k < 220; k += 1) {
          /* Fields change in runs, as a flight's do, so the timers reach
           * their thresholds. */
          if (r.chance(0.12)) {
            const f = r.pick(['landed', 'turtle', 'unresolved', 'roofContact', 'contact', 'takingOff', 'hold', 'spawnGrace']);
            sample[f] = r.chance(0.02) ? 'odd' : !sample[f];
            if (f === 'hold' || f === 'spawnGrace') {
              sample[f] = r.chance(0.3);
            }
          }
          if (r.chance(0.15)) {
            sample.interiorDepth = r.pick([-0.5, 0, 0.01, 0.0101, 0.05, 0.08, NaN]);
          }
          if (r.chance(0.1)) {
            sample.buriedDepth = r.pick([0, 0.1, 0.22, 0.4]);
          }
          if (r.chance(0.1)) {
            sample.rateMag = r.pick([0, 11.9, 12, 30]);
            sample.throttle = r.pick([0, 0.54, 0.55, 1]);
          }
          sample.x += r.range(-0.01, 0.03);
          sample.z += r.range(-0.01, 0.01);
          const dt = r.pick([16, 16, 16, 4, 33, 0]);
          const got = m.clipWatchTick(w, { ...sample }, dt);
          s.say(`tick${k}`, [got, Object.values(w)]);
        }
      },
    });
  }
  return cases;
}

/* ------------------------------------------------------- construction and errors */

/* Each throws, with the object's state after it said too, since a throw
 * must leave what the spec says it leaves. */
function errorCases() {
  return [
    {
      id: 'errors-adds',
      run(s) {
        seat();
        const c = new Colliders();
        c.add('wall', 0, 0, 0, 1, 0, 0, 0.5);
        s.call('add unknown', () => c.add('nope', 0, 0, 0, 1, 0, 0, 0.5));
        s.call('add undefined kind', () => c.add(undefined, 0, 0, 0, 1, 0, 0, 0.5));
        s.call('addPost unknown', () => c.addPost('Tree', 0, 0, 0, 1, 0.5));
        s.call('addSphere unknown', () => c.addSphere('', 0, 0, 0, 0.5));
        s.call('addBox unknown', () => c.addBox('walls', 0, 0, 0, 1, 1, 1));
        s.call('addTurnedBox unknown', () => c.addTurnedBox('x', 1, 0, 0, 1, 0, 1, 0, 1));
        for (const args of [[0, 0, 0, 1, 0, 1, 0, 1], [NaN, 1, 0, 1, 0, 1, 0, 1], [1, 0, 2, 1, 0, 1, 0, 1], [1, 0, 0, 1, 2, 1, 0, 1],
          [1, 0, 0, 1, 0, 1, 2, 1], [1, 0, NaN, 1, 0, 1, 0, 1], [1, 0, 0, 1, 0, NaN, 0, 1], [1, 0, 0, 1, 0, 1, 0, NaN],
          [-0, 1e-300, 0, 1, 0, 1, 0, 1], [1e-200, 1e-200, 0, 1, 0, 1, 0, 1]]) {
          s.call(`addTurnedBox ${args}`, () => c.addTurnedBox('wall', ...args));
        }
        s.call('addMoving unknown', () => c.addMoving('car', 1, 1, 1));
        const box = c.addBox('wall', 0, 0, 0, 1, 1, 1);
        const turned = c.addTurnedBox('wall', 1, 1, 0, 1, 0, 1, 0, 1);
        s.call('sweep a box', () => c.sweep(box, -10, -10, 10, 10));
        s.call('sweep a turned box', () => c.sweep(turned, -10, -10, 10, 10));
        s.call('sweep nothing', () => c.sweep(99, -10, -10, 10, 10));
        s.call('sweep too small x0', () => c.sweep(0, -0.4, -1, 2, 1));
        s.call('sweep too small z1', () => c.sweep(0, -0.5, -0.5, 1.5, 0.4999));
        s.call('sweep NaN', () => c.sweep(0, NaN, -1, 2, 1));
        s.call('sweep exact', () => (c.sweep(0, -0.5, -0.5, 1.5, 0.5) === c ? 'this' : 'other'));
        s.call('sweep again', () => (c.sweep(0, -5, -5, 5, 5) === c ? 'this' : 'other'));
        s.say('ax.length after the throws', c.ax.length);
        c.build();
        sayState(s, 'built', c);
        s.call('moveCapsule within the second sweep', () => (c.moveCapsule(0, [-4.5, 1, -4], [3.9, 2, 4]) === c ? 'this' : 'other'));
        s.call('moveCapsule just past it', () => c.moveCapsule(0, [-4.5, 1, -4], [4.5011, 2, 4]));
        s.call('moveCapsule within the tolerance', () => (c.moveCapsule(0, [-4.5, 1, -4], [4.5009, 2, 4]) === c ? 'this' : 'other'));
        /* Each side of the sweep [-5, -5, 5, 5] with the capsule's 0.5
         * radius: just inside the 1e-3 tolerance, just past it, and well
         * past. */
        for (const over of [0.0009, 0.0011, 0.005]) {
          const e = 4.5 + over;
          for (const [a, b] of [[[-e, 0, 0], [0, 1, 0]], [[0, 0, 0], [e, 1, 0]], [[0, 0, -e], [0, 1, 0]], [[0, 0, 0], [0, 1, e]]]) {
            s.call(`moveCapsule ${a} ${b}`, () => (c.moveCapsule(0, a, b) === c ? 'this' : 'other'));
          }
        }
        s.call('moveCapsule NaN', () => c.moveCapsule(0, [NaN, 1, 0], [0, 1, 0]));
        s.call('moveCapsule unregistered', () => c.moveCapsule(1, [0, 0, 0], [0, 0, 0]));
        sayViews(s, 'moved', c);
      },
    },
    {
      id: 'errors-build',
      run(s) {
        seat();
        const mk = (fn) => {
          const c = new Colliders();
          fn(c);
          s.call('build', () => (c.build() === c ? 'this' : 'other'));
          s.say('after', [c.built, c.count, c.staticCount, c.stats()]);
        };
        mk((c) => c.addBox('wall', 17000, 0, -5, 17000.5, 10, 5));
        mk((c) => c.addPost('tree', NaN, 0, 0, 10, 0.3));
        mk((c) => c.addPost('tree', 0, 0, 0, 10, NaN));
        mk((c) => c.addSphere('rock', 16383.9, 0, 0, 0.05));
        mk((c) => c.addSphere('rock', 16383.9, 0, 0, 0.2));
        mk((c) => c.addSphere('rock', -16384, 0, -16384, 0));
        mk((c) => c.addSphere('rock', -16384.001, 0, 0, 0));
        mk((c) => c.addBox('wall', 0, 0, 0, 1, 1, 16384));
        mk((c) => c.addTurnedBox('wall', 1, 1, 23000, 23100, 0, 1, 0, 1));
        mk((c) => {
          c.addBox('wall', 0, 0, 0, 1, 1, 1);
          c.add('pole', 0, 0, 0, 0, 1, 1e9, 0.1);
          c.addBox('wall', -1e9, 0, 0, 0, 1, 1);
        });
        mk((c) => {
          c.add('pole', 0, 0, 0, 1, 1, 1, 0.1);
          c.sweep(0, -16390, -1, 2, 2);
        });
        mk((c) => c.addBox('wall', 1e30, 0, 0, 1e30, 1, 1));
        mk((c) => c.add('wire', 0, 0, 0, Infinity, 0, 0, 0.01));
        mk(() => {});
      },
    },
    {
      id: 'errors-after-build',
      run(s) {
        seat();
        const pre = new Colliders();
        pre.addBox('wall', 0, 0, 0, 1, 1, 1);
        pre.add('pole', 0, 0, 0, 0, 1, 0, 0.1);
        pre.sweep(1, -1, -1, 1, 1);
        for (const [name, fn] of [
          ['setBoxExtentY', () => pre.setBoxExtentY(0, 0, 1)], ['setBoxTop', () => pre.setBoxTop(0, 1)],
          ['retire', () => pre.retire(0)], ['moveCapsule', () => pre.moveCapsule(1, [0, 0, 0], [0, 1, 0])],
          ['setBuilt', () => pre.setBuilt([])], ['streamFill', () => pre.streamFill()],
          ['restore', () => (pre.restore(0) === pre ? 'this' : 'other')], ['retired', () => pre.retired()],
        ]) {
          s.call(`${name} before build`, fn);
        }
        const c = new Colliders();
        c.addBox('wall', 0, 0, 0, 1, 1, 1);
        c.add('pole', 2, 0, 2, 2, 1, 2, 0.1);
        c.addTurnedBox('wall', 0.3, 0.7, 0, 1, 0, 2, 0, 1);
        c.build();
        s.call('setBoxExtentY a capsule', () => c.setBoxExtentY(1, 0, 1));
        s.call('setBoxExtentY out of range', () => c.setBoxExtentY(3, 0, 1));
        s.call('setBoxExtentY -1', () => c.setBoxExtentY(-1, 0, 1));
        s.call('setBoxExtentY inverted', () => c.setBoxExtentY(0, 2, 1));
        s.call('setBoxExtentY NaN', () => c.setBoxExtentY(0, NaN, 1));
        s.call('setBoxExtentY flat', () => (c.setBoxExtentY(0, 0.123456789, 0.123456789) === c ? 'this' : 'other'));
        s.call('setBoxExtentY turned', () => (c.setBoxExtentY(2, -0.3333333, 5.5555555) === c ? 'this' : 'other'));
        s.call('setBoxTop a capsule', () => c.setBoxTop(1, 1));
        s.call('setBoxTop below', () => c.setBoxTop(0, 0.1));
        s.call('setBoxTop NaN', () => c.setBoxTop(0, NaN));
        s.call('setBoxTop', () => (c.setBoxTop(0, 7.7777777) === c ? 'this' : 'other'));
        s.call('setBoxTop equal', () => (c.setBoxTop(2, c.fay[2]) === c ? 'this' : 'other'));
        sayViews(s, 'boxes moved', c);
        s.call('retire -1', () => c.retire(-1));
        s.call('retire count', () => c.retire(3));
        s.call('retire NaN', () => c.retire(NaN));
        s.call('restore never retired', () => (c.restore(1) === c ? 'this' : 'other'));
        s.say('staticGen', c.staticGen);
        s.call('setBuilt unknown kind', () => c.setBuilt([{ kind: 'pylon', ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, r: 0.1 },
          { kind: 'cone', ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, r: 0.1 }]));
        s.call('setBuilt outside the grid', () => c.setBuilt([{ kind: 'gate', ax: 20000, ay: 0, az: 0, bx: 20000, by: 1, bz: 0, r: 0.1 }]));
        sayState(s, 'after the throws', c);
        sayViews(s, 'after the throws', c);
        s.call('moveCapsule not swept', () => c.moveCapsule(1, [2, 0, 2], [2, 1, 2]));
        s.call('moveCapsule a box', () => c.moveCapsule(0, [2, 0, 2], [2, 1, 2]));
      },
    },
    {
      id: 'errors-refill',
      run(s) {
        seat();
        const c = new Colliders();
        c.addBox('wall', 0, 0, 0, 1, 1, 1);
        c.build();
        const f = c.streamFill();
        /* A refill validates a sweep as the static set does, and its grid
         * then ignores it. */
        s.call('a refill sweep of nothing', () => f.sweep(0, -1, -1, 1, 1));
        s.say('add returns the refill', f.add('tree', 5, 0, 5, 5, 3, 5, 0.3) === f);
        s.call('a refill sweep too small', () => f.sweep(0, 4.9, 4.9, 5.1, 5.1));
        s.call('a refill sweep', () => (f.sweep(0, -100, -100, 100, 100) === f ? 'this' : 'other'));
        s.say('addBox index', f.addBox('wall', 8, 0, 8, 9, 1, 9));
        s.say('addTurnedBox index', f.addTurnedBox('wall', 1, 2, 0, 1, 0, 1, 0, 1));
        s.say('addPost and addSphere return the refill', [f.addPost('pole', 3, 3, 0, 2, 0.1) === f, f.addSphere('rock', 4, 1, 4, 0.5) === f]);
        s.say('ax.length', f.ax.length);
        s.call('add unknown on a refill', () => f.add('nope', 0, 0, 0, 0, 0, 0, 1));
        s.say('first step at 1', f.step(1));
        for (const [name, fn] of [['add', () => f.add('tree', 0, 0, 0, 0, 1, 0, 0.1)], ['addPost', () => f.addPost('tree', 0, 0, 0, 1, 0.1)],
          ['addSphere', () => f.addSphere('rock', 0, 0, 0, 1)], ['addBox', () => f.addBox('wall', 0, 0, 0, 1, 1, 1)],
          ['addTurnedBox', () => f.addTurnedBox('wall', 1, 0, 0, 1, 0, 1, 0, 1)], ['add unknown', () => f.add('nope', 0, 0, 0, 0, 0, 0, 1)]]) {
          s.call(`${name} after the first step`, fn);
        }
        s.say('rest', runs(stepOut(f, 1)));
        s.call('step after the swap', () => f.step());
        const a = c.streamFill();
        a.addBox('wall', 20, 0, 20, 21, 1, 21);
        s.say('a first step', a.step(0));
        const b = c.streamFill();
        s.call('step on the replaced refill', () => a.step());
        s.say('the newer one', runs(stepOut(b)));
        sayState(s, 'after', c);
        const bad = c.streamFill();
        bad.addBox('wall', 0, 0, 0, 1, 1, 1);
        bad.addBox('wall', 17000, 0, 0, 17001, 1, 1);
        s.call('a refill outside the grid', () => bad.step());
        sayState(s, 'after the bad refill', c);
        const nanFill = c.streamFill();
        nanFill.addPost('tree', NaN, 0, 0, 1, 0.1);
        s.call('a NaN refill', () => nanFill.step(Infinity));
        const later = c.streamFill();
        later.addPost('tree', 2, 2, 0, 1, 0.1);
        s.say('a refill after the throws', runs(stepOut(later)));
        sayState(s, 'end', c);
        sayViews(s, 'end', c);
      },
    },
  ];
}

/* ------------------------------------------------------------ prebuild family */

function prebuildCases() {
  return [
    {
      id: 'prebuild-fields',
      run(s) {
        seat();
        const c = new Colliders();
        s.say('fields', [c.built, c.count, c.baseCount, c.staticCount, c.streamCount, c.streamGen, c.staticGen, c.softKinds,
          c.movingCount, c.grid, 'noteFootprint' in c]);
        s.say('views', VIEWS.map((v) => c[v]));
        s.say('moving', MOVING.map((f) => c[f]));
        s.say('report', HIT.map((f) => c[f]));
        s.say('axis', AXIS.map((f) => c[f]));
        s.say('nxyz', [c.nx, c.ny, c.nz]);
        s.say('stats', c.stats());
        s.say('ax.length', c.ax.length);
        c.addPost('tree', 1, 1, 0, 3, 0.25);
        c.addBox('wall', 3, 0, 3, 2, 2, 2);
        c.add('wire', 0, 5, 0, 30, 5, 0, 0.02);
        s.say('ax.length after three', c.ax.length);
        s.say('stats after three', c.stats());
        s.say('addMoving before build', c.addMoving('train', 1, 1, 2));
        c.seatMoving(0, 10, 1, 0);
        s.say('hit before build', [c.hit(0, 1, 0, 10, 1, 0), HIT.map((f) => c[f])]);
        s.say('gapAt before build', c.gapAt(1, 1, 1, 5));
        s.say('axisAt before build', [c.axisAt(1, 1, 1, 5), AXIS.map((f) => c[f])]);
        s.say('interiorAt before build', c.interiorAt(0, 1, 1, 1));
        s.say('crossedStatic before build', c.crossedStatic(0, 0, 1, 1, 2, 1, 1));
        s.say('interiorOfHit before build', c.interiorOfHit(1, 1, 1));
        s.say('crossedHit before build', c.crossedHit(0, 1, 1, 2, 1, 1));
        s.say('crossedMoving before build', [c.crossedMoving(0, 8, 1, 0, 12, 1, 0), c.crossedMoving(1, 8, 1, 0, 12, 1, 0)]);
        s.say('kindName before build', [c.kindName(2), c.kindName(-1)]);
        s.say('stats before build', c.stats());
        c.build();
        s.say('stats after build', c.stats());
      },
    },
    {
      id: 'prebuild-report-carryover',
      run(s) {
        /* hitPen undefined until the first hit; hitArmX..Z kept from the
         * last parts hit through every later disc hit. */
        seat();
        const c = new Colliders();
        c.addBox('wall', -1, 0, -1, 1, 2, 1);
        c.build();
        s.say('fresh', HIT.map((f) => c[f]));
        s.say('miss', [c.hit(10, 1, 10, 11, 1, 10), HIT.map((f) => c[f])]);
        m.setCraftParts(hullOf(HAND_HULLS['turned-box-wing']));
        s.say('parts hit', [c.hit(-3, 1, 0, 0, 1, 0), HIT.map((f) => c[f])]);
        m.setCraftParts(null);
        s.say('disc hit after', [c.hit(-3, 1, 0, 0, 1, 0), HIT.map((f) => c[f])]);
        s.say('disc miss after', [c.hit(10, 1, 10, 11, 1, 10), HIT.map((f) => c[f])]);
        s.say('non finite', [c.hit(NaN, 1, 0, 0, 1, 0), c.hit(0, 1, 0, Infinity, 1, 0), HIT.map((f) => c[f]), c.stats()]);
      },
    },
  ];
}

/* --------------------------------------------------------------- nx ny nz */

/* After every query that runs the axis to point arithmetic inside it. */
function nxyzCases() {
  return [601, 602, 603].map((seed) => ({
    id: `nxyz-${seed}`,
    run(s) {
      seat();
      const w = { seed, n: 30, centre: [0, 0, 0], spread: 6, longs: false, moving: 1 };
      const { c, world } = makeWorld(null, w);
      const r = seeded(seed + 1);
      for (let k = 0; k < 40; k += 1) {
        const [p, q] = travel(c, r, world);
        const kind = c.hit(...p, ...q, undefined, ...attitude(r), 0);
        s.say(`hit${k}`, [p, q, kind, c.nx, c.ny, c.nz]);
        const g = target(c, r, world);
        s.say(`gapAt${k}`, [g, c.gapAt(...g, 2), c.nx, c.ny, c.nz]);
        s.say(`axisAt${k}`, [g, c.axisAt(...g, 2), c.nx, c.ny, c.nz]);
        const i = r.int(0, c.count - 1);
        s.say(`interiorAt${k}`, [i, c.interiorAt(i, ...g), c.nx, c.ny, c.nz]);
        s.say(`crossedStatic${k}`, [i, c.crossedStatic(i, ...p, ...q), c.nx, c.ny, c.nz]);
        s.say(`interiorOfHit${k}`, [c.interiorOfHit(...q), c.nx, c.ny, c.nz]);
        s.say(`crossedHit${k}`, [c.crossedHit(...p, ...q), c.nx, c.ny, c.nz]);
      }
    },
  }));
}

/* ------------------------------------------------------------------- ties */

/*
 * Equal answers from different colliders: the first in the visiting order
 * (static cells x then z, then streamed, then built) wins the sweep; gapAt
 * and axisAt keep the first equal gap but take a later negative one.
 */
function tieCases() {
  const probe = (s, tag, c, r, n) => {
    const w = { centre: [0, 1, 0], spread: 3, movingH: [] };
    for (let k = 0; k < n; k += 1) {
      const [p, q] = travel(c, r, w);
      hitCall(s, `${tag} hit${k}`, c, r, k, p, q);
      const g = target(c, r, w);
      s.say(`${tag} gap${k}`, [g, c.gapAt(...g, 3), c.axisAt(...g, 3), AXIS.map((f) => c[f])]);
    }
    for (const [p, q] of [[[-5, 1, 0], [5, 1, 0]], [[0, 6, 0], [0, -3, 0]], [[0, 1, -5], [0, 1, 5]], [[-4, 1, -4], [4, 1, 4]]]) {
      hitCall(s, `${tag} cross ${p}`, c, r, 0, p, q);
    }
    for (const g of [[0, 1, 0], [0.01, 1, 0], [0, 0.5, 0], [8, 1, 0], [-8, 1, 0]]) {
      s.say(`${tag} at ${g}`, [c.gapAt(...g, 3), c.gapAt(...g, 3, true), c.axisAt(...g, 3), AXIS.map((f) => c[f])]);
    }
  };
  return [
    {
      /* A post met head on along a motor diagonal by a level craft: the
       * discs' support there is the arm plus the hull, CRAFT_WORLD_R to
       * the last bit or so, which is where the sweep's re-solve
       * threshold (a shrink of more than 1e-9) decides. */
      id: 'refine-edge',
      run(s) {
        seat();
        const c = new Colliders();
        c.addPost('pole', 0, 0, 0, 4, 0.1);
        c.add('wire', -6, 2, 3, 6, 2, 3, 0.02);
        c.build();
        for (const deg of [44.999, 45, 45.001, 135, 225, 315, 0, 90, 30]) {
          const a = (deg * Math.PI) / 180;
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          /* Across the diagonal, passing the post at `off`, so the
           * nearest approach's direction is the diagonal itself. */
          for (const off of [0.2, 0.26, 0.15]) {
            const p = [dx * off + dz, 2, dz * off - dx];
            const q = [dx * off - dz, 2, dz * off + dx];
            for (const att of [[0, 0, 0, 1], [0, H, 0, H], [0, 0.3826834323650898, 0, 0.9238795325112867]]) {
              const kind = c.hit(...p, ...q, 0.0415, ...att, 0);
              s.say(`post ${deg} ${off} ${att}`, hitOut(c, kind));
            }
          }
          const p = [-dx * 0.4, 2, 3 - dz * 0.4];
          const kind = c.hit(...p, dx * 0.05, 2, 3 + dz * 0.05, 0.0415, 0, 0, 0, 1, 0);
          s.say(`wire ${deg}`, hitOut(c, kind));
        }
      },
    },
    {
      id: 'ties-duplicates',
      run(s) {
        seat();
        const c = new Colliders();
        for (let k = 0; k < 2; k += 1) {
          c.add('pole', -1, 0, 0, 1, 2, 0, 0.1);
          c.addBox('wall', -0.5, 0, -0.5, 0.5, 2, 0.5);
          c.addTurnedBox('wall', 1, 0, -0.5, 0.5, 0, 2, -0.5, 0.5);
          c.addPost('tree', 0, 0, 0, 2, 0.5);
          c.addSphere('canopy', 0, 1, 0, 0.5);
        }
        c.add('obstacle', 0, 1, -0.7, 0, 1, 0.7, 0.2);
        c.add('obstacle', 0, 1, 0.7, 0, 1, -0.7, 0.2);
        c.build();
        probe(s, 'static', c, seeded(701), 40);
        const twin = { kind: 'gate', ax: 0, ay: 0, az: 0, bx: 0, by: 2, bz: 0, r: 0.5 };
        c.setBuilt([twin, { ...twin }]);
        const f = c.streamFill();
        f.addPost('tree', 0, 0, 0, 2, 0.5);
        f.addBox('wall', -0.5, 0, -0.5, 0.5, 2, 0.5);
        stepOut(f);
        probe(s, 'all three sets', c, seeded(702), 40);
        for (let i = 0; i < c.staticCount; i += 1) {
          c.pass[i] = 1;
        }
        probe(s, 'statics passed', c, seeded(703), 20);
      },
    },
    {
      id: 'ties-across-cells',
      run(s) {
        /* The same post registered in four cells round the origin, and
         * equal walls either side of a cell line, met by a travel that
         * reaches both at once. */
        seat();
        const c = new Colliders();
        c.addPost('pole', 0, 0, 0, 3, 0.4);
        c.addBox('wall', 7, 0, -1, 7.5, 3, 1);
        c.addBox('wall', 8.5, 0, -1, 9, 3, 1);
        c.addBox('wall', -1, 0, 7, 1, 3, 7.5);
        c.addBox('wall', -1, 0, 8.5, 1, 3, 9);
        c.add('wire', -40, 2, 4, 40, 2, 4, 0.02);
        c.add('wire', -40, 2, 4, 40, 2, 4, 0.02);
        c.build();
        probe(s, 'cells', c, seeded(704), 40);
        for (const [p, q] of [[[8, 1, -3], [8, 1, 3]], [[-3, 1, 8], [3, 1, 8]], [[8, 1, 0], [8, 1, 0]], [[-20, 2, 3], [20, 2, 5]]]) {
          hitCall(s, `between ${p}`, c, seeded(705), 1, p, q);
        }
      },
    },
  ];
}

/* ------------------------------------------------------------ streamed sets */

/*
 * The refill's step accounting, which decides on which sim frame a
 * streamed collider becomes solid: refills of known footprints stepped at
 * every kind of budget, including those that never progress (0, negative,
 * NaN) and a collider far bigger than the budget.
 */
function streamCases() {
  const footprints = {
    /* 1, 4 and 9 cell boxes, and a 50 by 2 cell wall. */
    mixed: (f) => {
      f.addBox('wall', 1, 0, 1, 2, 3, 2);
      f.addBox('wall', 7, 0, 7, 9, 3, 9);
      f.addBox('wall', 15, 0, 15, 31, 3, 31);
      f.addBox('wall', -200, 0, 40, 199, 3, 41);
      for (let j = 0; j < 12; j += 1) {
        f.addPost('tree', j * 8 + 4, -20, 0, 5, 0.3);
      }
      f.addTurnedBox('wall', 0.6, 0.8, 0, 50, 0, 2, 0, 1);
    },
    many: (f) => {
      for (let j = 0; j < 600; j += 1) {
        f.addPost('tree', (j % 30) * 3.5 - 50, Math.floor(j / 30) * 3.5 - 30, 0, 6, 0.3);
      }
    },
    empty: () => {},
  };
  const budgets = [0, -1, NaN, 1, 2, 3, 7, 16, 100, m.STREAM_SLICE / 2, m.STREAM_SLICE, undefined, Infinity];
  const cases = [];
  for (const [name, fill] of Object.entries(footprints)) {
    cases.push({
      id: `stream-${name}`,
      run(s) {
        seat();
        const c = new Colliders();
        c.addBox('wall', -3, 0, -3, 3, 1, 3);
        c.build();
        c.setBuilt([{ kind: 'gate', ax: 10, ay: 0, az: 10, bx: 10, by: 2, bz: 10, r: 0.05 }]);
        for (const b of budgets) {
          const f = c.streamFill();
          fill(f);
          const limit = b === 0 || b < 0 || Number.isNaN(b) ? 4 : 100000;
          const steps = stepOut(f, b, limit);
          s.say(`steps at ${b}`, runs(steps));
          if (steps[steps.length - 1] === 'gave up') {
            /* The refill in progress is still the current one: another
             * budget finishes it. */
            s.say(`then at the default`, runs(stepOut(f)));
          }
          sayState(s, `at ${b}`, c);
        }
        sayViews(s, 'end', c);
        const r = seeded(801);
        sweep(s, 'end', c, r, { centre: [0, 1, 0], spread: 40, movingH: [] }, LIGHT);
      },
    });
  }
  /*
   * grid-check's streamed set, call for call, and its slices world at the
   * size of swiss2 High: 234 730 posts and crowns built at once, then two
   * refills of 25 000 walls stepped at STREAM_SLICE, the step counts and
   * a sweep over the result said.
   */
  cases.push({
    id: 'stream-grid-check-slices',
    run(s) {
      seat();
      let x = 1;
      const rnd = () => {
        x = (x * 1103515245 + 12345) >>> 0;
        return x / 4294967296;
      };
      const c = new Colliders();
      for (let j = 0; j < 234730; j += 1) {
        const px = (rnd() - 0.5) * 5800;
        const pz = (rnd() - 0.5) * 5800;
        if (j % 3) {
          c.addPost('tree', px, pz, 0, 8, 0.3);
        } else {
          c.addSphere('canopy', px, 8, pz, 2);
        }
      }
      c.build();
      sayState(s, 'built', c);
      for (const [cx, cz, b] of [[2000, 1000, undefined], [1600, 1000, m.STREAM_SLICE / 2]]) {
        const f = c.streamFill();
        for (let j = 0; j < 25000; j += 1) {
          const rr = Math.sqrt(rnd()) * 1000;
          const a = rnd() * Math.PI * 2;
          const px = cx + rr * Math.cos(a);
          const pz = cz + rr * Math.sin(a);
          const len = j % 3 ? 3 + rnd() * 9 : 1;
          f.addBox('wall', px, 0, pz, px + len, 6, pz + 0.3);
        }
        s.say(`refill at ${cx} steps`, runs(stepOut(f, b)));
        sayState(s, `refill at ${cx}`, c);
        const r = seeded(cx);
        sweep(s, `refill at ${cx}`, c, r, { centre: [cx, 3, cz], spread: 900, movingH: [] }, { ...LIGHT, hit: 60 });
      }
    },
  });
  return cases;
}

/* ------------------------------------------------------------ the grid's edge */

function edgeCases() {
  return [{
    id: 'grid-edge',
    run(s) {
      seat();
      const c = new Colliders();
      c.addSphere('rock', -16384, 2, -16384, 0);
      c.addBox('wall', 16376, 0, 16376, 16383.99, 4, 16383.99);
      c.addPost('pole', -16383.5, 16383.5, 0, 3, 0.4);
      c.addBox('wall', -16384, 0, -5, -16380, 4, 5);
      c.add('wire', -16000, 10, 0, 16000, 10, 0, 0.03);
      c.build();
      sayState(s, 'built', c);
      sayViews(s, 'built', c);
      const r = seeded(901);
      const w = { centre: [0, 2, 0], spread: 16000, movingH: [] };
      sweep(s, 'edge', c, r, w, LIGHT);
      const far = [[-1e6, 2, -16384, -16383, 2, -16384], [16380, 2, 16380, 1e6, 2, 1e6], [-20000, 10, 0, 20000, 10, 0],
        [16380, 2, 16380, 16380, 2, 16380], [-16384.5, 2, -16384.5, -16383.5, 2, -16383.5], [0, 10, -1e7, 0, 10, 1e7]];
      for (const p of far) {
        hitCall(s, `far ${p}`, c, r, 0, p.slice(0, 3), p.slice(3));
      }
      for (const g of [[-16384, 2, -16384], [16383, 2, 16383], [1e9, 0, 1e9], [NaN, 0, 0], [0, NaN, 0], [-Infinity, 0, 0]]) {
        s.say(`gap ${g}`, [c.gapAt(...g, 2), c.gapAt(...g, NaN), c.axisAt(...g, 2), AXIS.map((f) => c[f])]);
      }
      s.say('non finite hits', [c.hit(NaN, 0, 0, 0, 0, 0), c.hit(0, 0, 0, 0, -Infinity, 0), c.hit(0, 0, 0, 0, 0, 0, NaN), HIT.map((f) => c[f])]);
      sayState(s, 'end', c);
    },
  }];
}

/* ------------------------------------------------------------- real worlds */

/* Replays a check's own calls on its own world, then a seeded sweep
 * around it. */
function realCases() {
  const cases = [];
  cases.push({
    id: 'real-crash-rules',
    run(s) {
      seat();
      const box = new Colliders();
      box.addBox('wall', 0, 0, 0, 2, 2, 2);
      box.build();
      s.say('box hit', hitOut(box, box.hit(1, 1, 1, 1, 1, 1, 0.04)));
      s.say('box interiorOfHit', [[1, 1, 1], [2, 1, 1], [3, 1, 1], [2.05, 1, 1]].map((p) => box.interiorOfHit(...p)));
      const post = new Colliders();
      post.addPost('pole', 0, 0, 0, 2, 0.05);
      post.build();
      s.say('post hit', hitOut(post, post.hit(0, 1, 0, 0, 1, 0, 0.04)));
      s.say('post interiorOfHit', [[0, 1, 0], [0.01, 1, 0], [0.08, 1, 0]].map((p) => post.interiorOfHit(...p)));
      const train = new Colliders();
      train.build();
      const car = train.addMoving('train', 1, 0.5, 2);
      s.say('car', car);
      train.seatMoving(car, 10, 1, 0);
      s.say('train hit', hitOut(train, train.hit(10, 1, 0, 10, 1, 0, 0.04)));
      s.say('train interiorOfHit', train.interiorOfHit(10, 1, 0));
      const wall = new Colliders();
      wall.addBox('wall', -0.1, 0, 0, 0.1, 2, 4);
      wall.build();
      s.say('wall hit', hitOut(wall, wall.hit(-1, 1, 2, 1, 1, 2, 0.04)));
      s.say('wall crossedHit', [[-1, 1, 2, 1, 1, 2], [-1, 1, 2, -0.12, 1, 2], [-1, 1, 2, 0.12, 1, 2], [-1, 1, -1, -1, 1, 5],
        [-1, 3, 2, 1, 3, 2], [-1, 1, -0.5, 0.5, 1, -1]].map((a) => wall.crossedHit(...a)));
      const deck = new Colliders();
      deck.addBox('wall', -2, 0.50, -2, 2, 0.64, 2);
      deck.build();
      s.say('deck hit', hitOut(deck, deck.hit(0, 3, 0, 0, -1, 0, 0.04)));
      s.say('deck', [deck.crossedHit(0, 3, 0, 0, -1, 0), deck.interiorOfHit(0, 1, 0), deck.crossedHit(0, 3, 0, 0, 0.72, 0),
        deck.crossedHit(-3, 2, 0, 3, 2, 0), deck.crossedHit(-3, 0.3, 0, 3, 0.3, 0)]);
      s.say('post again', hitOut(post, post.hit(-1, 1, 0, 1, 1, 0, 0.04)));
      s.say('post crossedHit', [[-1, 1, 0, 1, 1, 0], [-1, 1, 0, -0.08, 1, 0], [-10, 1, 0, 0.08, 1, 0], [-1, 1, 0.2, 1, 1, 0.2]]
        .map((a) => post.crossedHit(...a)));
      s.say('train again', hitOut(train, train.hit(8, 1, 0, 12, 1, 0, 0.04)));
      s.say('train crossedHit', [train.crossedHit(8, 1, 0, 12, 1, 0), train.crossedHit(12.2, 1, -4, 12.2, 1, 4)]);
      const r = seeded(1001);
      for (const [name, c] of [['box', box], ['post', post], ['train', train], ['wall', wall], ['deck', deck]]) {
        const w = { centre: [name === 'train' ? 10 : 0, 1, name === 'wall' ? 2 : 0], spread: 3, movingH: [[1, 0.5, 2]] };
        sweep(s, name, c, r, w, LIGHT);
      }
    },
  });
  cases.push({
    id: 'real-build-selftest',
    run(s) {
      seat();
      const col = new Colliders();
      col.addPost('tree', 30, -10, 0, 12, 0.4);
      col.addBox('wall', -40, 0, -60, -30, 8, -50);
      col.add('gate', 5, 1, -20, 7, 1, -20, 0.02);
      col.addSphere('canopy', 30, 14, -10, 3);
      col.build();
      const probes = [[20, 5, -10, 40, 5, -10], [-50, 4, -55, -20, 4, -55], [6, 1, -25, 6, 1, -15], [30, 20, -10, 30, 8, -10],
        [60, 3, 0, 60, 3, -100]];
      const answer = () => probes.map((p) => hitOut(col, col.hit(...p)));
      s.say('probes', answer());
      s.say('gap', col.gapAt(0, 3, -50, 5));
      const cellsBefore = new Map(col.grid);
      /* A gate's four tubes round a 1.75 m opening, as scene.js builds
       * one, hung 40 degrees about y and 25 about z at (0, 3, -50). The
       * pose is a fixed quaternion here rather than the builder's. */
      const W = 1.7526;
      const R = 0.02;
      const sx = W / 2 + R;
      const local = [[-sx, 0, 0, -sx, W + 2 * R, 0], [sx, 0, 0, sx, W + 2 * R, 0], [-sx, R, 0, sx, R, 0], [-sx, W + R, 0, sx, W + R, 0]];
      const q = [0.07, 0.34, 0.2, 0.915];
      const ql = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      const [qx, qy, qz, qw] = q.map((v) => v / ql);
      const rot = (x, y, z) => {
        const tx = 2 * (qy * z - qz * y);
        const ty = 2 * (qz * x - qx * z);
        const tz = 2 * (qx * y - qy * x);
        return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
      };
      const capsAt = (b) => local.map(([ax, ay, az, bx, by, bz]) => {
        const a = rot(ax, ay, az);
        const e = rot(bx, by, bz);
        return { kind: 'gate', ax: b[0] + a[0], ay: b[1] + a[1], az: b[2] + a[2], bx: b[0] + e[0], by: b[1] + e[1], bz: b[2] + e[2], r: R };
      });
      col.setBuilt(capsAt([0, 3, -50]));
      sayState(s, 'one gate', col);
      sayViews(s, 'one gate', col);
      const up = rot(sx, 0.9, 0);
      const onUpright = [up[0], 3 + up[1], -50 + up[2]];
      const t = rot(0, 0, 1);
      const through = (c0) => [c0[0] - t[0] * 2, c0[1] - t[1] * 2, c0[2] - t[2] * 2, c0[0] + t[0] * 2, c0[1] + t[1] * 2, c0[2] + t[2] * 2];
      const centre = rot(0, W / 2 + R, 0);
      s.say('upright', hitOut(col, col.hit(...through(onUpright))));
      s.say('opening', hitOut(col, col.hit(...through([centre[0], 3 + centre[1], -50 + centre[2]]))));
      s.say('gaps', [col.gapAt(...onUpright, 1), col.gapAt(...onUpright, 1, true), col.gapAt(30, 5, -10, 1),
        col.gapAt(30, 5, -10, 1, false, 1 << KINDS.indexOf('tree')), col.gapAt(-35, 4, -55, 1, true, 1 << KINDS.indexOf('tree'))]);
      s.say('probes with a gate', answer());
      col.setBuilt(capsAt([20, 6, -80]));
      s.say('moved', [hitOut(col, col.hit(...through(onUpright))), hitOut(col, col.hit(...through([20 + up[0], 6 + up[1], -80 + up[2]])))]);
      col.setBuilt([]);
      s.say('deleted', [hitOut(col, col.hit(...through(onUpright))), col.count === col.baseCount]);
      s.say('cells kept', col.grid.size === cellsBefore.size && [...col.grid].every(([k, v]) => cellsBefore.get(k) === v));
      s.say('probes after', answer());
      const r = seeded(1002);
      col.setBuilt(capsAt([0, 3, -50]));
      sweep(s, 'gate world', col, r, { centre: [0, 3, -40], spread: 40, movingH: [] }, LIGHT);
      const pyl = new Colliders();
      pyl.addPost('tree', 300, -10, 0, 12, 0.4);
      pyl.build();
      const caps = [];
      for (let k = 0; k < 4; k += 1) {
        caps.push({ kind: 'pylon', ax: 3, ay: k * 2, az: -60, bx: 3, by: (k + 1) * 2, bz: -60, r: 0.5 });
      }
      caps.push({ kind: 'banner', ax: 2.52, ay: 0, az: 0, bx: 2.52, by: 5, bz: 0, r: 0.024 });
      pyl.setBuilt(caps);
      s.say('pylon', hitOut(pyl, pyl.hit(3, 3, -50, 3, 3, -70)));
      s.say('banner', hitOut(pyl, pyl.hit(2.52, 2, 2, 2.52, 2, -2)));
      sweep(s, 'pylons', pyl, r, { centre: [3, 3, -30], spread: 32, movingH: [] }, LIGHT);
    },
  });
  cases.push({
    id: 'real-grid-check',
    run(s) {
      seat();
      const wall = (c, x0, z0 = 0) => c.addBox('wall', x0, 0, z0 - 5, x0 + 0.5, 10, z0 + 5);
      const through = (c, x0, z0 = 0) => hitOut(c, c.hit(x0 - 5, 5, z0, x0 + 5, 5, z0));
      const c = new Colliders();
      wall(c, 6000);
      wall(c, -6000, -6000);
      c.addBox('wall', -1500, 0, 9530, -1490, 10, 9540);
      c.build();
      s.say('reach', [through(c, 6000), through(c, -6000, -6000), hitOut(c, c.hit(-1500, 5, 9535, -1490, 5, 9535))]);
      const d = new Colliders();
      d.addPost('tree', 0, 0, 0, 12, 0.4);
      wall(d, -50);
      d.build();
      let fill = d.streamFill();
      wall(fill, 100);
      s.say('one step', fill.step());
      s.say('streamed', [through(d, 100), d.gapAt(99, 5, 0, 2), d.axisAt(99, 5, 0, 2), AXIS.map((f) => d[f]),
        d.crossedStatic(d.hitIndex, 95, 5, 0, 105, 5, 0)]);
      m.setCraftParts(hullOf(HAND_HULLS['grid-check-wing']));
      s.say('parts', through(d, 100));
      m.setCraftParts(null);
      s.say('static', [hitOut(d, d.hit(-5, 5, 0, 5, 5, 0)), through(d, -50), d.stats()]);
      d.setBuilt([{ kind: 'gate', ax: 300, ay: 0, az: -2, bx: 300, by: 3, bz: -2, r: 0.05 }]);
      const gateHit = () => hitOut(d, d.hit(295, 1.5, -2, 305, 1.5, -2));
      const gate = gateHit();
      s.say('gate', [gate, d.gapAt(99, 5, 0, 2, true)]);
      d.pass[gate[1]] = 1;
      fill = d.streamFill();
      wall(fill, 200);
      for (let j = 0; j < 30000; j += 1) {
        fill.addPost('tree', 400 + (j % 200) * 2, -400 + Math.floor(j / 200) * 2, 0, 8, 0.3);
      }
      const steps = [];
      for (;;) {
        const done = fill.step();
        steps.push([done, through(d, 100)[0], through(d, 200)[0]]);
        if (done) {
          break;
        }
      }
      s.say('refill steps', steps);
      s.say('after', [through(d, 100), through(d, 200), d.gapAt(99, 5, 0, 2), d.axisAt(99, 5, 0, 0.5), gateHit(), d.baseCount, d.streamGen,
        Array.from(d.pass.subarray(d.staticCount)).every((v) => v === 0)]);
      s.call('late add', () => wall(fill, 500));
      s.call('late step', () => fill.step());
      const a = d.streamFill();
      wall(a, 700);
      const b = d.streamFill();
      wall(b, 800);
      s.call('stale', () => a.step());
      s.say('newer', [b.step(), through(d, 800), through(d, 700), through(d, 200)]);
      const same = d.streamFill();
      wall(same, 800);
      d.pass[d.staticCount] = 1;
      s.say('same wall', [through(d, 800), same.step(), through(d, 800), d.pass[d.staticCount]]);
      const empty = d.streamFill();
      s.say('empty', [empty.step(), d.stats(), through(d, 800), gateHit()]);
      const r = seeded(1003);
      sweep(s, 'reach', c, r, { centre: [0, 5, 0], spread: 6000, movingH: [] }, { ...LIGHT, hit: 10 });
      sweep(s, 'stream', d, r, { centre: [150, 5, -100], spread: 250, movingH: [] }, LIGHT);
    },
  });
  cases.push({
    id: 'real-turned-box-check',
    run(s) {
      seat();
      const phi = (37 * Math.PI) / 180;
      const c = new Colliders();
      c.addTurnedBox('wall', Math.cos(phi), Math.sin(phi), 1900, 2020, 0, 10, -0.3, 0.3);
      c.build();
      sayViews(s, 'long', c);
      const ux = c.fux[0];
      const uz = c.fuz[0];
      for (let u = 1901; u < 2020; u += 7) {
        const x = u * ux;
        const z = u * uz;
        s.say(`across at ${u}`, hitOut(c, c.hit(x + 3 * uz, 5, z - 3 * ux, x - 3 * uz, 5, z + 3 * ux)));
      }
      const A = new Colliders();
      A.addBox('wall', -3.25, 1, 7.5, 12.75, 4, 9.125);
      A.build();
      const B = new Colliders();
      B.addTurnedBox('wall', 1, 0, -3.25, 12.75, 1, 4, 7.5, 9.125);
      B.build();
      sayViews(s, 'square A', A);
      sayViews(s, 'square B', B);
      const r = seeded(1004);
      const w = { centre: [4.75, 2.5, 8.3], spread: 10, movingH: [] };
      /* The same draws against A and B: a turned box square to the world
       * answers as the box does. */
      for (let k = 0; k < 40; k += 1) {
        const [p, q] = travel(A, r, w);
        const att = attitude(r);
        const outs = [A, B].map((col) => {
          const kind = col.hit(...p, ...q, undefined, ...att, 0.01);
          return [hitOut(col, kind), col.gapAt(...p, 50), col.axisAt(...p, 50), AXIS.map((f) => col[f]), col.interiorAt(0, ...p),
            col.crossedStatic(0, ...p, ...q)];
        });
        s.say(`square${k}`, [p, q, att, outs]);
      }
      m.setCraftParts(hullOf(HAND_HULLS['turned-box-wing']));
      for (let k = 0; k < 30; k += 1) {
        const [p, q] = travel(B, r, w);
        s.say(`square wing${k}`, [p, q, hitOut(A, A.hit(...p, ...q)), hitOut(B, B.hit(...p, ...q))]);
      }
      m.setCraftParts(null);
      for (let n = 0; n < 40; n += 1) {
        const ux2 = r.range(-1, 1);
        const uz2 = r.range(-1, 1);
        const C = new Colliders();
        C.addTurnedBox('wall', ux2, uz2, r.range(-50, 0), r.range(0, 50), r.range(-2, 2), r.range(2, 9), r.range(-30, 0), r.range(0, 30));
        C.build();
        s.say(`turned${n} frame`, VIEWS.map((v) => C[v][0]));
        const few = { hit: 6, gap: 3, axis: 3, inside: 3, cross: 3, box: 3, atp: 0 };
        sweep(s, `turned${n}`, C, r, { centre: [0, 3, 0], spread: 40, movingH: [] }, few);
      }
    },
  });
  /* buildWorld's worlds, as wall-check, orbit-check and path-check lay
   * them out, with flights round each. */
  const FACE_X = 30;
  const T = { x: 96, z: 160, half: 1.5, leg: 0.16, h: 34, ground: 0.45 };
  const mast = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      mast.push({
        kind: 'box', material: 'wall', x0: T.x + sx * T.half - T.leg, y0: T.ground, z0: T.z + sz * T.half - T.leg,
        x1: T.x + sx * T.half + T.leg, y1: T.ground + T.h, z1: T.z + sz * T.half + T.leg,
      });
    }
  }
  const rigs = {
    wall: {
      parts: [{ kind: 'box', material: 'wall', x0: FACE_X, y0: 0, z0: -6, x1: FACE_X + 1.5, y1: 8, z1: 6 }],
      centre: [FACE_X, 3.2, 0],
      spread: 8,
    },
    mast: { parts: mast, centre: [T.x, 10, T.z], spread: 6 },
    rail: {
      parts: [{ kind: 'capsule', material: 'obstacle', ax: -5, ay: 6.3, az: 0, bx: 5, by: 6.3, bz: 0, r: 0.12 },
        { kind: 'box', material: 'wall', x0: 40 - 0.16, y0: 0, z0: -0.16, x1: 40 + 0.16, y1: 12, z1: 0.16 }],
      centre: [20, 5, 0], spread: 25,
    },
  };
  for (const [name, rig] of Object.entries(rigs)) {
    cases.push({
      id: `real-flightrig-${name}`,
      run(s) {
        seat();
        const { colliders: c } = buildWorld(rig.parts, null, 0);
        sayState(s, 'built', c);
        sayViews(s, 'built', c);
        const r = seeded(1100 + name.length);
        sweep(s, name, c, r, { centre: rig.centre, spread: rig.spread, movingH: [] }, FULL);
        if (name === 'wall') {
          /* wall-check's taps: along +x at 3 m/s steps of 1 ms, four yaws. */
          for (const [yaw, q] of [[0, [0, 0, 0, 1]], [90, [0, H, 0, H]], [180, [0, 1, 0, 0]], [270, [0, -H, 0, H]]]) {
            for (let x = FACE_X - 0.3; x < FACE_X + 0.05; x += 0.012) {
              const kind = c.hit(x, 3.2, 0, x + 0.003, 3.2, 0, m.craftVerticalHalf(0.1), ...q, m.craftVerticalOffset());
              s.say(`tap ${yaw} ${x}`, hitOut(c, kind));
            }
          }
        }
      },
    });
  }
  /* src/render/library/roofs.js standing a building's walls under its roofs,
   * as the village, the lift and swiss2's props do, into a Colliders that
   * carries swiss2's noteFootprint expando. */
  cases.push({
    id: 'real-roof-walls',
    run(s) {
      seat();
      const c = new Colliders();
      const noted = [];
      c.noteFootprint = (...a) => noted.push(a);
      const roofs = [
        recordAt({ top: gableTop(4.2, 2.6, 4.4, -6, 6), dy: 0.3, hw: 4, hd: 6 }, 'slate', 10.25, 3, -20.5, 0.6),
        recordAt({ top: flatTop(-3, -3, 3, 3, 0.2), dy: 0.25, hw: 3, hd: 3 }, 'tar', -14.5, 4, 8.25, 0),
        recordAt({ top: shedTop(-2, 2.4, 2, 1.6, -3, 3), dy: 0.2, hw: 2, hd: 3, open: true }, 'tin', 30, 2.5, 30, -1.2),
        recordAt({ top: pyramidTop(8, 2.5, 0, 6), dy: 0.4, hw: 2.5, hd: 2.5 }, 'slate', -40, 12, -40, 0.3),
      ];
      standWalls(c, [6, 0, -27, 15, 8, -14], [roofs[0]], 0.5, {
        parts: [{ e: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 3, -20, 1], box: [-0.4, 3.5, -0.4, 0.4, 6, 0.4], cover: false },
          { e: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 3, -20, 1], box: [-3, 0, -5, 3, 2.5, 5], cover: true }],
      });
      standWalls(c, [-18, 0, 5, -11, 6, 12], [roofs[1]], 0, { note: false });
      standWalls(c, [27, 0, 26, 33, 4, 34], [roofs[2]], 0, { edges: true });
      standWalls(c, [-43, 0, -43, -37, 18, -37], [roofs[3]], 1);
      standWalls(c, [50, 0, 50, 54, 5, 53], [], 0);
      s.say('noted', noted);
      s.say('roof solids', roofs.map((rc) => [rc.solids, rc.eaves]));
      c.build();
      sayState(s, 'built', c);
      sayViews(s, 'built', c);
      sweep(s, 'roofs', c, seeded(1201), { centre: [0, 4, -10], spread: 45, movingH: [] }, FULL);
    },
  });
  /* src/maps/interior/sink.js's solidBox: turned boxes round a room's
   * furniture, at headings off and on the world's axes. */
  cases.push({
    id: 'real-interior-solids',
    run(s) {
      seat();
      const c = new Colliders();
      const r = seeded(1301);
      const rets = [];
      for (let k = 0; k < 40; k += 1) {
        const [dx, dz] = k % 5 === 0 ? r.pick([[1, 0], [0, 1], [-1, 0], [0, -1]]) : (() => {
          const v = unitVec(r);
          const l = Math.sqrt(v[0] * v[0] + v[2] * v[2]);
          return [v[0] / l, v[2] / l];
        })();
        rets.push(solidBox(c, r.pick(['wall', 'obstacle', 'rock']), r.range(-12, 12), r.range(-12, 12), dx, dz,
          r.range(0.3, 4), r.range(0.3, 2), r.range(0, 1), r.range(1, 3)));
      }
      s.say('indices', rets);
      c.build();
      sayState(s, 'built', c);
      sayViews(s, 'built', c);
      sweep(s, 'room', c, r, { centre: [0, 1, 0], spread: 13, movingH: [] }, FULL);
      m.setCraftParts(hullOf(HULL_TABLES.zagi1219));
      sweep(s, 'room wing', c, r, { centre: [0, 1, 0], spread: 13, movingH: [] }, { ...LIGHT, gap: 0, axis: 0 });
      m.setCraftParts(null);
    },
  });
  return cases;
}

/*
 * The Itaipu dam adds its gate capsules, then writes their posed ends
 * straight into the construction columns before build (dam/index.js,
 * poseBuilt), and widens their footprints with sweep. A rewrite that kept
 * those columns private broke the map's load, which nothing above saw.
 */
function endpointWriteCases() {
  return [{
    id: 'prebuild-endpoint-writes',
    run(s) {
      seat();
      const r = seeded(4242);
      const c = new m.Colliders();
      const ids = [];
      for (let i = 0; i < 12; i += 1) {
        const x = r.range(-20, 20);
        const z = r.range(-20, 20);
        c.add(i % 3 === 0 ? 'wire' : 'pole', x, 0, z, x, r.range(1, 6), z, r.range(0.05, 0.4));
        ids.push(i);
      }
      s.say('columns before', [c.ax.length, c.ay.length, c.az.length, c.bx.length, c.by.length, c.bz.length]);
      for (const i of ids.filter((_, k) => k % 2 === 0)) {
        const a = [r.range(-20, 20), r.range(0, 3), r.range(-20, 20)];
        const b = [a[0] + r.range(-4, 4), a[1] + r.range(0.5, 4), a[2] + r.range(-4, 4)];
        c.ax[i] = a[0];
        c.ay[i] = a[1];
        c.az[i] = a[2];
        c.bx[i] = b[0];
        c.by[i] = b[1];
        c.bz[i] = b[2];
        c.sweep(i, Math.min(a[0], b[0]) - 1, Math.min(a[2], b[2]) - 1, Math.max(a[0], b[0]) + 1, Math.max(a[2], b[2]) + 1);
      }
      c.build();
      sayState(s, 'built', c);
      sayViews(s, 'built', c);
      for (let k = 0; k < 400; k += 1) {
        const p = [r.range(-25, 25), r.range(-1, 8), r.range(-25, 25)];
        const q = [p[0] + r.range(-6, 6), p[1] + r.range(-3, 3), p[2] + r.range(-6, 6)];
        hitCall(s, `hit ${k}`, c, r, k, p, q);
        const axis = c.axisAt(...p, 3)
          ? [c.axisGap, c.axisDx, c.axisDy, c.axisDz, c.axisCx, c.axisCy, c.axisCz]
          : null;
        s.say(`gap ${k}`, [c.gapAt(...p, 3), axis]);
      }
    },
  }];
}

/* ------------------------------------------------------------------ the list */

const cases = [
  {
    /* First, because it is the only one about the state the module loads
     * in: no case before it may have seated an airframe. */
    id: 'initial-bindings',
    run(s) {
      s.say('bindings', bindings());
      s.say('craftParts', m.craftParts());
      s.say('derived', [m.craftVerticalHalf(0), m.craftVerticalHalf(1), m.craftVerticalOffset(), m.dirtClearance(), m.turtleClearance(),
        m.turtleLift()]);
      m.setCraftAirframe(PLANT0);
      s.say('the five inch seated equals them', bindings());
    },
  },
  ...freeCases(),
  ...airframeCases(),
  ...prebuildCases(),
  ...endpointWriteCases(),
  ...errorCases(),
  ...tieCases(),
  ...streamCases(),
  ...edgeCases(),
  ...WORLDS.flatMap((w) => PHASES.map((ph) => worldCase(w, ph))),
  ...Object.entries(HULL_TABLES).map(([id, rows]) => partsCase(id, rows, null)),
  ...['sky1800', 'f16878', 'striker2500', 'timber1500f'].map((id) => partsCase(id, HULL_TABLES[id], 'dead')),
  partsCase('cub1400', HULL_TABLES.cub1400, 'none-left'),
  ...Object.entries(HAND_HULLS).map(([id, rows]) => partsCase(id, rows, null)),
  ...nxyzCases(),
  ...realCases(),
];

goldenMain('collide:golden', FIXTURE, cases);
