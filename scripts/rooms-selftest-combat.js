/*
 * rooms-selftest-combat.js: the combat section of npm run rooms:selftest
 * (docs/COMBAT-PLAN.md section 7), kept in its own file so the phases that
 * add their own sections to scripts/rooms-selftest.js do not edit the same
 * lines. rooms-selftest.js calls combatSection(check) once.
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
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, PROTO, STREAMER_COLOURS, STREAMER_ERR_M, STREAMER_PIECES, STREAMER_SEGS,
  TYPE_STREAMER_RELAY, decodeStreamer, decodeStreamerRelay, encodePose, encodeStreamer, relayStreamer, streamerColour,
  trimStreamer,
} from '../src/share/roomwire.js';
import { RoomCore } from '../edge/rooms/core.js';
import {
  COUNTDOWN_MS, FULL_LINKS, POINTS_CUT, POINTS_FLIGHT, POINTS_LAUNCH, POINTS_PER_METRE,
} from '../edge/rooms/combat.js';
import { PAPER_HALF_M } from '../src/game/cut.js';
import { WIDTH_M } from '../src/game/streamer.js';

/* A deterministic wander: a chain that bends and stretches like paper. */
function randomChain(rnd, n, stretch) {
  const x = new Float64Array(n * 3);
  x[0] = 2000 * rnd() - 1000;
  x[1] = 300 * rnd();
  x[2] = 6000 * rnd() - 3000;
  let dx = rnd() - 0.5;
  let dy = rnd() - 0.5;
  let dz = rnd() - 0.5;
  for (let k = 1; k < n; k += 1) {
    dx += 0.6 * (rnd() - 0.5);
    dy += 0.6 * (rnd() - 0.5);
    dz += 0.6 * (rnd() - 0.5);
    const l = Math.hypot(dx, dy, dz);
    const len = stretch ? 1 + 0.2 * rnd() : 0.2 + 0.8 * rnd();
    x[k * 3] = x[k * 3 - 3] + (dx / l) * len;
    x[k * 3 + 1] = x[k * 3 - 2] + (dy / l) * len;
    x[k * 3 + 2] = x[k * 3 - 1] + (dz / l) * len;
  }
  return x;
}

export function combatSection(check) {
  console.log('combat: streamer frames');
  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let worst = 0;
  let shapes = true;
  for (let trial = 0; trial < 300; trial += 1) {
    const n = 51;
    const x = randomChain(rnd, n, trial % 2 === 0);
    const got = decodeStreamer(encodeStreamer(4321, [{ id: 0, n, x }]));
    shapes &&= Boolean(got) && got.t === 4321 && got.chains.length === 1 && got.chains[0].n === n;
    for (let k = 0; got && k < n; k += 1) {
      const c = got.chains[0].x;
      worst = Math.max(worst, Math.hypot(c[k * 3] - x[k * 3], c[k * 3 + 1] - x[k * 3 + 1], c[k * 3 + 2] - x[k * 3 + 2]));
    }
  }
  check('a streamer decodes whole, time and all', shapes);
  check(`every node, however far down the paper, within ${STREAMER_ERR_M * 100} cm of its owner's`, worst <= STREAMER_ERR_M, `worst ${(worst * 100).toFixed(2)} cm`);
  const full = encodeStreamer(0, [{ id: 0, n: 51, x: randomChain(rnd, 51, true) }]);
  check('a full fifty metre streamer is 171 bytes', full.byteLength === 171, `${full.byteLength}`);
  const many = [];
  for (let i = 0; i < 8; i += 1) {
    many.push({ id: i, n: 90, x: randomChain(rnd, 90, false) });
  }
  const capped = decodeStreamer(encodeStreamer(0, many));
  check(`at most ${1 + STREAMER_PIECES} chains of ${STREAMER_SEGS} segments are sent`, capped.chains.length === 1 + STREAMER_PIECES && capped.chains.every((c) => c.n === STREAMER_SEGS + 1));
  const relayed = decodeStreamerRelay(relayStreamer(9, full));
  check('the relay carries the seat and the same streamer', relayed && relayed.seat === 9 && relayed.chains[0].n === 51 && relayStreamer(9, full)[0] === TYPE_STREAMER_RELAY);
  const two = encodeStreamer(0, [{ id: 0, n: 51, x: randomChain(rnd, 51, true) }, { id: 3, n: 20, x: randomChain(rnd, 20, false) }]);
  const trimmed = decodeStreamer(trimStreamer(two, 12));
  check('trimming cuts the streamer to what the referee left and keeps the pieces', trimmed && trimmed.chains[0].n === 13 && trimmed.chains[1].id === 3 && trimmed.chains[1].n === 20);
  check('trimming to more than there is changes nothing', trimStreamer(two, 60) === two);
  check('bytes that do not add up are nothing', decodeStreamer(full.subarray(0, 170)) === null && decodeStreamer(new Uint8Array([0x80, 0, 0, 0, 0, 0, 9])) === null);
  const colours = new Set(Array.from({ length: 16 }, (_, i) => streamerColour(i + 1)));
  check('sixteen seats, sixteen colours', colours.size === 16 && STREAMER_COLOURS.length === 16);
  check('the rule\'s paper is the physics\' paper', PAPER_HALF_M === WIDTH_M / 2);

  roundSection(check);
}

