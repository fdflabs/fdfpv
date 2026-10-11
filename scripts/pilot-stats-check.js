/*
 * pilot-stats-check.js: Flight Club's pilot stats (src/ui/pilotstats.js,
 * docs/PILOT-STATS.md), read off the screen the way a pilot reads them.
 *
 *   node scripts/pilot-stats-check.js [outdir]
 *
 * Page EN, signed in to an accounts server of its own, 1280 by 720, a
 * profile seeded with known hours on four aircraft over two computers, a
 * level, medals, tracks lapped and two campaign wins: every number on the
 * panel is the one the seed makes. The arrows still walk the cards, Tab
 * never lands in the panel, and a click on it reaches nothing. Then a
 * second computer's hour goes up to the account, a sync runs, and the
 * total and the most flown aircraft move by that hour.
 *
 * Page ES, the same seed with ?lang=es: the same numbers in Spanish.
 *
 * Page EMPTY, a brand new pilot, in en and es: zeros, level 1 and the
 * one line nudge.
 *
 * A rooms server of the check's own is up, so Flight Club has its room
 * modes' cards as on the site: without one it shows three, and a layout
 * measured on three says nothing about six.
 *
 * Each at 390 by 844 and 360 by 640 too: the panel inside the window,
 * on no card, every card's tags clear of the command bar, no sideways
 * scroll. Pictures in outdir, which is not in the repository.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { firstsOf } from '../src/game/progress.js';
import { flightTotals } from '../src/share/flighttime.js';
import { SETTINGS_KEY } from '../src/ui/settings.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'pilot-stats');

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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/*
 * THE SEED. Two computers' time: Bramor 6 h 40 min, Interceptor 1 h 20
 * min, Cub 25 min, Skyhunter 5 min, 8 h 30 min in all. By mode: Track Day
 * 1 h 30 min, Free Flight 6 h 15 min, Streamer Combat 20 min, Catch the
 * Ace 10 min, Trick Battle 15 min. XP 700 is level 5 (600 to 900). Four
 * medals, three tracks lapped, two missions won with six stars.
 */
const FLIGHT = {
  home0001: { by: { bramor2300: { free: 22200, race: 1800 }, interceptor: { race: 3600, combat: 1200 }, cub1400: { tag: 600, jam: 900 } }, first: '2026-09-01' },
  laptop01: { by: { sky1800: { free: 300 } }, first: '2026-09-10' },
};
const CAMPAIGN = {
  missions: {
    'itaipu-1': { stars: 3, won: true, credits: 300 },
    'itaipu-2': { stars: 2, won: true, credits: 200 },
    'interior-1': { stars: 1, won: false, credits: 0 },
  },
  earned: 500,
};
/* The firsts the seed shows, paid already, so loading it adds no XP and
 * the level is the seed's. */
const FIRSTS = Object.fromEntries(firstsOf({ campaign: CAMPAIGN, seconds: flightTotals(FLIGHT).byAirframe }).map((f) => [f.key, true]));
const PROGRESS = {
  v: 2,
  xp: 700,
  courses: { 'track:trk-aaaa0001': true, 'track:trk-aaaa0002': true, 'track:trk-aaaa0003': true },
  medals: { 'track:trk-aaaa0001': 'gold', 'track:trk-aaaa0002': 'gold', 'track:trk-aaaa0003': 'silver', 'track:trk-aaaa0004': 'bronze' },
  firsts: FIRSTS,
  challenges: {},
  seen: {},
  casual: {},
  lessons: {},
  lessonsFlown: {},
  unlockAll: false,
};
const seed = (settings) => `try {
  if (!localStorage.getItem('stats.seeded')) {
    localStorage.setItem('stats.seeded', '1');
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(settings))});
  }
} catch (e) { /* storage refused: the check fails on the numbers */ }`;
const SEEDED = seed({ flightTime: FLIGHT, progress: PROGRESS, campaign: CAMPAIGN });

