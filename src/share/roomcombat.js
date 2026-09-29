/*
 * roomcombat.js: toilet paper combat in a room of friends, the client's
 * side (docs/COMBAT-PLAN.md; the room's side is edge/rooms/combat.js, the
 * wire the combat block of roomwire.js).
 *
 * THE OWNER. While a round is out, this pilot's streamer
 * (src/game/streamer.js) is stepped on every plant step with the tail's
 * pose of that step (step()), so it is the same paper at any frame rate.
 * Its frames go to the room at STREAMER_HZ on the room clock. A cut the
 * room sends against this seat is applied to the paper here (cutTo), and
 * the part behind falls on every screen from the next frame. A jump of the
 * tail faster than any flight is a respawn: the paper is laid again
 * behind the aircraft at the length the room owes it, which gives back
 * what a tear took and not what a cut took.
 *
 * THE OTHERS. A peer's streamer and its falling pieces are drawn from its
 * owner's frames, carried to the moment the peer's aircraft is drawn at
 * (each node along its own velocity between the last two frames, at most
 * EXTRAP_MAX_MS), and pinned to the peer's drawn tail. Nothing of a peer
 * is simulated here.
 *
 * Downstream of the physics on both sides: the plant never sees any of it.
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

import { Streamer, LENGTH_M, SEG_M } from '../game/streamer.js';
import { HULLS } from '../../configs/hulls.js';
import {
  STREAMER_HZ, decodeStreamerRelay, encodeStreamer, runsColours, runsLinks,
} from './roomwire.js';

const FULL_LINKS = LENGTH_M / SEG_M;
/* A tail that moves further than this in one millisecond was moved, not
 * flown: 1000 m/s. */
const TELEPORT_M = 1;
/* Faster than this, a new streamer is laid out behind along the travel;
 * slower, it hangs if the aircraft is up, or lies behind it on the ground. */
const LAY_MOVING_MPS = 3;
const LAY_HANG_M = 2;
/* A peer's paper is carried forward up to this far from its newest frame.
 * Longer than an aircraft's 250 ms (src/game/peer.js), because paper moves
 * along its own path and a line slid along itself is the same line: at
 * 250 ms a 300 ms link drew the line 15 to 20 cm off the truth at a pass,
 * at 600 ms under 6 cm on every link set (scripts/combat-harness.js), and
 * the owner's metre (src/game/cut.js) is judged against the truth. */
export const EXTRAP_MAX_MS = 600;
const FRAMES_KEPT = 4;
/* A frame longer than this (a tab in the background) is not caught up. */
const IDLE_MAX_STEPS = 100;
const STILL = [0, 0, 0];

/*
 * The tow point in the Three.js body frame the POSE quaternion turns: the
 * rearmost point of the part boxes (configs/hulls.js, the boxes the room
 * cuts with), on the centre line, at the root part's height. The boxes
 * are the plant's body frame (x forward, y left, z up); the Three.js body
 * has z back and y up (src/game/airframehull.js THREE_BODY). Read from the
 * table directly, not through midair.js, so a page that never opens a room
 * does not load the hull code at boot.
 */
const tows = new Map();
export function towPoint(airframe) {
  if (tows.has(airframe)) {
    return tows.get(airframe);
  }
  const h = Object.prototype.hasOwnProperty.call(HULLS, airframe) ? HULLS[airframe] : null;
  let out = [0, 0, 0.3];
  if (h) {
    let back = Infinity;
    for (const p of h.parts) {
      back = Math.min(back, p.min[0]);
    }
    const root = h.parts[0];
    out = [0, (root.min[2] + root.max[2]) / 2, -back];
  }
  tows.set(airframe, out);
  return out;
}

