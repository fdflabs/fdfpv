/*
 * warscene.js: a war's attackers in a replay, drawn.
 *
 * A clip's war (src/replay/warrec.js) is drawn by an attackers layer of
 * the replay's own (src/render/attackers.js, one InstancedMesh a kind, as
 * live), each frame at the room ms the live frame drew: the scripted ones
 * where routes.js puts them then, the hunters where they were drawn. Their
 * deaths are the explosions the paper's events already hold
 * (src/replay/paperscene.js); the war's markers and HUD are the flight
 * screen's and are not drawn over a replay, as no other game's HUD is.
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

import { createAttackers } from '../render/attackers.js';
import { warAt } from './warrec.js';

/* `war` is a clip's, `n` its rows; `parent` the scene. */
export function createWarScene(war, n, parent) {
  const layer = createAttackers();
  parent.add(layer.group);
  const plans = new Map();
  let room = NaN;

  return {
    /* The frame between rows k and k + 1, `a` of the way. */
    frame(k, a) {
      const r0 = war.room[k];
      const r1 = war.room[Math.min(n - 1, k + 1)];
      room = Number.isFinite(r0) && Number.isFinite(r1) ? r0 + (r1 - r0) * a : r0;
      layer.update(warAt(war, n, k, a, plans));
    },
    /* For the checks: the room ms of this frame and what was drawn. */
    summary: () => ({ room, ...layer.drawn() }),
    /* The clip row drawn at room ms `ms`, or -1. */
    rowAt(ms) {
      return war.room.indexOf(ms);
    },
    dispose() {
      layer.group.removeFromParent();
      layer.dispose();
    },
  };
}