const WANT = {
  en: {
    time: '8 h 30 min', label: 'Total flight time', level: '5', xp: '700 of 900 XP',
    planes: '4', top: 'Most flown: Bramor C4EYE, 6 h 40 min',
    medals: '4', medalsSub: '2 Gold · 1 Silver · 1 Bronze', tracks: '3', won: '2', stars: '6 of 36 stars',
    modes: ['Track Day 1 h 30 min', 'Free Flight 6 h 15 min', 'Streamer Combat 20 min', 'Catch the Ace! 10 min', 'Trick Battle 15 min'],
  },
  es: {
    time: '8 h 30 min', label: 'Tiempo total de vuelo', level: '5', xp: '700 de 900 XP',
    planes: '4', top: 'La más volada: Bramor C4EYE, 6 h 40 min',
    medals: '4', medalsSub: '2 Oro · 1 Plata · 1 Bronce', tracks: '3', won: '2', stars: '6 de 36 estrellas',
    modes: ['Día de pista 1 h 30 min', 'Vuelo Libre 6 h 15 min', 'Combate de serpentinas 20 min', '¡Atrapa al As! 10 min', 'Batalla de Trucos 15 min'],
  },
};

/* Every number on the panel, as text. */
const READ = `(() => {
  const host = document.querySelector('.gate-stats');
  const q = (s) => { const n = host.querySelector(s); return n ? n.textContent : null; };
  const tile = (k, part) => q('[data-stat="' + k + '"] .gate-stat-' + part);
  return {
    shown: !host.hidden && getComputedStyle(host).display !== 'none',
    time: q('.gate-stats-time'), label: q('.gate-stats-time-label'), nudge: q('.gate-stats-nudge'),
    level: tile('level', 'value'), xp: tile('level', 'sub'),
    planes: tile('planes', 'value'), top: tile('planes', 'sub'),
    medals: tile('medals', 'value'), medalsSub: tile('medals', 'sub'),
    tracks: tile('tracks', 'value'), won: tile('war', 'value'), stars: tile('war', 'sub'),
    modes: [...host.querySelectorAll('.gate-stats-mode')].map((m) => m.querySelector('.gate-stats-mode-name').textContent + ' ' + m.querySelector('.gate-stats-mode-time').textContent),
  };
})()`;

/* The panel's box, every card's box and tags' foot, the command bar. */
const LAYOUT = `(() => {
  const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  return {
    w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
    bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
    panel: box(document.querySelector('.gate-stats')),
    time: document.querySelector('.gate-stats-time').textContent,
    cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => ({
      box: box(c), facts: Math.round(c.querySelector('.gate-card-facts').getBoundingClientRect().bottom),
    })),
  };
})()`;

/* Page errors, less the refused connections to the rooms server and the
 * board, which this check does not start (mode-cards-check.js the same). */
const errorsOf = (page) => page.errors.filter((e) => !e.startsWith('network:'));

const overlaps = (a, b) => !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(500);
}

async function toClub(page) {
  await page.until('window.__shellReady === true', 300000);
  /* The shell is up a frame before the map's world load shows the loader
   * again; on a software rasteriser that load outlasts click()'s 15 s wait. */
  await page.loaded(300000);
  await page.until("window.__ui.onGate() && document.querySelector('.gate-card-hub-club')", 60000);
  await page.click('.gate-card-hub-club .gate-card-name');
  await page.until("window.__ui.hub === 'club' && document.querySelectorAll('.screen-title .gate-card').length >= 6", 30000).catch(async (e) => {
    await shot(page, 'no-club');
    console.log(await page.evaluate("JSON.stringify({ screen: window.__ui.screen, hub: window.__ui.hub, cards: document.querySelectorAll('.screen-title .gate-card').length, dialog: [...document.querySelectorAll('[role=dialog]:not([hidden]), .name-dialog:not([hidden])')].map((d) => d.textContent.slice(0, 120)) })"));
    throw e;
  });
  await page.until("!document.querySelector('.gate-stats').hidden", 10000);
  await page.sleep(400);
}

/* At each phone size: the short panel inside the window and on no card,
 * the cards' tags clear of the bar, no sideways scroll. */
