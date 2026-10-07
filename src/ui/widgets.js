/*
 * widgets.js: small pieces of the shell's page built in code: the element
 * and button helpers, the key hint, the wordmark, the stick gimbals (on
 * the flight overlay, the calibration screen and the pad card) and the
 * weight slider in flight.
 *
 * Class names here are a contract with index.html's stylesheet, and an
 * awkward one: the page and its scripts are cached for different times,
 * so a returning browser can pair a new stylesheet with an old script for
 * hours. A renamed class would leave that script drawing elements no rule
 * matches, which is why the weight slider still wears .osd-air from the
 * afternoon it scaled drag.
 *
 * Nothing runs at import, so scripts can import the shell in Node.
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

import { DEFAULT_STICK_MODE, stickChannels } from '../input/stickmode.js';
import { str } from '../strings/index.js';

/* An element with an optional class and text; null or undefined text
 * leaves it empty, while '' and 0 are written. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

/* A button that never submits a form by accident. */
export function btn(className, text) {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

/* A hint line: the keys, each in its own kbd, then what they do. */
export function hintWithKeys(keys, text) {
  const keysBox = el('span', 'hint-keys');
  keysBox.append(...keys.map((key) => el('kbd', null, key)));
  const hint = el('div', 'hint');
  hint.append(keysBox, el('span', 'hint-copy', text));
  return hint;
}

/* A plain span with aria-hidden, for marks that only decorate. */
function decoration(className) {
  const node = el('span', className);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/*
 * The name set as the owner's lockup (index.html .lockup-box), which the
 * share card clones whole (scripts/og.js). English in every language: it
 * is the mark, not a sentence. The spaces between the parts keep the
 * heading's text readable as the name. The box sizes itself to the width
 * a screen gives it.
 */
export function wordmark() {
  const name = el('span', 'lockup-name');
  /* The bevel paints the name twice more behind itself, from this. */
  name.dataset.text = 'Drone Combat';
  name.append(el('span', null, 'Drone'), ' ', el('span', null, 'Combat'));
  /* Paraguay's three bands, as the boot screen draws them. */
  const flag = decoration('py-flag');
  flag.append(el('span'), el('span'), el('span'));
  const over = el('span', 'lockup-over');
  over.append(flag, 'Paraguayan');
  const heading = el('h1', 'wordmark lockup');
  heading.append(decoration('lockup-slash'), over, ' ', name, ' ', el('span', 'lockup-under', 'Simulator'));
  const box = el('div', 'lockup-box');
  box.append(heading);
  return box;
}

/* One stick's gimbal: a plate with a cross and a nub, and a caption that
 * names the channels the pilot's stick mode puts on it. */
export function makeGimbal(caption) {
  const plate = el('div', 'osd-gimbal-plate');
  const nub = el('div', 'osd-nub');
  plate.append(el('div', 'osd-cross-x'), el('div', 'osd-cross-y'), nub);
  const cap = el('div', 'osd-gimbal-cap', caption);
  const box = el('div', 'osd-gimbal');
  box.append(plate, cap);
  return { box, nub, cap };
}

/* The card a pad is shown on while it is chosen: a title, two gimbals, a
 * name and a status line. */
export function makePadCard() {
  const left = makeGimbal('');
  const right = makeGimbal('');
  const art = el('div', 'pad-card-art');
  art.append(left.box, right.box);
  const title = el('div', 'pad-card-title', '');
  const name = el('div', 'pad-card-name', '');
  const status = el('div', 'pad-card-status', '');
  const card = el('div', 'pad-card');
  card.append(title, art, name, status);
  return { card, title, name, status, left, right };
}

/* A nub at stick position x, y, each -1 to 1 with up positive. */
export function placeNub(nub, x, y) {
  nub.style.left = `${50 + 50 * x}%`;
  nub.style.top = `${50 - 50 * y}%`;
}

const unit = (v) => Math.min(1, Math.max(-1, v));

/* Both gimbals from one set of channels, in the pilot's stick mode: the
 * throttle stick's vertical is throttle from 0..1 spread to -1..1, the
 * other's is pitch, forward up. One place for the pitch sign. */
export function placeSticks(left, right, ch, mode = DEFAULT_STICK_MODE) {
  const layout = stickChannels(mode);
  for (const [side, gimbal] of [['left', left], ['right', right]]) {
    const axes = layout[side];
    const vertical = axes.vert === 'throttle' ? 2 * ch.throttle - 1 : -ch.pitch;
    placeNub(gimbal.nub, unit(ch[axes.horiz]), unit(vertical));
  }
}

/* What a thumb does on the touch sticks, said for whichever side carries
 * the throttle in this mode: it stays where it is left; the other springs
 * back to centre. */
export function thrNote(mode, side) {
  return stickChannels(mode)[side].vert === 'throttle'
    ? str('ui.throttle_stays_where_you_leave_it')
    : str('ui.forward_is_nose_down_fly_forward');
}

/* The keyboard's four key pairs and what each moves, named for the
 * channel this stick mode puts on it. */
export function keyHowtoRows(mode) {
  const layout = stickChannels(mode);
  const does = {
    throttle: str('ui.throttle_tap_for_a_nudge_hold'),
    pitch: str('ui.pitch_forward_is_stick_forward_nose'),
    yaw: str('ui.yaw_left_and_right_on_the'),
    roll: 'Roll.',
  };
  return [
    [str('ui.w_and_s'), does[layout.left.vert]],
    [str('ui.a_and_d'), does[layout.left.horiz]],
    [str('ui.up_and_down'), does[layout.right.vert]],
    [str('ui.left_and_right'), does[layout.right.horiz]],
  ];
}

/*
 * The weight slider over the flight view, with the card that explains it
 * the first time. A native range input wearing .row-range like the Rates
 * and PIDs screens', so dragging, touch and arrow keys are the browser's.
 * Unlike those it commits live as it moves (the caller listens to
 * 'input'): sim_set_gravity is one store into the plant, so the pilot
 * feels the weight change mid drag, which is the point of having it here.
 */
export function makeWeightSlider({ min, max, step, value, label }) {
  const hint = el('div', 'osd-air-hint');
  hint.hidden = true;
  const dismiss = btn('osd-air-hint-btn', str('ui.got_it'));
  hint.append(
    el('p', 'osd-air-hint-title', str('ui.weight')),
    el('p', 'osd-air-hint-body', str('ui.drag_this_if_the_quad_feels')
      + str('ui.so_it_drops_when_you_chop')
      + str('ui.of_a_jump_left_makes_it')
      + str('ui.down_the_stick_with_it_which')),
    dismiss,
  );
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'row-range osd-air-range';
  Object.assign(range, { min: String(min), max: String(max), step: String(step), value: String(value) });
  range.setAttribute('aria-label', label);
  const row = el('div', 'osd-air-row');
  row.append(el('span', 'osd-air-end', str('ui.floaty')), range, el('span', 'osd-air-end', str('ui.sinky')));
  const cap = el('div', 'osd-air-cap', '');
  const box = el('div', 'osd-air is-off');
  box.append(hint, row, cap);
  return { box, range, cap, hint, dismiss };
}
