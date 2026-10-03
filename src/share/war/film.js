/*
 * film.js: a war mission's intro film as a timeline (docs/campaign/
 * INTROS.md sections 1 and 2, TECH-NEEDS.md T2). Pure: plain numbers, no
 * three.js and no clock, so the room (edge/rooms/war.js, the briefing's
 * length), every screen (src/render/warintro.js, the player) and the
 * checks (scripts/films-lint.js) compute the same film.
 *
 * THE FILM IS TIMED BY ITS VOICE (the owner, 2 Oct: the intros "often
 * come mistimed"). A shot's length is never typed: it is the longest of
 * its `min` and its lines, each line `lead` seconds of silence, the line
 * in the longer of its two languages (voicelen.js, measured on the files)
 * and `tail` after, end to end. A line may `span` k shots: it starts in
 * its own and the k - 1 after it, and the last of them grows to hold it.
 * The film starts with PRELOAD_MS of black and the mission's title, in
 * which every screen decodes the film's lines (and builds its world), so
 * the room's briefing is PRELOAD_MS and the shots: filmMs().
 *
 * EVERYTHING IN A SHOT IS ANCHORED. A time is seconds from the shot's
 * start, a number, or { at, s, line? }: at 'start', 'end', 'vo.start' or
 * 'vo.end' (of the shot's line `line`, its first by default, the end the
 * longer language's), plus s seconds (minus, for 'end' when s is
 * negative). If a line gets longer, what comes after it moves with it.
 *
 * A FILM is { id, version, routes, shots, agents?, cast? }:
 *
 *   version  bumped whenever the cut changes: a pilot's "seen" is of a
 *            version, so a new cut is unskippable once more (INTROS 3)
 *   routes   attacker routes as a mission's (routes.js flies them)
 *   agents   [{ id, kind, route, n, stagger?, pass: { shot, at, point,
 *            seen? }, shots? }]: a group of attackers placed by where
 *            they must be, not by a typed speed: the group's centre line
 *            is at `point` at the anchor `at` of shot `shot`, its t0
 *            solved on routes.js's own plan (INTROS 2.3; the old film's
 *            38 m/s against the real 26.6 put its pass after the cut).
 *            The lint holds it inside the frame at `seen` (the pass's own
 *            anchor without one; a pass over the lens is seen coming).
 *            Drawn in the shots listed (every shot without the list)
 *   shots    [{ id, min, lines?, camera, cast?, titles?, counter?, fade?,
 *            grade?, out?, outS? }]:
 *              min      seconds, the shot's least length
 *              lines    [{ line, lead, tail, span? }], end to end
 *              camera   one primitive (INTROS 1.2), below
 *              cast     { name: { keys: [{ t, p, yaw?, pitch?, roll? }],
 *                       spin?: [[t, rad/s]], bob?, as? } }: the hangar's
 *                       aircraft as the player builds them, t anchors
 *              titles   [{ key | text | 'mission', from, to, kind }]
 *              counter  { from, to }: the output counting up
 *              fade     [[t, black 0..1]]
 *              grade    the player's colour grade by name
 *              out      the transition to the next: 'cut', 'smash',
 *                       'match' (cuts), 'dip' (to black and back over
 *                       outS), 'dissolve' (the last frame fading over the
 *                       next shot for outS), or 'handoff' on the last
 *                       (its final HANDOFF_MS blend into the pilot's own
 *                       camera as the letterbox opens, INTROS 4)
 *
 * A CAMERA is { type, lens, ease?, from?, to?, ... }: lens millimetres on
 * a 36 mm wide frame, or [from, to] for a zoom (lensFov turns it into
 * three.js's vertical field for the screen's aspect, so the horizontal
 * framing holds on every screen); ease 'lin', 'io' (the default), 'out',
 * 'in' or 'hold', over the anchors from and to (the whole shot without
 * them). A target is a point [x, y, z], { cast: name } or { agent: id },
 * with an optional `up` metres added. By type:
 *
 *   dolly      path: [points] (a Catmull-Rom curve through them), look: a
 *              target or [points] (a curve of its own)
 *   crane      base: [x, y, z], h: [from, to] metres over base, arm:
 *              metres out from it along dir (radians, 0 is +z), look
 *   orbit      centre, r, h, a: [from, to] radians (0 is +z), look
 *              (the centre without one)
 *   handheld   at, look, amp (metres of sway), drift (seconds, the sway's
 *              period): a seeded smooth noise, the same on every screen,
 *              never a sum of sines
 *   drone      ride: a target, back and up metres off its line of flight,
 *              lag ms: the camera rides a flight
 *   telephoto  at, look: a target or [from, to], panned by the ease
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

import VOICE from './voicelen.js';
import { planAgent, poseAt } from './routes.js';
import { draw } from './stages.js';

/* Black with the mission's title while every screen decodes the film. */
export const PRELOAD_MS = 2500;
/* The last shot's blend into the pilot's own camera. */
export const HANDOFF_MS = 1500;
/* A dip's or a dissolve's length when the shot names none. */
export const OUT_S = 0.8;
export const LANGS = ['en', 'es'];

