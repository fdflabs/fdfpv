/*
 * race.js: a room's race, Phase 4 of docs/MULTIPLAYER-PLAN.md. The room
 * is the race director: it holds the track the host loaded, starts a
 * countdown that ends at a room clock time everybody shares, collects each
 * racer's gate passes and finish, and orders the results. Each client
 * scores its own gates exactly as it does alone (src/game/race.js); the
 * room never judges a pass, it only orders what it is told.
 *
 * Only the host starts a race (the lead's decision), in a private room
 * or, since the room browser gave public rooms a host, a public one.
 *
 * What a client sends (JSON text):
 *
 *   { type: 'track', doc }                        host: race this track
 *   { type: 'race', op: 'ready', track, ready }   my world has that track seated
 *   { type: 'race', op: 'start', laps }           host: count down now
 *   { type: 'race', op: 'end' }                   host: results now
 *   { type: 'race', op: 'finish', race, ms, lap, points }
 *   { type: 'race', op: 'retire', race }          left the race
 *   { type: 'event', kind: 'gate'|'hoop', race, lap, gate, t, points }
 *
 * What the room sends: { type: 'track', track } to everybody when the host
 * loads one, { type: 'race', race } (the whole race, small) whenever it
 * changes, and each pass relayed as { type: 'event', kind, seat, ... } to
 * the others; the watchers get all of it too (core.js watch). A joiner
 * gets the track and the race in its welcome, a watcher too.
 *
 * TIMES. goAt is room clock ms (edge/rooms/core.js roomMs). A racer's
 * times are ms since goAt on the same clock, measured by the racer: the
 * room orders them. It cannot see a gate as the racer does, but it holds
 * the racer's poses, and a pass or finish they contradict is not counted
 * (edge/rooms/anticheat.js, the witness): a pass is dropped, a finish
 * retires the racer, and the race's row for it says why (standings `why`,
 * the witness's reason, on a refused row only), so the racer's page shows
 * the retirement instead of resending a finish the room will not take. A
 * claim the poses have not reached yet waits for
 * them (pending), so a pass may be relayed a frame or two after it
 * arrived.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. What must survive a hibernation
 * (the track and the race) is handed back as a { store } action and
 * restored from storage by edge/rooms/host.js; readiness is not kept, since
 * a room that slept had nobody in it racing.
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

import { isMapTrack, normalize, toPlain } from '../../src/trackbuilder/model.js';
import { raceGatesOf } from '../../src/builder/course.js';
import { badWordIn } from '../../tracks-api/words.js';
import { orderStandings } from '../../src/share/roomrace.js';
import { sessionOf } from '../../src/share/modes.js';
import { decodePose } from '../../src/share/roomwire.js';
import { Witness } from './anticheat.js';

/* Long enough for a pilot on a menu to be put on the start line and see
 * the numbers before they fly. */
export const COUNTDOWN_MS = 6000;
export const LAPS_MIN = 1;
export const LAPS_MAX = 10;
/* The plan's cap (section 4). A 150 gate course is 59 kB; the logos, which
 * are the rest of a big document, are dropped below. */
export const TRACK_MAX_BYTES = 64 * 1024;
export const TRACK_NAME_MAX = 80;
/* A race nobody finished or ended is over this long after its start. */
export const RACE_MAX_MS = 30 * 60 * 1000;
const TRACK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/* A pass or a finish as the client reported it, or null when any field
 * is not a sane number. */
function passOf(msg, laps) {
  const lap = msg.lap;
  const gate = msg.gate ?? 0;
  const t = msg.t ?? msg.ms;
  const points = msg.points ?? 0;
  if (!Number.isInteger(lap) || lap < 0 || lap > laps) {
    return null;
  }
  if (!Number.isInteger(gate) || gate < 0 || gate > 999) {
    return null;
  }
  if (!Number.isFinite(t) || t < 0 || t > RACE_MAX_MS) {
    return null;
  }
  if (!Number.isFinite(points) || points < 0 || points > 1e6) {
    return null;
  }
  return { lap, gate, t: Math.round(t), points: Math.round(points) };
}

/*
 * The room's copy of a host's track: the builder's own normalisation (the
 * one the tracks server runs, tracks-api/worker.js), a map track with at
 * least one gate to race, its name through the same word list, and no
 * branding. The logos are images, and an image from somebody's file is
 * free content in a room children fly in; a gate without its sponsor still
 * races the same. Returns { track } or { error }.
 */
