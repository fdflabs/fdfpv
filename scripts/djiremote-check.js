/*
 * djiremote-check.js: a DJI RC231 remote in the real shell, headless
 * Chromium through tests/lib/page.js, with a stand-in for Web Serial
 * (tests/lib/fakeserial.js) replaying the owner's stick check on a real
 * RC231. Run with npm run djiremote:check.
 *
 *  1. A browser without Web Serial: the Controller screen's Connect DJI
 *     remote row is greyed and says why in one line, and clicking it does
 *     nothing and throws nothing.
 *  2. With Web Serial, the row is live. Picking the remote's log port in
 *     the chooser is refused as silent, closed and forgotten, and no pad
 *     appears; picking the protocol port connects it with one click, and
 *     the Controller screen recognises it as the DJI RC231 with its
 *     built-in layout, no calibration.
 *  3. In flight: the spawn holds the remote's sprung throttle at zero
 *     until the stick goes down. Unplugged mid flight it pauses the solo
 *     flight as any pad's loss does and the keyboard takes over; plugged
 *     back in it flies again with no click.
 *  4. The stick check replayed at its own pace: the inputs the owner moved
 *     in order (left stick up, left right, right up, right right) reach
 *     the game's channels as throttle up, yaw right, nose down and roll
 *     right, in that order, each to its stop.
 *  5. No page error from start to end.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import { openPage } from '../tests/lib/page.js';
import { STICK_CHECK, installFakeSerial } from '../tests/lib/fakeserial.js';
import { FrameParser, crc16, isStickReply } from '../src/input/djirc.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* The capture as [seconds from its first frame, hex], and its first stick
 * reply, every stick centred. */
const lines = gunzipSync(readFileSync(STICK_CHECK)).toString().trim().split('\n').map((l) => l.split('\t'));
const t0 = Number(lines[0][0]);
const timed = lines.map(([t, hex]) => [Number(t) - t0, hex]);
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));
const centred = new FrameParser().push(Uint8Array.from(lines.flatMap(([, hex]) => [...bytes(hex)]))).find(isStickReply);
/* The capture never pulls the throttle down, so that one frame is made: the
 * centred reply with the throttle (offset 19) at the 364 stop, crc again,
 * as djiremote-selftest.js does. */
const down = centred.slice();
down[19] = 364 & 0xff;
down[20] = 364 >> 8;
const crc = crc16(down, down.length - 2);
down[down.length - 2] = crc & 0xff;
down[down.length - 1] = crc >> 8;
const hexOf = (f) => Array.from(f, (b) => b.toString(16).padStart(2, '0')).join('');

