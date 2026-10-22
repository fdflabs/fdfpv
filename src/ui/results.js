/*
 * results.js: the results screen and the title's record line, as Ui
 * methods installed onto the class at the end of ui.js.
 *
 * The screen serves a room's game (rows the shell writes, because only it
 * knows the other pilots): the hero block (kicker, headline, caption, big
 * number, a meta line) and the rows (label, figure, optional tag). A timed
 * race was its other ending until the race left (the combat-only cut,
 * 2026-10-20).
 *
 * `this` is the Ui. Callers are src/main.js and the Ui's own menus; the
 * names and arguments are theirs and must not change.
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

import { MAPS } from '../maps/registry.js';
import { str } from '../strings/index.js';
import { factLines } from './factlines.js';
import { el } from './widgets.js';

const worldOf = (settings) => MAPS.find((m) => m.id === settings.map) ?? MAPS[0];

/* One results row. `mods` are the extra row classes (void, fastest),
 * `cells` the spans in reading order. */
function resultRow(mods, cells) {
  const row = el('div', ['result-row', ...mods.filter(Boolean)].join(' '));
  const main = el('div', 'result-main');
  main.append(...cells);
  row.append(main);
  return row;
}

const cell = (kind, text) => el('span', `result-${kind}`, text);

/* Empties the screen's body and note, and sets its win class. */
function resetScreen(ui, win) {
  ui.resultsBody.textContent = '';
  ui.resultsNote.textContent = '';
  ui.resultsFacts.textContent = '';
  ui.resultsDebrief = null;
  ui.screens.results.classList.toggle('is-record', win);
}

function replayEntrance(screen) {
  screen.classList.remove('is-in');
  /* The read forces a style flush, so adding the class back replays the
   * animation instead of being folded into the removal. */
  void screen.offsetWidth;
  screen.classList.add('is-in');
}

const SVG = 'http://www.w3.org/2000/svg';
/* The route's square, in SVG units; the line is scaled into it less a
 * margin so the start and end dots are never clipped. */
const ROUTE_BOX = 100;
const ROUTE_PAD = 8;

function svg(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/* The route seen from above, the same scale on both axes so a circle
 * stays round, start hollow and end filled. */
function routeSvg(route) {
  const xs = route.points.map((p) => p[0]);
  const zs = route.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const span = Math.max(Math.max(...xs) - x0, Math.max(...zs) - z0, 1);
  const k = (ROUTE_BOX - 2 * ROUTE_PAD) / span;
  const at = (p) => [ROUTE_PAD + (p[0] - x0) * k, ROUTE_PAD + (p[1] - z0) * k].map((v) => v.toFixed(1));
  const node = svg('svg', { viewBox: `0 0 ${ROUTE_BOX} ${ROUTE_BOX}`, class: 'results-route', role: 'img', 'aria-label': str('debrief.route') });
  node.append(svg('polyline', { points: route.points.map((p) => at(p).join(',')).join(' '), class: 'results-route-line' }));
  const [sx, sy] = at(route.points[0]);
  const [ex, ey] = at(route.points[route.points.length - 1]);
  node.append(svg('circle', { cx: sx, cy: sy, r: 3.5, class: 'results-route-start' }));
  node.append(svg('circle', { cx: ex, cy: ey, r: 3.5, class: 'results-route-end' }));
  return node;
}


function fillFacts(box, d) {
  if (!d) {
    return;
  }
  if (d.route && d.route.points.length > 1) {
    box.append(routeSvg(d.route));
  }
  const list = el('dl', 'results-facts-list');
  for (const [label, value, tone] of factLines(d)) {
    list.append(el('dt', null, label), el('dd', tone || null, value));
  }
  box.append(list);
}

export const resultsMethods = {
  /*
   * The title's strapline and record line and the OSD's record. Every
   * world is flown free since the race left (the combat-only cut,
   * 2026-10-20), so none has a record and the strapline names the world.
   */
  setBest() {
    if (this.brandSub) {
      this.brandSub.textContent = str('ui.no_gates_2', { worldName: worldOf(this.settings).name });
    }
    this.titleBest.textContent = str('ui.no_gates_no_lap_no_clock');
    this.osdBest.textContent = '';
  },

  /* A settings commit can change what setBest wrote (the strapline's
   * world). writeSettings and pick call this to redraw it. */
  refreshBest() {
    if (this.titleBest) {
      this.setBest();
    }
  },

  /*
   * A room game's results (Catch the Ace's, combat's), rewritten as the
   * others finish.
   * v = { kicker, head, heroCap, heroTime, heroMeta, win, rows: [{ label,
   * time, tag, me, out }] }, all written by the shell. Nothing is posted.
   */
  showRoomResults(v, debrief = null) {
    this.roomResults = true;
    const first = this.screen !== 'results';
    resetScreen(this, Boolean(v.win));
    this.resultsDebrief = debrief;
    fillFacts(this.resultsFacts, debrief);
    this.resultsKicker.textContent = v.kicker;
    this.resultsHead.textContent = v.head;
    this.resultsHeroCap.textContent = v.heroCap;
    this.resultsHeroTime.textContent = v.heroTime;
    this.resultsHeroMeta.textContent = v.heroMeta;
    this.resultsHeroMeta.className = 'results-hero-meta';
    for (const r of v.rows) {
      const cells = [cell('label', r.label), cell('time', r.time)];
      if (r.tag) {
        cells.push(cell('tag', r.tag));
      }
      this.resultsBody.append(resultRow([r.out && 'void', r.me && 'fastest'], cells));
    }
    if (!first) {
      this.renderMenu();
      return;
    }
    replayEntrance(this.screens.results);
    this.show('results');
  },
};