export function roomTrack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'bad' };
  }
  let doc;
  try {
    doc = normalize(JSON.parse(JSON.stringify(raw))).doc;
  } catch (e) {
    return { error: 'bad' };
  }
  if (!isMapTrack(doc) || !TRACK_ID_RE.test(String(doc.id))) {
    return { error: 'bad' };
  }
  doc.branding = { logos: [] };
  const name = String(doc.name ?? '').trim().replace(/\s+/g, ' ').slice(0, TRACK_NAME_MAX);
  doc.name = name && !badWordIn(name) && !/[\u0000-\u001f\u007f]/.test(name) ? name : '';
  let gates = 0;
  try {
    gates = raceGatesOf(doc).length;
  } catch (e) {
    /* A document the builder would draw but cannot race. */
    gates = 0;
  }
  if (!gates) {
    return { error: 'nogate' };
  }
  const plain = toPlain(doc);
  if (new TextEncoder().encode(JSON.stringify(plain)).length > TRACK_MAX_BYTES) {
    return { error: 'big' };
  }
  return {
    track: {
      id: plain.id, name: plain.name, map: plain.map, gates, doc: plain,
    },
  };
}

export class RoomRace {
  constructor() {
    this.track = null;
    /*
     * { id, trackId, laps, goAt, racers: [seat], state: 'on'|'results',
     *   progress: { seat: { lap, gate, t, points } },
     *   finish: { seat: { ms, lap, points } }, out: { seat: 'retired'|'left' },
     *   why: { seat: the witness's reason } for a finish it refused,
     *   results: [...] }
     */
    this.race = null;
    this.nextId = 1;
    /* seat -> track id its world has seated. Memory only. */
    this.ready = new Map();
    this.witness = new Witness();
    /* Claims the witness waits on the racer's poses for, in arrival
     * order: { kind, seat, conn, race, at, laps, gate, p, heardAt }.
     * Memory only: a room that slept had nobody racing. */
    this.pending = [];
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.track = saved.track ?? null;
    this.race = saved.race ?? null;
    this.nextId = saved.nextId ?? 1;
    /* A race restored mid way has no count of what was flown before the
     * room slept, so its witness judges nothing until the next race. */
  }

  store() {
    return { store: 'race', value: { track: this.track, race: this.race, nextId: this.nextId } };
  }

  /* What a welcome carries about the race. */
  welcome(core) {
    return { track: this.track, race: this.view(core) };
  }

  readySeats() {
    return this.track ? [...this.ready].filter(([, id]) => id === this.track.id).map(([seat]) => seat).sort((a, b) => a - b) : [];
  }

  /* The race as every client sees it, or a lobby when there is none, with
   * its named state (modes.js sessionOf) as it stands now. */
  view(core) {
    const v = this.shown();
    return { ...v, session: sessionOf('race', v, core.roomNow()) };
  }

  shown() {
    const ready = this.readySeats();
    const r = this.race;
    if (!r) {
      return { state: 'lobby', ready };
    }
    return {
      state: r.state,
      /* Ended by the room for too few racers here (core.js settleGames). */
      abandoned: Boolean(r.abandoned),
      id: r.id,
      trackId: r.trackId,
      laps: r.laps,
      goAt: r.goAt,
      racers: r.racers,
      ready,
      standings: r.state === 'results' ? r.results : this.standings(),
    };
  }

  /* Everybody in the race, in the one order the room and the clients
   * share (src/share/roomrace.js orderStandings). */
  standings() {
    const r = this.race;
    return orderStandings(r.racers.map((seat) => {
      const f = r.finish[seat];
      const p = r.progress[seat] || { lap: 0, gate: 0, t: 0, points: 0 };
      return {
        seat,
        ms: f ? f.ms : null,
        lap: f ? f.lap : p.lap,
        gate: f ? 0 : p.gate,
        t: f ? f.ms : p.t,
        points: f ? f.points : p.points,
        out: r.out[seat] || null,
        /* A race kept before `why` existed has none. */
        ...(r.why && r.why[seat] ? { why: r.why[seat] } : {}),
      };
    }));
  }

  broadcast(core, msg) {
    return core.everyone(JSON.stringify(msg));
  }

  changed(core) {
    return [this.store(), ...this.broadcast(core, { type: 'race', race: this.view(core) })];
  }

  running(now, core) {
    return this.race && this.race.state === 'on' && core.roomMs(now) >= this.race.goAt;
  }

  end(core, abandoned = false) {
    this.race.results = this.standings();
    this.race.state = 'results';
    this.race.abandoned = abandoned;
    return this.changed(core);
  }

  /* Over when every racer has finished, retired or gone. */
  maybeEnd(core) {
    const r = this.race;
    if (r && r.state === 'on' && r.racers.every((seat) => r.finish[seat] || r.out[seat])) {
      return this.end(core);
    }
    return [];
  }

