/*
 * djirc.js: a DJI RC231 / RC-N1 remote, read over Web Serial, as a Gamepad.
 *
 * The remote has no joystick mode. Over USB it is a CDC serial device
 * (2ca3:1020, product "C5") that speaks DJI's DUML protocol on its first
 * ACM port. Asked to enter simulator mode, it answers a stick poll at a
 * few hundred hertz. The protocol is from the reverse engineered Windows
 * tools (IvanYaky/DJI_RC-N1_SIMULATOR_FLY_DCL and
 * pverhaert/DJI_RCN1_for_drone_simulators); the framing and every offset
 * here was checked against a real RC231.
 *
 * DjiRcPad looks like a W3C Gamepad (id, index, connected, mapping, axes,
 * buttons, timestamp) so a game's existing pad code can read it beside
 * navigator.getGamepads(). Its id uses Chromium's format so the usual id
 * parsing finds the name and the USB ids.
 *
 * The reference copy, with the protocol notes and the tests against real
 * captures, is web/djirc.js in FDF Labs' RC231 repository; this file is
 * that copy as of its commit 7ce3721. Protocol changes are made there
 * first and copied here, never forked.
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

export const DJI_USB_VENDOR = 0x2ca3;
export const DJI_RC_PRODUCT = 0x1020;
export const DJI_RC_ID = 'DJI RC231 (Vendor: 2ca3 Product: 1020)';

/* Raw stick units: the remote reports 364..1684 around a 1024 centre. */
const RAW_CENTRE = 1024;
const RAW_HALF_SPAN = 660;

/* Byte offsets of each channel in the 38 byte stick reply, in the order the
 * remote sends them, which is AETR for mode 2: right horizontal (aileron),
 * right vertical (elevator), left vertical (throttle), left horizontal
 * (rudder), then the camera dial. Order, sign (up/right high) and the full
 * 364..1684 travel were measured on a real RC231 (djirc.test.mjs, stick
 * check). The reply carries three more channels at 28, 31 and 34 that
 * stayed centred through every input captured; they are left out
 * until something is seen to move them. */
const CHANNEL_OFFSETS = [13, 16, 19, 22, 25];
const STICK_REPLY_LENGTH = 38;

const SRC_PC = 0x0a;
const DST_RC = 0x06;
const CMD_REQUEST = 0x40;
const SET_RC = 0x06;
const ID_STICKS = 0x01;
const ID_SIMULATOR = 0x24;

/* Polls go out on a fixed tick rather than one per reply: with only one
 * request in flight the round trip caps a real RC231 at about 115 Hz, on
 * this tick it answers at about 230 Hz. */
const POLL_MS = 4;

function crcTable(poly, mask) {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ poly : c >>> 1;
    table[i] = c & mask;
  }
  return table;
}

/* Reflected Maxim (0x31) for the header, reflected CCITT (0x1021) for the
 * frame, with DJI's seeds. */
const CRC8 = crcTable(0x8c, 0xff);
const CRC16 = crcTable(0x8408, 0xffff);

export function crc8(bytes, end = bytes.length, seed = 0x77) {
  let c = seed;
  for (let i = 0; i < end; i++) c = CRC8[(bytes[i] ^ c) & 0xff];
  return c;
}

export function crc16(bytes, end = bytes.length, seed = 0x3692) {
  let c = seed;
  for (let i = 0; i < end; i++) c = (c >>> 8) ^ CRC16[(bytes[i] ^ c) & 0xff];
  return c;
}

/* One DUML frame: 55, length (10 bits) with version 1, header crc8, source,
 * target, sequence, command type, set, id, payload, crc16. */
export function buildFrame(seq, cmdSet, cmdId, payload = []) {
  const length = 13 + payload.length;
  const f = new Uint8Array(length);
  f[0] = 0x55;
  f[1] = length & 0xff;
  f[2] = (length >> 8) | 0x04;
  f[3] = crc8(f, 3);
  f[4] = SRC_PC;
  f[5] = DST_RC;
  f[6] = seq & 0xff;
  f[7] = (seq >> 8) & 0xff;
  f[8] = CMD_REQUEST;
  f[9] = cmdSet;
  f[10] = cmdId;
  f.set(payload, 11);
  const crc = crc16(f, length - 2);
  f[length - 2] = crc & 0xff;
  f[length - 1] = crc >> 8;
  return f;
}

