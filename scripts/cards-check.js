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
 * cards: the home and hub cards, the rooms panel beside them, the world
 * cards with their video reels, the My tracks cards (the pilot's own, the
 * board's and the tracks server's), the standings table and the Tricks
 * screen's caption. Those are drawn from items() by the card methods of the
 * Ui (src/ui/cards.js), and this check drives those methods through
 * window.__ui and records the DOM they leave: classes, text, the attributes
 * a screen reader or a stylesheet reads, and which card the cursor lights.
 *
 * The network is stubbed in the page, never reached: the board and the
 * tracks server each answer from a canned body, or refuse the way a server
 * that is not running does, so both halves are pinned with the server
 * absent and present. A world preview recording is never let run to the
 * end; its start, its tear down on input and its restart are pinned by what
 * appears in the card.
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
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'tests', 'cards-golden');
const RECORD = process.argv.includes('--record');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const BOARD = 'http://127.0.0.1:3180';
const CLOUD = 'http://cloud.stub';
const PILOT = 'Ana Test';

/* Two of the pilot's own tracks, ids fixed so the cards key the same way
 * every run. The ring on the Alps is narrow enough that no plane fits it. */
const OWN = [
  mapTrackDocument({ id: 'own-alps', map: 'alps', centre: [0, 600, 0], radius: 40, name: 'Alpine ring' }),
  mapTrackDocument({ id: 'own-swiss', map: 'swiss2', gates: 1, name: 'One gate valley' }),
];

/* The board's listing, in the board's own wire shape. Every track has
 * times posted, and more than three of them, so pickFeaturedTracks ranks
 * rather than shuffles. */
const BOARD_TRACKS = [
  { id: 'b-flown', name: 'Most flown', author: 'pub', designer: 'Des Igner', gates: 7, times: 40, best: { lapMs: 31234, name: 'Zed' }, map: 'swiss2', planes: ['cub1400'], wing: { best: { lapMs: 45678, name: 'Wingo' }, times: 3 } },
  { id: 'b-quad', name: 'Quads only', author: 'Quinn', gates: 4, times: 12, best: { lapMs: 20500, name: 'Q' }, map: 'alps', planes: [] },
  { id: 'b-one', name: 'Single gate', author: '', gates: 1, times: 5, map: 'swiss2', planes: ['cub1400'] },
  { id: 'b-field', name: 'Old field', author: 'Old', gates: 9, times: 99, map: '', planes: [] },
  { id: 'b-gone', name: 'Retired world', author: 'Gone', gates: 3, times: 50, map: 'nowhere', planes: ['cub1400'] },
];

/* The times of b-flown, in posting order, quads and planes mixed. */
const BOARD_TIMES = [
  { id: 't1', name: 'Slow Sam', lapMs: 40100, hasGhost: false },
  { id: 't2', name: ` ${PILOT.toUpperCase()} `, lapMs: 33000, hasGhost: true },
  { id: 't3', name: 'Zed', lapMs: 31234, hasGhost: true },
  { id: 't4', name: 'Wingo', lapMs: 45678, hasGhost: false, craft: 'cub1400' },
  { id: 't5', name: '', lapMs: 38000, hasGhost: false },
  { id: 't6', name: 'Plane two', lapMs: 50000, hasGhost: true, craft: 'cub1400' },
  { id: 't7', name: 'No lap', lapMs: null },
];

const CLOUD_TRACKS = [
  { id: 'c-theirs', name: 'Their valley', author: 'Other', owner: 'someone', map: 'swiss2', gates: 5, updatedUtc: '2026-09-14T10:00:00Z', planes: ['cub1400'] },
  { id: 'c-gone', name: 'Their retired', author: '', owner: 'someone', map: 'nowhere', gates: 2, updatedUtc: '2026-08-01T10:00:00Z', planes: [] },
];

/* What the stub answers. `board` and `cloud` are null for a server that is
 * not running (the fetch rejects the way a refused connection does), or a
 * map from path to { status, body }. A path not in the map is a 404. */
