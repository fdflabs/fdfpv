/*
 * sky.js: Itaipu's sky and the air under it.
 *
 * A CLEAR TROPICAL DAY, NOT THE ALPS'. Rounds 0 and 1 drew swiss2's
 * photographed sky (assets/swiss2/sky_back.jpg), turned and stretched to
 * Itaipu's sun: a thin, hazy summer sky over the Alps, grey white in
 * every view, and a light nearly as strong as the sun's, which left the
 * dam in a flat, shadowless overcast. The reference photographs are hard
 * sun under a deep blue sky with fair weather cumulus. Measured over
 * their clear patches (aerial-dam, aerial-dam-wide, penstocks,
 * crest-road, river-below), the sky is sRGB about (115, 160, 220)
 * overhead going to (150, 185, 215) at the horizon.
 * No photographed sky in the tree is that, so it is drawn:
 *
 *   the clear sky, a deep blue zenith (ZENITH) going to the horizon's
 *   haze (AIR.haze) over the lowest few tens of degrees (FALL), and the
 *   sun's glow through the haze (the post chain's own term, below);
 *
 *   the cumulus, flat bottomed cells heaped into billows, in groups,
 *   grey underneath and lit white on top, veiled by the air with
 *   distance;
 *
 *   the sun's disc, far brighter than anything a photograph stores, for
 *   the bloom.
 *
 * THE HORIZON IS THE AIR. The post chain veils everything with a depth by
 * the air (swiss2/post.js AIR_GLSL), and at infinite distance a ray is the
 * air's own light, haze plus the sun's glow. The sky at and below the
 * horizon is exactly that, so the far plateau fades into a sky of its own
 * colour, with no line where the backdrop meets the ground.
 *
 * THE LIGHT IS THIS SKY. The environment the ground is lit and reflected
 * from is this backdrop, drawn once into a cube round a point over the
 * dam without the disc (the sun is the directional light), then
 * prefiltered. So the sky fill is the same blue as the sky in the frame,
 * and as weak as a clear sky is against a high sun: its irradiance on the
 * level is about a fifth of the sun's (light.js). In round 4 the frames'
 * sky came out darker and greyer than the photographs' (sRGB about (90,
 * 125, 170) overhead against their (95, 145, 195) to (115, 165, 205),
 * after the meter, AgX and the print), and with the sun counted once on
 * High (light.js, THE CASCADES ARE ONE SUN) the meter now lifts the frame
 * so that ZENITH, a little bluer than round 2's, draws (110, 155, 200).
 * The environment is drawn at ENV_GAIN of the backdrop: at the full sky
 * the shade from the air was a stop lighter than the photographs'.
 *
 * NIGHT (mission 4, "Night raid"): the same backdrop, built with `time`
 * set to 'night' instead of drawn fresh, so it keeps the horizon-is-the-
 * air property above. The zenith and the haze go to a near black moonlit
 * blue, the disc is off (uDisc 0: the moon is the directional light, not
 * a second sun on the dome), and a stylised star field (uStars, starsAt)
 * takes its place above the haze. The cumulus stays, now a dark silhouette
 * against the stars where it used to be a lit dome: cheap, because it is
 * the same shader with dimmer uniforms, and honest, because a real sky
 * does exactly that.
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
import { AIR as VALLEY_AIR } from '../../swiss2/post.js';
import { thermalShader } from '../../../render/thermal.js';
import {
  EXPOSURE, METER_KEY, NIGHT_EXPOSURE, NIGHT_METER_KEY, isNight, timeOf, sunFor,
} from './light.js';
import { MAX_DISTRICTS } from '../../../share/war/grid.js';

/*
 * The air, swiss2's shape (post.js AIR) with Itaipu's sky. The haze is the
 * clear sky's horizon, as bright as the Alps' grey and bluer. The
 * extinction, the height it thins over and the print's slope are the
 * valley's (at 0.8 of the extinction the far ground kept more of its
 * contrast, where the photographs' already has less than the renders');
 * the exposure is Itaipu's (light.js). The print's S curve is steeper
 * than the valley's 0.6: over the eight views matched to photographs in
 * round 4 (tools/itaipu/look_measure.py) the ground's darkest twentieth
 * sat at lightness 0.16 against the photographs' 0.12, a grey wash the
 * air was not the cause of (with no air at all, 0.19 to 0.16 on the three
 * views tried) nor the sky's fill (at half the fill, 0.22 to 0.21); most
 * of it was the sun counted twice (light.js).
 */
