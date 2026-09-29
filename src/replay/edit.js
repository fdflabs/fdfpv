/*
 * edit.js: a replay cut into a movie, as data.
 *
 * An EDIT is a list of shots laid over one clip (docs/EDITOR-PLAN.md,
 * section 3). A shot is a stretch of clip time with one camera, one
 * playback speed and one way of starting: a cut, a blend (a short mix of
 * movie time) or a glide (the shot before moves all the way into this
 * one, which is what the old camera keys did). The movie is the shots laid
 * end to end, each lasting its clip length over its speed.
 *
 * Every operation here returns a new edit and never touches its input, and
 * every edit it returns is frozen all the way down, so an undo history is
 * a list of references and a stray write throws instead of rewriting the
 * past. Nothing here knows about the DOM, Three.js or the clock, so the
 * whole model runs in Node (scripts/edit-selftest.js).
 *
 * Times are clip seconds unless the name says movie. Shot i covers
 * [shots[i].t0, shots[i + 1].t0), the last one [t0, out); a time exactly
 * on a cut belongs to the shot after it.
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

import { RIGS, defaults, easeInOut } from './cameras.js';
import { PARTS_MAX } from './recorder.js';

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
/* A blend's length, movie seconds. */
export const BLENDS = [0.25, 0.5, 1];
export const MIN_SHOT_S = 0.05;
export const SHOTS_MAX = 64;
/* The longest movie, movie seconds: the owner's cap, so a 30 s clip at
 * 0.1x (a 300 s movie, about 375 MB at 1080p60) is never encoded whole.
 * planMovie stops there and says so. */
export const MOVIE_MAX_S = 120;
export const ENTERS = ['cut', 'blend', 'glide'];
/* Undo steps kept, the current edit included. */
export const HISTORY_MAX = 200;

/* Round off allowed where two times that should agree came through a
 * subtraction (a trim's shift), seconds. */
const SLACK = 1e-9;

/* A refusal of checkEdit: the message names the field. */
export class EditError extends Error {}

/* ---- building edits ---- */

function copyCam(cam) {
  return {
    rig: cam.rig,
    target: cam.target,
    watch: cam.watch ?? 0,
    p: copyP(cam.p),
  };
}

function copyP(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    out[k] = Array.isArray(v) ? v.slice() : v;
  }
  return out;
}

function copyEnter(e) {
  return e.type === 'blend' ? { type: 'blend', d: e.d } : { type: e.type };
}

function copyShot(s) {
  return {
    t0: s.t0, cam: copyCam(s.cam), speed: s.speed, enter: copyEnter(s.enter),
  };
}

function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      deepFreeze(v);
    }
  }
  return Object.freeze(o);
}

/* The one door every new edit goes out through: fresh objects, frozen. */
function make(out, look, shots) {
  return deepFreeze({
    v: 1, out, look: { letterbox: Boolean(look.letterbox) }, shots: shots.map(copyShot),
  });
}

/* The whole clip, one shot with `cam`. */
export function defaultEdit(duration, cam) {
  return make(duration, { letterbox: false }, [{
    t0: 0, cam, speed: 1, enter: { type: 'cut' },
  }]);
}

/* Whether `edit` is what defaultEdit(duration, cam) gives, so a file need
 * not carry it. */
export function isDefault(edit, duration, cam) {
  const d = defaultEdit(duration, cam);
  return Math.abs(edit.out - duration) <= SLACK
    && JSON.stringify({ ...edit, out: 0 }) === JSON.stringify({ ...d, out: 0 });
}

/*
 * Camera keys ({ t, rig, target, p }, the file's versions 1 to 5) as the
 * edit that frames the same pictures: the first key's camera holds until
 * that key, then each key starts a shot that the one before glides into,
 * and the last key's camera holds to the end. That is evaluateKeys in
 * src/replay/cameras.js, shot for shot. Where keys are closer than a shot
 * can be, the later key's camera takes the shot (the dropped glide lasted
 * under MIN_SHOT_S), and a key within MIN_SHOT_S of the end starts
 * nothing.
 */
