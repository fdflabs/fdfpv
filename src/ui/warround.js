/*
 * warround.js: the war's round result card (docs/WARFARE-PLAN.md 4.5).
 *
 * A mission is played in rounds. Each round every pilot has `airframes`
 * of them; the round ends when every attacker with a target is dead or
 * has arrived (held, or damaged) or when every pilot has spent them all
 * (lost), and the room shows every screen the result for a few seconds
 * before the next round starts by itself (edge/rooms/war.js). The view
 * carries it flat: round (1 based), rounds, roundState 'live' | 'result',
 * roundResult null | 'win' | 'damaged' | 'lost', roundMw (megawatts lost
 * this round), nextRoundAt (room ms, or null), airframes, spent
 * { seat: n } this round, and earned { seat: n }: a kill gives the pilot
 * who made it one more airframe for the round, so a seat's allowance is
 * airframes + earned.
 *
 * The card is big and centred: "ROUND 3: HELD" in green, "ROUND 3:
 * DAMAGED, -1 400 MW" in orange or "ROUND 3: LOST, -2 800 MW" in red, a
 * line a pilot (kills, airframes used), and "NEXT ROUND IN 5". Every field
 * is read defensively: a room from before rounds sends none of them, and
 * then nothing is shown.
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

import { plural, str } from '../strings/index.js';

const GREEN = '#7dff9a';
const ORANGE = '#ff8a1f';
const RED = '#ff4a3a';
const COLOUR = { win: GREEN, damaged: ORANGE, lost: RED };
/* The war HUD's monospace (src/ui/warhud.js). */
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

/* A number of megawatts with a space every three digits, a no break
 * one, so the card's big title never wraps inside a number. */
function mw(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/* The view's round, or null from a room without rounds. */
export function roundOf(v) {
  if (!v || !Number.isInteger(v.round) || v.round < 1) {
    return null;
  }
  return {
    n: v.round,
    of: Number.isInteger(v.rounds) ? v.rounds : null,
    /* A mission of stages (src/share/war/stages.js) scores each stage as
     * a round, and says stage: the HUD's lower third names the stage. */
    unit: v.stage ? 'stage' : 'round',
    state: v.roundState === 'result' ? 'result' : 'live',
    result: COLOUR[v.roundResult] ? v.roundResult : null,
    mw: Number.isFinite(v.roundMw) ? v.roundMw : 0,
    nextAt: Number.isFinite(v.nextRoundAt) ? v.nextRoundAt : null,
    airframes: Number.isInteger(v.airframes) && v.airframes > 0 ? v.airframes : null,
    spent: v.spent && typeof v.spent === 'object' ? v.spent : {},
    earned: v.earned && typeof v.earned === 'object' ? v.earned : {},
  };
}

function countOf(table, seat) {
  const n = seat != null ? table[seat] : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/* Airframes spent this round by seat, 0 when the view does not say. */
export function spentOf(r, seat) {
  return r ? countOf(r.spent, seat) : 0;
}

/* A seat's airframes for the round, its kills' included, or null when
 * the view has no allowance. */
export function allowanceOf(r, seat) {
  return r && r.airframes != null ? r.airframes + countOf(r.earned, seat) : null;
}

/* nameOf(seat): a pilot's name, or null. */
export function createWarRoundCard(nameOf) {
  let card = null;
  let title = null;
  let rows = null;
  let next = null;
  let shown = '';

  function build() {
    card = document.createElement('div');
    card.className = 'war-round';
    Object.assign(card.style, {
      position: 'fixed', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '43', pointerEvents: 'none', display: 'none',
      fontFamily: FONT, textTransform: 'uppercase', textAlign: 'center',
      background: 'rgba(4, 10, 6, 0.78)', borderTop: '3px solid', borderBottom: '3px solid', padding: '18px 48px 20px',
      minWidth: 'min(880px, 92vw)', maxWidth: '92vw', boxSizing: 'border-box',
      textShadow: '0 0 8px rgba(0, 0, 0, 0.95), 0 2px 3px rgba(0, 0, 0, 0.95)',
    });
    title = document.createElement('div');
    Object.assign(title.style, { fontWeight: '900', fontSize: 'clamp(22px, 3vw, 40px)', letterSpacing: '0.06em', lineHeight: '1.1' });
    rows = document.createElement('div');
    Object.assign(rows.style, {
      marginTop: '14px', fontWeight: '700', fontSize: '16px', letterSpacing: '0.08em', color: GREEN, display: 'flex', flexDirection: 'column', gap: '4px',
    });
    next = document.createElement('div');
    Object.assign(next.style, { marginTop: '14px', fontWeight: '800', fontSize: '20px', letterSpacing: '0.14em', color: '#ffffff' });
    card.append(title, rows, next);
    document.body.append(card);
  }

  function titleOf(r) {
    if (r.result === 'win') {
      return str(`war.${r.unit}_held`, { n: r.n });
    }
    return str(r.result === 'lost' ? `war.${r.unit}_lost` : `war.${r.unit}_damaged`, { n: r.n, mw: mw(r.mw) });
  }

  /* Once a frame or so: the view, or null to hide it; roomNow the room
   * clock for the count down. */
  function update(v, roomNow) {
    const r = roundOf(v);
    if (!r || r.state !== 'result' || !r.result || (v.state !== 'live' && v.state !== 'countdown')) {
      if (card && shown !== '') {
        card.style.display = 'none';
        shown = '';
      }
      return;
    }
    if (!card) {
      build();
    }
    const s = r.nextAt != null && roomNow != null ? Math.max(0, Math.ceil((r.nextAt - roomNow) / 1000)) : null;
    const pilots = (v.scores || []).filter((p) => !p.gone).map((p) => [p.seat, p.kills, spentOf(r, p.seat), allowanceOf(r, p.seat)]);
    const key = JSON.stringify([r, s, pilots]);
    if (key === shown) {
      return;
    }
    shown = key;
    card.style.display = 'block';
    card.style.borderColor = COLOUR[r.result];
    title.style.color = COLOUR[r.result];
    title.textContent = titleOf(r);
    rows.replaceChildren(...pilots.map(([seat, kills, used, of]) => {
      const d = document.createElement('div');
      d.textContent = plural('war.round_pilot', kills, {
        name: nameOf(seat) ?? `#${seat}`, used, of: of ?? used,
      });
      return d;
    }));
    next.textContent = s != null ? str(`war.${r.unit}_next`, { s }) : '';
  }

  return {
    update,
    shown: () => ({
      on: Boolean(card) && card.style.display !== 'none',
      title: title ? title.textContent : '',
      colour: title ? title.style.color : '',
      rows: rows ? [...rows.children].map((d) => d.textContent) : [],
      next: next ? next.textContent : '',
    }),
  };
}
