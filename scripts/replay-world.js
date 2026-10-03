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
 *   - the water: a first breach (gate-6) long before the clip, so the
 *     replay's own flood is forked from the live flood's checkpoint
 *     (live.js fork), and a second (gate-4) inside it; the replay's
 *     flood, stepped on the clip's clock, stands at the step the live one stood
 *     at for each row looked at, forwards and back, with the same water
 *     to the bit at every snapshot step both kept (host.js hashes), the
 *     breach pouring through the gate (its flow, for the roar); while it
 *     catches up it is not drawn or heard and the replay says so; and the
 *     live flood steps on with the room meanwhile, never rewound, so it
 *     stands at the room's clock when the replay closes
 *   - a spillway gate moving (the match's gate state, as src/main.js
 *     hands the map it): at every water row the replay's leaf stands as
 *     the live leaf stood at that row's clock, and the replay's water
 *     (forked with the gate state) is the live water to the bit
 *   - a strike that lands while the pilot is down (the pause menu: no
 *     row recorded) is in the replay, its explosion burning at its age at
 *     the first row after the pilot is back (warrec.js THE EXPLOSIONS)
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
import { str } from '../src/strings/index.js';
import { DELAY_MS } from '../src/sim/water/host.js';
import { DT_MS } from '../src/maps/itaipu/water/flood.js';

