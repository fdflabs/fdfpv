/*
 * hangarstage.js: the hangar's set and its camera, for src/render/carousel3d.js.
 *
 * The hangar (src/ui/hangar.js) is one plane on a lit floor in a dark
 * room, the way a racing game's garage stands a car on a turntable: a
 * cyclorama backdrop that falls from a faint horizon glow into black, a
 * glossy floor with a pool of light under the plane and the plane's
 * reflection in it, and a thin mint ring round it, the colour this product
 * paints a record in. Everything here is drawn in the picker's own scene
 * by the picker's renderer, so it costs no second context and no map.
 *
 * THE CAMERA MOVES TO WHAT IS BEING EDITED. Each region a pilot paints, and
 * the engine or motor on the Power tab, has a view: the wing from above,
 * the fuselage broadside, the tail from behind, the nose close. The rig
 * eases between them on critically damped springs, so a move is quick and
 * lands without a bounce, and the overview slowly turns the plane when the
 * pilot is only looking. A drag turns it by hand.
 *
 * Units are the picker's: a model is scaled to a footprint radius of one
 * and stands with its lowest point on the floor.
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

/*
 * THE VIEWS. yaw is the plane's turn on the turntable, radians, pi being
 * nose to the camera; elev the camera's height as an angle over the
 * floor; zoom a multiple of the overview's distance; at the point looked
 * at, in the model's own frame, as shares of its nose and tail (`along`,
 * -1 the nose and 1 the tail) and of its height (`up`). A region not
 * named here is looked at from the overview.
 */
const OVERVIEW = { yaw: null, elev: 0.36, zoom: 1, along: 0, up: 0.1 };
const VIEWS = {
  overview: OVERVIEW,
  wing: { yaw: Math.PI - 0.55, elev: 0.95, zoom: 0.92, along: -0.05, up: 0.2 },
  wing_trim: { yaw: Math.PI - 0.95, elev: 0.8, zoom: 0.82, along: 0, up: 0.2 },
  tips: { yaw: Math.PI - 0.95, elev: 0.8, zoom: 0.82, along: 0, up: 0.2 },
  trim: { yaw: Math.PI - 1.0, elev: 0.62, zoom: 0.9, along: 0.05, up: 0.1 },
  tape: { yaw: Math.PI - 0.3, elev: 0.5, zoom: 0.8, along: -0.1, up: 0.2 },
  fuselage: { yaw: Math.PI / 2, elev: 0.14, zoom: 0.8, along: 0, up: 0 },
  pod: { yaw: Math.PI / 2 + 0.25, elev: 0.2, zoom: 0.7, along: -0.35, up: 0 },
  stripe: { yaw: Math.PI / 2 + 0.12, elev: 0.12, zoom: 0.8, along: 0, up: 0 },
  swoop: { yaw: Math.PI / 2 + 0.12, elev: 0.1, zoom: 0.75, along: -0.2, up: -0.1 },
  tail: { yaw: 0.42, elev: 0.3, zoom: 0.62, along: 0.72, up: 0.15 },
  nose: { yaw: Math.PI - 0.5, elev: 0.18, zoom: 0.55, along: -0.72, up: 0 },
  canopy: { yaw: Math.PI - 0.7, elev: 0.3, zoom: 0.58, along: -0.35, up: 0.2 },
  fuse_trim: { yaw: Math.PI - 0.6, elev: 0.2, zoom: 0.62, along: -0.6, up: 0 },
  floats: { yaw: Math.PI / 2 + 0.35, elev: 0.06, zoom: 0.82, along: 0, up: -0.45 },
  airframe: OVERVIEW,
};

export function viewFor(focus) {
  return VIEWS[focus] ?? OVERVIEW;
}

/* The overview's turn, radians a second: once round in about twenty. */
const IDLE_TURN = (2 * Math.PI) / 20;
/* The springs' natural frequency, radians a second: a move settles in about
 * half a second. */
const OMEGA = 7.5;
/* How long a drag keeps the plane where the hand left it before the view
 * takes it back, seconds. */
const HAND_HOLD = 4;

function wrap(a) {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) {
    x -= 2 * Math.PI;
  } else if (x < -Math.PI) {
    x += 2 * Math.PI;
  }
  return x;
}

