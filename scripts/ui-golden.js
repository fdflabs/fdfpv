/*
 * ui-golden.js: what every menu screen of the shell lists, and where every
 * one of its rows leads, recorded so that the shell can be rebuilt module
 * by module and shown to list and do exactly what it did.
 *
 *     node scripts/ui-golden.js            compare with tests/ui-golden/
 *     node scripts/ui-golden.js --record   write tests/ui-golden/ afresh
 *
 * For each fixture (a stored profile, seeded the way the pilot's own
 * browser would hold it) the page is booted and, for every screen the Ui
 * builds:
 *   items  ui.items() with the functions taken out: labels, notes, values,
 *          options, ids, flags. This is the menu as data.
 *   rows   the class and text of every drawn .row, the menu as painted.
 *   leads  for every row a cursor can stop on, what Enter does: the screen
 *          it ends on and which of the shell's outward hooks (onAction and
 *          the other on* callbacks main.js installs) it called, with what
 *          action. The hooks are replaced by recorders, so nothing flies.
 *
 * Stored state is put back after every press, so each row is pressed on
 * the screen as it first drew. Anything that is not the same from one run
 * to the next (dates, timings, the board) is not recorded; NOISE says what
 * and why. A check that differs is a behaviour change, and the answer is to
 * find it, not to record over it.
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
const OUT = join(root, 'tests', 'ui-golden');
const RECORD = process.argv.includes('--record');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* Each fixture: the stored profile it boots with, the language, and
 * whether the two gate questions (mode and aircraft) are answered first,
 * the way scripts/shell-check.js walks past them. */
const FIXTURES = [
  { name: 'first-visit', profile: null, lang: 'en', pastGate: false },
  { name: 'race', profile: { airframeAsked: true }, lang: 'en', pastGate: 'race' },
  { name: 'freestyle', profile: { airframeAsked: true, freestyleMap: 'swiss2', map: 'swiss2' }, lang: 'en', pastGate: 'freestyle' },
  { name: 'plane-angle', profile: { airframeAsked: true, airframe: 'cub', flightMode: 'angle' }, lang: 'en', pastGate: 'race' },
  { name: 'race-es', profile: { airframeAsked: true }, lang: 'es', pastGate: 'race' },
];

/* Screens whose rows are walked for leads. The bench (fc) is left to its
 * own checks: its pages hold hundreds of firmware keys whose Enter is
 * the bench's business, not the shell's routing. */
const NO_LEADS = new Set(['fc']);

/*
 * NOISE: keys whose values change between runs of the same tree. Their
 * presence is still recorded, as '<noise>', so a row losing one shows.
 */
const NOISE_KEYS = ['when', 'ago', 'date', 'utc', 'time', 'timePosted', 'stamp'];
/* Rows offering freshly drawn random choices: the rooms name row offers
 * the pilot's own name and two new random ones each time it is built. The
 * first option and the count are kept. */
const RANDOM_OPTION_IDS = new Set(['friends:your-name', 'friends:tu-nombre']);

function denoise(got) {
  for (const entry of Object.values(got)) {
    for (const it of entry.items || []) {
      if (it && RANDOM_OPTION_IDS.has(it.id) && Array.isArray(it.options)) {
        it.options = it.options.map((o, k) => (k ? '<noise>' : o));
      }
    }
  }
  return got;
}

/* Rows whose Enter reloads the page: pressing one would end the walk, and
 * a Location's reload cannot be stubbed. Recorded as skipped. By action,
 * and by id for the language row, whose Enter steps to the next language
 * and reloads into it; ids come from labels, so it has one per language. */
const RELOADS = ['update-reload'];
const RELOAD_IDS = ['pilot:language', 'pilot:idioma'];

/* Installed once per page: the hooks main.js gave the Ui are swapped for
 * recorders that keep the call and its plain arguments. */
const HOOK = `(() => {
  const ui = window.__ui;
  window.__goldenCalls = [];
  for (const k of Object.keys(ui)) {
    if (!/^on[A-Z]/.test(k) || typeof ui[k] !== 'function') { continue; }
    ui[k] = (...args) => {
      window.__goldenCalls.push([k, ...args.map((a) => (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' ? a : typeof a))]);
    };
  }
  return Object.keys(ui.screens).sort();
})()`;

