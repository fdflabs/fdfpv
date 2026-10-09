/*
 * warradio-selftest.js: Crest Control says the right line at the right
 * moment, once, and never two at a time (src/render/warradio.js).
 *
 *   npm run war:radio
 *
 * No browser: createWarCalls is pure, and WarRadio's queue runs on a
 * stand in element. Every line id it can say must be a line in
 * assets/audio/war/lines.json with a file in both languages and both
 * formats, or the shell asks for audio that is not there.
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWarCalls, WarRadio, QUEUE_MAX, STALE_MS, STORY_STALE_MS, warVoiceUrl, warMusicUrl, DUCK_DB, BED_FADE_MS,
} from '../src/render/warradio.js';
import { KINDS } from '../src/share/war/routes.js';
import { FILMS } from '../src/share/war/films/index.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const lineRecs = JSON.parse(readFileSync(join(root, 'assets/audio/war/lines.json'), 'utf8')).lines;
const lines = lineRecs.map((l) => l.id);
const said = new Set();
const calls = createWarCalls();
const v0 = {
  state: 'live', wave: 1, waves: 6, rack: 6, rackMax: 6, alive: 0, output: 14000, floor: 7000,
};
const say = (list, v) => {
  const out = calls.events(list, v);
  out.flat().forEach((id) => said.add(id));
  return out;
};

console.log('what Crest Control says');
check('the go', same(say([{ type: 'state', to: 'live' }], v0), ['start']));
/* A mission's own radio (its `radio`), or by its id for one from before. */
const radioOf = (m) => ({
  brief: m.radio?.brief ?? [`brief-${m.id}-1`, `brief-${m.id}-2`], win: m.radio?.win ?? `debrief-${m.id}-win`, lose: m.radio?.lose ?? `debrief-${m.id}-lose`,
});
/* A mission with an outro film says its win in the film, the debrief its
 * first line (the owner, 2026-10-08): the radio says nothing over it. */
for (const m of Object.values(MISSIONS)) {
  const r = radioOf(m);
  const win = m.outro ? [] : [r.win];
  check(`${m.id}: its briefing over the countdown, its debrief at the end${m.outro ? ' (the win in its outro)' : ''}`,
    same(say([{ type: 'state', to: 'countdown' }], { ...v0, state: 'countdown', mission: m.id }), r.brief)
    && same(say([{ type: 'state', to: 'won' }], { ...v0, state: 'won', mission: m.id }), win)
    && (!m.outro || FILMS[m.outro].shots[0].lines[0].line === r.win)
    && same(say([{ type: 'state', to: 'lost' }], { ...v0, state: 'lost', why: 'output', mission: m.id }), [r.lose]));
}
check('First Light\'s briefing is CREST\'s then TALLER\'s, its own', same(radioOf(MISSIONS['itaipu-1']).brief, ['itaipu-1-s0-brief', 'itaipu-1-s0-rules']));
for (const kind of KINDS.filter((k) => k !== 'jammer')) {
  /* A decoy is called as the Striker it looks like. */
  const line = `wave-${kind === 'decoy' ? 'strike' : kind}`;
  check(`a ${kind} wave`, same(say([{ type: 'born', agents: [{ kind }] }], { ...v0, alive: 1 }), [line]));
}
check('a jammer wave, which no mission spawns, says nothing', same(say([{ type: 'born', agents: [{ kind: 'jammer' }] }], { ...v0, alive: 1 }), [])
  && same(say([{ type: 'born', agents: [{ kind: 'jammer' }] }], { ...v0, wave: 6, alive: 1 }), []));
check('the last wave by name, whatever it is', same(say([{ type: 'born', agents: [{ kind: 'strike' }] }], { ...v0, wave: 6, alive: 3 }), ['wave-last']));
check('this pilot\'s kill, and the next one another take',
  same(say([{ type: 'boom', mine: true }, {
    type: 'dead', why: 'boom', mine: true, ids: [1], agents: [{ kind: 'strike' }],
  }], { ...v0, wave: 6, rack: 5, alive: 2 }), ['kill-1'])
  && same(say([{ type: 'boom', mine: true }, {
    type: 'dead', why: 'boom', mine: true, ids: [2], agents: [{ kind: 'strike' }],
  }], { ...v0, wave: 6, rack: 4, alive: 1 }), ['kill-2']));
check('a swarm in one blast, a jammer in it, and no jammer line',
  same(say([{ type: 'boom' }, {
    type: 'dead', why: 'boom', mine: true, ids: [3, 4], agents: [{ kind: 'fpv' }, { kind: 'jammer' }],
  }], { ...v0, wave: 6, rack: 3, alive: 1 }), ['kill-multi']));
