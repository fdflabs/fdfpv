/*
 * warscene.js: a war's attackers in a replay, drawn.
 *
 * A clip's war (src/replay/warrec.js) is drawn by an attackers layer of
 * the replay's own (src/render/attackers.js, one InstancedMesh a kind, as
 * live), each frame at the room ms the live frame drew: the scripted ones
 * where routes.js puts them then, the hunters where they were drawn.
 * Their deaths, the warheads and the targets hit are the explosions the
 * clip keeps on its map's clock (warrec.js boomsAt, since version 14,
 * whatever the pilot was doing; before that the paper's events held the
 * ones drawn in flight, src/replay/paperscene.js): thrown as the playhead
 * passes them and heard from where they went off, thrown at their age
 * after a jump. The war's markers and HUD are the flight screen's and
 * are not drawn over a replay, as no other game's HUD is.
 *
 * The map as the war had it at that room ms (the targets burning, the
 * lights out: warrec.js worldAt) is worked out here each frame and handed
 * to the shell to draw (src/replay/crashcam.js drawWar), which draws the
 * live war's again when the replay closes.
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

import { createAttackers } from '../render/attackers.js';
import { createExplosions } from '../render/explosion.js';
import { boomsAt, warAt, worldAt } from './warrec.js';

/* `war` is a clip's, `n` its rows; `parent` the scene; `audio` the
 * shell's and `worldBoom` the world's voice (src/main.js), for the
 * explosions' sound. */
export function createWarScene(war, n, parent, { audio = null, worldBoom = null } = {}) {
  const layer = createAttackers();
  parent.add(layer.group);
  /* The explosions, for a clip that keeps them on its map's clock. */
  const booms = war.booms ? createExplosions() : null;
  if (booms) {
    parent.add(booms.group);
  }
  let boomsRoom = NaN;
  let rung = 0;
  const plans = new Map();
  const caches = new Map();
  let room = NaN;
  let map = null;
  let list = [];

  /* Played forward, the explosions the room's clock passes are thrown
   * and heard; any other step, the air is cleared and those alive at the
   * playhead are thrown at their age. */
  function boomsFrame(k, a, step, speed) {
    const now = boomsAt(war, n, k, a);
    const t = now.t;
    if (step > 0 && Number.isFinite(boomsRoom) && t >= boomsRoom) {
      for (const { b, age } of now.list) {
        if (b.at > boomsRoom) {
          booms.play(b.p, b.size, age);
          ring(b, speed);
        }
      }
    } else if (!(t === boomsRoom)) {
      booms.clear();
      for (const { b, age } of now.list) {
        booms.play(b.p, b.size, age);
      }
    }
    /* Every frame, as the paper's are: what was thrown is laid out. */
    booms.update(step > 0 ? step : 0);
    boomsRoom = t;
  }

  /* As loud as src/main.js warBoomAt rates it, quieter in slow motion. */
  function ring(b, speed) {
    if (!(speed > 0)) {
      return;
    }
    const level = Math.min(1, 0.35 + 0.2 * b.size) * Math.min(1, speed);
    if (worldBoom && worldBoom(b.p, level)) {
      rung += 1;
    } else if (audio && typeof audio.boom === 'function') {
      audio.boom(level, 0);
      rung += 1;
    }
  }

  return {
    /* The frame between rows k and k + 1, `a` of the way; `step` the
     * clip seconds played forward to it (0 for a jump or a still frame),
     * `speed` the replay's while it plays (0 while it does not). */
    frame(k, a, step = 0, speed = 0) {
      const r0 = war.room[k];
      const r1 = war.room[Math.min(n - 1, k + 1)];
      room = Number.isFinite(r0) && Number.isFinite(r1) ? r0 + (r1 - r0) * a : r0;
      list = warAt(war, n, k, a, plans);
      layer.update(list);
      map = worldAt(war, n, k, a, caches);
      if (booms) {
        boomsFrame(k, a, step, speed);
      }
    },
    /* The attackers drawn this frame and the room ms, for the world's
     * sound (src/render/world-audio.js war). */
    heard: () => ({ list, room }),
    /* The map at the frame drawn, or null for a clip that kept none. */
    world: () => map,
    /* For the checks: the room ms of this frame and what was drawn. */
    summary: () => ({ room, ...layer.drawn(), booms: booms ? { ...booms.stats(), rung } : null }),
    /* The clip row drawn at room ms `ms`, or -1. */
    rowAt(ms) {
      return war.room.indexOf(ms);
    },
    dispose() {
      layer.group.removeFromParent();
      layer.dispose();
      if (booms) {
        booms.group.removeFromParent();
        booms.dispose();
      }
    },
  };
}
