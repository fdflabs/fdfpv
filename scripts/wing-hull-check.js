/*
 * wing-hull-check.js: a fixed wing meets the world with its parts.
 *
 *     node scripts/wing-hull-check.js [--map=swiss2] [--airframe=cub1400]
 *                                     [--only=pole,banked,corner]
 *
 * The shell met every obstacle with the prop discs, which for a plane are
 * a disc as wide as the wingspan: a pole met it half a metre before the
 * wing, at a point in the air ahead of the aircraft (docs/CRASH-STAGE1.md
 * section 3). src/game/airframehull.js makes a fixed wing's hull its
 * parts. Each scenario is thrown through window.__crashThrow on the real
 * shell, crash damage on, at a real solid of the map, and read back from
 * the shell's own contact log (window.__contacts().log: the part, and the
 * point on the airframe, body frame) and the wreck's pieces:
 *
 *   pole    level at cruise, a power pole 60 percent of the half span out
 *           to the right: the first contact is on the right wing panel
 *           where the pole stands, and only that panel and what it carries
 *           leave at the pole.
 *   banked  banked 45 degrees along a low free standing wall, its top
 *           20 cm under the CG and its face 25 cm out on the high wing's
 *           side: the wall passes under the wing and nothing is touched.
 *           Against a box the discs were an upright ellipsoid whose height
 *           grew with the bank, half a metre below the CG at 45 degrees.
 *           A thrown plane banked 45 degrees turns away from its high wing
 *           and sinks, so this one is the shell's own sweep (window.__hit,
 *           the query every contact pass makes, at the craft's attitude)
 *           along 12 m of the wall in 0.2 m steps, not a flight.
 *   corner  level along a building's face, the right wingtip overlapping
 *           its corner by 10 cm: the corner clips the tip of the panel, on
 *           its leading edge, and only that panel and what it carries leave.
 *
 * Exit 0 when every scenario passes and the page logged no error. A page
 * without the contact log (a build before the parts' hull) is flown and
 * reported, and fails the checks that need the log.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MAP = arg('map', 'swiss2');
const AIRFRAME = arg('airframe', 'cub1400');
const ONLY = arg('only', 'pole,banked,corner').split(',');
const FLY_S = 1.5;
/* What an obstacle took: the pieces that left this soon after its first
 * contact, sim seconds. */
const AT_OBSTACLE_S = 0.15;

const HALF = airframeById(AIRFRAME).dims.hullR;
const CRUISE = 13.5;

function seed() {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIRFRAME),
    airframeAsked: true, map: MAP, graphics: 'low', graphicsAuto: false, crashDamage: true, sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/*
 * The throws, world frame (Three.js, y up). Every one flies along -z, the
 * nose's own direction at yaw 0, so the craft's right is +x.
 */
function plans(pole, box, low) {
  const out = {};
  /* The pole 0.6 of the half span to the right, 8 m ahead, 4 m up it. */
  out.pole = {
    solid: pole,
    lateral: 0.6 * HALF,
    throw: { x: pole.a[0] - 0.6 * HALF, y: pole.a[1] + 4, z: pole.a[2] + 8, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -CRUISE },
  };
  /* Along the low wall's length (world -x, yaw 90, the craft's left +z),
   * left wing up 45 degrees, the wall's near face 0.25 m to the left and
   * its top 0.2 m under the CG. */
  out.banked = {
    solid: low,
    lateral: -0.25,
    throw: { x: low[3] + 1, y: low[4] + 0.2, z: low[2] - 0.25, yaw: 90, pitch: 0, roll: -45, vx: -CRUISE, vy: 0, vz: 0 },
  };
  /* Along the building's +x... its -x face, the right wingtip 10 cm over
   * its corner, halfway up the wall. */
  out.corner = {
    solid: box,
    lateral: HALF - 0.10,
    throw: { x: box[0] - (HALF - 0.10), y: (box[1] + box[4]) / 2, z: box[5] + 8, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -CRUISE },
  };
  return out;
}

