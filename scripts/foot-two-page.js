/*
 * foot-two-page.js: `npm run foot:twopage`, others see you walk
 * (docs/ON-FOOT.md, the walk plan's slice 6). Two headless pages of the
 * real shell in one room on swiss2, on a rooms server of the check's own
 * (tests/lib/roomsserver.js). A parks an Extra and steps out with the
 * foot key; B flies a Cub and watches.
 *
 *   walking  A walks with held W. B draws A's figure where A is: every
 *            sample within 0.3 m of where A stood in the 300 ms before it
 *            (one FOOT gap and the ease), at A's pace within 10 %, legs
 *            swinging, facing the way A walks.
 *   still    A stops: the figure stands within 5 cm of A, legs together.
 *   hangar   A goes into the hangar (window.__foot.hangar, the seam the
 *            door of slice 4 will drive): B puts the figure's body away,
 *            keeps "in the hangar" over the spot, names the status, and
 *            still draws A's parked aircraft. Out again, the body is back.
 *   spot     A flies again from where they stand: the figure stays on that
 *            spot, not back at the station, held by the once a second
 *            FOOT.
 *   wire     Everything A sent: binaries only POSE (46 bytes) and FOOT
 *            (16), every FOOT well formed, every profile only the keys a
 *            profile has. The hangar's inside is not built yet (slices 4
 *            and 7), so "its contents never go on the wire" is held only
 *            as far as this: nothing else goes.
 *
 *     SIM_GPU=1 node scripts/foot-two-page.js [ROOMS_URL] [OUT_DIR]
 *
 * Pictures in OUT_DIR, not in the repository.
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
import { keyInfo, openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { WALK_SPEED } from '../src/game/human.js';
import { FOOT_BYTES, POSE_BYTES, TYPE_FOOT, TYPE_POSE } from '../src/share/roomwire.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[3] || join(tmpdir(), 'foot-two-page');
mkdirSync(out, { recursive: true });

/* m: how far B's figure may be from where A stood in the LAG_MS before
 * it was drawn. */
const NEAR_M = 0.3;
const LAG_MS = 300;
/* rad: peers.js SWING_WALK, the legs' swing at WALK_SPEED. */
const SWING_WALK = 0.43;
const PROFILE_KEYS = ['airframe', 'map', 'figure', 'livery', 'parts', 'game', 'status'];

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

function seedFor(id) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  Object.assign(s, {
    map: 'swiss2', freestyleMap: 'swiss2', graphics: 'low', fpsCap: 0, airframeAsked: true, flightMode: 'angle',
  });
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.footSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { footSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`;
}

/* Every frame A's socket sends, kept in the page: binaries as their type
 * and length (and a FOOT whole), texts as they went. */
const WIRE_TAP = `(() => {
  const sent = [];
  window.__wireSent = sent;
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    if (typeof data === 'string') {
      sent.push({ text: data });
    } else {
      const b = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
      sent.push({ type: b[0], n: b.byteLength, foot: b[0] === ${TYPE_FOOT} ? Array.from(b) : null });
    }
    return send.call(this, data);
  };
})();`;

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  shot ${join(out, `${name}.png`)}`);
}

/* A log every frame, on the wall clock both pages share: A's walker, B's
 * drawing of A's figure. */
const LOG_A = `(() => {
  window.__footLog = [];
  const tick = () => {
    const w = window.__foot.state().walker;
    if (w) {
      window.__footLog.push([Date.now(), w.x, w.feet, w.z, w.heading]);
    }
    window.__footLogId = requestAnimationFrame(tick);
  };
  tick();
  return true;
})()`;
const LOG_B = `(() => {
  window.__footLog = [];
  const tick = () => {
    const p = window.__rooms().peers[0];
    if (p && p.figure) {
      window.__footLog.push([Date.now(), p.figure[0], p.figure[1], p.figure[2], p.figureYaw, p.figureSwing, p.figureShown]);
    }
    window.__footLogId = requestAnimationFrame(tick);
  };
  tick();
  return true;
})()`;
const STOP_LOG = '(() => { cancelAnimationFrame(window.__footLogId); const l = window.__footLog; window.__footLog = []; return l; })()';

