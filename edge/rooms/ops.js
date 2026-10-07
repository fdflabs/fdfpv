/*
 * ops.js: the room's half of an ops mission (docs/campaign/interior/
 * CONTRACT-P0.md): The Interior first, any campaign that writes the same
 * data later. A sibling of war.js, which flies attackers and keeps an
 * output; this flies none and keeps the picture: contacts, classes,
 * captures, roles, flags, the sites' alertness, the boundary, and the
 * stage graph that reads them (src/share/ops/, on the war's stage engine).
 *
 * ONE TIMELINE: the war's frontier (every seat heard from in the last
 * WAIT_MS has covered it, or it is LATE_MS old), judged on a fixed grid of
 * GRID_MS of room time. At each grid ms, in order: every contact moved and
 * looked for in every pilot's picture, the sites' alertness, the boundary,
 * crashes; then the stage's objectives, cues (and their scripted effects),
 * the mission's loss rules and its exits, at that ms. So the same poses
 * and camera reports give the same match, message for message, however
 * late they arrive inside the frontier's wait.
 *
 * What a client sends and what the room says: CONTRACT-P0.md sections 3
 * and 4. In short, { type: 'ops', op } with op start, end, lock (the
 * host's), cam, capture, take, active, swap, swapAccept, swapDecline (any
 * seat's, about itself); and the room's { type: 'ops', ops } view on every
 * change, { type: 'ops', op: 'cue', cues } filtered per seat by who hears
 * each line, and { type: 'ops', error } to a refused sender.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match is plain data, handed
 * back as { store: 'ops' } on every change and to restore() by host.js
 * after a restart; the poses and camera reports are memory only (a
 * restart's frontier waits for fresh ones, as the war's does).
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
  FLAG_AIRBORNE, FLAG_CRASHED, decodePose,
} from '../../src/share/roomwire.js';
import { LATE_MS, Track, poseAt as trackPose } from '../../src/game/midair.js';
import { threePosToDoc } from '../../src/render/frame.js';
import {
  beatOf, enter, exitDue, fired, objectives, stagesOf, target as exitTarget,
} from '../../src/share/war/stages.js';
import { released } from '../../src/game/campaign.js';
import { MISSIONS, grounded, worldFor } from '../../src/share/ops/missions.js';
import {
  centreOf, contactsView, discover, membersOf, step as stepContacts,
} from '../../src/share/ops/contacts.js';
import * as roles from '../../src/share/ops/roles.js';
import { siteState, stepSite } from '../../src/share/ops/alert.js';
import {
  GRADES, inBand, judgeCapture, lower, rank,
} from '../../src/share/ops/capture.js';
import { validCam } from '../../src/share/ops/sight.js';
import {
  BOUNDARY_MS, applyCue, cardsView, drawDials, dueCues, resolve, starsOf, toldOf, trigger,
} from '../../src/share/ops/stages.js';
import { COUNTDOWN_MS } from './race.js';
import { AHEAD_MS } from './referee.js';
import { WAIT_MS } from './tag.js';

export { MISSIONS };

/* The room judges on this grid of room time. */
export const GRID_MS = 100;
/* A camera report is kept no closer than this to the one before, and is
 * the camera's for this long after it (CONTRACT-P0.md section 3: two a
 * second, on the room's text allowance). */
export const CAM_MIN_MS = 400;
export const CAM_STALE_MS = 1500;
/* A capture's still may be this far behind the judged frontier. */
export const CAPTURE_BACK_MS = 2000;
/* A seat gone this long gives its roles up (a reload keeps them). */
export const AWAY_MS = 10000;
/* The most stars a match restarted from its checkpoint earns. */
export const RESTART_STARS = 2;

const copy = (x) => JSON.parse(JSON.stringify(x));

/* Every room ms a match's contacts, sites, flags and choices hold, moved
 * by d (a checkpoint's restart). Captures keep theirs: they were taken
 * before the stage, and a trigger reads them from its opening on. */
function shiftTimes(m, d) {
  const mv = (t) => (t == null ? t : t + d);
  for (const c of m.contacts) {
    for (const k of ['t0', 'seenAt', 'firstAt', 'lostSince', 'reacqAt', 'inSince', 'lastIn', 'clsAt', 'vanishedAt', 'movedFor']) {
      c[k] = mv(c[k]);
    }
    c.reached = Object.fromEntries(Object.entries(c.reached).map(([k, t]) => [k, mv(t)]));
    c.evidence = c.evidence.map((x) => ({ ...x, t: mv(x.t) }));
    if (c.next) {
      c.next = { ...c.next, t0: mv(c.next.t0) };
    }
  }
  for (const st of Object.values(m.sites)) {
    st.at = Object.fromEntries(Object.entries(st.at).map(([k, t]) => [k, mv(t)]));
  }
  m.flagAt = Object.fromEntries(Object.entries(m.flagAt).map(([k, t]) => [k, mv(t)]));
  m.choices = Object.fromEntries(Object.entries(m.choices).map(([k, c]) => [k, { ...c, t: mv(c.t) }]));
}

