/*
 * sticks.js: what the pilot's sticks said, in the crash cam's recording.
 *
 * The owner, 2026-10-12, of a replay he saved: "the behavior it had versus
 * what my sticks were showing was kind of strange". A clip held the
 * throttle and nothing else from the sticks, so nobody could check. This
 * keeps them, a row for each of the recorder's rows (src/replay/
 * recorder.js), so a replay draws the same two gimbals the flight overlay
 * does, moving with the airplane, and a clip can be handed over as a
 * control recording (src/share/controlrec.js, docs/CONTROL-RECORDER.md).
 *
 * PER ROW, two columns:
 *
 * ch, i16[n x STICK_N]: roll, pitch and yaw (-1..1) and the throttle
 * (0..1) as the shell's input channels held them that frame (what the
 * overlay's gimbals draw), each times STICK_SCALE; the flight mode, an
 * index into MODES (the OSD's own words: an airplane's AS3X, stabilised
 * or manual, a quad's angle, acro or turtle); and the flap switch's notch
 * (0 up, 1 half, 2 full; -1 on an aircraft without flaps). Sixteen bits
 * is finer than the radio's eleven and the 1.2 % deadband by far.
 *
 * body, f32[n x BODY_N]: the plant's velocity (world, m/s) and body
 * rates (rad/s), state block slots 4..6 and 11..13 (sim_abi.h), which the
 * recorder's plant column does not keep and which a stick is read
 * against.
 *
 * MEMORY. 36 bytes a row: at the recorder's CAPACITY rows, 130 KB, made
 * on the first row. A 30 s clip at 120 Hz grows by the same 130 KB, about
 * a tenth of what a solo clip already is.
 *
 * NOT A RE-RUN. These rows cannot fly the plant again to give the same
 * flight: they hold one sample of the sticks a drawn frame, where the
 * plant took them on the 250 Hz RC grid over 1 ms steps, and of the
 * plant's state only its pose, velocity and rates, not the controller's,
 * the wind's or the motors'. What does fly a clip again is the journal's
 * region and calls, which a clip saved since file version 17 carries
 * beside these (src/replay/refly.js, npm run replay:refly). See
 * docs/CONTROL-RECORDER.md.
 *
 * Pure: no DOM, no clock.
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

import { COLUMNS } from '../share/controlrec.js';
import { PLANT_N, POSE, POSE_N } from './recorder.js';

export const STICK = {
  roll: 0, pitch: 1, yaw: 2, throttle: 3, mode: 4, flaps: 5,
};
export const STICK_N = 6;
export const STICK_SCALE = 32767;
export const BODY = { vel: 0, rate: 3 };
export const BODY_N = 6;
/* The flight modes a row may name, by index. Appended to, never
 * reordered: a saved clip names them by number. */
export const MODES = ['acro', 'angle', 'manual', 'stab', 'as3x', 'turtle'];
export const FLAPS_NONE = -1;
export const FLAPS_MAX = 2;
export const ROW_BYTES = STICK_N * 2 + BODY_N * 4;

/* State block slots (sim_abi.h). */
const ST_VEL = 4;
const ST_RATE = 11;

const quant = (v, lo) => Math.round(Math.min(1, Math.max(lo, v)) * STICK_SCALE);

export function createSticksRing(capacity) {
  let ch = null;
  let body = null;
  let ok = null;
  let row = -1;

  function begin(i) {
    row = i;
    if (i >= 0 && ok) {
      ok[i] = 0;
    }
  }

  /* This frame's sticks into the row begun: `input` the shell's channels
   * ({ roll, pitch, yaw, throttle }), `mode` a MODES name, `flaps` the
   * notch or FLAPS_NONE, `st` the plant's state block. A mode this file
   * does not know is a programming error: it would be saved as another. */
  function write(input, mode, flaps, st) {
    if (row < 0) {
      return;
    }
    const m = MODES.indexOf(mode);
    if (m < 0) {
      throw new Error(`sticks: unknown flight mode ${mode}`);
    }
    if (!ok) {
      ch = new Int16Array(capacity * STICK_N);
      body = new Float32Array(capacity * BODY_N);
      ok = new Uint8Array(capacity);
    }
    const o = row * STICK_N;
    ch[o + STICK.roll] = quant(input.roll, -1);
    ch[o + STICK.pitch] = quant(input.pitch, -1);
    ch[o + STICK.yaw] = quant(input.yaw, -1);
    ch[o + STICK.throttle] = quant(input.throttle, 0);
    ch[o + STICK.mode] = m;
    ch[o + STICK.flaps] = flaps;
    const b = row * BODY_N;
    for (let k = 0; k < 3; k += 1) {
      body[b + BODY.vel + k] = st[ST_VEL + k];
      body[b + BODY.rate + k] = st[ST_RATE + k];
    }
    ok[row] = 1;
  }

  function clear() {
    row = -1;
    if (ok) {
      ok.fill(0);
    }
  }

  /* The rows the recorder cut, `n` from ring index `first`, as a clip's
   * sticks { ch, body }, or null unless every one of them was written: a
   * row without its sticks would otherwise play as centred sticks. */
  function clip(first, n) {
    if (!ok || n < 1) {
      return null;
    }
    const c = new Int16Array(n * STICK_N);
    const b = new Float32Array(n * BODY_N);
    for (let k = 0; k < n; k += 1) {
      const i = (first + k) % capacity;
      if (!ok[i]) {
        return null;
      }
      c.set(ch.subarray(i * STICK_N, (i + 1) * STICK_N), k * STICK_N);
      b.set(body.subarray(i * BODY_N, (i + 1) * BODY_N), k * BODY_N);
    }
    return { ch: c, body: b };
  }

  return {
    begin, write, clear, clip, bytes: () => (ok ? capacity * (ROW_BYTES + 1) : 0),
  };
}