const SAMPLE = `JSON.stringify((() => {
  const c = window.__crash();
  const k = window.__contacts();
  return {
    t: c.simT, events: c.events, pieces: c.pieces.map((p) => p.part), labels: c.partLabels ?? c.parts,
    log: k.log ?? null, contacts: k.resolved + k.resting, flags: c.flagNames.join('|'),
    speed: window.__craftState().speed,
    at: (({ worldX, worldY, worldZ }) => [worldX, worldY, worldZ])(window.__craftState()),
  };
})())`;

/* The shell's sweep along the wall at the thrown attitude, held. */
async function sweep(page, plan) {
  const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true })}))`).then(JSON.parse);
  if (!thrown || thrown.ok === false) {
    throw new Error(`banked: the throw was refused: ${JSON.stringify(thrown)}`);
  }
  await page.sleep(500);
  const { x, y, z } = plan.throw;
  const steps = [];
  for (let k = 0; k < 60; k += 1) {
    steps.push([x - 0.2 * k, y, z, x - 0.2 * (k + 1), y, z]);
  }
  const hits = await page.evaluate(`JSON.stringify(${JSON.stringify(steps)}.map((s) => window.__hit(...s)).map((h, k) => ({ k, ...h })).filter((h) => h.kind))`).then(JSON.parse);
  const up = await page.evaluate('JSON.stringify(window.__craftState().up)').then(JSON.parse);
  await page.evaluate('window.__releasePose()');
  return { hits, up, metres: 0.2 * steps.length };
}

async function fly(page, name, plan) {
  await page.evaluate('window.__stick()');
  await page.tap('KeyR');
  await page.sleep(1200);
  const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true })}))`).then(JSON.parse);
  if (!thrown || thrown.ok === false) {
    throw new Error(`${name}: the throw was refused: ${JSON.stringify(thrown)}`);
  }
  await page.evaluate('window.__stick(0, 0, 0, 0.75)');
  const start = await page.evaluate(SAMPLE).then(JSON.parse);
  await page.evaluate('window.__releasePose()');
  const log = [];
  for (;;) {
    const s = await page.evaluate(SAMPLE).then(JSON.parse);
    log.push(s);
    if (s.t - start.t >= FLY_S) {
      break;
    }
    await page.sleep(20);
  }
  return { start, log };
}

function judge(name, plan, { start, log }) {
  const last = log[log.length - 1];
  const contacts = last.log;
  const first = contacts && contacts.length ? contacts[0] : null;
  const contactCount = last.contacts - start.contacts;
  /* When each piece first showed, sim seconds. */
  const seen = new Map();
  for (const s of log) {
    for (const p of s.pieces) {
      if (!seen.has(p)) {
        seen.set(p, s.t);
      }
    }
  }
  const labels = last.labels;
  /* Without the log, the sample in which the first contact was counted. */
  const counted = log.find((s) => s.contacts > start.contacts);
  const firstT = first ? first.t : (counted ? counted.t : null);
  const left = [...seen].filter(([, t]) => firstT !== null && t <= firstT + AT_OBSTACLE_S + 0.03).map(([p]) => labels[p]);
  const facts = {
    contacts: contactCount,
    first: first ? {
      kind: first.kind,
      part: first.part >= 0 ? labels[first.part] : 'disc',
      at: first.arm.map((v) => +v.toFixed(3)),
    } : null,
    solidLateral: +(-plan.lateral).toFixed(3),
    leftAtObstacle: left,
    leftInFlight: [...seen.keys()].map((p) => labels[p]),
    endSpeed: +last.speed.toFixed(2),
    flags: last.flags,
  };
  const panel = first && first.part >= 0 ? labels[first.part] : '';
  const onPanel = (l) => l === 'wing right' || l === 'aileron right' || l === 'wing' || l === 'elevon right' || l === 'fin right';
  const lateralOk = first && (name === 'pole'
    ? Math.abs(first.arm[1] - -plan.lateral) < 0.03
    : first.arm[1] <= -(HALF - 0.10) + 0.005);
  const ok = Boolean(first) && /^wing/.test(panel) && lateralOk && left.length > 0 && left.every(onPanel);
  return { ok, facts };
}

