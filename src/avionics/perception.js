/*
 * perception.js: PerceptionAI, what the sensor could see turned into
 * detections (docs/AVIONICS-HUD.md section 6; the model and its numbers
 * are docs/AVIONICS-PERCEPTION.md). Ground truth goes in, where every
 * object really is, and out come what an onboard detector would report: a
 * direction, an apparent size, class hypotheses and a range INTERVAL, with
 * the noise and the misses a real one has. Never the true range, never the
 * true kind, never an object the camera cannot see.
 *
 * Per object, per tick:
 *
 *   in view     in front of the camera and inside its picture
 *   occluded    the line of sight sampled at OCC_SAMPLES points against
 *               heightAt(x, z), the terrain's top (ground, water, the
 *               dam): a sample under it hides the object
 *   pixels      its size over its range, times the sensor's pixels per
 *               radian: SENSOR_ROWS over the field of view, times the
 *               band's resolution, with digital zoom giving back only
 *               the square root of its factor (more pixels on the object,
 *               not more detail)
 *   contrast    the band's, between day and night by the light: EO sees a
 *               dark body against the sky and almost nothing at night,
 *               low light trades noise for night contrast, thermal sees
 *               heat (better at night, when the ground has cooled) scaled
 *               by the object's heat. Ground behind the object rather than
 *               sky costs contrast, the sun near the line of sight costs
 *               EO contrast (glare), the air costs both with range (haze,
 *               less for IR), and the sensor's own noise costs some
 *   motion      an object crossing the picture is easier to see
 *   detection   signal = pixels x contrast x motion (and x pixels again
 *               under one, the pixel's fill), through a logistic
 *               centred on DETECT_50, drawn against a seeded uniform: a
 *               marginal object flickers
 *   class       the hypotheses move from an uninformative PRIOR toward the
 *               true class's CONFUSE row as the object grows in pixels
 *               (Johnson's criteria: a pixel or two detects, about six
 *               recognise, a dozen or more identify), less seen nose on, with seeded noise on each
 *   range       the measured angular size, with pixel noise and a pixel
 *               of quantisation, against the size interval of every
 *               plausible class: wide while the class is open, narrowing
 *               to the type's own size once it is identified
 *
 * DETERMINISM. Every random number is an integer hash of (seed, object,
 * tick, channel), so the same seed and the same sim clock give the same
 * detections in any run, whatever rate the frames come at. Perception
 * runs at PERCEPTION_HZ on the sim clock, and a frame inside a tick keeps
 * that tick's detections. Math.exp, Math.acos and Math.tan are used: this
 * is display, never the plant or the room, and nothing here changes what
 * happens in the game.
 *
 * Pure: no DOM, no three.js, no wall clock; scripts/perception-check.js
 * drives it in Node.
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

/* The class hypotheses (docs/AVIONICS-HUD.md section 7.2's ids), in the
 * order of PRIOR and of CONFUSE's columns. */
export const CLASSES = ['fixed_wing_uav', 'loitering_munition', 'multirotor', 'light_aircraft', 'boat', 'unknown'];
const NC = CLASSES.length;
const UNKNOWN = NC - 1;

/* Each class's characteristic size (span or length), metres: what a
 * range is read against while the type is not identified. */
export const CLASS_SIZE = {
  'fixed_wing_uav': [1.5, 4.5],
  'loitering_munition': [0.8, 2.0],
  multirotor: [0.2, 0.6],
  'light_aircraft': [7, 14],
  boat: [3, 9],
  unknown: [0.2, 14],
};

/* What a detector says about a few pixels: nothing, so the prior. */
export const PRIOR = [0.2, 0.1, 0.15, 0.1, 0.05, 0.4];

/* What it says once it can recognise, by true class over CLASSES: a fixed
 * wing is taken for a light aircraft (the same shape at another range) or
 * a loitering munition, a multirotor for an unknown blob. */
const CONFUSE = {
  'fixed_wing_uav': [0.8, 0.08, 0, 0.08, 0, 0.04],
  'loitering_munition': [0.12, 0.78, 0, 0.02, 0, 0.08],
  multirotor: [0.02, 0.02, 0.86, 0, 0, 0.1],
  'light_aircraft': [0.1, 0, 0, 0.86, 0, 0.04],
  boat: [0, 0, 0, 0, 0.9, 0.1],
  unknown: [0.1, 0.1, 0.1, 0.1, 0.1, 0.5],
};

