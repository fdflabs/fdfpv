/*
 * wrecks.js: a room's shared wrecks (docs/MULTIPLAYER-PLAN.md section 6.5,
 * Phase 2). The room relays; it simulates nothing. Each pilot's own plant
 * breaks their own aircraft, and they tell the room: a crash event with
 * their part table, then PARTS frames of the pieces' world poses at 10 Hz
 * until they rest, then a clear when they start again. The room passes
 * each on to the others and keeps the newest crash and PARTS per seat, in
 * the seat's attachment, so a pilot who joins while a wreck lies on the
 * field sees it there, and a hibernation does not lose it. A whack on a
 * jelly piece is passed on and kept nowhere.
 *
 * Each function takes the RoomCore and returns core actions (see core.js).
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

import {
  CRASH_EVENT_MAX_BYTES, checkCrashTable, checkWhack, isParts, relayParts,
} from '../../src/share/roomwire.js';

/* The owner sends at 10 Hz; a little over, and the rest are dropped. */
export const PARTS_PER_S = 15;

function bump(counter, now) {
  if (now - counter.since >= 1000) {
    counter.since = now;
    counter.n = 0;
  }
  counter.n += 1;
  return counter.n;
}

export function onCrash(core, conn, s, msg) {
  if (msg.clear === true) {
    s.wreck = null;
    return [
      { attach: conn, value: core.attachmentOf(s) },
      ...core.others(conn, JSON.stringify({ type: 'event', kind: 'crash', seat: s.seat, clear: true })),
    ];
  }
  const table = checkCrashTable(msg.table);
  if (!table) {
    return [];
  }
  const text = JSON.stringify({ type: 'event', kind: 'crash', seat: s.seat, table });
  if (text.length > CRASH_EVENT_MAX_BYTES) {
    return [];
  }
  s.wreck = { crash: text, parts: null };
  return [{ attach: conn, value: core.attachmentOf(s) }, ...core.others(conn, text)];
}

export function onWhack(core, conn, s, msg) {
  const w = checkWhack(msg);
  return w ? core.others(conn, JSON.stringify({ type: 'event', kind: 'whack', seat: s.seat, ...w })) : [];
}

/* A PARTS frame: kept as the wreck's newest and passed on. Only after a
 * crash: a frame with no table to cut by is nothing to a receiver. */
export function onParts(core, conn, s, data, now) {
  if (!isParts(data) || !s.wreck) {
    return [];
  }
  s.partsRate ??= { since: now, n: 0 };
  if (bump(s.partsRate, now) > PARTS_PER_S) {
    return [];
  }
  const relayed = relayParts(s.seat, data);
  s.wreck.parts = relayed;
  return [{ attach: conn, value: core.attachmentOf(s) }, ...core.others(conn, relayed)];
}

/* For a pilot just seated: every wreck on the field, as it lies. */
export function wrecksFor(core, conn) {
  const out = [];
  for (const [other, s] of core.seats) {
    if (other === conn || !s.wreck) {
      continue;
    }
    out.push({ send: conn, data: s.wreck.crash });
    if (s.wreck.parts) {
      out.push({ send: conn, data: s.wreck.parts });
    }
  }
  return out;
}
