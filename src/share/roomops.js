/*
 * roomops.js: the client's half of an ops mission (docs/campaign/interior/
 * CONTRACT-P0.md; the room's half is edge/rooms/ops.js). A sibling of
 * roomwar.js: it keeps what the room has said and says what the pilot
 * does, and owns nothing the room owns. The room judges every contact,
 * capture, role and stage; this module never decides one.
 *
 * What the shell reads: view() (the room's view, section 4.1, as last
 * heard), seat(), mission() (the mission's data, for its items and roles),
 * takeEvents() (what changed since it last asked: the state, the stage,
 * the cues, each new capture, each contact discovered or classified, each
 * refusal). What it sends: start and end and lock (the host's), cam (two a
 * second, an aim point), capture, take, active, swap, swapAccept,
 * swapDecline.
 *
 * Pure: no DOM, no timers, no three.js, the room clock handed in, so a
 * check in Node drives it against the real room.
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

import { MISSIONS } from './ops/missions.js';

/* Camera reports: two a second (CONTRACT-P0.md 3; the room keeps one per
 * CAM_MIN_MS = 400 ms and text shares 5 a second per seat). */
export const CAM_EVERY_MS = 500;

const ON = new Set(['briefing', 'countdown', 'live']);
const LOBBY = { state: 'lobby' };

/* send(obj) puts one text message on the room's socket. */
export function createRoomOps(send) {
  let seat = null;
  let room = null;
  /* The host's seat as the welcome said; the shell's room link knows
   * later changes. */
  let host = null;
  let view = LOBBY;
  let events = [];
  let lastCamT = -Infinity;

  /* A new view against the old: the events a screen tells. */
  function diff(was, now) {
    if (was.state !== now.state) {
      events.push({
        type: 'state', from: was.state, to: now.state, why: now.why ?? null,
      });
    }
    const stageWas = was.stage ? `${was.stage.id}@${was.stage.at}` : null;
    const stageNow = now.stage ? `${now.stage.id}@${now.stage.at}` : null;
    if (stageNow && stageNow !== stageWas) {
      events.push({
        type: 'stage', id: now.stage.id, n: now.stage.n, at: now.stage.at, title: now.stage.title ?? null,
      });
    }
    const old = new Map((was.contacts ?? []).map((c) => [c.id, c]));
    for (const c of now.contacts ?? []) {
      const o = old.get(c.id);
      if (c.cls && (!o || !o.cls)) {
        events.push({ type: 'discovered', id: c.id, cls: c.cls });
      } else if (o && o.cls && c.cls && c.cls !== o.cls) {
        events.push({
          type: 'classified', id: c.id, from: o.cls, to: c.cls, label: c.label ?? null,
        });
      }
    }
    const had = (was.captures ?? []).length;
    if (was.id === now.id) {
      for (const cap of (now.captures ?? []).slice(had)) {
        events.push({ type: 'captured', ...cap, mine: cap.seat === seat });
      }
    }
  }

  function adopt(next) {
    const was = view.id === next.id ? view : LOBBY;
    view = next;
    diff(was, next);
  }

  const say = (op, fields = {}) => send({ type: 'ops', op, ...fields });

  return {
    onWelcome(w) {
      seat = w.seat;
      room = w.code ?? null;
      host = w.host ?? null;
      view = w.ops || LOBBY;
      events = [];
      lastCamT = -Infinity;
    },
    /* A room message this module owns. Returns true when it was one. */
    onMessage(m) {
      if (!m || m.type !== 'ops') {
        return false;
      }
      if (m.error) {
        events.push({ type: 'error', error: m.error, why: m.why ?? null });
      } else if (m.ops) {
        adopt(m.ops);
      } else if (m.op === 'cue') {
        for (const c of m.cues || []) {
          events.push({ type: 'cue', ...c });
        }
      }
      return true;
    },
    view: () => view,
    seat: () => seat,
    room: () => room,
    /* The mission's data this build has, or null. */
    mission: () => (view.mission ? MISSIONS[view.mission] ?? null : null),
    missionOf: (id) => MISSIONS[id] ?? null,
    on: () => ON.has(view.state),
    live: () => view.state === 'live',
    /* The match's identity: its room and number. */
    match: () => (view.id != null ? `${room}:${view.id}` : null),
    hostSeat: () => host,
    takeEvents() {
      const out = events;
      events = [];
      return out;
    },

    start(mission, { intro = true, from = null } = {}) {
      say('start', { mission, intro, ...(from ? { from } : {}) });
    },
    end() {
      say('end');
    },
    lock(on) {
      say('lock', { on: Boolean(on) });
    },
    /*
     * The camera, when two a second allow: t room ms, aim [x, y, z] ops
     * frame, tanHalf, aspect. Returns whether it was sent.
     */
    cam(t, aim, tanHalf, aspect) {
      if (!ON.has(view.state) || t < lastCamT + CAM_EVERY_MS) {
        return false;
      }
      if (!aim.every(Number.isFinite) || !(tanHalf > 0) || !(aspect > 0)) {
        return false;
      }
      lastCamT = t;
      say('cam', {
        t: Math.round(t), aim: aim.map((c) => Math.round(c * 100) / 100), tanHalf, aspect,
      });
      return true;
    },
    /* A capture message from src/avionics/capture.js's still(). */
    capture(msg) {
      send(msg);
    },
    /* The films this pilot watched to their end, { id: version }
     * (CONTRACT-P0.md 3 `seen`): the host's skip waits on everybody's. */
    seen(films) {
      say('seen', { films });
    },
    /* The host's end of the briefing for everybody, once every pilot here
     * has seen its film (refused 'unwatched' otherwise). */
    skipIntro() {
      say('skipIntro');
    },
    take(role) {
      say('take', { role });
    },
    active(key) {
      say('active', { key });
    },
    swap(other, give, take) {
      say('swap', { seat: other, give: give ?? null, take: take ?? null });
    },
    swapAccept(id) {
      say('swapAccept', { id });
    },
    swapDecline(id) {
      say('swapDecline', { id });
    },
    /* Out of the room: nothing of it is kept. */
    clear() {
      seat = null;
      room = null;
      host = null;
      view = LOBBY;
      events = [];
      lastCamT = -Infinity;
    },
  };
}