export function fromKeys(keys, duration, fallbackCam) {
  const sorted = keys.slice().sort((a, b) => a.t - b.t);
  const ks = sorted.filter((k) => k.t < duration - MIN_SHOT_S);
  if (!ks.length) {
    return defaultEdit(duration, sorted.length ? { ...sorted[0], watch: 0 } : fallbackCam);
  }
  const shots = [{
    t0: 0, cam: { ...ks[0], watch: 0 }, speed: 1, enter: { type: 'cut' },
  }];
  for (const k of ks) {
    const prev = shots[shots.length - 1];
    const cam = { ...k, watch: 0 };
    if (k.t - prev.t0 < MIN_SHOT_S) {
      prev.cam = cam;
      continue;
    }
    shots.push({
      t0: k.t, cam, speed: 1, enter: { type: k === ks[0] ? 'cut' : 'glide' },
    });
  }
  return make(duration, { letterbox: false }, shots);
}

/* ---- reading edits ---- */

/* The clip time shot i ends. */
function endOf(edit, i) {
  return i + 1 < edit.shots.length ? edit.shots[i + 1].t0 : edit.out;
}

/* The shot at clip time t: before In the first, from Out on the last. */
export function shotAt(edit, t) {
  const s = edit.shots;
  let i = 0;
  while (i + 1 < s.length && s[i + 1].t0 <= t) {
    i += 1;
  }
  return i;
}

