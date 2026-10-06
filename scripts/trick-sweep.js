/*
 * trick-sweep.js: does the trick recogniser ever pay for more than was flown?
 *
 *     node scripts/trick-sweep.js                   hand-built laps and rotations, perturbed
 *     node scripts/trick-sweep.js --all             every catalogue pattern, flown from its steps
 *     node scripts/trick-sweep.js --all --write     ...and regenerate src/game/proven.js
 *     node scripts/trick-sweep.js --show=Name[,Name] [--bank=N]   fly once, print what was measured
 *     --only=text  (default mode)  run only the cases whose label holds text
 *     --debug      (any mode)      print every primitive and every lap close
 *
 * A pilot never flies the textbook shape: the bank is off, the loop goes a
 * bit short or long, the line wobbles. This flies each shape across those
 * variations and sorts every flight into four piles: the trick it was
 * (right), no trick (silent), a cheaper trick (under) or a dearer one
 * (over). Silence and underpaying are the recogniser being cautious; paying
 * more than was flown is the one thing a scoring game cannot do, so a single
 * over-claim makes the run exit 1.
 *
 * The flights carry a whole attitude (nose and up) and the body rates are
 * taken from how that frame turns between samples, as a gyro would see them.
 * That is what makes this different from score-selftest, which never hands
 * the recogniser an up axis and so never reaches its de-banking path.
 *
 * Every argument handed to the detector is pinned bit for bit by the
 * trickdetect golden, so the arithmetic below keeps its exact operation
 * order: a point on a circle is built from both basis vectors even where one
 * component is zero, because scaling a zero by a negative gives -0.
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

import { writeFileSync } from 'node:fs';
import { PATTERNS, TrickDetector } from '../src/game/trickdetect.js';
import { trickByName } from '../src/game/tricks.js';
import { ObstacleField, OB_BAR, OB_POLE } from '../src/game/obstacles.js';

const argv = process.argv;
const flag = (name) => argv.includes(name);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.split('=')[1];
};
const DEBUG = flag('--debug');

const TURN = Math.PI * 2;
const DEG = Math.PI / 180;
const DT = 0.001;

/* ---- vectors (Y up) ---- */