const DUMP = (name, from, noLeads, noiseKeys) => `(async () => {
  const ui = window.__ui;
  const name = ${JSON.stringify(name)};
  const from = ${from};
  const NOISE = new Set(${JSON.stringify(noiseKeys)});
  const RELOADS = new Set(${JSON.stringify(RELOADS)});
  const RELOAD_IDS = new Set(${JSON.stringify(RELOAD_IDS)});
  const calls = window.__goldenCalls;
  const isNode = (v) => v && typeof v === 'object' && typeof v.nodeType === 'number';
  const clean = (v, depth) => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') { return v; }
    if (typeof v === 'number') { return Number.isFinite(v) ? v : String(v); }
    if (typeof v === 'undefined' || typeof v === 'function' || typeof v === 'symbol') { return undefined; }
    if (isNode(v)) { return '<node>'; }
    if (depth > 4) { return '<deep>'; }
    if (Array.isArray(v)) { return v.map((x) => { const c = clean(x, depth + 1); return c === undefined ? null : c; }); }
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (NOISE.has(k)) { o[k] = '<noise>'; continue; }
      const c = clean(v[k], depth + 1);
      if (c !== undefined) { o[k] = c; }
    }
    return o;
  };
  const rowsOf = () => {
    const host = ui.screens[name];
    if (!host) { return []; }
    return Array.from(host.querySelectorAll('.row')).map((r) => ({
      cls: r.className,
      text: r.textContent.replace(/\\s+/g, ' ').trim(),
    }));
  };
  const store = () => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
  const restore = (snap, settings) => {
    localStorage.clear();
    for (const [k, v] of JSON.parse(snap)) { localStorage.setItem(k, v); }
    for (const k of Object.keys(ui.settings)) { if (!(k in settings)) { delete ui.settings[k]; } }
    Object.assign(ui.settings, JSON.parse(JSON.stringify(settings)));
  };
  /* A walk resumed after a row reloaded the page picks its entry, leads
   * so far and starting state up from sessionStorage, which survives it. */
  let entry = {};
  let leads = [];
  let snap;
  let settings;
  if (from === 0) {
    try {
      ui.show(name);
      entry.screen = ui.screen;
      entry.items = ui.items().map((it) => clean(it, 0));
      entry.rows = rowsOf();
    } catch (e) {
      entry.error = String(e && e.message ? e.message : e);
      return JSON.stringify(entry);
    }
    if (${JSON.stringify(noLeads)}.includes(name)) {
      return JSON.stringify(entry);
    }
    snap = store();
    settings = JSON.parse(JSON.stringify(ui.settings));
    sessionStorage.setItem('golden.entry', JSON.stringify(entry));
    sessionStorage.setItem('golden.snap', snap);
    sessionStorage.setItem('golden.settings', JSON.stringify(settings));
  } else {
    entry = JSON.parse(sessionStorage.getItem('golden.entry'));
    leads = JSON.parse(sessionStorage.getItem('golden.leads'));
    snap = sessionStorage.getItem('golden.snap');
    settings = JSON.parse(sessionStorage.getItem('golden.settings'));
    leads.push({ i: from - 1, reloaded: true });
  }
  sessionStorage.setItem('golden.leads', JSON.stringify(leads));
  restore(snap, settings);
  ui.show(name);
  const n = ui.items().length;
  for (let i = from; i < n; i += 1) {
    restore(snap, settings);
    try {
      ui.show(name);
      const it = ui.items()[i];
      if (!ui.isStop(it)) { continue; }
      if (RELOADS.has(it.action) || RELOAD_IDS.has(it.id)) { leads.push({ i, id: it.id || null, skipped: 'reloads the page' }); continue; }
      calls.length = 0;
      sessionStorage.setItem('golden.last', String(i));
      ui.setCursor(i);
      ui.select();
      await new Promise((r) => setTimeout(r, 0));
      leads.push({ i, id: it.id || null, to: ui.screen, calls: calls.slice() });
    } catch (e) {
      leads.push({ i, error: String(e && e.message ? e.message : e) });
    }
    /* A row may open a dialog or a picker over the menu; put it away. */
    try { ui.back(); } catch (e) { /* the screen had no back */ }
    sessionStorage.setItem('golden.leads', JSON.stringify(leads));
  }
  restore(snap, settings);
  entry.leads = leads;
  return JSON.stringify(entry);
})()`;

