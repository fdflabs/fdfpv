/*
 * djiremote-selftest.js: the DJI RC231 remote as a pad, in plain Node.
 *
 *  1. The profile row (src/input/padprofiles.js): the id the driver gives
 *     parses to its name and USB ids, its calibration key, and the row it
 *     meets, vouched, with a sprung throttle, flying the measured map in
 *     every stick mode. A lookalike name with other ids is not it.
 *  2. The owner's stick check on a real RC231, replayed through the copied
 *     driver and the built-in map: at rest the sticks read centred and the
 *     throttle half, and the inputs the owner moved in order (left stick
 *     up, left right, right up, right right) arrive as throttle up, yaw
 *     right, nose down and roll right, in that order, each reaching its
 *     stop exactly. The capture moves each stick up or right only, so the
 *     other stops are not in it.
 *  3. src/input/djiremote.js against a stand-in for Web Serial
 *     (tests/lib/fakeserial.js), driving a real InputManager: no Web
 *     Serial is refused without a throw; a closed chooser, a call with no
 *     gesture and a held port each answer once; the remote's silent log
 *     port is closed, forgotten and never listed; the protocol port opens
 *     at 115200, asks for simulator mode first, lists one pad and flies
 *     it; the throttle hold of a spawn waits for its sprung throttle;
 *     unplugged mid flight it is a loss like any pad's, nothing thrown,
 *     the keyboard flying; plugged back in it is back with no click; and a
 *     page load reopens a granted remote and skips its log port.
 *
 *   npm run djiremote:selftest
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

import { installFakeSerial, rc231StickCheck } from '../tests/lib/fakeserial.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
}
const show = (v) => JSON.stringify(v);

/* Anything thrown and not caught anywhere is a failure of its own: an
 * unplug must not leave a rejected promise behind. */
const stray = [];
process.on('unhandledRejection', (err) => stray.push(String(err)));
process.on('uncaughtException', (err) => stray.push(String(err)));

/* The globals the input touches: no gamepads, an in-memory storage, and
 * a window that takes listeners. Web Serial is added later, by hand. */
const items = new Map();
globalThis.localStorage = {
  getItem: (k) => (items.has(k) ? items.get(k) : null),
  setItem: (k, v) => items.set(k, String(v)),
  removeItem: (k) => items.delete(k),
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };
try {
  navigator.getGamepads = () => [];
} catch (e) {
  globalThis.navigator = { getGamepads: () => [] };
}

const { DJI_RC_ID, FrameParser, isStickReply } = await import('../src/input/djirc.js');
const {
  connectDjiRemote, djiPads, reconnectDjiRemotes, webSerialAvailable,
} = await import('../src/input/djiremote.js');
const { AETR_MAP, builtInKind, builtInMap, readSticks } = await import('../src/input/padmap.js');
const {
  PAD_PROFILES, deviceKey, deviceKind, parsePadId, profileFor,
} = await import('../src/input/padprofiles.js');
const { connectedPads, shortPadName } = await import('../src/input/padpick.js');
const { InputManager } = await import('../src/input/input.js');

const pad = (id, axes = 5, mapping = '') => ({ id, mapping, axes: new Array(axes).fill(0), buttons: [] });
const later = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const turn = () => new Promise((resolve) => { setImmediate(resolve); });

/* ------------------------------------------------------ 1. the row */

console.log('\n1. the profile row and the id');
check('the id parses to its name and USB ids',
  show(parsePadId(DJI_RC_ID)) === show({ name: 'DJI RC231', vendor: '2ca3', product: '1020' }), show(parsePadId(DJI_RC_ID)));
