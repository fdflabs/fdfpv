/*
 * daytime-war-check.js: Lights Out's dusk into dark on the room's clock,
 * through the real shell and a rooms server of its own (never the live
 * one), with no rebuild once the room is joined (TECH-NEEDS T1.11;
 * src/share/daytime.js missionClock, src/maps/itaipu/look/index.js THE
 * RAMP).
 *
 *     SIM_GPU=1 node scripts/daytime-war-check.js      (npm run daytime:war)
 *
 * The page stands on Itaipu built at the golden hour, solo (?time=golden),
 * then joins a war room for itaipu-3 that a node host made. The host
 * starts the mission and skips (the developer's skip, edge/rooms/war.js
 * devOp) through Dusk and The Lie into Reroute, and from it into The
 * Dark. What must hold:
 *
 *   join      the room's lobby clock (golden, the night to come) rebuilds
 *             the page's world once, for both ends, though its name is
 *             the world's already
 *   reroute   the clock told moves from the stage's room ms; the world's
 *             hour follows it, the night flag turns when the sun crosses
 *             NIGHT_SIN on the room's clock (within a second), the towns'
 *             lights come up, and the world is not rebuilt
 *   the dark  the standing night clock: the world at 22:00, night, its
 *             lights on, not rebuilt; nor over the end
 *
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { PROTO, ROOM_LEVEL, WAR_JOIN } from '../src/share/roomwire.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import {
  TIME_HOUR, hourAt, isNightSun, sunSinAt,
} from '../src/share/daytime.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MISSION = 'itaipu-3';

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'itaipu', graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true, timeOfDay: 'own' });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

const LIMIT_MS = 25 * 60000;
let page = null;
let host = null;
let server = null;
setTimeout(async () => {
  console.log(`  FAIL  the check ran past its hard limit of ${LIMIT_MS / 60000} min`);
  setTimeout(() => process.exit(1), 10000).unref();
  await Promise.allSettled([page && page.close(), server && server.stop()]);
  process.exit(1);
}, LIMIT_MS).unref();

/* The world now: which scene stands (a rebuild makes another), its
 * span, the frame's daytime, the towns' lights, the room's clock. */
const NOW = `JSON.stringify((() => {
  const scene = window.__mapScene();
  const look = scene.userData.itaipu && scene.userData.itaipu.look;
  const fx = look && look.night();
  return {
    scene: scene.uuid,
    span: look ? look.span : null,
    lamps: fx ? Math.max(...fx.levels()) : 0,
    roomNow: window.__rooms().roomNow ?? null,
    war: { state: window.__war().view.state, stage: window.__war().view.stage },
    ...window.__daytime(),
  };
})())`;
const now = async () => JSON.parse(await page.evaluate(NOW));

