/*
 * foot-mine-check.js: a hangar that's yours (docs/HANGAR-ROOM.md; the walk
 * plan's slice 7), in the real shell, headless. Two pilots signed in to
 * an accounts server of the check's own, each with their own data: a
 * level, saved builds, a wallet the server fills (an earned decal for
 * one, an earned and a bought finish for the other) and firsts. Each
 * walks into the hub's hangar with a real pointer, and:
 *
 *   1. the room is the size their level opened, and its bays hold
 *      exactly what their builds and unlocks say, in order, and nothing
 *      of the other pilot's;
 *   2. the paint chart hangs exactly what their wallet owns;
 *   3. the trophy wall holds their own firsts;
 *   4. the two rooms differ in size, bays and chart;
 *   5. a lap that takes the first pilot up a level grows the room the
 *      next time they walk in, and the build they saved stands in it;
 *   6. the second pilot's airfield hangar, every bay full, is within the
 *      room's draw call and triangle budget at Medium in the real shell
 *      (src/game/hangarroom.js ROOM_BUDGET; its textures are hangar:perf's
 *      to count, the shell's renderer holding the world's too);
 *
 * and no page error anywhere.
 *
 *   SIM_GPU=1 node scripts/foot-mine-check.js [outdir]
 *
 * Pictures go to outdir, never into the repository.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { startAccounts, seedSignedIn } from '../tests/lib/account.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { BUILDS_KEY, buildsBlob } from '../src/ui/builds.js';
import { ROOM_BUDGET, TIER_LEVELS } from '../src/game/hangarroom.js';
import { LEVEL_XP, everyFirst } from '../src/game/progress.js';
import { ACT1, INTERIOR, released } from '../src/game/campaign.js';
import { itemById } from '../src/game/economy.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || join(tmpdir(), 'foot-mine-check');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* A refused fetch (the board, the rooms server, which this check does not
 * start) is the page's network, not a fault: said, not failed, as the
 * other shell checks do. */
function faults(page) {
  for (const e of new Set(page.errors.filter((x) => x.startsWith('network:')))) {
    console.log(`note ${e}`);
  }
  return page.errors.filter((e) => !e.startsWith('network:'));
}

const firsts = (n) => Object.fromEntries(everyFirst().slice(0, n).map((f) => [f.key, true]));
const progress = (xp, n, challenges = {}, unlockAll = false) => ({
  v: 2, xp, courses: {}, challenges, seen: {}, casual: {}, firsts: firsts(n), unlockAll,
});
const build = (id, name, airframe, scheme, at) => ({
  id, name, airframe, fit: { livery: { scheme } }, created: at, updated: at,
});

/*
 * THE PILOTS. Wren: below the workshop's level (a garage corner, no
 * bays) once the shell has paid her mission's firsts, one build kept and
 * one on a plane that left, a mission flown to three stars (the ribbon
 * decal, earned). Kite: level 8 with Unlock all (the airfield hangar,
 * three bays, two of them his builds, as no plane is left to unlock), two
 * kept builds,
 * every released mission won with a star each (the gold finish, earned,
 * and the tokens their firsts pay buy the satin).
 */
const WREN = {
  callsign: 'Wren',
  seated: 'striker2500',
  graphics: 'low',
  progress: progress(0, 3),
  campaign: { v: 1, missions: { 'itaipu-1': { stars: 3, won: true, credits: 400 } }, earned: 400, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {} },
  /* The Cub build is one a pilot made before the recreational planes went
   * to Openflight: dropped on load, never turned into a Striker
   * (src/share/progressmerge.js currentBuild). */
  builds: [
    build('wrenbramor', 'Wren Bramor', 'bramor2300', 'hivis', 1760000000000),
    build('wrencub', 'Wren Cub', 'cub1400', 'l4', 1760000500000),
  ],
  buy: [],
};
const KITE = {
  callsign: 'Kite',
  seated: 'striker2500',
  graphics: 'medium',
  progress: progress(LEVEL_XP[7], 6, {}, true),
  campaign: {
    v: 1, missions: Object.fromEntries([...ACT1, ...INTERIOR].filter((m) => released(m.id)).map((m) => [m.id, { stars: 1, won: true, credits: 0 }])),
    earned: 0, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {},
  },
  builds: [
    build('kitestriker', 'Kite Striker', 'striker2500', 'olive', 1760000000000),
    build('kitebramor', 'Kite Bramor', 'bramor2300', 'hivis', 1760000500000),
  ],
  buy: ['finish:satin'],
};

