/*
 * war.js: Defend Itaipu, the room's half of the war mode
 * (docs/WARFARE-PLAN.md sections 4 and 5.1). The client's half is
 * src/share/roomwar.js (package C); the attackers' paths are
 * src/share/war/routes.js, which both halves run.
 *
 * The room flies the attackers, judges every detonation, and keeps the
 * output, the rack and the scores:
 *
 *   waves     a mission's waves are born on the room clock at their `at`
 *             after the go, announced BIRTH_LEAD_MS early so every screen
 *             draws them from their first millisecond, each sized by the
 *             match's pilots here then (a pilot seated in a war is one
 *             of its players at once, enlist()); a scripted
 *             attacker's pose is never sent (routes.js), a hunter's is
 *             (AGENTS, 0xA0), because the room steers it at the pilots
 *   warheads  a defender detonates when any part box of it comes within
 *             its fuze radius of an attacker's centre: src/game/midair.js
 *             within, tag's bubble, with the attacker as the Ace. The
 *             radius is the seat's airframe and warhead's
 *             (src/share/war/fuze.js fuzeM, blastOf). It kills the
 *             attacker, the defender, and every other attacker within
 *             the same radius of that attacker's centre then. A hunter
 *             that reaches a pilot is the same test: both go.
 *   output    an attacker alive at the end of its route takes its
 *             target's mw once, when its seeded error left it within the
 *             target's hitR (its r where it has none): it arrives at its
 *             own aim point, the end of its route, never sooner
 *   rounds    a mission's waves are grouped in rounds (a wave's `round`,
 *             0 when it has none; its `at` counts from its round's
 *             start). At a round's start every pilot has the mission's
 *             `airframes` (its `rack` where it names none); every
 *             detonation, crash and lost link spends one of that pilot's,
 *             and every attacker its warhead kills earns it one more for
 *             the round (a swarm of N, N), so a pilot who keeps hitting
 *             keeps flying (a blast on an airframe that never took off
 *             is spent and scores nothing). A pilot who has spent them
 *             all spectates (and cannot go off) until the round ends. A round ends the
 *             instant either every wave of it is born and no attacker of
 *             it is left but Scouts ('win' if the dam took nothing in it,
 *             'damaged' if it did), or no pilot here is still flying with
 *             an airframe it has not spent: each has spent them all, or
 *             is on its last and not flying it (silent over STALE_MS: a
 *             menu, a pause, a dropped link; not off again RESPAWN_MS
 *             after its last loss; or on the ground over GROUND_MS; a
 *             pilot who left is not here at all: stillFlying)
 *             ('lost': every attacker of it still alive with a
 *             target gets through, taking its target as an arrival
 *             would). What is left of it then (Scouts, which leave on
 *             their own, and on a loss Hunters) is cleared as gone. Then
 *             RESULT_MS of result, and the next round
 *   stages    the waves and rounds above are what a mission of rounds
 *             is; a mission is a stage graph (src/share/war/stages.js),
 *             whose stages may be rounds or not, born on time windows,
 *             families and triggers the seed and the judgement decide, and
 *             left by exits to the next stage, a seeded twist, or the end
 *             (enterStage, stageStep). A stage's entry is kept as the
 *             match's checkpoint, which a lost match restarts from
 *   contain   an opening in an intake, a penstock or a gate, in a
 *             mission with a `contain` (src/share/war/contain.js,
 *             MISSIONS.md 1.9), starts a closure: its gantry lowers the
 *             stoplogs for CLOSE_MS, one opening at a time, while the
 *             stage cannot clear; the first group born after it that can
 *             reach the crest is turned at the gantry; the gantry hit
 *             while it closes loses the mission at once (why 'shutdown',
 *             TECH-NEEDS T1.12). The view shows each closure as a hold
 *             objective and names the gantries closing (`contain`)
 *   the end   won when the last round ends with the output at or over
 *             floorMw; lost the instant the output is under it. The view's
 *             rack and rackMax are the airframes the match's pilots have
 *             left this round and could have
 *
 * ONE TIMELINE, JUDGED IN ORDER: tag's (edge/rooms/tag.js). Everything is
 * decided on the room clock over the span every seat heard from in the
 * last WAIT_MS has covered, or LATE_MS behind the room clock, whichever is
 * later: the frontier f. The earliest event wins: a detonation (a tie to
 * the lower seat, then the lower attacker id), a crash, an arrival; then
 * the judgement goes on from there with what is left. The attackers are
 * the room's own samples, so they are never late: a scripted one is
 * sampled from its route on a fixed SAMPLE_MS grid, the same grid on
 * every run, so lag decides nothing; a hunter is sampled where the room
 * stepped it, on the room tick. The judgement runs on the room tick, not
 * on every pose: 30 times a second instead of 30 per pilot, and a tick is
 * as good as a pose for the answer, which is from the samples alone.
 *
 * A DEFENDER THAT WENT OFF is disarmed at once, and armed again only once
 * its own samples have shown it crashed or spawning after the blast and
 * then clean: its plant breaks when its client hears the boom, so the
 * samples between the blast and that are the same airframe, which has
 * already gone. Its crash is the blast's and takes nothing more from the
 * rack. A LOST LINK is the same: the pilot's own client says its airframe
 * is lost (section 6.4, the link down for 3 s), which takes one off the
 * rack and disarms the seat by the same rule, so saying it again, or the
 * wreck that follows, takes nothing more.
 *
 * What a client sends (JSON text): the host only, and in a public room
 * only one made for the war (core.js hostCheck refuses 'private' in any
 * other public one, section 9),
 *
 *   { type: 'war', op: 'start', mission }   count down and fight it
 *   { type: 'war', op: 'start', mission, intro: true }
 *                                           the same after a 'briefing'
 *                                           as long as the mission's film
 *                                           (src/share/war/films,
 *                                           briefingMs), which every
 *                                           screen plays
 *                                           (src/render/warintro.js)
 *   { type: 'war', op: 'start', mission, from: 'checkpoint' }
 *                                           after a loss, that mission
 *                                           again from the stage it was
 *                                           lost in (a countdown, no
 *                                           briefing; RESTART_STARS)
 *
 * A start of a campaign mission not yet released (its `release` in its
 * file, src/share/war/missions; campaign.js released) is refused 'unreleased', whatever the client showed.
 *   { type: 'war', op: 'skipIntro' }        cut the briefing short: the
 *                                           countdown starts now; refused
 *                                           'unwatched' unless every pilot
 *                                           here has seen this film's
 *                                           version (docs/campaign/
 *                                           INTROS.md section 3: a first
 *                                           viewing is never cut)
 *   { type: 'war', op: 'end' }              stop now
 *   { type: 'war', op: 'skip' }             developer mode: the stage
 *                                           left now by its first way
 *                                           on that is not a loss, as
 *                                           if that exit had fired
 *   { type: 'war', op: 'complete', objective? }
 *                                           developer mode: that
 *                                           objective of the stage (all
 *                                           of them unsettled, without
 *                                           one) done now
 *
 * Both developer ops are refused 'public' in a public room and 'dev'
 * unless this server starts missions in development (devMissions) or the
 * host is one of its DEV_ACCOUNTS (core.js devHost): what a client says
 * about itself opens nothing, as a mission won by them would count.
 *
 * and any pilot, about its own seat, while a war is on and it is neither
 * spawning nor already a wreck:
 *
 *   { type: 'war', op: 'lost' }             my airframe is lost
 *   { type: 'war', op: 'ready' }            ready for what comes next
 *                                           (a stage's { ready })
 *
 * and any pilot, any time: { type: 'war', op: 'seen', films: { id:
 * version } }, the films this pilot has watched to the end (kept by
 * token, in memory, as the loadouts are; the view's `seen`); and
 * { type: 'war', op: 'world', map, time }, the world its screen has
 * built and standing, map null for none (by seat, in memory, gone when
 * the seat leaves): a briefing waits WORLD_LEAD_MS only when a pilot
 * here has not said it stands on the mission's (worldsUp). Anything
 * else is refused 'world'.
 *
 * What the room sends, to everybody, its watchers too (core.js watch;
 * their view's result null, core.js watchedView, and so is that of a
 * seat that did not fly the war, flew):
 *
 *   { type: 'war', war }                      the view (view()), on every
 *                                             change and in each welcome;
 *                                             its uid the war's id across
 *                                             every room (warUid), which a
 *                                             page pays a result once by
 *   { type: 'war', op: 'born', agents }       [{ id, kind, route, t0, k,
 *                                             n, err, target, wire?,
 *                                             meet? }], routes.js
 *                                             planAgent's input; wire the
 *                                             room ms it flies into a
 *                                             power line
 *                                             (src/share/war/wires.js),
 *                                             meet the room ms it meets a
 *                                             structure, where it arrives
 *                                             (src/share/war/contact.js);
 *                                             a carrier's child (launch)
 *                                             adds from, the point its
 *                                             route starts at, parent,
 *                                             the carrier's id, and group
 *   { type: 'war', op: 'dead', ids, at, by, why, p }
 *                                             why 'boom' (by the seat),
 *                                             'pierce' (by the seat),
 *                                             'arrive' (by 0, with target
 *                                             and hit), 'leave' (by 0) or
 *                                             'wire' (by 0, on a line);
 *                                             a boom and a pierce carry
 *                                             credited, the ids of those
 *                                             counted as `by`'s kills
 *                                             (none when its airframe
 *                                             never took off), so a
 *                                             client counts exactly the
 *                                             room's;
 *                                             scouts: true on the boom that
 *                                             killed a scout wave's last
 *   { type: 'war', op: 'hurt', ids, hp, at, by, p }
 *                                             a boom that hit these and
 *                                             did not kill them (a kind
 *                                             of more than one hp,
 *                                             routes.js KIND, TECH-NEEDS
 *                                             T1.7): hp each one's left
 *   { type: 'war', op: 'boom', seat, at, p }  a defender detonated: that
 *                                             seat breaks its own craft
 *   { type: 'war', op: 'damage', seq, at, target, chunks, fell, openings,
 *     down, health, p, by }
 *                                             what a warhead broke of one
 *                                             target's structure
 *                                             (src/share/war/damage.js):
 *                                             seq its place in the match's
 *                                             list, chunks the ids removed
 *                                             (fell those that fell after),
 *                                             openings the target's opening
 *                                             when new or bigger (the dam
 *                                             break contract's), down true
 *                                             when it cost the target, p
 *                                             where it went off, by the
 *                                             attacker kind or 'defender',
 *                                             cut the power line spans
 *                                             whose gantry fell; by
 *                                             'hoist' and no chunks: a
 *                                             gate's leaf moved, its
 *                                             holes told again where they
 *                                             now are (leafWatch)
 *   { type: 'war', op: 'cue', cues }          a stage's cues as they fall
 *                                             due, each { at, stage,
 *                                             radio | music | cutaway |
 *                                             text } (stages.js)
 *   { type: 'war', error }                    to a refused sender
 *
 * and AGENTS (0xA0) to each seat on the room tick, thinned by distance on
 * the core's INTEREST bands, and to each watcher unthinned, each followed
 * by HUNTS (0xA1): the same hunters' target seats.
 *
 * DAMAGE. Every warhead that goes off is a blast on the map's structures
 * (src/share/war/damage.js blast): an attacker's at its aim point when it
 * arrives, hit or miss (and when a lost round sends it through), or where
 * it strikes a power line; a defender's where it goes off (a penetrator's
 * first hit goes through and is none). It is decided in the judgement's
 * order, at the judgement's ms, from the positions the room sends (to the
 * millimetre), so the events say what the room decided and nothing else
 * does. What each chunk has taken and which are gone is the match's
 * (wreck), stored with it; each event is kept in order (damage) and sent
 * again, in order, to a pilot who joins, so a late joiner or a reload
 * applies the same list. A target an event costs is lost as a hit loses
 * it (take): its megawatts once.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match (the attackers alive,
 * the output, the rack, the scores, the hunters' saved state) is handed
 * back as a { store: 'war' } action on every change, and to restore() by
 * edge/rooms/host.js after a restart; the samples are memory only, and a
 * scripted attacker's are rebuilt from its route.
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
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, decodePose, encodeAgents, encodeHunts,
} from '../../src/share/roomwire.js';
import {
  LATE_MS, Track, hullDistance, hullFor, poseAt as trackPose, within,
} from '../../src/game/midair.js';
import {
  BLAST_M, KIND, KINDS, hpOf, planAgent, poseAt,
} from '../../src/share/war/routes.js';
import {
  MISSIONS, missionTime, waveSize, waveTarget,
} from '../../src/share/war/missions/index.js';
import {
  RESULT_MS, allBorn, arm, beatOf, crossings, draw, drawSets, dueCues, dueSpawns, enter, exitDue, failedAny, gatesOf, leftBy, nextDue, note, objectives, objectivesView, roundsOf, slotKind, worthOf,
  stagesOf, target as exitTarget, wavesOf,
} from '../../src/share/war/stages.js';
import { madeFor, modeById, sessionOf } from '../../src/share/modes.js';
import { released } from '../../src/game/campaign.js';
import { wireStrike } from '../../src/share/war/wires.js';
import { contactAt } from '../../src/share/war/contact.js';
import { briefingMs, filmFor } from '../../src/share/war/films/index.js';
import { fuzeM } from '../../src/share/war/fuze.js';
import {
  attackerCharge, blast, defenderCharge, healthOf, leafMoved,
} from '../../src/share/war/damage.js';
import { openAt } from '../../src/share/war/hoist.js';
import {
  GANTRIES, TURNS, closureFor, gantriesAt, lastHeld, linesDue, objectivesOf, openAt as containOpen, pausesOf, restartAt, retargetFor, runningAt, shutDue,
} from '../../src/share/war/contain.js';
import { REST, leafTurn } from '../../src/share/war/leaf.js';
import ITAIPU_CHUNKS from '../../src/share/war/itaipu-chunks.js';
import { COUNTDOWN_MS } from './race.js';
import { AHEAD_MS } from './referee.js';
import { WAIT_MS } from './tag.js';
import { POSE_MAX_SPEED } from './safety.js';
import { CLEAR_M as HUNTER_CLEAR_M, Hunters, loadHeight } from './warhunt.js';
import { HERE_MS, interestEvery, watchedView } from './core.js';

export { MISSIONS, RESULT_MS };

/* A scripted attacker's samples: this far apart on the room clock, on
 * multiples of it, whatever the ticks do. The route's curvature between
 * two samples is a few millimetres at 20 ms. */
