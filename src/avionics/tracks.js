/*
 * tracks.js: the TrackManager, detections turned into tracks with an age,
 * an estimate and a prediction (docs/AVIONICS-HUD.md section 7; the model
 * is docs/AVIONICS-PERCEPTION.md). It never reads ground truth: a
 * detection's truthKey is for checks and is not touched here. Tracks are
 * made by geometry, as a real tracker's are.
 *
 * A track is born TENTATIVE from a detection no track claims, CONFIRMED
 * after CONFIRM_HITS hits in its last CONFIRM_OF ticks (only confirmed
 * tracks reach the snapshot), and a tentative one missed DROP_TENTATIVE
 * ticks running is forgotten. Each tick every track's direction is
 * predicted on at its turn rate (an alpha beta filter in angle) corrected
 * for the aircraft's own, known, motion, and the detections are given to
 * tracks greedily, cheapest first, inside a gate that widens while a track
 * goes unseen and while the aircraft moves across it. A confirmed track
 * with no detection COASTS on that prediction (the HUD's dimmed box);
 * it is stale after STALE_S and dropped after COAST_S, into `lost` for
 * GHOST_S at its last estimate (the HUD's ghost box). A detection inside a
 * coasting track's gate re-acquires it under the same id; after the drop
 * it is a new id.
 *
 * What a track estimates, never knows:
 *   range       the detections' intervals, smoothed in log space; their
 *               geometric middle is the range estimate
 *   closure     from LOOMING: the least squares slope of log apparent size
 *               over the last LOOM_TICKS hits is closure over range
 *               whatever the object's real size (its inverse is the time
 *               to contact); times the range interval, an interval in m/s
 *   velocity    relative: minus closure along the line of sight plus the
 *               line of sight's rate times the range
 *   lead        the time to intercept at the aircraft's own speed (the
 *               smallest positive root of |r + v t| = s t) and the
 *               direction to point to meet it
 *   class       log likelihood ratios against PerceptionAI's PRIOR,
 *               accumulated with a decay, so the hypotheses sharpen as the
 *               track ages and its detections sharpen, relax when they
 *               stop, and rest at the prior with no evidence. `cls` is the
 *               top hypothesis once it reaches CLASS_P, else air-object
 *   occlusion   while it coasts, the share of the range interval the map
 *               (heightAt) hides from the aircraft
 *
 * Ticks: update() acts once per perception tick (PERCEPTION_HZ) of the
 * sim clock, so tracks do not depend on the frame rate either. Pure: no
 * DOM, no three.js, no wall clock.
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

import { CLASSES, PERCEPTION_HZ, PRIOR, cameraAxes, terrainBlocks } from './perception.js';

const NC = CLASSES.length;
const CLS_INDEX = new Map(CLASSES.map((c, i) => [c, i]));
const LOG_PRIOR = PRIOR.map((p) => Math.log(p));

const CONFIRM_HITS = 3;
const CONFIRM_OF = 5;
const DROP_TENTATIVE = 3;
export const STALE_S = 0.6;
export const COAST_S = 2.5;
export const GHOST_S = 3;
/* The association gate: at least GATE_MIN_RAD, growing GATE_GROW_RAD_S a
 * second unseen, and the size ratio at most e^GATE_SIZE. */
const GATE_MIN_RAD = 0.02;
const GATE_GROW_RAD_S = 0.06;
const GATE_SIZE = 1.2;
/* Alpha beta gains on the line of sight. */
const A_B = 0.5;
const B_B = 0.15;
/* Range smoothing in log space, a hit. */
const A_R = 0.3;
/* Looming: the regression's window, and the fewest points it needs. */
const LOOM_TICKS = 45;
const LOOM_MIN = 8;
/* Class evidence: decay a tick and weight, so steady evidence counts
 * CLASS_W / (1 - CLASS_DECAY) = 2 detections' worth. */
const CLASS_DECAY = 0.9;
const CLASS_W = 0.2;
/* The top hypothesis names the track from this probability. */
const CLASS_P = 0.6;
/* Confidence and visibility: exponential means a tick of the detection's
 * quality (0 on a miss) and of seen or not. */
const A_C = 0.12;
/* Intercepts further than this are not offered. */
const LEAD_MAX_S = 60;
/* The prediction's quality is full after this much track time. */
const QUALITY_AGE_S = 2;
/* The predicted directions, s ahead. */
const PREDICT_S = [0.5, 1, 1.5, 2];
/* Points along the range interval tested for occlusion. */
const OCC_POINTS = 5;
/* The automatic primary is the nearest to the boresight of the confirmed
 * tracks at least this confident. */
