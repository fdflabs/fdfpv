/*
 * live-selftest.js: the live frame codec, the sender's resampler and the
 * peer's playback, in plain Node. Run with npm run live:selftest.
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

import { encodeLiveFrame, decodeLiveFrame, LIVE_FRAME_BYTES, LIVE_PEER_BYTES, GHOST_RATE_HZ } from '../src/share/ghostdata.js';
import { LiveGhost, LiveSender, LIVE_DELAY_MS, LIVE_STALE_MS } from '../src/game/ghost.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* What the relay does: peer id in front, frame untouched. */
function relayed(peer, frame) {
  const out = new Uint8Array(LIVE_PEER_BYTES + frame.length);
  new DataView(out.buffer).setUint16(0, peer, true);
  out.set(frame, LIVE_PEER_BYTES);
  return out;
}

console.log('live frames');
const frame = encodeLiveFrame(123456.7, 1.5, -2.25, 40.125, 0, 0.7071, 0, 0.7071);
check('a frame is 24 bytes', frame.length === LIVE_FRAME_BYTES, `${frame.length}`);
const back = decodeLiveFrame(relayed(7, frame));
check('and decodes with its peer id', back && back.peer === 7 && back.tMs === 123457, JSON.stringify(back));
check('position survives as float32', back && Math.abs(back.px - 1.5) < 1e-6 && Math.abs(back.py + 2.25) < 1e-6 && Math.abs(back.pz - 40.125) < 1e-6);
check('attitude survives to sixteen bits', back && Math.abs(back.qy - 0.7071) < 1e-3 && Math.abs(back.qw - 0.7071) < 1e-3, back && `${back.qy} ${back.qw}`);
check('a short frame is nothing', decodeLiveFrame(new Uint8Array(10)) === null);
check('a frame with no peer id is nothing', decodeLiveFrame(frame) === null);

console.log('sender');
const sent = [];
const sender = new LiveSender((t, x) => sent.push({ t, x }));
for (let i = 0; i <= 20; i += 1) {
  sender.feed(i * 16.6667, i * 0.5, 0, 0, 0, 0, 0, 1); /* 60 Hz feed, 0.5 m per frame */
}
const stepMs = 1000 / GHOST_RATE_HZ;
check('a 60 Hz feed goes out at the ghost rate', sent.length === Math.floor((20 * 16.6667) / stepMs) + 1, `${sent.length}`);
check('on the grid', sent.every((s, i) => Math.abs(s.t - i * stepMs) < 1e-6));
check('with positions interpolated onto it', Math.abs(sent[3].x - (3 * stepMs / 16.6667) * 0.5) < 1e-6, `${sent[3].x}`);
const flips = [];
const s2 = new LiveSender((t, x, y, z, qx, qy, qz, qw) => flips.push(qw));
s2.feed(0, 0, 0, 0, 0, 0, 0, 1);
s2.feed(stepMs, 0, 0, 0, 0, 0, 0, -1); /* the same attitude, other hemisphere */
check('the sender keeps the quaternion on one hemisphere', flips.length === 2 && flips[1] > 0, flips.join(','));

console.log('playback');
const live = new LiveGhost();
const pose = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
check('nothing yet is presence 0', live.sample(0, pose) === 0);
/* A peer flying +1 m per 33 ms along x; frames arrive on time. */
for (let i = 0; i < 12; i += 1) {
  live.push(decodeLiveFrame(relayed(1, encodeLiveFrame(1000 + i * stepMs, i, 0, 0, 0, 0, 0, 1))), 5000);
}
let presence = live.sample(5000, pose);
const newest = Math.round(1000 + 11 * stepMs);
const expectAt = (t) => (t - 1000) / stepMs; /* metres along x at sender time t, ignoring rounding */
check('the playhead starts behind the newest frame by the delay',
  presence === 1 && Math.abs(pose.px - expectAt(newest - LIVE_DELAY_MS)) < 0.05, `${pose.px} vs ${expectAt(newest - LIVE_DELAY_MS)}`);
live.sample(5000 + 10, pose);
const p1 = pose.px;
/* The next frame arrives, so the target moves on and the playhead may follow. */
live.push(decodeLiveFrame(relayed(1, encodeLiveFrame(1000 + 12 * stepMs, 12, 0, 0, 0, 0, 0, 1))), 5015);
live.sample(5000 + 20, pose);
check('and advances with the local clock', pose.px > p1 && Math.abs((pose.px - p1) - (10 / stepMs)) < 0.02, `${pose.px - p1}`);
for (let k = 0; k < 20; k += 1) {
  live.sample(5000 + 30 + k * 16, pose);
}
const held = pose.px;
live.sample(5000 + 30 + 20 * 16 + 100, pose);
check('with no new frames it holds at the delayed target rather than running past it',
  Math.abs(pose.px - held) < 1e-9 && Math.abs(held - expectAt(live.newestMs() - LIVE_DELAY_MS)) < 0.05, `${held}`);
check('and goes stale when nothing has arrived for a while', live.sample(5000 + LIVE_STALE_MS + 200, pose) === 0);
const before = live.newestMs();
live.push(decodeLiveFrame(relayed(1, encodeLiveFrame(500, 99, 0, 0, 0, 0, 0, 1))), 9000);
check('an older frame is dropped rather than reordered', live.newestMs() === before, `${live.newestMs()} vs ${before}`);
const late = new LiveGhost();
late.push(decodeLiveFrame(relayed(1, encodeLiveFrame(1000, 0, 0, 0, 0, 0, 0, 1))), 0);
late.push(decodeLiveFrame(relayed(1, encodeLiveFrame(1000 + stepMs, 1, 0, 0, 0, 0, 0, 1))), 0);
late.sample(0, pose);
for (let i = 2; i < 40; i += 1) {
  late.push(decodeLiveFrame(relayed(1, encodeLiveFrame(1000 + i * stepMs, i, 0, 0, 0, 0, 0, 1))), 10);
}
late.sample(10, pose);
check('after a burst the playhead snaps to within the catch-up of its target',
  pose.px > expectAt(late.newestMs() - LIVE_DELAY_MS - 100 - 1) , `${pose.px}`);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