/* The trophy wall's slots (src/render/hangarroomview.js TROPHY_ROWS 3 by
 * TROPHY_COLS 6): it stands as many firsts as it has slots. Kite's
 * campaign wins pay more firsts than that. */
const WALL_SLOTS = 18;

const accounts = await startAccounts();

async function seedAccount(pilot) {
  const acc = await accounts.signUp(`mine-${pilot.callsign}-${process.pid}`, pilot.callsign);
  const data = { progress: pilot.progress, builds: buildsBlob(pilot.builds) };
  if (pilot.campaign) {
    data.campaign = pilot.campaign;
  }
  await accounts.api('PUT', '/api/account/progress', { progress: { v: 1, data, stamps: {} } }, acc.session);
  /* The server pays what the record shows when the wallet is asked. */
  await accounts.api('GET', '/api/account/wallet', undefined, acc.session);
  for (const item of pilot.buy) {
    await accounts.api('POST', '/api/account/wallet/buy', { item }, acc.session);
  }
  const { wallet } = await accounts.api('GET', '/api/account/wallet', undefined, acc.session);
  return { acc, wallet };
}

/* How long a step of the shell may take: the shell's own load budget.
 * On a 2 core runner drawing in software (CI's SwiftShader), building
 * the room and its aircraft and compiling their programs on the first
 * frame took longer than the 20 s once given here; a fixed short wait
 * measured the machine, not the room. */
const SHELL_MS = 300000;