export class RoomOps {
  /* options.devMissions also starts missions in development (campaign.js
   * released): the checks' rooms and a developer's server, never the VM.
   * options.world replaces the map's world (the checks' fixtures). */
  constructor(meta, options = {}) {
    this.meta = meta;
    this.devMissions = options.devMissions === true;
    this.missions = options.missions ?? MISSIONS;
    this.world = options.world ?? null;
    this.match = null;
    this.nextId = 1;
    /* The seed. Math.random in the room; the checks put a fixed one. */
    this.random = Math.random;
    /* seat -> { token, track (scene poses), cams [{ t, aim, tanHalf,
     * aspect }], crashed }. Memory. */
    this.seats = new Map();
    /* For the checks: what was decided, when. Memory only. */
    this.log = [];
    /* token -> { film id: version } watched to the end: memory, as the
     * war keeps it (war.js seenFilms), by token so a seat's next pilot
     * never inherits it. */
    this.seen = new Map();
  }

  /* The match's mission, its heights over the ground made absolute
   * (missions.js grounded). */
  mission() {
    return this.match ? grounded(this.missions[this.match.mission], this.worldOf()) : null;
  }

  worldOf() {
    return this.world ?? worldFor(this.missions[this.match.mission].map);
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.match = saved.match ?? null;
    this.nextId = saved.nextId ?? 1;
    if (this.match && !this.missions[this.match.mission]) {
      this.match = null;
    }
  }

  store() {
    return { store: 'ops', value: { match: this.match, nextId: this.nextId } };
  }

  on() {
    const m = this.match;
    return Boolean(m) && (m.state === 'briefing' || m.state === 'countdown' || m.state === 'live');
  }

  finished() {
    return Boolean(this.match && ['won', 'lost', 'ended'].includes(this.match.state));
  }

  /* Every pilot here plays: an ops mission has no seat it leaves out. */
  players(core) {
    return this.match ? [...core.seats.values()].map((s) => s.seat) : [];
  }

  /* Why a role change is refused now, or null. */
  lockOf() {
    const m = this.match;
    if (!m || !m.roles) {
      return null;
    }
    if (m.state === 'briefing') {
      return 'briefing';
    }
    if (m.stage && stagesOf(this.mission())[m.stage.idx].lockRoles) {
      return 'stage';
    }
    return m.roles.locked ? 'host' : null;
  }

  view(core) {
    const m = this.match;
    if (!m) {
      return { state: 'lobby' };
    }
    const mission = this.mission();
    const def = m.stage ? stagesOf(mission)[m.stage.idx] : null;
    return {
      state: m.state,
      id: m.id,
      mission: m.mission,
      campaign: mission.campaign ?? null,
      goAt: m.goAt,
      briefAt: m.briefAt,
      f: m.f,
      endAt: m.endAt,
      why: m.why,
      stage: m.stage ? {
        id: m.stage.id, n: m.stage.idx, at: m.stage.at, title: def.title ?? null, text: m.stage.text, music: m.stage.music, lockRoles: Boolean(def.lockRoles),
      } : null,
      cards: m.stage ? cardsView(this.ctx(core, m.f)) : [],
      contacts: contactsView(m.contacts),
      sites: copy(m.sites),
      captures: m.captures.map(({
        item, seat, t, grade, at,
      }) => ({
        item, seat, t, grade, at,
      })),
      flags: { ...m.flags },
      search: copy(m.search),
      boundary: Object.fromEntries(Object.entries(m.bound).filter(([, b]) => b.level !== 'out').map(([seat, b]) => [seat, b.level])),
      roles: m.roles ? {
        defs: mission.roles.map(({
          id, core: isCore, guide, platforms,
        }) => ({
          id, core: Boolean(isCore), guide: guide ?? null, platforms: platforms ?? [],
        })),
        held: copy(m.roles.held),
        active: copy(m.roles.active),
        locked: m.roles.locked,
        beat: this.lockOf(),
        swaps: copy(m.roles.swaps),
      } : null,
      dials: { ...m.dials },
      /* What a screen draws by: the mission's clock (the sun), the camp's
       * marked shelter as the room judges it, the choices made (the tarp
       * moved), and the items whose `open` has fired, so seen from any
       * side now (a screen can tell an 'angle' refusal coming). */
      clock: mission.clock ?? null,
      camp: mission.camp ? { mark: resolve(mission.camp.mark, m.dials) } : null,
      choices: Object.fromEntries(Object.entries(m.choices ?? {}).map(([k, c]) => [k, c.value])),
      opened: (mission.items ?? []).filter((it) => it.open && m.stage && fired(it.open, this.ctx(core, m.f)) != null).map((it) => it.id),
      result: m.result,
      /* The briefing's film ({ id, version }, or null) and the seats here
       * that have seen it: the host's skip waits on all of them. */
      film: mission.film ? { id: mission.film.id, version: mission.film.version } : null,
      seen: this.seenHere(core),
      checkpoint: m.state === 'lost' && m.checkpoint ? { stage: m.checkpoint.id, n: m.checkpoint.idx, title: stagesOf(mission)[m.checkpoint.idx].title ?? null } : null,
      restarted: m.restarted ?? null,
    };
  }