/* The cut (a shot index, 1 or more) nearest t, or -1 with only one shot. */
export function nearestCut(edit, t) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < edit.shots.length; i += 1) {
    const d = Math.abs(edit.shots[i].t0 - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/* ---- changing edits ---- */

function cutIndex(edit, i) {
  if (!Number.isInteger(i) || i < 1 || i >= edit.shots.length) {
    throw new RangeError(`no cut ${i} in an edit of ${edit.shots.length} shots`);
  }
}

function shotIndex(edit, i) {
  if (!Number.isInteger(i) || i < 0 || i >= edit.shots.length) {
    throw new RangeError(`no shot ${i} in an edit of ${edit.shots.length} shots`);
  }
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/* Split the shot under t into two with the same camera and speed. The
 * input comes back unchanged when t is outside In to Out, within
 * MIN_SHOT_S of a cut or an edge, or the edit already has SHOTS_MAX. */
export function cut(edit, t) {
  const i = shotAt(edit, t);
  const s = edit.shots[i];
  if (edit.shots.length >= SHOTS_MAX || t - s.t0 < MIN_SHOT_S || endOf(edit, i) - t < MIN_SHOT_S) {
    return edit;
  }
  const shots = edit.shots.slice();
  shots.splice(i + 1, 0, {
    t0: t, cam: s.cam, speed: s.speed, enter: { type: 'cut' },
  });
  return make(edit.out, edit.look, shots);
}

/* Take cut i away: shot i - 1 runs on over shot i. */
export function removeCut(edit, i) {
  cutIndex(edit, i);
  const shots = edit.shots.slice();
  shots.splice(i, 1);
  return make(edit.out, edit.look, shots);
}

/* Cut i to t, kept MIN_SHOT_S from its neighbours. */
export function moveCut(edit, i, t) {
  cutIndex(edit, i);
  const lo = edit.shots[i - 1].t0 + MIN_SHOT_S;
  const hi = endOf(edit, i) - MIN_SHOT_S;
  const shots = edit.shots.slice();
  shots[i] = { ...shots[i], t0: clamp(t, lo, hi) };
  return make(edit.out, edit.look, shots);
}

/* In, the first shot's start: from 0 to MIN_SHOT_S before the next cut
 * (or Out). */
export function setIn(edit, t) {
  const shots = edit.shots.slice();
  shots[0] = { ...shots[0], t0: clamp(t, 0, endOf(edit, 0) - MIN_SHOT_S) };
  return make(edit.out, edit.look, shots);
}

/* Out, where the last shot ends: at least MIN_SHOT_S after its start. The
 * caller keeps it within the clip; checkEdit refuses an Out past it. */
export function setOut(edit, t) {
  const last = edit.shots[edit.shots.length - 1];
  return make(Math.max(t, last.t0 + MIN_SHOT_S), edit.look, edit.shots);
}

export function setCam(edit, i, cam) {
  shotIndex(edit, i);
  if (!RIGS.includes(cam.rig)) {
    throw new RangeError(`no rig ${cam.rig}`);
  }
  const shots = edit.shots.slice();
  shots[i] = { ...shots[i], cam };
  return make(edit.out, edit.look, shots);
}

export function setSpeed(edit, i, speed) {
  shotIndex(edit, i);
  if (!SPEEDS.includes(speed)) {
    throw new RangeError(`no speed ${speed}`);
  }
  const shots = edit.shots.slice();
  shots[i] = { ...shots[i], speed };
  return make(edit.out, edit.look, shots);
}

/* How shot i starts. The first shot always starts with a cut, so anything
 * else asked of it comes back unchanged. */
export function setEnter(edit, i, enter) {
  shotIndex(edit, i);
  if (!ENTERS.includes(enter.type) || (enter.type === 'blend' && !BLENDS.includes(enter.d))) {
    throw new RangeError(`no transition ${JSON.stringify(enter)}`);
  }
  if (i === 0 && enter.type !== 'cut') {
    return edit;
  }
  const shots = edit.shots.slice();
  shots[i] = { ...shots[i], enter };
  return make(edit.out, edit.look, shots);
}

export function setLook(edit, look) {
  return make(edit.out, look, edit.shots);
}

/* The edit of trimClip(clip, ...) (src/replay/recorder.js): every time
 * less `base` (the clip time of the trimmed clip's first row, never after
 * In), Out no later than `end` (its last row's time, never before Out
 * less `base` when the trim was In to Out). */
export function trimEdit(edit, base, end) {
  const shots = edit.shots.map((s) => ({ ...s, t0: Math.max(0, s.t0 - base) }));
  const out = Math.min(end, edit.out - base);
  if (!(out - shots[shots.length - 1].t0 >= MIN_SHOT_S - SLACK)) {
    throw new RangeError(`a trim to ${base} .. ${base + end} cuts into the last shot`);
  }
  return make(out, edit.look, shots);
}

/* ---- time ---- */

export function movieDuration(edit) {
  let m = 0;
  for (let i = 0; i < edit.shots.length; i += 1) {
    m += (endOf(edit, i) - edit.shots[i].t0) / edit.shots[i].speed;
  }
  return m;
}

/* Clip time to movie time; NaN outside In to Out. */
export function movieTime(edit, t) {
  if (!(t >= edit.shots[0].t0 && t <= edit.out)) {
    return NaN;
  }
  const k = shotAt(edit, t);
  let m = 0;
  for (let i = 0; i < k; i += 1) {
    m += (endOf(edit, i) - edit.shots[i].t0) / edit.shots[i].speed;
  }
  return m + (t - edit.shots[k].t0) / edit.shots[k].speed;
}

/* Movie time to clip time, m clamped to the movie. */
export function clipTime(edit, m) {
  let at = 0;
  const n = edit.shots.length;
  for (let i = 0; i < n; i += 1) {
    const s = edit.shots[i];
    const len = (endOf(edit, i) - s.t0) / s.speed;
    if (m < at + len || i === n - 1) {
      return Math.min(endOf(edit, i), s.t0 + Math.max(0, m - at) * s.speed);
    }
    at += len;
  }
  return edit.out;
}

/*
 * The movie as frames at `fps`: frame i shows movie time i / fps, which is
 * clip time clipT[i] in shot shot[i]; step[i] is the clip time from frame
 * i to frame i + 1 (the next shot's speed counted from the cut on, and no
 * further than Out for the last frame), so stepping the air frame by
 * frame lands on each frame's clip time. us[i] is frame i's timestamp in whole
 * microseconds, us[n] the movie's end, so a frame lasts us[i + 1] - us[i]
 * and 30 fps never drifts. A movie longer than MOVIE_MAX_S stops there,
 * and `capped` says so.
 */
export function planMovie(edit, fps) {
  if (!Number.isInteger(fps) || fps < 1) {
    throw new RangeError(`fps ${fps} is not a whole number of frames`);
  }
  const dur = movieDuration(edit);
  const capped = dur > MOVIE_MAX_S;
  const n = capped ? MOVIE_MAX_S * fps : Math.max(1, Math.round(dur * fps));
  const clipT = new Float64Array(n);
  const shot = new Int16Array(n);
  const step = new Float64Array(n);
  const us = new Float64Array(n + 1);
  let next = clipTime(edit, 0);
  for (let i = 0; i < n; i += 1) {
    clipT[i] = next;
    next = clipTime(edit, (i + 1) / fps);
    step[i] = next - clipT[i];
    shot[i] = shotAt(edit, clipT[i]);
    us[i] = Math.round((i * 1e6) / fps);
  }
  us[n] = Math.round((n * 1e6) / fps);
  return {
    n, fps, capped, clipT, shot, step, us,
  };
}

/*
 * The camera at clip time t as a mix: shot a's camera moved toward shot
 * b's by w, eased (b === a and w === 0 for a plain frame). A blend into
 * shot i mixes from shot i - 1's camera, still running past its end, over
 * the blend's movie seconds at shot i's speed, clamped to the shot. A
 * glide into shot i + 1 runs over the whole of shot i, or over what is
 * left of it after a blend into it, so the two never pull at once and the
 * camera never jumps where one hands over to the other.
 */
export function weights(edit, t, out = { a: 0, b: 0, w: 0 }) {
  const i = shotAt(edit, t);
  const s = edit.shots[i];
  const end = endOf(edit, i);
  let from = s.t0;
  if (s.enter.type === 'blend') {
    const len = Math.min(s.enter.d * s.speed, end - s.t0);
    from = s.t0 + len;
    if (t < from) {
      out.a = i - 1;
      out.b = i;
      out.w = easeInOut((t - s.t0) / len);
      return out;
    }
  }
  const next = edit.shots[i + 1];
  if (next && next.enter.type === 'glide' && end > from) {
    out.a = i;
    out.b = i + 1;
    out.w = easeInOut((t - from) / (end - from));
    return out;
  }
  out.a = i;
  out.b = i;
  out.w = 0;
  return out;
}

/* The sounds to schedule in the movie: each cue (a wreck sound), SCHWING
 * and coin in `events` inside In to Out, at its movie time `m`, its level
 * scaled down by a slow shot's speed as live playback does. Sorted by m. */
const SOUND_EVENTS = ['cue', 'schwing', 'coin'];
export function cueTimes(edit, events) {
  return events
    .filter((e) => SOUND_EVENTS.includes(e.type) && e.t >= edit.shots[0].t0 && e.t < edit.out)
    .map((e) => ({
      ...e,
      m: movieTime(edit, e.t),
      level: (e.level ?? 1) * Math.min(1, edit.shots[shotAt(edit, e.t)].speed),
    }))
    .sort((a, b) => a.m - b.m);
}

/* ---- checking an edit from a file ---- */

const EDIT_KEYS = ['v', 'out', 'look', 'shots'];
const LOOK_KEYS = ['letterbox'];
const SHOT_KEYS = ['t0', 'cam', 'speed', 'enter'];
const CAM_KEYS = ['rig', 'target', 'watch', 'p'];

function fields(o, keys, what) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    throw new EditError(`${what} is not an object`);
  }
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) {
      throw new EditError(`${what} has an unknown field ${JSON.stringify(k).slice(0, 40)}`);
    }
  }
  for (const k of keys) {
    if (o[k] === undefined) {
      throw new EditError(`${what}.${k} is missing`);
    }
  }
}