/*
 * The war's attackers (src/share/war/routes.js KINDS; sizes from
 * src/render/attackers.js): class, size in metres and heat 0 to 1 (an
 * engine or motors over the airframe's skin). A kind not here is an
 * unknown of a metre.
 */
export const WAR_KINDS = {
  scout: { cls: 'fixed_wing_uav', size: 3.0, heat: 0.9 },
  loiter: { cls: 'loitering_munition', size: 1.2, heat: 0.7 },
  strike: { cls: 'fixed_wing_uav', size: 2.5, heat: 1.0 },
  decoy: { cls: 'fixed_wing_uav', size: 2.5, heat: 1.0 },
  fpv: { cls: 'multirotor', size: 0.25, heat: 0.6 },
  hunter: { cls: 'multirotor', size: 0.25, heat: 0.6 },
  boat: { cls: 'boat', size: 5.0, heat: 1.0 },
  jammer: { cls: 'boat', size: 3.0, heat: 0.5 },
};
const OTHER = { cls: 'unknown', size: 1.0, heat: 0.5 };

/*
 * The bands a sensor mode detects in. day, night: the contrast of a
 * typical target against the sky at full light and at none; noise: the
 * multiplier on every measurement's noise; ext: the air's extinction per
 * kilometre (Koschmieder's 3.9 over a 13 km visibility for EO; long wave
 * IR goes through haze better); res: pixels per radian against the EO
 * sensor's (an uncooled thermal core is 640 by 512 to EO's 1920 by 1080,
 * behind a narrower lens);
 * ground: the contrast kept against ground rather than sky. A thermal
 * band's contrast is further scaled by the object's heat.
 */
const BANDS = {
  eo: { tag: 'EO', day: 0.6, night: 0.03, noise: 1, ext: 0.3, res: 1, ground: 0.55, thermal: false },
  lowlight: { tag: 'EO', day: 0.5, night: 0.3, noise: 1.8, ext: 0.3, res: 0.85, ground: 0.5, thermal: false },
  contrast: { tag: 'EO', day: 0.7, night: 0.04, noise: 1.3, ext: 0.3, res: 1, ground: 0.65, thermal: false },
  ir: { tag: 'IR', day: 0.45, night: 0.9, noise: 1.2, ext: 0.12, res: 0.55, ground: 0.6, thermal: true },
};
/* SensorManager's modes (src/avionics/sensors.js SENSOR_MODES) onto the
 * bands their detector looks through; fusion looks through both and
 * keeps the stronger. */
const MODE_BANDS = {
  eo: [BANDS.eo],
  lowlight: [BANDS.lowlight],
  contrast: [BANDS.contrast],
  'ir_wh': [BANDS.ir],
  'ir_bh': [BANDS.ir],
  fusion: [BANDS.eo, BANDS.ir],
};

export const PERCEPTION_HZ = 15;
/* The EO sensor's rows, a 1080p gimbal camera's: its resolution, not
 * the browser window's. */
const SENSOR_ROWS = 1080;
/* The logistic's centre and width on the signal (pixels at full
 * contrast): half the ticks see an object of DETECT_50. */
const DETECT_50 = 0.8;
const DETECT_W = 0.1;
/* Below this probability nothing is detected at all: the detector's
 * threshold, set over its false alarm rate. */
const DETECT_MIN = 0.01;
/* Up to MOTION_GAIN more signal at MOTION_RAD_S across the picture. */
const MOTION_GAIN = 0.35;
const MOTION_RAD_S = 0.05;
/* Recognition and identification, contrast weighted pixels across. */
const RECOG_LO = 2;
const RECOG_HI = 10;
const IDENT_LO = 8;
const IDENT_HI = 20;
/* Glare: within GLARE_RAD of the sun EO loses up to GLARE_LOSS. */
const GLARE_RAD = 0.35;
const GLARE_LOSS = 0.8;
/* The line of sight's samples against the terrain, none in the last
 * OCC_END_M (the object's own ground), and the tolerance on each. */
const OCC_SAMPLES = 24;
const OCC_END_M = 5;
const OCC_TOL_M = 0.5;
/* How far behind an object its background is read. */
const BACK_M = 400;
/* A class this likely puts its size into the range's interval. */
const PLAUSIBLE = 0.15;
/* Nothing past this is considered: no sensor here resolves it. */
const FAR_M = 25000;
/* The compute model (SIM, FlightTelemetry's CPU): the detector's floor,
 * what each object in the picture and each detection costs. */
