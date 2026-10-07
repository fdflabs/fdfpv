/*
 * cards.js: the screens of the shell that show their choices as cards.
 *
 * The home gate and its hubs, with the rooms panel beside them; the
 * Freestyle world cards and the short flight that plays on each; My tracks,
 * where the pilot's own tracks, the board's and the tracks server's are
 * cards; the standings table one of those opens; and the Tricks screen's
 * caption. Each is drawn from the same items() the menu rows come from, so
 * one cursor walks cards and rows alike, and each card is built once and
 * only re-marked as the cursor moves: the menu is rebuilt on every key
 * press, and a card rebuilt that often would throw away its picture and its
 * playing clip twenty times a second.
 *
 * Installed onto Ui.prototype at the end of src/ui/ui.js, so `this` is the
 * Ui and main.js, the checks and the rest of the shell still call
 * ui.renderTitleCards() and the others by name.
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

import { airframeById } from '../../configs/airframes.js';
import { raceGatesOf } from '../builder/course.js';
import { formatScore } from '../game/score.js';
import { medalTimes } from '../game/medals.js';
import { planesFor } from '../game/verify.js';
import {
  boardConfigured, fetchTrackList, fetchTrackTimes, pickFeaturedTracks,
} from '../share/board.js';
import {
  fetchAllTracks, fetchTrack, pilotKey, pullOwnTracks, tracksConfigured,
} from '../share/cloud.js';
import {
  CLIP_H, CLIP_MS_MAX, CLIP_W, clipKeyForMap, getClip, makeClipElement, putClip, recordCanvasStream,
  whenVisible, withCaptureLock,
} from '../share/orbitcache.js';
import { readPilotName } from '../share/pilot.js';
import {
  readBind, readEditKey, readShareImport, writeShareImport,
} from '../share/session.js';
import { str, plural } from '../strings/index.js';
import { duplicateTrack, toPlain } from '../trackbuilder/model.js';
import {
  listMapTracks, loadMapTrack, readOnlineStates, saveTrack,
} from '../trackbuilder/storage.js';
import { formatDay, formatTime } from './format.js';
import { filmFor, VIEW_LABEL } from './trickfilm.js';
import { scoreableTricks, trickStatus } from './trickslist.js';
/* A cycle: ui.js installs this module. These are read only inside methods,
 * after both modules have run, never at this module's top level. */
import {
  ROOM_PARENTS, byLine, courseCardKey, liveWorld,
} from './ui.js';
import { WAYS } from './ways.js';
import { btn, el } from './widgets.js';

/*
 * How long the room must go untouched before a world preview may start
 * recording. Arrowing along four cards never leaves a gap this long; a
 * pilot who stops to read a card does. See noteInteraction.
 */
const QUIET_MS = 900;

/* A recorder that has not delivered by now never will. */
const ORBIT_TIMEOUT_MS = 90000;

/* What a world preview reports its finished clip as (src/share/orbit.html).
 * The name is shared with that page, so it changes only together with it. */
const ORBIT_CLIP_MESSAGE = 'fdfpv-orbit-clip';

const SEP = ' · ';

const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const aborted = () => new DOMException('aborted', 'AbortError');
const isAbort = (e) => Boolean(e) && e.name === 'AbortError';

/*
 * A world's poster under a card, so a cold browser's first visit, which
 * records every clip from nothing, shows the places rather than dark boxes
 * saying "loading". The poster is a rendered frame of the world
 * (scripts/posters.js, named in src/maps/registry.js).
 *
 * A background, not an <img>: it is decoration the card already names in
 * type, it outlives the replaceChildren the reel code calls on the shot,
 * and a file that fails to load paints nothing instead of a broken image.
 * On the CARD, not the reel, because two rules read it: the reel paints it,
 * and so does the wait panel over an opaque recorder iframe (index.html).
 */
function wearPoster(card, world) {
  if (!world || !world.poster) {
    return;
  }
  card.style.setProperty('--poster', `url("${new URL(`../../${world.poster}`, import.meta.url).href}")`);
  card.classList.add('has-poster');
}

/* A card is chosen the way its row would be: a hover moves the cursor onto
 * it, a click puts the cursor there and presses Enter. */
function pointAt(ui, node, index) {
  node.addEventListener('mousemove', (e) => ui.hoverCursor(e, index));
  node.addEventListener('click', () => {
    ui.cursor = index;
    ui.select();
  });
}

/* A role=button div, not a <button>: Enter is already handled by handleKey
 * for whatever the cursor is on, and a native button would also fire a
 * click for the same key press and answer twice. */
function pseudoButton(className, label) {
  const node = el('div', className);
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', label);
  return node;
}

function gatesRaced(doc) {
  try {
    return raceGatesOf(doc).length;
  } catch (e) {
    /* A document the builder cannot read races nothing. */
    return 0;
  }
}

/* The gate card's picture: the place as a photograph, and over its corner
 * the craft drawn to scale (ways.js craftSvg), because a photograph shows
 * what a place is like and never how big the thing flying it is. */
