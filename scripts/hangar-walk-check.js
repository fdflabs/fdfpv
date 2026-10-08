/*
 * hangar-walk-check.js: the walkable hangar driven through the real shell
 * as a pilot would (docs/HANGAR-ROOM.md): the Hangar hub and its Walk in
 * card clicked with a real pointer, the pilot walked with held keys to
 * every station that opens something, its prompt read off the screen, E
 * pressed, the screen it opens checked and backed out of, a drag turning
 * the camera, Escape back to the hub, and the door flying. Pictures and
 * the room's draw calls in the real shell go to OUT_DIR.
 *
 *     SIM_GPU=1 node scripts/hangar-walk-check.js [OUT_DIR]
 *
 * Run with npm run hangar:walk, through ~/.cache/run-check-slot.sh here.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo } from '../tests/lib/page.js';
import {
  ROOMS, LAYOUTS, CELL, TIER_LEVELS, tierFor, occupancy, blocked, cellAt, cellCentre,
} from '../src/game/hangarroom.js';
import en from '../src/strings/en.js';
import { levelOf, LEVEL_XP } from '../src/game/progress.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || join(tmpdir(), 'hangar-walk-check');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

const page = await openPage({ root, width: 1600, height: 900, url: '/index.html', account: 'Tester' });
const key = (type, code) => page.cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo(code) }, page.sessionId);
async function hold(code, ms) {
  await key('keyDown', code);
  await page.sleep(ms);
  await key('keyUp', code);
}
const stats = () => page.evaluate('window.__walkStats()');
/* until, saying where the shell was when it gave up. */
async function need(expr, ms) {
  try {
    await page.until(expr, ms);
  } catch (e) {
    const at = await page.evaluate('JSON.stringify({ screen: window.__ui.screen, hub: window.__ui.hub, walk: Boolean(window.__ui.walk), stats: window.__walkStats && window.__walkStats() })');
    console.log(`stuck at ${at}; errors: ${page.errors.slice(0, 5).join(' | ')}`);
    throw e;
  }
}
async function shot(name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}

/* A path over the grid's free cells, centre to centre, from the pilot to
 * a station's spot: what a pilot steers by. */
function path(room, occ, from, to) {
  const free = (i, j) => i >= 0 && j >= 0 && i < room.w && j < room.d && !blocked(room, occ, ...cellCentre(room, i, j));
  const [si, sj] = cellAt(room, from.x, from.z);
  const [ti, tj] = cellAt(room, to.x, to.z);
  const prev = new Map([[`${si},${sj}`, null]]);
  const queue = [[si, sj]];
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === ti && j === tj) {
      break;
    }
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (free(a, b) && !prev.has(`${a},${b}`)) {
        prev.set(`${a},${b}`, [i, j]);
        queue.push([a, b]);
      }
    }
  }
  const steps = [];
  for (let c = [ti, tj]; c; c = prev.get(`${c[0]},${c[1]}`)) {
    const [x, z] = cellCentre(room, c[0], c[1]);
    steps.unshift({ x, z });
  }
  steps.push({ x: to.x, z: to.z });
  return steps.slice(1);
}

/* Steer to each point with the real keys: taps of A or D until roughly
 * facing it, then W in short presses (a key held over the protocol lands
 * late, so a hold sized to the turn overshoots by half a turn); the walk slides along whatever the
 * rough aim brushes, as it does for a pilot. */
async function walkTo(room, occ, target) {
  let s = await stats();
  for (const p of path(room, occ, s.pose, target)) {
    for (let k = 0; k < 200; k += 1) {
      s = await stats();
      const dx = p.x - s.pose.x;
      const dz = p.z - s.pose.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) {
        break;
      }
      const want = Math.atan2(dx, -dz);
      trace.push(`to ${p.x.toFixed(2)},${p.z.toFixed(2)} at ${s.pose.x.toFixed(2)},${s.pose.z.toFixed(2)} h ${s.pose.heading.toFixed(2)} want ${want.toFixed(2)}`);
      let err = want - s.pose.heading;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      if (Math.abs(err) > 0.3) {
        await hold(err > 0 ? 'KeyD' : 'KeyA', Math.abs(err) > 1 ? 120 : 30);
      } else {
        await hold('KeyW', dist > 0.6 ? 120 : 40);
      }
    }
  }
  return stats();
}