  /* One text message from seat s. Returns the room's actions. */
  message(core, conn, s, msg, now) {
    const host = s.seat === core.host();
    if (msg.type === 'track') {
      return host ? this.load(core, conn, msg.doc) : [];
    }
    if (msg.type === 'event') {
      return this.pass(core, conn, s, msg, now);
    }
    const r = this.race;
    const on = r && r.state === 'on';
    switch (msg.op) {
      case 'ready': {
        const want = typeof msg.track === 'string' && msg.ready === true ? msg.track : null;
        if ((this.ready.get(s.seat) ?? null) === want) {
          return [];
        }
        if (want) {
          this.ready.set(s.seat, want);
        } else {
          this.ready.delete(s.seat);
        }
        return this.broadcast(core, { type: 'race', race: this.view(core) });
      }
      case 'start':
        return host && !on ? this.start(core, conn, msg, now) : [];
      case 'end':
        return host && on ? this.end(core) : [];
      case 'finish':
        return on && msg.race === r.id ? this.finish(core, s, msg, now) : [];
      case 'retire':
        if (on && msg.race === r.id && r.racers.includes(s.seat) && !r.finish[s.seat] && !r.out[s.seat]) {
          r.out[s.seat] = 'retired';
          return [...this.changed(core), ...this.maybeEnd(core)];
        }
        return [];
      default:
        return [];
    }
  }

  load(core, conn, raw) {
    if (this.race && this.race.state === 'on') {
      return [{ send: conn, data: JSON.stringify({ type: 'race', error: 'busy' }) }];
    }
    const got = roomTrack(raw);
    if (got.error) {
      return [{ send: conn, data: JSON.stringify({ type: 'race', error: `track_${got.error}` }) }];
    }
    this.track = got.track;
    this.race = null;
    this.ready.clear();
    return [
      this.store(),
      ...this.broadcast(core, { type: 'track', track: this.track }),
      ...this.broadcast(core, { type: 'race', race: this.view(core) }),
    ];
  }

  start(core, conn, msg, now) {
    const racers = this.readySeats().filter((seat) => [...core.seats.values()].some((t) => t.seat === seat && !core.failed(t)));
    if (!this.track || !racers.length) {
      return [{ send: conn, data: JSON.stringify({ type: 'race', error: 'none_ready' }) }];
    }
    const laps = Number.isInteger(msg.laps) ? Math.max(LAPS_MIN, Math.min(LAPS_MAX, msg.laps)) : 3;
    this.race = {
      id: this.nextId,
      trackId: this.track.id,
      laps,
      goAt: core.roomMs(now) + COUNTDOWN_MS,
      racers,
      state: 'on',
      progress: {},
      finish: {},
      out: {},
      results: null,
    };
    this.nextId += 1;
    this.witness.start(this.track.doc, this.race.goAt);
    this.pending = [];
    return this.changed(core);
  }

  pass(core, conn, s, msg, now) {
    const r = this.race;
    if ((msg.kind !== 'gate' && msg.kind !== 'hoop') || !this.running(now, core) || msg.race !== r.id) {
      return [];
    }
    if (!r.racers.includes(s.seat) || r.finish[s.seat] || r.out[s.seat]) {
      return [];
    }
    const p = passOf(msg, r.laps);
    if (!p || p.lap >= r.laps) {
      return [];
    }
    return this.claim(core, {
      kind: msg.kind, seat: s.seat, conn, race: r.id, at: r.goAt + p.t, laps: p.lap, gate: p.gate, p, heardAt: core.roomMs(now),
    }, now);
  }

  /* A pass the witness let through, if the race still wants it. */
  takePass(core, c) {
    const r = this.race;
    if (!r || r.state !== 'on' || r.id !== c.race || r.finish[c.seat] || r.out[c.seat]) {
      return [];
    }
    /* A pass older than the one already held (a reordered retry) is not
     * news. A lower count at a later time is: a wreck voided the lap. */
    const held = r.progress[c.seat];
    if (held && c.p.t < held.t) {
      return [];
    }
    r.progress[c.seat] = c.p;
    /* The watchers too: the laps moving in their standings. */
    return core.roster(c.conn, JSON.stringify({ type: 'event', kind: c.kind, seat: c.seat, race: r.id, ...c.p }));
  }

  /* A finish the witness let through, or the racer's retirement when it
   * refused it. */
  takeFinish(core, c, verdict) {
    const r = this.race;
    if (!r || r.state !== 'on' || r.id !== c.race || r.finish[c.seat] || r.out[c.seat]) {
      return [];
    }
    if (verdict !== 'ok') {
      r.out[c.seat] = 'retired';
      r.why = { ...r.why, [c.seat]: verdict };
    } else {
      r.finish[c.seat] = { ms: c.p.t, lap: c.p.lap, points: c.p.points };
    }
    return [...this.changed(core), ...this.maybeEnd(core)];
  }

