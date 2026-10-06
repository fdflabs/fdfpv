/*
 * trickdetect-golden.js: src/game/trickdetect.js held to the exact outputs
 * it gave when tests/fixtures/trickdetect-golden.json was written.
 * npm run trick:golden.
 *
 * Three kinds of case:
 *
 *   exports   the axis names, the whole PATTERNS table, and snapTurns and
 *             snapPathTurns over a grid that crosses every snap boundary.
 *   drivers   the existing checks (score-selftest, the full trick sweep,
 *             path-check, orbit-check) run as they are, with every detector
 *             they make tapped by scripts/lib/trickdetect-tap.js: each
 *             detector's calls, returns and tricks, in order, as a digest,
 *             plus the check's own output and exit code. Two of those
 *             checks fail today (score-selftest 2, path-check 5); the record
 *             holds them failing the same way, because the rewrite must
 *             reproduce the old outputs, wrong ones included, and fixing
 *             them is a separate change.
 *   fuzz      seeded flights the checks never fly: rolls, flips and yaw
 *             spins of every quarter count at many rates, with overshoot
 *             and cross axis wobble, mixed axes, loops round rails and
 *             orbits round poles placed where the flight goes (some flown
 *             inverted), decoy obstacles, a stand-in world for the solids
 *             query, bumps, near calls, idles, resets and odd time steps.
 *             Every trick is written with the step it arrived on.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AXIS_NAME, AXIS_PITCH, AXIS_ROLL, AXIS_YAW, PATTERNS, TrickDetector, snapPathTurns, snapTurns,
} from '../src/game/trickdetect.js';
import { OB_BAR, OB_POLE, ObstacleField } from '../src/game/obstacles.js';
import { goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/trickdetect-golden.json', import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAP = fileURLToPath(new URL('./lib/trickdetect-tap.js', import.meta.url));

const cases = [];

/* ---------------------------------------------------------------- exports */

cases.push({
  id: 'exports',
  run: (s) => {
    s.say('axes', {
      AXIS_ROLL, AXIS_PITCH, AXIS_YAW, AXIS_NAME,
    });
    s.say('patterns', PATTERNS);
  },
});

cases.push({
  id: 'snap',
  run: (s) => {
    const ups = [1, 0.7, 0.2, 0, -0.2, -0.7, -1];
    for (let i = -140; i <= 140; i += 1) {
      const raw = i / 40;
      for (const axis of [AXIS_ROLL, AXIS_PITCH, AXIS_YAW]) {
        for (const a of ups) {
          for (const b of ups) {
            s.call(`snapTurns(${raw},${axis},${a},${b})`, () => snapTurns(raw, axis, a, b));
          }
        }
      }
      for (const kind of [OB_BAR, OB_POLE]) {
        for (const a of [-1, 0, 1]) {
          for (const b of [-1, 0, 1]) {
            s.call(`snapPathTurns(${raw},${kind},${a},${b})`, () => snapPathTurns(raw, kind, a, b));
          }
        }
      }
    }
  },
});

/* ---------------------------------------------------------------- drivers */

const DRIVERS = [
  ['score-selftest', ['scripts/score-selftest.js']],
  ['trick-sweep', ['scripts/trick-sweep.js', '--all']],
  ['path-check', ['scripts/path-check.js']],
  ['orbit-check', ['scripts/orbit-check.js']],
];

for (const [id, argv] of DRIVERS) {
  cases.push({
    id: `driver-${id}`,
    run: (s) => {
      const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'trick-tap-'));
      const out = join(dir, 'tap.json');
      const r = spawnSync(process.execPath, ['--import', TAP, ...argv], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, TRICK_TAP_OUT: out }, maxBuffer: 64 << 20,
      });
      s.say('exit', r.status);
      s.say('stdout', r.stdout);
      let tapes = [];
      try {
        tapes = JSON.parse(readFileSync(out, 'utf8'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      s.say('detectors', tapes.length);
      for (const t of tapes) s.say('detector', t);
    },
  });
}

/* ---------------------------------------------------------------- fuzz */

const TURN = 2 * Math.PI;

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function scale(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return scale(a, 1 / l);
}
/* Rodrigues: v turned by angle about the unit axis k. */
function rotate(v, k, angle) {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), sn)), scale(k, dot(k, v) * (1 - c)));
}

/*
 * A flight is planned as segments, each a constant body rate (p about the
 * nose, q about the right wing, r about up, the decomposition the detector
 * uses) held for a duration, plus events at segment starts. Planning first
 * and flying second lets a rail or a pole be put exactly where a loop or an
 * orbit will go round it.
 */
