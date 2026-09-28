/*
 * cameras.js: where the replay's camera is, at any moment of a clip.
 *
 * A RIG is a way of pointing a camera: chase, orbit, free, tripod, onboard
 * and follow (a part that came off). Each is a pure function of the clip's
 * time and a few numbers (a distance, two angles, a place), so the same
 * rig at the same time is the same picture whether the clip is playing,
 * scrubbed backwards or written to a video. Nothing here keeps state
 * between frames; the chase camera's heading is read from where the target
 * was a moment before, not from a damped value that would depend on the
 * frames drawn before it.
 *
 * A KEYFRAME is a rig with its numbers at a time. Between two keys the
 * camera is both keys' rigs evaluated NOW, blended with an ease in and out.
 * Evaluating both at the current time rather than at their own is what
 * makes a push in on a tumbling wing work: two follow shots of the wing, 4 m
 * back and 1 m back, blend into a camera that closes in while it keeps the
 * wing framed.
 *
 * Plain arrays, no Three.js, so a check in Node can hold the maths to its
 * word. Poses are world frame (Three.js axes, y up): pos [x, y, z], quat
 * [x, y, z, w], fov degrees, and a camera looks down its own -z.
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

import { slerp } from './recorder.js';

export const RIGS = ['chase', 'orbit', 'free', 'tripod', 'fpv', 'follow'];

/* How far back the chase and follow cameras look for a heading, seconds,
 * and the speed under which the target is taken as still, m/s. */
const HEADING_S = 0.35;
const STILL = 0.8;

export function easeInOut(a) {
  if (a <= 0) {
    return 0;
  }
  if (a >= 1) {
    return 1;
  }
  return a < 0.5 ? 4 * a * a * a : 1 - ((-2 * a + 2) ** 3) / 2;
}

/* The quaternion that turns a camera at `eye` to look at `at`, up y. */
export function lookAtQuat(eye, at, out = [0, 0, 0, 1]) {
  let zx = eye[0] - at[0];
  let zy = eye[1] - at[1];
  let zz = eye[2] - at[2];
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-9) {
    zz = 1;
    len = 1;
  }
  zx /= len;
  zy /= len;
  zz /= len;
  /* x = up cross z, with a fallback when looking straight up or down. */
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  let xl = Math.hypot(xx, xy, xz);
  if (xl < 1e-6) {
    xx = 1;
    xy = 0;
    xz = 0;
    xl = 1;
  }
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  /* Rotation matrix columns x, y, z to a quaternion. */
  const m00 = xx; const m01 = yx; const m02 = zx;
  const m10 = xy; const m11 = yy; const m12 = zy;
  const m20 = xz; const m21 = yz; const m22 = zz;
  const tr = m00 + m11 + m22;
  let qx; let qy; let qz; let qw;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  out[0] = qx;
  out[1] = qy;
  out[2] = qz;
  out[3] = qw;
  return out;
}

/* v rotated by quaternion q (x, y, z, w). */
export function rotate(q, v, out = [0, 0, 0]) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  out[0] = ix * w + iw * -x + iy * -z - iz * -y;
  out[1] = iy * w + iw * -y + iz * -x - ix * -z;
  out[2] = iz * w + iw * -z + ix * -y - iy * -x;
  return out;
}

/* Yaw about y, then pitch about the camera's x: the free camera's aim. */
export function yawPitchQuat(yaw, pitch, out = [0, 0, 0, 1]) {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  out[0] = cy * sp;
  out[1] = sy * cp;
  out[2] = -sy * sp;
  out[3] = cy * cp;
  return out;
}

/* The default numbers of each rig, scaled by the aircraft's size in
 * metres (a whoop's chase sits closer than a two metre glider's). */
export function defaults(rig, size = 1) {
  const s = Math.max(0.3, size);
  switch (rig) {
    case 'chase': return { dist: 2.6 * s + 1.2, height: 0.7 * s + 0.4, fov: 70 };
    case 'orbit': return { az: 0.6, el: 0.35, dist: 3 * s + 1.5, fov: 60 };
    case 'free': return { pos: [0, 0, 0], yaw: 0, pitch: 0, fov: 70 };
    case 'tripod': return { pos: [0, 0, 0], fov: 45 };
    case 'fpv': return { fov: 0 };
    case 'follow': return { dist: 2.2 * s + 0.8, height: 0.6 * s + 0.3, fov: 55 };
    default: throw new Error(`no rig ${rig}`);
  }
}

