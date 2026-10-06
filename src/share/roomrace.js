/*
 * roomrace.js: racing together in a room, the client's half (Phase 4 of
 * docs/MULTIPLAYER-PLAN.md; the room's half is edge/rooms/race.js).
 *
 * The room holds the track the host loaded and the race: a countdown to a
 * room clock time goAt that every client shares, the racers (the seats
 * whose world had the track seated when the host pressed start), and the
 * standings. This module keeps the room's copy of both, says what this
 * pilot's part in the race is right now (role), and turns this pilot's
 * gate passes into the messages the room orders. It never touches the
 * physics or the page: the shell (src/main.js) reads role and holdMs to
 * hold the aircraft on the line until goAt, and calls pass() from the same
 * place it hears a gate pass today (src/game/race.js update).
 *
 * TIMES are on the room clock, ms since goAt, not on the sim clock: the
 * plant does not step while an aircraft sits parked (src/main.js frame),
 * so a sim clock started at goAt would not count a pilot's wait on the
 * line, and every client's room clock is the same clock to a few ms
 * (src/share/rooms.js). A pass is stamped at the moment the race says the
 * craft crossed, not at the frame that noticed it: the caller hands in how
 * far the frame's sim time is past the crossing (lagMs).
 *
 * LAPS are this pilot's own count, kept here across the run's resets: a
 * wreck voids the lap in flight (Race.voidLap) and R puts the aircraft
 * back on its slot (Race.reset), and the laps already flown stay flown.
 *
 * Pure: no DOM, no timers, the room clock handed in, so the Node check
 * (scripts/rooms-selftest.js, the race section) drives two of these
 * against edge/rooms/core.js with a real Race each. orderStandings is the
 * one ranking rule, used by the room for the results and here for the
 * live order between the room's updates.
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

/* How often an unanswered finish is sent again. A text message over the
 * room's rate is dropped, not queued (edge/rooms/core.js TEXT_PER_S), and
 * the finish is the one message a race cannot do without. */
export const FINISH_RESEND_MS = 1500;

/*
 * Everybody in a race in order: the finished by their time, then the rest
 * by how far round they are (laps, then gates into the lap, then who got
 * there first), and those who left or retired last. rows are { seat, ms
 * (null until finished), lap, gate, t, out }; returns them sorted with a
 * place each. The live order and the final one are this same rule, so the
 * results never reshuffle what the pilots watched.
 */
export function orderStandings(rows) {
  const sorted = rows.slice().sort((a, b) => {
    if ((a.ms != null) !== (b.ms != null)) {
      return a.ms != null ? -1 : 1;
    }
    if (a.ms != null) {
      return a.ms - b.ms || a.seat - b.seat;
    }
    if (Boolean(a.out) !== Boolean(b.out)) {
      return a.out ? 1 : -1;
    }
    return b.lap - a.lap || b.gate - a.gate || a.t - b.t || a.seat - b.seat;
  });
  return sorted.map((row, i) => ({ ...row, place: i + 1 }));
}