export const SAMPLE_MS = 20;
/* A wave is announced this long before its birth, so a screen that hears
 * it draws the attacker from its first millisecond. */
export const BIRTH_LEAD_MS = 2000;
/* A carrier's children leave its deck this far over its waterline. */
export const LAUNCH_DECK_M = 2;

/* A carrier's ms between launches for `pilots` pilots: its launch's
 * `every` [s at 1 pilot, s at 8], straight between (MISSIONS.md M5: a solo
 * pilot's every 50 s, eight pilots' every 35 s). */
export function launchEvery(launch, pilots) {
  const [one, eight] = launch.every;
  return Math.round((one + ((eight - one) * (Math.min(8, Math.max(1, pilots)) - 1)) / 7) * 1000);
}

/* An assist: within this of a kill's point, in the ASSIST_MS before it. */
export const ASSIST_M = 50;
export const ASSIST_MS = 3000;

/*
 * A pilot's loadout ({ type: 'war', op: 'loadout', loadout }), before the
 * go: rack, its airframes a round (4 to 6, in place of the mission's
 * base); warhead, one of WARHEADS; speedMul, 1 to 1.15, kept and echoed
 * only (the client flies it). Numbers out of range are clamped (rack
 * rounded); anything else is refused 'loadout'.
 */
export const RACK_MIN = 4;
export const RACK_MAX = 6;
export const SPEED_MUL_MAX = 1.15;
export const WARHEADS = ['standard', 'wide', 'penetrator', 'emp'];
/* The EMP's reach and stall. */
export const EMP_M = 30;
export const EMP_MS = 4000;
export const LOADOUT = Object.freeze({ rack: RACK_MIN, warhead: 'standard', speedMul: 1 });

export function parseLoadout(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    return null;
  }
  const rack = x.rack ?? LOADOUT.rack;
  const warhead = x.warhead ?? LOADOUT.warhead;
  const speedMul = x.speedMul ?? LOADOUT.speedMul;
  if (typeof rack !== 'number' || !Number.isFinite(rack) || typeof speedMul !== 'number' || !Number.isFinite(speedMul) || !WARHEADS.includes(warhead)) {
    return null;
  }
  return {
    rack: Math.min(RACK_MAX, Math.max(RACK_MIN, Math.round(rack))),
    warhead,
    speedMul: Math.min(SPEED_MUL_MAX, Math.max(1, speedMul)),
  };
}

/*
 * The mission's result, the room's (never a client's), when it is over:
 * stars for each criterion met on a won mission (none on a loss), and
 * credits 100 a star and 10 a kill of the team's.
 *   held      every round a 'win': no MW lost in any
 *   noLosses  in every round no pilot spent more airframes than it
 *             earned (it ended the round with its whole base)
 *   output    the output at the end at or over the mission's starMw
 * A match restarted from its lost stage (start's checkpoint) earns
 * RESTART_STARS at most.
 */
export function resultOf(mission, m) {
  const won = m.state === 'won';
  const need = mission.starMw ?? mission.floorMw;
  const criteria = [
    { id: 'held', met: (m.results ?? []).length > 0 && m.results.every((r) => r === 'win') },
    { id: 'noLosses', met: !m.lossy },
    { id: 'output', met: m.output >= need, need },
  ];
  /* A mission won from a restart at its lost stage earns two at most. */
  const met = criteria.filter((c) => c.met).length;
  const stars = won ? (m.restarted != null ? Math.min(RESTART_STARS, met) : met) : 0;
  /* The team's: a pilot whose seat another took is still on it. */
  const kills = [...Object.values(m.players), ...Object.values(m.away ?? {}).map((a) => a.player)].reduce((sum, p) => sum + p.kills, 0);
  return {
    won, stars, credits: 100 * stars + 10 * kills, criteria,
  };
}
/*
 * A war's id across every room, the one a page pays its result once by
 * (src/game/campaign.js payResult): match ids count from 1 in each room
 * and a code is used again, so the wall clock ms the match started is in
 * it (m.startedAt; the room's birth, meta.epoch, for a match stored
 * before it had one). Fixed width, so ids sort by when the war started:
 * a page keeps the newest it paid (PAID_KEEP) by sorting them past the
 * first letter, and never reads one apart. kind: that letter, 'w' a war's,
 * 'o' an ops match's (ops.js view), whose ids count apart from the war's
 * in the same room, so the two never meet in one save's list.
 */
export function warUid(meta, m, kind = 'w') {
  return `${kind}${String(m.startedAt ?? meta.epoch ?? 0).padStart(13, '0')}-${meta.code ?? ''}-${String(m.id).padStart(6, '0')}`;
}

/* The most stars a mission restarted from its lost stage can earn. */
export const RESTART_STARS = 2;

/* A mission flown at a time of day the map is not built at by default
 * (its `time`, or the night raid's `night`) has a screen that is not yet
 * on it rebuild its world (src/main.js warTimeFrame), and a screen starts
 * the film only once its world is up: the film's own clock starts this
 * long after the briefing, so the rebuild ends in the black before it
 * and the film is watched from its start, which a viewing must be to
 * count as seen. Measured: a morning Itaipu built in 5.0 s on an RTX 3060
 * Ti (warintro:check's info rows, 3 October). Every screen builds the
 * mission's world under the lobby (#412) and says so (op 'world'), so
 * the lead is held only for a pilot that has not: a build of its own not
 * done yet, or a client too old to say. Held for everybody it was eight
 * seconds of black before every film (measured: the film clock at -7.9 s
 * on its first frame, 5 October). */
export const WORLD_LEAD_MS = 8000;
const timeOfMission = (mission) => missionTime(mission) ?? 'day';
/* The longest map id or time a pilot's 'world' may name. */
const WORLD_WORD = 32;
/* A pilot on its last airframe is taken as not flying once it has sent no
 * pose for STALE_MS, or has been on the ground (not airborne) for
 * GROUND_MS, so a round never waits on a flight that will not end. */
export const STALE_MS = 2000;
export const GROUND_MS = 3000;
/* How long a pilot on its last airframe has to take off on it after its
 * last loss (its wreck, the respawn) before the round stops waiting. */
export const RESPAWN_MS = 10000;
/* A defender's positions are kept this long for the assists, apart from
 * its Track: within() finds its place in a Track by walking it, so a
 * Track holds no more than the judgement needs. */
const TRAIL_MS = ASSIST_MS + 1000;
/* An attacker's samples: the frontier is never more than LATE_MS and a
 * tick behind the room clock. */
const AGENT_KEEP_MS = 1000;
/* The fastest an attacker moves, the dive and a weave on top, with room
 * to spare: the cheap distance test before within() uses it. */
const AGENT_MAX_MPS = 80;
/* within() needs a hull for its A side only to be there: the attacker is
 * a point, its centre. */
const POINT = { id: 'point' };

const KIND_ID = new Map(KINDS.map((k, i) => [k, i]));

/* A gate's leaf with holes in it is told again (its openings, leafMoved)
 * at every LEAF_RESEND_M of its lip's travel, and where its hoist stops. */
export const LEAF_RESEND_M = 0.25;

/* Each map's structures (src/share/war/damage.js); a map with none has
 * nothing a warhead breaks. */
const STRUCTURES = Object.freeze({ itaipu: ITAIPU_CHUNKS });

/*
 * The most any point of a hull reaching `reach` from its centre moves,
 * over the poses a Track interpolates for the milliseconds [first, last],
 * from the pose p0: its centre's displacement plus 2 x reach x the
 * attitude's chord from p0's (a rotation by q moves a point x by
 * 2|x| sin(half the angle), at most |x| |q - q0| x 2). An interpolated
 * position lies between its two samples, and an interpolated attitude on
 * the arc between them, so the samples' largest spread plus the largest
 * chord of one step bounds every millisecond. Infinity when the Track
 * does not cover `first`.
 */
function spread(track, first, last, p0, reach) {
  const s = track.s;
  let i = track.bracket(first);
  if (i < 0) {
    return Infinity;
  }
  let far = 0;
  let turn = 0;
  let step = 0;
  let prev = null;
  for (; i < s.length; i += 1) {
    const q = s[i];
    far = Math.max(far, Math.sqrt((q.px - p0.px) ** 2 + (q.py - p0.py) ** 2 + (q.pz - p0.pz) ** 2));
    turn = Math.max(turn, chord(q, p0));
    if (prev) {
      step = Math.max(step, chord(q, prev));
    }
    prev = q;
    if (q.t >= last) {
      break;
    }
  }
  return far + 2 * reach * (turn + step);
}

/* |a - b| between two attitude quaternions, on the same hemisphere. */
function chord(a, b) {
  const sg = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  return Math.sqrt((a.qx * sg - b.qx) ** 2 + (a.qy * sg - b.qy) ** 2 + (a.qz * sg - b.qz) ** 2 + (a.qw * sg - b.qw) ** 2);
}


/*
 * THE HULL'S BROADPHASE. Whether no part box of hull h can come within
 * `blast` of the attacker's centre in (t0, t1], so within() need not
 * measure the hull on every millisecond: the hull's distance at the
 * span's first millisecond, less the most either side can move in the
 * span (spread), is still outside `blast`. A hull's distance to a point
 * changes by no more than the point and the parts move, so this never
 * skips a detonation; an attacker parked just outside the bubble costs
 * one hullDistance a span instead of one a millisecond. within()'s own
 * broadphase, on the centres, passes such a pair every millisecond,
 * since its centre is inside `blast` plus the hull's reach.
 */
function clearOf(h, dTrack, aTrack, t0, t1, memo, blast) {
  const first = Math.floor(t0) + 1;
  const last = Math.floor(t1);
  const d = spanOf(dTrack, first, last, h.hull.reach, memo);
  const a = spanOf(aTrack, first, last, 0, memo);
  if (!d || !a) {
    return false;
  }
  const move = d.move + a.move;
  const d0 = d.p;
  const a0 = a.p;
  /* No part is further than reach from the hull's centre: a pair whose
   * centres are clear by that much more needs no hullDistance. */
  const dx = d0.px - a0.px;
  const dy = d0.py - a0.py;
  const dz = d0.pz - a0.pz;
  const centre = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (centre - h.hull.reach - move > blast + 1e-6) {
    return true;
  }
  const gap = hullDistance(h, d0, a0.px, a0.py, a0.pz);
  /* A micrometre for the rounding between a sample and its lerp. */
  return gap - move > blast + 1e-6;
}

/*
 * A track's pose at the span's first millisecond and its spread over the
 * span, once a judgement step for each track and span, however many
 * pairs it is in (8 pilots and 120 attackers are 960 pairs, but 128
 * tracks). null when the Track does not cover `first`.
 */
function spanOf(track, first, last, reach, memo) {
  let byTrack = memo.get(track);
  if (!byTrack) {
    byTrack = new Map();
    memo.set(track, byTrack);
  }
  const key = `${first}:${last}`;
  if (byTrack.has(key)) {
    return byTrack.get(key);
  }
  const p = trackPose(track, first, {});
  const out = p ? { p, move: spread(track, first, last, p, reach) } : null;
  byTrack.set(key, out);
  return out;
}

/* Whether a sample can go off: seen, neither spawning nor crashed. */
function clean(p) {
  return (p.flags & (FLAG_SPAWNING | FLAG_CRASHED)) === 0;
}

/* A number a message carries, to the millimetre. */
const mm = (v) => Math.round(v * 1000) / 1000;

/* An attacker's draw for its j-th crossing of a power line
 * (src/share/war/wires.js): the seed's with this and j mixed in, so it
 * neither repeats nor moves the errors' draws. */
const WIRE_SALT = 0x57495245;
export function wireDraw(seed, id, j) {
  return draw((seed ^ WIRE_SALT ^ Math.imul(j + 1, 0x632be5ab)) >>> 0, id);
}


/*
 * The floor each map's hunters hold over (edge/rooms/warhunt.js), read once
 * per process. Node reads Itaipu's heightfield from beside the missions
 * (the VM's deploy copies src/ whole); a Cloudflare Worker has no files, so
 * there it is null and the hunters fly over flat ground at 0. That is by
 * decision (the lead's, 2026-09-29): production is the Node VM, and the
 * Worker, the retired platform (edge/rooms/README.md), is not where a war
 * is fought. getBuiltinModule rather than an import, so the Worker's
 * bundle never meets node:fs.
 */
const FLOORS = new Map();
function floorOf(map) {
  if (FLOORS.has(map)) {
    return FLOORS.get(map);
  }
  const fs = map === 'itaipu' && globalThis.process && process.getBuiltinModule ? process.getBuiltinModule('node:fs') : null;
  const floor = fs ? loadHeight(fs.readFileSync(new URL('../../src/share/war/itaipu-height.bin', import.meta.url))) : null;
  FLOORS.set(map, floor);
  return floor;
}

