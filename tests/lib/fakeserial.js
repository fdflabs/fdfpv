/*
 * fakeserial.js: a stand-in for Web Serial with DJI RC231 ports behind it,
 * for the checks of src/input/djiremote.js in Node and in the real shell.
 *
 * installFakeSerial is self contained on purpose: the browser check sends
 * its source into the page as a seed, so it may use nothing from this
 * module's scope. A port answers each stick poll it hears (set 06 id 01)
 * with `current`, a stick reply, as the real remote does; one made with
 * `answers` false is the remote's log port, which never answers. `feed`
 * writes bytes onto the port's stream directly, for a replay at the pace
 * the check chooses. `unplug` errors both streams the way Chrome does when
 * the cable comes out, and fires the serial disconnect event; `replug`
 * fires connect. The chooser answers requestPort from `picks`: a port, the
 * word 'gesture' for a call with no user activation, or nothing for a
 * chooser closed with nothing picked.
 *
 * rc231StickCheck reads the owner's stick check on a real RC231 (copied
 * from the RC231 reference, fixtures/rc231-stick-check-2026-10-26.tsv.gz):
 * every frame of it in order, as bytes.
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

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export const STICK_CHECK = new URL('../fixtures/rc231-stick-check-2026-10-26.tsv.gz', import.meta.url);

export function rc231StickCheck() {
  const text = gunzipSync(readFileSync(STICK_CHECK)).toString();
  return text.trim().split('\n').map((line) => {
    const hex = line.split('\t')[1];
    return Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));
  });
}

export function installFakeSerial(nav) {
  const listeners = { connect: [], disconnect: [] };
  const lost = () => new DOMException('The device has been lost.', 'NetworkError');
  let serial = null;

  class FakePort {
    constructor(name, answers) {
      this.name = name;
      this.answers = answers;
      this.current = null;
      this.writes = [];
      this.opens = 0;
      this.closes = 0;
      this.forgotten = false;
      this.plugged = true;
      this.busy = false;
      this.readable = null;
      this.writable = null;
      this.readCtl = null;
      this.writeCtl = null;
    }

    getInfo() {
      return { usbVendorId: 0x2ca3, usbProductId: 0x1020 };
    }

    async open(options) {
      if (!this.plugged || this.busy) {
        throw new DOMException('Failed to open serial port.', 'NetworkError');
      }
      if (this.readable) {
        throw new DOMException('The port is already open.', 'InvalidStateError');
      }
      this.opens += 1;
      this.baudRate = options && options.baudRate;
      this.readable = new ReadableStream({ start: (c) => { this.readCtl = c; } });
      this.writable = new WritableStream({
        start: (c) => { this.writeCtl = c; },
        write: (chunk) => this.heard(chunk),
      });
    }

    heard(chunk) {
      const f = Uint8Array.from(chunk);
      this.writes.push(f);
      if (this.answers && this.current && f[9] === 0x06 && f[10] === 0x01) {
        this.readCtl.enqueue(this.current.slice());
      }
    }

    feed(bytes) {
      this.readCtl.enqueue(Uint8Array.from(bytes));
    }

    async close() {
      if (!this.readable) {
        throw new DOMException('The port is already closed.', 'InvalidStateError');
      }
      this.readable = null;
      this.writable = null;
      this.closes += 1;
    }

    async forget() {
      this.forgotten = true;
    }

    unplug() {
      this.plugged = false;
      if (this.readable) {
        this.readCtl.error(lost());
        this.writeCtl.error(lost());
      }
      serial.fire('disconnect', this);
    }

    replug() {
      this.plugged = true;
      serial.fire('connect', this);
    }
  }

  serial = {
    ports: [],
    granted: [],
    picks: [],
    filters: null,
    port(name, answers = true) {
      const p = new FakePort(name, answers);
      this.ports.push(p);
      return p;
    },
    async requestPort(options) {
      this.filters = options && options.filters;
      const pick = this.picks.shift();
      if (pick === 'gesture') {
        throw new DOMException('Must be handling a user gesture to show a permission request.', 'SecurityError');
      }
      if (!pick) {
        throw new DOMException('No port selected by the user.', 'NotFoundError');
      }
      pick.forgotten = false;
      if (!this.granted.includes(pick)) {
        this.granted.push(pick);
      }
      return pick;
    },
    async getPorts() {
      return this.granted.filter((p) => !p.forgotten && p.plugged);
    },
    addEventListener(type, fn) {
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    fire(type, port) {
      for (const fn of listeners[type]) {
        fn({ type, target: port });
      }
    },
  };
  Object.defineProperty(nav, 'serial', { value: serial, configurable: true });
  return serial;
}
