/*
 * music-selftest.js: the music bed (src/render/music.js) plays the right
 * crate at the right level. Node only: the real Music class is driven
 * against stand-in browser objects through which crate opens, what is
 * warmed, how a crate change fades and lands, the Music track setting,
 * skips, record ends and resumes, that the menu pick is a roll, and that
 * the real crates, empty today, give silence and nothing else.
 *
 * Run with npm run music:selftest. Exit 0 when every check passes.
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
 * music.js swaps two crates on one media element off the screen the player
 * is on: a state machine that lives entirely in browser objects (an audio
 * element, a media element source, gains, a fade on the audio clock), so
 * nothing else in tests/ can see it. The live audio-bed check can tell the
 * bed plays, not which bed, at which level, or whether a settings write cut
 * the menu record off mid bar. Every failure guarded here is silent: the
 * menu bed at the flight level, the wrong crate in the wrong place, a menu
 * skip writing a menu id into the flight setting, a settings write in the
 * menus restarting the bed, a swap that never lands, a menu pick that is a
 * constant rather than a roll.
 *
 * The real crates are empty since the unlicensed records came out
 * (NOTICE), so the walk, skip and warm paths run on the crates as they
 * stood (tests/fixtures/music-crates.js) and the empty crates get their own
 * section at the end.
 */

import { Music } from '../src/render/music.js';
import { TRACKS, MENU_TRACKS, MUSIC_REF_LUFS, trackGain, trackUrl, trackById, musicIds } from '../src/render/tracks.js';
import { FLIGHT, MENU } from '../tests/fixtures/music-crates.js';

/*
 * The bus gains at a Music setting of ten, restated rather than imported:
 * music.js does not export them and should not, and a constant a check reads
 * out of the file it checks cannot fail. If music.js moves one, this says so.
 */
const MENU_BUS = 0.30;
const FLIGHT_BUS = 0.90;
const LEVEL = 0.5;

/*
 * Stand-ins model only "which URL, which gain, which order"; nothing
 * decodes. A fade has no other observable effect, so the param keeps the
 * ramps scheduled since its last cancel.
 */
class FakeParam {
  constructor() {
    this.value = 0;
    this.ramps = [];
  }

  cancelScheduledValues() {
    this.ramps = [];
  }

  setValueAtTime(v) {
    this.value = v;
  }

  linearRampToValueAtTime(v, t) {
    this.ramps.push({ v, t });
  }

  rampsToward(v) {
    return this.ramps.some((r) => r.v === v);
  }
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam();
  }

  connect(node) {
    return node;
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
  }

  createGain() {
    return new FakeNode();
  }

  createMediaElementSource() {
    return new FakeNode();
  }
}

const constructed = [];

/*
 * Browser semantics music.js depends on, kept here or the checks prove the
 * wrong thing: assigning src is a new load (no duration, nothing ready,
 * position back to 0, without which a crate change would file the old
 * record's position under the new id), and play() resolves on a later turn
 * of the event loop.
 */
class FakeAudio {
  constructor() {
    this.preload = 'auto';
    this.loop = false;
    this.playsInline = false;
    this.muted = false;
    this.volume = 1;
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.paused = true;
    this.bufferedEnd = null;
    this.error = null;
    this.attributes = {};
    this.listeners = {};
    this.source = '';
    constructed.push(this);
  }

  get src() {
    return this.source;
  }

  set src(url) {
    this.source = url;
    this.duration = NaN;
    this.readyState = 0;
    this.currentTime = 0;
  }

  get buffered() {
    const end = this.bufferedEnd;
    return { length: end === null ? 0 : 1, end: () => end };
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    if (name === 'src') {
      this.source = '';
    }
  }

  load() {}

