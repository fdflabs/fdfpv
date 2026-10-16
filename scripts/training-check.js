/*
 * training-check.js: Learn to fly driven through the real shell with a
 * real pointer (docs/TRAINING-DAMAGE-CONTRACT.md, item 18):
 *
 *   SIM_GPU=1 npm run training:check -- [outdir]   (build/training-check)
 *
 * Seated in the interceptor on the Swiss valley, the page clicks Flight
 * Club, then its Learn to fly card: the lessons page lists every lesson
 * under its track, none locked. Fly on Turns seats the Timber in
 * Stabilised on the valley, says the lesson in a toast and holds its
 * judge. In flight, put in the air by the dev hook, the judge reads the
 * craft's heading every frame (the turn steps count it). Pressing another
 * card ends the lesson. Interrupted (docs/redesign/TRAINING.md 10): the
 * tab hidden in Turns' flight pauses it and holds the lesson at its step,
 * said; Resume flies on in it; a crash says it starts again, once; a
 * reload mid lesson leaves it, its settings back, said on the next load,
 * and the page marks it Interrupted. Gates passes on a casual sky track's lap, judged
 * from the lap event in the flight's log, and not on a built track's. A
 * lap lesson's pass is stored with its time and
 * the page says Passed, also after a reload. A Defence lesson with no
 * rooms server says so and makes no room. No page error.
 *
 * Then Defence on a second page, against a local edge/rooms/node.js this
 * check starts and stops itself (never the VM), no war consent stored:
 * Fly on Interception asks the war's consent; Continue makes a solo room
 * on Itaipu for the practice (itaipu-practice), the pilot's remembered
 * Who joins for the war untouched, the lesson held; the practice started
 * there goes live on its one stage, a Striker born. Working together,
 * First Light released (the owner, 2026-10-15), holds its lesson, says
 * to win First Light and makes a room for it.
 * Then Turns held and a combat room joined: a session that is not the
 * lesson's ends it, said. No page error.
 * Pictures in outdir.
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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/settings.js';
import { tmpdir } from 'node:os';
import { LESSONS } from '../src/game/training.js';
import { PRACTICE_ID } from '../src/share/war/missions/itaipu-practice.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'training-check');

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
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

/* A real pointer's click (tests/lib/page.js waits out the loader). */
async function click(page, selector) {
  if (!(await page.click(selector))) {
    throw new Error(`nothing to click at ${selector}`);
  }
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'swiss2', graphics: 'low', graphicsAuto: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* storage refused */ }`];

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?dev=1', seed });
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.until("window.__ui.onGate() && document.querySelector('.gate-card-hub-club')", 60000);
  await click(page, '.gate-card-hub-club .gate-card-name');
  await page.until("window.__ui.hub === 'club' && !!document.querySelector('.gate-card-training')", 15000).catch(() => {});
  const club = await page.evaluate("({ hub: window.__ui.hub, screen: window.__ui.screen, cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => c.className) })");
  check('Flight Club opens on a click, Learn to fly among its cards', club.hub === 'club' && club.cards.some((c) => /gate-card-training\b/.test(c)), JSON.stringify(club));
  await page.sleep(400);
  await shot(page, 'club');
  await click(page, '.gate-card-training .gate-card-name');
  await page.until("!!document.querySelector('.training-box')", 15000).catch(() => {});
  const listed = await page.evaluate(`(() => {
    const box = document.querySelector('.training-box');
    if (!box) return null;
    return {
      tracks: [...box.querySelectorAll('h3')].map((n) => n.textContent),
      lessons: [...box.querySelectorAll('[data-lesson]')].map((n) => n.dataset.lesson),
      plays: [...box.querySelectorAll('[data-lesson] .campaign-play')].filter((b) => !b.disabled).length,
    };
  })()`);
  check('the Learn to fly card opens the lessons page, every lesson under its track', listed
    && listed.lessons.join() === LESSONS.map((l) => l.id).join() && listed.tracks.join() === 'First flight,Fixed wing,Glider,Multirotor,Racing,Defence', JSON.stringify(listed));
  check('nothing on it is locked: every lesson has Fly', listed && listed.plays === LESSONS.length, JSON.stringify(listed));
  await shot(page, 'lessons');

  const heldBefore = await page.evaluate("(() => { const s = window.__ui.settings; return [s.airframe, s.tune, s.flightMode, s.weather].join(); })()");
  await click(page, '[data-lesson="first_turns"] .campaign-play');
  await page.until("window.__ui.settings.airframe === 'timber1500' && document.querySelector('.training-box') === null", 30000).catch(() => {});
  await page.until("window.__map && window.__map().ready && window.__map().id === 'swiss2'", 300000).catch(() => {});
  const seated = await page.evaluate(`(() => {
    const p = window.__ui.progress;
    return {
      airframe: window.__ui.settings.airframe, tune: window.__ui.settings.tune, map: window.__ui.settings.map,
      lesson: p.lesson ? p.lesson.lesson.id : null, toasts: p.log.map((t) => t.kicker + ': ' + t.title),
    };
  })()`);
  check('Fly on Turns seats the Timber in Stabilised on the valley and holds the lesson',
    seated.airframe === 'timber1500' && seated.tune === 'timber-stab' && seated.map === 'swiss2' && seated.lesson === 'first_turns', JSON.stringify(seated));
  check('and says the lesson in a toast', seated.toasts.includes('Lesson: Turns'), seated.toasts.join(' | '));
  await shot(page, 'seated');

  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.sleep(1500);
  await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY + 40, s.worldZ); return true; })()');
  await page.sleep(2500);
  const judged = await page.evaluate(`(() => {
    const w = window.__ui.progress.lesson;
    return w ? { id: w.lesson.id, step: w.step, heading: w.heading, flew: w.flew } : null;
  })()`);
  check('in the air the judge reads the heading every frame', judged && judged.id === 'first_turns' && Number.isFinite(judged.heading), JSON.stringify(judged));
  await shot(page, 'flying');

  check('Turns draws no aid', await page.evaluate('window.__aids().glide === null && !window.__aids().gateCue'));

  /* INTERRUPTIONS (docs/redesign/TRAINING.md 10). The tab hidden in the
   * lesson's flight: paused, the lesson held at its step and said so;
   * Resume flies on with the same lesson. A crash says the steps start
   * again, once. A reload mid lesson says it was interrupted, and the
   * page marks it. */
  const LESSON_NOW = "(() => { const w = window.__ui.progress.lesson; return { screen: window.__ui.screen, lesson: w ? w.lesson.id : null, step: w ? w.step : null, sub: (window.__ui.progress.log.at(-1) || {}).sub || '' }; })()";
  const stepBefore = await page.evaluate('window.__ui.progress.lesson.step');
  await page.evaluate("(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return true; })()");
  await page.sleep(400);
  const hid = await page.evaluate(LESSON_NOW);
  check('the tab hidden in a lesson\'s flight pauses it, the lesson held at its step, and says so',
    hid.screen === 'paused' && hid.lesson === 'first_turns' && hid.step === stepBefore && hid.sub === `Held at step ${stepBefore + 1} of 2: Resume carries on from there.`, JSON.stringify(hid));
  await shot(page, 'lesson-held');
  await page.evaluate("(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); window.__ui.act('resume'); return true; })()");
  await page.until("window.__craftState().mode === 'flight'", 15000).catch(() => {});
  const back = await page.evaluate(`({ ...${LESSON_NOW}, mode: window.__craftState().mode })`);
  check('Resume flies on in the same lesson and step', back.mode === 'flight' && back.lesson === 'first_turns' && back.step === stepBefore, JSON.stringify(back));
  const crashSays = await page.evaluate(`(() => {
    const p = window.__ui.progress;
    const n = p.log.length;
    for (let i = 0; i < 5; i += 1) {
      p.tick({ simMs: p.simMs + 16, crashed: true, grounded: true, heading: 0 });
    }
    return p.log.slice(n).map((t) => t.sub);
  })()`);
  check('a crash says the lesson starts again, once', JSON.stringify(crashSays) === JSON.stringify(['Crashed: the lesson starts again from step 1.']), JSON.stringify(crashSays));
  await page.evaluate('(location.reload(), true)');
  await page.sleep(1000);
  await page.until('!!window.__shellReady && !!window.__training', 300000);
  const reloaded = await page.evaluate(`({
    subs: window.__ui.progress.log.map((t) => t.title + ': ' + t.sub),
    lesson: window.__ui.progress.lesson ? window.__ui.progress.lesson.lesson.id : null,
    held: (() => { const s = window.__ui.settings; return [s.airframe, s.tune, s.flightMode, s.weather].join(); })(),
  })`);
  check('a reload mid lesson: the lesson left, its settings back, and the next load says it was interrupted',
    !reloaded.lesson && reloaded.held === heldBefore && reloaded.subs.includes('Turns: Interrupted at step 1 of 2 when the page closed. Fly it again from Learn to fly.'), JSON.stringify(reloaded));
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000).catch(() => {});
  const cut = await page.evaluate("(() => { const n = document.querySelector('[data-lesson=\"first_turns\"]'); return n ? [n.dataset.state, (n.querySelector('.campaign-tag') || {}).textContent || '', !n.querySelector('.campaign-play').disabled] : null; })()");
  check('and the page marks it Interrupted, its Fly there', cut && cut[0] === 'interrupted' && cut[1] === 'Interrupted' && cut[2], JSON.stringify(cut));
  await shot(page, 'lesson-interrupted');
  await page.evaluate("(window.__training.close(), true)");
  await page.until('window.__map && window.__map().ready', 400000);

  /* THE GLIDE PATH: Land, flown from the page, put on the approach. */
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-lesson="first_land"] .campaign-play');
  await page.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'first_land'", 15000).catch(() => {});
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.sleep(1000);
  await page.evaluate('(window.__placeCraft(0, 32, 330), true)');
  await page.sleep(1200);
  const glide = await page.evaluate('window.__aids()');
  check('Land draws the glide path: ten rings down to the strip\'s +z end', glide.glide && glide.glide.length === 10
    && glide.glide.every((p, i) => p[2] > 80 && (i === 0 || (p[1] > glide.glide[i - 1][1] && p[2] > glide.glide[i - 1][2]))), JSON.stringify(glide.glide && glide.glide.slice(0, 3)));
  await shot(page, 'glide');
  /* From beside the approach, to see the rings meet the strip. */
  await page.evaluate('(window.__setCam(60, 25, 260, 0, 2, 60, 50), true)');
  await page.sleep(800);
  await shot(page, 'glide-side');
  await page.evaluate('(window.__setCam(null), true)');
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(500);
  await page.evaluate("window.__ui.pickForWay('way-race-5inch'); true");
  await page.sleep(500);
  check('another card ends the lesson', await page.evaluate('window.__ui.progress.lesson === null'));
  const heldAfter = await page.evaluate("(() => { const s = window.__ui.settings; return [s.airframe, s.tune, s.flightMode, s.weather].join(); })()");
  check('and puts back the aircraft, tune, mode and weather of before the first lesson', heldAfter === heldBefore, `${heldAfter} (before ${heldBefore})`);
  /* That card's aircraft picker, closed as a pilot backs out of it. */
  await page.tap('Escape');
  await page.until('!window.__ui.carousel.isOpen', 10000).catch(() => {});

  /* A QUAD LESSON seats the interceptor in angle mode. */
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-lesson="quad_hover"] .campaign-play');
  await page.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'quad_hover'", 15000).catch(() => {});
  const quad = await page.evaluate("({ airframe: window.__ui.settings.airframe, mode: window.__ui.settings.flightMode, map: window.__ui.settings.map })");
  check('Hover seats the interceptor in angle mode on the valley', quad.airframe === 'interceptor' && quad.mode === 'angle' && quad.map === 'swiss2', JSON.stringify(quad));

  /* GATES: a clean lap of a casual sky track, judged from the flight's
   * log. A clean lap of a built track, closed through Progress as the
   * race step closes one, does not pass it; a casual one does, and the
   * lap event in the log carries the casual kind it was judged on. */
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-lesson="quad_gates"] .campaign-play');
  await page.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'quad_gates'", 15000).catch(() => {});
  check('Fly on Gates holds the lesson', await page.evaluate("!!window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'quad_gates'"));
  await page.evaluate("(window.__ui.progress.lap({ key: 'built-track', kind: 'built' }, { ms: 30000, ghostMs: null }), true)");
  const builtLap = await page.evaluate("({ passed: !!(window.__ui.settings.progress.lessons || {}).quad_gates, held: !!window.__ui.progress.lesson })");
  check('a clean lap of a built track does not pass it', !builtLap.passed && builtLap.held, JSON.stringify(builtLap));
  await page.evaluate("(window.__ui.progress.lap({ key: 'casual-track', kind: 'casual' }, { ms: 30000, ghostMs: null }), true)");
  const gatesLap = await page.evaluate(`(() => {
    const laps = window.__ui.progress.flight.events.filter((e) => e.type === 'lap');
    return { passed: (window.__ui.settings.progress.lessons || {}).quad_gates, kinds: laps.map((e) => e.kind) };
  })()`);
  check('a clean casual lap passes it, its lap event logged as casual', Number.isFinite(gatesLap.passed) && gatesLap.kinds.join() === 'built,casual', JSON.stringify(gatesLap));

  /* I FLY ALREADY: First flight's skip flies the unaided round in Acro,
   * and its pass, fed to Progress as the frames would feed it, passes the
   * three lessons before it too. */
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-skip="first"] .training-skip-btn');
  await page.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'first_unaided'", 15000).catch(() => {});
  const skipSeat = await page.evaluate("({ lesson: window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id, tune: window.__ui.settings.tune })");
  check('I fly already on First flight flies the unaided round, in Acro', skipSeat.lesson === 'first_unaided' && skipSeat.tune === 'timber-acro', JSON.stringify(skipSeat));
  await page.evaluate(`(() => {
    const p = window.__ui.progress;
    let t = 0;
    let h = 0;
    const seg = (ms, grounded, rate) => {
      for (const end = t + ms; t < end; t += 16) {
        h += rate * 0.016;
        p.tick({ simMs: t, crashed: false, grounded, heading: Math.atan2(Math.sin(h), Math.cos(h)) });
      }
    };
    const circle = 2 * Math.PI / 8;
    seg(300, true, 0);
    seg(21000, false, 0);
    seg(8200, false, circle);
    seg(8200, false, -circle);
    seg(1200, true, 0);
    return true;
  })()`);
  const skipped = await page.evaluate('Object.keys(window.__ui.settings.progress.lessons).sort().join()');
  const flown = await page.evaluate('Object.keys(window.__ui.settings.progress.lessonsFlown || {}).sort().join()');
  check('and only the lesson flown is marked flown', !/first_takeoff|first_turns|first_land/.test(flown) && flown.includes('first_unaided'), flown);
  check('its pass passes the whole First flight track', skipped.includes('first_land,first_takeoff,first_turns,first_unaided'), skipped);

  /* A PASS IS KEPT: A lap lesson flown from the page, its lap closed
   * through Progress as the race step closes one, then the page again, and
   * again after a reload: Passed, from the synced progress. */
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-lesson="race_lap"] .campaign-play');
  await page.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'race_lap'", 15000).catch(() => {});
  await page.evaluate("(window.__ui.progress.lap({ key: null, kind: 'map' }, { ms: 30000, ghostMs: null }), true)");
  const stored = await page.evaluate('window.__ui.settings.progress.lessons');
  check('the lap passes the lesson and the pass is stored with its time', Number.isFinite(stored.race_lap) && stored.race_lap > 1.7e12, JSON.stringify(stored));
  check('and the toast says so', (await page.evaluate("window.__ui.progress.log.map((t) => t.kicker + ': ' + t.title)")).includes('Lesson passed: A lap'));
  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(300);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  const tag = () => page.evaluate("(() => { const n = document.querySelector('[data-lesson=\"race_lap\"]'); return n ? [n.dataset.state, (n.querySelector('.campaign-tag') || {}).textContent || ''] : null; })()");
  const before = await tag();
  check('the page marks it Passed', before && before[0] === 'passed' && before[1] === 'Passed', JSON.stringify(before));
  await shot(page, 'passed');
  await page.evaluate('(location.reload(), true)');
  await page.sleep(1000);
  await page.until('!!window.__shellReady && !!window.__training', 300000);
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000).catch(() => {});
  const after = await tag();
  check('and still after a reload', after && after[0] === 'passed', JSON.stringify(after));

  /* DEFENCE WITH NO ROOMS SERVER: said, and no room. */
  await page.evaluate('(window.__training.open(), true)');
  await page.until("!!document.querySelector('.training-box')", 15000);
  await click(page, '[data-lesson="defence_intercept"] .campaign-play');
  await page.sleep(500);
  const alone = await page.evaluate("({ toasts: window.__ui.progress.log.map((t) => t.sub || ''), phase: window.__rooms().phase })");
  check('Fly on a Defence lesson with no rooms server says it needs one and makes no room',
    alone.toasts.includes('The Defence lessons fly in a war room, and no rooms server answers here.') && alone.phase === 'idle', JSON.stringify({ ...alone, toasts: alone.toasts.slice(-2) }));
} catch (e) {
  check(`the run finished`, false, e.stack || String(e));
}
/* Track mode asks the leaderboard, which a check page has none of: a
 * refused connection is that, counted apart as scripts/crash-shots.js does. */
const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
check(`no page error (plus ${page.errors.length - errs.length} refused connections to an absent local board)`, errs.length === 0, errs.slice(0, 3).join(' | '));
await page.close();

/* DEFENCE: the practice in a solo war room, on a local rooms server. */
const dir = await mkdtemp(join(tmpdir(), 'training-defence-'));
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const warSeed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.defenceSeeded) {
    Object.assign(s, { map: 'swiss2', graphics: 'low', graphicsAuto: false, airframeAsked: true, fpsCap: 0, defenceSeeded: true,
      sessionVisibility: { ...(s.sessionVisibility || {}), war: 'friends' } });
    delete s.warConsent;
    localStorage.setItem(k, JSON.stringify(s));
  }
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* storage refused */ }`];
const war = await openPage({ root, width: 1280, height: 720, url: `/index.html?dev=1&rooms=${encodeURIComponent(rooms)}`, seed: warSeed });
try {
  await war.until('!!window.__shellReady && !!window.__training', 300000);
  await war.until('window.__map && window.__map().ready', 400000);
  await war.evaluate('(window.__training.open(), true)');
  await war.until("!!document.querySelector('.training-box')", 15000);
  await click(war, '[data-lesson="defence_intercept"] .campaign-play');
  await war.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && !d.querySelector('.training-box') && !!d.querySelector('h2'); })()", 15000).catch(() => {});
  const asked = await war.evaluate("(() => { const d = document.querySelector('.name-dialog'); return { open: Boolean(d && !d.hidden), title: d && d.querySelector('h2') ? d.querySelector('h2').textContent : null, phase: window.__rooms().phase }; })()");
  check('Fly on Interception asks the war\'s consent first, no room yet', asked.open && asked.title === 'Defend the Paraná' && asked.phase === 'idle', JSON.stringify(asked));
  await shot(war, 'defence-consent');
  await war.sleep(700);
  await war.tap('Enter');
  await war.until("window.__rooms().phase === 'open' && window.__rooms().mode === 'war'", 60000).catch(() => {});
  const room = await war.evaluate(`(() => {
    const r = window.__rooms();
    let solo = null;
    try { solo = sessionStorage.getItem('fdfpv.roomSolo'); } catch (e) { /* none */ }
    const p = window.__ui.progress;
    return {
      phase: r.phase, mode: r.mode, public: r.public, code: r.code, solo, mission: r.lobby ? r.lobby.mission : null,
      consent: window.__ui.settings.warConsent === true, kept: window.__ui.settings.sessionVisibility.war,
      lesson: p.lesson ? p.lesson.lesson.id : null, map: window.__ui.settings.map,
    };
  })()`);
  check('Continue makes a private war room on Itaipu for the practice, the consent stored',
    room.phase === 'open' && room.mode === 'war' && room.public === false && room.mission === PRACTICE_ID && room.consent && room.map === 'itaipu', JSON.stringify(room));
  check('a solo room: its code kept hidden as Solo\'s, the war\'s own Who joins left as it was', room.code && room.solo === room.code && room.kept === 'friends', JSON.stringify(room));
  check('and the lesson is held', room.lesson === 'defence_intercept', String(room.lesson));
  await war.until('window.__map && window.__map().ready && window.__map().id === "itaipu"', 600000).catch(() => {});
  await war.evaluate(`window.__warDo('start', ${JSON.stringify(PRACTICE_ID)})`);
  await war.until("window.__war().view.state === 'live'", 120000).catch(() => {});
  await war.until('window.__war().view.alive > 0', 30000).catch(() => {});
  const live = await war.evaluate("(() => { const v = window.__war().view; return { state: v.state, mission: v.mission, stage: v.stage ? v.stage.id : null, alive: v.alive, result: v.result ?? null }; })()");
  check('the practice started there goes live on its one stage, a Striker in the air, no result',
    live.state === 'live' && live.mission === PRACTICE_ID && live.stage === 'pass' && live.alive === 1 && live.result === null, JSON.stringify(live));
  await shot(war, 'defence-live');

  /* Working together, First Light released to every pilot (the owner,
   * 2026-10-15): the lesson held, its line, a new room for it. The page's
   * own refusal while it was held (src/main.js, training.mission_closed)
   * reads the build's release, which no check can hold in a browser. */
  await war.evaluate("window.__ui.show('title'); true");
  await war.sleep(300);
  await war.evaluate('(window.__training.open(), true)');
  await war.until("!!document.querySelector('.training-box')", 15000);
  await click(war, '[data-lesson="defence_mission"] .campaign-play');
  await war.sleep(800);
  const together = await war.evaluate("({ sub: (window.__ui.progress.log.at(-1) || {}).sub || '', code: window.__rooms().code, lesson: window.__ui.progress.lesson ? window.__ui.progress.lesson.lesson.id : null })");
  check('Working together, First Light released: the lesson held, it says to win First Light, and a new room is made',
    together.sub === 'Win First Light, mission 1 of Defend the Paraná, with other pilots or alone.' && Boolean(together.code) && together.code !== room.code
    && together.lesson === 'defence_mission', JSON.stringify(together));

  /* A SESSION THAT IS NOT THE LESSON'S (TRAINING.md 10): Turns held, then
   * a room joined as an invite's code joins one, a combat room's welcome:
   * the lesson is left and says so. The practice above kept its own. */
  await war.evaluate("window.__ui.show('title'); true");
  await war.sleep(300);
  await war.evaluate('(window.__training.open(), true)');
  await war.until("!!document.querySelector('.training-box')", 15000);
  await click(war, '[data-lesson="first_turns"] .campaign-play');
  await war.until("window.__ui.progress.lesson && window.__ui.progress.lesson.lesson.id === 'first_turns'", 15000).catch(() => {});
  const turnsHeld = await war.evaluate("window.__ui.progress.lesson ? window.__ui.progress.lesson.lesson.id : null");
  const other = await war.evaluate("window.__roomCreate({ map: 'swiss2', mode: 'combat', public: false })");
  await war.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(other)}`, 30000).catch(() => {});
  await war.until('window.__ui.progress.lesson === null', 10000).catch(() => {});
  const left = await war.evaluate("({ lesson: window.__ui.progress.lesson ? window.__ui.progress.lesson.lesson.id : null, mode: window.__rooms().mode, said: window.__ui.progress.log.map((t) => t.title + ': ' + t.sub) })");
  check('a session that is not the lesson\'s ends it and says so',
    turnsHeld === 'first_turns' && left.lesson === null && left.said.includes('Turns: Left for another session. Fly it again from Learn to fly.'), JSON.stringify({ turnsHeld, ...left, said: left.said.slice(-2) }));
} catch (e) {
  check('the Defence run finished', false, e.stack || String(e));
}
const warErrs = war.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e) && !e.startsWith('network:'));
check('no page error on the Defence page', warErrs.length === 0, warErrs.slice(0, 3).join(' | '));
await war.close();
await server.stop();
await rm(dir, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
