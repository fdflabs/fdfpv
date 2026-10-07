/*
 * rows.js: the menu's row model. A screen's buildItems returns plain
 * objects, and these make the value rows among them: a pick from a list,
 * an on and off switch, a typed number, a stepper. Each row carries its
 * label and note, what it shows now, and the functions the menu calls when
 * the pilot moves it. They also stamp every row with the id the shell and
 * the checks find it by.
 *
 * Nothing here touches the document, so scripts can build menus in Node.
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

import { cliOf, formatRate } from '../../configs/rates.js';

/*
 * A choice row shows its whole set inline, as segments, only when the set
 * is short in both senses: at most SEGMENT_MAX options and at most
 * SEGMENT_CHARS characters of labels together, which is what fits beside
 * a label at 1280 px (Off/On is 5, Acro/Angle 9, Arcade/Expert 12). Long
 * preset names wrapped to two lines and pushed the title past the fold,
 * which is why the length counts as well as the number. Anything bigger
 * keeps a button that opens a list.
 */
export const SEGMENT_MAX = 4;
export const SEGMENT_CHARS = 24;

/* The one test both the renderer and Enter use, so they always agree on
 * whether a row is a strip of segments or a button. */
export function fitsAsSegments(it) {
  const options = it && it.options;
  if (!options || options.length === 0 || options.length > SEGMENT_MAX) return false;
  let chars = 0;
  for (const o of options) chars += String(o.label || '').length;
  return chars <= SEGMENT_CHARS;
}

/* The neighbour of value in list, dir steps away, wrapping at both ends;
 * a value not in the list counts as the first. Left on the first option
 * lands on the last instead of doing nothing. */
export function cycle(list, value, dir) {
  const at = Math.max(0, list.indexOf(value));
  const n = list.length;
  return list[(((at + dir) % n) + n) % n];
}

/* A label reduced to lower case letters, digits and single hyphens, safe
 * in a DOM id. Labels are prose (apostrophes, degree signs), and a label
 * with nothing left becomes 'row'. */
export function slugify(text) {
  const slug = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'row';
}

/*
 * Gives every row of a freshly built list an id, in place, and returns the
 * list. In place because the drop-down and the typed field keep a hand on
 * the very row objects being stamped. A row that has an id keeps it; the
 * rest are named by action, key, heading or label, under the screen's
 * prefix, and a repeat of a name gets ~2, ~3 after it.
 */
export function stampIds(items, screen) {
  const prefix = screen ? `${screen}:` : '';
  const uses = new Map();
  for (const it of items) {
    if (!it || typeof it !== 'object' || it.id) continue;
    let name;
    if (it.action) name = `a-${it.action}`;
    else if (it.key) name = `k-${it.key}`;
    else if (it.section) name = `s-${slugify(it.label)}`;
    else name = slugify(it.label);
    const count = (uses.get(name) ?? 0) + 1;
    uses.set(name, count);
    it.id = prefix + name + (count > 1 ? `~${count}` : '');
  }
  return items;
}

/*
 * A pick from a list. `format` turns a value into what the pilot reads
 * (String by default); `set` receives the new value. Arrows step through
 * the list with wraparound; a pick from the drop-down or a segment arrives
 * as text and is matched back to the value it stands for.
 */
export function choice(label, note, choices, current, format, set) {
  const show = format || String;
  return {
    label,
    note,
    value: show(current),
    current,
    options: choices.map((value) => ({ value, label: show(value) })),
    pick: (picked) => {
      const match = choices.find((c) => String(c) === String(picked));
      if (match !== undefined) set(match);
    },
    adjust: (dir) => set(cycle(choices, current, dir)),
  };
}

/*
 * An on and off switch, drawn and driven as one bit rather than a list of
 * two: no options, so no drop-down ever opens for it. Right sets it on and
 * Left off (so a held direction on a radio does not make it flicker), and
 * Enter flips it, the one row where Enter changing a value is expected.
 */
export function toggle(label, note, on, set) {
  const current = Boolean(on);
  return {
    label,
    note,
    sw: true,
    on: current,
    value: current ? 'On' : 'Off',
    current,
    adjust: (dir) => set(dir > 0),
    flip: () => set(!current),
  };
}

/*
 * A typed number for a value a pilot has in their head, like 1500 deg/s,
 * which no short list could offer. `spec` (configs/rates.js) knows the
 * firmware bounds, units and display scale; `cli` is the firmware value.
 * An arrow press is one firmware unit, held inside the bounds. Typed text
 * goes through the spec's own conversion, and blank text is no answer.
 */
export function number(label, note, spec, cli, set) {
  const bounded = (v) => Math.min(spec.cliMax, Math.max(spec.cliMin, v));
  return {
    label,
    note,
    num: { spec, cli, text: formatRate(spec, cli), unit: spec.unit },
    adjust: (dir) => set(bounded(cli + dir)),
    typed: (raw) => {
      const text = String(raw).trim();
      return text === '' ? null : cliOf(spec, Number(text));
    },
    set,
  };
}

/* A row whose arrows nudge a value the caller owns and formats. */
export function stepper(label, note, value, adjust) {
  return { label, note, value, adjust, step: true };
}