const vec = (x, y, z) => ({ x, y, z });
const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a, s) => vec(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = (a) => Math.sqrt(dot(a, a));
const unit = (a) => scale(a, 1 / (len(a) || 1));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/* The part of v square to n, renormalised: keeps an up axis honest after
 * the nose has moved under it. */
const squareTo = (v, n) => unit(sub(v, scale(n, dot(n, v))));

function rotate(v, k, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/* Turn a frame about one of its own axes and renormalise both vectors. */
function turnFrame(frame, axisName, angle) {
  const axis = axisName === 'roll' ? frame.n
    : axisName === 'yaw' ? frame.up : cross(frame.n, frame.up);
  frame.n = unit(rotate(frame.n, axis, angle));
  frame.up = unit(rotate(frame.up, axis, angle));
}

const Y_UP = vec(0, 1, 0);
const RAIL_CENTRE = vec(0, 8, 0);

/* ---- one detector, one world, one flight ---- */

let lastFlight = null;

function makeWorld(pole) {
  const field = new ObstacleField();
  if (pole) {
    field.add(OB_POLE, 0, 8, 0, 0, 1, 0, 8);
  } else {
    field.add(OB_BAR, 0, 8, 0, 1, 0, 0, 8);
  }
  field.build();
  return field;
}

const dp = (v, n) => (v ?? 0).toFixed(n);
const list2 = (a) => `[${(a ?? []).map((v) => v.toFixed(2)).join(',')}]`;

function debugPrim(prim) {
  if (prim.kind === 'path') {
    console.log(`    [lap] ${prim.obstacle} turns ${prim.turns} raw ${dp(prim.rawTurns, 3)} `
      + `side ${prim.startSide}->${prim.endSide} rot ${list2(prim.rot)} spin ${dp(prim.spin, 2)} `
      + `align ${list2(prim.align)} own ${list2(prim.own)}`);
  } else {
    console.log(`    [rot] axis ${prim.axis} turns ${prim.turns} dir ${prim.dir}`);
  }
}

class Flight {
  constructor(pole) {
    this.names = [];
    this.prims = [];
    this.det = new TrickDetector((trick) => this.names.push(trick.name), makeWorld(pole));
    this.prev = null;
    this.prevPos = vec(0, 0, 0);
    this.speed = 12;

    const det = this.det;
    const insert = det.insertPending.bind(det);
    det.insertPending = (prim) => {
      this.prims.push(prim);
      insert(prim);
    };
    if (DEBUG) {
      const record = det.insertPending;
      det.insertPending = (prim) => {
        debugPrim(prim);
        record(prim);
      };
      const close = det.closePath.bind(det);
      det.closePath = (run, upZ) => {
        if (run.open && run.obstacle) {
          console.log(`    [close] wind ${(run.lastWind - run.startWind).toFixed(3)} `
            + `side ${run.startSide}->${run.lastSide}`);
        }
        return close(run, upZ);
      };
    }
  }

  /* One millisecond at this position and attitude. */
  sample(pos, nose, upHint) {
    const n = unit(nose);
    const u = squareTo(upHint, n);
    const right = cross(n, u);
    let p = 0;
    let q = 0;
    let r = 0;
    if (this.prev) {
      const w = scale(add(add(cross(this.prev.n, n), cross(this.prev.right, right)),
        cross(this.prev.u, u)), 0.5 / DT);
      p = dot(w, n);
      q = dot(w, right);
      r = dot(w, u);
      this.speed = len(sub(pos, this.prevPos)) / DT;
    }
    const upZ = Math.max(-1, Math.min(1, u.y));
    const qy = Math.sqrt(Math.max(0, (1 - upZ) / 2));
    this.det.step(DT, p, q, r, 0, qy, this.speed, pos.x, pos.y, pos.z, n.x, n.y, n.z, u.x, u.y, u.z);
    this.prev = { n, u, right };
    this.prevPos = pos;
  }

  finish() {
    lastFlight = this;
    this.det.flush(this.prev ? this.prev.u.y : 1);
    return this.names;
  }
}

/* ---- a lap round the rail or the post ---- */

const LAP_DEFAULTS = {
  turns: 1, from: 'under', bankDeg: 0, noseAlong: false, beforeSteps: [], addRoll: 0, addYaw: 0,
  addPitch: 0, radius: 3.2, secs: 2.4, pole: false, track: false, inverted: false, drift: 0,
  beforeYaw: 0, yawSpread: false, afterSteps: [],
};

/* How many milliseconds a pre or post lap rotation takes. */
const rotationMs = (turns) => Math.round(Math.max(380, Math.abs(turns) * 720));

/* Each added rotation gets a share of the lap: one alone takes the middle
 * third; two or three are laid end to end so they do not overlap. */
function addedWindows(o) {
  const added = [o.addRoll, o.addPitch, o.addYaw].map((v) => v !== 0);
  const count = added.filter(Boolean).length;
  const middle = (x) => clamp01((x - 0.32) / 0.36);
  let k = 0;
  return added.map((on) => {
    if (!on || count < 2) {
      return middle;
    }
    const w = 0.62 / count;
    const a = 0.18 + k * (w + 0.06);
    const b = a + w;
    k += 1;
    return (x) => clamp01((x - a) / (b - a));
  });
}

function flyLap(options) {
  const o = { ...LAP_DEFAULTS, ...options };
  const axis = o.pole ? vec(0, 1, 0) : vec(1, 0, 0);
  const e1 = o.pole ? vec(1, 0, 0) : vec(0, 0, 1);
  const e2 = o.pole ? vec(0, 0, 1) : vec(0, 1, 0);
  const ph0 = o.pole ? 0 : (o.from === 'over' ? Math.PI / 2 : -Math.PI / 2);
  const d = -1;
  const N = Math.round(o.secs * o.turns * 1000);
  const [winRoll, winPitch, winYaw] = addedWindows(o);

  const at = (ph) => add(RAIL_CENTRE, add(scale(e1, o.radius * Math.cos(ph)), scale(e2, o.radius * Math.sin(ph))));
  const tangent = (ph) => unit(scale(add(scale(e1, -Math.sin(ph)), scale(e2, Math.cos(ph))), d));
  const outward = (ph) => unit(sub(at(ph), RAIL_CENTRE));
  const noseOf = (ph) => (o.noseAlong ? axis : tangent(ph));
  /* Near square to the rail the sign is a coin toss, so it falls the way the lap turns. */
  const sign = (proj) => (Math.abs(proj) < 0.2 ? -d : (proj >= 0 ? 1 : -1));
  const rollSign = sign(dot(axis, noseOf(ph0)));

  const upOf = (ph, x) => {
    const n = noseOf(ph);
    let up = rotate(squareTo(unit(sub(RAIL_CENTRE, at(ph))), n), n, o.bankDeg * DEG);
    if (o.addRoll) {
      up = rotate(up, n, rollSign * TURN * o.addRoll * winRoll(x));
    }
    if (o.inverted) {
      up = scale(up, -1);
    }
    if (o.drift) {
      up = rotate(up, n, o.drift * TURN * Math.sin(x * TURN));
    }
    return up;
  };

  const flight = new Flight(o.pole);
  const start = at(ph0);
  const entry = tangent(ph0);
  const lineIn = unit(add(entry, scale(outward(ph0), -1.1)));

  /* Run in along a line aimed at the lap's start, far enough back that the
   * rotations before the lap fit on it. */
  const budget = o.beforeSteps.reduce((acc, s) => acc + rotationMs(s.turns) + 200, 0);
  let back = 14 + 13 * (budget / 1000);
  for (let i = 0; i < 900; i++) {
    back = back - 13 * DT;
    flight.sample(add(start, scale(lineIn, -back)), entry, upOf(ph0, 0));
  }
  const frame = { n: entry, up: upOf(ph0, 0) };
  const approach = () => {
    back = Math.max(0, back - 13 * DT);
    flight.sample(add(start, scale(lineIn, -back)), frame.n, frame.up);
  };
  for (const step of o.beforeSteps) {
    const ms = rotationMs(step.turns);
    for (let i = 0; i < ms; i++) {
      turnFrame(frame, step.axis, (TURN * step.turns) / ms);
      approach();
    }
    for (let i = 0; i < 200; i++) {
      approach();
    }
  }

  if (o.beforeYaw !== 0) {
    let n = entry;
    let up = upOf(ph0, 0);
    for (let i = 0; i < 420; i++) {
      n = unit(rotate(n, up, (TURN * o.beforeYaw) / 420));
      up = squareTo(up, n);
      flight.sample(start, n, up);
    }
    for (let i = 0; i < 160; i++) {
      flight.sample(start, n, up);
    }
  }

  const pitchSign = sign(dot(axis, unit(cross(noseOf(ph0), upOf(ph0, 0)))));
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    const ph = ph0 + d * TURN * o.turns * x;
    let n = noseOf(ph);
    let up = upOf(ph, x);
    if (o.addPitch) {
      const wing = unit(cross(n, up));
      const a = pitchSign * TURN * o.addPitch * winPitch(x);
      n = unit(rotate(n, wing, a));
      up = unit(rotate(up, wing, a));
    }
    if (o.addYaw) {
      n = rotate(n, up, d * TURN * o.addYaw * (o.yawSpread ? x : winYaw(x)));
      up = squareTo(up, n);
    }
    if (o.track) {
      n = unit(sub(RAIL_CENTRE, at(ph)));
      up = squareTo(Y_UP, n);
      if (o.inverted) {
        up = scale(up, -1);
      }
    }
    flight.sample(at(ph), n, up);
  }

  const phEnd = ph0 + d * TURN * o.turns;
  const exitTangent = tangent(phEnd);
  const lineOut = unit(add(exitTangent, scale(outward(phEnd), 1.1)));
  let pos = at(phEnd);
  const out = { n: exitTangent, up: upOf(phEnd, 1) };
  if (o.afterSteps.length) {
    const away = unit(outward(phEnd));
    for (let i = 0; i < 420; i++) {
      pos = add(pos, scale(away, 13 * DT));
      flight.sample(pos, out.n, out.up);
    }
  }
  for (const step of o.afterSteps) {
    const ms = rotationMs(step.turns);
    for (let i = 0; i < ms; i++) {
      turnFrame(out, step.axis, (TURN * step.turns) / ms);
      pos = add(pos, scale(lineOut, 12 * DT));
      flight.sample(pos, out.n, out.up);
    }
  }
  /* The first run-out sample repeats the last position on purpose: speed 0 there is part of the pinned feed. */
  for (let i = 0; i < 1200; i++) {
    flight.sample(add(pos, scale(lineOut, 12 * DT * i)), out.n, out.up);
  }
  return flight;
}

/* ---- open air: level cruise, rotations, level cruise ---- */

class OpenAir {
  constructor() {
    this.flight = new Flight(false);
    this.heading = vec(0, 0, -1);
    this.pos = vec(200, 20, 200);
    this.frame = { n: this.heading, up: vec(0, 1, 0) };
  }

  tick(forward) {
    this.pos = add(this.pos, scale(this.heading, 12 * DT * forward));
    this.flight.sample(this.pos, this.frame.n, this.frame.up);
  }

  cruise(ms) {
    for (let i = 0; i < ms; i++) {
      this.pos = add(this.pos, scale(this.heading, 12 * DT));
      this.flight.sample(this.pos, this.frame.n, this.frame.up);
    }
  }

  hover(ms) {
    for (let i = 0; i < ms; i++) {
      this.flight.sample(this.pos, this.frame.n, this.frame.up);
    }
  }
}

function flyRotation(axisName, turns, secs, extra) {
  const air = new OpenAir();
  air.cruise(1400);
  const ms = Math.round(secs * 1000);
  const total = turns + extra;
  for (let i = 0; i < ms; i++) {
    turnFrame(air.frame, axisName, (TURN * total) / ms);
    air.cruise(1);
  }
  air.cruise(1400);
  return air.flight;
}

/* ---- reading the catalogue ---- */

const BUILDING_BLOCK = /^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/;

const REFUSE_CONTACT = 'needs a contact, which wants a wall and a collider';
const REFUSE_PROXIMITY = 'needs proximity to a solid';
const REFUSE_TWO_LAPS = 'two laps, which this planner does not sequence yet';
const REFUSE_BARE_LAP = 'a lap carrying no rotation at all, which cannot be flown';

/* Everything the planner needs from one catalogue entry. */
function readPattern(pat) {
  const steps = pat.steps;
  const dirs = steps.map(() => 1);
  steps.forEach((s, i) => {
    if (s.dir !== undefined) dirs[i] = s.dir;
    if (s.oppTo !== undefined) dirs[i] = -dirs[s.oppTo];
    if (s.sameAs !== undefined) dirs[i] = dirs[s.sameAs];
  });
  const axisOf = (i) => {
    const s = steps[i];
    if (s.axis) return s.axis;
    if (s.axisIn && s.axisIn.length) return s.axisIn[0];
    if (s.axisAs !== undefined) return axisOf(s.axisAs);
    return 'roll';
  };
  const axes = steps.map((_, i) => axisOf(i));
  const laps = steps.flatMap((s, i) => (s.path !== undefined ? [i] : []));
  const lapAt = laps.length ? laps[0] : -1;
  return { steps, dirs, axes, laps, lapAt, refusal: refusalOf(steps, laps) };
}

function refusalOf(steps, laps) {
  if (steps.some((s) => s.tap)) return REFUSE_CONTACT;
  if (steps.some((s) => s.nearest !== undefined || s.near !== undefined)) return REFUSE_PROXIMITY;
  if (laps.length > 1) return REFUSE_TWO_LAPS;
  const rot = laps.length ? steps[laps[0]].rot : undefined;
  const none = (v) => v !== undefined && Math.abs(v) < 0.26;
  if (rot && none(rot.pitch) && none(rot.roll) && !((rot.yaw ?? 0) >= 0.9)) return REFUSE_BARE_LAP;
  return null;
}

/* Turn a lap step's measured rotation into lap flight options: which way the
 * nose points, and what is added on top of the lap's own turn. */
function planLap(step) {
  const turns = step.turnsAtLeast !== undefined ? step.turnsAtLeast : (step.turns ?? 1);
  const r = step.rot || {};
  const near = (a, b) => Math.abs((a ?? 0) - b) < 0.26;
  const noseAlong = r.pitch !== undefined ? r.pitch < turns - 0.01
    : (r.roll !== undefined && near(r.roll, turns));
  const plan = {
    turns,
    from: step.from || 'under',
    noseAlong,
    addPitch: r.pitch === undefined ? 0 : r.pitch - (noseAlong ? 0 : turns),
    addRoll: r.roll === undefined ? 0 : r.roll - (noseAlong ? turns : 0),
    addYaw: r.yaw === undefined ? 0 : r.yaw,
    pole: step.path === 'pole',
    track: step.track === true,
    inverted: step.inverted === true,
    yawSpread: false,
  };
  /* A flat lap whose only rotation is a full yaw: spread the yaw over the whole lap. */
  if (near(r.pitch, 0) && (r.roll === undefined || near(r.roll, 0)) && (r.yaw ?? 0) >= 0.9) {
    Object.assign(plan, { noseAlong: false, addPitch: 0, addRoll: 0, yawSpread: true });
  }
  /* A post lap is an orbit: nothing is added to it. */
  if (plan.pole) {
    Object.assign(plan, { addPitch: 0, addRoll: 0, addYaw: 0 });
  }
  return plan;
}

function flyPattern(info, bankDeg, de, drift) {
  const { steps, dirs, axes, lapAt } = info;
  const signed = (i) => ({ axis: axes[i], turns: (steps[i].turns ?? 1) * dirs[i] });
  if (lapAt >= 0) {
    const plan = planLap(steps[lapAt]);
    const before = steps.slice(0, lapAt).map((_, i) => signed(i));
    const after = steps.slice(lapAt + 1).map((_, k) => signed(lapAt + 1 + k));
    const quarterYaw = lapAt === 1 && axes[0] === 'yaw';
    return flyLap({
      ...plan,
      turns: plan.turns * (1 + de),
      bankDeg,
      drift,
      beforeYaw: quarterYaw ? (steps[0].turns ?? 0.25) : 0,
      beforeSteps: quarterYaw ? [] : before,
      afterSteps: after,
    });
  }

  const air = new OpenAir();
  air.cruise(1500);
  steps.forEach((s, i) => {
    if (s.stallMs) {
      air.hover(Math.round(s.stallMs * 1.4));
    }
    if (s.inverted && air.frame.up.y > 0) {
      for (let k = 0; k < 420; k++) {
        /* rotate(n, n, 0) is the identity bar rounding, and the rounding is pinned. */
        air.frame.n = unit(rotate(air.frame.n, air.frame.n, 0));
        air.frame.up = unit(rotate(air.frame.up, air.frame.n, TURN * 0.5 / 420));
        air.tick(1);
      }
      air.cruise(260);
    }
    const t = (s.turns ?? 1) * (1 + de) * dirs[i];
    const ms = Math.round(Math.max(420, Math.abs(t) * 780));
    for (let k = 0; k < ms; k++) {
      turnFrame(air.frame, axes[i], (TURN * t) / ms);
      air.tick(s.stallMs ? 0 : 1);
    }
    if (i < steps.length - 1) {
      air.cruise(180);
    }
  });
  air.cruise(1500);
  return air.flight;
}

/* ---- sorting flights into right, silent, under, over ---- */

const pointsOf = (name) => trickByName(name)?.points ?? 0;

function judge(records, wanted) {
  const target = Math.max(0, pointsOf(wanted));
  const tally = { wanted, target, total: records.length, right: 0, silent: 0, under: 0, over: 0 };
  const buckets = { over: new Map(), under: new Map() };
  const byBank = new Map();
  const byErr = new Map();
  for (const rec of records) {
    const hit = rec.names.includes(wanted);
    for (const [m, k] of [[byBank, rec.bank], [byErr, rec.err]]) {
      const cell = m.get(k) || { n: 0, ok: 0 };
      cell.n += 1;
      cell.ok += hit ? 1 : 0;
      m.set(k, cell);
    }
    if (hit) {
      tally.right += 1;
      continue;
    }
    const real = rec.names.filter((nm) => !BUILDING_BLOCK.test(nm));
    if (!real.length) {
      tally.silent += 1;
      continue;
    }
    const key = real.join(' + ');
    const paid = real.reduce((acc, nm) => acc + pointsOf(nm), 0);
    const pile = paid > target ? 'over' : 'under';
    tally[pile] += 1;
    const entry = buckets[pile].get(key) || { key, paid, n: 0, first: rec };
    entry.n += 1;
    buckets[pile].set(key, entry);
  }
  const ranked = (m) => [...m.values()].sort((a, b) => b.n - a.n);
  const ordered = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]);
  return { ...tally, overs: ranked(buckets.over), unders: ranked(buckets.under),
    byBank: ordered(byBank), byErr: ordered(byErr) };
}

