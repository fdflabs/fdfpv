/*
 * peerscene.js: the other pilots in a replay, drawn.
 *
 * A clip's peers (src/replay/peers.js) are drawn with the models a room
 * draws them with (src/render/peers.js buildPeerCraft, in their own paint
 * and parts, the map's look put on them), their wrecks cut by the room's
 * wreck rig (src/share/roomwrecks.js createPeerWreck) and their pilots
 * standing where they stood. Every one is built when the replay opens, so
 * a pilot joining half way through the clip is not a shader compile half
 * way through the picture.
 *
 * Kinematic: each frame puts each one where the sample says the screen
 * had it. Nothing is simulated, so any speed, a scrub back and a jump are
 * all the same thing: a pose. Only the two things with a history of their
 * own are rebuilt on a jump: a wreck (its pieces only ever leave) is made
 * whole and cut again when the pieces out go down or its table changes,
 * and a smoke trail is flown again from the rows before, the way the
 * replay's own craft does it (src/replay/crashcam.js smokeTo).
 *
 * Catch the Ace's bubble, when the clip has one, is the live one's mesh
 * (src/render/acebubble.js) put where the row says it was drawn, as big
 * and as bright.
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

import * as THREE from 'three';
import { buildPeerCraft, buildPilotFigure } from '../render/peers.js';
import { createAceBubble } from '../render/acebubble.js';
import { createPeerWreck } from '../share/roomwrecks.js';
import { LIFE_S as SMOKE_LIFE_S } from '../render/smoke.js';
import { PARTS_MAX } from '../../configs/parts.js';
import {
  PEER, PEER_N, PIECE_N, bubbleAt, createPeerSample, samplePeers,
} from './peers.js';

/*
 * `peers` is a clip's, `time` its clock and `n` its rows; `parent` the
 * scene; `look` the map's look for a model (host.craftLook) or null.
 */
