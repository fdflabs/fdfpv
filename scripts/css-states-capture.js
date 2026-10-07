/*
 * css-states-capture.js: the fixtures scripts/css-states-golden.js draws,
 * made by the shell's own builders.
 *
 *     node scripts/css-states-capture.js      every group, into tests/css-states/fixtures/
 *     node scripts/css-states-capture.js hangar loader     some groups
 *
 * Boots the shell as css:golden does (a returning racer at the desk),
 * drives each group's states through the shell's real methods (ui.setOsd,
 * ui.openHangar, Loading.fail and the rest) and writes each state as a
 * fixture: #ui pruned to the elements the state is about, their subtrees
 * and their ancestors, so a descendant selector reaches them as in the
 * page. A builder that changes is caught by css:states as a fixture
 * change; run this again, read the fixture diff, and re-record.
 *
 * Where the shell has no way to reach a state on this page (no accounts
 * server, no music tracks), the group sets what the code would set, the
 * same classes and attributes, and says so in its comment.
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

import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURES = join(root, 'tests', 'css-states', 'fixtures');
const ONLY = process.argv.slice(2);

/* In the page, before every group: cap() keeps #ui pruned to the picked
 * elements, capOutside() an element outside #ui whole. */
const LIB = `
const ui = window.__ui;
const R = ui.root;
const OUT = {};
/* #ui with only the picked elements, their subtrees and their ancestors. */
function prune(picks) {
  const keep = new Set();
  for (const p of picks) {
    for (let n = p; n && n !== R; n = n.parentElement) keep.add(n);
    p.querySelectorAll('*').forEach((d) => keep.add(d));
  }
  const clone = R.cloneNode(true);
  const all = [R, ...R.querySelectorAll('*')];
  const call = [clone, ...clone.querySelectorAll('*')];
  const drop = [];
  for (let i = 1; i < all.length; i += 1) if (!keep.has(all[i])) drop.push(call[i]);
  for (const d of drop) d.remove();
  for (const n of [clone, ...clone.querySelectorAll('*')]) {
    for (const c of [...n.childNodes]) if (c.nodeType === 8) c.remove();
  }
  return clone.innerHTML;
}
function cap(name, sels, meta = {}) {
  const picks = [];
  for (const s of [].concat(sels)) {
    const l = typeof s === 'string' ? [...R.querySelectorAll(s)] : [s];
    if (!l.length) throw new Error(name + ': nothing matches ' + s);
    picks.push(...l);
  }
  OUT[name] = { meta: { ui: R.className, ...meta }, html: prune(picks) };
}
/* An element outside #ui (the loader), whole, placed after #ui. */
function capOutside(name, node, meta = {}) {
  const c = node.cloneNode(true);
  for (const n of [c, ...c.querySelectorAll('*')]) for (const k of [...n.childNodes]) if (k.nodeType === 8) k.remove();
  OUT[name] = { meta: { ui: '', outside: true, ...meta }, html: c.outerHTML };
}`;

/* Each group runs in the page with LIB in scope, in this order: a later
 * group may lean on what an earlier one left (a dialog closed, a screen
 * shown), and every group puts the title back at its end. */
