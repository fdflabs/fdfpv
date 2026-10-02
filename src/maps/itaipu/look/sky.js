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
  EXPOSURE, NIGHT_EXPOSURE, NIGHT_METER_KEY, isNight, timeOf, sunFor,
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
  contrast: 0.85,
  spread: 1.5,
  slopeMax: 2.2,
};
/* Round 4's numbers for the haze and the print (look_measure.py over the
 * eight matched views): the haze 0.85 of round 2's, the horizon band of
 * river-below having come out sRGB (180, 193, 210) against its
 * photograph's (132, 163, 191); the print's slope, spread over 1.5 rather
 * than 1.2 stops and up to 2.2, because once the sun was counted once the
 * ground's 5th to 95th percentile was 0.18 to 0.59 against 0.12 to 0.65. */

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
    haze: new THREE.Color().setRGB(0.21, 0.21, 0.25, THREE.LinearSRGBColorSpace),
    beta: VALLEY_AIR.beta.clone().multiplyScalar(1.2),
    mie: 0.9,
  },
  night: AIR_NIGHT,
};

/* The air for the time picked, for the post chain and the backdrop. */
export function airFor(time) {
  return AIRS[timeOf(time)];
}

/* The sky overhead, linear radiance in the sun's units (THE LIGHT IS
 * THIS SKY, in the module doc, for why round 4 raised it). */
const ZENITH = new THREE.Color().setRGB(0.045, 0.2, 0.56, THREE.LinearSRGBColorSpace);
/* Each time's (light.js TIMES): the morning's lower sun leaves the
 * zenith a little darker, noon's the day's, the golden hour's deep and
 * dim, and night's a deep moonlit blue, most of it black. */
