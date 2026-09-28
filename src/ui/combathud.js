/*
 * combathud.js: a combat round on screen (docs/COMBAT-PLAN.md section 5.4):
 * the clock, this pilot's points, paper and pull, every pilot's points
 * live (LIVE_ROWS at most, this pilot always among them), a big +100
 * SCHWING! for a cut this pilot made, a line
 * for every cut, and the results when the round is over. Drawn from the
 * room's round (src/share/roomcombat.js) and nothing else; every word is
 * from the string table, every name a picker name.
 *
 * NO WORK ON A QUIET FRAME: the shell calls update() a few times a second,
 * and the DOM is touched only when the text changed.
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
import { streamerColour } from '../share/roomwire.js';

const LINE_MS = 5000;
const SHOUT_MS = 1600;
const LIVE_ROWS = 8;

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* The standings: most points first, then most cuts, then most paper. */
export function standings(round) {
  return round.scores.slice().sort((a, b) => b.points - a.points || b.cuts - a.cuts || b.links - a.links || a.seat - b.seat);
}

/* nameOf(seat) is the seat's picker name, or this pilot's own. */
export function createCombatHud(nameOf) {
  let box = null;
  let head = null;
  let top = null;
  let feed = null;
  let board = null;
  let big = null;
  let bigTimer = null;
  let shown = '';
  const lines = [];
  /* What the page showed, for the two page check. */
  const said = [];

  function el(style) {
    const d = document.createElement('div');
    Object.assign(d.style, style);
    return d;
  }

  function build() {
    /* Under the world's name, top left: the top centre is the flight
     * screen's own clock and prompts. */
    box = el({
      position: 'fixed', top: '60px', left: '16px', maxWidth: '46vw', zIndex: '40', pointerEvents: 'none',
      font: '600 15px system-ui, sans-serif', color: '#fff', textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
      textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start',
    });
    box.className = 'combat-hud';
    head = el({ font: '700 18px system-ui, sans-serif', background: 'rgba(0, 0, 0, 0.35)', padding: '4px 12px', borderRadius: '6px' });
    top = el({ font: '600 14px system-ui, sans-serif', background: 'rgba(0, 0, 0, 0.3)', padding: '4px 10px', borderRadius: '6px' });
    feed = el({ font: '600 15px system-ui, sans-serif', color: '#ffe7a3' });
    board = el({
      display: 'none', marginTop: '10px', background: 'rgba(0, 0, 0, 0.55)', padding: '10px 16px', borderRadius: '8px',
      font: '600 15px system-ui, sans-serif', textAlign: 'left', minWidth: '320px',
    });
    box.append(head, top, feed, board);
    document.body.append(box);
    /* The cutter's shout, big in the middle of the screen, over the view. */
    big = el({
      position: 'fixed', top: '34%', left: '50%', transform: 'translate(-50%, -50%) scale(1)', zIndex: '41', pointerEvents: 'none',
      font: '900 64px system-ui, sans-serif', color: '#fff6c8', letterSpacing: '0.04em',
      textShadow: '0 0 18px rgba(255, 210, 90, 0.95), 0 3px 6px rgba(0, 0, 0, 0.9)', opacity: '0',
      transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
    });
    big.className = 'combat-schwing';
    document.body.append(big);
  }

  function swatch(seat) {
    const s = document.createElement('span');
    Object.assign(s.style, {
      display: 'inline-block', width: '10px', height: '10px', marginRight: '6px', borderRadius: '2px', background: streamerColour(seat),
    });
    return s;
  }

  /* The big one, for a cut this pilot made. */
  function shout(text) {
    if (!box) {
      build();
    }
    said.push(text);
    big.textContent = text;
    big.style.transition = 'none';
    big.style.opacity = '1';
    big.style.transform = 'translate(-50%, -50%) scale(1.25)';
    void big.offsetWidth;
    big.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
    big.style.transform = 'translate(-50%, -50%) scale(1)';
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => {
      big.style.opacity = '0';
    }, SHOUT_MS);
  }

  /* A line under the clock for a while: a cut, a round starting. */
  function say(text) {
    if (!box) {
      build();
    }
    said.push(text);
    if (said.length > 20) {
      said.shift();
    }
    const line = el({});
    line.textContent = text;
    feed.append(line);
    lines.push(line);
    while (lines.length > 3) {
      lines.shift().remove();
    }
    setTimeout(() => {
      const i = lines.indexOf(line);
      if (i >= 0) {
        lines.splice(i, 1);
        line.remove();
      }
    }, LINE_MS);
  }

  /*
   * A few times a second: round is the room's, me this pilot's seat,
   * roomNow the room clock, paper metres on the aircraft, pull newtons at
   * the tail.
   */
  function update(round, me, roomNow, paper, pull) {
    if (round.state === 'idle' || roomNow == null) {
      if (box && shown !== '') {
        box.style.display = 'none';
        shown = '';
      }
      return;
    }
    if (!box) {
      build();
    }
    box.style.display = 'flex';
    const rows = standings(round);
    const mine = round.scores.find((s) => s.seat === me);
    let text;
    if (round.state === 'countdown') {
      text = str('combat.hud_countdown', { time: clock(round.startsAt - roomNow) });
    } else if (round.state === 'on') {
      text = str(mine && mine.lost ? 'combat.hud_lost' : 'combat.hud', {
        time: clock(round.endsAt - roomNow), points: mine ? mine.points : 0, paper: Math.round(paper), pull: pull.toFixed(1),
      });
    } else {
      text = str('combat.hud_over');
    }
    /* Everyone's points as they stand, this pilot always shown. */
    const live = rows.map((r, i) => ({ r, place: i + 1 })).filter((x, i) => i < LIVE_ROWS - 1 || x.r.seat === me || rows.length <= LIVE_ROWS);
    const three = live.map((x) => str('combat.hud_row', { place: x.place, name: nameOf(x.r.seat), points: x.r.points })).join('   ');
    const key = `${text}|${three}|${round.state}|${JSON.stringify(rows)}`;
    if (key === shown) {
      return;
    }
    shown = key;
    head.textContent = text;
    top.textContent = round.state === 'on' ? three : '';
    board.style.display = round.state === 'over' ? 'block' : 'none';
    if (round.state === 'over') {
      board.replaceChildren();
      const title = el({ font: '700 17px system-ui, sans-serif', marginBottom: '6px' });
      title.textContent = str('combat.results');
      board.append(title);
      rows.forEach((r, i) => {
        const row = el({});
        row.append(swatch(r.seat));
        row.append(document.createTextNode(str('combat.results_row', {
          place: i + 1, name: nameOf(r.seat), points: r.points, cuts: r.cuts, paper: Math.min(r.owed, r.links),
        })));
        board.append(row);
      });
    }
  }

  return {
    say,
    shout,
    update,
    said: () => said.slice(),
    shown: () => ({
      head: head ? head.textContent : '',
      top: top ? top.textContent : '',
      board: board && board.style.display !== 'none' ? board.textContent : '',
      big: big && big.style.opacity === '1' ? big.textContent : '',
    }),
  };
}
