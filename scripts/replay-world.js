/*
 * replay-world.js: a war's map replayed as it was, on the real shell and
 * src/main.js's own wiring (src/replay/warrec.js world, src/share/war/
 * world.js; the owner: "i want the replays to show things as they
 * happened...explosions, outages, etc.").
 *
 *   SIM_GPU=1 npm run replay:world
 *
 * One headless page makes a private room on Itaipu, on a rooms server
 * this check runs in its own process, flies, and starts the night raid
 * (itaipu-4, whose lights the grid puts out). On the room's real match the
 * check hands the page's war (window.__warHear, the room socket's own way
 * in) what a room says when it happens: an intake hit, a kill with its
 * warhead's boom, an attacker into a power line, the switchyard hit, and
 * a warhead breaking four chunks off a spillway gate (src/render/
 * breakage.js: holes, rubble flying on the room clock) and tearing an
 * opening the reservoir pours through (the flood, docs/FLOOD.md). The
 * page logs the map it drew each live frame (window.__warMapLog). Then
 * its crash cam is opened and the playhead put on rows of the clip
 * forwards, backwards and in jumps.
 *
 * What must hold:
 *   - the clip kept the map (version 11) and its explosions
 *   - at every row looked at, the replay's map (crashCam warWorld) is the
 *     live frame's at that row's room ms exactly, and the map as drawn
 *     (its targets' states, its lights' levels, the chunks out and every
 *     piece of rubble where it lay, to the millimetre) is that too: before the
 *     first hit nothing burns, after it the intake burns, the yard's
 *     districts and a town past the struck line go dark in their turn
 *   - the water: the replay's own flood, made from the clip's opening and
 *     stepped on the clip's clock, stands at the step the live one stood
 *     at for each row looked at, forwards and back, with the same water
 *     to the bit at every snapshot step both kept (host.js hashes), the
 *     breach pouring through the gate (its flow, for the roar); and the
 *     live flood is not stepped or rewound while the replay plays
 *   - closed, the map is the live war's again, the newest live frame's
 *   - no page error
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
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import AT from '../src/share/war/itaipu-targets.js';
import { DISTRICTS, districtIndex } from '../src/share/war/grid.js';
import STRUCTURES from '../src/share/war/itaipu-chunks.js';
import { openingOf } from '../src/share/war/damage.js';
import { DELAY_MS } from '../src/sim/water/host.js';
import { DT_MS } from '../src/maps/itaipu/water/flood.js';

const MISSION = 'itaipu-4';
const mission = MISSIONS[MISSION];
const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
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

/* The same map: the same targets not whole, and each level the same as
 * the uniform holds it (f32). */
/* Targets compared as sets: the map lists them in its own order. */
const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
function sameMap(got, want) {
  if (!got || !want || canon(got.targets) !== canon(want.targets)) {
    return false;
  }
  return got.levels.length === want.levels.length && got.levels.every((x, i) => x === Math.fround(want.levels[i]))
    && JSON.stringify(got.broken) === JSON.stringify(want.broken);
}
const describe = (w) => (w ? `${JSON.stringify(w.targets)} dark ${w.levels.map((x, i) => (x < 1 ? `${DISTRICTS[i].id}=${x.toFixed(2)}` : null)).filter(Boolean).join(',')}${w.broken ? ` broken ${w.broken.gone}` : ''}` : 'none');

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-replay-world-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`A war's map replayed as it was, rooms at ${rooms}`);
const a = await openPage({
  root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed: seed(),
});