function planFlight(rng) {
  const segs = [];
  const n = rng.int(4, 14);
  const quarter = () => rng.pick([1, 2, 3, 4, 5, 6, 8, 12]) * (rng.chance(0.5) ? 1 : -1) * 0.25;
  for (let i = 0; i < n; i += 1) {
    const kind = rng.pick(['cruise', 'cruise', 'spin', 'spin', 'spin', 'mixed', 'loop', 'loop', 'orbit', 'track', 'wobble', 'pause']);
    const speed = rng.pick([0, 2, 6, 10, 14, 20, 30]);
    if (kind === 'cruise') {
      segs.push({ kind, ms: rng.int(80, 1500), rates: [rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), rng.range(-0.4, 0.4)], speed });
    } else if (kind === 'spin') {
      const axis = rng.int(0, 2);
      const turns = quarter() + (rng.chance(0.4) ? rng.range(-0.15, 0.15) : 0);
      const rate = rng.pick([2.5, 3.1, 4, 6, 9, 12, 15]) * Math.sign(turns || 1);
      const rates = [0, 0, 0];
      rates[axis] = rate;
      if (rng.chance(0.3)) rates[(axis + 1) % 3] = rng.range(-1.5, 1.5);
      segs.push({ kind, ms: Math.max(1, Math.round((Math.abs(turns) * TURN / Math.abs(rate)) * 1000)), rates, speed });
    } else if (kind === 'mixed') {
      segs.push({ kind, ms: rng.int(150, 900), rates: [rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8)], speed });
    } else if (kind === 'track') {
      const radius = rng.pick([1.5, 3, 5, 8]);
      const v = rng.pick([4, 8, 12]);
      const laps = rng.pick([1, 2, 2, 3]);
      const rate = v / radius;
      segs.push({
        kind, ms: Math.round((laps * TURN / rate) * 1000), rates: [0, 0, rate], speed: v, radius, laps, inverted: rng.chance(0.4),
      });
    } else if (kind === 'loop' || kind === 'orbit') {
      const radius = rng.pick([1, 2, 3.5, 5, 8]);
      const v = rng.pick([6, 10, 14]);
      const laps = rng.pick([0.5, 1, 1, 1.5, 2, 3]);
      const rate = v / radius;
      const extra = rng.chance(0.3) ? rng.pick([0.5, 1]) * (rng.chance(0.5) ? 1 : -1) : 0;
      const ms = Math.round((laps * TURN / rate) * 1000);
      const rates = kind === 'loop' ? [extra * TURN / (ms / 1000), rate, 0] : [0, 0, rate];
      segs.push({ kind, ms, rates, speed: v, radius, laps, inverted: kind === 'orbit' && rng.chance(0.3) });
    } else if (kind === 'wobble') {
      segs.push({ kind, ms: rng.int(200, 2000), rates: null, speed, amp: rng.range(1, 6), hz: rng.range(0.5, 4) });
    } else {
      segs.push({ kind, ms: rng.int(50, 800), rates: [0, 0, 0], speed: 0, idle: rng.chance(0.5) });
    }
    if (rng.chance(0.12)) segs[segs.length - 1].bump = { impulse: rng.pick([0.5, 2, 3.9, 4, 8, 30]), tappable: rng.chance(0.7) };
    if (rng.chance(0.08)) segs[segs.length - 1].near = rng.pick([0.2, 0.5, 1, 3, 10]);
    if (rng.chance(0.03)) segs[segs.length - 1].reset = rng.pick(['reset', 'restart']);
  }
  return segs;
}

