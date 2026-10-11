/*
 * trickfilm.js: the little animated picture beside each row of the trick
 * list, and the sentence under it, both worked out from the trick's steps.
 *
 * The steps are the recogniser's own PATTERNS (src/game/trickdetect.js), so
 * the picture and the sentence describe the shape the scorer will accept and
 * nothing else. There is no hand drawn animation to drift out of step with
 * the catalogue: edit a pattern and its film follows. A film that looks wrong
 * is a pattern that is wrong, which makes this screen a review of the
 * catalogue as well as a lesson.
 *
 * The camera is placed where the trick's turn is visible. A turn reads only
 * when its axis points at the viewer: a roll from behind, a flip from the
 * side, a yaw from above. A lap round a rail sits in the plane across the
 * rail (side on) and a lap round a post sits flat (from above). A lap
 * outranks a rotation when choosing, since the lap is the larger shape.
 *
 * The look is the town's: flat fills, a hard ink outline, two bands of sky
 * and no gradients or glow.
 *
 * The player owns one canvas and at most one pending animation frame, and it
 * runs only while the trick list is up; ui.js calls stop() on the way out.
 * With prefers-reduced-motion it never animates and lays its key frames out
 * side by side instead, so the shape is still readable.
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

import { str } from '../strings/index.js';

const FULL = 2 * Math.PI;

const PAINT = {
  ink: '#0b1116',
  faintInk: 'rgba(11,17,22,0.16)',
  sky: '#8fb6d8',
  haze: '#e9c3ac',
  grass: '#6f8f63',
  concrete: '#b9b3a8',
  rail: '#ffd45c',
  nose: '#e8a8b8',
  flash: '#7dffb4',
  prop: '#f3ead4',
  propBellyUp: '#9db3c8',
  body: '#3b4a57',
  bodyBellyUp: '#5d6b7a',
};

/* Milliseconds per turn of film, and the pause at the end of each pass so
 * the finished shape can be taken in before it loops. */
const MS_PER_TURN = 1500;
const END_PAUSE_MS = 700;

/* Read once, at load, in whatever language is current then. */
/* A trick's level, in the pilot's language: the sheet keeps its English. */
export const trickLevel = (level) => (level ? str(`tricks.level.${level.toLowerCase()}`) : '');

export const VIEW_LABEL = {
  side: str('trickfilm.seen_from_the_side'),
  above: str('trickfilm.seen_from_above'),
  behind: str('trickfilm.seen_from_behind'),
};

const isLap = (step) => step.path !== undefined;
const firstLap = (steps) => steps.find(isLap) || null;

export function viewFor(steps) {
  const lap = firstLap(steps);
  if (lap) {
    return lap.path === 'pole' ? 'above' : 'side';
  }
  const uses = (axis) => steps.some((s) => s.axis === axis);
  if (uses('pitch')) return 'side';
  if (uses('yaw')) return 'above';
  if (uses('roll')) return 'behind';
  return 'side';
}

/* ------------------------------------------------------------------ *
 * The sentence
 * ------------------------------------------------------------------ */

/* The workbook counts turns, it does not quote angles. */
const COUNT_KEY = new Map([
  [0.25, 'trickfilm.a_quarter_turn'],
  [0.5, 'trickfilm.a_half_turn'],
  [0.75, 'trickfilm.three_quarters_of_a_turn'],
  [1, 'trickfilm.a_whole_turn'],
  [2, 'trickfilm.two_whole_turns'],
]);

function countWords(n) {
  const size = Math.abs(n);
  const key = COUNT_KEY.get(size);
  return key ? str(key) : `${size} turns`;
}

const AXIS_NAME = { roll: 'roll', pitch: 'flip', yaw: 'yaw spin' };

/* Qualifiers appended after the main clause, in the order they are read. */
const LAP_QUALIFIERS = [
  [(s) => s.from === 'under', 'trickfilm.entered_from_underneath'],
  [(s) => s.from === 'over', 'trickfilm.entered_from_over_the_top'],
  [(s) => s.inverted === true, 'trickfilm.flown_belly_up'],
  [(s) => s.track === true, 'trickfilm.with_the_post_held_on_the'],
];
const SPIN_QUALIFIERS = [
  [(s) => s.oppTo !== undefined, 'trickfilm.back_the_other_way'],
  [(s) => s.sameAs !== undefined, 'trickfilm.the_same_way_again'],
  [(s) => Boolean(s.stallMs), 'trickfilm.after_a_pause'],
  [(s) => Boolean(s.tap), 'trickfilm.touching_the_object_as_you_go'],
  [(s) => s.inverted === true, 'trickfilm.upside_down'],
];

