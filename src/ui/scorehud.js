/*
 * scorehud.js: the freestyle score overlay, built on the skate game model.
 *
 * Four readouts, each with one job:
 *
 *   1. The banked total, top left, always there, never going down.
 *   2. Trick names, one row per trick the moment it is recognised, stacking
 *      with the newest at the bottom and leaving on their own.
 *   3. The live combo: points so far, the multiplier, a word for how big it
 *      is, and a bar for the time left to land the next trick.
 *   4. The verdict in the middle of the screen: the combo banks and flies
 *      into the total, or it bails in red and is gone.
 *
 * The verdict is the point. Drawing the combo apart from the total shows
 * the pilot what is at risk before they try one more trick, and a score
 * that can be lost in front of you is what turns a counter into a game.
 *
 * It sits down the left because the flight OSD already owns the top centre
 * (clock), both bottom corners (pack, speed) and the bottom centre (stick
 * ghost). The left column is the one strip that covers nothing a pilot is
 * reading.
 *
 * There is no frame loop here. Everything that moves is a CSS keyframe on a
 * node that takes itself away when it ends, with a timer behind it for when
 * the animation never runs (prefers-reduced-motion). An overlay asking for
 * its own frames would compete with the render loop, and that kind of
 * stutter is the hardest kind to find.
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

import { formatScore } from '../game/score.js';
import { figureIdOfTrick, gradeWordKey } from '../game/figures.js';
import { currentLocale, str } from '../strings/index.js';

/* Six rows is what fits beside the quad at 720p without reaching the pack
 * readout. A longer chain loses its oldest names, not its count: the combo
 * line still carries every point. */
const MAX_ROWS = 6;

/* How long each kind of node lives if its animation never reports an end.
 * The name row's 2600 is the 2.2 s keyframe in index.html plus slack. */
const LIFE_MS = { row: 2600, burst: 900, ring: 1200 };

/*
 * Words for the multiplier, highest threshold first. A number does not tell
 * a pilot they are into something worth protecting; a word shouted at them
 * does. The Japanese is the word a person in the town would actually say,
 * because the score was the one thing on screen not speaking the place's
 * language.
 */
const TIER_WORDS = [
  { at: 5, key: 'scorehud.tier_perfect', jp: '最高' },
  { at: 4, key: 'scorehud.tier_wild', jp: 'やばい' },
  { at: 3, key: 'scorehud.tier_sweet', jp: 'すごい' },
  { at: 2, key: 'scorehud.tier_nice', jp: 'いいね' },
];

const tierWord = (mult) => TIER_WORDS.find((w) => mult >= w.at) ?? null;

/* The speed lines down the frame start a tier later than the badge: a
 * doubled combo earns a word but not the whole screen. */
const SPEED_LINES_FROM = 3;

/* How a trick row looks by execution. Anything unlisted is drawn plain,
 * with its execution written beside it. */
const EXECUTION_LOOK = {
  CLEAN: { cls: null, ink: 'var(--cream)' },
  SLOPPY: { cls: 'is-sloppy', ink: 'var(--amber)' },
  BUMP: { cls: 'is-bump', ink: '#ff7d96' },
};
const PLAIN_LOOK = { cls: null, ink: 'var(--cream)' };

/* A trick's name as the pilot reads it: an aerobatic figure's in the
 * pilot's language (it travels as fig:<id>), anything else as named. */
export function trickTitle(name) {
  const id = figureIdOfTrick(name);
  return id ? str(`aerobatic.${id}`) : name;
}