const share = (n, total) => `${Math.round((n / total) * 100)}%`;

function printJudgement(label, j) {
  const col = (name, n) => `${name} ${share(n, j.total).padStart(4)}`;
  console.log(`  ${j.over ? 'FAIL' : 'pass'} ${label.padEnd(26)} ${col('named', j.right)}  `
    + `${col('quiet', j.silent)}  ${col('cheaper', j.under)}  ${col('dearer', j.over)}  `
    + `[${j.total} flights, worth ${j.target}]`);
  for (const e of j.overs.slice(0, 4)) {
    const f = e.first;
    console.log(`      overpaid: "${e.key}" (${e.paid} against ${j.target}) on ${e.n} flights, `
      + `first at bank ${f.bank} error ${f.err} drift ${f.drift}`);
  }
  for (const e of j.unders.slice(0, 2)) {
    console.log(`      cheaper:  "${e.key}" (${e.paid} against ${j.target}) on ${e.n} flights`);
  }
  if (j.right < j.total) {
    const row = (cells, fmt) => cells.map(([k, c]) => `${fmt(k)}=${share(c.ok, c.n)}`).join(' ');
    console.log(`      named by bank:  ${row(j.byBank, (k) => `${k}deg`)}`);
    console.log(`      named by error: ${row(j.byErr, (k) => (k > 0 ? `+${k}` : `${k}`))}`);
  }
  return j.over;
}

