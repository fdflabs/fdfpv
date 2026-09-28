/*
 * race.js: a room's race, Phase 4 of docs/MULTIPLAYER-PLAN.md. The room
 * is the race director: it holds the track the host loaded, starts a
 * countdown that ends at a room clock time everybody shares, collects each
 * racer's gate passes and finish, and orders the results. Each client
 * scores its own gates exactly as it does alone (src/game/race.js); the
 * room never judges a pass, it only orders what it is told.
 *
 * Private rooms only, and only the host starts a race (the lead's
 * decision; public rooms stay closed until Phase 5).
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
 * the others. A joiner gets the track and the race in its welcome.
 *
 * TIMES. goAt is room clock ms (edge/rooms/core.js roomMs). A racer's
 * times are ms since goAt on the same clock, measured by the racer: the
 * room orders them and does not second guess them, since it cannot see a
 * gate.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. What must survive a hibernation
 * (the track and the race) is handed back as a { store } action and
 * restored from storage by edge/rooms/host.js; readiness is not kept, since
 * a room that slept had nobody in it racing.
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

import { isMapTrack, normalize, toPlain } from '../../src/trackbuilder/model.js';
import { raceGatesOf } from '../../src/builder/course.js';
import { badWordIn } from '../../tracks-api/words.js';
import { orderStandings } from '../../src/share/roomrace.js';

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
     *   results: [...] }
     */
    this.race = null;
    this.nextId = 1;
    /* seat -> track id its world has seated. Memory only. */
    this.ready = new Map();
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.track = saved.track ?? null;
    this.race = saved.race ?? null;
    this.nextId = saved.nextId ?? 1;
  }

  store() {
    return { store: 'race', value: { track: this.track, race: this.race, nextId: this.nextId } };
  }

  /* What a welcome carries about the race. */
  welcome() {
    return { track: this.track, race: this.view() };
  }

  readySeats() {
    return this.track ? [...this.ready].filter(([, id]) => id === this.track.id).map(([seat]) => seat).sort((a, b) => a - b) : [];
  }

  /* The race as every client sees it, or a lobby when there is none. */
  view() {
    const ready = this.readySeats();
    const r = this.race;
    if (!r) {
      return { state: 'lobby', ready };
    }
    return {
      state: r.state,
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
      };
    }));
  }

  broadcast(core, msg) {
    const data = JSON.stringify(msg);
    return [...core.seats.keys()].map((conn) => ({ send: conn, data }));
  }

  changed(core) {
    return [this.store(), ...this.broadcast(core, { type: 'race', race: this.view() })];
  }

  running(now, core) {
    return this.race && this.race.state === 'on' && core.roomMs(now) >= this.race.goAt;
  }

  end(core) {
    this.race.results = this.standings();
    this.race.state = 'results';
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
        return this.broadcast(core, { type: 'race', race: this.view() });
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
      ...this.broadcast(core, { type: 'race', race: this.view() }),
    ];
  }

  start(core, conn, msg, now) {
    const racers = this.readySeats().filter((seat) => [...core.seats.values()].some((t) => t.seat === seat));
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
    /* A pass older than the one already held (a reordered retry) is not
     * news. A lower count at a later time is: a wreck voided the lap. */
    const held = r.progress[s.seat];
    if (held && p.t < held.t) {
      return [];
    }
    r.progress[s.seat] = p;
    const out = [];
    for (const other of core.seats.keys()) {
      if (other !== conn) {
        out.push({ send: other, data: JSON.stringify({ type: 'event', kind: msg.kind, seat: s.seat, race: r.id, ...p }) });
      }
    }
    return out;
  }

  finish(core, s, msg, now) {
    const r = this.race;
    if (!this.running(now, core) || !r.racers.includes(s.seat) || r.out[s.seat]) {
      return [];
    }
    /* A resent finish the room already holds: say the race again, which
     * is the racer's receipt. */
    if (r.finish[s.seat]) {
      return this.broadcast(core, { type: 'race', race: this.view() });
    }
    const p = passOf({ ...msg, gate: 0 }, r.laps);
    if (!p || p.lap !== r.laps) {
      return [];
    }
    r.finish[s.seat] = { ms: p.t, lap: p.lap, points: p.points };
    return [...this.changed(core), ...this.maybeEnd(core)];
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
    return core.seats.size ? this.broadcast(core, { type: 'race', race: this.view() }) : [];
  }

  /* A seat said hello: a racer whose socket dropped is back in. */
  join(core, seat) {
    const r = this.race;
    if (r && r.state === 'on' && r.out[seat] === 'left') {
      delete r.out[seat];
      return this.changed(core);
    }
    return [];
  }

  tick(core, now) {
    const r = this.race;
    if (r && r.state === 'on' && core.roomMs(now) > r.goAt + RACE_MAX_MS) {
      return this.end(core);
    }
    return [];
  }
}