/* One critically damped spring toward `to`, stepped by dt. */
function spring(s, to, dt, omega = OMEGA) {
  const x = s.x - to;
  const a = -omega * omega * x - 2 * omega * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

/*
 * The rig: the plane's yaw, the camera's elevation, distance and aim, each
 * on a spring, and two one shot animations, the reveal when the hangar
 * opens and the pulse when a scheme goes on. update() is called once a
 * frame with the view the hangar asks for.
 */
export function createHangarRig() {
  const yaw = { x: Math.PI - 0.62, v: 0 };
  const elev = { x: OVERVIEW.elev, v: 0 };
  const zoom = { x: 1, v: 0 };
  const along = { x: 0, v: 0 };
  const up = { x: 0, v: 0 };
  const pop = { x: 1, v: 0 };
  let handT = 0;
  let revealSeq = -1;
  let revealT = 1;
  let pulseSeq = -1;
  let pulseT = 1;

  function update(dt, h, turn) {
    if (h.reveal !== revealSeq) {
      revealSeq = h.reveal;
      revealT = 0;
      yaw.x = Math.PI - 0.62 - 0.9;
      yaw.v = 0;
      zoom.x = 1.35;
      zoom.v = 0;
      elev.x = 0.2;
      elev.v = 0;
    }
    if (h.pulse !== pulseSeq) {
      if (pulseSeq !== -1) {
        pulseT = 0;
        pop.v += 1.6;
      }
      pulseSeq = h.pulse;
    }
    revealT = Math.min(1, revealT + dt / 0.9);
    pulseT = Math.min(1, pulseT + dt / 0.8);

    const v = viewFor(h.focus);
    if (turn) {
      yaw.x += turn;
      handT = HAND_HOLD;
    }
    handT = Math.max(0, handT - dt);
    if (h.hold) {
      handT = HAND_HOLD;
    }
    if (handT > 0) {
      yaw.v = 0;
    } else if (v.yaw === null) {
      yaw.x += IDLE_TURN * dt;
      yaw.v = 0;
    } else {
      yaw.x = v.yaw + wrap(yaw.x - v.yaw);
      spring(yaw, v.yaw, dt);
    }
    spring(elev, v.elev, dt);
    spring(zoom, v.zoom, dt);
    spring(along, v.along, dt);
    spring(up, v.up, dt);
    /* The pop is a touch under damped on purpose: a scheme going on is a
     * small event and it should land with a little bounce. */
    const x = pop.x - 1;
    pop.v += (-90 * x - 2 * 0.45 * Math.sqrt(90) * pop.v) * dt;
    pop.x += pop.v * dt;
    return {
      yaw: yaw.x,
      elev: elev.x,
      zoom: zoom.x,
      along: along.x,
      up: up.x,
      pop: pop.x,
      reveal: 1 - (1 - revealT) ** 3,
      pulse: pulseT,
    };
  }
  return { update };
}

const BACKDROP_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/* The cyclorama: a faint warm horizon under a black roof, and the room's
 * ribs as the lightest of vertical bands. Linear light. */
/* The cyclorama: black overhead, falling to the floor's own far colour at
 * the horizon so the two meet without a line, and a warm glow low behind
 * the plane. Linear light. */
const BACKDROP_FRAG = `
uniform float uReveal;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 roof = vec3(0.0010, 0.0013, 0.0012);
  vec3 horizon = vec3(0.0034, 0.0036, 0.0035);
  vec3 col = mix(horizon, roof, smoothstep(0.0, 0.45, y));
  float az = atan(d.x, -d.z);
  float glow = exp(-az * az * 1.4) * exp(-y * y * 14.0);
  col += vec3(0.010, 0.0088, 0.007) * glow;
  gl_FragColor = vec4(col * uReveal, 1.0);
}`;

const FLOOR_VERT = `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/* The floor: a pool of warm light under the plane over a dark gloss, a few
 * turntable grooves close in, and alpha that lets the reflection drawn
 * under it show near the plane and fades it out further away. */
const FLOOR_FRAG = `
uniform float uReveal;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  vec3 far = vec3(0.0034, 0.0036, 0.0035);
  vec3 near = vec3(0.0070, 0.0075, 0.0072);
  vec3 col = mix(near, far, smoothstep(0.8, 6.0, r));
  float pool = exp(-r * r * 0.7) * uReveal;
  col += vec3(0.060, 0.055, 0.046) * pool;
  float groove = (1.0 - smoothstep(0.0, 0.02, abs(fract(r * 2.5) - 0.5) - 0.47)) * (1.0 - smoothstep(1.2, 2.6, r));
  col += vec3(0.0035) * groove;
  float alpha = mix(0.86, 1.0, smoothstep(0.4, 2.4, r));
  /* A dither of well under a step of the screen's eight bits, so the
   * dark gradient does not band into rings. */
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.0009;
  gl_FragColor = vec4(col, alpha);
}`;

export function buildHangarEnv() {
  const group = new THREE.Group();
  group.name = 'hangar-set';
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 1 } },
    vertexShader: BACKDROP_VERT,
    fragmentShader: BACKDROP_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), backdropMat);
  backdrop.renderOrder = -2;
  backdrop.frustumCulled = false;

  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 1 } },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    transparent: true,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -1;

  /* The turntable's ring and the pulse that runs out from it. Additive, so
   * they light the floor rather than paint over it. */
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x7dffb4, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.16, 1.18, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  const pulseMat = ringMat.clone();
  pulseMat.opacity = 0;
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 96), pulseMat);
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.003;

  const floorSet = new THREE.Group();
  floorSet.add(floor, ring, pulse);
  group.add(backdrop, floorSet);
  group.visible = false;

  return {
    group,
    backdrop,
    floorSet,
    /* Where the floor is, in the scene, and how far the set has come up. */
    place(floorY, reveal, pulseT) {
      floorSet.position.y = floorY;
      backdropMat.uniforms.uReveal.value = 0.25 + 0.75 * reveal;
      floorMat.uniforms.uReveal.value = reveal;
      ringMat.opacity = 0.22 * reveal;
      const s = 1.18 + 1.6 * pulseT;
      pulse.scale.set(s, s, 1);
      pulseMat.opacity = pulseT < 1 ? 0.55 * (1 - pulseT) ** 2 : 0;
    },
  };
}