/* ---------------------------------------------------------------- rooms */

let tokenN = 0;
const newToken = () => {
  tokenN += 1;
  return `c${tokenN.toString(16).padStart(31, '0')}`;
};

/*
 * A room with pilots in it, driven as do.js drives it: send(name, data,
 * at) at `at` ms of room time; each fake socket keeps what it was sent.
 */
function makeRoom(meta, pilots) {
  const room = new RoomCore({
    code: 'CMBTST', cap: 8, friendly: false, map: 'swiss2', epoch: 0, ...meta,
  });
  const socks = {};
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
    }
    return actions;
  };
  const join = (name, airframe, at) => {
    const conn = { name, got: [] };
    socks[name] = conn;
    const n = Object.keys(socks).length;
    run(room.open(conn, at));
    run(room.message(conn, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [n, n, 10 + n], profile: { airframe, map: 'swiss2', figure: 0, livery: null, parts: null },
    }), at, `10.9.0.${n}`, newToken));
    return conn;
  };
  for (const [name, airframe] of pilots) {
    join(name, airframe, 0);
  }
  return {
    room,
    socks,
    join,
    send: (name, data, at) => run(room.message(socks[name], typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data), at)),
    tick: (at) => run(room.tick(at)),
  };
}

const texts = (sock, type, kind) => sock.got.filter((m) => m && m.type === type && (!kind || m.kind === kind));

/* B hangs still at 60 m, its paper straight down; A, a five inch, flies
 * level along +x through the paper at 40 m at 20 m/s (after Phase 5's
 * five spawning seconds). */
const B_AT = [0, 60, 0];
const A_Y = 40;
function hanging(links, dx = 0) {
  const x = new Float64Array((links + 1) * 3);
  for (let i = 0; i <= links; i += 1) {
    x[i * 3] = dx;
    x[i * 3 + 1] = 59.9 - i;
    x[i * 3 + 2] = 0.02;
  }
  return x;
}
function posePacket(at, p, flags = FLAG_AIRBORNE, v = [0, 0, 0]) {
  return encodePose({
    flags, seq: at, t: at, px: p[0], py: p[1], pz: p[2], qx: 0, qy: 0.7071068, qz: 0, qw: 0.7071068,
    vx: v[0], vy: v[1], vz: v[2], wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
  });
}
/* Fly the two from `from` to `to` ms: A at aAt(t), B still with its paper
 * `links` long; A's own paper hangs 500 m away, aLinks long. */
function fly(r, from, to, aAt, opts = {}) {
  const links = opts.links ?? FULL_LINKS;
  const aLinks = opts.aLinks ?? FULL_LINKS;
  for (let t = from; t <= to; t += 1) {
    if (t % 33 === 0) {
      const a = aAt(t);
      r.send('A', posePacket(t, a.p, opts.aFlags ?? FLAG_AIRBORNE, a.v), t);
      r.send('B', posePacket(t, B_AT, opts.bFlags ?? FLAG_AIRBORNE), t);
      r.tick(t);
    }
    if (t % 100 === 0) {
      r.send('B', encodeStreamer(t, [{ id: 0, n: links + 1, x: hanging(links) }]), t);
      r.send('A', encodeStreamer(t, [{ id: 0, n: aLinks + 1, x: hanging(aLinks, 500) }]), t);
    }
  }
}
/* Level along +x at 20 m/s, over the paper at tc. */
const passAt = (tc, y = A_Y) => (t) => ({ p: [20 * (t - tc) / 1000, y, 0], v: [20, 0, 0] });
/* Hovering 300 m off, out of everyone's way. */
const away = () => ({ p: [-300, A_Y, 0], v: [0, 0, 0] });
/* Along +x over the paper at tc, then back along -x over it at tc2,
 * climbing 6 m over the turn (a jump would be a teleport to Phase 5). */
