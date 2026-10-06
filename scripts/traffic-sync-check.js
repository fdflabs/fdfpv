/*
 * traffic-sync-check.js: the cars are where everyone says they are.
 *
 *   SIM_GPU=1 npm run check:traffic-sync
 *
 * The owner's report (bug-35e357c9, swiss2): "I landed on a car and on the
 * clip it is not seen that I landed on a car, and my friends don't see the
 * same things I do, the cars and things should be sync." Three claims,
 * each checked on the real page, on the Swiss valley, with a Skyhunter:
 *
 *  a. A car can be landed on. Let go half a metre over each car parked by
 *     the hangar and over the PostAuto at its stop, the aircraft comes to
 *     rest on the roof, not on the road beside it, and stays there. (It
 *     rests there held by the car's box in the colliders; the shell's
 *     `landed` is the judgement for ground and roofs, so it is not asked.)
 *  b. In a room the traffic runs on the room's clock. The pilot's own lap
 *     clock is zeroed by R, and the traffic used to be a function of it,
 *     so a pilot who pressed R saw every car jump back to where it starts
 *     while everyone else in the room saw it drive on. In a room (a rooms
 *     server started here, edge/rooms/node.js), R leaves the PostAuto
 *     where the room's clock puts it, and the clock the world is drawn at
 *     is the room's.
 *  c. The replay draws the traffic at the clock each frame was flown at.
 *     It used to draw the world at the lap clock frozen when the replay
 *     opened, so every frame of the clip had the cars where they were at
 *     the end, and a landing on a car showed a landing on the road. Flown
 *     while the PostAuto drives in to its stop, sampled every frame, then
 *     replayed: at each replayed frame the PostAuto is where it was drawn
 *     live at that frame's clock.
 *
 * Run: SIM_GPU=1 node scripts/traffic-sync-check.js
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const AIRFRAME = 'sky1800';
function seed() {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIRFRAME),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* The two cars parked behind the hangar (alps/life.js park) and the
 * PostAuto's stop, where its timetable holds it from about 8 s to 30 s of
 * its clock (measured: it drives in from x -186 over the first 8 s). */
const PARKED = [{ name: 'the estate by the hangar', x: 63.5, z: -50 }, { name: 'the hatch by the hangar', x: 68.5, z: -49.5 }];
const BUS_STOP_MS = 12000;
const WAIT = 120000;

