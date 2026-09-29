/*
 * sky.js: swiss2's photographed sky over Itaipu, turned to Itaipu's sun.
 *
 * The sky is swiss2's (assets/swiss2/sky_back.jpg and sky_env.hdr, CC0),
 * the only photographed sky in the tree. Its sun stands at SUN_U round
 * the equirect; Itaipu's is due east (light.js). So the backdrop and the
 * environment are both turned about the vertical by the difference, the
 * backdrop in its shader and the environment by rolling the HDR's
 * columns before it is prefiltered, so the bright side of the sky that
 * lights the ground is the side the sun is on.
 *
 * THE SUN'S HEIGHT. The photograph's sun is 37.8 degrees up and Itaipu's
 * 65.8, which a turn cannot mend (round 0 recorded the glow sitting under
 * the sun). So the sky on the sun's side is also stretched up: a
 * direction `e` degrees over the horizon reads the photograph at
 * photoElev(e), a smooth curve with photoElev(65.8) = 37.8 that leaves
 * the horizon and the zenith where they are, and the stretch fades out
 * round the sky away from the sun (sunSide), so the sky most views look
 * into keeps the photograph's clouds where they were. Both the backdrop
 * and the environment take the same curve, the environment by resampling
 * each column before it is prefiltered, so the glow the ground is lit
 * from is round the sun that casts its shadows.
 *
 * THE HORIZON. The post chain's air (swiss2/post.js AIR_GLSL) veils
 * everything that has a depth, and the far plateau goes to the air's own
 * colour; the backdrop has no depth, so it kept the photograph's grey
 * under a pale horizon, a hard line in every view from the air. The
 * backdrop's lowest degrees are drawn toward that same air, so the far
 * ground fades into a sky of its own colour.
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
import { SKY_K, SKY_SPAN_DEG, SUN_U, SUN_ELEVATION_DEG } from '../../swiss2/assets.js';
import { SUN_COLOR } from '../../swiss2/light.js';
import { AIR } from '../../swiss2/post.js';

/* photoElev's slope at the horizon: the low sky drawn from a band half
 * as tall. */
const LOW_SLOPE = 0.5;
/* Degrees over the horizon the backdrop reaches the air's colour below,
 * and leaves it above. */
const AIR_BAND = [-1.5, 6];
/* The stretch's share by the cosine of a direction's bearing from the
 * sun's: whole toward the sun, none from a little past square to it. */
const SIDE = [-0.2, 0.8];

/*
 * The photograph's elevation for a direction `e` degrees up, as the
 * exponent of the curve e (a + (1 - a) (e / 90)^p): a at the horizon, and
 * p chosen so the photograph's sun lands at `sunElevDeg`. Below the
 * horizon the photograph is read as it is.
 */
function skyStretch(sunElevDeg) {
  const r = SUN_ELEVATION_DEG / sunElevDeg;
  const p = Math.log((r - LOW_SLOPE) / (1 - LOW_SLOPE)) / Math.log(sunElevDeg / 90);
  if (!(p > 0)) {
    throw new Error(`itaipu sky: no stretch puts the photograph's sun at ${sunElevDeg} degrees`);
  }
  return p;
}

function photoElev(e, p, side) {
  return e <= 0 ? e : e * (1 - side + side * (LOW_SLOPE + (1 - LOW_SLOPE) * (e / 90) ** p));
}

function sunSide(cosBearing) {
  return THREE.MathUtils.smoothstep(cosBearing, SIDE[0], SIDE[1]);
}

/* How far round the equirect to read so the photograph's sun lands on
 * `sunDir`, in u. */
export function skyTurn(sunDir) {
  return (SUN_U - 0.5) - Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI);
}

/* Roll an equirect DataTexture's columns by `turn` of its width, in
 * place: texel u afterwards is texel u + turn before. */
