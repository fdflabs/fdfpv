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
  AGENTS_ENTRY, AGENTS_HEAD, FLAG_AIRBORNE, FLAG_CRASHED, PROTO, PUBLIC_CAP, ROOM_GAMES, TYPE_AGENTS,
  checkProfile, decodeAgents, encodeAgents, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { MISSIONS } from '../edge/rooms/war.js';
import {
  BLAST_M, KIND, KINDS, cosDet, planAgent, poseAt, sinDet,
} from '../src/share/war/routes.js';
import itaipu1 from '../src/share/war/missions/itaipu-1.js';

const Y = 300;

/* A mission for one check: targets a (at the origin) and b, output 3000
 * over a floor of 1500, two airframes a pilot. */
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
  n = 2, pub = false, map = 'itaipu', mission = null, air = 'cub1400', start = true,
} = {}) {
  const r = new RoomCore({
    code: 'W4RR00', cap: pub ? PUBLIC_CAP : PRIVATE_CAP, friendly: false, map, epoch: 0, public: pub,
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
    check('war is a room game a profile can name', ROOM_GAMES.includes('war')
      && checkProfile({ airframe: 'cub1400', map: 'itaipu', figure: 0, game: 'war' }).game === 'war');
    check('the kinds are section 3\'s seven, hunter at index 4', KINDS.length === 7 && KINDS[4] === 'hunter' && KINDS.every((k) => KIND[k].speed > 0));
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
    /* The mission file: every wave's route and target exist. */
    let ok = true;
    for (const w of itaipu1.waves) {
      try {
        planAgent(itaipu1, {
          id: 1, kind: w.kind, route: w.route, t0: 0, k: 0, n: w.n, err: 0, target: w.target ?? null,
        });
      } catch (x) {
        ok = false;
      }
    }
    const intakes = Object.keys(itaipu1.targets).filter((k) => k.startsWith('intake-'));
    check('itaipu-1: every wave plans, twenty intakes of 700 MW make its 14 000', ok && intakes.length === 20
      && intakes.reduce((s, k) => s + itaipu1.targets[k].mw, 0) === itaipu1.output && itaipu1.output === 14000);
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
    e.say(0, { type: 'war', op: 'start', mission: 'test-1' });
    const v = e.view(1);
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
    e.say(0, { type: 'war', op: 'end' });
    check('the host ends it', e.view().state === 'ended' && !e.r.war.on() && !e.r.waiting());
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
    const meetT = COUNTDOWN_MS + 1000 + (300 / 38) * 1000;
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
    check('two kills for seat 1, with their targets\' megawatts saved; one airframe off the rack', s1.kills === 2 && s1.mw === 2000 && v.rack === 3,
      JSON.stringify(v));
    check('the boom lands before the attacker reaches its bubble\'s far side: inside the head on closing', log.length === 1
      && log[0].t < meetT && meetT - log[0].t < 250, log.length ? `${meetT - log[0].t} ms before the centres meet` : 'none');
    check('the output is untouched and the game is won: every wave born and dead', v.output === 3000 && v.state === 'won' && v.why === 'waves');
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
    e.fly(COUNTDOWN_MS + 12000);
    const booms = e.r.war.log.filter((x) => x.what === 'boom');
    check('a defender that went off cannot go off again while its client has not broken it', booms.length === 1, JSON.stringify(booms));
    const m2 = testMission([
      { at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' },
      { at: 12, kind: 'strike', n: 1, route: 'r', target: 'a' },
    ], { r: [[-1200, Y, 0], [-800, Y, 0]] });
    const f = warRoom({ mission: m2 });
    f.paths[0] = hover([-900, Y, 0]);
    f.paths[1] = level(0, 400, 0);
    const blast = COUNTDOWN_MS + 1000 + (300 / 38) * 1000;
    f.flags[0] = (t) => (t > blast + 500 && t < blast + 3000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    f.fly(COUNTDOWN_MS + 30000);
    const fb = f.r.war.log.filter((x) => x.what === 'boom');
    const crashes = f.r.war.log.filter((x) => x.what === 'crash');
    check('its wreck is the blast\'s: no crash counted, and once clean again it goes off on the next', fb.length === 2 && crashes.length === 0
      && f.view().rack === 2, JSON.stringify(f.r.war.log));
  }

  {
    /* A crash takes a rack slot; a pilot who ran the rack out with an
     * attacker alive loses the game. */
    const m = testMission([{ at: 1, kind: 'jammer', n: 1, route: 'r' }], { r: [[-1200, Y, 0], [-1100, Y, 0]] }, { rack: 1 });
    const e = warRoom({ mission: m, n: 1 });
    e.paths[0] = hover([500, Y, 500]);
    e.flags[0] = (t) => (t > COUNTDOWN_MS + 3000 && t < COUNTDOWN_MS + 5000 ? FLAG_CRASHED : FLAG_AIRBORNE);
    e.fly(COUNTDOWN_MS + 8000);
    const v = e.view();
    check('a crash takes one off the rack, and an empty rack with a jammer parked loses', v.rack === 0 && v.state === 'lost' && v.why === 'rack'
      && e.r.war.log.filter((x) => x.what === 'crash').length === 1, JSON.stringify(v));
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
    e.fly(COUNTDOWN_MS + 1000 + (800 / 38) * 1000 + 200);
    const v = e.view();
    const arrive = e.of(1, 'dead').filter((d) => d.why === 'arrive');
    check('an attacker alive at its target takes the target\'s megawatts once', arrive.length === 2 && arrive.every((d) => d.hit && d.target === 'a')
      && v.output === 2000 && v.down.join() === 'a', JSON.stringify(v));
    e.fly(COUNTDOWN_MS + 45000);
    check('under floorMw the game is lost, the instant it is', e.view().state === 'lost' && e.view().why === 'output' && e.view().output === 1000);
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
  }

  console.log('war: hunters');
  {
    const m = testMission([{ at: 1, kind: 'hunter', n: 1, route: 'h' }], { h: [[400, Y, 0]] });
    const e = warRoom({ mission: m, air: '5inch' });
    e.paths[0] = hover([0, Y, 0]);
    e.paths[1] = hover([0, Y, 3000]);
    e.fly(COUNTDOWN_MS + 3000);
    const bin = e.socks[0].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_AGENTS).map(decodeAgents);
    const near = bin.filter((b) => b.agents.length).length;
    const far = e.socks[1].got.filter((x) => x instanceof Uint8Array && x[0] === TYPE_AGENTS).length;
    check('the room sends a hunter\'s poses, as AGENTS, closing on the nearest pilot (400 m off: the 5 Hz band)', near >= 9 && bin.at(-1).agents[0].kind === KINDS.indexOf('hunter')
      && bin.at(-1).agents[0].p[0] < 400 - 36, `${near} messages, last at x ${bin.length ? bin.at(-1).agents[0].p[0].toFixed(1) : '-'}`);
    check('thinned by distance: the pilot 3 km off gets them at the far band\'s rate', far > 0 && far < near / 4, `${far} against ${near}`);
    e.fly(COUNTDOWN_MS + 16000);
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
    const v = again.war.view(again);
    check('a room that restarted keeps its war: state, attackers alive, the rack', again.war.on() && v.alive === 3 && v.rack === 4
      && again.war.live.size === 3 && [...again.war.live.values()].every((x) => x.plan.end === 'arrive'));
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
}