const frameCount = (page) => page.evaluate('window.__boot().frames');
async function frames(page, n) {
  const f0 = await frameCount(page);
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

/* The PostAuto as drawn, and the clocks the world was drawn at (null on a
 * build without the hook). */
const BUS = `(() => {
  const b = window.__mapScene().getObjectByName('postbus');
  return { x: b.position.x, y: b.position.y, z: b.position.z };
})()`;
const bus = (page) => page.evaluate(BUS);
const traffic = (page) => page.evaluate('window.__traffic ? window.__traffic() : null');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const fmt = (p) => `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;

/* The aircraft let go `drop` metres over a roof at `top`, level and still,
 * at lap clock `clockMs`; where it is 40 frames on, and how far it moved
 * in the 20 frames after that. */
async function dropOn(page, x, z, top, clockMs, drop = 0.5) {
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  const r = await page.evaluate(`window.__crashThrow({ fresh: true, hold: true, clockMs: ${clockMs}, x: ${x}, y: ${top + drop}, z: ${z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, showCraft: true })`);
  await frames(page, 2);
  await page.evaluate('window.__releasePose()');
  await frames(page, 40);
  const where = '(() => { const s = window.__craftState(); return { x: s.worldX, y: s.worldY, z: s.worldZ, wrecked: window.__crash().wrecked }; })()';
  const a = await page.evaluate(where);
  await frames(page, 20);
  const b = await page.evaluate(where);
  return { ok: r && r.ok, ...b, moved: dist(a, b) };
}

async function landing(page) {
  console.log('a. a car can be landed on');
  for (const car of PARKED) {
    const boxes = await page.evaluate(`window.__colliderBoxes(${car.x}, ${car.z}, 1.5)`);
    const box = boxes.find((b) => b[0] <= car.x && b[3] >= car.x && b[2] <= car.z && b[5] >= car.z);
    if (!box) {
      check(`${car.name} has a collider`, false, 'no box round it');
      continue;
    }
    const top = box[4];
    const s = await dropOn(page, car.x, car.z, top, 0);
    check(`let go over ${car.name}, it rests on the roof`, s.ok && !s.wrecked && s.moved < 0.01 && s.y > top - 0.1 && s.y < top + 0.8,
      `roof box at ${top.toFixed(2)} m, resting at ${s.y.toFixed(2)} m, moved ${s.moved.toFixed(4)} m in 20 frames, wrecked ${s.wrecked}`);
  }
  /* In one evaluate: a frame drawn between would put the PostAuto back
   * where the lap clock has it. */
  const { at, top } = await page.evaluate(`(() => {
    window.__animTo(${BUS_STOP_MS});
    const b = window.__mapScene().getObjectByName('postbus');
    return { at: { x: b.position.x, y: b.position.y, z: b.position.z }, top: new window.__three.Box3().setFromObject(b).max.y };
  })()`);
  const s = await dropOn(page, at.x, at.z, top, BUS_STOP_MS, 0.6);
  check('let go over the PostAuto at its stop, it rests on the roof', s.ok && !s.wrecked && s.moved < 0.01 && s.y > top - 0.1 && s.y < top + 0.8,
    `drawn roof at ${top.toFixed(2)} m, resting at ${s.y.toFixed(2)} m over ${fmt(at)}, moved ${s.moved.toFixed(4)} m in 20 frames, wrecked ${s.wrecked}`);
}

async function replay(page) {
  console.log('c. the replay draws the traffic at the clock each frame was flown at');
  const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
  await page.evaluate('window.__stick(0, 0, 0, 0.7)');
  await page.evaluate(`window.__crashThrow({ fresh: true, clockMs: 0, x: ${pad.x}, y: ${pad.g + 60}, z: ${pad.z}, yaw: 30, pitch: 0, vx: -9, vy: 0, vz: -15.6, showCraft: false })`);
  /* Every frame drawn while the PostAuto drives in, as it was drawn. */
  const live = [];
  let last = -1;
  for (;;) {
    await frames(page, 1);
    const f = await page.evaluate(`({ n: window.__boot().frames, bus: ${BUS}, t: window.__traffic ? window.__traffic() : null })`);
    if (f.n !== last) {
      live.push(f);
      last = f.n;
    }
    if (f.t ? f.t.lap >= 9500 : live.length >= 60) {
      break;
    }
  }
  const liveTravel = dist(live[0].bus, live[live.length - 1].bus);
  check('live, the PostAuto drove while the clip was flown', liveTravel > 5, `${liveTravel.toFixed(1)} m over ${live.length} frames`);

  await page.evaluate('window.__crashCam.open()');
  await page.until('window.__crashCam.live()', WAIT);
  const n = await page.evaluate('window.__crashCam.h().clip().n');
  /* The rows flown while the live frames were sampled, when the clip
   * says which they are; every row otherwise. */
  const liveClocks = live.filter((f) => f.t).map((f) => f.t.drawn);
  const inLive = await page.evaluate(`(() => {
    const h = window.__crashCam.h();
    const want = new Set(${JSON.stringify(liveClocks)});
    const out = [];
    for (let k = 0; k < ${n}; k += 1) {
      if (!h.clipAnim || want.has(h.clipAnim(k))) {
        out.push(k);
      }
    }
    return out;
  })()`);
  const rows = inLive.length > 1 ? inLive : Array.from({ length: n }, (x, k) => k);
  const seen = [];
  for (let j = 0; j < rows.length; j += Math.max(1, Math.floor(rows.length / 40))) {
    const k = rows[j];
    await page.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${k}))`);
    await frames(page, 2);
    seen.push(await page.evaluate(`({ k: ${k}, bus: ${BUS}, anim: window.__crashCam.h().clipAnim ? window.__crashCam.h().clipAnim(${k}) : null, t: window.__traffic ? window.__traffic() : null })`));
  }
  let spread = 0;
  for (const s of seen) {
    spread = Math.max(spread, dist(s.bus, seen[seen.length - 1].bus));
  }
  check('replayed, the PostAuto moves with the playhead', spread > 5, `${spread.toFixed(1)} m between the frames replayed, ${seen.length} of ${n}`);

  const byClock = new Map(live.filter((f) => f.t).map((f) => [f.t.drawn, f.bus]));
  let matched = 0;
  let worst = 0;
  let span = 0;
  let first = null;
  for (const s of seen) {
    const was = s.anim === null ? undefined : byClock.get(s.anim);
    if (!was) {
      continue;
    }
    matched += 1;
    worst = Math.max(worst, dist(was, s.bus));
    first = first || was;
    span = Math.max(span, dist(first, was));
  }
  check('at each replayed frame the PostAuto is where it was drawn live at that frame', matched >= 5 && span > 5 && worst < 0.01,
    `${matched} frames matched a live frame by clock, over ${span.toFixed(1)} m of its drive, worst ${worst.toFixed(4)} m`);
  const drawnAt = seen.filter((s) => s.t && s.anim !== null && s.t.drawn === s.anim).length;
  check('the world is drawn at the clip\'s clock at every frame replayed', drawnAt === seen.length, `${drawnAt} of ${seen.length}`);

  await page.evaluate('window.__crashCam.h().api.close()');
  await page.until('!window.__crashCam.live()', WAIT);
  await frames(page, 3);
  const back = await traffic(page);
  check('closed, the world is drawn at the live clock again', back && back.drawn === back.lap + back.offset, back ? JSON.stringify(back) : 'no __traffic');
}