const SEED = `window.__fakeSerial = (${installFakeSerial.toString()})(navigator);
window.__djiBytes = (hex) => Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [SEED] });

const rowId = "(window.__ui.items().find((it) => it.action === 'connect-dji') || {}).id || null";
const row = () => page.evaluate(`JSON.stringify(window.__ui.items().find((it) => it.action === 'connect-dji') || null)`).then(JSON.parse);
const info = () => page.evaluate('JSON.stringify(window.__ui.padInfo)').then(JSON.parse);
async function clickConnect() {
  const id = await page.evaluate(rowId);
  return id ? page.click(`[data-row-id="${id}"]`) : false;
}
const setCurrent = (f) => page.evaluate(`(() => { window.__djiPort.current = window.__djiBytes('${hexOf(f)}'); return true; })()`);

try {
  await page.until('!!window.__shellReady', 300000);
  await page.evaluate("window.__ui.show('controller'); true");
  await page.until("window.__ui.screen === 'controller'", 5000);

  console.log('1. a browser without Web Serial');
  await page.evaluate("Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true }); window.__ui.renderMenu(); true");
  const greyed = await row();
  check('the row is there, greyed', Boolean(greyed) && greyed.disabled === true, JSON.stringify(greyed));
  check('it says why in one line', Boolean(greyed) && /Chrome or Edge/.test(greyed.note) && !greyed.note.includes('\n'), greyed && greyed.note);
  check('clicking it is a click on a greyed row', await clickConnect());
  await page.sleep(500);
  check('nothing connected, still the Controller screen', (await info()).count === 0
    && await page.evaluate("window.__ui.screen === 'controller'"));

  console.log('2. connecting');
  await page.evaluate(`(() => {
    Object.defineProperty(navigator, 'serial', { value: window.__fakeSerial, configurable: true });
    window.__djiLog = window.__fakeSerial.port('log', false);
    window.__djiPort = window.__fakeSerial.port('protocol', true);
    window.__ui.renderMenu();
    return true;
  })()`);
  await setCurrent(centred);
  const live = await row();
  check('with Web Serial the row is live', Boolean(live) && !live.disabled && /USB/.test(live.note), JSON.stringify(live));
  await page.evaluate('window.__fakeSerial.picks.push(window.__djiLog); true');
  check('Connect DJI remote clicked, the log port picked', await clickConnect());
  await page.until('window.__djiLog.forgotten === true', 10000);
  check('the log port is closed and forgotten', await page.evaluate('window.__djiLog.closes === 1 && window.__djiLog.forgotten'));
  check('and no pad appears', (await info()).count === 0, JSON.stringify(await info()));
  await page.evaluate('window.__fakeSerial.picks.push(window.__djiPort); true');
  check('clicked again, the remote picked', await clickConnect());
  await page.until("window.__ui.padInfo.profile === 'dji-rc231'", 10000);
  const got = await info();
  check('recognised as the DJI RC231', got.profile === 'dji-rc231' && /DJI RC231/.test(got.using), JSON.stringify(got));
  check('known with no calibration', got.mapKnown === true && got.calibrated === false && got.buttons === 0, JSON.stringify(got));
  check('the chooser was filtered to the remote', await page.evaluate(
    "JSON.stringify(window.__fakeSerial.filters) === JSON.stringify([{ usbVendorId: 0x2ca3, usbProductId: 0x1020 }])",
  ));

  console.log('3. in flight');
  await page.evaluate("window.__ui.show('title'); window.__drawOff(true); true");
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.sleep(800);
  check('the spawn holds the sprung throttle at zero', await page.evaluate('window.__input.throttleHeld === true && window.__input.channels.throttle === 0'),
    await page.evaluate('JSON.stringify({ held: window.__input.throttleHeld, ch: window.__input.channels })'));
  await setCurrent(down);
  await page.until('window.__input.throttleHeld === false', 5000).catch(() => {});
  check('the stick pulled down releases it', await page.evaluate('window.__input.throttleHeld === false && window.__input.channels.throttle < 0.05'),
    await page.evaluate('JSON.stringify(window.__input.channels)'));
  await setCurrent(centred);
  await page.until('window.__input.channels.throttle === 0.5', 5000).catch(() => {});
  check('then it flies the stick: half at rest', await page.evaluate('window.__input.channels.throttle === 0.5'));

  check('flying before the cable comes out', await page.evaluate("window.__ui.screen === 'flight'"), await page.evaluate('window.__ui.screen'));
  await page.evaluate('window.__djiPort.unplug(); true');
  const paused = await page.until("window.__ui.screen === 'paused'", 10000).then(() => true, () => false);
  check('unplugged mid flight: the solo flight pauses, as for any pad', paused, await page.evaluate('window.__ui.screen'));
  check('unplugged: the keyboard flies', await page.evaluate('window.__input.firstGamepad() === null') && (await info()).count === 0);
  await page.evaluate('window.__djiPort.replug(); true');
  const back = await page.until("window.__ui.padInfo.profile === 'dji-rc231' && window.__input.firstGamepad() !== null", 10000).then(() => true, () => false);
  check('plugged back in: it flies again with no click', back, JSON.stringify(await info()));
  await page.evaluate("window.__ui.act('resume'); true");
  await page.until("window.__ui.screen === 'flight'", 5000).catch(() => {});

  console.log('4. the stick check, replayed');
  const order = await page.evaluate(`new Promise((done) => {
    const frames = ${JSON.stringify(timed)};
    const port = window.__djiPort;
    port.answers = false;
    const order = [];
    const top = { roll: 0, pitch: 0, yaw: 0, throttle: 0.5 };
    const seen = (ch) => order.some((o) => o.ch === ch);
    const watch = setInterval(() => {
      const c = window.__input.channels;
      for (const ch of ['roll', 'pitch', 'yaw']) {
        if (Math.abs(c[ch]) > Math.abs(top[ch])) top[ch] = c[ch];
        if (Math.abs(c[ch]) > 0.5 && !seen(ch)) order.push({ ch, sign: Math.sign(c[ch]) });
      }
      if (c.throttle > top.throttle) top.throttle = c.throttle;
      if (Math.abs(c.throttle - 0.5) > 0.25 && !seen('throttle')) order.push({ ch: 'throttle', sign: Math.sign(c.throttle - 0.5) });
    }, 2);
    const start = performance.now();
    let at = 0;
    const feed = setInterval(() => {
      const now = (performance.now() - start) / 1000;
      while (at < frames.length && frames[at][0] <= now) {
        port.feed(window.__djiBytes(frames[at][1]));
        at += 1;
      }
      if (at >= frames.length) {
        clearInterval(feed);
        setTimeout(() => { clearInterval(watch); done(JSON.stringify({ order, top })); }, 200);
      }
    }, 4);
  })`).then(JSON.parse);
  check('in the order moved: throttle up, yaw right, nose down, roll right',
    JSON.stringify(order.order) === JSON.stringify([{ ch: 'throttle', sign: 1 }, { ch: 'yaw', sign: 1 }, { ch: 'pitch', sign: -1 }, { ch: 'roll', sign: 1 }]),
    JSON.stringify(order.order));
  check('each to its stop: throttle 1, yaw +1, pitch -1, roll +1',
    JSON.stringify(order.top) === JSON.stringify({ roll: 1, pitch: -1, yaw: 1, throttle: 1 }), JSON.stringify(order.top));

  console.log('5. errors');
  check('no page error', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
} catch (err) {
  failed += 1;
  console.log(`  FAIL  ${err.message}`);
} finally {
  await page.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