/* send(obj) puts one text message on the room's socket. */
export function createRoomRace(send) {
  let seat = null;
  let track = null;
  let race = { state: 'lobby', ready: [] };
  /* Passes heard from the others since the room's last word: seat -> row. */
  let live = new Map();
  /* This pilot's run in the race with id raceId. */
  let raceId = null;
  let lapsDone = 0;
  let points = 0;
  let finishMsg = null;
  let finishSentAt = -Infinity;
  let retired = false;
  let readySent = null;
  let startTaken = null;
  let resultsTaken = null;
  let error = null;

  function mine() {
    return race.id != null && race.id === raceId;
  }

  function adopt(next) {
    race = next || { state: 'lobby', ready: [] };
    live = new Map();
    if (race.id != null && race.id !== raceId && race.state === 'on') {
      raceId = race.id;
      lapsDone = 0;
      points = 0;
      finishMsg = null;
      finishSentAt = -Infinity;
      retired = false;
    }
  }

  function myRow() {
    return (race.standings || []).find((r) => r.seat === seat) || null;
  }

  const api = {
    onWelcome(w) {
      seat = w.seat;
      track = w.track || null;
      readySent = null;
      adopt(w.race);
      /* A race that was already over, or ours from before a reconnect, is
       * not a new start or a new result to show. */
      if (race.state === 'results') {
        resultsTaken = race.id;
      }
      if (race.state === 'on' && !(race.racers || []).includes(seat)) {
        startTaken = race.id;
      }
    },

    /* A room message this module owns. Returns true when it was one. */
    onMessage(m) {
      if (m.type === 'track') {
        track = m.track || null;
        readySent = null;
        return true;
      }
      if (m.type === 'race') {
        if (m.error) {
          error = m.error;
        } else {
          error = null;
          adopt(m.race);
        }
        return true;
      }
      if (m.type === 'event' && (m.kind === 'gate' || m.kind === 'hoop')) {
        if (race.id === m.race && m.seat !== seat) {
          live.set(m.seat, { lap: m.lap, gate: m.gate, t: m.t, points: m.points });
        }
        return true;
      }
      return false;
    },

    track() {
      return track;
    },
    race() {
      return race;
    },
    seat() {
      return seat;
    },
    /* The last thing the room refused (track_big, none_ready, ...), until
     * the next race message. */
    error() {
      return error;
    },
    laps() {
      return lapsDone;
    },

    /*
     * This pilot's part, now: 'lobby' (no race), 'countdown' and 'racing'
     * (a racer before and after goAt), 'finished', 'out' (retired or gone),
     * 'spectating' (joined after the start, or had no track seated when it
     * began: they wait for the next one), 'results'.
     */
    role(roomNow) {
      if (race.state === 'results') {
        return 'results';
      }
      if (race.state !== 'on') {
        return 'lobby';
      }
      if (!(race.racers || []).includes(seat)) {
        return 'spectating';
      }
      const row = myRow();
      if (finishMsg || (row && row.ms != null)) {
        return 'finished';
      }
      if (retired || (row && row.out)) {
        return 'out';
      }
      return roomNow != null && roomNow >= race.goAt ? 'racing' : 'countdown';
    },

    /* ms to hold the aircraft on the line, 0 when it may fly. */
    holdMs(roomNow) {
      return api.role(roomNow) === 'countdown' && roomNow != null ? Math.max(0, race.goAt - roomNow) : 0;
    },

    /* The countdown of a race this pilot is in, once: the shell puts them
     * on the line when this returns the race. */
    takeStart(roomNow) {
      const role = api.role(roomNow);
      if ((role === 'countdown' || role === 'racing') && startTaken !== race.id) {
        startTaken = race.id;
        return race;
      }
      return null;
    },

    /* A race's results, once, for the results screen. */
    takeResults() {
      if (race.state === 'results' && resultsTaken !== race.id) {
        resultsTaken = race.id;
        return race;
      }
      return null;
    },

    /* Whether this pilot has flown the race's laps. The shell's finish,
     * in place of its own lap count, while it races in a room. */
    done() {
      return mine() && race.laps != null && lapsDone >= race.laps;
    },

    /*
     * A gate the local race just scored. lapDone: the pass closed a lap.
     * gate: gates passed in the lap now running, the start crossing
     * included. gatePoints: a plane's points for this pass (0 for a quad).
     * hoop: it was a sky hoop. lagMs: how far the frame is past the
     * crossing on the sim clock.
     */
    pass({ lapDone, gate, gatePoints = 0, hoop = false, lagMs = 0 }, roomNow) {
      if (api.role(roomNow) !== 'racing' || !mine()) {
        return;
      }
      if (lapDone) {
        lapsDone += 1;
      }
      points += gatePoints;
      const t = Math.max(0, Math.round(roomNow - lagMs - race.goAt));
      if (lapsDone >= race.laps) {
        finishMsg = { type: 'race', op: 'finish', race: race.id, ms: t, lap: lapsDone, points };
        finishSentAt = roomNow;
        send(finishMsg);
        return;
      }
      send({ type: 'event', kind: hoop ? 'hoop' : 'gate', race: race.id, lap: lapsDone, gate, t, points });
    },

    /* Per frame: the finish again until the room has it. */
    frame(roomNow) {
      if (!finishMsg || !mine() || race.state !== 'on') {
        return;
      }
      const row = myRow();
      if (row && row.ms != null) {
        return;
      }
      if (roomNow - finishSentAt >= FINISH_RESEND_MS) {
        finishSentAt = roomNow;
        send(finishMsg);
      }
    },

    /* The pilot left the race (to the title, out of the room). */
    retire(roomNow) {
      const role = api.role(roomNow);
      if (role === 'countdown' || role === 'racing') {
        retired = true;
        send({ type: 'race', op: 'retire', race: race.id });
      }
    },

    /* Whether this pilot's world has the room's track seated, sent when it
     * changes so the host sees who can race. */
    ready(isReady) {
      const want = track && isReady ? track.id : null;
      if (want === readySent) {
        return;
      }
      readySent = want;
      send({ type: 'race', op: 'ready', track: track ? track.id : null, ready: Boolean(want) });
    },

    /* Host only, the room checks. Without its logos, which the room
     * drops anyway (edge/rooms/race.js roomTrack) and which are most of a
     * big document's bytes. */
    loadTrack(doc) {
      send({ type: 'track', doc: { ...doc, branding: { logos: [] } } });
    },
    start(laps) {
      send({ type: 'race', op: 'start', laps });
    },
    end() {
      send({ type: 'race', op: 'end' });
    },

    /* The order now: the room's standings, moved on by the passes heard
     * since, and this pilot's own finish before the room has it. */
    standings() {
      const rows = (race.standings || []).map((r) => {
        const heard = live.get(r.seat);
        if (race.state === 'on' && heard && r.ms == null && !r.out && heard.t >= r.t) {
          return { ...r, ...heard };
        }
        return { ...r };
      });
      if (finishMsg && mine()) {
        const me = rows.find((r) => r.seat === seat);
        if (me && me.ms == null) {
          Object.assign(me, { ms: finishMsg.ms, lap: finishMsg.lap, t: finishMsg.ms, points: finishMsg.points, gate: 0 });
        }
      }
      return race.state === 'on' ? orderStandings(rows) : rows;
    },

    /* Forget the room: out of it now. */
    clear() {
      seat = null;
      track = null;
      adopt(null);
      readySent = null;
      error = null;
    },
  };
  return api;
}
