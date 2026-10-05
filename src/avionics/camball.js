/*
 * camball.js: the camera ball (docs/campaign/interior/TECH-NEEDS.md N14),
 * a stabilised gimbal under an aircraft's nose that a pilot slews, zooms
 * and locks on a point of the ground while the aircraft flies round it.
 *
 * WHAT IT IS, AS NUMBERS. A ball looks along `dir`, a unit vector in the
 * ops frame (src/render/frame.js's document frame: x east, y north, z up,
 * metres), from the aircraft's own position, with no roll: its picture's
 * right is dir x z, its up is right x dir. That is exactly the camera
 * src/share/ops/sight.js assumes when the room judges what a pilot saw,
 * so the room's judgement and the pilot's picture are the same geometry
 * (the `camera:lock` check holds them together). Its field is `tanHalf`,
 * the tangent of half the horizontal field, the contract's own number:
 * the optical zoom narrows the lens (more of the scene's real pixels
 * across the frame), the sensor's digital zoom crops on top of it.
 *
 * FREE, a ball holds its pan (from the aircraft's heading, clockwise seen
 * from above) and its tilt (from the horizon, negative down), so it turns
 * with the aircraft's heading and holds the horizon level through a bank,
 * as a stabilised ball does. LOCKED, it looks at a point and holds it
 * whatever the aircraft does; slewing a locked ball moves the point along
 * the ground (point track). The ball does not know the three.js frame: the
 * shell turns its basis into a camera through frame.js.
 *
 * Nothing here reaches the plant, and nothing reads frame time into
 * physics: the ball moves on whatever dt the shell hands it, which is the
 * picture's clock.
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

import { docPosToThree } from '../render/frame.js';

const DEG = Math.PI / 180;

/*
 * The balls aircraft carry, by airframe id: the lens's horizontal field at
 * 1x (rad), its optical zoom range, the gimbal's tilt limits (rad from the
 * horizon) and its slew. A turret like the Bramor C4EYE's: a 1080p day
 * camera behind a 16x lens (the lead's call, 2026-10-05: at 8x the 2 m
 * mark of Mission 1 grades only poor from the camp's standoff, ROOM's
 * measurement). The digital zoom of src/avionics/sensors.js
 * (1, 2, 4) multiplies on top, a crop, honest about its pixels.
 */
export const CAMERA_BALLS = Object.freeze({
  bramor2300: Object.freeze({
    hfov: 50 * DEG,
    zoom: [1, 16],
    tilt: [-90 * DEG, 15 * DEG],
    /* rad/s at full stick at 1x; narrower fields slew slower, in step
     * with the field, so a full stick crosses about a frame a second. */
    slew: 60 * DEG,
    /* Optical zoom: the factor per second at full stick (x2 a second). */
    zoomRate: 2,
  }),
});

/* The ball an airframe carries, or null. */
export function ballFor(airframeId) {
  return CAMERA_BALLS[airframeId] ?? null;
}

/* Where the axis is taken to meet nothing: a ball looking at the sky or
 * past the map's edge reports a point this far along its axis
 * (CONTRACT-P0.md gives no rule for it; noted in the PR). */
export const FAR_M = 20000;

/* The ground search: the step is this share of the height over the
 * ground, so it is safe on slopes up to about 60 degrees, and never
 * shorter than MIN_STEP_M. */
const MARCH_K = 0.5;
const MIN_STEP_M = 1;
const MARCH_MAX = 400;

const wrap = (a) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) {
    x -= 2 * Math.PI;
  } else if (x < -Math.PI) {
    x += 2 * Math.PI;
  }
  return x;
};

/* The bearing of a horizontal direction, clockwise from north (+y). */
export function bearingOf(x, y) {
  return Math.atan2(x, y);
}

/* A unit direction from a bearing and a tilt. */
export function dirOf(bearing, tilt, out = [0, 0, 0]) {
  const c = Math.cos(tilt);
  out[0] = c * Math.sin(bearing);
  out[1] = c * Math.cos(bearing);
  out[2] = Math.sin(tilt);
  return out;
}

/*
 * The picture's basis for a direction, as sight.js builds it: right = dir
 * x z (normalised, east when dir is vertical), up = right x dir. Columns
 * of the camera's rotation in the ops frame are [right, up, -dir].
 */