check('its calibration key', deviceKey(DJI_RC_ID) === '2ca3:1020:DJI RC231', deviceKey(DJI_RC_ID));
check('its name as the picker shows it', shortPadName(DJI_RC_ID) === 'DJI RC231', shortPadName(DJI_RC_ID));
const row = profileFor(pad(DJI_RC_ID));
check('it meets the dji-rc231 row', row.key === 'dji-rc231', row.key);
check('the row is vouched', row.vouched === true);
check('its throttle springs to the middle', row.throttleSprings === true);
check('the row is the last, after the three that were there', PAD_PROFILES.map((r) => r.key).join() === 'standard,elrs-bluetooth,edgetx-usb,dji-rc231');
check('it flies as a radio', deviceKind(pad(DJI_RC_ID)) === 'radio');
check('it reports no buttons', pad(DJI_RC_ID).buttons.length === 0);
for (const mode of [1, 2, 3, 4]) {
  const kind = builtInKind(pad(DJI_RC_ID), mode);
  check(`mode ${mode}: the measured map, not the guess and not the stick mode's`, kind === 'dji-rc231'
    && show(builtInMap(pad(DJI_RC_ID), mode)) === show(AETR_MAP), `${show(kind)} ${show(builtInMap(pad(DJI_RC_ID), mode))}`);
}
const map = builtInMap(pad(DJI_RC_ID), 2);
check('measured: roll on axis 0, right positive', map.roll.axis === 0 && map.roll.full === 1);
check('measured: pitch on axis 1, stick up is nose down', map.pitch.axis === 1 && map.pitch.full === -1);
check('measured: yaw on axis 3, right positive', map.yaw.axis === 3 && map.yaw.full === 1);
check('measured: throttle on axis 2, down is zero', map.throttle.axis === 2 && map.throttle.low === -1 && map.throttle.high === 1);
check('a lookalike name with other USB ids is only the guess',
  profileFor(pad('DJI RC231 (Vendor: 1209 Product: 4f54)')).key === 'edgetx-usb'
  && profileFor(pad('DJI RC231 (Vendor: 0000 Product: 0000)')).key === 'aetr');
check('a standard mapping still wins over these ids', profileFor(pad(DJI_RC_ID, 4, 'standard')).key === 'standard');

/* -------------------------------------------- 2. the real stick check */

console.log('\n2. the stick check on a real RC231, through the driver and the map');
const frames = rc231StickCheck();
const parser = new FrameParser();
const replies = [];
for (const f of frames) {
  replies.push(...parser.push(f).filter(isStickReply));
}
check('every frame of the capture parses', parser.dropped === 0, `${parser.dropped} dropped`);
check('the capture holds stick replies', replies.length > 1000, `${replies.length}`);
const { rawChannels, toAxis } = await import('../src/input/djirc.js');
const sticksOf = (f) => readSticks(rawChannels(f).map(toAxis), map);
const rest = sticksOf(replies[0]);
check('at rest: centred and the throttle at half', show(rest) === show({ roll: 0, pitch: 0, yaw: 0, throttle: 0.5 }), show(rest));
const order = [];
const ends = { roll: new Set(), pitch: new Set(), yaw: new Set(), throttle: new Set() };
for (const f of replies) {
  const s = sticksOf(f);
  for (const ch of ['roll', 'pitch', 'yaw']) {
    ends[ch].add(s[ch]);
    if (Math.abs(s[ch]) > 0.5 && !order.some((o) => o.ch === ch)) {
      order.push({ ch, sign: Math.sign(s[ch]) });
    }
  }
  ends.throttle.add(s.throttle);
  if (Math.abs(s.throttle - 0.5) > 0.25 && !order.some((o) => o.ch === 'throttle')) {
    order.push({ ch: 'throttle', sign: Math.sign(s.throttle - 0.5) });
  }
}
check('in the order moved: throttle up, yaw right, nose down, roll right',
  show(order) === show([{ ch: 'throttle', sign: 1 }, { ch: 'yaw', sign: 1 }, { ch: 'pitch', sign: -1 }, { ch: 'roll', sign: 1 }]), show(order));
const span = (ch) => [Math.min(...ends[ch]), Math.max(...ends[ch])];
check('roll runs from centre to exactly +1', show(span('roll')) === show([0, 1]), show(span('roll')));
check('pitch runs from centre to exactly -1, stick up', show(span('pitch')) === show([-1, 0]), show(span('pitch')));
check('yaw runs from centre to exactly +1', show(span('yaw')) === show([0, 1]), show(span('yaw')));
check('throttle runs from half to exactly 1', show(span('throttle')) === show([0.5, 1]), show(span('throttle')));

