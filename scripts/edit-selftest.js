/*
 * edit-selftest.js: the movie editor's edit model (src/replay/edit.js) and
 * its place in the replay file, in plain Node.
 *
 * 1. Every operation returns a new, frozen edit and leaves its input as
 *    it was; cut, removeCut, moveCut, setIn and setOut keep every shot at
 *    least MIN_SHOT_S long, and the refusals of each are what they say.
 * 2. Time: movieDuration is the sum of each shot over its speed, clip to
 *    movie and back is the identity at 10 000 random times.
 * 3. planMovie from 0.05 s to 300 s at 30 and 60 fps: the frame count,
 *    clip time rising, whole microsecond stamps that add up, steps that
 *    land on the next frame's time, and the owner's 120 s cap.
 * 4. The transitions as weights: cut, blend (clamped to its shot) and
 *    glide, the weight in [0, 1] and continuous where one hands over.
 * 5. Keys become shots exactly: fromKeys mixed as the weights say is
 *    evaluateKeys (src/replay/cameras.js) at 2000 times for four keys of
 *    four rigs, and the keys too close together or to the end.
 * 6. The sounds of the movie at their movie times, slowed shots quieter.
 * 7. Undo: 250 commits keep 200, a gesture of 50 previews is one step, a
 *    gesture that ends where it began is none, a commit after an undo
 *    clears the redo.
 * 8. checkEdit refuses each bad field with a reason that names it.
 * 9. trimEdit shifts the shots with the trim and back again.
 * 10. The file: a version 6 clip round trips with its edit; a default
 *    edit is still the version before, byte for byte; keys are not written
 *    beside an edit; the version 6 refusals.
 *
 * Run: npm run edit:selftest
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
  BLENDS, EditError, HISTORY_MAX, MIN_SHOT_S, MOVIE_MAX_S, SHOTS_MAX, SPEEDS,
  checkEdit, clipTime, createHistory, cueTimes, cut, defaultEdit, fromKeys, isDefault, movieDuration, movieTime,
  moveCut, nearestCut, planMovie, removeCut, setCam, setEnter, setIn, setLook, setOut, setSpeed, shotAt, trimEdit, weights,
} from '../src/replay/edit.js';
import {
  createPose, defaults, evaluate, evaluateKeys,
} from '../src/replay/cameras.js';
import { createRecorder, slerp } from '../src/replay/recorder.js';
import { FILE_VERSION, ReplayFileError, decodeReplay, encodeReplay } from '../src/replay/file.js';

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

/* A small fixed generator, so a failure is the same failure next run. */
let seed = 0x2545f491;
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

const cam = (rig, extra = {}) => ({
  rig, target: -1, watch: 0, p: { ...defaults(rig, 1), ...extra },
});
const CHASE = cam('chase');
const json = (x) => JSON.stringify(x);

/* A four shot edit over a 30 s clip: every speed but one, every entry. */
function fourShots() {
  let e = defaultEdit(30, CHASE);
  e = setIn(e, 2);
  e = setOut(e, 26);
  for (const t of [8, 14, 20]) {
    e = cut(e, t);
  }
  e = setCam(e, 1, cam('orbit', { az: 1.9 }));
  e = setCam(e, 2, cam('free', { pos: [4, 2, -7] }));
  e = setCam(e, 3, cam('fpv'));
  e = setSpeed(e, 1, 0.25);
  e = setSpeed(e, 3, 2);
  e = setEnter(e, 1, { type: 'blend', d: 0.5 });
  e = setEnter(e, 2, { type: 'glide' });
  return e;
}

/* ---- 1. operations ---- */

