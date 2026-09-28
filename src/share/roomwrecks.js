/*
 * roomwrecks.js: wrecks shared in a room of friends (Phase 2 of
 * docs/MULTIPLAYER-PLAN.md, section 6.5; the room's side is
 * edge/rooms/wrecks.js, the wire is roomwire.js's Phase 2 block).
 *
 * THE SENDER. Each pilot's own plant breaks their own aircraft, and their
 * own wreck rig (src/render/wreck.js) cuts it into pieces and draws them.
 * When the first piece leaves, the room is told once, with the part table
 * the rig cuts by (a receiver's plant holds only its own airframe's); then
 * the pieces' world poses, as drawn, go out at PARTS_HZ while any of them
 * moves, and stop once they lie still, so the last frame sent is where they
 * rest. When the pilot starts again the room is told to clear it.
 *
 * THE RECEIVER. A peer's wreck is a wreck rig of its own, cutting the
 * peer's drawn aircraft by the table that came with the crash and drawing
 * each piece that has left at the pose its owner sent, eased over the 100
 * ms between frames. Nothing is simulated here: a piece is where its owner
 * says, so both screens show it in the same place.
 *
 * Render only on both sides. The sender reads its rig and its plant's
 * table; nothing is written to any plant.
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

import { createWreck } from '../render/wreck.js';
import { PART_KINDS, PART_STATE_DOUBLES, PARTS_MAX, STATE } from '../../configs/parts.js';
import { encodeParts } from './roomwire.js';

export const PARTS_HZ = 10;
const EASE_MS = 1000 / PARTS_HZ;
/* A piece that moved less than this since the last frame sent is still. */
const STILL_M = 0.003;
const STILL_DOT = 0.99999;

/* The part table as the wire carries it (roomwire.js checkCrashTable). */
export function wireTable(table) {
  return table.map((p) => ({
    kind: p.kind,
    parent: p.parent,
    cg: p.cg.map((x) => Math.round(x * 1e4) / 1e4),
    boxMin: p.boxMin.map((x) => Math.round(x * 1e4) / 1e4),
    boxMax: p.boxMax.map((x) => Math.round(x * 1e4) / 1e4),
  }));
}

function moved(a, b) {
  if (!a || !b || a.length !== b.length) {
    return true;
  }
  for (let k = 0; k < a.length; k += 1) {
    const p = a[k];
    const q = b[k];
    if (p.part !== q.part || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > STILL_M
      || Math.abs(p.qx * q.qx + p.qy * q.qy + p.qz * q.qz + p.qw * q.qw) < STILL_DOT) {
      return true;
    }
  }
  return false;
}

/*
 * The sender. link is the room link (src/share/rooms.js), rig the pilot's
 * own wreck rig, table() the plant's part table now. frame() once a frame.
 */
export function createWreckSender(link, rig, table) {
  let announced = null; /* the crash event, while a wreck is out */
  let last = null;      /* the pieces last sent */
  let lastBytes = null;
  let nextAt = 0;

  function frame(roomNowMs, wallMs) {
    const out = rig.pieceCount() > 0 ? rig.poses() : [];
    if (!announced) {
      if (!out.length) {
        return;
      }
      announced = { kind: 'crash', table: wireTable(table()) };
      link.sendEvent(announced);
      last = null;
      nextAt = 0;
    }
    if (rig.pieceCount() === 0) {
      announced = null;
      last = null;
      lastBytes = null;
      link.sendEvent({ kind: 'crash', clear: true });
      return;
    }
    if (wallMs < nextAt || roomNowMs == null) {
      return;
    }
    nextAt = wallMs + 1000 / PARTS_HZ;
    if (!moved(out, last)) {
      return;
    }
    last = out;
    lastBytes = encodeParts(roomNowMs, out);
    link.sendBinary(lastBytes);
  }

  /* After a reconnect the room has a new seat record: tell it again. */
  function resend() {
    if (announced) {
      link.sendEvent(announced);
      if (lastBytes) {
        link.sendBinary(lastBytes);
      }
    }
  }

  return { frame, resend, active: () => Boolean(announced) };
}

/*
 * A peer's wreck. craftGroup is the peer's drawn aircraft (it is cut, and
 * given back whole on clear), discs its blur discs. The rig's group goes
 * into the scene beside the peer.
 */
export function createPeerWreck(craftGroup, discs) {
  const rig = createWreck();
  const parts = new Float64Array(PARTS_MAX * PART_STATE_DOUBLES);
  /* Only the free pieces are ever drawn, so the craft's own plant pose,
   * which the rig uses for pieces still on it, is never read for one. */
  const craftState = new Float64Array(16);
  craftState[7] = 1;
  const eased = new Map(); /* part -> { from, to, at } */
  let table = null;

  /* The received pose is already the world's: the plant slots carry it. */
  const toWorld = (px, py, pz, qw, qx, qy, qz, outPos, outQuat) => {
    outPos.set(px, py, pz);
    outQuat.set(qx, qy, qz, qw);
  };

  function crash(wire) {
    table = wire.map((p, index) => ({ ...p, index, kindName: PART_KINDS[p.kind] ?? 'part' }));
    rig.attach(craftGroup, table, discs);
    eased.clear();
    parts.fill(0);
  }

  function pieces(list, wallMs) {
    if (!table) {
      return;
    }
    for (const p of list) {
      if (p.part < 1 || p.part >= table.length) {
        continue;
      }
      const e = eased.get(p.part);
      const from = e ? current(e, wallMs) : p;
      eased.set(p.part, { from, to: p, at: wallMs });
    }
  }

  function current(e, wallMs) {
    const u = Math.min(1, Math.max(0, (wallMs - e.at) / EASE_MS));
    const a = e.from;
    const b = e.to;
    const s = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
    let qx = a.qx + (b.qx * s - a.qx) * u;
    let qy = a.qy + (b.qy * s - a.qy) * u;
    let qz = a.qz + (b.qz * s - a.qz) * u;
    let qw = a.qw + (b.qw * s - a.qw) * u;
    const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
    qx /= n;
    qy /= n;
    qz /= n;
    qw /= n;
    return { part: b.part, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, qx, qy, qz, qw };
  }

  function clear() {
    rig.reset();
    table = null;
    eased.clear();
  }

  /* Once a frame, after the peer's aircraft is posed. */
  function update(wallMs) {
    if (!table || !eased.size) {
      return 0;
    }
    parts.fill(0);
    for (let i = 0; i < table.length; i += 1) {
      const o = i * PART_STATE_DOUBLES;
      parts[o + STATE.kind] = table[i].kind;
      parts[o + STATE.body] = -1;
    }
    for (const [i, e] of eased) {
      const p = current(e, wallMs);
      const o = i * PART_STATE_DOUBLES;
      parts[o + STATE.status] = 1;
      parts[o + STATE.pos] = p.x;
      parts[o + STATE.pos + 1] = p.y;
      parts[o + STATE.pos + 2] = p.z;
      parts[o + STATE.quat] = p.qw;
      parts[o + STATE.quat + 1] = p.qx;
      parts[o + STATE.quat + 2] = p.qy;
      parts[o + STATE.quat + 3] = p.qz;
    }
    return rig.update(parts, table.length, craftState, toWorld, null);
  }

  return {
    group: rig.group,
    crash,
    pieces,
    clear,
    update,
    active: () => Boolean(table),
    summary: () => rig.summary(),
    dispose() {
      clear();
      rig.group.removeFromParent();
    },
  };
}
