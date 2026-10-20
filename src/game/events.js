/*
 * events.js: the gameplay event log, one per flight (docs/redesign/
 * COMPLETENESS.md item 25, PLAN.md phase 22).
 *
 * What happened in a flight was told six ways with six vocabularies (the
 * recorder's event(), audio.event, RunWatch's method calls, the war's room
 * messages, the war server's log, stats.js). This is the one stream the
 * consumers read: progression's counters (phase 11) and every
 * achievement (src/game/progress.js awardFlight, item 28), the debrief
 * (phase 10), the replay's events to come. It
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
 *   spawned       a new flight (src/main.js resetCraft, Progress.startFlight),
 *                 and the craft put somewhere by a developer hook
 *                 (__placeCraft): a lap across either is no best
 *   seated {airframe, fixedWing, power, smallestPack, crashed}
 *                 a new run key (Progress.startRun): the aircraft, its
 *                 power's kind ('electric', 'glow' or null) and whether
 *                 it is on its smallest pack or tank, and whether the
 *                 crash flag was up as it was seated; the challenges
 *                 start over on it (progress.js challengeRun)
 *   gate, lap     the shell's calls into Progress (src/ui/progress-ui.js);
 *                 a lap carries {ms, airframe, medal, kind, course, n,
 *                 of}, the medal it reached on a course with medals or
 *                 null, its course's kind, 'casual', 'built' or 'map'
 *                 (src/game/progress.js courseKind) (a lesson judges
 *                 both, src/game/training.js), its course's key, and its
 *                 place in a solo run of `of` laps (null in a room): the
 *                 bests are read from these (progress.js bestsOf)
 *   lap_void {ms, reason}
 *                 a lap the run's race log keeps that progression does
 *                 not count (src/main.js voidRaceLap, testLap): a lap
 *                 voided, ms null and reason why ('wreck', 'swap',
 *                 'weight', 'replay', src/game/race.js voidLap), or a lap
 *                 flown on a builder's test flight off a casual track, ms
 *                 its time and reason 'test'; with `lap`, the rows of
 *                 race.js's log in order, which a race's debrief reads
 *                 (src/game/debrief.js fromRace); nothing pays one
 *   touch {kind}  the same; a contact the shell reports every step is one
 *                 event per kind per run of contact (see append)
 *   crash {airframe}
 *                 the crash flag's rising edge (Progress.tick)
 *   bail {cause}  a freestyle bail, every one the scorer counts (src/game/
 *                 score.js crash, src/main.js scoreCrash): a crash
 *                 ('crash'), a wreck ('wreck') or a hard bounce off the
 *                 ground ('bounce'), which the crash flag's edge, `crash`,
 *                 is not; freestyle's debrief counts these (debrief.js
 *                 fromFree)
 *   trick {id, score}
 *                 a trick or figure the freestyle scorer took (score.js
 *                 land, from the trick judge, src/game/trickdetect.js and
 *                 figuredetect.js): id its name, score its points (net)
 *   engine_out, battery_low
 *                 the engine quitting with fuel in the tank, and LOW
 *                 BATTERY on electric power, each once a run, as
 *                 RunWatch detects them (Progress.tick)
 *   landing {airframe, airMs}
 *                 RunWatch's landing: down and whole after a real flight,
 *                 on the run's aircraft (progression counts landings,
 *                 crashes and laps per aircraft, src/game/progress.js
 *                 foldEvents); airMs the flight's time in the air, from
 *                 its take off to this touchdown, which the aircraft
 *                 challenges read (progress.js aircraftChallengesOf)
 *   kill {airframe, victim, mission}
 *                 an attacker the war's room credited to this pilot's
 *                 warhead (edge/rooms/war.js dead `credited`, read by
 *                 src/share/roomwar.js), victim its kind, mission the
 *                 war's (null when the view had none); one a victim,
 *                 so a blast that took two is two (src/main.js,
 *                 Progress.killed; counted per aircraft like a landing)
 *   contact {track, held}
 *                 the avionics camera's primary track seen (held true)
 *                 or no longer (held false), track its id: one event an
 *                 edge, never a frame (src/main.js avionicsFrame,
 *                 Progress.contact; src/game/training.js heldTrack); a
 *                 lesson times the hold between them
 *   round {game, world}
 *                 a Streamer Combat round or a Catch the Ace! match
 *                 ended by the room with this pilot seated (src/main.js,
 *                 Progress.roundFinished), with {points}, this pilot's in
 *                 the room's final standings; a room race this pilot
 *                 finished, game 'race', carried {pilots} too, how many
 *                 were on its grid (a stored log's, since the race left)
 *   mission_start {mission, airframe}
 *                 a Defend the Paraná war seen begun, with no result yet,
 *                 in this pilot's room (src/ui/campaign.js observe); The
 *                 Interior logs none yet, its client has no start hook
 *   mission_end {mission, won, stars, airframe}
 *                 a mission's result applied to the save
 *                 (src/ui/campaign.js, src/ui/opscampaign.js); both
 *                 counted per aircraft like a landing. An Interior
 *                 match's carries {match, state, earned, paid} too: the
 *                 room's id for it, 'won', 'lost' or 'ended', the star
 *                 ids the room gave it (stars is what they paid, fewer
 *                 after a restart) and whether this entry paid it; logged
 *                 before its debrief shows, which reads it (debrief.js
 *                 fromOps), and logged unpaid (paid false, counted by
 *                 nothing) for a match already paid by its uid or not
 *                 this seat's to be paid
 *
 *   found {world, id}
 *                 a named place of the world flown into (src/game/
 *                 discovery.js, Progress.lookForPlaces), once a flight
 *
 * The rest of the vocabulary (objective, stage, hit, joined, left, and
 * the war's rounds) is the war's and the rooms', named now so their
 * producers add rows, not words.
 *
 * Every achievement is paid from this log by one fold (progress.js
 * awardFlight), never from the call that logged the event: a log folded
 * afterwards pays what the flight paid, once. A frame's state is not an
 * event, so RunWatch still reads the frames, and what it finds (a
 * landing, the engine quitting, LOW BATTERY) is logged as one.
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
  'mission_start', 'mission_end', 'contact', 'seated', 'engine_out', 'battery_low', 'found',
  'lap_void', 'bail', 'trick',
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
