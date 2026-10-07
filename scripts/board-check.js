/*
 * board-check.js: the leaderboard is part of the game, proved against a
 * real board. Starts the sibling leaderboard repository's server on a
 * scratch file, publishes eight tracks and signed, flown lap times into it,
 * asserts that it refuses an unsigned lap and takes a signed record lap
 * carrying its ghost, then opens the simulator pointed at that board and
 * asserts what the Race room, the in-game Standings screen and the ghost
 * rival row show. Skips when the sibling repository is not checked out.
 *
 *     node scripts/board-check.js      (npm run lint:board)
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

/*
 * Two reports were one defect. The Race room showed only the five most
 * flown tracks and told the pilot to "Open the board" for the rest (a room
 * called Race that declines to list the races), and "Open the board" is
 * jargon that leaves the game for a page whose own way back reloads the
 * simulator at the title and drops what was seated. Neither can be checked
 * without a board. shell-check.js runs with no board and reports refused
 * fetches as a note, which is right for the shell's structure and blind to
 * all of this, so this check brings its own board.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { freePort } from '../tests/lib/roomsserver.js';
import { syntheticLapBytes } from '../tests/lib/synthlap.js';
import { createIdentity, memoryStorage } from '../src/share/identity.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { DEFAULT_AIRFRAME } from '../configs/airframes.js';

/* Picked at run time: a fixed port collided across sessions, and the second
 * board's failure to bind was silent, so its check drove the first
 * session's board. */
const port = await freePort();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardRepo = join(dirname(root), 'fdfpv-leaderboard');
const boardEntry = join(boardRepo, 'src', 'server.js');
const origin = `http://127.0.0.1:${port}`;

/* Eight, more than the five the room used to cap at, so "all of them" is a
 * measurably different number from "the featured ones". */
const TRACKS = [
  ['trk-c0000001', 'Bluegrass Circuit', 14, 'mothcircuit'],
  ['trk-c0000002', 'Celtic Riser', 22, 'hendrix fpv'],
  ['trk-c0000003', 'Fractal Current', 9, 'pinerun'],
  ['trk-c0000004', 'Copper Gully', 11, 'sugarK'],
  ['trk-c0000005', 'Shroom Spiral', 17, 'bandolier'],
  ['trk-c0000006', 'Neon Horizon', 12, 'mothcircuit'],
  ['trk-c0000007', 'Barnstorm Break', 8, 'pinerun'],
  ['trk-c0000008', 'Long Paddock', 19, 'sugarK'],
].map(([id, name, gates, author]) => ({ id, name, gates, author }));
const PILOTS = ['sugarK', 'mothcircuit', 'pinerun', 'hendrix fpv', 'bandolier', 'tinnie'];
const ME = 'sugarK';
const GHOST_PILOT = 'ghostrider';
/* m/s. Each seeded lap on a track is flown one step slower than the one
 * before, so a track's times are distinct and in posting order, and the
 * record lap is flown faster than any of them, so it is its track's
 * fastest. Half steps on purpose: at 12 m/s the 19 and 22 gate laps last
 * a whole number of ghost samples, tests/lib/synthlap.js then writes a
 * duration rounded past its last sample, and the board refuses the ghost
 * as ending before its lap. */
const SEED_SPEED = 15.5;
const RECORD_SPEED = 20;

const lapsOf = (t) => 3 + (t.gates % 5);

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/*
 * The smallest world track (schema 4) the board's validator accepts. A
 * world, because the Race room lists only tracks it can seat in a world
 * this build knows: a field track is one drawn for the retired race field.
 * The Alps are the boot baseline. Gate positions only need to be distinct
 * and inside the world.
 */
function trackDocument(t) {
  const elements = [];
  const sequence = [];
  for (let k = 1; k <= t.gates; k += 1) {
    elements.push({
      id: `el-${k}`,
      type: 'gate',
      name: `Gate ${k}`,
      position: { x: 5 + 4 * (k - 1), y: 8 + 3 * ((k - 1) % 3), z: 0 },
      yaw: 0,
      pitch: 0,
      yawOverridden: false,
      dims: { clearW: 1.524, clearH: 1.524, sillH: 0, levels: 1 },
      orientation: { w: 1, x: 0, y: 0, z: 0 },
    });
    sequence.push({ id: `sq-${k}`, elementId: `el-${k}` });
  }
  return {
    schemaVersion: 4,
    id: t.id,
    name: t.name,
    createdUtc: '2026-01-01T00:00:00Z',
    modifiedUtc: '2026-01-01T00:00:00Z',
    trackClass: 'full',
    map: 'alps',
    field: { width: 60, depth: 40, gridSize: 1 },
    settings: { tangentScale: 0.4, minCurveRadius: 2, samplesPerSegment: 24 },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence,
  };
}

