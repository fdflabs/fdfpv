/*
 * rooms-selftest-foot.js: the pilot on foot on the room's wire
 * (roomwire.js FOOT, edge/rooms/foot.js), driven on a RoomCore in Node.
 * Part of npm run rooms:selftest.
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

import {
  FOOT_BYTES, FOOT_HANGAR, FOOT_ON, FOOT_REACH_M, PROTO, ROOM_LEVEL, TYPE_FOOT_RELAY, checkProfile,
  POSE_BYTES, decodeBatch, decodeFootRelay, decodePartsRelay, decodePose, encodeFoot, isFoot,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { FOOT_PER_S } from '../edge/rooms/foot.js';
import {
  FOOT_SPOT_MS, FOOT_STALE_MS, createFootSender, createFootTrack,
} from '../src/share/roomfoot.js';

const profile = { airframe: 'bramor2300', map: 'itaipu', figure: 3, livery: null, parts: null };

export function footSection(check) {
  console.log('the pilot on foot');
  /* The wire alone. */
  const f = { flags: FOOT_ON, x: 44.125, y: 3.5, z: -70.25, heading: -2.5 };
  const bytes = encodeFoot(f);
  check(`a FOOT is ${FOOT_BYTES} bytes and checks`, bytes.length === FOOT_BYTES && FOOT_BYTES === 16 && isFoot(bytes));
  const bad = (mut) => {
    const b = bytes.slice();
    mut(new DataView(b.buffer), b);
    return isFoot(b);
  };
  check('a flag there is not is refused', !bad((v) => v.setUint8(1, 4)) && !bad((v) => v.setUint8(1, 0x80)));
  check('a place not a number is refused', !bad((v) => v.setFloat32(2, NaN, true)) && !bad((v) => v.setFloat32(10, Infinity, true)));
  check(`a place past ${FOOT_REACH_M} m is refused`, !bad((v) => v.setFloat32(6, FOOT_REACH_M + 1, true)) && !bad((v) => v.setFloat32(2, -FOOT_REACH_M * 2, true)));
  check('a wrong length or type is refused', !isFoot(bytes.subarray(0, 15)) && !isFoot(new Uint8Array(17)) && !bad((v) => v.setUint8(0, 0x41)));
  check('flags 0 (standing at a walked spot, flying) and in the hangar check', isFoot(encodeFoot({ ...f, flags: 0 })) && isFoot(encodeFoot({ ...f, flags: FOOT_ON | FOOT_HANGAR })));

  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `f0${tokens.toString(16).padStart(30, '0')}`;
  };
  let now = 9_000_000;
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
    }
    return actions;
  };
  const hello = (room, s, extra = {}) => run(room.hello(s, {
    type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 40 + s.name.length], profile, level: ROOM_LEVEL, ...extra,
  }, now, `10.0.4.${s.name.length}`, newToken));
  const feet = (s) => s.got.filter((m) => m instanceof Uint8Array && m[0] === TYPE_FOOT_RELAY);

  const room = new RoomCore({ code: 'FOOT22', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: now - 1000 });
  const a = sock('a');
  const b = sock('bb');
  const w = sock('www');
  const stranger = sock('ssss');
  hello(room, a);
  now += 5;
  hello(room, b);
  now += 5;
  hello(room, w, { watch: true });
  run(room.open(stranger, now));

  run(room.message(stranger, bytes, now));
  check('a FOOT from a socket with no seat is nothing', feet(a).length + feet(b).length + feet(w).length === 0);

  now += 1000;
  run(room.message(a, bytes, now));
  const relayed = feet(b).at(-1);
  const got = relayed && decodeFootRelay(relayed);
  check('a FOOT reaches the others with the seat after the type', got && got.seat === 1 && got.flags === FOOT_ON && relayed.length === FOOT_BYTES + 1);
  check('the feet survive as float32', got && got.x === 44.125 && got.y === 3.5 && got.z === -70.25);
  check('the heading to a ten thousandth of a radian', got && Math.abs(got.heading - f.heading) < 1e-4, got && `${got.heading}`);
  check('a heading past pi comes back wrapped', Math.abs(decodeFootRelay(new Uint8Array([TYPE_FOOT_RELAY, 1, ...encodeFoot({ ...f, heading: 3 * Math.PI / 2 }).subarray(1)])).heading + Math.PI / 2) < 1e-4);
  check('a watcher is sent it too, to draw the pilot', feet(w).length === 1);
  check('and the sender is not sent its own', feet(a).length === 0);
  /* A build from before FOOT: its decoders take the relay for nothing, and
   * a server from before it hands the FOOT to its POSE path, which wants
   * POSE_BYTES. Either way it is dropped, never misread. */
  check('an old client reads a FOOT_RELAY as nothing', decodeBatch(relayed) === null && decodePartsRelay(relayed) === null && decodePose(relayed) === null);
  check('and an old server cannot take a FOOT for a POSE', FOOT_BYTES !== POSE_BYTES && decodePose(bytes) === null);

  const nb = feet(b).length;
  for (const mut of [(v) => v.setUint8(1, 8), (v) => v.setFloat32(6, NaN, true)]) {
    const x = bytes.slice();
    mut(new DataView(x.buffer));
    run(room.message(a, x, now));
  }
  run(room.message(a, bytes.subarray(0, 12), now));
  check('a bad FOOT from a seated pilot is dropped, the socket kept', feet(b).length === nb && !a.closed);

  now += 1000;
  let sent = 0;
  for (let i = 0; i < 30; i += 1) {
    const n = feet(b).length;
    run(room.message(a, encodeFoot({ ...f, x: i }), now));
    sent += feet(b).length - n;
  }
  check(`FOOT over ${FOOT_PER_S} a second is dropped`, sent === FOOT_PER_S, `${sent}`);
  now += 1000;
  run(room.message(a, encodeFoot({ ...f, x: 99 }), now));
  check('and the next second it flows again', decodeFootRelay(feet(b).at(-1)).x === 99);
  check('poses are counted apart: FOOT spends none of the POSE allowance', [...room.seats.values()].find((s) => s.seat === 1).poseRate.n === 0);

  /* The hangar's status. */
  check('a profile carries status hangar', checkProfile({ ...profile, status: 'hangar' })?.status === 'hangar');
  now += 1000;
  run(room.message(a, JSON.stringify({ type: 'profile', profile: { ...profile, status: 'hangar' } }), now));
  check('the others are told a pilot went into the hangar', b.got.some((m) => m && m.type === 'profile' && m.profile.status === 'hangar'));
  check('the hangar flag relays', (() => {
    run(room.message(a, encodeFoot({ ...f, flags: FOOT_ON | FOOT_HANGAR }), now + 1000));
    const g = decodeFootRelay(feet(b).at(-1));
    return g.flags === (FOOT_ON | FOOT_HANGAR);
  })());

  /* The sender's cadence: FOOT_HZ on foot, once a FOOT_SPOT_MS from a
   * walked spot, nothing at the station, and at once on a change. */
  const out = [];
  let here = null;
  const sender = createFootSender({ sendBinary: (x) => out.push(x) }, () => here);
  for (let t = 0; t < 1000; t += 16) {
    sender.frame(t);
  }
  check('at the station nothing is sent', out.length === 0);
  here = { ...f };
  for (let t = 1000; t < 2000; t += 16) {
    sender.frame(t);
  }
  check('on foot, ten a second', out.length === 10, `${out.length}`);
  here = { ...f, flags: 0 };
  out.length = 0;
  for (let t = 2000; t < 2000 + 3 * FOOT_SPOT_MS; t += 16) {
    sender.frame(t);
  }
  check('flying from a walked spot, one a second, the first at once', out.length === 3 && isFoot(out[0]) && out[0][1] === 0, `${out.length}`);
  here = { ...f, flags: FOOT_ON | FOOT_HANGAR };
  sender.frame(5001);
  check('into the hangar is said at once', out.length === 4 && out[3][1] === (FOOT_ON | FOOT_HANGAR));
  sender.resend();
  check('and said again after a reconnect', out.length === 5);

  /* The track: eased onto the newest, stale back to the station. */
  const track = createFootTrack();
  check('a track with nothing draws nothing', track.draw(0) === null);
  track.push({ flags: FOOT_ON, x: 0, y: 1, z: 0, heading: 0 }, 0);
  let walked = 0;
  let worst = 0;
  /* A walk of 1.4 m/s along -z, a sample every 100 ms, drawn at 60 Hz. */
  for (let t = 0, k = 1; t <= 3000; t += 1000 / 60) {
    if (t >= k * 100) {
      track.push({ flags: FOOT_ON, x: 0, y: 1, z: -0.14 * k, heading: 0 }, t);
      k += 1;
    }
    const d = track.draw(t);
    walked += d.moved;
    worst = Math.max(worst, Math.abs(d.z - -1.4 * t / 1000));
  }
  check('a walk is drawn steady, within one sample\'s 0.14 m of where the pilot is', worst <= 0.3 && Math.abs(walked - 4.2) < 0.2, `worst ${worst.toFixed(3)} m, walked ${walked.toFixed(2)} m`);
  track.push({ flags: FOOT_ON, x: 0, y: 1, z: -4.2, heading: Math.PI - 0.1 }, 3100);
  track.push({ flags: FOOT_ON, x: 0, y: 1, z: -4.2, heading: -Math.PI + 0.1 }, 3200);
  const mid = track.draw(3250);
  check('a turn through pi goes the short way', Math.abs(Math.abs(mid.heading) - Math.PI) < 0.1, `${mid.heading}`);
  track.push({ flags: 0, x: 100, y: 1, z: 50, heading: 0 }, 3300);
  check('a sample far away is a move, put there at once', track.draw(3301).x === 100);
  check(`no FOOT for ${FOOT_STALE_MS} ms is back to the station`, track.draw(3300 + FOOT_STALE_MS + 1) === null && track.draw(3300 + FOOT_STALE_MS - 1) !== null);

  /* Nothing of it is kept: a hibernation's attachment carries no FOOT. */
  check('a seat\'s attachment holds no FOOT', !JSON.stringify(room.attachmentOf([...room.seats.values()].find((s) => s.seat === 1))).includes('foot'));
}