function cardArt(it) {
  const art = el('div', 'gate-card-art');
  if (it.art) {
    const shot = el('img', 'gate-card-shot');
    shot.src = it.art;
    /* The name sits right under it; read aloud, the picture is noise. */
    shot.alt = '';
    shot.decoding = 'async';
    art.append(shot);
  }
  if (it.svg) {
    const plan = el('div', 'gate-card-mark');
    plan.innerHTML = it.svg;
    art.append(plan);
  }
  return art;
}

/*
 * A hub card's activities, each one press into its lobby (pickForWay,
 * exactly as the activity's own card does inside the hub) or the Hangar's
 * action. Each link wears its activity card's class, so a check or a
 * pilot finds the same thing at home and in the hub. Not a cursor stop:
 * the card is.
 */
function gateLinks(ui, links) {
  const row = el('div', 'gate-links');
  for (const link of links) {
    const b = btn(`gate-link gate-card-${link.key}`, link.label);
    b.tabIndex = -1;
    b.addEventListener('click', (e) => {
      /* The card under it would take the click as a press of the hub. */
      e.stopPropagation();
      if (ui.onUiSound) {
        ui.onUiSound('select');
      }
      if (WAYS.some((w) => w.action === link.action)) {
        ui.pickForWay(link.action);
      } else {
        ui.act(link.action);
      }
    });
    row.append(b);
  }
  return row;
}

/* What a My tracks card says under its name: world, who built it (board and
 * server tracks, where the publisher and the builder can differ), gates,
 * when the server last saw it, where it stands online, and its record. */
function trackFacts(course, medal = '') {
  const { kind, track: t } = course;
  const world = liveWorld(t.map);
  const facts = [
    world ? world.name : str('cloud.retired_world_short'),
    kind === 'board' || kind === 'cloud' ? byLine(t) : '',
    str('ui.gate_count', { gates: t.gates, v2: t.gates === 1 ? '' : 's' }),
    kind === 'cloud' && t.updatedUtc ? formatDay(t.updatedUtc) : '',
    t.online ? str(`cloud.state_${t.online}`) : '',
    t.recordMs != null ? str('ui.record', { formatTime: formatTime(t.recordMs) }) : '',
    medal ? str('medal.yours', { medal: str(`medal.${medal}`) }) : '',
  ];
  return facts.filter(Boolean).join(SEP);
}

/* The board's listing narrowed to what the seated aircraft may race there.
 * A track on a world this build cannot seat would be a card that loads
 * nothing, and a track drawn for the old race field is one this simulator
 * no longer flies. A quad races every track; a fixed wing only those whose
 * every gate it fits, and its card carries the plane board's record, since
 * that is where its lap would go. */
function raceableFor(af, list) {
  return list
    .filter((t) => t.map && liveWorld(t.map) && (!af.fixedWing || t.planes.includes(af.id)))
    .map((t) => (af.fixedWing
      ? { ...t, recordMs: t.planeRecordMs, recordBy: t.planeRecordBy, times: t.planeTimes }
      : t));
}

function standingsRow(cls, rank, pilot, lap) {
  const row = el('div', cls);
  row.append(el('span', 'standings-rank', rank), pilot, el('span', 'standings-lap', lap));
  return row;
}

/*
 * The orbit page's clip for one world. The iframe records, caches and posts
 * the clip back; anything else posted to this window, or a post from some
 * other frame, is not the answer. Settles once: on the clip, on a failure,
 * on the timeout, or on the session being torn down.
 */
function orbitClip(frame, mapId, signal) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const settle = (err, blob) => {
      if (timer == null) {
        return;
      }
      clearTimeout(timer);
      timer = null;
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      if (err) {
        reject(err);
      } else {
        resolve(blob);
      }
    };
    function onAbort() {
      settle(aborted());
    }
    function onMessage(e) {
      const msg = e.data;
      if (!msg || msg.type !== ORBIT_CLIP_MESSAGE || e.source !== frame.contentWindow) {
        return;
      }
      if (!msg.buffer) {
        settle(new Error('Preview sent no clip.'));
        return;
      }
      settle(null, new Blob([msg.buffer], { type: msg.mime || 'video/webm' }));
    }
    timer = setTimeout(() => settle(new Error('Preview timed out.')), ORBIT_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort);
    window.addEventListener('message', onMessage);
    if (signal.aborted) {
      onAbort();
      return;
    }
    frame.src = new URL(`../share/orbit.html?map=${encodeURIComponent(mapId)}`, import.meta.url).href;
  });
}

/* A preview that failed for any reason but being cancelled: the card shows
 * its poster and a line saying so, and nothing retries until next visit. */
function previewFailed(c) {
  c.wait = null;
  c.shot.replaceChildren();
  c.still.textContent = str('ui.preview_unavailable');
}