function operations() {
  console.log('1. every operation returns a new edit and leaves its input alone');
  const e = fourShots();
  check(e.shots.length === 4 && e.shots[0].t0 === 2 && e.out === 26, 'four shots from In 2 s to Out 26 s',
    e.shots.map((s) => `${s.t0} ${s.cam.rig} ${s.speed}x ${s.enter.type}`).join(', '));
  const before = json(e);
  const ops = [
    ['cut', (x) => cut(x, 11)],
    ['removeCut', (x) => removeCut(x, 2)],
    ['moveCut', (x) => moveCut(x, 1, 9)],
    ['setIn', (x) => setIn(x, 1)],
    ['setOut', (x) => setOut(x, 27)],
    ['setCam', (x) => setCam(x, 0, cam('tripod'))],
    ['setSpeed', (x) => setSpeed(x, 0, 0.5)],
    ['setEnter', (x) => setEnter(x, 3, { type: 'blend', d: 1 })],
    ['setLook', (x) => setLook(x, { letterbox: true })],
    ['trimEdit', (x) => trimEdit(x, 1.5, 25)],
  ];
  const bad = [];
  for (const [name, op] of ops) {
    const out = op(e);
    if (out === e || json(e) !== before || !Object.isFrozen(out) || !Object.isFrozen(out.shots[0].cam.p)) {
      bad.push(name);
    }
  }
  check(bad.length === 0, 'each of ten operations gives a new frozen edit and the input deep equal to before', bad.join(', ') || 'all ten');
  let threw = false;
  try {
    e.shots[0].cam.p.dist = 9;
  } catch (err) {
    threw = err instanceof TypeError;
  }
  check(threw && e.shots[0].cam.p.dist === CHASE.p.dist, 'writing into an edit throws, so the past cannot be rewritten');
  const mine = cam('orbit');
  const set = setCam(e, 1, mine);
  mine.p.az = 5;
  check(set.shots[1].cam.p.az === defaults('orbit', 1).az && set.shots[1].cam.p !== mine.p, 'a camera\'s numbers are copied, not shared');

  /* The clamps. */
  check(cut(e, 8 + MIN_SHOT_S / 2) === e && cut(e, 8 - MIN_SHOT_S / 2) === e, 'no cut within MIN_SHOT_S of a cut');
  check(cut(e, 1) === e && cut(e, 26.5) === e && cut(e, 2.01) === e && cut(e, 25.99) === e, 'no cut outside In to Out or next to an edge');
  const c = cut(e, 11);
  check(c.shots.length === 5 && c.shots[2].t0 === 11 && json(c.shots[2].cam) === json(e.shots[1].cam)
    && c.shots[2].speed === 0.25 && c.shots[2].enter.type === 'cut' && c.shots[1].enter.type === 'blend',
  'a cut splits the shot: the same camera and speed, the new half starts with a cut, the old keeps its blend');
  check(shotAt(c, 11) === 2 && shotAt(c, 11 - 1e-9) === 1 && shotAt(c, 0) === 0 && shotAt(c, 99) === 4,
    'a time on a cut belongs to the shot after it; before In the first shot, after Out the last');
  let full = defaultEdit(30, CHASE);
  for (let k = 1; k < 100; k += 1) {
    full = cut(full, k * 0.2);
  }
  check(full.shots.length === SHOTS_MAX && cut(full, 29) === full, `at most ${SHOTS_MAX} shots`, `${full.shots.length}`);
  const r = removeCut(e, 2);
  check(r.shots.length === 3 && r.shots[1].t0 === 8 && r.shots[2].t0 === 20 && r.shots[2].cam.rig === 'fpv', 'removing a cut lets the shot before run on');
  const lo = moveCut(e, 2, 0);
  const hi = moveCut(e, 2, 99);
  check(Math.abs(lo.shots[2].t0 - (8 + MIN_SHOT_S)) < 1e-12 && Math.abs(hi.shots[2].t0 - (20 - MIN_SHOT_S)) < 1e-12,
    'a moved cut stops MIN_SHOT_S from its neighbours', `${lo.shots[2].t0}, ${hi.shots[2].t0}`);
  check(setIn(e, -3).shots[0].t0 === 0 && Math.abs(setIn(e, 50).shots[0].t0 - (8 - MIN_SHOT_S)) < 1e-12, 'In stops at 0 and before the first cut');
  check(Math.abs(setOut(e, 0).out - (20 + MIN_SHOT_S)) < 1e-12, 'Out stops after the last cut');
  check(setEnter(e, 0, { type: 'glide' }) === e, 'the first shot always starts with a cut');
  check(nearestCut(e, 13) === 2 && nearestCut(e, 0) === 1 && nearestCut(defaultEdit(5, CHASE), 2) === -1, 'the nearest cut, or none');
  const refusals = [
    ['removeCut(0)', () => removeCut(e, 0)],
    ['removeCut(4)', () => removeCut(e, 4)],
    ['moveCut(0)', () => moveCut(e, 0, 1)],
    ['setSpeed 3x', () => setSpeed(e, 0, 3)],
    ['setEnter blend 2 s', () => setEnter(e, 1, { type: 'blend', d: 2 })],
    ['setEnter wipe', () => setEnter(e, 1, { type: 'wipe' })],
    ['setCam dolly', () => setCam(e, 1, { ...CHASE, rig: 'dolly' })],
    ['setCam shot 9', () => setCam(e, 9, CHASE)],
  ];
  const quiet = refusals.filter(([, f]) => {
    try {
      f();
      return true;
    } catch (err) {
      return !(err instanceof RangeError);
    }
  });
  check(quiet.length === 0, 'a shot, cut, speed, transition or rig that is not one throws', quiet.map(([n]) => n).join(', ') || `${refusals.length} refused`);
}

/* ---- 2. time ---- */

function randomEdit() {
  const dur = 1 + rand() * 29;
  let e = defaultEdit(dur, CHASE);
  const cuts = Math.floor(rand() * 12);
  for (let k = 0; k < cuts; k += 1) {
    e = cut(e, rand() * dur);
  }
  e = setIn(e, rand() * dur * 0.2);
  e = setOut(e, dur - rand() * dur * 0.2);
  for (let i = 0; i < e.shots.length; i += 1) {
    e = setSpeed(e, i, SPEEDS[Math.floor(rand() * SPEEDS.length)]);
  }
  return e;
}