server = await roomsServer(null, 'daytime-war', { devMissions: true });
try {
  page = await openPage({
    root, url: `/index.html?map=itaipu&time=golden&missions=dev&rooms=${encodeURIComponent(server.url)}`, width: 960, height: 540, seed,
  });
  await page.until('window.__shellReady === true', 600000);
  await page.until("window.__map && window.__map().ready && window.__map().id === 'itaipu'", 600000);
  await page.until('window.__daytime().ready', 120000);
  const solo = await now();
  check('solo at the golden hour: Itaipu built once at golden, no moving light', solo.built === 'golden' && solo.span === null, `${solo.built} ${solo.span}`);

  const made = await fetch(`${server.url}/v2/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      map: 'itaipu', friendly: false, public: false, name: null, mode: 'war', mission: MISSION,
    }),
  }).then((r) => r.json());
  host = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${made.code}`, { headers: { origin: 'https://fdflabs.github.io' } });
  await new Promise((resolve, reject) => {
    host.on('open', resolve);
    host.on('error', reject);
  });
  host.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, war: WAR_JOIN, name: [2, 2, 12],
    profile: { airframe: '7inch', map: 'itaipu', figure: 0, livery: null, parts: null, game: 'war' },
  }));
  await page.evaluate(`(window.__roomJoin(${JSON.stringify(made.code)}), true)`);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === '${made.code}'`, 60000);
  await page.until("window.__daytime().ready && window.__mapScene().userData.itaipu.look.span !== null", 600000);
  const joined = await now();
  check('joined: the lobby\'s clock (golden, the night to come) rebuilds the world for both ends',
    joined.span && joined.span.join() === 'golden,night' && joined.built === 'golden' && joined.clock && joined.clock.to === TIME_HOUR.night,
    `${joined.span} ${JSON.stringify(joined.clock)}`);
  const scene = joined.scene;

  host.send(JSON.stringify({ type: 'war', op: 'start', mission: MISSION }));
  await page.until("window.__war().view.state === 'live'", 120000);
  const skipTo = async (pred, what) => {
    host.send(JSON.stringify({ type: 'war', op: 'skip' }));
    await page.until(`(() => { const s = window.__war().view.stage; return Boolean(s) && (${pred}); })()`, 90000).catch(() => {
      throw new Error(`daytime-war-check: never reached ${what}`);
    });
  };
  await skipTo("s.id === 'lie'", 'The Lie');
  await skipTo("s.id.startsWith('reroute')", 'Reroute');
  await page.until('window.__daytime().clock && window.__daytime().clock.rate > 0', 30000);
  const r0 = await now();
  const clock = r0.clock;
  check(`Reroute (${r0.war.stage.id}): the room's clock moves from the stage's start toward the night`,
    clock.at === r0.war.stage.at && clock.hour === TIME_HOUR.golden && clock.to === TIME_HOUR.night && r0.scene === scene,
    JSON.stringify(clock));
  /* The room ms the sun crosses NIGHT_SIN on this clock. */
  let flipAt = clock.at;
  while (!isNightSun(sunSinAt(hourAt(clock, flipAt)))) {
    flipAt += 50;
  }
  await page.until('window.__daytime().night === true', 240000);
  const r1 = await now();
  check(`the night flag turns as the sun crosses NIGHT_SIN on the room's clock (${((r1.roomNow - flipAt) / 1000).toFixed(2)} s from it), the world following the clock's hour`,
    Math.abs(r1.roomNow - flipAt) < 1000 && Math.abs(r1.hour - hourAt(clock, r1.roomNow)) < 0.02 && r1.built === 'golden' && r1.scene === scene,
    `hour ${r1.hour?.toFixed(3)} at room ms ${r1.roomNow}, clock says ${hourAt(clock, r1.roomNow).toFixed(3)}`);
  await page.sleep(20000);
  const r2 = await now();
  check(`the towns' lights come up with the dusk (${r2.lamps.toFixed(2)}), no rebuild`, r2.lamps > 0.5 && r2.scene === scene && r2.ready);

  await skipTo("s.id === 'dark'", 'The Dark');
  await page.until(`window.__daytime().clock && window.__daytime().clock.rate === 0 && window.__daytime().clock.hour === ${TIME_HOUR.night}`, 30000);
  await page.sleep(3000);
  const d = await now();
  check('The Dark: the standing night, the world at 22:00, night, its lights on, not rebuilt',
    d.hour === TIME_HOUR.night && d.night === true && d.lamps === 1 && d.scene === scene && d.ready && d.built === 'golden',
    `hour ${d.hour}, night ${d.night}, lamps ${d.lamps}, built ${d.built}`);

  host.send(JSON.stringify({ type: 'war', op: 'end' }));
  await page.until("window.__war().view.state !== 'live'", 30000);
  await page.sleep(5000);
  const e = await now();
  check('over the end: the hour reached, standing, not rebuilt', e.hour === TIME_HOUR.night && e.scene === scene && e.ready, `${JSON.stringify(e.clock)}`);
  const errs = page.errors.filter((x) => !x.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  if (host) {
    host.close(1000);
  }
  if (page) {
    await page.close();
  }
  await server.stop();
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
process.exit(failed ? 1 : 0);