export class RoomWar {
  /* options.devMissions also starts the campaign's missions still in
   * development (campaign.js released): the checks' rooms, never the VM's. */
  constructor(meta, options = {}) {
    this.meta = meta;
    this.devMissions = options.devMissions === true;
    /*
     * { id, startedAt (wall clock ms, warUid), mission, seed, goAt,
     *   state: 'briefing'|'countdown'|'live'|'won'|'lost'|'ended', briefAt (the room ms a briefing's film
     *   starts, WORLD_LEAD_MS after the briefing for a mission with a time
     *   of its own unless every pilot's world already stands, worldsUp;
     *   or null), why, f, wave (the next to be born), output,
     *   down (target ids hit), players: { seat: { kills, assists, mw, token } },
     *   away: { token: { player, spent, earned, loadout, round } } (a
     *   pilot whose seat another took, enlist()),
     *   agents: [birth records alive], nextAgent, scouts: { n, killed }
     *   of the last scout wave or null, hunters (Hunters save),
     *   wreck: { target: damage.js state }, damage: [events, in order],
     *   cut: [power line span ids down],
     *   endAt }, or null before the first game.
     */
    this.match = null;
    this.nextId = 1;
    this.missions = MISSIONS;
    /* The seed of a game's error draws. Math.random in the room; the
     * checks put a fixed one here so their runs repeat. */
    this.random = Math.random;
    this.hunters = new Hunters(null);
    /* id -> { a (birth record), plan, track, next, spawned }. Memory. */
    this.live = new Map();
    /* seat -> { airframe, hull, track, token, down, armFrom, crashT }. */
    this.seats = new Map();
    /* seat -> Map(agent id -> tickNo sent), for the AGENTS thinning. */
    this.sent = new Map();
    this.lastStep = -Infinity;
    this.lastPoses = [];
    /* For the checks: every detonation, arrival and crash, with when it
     * was decided. Memory only. */
    this.log = [];
    /* token -> { film id: version } watched to the end: memory, as the
     * loadouts (seenFilms). */
    this.seen = new Map();
    /* token -> loadout sent before a game: memory, copied into the match
     * as its pilot joins it (enlist). By token, never by seat, so a seat's
     * next pilot never flies its last one's. */
    this.loadouts = new Map();
    /* seat -> { token, map, time }: the world each screen last said it
     * has standing (op 'world'). Memory. */
    this.worlds = new Map();
  }

  mission() {
    return this.match ? this.missions[this.match.mission] : null;
  }

  /* Each pilot's airframes a round. */
  airframes() {
    const mission = this.mission();
    return mission.airframes ?? mission.rack;
  }

  rounds() {
    return roundsOf(this.mission());
  }

  /* The mission's stages, and its spawns as one list (a birth's wave). */
  stages() {
    return stagesOf(this.mission());
  }

  /* A seat's airframe is spent: one of its round's, at room ms t. */
  spend(seat, t) {
    const m = this.match;
    const rec = this.seats.get(seat);
    if (rec) {
      rec.spentAt = t;
    }
    if (m.stage) {
      note(m.stage, { t, e: 'spend', seat });
    }
    m.spent ??= {};
    /* Up to everything it has this round, earned airframes included:
     * capped at the base, a pilot who had earned one could never be
     * spent out, so never spectated, and the round waited on it. */
    m.spent[seat] = Math.min(this.allowance(seat), (m.spent[seat] ?? 0) + 1);
  }

  /* A seat's airframes this round: the base and one a kill. */
  allowance(seat) {
    return this.baseOf(seat) + (this.match.earned?.[seat] ?? 0);
  }

  /* A seat's loadout, and its airframes a round (the mission's base when
   * it chose none). */
  loadoutOf(seat) {
    return this.match.loadouts[seat] ?? { ...LOADOUT, rack: this.airframes() };
  }

  baseOf(seat) {
    const l = this.match?.loadouts?.[seat];
    return l ? l.rack : this.airframes();
  }

  /* The radius a seat's warhead goes off at, flying `airframe`. */
  blastOf(seat, airframe) {
    return fuzeM(airframe, this.loadoutOf(seat).warhead);
  }

  /* Whether the war's mission lets an airframe fly it: its `aircraft`
   * (every campaign mission names the war's, configs/airframes.js
   * WAR_AIRFRAMES), or any where it names none, as the room's own checks
   * write theirs. */
  flies(airframe) {
    const a = this.mission().aircraft;
    return !a || a.includes(airframe);
  }

  /* Whether a seat has spent every airframe of the round. */
  spentOut(seat) {
    return (this.match.spent?.[seat] ?? 0) >= this.allowance(seat);
  }

  /* When a seat's present airframe was put on the pad: its last loss
   * this round, else the round's start. `launched` after it is a take-off
   * on this airframe. */
  sinceOf(rec) {
    const m = this.match;
    const start = m.roundAt ?? m.goAt;
    return rec && rec.spentAt != null && rec.spentAt >= start ? rec.spentAt : start;
  }

  /*
   * Whether a seat can still fly this round. Spent out, no. With more
   * than its last airframe left, yes. On its last: no once it has been
   * silent for STALE_MS; before it has taken off on it (a clean airborne
   * pose since its last loss), yes for RESPAWN_MS from that loss; after,
   * yes unless it has sat on the ground for GROUND_MS.
   */
  stillFlying(seat, roomNow) {
    const m = this.match;
    if (this.spentOut(seat)) {
      return false;
    }
    if ((m.spent?.[seat] ?? 0) < this.allowance(seat) - 1) {
      return true;
    }
    const rec = this.seats.get(seat);
    const p = rec ? rec.track.s.at(-1) : null;
    const since = this.sinceOf(rec);
    if (!p || roomNow - p.t > STALE_MS) {
      return roomNow - Math.max(since, p ? p.t : -Infinity) <= STALE_MS;
    }
    if (!(rec.launched > since)) {
      return p.t - since <= RESPAWN_MS;
    }
    return rec.groundSince == null || p.t - rec.groundSince <= GROUND_MS;
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.match = saved.match ?? null;
    this.nextId = saved.nextId ?? 1;
    this.live = new Map();
    if (!this.match || !this.missions[this.match.mission]) {
      this.match = null;
      return;
    }
    this.hunters = new Hunters(floorOf(this.mission().map));
    this.hunters.restore(this.match.hunters);
    for (const a of this.match.agents) {
      this.adopt(a, true);
    }
  }

  store() {
    const m = this.match;
    if (m) {
      m.hunters = this.hunters.save();
    }
    return { store: 'war', value: { match: m, nextId: this.nextId } };
  }

  /* Briefing, counting down or on: the room runs no other game. */
  on() {
    const m = this.match;
    return Boolean(m) && (m.state === 'briefing' || m.state === 'countdown' || m.state === 'live');
  }

  /* The match as every client sees it, with its named state (modes.js
   * sessionOf) as it stands now. */
  view(core) {
    const v = this.shown(core);
    return { ...v, session: sessionOf('war', v, core.roomNow()) };
  }

  shown(core) {
    const m = this.match;
    if (!m) {
      return { state: 'lobby' };
    }
    const here = new Set(this.players(core));
    const mission = this.mission();
    const flying = m.state !== 'briefing' && m.state !== 'countdown';
    const seats = Object.keys(m.players);
    /* A pilot who left takes their airframes with them, and brings back
     * what they had not spent (m.spent stays with the seat or the token). */
    const present = seats.filter((seat) => here.has(Number(seat)));
    const airframeOf = new Map([...core.seats.values()].map((s) => [s.seat, s.profile.airframe]));
    return {
      state: m.state,
      id: m.id,
      uid: warUid(this.meta, m),
      mission: m.mission,
      goAt: m.goAt,
      briefAt: m.briefAt ?? null,
      /* The match's film, and the seats here that have seen it (the
       * host's skip waits on all of them). */
      film: { id: filmFor(mission).id, version: filmFor(mission).version },
      seen: this.seenHere(core),
      f: m.f,
      wave: m.wave,
      waves: wavesOf(this.stages()).length,
      output: m.output,
      floor: mission.floorMw,
      down: m.down.slice(),
      /* The airframes left this round of the match's pilots here, and all
       * they have had in it, earned ones too: none before the go. */
      rack: flying ? present.reduce((sum, seat) => sum + Math.max(0, this.allowance(seat) - (m.spent?.[seat] ?? 0)), 0) : 0,
      rackMax: flying ? present.reduce((sum, seat) => sum + this.allowance(seat), 0) : 0,
      round: (m.round ?? 0) + 1,
      rounds: this.rounds(),
      roundState: m.roundState ?? 'live',
      roundResult: m.roundResult ?? null,
      roundMw: m.roundMw ?? 0,
      nextRoundAt: m.nextRoundAt ?? null,
      /* The round's clock origin, so the HUD can count down to its next
       * wave (a wave is born at roundAt + its `at`). */
      roundAt: m.roundAt ?? m.goAt,
      /* The next wave's birth, room ms, as the room drew it (a window,
       * a trigger), or null with none told yet. */
      nextAt: m.stage ? nextDue(m.stage) : null,
      /* The stage (src/share/war/stages.js) a pilot joining now walks
       * into: what it is, when it began, its objectives, and the last
       * line of text and music it cued. */
      stage: m.stage ? {
        id: m.stage.id,
        n: m.stage.idx,
        at: m.stage.at,
        title: this.stages()[m.stage.idx].title ?? null,
        text: m.stage.text,
        music: m.stage.music,
        /* Its own, then a closure's hold on its gantry (contain.js). */
        objectives: [...objectivesView({
          mission, m, st: m.stage, f: m.f, pauses: (gantry) => pausesOf(m.contain, gantry),
        }), ...objectivesOf(m.contain, m.stage.at, m.f)],
        /* What the seed chose for each spawn (stages.js enter). */
        draws: m.stage.due.map((d) => ({
          t: d.t, route: d.route, sector: d.sector, az: d.az, kind: d.kind, born: d.born, skipped: d.skipped ?? false,
        })),
        ready: Object.keys(m.stage.ready).map(Number),
      } : null,
      /* The working sets drawn (stages.js drawSets), and the spillway's
       * gate state: [{ gate, at, open_m }], each a gate's hoist starting
       * at room ms `at` toward open_m metres (src/share/war/hoist.js
       * openAt; the damage, the map and the flood read it, T1.9). */
      sets: m.sets ?? null,
      gates: this.gates(),
      /* The room ms the station's lights went out by order (the first
       * `stationDark` stage this match entered, its path's), dark to the
       * match's end for every screen (src/main.js), or null. */
      stationDark: m.path?.find((x) => this.stages().find((y) => y.id === x.id)?.stationDark === true)?.at ?? null,
      /* The grid rerouted round the yard (src/share/war/grid.js WHAT
       * COMES BACK): [{ at, districts }], a restoring hold's, from the
       * stages' path entries, so a checkpoint and a store keep them. */
      restores: (m.path ?? []).flatMap((x) => x.restores ?? []).map(({ at, districts }) => ({ at, districts: districts.slice() })),
      /* The gantries closing an opening, or waiting to (contain.js). */
      contain: gantriesAt(m.contain, m.f),
      airframes: this.airframes(),
      spent: { ...(m.spent ?? {}) },
      earned: { ...(m.earned ?? {}) },
      alive: m.agents.length,
      /* The FPV standard radius, for clients from before `fuze`. */
      blast: BLAST_M,
      scores: Object.entries(m.players).map(([seat, p]) => ({
        seat: Number(seat), kills: p.kills, assists: p.assists, mw: p.mw, gone: !here.has(Number(seat)),
      })).sort((a, b) => b.kills - a.kills || b.mw - a.mw || a.seat - b.seat),
      why: m.why,
      /* Ended by the room for too few players here (core.js settleGames). */
      abandoned: Boolean(m.abandoned),
      endAt: m.endAt,
      result: m.state === 'won' || m.state === 'lost' || m.state === 'ended' ? resultOf(mission, m) : null,
      /* A lost match's stage to play again from, and a match that is such
       * a restart (its stars capped, resultOf). */
      checkpoint: m.state === 'lost' && m.checkpoint ? { stage: m.checkpoint.id, n: m.checkpoint.idx, title: this.stages()[m.checkpoint.idx].title ?? null } : null,
      restarted: m.restarted ?? null,
      loadouts: Object.fromEntries(seats.map((seat) => [seat, this.loadoutOf(Number(seat))])),
      /* Each seat here's fuze radius, metres, on the airframe it flies
       * now: what its IN RANGE cue is drawn against. */
      fuze: Object.fromEntries(seats.filter((seat) => airframeOf.has(Number(seat)))
        .map((seat) => [seat, this.blastOf(Number(seat), airframeOf.get(Number(seat)))])),
      disabled: { ...(m.disabled ?? {}) },
    };
  }

  /* s: the seat welcomed; its view carries the result only if it flew
   * the war (flew), as changed() sends it. */
  welcome(core, s) {
    const v = this.view(core);
    return { war: this.flew(s) ? v : watchedView(v) };
  }

  /*
   * Whether seat s's pilot flew the match: enlisted in it at any point,
   * by token, its entry at a seat or put away (a pilot who left, or came
   * back after the end, which enlists nobody). A watcher, a pilot who sat
   * it out unconsented and one who first came after the end did not.
   * The war's result is paid to these seats' pages and no others
   * (src/ui/campaign.js observe).
   */
  flew(s) {
    const m = this.match;
    if (!m || !s || !s.token) {
      return false;
    }
    return Object.values(m.players).some((p) => p.token === s.token) || Object.hasOwn(m.away ?? {}, s.token);
  }

  /* Every seat and every watcher (core.js watch): a watcher draws the
   * attackers, the booms and the damage, and none of it is its own. */
  broadcast(core, msg) {
    return core.everyone(JSON.stringify(msg));
  }

  /* The view, with no result for a watcher or a seat that did not fly
   * the war (core.js viewed, flew). */
  changed(core) {
    return [this.store(), ...core.viewed('war', this.view(core), (s) => this.flew(s))];
  }

  error(conn, error) {
    return [{ send: conn, data: JSON.stringify({ type: 'war', error }) }];
  }

  /* A pilot just seated in a briefing, a countdown or a live war: one of
   * the match's players from now (enlist), told every attacker alive as
   * births, and everybody the view with them in it (the welcome's was
   * built before). */
  join(core, conn) {
    if (!this.on()) {
      return [];
    }
    this.enlist(core.seats.get(conn));
    const out = this.changed(core);
    if (this.match.agents.length) {
      out.push({ send: conn, data: JSON.stringify({ type: 'war', op: 'born', agents: this.match.agents }) });
    }
    /* What the war has broken so far, each event as it was sent. */
    for (const e of this.match.damage ?? []) {
      out.push({ send: conn, data: JSON.stringify({ type: 'war', op: 'damage', ...e }) });
    }
    return out;
  }