const qualify = (step, table) => table
  .filter(([applies]) => applies(step))
  .map(([, key]) => str(key))
  .join('');

function lapClause(step) {
  const thing = str(step.path === 'pole' ? 'trickfilm.a_post' : 'trickfilm.a_rail');
  let size;
  if (step.turnsAtLeast !== undefined) {
    size = str('trickfilm.or_more_around', { turnWords: countWords(step.turnsAtLeast), thing });
  } else if (step.turns === 0.5) {
    size = str('trickfilm.half_a_lap_around', { thing });
  } else if (step.turns === 1) {
    size = str('trickfilm.a_whole_lap_around', { thing });
  } else {
    size = `${countWords(step.turns)} around ${thing}`;
  }
  /* rot is the rotation flown on top of the lap; a zero entry is the
   * pattern saying "none of this", not something to mention. */
  const extras = Object.entries(step.rot || {})
    .filter(([, n]) => n !== 0)
    .map(([axis, n]) => str('trickfilm.of', { turnWords: countWords(n), v2: AXIS_NAME[axis] }));
  const carrying = extras.length ? str('trickfilm.carrying', { v1: extras.join(str('trickfilm.and')) }) : '';
  return size + qualify(step, LAP_QUALIFIERS) + carrying;
}

function spinClause(step) {
  const axis = AXIS_NAME[step.axis] || step.axis || 'rotation';
  return str('trickfilm.of', { turnWords: countWords(step.turns), v2: axis }) + qualify(step, SPIN_QUALIFIERS);
}

/* Built from the same steps as the film, so the words and the picture
 * cannot tell the pilot different things. */
export function describeSteps(steps) {
  if (!steps.length) return '';
  const said = steps.map((s) => (isLap(s) ? lapClause(s) : spinClause(s))).join(str('trickfilm.then'));
  return `${said[0].toUpperCase()}${said.slice(1)}.`;
}

/* ------------------------------------------------------------------ *
 * The motion
 *
 * Film space puts the obstacle at the origin, +y up, and is about 2.6 units
 * wide. A pose is { x, y, spin, squash, inv }: spin is the glyph's angle on
 * the screen, squash its foreshortening for a turn whose axis lies across
 * the screen, inv whether the craft is belly up (drawn in its darker paint).
 * ------------------------------------------------------------------ */

const LOOP_RADIUS = 0.62;
/* Where the craft enters a trick. Behind it, the craft is flying away from
 * the camera and hardly moves across the frame. */
const ENTRY = { x: -1.15 };
const AFTER_LAP = { side: { x: -0.95, y: 0.15 }, above: { x: -0.95, y: 0.15 }, behind: { x: -0.32, y: 0.15 } };
const RUN = { side: 1.9, above: 1.9, behind: 0.62 };
/* The axis a camera looks along, so a turn about it draws as a turn. */
const FACING_AXIS = { side: 'pitch', above: 'yaw', behind: 'roll' };

/*
 * A lap: the craft goes clockwise round the loop's centre. The start is the
 * bottom of the circle entered from under a rail, the top entered from over
 * it, and the near side of a post. Held on the obstacle (track) the nose
 * points inward the whole way; otherwise it follows the path, plus whatever
 * the pilot flips on top of the loop's own one turn per lap.
 */
function lapSegment(step, view) {
  const laps = step.turnsAtLeast !== undefined ? step.turnsAtLeast : (step.turns ?? 1);
  const start = step.path !== 'pole' && step.from === 'over' ? -Math.PI / 2 : Math.PI / 2;
  const flipTurns = view === 'side' && step.rot && step.rot.pitch !== undefined ? step.rot.pitch : laps;
  return {
    kind: 'lap',
    ms: MS_PER_TURN * Math.max(0.85, laps),
    start,
    startCos: Math.cos(start),
    startSin: Math.sin(start),
    sweep: -FULL * laps,
    held: step.track === true,
    added: FULL * (laps - flipTurns),
  };
}