export function basisOf(dir, out = { right: [0, 0, 0], up: [0, 0, 0] }) {
  let rx = dir[1];
  let ry = -dir[0];
  let rn = Math.sqrt(rx * rx + ry * ry);
  if (rn < 1e-9) {
    rx = 1;
    ry = 0;
    rn = 1;
  }
  rx /= rn;
  ry /= rn;
  out.right[0] = rx;
  out.right[1] = ry;
  out.right[2] = 0;
  out.up[0] = ry * dir[2];
  out.up[1] = -rx * dir[2];
  out.up[2] = rx * dir[1] - ry * dir[0];
  return out;
}

/*
 * The ball as a three.js camera, through frame.js (the one conversion):
 * { position: [x, y, z], quaternion: [x, y, z, w], fov (vertical, degrees,
 * three.js's own unit) } for a picture of `aspect` (width over height)
 * whose horizontal half field has tangent `tanHalf`. The camera looks down
 * its -z with right and up from basisOf, so its picture is sight.js's.
 */
export function threeCameraOf(p, dir, tanHalf, aspect) {
  const b = basisOf(dir);
  const v = { set(x, y, z) { this.v = [x, y, z]; return this; } };
  const col = (d) => docPosToThree(d[0], d[1], d[2], v).v;
  const x = col(b.right);
  const y = col(b.up);
  const z = col([-dir[0], -dir[1], -dir[2]]);
  /* Rotation matrix (columns x, y, z) to a quaternion, Shepperd's way. */
  const m00 = x[0]; const m01 = y[0]; const m02 = z[0];
  const m10 = x[1]; const m11 = y[1]; const m12 = z[1];
  const m20 = x[2]; const m21 = y[2]; const m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return {
    position: col(p),
    quaternion: q,
    fov: (2 * Math.atan(tanHalf / aspect) * 180) / Math.PI,
  };
}

/*
 * Where a ray from p along dir first meets the ground, heightAt(x, y) the
 * ground's z there, or null when it meets nothing within FAR_M.
 */