export function turnEquirect(tex, turn) {
  const { width, height, data } = tex.image;
  const ch = data.length / (width * height);
  const s = ((Math.round(turn * width) % width) + width) % width;
  if (!s) {
    return;
  }
  const row = new data.constructor(width * ch);
  for (let y = 0; y < height; y += 1) {
    const at = y * width * ch;
    row.set(data.subarray(at, at + width * ch));
    for (let x = 0; x < width; x += 1) {
      const from = ((x + s) % width) * ch;
      for (let c = 0; c < ch; c += 1) {
        data[at + x * ch + c] = row[from + c];
      }
    }
  }
  tex.needsUpdate = true;
}

/*
 * Stretch a full equirect DataTexture (rows top first, the zenith at row
 * 0, as RGBELoader leaves sky_env.hdr), already turned to `sunDir`, up by
 * photoElev, in place: each texel over the horizon takes the nearest of
 * its column's. The environment is prefiltered after, so nearest is
 * enough. A column's bearing is three's equirect one, atan(z, x).
 */
export function stretchEquirect(tex, sunDir) {
  const { width, height, data } = tex.image;
  const ch = data.length / (width * height);
  const src = data.slice();
  const p = skyStretch(THREE.MathUtils.radToDeg(Math.asin(sunDir.y)));
  const sunBearing = Math.atan2(sunDir.z, sunDir.x);
  for (let x = 0; x < width; x += 1) {
    const side = sunSide(Math.cos(((x + 0.5) / width - 0.5) * 2 * Math.PI - sunBearing));
    for (let y = 0; y < height / 2; y += 1) {
      const e = 90 - (180 * (y + 0.5)) / height;
      const from = Math.min(height - 1, Math.max(0, Math.round(((90 - photoElev(e, p, side)) / 180) * height - 0.5)));
      for (let c = 0; c < ch; c += 1) {
        data[(y * width + x) * ch + c] = src[(from * width + x) * ch + c];
      }
    }
  }
  tex.needsUpdate = true;
}

/*
 * The backdrop: swiss2.js's skyBackdrop with the turn, the stretch and
 * the air at the horizon. Radiance, not colour; the post chain exposes it
 * with everything else, and the sun's disc is drawn over it far brighter
 * than a photograph stores, for the bloom.
 */
export function skyBackdrop(back, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uBack: { value: back },
      uInvK: { value: 1 / SKY_K },
      uSpan: { value: SKY_SPAN_DEG },
      uTurn: { value: skyTurn(sunDir) },
      uSun: { value: sunDir.clone() },
      uSunCol: { value: SUN_COLOR.clone().multiplyScalar(4000) },
      uP: { value: skyStretch(THREE.MathUtils.radToDeg(Math.asin(sunDir.y))) },
      uSunXZ: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
      uHaze: { value: AIR.haze.clone() },
      uAirSun: { value: SUN_COLOR.clone().multiplyScalar(AIR.mie) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D uBack;
      uniform float uInvK;
      uniform float uSpan;
      uniform float uTurn;
      uniform vec3 uSun;
      uniform vec3 uSunCol;
      uniform float uP;
      uniform vec2 uSunXZ;
      uniform vec3 uHaze;
      uniform vec3 uAirSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5 + uTurn;
        float elev = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
        float side = smoothstep(${SIDE[0].toFixed(2)}, ${SIDE[1].toFixed(2)}, dot(normalize(d.xz + vec2(1e-5, 0.0)), uSunXZ));
        float pe = elev <= 0.0 ? elev : elev * (1.0 - side + side * (${LOW_SLOPE.toFixed(3)} + ${(1 - LOW_SLOPE).toFixed(3)} * pow(elev / 90.0, uP)));
        float v = clamp((pe + (uSpan - 90.0)) / uSpan, 0.001, 0.999);
        vec3 c = texture2D(uBack, vec2(u, v)).rgb * uInvK;
        /* The air at the end of an endless ray: post.js airT's colour. */
        const float g = 0.72;
        float mu = dot(d, uSun);
        float mie = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
        vec3 air = uHaze + uAirSun * mie;
        c = mix(air, c, smoothstep(${AIR_BAND[0].toFixed(1)}, ${AIR_BAND[1].toFixed(1)}, elev));
        float disc = smoothstep(0.99998, 0.999992, dot(d, uSun));
        gl_FragColor = vec4(c + uSunCol * disc, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  return sky;
}
