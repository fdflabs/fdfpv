/*
 * editor-ui-check.js: the movie editor's screen does what its keys say.
 *
 * Drives tests/crash/editor-ui.html, which mounts src/replay/editor.js on a
 * fake crash cam (no sim, no scene), in one headless Chromium through
 * tests/lib/page.js, and asserts docs/EDITOR-PLAN.md 7.3: one block per
 * shot with its rig's class and name; K, 1 to 6, Del, Z, Shift+Z, Ctrl+Y,
 * T, Comma and Period change the edit as 2.3 says; a grip dragged 100 px
 * moves its cut by 100 px worth of clip and is one undo step; the export
 * dialog opens on C, Enter starts it, Esc cancels it with no download, a
 * finished export downloads once with the choices made; the same with a
 * stubbed standard pad (Y, X, LT, RT, Back, Start, L3, B); and every
 * replay.* key the screen asks for is in en.js and es.js.
 *
 * With --shots=<dir> it leaves pictures of the strip with four shots, the
 * transition popover, the dialog and its progress, in en and es, for the
 * owner (never committed). Run with npm run editor:ui.
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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo } from '../tests/lib/page.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const shotsDir = shotsArg ? shotsArg.slice('--shots='.length) : '';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* ---- the words: every replay.* key the screen asks for, in both tables ---- */
console.log('strings');
const src = await readFile(join(root, 'src/replay/editor.js'), 'utf8');
const used = new Set([...src.matchAll(/'(replay\.[a-z0-9_]+)'/g)].map((m) => m[1]));
for (const rig of ['chase', 'orbit', 'free', 'tripod', 'fpv', 'follow']) {
  used.add(`replay.rig_${rig}`);
}
for (const e of ['cut', 'blend', 'glide']) {
  used.add(`replay.enter_${e}`);
}
used.add('replay.grip_in');
used.add('replay.grip_out');
const missingEn = [...used].filter((k) => !(k in en));
const missingEs = [...used].filter((k) => !(k in es));
check(`the ${used.size} replay keys the screen uses are in en.js`, missingEn.length === 0, missingEn.join(', '));
check('and in es.js', missingEs.length === 0, missingEs.join(', '));
const replayKeys = Object.keys(en).filter((k) => k.startsWith('replay.'));
const esGap = replayKeys.filter((k) => !(k in es));
check(`every one of the ${replayKeys.length} replay keys in en.js is in es.js`, esGap.length === 0, esGap.join(', '));
const dashes = replayKeys.filter((k) => /[\u2013\u2014]/.test(en[k]) || /[\u2013\u2014]/.test(es[k] || ''));
check('no replay string has an em or en dash', dashes.length === 0, dashes.join(', '));

/* ---- the page ---- */
const page = await openPage({ root, width: 1600, height: 900, url: '/tests/crash/editor-ui.html' });
const { cdp, sessionId, evaluate, until, tap } = page;

