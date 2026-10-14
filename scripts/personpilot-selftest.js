/*
 * personpilot-selftest.js: the person paced pilot's eyes and hand
 * (tests/lib/personpilot.js), in Node, no plant.
 *
 * The eyes must hand the law the state exactly the delay old, on the
 * hand's beat only, and nothing until the delay (and any lookback) has
 * been seen, at both step sizes and both paces the probes and figure
 * scripts fly at. The hand must move in fiftieths and stop at the stops.
 * Each property is also run on a deliberately broken copy, which it must
 * reject: a check that passes a broken pilot proves nothing. Last, a toy
 * roll axis held by a grid of person pilots: the person's delay must cost
 * holds against a person with none (McRuer and Jex 1967: the delay is
 * what limits a pilot's crossover), or the delay is not reaching the law.
 *
 *   node scripts/personpilot-selftest.js
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

import { PERSON, clamp, quant, eyes } from '../tests/lib/personpilot.js';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

/* The eyes' contract on a flight of `seconds`, each step's sample its own
 * time: every look sees the sample delayMs (and back steps) old, looks
 * fall on the beat and only there once the eyes are full, and the first
 * look is the first step that has seen enough. Returns what broke, or ''. */
function eyesBroken(make, { stepMs, everyMs, delayMs = PERSON.delayMs, back = 0 }) {
  const eye = make({
    stepMs, everyMs, delayMs, backMax: back,
  });
  const lag = Math.round(delayMs / stepMs);
  const first = (lag + back) * stepMs;
  for (let ms = 0; ms <= 2000; ms += stepMs) {
    eye.push({ ms });
    const want = ms >= first && ms % everyMs === 0;
    if (eye.looks(ms, back) !== want) return `looks at ${ms} ms is ${!want}`;
    if (!want) continue;
    if (eye.ago()?.ms !== ms - lag * stepMs) return `at ${ms} ms sees ${eye.ago()?.ms}`;
    if (eye.ago(back)?.ms !== ms - (lag + back) * stepMs) return `at ${ms} ms sees ${eye.ago(back)?.ms} ${back} steps back`;
  }
  return '';
}

/* The hand's contract: every stick it sends is a whole fiftieth of the
 * travel, the nearest one to what the law asked, and never past a stop. */
function handBroken(q) {
  for (let i = -150; i <= 150; i += 1) {
    const x = i / 97;
    const got = q(x);
    const n = got * PERSON.steps;
    if (Math.abs(n - Math.round(n)) > 1e-9) return `${x} gives ${got}, not a fiftieth`;
    if (Math.abs(got) > 1) return `${x} gives ${got}, past the stop`;
    if (Math.abs(x) <= 1 && Math.abs(got - x) > 0.5 / PERSON.steps + 1e-12) return `${x} gives ${got}, not the nearest fiftieth`;
  }
  return '';
}

/* 1. The eyes, at the probes' 4 ms steps and 10 looks a second, the
 * figure scripts' 2 ms and 20, and hover-probe.js's 25 steps of lookback. */
for (const c of [{ stepMs: 4, everyMs: 100 }, { stepMs: 2, everyMs: 50 }, { stepMs: 4, everyMs: 100, back: 25 }, { stepMs: 4, everyMs: 100, delayMs: 0 }]) {
  const why = eyesBroken(eyes, c);
  check(`the eyes see ${c.delayMs ?? PERSON.delayMs} ms late, on a ${c.everyMs} ms beat, at ${c.stepMs} ms steps${c.back ? `, ${c.back} back` : ''}`, why === '', why);
}
/* Their negative controls: eyes a step late, and eyes that look a step
 * before they have seen the delay, must both be caught. A look every step
 * puts a beat on that step, so the early look is seen. */
check('the eyes see 200 ms late looking every step', eyesBroken(eyes, { stepMs: 4, everyMs: 4 }) === '');
const late = (o) => {
  const e = eyes({ ...o, backMax: o.backMax + 1 });
  return { ...e, ago: (back = 0) => e.ago(back + 1) };
};
const eager = (o) => {
  const e = eyes(o);
  return { ...e, looks: (ms, back = 0) => ms % o.everyMs === 0 && e.ago(back - 1) !== undefined };
};
check('negative control: eyes a step late are caught', eyesBroken(late, { stepMs: 4, everyMs: 100 }) !== '');
check('negative control: eyes that look before the delay are caught', eyesBroken(eager, { stepMs: 4, everyMs: 4 }) !== '');
{
  /* A race's eyes take 250 rows a second: they keep only what the delay
   * and the furthest look back can still see, and refuse a look past it. */
  const eye = eyes({ stepMs: 4, backMax: 25 });
  for (let ms = 0; ms <= 60000; ms += 4) eye.push({ ms });
  const rows = eye.rows();
  let past = false;
  try { eye.ago(26); } catch { past = true; }
  check('the eyes keep the newest lag + backMax + 1 rows and refuse a look past them',
    rows.length === eye.lag + 26 && rows[0].ms === 60000 - (eye.lag + 25) * 4 && past, `${rows.length} rows kept, from ${rows[0].ms} ms`);
}
let threw = false;
try { eyes({ stepMs: 4, everyMs: 50 }); } catch { threw = true; }
check('a beat that is not whole steps is refused', threw);

/* 2. The hand, and its negative controls: a quantiser in 49ths and one
 * without its stops must both be caught. */
const handWhy = handBroken(quant);
check('the hand moves in fiftieths, the nearest one, never past a stop', handWhy === '', handWhy);
check('negative control: a hand in 49ths is caught', handBroken((x) => clamp(Math.round(x * 49) / 49)) !== '');
check('negative control: a hand without its stops is caught', handBroken((x) => Math.round(x * PERSON.steps) / PERSON.steps) !== '');

/* 3. A toy roll axis, phi'' = L u - a phi' (a roll mode of a = 8 /s and
 * L = 40 rad/s^2 per unit stick, an aerobatic model's order), started
 * 0.3 rad off and held for 10 s within 0.35 rad by a grid of pilots,
 * u = quant(-k phi - kd p) through the eyes. */
function holds(delayMs, k, kd) {
  const MS = 4;
  const eye = eyes({ stepMs: MS, delayMs });
  let phi = 0.3, p = 0, u = 0;
  for (let ms = 0; ms < 10000; ms += MS) {
    eye.push({ phi, p });
    if (eye.looks(ms)) {
      const d = eye.ago();
      u = quant(-k * d.phi - kd * d.p);
    }
    p += (40 * u - 8 * p) * MS / 1000;
    phi += p * MS / 1000;
    if (Math.abs(phi) > 0.35) return false;
  }
  return true;
}
const count = (delayMs) => {
  let n = 0;
  for (const k of [0.1, 0.2, 0.4, 0.7, 1, 1.5, 2.5, 4]) for (const kd of [0, 0.05, 0.1, 0.2, 0.4]) if (holds(delayMs, k, kd)) n += 1;
  return n;
};
const seeing = count(PERSON.delayMs);
const instant = count(0);
check('a person 0.2 s late holds fewer of the grid than one with no delay', seeing < instant, `${seeing} against ${instant} of 40`);
check('and some of the grid still hold it, 0.2 s late', seeing > 0, `${seeing} of 40`);

console.log(`\npersonpilot selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
