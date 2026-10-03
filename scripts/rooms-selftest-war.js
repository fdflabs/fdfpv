/*
 * rooms-selftest-war.js: the war section of npm run rooms:selftest
 * (docs/WARFARE-PLAN.md sections 4 and 5.1), in its own file as combat's
 * is. rooms-selftest.js calls warSection(check) once. The referee under
 * lag, measured, is scripts/war-harness.js.
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

import {
  AGENTS_ENTRY, AGENTS_HEAD, HUNTS_ENTRY, HUNTS_HEAD, TYPE_HUNTS, FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, PROTO, PUBLIC_CAP, ROOM_GAMES, TYPE_AGENTS,
  checkProfile, decodeAgents, decodeHunts, encodeAgents, encodeHunts, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import {
  EMP_MS, GROUND_MS, MISSIONS, RESPAWN_MS, RESULT_MS, STALE_MS, WARHEADS, WORLD_LEAD_MS, parseLoadout,
} from '../edge/rooms/war.js';
import {
  BLAST_M, KIND, KINDS, LEAVE_M, cosDet, planAgent, poseAt, sinDet,
} from '../src/share/war/routes.js';
import itaipu1 from '../src/share/war/missions/itaipu-1.js';
import { WAR_AIRFRAMES, WAR_DEFAULT } from '../configs/airframes.js';
import { waveTarget } from '../src/share/war/missions/index.js';
import { contactAt } from '../src/share/war/contact.js';
import { INTRO_MS } from '../src/share/war/intro.js';
import { filmFor } from '../src/share/war/films/index.js';
import { createRoomWar } from '../src/share/roomwar.js';
import { waveStatus } from '../src/ui/warhud.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { LATE_MS } from '../src/game/midair.js';

const Y = 300;

/* A mission for one check: targets a (at the origin) and b, output 3000
 * over a floor of 1500, two airframes a pilot. */
/* A war's line in the room browser: its state, and the wave a pilot
 * joining now would meet, of how many ("In battle, wave x/y"). */
function warActivity(a, state) {
  return a.game === 'war' && a.state === state && Number.isInteger(a.wave) && a.wave >= 1 && a.waves >= a.wave;
}

function testMission(waves, routes, extra = {}) {
  return {
    id: 'test-1',
    map: 'itaipu',
    targets: { a: { mw: 1000, at: [0, Y, 0], r: 10 }, b: { mw: 1000, at: [0, Y, 600], r: 10 } },
    output: 3000,
    floorMw: 1500,
    rack: 2,
    waves,
    routes,
    ...extra,
  };
}

/* Level at Y, heading along x at v m/s (the nose, -z, turned about y). */
function level(x0, z, v) {
  const s = v >= 0 ? -Math.SQRT1_2 : Math.SQRT1_2;
  return (t) => ({
    px: x0 + v * t / 1000, py: Y, pz: z, vx: v, vy: 0, vz: 0, qx: 0, qy: s, qz: 0, qw: Math.SQRT1_2,
  });
}

/* Still at p: a quad holding a hover. */
function hover(p) {
  return () => ({
    px: p[0], py: p[1], pz: p[2], vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
  });
}

/*
 * A private room on the Itaipu map, n pilots flying paths[i](t) (room ms;
 * null sends nothing), sampled every 33 ms on a phase each, flags[i](t)
 * their flags, the room ticking every 33 ms. The mission is started by
 * the host at room ms 0 unless `start` is false.
 */
