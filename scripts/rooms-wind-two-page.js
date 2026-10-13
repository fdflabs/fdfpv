/*
 * rooms-wind-two-page.js: a quad and a wing in one room fly the room's air
 * (docs/WEATHER-CONTRACT.md, docs/redesign/PLAN.md phase 15), on a rooms
 * server this check starts itself (edge/rooms/node.js, scratch database).
 *
 *     node scripts/rooms-wind-two-page.js      (npm run rooms:wind)
 *
 * check:weather-room holds the preset and the seed; this holds the numbers
 * each plant is handed. The host (a quad) sets Gusty; the other page flies
 * a wing. On both pages, while they fly:
 *   - the air's clock is the room's: the time the last step's air was read
 *     at is the room's clock, to within a frame;
 *   - the air handed over is the room's air at the craft's place and that
 *     time, bit for bit, recomputed here from src/game/weather.js;
 *   - the other page's air at the same place and room time is the same air,
 *     bit for bit, so both plants get the same sim_set_wind there and then;
 *   - the plant holds it: sim_wind is the mean handed over plus gusts no
 *     larger than the gust sum's peak.
 *   - the gusts on top (a sum of cosines, src/native/plant_wing.c
 *     plant_wind) run on the room's clock: each run sets the plant's gust
 *     clock to the room's at its start (sim_set_wind_clock), so its gust
 *     clock (that plus the plant's own) is the room's within a frame on
 *     both pages, and the gust the plant holds is the cosine sum at that
 *     room millisecond, recomputed here: a function of the room's
 *     millisecond and the room's RMS alone, so two plants at the same room
 *     ms meet the same gust.
 * Exit 0 on a pass, 1 otherwise.
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

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { makeWeather } from '../src/game/weather.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'rooms-wind-'));
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;

const QUAD = 'interceptor';
const WING = 'cub1400';
/* The gust sum's peak over its RMS: plant_wing.c GUST_A summed. */
const GUST_A = [0.7228, 0.7088, 0.6243, 0.5072, 0.4059, 0.3169, 0.2512];
const GUST_PEAK = GUST_A.reduce((x, y) => x + y, 0);
/* plant_wing.c GUST_W, GUST_PX, GUST_PY and GUST_WRAP_STEPS. */
const GUST_W = [0.20944, 0.349066, 0.571199, 0.966644, 1.570796, 2.617994, 4.18879];
const GUST_PX = [0.8608, 4.744, 2.3441, 6.2273, 3.8273, 1.4274, 5.3106];
const GUST_PY = [2.9106, 0.5106, 4.3939, 1.9939, 5.8771, 3.4772, 1.0772];
const GUST_WRAP = 2 ** 27;
/* The gust at gust clock ms (whole), per unit RMS, JS maths: within a
 * hair of the plant's fixed libm, not bit for bit. */
function gustAt(ms) {
  const t = (ms % GUST_WRAP) / 1000;
  let x = 0;
  let y = 0;
  for (let k = 0; k < GUST_W.length; k += 1) {
    x += GUST_A[k] * Math.cos(GUST_W[k] * t + GUST_PX[k]);
    y += GUST_A[k] * Math.cos(GUST_W[k] * t + GUST_PY[k]);
  }
  return [x, y];
}
/* The air is read before each step and the room's clock when asked, a
 * frame or two later; two frames at 30 fps plus the clock's own sync. */
const CLOCK_MS = 100;
const SAMPLES = 5;