const settle = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
async function key(code, modifiers = 0) {
  const mods = [];
  if (modifiers & 8) {
    mods.push({ key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  }
  if (modifiers & 2) {
    mods.push({ key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  }
  for (const m of mods) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers, ...m }, sessionId);
  }
  if (mods.length) {
    const info = keyInfo(code);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers, ...info, text: undefined }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...info }, sessionId);
  } else {
    await tap(code);
  }
  for (const m of mods.reverse()) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 0, ...m }, sessionId);
  }
  await settle();
}
const state = () => evaluate(`(() => {
  const v = __ui.api.view();
  return {
    t: v.t,
    shot: v.shot,
    out: v.edit.out,
    shots: v.edit.shots.map((s) => ({ t0: s.t0, rig: s.cam.rig, speed: s.speed, enter: s.enter.type, d: s.enter.d })),
    canUndo: v.canUndo,
    canRedo: v.canRedo,
    blocks: [...document.querySelectorAll('.cc-shot')].map((b) => ({ cls: b.className, label: b.firstChild.textContent, speed: b.lastChild.textContent })),
    toast: document.querySelector('.cc-toast').hidden ? '' : document.querySelector('.cc-toast').textContent,
    exportOpen: !document.querySelector('.cc-export').parentElement.hidden,
    exportGo: !document.querySelector('.cc-export .cc-btn.primary').disabled,
    progress: !document.querySelector('.cc-export-progress').hidden,
    calls: __ui.calls.map((c) => c.name),
    downloads: __ui.downloads.map((d) => d.name),
    hints: document.querySelector('.cc-hints').textContent,
  };
})()`);
const seek = async (t) => {
  await evaluate(`__ui.api.seek(${t})`);
  await settle();
};
async function picture(name) {
  if (!shotsDir) {
    return;
  }
  await settle();
  await mkdir(shotsDir, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const path = join(shotsDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot  ${path}`);
}
async function mouse(type, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, sessionId);
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;

/* Four shots, as a pilot makes them: stop, K, pick a camera. */
async function fourShots() {
  for (const [t, digit] of [[8, 'Digit2'], [16, 'Digit3'], [22, 'Digit5']]) {
    await seek(t);
    await key('KeyK');
    await key(digit);
  }
}

try {
  await until('window.__ui && window.__ui.ready', 30000);
  await settle();

  console.log('the strip');
  let s = await state();
  check('a new replay is one shot, Chase, the whole clip', s.shots.length === 1 && s.shots[0].rig === 'chase' && s.shots[0].t0 === 0 && s.out === 30,
    JSON.stringify(s.shots));
  check('drawn as one chase block labelled Chase', s.blocks.length === 1 && s.blocks[0].cls.includes('rig-chase') && s.blocks[0].label === en['replay.rig_chase'],
    JSON.stringify(s.blocks));

  console.log('K and 1 to 6');
  await seek(8);
  await key('KeyK');
  s = await state();
  check('K cuts at the playhead with the same camera on both sides', s.shots.length === 2 && s.shots[1].t0 === 8 && s.shots[1].rig === 'chase',
    JSON.stringify(s.shots));
  check('and says to pick the camera', s.toast === en['replay.cut_added'], s.toast);
  await key('Digit2');
  s = await state();
  check('2 makes the shot under the playhead an orbit', s.shots[1].rig === 'orbit' && s.shots[0].rig === 'chase', JSON.stringify(s.shots));
  check('its block turns orbit, labelled Orbit', s.blocks[1].cls.includes('rig-orbit') && s.blocks[1].label === en['replay.rig_orbit'],
    JSON.stringify(s.blocks[1]));
  for (const [t, digit] of [[16, 'Digit3'], [22, 'Digit5']]) {
    await seek(t);
    await key('KeyK');
    await key(digit);
  }
  s = await state();
  check('four shots, four blocks: chase orbit free onboard', s.shots.map((x) => x.rig).join() === 'chase,orbit,free,fpv'
    && s.blocks.map((b) => b.cls.match(/rig-(\w+)/)[1]).join() === 'chase,orbit,free,fpv', JSON.stringify(s.blocks));
  await key('KeyK');
  check('K again on a cut changes nothing', (await state()).shots.length === 4);

  console.log('Up Down, T, Comma Period');
  await seek(10);
  await key('ArrowDown');
  await key('ArrowDown');
  s = await state();
  check('Down twice makes the orbit shot 0.25x, the others stay 1x', s.shots.map((x) => x.speed).join() === '1,0.25,1,1', JSON.stringify(s.shots));
  check('and its block says 0.25x', s.blocks[1].speed === '0.25x', s.blocks[1].speed);
  const enters = [];
  for (let k = 0; k < 3; k += 1) {
    await key('KeyT');
    enters.push((await state()).shots[1].enter);
  }
  check('T cycles the cut into the shot: blend, glide, cut', enters.join() === 'blend,glide,cut', enters.join());
  await seek(17);
  await key('KeyT');
  check('T on a later shot sets its blend only', (await state()).shots.map((x) => x.enter).join() === 'cut,cut,blend,cut');
  await seek(12);
  await key('Period');
  const p1 = (await state()).t;
  await key('Period');
  const p2 = (await state()).t;
  await key('Comma');
  const p3 = (await state()).t;
  check('Period goes to the next cut, Comma to the previous', p1 === 16 && p2 === 22 && p3 === 16, `${p1} ${p2} ${p3}`);
  await seek(1.5);
  await key('KeyI');
  await seek(28.5);
  await key('KeyO');
  s = await state();
  const hatch = await evaluate('[...document.querySelectorAll(".cc-hatch")].map((h) => h.getBoundingClientRect().width)');
  check('I and O move the movie\'s first and last edge, and hatch what is left out', s.shots[0].t0 === 1.5 && s.out === 28.5
    && hatch.every((w) => w > 10), `${s.shots[0].t0} ${s.out} ${hatch}`);
  await seek(16);
  await picture('editor-timeline-en');
  await key('KeyZ');
  await key('KeyZ');
  s = await state();
  check('and Z twice puts both back', s.shots[0].t0 === 0 && s.out === 30);

  console.log('Del, Z, Shift+Z, Ctrl+Y');
  await key('Delete');
  s = await state();
  check('Del removes the cut nearest the playhead', s.shots.length === 3 && !s.shots.some((x) => x.t0 === 16), JSON.stringify(s.shots.map((x) => x.t0)));
  check('and says Z undoes it', s.toast === en['replay.cut_removed'], s.toast);
  await key('KeyZ');
  s = await state();
  check('Z puts it back, blend and all', s.shots.length === 4 && s.shots[2].t0 === 16 && s.shots[2].enter === 'blend' && s.shots[2].rig === 'free');
  await key('KeyZ', 8);
  check('Shift+Z removes it again', (await state()).shots.length === 3);
  await key('KeyZ');
  await key('KeyY', 2);
  check('Ctrl+Y redoes too', (await state()).shots.length === 3);
  await key('KeyZ');
  check('and Z undoes', (await state()).shots.length === 4);

  console.log('dragging a grip');
  const g = await evaluate(`(() => {
    const grip = document.querySelector('.cc-grip.cut[data-i="1"]');
    const r = grip.getBoundingClientRect();
    const sr = document.querySelector('.cc-strip').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: sr.width };
  })()`);
  const expectDt = (100 / g.width) * 30;
  const before = (await state()).calls.filter((c) => c === 'begin').length;
  await mouse('mousePressed', g.x, g.y);
  for (let k = 1; k <= 10; k += 1) {
    await mouse('mouseMoved', g.x + k * 10, g.y);
    await settle();
  }
  await mouse('mouseReleased', g.x + 100, g.y);
  await settle();
  s = await state();
  const moved = s.shots[1].t0;
  check('a grip dragged 100 px moves its cut by 100 px of clip', near(moved, 8 + expectDt, (0.6 / g.width) * 30),
    `${moved.toFixed(4)} s, want ${(8 + expectDt).toFixed(4)} s`);
  check('as one gesture', s.calls.filter((c) => c === 'begin').length === before + 1 && s.calls.at(-1) === 'end');
  await key('KeyZ');
  check('which is one undo step', (await state()).shots[1].t0 === 8, `${(await state()).shots[1].t0}`);
  await key('KeyZ', 8);
  check('and one redo step', (await state()).shots[1].t0 === moved);
  await key('KeyZ');

  console.log('the transition popover');
  const g2 = await evaluate(`(() => {
    const r = document.querySelector('.cc-grip.cut[data-i="1"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await mouse('mousePressed', g2.x, g2.y);
  await mouse('mouseReleased', g2.x, g2.y);
  await settle();
  check('a click on a grip opens Cut Blend Glide over it', await evaluate('!document.querySelector(".cc-pop").hidden'));
  await evaluate('[...document.querySelectorAll(".cc-pop button")].find((b) => b.dataset.value === "blend").click()');
  await settle();
  s = await state();
  check('Blend in it sets the cut to a half second blend', s.shots[1].enter === 'blend' && s.shots[1].d === 0.5, JSON.stringify(s.shots[1]));
  check('the grip draws the blend', await evaluate('document.querySelector(".cc-grip.cut[data-i=\\"1\\"]").classList.contains("blend")'));
  await picture('editor-popover-en');
  await key('Escape');
  check('Esc closes the popover and not the editor', await evaluate('document.querySelector(".cc-pop").hidden') && !(await state()).calls.includes('close'));
  await key('KeyZ');

  console.log('the export dialog');
  await evaluate('__ui.exportPace.framesPerTick = 0');
  await key('KeyC');
  await until('!document.querySelector(".cc-export .cc-btn.primary").disabled', 5000);
  s = await state();
  check('C opens the export dialog', s.exportOpen && !s.progress);
  const dialog = await evaluate(`(() => {
    const on = [...document.querySelectorAll('.cc-export .cc-seg button.on')].map((b) => b.textContent);
    return { on, text: document.querySelector('.cc-export').textContent };
  })()`);
  check('defaults 1080p, 60, MP4, sound on', dialog.on.join() === `1080p,60,MP4,${en['replay.export_on']}`, dialog.on.join());
  check('and it says there is no music', dialog.text.includes(en['replay.export_no_music']));
  await picture('editor-export-en');
  await key('KeyK');
  check('keys under the dialog do not reach the edit', (await state()).shots.length === 4);
  await key('Enter');
  s = await state();
  const job = await evaluate('__ui.calls.filter((c) => c.name === "exportMovie").at(-1).args[0]');
  check('Enter starts the export with the choices', s.progress && job.size === 1080 && job.fps === 60 && job.format === 'mp4' && job.sound === true,
    JSON.stringify(job));
  await evaluate('__ui.exportPace.framesPerTick = 60');
  await settle();
  await evaluate('__ui.exportPace.framesPerTick = 0');
  await until('parseInt(document.querySelector(".cc-export-pct").textContent, 10) > 0', 5000);
  await picture('editor-exporting-en');
  await key('Escape');
  s = await state();
  check('Esc cancels it', s.calls.includes('cancelExport') && !s.exportOpen && s.downloads.length === 0, JSON.stringify(s.downloads));
  check('and says so', s.toast === en['replay.export_cancelled'], s.toast);

  await key('KeyC');
  await until('!document.querySelector(".cc-export .cc-btn.primary").disabled', 5000);
  await evaluate('[...document.querySelectorAll(".cc-export .cc-seg button")].filter((b) => b.textContent === "720p" || b.textContent === "30").forEach((b) => b.click())');
  await evaluate('__ui.exportPace.framesPerTick = 400');
  await key('Enter');
  await until('__ui.downloads.length === 1', 10000);
  s = await state();
  const job2 = await evaluate('__ui.calls.filter((c) => c.name === "exportMovie").at(-1).args[0]');
  check('a finished export downloads the movie once', s.downloads.length === 1 && s.downloads[0].endsWith('.mp4') && !s.exportOpen, JSON.stringify(s.downloads));
  check('at the size and frame rate picked', job2.size === 720 && job2.fps === 30, JSON.stringify(job2));
  check('and remembers them', await evaluate('JSON.parse(localStorage.getItem("webfpv.replay.export.v1")).size === 720'));

  await seek(1);
  await evaluate('__ui.api.setSpeed(0.1)');
  await key('KeyC');
  await settle();
  await until('document.querySelector(".cc-export .warn:not([hidden])")', 5000);
  s = await state();
  const movieLen = await evaluate('__ui.api.view().movie.dur');
  check(`a ${movieLen.toFixed(0)} s movie cannot be exported past the 120 s cap`, movieLen > 120 && s.exportOpen && !s.exportGo);
  await key('Escape');
  check('Esc closes the dialog', !(await state()).exportOpen);
  await key('KeyZ');

  console.log('the pad');
  await evaluate(`(() => {
    window.__pad = new Array(17).fill(false);
    navigator.getGamepads = () => [{ connected: true, mapping: 'standard', buttons: window.__pad.map((p) => ({ pressed: p, value: p ? 1 : 0 })) }];
  })()`);
  await settle();
  const press = async (i) => {
    await evaluate(`window.__pad[${i}] = true`);
    await settle();
    await evaluate(`window.__pad[${i}] = false`);
    await settle();
  };
  s = await state();
  check('with a pad the hints name its buttons', s.hints.includes('LT RT') && s.hints.includes('Start'), s.hints.slice(0, 60));
  await seek(4);
  await press(3);
  s = await state();
  check('Y cuts', s.shots.length === 5 && s.shots[1].t0 === 4, JSON.stringify(s.shots.map((x) => x.t0)));
  await press(2);
  check('X gives this shot the next camera', (await state()).shots[1].rig === 'orbit');
  await press(10);
  check('L3 removes the nearest cut', (await state()).shots.length === 4);
  await press(8);
  check('Back undoes', (await state()).shots.length === 5);
  await press(7);
  const rt = (await state()).t;
  await press(7);
  const rt2 = (await state()).t;
  await press(6);
  const lt = (await state()).t;
  check('RT and LT go to the next and previous cut', rt === 8 && rt2 === 16 && lt === 8, `${rt} ${rt2} ${lt}`);
  await evaluate('__ui.exportPace.framesPerTick = 0');
  await press(9);
  await until('!document.querySelector(".cc-export .cc-btn.primary").disabled', 5000);
  check('Start opens the export dialog', (await state()).exportOpen);
  const exportsBefore = (await state()).calls.filter((c) => c === 'exportMovie').length;
  await press(9);
  s = await state();
  check('Start in it starts the export', s.progress && s.calls.filter((c) => c === 'exportMovie').length === exportsBefore + 1);
  await press(1);
  s = await state();
  check('B cancels it', !s.exportOpen && s.calls.at(-1) === 'cancelExport');
  await evaluate('navigator.getGamepads = () => []');

  check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

  if (shotsDir) {
    console.log('es');
    await cdp.send('Page.navigate', { url: `${page.origin}/tests/crash/editor-ui.html?lang=es` }, sessionId);
    await until('window.__ui && window.__ui.ready', 30000);
    await settle();
    await fourShots();
    await seek(10);
    await key('ArrowDown');
    await key('ArrowDown');
    await seek(17);
    await key('KeyT');
    await seek(12);
    const esText = await evaluate('document.querySelector(".cc-dock").textContent');
    check('the Spanish screen reads Cortar and Deshacer', esText.includes(es['replay.cut']) && esText.includes(es['replay.undo']));
    await picture('editor-timeline-es');
    await evaluate('__ui.exportPace.framesPerTick = 0');
    await key('KeyC');
    await until('!document.querySelector(".cc-export .cc-btn.primary").disabled', 5000);
    await picture('editor-export-es');
    check('no page errors in es', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  }
} catch (err) {
  check('the run finished', false, err.message);
} finally {
  await page.close();
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
