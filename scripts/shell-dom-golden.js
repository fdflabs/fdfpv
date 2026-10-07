/*
 * shell-dom-golden.js: the page the Ui builds once, from its constructor,
 * recorded node for node, so that build() can be reshaped and shown to
 * build exactly what it built.
 *
 *     node scripts/shell-dom-golden.js            compare with tests/shell-dom-golden/
 *     node scripts/shell-dom-golden.js --record   write tests/shell-dom-golden/ afresh
 *
 * Three things are recorded for each fixture, because each catches a
 * mistake the other two cannot see:
 *   first   the tree under #ui at the moment the constructor's build()
 *           returns, caught synchronously before anything else draws. Tag,
 *           attributes, text, child order, and on every node the event
 *           types listened for, ranked by the order they were attached.
 *   again   the same tree from a second build() run after boot, so the
 *           page main.js has finished with is what build() starts from.
 *   fields  every field build() writes on the Ui, read after it returns:
 *           where in the tree each node field points, and the value of
 *           every other field. A rewrite that puts two look-alike nodes
 *           (the two osd-best lines, the six calibrate buttons) on the
 *           wrong fields draws the same tree and fails here.
 * Listeners build() adds on window and document are recorded with the
 * second build, in order, as are nodes given a listener but never put in
 * the tree.
 *
 * Nothing here waits on a timer or the network: both trees are taken in
 * the same task as the build that made them, so no fetch, board or clock
 * can reach them. The one thing that differs between runs is the test
 * server's port, inside the credits' absolute image addresses, so the
 * page's origin is written as <origin>.
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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'tests', 'shell-dom-golden');
const RECORD = process.argv.includes('--record');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* What build() reads that changes what it draws: the language (every
 * string), touch points (the How to fly tab row), mouse flight (which tab
 * How to fly opens on) and a stored profile against none. */
const FIXTURES = [
  { name: 'first-visit', profile: null, lang: 'en' },
  { name: 'returning-es', profile: { airframeAsked: true }, lang: 'es' },
  { name: 'touch', profile: { airframeAsked: true }, lang: 'en', touch: true },
  { name: 'mouse-plane', profile: { airframeAsked: true, mouseFlight: true, airframe: 'cub' }, lang: 'en' },
];

/*
 * Runs before the app. Every addEventListener call is noted against its
 * target with a global sequence number, so the order listeners were
 * attached in, across nodes, can be ranked later. The first tree is taken
 * when the constructor adds its track sync listener on window, the line
 * after build() returns; buildmode.js adds one too, so it is taken only
 * once #ui holds the overlay build() makes first.
 */
const SEED = `(() => {
  const SYNC = 'webfpv-tracks-sync';
  const lists = new WeakMap();
  const g = { lists, n: 0, first: null, watch: null };
  window.__domGolden = g;
  const add = EventTarget.prototype.addEventListener;
  const describe = (n) => n.nodeName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : '');
  g.snapshot = (top, since) => {
    const ranks = [];
    const walk = (n) => {
      if (n.nodeType === 3) { return { t: n.data }; }
      if (n.nodeType === 8) { return { c: n.data }; }
      if (n.nodeType !== 1) { return { other: n.nodeType }; }
      const out = { tag: n.nodeName.toLowerCase() };
      const attrs = Array.from(n.attributes).map((a) => [a.name, a.value.split(location.origin).join('<origin>')]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (attrs.length) { out.attrs = attrs; }
      if ('value' in n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.nodeName)) { out.value = n.value; }
      const on = (lists.get(n) || []).filter(([k]) => k >= since);
      if (on.length) { out.on = on; for (const [k] of on) { ranks.push(k); } }
      if (n.childNodes.length) { out.kids = Array.from(n.childNodes).map(walk); }
      return out;
    };
    const tree = walk(top);
    ranks.sort((a, b) => a - b);
    const rank = new Map(ranks.map((k, i) => [k, i]));
    const relabel = (o) => {
      if (o.on) { o.on = o.on.map(([k, t]) => [rank.get(k), t]); }
      if (o.kids) { o.kids.forEach(relabel); }
    };
    relabel(tree);
    return tree;
  };
  g.describe = describe;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    let l = lists.get(this);
    if (!l) { l = []; lists.set(this, l); }
    const k = g.n;
    g.n += 1;
    l.push([k, capture ? type + '/capture' : type]);
    if (g.watch) { g.watch.push([k, this]); }
    if (this === window && type === SYNC && !g.first) {
      const r = document.getElementById('ui');
      if (r && r.querySelector('.osd')) { g.first = JSON.stringify(g.snapshot(r, 0)); }
    }
    return add.call(this, type, fn, opts);
  };
})();`;

/*
 * The second build, in one evaluate so nothing else runs between it and
 * the tree. this is a proxy over the Ui that notes every field written,
 * through build() and the methods it calls, so fields lists what build()
 * leaves on the Ui and not what main.js put there before it.
 */