  /* A watcher come while a war is on: every attacker alive as births and
   * the damage so far, as a joiner is told them, and never enlisted. */
  watch(conn) {
    if (!this.on()) {
      return [];
    }
    return [
      ...(this.match.agents.length ? [{ send: conn, data: JSON.stringify({ type: 'war', op: 'born', agents: this.match.agents }) }] : []),
      ...(this.match.damage ?? []).map((e) => ({ send: conn, data: JSON.stringify({ type: 'war', op: 'damage', ...e }) })),
    ];
  }

  /*
   * Seat s one of the match's players, with a share of the rack (its
   * allowance) and a row of the scores. The match is keyed by seat, and a
   * seat is the pilot's only while their token holds it: a seat already
   * theirs is kept as it is; one holding another pilot's entry has that
   * entry put away under its token (m.away) with what it spent and
   * earned, so its kills still count and its spent airframes never
   * ground the newcomer; and a pilot coming back (their token under
   * another seat, or away) has their own entry back, never a second
   * share. What it spent and earned comes back only within the same
   * round, since both start again each round.
   */
  enlist(s) {
    /* A pilot who has not given the war's consent since the room moved
     * into it (core.js setup) sits it out. */
    if ((this.meta.unconsented || []).includes(s.token)) {
      return;
    }
    const m = this.match;
    const had = m.players[s.seat];
    if (had && (had.token == null || had.token === s.token)) {
      return;
    }
    m.away ??= {};
    if (had) {
      this.putAway(s.seat);
    }
    const before = Object.keys(m.players).find((seat) => m.players[seat].token === s.token);
    if (before != null) {
      this.putAway(Number(before));
    }
    const back = m.away[s.token];
    delete m.away[s.token];
    if (!back) {
      /* New to this match: the loadout it sent before, as at the go. A
       * live war takes none (loadout()), so one arriving then without
       * one flies the default. */
      const l = this.loadouts.get(s.token);
      if (l) {
        m.loadouts[s.seat] = l;
      }
      m.players[s.seat] = {
        kills: 0, assists: 0, mw: 0, token: s.token,
      };
      return;
    }
    m.players[s.seat] = back.player;
    if (back.loadout) {
      m.loadouts[s.seat] = back.loadout;
    }
    if (back.round === (m.round ?? 0)) {
      if (back.spent) {
        (m.spent ??= {})[s.seat] = back.spent;
      }
      if (back.earned) {
        (m.earned ??= {})[s.seat] = back.earned;
      }
    }
  }

  /* A seat's entry out of the seat's maps, kept under its token. */
  putAway(seat) {
    const m = this.match;
    const player = m.players[seat];
    m.away[player.token] = {
      player, spent: m.spent?.[seat] ?? 0, earned: m.earned?.[seat] ?? 0, loadout: m.loadouts[seat] ?? null, round: m.round ?? 0,
    };
    delete m.players[seat];
    delete m.loadouts[seat];
    if (m.spent) {
      delete m.spent[seat];
    }
    if (m.earned) {
      delete m.earned[seat];
    }
  }

  /* The match's players who are here, by the seat's token (tag's rule). */
  players(core) {
    const m = this.match;
    if (!m) {
      return [];
    }
    return [...core.seats.values()]
      .filter((t) => m.players[t.seat] && (m.players[t.seat].token == null || m.players[t.seat].token === t.token) && !core.failed(t))
      .map((t) => t.seat);
  }

  leave(seat) {
    this.seats.delete(seat);
    this.sent.delete(seat);
    this.worlds.delete(seat);
  }

  /* One text message of type 'war' from seat s. */
  message(core, conn, s, msg, now) {
    if (msg.op === 'lost') {
      return this.lost(core, conn, s, now);
    }
    if (msg.op === 'loadout') {
      return this.loadout(core, conn, s, msg.loadout);
    }
    if (msg.op === 'ready') {
      return this.ready(core, conn, s, now);
    }
    if (msg.op === 'seen') {
      return this.seenFilms(core, conn, s, msg.films);
    }
    if (msg.op === 'world') {
      return this.world(conn, s, msg);
    }
    if (s.seat !== core.host()) {
      return [];
    }
    if (msg.op === 'start') {
      return this.start(core, conn, msg, now);
    }
    if (msg.op === 'skipIntro') {
      return this.skipIntro(core, conn, now);
    }
    if (msg.op === 'skip' || msg.op === 'complete') {
      return this.devOp(core, conn, msg, now);
    }
    if (msg.op === 'end' && this.on()) {
      const out = this.advance(core, now);
      return this.on() ? [...out, ...this.abandon(core, now)] : out;
    }
    return [];
  }

  /* A pilot's own airframe lost to its link (section 6.4). Refused
   * outside a live war ('off'), before the room has its poses ('unseen'),
   * while spawning ('spawning') or as a wreck ('wreck', whose crash the
   * room counts); nothing at all for a seat already disarmed, so it is
   * once a life. */
  lost(core, conn, s, now) {
    const m = this.match;
    if (!m || m.state !== 'live') {
      return this.error(conn, 'off');
    }
    const rec = this.seats.get(s.seat);
    const p = rec && rec.token === s.token ? rec.track.s.at(-1) : null;
    if (!p) {
      return this.error(conn, 'unseen');
    }
    if (rec.down) {
      return [];
    }
    if (p.flags & FLAG_SPAWNING) {
      return this.error(conn, 'spawning');
    }
    if (p.flags & FLAG_CRASHED) {
      return this.error(conn, 'wreck');
    }
    const out = this.advance(core, now);
    if (m.state !== 'live') {
      return out;
    }
    rec.down = { at: p.t, seen: false };
    this.spend(s.seat, p.t);
    this.log.push({
      what: 'lost', t: p.t, seat: s.seat, decided: core.roomMs(now),
    });
    this.settle(m.f);
    return [...out, ...this.changed(core)];
  }

  /* Ended before it was won or lost: by the host, or by the room when
   * nobody is left to play it (core.js settleGames). */
  /* A pilot's loadout, any time but a live game: kept for the next start,
   * and for the match counting down now. */
  loadout(core, conn, s, x) {
    const l = parseLoadout(x);
    if (!l) {
      return this.error(conn, 'loadout');
    }
    if (this.match && this.match.state === 'live') {
      return this.error(conn, 'live');
    }
    this.loadouts.set(s.token, l);
    if (this.on()) {
      this.match.loadouts[s.seat] = l;
    }
    return this.match ? this.changed(core) : [];
  }

  abandon(core, now, abandoned = false) {
    if (!this.on()) {
      return [];
    }
    this.finish(Math.min(this.match.f, core.roomMs(now)), 'ended', 'end');
    this.match.abandoned = abandoned;
    return this.changed(core);
  }

  /* The stage a lost match of `mission` can be played again from, or
   * null. */
  checkpointOf(mission) {
    const m = this.match;
    return m && m.state === 'lost' && m.mission === mission.id && m.checkpoint ? m.checkpoint : null;
  }

  /* Whether this room may start mission `id`: one it knows, released. */
  /* core: the room, whose host may be one of DEV_ACCOUNTS (core.js
   * devHost); without it, only the server's own devMissions. */
  startable(id, core = null) {
    return typeof id === 'string' && Object.hasOwn(this.missions, id) && released(id, this.devMissions || Boolean(core?.devHost()));
  }

  start(core, conn, msg, now) {
    /* core.js hostCheck refuses it first; this holds without it. */
    if (this.meta.public && modeById('war').publicOnlyWhenMadeFor && !madeFor(this.meta.mode, 'war')) {
      return this.error(conn, 'private');
    }
    if (core.game()) {
      return this.error(conn, 'busy');
    }
    const mission = typeof msg.mission === 'string' && Object.hasOwn(this.missions, msg.mission) ? this.missions[msg.mission] : null;
    if (!mission) {
      return this.error(conn, 'mission');
    }
    if (!this.startable(mission.id, core)) {
      return this.error(conn, 'unreleased');
    }
    if (mission.map !== core.meta.map) {
      return this.error(conn, 'map');
    }
    /* Again from the stage this mission was lost in (the owner, 2 Oct:
     * restart from the lost stage, two stars at most): only straight
     * after that loss, and only the mission lost. */
    const cp = msg.from === 'checkpoint' ? this.checkpointOf(mission) : null;
    if (msg.from === 'checkpoint' && !cp) {
      return this.error(conn, 'checkpoint');
    }
    if (msg.loadout != null) {
      const l = parseLoadout(msg.loadout);
      if (!l) {
        return this.error(conn, 'loadout');
      }
      this.loadouts.set(core.seats.get(conn).token, l);
    }
    /* A briefing is the intro's span before the countdown's; a restart
     * from a stage has none. */
    const lead = timeOfMission(mission) === 'day' || this.worldsUp(core, mission) ? 0 : WORLD_LEAD_MS;
    const briefAt = msg.intro === true && !cp ? Math.ceil(core.roomMs(now)) + lead : null;
    /* A mission's prepMs lengthens its countdown: the night raid's, so
     * every screen has built its night world and seated its pilot well
     * before the go, never after it (itaipu-4.js). */
    const goAt = (briefAt ?? Math.ceil(core.roomMs(now))) + (briefAt == null ? 0 : briefingMs(mission)) + COUNTDOWN_MS + (mission.prepMs ?? 0);
    this.match = {
      id: this.nextId,
      startedAt: now,
      mission: mission.id,
      seed: Math.floor(this.random() * 4294967296) >>> 0,
      goAt,
      briefAt,
      state: briefAt == null ? 'countdown' : 'briefing',
      why: null,
      f: goAt,
      wave: 0,
      output: mission.output,
      down: [],
      round: 0,
      roundState: 'live',
      roundResult: null,
      roundMw: 0,
      roundAt: goAt,
      nextRoundAt: null,
      spent: {},
      earned: {},
      results: [],
      lossy: false,
      disabled: {},
      loadouts: {},
      players: {},
      away: {},
      agents: [],
      nextAgent: 1,
      scouts: null,
      spawned: [],
      hunters: null,
      wreck: {},
      damage: [],
      endAt: null,
    };
    if (cp) {
      /* The match as it was when the stage opened: its seed, so every
       * draw is the one it had, the output and the targets down, the
       * path, the rounds before it; the stage entered again at the go. */
      Object.assign(this.match, {
        seed: cp.seed,
        output: cp.output,
        down: cp.down.slice(),
        downAt: { ...cp.downAt },
        breaches: cp.breaches.map((b) => ({ ...b })),
        /* An opening still closing when the stage opened closes again
         * from the go (contain.js restartAt). */
        contain: restartAt(cp.contain, cp.at, goAt),
        /* What was broken when the stage opened stays broken. */
        wreck: JSON.parse(JSON.stringify(cp.wreck ?? {})),
        damage: (cp.damage ?? []).map((e) => ({ ...e })),
        cut: (cp.cut ?? []).slice(),
        path: cp.path.map((x) => ({ ...x })),
        was: cp.was,
        round: cp.round,
        roundsIn: cp.roundsIn,
        results: cp.results.slice(),
        lossy: cp.lossy,
        scouts: cp.scouts,
        wave: cp.wave,
        nextAgent: cp.nextAgent,
        entries: cp.entry - 1,
        from: cp.idx,
        restarted: cp.id,
      });
    }
    /* A pilot whose page could not build the world (core.js fail) is
     * not enlisted: it waits for the next match. */
    for (const t of core.seats.values()) {
      if (!core.failed(t)) {
        this.enlist(t);
      }
    }
    /* The working sets (stages.js drawSets), drawn as the match starts
     * so its film shows the same as its stages, for the pilots enlisted;
     * a restart keeps the ones it had. */
    this.match.sets = cp ? cp.sets : drawSets(mission, this.match.seed, Math.max(1, this.players(core).length));
    this.match.gates = cp ? cp.gates.map((g) => ({ ...g })) : [];
    this.nextId += 1;
    /* The room's mission from now on, in a later welcome too: a reload
     * between wars still names it (docs/FLOW-AUDIT.md D7). */
    core.meta.mission = mission.id;
    this.live = new Map();
    this.hunters = new Hunters(floorOf(mission.map));
    this.lastStep = -Infinity;
    this.lastPoses = [];
    this.sent = new Map();
    this.log = [];
    for (const r of this.seats.values()) {
      r.down = null;
      r.armFrom = -Infinity;
      r.crashT = -Infinity;
    }
    /* A restart from a stage: everybody is told again what was broken
     * then, as a pilot who joins is. */
    const broken = this.match.damage.flatMap((e) => this.broadcast(core, { type: 'war', op: 'damage', ...e }));
    return [{ store: 'meta', value: core.meta }, ...this.changed(core), ...broken];
  }

  /* The world a pilot's screen has built and standing: { map, time },
   * each a short string, or map null while it has none. Nothing is sent
   * back: it only shortens the next briefing's lead. */
  world(conn, s, msg) {
    if (msg.map === null) {
      this.worlds.delete(s.seat);
      return [];
    }
    const word = (x) => typeof x === 'string' && x.length > 0 && x.length <= WORLD_WORD;
    if (!word(msg.map) || !word(msg.time)) {
      return this.error(conn, 'world');
    }
    this.worlds.set(s.seat, { token: s.token, map: msg.map, time: msg.time });
    return [];
  }

  /* Whether every pilot here has said its screen stands on `mission`'s
   * world at the mission's time, so its film can start with no lead. */
  worldsUp(core, mission) {
    const time = timeOfMission(mission);
    return [...core.seats.values()].filter((t) => !core.failed(t)).every((t) => {
      const w = this.worlds.get(t.seat);
      return w && w.token === t.token && w.map === mission.map && w.time === time;
    });
  }

