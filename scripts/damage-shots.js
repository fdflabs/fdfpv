/*
 * damage-shots.js: one spillway gate broken end to end on the real shell
 * and the real room (src/share/war/damage.js, edge/rooms/war.js strike,
 * src/render/breakage.js), two pages, pictures before and after.
 *
 * Then an intake (three Boats), a penstock and the yard (a gantry and three
 * transformers) the same way, each pictured before and after.
 *
 * Page A makes a room on Itaipu and starts mission 2 (the gates'); once it
 * is live, the room is made to take a Loiterer's warhead at gate-3's aim
 * point, three times, through war.js strike as an arrival does (the waves'
 * own Loiterers take minutes to come). Then:
 *
 *   A hears the damage events, takes the gate's chunks out of the drawn
 *     dam and its colliders (retired), and throws their pieces
 *   the opening reaches the water's hook (logged until the water lands)
 *     with the contract's fields
 *   no solid is left where a broken skin panel stood
 *   the draws: the breakage adds at most 2 calls to the view
 *   page B joins after: it hears the same events, takes the same chunks
 *     out, and its pieces at rest are where A's are, to the micrometre
 *   the static colliders are what they were before (retired, not added)
 *     and under the plan's 15 000
 *
 *   SIM_GPU=1 node scripts/damage-shots.js [outdir]   (build/damage-shots)
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
import { MISSIONS } from '../src/share/war/missions/index.js';
import { INTRO_MS } from '../src/share/war/intro.js';
import { attackerCharge } from '../src/share/war/damage.js';
import STRUCTURES from '../src/share/war/itaipu-chunks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'damage-shots');
const MISSION = MISSIONS['itaipu-2'];
const GATE = 'gate-3';
const STATIC_MAX = 15000;

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

function seedFor(colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'medium';
  s.graphicsAuto = false;
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.livery = { '5inch': { regions: { frame: colour } } };
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const frames = (p, n) => p.evaluate(`new Promise((r) => { let k = 0; const f = () => (++k >= ${n} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/* The gate from downstream, over the chute, and from the reservoir. */
const s = STRUCTURES[GATE];
const mid = s.chunks.filter((c) => c.k === 'skin').reduce((a, c, _, l) => a.map((v, i) => v + c.c[i] / l.length), [0, 0, 0]);
const n = s.frame.n;
const VIEWS = {
  down: [mid[0] + n[0] * 45 + 12, mid[1] + 14, mid[2] + n[2] * 45 - 4, mid[0], mid[1] - 2, mid[2]],
  up: [mid[0] - n[0] * 40 - 8, mid[1] + 10, mid[2] - n[2] * 40 + 3, mid[0], mid[1], mid[2]],
};