const GROUPS = [
  ['flight', async () => {
    /* A: the flight overlay. Shown as show('flight') leaves it (nav.js), without
     * starting a flight. */
    ui.show('paused');
    const fly = () => { ui.osd.style.display = ''; ui.osd.className = 'osd'; };
    fly();
    const osdBase = { mode: 'race', lapMs: 12345, lastLapMs: 30000, gate: 3, gateCount: 9, gateCue: '', volts: 15.2, packFrac: 0.6, altitude: 3.2, speedKph: 80, throttle: 0.4, flightMode: 'acro', bounces: 0, launchState: 0, launchPitch: 0, ghostGapMs: null, ghostFinal: false };
    ui.setOsd({ ...osdBase, lapMs: NaN, launchState: 1, launchPitch: 12, ghostGapMs: -1200 });
    cap('osd-waiting-ahead-launch', '.osd');
    ui.setOsd({ ...osdBase, bounces: 2, launchState: 2, ghostGapMs: 800, flaps: 1, gear: 'down' });
    cap('osd-behind-hot-bounces', '.osd');
    ui.setOsd({ ...osdBase, mode: 'freestyle', runScored: true, runTimed: true, runState: 'flying', runRemainMs: 4000, launchState: 3 });
    cap('osd-late-go', '.osd');
    ui.setOsd({ ...osdBase, mode: 'freestyle', runScored: true, runTimed: false, flightMode: 'turtle' });
    cap('osd-free', '.osd');
    ui.osd.className = 'osd dim';
    cap('osd-dim', '.osd');
    fly();
    /* Stick ghosts and the air slider with its first-flight hint. */
    ui.setStickOverlay({ show: true, roll: 0.5, pitch: -0.3, yaw: 0.2, throttle: 0.7 });
    ui.airHintDone = false;
    try { localStorage.removeItem('fdfpv.airHintSeen'); } catch (e) { /* none */ }
    ui.osdAir.hint.hidden = false;
    ui.setAirSlider(true, true);
    cap('sticks-air-hint', '.osd-sticks');
    ui.settings.weight = ui.settings.weight + 50;
    ui.paintAir();
    ui.osdAir.hint.hidden = true;
    cap('sticks-air-off-stock', '.osd-sticks');
    ui.setStickOverlay({ show: false });
    ui.setAirSlider(false);
    cap('sticks-off', '.osd-sticks');
    /* The target mark: in frame, at the edge, the wrong side, off. */
    ui.setTargetLock({ show: true, x: 400, y: 300, size: 120, angle: 0, edge: false, wrong: false, distance: 42, fade: 1 });
    cap('lock-box', '.lock');
    ui.setTargetLock({ show: true, x: 20, y: 300, size: 0, angle: 270, edge: true, wrong: false, distance: 80, fade: 0.5 });
    cap('lock-edge', '.lock');
    ui.setTargetLock({ show: true, x: 400, y: 300, size: 60, angle: 0, edge: false, wrong: true, distance: 12, fade: 1 });
    cap('lock-wrong', '.lock');
    ui.setTargetLock({ show: true, x: 20, y: 300, size: 0, angle: 90, edge: true, wrong: true, distance: 12, fade: 1 });
    cap('lock-edge-wrong', '.lock');
    ui.setTargetLock({ show: false });
    cap('lock-off', '.lock');
    /* Banner variants. */
    ui.setBanner('Through the gate, then the next one', false);
    cap('banner-plain', ['.osd-top', '.banner']);
    ui.setBanner('Wreck in view', 'edge');
    cap('banner-edge', ['.osd-top', '.banner']);
    ui.setBanner('A boxed line in the middle of the frame', true);
    cap('banner-panel', '.banner');
    ui.setBanner('', false);
    /* The score overlay: tiers 3 to 5, rows by execution, verdicts and rings. */
    ui.osdMode = 'freestyle';
    ui.settings.freestyleScoring = 'on';
    const hud = ui.scoreHud;
    hud.reset();
    hud.setVisible(true);
    for (const [mult, name] of [[2, 'tier2'], [3, 'tier3'], [4, 'tier4'], [5, 'tier5']]) {
      hud.update({ total: 1234 * mult, combo: { points: 300 * mult, mult, remain: 0.6 } });
      cap('score-' + name, '.score-hud');
    }
    hud.update({ total: 9000, combo: { points: 300, mult: 5, remain: 0.3 } });
    hud.events([{ kind: 'trick', name: 'Power loop', points: 400, execution: 'CLEAN' }, { kind: 'trick', name: 'Split S', points: 200, execution: 'SLOPPY' }, { kind: 'trick', name: 'Matty flip', points: 100, execution: 'BUMP' }, { kind: 'bank', points: 700 }]);
    cap('score-rows-bank', '.score-hud');
    hud.update({ total: 9000, combo: null });
    hud.events([{ kind: 'bail', points: 300 }]);
    cap('score-bail', '.score-hud');
    hud.events([{ kind: 'bail', points: 0 }]);
    hud.setVisible(false);
    cap('score-off', '.score-hud');
    hud.reset();
    /* The room standings, as main.js mounts them. */
    const { RoomRaceHud } = await import('/src/ui/roomhud.js');
    const rr = new RoomRaceHud(R);
    rr.update({ title: 'Race, lap 2 of 3', chip: 'Boost ready', rows: [{ place: 1, name: 'Tester', value: '1:02.31', me: true }, { place: 2, name: 'A pilot with a long name', value: '+0.82', me: false }] });
    cap('room-race', rr.root);
    rr.update(null);
    cap('room-race-off', rr.root);
    rr.root.remove();
    /* The thumb sticks, as main.js mounts and shows them, one plate held. */
    const { mountTouchSticks } = await import('/src/input/touchsticks.js');
    const touch = mountTouchSticks({});
    R.append(touch.root);
    touch.setVisible(true);
    touch.paint();
    touch.root.querySelector('.touch-plate').classList.add('is-held');
    cap('touch-fly', touch.root, { ui: 'touch-fly-on' });
    cap('touch-fly-turtle', touch.root, { ui: 'touch-fly-on turtle-on' });
    touch.setVisible(false);
    cap('touch-fly-hidden', touch.root);
    touch.root.remove();
  }],
  ['room', async () => {
    /* B: the room screen in a room, and the war lobby over it. */
    ui.friendsRow = () => ({ inRoom: true, value: 'Room 4821', note: '2 pilots' });
    ui.refreshFriends();
    ui.show('friends');
    cap('friends-in-room', ui.screens.friends);
    ui.setWarLobby({ mission: 'Night raid on the bridge', pilots: [{ name: 'Tester', aircraft: 'Strike quad', ready: true, me: true, host: true }, { name: 'Wingman', aircraft: 'Recon plane', ready: false }], deadline: 95, last: { state: 'won', stars: 2, kills: 5 }, brief: { line: 'Hold the bridge until the convoy passes.', objectives: ['Find the radar', 'Drop the mast'], facts: [{ label: 'Time', value: '4 min' }, { label: 'Threat', value: 'Light AA' }] } });
    cap('friends-war-lobby', ui.screens.friends);
    ui.setWarLobby({ mission: 'Night raid on the bridge', pilots: [{ name: 'Tester', aircraft: 'Strike quad', ready: true, me: true }], countdown: 3, last: { state: 'lost', kills: 1 } });
    cap('friends-war-lobby-go', ui.screens.friends);
    ui.setWarLobby(null);
    ui.friendsRow = null;
    ui.refreshFriends();
  }],
  ['calibrate', async () => {
    /* C: calibration and the pad pick, shown as Ui.show shows a screen. */
    const only = (name) => { for (const [n, node] of Object.entries(ui.screens)) node.style.display = n === name ? '' : 'none'; };
    ui.show('paused');
    only('calibrate');
    const calView = (step, stepIndex, extra) => ({ step, stepIndex, stepCount: 7, title: 'Throttle', prompt: 'Move the throttle all the way up and down.', hint: 'Then let go.', channels: { roll: 0.3, pitch: -0.4, yaw: 0, throttle: 0.6 }, axes: [{ i: 0, v: 0.9, lo: -1, hi: 1, rest: 0, mapped: true }, { i: 1, v: 0.5, lo: -0.2, hi: 0.6, rest: 0 }, { i: 2, v: 0, rest: 0, mapped: true }, { i: 3, v: 0.02, rest: 0 }], ...extra });
    ui.setCalibration(calView('throttle', 2, { canSkip: true, canReverse: true, moving: 'throttle', reverse: { throttle: true } }));
    cap('calibrate-throttle', ui.screens.calibrate);
    ui.setCalibration(calView('confirm', 6, { canSave: true, canZeroThrottle: true }));
    cap('calibrate-confirm', ui.screens.calibrate);
    only('padpick');
    const pad = (key, extra) => ({ key, title: 'Radio ' + key, name: 'RadioMaster Pocket Joystick (Vendor: 1209)', axes: [0.4, -0.2, 0, 0.8], ...extra });
    ui.setPadPick({ pads: [pad('a', { live: true }), pad('b', { chosen: true }), pad('c', {})], prompt: 'Move the joystick you want to fly with.', hint: 'Two are moving.', canAccept: true, skipLabel: 'Use the keyboard instead', phase: 'confirm', reason: 'menu' });
    cap('padpick-three', ui.screens.padpick);
    ui.setPadPick({ pads: [], prompt: 'Plug one in.', hint: '', canAccept: false, skipLabel: 'Use the keyboard instead', phase: 'wiggle', reason: 'boot' });
    cap('padpick-none', ui.screens.padpick);
    ui.setPadPick(null);
  }],
  ['results-dialogs', async () => {
    /* D: results with laps, the empty and record states, the dialogs. */
    ui.settings.feelAsked = true;
    ui.showResults([{ n: 1, ms: 31234 }, { n: 2, ms: null, reason: 'Missed gate 4' }, { n: 3, ms: 29876, score: 1200 }], 30000, 30500, 'Ghost was 0.4 s behind');
    cap('results-record', ui.screens.results);
    ui.showResults([{ n: 1, ms: 33000 }, { n: 2, ms: 34000 }], 30000, 30000, null);
    cap('results-off', ui.screens.results);
    ui.showResults([{ n: 1, ms: null, reason: 'Crashed' }], 30000, 30000, null);
    cap('results-empty', ui.screens.results);
    ui.showFreestyleResults({ crashes: 0, tricks: 14, unique: 6, total: 12345, bestCombo: 4000, bonus: 500, timed: true, rows: Array.from({ length: 12 }, (_, i) => ({ name: 'Trick ' + i, count: i % 3 + 1, points: 2000 - i * 100 })) });
    cap('results-freestyle-clean', ui.screens.results);
    ui.showRoomResults({ win: true, kicker: 'Room race', head: 'You won', heroCap: 'Best lap', heroTime: '29.88', heroMeta: '3 pilots', rows: [{ label: 'Tester', time: '29.88', me: true, tag: 'best' }, { label: 'Wingman', time: 'out', out: true }] });
    cap('results-room', ui.screens.results);
    ui.setBest(28123, 'race');
    ui.show('title');
    cap('title-best', '.brand-best');
    /* The name dialog and its kin (src/ui/dialogs.js). */
    ui.askForm({ title: 'Your name', detail: 'On the board beside your time.', fields: [{ key: 'name', label: 'Name', rules: 'Letters and numbers', value: 'Tester' }] });
    ui.nameDialog.querySelector('.name-dialog-err').textContent = 'That needs a name';
    cap('dialog-form', ui.nameDialog);
    ui.closeNameDialog(null);
    ui.askConfirm({ title: 'Delete this track?', detail: 'It cannot be undone.', yes: 'Delete', no: 'Keep', danger: true });
    cap('dialog-confirm-danger', ui.nameDialog);
    ui.closeNameDialog(null);
    ui.askConfirm({ title: 'Leave the room?', yes: 'Leave', no: 'Stay' });
    cap('dialog-confirm', ui.nameDialog);
    ui.closeNameDialog(null);
    ui.show('paused');
    ui.openBugReport();
    const tray = ui.nameDialog.querySelector('.shot-tray');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 40;
    const g2 = cv.getContext('2d'); g2.fillStyle = '#3a6'; g2.fillRect(0, 0, 64, 40);
    const png = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([png], 'a.png', { type: 'image/png' }));
    const fileInput = tray.querySelector('input[type=file]');
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
    tray.querySelector('.shot-drop').classList.add('over');
    cap('dialog-bug-pending', ui.nameDialog);
    for (let i = 0; i < 40 && tray.querySelector('.shot-chip.pending'); i += 1) await new Promise((r) => setTimeout(r, 100));
    tray.querySelector('.shot-drop').classList.remove('over');
    tray.querySelector('.shot-err').textContent = 'Four images at most';
    cap('dialog-bug-shot', ui.nameDialog);
    ui.closeNameDialog(null);
    ui.show('results');
    ui.settings.feelAsked = false;
    ui.openFeelReport();
    const chip = ui.nameDialog.querySelector('.feel-chip');
    chip.click();
    cap('dialog-feel', ui.nameDialog);
    ui.closeNameDialog(null);
  }],
  ['picker', async () => {
    /* The aircraft picker (src/ui/carousel.js), opened as ui.openPicker opens it. */
    const { normaliseBuilds } = await import('/src/ui/builds.js');
    const mine = normaliseBuilds({ builds: [{ id: 'b1', name: 'Night strike', airframe: 'sky1800', fit: {}, created: 1, updated: 2 }, { id: 'b2', name: 'Lake cub', airframe: 'cub1400', fit: {}, created: 1, updated: 3 }] });
    ui.buildList = mine;
    ui.show('title');
    const car = ui.carousel;
    ui.openPicker({ current: 'cub1400', warn: 'This world is for planes only', onChoose() {}, onCancel() {} });
    car.paint();
    cap('carousel-plane-warn', car.root);
    car.setFilter('quad');
    car.paint();
    cap('carousel-quad', car.root);
    car.close();
    ui.openPicker({ current: 'interceptor', compact: true, hint: 'touch', onChoose() {}, onCancel() {} });
    car.paint();
    cap('carousel-compact-touch', car.root);
    ui.buildList = mine;
    car.relist();
    car.setFilter('mine');
    if (!car.ids.length) throw new Error('no builds listed: ' + JSON.stringify(ui.myBuilds));
    car.goTo(0);
    car.paint();
    cap('carousel-mine', car.root);
    car.startRename();
    const field = car.root.querySelector('.carousel-name-field');
    field.value = '';
    car.submitRename();
    cap('carousel-mine-rename-error', car.root);
    car.closeForm(true);
    car.startDelete();
    cap('carousel-mine-delete', car.root);
    car.closeForm(true);
    car.close();
  }],
  ['hangar', async () => {
    /* The hangar (src/ui/hangar.js and its registered tabs), opened as
     * ui.openHangar opens it. */
    const { HANGAR_TABS } = await import('/src/ui/hangar.js');
    ui.show('title');
    if (ui.carousel.isOpen) ui.carousel.close();
    const h = ui.hangar;
    const each = (id, prefix) => {
      ui.openHangar(id);
      if (!h.isOpen) throw new Error('hangar did not open on ' + id);
      for (const t of HANGAR_TABS) {
        h.setTab(t);
        if (h.tab !== t) continue;
        cap(`${prefix}-${t}`, h.root, { ui: R.className });
      }
    };
    each('cub1400', 'hangar-plane');
    /* Paint: the decal pages, an editor, the kinds box, placing, the library. */
    h.setTab('colours');
    const paint = await import('/configs/paint.js');
    const kind = Object.keys(paint.DECAL_KINDS).find((k) => k !== 'text' && k !== 'num');
    const shop = h.shop;
    shop.setPage('decals');
    cap('hangar-paint-decals-empty', h.root);
    shop.setDecals([{ k: kind, p: [0, 0.05, 0.1], n: [0, 1, 0], s: 0.1, a: 1, r: 0, c: '#ff0000', c2: '#000000', m: false }, { k: 'num', t: '7', f: paint.DECAL_FONTS[0], p: [0.1, 0, 0], n: [1, 0, 0], s: 0.1, a: 1, r: 10, c: '#ffffff', c2: '#000000', m: true }], 'decal-0');
    shop.select(0);
    cap('hangar-paint-decal-editor', h.root);
    shop.select(1);
    cap('hangar-paint-number-editor', h.root);
    shop.select(1);
    shop.openKinds();
    cap('hangar-paint-kinds', h.root);
    shop.openKinds();
    shop.startPlacing(shop.decals[0], 0);
    cap('hangar-paint-placing', h.root);
    shop.stopPlacing();
    shop.library = [{ name: 'Racing red', entry: {} }, { name: 'Lake blue', entry: {} }];
    shop.setPage('saved');
    cap('hangar-paint-saved', h.root);
    shop.openForm({ mode: 'confirm', index: 0 }, 'keep-0');
    cap('hangar-paint-saved-confirm', h.root);
    shop.closeForm('keep-0');
    shop.exportCode();
    cap('hangar-paint-saved-code', h.root);
    shop.closeForm('keep-0');
    h.close();
    each('7inch', 'hangar-quad');
    h.close();
  }],
  ['gate', async () => {
    /* The gate: home's hub cards, a hub's activity cards, the rooms panel,
     * the first visit (src/ui/cards.js renderTitleCards, renderTitleRooms;
     * the rooms panel's items in the shape src/ui/roombrowser.js titleItems
     * makes them). */
    ui.titleRooms = () => [
      { lobby: 'head', section: true, label: 'Rooms', value: '3 open, 5 flying' },
      { lobby: 'room', label: 'Room 4821', value: 'Race · 2 flying', join: 'Join', live: true, action: 'lobby:room:4821' },
      { lobby: 'room', label: 'Tester\'s room', value: 'War 2 · waiting', join: 'Join battle', live: false, action: 'lobby:room:1234' },
      { lobby: 'all', label: 'All rooms', action: 'lobby:rooms' },
      { lobby: 'make', label: 'Make a room', action: 'lobby:roomnew' },
    ];
    ui.mode = null;
    ui.hub = null;
    ui.show('title');
    ui.renderMenu();
    cap('gate-home-rooms', ui.screens.title);
    for (const hub of ['club', 'ops', 'hangar']) {
      ui.hub = hub;
      ui.renderMenu();
      cap('gate-hub-' + hub, ui.screens.title);
    }
    ui.hub = null;
    ui.firstRun = true;
    ui.renderMenu();
    cap('gate-first', ui.screens.title);
    ui.firstRun = false;
    ui.titleRooms = () => [];
    ui.mode = 'race';
    ui.renderMenu();
    cap('title-menu', ui.screens.title);
  }],
  ['loader', async () => {
    /* The loader (src/ui/loading.js Loading) on index.html's own markup:
     * each screen, the row states, a stall, a held room link, a failure. */
    const { Loading } = await import('/src/ui/loading.js');
    const node = document.getElementById('pdcs-loader');
    /* index.html's own loader markup, as the page loads it, not as the boot
     * left it. */
    const page = new DOMParser().parseFromString(await (await fetch('/index.html')).text(), 'text/html');
    const keepHtml = page.getElementById('pdcs-loader').innerHTML;
    const liveHtml = node.innerHTML;
    const keepCls = node.className;
    const fresh = () => { node.innerHTML = keepHtml; node.className = keepCls; node.hidden = false; node.style.cssText = ''; return new Loading(node); };
    let L = fresh();
    capOutside('loader-markup', node);
    L.show();
    L.stage(1);
    L.progress(40);
    capOutside('loader-boot', node);
    L.stage(2);
    L.system('flight', 'ready'); L.system('physics', 'loading'); L.system('input', 'na'); L.system('audio', 'fail');
    capOutside('loader-check', node);
    L.stage(3);
    L.mapInfo({ name: 'Swiss valley', poster: 'assets/posters/swiss2.jpg' });
    L.mapProgress(70);
    L.mapSystem('terrain', 'ready'); L.mapSystem('satellite', 'loading');
    capOutside('loader-map', node);
    L.stage(4);
    L.finalSystem('world', 'ready'); L.finalSystem('core', 'na');
    node.classList.add('is-stalled');
    L.statusLine('Still loading the world, 3 of 9');
    capOutside('loader-final-stalled', node);
    L = fresh();
    L.hold('restart', 'Room 4821');
    capOutside('loader-held', node);
    L = fresh();
    L.show();
    L.stage(2);
    L.system('flight', 'loading');
    L.fail('WebGL2 is not available in this browser');
    capOutside('loader-failed', node);
    L.hide();
    capOutside('loader-hiding', node);
    fresh();
    node.hidden = true;
    capOutside('loader-gone', node);
    node.innerHTML = liveHtml; node.className = keepCls; node.hidden = true;
  }],
  ['campaign', async () => {
    /* The war campaign and the Interior campaign over the dialog overlay, as
     * src/main.js creates them, with one mission won so stars and credits show. */
    const C = await import('/src/game/campaign.js');
    const { createCampaignScreen } = await import('/src/ui/campaign.js');
    const { createOpsCampaignScreen } = await import('/src/ui/opscampaign.js');
    const store = C.createCampaignStore(ui.settings, () => {});
    store.save(C.applyResult(store.load(), C.ACT1[0].id, { won: true, stars: 2, credits: 300 }));
    ui.show('title');
    const camp = createCampaignScreen({ ui, enterWarRoom() {}, send() {}, view: () => null, room: () => ({ phase: null, code: null, seat: null }), devAccount: () => Promise.resolve(false) });
    camp.open('missions');
    await new Promise((r) => setTimeout(r, 50));
    cap('campaign-missions', ui.nameDialog);
    camp.open('shop');
    await new Promise((r) => setTimeout(r, 50));
    cap('campaign-shop', ui.nameDialog);
    camp.close();
    const ops = createOpsCampaignScreen({ ui, campaign: C.INTERIOR_CAMPAIGN, missions: C.INTERIOR, consented: () => true, play() {} });
    ops.open();
    await new Promise((r) => setTimeout(r, 50));
    cap('campaign-interior', ui.nameDialog);
    ops.close ? ops.close() : ui.closeNameDialog(null);
    if (!ui.nameDialog.hidden) ui.closeNameDialog(null);
  }],
  ['chips', async () => {
    /* The chips and bars over the world (syncChips, setRoomBar, syncMusicDock
     * in src/ui/session.js): in flight, in a menu, muted, with the update and
     * room bars up. The sign in chip and panel are drawn as syncChips draws
     * them where accounts are available (this page has no accounts server). */
    ui.settings.sound = true;
    ui.musicNow = { name: 'Paraguay at dusk' };
    const chips = () => [...R.querySelectorAll(':scope > .bug-chip, :scope > .music-dock, :scope > .signin-panel, .frame-bot')];
    const signin = (pilot, bug) => {
      ui.signinChip.hidden = !pilot;
      ui.signinChip.classList.toggle('first-slot', pilot && !bug);
      ui.signinChip.textContent = pilot ? 'Tester' : '';
      ui.signinChip.dataset.initial = pilot ? 'T' : '';
      ui.signinPanel.hidden = pilot;
      ui.signinPanel.classList.toggle('first-slot', !pilot && !bug);
    };
    ui.show('paused');
    ui.screen = 'flight';
    ui.onHotSwap = ui.onHotSwap || (() => {});
    ui.syncChips();
    cap('chips-flight', chips());
    ui.screen = 'paused';
    ui.settings.musicLevel = 0;
    ui.updateReady = true;
    ui.setRoomBar({ text: 'Tester is waiting in the room', button: 'Rejoin', act: 'room-rejoin', reload: false });
    ui.syncChips();
    signin(true, true);
    cap('chips-menu-muted-bars', chips());
    ui.setRoomBar({ text: 'A new version: reload to keep flying together', button: 'Reload', reload: true });
    ui.settings.musicLevel = 0.6;
    ui.syncChips();
    signin(false, true);
    ui.signinPanel.classList.add('is-nudged');
    cap('chips-room-reload-panel', chips());
    ui.setRoomBar(null);
    ui.updateReady = true;
    ui.show('title');
    ui.syncChips();
    signin(true, false);
    cap('chips-title-update', chips());
    ui.updateReady = false;
    ui.syncChips();
  }],
  ['fc', async () => {
    /* The FC screen with a dump open (ui.onFcOpen, as src/main.js wires it):
     * the setup tab's horizon, an edit (unsaved, Save and exit), the search
     * row, a gated field. */
    ui.show('title');
    ui.onFcOpen('pid');
    ui.fcFrom = 'title';
    ui.show('fc');
    const tabs = (await import('/src/fc/catalog.js')).TABS.map((t) => t.id);
    const seen = {};
    for (const t of tabs) {
      ui.fc.setTab(t);
      ui.renderMenu();
      const s = ui.screens.fc;
      for (const sel of ['.row-gated', '.row-search', '.row-warn']) if (s.querySelector(sel)) (seen[sel] = seen[sel] || []).push(t);
    }
    ui.fc.setTab('setup');
    ui.renderMenu();
    cap('fc-setup', ui.screens.fc);
    const key = Object.keys(ui.fc.draftMap()).find((k) => /rate|expo/.test(k));
    ui.fc.setValue(key, String(Number(ui.fc.cliValue(key)) + 1));
    ui.fc.setTab('pid');
    ui.renderMenu();
    cap('fc-dirty', ui.screens.fc);
    if (seen['.row-gated']) { ui.fc.setTab(seen['.row-gated'][0]); ui.renderMenu(); cap('fc-gated', ui.screens.fc); }
    ui.fc.setTab('pid'); ui.fc.search = 'rate'; ui.renderMenu(); cap('fc-search', ui.screens.fc); ui.fc.search = null;
    ui.fc.discard();
    ui.leaveFc();
  }],
  ['tracks', async () => {
    /* My tracks with a board track (renderCourseCards in src/ui/cards.js), the
     * card chosen with its rows, and the board's standings (paintStandings)
     * with times and with none. */
    const board = [
      { id: 'bt1', name: 'River run', map: 'swiss2', gates: 9, author: 'Tester', board: null, online: '' },
      { id: 'bt2', name: 'Dam drop', map: 'swiss2', gates: 6, author: '', board: null, online: '' },
    ];
    ui.show('courses');
    await new Promise((r) => setTimeout(r, 300));
    ui.boardCourses = board;
    ui.renderMenu();
    cap('courses-board', ui.screens.courses);
    const it = ui.items().find((x) => x.course);
    const { courseCardKey } = await import('/src/ui/ui.js');
    ui.cardSubject = courseCardKey(it);
    ui.renderMenu();
    cap('courses-chosen', ui.screens.courses);
    ui.setCursor(ui.items().findIndex((x) => x.course && courseCardKey(x) === ui.cardSubject));
    ui.renderCourseCards();
    cap('courses-chosen-cursor', ui.screens.courses);
    ui.cardSubject = null;
    const { writePilotName } = await import('/src/share/pilot.js');
    writePilotName('Tester');
    ui.showStandings(board[0]);
    for (let i = 0; i < 50 && ui.standingsLoading; i += 1) await new Promise((r) => setTimeout(r, 100));
    ui.standingsLoading = null;
    ui.standingsError = '';
    ui.standingsTimes = [{ name: 'Fast one', lapMs: 28123, hasGhost: true }, { name: 'Tester', lapMs: 29001 }, { name: '', lapMs: 31000 }];
    ui.paintStandings();
    ui.renderMenu();
    cap('standings-times', ui.screens.standings);
    ui.standingsTimes = [];
    ui.paintStandings();
    cap('standings-none', ui.screens.standings);
    ui.boardCourses = [];
    ui.show('title');
  }],
  ['rows', async () => {
    /* Rows the menu screens build only in some states: the scoring row's
     * warning (src/ui/items.js), the pad trouble row (padTroubleItem in
     * src/ui/ui.js). */
    ui.settings.freestyleScoring = 'scored';
    const report = {};
    for (const s of Object.keys(ui.screens)) {
      ui.show(s);
      ui.renderMenu();
      if (ui.screens[s].querySelector('.row-warn')) report[s] = true;
    }
    const first = Object.keys(report)[0];
    if (first) { ui.show(first); ui.renderMenu(); cap('rows-warn-' + first, ui.screens[first]); }
    ui.show('title');
  }],
  ['closed', async () => {
    /* Everything #ui holds hidden on the title: each must stay out of the
     * layout (the [hidden] rules). */
    ui.show('title');
    ui.renderMenu();
    cap('closed-title', [...R.querySelectorAll('[hidden]')].filter((n) => !n.parentElement.closest('[hidden]')));
  }],
  ['hangar-more', async () => {
    /* The hangar's rarer states: damage on the Parts tab, the floats switch
     * on, film covered regions, a modified scheme, the save as new form. */
    const HP = await import('/configs/hangar-parts.js');
    const { PART_KINDS } = await import('/configs/parts.js');
    const tape = PART_KINDS.findIndex((k, i) => HP.tapeable(i));
    if (tape < 0) throw new Error('no tapeable kind');
    const box = [[-0.1, -0.1, -0.1], [0.1, 0.1, 0.1]];
    const dmg = { boxes: [box, box, box], parents: [-1, 0, 0], parts: [
      { i: 1, kind: tape, cg: [0, 0, 0], joint: [0, 0, 0], mass: 0.05, state: 'broken' },
      { i: 2, kind: tape, cg: [0, 0, 0], joint: [0, 0, 0], mass: 0.05, state: 'taped' },
    ] };
    ui.settings.parts = { ...(ui.settings.parts || {}), cub1400: { prop: 'stock', addons: [], damage: dmg }, cub1400f: { prop: 'stock', addons: [], damage: dmg } };
    ui.settings.floats = { ...(ui.settings.floats || {}), cub1400: true };
    ui.show('title');
    if (ui.carousel.isOpen) ui.carousel.close();
    const h = ui.hangar;
    ui.openHangar('cub1400f');
    if (!h.isOpen) ui.openHangar('cub1400');
    h.setTab('parts');
    cap('hangar-parts-damage', h.root);
    h.setTab('colours');
    h.close();
    const planes = ['sky1800', 'radian2000', 'bramor2300', 'slowstick1180', 'timber1500', 'bombshell1118', 'kadet1981', 'uglystik1567', 'tigermoth1803', 'p51d1450', 'f16878', 'zagi1219', 'nrj1490'];
    let filmId = null;
    for (const id of planes) {
      ui.openHangar(id);
      if (!h.isOpen) continue;
      h.setTab('colours');
      if (h.root.querySelector('.hangar-dot.film')) { filmId = id; break; }
      h.close();
    }
    if (filmId) {
      if (h.regions.find((r) => r.film)) h.pickRegion(h.regions.find((r) => r.film).id);
      cap('hangar-film', h.root);
      h.close();
    }
    ui.openHangar('sky1800');
    h.setTab('colours');
    h.pickColour('#123456');
    cap('hangar-scheme-modified', h.root);
    h.mine = h.mine || { name: '', suggest: 'Sky 1', full: false };
    h.startMine();
    h.mineForm.querySelector('input').value = '';
    h.submitMine();
    cap('hangar-mine-form', h.root);
    h.closeMine(false);
    h.close();
  }],
  ['odd', async () => {
    /* Odd states: the gate's rooms panel where rooms are offered, the title's
     * help line, the flight overlay under thumb sticks and in a war, the cursor
     * on the rows that colour it. */
    ui.friendsRow = () => ({ inRoom: false, value: '', note: '' });
    ui.titleRooms = () => [
      { lobby: 'head', section: true, label: 'Rooms', value: '3 open, 5 flying' },
      { lobby: 'room', label: 'Room 4821', value: 'Race · 2 flying', join: 'Join', live: true, action: 'lobby:room:4821' },
      { lobby: 'room', label: 'Tester\'s room', value: 'War 2 · waiting', join: 'Join battle', live: false, action: 'lobby:room:1234' },
      { lobby: 'all', label: 'All rooms', action: 'lobby:rooms' },
      { lobby: 'make', label: 'Make a room', action: 'lobby:roomnew' },
    ];
    ui.mode = null;
    ui.hub = null;
    ui.show('title');
    ui.renderMenu();
    cap('gate-rooms-panel', ui.screens.title);
    const roomAt = ui.items().findIndex((x) => x.lobby === 'room');
    ui.setCursor(roomAt);
    cap('gate-rooms-cursor', ui.screens.title);
    ui.hub = 'club';
    ui.renderMenu();
    cap('gate-hub-club-rooms', ui.screens.title);
    ui.hub = null;
    ui.friendsRow = null;
    ui.titleRooms = () => [];
    ui.mode = 'race';
    ui.show('title');
    ui.renderMenu();
    const helpAt = ui.items().findIndex((x, i) => i > 0 && x.note);
    if (helpAt >= 0) ui.setCursor(helpAt);
    cap('title-help', ui.screens.title);
    /* The overlay with the thumb sticks up and in a war. */
    ui.show('paused');
    ui.osd.style.display = '';
    ui.osd.className = 'osd';
    ui.setOsd({ mode: 'race', lapMs: 12345, lastLapMs: null, gate: 3, gateCount: 9, gateCue: '', volts: 15.2, packFrac: 0.6, altitude: 3.2, speedKph: 80, throttle: 0.4, flightMode: 'acro', bounces: 1, launchState: 0, launchPitch: 0, ghostGapMs: null, ghostFinal: false });
    ui.setAirSlider(true, false);
    ui.screen = 'flight';
    ui.onHotSwap = ui.onHotSwap || (() => {});
    ui.syncChips();
    cap('osd-touch-fly', ['.osd', ':scope > .pause-chip', ':scope > .swap-chip'], { ui: 'touch-fly-on' });
    cap('osd-war', '.osd', { ui: 'war-on' });
    ui.screen = 'paused';
    ui.syncChips();
    ui.show('title');
  }],
  ['rest', async () => {
    /* The rest: the picker on the aircraft with an engine switch and on an
     * empty My Hangar tab, the frame bars where a screen hides them, a text
     * decal, a bad paint code, the reticle on, an add-on fitted, the credits'
     * logo fallback, the cursor rows. */
    ui.show('title');
    const car = ui.carousel;
    ui.openPicker({ current: 'striker2500', onChoose() {}, onCancel() {} });
    car.paint();
    cap('carousel-engine', car.root);
    car.close();
    ui.buildList = [];
    ui.openPicker({ current: 'cub1400', onChoose() {}, onCancel() {} });
    car.setFilter('mine');
    car.paint();
    cap('carousel-mine-empty', car.root);
    car.close();
    /* Frame bars hidden. */
    const hid = {};
    for (const s of Object.keys(ui.screens)) {
      ui.show(s);
      if (ui.frameBot.hidden && !hid.bot) { hid.bot = s; cap('frame-hidden-' + s, [ui.frameTop, ui.frameBot]); }
      if (!ui.frameBot.hidden && ui.framePrimary.hidden && !hid.primary) { hid.primary = s; cap('frame-noprimary-' + s, [ui.frameTop, ui.frameBot]); }
    }
    ui.show('title');
    /* Paint: a text decal, a bad code, the reticle on a hit. */
    const paint = await import('/configs/paint.js');
    const h = ui.hangar;
    ui.openHangar('sky1800');
    h.setTab('colours');
    h.shop.setPage('decals');
    h.shop.setDecals([{ k: 'text', t: 'FDF', f: paint.DECAL_FONTS[0], p: [0, 0.05, 0.1], n: [0, 1, 0], s: 0.1, a: 3, r: 0, c: '#ffffff', c2: '#000000', m: false }], 'decal-0');
    h.shop.select(0);
    cap('hangar-paint-text-editor', h.root);
    h.shop.select(0);
    h.shop.startPlacing(h.shop.decals[0], 0);
    h.shop.aimed({ p: [0, 0.05, 0.1], n: [0, 1, 0] });
    cap('hangar-paint-placing-hit', h.root);
    h.shop.stopPlacing();
    h.shop.setPage('saved');
    h.shop.importCode('FPV1-not-a-code');
    cap('hangar-paint-code-error', h.root);
    h.shop.closeForm('code-field');
    h.setTab('parts');
    const addon = h.root.querySelector('.parts-toggle');
    if (addon) addon.click();
    cap('hangar-parts-addon', h.root);
    h.close();
    /* Credits with every logo failing to load (fillCredits in src/ui/credits.js). */
    const { fillCredits } = await import('/src/ui/credits.js');
    ui.show('credits');
    fillCredits(ui.creditsRoll, { assetBase: 'assets/no-such-folder' });
    await new Promise((r) => setTimeout(r, 1500));
    cap('credits-logo-fallback', ui.screens.credits);
    fillCredits(ui.creditsRoll, { assetBase: 'assets/credits' });
    /* The cursor on the update bar's stop, on the scoring warning row, on an
     * FC button row. */
    ui.updateReady = true;
    ui.show('paused');
    ui.syncChips();
    const barAt = ui.items().findIndex((x) => x.bar);
    if (barAt >= 0) { ui.setCursor(barAt); cap('cursor-update-bar', [ui.frameBot, ui.screens.paused]); }
    ui.updateReady = false;
    ui.syncChips();
    ui.settings.freestyleScoring = 'scored';
    ui.show('freestyle');
    const warnAt = ui.items().findIndex((x) => x.rowClass === 'row-warn');
    if (warnAt >= 0) { ui.setCursor(warnAt); cap('cursor-row-warn', ui.screens.freestyle); }
    ui.onFcOpen('pid');
    ui.fcFrom = 'title';
    ui.show('fc');
    for (const t of ['setup', 'motors', 'presets', 'cli', 'pid']) {
      ui.fc.setTab(t);
      ui.renderMenu();
      const at = ui.items().findIndex((x) => x.rowClass === 'fc-btn');
      if (at >= 0) { ui.setCursor(at); cap('cursor-fc-btn-' + t, ui.screens.fc); break; }
    }
    ui.fc.discard();
    ui.leaveFc();
    ui.show('title');
  }],
  ['small', async () => {
    /* A campaign result that has not come in yet (observe in
     * src/ui/campaign.js), the shot tray locked with a shot in it, the sign in
     * panel in the first slot, room results with no kicker. */
    const C = await import('/src/game/campaign.js');
    const { createCampaignScreen } = await import('/src/ui/campaign.js');
    ui.show('title');
    const camp = createCampaignScreen({ ui, enterWarRoom() {}, send() {}, view: () => null, room: () => ({ phase: null, code: null, seat: null }), devAccount: () => Promise.resolve(false) });
    camp.open('missions');
    camp.observe({ id: 7, mission: C.ACT1[0].id, state: 'flying' }, 'R1');
    camp.observe({ id: 7, mission: C.ACT1[0].id, state: 'won' }, 'R1');
    cap('campaign-result-later', ui.nameDialog);
    camp.close();
    ui.show('paused');
    ui.openBugReport();
    const tray = ui.nameDialog.querySelector('.shot-tray');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 40;
    cv.getContext('2d').fillRect(0, 0, 64, 40);
    const png = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([png], 'a.png', { type: 'image/png' }));
    const input = tray.querySelector('input[type=file]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 40 && tray.querySelector('.shot-chip.pending'); i += 1) await new Promise((r) => setTimeout(r, 100));
    tray.classList.add('locked');
    cap('dialog-bug-shot-locked', ui.nameDialog);
    ui.closeNameDialog(null);
    ui.show('title');
    ui.signinPanel.hidden = false;
    ui.signinPanel.classList.add('first-slot');
    cap('chips-title-signin-panel', [ui.signinPanel]);
    ui.signinPanel.hidden = true;
    ui.signinPanel.classList.remove('first-slot');
    ui.showRoomResults({ win: false, kicker: '', head: 'Race over', heroCap: 'Best lap', heroTime: '31.02', heroMeta: '', rows: [{ label: 'Tester', time: '31.02', me: true }] });
    cap('results-room-no-kicker', ui.screens.results);
    ui.show('title');
  }],
  ['last', async () => {
    /* Last few: the rename form before a bad name, the frame in flight, a
     * greyed FC tab, the cursor on a link row. */
    const { normaliseBuilds } = await import('/src/ui/builds.js');
    ui.buildList = normaliseBuilds({ builds: [{ id: 'b1', name: 'Night strike', airframe: 'sky1800', fit: {}, created: 1, updated: 2 }] });
    ui.show('title');
    const car = ui.carousel;
    ui.openPicker({ current: 'sky1800', onChoose() {}, onCancel() {} });
    car.setFilter('mine');
    car.goTo(0);
    car.startRename();
    cap('carousel-mine-rename', car.root);
    car.closeForm(true);
    car.close();
    ui.show('paused');
    ui.screen = 'flight';
    ui.syncFrame();
    cap('frame-flight', [ui.frameTop, ui.frameBot], { ui: R.className });
    ui.screen = 'paused';
    ui.syncFrame();
    ui.onFcOpen('pid');
    ui.fcFrom = 'title';
    ui.show('fc');
    ui.fc.setTab('ports');
    ui.renderMenu();
    cap('fc-grey-tab', ui.screens.fc);
    ui.fc.discard();
    ui.leaveFc();
    for (const s of Object.keys(ui.screens)) {
      ui.show(s);
      ui.renderMenu();
      const link = ui.items().findIndex((x) => ui.rowKind(x) === 'link');
      if (link >= 0) { ui.setCursor(link); ui.renderMenu(); cap('cursor-link-' + s, ui.screens[s]); break; }
    }
    ui.show('title');
  }],
];