const MISSION = 'itaipu-4';
const WATER_TEXT = str('replay.water_catching_up');
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

  /* What a room says, at the room ms it is said: `at` (and an opening's)
   * stamped in the page as it is handed over, so no frame the page draws
   * stands past it before hearing it, as the room's own messages are.
   * Resolves the room ms stamped. */
  const now = () => a.evaluate('window.__rooms().roomNow');
  const hear = (m) => a.evaluate(`(() => {
    const m = ${JSON.stringify(m)};
    const t = window.__rooms().roomNow;
    if ('at' in m) {
      m.at = t;
    }
    for (const o of m.openings || []) {
      o.at = t;
    }
    window.__warHear(m);
    return t;
  })()`);
  const strike = mission.waves.find((w) => w.kind === 'strike');
  const born = (id, t) => hear({
    type: 'war', op: 'born', agents: [{ id, kind: 'strike', route: strike.route, t0: t, k: 0, n: 1, err: 0, target: strike.target }],
  });
  /* A gate hoisted toward 14 m open from now (hoist.js: half a metre a
   * minute), as the match's gate state would. */
  const gateAt = await a.evaluate("(() => { const t = window.__rooms().roomNow; window.__mapGates([{ gate: 'gate-2', at: t, open_m: 14 }]); return t; })()");
  /* The first breach, long before the clip: the live flood's water runs
   * from it and checkpoints (host.js, every 10 s) before the clip. */
  const gate6 = STRUCTURES['gate-6'];
  const torn6 = gate6.chunks.map((c, i) => i).filter((i) => gate6.chunks[i].r).slice(0, 4);
  const opening6 = openingOf('gate-6', gate6, gate6.chunks.map((c, i) => torn6.includes(i)), 0);
  const originAt = await hear({
    type: 'war', op: 'damage', seq: 899, at: 0, target: 'gate-6', chunks: torn6, fell: [], openings: [opening6], down: false, health: 0.8, p: gate6.chunks[torn6[0]].c, by: 0, cut: [],
  });
  await a.sleep(45000);
  let t = await now();
  const firstHit = await hear({
    type: 'war', op: 'dead', ids: [], at: 0, by: 0, why: 'arrive', p: AT['intake-3'].at, target: 'intake-3', hit: true,
  });
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
  const breachAt = await hear({
    type: 'war', op: 'damage', seq: 900, at: 0, target: 'gate-4', chunks: torn, fell: [], openings: [opening], down: false, health: 0.8, p: gate.chunks[torn[0]].c, by: 0, cut: [],
  });
  /* Long enough for the water to pass several snapshot steps (host.js). */
  await a.sleep(6000);
  /* The pilot down (the pause menu: the recorder keeps no row) while a
   * strike lands on a penstock, then back in the air. */
  await a.evaluate("window.__ui.onAction('pause'); true");
  await a.until("window.__craftState().mode === 'paused'", 5000);
  await a.sleep(400);
  const downAt = await hear({
    type: 'war', op: 'dead', ids: [], at: 0, by: 0, why: 'arrive', p: AT['penstock-5'].at, target: 'penstock-5', hit: true,
  });
  await a.sleep(1200);
  await a.evaluate("window.__ui.onAction('resume'); true");
  await a.until("window.__craftState().mode === 'flight'", 10000);
  await a.sleep(3000);

  const live = await a.evaluate('window.__warMapLogged()');
  const liveNow = await a.evaluate('window.__warMap()');
  console.log(`  info  ${live.length} live frames logged; the map now ${describe(liveNow)}`);
  check('the live map burned the intake and the switchyard and put districts out',
    liveNow && liveNow.targets['intake-3'] === 'fire' && liveNow.targets['yard-right'] === 'fire'
    && liveNow.levels[districtIndex('yard')] === 0 && liveNow.levels[districtIndex('hernandarias-w')] === 0
    && liveNow.targets['gate-4'] === 'smoke' && liveNow.broken.gone === torn.length + torn6.length && liveNow.broken.pieces.length > 0, describe(liveNow));
  const WATER = "(() => { const w = window.__map().parts.water; return { live: w.flood, replay: w.replayFlood, flows: window.__mapFlows(), water: window.__mapReplayWater(), room: window.__rooms().roomNow, toast: (() => { const v = window.__crashCam.live() ? window.__crashCam.h().view() : null; return v ? v.toast || null : null; })() }; })()";
  const waterLive = (await a.evaluate(WATER)).live;
  /* The flood's clock starts at its first event: the gate's hoist. */
  const floodFrom = Math.min(gateAt, originAt);
  check('the live flood took both openings and the gate state and stepped on', waterLive.state === 'ready' && waterLive.origin === floodFrom && waterLive.step > 2500,
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

  /* The strike that landed while the pilot was down: in the clip, and
   * burning at the first row after the pilot was back. */
  const downRow = await a.evaluate(`(() => {
    const c = window.__crashCam.h().clip();
    const k = c.war.clock.findIndex((x) => x > ${downAt});
    return { k, gap: k > 0 ? c.war.clock[k] - c.war.clock[k - 1] : null, booms: window.__crashCam.h().booms() };
  })()`);
  if (downRow.k > 0) {
    await a.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${downRow.k})); true`);
    await a.sleep(300);
  }
  const fx = await a.evaluate('window.__crashCam.h().boomFx()');
  check('a strike that landed while the pilot was down is in the replay, burning at the first row after', downRow.k > 0 && downRow.gap > 1000
    && fx && (fx.hotLive > 0 || fx.smokeLive > 0) && downRow.booms.length >= 4,
  `row ${downRow.k} after a gap of ${downRow.gap} ms with no row; ${JSON.stringify(fx)}; ${downRow.booms.length} explosions kept`);

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
      misses.push(`row ${k} at ${f.t} (replay at ${w && w.t}, clip ${await a.evaluate(`window.__crashCam.h().clipTime(${k})`)} prev ${await a.evaluate(`window.__crashCam.h().clipTime(${k - 1})`)}): replay ${describe(w)} map ${describe(map)} live ${describe(f)}${map && map.broken.pieces !== f.broken.pieces ? ` pieces ${map.broken.pieces.slice(0, 120)} live ${f.broken.pieces.slice(0, 120)}` : ''}`);
    }
    shown.add(Object.keys(f.targets).sort().join('+') || 'none');
  }
  console.log(`  info  ${order.length} rows looked at, ${rows.length} distinct; the targets seen: ${[...shown].join(' | ')}`);
  check('at every row looked at, forwards, backwards and in jumps, the replay and the map drawn are the live frame\'s', order.length >= 20 && wrong === 0,
    misses.slice(0, 3).join(' || ') || `${order.length} rows`);
  check('the rows looked at include the map before the first hit, with both fires, and with the gate broken', shown.has('gate-6') && [...shown].some((s) => s.includes('intake-3') && s.includes('yard-right'))
    && [...shown].some((s) => s.includes('gate-4')),
    [...shown].join(' | '));

  /* While the replay's flood catches up from the breach to the first
   * row looked at, it is not drawn or heard, and the replay says so. */
  const atOpen = (await a.evaluate(WATER)).live;
  const holding = [];
  /* From the checkpoint before the clip to the playhead near its end is
   * most of 40 s of water, at the frame budget (live.js): seconds. */
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    const w = await a.evaluate(WATER);
    holding.push({
      drawn: w.water ? w.water.drawn : null, flows: (w.flows || []).length, toast: w.toast ? w.toast.text : '', fork: w.water ? w.water.fork : null,
    });
    if (w.water && w.water.drawn) {
      break;
    }
    await a.sleep(50);
  }
  const caughtMs = 60000 - (until - Date.now());
  const held = holding.filter((x) => x.drawn === false);
  /* Forked from the live flood (live.js fork), from its checkpoint before
   * the clip: the first breach is 45 s before it. */
  const fork = holding[holding.length - 1].fork;
  check('the replay\'s water is forked from the live flood, and while it catches up it is held, unheard, and the replay says so',
    fork === 'checkpoint' && held.every((x) => x.flows === 0 && x.toast === WATER_TEXT) && holding[holding.length - 1].drawn === true,
  `forked from the ${fork}; held ${(caughtMs / 1000).toFixed(1)} s over ${held.length} polls, then ${holding[holding.length - 1].drawn ? 'drawn' : 'still held'}; ${JSON.stringify(held[0] || null)}`);
  /* The water: rows from just before the breach to the end, forwards
   * then back, each waited on until the replay's flood stands at it. */
  const waterRows = [];
  for (const { k, f } of rows) {
    if (f.t > breachAt - 2000 && !waterRows.some((r) => Math.abs(r.f.t - f.t) < 1200)) {
      waterRows.push({ k, f });
    }
  }
  const waterOrder = [...waterRows, ...waterRows.slice().reverse()];
  let dry = 0;
  let poured = 0;
  let lastLive = atOpen.step;
  const leaves = [];
  const wet = [];
  const waterMisses = [];
  for (const { k } of waterOrder) {
    await a.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${k})); true`);
    const anim = await a.evaluate(`window.__crashCam.h().clipAnim(${k})`);
    const want = Math.max(0, Math.floor((anim - DELAY_MS - floodFrom) / DT_MS));
    await a.until(`(() => { const r = window.__map().parts.water.replayFlood; const d = window.__mapReplayWater(); return r && r.state === 'ready' && r.step === ${want} && d && d.drawn; })()`, 20000).catch(() => {});
    const w = await a.evaluate(WATER);
    leaves.push({ anim, replay: await a.evaluate(`window.__mapLeaf('gate-2', ${anim})`) });
    const r = w.replay;
    const common = Object.keys(r ? r.hashes : {}).filter((s) => s in atOpen.hashes);
    const same = common.every((s) => r.hashes[s] === atOpen.hashes[s]);
    if (!r || r.step !== want || !same || r.origin !== floodFrom) {
      waterMisses.push(`row ${k}: replay ${r ? `${r.state} step ${r.step} origin ${r.origin}` : 'none'}, want step ${want}; ${common.filter((s) => r.hashes[s] !== atOpen.hashes[s]).length} of ${common.length} hashes differ`);
    }
    if (anim < breachAt + DELAY_MS) {
      dry += 1;
    }
    /* A row whose own step is past a snapshot step that held the water
     * moving, and compared there. */
    const after = Math.floor((breachAt + DELAY_MS - floodFrom) / DT_MS);
    if (want > after && common.some((s) => Number(s) >= after && Number(s) <= want)) {
      poured += 1;
    }
    if ((w.flows || []).some((x) => x.q > 0)) {
      wet.push(k);
    }
    /* The live flood, meanwhile, on with the room's clock: never back,
     * never rewound, and its water where it was. */
    const liveWant = Math.floor((w.room - 100 - DELAY_MS - floodFrom) / DT_MS);
    if (w.live.step < lastLive || w.live.rewinds !== atOpen.rewinds || w.live.restarts !== atOpen.restarts || w.live.step < liveWant - 10
      || Object.keys(atOpen.hashes).some((s) => s in w.live.hashes && w.live.hashes[s] !== atOpen.hashes[s])) {
      waterMisses.push(`row ${k}: the live flood at step ${w.live.step} (from ${lastLive}, the room's ${liveWant}), rewinds ${w.live.rewinds} from ${atOpen.rewinds}`);
    }
    lastLive = w.live.step;
  }
  console.log(`  info  water: ${waterOrder.length} rows, ${dry} before the second breach, ${poured} past a snapshot step after it, water flowing at ${wet.length}`);
  check('the replay\'s water stands where the live water stood at each row, to the bit at every snapshot both kept, forwards and back, the breach pouring',
    waterOrder.length >= 6 && waterMisses.length === 0 && dry >= 2 && poured >= 2 && wet.length >= 2, waterMisses.slice(0, 3).join(' || ') || `${waterOrder.length} rows`);

  await a.evaluate('window.__crashCam.h().api.close(); true');
  await a.until("window.__craftState().mode === 'flight'", 10000);
  await a.sleep(500);
  const waterBack = await a.evaluate(WATER);
  /* The live leaf at each row's clock, the replay closed: the same turn. */
  let leafWrong = 0;
  for (const l of leaves) {
    const liveLeaf = await a.evaluate(`window.__mapLeaf('gate-2', ${l.anim})`);
    if (!l.replay || !liveLeaf || l.replay.c !== liveLeaf.c || l.replay.s !== liveLeaf.s) {
      leafWrong += 1;
    }
  }
  const moved = leaves.length > 1 && leaves.some((l) => l.replay && leaves[0].replay && l.replay.s !== leaves[0].replay.s);
  check('a gate moving: at every water row the replay\'s leaf stands as the live one stood then, and it moved', leaves.length >= 6 && leafWrong === 0 && moved,
    `${leaves.length} rows, ${leafWrong} wrong; the gate hoisted from ${gateAt}`);
  check('closed, the replay\'s flood is gone and the live one stands at the room\'s clock, nothing left to catch up', waterBack.replay === null
    && waterBack.live.behind <= 10 && waterBack.live.rewinds === atOpen.rewinds,
  `live step ${waterBack.live.step}, ${waterBack.live.behind} behind, rewinds ${waterBack.live.rewinds}`);
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
