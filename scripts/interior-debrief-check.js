#!/usr/bin/env node
/*
 * interior-debrief-check.js: `SIM_GPU=1 npm run interior:debrief --
 * <outdir>`, the debrief over the squad's stills (src/ui/debrief.js;
 * docs/campaign/interior/TECH-NEEDS.md N8).
 *
 * In Node: which of Mission 1's items the debrief requires (the primary
 * objectives' captures and the symbol a star names), and which frame each
 * item gets from the room's captures and this device's stills.
 *
 * Then one headless page, room views injected into the client (the
 * room's end of a match, CONTRACT-P0.md 4.1):
 *   - a won match WITH the symbol captured by this pilot: the debrief
 *     shows this pilot's own still of it, a squadmate's capture as the
 *     room's record (who, what grade; the picture stays on their device),
 *     the analyst reconstruction for a required item nobody captured, an
 *     optional one as not captured, the star earned, and the next
 *     mission's state; and the result goes into the synced progress
 *   - a lost match WITHOUT the symbol: the reconstruction in its place,
 *     and for the host, play again from the checkpoint, which sends the
 *     contract's start
 *   - pictures of both, outside the repository; no page errors
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { MISSIONS } from '../src/share/ops/missions.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-debrief-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-debrief-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const M = MISSIONS['interior-1'];
console.log('the rules');
{
  const { debriefItems, debriefFrames } = await import('../src/ui/debrief.js');
  const { missionState } = await import('../src/ui/opscampaign.js');
  const { INTERIOR } = await import('../src/game/campaign.js');
  const req = debriefItems(M).filter((x) => x.required).map((x) => x.id);
  check('required: the primary objectives\' captures and the symbol a star names', req.join() === 'bridge,road,sheds,colonia,crossing,shelters,motorcycles,antenna,personnel,access,symbol', req.join());
  check('not required: the optional items a star wants all of', ['burned', 'lookout', 'solar'].every((id) => !req.includes(id)));
  check('a mission naming its own required items wins', debriefItems({ ...M, debrief: { required: ['bridge'] } }).filter((x) => x.required).map((x) => x.id).join() === 'bridge');
  const frames = debriefFrames(M, [
    {
      item: 'symbol', seat: 1, grade: 'clean', t: 5,
    },
    {
      item: 'bridge', seat: 2, grade: 'usable', t: 6,
    },
  ], [{
    item: 'symbol', grade: 'clean', image: {}, pending: false,
  }], 1);
  const of = (id) => frames.find((f) => f.id === id).kind;
  check('frames: my still mine, a squadmate\'s the record, a required gap the reconstruction, an optional gap missing', of('symbol') === 'mine' && of('bridge') === 'squad' && of('shelters') === 'rec' && of('burned') === 'missing');
  const states = INTERIOR.map((m) => missionState(m, false));
  check('the card: Mission 1 held, 2 to 5 Under development', states.join() === 'held,development,development,development,development', states.join());
  check('a developer\'s page plays Mission 1', missionState(INTERIOR[0], true) === 'available');
}

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, wingView: 'ball',
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

console.log('the page');
const page = await openPage({
  root, width: 1280, height: 720, url: '/index.html?rooms=off&missions=dev', seed,
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
const view = (id, over) => ({
  state: 'live',
  id,
  mission: 'interior-1',
  campaign: 'interior',
  goAt: 0,
  briefAt: null,
  f: 0,
  endAt: null,
  why: null,
  stage: {
    id: 'M1_CP_CAMP_FOUND', n: 5, at: 1000, title: 'ops.interior.m1.s5', text: null, music: null, lockRoles: false,
  },
  cards: [],
  contacts: [],
  sites: {},
  captures: [],
  flags: {},
  search: [],
  boundary: {},
  roles: {
    defs: [{ id: 'isr', core: true, guide: 'IBARRA' }], held: { 1: ['isr'] }, active: { 1: 'isr' }, locked: false, beat: null, swaps: [],
  },
  dials: {
    conceal: 'west', mark: 's1', road: 'north', firstOut: 'n',
  },
  result: null,
  checkpoint: null,
  restarted: null,
  ...over,
});
const caps = (list) => list.map(([item, seat, grade], i) => ({
  item, seat, grade, t: 1000 + i, at: 1000 + i,
}));
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);

  /* The campaign's page on a developer's page (?missions=dev): Mission 1
   * playable, its consent at Play, the start waiting for the map. */
  const CARD = `(() => {
    const box = document.querySelector('.ops-campaign-box');
    if (!box || document.querySelector('.name-dialog').hidden) { return null; }
    return {
      missions: [...box.querySelectorAll('.campaign-mission')].map((m) => ({ id: m.dataset.mission, state: m.dataset.state, play: m.querySelector('.campaign-play').textContent, on: !m.querySelector('.campaign-play').disabled })),
      note: (box.querySelector('.campaign-last') || {}).textContent || null,
    };
  })()`;
  const CONSENT = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && !document.querySelector('.ops-campaign-box') && /invented region/.test(d.textContent); })()";
  await page.evaluate('(window.__opsCampaign.open(), true)');
  await page.until(`${CARD} !== null`, 10000).catch(() => {});
  const card = await page.evaluate(CARD);
  check('the campaign page lists its five missions, no consent asked yet', card && card.missions.length === 5 && !(await page.evaluate('window.__ui.settings.interiorConsent === true')), JSON.stringify(card));
  check('a developer\'s page: Mission 1 playable, 2 to 5 Under development and not', card && card.missions[0].on && card.missions.slice(1).every((m) => !m.on && m.play === 'Under development'),
    JSON.stringify(card && card.missions.map((m) => m.play)));
  const PLAY1 = "(document.querySelector('[data-mission=\"interior-1\"] .campaign-play').click(), true)";
  await page.evaluate(PLAY1);
  await page.until(CONSENT, 10000).catch(() => {});
  check('Play asks the campaign\'s consent first (armed conflict, people seen from the air)', await page.evaluate(CONSENT));
  await page.sleep(700);
  await page.evaluate("(document.querySelector('.name-dialog .name-dialog-row button:not(.on)').click(), true)");
  await page.until(`${CARD} !== null`, 10000).catch(() => {});
  check('Back on it: the campaign\'s page again, nothing stored', Boolean(await page.evaluate(CARD)) && !(await page.evaluate('window.__ui.settings.interiorConsent === true')));
  await page.evaluate(PLAY1);
  await page.until(CONSENT, 10000).catch(() => {});
  await page.sleep(700);
  await page.evaluate("(document.querySelector('.name-dialog .name-dialog-row button.on').click(), true)");
  await page.until(`${CARD} !== null && ${CARD}.note !== null`, 10000).catch(() => {});
  const after = await page.evaluate(CARD);
  check('Continue: kept, and the page says the map is not in this build yet (no room made)', await page.evaluate('window.__ui.settings.interiorConsent === true') && after && /map is not in this build/.test(after.note || ''), JSON.stringify(after && after.note));
  await shot('interior-campaign-dev.png');
  await page.evaluate('(window.__opsCampaign.close(), true)');

  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);

  /* A won match, the symbol this pilot's own. */
  await page.evaluate(`(window.__ops.welcome({ seat: 1, host: 1, code: 'DEB000', ops: ${JSON.stringify(view(3))} }), true)`);
  await page.sleep(300);
  await page.evaluate("window.__ops.addStill('symbol', 'clean', 1000)");
  await page.sleep(300);
  const won = view(3, {
    state: 'won',
    why: 'landed',
    captures: caps([['symbol', 1, 'clean'], ['bridge', 2, 'usable'], ['road', 2, 'clean'], ['sheds', 2, 'clean'], ['colonia', 2, 'usable'], ['crossing', 2, 'clean']]),
    flags: { M1_SYMBOL_CAPTURED: true },
    result: {
      won: true, stars: 1, starIds: ['symbol'], flags: { M1_SYMBOL_CAPTURED: true }, restarted: null,
    },
  });
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(won)} }), true)`);
  await page.until('window.__debrief().open', 10000).catch(() => {});
  await page.sleep(500);
  const d1 = await page.evaluate('window.__debrief()');
  const k1 = Object.fromEntries(d1.frames.map((f) => [f.id, f]));
  check('the room\'s won match opens the debrief', d1.open && /MISSION COMPLETE/.test(d1.text));
  check('WITH the symbol: this pilot\'s own still of it', k1.symbol && k1.symbol.kind === 'mine' && k1.symbol.image, JSON.stringify(k1.symbol));
  const img = await page.evaluate("(() => { const i = document.querySelector('.debrief-still[data-item=\"symbol\"] img'); return i ? { src: i.src.slice(0, 5), w: i.naturalWidth } : null; })()");
  check('and its picture is drawn', img && img.src === 'blob:' && img.w > 0, JSON.stringify(img));
  check('a squadmate\'s capture is the room\'s record, credited, with no picture', k1.bridge && k1.bridge.kind === 'squad' && /CAPTURED BY/.test(d1.text) && !k1.bridge.image);
  check('a required item nobody captured: the analyst reconstruction, marked', k1.shelters && k1.shelters.kind === 'rec' && /Not a capture/.test(d1.text));
  check('an optional item nobody captured: not captured', k1.burned && k1.burned.kind === 'missing');
  check('the star earned, and the next mission\'s state', /★ {2}HISTORICAL SYMBOL/.test(d1.text) && /Eyes in the Forest · Under development/.test(d1.text), d1.text.slice(0, 200));
  check('no play again on a win', !d1.buttons.includes('again') && d1.buttons.includes('continue'));
  const prog = await page.evaluate("(window.__ui.settings.campaign && window.__ui.settings.campaign.missions['interior-1']) || null");
  const flags = await page.evaluate('(window.__ui.settings.campaign && window.__ui.settings.campaign.flags) || null');
  check('the result goes into the synced progress: stars and the script\'s flag', prog && prog.won === true && prog.stars === 1 && flags && flags.M1_SYMBOL_CAPTURED === true, JSON.stringify({ prog, flags }));
  await shot('debrief-won-with-symbol.png');
  await page.evaluate("(document.querySelector('.debrief button[data-act=\"continue\"]').click(), true)");
  await page.sleep(300);
  check('continue closes it', !(await page.evaluate('window.__debrief().open')));

  /* A lost match, no symbol. */
  await page.evaluate(`(window.__ops.welcome({ seat: 1, host: 1, code: 'DEB000', ops: ${JSON.stringify(view(4))} }), true)`);
  await page.sleep(300);
  const lost = view(4, {
    state: 'lost',
    why: 'track',
    captures: caps([['bridge', 1, 'clean']]),
    result: {
      won: false, stars: 0, starIds: [], flags: {}, restarted: null,
    },
    checkpoint: { stage: 'M1_CP_CONTACT_FOUND', n: 4, title: 'ops.interior.m1.s4' },
  });
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(lost)} }), true)`);
  await page.until('window.__debrief().open', 10000).catch(() => {});
  await page.sleep(500);
  const d2 = await page.evaluate('window.__debrief()');
  const k2 = Object.fromEntries(d2.frames.map((f) => [f.id, f]));
  check('WITHOUT the symbol: the reconstruction frame in its place', k2.symbol && k2.symbol.kind === 'rec', JSON.stringify(k2.symbol));
  check('the failure said with its reason', /MISSION FAILED · The contacts were lost/.test(d2.text), d2.text.slice(0, 120));
  check('the host may play again from the checkpoint', d2.buttons.includes('again'));
  await shot('debrief-lost-no-symbol.png');
  await page.evaluate("(document.querySelector('.debrief button[data-act=\"again\"]').click(), true)");
  const sent = await page.evaluate('window.__ops.sent().slice(-1)[0]');
  check('which sends the contract\'s start from the checkpoint', sent && sent.op === 'start' && sent.mission === 'interior-1' && sent.from === 'checkpoint', JSON.stringify(sent));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
