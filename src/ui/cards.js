/*
 * cards.js: the screens of the shell that show their choices as cards.
 *
 * The home gate and its hubs, with the rooms panel beside them, and the
 * Freestyle world cards. Each is drawn from the same items() the menu rows
 * come from, so one cursor walks cards and rows alike, and each card is
 * built once and only re-marked as the cursor moves: the menu is rebuilt
 * on every key press, and a card rebuilt that often would throw away its
 * picture twenty times a second.
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

import { readWallet } from '../share/account.js';
import { currentLocale, str } from '../strings/index.js';
import { paintPilotStats, pilotStats } from './pilotstats.js';
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
    (this.mapCards || []).forEach((c, i) => c.card.classList.toggle('on', i === this.cursor));
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

  /* The world cards of the Freestyle picker, one per world when it has
   * more than one. */
  renderMapCards() {
    const host = this.freestyleCards;
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
};
