/*
 * roof-check.js: a roof is ground you can skid on, and its walls are walls.
 *
 *     node scripts/roof-check.js [--map=swiss2] [--airframe=cub1400] [--roof=0]
 *                                [--only=ramp,dive,wall,gable,slope,quad]
 *     SIM_GPU=1 node scripts/roof-check.js --shots=DIR
 *
 * The owner's report: "buildings' roofs don't seem to work: when I approach
 * them the airplane crashes." Every scenario is thrown through
 * window.__crashThrow at one real roof of the map (window.__roofs, a gable
 * with walls under it), with the run's crash damage on, and flown by the
 * shell as a pilot's flight is:
 *
 *   ramp   up the roof's slope at 7 degrees under its pitch, level with
 *          it, the roof as a ramp: the aircraft must touch the roof
 *          (window.__ground().contactSteps, the steps with the hull or a
 *          wheel on the ground, grows over it), skid or bounce off it,
 *          break nothing while on or over it, touch no wall, and fly on
 *          off the far eave (what it meets after that is not the roof's).
 *   dive   straight into the same slope 50 degrees nose down: a wreck.
 *   wall   level into the eave wall a metre and a half under the eaves:
 *          the shell's sweep meets a `wall`, and the plane does not get
 *          into the house.
 *   gable  level into the gable end above the plate: a `wall` there too,
 *          and nothing gets past the gable's face.
 *   slope  level into the side of the roof halfway up it: whatever the
 *          crash physics makes of it, the plane never gets under the roof.
 *   quad   a five inch let down square onto the slope at 0.8 m/s, motors
 *          idle: it comes down on the roof and stays on it, never through
 *          it, and nothing breaks.
 *
 * The first three fly the airframe named (a Cub by default); the last is
 * always the five inch, through the same ground contact. Whether a ramp
 * touch breaks something is the crash physics' call and depends on the
 * aircraft: a tractor prop level with the roof strikes it, as it strikes
 * the airfield's grass on the same approach. The defaults, a Cub on swiss2
 * and a Skyhunter on alps, are aircraft this approach does not break. Exit 0 when every
 * scenario passes and the page logged no error, 1 otherwise.
 *
 * --shots=DIR leaves a few frames of each scenario from a fixed camera
 * beside the roof. Pictures are evidence for one look (CLAUDE.md): delete
 * them after. They want SIM_GPU=1; the software rasteriser draws two
 * frames a second.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
const ROOF = Number(arg('roof', 0));
const SHOTS = arg('shots', null);
const ONLY = arg('only', 'ramp,dive,wall,gable,slope,quad').split(',');
const SPEED = 14;
const FLY_MS = 4000;

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
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
 * Page side: the roof, its frame, and the throw for one scenario. The roof's
 * own x runs across the ridge, world (c, -s); every scenario comes in along
 * -x from the +x eave. `T(lx)` is the roof's top on the ridge's normal
 * line, off the map's own contact surface.
 */
const PLAN = (scn) => `(() => {
  const roofs = window.__roofs().filter((r) => r.solids.length && r.hw >= 3.5 && /^(shingle|slate)/.test(r.key));
  const R = roofs[${ROOF}];
  const ux = R.c, uz = -R.s;
  const at = (lx) => [R.x + ux * lx, R.z + uz * lx];
  const T = (lx) => window.__surface(...at(lx), 1e9);
  const pitch = Math.atan((T(R.hw * 0.25) - T(R.hw * 0.75)) / (R.hw * 0.5)) * 180 / Math.PI;
  const plate = T(R.hw) - R.dy;
  const scn = ${JSON.stringify(scn)};
  const d2r = Math.PI / 180;
  const yaw = Math.atan2(ux, uz) / d2r;
  const V = ${SPEED};
  let lx, y, climb, back, attitude;
  if (scn === 'ramp') {
    /* Level with the roof's plane, the way a pilot meets a ramp. */
    lx = R.hw * 0.4; climb = pitch - 7; y = T(lx) - 0.3; back = 5; attitude = pitch;
  } else if (scn === 'dive') {
    lx = R.hw * 0.5; climb = -50; y = T(lx) + 0.25; back = 10; attitude = climb + 3;
  } else if (scn === 'wall') {
    lx = R.hw; climb = 0; y = plate - 1.5; back = 7; attitude = 0;
  } else if (scn === 'slope') {
    /* Level into the side of the roof halfway up it. */
    lx = R.hw * 0.5; climb = 0; y = T(lx); back = 8; attitude = 0;
  } else if (scn === 'gable') {
    /* Level into the gable end, square to it, 40 percent of the way from
     * the plate to the ridge's underside: along the roof's own -z. */
    const vz = [R.s, R.c];
    const [gx, gz] = [R.x + vz[0] * R.hd, R.z + vz[1] * R.hd];
    const gy = plate + 0.4 * (T(0) - R.dy - plate);
    const gyaw = Math.atan2(vz[0], vz[1]) / d2r;
    return {
      R, pitch, plate, lx: 0, x: gx, y: gy, z: gz,
      throw: { x: gx + vz[0] * 7, y: gy, z: gz + vz[1] * 7, yaw: gyaw, pitch: 0, vx: -vz[0] * V, vy: 0, vz: -vz[1] * V },
    };
  } else {
    lx = R.hw * 0.5; y = T(lx) + 0.25;
    const [x, z] = at(lx);
    /* Square to the slope, as a pilot sets a quad down on one: level onto
     * a 28 degree face is a blade strike on any hard ground (the city's
     * asphalt bends the arm too). */
    const sp = Math.sin(pitch * d2r), cp = Math.cos(pitch * d2r);
    return {
      R, pitch, plate, lx, x, y, z,
      throw: { x, y, z, yaw, pitch, vx: -0.8 * ux * sp, vy: -0.8 * cp, vz: -0.8 * uz * sp },
    };
  }
  const [x, z] = at(lx);
  const cc = Math.cos(climb * d2r), sc = Math.sin(climb * d2r);
  return {
    R, pitch, plate, lx, x, y, z,
    throw: {
      x: x + ux * back * cc, y: y - back * sc, z: z + uz * back * cc, yaw, pitch: attitude,
      vx: -ux * V * cc, vy: V * sc, vz: -uz * V * cc,
    },
  };
})()`;