const STUB = `(() => {
  const real = window.fetch.bind(window);
  window.__stub = { board: null, cloud: null, seen: [] };
  const answer = (table, path) => {
    if (!table) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    /* The pilot's own tracks are asked for by owner key, which is drawn
     * fresh for every browser profile, so that query has one entry. */
    const hit = table[path] || (/[?&]owner=/.test(path) ? table['?owner'] : table[path.replace(/\\?.*$/, '')]);
    if (!hit) {
      return Promise.resolve(new Response('{"error":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify(hit.body), { status: hit.status || 200, headers: { 'content-type': 'application/json' } }));
  };
  window.fetch = (input, init) => {
    const url = String(input && input.url ? input.url : input);
    for (const [origin, key] of [[${JSON.stringify(BOARD)}, 'board'], [${JSON.stringify(CLOUD)}, 'cloud']]) {
      if (url.startsWith(origin)) {
        window.__stub.seen.push(key + ' ' + url.slice(origin.length).replace(/owner=[^&]*/, 'owner=<key>'));
        return answer(window.__stub[key], url.slice(origin.length));
      }
    }
    return real(input, init);
  };
})();`;

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
  const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'doc' || k === 'document' ? '<doc>' : k === 'importedUtc' ? '<noise>' : x)));
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

/* MY TRACKS with the board and the tracks server both absent. */
const COURSES_ABSENT = probe(`
  window.__stub.board = null;
  window.__stub.cloud = null;
  ui.show('courses');
  await until(() => !ui.boardLoading);
  ui.renderMenu();
  out.local = plain(ui.localCourses);
  out.board = plain(ui.boardCourses);
  out.boardNote = text(ui.boardNote);
  out.localNote = text(ui.localNote);
  out.cards = snap(ui.courseCardHost);
  out.mapCards = (ui.mapCards || []).length;
  out.walk = [];
  for (let i = 0; i < 3; i += 1) {
    ui.setCursor(i);
    out.walk.push(lit(ui.courseCardHost));
  }
  const keep = ui.courseCardHost.firstChild;
  ui.renderMenu();
  out.keptOnRender = ui.courseCardHost.firstChild === keep;
`);

/* MY TRACKS with a board that answers, then one with nothing for this
 * aircraft, then one with nothing at all. */
const COURSES_BOARD = (tracks) => probe(`
  window.__stub.board = { '/api/tracks': { body: { tracks: ${JSON.stringify(tracks)} } } };
  window.__stub.cloud = null;
  window.__stub.seen.length = 0;
  ui.show('title');
  ui.show('courses');
  out.noteWhileReading = text(ui.boardNote);
  await until(() => !ui.boardLoading);
  ui.renderMenu();
  out.seen = window.__stub.seen.slice();
  out.board = plain(ui.boardCourses);
  out.boardNote = text(ui.boardNote);
  out.cards = snap(ui.courseCardHost);
  const at = ui.items().findIndex((it) => it.course && it.course.kind === 'board');
  if (at >= 0) {
    ui.setCursor(at);
    ui.select();
    await sleep(0);
    out.chosen = { subject: ui.cardSubject, lit: lit(ui.courseCardHost) };
    ui.back();
  }
`);

/* MY TRACKS with a tracks server, answering and not. */
const COURSES_CLOUD = probe(`
  localStorage.setItem('webfpv.tracks.origin', ${JSON.stringify(CLOUD)});
  window.__stub.board = null;
  window.__stub.cloud = { '?owner': { body: { tracks: [], next: '' } }, '/api/tracks': { body: { tracks: ${JSON.stringify(CLOUD_TRACKS)}, next: 'page2' } } };
  window.__stub.seen.length = 0;
  ui.show('title');
  ui.show('courses');
  out.noteWhileReading = text(ui.localNote);
  await until(() => !ui.cloudLoading && !ui.boardLoading);
  out.seen = window.__stub.seen.slice();
  out.cloud = plain(ui.cloudCourses);
  out.next = ui.cloudNext;
  out.localNote = text(ui.localNote);
  out.local = plain(ui.localCourses);
  out.cards = snap(ui.courseCardHost);
  window.__stub.cloud = { '/api/tracks': { body: { tracks: [{ ...${JSON.stringify(CLOUD_TRACKS[0])}, id: 'c-more', name: 'Page two' }], next: '' } } };
  window.__stub.seen.length = 0;
  ui.loadCloudCourses(true);
  ui.loadCloudCourses(true);
  await until(() => !ui.cloudLoading);
  out.more = { seen: window.__stub.seen.slice(), ids: ui.cloudCourses.map((t) => t.id), next: ui.cloudNext, cards: ui.courseCardHost.children.length };
  window.__stub.cloud = null;
  ui.loadCloudCourses();
  await until(() => !ui.cloudLoading);
  out.down = { localNote: text(ui.localNote), cloud: ui.cloudCourses.length };
  localStorage.removeItem('webfpv.tracks.origin');
`);

/* Seating: the pilot's own track, one that is gone, another pilot's off the
 * tracks server, and a copy of it opened in the builder. */