/* v rotated by the unit quaternion (qx, qy, qz, qw), into out at `at`. */
function rotate(qx, qy, qz, qw, vx, vy, vz, out, at) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[at] = vx + qw * tx + (qy * tz - qz * ty);
  out[at + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[at + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

/*
 * link is the room link (src/share/rooms.js). The shell hands the rest in
 * each call; nothing here reaches into it.
 */
export function createRoomCombat(link) {
  let round = { round: 0, state: 'idle', scores: [] };
  let seat = 0;
  let airframe = null;
  let tow = [0, 0, 0.3];
  let paper = null;
  let laidRound = -1;
  let wantLay = false;
  const last = new Float64Array(3);
  let hasLast = false;
  const at = new Float64Array(3);
  let nextSend = 0;
  /* seat -> { frames: [{ t, chains }], cols (the colours chain 0 wore at
   * the newest frame), pieceCols: Map(piece id -> colours) } */
  const peers = new Map();
  /* Each seat's paper as the room holds it: link colours, tow point first. */
  const colours = new Map();
  let owedWas = 0;
  const cuts = []; /* the room's cuts, newest last, for the shell to show */
  const news = [];

  function mine() {
    return round.scores.find((s) => s.seat === seat) || null;
  }

  function out() {
    return round.state !== 'idle' && seat > 0;
  }

  /* A round counting down or on: the only time paper is towed. */
  function live() {
    return round.state === 'countdown' || round.state === 'on';
  }

  /* The room's round, on its every change. */
  function onRound(m) {
    const was = round.state;
    round = m;
    for (const sc of m.scores || []) {
      if (Array.isArray(sc.runs)) {
        colours.set(sc.seat, runsColours(sc.runs));
      }
    }
    if (m.state === 'idle') {
      paper = null;
      laidRound = -1;
      owedWas = 0;
      return;
    }
    follow();
    /* The round is over: every pilot's paper comes off and falls, here and,
     * from this owner's next frames, on every screen. No paper is towed
     * again until the next round lays fresh. */
    if (m.state === 'over' && was !== 'over' && paper) {
      paper.cutTo(0);
    }
    if (m.state === 'countdown' && laidRound !== m.round) {
      wantLay = true;
      laidRound = m.round;
    }
    if (was !== m.state) {
      news.push({ kind: 'round', state: m.state });
    }
  }

  /*
   * This pilot's paper follows the room's list: a capture grows it at the
   * far end by what the room added (a torn streamer grows too, from where
   * it tore), the cap or a cut the room made shortens it, and every link
   * wears its colour.
   */
  function follow() {
    const me = mine();
    if (!me || !Array.isArray(me.runs)) {
      return;
    }
    const owed = runsLinks(me.runs);
    if (paper && paper.attached && owedWas > 0) {
      if (owed > owedWas) {
        paper.extendTo(paper.length() + (owed - owedWas));
      } else if (paper.length() > owed) {
        paper.cutTo(owed);
      }
    } else if (live() && owed > owedWas) {
      /* No paper on the tail (torn, or cut at the knot) and some captured:
       * a new streamer starts on the tail, in the captured colours. */
      wantLay = true;
    }
    owedWas = owed;
    if (paper) {
      paper.setColours(colours.get(seat));
    }
  }

  function onEvent(ev) {
    if (ev.kind !== 'cut' || !out()) {
      return;
    }
    cuts.push(ev);
    if (cuts.length > 32) {
      cuts.shift();
    }
    if (ev.victim === seat && paper) {
      paper.cutTo(ev.keep);
    }
    news.push({ kind: 'cut', ev });
  }

  /* Any binary message a later phase did not take. True when it was ours. */
  function onBinary(bytes) {
    const got = decodeStreamerRelay(bytes);
    if (!got) {
      return false;
    }
    let p = peers.get(got.seat);
    if (!p) {
      p = { frames: [], cols: null, pieceCols: new Map() };
      peers.set(got.seat, p);
    }
    const lastFrame = p.frames[p.frames.length - 1];
    if (!lastFrame || got.t > lastFrame.t) {
      /* A piece this frame is the first to carry came off chain 0 since
       * the frame before: it wears the colours those links wore then. */
      const was = p.cols || colours.get(got.seat) || new Uint8Array([got.seat]);
      const c0 = got.chains.find((c) => c.id === 0);
      const keep = c0 ? c0.n - 1 : 0;
      for (const c of got.chains) {
        if (c.id !== 0 && !p.pieceCols.has(c.id)) {
          const cut = was.slice(keep);
          p.pieceCols.set(c.id, cut.length ? cut : was.slice(-1));
        }
      }
      for (const id of [...p.pieceCols.keys()]) {
        if (!got.chains.some((c) => c.id === id)) {
          p.pieceCols.delete(id);
        }
      }
      p.cols = (colours.get(got.seat) || new Uint8Array([got.seat])).slice(0, Math.max(1, keep));
      p.frames.push({ t: got.t, chains: got.chains });
      if (p.frames.length > FRAMES_KEPT) {
        p.frames.shift();
      }
    }
    return true;
  }

  /* This pilot's seat and aircraft, on a welcome and on every profile. */
  function seated(s, af) {
    seat = s;
    if (af !== airframe) {
      airframe = af;
      tow = towPoint(af);
    }
  }

  function lay(px, py, pz, qx, qy, qz, qw, v, groundAt) {
    rotate(qx, qy, qz, qw, tow[0], tow[1], tow[2], at, 0);
    at[0] += px;
    at[1] += py;
    at[2] += pz;
    const speed = Math.hypot(v[0], v[1], v[2]);
    const ground = groundAt ? groundAt(at[0], at[2]) : -Infinity;
    let d;
    if (speed > LAY_MOVING_MPS) {
      d = [-v[0] / speed, -v[1] / speed, -v[2] / speed];
    } else if (at[1] - ground > LAY_HANG_M) {
      d = [0, -1, 0];
    } else {
      const f = new Float64Array(3);
      rotate(qx, qy, qz, qw, 0, 0, 1, f, 0);
      const l = Math.hypot(f[0], f[2]) || 1;
      d = [f[0] / l, 0, f[2] / l];
    }
    const me = mine();
    const links = round.state === 'countdown' || !me ? FULL_LINKS : me.owed;
    paper = paper || new Streamer();
    paper.lay(at[0], at[1], at[2], d[0], d[1], d[2], links, groundAt, speed > LAY_MOVING_MPS ? v : null);
    owedWas = links;
    paper.setColours(colours.get(seat) || [seat]);
    last.set(at);
    hasLast = true;
  }

  /*
   * One plant step, the aircraft's pose at its end in the scene's world
   * (position, the Three.js quaternion, velocity [3]). groundAt(x, z) is
   * the ground's height.
   */
  function step(px, py, pz, qx, qy, qz, qw, v, groundAt) {
    if (!out()) {
      return;
    }
    /* Between rounds only the pieces fall; nothing is laid. */
    if (!live()) {
      if (paper) {
        paper.step(px, py, pz, groundAt);
      }
      return;
    }
    if (!paper || wantLay) {
      wantLay = false;
      lay(px, py, pz, qx, qy, qz, qw, v, groundAt);
      return;
    }
    rotate(qx, qy, qz, qw, tow[0], tow[1], tow[2], at, 0);
    at[0] += px;
    at[1] += py;
    at[2] += pz;
    if (hasLast && Math.hypot(at[0] - last[0], at[1] - last[1], at[2] - last[2]) > TELEPORT_M) {
      lay(px, py, pz, qx, qy, qz, qw, v, groundAt);
      return;
    }
    last.set(at);
    paper.step(at[0], at[1], at[2], groundAt);
  }

  /*
   * A frame in which the plant did not step (perched, held, a menu): the
   * paper still hangs and falls, stepped on its own 1 ms accumulator with
   * the aircraft where it stands, at most IDLE_MAX_STEPS a frame. The tow
   * point does not move, so how the milliseconds are cut into frames
   * changes nothing.
   */
  let idleAcc = 0;
  function idle(ms, px, py, pz, qx, qy, qz, qw, groundAt) {
    if (!out()) {
      return;
    }
    idleAcc = Math.min(IDLE_MAX_STEPS, idleAcc + ms);
    const n = Math.floor(idleAcc);
    idleAcc -= n;
    for (let i = 0; i < n; i += 1) {
      step(px, py, pz, qx, qy, qz, qw, STILL, groundAt);
    }
  }

  /* Once a frame: this pilot's frame to the room when one is due. */
  function send(roomNow) {
    if (!out() || !paper || roomNow == null || roomNow < nextSend) {
      return;
    }
    nextSend = Math.max(nextSend + 1000 / STREAMER_HZ, roomNow - 1000 / STREAMER_HZ);
    link.sendBinary(encodeStreamer(roomNow, paper.chains()));
  }

  /* A peer's chains at room time t: each node carried along its velocity
   * between the last two frames, the pieces matched by id. */
  function peerChains(p, t) {
    const n = p.frames.length;
    if (!n) {
      return [];
    }
    const b = p.frames[n - 1];
    const a = n > 1 ? p.frames[n - 2] : null;
    const dt = Math.min(EXTRAP_MAX_MS, Math.max(-1000, t - b.t));
    const span = a ? b.t - a.t : 0;
    const outChains = [];
    for (const cb of b.chains) {
      const ca = a && span > 0 ? a.chains.find((c) => c.id === cb.id) : null;
      if (!ca || dt <= 0) {
        outChains.push(cb);
        continue;
      }
      p.scratch ??= new Map();
      let x = p.scratch.get(cb.id);
      if (!x || x.length !== cb.x.length) {
        x = new Float64Array(cb.x.length);
        p.scratch.set(cb.id, x);
      }
      const k = dt / span;
      const m = Math.min(ca.n, cb.n);
      for (let i = 0; i < cb.n * 3; i += 1) {
        x[i] = i < m * 3 ? cb.x[i] + (cb.x[i] - ca.x[i]) * k : cb.x[i];
      }
      outChains.push({ id: cb.id, n: cb.n, x });
    }
    return outChains;
  }

  /*
   * Once a frame, the ribbons: layer is src/render/streamers.js's, own the
   * pilot's drawn pose { px..qw } (null when not flying), peerPose(seat)
   * the pose a peer is drawn at now or null, peerAirframe(seat) its
   * aircraft, roomNow the room clock, t seconds for the flutter.
   */
  function draw(layer, own, peerPose, peerAirframe, roomNow, t) {
    if (!out()) {
      return;
    }
    if (paper && own) {
      rotate(own.qx, own.qy, own.qz, own.qw, tow[0], tow[1], tow[2], at, 0);
      const anchor = [own.px + at[0], own.py + at[1], own.pz + at[2]];
      for (const c of paper.chains()) {
        layer.draw(seat, c.col.length ? c.col : [seat], c.id, c.x, c.n, t, c.id !== 0, c.id === 0 ? anchor : null);
      }
    }
    for (const [s, p] of peers) {
      const pose = peerPose(s);
      if (!pose || roomNow == null) {
        continue;
      }
      const pt = towPoint(peerAirframe(s));
      rotate(pose.qx, pose.qy, pose.qz, pose.qw, pt[0], pt[1], pt[2], at, 0);
      const anchor = [pose.px + at[0], pose.py + at[1], pose.pz + at[2]];
      const own = colours.get(s) || [s];
      for (const c of peerChains(p, roomNow)) {
        const cols = c.id === 0 ? own : (p.pieceCols.get(c.id) || [s]);
        layer.draw(s, cols, c.id, c.x, c.n, t, c.id !== 0, c.id === 0 ? anchor : null);
      }
    }
  }

  return {
    onRound,
    onEvent,
    onBinary,
    seated,
    step,
    idle,
    send,
    draw,
    out,
    round: () => round,
    seat: () => seat,
    mine,
    paper: () => paper,
    /* What happened since the shell last asked: round changes and cuts. */
    news: () => news.splice(0, news.length),
    leave(s) {
      peers.delete(s);
    },
    clear() {
      round = { round: 0, state: 'idle', scores: [] };
      paper = null;
      laidRound = -1;
      owedWas = 0;
      peers.clear();
      colours.clear();
      cuts.length = 0;
    },
    start(minutes) {
      link.send({ type: 'combat', op: 'start', minutes });
    },
    stop() {
      link.send({ type: 'combat', op: 'stop' });
    },
    /* For the checks: every peer's newest frame as drawn chains. */
    peerChains(s, t) {
      const p = peers.get(s);
      return p ? peerChains(p, t) : [];
    },
    cuts: () => cuts.slice(),
    /* For the checks: each seat's paper as the room holds it, as runs. */
    runs(s) {
      const sc = round.scores.find((x) => x.seat === s);
      return sc && sc.runs ? sc.runs.map((r) => r.slice()) : null;
    },
  };
}