check('a teammate\'s kill is the HUD\'s, not the radio\'s', same(say([{ type: 'boom' }, {
  type: 'dead', why: 'boom', mine: false, ids: [5], agents: [{ kind: 'strike' }],
}], { ...v0, wave: 6, rack: 2, alive: 1 }), ['rack-low']));
for (const [target, line] of [['intake-7', 'hit-intake'], ['penstock-3', 'hit-penstock'], ['gate-0', 'hit-gate'], ['yard-right', 'hit-yard']]) {
  check(`${target} hit`, same(say([{
    type: 'dead', why: 'arrive', hit: true, target, ids: [9], agents: [],
  }], { ...v0, wave: 6, rack: 2, alive: 1 }), [line]));
}
check('an impact off target says nothing', same(say([{
  type: 'dead', why: 'arrive', hit: false, target: 'intake-1', ids: [9], agents: [],
}], { ...v0, wave: 6, rack: 2, alive: 1 }), []));
check('a bird lost to no warhead, the last airframe, output low', same(say([], {
  ...v0, wave: 6, rack: 1, alive: 1, output: 7600,
}), ['bird-lost', 'rack-last', 'output-low']));
check('each of those once', same(say([], { ...v0, wave: 6, rack: 1, alive: 1, output: 7500 }), []));
check('a wave cleared with more to come', same(say([], { ...v0, wave: 3, rack: 1, alive: 0 }), ['wave-clear']));
check('a scout wave\'s last dying says scouts down, after the kill', same(say([{
  type: 'dead', why: 'boom', mine: false, ids: [2], agents: [{ kind: 'scout' }],
}, { type: 'scouts', at: 1, by: 2 }], { ...v0, wave: 2, rack: 6, alive: 1 }), ['scouts-down']));
check('a group drawn from a sector: MIRADOR\'s bearing then the kind, one item', same(say([{
  type: 'born', agents: [{ kind: 'strike', sector: 'NW' }],
}], { ...v0, wave: 3, rack: 6, alive: 2 }), [['bearing-nw', 'wave-strike']]));
for (const sector of ['N', 'NW', 'NE', 'HIGH', 'WATER', 'GORGE', 'RIVER', 'LINES']) {
  said.add(`bearing-${sector.toLowerCase()}`);
}
check('won', same(say([{ type: 'state', to: 'won' }], { ...v0, state: 'won' }), ['win']));
check('lost on output, the one way a mission is lost in rounds', same(say([{ type: 'state', to: 'lost' }], { ...v0, state: 'lost', why: 'output' }), ['lose-output']));
check('a round held, damaged and lost each say their line', same(calls.round('win'), ['wave-clear']) && same(calls.round('damaged'), ['output-low'])
  && same(calls.round('lost'), ['lose-rack']) && same(calls.round(null), []));
['win', 'damaged', 'lost'].forEach((r) => calls.round(r).forEach((id) => said.add(id)));
check('the calls have no link to hear (2026-09-29)', !('signal' in calls));
const linkLines = lineRecs
  .filter((l) => l.group === 'signal' || /jammer|relay|signal/.test(l.id)).map((l) => l.id);
check('no signal, relay or jammer line is ever said', linkLines.length > 0 && linkLines.every((id) => !said.has(id)), linkLines.join(', '));
for (const m of Object.values(MISSIONS)) {
  check(`${m.id} spawns no jammer`, m.waves.every((w) => w.kind !== 'jammer'));
}

console.log('every line said is a file');
const missing = [...said].filter((id) => !lines.includes(id));
check('every id is a line of lines.json', missing.length === 0, missing.join(', '));
const files = [];
for (const id of said) {
  for (const lang of ['en', 'es']) {
    for (const ext of ['webm', 'mp3']) {
      files.push(fileURLToPath(warVoiceUrl(lang, id, ext)));
    }
  }
}
for (const t of ['intro', 'combat']) {
  for (const ext of ['webm', 'mp3']) {
    files.push(fileURLToPath(warMusicUrl(t, ext)));
  }
}
const absent = files.filter((f) => !existsSync(f));
check(`all ${files.length} voice and music files are on disk where the shell asks`, absent.length === 0, absent.slice(0, 3).join(', '));
const unsaid = lines.filter((id) => !said.has(id) && !id.startsWith('intro-'));
console.log(`  info  lines the radio never says: ${unsaid.join(', ') || 'none'} (the intro's are the intro's)`);

