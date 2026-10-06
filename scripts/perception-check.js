/*
 * perception-check.js: PerceptionAI and the TrackManager over the war's
 * own attacker paths (src/avionics/perception.js, src/avionics/tracks.js;
 * docs/AVIONICS-PERCEPTION.md). Each attacker is planned and flown by
 * src/share/war/routes.js as the room flies it, on mission 1's routes, the
 * terrain is the hunters' floor (src/share/war/itaipu-height.bin, ground,
 * water and the dam), and a camera is held on it the way a pilot keeps a
 * target in the picture. Nothing here touches a browser.
 *
 *   approach    a Striker on reservoir-mid toward a camera over the dam,
 *               EO, day, 2x: not detected far out, detected and confirmed
 *               as it closes, its confidence and its top class sharpening,
 *               a fixed wing UAV by the end; the range interval holding
 *               the true range on most ticks and narrowing as it grows;
 *               the camera turned away, no detections at all
 *   dam         the same Striker seen from the gorge below the dam: the
 *               camera drops behind the dam's crest, the track goes stale
 *               and coasts with the terrain named as its occlusion, is
 *               dropped into the ghosts, the ghost expires, and the
 *               camera back up re-acquires it as a new track
 *   night       the approach's first confirmed range in EO by day, EO at
 *               night, low light at night and thermal at night: thermal
 *               at night sees farther than EO at night, EO by day farther
 *               than EO at night
 *   multirotor  an FPV on the gorge route past the camera: named a
 *               multirotor once close, and never another class
 *   lead        the camera flying at the Striker: a lead offered, its
 *               time to intercept within a factor of two of the truth and
 *               its direction within a few degrees of the true intercept
 *   repeat      the approach twice on one seed gives identical snapshots,
 *               and another seed different ones
 *   cost        mission 1's last round at eight pilots (every wave of it
 *               in the air at once), a camera over the dam: perception
 *               and tracking timed per frame and per tick
 *
 * Exit 1 on any failure.
 *
 *   node scripts/perception-check.js [--seed=N]
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

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { loadHeight } from '../edge/rooms/warhunt.js';
import { noseTo, planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS, waveSize, waveTarget } from '../src/share/war/missions/index.js';
import { createPerception, terrainBlocks } from '../src/avionics/perception.js';
import { COAST_S, GHOST_S, STALE_S, createTrackManager } from '../src/avionics/tracks.js';

const floor = loadHeight(readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url)));
const heightAt = floor.floorAt;
/* The drill: mission 1 as this check was written against, before First
 * Light made it a story (src/share/war/missions/itaipu-drill.js). */
const MISSION = MISSIONS['itaipu-drill'];
/* The FPV camera's default field of view (src/render/lens.js
 * CAMERA_FOV_DEFAULT, 85 degrees vertical) and the picture's shape. */
const BASE_FOV = (85 * Math.PI) / 180;
const ASPECT = 16 / 9;
const FRAME_S = 1 / 60;
const NIGHT = 0.05;
/* The noise's seed for every scenario but repeat's; --seed=N tries another. */
const SEED = Number((process.argv.find((a) => a.startsWith('--seed=')) || '--seed=11').slice(7));

/* The thresholds. */
const FAR_M = 3000;
const CONFIRMED_NEAR_M = 700;
const CONFIRMED_SHARE = 0.9;
const CONTAIN_SHARE = 0.8;
const CLASS_NEAR_M = 400;
/* A 0.25 m quad is a dozen pixels at 4x only inside this. */
const MULTI_NEAR_M = 70;
/* Perception runs 15 ticks a second; a frame at 60 Hz has 16.7 ms. A
 * tick's mean under half a millisecond is under 1 % of the frame time
 * averaged over frames, and its p99 under 2 ms is never a dropped frame
 * by itself. COST_S is the timed span. */
const COST_TICK_MEAN_MS = 0.5;
const COST_TICK_P99_MS = 2;
const COST_S = 120;

const failures = [];
function check(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    failures.push(what);
  }
}

function sensorOf(mode, zoom) {
  return { mode, zoom, fovRad: BASE_FOV / zoom, noise: 0, healthy: true };
}

/* A camera at p looking along unit d, as a three.js camera reads. */
function cameraAt(d) {
  const q = noseTo(d);
  return { quaternion: { x: q[0], y: q[1], z: q[2], w: q[3] }, aspect: ASPECT };
}

function unitTo(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const r = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return { d: [d[0] / r, d[1] / r, d[2] / r], r };
}