export const AIR = {
  ...VALLEY_AIR,
  haze: new THREE.Color().setRGB(0.31, 0.37, 0.47, THREE.LinearSRGBColorSpace),
  exposure: EXPOSURE,
  meterKey: METER_KEY,
  contrast: 0.85,
};
/* Round 4's haze: 0.85 of round 2's, the horizon band of river-below
 * having come out sRGB (180, 193, 210) against its photograph's (132,
 * 163, 191). The print's slope stays the valley's: spread over 1.5 stops
 * up to 2.2, it took the ground's 5th to 95th percentile from 0.18 to
 * 0.59 to 0.14 to 0.62 (the photographs' 0.12 to 0.65), but it steepens a
 * frame of sky and cloud most of all, and drove war:boom's cumulus to
 * white. */

/* Night's air: the same extinction shape over a haze that is the
 * moonlit horizon rather than the clear day's, dim enough that a lamp a
 * kilometre off is still the brightest thing in the frame. */
export const AIR_NIGHT = {
  ...VALLEY_AIR,
  haze: new THREE.Color().setRGB(0.035, 0.05, 0.09, THREE.LinearSRGBColorSpace),
  exposure: NIGHT_EXPOSURE,
  /* swiss2/post.js's PhotoPass: the meter's own target for this air,
   * under the day's KEY (light.js says why). */
  meterKey: NIGHT_METER_KEY,
};

/*
 * The other times of day (light.js TIMES), each the day's air with its
 * own horizon. The morning's is paler and its air half again as thick:
 * the humid night's haze not yet burnt off. Noon's is the day's a little
 * brighter. The golden hour's is a darker blue grey, as the sky away from
 * a sun that low is, and its warmth is all toward the sun: the air's
 * forward glow (mie) nearly twice the day's, in the sun's orange (a warm
 * haze all round, loading-art.js's sunset's, drew a beige sky).
 */
const AIRS = {
  day: AIR,
  morning: {
    ...AIR,
    haze: new THREE.Color().setRGB(0.4, 0.45, 0.53, THREE.LinearSRGBColorSpace),
    beta: VALLEY_AIR.beta.clone().multiplyScalar(1.5),
  },
  noon: {
    ...AIR,
    haze: new THREE.Color().setRGB(0.33, 0.39, 0.5, THREE.LinearSRGBColorSpace),
  },
  golden: {
    ...AIR,
    haze: new THREE.Color().setRGB(0.1, 0.13, 0.21, THREE.LinearSRGBColorSpace),
    mie: 0.55,
  },
  night: AIR_NIGHT,
};

/* The air for the time picked, for the post chain and the backdrop. */
export function airFor(time) {
  return AIRS[timeOf(time)];
}

/* The sky overhead, linear radiance in the sun's units (THE LIGHT IS
 * THIS SKY, in the module doc, for why round 4 raised it). */
const ZENITH = new THREE.Color().setRGB(0.035, 0.15, 0.43, THREE.LinearSRGBColorSpace);
/* Each time's (light.js TIMES): the morning's lower sun leaves the
 * zenith a little darker, noon's the day's, the golden hour's deep and
 * dim, and night's a deep moonlit blue, most of it black. */
const ZENITHS = {
  day: ZENITH,
  morning: new THREE.Color().setRGB(0.04, 0.16, 0.48, THREE.LinearSRGBColorSpace),
  noon: ZENITH,
  golden: new THREE.Color().setRGB(0.02, 0.07, 0.26, THREE.LinearSRGBColorSpace),
  night: new THREE.Color().setRGB(0.006, 0.012, 0.03, THREE.LinearSRGBColorSpace),
};
/* How fast the zenith gives way to the haze going down: the haze's share
 * is (1 - sin elevation)^FALL. */
const FALL = 3.5;
/* The sun's glow through the haze, as a share of the post chain's at the
 * horizon, overhead: there is less air above than along the horizon. */
const GLOW_HIGH = 0.35;

/* The stars: a stylised, roughly even scatter over the sphere (a coarse
 * 3D grid hashed per cell, not a real catalogue), only above the haze's
 * band and only where the noise sets a cell alight, near white and
 * twinkling not at all (a moving craft is grain enough). Cheap: the same
 * fragment shader every other view already runs, one more hash. */
