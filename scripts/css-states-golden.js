/*
 * css-states-golden.js: what index.html's stylesheet makes of the states no
 * menu screen shows, recorded so those rules can be rewritten too.
 *
 *     npm run css:states                          compare with tests/css-states/
 *     node scripts/css-states-golden.js --record  write tests/css-states/ afresh
 *     node scripts/css-states-golden.js desk      one window
 *     ... --sheet=<file>                          another file's <style> instead
 *                                                 of index.html's (a mutation)
 *     ... --coverage                              which of the sheet's selectors
 *                                                 css:golden and this check reach
 *
 * css:golden (scripts/css-golden.js) records every menu screen, and a
 * large part of the sheet styles things no menu screen has: the flight
 * overlay's states, the score overlay, the hangar, the loader's failure
 * panel, results with laps in them. Those are pinned here from fixtures:
 * tests/css-states/fixtures/*.html, each the markup the real builders in
 * src/ make for one state, captured from the running shell and pruned to
 * the parts that state is about (with their ancestors up to #ui, so every
 * descendant selector still reaches them). A fixture's first comment
 * after its header, `<!-- state: {"ui": "...", "body": "..."} -->`, gives
 * the classes #ui and body wear in that state; `"outside": true` puts
 * the markup after #ui instead of in it (the loader, #pdcs-loader).
 *
 * The page is tests/css-states/page.html, no script of the app's on it:
 * index.html's own <style>, read from the file each run so this always
 * tests the sheet as it is now, and one fixture at a time inside #ui.
 * Every rendered element is hashed the way css:golden hashes it: its full
 * computed style with property names sorted and the custom properties
 * left out except the ones script reads or writes (SCRIPT_TOKENS, the same
 * list as css:golden's on branch u-ui-css-golden2), ::before and ::after,
 * and the declared transition and animation longhands, read before an
 * injected sheet switches motion off for the snapshot. A snapshot is
 * retaken until two agree.
 *
 * Every fixture is drawn at each window of css:golden's, and the run fails
 * unless every @media condition in the sheet holds in one window and fails
 * in another; one more run at the desk emulates reduced motion. At the
 * desk and the phone, every :hover, :focus, :focus-visible and
 * :focus-within rule with an element in the fixture is driven on its
 * first visible match, as css:golden does on the menu screens.
 *
 * The committed record is one digest per fixture state and window; each
 * run writes the per-element form to CSS_STATES_DETAIL (default
 * $TMPDIR/css-states-detail), so two runs can be diffed to find the
 * element. Any difference is a stylesheet change (or a fixture change):
 * fix the rule, or re-record on purpose with the reason in the commit.
 *
 * --coverage reads css:golden's per-element output (CSS_GOLDEN_DETAIL,
 * default $TMPDIR/css-golden-detail, from a css:golden run), rebuilds each
 * of its states as a skeleton of tags, ids and classes, and counts the
 * sheet's selectors (each part of a selector list, with state pseudo
 * classes and pseudo elements taken off) that match an element there, in
 * a fixture here, or in neither. css:golden's count is a floor: the
 * skeleton has no attributes, and an element a rule hides is not in
 * css:golden's output at all. The rules css:golden pins by their text
 * (map-reel, ::placeholder and the like) count as its. The lists go to
 * $TMPDIR/css-states-coverage.json.
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

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HERE = join(root, 'tests', 'css-states');
const FIXTURES = join(HERE, 'fixtures');
const RECORD = process.argv.includes('--record');
const COVERAGE = process.argv.includes('--coverage');
const SHEET_ARG = process.argv.find((a) => a.startsWith('--sheet='));
const SHEET_FILE = SHEET_ARG ? SHEET_ARG.slice('--sheet='.length) : join(root, 'index.html');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TMP = process.env.TMPDIR || '/tmp';
const DETAIL = process.env.CSS_STATES_DETAIL || join(TMP, 'css-states-detail');
const GOLDEN_DETAIL = process.env.CSS_GOLDEN_DETAIL || join(TMP, 'css-golden-detail');

/* css:golden's windows, so the two checks agree on what each @media
 * condition is tested at. `states` drives the :hover and :focus rules. */
const WINDOWS = {
  desk: { width: 1600, height: 900, states: true },
  tall: { width: 1600, height: 1000 },
  laptop: { width: 1280, height: 720 },
  narrow: { width: 860, height: 700 },
  short: { width: 1024, height: 500 },
  phone: { width: 390, height: 844, touch: true, states: true },
  phoneWide: { width: 844, height: 390, touch: true },
  still: { width: 1600, height: 900, reducedMotion: true },
};

