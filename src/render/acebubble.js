/*
 * acebubble.js: the Ace's bubble in Catch the Ace! (¡Atrapa al As!).
 *
 * A hunter any part of whose aircraft comes within BUBBLE_M of the Ace's
 * centre takes the crown (edge/rooms/tag.js, src/share/roomtag.js). This
 * draws that sphere on every screen, the Ace's own too: a light gold
 * ghost, the crown's colour, bright only at its rim (a fresnel edge) so it
 * hides neither the Ace inside it nor the view through it, breathing
 * slowly, and brighter as the nearest hunter closes in.
 *
 * One mesh, one additive material with no depth write, no fog and no
 * shadow either way: the cost is one transparent draw. The shell poses it
 * each frame with set(); the crash cam records what drawn() says it drew
 * (src/replay/peers.js) and a replay poses its own copy with the same
 * set() (src/replay/peerscene.js), so the past is drawn as it was.
 *
 * THE FREE ORB. While nobody is the Ace (it crashed: docs/TAG-PLAN.md
 * decision 14) the bubble stays where it went down with a small gold
 * crown bobbing and turning inside it, for anybody to catch. set() is
 * told so by seat 0, which no pilot has, so a replay's recorded row
 * draws the orb and its crown as the screen did, with no new column.
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
import { crownGeometry, crownMaterial } from './acecrown.js';

const GOLD = 0xffc64a;
/* The breath: its period, seconds, and how far it dips. */
const PULSE_S = 2.4;
const PULSE_DEPTH = 0.2;
/* The level with nobody near, of the full level a hunter at the edge
 * brings. A hunter starts to brighten it from twice the radius out. */
const REST = 0.4;
/* While the Ace is protected (PROTECT_MS after a crown) nobody can take
 * it, and the bubble says so by staying at half its level. */
const GUARDED = 0.5;
/* Of the colour: across the face, and at the rim at full level. Faint,
 * so a pilot flying inside it still sees the world. */
const FACE = 0.008;
const RIM = 0.3;
/* The wall fades out this near the eye, metres, so a camera crossing it
 * (a chase camera a few metres behind the Ace) sees no hard slab. */
const NEAR_FADE_M = [1, 5];
/* The free orb's crown: its size, metres, how far it bobs and how fast,
 * and how fast it turns, radians a second. */
const ORB_CROWN_M = 1.6;
const ORB_BOB_M = 0.5;
const ORB_BOB_S = 1.8;
const ORB_TURN = 0.9;

/*
 * The level for a bubble of radius r whose nearest hunter's centre is
 * nearM from the Ace's, at time tS seconds (the pulse's clock), guarded
 * or not. A hunter nearer than the radius is as bright as it gets.
 */
export function bubbleLevel(r, nearM, tS, guarded) {
  const close = Math.max(0, Math.min(1, (2 * r - nearM) / r));
  const pulse = 1 - PULSE_DEPTH * (0.5 + 0.5 * Math.sin((2 * Math.PI * tS) / PULSE_S));
  const level = (REST + (1 - REST) * close) * pulse;
  return guarded ? level * GUARDED : level;
}

export function createAceBubble() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColour: { value: new THREE.Color(GOLD) },
      uLevel: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      uniform vec3 uColour;
      uniform float uLevel;
      void main() {
        /* 0 facing the eye, 1 edge on: both faces, so from inside the
         * sphere the far wall has its own rim. */
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = f * f * f * f;
        float fade = smoothstep(${NEAR_FADE_M[0].toFixed(1)}, ${NEAR_FADE_M[1].toFixed(1)}, length(vV));
        gl_FragColor = vec4(uColour * (${FACE.toFixed(3)} + ${RIM.toFixed(3)} * rim) * uLevel * fade, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.name = 'ace-bubble';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* After the opaque world and the aircraft it holds. */
  mesh.renderOrder = 10;
  mesh.visible = false;
  /* The free orb's crown, a child of the sphere, so in its units. */
  const crown = new THREE.Mesh(crownGeometry(), crownMaterial());
  crown.name = 'ace-orb-crown';
  crown.castShadow = false;
  crown.receiveShadow = false;
  crown.visible = false;
  mesh.add(crown);
  /* What set() was last told: r is 0 when nothing is drawn. */
  const drawn = {
    r: 0, x: 0, y: 0, z: 0, level: 0, seat: 0,
  };

  /* Radius r (0 hides it) centred at (x, y, z), at `level`, round the Ace
   * in `seat`, or free with seat 0; tS seconds is the free crown's clock. */
  function set(r, x = 0, y = 0, z = 0, level = 0, seat = 0, tS = 0) {
    const on = r > 0;
    drawn.r = on ? r : 0;
    drawn.x = on ? x : 0;
    drawn.y = on ? y : 0;
    drawn.z = on ? z : 0;
    drawn.level = on ? level : 0;
    drawn.seat = on ? seat : 0;
    mesh.visible = on;
    crown.visible = on && seat === 0;
    if (!on) {
      return;
    }
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(r);
    material.uniforms.uLevel.value = level;
    if (crown.visible) {
      crown.position.set(0, (ORB_BOB_M * Math.sin((2 * Math.PI * tS) / ORB_BOB_S)) / r, 0);
      crown.rotation.set(0, ORB_TURN * tS, 0);
      crown.scale.setScalar(ORB_CROWN_M / r);
    }
  }

  function dispose() {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    material.dispose();
    crown.geometry.dispose();
    crown.material.dispose();
  }

  return {
    mesh,
    set,
    /* What this frame drew: { r, x, y, z, level, seat }, r 0 for nothing,
     * seat 0 for the free orb. */
    drawn: () => drawn,
    dispose,
  };
}