/* What each fixture is, by its name's longest matching prefix. */
const NOTES = {
  "osd": "The flight overlay (src/ui/page.js buildFlightOverlay) as setOsd in src/ui/overlay.js paints it, shown as Ui.show('flight') leaves it.",
  "sticks": "The stick ghosts and the air slider (src/ui/widgets.js makeGimbal, makeWeightSlider) as setStickOverlay, setAirSlider and paintAir in src/ui/overlay.js leave them.",
  "lock": "The target mark (buildTargetLock, setTargetLock in src/ui/overlay.js).",
  "banner": "The banner line under the OSD block (setBanner in src/ui/overlay.js).",
  "score": "The freestyle score overlay (src/ui/scorehud.js ScoreHud) after update() and events().",
  "room": "The room standings (src/ui/roomhud.js RoomRaceHud), mounted on #ui as src/main.js mounts it.",
  "touch": "The thumb sticks (src/input/touchsticks.js mountTouchSticks), with #ui's classes as src/main.js toggles them in flight.",
  "friends": "The room screen in a room (refreshFriends in src/ui/session.js) and the war lobby over it (setWarLobby, drawLobby in src/ui/session.js).",
  "calibrate": "The calibration screen (src/ui/page.js calibrateScreen) as setCalibration and setCalAxes in src/ui/overlay.js paint it.",
  "padpick": "The pad pick screen (src/ui/page.js padpickScreen) as setPadPick in src/ui/overlay.js paints it, cards from makePadCard in src/ui/widgets.js.",
  "results": "The results screen (src/ui/page.js resultsScreen) as showResults, showFreestyleResults and showRoomResults in src/ui/results.js fill it.",
  "title": "The title screen (src/ui/page.js titleScreen) as Ui.renderMenu leaves it.",
  "dialog": "The dialog overlay (src/ui/dialogs.js askForm, askConfirm, askBugReport with its shot tray from src/ui/bugshots.js, askFeelReport).",
  "carousel": "The aircraft picker (src/ui/carousel.js Carousel), opened as openPicker in src/ui/ui.js opens it, with two builds in the pilot's hangar for its own tab.",
  "hangar": "The hangar (src/ui/hangar.js Hangar, its registered tabs in src/ui/hangar-*.js and src/ui/progress-ui.js, the paint shop in src/ui/hangar-paint.js), opened as openHangar in src/ui/ui.js opens it.",
  "gate": "The title as the gate: home's hub cards, a hub's activity cards, the rooms panel and the first visit (renderTitleCards, renderTitleRooms in src/ui/cards.js; the rooms panel's items in the shape src/ui/roombrowser.js titleItems makes).",
  "loader": "The loader, index.html's own #pdcs-loader markup as src/ui/loading.js Loading drives it (the stall class and line as paintStall sets them after six seconds). It sits outside #ui, after it, as in index.html.",
  "campaign": "The war campaign (src/ui/campaign.js createCampaignScreen) and the Interior campaign (src/ui/opscampaign.js createOpsCampaignScreen) over the dialog overlay, created as src/main.js creates them, with the first mission won.",
  "chips": "The chips and bars over the world (syncChips, setRoomBar, syncMusicDock in src/ui/session.js; built in src/ui/page.js). The sign in chip and panel carry what syncChips gives them where accounts are available, set here because this page has none.",
  "closed": "Every element #ui holds hidden on the title, so the [hidden] rules keep each out of the layout.",
  "fc": "The FC screen (src/ui/page.js fcScreen) with the module dump open as ui.onFcOpen in src/main.js opens it (src/ui/fc.js FcSession, painted by src/ui/menucontrols.js).",
  "rows": "A menu screen with a row the default states never build (rowClass row-warn: the scoring row in src/ui/items.js with scoring on).",
  "courses": "My tracks with two board tracks (renderCourseCards in src/ui/cards.js, the items from src/ui/items.js), one chosen with its rows.",
  "standings": "The board's standings for a track (paintStandings in src/ui/cards.js), with times and with none.",
  "cursor": "A menu screen with the cursor (the on class, src/ui/nav.js setCursor) on a row kind the first row never is.",
  "osd-touch-fly": "The flight overlay and the flight chips with #ui as src/main.js leaves it in flight on a touch screen (touch-fly-on).",
  "osd-war": "The flight overlay with #ui in a war (war-on, src/ui/ui.js).",
  "frame": "The status and command bars (src/ui/page.js buildFrame) on a screen that hides them or their primary button (syncFrame in src/ui/nav.js).",
  "credits": "The credits roll (fillCredits in src/ui/credits.js) with every logo failing to load, so each draws its fallback."
};