  welcome(core) {
    return { ops: this.view(core) };
  }

  broadcast(core, msg) {
    const data = JSON.stringify(msg);
    return [...core.seats.keys()].map((conn) => ({ send: conn, data }));
  }

  changed(core) {
    return [this.store(), ...this.broadcast(core, { type: 'ops', ops: this.view(core) })];
  }

  error(conn, error, why = undefined) {
    return [{ send: conn, data: JSON.stringify({ type: 'ops', error, ...(why ? { why } : {}) }) }];
  }

  /* Cues told to the seats that hear them, one message a seat. */
  tell(core, told) {
    if (!told.length) {
      return [];
    }
    const out = [];
    for (const [conn, s] of core.seats) {
      const mine = told.filter((c) => roles.hears(this.match.roles, s.seat, c.heard));
      if (mine.length) {
        out.push({ send: conn, data: JSON.stringify({ type: 'ops', op: 'cue', cues: mine }) });
      }
    }
    return out;
  }

  /* A pilot seated while a match is on: dealt a role (roles.js join). A
   * seat whose last pilot was someone else gives that pilot's roles up
   * first. */
  join(core, conn, now) {
    const m = this.match;
    if (!this.on() || !m.roles) {
      return [];
    }
    const s = core.seats.get(conn);
    this.enlist(core, s, core.roomMs(now));
    return this.changed(core);
  }

  enlist(core, s, roomNow) {
    const m = this.match;
    const mission = this.mission();
    if (m.tokens[s.seat] != null && m.tokens[s.seat] !== s.token) {
      roles.leave(m.roles, mission.roles, s.seat, roomNow);
    }
    m.tokens[s.seat] = s.token;
    delete m.away[s.seat];
    roles.join(m.roles, mission.roles, s.seat, roomNow);
  }

  /* A seat gone: its roles wait AWAY_MS for it (a reload), then pass on
   * (settleAway). */
  leave(seat, roomNow) {
    this.seats.delete(seat);
    if (this.on() && this.match.roles?.held[seat]) {
      this.match.away[seat] = roomNow;
    }
  }

  settleAway(core, roomNow) {
    const m = this.match;
    const here = new Set([...core.seats.values()].map((s) => s.seat));
    let moved = false;
    for (const [seat, since] of Object.entries(m.away)) {
      if (here.has(Number(seat))) {
        delete m.away[seat];
      } else if (roomNow - since >= AWAY_MS) {
        delete m.away[seat];
        delete m.tokens[seat];
        roles.leave(m.roles, this.mission().roles, Number(seat), roomNow);
        moved = true;
      }
    }
    return moved;
  }

  message(core, conn, s, msg, now) {
    const roomNow = core.roomMs(now);
    switch (msg.op) {
      case 'cam': return this.cam(core, conn, s, msg, roomNow);
      case 'capture': return this.capture(core, conn, s, msg, roomNow);
      case 'take': case 'active': case 'swap': case 'swapAccept': case 'swapDecline':
        return this.role(core, conn, s, msg, roomNow);
      case 'seen': return this.seenFilms(core, conn, s, msg.films);
      default: break;
    }
    if (s.seat !== core.host()) {
      return [];
    }
    if (msg.op === 'start') {
      return this.start(core, conn, msg, now);
    }
    if (msg.op === 'end' && this.on()) {
      const out = this.advance(core, now);
      return this.on() ? [...out, ...this.abandon(core, now)] : out;
    }
    if (msg.op === 'lock' && this.on() && this.match.roles) {
      this.match.roles.locked = msg.on === true;
      return this.changed(core);
    }
    if (msg.op === 'skipIntro') {
      return this.skipIntro(core, conn, now);
    }
    return [];
  }