export function groundHit(p, dir, heightAt) {
  let s = 0;
  let above = p[2] - heightAt(p[0], p[1]);
  if (!(above > 0)) {
    return null;
  }
  let prev = 0;
  for (let i = 0; i < MARCH_MAX && s < FAR_M; i += 1) {
    prev = s;
    s += Math.max(MIN_STEP_M, above * MARCH_K);
    const x = p[0] + dir[0] * s;
    const y = p[1] + dir[1] * s;
    above = p[2] + dir[2] * s - heightAt(x, y);
    if (above <= 0) {
      /* Bisect the last step down to a decimetre. */
      let lo = prev;
      let hi = s;
      while (hi - lo > 0.1) {
        const mid = (lo + hi) / 2;
        const zx = p[0] + dir[0] * mid;
        const zy = p[1] + dir[1] * mid;
        if (p[2] + dir[2] * mid - heightAt(zx, zy) > 0) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return [p[0] + dir[0] * hi, p[1] + dir[1] * hi, p[2] + dir[2] * hi];
    }
  }
  return null;
}

/*
 * One ball. spec: a CAMERA_BALLS entry. step() moves it; its state is the
 * pilot's (pan, tilt, zoom, lock) and what it looks at (dir, aim, hit).
 */
export function createBall(spec) {
  if (!spec) {
    throw new Error('camball: no ball spec');
  }
  const state = {
    /* rad from the aircraft's heading, clockwise; rad from the horizon. */
    pan: 0,
    tilt: -30 * DEG,
    /* Optical zoom, spec.zoom[0] to spec.zoom[1]. */
    zoom: spec.zoom[0],
    /* The locked point (ops frame) or null; `track` the contact id the
     * shell moves it with, or null for a fixed point of the ground. */
    lock: null,
    track: null,
    dir: [0, 0, -1],
    /* The ground under the axis, or null: the lock point when locked. */
    hit: null,
    /* What the room is told the axis is on (CONTRACT-P0.md 3 `cam`). */
    aim: [0, 0, 0],
    /* Bearing of the axis (clockwise from north), for the HUD. */
    bearing: 0,
    /* The axis's angular rate the last step, rad/s: what smears a still. */
    rate: 0,
  };
  const prevDir = [0, 0, -1];
  let fresh = true;

  /* tan of half the lens's horizontal field now, before any crop. */
  const lensTan = () => Math.tan(spec.hfov / 2) / state.zoom;

  const api = {
    spec,
    state,
    lensTan,
    /* The picture's tanHalf: the lens's, cropped by the sensor's digital
     * zoom (and its stabilisation margin, 1 while a ball flies). */
    tanHalf(digital = 1) {
      return lensTan() / digital;
    },
    /*
     * One step. dt seconds; input { pan, tilt, zoom } each -1 to 1 (pan +
     * right, tilt + up, zoom + in), and optionally panRad, tiltRad (rad
     * moved outright this step, a mouse dragging the picture) and zoomBy
     * (a factor this step, a wheel); craft { p: [x, y, z] ops frame,
     * heading: rad clockwise from north }; heightAt(x, y) the ground's z.
     */
    step(dt, input, craft, heightAt) {
      const k = Math.max(0, dt);
      /* A full stick crosses about the same share of the frame at every
       * zoom: the slew scales with the field. */
      const slew = spec.slew / state.zoom;
      const zin = Math.max(-1, Math.min(1, input.zoom || 0));
      state.zoom = Math.min(spec.zoom[1], Math.max(spec.zoom[0], state.zoom * spec.zoomRate ** (zin * k) * (input.zoomBy || 1)));
      const dp = Math.max(-1, Math.min(1, input.pan || 0)) * slew * k + (input.panRad || 0);
      const dtl = Math.max(-1, Math.min(1, input.tilt || 0)) * slew * k + (input.tiltRad || 0);
      if (state.lock) {
        /* Point track: the stick moves the point along the ground, the
         * distance it subtends at the slew's angle. */
        const v = [state.lock[0] - craft.p[0], state.lock[1] - craft.p[1], state.lock[2] - craft.p[2]];
        const range = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if ((dp || dtl) && range > 1) {
          const b = basisOf([v[0] / range, v[1] / range, v[2] / range]);
          /* Forward along the ground, away from the aircraft. */
          const fx = v[0];
          const fy = v[1];
          const fn = Math.sqrt(fx * fx + fy * fy) || 1;
          const nx = state.lock[0] + b.right[0] * dp * range + (fx / fn) * dtl * range;
          const ny = state.lock[1] + b.right[1] * dp * range + (fy / fn) * dtl * range;
          state.lock = [nx, ny, heightAt(nx, ny)];
          state.track = null;
        }
        const d = [state.lock[0] - craft.p[0], state.lock[1] - craft.p[1], state.lock[2] - craft.p[2]];
        const n = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
        if (n > 1e-6) {
          state.dir[0] = d[0] / n;
          state.dir[1] = d[1] / n;
          state.dir[2] = d[2] / n;
        }
        state.bearing = bearingOf(state.dir[0], state.dir[1]);
        state.pan = wrap(state.bearing - craft.heading);
        state.tilt = Math.asin(Math.max(-1, Math.min(1, state.dir[2])));
        state.hit = state.lock.slice();
        state.aim = state.lock.slice();
      } else {
        state.pan = wrap(state.pan + dp);
        state.tilt = Math.min(spec.tilt[1], Math.max(spec.tilt[0], state.tilt + dtl));
        state.bearing = wrap(craft.heading + state.pan);
        dirOf(state.bearing, state.tilt, state.dir);
        state.hit = groundHit(craft.p, state.dir, heightAt);
        state.aim = state.hit ? state.hit.slice() : craft.p.map((c, i) => c + state.dir[i] * FAR_M);
      }
      if (!fresh && k > 0) {
        const dot = prevDir[0] * state.dir[0] + prevDir[1] * state.dir[1] + prevDir[2] * state.dir[2];
        state.rate = Math.acos(Math.max(-1, Math.min(1, dot))) / k;
      } else {
        state.rate = 0;
      }
      fresh = false;
      prevDir[0] = state.dir[0];
      prevDir[1] = state.dir[1];
      prevDir[2] = state.dir[2];
      return state;
    },
    /* Lock where the axis meets the ground now; false when it meets none. */
    lockHere() {
      if (!state.hit) {
        return false;
      }
      state.lock = state.hit.slice();
      state.track = null;
      return true;
    },
    /* Lock on a point the shell moves (a contact's centre): `id` names it. */
    lockOn(point, id = null) {
      state.lock = point.slice();
      state.track = id;
    },
    /* The shell's new place for a tracked point. */
    moveLock(point) {
      if (state.lock) {
        state.lock = point.slice();
      }
    },
    unlock() {
      state.lock = null;
      state.track = null;
    },
    /* Back to the stowed pose: ahead and down, unlocked, the widest lens. */
    reset() {
      state.pan = 0;
      state.tilt = -30 * DEG;
      state.zoom = spec.zoom[0];
      api.unlock();
      fresh = true;
    },
  };
  return api;
}