  /* A pilot's watched films, { id: version }: what the host's skip asks
   * of everybody here. Anything else is refused 'seen'. */
  seenFilms(core, conn, s, films) {
    if (!films || typeof films !== 'object' || Array.isArray(films)
      || !Object.values(films).every((v) => Number.isInteger(v) && v >= 0)) {
      return this.error(conn, 'seen');
    }
    this.seen.set(s.token, { ...films });
    return this.match ? this.changed(core) : [];
  }

  /* The seats here that have seen this match's film, its version. */
  seenHere(core) {
    const f = filmFor(this.mission());
    return this.players(core).filter((seat) => {
      const t = [...core.seats.values()].find((x) => x.seat === seat);
      return t && (this.seen.get(t.token)?.[f.id] ?? -1) >= f.version;
    });
  }

  /* The host cuts the briefing short: the countdown runs from now, for
   * everybody, once every pilot here has seen the film (a first viewing
   * is never cut, INTROS.md section 3; the host's own skip then leaves
   * only its own view). Nothing outside a briefing, so a late or repeated
   * skip cannot move a countdown already under way. */
  skipIntro(core, conn, now) {
    const m = this.match;
    if (!m || m.state !== 'briefing') {
      return [];
    }
    if (this.seenHere(core).length < this.players(core).length) {
      return this.error(conn, 'unwatched');
    }
    m.goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    m.f = m.goAt;
    /* Round 1's clock is the go: left at the full briefing's, a skipped
     * intro's first wave came the rest of the intro after the go. */
    m.roundAt = m.goAt;
    m.state = 'countdown';
    return this.changed(core);
  }

  /* A seat's samples and hull, new when its airframe or its pilot is. */
  seatOf(s) {
    const had = this.seats.get(s.seat);
    if (had && had.airframe === s.profile.airframe && had.token === s.token) {
      return had;
    }
    const next = {
      airframe: s.profile.airframe, hull: hullFor(s.profile.airframe), track: new Track(), trail: [], token: s.token,
      down: null, armFrom: -Infinity, crashT: -Infinity,
    };
    this.seats.set(s.seat, next);
    return next;
  }

  /* A seat's POSE as the room relays it (spawning set by safety.js). */
  pose(core, s, bytes, now) {
    if (!this.on()) {
      return [];
    }
    const p = decodePose(bytes);
    if (!p || p.t > core.roomMs(now) + AHEAD_MS || s.profile.map !== core.meta.map) {
      return [];
    }
    /* Another aircraft than the war's, from a tab older than the rule (a
     * new one changes it on the way in): not in the war, its pose judged
     * by nothing here, and told so once a match. */
    if (!this.flies(s.profile.airframe)) {
      this.seats.delete(s.seat);
      const m = this.match;
      if ((m.refused ??= {})[s.seat]) {
        return [];
      }
      m.refused[s.seat] = true;
      const conn = [...core.seats].find(([, x]) => x === s)?.[0];
      return conn == null ? [] : this.error(conn, 'airframe');
    }
    const was = this.seats.get(s.seat);
    const rec = this.seatOf(s);
    /* A pilot who changed aircraft has a new fuze radius: the view says
     * so on its first pose with it. */
    const told = was && was.token === s.token && was.airframe !== rec.airframe ? this.changed(core) : [];
    if (!rec.track.push(p)) {
      return told;
    }
    rec.trail.push([p.t, p.px, p.py, p.pz]);
    if (p.flags & FLAG_AIRBORNE) {
      rec.groundSince = null;
      if (clean(p)) {
        rec.launched = p.t;
      }
    } else {
      rec.groundSince ??= p.t;
    }
    if (rec.trail[0][0] < p.t - TRAIL_MS - 1000) {
      rec.trail = rec.trail.filter(([t]) => t >= p.t - TRAIL_MS);
    }
    /* Down after a blast until its own samples show the wreck and then a
     * clean airframe again. */
    if (rec.down && p.t > rec.down.at) {
      if (!clean(p)) {
        rec.down.seen = true;
      } else if (rec.down.seen) {
        rec.armFrom = p.t;
        rec.down = null;
      }
    }
    return told;
  }

  tick(core, now) {
    if (!this.on()) {
      return [];
    }
    return [...this.advance(core, now), ...this.agentsOut(core, core.roomMs(now))];
  }

  /* The seats here, in the room's world, by seat, with their samples. */
  flying(core) {
    const out = [];
    for (const s of core.seats.values()) {
      const t = this.seats.get(s.seat);
      if (t && t.hull && s.profile.map === core.meta.map && t.token === s.token) {
        out.push({ seat: s.seat, ...t, rec: t });
      }
    }
    return out.sort((a, b) => a.seat - b.seat);
  }

  /* An attacker's working state from its birth record; `restored` starts
   * its samples wherever the judgement has got to. */
  adopt(a, restored = false) {
    const plan = planAgent(this.mission(), a);
    const x = {
      a, plan, track: new Track(AGENT_KEEP_MS), next: null, spawned: this.match.spawned.includes(a.id), restored,
    };
    this.live.set(a.id, x);
    return x;
  }

  /* The stage's spawns due, announced BIRTH_LEAD_MS ahead of their
   * birth (src/share/war/stages.js), only while the stage is live: in a
   * round's result nothing new comes. */
  births(core, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const st = m.stage;
    if (!st || (m.roundState ?? 'live') !== 'live') {
      return [];
    }
    const born = [];
    for (const d of dueSpawns(mission, st, roomNow + BIRTH_LEAD_MS)) {
      const w = d.w;
      const t0 = d.t;
      /* While a scout of the last scout wave lives (or got away), the
       * waves fly their routes exactly; once all of them are dead, each
       * attacker draws its error (section 4.2). A stage whose station
       * lights are out by order (`stationDark`, The Long Night's twist A)
       * gives its attackers their error as if they were. */
      const blind = this.stages()[st.idx].stationDark === true || (Boolean(m.scouts) && m.scouts.killed >= m.scouts.n);
      /* Sized by the match's pilots here when it is announced, so one who
       * joins or leaves mid war changes the next wave, never one already
       * told (its n and k ride in the births, and no screen sizes one). */
      const n0 = Math.max(1, this.players(core).length);
      const n = waveSize(w, n0);
      /* The first group born after an opening that can reach the crest is
       * turned at the gantry closing it (contain.js retargetFor). */
      const turn = w.target != null ? retargetFor(m.contain, t0) : null;
      for (let k = 0; k < n; k += 1) {
        const id = m.nextAgent;
        m.nextAgent += 1;
        const err = blind && w.spread ? mm(w.spread * (2 * draw(m.seed, id) - 1)) : 0;
        const a = {
          id, kind: slotKind(w, d, k, m.seed, st.entry), route: d.route, t0, k, n, err, target: waveTarget(w, k, m.sets), wave: w.si,
        };
        if (turn && TURNS.includes(a.kind)) {
          a.target = turn.gantry;
          turn.retarget = t0;
        }
        /* The route turned by the seed's azimuth, and the sector it was
         * drawn from (stages.js enter). */
        if (d.az != null) {
          a.az = d.az;
        }
        if (d.sector != null) {
          a.sector = d.sector;
        }
        this.place(a, w.group ?? null);
        /* A carrier that launches (its spawn's `launch`, not its stage's
         * drawn silent group): its first launch one interval after its
         * birth (launch below). */
        if (w.launch && w.group !== st.silent) {
          (m.launches ??= {})[id] = { next: t0 + launchEvery(w.launch, n0), k: 0, first: null };
        }
        born.push(a);
      }
      if (slotKind(w, d, 0, m.seed, st.entry) === 'scout') {
        m.scouts = { wave: w.si, n, killed: 0 };
      }
      m.wave += 1;
    }
    if (!born.length) {
      return [];
    }
    return this.broadcast(core, { type: 'war', op: 'born', agents: born });
  }

  /* A birth record made an attacker of the match: whether it flies into
   * a power line on its way, and when; whether it meets a structure short
   * of its aim point, and when (its warhead goes off there, a gate's leaf
   * met where the match's gate state has it then); then live, and noted
   * for the stage's triggers under `group`. */
  place(a, group) {
    const m = this.match;
    const mission = this.mission();
    const wire = wireStrike(mission, a, (j) => wireDraw(m.seed, a.id, j), m.cut && m.cut.length ? new Set(m.cut) : null);
    if (wire != null) {
      a.wire = wire;
    }
    const meet = a.target != null ? contactAt(mission.map, planAgent(mission, a), this.gates()) : null;
    if (meet) {
      a.meet = meet.t;
    }
    m.agents.push(a);
    const x = this.adopt(a);
    note(m.stage, {
      t: a.t0, e: 'born', id: a.id, kind: a.kind, group, sector: a.sector ?? null, cross: crossings(mission, x.plan),
    });
    return x;
  }

  /* The live carrier whose launch (m.launches) comes first: { t, x, s },
   * the lower id on a tie, or null. */
  launchNext() {
    let due = null;
    for (const [id, s] of Object.entries(this.match.launches ?? {})) {
      const x = this.live.get(Number(id));
      if (x && (!due || s.next < due.t)) {
        due = { t: s.next, x, s };
      }
    }
    return due;
  }

  /*
   * A carrier's launch at room ms t (MISSIONS.md M5, TECH-NEEDS T1.6): its
   * spawn's `launch` group born on its deck, at its pose then (the birth's
   * `from`, where each one's route starts), sized by the pilots here as a
   * wave is, and its next launch one interval on. Judged in order with the
   * detonations (step), so a carrier killed first launches nothing, and a
   * launch is the same on every run whatever the lag. Its children are
   * told as soon as they are judged born, not BIRTH_LEAD_MS ahead: a
   * screen draws them from their t0, already off the deck. Each launch
   * goes for the next of its targets (the k-th child of launch j for
   * target[(j n + k) % length]), so a source left alive works along the
   * face. Once every one of its first launch was killed, a launch with
   * `then` sends that instead (twist B: Hunters).
   */
  launch(core, due, roomNow) {
    const m = this.match;
    const st = m.stage;
    const { t, x, s } = due;
    const w = wavesOf(this.stages())[x.a.wave];
    const killed = (id) => st.ev.some((e) => e.e === 'gone' && e.id === id && e.how === 'kill');
    const spec = w.launch.then && s.first && s.first.every(killed) ? { ...w.launch, ...w.launch.then, target: w.launch.then.target ?? null } : w.launch;
    const pilots = Math.max(1, this.players(core).length);
    const n = waveSize(spec, pilots);
    const deck = poseAt(x.plan, t).p;
    /* A Hunter leaves at its own clearance over the deck, where warhunt.js
     * would lift it at once (the river is the floor there). */
    const up = spec.kind === 'hunter' ? HUNTER_CLEAR_M : LAUNCH_DECK_M;
    const from = [mm(deck[0]), mm(deck[1] + up), mm(deck[2])];
    const blind = this.stages()[st.idx].stationDark === true || (Boolean(m.scouts) && m.scouts.killed >= m.scouts.n);
    const turn = spec.target != null ? retargetFor(m.contain, t) : null;
    const born = [];
    for (let k = 0; k < n; k += 1) {
      const id = m.nextAgent;
      m.nextAgent += 1;
      const err = blind && spec.spread ? mm(spec.spread * (2 * draw(m.seed, id) - 1)) : 0;
      const a = {
        id, kind: spec.kind, route: spec.route, from, t0: t, k, n, err, target: waveTarget(spec, s.k * n + k, m.sets), wave: x.a.wave, parent: x.a.id, group: spec.group,
      };
      if (turn && TURNS.includes(a.kind)) {
        a.target = turn.gantry;
        turn.retarget = t;
      }
      const y = this.place(a, spec.group);
      this.fill(y, this.judgeT1);
      born.push(a);
    }
    s.k += 1;
    s.first ??= born.map((a) => a.id);
    s.next = t + launchEvery(w.launch, pilots);
    this.log.push({
      what: 'launch', t, id: x.a.id, ids: born.map((a) => a.id), decided: roomNow,
    });
    return this.broadcast(core, { type: 'war', op: 'born', agents: born });
  }

  /* A scripted attacker's samples, on the SAMPLE_MS grid, up to t. */
  fill(x, t) {
    const plan = x.plan;
    if (x.a.kind === 'hunter') {
      return;
    }
    if (x.next == null) {
      x.next = x.restored ? Math.max(plan.t0, Math.floor((this.match.f - SAMPLE_MS) / SAMPLE_MS) * SAMPLE_MS) : plan.t0;
    }
    /* One sample at or past t, so every millisecond up to t is between
     * two: the span's last ones are judged now, never skipped. The end on
     * the millisecond, so its arrival is covered. */
    while (x.track.newest() < t && x.next <= plan.tEnd) {
      this.sample(x, x.next);
      x.next = (Math.floor(x.next / SAMPLE_MS) + 1) * SAMPLE_MS;
    }
    if (x.track.newest() < t && x.track.newest() < plan.tEnd) {
      this.sample(x, plan.tEnd);
      x.next = Infinity;
    }
  }

  sample(x, t) {
    const o = poseAt(x.plan, t);
    x.track.push({
      t, px: o.p[0], py: o.p[1], pz: o.p[2], qx: o.q[0], qy: o.q[1], qz: o.q[2], qw: o.q[3], vx: o.v[0], vy: o.v[1], vz: o.v[2], flags: FLAG_AIRBORNE,
    });
  }