function time() {
  console.log('2. clip time to movie time and back');
  let worstDur = 0;
  let worstBack = 0;
  let nan = 0;
  for (let k = 0; k < 200; k += 1) {
    const e = randomEdit();
    let sum = 0;
    for (let i = 0; i < e.shots.length; i += 1) {
      const t1 = i + 1 < e.shots.length ? e.shots[i + 1].t0 : e.out;
      sum += (t1 - e.shots[i].t0) / e.shots[i].speed;
    }
    worstDur = Math.max(worstDur, Math.abs(movieDuration(e) - sum));
    for (let j = 0; j < 50; j += 1) {
      const t = e.shots[0].t0 + rand() * (e.out - e.shots[0].t0);
      worstBack = Math.max(worstBack, Math.abs(clipTime(e, movieTime(e, t)) - t));
    }
    nan += Number.isNaN(movieTime(e, e.shots[0].t0 - 1e-6)) && Number.isNaN(movieTime(e, e.out + 1e-6)) ? 0 : 1;
  }
  check(worstDur <= 1e-12, 'movieDuration is the sum of each shot over its speed', worstDur.toExponential(2));
  check(worstBack <= 1e-9, 'clipTime(movieTime(t)) is t at 10 000 random times', worstBack.toExponential(2));
  check(nan === 0, 'movie time is NaN outside In to Out');
  const e = fourShots();
  const d = movieDuration(e);
  check(clipTime(e, -5) === 2 && clipTime(e, d + 5) === 26 && movieTime(e, 2) === 0 && Math.abs(movieTime(e, 26) - d) < 1e-12,
    'In is movie time 0, Out the movie\'s length, and movie time is clamped to it', `${d.toFixed(3)} s`);
  check(Math.abs(d - (6 + 6 / 0.25 + 6 + 6 / 2)) < 1e-12, 'four shots of 6 s at 1, 0.25, 1 and 2x make a 39 s movie');
}

/* ---- 3. the frame plan ---- */

function plan() {
  console.log('3. the movie as frames');
  const bad = [];
  let plans = 0;
  for (const fps of [30, 60]) {
    for (const len of [0.05, 0.1, 1 / 3, 1, 7.77, 30, 60, 119.99, 120, 150, 300]) {
      for (const speed of [1, 0.25]) {
        /* A movie of `len` seconds: two shots at `speed` where the clip is
         * long enough to cut, one where it is not. */
        let e = cut(defaultEdit(len * speed, CHASE), len * speed * 0.5);
        for (let i = 0; i < e.shots.length; i += 1) {
          e = setSpeed(e, i, speed);
        }
        const dur = movieDuration(e);
        const p = planMovie(e, fps);
        plans += 1;
        const want = dur > MOVIE_MAX_S ? MOVIE_MAX_S * fps : Math.max(1, Math.round(dur * fps));
        let ok = p.n === want && p.capped === dur > MOVIE_MAX_S && p.clipT.length === p.n && p.us.length === p.n + 1;
        let stepErr = 0;
        for (let i = 0; i < p.n; i += 1) {
          ok = ok && Number.isInteger(p.us[i]) && p.us[i] === Math.round((i * 1e6) / fps) && p.us[i + 1] > p.us[i];
          ok = ok && (i === 0 || p.clipT[i] > p.clipT[i - 1]) && p.shot[i] === shotAt(e, p.clipT[i]);
          if (i + 1 < p.n) {
            stepErr = Math.max(stepErr, Math.abs(p.clipT[i] + p.step[i] - p.clipT[i + 1]));
          }
        }
        let durs = 0;
        for (let i = 0; i < p.n; i += 1) {
          durs += p.us[i + 1] - p.us[i];
        }
        ok = ok && durs === Math.round((p.n * 1e6) / fps) && stepErr < 1e-12 && p.clipT[0] === e.shots[0].t0;
        /* The movie's frames end within half a frame of Out: n is the
         * nearest whole number of frames, and the last step stops at Out. */
        const last = p.clipT[p.n - 1] + p.step[p.n - 1];
        if (!p.capped) {
          ok = ok && last <= e.out + 1e-12 && e.out - last <= (speed * 0.5) / fps + 1e-9;
        }
        if (!ok) {
          bad.push(`${len}s@${fps} ${speed}x n ${p.n} want ${want} stepErr ${stepErr}`);
        }
      }
    }
  }
  check(bad.length === 0, 'n frames, clip time rising, integer microsecond stamps that add up to round(n * 1e6 / fps), each step landing on the next frame, the last within half a frame of Out',
    bad.join('; ') || `${plans} plans, 0.05 to 300 s at 30 and 60 fps`);
  const e = fourShots();
  const p = planMovie(e, 60);
  const i = p.clipT.findIndex((t) => t >= 8);
  check(Math.abs(p.step[i + 3] - 0.25 / 60) < 1e-12 && Math.abs(p.step[3] - 1 / 60) < 1e-12,
    'a 0.25x shot advances clip time by 0.25 / 60 a frame, a 1x shot by 1 / 60');
  const across = p.clipT.findIndex((t) => t >= 14) - 1;
  const want = (14 - p.clipT[across]) + ((1 / 60) - (14 - p.clipT[across]) / 0.25);
  check(Math.abs(p.step[across] - want) < 1e-12, 'a frame across a cut steps at each shot\'s speed for its share of the frame',
    `${p.step[across].toFixed(6)} s`);
  let long = defaultEdit(30, CHASE);
  long = setSpeed(long, 0, 0.1);
  const lp = planMovie(long, 60);
  check(lp.capped && lp.n === MOVIE_MAX_S * 60 && Math.abs(lp.clipT[lp.n - 1] - (MOVIE_MAX_S - 1 / 60) * 0.1) < 1e-9,
    `a 300 s movie (30 s at 0.1x) stops at ${MOVIE_MAX_S} s`, `${lp.n} frames, clip ${lp.clipT[lp.n - 1].toFixed(3)} s`);
  let threw = 0;
  for (const f of [0, 29.97, -1, NaN]) {
    try {
      planMovie(e, f);
    } catch (err) {
      threw += err instanceof RangeError ? 1 : 0;
    }
  }
  check(threw === 4, 'a frame rate that is not a whole number above 0 throws');
}