async function look(p, v) {
  await p.evaluate(`(window.__setCam(${VIEWS[v].join(',')}, 60), document.getElementById("ui").style.display = "none",
    document.querySelectorAll('.war-hud, .war-calls, .war-banner, .war-splash, canvas:not(#view)').forEach((n) => { n.style.visibility = 'hidden'; }), "")`);
  await frames(p, 30);
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-damage-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const roomOf = () => [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`one spillway gate broken, two pages, rooms at ${rooms}`);

const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
let b = null;
try {
  await a.until('window.__shellReady === true', 300000);
  await a.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  const code = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await a.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.evaluate(`window.__warDo('start', '${MISSION.id}')`);
  await a.until("window.__war().view.state === 'live'", INTRO_MS + 30000 + (MISSION.prepMs ?? 0));
  const before = await a.evaluate('window.__war().breakage');
  /* Every skin panel's solid, before. */
  const skins = s.chunks.map((c, i) => [c, i]).filter(([c]) => c.k === 'skin');
  const gapsBefore = await a.evaluate(`[${skins.map(([c]) => `window.__nearSolid(${c.c.join(',')}, 2)`).join(',')}]`);
  await look(a, 'down');
  const callsBefore = (await a.evaluate('window.__renderStats()')).calls;
  await shot(a, '1-before-downstream');
  await look(a, 'up');
  await shot(a, '2-before-upstream');
  await look(a, 'down');

  /* Three Loiterers' warheads at the gate's aim point, by the room
   * (damage-check's table: a Loiterer opens a gate in 3). */
  const room = roomOf();
  const core = room.host.core;
  const aim = MISSION.targets[GATE].at;
  for (let k = 0; k < 3; k += 1) {
    const t = Math.floor(core.roomMs(Date.now()));
    room.host.run(core.war.strike(core, aim, attackerCharge('loiter'), t, 'loiter'));
    room.host.run(core.war.changed(core));
    await a.sleep(1500);
  }
  const told = core.war.match.damage;
  check('the room breaks the gate: damage events, an opening', told.length > 0 && told.some((e) => e.openings.length),
    `${told.length} events, ${told.reduce((m, e) => m + e.chunks.length, 0)} chunks`);
  await a.until(`window.__war().breakage.heard === ${told.length}`, 10000);
  await frames(a, 20);
  await shot(a, '3-after-downstream');
  await a.sleep(6000);
  await shot(a, '4-after-settled-downstream');
  await look(a, 'up');
  await shot(a, '5-after-upstream');
  await look(a, 'down');
  const after = await a.evaluate('window.__war()');
  const gone = told.reduce((m, e) => m + e.chunks.length, 0);
  check('A takes the broken chunks out of the drawn dam', after.breakage.gone === gone, `${after.breakage.gone} of ${gone}`);
  check('A throws one piece a chunk', after.breakage.pieces === gone, `${after.breakage.pieces} pieces, ${after.breakage.edges} torn edges`);
  const o = after.openings.find((x) => x.target === GATE);
  check('the opening reaches the water\'s hook with the contract\'s fields', Boolean(o) && ['id', 'target', 'kind', 'at', 'sill', 'width_m', 'height_m', 'normal'].every((f) => f in o),
    JSON.stringify(o));
  check('A\'s colliders: the broken chunks\' retired, none added', after.breakage.retired > before.retired && after.breakage.staticColliders === before.staticColliders
    && after.breakage.staticColliders <= STATIC_MAX, `${after.breakage.retired} retired, ${after.breakage.staticColliders} static of ${STATIC_MAX}`);
  /* Where a broken skin panel stood, nothing solid; where one stands,
   * as solid as before. */
  const broken = new Set(told.flatMap((e) => e.chunks));
  const gapsAfter = await a.evaluate(`[${skins.map(([c]) => `window.__nearSolid(${c.c.join(',')}, 2)`).join(',')}]`);
  /* Nothing within the 2 m asked comes back as Infinity, which the page
   * hands over as null. */
  const far = (g) => (g == null ? Infinity : g);
  const holes = skins.map(([, i], k) => [broken.has(i), far(gapsBefore[k]), far(gapsAfter[k])]);
  check('where a skin panel broke the solid is gone, where one stands it is not', holes.some(([b]) => b)
    && holes.every(([b, g0, g1]) => g0 < 0.1 && (b ? g1 > 0.3 : g1 === g0)),
  holes.filter(([b]) => b).map(([, g0, g1]) => `${g0.toFixed(2)} to ${g1 === Infinity ? 'over 2' : g1.toFixed(2)} m`).join(', '));
  const callsAfter = (await a.evaluate('window.__renderStats()')).calls;
  check('the view stays inside the plan\'s 300 draws', callsAfter <= 300, `${callsBefore} before, ${callsAfter} after (smoke, dust, pieces, edges and their shadows)`);

  /* The other parts, each from the room as the gate was: an intake by
   * three Boats at its aim, a penstock by three FPVs at its aim, and the
   * yard by Strikers at one gantry's two posts (its beam falls, its
   * wires come down) and at three transformers (the yard is lost). */
  const yard = STRUCTURES['yard-right'];
  const beam = yard.chunks.findIndex((ch) => ch.k === 'beam' && ch.w && ch.w.length >= 2);
  const tanks = yard.chunks.map((ch, i) => [ch, i]).filter(([ch]) => ch.k === 'tank').slice(0, 3);
  const others = [
    { id: 'intake-7', kind: 'boat', at: [MISSION.targets['intake-7'].at], n: 3 },
    { id: 'penstock-7', kind: 'fpv', at: [MISSION.targets['penstock-7'].at], n: 3 },
    { id: 'yard-right', kind: 'strike', at: [...yard.chunks[beam].l.map((i) => yard.chunks[i].c), ...tanks.map(([ch]) => ch.c)], n: 1 },
  ];
  const droppedBefore = await a.evaluate('window.__mapScene().userData.itaipu.parts.town.town.power.dropped()');
  for (const o of others) {
    const st = STRUCTURES[o.id];
    const c = o.id === 'yard-right' ? yard.chunks[beam].c : st.chunks.reduce((m, ch, _, l) => m.map((v, i) => v + ch.c[i] / l.length), [0, 0, 0]);
    const cam = o.id === 'intake-7' ? [c[0] - 30, 240, c[2] - 60, c[0], 215, c[2]]
      : o.id === 'penstock-7' ? [c[0] + st.frame.n[0] * 70 + 20, c[1] + 25, c[2] + st.frame.n[2] * 70, c[0], c[1], c[2]]
        : [c[0] + 45, c[1] + 25, c[2] + 45, c[0], c[1] - 6, c[2]];
    VIEWS[o.id] = cam;
    await look(a, o.id);
    await shot(a, `7-${o.id}-before`);
    const was = core.war.match.damage.length;
    for (const p of o.at) {
      for (let k = 0; k < o.n; k += 1) {
        const t = Math.floor(core.roomMs(Date.now()));
        room.host.run(core.war.strike(core, p, attackerCharge(o.kind), t, o.kind));
        room.host.run(core.war.changed(core));
        await a.sleep(300);
      }
    }
    const mine = core.war.match.damage.slice(was);
    const n = mine.reduce((m, e) => m + e.chunks.length, 0);
    await a.until(`window.__war().breakage.heard === ${core.war.match.damage.length}`, 10000);
    await frames(a, 20);
    await a.sleep(4000);
    await shot(a, `8-${o.id}-after`);
    const v = core.war.match;
    const lost = v.down.includes(o.id);
    const open = mine.some((e) => e.openings.length);
    check(`${o.id}: ${o.n} ${o.kind} hit${o.n > 1 ? 's' : ''} at each aim break it${o.id === 'yard-right' ? ' and lose the yard' : ', open it and lose it'}`,
      n > 0 && lost && (o.id === 'yard-right' || open), `${mine.length} events, ${n} chunks, ${lost ? 'lost' : 'not lost'}${open ? ', opened' : ''}`);
  }
  const cut = core.war.match.cut ?? [];
  const droppedAfter = await a.evaluate('window.__mapScene().userData.itaipu.parts.town.town.power.dropped()');
  check('the fallen gantry\'s spans are down, out of the streamed colliders', cut.length >= 2 && droppedAfter > droppedBefore,
    `spans ${cut.join(' ')}, ${droppedBefore} to ${droppedAfter} caps out`);
  const all = await a.evaluate('window.__war().breakage');
  const told2 = core.war.match.damage;
  const gone2 = told2.reduce((m, e) => m + e.chunks.length, 0);
  check('A takes out every chunk the room broke', all.gone === gone2, `${all.gone} of ${gone2}, ${all.pieces} pieces drawn`);

  /* B joins after all of it. */
  b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
  await b.until('window.__shellReady === true', 300000);
  await b.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.until(`window.__rooms().phase === 'open' && window.__war().breakage.heard === ${told2.length}`, 60000);
  await b.until(`window.__war().breakage.gone === ${gone2}`, 60000).catch(() => {});
  await b.until('window.__war().breakage.moving === 0', 30000);
  await a.until('window.__war().breakage.moving === 0', 30000);
  const [wa, wb] = [await a.evaluate('window.__war().breakage'), await b.evaluate('window.__war().breakage')];
  if (wb.gone !== wa.gone) {
    console.log(`  B: ${JSON.stringify(await b.evaluate('(({ poses, ...x }) => x)(window.__war().breakage)'))}, log ${JSON.stringify((await b.evaluate('window.__war().log')).map((e) => e.type))}`);
  }
  const droppedB = await b.evaluate('window.__mapScene().userData.itaipu.parts.town.town.power.dropped()');
  check('B, joining after, takes out the same chunks and the same wires', wb.gone === wa.gone && JSON.stringify(wb.openings) === JSON.stringify(wa.openings) && droppedB === droppedAfter,
    `${wb.gone} gone, ${wb.openings.length} openings, ${droppedB} caps out`);
  const worst = wa.poses.reduce((m, pa, k) => {
    const pb = wb.poses[k];
    return Math.max(m, pb && pb.chunk === pa.chunk ? Math.hypot(pa.p[0] - pb.p[0], pa.p[1] - pb.p[1], pa.p[2] - pb.p[2]) : Infinity);
  }, 0);
  check('B\'s pieces at rest are where A\'s are', wb.pieces === wa.pieces && worst < 1e-6, `${wb.pieces} pieces, worst ${worst} m`);
  await look(b, 'down');
  await shot(b, '6-B-late-downstream');
  const errs = [a, b].flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log(`  FAIL  ${e && e.stack ? e.stack : e}`);
  failed += 1;
  for (const p of [a, b].filter(Boolean)) {
    console.log(`  breakage: ${JSON.stringify(await p.evaluate('(({ poses, ...x }) => x)(window.__war().breakage)').catch((x) => String(x)))}`);
    console.log(`  errors: ${p.errors.slice(0, 5).join(' | ')}`);
  }
} finally {
  await a.close();
  if (b) {
    await b.close();
  }
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