/* ----------------------------------------- 3. the remote as a pad */

console.log('\n3. connected, flown, unplugged and plugged back in');
check('no Web Serial: not available', webSerialAvailable() === false);
const none = await connectDjiRemote();
check('no Web Serial: connecting says so and throws nothing', none.result === 'unsupported' && none.pad === null, show(none.result));
await reconnectDjiRemotes();
check('no Web Serial: a page load lists nothing', djiPads().length === 0 && connectedPads().length === 0);

const serial = installFakeSerial(navigator);
check('with Web Serial: available', webSerialAvailable() === true);
await reconnectDjiRemotes();
check('a page load with nothing granted lists nothing', djiPads().length === 0);
const logPort = serial.port('log', false);
const port = serial.port('protocol', true);
const centred = replies[0];
port.current = centred;

const cancelled = await connectDjiRemote();
check('the chooser closed with nothing picked: cancelled', cancelled.result === 'cancelled', cancelled.result);
check('the chooser is filtered to the remote',
  show(serial.filters) === show([{ usbVendorId: 0x2ca3, usbProductId: 0x1020 }]), show(serial.filters));
serial.picks.push('gesture');
const refused = (await connectDjiRemote()).result;
check('asked with no click or key: refused', refused === 'refused', refused);

port.busy = true;
serial.picks.push(port);
const busy = (await connectDjiRemote()).result;
port.busy = false;
check('a port another program holds: busy, and nothing listed', busy === 'busy' && djiPads().length === 0, busy);

serial.picks.push(logPort);
const silent = await connectDjiRemote();
check('the log port: silent', silent.result === 'silent' && silent.pad === null, silent.result);
check('the log port: closed again and its grant forgotten', logPort.closes === 1 && logPort.forgotten === true,
  `closes ${logPort.closes}, forgotten ${logPort.forgotten}`);
check('the log port: never listed', djiPads().length === 0 && connectedPads().length === 0);

const im = new InputManager();
const step = async (ms = 16) => {
  await later(ms);
  im.poll(performance.now());
};
await step();
check('before connecting the keyboard flies', im.firstGamepad() === null);

serial.picks.push(port);
const got = await connectDjiRemote();
check('the protocol port: connected', got.result === 'connected' && Boolean(got.pad), got.result);
check('opened at 115200', port.baudRate === 115200, show(port.baudRate));
const first = port.writes[0];
check('simulator mode asked for first (set 06 id 24, payload 01)', first && first[9] === 0x06 && first[10] === 0x24 && first[11] === 1,
  first ? Array.from(first, (b) => b.toString(16)).join(' ') : 'nothing written');
check('one pad listed, at index 64', djiPads().length === 1 && got.pad.index === 64, show(djiPads().map((p) => p.index)));
check('the roster sees it', connectedPads().length === 1 && connectedPads()[0] === got.pad);
const again = await connectDjiRemote().catch((e) => ({ result: String(e) }));
check('connecting a closed chooser again leaves it flying', again.result === 'cancelled' && djiPads().length === 1, again.result);

im.setPadChoice({ kind: 'pad', id: got.pad.id, index: got.pad.index });
await step();
check('it flies', im.firstGamepad() === got.pad);
const summary = im.padSummary();
check('the Controller screen recognises it, known with no calibration',
  summary.profile === 'dji-rc231' && summary.mapKnown === true && summary.calibrated === false && summary.device === 'radio', show(summary));
check('centred: centre sticks and half throttle', show(im.channels) === show({ roll: 0, pitch: 0, yaw: 0, throttle: 0.5 }), show(im.channels));

/* A frame of the capture where one input is held over: the first reply
 * past nine tenths of travel on the axis named. */
const held = (axis, sign) => replies.find((f) => sign * toAxis(rawChannels(f)[axis]) > 0.9);
/* The capture never pulls the throttle down, so the one frame that does
 * is made: a centred reply with the throttle (offset 19) at the 364 stop
 * every channel reached in the owner's full capture (the RC231 reference
 * README), its crc made again. */