/* ---- 4. weights ---- */

function transitions() {
  console.log('4. the transitions as weights');
  const e = fourShots(); /* shot 1 blends in over 0.5 s at 0.25x, shot 2 glides in */
  const w = (t) => ({ ...weights(e, t) });
  check(json(w(5)) === json({ a: 0, b: 0, w: 0 }) && json(w(21)) === json({ a: 3, b: 3, w: 0 }), 'a plain frame is one shot, weight 0');
  const len = 0.5 * 0.25;
  const mid = w(8 + len / 2);
  check(mid.a === 0 && mid.b === 1 && Math.abs(mid.w - 0.5) < 1e-12, 'half way through a blend: the shot before and this one, eased to a half',
    `${mid.a} ${mid.b} ${mid.w}`);
  check(w(8).w === 0 && w(8).a === 0 && w(8 + len * 0.25).w < 0.25, 'a blend starts on the shot before and eases in');
  /* Shot 2 glides in, so shot 1 moves toward it over what is left of
   * shot 1 once its blend is done. */
  const after = w(8 + len);
  const before = w(8 + len - 1e-9);
  check(after.a === 1 && after.b === 2 && after.w === 0 && before.a === 0 && before.b === 1 && before.w > 1 - 1e-9,
    'where the blend ends the glide begins, both on shot 1\'s camera');
  const gm = w(8 + len + (14 - 8 - len) / 2);
  check(gm.a === 1 && gm.b === 2 && Math.abs(gm.w - 0.5) < 1e-12, 'a glide runs over the rest of the shot before, half way at its middle');
  const end = w(14 - 1e-9);
  check(end.w > 1 - 1e-9 && w(14).a === 2 && w(14).w === 0, 'and arrives on the next shot\'s camera at its cut');
  /* Continuity: the camera the weights pick, mixed as numbers, does not
   * jump where a blend or a glide starts or ends, and does at a cut. */
  const val = [10, 20, 30, 40];
  const at = (t) => {
    const x = weights(e, t);
    return val[x.a] + (val[x.b] - val[x.a]) * x.w;
  };
  let range = true;
  for (let k = 0; k <= 20000; k += 1) {
    const x = weights(e, 2 + (k / 20000) * 24);
    range = range && x.w >= 0 && x.w <= 1;
  }
  const seams = [8, 8 + len, 14].map((t) => Math.abs(at(t) - at(t - 1e-9)));
  check(range && seams.every((d) => d < 1e-6), 'the weight stays in [0, 1], and the blend\'s start and end and the glide\'s arrival are seamless',
    seams.map((d) => d.toExponential(1)).join(', '));
  check(Math.abs(at(20) - at(20 - 1e-6)) === 10, 'the plain cut at 20 s is a jump, as a cut should be');
  /* A blend longer than its shot is clamped to it. */
  let s = defaultEdit(10, CHASE);
  s = cut(s, 4);
  s = cut(s, 4.2);
  s = setEnter(s, 1, { type: 'blend', d: 1 });
  const cl = weights(s, 4.1);
  check(cl.a === 0 && cl.b === 1 && Math.abs(cl.w - 0.5) < 1e-12 && weights(s, 4.2).a === 2, 'a blend longer than its shot is squeezed into it');
  check(BLENDS.join() === '0.25,0.5,1', 'the blends are 0.25, 0.5 and 1 s');
}

/* ---- 5. keys to shots ---- */

/* A craft flying a loop, its parts off on their own paths, for the rigs
 * to point at. */
const ctx = {
  at: (t, target, out) => {
    out[0] = 12 * Math.cos(t * 0.4) + (target >= 0 ? target * 0.7 + t : 0);
    out[1] = 5 + 2 * Math.sin(t * 0.9) - (target >= 0 ? 0.3 * t : 0);
    out[2] = 12 * Math.sin(t * 0.4);
    return out;
  },
  craftQuat: (t, out) => {
    out[0] = 0;
    out[1] = Math.sin(t * 0.2);
    out[2] = 0;
    out[3] = Math.cos(t * 0.2);
    return out;
  },
  fpv: (t, pos, quat) => {
    ctx.at(t, -1, pos);
    ctx.craftQuat(t, quat);
    return 110;
  },
};

