/*
 * boot-loader-check.js: the boot screen is the PDCS bootloader, every row on
 * it is a real step, and the key art is the title's.
 *
 * The owner, 2 October: the very first loading screen should not show
 * Itaipu, because it comes back on every load and is not representative of
 * the whole game; no jokes; a simulation system initializing, four screens
 * (initial boot, system check, map loading, finalizing), branding subdued
 * to PDCS and a flag marker that is always red over white over blue; a
 * short load shows only the boot mark and a bar; progress is real work.
 * The key art lives in the main menu instead. This drives the real shell
 * in headless Chromium and holds all of it:
 *
 * A RECORDED LOAD, at a desktop window and an upright phone, and once more
 * on Itaipu. A recorder installed before the page's first script logs every
 * change to the boot screen, every row's every state from the mutation
 * records themselves (so a state set and replaced inside one task is still
 * seen), and every picture it asks for. The screens only move forward,
 * 1, 2, 3, 4 on a cold boot, and the header names each. The bar is a
 * progressbar from 0 to 100 whose value never falls, the number beside it
 * agrees, it reaches 100 and the screen hides. The status line names only
 * the load's real stages. No text on the screen at any point is a joke or
 * names Betaflight. The system rows: the physics engine says OK only after
 * the simulator stage has begun, the flight controller only after the
 * physics engine, the audio system never says OK (it waits for a gesture),
 * and online services say N/A on a boot with no track link. The map rows
 * are exactly the phases the map's module declares, and every one of them
 * was LOADING at some point before it said OK, which is what makes them
 * steps and not decoration. The finalizing rows all end OK. The only
 * pictures the screen asks for are the drone's wireframe and the poster of
 * the map being loaded; never the key art, and no background image.
 *
 * LAYOUT. Nothing scrolls sideways; on the phone the header, the column and
 * the footer keep a 16 px gutter and the two column screens stack. The flag
 * is wider than tall with its three bands stacked red, white, blue. Under
 * reduced motion the sweep and the blink are still.
 *
 * A SHORT LOAD (posed through the Loading API, because only a planned
 * duration decides it): a load planned under the threshold shows the first
 * screen alone; one planned over it does not.
 *
 * THE TITLE. Once the boot screen has gone, the gate carries the key art
 * for the window's shape, over its fallback colour and under a scrim, and
 * the art is not requested before the boot screen has gone.
 *
 * And fail() still makes a readable dead end.
 *
 * Run with npm run boot:loader. SIM_GPU=1 renders on this machine's GPU.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

/* The jokes' keys, as they were in src/strings before they were removed. */
const JOKE_KEYS = [
  'i_complimented_my_quad_on_its', 'my_flight_controller_only_eats_greek',
  'my_lipo_went_to_prison_it', 'my_quad_is_a_helicopter_parent',
  'my_tiny_whoop_just_won_the', 'someone_snapped_my_carbon_i_ve',
  'my_quad_broke_an_arm_and', 'race_directors_are_so_exclusive_pure',
  'my_racing_record_is_chequered_that', 'my_vtx_and_i_just_click',
  'my_battery_reads_the_news_every', 'the_packs_went_on_strike_it',
  'my_old_lipo_refuses_to_change', 'my_battery_left_the_army_honourable',
  'why_did_the_pilot_bring_soap', 'what_does_a_baby_battery_call',
  'my_quad_went_low_carb_kept', 'my_quad_was_on_a_roll',
  'my_quad_asked_for_a_raise', 'the_start_gates_are_in_mint',
];
/* Words from their punchlines, for the screen's own text, and the name
 * the owner asked to keep off every screen a player sees. */
const JOKE_WORDS = /\b(props|gyro|helicopter parent|chequered|soap|low carb|on a roll|raise|gatekeeping)\b/i;
const FORBIDDEN = /betaflight/i;