/* Every steering step, written to OUT_DIR for when a walk falls short. */
const trace = [];
/* The main room is as big as the pilot's level: read off the shell. */
let room = null;
let occ = null;
const fieldRoom = ROOMS.field;
const fieldOcc = occupancy(fieldRoom, LAYOUTS.field);

try {
  await page.until('window.__shellReady === true', 300000);
  await page.loaded(60000);
  await page.evaluate('window.__ui.hub = null; window.__ui.show("title"); window.__ui.renderMenu(); true');
  await page.sleep(300);
  check('the Hangar hub card clicked', await page.click('.gate-card.gate-card-hub-hangar'), 'clicked');
  await page.until("window.__ui.hub === 'hangar'", 10000);
  const walkCard = '.gate-card.gate-card-hangar-walk';
  check('the Hangar shows a Walk in card', (await page.evaluate(`document.querySelector('${walkCard} .gate-card-name')?.textContent`)) === en['walk.card'], en['walk.card']);
  check('Walk in clicked', await page.click(walkCard), 'clicked');
  await need("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
  await page.sleep(800);
  await shot('01-door');
  let s = await stats();
  const xp = await page.evaluate('window.__ui.progress.state.xp');
  const unlockAll = await page.evaluate('Boolean(window.__ui.progress.state.unlockAll)');
  const want = tierFor(levelOf(xp), unlockAll);
  check('the main room is the size the pilot\'s level opened', s.tier === want, `${s.tier} at ${xp} XP, unlock all ${unlockAll}, want ${want}`);
  room = ROOMS[s.tier];
  occ = occupancy(room, LAYOUTS[s.tier]);
  check('at the door', s.pose.z > (room.d * CELL) / 2 - 1.5, JSON.stringify(s.pose));
  check('at the door the camera stands well back, out of the open door', s.view.camBack > 2.5, `${s.view.camBack.toFixed(2)} m behind`);
  const legend = await page.evaluate("document.querySelector('.frame-legend')?.textContent || ''");
  check('the command bar names the walk keys', legend.includes(en['walk.walk']) && legend.includes(en['walk.use']), JSON.stringify(legend));

  const z0 = s.pose.z;
  await hold('KeyW', 500);
  s = await stats();
  check('W held walks the pilot forward', s.pose.z < z0 - 0.4, `z ${z0.toFixed(2)} -> ${s.pose.z.toFixed(2)}`);
  const h0 = s.pose.heading;
  await hold('KeyD', 300);
  s = await stats();
  check('D held turns right', s.pose.heading > h0 + 0.3, `heading ${h0.toFixed(2)} -> ${s.pose.heading.toFixed(2)}`);

  /* A drag on the room turns the camera round the pilot. */
  const o0 = await page.evaluate('window.__ui.walk.orbit');
  for (const [type, x] of [['mouseMoved', 800], ['mousePressed', 800], ['mouseMoved', 900], ['mouseMoved', 1000], ['mouseReleased', 1000]]) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x, y: 450, button: 'left', clickCount: 1 }, page.sessionId);
  }
  const o1 = await page.evaluate('window.__ui.walk.orbit');
  check('a drag turns the camera', Math.abs(o1 - o0) > 0.5, `orbit ${o0.toFixed(2)} -> ${o1.toFixed(2)}`);
  await page.sleep(500);
  await shot('02-orbit');

  /* Photo mode: P, a drag and the wheel aim, Space and the command bar's
   * Take keep a picture for the photo wall. */
  const photos = () => page.evaluate("import('/src/ui/photostore.js').then((m) => m.listPhotos()).then((r) => r.length)");
  const before = await photos();
  await page.tap('KeyP');
  await page.until('Boolean(window.__ui.walk.photo)', 5000);
  const photoLegend = await page.evaluate("document.querySelector('.frame-legend')?.textContent || ''");
  check('P turns photo mode on and the command bar says Take', photoLegend.includes(en['walk.photo_take']), JSON.stringify(photoLegend));
  const p0 = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.walk.photo))');
  for (const [type, x] of [['mouseMoved', 700], ['mousePressed', 700], ['mouseMoved', 760], ['mouseReleased', 760]]) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x, y: 400, button: 'left', clickCount: 1 }, page.sessionId);
  }
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 400, deltaX: 0, deltaY: -200 }, page.sessionId);
  const p1 = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.walk.photo))');
  check('a drag turns round the stand and the wheel zooms', p1.yaw !== p0.yaw && p1.zoom < p0.zoom, `yaw ${p0.yaw.toFixed(2)} -> ${p1.yaw.toFixed(2)}, zoom ${p0.zoom} -> ${p1.zoom.toFixed(2)}`);
  await page.sleep(400);
  await shot('02b-photo-mode');
  await page.tap('Space');
  await page.until(`import('/src/ui/photostore.js').then((m) => m.listPhotos()).then((r) => r.length === ${before + 1})`, 15000).then(() => true, () => false);
  check('Space keeps a picture', (await photos()) === before + 1, `${before} -> ${await photos()}`);
  check('the Take button, clicked', await page.click('.frame-legend .legend-act[data-action="walk-photo-take"]'), 'clicked');
  await page.until(`import('/src/ui/photostore.js').then((m) => m.listPhotos()).then((r) => r.length === ${before + 2})`, 15000).then(() => true, () => false);
  check('and so does the Take button', (await photos()) === before + 2, `${await photos()}`);
  await page.tap('KeyP');
  await page.until('!window.__ui.walk.photo', 5000);
  await page.until(`window.__walkStats().view.photos === ${Math.min(6, before + 2)}`, 10000).then(() => true, () => false);
  const wall = (await stats()).view.photos;
  check('P again leaves photo mode, and the photo wall shows the pictures', wall === Math.min(6, before + 2), `${wall} on the wall`);

  const view = (await stats()).view;
  console.log(`room in the real shell: ${view.calls} draw calls, ${view.triangles} triangles`);
  check('the room draws within the High budget\'s calls in the shell', view.calls <= 70, `${view.calls} calls`);

  /* Each station that opens something: walk there, read the prompt, E. */
  const opens = {
    stand: { label: en['walk.stand'], open: 'window.__ui.carousel.isOpen' },
    bench: { label: en['walk.bench'], open: 'window.__ui.hangar.isOpen' },
    shelf: { label: en['walk.shelf'], open: 'window.__ui.hangar.isOpen' },
    shop: { label: en['walk.shop'], open: "window.__ui.hangar.isOpen && window.__ui.hangar.tab === 'shop'" },
    trophies: { label: en['walk.trophies'], open: "window.__ui.hangar.isOpen && window.__ui.hangar.tab === 'challenges'" },
  };
  for (const st of s.stations.filter((x) => opens[x.id])) {
    const want = opens[st.id];
    s = await walkTo(room, occ, st);
    await page.sleep(200);
    const prompt = await page.evaluate(`(() => { const p = document.querySelector('.walk-prompt'); return p && !p.hidden ? { station: p.dataset.station, text: p.textContent, shown: getComputedStyle(p).display !== 'none' } : null; })()`);
    check(`${st.id}: walked there with the keys`, Math.hypot(s.pose.x - st.x, s.pose.z - st.z) < 0.6, `at ${s.pose.x.toFixed(2)}, ${s.pose.z.toFixed(2)}, spot ${st.x.toFixed(2)}, ${st.z.toFixed(2)}`);
    check(`${st.id}: its prompt shows`, prompt && prompt.shown && prompt.station === st.id && prompt.text.includes(want.label), JSON.stringify(prompt));
    await shot(`03-${st.id}`);
    await page.tap('KeyE');
    await page.until(want.open, 15000).then(() => true, () => false);
    check(`${st.id}: E opens its screen`, await page.evaluate(want.open), want.open);
    await page.sleep(600);
    await shot(`04-${st.id}-open`);
    await page.tap('Escape');
    await page.until(`!(${want.open})`, 15000).then(() => true, () => false);
    check(`${st.id}: Escape comes back to the room`, await page.evaluate("window.__ui.screen === 'walk' && !window.__ui.carousel.isOpen && !window.__ui.hangar.isOpen"), await page.evaluate('window.__ui.screen'));
  }

  await page.tap('Escape');
  await page.until("window.__ui.screen === 'title'", 10000).then(() => true, () => false);
  check('Escape leaves to the Hangar hub', await page.evaluate("window.__ui.screen === 'title' && window.__ui.hub === 'hangar' && window.__walkStats() === null"), await page.evaluate('JSON.stringify([window.__ui.screen, window.__ui.hub])'));

  /* The war's field hangar, from the Operations hub: its own room. */
  await page.evaluate('window.__ui.hub = null; window.__ui.renderMenu(); true');
  await page.sleep(300);
  check('the Operations hub card clicked', await page.click('.gate-card.gate-card-hub-ops'), 'clicked');
  await page.until("window.__ui.hub === 'ops'", 10000);
  const fieldCard = '.gate-card.gate-card-ops-field';
  check('Operations shows a Field hangar card', (await page.evaluate(`document.querySelector('${fieldCard} .gate-card-name')?.textContent`)) === en['walk.field'], en['walk.field']);
  check('Field hangar clicked', await page.click(fieldCard), 'clicked');
  await need("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
  await page.sleep(800);
  s = await stats();
  check('in the field hangar, not the main one', s.tier === 'field', s.tier);
  const crumb = await page.evaluate("document.querySelector('.frame-crumb, .crumb')?.textContent || ''");
  check('the breadcrumb says Operations / Field hangar', crumb.includes(en['hub.ops']) && crumb.includes(en['walk.field']) && !crumb.includes(en['walk.card']), JSON.stringify(crumb));
  await shot('06-field-door');
  const fieldDoor = await page.evaluate("document.querySelector('.walk-prompt').hidden ? null : document.querySelector('.walk-prompt').textContent");
  check('field: its door goes to the front, not to free flight', fieldDoor === null || (fieldDoor.includes(en['walk.door_war']) && !fieldDoor.includes(en['walk.door'])), JSON.stringify(fieldDoor));
  const fieldBench = s.stations.find((x) => x.id === 'bench');
  s = await walkTo(fieldRoom, fieldOcc, fieldBench);
  await page.sleep(200);
  const fp = await page.evaluate("document.querySelector('.walk-prompt').hidden ? null : document.querySelector('.walk-prompt').dataset.station");
  check('field: walked to its bench with the keys and its prompt shows', fp === 'bench' && Math.hypot(s.pose.x - fieldBench.x, s.pose.z - fieldBench.z) < 0.6, `${fp} at ${s.pose.x.toFixed(2)}, ${s.pose.z.toFixed(2)}`);
  await shot('07-field-bench');
  const fieldView = (await stats()).view;
  console.log(`field hangar in the real shell: ${fieldView.calls} draw calls, ${fieldView.triangles} triangles`);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'title'", 10000).then(() => true, () => false);
  check('Escape leaves the field hangar to the Operations hub', await page.evaluate("window.__ui.screen === 'title' && window.__ui.hub === 'ops'"), await page.evaluate('JSON.stringify([window.__ui.screen, window.__ui.hub])'));

  await page.evaluate('window.__ui.hub = null; window.__ui.renderMenu(); true');
  await page.sleep(300);
  /* A pilot who has flown to the workshop's level walks into the
   * workshop: progress as flying leaves it, set in place. */
  await page.evaluate(`(() => { const p = window.__ui.progress.state; p.unlockAll = false; p.xp = ${LEVEL_XP[TIER_LEVELS.workshop - 1]};
    p.firsts = { 'mission:m1:win': true, 'mission:m1:star1': true, 'aircraft:timber1500:flight': true, 'lesson:hover': true, 'aircraft:cub1400:ten': false }; return true; })()`);
  check('the Hangar hub card clicked again', await page.click('.gate-card.gate-card-hub-hangar'), 'clicked');
  await page.until("window.__ui.hub === 'hangar'", 10000);
  check('Walk in again', await page.click(walkCard), 'clicked');
  await need("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
  s = await stats();
  check('at the workshop\'s level the room is the workshop', s.tier === 'workshop', s.tier);
  room = ROOMS[s.tier];
  occ = occupancy(room, LAYOUTS[s.tier]);
  await shot('05-workshop');
  check('the trophy wall holds one trophy per first paid, none for one unpaid', s.view.trophies === 4, `${s.view.trophies} trophies`);
  const door = s.stations.find((x) => x.id === 'door');
  s = await walkTo(room, occ, door);
  await page.sleep(200);
  const doorPrompt = await page.evaluate("document.querySelector('.walk-prompt').hidden ? null : document.querySelector('.walk-prompt').textContent");
  check('door: its prompt says Fly', Boolean(doorPrompt) && doorPrompt.includes(en['walk.door']), JSON.stringify(doorPrompt));
  await shot('05-door-prompt');
  await page.tap('KeyE');
  await page.until("window.__ui.screen !== 'walk'", 15000).then(() => true, () => false);
  const after = await page.evaluate('window.__ui.screen');
  check('door: E flies (the launch card or the flight)', after === 'launch' || after === 'flight', after);

  /* The TV: a clip of this flight saved to My clips (as Save does, from
   * the replay's own clip), then the TV plays it and leaving the replay
   * is the hangar again. */
  if (after === 'launch') {
    await page.tap('Enter');
  }
  await page.until("window.__ui.screen === 'flight'", 60000);
  await page.sleep(3000);
  await page.tap('KeyV');
  await page.until('window.__crashCam.live()', 15000);
  const saved = await page.evaluate(`(async () => {
    const { encodeReplay } = await import('/src/replay/file.js');
    const store = await import('/src/replay/store.js');
    const clip = window.__crashCam.h().clip();
    const id = store.newId();
    await store.putClip({ id, name: 'tv', created: Date.now(), thumb: null, bytes: encodeReplay(clip), airframe: clip.meta.airframe, map: clip.meta.map, duration: clip.time[clip.n - 1] });
    return id;
  })()`);
  await page.tap('Escape');
  await page.until('!window.__crashCam.live()', 15000);
  await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('title'); window.__ui.hub = null; window.__ui.renderMenu(); true");
  await page.until("window.__ui.screen === 'title'", 20000);
  await page.sleep(500);
  check('back on the hub, the Hangar hub card clicked', await page.click('.gate-card.gate-card-hub-hangar'), 'clicked');
  await page.until("window.__ui.hub === 'hangar'", 10000);
  check('Walk in, with a clip saved', await page.click(walkCard), 'clicked');
  await need("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
  s = await stats();
  room = ROOMS[s.tier];
  occ = occupancy(room, LAYOUTS[s.tier]);
  const tv = s.stations.find((x) => x.id === 'tv');
  s = await walkTo(room, occ, tv);
  await page.sleep(300);
  const tvPrompt = await page.evaluate("document.querySelector('.walk-prompt').hidden ? null : document.querySelector('.walk-prompt').textContent");
  check('tv: its prompt says Replays once there is a clip', Boolean(tvPrompt) && tvPrompt.includes(en['walk.tv']), `${JSON.stringify(tvPrompt)} (clip ${saved})`);
  await shot('08-tv');
  await page.tap('KeyE');
  const played = await page.until('window.__crashCam.live()', 30000).then(() => true, () => false);
  check('tv: E plays the newest clip in the replay viewer', played, String(played));
  await page.sleep(1500);
  await shot('09-tv-replay');
  check('tv: the replay draws the world, not the room over it', (await page.evaluate('window.__walkStats().view')) === null, 'room view let go');
  await page.tap('Escape');
  await page.until("!window.__crashCam.live() && window.__ui.screen === 'walk'", 20000).then(() => true, () => false);
  check('tv: leaving the replay is the hangar again', await page.evaluate("window.__ui.screen === 'walk' && Boolean(window.__walkStats())"), await page.evaluate('window.__ui.screen'));
  /* A refused connection is a rooms or board server this check does not
   * start; anything else is the page's. */
  const errors = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  writeFileSync(join(out, 'steering.txt'), trace.join('\n'));
  await page.close();
}
console.log(`pictures in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
