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
 * An EDIT (src/replay/edit.js) is a list of shots, each a rig with its
 * numbers over a stretch of the clip. Where two shots mix, a blend or a
 * glide, the camera is both shots' rigs evaluated NOW, mixed with an ease
 * in and out. Evaluating both at the current time rather than at their own
 * is what makes a push in on a tumbling wing work: two follow shots of the
 * wing, 4 m back and 1 m back, glide into a camera that closes in while it
 * keeps the wing framed.
 *
 * Plain arrays, no Three.js, so a check in Node can hold the maths to its
 * word. Poses are world frame (Three.js axes, y up): pos [x, y, z], quat
 * [x, y, z, w], fov degrees, and a camera looks down its own -z.
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

import { slerp } from './recorder.js';
import { weights } from './edit.js';

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

/* The default numbers of each rig, scaled by the size in metres of what
 * it looks at (a whoop's chase sits closer than a two metre glider's, and
 * the follow camera is sized to the part it follows). */
export function defaults(rig, size = 1) {
  const s = Math.max(0.3, size);
  switch (rig) {
    case 'chase': return { dist: 1.6 * s + 1, height: 0.45 * s + 0.3, fov: 68 };
    case 'orbit': return { az: 0.6, el: 0.35, dist: 1.8 * s + 1.2, fov: 60 };
    case 'free': return { pos: [0, 0, 0], yaw: 0, pitch: 0, fov: 70 };
    case 'tripod': return { pos: [0, 0, 0], fov: 45 };
    case 'fpv': return { fov: 0 };
    case 'follow': return { dist: 2 * s + 0.7, height: 0.5 * s + 0.2, fov: 55 };
    default: throw new Error(`no rig ${rig}`);
  }
}

/*
 * The camera of `rig` with numbers `p` aimed at `target` (-1 the craft, a
 * part index otherwise) on the aircraft of `watch` (0 this pilot's, else a
 * peer's id in the clip) at time t. `ctx` is the clip seen through the
 * scene: ctx.at(t, target, out, watch) the target's world position,
 * ctx.craftQuat(t, out, watch) the craft's attitude, ctx.fpv(t, outPos,
 * outQuat, watch) the onboard lens and its fov.
 */
export function evaluate(ctx, rig, p, target, t, out, watch = 0) {
  const eye = out.pos;
  const at = scratchAt;
  ctx.at(t, target, at, watch);
  out.fov = p.fov;
  switch (rig) {
    case 'chase':
    case 'follow': {
      const before = scratchBefore;
      ctx.at(t - HEADING_S, target, before, watch);
      let dx = at[0] - before[0];
      let dz = at[2] - before[2];
      let dy = at[1] - before[1];
      const v = Math.hypot(dx, dy, dz) / HEADING_S;
      if (v < STILL) {
        /* Still: behind the craft's nose, or a piece seen from the craft. */
        if (target < 0) {
          rotate(ctx.craftQuat(t, scratchQ, watch), FWD, scratchDir);
        } else {
          ctx.at(t, -1, scratchDir, watch);
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
      eye[1] = at[1] + p.height + Math.max(0, -dy / (Math.hypot(dx, dy, dz) || 1)) * p.dist * 0.3;
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
      out.fov = ctx.fpv(t, eye, out.quat, watch);
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

const poseA = createPose();
const poseB = createPose();
const mix = { a: 0, b: 0, w: 0 };

/* The camera of an edit at clip time t: the shot's, or two shots' mixed
 * by the edit's weights (src/replay/edit.js weights), position lerped,
 * attitude slerped, fov lerped. */
export function evaluateEdit(ctx, edit, t, out) {
  const { a, b, w } = weights(edit, t, mix);
  const ca = edit.shots[a].cam;
  if (a === b || w <= 0) {
    return evaluate(ctx, ca.rig, ca.p, ca.target, t, out, ca.watch);
  }
  const cb = edit.shots[b].cam;
  evaluate(ctx, ca.rig, ca.p, ca.target, t, poseA, ca.watch);
  evaluate(ctx, cb.rig, cb.p, cb.target, t, poseB, cb.watch);
  mixPoses(poseA, poseB, w, out);
  return out;
}

function mixPoses(pa, pb, w, out) {
  for (let i = 0; i < 3; i += 1) {
    out.pos[i] = pa.pos[i] + (pb.pos[i] - pa.pos[i]) * w;
  }
  slerp(pa.quat[0], pa.quat[1], pa.quat[2], pa.quat[3],
    pb.quat[0], pb.quat[1], pb.quat[2], pb.quat[3], w, out.quat, 0);
  out.fov = pa.fov + (pb.fov - pa.fov) * w;
}

/* The camera the keys gave at t (the files before edits kept keys):
 * the keys' rigs blended. Null without keys. Nothing plays keys any more;
 * it stays as the reference scripts/edit-selftest.js and
 * scripts/crashcam-selftest.js hold fromKeys to. */
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
  mixPoses(poseA, poseB, w, out);
  return out;
}