console.log('the jokes are gone from the source');
const locales = (await readdir(join(root, 'src/strings'))).filter((f) => /^[a-z]{2}\.js$/.test(f));
for (const f of locales) {
  const table = (await import(join(root, 'src/strings', f))).default;
  const left = JOKE_KEYS.filter((k) => Object.hasOwn(table, `loading.${k}`));
  check(`${f} has none of the joke keys`, left.length === 0, left.join(', '));
  const named = Object.entries(table).filter(([k, v]) => /^loading\.(pdcs|state|row|phase)_/.test(k) && FORBIDDEN.test(v));
  check(`${f}: no bootloader string names Betaflight`, named.length === 0, named.map(([k]) => k).join(', '));
}
const loadingSrc = await readFile(join(root, 'src/ui/loading.js'), 'utf8');
const uiSrc = await readFile(join(root, 'src/ui/ui.js'), 'utf8');
const html = await readFile(join(root, 'index.html'), 'utf8');
check('loading.js keeps no joke list and no joke timer', !/JOKE|quotedJoke/.test(loadingSrc));
check('ui.js imports no joke', !/JOKE|quotedJoke|waitJoke/.test(uiSrc));
check('index.html has no joke element and no tagline', !/loading-joke|map-reel-wait-joke|loading-tag/.test(html));
check('index.html asks for no picture in its head', !/rel="preload" as="image"/.test(html));
const loaderMarkup = (html.match(/<div id="loading"[\s\S]*?<script type="module"/) || [''])[0];
check('the boot screen\'s markup never names Betaflight', loaderMarkup.length > 0 && !FORBIDDEN.test(loaderMarkup));

/* The stage lines a load may show, read from loading.js through the string
 * table the same way the page does. */
const { str } = await import(join(root, 'src/strings/index.js'));
const doingBlock = (loadingSrc.match(/const STAGE_DOING = \{([\s\S]*?)\};/) || ['', ''])[1];
const DOING = [...doingBlock.matchAll(/str\('(loading\.[a-z_]+)'\)/g)].map((m) => str(m[1]));
check('loading.js names six stages in words', DOING.length >= 6, DOING.join(' | '));

/*
 * Installed before the page's first script. Samples: the screen, the
 * header, the text, the value and the number after every change. Rows:
 * every data-state change as a record, with its old value, so the full
 * sequence of states each row went through can be rebuilt. Pictures: every
 * resource under assets/, from an observer, because the shell's module
 * graph fills the page's resource timing buffer long before the title.
 */
const RECORDER = `(() => {
  const log = window.__bootLog = { samples: [], rows: [], hiddenAt: null, texts: new Set(), pictures: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (/\\/assets\\//.test(e.name)) {
        log.pictures.push({ name: e.name.replace(location.origin, ''), start: e.startTime });
      }
    }
  }).observe({ type: 'resource' });
  const sample = (root) => {
    const track = root.querySelector('.loading-track');
    const pct = root.querySelector('.loading-pct');
    log.texts.add(root.textContent);
    log.samples.push({
      t: performance.now(),
      v: track ? track.getAttribute('aria-valuenow') : null,
      pct: pct ? pct.textContent : null,
      stage: (root.querySelector('.loading-stage') || {}).textContent || '',
      screen: root.dataset.screen || '',
      head: ((root.querySelector('.pdcs-step') || {}).textContent || '') + ' ' + ((root.querySelector('.pdcs-stage-name') || {}).textContent || ''),
      hidden: root.hidden,
    });
    if (root.hidden && log.hiddenAt === null) {
      log.hiddenAt = performance.now();
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('loading');
    if (!root) {
      return;
    }
    sample(root);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'data-state' && r.target.dataset && r.target.dataset.row) {
          log.rows.push({ t: performance.now(), group: r.target.parentElement ? r.target.parentElement.dataset.group : '',
            row: r.target.dataset.row, old: r.oldValue, el: r.target });
        }
      }
      sample(root);
    }).observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
    });
  });
})();`;

/* Every row's states in order, rebuilt from the records: each record's old
 * value, then the value the row holds now. Rows the screen rebuilt (a new
 * element) are separate histories. */
