/*
 * war-fuze-cue.js: the IN RANGE cue against the room's own detonation, on
 * the real shell (src/ui/warmarkers.js, src/ui/avionicshud.js,
 * src/share/war/fuze.js, edge/rooms/war.js).
 *
 *   SIM_GPU=1 npm run war:fuze [-- outdir]
 *
 * One headless page flies the Striker (striker2500, the standard warhead)
 * in a private room on the Itaipu map, on a rooms server this check runs
 * in its own process, and starts mission 1 alone. Its first Striker is
 * met twice on its way: the pilot is held still beside its path, first
 * OUTSIDE_M off it (no part of the Striker's hull can come within the
 * fuze radius), then INSIDE_M off it further on. Every frame the page
 * records what the war markers show for that attacker, and the room's own
 * distance at that room ms is worked out here: hullDistance from the
 * room's pose of the seat to the attacker's centre on its route
 * (routes.js, the room's own function, from the room's birth record).
 *
 * What must hold:
 *   - the room's view gives this seat the Striker's standard radius
 *   - the marker's distance is the room's, to BAND_M, on every frame
 *   - the cue is on exactly on the frames the room's distance is within
 *     the radius (frames within BAND_M of it are not judged)
 *   - the outside pass: no IN RANGE on any frame, and no detonation
 *   - the inside pass: the room's detonation falls between the last frame
 *     without the cue and the first with it
 *   - the Avionics HUD (on by default on a combat airframe, its AI on)
 *     never draws IN RANGE while the markers show nothing in range; the
 *     frames it drew it on are reported, since whether a track forms on
 *     the attacker is the sensor model's business
 *
 * Pictures of the cue go in outdir (build/war-fuze by default, not in the
 * repository).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { hullDistance, hullFor } from '../src/game/midair.js';
import { fuzeM } from '../src/share/war/fuze.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

const AIRFRAME = 'striker2500';
const itaipu1 = MISSIONS['itaipu-1'];
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'war-fuze');

/* The marker's distance against the room's: the page's pose is the one it
 * sent (f32 position, a quantised quaternion on the wire), so a few mm. */
const BAND_M = 0.05;
/* Off the attacker's path, metres, centre to path. The Striker's hull
 * reaches 1.5733 m from its centre (configs/airframes.js hullR), so
 * OUTSIDE_M keeps every part outside its 9 m radius and INSIDE_M brings
 * one well inside it. */
const OUTSIDE_M = 10.8;
const INSIDE_M = 6;
/* Where the pilot meets it, ms after its birth. */
const MEET_OUT_MS = 10000;
const MEET_IN_MS = 24000;

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

