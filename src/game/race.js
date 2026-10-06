/*
 * race.js: the race referee. Given the gates of a course and the craft's
 * position each frame, it decides which gate was flown through, times laps
 * and splits, keeps the best lap record and, for planes, scores each pass by
 * how near the centre it went.
 *
 * It only reads the world after physics and never writes back, so the same
 * code judges a live flight in the browser and a posted ghost on the
 * leaderboard (verify.js checkLap). A lap time there is compared to the bit,
 * which is why the arithmetic below keeps a fixed operation order.
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

import { fastestLap, fastestThreeConsecutive } from './track.js';
import { plural, str } from '../strings/index.js';

export const PLANE_REACH = 40;
export const PASS_POINTS = 100;
export const NEAR_POINTS = 20;

const DEFAULT_RECORD_KEY = 'webfpv.bestLapMs';

/* Scoring box per track class: depth either side of the gate plane and how
 * far inside the visible opening the craft's centre must stay. A plain
 * object, so an unknown class falls back to full, and a class named after an
 * inherited property gives undefined sizes, as it always has. */
const CLASS_BOX = {
  full: { depth: 0.5, margin: 0.02 },
  wing: { depth: 2.0, margin: 0.02 },
};

/* Inside the opening, the call is the first band whose limit holds. */
const BANDS = [
  { code: 'centre', limit: 0.25 },
  { code: 'good', limit: 0.6 },
  { code: 'through', limit: 1 },
];

/* The axis helpers are the one place this module uses Math.sin and cos.
 * They run only for gates that bring heading and pitch instead of axes,
 * and the leaderboard's laps go through them, so the expressions are fixed. */
export function gateAcross(heading) {
  return { x: -Math.cos(heading), y: 0, z: Math.sin(heading) };
}

export function gateUp(heading, pitch) {
  const sp = Math.sin(pitch);
  return { x: sp * Math.sin(heading), y: Math.cos(pitch), z: sp * Math.cos(heading) };
}

/* The sign stays on cp so that travelAxis(0, 0).x is -0, as before. */
export function travelAxis(heading, pitch) {
  const cp = Math.cos(pitch);
  return { x: (-cp) * Math.sin(heading), y: Math.sin(pitch), z: (-cp) * Math.cos(heading) };
}

function coneGap(c, x, y) {
  const yc = Math.min(c.y0 + c.h, Math.max(c.y0, y));
  const r = c.r0 + ((c.r1 - c.r0) * (yc - c.y0)) / c.h;
  const dx = Math.max(0, Math.abs(x - c.x) - r);
  const dy = y - yc;
  return Math.sqrt(dx * dx + dy * dy);
}

export function structureGap(ap, x, y) {
  const f = ap.frame ?? { kind: 'box', hw: ap.clearW / 2, hh: ap.clearH / 2 };
  switch (f.kind) {
    case 'ring':
      return Math.max(0, Math.sqrt(x * x + y * y) - f.r);
    case 'cones':
      return Math.min(...f.cones.map((c) => coneGap(c, x, y)));
    case 'cone':
      /* A turned pylon is rounded on one side only. */
      return (x - f.cone.x) * f.side < 0 ? Infinity : coneGap(f.cone, x, y);
    default: {
      const dx = Math.max(0, Math.abs(x) - f.hw);
      const dy = Math.max(0, Math.abs(y) - f.hh);
      return Math.sqrt(dx * dx + dy * dy);
    }
  }
}

export function passScore(hit) {
  if (!hit.inside) return { code: 'close', points: NEAR_POINTS };
  const s = hit.s;
  return { code: BANDS.find((b) => s <= b.limit).code, points: Math.round(PASS_POINTS * (1 - 0.5 * s * s)) };
}

/* The opening's centre sits centreY above the gate base along world y,
 * not along the gate's up axis, whatever its tilt. */
function toLocal(g, ap, p) {
  const dx = p.x - g.x;
  const dy = p.y - (g.y + ap.centreY);
  const dz = p.z - g.z;
  return {
    x: dx * g.ax.x + dy * g.ax.y + dz * g.ax.z,
    y: dx * g.ay.x + dy * g.ay.y + dz * g.ay.z,
    z: dx * g.az.x + dy * g.az.y + dz * g.az.z,
  };
}

/* Segment a to b against the thick box; the crossing parameter is the
 * midplane crossing when it lies inside the box, else first contact. */
