/*
 * acecrown.js: the crown changing hands in Catch the Ace! (¡Atrapa al As!).
 *
 * The owner: "there should be a very visual thing...almost gamelike". When
 * the crown moves, on every screen: a gold burst of sparks and a ring
 * shockwave where the new Ace took it, and a small crown that flies over
 * about 0.6 s from where the old Ace was (or the free orb, for a catch)
 * to the new Ace, following it as it flies, and pops there. The coin that
 * rings with it is src/render/audio.js coin(); the bubble's own pulse is
 * src/render/acebubble.js, set by the shell.
 *
 * CHEAP. One burst at a time (a new crown before the last has faded starts
 * it again): three meshes made once, a Points of SPARKS sparks, a ring and
 * a crown, additive or unlit, no shadows, no allocation per frame. Every
 * pose is a function of the burst's age and nothing random, so a replay
 * that throws it again at the same age draws the same picture: the crash
 * cam records play() (src/replay/crashcam.js tapCrown) and the replay
 * plays it back on the clip's clock (src/replay/paperscene.js).
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

import * as THREE from 'three';

/* The crown's gold, the bubble's (src/render/acebubble.js). */
export const CROWN_GOLD = 0xffc64a;
/* How long a burst lasts, seconds: past this nothing of it is drawn. */
export const CROWN_FX_S = 1.1;

const SPARKS = 48;
const SPARK_S = 0.9;
const SPARK_MPS = 16;
const SPARK_G = 9;
/* The ring: out to RING_M over RING_S. */
const RING_S = 0.55;
const RING_M = 14;
/* The flight: FLY_S from old to new, an arc FLY_ARC_M high, then a pop. */
const FLY_S = 0.6;
const FLY_ARC_M = 3;
const POP_S = 0.3;
/* The crown rides this far over the aircraft's centre. */
const CROWN_UP_M = 1.6;
/* Its size, metres, and never under this share of its distance from the
 * eye, so it still reads from across the field. */
const CROWN_M = 1.2;
const CROWN_MIN_OF_DIST = 0.035;

/*
 * A crown: an open band whose top edge rises to five points. One
 * cylinder, its top ring's vertices raised and lowered in turn.
 */
export function crownGeometry() {
  const segs = 10;
  const g = new THREE.CylinderGeometry(0.5, 0.42, 0.42, segs, 1, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) {
      const j = i % (segs + 1);
      pos.setY(i, pos.getY(i) + (j % 2 === 0 ? 0.34 : -0.04));
    }
  }
  g.computeVertexNormals();
  return g;
}

export function crownMaterial() {
  return new THREE.MeshBasicMaterial({ color: CROWN_GOLD, side: THREE.DoubleSide, transparent: true });
}

/* Ease out, cubic. */
function out3(u) {
  return 1 - (1 - u) ** 3;
}