const thereAndBack = (tc, tc2) => (t) => {
  const turn = (tc + tc2) / 2;
  const y = A_Y + 6 * Math.min(1, Math.max(0, (t - tc) / (turn - tc)));
  return t < turn
    ? { p: [20 * (t - tc) / 1000, y, 0], v: [20, 0, 0] }
    : { p: [-20 * (t - tc2) / 1000, y, 0], v: [-20, 0, 0] };
};
function started(meta = {}) {
  const r = makeRoom(meta, [['A', '5inch'], ['B', 'cub1400']]);
  r.send('A', { type: 'combat', op: 'start', minutes: 3 }, 0);
  Object.assign(r.room.combat.round, { state: 'on', startsAt: 1000, endsAt: 181000 });
  return r;
}

function roundSection(check) {
  console.log('combat: the round');
  {
    const r = makeRoom({}, [['A', '5inch'], ['B', 'cub1400']]);
    r.send('B', { type: 'combat', op: 'start', minutes: 5 }, 100);
    check('only the host starts a round', texts(r.socks.A, 'combat').length === 0);
    r.send('A', { type: 'combat', op: 'start', minutes: 4 }, 100);
    check('for 3 or 5 minutes only', texts(r.socks.A, 'combat').length === 0);
    r.send('A', { type: 'combat', op: 'start', minutes: 5 }, 100);
    const st = texts(r.socks.B, 'combat').pop();
    check('the host starts one: everyone is told, with a countdown', st && st.state === 'countdown' && st.startsAt === 100 + COUNTDOWN_MS && st.endsAt === st.startsAt + 5 * 60000);
    check('it carries numbers only, nothing anybody typed', st && st.scores.every((x) => Object.values(x).every((v) => typeof v !== 'string')));
    const late = r.join('C', '5inch', 200);
    check('a pilot joining mid round is told the round', texts(late, 'combat').some((m) => m.state === 'countdown'));
    const pub = makeRoom({ public: true, shard: 0 }, [['A', '5inch'], ['B', 'cub1400']]);
    pub.send('A', { type: 'combat', op: 'start', minutes: 5 }, 100);
    check('a public room plays no combat', texts(pub.socks.B, 'combat').length === 0);
  }

  console.log('combat: a cut');
  {
    const r = started();
    fly(r, 1, 7600, passAt(7000));
    const ea = texts(r.socks.A, 'event', 'cut');
    const eb = texts(r.socks.B, 'event', 'cut');
    check('A flies through B\'s paper and both are told of one cut', ea.length === 1 && eb.length === 1 && JSON.stringify(ea[0]) === JSON.stringify(eb[0]), `${ea.length} ${eb.length}`);
    const c = ea[0] || {};
    check('the cut is where the paper was met: 20 m down it, at the pass', c.cutter === 1 && c.victim === 2 && c.keep === 19 && Math.abs(c.tc - 7000) < 20, `keep ${c.keep} at ${c.tc}`);
    check(`it scores ${POINTS_CUT}, cut by a part of the quad`, c.points === POINTS_CUT && typeof c.part === 'string', `${c.points} ${c.part}`);
    const sc = texts(r.socks.B, 'combat').pop();
    const sa = sc.scores.find((x) => x.seat === 1);
    const sb = sc.scores.find((x) => x.seat === 2);
    check('the scoreboard on both screens has it', sa.points === POINTS_CUT && sa.cuts === 1 && sb.owed === 19);
    const before = r.socks.A.got.length;
    fly(r, 7601, 7800, away);
    const shown = r.socks.A.got.slice(before).filter((m) => m instanceof Uint8Array && m[0] === TYPE_STREAMER_RELAY)
      .map((m) => decodeStreamerRelay(m)).filter((m) => m.seat === 2).map((m) => m.chains[0].n - 1);
    check('B\'s client ignoring the cut still shows everyone the paper the room left', shown.length > 0 && shown.every((n) => n === 19), shown.join(','));
    fly(r, 7801, 9300, passAt(9000, A_Y - 15));
    check('below the cut there is no paper left to cut', texts(r.socks.A, 'event', 'cut').length === 1);
  }

  console.log('combat: one pass, one cut');
  {
    const r = started();
    fly(r, 1, 8000, thereAndBack(7000, 7700), { links: FULL_LINKS });
    const cuts = texts(r.socks.A, 'event', 'cut');
    check('back through the paper 0.7 s later, still the pass: it cuts, and does not score', cuts.length === 2 && cuts[1].pass === true && cuts[1].points === 0 && cuts[1].keep < cuts[0].keep, cuts.map((c) => `${c.keep}/${c.points}`).join(' '));
    const sa = texts(r.socks.A, 'combat').pop().scores.find((x) => x.seat === 1);
    check('and counts as one cut', sa.cuts === 1 && sa.points === POINTS_CUT);
  }

  console.log('combat: who can cut and be cut');
  for (const [name, opts] of [
    ['a victim spawning (Phase 5\'s flag)', { bFlags: FLAG_AIRBORNE | FLAG_SPAWNING }],
    ['a cutter crashed', { aFlags: FLAG_AIRBORNE | FLAG_CRASHED }],
  ]) {
    const r = started();
    fly(r, 1, 7600, passAt(7000), opts);
    check(`${name}: no cut`, texts(r.socks.A, 'event', 'cut').length === 0);
  }
  {
    const r = started({ friendly: true });
    fly(r, 1, 7600, passAt(7000));
    check('a friendly room plays: the paper is cut', texts(r.socks.A, 'event', 'cut').length === 1);
  }
  {
    const r = started();
    fly(r, 1, 7600, passAt(7000), { aLinks: 10 });
    const c = texts(r.socks.A, 'event', 'cut')[0];
    const me = texts(r.socks.A, 'combat').pop().scores.find((x) => x.seat === 1);
    check('a pilot whose own paper tore still cuts, and scores nothing', c && c.points === 0 && me.lost === true, c && `${c.points} ${me.lost}`);
    fly(r, 7601, 9000, away);
    const back = texts(r.socks.A, 'combat').pop().scores.find((x) => x.seat === 1);
    check('until a respawn lays it at the length owed again', back.lost === false && back.links === FULL_LINKS);
  }

  console.log('combat: the clock and the bonuses');
  {
    const r = makeRoom({}, [['A', '5inch'], ['B', 'cub1400']]);
    r.send('A', { type: 'combat', op: 'start', minutes: 3 }, 0);
    const go = COUNTDOWN_MS;
    fly(r, 1, go + 200, away);
    const on = texts(r.socks.B, 'combat').find((m) => m.state === 'on');
    check('the countdown ends in the round', Boolean(on));
    check(`airborne with the whole paper at the go: +${POINTS_LAUNCH} each`, on && on.scores.every((x) => x.points === POINTS_LAUNCH));
    /* B crashes in the round (no mid air), then the clock runs out. */
    fly(r, go + 201, go + 400, away, { bFlags: FLAG_CRASHED });
    r.room.combat.round.endsAt = go + 500;
    fly(r, go + 401, go + 700, away);
    const over = texts(r.socks.B, 'combat').find((m) => m.state === 'over');
    const pa = over && over.scores.find((x) => x.seat === 1);
    const pb = over && over.scores.find((x) => x.seat === 2);
    const full = Math.floor(POINTS_PER_METRE * FULL_LINKS);
    check(`at the end: ${full} for fifty metres left, +${POINTS_FLIGHT} for a round without a crash`, pa && pa.points === POINTS_LAUNCH + full + POINTS_FLIGHT, pa && `${pa.points}`);
    check('and no flight bonus for the pilot who crashed', pb && pb.points === POINTS_LAUNCH + full, pb && `${pb.points}`);
    r.send('A', { type: 'combat', op: 'stop' }, go + 800);
    check('the host stops it', texts(r.socks.B, 'combat').pop().state === 'idle');
  }
}
