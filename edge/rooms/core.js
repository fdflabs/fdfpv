/*
 * core.js: one room's logic, with no Cloudflare API in it.
 *
 * edge/rooms/do.js is the thin Durable Object adapter around this, and
 * scripts/rooms-selftest.js drives it in plain Node. Every entry point
 * takes the time and returns what to do as a list of actions, so the
 * adapter is a loop over them and a check reads them:
 *
 *   { send: conn, data }            a text (string) or binary (Uint8Array) message
 *   { close: conn, code, reason }   close that socket
 *   { attach: conn, value }         store this with the socket, to survive a hibernation
 *   { store: key, value }           keep this in the room's storage, the same; host.js
 *                                   hands it back to this[key].restore() on load (a war match)
 *   { tick: true }                  call tick() again in TICK_MS
 *   { empty: true }                 nobody is left: schedule the purge
 *
 * A conn is whatever handle the adapter uses for a socket (a WebSocket
 * there, a plain object here); the core keys its seats on it and never
 * looks inside.
 *
 * WHAT OWNS WHAT. A Durable Object runs one event at a time, so this object
 * is the only owner of the room's state and nothing locks. What must
 * survive a hibernation (who holds which seat, their token, name and
 * profile) is in each socket's attachment and is rebuilt by restore().
 * What may be lost with it is in memory only: the latest poses (a room
 * that hibernated had nobody flying), the rate counters, and the kick
 * list, which by the owner's decision is never written anywhere and is
 * worth nothing once the room is empty.
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
  CLOSE, POSE_BYTES, PROTO, PUBLIC_CAP, ROOM_FLOOR, TYPE_POSE, checkProfile, encodeBatch, validId, validNamePick,
} from '../../src/share/roomwire.js';
import { retiredMap } from '../../src/maps/retired.js';
import { PRESET_IDS } from '../../src/game/weather.js';
import { Referee } from './referee.js';
import { RoomSafety } from './safety.js';
import {
  ROOM_SETUPS, TYPE_FOOT, TYPE_PARTS, WAR_JOIN,
} from '../../src/share/roomwire.js';
import { madeFor, minPlayersFor, modeById, modeOfRoom } from '../../src/share/modes.js';
import { released } from '../../src/game/campaign.js';
import * as wrecks from './wrecks.js';
import { RoomWar } from './war.js';
import { RoomOps } from './ops.js';
import { RoomGameLobby, warMission } from './gamelobby.js';
import { TIME_NAMES, clockOfTime, missionClock } from '../../src/share/daytime.js';
import { MISSIONS, missionTime } from '../../src/share/war/missions/index.js';
import { stagesOf } from '../../src/share/war/stages.js';
import { RoomVoice, VOICE_PER_S } from './voice.js';
import { onFoot } from './foot.js';

/* Event kinds each phase's module answers (docs/MULTIPLAYER-PLAN.md;
 * ownership in fdfpv-loop/multiplayer/COORD.md). */
const EVENTS = {
  crash: wrecks.onCrash,
};

export const TICK_MS = 1000 / 30;
/* Private rooms by the owner's decision (docs/MULTIPLAYER-PLAN.md section
 * 14, answer 6). A public room's is roomwire.js PUBLIC_CAP, 16. */
export const PRIVATE_CAP = 8;
/* Watchers a room seats beside its pilots (docs/FLIGHTCLUB-PROGRESSION.md
 * section 3): apart from the cap, and capped on their own so a room
 * cannot be flooded with sockets that each cost a pose stream. */
export const WATCH_CAP = 8;
/* A client samples 30 poses a second on its plant's clock and sends each
 * frame's together (src/main.js roomPoseStep), so a slow frame arrives as
 * a burst: a one second window can hold ceil(1000 / P) frames of P / 33
 * poses each, 30 plus one frame's worth, which is 42 at a frame of 400 ms
 * (LATE_MS: a slower frame's poses are too late to judge anyway). */
export const POSE_PER_S = 45;
export const TEXT_PER_S = 5;
/* The clock's pings ({ type: 't' }) have an allowance of their own. A
 * client syncing its clock sends 1000 / SYNC_GAP_MS of them a second
 * (src/share/roomclock.js, four), for two seconds after every welcome and
 * later still on a page that was stalled; counted with the rest, a phrase
 * and a wave said then made six, and the wave was dropped without a word
 * (the live rooms:safety check, 2026-09-28). rooms:selftest checks the
 * client's rate fits under this one. */
export const CLOCK_PER_S = 5;
/* Every text counts toward this, the clock's pings too. */
export const TEXT_CLOSE_PER_S = 20;
/* New joins a minute from one address, in one room. One address is often
 * a whole household (siblings on one Wi-Fi, a school behind one NAT), so
 * it is sized for a full public room joining at once, twice over: it
 * stops a script's join and leave churn, never a family filling a room.
 * A seat taken back after a drop is not a new join. */
export const JOINS_PER_MIN = 2 * PUBLIC_CAP;
export const KICK_MS = 30 * 60 * 1000;
/* A room no host has set the air of, and one from before weather. */
const CALM = { preset: 'calm', seed: 0 };

/*
 * A kick or a removal keeps out that PLAYER, their seat token, for its
 * time, never their address: the owner's decision (2026-09-28), because
 * an address is often a household, and a sibling on the same Wi-Fi must
 * still get in. Against the one kicked coming straight back from a fresh
 * browser, new joins to this room from that address are slowed for the
 * same time: one per KICKED_JOIN_GAP_MS, the first that long after the
 * kick. Slowed, never blocked. A seat taken back after a drop is not a
 * new join.
 */
export const KICKED_JOIN_GAP_MS = 60 * 1000;
/* A seat's token takes the same seat back for this long after its socket
 * drops, so a reconnect lands where it was rather than in a new slot. */
export const RESEAT_MS = 60 * 1000;
/* A game (a war, an ops mission) with too few of its
 * players in the room for this long is ended by the room: a deploy or a
 * restart restores a game from storage whether or not anybody comes back
 * to it, and one nobody plays must never hold the room (game()). Long
 * enough for the pilots of a restarted room to reconnect into their seats. */
export const ABANDON_MS = 10 * 1000;

/*
 * Interest thinning (docs/MULTIPLAYER-PLAN.md section 5): how often a
 * seat is sent a peer's pose, by the distance between their newest poses.
 * Within `m` metres, every `every` room ticks: 30, 5 and 1 Hz. A seat
 * not flying (no pose for HERE_MS: a menu, a crash cam, just joined) is
 * sent everyone every tick.
 * The near band is wider than any aircraft closes in the far band's gap
 * (300 m in 200 ms is 1,500 m/s), so a peer that can reach you is always
 * at the full rate before it does, and the far rates stay under the
 * client's STALE_MS (src/game/peer.js), which would hide a peer.
 */
export const INTEREST = [
  { m: 300, every: 1 },
  { m: 1500, every: 6 },
  { m: Infinity, every: 30 },
];

/* A seat whose newest pose is older than this is not flying anywhere. */
export const HERE_MS = 1000;

/*
 * THE TICK AND THE POSES RUN AT ONE RATE, 30 Hz each, on two clocks: the
 * room's (host.js, held to the wall clock) and each sender's. A tick that
 * relayed only the newest pose lost one whenever two arrived between two
 * ticks, which jitter of a few milliseconds does over and over to a
 * sender whose phase sits near the tick's: rooms:load measured near peers
 * at 25 Hz once the tick stopped drifting. So a seat keeps its last
 * RECENT_POSES, and a near peer is sent every one it has not been sent
 * yet, in order; on average that is still one a tick. A far peer, sent
 * every few ticks on purpose, gets its newest alone.
 */
export const RECENT_POSES = 3;

/*
 * A SLOW PAGE IS STILL IN THE ROOM. A page whose frames take a second or
 * more sends its poses a frame at a time, so its peers hear from it once a
 * frame, and a peer not heard from for STALE_MS (src/game/peer.js, 2 s)
 * is hidden: a pilot on a page under about one frame a second blinked out
 * for everybody between frames. So the room repeats a seat's held pose to
 * every other seat once every REPEAT_MS, under STALE_MS, for as long as it
 * is still sending: its newest pose came within HOLD_MS (a page down to a
 * frame every five seconds) and its profile names no status (paused, a
 * menu, a hidden tab, the crash cam: roomwire.js ROOM_STATUSES), which a
 * page that has stopped flying says itself. A page that has died without
 * closing its socket sends nothing, so it is held for HOLD_MS and then
 * hidden as before; one that closed is a leave at once. A peer track takes
 * a repeat of the pose it already holds as word that its pilot is still
 * there (peer.js push), and draws it where it was.
 */