const noteFor = (name) => {
  const key = Object.keys(NOTES).filter((k) => name === k || name.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  if (!key) {
    throw new Error(`no note for fixture ${name}`);
  }
  return NOTES[key];
};

const HEADER = `  This file is part of the Paraguayan Drone Combat Simulator.

  The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or (at
  your option) any later version.

  The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY, without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
  General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.`;

function fixtureText(name, { meta, html }) {
  const state = { ui: meta.ui || '', body: meta.body || '', ...(meta.outside ? { outside: true } : {}) };
  if (/[\u2013\u2014]/.test(html)) {
    throw new Error(`${name}: the markup holds an en or em dash`);
  }
  return `<!--\n  ${noteFor(name)}\n  Made by scripts/css-states-capture.js.\n\n${HEADER}\n-->\n<!-- state: ${JSON.stringify(state)} -->\n${html}\n`;
}

const page = await openPage({
  root,
  url: '/index.html?lang=en',
  /* The room's name and figure as css:golden seeds them: the shell
   * draws both at random otherwise, and a fixture must not change
   * between captures. */
  seed: [
    "try { localStorage.setItem('fdfpv.pilotPick', '[1,2,42]'); localStorage.setItem('fdfpv.pilotFigure', '3'); } catch (e) { /* storage refused */ }",
    `try { localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify({ airframeAsked: true }))}); } catch (e) { /* storage refused */ }`],
});
let failed = 0;
const written = new Set();
try {
  await page.until('window.__shellReady === true', 300000);
  await page.loaded();
  await page.evaluate("(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race'; ui.armReels = () => {}; ui.startReels = () => {}; return true; })()");
  for (const [name, run] of GROUPS) {
    if (ONLY.length && !ONLY.includes(name)) {
      continue;
    }
    const got = await page.evaluate(`(async () => {${LIB}\n  await (${run.toString()})();\n  return OUT;\n})()`).catch((e) => {
      failed += 1;
      console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
      return {};
    });
    for (const [fixture, v] of Object.entries(got)) {
      /* The server's port changes every run; the fixture page's base is
       * the same root, so the url resolves the same without it. */
      const html = v.html.split(page.origin).join('');
      await writeFile(join(FIXTURES, `${fixture}.html`), fixtureText(fixture, { ...v, html }));
      written.add(`${fixture}.html`);
    }
    console.log(`  ${name}: ${Object.keys(got).length} fixture(s)`);
  }
} finally {
  await page.close();
}
/* A fixture no group makes any more is a stale record of a state. */
if (!ONLY.length) {
  for (const f of (await readdir(FIXTURES)).filter((n) => n.endsWith('.html') && !written.has(n))) {
    failed += 1;
    console.log(`  FAIL  ${f}: no group makes it; delete it or bring its state back`);
  }
}
process.exit(failed ? 1 : 0);
