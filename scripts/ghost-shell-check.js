/*
 * ghost-shell-check.js: the shell's side of the ghost chase, driven in the
 * real page and read back.
 *
 *     node scripts/ghost-shell-check.js [--only=en|es]
 *
 * src/game/ghost.js records and samples a lap and has its own checks
 * (ghost:selftest, ghost:golden). What this pins is the part src/main.js
 * owns: which lap is chased, what the menu row says, what name tag the rig
 * carries, the gap read at a gate, the results sentence and the record key
 * a best lap is filed under.
 *
 * The ring in tests/fixtures/map-track-v4.json is played through Track mode
 * as scripts/osd-check.js plays it, and its laps are flown by putting the
 * craft through each gate (window.__placeCraft with a from point, the way
 * scripts/build-check.js crosses a gate), since what is checked here is the
 * bookkeeping around a lap and not the flying of one.
 *
 * The name tag is drawn on a canvas only (src/render/ghostcraft.js), so a
 * seed script records every string drawn on a canvas of the tag's size, and
 * the rows read the newest one.
 *
 * en: three laps. Lap 1 records the session best and the previous lap.
 * Lap 2 chases the best ("Best" on the tag) and reads its gap at the first
 * gate; the menu row picks the previous lap ("Last"), off, a board lap
 * (window.__ghostLoad) and back, and cycles both ways. Lap 2 is flown slow
 * and lap 3 chases it, so the results say the run beat the ghost.
 * The record key keeps its storage format.
 *
 * es: the same chase in Spanish. The session best's tag says "Mejor", not
 * "Ultimo": the label used to be chosen by comparing the lap's label with
 * the English words, which src/game/ghost.js writes translated.
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
import { LANG_KEY } from '../src/strings/index.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const onlyArg = process.argv.slice(2).find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const TABLES = { en, es };

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

/* str() from src/strings/index.js, against a table chosen here rather than
 * the page's locale, falling back to English as the page does. */
function text(lang, key, vars) {
  const raw = TABLES[lang][key] ?? en[key];
  if (raw === undefined) {
    throw new Error(`no string ${key}`);
  }
  return vars ? raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
}

/* Every string drawn on a canvas of the name tag's size (512 x 96), newest
 * last, so a row can read what the rig's tag says. */
const TAG_SPY = `(() => {
  window.__tagTexts = [];
  const plain = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...rest) {
    if (this.canvas && this.canvas.width === 512 && this.canvas.height === 96) {
      const all = window.__tagTexts;
      if (all[all.length - 1] !== String(s)) {
        all.push(String(s));
      }
    }
    return plain.call(this, s, ...rest);
  };
})();`;

function seeds(lang, track) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: 'track',
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
    fpsCap: 0,
    laps: 3,
  };
  return [`try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem(${JSON.stringify(LANG_KEY)}, ${JSON.stringify(lang)});
    localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify({ [track.id]: track }))});
  } catch (e) { /* storage refused */ }`, TAG_SPY];
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

/* Track mode, My tracks, the ring's card, the launch card, Fly. */
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
  /* The ring's start gate hangs in the air, so the run opens on the air
   * start's countdown; the laps are flown after it. */
  await page.until("!/^[123]$/.test(window.__craftState().banner || '')", 30000);
  await frames(page, 10);
}

/* The race's gates as opening centre and travel axis, in its flying order. */
const gatesOf = (page) => page.evaluate(`window.__race().gates.map((g) => ({
  centre: [g.x, g.y + (g.apertures[0] ? g.apertures[0].centreY : 0), g.z],
  travel: [g.az.x, g.az.y, g.az.z],
}))`);

/* Through gate g: placed past it, coming from before it, then a few frames
 * and a short wait so each lap has a duration of its own. */
async function through(page, g) {
  const from = g.centre.map((v, i) => v - g.travel[i] * 1.2);
  const to = g.centre.map((v, i) => v + g.travel[i] * 1.2);
  await page.evaluate(`window.__placeCraft(${to.join(',')}, ${from.join(',')})`);
  await frames(page, 3);
  await page.sleep(250);
}

/* From just past the start gate round to it again, which closes a lap. */
async function restOfLap(page, G) {
  for (let k = 1; k <= G.length; k += 1) {
    await through(page, G[k % G.length]);
  }
}

const ghost = (page) => page.evaluate('window.__ghost()');
const lastTag = (page) => page.evaluate('window.__tagTexts[window.__tagTexts.length - 1] || null');
const row = (page) => page.evaluate('window.__ui.ghostRow ? { value: window.__ui.ghostRow.value, note: window.__ui.ghostRow.note } : null');
const race = (page) => page.evaluate('({ lap: window.__race().lap, laps: window.__race().laps.slice(), splits: window.__race().splits.slice(), lastSplits: window.__race().lastSplits.slice(), next: window.__race().next, start: window.__race().lapStartMs, key: window.__race().key })');

/* Waits until the tag says `want`, a frame at a time: the rig is relabelled
 * at the arm, which happens inside the frame. */
