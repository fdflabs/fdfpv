/*
 * voice.js: the room's side of voice chat, which is signalling and nothing
 * else. The audio itself goes pilot to pilot over WebRTC (src/share/voice.js)
 * and never touches this server, so there is nothing here to record.
 *
 * Every message is { type: 'voice', op, ... }, a JSON type a build from
 * before voice passes over (src/share/rooms.js hands unknown types to its
 * onMessage, and main.js ignores what no module claims). From a seated
 * pilot:
 *
 *   { op: 'on' }                        voice is on here, links with me start over
 *   { op: 'on', to }                    the same, to one seat: the answer to an on
 *   { op: 'off' } / { op: 'off', to }   voice is off here, drop your link with me
 *   { op: 'offer', to, n, sdp, relay }  a WebRTC offer for link n; relay is
 *                                       the TURN relay's transport for this try,
 *                                       RELAY_NONE, RELAY_UDP or RELAY_TCP
 *   { op: 'answer', to, n, sdp }        its answer
 *   { op: 'ice', to, n, c }             a candidate gathered after the offer or
 *                                       answer went: c is { candidate, sdpMid,
 *                                       sdpMLineIndex }
 *   { op: 'turn' }                      the ICE servers to use, answered to the
 *                                       sender alone as { op: 'turn', ice, ttl }
 *
 * The room passes each on to its seat, or to every seat for an on or an
 * off without `to`, with `from` in the sender's place. It is rebuilt from
 * the checked fields, so nothing else a client wrote is ever passed on.
 *
 * ONLY INSIDE THE ROOM, AND NEVER PAST A MUTE. The seat named must be a
 * pilot in this room. Nothing passes between two pilots when either has
 * muted the other (edge/rooms/safety.js keeps each seat's mute set, and a
 * report mutes too), except an off, which only ever ends a link. So a muted
 * pilot cannot even start a link, whatever their client does.
 *
 * THE RATE. Signalling has an allowance of its own, VOICE_PER_S, apart from
 * the clock's and the rest (core.js), because a pilot turning voice on in a
 * full public room makes fifteen links at once, and chat said then must not
 * be dropped for it. The client paces itself well under it (src/share/voice.js
 * SEND_PER_S; rooms:selftest checks the two agree).
 *
 * THE TURN RELAY. `turn` is what the platform gave the room: a function
 * minting short lived TURN credentials (edge/rooms/turn.js, from TURN_SECRET
 * and TURN_URLS on the VM), or null where there is none (do.js, the
 * selftests, a VM without coturn). Without it the answer is an empty list
 * and the pilots connect peer to peer through STUN alone.
 *
 * WHAT IS KEPT: the rate counter on the seat record, in memory. Nothing
 * else, nowhere.
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
  RELAY_NONE, RELAY_TCP, RELAY_UDP, VOICE_CAND_MAX, VOICE_LINK_MAX, VOICE_OPS, VOICE_PER_S, VOICE_SDP_MAX,
} from '../../src/share/roomwire.js';

export { VOICE_PER_S };

/* Neither of the two has muted the other. */
function hearing(a, b) {
  return !(a.muted && a.muted.includes(b.token)) && !(b.muted && b.muted.includes(a.token));
}

/* A candidate as the browser gave it, checked field by field, or null. */
function checkCandidate(c) {
  if (!c || typeof c !== 'object' || typeof c.candidate !== 'string' || c.candidate.length > VOICE_CAND_MAX) {
    return null;
  }
  const mid = c.sdpMid == null ? null : c.sdpMid;
  const line = c.sdpMLineIndex == null ? null : c.sdpMLineIndex;
  if (mid !== null && (typeof mid !== 'string' || mid.length > 16)) {
    return null;
  }
  if (line !== null && !(Number.isInteger(line) && line >= 0 && line < 16)) {
    return null;
  }
  return { candidate: c.candidate, sdpMid: mid, sdpMLineIndex: line };
}

/* What a checked message passes on, without `to`, or null for a bad one. */
function body(msg) {
  const { op } = msg;
  if (op === 'on' || op === 'off') {
    return { type: 'voice', op };
  }
  if (!(Number.isInteger(msg.n) && msg.n >= 0 && msg.n <= VOICE_LINK_MAX)) {
    return null;
  }
  if (op === 'ice') {
    const c = checkCandidate(msg.c);
    return c ? { type: 'voice', op, n: msg.n, c } : null;
  }
  if (typeof msg.sdp !== 'string' || !msg.sdp || msg.sdp.length > VOICE_SDP_MAX) {
    return null;
  }
  return op === 'offer'
    ? { type: 'voice', op, n: msg.n, sdp: msg.sdp, relay: [RELAY_UDP, RELAY_TCP].includes(msg.relay) ? msg.relay : RELAY_NONE }
    : { type: 'voice', op, n: msg.n, sdp: msg.sdp };
}

export class RoomVoice {
  /* turn: () => { ice: [{ urls, username, credential }], ttl } or null. */
  constructor(turn = null) {
    this.turn = turn;
  }

  message(core, conn, s, msg, now) {
    s.voiceRate ??= { since: now, n: 0 };
    if (now - s.voiceRate.since >= 1000) {
      s.voiceRate.since = now;
      s.voiceRate.n = 0;
    }
    s.voiceRate.n += 1;
    if (s.voiceRate.n > VOICE_PER_S || !VOICE_OPS.includes(msg.op)) {
      return [];
    }
    if (msg.op === 'turn') {
      const got = this.turn ? this.turn(now) : null;
      return [{ send: conn, data: JSON.stringify({ type: 'voice', op: 'turn', ice: got ? got.ice : [], ttl: got ? got.ttl : 0 }) }];
    }
    const out = body(msg);
    if (!out) {
      return [];
    }
    const data = JSON.stringify({ ...out, from: s.seat });
    const everyone = msg.to === undefined && (msg.op === 'on' || msg.op === 'off');
    if (!everyone && !Number.isInteger(msg.to)) {
      return [];
    }
    const actions = [];
    for (const [other, t] of core.seats) {
      if (other === conn || (!everyone && t.seat !== msg.to)) {
        continue;
      }
      if (msg.op === 'off' || hearing(s, t)) {
        actions.push({ send: other, data });
      }
    }
    return actions;
  }
}
