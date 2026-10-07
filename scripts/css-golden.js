/*
 * css-golden.js: what index.html's stylesheet makes of the shell, recorded
 * so the stylesheet can be rewritten and shown to draw exactly the same.
 *
 *     npm run css:golden                     compare with tests/css-golden/
 *     node scripts/css-golden.js --record    write tests/css-golden/ afresh
 *     node scripts/css-golden.js race@phone  one configuration
 *
 * A stylesheet's behaviour is the computed style it gives every element.
 * For each configuration (a stored profile, a window size, touch or not)
 * and each menu screen, every rendered element is hashed: its full
 * computed style (property names sorted, because Chromium lists custom
 * properties in a different order on each load), its ::before and ::after,
 * and its declared transition and animation. A rule that moves, merges or
 * is rephrased changes nothing; one wrong value anywhere changes a hash.
 * The committed record is one digest per state; every run writes the
 * per-element form to CSS_GOLDEN_DETAIL (default $TMPDIR/css-golden-detail),
 * so two runs (old and new stylesheet, different folders) can be diffed to
 * find the element. CSS_GOLDEN_FULL=<screen> also writes that screen's full
 * styles.
 *
 * Interactions: on the gate (first@desk), the racer's desk and the phone,
 * every :hover, :focus, :focus-visible and :focus-within rule whose element
 * is on the screen is driven on its first visible match, the mouse moved
 * onto it or the keyboard focus put in it, and the part of the page around
 * it recorded. An open drop-down and the #ui flight state classes are
 * recorded too.
 *
 * Determinism: motion is switched off by an injected sheet before each
 * snapshot (the declared motion is read first, with it out), the world
 * cards' reels never start, and a screen's snapshot is retaken until two
 * in a row agree, because the shell's frame loop keeps writing under the
 * menus. Checked by a record and three compares at load 22 to 35 with no
 * difference.
 *
 * Media queries are proven covered, not assumed: every @media condition in
 * the sheet must hold in at least one configuration and fail in at least
 * one, or the run fails. Reduced motion is emulated for one configuration.
 * The conditions' text is part of the record as well.
 *
 * What computed style cannot see is pinned by its CSSOM text instead:
 * ::placeholder, the range input's track and thumb, @font-face, @keyframes
 * and the world cards' reel rules. The custom property the scripts read
 * back or writes (SCRIPT_TOKENS) are recorded wherever they apply; every
 * other custom property is left out of the hash, because the tokens are
 * the sheet's own business and a rewrite may rename or add them.
 *
 * Any difference is a stylesheet change: the answer is to fix the rule, or
 * to re-record on purpose with the reason in the commit.
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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = process.env.CSS_GOLDEN_OUT || join(root, 'tests', 'css-golden');
const RECORD = process.argv.includes('--record');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* The stored profiles, as scripts/ui-golden.js seats them: the gate up on
 * a first visit, and a returning racer past it. */
const PROFILES = {
  first: { profile: null, lang: 'en', pastGate: false },
  race: { profile: { airframeAsked: true }, lang: 'en', pastGate: 'race' },
};

/* Windows chosen so that every @media condition in the sheet is true
 * somewhere and false somewhere (checked at run time, see coverage). */
const WINDOWS = {
  desk: { width: 1600, height: 900 },
  tall: { width: 1600, height: 1000 },
  laptop: { width: 1280, height: 720 },
  narrow: { width: 860, height: 700 },
  short: { width: 1024, height: 500 },
  phone: { width: 390, height: 844, touch: true },
  phoneWide: { width: 844, height: 390, touch: true },
};

const CONFIGS = [
  { name: 'first@desk', profile: 'first', window: 'desk', states: true },
  { name: 'first@phone', profile: 'first', window: 'phone' },
  { name: 'race@desk', profile: 'race', window: 'desk', states: true },
  { name: 'race@tall', profile: 'race', window: 'tall' },
  { name: 'race@laptop', profile: 'race', window: 'laptop' },
  { name: 'race@narrow', profile: 'race', window: 'narrow' },
  { name: 'race@short', profile: 'race', window: 'short' },
  { name: 'race@phone', profile: 'race', window: 'phone', states: true },
  { name: 'race@phoneWide', profile: 'race', window: 'phoneWide' },
  { name: 'race@still', profile: 'race', window: 'desk', reducedMotion: true },
];