function seed() {
  const s = seatAirframe({ airframe: AIRFRAME, rates: airframeById(AIRFRAME).rates }, AIRFRAME);
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const throwTo = (p, at, yaw, fresh) => p.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: ${yaw}, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh}, showCraft: true })`);
/* As scripts/war-boom.js holds a craft: 40 m over the point, fresh, then
 * down onto it, so it has left its spawn and can go off. */
async function hold(p, at, yaw) {
  await throwTo(p, [at[0], at[1] + 40, at[2]], yaw, true);
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  await p.sleep(300);
  await throwTo(p, at, yaw, false);
  await p.until('window.__rooms().spawning === false', SPAWN_MS + 10000);
}

/* Every frame from now until room ms `until`: what the markers showed for
 * attacker `id`, at the room ms they were drawn for, and whether the
 * Avionics HUD drew IN RANGE. */
const record = (p, id, until) => p.evaluate(`(async () => {
  const out = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  while (window.__rooms().roomNow < ${until}) {
    await frame();
    const m = window.__war().markers;
    if (!m.on || m.at == null) {
      continue;
    }
    const near = m.near.find((x) => x.id === ${id});
    out.push({
      at: m.at, dist: near ? near.dist : null, cue: m.inRange.includes(${id}), any: m.inRange.length > 0,
      avx: window.__avionicsHud().inRange,
      avxOn: window.__avionicsHud().on,
      primary: window.__avionics.snapshot().primaryId != null,
      tracks: window.__avionics.snapshot().tracks.length,
      tS: window.__avionics.state().tel.tS,
    });
  }
  return out;
})()`);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-fuze-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const roomWarOf = () => {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
  return room ? room.host.core.war : null;
};
console.log(`The IN RANGE cue against the room, ${AIRFRAME}, rooms at ${rooms}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed: seed() });

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  console.log(`  info  room ${code}, flying`);
  await page.evaluate("window.__warDo('start', 'itaipu-1')");
  await page.until("window.__war().view.state === 'live'", 30000 + (itaipu1.prepMs ?? 0));
  await page.evaluate('window.__avionics.ai(true); true');
  const { view, seat } = await page.evaluate('window.__war()');
  const radius = fuzeM(AIRFRAME, 'standard');
  check('the room\'s view gives this seat the Striker\'s standard radius', view.fuze && view.fuze[seat] === radius,
    `view.fuze ${JSON.stringify(view.fuze)}, seat ${seat}, want ${radius} m`);

  /* The first Striker, from the room's own birth record once it is born. */
  const wave = itaipu1.waves.find((w) => w.kind === 'strike');
  const born = view.goAt + wave.at * 1000;
  await page.until(`window.__rooms().roomNow > ${born + 500}`, wave.at * 1000 + 30000);
  const birth = roomWarOf().match.agents.find((a) => a.kind === 'strike');
  const plan = planAgent(itaipu1, birth);
  console.log(`  info  Striker ${birth.id} born at go+${((birth.t0 - view.goAt) / 1000).toFixed(1)} s, route ${birth.route}, ${birth.n} in its wave`);
  const hull = hullFor(AIRFRAME);

  /* The point beside the path at t, `off` metres to its left, level, and
   * the yaw that faces the Striker coming. */
  const beside = (t, off) => {
    const p = poseAt(plan, t).p.slice();
    const q = poseAt(plan, t - 1000).p;
    const dx = p[0] - q[0];
    const dz = p[2] - q[2];
    const n = Math.hypot(dx, dz);
    return { at: [p[0] - (dz / n) * off, p[1], p[2] + (dx / n) * off], yaw: Math.atan2(dx / n, dz / n) };
  };

  const passes = [];
  for (const [name, off, meet] of [['outside', OUTSIDE_M, MEET_OUT_MS], ['inside', INSIDE_M, MEET_IN_MS]]) {
    const tMeet = birth.t0 + meet;
    if (!(tMeet < plan.tEnd - 2000)) {
      check(`${name} pass: the Striker is still on its way at the meeting`, false, `meets at ${tMeet}, route ends ${plan.tEnd}`);
      continue;
    }
    const b = beside(tMeet, off);
    await hold(page, b.at, b.yaw);
    const now = await page.evaluate('window.__rooms().roomNow');
    if (!(now < tMeet - 3000)) {
      check(`${name} pass: held in time`, false, `room ms ${now}, meeting at ${tMeet}`);
      continue;
    }
    /* Held still: once the room's latest pose of the seat is at the hold
     * point, it is the seat's pose all pass. */
    const settled = () => {
      const r = roomWarOf().seats.get(seat);
      const q = r && r.track.s.at(-1);
      return q && Math.hypot(q.px - b.at[0], q.py - b.at[1], q.pz - b.at[2]) < 0.5 ? { ...q } : null;
    };
    let pose = settled();
    for (let k = 0; !pose && k < 50; k += 1) {
      await page.sleep(100);
      pose = settled();
    }
    const frames = await record(page, birth.id, tMeet + 2500);
    await shot(page, `${name}-after`);
    const w = roomWarOf();
    const boom = w.log.find((e) => e.what === 'boom' && e.seat === seat && e.ids.includes(birth.id));
    passes.push({
      name, off, frames, pose, boom,
    });
  }

  for (const { name, off, frames, pose, boom } of passes) {
    console.log(`\n${name} pass, ${off} m off the Striker's path: ${frames.length} frames`);
    if (!pose) {
      check(`${name}: the room has the seat's pose at the hold point`, false);
      continue;
    }
    /* The room's distance on each frame the attacker was alive or still
     * drawn (the page hears its death a link's time after the boom). */
    const judged = frames.filter((f) => f.dist != null || !boom || f.at <= boom.t).map((f) => ({ ...f, room: hullDistance(hull, pose, ...poseAt(plan, f.at).p) }));
    const close = judged.filter((f) => f.room < 30);
    const off2 = close.filter((f) => f.dist == null || Math.abs(f.dist - f.room) > BAND_M);
    check(`${name}: the marker's distance is the room's to ${BAND_M * 100} cm on every frame under 30 m`, close.length > 0 && off2.length === 0,
      `${close.length} frames, room min ${Math.min(...close.map((f) => f.room)).toFixed(2)} m${off2.length ? `; ${off2.slice(0, 3).map((f) => `${f.at}: page ${f.dist}, room ${f.room.toFixed(3)}`).join('; ')}` : ''}`);
    const wrong = judged.filter((f) => Math.abs(f.room - radius) > BAND_M && f.cue !== (f.room <= radius));
    check(`${name}: IN RANGE exactly on the frames the room's distance is within ${radius} m`, wrong.length === 0,
      `${judged.filter((f) => f.cue).length} frames with the cue, ${wrong.length} wrong${wrong.length ? `: ${wrong.slice(0, 3).map((f) => `${f.at} cue ${f.cue} room ${f.room.toFixed(3)}`).join('; ')}` : ''}`);
    const avxStray = frames.filter((f) => f.avx && !f.any).length;
    check(`${name}: the Avionics HUD never says IN RANGE with nothing in range`, avxStray === 0,
      `${avxStray} stray, drawn on ${frames.filter((f) => f.avx).length} of ${frames.filter((f) => f.cue).length} frames with the cue; HUD up on ${frames.filter((f) => f.avxOn).length}, a primary track on ${frames.filter((f) => f.primary).length} of ${frames.length}, tracks at most ${Math.max(0, ...frames.map((f) => f.tracks))}, its clock ${frames.length ? `${frames[0].tS} to ${frames.at(-1).tS} s` : '-'}`);
    if (name === 'outside') {
      check('outside: no IN RANGE on any frame, and no detonation', !frames.some((f) => f.cue) && !boom,
        `${frames.filter((f) => f.cue).length} cue frames, boom ${boom ? boom.t : 'none'}`);
      continue;
    }
    const on = judged.findIndex((f) => f.cue);
    const firstOn = on < 0 ? null : judged[on];
    const lastOff = on > 0 ? judged[on - 1] : null;
    check('inside: the room detonated, between the last frame without the cue and the first with it',
      Boolean(boom && lastOff && firstOn) && lastOff.at < boom.t && boom.t <= firstOn.at,
      boom ? `boom at ${boom.t}, last without ${lastOff ? lastOff.at : '-'} (${lastOff ? lastOff.room.toFixed(2) : '-'} m), first with ${firstOn ? firstOn.at : '-'} (${firstOn ? firstOn.room.toFixed(2) : '-'} m)` : 'no boom');
  }
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await page.close();
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}, ${passed} passed`);
process.exit(failed ? 1 : 0);
