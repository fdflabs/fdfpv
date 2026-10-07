/*
 * board-post-check.js: what the shell sends the board when a pilot posts,
 * and what it tells them, driven in the real page against a stand-in board.
 *
 *     node scripts/board-post-check.js
 *
 * The board's wire shapes are built in src/share/board.js; what src/main.js
 * decides is whether a post goes out at all, which lap and ghost it
 * carries, where it goes when the board has moved the track, and the line
 * the pilot reads afterwards. A tune swap (window.__setTune) is checked
 * here too, with its two ways of failing.
 *
 * The board is a fetch wrapper installed before the app runs: every request
 * to http://board.test is answered from the page and logged with its body,
 * so a post is read byte for byte and the board's answers (a rank, a 404, a
 * 500) are chosen per row. Nothing leaves the machine.
 *
 * The fixture ring (tests/fixtures/map-track-v4.json) is played through
 * Track mode and then given a board seat by hand, which is what the share
 * seat holds after a track is opened from the board. Laps are flown by
 * putting the craft through each gate (window.__placeCraft with a from
 * point, as scripts/build-check.js does).
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { frames } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe, formatTime } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { TUNES } from '../configs/registry.js';
import { LANG_KEY } from '../src/strings/index.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const SEAT_KEY = 'webfpv.share.import.v1';
const PENDING_KEY = 'webfpv.share.pending.v1';
const POSTED_KEY = 'webfpv.share.posted.v1';
const NAME_KEY = 'webfpv.pilot.name';
const BOARD = 'http://board.test';
const PILOT = 'Check Pilot';
const SEAT_ID = 'trk-seat0001';
const TWIN_ID = 'trk-twin0002';

let failed = 0;
let passed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
};

function text(key, vars) {
  const raw = en[key];
  if (raw === undefined) {
    throw new Error(`no string ${key}`);
  }
  return vars ? raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
}
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/*
 * The stand-in board. POSTs are answered from window.__board.posts in
 * order (a 200 with rank 7 when the queue is empty); GETs answer the track
 * list and the track's document (both under TWIN_ID, which is how a board
 * that republished the track looks) and an empty times table. A tune whose
 * file name is in window.__board.failTune answers 404.
 */
function boardSeed(track) {
  return `(() => {
    const doc = ${JSON.stringify(track)};
    const board = { log: [], posts: [], failTune: '' };
    window.__board = board;
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const plain = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (board.failTune && url.includes(board.failTune)) {
        return new Response('gone', { status: 404 });
      }
      if (!url.startsWith(${JSON.stringify(BOARD)})) {
        return plain(input, init);
      }
      const method = String(init.method || 'GET').toUpperCase();
      const path = url.slice(${JSON.stringify(BOARD)}.length);
      board.log.push({ method, path, body: init.body == null ? null : String(init.body) });
      if (method === 'POST') {
        const next = board.posts.shift() || { status: 200, body: { ok: true, rank: 7 } };
        return json(next.status, next.body);
      }
      if (path === '/api/tracks') {
        return json(200, { tracks: [{ id: ${JSON.stringify(TWIN_ID)}, name: doc.name, trackClass: 'full', gates: doc.sequence.length }] });
      }
      if (/^\\/api\\/tracks\\/[^/]+\\/document$/.test(path)) {
        return json(200, { id: ${JSON.stringify(TWIN_ID)}, name: doc.name, author: 'Someone', document: doc });
      }
      return json(200, { times: [] });
    };
    /* Every line the banner shows, in order, since a notice can be up for
     * less than a poll's interval behind a countdown. */
    window.__banners = [];
    const watch = () => {
      const b = document.querySelector('.banner');
      const t = window.__ui && window.__ui.banner ? window.__ui.banner.textContent : (b ? b.textContent : '');
      if (t && window.__banners[window.__banners.length - 1] !== t) {
        window.__banners.push(t);
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  })();`;
}

function seeds(track) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: 'track',
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
    fpsCap: 0,
    laps: 10,
  };
  return [`try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem(${JSON.stringify(LANG_KEY)}, 'en');
    localStorage.setItem(${JSON.stringify(NAME_KEY)}, ${JSON.stringify(PILOT)});
    localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify({ [track.id]: track }))});
  } catch (e) { /* storage refused */ }`, boardSeed(track)];
}

