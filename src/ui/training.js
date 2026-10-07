/*
 * training.js: the Learn to fly page (docs/TRAINING-DAMAGE-CONTRACT.md,
 * item 18). Its card in Flight Club opens it; it lists the lessons of
 * src/game/training.js by track, in order, each with Fly. Nothing on it is
 * locked: any lesson may be flown first, and no card or aircraft waits on
 * one (training gates nothing).
 *
 * It is a dialog over the title as the campaign pages are
 * (src/ui/opscampaign.js), with their classes, so it needs no style of its
 * own.
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

import { LESSONS, TRACKS } from '../game/training.js';
import { str } from '../strings/index.js';
import { el } from './dom.js';

function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/*
 * ui: the shell's UI; passed(id): whether the pilot has passed lesson id;
 * fly(lesson): what Fly does.
 */
export function createTrainingScreen({ ui, passed, fly }) {
  let isOpen = false;

  function close() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    ui.closeNameDialog(null);
  }

  function lessonCard(l, i) {
    const card = el('div', 'campaign-mission');
    card.dataset.lesson = l.id;
    const done = passed(l.id);
    card.dataset.state = done ? 'passed' : 'open';
    const top = el('div', 'campaign-mission-top');
    top.append(el('span', 'campaign-n', str('training.lesson_n', { n: i + 1 })));
    if (done) {
      top.append(el('span', 'campaign-tag', str('training.passed')));
    }
    card.append(top);
    card.append(el('div', 'campaign-name', str(`training.lesson.${l.id}`)));
    card.append(el('div', 'campaign-line', str(`training.lesson.${l.id}_note`)));
    card.append(button('name-dialog-btn on campaign-play', str('training.fly'), () => {
      close();
      fly(l);
    }));
    return card;
  }

  function draw() {
    const box = el('div', 'name-dialog-box campaign-box training-box');
    box.append(el('h2', null, str('training.card')));
    box.append(el('p', 'lede', str('training.lede')));
    for (const track of TRACKS) {
      box.append(el('h3', 'campaign-eyebrow', str(`training.track.${track}`)));
      const list = el('div', 'campaign-list');
      LESSONS.filter((l) => l.track === track).forEach((l, i) => list.append(lessonCard(l, i)));
      box.append(list);
    }
    const row = el('div', 'name-dialog-row');
    row.append(button('name-dialog-btn', str('campaign.back'), close));
    box.append(row);
    ui.nameDialog.textContent = '';
    ui.nameDialog.append(box);
    ui.nameDialog.hidden = false;
  }

  return {
    open() {
      if (!ui.nameDialog.hidden) {
        return;
      }
      isOpen = true;
      ui.nameWait = null;
      ui.nameKeyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      };
      ui.nameDialog.addEventListener('keydown', ui.nameKeyHandler, true);
      draw();
      const first = ui.nameDialog.querySelector('button.on');
      if (first) {
        first.focus();
      }
    },
    close,
    isOpen: () => isOpen && !ui.nameDialog.hidden,
  };
}
