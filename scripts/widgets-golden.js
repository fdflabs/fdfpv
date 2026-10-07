/*
 * widgets-golden.js: the shell's small built pieces (src/ui/widgets.js)
 * held to a record taken from the functions as they stood inside
 * src/ui/ui.js.
 *
 *     node scripts/widgets-golden.js            compare
 *     node scripts/widgets-golden.js --record   write tests/fixtures/widgets-golden.json
 *
 * WIDGETS_MODULE names another module exporting the same functions, which
 * is how the record was taken from the old code before the move. A small
 * stand-in document records every element as it is built: tag, class,
 * attributes, dataset, style, the properties these pieces set, text and
 * children in order. Each builder's tree is written down, in English and
 * Spanish, and the stick placement across every stick mode.
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'widgets-golden.json');
const RECORD = process.argv.includes('--record');

const PROPS = ['hidden', 'type', 'min', 'max', 'step', 'value'];
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.childNodes = [];
    this.attrs = [];
    this.dataset = {};
    this.style = {};
    this.writes = [];
  }
  append(...nodes) { this.childNodes.push(...nodes); }
  setAttribute(k, v) { this.attrs.push([k, String(v)]); }
  set textContent(t) { this.childNodes = [String(t)]; this.writes.push('textContent'); }
  get textContent() { return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
}
for (const p of PROPS) {
  Object.defineProperty(FakeElement.prototype, p, {
    get() { return this[`_${p}`]; },
    set(v) { this[`_${p}`] = v; this.writes.push(p); },
  });
}
globalThis.document = { createElement: (tag) => new FakeElement(tag) };

function tree(node) {
  if (typeof node === 'string') return node;
  const out = { tag: node.tagName };
  if (node.className) out.cls = node.className;
  if (node.attrs.length) out.attrs = node.attrs;
  if (Object.keys(node.dataset).length) out.dataset = { ...node.dataset };
  if (Object.keys(node.style).length) out.style = { ...node.style };
  for (const p of PROPS) if (node[`_${p}`] !== undefined) out[p] = node[`_${p}`];
  if (node.writes.length) out.writes = node.writes;
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}
const handles = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v instanceof FakeElement ? tree(v) : handles(v)]));

const target = process.env.WIDGETS_MODULE ? pathToFileURL(resolve(process.env.WIDGETS_MODULE)).href : '../src/ui/widgets.js';
const w = await import(target);
const { STICK_MODES } = await import('../src/input/stickmode.js');
const { useLocale } = await import('../src/strings/index.js');

async function snapshot() {
  const out = {};
  out.el = [['div'], ['div', 'a b'], ['span', null, 'text'], ['p', '', ''], ['p', 'x', 0], ['p', 'x', null], ['p', 'x', undefined]]
    .map((args) => tree(w.el(...args)));
  out.btn = [tree(w.btn('go', 'Go')), tree(w.btn(null, null))];
  out.hint = [tree(w.hintWithKeys(['W', 'S'], 'Throttle')), tree(w.hintWithKeys([], ''))];
  out.wordmark = tree(w.wordmark());
  out.gimbal = handles(w.makeGimbal('Throttle / Yaw'));
  out.padCard = handles(w.makePadCard());
  out.slider = handles(w.makeWeightSlider({ min: 60, max: 140, step: 5, value: 100, label: 'Weight' }));
  out.modes = {};
  const channels = [
    { throttle: 0, roll: 0, pitch: 0, yaw: 0 }, { throttle: 1, roll: 1, pitch: 1, yaw: 1 },
    { throttle: 0.25, roll: -0.5, pitch: 0.75, yaw: -2 }, { throttle: 2, roll: 3, pitch: -3, yaw: 0.1 },
  ];
  for (const mode of [...STICK_MODES, undefined]) {
    const placed = channels.map((ch) => {
      const left = w.makeGimbal('');
      const right = w.makeGimbal('');
      w.placeSticks(left, right, ch, mode);
      return [left.nub.style, right.nub.style];
    });
    out.modes[String(mode)] = {
      placed,
      thr: [w.thrNote(mode ?? 2, 'left'), w.thrNote(mode ?? 2, 'right')],
      keys: w.keyHowtoRows(mode ?? 2),
    };
  }
  const nub = w.makeGimbal('').nub;
  out.placeNub = [[0, 0], [1, 1], [-1, -1], [0.5, -0.25]].map(([x, y]) => { w.placeNub(nub, x, y); return { ...nub.style }; });
  return out;
}
const got = { en: await snapshot() };
await useLocale('es');
got.es = await snapshot();
const text = JSON.stringify(got);

if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const lang of ['en', 'es']) {
  for (const k of Object.keys({ ...want[lang], ...got[lang] })) {
    if (JSON.stringify(want[lang][k]) !== JSON.stringify(got[lang][k])) bad.push(`${lang}.${k}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} piece(s) differ: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`ok ${text.length} bytes of built pieces equal to the record`);