  /* The hunters, one step to the room's now, on the room tick. */
  hunt(core, roomNow) {
    const defenders = [];
    for (const f of this.flying(core)) {
      const s = f.track.s.at(-1);
      if (s) {
        defenders.push({
          seat: f.seat, p: [s.px, s.py, s.pz], v: [s.vx, s.vy, s.vz], live: clean(s) && !f.down && roomNow - s.t <= HERE_MS,
        });
      }
    }
    for (const x of this.live.values()) {
      if (x.a.kind === 'hunter' && !x.spawned && roomNow >= x.a.t0) {
        /* Home, where it patrols with no pilot in range: its route's end. */
        this.hunters.spawn(x.a.id, poseAt(x.plan, x.a.t0).p.slice(), x.a.t0, this.mission().routes[x.a.route].at(-1));
        x.spawned = true;
        this.match.spawned.push(x.a.id);
      }
    }
    if (![...this.live.values()].some((x) => x.spawned)) {
      this.lastPoses = [];
      return;
    }
    this.lastPoses = this.hunters.step(roomNow, defenders);
    this.lastStep = roomNow;
    for (const h of this.lastPoses) {
      const x = this.live.get(h.id);
      if (!x) {
        continue;
      }
      const prev = x.track.s.at(-1);
      let v;
      if (prev && roomNow > prev.t) {
        const dt = (roomNow - prev.t) / 1000;
        v = [(h.p[0] - prev.px) / dt, (h.p[1] - prev.py) / dt, (h.p[2] - prev.pz) / dt];
      } else {
        /* The nose, -z turned by q, at the kind's speed. */
        const [qx, qy, qz, qw] = h.q;
        const f = [-(2 * (qx * qz + qw * qy)), -(2 * (qy * qz - qw * qx)), -(1 - 2 * (qx * qx + qy * qy))];
        v = f.map((c) => c * KIND.hunter.speed);
      }
      x.track.push({
        t: roomNow, px: h.p[0], py: h.p[1], pz: h.p[2], qx: h.q[0], qy: h.q[1], qz: h.q[2], qw: h.q[3], vx: v[0], vy: v[1], vz: v[2], flags: FLAG_AIRBORNE,
      });
    }
  }

  /* Move the game on to what the room now knows. */
  advance(core, now) {
    const m = this.match;
    const roomNow = core.roomMs(now);
    const state = m.state;
    const out = [];
    if (m.state === 'briefing' && roomNow >= m.goAt - COUNTDOWN_MS) {
      m.state = 'countdown';
    }
    if (m.state === 'countdown' && roomNow >= m.goAt) {
      m.state = 'live';
      /* The first stage from the go, which a skipped briefing moves; or
       * the one a restart came back to. */
      this.enterStage(core, m.from ?? 0, m.goAt);
    }
    let dirty = m.state !== state;
    if (m.state === 'live') {
      const born = this.births(core, roomNow);
      dirty ||= born.length > 0;
      out.push(...born);
      this.hunt(core, roomNow);
      const judged = this.judge(core, roomNow);
      dirty ||= judged.dirty;
      out.push(...judged.out);
      const told = this.containTold(core);
      dirty ||= told.length > 0;
      out.push(...told);
      const stage = this.stageStep(core, roomNow);
      dirty ||= stage.dirty;
      out.push(...stage.out);
      /* Again after the stage: a loss in its exit (a lost stage's
       * attackers through at a gantry) is said too. */
      const after = this.containTold(core);
      dirty ||= after.length > 0;
      out.push(...after);
      const shut = this.containShut(core);
      dirty ||= shut.length > 0;
      out.push(...shut);
      const moved = this.leafWatch(core);
      dirty ||= moved.length > 0;
      out.push(...moved);
    }
    return dirty ? [...this.changed(core), ...out] : out;
  }

  /*
   * Judge the room milliseconds (f, t1] that every seat heard from in the
   * last WAIT_MS has covered, or that are LATE_MS old, and that the
   * hunters' steps have reached. Returns the messages of what happened.
   */
  judge(core, roomNow) {
    const m = this.match;
    const cut = Math.floor(roomNow - LATE_MS);
    const fly = this.flying(core);
    let t1 = Infinity;
    for (const f of fly) {
      const n = f.track.newest();
      if (n >= roomNow - WAIT_MS) {
        t1 = Math.min(t1, n);
      }
    }
    t1 = Math.floor(Math.min(roomNow, Math.max(cut, t1 === Infinity ? cut : t1)));
    if ([...this.live.values()].some((x) => x.spawned)) {
      t1 = Math.min(t1, Math.floor(this.lastStep));
    }
    if (!(t1 > m.f)) {
      return { out: [], dirty: false };
    }
    this.judgeT1 = t1;
    for (const x of this.live.values()) {
      this.fill(x, t1);
    }
    const out = [];
    let dirty = false;
    let from = m.f;
    while (m.state === 'live' && from < t1) {
      const next = this.step(core, fly, from, t1, roomNow);
      if (!next) {
        break;
      }
      dirty = true;
      out.push(...next.out);
      from = next.from;
    }
    m.f = m.state === 'live' ? t1 : m.f;
    return { out, dirty };
  }

  /*
   * The first thing to happen in (from, t1]: a detonation, a crash, or an
   * attacker at the end of its route. Applies it and returns { out, from }
   * to go on from, or null when nothing happens before t1.
   */
  step(core, fly, from, t1, roomNow) {
    let boom = null;
    const memo = new Map();
    for (const d of fly) {
      if (d.down || this.spentOut(d.seat)) {
        continue;
      }
      const start = Math.max(from, d.armFrom);
      if (!(start < t1)) {
        continue;
      }
      const dLast = d.track.s.at(-1);
      if (!dLast) {
        continue;
      }
      for (const x of this.live.values()) {
        const aLast = x.track.s.at(-1);
        if (!aLast) {
          continue;
        }
        /* Too far apart for anything in the span: each side has moved at
         * most its top speed since the span's start. */
        const blast = this.blastOf(d.seat, d.airframe);
        const reach = blast + d.hull.hull.reach + 1
          + (AGENT_MAX_MPS * Math.max(0, aLast.t - start) + POSE_MAX_SPEED * Math.max(0, dLast.t - start)) / 1000;
        const dx = aLast.px - dLast.px;
        const dy = aLast.py - dLast.py;
        const dz = aLast.pz - dLast.pz;
        if (dx * dx + dy * dy + dz * dz > reach * reach) {
          continue;
        }
        const end = boom ? Math.min(t1, boom.tc) : t1;
        if (clearOf(d.hull, d.track, x.track, start, end, memo, blast)) {
          continue;
        }
        const c = within(POINT, d.hull, x.track, d.track, start, end, blast);
        if (c && (!boom || c.tc < boom.tc)) {
          boom = { tc: c.tc, d, x };
        }
      }
    }
    const until = boom ? boom.tc : t1;
    /* A crash: the first sample showing it, after the last one not. */
    let crash = null;
    for (const d of fly) {
      if (d.down || this.spentOut(d.seat)) {
        continue;
      }
      const s = d.track.s;
      for (let i = 1; i < s.length; i += 1) {
        const t = s[i].t;
        /* A crash on `from` itself is another seat's on the same
         * millisecond as the event before: crashT keeps each seat's to one. */
        if (t < from || t <= d.armFrom || t <= d.crashT) {
          continue;
        }
        /* On a boom's millisecond the crash sample made it untouchable,
         * so the boom cannot be there: nothing to order. */
        if (t > until || (crash && t >= crash.t)) {
          break;
        }
        if ((s[i].flags & FLAG_CRASHED) && !(s[i - 1].flags & FLAG_CRASHED)) {
          crash = { t, d };
          break;
        }
      }
    }
    /* An arrival on the millisecond of a boom or a crash comes after it:
     * the defender's. With neither, the span's last one counts. An
     * attacker still alive past its end (restored after a restart) arrives
     * now. */
    const limit = crash ? crash.t : until;
    const last = !crash && !boom;
    let arrive = null;
    for (const x of this.live.values()) {
      const e = x.plan.tEnd;
      if ((e < limit || (last && e <= limit)) && (!arrive || e < arrive.plan.tEnd || (e === arrive.plan.tEnd && x.a.id < arrive.a.id))) {
        arrive = x;
      }
    }
    /* A carrier's launch before whatever else comes first (on the same
     * millisecond, the other first: a carrier killed then launches
     * nothing). */
    const first = arrive ? arrive.plan.tEnd : crash ? crash.t : boom ? boom.tc : Infinity;
    const launch = this.launchNext();
    if (launch && launch.t >= from && launch.t <= t1 && launch.t < first) {
      return { out: this.launch(core, launch, roomNow), from: launch.t };
    }
    if (arrive) {
      return { out: this.arrival(core, arrive, roomNow), from: arrive.plan.tEnd };
    }
    if (crash) {
      return { out: this.crashed(core, crash, roomNow), from: crash.t };
    }
    if (boom) {
      /* Others may go off on the same millisecond: judged again from
       * the one before it, without the dead. */
      return { out: this.detonate(core, boom, fly, roomNow), from: boom.tc - 1 };
    }
    return null;
  }

  /* Take attackers off: the samples, the hunters, and, when a warhead
   * `killed` them, the scouts' count (a scout that got away is not dead,
   * section 4.2). */
  remove(ids, killed = false) {
    const m = this.match;
    const gone = new Set(ids);
    for (const a of m.agents) {
      if (killed && gone.has(a.id) && m.scouts && a.kind === 'scout' && a.wave === m.scouts.wave) {
        m.scouts.killed += 1;
      }
    }
    m.agents = m.agents.filter((a) => !gone.has(a.id));
    m.spawned = m.spawned.filter((id) => !gone.has(id));
    for (const id of ids) {
      this.live.delete(id);
      this.hunters.kill(id);
      if (m.hurt) {
        delete m.hurt[id];
      }
      if (m.launches) {
        delete m.launches[id];
      }
    }
  }

  detonate(core, boom, fly, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const { tc, d, x } = boom;
    const c = trackPose(x.track, tc);
    const p = [c.px, c.py, c.pz];
    const warhead = this.loadoutOf(d.seat).warhead;
    /* A penetrator's first hit of an airframe takes that one attacker and
     * the flight goes on; the next goes off as a standard warhead. */
    const pierce = warhead === 'penetrator' && !(d.rec.piercedAt > (d.rec.spentAt ?? -Infinity));
    const radius = this.blastOf(d.seat, d.airframe);
    const killed = [];
    const hurt = [];
    const stalled = [];
    for (const y of this.live.values()) {
      const q = y === x ? c : trackPose(y.track, tc, {});
      const r = q ? Math.hypot(q.px - p[0], q.py - p[1], q.pz - p[2]) : Infinity;
      if (y === x || (!pierce && r <= radius)) {
        /* A kind of more than one hp takes a detonation each, but a
         * penetrator's hit takes all of it (TECH-NEEDS T1.7). Its hits so
         * far are the match's (m.hurt), so a restore keeps them. */
        const hits = (m.hurt?.[y.a.id] ?? 0) + 1;
        if (!pierce && hits < hpOf(y.a.kind)) {
          (m.hurt ??= {})[y.a.id] = hits;
          hurt.push(y.a);
        } else {
          killed.push(y.a);
        }
      } else if (warhead === 'emp' && !pierce && r <= EMP_M) {
        stalled.push(y);
      }
    }
    killed.sort((a, b) => a.id - b.id);
    hurt.sort((a, b) => a.id - b.id);
    for (const a of killed) {
      this.noteGone(a, tc, 'kill');
    }
    const player = m.players[d.seat] ??= {
      kills: 0, assists: 0, mw: 0, token: d.token,
    };
    /* An airframe hit before it ever took off was no defence the pilot
     * flew: its warhead still goes off and the airframe is lost, but the
     * attackers it takes are no kill, no worth and no airframe earned. */
    const flown = d.rec.launched > this.sinceOf(d.rec);
    const credited = flown ? killed : [];
    player.kills += credited.length;
    for (const a of credited) {
      player.mw += a.target != null && a.kind !== 'decoy' ? worthOf(mission, m.stage, m, a.target) : 0;
    }
    /* Assists, as kills, count on a death only (T1.7). */
    for (const o of killed.length ? fly : []) {
      if (o.seat === d.seat || !m.players[o.seat]) {
        continue;
      }
      if (o.trail.some(([t, x, y, z]) => t >= tc - ASSIST_MS && t <= tc && Math.hypot(x - p[0], y - p[1], z - p[2]) <= ASSIST_M)) {
        m.players[o.seat].assists += 1;
      }
    }
    if (pierce) {
      d.rec.piercedAt = tc;
    } else {
      d.rec.down = { at: tc, seen: false };
      d.down = d.rec.down;
      this.spend(d.seat, tc);
    }
    m.earned ??= {};
    m.earned[d.seat] = (m.earned[d.seat] ?? 0) + credited.length;
    const ids = killed.map((a) => a.id);
    const scoutsWere = m.scouts ? m.scouts.killed : 0;
    m.lastGone = tc;
    this.remove(ids, true);
    const scoutsDown = Boolean(m.scouts) && scoutsWere < m.scouts.n && m.scouts.killed >= m.scouts.n;
    this.log.push({
      what: 'boom', t: tc, seat: d.seat, id: x.a.id, ids, decided: roomNow, ...(pierce ? { pierce: true } : {}), ...(hurt.length ? { hurt: hurt.map((a) => a.id) } : {}),
    });
    const at = p.map(mm);
    const out = pierce ? [] : this.broadcast(core, {
      type: 'war', op: 'boom', seat: d.seat, at: tc, p: at,
    });
    if (hurt.length) {
      out.push(...this.broadcast(core, {
        type: 'war', op: 'hurt', ids: hurt.map((a) => a.id), hp: hurt.map((a) => hpOf(a.kind) - m.hurt[a.id]), at: tc, by: d.seat, p: at,
      }));
    }
    if (ids.length) {
      out.push(...this.broadcast(core, {
        type: 'war', op: 'dead', ids, credited: credited.map((a) => a.id), at: tc, by: d.seat, why: pierce ? 'pierce' : 'boom', p: at, ...(scoutsDown ? { scouts: true } : {}),
      }));
    }
    if (stalled.length) {
      out.push(...this.stall(core, stalled, tc));
    }
    if (!pierce) {
      out.push(...this.strike(core, p, defenderCharge(warhead), tc, 'defender'));
    }
    this.settle(tc);
    return out;
  }

