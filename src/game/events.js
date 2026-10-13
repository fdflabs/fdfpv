/*
 * events.js: the gameplay event log, one per flight (docs/redesign/
 * COMPLETENESS.md item 25, PLAN.md phase 22).
 *
 * What happened in a flight was told six ways with six vocabularies (the
 * recorder's event(), audio.event, RunWatch's method calls, the war's room
 * messages, the war server's log, stats.js). This is the one stream the
 * consumers to come read: the debrief (phase 10), progression's counters
 * (phase 11), the challenges as rows (phase 14), the replay's events. It
 * is a log that consumers fold, deliberately not a pub/sub of callbacks,
 * so a debrief and a replay read the same facts in the same order.
 *
 * An event is { seq, type, simMs, roomMs, ...data }: `seq` its place in
 * the flight, `simMs` the sim clock (the plant's, which a dropped frame
 * does not move), `roomMs` the room clock (src/share/roomclock.js) when
 * the flight is in a room and the clock is known, else null. `type` is
 * one of EVENT_TYPES and nothing else; data values are numbers, strings,
 * booleans or null, so a log is JSON as it stands. A producer that breaks
 * either rule is a bug and throws.
 *
 * PRODUCERS today, each a line at a call site that already existed:
 *
 *   spawned       a new flight (src/main.js resetCraft, Progress.startFlight)
 *   gate, lap     the shell's calls into Progress (src/ui/progress-ui.js);
 *                 a lap carries {ms, airframe, medal}, the medal it
 *                 reached on a course with medals or null (a lesson
 *                 judges it, src/game/training.js)
 *   touch {kind}  the same; a contact the shell reports every step is one
 *                 event per kind per run of contact (see append)
 *   crash {airframe}
 *                 the crash flag's rising edge (Progress.tick)
 *   landing {airframe}
 *                 RunWatch's landing: down and whole after a real flight,
 *                 on the run's aircraft (progression counts landings,
 *                 crashes and laps per aircraft, src/game/progress.js
 *                 foldEvents)
 *   round {game, world}
 *                 a Streamer Combat round or a Catch the Ace! match
 *                 ended by the room with this pilot seated (src/main.js,
 *                 Progress.roundFinished)
 *   mission_end {mission, won, stars}
 *                 a mission's result applied to the save
 *                 (src/ui/campaign.js, src/ui/opscampaign.js)
 *
 * The rest of the vocabulary (objective, stage, kill, hit, joined, left,
 * mission_start, and the war's rounds) is the war's and the rooms', named now so their
 * producers add rows, not words.
 *
 * RunWatch reads it first: Progress appends gate and lap here and hands
 * RunWatch the event (feedRunWatch), so those challenges are judged from
 * what the log says happened. A touch is logged and told to RunWatch
 * directly, because the log keeps one per run of contact and a new run
 * key (Progress.startRun) inside that run must still hear of it. Its once
 * a frame tick stays a direct call: a frame's state is not an event. A
 * log folded afterwards (feedRunWatch over every event) gives the same
 * answers within one run key.
 *
 * Pure: no DOM, no storage, no clock of its own. The check runs it in
 * Node (scripts/events-selftest.js).
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

export const EVENT_TYPES = Object.freeze([
  'spawned', 'gate', 'lap', 'touch', 'crash', 'landing',
  'objective', 'stage', 'kill', 'hit', 'round', 'joined', 'left',
  'mission_start', 'mission_end',
]);
const KNOWN = new Set(EVENT_TYPES);
/* Fields an event carries itself; data may not overwrite them. */
const OWN = new Set(['seq', 'type', 'simMs', 'roomMs']);

function plainValue(v) {
  return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

export class EventLog {
  /* `roomNow`: the room clock now, ms or null, for a flight in a room. */
  constructor({ roomNow = null } = {}) {
    this.roomNow = roomNow;
    this.events = [];
    this.ended = false;
    this.endSimMs = null;
    /* Touch kinds already logged since the last other event. */
    this.touching = new Set();
  }

  /*
   * Appends one event and returns it, frozen; or null for a touch of a
   * kind already logged since the last other event. The shell reports a
   * contact every physics step it lasts (src/main.js resolveFace and the
   * canopy), a thousand a second against a roof, and a repeat says nothing
   * a fold can use: nothing between them changed what a touch means.
   */
  append(type, simMs, data = {}) {
    if (!KNOWN.has(type)) throw new Error(`events: unknown type ${type}`);
    if (!Number.isFinite(simMs)) throw new Error(`events: ${type} without a sim time`);
    if (this.ended) throw new Error(`events: ${type} after the flight ended`);
    for (const [k, v] of Object.entries(data)) {
      if (OWN.has(k) || !plainValue(v)) throw new Error(`events: ${type}.${k} is not a plain value`);
    }
    if (type === 'touch') {
      if (this.touching.has(data.kind)) return null;
      this.touching.add(data.kind);
    } else {
      this.touching.clear();
    }
    const room = this.roomNow ? this.roomNow() : null;
    const event = Object.freeze({
      ...data, seq: this.events.length, type, simMs, roomMs: Number.isFinite(room) ? room : null,
    });
    this.events.push(event);
    return event;
  }

  /* The flight is over; nothing more is appended. */
  end(simMs) {
    if (this.ended) return;
    this.ended = true;
    this.endSimMs = Number.isFinite(simMs) ? simMs : null;
  }
}

/* What RunWatch (src/game/progress.js) makes of one event: the ids of the
 * challenges it says just came true. A type RunWatch does not judge says
 * nothing. */
export function feedRunWatch(watch, event) {
  if (!event) return [];
  if (event.type === 'gate') return watch.gatePass();
  if (event.type === 'lap') return watch.lap();
  if (event.type === 'touch') watch.touch(event.kind);
  return [];
}