export function createCrownFx() {
  const group = new THREE.Group();
  group.name = 'ace-crown-fx';

  /* The sparks: SPARKS directions on a golden spiral over the sphere,
   * each at its own share of the speed, all fixed. */
  const dirs = new Float32Array(SPARKS * 3);
  const speed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / SPARKS;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    dirs[i * 3] = Math.cos(a) * r;
    dirs[i * 3 + 1] = y * 0.7 + 0.3;
    dirs[i * 3 + 2] = Math.sin(a) * r;
    speed[i] = SPARK_MPS * (0.55 + 0.45 * ((i * 7) % 11) / 10);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffe08a, size: 0.55, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.name = 'ace-crown-sparks';
  sparks.frustumCulled = false;

  const ringMat = new THREE.MeshBasicMaterial({
    color: CROWN_GOLD, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), ringMat);
  ring.name = 'ace-crown-ring';

  const crownMat = crownMaterial();
  const crown = new THREE.Mesh(crownGeometry(), crownMat);
  crown.name = 'ace-crown-flight';

  for (const o of [sparks, ring, crown]) {
    o.castShadow = false;
    o.receiveShadow = false;
    o.visible = false;
    o.renderOrder = 11;
    group.add(o);
  }

  /* The burst playing: where it was taken (p), where the crown flies from
   * (a, or null to rise from p), how big (level), and its age. */
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  let fromA = false;
  let level = 1;
  let age = Infinity;
  const stats = { plays: 0, drawn: 0 };
  const eye = new THREE.Vector3();
  const to = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /* A crown taken at `at` ([x, y, z], world), flown from `from` ([x, y,
   * z] or null), `lvl` 0 to 1 big, `ageS` seconds ago (0 now). */
  function play(at, from, lvl = 1, ageS = 0) {
    p.set(at[0], at[1], at[2]);
    fromA = Boolean(from);
    if (from) {
      a.set(from[0], from[1], from[2]);
    }
    level = Math.max(0.3, Math.min(1, lvl));
    age = ageS;
    stats.plays += 1;
  }

  function clear() {
    age = Infinity;
    for (const o of group.children) {
      o.visible = false;
    }
  }

  /*
   * A frame: dt seconds on (0 for a still frame), camera for the ring's
   * facing and the crown's least size, target the new Ace as drawn now
   * (a Vector3, or null to fly to p).
   */
  function frame(dt, camera, target) {
    age += dt;
    if (!(age < CROWN_FX_S)) {
      if (sparks.visible || ring.visible || crown.visible) {
        clear();
      }
      return;
    }
    stats.drawn += 1;
    camera.getWorldPosition(eye);

    /* The sparks fly out and fall, fading. */
    const ts = age;
    sparks.visible = ts < SPARK_S;
    if (sparks.visible) {
      const arr = sparkGeo.attributes.position.array;
      const k = level;
      for (let i = 0; i < SPARKS; i += 1) {
        const v = speed[i] * k;
        arr[i * 3] = p.x + dirs[i * 3] * v * ts;
        arr[i * 3 + 1] = p.y + dirs[i * 3 + 1] * v * ts - 0.5 * SPARK_G * ts * ts;
        arr[i * 3 + 2] = p.z + dirs[i * 3 + 2] * v * ts;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = 1 - ts / SPARK_S;
      sparkMat.size = 0.35 + 0.4 * k;
    }

    /* The ring, facing the eye, out and gone. */
    ring.visible = age < RING_S;
    if (ring.visible) {
      const u = age / RING_S;
      ring.position.copy(p);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(0.5 + RING_M * level * out3(u));
      ringMat.opacity = (1 - u) * (1 - u);
    }

    /* The crown, from the old Ace (or up from p) to the new one. */
    to.copy(target || p);
    to.y += CROWN_UP_M;
    const u = Math.min(1, age / FLY_S);
    const e = out3(u);
    if (fromA) {
      tmp.copy(a);
      tmp.y += CROWN_UP_M;
    } else {
      tmp.copy(to);
      tmp.y += FLY_ARC_M;
    }
    crown.position.lerpVectors(tmp, to, e);
    crown.position.y += FLY_ARC_M * Math.sin(Math.PI * u) * (fromA ? 1 : 0);
    crown.rotation.set(0, age * 9, 0);
    const pop = age > FLY_S ? (age - FLY_S) / POP_S : 0;
    const size = Math.max(CROWN_M, crown.position.distanceTo(eye) * CROWN_MIN_OF_DIST);
    crown.scale.setScalar(size * (1 + 0.6 * Math.sin(Math.PI * Math.min(1, pop))));
    crownMat.opacity = pop < 1 ? 1 : 0;
    crown.visible = pop < 1;
  }

  function dispose() {
    group.removeFromParent();
    sparkGeo.dispose();
    sparkMat.dispose();
    ring.geometry.dispose();
    ringMat.dispose();
    crown.geometry.dispose();
    crownMat.dispose();
  }

  return {
    group,
    play,
    frame,
    clear,
    dispose,
    /* Whether a burst is being drawn now. */
    active: () => age < CROWN_FX_S,
    /* For the harness: bursts played, frames drawn, and what is showing. */
    stats: () => ({
      ...stats, sparks: sparks.visible, ring: ring.visible, crown: crown.visible, at: [p.x, p.y, p.z],
    }),
  };
}