/* Custom properties script reads (getPropertyValue) or writes
 * (style.setProperty), from a grep of src/: the only tokens that are
 * contract. Copied from css:golden on branch u-ui-css-golden2; keep the
 * two lists the same. */
const SCRIPT_TOKENS = ['--ui-font', '--bar-top', '--bar-bot', '--i', '--swatch', '--burst', '--frac', '--px', '--py', '--poster'];

const STILL_ID = 'css-states-still';
const SHEET_ID = 'css-states-sheet';
const SETTLE = `function settle() {
  if (!document.getElementById('${STILL_ID}')) {
    const st = document.createElement('style');
    st.id = '${STILL_ID}';
    st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.append(st);
  }
  document.body.offsetHeight;
}
function unsettle() {
  const st = document.getElementById('${STILL_ID}');
  if (st) { st.remove(); }
}`;

/* The snapshot, evaluated in the page: { path: [self, before, after,
 * motion] } for every rendered element under rootExpr, each a hash. */
const SNAP = (rootExpr) => `(() => {
  ${SETTLE}
  const hash = (s) => {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
      b ^= b >>> 13;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  };
  const SCRIPT_TOKENS = new Set(${JSON.stringify(SCRIPT_TOKENS)});
  const styleText = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && cs.content === 'none') { return 'none'; }
    const parts = [];
    for (let i = 0; i < cs.length; i += 1) {
      const p = cs[i];
      if (p.startsWith('--') && !SCRIPT_TOKENS.has(p)) { continue; }
      parts.push(p + ':' + cs.getPropertyValue(p));
    }
    /* The server picks a port each run, and a url() is absolute. */
    return parts.sort().join(';').split(location.origin).join('<origin>');
  };
  const pathOf = (el) => {
    const bits = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; }
      if (n.classList.length) { s += '.' + Array.from(n.classList).join('.'); }
      const p = n.parentElement;
      if (p) { s += ':' + Array.from(p.children).indexOf(n); }
      bits.unshift(s);
    }
    return bits.join('>');
  };
  const MOTION = /^(transition|animation)-/;
  const motionOf = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && cs.content === 'none') { return ''; }
    const parts = [];
    for (let i = 0; i < cs.length; i += 1) {
      if (MOTION.test(cs[i])) { parts.push(cs[i] + ':' + cs.getPropertyValue(cs[i])); }
    }
    return parts.sort().join(';');
  };
  const top = ${rootExpr};
  const skip = (el) => el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || (el !== document.documentElement && el.getClientRects().length === 0);
  unsettle();
  const motion = new Map();
  const walkMotion = (el) => {
    if (skip(el)) { return; }
    motion.set(el, motionOf(el, null) + '|' + motionOf(el, '::before') + '|' + motionOf(el, '::after'));
    for (const c of el.children) { walkMotion(c); }
  };
  walkMotion(top);
  settle();
  const out = {};
  const walk = (el) => {
    if (skip(el)) { return; }
    out[pathOf(el)] = [hash(styleText(el, null)), hash(styleText(el, '::before')), hash(styleText(el, '::after')), hash(motion.get(el) || '')];
    for (const c of el.children) { walk(c); }
  };
  walk(top);
  return out;
})()`;
const SNAPSHOT = SNAP('document.documentElement');
/* What an interaction can restyle: the target's parent and everything
 * under it. */
const SNAP_TARGET = SNAP('(window.__cssTarget.parentElement || window.__cssTarget)');

const SHEET_NODE = `Array.from(document.styleSheets).find((s) => s.ownerNode && s.ownerNode.id === '${SHEET_ID}')`;

/* The @media conditions and whether each holds in this window. */
const MEDIA = `(() => {
  const media = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.media) { media.push(r.media.mediaText); }
      if (r.cssRules) { walk(r.cssRules); }
    }
  };
  walk(${SHEET_NODE}.cssRules);
  const out = {};
  for (const m of [...new Set(media)].sort()) { out[m] = matchMedia(m).matches; }
  return out;
})()`;

/* The interactive rules' targets in the fixture: for each rule whose
 * selector holds :hover, :focus, :focus-visible or :focus-within, the
 * selector with those removed, and its first visible match. As
 * css:golden's TARGETS. */