const pa = createPose();
const pb = createPose();
/* The camera of an edit at t, mixed as evaluateKeys mixes two keys. */
function evaluateEditRef(edit, t, out) {
  const x = weights(edit, t);
  const A = edit.shots[x.a].cam;
  const B = edit.shots[x.b].cam;
  evaluate(ctx, A.rig, A.p, A.target, t, pa);
  if (x.a === x.b) {
    out.pos = pa.pos.slice();
    out.quat = pa.quat.slice();
    out.fov = pa.fov;
    return out;
  }
  evaluate(ctx, B.rig, B.p, B.target, t, pb);
  for (let i = 0; i < 3; i += 1) {
    out.pos[i] = pa.pos[i] + (pb.pos[i] - pa.pos[i]) * x.w;
  }
  slerp(pa.quat[0], pa.quat[1], pa.quat[2], pa.quat[3], pb.quat[0], pb.quat[1], pb.quat[2], pb.quat[3], x.w, out.quat, 0);
  out.fov = pa.fov + (pb.fov - pa.fov) * x.w;
  return out;
}

function compare(keys, edit, dur, n) {
  const want = createPose();
  const got = createPose();
  let pos = 0;
  let att = 0;
  let fov = 0;
  for (let k = 0; k < n; k += 1) {
    const t = (k / (n - 1)) * dur;
    evaluateKeys(ctx, keys, t, want);
    evaluateEditRef(edit, t, got);
    pos = Math.max(pos, Math.hypot(want.pos[0] - got.pos[0], want.pos[1] - got.pos[1], want.pos[2] - got.pos[2]));
    const dot = Math.abs(want.quat.reduce((s, q, i) => s + q * got.quat[i], 0));
    att = Math.max(att, 1 - Math.min(1, dot));
    fov = Math.max(fov, Math.abs(want.fov - got.fov));
  }
  return { pos, att, fov };
}

function keysToShots() {
  console.log('5. camera keys become shots, the same camera at every time');
  const keys = [
    { t: 3.2, rig: 'orbit', target: -1, p: { ...defaults('orbit', 1), az: 2.1 } },
    { t: 9.5, rig: 'follow', target: 2, p: { ...defaults('follow', 1), dist: 3 } },
    { t: 14.25, rig: 'tripod', target: -1, p: { pos: [4, 1.5, -6], fov: 45 } },
    { t: 21.7, rig: 'free', target: -1, p: { pos: [-3, 8, 2], yaw: 0.7, pitch: -0.3, fov: 72 } },
  ];
  const dur = 28;
  const e = fromKeys(keys, dur, CHASE);
  check(e.shots.length === 5 && e.shots[0].t0 === 0 && e.shots.map((s) => s.enter.type).join() === 'cut,cut,glide,glide,glide'
    && e.out === dur && json(e.shots[1].cam) === json({ rig: 'orbit', target: -1, watch: 0, p: keys[0].p }),
  'four keys: a hold on the first key\'s camera, then one shot a key, each gliding in but the first',
  e.shots.map((s) => `${s.t0} ${s.cam.rig} ${s.enter.type}`).join(', '));
  const r = compare(keys, e, dur, 2000);
  check(r.pos <= 1e-9 && r.att <= 1e-9 && r.fov <= 1e-9, 'the same pose as evaluateKeys at 2000 times',
    `position ${r.pos.toExponential(2)} m, attitude ${r.att.toExponential(2)}, fov ${r.fov.toExponential(2)}`);
  const shuffled = fromKeys([keys[2], keys[0], keys[3], keys[1]], dur, CHASE);
  check(json(shuffled) === json(e), 'the keys\' order in the file does not matter');
  const early = fromKeys([{ ...keys[0], t: 0 }, keys[1]], dur, CHASE);
  const r2 = compare([{ ...keys[0], t: 0 }, keys[1]], early, dur, 2000);
  check(early.shots.length === 2 && r2.pos <= 1e-9, 'a key at 0 s needs no hold before it', `${early.shots.length} shots`);
  check(json(fromKeys([], dur, CHASE)) === json(defaultEdit(dur, CHASE)), 'no keys: the default edit');
  const lateOnly = fromKeys([{ ...keys[1], t: dur - 0.01 }], dur, CHASE);
  check(lateOnly.shots.length === 1 && lateOnly.shots[0].cam.rig === 'follow', 'a key in the last MIN_SHOT_S starts nothing, and alone it frames the clip');
  const close = [keys[0], { ...keys[1], t: keys[0].t + 0.01 }, keys[2]];
  const ce = fromKeys(close, dur, CHASE);
  const rc = compare(close, ce, dur, 2000);
  let ok = true;
  try {
    checkEdit(ce, { duration: dur, peers: 0 });
  } catch (err) {
    ok = false;
  }
  check(ok && ce.shots.length === 3 && ce.shots[1].cam.rig === 'follow', 'keys closer than MIN_SHOT_S: the later one takes the shot, and the edit is valid',
    `worst position difference ${rc.pos.toFixed(3)} m, only in the ${close[1].t - close[0].t} s the old glide lasted`);
}

/* ---- 6. the sounds ---- */