/* until, with how long it took and, when it gives up, where the shell was. */
async function need(page, expr, what) {
  const t0 = Date.now();
  try {
    await page.until(expr, SHELL_MS);
  } catch (err) {
    const at = await page.evaluate('JSON.stringify({ screen: window.__ui.screen, hub: window.__ui.hub, walk: Boolean(window.__ui.walk), stats: window.__walkStats && window.__walkStats() })');
    console.log(`stuck ${what} at ${at}; errors: ${page.errors.slice(0, 5).join(' | ')}`);
    throw err;
  }
  console.log(`  ${what}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

/* Walk in from the Hangar hub with a real pointer; what the shell built. */
async function walkIn(page, label) {
  await page.evaluate('window.__ui.hub = null; window.__ui.show("title"); window.__ui.renderMenu(); true');
  await page.sleep(300);
  check(`${label}: the Hangar hub card clicked`, await page.click('.gate-card.gate-card-hub-hangar'), 'clicked');
  await need(page, "window.__ui.hub === 'hangar'", `${label}: the Hangar hub`);
  check(`${label}: Walk in clicked`, await page.click('.gate-card.gate-card-hangar-walk'), 'clicked');
  await need(page, "window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", `${label}: the room drawn`);
  /* The wallet asked again as the room opened: its chips hung. */
  await need(page, '(() => { const s = window.__walkStats(); return s.mine && s.view.chart === s.mine.chart.finishes.length + s.mine.chart.decals.length; })()', `${label}: the chart hung`);
  await page.sleep(600);
  return page.evaluate('window.__walkStats()');
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}

/* The room's camera on its bays and chart, for the pictures: photo mode
 * aims at the stand; this stands the pilot back by the door instead. */
async function roomShot(page, name) {
  await page.evaluate('window.__ui.walk.orbit = Math.PI; true');
  await page.sleep(900);
  await shot(page, `${name}-door`);
  await page.evaluate('window.__ui.walk.orbit = 0; true');
  await page.sleep(900);
  await shot(page, `${name}-room`);
}

/* The page's own record of the pilot, read back: what the room must show. */
const own = `(() => {
  const p = window.__ui.progress.state;
  return {
    xp: p.xp,
    firsts: Object.keys(p.firsts || {}).filter((k) => p.firsts[k]).length,
    medals: Object.keys(p.medals || {}).length,
    builds: window.__ui.myBuilds.map((b) => b.id),
  };
})()`;

async function openPilot(pilot, seeded) {
  const settings = `try {
    if (!localStorage.getItem('foot-mine-seeded')) {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, { airframe: ${JSON.stringify(pilot.seated)}, airframeAsked: true, fpsCap: 0, graphics: ${JSON.stringify(pilot.graphics)}, graphicsAuto: false, flightMode: 'angle', progress: ${JSON.stringify(pilot.progress)} });
      localStorage.setItem(k, JSON.stringify(s));
      localStorage.setItem(${JSON.stringify(BUILDS_KEY)}, ${JSON.stringify(JSON.stringify({ v: 1, builds: pilot.builds }))});
      localStorage.setItem('foot-mine-seeded', '1');
    }
  } catch (e) { /* storage refused; the checks below will say so */ }`;
  const page = await openPage({
    root, width: 1600, height: 900, seed: [seedSignedIn(accounts.origin, seeded.acc), settings], url: `/index.html?tracks=${encodeURIComponent(accounts.origin)}`,
  });
  await page.until('window.__shellReady === true', SHELL_MS);
  await page.loaded(SHELL_MS);
  return page;
}

const rooms = {};
try {
  const wren = await seedAccount(WREN);
  const kite = await seedAccount(KITE);
  check('the server filled the wallets: Wren the earned ribbon, Kite the earned gold and the bought satin',
    same(Object.keys(wren.wallet.owned).sort(), ['decal:ribbon']) && same(Object.keys(kite.wallet.owned).sort(), ['finish:gold', 'finish:satin']),
    `Wren ${JSON.stringify(wren.wallet.owned)}, Kite ${JSON.stringify(kite.wallet.owned)}`);
  check('the satin is a bought item, the gold and ribbon earned', itemById('finish:satin').price > 0 && itemById('finish:gold').earn && itemById('decal:ribbon').earn, 'economy.js');

  /* WREN: the garage corner, then a level up to the workshop. */
  let page = await openPilot(WREN, wren);
  try {
    const s = await walkIn(page, 'Wren');
    const me = await page.evaluate(own);
    rooms.wren = s;
    check('Wren: the garage corner, her level\'s room', s.tier === 'garage', `${s.tier} at ${me.xp} XP`);
    check('Wren: no bays in a garage corner, nothing parked', s.view.bays === 0 && s.mine.bays.length === 0, JSON.stringify(s.mine.bays));
    check('Wren: the chart hangs her wallet, the ribbon only', same(s.mine.chart, { finishes: [], decals: ['ribbon'] }) && s.view.chart === 1, `${JSON.stringify(s.mine.chart)}, ${s.view.chart} chip(s)`);
    check('Wren: the trophy wall holds her own firsts and medals', s.view.trophies === me.firsts + me.medals && s.view.trophies >= 3, `${s.view.trophies} cups, ${me.firsts} firsts, ${me.medals} medals`);
    check('Wren: her build is in her own list, the one on the Cub that went to Openflight is not', same(me.builds, ['wrenbramor']), JSON.stringify(me.builds));
    await roomShot(page, 'wren-garage');

    /* XP through the progress path a pilot's run takes: up a level. The
     * events are a lap's, logged and folded as Progress.lap did until the
     * race left (the combat-only cut, 2026-10-20); the fold still pays
     * the laps already in pilots' logs. */
    await page.tap('Escape');
    await need(page, "window.__ui.screen !== 'walk'", 'Wren: out of the room');
    /* As many first laps as it takes, each a course flown once. */
    for (let k = 0; k < 8 && (await page.evaluate('window.__ui.progress.state.xp')) < LEVEL_XP[TIER_LEVELS.workshop - 1]; k += 1) {
      await page.evaluate(`(() => { const p = window.__ui.progress; p.event('lap', { ms: 40000, airframe: p.airframe, medal: null, kind: 'map', course: 'foot-mine-lap-${k}', n: 1, of: 1 }); p.foldFlight(); return true; })()`);
    }
    const after = await page.evaluate(own);
    check('Wren: the lap took her to the workshop\'s level', after.xp >= LEVEL_XP[TIER_LEVELS.workshop - 1], `${me.xp} -> ${after.xp} XP`);
    const grown = await walkIn(page, 'Wren, a level up');
    rooms.wrenUp = grown;
    check('Wren, a level up: the room grew to the workshop', grown.tier === 'workshop', grown.tier);
    check('Wren, a level up: her build on the workshop\'s bay', same(grown.mine.bays, [{ airframe: 'bramor2300', build: 'wrenbramor' }]) && same(grown.view.bayAirframes, ['bramor2300']),
      `${JSON.stringify(grown.mine.bays)}, drawn ${JSON.stringify(grown.view.bayAirframes)}`);
    await roomShot(page, 'wren-workshop');
    check('Wren: no page errors', faults(page).length === 0, faults(page).slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }

  /* KITE: the airfield hangar, every bay full. */
  page = await openPilot(KITE, kite);
  try {
    const s = await walkIn(page, 'Kite');
    const me = await page.evaluate(own);
    rooms.kite = s;
    check('Kite: the airfield hangar, his level\'s room', s.tier === 'airfield', `${s.tier} at ${me.xp} XP`);
    const want = [
      { airframe: 'bramor2300', build: 'kitebramor' },
      { airframe: 'striker2500', build: 'kitestriker' },
    ];
    check('Kite: his builds on the bays, the last saved first',
      same(s.mine.bays, want) && same(s.view.bayAirframes, want.map((b) => b.airframe)), `${JSON.stringify(s.mine.bays)}, drawn ${JSON.stringify(s.view.bayAirframes)}`);
    check('Kite: the chart hangs his wallet, the satin and the gold', same(s.mine.chart, { finishes: ['satin', 'gold'], decals: [] }) && s.view.chart === 2, `${JSON.stringify(s.mine.chart)}, ${s.view.chart} chip(s)`);
    check(`Kite: the trophy wall full, ${WALL_SLOTS} of his own firsts and medals`, me.firsts + me.medals > WALL_SLOTS && s.view.trophies === WALL_SLOTS, `${s.view.trophies} cups, ${me.firsts} firsts, ${me.medals} medals`);
    check('Kite: nothing of Wren\'s in his room', !JSON.stringify(s.mine).includes('wren'), JSON.stringify(s.mine));
    await page.sleep(1500);
    const v = (await page.evaluate('window.__walkStats()')).view;
    const b = ROOM_BUDGET.medium;
    check('Kite: the full airfield hangar within the Medium budget in the real shell: draw calls', v.calls <= b.calls, `${v.calls} of ${b.calls}`);
    check('Kite: and triangles', v.triangles <= b.tris, `${v.triangles} of ${b.tris}`);
    await roomShot(page, 'kite-airfield');
    check('Kite: no page errors', faults(page).length === 0, faults(page).slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }

  /* Two pilots, two rooms. */
  const w = rooms.wrenUp;
  const k = rooms.kite;
  check('the two rooms differ in size', w.tier !== k.tier, `${w.tier} and ${k.tier}`);
  check('in what stands on the bays', !same(w.mine.bays, k.mine.bays) && w.view.bays !== k.view.bays, `${w.view.bays} and ${k.view.bays}`);
  check('in the paint chart', !same(w.mine.chart, k.mine.chart), `${JSON.stringify(w.mine.chart)} and ${JSON.stringify(k.mine.chart)}`);
  check('and on the trophy wall', w.view.trophies !== k.view.trophies, `${w.view.trophies} and ${k.view.trophies}`);
} finally {
  await accounts.stop();
}
writeFileSync(join(out, 'foot-mine.json'), JSON.stringify(rooms, null, 1));
console.log(`pictures in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