/* A line's length, ms, in a language, and the longer of the two. */
export function lineMs(id, lang, lengths = VOICE) {
  const l = lengths[id];
  if (!l || typeof l[lang] !== 'number') {
    throw new Error(`film: no measured length for ${id} in ${lang}`);
  }
  return Math.round(l[lang] * 1000);
}
const longest = (id, lengths) => Math.max(...LANGS.map((lang) => lineMs(id, lang, lengths)));

/*
 * The film's timing: { ms, shots: [{ ...shot, start, ms, lines: [{ line,
 * start, ms: { en, es }, longest }] }] }, every time film ms (the film's
 * 0 is the briefing's start, PRELOAD_MS before the first shot).
 */
export function timing(film, lengths = VOICE) {
  const shots = film.shots.map((s) => ({ ...s, ms: Math.round(s.min * 1000), lines: [] }));
  /* Each shot's own lines, end to end, and the spans they need. */
  for (const [i, s] of film.shots.entries()) {
    let at = 0;
    for (const l of s.lines ?? []) {
      const lead = Math.round((l.lead ?? 0) * 1000);
      const tail = Math.round((l.tail ?? 0) * 1000);
      const long = longest(l.line, lengths);
      shots[i].lines.push({
        line: l.line, rel: at + lead, ms: Object.fromEntries(LANGS.map((lang) => [lang, lineMs(l.line, lang, lengths)])), longest: long,
      });
      at += lead + long + tail;
      const span = l.span ?? 1;
      const group = shots.slice(i, i + span);
      if (group.length !== span) {
        throw new Error(`film ${film.id}: ${s.id}'s line ${l.line} spans past the last shot`);
      }
      if (span === 1) {
        shots[i].ms = Math.max(shots[i].ms, at);
      } else {
        const have = group.reduce((sum, g) => sum + g.ms, 0);
        if (at > have) {
          group[span - 1].ms += at - have;
        }
      }
    }
  }
  let start = PRELOAD_MS;
  for (const s of shots) {
    s.start = start;
    for (const l of s.lines) {
      l.start = start + l.rel;
    }
    start += s.ms;
  }
  return { ms: start, shots };
}

/* The briefing's length for a film: what the room holds. */
export function filmMs(film, lengths = VOICE) {
  return timing(film, lengths).ms;
}

/* An anchor in a timed shot, ms from the shot's start. */
export function anchor(a, shot) {
  if (typeof a === 'number') {
    return Math.round(a * 1000);
  }
  const s = Math.round((a.s ?? 0) * 1000);
  if (a.at === 'start') {
    return s;
  }
  if (a.at === 'end') {
    return shot.ms + s;
  }
  const l = shot.lines[a.line ?? 0];
  if (!l) {
    throw new Error(`film: ${shot.id} has no line ${a.line ?? 0} for ${a.at}`);
  }
  if (a.at === 'vo.start') {
    return l.rel + s;
  }
  if (a.at === 'vo.end') {
    return l.rel + l.longest + s;
  }
  throw new Error(`film: an anchor at ${a.at}`);
}

