/*
 * debrief.js: an ops mission's debrief over the squad's own stills
 * (docs/campaign/interior/TECH-NEEDS.md N8, INTROS.md's `cap:` and `rec:`
 * stills). When the room ends a match (won or lost) this shows:
 *
 *   - the result, the stars (capped at two after a checkpoint restart,
 *     as the room judged them) and what the mission's next one is
 *   - every item of the mission: this pilot's own still where they took
 *     it (kept on this device only, src/avionics/capture.js), the room's
 *     record of a squadmate's capture (its grade and who took it: the
 *     picture stays on their device; the contract carries no image), or,
 *     where a required one is missing, the ANALYST RECONSTRUCTION frame,
 *     marked as such, never passed off as a capture
 *
 * Which items are required is read from the mission: an item a primary
 * objective asks to capture, or one a star asks for by name. A mission
 * may name its own (`debrief.required`, a list of item ids), which wins.
 * Campaign agnostic: words are string keys under the mission's campaign.
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

import { str } from '../strings/index.js';
import { rank } from '../share/ops/capture.js';
import { itemsOf } from '../share/ops/stages.js';

const CSS = `
.debrief { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; z-index: 45;
  background: rgba(3, 5, 6, 0.82); font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  pointer-events: auto; user-select: text; }
.debrief.open { display: flex; }
.debrief-box { width: min(64em, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
  color: rgba(236, 244, 240, 0.92); padding: 1.2em 1.4em; border: 1px solid rgba(236, 244, 240, 0.3);
  background: rgba(8, 12, 14, 0.94); font-size: clamp(11px, 1.6vh, 15px); letter-spacing: 0.06em; }
.debrief-eyebrow { color: rgba(236, 244, 240, 0.55); letter-spacing: 0.3em; font-size: 0.85em; }
.debrief-box h2 { margin: 0.2em 0 0.4em; font-weight: normal; letter-spacing: 0.16em; font-size: 1.35em; }
.debrief-result { letter-spacing: 0.2em; margin-bottom: 0.6em; }
.debrief-result.lost { color: #ffc04a; }
.debrief-advice { margin: -0.2em 0 0.8em; opacity: 0.9; }
.debrief-stars { display: grid; gap: 0.25em; margin: 0.6em 0 1em; }
.debrief-star { color: rgba(236, 244, 240, 0.5); }
.debrief-star.on { color: #f2d48a; }
.debrief-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(15em, 100%), 1fr)); gap: 0.8em; }
.debrief-still { border: 1px solid rgba(236, 244, 240, 0.22); background: #000; position: relative; }
.debrief-still img, .debrief-still canvas, .debrief-still .debrief-blank { display: block; width: 100%; aspect-ratio: 16 / 9;
  object-fit: cover; }
.debrief-blank { background: repeating-linear-gradient(135deg, #12181b 0 10px, #0d1214 10px 20px); display: flex;
  align-items: center; justify-content: center; color: rgba(236, 244, 240, 0.6); text-align: center; padding: 0 1em;
  box-sizing: border-box; }
.debrief-cap { padding: 0.45em 0.6em; line-height: 1.45; }
.debrief-cap .debrief-sub { color: rgba(236, 244, 240, 0.55); font-size: 0.86em; }
.debrief-who::before { content: '\\00b7'; margin: 0 0.5em; }
.debrief-still.rec { border-style: dashed; border-color: #ffc04a; }
.debrief-still.missing { opacity: 0.55; }
.debrief-next { margin-top: 1em; color: rgba(236, 244, 240, 0.7); }
.debrief-row { display: flex; justify-content: flex-end; gap: 0.8em; margin-top: 1.2em; flex-wrap: wrap;
  position: sticky; bottom: -1.2em; padding: 0.8em 0 1.2em; background: rgba(8, 12, 14, 0.97); }
.debrief-btn { font: inherit; letter-spacing: 0.14em; color: #fff; background: transparent; border: 1px solid rgba(236, 244, 240, 0.5);
  padding: 0.55em 1.1em; min-height: 44px; min-width: 44px; cursor: pointer; }
.debrief-btn.on { background: rgba(236, 244, 240, 0.12); }
`;

const GRADE_INK = { clean: '#8dffb5', usable: '#d8f7a0', poor: '#f2d48a' };

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text != null) {
    e.textContent = text;
  }
  if (parent) {
    parent.append(e);
  }
  return e;
}

function word(key, vars) {
  try {
    return str(key, vars);
  } catch {
    return key;
  }
}

const skey = (id) => String(id).toLowerCase().replace(/[^a-z0-9_.]/g, '_');

/* The item ids a single item trigger names ({ captured: id } or
 * { captured: [ids] }), and none for a set. */