function num(x, what) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new EditError(`${what} is not a finite number`);
  }
  return x;
}

function checkCam(cam, info, what) {
  fields(cam, CAM_KEYS, what);
  if (!RIGS.includes(cam.rig)) {
    throw new EditError(`${what}.rig is unknown`);
  }
  if (!Number.isInteger(cam.target) || cam.target < -1 || cam.target >= PARTS_MAX) {
    throw new EditError(`${what}.target is not a part`);
  }
  if (!Number.isInteger(cam.watch) || cam.watch < 0 || cam.watch > info.peers) {
    throw new EditError(`${what}.watch is not a pilot in the clip`);
  }
  /* Exactly the numbers the rig is evaluated with, so a camera from a file
   * never reaches evaluate() with one missing. */
  const want = defaults(cam.rig);
  fields(cam.p, Object.keys(want), `${what}.p`);
  for (const k of Object.keys(want)) {
    if (Array.isArray(want[k])) {
      if (!Array.isArray(cam.p[k]) || cam.p[k].length !== want[k].length) {
        throw new EditError(`${what}.p.${k} is not ${want[k].length} numbers`);
      }
      cam.p[k].forEach((x, j) => num(x, `${what}.p.${k}[${j}]`));
    } else {
      num(cam.p[k], `${what}.p.${k}`);
    }
  }
}