function lapPose(seg, u) {
  const a = seg.start + seg.sweep * u;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  if (seg.held) {
    return { x: c * LOOP_RADIUS, y: sn * LOOP_RADIUS, spin: Math.PI - a, squash: 1, inv: false };
  }
  return {
    x: c * LOOP_RADIUS,
    y: sn * LOOP_RADIUS,
    spin: Math.atan2(c, sn) + seg.added * u,
    squash: 1,
    /* Belly up over the half of the loop facing away from where it began,
     * which is the far side of a powerloop. */
    inv: c * seg.startCos + sn * seg.startSin < 0,
  };
}

/*
 * A rotation flown while travelling (or on the spot, for a stall). If the
 * camera looks along its axis the glyph turns; if not it narrows and widens,
 * which is how such a turn looks from there.
 */
function spinSegment(step, view, from) {
  const turns = step.turns ?? 1;
  const to = { x: from.x + (step.stallMs ? 0 : RUN[view]), y: from.y };
  return {
    kind: 'rot',
    ms: MS_PER_TURN * Math.max(0.7, Math.abs(turns)),
    tap: Boolean(step.tap),
    from,
    to,
    facing: FACING_AXIS[view] === step.axis,
    angle: (step.oppTo !== undefined ? -FULL : FULL) * turns,
    roll: FULL * turns,
  };
}

function spinPose(seg, u) {
  const x = seg.from.x + (seg.to.x - seg.from.x) * u;
  const y = seg.from.y + (seg.to.y - seg.from.y) * u;
  if (seg.facing) {
    const angle = seg.angle * u;
    /* A remainder, not a modulo: turned the other way it stays negative and
     * never reads as belly up, and the record holds it to that. */
    return { x, y, spin: angle, squash: 1, inv: Math.abs((angle % FULL) - Math.PI) < Math.PI / 2 };
  }
  const across = Math.cos(seg.roll * u);
  return { x, y, spin: 0, squash: across, inv: across < 0 };
}

const POSE = { lap: lapPose, rot: spinPose };

export function filmFor(steps) {
  const view = viewFor(steps);
  const lap = firstLap(steps);
  const segs = [];
  let at = { x: ENTRY.x, y: lap ? LOOP_RADIUS : 0 };
  for (const step of steps) {
    if (isLap(step)) {
      segs.push(lapSegment(step, view));
      at = null;
    } else {
      const seg = spinSegment(step, view, at || AFTER_LAP[view]);
      segs.push(seg);
      at = seg.to;
    }
  }
  const playMs = segs.reduce((sum, seg) => sum + seg.ms, 0);
  let obstacle = null;
  if (lap) {
    obstacle = lap.path;
  } else if (steps.some((s) => s.tap)) {
    obstacle = 'wall';
  }
  return {
    view,
    steps,
    segs,
    /* A step with a turn count that is not a number would make the loop
     * length NaN; one millisecond keeps the player's modulo defined. */
    totalMs: (playMs + END_PAUSE_MS) || 1,
    obstacle,
    caption: describeSteps(steps),
  };
}

/* Quadratic ease in and out: nobody flies a trick at constant rate. */
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

/* The pose t ms in, with the segment it came from and the eased progress
 * through it. Past the end it holds the final pose. */
function poseAt(film, t) {
  let begins = 0;
  for (const seg of film.segs) {
    const ends = begins + seg.ms;
    if (t < ends) {
      const u = ease((t - begins) / seg.ms);
      return { ...POSE[seg.kind](seg, u), seg, u };
    }
    begins = ends;
  }
  const last = film.segs.at(-1);
  if (!last) return { x: 0, y: 0, spin: 0, squash: 1, inv: false, seg: null, u: 0 };
  return { ...POSE[last.kind](last, 1), seg: last, u: 1 };
}

/* ------------------------------------------------------------------ *
 * The picture
 * ------------------------------------------------------------------ */

