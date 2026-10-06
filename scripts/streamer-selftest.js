/*
 * streamer-selftest.js: the toilet paper streamer's physics
 * (src/game/streamer.js) against its own contract, docs/COMBAT-PLAN.md
 * section 7. Plain Node, no browser, seconds. npm run streamer:selftest.
 *
 *   length      every segment stretched by its tension over the paper's
 *               stiffness, never past the stretch the paper breaks at
 *   terminal    a piece falling flat settles at the speed its own weight
 *               and CD_ACROSS give, sqrt(2 m g / (rho CD A))
 *   drag        towed level, the pull at the tow point is the drag the
 *               cited coefficients give for fifty metres, plus its weight
 *   tear        towed ever faster, it tears at the tow point where that
 *               pull reaches TEAR_N, and not before
 *   cut         cutTo leaves what the referee said, the rest falls and lands
 *   frames      the shell's accumulator at 30, 60, 144 Hz and at random
 *               frame lengths gives the same streamer to the bit
 *   determinism two runs, one trace; its hash is printed for the browser
 *               check to hold the page to (scripts/combat-two-page.js)
 *   cost        one streamer's simulated second, in wall milliseconds
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

import {
  AREAL_KG_M2, CD_ACROSS, COMPLIANCE, STRETCH_AT_TEAR, TEAR_HOLD_S, TEAR_SPEED_MPS, CD_FLUTTER, CD_FRICTION, G, LENGTH_M, RHO, SEG_M, Streamer, TAIL_M, TEAR_N, WIDTH_M,
  streamerTrace,
} from '../src/game/streamer.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const flat = () => 0;

/* Towed level along -z at `speed` m/s, 20 m up, for `seconds`. */
function tow(s, speed, seconds, from = 0) {
  let z = from;
  for (let k = 0; k < seconds * 1000; k += 1) {
    z -= speed * 0.001;
    s.step(0, 20, z, flat);
  }
  return z;
}

console.log('length');
{
  const s = new Streamer();
  s.lay(25, 30, 0, 0, 0, -1, undefined, null, [0, 6.4, 16]);
  let worstHooke = 0;
  let worstStretch = 0;
  /* A 25 m radius circle at 16 m/s with a climb and a dive in it. */
  for (let k = 0; k < 8000; k += 1) {
    const t = k * 0.001;
    const a = (16 / 25) * t;
    /* The circle from a polynomial, so the check needs no trigonometry. */
    s.step(25 * cosLike(a), 30 + 5 * sinLike(a * 2), 25 * sinLike(a), flat);
    const c = s.attached;
    for (let i = 0; i < c.n - 1; i += 1) {
      const d = Math.hypot(c.x[i * 3 + 3] - c.x[i * 3], c.x[i * 3 + 4] - c.x[i * 3 + 1], c.x[i * 3 + 5] - c.x[i * 3 + 2]);
      const stretch = d - SEG_M;
      worstStretch = Math.max(worstStretch, stretch / SEG_M);
      /* A pulling segment is stretched by its tension over its stiffness. */
      if (c.tension[i] > 0.05) {
        worstHooke = Math.max(worstHooke, Math.abs(stretch - c.tension[i] * COMPLIANCE));
      }
    }
  }
  check('every pulling segment stretched by tension times compliance, to 1 mm, eight seconds of turning', worstHooke < 0.001, `worst ${(worstHooke * 1000).toFixed(3)} mm`);
  check(`no segment ever stretched past the paper's ${STRETCH_AT_TEAR * 100} percent`, worstStretch < STRETCH_AT_TEAR, `worst ${(worstStretch * 100).toFixed(2)} percent`);
  check('and all fifty metres are still on', s.length() === LENGTH_M, `${s.length()} m`);
}

/* Test paths only (not the physics): a circle from a polynomial, so the
 * check itself stays free of Math.sin and Math.cos like the code it
 * checks. Good to 1e-6 over the range used. */
function sinLike(a) {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) {
    x -= 2 * Math.PI;
  }
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n += 1) {
    term *= (-x * x) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}
function cosLike(a) {
  return sinLike(a + Math.PI / 2);
}

console.log('terminal: a piece falling flat');
{
  const s = new Streamer(10);
  s.lay(0, 200, 0, 1, 0, 0);
  /* Cut at the tow point: all ten metres fall, flat. */
  s.cutTo(0);
  const piece = s.pieces[0];
  for (let k = 0; k < 8000; k += 1) {
    s.step(0, 200, 0, flat);
  }
  const vy = -piece.v[5 * 3 + 1];
  const want = Math.sqrt((2 * AREAL_KG_M2 * G) / (RHO * CD_ACROSS));
  check(`settles at sqrt(2 m g / (rho CD A)), ${want.toFixed(3)} m/s, to 2 percent`, Math.abs(vy - want) / want < 0.02, `${vy.toFixed(3)} m/s`);
}