const STAR_SCALE = 240.0;
const STAR_CHANCE = 0.9935;

/*
 * The cumulus: scattered fair weather cells, soft edged, with sunlit
 * tops and grey bases shaded by the cell itself.
 *
 * Round 2's deck was one flat sheet of noise: from under it every cloud
 * was a ragged streak the same size as every other, spread evenly. Round
 * 4's first try drew each cell as a hard height field, which read as cut
 * outs with bright rims and vertical streaks. So the cells are a volume:
 *
 *   THE FIELD. The noise that places the cells (skyFbm, mean 0.48,
 *   deviation 0.12, domain warped so the edges curl), CLOUD_SIZE across,
 *   is raised and lowered by a second, CLOUD_GROUP across, so cells
 *   crowd in some parts of the sky and leave others clear.
 *
 *   THE SLAB. Between CLOUD_BASE and CLOUD_DEPTH over it, the density at
 *   a point is how far the field stands over an edge that rises with the
 *   height (CLOUD_EDGE at the base, CLOUD_TAPER more at the top), over a
 *   soft band CLOUD_SOFT wide: each cell is a dome, wide at its flat
 *   base, round at its top, thin and translucent at its rim. The field
 *   is only its coarse octaves; the fine detail is a billow noise in
 *   three dimensions, CLOUD_BILLOW across, that eats CLOUD_ERODE of the
 *   field away, more at the top and the rim: a field's fine octaves
 *   drawn straight up the slab read as vertical streaks, and a cell's
 *   top as cauliflower needs detail that changes with the height.
 *
 *   THE MARCH. A ray from under the deck takes CLOUD_STEPS samples across
 *   the slab, over at most CLOUD_SPAN metres of ground, each pixel's
 *   samples offset by its own fraction of a step so what a step skips is
 *   a fine dither, and adds each sample's light by how much of the ray
 *   it stops (CLOUD_SIGMA per metre at full density), in front of what
 *   it has already gathered. There are no surfaces, so no rims.
 *
 *   THE LIGHT, as shares of the sun's irradiance. Each sample is lit by
 *   the sun through the cell toward the sun (the density CLOUD_PROBE
 *   metres up the sun's ray, Beer's law at CLOUD_SHADOW), CLOUD_LIT at
 *   most, more the higher in the cell (a base is in its own shade, a top
 *   in the open), plus the sky's own light, more at the top than the
 *   base, and a forward glow round the sun. So the bases are grey, the
 *   tops white and a thin edge toward the sun glows. The air takes a
 *   cloud over CLOUD_FADE metres. A camera over the deck sees none:
 *   every view and course is under it.
 *
 *   THE SKY IS A CUBE. The march is too dear to run for every sky pixel
 *   of every frame (28 steps over a frame half sky cost 2 to 3 ms, and
 *   a per pixel dither of its steps showed as a fine hatching). So the
 *   whole sky, clouds and all, is marched into a cube round the camera,
 *   SKY_CUBE_PX a side, one face a frame, the face drawn longest ago, and
 *   all six at once when there is no cube yet or the camera has jumped
 *   SKY_CUBE_CUT metres; the backdrop reads the cube with five taps a
 *   texel apart, which averages the dither away. The clouds are 1.6 km
 *   up and more, so the six frames a face may be behind the camera are a
 *   fraction of a degree of parallax even at a plane's speed. The disc
 *   is drawn by the backdrop itself, not the cube. The backdrop is drawn
 *   last of the opaque things, only where nothing else is.
 */
const CLOUD_BASE = 1600;
const CLOUD_SIZE = 850;
const CLOUD_GROUP = 7000;
const CLOUD_GROUP_W = 0.3;
const CLOUD_EDGE = 0.58;
const CLOUD_TAPER = 0.16;
const CLOUD_SOFT = 0.07;
const CLOUD_BILLOW = 220;
const CLOUD_ERODE = 0.14;
const CLOUD_DEPTH = 800;
const CLOUD_STEPS = 64;
const CLOUD_SPAN = 4000;
const CLOUD_SIGMA = 0.032;
const CLOUD_FADE = 9000;
const CLOUD_LIT = 0.4;
const CLOUD_PROBE = 160;
const CLOUD_SHADOW = 2.2;

