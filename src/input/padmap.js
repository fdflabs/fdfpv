/*
 * padmap.js: how a joystick's raw axes become the four flight channels.
 *
 * A map names, for each channel, the axis it lives on and the raw values
 * that mean its ends. Centred channels (roll, pitch, yaw) carry a centre
 * plus the raw value for +1 and for -1, so a lopsided gimbal still reaches
 * both stops; maps saved by old builds carry `full`, the signed distance
 * from centre to +1, instead. The throttle carries the raw value for zero
 * (`low`) and for full (`high`), either way round. A map may also carry
 * `select`, an axis standing in for a button on a radio with none, and
 * `reverse`, the pilot's per-channel flips from the check step.
 *
 * Until a pilot calibrates, a built-in map is chosen from what the device
 * says it is: the W3C standard layout for a gamepad that reports one, the
 * ExpressLRS Bluetooth joystick's own report order for that radio, and
 * otherwise AETR, the order a transmitter in USB joystick mode sends.
 *
 * Channels follow sim_abi.h: roll +1 right, pitch +1 nose up (stick pulled
 * back), yaw +1 nose right, throttle 0 to 1.
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

import { stickChannels } from './stickmode.js';
import { profileFor } from './padprofiles.js';

export const FLIGHT_CHANNELS = ['roll', 'pitch', 'yaw', 'throttle'];

/* Below this a centred channel reads exactly zero, so a gimbal resting a
 * hair off its calibrated centre does not creep. */
const DEADBAND = 0.012;

const centred = (axis, full) => ({ axis, center: 0, full });
const throttleOn = (axis, low, high) => ({ axis, low, high });

/* A transmitter in USB joystick mode: channels one to four on axes 0 to 3
 * in AETR order, throttle parked at -1. */
export const AETR_MAP = {
  roll: centred(0, 1),
  pitch: centred(1, -1),
  yaw: centred(3, 1),
  throttle: throttleOn(2, -1, 1),
};

/* The same kind of radio over Bluetooth (ExpressLRS BLE joystick) reports
 * by HID usage: X, Y, then an aux switch, then Rx and Ry. Measured on a
 * RadioMaster Pocket, 2026-10-05: right, forward and up all positive. */
const ELRS_BLE_MAP = {
  roll: centred(0, 1),
  pitch: centred(1, -1),
  yaw: centred(4, 1),
  throttle: throttleOn(3, -1, 1),
};

/* W3C standard gamepad: left stick on axes 0 and 1, right on 2 and 3,
 * right and down positive. */
const STANDARD_AXES = { left: [0, 1], right: [2, 3] };

/*
 * A standard gamepad flown in the pilot's stick mode. Pulling a stick back
 * is the positive end, which is +pitch. A throttle on a stick that springs
 * to its middle runs from the bottom (+1) to the top (-1), so it rests at
 * half.
 */
export function standardPadMap(mode) {
  const layout = stickChannels(mode);
  const map = {};
  for (const side of ['left', 'right']) {
    const [h, v] = STANDARD_AXES[side];
    const { horiz, vert } = layout[side];
    map[horiz] = centred(h, 1);
    map[vert] = vert === 'throttle' ? throttleOn(v, 1, -1) : centred(v, 1);
  }
  return map;
}

/*
 * Which built-in layout a device vouches for: the stick mode for a
 * standard gamepad, a name for a recognised radio, 0 when AETR is only a
 * guess. Truthy means known; a change means the map has to be rebuilt.
 * Which devices are known is padprofiles.js.
 */
export function builtInKind(gp, mode) {
  const profile = profileFor(gp);
  if (!profile.vouched) {
    return 0;
  }
  return profile.key === 'standard' ? mode : profile.key;
}

export function builtInMap(gp, mode) {
  const kind = builtInKind(gp, mode);
  if (!kind) {
    return AETR_MAP;
  }
  return kind === 'elrs-bluetooth' ? ELRS_BLE_MAP : standardPadMap(mode);
}

/* All four flips, as booleans, whatever came in. */
export function reversals(src) {
  const out = {};
  for (const ch of FLIGHT_CHANNELS) {
    out[ch] = Boolean(src && src[ch]);
  }
  return out;
}

/*
 * A map in its one canonical shape, sharing nothing with its source: every
 * channel present (an absent one as an empty spec), `select` a copy or
 * null, `reverse` complete, `stored` a boolean. This is also the shape
 * written to storage.
 */
export function normaliseMap(src) {
  const out = {};
  for (const ch of FLIGHT_CHANNELS) {
    out[ch] = { ...src[ch] };
  }
  out.select = src.select ? { ...src.select } : null;
  out.reverse = reversals(src.reverse);
  out.stored = Boolean(src.stored);
  return out;
}

/*
 * A raw reading on a centred channel's axis, as -1..1 before clamping.
 * Each side of centre is scaled by its own end, so the two halves of an
 * asymmetric gimbal both reach a full stop.
 */
export function centredReading(raw, spec) {
  const c = spec.center;
  const plus = spec.pos != null ? spec.pos : c + (spec.full || 1);
  const minus = spec.neg != null ? spec.neg : c - (plus - c);
  const above = raw >= c;
  /* The end on the side the reading is on, and whether it is the + end. */
  const plusHere = above ? plus > c : plus < c;
  const end = plusHere ? plus : minus;
  const travel = above ? raw - c : c - raw;
  const span = (above ? end - c : c - end) || 1;
  return (plusHere ? 1 : -1) * travel / span;
}

/*
 * The four channels a map reads off a set of axes. An axis the device does
 * not have reads 0. Reversal is applied last; a centred zero stays +0,
 * because the poll compares samples with !== and -0 would read as a change
 * on every poll.
 */
export function readSticks(axes, map) {
  const raw = (i) => (i < axes.length ? axes[i] : 0);
  const known = (spec) => Boolean(spec) && Number.isInteger(spec.axis);
  const flips = map.reverse || {};
  const channel = (ch) => {
    const spec = map[ch];
    if (!known(spec)) {
      return 0;
    }
    const v = Math.max(-1, Math.min(1, centredReading(raw(spec.axis), spec)));
    if (Math.abs(v) < DEADBAND) {
      return 0;
    }
    return flips[ch] ? -v : v;
  };
  let throttle = 0;
  const t = map.throttle;
  if (known(t)) {
    const share = (raw(t.axis) - t.low) / ((t.high - t.low) || 1);
    throttle = Math.max(0, Math.min(1, share));
  }
  return {
    roll: channel('roll'),
    pitch: channel('pitch'),
    yaw: channel('yaw'),
    throttle: flips.throttle ? 1 - throttle : throttle,
  };
}