function warRoom({
  n = 2, pub = false, map = 'itaipu', mission = null, air = 'cub1400', start = true, code = 'W4RR00',
} = {}) {
  const r = new RoomCore({
    code, cap: pub ? PUBLIC_CAP : PRIVATE_CAP, friendly: false, map, epoch: 0, public: pub,
  });
  r.war.missions = { ...MISSIONS, ...(mission ? { [mission.id]: mission } : {}) };
  r.war.random = () => 0.25;
  let tokens = 0;
  const env = {
    r, socks: [], paths: [], flags: [], clock: 0, stored: null, got: [],
  };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store === 'war') {
        env.stored = JSON.parse(JSON.stringify(x.value));
      }
    }
  };
  env.join = (i, at = env.clock) => {
    const so = { name: `war${i}`, address: `10.9.9.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, at));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 20 + i], profile: { airframe: Array.isArray(air) ? air[i] : air, map, figure: 1, livery: null, parts: null },
    }), at, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
  for (let i = 0; i < n; i += 1) {
    env.join(i);
    env.paths.push(null);
    env.flags.push(() => FLAG_AIRBORNE);
  }
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  env.fly = (until) => {
    for (let t = env.clock + 1; t <= until; t += 1) {
      env.clock = t;
      for (let i = 0; i < env.socks.length; i += 1) {
        if (env.paths[i] && (t + 7 * i) % 33 === 0 && r.seats.has(env.socks[i])) {
          const p = env.paths[i](t);
          env.apply(r.message(env.socks[i], encodePose({
            wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, seq: 1, ...p, flags: env.flags[i](t), t,
          }), t));
        }
      }
      if (t % 33 === 0) {
        env.apply(r.tick(t));
      }
    }
  };
  env.of = (i, op) => env.socks[i].got.filter((m) => m && m.type === 'war' && (op ? m.op === op : m.war));
  env.view = (i = 0) => env.of(i).at(-1).war;
  env.errors = (i) => env.socks[i].got.filter((m) => m && m.type === 'war' && m.error).map((m) => m.error);
  env.refusals = (i) => env.socks[i].got.filter((m) => m && m.type === 'refused').map((m) => m.why);
  if (start && mission) {
    env.say(0, { type: 'war', op: 'start', mission: mission.id });
  }
  return env;
}

export function warSection(check) {
  console.log('war: the wire');
  {
    const list = [
      { id: 7, kind: 4, p: [-1234.5, 250.25, 9876.125], q: [0, -Math.SQRT1_2, 0, Math.SQRT1_2] },
      { id: 65535, kind: 6, p: [0, 219, -3000], q: [0, 0, 0, 1] },
    ];
    const bytes = encodeAgents(123456, list);
    const back = decodeAgents(bytes);
    check('AGENTS is 0xA0, a 6 byte head and 23 bytes an agent', bytes[0] === TYPE_AGENTS && TYPE_AGENTS === 0xA0
      && bytes.length === AGENTS_HEAD + 2 * AGENTS_ENTRY && AGENTS_HEAD === 6 && AGENTS_ENTRY === 23);
    check('it carries each id, kind, position to float32 and attitude to sixteen bits', back && back.roomMs === 123456
      && back.agents[0].id === 7 && back.agents[0].kind === 4 && back.agents[1].id === 65535
      && Math.abs(back.agents[0].p[0] + 1234.5) < 1e-3 && Math.abs(back.agents[0].q[1] + Math.SQRT1_2) < 1e-4 && back.agents[1].q[3] === 1,
    JSON.stringify(back && back.agents[0]));
    check('a wrong length is nothing', decodeAgents(bytes.subarray(0, bytes.length - 1)) === null && decodeAgents(new Uint8Array([0x20, 0, 0, 0, 0, 0])) === null);
    const hunts = encodeHunts(123456, [{ id: 7, target: 3 }, { id: 65535, target: -1 }, { id: 9, target: null }, { id: 10, target: 255 }]);
    const hb = decodeHunts(hunts);
    check('HUNTS is 0xA1, a 6 byte head and 3 bytes an agent: id and target seat, 255 none', hunts[0] === TYPE_HUNTS && TYPE_HUNTS === 0xA1
      && hunts.length === HUNTS_HEAD + 4 * HUNTS_ENTRY && HUNTS_HEAD === 6 && HUNTS_ENTRY === 3 && hb && hb.roomMs === 123456
      && JSON.stringify(hb.agents) === '[{"id":7,"target":3},{"id":65535,"target":null},{"id":9,"target":null},{"id":10,"target":null}]', JSON.stringify(hb));
    check('a client from before HUNTS reads AGENTS unchanged and takes HUNTS for nothing', decodeAgents(hunts) === null && decodeHunts(bytes) === null
      && decodeHunts(hunts.subarray(0, hunts.length - 1)) === null);
    check('war is a room game a profile can name', ROOM_GAMES.includes('war')
      && checkProfile({ airframe: 'cub1400', map: 'itaipu', figure: 0, game: 'war' }).game === 'war');
    check('the kinds are section 3\'s seven and the decoy after them, hunter at index 4', KINDS.length === 8 && KINDS[4] === 'hunter' && KINDS[7] === 'decoy'
      && KINDS.every((k) => KIND[k].speed > 0));
  }

  console.log('war: routes');
  {
    let worst = 0;
    for (let x = -40; x <= 40; x += 0.0007) {
      worst = Math.max(worst, Math.abs(sinDet(x) - Math.sin(x)), Math.abs(cosDet(x) - Math.cos(x)));
    }
    check('sinDet and cosDet agree with the engine\'s to 1e-9', worst < 1e-9, `${worst}`);
    const m = testMission([], { r: [[-3000, 300, 0], [-1500, 300, 0]] });
    /* Every kind, continuous on the millisecond and at its kind's speed. */
    const bad = [];
    for (const kind of KINDS) {
      const target = kind === 'scout' || kind === 'jammer' || kind === 'hunter' ? null : 'a';
      const plan = planAgent(m, {
        id: 1, kind, route: 'r', t0: 1000, k: 2, n: 5, err: 0, target,
      });
      const end = Number.isFinite(plan.tEnd) ? plan.tEnd : 400000;
      let prev = null;
      let step = 0;
      for (let t = 1000; t <= end; t += 1) {
        const p = poseAt(plan, t).p.slice();
        if (prev) {
          step = Math.max(step, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
        }
        prev = p;
      }
      const top = Math.max(KIND[kind].speed, KIND[kind].dive || 0) * 1.6 / 1000;
      const last = poseAt(plan, end).p;
      const arrived = plan.end !== 'arrive' || Math.hypot(last[0], last[1] - Y, last[2]) < 1e-6;
      if (step > top || !arrived) {
        bad.push(`${kind} ${plan.end} step ${step.toFixed(4)} m/ms end ${last.map((v) => v.toFixed(2)).join(',')}`);
      }
    }
    check('every kind flies its route without a jump, and one with a target ends on it', !bad.length, bad.join('; '));
    const a = planAgent(m, {
      id: 1, kind: 'fpv', route: 'r', t0: 0, k: 0, n: 6, err: 0, target: 'a',
    });
    const b = planAgent(m, {
      id: 1, kind: 'fpv', route: 'r', t0: 0, k: 0, n: 6, err: 0, target: 'a',
    });
    check('the same birth plans the same flight, to the bit', JSON.stringify(poseAt(a, 12345.5)) === JSON.stringify(poseAt(b, 12345.5)));
    const off = planAgent(m, {
      id: 1, kind: 'strike', route: 'r', t0: 0, k: 0, n: 1, err: 25, target: 'a',
    });
    const e = poseAt(off, off.tEnd).p;
    check('an error moves the aim point sideways by exactly that', Math.abs(Math.hypot(e[0], e[2]) - 25) < 1e-6, e.join(','));
    const nose = poseAt(off, 1000).q;
    check('a strike heading +x has its nose, -z, turned onto +x', Math.abs(nose[1] + Math.SQRT1_2) < 1e-9 && Math.abs(nose[3] - Math.SQRT1_2) < 1e-9, nose.join(','));
    let threw = false;
    try {
      planAgent(m, {
        id: 1, kind: 'strike', route: 'nowhere', t0: 0, k: 0, n: 1, err: 0,
      });
    } catch (x) {
      threw = true;
    }
    check('a route the mission lacks fails loudly', threw);
    /* The mission files: every wave plans, on every route its family or
     * sector may draw, as every kind it may be. */
    let ok = true;
    const unplanned = [];
    for (const m of Object.values(MISSIONS)) {
      for (const w of m.waves) {
        const routes = w.route && typeof w.route === 'object' && !Array.isArray(w.route)
          ? [w.route.sector].flat().flatMap((sec) => m.sectors[sec]) : [w.route].flat();
        for (const kind of w.mix ? w.mix.map((x) => x[0]) : [w.kind].flat()) {
          for (const route of routes) {
            try {
              planAgent(m, {
                id: 1, kind, route, t0: 0, k: 0, n: w.n, err: 0, target: waveTarget(w, 0),
              });
            } catch (x) {
              ok = false;
              unplanned.push(`${m.id} ${kind} ${route}: ${x.message}`);
            }
          }
        }
      }
    }
    const intakes = Object.keys(itaipu1.targets).filter((k) => k.startsWith('intake-'));
    check('every mission\'s every wave plans; twenty intakes of 700 MW make the plant\'s 14 000', ok && intakes.length === 20
      && intakes.reduce((s, k) => s + itaipu1.targets[k].mw, 0) === itaipu1.output && itaipu1.output === 14000, unplanned.slice(0, 3).join(' | '));
  }

  console.log('war: starting a game');
  {
    const plain = testMission([{ at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' }], { r: [[-3000, Y, 0], [-2000, Y, 0]] });
    const e = warRoom({ mission: plain, start: false });
    e.say(1, { type: 'war', op: 'start', mission: 'test-1' });
    check('only the host starts a war: another pilot is refused "host"', !e.r.war.on() && e.refusals(1).join() === 'host');
    const pub = warRoom({ mission: plain, pub: true, start: false });
    pub.say(0, { type: 'war', op: 'start', mission: 'test-1' });
    check('a public room\'s host is refused "private" (section 9)', !pub.r.war.on() && pub.refusals(0).join() === 'private');
    const swiss = warRoom({ mission: plain, map: 'swiss2', start: false });
    swiss.say(0, { type: 'war', op: 'start', mission: 'test-1' });
    check('a mission on another map than the room\'s is refused "map"', !swiss.r.war.on() && swiss.errors(0).join() === 'map');
    e.say(0, { type: 'war', op: 'start', mission: 'nope' });
    check('an unknown mission is refused "mission"', !e.r.war.on() && e.errors(0).join() === 'mission');
    const asked = e.r.message(e.socks[0], JSON.stringify({ type: 'war', op: 'start', mission: 'test-1' }), e.clock, e.socks[0].address);
    e.apply(asked);
    check('a start with nobody flying wakes the room\'s clock, which no pose will', asked.some((x) => x.tick), JSON.stringify(asked.filter((x) => !x.send)));
    const v = e.view(1);
    {
      /* The clock as edge/rooms/host.js runs it: a tick only when an
       * action asked for one, and no pose from anybody. */
      const quiet = warRoom({ mission: e.r.war.missions['test-1'], start: false, code: 'W4RQ00' });
      let due = quiet.r.message(quiet.socks[0], JSON.stringify({ type: 'war', op: 'start', mission: 'test-1' }), 0, quiet.socks[0].address).some((x) => x.tick);
      const states = [];
      for (let t = 33; t <= COUNTDOWN_MS + 2000 && due; t += 33) {
        const out = quiet.r.tick(t);
        due = out.some((x) => x.tick);
        if (states.at(-1) !== quiet.r.war.match.state) {
          states.push(quiet.r.war.match.state);
        }
      }
      check('and with nobody flying the room\'s own ticks take it from the countdown to live', states.join() === 'countdown,live', states.join() || 'never ticked');
    }
    check('the host starts it: everybody gets the countdown, the output and the floor', e.r.war.on() && v.state === 'countdown'
      && v.goAt === COUNTDOWN_MS && v.output === 3000 && v.floor === 1500 && v.blast === BLAST_M);
    check('a war game keeps the room\'s clock running with nobody flying', e.r.waiting());
    e.say(0, { type: 'tag', op: 'start', goal: 10 });
    check('one game at a time: a tag match under a war is refused "war"', !e.r.tag.on() && e.refusals(0).at(-1) === 'war');
    e.fly(COUNTDOWN_MS + 40);
    check('at the go the rack is rack x pilots', e.view().state === 'live' && e.view().rack === 4 && e.view().rackMax === 4);
    e.fly(COUNTDOWN_MS + 1000);
    const born = e.of(1, 'born');
    check('a wave is announced to everybody BIRTH_LEAD_MS ahead, with its birth', born.length === 1 && born[0].agents[0].t0 === COUNTDOWN_MS + 1000
      && born[0].agents[0].kind === 'strike' && born[0].agents[0].target === 'a', JSON.stringify(born));
    const late = e.join(2);
    check('a joiner mid game gets the view in its welcome and every attacker alive', late.got.find((m) => m.type === 'welcome').war.state === 'live'
      && e.of(2, 'born').at(-1).agents.length === 1);
    check('and is one of the match\'s players at once: its row, and its share of the rack, told to everybody', e.r.war.players(e.r).includes(3)
      && e.view(0).rack === 6 && e.view(0).rackMax === 6 && e.view(2).scores.some((x) => x.seat === 3 && !x.gone), JSON.stringify(e.view(0).scores));
    e.say(0, { type: 'war', op: 'end' });
    check('the host ends it', e.view().state === 'ended' && !e.r.war.on() && !e.r.waiting());
  }

  console.log('war: the war\'s aircraft (configs/airframes.js WAR_AIRFRAMES)');
  {
    /* The owner, 3 October: only combat drones fly in wars. A tab from
     * before the rule flying a Cub into a campaign mission. */
    const e = warRoom({ air: ['cub1400', WAR_DEFAULT], start: false, code: 'W4RCR4' });
    e.say(0, { type: 'war', op: 'start', mission: 'itaipu-drill' });
    e.paths[0] = hover([0, 400, 0]);
    e.paths[1] = hover([50, 400, 0]);
    e.fly(COUNTDOWN_MS + 4000);
    const v = e.view(1);
    check('every campaign mission names the war\'s aircraft: the seven and ten inch, the interceptor and the Striker',
      Object.values(MISSIONS).every((m) => m.aircraft === WAR_AIRFRAMES) && WAR_AIRFRAMES.join() === '7inch,10inch,interceptor,striker2500');
    check('the room refuses a Cub in a war: told "airframe" once, and not in the war\'s flying, the Striker beside it is',
      e.errors(0).filter((x) => x === 'airframe').length === 1 && e.errors(1).length === 0
      && !e.r.war.flying(e.r).some((d) => d.seat === 1) && e.r.war.flying(e.r).some((d) => d.seat === 2), JSON.stringify([e.errors(0), e.errors(1), v.state]));
    const free = warRoom({ air: 'cub1400', mission: testMission([{ at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' }], { r: [[-3000, Y, 0], [-2000, Y, 0]] }), code: 'W4RCR5' });
    free.paths[0] = hover([0, 400, 0]);
    free.fly(COUNTDOWN_MS + 2000);
    check('and a mission that names no aircraft, as these checks write theirs, lets any', free.errors(0).length === 0 && free.r.war.flying(free.r).some((d) => d.seat === 1));
  }

  console.log('war: the briefing (the intro, section 7.1)');
  {
    const plain = testMission([{ at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' }], { r: [[-3000, Y, 0], [-2000, Y, 0]] });
    const e = warRoom({ mission: plain, start: false });
    e.fly(500);
    e.say(0, {
      type: 'war', op: 'start', mission: 'test-1', intro: true,
    });
    const v = e.view(1);
    const go = 500 + INTRO_MS + COUNTDOWN_MS;
    check(`a start with the intro is a briefing of INTRO_MS (${INTRO_MS / 1000} s) before the countdown, told to everybody`,
      e.r.war.on() && v.state === 'briefing' && v.briefAt === 500 && v.goAt === go && e.view(0).goAt === go, JSON.stringify(v));
    {
      /* A mission at a time of day of its own: every screen rebuilds its
       * world as the briefing begins, so the film starts after a lead. */
      const morning = { ...plain, time: 'morning' };
      const t = warRoom({ mission: morning, start: false });
      t.fly(500);
      t.say(0, {
        type: 'war', op: 'start', mission: 'test-1', intro: true,
      });
      const tv = t.view(1);
      check(`a mission with a time of its own: a briefing at once, its film from WORLD_LEAD_MS (${WORLD_LEAD_MS / 1000} s) later, the go as much later`,
        tv.state === 'briefing' && tv.briefAt === 500 + WORLD_LEAD_MS && tv.goAt === go + WORLD_LEAD_MS, JSON.stringify(tv));
      const d = warRoom({ mission: { ...plain, time: 'day' }, start: false });
      d.fly(500);
      d.say(0, {
        type: 'war', op: 'start', mission: 'test-1', intro: true,
      });
      check('and a mission at the map\'s own day has none', d.view(1).briefAt === 500 && d.view(1).goAt === go);
    }
    check('a briefing is a war game: the clock runs, and a tag match is refused "war"', e.r.waiting()
      && (e.say(0, { type: 'tag', op: 'start', goal: 10 }), !e.r.tag.on() && e.refusals(0).at(-1) === 'war'));
    check('the room browser shows a briefing as a war counting down', warActivity(e.r.activity(e.clock), 'countdown'), JSON.stringify(e.r.activity(e.clock)));
    e.say(1, { type: 'war', op: 'skipIntro' });
    check('only the host skips it: another pilot is refused "host", and the briefing holds', e.refusals(1).at(-1) === 'host' && e.view().state === 'briefing');
    e.say(1, { type: 'war', op: 'lost' });
    check('"lost" in a briefing is refused "off"', e.errors(1).at(-1) === 'off');
    e.paths[0] = hover([0, Y, 0]);
    e.fly(500 + INTRO_MS - 40);
    check('it holds for the whole intro: no birth, no rack', e.view().state === 'briefing' && !e.of(1, 'born').length && e.view().rack === 0);
    e.fly(500 + INTRO_MS + 40);
    const cd = e.view(1);
    check('then the countdown, to the same go', cd.state === 'countdown' && cd.goAt === go && cd.briefAt === 500, JSON.stringify(cd));
    e.fly(go + 1040);
    const born = e.of(1, 'born');
    check('and the game as without one, on the go: the rack, and the first wave at its time after the go', e.view().state === 'live'
      && e.view().rack === 4 && born.length === 1 && born[0].agents[0].t0 === go + 1000, JSON.stringify(born));

    const s = warRoom({ mission: plain, start: false });
    s.say(0, {
      type: 'war', op: 'start', mission: 'test-1', intro: true,
    });
    s.fly(5000);
    /* The host's skip cuts a briefing only once every pilot here has seen
     * the film (docs/campaign/INTROS.md section 3, the owner's: a first
     * viewing is never cut). */
    const seen = { type: 'war', op: 'seen', films: { [filmFor(null).id]: filmFor(null).version } };
    s.say(0, seen);
    s.say(0, { type: 'war', op: 'skipIntro' });
    check('the host\'s skip with a pilot here who has not seen the film is refused "unwatched", and the briefing holds',
      s.errors(0).at(-1) === 'unwatched' && s.view(1).state === 'briefing' && JSON.stringify(s.view(1).seen) === JSON.stringify([1]), JSON.stringify(s.view(1).seen));
    s.say(1, { type: 'war', op: 'seen', films: { [filmFor(null).id]: filmFor(null).version - 1 } });
    s.say(0, { type: 'war', op: 'skipIntro' });
    check('and so is it when that pilot saw only an older cut of it', s.errors(0).at(-1) === 'unwatched' && s.view(1).state === 'briefing');
    s.say(1, { type: 'war', op: 'seen', films: 'all' });
    check('a seen that is not { film: version } is refused "seen"', s.errors(1).at(-1) === 'seen');
    s.say(1, seen);
    s.say(0, { type: 'war', op: 'skipIntro' });
    const k = s.view(1);
    check('the host skips it: the countdown starts now, for everybody', k.state === 'countdown' && k.goAt === 5000 + COUNTDOWN_MS
      && s.view(0).goAt === k.goAt, JSON.stringify(k));
    s.fly(6000);
    const sent = s.of(1).length;
    s.say(0, { type: 'war', op: 'skipIntro' });
    check('a skip outside a briefing does nothing: the countdown under way keeps its go', s.of(1).length === sent && s.view().goAt === 5000 + COUNTDOWN_MS);
    s.fly(5000 + COUNTDOWN_MS + 40);
    check('and goes live at it', s.view().state === 'live');
    check('the round\'s clock is the go the skip set, not the one the full briefing had', s.view().roundAt === 5000 + COUNTDOWN_MS,
      `roundAt ${s.view().roundAt}, go ${5000 + COUNTDOWN_MS}`);
    s.fly(5000 + COUNTDOWN_MS + 1040);
    const skipBorn = s.of(1, 'born');
    check('so the first wave is born at its time after that go, not an intro later', skipBorn.length === 1
      && skipBorn[0].agents[0].t0 === 5000 + COUNTDOWN_MS + 1000, JSON.stringify(skipBorn.map((b) => b.agents[0].t0)));

    const r = warRoom({ mission: plain, start: false });
    r.say(0, {
      type: 'war', op: 'start', mission: 'test-1', intro: true,
    });
    r.fly(3000);
    const again = new RoomCore(r.r.meta);
    again.war.missions = r.r.war.missions;
    again.war.restore(r.stored);
    const rv = again.war.view(again);
    check('a room that restarted in a briefing keeps it, and its go', again.war.on() && rv.state === 'briefing' && rv.briefAt === 0
      && rv.goAt === INTRO_MS + COUNTDOWN_MS);

    /* Nobody sends a pose while the film plays, and the room ticks only
     * while it is waiting() (host.js's alarm): the briefing must keep
     * it waiting, or it never reaches its countdown. */
    const q = warRoom({ mission: plain, start: false });
    q.say(0, {
      type: 'war', op: 'start', mission: 'test-1', intro: true,
    });
    const qGo = INTRO_MS + COUNTDOWN_MS;
    let idle = null;
    for (let t = q.clock + 1; t <= qGo + 40; t += 1) {
      q.clock = t;
      if (t % 33 === 0) {
        if (!q.r.waiting()) {
          idle = idle ?? t;
          continue;
        }
        q.apply(q.r.tick(t));
      }
    }
    const states = [...new Set(q.of(1).map((m) => m.war.state))];
    check('with no pose at all, the room ticks through the briefing, counts down and goes live on time', idle === null
      && states.join() === 'briefing,countdown,live' && q.view(1).goAt === qGo, `${states.join()}, idle from ${idle}, go ${q.view(1).goAt}`);

    const g = warRoom({ mission: plain, start: false });
    g.say(0, {
      type: 'war', op: 'start', mission: 'test-1', intro: true,
    });
    g.say(0, { type: 'combat', op: 'start', minutes: 3 });
    g.say(0, { type: 'track', doc: mapTrackDocument({ id: 'trk-war00001' }) });
    check('another game over a briefing is refused "war": combat, and a race\'s track', !g.r.combat.on() && g.refusals(0).join() === 'war,war'
      && g.view(1).state === 'briefing', g.refusals(0).join());

    const p = warRoom({ mission: plain, start: false });
    p.say(0, { type: 'war', op: 'start', mission: 'test-1', intro: 1 });
    check('only intro: true asks for one; a start without it counts down at once, with no briefing', p.view().state === 'countdown'
      && p.view().briefAt === null && p.view().goAt === COUNTDOWN_MS);

    /* A client built before the briefing: its roomwar reads the view and
     * treats the unknown state as no game on, as it treats any other. */
    const said = [];
    const old = createRoomWar((m) => said.push(m));
    old.onWelcome({ seat: 2, war: { state: 'lobby' } });
    let threw = null;
    try {
      old.onMessage({ type: 'war', war: v });
      old.attackersAt(v.briefAt + 1000);
    } catch (err) {
      threw = err;
    }
    check('a client that does not know "briefing" takes it without a throw, as no war on yet', !threw && !old.on() && !old.live()
      && old.view().state === 'briefing', threw ? threw.message : '');
  }

  console.log('war: detonations');
  {
    /* A strike east along z = 0 into target a; seat 1 meets it head on;
     * a second strike 4 m behind the first dies in the same blast. */
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 1.1, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-600, Y, 0]] });
    const e = warRoom({ mission: m });
    /* The strike is at -900 m at meetT, and so is seat 1, head on. */
    const meetT = COUNTDOWN_MS + 1000 + (300 / KIND.strike.speed) * 1000;
    e.paths[0] = level(-900 + 15 * meetT / 1000, 0, -15);
    e.paths[1] = level(0, 400, 0);
    e.fly(meetT + 2000);
    const booms = e.of(1, 'boom');
    const dead = e.of(1, 'dead');
    const log = e.r.war.log.filter((x) => x.what === 'boom');
    check('seat 1 meets the strike head on: a boom for seat 1, told to everybody', booms.length === 1 && booms[0].seat === 1 && e.of(0, 'boom').length === 1,
      JSON.stringify(booms));
    check('the blast kills both strikes, the one 4 m behind with it', dead.length === 1 && dead[0].ids.join() === '1,2' && dead[0].by === 1 && dead[0].why === 'boom',
      JSON.stringify(dead));
    const v = e.view(1);
    const s1 = v.scores.find((r) => r.seat === 1);
    check('two kills for seat 1, with their targets\' megawatts saved; one airframe spent, two earned', s1.kills === 2 && s1.mw === 2000 && v.rack === 5,
      JSON.stringify(v));
    check('the boom lands before the attacker reaches its bubble\'s far side: inside the head on closing', log.length === 1
      && log[0].t < meetT && meetT - log[0].t < 250, log.length ? `${meetT - log[0].t} ms before the centres meet` : 'none');
    check('the output is untouched and the game is won: every wave born and dead', v.output === 3000 && v.state === 'won' && v.why === 'waves');
    check('every attacker of the round killed, the dam untouched: the round is a win', v.roundResult === 'win' && v.roundMw === 0, JSON.stringify(v));
    check('a kill earns its pilot an airframe for the round, a multi kill one each: two for the blast that took both', v.earned[1] === 2 && v.spent[1] === 1
      && !v.earned[2], JSON.stringify({ spent: v.spent, earned: v.earned }));
    check('no mid air hit: a warhead is not a collision', !e.socks[0].got.some((x) => x && x.type === 'hit'));
    check('the match is stored', e.stored && e.stored.match.state === 'won');
  }

  {
    /* The disarmed defender: after its blast it flies on, clean, through a
     * second strike, and nothing happens until it has shown a wreck. */
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 4, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-800, Y, 0]] });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([-900, Y, 0]);
    e.paths[1] = level(0, 400, 0);
    /* Past the second strike's pass over the hover, 300 m down its route. */
    e.fly(COUNTDOWN_MS + 4000 + (300 / KIND.strike.speed) * 1000 + 2000);
    const booms = e.r.war.log.filter((x) => x.what === 'boom');
    check('a defender that went off cannot go off again while its client has not broken it', booms.length === 1, JSON.stringify(booms));
    const m2 = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 12, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-800, Y, 0]] });
    const f = warRoom({ mission: m2 });
    f.paths[0] = hover([-900, Y, 0]);
    f.paths[1] = level(0, 400, 0);
    const blast = COUNTDOWN_MS + 1000 + (300 / KIND.strike.speed) * 1000;
    f.flags[0] = (t) => (t > blast + 500 && t < blast + 3000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    f.fly(COUNTDOWN_MS + 30000);
    const fb = f.r.war.log.filter((x) => x.what === 'boom');
    const crashes = f.r.war.log.filter((x) => x.what === 'crash');
    check('its wreck is the blast\'s: no crash counted, and once clean again it goes off on the next', fb.length === 2 && crashes.length === 0
      && f.view().rack === 4 && f.view().spent[1] === 2 && f.view().earned[1] === 2, JSON.stringify(f.r.war.log));
  }

  {
    /* A crash spends one of the pilot's airframes. An empty rack is
     * never a defeat on its own: the pilot who spent them all ends the
     * round 'lost', the parked jammer (no target) is cleared, and with
     * the output whole the mission holds. */
    const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] }, { rack: 1 });
    const e = warRoom({ mission: m, n: 1 });
    e.paths[0] = hover([500, Y, 500]);
    e.flags[0] = (t) => (t > COUNTDOWN_MS + 3000 && t < COUNTDOWN_MS + 5000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(COUNTDOWN_MS + 8000);
    const v = e.view();
    check('a crash spends the pilot\'s one airframe; all spent ends the round lost, but no empty rack loses the mission', v.rack === 0 && v.spent[1] === 1
      && v.roundResult === 'lost' && v.state === 'won' && v.output === 3000
      && e.r.war.log.filter((x) => x.what === 'crash').length === 1, JSON.stringify(v));
  }

  console.log('war: rounds');
  {
    /* Two rounds, one Strike each (a, then b), two airframes a pilot.
     * Round 1: the Strike gets through, 'damaged'. After RESULT_MS round 2
     * starts with every airframe back; both pilots crash twice, so the
     * round is lost the instant the last one is spent, and its Strike gets
     * through at once, which puts the output under the floor. */
    const r = [[-1200, Y, 0], [-600, Y, 0]];
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { round: 1, at: 1, kind: 'strike', n: 1, route: 'r2', target: 'b' },
    ], { r, r2: [[-1200, Y, 600], [-600, Y, 600]] });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([900, Y, -900]);
    e.paths[1] = hover([900, Y, -920]);
    const land = COUNTDOWN_MS + 1000 + ((600 + 600) / KIND.strike.speed) * 1000;
    e.fly(Math.ceil(land) + 500);
    const v1 = e.view();
    check('a view names the round, its state and result, the MW it cost, the next round, each pilot\'s spent airframes', v1.round === 1 && v1.rounds === 2
      && v1.roundState === 'result' && v1.roundResult === 'damaged' && v1.roundMw === 1000 && v1.airframes === 2 && typeof v1.spent === 'object'
      && v1.nextRoundAt >= land + RESULT_MS && v1.nextRoundAt <= land + RESULT_MS + 500 && v1.state === 'live' && v1.output === 2000, JSON.stringify(v1));
    e.fly(v1.nextRoundAt - 100);
    check('the result holds until nextRoundAt: nothing of round 2 is born', e.view().round === 1 && e.view().alive === 0);
    const r2 = v1.nextRoundAt;
    e.flags[0] = (t) => ((t > r2 + 2000 && t < r2 + 3000) || (t > r2 + 5000 && t < r2 + 6000) ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.flags[1] = (t) => ((t > r2 + 2500 && t < r2 + 3500) || (t > r2 + 7000 && t < r2 + 8000) ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(r2 + 1500);
    const v2 = e.view();
    check('round 2 starts at nextRoundAt with every pilot\'s airframes back to the base, nothing earned', v2.round === 2 && v2.roundState === 'live' && v2.roundResult === null
      && Object.keys(v2.spent).length === 0 && Object.keys(v2.earned).length === 0 && v2.rack === 4 && v2.alive === 1, JSON.stringify(v2));
    e.fly(r2 + 6500);
    const v3 = e.view();
    check('each pilot spends its own: three crashes, one pilot out, the round still on', v3.spent[1] === 2 && v3.spent[2] === 1 && v3.rack === 1
      && v3.roundState === 'live', JSON.stringify(v3.spent));
    e.fly(r2 + 9000);
    const v4 = e.view();
    const through = e.of(1, 'dead').filter((d) => d.why === 'arrive' && d.target === 'b');
    check('every pilot spent: the round is lost, its Strike gets through at once, and under the floor the mission is lost', v4.roundResult === 'lost'
      && through.length === 1 && through[0].hit && v4.state === 'lost' && v4.why === 'output' && v4.output === 1000, JSON.stringify(v4));
  }
  {
    /* One airframe a pilot: seat 1 crashes it, then hovers on the
     * Strike's path, clean again. Spent, it cannot go off: the Strike
     * flies through it and hits a, a round the dam lost MW in. The last
     * round over with the output at the floor or more, the mission holds. */
    const m = testMission([{ at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' }], { r: [[-1200, Y, 0], [-600, Y, 0]] }, { rack: 1 });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([-900, Y, 0]);
    e.paths[1] = hover([900, Y, -900]);
    e.flags[0] = (t) => (t > COUNTDOWN_MS + 1000 && t < COUNTDOWN_MS + 2000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(COUNTDOWN_MS + 1000 + ((600 + 600) / KIND.strike.speed) * 1000 + 500);
    const v = e.view();
    check('a pilot who spent all its airframes cannot go off: the Strike flies through it', !e.r.war.log.some((x) => x.what === 'boom') && v.spent[1] === 1,
      JSON.stringify(e.r.war.log));
    check('the last round over, damaged, with the output at or over the floor: the mission holds', v.roundResult === 'damaged' && v.state === 'won'
      && v.output === 2000, JSON.stringify(v));
  }

  {
    /* One airframe a pilot, and a Strike seat 1 meets head on: the kill
     * earns it one back, so having spent its one it is not out, and can
     * go off again on the second Strike 4 s behind. */
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 8, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-600, Y, 0]] }, { rack: 1 });
    const e = warRoom({ mission: m });
    const meetT = COUNTDOWN_MS + 1000 + (300 / KIND.strike.speed) * 1000;
    e.paths[0] = level(-900 + 15 * meetT / 1000, 0, -15);
    e.paths[1] = hover([900, Y, -900]);
    /* Its client breaks the craft on the boom, and it is back, clean,
     * where the second Strike will pass, 300 m on from its birth. */
    e.flags[0] = (t) => (t > meetT + 200 && t < meetT + 1200 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(meetT + 1500);
    const v1 = e.view();
    check('a pilot who spent its one airframe on a kill has earned one: not spectating', v1.spent[1] === 1 && v1.earned[1] === 1 && v1.rack >= 1
      && e.r.war.stillFlying(1, e.r.roomMs(e.clock)), JSON.stringify({ spent: v1.spent, earned: v1.earned }));
    const meet2 = COUNTDOWN_MS + 8000 + (300 / KIND.strike.speed) * 1000;
    e.paths[0] = level(-900 + 15 * meet2 / 1000, 0, -15);
    e.fly(meet2 + 1500);
    check('and it goes off again on the next with the airframe it earned', e.r.war.log.filter((x) => x.what === 'boom' && x.seat === 1).length === 2,
      JSON.stringify(e.r.war.log));
  }

  console.log('war: loadouts, warheads, decoys, results (act 1)');
  {
    const L = (x) => parseLoadout(x);
    check('a loadout clamps its rack to 4..6 (rounded) and its speedMul to 1..1.15',
      L({ rack: 9 }).rack === 6 && L({ rack: 2 }).rack === 4 && L({ rack: 4.6 }).rack === 5 && L({ speedMul: 2 }).speedMul === 1.15
      && L({ speedMul: 0.5 }).speedMul === 1 && L({}).rack === 4 && L({}).warhead === 'standard' && L({}).speedMul === 1);
    check('and refuses anything else: an unknown warhead, a rack or speedMul not a number, no object',
      L({ warhead: 'nuke' }) === null && L({ rack: '6' }) === null && L({ speedMul: NaN }) === null && L(null) === null && L([4]) === null
      && WARHEADS.every((w) => L({ warhead: w }).warhead === w));
    const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] }, { rack: 4 });
    const e = warRoom({ mission: m, start: false });
    e.say(1, { type: 'war', op: 'loadout', loadout: { rack: 6, warhead: 'wide', speedMul: 1.1 } });
    e.say(1, { type: 'war', op: 'loadout', loadout: { warhead: 'laser' } });
    check('a refused loadout is told "loadout" and changes nothing', e.errors(1).at(-1) === 'loadout');
    e.say(0, {
      type: 'war', op: 'start', mission: m.id, loadout: { rack: 5, warhead: 'emp' },
    });
    e.paths[0] = hover([900, Y, -900]);
    e.paths[1] = hover([900, Y, -950]);
    e.fly(COUNTDOWN_MS + 500);
    const v = e.view();
    check('the view echoes each seat\'s loadout, the host\'s from its start; a seat\'s rack is its airframes a round', v.loadouts[1].rack === 5
      && v.loadouts[1].warhead === 'emp' && v.loadouts[2].rack === 6 && v.loadouts[2].warhead === 'wide' && v.loadouts[2].speedMul === 1.1
      && v.rackMax === 11 && e.r.war.allowance(2) === 6, JSON.stringify(v.loadouts));
    e.say(1, { type: 'war', op: 'loadout', loadout: { rack: 4 } });
    check('a loadout is refused "live" once the war is on', e.errors(1).at(-1) === 'live' && e.view().loadouts[2].rack === 6);
  }
  /* A Strike east along z = 0 met head on by seat 1, and a second 4 m
   * (or 20 m) behind it; seat 1's warhead as given, its path `side` m
   * off the Strikes' line. */
  const headOn = (warhead, { side = 0, behind = 0.15, until = 2000 } = {}) => {
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 1 + behind, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-600, Y, 0]] });
    const e = warRoom({ mission: m, start: false });
    e.say(0, { type: 'war', op: 'loadout', loadout: { warhead } });
    e.say(0, { type: 'war', op: 'start', mission: m.id });
    const meetT = COUNTDOWN_MS + 1000 + (300 / KIND.strike.speed) * 1000;
    e.paths[0] = level(-900 + 15 * meetT / 1000, side, -15);
    e.paths[1] = hover([900, Y, -900]);
    e.fly(meetT + until);
    return { e, meetT, m };
  };
  {
    const std = headOn('standard', { side: 7.5 });
    const wide = headOn('wide', { side: 7.5 });
    check('a standard warhead passing 7.5 m off does not go off; a wide one (9 m) does, and takes both Strikes',
      !std.e.r.war.log.some((x) => x.what === 'boom') && wide.e.of(1, 'dead').some((d) => d.why === 'boom' && d.ids.join() === '1,2'),
      JSON.stringify(wide.e.r.war.log.filter((x) => x.what === 'boom')));
  }
  {
    const { e } = headOn('penetrator');
    const dead = e.of(1, 'dead');
    const v = e.view();
    check('a penetrator takes the first Strike without ending the flight (no boom, nothing spent), then goes off on the second',
      dead.length === 2 && dead[0].why === 'pierce' && dead[0].ids.join() === '1' && dead[1].why === 'boom' && dead[1].ids.join() === '2'
      && e.of(1, 'boom').length === 1 && v.spent[1] === 1 && v.earned[1] === 2, JSON.stringify(dead.map((d) => [d.why, d.ids])));
  }
  {
    const { e, meetT, m } = headOn('emp', { behind: 0.75, until: 800 });
    const stall = e.of(1, 'stall');
    const x = e.r.war.live.get(2);
    const tc = stall.length ? stall[0].at : 0;
    const a = x ? poseAt(x.plan, tc + 500).p : null;
    const b = x ? poseAt(x.plan, tc + 3500).p : null;
    const plain = planAgent(m, { ...x.a, stalls: undefined });
    check(`an EMP goes off as a standard warhead and stalls the Strike 20 m behind for ${EMP_MS} ms: told as 'stall', held still, its arrival ${EMP_MS} ms later`,
      stall.length === 1 && stall[0].ids.join() === '2' && stall[0].ms === EMP_MS && e.view().disabled[2] === tc + EMP_MS
      && e.of(1, 'dead')[0].ids.join() === '1' && a && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9
      && Math.abs(x.plan.tEnd - plain.tEnd - EMP_MS) < 1e-6, JSON.stringify({ stall, meetT }));
  }
  {
    /* A decoy: worth nothing where it arrives, nothing saved when killed. */
    const m = testMission([{ at: 1, kind: 'decoy', n: 1, route: 'r', target: 'a' }], { r: [[-1200, Y, 0], [-600, Y, 0]] });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([900, Y, -900]);
    e.paths[1] = hover([900, Y, -950]);
    e.fly(COUNTDOWN_MS + 1000 + (1200 / KIND.decoy.speed) * 1000 + 500);
    const at = e.of(1, 'dead').find((d) => d.why === 'arrive');
    const v = e.view();
    check('a decoy flies as a Striker and arrives worth nothing: no hit, the output whole, the round a win', at && at.hit === false
      && v.output === 3000 && v.roundResult === 'win', JSON.stringify(at));
    const k = headOn('standard');
    check('the stars: held, no losses, the output: three on a clean win, credits 100 a star and 10 a kill', k.e.view().result
      && k.e.view().result.won && k.e.view().result.stars === 3 && k.e.view().result.credits === 320
      && k.e.view().result.criteria.map((c) => `${c.id}:${c.met}`).join() === 'held:true,noLosses:true,output:true', JSON.stringify(k.e.view().result));
    check('no result while the mission is on', e.view().result && headOn('standard', { until: -1500 }).e.view().result === null);
    check('itaipu-4 is the drill (mission 1 as it was) at night; the others are not', MISSIONS['itaipu-4'].night === true && !MISSIONS['itaipu-1'].night
      && !MISSIONS['itaipu-drill'].night && MISSIONS['itaipu-4'].waves === MISSIONS['itaipu-drill'].waves);
    const n = warRoom({ mission: MISSIONS['itaipu-4'] });
    check('the night raid counts down prepMs longer, so every screen has built its night before the go',
      MISSIONS['itaipu-4'].prepMs >= 10000 && n.view().state === 'countdown' && n.view().goAt === COUNTDOWN_MS + MISSIONS['itaipu-4'].prepMs,
      JSON.stringify({ goAt: n.view().goAt }));
  }
  {
    /* One airframe a pilot. Seat 1 kills a Strike head on (spent 1,
     * earned 1: two this round), is back, and crashes its second; seat 2
     * crashed its one before. A jammer holds the round, so it ends only on
     * every pilot being out: the instant seat 1's second is spent. */
    const m = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 1, kind: 'jammer', n: 1, route: 'j' },
    ], { r: [[-1200, Y, 0], [-600, Y, 0]], j: [[-1200, Y, 900], [-1100, Y, 900]] }, { rack: 1 });
    const e = warRoom({ mission: m });
    const meetT = COUNTDOWN_MS + 1000 + (300 / KIND.strike.speed) * 1000;
    const T = meetT + 6000;
    e.paths[0] = level(-900 + 15 * meetT / 1000, 0, -15);
    e.paths[1] = hover([900, Y, -900]);
    e.flags[0] = (t) => ((t > meetT + 200 && t < meetT + 1200) || t > T ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.flags[1] = (t) => (t > COUNTDOWN_MS + 3000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(T + LATE_MS + 200);
    const v = e.view();
    const end = e.r.war.log.find((x) => x.what === 'round');
    check('a pilot who earned an airframe spends it too: spent 2 of its 1 + 1, spectating, and the round ends as it is spent',
      v.spent[1] === 2 && v.earned[1] === 1 && e.r.war.spentOut(1) && end && end.result === 'lost' && end.t - T <= LATE_MS + 100,
      JSON.stringify({ spent: v.spent, earned: v.earned, end }));
  }

  console.log('war: a round never waits on a pilot who is not flying');
  {
    /* One airframe a pilot and a jammer parked for good, so the round
     * ends only when no pilot is flying: seat 1 wrecks its one at T0
     * (spent, spectating, still sending clean poses as a camera would),
     * and seat 2 stops flying its one from T in each way below. Each
     * must end the round within its bound. */
    const T0 = COUNTDOWN_MS + 6000;
    const T = COUNTDOWN_MS + 9000;
    const stall = (name, bound, how, rack = 1) => {
      const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] }, { rack });
      const e = warRoom({ mission: m });
      e.paths[0] = hover([900, Y, -900]);
      e.paths[1] = hover([900, Y, -950]);
      e.flags[0] = (t) => (t > T0 && t < T0 + 500 ? FLAG_CRASHED : FLAG_AIRBORNE);
      how(e);
      e.fly(T + bound + 1000);
      const end = e.r.war.log.find((x) => x.what === 'round');
      check(`${name}: the round ends within ${bound} ms`, end && end.result === 'lost' && end.t - T <= bound && e.view().roundState === 'result',
        end ? `ended ${end.t - T} ms after` : `still ${e.view().roundState}, spent ${JSON.stringify(e.view().spent)}`);
      return e;
    };
    stall('the last pilot wrecks its last airframe', LATE_MS + 100, (e) => {
      e.flags[1] = (t) => (t > T ? FLAG_CRASHED : FLAG_AIRBORNE);
    });
    stall('the last pilot sits on the ground with it', GROUND_MS + LATE_MS + 100, (e) => {
      e.flags[1] = (t) => (t > T ? 0 : FLAG_AIRBORNE);
    });
    stall('the last pilot leaves the room', 100, (e) => {
      const fly = e.fly;
      e.fly = (until) => {
        fly(T);
        e.apply(e.r.close(e.socks[1], e.clock));
        e.paths[1] = null;
        fly(until);
      };
    });
    stall('the last pilot goes silent (a menu, a pause, a dropped link)', STALE_MS + 100, (e) => {
      const p = e.paths[1];
      e.paths[1] = (t) => (t > T ? null : p(t));
      const fly = e.fly;
      e.fly = (until) => {
        fly(T);
        e.paths[1] = null;
        fly(until);
      };
    });
    stall('the last pilot, its one of two lost, never takes off again', RESPAWN_MS + 100, (e) => {
      e.flags[0] = (t) => ((t > T0 && t < T0 + 500) || (t > T0 + 1000 && t < T0 + 1500) ? FLAG_CRASHED : FLAG_AIRBORNE);
      e.flags[1] = (t) => (t > T ? FLAG_CRASHED : FLAG_AIRBORNE);
    }, 2);
  }

  console.log('war: a lost link');
  {
    const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] });
    const e = warRoom({ mission: m, start: false });
    e.paths[0] = hover([500, Y, 500]);
    e.paths[1] = hover([520, Y, 500]);
    e.fly(200);
    e.say(1, { type: 'war', op: 'lost' });
    check('"lost" outside a war is refused "off"', e.errors(1).join() === 'off');
    e.say(0, { type: 'war', op: 'start', mission: 'test-1' });
    check('the room browser\'s activity says a war is counting down', warActivity(e.r.activity(e.clock), 'countdown'), JSON.stringify(e.r.activity(e.clock)));
    e.say(1, { type: 'war', op: 'lost' });
    check('and during the countdown too, before there is a rack', e.errors(1).join() === 'off,off');
    /* Seat 2 is spawning from 7 s to 8 s: a respawn, as its client flags it. */
    e.flags[1] = (t) => (t >= 7000 && t < 8000 ? FLAG_AIRBORNE | FLAG_SPAWNING : FLAG_AIRBORNE);
    e.fly(7500);
    check('and "on" once it is live', warActivity(e.r.activity(e.clock), 'on'), JSON.stringify(e.r.activity(e.clock)));
    e.say(1, { type: 'war', op: 'lost' });
    check('"lost" while spawning is refused "spawning", and takes nothing', e.errors(1).at(-1) === 'spawning' && e.view().rack === 4);
    e.fly(8500);
    e.say(1, { type: 'war', op: 'lost' });
    const after = e.view().rack;
    e.say(1, { type: 'war', op: 'lost' });
    check('a pilot\'s own lost airframe takes one off the rack, once however often it says so', after === 3 && e.view().rack === 3
      && e.r.war.log.filter((x) => x.what === 'lost').length === 1, `${after} then ${e.view().rack}`);
    /* Its wreck follows (8.8 s to 9.5 s), then it is clean again. */
    e.flags[1] = (t) => (t >= 8800 && t < 9500 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(10500);
    check('its wreck is the loss\'s, not another crash', e.view().rack === 3 && !e.r.war.log.some((x) => x.what === 'crash'), JSON.stringify(e.r.war.log));
    e.say(1, { type: 'war', op: 'lost' });
    check('the next airframe, clean again, can be lost in its turn', e.view().rack === 2);
    e.flags[0] = (t) => (t >= 11000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(11500);
    e.say(0, { type: 'war', op: 'lost' });
    check('a wreck is refused "wreck": its crash already took it', e.errors(0).at(-1) === 'wreck' && e.view().rack === 1, JSON.stringify(e.view()));
  }

  console.log('war: output');
  {
    /* Two strikes on a, one on b: a's 1000 is taken once, b's then puts
     * the output under the floor. */
    const m = testMission([
      { at: 1, kind: 'strike', n: 2, route: 'r', target: 'a' },
      { at: 20, kind: 'strike', n: 1, route: 'r2', target: 'b' },
    ], { r: [[-800, Y, 0], [-400, Y, 0]], r2: [[-800, Y, 600], [-400, Y, 600]] });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([500, Y, -500]);
    e.paths[1] = hover([500, Y, -520]);
    e.fly(COUNTDOWN_MS + 1000 + (800 / KIND.strike.speed) * 1000 + 200);
    const v = e.view();
    const arrive = e.of(1, 'dead').filter((d) => d.why === 'arrive');
    check('an attacker alive at its target takes the target\'s megawatts once', arrive.length === 2 && arrive.every((d) => d.hit && d.target === 'a')
      && v.output === 2000 && v.down.join() === 'a', JSON.stringify(v));
    /* Past b's strike at its target: 400 m of route and on to b. */
    e.fly(COUNTDOWN_MS + 20000 + ((400 + Math.hypot(400, 600)) / KIND.strike.speed) * 1000 + 500);
    check('under floorMw the game is lost, the instant it is', e.view().state === 'lost' && e.view().why === 'output' && e.view().output === 1000);
  }

  console.log('war: the switchyard');
  {
    /* Mission 1's yard and its Strikers' route: the yard's r (537 m) is
     * its extent for the smoke and markers, never where an attacker
     * arrives. One 300 m from the yard's middle has not arrived; it does
     * where it first meets the yard's equipment (contact.js), short of
     * its route's end, goes off there and hits within the yard's hitR. */
    const yard = itaipu1.targets['yard-right'];
    const m = testMission([{ at: 1, kind: 'strike', n: 1, route: 'w', target: 'yard' }], { w: itaipu1.routes['reservoir-west'] },
      { targets: { yard }, output: 14000, floorMw: 7000 });
    const agent = {
      id: 1, kind: 'strike', route: 'w', t0: COUNTDOWN_MS + 1000, k: 0, n: 1, err: 0, target: 'yard',
    };
    const plan = planAgent(m, agent);
    let t300 = plan.t0;
    while (Math.hypot(...poseAt(plan, t300).p.map((v, i) => v - yard.at[i])) > 300) {
      t300 += 10;
    }
    const e = warRoom({ mission: m });
    e.paths[0] = hover([3000, 400, 3000]);
    e.paths[1] = hover([3000, 400, 3020]);
    e.fly(t300 + 1000);
    const early = e.of(1, 'dead');
    check(`an attacker 300 m from the yard's middle, inside its r of ${yard.r} m, has not arrived`,
      yard.r > 300 && yard.hitR < 300 && early.length === 0 && e.view().output === 14000 && plan.tEnd - t300 > 5000,
      `${early.length} dead, output ${e.view().output}, ${((plan.tEnd - t300) / 1000).toFixed(1)} s of its run still to fly`);
    e.fly(Math.ceil(plan.tEnd) + 1000);
    const at = e.of(1, 'dead').filter((d) => d.why === 'arrive');
    const met = contactAt(m.map, plan);
    const cut = met ? planAgent(m, { ...agent, meet: met.t }) : null;
    const there = cut ? poseAt(cut, cut.tEnd).p : null;
    check('it arrives where it first meets the yard\'s equipment, short of its route\'s end, and takes its megawatts',
      Boolean(met) && met.target === 'yard-right' && met.t < plan.tEnd - 100 && at.length === 1 && at[0].hit && at[0].at === met.t
      && at[0].p.every((v, i) => Math.abs(v - there[i]) < 2e-3) && e.view().output === 14000 - yard.mw,
      `${JSON.stringify(at)}, met ${JSON.stringify(met)}, ${met ? ((plan.tEnd - met.t) / 1000).toFixed(2) : '-'} s short`);
  }

  console.log('war: scouts');
  {
    const waves = [
      { at: 1, kind: 'scout', n: 1, route: 's' },
      { at: 60, kind: 'strike', n: 2, route: 'r', target: 'a', spread: 50 },
    ];
    const routes = { s: [[-900, Y, 300], [-300, Y, 300]], r: [[-900, Y, 0], [-500, Y, 0]] };
    const alive = warRoom({ mission: testMission(waves, routes) });
    alive.paths[0] = hover([900, Y, 900]);
    alive.fly(COUNTDOWN_MS + 60000);
    const bornA = alive.of(0, 'born').flatMap((b) => b.agents).filter((a) => a.kind === 'strike');
    check('while the scout lives, the next wave flies its routes exactly', bornA.length === 2 && bornA.every((a) => a.err === 0), JSON.stringify(bornA));
    const dead = warRoom({ mission: testMission(waves, routes) });
    dead.paths[0] = hover([-600, Y, 300]);
    dead.fly(COUNTDOWN_MS + 60000);
    const bornD = dead.of(0, 'born').flatMap((b) => b.agents).filter((a) => a.kind === 'strike');
    check('once every scout is dead, each attacker draws a seeded error within the spread', dead.r.war.log.some((x) => x.what === 'boom')
      && bornD.length === 2 && bornD.every((a) => a.err !== 0 && Math.abs(a.err) <= 50) && bornD[0].err !== bornD[1].err, JSON.stringify(bornD));
    const said = dead.of(0, 'dead').filter((d) => d.scouts === true);
    const quiet = alive.of(0, 'dead').filter((d) => d.scouts === true);
    check('the boom that kills a scout wave\'s last says so, once (scouts: true), and nothing else does', said.length === 1 && said[0].why === 'boom'
      && dead.of(0, 'dead').filter((d) => 'scouts' in d).length === 1 && quiet.length === 0, JSON.stringify(said));
    /* Its 600 m of route, its circle, then LEAVE_M: gone, and 10 s on. */
    const goneS = 1 + 600 / KIND.scout.speed + KIND.scout.orbitMs / 1000 + LEAVE_M / KIND.scout.speed;
    const lateAt = Math.ceil(goneS) + 10;
    const late = [{ at: 1, kind: 'scout', n: 1, route: 's' }, { at: lateAt, kind: 'strike', n: 2, route: 'r', target: 'a', spread: 50 }];
    const away = warRoom({ mission: testMission(late, routes) });
    away.paths[0] = hover([900, Y, 900]);
    away.fly(COUNTDOWN_MS + lateAt * 1000);
    const bornL = away.of(0, 'born').flatMap((b) => b.agents).filter((a) => a.kind === 'strike');
    const left = away.of(0, 'dead').filter((d) => d.why === 'leave');
    check('a scout that got away is not dead: no scouts down, and the next wave flies its routes exactly', left.length === 1
      && !away.of(0, 'dead').some((d) => d.scouts) && bornL.length === 2 && bornL.every((a) => a.err === 0), `${left.length} left, ${JSON.stringify(bornL)}`);
  }

  console.log('war: hunters');
  {
    const m = testMission([{ at: 1, kind: 'hunter', n: 1, route: 'h' }], { h: [[400, Y, 0]] });
    const e = warRoom({ mission: m, air: 'interceptor' });
    e.paths[0] = hover([0, Y, 0]);
    e.paths[1] = hover([0, Y, 3000]);
    e.fly(COUNTDOWN_MS + 3000);
    const bin = e.socks[0].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_AGENTS).map(decodeAgents);
    const near = bin.filter((b) => b.agents.length).length;
    const far = e.socks[1].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_AGENTS).length;
    check('the room sends a hunter\'s poses, as AGENTS, closing on the nearest pilot (400 m off: the 5 Hz band)', near >= 9 && bin.at(-1).agents[0].kind === KINDS.indexOf('hunter')
      && bin.at(-1).agents[0].p[0] < 400 - KIND.hunter.speed, `${near} messages, last at x ${bin.length ? bin.at(-1).agents[0].p[0].toFixed(1) : '-'}`);
    check('thinned by distance: the pilot 3 km off gets them at the far band\'s rate', far > 0 && far < near / 4, `${far} against ${near}`);
    const hunts0 = e.socks[0].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_HUNTS).map(decodeHunts);
    const hunts1 = e.socks[1].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_HUNTS).map(decodeHunts);
    check('every AGENTS comes with a HUNTS for the same hunters at the same ms, naming the seat it chases (1, the near pilot)', hunts0.length === bin.length
      && hunts0.every((h, i) => h.roomMs === bin[i].roomMs && h.agents.map((a) => a.id).join() === bin[i].agents.map((a) => a.id).join())
      && hunts0.at(-1).agents[0].target === 1 && hunts1.length === far && hunts1.at(-1).agents[0].target === 1,
    `${hunts0.length} HUNTS against ${bin.length} AGENTS, target ${hunts0.length ? hunts0.at(-1).agents[0].target : '-'}`);
    e.fly(COUNTDOWN_MS + 1000 + (400 / KIND.hunter.speed) * 1000 + 4000);
    const booms = e.r.war.log.filter((x) => x.what === 'boom');
    check('a hunter that reaches a pilot takes it and itself', booms.length === 1 && booms[0].seat === 1 && e.view().state === 'won', JSON.stringify(e.r.war.log));
  }

  console.log('war: across a restart');
  {
    const m = testMission([
      { at: 1, kind: 'strike', n: 3, route: 'r', target: 'a' },
      { at: 40, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-2000, Y, 0], [-1500, Y, 0]] });
    const e = warRoom({ mission: m });
    e.paths[0] = hover([900, Y, 900]);
    e.fly(COUNTDOWN_MS + 5000);
    const saved = e.stored;
    const again = new RoomCore(e.r.meta);
    again.war.missions = e.r.war.missions;
    again.war.restore(saved);
    const empty = again.war.view(again);
    /* The rack is the pilots' here: none until they are back, by token. */
    for (const i of [0, 1]) {
      const so = { name: `back${i}`, address: `10.9.8.${i + 1}`, got: [] };
      again.open(so, e.clock);
      again.message(so, JSON.stringify({
        type: 'hello', proto: PROTO, build: 't', token: e.socks[i].got.find((x) => x.type === 'welcome').token, seat: i + 1, name: [i, i, 20 + i], profile: { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: null },
      }), e.clock, so.address, () => 'f'.repeat(32));
    }
    const v = again.war.view(again);
    check('a room that restarted keeps its war: state, attackers alive, the rack (its pilots\', once they are back)', again.war.on() && v.alive === 3 && empty.rack === 0 && v.rack === 4
      && Object.keys(again.war.match.players).join() === '1,2' && again.war.live.size === 3 && [...again.war.live.values()].every((x) => x.plan.end === 'arrive'), `${empty.rack} then ${v.rack}`);
  }

  console.log('war: leaving');
  {
    const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] });
    const e = warRoom({ mission: m, n: 3 });
    e.paths = [hover([0, Y, 0]), hover([50, Y, 0]), hover([90, Y, 0])];
    e.fly(COUNTDOWN_MS + 500);
    check('every flying pilot has samples in the war', [1, 2, 3].every((s) => e.r.war.seats.has(s)));
    e.apply(e.r.close(e.socks[1], e.clock));
    e.apply(e.r.safety.remove(e.socks[2], e.clock));
    check('a pilot who left, and one removed by the room\'s safety, are gone from it (safety.js calls the games\' leave)',
      !e.r.war.seats.has(2) && !e.r.war.seats.has(3) && !e.r.combat.seats.has(3) && e.r.war.seats.has(1));
  }

  console.log('war: the HUD always says what comes next');
  {
    /*
     * The campaign as the owner flew it on 2026-10-01: mission 1 in a room
     * of its own, then mission 2 in another, each that room's war 1. The
     * shell keyed its once per war work (the intro, the begin) on the id
     * alone, took mission 2 for mission 1, played no intro, and left the
     * pilot in a briefing with the HUD up and no word of what came next.
     * Here one roomwar client is carried from the first room to the
     * second, as the shell's is, and the HUD's line (warhud waveStatus)
     * is read off it four times a second, through mission 2 to its end,
     * once with the whole intro and once with the host skipping it.
     */
    const feed = (c, so, from) => {
      for (const m of so.got.slice(from)) {
        if (m && m.type === 'welcome') {
          c.onWelcome(m);
        } else if (m && m.type === 'war') {
          c.onMessage(m);
        }
      }
      return so.got.length;
    };
    /* On, for the HUD: roomwar's on() leaves the briefing out. */
    const ON = new Set(['briefing', 'countdown', 'live']);
    for (const skip of [false, true]) {
      const c = createRoomWar(() => {});
      const one = warRoom({ n: 1, start: false, code: 'M1SS10', air: WAR_DEFAULT });
      one.say(0, {
        type: 'war', op: 'start', mission: 'itaipu-1', intro: true,
      });
      one.fly(3000);
      one.say(0, { type: 'war', op: 'end' });
      feed(c, one.socks[0], 0);
      const first = c.match();
      c.clear();
      const two = warRoom({ n: 1, start: false, code: 'M1SS20', air: WAR_DEFAULT });
      two.paths[0] = hover([0, 400, 0]);
      two.say(0, {
        type: 'war', op: 'start', mission: 'itaipu-2', intro: true,
      });
      let read = feed(c, two.socks[0], 0);
      const label = skip ? 'mission 2, the host skipping the intro' : 'mission 2, the whole intro';
      check(`${label}: the same war id as mission 1's room, and still another war to the shell`, c.view().id === 1 && first === 'M1SS10:1'
        && c.match() === 'M1SS20:1', `${first} then ${c.match()}`);
      if (skip) {
        two.fly(4000);
        two.say(0, { type: 'war', op: 'seen', films: { [filmFor(null).id]: filmFor(null).version } });
        two.say(0, { type: 'war', op: 'skipIntro' });
      }
      const blank = [];
      const states = new Set();
      /* NEXT WAVE IN's seconds, by the wave it counts to. */
      const clocks = new Map();
      let t = two.clock;
      while (t < 20 * 60 * 1000) {
        t += 250;
        two.fly(t);
        read = feed(c, two.socks[0], read);
        const v = c.view();
        if (!ON.has(v.state)) {
          break;
        }
        states.add(v.roundState === 'result' ? 'result' : v.state);
        const next = waveStatus(v, c.mission(), t);
        if (!next || !next.text) {
          blank.push(`${t} ${v.state}/${v.roundState} wave ${v.wave}`);
        } else if (/^NEXT WAVE IN /.test(next.text)) {
          const key = `round ${v.round} wave ${v.wave}`;
          clocks.set(key, [...(clocks.get(key) ?? []), next.s]);
        }
      }
      check(`${label}: it went through the briefing (unless skipped), countdown, live and a round's result, and ended`,
        [...(skip ? [] : ['briefing']), 'countdown', 'live', 'result'].every((x) => states.has(x)) && !ON.has(c.view().state),
        `${[...states].join()} then ${c.view().state}`);
      check(`${label}: the HUD said what comes next at every read while the war was on`, blank.length === 0, blank.slice(0, 3).join(' | '));
      /* Round 1's waves are all announced at the go (BIRTH_LEAD_MS), so
       * the first clock is round 2's strike at 30 s. */
      const runs = [...clocks.values()];
      check(`${label}: NEXT WAVE IN counted down to each wave it named, round 2's 30 s strike among them`,
        clocks.has('round 2 wave 3') && runs.every((x) => x.length >= 2 && x[0] > x.at(-1) && x.every((y, i) => i === 0 || y <= x[i - 1])),
        [...clocks].map(([k, x]) => `${k}: ${x[0]}..${x.at(-1)}`).join(', '));
    }

    /* Every view a war can show, and the ones it should not but might: a
     * room from before roundAt in round 2, a mission this build lacks. */
    const m2 = MISSIONS['itaipu-2'];
    const base = {
      state: 'live', goAt: 10000, round: 1, roundState: 'live', roundAt: 10000, wave: 0, alive: 0,
    };
    const cases = [
      ['briefing', { ...base, state: 'briefing' }, m2, /^ENGAGE IN 0:0\d$/],
      ['countdown', { ...base, state: 'countdown' }, m2, /^ENGAGE IN /],
      ['a wave due', base, m2, /^NEXT WAVE IN 0:09$/],
      ['a wave at its time', base, m2, /^WAVE INBOUND$/, 12000],
      ['a round\'s result', { ...base, roundState: 'result', nextRoundAt: 20000 }, m2, /^NEXT ROUND IN 0:17$/],
      ['a result with no next round time', { ...base, roundState: 'result', nextRoundAt: null }, m2, /NOT KNOWN/],
      ['round 2 from a room with no roundAt', { ...base, round: 2, roundAt: undefined, wave: 2 }, m2, /NOT KNOWN/],
      ['a mission this build lacks', base, null, /NOT KNOWN/],
      ['the last wave out, contacts up', { ...base, round: 5, wave: m2.waves.length, alive: 3 }, m2, /^LAST WAVE/],
      ['the last wave out, none up', { ...base, round: 5, wave: m2.waves.length }, m2, /^ROUND CLEAR$/],
    ];
    for (const [name, v, mi, want, now = 3000] of cases) {
      const got = waveStatus(v, mi, now);
      check(`the HUD's line, ${name}: ${want}`, Boolean(got) && want.test(got.text), got ? got.text : 'nothing');
    }
    check('and nothing once the war is over or not on', ['lobby', 'won', 'lost', 'ended'].every((state) => waveStatus({ ...base, state }, m2, 3000) === null));
  }
}