function namedItems(when) {
  const c = when && when.captured;
  if (c == null || (typeof c === 'object' && !Array.isArray(c))) {
    return [];
  }
  return [c].flat();
}

/*
 * The mission's items in its order, each { id, required }: required
 * when a primary objective asks for it (its set or its name) or a star
 * names it, or as the mission's own `debrief.required` says. Pure.
 */
export function debriefItems(mission) {
  const own = mission.debrief && Array.isArray(mission.debrief.required) ? new Set(mission.debrief.required) : null;
  const need = new Set(own ?? []);
  if (!own) {
    for (const st of mission.stages ?? []) {
      for (const o of st.objectives ?? []) {
        if ((o.tier ?? 'primary') === 'primary' && o.done && o.done.captured != null) {
          itemsOf(mission, o.done.captured).forEach((id) => need.add(id));
        }
      }
    }
    for (const s of mission.stars ?? []) {
      const ids = namedItems(s.when);
      if (ids.length === 1) {
        need.add(ids[0]);
      }
    }
  }
  return (mission.items ?? []).map((x) => ({ id: x.id, required: need.has(x.id) }));
}

/*
 * What each item's frame is: 'mine' (this seat's still, with its
 * picture), 'squad' (the room's record of a capture with no picture on
 * this device), 'rec' (required and missing: the reconstruction) or
 * 'missing' (optional, not captured). Pure: captures are the view's,
 * stills this device's.
 */
export function debriefFrames(mission, captures, stills, seat) {
  return debriefItems(mission).map(({ id, required }) => {
    const best = (captures ?? []).filter((c) => c.item === id).sort((a, b) => rank(b.grade) - rank(a.grade))[0] ?? null;
    const still = (stills ?? []).filter((s) => s.item === id && s.image && !s.pending).sort((a, b) => rank(b.grade) - rank(a.grade))[0] ?? null;
    if (still && (!best || best.seat === seat)) {
      return {
        id, required, kind: 'mine', grade: best ? best.grade : still.grade, still, seat,
      };
    }
    if (best) {
      return {
        id, required, kind: 'squad', grade: best.grade, seat: best.seat,
      };
    }
    return { id, required, kind: required ? 'rec' : 'missing' };
  });
}

/* The analyst's reconstruction: drawn, plainly not a photograph, and
 * labelled so on its face. */
function reconstruction(name) {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const g = c.getContext('2d');
  g.fillStyle = '#141a1c';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(236, 244, 240, 0.08)';
  for (let x = 0; x <= c.width; x += 24) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }
  for (let y = 0; y <= c.height; y += 24) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255, 192, 74, 0.7)';
  g.setLineDash([6, 5]);
  g.strokeRect(150, 70, 180, 130);
  g.beginPath();
  g.arc(240, 135, 42, 0, 2 * Math.PI);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#ffc04a';
  g.font = '16px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center';
  g.fillText(str('ops.debrief.rec_mark'), 240, 34);
  g.fillStyle = 'rgba(236, 244, 240, 0.85)';
  g.font = '15px ui-monospace, Menlo, Consolas, monospace';
  g.fillText(name, 240, 238);
  return c;
}