/* Rows [a, b] of a clip's sticks, as trimClip cuts the rest. */
export function trimSticks(sticks, a, b) {
  return { ch: sticks.ch.slice(a * STICK_N, (b + 1) * STICK_N), body: sticks.body.slice(a * BODY_N, (b + 1) * BODY_N) };
}

/* A clip's sticks checked, as the file's reader needs them. Throws. */
export function checkSticks(sticks, n) {
  if (!(sticks.ch instanceof Int16Array) || sticks.ch.length !== n * STICK_N) {
    throw new Error('the sticks are not the clip\'s length');
  }
  if (!(sticks.body instanceof Float32Array) || sticks.body.length !== n * BODY_N) {
    throw new Error('the sticks\' body rates are not the clip\'s length');
  }
  for (let k = 0; k < n; k += 1) {
    const o = k * STICK_N;
    const c = sticks.ch;
    if (c[o + STICK.roll] < -STICK_SCALE || c[o + STICK.pitch] < -STICK_SCALE || c[o + STICK.yaw] < -STICK_SCALE
      || c[o + STICK.throttle] < 0 || c[o + STICK.mode] < 0 || c[o + STICK.mode] >= MODES.length
      || c[o + STICK.flaps] < FLAPS_NONE || c[o + STICK.flaps] > FLAPS_MAX) {
      throw new Error(`frame ${k} has sticks that are not sticks`);
    }
  }
  for (let i = 0; i < sticks.body.length; i += 1) {
    if (!Number.isFinite(sticks.body[i])) {
      throw new Error('the sticks\' body rates hold a value that is not a number');
    }
  }
}

/* The sticks between rows k and k + 1, `a` of the way, into out ({ roll,
 * pitch, yaw, throttle, mode, flaps }): the four channels between the
 * two, the mode and the flaps as the earlier row's. */
export function sticksAt(sticks, n, k, a, out) {
  const k1 = Math.min(n - 1, k + 1);
  const c = sticks.ch;
  const o0 = k * STICK_N;
  const o1 = k1 * STICK_N;
  const lerp = (i) => (c[o0 + i] + (c[o1 + i] - c[o0 + i]) * a) / STICK_SCALE;
  out.roll = lerp(STICK.roll);
  out.pitch = lerp(STICK.pitch);
  out.yaw = lerp(STICK.yaw);
  out.throttle = lerp(STICK.throttle);
  out.mode = MODES[c[o0 + STICK.mode]];
  out.flaps = c[o0 + STICK.flaps];
  return out;
}

/*
 * A clip with sticks as control recording rows (src/share/controlrec.js
 * COLUMNS), one a recorder row. t_s is the clip's clock (the plant's time
 * where it ran on, so it only goes forward), frame the row's index; the
 * sticks, the surfaces (the pose's, sim_plane_surfaces' order), the
 * plant's position and attitude, and the velocity and rates kept here.
 * The frame's wall clock, its step count and when the stick was read are
 * not in a clip: those cells are NaN, written empty.
 */
export function controlRows(clip) {
  if (!clip.sticks) {
    throw new Error('this clip was saved without its sticks');
  }
  const C = Object.fromEntries(COLUMNS.map((name, i) => [name, i]));
  const rows = [];
  const s = clip.sticks;
  for (let k = 0; k < clip.n; k += 1) {
    const r = new Array(COLUMNS.length).fill(NaN);
    const c = k * STICK_N;
    const b = k * BODY_N;
    const p = k * POSE_N;
    const l = k * PLANT_N;
    r[C.t_s] = clip.time[k];
    r[C.frame] = k;
    r[C.roll] = s.ch[c + STICK.roll] / STICK_SCALE;
    r[C.pitch] = s.ch[c + STICK.pitch] / STICK_SCALE;
    r[C.yaw] = s.ch[c + STICK.yaw] / STICK_SCALE;
    r[C.throttle] = s.ch[c + STICK.throttle] / STICK_SCALE;
    r[C.ail_l] = clip.pose[p + POSE.surf];
    r[C.ail_r] = clip.pose[p + POSE.surf + 1];
    r[C.elev] = clip.pose[p + POSE.surf + 2];
    r[C.rud] = clip.pose[p + POSE.surf + 3];
    r[C.x] = clip.plant[l];
    r[C.y] = clip.plant[l + 1];
    r[C.z] = clip.plant[l + 2];
    r[C.qw] = clip.plant[l + 3];
    r[C.qx] = clip.plant[l + 4];
    r[C.qy] = clip.plant[l + 5];
    r[C.qz] = clip.plant[l + 6];
    r[C.vx] = s.body[b + BODY.vel];
    r[C.vy] = s.body[b + BODY.vel + 1];
    r[C.vz] = s.body[b + BODY.vel + 2];
    r[C.p] = s.body[b + BODY.rate];
    r[C.q] = s.body[b + BODY.rate + 1];
    r[C.r] = s.body[b + BODY.rate + 2];
    rows.push(r);
  }
  return rows;
}