function boxCrossing(a, b, halfW, halfH, depth) {
  if (!(halfW > 0) || !(halfH > 0)) return -1;
  const dZ = b.z - a.z;
  if (dZ <= 1e-9) return -1;
  let enter = 0;
  let leave = 1;
  for (const [p, d, half] of [[a.x, b.x - a.x, halfW], [a.y, b.y - a.y, halfH], [a.z, dZ, depth]]) {
    if (Math.abs(d) < 1e-12) {
      if (!(p >= -half && p <= half)) return -1;
      continue;
    }
    let u0 = (-half - p) / d;
    let u1 = (half - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    if (u0 > enter) enter = u0;
    if (u1 < leave) leave = u1;
    if (!(enter <= leave)) return -1;
  }
  const tz = -a.z / dZ;
  return tz >= enter && tz <= leave ? tz : enter;
}

/* A round opening has no depth: the centre must cross the disc itself. */
function discCrossing(a, b, r) {
  const dZ = b.z - a.z;
  if (!(r > 0) || dZ <= 1e-9 || a.z > 0 || b.z < 0) return -1;
  const t = -a.z / dZ;
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  return x * x + y * y <= r * r ? t : -1;
}

/* A plane's pass: the plane of the opening crossed forward anywhere within
 * reach of the structure. No margin and no depth here. */
function reachCrossing(a, b, ap, reach) {
  const dZ = b.z - a.z;
  if (dZ <= 1e-9 || a.z > 0 || b.z < 0) return null;
  const t = -a.z / dZ;
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const hw = ap.clearW * 0.5;
  const s = ap.round ? Math.sqrt(x * x + y * y) / hw : Math.max(Math.abs(x) / hw, Math.abs(y) / (ap.clearH * 0.5));
  if (s <= 1) return { t, s, inside: true, gap: 0 };
  const gap = structureGap(ap, x, y);
  return gap <= reach ? { t, s, inside: false, gap } : null;
}

function clockText(ms) {
  if (ms == null || !Number.isFinite(ms)) return '--:--.--';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}

/* Storage is optional (Node, private windows): a missing or broken store
 * means no record, never an error in the middle of a race. */
function loadRecord(key) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch (e) {
    return null;
  }
}

function stationOf(g, idx) {
  const axes = g.axes || {
    across: gateAcross(g.heading),
    up: gateUp(g.heading, g.pitch ?? 0),
    travel: travelAxis(g.heading, g.pitch ?? 0),
  };
  return {
    idx,
    x: g.position.x,
    y: g.position.y,
    z: g.position.z,
    ax: axes.across,
    ay: axes.up,
    az: axes.travel,
    apertures: g.apertures ?? [g.aperture],
    kindName: g.kindName ?? 'standardGate',
    elementId: g.elementId ?? null,
    apertureIndex: g.apertureIndex ?? null,
    virtual: Boolean(g.virtual),
  };
}

export class Race {
  constructor(gates, trackClass = 'full', opts = {}) {
    const box = CLASS_BOX[trackClass] ?? CLASS_BOX.full;
    this.passDepth = box.depth;
    this.margin = box.margin;
    this.suffix = opts.recordSuffix ?? '';
    this.reach = opts.reach ?? 0;
    this.freestyle = gates.length === 0;
    if (this.freestyle) {
      this.gates = [];
      this.key = DEFAULT_RECORD_KEY;
      this.bestMs = null;
      this.reset();
      return;
    }
    /* The native stable sort on exactly these entries: a missing flyOrder
     * makes the comparator NaN, and only the same sort orders that the same. */
    this.gates = gates
      .map((g, idx) => ({ idx, flyOrder: g.flyOrder }))
      .sort((a, b) => a.flyOrder - b.flyOrder)
      .map(({ idx }) => stationOf(gates[idx], idx));
    const timing = this.gates.findIndex((g) => !g.virtual);
    this.timingIdx = timing < 0 ? 0 : timing;
    this.key = DEFAULT_RECORD_KEY;
    this.bestMs = loadRecord(this.key);
    this.reset();
  }

  reset() {
    this.next = 0;
    this.lap = 0;
    this.lapStartMs = null;
    this.lastLapMs = null;
    this.prevSimMs = null;
    this.banner = null;
    this.splits = [];
    this.lastSplits = [];
    this.log = [];
    this.laps = [];
    this.lapPoints = 0;
    this.lastLapScore = null;
    this.runScore = 0;
    this.call = null;
    this.leaving = -1;
    this.recordAtStart = this.bestMs;
  }

  setRecordKey(key) {
    if (this.freestyle) return;
    this.key = key + this.suffix;
    this.bestMs = loadRecord(this.key);
  }

  update(prev, curr, simMs, wallMs, allow = true) {
    if (this.freestyle) return { passed: null, hitFrame: false };
    if (!allow) {
      this.prevSimMs = simMs;
      return { passed: null, hitFrame: false };
    }
    const fromMs = this.prevSimMs ?? simMs;
    this.prevSimMs = simMs;
    return { passed: this.judge(prev, curr, fromMs, simMs, wallMs), hitFrame: false };
  }

  judge(prev, curr, fromMs, simMs, wallMs) {
    /* On a one gate course the target is the gate just passed: it may not
     * count again until the craft has been seen outside it. */
    if (this.leaving === this.next) {
      if (this.clearOf(this.gates[this.leaving], curr)) this.leaving = -1;
      return null;
    }
    const g = this.gates[this.next];
    const hit = this.crossing(g, prev, curr);
    if (!hit) return null;
    return this.pass(g, curr, fromMs + (simMs - fromMs) * hit.t, hit.award, wallMs);
  }