const TARGETS = `(() => {
  const PSEUDO = /:(hover|focus-visible|focus-within|focus|active)\\b/g;
  const wanted = new Map();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules && !r.selectorText) { if (!r.media || matchMedia(r.media.mediaText).matches) { walk(r.cssRules); } continue; }
      if (!r.selectorText) { continue; }
      for (const part of r.selectorText.split(',')) {
        const m = part.match(PSEUDO);
        if (!m) { continue; }
        const kind = m.some((x) => x === ':hover') ? 'hover' : m.some((x) => x === ':focus-within') ? 'focus-within' : 'focus';
        const base = part.slice(0, part.search(PSEUDO)).replace(PSEUDO, '').trim();
        if (!base || /::/.test(base)) { continue; }
        wanted.set(kind + '|' + base, { kind, base });
      }
    }
  };
  walk(${SHEET_NODE}.cssRules);
  const out = [];
  window.__cssTargets = [];
  for (const { kind, base } of [...wanted.values()].sort((a, b) => (a.kind + a.base < b.kind + b.base ? -1 : 1))) {
    let list;
    try { list = document.querySelectorAll(base); } catch (e) { continue; }
    const el = Array.from(list).find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(n).visibility !== 'hidden';
    });
    if (!el) { continue; }
    window.__cssTargets.push(el);
    out.push({ i: window.__cssTargets.length - 1, kind, base });
  }
  return out;
})()`;

/* Keyboard focus on the target, or for :focus-within the first focusable
 * thing in it. A target nothing in can take focus is skipped. */
const FOCUS_TARGET = `(() => {
  const el = window.__cssTarget;
  const inner = el.matches('a, button, input, select, textarea, [tabindex]') ? el : el.querySelector('a, button, input, select, textarea, [tabindex]');
  if (!inner) { return false; }
  inner.focus({ focusVisible: true, preventScroll: true });
  return document.activeElement === inner;
})()`;

/* The sheet's selectors, each part of a selector list once, with the
 * state pseudo classes and the pseudo elements off so the element a part
 * styles can be looked for. */
const SELECTORS = `(() => {
  const out = new Set();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.selectorText) {
        for (const part of r.selectorText.split(/,(?![^(]*\\))/)) { out.add(part.trim()); }
      }
      if (r.cssRules) { walk(r.cssRules); }
    }
  };
  walk(${SHEET_NODE}.cssRules);
  return [...out].sort();
})()`;
const BARE = (part) => part
  .replace(/::?(before|after|placeholder|selection|marker|backdrop|-webkit-[a-z-]+|-moz-[a-z-]+)\b/g, '')
  .replace(/:(hover|focus-visible|focus-within|focus|active)\b/g, '')
  .trim() || '*';

/* Which of `parts` match something on the page now. */
const MATCHING = (parts) => `(() => {
  const bare = ${BARE.toString()};
  return ${JSON.stringify(parts)}.filter((p) => {
    try { return document.querySelector(bare(p)) !== null; } catch (e) { return false; }
  });
})()`;

async function steady(page, expr) {
  let last = JSON.stringify(await page.evaluate(expr));
  for (let i = 0; i < 8; i += 1) {
    await page.sleep(60);
    const now = JSON.stringify(await page.evaluate(expr));
    if (now === last) {
      return JSON.parse(now);
    }
    last = now;
  }
  throw new Error('the page did not settle in 8 snapshots');
}

async function hoverTarget(page) {
  const at = await page.evaluate(`(() => {
    const r = window.__cssTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    return [x, y];
  })()`);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0], y: at[1] }, page.sessionId);
  await page.sleep(30);
}

async function unhover(page) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, page.sessionId);
  await page.sleep(30);
}

/* index.html's <style> body (or --sheet's). */
async function sheetText() {
  const html = await readFile(SHEET_FILE, 'utf8');
  const open = html.indexOf('<style>');
  const close = html.indexOf('</style>');
  if (open < 0 || close < open) {
    throw new Error(`${SHEET_FILE}: no <style> block`);
  }
  return html.slice(open + '<style>'.length, close);
}

/* The fixtures: name, the state line's classes, and the markup after it. */
const STATE_LINE = /<!-- state: (\{.*\}) -->\n/;
async function fixtures() {
  const out = [];
  for (const f of (await readdir(FIXTURES)).filter((n) => n.endsWith('.html')).sort()) {
    const text = await readFile(join(FIXTURES, f), 'utf8');
    const m = text.match(STATE_LINE);
    if (!m) {
      throw new Error(`${f}: no <!-- state: {...} --> line`);
    }
    const state = JSON.parse(m[1]);
    out.push({ name: f.slice(0, -'.html'.length), ui: state.ui || '', body: state.body || '', outside: Boolean(state.outside), html: text.slice(m.index + m[0].length).trim() });
  }
  return out;
}

/* Into #ui, or for an `outside` fixture (the loader) after it, where
 * index.html has it. */