function cues() {
  console.log('6. the sounds of the movie');
  const e = fourShots();
  const events = [
    { t: 1, type: 'cue', kind: 'thud', level: 1 },
    { t: 5, type: 'cue', kind: 'thud', level: 0.8 },
    { t: 10, type: 'schwing', level: 1 },
    { t: 11, type: 'impact', part: 0 },
    { t: 22, type: 'cue', kind: 'crack', level: 0.5 },
    { t: 26.5, type: 'cue', kind: 'crack', level: 1 },
  ];
  const c = cueTimes(e, events);
  check(c.length === 3 && c.map((x) => x.t).join() === '5,10,22', 'the cues and SCHWINGs inside In to Out, nothing else', c.map((x) => `${x.type} ${x.t}`).join(', '));
  check(Math.abs(c[0].m - 3) < 1e-12 && Math.abs(c[1].m - (6 + 2 / 0.25)) < 1e-12 && Math.abs(c[2].m - movieTime(e, 22)) < 1e-12,
    'each at its movie time', c.map((x) => x.m.toFixed(3)).join(', '));
  check(c[0].level === 0.8 && c[1].level === 0.25 && c[2].level === 0.5 && c[0].kind === 'thud', 'a slowed shot plays them quieter, as live playback does');
}

/* ---- 7. undo ---- */

function history() {
  console.log('7. undo and redo');
  const e0 = defaultEdit(30, CHASE);
  const h = createHistory(e0);
  check(!h.canUndo && !h.canRedo && h.current === e0, 'a new history has nothing to undo');
  let e = e0;
  for (let k = 1; k <= 250; k += 1) {
    e = moveCut(cut(e, 15), 1, 5 + k * 0.05);
    e = removeCut(e, 1);
    e = setIn(e, k * 0.01);
    h.commit(e);
  }
  let undos = 0;
  while (h.canUndo) {
    h.undo();
    undos += 1;
  }
  check(undos === HISTORY_MAX - 1 && Math.abs(h.current.shots[0].t0 - 0.51) < 1e-12, `250 commits keep the last ${HISTORY_MAX}`, `${undos} undos back to In ${h.current.shots[0].t0}`);
  while (h.canRedo) {
    h.redo();
  }
  check(h.current === e, 'and redo comes all the way back');

  const g = createHistory(fourShots());
  const base = g.current;
  g.begin();
  for (let k = 0; k < 50; k += 1) {
    g.preview(moveCut(base, 2, 14 + k * 0.1));
  }
  check(g.current.shots[2].t0 === 14 + 49 * 0.1 && g.canUndo, 'during a drag the current edit follows it');
  g.end();
  g.undo();
  check(g.current === base && !g.canUndo, 'a drag of 50 moves is one step');
  g.redo();
  const dragged = g.current;
  g.begin();
  g.preview(moveCut(dragged, 2, 17));
  g.preview(dragged);
  g.end();
  g.undo();
  check(g.current === base, 'a drag that ends where it began is no step');
  g.preview(setSpeed(base, 0, 0.5));
  g.end();
  check(g.current.shots[0].speed === 0.5 && g.canUndo, 'a preview with no begin still becomes a step');
  g.undo();
  check(g.canRedo, 'after an undo there is a redo');
  g.commit(setLook(base, { letterbox: true }));
  check(!g.canRedo && g.current.look.letterbox, 'a commit after an undo clears the redo');
  const same = g.current;
  g.commit(setLook(same, { letterbox: true }));
  g.undo();
  check(g.current === base, 'committing an edit equal to the current one is no step');
  g.begin();
  g.preview(cut(base, 5));
  g.undo();
  check(g.current === base && g.canRedo, 'undo in the middle of a gesture ends it first, then steps back over it');
}

/* ---- 8. checkEdit ---- */

