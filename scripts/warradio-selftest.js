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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWarCalls, WarRadio, QUEUE_MAX, STALE_MS, warVoiceUrl, warMusicUrl,
} from '../src/render/warradio.js';
import { KINDS } from '../src/share/war/routes.js';
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
  out.forEach((id) => said.add(id));
  return out;
};

console.log('what Crest Control says');
check('the go', same(say([{ type: 'state', to: 'live' }], v0), ['start']));
for (const kind of KINDS.filter((k) => k !== 'jammer')) {
  check(`a ${kind} wave`, same(say([{ type: 'born', agents: [{ kind }] }], { ...v0, alive: 1 }), [`wave-${kind}`]));
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
check('won', same(say([{ type: 'state', to: 'won' }], { ...v0, state: 'won' }), ['win']));
check('lost on output and on the rack', same(say([{ type: 'state', to: 'lost' }], { ...v0, state: 'lost', why: 'output' }), ['lose-output'])
  && same(say([{ type: 'state', to: 'lost' }], { ...v0, state: 'lost', why: 'rack' }), ['lose-rack']));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