export const HOLD_MS = 5000;
export const REPEAT_MS = 1000;

/* Whether a seat's held pose is repeated to the others now (HOLD_MS). */
function holding(s, now) {
  return Boolean(s.pose) && now - s.poseNow <= HOLD_MS && !(s.profile && s.profile.status);
}

/* A POSE's position, scene metres. */
function poseAt(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [v.getFloat32(8, true), v.getFloat32(12, true), v.getFloat32(16, true)];
}

/* The ticks between two sends of a pose at `b` to a seat at `a`. */
/* A war's or an ops match's view as a watcher is sent it: the result
 * (its stars, its credits, the flags a campaign records) is the seats'
 * alone, only those whose pilot flew the war (war.js flew) or took part
 * in the ops match (ops.js took), since the page holding one pays it to
 * its pilot and records its debrief (src/ui/campaign.js observe,
 * src/ui/opscampaign.js record). */
export function watchedView(view) {
  return view && view.result != null ? { ...view, result: null } : view;
}

export function interestEvery(a, b) {
  if (!a || !b) {
    return 1;
  }
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return INTEREST.find((band) => d <= band.m).every;
}

/*
 * Who holds the room: the host's seat token, kept in storage (host.js hands
 * it back to restore() on load), so a restart keeps the host when that
 * pilot reconnects, whoever reconnects first. While the host is away, for
 * up to RESEAT_MS, the earliest joined pilot here acts for them; after
 * that the room passes to that pilot for good.
 */
class Hosting {
  constructor() {
    this.token = null;
    this.awaySince = null; /* memory only: when the host was last missed */
    this.said = 0;         /* memory only: the seat last announced */
  }

  restore(saved) {
    this.token = saved && typeof saved.token === 'string' ? saved.token : null;
  }

  store() {
    return { store: 'hosting', value: { token: this.token } };
  }
}

/* A seat's text counters: textRate every text, for the close and a cap
 * before parsing; clockRate the clock's pings; sayRate everything else. */
function textRates(now) {
  return { textRate: { since: now, n: 0 }, clockRate: { since: now, n: 0 }, sayRate: { since: now, n: 0 } };
}

/* A count of events in the current one second (or one minute) window. */
function bump(counter, now, windowMs) {
  if (now - counter.since >= windowMs) {
    counter.since = now;
    counter.n = 0;
  }
  counter.n += 1;
  return counter.n;
}

/* DEV_ACCOUNTS, the rooms server's comma separated account ids
 * (/etc/fdfpv/dev-accounts.env on the VM, never in the repository), as a
 * set; anything not a positive integer is left out. */
export function devAccountsOf(text) {
  return new Set(String(text || '').split(',').map((x) => x.trim()).filter((x) => /^[1-9][0-9]{0,15}$/.test(x)).map(Number));
}

export class RoomCore {
  /*
   * meta: { code, cap, friendly, map, epoch, public, name, pick, mode,
   * mission, hidden }, what the room was made with (host.js init), and
   * mission the war mission its host last started since (war.js). epoch is the
   * wall ms the room's clock counts from, so room times fit the wire's
   * u32 for 49 days. name is the creator's typed name or null, pick the
   * picker name shown when there is none, mode the game the room was set
   * up for or null, hidden true once reports took its name away
   * (safety.js). A room stored before the browser has none of the last
   * five, and reads as private, unnamed and set up for nothing.
   * options.turn is the platform's TURN credential minter, or null
   * (edge/rooms/voice.js). options.devMissions starts the campaign's
   * missions in development too (edge/rooms/war.js).
   */
  constructor(meta, options = {}) {
    this.meta = meta;
    this.seats = new Map();   /* conn -> seat record */
    /* conn -> watcher record (watch()): no seat, no aircraft, never in a
     * game, the cap or the ready count, so every seats loop leaves it out. */
    this.watchers = new Map();
    this.pending = new Map(); /* conn -> text rate, before its hello */
    this.kicked = [];         /* { token, address, until, lastJoin } in memory only */
    this.joins = new Map();   /* address -> { since, n } */
    this.recent = new Map();  /* token -> { seat, until }, for a reconnect */
    this.ticking = false;
    this.tickNo = 0; /* memory only: the room ticks counted, for INTEREST */
    /* The wall clock of the event being handled (open, message, close,
     * tick: one at a time), for what a game's view says of the room's
     * time (roomNow, modes.js sessionOf). */
    this.now = 0;
    /* Phase 3, mid air: edge/rooms/referee.js. */
    this.referee = new Referee(meta.friendly);
    this.safety = new RoomSafety(this);
    /* The accounts whose rooms start missions in development (devHost). */
    this.devAccounts = options.devAccounts ?? new Set();
    this.devMissions = options.devMissions === true;
    /* The mode registry's entry by id (src/share/modes.js modeById); a
     * check's own registry stands in to see a field's behaviour follow it. */
    this.modeById = options.modeById ?? modeById;
    /* Whether this server lists public rooms at all (env.PUBLIC_ROOMS), so
     * a private room may become one (setPublic). */
    this.publicRooms = options.publicRooms === true;
    this.war = new RoomWar(meta, { devMissions: options.devMissions === true }); /* Defend Itaipu, edge/rooms/war.js */
    this.ops = new RoomOps(meta, { devMissions: options.devMissions === true }); /* ops missions (The Interior), edge/rooms/ops.js */
    this.gameLobby = new RoomGameLobby(); /* a game room's lobby, edge/rooms/gamelobby.js */
    this.voice = new RoomVoice(options.turn || null); /* voice chat's signalling, edge/rooms/voice.js */
    this.hosting = new Hosting();
    /* game id -> room ms since it has had too few players. Memory only. */
    this.abandoned = new Map();
    /* The game clock last told the room (daytimeNews), memory only. */
    this.daytimeTold = null;
  }

  /*
   * THE ROOM'S CLOCK, which stands while the room is empty (the owner,
   * 2026-10-02, of a war listed in battle with nobody in it: "once theyre
   * done or empty they need to be closed out"). Every game's times are on
   * it (a war's waves and births, the lobby's seconds), so a game in an empty room is paused,
   * and a pilot back before the room is purged finds it where they left
   * it. meta.emptyAt is when the last pilot left, meta.pausedMs the time
   * the room has stood empty since it was made; both are kept with the
   * meta, so a restart keeps the pause.
   */
  roomMs(now) {
    return (this.meta.emptyAt ?? now) - this.meta.epoch - (this.meta.pausedMs || 0);
  }

  /* The room's time at the event being handled. */
  roomNow() {
    return this.roomMs(this.now);
  }

  /* The first pilot back in an empty room: its clock goes on from where it
   * stood. */
  resume(now) {
    if (this.meta.emptyAt == null) {
      return [];
    }
    this.meta.pausedMs = (this.meta.pausedMs || 0) + Math.max(0, now - this.meta.emptyAt);
    this.meta.emptyAt = null;
    /* Who was missing, and since when, is counted again from now. */
    this.abandoned.clear();
    return [{ store: 'meta', value: this.meta }];
  }

  /* The last pilot gone: the clock stands, and the room is purged in
   * host.js PURGE_MS, or at once when its game was over, whose result was
   * only ever its pilots'. */
  emptied(now) {
    this.meta.emptyAt = now;
    return [{ store: 'meta', value: this.meta }, { empty: true, ...(this.finished() ? { now: true } : {}) }];
  }

  /* Whether the room's last game is over: a war won, lost or ended, or an
   * ops mission's. */
  finished() {
    const m = this.war.match;
    return Boolean(m && ['won', 'lost', 'ended'].includes(m.state)) || this.ops.finished();
  }

  /* The seats as they were before a hibernation, from each socket's
   * attachment. conns is [{ conn, attachment }]. */
  restore(conns) {
    for (const { conn, attachment } of conns) {
      if (attachment && attachment.watch) {
        this.watchers.set(conn, { ...attachment, sent: new Map(), ...textRates(0) });
      } else if (attachment && attachment.seat) {
        this.seats.set(conn, { ...attachment, pose: null, recent: [], sent: new Map(), poseRate: { since: 0, n: 0 }, ...textRates(0) });
        this.referee.seat(attachment.seat, attachment.profile && attachment.profile.airframe);
      } else {
        this.pending.set(conn, { since: 0, n: 0 });
      }
    }
  }