console.log('one at a time');
const played = [];
const radio = new WarRadio();
radio.voice = { el: { play: () => null, set src(url) { played.push(url.split('/').slice(-2).join('/').replace(/\..*$/, '')); } } };
radio.bed = null;
for (const id of ['start', 'wave-strike', 'kill-1', 'kill-2', 'hit-yard', 'kill-1']) {
  radio.say(id, 0);
}
check(`the first plays, ${QUEUE_MAX} wait, the rest and a repeat are dropped`, radio.status().speaking === 'start'
  && same(radio.status().queue, ['wave-strike', 'kill-1', 'kill-2']), JSON.stringify(radio.status()));
radio.next(1000);
check('ended: the next in the queue', radio.status().speaking === 'wave-strike' && same(played, ['en/start', 'en/wave-strike']));
radio.next(STALE_MS + 1);
check(`a line that waited over ${STALE_MS} ms is dropped`, radio.status().speaking === null && radio.status().queue.length === 0);
radio.setLang('es');
radio.say('kill-1', 0);
radio.say('wave-fpv', 0);
radio.say('win', 0);
check('the end cuts in over the queue, in the UI\'s language', radio.status().speaking === 'win' && radio.status().queue.length === 0 && played.at(-1) === 'es/win', played.slice(-2).join(' '));

console.log('story over calls');
{
  const heard = [];
  const r = new WarRadio();
  r.voice = { el: { play: () => null, set src(url) { heard.push(url.split('/').slice(-1)[0].replace(/\..*$/, '')); } } };
  r.bed = null;
  r.say('start', 0);
  r.say('kill-1', 0);
  r.say('kill-2', 0);
  r.say('hit-yard', 0);
  r.say('beat-rack', 10, 'story');
  check('a story line pushes the oldest call out of a full queue', same(r.status().queue, ['kill-2', 'hit-yard', 'beat-rack']), JSON.stringify(r.status().queue));
  r.say('kill-1', 20);
  check('a call never pushes a story line out', same(r.status().queue, ['kill-2', 'hit-yard', 'beat-rack']));
  r.next(100);
  check('the story line is said before the calls waiting', r.status().speaking === 'beat-rack', r.status().speaking);
  r.next(200);
  r.next(200);
  r.next(200);
  r.say(['bearing-nw', 'wave-strike'], 300);
  r.next(400);
  check('a bearing and its kind are one item: nothing said between them', heard.slice(-2).join(' ') === 'bearing-nw wave-strike' && r.status().speaking === 'wave-strike',
    heard.join(' '));
  const s2 = new WarRadio();
  s2.voice = { el: { play: () => null, set src(url) {} } };
  s2.say('start', 0);
  s2.say('kill-1', 0);
  s2.say('beat-rack', 0, 'story');
  s2.next(STALE_MS + 500);
  check(`a story line waits up to ${STORY_STALE_MS} ms, a call ${STALE_MS}`, s2.status().speaking === 'beat-rack' && s2.status().queue.length === 0, JSON.stringify(s2.status()));
  s2.say('kill-2', STALE_MS + 600);
  s2.say('hit-yard', STALE_MS + 600, 'story');
  s2.next(STALE_MS + 600 + STORY_STALE_MS + 1);
  check('and past that it goes too', s2.status().speaking === null);
}

console.log('a pause in an item');
{
  /* The Interior's exchanges carry a pause in seconds between two lines
   * (CONTRACT-P0.md section 6): no file asked for it, the next line
   * after it once it is over, the pause not counted as said. */
  const heard = [];
  const r = new WarRadio();
  r.voice = { el: { play: () => null, pause: () => null, set src(url) { heard.push(url.split('/').slice(-1)[0].replace(/\..*$/, '')); } } };
  r.bed = null;
  r.say(['int1-s4-there', 0.05, 'int1-s4-goodeye'], 0, 'story');
  r.next(10);
  check('the pause asks for no file and is nobody speaking', heard.join(' ') === 'int1-s4-there' && r.status().speaking === null && r.status().said.join() === 'int1-s4-there,int1-s4-goodeye',
    JSON.stringify({ heard, status: r.status() }));
  await new Promise((done) => { setTimeout(done, 120); });
  check('and the line after it plays once the pause is over', heard.join(' ') === 'int1-s4-there int1-s4-goodeye' && r.status().speaking === 'int1-s4-goodeye', heard.join(' '));
  r.stop();
}