export function createPeerScene(peers, time, n, parent, look) {
  const sample = createPeerSample(peers.slots);
  const drawn = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  const nozzle = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const bubble = peers.bubble ? createAceBubble() : null;
  const bubbleNow = {
    r: 0, x: 0, y: 0, z: 0, level: 0, seat: 0,
  };
  const aceNow = new THREE.Vector3();
  if (bubble) {
    parent.add(bubble.mesh);
  }

  /* One per id, in `who` order: id i + 1 is entries[i]. */
  const entries = peers.who.map((w) => {
    const rig = buildPeerCraft(w.profile, look);
    rig.setLabel(w.label);
    rig.group.visible = false;
    parent.add(rig.group);
    if (rig.smoke) {
      parent.add(rig.smoke);
    }
    let figure = null;
    if (w.figure) {
      figure = buildPilotFigure(w.profile.figure);
      figure.setLabel(w.label);
      figure.group.position.set(w.figure.at[0], w.figure.at[1], w.figure.at[2]);
      figure.group.rotation.y = w.figure.yaw;
      figure.group.visible = false;
      parent.add(figure.group);
    }
    return {
      label: w.label, rig, figure, wreck: null, table: -1, out: 0, seen: false, fed: false,
      /* The moving parts, as buildPeerCraft reads a room's sample. */
      p: { flags: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, vx: 0, vy: 0, vz: 0 },
    };
  });

  function wreckFor(e, table, count, pieces, o) {
    if (table !== e.table || count < e.out) {
      if (e.wreck) {
        e.wreck.clear();
      }
      if (table >= 0) {
        if (!e.wreck) {
          e.wreck = createPeerWreck(e.rig.group, e.rig.discs);
          parent.add(e.wreck.group);
        }
        e.wreck.crash(peers.tables[table]);
      }
      e.table = table;
    }
    e.out = count;
    if (e.wreck) {
      e.wreck.group.visible = table >= 0;
    }
    if (table >= 0) {
      e.rig.group.updateMatrixWorld(true);
      e.wreck.place(pieces, o, count, PIECE_N);
    }
  }

  /*
   * Everyone at clip rows k, k + 1 and `a` between (recorder.js locate).
   * spinK turns the props (0 held); labels shows the name tags; `inside`
   * is the id the camera rides in (onboard), whose model is hidden.
   */
  function pose(k, a, spinK, labels, inside) {
    samplePeers(peers, n, k, a, sample);
    if (bubble) {
      const b = bubbleAt(peers.bubble, n, k, a, bubbleNow);
      const k1 = Math.min(k + 1, n - 1);
      bubble.set(b.r, b.x, b.y, b.z, b.level, b.seat, time[k] + (time[k1] - time[k]) * a);
    }
    for (const e of entries) {
      e.seen = false;
    }
    for (let s = 0; s < peers.slots; s += 1) {
      const id = sample.id[s];
      const e = id ? entries[id - 1] : null;
      if (!e) {
        continue;
      }
      e.seen = true;
      const r = sample.row;
      const w = s * PEER_N;
      drawn.px = r[w + PEER.pos];
      drawn.py = r[w + PEER.pos + 1];
      drawn.pz = r[w + PEER.pos + 2];
      drawn.qx = r[w + PEER.quat];
      drawn.qy = r[w + PEER.quat + 1];
      drawn.qz = r[w + PEER.quat + 2];
      drawn.qw = r[w + PEER.quat + 3];
      const p = e.p;
      p.flags = r[w + PEER.flags];
      p.c0 = r[w + PEER.ctl];
      p.c1 = r[w + PEER.ctl + 1];
      p.c2 = r[w + PEER.ctl + 2];
      p.c3 = r[w + PEER.ctl + 3];
      p.motor = r[w + PEER.motor];
      p.flaps = r[w + PEER.flaps];
      p.vx = r[w + PEER.vel];
      p.vy = r[w + PEER.vel + 1];
      p.vz = r[w + PEER.vel + 2];
      e.rig.replay(drawn, p, spinK, r[w + PEER.gear]);
      e.rig.group.visible = id !== inside;
      e.rig.setLabel(labels ? e.label : '');
      wreckFor(e, r[w + PEER.table], sample.count[s], sample.pieces, s * PARTS_MAX * PIECE_N);
      if (e.figure) {
        e.figure.group.visible = true;
        e.figure.setLabel(labels ? e.label : '');
        e.figure.lookAt(drawn.px, drawn.py, drawn.pz);
      }
    }
    for (const e of entries) {
      if (e.seen) {
        continue;
      }
      e.rig.group.visible = false;
      if (e.figure) {
        e.figure.group.visible = false;
      }
      if (e.wreck) {
        e.wreck.group.visible = false;
      }
    }
  }

  /* One puff of each trail at clip time t from row k of the clip. */
  function feedRow(k, t, viewH, fov) {
    for (let s = 0; s < peers.slots; s += 1) {
      const o = (k * peers.slots + s) * PEER_N;
      const id = peers.cols[o + PEER.id];
      const e = id ? entries[id - 1] : null;
      if (!e || !e.rig.trail) {
        continue;
      }
      feed(e, t, peers.cols, o, viewH, fov);
    }
  }

  function feed(e, t, col, o, viewH, fov) {
    const on = col[o + PEER.smoke] !== 0;
    if (on) {
      nozzle.set(col[o + PEER.nozzle], col[o + PEER.nozzle + 1], col[o + PEER.nozzle + 2]);
      vel.set(col[o + PEER.vel], col[o + PEER.vel + 1], col[o + PEER.vel + 2]);
    }
    e.rig.trail.update(t, on ? nozzle : null, vel, viewH, fov);
  }

  /*
   * The trails from clip time `from` to `to`, after pose() at `to`:
   * played forward, one puff each; anywhere else, each trail cleared and
   * flown again over the rows in its life before `to`.
   */
  function smokeTo(from, to, viewH, fov) {
    const forward = to >= from && to - from < 0.25;
    if (!forward) {
      for (const e of entries) {
        if (e.rig.trail) {
          e.rig.trail.clear();
        }
      }
      for (let k = 0; k < n; k += 1) {
        if (time[k] >= to - SMOKE_LIFE_S && time[k] < to) {
          feedRow(k, time[k], viewH, fov);
        }
      }
    }
    for (const e of entries) {
      e.fed = false;
    }
    for (let s = 0; s < peers.slots; s += 1) {
      const id = sample.id[s];
      const e = id ? entries[id - 1] : null;
      if (e && e.rig.trail) {
        feed(e, to, sample.row, s * PEER_N, viewH, fov);
        e.fed = true;
      }
    }
    /* A trail whose aircraft is not drawn now still drifts and fades. */
    for (const e of entries) {
      if (e.rig.trail && !e.fed) {
        e.rig.trail.update(to, null, vel, viewH, fov);
      }
    }
  }

  function dispose() {
    if (bubble) {
      bubble.dispose();
    }
    for (const e of entries) {
      if (e.wreck) {
        e.wreck.dispose();
      }
      e.rig.dispose();
      if (e.figure) {
        e.figure.dispose();
      }
    }
  }

  return {
    pose,
    smokeTo,
    /* The peers as pose() last sampled them (src/replay/sound.js
     * peerVoicesAt hears them from it). */
    sample: () => sample,
    dispose,
    /* Where the Ace's bubble is drawn this frame, the new Ace a crown
     * flies to (src/replay/paperscene.js), or null: none, or the free
     * orb. */
    aceAt: () => (bubble && bubbleNow.r > 0 && bubbleNow.seat !== 0 ? aceNow.set(bubbleNow.x, bubbleNow.y, bubbleNow.z) : null),
    /* For the harness: each drawn peer's seat, label and position, and its
     * wreck's pieces, as this frame drew them. */
    summary: () => entries.map((e, i) => ({
      id: i + 1,
      seat: peers.who[i].seat,
      label: e.label,
      drawn: e.rig.group.visible,
      at: e.rig.group.position.toArray(),
      quat: e.rig.group.quaternion.toArray(),
      wreck: e.wreck && e.wreck.group.visible ? e.wreck.summary() : [],
      puffs: e.rig.trail ? e.rig.trail.live() : 0,
    })),
    /* The ids the editor can put the camera on, and their names. */
    list: () => entries.map((e, i) => ({ id: i + 1, seat: peers.who[i].seat, label: e.label })),
  };
}