  /* The people here: every seat. What means the people in the room (its
   * host, its cap, whether it is empty, its votes, its count in the
   * browser, who is ready) reads this, and what means whoever is flying
   * (the games, the referee, the peers) reads seats; the two were apart
   * while the room seated AI pilots. */
  people() {
    return [...this.seats.values()];
  }

  open(conn, now) {
    this.now = now;
    this.pending.set(conn, { since: now, n: 0 });
    return [];
  }

  /*
   * Whether this room's host is one of the server's DEV_ACCOUNTS: the
   * owner flying missions still in development on the live server before
   * they are released (src/game/campaign.js released's dev, 'development'
   * only, never 'soon'). Only the host's own account counts, so an
   * allowlisted pilot seated in somebody else's room opens nothing there.
   * The account is the accounts server's answer for the seat's session
   * (node.js helloAccount), never anything a client says.
   */
  devHost() {
    if (!this.devAccounts.size) {
      return false;
    }
    const seat = this.host();
    const s = [...this.seats.values()].find((t) => t.seat === seat);
    return Boolean(s && Number.isInteger(s.account) && this.devAccounts.has(s.account));
  }

  /* The host's seat: the one holding the hosting token, else, while the
   * host is away, the earliest joined here. 0 in an empty room. */
  host() {
    let best = null;
    for (const s of this.people()) {
      if (this.hosting.token && s.token === this.hosting.token) {
        return s.seat;
      }
      if (!best || s.joined < best.joined) {
        best = s;
      }
    }
    return best ? best.seat : 0;
  }

  /*
   * After every arrival and departure, and on the room tick: give the
   * token to the first pilot of a new room, pass it on once the host has
   * been away RESEAT_MS, and tell everybody when the host's seat changed.
   */
  settleHost(now) {
    const h = this.hosting;
    const out = [];
    const here = this.people();
    const holder = here.find((t) => h.token && t.token === h.token);
    if (holder || !here.length) {
      h.awaySince = null;
    } else {
      h.awaySince ??= now;
      if (!h.token || now - h.awaySince >= RESEAT_MS) {
        h.token = here.reduce((a, b) => (b.joined < a.joined ? b : a)).token;
        h.awaySince = null;
        out.push(h.store());
      }
    }
    const seat = this.host();
    if (seat && seat !== h.said) {
      h.said = seat;
      out.push(...this.roster(null, JSON.stringify({ type: 'host', seat })));
    }
    return out;
  }