const FILL = (fx) => `(() => {
  document.body.className = ${JSON.stringify(fx.body)};
  const ui = document.getElementById('ui');
  while (ui.nextSibling) { ui.nextSibling.remove(); }
  ui.className = ${JSON.stringify(fx.ui)};
  ui.innerHTML = ${JSON.stringify(fx.outside ? '' : fx.html)};
  if (${fx.outside}) { ui.insertAdjacentHTML('afterend', ${JSON.stringify(fx.html)}); }
  return true;
})()`;

async function openFixturePage(win, sheet) {
  const page = await openPage({ root, width: win.width, height: win.height, touch: Boolean(win.touch), url: '/tests/css-states/page.html' });
  if (win.reducedMotion) {
    await page.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, page.sessionId);
  }
  await page.until("document.readyState === 'complete'");
  await page.evaluate(`(() => {
    const st = document.createElement('style');
    st.id = '${SHEET_ID}';
    st.textContent = ${JSON.stringify(sheet)};
    document.head.append(st);
    return document.fonts.ready.then(() => true);
  })()`);
  return page;
}

/* One window: every fixture, and at a `states` window its driven states. */
async function recordWindow(win, sheet, list) {
  const page = await openFixturePage(win, sheet);
  const got = {};
  try {
    got['@media'] = await page.evaluate(MEDIA);
    for (const fx of list) {
      await page.evaluate(FILL(fx));
      await page.evaluate('document.fonts.ready.then(() => true)');
      got[fx.name] = await steady(page, SNAPSHOT);
      if (!win.states) {
        continue;
      }
      for (const t of await page.evaluate(TARGETS)) {
        await page.evaluate(`(() => { window.__cssTarget = window.__cssTargets[${t.i}]; return true; })()`);
        if (t.kind === 'hover') {
          await hoverTarget(page);
          got[`${fx.name}:hover:${t.base}`] = await page.evaluate(SNAP_TARGET);
          await unhover(page);
          continue;
        }
        if (!(await page.evaluate(FOCUS_TARGET))) {
          continue;
        }
        got[`${fx.name}:${t.kind}:${t.base}`] = await page.evaluate(SNAP_TARGET);
        await page.evaluate('(() => { if (document.activeElement) { document.activeElement.blur(); } return true; })()');
      }
    }
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    if (errs.length) {
      throw new Error(`page errors: ${errs.slice(0, 2).join(' | ')}`);
    }
    return got;
  } finally {
    await page.close();
  }
}