export const cardMethods = {
  /*
   * The cursor, painted onto whichever cards are up. The cards are built by
   * the render passes below and kept; only this runs on a cursor move.
   */
  markCards() {
    if (this.screen === 'title') {
      /* A roving tab stop, as the rows have: the cards are the first
       * screen's only controls, so Tab and a screen reader must land on
       * the lit one. */
      (this.titleCards || []).forEach((card, i) => {
        const on = i === this.cursor;
        card.classList.toggle('on', on);
        card.tabIndex = on ? 0 : -1;
        card.setAttribute('aria-current', String(on));
      });
      for (const { node, i } of this.titleRoomEls || []) {
        node.classList.toggle('on', i === this.cursor);
        node.tabIndex = i === this.cursor ? 0 : -1;
      }
      return;
    }
    /* On a picker the world cards come first in items(), then the tracks. */
    const worlds = this.mapCards || [];
    const strip = [...worlds, ...(this.courseCards || [])];
    strip.forEach((c, i) => c.card.classList.toggle('on', i === this.cursor));
  },

  /*
   * Home's hub cards, or a hub's activity cards. Rebuilt only when the set
   * of cards (or a hub card's activity links) changes.
   */
  renderTitleCards() {
    const host = this.gateCards;
    if (!host) {
      return;
    }
    const cards = this.items().filter((it) => it.card);
    const shape = cards.map((it) => `${it.card}:${(it.links || []).map((l) => l.key).join(',')}`).join('|');
    /* The screen takes its hub's accent (index.html, THE HUBS). */
    if (this.screens.title) {
      this.screens.title.dataset.hub = this.hub || '';
    }
    if (this.titleCards && this.titleCardKey === shape) {
      this.markCards();
      return;
    }
    this.titleCardKey = shape;
    host.textContent = '';
    /* Five cards sit tighter than two or three (index.html, THE GATE'S
     * CARDS), so the sheet is told how many share the row. */
    host.dataset.count = String(cards.length);
    this.titleCards = cards.map((it, i) => {
      const card = pseudoButton(`gate-card gate-card-${it.card}`, it.label);
      const body = el('div', 'gate-card-body');
      const facts = el('div', 'gate-card-facts');
      facts.append(...(it.facts || []).map((f) => el('span', 'gate-card-fact', f)));
      body.append(el('div', 'gate-card-name', it.label), el('p', 'gate-card-blurb', it.blurb), facts);
      if (it.links) {
        card.dataset.hub = it.hub;
        body.append(gateLinks(this, it.links));
      }
      card.append(cardArt(it), body);
      pointAt(this, card, i);
      card.addEventListener('focus', () => {
        if (this.cursor !== i) {
          this.setCursor(i);
        }
      });
      host.append(card);
      return card;
    });
    /* The first sight of home lands on Flight Club (the owner, 2026-10-03),
     * not on whatever index the cursor carried from the list before the
     * gate. Once only: after that the cursor is where the pilot left it. */
    if (this.onGate() && !this.hub && !this.homeSeen) {
      this.homeSeen = true;
      this.cursor = this.titleStop();
    }
    this.markCards();
  },

  /*
   * THE ROOMS PANEL on the gate (the owner, 2026-09-30: rooms chosen right
   * on the main page): a heading with the counts, the first few rooms with
   * a seat, All rooms and Make a room. Its entries are menu items after the
   * cards (src/ui/roombrowser.js titleItems), so the arrows, a pad and the
   * mouse reach them like a card. Rebuilt only when what it shows changes.
   * main.js and roombrowser.js call this when the room list moves.
   */
  renderTitleRooms() {
    const host = this.gateRooms;
    if (!host) {
      return;
    }
    const entries = [];
    this.items().forEach((it, i) => {
      if (it.lobby) {
        entries.push({ it, i });
      }
    });
    const shape = JSON.stringify(entries.map(({ it, i }) => [i, it.lobby, it.label, it.value, it.action]));
    if (this.titleRoomKey !== shape) {
      this.titleRoomKey = shape;
      this.titleRoomEls = [];
      host.textContent = '';
      host.hidden = entries.length === 0;
      const rooms = el('div', 'gate-rooms-list');
      const actions = el('div', 'gate-rooms-buttons');
      for (const { it, i } of entries) {
        if (it.lobby === 'head') {
          const head = el('div', 'gate-rooms-head');
          head.append(el('span', 'gate-rooms-title', it.label), el('span', 'gate-rooms-count', it.value));
          host.append(head);
          continue;
        }
        const node = pseudoButton(`gate-room gate-room-${it.lobby}`, it.value ? `${it.label}, ${it.value}` : it.label);
        node.append(el('span', 'gate-room-name', it.label));
        if (it.lobby === 'room') {
          node.classList.toggle('is-live', Boolean(it.live));
          const seats = el('span', 'gate-room-value');
          seats.append(el('span', 'gate-room-join', it.join), `${SEP}${it.value}`);
          node.append(seats);
        }
        pointAt(this, node, i);
        (it.lobby === 'room' ? rooms : actions).append(node);
        this.titleRoomEls.push({ node, i });
      }
      if (rooms.firstChild) {
        host.append(rooms);
      }
      host.append(actions);
    }
    this.markCards();
  },

  /*
   * The Tricks screen's list, each trick with its film. Built once and
   * kept: a film is a few closures over numbers, cheap to make sixty of and
   * wasteful to remake on every key press.
   */
  trickRows() {
    if (!this.trickList) {
      this.trickList = scoreableTricks().map((trick) => {
        const film = filmFor(trick.steps);
        return {
          ...trick, film, how: film.caption, view: film.view, status: trickStatus(trick),
        };
      });
    }
    return this.trickList;
  },

  /*
   * The trick under the cursor: its caption, and its film playing. Only
   * when the trick changes, because this runs on every menu render and
   * restarting a film already playing is a visible stutter.
   */
  renderTricks() {
    const rows = this.trickRows();
    if (!rows.length || !this.trickPlayer) {
      return;
    }
    const at = Math.min(rows.length - 1, Math.max(0, this.cursor));
    const trick = rows[at] || rows[0];
    if (trick.name === this.trickShown) {
      return;
    }
    this.trickShown = trick.name;
    const say = this.constructor.text;
    say(this.trickName, trick.name);
    const points = plural('count.points', trick.points, { n: formatScore(trick.points) });
    say(this.trickMeta, [str('ui.points', { points, difficulty: trick.difficulty }), trick.category, trick.status.tag].join(SEP));
    say(this.trickHow, `${trick.how} ${trick.status.line}`);
    /* The camera's side, said: a roll seen side on looks like a craft not
     * moving at all, so the reader must know which angle they are shown. */
    say(this.trickView, str('ui.seen_the_pink_nose_is_the', { view: VIEW_LABEL[trick.view].replace('seen ', '') }));
    this.trickPlayer.show(trick.film);
  },

  /*
   * The world cards of whichever picker is up. Freestyle draws one per
   * world when it has more than one; the race picker holds none any more,
   * so there this clears an empty strip.
   */
  renderMapCards() {
    const host = this.screen === 'freestyle' ? this.freestyleCards : this.mapCardHost;
    if (!host) {
      return;
    }
    const worlds = this.items().filter((it) => it.map);
    if (!this.mapCards || this.mapCards.length !== worlds.length) {
      this.stopReels();
      host.textContent = '';
      this.mapCards = worlds.map((it, i) => {
        const card = el('div', 'map-card');
        wearPoster(card, it.map);
        const c = {
          card,
          id: it.map.id,
          shot: el('div', 'map-reel'),
          still: el('div', 'map-card-still', ''),
          name: el('div', 'map-card-name', it.label),
          tag: el('div', 'map-card-tag', ''),
          liveCanvas: null,
        };
        const body = el('div', 'map-card-body');
        body.append(c.name, c.tag);
        card.append(c.shot, c.still, body);
        pointAt(this, card, i);
        host.append(card);
        return c;
      });
      this.startReels();
    }
    for (const [i, c] of this.mapCards.entries()) {
      c.card.classList.toggle('on', i === this.cursor);
      c.tag.textContent = c.id === this.settings.map ? str('ui.flying_now') : '';
    }
  },

  /*
   * My tracks' cards: the pilot's own, the tracks server's, the board's,
   * in items() order. A track built in a world wears that world's poster,
   * because the valley it stands in says more than a plan of it floating
   * on nothing.
   */
  renderCourseCards() {
    const host = this.courseCardHost;
    if (!host) {
      return;
    }
    const tracks = this.items().filter((it) => it.course);
    const medal = (it) => this.medalOn(it.course.track.id);
    const shape = tracks.map((it) => `${courseCardKey(it)}:${it.label}:${it.course.track.online || ''}:${medal(it)}`).join('|');
    if (!this.courseCards || this.courseCardKey !== shape) {
      host.textContent = '';
      this.courseCardKey = shape;
      this.courseCards = tracks.map((it, i) => {
        const card = el('div', 'map-card course-card');
        wearPoster(card, liveWorld(it.course.track.map));
        const tag = el('div', 'map-card-tag', '');
        const body = el('div', 'map-card-body');
        body.append(el('div', 'map-card-name', it.label), tag);
        card.append(el('div', 'map-reel'), body, el('div', 'map-card-meta', trackFacts(it.course, medal(it))));
        pointAt(this, card, i);
        host.append(card);
        return {
          card, tag, key: courseCardKey(it), id: it.course.track.id,
        };
      });
    }
    const seat = readShareImport();
    const seatedId = seat ? seat.id : null;
    for (const [i, c] of this.courseCards.entries()) {
      c.card.classList.toggle('on', i === this.cursor);
      /* The rows under the strip belong to one card; mark which, or they
       * read as a menu unrelated to the cards above it. */
      c.card.classList.toggle('chosen', Boolean(this.cardSubject) && c.key === this.cardSubject);
      c.tag.textContent = c.id === seatedId && this.settings.map === 'track' ? str('ui.flying_now') : '';
    }
  },

  /*
   * The pilot's own tracks, read from this browser's library on each visit
   * to My tracks and after anything there changes it. Not inside items(),
   * which runs on every cursor move and would re-read every document.
   *
   * Every track built in a live world is listed, on any aircraft: a list
   * filtered by the seated craft once hid a new pilot's freshly saved track
   * and read as a save that never happened (bug-a0b44950). Its `planes`
   * goes on the card instead, and Play seats a craft that fits.
   */
  loadLocalCourses() {
    let docs = [];
    try {
      docs = listMapTracks().filter((doc) => liveWorld(doc.map));
    } catch (e) {
      /* Private mode or a full quota: this half of the screen is empty, and
       * the board's half is untouched by it. */
    }
    const online = tracksConfigured() ? readOnlineStates() : {};
    this.localCourses = docs.map((doc) => ({
      id: doc.id,
      name: doc.name || str('ui.untitled_track'),
      map: doc.map,
      gates: gatesRaced(doc),
      planes: planesFor(doc),
      author: '',
      online: online[doc.id] ? online[doc.id].state : '',
      doc,
    }));
    if (this.localNote) {
      this.localNote.textContent = this.localCourses.length ? '' : str('ui.no_tracks_of_your_own_yet');
    }
  },

  /*
   * Seat one of the pilot's own tracks for Play, in the share seat that
   * every flown track is read from (src/share/session.js writeShareImport).
   * One this browser published is seated as its listing, so a lap on it
   * can still go to the board. Returns whether it was seated.
   */
  seatLocal(id) {
    const doc = loadMapTrack(id);
    if (!doc) {
      this.localNote.textContent = str('ui.that_track_is_no_longer_saved');
      this.loadLocalCourses();
      return false;
    }
    /* First: each aircraft class keeps its own seat, so a plane that does
     * not fit would file the track in its seat and fly another craft's. */
    this.seatCraftForDoc(doc);
    const document = toPlain(doc);
    const listing = readEditKey(doc.id) ? readBind(doc.id) : null;
    const seat = listing
      ? {
        id: doc.id, name: doc.name, author: listing.author, board: listing.board, document,
      }
      : {
        id: doc.id, name: doc.name, document, local: true,
      };
    if (!writeShareImport(seat)) {
      this.localNote.textContent = str('ui.this_browser_would_not_store_that');
      return false;
    }
    this.setShare(listing ? seat : null);
    return true;
  },

  /*
   * The board's tracks, once per visit to My tracks, when there is a board
   * (src/share/board.js boardConfigured). A nicety, never a dependency: a
   * board that is down leaves the pilot's own tracks as they are, with one
   * line saying so.
   */
  loadBoardCourses() {
    if (!boardConfigured()) {
      this.boardCourses = [];
      this.boardNote.textContent = '';
      return;
    }
    if (this.boardLoading) {
      return;
    }
    this.boardLoading = true;
    this.boardNote.textContent = str('ui.reading_the_board');
    const repaint = () => {
      if (this.screen === 'courses') {
        this.renderMenu();
      }
    };
    (async () => {
      try {
        const list = await fetchTrackList(this.share && this.share.board ? this.share.board : undefined);
        this.boardLoading = false;
        const af = airframeById(this.settings.airframe);
        const raceable = raceableFor(af, list);
        /* All of them, most flown first: the raced tracks on top, the long
         * tail under them. */
        this.boardCourses = pickFeaturedTracks(raceable, raceable.length);
        /* Which list came back empty, said plainly: "nothing here" before
         * a pilot who knows the board has tracks reads as broken. */
        if (this.boardCourses.length) {
          this.boardNote.textContent = '';
        } else if (list.length) {
          this.boardNote.textContent = str('ui.no_tracks_on_the_board_yet', { name: af.name.toLowerCase() });
        } else {
          this.boardNote.textContent = str('ui.no_published_tracks_on_the_board');
        }
        repaint();
      } catch (e) {
        this.boardLoading = false;
        this.boardCourses = [];
        this.boardNote.textContent = str('ui.the_board_is_not_answering_so');
        repaint();
      }
    })();
  },

  /*
   * The tracks server's half of My tracks, when there is one (src/share/
   * cloud.js). First this pilot's tracks saved on another computer come
   * into the library, so they list with the rest of theirs; then a page of
   * everyone else's, newest first. `more` appends the next page. Like the
   * board, a server that does not answer leaves the pilot's own alone.
   */
  loadCloudCourses(more = false) {
    if (!tracksConfigured() || this.cloudLoading) {
      return;
    }
    if (!more) {
      this.cloudCourses = [];
      this.cloudNext = '';
    }
    this.cloudLoading = true;
    this.localNote.textContent = str('cloud.reading');
    (async () => {
      try {
        if (!more && await pullOwnTracks()) {
          this.loadLocalCourses();
        }
        const me = await pilotKey();
        const page = await fetchAllTracks({ before: more ? this.cloudNext : '' });
        /* The pilot's own are already in their list. The rest list on any
         * aircraft, for the reason loadLocalCourses gives. */
        this.cloudCourses = this.cloudCourses.concat(page.tracks.filter((t) => t.owner !== me));
        this.cloudNext = page.next;
        this.localNote.textContent = this.localCourses.length ? '' : str('ui.no_tracks_of_your_own_yet');
      } catch (e) {
        this.localNote.textContent = str('cloud.not_answering');
      }
      this.cloudLoading = false;
      if (this.screen === 'courses') {
        this.renderMenu();
        this.renderCourseCards();
      }
    })();
  },

  /* Another pilot's track off the server, seated to fly as if it were this
   * browser's own: nothing about it is posted anywhere. `then` runs once it
   * is seated. */
  seatCloud(t, then) {
    this.localNote.textContent = str('ui.loading_2', { name: t.name });
    (async () => {
      try {
        const got = await fetchTrack(t.id);
        this.seatCraftForDoc(got.doc);
        const seat = {
          id: got.id, name: got.name, author: got.author, document: toPlain(got.doc), local: true,
        };
        if (!writeShareImport(seat)) {
          this.localNote.textContent = str('ui.this_browser_would_not_store_that');
          return;
        }
        this.localNote.textContent = '';
        this.setShare(null);
        then();
      } catch (err) {
        this.localNote.textContent = str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err });
      }
    })();
  },

  /* Edit a copy of another pilot's track: the copy is this pilot's from its
   * first save, under an id of its own, opened in the builder in the
   * track's world. The original is not theirs to save over. */
  editCloudCopy(t) {
    this.localNote.textContent = str('ui.loading_2', { name: t.name });
    (async () => {
      try {
        const got = await fetchTrack(t.id);
        const copy = duplicateTrack(got.doc, got.name);
        if (!saveTrack(copy)) {
          this.localNote.textContent = str('ui.this_browser_would_not_store_that');
          return;
        }
        this.localNote.textContent = '';
        this.cardSubject = null;
        this.openBuilder({ map: copy.map, id: copy.id });
      } catch (err) {
        this.localNote.textContent = str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err });
      }
    })();
  },

  /*
   * The standings of one board track. `track` is a board listing, so the
   * name, builder and gates are drawn at once and only the times wait on
   * the network.
   *
   * The screen is opened here, not through act('standings'): that action
   * is also the row that opens this screen for the seated track, and its
   * handler calls back into here. Where it was opened from is still kept,
   * as act() does, so Back returns to the track list.
   */
  /* The medal this pilot holds on a board track, or ''. */
  medalOn(id) {
    const medals = this.settings && this.settings.progress && this.settings.progress.medals;
    return (medals && medals[`track:${id}`]) || '';
  },

  showStandings(track) {
    if (!track || !track.id) {
      return;
    }
    this.standingsFor = track;
    this.standingsTimes = null;
    this.standingsError = '';
    this.roomFrom = ROOM_PARENTS.has(this.screen) ? this.screen : null;
    this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
    this.show('standings');
    /* Only the answer for the track last asked for is drawn; a slower
     * answer for an earlier one is dropped. */
    const asked = track.id;
    this.standingsLoading = asked;
    const land = (times, error) => {
      if (this.standingsLoading !== asked) {
        return;
      }
      this.standingsLoading = null;
      this.standingsTimes = times;
      if (error) {
        this.standingsError = error;
      }
      if (this.screen === 'standings') {
        this.paintStandings();
        this.renderMenu();
      }
    };
    (async () => {
      try {
        const times = await fetchTrackTimes(track.id, track.board);
        /* A track in a world keeps two boards, quads and planes; the
         * seated aircraft's is shown. A field track has one. */
        const plane = Boolean(airframeById(this.settings.airframe).fixedWing);
        const shown = track.map ? times.filter((t) => Boolean(t.craft) === plane) : [...times];
        land(shown.sort((a, b) => a.lapMs - b.lapMs));
      } catch (e) {
        land([], str('ui.the_board_is_not_answering_so_2'));
      }
    })();
  },

  /*
   * The standings table: drawn, not listed as rows, because forty times as
   * menu rows would make the cursor walk all of them to reach Back, and a
   * leaderboard is read, not traversed. The pilot's own name is marked: it
   * is the one row anybody looks for.
   */
  paintStandings() {
    const table = this.standingsTable;
    if (!table) {
      return;
    }
    const t = this.standingsFor;
    table.textContent = '';
    if (this.standingsLede) {
      this.standingsLede.textContent = t
        ? [t.name, t.gates ? `${t.gates} gates` : '', byLine(t)].filter(Boolean).join(SEP)
        : '';
      const times = t && medalTimes(t.medals);
      const mine = t ? this.medalOn(t.id) : '';
      const line = [
        times ? str('medal.times', { gold: formatTime(times.gold), silver: formatTime(times.silver), bronze: formatTime(times.bronze) }) : '',
        mine ? str('medal.yours', { medal: str(`medal.${mine}`) }) : '',
      ].filter(Boolean).join(SEP);
      if (line) {
        this.standingsLede.append(el('div', 'standings-medals', line));
      }
    }
    if (!t) {
      return;
    }
    const times = this.standingsTimes;
    let note = '';
    if (times == null) {
      note = str('ui.reading_the_board');
    } else if (this.standingsError) {
      note = this.standingsError;
    } else if (!times.length) {
      note = str('ui.no_times_posted_on_this_track');
    }
    if (note) {
      table.append(el('div', 'standings-note', note));
      return;
    }
    const fold = (name) => String(name || '').trim().toLowerCase();
    const me = fold(readPilotName());
    table.append(standingsRow('standings-row standings-head', '', el('span', 'standings-pilot', str('ui.pilot')), 'Lap'));
    times.forEach((lap, i) => {
      const pilot = el('span', 'standings-pilot', lap.name || str('ui.unnamed_pilot'));
      /* A ghost is the difference between reading a time and racing it. */
      if (lap.hasGhost) {
        pilot.append(el('span', 'standings-ghost', 'ghost'));
      }
      const row = standingsRow('standings-row', String(i + 1), pilot, formatTime(lap.lapMs));
      row.classList.toggle('is-me', Boolean(me) && fold(lap.name) === me);
      row.classList.toggle('is-record', i === 0);
      table.append(row);
    });
  },

  /*
   * The world cards' reels. A clip cached in this browser plays at once. A
   * miss shows the wait panel and is recorded later, one world at a time
   * and only while nobody is using the room: the seated world by copying
   * the view already on screen, any other by loading its orbit page in an
   * iframe. Either blocks this thread for seconds, so it is paid once per
   * browser and never while the pilot is pressing keys (noteInteraction).
   */
  startReels() {
    this.stopReels();
    const cards = this.mapCards ?? [];
    const seated = this.settings.map;
    const session = { ac: new AbortController(), urls: [], unsub: [] };
    this.reelSession = session;
    this.reelFreezeWorld = false;
    const live = () => this.reelSession === session;

    const onVisibility = () => {
      const hidden = document.hidden || this.screen !== 'courses';
      for (const c of this.mapCards || []) {
        if (!c.clip || !c.clip.pause) {
          continue;
        }
        if (hidden) {
          c.clip.pause();
        } else {
          /* Autoplay refused is a still card, not an error. */
          c.clip.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    session.unsub.push(() => document.removeEventListener('visibilitychange', onVisibility));

    for (const c of cards) {
      c.shot.replaceChildren();
      c.liveCanvas = null;
      c.clip = null;
      c.still.textContent = '';
    }

    const fill = async () => {
      const missing = [];
      for (const c of cards) {
        if (!live()) {
          return;
        }
        c.clipKey = clipKeyForMap(c.id);
        try {
          const blob = await getClip(c.clipKey);
          if (blob) {
            this.attachClip(c, blob, session);
            continue;
          }
        } catch (e) {
          /* An unreadable cache, or a clip that will not play, is a miss:
           * record it afresh. */
        }
        missing.push(c);
      }
      missing.forEach((c) => this.showReelWait(c));
      /* The seated world first, from the view already drawn, then the
       * rest through their orbit pages. */
      const queue = [
        ...missing.filter((c) => c.id === seated).map((c) => [c, this.captureCurrentCard]),
        ...missing.filter((c) => c.id !== seated).map((c) => [c, this.captureRemoteCard]),
      ];
      for (const [c, capture] of queue) {
        if (!live()) {
          return;
        }
        await this.whenQuiet(session);
        this.reelCapturing = true;
        try {
          await capture.call(this, c, session);
        } finally {
          this.reelCapturing = false;
        }
      }
    };
    fill().catch((e) => {
      if (!isAbort(e)) {
        console.warn(e);
      }
    });
  },

  /* A finished clip into its card, replacing whatever was there. Its object
   * URL belongs to the session and is revoked with it. */
  attachClip(c, blob, session) {
    const { node, url } = makeClipElement(blob, 'map-reel-view');
    session.urls.push(url);
    c.liveCanvas = null;
    c.clip = node;
    c.wait = null;
    c.still.textContent = '';
    c.shot.replaceChildren(node);
    if (document.hidden && node.pause) {
      node.pause();
    }
  },

  /* The wait panel over a card whose clip is still to come; one per card. */
  showReelWait(c) {
    if (c.wait && c.shot.contains(c.wait)) {
      return;
    }
    c.wait = el('div', 'map-reel-wait');
    c.wait.append(el('div', 'map-reel-wait-stage', 'loading'));
    c.shot.append(c.wait);
  },

  /*
   * The seated world's clip, recorded from a canvas the render loop copies
   * the title view into (paintMapThumbs) rather than loading the same world
   * a second time.
   */
  async captureCurrentCard(c, session) {
    const canvas = el('canvas', 'map-reel-view');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = CLIP_W;
    canvas.height = CLIP_H;
    /* Marks a recorder canvas, whose size is the clip's and not the card's. */
    canvas.dataset.clip = '1';
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      /* The poster's dark green, so the first frames are not black. */
      ctx.fillStyle = '#1a241c';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    }
    c.shot.append(canvas);
    c.liveCanvas = canvas;
    c.still.textContent = '';
    this.showReelWait(c);
    try {
      /* One recorder at a time across every tab of this site. Another may
       * have cached this world while we waited for the lock. */
      await withCaptureLock(async () => {
        if (this.reelSession !== session) {
          return;
        }
        const cached = await getClip(c.clipKey);
        if (cached) {
          this.attachClip(c, cached, session);
          return;
        }
        await whenVisible(session.ac.signal);
        const blob = await recordCanvasStream(canvas, CLIP_MS_MAX, session.ac.signal);
        await putClip(c.clipKey, blob);
        if (this.reelSession === session) {
          this.attachClip(c, blob, session);
        }
      });
    } catch (e) {
      if (!isAbort(e)) {
        previewFailed(c);
      }
    } finally {
      c.liveCanvas = null;
    }
  },

  /* Any other world's clip, from its orbit page in an iframe that records,
   * caches and posts the clip back. The world behind the menu is held
   * still meanwhile (main.js reads reelFreezeWorld), and the iframe is
   * removed whatever happens, which ends the scene it built. */
  async captureRemoteCard(c, session) {
    c.still.textContent = '';
    const frame = document.createElement('iframe');
    frame.className = 'map-reel-view';
    frame.title = str('ui.world_preview');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    c.shot.append(frame);
    this.showReelWait(c);
    this.reelFreezeWorld = true;
    try {
      await whenVisible(session.ac.signal);
      const blob = await orbitClip(frame, c.id, session.ac.signal);
      if (this.reelSession === session) {
        await putClip(c.clipKey, blob);
        this.attachClip(c, blob, session);
      }
    } catch (e) {
      if (!isAbort(e)) {
        previewFailed(c);
      }
    } finally {
      frame.remove();
      if (this.reelSession === session) {
        this.reelFreezeWorld = false;
      }
    }
  },

  /*
   * The render loop's frame, copied onto any card recording the seated
   * world, cropped to cover the card the way the poster does. main.js calls
   * this every frame on My tracks; once the clips exist there is nothing to
   * copy.
   */
  paintMapThumbs(src) {
    if (this.screen !== 'courses' || !this.mapCards) {
      return;
    }
    const sw = src.width;
    const sh = src.height;
    if (!(sw > 0 && sh > 0)) {
      return;
    }
    for (const { liveCanvas: dest } of this.mapCards) {
      if (!dest) {
        continue;
      }
      /* A plain thumbnail follows its card's size; a recorder keeps the
       * clip's. */
      if (dest.dataset.clip !== '1') {
        const w = Math.max(1, dest.clientWidth);
        const h = Math.max(1, dest.clientHeight);
        if (dest.width !== w || dest.height !== h) {
          dest.width = w;
          dest.height = h;
        }
      }
      const zoom = Math.max(dest.width / sw, dest.height / sh);
      const cw = dest.width / zoom;
      const ch = dest.height / zoom;
      try {
        dest.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, dest.width, dest.height);
      } catch (e) {
        /* A tainted source would throw on every frame; the card keeps its
         * last good picture instead. */
      }
    }
  },

  /*
   * Any input at all, noted so a preview recording gets out of the way.
   *
   * A recording builds a whole Three.js scene on this thread: measured on a
   * cold cache, 23 frames in 10.4 s with one 5155 ms gap, reported as "the
   * freestyle page is unresponsive when I get to it". Waiting for quiet
   * before starting is not enough, since a pilot who reads for a second and
   * then reaches for the arrows walks into a block already begun. So input
   * tears a running recording down (removing its iframe ends its scene)
   * and re-arms it for the next quiet spell; once one finishes it is
   * cached for every later visit.
   */
  noteInteraction() {
    this.lastInteractionAt = clock();
    if (this.reelCapturing && this.reelSession) {
      this.stopReels();
      this.armReels();
    }
  },

  /* Restart the reels after input tore them down. One timer, replaced, so
   * arrowing past four cards schedules one restart and not four. */
  armReels() {
    clearTimeout(this.reelRestart);
    this.reelRestart = setTimeout(() => {
      this.reelRestart = null;
      if (this.screen === 'courses' || this.screen === 'freestyle') {
        this.startReels();
      }
    }, QUIET_MS);
  },

  /*
   * Resolves once the room has gone QUIET_MS without input, rejects with
   * an AbortError if the session ends first. Polled, because what is waited
   * for is an absence, which fires no event.
   */
  whenQuiet(session) {
    return new Promise((resolve, reject) => {
      const look = () => {
        if (!session || this.reelSession !== session || session.ac.signal.aborted) {
          reject(aborted());
          return;
        }
        const idle = clock() - (this.lastInteractionAt || 0);
        if (idle >= QUIET_MS) {
          resolve();
          return;
        }
        session.quietTimer = setTimeout(look, Math.max(80, QUIET_MS - idle));
      };
      look();
    });
  },

  /* End the reel session: cancel its wait and any recording, drop its
   * listeners, free its clips, and empty every card's reel. */
  stopReels() {
    this.reelFreezeWorld = false;
    this.reelCapturing = false;
    const session = this.reelSession;
    this.reelSession = null;
    if (session) {
      clearTimeout(session.quietTimer);
      session.ac.abort();
      session.unsub.forEach((off) => off());
      session.urls.forEach((url) => URL.revokeObjectURL(url));
    }
    for (const c of this.mapCards || []) {
      c.liveCanvas = null;
      c.clip = null;
      c.shot.replaceChildren();
    }
  },
};