const IDLE_LOAD = 0.18;
const LOAD_IN_VIEW = 0.03;
const LOAD_DETECTION = 0.05;

const DAY = { light: 1, sun: null, haze: 1 };

/* An integer hash of four ints to [0, 1); Math.imul and the shifts are
 * exact in every engine. */
function hash01(a, b, c, d) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15) ^ d, 0x165667b1);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* A seeded standard normal, near enough: four uniforms (Irwin-Hall)
 * scaled to unit variance. */
function gauss(a, b, c, d) {
  const s = hash01(a, b, c, d) + hash01(a, b, c, d + 1) + hash01(a, b, c, d + 2) + hash01(a, b, c, d + 3);
  return (s - 2) * 1.7320508075688772;
}

/* v rotated by the unit quaternion q ({ x, y, z, w }), into out. */
function rotate(q, v, out) {
  const tx = 2 * (q.y * v[2] - q.z * v[1]);
  const ty = 2 * (q.z * v[0] - q.x * v[2]);
  const tz = 2 * (q.x * v[1] - q.y * v[0]);
  out[0] = v[0] + q.w * tx + (q.y * tz - q.z * ty);
  out[1] = v[1] + q.w * ty + (q.z * tx - q.x * tz);
  out[2] = v[2] + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}

/* The camera's forward (-z), right (+x) and up (+y) in the world, from
 * its quaternion (a three.js camera's, or any { x, y, z, w }). */
export function cameraAxes(camera, fwd, right, up) {
  const q = camera.quaternion;
  rotate(q, [0, 0, -1], fwd);
  rotate(q, [1, 0, 0], right);
  rotate(q, [0, 1, 0], up);
}

function smooth01(x) {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return u * u * (3 - 2 * u);
}

/* Whether the terrain stands between a and b. */
export function terrainBlocks(heightAt, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len <= OCC_END_M) {
    return false;
  }
  const end = 1 - OCC_END_M / len;
  for (let i = 1; i <= OCC_SAMPLES; i += 1) {
    const t = (end * i) / (OCC_SAMPLES + 1);
    if (heightAt(a[0] + dx * t, a[2] + dz * t) > a[1] + dy * t + OCC_TOL_M) {
      return true;
    }
  }
  return false;
}

/*
 * A perception unit. seed: an integer, the noise's. heightAt(x, z): the
 * terrain's top in render metres, or null for none (nothing is occluded
 * and every background is sky).
 *
 * update(tS, sensor, truth, ownship, env) every flight frame:
 *   tS       the sim clock, s
 *   sensor   SensorManager's state: mode, zoom, fovRad (after zoom),
 *            noise (0 to 1), healthy
 *   truth    roomWar.attackersAt(): [{ id, kind, p: [3] }], render metres
 *   ownship  { p: [3], v: [3], camera } with the camera's quaternion
 *            ({ x, y, z, w }, world, looking down -z) and aspect
 *   env      { light (0 night to 1 day), sun ([3] unit toward the sun, or
 *            null), haze (multiplier on extinction) }, default full day
 * and sets `detections` (this tick's, in object id order):
 *   { tS, losW: [3] unit, sizeRad, hypotheses: [{ cls, p }] (every class,
 *   by p), quality (0 to 1, the detector's score), sensor ('EO', 'IR' or
 *   'FUSION'), rangeM: { lo, hi }, truthKey (opaque; for checks only, the
 *   TrackManager associates by geometry and never reads it) }
 * and `load`, 0 to 1, the compute model.
 */