const { crc16 } = await import('../src/input/djirc.js');
const throttleDown = centred.slice();
throttleDown[19] = 364 & 0xff;
throttleDown[20] = 364 >> 8;
const crc = crc16(throttleDown, throttleDown.length - 2);
throttleDown[throttleDown.length - 2] = crc & 0xff;
throttleDown[throttleDown.length - 1] = crc >> 8;
const fly = async (frame) => {
  port.current = frame;
  await step(30);
  await step(30);
  return { ...im.channels };
};
const tUp = await fly(held(2, 1));
check('left stick up: throttle up', tUp.throttle > 0.95, show(tUp));
const yawR = await fly(held(3, 1));
check('left stick right: yaw right', yawR.yaw > 0.9, show(yawR));
const noseDown = await fly(held(1, 1));
check('right stick up: nose down', noseDown.pitch < -0.9, show(noseDown));
const rollR = await fly(held(0, 1));
check('right stick right: roll right', rollR.roll > 0.9, show(rollR));

await fly(centred);
im.holdThrottleLow(0.05);
const atSpawn = await fly(centred);
check('a spawn holds the sprung throttle at zero', atSpawn.throttle === 0 && im.throttleWaiting === true, show(atSpawn));
const down = await fly(throttleDown);
check('the stick pulled down releases it', im.throttleHeld === false && down.throttle < 0.05, show(down));
const resting = await fly(centred);
check('and it flies the stick again: half', resting.throttle === 0.5, show(resting));

await fly(held(2, 1));
port.unplug();
await step(30);
await step(30);
check('unplugged: the pad is gone', djiPads().length === 0 && connectedPads().length === 0 && im.firstGamepad() === null);
check('unplugged: a loss, as for any pad', im.takeDeviceLoss() === true);
check('unplugged: the driver says why', got.pad.connected === false && Boolean(got.pad.error), String(got.pad.error));
check('unplugged: the keyboard flies, sticks centred', im.channels.roll === 0 && im.channels.pitch === 0 && im.channels.yaw === 0, show(im.channels));
check('unplugged: the port was closed', port.closes === 1, `${port.closes}`);

port.current = centred;
port.replug();
for (let i = 0; i < 40 && !djiPads().length; i += 1) {
  await later(20);
}
await step();
await step();
check('plugged back in: listed again with no click', djiPads().length === 1, `${djiPads().length}`);
check('plugged back in: it flies again', im.firstGamepad() === djiPads()[0]);
const back = im.takeDeviceBack();
check('plugged back in: reported back, by name', Boolean(back) && back.name === 'DJI RC231', show(back));
check('plugged back in: still the same choice, no picker', im.takePadPickQueue() === null);

console.log('\n4. a page load reopens a granted remote');
serial.granted.push(logPort);
logPort.forgotten = false;
const opensBefore = logPort.opens;
await reconnectDjiRemotes();
check('the remote already flying is left alone', djiPads().length === 1 && port.opens === 2, `opens ${port.opens}`);
check('a granted log port is tried, closed and forgotten', logPort.opens === opensBefore + 1 && logPort.forgotten === true);
await djiPads()[0].stop();
check('stopped, it leaves the list', djiPads().length === 0);
await reconnectDjiRemotes();
check('a page load opens the granted remote again', djiPads().length === 1 && port.opens === 3, `opens ${port.opens}`);

console.log('\nnegative control: a row that flies the guess must be caught');
const dji = PAD_PROFILES.find((r) => r.key === 'dji-rc231');
dji.vouched = false;
const caught = builtInKind(pad(DJI_RC_ID), 2) !== 'dji-rc231';
dji.vouched = true;
check('the row made unvouched no longer flies the measured map', caught);

for (const p of djiPads()) {
  await p.stop();
}
im.stopPolling();
await turn();
check('nothing thrown that nobody caught', stray.length === 0, stray.join(' | '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