function planOf(kind, route, target, id = 1) {
  return planAgent(MISSION, { id, kind, route, t0: 0, k: 0, n: 1, err: 0, target });
}

/*
 * Fly one attacker past a camera. camAt(tS) is the camera's position
 * (its velocity is taken from it), look(tS, dir) may turn the camera away from the target. Returns a row a
 * perception tick: { tS, r (true range), occluded (truth), dets, snap }
 * (snapshot copied).
 */
function fly({ plan, id = 1, kind, camAt, mode = 'eo', zoom = 2, light = 1, seed = SEED, untilS, look = (t, d) => d, stopM = 120 }) {
  const per = createPerception({ seed, heightAt });
  const trk = createTrackManager({ heightAt });
  const sensor = sensorOf(mode, zoom);
  const env = { light, sun: null, haze: 1 };
  const rows = [];
  let lastTick = null;
  for (let tS = 0; tS <= untilS; tS += FRAME_S) {
    if (tS * 1000 > plan.tEnd) {
      break;
    }
    const o = poseAt(plan, tS * 1000);
    if (!o) {
      continue;
    }
    const p = camAt(tS);
    const { d, r } = unitTo(p, o.p);
    if (r < stopM) {
      break;
    }
    /* The camera's own velocity, which the aircraft knows. */
    const p1 = camAt(tS + 0.01);
    const v = [(p1[0] - p[0]) * 100, (p1[1] - p[1]) * 100, (p1[2] - p[2]) * 100];
    const own = { p, v, camera: cameraAt(look(tS, d)) };
    const dets = per.update(tS, sensor, [{ id, kind, p: o.p.slice() }], own, env);
    const snap = trk.update(tS, dets, own);
    const tick = Math.floor(tS * 15);
    if (tick !== lastTick) {
      lastTick = tick;
      rows.push({
        tS, r, occluded: terrainBlocks(heightAt, p, o.p), dets: dets.map((x) => ({ ...x })), snap: JSON.parse(JSON.stringify(snap)),
        truth: { p: o.p.slice(), v: o.v.slice() }, own: { p, v },
      });
    }
  }
  return rows;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const km = (m) => (m / 1000).toFixed(2);

/* The camera over the dam's crest, the Striker's last leg ending 200 m
 * west of it. */
const DAM_CAM = [0, 260, -1600];
const strikePlan = planOf('strike', 'reservoir-mid', 'intake-4');

function firstConfirmedR(rows) {
  const row = rows.find((x) => x.snap.tracks.length > 0);
  return row ? row.r : 0;
}

/* ---- approach ---- */
console.log('approach: a Striker on reservoir-mid toward a camera over the dam, EO, day, 4x');
{
  const rows = fly({ plan: strikePlan, kind: 'strike', camAt: () => DAM_CAM, zoom: 4, untilS: 400 });
  const far = rows.filter((x) => x.r > FAR_M);
  check(far.length > 0 && far.every((x) => x.dets.length === 0), `no detection past ${km(FAR_M)} km (${far.length} ticks, from ${km(rows[0].r)} km)`);
  const firstDet = rows.find((x) => x.dets.length > 0);
  const firstConf = firstConfirmedR(rows);
  console.log(`    first detection at ${km(firstDet ? firstDet.r : 0)} km, first confirmed track at ${km(firstConf)} km`);
  const near = rows.filter((x) => x.r < CONFIRMED_NEAR_M);
  const conf = near.filter((x) => x.snap.tracks.length === 1);
  check(conf.length >= CONFIRMED_SHARE * near.length, `one confirmed track on ${conf.length} of ${near.length} ticks inside ${CONFIRMED_NEAR_M} m (at least ${CONFIRMED_SHARE * 100} %)`);
  const ids = new Set(rows.flatMap((x) => x.snap.tracks.map((k) => k.id)));
  console.log(`    track ids over the approach: ${[...ids].join(', ')}`);
  /* Thirds of the tracked span, by range. */
  const tracked = rows.filter((x) => x.snap.tracks.length === 1);
  const third = Math.floor(tracked.length / 3);
  const bins = [tracked.slice(0, third), tracked.slice(third, 2 * third), tracked.slice(2 * third)];
  const stat = bins.map((b) => ({
    r: mean(b.map((x) => x.r)),
    conf: mean(b.map((x) => x.snap.tracks[0].confidence)),
    pTrue: mean(b.map((x) => x.snap.tracks[0].hypotheses.find((h) => h.cls === 'fixed_wing_uav').p)),
    ratio: median(b.map((x) => x.snap.tracks[0].rangeM.hi / x.snap.tracks[0].rangeM.lo)),
    contain: mean(b.map((x) => (x.snap.tracks[0].rangeM.lo <= x.r && x.r <= x.snap.tracks[0].rangeM.hi ? 1 : 0))),
  }));
  console.log('    third   mean range   confidence   p(fixed wing)   range hi/lo (median)   holds truth');
  stat.forEach((s, i) => console.log(`    ${i + 1}       ${km(s.r).padStart(6)} km   ${s.conf.toFixed(2).padStart(10)}   ${s.pTrue.toFixed(2).padStart(13)}   ${s.ratio.toFixed(2).padStart(20)}   ${(s.contain * 100).toFixed(0).padStart(9)} %`));
  check(stat[2].conf > stat[0].conf, `confidence sharpens: ${stat[0].conf.toFixed(2)} far, ${stat[2].conf.toFixed(2)} near`);
  check(stat[2].pTrue > stat[0].pTrue + 0.2, `p(fixed wing UAV) sharpens by more than 0.2: ${stat[0].pTrue.toFixed(2)} far, ${stat[2].pTrue.toFixed(2)} near`);
  check(stat[2].ratio < stat[0].ratio / 2, `the range interval narrows to under half its far ratio: hi/lo ${stat[0].ratio.toFixed(1)} far, ${stat[2].ratio.toFixed(1)} near`);
  const holds = tracked.filter((x) => x.snap.tracks[0].rangeM.lo <= x.r && x.r <= x.snap.tracks[0].rangeM.hi).length;
  check(holds >= CONTAIN_SHARE * tracked.length, `the range interval holds the true range on ${holds} of ${tracked.length} tracked ticks (at least ${CONTAIN_SHARE * 100} %)`);
  const dets = rows.flatMap((x) => x.dets.map((d) => ({ d, r: x.r })));
  const detHolds = dets.filter(({ d, r }) => d.rangeM.lo <= r && r <= d.rangeM.hi).length;
  check(detHolds >= CONTAIN_SHARE * dets.length, `each detection's own interval holds it on ${detHolds} of ${dets.length} (at least ${CONTAIN_SHARE * 100} %)`);
  const close = tracked.filter((x) => x.r < CLASS_NEAR_M);
  const named = close.filter((x) => x.snap.tracks[0].cls === 'fixed_wing_uav').length;
  check(close.length > 0 && named >= 0.8 * close.length, `named fixed_wing_uav on ${named} of ${close.length} ticks inside ${CLASS_NEAR_M} m`);
  const last = tracked[tracked.length - 1].snap.tracks[0];
  const c = last.closureMs;
  console.log(`    last tick: ${km(tracked[tracked.length - 1].r)} km true, RNG ${km(last.rangeM.lo)} to ${km(last.rangeM.hi)} km, closure ${c ? `${c.lo.toFixed(0)} to ${c.hi.toFixed(0)}` : 'none'} m/s (true about 26.6), ${last.cls} ${(last.hypotheses[0].p * 100).toFixed(0)} %, lead ${last.lead ? `${last.lead.tS.toFixed(1)} s` : 'none'}`);
  check(rows.some((x) => x.snap.primaryId != null), 'a primary track is chosen without a cycle');

  /* Turned 90 degrees away while it is close: nothing detected. */
  const away = fly({
    plan: strikePlan, kind: 'strike', camAt: () => DAM_CAM, untilS: 400, look: (t, d) => (t > 0 ? [-d[2], 0, d[0]].map((x, i, a) => x / Math.hypot(a[0], a[2])) : d),
  });
  const inRange = away.filter((x) => x.r < CONFIRMED_NEAR_M);
  check(inRange.length > 0 && inRange.every((x) => x.dets.length === 0), `turned away: no detection on ${inRange.length} ticks inside ${CONFIRMED_NEAR_M} m`);
}

/* ---- dam ---- */
console.log('dam: the Striker from the gorge below the dam, the camera dropping behind the crest and back, EO, day, 4x');
{
  const camXZ = [0, -1350];
  const HIGH = 330;
  const LOW = 150;
  const MOVE_S = 2;
  /* When the camera held high first has a confirmed track. */
  const high = fly({
    plan: strikePlan, kind: 'strike', camAt: () => [camXZ[0], HIGH, camXZ[1]], zoom: 4, untilS: 400,
  });
  const t1 = high.find((x) => x.snap.tracks.length > 0).tS;
  const downAt = t1 + 1.5;
  const upAt = downAt + MOVE_S + COAST_S + 1.2;
  const yAt = (t) => {
    if (t < downAt) {
      return HIGH;
    }
    if (t < downAt + MOVE_S) {
      return HIGH + ((LOW - HIGH) * (t - downAt)) / MOVE_S;
    }
    if (t < upAt) {
      return LOW;
    }
    return Math.min(HIGH, LOW + ((HIGH - LOW) * (t - upAt)) / MOVE_S);
  };
  console.log(`    confirmed from high at ${km(high.find((x) => x.tS === t1).r)} km; down over ${MOVE_S} s at ${downAt.toFixed(1)} s, back up at ${upAt.toFixed(1)} s`);
  const rows = fly({
    plan: strikePlan, kind: 'strike', camAt: (t) => [camXZ[0], yAt(t), camXZ[1]], zoom: 4, untilS: 400,
  });
  const lostRow = rows.find((x) => x.tS >= downAt && x.occluded);
  const before = rows.filter((x) => x.tS > t1 && x.tS < lostRow.tS);
  const ids = new Set(before.flatMap((x) => x.snap.tracks.map((k) => k.id)));
  const idBefore = ids.size === 1 ? [...ids][0] : null;
  check(idBefore != null && before.every((x) => x.snap.tracks.length === 1), `one track (${[...ids].join(', ')}) from confirmation until the dam hides it, through the dive`);
  const lostAt = lostRow.tS;
  const hidden = rows.filter((x) => x.tS >= lostAt && x.tS < upAt);
  check(hidden.length > 0 && hidden.every((x) => x.occluded), `the dam truly hides it for ${hidden.length} ticks (the scenario holds)`);
  check(hidden.every((x) => x.dets.length === 0), 'no detection while it is hidden');
  /* The track's own clock from its last detection, which a faint target
   * in the dive may have had a little before the dam hid it. */
  const seen = before[before.length - 1].snap.tracks[0].lastSeenS;
  check(lostAt - seen < 1, `last detected ${(lostAt - seen).toFixed(2)} s before the dam hid it (under 1 s)`);
  const coasting = rows.filter((x) => x.tS > seen + STALE_S + 0.1 && x.tS < seen + COAST_S - 0.1);
  const ghostOk = coasting.length > 0 && coasting.every((x) => {
    const k = x.snap.tracks.find((v) => v.id === idBefore);
    return k && k.stale && k.visibility < 0.5 && k.occlusion > 0;
  });
  check(ghostOk, `coasting ${STALE_S} to ${COAST_S} s after its last detection: still track ${idBefore}, stale, visibility under 0.5, occlusion over 0 (${coasting.length} ticks)`);
  const occ = coasting.length ? coasting[coasting.length - 1].snap.tracks.find((v) => v.id === idBefore) : null;
  if (occ) {
    console.log(`    coasting: occlusion ${occ.occlusion.toFixed(2)}, visibility ${occ.visibility.toFixed(2)}, RNG ${km(occ.rangeM.lo)} to ${km(occ.rangeM.hi)} km`);
  }
  const dropped = rows.filter((x) => x.tS > seen + COAST_S + 0.2 && x.tS < upAt);
  check(dropped.length > 0 && dropped.every((x) => !x.snap.tracks.some((v) => v.id === idBefore) && x.snap.lost.some((v) => v.id === idBefore)), `dropped ${COAST_S} s after its last detection, into the ghosts (${dropped.length} ticks)`);
  const expired = rows.filter((x) => x.tS > seen + COAST_S + GHOST_S + 0.2);
  check(expired.length > 0 && expired.every((x) => !x.snap.lost.some((v) => v.id === idBefore)), `the ghost gone ${GHOST_S} s after the drop (${expired.length} ticks)`);
  const after = rows.filter((x) => x.tS > upAt && x.snap.tracks.length > 0);
  const idAfter = after.length ? after[0].snap.tracks[0].id : null;
  check(idAfter != null && idAfter !== idBefore, `re-acquired with the camera back up, as a new track (${idAfter}, ${after.length ? km(after[0].r) : '?'} km)`);
}

/* ---- night ---- */
console.log('night: the approach\'s first confirmed range by band and light, 2x');
{
  const runs = [
    ['EO day', 'eo', 1],
    ['EO night', 'eo', NIGHT],
    ['low light night', 'lowlight', NIGHT],
    ['IR night', 'ir_wh', NIGHT],
    ['IR day', 'ir_wh', 1],
  ];
  const at = {};
  for (const [name, mode, light] of runs) {
    at[name] = firstConfirmedR(fly({
      plan: strikePlan, kind: 'strike', camAt: () => DAM_CAM, mode, light, untilS: 400,
    }));
    console.log(`    ${name.padEnd(16)} ${at[name] ? `${km(at[name])} km` : 'never'}`);
  }
  check(at['IR night'] > at['EO night'] + 300, `thermal at night sees it farther than EO at night (${km(at['IR night'])} against ${km(at['EO night'])} km)`);
  check(at['EO day'] > at['EO night'], `EO by day sees it farther than EO at night (${km(at['EO day'])} against ${km(at['EO night'])} km)`);
}

/* ---- multirotor ---- */
console.log('multirotor: an FPV on the gorge route past a camera on the gorge\'s side, EO, day, 4x');
{
  const plan = planOf('fpv', 'gorge', 'penstock-5');
  const rows = fly({
    plan, kind: 'fpv', camAt: () => [-250, 230, -950], zoom: 4, untilS: 200, stopM: 40,
  });
  const tracked = rows.filter((x) => x.snap.tracks.length > 0);
  const close = tracked.filter((x) => x.r < MULTI_NEAR_M);
  const named = close.filter((x) => x.snap.tracks[0].cls === 'multirotor').length;
  const wrong = tracked.filter((x) => !['multirotor', 'air_object'].includes(x.snap.tracks[0].cls)).length;
  console.log(`    first confirmed at ${km(firstConfirmedR(rows))} km, closest ${Math.min(...rows.map((x) => x.r)).toFixed(0)} m`);
  check(close.length > 0 && named >= 0.6 * close.length, `named multirotor on ${named} of ${close.length} ticks inside ${MULTI_NEAR_M} m (at least 60 %)`);
  check(wrong === 0, `never named another class on ${tracked.length} tracked ticks (${wrong})`);
}

/* ---- lead ---- */
console.log('lead: the camera flying at the Striker at 30 m/s from 2 km, EO, day, 4x');
{
  const SPEED = 30;
  let t0 = null;
  for (let t = 0; t < 400; t += 0.1) {
    if (unitTo(DAM_CAM, poseAt(strikePlan, t * 1000).p).r < 2000) {
      t0 = t;
      break;
    }
  }
  /* North, toward the reservoir, the way the Striker comes. */
  const camAt = (t) => [DAM_CAM[0], DAM_CAM[1], DAM_CAM[2] - SPEED * Math.max(0, t - t0)];
  const rows = fly({
    plan: strikePlan, kind: 'strike', camAt, zoom: 4, untilS: 400, stopM: 150,
  });
  /* The true time to intercept at this speed, |r + v t| = s t. */
  const trueLead = (x) => {
    const r = [x.truth.p[0] - x.own.p[0], x.truth.p[1] - x.own.p[1], x.truth.p[2] - x.own.p[2]];
    const v = x.truth.v;
    const a = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - SPEED * SPEED;
    const b = 2 * (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
    const c = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    const q = Math.sqrt(b * b - 4 * a * c);
    return Math.min(...[(-b - q) / (2 * a), (-b + q) / (2 * a)].filter((u) => u > 0));
  };
  const led = rows.filter((x) => x.snap.tracks.length === 1 && x.snap.tracks[0].lead && x.snap.tracks[0].predictionQuality > 0.2);
  const ratios = led.map((x) => x.snap.tracks[0].lead.tS / trueLead(x));
  const within = ratios.filter((u) => u > 0.5 && u < 2).length;
  const sample = led[Math.floor(led.length / 2)];
  if (sample) {
    const k = sample.snap.tracks[0];
    console.log(`    mid run: ${km(sample.r)} km true, lead ${k.lead.tS.toFixed(1)} s against ${trueLead(sample).toFixed(1)} s true, closure ${k.closureMs.lo.toFixed(0)} to ${k.closureMs.hi.toFixed(0)} m/s, prediction quality ${k.predictionQuality.toFixed(2)}`);
  }
  check(led.length > 30, `a lead offered on ${led.length} ticks at prediction quality over 0.2`);
  check(within >= 0.7 * led.length, `the lead within a factor of 2 of the true time to intercept on ${within} of ${led.length} (at least 70 %)`);
  const err = led.map((x) => {
    const k = x.snap.tracks[0];
    const tl = trueLead(x);
    const p = [x.truth.p[0] + x.truth.v[0] * tl - x.own.p[0], x.truth.p[1] + x.truth.v[1] * tl - x.own.p[1], x.truth.p[2] + x.truth.v[2] * tl - x.own.p[2]];
    const n = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    const c = (k.lead.losW[0] * p[0] + k.lead.losW[1] * p[1] + k.lead.losW[2] * p[2]) / n;
    return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
  });
  console.log(`    lead direction against the true intercept point: median ${median(err).toFixed(1)} deg`);
  check(median(err) < 5, 'the lead direction within 5 degrees of the true intercept point (median)');
}

/* ---- repeat ---- */
console.log('repeat: one seed twice, and another seed');
{
  const digest = (seed) => createHash('sha256').update(JSON.stringify(fly({
    plan: strikePlan, kind: 'strike', camAt: () => DAM_CAM, seed, untilS: 400,
  }).map((x) => [x.dets, x.snap]))).digest('hex').slice(0, 16);
  const a = digest(7);
  const b = digest(7);
  const c = digest(8);
  check(a === b, `seed 7 twice: ${a} and ${b}`);
  check(a !== c, `seed 8 differs: ${c}`);
}

/* ---- cost ---- */
console.log('cost: mission 1\'s last round at 8 pilots in the air at once, a camera over the dam looking north');
{
  const agents = [];
  let id = 1;
  for (const w of MISSION.waves.filter((x) => x.round === 4)) {
    const n = waveSize(w, 8);
    for (let k = 0; k < n; k += 1) {
      agents.push({ id, kind: w.kind, plan: planAgent(MISSION, { id, kind: w.kind, route: w.route, t0: 0, k, n, err: 0, target: waveTarget(w, k) }) });
      id += 1;
    }
  }
  const per = createPerception({ seed: 3, heightAt });
  const trk = createTrackManager({ heightAt });
  const sensor = sensorOf('eo', 1);
  const cam = [0, 300, -1650];
  const own = { p: cam, v: [0, 0, 0], camera: cameraAt([0, -0.15, -0.989]) };
  /* Wall time per frame, and the process's CPU time per perception tick
   * (process.cpuUsage, which a host busy with other work does not
   * inflate the way it does wall time), after WARM_S of warm up. */
  const WARM_S = 10;
  const frameMs = [];
  const tickCpuMs = [];
  let maxTracks = 0;
  let lastTick = null;
  for (let tS = 30; tS < 30 + WARM_S + COST_S; tS += FRAME_S) {
    const truth = [];
    for (const a of agents) {
      const o = poseAt(a.plan, tS * 1000);
      if (o && tS * 1000 <= a.plan.tEnd) {
        truth.push({ id: a.id, kind: a.kind, p: o.p });
      }
    }
    const tick = Math.floor(tS * 15);
    const c0 = process.cpuUsage();
    const t0 = process.hrtime.bigint();
    const dets = per.update(tS, sensor, truth, own);
    const snap = trk.update(tS, dets, own);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const c1 = process.cpuUsage(c0);
    if (tS < 30 + WARM_S) {
      lastTick = tick;
      continue;
    }
    frameMs.push(ms);
    if (tick !== lastTick) {
      lastTick = tick;
      tickCpuMs.push((c1.user + c1.system) / 1000);
    }
    maxTracks = Math.max(maxTracks, snap.tracks.length);
  }
  const sorted = tickCpuMs.slice().sort((x, y) => x - y);
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  console.log(`    ${agents.length} attackers, ${frameMs.length} frames at 60 Hz, ${tickCpuMs.length} perception ticks, up to ${maxTracks} confirmed tracks`);
  console.log(`    wall per frame: mean ${mean(frameMs).toFixed(3)} ms`);
  console.log(`    CPU per tick: mean ${mean(tickCpuMs).toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, worst ${sorted[sorted.length - 1].toFixed(3)} ms`);
  check(maxTracks > 0, 'the cost run tracks something');
  check(mean(tickCpuMs) < COST_TICK_MEAN_MS, `CPU per tick mean under ${COST_TICK_MEAN_MS} ms`);
  check(p99 < COST_TICK_P99_MS, `CPU per tick p99 under ${COST_TICK_P99_MS} ms`);
}

if (failures.length) {
  console.log(`perception-check: ${failures.length} failed`);
  process.exit(1);
}
console.log('perception-check: all passed');