const ROW_HISTORY = `JSON.stringify((() => {
  const out = [];
  const byEl = new Map();
  for (const r of window.__bootLog.rows) {
    if (!byEl.has(r.el)) {
      byEl.set(r.el, { group: r.group, row: r.row, states: [], times: [] });
    }
    const h = byEl.get(r.el);
    h.states.push(r.old);
    h.times.push(r.t);
  }
  for (const [el, h] of byEl) {
    h.states.push(el.dataset.state);
    h.times.push(Infinity);
    out.push(h);
  }
  return out;
})())`;

/* Every element under #loading, and #loading itself: the background image of
 * it and its two pseudo elements, and every image element. */
const PICTURES = `(() => {
  const root = document.getElementById('loading');
  const all = [root, ...root.querySelectorAll('*')];
  const painted = [];
  for (const n of all) {
    for (const pseudo of [null, '::before', '::after']) {
      const bg = getComputedStyle(n, pseudo).backgroundImage;
      if (bg && bg !== 'none' && /url\\(/.test(bg)) {
        painted.push((n.id || n.className || n.tagName) + (pseudo || '') + ' ' + bg.slice(0, 60));
      }
    }
  }
  const media = [...root.querySelectorAll('img, picture, video, canvas, object, embed, iframe')]
    .map((n) => n.className + ' ' + (n.getAttribute('src') || ''));
  return JSON.stringify({ media, painted });
})()`;

const SIZES = [
  { label: 'desktop 1440 by 900', width: 1440, height: 900, art: 'wide.webp', map: 'swiss2' },
  { label: 'phone 390 by 844', width: 390, height: 844, art: 'tall.webp', map: 'swiss2', touch: true, phone: true },
  { label: 'Itaipu, desktop 1440 by 900', width: 1440, height: 900, art: 'wide.webp', map: 'itaipu', url: '/index.html?map=itaipu' },
];