function seedFor(fx) {
  /* The language rides on ?lang= in the address, the first place the
   * string table looks, so it needs no stored key. */
  const lines = [
    /* The rooms picker name and figure are drawn at random on a first
     * visit; a fixed pair keeps the Friends rows the same every run. */
    "try { localStorage.setItem('fdfpv.pilotPick', '[1,2,42]'); localStorage.setItem('fdfpv.pilotFigure', '3'); } catch (e) { /* storage refused */ }",
  ];
  if (fx.profile) {
    lines.push(`try {
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(fx.profile))});
    } catch (e) { /* storage refused */ }`);
  }
  return lines;
}

let failed = 0;
for (const fx of FIXTURES) {
  if (ONLY.length && !ONLY.includes(fx.name)) {
    continue;
  }
  const page = await openPage({ root, width: 1600, height: 900, url: `/index.html?lang=${fx.lang}`, seed: seedFor(fx) });
  let got;
  try {
    await page.until('window.__shellReady === true', 300000);
    const pastGate = `(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = ${JSON.stringify(fx.pastGate)}; return true; })()`;
    if (fx.pastGate) {
      await page.evaluate(pastGate);
    }
    got = {};
    const names = await page.evaluate(HOOK);
    for (const name of names) {
      let from = 0;
      /* A row that reloads the page ends the evaluate; the walk waits for
       * the shell to come back, puts the hooks and the gate answers back,
       * and carries on from the row after it. */
      for (let tries = 0; ; tries += 1) {
        try {
          got[name] = JSON.parse(await page.evaluate(DUMP(name, from, [...NO_LEADS], NOISE_KEYS)));
          break;
        } catch (e) {
          if (tries > 20 || !/navigated|closed|context/i.test(e.message)) {
            throw new Error(`${fx.name}: walking ${name}: ${e.message}`);
          }
          await page.until('window.__shellReady === true', 300000);
          if (fx.pastGate) {
            await page.evaluate(pastGate);
          }
          await page.evaluate(HOOK);
          from = Number(await page.evaluate("sessionStorage.getItem('golden.last')")) + 1;
        }
      }
    }
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    if (errs.length) {
      console.log(`  FAIL  ${fx.name}: page errors: ${errs.slice(0, 3).join(' | ')}`);
      failed += 1;
    }
  } finally {
    await page.close();
  }
  denoise(got);
  const file = join(OUT, `${fx.name}.json`);
  const text = `${JSON.stringify(got, null, 1)}\n`;
  if (RECORD) {
    await mkdir(OUT, { recursive: true });
    await writeFile(file, text);
    console.log(`  wrote ${fx.name}: ${Object.keys(got).length} screens`);
    continue;
  }
  if (!existsSync(file)) {
    console.log(`  FAIL  ${fx.name}: no golden at ${file}; record one on the old code`);
    failed += 1;
    continue;
  }
  const want = JSON.parse(await readFile(file, 'utf8'));
  const diffs = [];
  for (const name of new Set([...Object.keys(want), ...Object.keys(got)])) {
    for (const part of ['screen', 'error', 'items', 'rows', 'leads']) {
      const a = JSON.stringify(want[name] && want[name][part]);
      const b = JSON.stringify(got[name] && got[name][part]);
      if (a !== b) {
        diffs.push(`${name}.${part}`);
      }
    }
  }
  if (diffs.length) {
    failed += 1;
    console.log(`  FAIL  ${fx.name}: ${diffs.length} part(s) differ: ${diffs.slice(0, 12).join(', ')}`);
    await writeFile(join(process.env.TMPDIR || '/tmp', `ui-golden-${fx.name}.json`), text);
  } else {
    console.log(`  pass  ${fx.name}: ${Object.keys(got).length} screens identical`);
  }
}
console.log(failed ? `\nFAIL, ${failed} fixture(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
