/*
 * sound.js: what a flight sounded like, in the crash cam's recording.
 *
 * The owner: "all sounds all audio all things need to come through". A
 * replay already plays its own motors and wind, its crash cues, the
 * SCHWINGs, the coins and a war's explosions (src/replay/crashcam.js,
 * paperscene.js). This keeps the rest, as the smallest inputs the sound
 * can be made again from on the replay's own clock:
 *
 * PER ROW, the engine's air (src/render/audio.js updateEngine `air`): the
 * airflow in the body frame (u, v, w, m/s), the current (A), and whether
 * the flaps' servos and the retracts' motor are running, so the wind, the
 * prop wash and the gear's whine are the flight's. AIR_N floats a row.
 *
 * BESIDE THE ROWS, on the recorder's clock, each call the shell made on
 * its sound that no row holds (CALLS): an impact, a prop strike, a
 * mechanism (a gear leg locking, the catapult, the parachute), a cue (a
 * takeoff, a landing, a gate), each of Crest Control's lines with its
 * language, and the two beds: the war's music (`bed`) and the flight's
 * own (`music`), each as what is playing and how far into it, written
 * when that changes (a new record, a seek, a stop). A bed is a state, not
 * a moment, so the clip's first row gets the one playing then, its
 * position carried on to the clip's start, however long before the
 * window it began.
 *
 * The other pilots' motors and the attackers are not kept here: the
 * rows of src/replay/peers.js and src/replay/warrec.js already say where
 * each was and how fast its motors turned (peerVoicesAt below).
 *
 * MEMORY. Nothing until the first row: then AIR_N floats a row for the
 * recorder's CAPACITY rows (86 KB), and the calls of the window, at most
 * EVENTS_MAX (a call is some tens of bytes of JSON in a file).
 *
 * Pure: no DOM, no audio, no clock.
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

import { PEER, PEER_N } from './peers.js';
import { FLAG_CRASHED, FLAG_QUAD } from '../share/roomwire.js';

/* Per row, floats: the engine's air. flaps and gear are 1 while moving. */
export const AIR = {
  u: 0, v: 1, w: 2, amps: 3, flaps: 4, gear: 5,
};
export const AIR_N = 6;
/* The calls a clip may hold in its window. */
export const EVENTS_MAX = 2000;
/* A bed further than this from where it should have got to was moved
 * (a seek, a resume after a pause): a new call. Seconds. */
export const BED_SLIP_S = 1;
/* A replayed pilot's id in the mix (updatePeers): clear of every live
 * seat, so a replay's pilot never takes a live one's voice and engine. */
export const PEER_ID_BASE = 1000;
/* What a wire rotor speed (rad/s) is in the mix's rpm. */
export const RPM_PER_RAD_S = 60 / (2 * Math.PI);

/*
 * Each call and its arguments: 'n' a finite number, 'n?' one or null,
 * 's' a short string. The replay makes the same call on the shell's
 * audio (src/render/audio.js) with them; radio is Crest Control's line
 * (id, language), bed and music a bed's (id, '' for none; seconds in).
 */
export const CALLS = {
  impact: ['n', 'n', 'n'],
  propStrike: ['n', 'n'],
  mechanical: ['s'],
  event: ['s', 'n?'],
  radio: ['s', 's'],
  bed: ['s', 'n'],
  music: ['s', 'n'],
};
/* The calls that are a state rather than a moment. */
export const BEDS = ['bed', 'music'];
const STRING_MAX = 64;
const BED_HISTORY = 16;

function argsOk(call, args) {
  const want = CALLS[call];
  if (!want || !Array.isArray(args) || args.length !== want.length) {
    return false;
  }
  return want.every((k, i) => {
    const v = args[i];
    if (k === 's') {
      return typeof v === 'string' && v.length <= STRING_MAX;
    }
    if (k === 'n?' && v === null) {
      return true;
    }
    return typeof v === 'number' && Number.isFinite(v);
  });
}

