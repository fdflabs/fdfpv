/*
 * roomhud.js: a room's race on screen (src/share/roomrace.js). Who is
 * where, one line each, down the left of the flight screen while the race
 * is on (RoomRaceHud); and the words for the results screen and for the
 * race rows of Fly with friends, built from the room's race and handed to
 * src/ui/ui.js to draw, so the shell only wires them.
 *
 * nameOf(seat) is the shell's: a pilot's picker name in this pilot's
 * language, or this pilot's own with "you".
 *
 * NO WORK ON A QUIET FRAME. The shell updates the flight screen's lines a
 * few times a second, and the DOM is touched only when the text changed.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { str, plural } from '../strings/index.js';
import { formatTime } from './ui.js';

export function trackName(t) {
  return (t && t.name) || str('roomrace.untitled');
}

/* A racer's line: the time once finished, else how far round, or out. */
export function rowValue(row, laps) {
  if (row.ms != null) {
    return formatTime(row.ms);
  }
  if (row.out) {
    return str(`roomrace.out_${row.out}`);
  }
  return str('roomrace.lap_of', { lap: Math.min(row.lap + 1, laps), laps });
}

/* What RoomRaceHud draws now, or null: nothing before the go. */
export function hudView(rr, now, nameOf) {
  const r = rr.race();
  const role = rr.role(now);
  if (r.state !== 'on' || role === 'countdown') {
    return null;
  }
  return {
    title: str(role === 'spectating' ? 'roomrace.hud_watching' : 'roomrace.hud_title'),
    rows: rr.standings().map((row) => ({
      place: row.place, name: nameOf(row.seat), value: rowValue(row, r.laps), me: row.seat === rr.seat(),
    })),
  };
}

/* The results screen (ui.showRoomResults), while the others finish too. */
export function resultsView(rr, nameOf) {
  const r = rr.race();
  const rows = rr.standings();
  const me = rows.find((row) => row.seat === rr.seat()) || null;
  const flown = Boolean(me && me.ms != null);
  const final = r.state === 'results';
  const won = final && flown && me.place === 1;
  return {
    kicker: str('roomrace.results_kicker', { track: trackName(rr.track()) }),
    head: str(won ? 'roomrace.results_won' : (final ? 'roomrace.results_over' : 'roomrace.results_waiting')),
    heroCap: str(flown ? 'roomrace.your_time' : 'roomrace.dnf'),
    heroTime: flown ? formatTime(me.ms) : '',
    heroMeta: me ? str('roomrace.place_of', { place: me.place, n: rows.length }) : '',
    win: won,
    rows: rows.map((row) => ({
      label: str('roomrace.row', { place: row.place, name: nameOf(row.seat) }),
      time: rowValue(row, r.laps),
      tag: row.points ? plural('count.points', row.points) : '',
      me: row.seat === rr.seat(),
      out: row.ms == null,
    })),
  };
}

/*
 * The race rows of Fly with friends. o: { rr, host, nameOf, seated (the
 * track this pilot's seat holds, or null), fits (the aircraft seated fits
 * the room's track), ready, craft (its short name), laps (the host's
 * choice), here (pilots in the room), onLaps(d) }.
 */
export function raceRows(o) {
  const { rr, host } = o;
  const t = rr.track();
  const r = rr.race();
  const on = r.state === 'on';
  const err = rr.error();
  let note;
  if (err) {
    note = str(`roomrace.error_${err}`);
  } else if (!t) {
    note = str(host ? 'roomrace.track_note_host' : 'roomrace.track_wait');
  } else if (!o.fits) {
    note = str('roomrace.nofit', { craft: o.craft });
  } else {
    note = str(o.ready ? 'roomrace.ready_yes' : 'roomrace.ready_no');
  }
  const rows = [
    { label: str('roomrace.section'), section: true },
    { label: str('roomrace.track'), value: t ? trackName(t) : str('roomrace.track_none'), note, info: true },
  ];
  if (host && !on && o.seated && (!t || o.seated.document.id !== t.id)) {
    rows.push({ label: str('roomrace.send', { name: o.seated.name || trackName(o.seated.document) }), note: str('roomrace.send_note'), action: 'friends-race-send' });
  }
  if (host && t && !on) {
    rows.push({ label: str('roomrace.laps'), value: String(o.laps), note: str('roomrace.laps_note'), adjust: o.onLaps });
    rows.push({
      label: str(r.state === 'results' ? 'roomrace.again' : 'roomrace.start'),
      note: str('roomrace.start_note', { ready: r.ready.length, here: o.here }),
      action: 'friends-race-start',
    });
  }
  if (host && on) {
    rows.push({ label: str('roomrace.end'), note: str('roomrace.end_note'), action: 'friends-race-end' });
  }
  if (on || r.state === 'results') {
    for (const row of rr.standings()) {
      rows.push({ label: str('roomrace.row', { place: row.place, name: o.nameOf(row.seat) }), value: rowValue(row, r.laps), info: true });
    }
  }
  return rows;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

export class RoomRaceHud {
  constructor(parent) {
    this.root = el('div', 'room-race is-off');
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
    this.key = '';
  }

  /* view: null to hide, or { title, rows: [{ place, name, value, me }] }. */
  update(view) {
    const key = view ? JSON.stringify(view) : '';
    if (key === this.key) {
      return;
    }
    this.key = key;
    this.root.classList.toggle('is-off', !view);
    this.root.textContent = '';
    if (!view) {
      return;
    }
    this.root.append(el('div', 'room-race-title', view.title));
    for (const r of view.rows) {
      const row = el('div', `room-race-row${r.me ? ' is-me' : ''}`);
      row.append(el('span', 'room-race-place', String(r.place)), el('span', 'room-race-name', r.name), el('span', 'room-race-value', r.value));
      this.root.append(row);
    }
  }
}