const SEATING = (doc) => probe(`
  const session = await import('/src/share/session.js');
  ui.show('courses');
  await until(() => !ui.boardLoading);
  out.local = ui.seatLocal('own-swiss');
  const seat = session.readShareImport();
  out.seat = plain(seat);
  out.share = plain(ui.share);
  out.gone = ui.seatLocal('no-such-track');
  out.goneNote = text(ui.localNote);
  localStorage.setItem('webfpv.tracks.origin', ${JSON.stringify(CLOUD)});
  window.__stub.cloud = { '/api/tracks/c-theirs': { body: { id: 'c-theirs', name: 'Their valley', author: 'Other', owner: 'someone', document: ${JSON.stringify(doc)} } } };
  let then = 0;
  const t = { id: 'c-theirs', name: 'Their valley' };
  ui.seatCloud(t, () => { then += 1; });
  out.cloudNoteWhileLoading = text(ui.localNote);
  await until(() => then > 0, 5000);
  out.cloudSeat = { then, note: text(ui.localNote), seat: plain(session.readShareImport()), share: plain(ui.share) };
  const opened = [];
  const openBuilder = ui.openBuilder;
  ui.openBuilder = (o) => { opened.push(o); };
  ui.cardSubject = 'cloud:c-theirs';
  ui.editCloudCopy(t);
  await until(() => opened.length > 0, 5000);
  out.copy = { opened: opened.map((o) => ({ map: o.map, sameId: o.id === 'c-theirs', hasId: Boolean(o.id) })), subject: ui.cardSubject, note: text(ui.localNote) };
  ui.seatCloud({ id: 'c-missing', name: 'Missing' }, () => { then += 100; });
  await until(() => /Missing/.test(text(ui.localNote)) && !/\\u2026|\\.\\.\\./.test(text(ui.localNote)), 5000);
  await sleep(50);
  out.cloudMissing = { then, note: text(ui.localNote) };
  opened.length = 0;
  ui.editCloudCopy({ id: 'c-missing', name: 'Missing' });
  await sleep(300);
  out.copyMissing = { opened: opened.length, note: text(ui.localNote) };
  ui.openBuilder = openBuilder;
  localStorage.removeItem('webfpv.tracks.origin');
`);

/* THE STANDINGS: a world track (the seated aircraft's board only), a field
 * track (every time), a board that fails, one with no times, and where
 * Back goes. */