for (const size of SIZES) {
  console.log(`\n${size.label}`);
  const page = await openPage({
    root, width: size.width, height: size.height, touch: Boolean(size.touch), seed: [RECORDER],
    url: size.url || '/index.html',
  });
  try {
    await page.until('window.__bootLog && window.__bootLog.samples.length > 0', 30000);
    const pictures = JSON.parse(await page.evaluate(PICTURES));
    check('the boot screen paints no background picture anywhere in it', pictures.painted.length === 0, pictures.painted.join(' | '));
    check('and its only image elements are the drone and the map plate', pictures.media.every((m) => /^pdcs-drone |^pdcs-map /.test(m)),
      pictures.media.join(' | '));
    const aria = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const t = document.querySelector('#loading .loading-track');
      return { role: t.getAttribute('role'), min: t.getAttribute('aria-valuemin'), max: t.getAttribute('aria-valuemax'),
        label: t.getAttribute('aria-label') };
    })())`));
    check('the bar is a progressbar from 0 to 100 with a label', aria.role === 'progressbar' && aria.min === '0'
      && aria.max === '100' && Boolean(aria.label), JSON.stringify(aria));
    const flag = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('#loading .py-flag')].map((f) => {
      const r = f.getBoundingClientRect();
      const bands = [...f.children].map((c) => ({ top: c.getBoundingClientRect().top, bg: getComputedStyle(c).backgroundColor }));
      return { w: r.width, h: r.height, bands };
    }))`));
    const flagOk = flag.length >= 1 && flag.every((f) => f.w === 0 || (f.w > f.h && f.bands.length === 3
      && f.bands[0].bg === 'rgb(213, 43, 30)' && f.bands[1].bg === 'rgb(244, 244, 240)' && f.bands[2].bg === 'rgb(0, 56, 168)'
      && f.bands[0].top < f.bands[1].top && f.bands[1].top < f.bands[2].top));
    check('every flag marker is horizontal, red over white over blue', flagOk, JSON.stringify(flag.map((f) => [f.w, f.h])));

    /* Mid load: nothing sideways, and on the phone a 16 px gutter for the
     * header, the column and the footer. */
    const lay = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
      return { sw: document.documentElement.scrollWidth, w: innerWidth,
        head: box('#loading .pdcs-head'), col: box('#loading .loading-col'), status: box('#loading .loading-status') };
    })())`));
    check('mid load, nothing scrolls sideways', lay.sw <= lay.w, `${lay.sw} in ${lay.w}`);
    if (size.phone) {
      const inside = (b) => b[0] >= 16 && b[1] <= lay.w - 16;
      check('and the header, the column and the status keep a 16 px gutter', inside(lay.head) && inside(lay.col) && inside(lay.status),
        JSON.stringify(lay));
    }

    /* The two column screens stack on a phone. Checked on whichever of
     * them the load reaches next, while it is up. */
    if (size.phone) {
      await page.until("['2', '3', '4'].includes(document.getElementById('loading').dataset.screen) || document.getElementById('loading').hidden", 240000);
      const stack = JSON.parse(await page.evaluate(`JSON.stringify((() => {
        const r = document.getElementById('loading');
        const s = r.querySelector('.pdcs-screen[data-n="' + r.dataset.screen + '"]');
        if (!s || r.hidden) { return null; }
        const side = s.querySelector('.pdcs-side').getBoundingClientRect();
        const vis = s.querySelector('.pdcs-visual').getBoundingClientRect();
        return { screen: r.dataset.screen, sideBottom: Math.round(side.bottom), visTop: Math.round(vis.top), sw: document.documentElement.scrollWidth, w: innerWidth };
      })())`));
      check('on the phone the rows and the picture stack, and nothing scrolls sideways', stack === null
        || (stack.visTop >= stack.sideBottom && stack.sw <= stack.w), JSON.stringify(stack));
    }

    await page.until("document.getElementById('loading').hidden", 300000);
    const log = JSON.parse(await page.evaluate(`JSON.stringify({ samples: window.__bootLog.samples,
      hiddenAt: window.__bootLog.hiddenAt, texts: [...window.__bootLog.texts], pictures: window.__bootLog.pictures })`));
    const rows = JSON.parse(await page.evaluate(ROW_HISTORY));
    const values = log.samples.map((s) => Number(s.v)).filter((v) => Number.isFinite(v));
    const backwards = values.findIndex((v, i) => i > 0 && v < values[i - 1]);
    check('the value never goes backwards', backwards < 0, backwards < 0 ? '' : values.slice(Math.max(0, backwards - 2), backwards + 2).join(','));
    check('it moves through the load', new Set(values).size >= 4, `${new Set(values).size} values`);
    const shown = log.samples.filter((s) => !s.hidden);
    const last = shown[shown.length - 1];
    check('it reaches 100 before the screen goes, and the number says so', last && last.v === '100' && last.pct === '100%',
      last ? `${last.v} ${last.pct}` : 'no sample');
    check('and the number always matches the value', log.samples.every((s) => s.pct === `${s.v}%`),
      log.samples.filter((s) => s.pct !== `${s.v}%`).slice(0, 2).map((s) => `${s.v}/${s.pct}`).join(' '));
    check('then the screen hides', log.hiddenAt !== null && await page.evaluate('window.__loading.root.hidden === true'));

    const screens = log.samples.map((s) => Number(s.screen));
    const screenBack = screens.findIndex((v, i) => i > 0 && v < screens[i - 1]);
    const seen = [...new Set(screens)];
    check('the screens only move forward, and a cold boot shows all four', screenBack < 0 && [1, 2, 3, 4].every((n) => seen.includes(n)),
      seen.join(','));
    const heads = [...new Set(log.samples.map((s) => s.head.trim()))];
    const headOk = heads.every((h) => /^\[ 0([1-4]) \] (Initial boot|System check|Map loading|Finalizing)$/.test(h));
    check('the header names each screen as [ 0n ] and its stage', headOk, heads.join(' | '));

    const stages = [...new Set(log.samples.map((s) => s.stage))];
    const unknown = stages.filter((s) => s !== 'loading' && !DOING.includes(s) && !/^still /i.test(s));
    check('the status line names only the real stages', unknown.length === 0, unknown.join(' | '));
    check('and at least three of them', stages.filter((s) => DOING.includes(s)).length >= 3, stages.join(' | '));
    const bad = log.texts.filter((t) => /["“”]/.test(t) || JOKE_WORDS.test(t) || FORBIDDEN.test(t));
    check('no line on the screen is a joke or names Betaflight at any point of the load', bad.length === 0, bad.slice(0, 1).join('').slice(0, 120));
    const build = await page.evaluate("document.querySelector('#loading .loading-build').textContent");
    check('the build line is there', /build/i.test(build), build);

    /* The rows. */
    const hist = (group, row) => rows.filter((h) => h.group === group && h.row === row);
    const firstAt = (group, row, state) => {
      for (const h of hist(group, row)) {
        const k = h.states.indexOf(state);
        if (k >= 0) {
          /* A state is entered at the record that replaced the one before
           * it, so its time is the previous record's. */
          return k === 0 ? -Infinity : h.times[k - 1];
        }
      }
      return null;
    };
    const simAt = log.samples.find((s) => s.stage === str('loading.starting_the_flight_controller'));
    const physOk = firstAt('system', 'physics', 'ready');
    const fcOk = firstAt('system', 'fc', 'ready');
    check('the physics engine says OK only after the simulator stage began', physOk !== null && simAt && physOk >= simAt.t,
      `ok at ${Math.round(physOk)}, sim at ${simAt ? Math.round(simAt.t) : 'never'}`);
    check('and the flight controller only after the physics engine', fcOk !== null && fcOk >= physOk, `${Math.round(fcOk)} after ${Math.round(physOk)}`);
    check('input devices say OK', firstAt('system', 'input', 'ready') !== null);
    const audioStates = hist('system', 'audio').flatMap((h) => h.states);
    check('the audio system never says OK on a boot (it waits for a gesture)', !audioStates.includes('ready') && audioStates.includes('standby'),
      audioStates.join(','));
    const online = hist('system', 'online').flatMap((h) => h.states);
    check('online services say N/A on a boot with no track link', online[online.length - 1] === 'na', online.join(','));

    const declared = JSON.parse(await page.evaluate(`import('/src/maps/${size.map}.js').then((m) => JSON.stringify(m.PHASES))`));
    const mapRows = rows.filter((h) => h.group === 'map');
    const mapIds = [...new Set(mapRows.map((h) => h.row))];
    const wanted = declared.filter((ph) => ph !== 'shaders');
    check(`the map rows are the phases ${size.map} declares`, JSON.stringify(mapIds) === JSON.stringify(wanted),
      `${mapIds.join(',')} vs ${wanted.join(',')}`);
    const notRun = wanted.filter((ph) => {
      const states = hist('map', ph).flatMap((h) => h.states);
      const k = states.indexOf('loading');
      return k < 0 || states.indexOf('ready') < k || states[states.length - 1] !== 'ready';
    });
    check('and every one was LOADING before it said OK, and ends OK', notRun.length === 0, notRun.join(','));
    const finals = ['shaders', 'world', 'frame'].filter((r) => {
      const states = hist('final', r).flatMap((h) => h.states);
      return !states.includes('loading') || states[states.length - 1] !== 'ready';
    });
    check('the finalizing rows each ran and end OK', finals.length === 0, finals.join(','));

    /* The world fetches its own textures under the boot screen; what the
     * screen itself shows is its image elements. */
    const shownPics = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('#loading img')]
      .map((n) => n.getAttribute('src')).filter(Boolean))`));
    const poster = `assets/posters/${size.map}.jpg`;
    check('the screen\'s pictures are the drone and this map\'s own poster', shownPics.length === 2
      && shownPics.includes('assets/boot/drone.svg') && shownPics.includes(poster), shownPics.join(', '));

    /* The key art. */
    await page.until("document.querySelector('.screen-title.has-art')", 60000).catch(() => {});
    const art = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const a = document.querySelector('.screen-title .title-art');
      return {
        gate: window.__ui.onGate(),
        hasArt: document.querySelector('.screen-title').classList.contains('has-art'),
        shown: a ? getComputedStyle(a).display !== 'none' : false,
        fallback: a ? getComputedStyle(a).backgroundColor : '',
        picture: a ? getComputedStyle(a, '::before').backgroundImage : '',
        scrim: a ? getComputedStyle(a, '::after').backgroundImage : '',
        copyOver: Number(getComputedStyle(document.querySelector('.screen-title .title-copy')).zIndex) > Number(a ? getComputedStyle(a).zIndex : 0),
        requests: window.__bootLog.pictures.filter((p) => /assets\\/(keyart|loading)\\//.test(p.name)),
      };
    })())`));
    check('the title is on its gate, with the key art on', art.gate && art.hasArt && art.shown, JSON.stringify([art.gate, art.hasArt, art.shown]));
    check(`the picture is the one for this shape, ${size.art}`, art.picture.includes(`assets/keyart/${size.art}`), art.picture.slice(0, 80));
    check('over the art\'s own dark fallback colour', art.fallback === 'rgb(12, 14, 13)', art.fallback);
    check('under a scrim, under the cards', art.scrim.includes('linear-gradient') && art.copyOver, art.scrim.slice(0, 40));
    const early = art.requests.filter((r) => r.start < log.hiddenAt || /assets\/loading\//.test(r.name));
    check('and nothing of it was asked for while the boot screen was up', art.requests.length >= 1 && early.length === 0,
      JSON.stringify({ hiddenAt: Math.round(log.hiddenAt), requests: art.requests.map((r) => `${r.name}@${Math.round(r.start)}`) }));
    check('the gate scrolls nothing sideways', await page.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    const errs = page.errors.filter((x) => !x.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));

    if (size.map !== 'swiss2') {
      continue;
    }

    /* A short load, and a long one, decided by their plans. */
    const plan = (ids, worldMs) => page.evaluate(`import('/src/ui/loading.js').then((m) => {
      const L = window.__loading;
      L.run(m.planStages(${JSON.stringify(ids)}, ${worldMs}));
      L.start(${JSON.stringify(ids[0])});
      const r = L.root;
      const visible = [...r.querySelectorAll('.pdcs-screen')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.dataset.n);
      const out = JSON.stringify({ minimal: r.classList.contains('is-minimal'), visible });
      L.finish();
      return out;
    })`);
    const short = JSON.parse(await plan(['module', 'world', 'frame'], 900));
    check('a load planned short shows the first screen alone', short.minimal && short.visible.join() === '1', JSON.stringify(short));
    const long = JSON.parse(await plan(['module', 'world', 'frame'], 2500));
    check('one planned long shows its own screen', !long.minimal && long.visible.join() === '3', JSON.stringify(long));
    await page.until("document.getElementById('loading').hidden", 5000).catch(() => {});

    /* Reduced motion: the sweep and the blink stop. */
    await page.cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    }, page.sessionId);
    const still = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const li = document.querySelector('#loading .pdcs-rows li');
      const was = li.dataset.state;
      li.dataset.state = 'loading';
      const sweep = getComputedStyle(document.querySelector('#loading .loading-sweep'));
      const blink = getComputedStyle(li.querySelector('.pdcs-row-state')).animationName;
      li.dataset.state = was;
      return { sweep: sweep.animationName === 'none' && sweep.opacity === '0', blink };
    })())`));
    check('under reduced motion the sweep and the blink are still', still.sweep && still.blink === 'none', JSON.stringify(still));

    /* The dead end. */
    await page.evaluate("(() => { window.__loading.fail('boot-loader-check: a made up failure'); return true; })()");
    const dead = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const r = document.getElementById('loading');
      return { shown: !r.hidden, error: r.querySelector('.loading-error').textContent,
        errorShown: !r.querySelector('.loading-error').hidden, help: !r.querySelector('.loading-help').hidden,
        pct: getComputedStyle(r.querySelector('.loading-meta')).display, sw: document.documentElement.scrollWidth, w: innerWidth };
    })())`));
    check('fail() shows the message and the way out, and no number beside the dead bar',
      dead.shown && dead.errorShown && /made up failure/.test(dead.error) && dead.help && dead.pct === 'none',
      JSON.stringify(dead));
    check('and the failure scrolls nothing sideways', dead.sw <= dead.w, `${dead.sw} in ${dead.w}`);
  } finally {
    await page.close();
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