function inkStyle(ctx, width) {
  ctx.strokeStyle = PAINT.ink;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/* A filled shape with the town's outline round it. */
function cel(ctx, fill, inkWidth, trace) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  trace();
  ctx.fill();
  inkStyle(ctx, inkWidth);
  ctx.stroke();
}

function celBox(ctx, fill, inkWidth, x, y, w, h) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  inkStyle(ctx, inkWidth);
  ctx.strokeRect(x, y, w, h);
}

function polygon(ctx, points, r) {
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px * r, py * r) : ctx.moveTo(px * r, py * r)));
  ctx.closePath();
}

/* Where film space lands on a W by H frame. The scale lets a loop of radius
 * 0.62 fill the frame with a small margin. */
function frameFor(view, W, H) {
  const ground = view === 'above' ? H : Math.round(H * 0.78);
  return {
    scale: Math.min(W / 2.5, H / 2.05),
    cx: W * 0.5,
    cy: view === 'above' ? H * 0.5 : H * 0.44,
    ground,
  };
}

const onScreen = (f, x, y) => ({ x: f.cx + x * f.scale, y: f.cy - y * f.scale });

function paintBackdrop(ctx, view, W, H, ground) {
  if (view === 'above') {
    /* Grass with faint survey lines, no sky. Only width and colour are set
     * here: the join and cap are whatever the context last had. */
    ctx.fillStyle = PAINT.grass;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = PAINT.faintInk;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    return;
  }
  const bandEdge = Math.round(ground * 0.62);
  ctx.fillStyle = PAINT.sky;
  ctx.fillRect(0, 0, W, bandEdge);
  ctx.fillStyle = PAINT.haze;
  ctx.fillRect(0, bandEdge, W, ground - bandEdge);
  ctx.fillStyle = PAINT.grass;
  ctx.fillRect(0, ground, W, H - ground);
  inkStyle(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(0, ground + 1);
  ctx.lineTo(W, ground + 1);
  ctx.stroke();
}

/* The training park's obstacles: a yellow rail seen end on, a concrete post
 * seen from above, a concrete wall standing on the grass with its pink
 * target band at flying height. */
const OBSTACLE = {
  bar(ctx, f) {
    cel(ctx, PAINT.rail, 2.5, () => ctx.arc(f.cx, f.cy, f.scale * 0.1, 0, FULL));
    ctx.fillStyle = PAINT.ink;
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.scale * 0.036, 0, FULL);
    ctx.fill();
  },
  pole(ctx, f) {
    cel(ctx, PAINT.concrete, 2.5, () => ctx.arc(f.cx, f.cy, f.scale * 0.11, 0, FULL));
  },
  wall(ctx, f) {
    const left = f.cx + f.scale * 1.02;
    const width = f.scale * 0.26;
    const top = Math.max(4, f.cy - f.scale * 0.85);
    celBox(ctx, PAINT.concrete, 2.5, left, top, width, f.ground - top);
    celBox(ctx, PAINT.nose, 2, left, f.cy - f.scale * 0.06, width, f.scale * 0.12);
  },
};

/* The craft, in units of its size r: four props, a body, and a pink nose
 * that makes its heading unmistakable. */
const PROP_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const BODY = [[-0.5, -0.42], [0.5, -0.42], [0.62, 0], [0.5, 0.42], [-0.5, 0.42]];
const NOSE = [[0.18, -0.26], [0.86, 0], [0.18, 0.26]];

function paintCraft(ctx, at, pose, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(at.x, at.y);
  ctx.rotate(pose.spin);
  /* Never squashed to a line: at its thinnest it is still a craft. */
  ctx.scale(1, Math.max(0.22, Math.abs(pose.squash ?? 1)));
  const reach = r * 0.62;
  ctx.fillStyle = pose.inv ? PAINT.propBellyUp : PAINT.prop;
  for (const [sx, sy] of PROP_CORNERS) {
    ctx.beginPath();
    ctx.arc(sx * reach, sy * reach, r * 0.3, 0, FULL);
    ctx.fill();
    inkStyle(ctx, 2);
    ctx.stroke();
  }
  cel(ctx, pose.inv ? PAINT.bodyBellyUp : PAINT.body, 2, () => polygon(ctx, BODY, r));
  cel(ctx, PAINT.nose, 2, () => polygon(ctx, NOSE, r));
  ctx.restore();
}