/* ---- default mode: hand-built cases ---- */

const GRID = { banks: [0, 10, 20, 30, 40, 50, 60], errs: [-0.12, -0.06, 0, 0.06, 0.12], drifts: [0, 0.08, 0.16] };
const NARROW = { banks: [0, 20, 40], drifts: [0] };

const LAP_CASES = [
  ['Powerloop', 'Powerloop', { turns: 1, from: 'under' }, {}],
  ['loop, nose along the rail', 'Maverick Loop', { turns: 1, from: 'under', noseAlong: true }, {}],
  ['Matty Flip', 'Matty Flip', { turns: 0.5, from: 'over' }, {}],
  /* No trick has this name, so the target is 0 and any real name is an over-claim. */
  ['bare half lap from under', '(nothing)', { turns: 0.5, from: 'under' }, {}],
  ['Power Roll', 'Power Roll', { turns: 1, from: 'under', addRoll: 1 }, { drifts: [0, 0.08] }],
  ['Inverted 360 Powerloop', 'Inverted 360 Powerloop', { turns: 1, from: 'under', addYaw: 1 }, { drifts: [0, 0.08] }],
  ['Donkey Loop', 'Donkey Loop', { turns: 1, from: 'under', noseAlong: true, addPitch: 0.5, addYaw: 1 }, NARROW],
  ['Side Loop', 'Side Loop', { turns: 1, from: 'under', noseAlong: true, beforeYaw: 0.25 }, NARROW],
  ['Cinnamon Roll', 'Cinnamon Roll',
    { turns: 1, from: 'under', addYaw: 1, yawSpread: true, beforeYaw: 0.25 }, NARROW],
  ['Mavvy Roll', 'Mavvy Roll', { turns: 1, from: 'under', noseAlong: true, addRoll: 1 }, { drifts: [0, 0.08] }],
  ['Orbit x2', 'Orbit x2', { turns: 2, pole: true, track: true, radius: 6, secs: 3 }, { banks: [0], drifts: [0, 0.08] }],
  ['Trippy Spin x2', 'Trippy Spin x2',
    { turns: 2, pole: true, track: true, inverted: true, radius: 6, secs: 3 }, { banks: [0], drifts: [0, 0.08] }],
];

