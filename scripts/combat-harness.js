/*
 * combat-harness.js: the cut referee under lag, docs/COMBAT-PLAN.md
 * section 7. npm run combat:harness, in CI.
 *
 * It drives edge/rooms/core.js in Node with two clients over simulated
 * links. B flies level towing a real streamer (src/game/streamer.js,
 * stepped every millisecond from B's tail), sending POSE at 30 Hz and
 * STREAMER at 10 Hz on the room clock, and applies every cut the room
 * sends it to its own paper. A flies a straight pass across B's streamer
 * at a random place along it, a random angle, bank and speed, and a
 * random miss distance, in a random airframe. Links are FIFO (a TCP
 * stream cannot reorder), delay base plus jitter, independently per
 * client and direction.
 *
 * THE TRUTH is the same pass with nothing on the wire: B's streamer at
 * every quarter millisecond, A's analytic pose, and the least distance
 * between any of A's part boxes and the paper's centre line. The owner's
 * rule (2026-09-28) cuts within a metre of it.
 *
 * What it holds (the bands of the plan's section 7):
 *   - both clients receive the same cuts, and B's paper as A decodes it is
 *     the length the room left
 *   - every run whose links, with a frame's 100 ms wait, are under
 *     COMBAT_LATE_MS decides what the zero latency run decided
 *   - a truth pass further than 1.1 m from the line is never cut, and one
 *     nearer than 0.9 m is never missed
 *   - and it reports how far A's own screen drew B's paper from the truth
 *     at the pass, per link set: what a pass that LOOKED within a metre
 *     can be off by
 *   - the decision delay over the slower client link, p95, under 250 ms
 * and it reports the band between, the room's CPU with 16 seats towing,
 * and the pieces falling on A's screen.
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

import { RoomCore } from '../edge/rooms/core.js';
import { COMBAT_LATE_MS, FULL_LINKS } from '../edge/rooms/combat.js';
import {
  FLAG_AIRBORNE, PROTO, decodeStreamerRelay, encodePose, encodeStreamer,
} from '../src/share/roomwire.js';
import { hullFor } from '../src/game/midair.js';
import { bodyAxes } from '../src/game/airframehull.js';
import { REACH_M, segmentBox } from '../src/game/cut.js';
import { createRoomCombat } from '../src/share/roomcombat.js';
import { Streamer } from '../src/game/streamer.js';

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

const quick = process.argv.includes('--quick');
let seed = 20260928;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/* A quaternion (Three.js body: forward -z, up y) flying along unit d with
 * bank r. Test paths only: trigonometry here is the harness's, not the
 * rule's. */
