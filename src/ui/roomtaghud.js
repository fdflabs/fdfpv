/*
 * roomtaghud.js: Catch the Ace! on screen (src/share/roomtag.js). The
 * words for the flight screen's scoreboard (drawn by the race's
 * RoomRaceHud, src/ui/roomhud.js, the same box: a room runs one game at a
 * time), for the results screen and for the match's rows on Fly with
 * friends, built from the room's match and handed to src/ui/ui.js to draw,
 * so the shell only wires them.
 *
 * nameOf(seat) is the shell's: a pilot's picker name in this pilot's
 * language, or this pilot's own with "you".
 *
 * And the crown changing hands, big (createTagShout): the banner in the
 * middle of the screen in combat's shout style (src/ui/combathud.js,
 * "+100 SCHWING!"), crown gold, and a flash round the screen's edge, gold
 * for the pilot who took the crown and red for the one who lost it.
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

import { str, plural } from '../strings/index.js';
import {
  BUBBLE_M, GOALS, GOAL_MAX, GOAL_MIN,
} from '../share/roomtag.js';

/* A pilot's name on the scoreboard, crowned when they are the Ace. */
function crowned(row, nameOf) {
  const name = nameOf(row.seat);
  return row.ace ? str('roomtag.ace_name', { name }) : name;
}

/* What the scoreboard draws now, or null: nothing before the go. */
export function tagHudView(rt, now, nameOf) {
  const role = rt.role(now);
  if (role !== 'ace' && role !== 'hunter') {
    return null;
  }
  const v = rt.view();
  let title = str('roomtag.hud_hunter', { goal: v.goal });
  if (role === 'ace') {
    title = str('roomtag.hud_ace', { goal: v.goal });
  } else if (rt.orb()) {
    title = str('roomtag.hud_loose');
  }
  return {
    title,
    ...(rt.boost(now) > 1 ? { chip: str('roomtag.boost_chip') } : {}),
    rows: rt.standings().map((row) => ({
      place: row.place, name: crowned(row, nameOf), value: String(row.points), me: row.seat === rt.seat(),
    })),
  };
}

/* The results screen (ui.showRoomResults). */
export function tagResultsView(rt, nameOf) {
  const v = rt.view();
  const rows = rt.standings();
  const me = rows.find((row) => row.seat === rt.seat()) || null;
  const won = v.winner != null && v.winner === rt.seat();
  let head = str('roomtag.results_ended');
  if (won) {
    head = str('roomtag.results_won');
  } else if (v.winner != null) {
    head = str('roomtag.results_winner', { name: nameOf(v.winner) });
  }
  return {
    kicker: str('roomtag.results_kicker', { goal: v.goal }),
    head,
    heroCap: str('roomtag.your_points'),
    heroTime: me ? String(me.points) : '0',
    heroMeta: me ? str('roomrace.place_of', { place: me.place, n: rows.length }) : '',
    win: won,
    rows: rows.map((row) => ({
      label: str('roomrace.row', { place: row.place, name: nameOf(row.seat) }),
      time: plural('count.points', row.points),
      tag: row.seat === v.winner ? str('roomtag.winner_tag') : '',
      me: row.seat === rt.seat(),
      out: Boolean(row.gone),
    })),
  };
}

/* The goal row for what the host has picked: a preset id, or 'custom'
 * with its value. The preset's name is in the label and the points are
 * the value, which is all the value column has room for. */
function goalRow(pick) {
  const preset = GOALS.find((g) => g.id === pick.preset);
  const id = preset ? preset.id : 'custom';
  return {
    label: str(`roomtag.goal_${id}`), value: String(preset ? preset.goal : pick.custom), note: str(`roomtag.goal_${id}_note`),
  };
}

/*
 * The match's rows of Fly with friends. o: { rt, host, nameOf, pick (the
 * host's goal: { preset, custom }), onPreset(d), onCustom(d) }.
 */
export function tagRows(o) {
  const { rt, host } = o;
  const v = rt.view();
  const on = rt.on();
  const err = rt.error();
  /* A host between matches reads the rules on the Start row instead of a
   * row of their own: the room screen has all three games' start rows on
   * its first page, and this row was the one that pushed Start off it.
   * Everybody else, and a host with an error or a match on, keeps it. */
  const idleHost = host && !on && !err;
  const bubble = { m: BUBBLE_M };
  const rules = str('roomtag.rules_note', bubble);
  const rows = [
    { label: str('roomtag.section'), section: true },
    ...(idleHost ? [] : [{
      label: str('roomtag.rules'),
      value: on ? str('roomtag.on_value', { goal: v.goal }) : '',
      note: err ? str(`roomtag.error_${err}`) : str(host ? 'roomtag.rules_note' : 'roomtag.wait', bubble),
      info: true,
    }]),
  ];
  if (host && !on) {
    rows.push({ ...goalRow(o.pick), adjust: o.onPreset });
    if (o.pick.preset === 'custom') {
      rows.push({
        label: str('roomtag.custom'), value: String(o.pick.custom), note: str('roomtag.custom_note', { min: GOAL_MIN, max: GOAL_MAX }), adjust: o.onCustom,
      });
    }
    const again = v.state === 'results';
    rows.push({
      label: str(again ? 'roomtag.again' : 'roomtag.start'),
      note: again ? str('roomtag.again_note') : `${rules} ${str('roomtag.start_note')}`,
      action: 'friends-tag-start',
    });
  }
  if (host && on) {
    rows.push({ label: str('roomtag.end'), note: str('roomtag.end_note'), action: 'friends-tag-end' });
  }
  if (on || v.state === 'results') {
    for (const row of rt.standings()) {
      rows.push({ label: str('roomrace.row', { place: row.place, name: crowned(row, o.nameOf) }), value: plural('count.points', row.points), info: true });
    }
  }
  return rows;
}