async function room(page) {
  console.log('b. in a room the traffic runs on the room\'s clock');
  const code = await page.evaluate('window.__roomCreate()');
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", WAIT);
  check('a room made and joined', /^[A-Z0-9]{6}$/.test(code), code);
  /* The PostAuto at its stop on the room's clock, whatever the lap clock. */
  await page.until(`window.__rooms().roomNow >= ${BUS_STOP_MS}`, WAIT);
  await frames(page, 3);
  const t0 = await traffic(page);
  check('the world is drawn at the room\'s clock', t0 && Math.abs(t0.drawn - t0.room) < 250, t0 ? `drawn ${t0.drawn.toFixed(0)} ms, room ${t0.room.toFixed(0)} ms, lap ${t0.lap} ms` : 'no __traffic');
  const before = await bus(page);
  await page.tap('KeyR');
  await page.until('window.__traffic ? window.__traffic().lap < 2000 : true', WAIT);
  await frames(page, 3);
  const after = await bus(page);
  const t1 = await traffic(page);
  const room1 = await page.evaluate('window.__rooms().roomNow');
  check('R zeroes the lap clock and the PostAuto stays where the room has it', dist(before, after) < 1 && room1 < 28000,
    `${dist(before, after).toFixed(2)} m from ${fmt(before)} to ${fmt(after)}, room clock ${room1.toFixed(0)} ms`);
  check('after R the world is still drawn at the room\'s clock, not the lap\'s', t1 && Math.abs(t1.drawn - t1.room) < 250 && t1.lap < 2000,
    t1 ? `drawn ${t1.drawn.toFixed(0)} ms, room ${t1.room.toFixed(0)} ms, lap ${t1.lap} ms` : 'no __traffic');
}

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-traffic-rooms-'));
  const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
  const origin = `http://127.0.0.1:${rooms.port}`;
  console.log(`traffic in sync, on the real page (rooms at ${origin})`);
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=swiss2&rooms=${encodeURIComponent(origin)}`, seed: seed() });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 300000);
    await frames(page, 3);
    await landing(page);
    await replay(page);
    await room(page);
    const errors = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await page.close();
    await rooms.stop();
    rmSync(scratch, { recursive: true, force: true });
  }
  if (failed) {
    console.log(`check:traffic-sync FAILED (${failed})`);
    process.exit(1);
  }
  console.log('check:traffic-sync ok');
  /* The emptied room's purge alarm would hold the process five minutes. */
  process.exit(0);
}

await main();