/* The towns' glow at night (look/night.js hands the levels over): the
 * light of every lit town district (src/share/war/grid.js, its seed and
 * radius) scattered back by the air at CITY_AIR_Y, toward the horizon
 * where a ray runs long through it, and onto the cloud deck's base over
 * it. Warm, as sodium and old LED light is. Off by day (uCityOn 0), and
 * the day's sky is then the same to the bit. */
const CITY_AIR_Y = 600;
const CITY_AIR = 0.05;
const CITY_CLOUD = 0.12;
const CITY_GLOW = new THREE.Color(1.0, 0.56, 0.26);

/* A point over the dam the environment is drawn from, and its size. */
const ENV_AT = new THREE.Vector3(0, 400, -1500);
const ENV_PX = 256;
/* The sky cube's side, and the jump in metres past which all six of its
 * faces are drawn at once (THE SKY IS A CUBE, in the module doc). */
const SKY_CUBE_PX = 768;
const SKY_CUBE_CUT = 40;
/* The environment's share of the backdrop's radiance (THE LIGHT IS THIS
 * SKY, in the module doc, says why it is not 1). */
const ENV_GAIN = 0.55;
/* The golden hour's: its sky is a dark blue (ZENITHS) and the sun is 8
 * degrees up, so a shade is lit by that sky alone, and at ENV_GAIN the
 * dam's long shadow over the ground was black where a photograph's is a
 * deep blue. */
const ENV_GAIN_LOW_SUN = 1.0;

