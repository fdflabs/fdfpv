/*
 * link-selftest.js: the radio link (src/input/link.js) behaves like a
 * radio, for every preset, in plain Node.
 *
 * A link model is exactly the kind of code that can be wrong without
 * anybody noticing, because its whole job is to be slightly imperfect.
 * The ways it goes wrong each have a test here:
 *
 *   jitter drawn from Math.random     a lap can never be reproduced
 *   delay applied to the sample       a radio that sees the future
 *   packets emitted out of order      sim_input rejects them
 *   output that depends on batching   the frame rate moves the flight
 *   decorative jitter or loss         the model does nothing at all
 *
 * The exact packet stream is pinned separately, in link-trace-selftest.
 *
 *   node scripts/link-selftest.js
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

import { RcLink, LINK_PRESETS, LINK_DEFAULT } from '../src/input/link.js';

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

/*
 * Fly a link for `ms` of sim time in blocks of `blockMs`, ending exactly
 * on `ms` whatever the block size, and collect what it emits. The sampled
 * roll is the moment it was sampled, so a packet's payload says when it
 * was SAMPLED and its stamp when it ARRIVED.
 */
let early = 0;
function fly(link, ms, blockMs = 16) {
  const packets = [];
  link.reset(0);
  const sampler = (atMs) => ({ roll: atMs, pitch: 0, yaw: 0, throttle: 0.5 });
  let t = 0;
  while (t < ms) {
    t = Math.min(t + blockMs, ms);
    const now = link.pump(t, sampler);
    early += now.filter((p) => p.tMs > t).length;
    packets.push(...now);
  }
  return packets;
}

const sameStream = (a, b) => a.length === b.length && a.every((p, i) => p.tMs === b[i].tMs && p.rc.roll === b[i].rc.roll);

console.log('perfect is the identity, and only perfect');
check('the default is perfect', LINK_DEFAULT === 'perfect' && new RcLink().id === 'perfect' && new RcLink().isPerfect());
{
  const p = fly(new RcLink('perfect'), 400);
  check('one packet per 4 ms slot', p.length === 100, `${p.length} in 400 ms`);
  check('stamped on the slot it was sampled in', p.every((x) => x.tMs === x.rc.roll));
}

for (const [id, preset] of Object.entries(LINK_PRESETS)) {
  if (id === 'perfect') {
    continue;
  }
  console.log(`\n${id}: ${preset.hz} Hz, ${preset.delayMs} ms +-${preset.jitterMs}, ${preset.lossPpm} ppm`);
  const link = new RcLink(id);
  check('is not the identity', !link.isPerfect());
  const out = fly(link, 1000);
  check(`sends about ${preset.hz} packets a second`, Math.abs(link.sent - preset.hz) <= 2, `${link.sent} sent`);
  check('every packet sent is emitted, dropped or still in the air',
    out.length + link.pending.length === link.sent - link.dropped,
    `${out.length} out, ${link.pending.length} in the air, ${link.dropped} dropped of ${link.sent}`);
  check('stamps never go backwards', out.every((p, i) => i === 0 || p.tMs >= out[i - 1].tMs));
  const lag = out.map((p) => p.tMs - p.rc.roll);
  const mean = lag.reduce((a, b) => a + b, 0) / lag.length;
  check('every packet arrives after it was sampled', lag.every((d) => d > 0));
  check('the mean delay is the preset\'s', Math.abs(mean - preset.delayMs) < 0.25, `${mean.toFixed(3)} ms`);
  check('no packet leaves the jitter band', lag.every((d) => Math.abs(d - preset.delayMs) <= preset.jitterMs + 1e-9));
  const spread = Math.max(...lag) - Math.min(...lag);
  check('the jitter is really there', spread > preset.jitterMs * 0.5, `${spread.toFixed(3)} ms spread`);
  check('the same seed replays exactly', sameStream(fly(new RcLink(id, 0xABCD1234), 600), fly(new RcLink(id, 0xABCD1234), 600)));
  check('another seed does not', !sameStream(fly(new RcLink(id, 0xABCD1234), 600), fly(new RcLink(id, 0x1234ABCD), 600)));
  check('the block size changes nothing', sameStream(fly(new RcLink(id, 0x55AA55AA), 600, 33), fly(new RcLink(id, 0x55AA55AA), 600, 4)));
  const lossy = new RcLink(id);
  fly(lossy, 20000);
  const ppm = (lossy.dropped / lossy.sent) * 1e6;
  check('loss lands near the preset\'s rate', Math.abs(ppm - preset.lossPpm) < preset.lossPpm * 0.9 + 200,
    `${ppm.toFixed(0)} ppm over ${lossy.sent} packets`);
  check('and some packets really are lost', lossy.dropped > 0, `${lossy.dropped} of ${lossy.sent}`);
}

console.log('\nordering and arrival');
check('no packet is ever handed over before its own stamp', early === 0, `${early} early`);
{
  /* Jitter wider than the slot makes neighbours cross in the air; they
   * must still come out in arrival order. */
  const wide = new RcLink('elrs250', 7);
  wide.jitterMs = 3;
  const out = fly(wide, 2000);
  const crossed = out.some((p, i) => i > 0 && p.rc.roll < out[i - 1].rc.roll);
  check('packets that cross in the air come out in arrival order',
    crossed && out.every((p, i) => i === 0 || p.tMs >= out[i - 1].tMs), `crossed=${crossed}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