/* The classes the shell puts on #ui in flight (grep classList in
 * src/ui/ui.js and src/ui/overlay.js), applied one at a time over the
 * paused screen, where the overlay is drawn under the menu. */
const ROOT_STATES = ['fpv-osd-on', 'bar-shown', 'compact', 'avx-on', 'war-on', 'ops-on', 'mine', 'is-minimal', 'hangar-open', 'carousel-open'];

/*
 * Motion off before every snapshot: an injected sheet sets every
 * transition and animation to none, so no value depends on how far a
 * transition or a keyframe had got when the snapshot ran (finishing them
 * was tried and still drifted under load). What that hides, the declared
 * transition-* and animation-* longhands, is recorded on its own from the
 * page without the sheet (MOTION), and the @keyframes bodies by their text
 * (SHEET).
 */
const STILL_ID = 'css-golden-still';
/* Custom properties script reads (getPropertyValue) or writes
 * (style.setProperty), from a grep of src/: the only tokens that are
 * contract. */
const SCRIPT_TOKENS = ['--ui-font', '--bar-top', '--bar-bot', '--i', '--swatch', '--burst', '--frac', '--px', '--py', '--poster'];
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


/* The snapshot, evaluated in the page. Returns { path: [self, before, after] }
 * for every rendered element, each a hash of the full computed style. */
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
      /* Custom properties are the sheet's own vocabulary and a rewrite may
       * rename or add them; what they do lands in the real properties,
       * which are recorded. The ones script reads or writes are kept. */
      if (p.startsWith('--') && !SCRIPT_TOKENS.has(p)) { continue; }
      parts.push(p + ':' + cs.getPropertyValue(p));
    }
    /* Sorted: Chromium lists custom properties in an order that changes
     * from one page load to the next. The check's server picks a port each
     * run, and a url() is absolute. */
    return parts.sort().join(';').split(location.origin).join('<origin>');
  };
  const pathOf = (el) => {
    const bits = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; }
      if (n.classList.length) { s += '.' + Array.from(n.classList).join('.'); }
      const p = n.parentElement;
      if (p) {
        const i = Array.from(p.children).indexOf(n);
        s += ':' + i;
      }
      bits.unshift(s);
    }
    return bits.join('>');
  };
  /* The declared motion first, with the motion-off sheet out: these
   * longhands are what the sheet says, not where a transition has got to. */
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
  unsettle();
  const motion = new Map();
  const walkMotion = (el) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') { return; }
    if (el !== top && el.getClientRects().length === 0) { return; }
    motion.set(el, motionOf(el, null) + '|' + motionOf(el, '::before') + '|' + motionOf(el, '::after'));
    for (const c of el.children) { walkMotion(c); }
  };
  const top = ${rootExpr};
  walkMotion(top);
  settle();
  const out = {};
  const walk = (el) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') { return; }
    if (el !== document.documentElement && el.getClientRects().length === 0) { return; }
    out[pathOf(el)] = [hash(styleText(el, null)), hash(styleText(el, '::before')), hash(styleText(el, '::after')), hash(motion.get(el) || '')];
    for (const c of el.children) { walk(c); }
  };
  walk(top);
  return out;
})()`;
const SNAPSHOT = SNAP('document.documentElement');
/* Only the part of the page an interaction can restyle: the target's
 * parent and everything under it (a :hover rule reaches the element, its
 * children and its later siblings). */
const SNAP_TARGET = SNAP('(window.__cssTarget.parentElement || window.__cssTarget)');

/* The same walk, keeping the full text of the paths listed, for the
 * failure dump. */
const FULL = (paths) => `(() => {
  ${SETTLE}
  const want = new Set(${JSON.stringify(paths)});
  const styleText = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && cs.content === 'none') { return 'none'; }
    const o = {};
    for (let i = 0; i < cs.length; i += 1) { o[cs[i]] = cs.getPropertyValue(cs[i]).split(location.origin).join('<origin>'); }
    return o;
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
  settle();
  const out = {};
  const walk = (el) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') { return; }
    if (el !== document.documentElement && el.getClientRects().length === 0) { return; }
    const p = pathOf(el);
    if (want.has(p)) { out[p] = { self: styleText(el, null), before: styleText(el, '::before'), after: styleText(el, '::after') }; }
    for (const c of el.children) { walk(c); }
  };
  walk(document.documentElement);
  return out;
})()`;

/* The sheet's own facts: its @media conditions, the rules computed style
 * cannot reach, @font-face, and --ui-font. */
const SHEET = `(() => {
  const sheet = Array.from(document.styleSheets).find((s) => s.ownerNode && s.ownerNode.tagName === 'STYLE' && s.ownerNode.id !== '${STILL_ID}');
  const media = [];
  const unseen = [];
  const faces = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.media) { media.push(r.media.mediaText); walk(r.cssRules); continue; }
      if (r.type === CSSRule.FONT_FACE_RULE || r.type === CSSRule.KEYFRAMES_RULE) { faces.push(r.cssText); continue; }
      if (r.selectorText && /::(placeholder|-webkit-slider|selection|marker|backdrop)|map-reel/.test(r.selectorText)) { unseen.push(r.cssText); }
      if (r.cssRules && !r.media) { walk(r.cssRules); }
    }
  };
  walk(sheet.cssRules);
  const matches = {};
  for (const m of new Set(media)) { matches[m] = matchMedia(m).matches; }
  return {
    media: matches,
    unseen: unseen.sort(),
    faces: faces.sort(),
    uiFont: getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim(),
  };
})()`;

function seedFor(p) {
  const lines = [
    "try { localStorage.setItem('fdfpv.pilotPick', '[1,2,42]'); localStorage.setItem('fdfpv.pilotFigure', '3'); } catch (e) { /* storage refused */ }",
  ];
  if (p.profile) {
    lines.push(`try { localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(p.profile))}); } catch (e) { /* storage refused */ }`);
  }
  return lines;
}

/* The interactive rules' targets on the screen shown: for each rule whose
 * selector holds :hover, :focus, :focus-visible or :focus-within, the
 * selector with those removed, and its first visible match. Kept on window
 * (__cssTargets) for the steps that drive them one at a time. */
const TARGETS = `(() => {
  const sheet = Array.from(document.styleSheets).find((s) => s.ownerNode && s.ownerNode.tagName === 'STYLE' && s.ownerNode.id !== '${STILL_ID}');
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
        /* The element the pseudo-class sits on: the compound before it. */
        const at = part.search(PSEUDO);
        const base = part.slice(0, at).replace(PSEUDO, '').trim();
        if (!base || /::/.test(base)) { continue; }
        wanted.set(kind + '|' + base, { kind, base });
      }
    }
  };
  walk(sheet.cssRules);
  const seen = new Set();
  const out = [];
  window.__cssTargets = [];
  for (const { kind, base } of [...wanted.values()].sort((a, b) => (a.kind + a.base < b.kind + b.base ? -1 : 1))) {
    let list;
    try { list = document.querySelectorAll(base); } catch (e) { continue; }
    const el = Array.from(list).find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(n).visibility !== 'hidden';
    });
    if (!el || seen.has(kind + '|' + base)) { continue; }
    seen.add(kind + '|' + base);
    window.__cssTargets.push(el);
    out.push({ i: window.__cssTargets.length - 1, kind, base });
  }
  return out;
})()`;

/* Focus the target, or for :focus-within the first focusable thing in it,
 * the way a keyboard does (focus-visible on). A target nothing in can take
 * focus is skipped rather than given a tabindex, which would change it. */
const FOCUS_TARGET = `(() => {
  const el = window.__cssTarget;
  const inner = el.matches('a, button, input, select, textarea, [tabindex]') ? el : el.querySelector('a, button, input, select, textarea, [tabindex]');
  if (!inner) { return false; }
  const f = inner;
  f.focus({ focusVisible: true, preventScroll: true });
  return document.activeElement === f;
})()`;

/*
 * A snapshot taken until two in a row agree. The shell's frame loop keeps
 * running under the menus (main.js), and on some screens it writes the
 * flight banner and the canvas a frame or two after show() returns: the pad
 * pick screen on a phone did, one run in three.
 */
async function steady(page, expr) {
  let last = JSON.stringify(await page.evaluate(expr));
  for (let i = 0; i < 8; i += 1) {
    await page.sleep(120);
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
  return true;
}

async function unhover(page) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, page.sessionId);
  await page.sleep(50);
}

/* One configuration: every screen, then the driven states. Returns the
 * record, keyed by state name. */
async function record(cfg) {
  const p = PROFILES[cfg.profile];
  const w = WINDOWS[cfg.window];
  const page = await openPage({ root, width: w.width, height: w.height, touch: Boolean(w.touch), url: `/index.html?lang=${p.lang}`, seed: seedFor(p) });
  const got = {};
  try {
    if (cfg.reducedMotion) {
      await page.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, page.sessionId);
    }
    await page.until('window.__shellReady === true', 300000);
    await page.loaded();
    await page.evaluate('document.fonts.ready.then(() => true)');
    if (p.pastGate) {
      await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = ${JSON.stringify(p.pastGate)}; return true; })()`);
    }
    /* The world cards' reels start after 900 ms of quiet and draw a
     * countdown while they capture, so what they show depends on how fast
     * the walk went. They are kept off; their rules are pinned by text
     * instead (SHEET). */
    await page.evaluate("(() => { const ui = window.__ui; ui.armReels = () => {}; ui.startReels = () => {}; if (ui.stopReels) { ui.stopReels(); } clearTimeout(ui.reelRestart); ui.reelRestart = null; return true; })()");
    got['@sheet'] = await page.evaluate(SHEET);
    const names = await page.evaluate('Object.keys(window.__ui.screens).sort()');
    /* One throwaway pass over the first screen: on a phone the first
     * screen shown after boot still had the boot screen's layout settling
     * under it (216 paths of calibrate differed between record and compare,
     * every other screen matched). */
    await page.evaluate(`(() => { window.__ui.show(${JSON.stringify('title')}); window.__ui.show(${JSON.stringify(names[0])}); return true; })()`);
    await page.sleep(300);
    await page.evaluate(SNAPSHOT);
    for (const name of names) {
      await page.evaluate(`(() => { window.__ui.show(${JSON.stringify(name)}); return true; })()`);
      await page.sleep(50);
      got[name] = await steady(page, SNAPSHOT);
      if (process.env.CSS_GOLDEN_FULL === name) {
        /* Every rendered path's full styles, for finding what moved
         * between two runs: CSS_GOLDEN_FULL=<screen> node scripts/css-golden.js --record <config>. */
        const full = await page.evaluate(FULL(Object.keys(got[name])));
        await writeFile(join(process.env.TMPDIR || '/tmp', `css-golden-full-${cfg.name}-${name}-${Date.now()}.json`), JSON.stringify(full, null, 1));
      }
      if (!cfg.states) {
        continue;
      }
      /* Every :hover and :focus rule in the sheet that has an element on
       * this screen: its first visible match is hovered, or focused, and the
       * part of the page around it recorded. */
      const targets = await page.evaluate(TARGETS);
      for (const t of targets) {
        await page.evaluate(`(() => { window.__cssTarget = window.__cssTargets[${t.i}]; return true; })()`);
        if (t.kind === 'hover') {
          if (!(await hoverTarget(page))) {
            continue;
          }
          got[`${name}:hover:${t.base}`] = await page.evaluate(SNAP_TARGET);
          await unhover(page);
        } else {
          const ok = await page.evaluate(FOCUS_TARGET);
          if (!ok) {
            continue;
          }
          got[`${name}:${t.kind}:${t.base}`] = await page.evaluate(SNAP_TARGET);
          await page.evaluate('(() => { if (document.activeElement) { document.activeElement.blur(); } return true; })()');
        }
      }
      /* A drop-down open on the first row that has one. */
      const opened = await page.evaluate(`(() => {
        const ui = window.__ui;
        /* Not the rooms name row: its options are two names drawn at
         * random each build (scripts/ui-golden.js RANDOM_OPTION_IDS), and
         * a name's width is a computed style. */
        const i = ui.items().findIndex((it) => it && it.options && it.options.length && !it.pickOnly && it.id !== 'friends:your-name' && it.id !== 'friends:tu-nombre');
        if (i < 0 || !ui.openDropForCursor) { return false; }
        ui.setCursor(i);
        try { ui.openDropForCursor(); } catch (e) { return false; }
        return Boolean(document.querySelector('.drop, .menu-drop, [class*="drop"]'));
      })()`);
      if (opened) {
        got[`${name}:drop`] = await page.evaluate(SNAPSHOT);
        await page.evaluate(`(() => { try { window.__ui.closeDrop(); } catch (e) { /* none open */ } return true; })()`);
      }
    }
    if (cfg.states) {
      await page.evaluate("(() => { window.__ui.show('paused'); return true; })()");
      for (const cls of ROOT_STATES) {
        await page.evaluate(`(() => { document.getElementById('ui').classList.add(${JSON.stringify(cls)}); return true; })()`);
        await page.sleep(50);
        got[`paused+${cls}`] = await steady(page, SNAPSHOT);
        await page.evaluate(`(() => { document.getElementById('ui').classList.remove(${JSON.stringify(cls)}); return true; })()`);
      }
    }
    return { page, got };
  } catch (e) {
    await page.close();
    throw e;
  }
}