console.log('drag: towed level');
for (const speed of [8, 12, 16]) {
  const s = new Streamer();
  s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -speed]);
  tow(s, speed, 15);
  const c = s.attached;
  /* The pull's two parts at the tow point: along the tow, the drag; up,
   * the weight of what hangs. */
  const dx = c.x[3] - c.x[0];
  const dy = c.x[4] - c.x[1];
  const dz = c.x[5] - c.x[2];
  const d = Math.hypot(dx, dy, dz);
  const T = s.towTension();
  const horiz = T * (dz / d);
  const q = 0.5 * RHO * speed * speed;
  const drag = q * WIDTH_M * (CD_FRICTION * LENGTH_M + (CD_FLUTTER - CD_FRICTION) * TAIL_M);
  const weight = AREAL_KG_M2 * WIDTH_M * LENGTH_M * G;
  check(`${speed} m/s: pull along the tow is the cited drag, ${drag.toFixed(2)} N, to 10 percent`, Math.abs(horiz - drag) / drag < 0.1, `${horiz.toFixed(2)} N`);
  check(`${speed} m/s: and the whole pull is no more than drag and weight together, ${Math.hypot(drag, weight).toFixed(2)} N`, T <= Math.hypot(drag, weight) * 1.1, `${T.toFixed(2)} N`);
}

console.log('tear: the owner\'s rule, only over 120 km/h');
{
  /* The owner, 2026-09-28: "the paper only gets dropped over 120 km/h".
   * A game rule: the tow point faster than TEAR_SPEED_MPS for TEAR_HOLD_S. */
  check('the rule\'s speed is 120 km/h', Math.abs(TEAR_SPEED_MPS * 3.6 - 120) < 1e-9 && TEAR_HOLD_S === 0.3);
  const run = (len, speed, seconds) => {
    const s = new Streamer(len);
    s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -speed]);
    let worst = 0;
    let z = 0;
    let tornAt = null;
    for (let k = 0; k < seconds * 1000 && tornAt == null; k += 1) {
      z -= speed * 0.001;
      s.step(0, 20, z, flat);
      if (s.news.length) {
        tornAt = (k + 1) / 1000;
      }
      const c = s.attached;
      for (let i = 0; c && i < c.n - 1; i += 1) {
        const d = Math.hypot(c.x[i * 3 + 3] - c.x[i * 3], c.x[i * 3 + 4] - c.x[i * 3 + 1], c.x[i * 3 + 5] - c.x[i * 3 + 2]);
        worst = Math.max(worst, (d - SEG_M) / SEG_M);
      }
    }
    return { s, worst, tornAt };
  };
  const slow = run(100, 32, 60);
  check('a hundred metres at 32 m/s (115 km/h) for sixty seconds does not tear', slow.tornAt == null && slow.s.length() === 100, `${slow.s.length()} m, pull ${slow.s.towTension().toFixed(1)} N`);
  check('and the paper stops stretching where paper does: no link past a fifth more', slow.worst < 0.25, `worst ${(slow.worst * 100).toFixed(1)} percent`);
  const fifty = run(50, 32, 60);
  check('fifty metres at 32 m/s for sixty seconds does not tear either', fifty.tornAt == null && fifty.s.length() === 50);
  const fast = run(100, 34, 5);
  const tear = fast.s.news[0];
  check('at 34 m/s (122 km/h) a hundred metres tears, after the rule\'s 0.3 s', fast.tornAt != null && Math.abs(fast.tornAt - TEAR_HOLD_S) < 0.01, `torn at ${fast.tornAt} s`);
  check('at the tow point, all of it, and the tear says how fast', tear && tear.kind === 'tear' && tear.segs === 0 && fast.s.length() === 0 && tear.speed > TEAR_SPEED_MPS, tear ? `kept ${tear.segs} m at ${(tear.speed * 3.6).toFixed(0)} km/h` : '');
  const tiny = run(2, 34, 5);
  check('two metres at 34 m/s tears too: a rule, not a strength', tiny.tornAt != null);
  /* A spike through 120 km/h shorter than the hold is not a tear. */
  const s = new Streamer();
  s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -30]);
  let z = 0;
  for (let k = 0; k < 3000; k += 1) {
    const v = k >= 1000 && k < 1200 ? 36 : 30;
    z -= v * 0.001;
    s.step(0, 20, z, flat);
  }
  check('a 0.2 s spike to 36 m/s is not a tear', s.length() === LENGTH_M && s.news.length === 0);
}

