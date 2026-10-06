/*
 * replay-sound.js: a flight's sound replayed as it was, on the real shell
 * (src/replay/sound.js, src/render/replaybeds.js; the owner: "all sounds
 * all audio all things need to come through").
 *
 *   SIM_GPU=1 npm run replay:sound
 *
 * One headless page flies on its own with the music on. While it flies
 * the check makes the craft's own one shot sounds through the shell's
 * audio (a landing cue, an impact, the gear locking), as the flight would.
 * Then its crash cam is opened. What must hold:
 *
 *   - the clip kept the engine's air every row, the record that played
 *     and how far into it, and each one shot sound at its moment
 *   - under the replay the live record is held silent, and the replay's
 *     bed plays that record where the clip says it had got to, moving
 *     with the playhead (a jump lands it where it should be)
 *   - closed, the live record plays again and the replay's bed is quiet
 *   - the audio graph stays inside its 64 nodes, and no page error
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SEEK_S } from '../src/render/replaybeds.js';
import { AIR_N, bedAt } from '../src/replay/sound.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ARGS = ['--autoplay-policy=no-user-gesture-required'];
/* src/render/audio.js's own ceiling on live nodes (tests/thresholds.json). */
const NODES_MAX = 64;

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

function seed() {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.sound = true;
  s.musicLevel = 5;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.soundSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { soundSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

/* The live record and the replay's bed as they stand now. */
const BEDS = `(() => {
  const a = window.__audio;
  const m = a.music;
  const r = a.replayRadio;
  const el = r && r.radio.bed ? r.radio.bed.el : null;
  return {
    live: { id: m.track && m.track.id, paused: !m.el || m.el.paused, at: m.el ? m.el.currentTime : null },
    replay: el ? { src: el.currentSrc || el.src || '', paused: el.paused, at: el.currentTime, rate: el.playbackRate } : null,
    nodes: a.nodeCount(),
  };
})()`;

const a = await openPage({
  root, url: '/index.html', width: 1280, height: 720, seed: seed(), args: ARGS,
});
try {
  await a.until('window.__shellReady === true', 300000);
  await a.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  await a.tap('KeyZ');
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.until('window.__audio.music.el && !window.__audio.music.el.paused', 30000).catch(() => {});
  const before = await a.evaluate(BEDS);
  check('flying, the record plays', before.live.id && !before.live.paused, JSON.stringify(before.live));
  await a.sleep(3000);
  /* The craft's own one shot sounds, through the shell's audio as the
   * flight makes them. */
  await a.evaluate("window.__audio.event('land'); true");
  await a.sleep(400);
  await a.evaluate('window.__audio.impact(0.6, 0.8, 5); true');
  await a.sleep(400);
  await a.evaluate("window.__audio.mechanical('gear'); true");
  await a.sleep(2500);

  await a.evaluate('window.__crashCam.open(); true');
  await a.until("window.__craftState().mode === 'replay'", 10000);
  const kept = await a.evaluate(`(() => {
    const c = window.__crashCam.h().clip();
    if (!c.sound) {
      return null;
    }
    return { n: c.n, air: c.sound.air.length, events: c.sound.events.map((e) => ({ t: e.t, call: e.call, args: e.args })), end: c.time[c.n - 1] };
  })()`);
  const calls = kept ? kept.events.map((e) => e.call) : [];
  check('the clip kept the air every row, the record and the three moments', kept && kept.air === kept.n * AIR_N && calls.includes('music')
    && ['event', 'impact', 'mechanical'].every((c) => calls.includes(c)), kept ? calls.join(',') : 'no sound');
  const music = kept ? kept.events.find((e) => e.call === 'music' && e.args[0]) : null;
  check('the record kept at the start is the one that played', music && music.args[0] === before.live.id, music ? JSON.stringify(music) : 'none');

  /* A jump to a moment, then play: the bed is that record, where it was. */
  const land = kept.events.find((e) => e.call === 'event');
  const t = Math.max(0, land.t - 1);
  await a.evaluate(`window.__crashCam.h().api.seek(${t}); window.__crashCam.h().api.togglePlay(); true`);
  await a.sleep(600);
  const under = await a.evaluate(BEDS);
  /* The record at the playhead, as the clip says (it may have changed
   * record since the start), a little after the jump. */
  const want = bedAt(kept.events, 'music', t + 0.6);
  check('under the replay the live record is held silent', under.live.paused, JSON.stringify(under.live));
  check('and the replay plays the record the clip kept, where it had got to', want && under.replay && under.replay.src.includes(want.id) && !under.replay.paused
    && Math.abs(under.replay.at - want.at) < SEEK_S + 0.6, under.replay ? `${under.replay.src.split('/').pop()} at ${under.replay.at.toFixed(2)} s, want ${want && want.id} about ${want && want.at.toFixed(2)}` : 'no bed');
  await a.sleep(1800);
  check(`the audio graph holds at most ${NODES_MAX} nodes under the replay`, (await a.evaluate(BEDS)).nodes <= NODES_MAX);

  /* A jump back: the bed lands where it should. */
  const back = Math.max(0, t - 2);
  await a.evaluate(`window.__crashCam.h().api.seek(${back}); window.__crashCam.h().api.togglePlay(); true`);
  await a.sleep(400);
  const jumped = await a.evaluate(BEDS);
  const wantBack = bedAt(kept.events, 'music', back + 0.4);
  check('a jump back puts the bed back too', wantBack && jumped.replay && jumped.replay.src.includes(wantBack.id) && Math.abs(jumped.replay.at - wantBack.at) < SEEK_S + 0.6,
    jumped.replay ? `${jumped.replay.src.split('/').pop()} at ${jumped.replay.at.toFixed(2)} s, want ${wantBack && wantBack.id} about ${wantBack && wantBack.at.toFixed(2)}` : 'no bed');

  await a.evaluate('window.__crashCam.h().api.close(); true');
  await a.until("window.__craftState().mode === 'flight'", 10000);
  await a.sleep(1500);
  const after = await a.evaluate(BEDS);
  check('closed, the live record plays again and the replay\'s bed is quiet', !after.live.paused && (!after.replay || after.replay.paused || !after.replay.src),
    JSON.stringify(after));
  const errs = a.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await a.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