console.log('under voice chat');
{
  /* A teammate speaking for a second, frames of 16 ms: the radio's and
   * the music's element volumes against their level before. */
  const r = new WarRadio();
  r.voice = { el: { volume: 0 } };
  r.bed = { el: { volume: 0 } };
  r.track = 'combat';
  r.setOutput(0.8);
  r.setMusicLevel(1);
  const v0r = r.voice.el.volume;
  const m0 = r.bed.el.volume;
  const db = (v, ref) => 20 * Math.log10(v / ref);
  let t = 0;
  const run = (heard, ms) => {
    const end = t + ms;
    for (; t < end; t += 16) {
      r.duck(heard, t);
    }
  };
  run(false, 32);
  run(true, 96);
  const down = db(r.voice.el.volume, v0r);
  const downM = db(r.bed.el.volume, m0);
  run(true, 900);
  const held = db(r.voice.el.volume, v0r);
  run(false, 256);
  const half = db(r.voice.el.volume, v0r);
  run(false, 272);
  const back = db(r.voice.el.volume, v0r);
  check(`a teammate on voice ducks the radio and the music ${DUCK_DB} dB within 100 ms`, Math.abs(down - DUCK_DB) < 0.5 && Math.abs(downM - DUCK_DB) < 0.5 && Math.abs(held - DUCK_DB) < 1e-9,
    `radio ${down.toFixed(2)} dB, music ${downM.toFixed(2)} dB at 96 ms, ${held.toFixed(2)} dB held`);
  check('and they come back over about half a second after the last one stops', half < -3 && half > -7 && Math.abs(back) < 1e-9,
    `${half.toFixed(2)} dB at 256 ms, ${back.toFixed(2)} dB at 528 ms`);
  const quiet = new WarRadio();
  quiet.voice = { el: { volume: 0 } };
  quiet.setOutput(0.8);
  const before = quiet.voice.el.volume;
  for (let k = 0; k < 60; k += 1) {
    quiet.duck(false, k * 16);
  }
  check('with nobody talking the radio is never touched', quiet.voice.el.volume === before && quiet.status().duckDb === 0);
}

console.log('a bed asked to stop fades out');
{
  /* A room tone running, then silence asked for: the element's volume
   * steps down over BED_FADE_MS and only then is it paused and unloaded;
   * a track asked for during the fade cuts it short. */
  const stub = () => {
    const el = {
      volume: 0, paused: false, loop: false, src: 'x', currentTime: 0, calls: [],
      pause() { this.paused = true; this.calls.push('pause'); },
      play() { this.paused = false; this.calls.push('play'); return null; },
      load() { this.calls.push('load'); },
      removeAttribute() { this.src = ''; },
      addEventListener() {},
    };
    return el;
  };
  const r = new WarRadio();
  r.bed = { el: stub() };
  r.track = 'room';
  r.setOutput(0.8);
  r.setMusicLevel(1);
  const v0 = r.bed.el.volume;
  r.music('');
  const atOnce = { paused: r.bed.el.paused, volume: r.bed.el.volume };
  await new Promise((res) => { setTimeout(res, BED_FADE_MS / 2); });
  const mid = { paused: r.bed.el.paused, volume: r.bed.el.volume };
  await new Promise((res) => { setTimeout(res, BED_FADE_MS / 2 + 200); });
  const after = { paused: r.bed.el.paused, volume: r.bed.el.volume, src: r.bed.el.src };
  check('the bed keeps playing and is quieter half way through the fade', !atOnce.paused && !mid.paused && mid.volume < v0 * 0.7 && mid.volume > v0 * 0.2,
    `at once ${JSON.stringify(atOnce)}, half way ${JSON.stringify(mid)} of ${v0.toFixed(3)}`);
  check('and is paused and unloaded once the fade is over', after.paused && after.volume < 0.05 && after.src === '', JSON.stringify(after));
  const r2 = new WarRadio();
  r2.bed = { el: stub() };
  r2.track = 'room';
  r2.setOutput(0.8);
  r2.setMusicLevel(1);
  r2.music('');
  await new Promise((res) => { setTimeout(res, 200); });
  r2.music('interior');
  const v2 = r2.bed.el.volume;
  await new Promise((res) => { setTimeout(res, BED_FADE_MS); });
  check('a track asked for during the fade plays at full level and is never paused by it', !r2.bed.el.paused && r2.bed.el.calls.filter((c) => c === 'pause').length === 0 && Math.abs(r2.bed.el.volume - v2) < 1e-9 && v2 > 0.1,
    JSON.stringify({ v2, el: r2.bed.el }));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