const server = await roomsServer(process.argv[2], 'foot-two-page');
const url = `/index.html?rooms=${encodeURIComponent(server.url)}`;
console.log(`others see you walk, rooms at ${server.url}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: [seedFor('extra3d1308'), WIRE_TAP] });
const b = await openPage({ root, url, width: 1280, height: 720, seed: [seedFor('cub1400')] });
const peerOf = async (page) => (await page.evaluate('window.__rooms()')).peers[0];
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  for (const p of [a, b]) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  await b.until('window.__rooms().peers[0].drawn', 30000);
  const station = (await peerOf(b)).figure;
  check('two pages in one room, B draws A\'s pilot at the station', Array.isArray(station), code);

  /* Out, on A. */
  await a.until('window.__foot.state().could', 20000);
  await a.tap('Digit1');
  await a.until('window.__foot.state().on', 5000);
  const start = (await a.evaluate('window.__foot.state()')).walker;
  await b.until(`(() => { const p = window.__rooms().peers[0];
    return p.foot && Math.hypot(p.figure[0] - ${start.x}, p.figure[2] - ${start.z}) < 0.05; })()`, 5000).catch(() => {});
  const outB = await peerOf(b);
  check('A steps out: B draws the figure where A stands, off the station',
    Math.hypot(outB.figure[0] - start.x, outB.figure[2] - start.z) < 0.05 && Math.abs(outB.figure[1] - start.feet) < 0.05
    && Math.hypot(outB.figure[0] - station[0], outB.figure[2] - station[2]) > 1,
    `${Math.hypot(outB.figure[0] - start.x, outB.figure[2] - start.z).toFixed(3)} m from A, ${Math.hypot(outB.figure[0] - station[0], outB.figure[2] - station[2]).toFixed(1)} m from the station`);

  /* Walking: a fixed heading, held W for four seconds, logged on both. */
  const heading = start.heading + 0.6;
  await a.evaluate(`window.__foot.face(${heading})`);
  await a.evaluate(LOG_A);
  await b.evaluate(LOG_B);
  const key = (type, c) => a.cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo(c) }, a.sessionId);
  await key('keyDown', 'KeyW');
  await a.sleep(4000);
  const midB = await peerOf(b);
  await key('keyUp', 'KeyW');
  const logA = await a.evaluate(STOP_LOG);
  const logB = await b.evaluate(STOP_LOG);
  /* Past the half second ramp and the first FOOT's arrival. */
  const t0 = logA[0][0] + 800;
  const walkB = logB.filter((s) => s[0] >= t0 && s[0] <= logA.at(-1)[0]);
  let worst = 0;
  for (const s of walkB) {
    let best = Infinity;
    for (const p of logA) {
      if (p[0] >= s[0] - LAG_MS && p[0] <= s[0]) {
        best = Math.min(best, Math.hypot(s[1] - p[1], s[3] - p[3]));
      }
    }
    worst = Math.max(worst, best);
  }
  /* Two pages share the machine, so a frame rate is not promised: three
   * seconds at ten frames a second is the least judged. */
  check(`walking, B's figure is within ${NEAR_M} m of where A stood in the ${LAG_MS} ms before`, walkB.length >= 30 && worst <= NEAR_M,
    `worst ${worst.toFixed(3)} m over ${walkB.length} frames`);
  const paceOf = (log) => {
    const s = log.filter((x) => x[0] >= t0 + 200 && x[0] <= logA.at(-1)[0] - 300);
    return Math.hypot(s.at(-1)[1] - s[0][1], s.at(-1)[3] - s[0][3]) / ((s.at(-1)[0] - s[0][0]) / 1000);
  };
  const paceA = paceOf(logA);
  const paceB = paceOf(logB);
  /* On the wall clock: a frame over the walk's 100 ms cap walks A slower
   * than WALK_SPEED in wall time (foot:walk holds the pace on the walk's
   * own clock), and the figure must follow what A did. */
  check('the figure walks at A\'s pace, within 10 %', Math.abs(paceB / paceA - 1) <= 0.1,
    `A ${paceA.toFixed(2)} m/s (${WALK_SPEED} on its own clock), figure ${paceB.toFixed(2)} m/s`);
  /* The swing a walk at the figure's pace draws (peers.js stride). A stall
   * of A's page sends nothing for a while, the figure stops, and its legs
   * settle, as they should: so nine frames in ten, not every one. */
  const swings = walkB.map((s) => s[5]).sort((x, y) => x - y);
  const swingWant = (SWING_WALK * paceB) / WALK_SPEED;
  const swingMid = swings[swings.length >> 1];
  const swingP10 = swings[Math.floor(swings.length / 10)];
  check('its legs swing, as a walk at that pace does', Math.abs(swingMid / swingWant - 1) <= 0.25 && swingP10 > swingWant / 2,
    `median ${swingMid.toFixed(2)} rad, tenth percentile ${swingP10.toFixed(2)}, least ${swings[0].toFixed(2)}; a walk at ${paceB.toFixed(2)} m/s swings ${swingWant.toFixed(2)}`);
  /* The walk's heading is clockwise from -z; the figure's turn is the
   * other way (main.js roomPlaceFigure). Facing the way it goes: */
  const yawErr = Math.abs(Math.atan2(Math.sin(midB.figureYaw + heading), Math.cos(midB.figureYaw + heading)));
  const dx = walkB.at(-1)[1] - walkB[0][1];
  const dz = walkB.at(-1)[3] - walkB[0][3];
  const facing = [-Math.sin(midB.figureYaw), -Math.cos(midB.figureYaw)];
  const along = (facing[0] * dx + facing[1] * dz) / (Math.hypot(dx, dz) || 1);
  check('it faces the way A walks, not backwards', yawErr < 0.01 && along > 0.99, `yaw off ${yawErr.toFixed(4)} rad, cos ${along.toFixed(3)}`);
  await b.evaluate(`(() => { const f = window.__rooms().peers[0].figure;
    window.__setCam(f[0] + 4, f[1] + 1.8, f[2] + 4, f[0], f[1] + 0.9, f[2], 50); return true; })()`);
  await b.sleep(300);
  await shot(b, 'b-sees-a-walking');

  /* Still. */
  await a.sleep(1500);
  const stood = (await a.evaluate('window.__foot.state()')).walker;
  await b.sleep(1200);
  const stillB = await peerOf(b);
  check('A stops: the figure stands within 5 cm of A, legs together',
    Math.hypot(stillB.figure[0] - stood.x, stillB.figure[2] - stood.z) < 0.05 && stillB.figureSwing < 0.01,
    `${Math.hypot(stillB.figure[0] - stood.x, stillB.figure[2] - stood.z).toFixed(3)} m, swing ${stillB.figureSwing.toFixed(3)}`);

  /* The hangar. */
  await a.evaluate('window.__foot.hangar(true)');
  await b.until("(() => { const p = window.__rooms().peers[0]; return !p.figureShown && p.status === 'hangar'; })()", 5000).catch(() => {});
  const inB = await peerOf(b);
  const said = en['rooms.in_hangar'].replace('{name}', inB.label);
  check('in the hangar: B puts the body away and names the status', !inB.figureShown && inB.status === 'hangar',
    `shown ${inB.figureShown}, status ${inB.status}`);
  check('the mark over the spot says so', inB.figureLabel === said && Math.hypot(inB.figure[0] - stood.x, inB.figure[2] - stood.z) < 0.05,
    `"${inB.figureLabel}"`);
  check('and A\'s parked aircraft is still drawn', inB.drawn);
  await b.evaluate(`(() => { const f = window.__rooms().peers[0].figure;
    window.__setCam(f[0] + 5, f[1] + 2.5, f[2] + 5, f[0], f[1] + 1.5, f[2], 50); return true; })()`);
  await b.sleep(300);
  await shot(b, 'b-sees-a-in-the-hangar');
  await a.evaluate('window.__foot.hangar(false)');
  await b.until("(() => { const p = window.__rooms().peers[0]; return p.figureShown && p.status !== 'hangar'; })()", 5000).catch(() => {});
  const backB = await peerOf(b);
  check('out again, the body is back and the status gone', backB.figureShown && backB.status !== 'hangar' && backB.figureLabel === backB.label,
    `shown ${backB.figureShown}, status ${backB.status}, "${backB.figureLabel}"`);

  /* Fly again from the spot: the figure stays there. */
  await a.tap('Digit1');
  await a.until('!window.__foot.state().on', 5000);
  await a.sleep(4000);
  const spotB = await peerOf(b);
  check('A flies again: the figure stays on A\'s spot (FOOT once a second), not the station',
    spotB.figureShown && Math.hypot(spotB.figure[0] - stood.x, spotB.figure[2] - stood.z) < 0.05 && spotB.foot && spotB.foot.flags === 0,
    `${Math.hypot(spotB.figure[0] - stood.x, spotB.figure[2] - stood.z).toFixed(3)} m, flags ${spotB.foot && spotB.foot.flags}`);

  /* The wire, as A sent it. */
  const sent = await a.evaluate('window.__wireSent');
  const bins = sent.filter((m) => m.type !== undefined);
  const feet = bins.filter((m) => m.type === TYPE_FOOT);
  const strays = bins.filter((m) => !(m.type === TYPE_POSE && m.n === POSE_BYTES) && !(m.type === TYPE_FOOT && m.n === FOOT_BYTES));
  check('A sent only POSE and FOOT binaries, FOOT at its 16 bytes', feet.length > 20 && strays.length === 0,
    `${feet.length} FOOT, strays ${JSON.stringify(strays.slice(0, 3))}`);
  const profiles = sent.filter((m) => m.text).map((m) => JSON.parse(m.text)).filter((m) => m.type === 'profile' || m.type === 'hello').map((m) => m.profile);
  const extra = profiles.flatMap((p) => Object.keys(p || {}).filter((k) => !PROFILE_KEYS.includes(k)));
  check('and every profile only a profile\'s keys', profiles.length > 1 && extra.length === 0, `${profiles.length} profiles, extra ${extra.join()}`);

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await server.stop();
}
console.log(`\nfoot-two-page: ${passed} passed, ${failed} failed; pictures in ${out}`);
process.exit(failed ? 1 : 0);