async function phones(page, tag) {
  for (const [w, h] of [[390, 844], [360, 640]]) {
    await resize(page, w, h);
    const l = await page.evaluate(LAYOUT);
    const inside = l.panel[0] >= 0 && l.panel[1] >= 0 && l.panel[2] <= l.w && l.panel[3] <= l.bar;
    const clear = l.cards.every((c) => !overlaps(c.box, l.panel) && c.box[0] >= 0 && c.box[2] <= l.w && c.facts <= l.bar);
    check(`${tag} ${w} by ${h}: the panel inside the window and on no card, every card's tags clear of the bar, no sideways scroll`,
      l.cards.length >= 6 && inside && clear && l.sw <= l.w && l.time.length > 0,
      `panel ${JSON.stringify(l.panel)} cards ${JSON.stringify(l.cards.map((c) => [...c.box, c.facts]))} bar ${l.bar} scroll ${l.sw}`);
    await shot(page, `${tag}-${w}x${h}`);
  }
  await resize(page, 1280, 720);
}

function numbers(got, want, tag) {
  for (const k of Object.keys(want)) {
    const g = JSON.stringify(got[k]);
    check(`${tag} ${k} reads ${JSON.stringify(want[k])}`, g === JSON.stringify(want[k]), g);
  }
}

console.log('Flight Club\'s pilot stats');
const rooms = await roomsServer('', 'pilotstats');
const at = (lang) => `/index.html?lang=${lang}&rooms=${encodeURIComponent(rooms.url)}`;
const en = await openPage({ root, url: at('en'), width: 1280, height: 720, seed: [SEEDED], account: 'StatsPilot' });
try {
  await toClub(en);
  const got = await en.evaluate(READ);
  check('en: the panel is up on Flight Club', got.shown);
  const names = await en.evaluate("[...document.querySelectorAll('.screen-title .gate-card-name')].map((n) => n.textContent)");
  check('en: Flight Club shows its room modes too, as on the site', ['Streamer Combat', 'Catch the Ace!', 'Trick Battle'].every((n) => names.includes(n)), names.join());
  numbers(got, WANT.en, 'en:');
  check('en: no nudge for a pilot with hours', got.nudge === null, got.nudge);
  const l = await en.evaluate(LAYOUT);
  check('en 1280 by 720: the panel between the brand and the cards, on no card, tags clear of the bar',
    l.cards.every((c) => !overlaps(c.box, l.panel) && c.facts <= l.bar) && l.panel[3] <= Math.min(...l.cards.map((c) => c.box[1])) && l.sw <= l.w,
    `panel ${JSON.stringify(l.panel)} cards ${JSON.stringify(l.cards.map((c) => [...c.box, c.facts]))} bar ${l.bar}`);
  await shot(en, 'en-1280x720');
  await resize(en, 1920, 1080);
  await shot(en, 'en-1920x1080');
  await resize(en, 1280, 720);

  /* NOT A FOCUS TRAP: nothing in it is a control, the arrows walk the
   * cards as before, Tab never stops in it, a click on it is nobody's. */
  const inert = await en.evaluate(`(() => {
    const host = document.querySelector('.gate-stats');
    return { focusable: host.querySelectorAll('button, a, input, [tabindex]').length, pointer: getComputedStyle(host).pointerEvents,
      items: window.__ui.items().filter((it) => it.card).length };
  })()`);
  check('en: nothing in the panel is focusable or takes the pointer', inert.focusable === 0 && inert.pointer === 'none', JSON.stringify(inert));
  const walked = [];
  for (let i = 0; i < inert.items; i += 1) {
    walked.push(await en.evaluate('(window.__ui.items()[window.__ui.cursor] || {}).card || null'));
    await en.tap('ArrowRight');
    await en.sleep(120);
  }
  check('en: Right walks every card in turn, as before', new Set(walked.filter(Boolean)).size === inert.items, walked.join());
  let inPanel = false;
  for (let i = 0; i < 12; i += 1) {
    await en.tap('Tab');
    await en.sleep(60);
    inPanel = inPanel || await en.evaluate("Boolean(document.activeElement && document.activeElement.closest('.gate-stats'))");
  }
  check('en: Tab never lands in the panel', !inPanel);
  const screen = await en.evaluate('window.__ui.screen');
  await en.click('.gate-stats-time');
  await en.sleep(300);
  check('en: a click on the panel opens nothing', await en.evaluate(`window.__ui.screen === ${JSON.stringify(screen)} && window.__ui.hub === 'club'`));

  /* A SYNC BRINGS ANOTHER COMPUTER'S HOUR: an hour on the Interceptor,
   * Track Day, from the office, put to the account; then this page syncs. */
  await en.until('window.__accountSync !== undefined', 10000);
  await en.evaluate('window.__accountSync()');
  const { accounts, account } = en;
  const held = (await accounts.api('GET', '/api/account/progress', undefined, account.session)).progress;
  const data = { ...held.data, flightTime: { ...held.data.flightTime, office01: { by: { interceptor: { race: 3600 } }, first: '2026-09-20' } } };
  await accounts.api('PUT', '/api/account/progress', { progress: { v: 1, data, stamps: held.stamps || {} } }, account.session);
  await en.evaluate('window.__accountSync()');
  await en.until("document.querySelector('.gate-stats-time').textContent === '9 h 30 min'", 20000).catch(() => {});
  const synced = await en.evaluate(READ);
  check('en: after a sync the office\'s hour is on the panel', synced.time === '9 h 30 min'
    && synced.modes[0] === 'Track Day 2 h 30 min' && synced.top === 'Most flown: Bramor C4EYE, 6 h 40 min', JSON.stringify([synced.time, synced.modes[0], synced.top]));
  await phones(en, 'en');
  check('en: no page error', errorsOf(en).length === 0, errorsOf(en).slice(0, 3).join(' | '));
} finally {
  await en.close();
}