  /*
   * The host hands the room to another pilot here (hostCheck has already
   * said the sender is the host): the token moves, is stored, and
   * everybody is told. A seat nobody holds is refused as 'gone'.
   */
  handHost(conn, s, seat, now) {
    const to = this.people().find((t) => t.seat === seat && t !== s);
    if (!to) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'gone' }) }];
    }
    this.hosting.token = to.token;
    this.hosting.awaySince = null;
    return [this.hosting.store(), ...this.settleHost(now)];
  }

  /* The games a room can run: whether each is on, its players' seats,
   * its abandon (settleGames: named abandoned, modes.js sessionOf), and
   * the fewest of them here that keep it going (the mode registry's: a
   * room made for a game plays it alone too, the owner 2026-10-02: "ready
   * to go either single or multi"). */
  games(now) {
    return [
      { id: 'war', on: this.war.on(), players: this.war.players(this), min: minPlayersFor('war', this.meta.mode), end: () => this.war.abandon(this, now, true) },
      /* No mode registry entry yet: one pilot flies an ops mission alone. */
      { id: 'ops', on: this.ops.on(), players: this.ops.players(this), min: 1, end: () => this.ops.abandon(this, now) },
    ];
  }

  /* Whether seat record t said its page could not build the room's world
   * (fail): counted out of every game until its profile is on it. */
  failed(t) {
    return t.failed != null && t.failed === this.meta.map;
  }

  present(players) {
    const here = new Set([...this.seats.values()].filter((t) => !this.failed(t)).map((t) => t.seat));
    return players.filter((seat) => here.has(seat)).length;
  }

  /* A room runs one game at a time (docs/TAG-PLAN.md decision 10): the
   * one on now with enough of its players here to be played, or null. A
   * game nobody plays never holds the room. */
  game() {
    const g = this.games(0).find((x) => x.on && this.present(x.players) >= x.min);
    return g ? g.id : null;
  }

  /* End every game on with too few of its players here: once that has
   * lasted ABANDON_MS, or at once when `force` (a host starting another).
   * Never in an empty room, whose games stand paused (roomMs) for its
   * pilots to come back to. */
  settleGames(now, force = false) {
    const out = [];
    if (!this.people().length) {
      return out;
    }
    for (const g of this.games(now)) {
      if (!g.on || this.present(g.players) >= g.min) {
        this.abandoned.delete(g.id);
        continue;
      }
      const since = this.abandoned.get(g.id) ?? now;
      this.abandoned.set(g.id, since);
      if (force || now - since >= ABANDON_MS) {
        this.abandoned.delete(g.id);
        out.push(...g.end());
      }
    }
    return out;
  }

  /* The room's own clock: the tick runs while a game waits to be ended or
   * the host to come back, even with nobody flying, and never in an empty
   * room, which the next arrival settles. */
  waiting() {
    return this.people().length > 0 && (this.abandoned.size > 0 || this.hosting.awaySince != null
      || this.war.on() || this.ops.on() || this.gameLobby.waiting(this));
  }

  wake() {
    if (this.ticking || !this.waiting()) {
      return [];
    }
    this.ticking = true;
    return [{ tick: true }];
  }

  /* Arrivals and departures: the host, the games, and the clock for both. */
  settle(now) {
    const out = [...this.settleHost(now), ...this.settleGames(now)];
    return [...out, ...this.wake()];
  }

  /*
   * A host's action (starting, ending or loading a game; a kick), checked
   * once here for every mode, so a refused one always says why:
   * { type: 'refused', why: 'public'|'private'|'host'|'war'|'ops' }. Returns
   * the actions of a refusal, or null to let the mode handle it. `start`
   * is the mode it would start; a game with too few players is ended
   * first rather than refused.
   */
  hostCheck(conn, s, msg, now) {
    const start = (msg.type === 'war' && msg.op === 'start') ? 'war'
      : (msg.type === 'ops' && msg.op === 'start') ? 'ops' : null;
    const hostOnly = start || msg.type === 'kick' || msg.type === 'handhost'
      || (msg.type === 'war' && (msg.op === 'end' || msg.op === 'skipIntro'))
      || (msg.type === 'ops' && (msg.op === 'end' || msg.op === 'lock' || msg.op === 'skipIntro'));
    if (!hostOnly) {
      return null;
    }
    const refuse = (why, out = []) => [...out, { send: conn, data: JSON.stringify({ type: 'refused', why }) }];
    /* A public room's host starts its games like a private one's, since
     * the room browser; only kicking stays a private room's, and reports
     * handle a public room's trouble. */
    if (this.meta.public && msg.type === 'kick') {
      return refuse('public');
    }
    /* Ops missions run in private rooms only until they have a mode of
     * their own (edge/rooms/ops.js). */
    if (this.meta.public && start === 'ops') {
      return refuse('private');
    }
    /* A public room runs the war only when it was made for it: those are
     * listed as the war's and a quick join never lands in one (lobby.js),
     * so nobody is in one without having chosen it and passed the consent
     * (docs/WARFARE-PLAN.md section 9, as the owner opened it 2026-10-01). */
    if (this.meta.public && start && modeById(start).publicOnlyWhenMadeFor && !madeFor(this.meta.mode, start)) {
      return refuse('private');
    }
    if (s.seat !== this.host()) {
      return refuse('host');
    }
    if (!start) {
      return null;
    }
    const out = this.settleGames(now, true);
    const other = this.game();
    if (other) {
      return refuse(other, out);
    }
    return out.length ? { pass: out } : null;
  }

  /* What the room browser shows the room doing (edge/rooms/lobby.js):
   * { game, state }, game null for free flight, state 'countdown' or 'on'
   * for a game under way and 'waiting' otherwise, when a room set up for
   * a game shows that game; and, for a game room in its lobby, `ready`,
   * how many of its pilots said ready, for "2 ready of 3". */
  activity(now) {
    if (this.war.on()) {
      /* The wave a pilot joining now would meet, for "In battle, wave x/y". */
      const mission = this.war.mission();
      return {
        game: 'war', state: this.war.match.state === 'live' ? 'on' : 'countdown',
        wave: Math.min(this.war.match.wave + 1, mission.waves.length), waves: mission.waves.length,
      };
    }
    if (this.ops.on()) {
      return { game: 'ops', state: this.ops.match.state === 'live' ? 'on' : 'countdown' };
    }
    /* A free flight room flying since its lobby's start. */
    if (modeOfRoom(this.meta.mode)?.openEnded && this.gameLobby.live) {
      return { game: null, state: 'on' };
    }
    return {
      game: this.meta.mode ?? null, state: 'waiting', ...(this.gameLobby.open(this) ? { ready: this.gameLobby.ready.size } : {}),
    };
  }

  /*
   * WHO IS ON, for the admin only (GET /v2/admin/rooms, front.js): every
   * seat with its callsign or picker name, its aircraft, what it is doing
   * (flying when a pose came in the last HERE_MS, else ready or in the
   * lobby by the room's lobby), and how long ago its socket said hello
   * and was last heard from, in whole seconds. Never sent to a pilot.
   */
  who(now) {
    return [...this.seats.values()].sort((a, b) => a.seat - b.seat).map((s) => ({
      seat: s.seat,
      host: s.seat === this.host(),
      callsign: s.callsign ?? null,
      pick: s.name,
      aircraft: s.profile ? s.profile.airframe : null,
      state: s.pose && now - s.poseNow <= HERE_MS ? 'flying' : this.gameLobby.ready.has(s.seat) ? 'ready' : 'lobby',
      connectedS: Math.round((now - s.connectedAt) / 1000),
      heardS: Math.round((now - s.heardAt) / 1000),
    }));
  }

  /* Reports took the room's typed name away (safety.js): it shows its
   * picker name from now on, to its pilots at once, and the browser no
   * longer lists it. Kept in storage with the rest of the meta. */
  hideName() {
    this.meta.name = null;
    this.meta.hidden = true;
    return [
      { store: 'meta', value: this.meta },
      ...this.roster(null, JSON.stringify({ type: 'room', name: null, pick: this.meta.pick, hidden: true })),
    ];
  }

  peerList(except) {
    const out = [];
    for (const [conn, s] of this.seats) {
      if (conn !== except) {
        out.push({
          seat: s.seat, name: s.name, profile: s.profile, ...(s.callsign ? { callsign: s.callsign } : {}),
          ...(this.failed(s) ? { failed: s.failed } : {}),
        });
      }
    }
    return out;
  }

  others(except, data) {
    const out = [];
    for (const conn of this.seats.keys()) {
      if (conn !== except) {
        out.push({ send: conn, data });
      }
    }
    return out;
  }

  /* others(), and every watcher: the news a watcher needs to draw the
   * pilots (join, leave, profile, host, world). */
  roster(except, data) {
    return [...this.others(except, data), ...[...this.watchers.keys()].map((conn) => ({ send: conn, data }))];
  }

  /* Every seat and every watcher: a game's state (its standings, round
   * and clock), which a watcher reads and cannot act on (watcherSaid). */
  everyone(data) {
    return this.roster(null, data);
  }

  /* The war's and the ops' view, { type, [type]: view }: every seat that
   * `paid(seat)` says may hold it the whole of it, every other seat and
   * every watcher the same with no result (watchedView). */
  viewed(type, view, paid = () => true) {
    const data = JSON.stringify({ type, [type]: view });
    const seen = JSON.stringify({ type, [type]: watchedView(view) });
    return [
      ...[...this.seats].map(([conn, s]) => ({ send: conn, data: paid(s) ? data : seen })),
      ...[...this.watchers.keys()].map((conn) => ({ send: conn, data: seen })),
    ];
  }

  attachmentOf(s) {
    return {
      seat: s.seat, token: s.token, name: s.name, profile: s.profile, joined: s.joined, address: s.address,
      muted: s.muted || [], wreck: s.wreck ?? null, level: s.level || 0, callsign: s.callsign ?? null, account: s.account ?? null,
      blocks: s.blocks || [],
    };
  }

  freeSeat(wanted) {
    const taken = new Set([...this.seats.values()].map((s) => s.seat));
    if (wanted && !taken.has(wanted) && wanted <= this.meta.cap) {
      return wanted;
    }
    for (let seat = 1; seat <= this.meta.cap; seat += 1) {
      if (!taken.has(seat) && ![...this.recent.values()].some((r) => r.seat === seat)) {
        return seat;
      }
    }
    for (let seat = 1; seat <= this.meta.cap; seat += 1) {
      if (!taken.has(seat)) {
        return seat;
      }
    }
    return 0;
  }

  isKicked(token, now) {
    this.kicked = this.kicked.filter((k) => k.until > now);
    return Boolean(token) && this.kicked.some((k) => k.token === token);
  }

  /* Keep a player out: their token for `ms`, their address slowed. */
  keepOut(s, now, ms) {
    this.kicked.push({ token: s.token, address: s.address, until: now + ms, lastJoin: now });
  }

  /* A new join from an address a kick or a removal slows: false while it
   * must wait, else true, and the wait starts again. */
  slowedJoin(address, now) {
    const held = this.kicked.filter((k) => address && k.address === address);
    if (held.some((k) => now - k.lastJoin < KICKED_JOIN_GAP_MS)) {
      return false;
    }
    for (const k of held) {
      k.lastJoin = now;
    }
    return true;
  }

  /* The highest ROOM_LEVEL (src/share/roomwire.js) a seat here holds. */
  level() {
    let top = 0;
    for (const s of this.seats.values()) {
      top = Math.max(top, s.level || 0);
    }
    return top;
  }

  /* A new join from this address, counted: false when it is over
   * JOINS_PER_MIN or a kick slows it. */
  joinAllowed(address, now) {
    if (!address) {
      return true;
    }
    if (!this.joins.has(address)) {
      this.joins.set(address, { since: now, n: 0 });
    }
    return bump(this.joins.get(address), now, 60000) <= JOINS_PER_MIN && this.slowedJoin(address, now);
  }

  /*
   * THE WATCH SEAT (docs/FLIGHTCLUB-PROGRESSION.md section 3): a hello
   * with watch: true. The watcher gets the room's welcome with seat 0 and
   * its pilots, then their poses, the roster's news (roster()) and every
   * game's state as it changes (everyone()): the war's and the ops'
   * (with no result, viewed()) and the lobby's, and nothing else: no seat, no token a pilot's tab could take
   * over, no game join, no role, no say in the clock, the host or ready,
   * never counted in the lobby (people()). Pilots are never told a
   * watcher came, since there is nothing of it to draw and no public list
   * of watchers, only their number (watchers) in a welcome and the room
   * browser's line (lobby.js listingOf). Up to WATCH_CAP, refused 'full'
   * past it.
   */
  watch(conn, msg, now, address, newToken, callsign) {
    if (!this.joinAllowed(address, now)) {
      return [{ close: conn, code: CLOSE.rate, reason: 'rate' }];
    }
    if (this.watchers.size >= WATCH_CAP) {
      return [{ close: conn, code: CLOSE.full, reason: 'full' }];
    }
    const w = {
      watch: true, token: newToken(), name: msg.name.slice(), callsign, address: address || '', joined: now,
      sent: new Map(), ...textRates(now),
    };
    this.pending.delete(conn);
    this.watchers.set(conn, w);
    return [
      { attach: conn, value: { watch: true, token: w.token, name: w.name, callsign, address: w.address, joined: now } },
      {
        send: conn,
        data: JSON.stringify({
          type: 'welcome',
          watch: true,
          seat: 0,
          token: w.token,
          host: this.host(),
          roomMs: this.roomMs(now),
          code: this.meta.code,
          cap: this.meta.cap,
          friendly: Boolean(this.meta.friendly),
          public: Boolean(this.meta.public),
          name: this.meta.name ?? null,
          pick: this.meta.pick ?? null,
          mode: this.meta.mode ?? null,
          mission: this.meta.mission ?? null,
          map: this.meta.map,
          daytime: this.daytimeWelcome(),
          watchers: this.watchers.size,
          peers: this.peerList(null),
          /* Every game as it stands (everyone()); the war's and the
           * ops' with no result (watchedView). */
          war: watchedView(this.war.view(this)),
          ops: watchedView(this.ops.view(this)),
          ...this.gameLobby.welcome(this),
        }),
      },
      ...this.war.watch(conn),
      ...(this.ticking || !this.seats.size ? [] : [{ tick: true }]),
    ];
  }

  /*
   * hello: { proto, build, level?, token?, name: [adj, animal, number], profile, session? }.
   * newToken() is the caller's cryptographic source of a fresh seat token.
   * callsign is a signed in pilot's, which the platform looked up from the
   * hello's session with the accounts server (node.js) before this ran,
   * or null: a guest, a session that did not check out, or a platform
   * with no accounts server. It is never read from the message itself, so
   * no hello can name itself one. It goes to every peer beside the picker
   * name, which a build from before it shows instead. account is that
   * pilot's account id from the same lookup (null the same way): never
   * sent to anybody, only read against the room's DEV_ACCOUNTS (devHost)
   * and other pilots' blocks. blocks is the ids of the accounts this
   * pilot blocked, from the same lookup ([] the same way): whoever holds
   * one of them is not heard by this pilot (safety.js shut).
   */
  hello(conn, msg, now, address, newToken, callsign = null, account = null, blocks = []) {
    if (msg.proto !== PROTO) {
      return [{ close: conn, code: CLOSE.update, reason: 'update' }];
    }
    /* A tab older than the room's rules, or than the floor every room
     * holds (ROOM_FLOOR), is told to reload rather than seated where it
     * would fly a session of its own (ROOM_LEVEL). */
    const level = Number.isInteger(msg.level) && msg.level > 0 ? msg.level : 0;
    if (level < Math.max(ROOM_FLOOR, this.level())) {
      return [{ close: conn, code: CLOSE.update, reason: 'update' }];
    }
    /* A room made for the war seats only a build that asks the war's
     * consent first (src/share/roomwire.js WAR_JOIN). */
    if (modeOfRoom(this.meta.mode)?.consent && !(Number.isInteger(msg.war) && msg.war >= WAR_JOIN)) {
      return [{ close: conn, code: CLOSE.update, reason: 'update' }];
    }
    const token = typeof msg.token === 'string' && /^[0-9a-f]{32}$/.test(msg.token) ? msg.token : null;
    if (this.isKicked(token, now)) {
      return [{ close: conn, code: CLOSE.kicked, reason: 'kicked' }];
    }
    const profile = checkProfile(msg.profile);
    if (!validNamePick(msg.name) || !profile) {
      return [{ close: conn, code: CLOSE.bad, reason: 'bad' }];
    }
    /* Before the token's takeover: a watcher's tab never closes a seat. */
    if (msg.watch === true) {
      return this.watch(conn, msg, now, address, newToken, callsign);
    }
    const actions = [];
    /* A token that holds a live seat takes it over: the old socket is a
     * tab that lost its network and has not noticed yet. */
    let wanted = 0;
    let joined = now;
    for (const [other, s] of this.seats) {
      if (token && s.token === token) {
        wanted = s.seat;
        joined = s.joined;
        actions.push({ close: other, code: CLOSE.replaced, reason: 'replaced' });
        this.seats.delete(other);
        actions.push(...this.roster(other, JSON.stringify({ type: 'leave', seat: s.seat })));
      }
    }
    const back = token ? this.recent.get(token) : null;
    if (!wanted && back && back.until > now) {
      wanted = back.seat;
      joined = back.joined;
    }
    /* A token this room does not know, from a client that had a seat: the
     * object was restarted (a deploy, a tail attaching) and forgot it. The
     * seat it names is a spawn slot and nothing more, so it is given back
     * when free, and the pilot keeps their place on the field. */
    if (!wanted && token && Number.isInteger(msg.seat)) {
      wanted = msg.seat;
    }
    if (!wanted && !this.joinAllowed(address, now)) {
      return [...actions, { close: conn, code: CLOSE.rate, reason: 'rate' }];
    }
    if (this.people().length >= this.meta.cap) {
      return [...actions, { close: conn, code: CLOSE.full, reason: 'full' }];
    }
    if (!this.people().length) {
      actions.push(...this.resume(now));
    }
    const seat = this.freeSeat(wanted);
    if (token) {
      this.recent.delete(token);
    }
    const s = {
      seat,
      token: wanted && token ? token : newToken(),
      name: msg.name.slice(),
      callsign,
      account,
      blocks,
      profile,
      joined,
      /* Memory only, for the admin's who is on (who()): this socket's
       * hello, and the last thing heard on it. */
      connectedAt: now,
      heardAt: now,
      address: address || '',
      pose: null,
      recent: [],
      sent: new Map(),
      poseRate: { since: now, n: 0 },
      level,
      ...textRates(now),
    };
    /* And the tabs already here that are older than this one, the same:
     * their close runs close() below, which tells the others they went. */
    for (const [other, t] of this.seats) {
      if ((t.level || 0) < level) {
        actions.push({ close: other, code: CLOSE.update, reason: 'update' });
      }
    }
    this.pending.delete(conn);
    this.seats.set(conn, s);
    if (!this.hosting.token) {
      this.hosting.token = s.token;
      actions.push(this.hosting.store());
    }
    /* A seat taken back keeps its samples; a new pilot in it does not. */
    if (!wanted) {
      this.referee.leave(seat);
    }
    this.referee.seat(seat, profile.airframe);
    actions.push({ attach: conn, value: this.attachmentOf(s) });
    actions.push({
      send: conn,
      data: JSON.stringify({
        type: 'welcome',
        seat,
        token: s.token,
        host: this.host(),
        roomMs: this.roomMs(now),
        code: this.meta.code,
        cap: this.meta.cap,
        friendly: Boolean(this.meta.friendly),
        public: Boolean(this.meta.public),
        name: this.meta.name ?? null,
        pick: this.meta.pick ?? null,
        mode: this.meta.mode ?? null,
        mission: this.meta.mission ?? null,
        map: this.meta.map,
        weather: this.meta.weather ?? CALM,
        stockSurfaces: Boolean(this.meta.stockSurfaces),
        /* The host may change public in place (setPublic). */
        publicInPlace: true,
        /* And, in a private room, its activity between rounds (setup). */
        setupInPlace: true,
        daytime: this.daytimeWelcome(),
        /* How many watch, as at this join: no news follows a watcher's
         * coming or going (watch). */
        watchers: this.watchers.size,
        peers: this.peerList(conn),
        ...this.war.welcome(this, s),
        ...this.ops.welcome(this, s),
        ...this.gameLobby.welcome(this),
      }),
    });
    actions.push(...this.roster(conn, JSON.stringify({
      type: 'join', seat, name: s.name, ...(callsign ? { callsign } : {}), profile, host: this.host(),
    })));
    actions.push(...wrecks.wrecksFor(this, conn));
    /* A newcomer to a running round flies in where its game allows it
     * (modes.js allowDropIn), every game reading the one field: the war
     * enlists it. Elsewhere it waits for the next round, a war's told the attackers as a watcher
     * is. A player back from a drop is always back. */
    const running = this.game();
    const dropIn = running === null || running === 'ops' || this.modeById(running).allowDropIn;
    actions.push(...(dropIn ? this.war.join(this, conn) : this.war.watch(conn)));
    actions.push(...this.ops.join(this, conn, now));
    actions.push(...this.gameLobby.join(this, now));
    actions.push(...this.settle(now));
    return actions;
  }

  /* Any text can move the room's game clock (a host's time, a war or an
   * ops mission started, the lobby's mission picked): its news follows
   * the message's own. A pose never can. */
  message(conn, data, now, address = '', newToken = null, callsign = null, account = null, blocks = []) {
    this.now = now;
    const out = this.said(conn, data, now, address, newToken, callsign, account, blocks);
    return typeof data === 'string' ? [...out, ...this.daytimeNews()] : out;
  }

  said(conn, data, now, address, newToken, callsign, account, blocks) {
    const w = this.watchers.get(conn);
    if (w) {
      return this.watcherSaid(conn, w, data, now);
    }
    const s = this.seats.get(conn);
    if (s) {
      s.heardAt = now;
    }
    if (typeof data !== 'string') {
      if (s && data[0] === TYPE_PARTS) {
        return wrecks.onParts(this, conn, s, data, now);
      }
      if (s && data[0] === TYPE_FOOT) {
        return onFoot(this, conn, s, data, now);
      }
      return s ? this.pose(conn, s, data, now) : [];
    }
    const rate = s ? s.textRate : this.pending.get(conn);
    if (!rate) {
      return [];
    }
    const n = bump(rate, now, 1000);
    if (n > TEXT_CLOSE_PER_S) {
      return [{ close: conn, code: CLOSE.rate, reason: 'rate' }];
    }
    if (n > (s ? TEXT_PER_S + CLOCK_PER_S + VOICE_PER_S : TEXT_PER_S)) {
      return [];
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return [];
    }
    if (!msg || typeof msg !== 'object') {
      return [];
    }
    if (!s) {
      return msg.type === 'hello' ? this.hello(conn, msg, now, address, newToken, callsign, account, blocks) : [];
    }
    /* Counted on an allowance of its own (edge/rooms/voice.js). */
    if (msg.type === 'voice') {
      return this.voice.message(this, conn, s, msg, now);
    }
    const clock = msg.type === 't';
    /* Quick chat and emotes are counted on the pilot's chat allowance
     * alone (edge/rooms/safety.js takeChat, which the client runs too).
     * Counted here as well, the page's own sync after a welcome (war and
     * ops films seen, the time of day, a profile) took four of the five
     * and a phrase and a wave said then lost the wave without a word,
     * while the client's allowance said it was sent (rooms:safety, 3 of
     * 6 runs, 2026-10-13). */
    const said = msg.type === 'event' && (msg.kind === 'chat' || msg.kind === 'emote');
    if (!said && bump(clock ? s.clockRate : s.sayRate, now, 1000) > (clock ? CLOCK_PER_S : TEXT_PER_S)) {
      return [];
    }
    if (clock && Number.isFinite(msg.c)) {
      /* rtt: the socket's round trip measured below the page, where the
       * adapter can (edge/rooms/node.js netRtt); a page uses it in place
       * of its own when shorter (src/share/roomclock.js). */
      const rtt = conn.netRtt;
      return [{ send: conn, data: JSON.stringify({ type: 't', c: msg.c, s: this.roomMs(now), ...(Number.isFinite(rtt) ? { rtt } : {}) }) }];
    }
    if (msg.type === 'profile') {
      const profile = checkProfile(msg.profile);
      if (!profile) {
        return [];
      }
      s.profile = profile;
      this.referee.seat(s.seat, profile.airframe);
      return [
        { attach: conn, value: this.attachmentOf(s) },
        ...this.roster(conn, JSON.stringify({ type: 'profile', seat: s.seat, profile })),
        ...this.standing(s, now),
      ];
    }
    if (msg.type === 'fail') {
      return this.fail(s, msg, now);
    }
    if (msg.type === 'event' && Object.hasOwn(EVENTS, msg.kind)) {
      return EVENTS[msg.kind](this, conn, s, msg, now);
    }
    if (msg.type === 'world') {
      return this.world(conn, s, msg, now);
    }
    if (msg.type === 'weather') {
      return this.weather(conn, s, msg);
    }
    if (msg.type === 'stockSurfaces') {
      return this.stockSurfaces(conn, s, msg);
    }
    if (msg.type === 'public') {
      return this.setPublic(conn, s, msg);
    }
    if (msg.type === 'setup') {
      return this.setup(conn, s, msg, now);
    }
    if (msg.type === 'daytime') {
      return this.setDaytime(conn, s, msg);
    }
    /* A game room's lobby: ready from anybody, the round's setting from
     * the host (edge/rooms/gamelobby.js), with the clock its times need. */
    if (msg.type === 'lobby') {
      return [...this.gameLobby.message(this, conn, s, msg, now), ...this.wake()];
    }
    const checked = this.hostCheck(conn, s, msg, now);
    if (checked && !checked.pass) {
      return checked;
    }
    const first = checked ? checked.pass : [];
    /* A war started from the menus has nobody flying, and the room's clock
     * otherwise runs only on relayed poses: the war wakes it, or it never
     * reaches its go. */
    if (msg.type === 'war') {
      return [...first, ...this.war.message(this, conn, s, msg, now), ...this.wake()];
    }
    if (msg.type === 'ops') {
      return [...first, ...this.ops.message(this, conn, s, msg, now), ...this.wake()];
    }
    const safe = this.safety.text(conn, s, msg, now);
    if (safe) {
      return safe;
    }
    if (msg.type === 'kick' && !this.meta.public && s.seat === this.host() && msg.seat !== s.seat) {
      return this.kick(msg.seat, now);
    }
    if (msg.type === 'handhost') {
      return this.handHost(conn, s, msg.seat, now);
    }
    return [];
  }

  /* A watcher is answered its clock and nothing else: a pose, a ready, a
   * game's word or a chat line from it would act for a seat it has not. */
  watcherSaid(conn, w, data, now) {
    w.heardAt = now;
    if (typeof data !== 'string') {
      return [];
    }
    const n = bump(w.textRate, now, 1000);
    if (n > TEXT_CLOSE_PER_S) {
      return [{ close: conn, code: CLOSE.rate, reason: 'rate' }];
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return [];
    }
    if (!msg || msg.type !== 't' || !Number.isFinite(msg.c) || bump(w.clockRate, now, 1000) > CLOCK_PER_S) {
      return [];
    }
    const rtt = conn.netRtt;
    return [{ send: conn, data: JSON.stringify({ type: 't', c: msg.c, s: this.roomMs(now), ...(Number.isFinite(rtt) ? { rtt } : {}) }) }];
  }

  /*
   * The host moves the room to another world: { type: 'world', map }. The
   * room's world is where every pilot in it is seated (src/main.js, THE
   * ROOM IS ONE SESSION), so it is the room's to hold, kept with the meta
   * and handed to every joiner in the welcome. Everybody is told, the host
   * too: { type: 'world', map }, a type a build from before it passes
   * over. A private room only, because a public room is listed under its
   * world (lobby.js), and not while a game is on, which is played where it
   * began. A retired world (src/maps/retired.js), which an old page can
   * still offer, is not one, the same as an id that is not an id.
   */
  world(conn, s, msg, now) {
    if (!validId(msg.map) || retiredMap(msg.map)) {
      return [];
    }
    const refuse = (why) => [{ send: conn, data: JSON.stringify({ type: 'refused', why }) }];
    if (this.meta.public) {
      return refuse('world_public');
    }
    if (s.seat !== this.host()) {
      return refuse('host');
    }
    const out = this.settleGames(now, true);
    const game = this.game();
    if (game) {
      return [...out, ...refuse(game)];
    }
    if (msg.map === this.meta.map) {
      return [...out, { send: conn, data: JSON.stringify({ type: 'world', map: msg.map }) }];
    }
    this.meta.map = msg.map;
    return [...out, { store: 'meta', value: this.meta }, ...this.roster(null, JSON.stringify({ type: 'world', map: msg.map }))];
  }

  /*
   * The host sets the room's air: { type: 'weather', preset }
   * (docs/WEATHER-CONTRACT.md). The room draws the seed, so every pilot
   * flies the same air and no client picks it; kept with the meta, handed
   * to joiners in the welcome, and told to everybody, the host too, as
   * { type: 'weather', preset, seed }, which a build from before it passes
   * over. Each pilot's next run flies it.
   */
  weather(conn, s, msg) {
    if (!PRESET_IDS.includes(msg.preset)) {
      return [];
    }
    if (s.seat !== this.host()) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
    }
    const seed = msg.preset === 'calm' ? 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.meta.weather = { preset: msg.preset, seed };
    return [
      { store: 'meta', value: this.meta },
      ...this.roster(null, JSON.stringify({ type: 'weather', ...this.meta.weather })),
    ];
  }

  /*
   * The host asks every pilot to fly stock control surfaces, or lets them
   * fly their own tiers (configs/surfaces.js, the owner's room rule of
   * 2026-10-11): { type: 'stockSurfaces', on }. Kept with the meta like the
   * weather, handed to joiners in the welcome, and told to everybody as
   * the same message, which a build from before it passes over. Each
   * pilot's next run flies it. The plant runs on each pilot's own page, so
   * the room holds the rule and the pages keep it.
   */
  stockSurfaces(conn, s, msg) {
    if (typeof msg.on !== 'boolean') {
      return [];
    }
    if (s.seat !== this.host()) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
    }
    this.meta.stockSurfaces = msg.on;
    return [
      { store: 'meta', value: this.meta },
      ...this.roster(null, JSON.stringify({ type: 'stockSurfaces', on: msg.on })),
    ];
  }

  /*
   * The host changes who joins with others here (docs/redesign/SESSIONS.md
   * section 2): { type: 'public', on }. The room keeps its code, its
   * pilots and its game; only its listing and its cap change, the cap
   * because a public room seats PUBLIC_CAP and a private one PRIVATE_CAP.
   * Kept with the meta, and everybody is told { type: 'public', on, cap },
   * a type a build from before it passes over; the welcome's publicInPlace
   * says the room takes it, so a page offers it only then. To public as
   * POST /v2/create would make it (front.js create): only where public
   * rooms are open, never with a game on that a public room runs only
   * when made for it (hostCheck) or an ops mission, and a war room only
   * for a released mission. To private only with no more people here
   * than its cap.
   */
  setPublic(conn, s, msg) {
    if (typeof msg.on !== 'boolean') {
      return [];
    }
    const refuse = (why) => [{ send: conn, data: JSON.stringify({ type: 'refused', why }) }];
    if (s.seat !== this.host()) {
      return refuse('host');
    }
    if (msg.on && !this.meta.public) {
      if (!this.publicRooms) {
        return refuse('public_closed');
      }
      const game = this.game();
      if (game === 'ops' || (game && modeById(game).publicOnlyWhenMadeFor && !madeFor(this.meta.mode, game))) {
        return refuse('public_game');
      }
      /* The mission the room was made for, which the list shows, not the
       * first one it may start (warMission). */
      if (this.meta.mode === 'war' && !released(this.meta.mission ?? warMission(this), this.devMissions)) {
        return refuse('war_unreleased');
      }
    }
    if (!msg.on && this.meta.public && this.people().length > PRIVATE_CAP) {
      return refuse('private_full');
    }
    const changed = msg.on !== Boolean(this.meta.public);
    this.meta.public = msg.on;
    this.meta.cap = msg.on ? PUBLIC_CAP : PRIVATE_CAP;
    const told = JSON.stringify({ type: 'public', on: msg.on, cap: this.meta.cap });
    if (!changed) {
      return [{ send: conn, data: told }];
    }
    return [{ store: 'meta', value: this.meta }, ...this.roster(null, told)];
  }

  /*
   * The host of a private room changes its activity between rounds
   * (COMPLETENESS 77, docs/redesign/SESSIONS.md section 3): { type:
   * 'setup', mode }, a ROOM_SETUPS id or null for free flight. The room
   * keeps its code, pilots, world and host; its lobby starts again with
   * nobody ready and the new game's setting, and everybody is told
   * { type: 'setup', mode, mission, lobby }. Refused in a public room,
   * which keeps the activity the list shows ('setup_public'), while a
   * round runs (its game's id, or 'setup_flying' for free flight's,
   * which runs until the room empties), and the war off a war mission's
   * world ('war_map'). Leaving the war drops its last match, whose
   * mission, lost stage and time of day belong to no other game.
   *
   * THE WAR'S CONSENT, per pilot: moving into the war, every person here
   * but the host (whose page asked before sending this) is on
   * meta.unconsented, by seat token, kept with the meta so a restart
   * keeps it. Such a pilot is never one of the war's players (war.js
   * enlist) and is not waited for in the lobby (gamelobby.js), until
   * their page says { type: 'setup', consent: true }; one who declines
   * says nothing and sits the war out in the lobby. A pilot who comes
   * later is asked by their page as they join, as in any war room.
   */
  setup(conn, s, msg, now) {
    if (msg.consent === true) {
      return this.consent(conn, s, now);
    }
    const mode = msg.mode ?? null;
    if (mode !== null && !ROOM_SETUPS.includes(mode)) {
      return [];
    }
    const refuse = (why) => [{ send: conn, data: JSON.stringify({ type: 'refused', why }) }];
    if (s.seat !== this.host()) {
      return refuse('host');
    }
    if (this.meta.public) {
      return refuse('setup_public');
    }
    const game = this.game();
    if (game) {
      return refuse(game);
    }
    if (this.gameLobby.live) {
      return refuse('setup_flying');
    }
    const war = mode === 'war';
    if (war && !Object.values(MISSIONS).some((m) => m.map === this.meta.map)) {
      return refuse('war_map');
    }
    if (mode === (this.meta.mode ?? null)) {
      return [];
    }
    const out = [];
    if (this.meta.mode === 'war') {
      this.war.match = null;
      this.meta.mission = null;
      out.push(...this.war.changed(this));
    }
    this.meta.mode = mode;
    this.meta.unconsented = war ? this.people().filter((t) => t.seat !== s.seat).map((t) => t.token) : [];
    this.gameLobby.clear();
    return [
      { store: 'meta', value: this.meta },
      ...out,
      ...this.everyone(JSON.stringify({ type: 'setup', mode, mission: war ? warMission(this) : null, lobby: this.gameLobby.view(this) })),
    ];
  }

  /* A pilot's page said yes to the war's consent (setup): one of its
   * players from now, at once when one is on (war.js join). */
  consent(conn, s, now) {
    const left = (this.meta.unconsented || []).filter((token) => token !== s.token);
    if (left.length === (this.meta.unconsented || []).length) {
      return [];
    }
    this.meta.unconsented = left;
    /* Waited for from now: the five seconds stop until they say ready. */
    if (this.gameLobby.open(this)) {
      this.gameLobby.settle(this, now, true);
    }
    return [{ store: 'meta', value: this.meta }, ...this.war.join(this, conn), ...this.gameLobby.changed(this)];
  }

  /*
   * THE ROOM'S GAME CLOCK (docs/DAYTIME-CONTRACT.md, owner 2026-10-10:
   * one game time per room, shared by all its players): a clock
   * { hour, rate, at } on the room's ms, or null for each world's own
   * time (src/share/daytime.js). A mission's time is the room's while
   * its game is the room's: an ops match's clock (its sun moves from the
   * go), a war's mission time, from its lobby on so every screen builds
   * the mission's world before the briefing (war.js WORLD_LEAD_MS), and
   * over its end. Any other room flies the time its host set. Handed to joiners in the
   * welcome and told as { type: 'daytime', daytime } whenever it changes
   * (daytimeNews), which a build from before it passes over.
   */
  daytime() {
    const ops = this.ops.match ? this.ops.missions[this.ops.match.mission] : null;
    if (ops) {
      const c = ops.clock;
      const goAt = this.ops.match.goAt;
      return c ? { hour: c.startHour, rate: goAt == null ? 0 : c.rate, at: goAt ?? 0 } : null;
    }
    /* A war's light moves across its stages (daytime.js missionClock):
     * the stage under way's; before the go, standing where the stage it
     * starts from begins (a restart's checkpoint, else the first). */
    const warClock = (mission, m) => {
      let stage = null;
      if (m.stage) {
        stage = { n: m.stage.idx, at: m.stage.at };
      } else if (m.from != null) {
        stage = { n: m.from, at: null };
      }
      return missionClock(missionTime(mission), stagesOf(mission), stage, m.endAt ?? null);
    };
    if (this.war.on()) {
      return warClock(this.war.mission(), this.war.match);
    }
    /* A war keeps its time over its end and its result, the hour its
     * light had reached (so the banner is not lit back to where the
     * mission began, nor held behind a rebuild), until a war room's
     * lobby picks another mission; a war started in another room keeps
     * it as long as it stands. */
    const id = this.meta.mode === 'war' ? warMission(this) : null;
    if (this.war.match && (this.meta.mode !== 'war' || this.war.match.mission === id)) {
      return warClock(this.war.mission(), this.war.match);
    }
    if (this.meta.mode === 'war') {
      return id ? missionClock(missionTime(MISSIONS[id]), stagesOf(MISSIONS[id])) : null;
    }
    return clockOfTime(this.meta.daytime ?? null);
  }

  /* The clock for a welcome, which tells it as well as a message would. */
  daytimeWelcome() {
    const daytime = this.daytime();
    this.daytimeTold ??= JSON.stringify(daytime);
    return daytime;
  }

  /* The clock told to the room when it is not the one last told. The
   * first call after a load only records it: every pilot here has it
   * already, from its welcome or, after a restart, from the same stored
   * meta and games, so a message then would be noise on every link. */
  daytimeNews() {
    const daytime = this.daytime();
    const text = JSON.stringify(daytime);
    if (this.daytimeTold === null) {
      this.daytimeTold = text;
      return [];
    }
    if (text === this.daytimeTold) {
      return [];
    }
    this.daytimeTold = text;
    return this.roster(null, JSON.stringify({ type: 'daytime', daytime }));
  }

  /* The host sets the room's time of day: { type: 'daytime', time }, a
   * name of src/share/daytime.js TIME_NAMES or null for each world's own.
   * Kept with the meta like the weather; a mission's time still governs
   * while its game is the room's. */
  setDaytime(conn, s, msg) {
    if (!(msg.time === null || TIME_NAMES.includes(msg.time))) {
      return [];
    }
    if (s.seat !== this.host()) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
    }
    this.meta.daytime = msg.time;
    return [{ store: 'meta', value: this.meta }];
  }

  /* A host's kick: gone for the room's life, which is what the token and
   * the token is held against, in memory, for KICK_MS (keepOut). */
  kick(seat, now) {
    for (const [conn, t] of this.seats) {
      if (t.seat === seat) {
        this.keepOut(t, now, KICK_MS);
        this.seats.delete(conn);
        this.referee.leave(seat);
        this.war.leave(seat);
        this.ops.leave(seat, this.roomMs(now));
        return [
          { close: conn, code: CLOSE.kicked, reason: 'kicked' },
          ...this.roster(conn, JSON.stringify({ type: 'leave', seat, host: this.host() })),
          ...this.settle(now),
        ];
      }
    }
    return [];
  }

  pose(conn, s, data, now) {
    if (data.byteLength !== POSE_BYTES || data[0] !== TYPE_POSE) {
      return [];
    }
    if (bump(s.poseRate, now, 1000) > POSE_PER_S) {
      return [];
    }
    const checked = this.safety.pose(conn, s, data, now);
    if (!checked.bytes) {
      return checked.actions;
    }
    const hits = this.judge(s, checked.bytes, now);
    if (this.ticking) {
      return hits;
    }
    this.ticking = true;
    return [...hits, { tick: true }];
  }

  /* A pose past the pose rules: kept to relay, and handed to every judge.
   * Returns their actions. */
  judge(s, bytes, now) {
    s.pose = bytes;
    s.recent.push(bytes);
    if (s.recent.length > RECENT_POSES) {
      s.recent.shift();
    }
    s.poseNow = now;
    /* The referee judges the bytes the room relays: Phase 5 sets
     * FLAG_SPAWNING on a spawning seat, which the rule leaves out. */
    const decided = this.referee.pose(s.seat, bytes, this.roomMs(now));
    const hits = decided.flatMap((h) => this.others(null, JSON.stringify(h)));
    hits.push(...this.war.pose(this, s, bytes, now));
    hits.push(...this.ops.pose(this, s, bytes, now));
    return hits;
  }

  /*
   * One room tick: every seat gets one batch of the others' poses it has
   * not been sent yet, each at its interest band's rate (INTEREST): a peer
   * near this seat every tick, a far one every few. The room's own judges
   * (the referee, a war, an ops mission) see every pose as it
   * arrives (pose()), so this thins only what a screen draws. A pose
   * already sent goes again after REPEAT_MS while its seat is holding().
   * Ticks stop when every seat has been sent every newest pose and nobody
   * is held.
   */
  tick(now) {
    this.now = now;
    this.referee.tick(this.roomMs(now));
    this.tickNo += 1;
    const out = [...this.war.tick(this, now), ...this.ops.tick(this, now), ...this.gameLobby.tick(this, now)];
    out.push(...this.settleHost(now), ...this.settleGames(now));
    const flying = [...this.seats.values()].filter((f) => f.pose);
    const at = new Map(flying.map((f) => [f, poseAt(f.pose)]));
    let owed = false;
    for (const [conn, s] of [...this.seats, ...this.watchers]) {
      /* Where this seat is flying; nowhere once it has stopped sending
       * (a menu, a crash cam), and then it is sent everyone at full rate. */
      const here = s.pose && now - s.poseNow <= HERE_MS ? at.get(s) : null;
      const entries = [];
      for (const f of flying) {
        if (f === s) {
          continue;
        }
        const last = s.sent.get(f.seat);
        if (last && last.pose === f.pose) {
          if (!holding(f, now)) {
            continue;
          }
          owed = true;
          if (now - last.at < REPEAT_MS) {
            continue;
          }
          entries.push({ seat: f.seat, pose: f.pose });
          s.sent.set(f.seat, { pose: f.pose, tick: this.tickNo, at: now });
          continue;
        }
        const every = interestEvery(here, at.get(f));
        if (last && this.tickNo - last.tick < every) {
          owed = true;
          continue;
        }
        /* A near peer is sent every pose since the last one it was sent
         * (RECENT_POSES), a far one its newest. */
        const since = every === 1 && last ? f.recent.slice(f.recent.indexOf(last.pose) + 1) : [f.pose];
        for (const pose of since) {
          entries.push({ seat: f.seat, pose });
        }
        s.sent.set(f.seat, { pose: f.pose, tick: this.tickNo, at: now });
      }
      if (entries.length) {
        out.push({ send: conn, data: encodeBatch(this.roomMs(now), entries) });
        owed = true;
      }
    }
    /* A war's or a mission's state moves on the tick too. */
    out.push(...this.daytimeNews());
    this.ticking = owed || this.waiting();
    return this.ticking ? [...out, { tick: true }] : out;
  }

  /*
   * A LOAD FAILURE (COMPLETENESS 4, docs/redesign/SESSIONS.md): { type:
   * 'fail', map }, this pilot's page could not build world `map`
   * (src/main.js syncWorldNow). The room's own world only; any other is
   * passed over. The seat is counted out of the round as a silent pilot
   * is, by every game (failed(): present(), each game's players), and
   * kept out of the lobby's flags; the others are told { type: 'fail',
   * seat, map }, and map null when the seat's profile is on the room's
   * world again (standing). Memory only, on the seat: a reconnect is a
   * new try. A message type a build from before passes over.
   */
  fail(s, msg, now) {
    if (msg.map !== this.meta.map || this.failed(s)) {
      return [];
    }
    s.failed = msg.map;
    return [
      ...this.everyone(JSON.stringify({ type: 'fail', seat: s.seat, map: s.failed })),
      /* Out of the lobby's flags as a leaver is. */
      ...this.gameLobby.leave(this, s.seat, now),
      ...this.settle(now),
    ];
  }

  /* A failed seat whose profile stands on the room's world again, not
   * loading: counted in from now, and the others told. */
  standing(s, now) {
    if (!this.failed(s) || s.profile.map !== this.meta.map || s.profile.status === 'loading') {
      return [];
    }
    s.failed = null;
    return [...this.everyone(JSON.stringify({ type: 'fail', seat: s.seat, map: null })), ...this.settle(now)];
  }

  /* code is the socket's close code when the adapter has it. Anything but
   * a clean leave (1000, rooms.js leave) is a pilot who may be back with
   * their token (a lost network, a reload, a restart), said in the leave as
   * drop: true so the others can say "reconnecting"; a build from before
   * that treats it as any leave. */
  close(conn, now, code = 1000) {
    this.now = now;
    this.pending.delete(conn);
    if (this.watchers.delete(conn)) {
      return [];
    }
    const s = this.seats.get(conn);
    if (!s) {
      return this.people().length ? [] : [{ empty: true, ...(this.finished() ? { now: true } : {}) }];
    }
    this.seats.delete(conn);
    this.referee.leave(s.seat);
    this.war.leave(s.seat);
    this.ops.leave(s.seat, this.roomMs(now));
    for (const [token, r] of this.recent) {
      if (r.until <= now) {
        this.recent.delete(token);
      }
    }
    this.recent.set(s.token, { seat: s.seat, joined: s.joined, until: now + RESEAT_MS });
    const out = this.roster(conn, JSON.stringify({ type: 'leave', seat: s.seat, host: this.host(), ...(code === 1000 ? {} : { drop: true }) }));
    out.push(...this.gameLobby.leave(this, s.seat, now));
    if (!this.people().length) {
      out.push(...this.emptied(now));
      return out;
    }
    out.push(...this.settle(now));
    return out;
  }
}