const ROTATION_CASES = [
  ['Roll', 'roll', 1],
  ['Flip', 'pitch', 1],
  ['Yaw Spin', 'yaw', 1],
  ['Double Roll', 'roll', 2],
];

function runHandCases() {
  const only = option('--only')?.toLowerCase();
  const wanted = (label) => only === undefined || label.toLowerCase().includes(only);
  console.log('trick-sweep: each shape flown many times with the bank, turn and wobble a pilot really varies.');
  console.log('Naming a dearer trick fails the run. Naming nothing, or something cheaper, is allowed.');
  console.log('');
  let over = 0;
  for (const [label, name, base, narrow] of LAP_CASES) {
    if (!wanted(label)) continue;
    const g = { ...GRID, ...narrow };
    const records = [];
    for (const bank of g.banks) {
      for (const err of g.errs) {
        for (const drift of g.drifts) {
          const names = flyLap({ ...base, bankDeg: bank, drift, turns: (base.turns ?? 1) * (1 + err) }).finish();
          records.push({ bank, err, drift, names });
        }
      }
    }
    over += printJudgement(label, judge(records, name));
  }
  for (const [name, axisName, turns] of ROTATION_CASES) {
    if (!wanted(name)) continue;
    const records = [];
    for (const extra of [-0.1, -0.05, 0, 0.05, 0.1]) {
      for (const secs of [0.7, 1.0, 1.4]) {
        records.push({ bank: 0, err: extra, drift: 0, names: flyRotation(axisName, turns, secs, extra).finish() });
      }
    }
    over += printJudgement(name, judge(records, name));
  }
  console.log('');
  console.log(over === 0
    ? 'trick-sweep: no flight was paid more than the trick it flew.'
    : `trick-sweep: ${over} flights were paid more than the trick they flew.`);
  process.exit(over > 0 ? 1 : 0);
}

