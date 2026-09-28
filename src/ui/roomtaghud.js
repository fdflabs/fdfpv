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

import { str } from '../strings/index.js';
import { GOALS, GOAL_MAX, GOAL_MIN } from '../share/roomtag.js';

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
  return {
    title: role === 'ace'
      ? str('roomtag.hud_ace', { goal: v.goal })
      : str('roomtag.hud_hunter', { goal: v.goal }),
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
      time: str('ui.lap_points', { n: row.points }),
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
  const rows = [
    { label: str('roomtag.section'), section: true },
    ...(idleHost ? [] : [{
      label: str('roomtag.rules'),
      value: on ? str('roomtag.on_value', { goal: v.goal }) : '',
      note: err ? str(`roomtag.error_${err}`) : str(host ? 'roomtag.rules_note' : 'roomtag.wait'),
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
      note: again ? str('roomtag.again_note') : `${str('roomtag.rules_note')} ${str('roomtag.start_note')}`,
      action: 'friends-tag-start',
    });
  }
  if (host && on) {
    rows.push({ label: str('roomtag.end'), note: str('roomtag.end_note'), action: 'friends-tag-end' });
  }
  if (on || v.state === 'results') {
    for (const row of rt.standings()) {
      rows.push({ label: str('roomrace.row', { place: row.place, name: crowned(row, o.nameOf) }), value: str('ui.lap_points', { n: row.points }), info: true });
    }
  }
  return rows;
}