/*
 * The camera of `rig` with numbers `p` aimed at `target` (-1 the craft, a
 * part index otherwise) at time t. `ctx` is the clip seen through the
 * scene: ctx.at(t, target, out) the target's world position,
 * ctx.craftQuat(t, out) the craft's attitude, ctx.fpv(t, outPos, outQuat)
 * the onboard lens and its fov.
 */
export function evaluate(ctx, rig, p, target, t, out) {
  const eye = out.pos;
  const at = scratchAt;
  ctx.at(t, target, at);
  out.fov = p.fov;
  switch (rig) {
    case 'chase':
    case 'follow': {
      const before = scratchBefore;
      ctx.at(t - HEADING_S, target, before);
      let dx = at[0] - before[0];
      let dz = at[2] - before[2];
      let dy = at[1] - before[1];
      const v = Math.hypot(dx, dy, dz) / HEADING_S;
      if (v < STILL) {
        /* Still: behind the craft's nose, or a piece seen from the craft. */
        if (target < 0) {
          rotate(ctx.craftQuat(t, scratchQ), FWD, scratchDir);
        } else {
          ctx.at(t, -1, scratchDir);
          scratchDir[0] = at[0] - scratchDir[0];
          scratchDir[1] = 0;
          scratchDir[2] = at[2] - scratchDir[2];
        }
        dx = scratchDir[0];
        dy = 0;
        dz = scratchDir[2];
      }
      const hl = Math.hypot(dx, dz) || 1;
      /* Level the heading; a dive is followed from behind and above, not
       * from under the tail. */
      eye[0] = at[0] - (dx / hl) * p.dist;
      eye[1] = at[1] + p.height + Math.max(0, -dy / (Math.hypot(dx, dy, dz) || 1)) * p.dist * 0.5;
      eye[2] = at[2] - (dz / hl) * p.dist;
      lookAtQuat(eye, at, out.quat);
      break;
    }
    case 'orbit': {
      const ce = Math.cos(p.el);
      eye[0] = at[0] + p.dist * ce * Math.sin(p.az);
      eye[1] = at[1] + p.dist * Math.sin(p.el);
      eye[2] = at[2] + p.dist * ce * Math.cos(p.az);
      lookAtQuat(eye, at, out.quat);
      break;
    }
    case 'free':
      eye[0] = p.pos[0];
      eye[1] = p.pos[1];
      eye[2] = p.pos[2];
      yawPitchQuat(p.yaw, p.pitch, out.quat);
      break;
    case 'tripod':
      eye[0] = p.pos[0];
      eye[1] = p.pos[1];
      eye[2] = p.pos[2];
      lookAtQuat(eye, at, out.quat);
      break;
    case 'fpv':
      out.fov = ctx.fpv(t, eye, out.quat);
      break;
    default:
      throw new Error(`no rig ${rig}`);
  }
  return out;
}

const FWD = [0, 0, -1];
const scratchAt = [0, 0, 0];
const scratchBefore = [0, 0, 0];
const scratchDir = [0, 0, 0];
const scratchQ = [0, 0, 0, 1];

export function createPose() {
  return { pos: [0, 0, 0], quat: [0, 0, 0, 1], fov: 60 };
}

/* A key: { t, rig, target, p }. Kept sorted by t. */
export function addKey(keys, key) {
  const same = keys.findIndex((k) => Math.abs(k.t - key.t) < 1e-3);
  if (same >= 0) {
    keys[same] = key;
  } else {
    keys.push(key);
    keys.sort((a, b) => a.t - b.t);
  }
  return keys;
}

const poseA = createPose();
const poseB = createPose();

/* The directed camera at t: the keys' rigs blended. Null without keys. */
export function evaluateKeys(ctx, keys, t, out) {
  if (!keys.length) {
    return null;
  }
  let k = 0;
  while (k + 1 < keys.length && keys[k + 1].t <= t) {
    k += 1;
  }
  const a = keys[k];
  if (t <= a.t || k + 1 >= keys.length) {
    return evaluate(ctx, a.rig, a.p, a.target, t, out);
  }
  const b = keys[k + 1];
  const w = easeInOut((t - a.t) / (b.t - a.t));
  evaluate(ctx, a.rig, a.p, a.target, t, poseA);
  evaluate(ctx, b.rig, b.p, b.target, t, poseB);
  for (let i = 0; i < 3; i += 1) {
    out.pos[i] = poseA.pos[i] + (poseB.pos[i] - poseA.pos[i]) * w;
  }
  slerp(poseA.quat[0], poseA.quat[1], poseA.quat[2], poseA.quat[3],
    poseB.quat[0], poseB.quat[1], poseB.quat[2], poseB.quat[3], w, out.quat, 0);
  out.fov = poseA.fov + (poseB.fov - poseA.fov) * w;
  return out;
}
