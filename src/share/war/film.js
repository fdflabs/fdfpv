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
 * negative); a 'vo.start' with u is that share of the line in (u 0.5:
 * half way through it, so a word's mark lands near the word in either
 * language). If a line gets longer, what comes after it moves with it.
 *
 * A FILM may also name `map`, the world its shots are metres of (a war
 * film without one is Itaipu's), and `music`: absent, the war bed's
 * 'intro' from the first shot, as every war film has it; null, only the
 * shots' own `music` cues (musicAt).
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
 *              lines    [{ line, lead, tail, span?, overlap? }], end
 *                       to end; an `overlap` line starts lead after the
 *                       one before it starts, so voices talk over each
 *                       other and the shot holds the last to end; `or`
 *                       { line, flag } is said instead when the
 *                       player's campaign flag is not set (a callback to
 *                       an earlier mission), timed as the longer of both
 *              music    a bed from this shot on: a track name ('' is
 *                       silence) or { track, at }, at an anchor; only
 *                       in a film whose `music` is null
 *              board    the BOARD insert (TECH-NEEDS N18 of The
 *                       Interior) over the whole frame on a `board`
 *                       camera, or on the room set's screens on another
 *                       (`set`): boardAt, below
 *              set      a film's `sets` entry the shot stands in
 *              ball     { on?, hud? }: the camera ball's picture over a
 *                       world shot, noise until `on` and its marks
 *                       drawing in from `hud`
 *              camera   one primitive (INTROS 1.2), below
 *              cast     { name: { keys: [{ t, p, yaw?, pitch?, roll? }],
 *                       spin?: [[t, rad/s]], bob?, as? } }: the hangar's
 *                       aircraft as the player builds them, t anchors
 *              titles   [{ key | text | 'mission', from, to, kind }]
 *              counter  { from, to }: the output counting up
 *              fade     [[t, black 0..1]]
 *              grade    the player's colour grade by name
 *              scope    the SCOPE insert (INTROS 1.5, TECH-NEEDS T2.8):
 *                       MIRADOR's radar over the whole frame instead of
 *                       the world, { at: [x, z], r, groups, appear: [a,
 *                       b], lines?, marks? }: centred on at, r metres to
 *                       its rim, north up; the film's agent groups listed
 *                       as contacts (scopeAt), each appearing in turn
 *                       between the anchors a and b; lines [[x, z]...]
 *                       the landmarks drawn, marks [{ key, at: [x, z] }]
 *                       their names (string keys)
 *              outline  { from?, to? }: the targets the room names (the
 *                       match's working set, the player's opts.named)
 *                       bracketed on the picture between the anchors
 *              hero     { agent, minPx, from?, to? }: the group the shot
 *                       is about, every one of it inside the frame and
 *                       the nearest at least minPx of wingspan on a 1920
 *                       px wide screen, from `from` to `to` (the whole
 *                       shot without them; films:lint)
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
 * them). A target is a point [x, y, z], { cast: name } or { agent: id,
 * k? } (the group's middle, or its k-th), with an optional `up` metres
 * or `off` [x, y, z] added. By type:
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
 *              lag ms: the camera rides a flight; or off: [x, y, z] from
 *              where the rider was lag ms ago and look: a target, flying
 *              alongside it
 *   telephoto  at, look: a target or [from, to], panned by the ease
 *   board      at, look: where the world's camera is parked while the
 *              BOARD covers the frame (it is still drawn, unseen)
 *
 * A camera with `agl` has every point it is given as a point (not a
 * cast member or an agent) at metres over the ground under it
 * (resolve.ground), for a map whose ground is not one height.
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
    let prev = null;
    for (const l of s.lines ?? []) {
      const lead = Math.round((l.lead ?? 0) * 1000);
      const tail = Math.round((l.tail ?? 0) * 1000);
      const said = l.or ? [l.line, l.or.line] : [l.line];
      const long = Math.max(...said.map((id) => longest(id, lengths)));
      /* An overlapping line starts lead after the line before it starts,
       * not after it ends: voices over each other, built in the mix. */
      const rel = l.overlap && prev != null ? prev + lead : at + lead;
      prev = rel;
      shots[i].lines.push({
        line: l.line, or: l.or ?? null, rel, ms: Object.fromEntries(LANGS.map((lang) => [lang, Math.max(...said.map((id) => lineMs(id, lang, lengths)))])), longest: long,
      });
      at = Math.max(at, rel + long + tail);
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
    return l.rel + Math.round((a.u ?? 0) * l.longest) + s;
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

/* Where a target is at shot ms t: a point (lifted over the ground on an
 * `agl` camera), a cast member's or an agent's place (resolve), plus its
 * `up`. */
function aimAt(target, t, resolve, lift = (p) => p) {
  if (Array.isArray(target)) {
    return lift(target);
  }
  const p = target.cast != null ? resolve.cast(target.cast, t) : resolve.agent(target.agent, t, target.k);
  const off = target.off ?? [0, 0, 0];
  return [p[0] + off[0], p[1] + (target.up ?? 0) + off[1], p[2] + off[2]];
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
  const lift = c.agl ? (q) => [q[0], q[1] + resolve.ground(q[0], q[2]), q[2]] : (q) => q;
  const lookOf = (look) => (Array.isArray(look) && Array.isArray(look[0]) ? lift(curve(look, u)) : aimAt(look, t, resolve, lift));
  if (c.type === 'dolly') {
    return { p: lift(curve(c.path, u)), look: lookOf(c.look), lens };
  }
  if (c.type === 'crane') {
    const h = c.h[0] + (c.h[1] - c.h[0]) * u;
    const base = lift(c.base);
    return { p: [base[0] + Math.sin(c.dir ?? 0) * (c.arm ?? 0), base[1] + h, base[2] + Math.cos(c.dir ?? 0) * (c.arm ?? 0)], look: lookOf(c.look), lens };
  }
  if (c.type === 'orbit') {
    const a = c.a[0] + (c.a[1] - c.a[0]) * u;
    const centre = lift(c.centre);
    return { p: [centre[0] + c.r * Math.sin(a), centre[1] + c.h, centre[2] + c.r * Math.cos(a)], look: c.look ? lookOf(c.look) : centre, lens };
  }
  if (c.type === 'handheld') {
    const s = t / 1000 / (c.drift ?? 4);
    const amp = c.amp ?? 0.05;
    const at = lift(c.at);
    const p = [0, 1, 2].map((k) => at[k] + amp * noise(seed * 31 + k, s));
    const look = aimAt(c.look, t, resolve, lift);
    return { p, look: [0, 1, 2].map((k) => look[k] + amp * 0.5 * noise(seed * 31 + 3 + k, s * 1.7)), lens };
  }
  if (c.type === 'drone') {
    const now = aimAt(c.ride, t, resolve, lift);
    const was = aimAt(c.ride, t - (c.lag ?? 300), resolve, lift);
    /* Flying alongside: at its lagged place plus a world offset, looking
     * at a target of its own. */
    if (c.off) {
      return { p: [was[0] + c.off[0], was[1] + c.off[1], was[2] + c.off[2]], look: aimAt(c.look, t, resolve, lift), lens };
    }
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
    const look = Array.isArray(c.look) && Array.isArray(c.look[0]) ? lift(lerp3(c.look[0], c.look[c.look.length - 1], u)) : aimAt(c.look, t, resolve, lift);
    return { p: lift(c.at.slice()), look, lens };
  }
  if (c.type === 'board') {
    return { p: lift(c.at.slice()), look: lift(c.look.slice()), lens: lens ?? 35 };
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
export function lineAt(timed, t, lang, flags = {}) {
  for (const s of timed.shots) {
    for (const l of s.lines) {
      if (t >= l.start && t < l.start + l.ms[lang] + SUB_TAIL_MS) {
        return { line: saidOf(l, flags), start: l.start, ms: l.ms[lang] };
      }
    }
  }
  return null;
}

/* The line a timed line says for a player with these campaign flags. */
export function saidOf(l, flags = {}) {
  return l.or && !flags[l.or.flag] ? l.or.line : l.line;
}

/* Every line of the film in order: [{ line, start, ms: { en, es } }],
 * each the one said for these flags. */
export function linesOf(timed, flags = {}) {
  return timed.shots.flatMap((s) => s.lines.map((l) => ({ line: saidOf(l, flags), start: l.start, ms: l.ms })));
}

/* How long a scope contact's trail is, ms, and its dots' spacing. */
export const SCOPE_TRAIL_MS = 6000;
export const SCOPE_TRAIL_STEP_MS = 500;

/*
 * The SCOPE insert's contacts at shot ms t (film ms tFilm) of a timed
 * shot with a `scope`: [{ group, id, u, v, trail: [[u, v]...], shown }],
 * u east and v south of the scope's centre in rims (1 on the rim), from
 * the same plans the film's attackers fly (placed: placeAgents). A
 * group's contacts are shown from its turn in the appear window on.
 */
export function scopeAt(shot, t, placed, tFilm) {
  const sc = shot.scope;
  const [a, b] = (sc.appear ?? [0, 0]).map((x) => anchor(x, shot));
  const n = sc.groups.length;
  const out = [];
  for (const [gi, group] of sc.groups.entries()) {
    const from = n > 1 ? a + ((b - a) * gi) / (n - 1) : a;
    for (const x of placed.filter((y) => y.group === group)) {
      const at = (ms) => {
        const p = poseAt(x.plan, Math.max(x.plan.t0, Math.min(x.plan.tEnd, ms))).p;
        return [(p[0] - sc.at[0]) / sc.r, (p[2] - sc.at[1]) / sc.r];
      };
      const trail = [];
      for (let ms = Math.max(x.plan.t0, tFilm - SCOPE_TRAIL_MS); ms < tFilm; ms += SCOPE_TRAIL_STEP_MS) {
        trail.push(at(ms));
      }
      const [u, v] = at(tFilm);
      out.push({
        group, id: x.a.id, u, v, trail, shown: t >= from && tFilm >= x.plan.t0,
      });
    }
  }
  return out;
}

/* A BOARD element's fade in and out, ms. */
export const BOARD_FADE_MS = 600;
/* The BOARD's parts a shot may name (TECH-NEEDS N18 of The Interior). */
export const BOARD_PARTS = ['view', 'black', 'layers', 'marks', 'stills', 'match', 'split', 'alert', 'hand'];

/* 0 to 1: shown from anchor `from` (faded in over BOARD_FADE_MS) to `to`
 * (faded out over it, ending there), at shot ms t. */
function shownAt(shot, t, from, to) {
  const a = from != null ? anchor(from, shot) : 0;
  const b = to != null ? anchor(to, shot) : Infinity;
  const fin = Math.max(0, Math.min(1, (t - a) / BOARD_FADE_MS));
  const fout = b === Infinity ? 1 : Math.max(0, Math.min(1, (b - t) / BOARD_FADE_MS));
  return Math.min(fin, fout);
}

/*
 * The BOARD of a timed shot at shot ms t: what the operations room's
 * screen shows, as numbers the drawer (src/render/filmboard.js) paints
 * and the checks read. The shot's `board`:
 *
 *   view    the map's window: { at: [x, z], span } (span metres across),
 *           or { from: {...}, to: {...}, a?, b?, ease? }, eased between
 *           the anchors a and b (the whole shot without them)
 *   black   no map, the screen dark: stills on black (the archive)
 *   layers  [{ id, from?, to? }]: the campaign map's layers (the film's
 *           board map, by id), each fading in at from and out at to
 *   marks   [{ layer, item, at }]: one item of a layer ticked at an anchor
 *   stills  [{ id, from?, to?, slot?, push? }]: a still (an authored id, or
 *           cap:<item> with rec:<item> behind it) in its slot, 'full' by
 *           default, 'left', 'right' or [x, y, w] in shares of the frame;
 *           push the share it grows by over its time (a slow push in)
 *   match   { a, b, from?, to?, at? }: two stills side by side, a
 *           SEARCHING line under them until `at`, MATCH after it
 *   split   { a, b, from?, to? }: two stills side by side, no line
 *   alert   { key, from?, to? }: a banner, a string key
 *   hand    { from, to }: a hand's shadow passing over the screen, the
 *           only person a room shot shows (INTROS of The Interior, 0.1)
 *
 * Returns { black, view: { at, span }, layers: [{ id, alpha }], marks:
 * [{ layer, item, alpha }], stills: [{ id, alpha, slot, u, push }] (u the
 * share of its time on screen gone by), match,
 * split, alert, hand }, each element with its alpha (0 hidden).
 */
export function boardAt(shot, t) {
  const b = shot.board;
  if (!b) {
    return null;
  }
  let view = null;
  if (b.view && b.view.from) {
    const a = b.view.a != null ? anchor(b.view.a, shot) : 0;
    const z = b.view.b != null ? anchor(b.view.b, shot) : shot.ms;
    const u = (EASE[b.view.ease ?? 'io'] ?? EASE.io)(z > a ? Math.max(0, Math.min(1, (t - a) / (z - a))) : 1);
    /* The span eases in its logarithm, so a zoom out reads as even. */
    const s0 = Math.log(b.view.from.span);
    const s1 = Math.log(b.view.to.span);
    view = {
      at: [0, 1].map((k) => b.view.from.at[k] + (b.view.to.at[k] - b.view.from.at[k]) * u),
      span: Math.exp(s0 + (s1 - s0) * u),
    };
  } else if (b.view) {
    view = { at: b.view.at.slice(), span: b.view.span };
  }
  const pair = (x) => (x ? {
    a: x.a, b: x.b, alpha: shownAt(shot, t, x.from, x.to), matched: x.at != null && t >= anchor(x.at, shot),
  } : null);
  const stills = (b.stills ?? []).map((s) => {
    const a = s.from != null ? anchor(s.from, shot) : 0;
    const z = s.to != null ? anchor(s.to, shot) : shot.ms;
    const u = Math.max(0, Math.min(1, (t - a) / Math.max(1, z - a)));
    return {
      id: s.id, slot: s.slot ?? 'full', alpha: shownAt(shot, t, s.from, s.to), u, push: (s.push ?? 0) * u,
    };
  });
  let hand = null;
  if (b.hand) {
    const a = anchor(b.hand.from, shot);
    const z = anchor(b.hand.to, shot);
    hand = { u: Math.max(0, Math.min(1, (t - a) / Math.max(1, z - a))) };
  }
  return {
    black: Boolean(b.black),
    view,
    layers: (b.layers ?? []).map((l) => ({ id: l.id, alpha: shownAt(shot, t, l.from, l.to) })),
    marks: (b.marks ?? []).map((m) => ({ layer: m.layer, item: m.item, alpha: shownAt(shot, t, m.at, null) })),
    stills,
    match: pair(b.match),
    split: pair(b.split),
    alert: b.alert ? { key: b.alert.key, alpha: shownAt(shot, t, b.alert.from, b.alert.to) } : null,
    hand,
  };
}

/* Every still a BOARD shot names, authored and captured. */
export function boardStills(shot) {
  const b = shot.board;
  if (!b) {
    return [];
  }
  return [...(b.stills ?? []).map((s) => s.id), ...[b.match, b.split].filter(Boolean).flatMap((x) => [x.a, x.b])];
}

/*
 * The music cues of a timed film: [{ track, at }] in film ms. A film with
 * no `music` field (every war film) has the one it always had, the war
 * bed's 'intro' from the first shot; a film whose `music` is null, its
 * shots' own `music`, each from its anchor in its shot ('' is silence).
 */
export function musicCues(film, timed) {
  if (film.music === undefined) {
    return [{ track: 'intro', at: PRELOAD_MS }];
  }
  const out = [];
  for (const s of timed.shots) {
    if (s.music == null) {
      continue;
    }
    const m = typeof s.music === 'string' ? { track: s.music } : s.music;
    out.push({ track: m.track, at: s.start + (m.at != null ? anchor(m.at, s) : 0) });
  }
  return out;
}

/* The cue under way at film ms t, by index, -1 before the first. */
export function musicAt(cues, t) {
  let k = -1;
  for (let i = 0; i < cues.length; i += 1) {
    if (t >= cues[i].at) {
      k = i;
    }
  }
  return k;
}
