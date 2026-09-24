/*
 * wing-e2e.js: the wing, end to end, without a browser.
 *
 * A guidance law in Node flies the wing plant, the real one in
 * dist/sim.wasm, round a wing course built by the track builder's own
 * model: five metre gates on the 400 by 300 m airfield. The flight is
 * recorded with the shell's GhostRecorder, signed with a pilot key the
 * way the shell signs a time, and posted to a leaderboard started from
 * the board repository beside this one. The board's own lap check, which
 * is this repository's src/game/verify.js vendored, has to accept it.
 * Then the same flight with a gate left out has to be refused.
 *
 * Nothing here is synthetic: the positions come out of the plant, the
 * gates out of the builder, the signature out of src/share/identity.js.
 * The pilot is a pursuit law with a bank hold and a height hold, the
 * same loops tests/lib/wingpilot.js flies the gates with.
 *
 * Run with npm run wing:e2e. The board is found at ../fdfpv-leaderboard
 * or at FDFPV_BOARD; without one this fails rather than passes.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile, mkdtemp, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { attitude, must, wingPrelude, RC_STEP_MS } from '../tests/lib/wingpilot.js';
import { createElement, createSequenceEntry, createTrack } from '../src/trackbuilder/model.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { checkLap, gatesFromCourse } from '../src/game/verify.js';
import { GhostRecorder } from '../src/game/ghost.js';
import { encodeGhost } from '../src/share/ghostdata.js';
import { createIdentity, memoryStorage } from '../src/share/identity.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BOARD_PORT = 3197;

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

/* The course the lap selftest flies synthetically: four gates round the
 * airfield, faced by the builder. A rectangle, because a wing at cruise
 * turns in forty metres and the legs have to be long enough to line up
 * on a five metre hole. */
function wingCourse() {
  const doc = createTrack('Airfield loop', 'wing');
  for (const [x, y] of [[100, 75], [300, 75], [300, 225], [100, 225]]) {
    const gate = createElement(doc, 'gate', { x, y }, 0);
    doc.elements.push(gate);
    doc.sequence.push(createSequenceEntry(doc, gate.id));
  }
  applyAutoFaces(doc);
  return doc;
}

/*
 * The gates in the plant's own frame. The course is laid out in the scene
 * (x across, y up, z towards the camera) and the plant flies right handed
 * Z up, so each centre and each forward axis goes through frame.js once,
 * here, and the guidance never sees the scene.
 */
function gatesInSim(race) {
  const out = [];
  for (let k = 0; k < race.gates.length; k += 1) {
    const g = race.gates[(race.timingIdx + k) % race.gates.length];
    const c = threePosToSim(g.x, g.y + g.apertures[0].centreY, g.z, { x: 0, y: 0, z: 0 });
    const f = threeDirToSim(g.az.x, g.az.y, g.az.z, { x: 0, y: 0, z: 0 });
    out.push({ c, f });
  }
  return out;
}

/*
 * Waypoints: a line up point sixty metres before each gate on its axis,
 * the centre, and a carry through point after it, so the wing arrives at
 * the hole flying straight down its axis. `skip` leaves one gate out
 * entirely, the way a pilot who cut a corner would.
 */
function waypoints(gates, skip) {
  const along = (g, d) => ({ x: g.c.x + g.f.x * d, y: g.c.y + g.f.y * d, z: g.c.z + g.f.z * d });
  const pts = [];
  for (let k = 0; k < gates.length; k += 1) {
    if (k === skip) {
      continue;
    }
    pts.push(along(gates[k], -60), gates[k].c, along(gates[k], 25));
  }
  pts.push(along(gates[0], -60), gates[0].c, along(gates[0], 25));
  return pts;
}

/*
 * Fly the course. The plant starts a hundred metres before the timing
 * gate on its axis, thrown at twelve metres a second, and a pursuit law
 * banks it at the next waypoint while a height loop holds the gate's
 * centre height. The race is scored live in the scene frame, exactly as
 * the shell scores it, so the ghost begins on the timing line and ends
 * when the lap closes, or when the timing gate is passed again without
 * a lap, which is what a skipped gate leaves.
 */