  canPlayType(mime) {
    return mime.includes('webm') ? 'maybe' : '';
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  dispatch(type) {
    (this.listeners[type] ?? []).forEach((fn) => fn());
  }

  play() {
    this.paused = false;
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  pause() {
    this.paused = true;
  }

  /* The header arrives: the element knows its duration and can seek. */
  loaded(duration) {
    this.duration = duration;
    this.readyState = 4;
    this.dispatch('loadedmetadata');
  }
}

globalThis.Audio = FakeAudio;
const connection = { saveData: false };
/* Node 22's navigator is a getter-only accessor: assignment does not
 * replace it. */
Object.defineProperty(globalThis, 'navigator', { value: { connection }, configurable: true });

/* music.js does not warm while a start is pending, so a tick expected to
 * warm, or to prove nothing warms, must first let play() settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const idOf = (url) => (url ? new URL(url).pathname.split('/').pop().replace(/\.[^.]*$/, '') : '');
const isIn = (crate, id) => crate.some((r) => r.id === id);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const orNothing = (id) => id || 'nothing';

const failures = [];
let sections = 0;
function section(heading) {
  if (sections > 0) {
    console.log('');
  }
  sections += 1;
  console.log(heading);
}

function check(name, ok, note = '') {
  const shown = typeof note === 'string' && note !== '' ? `  ${note}` : '';
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${shown}`);
  if (!ok) {
    failures.push({ name, note });
  }
}

/* setContext, the 0.25 s fade down run out, and the tick that lands it. */
function fullSwap(music, ctx, to) {
  music.setContext(to);
  ctx.currentTime += 0.3;
  music.tick(ctx.currentTime);
}

const music = new Music({ menu: MENU, flight: FLIGHT });
const ctx = new FakeContext();
let nodes = 0;
music.setEnabled(true);
music.setLevel(LEVEL);
music.attach(ctx, new FakeNode(), (node) => {
  nodes += 1;
  return node;
});
await settle();
const el = music.el;
const playing = () => idOf(el.src);

section('the bed opens in the menus');
const openedOn = playing();
const opened = MENU.find((r) => r.id === openedOn);
check('the graph is four nodes', nodes === 4, String(nodes));
check('the element holds a menu record', isIn(MENU, openedOn), openedOn);
check('the bus is the menu bus', near(music.gain.gain.value, LEVEL * MENU_BUS), `${music.gain.gain.value} against ${LEVEL * MENU_BUS}`);
check('the menu bed does not loop', el.loop === false);
const openGain = opened ? trackGain(opened) : NaN;
check('the record plays levelled, at its own gain', Math.abs(el.volume - openGain) < 1e-12, `${el.volume} against ${openGain}`);
const fixtures = [...FLIGHT, ...MENU];
check(
  'every record has a measured loudness and is only ever turned down',
  fixtures.every((r) => Number.isFinite(r.lufs) && r.lufs >= MUSIC_REF_LUFS && trackGain(r) <= 1),
  fixtures.map((r) => `${r.id} ${r.lufs}`).join(', '),
);
check('preload is still none', el.preload === 'none');
check('status names the crate', music.status().context === 'menu');

section('the menus buy the flight track');
const leftAt = 61.5;
el.loaded(240);
el.currentTime = leftAt;
el.bufferedEnd = 95;
await settle();
music.tick(ctx.currentTime);
const flightId = FLIGHT[music.flightIndex].id;
const warm = constructed.at(-1);
check('the warm is the flight track, not the next menu one', music.warmId === flightId, orNothing(music.warmId));
check('the warm element asks for that file', warm.src === trackUrl(flightId, music.ext));
check('the warm is muted and preloads', warm.muted === true && warm.preload === 'auto');
music.dropWarm();
el.bufferedEnd = leftAt + 4.5;
await settle();
music.tick(ctx.currentTime);
check('nothing is warmed while the menu bed is only 4.5 s ahead of itself', music.warmId === '', orNothing(music.warmId));
el.bufferedEnd = 95;
connection.saveData = true;
await settle();
music.tick(ctx.currentTime);
check('nothing is warmed at all under Save-Data', music.warmId === '', orNothing(music.warmId));
connection.saveData = false;

section('the swap into flight');
const t0 = ctx.currentTime;
music.setContext('flight');
check('setContext arms rather than swaps', music.context === 'menu' && music.pendingContext === 'flight');
check('the swap gain is on its way to zero', music.swap.gain.rampsToward(0));
ctx.currentTime = t0 + 0.1;
music.tick(ctx.currentTime);
check('a tick inside the fall does not swap', music.context === 'menu');
ctx.currentTime = t0 + 0.3;
music.tick(ctx.currentTime);
check('a tick after the fall does', music.context === 'flight');
check('the element holds a flight record', isIn(FLIGHT, playing()), playing());
check('the bus is the flight bus', near(music.gain.gain.value, LEVEL * FLIGHT_BUS), `${music.gain.gain.value} against ${LEVEL * FLIGHT_BUS}`);
check('the swap gain is on its way back up', music.swap.gain.rampsToward(1));
const kept = music.resumeAt[openedOn];
check('the menu record kept its place', near(kept, leftAt), `${kept} against ${leftAt}`);
check('the flight bus is three times the menu bus', near(FLIGHT_BUS / MENU_BUS, 3));

section('the Music track setting is about the flight crate only');
await settle();
el.loaded(200);
el.currentTime = 30;
music.setTrack('neon-horizon');
check('picking a track in flight loads it', playing() === 'neon-horizon', playing());
check('a pinned flight track loops', el.loop === true);
fullSwap(music, ctx, 'menu');
check('a pinned flight track does not make the MENU bed loop', el.loop === false);
const menuSrc = el.src;
music.setTrack('tarmac-pulse');
check('a settings write in the menus leaves the element alone', el.src === menuSrc);
check('but the choice is remembered', music.selection === 'tarmac-pulse' && FLIGHT[music.flightIndex].id === 'tarmac-pulse');
fullSwap(music, ctx, 'flight');
check('and it is what plays on the way back', playing() === 'tarmac-pulse', playing());

section('skip, end and the resume');
fullSwap(music, ctx, 'menu');
el.loaded(240);
const beforeSkip = playing();
music.skip(1);
check('a menu skip stays inside the menu crate', isIn(MENU, playing()), playing());
check('and it moves', playing() !== beforeSkip);
check('a menu skip does not rewrite the flight selection', music.selection === 'tarmac-pulse');
check('a skip asks for the top of the record', music.seekTo === 0, String(music.seekTo));
const beforeEnd = playing();
el.dispatch('ended');
check('the menu crate walks on ended rather than looping', playing() !== beforeEnd, playing());
/* 295 s leaves 7 s of a 302 s record, inside the 15 s margin; 120 s does
 * not. */
music.seekTo = 295;
el.duration = 302;
el.currentTime = 0;
music.onMeta();
check('a resume inside the last 15 s is refused', el.currentTime === 0, String(el.currentTime));
music.seekTo = 120;
el.currentTime = 0;
music.onMeta();
check('a resume with room left is honoured', el.currentTime === 120, String(el.currentTime));

/*
 * The pick IS a roll, so the resume is proven by parking a record part way
 * and returning until the roll lands on it again. 88.25 is exact in binary
 * and differs from the 61.5 above, so only this record's own stored place
 * can produce it.
 */
section('the resume, end to end');
const parkAt = 88.25;
el.loaded(240);
el.currentTime = parkAt;
const parked = playing();
let returns = 0;
do {
  fullSwap(music, ctx, 'flight');
  fullSwap(music, ctx, 'menu');
  returns += 1;
} while (playing() !== parked && returns < 40);
check('the roll came back to the parked record inside forty returns', playing() === parked, `${returns} returns`);
check('and it is parked to resume where it was', near(music.seekTo, parkAt), `${music.seekTo} against ${parkAt}`);
el.loaded(240);
check('and the element is seeked there once the metadata lands', near(el.currentTime, parkAt), String(el.currentTime));

/*
 * With two menu records, a pick that is secretly constant passes every
 * other check. Forty returns make a miss about one in five hundred billion.
 */
section('the roll');
const seen = new Set();
for (let i = 0; i < 40; i++) {
  fullSwap(music, ctx, 'flight');
  fullSwap(music, ctx, 'menu');
  seen.add(playing());
}
check('every menu record comes up across forty returns', seen.size === MENU.length, [...seen].join(', '));

section('a swap nobody can hear lands at once');
music.setEnabled(false);
music.setContext('flight');
check('with music off the context changes immediately, without waiting on a tick', music.context === 'flight' && music.pendingContext === '');
music.setEnabled(true);
check('and the bus comes back on the right bed', near(music.gain.gain.value, LEVEL * FLIGHT_BUS), String(music.gain.gain.value));

/*
 * Until licensed records exist the game ships no music: no element pointed
 * at a file, no play, no warm, nothing for the dock to name, and every
 * control that walks a crate a no-op rather than a throw.
 */
section('the real crates, which are empty');
check('the flight and menu crates are empty', TRACKS.length === 0 && MENU_TRACKS.length === 0, `${TRACKS.length} and ${MENU_TRACKS.length}`);
check('the Music track setting offers only rotation', JSON.stringify(musicIds()) === '["rotation"]', JSON.stringify(musicIds()));
check('a removed record is no record, not another one', trackById('tarmac-pulse') === null);
const before = constructed.length;
const empty = new Music();
const emptyCtx = new FakeContext();
empty.setEnabled(true);
empty.setLevel(LEVEL);
empty.attach(emptyCtx, new FakeNode(), (node) => node);
await settle();
const bare = empty.el;
check('the element is pointed at nothing', bare.src === '', String(bare.src));
check('and is not playing', bare.paused);
check('status names nothing', empty.status().id === '' && empty.status().name === '');
empty.skip(1);
empty.skip(-1);
bare.dispatch('ended');
bare.dispatch('error');
check('skips, an end and an error change nothing', bare.src === '' && bare.paused, String(bare.src));
empty.setTrack('tarmac-pulse');
check('a stored id of a removed record falls back to rotation', empty.selection === 'rotation', empty.selection);
empty.setContext('flight');
emptyCtx.currentTime = 0.3;
empty.tick(emptyCtx.currentTime);
check('flight is silent too', empty.context === 'flight' && bare.src === '' && bare.paused, String(bare.src));
bare.paused = false;
empty.tick(emptyCtx.currentTime);
const made = constructed.length - before;
check('nothing is ever warmed', empty.warmId === '' && made === 1, `${orNothing(empty.warmId)}, ${made} elements`);

console.log('');
if (failures.length === 0) {
  console.log('all passed');
} else {
  console.log(`${failures.length} failed`);
  failures.forEach(({ name, note }) => console.log(`  FAIL ${name}${typeof note === 'string' && note !== '' ? `  (${note})` : ''}`));
}
process.exitCode = failures.length === 0 ? 0 : 1;