const ZENITHS = {
  day: ZENITH,
  morning: new THREE.Color().setRGB(0.04, 0.16, 0.48, THREE.LinearSRGBColorSpace),
  noon: ZENITH,
  golden: new THREE.Color().setRGB(0.025, 0.07, 0.21, THREE.LinearSRGBColorSpace),
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
 * The cumulus, fair weather cells with flat grey bases and sunlit domes.
 *
 * Round 2's deck was one flat sheet of noise CLOUD_SIZE across: from
 * under it every cloud was a ragged streak the same size as every other,
 * spread evenly over the sky, where the photographs (dam-downstream-2,
 * canyon, powerlines, river-below) have fewer, bigger cells in groups,
 * each a flat base under a heaped top. Two things make that here:
 *
 *   THE FIELD. The noise that draws the cells (skyFbm, mean 0.48,
 *   deviation 0.12, domain warped so the edges curl) is raised and
 *   lowered by a second, CLOUD_GROUP across, so cells crowd together in
 *   some parts of the sky and leave others clear. A cell is where the sum
 *   is over CLOUD_EDGE's first value, solid from its second.
 *
 *   THE DOME. Each cell is a height field over the base at CLOUD_BASE:
 *   its top stands CLOUD_DEPTH over the base where the field is well
 *   over the edge, falling to nothing at the edge. A ray from under the
 *   deck that meets a cell at the base sees the base; one that slips
 *   past the base is marched up through the slab, CLOUD_STEPS steps over
 *   at most CLOUD_SPAN metres of ground, each pixel's steps offset by a
 *   fraction of a step (what a step skips is then a fine dither, where
 *   eight even steps drew horizontal bands across every cell), and the
 *   hit refined by halving between the last two steps. So a cell toward
 *   the horizon shows its side and heaped top over its base, as a
 *   cumulus does, and one overhead shows its base. The top is not the
 *   field itself, which drew snowy peaks, but a gentle dome over the
 *   field's rise, its surface a lattice of spheres CLOUD_PUFF metres
 *   apart (cloudPuff): a cumulus is heaped billows.
 *
 *   THE COST. The march is the backdrop's dearest part, so the backdrop
 *   is drawn last of the opaque things (only where nothing else is), and
 *   the water's mirror, which shows the sky through ripples and blurs it
 *   past a few hundred metres, sees the bases only.
 *
 * The light, as shares of the sun's irradiance: a base is lit by the
 * sky and what comes through the cell, CLOUD_SHADE, darker the thicker
 * the cell; a side or top is CLOUD_LIT where it faces the sun, and as
 * little as CLOUD_SELF of that where more of the cell stands between it
 * and the sun (the field sampled CLOUD_PROBE metres toward the sun: a
 * thicker cell that way is a shaded face), each billow lit by its own
 * sphere's normal. A thin edge toward the sun glows. The air takes a cloud over CLOUD_FADE metres. A camera over the
 * deck sees none: every view and course is under it.
 */
const CLOUD_BASE = 1600;
const CLOUD_SIZE = 1500;
const CLOUD_GROUP = 9000;
const CLOUD_GROUP_W = 0.32;
const CLOUD_EDGE = [0.59, 0.67];
const CLOUD_DEPTH = 900;
const CLOUD_STEPS = 24;
const CLOUD_SPAN = 5000;
const CLOUD_FADE = 16000;
const CLOUD_LIT = 0.36;
const CLOUD_SELF = 0.45;
const CLOUD_PROBE = 220;
const CLOUD_PUFF = 240;
const CLOUD_SHADE = 0.12;

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
/* The environment's share of the backdrop's radiance (THE LIGHT IS THIS
 * SKY, in the module doc, says why it is not 1). */
const ENV_GAIN = 0.55;

const SKY_GLSL = /* glsl */ `
  uniform vec3 uSun;
  uniform vec2 uSunXZ;
  uniform vec3 uSunCol;
  uniform vec3 uZenith;
  uniform vec3 uHaze;
  uniform vec3 uAirSun;
  uniform vec3 uCam;
  uniform float uDisc;
  uniform float uMarch;
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
   * FIELD), and the height of a cell's top over the base for it. */
  float cloudField(vec2 w, int octaves) {
    vec2 p = w / ${CLOUD_SIZE.toFixed(1)};
    vec2 g = w / ${CLOUD_GROUP.toFixed(1)};
    float group = 0.65 * skyNoise(g + 17.3) + 0.35 * skyNoise(g * 2.13 + 3.1);
    vec2 warp = 0.35 * vec2(skyNoise(p * 0.5 + 7.1), skyNoise(p * 0.5 + 3.3));
    return skyFbm(p + warp, octaves) + ${CLOUD_GROUP_W.toFixed(3)} * (group - 0.5);
  }
  /* The billows: a lattice of spheres CLOUD_PUFF metres apart, each
   * jittered in its cell; at w, the nearest one's height over the deck,
   * 0 to 1, and its normal. A cumulus's top is heaped spheres, and a
   * height field drawn from smooth or ridged noise drew snowy peaks. */
  float cloudPuff(vec2 w, out vec3 nrm) {
    vec2 p = w / ${CLOUD_PUFF.toFixed(1)};
    vec2 i = floor(p);
    vec2 f = p - i;
    float best = 1e9;
    vec2 off = vec2(0.0);
    for (int k = 0; k < 9; k++) {
      vec2 o = vec2(float(k - 3 * (k / 3)) - 1.0, float(k / 3) - 1.0);
      vec2 c = o + vec2(skyHash(i + o), skyHash(i + o + 19.1)) * 0.8 + 0.1;
      vec2 dv = f - c;
      float d2 = dot(dv, dv);
      if (d2 < best) {
        best = d2;
        off = dv;
      }
    }
    float h = sqrt(max(0.0, 1.0 - best / 0.81));
    nrm = normalize(vec3(off.x, h, off.y));
    return h;
  }
  /* A cell's top over the base at w: a dome, round in section, over the
   * field's rise past the edge, its surface the billows; never below the
   * base inside the cell. */
  float cloudTop(float n, vec2 w) {
    float k = 1.0 - clamp((n - ${CLOUD_EDGE[0].toFixed(3)}) / 0.3, 0.0, 1.0);
    vec3 nrm;
    float puff = cloudPuff(w, nrm);
    float dome = 1.0 - k * k;
    return (${(CLOUD_DEPTH - CLOUD_PUFF).toFixed(1)} * dome + ${CLOUD_PUFF.toFixed(1)} * puff * sqrt(dome)) * (n > ${CLOUD_EDGE[0].toFixed(3)} ? 1.0 : -1.0);
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
      float horizon = smoothstep(0.01, 0.05, d.y);
      vec3 fill = uZenith * 0.6 + uHaze * 0.25;
      /* The base. */
      float run = (${CLOUD_BASE.toFixed(1)} - uCam.y) / d.y;
      vec2 at = uCam.xz + d.xz * run;
      float n = cloudField(at, 6);
      float base = smoothstep(${CLOUD_EDGE[0].toFixed(3)}, ${CLOUD_EDGE[1].toFixed(3)}, n);
      /* The side and top past it. */
      float t0 = run;
      float t1 = min((${(CLOUD_BASE + CLOUD_DEPTH).toFixed(1)} - uCam.y) / d.y,
        run + ${CLOUD_SPAN.toFixed(1)} / max(length(d.xz), 1e-3));
      float hitT = -1.0;
      float lo = t0;
      if (uMarch > 0.0) {
      /* Each pixel's steps start a different fraction of a step in, so
       * what a step skips is a fine dither, not a band. */
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      for (int i = 0; i < ${CLOUD_STEPS}; i++) {
        float t = mix(t0, t1, (float(i) + jit) / ${CLOUD_STEPS.toFixed(1)});
        vec3 q = uCam + d * t;
        if (cloudTop(cloudField(q.xz, 4), q.xz) > q.y - ${CLOUD_BASE.toFixed(1)}) {
          hitT = t;
          break;
        }
        lo = t;
      }
      }
      vec3 side = c;
      float sideA = 0.0;
      if (hitT > 0.0) {
        float hi = hitT;
        for (int k = 0; k < 4; k++) {
          float m = 0.5 * (lo + hi);
          vec3 q = uCam + d * m;
          if (cloudTop(cloudField(q.xz, 4), q.xz) > q.y - ${CLOUD_BASE.toFixed(1)}) {
            hi = m;
          } else {
            lo = m;
          }
        }
        vec3 q = uCam + d * hi;
        float nq = cloudField(q.xz, 4);
        float toSun = cloudField(q.xz + uSunXZ * ${CLOUD_PROBE.toFixed(1)}, 4);
        float h = (q.y - ${CLOUD_BASE.toFixed(1)}) / ${CLOUD_DEPTH.toFixed(1)};
        float self = clamp(0.5 + 6.0 * (nq - toSun), 0.0, 1.0) * mix(0.5, 1.0, h);
        /* The billows' own light and shade, and a soft silhouette: how
         * far the ray is inside the cell a little further on. */
        vec3 puffN;
        cloudPuff(q.xz, puffN);
        float lumps = 0.4 + 0.75 * clamp(0.8 * dot(puffN, uSun) + 0.2, 0.0, 1.0);
        vec3 q2 = q + d * 120.0;
        float inside = cloudTop(cloudField(q2.xz, 4), q2.xz) - (q2.y - ${CLOUD_BASE.toFixed(1)});
        float thin = 1.0 - smoothstep(${CLOUD_EDGE[0].toFixed(3)}, ${(CLOUD_EDGE[1] + 0.1).toFixed(3)}, nq);
        float lit = ${CLOUD_LIT.toFixed(3)} * mix(${CLOUD_SELF.toFixed(3)}, 1.0, self) * lumps + 0.35 * hg * thin;
        side = mix(uSunCol * lit + fill, c, 1.0 - exp(-hi / ${CLOUD_FADE.toFixed(1)}));
        sideA = horizon * smoothstep(0.0, 150.0, inside);
      }
      c = mix(c, side, sideA);
      if (base > 0.0) {
        float thick = smoothstep(${CLOUD_EDGE[0].toFixed(3)}, ${(CLOUD_EDGE[1] + 0.2).toFixed(3)}, n);
        /* What comes through a cell falls away as the sun goes down to
         * the horizon: at the golden hour the bases are grey blue under
         * orange sides. */
        float lit = ${CLOUD_SHADE.toFixed(3)} * (1.3 - 0.6 * thick) * smoothstep(0.0, 0.6, uSun.y)
          + 0.3 * hg * (1.0 - thick);
        vec3 cloud = uSunCol * lit + fill;
        if (uCityOn > 0.0) {
          cloud += cityCol * (${CITY_CLOUD.toFixed(3)} * cityGlowAt(at));
        }
        float air = 1.0 - exp(-run / ${CLOUD_FADE.toFixed(1)});
        c = mix(c, mix(cloud, c, air), base * horizon);
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
      /* Toward the sun along the deck: the cumulus's self shadow. */
      uSunXZ: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
      uSunCol: { value: sunCol },
      uZenith: { value: ZENITHS[timeOf(time)].clone() },
      uHaze: { value: airFor(time).haze.clone() },
      uAirSun: { value: sunColor.clone().multiplyScalar(airFor(time).mie) },
      uCam: { value: new THREE.Vector3() },
      uDisc: { value: night ? 0 : 1 },
      /* 0 in the water's mirror (onBeforeRender below). */
      uMarch: { value: 1 },
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
        vec3 c = skyAt(d);
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
   * shader puts it there), so the clouds' march runs only on the pixels
   * that show sky: drawn first under everything it was the whole frame's
   * dearest pass, about 2.5 ms of it, for pixels then painted over. */
  sky.renderOrder = 1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
    mat.uniforms.uCam.value.copy(sky.position);
    /* The water's planar mirror (swiss2/water/lake.js planarMirror) draws
     * through an oblique near plane, which no other camera has: there the
     * sky is a half resolution reflection under ripples and the blurred
     * environment past a few hundred metres (water/index.js, THE SKY IN
     * THE WATER IS BLURRED), and the cumulus's bases alone are sky enough.
     * Marched there too, the reflection cost a reservoir view 2 ms. */
    const e = camera.projectionMatrix.elements;
    mat.uniforms.uMarch.value = e[2] === 0 && e[6] === 0 ? 1 : 0;
  };
  return sky;
}

/*
 * The environment: the backdrop without its disc, drawn into a cube from
 * ENV_AT and prefiltered. Called before the backdrop is added to the
 * map's scene. Returns the PMREM target; the caller owns it.
 */
export function skyEnvironment(renderer, sky) {
  const cube = new THREE.WebGLCubeRenderTarget(ENV_PX, { type: THREE.HalfFloatType });
  const eye = new THREE.CubeCamera(1, 4000, cube);
  eye.position.copy(ENV_AT);
  eye.updateMatrixWorld();
  const scene = new THREE.Scene();
  scene.add(sky);
  const disc = sky.material.uniforms.uDisc.value;
  sky.material.uniforms.uDisc.value = 0;
  sky.material.uniforms.uGain.value = ENV_GAIN;
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
