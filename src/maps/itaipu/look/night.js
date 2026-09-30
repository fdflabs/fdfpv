/*
 * night.js: the dam's own light pools for mission 4, "Night raid"
 * (docs/WARFARE-PLAN.md section 3: a second map is a second mission
 * file; this map's is its own preset, not a mission concern). Cheap
 * fixtures laid over Round 2's day geometry, never new geometry of
 * their own, and never touched for `time` 'day' (look/index.js's gate).
 *
 * WHAT LIGHTS, AND WHY IT COSTS NEXT TO NOTHING. Section 13's budget is
 * draw calls and triangles, and every fixture here adds at most one:
 *
 *   the dam's crest and rockfill ramp lamps are already one instanced
 *   mesh (dam/index.js's own LAMP, drawn as itaipu-dam-lamps: the
 *   lampsAlong calls for the main dam's crest, its side dams' crests and
 *   the embankment share it). Read back by name and its own material
 *   tinted emissive, whatever its instance count: no new mesh, no dam
 *   file touched;
 *
 *   the town's road lamps are model.js's own lampPieces, already walked
 *   there for the streamed colliders. town.lampsAt (model.js, a minimal
 *   additive field next to the array that was already built) is this
 *   file's only look outside look/, and it draws them as one instanced
 *   mesh of small glowing heads;
 *
 *   the powerhouse and the intake gates: a few of the war mode's own
 *   target positions (map.targets, dam/index.js), never dam geometry;
 *
 *   windows: a sparse sample of the town's own building records
 *   (town.buildings, already returned for scripts/town-check.js), a
 *   scatter of small glowing points near their roofs.
 *
 * A FEW REAL LIGHTS, EVERYTHING ELSE EMISSIVE. Every fixture above gets
 * an unlit glow (cheap: no light budget, just a bright material), and
 * only a sparse, capped subset also gets a THREE.PointLight, so the
 * ground and the water genuinely lighten near a lamp rather than the
 * whole night being emissive paint. The reservoir's mirror is a real
 * planar reflection, re-rendered every frame it draws (water/index.js),
 * so it carries every one of these pools without anything changed there.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

/* The dam's own instanced lamp mesh (dam/index.js instanced(), 'lamps'):
 * read by name, never by importing that file. */
const DAM_LAMP_MESH = 'itaipu-dam-lamps';

/* Emissive colours read as radiance, not display colour (THREE.Color
 * held over 1 is a brighter light, not a clipped one, until the post
 * chain's exposure and AgX see it): high enough that swiss2/post.js's
 * bloom (threshold 6.0, tuned for the sun's disc) still catches a lamp
 * after the night's own dark meter key (light.js NIGHT_METER_KEY) has
 * turned everything else down. Without this a lamp is merely a slightly
 * lighter grey post, which is not "emitting light". */
const LAMP_EMISSIVE = new THREE.Color(9, 6.4, 3.1);
const LAMP_EMISSIVE_INTENSITY = 1;

const WINDOW_COLOR = new THREE.Color(8, 6.2, 3.6);
const POOL_COLOR = new THREE.Color(1.0, 0.72, 0.4);
const POWERHOUSE_COLOR = new THREE.Color(0.75, 0.85, 1.0);

/* Glow dots, world metres across: a lamp's head, a window's glow. A
 * sphere reads from every angle a craft can pass it at; a decal quad
 * would vanish edge on. */
const LAMP_DOT = 0.5;
const WINDOW_DOT = 1.1;

/* Real lights: one every LIGHT_EVERYth fixture in a run, capped at
 * MAX_LIGHTS a group, so a long crest road is still a few pools, not
 * one every post. Intensity is candela (decay 2, three's physical
 * default), lifted well over a naive room-light guess because the
 * night's own dark meter key (light.js) divides every light in the
 * scene by the same factor the ambient is: a pool has to outshine that
 * whole frame's exposure, not just the ambient it sits in. */
const LIGHT_EVERY = 5;
const MAX_LIGHTS = 16;
const POOL_INTENSITY = 2200;
const POOL_RANGE = 30;
const POWERHOUSE_INTENSITY = 6000;
const POWERHOUSE_RANGE = 50;

