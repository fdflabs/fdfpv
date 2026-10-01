/*
 * rooms-selftest-scale.js: Phase 6's section of npm run rooms:selftest
 * (docs/MULTIPLAYER-PLAN.md section 12): interest thinning in the room
 * (edge/rooms/core.js INTEREST), the far peer's delay in the client
 * (src/game/peer.js), the valve (edge/rooms/health.js Valve), and the
 * admin route and the busy refusals (edge/rooms/front.js). In its own
 * file, as the combat and browser sections are. rooms-selftest.js calls
 * scaleSection(check) once.
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
  FLAG_AIRBORNE, PROTO, decodeBatch, encodePose,
} from '../src/share/roomwire.js';
import {
  HERE_MS, INTEREST, RoomCore, TICK_MS, interestEvery,
} from '../edge/rooms/core.js';
import {
  BUSY_CPU, BUSY_LAG_MS, BUSY_RSS, BUSY_S, CALM_S, Valve,
} from '../edge/rooms/health.js';
import {
  DELAY_MS, DELAY_SLEW, PeerTrack, SEND_MS, nearWeight,
} from '../src/game/peer.js';
import { server } from './rooms-selftest-browser.js';

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };

function sock(name) {
  return { name, got: [], closed: null, attachment: null };
}

/*
 * A room of pilots flying straight lines at 30 m/s, one pose each every
 * 33 ms on the room's clock, the room ticking every TICK_MS. `where` is
 * each pilot's start, x in metres. Returns what each received, as
 * [{ at, seat, t, x }] per pilot, and the bytes of every batch.
 */
function flyRoom(where, seconds, { silent = () => false } = {}) {
  let now = 5_000_000;
  const meta = { code: 'SCALE2', cap: 16, friendly: true, map: 'swiss2', epoch: now - 1000 };
  const room = new RoomCore(meta);
  const pilots = where.map((x, i) => ({ ...sock(`p${i}`), x0: x, got: [], bytes: 0, sent: 0 }));
  let tokens = 0;
  const run = (actions) => {
    for (const a of actions) {
      if (a.send && typeof a.data !== 'string') {
        const b = decodeBatch(a.data);
        a.send.bytes += a.data.byteLength;
        for (const p of b.poses) {
          a.send.got.push({ at: now, seat: p.seat, t: p.t, x: p.px });
        }
      }
    }
  };
  for (const [i, p] of pilots.entries()) {
    run(room.open(p, now));
    run(room.message(p, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [1, 2, 10 + i], profile }), now, `10.1.1.${i}`, () => {
      tokens += 1;
      return tokens.toString(16).padStart(32, '0');
    }));
    p.seat = i + 1;
  }
  /* Spawn protection passes first, so every pose is a plain one. */
  now += 6000;
  const referee = room.referee.pose.bind(room.referee);
  let judged = 0;
  room.referee.pose = (...args) => {
    judged += 1;
    return referee(...args);
  };
  let nextTick = now;
  const end = now + seconds * 1000;
  let poseAt = now;
  while (now < end) {
    if (now >= poseAt) {
      const t = now - meta.epoch;
      for (const p of pilots) {
        if (silent(p, now)) {
          continue;
        }
        p.sent += 1;
        run(room.message(p, encodePose({
          flags: FLAG_AIRBORNE, seq: p.sent, t, px: p.x0 + (30 * t) / 1000, py: 200, pz: 0,
          qx: 0, qy: 0, qz: 0, qw: 1, vx: 30, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
        }), now));
      }
      poseAt += 1000 / 30;
    }
    if (now >= nextTick && room.ticking) {
      run(room.tick(now));
      nextTick += TICK_MS;
    } else if (!room.ticking) {
      nextTick = now + TICK_MS;
    }
    now += 1;
  }
  return { pilots, judged, room, now };
}

/* The gaps between one seat's poses as a pilot received them, ms. */
function gapsOf(p, seat) {
  const at = p.got.filter((g) => g.seat === seat).map((g) => g.at);
  return at.slice(1).map((x, i) => x - at[i]);
}