  /* A pilot's watched films, { id: version }, what the host's skip asks
   * of everybody here. Anything else is refused 'seen'. */
  seenFilms(core, conn, s, films) {
    if (!films || typeof films !== 'object' || Array.isArray(films)
      || !Object.values(films).every((v) => Number.isInteger(v) && v >= 0)) {
      return this.error(conn, 'seen');
    }
    this.seen.set(s.token, { ...films });
    return this.match ? this.changed(core) : [];
  }

  /* The seats here that have seen the mission's briefing film, its
   * version or a newer one. */
  seenHere(core) {
    const f = this.match ? this.missions[this.match.mission].film : null;
    if (!f) {
      return [];
    }
    return [...core.seats.values()].filter((t) => (this.seen.get(t.token)?.[f.id] ?? -1) >= f.version).map((t) => t.seat);
  }

  /*
   * The host cuts the briefing short: the countdown runs from now, for
   * everybody, once every pilot here has seen the film (a first viewing
   * is never cut, docs/campaign/INTROS.md section 3, the war's rule:
   * war.js skipIntro); refused 'unwatched' otherwise. Nothing outside a
   * briefing, so a late or repeated skip cannot move a countdown.
   */
  skipIntro(core, conn, now) {
    const m = this.match;
    if (!m || m.state !== 'briefing') {
      return [];
    }
    if (this.seenHere(core).length < core.seats.size) {
      return this.error(conn, 'unwatched');
    }
    m.goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    m.f = Math.floor(m.goAt / GRID_MS) * GRID_MS;
    m.state = 'countdown';
    this.log.push({ what: 'skip', t: Math.ceil(core.roomMs(now)) });
    return this.changed(core);
  }

  abandon(core, now) {
    if (!this.on()) {
      return [];
    }
    this.finish(core, Math.min(this.match.f, core.roomMs(now)), 'ended', 'end');
    return this.changed(core);
  }

  /* core: the room, whose host may be one of DEV_ACCOUNTS (core.js
   * devHost); without it, only the server's own devMissions. */
  startable(id, core = null) {
    return typeof id === 'string' && Object.hasOwn(this.missions, id) && released(id, this.devMissions || Boolean(core?.devHost()));
  }

