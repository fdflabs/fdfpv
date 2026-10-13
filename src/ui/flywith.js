/*
 * flywith.js: "What will you fly with?", the one question a new pilot
 * meets before any card (docs/redesign/TRAINING.md section 2, PLAN
 * decision 19). Four answers in the owner's order of support, the device
 * plugged in already lit, and each routed: a radio to the calibration
 * wizard, the rest to How to fly on their own tab. Skippable, and never
 * asked again once answered.
 *
 * The answer is kept under its own key, not in the settings, because the
 * settings existing is what says a visit is not the first (settings.js
 * detectFirstRun), and because the device in a pilot's hands belongs to
 * this browser, not to the account.
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

import { touchWanted } from '../input/touchsticks.js';
import { str } from '../strings/index.js';

export const FLY_WITH_KEY = 'fdfpv.flywith.v1';
export const FLY_WITH_PREFIX = 'flywith:';

/* The answers, and the How to fly tab each one opens. A radio opens the
 * wizard instead whenever one is plugged in. */
const HOWTO_TAB = { radio: 'radio', gamepad: 'radio', keys: 'keyboard', touch: 'touch' };
const ANSWERS = [...Object.keys(HOWTO_TAB), 'skip'];

/* Storage that throws reads as answered: a pilot who cannot keep the
 * answer must not be asked on every visit. */
export function flyWithAnswer() {
  try {
    return localStorage.getItem(FLY_WITH_KEY);
  } catch (e) {
    return 'skip';
  }
}

function storeAnswer(answer) {
  try {
    localStorage.setItem(FLY_WITH_KEY, answer);
  } catch (e) {
    /* Asked again next visit, which is the honest outcome. */
  }
}

/* Asked on a first visit only, and only until answered. */
export function flyWithPending(ui) {
  return Boolean(ui.firstRun) && !ui.flyWithAnswered && flyWithAnswer() === null;
}

/* The answer the device in the pilot's hands stands for: what is plugged
 * in (input.js padSummary), else thumbs on a touch screen, else keys. */
export function litAnswer(info) {
  if (info && info.device) {
    return info.device;
  }
  return touchWanted() ? 'touch' : 'keys';
}

export function flyWithRows(ui) {
  const lit = litAnswer(ui.padInfo);
  const shown = ANSWERS.filter((id) => id !== 'touch' || touchWanted());
  const plugged = Boolean(ui.padInfo && ui.padInfo.device);
  return shown.map((id) => ({
    label: str(`flywith.${id}`),
    value: plugged && id === lit ? str('flywith.plugged_in') : '',
    note: str(`flywith.${id}_note`),
    action: `${FLY_WITH_PREFIX}${id}`,
    primary: id === lit,
  }));
}

/* The cursor on the lit answer, on arrival and whenever what is plugged
 * in changes: plugging a device in is the pilot's answer. */
export function cursorOnLit(ui) {
  const items = ui.items();
  const at = items.findIndex((it) => it.primary);
  if (at < 0) {
    return;
  }
  /* Both halves of the cursor, or a rebuild puts it back by id. */
  ui.cursor = at;
  ui.focusId = items[at].id;
}

/*
 * An answer pressed. The title comes first, so the wizard and How to fly
 * both open over it and Back from either lands there, as from any card.
 */
export function answerFlyWith(ui, action, answer) {
  if (!ANSWERS.includes(answer)) {
    return;
  }
  storeAnswer(answer);
  ui.flyWithAnswered = true;
  ui.show('title');
  if (answer === 'skip') {
    return;
  }
  if (answer === 'radio' && ui.padInfo && ui.padInfo.device) {
    ui.act('calibrate');
    return;
  }
  ui.howtoSource = HOWTO_TAB[answer];
  ui.act('howto');
}
