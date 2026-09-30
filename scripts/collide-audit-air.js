/*
 * collide-audit-air.js: aircraft against aircraft, and against the room's
 * other game entities, audited against a truth. npm run collide:audit-air.
 *
 * Every rule here judges sampled poses: the pilot's POSE samples, stamped
 * on the room clock, interpolated between two samples no more than GAP_MS
 * apart and stepped on the whole room millisecond (src/game/midair.js).
 * How a client samples is --client:
 *
 *   plant   (the default, src/main.js roomPoseStep) at 30 Hz on the
 *           plant's step clock, stamped with the room time of the step,
 *           whatever the frame rate, and sent on the frame after: the
 *           pose goes out late on a slow frame, never missing.
 *   frame   the client before that (roomSendPose on a frame, at most
 *           30 Hz, stamped with the frame's time), which a page loaded
 *           before the change still is.
 *
 * Both assume the plant keeps real time. Under 10 fps it does not (the
 * shell caps a frame's step at 100 ms), and the pilot is told so.
 *
 * This harness flies scripted true paths
 * (straight, or a 6 g turn with a 360 deg/s roll), samples them the way a
 * client at a given frame rate does, with a given clock error, and holds
 * each rule's answer against the same rule run on a truth track: the true
 * path sampled every 0.1 ms and stepped every 0.1 ms (the rule's own code,
 * on a clock scaled ten times), so the only differences left are the
 * sampling, the stamps and the millisecond step. Sections:
 *
 *   hulls   every airframe's crash hull (configs/hulls.js) against the
 *           machine as drawn: its span, length and height, off by more
 *           than 10 percent is flagged. A prop that folds (folds: true,
 *           configs/hullfit.js) is left out of the hull as the machine
 *           is built, motor stopped; with --three the hull with it is
 *           held to the machine drawn with its prop turning as well.
 *           The drawn numbers are the table's
 *           `dims` (configs/airframes.js, "the drawn machine"), or, with
 *           --three=DIR (an unpacked three@0.160.0 npm package), the
 *           built meshes' own bounding box (src/render/craft.js).
 *   midair  the referee (edge/rooms/referee.js, fed encoded POSEs) over
 *           nine airframe pairs from two whoops to a quad against a 1.8 m
 *           wing, head on, crossing at 90 and converging at 45 degrees,
 *           10 to 150 m/s closing (either aircraft at most MAX_MPS),
 *           offsets across both hulls. A miss is a
 *           truth overlap of 5 cm or more left unjudged; a false hit a
 *           hit where the truth never touched.
 *   bubble  src/game/midair.js within at 6 m, the Catch the Ace tag and
 *           the war's warhead (edge/rooms/war.js, the attacker a point on
 *           its 20 ms grid), passes 5.5 to 6.5 m from the centre.
 *   orb     edge/rooms/tag.js catchOrb, the free orb at 6 m, the same.
 *   cut     src/game/cut.js judgeCut, the 3 m paper cut, a static
 *           streamer on 10 Hz frames, passes 2.7 to 3.3 m from the line.
 *   damage  the plant (dist/sim.wasm) with crash damage off refuses the
 *           both break rule's sim_part_break, which the shell's hit calls,
 *           so every room whose referee judges a mid air must fly its
 *           pilots with damage on (src/game/midair.js roomForcesDamage,
 *           which src/main.js crashDamageWanted reads).
 *
 * Each row prints miss and false rates. A row is flagged when a rule
 * misses a truth contact 5 cm (15 cm for the bubbles and the cut) inside
 * its line, or judges one that stayed 5 cm outside it, in more than 1
 * percent of runs. Exit 1 when anything is flagged: an audit's findings
 * stay loud.
 *
 *   node scripts/collide-audit-air.js [--seeds=24] [--only=midair,bubble]
 *                                     [--three=DIR] [--client=plant|frame]
 *                                     [--fps=60,30,...] [--skews=0,5,...]
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HULLS } from '../configs/hulls.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { FLAG_AIRBORNE, FLAG_QUAD, decodePose, encodePose } from '../src/share/roomwire.js';
import { Referee } from '../edge/rooms/referee.js';
import { RoomTag } from '../edge/rooms/tag.js';
import { SAMPLE_MS as WAR_SAMPLE_MS } from '../edge/rooms/war.js';
import { BUBBLE_M } from '../src/share/roomtag.js';
import { BLAST_M } from '../src/share/war/routes.js';
import {
  GAP_MS, Track, hullDistance, hullFor, judge, roomForcesDamage, within,
} from '../src/game/midair.js';
import { REACH_M, StreamerTrack, judgeCut } from '../src/game/cut.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEEDS = Number(arg('seeds', 24));
const ONLY = arg('only', 'hulls,midair,bubble,orb,cut,damage').split(',');
const THREE_DIR = arg('three', null);
const CLIENT = arg('client', 'plant');
if (!['plant', 'frame'].includes(CLIENT)) {
  throw new Error(`--client=${CLIENT}: plant or frame`);
}

/* The truth track's step and the clock it is judged on: 0.1 ms, by
 * running the rule on a clock ten times finer (times x10, speeds /10). */
