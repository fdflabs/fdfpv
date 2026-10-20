/*
 * cards.js: the screens of the shell that show their choices as cards.
 *
 * The home gate and its hubs, with the rooms panel beside them; the
 * Freestyle world cards and the short flight that plays on each; My tracks,
 * where the pilot's own tracks, the board's and the tracks server's are
 * cards. Each is drawn from
 * the same items() the menu rows come from, so one cursor walks cards and
 * rows alike, and each card is built once and only re-marked as the
 * cursor moves: the menu is rebuilt on every key press, and a card rebuilt
 * that often would throw away its picture and its playing clip twenty
 * times a second.
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
import { planesFor } from '../game/verify.js';
import {
  boardConfigured, fetchTrackList, pickFeaturedTracks,
} from '../share/board.js';
import {
  fetchAllTracks, fetchTrack, pilotKey, pullOwnTracks, tracksConfigured,
} from '../share/cloud.js';
import { readWallet } from '../share/account.js';
import {
  readBind, readEditKey, readShareImport, writeShareImport,
} from '../share/trackseat.js';
import { currentLocale, str } from '../strings/index.js';
import { duplicateTrack, toPlain } from '../trackbuilder/model.js';
import {
  listMapTracks, loadMapTrack, readOnlineStates, saveTrack,
} from '../trackbuilder/storage.js';
import { formatDay, formatTime } from './format.js';
import { paintPilotStats, pilotStats } from './pilotstats.js';
/* A cycle: ui.js installs this module. These are read only inside methods,
 * after both modules have run, never at this module's top level. */
import {
  byLine, courseCardKey, liveWorld,
} from './ui.js';
import { WAYS } from './ways.js';
import { btn, el } from './widgets.js';

const SEP = ' · ';

/*
 * A world's poster on its card: a rendered frame of the world
 * (scripts/posters.js, named in src/maps/registry.js). The cards' looping
 * clips, recorded through src/share/orbit.html, left with the combat-only
 * cut (2026-10-20); the poster was always the card's first picture.
 *
 * A background, not an <img>: it is decoration the card already names in
 * type, and a file that fails to load paints nothing instead of a broken
 * image. Set on the card as --poster and painted by its .map-reel box
 * (index.html).
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
 * pilot finds the same thing at home and in the hub, Continue too (it
 * adds gate-card-continue). Not a cursor stop: the card is.
 */
function gateLinks(ui, links) {
  const row = el('div', 'gate-links');
  for (const link of links) {
    const b = btn(`gate-link gate-card-${link.key}${link.continue ? ' gate-card-continue' : ''}`, link.label);
    b.tabIndex = -1;
    /* Continue on a campaign names the mission it goes on with. */
    if (link.title) {
      b.title = link.title;
      b.dataset.mission = link.mission;
    }
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
        /* Home's hubs scroll in their column on a short touch phone
         * (index.html, 44 px links): the lit one is brought into it. */
        const column = card.parentElement;
        if (on && column && column.scrollHeight > column.clientHeight) {
          card.scrollIntoView({ block: 'nearest' });
        }
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
    const shape = cards.map((it) => `${it.card}:${(it.links || []).map((l) => `${l.key}${l.continue ? '+' : ''}`).join(',')}`).join('|');
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
        (it.lobby === 'room' || it.lobby === 'watch' ? rooms : actions).append(node);
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
   * FLIGHT CLUB'S PILOT STATS (src/ui/pilotstats.js), shown in that hub
   * only. Rebuilt when a number on it changes, so a sync that brings
   * another computer's time repaints it through the same renderMenu.
   */
  renderTitleStats() {
    const host = this.gateStats;
    if (!host) {
      return;
    }
    const show = this.onGate() && this.hub === 'club';
    host.hidden = !show;
    if (!show) {
      return;
    }
    const st = pilotStats(this.settings, readWallet());
    const shape = `${currentLocale()}|${JSON.stringify(st)}`;
    if (this.titleStatsKey !== shape) {
      this.titleStatsKey = shape;
      paintPilotStats(host, st);
    }
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
      host.textContent = '';
      this.mapCards = worlds.map((it, i) => {
        const card = el('div', 'map-card');
        wearPoster(card, it.map);
        const c = {
          card,
          id: it.map.id,
          name: el('div', 'map-card-name', it.label),
          tag: el('div', 'map-card-tag', ''),
        };
        const body = el('div', 'map-card-body');
        body.append(c.name, c.tag);
        card.append(el('div', 'map-reel'), body);
        pointAt(this, card, i);
        host.append(card);
        return c;
      });
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
   * every flown track is read from (src/share/trackseat.js writeShareImport).
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

  /* The medal this pilot holds on a board track, or ''. */
  medalOn(id) {
    const medals = this.settings && this.settings.progress && this.settings.progress.medals;
    return (medals && medals[`track:${id}`]) || '';
  },
};