/* The judge's grade and its word, "SHARP 8.5" ("FINO 8,5"). */
export function gradeText(grade) {
  return str('aerobatic.grade_of', { word: str(gradeWordKey(grade)), grade: grade.toLocaleString(currentLocale()) });
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/*
 * Puts child under parent until its own animation ends or ms pass,
 * whichever is first. Only the child's own: animationend bubbles, and a
 * name row used to leave with its 480 ms burst, half a second on screen
 * for a 2.2 s keyframe, too quick to read a figure's name and grade.
 */
function fleeting(parent, child, ms) {
  parent.append(child);
  const leave = () => {
    if (child.parentNode === parent) parent.removeChild(child);
  };
  child.addEventListener('animationend', (e) => {
    if (e.target === child) leave();
  });
  setTimeout(leave, ms);
}

/* Restarts a CSS animation on a node that may be mid way through one. The
 * offsetWidth read forces the style flush between the two writes. */
function replay(n, before, after) {
  before();
  void n.offsetWidth;
  after();
}

export class ScoreHud {
  constructor(root) {
    this.el = node('div', 'score-hud is-off');

    const total = node('div', 'score-total');
    /* The recogniser still misnames some shapes, and a pilot told their
     * Split-S was a Half Matty learns the wrong thing. The overlay admits
     * it next to the label, the one place the pilot keeps looking, as a
     * qualifier on the number rather than a banner over the town. There is
     * no clock here: the OSD's top centre already counts the run down. */
    const label = node('div', 'score-label', str('ui.score'));
    label.append(node('span', 'score-beta', str('scorehud.in_development')));
    this.totalText = node('div', 'score-value score-cut', '0');
    total.append(label, this.totalText);

    this.rows = node('div', 'score-names');

    this.combo = node('div', 'score-combo is-off');
    const line = node('div', 'score-combo-line score-cut');
    this.pointsText = node('span', 'score-combo-points', '0');
    this.multText = node('span', 'score-combo-mult', '');
    this.badge = node('span', 'score-tier');
    this.badge.hidden = true;
    this.badgeEn = node('span', 'score-tier-en');
    this.badgeJp = node('span', 'score-tier-jp');
    this.badge.append(this.badgeEn, this.badgeJp);
    line.append(this.pointsText, this.multText, this.badge);
    const track = node('div', 'score-combo-bar');
    /* Scaled, not resized: a width change would lay the overlay out again
     * on every frame. */
    this.fill = node('div', 'score-combo-fill');
    track.append(this.fill);
    this.combo.append(line, track);

    this.verdict = node('div', 'score-verdict score-cut');

    /* First, so the lines are behind every number. */
    const speedLines = node('div', 'score-lines');

    this.el.append(speedLines, total, this.rows, this.combo, this.verdict);
    root.append(this.el);

    this.visible = false;
    this.calloutsOnly = false;
    /* What the screen currently says, so a frame that changes nothing
     * writes nothing. null means "not on screen, write the next value". */
    this.drawn = { total: null, points: null, mult: null, tier: null };
  }

  /* Callouts without the score: the names, the chain and its verdict, no
   * total (a zero that never moves reads as a fault). */
  setCalloutsOnly(on) {
    if (on === this.calloutsOnly) return;
    this.calloutsOnly = on;
    this.paintFrame();
  }

  setVisible(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.paintFrame();
    if (!on) this.clearLive();
  }

  /*
   * The root's class: visibility, plus the speed lines for the multiplier
   * last drawn. Repainted when visibility or the tier changes, not when a
   * combo merely ends, so the lines of a banked combo stay until the next
   * one starts or the screen changes.
   */
  paintFrame() {
    const word = this.drawn.mult === null ? null : tierWord(this.drawn.mult);
    let cls = 'score-hud';
    if (word && word.at >= SPEED_LINES_FROM) cls += ` tier-${word.at}`;
    if (this.calloutsOnly) cls += ' is-callouts';
    if (!this.visible) cls += ' is-off';
    this.el.className = cls;
  }

  /* Everything but the total goes: names, combo, verdict, tier. For a map
   * change and for leaving the flight screen. */
  clearLive() {
    this.rows.textContent = '';
    this.combo.className = 'score-combo is-off';
    this.verdict.className = 'score-verdict score-cut';
    this.verdict.textContent = '';
    this.badge.hidden = true;
    this.drawn.points = null;
    this.drawn.mult = null;
    this.drawn.tier = null;
    if (this.visible) this.paintFrame();
  }

  reset() {
    this.clearLive();
    this.totalText.textContent = '0';
    this.drawn.total = 0;
  }

  /* Each frame, with the scorer's view(). Writes are skipped when the text
   * would not change, because even a same value textContent write costs a
   * style invalidation at frame rate. */
  update(view) {
    if (!view) return;
    const d = this.drawn;
    if (view.total !== d.total) {
      d.total = view.total;
      this.totalText.textContent = formatScore(view.total);
    }
    const live = view.combo;
    if (!live) {
      this.combo.className = 'score-combo is-off';
      d.points = null;
      d.mult = null;
      return;
    }
    if (live.points !== d.points) {
      d.points = live.points;
      this.pointsText.textContent = formatScore(live.points);
    }
    let comboCls = 'score-combo';
    if (live.mult !== d.mult) {
      d.mult = live.mult;
      this.multText.textContent = live.mult > 1 ? ` x ${live.mult}` : '';
      const word = tierWord(live.mult);
      const tier = word ? word.at : 0;
      if (tier !== d.tier) {
        d.tier = tier;
        /* The tier colour on the combo line is set only on the frame the
         * tier changes; the next frame puts the plain class back. */
        if (word) comboCls += ` tier-${tier}`;
        this.showBadge(word);
        if (this.visible) this.paintFrame();
      }
    }
    if (this.combo.className !== comboCls) this.combo.className = comboCls;
    this.fill.style.transform = `scaleX(${live.remain})`;
  }

  showBadge(word) {
    this.badge.hidden = !word;
    if (!word) return;
    this.badgeEn.textContent = str(word.key);
    this.badgeJp.textContent = word.jp;
    replay(this.badge, () => { this.badge.style.animation = 'none'; }, () => { this.badge.style.animation = ''; });
  }

  /* The scorer's drained events for this frame, usually none or one. */
  events(list) {
    if (!list) return;
    for (const e of list) {
      if (e.kind === 'trick') {
        this.addRow(e);
      } else if (e.kind === 'bank') {
        this.announce(`+${formatScore(e.points)}`, 'is-bank');
      } else if (e.kind === 'bail') {
        const text = e.points > 0 ? str('scorehud.bailed', { formatScore: formatScore(e.points) }) : 'Bailed';
        this.announce(text, 'is-bail');
        this.rows.textContent = '';
      }
    }
  }

  /*
   * One trick row. Execution is a colour, not a second line, and the number
   * is what the trick was worth after every penalty, so a pilot repeating a
   * trick watches its value shrink. The burst behind the name goes in the
   * row first, so it moves with the row and the text paints over it.
   */
  addRow({ name, points, execution, grade }) {
    /* A judged figure (fixed wing) is bigger and says its grade, the way
     * a skate game shouts how the trick was landed. */
    const judged = typeof grade === 'number';
    const look = EXECUTION_LOOK[judged && grade < 6 ? 'SLOPPY' : execution] ?? PLAIN_LOOK;
    const row = node('div', 'score-name score-cut');
    if (look.cls) row.classList.add(look.cls);
    if (judged) row.classList.add('is-figure');
    const burst = node('div', 'score-burst');
    burst.style.setProperty('--burst', look.ink);
    fleeting(row, burst, LIFE_MS.burst);
    row.append(node('span', 'score-name-text', trickTitle(name)), node('span', 'score-name-points', formatScore(points)));
    if (judged) row.append(node('span', 'score-name-tag is-grade', gradeText(grade)));
    else if (execution !== 'CLEAN') row.append(node('span', 'score-name-tag', execution.toLowerCase()));
    fleeting(this.rows, row, LIFE_MS.row);
    while (this.rows.childElementCount > MAX_ROWS) this.rows.removeChild(this.rows.firstChild);
  }

  /*
   * The verdict text, and two rings out from it about a tenth of a second
   * apart (the delay is in the CSS): one ring reads as a circle, two read
   * as an impact. A bail's rings are red.
   */
  announce(text, cls) {
    this.verdict.textContent = text;
    replay(
      this.verdict,
      () => { this.verdict.className = 'score-verdict score-cut'; },
      () => { this.verdict.className = `score-verdict score-cut is-on ${cls}`; },
    );
    const ringCls = cls === 'is-bail' ? 'score-ring is-bail' : 'score-ring';
    fleeting(this.el, node('div', ringCls), LIFE_MS.ring);
    fleeting(this.el, node('div', `${ringCls} is-late`), LIFE_MS.ring);
  }

  dispose() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}
