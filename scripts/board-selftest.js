/*
 * board-selftest.js: src/share/board.js pinned as a transcript.
 *
 *     node scripts/board-selftest.js [--dump=<file>]   (npm run board:selftest)
 *
 * The module that speaks to the public board, driven in Node with stand
 * ins for the page's address and localStorage. Recorded: which
 * board each kind of page picks (loopback, file://, deployed, a ?board=
 * query, a stored override, no window at all). The track reads and
 * writes and what a Fly link seated left with the track builder and the
 * race (the combat-only cut, 2026-10-20). Pinned by digest (scripts/lib/transcript.js), recorded
 * on the module before its rewrite. The featured strip's random fill is
 * recorded by what it must contain, not by its order.
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

import { seeded, transcript } from './lib/transcript.js';

const PINNED = '2eb327f62dc2b5b0a4798d753404f479e433f61ce3a654dc1cfabb7ef02a7b71';

class Storage {
  constructor() {
    this.map = new Map();
  }

  getItem(k) {
    if (this.refuse) {
      throw new Error('SecurityError');
    }
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    if (this.refuse) {
      throw new Error('SecurityError');
    }
    this.map.set(k, String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  clear() {
    this.map.clear();
    this.refuse = false;
  }

  /* Seats carry the time they were written; the clock is taken out. */
  dump() {
    return [...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<time>')]);
  }
}
const store = new Storage();
globalThis.localStorage = store;
Math.random = seeded(11);

function placeAt(href) {
  if (href === null) {
    delete globalThis.window;
    return;
  }
  const u = new URL(href);
  globalThis.window = {
    location: {
      href: u.href, hostname: u.hostname, search: u.search, origin: u.origin, pathname: u.pathname,
    },
  };
}

/* A browser that kept an override under the old name, as the module
 * loads: it is moved to the new name, once. */
store.map.set('webfpv.board.origin', 'https://kept.example/board');
const board = await import('../src/share/board.js');
const OVERRIDE = 'fdfpv.board.origin';
const t = transcript();
t.note('the old override, moved at load', store.dump());
store.clear();

t.note('exports', Object.keys(board).sort());
t.note('constants', [board.DEFAULT_BOARD_ORIGIN, board.PRODUCTION_BOARD_ORIGIN, board.BOARD_READ_TIMEOUT_MS]);

/* Which board, from where. */
const PLACES = [
  null,
  'http://127.0.0.1:8000/',
  'http://localhost:8000/?map=alps',
  'http://[::1]:8000/',
  'http://0.0.0.0:8000/',
  'file:///home/x/index.html',
  'https://paraguayandronecombatsimulator.com/',
  'https://fdflabs.github.io/fdfpv/',
  'https://paraguayandronecombatsimulator.com/?board=https://mine.example/b///',
  'https://paraguayandronecombatsimulator.com/?board=%20%20',
  'https://paraguayandronecombatsimulator.com/?board=',
  'http://127.0.0.1:3180/?map=alps',
];
for (const place of PLACES) {
  for (const stored of [null, 'https://stored.example/board/', '   ', 'https://fdfpv.example/board']) {
    store.clear();
    placeAt(place);
    if (stored !== null) {
      store.map.set(OVERRIDE, stored);
    }
    const label = `${place} stored=${stored}`;
    t.rec(`defaultBoardOrigin ${label}`, () => board.defaultBoardOrigin());
    t.rec(`boardOrigin ${label}`, () => board.boardOrigin());
    t.rec(`boardConfigured ${label}`, () => board.boardConfigured());
  }
}
store.clear();
store.refuse = true;
placeAt('https://paraguayandronecombatsimulator.com/');
t.rec('boardOrigin with storage refused', () => board.boardOrigin());

t.finish('board.js', PINNED);