  /* An EMP's stall: every one of these waits EMP_MS from tc, its route's
   * clock stopped (routes.js), a Hunter where it is (warhunt.js). */
  stall(core, list, tc) {
    const m = this.match;
    const mission = this.mission();
    m.disabled ??= {};
    for (const y of list) {
      m.disabled[y.a.id] = tc + EMP_MS;
      if (y.a.kind === 'hunter') {
        this.hunters.stall(y.a.id, tc + EMP_MS);
        continue;
      }
      y.a.stalls = [...(y.a.stalls ?? []), [tc, EMP_MS]];
      y.plan = planAgent(mission, y.a);
      /* Its lines are crossed later now (stages.js { crossed }). */
      const b = m.stage && m.stage.ev.find((e) => e.e === 'born' && e.id === y.a.id);
      if (b) {
        b.cross = crossings(mission, y.plan);
      }
      y.track = new Track(AGENT_KEEP_MS);
      y.next = null;
      y.restored = true;
      this.fill(y, this.judgeT1 ?? tc);
    }
    return this.broadcast(core, {
      type: 'war', op: 'stall', ids: list.map((y) => y.a.id), at: tc, ms: EMP_MS,
    });
  }

  crashed(core, crash, roomNow) {
    const m = this.match;
    crash.d.rec.crashT = crash.t;
    crash.d.crashT = crash.t;
    if ((m.roundState ?? 'live') === 'live') {
      this.spend(crash.d.seat, crash.t);
    }
    this.log.push({
      what: 'crash', t: crash.t, seat: crash.d.seat, decided: roomNow,
    });
    this.settle(crash.t);
    return [];
  }

  arrival(core, x, roomNow) {
    const m = this.match;
    const a = x.a;
    const t = x.plan.tEnd;
    const o = poseAt(x.plan, t);
    if (x.plan.end === 'wire') {
      return this.onWire(core, x, t, o, roomNow);
    }
    const target = a.target != null ? this.mission().targets[a.target] : null;
    const hit = Boolean(target) && a.kind !== 'decoy' && Math.abs(a.err) <= (target.hitR ?? target.r);
    const cost = this.take(a, hit, t);
    this.noteGone(a, t, x.plan.end === 'arrive' ? 'arrive' : 'leave', hit);
    m.lastGone = t;
    this.remove([a.id]);
    this.log.push({
      what: x.plan.end, t, id: a.id, target: a.target, hit, decided: roomNow,
    });
    const msg = {
      type: 'war', op: 'dead', ids: [a.id], at: mm(t), by: 0, why: x.plan.end, p: o.p.map(mm),
    };
    if (target) {
      msg.target = a.target;
      msg.hit = hit;
      msg.mw = cost;
    }
    const out = this.broadcast(core, msg);
    /* Its warhead goes off where it arrived, hit or miss: a scout
     * leaving or a jammer parking carries none. */
    if (x.plan.end === 'arrive') {
      out.push(...this.strike(core, o.p, attackerCharge(a.kind), t, a.kind));
    }
    this.settle(t);
    return out;
  }

  /* An attacker that flew into a power line at t: dead where it struck,
   * by nobody, its target untouched. A scout that does so is as dead as
   * one a warhead took. */
  onWire(core, x, t, o, roomNow) {
    const m = this.match;
    const a = x.a;
    const scoutsWere = m.scouts ? m.scouts.killed : 0;
    m.lastGone = t;
    this.remove([a.id], true);
    this.noteGone(a, t, 'wire');
    const scoutsDown = Boolean(m.scouts) && scoutsWere < m.scouts.n && m.scouts.killed >= m.scouts.n;
    this.log.push({
      what: 'wire', t, id: a.id, kind: a.kind, decided: roomNow,
    });
    const out = this.broadcast(core, {
      type: 'war', op: 'dead', ids: [a.id], at: mm(t), by: 0, why: 'wire', p: o.p.map(mm), ...(scoutsDown ? { scouts: true } : {}),
    });
    /* Its warhead goes off on the line. */
    out.push(...this.strike(core, o.p, attackerCharge(a.kind), t, a.kind));
    this.settle(t);
    return out;
  }

  /* Won or lost, at t, after anything that changed the count. */
  settle(t) {
    const m = this.match;
    const mission = this.mission();
    if (m.output < mission.floorMw) {
      this.finish(t, 'lost', 'output');
    }
  }

  /* An attacker at its target at t: the target's mw off the output, once.
   * Returns what it cost: 0 for a miss or a target already down. */
  take(a, hit, t) {
    return hit ? this.lose(a.target, t) : 0;
  }

  /* A target lost at t, by a hit or by what broke: its mw off the output,
   * once, and returned (0 when it cost nothing). A target the mission
   * does not name costs nothing. */
  lose(id, t) {
    const m = this.match;
    const target = this.mission().targets[id];
    if (!target || m.down.includes(id)) {
      return 0;
    }
    if (GANTRIES[id]) {
      return this.gantryHit(id, t);
    }
    m.down.push(id);
    (m.downAt ??= {})[id] = t;
    if (m.stage) {
      note(m.stage, { t, e: 'down', target: id });
    }
    /* A working gate while the spill runs costs more (stages.js worthOf). */
    const mw = worthOf(this.mission(), m.stage, m, id);
    m.output = Math.max(0, m.output - mw);
    m.roundMw = (m.roundMw ?? 0) + mw;
    return mw;
  }

  /* A gantry hit at t (contain.js): while it lowers stoplogs the plant
   * cannot be made safe, and the mission is lost at once (MISSIONS.md 1.9
   * point 6). One hit while it closes nothing costs nothing, and it stands
   * for the next opening. Returns the mw it cost: none. */
  gantryHit(id, t) {
    const m = this.match;
    const x = runningAt(m.contain, id, t);
    if (!x) {
      return 0;
    }
    x.c.lost = t;
    m.down.push(id);
    (m.downAt ??= {})[id] = t;
    if (m.stage) {
      note(m.stage, { t, e: 'down', target: id });
    }
    this.finish(t, 'lost', 'shutdown');
    return 0;
  }

  /* Every hoist move of the match (stages.js gatesOf): the stages' before
   * this one, then this one's. */
  gates() {
    const m = this.match;
    return [...(m.gates ?? []), ...(m.stage ? gatesOf(this.mission(), m.stage, m) : [])];
  }

  /*
   * A warhead `w` ({ charge, r }, damage.js) gone off at p, at room ms t,
   * by `by` (an attacker kind or 'defender'): what it broke of the map's
   * structures, kept in the match and sent to everybody, each target it
   * cost lost. p is to the millimetre, as the messages carry it.
   */
  strike(core, p, w, t, by) {
    const m = this.match;
    const structures = STRUCTURES[this.mission().map];
    if (!structures || !w) {
      return [];
    }
    m.wreck ??= {};
    m.damage ??= [];
    const at = p.map(mm);
    const out = [];
    const turnOf = (id) => this.leafTurnAt(structures[id], id, t);
    for (const r of blast(structures, m.wreck, at, w, mm(t), turnOf)) {
      r.openings = this.stoplogged(r.target, r.openings);
      /* Where its leaf stood when its holes were last told. */
      if (r.openings.length && structures[r.target].frame.hinge) {
        m.wreck[r.target].leafOpen = this.gateOpen(structures[r.target], r.target, t);
      }
      const e = {
        seq: m.damage.length, ...r, p: at, by,
      };
      m.damage.push(e);
      /* Lines whose gantry fell: no attacker born from now strikes them. */
      if (r.cut.length) {
        m.cut = [...(m.cut ?? []), ...r.cut];
      }
      if (r.down) {
        this.lose(r.target, mm(t));
      }
      /* A first opening is a breach, for the stages' triggers. */
      if (r.openings.length && !m.breaches?.some((b) => b.target === r.target)) {
        this.breach(r.target, mm(t));
      }
      this.log.push({
        what: 'damage', t, target: r.target, chunks: r.chunks.length, open: r.openings.length > 0, down: r.down,
      });
      out.push(...this.broadcast(core, { type: 'war', op: 'damage', ...e }));
    }
    return out;
  }

  /*
   * THE GATES' STATE: the match's hoist moves (gates(), [{ gate, at,
   * open_m }], the stage engine's, stored with the match and in its
   * view), each gate's leaf on its hoist (src/share/war/hoist.js), what
   * a warhead meets and where its holes are (src/share/war/leaf.js). Gate `id`'s opening at
   * room ms t, within its hinge's travel, and its leaf's turn then.
   */
  gateOpen(s, id, t) {
    const h = s.frame.hinge;
    const o = openAt(this.gates(), id, t);
    return o < 0 ? 0 : o > h.max ? h.max : o;
  }

  leafTurnAt(s, id, t) {
    return s && s.frame.hinge ? leafTurn(s.frame.hinge, this.gateOpen(s, id, t)) : REST;
  }

  /*
   * A gate's leaf with holes in it, moving: its opening told again (an
   * op 'damage' with no chunks, the same opening id, stamped with the
   * room ms of the move, never the break's) every LEAF_RESEND_M of its
   * lip's travel and where its hoist stops, on the judgement's clock (f).
   */
  leafWatch(core) {
    const m = this.match;
    const structures = STRUCTURES[this.mission().map];
    if (!structures || !m.wreck) {
      return [];
    }
    const out = [];
    const t = m.f;
    for (const [id, st] of Object.entries(m.wreck)) {
      const s = structures[id];
      if (!s || !s.frame.hinge || !st.open || st.leafOpen == null) {
        continue;
      }
      const o = this.gateOpen(s, id, t);
      const stopped = o !== st.leafOpen && o === this.gateOpen(s, id, t + 1000);
      if (!(Math.abs(o - st.leafOpen) >= LEAF_RESEND_M || stopped)) {
        continue;
      }
      st.leafOpen = o;
      const r = leafMoved(id, s, st, mm(t), leafTurn(s.frame.hinge, o));
      if (!r) {
        continue;
      }
      const e = {
        seq: m.damage.length, ...r, openings: this.stoplogged(id, r.openings), p: null, by: 'hoist',
      };
      m.damage.push(e);
      out.push(...this.broadcast(core, { type: 'war', op: 'damage', ...e }));
    }
    return out;
  }

  /*
   * Enter stage idx at room ms `at` (src/share/war/stages.js): its spawns'
   * times drawn, its clock the round's (roundAt, what the HUD counts the
   * next wave from), and, a round, every pilot's airframes back.
   */
  enterStage(core, idx, at) {
    const m = this.match;
    const mission = this.mission();
    const def = this.stages()[idx];
    m.entries = (m.entries ?? 0) + 1;
    /* What a restart from this stage starts from (start's checkpoint):
     * the match as the stage opens, before entering it changes it. */
    m.checkpoint = {
      idx,
      id: def.id,
      entry: m.entries,
      seed: m.seed,
      output: m.output,
      down: m.down.slice(),
      downAt: { ...(m.downAt ?? {}) },
      breaches: (m.breaches ?? []).map((b) => ({ ...b })),
      at,
      contain: JSON.parse(JSON.stringify(m.contain ?? [])),
      wreck: JSON.parse(JSON.stringify(m.wreck ?? {})),
      damage: (m.damage ?? []).map((e) => ({ ...e })),
      cut: (m.cut ?? []).slice(),
      path: (m.path ?? []).map((x) => ({ ...x })),
      sets: m.sets ?? null,
      gates: this.gates().map((g) => ({ ...g })),
      was: m.was ?? null,
      round: m.round ?? 0,
      roundsIn: m.roundsIn ?? null,
      results: (m.results ?? []).slice(),
      lossy: Boolean(m.lossy),
      scouts: m.scouts ? { ...m.scouts } : null,
      wave: m.wave,
      nextAgent: m.nextAgent,
    };
    /* The hoists the stage leaving moved stay where it left them. */
    m.gates = this.gates();
    m.stage = enter(mission, idx, at, m.seed, m.entries, { was: m.was ?? null, pilots: Math.max(1, this.players(core).length) });
    (m.path ??= []).push({ id: def.id, at });
    m.roundState = 'live';
    m.roundResult = null;
    m.roundMw = 0;
    m.roundAt = at;
    m.nextRoundAt = null;
    if (def.round) {
      m.round = m.roundsIn == null ? 0 : (m.round ?? 0) + 1;
      m.roundsIn = (m.roundsIn ?? 0) + 1;
      m.spent = {};
      m.earned = {};
    }
  }

  /* What the stage's triggers read (stages.js fired), at the frontier. */
  stageCtx(core, roomNow) {
    const m = this.match;
    const st = m.stage;
    const here = this.players(core);
    const f = m.f;
    const pilots = [];
    for (const d of this.flying(core)) {
      const p = here.includes(d.seat) ? trackPose(d.track, f, {}) : null;
      if (p) {
        pilots.push({ seat: d.seat, p: [p.px, p.py, p.pz] });
      }
    }
    const allowed = here.reduce((sum, seat) => sum + this.allowance(seat), 0);
    const spent = here.reduce((sum, seat) => sum + (m.spent?.[seat] ?? 0), 0);
    /* A stage cannot clear while a closure is open, and one that was
     * waiting on it clears when it is held (MISSIONS.md 1.9 point 4). */
    const held = lastHeld(m.contain, f);
    return {
      mission: this.mission(),
      m,
      st,
      f,
      here,
      pilots,
      spent: allowed > 0 ? spent / allowed : 0,
      allBorn: allBorn(st),
      cleared: !m.agents.some((a) => a.kind !== 'scout') && !containOpen(m.contain, f),
      lastGone: held == null ? m.lastGone : Math.max(m.lastGone ?? held, held),
      allOut: here.length > 0 && !here.some((seat) => this.stillFlying(seat, roomNow)),
      /* { contained: true }: no closure open, since the last was held
       * (or the entry): an exit that is not a loss waits on it where it
       * does not wait on `cleared` (The Long Night's, which end on their
       * groups gone). */
      /* A hold's pause (stages.js): the gantry it names closing. */
      pauses: (gantry) => pausesOf(m.contain, gantry),
      trigger: (trig) => (trig.contained ? (containOpen(m.contain, f) ? null : Math.max(st.at, held ?? st.at)) : undefined),
    };
  }

