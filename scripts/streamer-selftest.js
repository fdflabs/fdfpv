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
  AREAL_KG_M2, CD_ACROSS, COMPLIANCE, STRETCH_AT_TEAR, CD_FLUTTER, CD_FRICTION, G, LENGTH_M, RHO, SEG_M, Streamer, TAIL_M, TEAR_N, WIDTH_M,
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

console.log('tear');
{
  const q1 = 0.5 * RHO * WIDTH_M * (CD_FRICTION * LENGTH_M + (CD_FLUTTER - CD_FRICTION) * TAIL_M);
  const weight = AREAL_KG_M2 * WIDTH_M * LENGTH_M * G;
  /* TEAR_N^2 = (q1 v^2)^2 + W^2, at the limit. */
  const vTear = Math.sqrt(Math.sqrt(TEAR_N * TEAR_N - weight * weight) / q1);
  const below = new Streamer();
  below.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -0.9 * vTear]);
  const z = tow(below, 0.9 * vTear, 30);
  check(`at 90 percent of the predicted ${vTear.toFixed(1)} m/s, thirty seconds, no tear`, below.length() === LENGTH_M && below.news.length === 0, `${below.length()} m, ${below.news.length} tears, pull ${below.towTension().toFixed(2)} N`);
  /* Then ramp at 0.5 m/s per second until it goes. */
  let v = 0.9 * vTear;
  let at = z;
  let tearV = null;
  let tearT = 0;
  for (let k = 0; k < 20000 && tearV == null; k += 1) {
    v += 0.0005;
    at -= v * 0.001;
    const before = below.towTension();
    below.step(0, 20, at, flat);
    if (below.news.length) {
      tearV = v;
      tearT = before;
    }
  }
  check(`ramped, it tears near the predicted ${vTear.toFixed(1)} m/s, to 10 percent`, tearV != null && Math.abs(tearV - vTear) / vTear < 0.1, `${tearV ? tearV.toFixed(2) : 'never'} m/s`);
  check(`the pull when it went was TEAR_N, ${TEAR_N.toFixed(2)} N, to 5 percent`, tearV != null && Math.abs(tearT - TEAR_N) / TEAR_N < 0.05, `${tearT.toFixed(2)} N`);
  const news = below.news[0];
  check('it tore at the tow point, where the pull is greatest', news && news.kind === 'tear' && news.segs <= 1, news ? `kept ${news.segs} m` : '');
  const fast = new Streamer();
  fast.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -1.2 * vTear]);
  tow(fast, 1.2 * vTear, 10);
  check('held at 120 percent it tears at the tow point and all of it goes', fast.length() === 0 && fast.news.length === 1 && fast.news[0].segs === 0, `${fast.length()} m left after ${fast.news.length} tears`);
  /* Shorter paper holds more speed: 10 m, towed at the speed that took
   * the fifty off, stays on. */
  const short = new Streamer(10);
  short.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -1.2 * vTear]);
  tow(short, 1.2 * vTear, 10);
  check(`ten metres at that ${(1.2 * vTear).toFixed(1)} m/s stays on, pulling ${short.towTension().toFixed(1)} N`, short.length() === 10 && short.towTension() < TEAR_N, `${short.length()} m`);
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

  /* A hundred metres tears sooner than fifty: twice the friction and
   * twice the weight for the same paper at the tow point. */
  const q100 = 0.5 * RHO * WIDTH_M * (CD_FRICTION * 100 + (CD_FLUTTER - CD_FRICTION) * TAIL_M);
  const w100 = AREAL_KG_M2 * WIDTH_M * 100 * G;
  const v100 = Math.sqrt(Math.sqrt(TEAR_N * TEAR_N - w100 * w100) / q100);
  const long = new Streamer(100);
  long.lay(0, 20, 0, 0, 0, 1, undefined, null, [0, 0, -0.85 * v100]);
  let at = tow(long, 0.85 * v100, 20);
  check(`a hundred metres holds at 85 percent of its predicted ${v100.toFixed(1)} m/s`, long.length() === 100 && long.news.length === 0, `${long.length()} m`);
  let v = 0.85 * v100;
  let tearV = null;
  for (let k = 0; k < 30000 && tearV == null; k += 1) {
    v += 0.0005;
    at -= v * 0.001;
    long.step(0, 20, at, flat);
    if (long.news.length) {
      tearV = v;
    }
  }
  check(`and tears near ${v100.toFixed(1)} m/s, to 10 percent (fifty metres: 22.3)`, tearV != null && Math.abs(tearV - v100) / v100 < 0.1, `${tearV ? tearV.toFixed(2) : 'never'} m/s`);
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
