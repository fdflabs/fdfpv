/*
 * gatecue.js: the racing line's cue a lesson draws (src/game/training.js
 * gateCue): a chevron round the crosshair pointing at the next gate,
 * hidden while the gate is ahead, where the gate itself is the cue.
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

import { el } from './dom.js';

const STYLE = `
.gate-cue { position: fixed; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; z-index: 5; }
.gate-cue[hidden] { display: none; }
.gate-cue-arrow { position: absolute; left: -14px; top: -118px; width: 0; height: 0;
  border-left: 14px solid transparent; border-right: 14px solid transparent; border-bottom: 22px solid #6fd3a0;
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.8)); }
`;

export function createGateCue(host = document.body) {
  if (!document.getElementById('gate-cue-style')) {
    const s = document.createElement('style');
    s.id = 'gate-cue-style';
    s.textContent = STYLE;
    document.head.append(s);
  }
  const box = el('div', 'gate-cue');
  box.hidden = true;
  box.append(el('div', 'gate-cue-arrow'));
  host.append(box);
  return {
    /* cue from gateCue, or null to hide it. */
    show(cue) {
      box.hidden = !cue || cue.ahead;
      if (!box.hidden) {
        box.style.transform = `rotate(${cue.angle}rad)`;
      }
    },
    shown: () => !box.hidden,
  };
}