console.log('cut');
{
  const s = new Streamer();
  s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -12]);
  tow(s, 12, 3);
  const id = s.cutTo(17);
  check('cutTo(17) leaves 17 m on', s.length() === 17 && id != null, `${s.length()} m`);
  check('and the other 33 m come off as one piece', s.pieces.length === 1 && s.pieces[0].n - 1 === 33, `${s.pieces[0] ? s.pieces[0].n - 1 : 0} m`);
  check('a second cut further back than what is left does nothing', s.cutTo(30) === null && s.length() === 17);
  let landed = null;
  const piece = s.pieces[0];
  for (let k = 0; k < 60000 && landed == null; k += 1) {
    s.step(0, 20, -36 - 12 * (k + 1) * 0.001, flat);
    let low = true;
    for (let i = 0; i < piece.n; i += 1) {
      low &&= piece.x[i * 3 + 1] <= 0.011;
    }
    if (low) {
      landed = k;
    }
  }
  check('the piece falls and lies on the ground', landed != null, landed != null ? `in ${(landed / 1000).toFixed(1)} s from 20 m` : 'still falling');
}

console.log('captured paper: grown at the far end, a hundred metres');
{
  const s = new Streamer();
  s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -12]);
  let z = tow(s, 12, 3);
  const before = Float64Array.from(s.attached.x);
  s.setColours(new Uint8Array(50).fill(1));
  s.extendTo(81);
  const same = before.every((v, i) => v === s.attached.x[i]);
  check('extendTo(81) adds 31 links at the far end and moves none of the 51 nodes there were', s.length() === 81 && same);
  const cols = new Uint8Array(81).fill(1, 0, 50).fill(2, 50);
  s.setColours(cols);
  z = tow(s, 12, 5, z);
  const c = s.attached;
  let worst = 0;
  for (let i = 0; i < c.n - 1; i += 1) {
    const d = Math.hypot(c.x[i * 3 + 3] - c.x[i * 3], c.x[i * 3 + 4] - c.x[i * 3 + 1], c.x[i * 3 + 5] - c.x[i * 3 + 2]);
    worst = Math.max(worst, (d - SEG_M) / SEG_M);
  }
  check('towed on, all 81 stay on, no link past the paper\'s stretch', s.length() === 81 && worst < STRETCH_AT_TEAR, `${s.length()} m, worst ${(worst * 100).toFixed(1)} percent`);
  s.cutTo(60);
  check('a cut keeps each link\'s colour on both sides of it', s.attached.col[49] === 1 && s.attached.col[50] === 2 && s.pieces[0].col[0] === 2, `${s.attached.col[49]} ${s.attached.col[50]} ${s.pieces[0].col[0]}`);

}

console.log('frames');
{
  /* The tow point is a function of the step, as the plant's pose is. */
  const path = (k) => [15 * sinLike(k * 0.0004), 25 + 3 * sinLike(k * 0.0011), -14 * k * 0.001];
  function run(frameMs) {
    const s = new Streamer();
    s.lay(0, 25, 0, 0, 0, 1);
    let acc = 0;
    let k = 0;
    let f = 0;
    while (k < 6000) {
      acc += frameMs(f);
      f += 1;
      let steps = Math.floor(acc);
      acc -= steps;
      while (steps > 0 && k < 6000) {
        const p = path(k);
        s.step(p[0], p[1], p[2], flat);
        k += 1;
        steps -= 1;
        if (k === 3000) {
          s.cutTo(31);
        }
      }
    }
    return streamerTrace(s);
  }
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const ref = run(() => 1000 / 60);
  for (const [name, fn] of [['30 Hz', () => 1000 / 30], ['144 Hz', () => 1000 / 144], ['random 1 to 50 ms', () => 1 + 49 * rnd()]]) {
    const got = run(fn);
    check(`frames at ${name} give the 60 Hz streamer, bit for bit`, got === ref, `${got} vs ${ref}`);
  }
}

console.log('determinism');
{
  const a = streamerRun();
  const b = streamerRun();
  check('two runs, one trace', a === b, `${a} ${b}`);
  console.log(`  trace ${a}`);
}

/* The browser check's run: the same code, the same inputs. */
function streamerRun() {
  const s = new Streamer();
  s.lay(0, 25, 0, 0, 0, 1);
  for (let k = 0; k < 5000; k += 1) {
    s.step(10 * sinLike(k * 0.0007), 25 + 2 * sinLike(k * 0.002), -15 * k * 0.001, flat);
    if (k === 2500) {
      s.cutTo(22);
    }
  }
  return streamerTrace(s);
}

console.log('cost');
{
  const s = new Streamer();
  s.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -14]);
  const t0 = process.hrtime.bigint();
  tow(s, 14, 10);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const perSecond = ms / 10;
  console.log(`  one streamer: ${perSecond.toFixed(2)} ms of wall time per simulated second (${(perSecond / 10).toFixed(2)} percent of one core)`);
  check('one streamer costs under 20 ms a simulated second', perSecond < 20, `${perSecond.toFixed(2)} ms`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