export class Debrief {
  /* act: { close(), again() }; nameOf(seat) the pilot's shown name. */
  constructor(root, act, nameOf) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.act = act;
    this.nameOf = nameOf;
    this.el = el('div', 'debrief', root);
    this.box = el('div', 'debrief-box', this.el);
    this.box.setAttribute('role', 'dialog');
    this.isOpen = false;
    this.shownFor = null;
    /* Escape is Continue: a debrief must never be a dead end. Captured
     * ahead of the game's own keys, which would otherwise take it. */
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.code !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const done = this.box.querySelector('button[data-act="continue"]');
      if (done) {
        done.click();
      }
    }, true);
    this.urls = [];
    this.frames = [];
    window.__debrief = () => ({
      open: this.isOpen,
      frames: this.frames.map(({ still, ...f }) => ({ ...f, image: Boolean(still && still.image) })),
      text: this.box.textContent,
      buttons: [...this.box.querySelectorAll('button')].map((b) => b.dataset.act),
    });
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
    for (const u of this.urls) {
      URL.revokeObjectURL(u);
    }
    this.urls = [];
  }

  /*
   * Show the debrief of a finished match once. o: { key (the match's
   * identity: shown once per key), view, mission, seat, host (bool),
   * stills (this seat's, src/avionics/capture.js createStillStore().of),
   * next ({ id, label } the campaign's next mission and its card word,
   * or null) }.
   */
  show(o) {
    if (o.key === this.shownFor) {
      return;
    }
    this.shownFor = o.key;
    this.close();
    const { view, mission } = o;
    const camp = view.campaign ?? mission.campaign;
    const box = this.box;
    box.textContent = '';
    el('div', 'debrief-eyebrow', box, str('ops.debrief.eyebrow'));
    el('h2', '', box, word(mission.title));
    const won = view.result ? view.result.won : view.state === 'won';
    const ended = !won && view.state === 'ended';
    el('div', `debrief-result${won || ended ? '' : ' lost'}`, box, won
      ? str('ops.debrief.won')
      : ended ? str('ops.debrief.ended') : str('ops.debrief.lost', { why: word(`ops.why.${skey(view.why ?? 'end')}`) }));
    /* Spotted: what to do better, the radio's advice with the height. */
    if (view.spotAdvice) {
      el('div', 'debrief-advice', box, str(`ops.spot.advice_${view.spotAdvice.advice}`, { h: view.spotAdvice.h }));
    }
    const stars = el('div', 'debrief-stars', box);
    const got = new Set((view.result && view.result.starIds) || []);
    for (const s of mission.stars ?? []) {
      const card = s.card ? (mission.stages ?? []).flatMap((st) => st.objectives ?? []).find((x) => x.id === s.card) : null;
      const text = card ? word(card.text) : word(`ops.${skey(camp)}.star.${skey(s.id)}`);
      el('div', `debrief-star${got.has(s.id) ? ' on' : ''}`, stars, `${got.has(s.id) ? '★' : '☆'}  ${text}`);
    }
    if (view.restarted) {
      el('div', 'debrief-sub', stars, str('ops.debrief.restarted'));
    }
    const grid = el('div', 'debrief-grid', box);
    this.frames = debriefFrames(mission, view.captures, o.stills, o.seat);
    for (const f of this.frames) {
      const name = word(`ops.${skey(camp)}.item.${skey(f.id)}`);
      const card = el('div', `debrief-still ${f.kind}`, grid);
      card.dataset.item = f.id;
      card.dataset.kind = f.kind;
      if (f.kind === 'mine') {
        const img = el('img', '', card);
        const url = URL.createObjectURL(f.still.image);
        this.urls.push(url);
        img.src = url;
        img.alt = name;
      } else if (f.kind === 'rec') {
        card.append(reconstruction(name));
      } else {
        el('div', 'debrief-blank', card, f.kind === 'squad' ? str('ops.debrief.squad_note') : str('ops.debrief.not_captured'));
      }
      const cap = el('div', 'debrief-cap', card);
      el('div', '', cap, name);
      const sub = el('div', 'debrief-sub', cap);
      if (f.kind === 'mine' || f.kind === 'squad') {
        const g = el('span', '', sub, str(`ops.grade.${f.grade}`));
        g.style.color = GRADE_INK[f.grade] ?? '';
        const who = f.kind === 'mine' ? str('ops.debrief.yours') : str('ops.debrief.by', { name: this.nameOf(f.seat) });
        el('span', 'debrief-who', sub, who);
      } else if (f.kind === 'rec') {
        sub.textContent = str('ops.debrief.rec_note');
      } else {
        sub.textContent = str('ops.debrief.optional');
      }
    }
    if (o.next) {
      el('div', 'debrief-next', box, str('ops.debrief.next', {
        name: word(`ops.campaign.${skey(camp)}.m.${skey(o.next.key)}`), state: word(`ops.campaign.state_${skey(o.next.label)}`),
      }));
    }
    const row = el('div', 'debrief-row', box);
    if (!won && view.checkpoint && o.host) {
      const again = el('button', 'debrief-btn', row, str('ops.debrief.again'));
      again.type = 'button';
      again.dataset.act = 'again';
      again.addEventListener('click', () => {
        this.close();
        this.act.again();
      });
    }
    const done = el('button', 'debrief-btn on', row, str('ops.debrief.continue'));
    done.type = 'button';
    done.dataset.act = 'continue';
    done.addEventListener('click', () => {
      this.close();
      this.act.close();
    });
    this.isOpen = true;
    this.el.classList.add('open');
    /* Focused so Enter or Space presses it with no mouse at all. */
    done.focus({ preventScroll: true });
  }
}