const FINE = 10;
/* Room time of the pass, clear of 0 so a stamp is never clamped. */
const T0 = 20000;
/* How far before and after the pass is flown. */
const WINDOW_MS = 700;
/* What counts as a real miss or a real false answer. */
const DEEP_M = 0.05;
const BUBBLE_BAND_M = 0.15;
/* Past this rate a row is flagged. */
const FLAG_RATE = 0.01;
const FPS = arg('fps', '60,30,20,10,5,3').split(',').map(Number);
/* The fastest either aircraft of a pass flies: a pass whose geometry
 * needs more at its closing speed is not flown. */
const MAX_MPS = 80;
const MIN_TURN_M = 5;
const SKEWS = arg('skews', '0,1,5,10,20').split(',').map(Number);

let flagged = 0;
const flag = (bad, line) => {
  if (bad) {
    flagged += 1;
  }
  console.log(`  ${bad ? 'FLAG' : 'ok  '}  ${line}`);
};

/* ------------------------------------------------------------ the random */

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* --------------------------------------------------------- vectors, poses */

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/* The quaternion (x, y, z, w) whose matrix has these columns: the
 * Three.js body frame's right, up and back (forward is -z). */
function quatFromColumns(r, u, b) {
  const m00 = r[0], m10 = r[1], m20 = r[2];
  const m01 = u[0], m11 = u[1], m21 = u[2];
  const m02 = b[0], m12 = b[1], m22 = b[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}

/*
 * One true path, through `at` at room time T0 heading `dir` at `speed`:
 * straight, or turning at `g` about the axis `side` x dir (so the centre
 * of the turn is along `side`), rolling at `rollRate` rad/s about the
 * heading from `roll0`. Returns t (room ms) -> pose.
 */
function path({ at, dir, speed, g = 0, side = [0, 1, 0], roll0 = 0, rollRate = 0 }) {
  const d = unit(dir);
  const n = unit(sub(side, mul(d, dot(side, d))));
  /* No tighter than MIN_TURN_M: 6 g at 5 m/s is a circle smaller than a
   * wing, which nothing flies. */
  const a = Math.min(g * 9.81, (speed * speed) / MIN_TURN_M);
  const R = a > 0 ? speed * speed / a : Infinity;
  const w = a > 0 ? speed / R : 0;
  return (t) => {
    const s = (t - T0) / 1000;
    let p;
    let v;
    if (a > 0) {
      p = add(at, add(mul(d, R * Math.sin(w * s)), mul(n, R * (1 - Math.cos(w * s)))));
      v = add(mul(d, speed * Math.cos(w * s)), mul(n, speed * Math.sin(w * s)));
    } else {
      p = add(at, mul(d, speed * s));
      v = mul(d, speed);
    }
    const fwd = unit(v);
    let up0 = Math.abs(fwd[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    up0 = unit(sub(up0, mul(fwd, dot(up0, fwd))));
    const right0 = cross(fwd, up0);
    const phi = roll0 + rollRate * s;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const up = add(mul(up0, c), mul(right0, sn));
    const right = cross(fwd, up);
    const q = quatFromColumns(right, up, mul(fwd, -1));
    return {
      px: p[0], py: p[1], pz: p[2], qx: q[0], qy: q[1], qz: q[2], qw: q[3], vx: v[0], vy: v[1], vz: v[2],
    };
  };
}

/*
 * The poses a client at `fps` sends over [t0, t1], frames every 1000/fps
 * ms from `phase`: [{ t, at }], t the stamp and at the room time it
 * leaves (a frame's). --client=frame: a pose on a frame once the 30 Hz
 * schedule is due (roomNextSend), stamped with the frame. --client=plant:
 * a pose on the first whole plant step the same schedule is due at, each
 * frame stepping the plant over the time since the last one.
 */
function sends(fps, phase, t0, t1) {
  const frame = 1000 / fps;
  const out = [];
  let next = -Infinity;
  let stepped = t0;
  for (let at = t0 + phase; at <= t1; at += frame) {
    if (CLIENT === 'frame') {
      if (at >= next) {
        next = Math.max(next + 1000 / 30, at - 1000 / 30);
        out.push({ t: at, at });
      }
      continue;
    }
    for (let t = Math.floor(stepped) + 1; t <= at; t += 1) {
      if (t >= next) {
        next = Math.max(next + 1000 / 30, t - 1000 / 30);
        out.push({ t, at });
      }
    }
    stepped = at;
  }
  return out;
}

const sendTimes = (fps, phase, t0, t1) => sends(fps, phase, t0, t1).map((x) => x.t);

/* A sampled Track as the room holds it: through the wire (encodePose
 * rounds the stamp to the ms and the velocity to the cm/s), stamped
 * `skew` ms off the true time. */
function sampledTrack(f, times, skew, flags) {
  const tr = new Track(1e9);
  for (const t of times) {
    tr.push(decodePose(encodePose({ ...f(t), t: t + skew, flags, seq: 0, wx: 0, wy: 0, wz: 0 })));
  }
  return tr;
}

/* The truth: the path every 0.1 ms, on the scaled clock. */
function fineTrack(f, flags, t0 = T0 - WINDOW_MS, t1 = T0 + WINDOW_MS) {
  const tr = new Track(1e9);
  for (let k = t0 * FINE; k <= t1 * FINE; k += 1) {
    const p = f(k / FINE);
    tr.push({ ...p, t: k, vx: p.vx / FINE, vy: p.vy / FINE, vz: p.vz / FINE, flags });
  }
  return tr;
}

const flagsFor = (id) => FLAG_AIRBORNE | (AIRFRAMES.find((a) => a.id === id).fixedWing ? 0 : FLAG_QUAD);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');

/* ----------------------------------------------------------------- hulls */

async function auditHulls() {
  console.log('\nhulls: crash hull against the drawn machine, span W, length L, height H');
  let drawn = null;
  if (THREE_DIR) {
    const { register } = await import('node:module');
    const base = pathToFileURL(`${THREE_DIR.replace(/\/$/, '')}/`).href;
    const hook = `data:text/javascript,${encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        if (spec === 'three') return { url: '${base}build/three.module.js', shortCircuit: true };
        if (spec.startsWith('three/addons/')) return { url: '${base}examples/jsm/' + spec.slice(13), shortCircuit: true };
        return next(spec, ctx);
      }`)}`;
    register(hook);
    const THREE = await import('three');
    const { buildCraft } = await import('../src/render/craft.js');
    drawn = (id, turning = false) => {
      const craft = buildCraft(id);
      /* A folding prop opens over a few calls (glidercraft.js setProp). */
      for (let k = 0; turning && craft.setProp && k < 60; k += 1) {
        craft.setProp(500);
      }
      const g = craft.group;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3();
      g.traverse((o) => {
        /* The outline hulls are drawn back faces, a line's width out. */
        if (o.isMesh && o.visible && !(o.material && o.material.side === THREE.BackSide)) {
          box.union(new THREE.Box3().setFromObject(o, true));
        }
      });
      return { L: box.max.z - box.min.z, W: box.max.x - box.min.x, H: box.max.y - box.min.y, lo: box.min.y, hi: box.max.y };
    };
  }
  for (const af of AIRFRAMES) {
    const h = HULLS[af.id];
    if (!h) {
      flag(true, `${af.id}: no hull, so the referee meets it as nothing`);
      continue;
    }
    const d = af.dims;
    /* A quad's dims carry its motor arm and prop, not its body: tip to
     * tip is the diagonal arm's half plus a prop radius, each side. */
    const quad = !af.fixedWing;
    const tip = 2 * (d.arm / Math.SQRT2 + d.propR);
    let ref = quad
      ? { L: tip, W: tip, H: d.vHalfDown + d.vHalfUp, lo: -d.vHalfDown, hi: d.vHalfUp }
      : { L: d.bodyLength, W: d.bodyWidth, H: d.vHalfDown + d.vHalfUp, lo: -d.vHalfDown, hi: d.vHalfUp };
    let src = 'dims';
    /* The Bramor's drawn group carries its catapult rail on the ground,
     * which is no part of the aircraft in the air. */
    const mesh = drawn && af.id !== 'bramor2300';
    if (mesh) {
      ref = drawn(af.id);
      src = 'mesh';
    }
    const folds = h.parts.some((p) => p.folds);
    compareHull(af.id, h.parts.filter((p) => !p.folds), ref, `hull/${src}${folds ? ' stopped' : ''}`);
    if (folds && mesh) {
      compareHull(af.id, h.parts, drawn(af.id, true), 'hull/mesh turning');
    }
  }
}

/* One hull's extents against a drawn machine's, flagged past 10 percent. */
function compareHull(id, parts, ref, label) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let k = 0; k < 3; k += 1) {
      lo[k] = Math.min(lo[k], p.min[k]);
      hi[k] = Math.max(hi[k], p.max[k]);
    }
  }
  const hull = { L: hi[0] - lo[0], W: hi[1] - lo[1], H: hi[2] - lo[2] };
  const off = ['W', 'L', 'H'].map((k) => [k, hull[k] / ref[k] - 1]);
  const worst = off.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  const text = off.map(([k, v]) => `${k} ${hull[k].toFixed(3)}/${ref[k].toFixed(3)} ${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`).join('  ');
  flag(Math.abs(worst[1]) > 0.1, `${id.padEnd(14)} ${label}  ${text}  z ${lo[2].toFixed(3)}..${hi[2].toFixed(3)} vs ${ref.lo.toFixed(3)}..${ref.hi.toFixed(3)}`);
}

/* ---------------------------------------------------------------- midair */

const PAIRS = [
  ['5inch', '5inch'],
  ['whoop65', 'whoop65'],
  ['5inch', 'whoop65'],
  ['5inch', 'f16878'],
  ['5inch', 'sky1800'],
  ['whoop65', 'p51d1450'],
  ['f16878', 'p51d1450'],
  ['p51d1450', 'p51d1450'],
  ['zagi1219', 'kadet1981'],
];
const CLOSING = [10, 50, 100, 150];
/* The angle between the two headings: 180 is head on. */
const ANGLES = [180, 90, 45];

/* The two true paths of one pass. The pair closes at `closing` m/s; the
 * offset at T0 is across the closing direction, anywhere within both
 * hulls' reach, so the set runs from clean misses through grazes to
 * deep hits. */
function passPair(hA, hB, closing, angle, curved, r) {
  const th = (angle * Math.PI) / 180;
  /* Equal speeds: |vA - vB| = 2 v sin(th/2). */
  const v = closing / (2 * Math.sin(th / 2));
  if (v > MAX_MPS) {
    return null;
  }
  const dA = [0, 0, -1];
  const dB = [Math.sin(th), 0, -Math.cos(th)];
  const rel = unit(sub(mul(dA, v), mul(dB, v)));
  let e1 = cross(rel, [0, 1, 0]);
  e1 = Math.hypot(...e1) < 1e-6 ? [1, 0, 0] : unit(e1);
  const e2 = cross(rel, e1);
  const R = hA.hull.reach + hB.hull.reach;
  const off = add(mul(e1, (2 * r() - 1) * R), mul(e2, (2 * r() - 1) * R));
  const g = curved ? 6 : 0;
  const rollRate = curved ? 2 * Math.PI : 0;
  const A = path({ at: [0, 100, 0], dir: dA, speed: v, g, side: [0, 1, 0], roll0: r() * 6.28, rollRate });
  const B = path({ at: add([0, 100, 0], off), dir: dB, speed: v, g, side: [0, -1, 0], roll0: r() * 6.28, rollRate: -rollRate });
  return { A, B };
}

/* The referee's answer on sampled, encoded POSEs, each arriving when its
 * frame sends it with no network between, the room ticking at 30 Hz
 * (edge/rooms/core.js tick), so a slow frame's poses are as late as the
 * frame and LATE_MS applies: the network's own lag is
 * scripts/midair-harness.js's. */
function refereeHit(idA, idB, A, B, fps, skew, r) {
  const ref = new Referee(false);
  ref.seat(1, idA);
  ref.seat(2, idB);
  const t0 = T0 - WINDOW_MS;
  const t1 = T0 + WINDOW_MS;
  const ev = [
    ...sends(fps, r() * (1000 / fps), t0, t1).map((x) => ({ ...x, seat: 1, f: A, id: idA, skew: 0 })),
    ...sends(fps, r() * (1000 / fps), t0, t1).map((x) => ({ ...x, seat: 2, f: B, id: idB, skew })),
  ].sort((a, b) => a.at - b.at || a.t - b.t);
  let tick = t0;
  for (const e of ev) {
    for (; tick <= e.at; tick += 1000 / 30) {
      ref.tick(tick);
    }
    const bytes = encodePose({ ...e.f(e.t), t: e.t + e.skew, flags: flagsFor(e.id), seq: 0, wx: 0, wy: 0, wz: 0 });
    if (ref.pose(e.seat, bytes, e.at).length) {
      return true;
    }
  }
  return false;
}

function auditMidair() {
  console.log('\nmidair: the referee against a 0.1 ms truth; miss = truth overlap >= 5 cm unjudged, false = judged with no truth touch');
  /* rows[key] = { n, deep, touch, miss, fals } */
  const rows = new Map();
  const bump = (key, t, hit) => {
    const row = rows.get(key) ?? { n: 0, deep: 0, touch: 0, hit: 0, miss: 0, fals: 0 };
    row.n += 1;
    row.deep += t.deep ? 1 : 0;
    row.touch += t.touch ? 1 : 0;
    row.hit += hit ? 1 : 0;
    row.miss += t.deep && !hit ? 1 : 0;
    row.fals += hit && !t.touch ? 1 : 0;
    rows.set(key, row);
  };
  const worst = [];
  for (const [idA, idB] of PAIRS) {
    const hA = hullFor(idA);
    const hB = hullFor(idB);
    for (const closing of CLOSING) {
      for (const angle of ANGLES) {
        for (const curved of [false, true]) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            const r = rng(seed * 7919 + closing * 31 + angle * 3 + (curved ? 1 : 0) + PAIRS.findIndex((p) => p[0] === idA && p[1] === idB) * 100003);
            const pass = passPair(hA, hB, closing, angle, curved, r);
            if (!pass) {
              continue;
            }
            const { A, B } = pass;
            const fa = fineTrack(A, flagsFor(idA));
            const fb = fineTrack(B, flagsFor(idB));
            const span = [(T0 - WINDOW_MS) * FINE, (T0 + WINDOW_MS) * FINE];
            const truth = {
              touch: Boolean(judge(hA, hB, fa, fb, span[0], span[1], 0)),
              deep: Boolean(judge(hA, hB, fa, fb, span[0], span[1], DEEP_M)),
            };
            const pair = `${idA} x ${idB}`;
            const path = curved ? '6g turn + roll' : 'straight';
            for (const fps of FPS) {
              const hit = refereeHit(idA, idB, A, B, fps, 0, r);
              bump(`pair|${pair}|${fps}`, truth, hit);
              bump(`speed|${closing}|${path}|${fps}`, truth, hit);
              if (fps === 60 && ((truth.deep && !hit) || (hit && !truth.touch))) {
                worst.push(`${pair} ${closing} m/s ${angle} deg ${path} seed ${seed}: ${hit ? 'judged hit, truth clear' : 'truth deep, judged miss'}`);
              }
            }
            for (const skew of SKEWS.slice(1)) {
              const hit = refereeHit(idA, idB, A, B, 60, skew, r);
              bump(`skew|${skew}|${closing}|${angle}`, truth, hit);
            }
            bump(`skew|0|${closing}|${angle}`, truth, refereeHit(idA, idB, A, B, 60, 0, r));
          }
        }
      }
    }
  }
  const show = (label, row) => `${label}  n ${row.n}, truth deep ${row.deep}, touch ${row.touch}, judged ${row.hit}: miss ${pct(row.miss, row.deep)} of deep, false ${pct(row.fals, row.n - row.touch)} of clear`;
  const bad = (row) => row.miss > FLAG_RATE * Math.max(1, row.deep) || row.fals > FLAG_RATE * Math.max(1, row.n - row.touch);
  console.log(` by pair at ${FPS[0]} fps, exact clocks, every speed, angle and path:`);
  for (const [idA, idB] of PAIRS) {
    const row = rows.get(`pair|${idA} x ${idB}|${FPS[0]}`);
    flag(bad(row), show(`${`${idA} x ${idB}`.padEnd(22)}`, row));
  }
  console.log(' by closing speed and frame rate, exact clocks, every pair and angle:');
  for (const path of ['straight', '6g turn + roll']) {
    for (const closing of CLOSING) {
      for (const fps of FPS) {
        const row = rows.get(`speed|${closing}|${path}|${fps}`);
        flag(bad(row), show(`${path.padEnd(14)} ${String(closing).padStart(3)} m/s ${String(fps).padStart(2)} fps`, row));
      }
    }
  }
  console.log(' by clock error on one seat, 60 fps, every pair and path:');
  for (const skew of SKEWS) {
    for (const closing of CLOSING) {
      for (const angle of ANGLES) {
        const row = rows.get(`skew|${skew}|${closing}|${angle}`);
        if (!row) {
          continue;
        }
        flag(bad(row), show(`skew ${String(skew).padStart(2)} ms ${String(closing).padStart(3)} m/s ${String(angle).padStart(3)} deg`, row));
      }
    }
  }
  if (worst.length) {
    console.log(` 60 fps, exact clocks, wrong answers (${worst.length}, first 12):`);
    for (const w of worst.slice(0, 12)) {
      console.log(`    ${w}`);
    }
  }
}

/* ---------------------------------------------------- the bubble rules */

/* A pass of hull `id` at speed `v` whose nearest part box comes `miss`
 * metres from a centre at the origin, found on the truth track. */
function bubblePass(h, id, v, angleDeg, curved, r) {
  const th = (angleDeg * Math.PI) / 180;
  const dir = [Math.sin(th), 0, -Math.cos(th)];
  const side = unit(cross(dir, [0, 1, 0]));
  return (lateral) => path({
    at: add([0, 100, 0], mul(side, lateral)), dir, speed: v, g: curved ? 6 : 0, side: mul(side, -1), roll0: r() * 6.28, rollRate: curved ? 2 * Math.PI : 0,
  });
}

/* The least distance from any part box of the pass to the point p over
 * the window, on the 0.1 ms truth. */
function truthMin(h, f, point, t0 = T0 - WINDOW_MS, t1 = T0 + WINDOW_MS) {
  let best = Infinity;
  for (let k = t0 * FINE; k <= t1 * FINE; k += 1) {
    const p = f(k / FINE);
    const q = point(k / FINE);
    const dc = Math.hypot(p.px - q[0], p.py - q[1], p.pz - q[2]);
    if (dc - h.hull.reach > best || dc - h.hull.reach > 10) {
      continue;
    }
    best = Math.min(best, hullDistance(h, p, q[0], q[1], q[2]));
  }
  return best;
}

function auditBubbles() {
  console.log(`\nbubble: within() at ${BUBBLE_M} m (tag) and ${BLAST_M} m (warhead), miss = truth ${BUBBLE_BAND_M * 100} cm inside unjudged, false = judged with truth ${BUBBLE_BAND_M * 100} cm outside`);
  const ids = ['5inch', 'whoop65', 'f16878', 'sky1800'];
  const speeds = [10, 40, 80];
  const rows = new Map();
  for (const id of ids) {
    const h = hullFor(id);
    for (const v of speeds) {
      for (const curved of [false, true]) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const r = rng(seed * 104729 + v * 17 + (curved ? 5 : 0) + ids.indexOf(id) * 7);
          const mk = bubblePass(h, id, v, r() * 360, curved, r);
          const lateral = 4 + r() * 4;
          const f = mk(lateral);
          /* The Ace (tag) or the attacker (war): a point, for the war on
           * its 20 ms grid at 40 m/s straight, for the tag a pilot at the
           * same frame rate as the hunter, hovering. */
          const war = seed % 2 === 0;
          const cv = war ? 40 : 0;
          const cdir = unit([r() - 0.5, 0, r() - 0.5]);
          const centre = (t) => add([0, 100, 0], mul(cdir, (cv * (t - T0)) / 1000));
          const cpose = (t) => {
            const c = centre(t);
            return { px: c[0], py: c[1], pz: c[2], qx: 0, qy: 0, qz: 0, qw: 1, vx: cdir[0] * cv, vy: cdir[1] * cv, vz: cdir[2] * cv };
          };
          const reachTruth = truthMin(h, f, centre);
          const inside = reachTruth <= BUBBLE_M - BUBBLE_BAND_M;
          const outside = reachTruth > BUBBLE_M + BUBBLE_BAND_M;
          for (const fps of FPS) {
            const hunter = sampledTrack(f, sendTimes(fps, r() * (1000 / fps), T0 - WINDOW_MS, T0 + WINDOW_MS), 0, flagsFor(id));
            const ctimes = war
              ? Array.from({ length: Math.floor((2 * WINDOW_MS) / WAR_SAMPLE_MS) + 1 }, (_, k) => T0 - WINDOW_MS + k * WAR_SAMPLE_MS)
              : sendTimes(fps, r() * (1000 / fps), T0 - WINDOW_MS, T0 + WINDOW_MS);
            const ct = new Track(1e9);
            for (const t of ctimes) {
              ct.push(war ? { ...cpose(t), t, flags: FLAG_AIRBORNE } : decodePose(encodePose({ ...cpose(t), t, flags: FLAG_AIRBORNE | FLAG_QUAD, seq: 0, wx: 0, wy: 0, wz: 0 })));
            }
            const c = within(war ? { id: 'point' } : hullFor('5inch'), h, ct, hunter, T0 - WINDOW_MS, T0 + WINDOW_MS, war ? BLAST_M : BUBBLE_M);
            const key = `${war ? 'warhead' : 'tag'}|${v}|${fps}`;
            const row = rows.get(key) ?? { n: 0, inside: 0, outside: 0, miss: 0, fals: 0 };
            row.n += 1;
            row.inside += inside ? 1 : 0;
            row.outside += outside ? 1 : 0;
            row.miss += inside && !c ? 1 : 0;
            row.fals += outside && c ? 1 : 0;
            rows.set(key, row);
          }
        }
      }
    }
  }
  for (const kind of ['tag', 'warhead']) {
    for (const v of speeds) {
      for (const fps of FPS) {
        const row = rows.get(`${kind}|${v}|${fps}`);
        flag(row.miss > FLAG_RATE * Math.max(1, row.inside) || row.fals > FLAG_RATE * Math.max(1, row.outside),
          `${kind.padEnd(7)} ${String(v).padStart(3)} m/s ${String(fps).padStart(2)} fps  n ${row.n}: miss ${pct(row.miss, row.inside)} of ${row.inside} inside, false ${pct(row.fals, row.outside)} of ${row.outside} outside`);
      }
    }
  }
}

function auditOrb() {
  console.log(`\norb: catchOrb at ${BUBBLE_M} m round a still orb, the same bands`);
  const ids = ['5inch', 'f16878'];
  const speeds = [10, 40, 80];
  for (const id of ids) {
    const h = hullFor(id);
    for (const v of speeds) {
      for (const fps of FPS) {
        const row = { n: 0, inside: 0, outside: 0, miss: 0, fals: 0 };
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const curved of [false, true]) {
            const r = rng(seed * 15485863 + v + fps * 1009 + (curved ? 3 : 0) + ids.indexOf(id));
            const f = bubblePass(h, id, v, r() * 360, curved, r)(4 + r() * 4);
            const orb = [0, 100, 0];
            const reachTruth = truthMin(h, f, () => orb);
            const inside = reachTruth <= BUBBLE_M - BUBBLE_BAND_M;
            const outside = reachTruth > BUBBLE_M + BUBBLE_BAND_M;
            const track = sampledTrack(f, sendTimes(fps, r() * (1000 / fps), T0 - WINDOW_MS, T0 + WINDOW_MS), 0, flagsFor(id));
            const tag = new RoomTag();
            tag.match = { orb: { px: orb[0], py: orb[1], pz: orb[2] } };
            const c = tag.catchOrb([{ seat: 1, hull: h, track }], T0 - WINDOW_MS, T0 + WINDOW_MS);
            row.n += 1;
            row.inside += inside ? 1 : 0;
            row.outside += outside ? 1 : 0;
            row.miss += inside && !c ? 1 : 0;
            row.fals += outside && c ? 1 : 0;
          }
        }
        flag(row.miss > FLAG_RATE * Math.max(1, row.inside) || row.fals > FLAG_RATE * Math.max(1, row.outside),
          `${id.padEnd(8)} ${String(v).padStart(3)} m/s ${String(fps).padStart(2)} fps  n ${row.n}: miss ${pct(row.miss, row.inside)} of ${row.inside} inside, false ${pct(row.fals, row.outside)} of ${row.outside} outside`);
      }
    }
  }
}

/* -------------------------------------------------------------- the cut */

function auditCut() {
  console.log(`\ncut: judgeCut at ${REACH_M} m from a still streamer on 10 Hz frames, the same bands`);
  const ids = ['5inch', 'f16878'];
  const speeds = [10, 40, 80];
  /* 40 links of 0.5 m along x at y 100, towed by a still owner. */
  const LINKS = 40;
  const nodes = new Float64Array((LINKS + 1) * 3);
  for (let i = 0; i <= LINKS; i += 1) {
    nodes[i * 3] = -10 + i * 0.5;
    nodes[i * 3 + 1] = 100;
    nodes[i * 3 + 2] = 0;
  }
  const owner = (t) => ({
    t, px: -10.5, py: 100, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, flags: FLAG_AIRBORNE | FLAG_QUAD,
  });
  const frames = (step) => {
    const s = new StreamerTrack();
    for (let t = T0 - WINDOW_MS; t <= T0 + WINDOW_MS; t += step) {
      s.push(t, LINKS + 1, nodes);
    }
    return s;
  };
  for (const id of ids) {
    const h = hullFor(id);
    for (const v of speeds) {
      for (const fps of FPS) {
        const row = { n: 0, inside: 0, outside: 0, miss: 0, fals: 0 };
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const curved of [false, true]) {
            const r = rng(seed * 32452843 + v + fps * 1013 + (curved ? 7 : 0) + ids.indexOf(id));
            /* Across the line in the horizontal plane, passing over or
             * under it by 2.4 to 3.6 m. */
            const th = (0.25 + r() * 0.5) * Math.PI;
            const dir = [Math.cos(th), 0, Math.sin(th)];
            const lift = (r() < 0.5 ? -1 : 1) * (2.4 + r() * 1.2);
            const f = path({
              at: [0, 100 + lift, 0], dir, speed: v, g: curved ? 6 : 0, side: [0, Math.sign(lift), 0], roll0: r() * 6.28, rollRate: curved ? 2 * Math.PI : 0,
            });
            /* The truth: judgeCut on the fine clock, at 3 m less and more
             * the band, so a row counts only the clear answers. A
             * StreamerTrack keeps KEEP_MS of frames, so the fine window is
             * judged in chunks, each with its own frames. */
            const fine = fineTrack(f, flagsFor(id));
            const fo = new Track(1e9);
            for (let t = (T0 - WINDOW_MS) * FINE; t <= (T0 + WINDOW_MS) * FINE; t += 100) {
              fo.push(owner(t));
            }
            const fineCut = (reach) => {
              for (let a = (T0 - WINDOW_MS) * FINE; a < (T0 + WINDOW_MS) * FINE; a += 1000) {
                const fr = new StreamerTrack();
                for (let t = a - 100; t <= a + 1100; t += 100) {
                  fr.push(t, LINKS + 1, nodes);
                }
                if (judgeCut(h, fine, fo, fr, a, a + 1000, LINKS, reach)) {
                  return true;
                }
              }
              return false;
            };
            const inside = fineCut(REACH_M - BUBBLE_BAND_M);
            const outside = !fineCut(REACH_M + BUBBLE_BAND_M);
            const cutter = sampledTrack(f, sendTimes(fps, r() * (1000 / fps), T0 - WINDOW_MS, T0 + WINDOW_MS), 0, flagsFor(id));
            const ot = new Track(1e9);
            for (const t of sendTimes(60, 0, T0 - WINDOW_MS, T0 + WINDOW_MS)) {
              ot.push(owner(Math.round(t)));
            }
            const c = judgeCut(h, cutter, ot, frames(100), T0 - WINDOW_MS, T0 + WINDOW_MS, LINKS);
            row.n += 1;
            row.inside += inside ? 1 : 0;
            row.outside += outside ? 1 : 0;
            row.miss += inside && !c ? 1 : 0;
            row.fals += outside && c ? 1 : 0;
          }
        }
        flag(row.miss > FLAG_RATE * Math.max(1, row.inside) || row.fals > FLAG_RATE * Math.max(1, row.outside),
          `${id.padEnd(8)} ${String(v).padStart(3)} m/s ${String(fps).padStart(2)} fps  n ${row.n}: miss ${pct(row.miss, row.inside)} of ${row.inside} inside, false ${pct(row.fals, row.outside)} of ${row.outside} outside`);
      }
    }
  }
}

/* ------------------------------------------------------------ damage off */

async function auditDamage() {
  console.log('\ndamage: the both break rule on a plant with crash damage off, and the rooms that could fly one into a mid air');
  const { loadSim, SIM_OK } = await import('../tests/lib/simmod.js');
  const wasm = await readFile(join(root, 'dist', 'sim.wasm'));
  const config = await readFile(join(root, 'tests', 'fixtures', 'config-baseline.diff'), 'utf8');
  for (const on of [1, 0]) {
    const sim = await loadSim(wasm);
    sim.init(config);
    sim.reset();
    sim.e.sim_set_damage(on);
    const rc = sim.e.sim_part_break(3);
    const flags = typeof sim.e.sim_damage_flags === 'function' ? sim.e.sim_damage_flags() : null;
    const broke = rc === SIM_OK && flags !== 0;
    console.log(`        damage ${on ? 'on ' : 'off'}: sim_part_break(3) rc ${rc}, damage flags ${flags}${broke ? ', the part left' : ', nothing broke'}`);
  }
  /* Two five inches through each other, 30 Hz, in a room of each kind:
   * whether its referee judges them, and whether a pilot whose own setting
   * is off flies it with damage on. */
  for (const friendly of [false, true]) {
    const ref = new Referee(friendly);
    ref.seat(1, '5inch');
    ref.seat(2, '5inch');
    let judged = false;
    for (let k = 0; k < 6; k += 1) {
      const t = T0 + k * 33;
      for (const seat of [1, 2]) {
        const bytes = encodePose({
          px: 0, py: 100, pz: (seat === 1 ? -1 : 1) * (0.5 - k * 0.2), qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: (seat === 1 ? 6 : -6), t, flags: FLAG_AIRBORNE | FLAG_QUAD, seq: 0, wx: 0, wy: 0, wz: 0,
        });
        judged = ref.pose(seat, bytes, t).length > 0 || judged;
      }
    }
    const forced = roomForcesDamage({ friendly });
    flag(judged && !forced, `a ${friendly ? 'friendly' : 'judged'} room: referee ${judged ? 'judges' : 'judges nothing'}, damage ${forced ? 'forced on' : 'the pilot\'s setting'}${judged && !forced ? ': a pilot with damage off is not broken by a mid air it was judged in, the other is (the both break rule is one sided)' : ''}`);
  }
}

/* ------------------------------------------------------------------ run */

const t0 = Date.now();
console.log(`collide-audit-air: ${SEEDS} seeds, GAP_MS ${GAP_MS}, ${CLIENT} client, frame rates ${FPS.join('/')}, clock errors ${SKEWS.join('/')} ms`);
if (ONLY.includes('hulls')) {
  await auditHulls();
}
if (ONLY.includes('midair')) {
  auditMidair();
}
if (ONLY.includes('bubble')) {
  auditBubbles();
}
if (ONLY.includes('orb')) {
  auditOrb();
}
if (ONLY.includes('cut')) {
  auditCut();
}
if (ONLY.includes('damage')) {
  await auditDamage();
}
console.log(`\n${flagged ? `${flagged} flagged` : 'nothing flagged'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(flagged ? 1 : 0);
