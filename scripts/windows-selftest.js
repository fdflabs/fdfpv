/*
 * windows-selftest.js: the two named tabs, simulator and board
 * (src/share/windows.js).
 *
 *     node scripts/windows-selftest.js      (npm run windows:selftest)
 *
 * The names; a top level page claims its name and a frame does not; with
 * no window, or one that refuses, nothing throws; a named open hands back
 * the window and focuses it, a blocked one hands back null, and a window
 * that refuses focus is still handed back.
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

const w = await import('../src/share/windows.js');
check('the names', w.SIM_WINDOW === 'fdfpv-sim' && w.BOARD_WINDOW === 'fdfpv-board');
check('exports', Object.keys(w).sort().join() === 'BOARD_WINDOW,SIM_WINDOW,claimWindowName,openNamedWindow', Object.keys(w).join());

check('no window: no claim, no throw', w.claimWindowName('fdfpv-sim') === '');
const top = { name: '' };
top.top = top;
top.self = top;
globalThis.window = top;
check('a top level page claims its name', w.claimWindowName('fdfpv-sim') === 'fdfpv-sim' && top.name === 'fdfpv-sim');
const frame = { name: 'kept', self: null, top };
frame.self = frame;
globalThis.window = frame;
check('a frame claims nothing and keeps its name', w.claimWindowName('fdfpv-sim') === '' && frame.name === 'kept');
globalThis.window = { get top() { throw new Error('cross origin'); }, self: {} };
check('a window that refuses: no claim, no throw', w.claimWindowName('fdfpv-board') === '');

const log = [];
const opened = { focus: () => log.push('focus') };
globalThis.window = { open: (url, name) => { log.push(['open', url, name]); return opened; } };
check('a named open hands back the window', w.openNamedWindow('https://x/?a=1', 'fdfpv-board') === opened);
check('opened under the name, and focused', JSON.stringify(log) === JSON.stringify([['open', 'https://x/?a=1', 'fdfpv-board'], 'focus']), JSON.stringify(log));
globalThis.window = { open: () => null };
check('a blocked open hands back null', w.openNamedWindow('u', 'n') === null);
globalThis.window = { open: () => { throw new Error('blocked'); } };
check('an open that throws hands back null', w.openNamedWindow('u', 'n') === null);
const stubborn = { focus: () => { throw new Error('no'); } };
globalThis.window = { open: () => stubborn };
check('a window that refuses focus is still handed back', w.openNamedWindow('u', 'n') === stubborn);
delete globalThis.window;
check('no window at all: null', w.openNamedWindow('u', 'n') === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