async function flyCourse(sim, doc, { skip = -1 } = {}) {
  const course = courseFromDocument(doc);
  const race = new Race(gatesFromCourse(course), course.trackClass);
  race.next = race.timingIdx;
  const gates = gatesInSim(race);
  const pts = waypoints(gates, skip);
  const start = { x: gates[0].c.x - gates[0].f.x * 100, y: gates[0].c.y - gates[0].f.y * 100, z: gates[0].c.z };

  /* A fresh clock for each flight: sim_input refuses time running backwards. */
  must(sim.reset(), 'sim_reset');
  wingPrelude(sim);
  const yaw0 = Math.atan2(gates[0].f.y, gates[0].f.x);
  must(sim.e.sim_set_pose(start.x, start.y, start.z, Math.cos(yaw0 / 2), 0, 0, Math.sin(yaw0 / 2)), 'sim_set_pose');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');

  const recorder = new GhostRecorder();
  const scenePos = (s) => ({ x: -s[2], y: s[3], z: -s[1] });
  const sceneQuat = (s) => ({ x: -s[9], y: s[10], z: -s[8], w: s[7] });
  let wp = 0;
  let trim = 0;
  let prev = null;
  let lapStart = null;
  let lap = null;
  let lastGateMs = null;
  let ms = 0;
  const limitMs = 180000;
  let minGateMiss = Infinity;
  while (ms < limitMs) {
    const s = sim.readState().state;
    const p = { x: s[1], y: s[2], z: s[3] };
    const v = Math.hypot(s[4], s[5], s[6]);
    const { pitch, bank } = attitude(s);

    /* Advance the waypoint when it is behind us or within reach. */
    let target = pts[Math.min(wp, pts.length - 1)];
    const toT = { x: target.x - p.x, y: target.y - p.y };
    const dist = Math.hypot(toT.x, toT.y);
    const heading = Math.atan2(s[5], s[4]);
    const behind = (toT.x * Math.cos(heading) + toT.y * Math.sin(heading)) < 0;
    if ((dist < 12 || (behind && dist < 40)) && wp < pts.length - 1) {
      wp += 1;
      target = pts[wp];
    }

    /* Pursuit: heading error to the target becomes a bank, sixty degrees
     * at most, and the roll loop holds it. A target to the left is a
     * positive error and needs the left wing down, which is a negative
     * bank in attitude()'s convention. */
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    let err = want - heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const holdBank = Math.max(-1.05, Math.min(1.05, -1.6 * err));
    const roll = Math.max(-1, Math.min(1, -1.2 * (bank - holdBank) - 0.12 * s[11]));

    /* Height: the target's height, through a climb rate, through pitch. */
    const vzT = Math.max(-3, Math.min(3, 0.6 * (target.z - p.z)));
    trim += 0.00002 * (vzT - s[6]);
    trim = Math.max(-0.3, Math.min(0.3, trim));
    let pitchT = 0.05 * (vzT - s[6]) + trim + 0.12 * Math.abs(holdBank);
    pitchT = Math.max(-0.25, Math.min(0.3, pitchT));
    const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * (-s[12])));

    /* Speed: enough throttle to cruise near eighteen, more in the turn. */
    const duty = Math.max(0.35, Math.min(0.95, 0.65 + 0.05 * (18 - v) + 0.2 * Math.abs(holdBank)));

    if (process.env.WING_E2E_TRACE && ms % 2000 === 0) {
      console.log(`  ${(ms / 1000).toFixed(0)}s p ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(1)} v ${v.toFixed(1)} hdg ${(heading * 57.3).toFixed(0)} want ${(want * 57.3).toFixed(0)} wp ${wp} d ${dist.toFixed(0)} bank ${(bank * 57.3).toFixed(0)}/${(holdBank * 57.3).toFixed(0)} pitch ${(pitch * 57.3).toFixed(0)} duty ${duty.toFixed(2)}`);
    }
    must(sim.input(ms / 1000, roll, pitchStick, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    ms += RC_STEP_MS;

    const after = sim.readState().state;
    const curr = scenePos(after);
    if (prev) {
      race.update(prev, curr, ms, ms);
    }
    prev = curr;

    for (const g of gates) {
      minGateMiss = Math.min(minGateMiss, Math.hypot(after[1] - g.c.x, after[2] - g.c.y, after[3] - g.c.z));
    }

    if (lapStart == null && race.lapStartMs != null) {
      lapStart = race.lapStartMs;
      recorder.begin();
      lastGateMs = ms;
    }
    if (lapStart != null) {
      const q = sceneQuat(after);
      recorder.push(ms - lapStart, curr.x, curr.y, curr.z, q.x, q.y, q.z, q.w);
      if (race.laps.length === 1) {
        lap = recorder.finish(race.laps[0], race.lastSplits);
        break;
      }
      /* No lap will close with a gate skipped: stop when the timing gate's
       * plane is crossed again, a second or more after the start. */
      const t0 = gates[0];
      const alongAxis = (after[1] - t0.c.x) * t0.f.x + (after[2] - t0.c.y) * t0.f.y;
      const across = Math.hypot(after[1] - t0.c.x, after[2] - t0.c.y, after[3] - t0.c.z);
      if (skip >= 0 && ms - lastGateMs > 5000 && alongAxis > 0 && across < 12) {
        lap = recorder.finish(ms - lapStart, []);
        break;
      }
    }
  }
  return { lap, race, ms, minGateMiss, gates: gates.length };
}