function digest(state) {
  const text = JSON.stringify(Object.keys(state).sort().map((k) => [k, state[k]]));
  return createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function condense(got) {
  const out = { '@media': got['@media'], states: {} };
  for (const k of Object.keys(got).sort()) {
    if (!k.startsWith('@')) {
      out.states[k] = digest(got[k]);
    }
  }
  return out;
}

/* css:golden's states as skeletons (tag, id, classes, from its per-path
 * output), one at a time, with the parts that match in each. */
const SKELETON_MATCHING = (paths, parts) => `(() => {
  const bare = ${BARE.toString()};
  const doc = document.implementation.createHTMLDocument('');
  const made = new Map();
  for (const path of ${JSON.stringify(paths)}) {
    const segs = path.split('>');
    let parent = null;
    for (let i = 0; i < segs.length; i += 1) {
      const key = segs.slice(0, i + 1).join('>');
      let node = made.get(key);
      if (!node) {
        const m = segs[i].replace(/:\\d+$/, '').match(/^([a-z0-9-]+)(#[^.]+)?((?:\\.[^.]+)*)$/i);
        if (!m) { break; }
        if (m[1] === 'html') { node = doc.documentElement; node.innerHTML = ''; }
        else if (m[1] === 'body' || m[1] === 'head') { node = doc.createElement(m[1]); parent.append(node); }
        else { node = doc.createElement(m[1]); parent.append(node); }
        if (m[2]) { node.id = m[2].slice(1); }
        if (m[3]) { node.className = m[3].slice(1).split('.').join(' '); }
        made.set(key, node);
      }
      parent = node;
    }
  }
  return ${JSON.stringify(parts)}.filter((p) => {
    try { return doc.querySelector(bare(p)) !== null; } catch (e) { return false; }
  });
})()`;

async function coverage(sheet, list) {
  const page = await openFixturePage(WINDOWS.desk, sheet);
  try {
    const parts = await page.evaluate(SELECTORS);
    const byFixture = new Set();
    const where = {};
    for (const fx of list) {
      await page.evaluate(FILL(fx));
      for (const p of await page.evaluate(MATCHING(parts.filter((x) => !byFixture.has(x))))) {
        byFixture.add(p);
        where[p] = fx.name;
      }
    }
    const byGolden = new Set();
    if (!existsSync(GOLDEN_DETAIL)) {
      throw new Error(`no css:golden output at ${GOLDEN_DETAIL}; run css:golden with CSS_GOLDEN_DETAIL set there first`);
    }
    for (const f of (await readdir(GOLDEN_DETAIL)).filter((n) => n.endsWith('.json'))) {
      const run = JSON.parse(await readFile(join(GOLDEN_DETAIL, f), 'utf8'));
      for (const [name, state] of Object.entries(run)) {
        if (name.startsWith('@')) {
          continue;
        }
        const left = parts.filter((x) => !byGolden.has(x));
        if (!left.length) {
          break;
        }
        for (const p of await page.evaluate(SKELETON_MATCHING(Object.keys(state), left))) {
          byGolden.add(p);
        }
      }
    }
    /* What css:golden pins by its CSSOM text instead (its SHEET): those
     * rules are its, whatever the skeletons match. */
    for (const p of parts) {
      if (/::(placeholder|-webkit-slider|selection|marker|backdrop)|map-reel/.test(p)) {
        byGolden.add(p);
      }
    }
    const neither = parts.filter((p) => !byGolden.has(p) && !byFixture.has(p));
    const onlyHere = parts.filter((p) => byFixture.has(p) && !byGolden.has(p));
    const both = parts.filter((p) => byFixture.has(p) && byGolden.has(p));
    await writeFile(join(TMP, 'css-states-coverage.json'), `${JSON.stringify({ neither, onlyHere: onlyHere.map((p) => [p, where[p]]) }, null, 1)}\n`);
    console.log(`  ${parts.length} selectors: css:golden ${byGolden.size}, css:states ${byFixture.size} (${onlyHere.length} that css:golden does not reach, ${both.length} both), neither ${neither.length}`);
    console.log(`  the lists: ${join(TMP, 'css-states-coverage.json')}`);
  } finally {
    await page.close();
  }
}

const sheet = await sheetText();
let list = await fixtures();
if (COVERAGE) {
  await coverage(sheet, list);
  process.exit(0);
}
if (!list.length) {
  throw new Error(`no fixtures in ${FIXTURES}`);
}

let failed = 0;
const seen = {};
await mkdir(DETAIL, { recursive: true });
for (const [name, win] of Object.entries(WINDOWS)) {
  if (ONLY.length && !ONLY.includes(name)) {
    continue;
  }
  const got = await recordWindow(win, sheet, list);
  for (const [m, on] of Object.entries(got['@media'])) {
    seen[m] = seen[m] || { on: 0, off: 0 };
    seen[m][on ? 'on' : 'off'] += 1;
  }
  await writeFile(join(DETAIL, `${name}.json`), `${JSON.stringify(got, null, 1)}\n`);
  const file = join(HERE, `${name}.json`);
  const mine = condense(got);
  const states = Object.keys(mine.states).length;
  const paths = Object.entries(got).reduce((n, [k, v]) => n + (k.startsWith('@') ? 0 : Object.keys(v).length), 0);
  if (RECORD) {
    await writeFile(file, `${JSON.stringify(mine, null, 1)}\n`);
    console.log(`  wrote ${name}: ${states} states, ${paths} paths`);
    continue;
  }
  if (!existsSync(file)) {
    console.log(`  FAIL  ${name}: no record at ${file}`);
    failed += 1;
    continue;
  }
  const want = JSON.parse(await readFile(file, 'utf8'));
  const names = [];
  if (JSON.stringify(want['@media']) !== JSON.stringify(mine['@media'])) {
    names.push('@media');
  }
  for (const k of new Set([...Object.keys(want.states), ...Object.keys(mine.states)])) {
    if (want.states[k] !== mine.states[k]) {
      names.push(k);
    }
  }
  if (!names.length) {
    console.log(`  pass  ${name}: ${states} states, ${paths} paths identical`);
    continue;
  }
  failed += 1;
  console.log(`  FAIL  ${name}: ${names.length} state(s) differ: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', ...' : ''}`);
  console.log(`        this run per path: ${join(DETAIL, `${name}.json`)}`);
}
if (!ONLY.length) {
  const uncovered = Object.entries(seen).filter(([, c]) => !c.on || !c.off).map(([m, c]) => `${m} (on ${c.on}, off ${c.off})`);
  if (uncovered.length) {
    failed += 1;
    console.log(`  FAIL  media conditions not both matched and unmatched across the windows:\n    ${uncovered.join('\n    ')}`);
  } else {
    console.log(`  ok    ${Object.keys(seen).length} @media conditions each matched and unmatched somewhere`);
  }
}
console.log(failed ? `\nFAIL, ${failed} window(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