const STANDINGS = probe(`
  const track = { id: 'b-flown', name: 'Most flown', author: 'pub', designer: 'Des Igner', gates: 7, map: 'swiss2' };
  window.__stub.board = { '/api/tracks/b-flown': { body: { times: ${JSON.stringify(BOARD_TIMES)} } }, '/api/tracks/b-field': { body: { times: ${JSON.stringify(BOARD_TIMES)} } }, '/api/tracks/b-empty': { body: { times: [] } } };
  const read = () => ({ screen: ui.screen, roomFrom: ui.roomFrom, returnTo: ui.returnTo, lede: text(ui.standingsLede), table: snap(ui.standingsTable), times: plain(ui.standingsTimes), error: ui.standingsError });
  ui.showStandings(null);
  out.none = ui.screen;
  ui.show('courses');
  ui.showStandings(track);
  out.reading = read();
  await until(() => ui.standingsLoading == null);
  out.world = read();
  ui.show('title');
  ui.showStandings({ id: 'b-field', name: 'Old field', author: 'Old', gates: 0, map: '' });
  await until(() => ui.standingsLoading == null);
  out.field = read();
  ui.showStandings({ id: 'b-empty', name: 'Empty', author: '', gates: 2, map: 'alps' });
  await until(() => ui.standingsLoading == null);
  out.empty = read();
  window.__stub.board = null;
  ui.showStandings({ id: 'b-down', name: 'Down', designer: 'D', gates: 1, map: 'alps' });
  await until(() => ui.standingsLoading == null);
  out.down = read();
  window.__stub.board = { '/api/tracks/b-flown': { body: { times: ${JSON.stringify(BOARD_TIMES)} } } };
  ui.showStandings({ id: 'b-slow', name: 'Slow', gates: 1, map: 'alps' });
  ui.showStandings(track);
  await until(() => ui.standingsLoading == null);
  out.superseded = read();
  ui.screen = 'paused';
  ui.showStandings(track);
  out.fromPaused = { roomFrom: ui.roomFrom, returnTo: ui.returnTo };
  await until(() => ui.standingsLoading == null);
  ui.show('title');
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

/* THE WORLD CARDS on Freestyle and their reels: the cards, a cached clip
 * played at once, the wait panel on a miss, a recording starting only after
 * the room is quiet, and input tearing it down and re-arming it. */
const REELS = probe(`
  const cache = await import('/src/share/orbitcache.js');
  const busy = setInterval(() => ui.noteInteraction(), 100);
  ui.show('freestyle');
  out.cards = snap(ui.freestyleCards);
  out.ids = (ui.mapCards || []).map((c) => c.id);
  await sleep(300);
  out.waiting = snap(ui.freestyleCards);
  out.freeze = ui.reelFreezeWorld;
  const cachedId = out.ids.find((id) => id !== ui.settings.map) || out.ids[0];
  const blob = new Blob([new Uint8Array(64)], { type: 'video/webm' });
  await cache.putClip(cache.clipKeyForMap(cachedId), blob);
  ui.startReels();
  await until(() => document.querySelector('.screen-freestyle video, .map-cards video'));
  await sleep(100);
  out.cached = { id: cachedId, shots: [...ui.freestyleCards.querySelectorAll('.map-reel')].map((s) => snap(s)) };
  const keep = ui.freestyleCards.firstChild;
  ui.setCursor(1);
  out.keptOnCursor = ui.freestyleCards.firstChild === keep;
  out.lit = lit(ui.freestyleCards);
  out.tags = [...ui.freestyleCards.querySelectorAll('.map-card-tag')].map(text);
  clearInterval(busy);
  const t0 = performance.now();
  const recorder = () => ui.freestyleCards.querySelector('iframe.map-reel-view, canvas.map-reel-view');
  await sleep(400);
  out.quietTooSoon = Boolean(recorder());
  out.started = await until(() => recorder(), 8000);
  out.startedAfterQuiet = performance.now() - t0 >= 800;
  const rec = recorder();
  out.recorder = rec ? { tag: rec.tagName.toLowerCase(), cls: rec.className, clip: rec.dataset.clip || null, title: rec.title || null, src: rec.tagName === 'IFRAME' ? tidy(rec.getAttribute('src') || '') : null } : null;
  out.freezeWhileRecording = ui.reelFreezeWorld;
  ui.noteInteraction();
  out.afterInput = { recorder: Boolean(recorder()), freeze: ui.reelFreezeWorld, shots: [...ui.freestyleCards.querySelectorAll('.map-reel')].map((s) => s.childElementCount) };
  out.rearmed = await until(() => ui.freestyleCards.querySelector('.map-reel-wait'), 4000);
  const busy2 = setInterval(() => ui.noteInteraction(), 100);
  await sleep(200);
  out.afterRearm = [...ui.freestyleCards.querySelectorAll('.map-reel')].map((s) => snap(s));
  ui.stopReels();
  out.stopped = { freeze: ui.reelFreezeWorld, shots: [...ui.freestyleCards.querySelectorAll('.map-reel')].map((s) => s.childElementCount) };
  const src = document.createElement('canvas');
  src.width = 64;
  src.height = 32;
  out.thumbs = [ui.paintMapThumbs(src) === undefined];
  ui.show('title');
  clearInterval(busy2);
`);

const FIXTURES = [
  { name: 'home', profile: null, pastGate: false, probes: { title: TITLE } },
  {
    name: 'race',
    profile: { airframeAsked: true },
    pastGate: 'race',
    probes: {
      'courses-absent': COURSES_ABSENT,
      'courses-board': COURSES_BOARD(BOARD_TRACKS),
      'courses-board-none-fly': COURSES_BOARD([BOARD_TRACKS[3], BOARD_TRACKS[4]]),
      'courses-board-empty': COURSES_BOARD([]),
      'courses-cloud': COURSES_CLOUD,
      seating: SEATING(OWN[1]),
      standings: STANDINGS,
      tricks: TRICKS,
      reels: REELS,
    },
  },
  {
    name: 'plane',
    profile: { airframeAsked: true, airframe: 'cub1400', flightMode: 'angle' },
    pastGate: 'race',
    probes: {
      'courses-board': COURSES_BOARD(BOARD_TRACKS),
      'courses-board-none-fly': COURSES_BOARD([BOARD_TRACKS[1], BOARD_TRACKS[3]]),
      standings: STANDINGS,
    },
  },
  {
    name: 'freestyle',
    profile: { airframeAsked: true, freestyleMap: 'swiss2', map: 'swiss2' },
    pastGate: 'freestyle',
    probes: { reels: REELS },
  },
];

function seedFor(fx) {
  const lib = Object.fromEntries(OWN.map((d) => [d.id, d]));
  const lines = [
    "try { localStorage.setItem('fdfpv.pilotPick', '[1,2,42]'); localStorage.setItem('fdfpv.pilotFigure', '3'); } catch (e) { /* storage refused */ }",
    `try { localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify(lib))}); } catch (e) { /* storage refused */ }`,
    STUB,
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