function refusals() {
  console.log('8. an edit from a file is checked field by field');
  const good = JSON.parse(json(fourShots()));
  good.shots[0].cam.watch = 2;
  const info = { duration: 30, peers: 3 };
  let back = null;
  try {
    back = checkEdit(good, info);
  } catch (err) {
    back = err;
  }
  check(back && !(back instanceof Error) && json(back) === json(good) && Object.isFrozen(back) && back !== good,
    'a good edit comes back equal, as a fresh frozen copy');
  const cases = [
    ['edit is not an object', () => null],
    ['edit has an unknown field "script"', (e) => { e.script = 1; }],
    ['edit.v is not 1', (e) => { e.v = 2; }],
    ['edit.look is missing', (e) => { delete e.look; }],
    ['edit.look has an unknown field "hdr"', (e) => { e.look.hdr = true; }],
    ['edit.look.letterbox is not true or false', (e) => { e.look.letterbox = 1; }],
    ['edit.shots is not a list', (e) => { e.shots = {}; }],
    ['edit.shots is not a list of 1 to 64 shots', (e) => { e.shots = []; }],
    ['edit.shots is not a list of 1 to 64 shots', (e) => { e.shots = Array.from({ length: 65 }, (_, i) => ({ ...e.shots[0], t0: i * 0.1, enter: { type: 'cut' } })); }],
    ['edit.shots[1] has an unknown field "fade"', (e) => { e.shots[1].fade = 1; }],
    ['edit.shots[1].t0 is not a finite number', (e) => { e.shots[1].t0 = '8'; }],
    ['edit.shots[0].t0 is before the clip', (e) => { e.shots[0].t0 = -0.1; }],
    ['edit.shots[2].t0 is not 0.05 s after the shot before', (e) => { e.shots[2].t0 = 8; }],
    ['edit.shots[2].t0 is not 0.05 s after the shot before', (e) => { e.shots[2].t0 = 8.01; }],
    ['edit.shots[1].cam.rig is unknown', (e) => { e.shots[1].cam.rig = 'dolly'; }],
    ['edit.shots[1].cam.target is not a part', (e) => { e.shots[1].cam.target = 24; }],
    ['edit.shots[1].cam.target is not a part', (e) => { e.shots[1].cam.target = 0.5; }],
    ['edit.shots[1].cam.watch is not a pilot in the clip', (e) => { e.shots[1].cam.watch = 4; }],
    ['edit.shots[1].cam.watch is not a pilot in the clip', (e) => { e.shots[1].cam.watch = -1; }],
    ['edit.shots[1].cam.watch is missing', (e) => { delete e.shots[1].cam.watch; }],
    ['edit.shots[1].cam.p.dist is missing', (e) => { delete e.shots[1].cam.p.dist; }],
    ['edit.shots[1].cam.p has an unknown field "pos"', (e) => { e.shots[1].cam.p.pos = [0, 0, 0]; }],
    ['edit.shots[1].cam.p.az is not a finite number', (e) => { e.shots[1].cam.p.az = null; }],
    ['edit.shots[2].cam.p.pos is not 3 numbers', (e) => { e.shots[2].cam.p.pos = [1, 2]; }],
    ['edit.shots[2].cam.p.pos[1] is not a finite number', (e) => { e.shots[2].cam.p.pos[1] = 'up'; }],
    ['edit.shots[1].speed is not a speed', (e) => { e.shots[1].speed = 0.3; }],
    ['edit.shots[1].enter.type is unknown', (e) => { e.shots[1].enter = { type: 'wipe' }; }],
    ['edit.shots[1].enter.d is not a blend length', (e) => { e.shots[1].enter.d = 2; }],
    ['edit.shots[1].enter.d is missing', (e) => { delete e.shots[1].enter.d; }],
    ['edit.shots[2].enter has an unknown field "d"', (e) => { e.shots[2].enter.d = 0.5; }],
    ['edit.shots[0].enter of the first shot is not a cut', (e) => { e.shots[0].enter = { type: 'glide' }; }],
    ['edit.out is not a finite number', (e) => { e.out = Infinity; }],
    ['edit.out is not 0.05 s after the last shot starts', (e) => { e.out = 20.01; }],
    ['edit.out is past the end of the clip', (e) => { e.out = 30.001; }],
  ];
  const wrong = [];
  for (const [why, mut] of cases) {
    const e = JSON.parse(json(good));
    const r = mut(e);
    try {
      checkEdit(r === null ? null : e, info);
      wrong.push(`${why}: accepted`);
    } catch (err) {
      if (!(err instanceof EditError) || !err.message.startsWith(why)) {
        wrong.push(`${why}: said "${err.message}"`);
      }
    }
  }
  check(wrong.length === 0, 'each bad field refused with a reason that names it', wrong.join('; ') || `${cases.length} refused`);
  let ok = true;
  try {
    const e = JSON.parse(json(good));
    e.out = 30 + 5e-7;
    checkEdit(e, info);
  } catch (err) {
    ok = false;
  }
  check(ok, 'an Out a rounding past the clip\'s end is let in');
}

/* ---- 9. trim ---- */

function trim() {
  console.log('9. a trimmed clip keeps its shots');
  const e = fourShots();
  const base = 1.9917;
  const t = trimEdit(e, base, 26 - base + 0.004);
  const back = t.shots.map((s) => s.t0 + base);
  check(back.every((x, i) => Math.abs(x - e.shots[i].t0) < 1e-12) && Math.abs(t.out + base - e.out) < 1e-12
    && json(t.shots.map((s) => s.cam)) === json(e.shots.map((s) => s.cam)),
  'every cut and Out shifted by the trim\'s base and back', t.shots.map((s) => s.t0.toFixed(4)).join(', '));
  check(Math.abs(movieDuration(t) - movieDuration(e)) < 1e-9, 'the movie is as long as before');
  let threw = false;
  try {
    trimEdit(e, base, 20 - base);
  } catch (err) {
    threw = err instanceof RangeError;
  }
  check(threw, 'a trim that would cut into the last shot throws');
}

/* ---- 10. the file ---- */