/* The dashed path flown so far and three faint copies of the craft along
 * it, so a single still frame still shows the shape of the trick. */
const TRAIL_POINTS = 46;
const GHOSTS = 3;

function paintTrail(ctx, film, t, f, craftSize) {
  ctx.save();
  ctx.strokeStyle = PAINT.nose;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  for (let i = 0; i <= TRAIL_POINTS; i += 1) {
    const p = poseAt(film, (t * i) / TRAIL_POINTS);
    const q = onScreen(f, p.x, p.y);
    if (i) {
      ctx.lineTo(q.x, q.y);
    } else {
      ctx.moveTo(q.x, q.y);
    }
  }
  ctx.stroke();
  ctx.restore();
  for (let i = 1; i <= GHOSTS; i += 1) {
    const p = poseAt(film, (t * i) / 4.4);
    paintCraft(ctx, onScreen(f, p.x, p.y), p, craftSize * 0.72, 0.2);
  }
}

/* One whole frame at t ms into the film, on a W by H area. */
export function drawFilm(ctx, film, t, W, H) {
  ctx.clearRect(0, 0, W, H);
  const f = frameFor(film.view, W, H);
  paintBackdrop(ctx, film.view, W, H, f.ground);
  if (film.obstacle) OBSTACLE[film.obstacle](ctx, f);
  const craftSize = f.scale * 0.15;
  paintTrail(ctx, film, t, f, craftSize);
  const pose = poseAt(film, t);
  const at = onScreen(f, pose.x, pose.y);
  /* The moment of a tap lights up where the craft meets the wall. */
  if (pose.seg && pose.seg.tap && pose.u > 0.45 && pose.u < 0.62) {
    ctx.fillStyle = PAINT.flash;
    ctx.beginPath();
    ctx.arc(at.x, at.y, f.scale * 0.16, 0, FULL);
    ctx.fill();
  }
  paintCraft(ctx, at, pose, craftSize, 1);
}

/* ------------------------------------------------------------------ *
 * The player
 * ------------------------------------------------------------------ */

export class TrickFilmPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.film = null;
    this.frame = 0;
    this.startedAt = 0;
    this.still = typeof window !== 'undefined' && Boolean(window.matchMedia)
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onFrame = (now) => {
      if (!this.startedAt) this.startedAt = now;
      this.draw((now - this.startedAt) % this.film.totalMs);
      this.frame = requestAnimationFrame(this.onFrame);
    };
  }

  /* Sizes the backing store to the element at up to 2x; a teaching picture
   * beside a simulator does not need more. The store is reallocated only
   * when its width changes, as writing the size clears the canvas. */
  size() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = Math.max(160, Math.round(rect.width));
    const h = Math.max(110, Math.round(rect.height));
    const storeWidth = Math.round(w * dpr);
    if (this.canvas.width !== storeWidth) {
      this.canvas.width = storeWidth;
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  show(film) {
    this.film = film;
    this.startedAt = 0;
    this.draw(0);
    this.start();
  }

  start() {
    if (this.still) {
      if (this.film) this.drawStrip();
      return;
    }
    if (this.frame || !this.film) return;
    this.frame = requestAnimationFrame(this.onFrame);
  }

  stop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.startedAt = 0;
  }

  draw(t) {
    if (!this.film) return;
    const { w, h } = this.size();
    drawFilm(this.ctx, this.film, t, w, h);
  }

  /* Reduced motion: up to four stills across the canvas, from the start to
   * the finished shape, with an ink rule between them. */
  drawStrip() {
    const { w, h } = this.size();
    const { ctx, film } = this;
    const panels = Math.min(4, film.segs.length + 1);
    const pw = w / panels;
    const playMs = film.totalMs - END_PAUSE_MS;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < panels; i += 1) {
      const left = i * pw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, 0, pw, h);
      ctx.clip();
      ctx.translate(left, 0);
      drawFilm(ctx, film, playMs * (i / (panels - 1 || 1)), pw, h);
      ctx.restore();
      if (i > 0) {
        ctx.strokeStyle = PAINT.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, 0);
        ctx.lineTo(left, h);
        ctx.stroke();
      }
    }
  }
}