export async function scaleSection(check) {
  console.log('scale: interest thinning');
  check('the bands: 30 Hz to 300 m, 5 Hz to 1.5 km, 1 Hz past', interestEvery([0, 0, 0], [299, 0, 0]) === 1
    && interestEvery([0, 0, 0], [0, 301, 0]) === 6 && interestEvery([0, 0, 0], [1500, 0, 0]) === 6 && interestEvery([0, 0, 0], [0, 0, 1501]) === 30
    && interestEvery(null, [5000, 0, 0]) === 1);
  check('and every far band\'s gap is under the client\'s STALE_MS and near the ticks it names', INTEREST.every((b) => b.every * TICK_MS < 2000)
    && INTEREST[0].every === 1);
  /* A beside B, C 800 m off, D 3 km off; all flying the same way. */
  const flown = flyRoom([0, 50, 800, 3000], 10);
  const [A, B, C, D] = flown.pilots;
  const fromB = gapsOf(A, B.seat);
  check('a near peer reaches A every tick, every pose it sent', A.got.filter((g) => g.seat === B.seat).length >= B.sent - 2
    && Math.max(...fromB) <= Math.ceil(TICK_MS) + 1, `${A.got.filter((g) => g.seat === B.seat).length} of ${B.sent}, worst gap ${Math.max(...fromB)} ms`);
  const hz = (p, seat) => {
    const g = gapsOf(p, seat);
    return 1000 / (g.reduce((x, y) => x + y, 0) / g.length);
  };
  check('a peer 800 m off at 5 Hz', Math.abs(hz(A, C.seat) - 5) < 0.3, `${hz(A, C.seat).toFixed(2)} Hz`);
  check('a peer 3 km off at 1 Hz', Math.abs(hz(A, D.seat) - 1) < 0.1, `${hz(A, D.seat).toFixed(2)} Hz`);
  check('and a far peer\'s newest pose, not an old one', A.got.filter((g) => g.seat === D.seat).every((g) => g.at - (g.t + flown.room.meta.epoch) <= 40));
  check('the pair is symmetric: D sees A at 1 Hz too', Math.abs(hz(D, A.seat) - 1) < 0.1);
  const every = B.sent * 3;
  const got = A.got.length;
  check('A was sent measurably fewer pose entries than every pose of everybody', got < every * 0.5, `${got} of ${every}, ${((1 - got / every) * 100).toFixed(0)}% saved`);
  const unthinned = flyRoom([0, 50, 80, 120], 10);
  const U = unthinned.pilots[0];
  check('a room all within 300 m is sent every pose, as before thinning', U.got.length >= unthinned.pilots[1].sent * 3 - 6, `${U.got.length} of ${unthinned.pilots[1].sent * 3}`);
  check('A\'s bytes a second fell from the all near room\'s to the spread room\'s', A.bytes < U.bytes * 0.6, `${A.bytes} B against ${U.bytes} B in 10 s`);
  check('the room\'s referee judged every pose of every pilot, thinned or not', flown.judged === flown.pilots.reduce((x, p) => x + p.sent, 0), `${flown.judged}`);

  /* D stops sending after 5 s (a menu): A still gets its last pose, and
   * D, not flying, is sent everybody at the full rate from HERE_MS on. */
  const quiet = flyRoom([0, 3000], 10, { silent: (p, now) => p.name === 'p1' && now > 5_006_000 + 5000 });
  const [qa, qd] = quiet.pilots;
  const lastSent = 5_006_000 + 5000;
  /* The first arrival of D's newest pose: the room goes on repeating it
   * for HOLD_MS afterwards (core.js), which is not what this times. */
  const fromD = qa.got.filter((g) => g.seat === qd.seat);
  const lastGot = fromD.find((g) => g.t === fromD.at(-1).t);
  check('a far peer that stops: its last pose still arrives, within a second', lastGot && lastGot.t + quiet.room.meta.epoch >= lastSent - 40 && lastGot.at - lastSent <= 1000 + 40,
    lastGot ? `${lastGot.at - lastSent} ms after` : 'none');
  const afterMenu = qd.got.filter((g) => g.at > lastSent + HERE_MS + 100);
  const gapsAfter = afterMenu.slice(1).map((g, i) => g.at - afterMenu[i].at);
  check('and a seat that stopped flying is sent the others every tick again', afterMenu.length > 50 && Math.max(...gapsAfter) <= Math.ceil(TICK_MS) + 1,
    `${afterMenu.length} poses, worst gap ${Math.max(...gapsAfter)} ms`);

  console.log('scale: the far peer\'s delay (src/game/peer.js)');
  /* A peer flying x = 30 t, its poses arriving `every` ms apart, 60 ms
   * after they were stamped; drawn at 60 fps. */
  const draw = (every, seconds, near = 0, from = 0) => {
    const track = new PeerTrack();
    const frames = [];
    let next = from;
    for (let now = from; now < from + seconds * 1000; now += 1000 / 60) {
      while (next + 60 <= now) {
        track.push({ t: next, px: 0.03 * next, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 30, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 }, next + 60);
        next += every(next);
      }
      const out = {};
      if (track.sample(now, near, out)) {
        frames.push({ now, x: out.px, delay: track.delay });
      }
    }
    return { track, frames };
  };
  const full = draw(() => SEND_MS, 5);
  check('a peer at the full rate is drawn DELAY_MS behind, as before', full.frames.slice(10).every((f) => Math.abs(f.delay - DELAY_MS) < 1e-9)
    && full.frames.slice(10).every((f) => Math.abs(f.x - 0.03 * (f.now - DELAY_MS)) < 1e-6));
  const nearly = draw(() => SEND_MS, 5, 1);
  const alsoAt5 = draw(() => 200, 5, 1);
  check('a near peer is drawn in the present whatever its rate: the delay never reaches it', nearWeight(10) === 1
    && nearly.frames.slice(10).every((f) => Math.abs(f.x - 0.03 * f.now) < 0.03 * 60 + 1e-6)
    && alsoAt5.frames.slice(10).every((f) => Math.abs(f.x - 0.03 * f.now) < 0.03 * 250 + 1e-6));
  const five = draw(() => 200, 8);
  const settled = five.frames.filter((f) => f.now > 3000);
  const steps = settled.slice(1).map((f, i) => f.x - settled[i].x);
  check('a 5 Hz peer settles to DELAY_MS plus its extra gap', Math.abs(settled.at(-1).delay - (DELAY_MS + 200 - SEND_MS)) < 1e-6, `${settled.at(-1).delay}`);
  check('and is drawn moving every frame, never held at its newest sample', Math.min(...steps) > 0.4 && Math.max(...steps) < 0.6,
    `steps ${Math.min(...steps).toFixed(3)} to ${Math.max(...steps).toFixed(3)} m`);
  /* 30 Hz for 3 s, then 5 Hz: the delay slews, and the drawn peer never
   * jumps and never runs backwards. */
  const change = draw((t) => (t < 3000 ? SEND_MS : 200), 8);
  const cs = change.frames.slice(1).map((f, i) => f.x - change.frames[i].x);
  const moves = change.frames.slice(1).map((f, i) => Math.abs(f.delay - change.frames[i].delay));
  check('a peer changing band: the delay moves at DELAY_SLEW, the drawn peer never jumps or backs up', Math.max(...moves) <= DELAY_SLEW * (1000 / 60) + 1e-6
    && Math.min(...cs) >= 0 && Math.max(...cs) < 0.5 * 1.3 + 0.05, `step ${Math.min(...cs).toFixed(3)} to ${Math.max(...cs).toFixed(3)} m`);

  console.log('scale: the valve (edge/rooms/health.js)');
  const calm = { cpu: 0.1, lag: 1, rss: 50e6 };
  let v = new Valve();
  let t = 0;
  const feed = (s, n) => {
    let busy = false;
    for (let i = 0; i < n; i += 1) {
      busy = v.feed(s, (t += 1000));
    }
    return busy;
  };
  check('a calm server is open', feed(calm, 60) === false);
  v = new Valve();
  check(`a slow loop: one second at ${BUSY_LAG_MS * 4} ms (a collection) does not close it, ${BUSY_S} averaging ${BUSY_LAG_MS} ms do`, feed(calm, BUSY_S) === false
    && feed({ ...calm, lag: BUSY_LAG_MS * 4 }, 1) === false && feed(calm, BUSY_S) === false && feed({ ...calm, lag: BUSY_LAG_MS }, BUSY_S - 1) === false
    && feed({ ...calm, lag: BUSY_LAG_MS }, 1) === true);
  v = new Valve();
  check(`${BUSY_S} seconds averaging ${BUSY_CPU * 100}% of the core close it, one hot second does not`, feed(calm, 20) === false
    && feed({ ...calm, cpu: 1 }, 1) === false && feed({ ...calm, cpu: BUSY_CPU + 0.05 }, BUSY_S) === true);
  check(`and it stays closed until ${CALM_S} calm seconds in a row`, feed(calm, CALM_S - 1) === true && feed({ ...calm, lag: 12 }, 1) === true
    && feed(calm, CALM_S - 1) === true && feed(calm, 1) === false, `${v.closings} closings`);
  v = new Valve();
  check('memory near the unit\'s ceiling closes it at once', feed({ ...calm, rss: BUSY_RSS }, 1) === true);

  console.log('scale: the admin route and the busy refusals (edge/rooms/front.js)');
  const s = server();
  const admin = (secret) => fetchFront(s, '/v2/admin/health', secret ? { authorization: `Bearer ${secret}` } : {});
  let res = await fetchFront(s, '/v2/admin/health', { authorization: 'Bearer x' });
  check('on a platform with no counters (Cloudflare) the admin route is not there', res.status === 404);
  let busyNow = false;
  let refused = 0;
  s.env.HEALTH = { busy: () => busyNow, refuse: () => { refused += 1; }, report: () => ({ pilots: 3 }) };
  s.env.ADMIN_SECRET = 'scale-admin-secret';
  res = await admin(null);
  check('with no secret the counters are refused', res.status === 401);
  res = await admin('scale-admin-secret-');
  check('and with a wrong one', res.status === 401);
  res = await admin('scale-admin-secret');
  check('the admin gets them, never cached', res.status === 200 && (await res.json()).pilots === 3 && res.headers.get('cache-control') === 'no-store');
  s.env.ADMIN_SECRET = '';
  res = await admin('');
  check('and with no secret set on the server, nobody does', res.status === 401);
  const open = await s.create({ map: 'swiss2', public: true, name: 'Open Sky' });
  check('an open valve makes public rooms as ever', open.status === 200);
  busyNow = true;
  const shut = await s.create({ map: 'swiss2', public: true, name: 'Too Late' });
  check('a closed one refuses a new public room, busy, and counts it', shut.status === 503 && shut.error === 'busy' && refused === 1);
  const friends = await s.create({ map: 'swiss2', name: 'Friends' });
  check('but not a private room', friends.status === 200);
  const listed = await s.list();
  check('the list says busy, and still lists the rooms', listed.busy === true && listed.rooms.some((r) => r.code === open.code));
  res = await fetchFront(s, '/v2/public', {});
  check('and so does /v2/public', (await res.json()).busy === true);
  const into = await s.join({ map: 'swiss2' });
  check('a quick join still lands in a room with a seat', into.welcome && into.welcome.code === open.code);
  const nowhere = await s.join({ map: 'alps' });
  check('but one with no room to land in is refused, and no room is made for it', nowhere.refused === 503 && refused === 2
    && !(await s.list()).rooms.some((r) => r.map === 'alps'));
  busyNow = false;
  const again = await s.join({ map: 'alps' });
  check('once the valve opens, the same quick join makes its room', again.welcome && again.welcome.public === true);
}

function fetchFront(s, path, headers) {
  return s.call(path, { headers });
}