const m4 = new THREE.Matrix4();
const p3 = new THREE.Vector3();
const q4 = new THREE.Quaternion();
const s3 = new THREE.Vector3(1, 1, 1);

function glowGeometry(size) {
  return new THREE.SphereGeometry(size / 2, 8, 5);
}

/* One InstancedMesh of `points` ([x, y, z]...) glow dots, one draw call
 * however many. Unlit (MeshBasicMaterial, toneMapped false): a fixture's
 * own colour, not lit by the scene's near-black night. */
function glowMesh(points, size, color, name) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const mesh = new THREE.InstancedMesh(glowGeometry(size), mat, Math.max(points.length, 1));
  mesh.name = name;
  mesh.count = points.length;
  points.forEach((p, i) => {
    m4.compose(p3.set(p[0], p[1], p[2]), q4.identity(), s3);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  /* The instances are spread the length of the crest or the town; the
   * geometry's own bounding sphere is a fixture's, so culling on it
   * would drop every one but the first few. */
  mesh.frustumCulled = false;
  return mesh;
}

/* A sparse THREE.PointLight per LIGHT_EVERYth point (never more than
 * MAX_LIGHTS a run): the pools that actually light the ground and the
 * water, `into` the night group. */
function poolLights(points, into, {
  color = POOL_COLOR, intensity = POOL_INTENSITY, range = POOL_RANGE, lift = 0.6,
} = {}) {
  if (!points.length) {
    return [];
  }
  const step = Math.max(LIGHT_EVERY, Math.ceil(points.length / MAX_LIGHTS));
  const lights = [];
  for (let i = 0; i < points.length; i += step) {
    const [x, y, z] = points[i];
    const light = new THREE.PointLight(color, intensity, range, 2);
    light.position.set(x, y + lift, z);
    into.add(light);
    lights.push(light);
  }
  return lights;
}

/* Every instance's world position out of an InstancedMesh: the dam's own
 * lamps, through three's own public API, not dam/index.js's private
 * `lamps` array. */
function instancePositions(mesh) {
  const out = [];
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    v.setFromMatrixPosition(m);
    out.push([v.x, v.y, v.z]);
  }
  return out;
}

/*
 * The night's fixtures, once every part is built and added to `scene`.
 * `lampsAt` is town.lampsAt (model.js); `windowsAt` a scatter of small
 * points near a sample of buildings; `powerhouseAt` a few [x, y, z] off
 * the dam's own war targets (map.targets: the intake gates and the
 * penstocks, which stand over the powerhouse). Returns { group,
 * dispose() }; `group` is already added to `scene`.
 */
export function dressNight({
  scene, lampsAt = [], windowsAt = [], powerhouseAt = [],
}) {
  const group = new THREE.Group();
  group.name = 'itaipu-night';

  const damLamps = scene.getObjectByName(DAM_LAMP_MESH);
  if (damLamps) {
    damLamps.material.emissive = LAMP_EMISSIVE.clone();
    damLamps.material.emissiveIntensity = LAMP_EMISSIVE_INTENSITY;
  }
  const damLampPoints = damLamps ? instancePositions(damLamps) : [];

  const glows = [];
  const addGlow = (points, size, color, name) => {
    if (!points.length) {
      return;
    }
    const mesh = glowMesh(points, size, color, name);
    group.add(mesh);
    glows.push(mesh);
  };
  addGlow(lampsAt, LAMP_DOT, LAMP_EMISSIVE, 'itaipu-night-town-lamps');
  addGlow(windowsAt, WINDOW_DOT, WINDOW_COLOR, 'itaipu-night-windows');

  poolLights(damLampPoints, group);
  poolLights(lampsAt, group);
  poolLights(powerhouseAt, group, {
    color: POWERHOUSE_COLOR, intensity: POWERHOUSE_INTENSITY, range: POWERHOUSE_RANGE, lift: 4,
  });

  scene.add(group);

  return {
    group,
    dispose() {
      if (damLamps) {
        damLamps.material.emissiveIntensity = 0;
      }
      for (const m of glows) {
        m.geometry.dispose();
        m.material.dispose();
      }
      /* The lights have nothing to free; the scene graph's own dispose
       * (disposeSceneGraph, called on the map's scene) removes them
       * along with everything else once this group is in it. */
      group.clear();
    },
  };
}