  /* The first aperture of the target the segment flies through, with its
   * crossing parameter and, in a scored race, the points it earns. */
  crossing(g, prev, curr) {
    for (const ap of g.apertures) {
      const a = toLocal(g, ap, prev);
      const b = toLocal(g, ap, curr);
      if (this.reach > 0) {
        const hit = reachCrossing(a, b, ap, this.reach);
        if (hit) return { t: hit.t, award: passScore(hit) };
        continue;
      }
      const halfW = ap.clearW * 0.5 - this.margin;
      const t = ap.round
        ? discCrossing(a, b, halfW)
        : boxCrossing(a, b, halfW, ap.clearH * 0.5 - this.margin, this.passDepth);
      if (t < 0) continue;
      return { t, award: null };
    }
    return null;
  }

  /* Always the class box, even in a scored race: reach does not widen it. */
  clearOf(g, p) {
    return g.apertures.every((ap) => {
      const l = toLocal(g, ap, p);
      const r = ap.clearW * 0.5 - this.margin;
      if (ap.round) return l.x * l.x + l.y * l.y > r * r || Math.abs(l.z) > this.passDepth;
      return Math.abs(l.x) > r || Math.abs(l.y) > ap.clearH * 0.5 - this.margin || Math.abs(l.z) > this.passDepth;
    });
  }

  pass(g, curr, crossMs, award, wallMs) {
    const passed = this.next;
    if (award) {
      this.call = { code: award.code, points: award.points, gate: passed };
      this.runScore += award.points;
      this.banner = { text: str(`race.call_${award.code}`, { points: award.points }), untilMs: wallMs + 1400 };
    }
    this.next = (passed + 1) % this.gates.length;
    this.leaving = this.clearOf(g, curr) ? -1 : passed;
    if (this.lapStartMs != null) this.splits.push(crossMs - this.lapStartMs);
    if (passed === this.timingIdx) {
      if (this.lapStartMs != null) this.closeLap(crossMs - this.lapStartMs, award != null, wallMs);
      this.lapStartMs = crossMs;
      this.splits = [];
      /* The finishing crossing's points open the next lap's score. */
      this.lapPoints = 0;
    }
    if (award) this.lapPoints += award.points;
    return passed;
  }

  closeLap(ms, scored, wallMs) {
    this.lastLapMs = ms;
    /* The finished lap keeps its own list; pass() hands splits a new one. */
    this.lastSplits = this.splits;
    this.lap += 1;
    this.laps.push(ms);
    const score = scored ? this.lapPoints : null;
    this.lastLapScore = score;
    const n = this.log.length + 1;
    this.log.push(scored ? { n, ms, score } : { n, ms });
    const time = clockText(ms);
    let text = scored
      ? str('race.lap_flash_score', { n: this.log.length, time, score: plural('count.points', score) })
      : str('race.lap_flash', { n: this.log.length, time });
    if (this.bestMs == null || ms < this.bestMs) {
      this.bestMs = ms;
      text += `\n${str('ui.new_track_record')}`;
      this.saveRecord(String(Math.round(ms)));
    }
    this.banner = { text, untilMs: wallMs + 2600 };
  }

  /* Deferred so a lap's close never waits on storage. The key is read when
   * the write runs, so a key swap in between moves the write with it. */
  saveRecord(record) {
    const write = () => {
      try {
        localStorage.setItem(this.key, record);
      } catch (e) {
        /* No storage is the same as a refused write: the record lives on
         * in bestMs for this session. */
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(write, { timeout: 2000 });
    } else {
      setTimeout(write, 0);
    }
  }

  recover(reason, wallMs) {
    this.banner = { text: reason, untilMs: wallMs + 1800 };
  }

  voidLap(reason, wallMs) {
    if (!this.freestyle) {
      if (this.lapStartMs != null) this.log.push({ n: this.log.length + 1, ms: null, reason });
      this.lapStartMs = null;
      this.splits = [];
      this.next = 0;
      this.leaving = -1;
    }
    this.banner = { text: reason, untilMs: wallMs + 1800 };
  }

  nextSceneIndex() {
    return this.freestyle ? -1 : this.gates[this.next].idx;
  }

  followSceneIndex() {
    if (this.freestyle || this.gates.length < 2) return -1;
    return this.gates[(this.next + 1) % this.gates.length].idx;
  }

  bestLapMs() {
    return fastestLap(this.laps);
  }

  bestThreeMs() {
    return fastestThreeConsecutive(this.log);
  }

  currentLapMs(simMs) {
    if (this.freestyle || this.lapStartMs == null) return null;
    return simMs - this.lapStartMs;
  }

  flashText(wallMs) {
    return this.banner && wallMs < this.banner.untilMs ? this.banner.text : null;
  }
}