function flyCase(seed) {
  return (s) => {
    const rng = seeded(seed);
    const segs = planFlight(rng);
    const dtChoice = rng.pick([0.001, 0.001, 0.001, 0.002, 1 / 240]);
    const useField = rng.chance(0.75);
    const useSolids = useField && rng.chance(0.5);

    /* Pass one: where the loops and orbits go, so their obstacles can be
     * placed at the centres. */
    let pos = [rng.range(-50, 50), rng.range(2, 20), rng.range(-50, 50)];
    let nose = norm([rng.range(-1, 1), rng.range(-0.2, 0.2), rng.range(-1, 1)]);
    let up = norm(add([0, 1, 0], scale(nose, -nose[1])));
    const start = { pos, nose, up };
    const bars = [];
    const field = new ObstacleField();
    const kinematics = [];
    for (const seg of segs) {
      let rgt = cross(nose, up);
      if ((seg.kind === 'orbit' || seg.kind === 'track') && seg.inverted) {
        up = scale(up, -1);
        rgt = cross(nose, up);
        seg.flipFirst = true;
      }
      if (seg.kind === 'loop') {
        const c = add(pos, scale(up, seg.radius));
        field.add(OB_BAR, c[0], c[1], c[2], rgt[0], rgt[1], rgt[2], rng.pick([1, 3, 6]));
        bars.push({ c, d: rgt, half: 6 });
      } else if (seg.kind === 'track' || seg.kind === 'orbit') {
        /* An orbit flies nose first round the pole; a track slides sideways
         * with the nose held on it. Either way the yaw rate turns the nose
         * toward minus right, so the centre is found from that. */
        const c = seg.kind === 'track'
          ? add(pos, scale(nose, seg.radius))
          : add(pos, scale(rgt, -seg.radius * Math.sign(seg.rates[2])));
        field.add(OB_POLE, c[0], c[1] - 2, c[2], 0, 1, 0, rng.pick([2, 4, 8]));
        bars.push({ c, d: [0, 1, 0], half: 8 });
      }
      const dtS = dtChoice;
      const steps = Math.max(1, Math.round(seg.ms / 1000 / dtS));
      for (let i = 0; i < steps; i += 1) {
        const rates = seg.rates ?? [0, Math.sin(i * dtS * seg.hz * TURN) * seg.amp, Math.cos(i * dtS * seg.hz * TURN) * seg.amp * 0.5];
        const w = add(add(scale(nose, rates[0]), scale(rgt, rates[1])), scale(up, rates[2]));
        const mag = Math.hypot(w[0], w[1], w[2]);
        if (mag > 0) {
          const k = scale(w, 1 / mag);
          nose = norm(rotate(nose, k, mag * dtS));
          up = norm(rotate(up, k, mag * dtS));
          up = norm(add(up, scale(nose, -dot(up, nose))));
          rgt = cross(nose, up);
        }
        pos = add(pos, scale(seg.kind === 'track' ? rgt : nose, seg.speed * dtS));
        kinematics.push({ rates, pos, nose, up });
      }
    }
    for (let i = rng.int(0, 6); i > 0; i -= 1) {
      const c = [rng.range(-60, 60), rng.range(0, 15), rng.range(-60, 60)];
      if (rng.chance(0.5)) {
        const d = norm([rng.range(-1, 1), rng.chance(0.3) ? rng.range(-1, 1) : 0, rng.range(-1, 1)]);
        field.add(OB_BAR, c[0], c[1], c[2], d[0], d[1], d[2], rng.pick([1, 4, 10]));
        bars.push({ c, d, half: 10 });
      } else {
        field.add(OB_POLE, c[0], c[1], c[2], 0, 1, 0, rng.pick([2, 5]));
        bars.push({ c, d: [0, 1, 0], half: 5 });
      }
    }
    field.build();

    /* A stand-in for the world's distance query: the same rails and poles
     * as round bars 5 cm thick. */
    const nearestBar = (x, y, z) => {
      let best = null;
      for (const b of bars) {
        const rel = [x - b.c[0], y - b.c[1], z - b.c[2]];
        let t = dot(rel, b.d);
        t = Math.max(-b.half, Math.min(b.half, t));
        const foot = add(b.c, scale(b.d, t));
        const gap = Math.max(0, Math.hypot(x - foot[0], y - foot[1], z - foot[2]) - 0.05);
        if (!best || gap < best.gap) best = { gap, b, foot };
      }
      return best;
    };
    const solids = {
      gapAt: (x, y, z, r) => {
        const nb = nearestBar(x, y, z);
        return nb && nb.gap <= r ? nb.gap : Infinity;
      },
      axisAt: (x, y, z, r) => {
        const nb = nearestBar(x, y, z);
        if (!nb || nb.gap > r) return null;
        return {
          gap: nb.gap, dx: nb.b.d[0], dy: nb.b.d[1], dz: nb.b.d[2], cx: nb.foot[0], cy: nb.foot[1], cz: nb.foot[2],
        };
      },
    };

    /* Pass two: fly it past the detector. */
    let step = 0;
    const det = new TrickDetector((t) => s.say(`trick@${step}`, t), useField ? field : null);
    if (useSolids) det.solids = solids;
    s.say('start', { seed, dt: dtChoice, useField, useSolids, start, segs: segs.length });
    let k = 0;
    for (const seg of segs) {
      if (seg.reset) s.call(seg.reset, () => det[seg.reset]());
      if (seg.bump) s.call('bump', () => det.bump(seg.bump.impulse, seg.bump.tappable));
      if (seg.near !== undefined) s.call('near', () => det.near(seg.near));
      if (seg.kind === 'pause' && seg.idle) {
        s.call('idle', () => det.idle(seg.ms));
      }
      const steps = Math.max(1, Math.round(seg.ms / 1000 / dtChoice));
      for (let i = 0; i < steps; i += 1, k += 1, step += 1) {
        const st = kinematics[k];
        if (seg.kind === 'pause' && seg.idle) continue;
        const upZ = Math.max(-1, Math.min(1, st.up[1]));
        const qy = Math.sqrt(Math.max(0, (1 - upZ) / 2));
        const speed = seg.speed;
        const r = det.step(dtChoice, st.rates[0], st.rates[1], st.rates[2], 0, qy, speed,
          st.pos[0], st.pos[1], st.pos[2], st.nose[0], st.nose[1], st.nose[2], st.up[0], st.up[1], st.up[2]);
        if (r !== undefined) s.say(`step@${step}`, r);
      }
    }
    s.call('flush', () => det.flush(Math.max(-1, Math.min(1, kinematics[kinematics.length - 1].up[1]))));
    s.say('steps', step);
  };
}

for (let seed = 1; seed <= 240; seed += 1) {
  cases.push({ id: `fuzz-${seed}`, run: flyCase(7000 + seed) });
}

goldenMain('trick:golden', FIXTURE, cases);