export function createSoundRing(capacity) {
  let air = null;
  let row = -1;
  /* The window's calls, oldest first, { t, call, args }. */
  const events = [];
  /* Each bed's newest calls, kept whatever the window (its state at a
   * clip's start may be older than the window), BED_HISTORY at most. */
  const beds = new Map();
  const stats = { refused: 0, dropped: 0 };

  function begin(i) {
    row = i;
    if (i >= 0 && air) {
      air.fill(0, i * AIR_N, (i + 1) * AIR_N);
    }
  }

  /* This frame's air (update()'s), into the row begun. */
  function airRow(a) {
    if (row < 0 || !a) {
      return;
    }
    if (!air) {
      air = new Float32Array(capacity * AIR_N);
    }
    const o = row * AIR_N;
    air[o + AIR.u] = a.u;
    air[o + AIR.v] = a.v;
    air[o + AIR.w] = a.w;
    air[o + AIR.amps] = a.amps;
    air[o + AIR.flaps] = a.flapsMoving ? 1 : 0;
    air[o + AIR.gear] = a.gearMoving ? 1 : 0;
  }

  /*
   * A call at recorder time t. A bed's is kept only when it changes: its
   * id, or a position other than the one it would have got to. A call
   * that is not one (an unknown kind, a value that is not a number) is
   * counted and not kept, so a file is never refused for it.
   */
  function call(t, name, args) {
    if (!argsOk(name, args)) {
      stats.refused += 1;
      return;
    }
    if (BEDS.includes(name)) {
      const list = beds.get(name) || [];
      const was = list[list.length - 1];
      const [id, at] = args;
      if (was && was.args[0] === id && (id === '' || Math.abs(was.args[1] + (t - was.t) - at) < BED_SLIP_S)) {
        return;
      }
      list.push({ t, call: name, args: [id, at] });
      if (list.length > BED_HISTORY) {
        list.shift();
      }
      beds.set(name, list);
    }
    if (events.length >= EVENTS_MAX) {
      events.shift();
      stats.dropped += 1;
    }
    events.push({ t, call: name, args: args.slice() });
  }

  function prune(now, windowS) {
    const cutoff = now - windowS - 2;
    while (events.length && events[0].t < cutoff) {
      events.shift();
    }
  }

  /* A take over's drop: nothing later than t. */
  function dropAfter(t) {
    while (events.length && events[events.length - 1].t > t) {
      events.pop();
    }
    for (const list of beds.values()) {
      while (list.length && list[list.length - 1].t > t) {
        list.pop();
      }
    }
  }

  function clear() {
    row = -1;
    events.length = 0;
    beds.clear();
    if (air) {
      air.fill(0);
    }
  }

  /*
   * The rows the recorder cut, `n` from ring index `first`, the first at
   * recorder time t0 and the last at t1, as a clip's sound: { air
   * (f32[n x AIR_N]), events (clip clock, each bed's state at 0 first) },
   * or null when nothing was kept.
   */
  function clip(first, n, t0, t1) {
    const out = [];
    for (const [name, list] of beds) {
      /* The bed playing at t0: the newest call at or before it. */
      const at = [...list].reverse().find((e) => e.t <= t0);
      if (at) {
        const [id, s] = at.args;
        out.push({ t: 0, call: name, args: [id, id === '' ? 0 : s + (t0 - at.t)] });
      }
    }
    for (const e of events) {
      if (e.t > t0 && e.t <= t1) {
        out.push({ t: e.t - t0, call: e.call, args: e.args.slice() });
      }
    }
    if (!air && !out.length) {
      return null;
    }
    const a = new Float32Array(n * AIR_N);
    if (air) {
      for (let k = 0; k < n; k += 1) {
        const i = (first + k) % capacity;
        a.set(air.subarray(i * AIR_N, (i + 1) * AIR_N), k * AIR_N);
      }
    }
    return { air: a, events: out };
  }

  return {
    begin,
    air: airRow,
    call,
    prune,
    dropAfter,
    clear,
    clip,
    stats,
    bytes: () => (air ? air.byteLength : 0),
  };
}

/* Rows [a, b] of a clip's sound, the clip's clock starting at time t0
 * (the first kept row's), as trimClip cuts the rest. */
export function trimSound(sound, a, b, t0, t1) {
  const kept = [];
  for (const name of BEDS) {
    const s = bedAt(sound.events, name, t0);
    if (s) {
      kept.push({ t: 0, call: name, args: [s.id, s.at] });
    }
  }
  for (const e of sound.events) {
    if (e.t > t0 && e.t <= t1) {
      kept.push({ t: e.t - t0, call: e.call, args: e.args.slice() });
    }
  }
  return { air: sound.air.slice(a * AIR_N, (b + 1) * AIR_N), events: kept };
}