/* What is committed: per state one digest of every path's hashes, so the
 * record stays small (the per-path form is about 10 MB). The per-path form
 * of every run is written to DETAIL; to see which elements moved, run the
 * check once on the old stylesheet and once on the new with different
 * CSS_GOLDEN_DETAIL folders and compare the two files. */
function digest(state) {
  const text = JSON.stringify(Object.keys(state).sort().map((k) => [k, state[k]]));
  return createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function condense(got) {
  const out = { '@sheet': got['@sheet'], states: {} };
  for (const k of Object.keys(got).sort()) {
    if (!k.startsWith('@')) {
      out.states[k] = digest(got[k]);
    }
  }
  return out;
}

const DETAIL = process.env.CSS_GOLDEN_DETAIL || join(process.env.TMPDIR || '/tmp', 'css-golden-detail');

let failed = 0;
const seen = {};
for (const cfg of CONFIGS) {
  if (ONLY.length && !ONLY.includes(cfg.name)) {
    continue;
  }
  const { page, got } = await record(cfg);
  try {
    for (const [m, on] of Object.entries(got['@sheet'].media)) {
      seen[m] = seen[m] || { on: 0, off: 0 };
      seen[m][on ? 'on' : 'off'] += 1;
    }
    await mkdir(DETAIL, { recursive: true });
    await writeFile(join(DETAIL, `${cfg.name}.json`), `${JSON.stringify(got, null, 1)}\n`);
    const file = join(OUT, `${cfg.name}.json`);
    const mine = condense(got);
    const states = Object.keys(mine.states).length;
    const paths = Object.values(got).reduce((n, v) => n + (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 0), 0);
    /* Printed, never recorded: the padPickResult fault in main.js (#575)
     * comes and goes between runs and is not the stylesheet's. */
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    if (errs.length) {
      console.log(`  note  ${cfg.name}: page errors: ${errs.slice(0, 2).join(' | ').split('\n')[0]}`);
    }
    if (RECORD) {
      await mkdir(OUT, { recursive: true });
      await writeFile(file, `${JSON.stringify(mine, null, 1)}\n`);
      console.log(`  wrote ${cfg.name}: ${states} states, ${paths} paths`);
      continue;
    }
    if (!existsSync(file)) {
      console.log(`  FAIL  ${cfg.name}: no golden at ${file}; record one on the old stylesheet`);
      failed += 1;
      continue;
    }
    const want = JSON.parse(await readFile(file, 'utf8'));
    const names = [];
    if (JSON.stringify(want['@sheet']) !== JSON.stringify(mine['@sheet'])) {
      names.push('@sheet');
    }
    for (const k of new Set([...Object.keys(want.states), ...Object.keys(mine.states)])) {
      if (want.states[k] !== mine.states[k]) {
        names.push(k);
      }
    }
    if (!names.length) {
      console.log(`  pass  ${cfg.name}: ${states} states, ${paths} paths identical`);
      continue;
    }
    failed += 1;
    console.log(`  FAIL  ${cfg.name}: ${names.length} state(s) differ: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', ...' : ''}`);
    console.log(`        this run per path: ${join(DETAIL, `${cfg.name}.json`)}`);
  } finally {
    await page.close();
  }
}
if (!ONLY.length) {
  const uncovered = Object.entries(seen).filter(([, c]) => !c.on || !c.off).map(([m, c]) => `${m} (on ${c.on}, off ${c.off})`);
  if (uncovered.length) {
    failed += 1;
    console.log(`  FAIL  media conditions not both matched and unmatched across the configurations:\n    ${uncovered.join('\n    ')}`);
  } else {
    console.log(`  ok    ${Object.keys(seen).length} @media conditions each matched and unmatched somewhere`);
  }
}
console.log(failed ? `\nFAIL, ${failed} configuration(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