const PRIMARY_CONF = 0.3;

function norm(v) {
  const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  v[0] /= n;
  v[1] /= n;
  v[2] /= n;
  return v;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angle(a, b) {
  const c = dot(a, b);
  return Math.acos(c > 1 ? 1 : c < -1 ? -1 : c);
}

/* Smallest positive t with |r + v t| = s t, or null. */
function interceptS(r, v, s) {
  const a = dot(v, v) - s * s;
  const b = 2 * dot(r, v);
  const c = dot(r, r);
  if (Math.abs(a) < 1e-9) {
    return b < 0 ? -c / b : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  if (lo > 0) {
    return lo;
  }
  return hi > 0 ? hi : null;
}

/* The least squares slope of ys over ts and its standard error. */
function fitSlope(ts, ys) {
  const n = ts.length;
  let mt = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mt += ts[i];
    my += ys[i];
  }
  mt /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (ts[i] - mt) * (ys[i] - my);
    sxx += (ts[i] - mt) * (ts[i] - mt);
  }
  if (sxx <= 0) {
    return { k: 0, se: Infinity };
  }
  const k = sxy / sxx;
  let ssr = 0;
  for (let i = 0; i < n; i += 1) {
    const e = ys[i] - my - k * (ts[i] - mt);
    ssr += e * e;
  }
  return { k, se: Math.sqrt(ssr / Math.max(1, n - 2) / sxx) };
}

function bits(h) {
  let n = 0;
  for (let x = h; x; x >>= 1) {
    n += x & 1;
  }
  return n;
}

/*
 * A track manager. heightAt(x, z), optional: the map, for the occlusion
 * and the targets' height over the ground.
 *
 * update(tS, detections, ownship) every flight frame, with PerceptionAI's
 * detections and ownship { p: [3], v: [3], camera } (the camera's world
 * position and quaternion, the aircraft's velocity in m/s), fills
 * `snapshot` in place: { tracks (confirmed, live and stale, by id),
 * primaryId, lost (dropped in the last GHOST_S) }, each a Track of
 * docs/AVIONICS-HUD.md section 7.2. cycle(dir) moves the primary to the
 * next (1) or previous (-1) track by id; with none, the confirmed track
 * nearest the boresight becomes primary by itself.
 */