async function tagBecomes(page, want) {
  for (let i = 0; i < 30; i += 1) {
    if ((await lastTag(page)) === want) {
      return want;
    }
    await frames(page, 1);
  }
  return lastTag(page);
}

async function english(track) {
  console.log('\nen: three laps round the ring, chasing the session');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds('en', track) });
  try {
    await playRing(page, track);
    const G = await gatesOf(page);
    const g0 = await ghost(page);
    const r0 = await row(page);
    say(g0.choice === 'best' && !g0.armed && g0.bestMs == null && g0.previousMs == null && g0.boardTimes === 0,
      `before a lap: choice ${g0.choice}, nothing armed, nothing on record`);
    say(r0 && r0.value === text('en', 'main.your_best_this_session') && r0.note === text('en', 'main.no_lap_on_record_this_session'),
      `the menu row: "${r0 && r0.value}", "${r0 && r0.note}"`);

    /* The record key is a storage format: a pilot's bests live under it. */
    const air = await page.evaluate('window.__air()');
    const m = /^webfpv\.best\.([0-9a-f]+)\.(\d+\.\d\d)\.interceptor(\.g\d+)?$/.exec(air.key);
    const grav = air.scale === 1 ? undefined : `.g${Math.round(air.scale * 100)}`;
    say(Boolean(m) && m[3] === grav, `the record key keeps its shape: ${air.key}`);
    const r0race = await race(page);
    say(r0race.key.startsWith(air.key), `and the race files its record under it: ${r0race.key}`);

    /* Lap 1. */
    await through(page, G[0]);
    const s0 = await race(page);
    const g1rec = await ghost(page);
    say(s0.start != null && g1rec.recording && g1rec.recordedFrames > 0 && !g1rec.armed,
      `through the start: the lap clock runs, the recorder holds ${g1rec.recordedFrames} frames, no ghost yet`);
    await restOfLap(page, G);
    const s1 = await race(page);
    const lap1 = s1.laps[0];
    const lap1Splits = s1.lastSplits.slice();
    const g1 = await ghost(page);
    say(s1.laps.length === 1 && g1.bestMs === Math.round(lap1) && g1.previousMs === Math.round(lap1),
      `lap 1 closes at ${lap1} ms and is both the session best and the previous lap (${g1.bestMs}, ${g1.previousMs})`);
    say(g1.armed && g1.armedLabel === text('en', 'ghost.session_best') && g1.armedMs === Math.round(lap1),
      `lap 2 arms the best at the line: "${g1.armedLabel}", ${g1.armedMs} ms`);
    const tagBest = `${text('en', 'main.best')}  ${formatTime(Math.round(lap1))}`;
    say(await tagBecomes(page, tagBest) === tagBest, `the tag reads "${tagBest}"`);
    const r1 = await row(page);
    say(r1.note === text('en', 'main.a_translucent_pacer_flying_that_lap', { formatTime: formatTime(Math.round(lap1)) }),
      `the menu row has a lap to fly: "${r1.note}"`);

    /* The gap at the first gate of lap 2: this lap's split less the
     * chased lap's. */
    await through(page, G[1]);
    const s2a = await race(page);
    const g2a = await ghost(page);
    const wantGap = s2a.splits[0] - Math.round(lap1Splits[0]);
    say(g2a.gapMs === wantGap, `the gap at gate 2 is the split against the ghost's: ${g2a.gapMs} ms, want ${wantGap}`);
    await page.evaluate('window.__ghostGapShow(-340, false)');
    say((await ghost(page)).gapMs === -340, 'the OSD gap can be lit by hand');

    /* The row's picks. */
    say(await page.evaluate("window.__ghostPick('previous')") === 'previous', 'pick the previous lap');
    const gp = await ghost(page);
    const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').ghost`);
    say(gp.armed && gp.armedLabel === text('en', 'ghost.previous_lap') && stored === 'previous',
      `it arms at once, "${gp.armedLabel}", and the choice is stored: ${stored}`);
    const tagLast = `${text('en', 'main.last')}  ${formatTime(Math.round(lap1))}`;
    say(await tagBecomes(page, tagLast) === tagLast, `the tag reads "${tagLast}"`);
    const rp = await row(page);
    say(rp.value === text('en', 'main.your_previous_lap'), `the row reads "${rp.value}"`);

    await page.evaluate("window.__ghostPick('off')");
    const go = await ghost(page);
    const ro = await row(page);
    say(go.choice === 'off' && !go.armed && ro.value === 'Off' && ro.note === text('en', 'main.nobody_to_chase_laps_still_record'),
      `off: nothing armed, the row "${ro.value}", "${ro.note}"`);
    await page.evaluate('window.__ui.ghostRow.cycle(1)');
    const c1 = (await ghost(page)).choice;
    await page.evaluate('window.__ui.ghostRow.cycle(1)');
    const c2 = (await ghost(page)).choice;
    await page.evaluate('window.__ui.ghostRow.cycle(1)');
    const c3 = (await ghost(page)).choice;
    await page.evaluate('window.__ui.ghostRow.cycle(-1)');
    const c4 = (await ghost(page)).choice;
    say(c1 === 'best' && c2 === 'previous' && c3 === 'off' && c4 === 'previous', `the row cycles off, ${c1}, ${c2}, ${c3}, and back to ${c4}`);

    /* A board lap, as a board fetch arms one. */
    const b64 = await page.evaluate("window.__ghostExport('best')");
    const loaded = await page.evaluate(`window.__ghostLoad(${JSON.stringify(b64)}, 'Rival Pilot')`);
    const gb = await ghost(page);
    const rb = await row(page);
    say(loaded.armed && loaded.durationMs === Math.round(lap1) && gb.choice === 'board:tm-00000000' && gb.armedLabel === text('en', 'main.board_lap'),
      `a board lap arms: ${gb.choice}, "${gb.armedLabel}", ${loaded.durationMs} ms, ${loaded.splits} splits`);
    const tagRival = `Rival Pilot  ${formatTime(Math.round(lap1))}`;
    say(await tagBecomes(page, tagRival) === tagRival, `the tag carries the pilot's name: "${tagRival}"`);
    say(rb.value === text('en', 'main.your_best_this_session') && rb.note === text('en', 'main.a_recorded_lap_from_the_public'),
      `with no board times listed the row shows "${rb.value}", "${rb.note}"`);
    await page.evaluate("window.__ghostPick('board:tm-00000000')");
    say((await ghost(page)).armed, 'picking the loaded board lap again keeps it armed without a fetch');

    await page.evaluate("window.__ghostPick('best')");
    say(await tagBecomes(page, tagBest) === tagBest, 'back to the best: the tag reads "Best" again');

    /* Close lap 2 slower than lap 1 and chase it, the previous lap, through
     * lap 3: the run's best (lap 1) beats it, which the results say. */
    await page.evaluate("window.__ghostPick('previous')");
    await page.sleep(600);
    for (let k = 2; k <= G.length; k += 1) {
      await through(page, G[k % G.length]);
    }
    const s2 = await race(page);
    const lap2 = s2.laps[1];
    const g2 = await ghost(page);
    say(s2.laps.length === 2 && lap2 > lap1 + 100 && g2.previousMs === Math.round(lap2) && g2.bestMs === Math.round(lap1)
      && g2.armedMs === Math.round(lap2) && g2.armedLabel === text('en', 'ghost.previous_lap'),
      `lap 2 closes at ${lap2} ms: previous ${g2.previousMs}, best ${g2.bestMs}, lap 3 chases "${g2.armedLabel}" at ${g2.armedMs}`);
    await restOfLap(page, G);
    await page.until("window.__craftState().mode === 'results'", 20000).catch(() => {});
    const s3 = await race(page);
    const note = await page.evaluate("(document.querySelector('.results-ghost') || {}).textContent || null");
    const chased = Math.round(lap2);
    const d = Math.min(...s3.laps) - chased;
    const vars = { who: text('en', 'ghost.previous_lap').toLowerCase(), formatTime: formatTime(chased) };
    let want;
    if (Math.abs(d) < 10) {
      want = text('en', 'main.level_with_the_ghost_at', vars);
    } else if (d < 0) {
      want = text('en', 'main.you_beat_the_ghost_at_by', { ...vars, v3: (Math.abs(d) / 1000).toFixed(2) });
    } else {
      want = text('en', 'main.the_ghost_at_stayed_ahead', { ...vars, v3: (d / 1000).toFixed(2) });
    }
    say(s3.laps.length === 3 && d < -10 && note === want, `the results say "${note}"`);
    const g3 = await ghost(page);
    say(!g3.visible, 'the rig is parked on the results screen');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

async function spanish(track) {
  console.log('\nes: the session best, chased in Spanish');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds('es', track) });
  try {
    await playRing(page, track);
    const G = await gatesOf(page);
    await through(page, G[0]);
    await restOfLap(page, G);
    const s1 = await race(page);
    const g1 = await ghost(page);
    const lap1 = Math.round(s1.laps[0]);
    say(g1.armed && g1.armedLabel === text('es', 'ghost.session_best'), `lap 2 arms the best: "${g1.armedLabel}"`);
    const tagBest = `${text('es', 'main.best')}  ${formatTime(lap1)}`;
    const shown = await tagBecomes(page, tagBest);
    say(shown === tagBest, `the tag reads "${tagBest}": got "${shown}"`);
    await page.evaluate("window.__ghostPick('previous')");
    const tagLast = `${text('es', 'main.last')}  ${formatTime(lap1)}`;
    say(await tagBecomes(page, tagLast) === tagLast, `and the previous lap's reads "${tagLast}"`);
  } finally {
    await page.close();
  }
}

const track = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
try {
  if (!only || only === 'en') {
    await english(track);
  }
  if (!only || only === 'es') {
    await spanish(track);
  }
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
