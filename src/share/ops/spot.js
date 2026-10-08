/*
 * spot.js: people noticing a low aircraft (docs/campaign/interior/
 * CONTRACT-SPOTTED.md). Campaign agnostic: a SPOTTER is mission data,
 *
 *   { id, group, stage?, height, range, overR, loud, rise, fall, levels,
 *     warn, lines, scene, scatter }
 *
 * An aircraft is exposed to a person of `group` when lower than `height`
 * over them and nearer than `range`. Each exposed aircraft adds `rise`
 * a second, half that with a crown between (they hear it but cannot see
 * it), twice that when at or over `loud` m/s;
 * with none the value falls by `fall` a second; it stays in [0, 1].
 * `levels` ({ looking, spotted }) are reached at a room ms; `looking`
 * re-arms once the value is back at 0, `spotted` never does.
 *
 * Squares and square roots only, so every engine agrees (CLAUDE.md).
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

import { centreOf, membersOf } from './contacts.js';

/* A spotter's state, new. */
export function spotState() {
  return {
    value: 0, level: 'calm', at: {}, worst: null, advice: null,
  };
}

/* The exposure of one aircraft q ({ p, v } ops frame, v m/s) to the
 * people at `people`: null, or { h, off, loud, seen } for the nearest
 * exposed person (h metres above them, off metres horizontally, seen
 * false when a crown is between), one in plain sight first. */
export function exposure(sp, q, people, world) {
  let best = null;
  for (const at of people) {
    const h = q.p[2] - at[2];
    const off2 = (q.p[0] - at[0]) ** 2 + (q.p[1] - at[1]) ** 2;
    if (h >= sp.height || off2 + h * h > sp.range * sp.range) {
      continue;
    }
    const seen = !world.canopyBlocks(at, q.p);
    const off = Math.sqrt(off2);
    if (!best || (seen && !best.seen) || (seen === best.seen && off < best.off)) {
      best = {
        h: Math.round(Math.max(0, h)), off: Math.round(off), loud: q.v >= sp.loud, seen,
      };
    }
  }
  return best;
}

/* Which advice an exposure earns: the loudest fault first. */
export function adviceOf(sp, e) {
  if (e.loud) {
    return 'loud';
  }
  return e.off <= sp.overR ? 'over' : 'low';
}

/* The spotter after `ms` of room time ending at grid ms t, the aircraft
 * (airborne only) at `qs`. Returns the levels newly reached. */
export function stepSpot(sp, st, t, ms, qs, contacts, world) {
  if (st.at.spotted != null) {
    return [];
  }
  const people = membersOf(contacts, sp.group).filter((c) => c.state !== 'vanished' && t >= c.t0)
    .map((c) => centreOf(c, world, t)).filter(Boolean);
  let dv = 0;
  for (const q of qs) {
    const e = people.length ? exposure(sp, q, people, world) : null;
    if (!e) {
      continue;
    }
    dv += sp.rise * (e.loud ? 2 : 1) * (e.seen ? 1 : 0.5) * (ms / 1000);
    if (!st.worst || e.h < st.worst.h || (e.loud && !st.worst.loud)) {
      st.worst = e;
    }
  }
  if (dv === 0) {
    dv = -sp.fall * (ms / 1000);
  }
  st.value = Math.round(Math.min(1, Math.max(0, st.value + dv)) * 1e6) / 1e6;
  if (st.value === 0 && st.at.looking != null) {
    delete st.at.looking;
    st.level = 'calm';
    st.worst = null;
  }
  const out = [];
  for (const [name, at] of Object.entries(sp.levels).sort((a, b) => a[1] - b[1])) {
    if (st.at[name] == null && st.value >= at) {
      st.at[name] = t;
      st.level = name;
      out.push(name);
    }
  }
  if (out.includes('spotted')) {
    st.advice = adviceOf(sp, st.worst);
  }
  return out;
}