/* A clip's sound checked, as the file's reader needs it. Throws. */
export function checkSound(sound, n) {
  if (!(sound.air instanceof Float32Array) || sound.air.length !== n * AIR_N) {
    throw new Error('the sound\'s air is not the clip\'s length');
  }
  for (let i = 0; i < sound.air.length; i += 1) {
    if (!Number.isFinite(sound.air[i])) {
      throw new Error('the sound\'s air holds a value that is not a number');
    }
  }
  if (!Array.isArray(sound.events) || sound.events.length > EVENTS_MAX + BEDS.length) {
    throw new Error('the sound\'s calls are not a list');
  }
  let t = 0;
  for (const e of sound.events) {
    const keys = e && typeof e === 'object' ? Object.keys(e) : [];
    if (keys.length !== 3 || !['t', 'call', 'args'].every((k) => keys.includes(k)) || !Number.isFinite(e.t) || e.t < t
      || !argsOk(e.call, e.args)) {
      throw new Error('a sound call is not one');
    }
    t = e.t;
  }
}

/* The bed `name` at clip time t: { id, at (seconds into it), since (clip
 * time of its call) }, or null when none was playing. */
export function bedAt(events, name, t) {
  let last = null;
  for (const e of events) {
    if (e.t > t) {
      break;
    }
    if (e.call === name) {
      last = e;
    }
  }
  if (!last || last.args[0] === '') {
    return null;
  }
  return { id: last.args[0], at: last.args[1] + (t - last.t), since: last.t };
}

/* The moments played forward over (from, to]: every call but the beds'. */
export function callsBetween(events, from, to) {
  return events.filter((e) => e.t > from && e.t <= to && !BEDS.includes(e.call));
}

/* The air between rows k and k + 1, `a` of the way, into out (update()'s
 * air object); the servos' and retracts' on or off as the earlier row's. */
export function airAt(sound, n, k, a, out) {
  const k1 = Math.min(n - 1, k + 1);
  const A = sound.air;
  const o0 = k * AIR_N;
  const o1 = k1 * AIR_N;
  const lerp = (i) => A[o0 + i] + (A[o1 + i] - A[o0 + i]) * a;
  out.u = lerp(AIR.u);
  out.v = lerp(AIR.v);
  out.w = lerp(AIR.w);
  out.amps = lerp(AIR.amps);
  out.flapsMoving = A[o0 + AIR.flaps] !== 0;
  out.gearMoving = A[o0 + AIR.gear] !== 0;
  return out;
}

/*
 * The other pilots as the mix hears them (src/render/audio.js
 * updatePeers), from a peer sample (src/replay/peers.js samplePeers) of a
 * clip whose peers are `peers`: each drawn and not crashed, where it was
 * drawn, its motors as its pose said, scaled by `speed` (the replay's
 * clip seconds a second, so slow motion is a lower note, as the craft's
 * own motors are) and its velocity. `out` is reused: [{ id, airframe,
 * rpm, x, y, z, vx, vy, vz }].
 */
export function peerVoicesAt(peers, s, speed, out) {
  out.length = 0;
  for (let slot = 0; slot < s.slots; slot += 1) {
    const id = s.id[slot];
    if (!id) {
      continue;
    }
    const w = slot * PEER_N;
    const r = s.row;
    const flags = r[w + PEER.flags];
    if (flags & FLAG_CRASHED) {
      continue;
    }
    const who = peers.who[id - 1];
    const quad = (flags & FLAG_QUAD) !== 0;
    const k = RPM_PER_RAD_S * speed;
    out.push({
      id: PEER_ID_BASE + id,
      airframe: who ? who.profile.airframe : null,
      rpm: [
        (quad ? r[w + PEER.ctl] : r[w + PEER.motor]) * k,
        quad ? r[w + PEER.ctl + 1] * k : 0,
        quad ? r[w + PEER.ctl + 2] * k : 0,
        quad ? r[w + PEER.ctl + 3] * k : 0,
      ],
      x: r[w + PEER.pos],
      y: r[w + PEER.pos + 1],
      z: r[w + PEER.pos + 2],
      vx: r[w + PEER.vel] * speed,
      vy: r[w + PEER.vel + 1] * speed,
      vz: r[w + PEER.vel + 2] * speed,
    });
  }
  return out;
}