/* Splits a byte stream into frames, resynchronising on the next 0x55 after
 * anything that fails either crc. */
export class FrameParser {
  constructor() {
    this.buf = new Uint8Array(0);
    this.dropped = 0;
  }

  push(chunk) {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf);
    joined.set(chunk, this.buf.length);
    const frames = [];
    let at = 0;
    while (true) {
      while (at < joined.length && joined[at] !== 0x55) at++;
      if (joined.length - at < 4) break;
      const length = (joined[at + 1] | (joined[at + 2] << 8)) & 0x3ff;
      if (crc8(joined.subarray(at), 3) !== joined[at + 3] || length < 13) {
        this.dropped++;
        at++;
        continue;
      }
      if (joined.length - at < length) break;
      const frame = joined.slice(at, at + length);
      if (crc16(frame, length - 2) !== (frame[length - 2] | (frame[length - 1] << 8))) {
        this.dropped++;
        at++;
        continue;
      }
      frames.push(frame);
      at += length;
    }
    this.buf = joined.slice(at);
    return frames;
  }
}

export const isStickReply = (f) => f.length === STICK_REPLY_LENGTH && f[9] === SET_RC && f[10] === ID_STICKS;

/* The channels of a stick reply in raw units. */
export function rawChannels(f) {
  return CHANNEL_OFFSETS.map((at) => f[at] | (f[at + 1] << 8));
}

/* Raw units onto -1..1, stick up or right positive. */
export function toAxis(raw) {
  return Math.max(-1, Math.min(1, (raw - RAW_CENTRE) / RAW_HALF_SPAN));
}

/* Is this Web Serial port the remote? Its two ACM ports share the ids; the
 * first one granted that answers is the protocol port. */
export function isDjiRcPort(port) {
  const info = port.getInfo ? port.getInfo() : {};
  return info.usbVendorId === DJI_USB_VENDOR && info.usbProductId === DJI_RC_PRODUCT;
}

/*
 * A remote on an open-able Web Serial port. start() opens it, turns on
 * simulator mode and polls until stop() or the cable comes out; the axes
 * update in place as replies arrive. A tick is skipped while the last
 * poll still waits in the stream, so a stalled remote never queues up
 * writes.
 */
export class DjiRcPad {
  constructor(port, index) {
    this.port = port;
    this.id = DJI_RC_ID;
    this.index = index;
    this.mapping = '';
    this.connected = false;
    this.axes = CHANNEL_OFFSETS.map(() => 0);
    this.buttons = [];
    this.timestamp = 0;
    this.replies = 0;
    /* Why the stream ended, when it ended on an error (an unplug). */
    this.error = null;
    this.parser = new FrameParser();
    this.seq = 0;
    this.writer = null;
    this.reader = null;
    this.ticker = null;
  }

  async start() {
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    await this.send(ID_SIMULATOR, [1]);
    this.connected = true;
    this.ticker = setInterval(() => this.poll(), POLL_MS);
    this.readLoop()
      .catch((err) => {
        this.error = err;
      })
      .finally(() => this.stop());
  }

  async stop() {
    if (!this.writer) return;
    this.connected = false;
    clearInterval(this.ticker);
    const { reader, writer } = this;
    this.reader = this.writer = null;
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    writer.releaseLock();
    await this.port.close().catch(() => {});
  }

  send(cmdId, payload) {
    this.seq = (this.seq + 1) & 0xffff;
    return this.writer.write(buildFrame(this.seq, SET_RC, cmdId, payload));
  }

  poll() {
    if (!this.writer || this.writer.desiredSize <= 0) return;
    this.send(ID_STICKS).catch((err) => {
      // A poll still queued when stop() releases the writer fails too; only
      // a failure while running says the remote went away.
      if (!this.writer) return;
      this.error = err;
      this.stop();
    });
  }

  async readLoop() {
    while (this.reader) {
      const { value, done } = await this.reader.read();
      if (done) return;
      for (const f of this.parser.push(value)) {
        if (!isStickReply(f)) continue;
        rawChannels(f).forEach((raw, i) => {
          this.axes[i] = toAxis(raw);
        });
        this.timestamp = performance.now();
        this.replies++;
      }
    }
  }
}