function soloClip(frames) {
  const r = createRecorder(256);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(1, 2, 3, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < frames; f += 1) {
    const i = r.begin(f / 60, (f * 1000) / 60);
    pp.x = f * 0.37;
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [9, 99], sp, 0, false, f, 0.5, 3);
    if (f === 30) {
      r.event('impact', { part: 0, speed: 9 });
    }
  }
  return r.clip({
    name: 'Edit', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'alps', scale: 1, size: 1.8, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
}

function file() {
  console.log('10. the replay file with an edit in it');
  const c = soloClip(121);
  const dur = c.time[c.n - 1];
  const chase18 = { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1.8) };
  const version = (b) => new DataView(b).getUint32(4, true);
  const u8 = (b) => Buffer.from(new Uint8Array(b));

  const plain = encodeReplay({ ...c, keys: [] });
  const withDefault = encodeReplay({ ...c, keys: [], edit: defaultEdit(dur, chase18) });
  check(isDefault(defaultEdit(dur, chase18), dur, chase18) && version(withDefault) === 3 && u8(withDefault).equals(u8(plain)),
    'a clip whose edit is its default is still version 3, the same bytes as with no edit', `${plain.byteLength} bytes`);
  const keyed = [{ t: 0.5, rig: 'orbit', target: -1, p: defaults('orbit', 1.8) }];
  const oldKeys = decodeReplay(encodeReplay({ ...c, keys: keyed }));
  check(oldKeys.keys.length === 1 && oldKeys.edit === undefined, 'a clip with keys and no edit is written and read as before');
  const dropped = decodeReplay(encodeReplay({ ...c, keys: keyed, edit: defaultEdit(dur, chase18) }));
  check(dropped.keys.length === 0 && dropped.edit === undefined, 'keys beside an edit are not written: the edit replaced them');

  let edit = defaultEdit(dur, chase18);
  edit = cut(edit, 0.8);
  edit = setCam(edit, 1, { rig: 'orbit', target: -1, watch: 0, p: defaults('orbit', 1.8) });
  edit = setSpeed(edit, 1, 0.25);
  edit = setEnter(edit, 1, { type: 'blend', d: 0.25 });
  edit = setOut(edit, 1.9);
  const buf = encodeReplay({ ...c, keys: keyed, edit });
  const back = decodeReplay(buf);
  check(FILE_VERSION === 13 && version(buf) === 6 && json(back.edit) === json(edit) && Object.isFrozen(back.edit) && back.keys.length === 0,
    'a clip with an edit and no crown is version 6, and its edit comes back deep equal, frozen, with no keys', `${buf.byteLength} bytes`);
  check(back.peers === undefined && back.paper === undefined && back.n === c.n, 'a version 6 file needs neither peers nor paper');
  const again = encodeReplay(back);
  check(u8(again).equals(u8(buf)), 'written again, the same bytes');

  /* Refusals, each made by rewriting the header of a good file. */
  const reheader = (b, fn, v = null) => {
    const dv = new DataView(b);
    const hl = dv.getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 12, hl)));
    fn(header);
    if (v !== null) {
      header.v = v;
    }
    let text = JSON.stringify(header);
    /* Keep the header's length so the columns stay where they were. */
    if (text.length > hl) {
      throw new Error('the rewritten header is longer');
    }
    text = text.padEnd(hl, ' ');
    const out = b.slice(0);
    new Uint8Array(out).set(new TextEncoder().encode(text), 12);
    new DataView(out).setUint32(4, v ?? version(b), true);
    return out;
  };
  const refused = (b, why, says) => {
    try {
      decodeReplay(b);
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError && err.message.includes(says), `refused: ${why}`, err.message);
    }
  };
  refused(reheader(buf, (h) => { delete h.edit; }), 'a version 6 file without its edit', 'without its edit');
  refused(reheader(buf, (h) => { h.keys = keyed; h.edit.shots.length = 1; h.edit.out = 1; }), 'a version 6 file with keys', 'camera keys');
  refused(reheader(buf, (h) => { h.edit.shots[1].speed = 3; }), 'a bad shot speed, by the field', 'edit.shots[1].speed');
  refused(reheader(buf, (h) => { h.edit.out = dur + 1; }), 'an Out past the clip', 'edit.out is past the end');
  refused(reheader(buf, (h) => { h.edit.shots[0].cam.watch = 1; }), 'a pilot a single player clip does not have', 'watch');
  refused(reheader(buf, () => {}, 5), 'an edit in a version 5 file without paper', 'without its paper');
  refused(reheader(buf, () => {}, 3), 'an edit in a version 3 file', 'an edit in a file older than version 6');
  let unsaved = null;
  try {
    encodeReplay({ ...c, edit: setOut(edit, dur + 1) });
  } catch (err) {
    unsaved = err;
  }
  check(unsaved instanceof ReplayFileError && unsaved.message === 'edit.out is past the end of the clip',
    'an edit that does not fit its clip is refused on the way out too', unsaved && unsaved.message);
  let threw = null;
  try {
    decodeReplay(reheader(buf, (h) => { delete h.edit; }, 14));
  } catch (err) {
    threw = err;
  }
  check(threw instanceof ReplayFileError && threw.message === 'version 14, this build reads 1 and 2 and 3 and 4 and 5 and 6 and 7 and 8 and 9 and 10 and 11 and 12 and 13',
    'a version 14 file is refused by name', threw && threw.message);
}

operations();
time();
plan();
transitions();
keysToShots();
cues();
history();
refusals();
trim();
file();

if (failures) {
  console.log(`edit:selftest FAILED: ${failures}`);
  process.exit(1);
}
console.log('edit:selftest ok');
