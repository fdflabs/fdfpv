/*
 * boot-check.js: the boot path's network shape and the board's read
 * deadline. The defect this guards against is not a wrong value: it is
 * the order of two correct calls and the absence of a timeout. DEPLOY.md
 * says the free board sleeps after fifteen minutes, takes about a minute
 * to wake, and that the simulator is unaffected because a static site
 * does not sleep. That stopped being true when main.js awaited two board
 * round trips before asking for dist/sim.wasm, with no deadline on the
 * fetch behind them. On a warm local board the wasm request left the
 * browser at 1519 ms, after both; on a sleeping board it would not have
 * left for a minute, and the loading screen would have blamed the
 * renderer.
 *
 * Most checks read source text, which is a weak test: it exists because
 * the alternative was no test. The strong version needs a browser, and
 * the properties asserted here are exactly the ones that survive a
 * browser check passing. One check drives the real board read against a
 * server that never answers, to prove the deadline is enforced and not
 * merely written down.
 *
 * Run with npm run lint:boot.
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

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFile(join(root, rel), 'utf8');

const [main, board, boot, loading] = await Promise.all([
  read('src/main.js'),
  read('src/share/board.js'),
  read('src/boot.js'),
  read('src/ui/loading.js'),
]);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
};

/*
 * Boot is one straight line of awaits from the top, so position in the
 * file is position in the await chain: the wasm fetch must start above
 * the first board call, not merely somewhere. The share adopt is boot's
 * only board call (it also used to adopt the board's most flown track,
 * until Track mode became the pilot's own tracks).
 */
{
  const wasmAt = main.indexOf('const simBytes = fetchBytes(WASM_URL');
  const shareAt = main.indexOf('await adoptShareFromLocation()');
  record('the flight controller is requested before the board',
    wasmAt > 0 && shareAt > wasmAt,
    wasmAt === -1 ? 'no concurrent simBytes fetch found in boot' : `wasm at ${wasmAt}, share adopt at ${shareAt}`);
}

/*
 * The loading screen's report starts a stage when it is not the current
 * one, so an ungated progress callback on a fetch that overlaps the
 * board would show "Flight controller" while the board is the holdup:
 * the same dishonesty the reorder removes.
 */
{
  const gated = /if \(simStageLive\) \{\s*\n\s*loading\.report\('sim'/.test(main);
  record('the sim stage is not announced early',
    gated && main.includes('simStageLive = true;'),
    gated ? 'progress is gated on the stage being live' : 'the progress callback is ungated, so it steals the stage');
}

/* A network wait on a service that sleeps must not be reported as one of the stages either side of it. */
record('the board wait is a named loading stage',
  loading.includes("board: 'Board'") && boot.includes("'three', 'board', 'sim'") && main.includes("loading.start('board')"),
  'stage named in loading.js, planned in boot.js, started in main.js');

/*
 * Abandoning a publish or a posted lap time does not undo it at the far
 * end, so the pilot would be told it failed while the board stored it:
 * writes get no deadline. A read that times out is the same event as a
 * board that is down, which every caller already handles, so every read
 * goes through the deadlined helper.
 */
{
  const raw = [];
  for (const line of board.split('\n')) {
    const at = line.indexOf('await fetch(');
    if (at !== -1) {
      raw.push(line.slice(at + 'await fetch('.length).trim());
    }
  }
  const outside = raw.filter((rest) => !rest.includes('{ signal: readSignal(ms) }'));
  const writes = outside.filter((rest) => rest.includes('{'));
  record('every board read carries a deadline', writes.length === outside.length,
    `${raw.length} raw fetches: ${writes.length} are writes with a method, the rest go through boardGet`);
  record('writes are deliberately not deadlined', writes.length > 0,
    `${writes.length} write(s) left without one, on purpose`);
}

/*
 * A server that accepts the connection and then says nothing is exactly
 * what a sleeping Render service does. The call is raced against a
 * deadline of our own: a build that has lost the timeout would otherwise
 * hang this check forever instead of failing it (found by removing the
 * timeout and watching the check wait).
 */
{
  const held = [];
  const server = createServer((req, res) => {
    held.push(res);
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  /* board.js reads window.location for its default origin; the origin under test is passed explicitly. */
  globalThis.window = { location: { hostname: '127.0.0.1', search: '', href: origin }, localStorage: null };
  const { BOARD_READ_TIMEOUT_MS, fetchTrackDocument } = await import(pathToFileURL(join(root, 'src/share/board.js')).href);

  const graceMs = BOARD_READ_TIMEOUT_MS + 4000;
  let graceTimer;
  const grace = new Promise((resolve) => {
    graceTimer = setTimeout(() => {
      resolve({ timedOut: false, message: `still waiting after ${graceMs} ms, so the read has no deadline` });
    }, graceMs);
    graceTimer.unref();
  });
  const started = Date.now();
  const call = fetchTrackDocument('trk-00000000', origin).then(
    () => ({ timedOut: false, message: 'the call returned, which a server that never answers cannot cause' }),
    (err) => ({ timedOut: Boolean(err && err.timeout), message: err && err.message ? err.message : String(err) }),
  );
  const outcome = await Promise.race([call, grace]);
  const took = Date.now() - started;
  clearTimeout(graceTimer);

  record('a board that never answers is abandoned, not waited on',
    outcome.timedOut && took < BOARD_READ_TIMEOUT_MS + 2000,
    outcome.timedOut
      ? `gave up after ${took} ms with "${outcome.message}"`
      : `did not time out after ${took} ms: ${outcome.message || 'it returned'}`);
  record('the timeout says the board, not DOMException', /board/i.test(outcome.message), `"${outcome.message}"`);

  for (const res of held) {
    res.destroy();
  }
  server.close();
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
}

/*
 * The loop schedules the next frame first so a slow frame does not stop
 * it, which also meant a throwing frame did not stop it: the picture
 * froze, the console filled with one identical error per frame, and the
 * pilot was told nothing.
 */
{
  const wrapped = /function frame\(nowWall\) \{\s*\n\s*requestAnimationFrame\(frame\);\s*\n\s*try \{\s*\n\s*frameBody\(nowWall\);/.test(main);
  record('a thrown frame is caught and reported',
    wrapped && main.includes('window.__frameFault'),
    wrapped ? 'frameBody runs inside a try, and the fault reaches the bug report' : 'the frame body is not wrapped');
}

/*
 * main.js used to end by calling boot() with no argument, which threw on
 * every load and appended a failure banner that a microtask later was
 * wiped by the UI build: invisible by accident, not by design.
 */
{
  const stray = main.includes('\nboot().catch(');
  record('main.js has no second entry point', !stray,
    stray ? 'boot() is still called at module scope and still throws' : 'boot.js owns the entry');
}

const width = Math.max(...results.map((r) => r.name.length));
console.log("boot-check: the order of the boot fetches, and the board's deadlines");
console.log('');
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log('');
console.log(`${passed} of ${results.length} checks clean`);

/* An abandoned fetch holds a socket open and Node will not exit while it does. */
process.exit(passed === results.length ? 0 : 1);