function flyingQuat(d, r) {
  const yaw = Math.atan2(-d[0], -d[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const mul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const qy = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qp = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  const qr = [0, 0, Math.sin(r / 2), Math.cos(r / 2)];
  return mul(mul(qy, qp), qr);
}

/* The tail: the rearmost point of the part boxes, on the centre line
 * (src/share/roomcombat.js puts the tow point there too). */
function tailOf(h) {
  let z = -Infinity;
  for (let i = 0; i < h.n; i += 1) {
    z = Math.max(z, h.cz[i] + h.hz[i]);
  }
  return [0, h.cy[0], z];
}

function place(p, q, body, out) {
  const ax = bodyAxes(q[0], q[1], q[2], q[3], new Float64Array(9));
  out[0] = p[0] + body[0] * ax[0] + body[1] * ax[3] + body[2] * ax[6];
  out[1] = p[1] + body[0] * ax[1] + body[1] * ax[4] + body[2] * ax[7];
  out[2] = p[2] + body[0] * ax[2] + body[1] * ax[5] + body[2] * ax[8];
  return out;
}

const B_AIRFRAME = 'cub1400';
const CUTTERS = ['5inch', 'cub1400', 'p51d1450', 'slowstick1180'];
const RUN_MS = 9000;

/*
 * One geometry: B level at 60 m heading along bDir at vB, A's straight
 * pass through a point `miss` metres off B's paper at arc `arc`, at
 * PASS_AT_MS. The streamer at the pass is found by flying B alone first.
 */
function makeGeometry(cutter) {
  /* Off the streamer's 10 Hz grid, so the frames' timing is sampled too. */
  const PASS_AT_MS = 7000 + Math.floor(100 * rnd());
  const vB = 9 + 7 * rnd();
  const heading = 2 * Math.PI * rnd();
  const bDir = [Math.cos(heading), 0, Math.sin(heading)];
  const bStart = [bDir[0] * -vB * 2, 60, bDir[2] * -vB * 2];
  const bq = flyingQuat(bDir, 0);
  const hB = hullFor(B_AIRFRAME);
  const tailB = tailOf(hB.hull);
  const bAt = (t) => [bStart[0] + bDir[0] * vB * t / 1000, 60, bStart[2] + bDir[2] * vB * t / 1000];
  /* B's streamer alone, to the pass. */
  const s = new Streamer();
  const tow = new Float64Array(3);
  place(bAt(0), bq, tailB, tow);
  s.lay(tow[0], tow[1], tow[2], -bDir[0], 0, -bDir[2], FULL_LINKS, null, [bDir[0] * vB, 0, bDir[2] * vB]);
  for (let t = 1; t <= PASS_AT_MS; t += 1) {
    place(bAt(t), bq, tailB, tow);
    s.step(tow[0], tow[1], tow[2]);
  }
  const arc = 4 + Math.floor(40 * rnd());
  const c = s.attached;
  const node = [c.x[arc * 3], c.x[arc * 3 + 1], c.x[arc * 3 + 2]];
  const tan = [c.x[arc * 3 + 3] - c.x[arc * 3 - 3], c.x[arc * 3 + 4] - c.x[arc * 3 - 2], c.x[arc * 3 + 5] - c.x[arc * 3 - 1]];
  /* A's direction: across the paper at 30 to 150 degrees, climbing or
   * diving a little. */
  const across = Math.PI / 6 + (2 * Math.PI / 3) * rnd();
  const tl = Math.hypot(...tan);
  const t0 = tan.map((v) => v / tl);
  const up = [0, 1, 0];
  let side = [t0[1] * up[2] - t0[2] * up[1], t0[2] * up[0] - t0[0] * up[2], t0[0] * up[1] - t0[1] * up[0]];
  const sl = Math.hypot(...side) || 1;
  side = side.map((v) => v / sl);
  const climb = 0.3 * (rnd() - 0.5);
  let aDir = [0, 1, 2].map((k) => t0[k] * Math.cos(across) + side[k] * Math.sin(across) + up[k] * climb);
  const al = Math.hypot(...aDir);
  aDir = aDir.map((v) => v / al);
  const hA = hullFor(cutter);
  /* The miss: along the normal to both the paper and A's path, from
   * straight through to past the hull's reach. */
  let nrm = [t0[1] * aDir[2] - t0[2] * aDir[1], t0[2] * aDir[0] - t0[0] * aDir[2], t0[0] * aDir[1] - t0[1] * aDir[0]];
  const nl = Math.hypot(...nrm) || 1;
  nrm = nrm.map((v) => v / nl);
  const miss = (2 * rnd() - 1) * (hA.hull.reach + REACH_M + 0.5);
  const vA = 12 + 26 * rnd();
  const bank = (rnd() - 0.5) * Math.PI;
  const through = [0, 1, 2].map((k) => node[k] + nrm[k] * miss);
  const aq = flyingQuat(aDir, bank);
  const aAt = (t) => [0, 1, 2].map((k) => through[k] + aDir[k] * vA * (t - PASS_AT_MS) / 1000);
  return {
    cutter, hA, hB, tailB, vB, bDir, bq, bAt, vA, aDir, aq, aAt, arc, miss, bank, PASS_AT_MS,
  };
}

/* The truth: the least distance between A's boxes and B's paper over the
 * pass, B's streamer stepped as B's client steps it, at quarter ms. */
function truthOf(g) {
  const s = new Streamer();
  const tow = new Float64Array(3);
  place(g.bAt(0), g.bq, g.tailB, tow);
  s.lay(tow[0], tow[1], tow[2], -g.bDir[0], 0, -g.bDir[2], FULL_LINKS, null, [g.bDir[0] * g.vB, 0, g.bDir[2] * g.vB]);
  const H = g.hA.hull;
  const ax = bodyAxes(g.aq[0], g.aq[1], g.aq[2], g.aq[3], new Float64Array(9));
  const prev = new Float64Array(s.attached.x.length);
  const P = new Float64Array(3);
  const Q = new Float64Array(3);
  const cen = new Float64Array(3);
  const half = new Float64Array(3);
  const sb = { d: 0, u: 0 };
  let best = Infinity;
  let bestT = null;
  let bestLink = -1;
  const window = 1.5 * 1000 * (H.reach + 60) / g.vA;
  const PASS_AT_MS = g.PASS_AT_MS;
  for (let t = 1; t <= PASS_AT_MS + 600; t += 1) {
    prev.set(s.attached.x);
    place(g.bAt(t), g.bq, g.tailB, tow);
    s.step(tow[0], tow[1], tow[2]);
    if (Math.abs(t - PASS_AT_MS) > window) {
      continue;
    }
    const x = s.attached.x;
    for (let q = 1; q <= 4; q += 1) {
      const u = q / 4;
      const ts = t - 1 + u;
      const a = g.aAt(ts);
      for (let k = 0; k < s.attached.n - 1; k += 1) {
        for (let m = 0; m < 3; m += 1) {
          P[m] = prev[k * 3 + m] + (x[k * 3 + m] - prev[k * 3 + m]) * u;
          Q[m] = prev[k * 3 + 3 + m] + (x[k * 3 + 3 + m] - prev[k * 3 + 3 + m]) * u;
        }
        const mid = [(P[0] + Q[0]) / 2 - a[0], (P[1] + Q[1]) / 2 - a[1], (P[2] + Q[2]) / 2 - a[2]];
        if (Math.hypot(...mid) > H.reach + REACH_M + 1) {
          continue;
        }
        for (let j = 0; j < H.n; j += 1) {
          cen[0] = a[0] + H.cx[j] * ax[0] + H.cy[j] * ax[3] + H.cz[j] * ax[6];
          cen[1] = a[1] + H.cx[j] * ax[1] + H.cy[j] * ax[4] + H.cz[j] * ax[7];
          cen[2] = a[2] + H.cx[j] * ax[2] + H.cy[j] * ax[5] + H.cz[j] * ax[8];
          half[0] = H.hx[j];
          half[1] = H.hy[j];
          half[2] = H.hz[j];
          segmentBox(P, Q, cen, ax, half, sb);
          if (sb.d < best) {
            best = sb.d;
            bestT = ts;
            bestLink = k;
          }
        }
      }
    }
  }
  return { d: best, t: bestT, link: bestLink };
}

/* A FIFO link: delivery at max(the one before, send + base + jitter). */
function link(base, jitter) {
  const q = [];
  let lastAt = -Infinity;
  return {
    send(t, data) {
      const at = Math.max(lastAt, t + base + jitter * rnd());
      lastAt = at;
      q.push({ at, data });
    },
    due(t) {
      const out = [];
      while (q.length && q[0].at <= t) {
        out.push(q.shift().data);
      }
      return out;
    },
  };
}

let tokenN = 0;
const newToken = () => {
  tokenN += 1;
  return tokenN.toString(16).padStart(32, '0');
};

/*
 * One run of geometry g over links (A up, A down, B up, B down), each
 * [base, jitter] ms. Returns what the room decided and what each client
 * received.
 */
function runOnce(g, lat, clock = { A: 0, B: 0 }) {
  const meta = { code: 'CMBT22', cap: 8, friendly: false, map: 'swiss2', epoch: 0 };
  const room = new RoomCore(meta);
  const conns = { A: { got: [] }, B: { got: [] } };
  const links = {
    Aup: link(...lat.A), Adown: link(...lat.A), Bup: link(...lat.B), Bdown: link(...lat.B),
  };
  const down = (c) => (c === conns.A ? links.Adown : links.Bdown);
  let now = 0;
  const apply = (actions) => {
    for (const a of actions) {
      if (a.send) {
        down(a.send).send(now, a.data);
      }
    }
  };
  const profile = (airframe) => ({ airframe, map: 'swiss2', figure: 0, livery: null, parts: null });
  apply(room.open(conns.A, now));
  apply(room.message(conns.A, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [1, 1, 11], profile: profile(g.cutter) }), now, '10.0.0.1', newToken));
  apply(room.open(conns.B, now));
  apply(room.message(conns.B, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [2, 2, 22], profile: profile(B_AIRFRAME) }), now, '10.0.0.2', newToken));
  /* The round is on from the start: its clock has its own selftest. */
  Object.assign(room.combat.round, { n: 1, state: 'on', startsAt: 0, endsAt: 1e9, minutes: 5 });
  const s = new Streamer();
  const tow = new Float64Array(3);
  place(g.bAt(0), g.bq, g.tailB, tow);
  s.lay(tow[0], tow[1], tow[2], -g.bDir[0], 0, -g.bDir[2], FULL_LINKS, null, [g.bDir[0] * g.vB, 0, g.bDir[2] * g.vB]);
  const seen = { A: [], B: [] };
  let bOnA = null;
  let pieceLow = [];
  /* What A's screen draws of B's paper (src/share/roomcombat.js, the
   * shell's own code), against where B's paper truly is, at the pass. */
  const aView = createRoomCombat({ send() {}, sendBinary() {} });
  let drawnErr = null;
  let seq = 0;
  let cpu = 0n;
  for (now = 1; now <= RUN_MS; now += 1) {
    place(g.bAt(now), g.bq, g.tailB, tow);
    s.step(tow[0], tow[1], tow[2]);
    if (now % 33 === 0) {
      seq += 1;
      const a = g.aAt(now);
      links.Aup.send(now, encodePose({
        flags: FLAG_AIRBORNE, seq, t: now + clock.A, px: a[0], py: a[1], pz: a[2], qx: g.aq[0], qy: g.aq[1], qz: g.aq[2], qw: g.aq[3],
        vx: g.aDir[0] * g.vA, vy: g.aDir[1] * g.vA, vz: g.aDir[2] * g.vA, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
      }));
      const b = g.bAt(now);
      links.Bup.send(now, encodePose({
        flags: FLAG_AIRBORNE, seq, t: now + clock.B, px: b[0], py: b[1], pz: b[2], qx: g.bq[0], qy: g.bq[1], qz: g.bq[2], qw: g.bq[3],
        vx: g.bDir[0] * g.vB, vy: 0, vz: g.bDir[2] * g.vB, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
      }));
    }
    if (now % 100 === 0) {
      links.Bup.send(now, encodeStreamer(now + clock.B, s.chains()));
    }
    const t0 = process.hrtime.bigint();
    for (const d of links.Aup.due(now)) {
      apply(room.message(conns.A, d, now));
    }
    for (const d of links.Bup.due(now)) {
      apply(room.message(conns.B, d, now));
    }
    if (now % 33 === 0) {
      apply(room.tick(now));
    }
    cpu += process.hrtime.bigint() - t0;
    for (const d of links.Adown.due(now)) {
      if (typeof d === 'string') {
        const m = JSON.parse(d);
        if (m.type === 'event' && m.kind === 'cut') {
          seen.A.push(d);
        }
      } else {
        aView.onBinary(d);
        const got = decodeStreamerRelay(d);
        if (got) {
          bOnA = got;
          const piece = got.chains.find((c) => c.id !== 0);
          if (piece) {
            let low = Infinity;
            for (let i = 0; i < piece.n; i += 1) {
              low = Math.min(low, piece.x[i * 3 + 1]);
            }
            pieceLow.push(low);
          }
        }
      }
    }
    if (now === g.PASS_AT_MS) {
      /* A near peer is drawn in the present: the room clock now. */
      const drawn = aView.peerChains(2, now)[0];
      if (drawn && s.attached) {
        /* How far the line A drew is from the true line, where A passes:
         * each true node near the pass against A's drawn polyline, since
         * the rule is a distance from the line, and a line drawn slid along
         * itself is the same line. */
        let worst = 0;
        const t = s.attached;
        for (let k = Math.max(0, g.arc - 3); k <= Math.min(g.arc + 3, t.n - 1); k += 1) {
          let best = Infinity;
          for (let j = 0; j < drawn.n - 1; j += 1) {
            const ax0 = drawn.x[j * 3];
            const ay0 = drawn.x[j * 3 + 1];
            const az0 = drawn.x[j * 3 + 2];
            const dx = drawn.x[j * 3 + 3] - ax0;
            const dy = drawn.x[j * 3 + 4] - ay0;
            const dz = drawn.x[j * 3 + 5] - az0;
            const px = t.x[k * 3] - ax0;
            const py = t.x[k * 3 + 1] - ay0;
            const pz = t.x[k * 3 + 2] - az0;
            const l2 = dx * dx + dy * dy + dz * dz || 1;
            const u = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / l2));
            best = Math.min(best, Math.hypot(px - dx * u, py - dy * u, pz - dz * u));
          }
          worst = Math.max(worst, best);
        }
        drawnErr = worst;
      }
    }
    for (const d of links.Bdown.due(now)) {
      if (typeof d === 'string') {
        const m = JSON.parse(d);
        if (m.type === 'event' && m.kind === 'cut') {
          seen.B.push(d);
          if (m.victim === 2) {
            s.cutTo(m.keep);
          }
        }
      }
    }
  }
  return {
    log: room.combat.log, seen, bOnA, pieceLow, cpuMs: Number(cpu) / 1e6, links: s.length(), drawnErr,
  };
}