const AGAIN = `(() => {
  const ui = window.__ui;
  const g = window.__domGolden;
  const r = ui.root;
  const written = new Set();
  const proxy = new Proxy(ui, {
    set(t, k, v) { written.add(k); return Reflect.set(t, k, v); },
  });
  const since = g.n;
  g.watch = [];
  ui.build.call(proxy);
  const watched = g.watch;
  g.watch = null;
  const tree = g.snapshot(r, since);
  const pathOf = (n) => {
    const steps = [];
    let at = n;
    while (at && at !== r) {
      const up = at.parentNode;
      if (!up) { return 'detached ' + g.describe(at) + (steps.length ? ' > ' + steps.reverse().join('.') : ''); }
      steps.push(Array.prototype.indexOf.call(up.childNodes, at));
      at = up;
    }
    return '#ui' + (steps.length ? '.' + steps.reverse().join('.') : '');
  };
  const isNode = (v) => v && typeof v === 'object' && typeof v.nodeType === 'number';
  const value = (v, depth) => {
    if (isNode(v)) { return { node: pathOf(v) }; }
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function') { return 'function'; }
      if (typeof v === 'number' && !Number.isFinite(v)) { return String(v); }
      return v === undefined ? 'undefined' : v;
    }
    if (v instanceof Map) { return { map: Array.from(v.entries()).map(([a, b]) => [String(a), depth < 2 ? value(b, depth + 1) : '<deep>']) }; }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
      return { instance: v.constructor && v.constructor.name };
    }
    if (depth >= 2) { return '<deep>'; }
    if (Array.isArray(v)) { return v.map((x) => value(x, depth + 1)); }
    return { keys: Object.keys(v).map((k) => [k, value(v[k], depth + 1)]) };
  };
  const fields = {};
  for (const k of Array.from(written).map(String).sort()) { fields[k] = value(ui[k], 0); }
  const outside = [];
  for (const [k, t] of watched) {
    if (t === window || t === document) { outside.push([t === window ? 'window' : 'document', (g.lists.get(t).find(([n]) => n === k) || [])[1]]); continue; }
    if (isNode(t) && !r.contains(t)) { outside.push([pathOf(t), (g.lists.get(t).find(([n]) => n === k) || [])[1]]); }
  }
  return JSON.stringify({ again: tree, fields, outside });
})()`;

function seedFor(fx) {
  const lines = [SEED];
  if (fx.profile) {
    lines.push(`try { localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(fx.profile))}); } catch (e) { /* storage refused */ }`);
  }
  return lines;
}

let failed = 0;
for (const fx of FIXTURES) {
  if (ONLY.length && !ONLY.includes(fx.name)) {
    continue;
  }
  const page = await openPage({ root, width: 1600, height: 900, url: `/index.html?lang=${fx.lang}`, seed: seedFor(fx), touch: Boolean(fx.touch) });
  let got;
  try {
    await page.until('window.__shellReady === true', 300000);
    const first = await page.evaluate('window.__domGolden.first');
    if (!first) {
      throw new Error(`${fx.name}: the first build was never caught`);
    }
    got = { first: JSON.parse(first), ...JSON.parse(await page.evaluate(AGAIN)) };
  } finally {
    await page.close();
  }
  const file = join(OUT, `${fx.name}.json`);
  const text = `${JSON.stringify(got, null, 1)}\n`;
  if (RECORD) {
    await mkdir(OUT, { recursive: true });
    await writeFile(file, text);
    console.log(`  wrote ${fx.name}: ${Object.keys(got.fields).length} fields`);
    continue;
  }
  if (!existsSync(file)) {
    console.log(`  FAIL  ${fx.name}: no golden at ${file}; record one on the old code`);
    failed += 1;
    continue;
  }
  const want = JSON.parse(await readFile(file, 'utf8'));
  const diffs = [];
  for (const part of ['first', 'again', 'outside']) {
    if (JSON.stringify(want[part]) !== JSON.stringify(got[part])) {
      diffs.push(part);
    }
  }
  for (const k of new Set([...Object.keys(want.fields), ...Object.keys(got.fields)])) {
    if (JSON.stringify(want.fields[k]) !== JSON.stringify(got.fields[k])) {
      diffs.push(`fields.${k}`);
    }
  }
  if (diffs.length) {
    failed += 1;
    const dump = join(process.env.TMPDIR || '/tmp', `shell-dom-golden-${fx.name}.json`);
    await writeFile(dump, text);
    console.log(`  FAIL  ${fx.name}: ${diffs.length} part(s) differ: ${diffs.slice(0, 12).join(', ')} (got: ${dump})`);
  } else {
    console.log(`  pass  ${fx.name}: tree, rebuild and ${Object.keys(got.fields).length} fields identical`);
  }
}
console.log(failed ? `\nFAIL, ${failed} fixture(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