/* ---- catalogue mode ---- */

function sweepCatalogue() {
  const seen = new Set();
  const flown = [];
  const refused = [];
  for (const pat of PATTERNS) {
    if (seen.has(pat.name) || BUILDING_BLOCK.test(pat.name)) continue;
    seen.add(pat.name);
    if (!trickByName(pat.name)) continue;
    const info = readPattern(pat);
    if (info.refusal) {
      refused.push({ name: pat.name, reason: info.refusal });
      continue;
    }
    const records = [];
    for (const bank of [0, 25, 45]) {
      for (const err of [-0.08, 0, 0.08]) {
        records.push({ bank, err, drift: 0, names: flyPattern(info, bank, err, 0).finish() });
      }
    }
    flown.push({ name: pat.name, j: judge(records, pat.name) });
  }
  return { flown, refused };
}

function runCatalogue() {
  const { flown, refused } = sweepCatalogue();
  const over = flown.reduce((acc, f) => acc + f.j.over, 0);
  const reasons = new Map();
  for (const r of refused) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);

  console.log('trick-sweep --all: every scoreable catalogue pattern, flown from its own step list.');
  console.log('');
  console.log(`  flown: ${flown.length}; named on all of their flights: ${flown.filter((f) => f.j.right === f.j.total).length}`);
  console.log(`  not flown by this planner: ${refused.length}`);
  for (const [reason, n] of reasons) console.log(`      ${n} x ${reason}`);
  console.log('');
  const notable = flown.filter((f) => f.j.over || f.j.right < f.j.total).sort((a, b) => b.j.over - a.j.over);
  for (const f of notable) printJudgement(f.name, f.j);
  console.log('');
  console.log(over === 0
    ? `trick-sweep --all: none of the ${flown.length} patterns was paid more than it flew.`
    : `trick-sweep --all: ${over} flights were paid more than the trick they flew.`);

  if (flag('--write')) {
    if (over > 0) {
      console.log('proven.js left alone: a sweep that over-claimed proves nothing.');
    } else {
      writeProven(flown, refused);
      console.log('');
      console.log(`wrote src/game/proven.js: ${flown.length} flown, ${refused.length} not flown.`);
    }
  }
  process.exit(over > 0 ? 1 : 0);
}