console.log('passes across a streamer, over lag');
const LATS = [
  { name: '0/0', A: [0, 0], B: [0, 0] },
  { name: '25/80 j10', A: [25, 10], B: [80, 10] },
  { name: '100/15 j30', A: [100, 30], B: [15, 30] },
  { name: '300/40 j60', A: [300, 60], B: [40, 60] },
  { name: '50/300 j60', A: [50, 60], B: [300, 60] },
];
const GEOMETRIES = quick ? 8 : 60;
let agree = true;
let sameAsZero = true;
let falseCuts = 0;
let misses = 0;
let hits = 0;
let clears = 0;
const band = [];
const drawnErrs = new Map();
const skewBand = [];
const delays = [];
let pieceFalls = true;
let pieceSeen = 0;
let lengthsAgree = true;
const detail = [];
for (let gi = 0; gi < GEOMETRIES; gi += 1) {
  const g = makeGeometry(CUTTERS[gi % CUTTERS.length]);
  const truth = truthOf(g);
  let zero = null;
  for (const lat of LATS) {
    const r = runOnce(g, lat);
    const cut = r.log[0] || null;
    agree &&= r.seen.A.length === r.seen.B.length && r.seen.A.every((d, i) => d === r.seen.B[i]) && r.seen.A.length === r.log.length;
    const key = cut ? `${cut.keep}@${cut.tc}` : 'none';
    if (!zero) {
      zero = key;
    } else if (key !== zero) {
      sameAsZero = false;
      detail.push(`${g.cutter} miss ${g.miss.toFixed(3)} ${lat.name}: ${key} vs ${zero}`);
    }
    if (r.drawnErr != null) {
      if (!drawnErrs.has(lat.name)) {
        drawnErrs.set(lat.name, []);
      }
      drawnErrs.get(lat.name).push(r.drawnErr);
    }
    if (cut) {
      const slower = Math.max(lat.A[0] + lat.A[1], lat.B[0] + lat.B[1]);
      delays.push(cut.decided - cut.tc - slower);
      if (r.bOnA) {
        lengthsAgree &&= r.bOnA.chains[0].n - 1 === Math.min(cut.keep, r.links);
      }
      if (r.pieceLow.length) {
        pieceSeen += 1;
        pieceFalls &&= r.pieceLow[r.pieceLow.length - 1] < r.pieceLow[0];
      }
    }
    if (lat === LATS[0]) {
      /* Clocks as synced (MULTIPLAYER-PLAN section 7): each client's
       * estimate off by up to 10 ms, from a link's two directions
       * differing by up to 20. Both still get one decision. */
      const skew = runOnce(g, LATS[1], { A: Math.round(20 * rnd() - 10), B: Math.round(20 * rnd() - 10) });
      agree &&= skew.seen.A.length === skew.seen.B.length && skew.seen.A.every((d, i) => d === skew.seen.B[i]);
      skewBand.push({ d: truth.d, cut: skew.log.length > 0 });
      if (truth.d > REACH_M + 0.1 && cut) {
        falseCuts += 1;
        detail.push(`false cut: ${g.cutter} truth ${truth.d.toFixed(3)} m`);
      }
      if (truth.d < REACH_M - 0.1 && !cut) {
        misses += 1;
        detail.push(`miss: ${g.cutter} truth ${truth.d.toFixed(3)} m at link ${truth.link}`);
      }
      if (truth.d < REACH_M) {
        hits += 1;
      } else {
        clears += 1;
      }
      band.push({ d: truth.d, cut: Boolean(cut) });
    }
  }
}
check('both pilots receive the same cuts, in the same order, every run', agree);
check(`every run whose links are under COMBAT_LATE_MS (${COMBAT_LATE_MS} ms) with a frame's wait decides what the zero latency run decided`, sameAsZero, detail.slice(0, 3).join('; '));
check(`the owner's metre: a truth pass further than ${REACH_M + 0.1} m from the line is never cut`, falseCuts === 0, `${falseCuts} of ${GEOMETRIES}`);
check(`and one nearer than ${REACH_M - 0.1} m is never missed`, misses === 0, `${misses} of ${GEOMETRIES}`);
check('B\'s paper on A\'s screen is the length the room left it', lengthsAgree);
check('A sees the cut piece fall', pieceSeen > 0 && pieceFalls, `${pieceSeen} runs showed a piece`);
delays.sort((x, y) => x - y);
const p95 = delays.length ? delays[Math.floor(0.95 * (delays.length - 1))] : 0;
check('decision delay over the slower link, p95, under 250 ms', delays.length > 0 && p95 < 250, `p95 ${p95.toFixed(0)} ms over ${delays.length} cuts`);
band.sort((x, y) => x.d - y.d);
const lastCut = band.filter((b) => b.cut).map((b) => b.d).pop();
const firstClear = band.find((b) => !b.cut);
console.log(`  truth within the metre in ${hits} geometries, beyond it in ${clears}; nearest part to the line: the widest cut ${lastCut != null ? `${(lastCut * 100).toFixed(1)} cm` : 'none'}, the nearest left uncut ${firstClear ? `${(firstClear.d * 100).toFixed(1)} cm` : 'none'}`);
let drawnWorst = 0;
for (const [name, errs] of drawnErrs) {
  errs.sort((x, y) => x - y);
  drawnWorst = Math.max(drawnWorst, errs[errs.length - 1]);
  const q = (f) => errs[Math.floor(f * (errs.length - 1))];
  console.log(`  A's drawing of B's paper at the pass, its line off the true line by (links ${name}): median ${(q(0.5) * 100).toFixed(1)} cm, p95 ${(q(0.95) * 100).toFixed(1)} cm, worst ${(q(1) * 100).toFixed(1)} cm`);
}

