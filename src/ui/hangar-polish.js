/*
 * hangar-polish.js: the hangar's small touches that are not the set.
 *
 *   THE REV. Picking a motor or an engine on the Power tab lets it speak:
 *   a short blip from idle to most of its revs and back, on the flight
 *   audio's own motor voice (src/render/audio.js), so a two stroke Cox
 *   and an electric outrunner sound like what they are before a pilot
 *   flies them. revRpm is the shape; src/main.js feeds it to the mix while
 *   the hangar is up and puts the seated plane's voice back after.
 *
 *   BEFORE AND AFTER. The Power tab's readouts keep the value the last
 *   choice made as a faint bar ending in a tick (hangar.js statsBlock);
 *   the style is here.
 *
 * The camera's moves and the exploded view are the renderer's
 * (src/render/hangarstage.js, src/render/hangar-exploded.js).
 *
 * Nothing here imports three.js: scripts import src/ui/ui.js in Node.
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

/* The rev's length, ms, and its points: [ms, share of the voice's full
 * rpm]. A catch at idle, the throttle opened hard, held a breath, and let
 * back down through idle to stopped. */
export const REV_MS = 1500;
const REV_SHAPE = [
  [0, 0.0],
  [60, 0.22],
  [220, 0.24],
  [420, 0.86],
  [640, 0.9],
  [980, 0.3],
  [1250, 0.24],
  [1500, 0.0],
];

/* The rpm the rev asks for `ms` after it began, on a voice whose full
 * throttle is `rpmFull`; null once it is over. Linear between the points:
 * the mix already eases every change on its own time constants. */
export function revRpm(ms, rpmFull) {
  if (!(ms >= 0) || ms >= REV_MS) {
    return null;
  }
  for (let i = 1; i < REV_SHAPE.length; i += 1) {
    const [t1, v1] = REV_SHAPE[i];
    if (ms <= t1) {
      const [t0, v0] = REV_SHAPE[i - 1];
      return rpmFull * (v0 + ((v1 - v0) * (ms - t0)) / (t1 - t0));
    }
  }
  return 0;
}

const STYLE = `
.hangar-stat-bar { position: relative; }
.hangar-stat-ghost {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0; box-sizing: border-box;
  background: rgba(243, 234, 212, 0.3); border-right: 2px solid rgba(243, 234, 212, 0.9);
  opacity: 0; transition: opacity 260ms;
}
.hangar-stat-ghost.on { opacity: 1; }
`;

export function installHangarPolish() {
  if (typeof document === 'undefined' || document.getElementById('hangar-polish-style')) {
    return;
  }
  const s = document.createElement('style');
  s.id = 'hangar-polish-style';
  s.textContent = STYLE;
  document.head.append(s);
}