/* How long the banner stands, and each flash, ms. */
const SHOUT_MS = 1800;
const FLASH_MS = { gold: 700, red: 450 };
const FLASH_RGB = { gold: '255, 198, 74', red: '255, 70, 60' };

/*
 * The big banner and the edge flash. Two elements, made on first use and
 * kept; a shout or a flash only restyles them.
 */
export function createTagShout() {
  let big = null;
  let edge = null;
  let bigTimer = null;
  let edgeTimer = null;
  const said = [];
  const flashes = [];

  function el(style, className) {
    const d = document.createElement('div');
    Object.assign(d.style, style);
    d.className = className;
    d.setAttribute('aria-hidden', 'true');
    document.body.append(d);
    return d;
  }

  function build() {
    big = el({
      position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -50%) scale(1)', zIndex: '41', pointerEvents: 'none',
      font: '900 60px system-ui, sans-serif', color: '#ffe18a', letterSpacing: '0.04em', whiteSpace: 'nowrap', maxWidth: '96vw',
      textShadow: '0 0 20px rgba(255, 198, 74, 0.95), 0 3px 6px rgba(0, 0, 0, 0.9)', opacity: '0', display: 'none',
      transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
    }, 'tag-shout');
    /* Taken out of the page between flashes: a full screen blurred inset
     * shadow costs every frame it is laid out, even at nil opacity, and on
     * a software rasteriser that alone stalled the page. */
    edge = el({
      position: 'fixed', inset: '0', zIndex: '39', pointerEvents: 'none', opacity: '0', display: 'none',
    }, 'tag-flash');
  }

  /* The banner, big in the middle. Long names shrink it to fit. */
  function shout(text) {
    if (!big) {
      build();
    }
    said.push(text);
    if (said.length > 20) {
      said.shift();
    }
    big.textContent = text;
    big.style.fontSize = `${Math.max(30, Math.min(60, Math.floor(1500 / Math.max(10, text.length))))}px`;
    big.style.display = 'block';
    big.style.transition = 'none';
    big.style.opacity = '1';
    big.style.transform = 'translate(-50%, -50%) scale(1.3)';
    void big.offsetWidth;
    big.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
    big.style.transform = 'translate(-50%, -50%) scale(1)';
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => {
      big.style.opacity = '0';
      bigTimer = setTimeout(() => {
        big.style.display = 'none';
      }, 300);
    }, SHOUT_MS);
  }

  /* The screen's edge lit, 'gold' or 'red', and let go. */
  function flash(kind) {
    if (!edge) {
      build();
    }
    flashes.push(kind);
    if (flashes.length > 20) {
      flashes.shift();
    }
    const rgb = FLASH_RGB[kind];
    edge.style.boxShadow = `inset 0 0 90px 28px rgba(${rgb}, 0.85), inset 0 0 14px 6px rgba(${rgb}, 1)`;
    edge.style.display = 'block';
    edge.style.transition = 'none';
    edge.style.opacity = '1';
    void edge.offsetWidth;
    edge.style.transition = `opacity ${FLASH_MS[kind]}ms ease-in`;
    clearTimeout(edgeTimer);
    edgeTimer = setTimeout(() => {
      edge.style.opacity = '0';
      edgeTimer = setTimeout(() => {
        edge.style.display = 'none';
      }, FLASH_MS[kind] + 50);
    }, 60);
  }

  /* Off at once: a replay, the room left. */
  function hide() {
    clearTimeout(bigTimer);
    clearTimeout(edgeTimer);
    if (big) {
      big.style.opacity = '0';
      edge.style.opacity = '0';
      edge.style.display = 'none';
    }
  }

  return {
    shout,
    flash,
    hide,
    /* For the two page check: every banner and flash, and what shows. */
    said: () => said.slice(),
    flashes: () => flashes.slice(),
    shown: () => (big && big.style.opacity === '1' ? big.textContent : ''),
  };
}
