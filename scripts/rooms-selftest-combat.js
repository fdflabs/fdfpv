/*
 * rooms-selftest-combat.js: the combat section of npm run rooms:selftest
 * (docs/COMBAT-PLAN.md section 7), kept in its own file so the phases that
 * add their own sections to scripts/rooms-selftest.js do not edit the same
 * lines. rooms-selftest.js calls combatSection(check) once.
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

import {
  STREAMER_COLOURS, STREAMER_ERR_M, STREAMER_PIECES, STREAMER_SEGS, TYPE_STREAMER_RELAY,
  decodeStreamer, decodeStreamerRelay, encodeStreamer, relayStreamer, streamerColour, trimStreamer,
} from '../src/share/roomwire.js';

/* A deterministic wander: a chain that bends and stretches like paper. */
function randomChain(rnd, n, stretch) {
  const x = new Float64Array(n * 3);
  x[0] = 2000 * rnd() - 1000;
  x[1] = 300 * rnd();
  x[2] = 6000 * rnd() - 3000;
  let dx = rnd() - 0.5;
  let dy = rnd() - 0.5;
  let dz = rnd() - 0.5;
  for (let k = 1; k < n; k += 1) {
    dx += 0.6 * (rnd() - 0.5);
    dy += 0.6 * (rnd() - 0.5);
    dz += 0.6 * (rnd() - 0.5);
    const l = Math.hypot(dx, dy, dz);
    const len = stretch ? 1 + 0.2 * rnd() : 0.2 + 0.8 * rnd();
    x[k * 3] = x[k * 3 - 3] + (dx / l) * len;
    x[k * 3 + 1] = x[k * 3 - 2] + (dy / l) * len;
    x[k * 3 + 2] = x[k * 3 - 1] + (dz / l) * len;
  }
  return x;
}

export function combatSection(check) {
  console.log('combat: streamer frames');
  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let worst = 0;
  let shapes = true;
  for (let trial = 0; trial < 300; trial += 1) {
    const n = 51;
    const x = randomChain(rnd, n, trial % 2 === 0);
    const got = decodeStreamer(encodeStreamer(4321, [{ id: 0, n, x }]));
    shapes &&= Boolean(got) && got.t === 4321 && got.chains.length === 1 && got.chains[0].n === n;
    for (let k = 0; got && k < n; k += 1) {
      const c = got.chains[0].x;
      worst = Math.max(worst, Math.hypot(c[k * 3] - x[k * 3], c[k * 3 + 1] - x[k * 3 + 1], c[k * 3 + 2] - x[k * 3 + 2]));
    }
  }
  check('a streamer decodes whole, time and all', shapes);
  check(`every node, however far down the paper, within ${STREAMER_ERR_M * 100} cm of its owner's`, worst <= STREAMER_ERR_M, `worst ${(worst * 100).toFixed(2)} cm`);
  const full = encodeStreamer(0, [{ id: 0, n: 51, x: randomChain(rnd, 51, true) }]);
  check('a full fifty metre streamer is 171 bytes', full.byteLength === 171, `${full.byteLength}`);
  const many = [];
  for (let i = 0; i < 8; i += 1) {
    many.push({ id: i, n: 90, x: randomChain(rnd, 90, false) });
  }
  const capped = decodeStreamer(encodeStreamer(0, many));
  check(`at most ${1 + STREAMER_PIECES} chains of ${STREAMER_SEGS} segments are sent`, capped.chains.length === 1 + STREAMER_PIECES && capped.chains.every((c) => c.n === STREAMER_SEGS + 1));
  const relayed = decodeStreamerRelay(relayStreamer(9, full));
  check('the relay carries the seat and the same streamer', relayed && relayed.seat === 9 && relayed.chains[0].n === 51 && relayStreamer(9, full)[0] === TYPE_STREAMER_RELAY);
  const two = encodeStreamer(0, [{ id: 0, n: 51, x: randomChain(rnd, 51, true) }, { id: 3, n: 20, x: randomChain(rnd, 20, false) }]);
  const trimmed = decodeStreamer(trimStreamer(two, 12));
  check('trimming cuts the streamer to what the referee left and keeps the pieces', trimmed && trimmed.chains[0].n === 13 && trimmed.chains[1].id === 3 && trimmed.chains[1].n === 20);
  check('trimming to more than there is changes nothing', trimStreamer(two, 60) === two);
  check('bytes that do not add up are nothing', decodeStreamer(full.subarray(0, 170)) === null && decodeStreamer(new Uint8Array([0x80, 0, 0, 0, 0, 0, 9])) === null);
  const colours = new Set(Array.from({ length: 16 }, (_, i) => streamerColour(i + 1)));
  check('sixteen seats, sixteen colours', colours.size === 16 && STREAMER_COLOURS.length === 16);
}