async function startBoard(boardDir) {
  const dir = await mkdtemp(join(tmpdir(), 'fdfpv-wing-e2e-'));
  const child = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
    cwd: boardDir,
    env: {
      ...process.env,
      PORT: String(BOARD_PORT),
      BOARD_FILE: join(dir, 'board.json'),
      DATABASE_URL: '',
      SIM_ORIGIN: 'http://127.0.0.1:8000',
      BOARD_TRUST_PROXY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/health`).then((r) => r.json());
      if (health.ok) {
        return child;
      }
    } catch (e) {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`the board did not come up on ${BOARD_PORT}:\n${log}`);
}

async function main() {
  const boardDir = resolve(process.env.FDFPV_BOARD || join(root, '..', 'fdfpv-leaderboard'));
  await access(join(boardDir, 'src', 'server.js'));

  const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const sim = await loadSim(wasm);
  must(sim.init(config), 'init');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');

  const doc = wingCourse();
  console.log('the honest lap');
  const honest = await flyCourse(sim, doc);
  check('the wing flew a lap the course closed', honest.lap !== null, `${honest.ms} ms, ${honest.race.splits.length} gates, nearest ${honest.minGateMiss.toFixed(1)} m`);
  if (!honest.lap) {
    console.log(`\n${failed} FAILED, ${passed} passed`);
    process.exit(1);
  }
  const lapMs = honest.race.laps[0];
  console.log(`  lap ${Math.round(lapMs)} ms over ${honest.gates} gates, ghost ${honest.lap.count} samples`);
  const honestBytes = encodeGhost(honest.lap);
  const local = checkLap(doc, honestBytes, lapMs);
  check('the lap check accepts it here', local.ok === true, local.reason);
  check('at a wing\'s speed', local.ok && local.topSpeed > 12 && local.topSpeed < 30, `${local.topSpeed && local.topSpeed.toFixed(1)} m/s`);

  console.log('the lap with a gate skipped');
  const skipped = await flyCourse(sim, doc, { skip: 2 });
  check('the skipped flight came back round without a lap', skipped.lap !== null && skipped.race.laps.length === 0,
    `${skipped.ms} ms, laps ${skipped.race.laps.length}`);
  const skippedBytes = skipped.lap ? encodeGhost(skipped.lap) : new Uint8Array(0);
  const localBad = skipped.lap ? checkLap(doc, skippedBytes, skipped.lap.durationMs) : { ok: false, reason: 'no ghost' };
  check('the lap check refuses it here', localBad.ok === false && /never closed/.test(localBad.reason), localBad.reason);

  console.log('the board');
  const board = await startBoard(boardDir);
  try {
    const pilot = createIdentity(memoryStorage());
    const published = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/tracks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ author: 'Wing pilot', document: doc }),
    });
    const pubBody = await published.json();
    check('the wing course publishes', published.status === 201 && pubBody.id === doc.id, `${published.status} ${JSON.stringify(pubBody).slice(0, 160)}`);
    const listing = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/tracks`).then((r) => r.json());
    const row = (listing.tracks || []).find((t) => t.id === doc.id);
    check('and lists as a wing track', Boolean(row) && row.trackClass === 'wing', row && row.trackClass);

    const ghost = Buffer.from(honestBytes).toString('base64');
    const auth = await pilot.signTime({ trackId: doc.id, lapMs: Math.round(lapMs), ghost });
    const posted = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/tracks/${doc.id}/times`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Wing pilot', lapMs: Math.round(lapMs), ghost, key: auth.key, sig: auth.sig }),
    });
    const postedBody = await posted.json();
    check('the board accepts the signed flown lap with 201', posted.status === 201 && postedBody.rank === 1, `${posted.status} ${JSON.stringify(postedBody).slice(0, 160)}`);

    const badGhost = Buffer.from(skippedBytes).toString('base64');
    const badMs = skipped.lap ? Math.round(skipped.lap.durationMs) : 1;
    const badAuth = await pilot.signTime({ trackId: doc.id, lapMs: badMs, ghost: badGhost });
    const refused = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/tracks/${doc.id}/times`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Wing pilot', lapMs: badMs, ghost: badGhost, key: badAuth.key, sig: badAuth.sig }),
    });
    const refusedBody = await refused.json();
    check('the board refuses the lap with a gate skipped with 422', refused.status === 422, `${refused.status} ${JSON.stringify(refusedBody).slice(0, 160)}`);
  } finally {
    board.kill();
  }

  console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