const quote = (s) => `'${s.replace(/'/g, "\\'")}'`;

const PROVEN_HEAD = `/*
 * proven.js: which tricks the recogniser has been seen to name when flown.
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

/*
 * GENERATED by \`node scripts/trick-sweep.js --all --write\` (npm run
 * trick:proven). Do not edit by hand: rerun and commit after any change to
 * the trick catalogue or the recogniser.
 *
 * Every scoreable pattern is flown from its own step list at three bank
 * angles and three turn errors, nine flights each. RUNS is how many were
 * flown and LANDED how many came out with the pattern's own name, so
 * landed === runs means every flight. The trick list in the UI reads PROVEN
 * and leaves out a trick that never landed.
 *
 * NOT_FLOWN lists the patterns this rig cannot fly yet, with the reason. It
 * is a gap in the evidence, not a verdict on the trick.
 */
`;

function writeProven(flown, refused) {
  const lines = [PROVEN_HEAD, 'export const PROVEN = {'];
  for (const f of flown) lines.push(`  ${quote(f.name)}: { runs: ${f.j.total}, landed: ${f.j.right} },`);
  lines.push('};', '', 'export const NOT_FLOWN = {');
  for (const r of refused) lines.push(`  ${quote(r.name)}: ${quote(r.reason)},`);
  lines.push('};', '');
  writeFileSync(new URL('../src/game/proven.js', import.meta.url), lines.join('\n'));
}