try {
  await a.until('window.__shellReady === true', 300000);
  await a.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  await a.tap('KeyZ');
  await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await a.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.evaluate(`window.__warDo('start', ${JSON.stringify(MISSION)})`);
  await a.until("window.__war().view.state === 'live'", 60000 + (mission.prepMs ?? 0));
  /* The night's rebuild done, and the pilot back in the air over the dam. */
  await a.until("window.__war().night.some((e) => e.night && e.done != null)", 600000);
  await a.until("window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  const over = AT['intake-3'].at;
  await a.evaluate(`window.__crashThrow({ x: ${over[0]}, y: ${over[1] + 120}, z: ${over[2] + 250}, yaw: Math.PI, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true, showCraft: true })`);
  await a.until('window.__rooms().spawning === false', SPAWN_MS + 10000);
  await a.evaluate('window.__warMapLog(true)');
  await a.sleep(1000);

  /* What a room says, at the room ms it is said. */
  const now = () => a.evaluate('window.__rooms().roomNow');
  const hear = (m) => a.evaluate(`window.__warHear(${JSON.stringify(m)})`);
  const strike = mission.waves.find((w) => w.kind === 'strike');
  const born = (id, t) => hear({
    type: 'war', op: 'born', agents: [{ id, kind: 'strike', route: strike.route, t0: t, k: 0, n: 1, err: 0, target: strike.target }],
  });
  let t = await now();
  await hear({
    type: 'war', op: 'dead', ids: [], at: t, by: 0, why: 'arrive', p: AT['intake-3'].at, target: 'intake-3', hit: true,
  });
  const firstHit = t;
  await a.sleep(2000);
  t = await now();
  await born(9001, t - 4000);
  await a.sleep(500);
  t = await now();
  const killAt = (await a.evaluate(`window.__warAt(${t})`)).find((x) => x.id === 9001);
  await hear({
    type: 'war', op: 'boom', seat: 99, at: t, p: killAt ? killAt.p : over,
  });
  await hear({
    type: 'war', op: 'dead', ids: [9001], at: t, by: 99, why: 'boom', p: killAt ? killAt.p : over,
  });
  await a.sleep(2000);
  t = await now();
  await born(9002, t - 4000);
  await a.sleep(500);
  t = await now();
  const town = DISTRICTS[districtIndex('hernandarias-w')].at;
  await hear({
    type: 'war', op: 'dead', ids: [9002], at: t, by: 0, why: 'wire', p: [town[0] + 20, 60, town[1] - 10],
  });
  await a.sleep(2000);
  t = await now();
  await hear({
    type: 'war', op: 'dead', ids: [], at: t, by: 0, why: 'arrive', p: AT['yard-right'].at, target: 'yard-right', hit: true,
  });
  await a.sleep(1500);
  t = await now();
  const gate = STRUCTURES['gate-4'];
  /* Four of the gate's skin plates: the hole the room would send. */
  const torn = gate.chunks.map((c, i) => i).filter((i) => gate.chunks[i].r).slice(0, 4);
  const opening = openingOf('gate-4', gate, gate.chunks.map((c, i) => torn.includes(i)), t);
  await hear({
    type: 'war', op: 'damage', seq: 900, at: t, target: 'gate-4', chunks: torn, fell: [], openings: [opening], down: false, health: 0.8, p: gate.chunks[torn[0]].c, by: 0, cut: [],
  });
  const breachAt = t;
  /* Long enough for the water to pass several snapshot steps (host.js). */
  await a.sleep(9000);

  const live = await a.evaluate('window.__warMapLogged()');
  const liveNow = await a.evaluate('window.__warMap()');
  console.log(`  info  ${live.length} live frames logged; the map now ${describe(liveNow)}`);
  check('the live map burned the intake and the switchyard and put districts out',
    liveNow && liveNow.targets['intake-3'] === 'fire' && liveNow.targets['yard-right'] === 'fire'
    && liveNow.levels[districtIndex('yard')] === 0 && liveNow.levels[districtIndex('hernandarias-w')] === 0
    && liveNow.targets['gate-4'] === 'smoke' && liveNow.broken.gone === torn.length && liveNow.broken.pieces.length > 0, describe(liveNow));
  const WATER = "(() => { const w = window.__map().parts.water; return { live: w.flood, replay: w.replayFlood, flows: window.__mapFlows() }; })()";
  const waterLive = (await a.evaluate(WATER)).live;
  check('the live flood took the opening and stepped on', waterLive.state === 'ready' && waterLive.origin === breachAt && waterLive.step > 200,
    `${waterLive.state}, origin ${waterLive.origin}, step ${waterLive.step}`);

  await a.evaluate('window.__crashCam.open(); true');
  await a.until("window.__craftState().mode === 'replay'", 10000);
  const kept = await a.evaluate(`(() => {
    const c = window.__crashCam.h().clip();
    return { world: c.war && c.war.world ? c.war.world : null, booms: window.__crashCam.h().booms().length };
  })()`);
  check('the clip kept the map and the explosions', kept.world && kept.world.length >= 1 && kept.world[kept.world.length - 1].hits.length >= 2
    && kept.world[kept.world.length - 1].cuts.length >= 1 && kept.world[kept.world.length - 1].damage.length >= 1 && kept.booms >= 2,
  JSON.stringify({ matches: kept.world && kept.world.length, booms: kept.booms }));

  /* The live frames the clip has a row for: before the first hit, and
   * spread through the rest. */
  const rows = [];
  for (const [i, f] of live.entries()) {
    if (i % 15 !== 0 && !(f.t < firstHit && i === live.findLastIndex((g) => g.t < firstHit))) {
      continue;
    }
    const k = await a.evaluate(`window.__crashCam.h().warWorldRow(${f.t})`);
    if (k >= 0) {
      rows.push({ k, f });
    }
  }
  const order = [...rows, ...rows.slice().reverse(), ...rows.filter((r, i) => i % 3 === 0).reverse(), ...rows.filter((r, i) => i % 2 === 1)];
  let wrong = 0;
  const misses = [];
  const shown = new Set();
  for (const { k, f } of order) {
    await a.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${k})); true`);
    await a.sleep(120);
    const [w, map] = await a.evaluate('[window.__crashCam.h().warWorld(), window.__warMap()]');
    const ok = w && w.t === f.t && canon(w.targets) === canon(f.targets) && w.levels.every((x, i) => x === f.levels[i]) && sameMap(map, f);
    if (!ok) {
      wrong += 1;
      misses.push(`row ${k} at ${f.t}: replay ${describe(w)} map ${describe(map)} live ${describe(f)}${map && map.broken.pieces !== f.broken.pieces ? ` pieces ${map.broken.pieces.slice(0, 120)} live ${f.broken.pieces.slice(0, 120)}` : ''}`);
    }
    shown.add(Object.keys(f.targets).join('+') || 'none');
  }
  console.log(`  info  ${order.length} rows looked at, ${rows.length} distinct; the targets seen: ${[...shown].join(' | ')}`);
  check('at every row looked at, forwards, backwards and in jumps, the replay and the map drawn are the live frame\'s', order.length >= 20 && wrong === 0,
    misses.slice(0, 3).join(' || ') || `${order.length} rows`);
  check('the rows looked at include the map before the first hit, with both fires, and with the gate broken', shown.has('none') && [...shown].some((s) => s.includes('intake-3') && s.includes('yard-right'))
    && [...shown].some((s) => s.includes('gate-4')),
    [...shown].join(' | '));

  /* The water: rows from just before the breach to the end, forwards
   * then back, each waited on until the replay's flood stands at it. */
  const atOpen = (await a.evaluate(WATER)).live;
  const waterRows = [];
  for (const { k, f } of rows) {
    if (f.t > breachAt - 2000 && !waterRows.some((r) => Math.abs(r.f.t - f.t) < 1200)) {
      waterRows.push({ k, f });
    }
  }
  const waterOrder = [...waterRows, ...waterRows.slice().reverse()];
  let dry = 0;
  let poured = 0;
  const wet = [];
  const waterMisses = [];
  for (const { k } of waterOrder) {
    await a.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${k})); true`);
    const anim = await a.evaluate(`window.__crashCam.h().clipAnim(${k})`);
    const want = Math.max(0, Math.floor((anim - DELAY_MS - breachAt) / DT_MS));
    await a.until(`(() => { const r = window.__map().parts.water.replayFlood; return r && r.state === 'ready' && r.step === ${want}; })()`, 20000).catch(() => {});
    const w = await a.evaluate(WATER);
    const r = w.replay;
    const common = Object.keys(r ? r.hashes : {}).filter((s) => s in atOpen.hashes);
    const same = common.every((s) => r.hashes[s] === atOpen.hashes[s]);
    if (!r || r.step !== want || !same || r.origin !== breachAt) {
      waterMisses.push(`row ${k}: replay ${r ? `${r.state} step ${r.step} origin ${r.origin}` : 'none'}, want step ${want}; ${common.filter((s) => r.hashes[s] !== atOpen.hashes[s]).length} of ${common.length} hashes differ`);
    }
    if (want === 0) {
      dry += 1;
    }
    /* A row whose own step is past a snapshot step that held the water
     * moving, and compared there. */
    if (want > 100 && common.some((s) => Number(s) >= 100 && Number(s) <= want)) {
      poured += 1;
    }
    if ((w.flows || []).some((x) => x.q > 0)) {
      wet.push(k);
    }
    /* The live flood, meanwhile, as it stood when the replay opened. */
    if (w.live.step !== atOpen.step || Object.keys(atOpen.hashes).some((s) => w.live.hashes[s] !== atOpen.hashes[s])) {
      waterMisses.push(`row ${k}: the live flood moved, step ${w.live.step} from ${atOpen.step}`);
    }
  }
  console.log(`  info  water: ${waterOrder.length} rows, ${dry} before the water moved, ${poured} past a snapshot step, the breach flowing at ${wet.length}`);
  check('the replay\'s water stands where the live water stood at each row, to the bit at every snapshot both kept, forwards and back, the breach pouring',
    waterOrder.length >= 6 && waterMisses.length === 0 && dry >= 2 && poured >= 2 && wet.length >= 2, waterMisses.slice(0, 3).join(' || ') || `${waterOrder.length} rows`);

  await a.evaluate('window.__crashCam.h().api.close(); true');
  await a.until("window.__craftState().mode === 'flight'", 10000);
  await a.sleep(500);
  const waterBack = await a.evaluate(WATER);
  check('closed, the live flood is drawn and steps on, and the replay\'s is gone', waterBack.replay === null && waterBack.live.step >= atOpen.step,
    `live step ${waterBack.live.step} from ${atOpen.step}`);
  const after = await a.evaluate('(() => { const l = window.__warMapLogged(); return { map: window.__warMap(), last: l[l.length - 1] }; })()');
  check('closed, the map is the live war\'s again', sameMap(after.map, after.last), `map ${describe(after.map)} live ${describe(after.last)}`);
  const errs = a.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log(`  page errors: ${a.errors.slice(0, 5).join(' | ')}`);
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await a.close();
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