async function choose(page, action) {
  /* Track mode is one of Flight Club's cards (src/ui/ui.js HUBS): from
   * home, into Flight Club first, as scripts/track-mode-check.js does. */
  const home = await page.evaluate("window.__ui.items().some((it) => it.action === 'hub-club')");
  if (action.startsWith('way-') && home) {
    await choose(page, 'hub-club');
    await page.until("window.__ui.hub === 'club'", 5000);
  }
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  if (at < 0) {
    throw new Error(`no row ${action} on ${await page.evaluate('window.__ui.screen')}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
}

async function playRing(page, track) {
  const n = track.sequence.length;
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.until('window.__ui.onGate()', 60000);
  await choose(page, 'way-race-5inch');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'courses'", 20000);
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.course && it.course.track.id === ${JSON.stringify(track.id)})`);
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
  await page.until(`window.__ui.cardSubject && window.__ui.cardSubject.endsWith(${JSON.stringify(`:${track.id}`)})`, 5000);
  await choose(page, 'card-fly');
  await page.until(`window.__ui.screen === 'launch' && window.__map().ready && window.__map().id === ${JSON.stringify(track.map)} && window.__race().gates.length === ${n}`, 600000);
  await choose(page, 'launch-go');
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  /* The air start counts down and says GO over any notice; the rows start
   * once that is over. */
  await page.until("window.__banners.includes('GO') && window.__craftState().banner !== 'GO'", 60000);
  await frames(page, 10);
}

const gatesOf = (page) => page.evaluate(`window.__race().gates.map((g) => ({
  centre: [g.x, g.y + (g.apertures[0] ? g.apertures[0].centreY : 0), g.z],
  travel: [g.az.x, g.az.y, g.az.z],
}))`);

async function through(page, g) {
  const from = g.centre.map((v, i) => v - g.travel[i] * 1.2);
  const to = g.centre.map((v, i) => v + g.travel[i] * 1.2);
  await page.evaluate(`window.__placeCraft(${to.join(',')}, ${from.join(',')})`);
  await frames(page, 3);
  await page.sleep(250);
}

/* A whole lap from wherever the race stands: the start gate, then round. */
async function flyLap(page, G) {
  const before = await page.evaluate('window.__race().laps.length');
  for (let k = 0; k <= G.length; k += 1) {
    await through(page, G[k % G.length]);
  }
  await page.until(`window.__race().laps.length > ${before}`, 10000).catch(() => {});
}

/* Posts as the results row does, and waits for the line the pilot reads.
 * The banner is cleared first so an older line cannot answer. */
async function post(page, action, want) {
  await page.evaluate(`(() => { window.__board.log.length = 0; window.__banners.length = 0; window.__ui.onAction(${JSON.stringify(action)}); return true; })()`);
  return bannerShows(page, want);
}

/* The banner line equal to `want` if one is shown within 8 s, else every
 * line that was, joined, for the report. */
async function bannerShows(page, want) {
  const wanted = flat(want);
  let seen = [];
  for (let i = 0; i < 80; i += 1) {
    seen = (await page.evaluate('window.__banners.slice()')).map(flat);
    if (seen.includes(wanted)) {
      return wanted;
    }
    await page.sleep(100);
  }
  return seen.join(' | ');
}

const posts = (page) => page.evaluate("window.__board.log.filter((r) => r.method === 'POST')");
const store = (page, key) => page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || 'null')`);
const queue = (page, answers) => page.evaluate(`(window.__board.posts = ${JSON.stringify(answers)}, true)`);

async function main(track) {
  console.log('\nposting a time from a board seat');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds(track) });
  try {
    await playRing(page, track);
    const G = await gatesOf(page);

    /* Played from My tracks, the seat is the pilot's own. */
    let shown = await post(page, 'posttime', text('main.this_track_is_not_on_the'));
    say(shown === flat(text('main.this_track_is_not_on_the')) && (await posts(page)).length === 0, `a track of the pilot's own: "${shown}", nothing sent`);

    await page.evaluate(`(localStorage.setItem(${JSON.stringify(SEAT_KEY)}, JSON.stringify({ id: ${JSON.stringify(SEAT_ID)}, name: ${JSON.stringify(track.name)}, author: 'Someone', board: ${JSON.stringify(BOARD)}, document: ${JSON.stringify(track)} })), true)`);
    shown = await post(page, 'posttime', text('main.no_clean_lap_to_upload'));
    say(shown === flat(text('main.no_clean_lap_to_upload')) && (await posts(page)).length === 0, `a board seat with no lap: "${shown}"`);

    /* A time kept from an earlier visit posts bare, without a ghost. */
    await page.evaluate(`(localStorage.setItem(${JSON.stringify(PENDING_KEY)}, JSON.stringify({ trackId: ${JSON.stringify(SEAT_ID)}, lapMs: 65432, craft: '' })), true)`);
    await queue(page, [{ status: 200, body: { ok: true, rank: 4 } }]);
    shown = await post(page, 'posttime', text('main.uploaded', { name: PILOT, formatTime: formatTime(65432), rank: text('ui.rank', { rank: 4 }), withGhost: '', healed: '' }));
    let sent = await posts(page);
    let body = sent[0] ? JSON.parse(sent[0].body) : {};
    say(sent.length === 1 && sent[0].path === `/api/tracks/${SEAT_ID}/times`, `the pending time goes to ${sent[0] ? sent[0].path : 'nowhere'}`);
    say(JSON.stringify(Object.keys(body)) === JSON.stringify(['name', 'lapMs', 'key', 'sig']) && body.name === PILOT && body.lapMs === 65432
      && typeof body.key === 'string' && body.key.length > 20 && typeof body.sig === 'string' && body.sig.length > 20,
      `bare, signed: ${JSON.stringify({ ...body, key: body.key ? `${body.key.length} chars` : null, sig: body.sig ? `${body.sig.length} chars` : null })}`);
    say(shown === flat(`Uploaded ${PILOT}, 1:05.43. Rank 4.`), `the pilot reads "${shown}"`);
    say((await store(page, PENDING_KEY)) === null, 'the pending time is cleared');
    let postedRow = await store(page, POSTED_KEY);
    say(JSON.stringify(postedRow) === JSON.stringify({ [SEAT_ID]: { lapMs: 65432 } }), `the posted best is kept: ${JSON.stringify(postedRow)}`);
    const tp = await page.evaluate('window.__ui.timePosted');
    say(tp && tp.rank === 4, `and the results row is told: ${JSON.stringify(tp)}`);

    /* Off stock weight, nothing goes up. */
    await page.evaluate('(() => { window.__ui.settings.weight = 140; window.__setTune(window.__tune().id); return true; })()');
    shown = await post(page, 'posttime', text('main.laps_flown_at_percent_weight_stay', { runWeight: 140 }));
    say(shown === flat(text('main.laps_flown_at_percent_weight_stay', { runWeight: 140 })) && (await posts(page)).length === 0, `at 140 percent weight: "${shown}"`);
    await page.evaluate('(() => { window.__ui.settings.weight = 100; window.__setTune(window.__tune().id); return true; })()');
    await page.until('window.__air().run === 100', 10000).catch(() => {});

    /* A flown lap carries its recording. */
    await flyLap(page, G);
    const best = await page.evaluate('window.__race().bestLapMs()');
    const ghost = await page.evaluate("window.__ghostExport('best')");
    await queue(page, [{ status: 200, body: { ok: true, rank: 2 } }]);
    shown = await post(page, 'posttime', text('main.uploaded', { name: PILOT, formatTime: formatTime(best), rank: text('ui.rank', { rank: 2 }), withGhost: text('main.ghost_attached_ready_to_be_chased'), healed: '' }));
    sent = await posts(page);
    body = sent[0] ? JSON.parse(sent[0].body) : {};
    say(sent.length === 1 && JSON.stringify(Object.keys(body)) === JSON.stringify(['name', 'lapMs', 'ghost', 'key', 'sig'])
      && body.lapMs === Math.round(best) && body.ghost === ghost && body.name === PILOT,
      `a flown lap of ${best != null ? Math.round(best) : '?'} ms posts with its ghost: keys ${JSON.stringify(Object.keys(body))}, ghost ${body.ghost ? body.ghost.length : 0} chars`);
    say(shown === flat(text('main.uploaded', { name: PILOT, formatTime: formatTime(best), rank: text('ui.rank', { rank: 2 }), withGhost: text('main.ghost_attached_ready_to_be_chased'), healed: '' })), `the pilot reads "${shown}"`);
    postedRow = await store(page, POSTED_KEY);
    say(postedRow && postedRow[SEAT_ID] && postedRow[SEAT_ID].lapMs === Math.round(best), `the posted best moves to the faster lap: ${JSON.stringify(postedRow)}`);

    /* The board moved the track: one 404, the twin found by its layout,
     * the seat moved, and the post sent again once. */
    await queue(page, [{ status: 404, body: { error: 'no such track' } }, { status: 200, body: { ok: true, rank: 1 } }]);
    const healedLine = text('main.uploaded', { name: PILOT, formatTime: formatTime(best), rank: text('ui.rank', { rank: 1 }), withGhost: text('main.ghost_attached_ready_to_be_chased'), healed: text('main.the_board_had_republished_this_track') });
    shown = await post(page, 'posttime', healedLine);
    sent = await posts(page);
    const seat = await store(page, SEAT_KEY);
    say(sent.length === 2 && sent[0].path === `/api/tracks/${SEAT_ID}/times` && sent[1].path === `/api/tracks/${TWIN_ID}/times`,
      `a 404 retries once on the republished twin: ${sent.map((s) => s.path).join(', ')}`);
    say(sent.length === 2 && sent[0].body !== sent[1].body && JSON.parse(sent[1].body).lapMs === Math.round(best), 'the retry is signed again for the new id');
    say(seat && seat.id === TWIN_ID && seat.board === BOARD, `the seat moves to ${seat ? seat.id : 'nothing'}`);
    say(shown === flat(healedLine), `the pilot reads "${shown}"`);

    /* Any other failure is the board's sentence, and no retry. */
    await queue(page, [{ status: 500, body: { error: 'Board is resting' } }]);
    const failLine = text('main.could_not_upload_that_time', { v1: 'Board is resting' });
    shown = await post(page, 'posttime', failLine);
    say(shown === flat(failLine) && (await posts(page)).length === 1, `a 500: "${shown}", one request`);

    /* A run on the freestyle board: refused here before anything is sent. */
    const summary = await page.evaluate('window.__score()');
    const freeWant = summary && summary.timed === false ? 'main.free_flight_has_no_clock_so' : 'main.a_run_with_no_tricks_in';
    shown = await post(page, 'postrun', text(freeWant));
    say(shown === flat(text(freeWant)) && (await posts(page)).length === 0, `postrun from a race: "${shown}"`);

    /* A tune swap. */
    const t0 = await page.evaluate('({ tune: window.__tune(), key: window.__air().key })');
    const other = TUNES.find((t) => t.id !== t0.tune.id && t0.tune.offered.includes(t.id));
    await page.evaluate(`(window.__banners.length = 0, window.__setTune(${JSON.stringify(other.id)}), true)`);
    await page.until(`window.__tune().id === ${JSON.stringify(other.id)}`, 30000).catch(() => {});
    const t1 = await page.evaluate('({ tune: window.__tune(), key: window.__air().key, banner: window.__craftState().banner, laps: window.__race().laps.length })');
    say(t1.tune.id === other.id && t1.tune.name === `${other.id}.diff` && t1.key !== t0.key && t1.laps === 0,
      `swap to ${other.id}: the module flies it, the record key moves (${t1.key}), the run is reset`);
    const flyingLine = await bannerShows(page, text('main.flying', { name: other.name }));
    say(flyingLine === flat(text('main.flying', { name: other.name })), `and says "${flyingLine}"`);

    const third = TUNES.find((t) => t.id !== other.id && t.id !== t0.tune.id && t0.tune.offered.includes(t.id));
    await page.evaluate(`(window.__board.failTune = ${JSON.stringify(`/${third.id}.diff`)}, true)`);
    await page.evaluate(`(window.__banners.length = 0, window.__setTune(${JSON.stringify(third.id)}), true)`);
    const failTune = text('main.could_not_be_loaded', { name: third.name });
    const failLine2 = await bannerShows(page, failTune);
    const t2 = await page.evaluate('({ tune: window.__tune(), setting: window.__ui.settings.tune })');
    say(t2.tune.id === other.id && t2.setting === other.id && failLine2 === flat(failTune),
      `a tune that will not load leaves ${t2.tune.id} flying, the menu back on it, "${failLine2}"`);
    await page.evaluate("(window.__board.failTune = '', true)");


    await page.evaluate("(window.__banners.length = 0, localStorage.removeItem('fdfpv.fc.v1'), window.__setTune('custom'), true)");
    const noDump = text('main.no_saved_flight_controller_edits_to');
    const noDumpLine = await bannerShows(page, noDump);
    const t3 = await page.evaluate('({ tune: window.__tune(), setting: window.__ui.settings.tune })');
    say(t3.tune.id === other.id && t3.setting === other.id && noDumpLine === flat(noDump), `custom with no saved edits: "${noDumpLine}", still ${t3.tune.id}`);

    /* The horn: the run is put down for its results. */
    await page.evaluate('window.__scoreFinish()');
    const end = await page.evaluate('({ c: window.__craftState(), screen: window.__ui.screen })');
    say(end.c.mode === 'results' && !end.c.turtle && !end.c.turtleWait, `the horn puts the run down: mode ${end.c.mode}, screen ${end.screen}`);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|board\.test|404/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

const track = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
try {
  await main(track);
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