const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${MAP}`, seed: seed() });
const results = [];
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 180000);
  const id = await page.evaluate('window.__map().id');
  if (id !== MAP) {
    throw new Error(`the page seated map ${id}, not ${MAP}`);
  }
  await page.evaluate('window.__drawOff(true)');
  const here = await page.evaluate('JSON.stringify(window.__craftState())').then(JSON.parse);
  /* The power pole nearest the spawn, and the house the roofs name first. */
  const pole = await page.evaluate(`JSON.stringify(window.__crashSolids(${here.worldX}, ${here.worldZ}, 3000, 'pole')[0])`).then(JSON.parse);
  const R = await page.evaluate('JSON.stringify((({ x, z }) => ({ x, z }))(window.__roofs()[0]))').then(JSON.parse);
  const boxes = await page.evaluate(`JSON.stringify(window.__colliderBoxes(${R.x}, ${R.z}, 14))`).then(JSON.parse);
  const box = boxes.reduce((a, b) => ((b[3] - b[0]) * (b[5] - b[2]) > (a[3] - a[0]) * (a[5] - a[2]) ? b : a));
  /* The longest free standing low wall along x near the spawn: 1 to 3 m
   * tall, nothing on top of it. */
  const all = await page.evaluate(`JSON.stringify(window.__colliderBoxes(${here.worldX}, ${here.worldZ}, 1500))`).then(JSON.parse);
  const low = all.filter((b) => b[4] - b[1] > 1 && b[4] - b[1] < 3 && b[3] - b[0] > 15
    && !all.some((o) => o !== b && o[1] >= b[4] - 0.05 && o[0] < b[3] && o[3] > b[0] && o[2] < b[5] && o[5] > b[2]))
    .sort((a, b) => (b[3] - b[0]) - (a[3] - a[0]))[0];
  if (!low) {
    throw new Error(`${MAP} has no free standing low wall 15 m long`);
  }
  /* The first throw of a page pays for collecting the crash world's
   * trees; take it high over the valley. */
  await page.evaluate('window.__crashThrow({ x: -150, y: 150, z: 155, yaw: 90, pitch: 0, vx: -14, vy: 0, vz: 0 })');
  await page.sleep(3000);
  const P = plans(pole, box, low);
  for (const name of ONLY) {
    if (name === 'banked') {
      await page.evaluate('window.__stick()');
      await page.tap('KeyR');
      await page.sleep(1200);
      const { hits, up, metres } = await sweep(page, P.banked);
      const w = P.banked.solid;
      const facts = {
        swept: `${metres.toFixed(1)} m along the wall, its top ${(P.banked.throw.y - w[4]).toFixed(2)} m under the CG, its face ${(-P.banked.lateral).toFixed(2)} m out`,
        bankDeg: +(Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI).toFixed(1),
        hits: hits.length,
        first: hits[0] ? { atMetre: +(0.2 * hits[0].k).toFixed(1), kind: hits[0].kind, part: hits[0].part ?? null, ny: +hits[0].ny.toFixed(2) } : null,
      };
      results.push({ name, ok: hits.length === 0 && Math.abs(facts.bankDeg - 45) < 1, facts });
      continue;
    }
    const flown = await fly(page, name, P[name]);
    results.push({ name, ...judge(name, P[name], flown) });
  }
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  for (const e of errs) {
    results.push({ name: 'page', ok: false, facts: e });
  }
} finally {
  await page.close();
}
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${MAP} ${AIRFRAME} ${r.name}: ${JSON.stringify(r.facts)}`);
  failed += r.ok ? 0 : 1;
}
console.log(failed ? `${failed} failure(s)` : 'every wing hull scenario passes');
process.exit(failed ? 1 : 0);
