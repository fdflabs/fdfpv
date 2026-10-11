/*
 * jamhud.js: Trick Battle on screen (src/share/roomjam.js,
 * docs/JAM-PLAN.md). The words for the flight screen's scoreboard (the
 * race's box, src/ui/roomhud.js RoomRaceHud: a room runs one game at a
 * time) and for the results screen, built from the room's match so the
 * shell only wires them.
 *
 * nameOf(seat) is the shell's: a pilot's picker name, or this pilot's own
 * with "you". own is this pilot's run as its scorer has it now, or null:
 * the runner sees its score the frame it lands, not half a second later
 * when the room relays it.
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
import { formatScore } from '../game/score.js';
import { trickTitle } from './scorehud.js';

/* m:ss of ms, never below zero. */
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* What the scoreboard draws now, or null outside a match. */
export function jamHudView(rj, now, nameOf, own) {
  if (!rj.on() || now == null) {
    return null;
  }
  const v = rj.view();
  const mine = rj.mine();
  const live = mine && own ? own : v.live;
  const name = nameOf(v.runner);
  let title;
  if (v.state === 'turn') {
    title = mine ? str('jam.hud_yours_in', { s: Math.max(0, Math.ceil((v.goAt - now) / 1000)) })
      : str('jam.hud_next', { name, s: Math.max(0, Math.ceil((v.goAt - now) / 1000)) });
  } else {
    title = str(mine ? 'jam.hud_yours' : 'jam.hud_theirs', { name, t: clock(v.endAt - now) });
  }
  const last = live && live.last;
  return {
    title: str('jam.hud_title', { round: str('jam.hud_round', { n: v.round, of: v.rounds }), what: title }),
    ...(v.state === 'run' && last ? { chip: str('jam.hud_last', { name: trickTitle(last.name), points: formatScore(last.points) }) } : {}),
    rows: [
      ...(v.state === 'run' ? [{
        place: '', name: str('jam.hud_live', { name }), value: formatScore(live ? live.total : 0), me: mine,
      }] : []),
      ...rj.standings().map((row, i) => ({
        place: i + 1,
        name: nameOf(row.seat),
        value: str('jam.hud_wins', { wins: row.wins, total: formatScore(row.total) }),
        me: row.seat === rj.seat(),
      })),
    ],
  };
}

/* The shout as a turn counts down: whose run it is. */
export function jamTurnShout(rj, nameOf) {
  const v = rj.view();
  return rj.mine() ? str('jam.shout_yours') : str('jam.shout_theirs', { name: nameOf(v.runner) });
}

/* The results screen (ui.showRoomResults). */
export function jamResultsView(rj, nameOf) {
  const v = rj.view();
  const rows = rj.standings();
  const winners = v.winners || [];
  const seat = rj.seat();
  const me = rows.find((row) => row.seat === seat) || null;
  const won = winners.includes(seat);
  let head = str('jam.results_ended');
  if (won) {
    head = str(winners.length > 1 ? 'jam.results_shared_you' : 'jam.results_won');
  } else if (winners.length) {
    head = str('jam.results_winner', { name: winners.map(nameOf).join(', ') });
  }
  const best = (v.runs || []).filter((r) => r.seat === seat).reduce((a, r) => Math.max(a, r.total), 0);
  return {
    kicker: str('jam.results_kicker', { s: v.seconds }),
    head,
    heroCap: str('jam.your_best'),
    heroTime: formatScore(best),
    heroMeta: me ? str('roomrace.place_of', { place: rows.indexOf(me) + 1, n: rows.length }) : '',
    win: won,
    rows: rows.map((row, i) => ({
      label: str('roomrace.row', { place: i + 1, name: nameOf(row.seat) }),
      time: str('jam.results_row', { rounds: plural('count.rounds_won', row.wins), total: formatScore(row.total) }),
      tag: winners.includes(row.seat) ? str('jam.winner_tag') : '',
      me: row.seat === seat,
      out: (v.gone || []).includes(row.seat),
    })),
  };
}
