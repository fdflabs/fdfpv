/*
 * djiremote.js: a DJI RC231 remote plugged in over USB, flown as a pad.
 *
 * The remote has no joystick mode, so navigator.getGamepads() never lists
 * it. It is a serial device read through Web Serial (djirc.js), which only
 * Chrome and Edge on a computer have. The first connection is a pilot's
 * click, because requestPort needs a user gesture; the browser remembers
 * that grant, so a page load or the cable plugged back in opens it again
 * with no click (getPorts, and the serial connect event).
 *
 * The remote shows two serial ports with the same USB ids and only one of
 * them answers. A pad is listed only once it has answered. A port that has
 * not answered within ANSWER_MS is closed and its grant forgotten, so the
 * silent port never reaches the roster (padpick.js connectedPads) and is
 * not waited on again at the next page load. When the cable
 * comes out the read fails, the driver marks itself disconnected and drops
 * out of the list, which the roster treats as any unplugged pad.
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

import { DJI_RC_PRODUCT, DJI_USB_VENDOR, DjiRcPad, isDjiRcPort } from './djirc.js';

const FILTERS = [{ usbVendorId: DJI_USB_VENDOR, usbProductId: DJI_RC_PRODUCT }];
/* A real RC231 answers its first polls within a few milliseconds and then
 * about 225 times a second, so this is generous. */
const ANSWER_MS = 1500;
const ANSWER_POLL_MS = 20;
/* The Gamepad API numbers pads from 0. A remote's index starts well clear,
 * so a stored choice ({ id, index }, padpick.js) never names a gamepad. */
const INDEX_BASE = 64;

/* Every port this page opened that answered, to its pad. A pad whose
 * cable came out stays here, disconnected, until its port is opened again
 * or reported gone. */
const opened = new Map();
/* The open in progress per port, so a page load's reconnect and a connect
 * event for the same port share one attempt rather than racing. */
const opening = new Map();

export function webSerialAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.serial);
}

/* The remotes answering now. Read on every 2 ms input poll. */
export function djiPads() {
  const live = [];
  for (const pad of opened.values()) {
    if (pad.connected) {
      live.push(pad);
    }
  }
  return live;
}

/* The lowest index no answering remote holds. */
function freeIndex() {
  const taken = new Set(djiPads().map((pad) => pad.index));
  let index = INDEX_BASE;
  while (taken.has(index)) {
    index += 1;
  }
  return index;
}

function answered(pad) {
  return new Promise((resolve) => {
    const started = performance.now();
    const look = setInterval(() => {
      const late = performance.now() - started >= ANSWER_MS;
      if (pad.replies > 0 || !pad.connected || late) {
        clearInterval(look);
        resolve(pad.replies > 0 && pad.connected);
      }
    }, ANSWER_POLL_MS);
  });
}

/*
 * 'connected' once the remote on `port` answers; 'silent' when the port
 * opened and never answered (the remote's other port), and is closed and
 * forgotten; 'busy' when the port would not open (another tab or program
 * holds it, or the cable is already out).
 */
async function startPort(port) {
  const had = opened.get(port);
  if (had && had.connected) {
    return 'connected';
  }
  opened.delete(port);
  const pad = new DjiRcPad(port, -1);
  try {
    await pad.start();
  } catch (e) {
    /* A start that failed after the port opened leaves it open; one that
     * failed before has nothing to close, and its close rejects. */
    await port.close().catch(() => {});
    return 'busy';
  }
  if (!(await answered(pad))) {
    await pad.stop();
    /* Forgetting only spares the next page load the wait; a browser that
     * refuses it costs that wait and nothing else. */
    if (port.forget) {
      await port.forget().catch(() => {});
    }
    return 'silent';
  }
  pad.index = freeIndex();
  opened.set(port, pad);
  return 'connected';
}

function openPort(port) {
  if (!opening.has(port)) {
    opening.set(port, startPort(port).finally(() => opening.delete(port)));
  }
  return opening.get(port);
}

/*
 * The pilot's click: the browser's port chooser, filtered to the remote,
 * then that port opened. Resolves to { result, pad }, where result is
 * 'connected', 'silent', 'busy', 'cancelled' (the chooser was closed with
 * nothing picked), 'refused' (the browser would not show it here) or
 * 'unsupported' (no Web Serial). Never rejects.
 */
export async function connectDjiRemote() {
  if (!webSerialAvailable()) {
    return { result: 'unsupported', pad: null };
  }
  let port;
  try {
    port = await navigator.serial.requestPort({ filters: FILTERS });
  } catch (err) {
    return { result: err && err.name === 'NotFoundError' ? 'cancelled' : 'refused', pad: null };
  }
  const result = await openPort(port);
  return { result, pad: result === 'connected' ? opened.get(port) : null };
}

/*
 * At page load: every remote port this browser was granted before is
 * opened again, and from then on a granted port plugged back in is too.
 * Silent: nothing here asks or says anything, and a port that fails stays
 * closed until the pilot connects it by hand.
 */
export async function reconnectDjiRemotes() {
  if (!webSerialAvailable()) {
    return;
  }
  navigator.serial.addEventListener('connect', (e) => {
    if (e.target && isDjiRcPort(e.target)) {
      openPort(e.target);
    }
  });
  navigator.serial.addEventListener('disconnect', (e) => {
    const pad = opened.get(e.target);
    if (pad && !pad.connected) {
      opened.delete(e.target);
    }
  });
  let ports = [];
  try {
    ports = await navigator.serial.getPorts();
  } catch (e) {
    /* A browser that lists no grants (a permissions policy, a profile that
     * forbids it) has nothing to reconnect. */
    return;
  }
  await Promise.all(ports.filter(isDjiRcPort).map(openPort));
}