const SKY_GLSL = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uSunCol;
  uniform vec3 uZenith;
  uniform vec3 uHaze;
  uniform vec3 uAirSun;
  uniform vec3 uCam;
  uniform float uDisc;
  uniform float uDirect;
  uniform samplerCube uCube;
  uniform float uCubeTexel;
  uniform float uGain;
  uniform float uStars;
  uniform float uCityOn;
  uniform float uCityLevel[${MAX_DISTRICTS}];
  uniform vec2 uCitySeed[${MAX_DISTRICTS}];
  uniform float uCityR[${MAX_DISTRICTS}];
  uniform int uCityCount;
  varying vec3 vDir;

  /* The towns' light over (x, z): each lit district's, a bump its radius
   * wide. */
  float cityGlowAt(vec2 xz) {
    float s = 0.0;
    for (int i = 0; i < ${MAX_DISTRICTS}; i++) {
      if (i >= uCityCount) {
        break;
      }
      float r = uCityR[i];
      if (r <= 0.0) {
        continue;
      }
      vec2 d = xz - uCitySeed[i];
      s += uCityLevel[i] * exp(-dot(d, d) / (1.6 * r * r));
    }
    return s;
  }

  float skyHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float skyHash3(vec3 p) {
    return skyHash(p.xy * 7.13 + p.z * 31.7);
  }
  /* A cell of the direction, hashed for whether it lights (STAR_CHANCE)
   * and how bright, falling off from the cell's own centre so a star is
   * a soft point and not a lit cube's face. Above the haze only: night's
   * horizon is the same haze the day's is, just darker. */
  float starsAt(vec3 d) {
    vec3 p = d * ${STAR_SCALE.toFixed(1)};
    vec3 cell = floor(p);
    float on = step(${STAR_CHANCE.toFixed(4)}, skyHash3(cell));
    float bright = skyHash3(cell + 11.0);
    float r2 = dot(fract(p) - 0.5, fract(p) - 0.5);
    return on * mix(0.35, 1.0, bright) * smoothstep(0.22, 0.0, r2) * smoothstep(0.0, 0.12, d.y);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
      mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float skyFbm(vec2 p, int octaves) {
    float s = 0.0;
    float a = 0.5;
    for (int k = 0; k < 6; k++) {
      if (k >= octaves) {
        break;
      }
      s += a * skyNoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }
  /* The cumulus's field at a point of the deck (the module doc, THE
   * FIELD). */
  float cloudField(vec2 w, int octaves) {
    vec2 p = w / ${CLOUD_SIZE.toFixed(1)};
    vec2 g = w / ${CLOUD_GROUP.toFixed(1)};
    float group = 0.65 * skyNoise(g + 17.3) + 0.35 * skyNoise(g * 2.13 + 3.1);
    vec2 warp = 0.35 * vec2(skyNoise(p * 0.5 + 7.1), skyNoise(p * 0.5 + 3.3));
    return skyFbm(p + warp, octaves) + ${CLOUD_GROUP_W.toFixed(3)} * (group - 0.5);
  }
  /* The density at q (the module doc, THE SLAB): 0 outside a cell, 1
   * well inside it. */
  /* Value noise in three dimensions, from two slices of the 2D one: the
   * billows' detail, which varies with the height as well, so a cell is
   * not its base's outline drawn straight up (the first volume, lit only
   * by a field over the ground, read as curtains). */
  float skyNoise3(vec3 p) {
    float y = floor(p.y);
    float f = fract(p.y);
    f = f * f * (3.0 - 2.0 * f);
    return mix(skyNoise(p.xz + y * 17.13), skyNoise(p.xz + (y + 1.0) * 17.13), f);
  }
  float cloudDensity(vec3 q, int octaves) {
    float h = (q.y - ${CLOUD_BASE.toFixed(1)}) / ${CLOUD_DEPTH.toFixed(1)};
    if (h < 0.0 || h > 1.0) {
      return 0.0;
    }
    float edge = ${CLOUD_EDGE.toFixed(3)} + ${CLOUD_TAPER.toFixed(3)} * h * h;
    /* The tops lean a little downwind, and the field is eroded by the
     * billows, more at the cell's rim and top than in its body. */
    vec2 at = q.xz + vec2(0.35, 0.2) * (q.y - ${CLOUD_BASE.toFixed(1)});
    float n = cloudField(at, octaves);
    float billow = 0.6 * skyNoise3(q / ${CLOUD_BILLOW.toFixed(1)}) + 0.4 * skyNoise3(q / ${(CLOUD_BILLOW * 0.43).toFixed(1)} + 5.3);
    n -= ${CLOUD_ERODE.toFixed(3)} * (1.0 - billow) * (0.6 + 0.8 * h);
    return smoothstep(edge, edge + ${CLOUD_SOFT.toFixed(3)}, n) * smoothstep(0.0, 0.06, h);
  }

  vec3 skyAt(vec3 d) {
    /* post.js airT's light at the end of an endless ray. */
    const float g = 0.72;
    float mu = dot(d, uSun);
    float hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    float up = max(d.y, 0.0);
    float t = pow(1.0 - up, ${FALL.toFixed(2)});
    vec3 c = mix(uZenith, uHaze, t) + uAirSun * hg * mix(${GLOW_HIGH.toFixed(2)}, 1.0, t);
    if (uStars > 0.0) {
      c += vec3(0.9, 0.94, 1.0) * (starsAt(d) * uStars);
    }
    vec3 cityCol = vec3(${CITY_GLOW.r.toFixed(3)}, ${CITY_GLOW.g.toFixed(3)}, ${CITY_GLOW.b.toFixed(3)});
    if (uCityOn > 0.0 && d.y > 0.0 && uCam.y < ${CITY_AIR_Y.toFixed(1)}) {
      float runAir = (${CITY_AIR_Y.toFixed(1)} - uCam.y) / max(d.y, 0.015);
      vec2 pAir = uCam.xz + d.xz * runAir;
      c += cityCol * (${CITY_AIR.toFixed(3)} * cityGlowAt(pAir) * exp(-runAir / 40000.0) * (1.0 - smoothstep(0.0, 0.5, d.y)));
    }
    if (d.y > 0.01 && uCam.y < ${CLOUD_BASE.toFixed(1)}) {
      float horizon = smoothstep(0.01, 0.06, d.y);
      vec3 sky = uZenith * 0.45 + uHaze * 0.4;
      float t0 = (${CLOUD_BASE.toFixed(1)} - uCam.y) / d.y;
      float t1 = min((${(CLOUD_BASE + CLOUD_DEPTH).toFixed(1)} - uCam.y) / d.y,
        t0 + ${CLOUD_SPAN.toFixed(1)} / max(length(d.xz), 1e-3));
      float dt = (t1 - t0) / ${CLOUD_STEPS.toFixed(1)};
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float trans = 1.0;
      vec3 light = vec3(0.0);
      for (int i = 0; i < ${CLOUD_STEPS}; i++) {
        if (trans < 0.03) {
          break;
        }
        vec3 q = uCam + d * (t0 + (float(i) + jit) * dt);
        float dens = cloudDensity(q, 3);
        if (dens < 0.002) {
          continue;
        }
        float h = (q.y - ${CLOUD_BASE.toFixed(1)}) / ${CLOUD_DEPTH.toFixed(1)};
        float toSun = cloudDensity(q + uSun * ${CLOUD_PROBE.toFixed(1)}, 3);
        float sunT = exp(-${CLOUD_SHADOW.toFixed(2)} * (toSun + 0.5 * dens)) * mix(0.45, 1.0, h);
        vec3 lq = uSunCol * (sunT * (${CLOUD_LIT.toFixed(3)} + 0.5 * hg * (1.0 - dens)))
          + sky * mix(0.55, 1.0, h);
        if (uCityOn > 0.0) {
          lq += cityCol * (${CITY_CLOUD.toFixed(3)} * cityGlowAt(q.xz) * (1.0 - h));
        }
        float a = 1.0 - exp(-${CLOUD_SIGMA.toFixed(4)} * dens * dt);
        light += trans * a * lq;
        trans *= 1.0 - a;
      }
      float cover = 1.0 - trans;
      if (cover > 0.0) {
        vec3 cloud = light / cover;
        float air = 1.0 - exp(-t0 / ${CLOUD_FADE.toFixed(1)});
        c = mix(c, mix(cloud, c, air), cover * horizon);
      }
    }
    return c;
  }
`;

/*
 * The backdrop: a sphere round the camera on the far plane. Radiance, not
 * colour; the post chain exposes it with everything else. `time` picks day
 * (the sun, its disc, the deep blue zenith) or night (the moon standing in
 * for it, no disc, a near black zenith, and the stars): see the module
 * doc for why night is drawn rather than reused from a photograph.
 */
export function skyBackdrop(sunDir, time) {
  const night = isNight(time);
  const { color: sunColor, irradiance: sunIrradiance } = sunFor(time);
  const sunCol = sunColor.clone().multiplyScalar(sunIrradiance);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() },
      uSunCol: { value: sunCol },
      uZenith: { value: ZENITHS[timeOf(time)].clone() },
      uHaze: { value: airFor(time).haze.clone() },
      uAirSun: { value: sunColor.clone().multiplyScalar(airFor(time).mie) },
      uCam: { value: new THREE.Vector3() },
      uDisc: { value: night ? 0 : 1 },
      /* 1 while drawn into a cube (the sky cube, the environment), 0 for
       * the backdrop, which reads the sky cube. */
      uDirect: { value: 1 },
      uCube: { value: null },
      uCubeTexel: { value: 1.5 / SKY_CUBE_PX },
      /* 1 but while the environment is drawn (skyEnvironment). */
      uGain: { value: 1 },
      uStars: { value: night ? 1 : 0 },
      /* Set by look/night.js, which shares its levels' array. */
      uCityOn: { value: 0 },
      uCityLevel: { value: new Float32Array(MAX_DISTRICTS) },
      uCitySeed: { value: Array.from({ length: MAX_DISTRICTS }, () => new THREE.Vector2()) },
      uCityR: { value: new Float32Array(MAX_DISTRICTS) },
      uCityCount: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        /* On the far plane whatever the projection: the water's mirror
         * draws with an oblique near plane (swiss2/water/lake.js), which
         * clipped the sphere into a curved edge across the reservoir. */
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c;
        if (uDirect > 0.5) {
          c = skyAt(d);
        } else {
          /* The sky cube (THE SKY IS A CUBE, in the module doc), five taps
           * a texel apart: the march's per texel dither, averaged away. */
          vec3 tu = normalize(cross(d, abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 tv = cross(d, tu);
          float k = uCubeTexel;
          c = 0.4 * textureCube(uCube, d).rgb
            + 0.15 * (textureCube(uCube, d + (tu + tv) * k).rgb + textureCube(uCube, d + (tu - tv) * k).rgb
              + textureCube(uCube, d - (tu + tv) * k).rgb + textureCube(uCube, d - (tu - tv) * k).rgb);
        }
        float disc = smoothstep(0.99998, 0.999992, dot(d, uSun));
        gl_FragColor = vec4((c + uSunCol * (1000.0 * disc * uDisc)) * uGain, 1.0);
      }
    `,
  });
  /* The clear sky's own temperature along the look (thermal.js thSky):
   * the coldest thing in a thermal picture. */
  thermalShader(mat, 'float thT = thSky(normalize(vDir).y);', 'itaipu-sky');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  /* Last of the opaque things, depth tested on the far plane (the vertex
   * shader puts it there), so it reads the sky cube only on the pixels
   * that show sky, never for pixels then painted over. */
  sky.renderOrder = 1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
    mat.uniforms.uCam.value.copy(sky.position);
  };

  /* THE SKY IS A CUBE: see the module doc. */
  const cube = new THREE.WebGLCubeRenderTarget(SKY_CUBE_PX, { type: THREE.HalfFloatType });
  cube.texture.generateMipmaps = false;
  cube.texture.minFilter = THREE.LinearFilter;
  const eye = new THREE.CubeCamera(1, 4000, cube);
  const cubeScene = new THREE.Scene();
  const local = new THREE.Mesh(sky.geometry, mat);
  local.frustumCulled = false;
  local.onBeforeRender = (renderer, scene, camera) => {
    local.position.setFromMatrixPosition(camera.matrixWorld);
    local.updateMatrixWorld();
    mat.uniforms.uCam.value.copy(local.position);
  };
  cubeScene.add(local);
  const at = new THREE.Vector3();
  const facesAt = Array.from({ length: 6 }, () => null);
  let next = 0;
  function drawFaces(renderer, faces) {
    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace();
    const prevLevel = renderer.getActiveMipmapLevel();
    const prevXr = renderer.xr.enabled;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    mat.uniforms.uDirect.value = 1;
    /* Unbound while its own faces are drawn: a texture bound for reading
     * while it is the target is a feedback loop, and the driver refuses
     * the draw (the faces came out the clear's black). */
    mat.uniforms.uCube.value = null;
    const disc = mat.uniforms.uDisc.value;
    mat.uniforms.uDisc.value = 0;
    for (const f of faces) {
      renderer.setRenderTarget(cube, f);
      /* The shell draws with autoClear off (its composer clears), and the
       * backdrop is depth tested at the far plane. */
      renderer.clear();
      renderer.render(cubeScene, eye.children[f]);
      facesAt[f] = (facesAt[f] || new THREE.Vector3()).copy(at);
    }
    mat.uniforms.uDisc.value = disc;
    mat.uniforms.uDirect.value = 0;
    renderer.setRenderTarget(prevTarget, prevFace, prevLevel);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
  }
  /* Once a frame, before the frame is drawn (look/index.js): the face of
   * the cube drawn longest ago, from where the camera now is; all six
   * when there is no cube yet or the camera has jumped. */
  sky.updateCube = (renderer, camera) => {
    if (eye.coordinateSystem !== renderer.coordinateSystem) {
      eye.coordinateSystem = renderer.coordinateSystem;
      eye.updateCoordinateSystem();
    }
    at.setFromMatrixPosition(camera.matrixWorld);
    eye.position.copy(at);
    eye.updateMatrixWorld();
    const cut = facesAt.some((f) => f === null || f.distanceTo(at) > SKY_CUBE_CUT);
    drawFaces(renderer, cut ? [0, 1, 2, 3, 4, 5] : [next]);
    next = (next + 1) % 6;
    mat.uniforms.uCube.value = cube.texture;
  };
  sky.disposeCube = () => cube.dispose();
  return sky;
}

/*
 * The environment: the backdrop without its disc, drawn into a cube from
 * ENV_AT and prefiltered. Called before the backdrop is added to the
 * map's scene. Returns the PMREM target; the caller owns it.
 */
export function skyEnvironment(renderer, sky, time) {
  const cube = new THREE.WebGLCubeRenderTarget(ENV_PX, { type: THREE.HalfFloatType });
  const eye = new THREE.CubeCamera(1, 4000, cube);
  eye.position.copy(ENV_AT);
  eye.updateMatrixWorld();
  const scene = new THREE.Scene();
  scene.add(sky);
  const disc = sky.material.uniforms.uDisc.value;
  sky.material.uniforms.uDisc.value = 0;
  sky.material.uniforms.uGain.value = timeOf(time) === 'golden' ? ENV_GAIN_LOW_SUN : ENV_GAIN;
  eye.update(renderer, scene);
  sky.material.uniforms.uDisc.value = disc;
  sky.material.uniforms.uGain.value = 1;
  scene.remove(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromCubemap(cube.texture);
  pmrem.dispose();
  cube.dispose();
  return target;
}