skewBand.sort((x, y) => x.d - y.d);
const skewCut = skewBand.filter((b) => b.cut).map((b) => b.d).pop();
const skewClear = skewBand.find((b) => !b.cut);
check('what A drew of B\'s line at the pass is within 10 cm of the truth on every link set, so a pass that looked within 0.9 m counts', drawnWorst < 0.1, `worst ${(drawnWorst * 100).toFixed(1)} cm`);
const skewFalse = skewBand.filter((b) => b.cut && b.d > REACH_M + 0.1).length;
check(`with clocks off by up to 10 ms each, still no cut past ${REACH_M + 0.1} m`, skewFalse === 0, `${skewFalse}`);
console.log(`  with clocks off by up to 10 ms each: the widest truth distance cut ${skewCut != null ? `${(skewCut * 100).toFixed(1)} cm` : 'none'}, the nearest left uncut ${skewClear ? `${(skewClear.d * 100).toFixed(1)} cm` : 'none'}`);

console.log('the room with sixteen seats towing');
{
  const meta = { code: 'CMBT16', cap: 16, friendly: false, map: 'swiss2', epoch: 0 };
  const room = new RoomCore(meta);
  const seats = [];
  let now = 0;
  for (let i = 0; i < 16; i += 1) {
    const conn = { got: 0 };
    room.open(conn, now);
    room.message(conn, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [i, i, 10 + i], profile: { airframe: CUTTERS[i % 4], map: 'swiss2', figure: 0, livery: null, parts: null } }), now, `10.0.1.${i}`, newToken);
    const r = 30 + 30 * rnd();
    const w = (10 + 6 * rnd()) / r;
    const c = [100 * rnd() - 50, 50 + 10 * rnd(), 100 * rnd() - 50];
    const ph = 2 * Math.PI * rnd();
    const at = (t) => [c[0] + r * Math.cos(ph + w * t / 1000), c[1], c[2] + r * Math.sin(ph + w * t / 1000)];
    const vel = (t) => [-r * w * Math.sin(ph + w * t / 1000), 0, r * w * Math.cos(ph + w * t / 1000)];
    const s = new Streamer();
    const p0 = at(0);
    const v0 = vel(0);
    const sp = Math.hypot(...v0);
    s.lay(p0[0], p0[1], p0[2], -v0[0] / sp, 0, -v0[2] / sp, FULL_LINKS, null, v0);
    seats.push({ conn, at, vel, s });
  }
  Object.assign(room.combat.round, { n: 1, state: 'on', startsAt: 0, endsAt: 1e9, minutes: 5 });
  let cpu = 0n;
  let physics = 0n;
  const SECONDS = quick ? 3 : 10;
  for (now = 1; now <= SECONDS * 1000; now += 1) {
    const tp = process.hrtime.bigint();
    for (const st of seats) {
      const p = st.at(now);
      st.s.step(p[0], p[1], p[2]);
    }
    physics += process.hrtime.bigint() - tp;
    const t0 = process.hrtime.bigint();
    for (const [i, st] of seats.entries()) {
      if ((now + i * 2) % 33 === 0) {
        const p = st.at(now);
        const v = st.vel(now);
        const sp = Math.hypot(...v);
        const q = flyingQuat([v[0] / sp, 0, v[2] / sp], 0.4);
        room.message(st.conn, encodePose({
          flags: FLAG_AIRBORNE, seq: now, t: now, px: p[0], py: p[1], pz: p[2], qx: q[0], qy: q[1], qz: q[2], qw: q[3],
          vx: v[0], vy: v[1], vz: v[2], wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
        }), now);
      }
      if ((now + i * 7) % 100 === 0) {
        room.message(st.conn, encodeStreamer(now, st.s.chains()), now);
      }
    }
    if (now % 33 === 0) {
      room.tick(now);
    }
    cpu += process.hrtime.bigint() - t0;
  }
  const perSecond = Number(cpu) / 1e6 / SECONDS;
  const physicsPerSecond = Number(physics) / 1e6 / SECONDS / 16;
  console.log(`  the room: ${perSecond.toFixed(1)} ms of CPU a second with 16 seats flying and towing (${room.combat.log.length} cuts decided)`);
  console.log(`  one streamer's physics: ${physicsPerSecond.toFixed(2)} ms a simulated second`);
  check('the room keeps up with sixteen seats in combat, under 250 ms of CPU a second', perSecond < 250, `${perSecond.toFixed(1)} ms`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