/* Piecewise linear over [[t ms, v], ...], held at the ends. */
export function track(pairs, t) {
  if (!pairs || !pairs.length) {
    return 0;
  }
  if (t <= pairs[0][0]) {
    return pairs[0][1];
  }
  for (let i = 1; i < pairs.length; i += 1) {
    if (t <= pairs[i][0]) {
      const [t0, v0] = pairs[i - 1];
      const [t1, v1] = pairs[i];
      return t1 > t0 ? v0 + (v1 - v0) * ((t - t0) / (t1 - t0)) : v1;
    }
  }
  return pairs[pairs.length - 1][1];
}

/* The easings of INTROS 1.3, on u in [0, 1]. */
export const EASE = {
  lin: (u) => u,
  io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2),
  out: (u) => 1 - (1 - u) ** 3,
  in: (u) => u * u * u,
  hold: () => 0,
};

/* Three.js's vertical field of view, degrees, for a lens of mm on a
 * 36 mm wide frame, holding the horizontal field on a screen of aspect. */
export function lensFov(mm, aspect) {
  const half = Math.atan(18 / mm);
  return (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
}

/* A uniform Catmull-Rom curve through pts at u in [0, 1]. */
export function curve(pts, u) {
  if (pts.length === 1) {
    return pts[0].slice();
  }
  const n = pts.length - 1;
  const x = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const f2 = f * f;
  const f3 = f2 * f;
  return [0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3));
}

/* A smooth value noise in [-1, 1] on t seconds, `seed` its own: three
 * octaves of a seeded lattice, smoothstep between the points. */
export function noise(seed, t) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < 3; o += 1) {
    const x = t * (1 << o);
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    const a = draw((seed + o * 7919) >>> 0, i) * 2 - 1;
    const b = draw((seed + o * 7919) >>> 0, i + 1) * 2 - 1;
    sum += amp * (a + (b - a) * s);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/*
 * The film's agents placed: each one's birth record for routes.js, its
 * t0 solved so the group's middle is at its pass point at its anchor
 * (film ms), and the shots it is drawn in. timed is timing(film).
 */
export function placeAgents(film, timed) {
  const mission = { routes: film.routes, targets: {} };
  const out = [];
  for (const [gi, g] of (film.agents ?? []).entries()) {
    const shot = timed.shots.find((s) => s.id === g.pass.shot);
    if (!shot) {
      throw new Error(`film ${film.id}: agents ${g.id} pass in no shot ${g.pass.shot}`);
    }
    const at = shot.start + anchor(g.pass.at, shot);
    const n = g.n ?? 1;
    const mid = Math.floor((n - 1) / 2);
    /* The group's centre line (a group of one: no formation offset) from
     * t0 = 0, and when it is nearest the point: a 100 ms scan, then the
     * millisecond. The ranks fly either side of it. */
    const probe = planAgent(mission, {
      id: 0, kind: g.kind, route: g.route, t0: 0, k: 0, n: 1, err: 0, target: null,
    });
    const dist = (t) => {
      const p = poseAt(probe, t).p;
      return Math.hypot(p[0] - g.pass.point[0], p[1] - g.pass.point[1], p[2] - g.pass.point[2]);
    };
    let best = 0;
    for (let t = 0; t <= probe.tEnd; t += 100) {
      if (dist(t) < dist(best)) {
        best = t;
      }
    }
    for (let t = Math.max(0, best - 100); t <= Math.min(probe.tEnd, best + 100); t += 1) {
      if (dist(t) < dist(best)) {
        best = t;
      }
    }
    const t0 = at - best;
    for (let k = 0; k < n; k += 1) {
      const rank = Math.abs(k - mid);
      const a = {
        id: 1000 * (gi + 1) + k, kind: g.kind, route: g.route, t0: t0 + (g.stagger ?? 0) * 1000 * rank, k, n, err: 0, target: null,
      };
      out.push({
        group: g.id, a, plan: planAgent(mission, a), shots: g.shots ? new Set(g.shots) : null, pass: k === mid ? { at, point: g.pass.point, miss: dist(best) } : null,
      });
    }
  }
  return out;
}

/*
 * Where a cast member stands at shot ms t of a timed shot, from its keys
 * (t anchors): { p, yaw, pitch, roll, shown }, p[1] null on the ground
 * and WATER on the water (the player places those); shown false before
 * its `from`.
 */
export function castAt(def, shot, t) {
  const keys = def.keys.map((k) => ({ ...k, ms: anchor(k.t, shot) }));
  if (def.from != null && t < anchor(def.from, shot)) {
    return { shown: false };
  }
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i].ms) {
      a = keys[i - 1];
      b = keys[i];
      break;
    }
  }
  const u = b.ms > a.ms ? Math.max(0, Math.min(1, (t - a.ms) / (b.ms - a.ms))) : 1;
  const y = typeof a.p[1] === 'number' && typeof b.p[1] === 'number' ? a.p[1] + (b.p[1] - a.p[1]) * u : a.p[1];
  return {
    shown: true,
    p: [a.p[0] + (b.p[0] - a.p[0]) * u, y, a.p[2] + (b.p[2] - a.p[2]) * u],
    yaw: a.yaw ?? 0,
    pitch: a.pitch ?? 0,
    roll: a.roll ?? 0,
  };
}

