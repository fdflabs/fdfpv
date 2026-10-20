/*
 * cards-check.js: what the shell's card screens draw, recorded so the code
 * behind them can be rebuilt and shown to draw and do exactly the same.
 *
 *     npm run cards:golden                      compare with tests/cards-golden/
 *     node scripts/cards-check.js --record      write tests/cards-golden/ afresh
 *
 * A golden, named as a -check.js harness because it drives the shell by its
 * internal screen ids inside page.evaluate text, which is what the noun
 * lint's harness exemption (scripts/noun-lint.js) exists for.
 *
 * ui-golden.js pins every screen's items and rows. It does not see the
 * cards: the home and hub cards, the rooms panel beside them and the
 * Tricks screen's caption. Those are drawn from items() by the card
 * methods of the Ui (src/ui/cards.js), and this check drives those methods
 * through window.__ui and records the DOM they leave: classes, text, the
 * attributes a screen reader or a stylesheet reads, and which card the
 * cursor lights.
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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'tests', 'cards-golden');
const RECORD = process.argv.includes('--record');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const PILOT = 'Ana Test';

/* In-page helpers every probe uses: a DOM snapshot, a wait, a recorder for
 * the Ui's outward hooks. */
const LIB = `
  const ui = window.__ui;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) { return true; }
      await sleep(25);
    }
    return false;
  };
  const ATTRS = ['role', 'aria-label', 'aria-current', 'aria-hidden', 'tabindex', 'alt', 'decoding', 'title', 'hidden'];
  const tidy = (v) => String(v).replace(location.origin, '').replace(/blob:[^"' ]+/g, '<blob>');
  const snap = (node, depth = 0) => {
    if (!node) { return null; }
    if (node.nodeType === 3) {
      const t = node.textContent;
      return t.trim() ? t : null;
    }
    if (node.nodeType !== 1) { return null; }
    const o = { tag: node.tagName.toLowerCase() };
    if (node.className && typeof node.className === 'string') { o.cls = node.className; }
    for (const a of ATTRS) {
      if (node.hasAttribute(a)) { o[a] = node.getAttribute(a); }
    }
    for (const [k, v] of Object.entries(node.dataset || {})) { o['data-' + k] = v; }
    const poster = node.style && node.style.getPropertyValue('--poster');
    if (poster) { o.poster = tidy(poster); }
    if (node.tagName === 'IMG' || node.tagName === 'IFRAME' || node.tagName === 'VIDEO') {
      const src = node.getAttribute('src');
      if (src != null) { o.src = tidy(src); }
    }
    if (node.tagName === 'CANVAS') { o.size = [node.width, node.height]; }
    if (node.classList && node.classList.contains('gate-card-mark')) {
      o.svg = node.innerHTML.length > 0;
      return o;
    }
    if (depth > 12) { return o; }
    const kids = [...node.childNodes].map((c) => snap(c, depth + 1)).filter((c) => c != null);
    if (kids.length) { o.kids = kids; }
    return o;
  };
  const text = (n) => (n ? n.textContent : null);
  const lit = (host) => (host ? [...host.children].map((c) => [c.classList.contains('on'), c.tabIndex, c.getAttribute('aria-current'), c.classList.contains('chosen')]) : null);
  const calls = [];
  for (const k of Object.keys(ui)) {
    if (!/^on[A-Z]/.test(k) || typeof ui[k] !== 'function') { continue; }
    ui[k] = (...args) => { calls.push([k, ...args.map((a) => (typeof a === 'object' ? typeof a : a))]); };
  }
`;

const probe = (body) => `(async () => { ${LIB} const out = {}; ${body}; return JSON.stringify(out); })()`;

/* THE TITLE: home and each hub, every cursor stop, a click on a card and a
 * click on a hub card's activity link. */
const TITLE = probe(`
  ui.show('title');
  ui.renderMenu();
  out.home = { hub: ui.screens.title.dataset.hub, cursor: ui.cursor, cards: snap(ui.gateCards), rooms: snap(ui.gateRooms) };
  const first = ui.gateCards.firstChild;
  ui.renderMenu();
  out.keptOnRender = ui.gateCards.firstChild === first;
  out.walk = [];
  const n = ui.items().length;
  for (let i = 0; i < n; i += 1) {
    ui.setCursor(i);
    out.walk.push({ i, cards: lit(ui.gateCards), rooms: [...ui.gateRooms.querySelectorAll('.gate-room')].map((r) => [r.classList.contains('on'), r.tabIndex]) });
  }
  out.hubs = {};
  for (const id of ['club', 'ops', 'hangar']) {
    ui.openHub(id);
    out.hubs[id] = { hub: ui.screens.title.dataset.hub, cursor: ui.cursor, cards: snap(ui.gateCards), lit: lit(ui.gateCards) };
  }
  ui.hub = null;
  ui.renderMenu();
  const link = ui.gateCards.querySelector('.gate-link');
  calls.length = 0;
  link.click();
  await sleep(0);
  out.linkClick = { link: link.className, screen: ui.screen, hub: ui.hub, calls: calls.slice() };
  ui.show('title');
  ui.hub = null;
  ui.renderMenu();
  calls.length = 0;
  const card = ui.gateCards.children[1];
  card.dispatchEvent(new Event('focus'));
  out.focus = { cursor: ui.cursor };
  card.click();
  await sleep(0);
  out.cardClick = { screen: ui.screen, hub: ui.hub, calls: calls.slice() };
  /* The rooms panel draws whatever lobby rows items() holds, and with no
   * rooms server here it holds none, so the rows are handed to it: a
   * heading, two rooms (one live), All rooms and Make a room. */
  ui.show('title');
  ui.hub = null;
  ui.renderMenu();
  const items = ui.items.bind(ui);
  const lobby = [
    { label: 'Rooms', value: '2 rooms, 5 pilots', lobby: 'head', action: 'noop' },
    { label: 'Fernando', value: '3 of 8', join: 'Join', live: true, lobby: 'room', action: 'room-a' },
    { label: 'Quiet one', value: '1 of 4', join: 'Join', live: false, lobby: 'room', action: 'room-b' },
    { label: 'All rooms', lobby: 'all', action: 'rooms-all' },
    { label: 'Make a room', value: '', lobby: 'make', action: 'rooms-make' },
  ];
  ui.items = () => [...items(), ...lobby];
  const picked = [];
  ui.select = () => { picked.push(ui.cursor); };
  try {
    ui.renderTitleRooms();
    out.rooms = snap(ui.gateRooms);
    const base = items().length;
    out.roomWalk = [];
    for (const i of [0, base + 1, base + 2, base + 4]) {
      ui.cursor = i;
      ui.markCards();
      out.roomWalk.push({ i: i - base, cards: lit(ui.gateCards), rooms: [...ui.gateRooms.querySelectorAll('.gate-room')].map((r) => [r.classList.contains('on'), r.tabIndex]) });
    }
    const keep = ui.gateRooms.firstChild;
    ui.renderTitleRooms();
    out.roomsKept = ui.gateRooms.firstChild === keep;
    ui.gateRooms.querySelectorAll('.gate-room')[2].click();
    out.roomPicked = picked.map((i) => i - base);
    lobby[2].value = '2 of 4';
    ui.renderTitleRooms();
    out.roomsRebuilt = ui.gateRooms.firstChild !== keep;
    out.roomsAfter = snap(ui.gateRooms);
    lobby.length = 0;
    ui.renderTitleRooms();
    out.roomsEmpty = snap(ui.gateRooms);
  } finally {
    /* Both were own properties shadowing the class's methods. */
    delete ui.items;
    delete ui.select;
  }
`);