function seedFor(id) {
  const s = seatAirframe({ airframe: id, rates: airframeById(id).rates }, id);
  Object.assign(s, {
    map: 'swiss2', freestyleMap: 'swiss2', graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true, weather: 'calm',
  });
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/* A fresh run thrown into the air at x, then 40 frames of it. */
const fly = (p, x) => p.evaluate(`(async () => {
  window.__crashThrow({ fresh: true, x: ${x}, y: 400, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 40; i += 1) await new Promise((r) => requestAnimationFrame(r));
  return JSON.stringify(window.__weatherFlown());
})()`).then(JSON.parse);
const sample = async (p) => JSON.parse(await p.evaluate('JSON.stringify(window.__airFlown())'));
const airThere = async (p, s) => JSON.parse(await p.evaluate(
  `JSON.stringify(window.__airFlown(${s.pos.join(', ')}, ${s.t}))`,
));
const same = (u, v) => u && v && ['x', 'z', 'gust', 'up'].every((k) => Object.is(u[k], v[k]));
const show = (u) => (u ? `${u.x.toFixed(4)} ${u.z.toFixed(4)} gust ${u.gust.toFixed(4)} up ${u.up.toFixed(4)}` : 'none');

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const a = await openPage({ root, url, width: 960, height: 540, seed: seedFor(QUAD) });
const b = await openPage({ root, url, width: 960, height: 540, seed: seedFor(WING) });
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
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  const errors0 = [a.errors.length, b.errors.length];
  const seated = [await a.evaluate('window.__ui.settings.airframe'), await b.evaluate('window.__ui.settings.airframe')];
  check('the host flies a quad, the other page a wing', seated[0] === QUAD && seated[1] === WING, seated.join(' '));

  await a.evaluate("window.__ui.settings.weather = 'gusty'; true");
  await fly(a, 0);
  await a.evaluate('new Promise((r) => setTimeout(r, 500))');
  const fa = await fly(a, 0);
  const fb = await fly(b, 60);
  check('the host sets gusty: both pages fly it, with the same seed',
    fa && fb && fa.preset === 'gusty' && fb.preset === 'gusty' && fa.seed === fb.seed && fa.map === fb.map,
    `${JSON.stringify(fa)} ${JSON.stringify(fb)}`);
  const room = fa ? makeWeather(fa.map, fa.preset, fa.seed) : null;

  const lag = { a: [], b: [] };
  const gustLag = { a: [], b: [] };
  let gustOn = 0;
  let exact = 0;
  let shared = 0;
  let held = 0;
  let n = 0;
  for (let k = 0; k < SAMPLES; k += 1) {
    await a.evaluate('new Promise((r) => setTimeout(r, 300))');
    const sa = await sample(a);
    const sb = await sample(b);
    if (!sa || !sb || !room) {
      break;
    }
    n += 1;
    lag.a.push(sa.roomMs - sa.t * 1000);
    lag.b.push(sb.roomMs - sb.t * 1000);
    gustLag.a.push(sa.roomMs - (sa.gustClockMs + Math.round(sa.step * 1000)));
    gustLag.b.push(sb.roomMs - (sb.gustClockMs + Math.round(sb.step * 1000)));
    for (const [s, other] of [[sa, b], [sb, a]]) {
      const want = { x: 0, z: 0, gust: 0, up: 0 };
      room.at(s.pos[0], s.pos[1], s.pos[2], s.t, want);
      exact += same(want, s.air) ? 1 : 0;
      const there = await airThere(other, s);
      shared += same(there, s.air) ? 1 : 0;
      const bound = GUST_PEAK * s.air.gust + 1e-9;
      const gx = s.wind[0] - s.set[0];
      const gy = s.wind[1] - s.set[1];
      held += Math.abs(gx) <= bound && Math.abs(gy) <= bound && (gx !== 0 || gy !== 0) ? 1 : 0;
      const [ux, uy] = gustAt(s.gustClockMs + Math.round(s.step * 1000));
      gustOn += Math.abs(gx - s.air.gust * ux) <= 1e-9 && Math.abs(gy - s.air.gust * uy) <= 1e-9 ? 1 : 0;
      if (k === 0) {
        console.log(`  air at ${s.pos.map((v) => v.toFixed(1)).join(' ')}, t ${s.t.toFixed(3)} s: ${show(s.air)}; `
          + `plant step clock ${s.step.toFixed(3)} s, gust clock ${s.gustClockMs} ms, its gust ${gx.toFixed(4)} ${gy.toFixed(4)}`);
      }
    }
  }
  const worst = (xs) => Math.max(...xs.map(Math.abs));
  check('both pages sampled while flying gusty', n === SAMPLES, `${n} of ${SAMPLES}`);
  check(`the quad's air is on the room's clock, within ${CLOCK_MS} ms`, n > 0 && worst(lag.a) <= CLOCK_MS,
    lag.a.map((v) => v.toFixed(0)).join(' '));
  check(`the wing's air is on the room's clock, within ${CLOCK_MS} ms`, n > 0 && worst(lag.b) <= CLOCK_MS,
    lag.b.map((v) => v.toFixed(0)).join(' '));
  check('each plant is handed the room\'s air at its place and time, bit for bit', n > 0 && exact === 2 * n, `${exact} of ${2 * n}`);
  check('the other page\'s air at the same place and room time is the same, bit for bit', n > 0 && shared === 2 * n,
    `${shared} of ${2 * n}`);
  check('each plant holds it: sim_wind is the mean plus gusts within their peak', n > 0 && held === 2 * n, `${held} of ${2 * n}`);
  check(`the quad's gusts are on the room's clock, within ${CLOCK_MS} ms`, n > 0 && worst(gustLag.a) <= CLOCK_MS,
    gustLag.a.map((v) => v.toFixed(0)).join(' '));
  check(`the wing's gusts are on the room's clock, within ${CLOCK_MS} ms`, n > 0 && worst(gustLag.b) <= CLOCK_MS,
    gustLag.b.map((v) => v.toFixed(0)).join(' '));
  check('each plant\'s gust is the room\'s at its room millisecond, so both pages meet the same gust there',
    n > 0 && gustOn === 2 * n, `${gustOn} of ${2 * n}`);

  await a.evaluate("window.__ui.settings.weather = 'calm'; true");
  await fly(a, 0);
  await a.evaluate('new Promise((r) => setTimeout(r, 500))');
  const ca = await fly(a, 0);
  const cb = await fly(b, 60);
  const airA = await sample(a);
  const airB = await sample(b);
  check('calm again: both fly still air', ca === null && cb === null && airA === null && airB === null);

  const refused = /^network: .*ERR_CONNECTION_REFUSED/;
  const other = [...a.errors.slice(errors0[0]), ...b.errors.slice(errors0[1])].filter((e) => !refused.test(e));
  check('the pages logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await a.close();
  await b.close();
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