export function createTrackManager({ heightAt = null } = {}) {
  const snapshot = { tracks: [], primaryId: null, lost: [] };
  let live = [];
  /* [{ k, droppedS, at (the last estimated position) }], oldest first. */
  let ghosts = [];
  let nextId = 1;
  let lastTick = null;
  let lastT = null;
  let own = { p: [0, 0, 0], v: [0, 0, 0] };
  const fwd = [0, 0, -1];
  const right = [1, 0, 0];
  const up = [0, 1, 0];

  function birth(d, tS) {
    const L = new Float64Array(NC);
    for (const h of d.hypotheses) {
      const i = CLS_INDEX.get(h.cls);
      L[i] = CLASS_W * (Math.log(h.p) - LOG_PRIOR[i]);
    }
    return {
      id: nextId++,
      born: tS,
      lastHit: tS,
      hist: 1,
      misses: 0,
      confirmed: false,
      los: d.losW.slice(),
      logLo: Math.log(d.rangeM.lo),
      logHi: Math.log(d.rangeM.hi),
      loomT: [tS],
      loomY: [Math.log(d.sizeRad)],
      loom: { k: 0, se: Infinity },
      ve: own.v.slice(),
      losRate: [0, 0, 0],
      wOwn: ownRate(d.losW, Math.sqrt(d.rangeM.lo * d.rangeM.hi)),
      L,
      conf: A_C * d.quality,
      vis: A_C,
      sizeRad: d.sizeRad,
      sensor: d.sensor,
      hit: true,
    };
  }

  function rEstOf(k) {
    return Math.exp((k.logLo + k.logHi) / 2);
  }

  /* The line of sight's turn rate the aircraft's own motion across it
   * makes, were the target at range r. */
  function ownRate(los, r) {
    const along = dot(own.v, los);
    return [-(own.v[0] - along * los[0]) / r, -(own.v[1] - along * los[1]) / r, -(own.v[2] - along * los[2]) / r];
  }

  /* Where k will be seen this tick: on at its line of sight's rate (an
   * alpha beta filter in angle, which an error in the range does not
   * spoil), plus whatever the aircraft's own motion has changed of that
   * rate since the last tick, which it knows exactly but for the range.
   * Moves the range on by the estimated radial velocity. */
  function predict(k, dt) {
    const r0 = rEstOf(k);
    const w = ownRate(k.los, r0);
    for (let a = 0; a < 3; a += 1) {
      k.losRate[a] += w[a] - k.wOwn[a];
    }
    k.wOwn = w;
    const pred = norm([k.los[0] + k.losRate[0] * dt, k.los[1] + k.losRate[1] * dt, k.los[2] + k.losRate[2] * dt]);
    const radial = dot(k.ve, k.los) - dot(own.v, k.los);
    const r1 = Math.max(1, r0 + radial * dt);
    const shift = Math.log(r1 / r0);
    k.logLo += shift;
    k.logHi += shift;
    return pred;
  }

  /* Unseen this tick: the prediction stands. */
  function coast(k, pred) {
    k.los = pred;
    k.hit = false;
    k.misses += 1;
    k.conf *= 1 - A_C;
    k.vis *= 1 - A_C;
    for (let c = 0; c < NC; c += 1) {
      k.L[c] *= CLASS_DECAY;
    }
  }

  function hit(k, d, pred, tS, dt) {
    k.hist |= 1;
    k.hit = true;
    k.misses = 0;
    k.lastHit = tS;
    const res = [d.losW[0] - pred[0], d.losW[1] - pred[1], d.losW[2] - pred[2]];
    k.los = norm([pred[0] + A_B * res[0], pred[1] + A_B * res[1], pred[2] + A_B * res[2]]);
    for (let a = 0; a < 3; a += 1) {
      k.losRate[a] += (B_B / dt) * res[a];
    }
    /* A unit vector's rate is across it. */
    const rAlong = dot(k.losRate, k.los);
    for (let a = 0; a < 3; a += 1) {
      k.losRate[a] -= rAlong * k.los[a];
    }
    k.logLo += A_R * (Math.log(d.rangeM.lo) - k.logLo);
    k.logHi += A_R * (Math.log(d.rangeM.hi) - k.logHi);
    k.loomT.push(tS);
    k.loomY.push(Math.log(d.sizeRad));
    if (k.loomT.length > LOOM_TICKS) {
      k.loomT.shift();
      k.loomY.shift();
    }
    k.loom = k.loomT.length >= LOOM_MIN ? fitSlope(k.loomT, k.loomY) : { k: 0, se: Infinity };
    /* The relative velocity: across the line of sight its rate times
     * the range, along it minus the looming closure. */
    const rEst = rEstOf(k);
    const closure = rEst * k.loom.k;
    for (let a = 0; a < 3; a += 1) {
      k.ve[a] = own.v[a] - closure * k.los[a] + rEst * k.losRate[a];
    }
    for (const h of d.hypotheses) {
      const i = CLS_INDEX.get(h.cls);
      k.L[i] = CLASS_DECAY * k.L[i] + CLASS_W * (Math.log(h.p) - LOG_PRIOR[i]);
    }
    k.conf += A_C * (d.quality - k.conf);
    k.vis += A_C * (1 - k.vis);
    k.sizeRad += 0.4 * (d.sizeRad - k.sizeRad);
    k.sensor = d.sensor;
    if (bits(k.hist) >= CONFIRM_HITS) {
      k.confirmed = true;
    }
  }

  function step(tS, dets) {
    const dt = lastT == null ? 1 / PERCEPTION_HZ : Math.max(1e-3, tS - lastT);
    lastT = tS;
    const pred = live.map((k) => predict(k, dt));
    /* Every pair inside its gate, cheapest first, ties by id and index.
     * The gate widens while a track goes unseen, and by how far the
     * aircraft's own motion across the line of sight could have turned
     * it were the target at the near end of its range. */
    const pairs = [];
    for (let i = 0; i < live.length; i += 1) {
      const k = live[i];
      const vAlong = dot(own.v, pred[i]);
      const vAcross = Math.sqrt(Math.max(0, dot(own.v, own.v) - vAlong * vAlong));
      const gate = GATE_MIN_RAD + GATE_GROW_RAD_S * Math.max(0, tS - k.lastHit) + (vAcross * dt) / Math.exp(k.logLo);
      for (let j = 0; j < dets.length; j += 1) {
        const a = angle(pred[i], dets[j].losW);
        const sz = Math.abs(Math.log(dets[j].sizeRad / k.sizeRad));
        if (a < gate && sz < GATE_SIZE) {
          pairs.push({ i, j, cost: a / gate + 0.3 * sz });
        }
      }
    }
    pairs.sort((p, q) => p.cost - q.cost || live[p.i].id - live[q.i].id || p.j - q.j);
    const takenT = new Array(live.length).fill(-1);
    const takenD = new Array(dets.length).fill(false);
    for (const p of pairs) {
      if (takenT[p.i] < 0 && !takenD[p.j]) {
        takenT[p.i] = p.j;
        takenD[p.j] = true;
      }
    }
    const keep = [];
    for (let i = 0; i < live.length; i += 1) {
      const k = live[i];
      k.hist = (k.hist << 1) & ((1 << CONFIRM_OF) - 1);
      if (takenT[i] >= 0) {
        hit(k, dets[takenT[i]], pred[i], tS, dt);
        keep.push(k);
        continue;
      }
      coast(k, pred[i]);
      if (!k.confirmed && k.misses >= DROP_TENTATIVE) {
        continue;
      }
      if (tS - k.lastHit > COAST_S) {
        const r0 = rEstOf(k);
        ghosts.push({ k, droppedS: tS, at: [own.p[0] + k.los[0] * r0, own.p[1] + k.los[1] * r0, own.p[2] + k.los[2] * r0] });
        continue;
      }
      keep.push(k);
    }
    for (let j = 0; j < dets.length; j += 1) {
      if (!takenD[j]) {
        keep.push(birth(dets[j], tS));
      }
    }
    live = keep.sort((a, b) => a.id - b.id);
    ghosts = ghosts.filter((g) => tS - g.droppedS <= GHOST_S);
    publish(tS);
  }

  function publish(tS) {
    snapshot.tracks.length = 0;
    for (const k of live) {
      if (k.confirmed) {
        snapshot.tracks.push(view(k, tS));
      }
    }
    /* A ghost stays where it was last estimated, seen from where the
     * aircraft is now. */
    snapshot.lost.length = 0;
    for (const g of ghosts) {
      const k = g.k;
      const d = [g.at[0] - own.p[0], g.at[1] - own.p[1], g.at[2] - own.p[2]];
      const r1 = Math.sqrt(dot(d, d));
      const shift = Math.log(r1 / rEstOf(k));
      k.los = [d[0] / r1, d[1] / r1, d[2] / r1];
      k.logLo += shift;
      k.logHi += shift;
      const v = view(k, tS);
      v.stale = true;
      v.visibility = 0;
      v.predicted = [];
      v.lead = null;
      snapshot.lost.push(v);
    }
    const ids = snapshot.tracks.map((v) => v.id);
    if (snapshot.primaryId != null && !ids.includes(snapshot.primaryId)) {
      snapshot.primaryId = null;
    }
    if (snapshot.primaryId == null) {
      let best = -2;
      for (const v of snapshot.tracks) {
        const c = dot(v.losW, fwd);
        if (v.confidence >= PRIMARY_CONF && !v.stale && c > best) {
          best = c;
          snapshot.primaryId = v.id;
        }
      }
    }
  }

  /* A Track (docs/AVIONICS-HUD.md section 7.2) of internal track k. */
  function view(k, tS) {
    const lp = new Array(NC);
    let m = -Infinity;
    for (let c = 0; c < NC; c += 1) {
      lp[c] = LOG_PRIOR[c] + k.L[c];
      m = Math.max(m, lp[c]);
    }
    let s = 0;
    for (let c = 0; c < NC; c += 1) {
      lp[c] = Math.exp(lp[c] - m);
      s += lp[c];
    }
    const hypotheses = CLASSES.map((cls, c) => ({ cls, p: lp[c] / s })).sort((a, b) => b.p - a.p || CLS_INDEX.get(a.cls) - CLS_INDEX.get(b.cls));
    const rLo = Math.exp(k.logLo);
    const rHi = Math.exp(k.logHi);
    const rEst = Math.sqrt(rLo * rHi);
    const pos = [own.p[0] + k.los[0] * rEst, own.p[1] + k.los[1] * rEst, own.p[2] + k.los[2] * rEst];
    const relV = [k.ve[0] - own.v[0], k.ve[1] - own.v[1], k.ve[2] - own.v[2]];
    /* Closure: the looming slope, one standard error each way, over the
     * range interval. */
    let closureMs = null;
    let sigma = Infinity;
    if (Number.isFinite(k.loom.se)) {
      const ks = [k.loom.k - k.loom.se, k.loom.k + k.loom.se];
      const c = [rLo * ks[0], rLo * ks[1], rHi * ks[0], rHi * ks[1]];
      closureMs = { lo: Math.min(...c), hi: Math.max(...c) };
      const rAlong = dot(relV, k.los);
      const across = Math.sqrt(Math.max(0, dot(relV, relV) - rAlong * rAlong));
      sigma = (closureMs.hi - closureMs.lo) / 2 + ((rHi - rLo) / 2) * (across / rEst);
    }
    const speed = Math.sqrt(dot(k.ve, k.ve));
    const speedMs = closureMs ? { lo: Math.max(0, speed - sigma), hi: speed + sigma } : null;
    let altM = null;
    if (heightAt) {
      const a = [];
      for (const r of [rLo, rEst, rHi]) {
        const x = own.p[0] + k.los[0] * r;
        const z = own.p[2] + k.los[2] * r;
        a.push(own.p[1] + k.los[1] * r - heightAt(x, z));
      }
      altM = { lo: Math.min(...a), hi: Math.max(...a) };
    }
    const ownS = Math.sqrt(dot(own.v, own.v));
    const r = [pos[0] - own.p[0], pos[1] - own.p[1], pos[2] - own.p[2]];
    const tl = closureMs ? interceptS(r, k.ve, ownS) : null;
    const lead = tl != null && tl <= LEAD_MAX_S
      ? { tS: tl, losW: norm([r[0] + k.ve[0] * tl, r[1] + k.ve[1] * tl, r[2] + k.ve[2] * tl]) }
      : null;
    const predicted = [];
    if (closureMs) {
      for (const ahead of PREDICT_S) {
        predicted.push({ dtS: ahead, losW: norm([r[0] + relV[0] * ahead, r[1] + relV[1] * ahead, r[2] + relV[2] * ahead]) });
      }
    }
    let occlusion = 0;
    if (!k.hit && heightAt) {
      let hidden = 0;
      for (let i = 0; i < OCC_POINTS; i += 1) {
        const rr = rLo * Math.exp((i / (OCC_POINTS - 1)) * Math.log(rHi / rLo));
        if (terrainBlocks(heightAt, own.p, [own.p[0] + k.los[0] * rr, own.p[1] + k.los[1] * rr, own.p[2] + k.los[2] * rr])) {
          hidden += 1;
        }
      }
      occlusion = hidden / OCC_POINTS;
    }
    const ageS = tS - k.born;
    const loomFill = Math.min(1, k.loomT.length / LOOM_TICKS);
    const relWidth = (rHi - rLo) / rEst;
    const predictionQuality = Math.min(1, ageS / QUALITY_AGE_S) * (bits(k.hist) / CONFIRM_OF) * loomFill / (1 + relWidth);
    const top = hypotheses[0];
    return {
      id: k.id,
      label: `T${String(k.id % 100).padStart(2, '0')}`,
      cls: top.p >= CLASS_P && top.cls !== 'unknown' ? top.cls : 'air_object',
      hypotheses,
      confidence: k.conf,
      sourceSensor: k.sensor,
      ageS,
      losW: k.los.slice(),
      bearing: { azRad: Math.atan2(k.los[0], -k.los[2]), elRad: Math.asin(Math.max(-1, Math.min(1, k.los[1]))) },
      sizeRad: k.sizeRad,
      rangeM: { lo: rLo, hi: rHi },
      relVel: { v: relV, sigma },
      closureMs,
      speedMs,
      altM,
      visibility: k.vis,
      occlusion,
      predictionQuality,
      stale: tS - k.lastHit > STALE_S,
      lastSeenS: k.lastHit,
      predicted,
      lead,
    };
  }

  return {
    snapshot,
    update(tS, detections, ownship) {
      const tick = Math.floor(tS * PERCEPTION_HZ);
      if (tick === lastTick) {
        return snapshot;
      }
      lastTick = tick;
      own = { p: ownship.p.slice(), v: ownship.v.slice() };
      if (ownship.camera) {
        cameraAxes(ownship.camera, fwd, right, up);
      }
      step(tS, detections);
      return snapshot;
    },
    cycle(dir = 1) {
      const ids = snapshot.tracks.map((v) => v.id);
      if (!ids.length) {
        snapshot.primaryId = null;
        return null;
      }
      const i = ids.indexOf(snapshot.primaryId);
      snapshot.primaryId = i < 0 ? ids[dir > 0 ? 0 : ids.length - 1] : ids[(i + dir + ids.length) % ids.length];
      return snapshot.primaryId;
    },
    reset() {
      live = [];
      ghosts = [];
      lastTick = null;
      lastT = null;
      snapshot.tracks.length = 0;
      snapshot.lost.length = 0;
      snapshot.primaryId = null;
    },
  };
}