function checkEnter(e, i, what) {
  if (!e || typeof e !== 'object' || !ENTERS.includes(e.type)) {
    throw new EditError(`${what}.type is unknown`);
  }
  fields(e, e.type === 'blend' ? ['type', 'd'] : ['type'], what);
  if (e.type === 'blend' && !BLENDS.includes(e.d)) {
    throw new EditError(`${what}.d is not a blend length`);
  }
  if (i === 0 && e.type !== 'cut') {
    throw new EditError(`${what} of the first shot is not a cut`);
  }
}

/*
 * An edit from outside (a file's header) checked field by field against
 * its clip, `info` { duration, peers }: the clip's length in seconds and
 * how many other pilots it holds (a watch is 0 or 1 to peers). Throws an
 * EditError naming the field; returns the edit as a fresh frozen copy.
 */
export function checkEdit(edit, info) {
  fields(edit, EDIT_KEYS, 'edit');
  if (edit.v !== 1) {
    throw new EditError('edit.v is not 1');
  }
  fields(edit.look, LOOK_KEYS, 'edit.look');
  if (typeof edit.look.letterbox !== 'boolean') {
    throw new EditError('edit.look.letterbox is not true or false');
  }
  const s = edit.shots;
  if (!Array.isArray(s) || s.length < 1 || s.length > SHOTS_MAX) {
    throw new EditError(`edit.shots is not a list of 1 to ${SHOTS_MAX} shots`);
  }
  s.forEach((shot, i) => {
    const what = `edit.shots[${i}]`;
    fields(shot, SHOT_KEYS, what);
    num(shot.t0, `${what}.t0`);
    if (i === 0 && shot.t0 < 0) {
      throw new EditError(`${what}.t0 is before the clip`);
    }
    if (i > 0 && !(shot.t0 - s[i - 1].t0 >= MIN_SHOT_S - SLACK)) {
      throw new EditError(`${what}.t0 is not ${MIN_SHOT_S} s after the shot before`);
    }
    checkCam(shot.cam, info, `${what}.cam`);
    if (!SPEEDS.includes(shot.speed)) {
      throw new EditError(`${what}.speed is not a speed`);
    }
    checkEnter(shot.enter, i, `${what}.enter`);
  });
  num(edit.out, 'edit.out');
  if (!(edit.out - s[s.length - 1].t0 >= MIN_SHOT_S - SLACK)) {
    throw new EditError(`edit.out is not ${MIN_SHOT_S} s after the last shot starts`);
  }
  if (edit.out > info.duration + 1e-6) {
    throw new EditError('edit.out is past the end of the clip');
  }
  return make(edit.out, edit.look, s);
}

/* ---- undo ---- */

/*
 * Undo and redo over immutable edits, the oldest dropped past HISTORY_MAX.
 * commit(e) is one step and clears redo. A gesture (a drag, the wheel, a
 * free camera flight) is bracketed by begin() and end(): preview(e) in
 * between replaces what `current` shows without a step, and end() makes
 * the whole gesture one step, or none if it came back to where it began.
 * preview() outside a gesture begins one, so a forgotten begin() cannot
 * overwrite a step. commit(), undo() and redo() end an open gesture
 * first. Committing an edit equal to the current one is not a step.
 */
export function createHistory(edit) {
  const past = [edit];
  let at = 0;
  let pending = null;
  let open = false;

  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

  function push(e) {
    if (same(e, past[at])) {
      return;
    }
    past.length = at + 1;
    past.push(e);
    if (past.length > HISTORY_MAX) {
      past.shift();
    }
    at = past.length - 1;
  }

  function end() {
    if (!open) {
      return;
    }
    open = false;
    if (pending) {
      push(pending);
    }
    pending = null;
  }

  return {
    get current() {
      return pending || past[at];
    },
    get canUndo() {
      return at > 0 || Boolean(pending && !same(pending, past[at]));
    },
    get canRedo() {
      return !open && at < past.length - 1;
    },
    commit(e) {
      end();
      push(e);
      return past[at];
    },
    begin() {
      open = true;
    },
    preview(e) {
      open = true;
      pending = e;
      return e;
    },
    end() {
      end();
      return past[at];
    },
    undo() {
      end();
      at = Math.max(0, at - 1);
      return past[at];
    },
    redo() {
      end();
      at = Math.min(past.length - 1, at + 1);
      return past[at];
    },
  };
}
