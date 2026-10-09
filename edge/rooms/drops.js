/*
 * drops.js: a room's paradrops (docs/HERCULES-CONTRACT.md). The room is
 * the authority on which drops exist: it checks each one a pilot sends,
 * numbers it, keeps it in storage for the room's life (a { store } action,
 * restored by host.js after a restart) and tells everybody, and tells a
 * pilot who joins later every drop on the field. It simulates nothing:
 * every client falls a record the same way (src/game/paradrop.js), and the
 * dropper's rest is kept so a late joiner lays it exactly where the others
 * saw it come down. At the cap it refuses; nothing is ever taken away.
 * The storage goes with the room (host.js's purge).
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

import { ROOM_CAP } from '../../src/game/paradrop.js';
import { PRESET_IDS } from '../../src/game/weather.js';

/* The aircraft that drop: the ones with a ramp (configs/airframes.js). */
const DROPPERS = new Set(['hercules3077']);
/* A map is a few km across; a record past this is not from one. */
const FAR = 100000;
/* A load leaves an aircraft no faster than any aircraft here flies. */
const FAST = 200;

const finite3 = (a, lim) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isFinite(v) && Math.abs(v) <= lim);

/* The record as the room keeps it, or null if it is not one. */
export function checkDrop(msg, map) {
  if (!msg || !DROPPERS.has(msg.af) || msg.map !== map) {
    return null;
  }
  if (!Number.isFinite(msg.t) || !Number.isFinite(msg.tp) || msg.t < 0 || msg.tp < 0) {
    return null;
  }
  if (!finite3(msg.p, FAR) || !finite3(msg.v, FAST) || !finite3(msg.rest, FAR) || typeof msg.wet !== 'boolean') {
    return null;
  }
  let air = null;
  if (msg.air !== null) {
    const a = msg.air;
    if (!a || a.map !== map || !PRESET_IDS.includes(a.preset) || !Number.isInteger(a.seed) || a.seed < 0 || a.seed >= 2 ** 32) {
      return null;
    }
    air = { map: a.map, preset: a.preset, seed: a.seed };
  }
  return {
    af: msg.af, map, t: msg.t, tp: msg.tp, p: [...msg.p], v: [...msg.v], air, rest: [...msg.rest], wet: msg.wet,
  };
}

export class RoomDrops {
  constructor() {
    this.list = [];
  }

  restore(saved) {
    this.list = Array.isArray(saved) ? saved : [];
  }

  /* A pilot just seated: every drop on the field, in one message. */
  join(conn) {
    return this.list.length ? [{ send: conn, data: JSON.stringify({ type: 'drops', list: this.list }) }] : [];
  }

  message(core, conn, s, msg) {
    if (this.list.length >= ROOM_CAP) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'drops_full', cap: ROOM_CAP }) }];
    }
    const rec = checkDrop(msg, core.meta.map);
    if (!rec) {
      return [];
    }
    const kept = { id: this.list.length + 1, seat: s.seat, ...rec };
    this.list.push(kept);
    return [
      { store: 'drops', value: this.list },
      ...core.roster(null, JSON.stringify({ type: 'drop', ...kept })),
    ];
  }
}