/* One key per name for the whole run: the board gives a name to the first
 * key that posts it and refuses that name from any other key. */
const identities = new Map();
function identityOf(name) {
  if (!identities.has(name)) {
    identities.set(name, createIdentity(memoryStorage()));
  }
  return identities.get(name);
}

/*
 * A signed time whose ghost is a real lap through every gate at a steady
 * speed. The board refuses a time without a pilot key's signature, without
 * a ghost, or whose ghost does not hold up through the simulator's own
 * gate detector against the published track, so nothing less can be
 * seeded.
 */
async function flownLap(track, name, speed) {
  const lap = syntheticLapBytes(trackDocument(track), { speed });
  const lapMs = Math.round(lap.lapMs);
  const ghost = Buffer.from(lap.bytes).toString('base64');
  const { key, sig } = await identityOf(name).signTime({ trackId: track.id, lapMs, ghost });
  return { name, lapMs, ghost, key, sig };
}

function post(path, body) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function timesOn(track) {
  const res = await fetch(`${origin}/api/tracks/${track.id}`);
  if (!res.ok) {
    throw new Error(`reading ${track.name}: ${await res.text()}`);
  }
  return (await res.json()).times.length;
}

/* Polled, never a guessed sleep. */
async function boardAnswers() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${origin}/api/tracks`);
      if (res.ok) {
        return true;
      }
    } catch {
      /* Not listening yet: the next attempt is the handling. */
    }
    await sleep(200);
  }
  return false;
}

async function seedBoard() {
  for (const t of TRACKS) {
    const res = await post('/api/tracks', { author: t.author, document: trackDocument(t) });
    if (!res.ok) {
      throw new Error(`publishing ${t.name}: ${await res.text()}`);
    }
    for (let i = 0; i < lapsOf(t); i += 1) {
      const lap = await flownLap(t, PILOTS[(i + t.gates) % PILOTS.length], SEED_SPEED - i);
      const posted = await post(`/api/tracks/${t.id}/times`, lap);
      if (!posted.ok) {
        throw new Error(`posting a lap on ${t.name}: ${await posted.text()}`);
      }
    }
  }
}

/*
 * The record lap, carrying its ghost, goes on the track with the most
 * times (the earliest in the table on a tie), and that track's card is the
 * one whose Standings are read, so one visit sees the times, the record,
 * the pilot's own row and the ghost offered as a rival.
 * It is first posted without its signature, which the board must refuse
 * without filing it, and then as signed, which it must take.
 */
async function postRecordLap() {
  const target = TRACKS.reduce((best, t) => (lapsOf(t) > lapsOf(best) ? t : best));
  const signed = await flownLap(target, GHOST_PILOT, RECORD_SPEED);
  const unsigned = { name: signed.name, lapMs: signed.lapMs, ghost: signed.ghost };
  const before = await timesOn(target);
  const refused = await post(`/api/tracks/${target.id}/times`, unsigned);
  const filed = (await timesOn(target)) - before;
  const taken = await post(`/api/tracks/${target.id}/times`, signed);
  const rows = [
    {
      label: 'unsigned lap',
      ok: refused.status >= 400 && refused.status < 500 && filed === 0,
      seen: `answered ${refused.status}, ${filed} time(s) filed`,
      failure: 'the board refuses an unsigned lap',
    },
    {
      label: 'signed lap',
      ok: taken.ok,
      seen: `answered ${taken.status}${taken.ok ? '' : `, ${await taken.text()}`}`,
      failure: 'the board takes a signed lap',
    },
  ];
  return { target: target.name, rows };
}

/* Graphics pinned Low: this checks menus, not looks. The aircraft is pinned
 * to the default quad and marked as chosen: a pilot who has not chosen is
 * seated on a fixed wing (FIRST_AIRFRAME in src/ui/ui.js), and the Race room
 * lists a plane only the tracks whose every gate its span clears, which
 * would make the count here a question about wingspans. The two plain keys are
 * the ones src/share/board.js and src/share/pilot.js read (neither is
 * exported); the pilot is a seeded one so "your own row" has a row. */
const seed = `try {
  const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.airframe = ${JSON.stringify(DEFAULT_AIRFRAME)};
  s.airframeAsked = true;
  localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
  localStorage.setItem('webfpv.board.origin', ${JSON.stringify(origin)});
  localStorage.setItem('webfpv.pilot.name', ${JSON.stringify(ME)});
} catch (e) {}`;

const READ_ROOM = `(() => {
  const ui = window.__ui;
  const items = ui.items();
  return JSON.stringify({
    listed: items.filter((it) => it.course).length,
    cards: document.querySelectorAll('.screen-courses .course-card').length,
    note: ui.boardNote ? ui.boardNote.textContent : '',
    rows: items.filter((it) => !it.course).map((it) => it.label),
    strips: [...document.querySelectorAll('.screen-courses .strip-label')].map((el) => el.textContent),
  });
})()`;

/*
 * Standings lives on each board track's card: choosing a card lists what
 * can be done with it, and Standings is one of those rows. Reached as a
 * pilot would, cursor then select at each step, never a direct call.
 */
const openStandings = (name) => `(() => {
  const ui = window.__ui;
  const pick = (test) => {
    const i = ui.items().findIndex(test);
    if (i < 0) {
      return false;
    }
    ui.setCursor(i);
    ui.select();
    return true;
  };
  const name = ${JSON.stringify(name)};
  if (!pick((it) => it.course && it.course.kind === 'board' && it.course.track.name === name)) {
    return JSON.stringify({ card: false });
  }
  if (!pick((it) => it.action === 'card-standings')) {
    return JSON.stringify({ card: true, row: false });
  }
  return JSON.stringify({ card: true, row: true, screen: ui.screen });
})()`;

/* Everything is read before Back, which belongs to the room Standings was
 * opened from, not the title. The ghost is offered as a rival by a row
 * that only appears once the times have arrived. */
const READ_STANDINGS = `(() => {
  const ui = window.__ui;
  const times = ui.standingsTimes;
  const rows = [...ui.standingsTable.querySelectorAll('.standings-row')];
  const out = {
    times: times.length,
    sorted: times.every((t, i) => i === 0 || times[i - 1].lapMs <= t.lapMs),
    drawn: rows.length,
    record: rows.filter((r) => r.classList.contains('is-record')).length,
    mine: rows.filter((r) => r.classList.contains('is-me')).length,
    hasGhostRow: ui.items().some((it) => it.label === 'Race the record'),
    tagged: document.querySelectorAll('.standings-ghost').length,
  };
  ui.back();
  out.back = ui.screen;
  return JSON.stringify(out);
})()`;

function roomProblems(room) {
  const want = TRACKS.length;
  const out = [];
  if (room.listed < want) {
    out.push(`the Race room lists ${room.listed} of ${want} published tracks`);
  }
  if (room.cards < want) {
    out.push(`the Race room drew ${room.cards} cards for ${want} tracks`);
  }
  if (/open the board/i.test(room.note)) {
    out.push(`the Race room still says "${room.note}"`);
  }
  /* The audit's opening example was a screen headed Tracks with WORLDS
   * written above them; the worlds moved to the Freestyle room. */
  for (const label of room.strips.filter((s) => /world/i.test(s))) {
    out.push(`the Race room still has a strip labelled "${label}"`);
  }
  if (room.rows.includes('Open the board')) {
    out.push('the Race room still offers "Open the board", which means nothing to a new player');
  }
  return out;
}

function standingsProblems(s) {
  const out = [];
  if (s.times === 0) {
    out.push('the standings screen fetched no times');
  }
  if (!s.sorted) {
    out.push('the standings are not in lap order');
  }
  if (s.drawn < s.times) {
    out.push(`${s.times} times but ${s.drawn} rows drawn`);
  }
  if (s.record !== 1) {
    out.push(`${s.record} rows marked as the record, expected exactly 1`);
  }
  if (s.mine === 0) {
    out.push('the pilot\'s own row is not marked in the standings');
  }
  if (s.back !== 'courses') {
    out.push(`Back from standings landed on "${s.back}" rather than the track list`);
  }
  if (!s.hasGhostRow) {
    out.push('a track with a ghosted lap offers no way to race it');
  }
  if (s.tagged === 0) {
    out.push('the row carrying a ghost is not marked as carrying one');
  }
  return out;
}

/*
 * An empty Race room has several causes (the page asked another board, the
 * fetch failed, a filter dropped every track), and a bare timeout names
 * none of them. The module import is the page's own instance, so the
 * origin read is the one the room used.
 */
const DIAGNOSE_ROOM = `(async () => {
  const out = { note: window.__ui.boardNote ? window.__ui.boardNote.textContent : '' };
  try {
    const board = await import('/src/share/board.js');
    out.origin = board.boardOrigin();
    out.configured = board.boardConfigured();
    const list = await board.fetchTrackList();
    out.unfiltered = list.length;
    out.sample = list.slice(0, 2).map((t) => ({ name: t.name, map: t.map, trackClass: t.trackClass, planes: t.planes }));
  } catch (err) {
    out.failed = String(err && err.message ? err.message : err);
  }
  out.airframe = window.__ui.settings ? window.__ui.settings.airframe : null;
  return JSON.stringify(out);
})()`;

async function explainEmptyRoom(page) {
  console.log(`  board note    ${JSON.stringify(await page.evaluate('window.__ui.boardNote ? window.__ui.boardNote.textContent : ""'))}`);
  console.log(`  diagnosis     ${await page.evaluate(DIAGNOSE_ROOM)}`);
  console.log(`  page errors   ${page.errors.length ? page.errors.join(' | ') : '(none)'}`);
}

async function exercise(page, target) {
  const failures = [];
  await page.until('window.__shellReady === true', 90000);
  await page.until('!!window.__ui', 10000);
  /* Every track here is a Race track, so a mode-less shell is put in Race. */
  await page.evaluate(`(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    if (!ui.mode) {
      ui.mode = 'race';
    }
    ui.show('courses');
    return true;
  })()`);
  try {
    await page.until('(window.__ui.boardCourses || []).length > 0', 25000);
  } catch (e) {
    await explainEmptyRoom(page);
    throw e;
  }

  const room = JSON.parse(await page.evaluate(READ_ROOM));
  failures.push(...roomProblems(room));

  const opened = JSON.parse(await page.evaluate(openStandings(target)));
  if (!opened.card) {
    failures.push(`the track with the ghosted lap (${target}) was not listed`);
  } else if (!opened.row) {
    failures.push('the Standings row was not found, so nothing was exercised');
  } else if (opened.screen !== 'standings') {
    failures.push(`Standings opened "${opened.screen}" rather than a standings screen`);
  } else {
    await page.until('Array.isArray(window.__ui.standingsTimes)', 20000);
    failures.push(...standingsProblems(JSON.parse(await page.evaluate(READ_STANDINGS))));
  }

  console.log(`  Race room     ${room.listed} tracks listed, ${room.cards} cards drawn`);
  console.log(`  strip labels  ${room.strips.length ? room.strips.join(', ') : '(none)'}`);
  console.log(`  rows          ${room.rows.join(', ')}`);
  return failures;
}

async function main() {
  /* A missing sibling is not a defect in this repository. */
  if (!existsSync(boardEntry)) {
    console.log('board check: the LeaderBoard repository is not checked out beside this one.');
    console.log('');
    console.log('SKIP, nothing to check against');
    return 0;
  }
  const scratch = await mkdtemp(join(tmpdir(), 'fdfpv-board-'));
  const board = spawn(process.execPath, [boardEntry], {
    cwd: boardRepo,
    env: { ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json') },
    stdio: 'ignore',
  });
  let page = null;
  try {
    if (!await boardAnswers()) {
      console.log('board check: the board did not start');
      console.log('');
      console.log('FAIL, no board to check against');
      return 1;
    }
    await seedBoard();
    const { target, rows } = await postRecordLap();
    console.log(`board check: ${TRACKS.length} tracks published, a ghosted lap on ${target}`);
    console.log('');
    for (const row of rows) {
      console.log(`  ${row.label.padEnd(14)}${row.ok ? 'ok' : 'FAIL'}, ${row.seen}`);
    }
    const failures = rows.filter((row) => !row.ok).map((row) => `${row.failure}: ${row.seen}`);
    page = await openPage({ root, width: 1280, height: 720, seed: [seed] });
    failures.push(...await exercise(page, target));
    console.log('');
    if (failures.length) {
      console.log(`FAIL, ${failures.length} problem(s):`);
      for (const f of failures) {
        console.log(`  ${f}`);
      }
      return 1;
    }
    console.log('PASS, every track is listed and the board is a screen in the game');
    return 0;
  } finally {
    if (page) {
      await page.close();
    }
    board.kill();
    await rm(scratch, { recursive: true, force: true });
  }
}

/* Explicit, so a stray handle (the spawned board) cannot keep the process
 * alive. */
process.exit(await main());