  /* A claim to the witness, behind any of the same racer's still waiting. */
  claim(core, c, now) {
    this.pending.push(c);
    return this.settle(core, now);
  }

  /* Every waiting claim the witness can now decide, in arrival order; a
   * racer's claims stay in order behind its first that still waits. */
  settle(core, now) {
    const roomNow = core.roomMs(now);
    const waiting = new Set();
    const out = [];
    const keep = [];
    for (const c of this.pending) {
      if (!this.race || this.race.id !== c.race || this.race.state !== 'on') {
        continue;
      }
      const verdict = waiting.has(c.seat) ? 'wait' : this.witness.judge({ ...c, finish: c.kind === 'finish' }, roomNow);
      if (verdict === 'wait') {
        waiting.add(c.seat);
        keep.push(c);
        continue;
      }
      const ok = verdict === 'ok';
      this.witness.record({ seat: c.seat, at: c.at, finish: c.kind === 'finish' }, verdict);
      if (c.kind === 'finish') {
        out.push(...this.takeFinish(core, c, verdict));
      } else if (ok) {
        out.push(...this.takePass(core, c));
      }
    }
    this.pending = keep;
    return out;
  }

  /* A racer's pose, past the room's pose rules (core.js judge): its
   * witness sample, and whatever waiting claim it decides. */
  pose(core, s, bytes, now) {
    const r = this.race;
    if (!r || r.state !== 'on' || !r.racers.includes(s.seat)) {
      return [];
    }
    const p = decodePose(bytes);
    if (!p) {
      return [];
    }
    this.witness.sample(s.seat, s.profile && s.profile.airframe, p, core.roomMs(now));
    return this.pending.length ? this.settle(core, now) : [];
  }

  finish(core, s, msg, now) {
    const r = this.race;
    if (!this.running(now, core) || !r.racers.includes(s.seat) || r.out[s.seat]) {
      return [];
    }
    /* A resent finish the room already holds: say the race again, which
     * is the racer's receipt. */
    if (r.finish[s.seat]) {
      return this.broadcast(core, { type: 'race', race: this.view(core) });
    }
    /* A resent finish the witness is still waiting to judge. */
    if (this.pending.some((c) => c.kind === 'finish' && c.seat === s.seat && c.race === r.id)) {
      return [];
    }
    const p = passOf({ ...msg, gate: 0 }, r.laps);
    if (!p || p.lap !== r.laps) {
      return [];
    }
    return this.claim(core, {
      kind: 'finish', seat: s.seat, conn: null, race: r.id, at: r.goAt + p.t, laps: p.lap, gate: 0, p, heardAt: core.roomMs(now),
    }, now);
  }

  /* A seat's socket closed. A racer is out of the race until the same
   * seat comes back (join), which a dropped socket's token does inside
   * edge/rooms/core.js RESEAT_MS. */
  leave(core, seat) {
    this.ready.delete(seat);
    const r = this.race;
    if (r && r.state === 'on' && r.racers.includes(seat) && !r.finish[seat] && !r.out[seat]) {
      r.out[seat] = 'left';
      return [...this.changed(core), ...this.maybeEnd(core)];
    }
    return core.seats.size ? this.broadcast(core, { type: 'race', race: this.view(core) }) : [];
  }

  /* A seat whose page could not build the room's world (core.js fail):
   * off the grid, and a racer in a race on retired from it. */
  fail(core, seat) {
    this.ready.delete(seat);
    const r = this.race;
    if (r && r.state === 'on' && r.racers.includes(seat) && !r.finish[seat] && !r.out[seat]) {
      r.out[seat] = 'retired';
      return [...this.changed(core), ...this.maybeEnd(core)];
    }
    return this.broadcast(core, { type: 'race', race: this.view(core) });
  }

  /* A seat said hello: a racer whose socket dropped is back in, and a
   * newcomer joins the grid only when `dropIn` (core.js join, the race's
   * modes.js allowDropIn, false: it went off a grid, so it waits). */
  join(core, seat, dropIn = false) {
    const r = this.race;
    if (r && r.state === 'on' && r.out[seat] === 'left') {
      delete r.out[seat];
      return this.changed(core);
    }
    if (r && r.state === 'on' && dropIn && !r.racers.includes(seat)) {
      r.racers.push(seat);
      return this.changed(core);
    }
    return [];
  }

  tick(core, now) {
    const out = this.pending.length ? this.settle(core, now) : [];
    const r = this.race;
    if (r && r.state === 'on' && core.roomMs(now) > r.goAt + RACE_MAX_MS) {
      return [...out, ...this.end(core)];
    }
    return out;
  }
}