  start(core, conn, msg, now) {
    if (this.meta.public) {
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
    const was = this.match;
    const cp = msg.from === 'checkpoint' && was && was.state === 'lost' && was.mission === mission.id ? was.checkpoint : null;
    if (msg.from === 'checkpoint' && !cp) {
      return this.error(conn, 'checkpoint');
    }
    const roomNow = Math.ceil(core.roomMs(now));
    const briefAt = msg.intro === true && !cp && mission.filmMs ? roomNow : null;
    const goAt = (briefAt == null ? roomNow : briefAt + mission.filmMs) + COUNTDOWN_MS;
    const seed = cp ? cp.seed : Math.floor(this.random() * 4294967296) >>> 0;
    const m = {
      id: this.nextId,
      mission: mission.id,
      seed,
      goAt,
      briefAt,
      state: briefAt == null ? 'countdown' : 'briefing',
      why: null,
      f: Math.floor(goAt / GRID_MS) * GRID_MS,
      endAt: null,
      stage: null,
      next: null,
      path: [],
      entries: 0,
      dials: drawDials(mission, seed),
      contacts: [],
      captures: [],
      flags: {},
      flagAt: {},
      sites: Object.fromEntries((mission.sites ?? []).map((x) => [x.id, siteState()])),
      search: [],
      bounds: [],
      bound: {},
      downs: [],
      flew: {},
      choices: {},
      roles: null,
      tokens: {},
      away: {},
      checkpoint: null,
      restarted: null,
      from: 0,
      result: null,
    };
    if (cp) {
      Object.assign(m, copy({
        dials: cp.dials, contacts: cp.contacts, captures: cp.captures, flags: cp.flags, flagAt: cp.flagAt, sites: cp.sites, search: cp.search, choices: cp.choices, path: cp.path,
      }), { entries: cp.entry - 1, from: cp.idx, restarted: cp.id });
      /* The stage opens again at the go: every time the match kept is
       * moved with it, so a contact lost when the stage first opened has
       * been lost as long as it had then, not since. (A checkpoint stored
       * before it kept its `at` is restored as it was.) */
      shiftTimes(m, cp.at == null ? 0 : goAt - cp.at);
    }
    this.match = m;
    this.nextId += 1;
    core.meta.mission = mission.id;
    const seats = [...core.seats.values()];
    m.roles = roles.deal(mission.roles, seats.map((s) => s.seat), seed, roomNow);
    for (const s of seats) {
      m.tokens[s.seat] = s.token;
    }
    for (const r of this.seats.values()) {
      r.crashed = false;
    }
    this.log = [];
    return [{ store: 'meta', value: core.meta }, ...this.changed(core)];
  }

  /* A seat's poses: kept while a match is on, on the room's map. */
  seatOf(s) {
    const had = this.seats.get(s.seat);
    if (had && had.token === s.token) {
      return had;
    }
    const next = {
      token: s.token, track: new Track(), cams: [], crashed: false,
    };
    this.seats.set(s.seat, next);
    return next;
  }

  pose(core, s, bytes, now) {
    if (!this.on()) {
      return [];
    }
    const p = decodePose(bytes);
    if (!p || p.t > core.roomMs(now) + AHEAD_MS || s.profile.map !== core.meta.map) {
      return [];
    }
    this.seatOf(s).track.push(p);
    return [];
  }

  /* A camera report: kept when it is valid, at least CAM_MIN_MS after the
   * last, and not ahead of the room's clock. */
  cam(core, conn, s, msg, roomNow) {
    if (!this.on()) {
      return [];
    }
    const c = {
      t: msg.t, aim: msg.aim, tanHalf: msg.tanHalf, aspect: msg.aspect,
    };
    if (!Number.isFinite(c.t) || c.t > roomNow + AHEAD_MS || !Array.isArray(c.aim) || c.aim.length !== 3 || !c.aim.every(Number.isFinite)
      || !validCam({ dir: [1, 0, 0], tanHalf: c.tanHalf, aspect: c.aspect })) {
      return this.error(conn, 'cam');
    }
    const rec = this.seatOf(s);
    const last = rec.cams.at(-1);
    if (last && c.t < last.t + CAM_MIN_MS) {
      return [];
    }
    rec.cams.push(c);
    const keep = this.match.f - CAM_STALE_MS - CAPTURE_BACK_MS;
    while (rec.cams.length > 2 && rec.cams[1].t < keep) {
      rec.cams.shift();
    }
    return [];
  }

  /* A seat's pose at room ms t in the ops frame, with its flags, or null. */
  poseOf(seat, t) {
    const rec = this.seats.get(seat);
    const p = rec ? trackPose(rec.track, t, {}) : null;
    if (!p) {
      return null;
    }
    const d = threePosToDoc(p.px, p.py, p.pz, {});
    return { p: [d.x, d.y, d.z], flags: p.flags };
  }

  /* A seat's camera at room ms t from position p: the report in force
   * (the last at or before t, no older than CAM_STALE_MS), its direction
   * toward its aim point from p, or null. */
  camOf(seat, t, p) {
    const rec = this.seats.get(seat);
    let c = null;
    for (const x of rec?.cams ?? []) {
      if (x.t <= t) {
        c = x;
      }
    }
    if (!c || t - c.t > CAM_STALE_MS) {
      return null;
    }
    const v = [c.aim[0] - p[0], c.aim[1] - p[1], c.aim[2] - p[2]];
    const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (!(n > 0)) {
      return null;
    }
    return { dir: [v[0] / n, v[1] / n, v[2] / n], tanHalf: c.tanHalf, aspect: c.aspect };
  }

  /* The pilots at room ms t: each seat here with a pose then. */
  pilotsAt(core, t) {
    const out = [];
    for (const s of [...core.seats.values()].sort((a, b) => a.seat - b.seat)) {
      const rec = this.seats.get(s.seat);
      if (!rec || rec.token !== s.token) {
        continue;
      }
      const q = this.poseOf(s.seat, t);
      if (q) {
        out.push({
          seat: s.seat, p: q.p, flags: q.flags, airborne: (q.flags & FLAG_AIRBORNE) !== 0, crashed: (q.flags & FLAG_CRASHED) !== 0, cam: this.camOf(s.seat, t, q.p),
        });
      }
    }
    return out;
  }

  ctx(core, f, pilots = []) {
    const m = this.match;
    return {
      mission: this.mission(),
      m,
      st: m.stage,
      f,
      here: [...core.seats.values()].map((s) => s.seat),
      pilots,
      roles: m.roles,
      world: this.worldOf(),
      trigger,
    };
  }

  /* A capture proposed by a seat (CONTRACT-P0.md section 7). */
  capture(core, conn, s, msg, roomNow) {
    const m = this.match;
    if (!m || m.state !== 'live') {
      return this.error(conn, 'off');
    }
    const mission = this.mission();
    const item = (mission.items ?? []).find((x) => x.id === msg.item);
    const asked = GRADES.includes(msg.grade) ? msg.grade : null;
    if (!item || !asked) {
      return this.error(conn, 'capture', 'item');
    }
    if (!Number.isFinite(msg.t) || msg.t > roomNow + AHEAD_MS || msg.t < m.f - CAPTURE_BACK_MS) {
      return this.error(conn, 'capture', 'time');
    }
    const best = m.captures.filter((c) => c.item === item.id).reduce((b, c) => Math.max(b, rank(c.grade)), -1);
    if (best >= rank(asked)) {
      return this.error(conn, 'capture', 'item');
    }
    const q = this.poseOf(s.seat, msg.t);
    if (!q) {
      return this.error(conn, 'capture', 'pose');
    }
    const cam = this.camOf(s.seat, msg.t, q.p);
    if (!cam) {
      return this.error(conn, 'capture', 'cam');
    }
    /* Where the item is at the still's ms: its place (a dial's), or each
     * contact of its selection then, the best framed taken. */
    const world = this.worldOf();
    const spots = item.contact
      ? membersOf(m.contacts, item.contact).map((c) => centreOf(c, world, msg.t)).filter(Boolean)
      : [resolve(item.at, m.dials)];
    if (!spots.length) {
      return this.error(conn, 'capture', 'item');
    }
    const open = item.open ? fired(item.open, this.ctx(core, m.f)) != null : false;
    const view = item.view ? { ...item.view, dir: resolve(item.view.dir, m.dials) } : null;
    if (view && !open && !spots.some((at) => inBand(view, at, q.p))) {
      return this.error(conn, 'capture', 'angle');
    }
    const tries = spots.map((at) => judgeCapture(at, item.size, q.p, cam, world));
    const j = tries.filter((x) => !x.error).sort((a, b) => rank(b.grade) - rank(a.grade) || a.off - b.off)[0] ?? tries[0];
    if (j.error) {
      return this.error(conn, 'capture', j.error);
    }
    const grade = lower(j.grade, asked);
    if (best >= rank(grade)) {
      return this.error(conn, 'capture', 'item');
    }
    m.captures.push({
      item: item.id, seat: s.seat, t: Math.round(msg.t), grade, at: Math.ceil(roomNow), size: j.size, off: j.off,
    });
    this.log.push({
      what: 'capture', item: item.id, seat: s.seat, t: msg.t, grade,
    });
    return this.changed(core);
  }

  role(core, conn, s, msg, roomNow) {
    const m = this.match;
    if (!this.on() || !m.roles) {
      return this.error(conn, 'off');
    }
    const defs = this.mission().roles;
    if (msg.op === 'active') {
      const why = roles.setActive(m.roles, s.seat, msg.key);
      return why ? this.error(conn, why) : this.changed(core);
    }
    if (msg.op === 'swapDecline') {
      const why = roles.decline(m.roles, s.seat, msg.id);
      return why ? this.error(conn, why) : this.changed(core);
    }
    const lock = this.lockOf();
    if (lock) {
      return this.error(conn, 'locked', lock);
    }
    let why = null;
    if (msg.op === 'take') {
      why = roles.take(m.roles, defs, s.seat, msg.role, roomNow);
      const radio = this.mission().lines?.take;
      if (!why && radio) {
        return [...this.changed(core), {
          send: conn,
          data: JSON.stringify({
            type: 'ops', op: 'cue', cues: [{
              at: Math.ceil(roomNow), stage: m.stage?.id ?? null, heard: { seat: s.seat }, radio,
            }],
          }),
        }];
      }
    } else if (msg.op === 'swap') {
      why = roles.ask(m.roles, s.seat, msg.seat, msg.give ?? null, msg.take ?? null, roomNow).error ?? null;
    } else {
      why = roles.accept(m.roles, defs, s.seat, msg.id, roomNow);
    }
    return why ? this.error(conn, why) : this.changed(core);
  }

  tick(core, now) {
    if (!this.on()) {
      return [];
    }
    return this.advance(core, now);
  }

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
      this.enterStage(core, m.from, m.goAt);
    }
    let dirty = m.state !== state;
    dirty = this.settleAway(core, roomNow) || dirty;
    if (m.state === 'live') {
      const judged = this.judge(core, roomNow);
      dirty ||= judged.dirty;
      out.push(...judged.out);
    }
    return dirty ? [...this.changed(core), ...out] : out;
  }

  /* The frontier: what every seat heard from in the last WAIT_MS has
   * covered, or LATE_MS behind the room clock, whichever is later; judged
   * grid ms by grid ms. */
  judge(core, roomNow) {
    const m = this.match;
    const cut = Math.floor(roomNow - LATE_MS);
    let t1 = Infinity;
    for (const s of core.seats.values()) {
      const rec = this.seats.get(s.seat);
      const n = rec && rec.token === s.token ? rec.track.newest() : -Infinity;
      if (n >= roomNow - WAIT_MS) {
        t1 = Math.min(t1, n);
      }
    }
    t1 = Math.min(roomNow, Math.max(cut, t1 === Infinity ? cut : t1));
    const out = [];
    let dirty = false;
    while (m.state === 'live' && m.f + GRID_MS <= t1) {
      const g = m.f + GRID_MS;
      const r = this.gridStep(core, g);
      m.f = g;
      dirty ||= r.dirty;
      out.push(...r.out);
    }
    return { out, dirty };
  }

  /* Everything at grid ms g, in the order the file's head gives. */
  gridStep(core, g) {
    const m = this.match;
    const mission = this.mission();
    const world = this.worldOf();
    const pilots = this.pilotsAt(core, g);
    let dirty = false;
    const told = [];
    const changed = stepContacts(m.contacts, g, pilots, world, { track: (c) => mission.contacts.find((d) => d.id === c.id)?.track ?? null, points: mission.points ?? {} });
    for (const c of changed) {
      discover(c, mission.classes);
    }
    dirty ||= changed.length > 0;
    for (const site of mission.sites ?? []) {
      /* A site with a `stage` hears nothing before that stage opens. */
      if (site.stage && !(m.stage && m.stage.idx >= stagesOf(mission).findIndex((x) => x.id === site.stage))) {
        continue;
      }
      const st = m.sites[site.id];
      const was = st.value;
      if (stepSite(site, st, g, GRID_MS, pilots.filter((q) => q.airborne).map((q) => q.p)).length || (st.value === 0) !== (was === 0)) {
        dirty = true;
      }
    }
    for (const q of pilots) {
      if (q.airborne) {
        m.flew[q.seat] = true;
      }
      const rec = this.seats.get(q.seat);
      if (q.crashed && !rec.crashed) {
        const alone = !pilots.some((o) => o.seat !== q.seat && o.airborne && !o.crashed);
        m.downs.push({
          seat: q.seat, t: g, roles: [...new Set((m.roles?.held[q.seat] ?? []).map(roles.roleOf))], alone,
        });
        const radio = mission.lines?.downed;
        if (!alone && radio) {
          told.push({
            at: g, stage: m.stage?.id ?? null, heard: 'all', radio,
          });
        }
        dirty = true;
      }
      rec.crashed = q.crashed;
    }
    const b = this.boundaryStep(pilots, g);
    dirty ||= b.length > 0;
    told.push(...b);
    if (m.next && g >= m.next.at) {
      this.enterStage(core, m.next.idx, m.next.at);
      m.next = null;
      dirty = true;
    }
    if (m.stage) {
      /* In an exit's beat the stage's lines play on; only its exits wait. */
      const s = this.stageStep(core, g, pilots, !m.next);
      dirty ||= s.dirty;
      told.push(...s.told);
    }
    return { dirty, out: this.tell(core, told) };
  }

  /* Each pilot outside the mission's boundary is warned, warned a last
   * time BOUNDARY_MS later, and out BOUNDARY_MS after that, which loses
   * the match; back inside, it starts again. The warnings are told to
   * that pilot alone. */
  boundaryStep(pilots, g) {
    const m = this.match;
    const box = this.mission().boundary;
    const told = [];
    if (!box) {
      return told;
    }
    for (const q of pilots) {
      const out = q.p[0] < box.min[0] || q.p[1] < box.min[1] || q.p[0] > box.max[0] || q.p[1] > box.max[1];
      const b = m.bound[q.seat];
      if (!out) {
        delete m.bound[q.seat];
        continue;
      }
      const since = b ? b.since : g;
      const level = g - since >= 2 * BOUNDARY_MS ? 'out' : g - since >= BOUNDARY_MS ? 'final' : 'warning';
      if (!b || b.level !== level) {
        m.bound[q.seat] = { since, level };
        m.bounds.push({ seat: q.seat, level, t: g });
        const radio = this.mission().lines?.boundary?.[level];
        if (radio) {
          told.push({
            at: g, stage: m.stage?.id ?? null, heard: { seat: q.seat }, radio,
          });
        }
      }
    }
    return told;
  }

  enterStage(core, idx, at) {
    const m = this.match;
    const mission = this.mission();
    const def = stagesOf(mission)[idx];
    m.entries += 1;
    for (const c of m.contacts) {
      c.hards = 0;
    }
    /* The match as this stage opens: what a restart from it comes back
     * to (MISSIONS.md 1.1). */
    m.checkpoint = copy({
      id: def.id, idx, at, seed: m.seed, entry: m.entries, dials: m.dials, contacts: m.contacts, captures: m.captures, flags: m.flags, flagAt: m.flagAt, sites: m.sites, search: m.search, choices: m.choices, path: m.path,
    });
    m.stage = enter(mission, idx, at, m.seed, m.entries, { pilots: Math.max(1, core.seats.size) });
    m.path.push({ id: def.id, at });
    this.log.push({ what: 'enter', stage: def.id, t: at });
  }

  /* The stage at grid ms g: its objectives, its cues and their effects,
   * the mission's loss rules, then (unless in a beat) its exit. */
  stageStep(core, g, pilots, exits = true) {
    const m = this.match;
    const mission = this.mission();
    const ctx = this.ctx(core, g, pilots);
    const st = m.stage;
    const objWas = JSON.stringify(st.obj);
    objectives(ctx);
    let dirty = JSON.stringify(st.obj) !== objWas;
    const told = [];
    for (const { t, cue } of dueCues(ctx)) {
      applyCue(m, mission, cue, t);
      if (cue.text !== undefined) {
        st.text = cue.text;
      }
      if (cue.music !== undefined) {
        st.music = cue.music;
      }
      if (['radio', 'text', 'music', 'card'].some((k) => cue[k] !== undefined)) {
        told.push(toldOf(cue, t, st.id, m.dials));
      }
      this.log.push({ what: 'cue', t, stage: st.id, radio: cue.radio ?? null });
      dirty = true;
    }
    /* The mission's own loss rules, in every stage; the boundary's out. */
    let loss = null;
    for (const rule of mission.lost ?? []) {
      const t = fired(rule.when, ctx);
      if (t != null && (!loss || t < loss.t)) {
        loss = { t, why: rule.why, radio: rule.radio };
      }
    }
    const out = m.bounds.find((b) => b.level === 'out' && b.t <= g);
    if (out && (!loss || out.t < loss.t)) {
      loss = { t: out.t, why: 'boundary' };
    }
    const due = exits ? exitDue(ctx) : null;
    if (loss && (!due || loss.t <= due.t)) {
      this.finish(core, loss.t, 'lost', loss.why);
      told.push(...this.endLines(st, loss.t, loss.radio));
      return { dirty: true, told };
    }
    if (!due) {
      return { dirty, told };
    }
    const { exit, t, k } = due;
    this.log.push({ what: 'exit', stage: st.id, t, k });
    const to = exitTarget(mission, st, exit, m.seed, k);
    if (to === 'won' || to === 'lost') {
      this.finish(core, t, to, exit.why ?? 'stages');
      if (to === 'lost') {
        told.push(...this.endLines(st, t));
      }
      return { dirty: true, told };
    }
    const beat = beatOf(exit, m.seed, st, k);
    if (beat > 0) {
      m.next = { idx: to, at: t + beat };
    } else {
      this.enterStage(core, to, t);
    }
    return { dirty: true, told };
  }

  /* A fail's line (a loss rule's own, else the mission's), to everybody. */
  endLines(st, t, own = undefined) {
    const radio = own ?? this.mission().lines?.fail;
    return radio ? [{
      at: t, stage: st.id, heard: 'all', radio,
    }] : [];
  }

  finish(core, t, state, why) {
    const m = this.match;
    m.state = state;
    m.why = why;
    m.endAt = t;
    m.next = null;
    if (state === 'won') {
      const ids = starsOf(this.ctx(core, t));
      const stars = m.restarted != null ? Math.min(RESTART_STARS, ids.length) : ids.length;
      m.result = {
        won: true, stars, starIds: ids, flags: { ...m.flags }, restarted: m.restarted,
      };
    } else {
      m.result = {
        won: false, stars: 0, starIds: [], flags: { ...m.flags }, restarted: m.restarted,
      };
    }
    this.log.push({
      what: 'end', state, why, t,
    });
  }
}
