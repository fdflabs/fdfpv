/*
 * statsswitch.js: the switch on privacy.html that stops this browser
 * sending site statistics and client reports.
 *
 * The game is served from its own domain and the board from the API's, so
 * the board's switch (its public/stats.js) only reaches a browser's memory
 * on the board's origin. This page is on the game's origin, so the same
 * opt out written here is the one src/share/stats.js reads before every
 * send, statistics and error and frame reports alike.
 *
 * Only sharedkeys.js is imported, so the page loads nothing of the game,
 * and storage is only read until the switch is flipped. The memory's shape
 * (an object with optOut) is stats.js's recall and remember: KEEP IN STEP.
 * Words are in the page, both languages; this only sets state.
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

import { STATS_KEY, readSharedKey, writeSharedKey } from './sharedkeys.js';

/* stats.js's memory as a plain object; refused or junk storage is empty. */
function recall() {
  try {
    const memory = JSON.parse(readSharedKey(STATS_KEY) || 'null');
    return memory !== null && typeof memory === 'object' && !Array.isArray(memory) ? memory : {};
  } catch (e) {
    return {};
  }
}

/* True when the write stuck; storage that refuses leaves counting as it was. */
function setSending(on) {
  try {
    writeSharedKey(STATS_KEY, JSON.stringify({ ...recall(), optOut: !on }));
  } catch (e) {
    return false;
  }
  return recall().optOut === !on;
}

const gpc = (() => {
  try {
    return navigator.globalPrivacyControl === true;
  } catch (e) {
    return false;
  }
})();

const boxes = [...document.querySelectorAll('input[data-stats-switch]')];
const paint = () => {
  const sending = !gpc && recall().optOut !== true;
  for (const box of boxes) {
    box.checked = sending;
    box.disabled = gpc;
  }
};
for (const note of document.querySelectorAll('[data-stats-gpc]')) {
  note.hidden = !gpc;
}
for (const box of boxes) {
  box.addEventListener('change', () => {
    setSending(box.checked);
    paint();
  });
}
paint();
