/*
 * offline.js: whether the page can reach its servers now (COMPLETENESS
 * item 11), one answer for the shell, the rooms and the account's sync.
 *
 * Two ways to be cut off. The device is offline: navigator.onLine is
 * false, and the browser says when it comes back (the `online` event). Or
 * the device is online and a server does not answer: a fetch to it fails
 * on the network, not with an HTTP status (a status is a server that
 * answered). That server is then counted down for RETRY_MS, or until a
 * fetch to it gets through or the device comes back online, so a press
 * in the meantime goes solo at once rather than waiting on a fetch that
 * will fail, and the next one after it tries again.
 *
 * What each part does with it: the cards fly solo and the room games are
 * left off the hubs while the rooms cannot be reached (src/share/rooms.js
 * available, the rule a page with no rooms server always had); the
 * account's sync holds what changed, which progressChanged already keeps,
 * and sends it when the device is back (src/ui/accountui.js); tracks were
 * already kept and sent on `online` (src/share/cloud.js). The shell says
 * so once a spell (src/main.js).
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

export const RETRY_MS = 60000;

/* Server name to the Date.now() before which it counts as down. */
const down = new Map();
const listeners = new Set();
let watching = false;

function emit() {
  for (const fn of listeners) fn();
}

/* The device's own answer; true where there is no navigator (Node). */
export function deviceOnline() {
  return globalThis.navigator?.onLine !== false;
}

/* Whether `server` can be tried now. */
export function reachable(server, now = Date.now()) {
  return deviceOnline() && !((down.get(server) ?? 0) > now);
}

/* A fetch to `server` failed on the network. */
export function unreachable(server, now = Date.now()) {
  const was = reachable(server, now);
  down.set(server, now + RETRY_MS);
  if (was) emit();
}

/* A fetch to `server` got an answer, whatever its status. */
export function reached(server) {
  if (down.delete(server)) emit();
}

/* Calls `fn` on every change: the device going off or on line, a server
 * counted down or answering again. Listens to `win` the first time. */
export function onNetwork(fn, win = globalThis.window) {
  listeners.add(fn);
  if (!watching && win) {
    watching = true;
    win.addEventListener('offline', emit);
    win.addEventListener('online', () => {
      down.clear();
      emit();
    });
  }
}

/* A fetch that marks `server` reached or unreachable by how it ended, and
 * otherwise behaves as fetch does. */
export async function fetchFrom(server, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    unreachable(server);
    throw e;
  }
  reached(server);
  return res;
}