/* THE TRICKS SCREEN's caption, at two cursor stops. */
const TRICKS = probe(`
  ui.show('tricks');
  const cap = () => ({ name: text(ui.trickName), meta: text(ui.trickMeta), how: text(ui.trickHow), view: text(ui.trickView) });
  out.first = cap();
  const rows = ui.trickRows();
  out.count = rows.length;
  out.kept = ui.trickRows() === rows;
  out.head = rows.slice(0, 3).map((t) => ({ name: t.name, how: t.how, view: t.view, status: t.status, points: t.points }));
  ui.setCursor(4);
  out.fifth = cap();
  ui.setCursor(9999);
  out.past = cap();
  ui.show('title');
`);

const FIXTURES = [
  { name: 'home', profile: null, pastGate: false, probes: { title: TITLE } },
  { name: 'race', profile: { airframeAsked: true }, pastGate: 'race', probes: { tricks: TRICKS } },
];

function seedFor(fx) {
  const lines = [
    "try { localStorage.setItem('fdfpv.pilotPick', '[1,2,42]'); localStorage.setItem('fdfpv.pilotFigure', '3'); } catch (e) { /* storage refused */ }",
  ];
  if (fx.profile) {
    lines.push(`try {
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(fx.profile))});
    } catch (e) { /* storage refused */ }`);
  }
  return lines;
}

let failed = 0;
for (const fx of FIXTURES) {
  if (ONLY.length && !ONLY.includes(fx.name)) {
    continue;
  }
  const page = await openPage({ root, width: 1600, height: 900, url: '/index.html?lang=en', seed: seedFor(fx) });
  const got = {};
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.evaluate(`(async () => {
      const pilot = await import('/src/share/pilot.js');
      pilot.writePilotName(${JSON.stringify(PILOT)});
      const ui = window.__ui;
      ${fx.pastGate ? `ui.firstRun = false; ui.craftGate = false; ui.mode = ${JSON.stringify(fx.pastGate)};` : ''}
      return true;
    })()`);
    for (const [name, code] of Object.entries(fx.probes)) {
      try {
        got[name] = JSON.parse(await page.evaluate(code));
      } catch (e) {
        got[name] = { error: String(e && e.message ? e.message : e) };
      }
    }
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    if (errs.length) {
      console.log(`  note  ${fx.name}: page errors: ${errs.slice(0, 3).join(' | ')}`);
    }
  } finally {
    await page.close();
  }
  const file = join(OUT, `${fx.name}.json`);
  const text = `${JSON.stringify(got, null, 1)}\n`;
  if (RECORD) {
    await mkdir(OUT, { recursive: true });
    await writeFile(file, text);
    console.log(`  wrote ${fx.name}: ${Object.keys(got).length} probes`);
    continue;
  }
  if (!existsSync(file)) {
    console.log(`  FAIL  ${fx.name}: no golden at ${file}; record one on the old code`);
    failed += 1;
    continue;
  }
  const want = JSON.parse(await readFile(file, 'utf8'));
  const diffs = [];
  for (const name of new Set([...Object.keys(want), ...Object.keys(got)])) {
    for (const part of new Set([...Object.keys(want[name] || {}), ...Object.keys(got[name] || {})])) {
      if (JSON.stringify((want[name] || {})[part]) !== JSON.stringify((got[name] || {})[part])) {
        diffs.push(`${name}.${part}`);
      }
    }
  }
  if (diffs.length) {
    failed += 1;
    console.log(`  FAIL  ${fx.name}: ${diffs.length} part(s) differ: ${diffs.slice(0, 16).join(', ')}`);
    await writeFile(join(process.env.TMPDIR || '/tmp', `cards-golden-${fx.name}.json`), text);
  } else {
    console.log(`  pass  ${fx.name}: ${Object.keys(got).length} probes identical`);
  }
}
console.log(failed ? `\nFAIL, ${failed} fixture(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