/* A spin's angle, radians, at shot ms t: the integral of its rate pairs
 * ([[t anchor, rad/s]]). */
export function spinAt(def, shot, t) {
  if (!def.spin) {
    return 0;
  }
  const pairs = def.spin.map(([a, v]) => [anchor(a, shot), v]);
  let area = 0;
  let prevT = 0;
  let prevV = track(pairs, 0);
  for (const x of [...pairs.map((q) => q[0]).filter((q) => q > 0 && q < t), t]) {
    const v = track(pairs, x);
    area += ((prevV + v) / 2) * (x - prevT);
    prevT = x;
    prevV = v;
  }
  return area / 1000;
}

/* Where a target is at shot ms t: a point, a cast member's or an
 * agent's place (resolve), plus its `up`. */
function aimAt(target, t, resolve) {
  if (Array.isArray(target)) {
    return target;
  }
  const p = target.cast != null ? resolve.cast(target.cast, t) : resolve.agent(target.agent, t);
  return [p[0], p[1] + (target.up ?? 0), p[2]];
}

/*
 * The camera of a timed shot at shot ms t: { p, look, lens (mm) }.
 * resolve: { cast(name, t), agent(id, t) } places in the scene; seed the
 * handheld noise's (the shot's index, so every screen sways alike).
 */