export function createPerception({ seed = 1, heightAt = null } = {}) {
  const seedI = seed | 0;
  let lastTick = null;
  /* id -> { tick, p }: last tick's positions, for the angular speed. */
  const prev = new Map();
  const fwd = [0, 0, 0];
  const right = [0, 0, 0];
  const up = [0, 0, 0];

  /* The detection of object o this tick, or null. */
  function look(o, tick, view, before) {
    const kind = WAR_KINDS[o.kind] || OTHER;
    const { r, bx, by, bz } = view;
    let onGround = false;
    if (heightAt) {
      /* Ground behind it when the line carried on BACK_M past it meets
       * the terrain, or when it is looked down at. */
      onGround = by < 0 || heightAt(o.p[0] + bx * BACK_M, o.p[2] + bz * BACK_M) > o.p[1] + by * BACK_M;
    }
    let motion = 1;
    let aspect = 1;
    if (before && before.tick === tick - 1) {
      const vx = (o.p[0] - before.p[0]) * PERCEPTION_HZ;
      const vy = (o.p[1] - before.p[1]) * PERCEPTION_HZ;
      const vz = (o.p[2] - before.p[2]) * PERCEPTION_HZ;
      const along = vx * bx + vy * by + vz * bz;
      const v2 = vx * vx + vy * vy + vz * vz;
      const cross = Math.sqrt(Math.max(0, v2 - along * along));
      motion = 1 + MOTION_GAIN * Math.min(1, cross / r / MOTION_RAD_S);
      /* Seen across its flight, all of its shape; nose on, less. */
      aspect = v2 > 1 ? 0.7 + 0.3 * (cross / Math.sqrt(v2)) : 1;
    }
    const { bands, light, haze, sun, rowsPerRad, sNoise, fusion, tS } = view.ctx;
    let band = null;
    let contrast = 0;
    let pxPerRad = 0;
    let signal = 0;
    for (const b of bands) {
      let c = (b.night + (b.day - b.night) * light) * (onGround ? b.ground : 1) * (b.thermal ? kind.heat : 1);
      if (!b.thermal && sun) {
        const cs = bx * sun[0] + by * sun[1] + bz * sun[2];
        const off = Math.acos(Math.max(-1, Math.min(1, cs)));
        if (off < GLARE_RAD) {
          c *= 1 - GLARE_LOSS * light * (1 - off / GLARE_RAD);
        }
      }
      c *= Math.exp((-b.ext * haze * r) / 1000) * (1 - 0.5 * sNoise);
      const ppr = rowsPerRad * b.res;
      /* Under a pixel its contrast is spread over the pixel too. */
      const px = (kind.size / r) * ppr;
      const s = px * Math.min(1, px) * c * motion;
      if (s > signal) {
        band = b;
        contrast = c;
        pxPerRad = ppr;
        signal = s;
      }
    }
    if (!band) {
      return null;
    }
    const pd = 1 / (1 + Math.exp(-(signal - DETECT_50) / DETECT_W));
    if (pd < DETECT_MIN || hash01(seedI, o.id, tick, 1) >= pd) {
      return null;
    }
    const noise = band.noise * (1 + 2 * sNoise);
    const px = (kind.size / r) * pxPerRad;
    /* Measured size: 8 % and a third of a pixel of noise. */
    const pxM = Math.max(0.5, px * (1 + 0.08 * noise * gauss(seedI, o.id, tick, 10)) + 0.33 * noise * gauss(seedI, o.id, tick, 20));
    /* Direction: half a pixel of noise each way. */
    const sig = (0.5 * noise) / pxPerRad;
    const g1 = gauss(seedI, o.id, tick, 30) * sig;
    const g2 = gauss(seedI, o.id, tick, 40) * sig;
    const los = [bx + right[0] * g1 + up[0] * g2, by + right[1] * g1 + up[1] * g2, bz + right[2] * g1 + up[2] * g2];
    const ln = Math.sqrt(los[0] * los[0] + los[1] * los[1] + los[2] * los[2]);
    los[0] /= ln;
    los[1] /= ln;
    los[2] /= ln;
    /* Class: from the prior toward the true row with recognisable pixels,
     * contrast limited, seeded noise on each. */
    const pxC = px * aspect * Math.min(1, contrast / 0.35);
    const q = smooth01((pxC - RECOG_LO) / (RECOG_HI - RECOG_LO));
    const row = CONFUSE[kind.cls];
    const pc = new Array(NC);
    let sum = 0;
    for (let i = 0; i < NC; i += 1) {
      const v = (PRIOR[i] * (1 - q) + row[i] * q) * (1 + 0.25 * noise * gauss(seedI, o.id, tick, 50 + i * 4));
      pc[i] = v > 0.002 ? v : 0.002;
      sum += pc[i];
    }
    let top = 0;
    for (let i = 0; i < NC; i += 1) {
      pc[i] /= sum;
      if (pc[i] > pc[top]) {
        top = i;
      }
    }
    /* Size interval: every plausible named class's and the likeliest
     * named class's. 'unknown' says only that it is none of them, so its
     * own all embracing size counts only when no named class is
     * plausible at all. Once the type is identified (only when the top
     * class is right: a wrong class identifies nothing) the type's own
     * size, -20 % to +25 %. */
    let named = 0;
    for (let i = 1; i < UNKNOWN; i += 1) {
      if (pc[i] > pc[named]) {
        named = i;
      }
    }
    let sLo = Infinity;
    let sHi = 0;
    for (let i = 0; i < UNKNOWN; i += 1) {
      if (pc[i] >= PLAUSIBLE || i === named) {
        const s = CLASS_SIZE[CLASSES[i]];
        sLo = Math.min(sLo, s[0]);
        sHi = Math.max(sHi, s[1]);
      }
    }
    if (top === UNKNOWN && pc[named] < PLAUSIBLE) {
      [sLo, sHi] = CLASS_SIZE.unknown;
    }
    if (CLASSES[top] === kind.cls && top !== UNKNOWN) {
      const id = smooth01((pxC - IDENT_LO) / (IDENT_HI - IDENT_LO));
      sLo += (kind.size * 0.8 - sLo) * id;
      sHi += (kind.size * 1.25 - sHi) * id;
    }
    const err = 0.6 * noise + 0.12 * pxM;
    const thLo = Math.max(0.25, pxM - err) / pxPerRad;
    const thHi = (pxM + err) / pxPerRad;
    return {
      tS,
      losW: los,
      sizeRad: pxM / pxPerRad,
      hypotheses: CLASSES.map((cls, i) => ({ cls, p: pc[i] })).sort((a, b) => b.p - a.p || CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls)),
      quality: Math.min(1, signal / (2 * DETECT_50)) * (0.85 + 0.15 * hash01(seedI, o.id, tick, 2)),
      sensor: fusion ? 'FUSION' : band.tag,
      rangeM: { lo: sLo / thHi, hi: sHi / thLo },
      truthKey: o.id,
    };
  }

  const api = {
    detections: [],
    load: IDLE_LOAD,
    update(tS, sensor, truth, ownship, env = DAY) {
      const tick = Math.floor(tS * PERCEPTION_HZ);
      if (tick === lastTick) {
        return api.detections;
      }
      lastTick = tick;
      /* The same array every tick, written in place. */
      const out = api.detections;
      out.length = 0;
      if (!sensor.healthy) {
        prev.clear();
        api.load = IDLE_LOAD;
        return out;
      }
      const cam = ownship.camera;
      const cp = ownship.p;
      cameraAxes(cam, fwd, right, up);
      const tanY = Math.tan(sensor.fovRad / 2);
      const tanX = tanY * cam.aspect;
      const bands = MODE_BANDS[sensor.mode] || MODE_BANDS.eo;
      const ctx = {
        tS,
        bands,
        fusion: bands.length > 1,
        light: env.light == null ? 1 : Math.max(0, Math.min(1, env.light)),
        haze: env.haze == null ? 1 : env.haze,
        sun: env.sun || null,
        rowsPerRad: SENSOR_ROWS / (sensor.fovRad * Math.sqrt(sensor.zoom || 1)),
        sNoise: sensor.noise || 0,
      };
      const objs = truth.slice().sort((a, b) => a.id - b.id);
      let inView = 0;
      for (const o of objs) {
        const before = prev.get(o.id);
        prev.set(o.id, { tick, p: o.p.slice() });
        const rx = o.p[0] - cp[0];
        const ry = o.p[1] - cp[1];
        const rz = o.p[2] - cp[2];
        const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (r < 1 || r > FAR_M) {
          continue;
        }
        const zc = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
        if (zc <= 0) {
          continue;
        }
        const sx = (rx * right[0] + ry * right[1] + rz * right[2]) / zc / tanX;
        const sy = (rx * up[0] + ry * up[1] + rz * up[2]) / zc / tanY;
        if (sx < -1 || sx > 1 || sy < -1 || sy > 1) {
          continue;
        }
        inView += 1;
        if (heightAt && terrainBlocks(heightAt, cp, o.p)) {
          continue;
        }
        const d = look(o, tick, { r, bx: rx / r, by: ry / r, bz: rz / r, ctx }, before);
        if (d) {
          out.push(d);
        }
      }
      for (const [id, v] of prev) {
        if (v.tick !== tick) {
          prev.delete(id);
        }
      }
      api.load = Math.min(1, IDLE_LOAD + LOAD_IN_VIEW * inView + LOAD_DETECTION * out.length);
      return out;
    },
    reset() {
      lastTick = null;
      prev.clear();
      api.detections.length = 0;
      api.load = IDLE_LOAD;
    },
  };
  return api;
}