/* ---- --show: one flight per pattern, with what the recogniser measured ---- */

function describePrim(prim) {
  if (prim.turns !== undefined && prim.rot) {
    return `  lap  turns ${prim.turns} dir ${prim.dir} from ${prim.startSide} rot ${list2(prim.rot)} `
      + `spin ${dp(prim.spin, 2)} align ${list2(prim.align)} own ${list2(prim.own)}`;
  }
  const axisName = ['roll', 'pitch', 'yaw'][prim.axis] ?? `axis ${prim.axis}`;
  return `  ${axisName} turns ${prim.turns} dir ${prim.dir} stall ${prim.stallBeforeMs ?? 0}ms `
    + `slow ${prim.slowMs ?? 0}ms inverted ${dp(prim.invertedFrac, 2)} tapped ${prim.tapped}`;
}

function runShow(names) {
  const bank = Number(option('--bank') ?? 0);
  for (const name of names.split(',').map((s) => s.trim())) {
    const pat = PATTERNS.find((p) => p.name === name);
    if (!pat) {
      console.log(`${name}: not in the catalogue`);
      continue;
    }
    console.log(`${name} (${pointsOf(name)} points)`);
    console.log(`  steps ${JSON.stringify(pat.steps)}`);
    const info = readPattern(pat);
    if (info.refusal) {
      console.log(`  not flown: ${info.refusal}`);
      continue;
    }
    if (info.lapAt >= 0) {
      console.log(`  lap plan ${JSON.stringify(planLap(info.steps[info.lapAt]))}`);
    }
    const names = flyPattern(info, bank, 0, 0).finish();
    for (const prim of lastFlight.prims) console.log(describePrim(prim));
    console.log(`  named: ${names.length ? names.join(', ') : '(nothing)'}`);
  }
}

const show = option('--show');
if (show !== undefined) {
  runShow(show);
} else if (flag('--all')) {
  runCatalogue();
} else {
  runHandCases();
}