export function cameraAt(shot, t, resolve, seed = 0) {
  const c = shot.camera;
  const from = c.from != null ? anchor(c.from, shot) : 0;
  const to = c.to != null ? anchor(c.to, shot) : shot.ms;
  const raw = to > from ? Math.max(0, Math.min(1, (t - from) / (to - from))) : 1;
  const u = (EASE[c.ease ?? 'io'] ?? EASE.io)(raw);
  const lens = Array.isArray(c.lens) ? c.lens[0] + (c.lens[1] - c.lens[0]) * u : c.lens;
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const lookOf = (look) => (Array.isArray(look) && Array.isArray(look[0]) ? curve(look, u) : aimAt(look, t, resolve));
  if (c.type === 'dolly') {
    return { p: curve(c.path, u), look: lookOf(c.look), lens };
  }
  if (c.type === 'crane') {
    const h = c.h[0] + (c.h[1] - c.h[0]) * u;
    return { p: [c.base[0] + Math.sin(c.dir ?? 0) * (c.arm ?? 0), c.base[1] + h, c.base[2] + Math.cos(c.dir ?? 0) * (c.arm ?? 0)], look: lookOf(c.look), lens };
  }
  if (c.type === 'orbit') {
    const a = c.a[0] + (c.a[1] - c.a[0]) * u;
    return { p: [c.centre[0] + c.r * Math.sin(a), c.centre[1] + c.h, c.centre[2] + c.r * Math.cos(a)], look: c.look ? lookOf(c.look) : c.centre, lens };
  }
  if (c.type === 'handheld') {
    const s = t / 1000 / (c.drift ?? 4);
    const amp = c.amp ?? 0.05;
    const p = [0, 1, 2].map((k) => c.at[k] + amp * noise(seed * 31 + k, s));
    const look = aimAt(c.look, t, resolve);
    return { p, look: [0, 1, 2].map((k) => look[k] + amp * 0.5 * noise(seed * 31 + 3 + k, s * 1.7)), lens };
  }
  if (c.type === 'drone') {
    const now = aimAt(c.ride, t, resolve);
    const was = aimAt(c.ride, t - (c.lag ?? 300), resolve);
    const d = [now[0] - was[0], now[1] - was[1], now[2] - was[2]];
    const m = Math.hypot(d[0], d[1], d[2]) || 1;
    const dir = d.map((v) => v / m);
    const back = c.back ?? 3;
    return {
      p: [was[0] - dir[0] * back, was[1] - dir[1] * back + (c.up ?? 0.8), was[2] - dir[2] * back],
      look: [now[0] + dir[0] * 30, now[1] + dir[1] * 30, now[2] + dir[2] * 30],
      lens,
    };
  }
  if (c.type === 'telephoto') {
    const look = Array.isArray(c.look) && Array.isArray(c.look[0]) ? lerp3(c.look[0], c.look[c.look.length - 1], u) : aimAt(c.look, t, resolve);
    return { p: c.at.slice(), look, lens };
  }
  throw new Error(`film: a camera of no type ${c.type}`);
}

/* Which timed shot film ms t is in, by index (the last past the end, -1
 * in the preload). */
export function shotIndex(timed, t) {
  if (t < PRELOAD_MS) {
    return -1;
  }
  let i = timed.shots.length - 1;
  while (i > 0 && t < timed.shots[i].start) {
    i -= 1;
  }
  return i;
}

/* A shot's black at shot ms t: its own fade, and the dips of the shot
 * before and of its own `out`. */
export function blackAt(timed, i, t) {
  const s = timed.shots[i];
  let black = s.fade ? track(s.fade.map(([a, v]) => [anchor(a, s), v]), t) : 0;
  const half = (x) => Math.round(((x.outS ?? OUT_S) * 1000) / 2);
  if (s.out === 'dip') {
    black = Math.max(black, Math.max(0, Math.min(1, 1 - (s.ms - t) / half(s))));
  }
  const prev = timed.shots[i - 1];
  if (prev && prev.out === 'dip') {
    black = Math.max(black, Math.max(0, Math.min(1, 1 - t / half(prev))));
  }
  return black;
}

/* The line playing at film ms t in a language, for the subtitle: { line,
 * start, ms } or null. A subtitle stays SUB_TAIL_MS after its line. */
export const SUB_TAIL_MS = 500;
export function lineAt(timed, t, lang) {
  for (const s of timed.shots) {
    for (const l of s.lines) {
      if (t >= l.start && t < l.start + l.ms[lang] + SUB_TAIL_MS) {
        return { line: l.line, start: l.start, ms: l.ms[lang] };
      }
    }
  }
  return null;
}

/* Every line of the film in order: [{ line, start, ms: { en, es } }]. */
export function linesOf(timed) {
  return timed.shots.flatMap((s) => s.lines.map((l) => ({ line: l.line, start: l.start, ms: l.ms })));
}