/* One sample of the flight, in the roof's frame. */
const SAMPLE = (R) => `(() => {
  const s = window.__craftState();
  const c = window.__crash();
  const dx = s.worldX - ${R.x}, dz = s.worldZ - ${R.z};
  const lx = ${R.c} * dx - ${R.s} * dz;
  const lz = ${R.s} * dx + ${R.c} * dz;
  return {
    lx, lz, y: s.worldY, speed: s.speed, hit: s.lastHitKind, wrecked: c.wrecked, events: c.events,
    flags: c.flagNames.join('|'), landed: s.landed, contacts: window.__ground().contactSteps,
    ground: window.__surface(s.worldX, s.worldZ, s.worldY - 0.4),
    roof: window.__surface(s.worldX, s.worldZ, 1e9),
  };
})()`;

async function fly(page, scn, shots) {
  const plan = await page.evaluate(`JSON.stringify(${PLAN(scn)})`).then(JSON.parse);
  const R = plan.R;
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true })})`);
  await page.evaluate(`window.__stick(0, 0, 0, ${scn === 'quad' ? 0 : 0.45})`);
  if (shots) {
    const side = [R.x + R.s * 16 + R.c * 4, plan.y + 3, R.z + R.c * 16 - R.s * 4];
    await page.evaluate(`window.__setCam(${side.join(',')}, ${plan.x}, ${plan.y - 1}, ${plan.z}, 60)`);
    await page.sleep(400);
  }
  const events0 = await page.evaluate('window.__crash().events');
  await page.evaluate('window.__releasePose()');
  const log = [];
  const t0 = Date.now();
  let shot = 0;
  while (Date.now() - t0 < FLY_MS) {
    log.push(await page.evaluate(`JSON.stringify(${SAMPLE(R)})`).then(JSON.parse));
    if (shots && log.length % 5 === 2 && shot < 6) {
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      await writeFile(join(shots, `${MAP}-${scn}-${shot}.png`), Buffer.from(data, 'base64'));
      shot += 1;
    }
    await page.sleep(30);
  }
  return { plan, log, events0 };
}

function judge(scn, { plan, log, events0 }) {
  const R = plan.R;
  if (process.argv.includes('--verbose')) {
    for (const r of log) {
      console.log(`  ${scn} lx ${r.lx.toFixed(2)} y ${r.y.toFixed(2)} roof ${r.roof.toFixed(2)} ground ${r.ground.toFixed(2)} v ${r.speed.toFixed(1)} contacts ${r.contacts} ${r.hit} ${r.flags}`);
    }
  }
  const last = log[log.length - 1];
  /* Clearance over the roof, inside its walls, where it is certainly roof. */
  const over = log.filter((r) => Math.abs(r.lx) < R.hw);
  const minClear = over.length ? Math.min(...over.map((r) => r.y - r.roof)) : Infinity;
  const walls = log.filter((r) => r.hit === 'wall').length;
  /* Steps with the plant's hull or a wheel on its ground plane while over
   * the roof: the count's growth between samples taken over it. */
  let touches = 0;
  for (let k = 1; k < log.length; k += 1) {
    if (Math.abs(log[k].lx) < R.hw || Math.abs(log[k - 1].lx) < R.hw) {
      touches += log[k].contacts - log[k - 1].contacts;
    }
  }
  const minLx = Math.min(...log.map((r) => r.lx));
  /* What broke while the craft was on or over the roof, eaves included,
   * against what broke after it had left: a glide that ends in a meadow
   * or a tree three seconds later is not the roof's. */
  const onRoof = (r) => Math.abs(r.lx) < R.hw + 1.5;
  let roofEvents = 0;
  for (let k = 1; k < log.length; k += 1) {
    if (onRoof(log[k]) || onRoof(log[k - 1])) {
      roofEvents += log[k].events - log[k - 1].events;
    }
  }
  const wreckedOnRoof = log.some((r, k) => r.wrecked && onRoof(r) && !(k > 0 && log[k - 1].wrecked));
  /* Off the far eave and still flying, a metre and more over what is under it. */
  const flewOn = log.some((r) => r.lx < -R.hw - 1.5 && r.y - r.ground > 1);
  const facts = {
    roofEvents,
    wreckedOnRoof,
    flewOn,
    roof: `${R.key} (${R.material}), pitch ${plan.pitch.toFixed(1)} deg, ${R.solids.length} wall boxes`,
    minClearOverRoof: +minClear.toFixed(3),
    roofContactSteps: touches,
    deepestLx: +minLx.toFixed(2),
    wallSamples: walls,
    events: last.events - events0,
    flags: last.flags,
    wrecked: last.wrecked,
    end: { lx: +last.lx.toFixed(2), y: +last.y.toFixed(2), speed: +last.speed.toFixed(2), roofUnder: +last.roof.toFixed(2), landed: last.landed },
  };
  /* Inside the house, under its roof: through a wall or the shell. */
  const inside = log.filter((r) => Math.abs(r.lx) < R.hw - 0.3 && Math.abs(r.lz) < R.hd - 0.3 && r.y < r.roof - R.dy - 0.1).length;
  facts.insideSamples = inside;
  facts.shallowestLz = +Math.min(...log.map((r) => r.lz)).toFixed(2);
  let ok;
  if (scn === 'slope') {
    ok = inside === 0 && touches + walls > 0;
  } else if (scn === 'gable') {
    ok = walls > 0 && inside === 0 && facts.shallowestLz > R.hd - 0.05;
  } else if (scn === 'ramp') {
    /* Touched the roof, broke nothing on it, met no wall, and flew on
     * off the far eave. */
    ok = touches > 0 && roofEvents === 0 && !wreckedOnRoof && walls === 0 && flewOn;
  } else if (scn === 'dive') {
    ok = last.wrecked;
  } else if (scn === 'wall') {
    /* The eave wall stood at lx = hw; the craft never got into the house. */
    ok = walls > 0 && minLx > R.hw - 0.05 && inside === 0;
  } else {
    /* Down onto the roof and on it, never through it: a quad on a slate
     * pitch steeper than its friction holds slides, as it should. */
    ok = minClear < 0.15 && over.every((r) => r.y > r.roof - 0.15) && !last.wrecked;
  }
  return { ok, facts };
}

async function session(airframe, scenarios) {
  /* The map is named in the address as well as seated: a page that names
   * no world opens on the Alps (src/boot.js), not on the seat. */
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${MAP}`, seed: seed(airframe) });
  const out = [];
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready', 180000);
    const id = await page.evaluate('window.__map().id');
    if (id !== MAP) {
      throw new Error(`the page seated map ${id}, not ${MAP}`);
    }
    if (!SHOTS) {
      /* The software rasteriser draws two frames a second, and the frame
       * loop steps the plant per frame: with the draw off the flight runs
       * at the sim's own rate. Nothing about the trajectory depends on it. */
      await page.evaluate('window.__drawOff(true)');
    }
    /* The first throw of a page pays for collecting the crash world's
     * trees; take it high over the valley. */
    await page.evaluate('window.__crashThrow({ x: -150, y: 150, z: 155, yaw: 90, pitch: 0, vx: -14, vy: 0, vz: 0 })');
    await page.sleep(4000);
    for (const scn of scenarios) {
      await page.evaluate('window.__stick()');
      await page.tap('KeyR');
      await page.sleep(1500);
      const flown = await fly(page, scn, SHOTS);
      out.push({ scn, airframe, ...judge(scn, flown) });
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    return { out, errs };
  } finally {
    await page.close();
  }
}

if (SHOTS) {
  await mkdir(SHOTS, { recursive: true });
}
const planes = ['ramp', 'dive', 'wall', 'gable', 'slope'].filter((s) => ONLY.includes(s));
const runs = [];
if (planes.length) {
  runs.push(await session(AIRFRAME, planes));
}
if (ONLY.includes('quad')) {
  runs.push(await session('5inch', ['quad']));
}
let failed = 0;
for (const { out, errs } of runs) {
  for (const r of out) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${MAP} ${r.airframe} ${r.scn}: ${JSON.stringify(r.facts)}`);
    failed += r.ok ? 0 : 1;
  }
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  failed += errs.length;
}
console.log(failed ? `${failed} failure(s)` : 'all roof scenarios pass');
process.exit(failed ? 1 : 0);