  /*
   * The stage, after the judgement: its triggered spawns timed, its
   * objectives settled, its cues told, and its exit taken when one fires
   * (stages.js exitDue): the attackers left cleared as it says, a round's
   * result counted, and then the end, the next stage at once, or the
   * next after `after` ms of result (roundState 'result', the round's
   * card). Every time here is the judgement's.
   */
  stageStep(core, roomNow) {
    const m = this.match;
    const out = [];
    if (m.state !== 'live' || !m.stage) {
      return { out, dirty: false };
    }
    if ((m.roundState ?? 'live') === 'result') {
      if (roomNow < m.nextRoundAt) {
        return { out, dirty: false };
      }
      this.enterStage(core, m.stage.next, m.nextRoundAt);
      /* Its first spawns told now, not a tick later: in between, a
       * screen counted to a wave that was already being announced. */
      return { out: this.births(core, roomNow), dirty: true };
    }
    const ctx = this.stageCtx(core, roomNow);
    const st = m.stage;
    arm(ctx);
    const objWas = JSON.stringify(st.obj);
    objectives(ctx);
    let dirty = JSON.stringify(st.obj) !== objWas;
    /* A hold that reroutes (an objective's `restore`, TECH-NEEDS T1.10)
     * feeds its districts round the yard from the room ms it held, the
     * moment its line is cued, not the stage's exit, which waits on the
     * sky being clear too. Kept on the stage's own path entry, the last
     * (enterStage pushes it). */
    const entry = m.path?.at(-1);
    for (const o of this.stages()[st.idx].objectives ?? []) {
      if (entry && o.restore && st.obj[o.id]?.state === 'done' && !(entry.restores ?? []).some((r) => r.id === o.id)) {
        (entry.restores ??= []).push({ id: o.id, at: st.obj[o.id].t, districts: o.restore.slice() });
        dirty = true;
      }
    }
    const cues = dueCues(ctx);
    if (cues.length) {
      dirty = true;
      out.push(...this.broadcast(core, {
        type: 'war', op: 'cue', cues: cues.map(({ t, cue: { when: _w, at: _a, ...cue } }) => ({ ...cue, at: t, stage: st.id })),
      }));
    }
    const due = exitDue(ctx);
    if (!due) {
      return { out, dirty };
    }
    out.push(...this.takeExit(core, ctx, due, roomNow));
    return { out, dirty: true };
  }

  /* The stage left by `due` ({ exit, t, k }, exitDue's): the attackers
   * cleared as it says, its result counted, and then the end, the next
   * stage at once, or the next after its beat. Returns what to send. */
  takeExit(core, ctx, due, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const st = m.stage;
    const out = [];
    const { exit, t, k } = due;
    const def = this.stages()[st.idx];
    const result = exit.result === 'auto' ? ((m.roundMw ?? 0) > 0 || failedAny(st) ? 'damaged' : 'win') : (exit.result ?? null);
    /* What the next stage adapts to (stages.js enter), read before the
     * clear moves anything. */
    m.was = leftBy(st, ctx.spent);
    if (exit.clear) {
      out.push(...this.clearAll(core, exit.clear === 'through', t, roomNow));
    }
    if (def.round) {
      this.log.push({
        what: 'round', t, round: m.round ?? 0, result, mw: m.roundMw ?? 0, earned: Object.values(m.earned ?? {}).reduce((sum, n) => sum + n, 0),
      });
    }
    this.log.push({
      what: 'stage', t, stage: st.id, exit: k, decided: roomNow,
    });
    const beat = beatOf(exit, m.seed, st, k);
    if (def.round || beat > 0) {
      m.roundState = 'result';
      m.roundResult = result;
    }
    if (def.round) {
      (m.results ??= []).push(result);
      if (ctx.here.some((seat) => (m.spent?.[seat] ?? 0) > (m.earned?.[seat] ?? 0))) {
        m.lossy = true;
      }
    }
    this.settle(t);
    if (m.state !== 'live') {
      return out;
    }
    const to = exitTarget(mission, st, exit, m.seed, k);
    if (to === 'won' || to === 'lost') {
      this.finish(t, to, exit.why ?? 'stages');
      return out;
    }
    if (beat > 0) {
      st.next = to;
      m.nextRoundAt = t + beat;
    } else {
      this.enterStage(core, to, t);
      out.push(...this.births(core, roomNow));
    }
    return out;
  }

  /*
   * The host's developer ops (the header's skip and complete), at the
   * judgement's frontier: the match is advanced to now first, so what
   * they settle comes after everything already judged. Refused 'off'
   * outside a live stage or during a round's result, 'objective' for an
   * objective the stage does not have, 'way' for a stage with no exit but
   * a loss.
   */
  devOp(core, conn, msg, now) {
    if (core.meta.public) {
      return this.error(conn, 'public');
    }
    if (!this.devMissions && !core.devHost()) {
      return this.error(conn, 'dev');
    }
    const m = this.match;
    if (!m || m.state !== 'live' || !m.stage || (m.roundState ?? 'live') === 'result') {
      return this.error(conn, 'off');
    }
    const out = this.advance(core, now);
    if (m.state !== 'live' || (m.roundState ?? 'live') === 'result') {
      return out;
    }
    const roomNow = core.roomMs(now);
    const st = m.stage;
    const def = this.stages()[st.idx];
    if (msg.op === 'complete') {
      const ids = (def.objectives ?? []).map((o) => o.id);
      if (msg.objective != null && !ids.includes(msg.objective)) {
        return [...out, ...this.error(conn, 'objective')];
      }
      for (const id of msg.objective != null ? [msg.objective] : ids) {
        if ((st.obj[id]?.state ?? 'active') === 'active') {
          st.obj[id] = { ...st.obj[id], state: 'done', t: m.f };
        }
      }
      this.log.push({
        what: 'dev', op: 'complete', t: m.f, stage: st.id, objective: msg.objective ?? null,
      });
      const step = this.stageStep(core, roomNow);
      return [...out, ...this.changed(core), ...step.out];
    }
    const ctx = this.stageCtx(core, roomNow);
    const k = (def.exits ?? []).findIndex((x, i) => x.result !== 'lost' && exitTarget(this.mission(), st, x, m.seed, i) !== 'lost');
    if (k < 0) {
      return [...out, ...this.error(conn, 'way')];
    }
    this.log.push({
      what: 'dev', op: 'skip', t: m.f, stage: st.id,
    });
    const taken = this.takeExit(core, ctx, { exit: def.exits[k], t: m.f, k }, roomNow);
    return [...out, ...this.changed(core), ...taken];
  }

  /* Every attacker alive at the end of a stage, at t: with `through`, each
   * with a target gets through, taking it as an arrival would; the rest
   * go. */
  clearAll(core, through, t, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const out = [];
    for (const a of [...m.agents]) {
      const x = this.live.get(a.id);
      /* One bound for a power line on its way never gets through. */
      const goes = through && a.target != null && !(x && x.plan.end === 'wire');
      const target = goes ? mission.targets[a.target] : null;
      const hit = goes && a.kind !== 'decoy' && Math.abs(a.err) <= (target.hitR ?? target.r);
      const cost = goes ? this.take(a, hit, t) : 0;
      this.noteGone(a, t, goes ? 'arrive' : 'leave', hit);
      const o = x && a.kind !== 'hunter' ? poseAt(x.plan, Math.min(Math.max(t, x.plan.t0), x.plan.tEnd)) : null;
      const h = a.kind === 'hunter' ? this.lastPoses.find((q) => q.id === a.id) : null;
      const p = (o ? o.p : h ? h.p : [0, 0, 0]).map(mm);
      this.remove([a.id]);
      this.log.push({
        what: goes ? 'through' : 'cleared', t, id: a.id, target: a.target, hit, decided: roomNow,
      });
      const msg = {
        type: 'war', op: 'dead', ids: [a.id], at: t, by: 0, why: goes ? 'arrive' : 'leave', p,
      };
      if (goes) {
        msg.target = a.target;
        msg.hit = hit;
        msg.mw = cost;
      }
      out.push(...this.broadcast(core, msg));
      /* Through is an arrival: its warhead goes off at its aim point. */
      if (goes && x && a.kind !== 'hunter') {
        out.push(...this.strike(core, poseAt(x.plan, x.plan.tEnd).p, attackerCharge(a.kind), t, a.kind));
      }
    }
    return out;
  }

  /* The group an attacker's spawn named, for the stage's counts. */
  groupOf(a) {
    return a.group ?? wavesOf(this.stages())[a.wave]?.group ?? null;
  }

  /* An attacker gone at t, `how` (stages.js note), for the triggers. */
  noteGone(a, t, how, hit = false) {
    if (this.match.stage) {
      note(this.match.stage, {
        t, e: 'gone', id: a.id, kind: a.kind, group: this.groupOf(a), sector: a.sector ?? null, how, hit,
      });
    }
  }

  /*
   * An opening in the dam at room ms t (the dam break's contract: the
   * room's 'damage' event), what a stage's { breach } trigger waits for.
   * The damage code calls it as it judges one.
   */
  breach(target, t) {
    const m = this.match;
    if (!m || m.state !== 'live') {
      return;
    }
    (m.breaches ??= []).push({ target, at: t });
    /* Contain (contain.js), in a mission that runs it: the gantry serving
     * the opened structure starts to close it. */
    const c = this.mission().contain ? closureFor(target, t) : null;
    if (c) {
      (m.contain ??= []).push(c);
    }
  }

  /*
   * Each closure held by now has its opening told again at zero size, at
   * its hold (MISSIONS.md 1.9 point 5, contain.js shutDue): an op 'damage'
   * with no chunks, kept with the match's damage for a late joiner, which
   * the flood takes as the hole shut (src/maps/itaipu/water/flood.js).
   * The stoplogs stay down, so the target's later holes, and its holes
   * moved with its leaf, are told at zero size (stoplogged). An opening the room recorded with no hole (a
   * breach without damage) sends nothing.
   */
  containShut(core) {
    const m = this.match;
    const structures = STRUCTURES[this.mission().map];
    const out = [];
    for (const x of shutDue(m.contain, m.f)) {
      const st = m.wreck?.[x.c.target];
      if (!st || !st.open) {
        continue;
      }
      st.shut = x.until;
      const e = {
        seq: m.damage.length,
        target: x.c.target,
        at: x.until,
        chunks: [],
        fell: [],
        openings: [{ ...st.open, at: x.until, width_m: 0, height_m: 0 }],
        down: false,
        health: structures?.[x.c.target] ? healthOf(structures[x.c.target], st) : null,
        cut: [],
        p: null,
        by: 'stoplogs',
      };
      m.damage.push(e);
      out.push(...this.broadcast(core, { type: 'war', op: 'damage', ...e }));
    }
    return out;
  }

  /* A target's openings as told: at zero size once its stoplogs are down
   * (containShut), so its holes still move with its leaf and are told
   * where they are, but pass no water. The wreck keeps their real size. */
  stoplogged(id, openings) {
    if (this.match.wreck?.[id]?.shut == null) {
      return openings;
    }
    return openings.map((o) => ({ ...o, width_m: 0, height_m: 0 }));
  }

  /* The closures' lines now due (contain.js linesDue), told as a stage's
   * cues are: the opening, the turn at the gantry, the half, held or lost. */
  containTold(core) {
    const m = this.match;
    const lines = linesDue(m.contain, this.mission().contain?.op ?? null, m.f);
    if (!lines.length) {
      return [];
    }
    return this.broadcast(core, {
      type: 'war', op: 'cue', cues: lines.map(({ t, radio }) => ({ radio, at: t, stage: m.stage ? m.stage.id : null })),
    });
  }

  /* A pilot says it is ready for what comes next: a stage's { ready }. */
  ready(core, conn, s, now) {
    const m = this.match;
    if (!m || m.state !== 'live' || !m.stage) {
      return this.error(conn, 'off');
    }
    m.stage.ready[s.seat] ??= Math.ceil(core.roomMs(now));
    return this.changed(core);
  }

  finish(t, state, why) {
    const m = this.match;
    m.state = state;
    m.why = why;
    m.endAt = t;
    m.f = t;
  }

  /*
   * AGENTS to every seat: the hunters' newest poses, each at its interest
   * band's rate by the distance from the seat's own newest pose (core.js
   * INTEREST), every one to a seat not flying.
   */
  agentsOut(core, roomNow) {
    if (!this.lastPoses.length) {
      return [];
    }
    const out = [];
    for (const [conn, s] of core.seats) {
      const rec = this.seats.get(s.seat);
      const here = rec && rec.token === s.token ? rec.track.s.at(-1) : null;
      const at = here && roomNow - here.t <= HERE_MS ? [here.px, here.py, here.pz] : null;
      let sent = this.sent.get(s.seat);
      if (!sent) {
        sent = new Map();
        this.sent.set(s.seat, sent);
      }
      const list = [];
      for (const h of this.lastPoses) {
        const last = sent.get(h.id);
        if (last != null && core.tickNo - last < interestEvery(at, h.p)) {
          continue;
        }
        sent.set(h.id, core.tickNo);
        list.push({ id: h.id, kind: KIND_ID.get('hunter'), p: h.p, q: h.q, target: h.target });
      }
      if (list.length) {
        out.push({ send: conn, data: encodeAgents(this.lastStep, list) });
        out.push({ send: conn, data: encodeHunts(this.lastStep, list) });
      }
    }
    /* A watcher flies nothing, so it is every hunter's far band: each
     * one, every tick, as to a seat not flying. */
    if (core.watchers.size) {
      const list = this.lastPoses.map((h) => ({
        id: h.id, kind: KIND_ID.get('hunter'), p: h.p, q: h.q, target: h.target,
      }));
      const agents = encodeAgents(this.lastStep, list);
      const hunts = encodeHunts(this.lastStep, list);
      for (const conn of core.watchers.keys()) {
        out.push({ send: conn, data: agents }, { send: conn, data: hunts });
      }
    }
    return out;
  }
}