const es = await openPage({ root, url: at('es'), width: 1280, height: 720, seed: [SEEDED] });
try {
  await toClub(es);
  const got = await es.evaluate(READ);
  check('es: the panel is up on Flight Club', got.shown);
  numbers(got, WANT.es, 'es:');
  const l = await es.evaluate(LAYOUT);
  check('es 1280 by 720: the panel on no card, every card\'s tags clear of the bar, no sideways scroll',
    l.cards.length >= 6 && l.cards.every((c) => !overlaps(c.box, l.panel) && c.facts <= l.bar) && l.sw <= l.w,
    `panel ${JSON.stringify(l.panel)} cards ${JSON.stringify(l.cards.map((c) => [...c.box, c.facts]))} bar ${l.bar}`);
  await shot(es, 'es-1280x720');
  await resize(es, 1920, 1080);
  await shot(es, 'es-1920x1080');
  await resize(es, 1280, 720);
  await phones(es, 'es');
  check('es: no page error', errorsOf(es).length === 0, errorsOf(es).slice(0, 3).join(' | '));
} finally {
  await es.close();
}

const NUDGE = {
  en: { xp: '0 of 60 XP', top: 'None yet', nudge: 'Take off on any card below and your hours start counting here.' },
  es: { xp: '0 de 60 XP', top: 'Ninguna todavía', nudge: 'Despega en cualquier tarjeta de abajo y tus horas empiezan a contar aquí.' },
};
for (const lang of ['en', 'es']) {
  const fresh = await openPage({ root, url: at(lang), width: 1280, height: 720 });
  try {
    await toClub(fresh);
    const got = await fresh.evaluate(READ);
    numbers(got, {
      time: '0 h 0 min', level: '1', planes: '0', medals: '0', tracks: '0', won: '0', ...NUDGE[lang],
    }, `empty ${lang}:`);
    const l = await fresh.evaluate(LAYOUT);
    check(`empty ${lang} 1280 by 720: the panel on no card, every card's tags clear of the bar`,
      l.cards.length >= 6 && l.cards.every((c) => !overlaps(c.box, l.panel) && c.facts <= l.bar) && l.sw <= l.w,
      `panel ${JSON.stringify(l.panel)} cards ${JSON.stringify(l.cards.map((c) => [...c.box, c.facts]))} bar ${l.bar}`);
    await shot(fresh, `empty-${lang}-1280x720`);
    await phones(fresh, `empty-${lang}`);
    check(`empty ${lang}: no page error`, errorsOf(fresh).length === 0, errorsOf(fresh).slice(0, 3).join(' | '));
  } finally {
    await fresh.close();
  }
}
await rooms.stop();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
