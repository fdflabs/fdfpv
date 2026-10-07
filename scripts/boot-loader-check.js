/*
 * boot-loader-check.js: the boot screen is the owner's PDCS bootloader, every
 * row on it is a real step, the same overlay comes back for a world swap and
 * a room link being retried, and the title stands on the same ground.
 *
 * The owner, 2 October: the very first loading screen should not show
 * Itaipu, because it comes back on every load and is not representative of
 * the whole game; no jokes; a simulation system initializing. The owner, 3
 * October, the bootloader spec itself: its markup, ids, class names, CSS
 * values and controller API; four screens (initial boot, system check, map
 * loading, finalizing) with the rows it names; branding subdued to PDCS and
 * a flag marker that is always horizontal, red over white over blue; a fast
 * load shows only the mark, INITIALIZING and a bar; progress is real work,
 * never a timer; the wireframe is the in-game drone; the map preview is the
 * map's; the same overlay for cold boot, map loading, reconnects and long
 * restarts. This drives the real shell in headless Chromium and holds all of
 * it:
 *
 * THE SPEC'S STRUCTURE. Every id and class the spec's markup names is on
 * the page, its controller API is window.loader (and window.__loading, the
 * same object), and the computed values of its CSS are the spec's.
 *
 * A RECORDED LOAD, at a desktop window and an upright phone, and once more
 * on Itaipu. A recorder installed before the page's first script logs every
 * change to the overlay, every row's every state from the mutation records
 * themselves (so a state set and replaced inside one task is still seen),
 * the stage the load was in at each, and every picture it asks for. The
 * screens only move forward, 1, 2, 3, 4 on a cold boot, and the header names
 * each. Each of the three bars is a progressbar whose value never falls,
 * whose number agrees with it, and which ends at 100; the final bar moves in
 * quarters, one per finalizing row. No text is a joke or names Betaflight.
 * The system rows: each that says OK said LOADING first; the physics engine
 * says OK only once the simulator stage has begun, the flight controller
 * only after the physics engine; the audio system never says OK (it waits
 * for a gesture); online services say N/A on a boot with no track link. The
 * map and final rows follow the phases the map's module declares through
 * src/ui/loading.js PHASE_ROWS: a row with phases behind it was LOADING
 * before it said OK and ends OK, a row with none says N/A and nothing else.
 * The only pictures are the drone's wireframe and the map's own poster.
 *
 * THE FLAG. Every flag mark on the page, the overlay's two and the title's,
 * is three bands stacked top to bottom, each the full width of the mark and
 * a third of its height, red, white and blue by computed colour.
 *
 * THE VERSION. The footer's centre is the page's build: "Local build" on a
 * checkout, which version-check proves is never stamped, and "Build <v>"
 * read from <meta name="fdfpv-version"> on a stamped page.
 *
 * LAYOUT. Nothing scrolls sideways; on the phone the header, the content
 * and the footer keep a 16 px gutter and the two column screens stack.
 * Under reduced motion the sweep and the blink are still.
 *
 * A SHORT LOAD (posed through the API, because only a planned duration
 * decides it) shows the mark, the line and the bar and nothing else; a long
 * one shows its own screen; a cold boot never goes minimal.
 *
 * A WORLD SWAP, for real, through the shell's own swap (syncWorld, which
 * window.__setMap drives): to the Alps the minimal loader, to the Swiss
 * valley the map and finalizing screens. A ROOM
 * LINK, for real, against a rooms server in this process: a dropped socket
 * holds the minimal loader saying it is reconnecting, a server restart (its
 * SIGTERM close, 1012) holds it saying the server is restarting, each with
 * the attempt, and the overlay goes when the link is back.
 *
 * THE TITLE. Once the boot screen has gone, the gate stands on the boot
 * screen's own ground, under the cards, and the key art is never requested.
 *
 * And fail() still makes a readable dead end.
 *
 * Run with npm run boot:loader. SIM_GPU=1 renders on this machine's GPU.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { PHASE_ROWS } from '../src/ui/loading.js';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));

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
  const named = Object.entries(table).filter(([k, v]) => /^loading\.(pdcs|state|row|held|foot)_/.test(k) && FORBIDDEN.test(v));
  check(`${f}: no bootloader string names Betaflight`, named.length === 0, named.map(([k]) => k).join(', '));
}
const loadingSrc = await readFile(join(root, 'src/ui/loading.js'), 'utf8');
const uiSrc = await readFile(join(root, 'src/ui/ui.js'), 'utf8');
const html = await readFile(join(root, 'index.html'), 'utf8');
check('loading.js keeps no joke list and no joke timer', !/JOKE|quotedJoke/.test(loadingSrc));
check('ui.js imports no joke', !/JOKE|quotedJoke|waitJoke/.test(uiSrc));
check('index.html has no joke element and no tagline', !/loading-joke|map-reel-wait-joke|loading-tag/.test(html));
check('index.html asks for no picture in its head', !/rel="preload" as="image"/.test(html));
const loaderMarkup = (html.match(/<div id="pdcs-loader"[\s\S]*?<script type="module"/) || [''])[0];
check('the boot screen\'s markup never names Betaflight', loaderMarkup.length > 0 && !FORBIDDEN.test(loaderMarkup));
/* Note 4, no fake timers: nothing in the controller aims a bar on a clock.
 * The one interval is the stall line's, and it writes no bar and no row. */
const intervals = [...loadingSrc.matchAll(/setInterval\(([^;]*)/g)].map((m) => m[1]);
check('the controller moves no bar on a timer: its one interval is the stall line', intervals.length === 1
  && /paintStall/.test(intervals[0]) && !/creep/i.test(loadingSrc), intervals.join(' | '));

/* The stage lines a stall may show, read from loading.js through the
 * string table the same way the page does. */
const { str } = await import(join(root, 'src/strings/index.js'));
const doingBlock = (loadingSrc.match(/const STAGE_DOING = \{([\s\S]*?)\};/) || ['', ''])[1];
const DOING = [...doingBlock.matchAll(/str\('(loading\.[a-z_]+)'\)/g)].map((m) => str(m[1]));
check('loading.js names six stages in words', DOING.length >= 6, DOING.join(' | '));

/* The spec's markup, by id and by class. */
const SPEC_IDS = [
  'pdcs-loader', 'loader-stage-number', 'loader-stage-name', 'screen-boot', 'screen-check', 'screen-map', 'screen-final',
  'boot-progress', 'boot-progress-text', 'map-title', 'map-progress', 'map-progress-text', 'map-preview',
  'final-progress', 'final-progress-text', 'sys-flight', 'sys-physics', 'sys-input', 'sys-audio', 'sys-telemetry', 'sys-online',
  'map-terrain', 'map-satellite', 'map-height', 'map-buildings', 'map-vegetation', 'map-roads',
  'final-world', 'final-core', 'final-env', 'final-scene', 'loader-footer-left', 'loader-footer-center', 'loader-footer-right',
];
const SPEC_CLASSES = [
  'pdcs-loader', 'loader-noise', 'loader-grid', 'loader-header', 'loader-stage', 'loader-brand', 'py-flag', 'loader-content',
  'loader-screen', 'initial-center', 'pdcs-mark', 'core-name', 'py-flag-center', 'boot-action', 'progress-row', 'progress-track',
  'progress-fill', 'systems-layout', 'systems-list', 'system-row', 'drone-wireframe', 'map-layout', 'map-preview', 'final-layout',
  'final-reticle', 'loader-footer',
];
const SPEC_API = ['show', 'hide', 'stage', 'setProgress', 'progress', 'mapProgress', 'finalProgress', 'status', 'system',
  'mapSystem', 'finalSystem', 'complete'];

/*
 * Installed before the page's first script. Samples: the screen, the
 * header, each bar's value and number, the button line, the status line
 * and the stage the load is in, after every change. Rows: every data-state
 * change as a record, with its old value, so the full sequence of states
 * each row went through can be rebuilt. Pictures: every resource under
 * assets/, from an observer, because the shell's module graph fills the
 * page's resource timing buffer long before the title.
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
  const text = (root, sel) => (root.querySelector(sel) || {}).textContent || '';
  const bar = (root, id) => {
    const fill = root.querySelector('#' + id + '-progress');
    return { v: fill ? fill.parentElement.getAttribute('aria-valuenow') : null, pct: text(root, '#' + id + '-progress-text').trim() };
  };
  const sample = (root) => {
    log.texts.add(root.textContent);
    const L = window.__loading;
    log.samples.push({
      t: performance.now(),
      boot: bar(root, 'boot'), map: bar(root, 'map'), final: bar(root, 'final'),
      action: text(root, '.boot-action'),
      status: text(root, '.loader-status'),
      stageId: L && L.index >= 0 && L.stages[L.index] ? L.stages[L.index].id : '',
      screen: root.dataset.screen || '',
      active: [...root.querySelectorAll('.loader-screen.active')].map((s) => s.id).join(','),
      head: text(root, '#loader-stage-number') + ' ' + text(root, '#loader-stage-name'),
      minimal: root.classList.contains('is-minimal'),
      held: root.classList.contains('is-held'),
      hidden: root.hidden,
    });
    if (root.hidden && log.hiddenAt === null) {
      log.hiddenAt = performance.now();
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('pdcs-loader');
    if (!root) {
      return;
    }
    sample(root);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'data-state' && r.target.dataset && r.target.dataset.row) {
          const group = r.target.closest('[data-group]');
          log.rows.push({ t: performance.now(), group: group ? group.dataset.group : '',
            row: r.target.dataset.row, old: r.oldValue, el: r.target });
        }
      }
      sample(root);
    }).observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
    });
  });
})();`;

/* Every row's states in order since the log was last cut, rebuilt from
 * the records: each record's old value, then the value the row holds now. */
const ROW_HISTORY = `JSON.stringify((() => {
  const out = new Map();
  for (const r of window.__bootLog.rows) {
    const key = r.group + ':' + r.row;
    if (!out.has(key)) {
      out.set(key, { group: r.group, row: r.row, states: [], times: [], el: r.el });
    }
    const h = out.get(key);
    h.states.push(r.old);
    h.times.push(r.t);
  }
  return [...out.values()].map((h) => ({ group: h.group, row: h.row, states: [...h.states, h.el.dataset.state], times: [...h.times, Infinity] }));
})())`;

/* Every element under the overlay, and the overlay itself: the background
 * image of it and its two pseudo elements, and every image element. */
const PICTURES = `(() => {
  const root = document.getElementById('pdcs-loader');
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
    .map((n) => n.parentElement.className + ' ' + (n.getAttribute('src') || ''));
  return JSON.stringify({ media, painted });
})()`;

/* Every flag mark on the page that is drawn: its box inside the border,
 * and each band's box and colour. */
const FLAGS = `JSON.stringify([...document.querySelectorAll('.py-flag')].filter((f) => f.getBoundingClientRect().width > 0).map((f) => {
  const r = f.getBoundingClientRect();
  const cs = getComputedStyle(f);
  const bx = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const by = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  return { where: f.closest('#pdcs-loader') ? (f.classList.contains('py-flag-center') ? 'centre' : 'header') : 'title',
    w: r.width - bx, h: r.height - by,
    bands: [...f.children].map((c) => { const b = c.getBoundingClientRect(); return { top: b.top, w: b.width, h: b.height, bg: getComputedStyle(c).backgroundColor }; }) };
}))`;
const FLAG_COLOURS = ['rgb(213, 43, 30)', 'rgb(244, 244, 240)', 'rgb(0, 56, 168)'];
function flagsOk(flags) {
  return flags.length >= 1 && flags.every((f) => f.w > f.h && f.bands.length === 3
    && f.bands.every((b, i) => b.bg === FLAG_COLOURS[i] && Math.abs(b.w - f.w) < 0.6 && Math.abs(b.h - f.h / 3) < 0.6)
    && f.bands[0].top < f.bands[1].top && f.bands[1].top < f.bands[2].top);
}

/* The rows the map's declared phases put behind each map and final row,
 * per src/ui/loading.js PHASE_ROWS. */
function behind(declared) {
  const out = {};
  for (const ph of declared) {
    for (const key of PHASE_ROWS[ph] || []) {
      (out[key] = out[key] || []).push(ph);
    }
  }
  return out;
}

const SIZES = [
  { label: 'desktop 1440 by 900', width: 1440, height: 900, map: 'swiss2' },
  { label: 'phone 390 by 844', width: 390, height: 844, map: 'swiss2', touch: true, phone: true },
  { label: 'Itaipu, desktop 1440 by 900', width: 1440, height: 900, map: 'itaipu', url: '/index.html?map=itaipu' },
];

/* What a load's samples say about its three bars. */
function barsOk(samples, label) {
  for (const key of ['boot', 'map', 'final']) {
    const values = samples.map((s) => Number(s[key].v)).filter((v) => Number.isFinite(v));
    const back = values.findIndex((v, i) => i > 0 && v < values[i - 1]);
    check(`${label}: the ${key} bar never goes backwards`, back < 0, back < 0 ? '' : values.slice(Math.max(0, back - 2), back + 2).join(','));
    check(`${label}: and its number always matches it`, samples.every((s) => s[key].pct === `${s[key].v}%`),
      samples.filter((s) => s[key].pct !== `${s[key].v}%`).slice(0, 2).map((s) => `${s[key].v}/${s[key].pct}`).join(' '));
  }
}

for (const size of SIZES) {
  console.log(`\n${size.label}`);
  const page = await openPage({
    root, width: size.width, height: size.height, touch: Boolean(size.touch), seed: [RECORDER],
    url: size.url || '/index.html',
  });
  try {
    await page.until('window.__bootLog && window.__bootLog.samples.length > 0 && window.loader', 30000);
    const pictures = JSON.parse(await page.evaluate(PICTURES));
    check('the boot screen paints no background picture anywhere in it', pictures.painted.length === 0, pictures.painted.join(' | '));
    check('and its only image elements are the drone and the map plate', pictures.media.every((m) => /^drone-wireframe |^map-preview /.test(m)),
      pictures.media.join(' | '));
    const aria = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('#pdcs-loader [id$="-progress"]')].map((f) => {
      const t = f.parentElement;
      return { role: t.getAttribute('role'), min: t.getAttribute('aria-valuemin'), max: t.getAttribute('aria-valuemax'), label: t.getAttribute('aria-label') };
    }))`));
    check('each of the three bars is a progressbar from 0 to 100 with a label', aria.length === 3 && aria.every((a) => a.role === 'progressbar'
      && a.min === '0' && a.max === '100' && Boolean(a.label)), JSON.stringify(aria));
    const flags = JSON.parse(await page.evaluate(FLAGS));
    check('every flag mark is horizontal: three full width bands, a third high each, red over white over blue', flagsOk(flags),
      JSON.stringify(flags.map((f) => [f.where, f.w, f.h, f.bands.map((b) => [b.w, b.h])])));

    if (size === SIZES[0]) {
      const spec = JSON.parse(await page.evaluate(`JSON.stringify((() => {
        const r = document.getElementById('pdcs-loader');
        const cs = (sel, pseudo) => getComputedStyle(typeof sel === 'string' ? r.querySelector(sel) || document.querySelector(sel) : sel, pseudo || null);
        return {
          ids: ${JSON.stringify(SPEC_IDS)}.filter((id) => !document.getElementById(id)),
          classes: ${JSON.stringify(SPEC_CLASSES)}.filter((c) => !document.querySelector('#pdcs-loader.' + c + ', #pdcs-loader .' + c)),
          api: ${JSON.stringify(SPEC_API)}.filter((k) => typeof window.loader[k] !== 'function'),
          same: window.loader === window.__loading,
          mark: r.querySelector('.pdcs-mark').textContent.trim(),
          action: r.querySelector('.boot-action').textContent.trim(),
          core: [...r.querySelectorAll('.loader-brand > span, .core-name')].map((n) => n.textContent.trim()),
          z: cs(r).zIndex, bg: cs(r).backgroundColor, ground: cs(r).backgroundImage.slice(0, 15), font: cs(r).fontFamily,
          head: [cs('.loader-header').top, cs('.loader-header').left, cs('.loader-header').fontSize, cs('.loader-header').letterSpacing],
          content: [cs('.loader-content').top, cs('.loader-content').bottom],
          track: cs('.progress-track').height, fill: cs('#boot-progress').backgroundColor,
          row: [cs('.system-row').paddingTop, cs('.system-row').fontSize, cs('.system-row').borderBottomColor],
          foot: [cs('.loader-footer').fontSize, cs('.loader-footer').bottom, cs('.loader-footer').borderTopColor],
          grid: [cs('.loader-grid').opacity, cs('.loader-grid').backgroundSize],
          reticle: [cs('.final-reticle div').width, cs('.final-reticle div', '::before').width, cs('.final-reticle div', '::after').height],
          fade: cs(r).transitionDuration,
        };
      })())`));
      console.log('the spec\'s structure');
      check('every id the spec\'s markup names is on the page', spec.ids.length === 0, spec.ids.join(', '));
      check('and every class', spec.classes.length === 0, spec.classes.join(', '));
      check('window.loader carries the spec\'s whole controller API, and is window.__loading', spec.api.length === 0 && spec.same,
        spec.api.join(', '));
      check('the mark is the spec\'s triangle, the line INITIALIZING..., the brand PDCS // SIMULATION CORE',
        spec.mark === '△' && /^initializing\.\.\.$/i.test(spec.action) && spec.core.every((c) => /^pdcs \/\/ simulation core$/i.test(c)),
        JSON.stringify([spec.mark, spec.action, spec.core]));
      check('the overlay is over everything, on the spec\'s graphite and gradient, in Plex Mono',
        spec.z === '999999' && spec.bg === 'rgb(7, 9, 10)' && spec.ground.startsWith('radial-gradien') && /Plex Mono/.test(spec.font),
        JSON.stringify([spec.z, spec.bg, spec.font]));
      check('the header, the content and the footer sit where the spec puts them',
        JSON.stringify(spec.head) === JSON.stringify(['26px', '34px', '11px', '1.76px'])
        && JSON.stringify(spec.content) === JSON.stringify(['90px', '70px'])
        && spec.foot[0] === '9px' && spec.foot[1] === '24px' && spec.foot[2] === 'rgba(220, 225, 225, 0.28)', JSON.stringify([spec.head, spec.content, spec.foot]));
      check('the bars, the rows, the grid and the reticle are the spec\'s', spec.track === '5px' && spec.fill === 'rgb(214, 221, 221)'
        && JSON.stringify(spec.row) === JSON.stringify(['10px', '12px', 'rgba(220, 225, 225, 0.08)'])
        && spec.grid[0] === '0.22' && spec.grid[1] === '100px 100px, 100px 100px'
        && JSON.stringify(spec.reticle) === JSON.stringify(['80px', '140px', '140px']) && spec.fade === '0.4s',
      JSON.stringify([spec.track, spec.fill, spec.row, spec.grid, spec.reticle, spec.fade]));
      const font = await page.evaluate("document.fonts.ready.then(() => document.fonts.check('12px \"PDCS Plex Mono\"') && [...document.fonts].some((f) => f.family.includes('PDCS Plex Mono') && f.status === 'loaded'))");
      check('the face is loaded from the page\'s own copy of IBM Plex Mono', font === true);
      const build = await page.evaluate("document.getElementById('loader-footer-center').textContent");
      check('the footer\'s centre is this page\'s build: a checkout says Local build, never a made up number', build === str('loading.local_build'), build);
      const stamped = await page.evaluate(`import('/src/ui/loading.js').then((m) => {
        const meta = document.createElement('meta');
        meta.name = 'fdfpv-version';
        meta.content = 'a1b2c3d4e5f6';
        document.head.append(meta);
        const clone = document.getElementById('pdcs-loader').cloneNode(true);
        clone.id = 'pdcs-loader-copy';
        new m.Loading(clone);
        meta.remove();
        return clone.querySelector('#loader-footer-center').textContent;
      })`);
      check('and a stamped page says the stamp it carries', stamped === str('loading.build', { version: 'a1b2c3d4e5f6' }), stamped);
      const foot = await page.evaluate("[...document.querySelectorAll('.loader-footer span')].map((n) => n.id + '=' + n.textContent.trim()).join(' ')");
      check('the footer reads status, version, BOOTLOADER', /^loader-footer-left=Sys init loader-footer-center=\S.* loader-footer-right=BOOTLOADER$/i.test(foot), foot);
    }

    /* Mid load: nothing sideways, and on the phone a 16 px gutter for the
     * header, the content and the footer. */
    const lay = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
      return { sw: document.documentElement.scrollWidth, w: innerWidth,
        head: box('#pdcs-loader .loader-header'), col: box('#pdcs-loader .loader-content'), foot: box('#pdcs-loader .loader-footer') };
    })())`));
    check('mid load, nothing scrolls sideways', lay.sw <= lay.w, `${lay.sw} in ${lay.w}`);
    if (size.phone) {
      const inside = (b) => b[0] >= 16 && b[1] <= lay.w - 16;
      check('and the header, the content and the footer keep a 16 px gutter', inside(lay.head) && inside(lay.col) && inside(lay.foot),
        JSON.stringify(lay));
      await page.until("['2', '3', '4'].includes(document.getElementById('pdcs-loader').dataset.screen) || document.getElementById('pdcs-loader').hidden", 240000);
      const stack = JSON.parse(await page.evaluate(`JSON.stringify((() => {
        const r = document.getElementById('pdcs-loader');
        const s = r.querySelector('.loader-screen.active');
        if (!s || r.hidden || s.id === 'screen-boot') { return null; }
        const grid = s.firstElementChild;
        const side = grid.firstElementChild.getBoundingClientRect();
        const vis = grid.lastElementChild.getBoundingClientRect();
        return { screen: s.id, sideBottom: Math.round(side.bottom), visTop: Math.round(vis.top), sw: document.documentElement.scrollWidth, w: innerWidth };
      })())`));
      check('on the phone the rows and the picture stack, and nothing scrolls sideways', stack === null
        || (stack.visTop >= stack.sideBottom && stack.sw <= stack.w), JSON.stringify(stack));
    }

    await page.until("document.getElementById('pdcs-loader').hidden", 300000);
    const log = JSON.parse(await page.evaluate(`JSON.stringify({ samples: window.__bootLog.samples,
      hiddenAt: window.__bootLog.hiddenAt, texts: [...window.__bootLog.texts], pictures: window.__bootLog.pictures })`));
    const rows = JSON.parse(await page.evaluate(ROW_HISTORY));
    barsOk(log.samples, 'the cold boot');
    const all = log.samples.flatMap((s) => [s.boot.v, s.map.v, s.final.v]);
    check('the bars move through the load', new Set(all).size >= 6, `${new Set(all).size} values`);
    const shown = log.samples.filter((s) => !s.hidden);
    const last = shown[shown.length - 1];
    check('every bar reaches 100 before the screen goes, and its number says so', last && ['boot', 'map', 'final']
      .every((k) => last[k].v === '100' && last[k].pct === '100%'), last ? JSON.stringify([last.boot, last.map, last.final]) : 'no sample');
    const finals = [...new Set(log.samples.map((s) => Number(s.final.v)))];
    check('the final bar moves in quarters, one per finalizing row', finals.every((v) => v % 25 === 0), finals.join(','));
    check('then the screen hides', log.hiddenAt !== null && await page.evaluate('window.__loading.root.hidden === true'));

    const screens = log.samples.map((s) => Number(s.screen));
    const screenBack = screens.findIndex((v, i) => i > 0 && v < screens[i - 1]);
    const seen = [...new Set(screens)];
    check('the screens only move forward, and a cold boot shows all four', screenBack < 0 && [1, 2, 3, 4].every((n) => seen.includes(n)),
      seen.join(','));
    const ACTIVE = { 1: 'screen-boot', 2: 'screen-check', 3: 'screen-map', 4: 'screen-final' };
    check('and exactly that screen is the active section each time', log.samples.every((s) => s.active === ACTIVE[s.screen]),
      [...new Set(log.samples.map((s) => `${s.screen}:${s.active}`))].join(' '));
    const heads = [...new Set(log.samples.map((s) => s.head.trim()))];
    const headOk = heads.every((h) => /^\[ 0([1-4]) \] (Initial boot|System check|Map loading|Finalizing)$/i.test(h));
    check('the header names each screen as [ 0n ] and its stage', headOk, heads.join(' | '));
    check('a cold boot is never the minimal loader', log.samples.every((s) => !s.minimal));

    const lines = [...new Set(log.samples.map((s) => s.status))].filter(Boolean);
    const unknown = lines.filter((s) => !/^still loading the /i.test(s));
    check('the status line says nothing but a stage that stalled', unknown.length === 0, unknown.join(' | '));
    const bad = log.texts.filter((t) => /["“”]/.test(t) || JOKE_WORDS.test(t) || FORBIDDEN.test(t));
    check('no line on the screen is a joke or names Betaflight at any point of the load', bad.length === 0, bad.slice(0, 1).join('').slice(0, 120));

    /* The rows. */
    const hist = (group, row) => rows.find((h) => h.group === group && h.row === row) || { states: [], times: [] };
    const firstAt = (group, row, state) => {
      const h = hist(group, row);
      const k = h.states.indexOf(state);
      /* A state is entered at the record that replaced the one before it,
       * so its time is the previous record's. */
      return k < 0 ? null : (k === 0 ? -Infinity : h.times[k - 1]);
    };
    const ranLoadingThenOk = (states) => {
      const k = states.indexOf('loading');
      return k >= 0 && states.indexOf('ready') > k && states[states.length - 1] === 'ready';
    };
    const simAt = log.samples.find((s) => s.stageId === 'sim');
    const physOk = firstAt('system', 'physics', 'ready');
    const fcOk = firstAt('system', 'flight', 'ready');
    check('the physics engine says OK only after the simulator stage began', physOk !== null && simAt && physOk >= simAt.t,
      `ok at ${Math.round(physOk)}, sim at ${simAt ? Math.round(simAt.t) : 'never'}`);
    check('and the flight controller only after the physics engine', fcOk !== null && fcOk >= physOk, `${Math.round(fcOk)} after ${Math.round(physOk)}`);
    const sysRan = ['flight', 'physics', 'input', 'telemetry'].filter((r) => !ranLoadingThenOk(hist('system', r).states));
    check('flight controller, physics, input devices and telemetry each said LOADING, then OK', sysRan.length === 0,
      sysRan.map((r) => `${r}: ${hist('system', r).states.join(',')}`).join(' | '));
    const audioStates = hist('system', 'audio').states;
    check('the audio system never says OK on a boot (it waits for a gesture)', !audioStates.includes('ready') && audioStates.includes('standby'),
      audioStates.join(','));
    const online = hist('system', 'online').states;
    check('online services say N/A on a boot with no track link', online[online.length - 1] === 'na', online.join(','));

    const declared = JSON.parse(await page.evaluate(`import('/src/maps/${size.map}.js').then((m) => JSON.stringify(m.PHASES))`));
    const want = behind(declared);
    const phaseRows = [
      ...['terrain', 'satellite', 'height', 'buildings', 'vegetation', 'roads'].map((r) => `map:${r}`),
      'final:environment', 'final:scene',
    ];
    const wrong = phaseRows.filter((key) => {
      const [group, row] = key.split(':');
      const states = hist(group, row).states;
      return want[key] ? !ranLoadingThenOk(states) : (states[states.length - 1] !== 'na' || states.includes('loading') || states.includes('ready'));
    });
    const naRows = phaseRows.filter((key) => !want[key]);
    check(`the map and final rows follow the phases ${size.map} declares: LOADING then OK, or N/A where it has none (${naRows.join(', ') || 'none'})`,
      wrong.length === 0, wrong.map((k) => `${k}: ${hist(...k.split(':')).states.join(',')}`).join(' | '));
    const others = ['world', 'core'].filter((r) => !ranLoadingThenOk(hist('final', r).states));
    check('world data and the simulation core each said LOADING, then OK', others.length === 0,
      others.map((r) => `${r}: ${hist('final', r).states.join(',')}`).join(' | '));

    const shownPics = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('#pdcs-loader img')]
      .map((n) => n.getAttribute('src')).filter(Boolean))`));
    const poster = `assets/posters/${size.map}.jpg`;
    check('the screen\'s pictures are the drone and this map\'s own poster', shownPics.length === 2
      && shownPics.includes('assets/boot/drone.svg') && shownPics.includes(poster), shownPics.join(', '));

    /* The title's ground. A second after the boot screen has gone, so a
     * picture fetched once the gate has painted would be in the log. */
    await page.until('window.__ui.onGate()', 60000).catch(() => {});
    await page.sleep(1000);
    const ground = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const t = document.querySelector('.screen-title');
      const cs = getComputedStyle(t);
      const boot = getComputedStyle(document.getElementById('pdcs-loader'));
      return {
        gate: window.__ui.onGate() && t.classList.contains('is-gate'),
        colour: cs.backgroundColor,
        bootColour: boot.backgroundColor,
        image: cs.backgroundImage,
        cardsOver: Number(getComputedStyle(t.querySelector('.title-copy')).zIndex) >= 1,
        requests: window.__bootLog.pictures.filter((p) => /assets\\/(keyart|loading)\\//.test(p.name)).map((p) => p.name),
      };
    })())`));
    check('the title is on its gate, on the boot screen\'s own colour', ground.gate && ground.colour === ground.bootColour
      && ground.colour === 'rgb(7, 9, 10)', JSON.stringify([ground.gate, ground.colour, ground.bootColour]));
    check('under its grid and its radial gradient, the cards over them', /linear-gradient/.test(ground.image) && /radial-gradient/.test(ground.image)
      && ground.cardsOver, ground.image.slice(0, 60));
    check('and the key art is never asked for', ground.requests.length === 0, ground.requests.join(', '));
    check('the gate scrolls nothing sideways', await page.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    const titleFlags = JSON.parse(await page.evaluate(FLAGS)).filter((f) => f.where === 'title');
    check('the title\'s flag is the same horizontal mark', titleFlags.length === 0 || flagsOk(titleFlags),
      JSON.stringify(titleFlags.map((f) => [f.w, f.h, f.bands.map((b) => [b.w, b.h])])));
    const errs = page.errors.filter((x) => !x.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));

    if (size !== SIZES[0]) {
      continue;
    }

    /* A short load, and a long one, decided by their plans. */
    const plan = (ids, worldMs) => page.evaluate(`import('/src/ui/loading.js').then((m) => {
      const L = window.__loading;
      L.run(m.planStages(${JSON.stringify(ids)}, ${worldMs}));
      L.start(${JSON.stringify(ids[0])});
      const r = L.root;
      const shown = (sel) => [...r.querySelectorAll(sel)].some((n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden');
      const visible = [...r.querySelectorAll('.loader-screen')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.id);
      const out = JSON.stringify({ minimal: r.classList.contains('is-minimal'), visible,
        mark: shown('.pdcs-mark'), action: shown('.boot-action'), bar: shown('#boot-progress'),
        chrome: ['.loader-header', '.loader-footer', '.core-name', '.py-flag-center'].filter(shown) });
      L.finish();
      return out;
    })`);
    console.log('the minimal loader');
    const short = JSON.parse(await plan(['module', 'world', 'frame'], 900));
    check('a load planned short shows the boot screen alone', short.minimal && short.visible.join() === 'screen-boot', JSON.stringify(short));
    check('and on it the mark, INITIALIZING and the bar, with no header, footer, brand or flag',
      short.mark && short.action && short.bar && short.chrome.length === 0, JSON.stringify(short));
    const long = JSON.parse(await plan(['module', 'world', 'frame'], 2500));
    check('one planned long shows its own screen and the whole frame around it', !long.minimal && long.visible.join() === 'screen-map'
      && long.chrome.length === 2, JSON.stringify(long));
    const coldAlps = JSON.parse(await plan(['three', 'board', 'sim', 'module', 'world', 'frame'], 917));
    check('and a cold boot of the Alps, the shortest world, is never minimal', !coldAlps.minimal && coldAlps.visible.join() === 'screen-boot',
      JSON.stringify(coldAlps));
    await page.until("document.getElementById('pdcs-loader').hidden", 5000).catch(() => {});

    /* A world swap, for real. */
    const swap = async (map) => {
      await page.evaluate('window.__bootLog.samples = []; window.__bootLog.rows = []; true');
      await page.evaluate(`window.__setMap(${JSON.stringify(map)}); true`);
      await page.until(`window.__map && window.__map().id === ${JSON.stringify(map)} && window.__map().ready`, 400000);
      await page.until("document.getElementById('pdcs-loader').hidden", 30000);
      return JSON.parse(await page.evaluate('JSON.stringify(window.__bootLog.samples)'));
    };
    console.log('a world swap');
    const toAlps = await swap('alps');
    const alpsShown = toAlps.filter((s) => !s.hidden);
    check('a swap to the Alps brings the overlay up, as the minimal loader', alpsShown.length > 0 && alpsShown.every((s) => s.minimal
      && s.active === 'screen-boot'), [...new Set(alpsShown.map((s) => `${s.screen}:${s.active}:${s.minimal}`))].join(' '));
    barsOk(toAlps, 'the swap to the Alps');
    const alpsLast = alpsShown[alpsShown.length - 1];
    check('its one bar is the whole load and reaches 100', alpsLast && alpsLast.boot.v === '100', alpsLast ? alpsLast.boot.v : 'no sample');
    const toSwiss = await swap('swiss2');
    const swissShown = toSwiss.filter((s) => !s.hidden);
    const swissScreens = [...new Set(swissShown.map((s) => s.screen))];
    check('a swap to the Swiss valley shows the map and finalizing screens, not the boot ones', swissShown.length > 0
      && swissShown.every((s) => !s.minimal) && swissScreens.join() === '3,4', swissScreens.join(','));
    check('and its header says Map loading, then Finalizing', [...new Set(swissShown.map((s) => s.head.trim()))]
      .every((h) => /^\[ 0[34] \] (Map loading|Finalizing)$/i.test(h)), [...new Set(swissShown.map((s) => s.head.trim()))].join(' | '));
    barsOk(toSwiss, 'the swap to the Swiss valley');
    const swissLast = swissShown[swissShown.length - 1];
    check('its map and final bars reach 100', swissLast && swissLast.map.v === '100' && swissLast.final.v === '100',
      swissLast ? `${swissLast.map.v} ${swissLast.final.v}` : 'no sample');
    const swissFoot = await page.evaluate("document.getElementById('loader-footer-left').textContent");
    check('the footer\'s status says a map load, not a system init', swissFoot === str('loading.foot_map'), swissFoot);

    /* Reduced motion: the sweep and the blink stop. */
    await page.cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    }, page.sessionId);
    const still = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const span = document.getElementById('sys-flight');
      const was = span.className;
      span.className = 'loading';
      const sweep = getComputedStyle(document.querySelector('#pdcs-loader .progress-sweep'));
      const blink = getComputedStyle(span).animationName;
      span.className = was;
      return { sweep: sweep.animationName === 'none' && sweep.opacity === '0', blink };
    })())`));
    check('under reduced motion the sweep and the blink are still', still.sweep && still.blink === 'none', JSON.stringify(still));
    await page.cdp.send('Emulation.setEmulatedMedia', { features: [] }, page.sessionId);

    /* The dead end. */
    await page.evaluate("(() => { window.__loading.fail('boot-loader-check: a made up failure'); return true; })()");
    const dead = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const r = document.getElementById('pdcs-loader');
      return { shown: !r.hidden && !r.classList.contains('hidden'), error: r.querySelector('.loading-error').textContent,
        errorShown: !r.querySelector('.loading-error').hidden, help: !r.querySelector('.loading-help').hidden,
        numbers: [...r.querySelectorAll('[id$="-progress-text"]')].filter((n) => n.getClientRects().length > 0).length,
        sw: document.documentElement.scrollWidth, w: innerWidth };
    })())`));
    check('fail() shows the message and the way out, and no number beside the dead bar',
      dead.shown && dead.errorShown && /made up failure/.test(dead.error) && dead.help && dead.numbers === 0,
      JSON.stringify(dead));
    check('and the failure scrolls nothing sideways', dead.sw <= dead.w, `${dead.sw} in ${dead.w}`);
  } finally {
    await page.close();
  }
}

/*
 * A ROOM LINK, for real: a rooms server in this process, on a port the
 * system picks, its database in a scratch directory.
 */
console.log('\na room link being retried');
const scratch = await mkdtemp(join(tmpdir(), 'boot-loader-rooms-'));
let rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const roomsPort = rooms.port;
/* Every WebSocket the page opens, so the check can drop the room's. */
const SOCKETS = `(() => {
  const Native = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.__sockets.push(this);
    }
  };
})();`;
const page = await openPage({
  root, width: 1280, height: 800, seed: [RECORDER, SOCKETS], url: `/index.html?rooms=${encodeURIComponent(`http://127.0.0.1:${roomsPort}`)}`,
});
try {
  await page.until("window.__shellReady === true && document.getElementById('pdcs-loader').hidden", 300000);
  const code = await page.evaluate('window.__roomCreate()');
  await page.until("window.__rooms().phase === 'open'", 30000);
  check('in a room', Boolean(code), code);
  const heldSamples = () => page.evaluate('JSON.stringify(window.__bootLog.samples.filter((s) => s.held))').then(JSON.parse);

  /* A drop: the room's socket closed under the page with no word from the
   * server, by a code no retry gives up on. rooms.js keeps its socket to
   * itself, so SOCKETS (below) remembers every one the page opens. */
  await page.evaluate('window.__bootLog.samples = []; true');
  const dropped = await page.evaluate(`window.__sockets.filter((s) => s.readyState === 1 && /\\/v2\\/room\\//.test(s.url))
    .map((s) => { s.close(3001, 'boot-loader-check drop'); return s.url; }).length`);
  check('the room\'s socket is dropped', dropped === 1, String(dropped));
  await page.until("window.__rooms().phase === 'connecting'", 5000).catch(() => {});
  await page.until("window.__rooms().phase === 'open'", 30000).catch(() => {});
  const drop = await heldSamples();
  check('a dropped link holds the minimal loader, saying it is reconnecting, with the attempt, its bar empty and sweeping', drop.length > 0
    && drop.every((s) => s.minimal && s.active === 'screen-boot' && !s.hidden && s.boot.v === '0') && drop.some((s) => s.action === str('loading.held_reconnect'))
    && drop.some((s) => s.status === str('loading.held_attempt', { n: 1, of: 5 })), JSON.stringify(drop.slice(0, 1)));
  await page.until("document.getElementById('pdcs-loader').hidden", 5000).catch(() => {});
  check('and lets go once the link is back', await page.evaluate("window.__rooms().phase === 'open' && document.getElementById('pdcs-loader').hidden"));

  /* A restart: the server's own SIGTERM path, every socket closed with
   * 1012, then the server back on the same port. */
  await page.evaluate('window.__bootLog.samples = []; true');
  await rooms.stop();
  await page.until("document.getElementById('pdcs-loader').classList.contains('is-held')", 10000).catch(() => {});
  const during = JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const r = document.getElementById('pdcs-loader');
    const shown = (sel) => [...r.querySelectorAll(sel)].some((n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden');
    return { up: !r.hidden && !r.classList.contains('hidden'), minimal: r.classList.contains('is-minimal'),
      action: r.querySelector('.boot-action').textContent, status: r.querySelector('.loader-status').textContent,
      number: shown('#boot-progress-text'), fill: r.querySelector('#boot-progress').parentElement.getAttribute('aria-valuenow'), sweep: getComputedStyle(r.querySelector('#screen-boot .progress-sweep')).opacity,
      phase: window.__rooms().phase, reason: window.__rooms().reason };
  })())`));
  check('a rooms server restarting holds the minimal loader, saying so, with the attempt, an empty sweeping bar and no number', during.up && during.minimal
    && during.action === str('loading.held_restart') && /\b1\b/.test(during.status) && !during.number && during.fill === '0' && during.sweep !== '0'
    && during.reason === 'restart', JSON.stringify(during));
  rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: roomsPort });
  await page.until("window.__rooms().phase === 'open'", 60000).catch(() => {});
  await page.until("document.getElementById('pdcs-loader').hidden", 5000).catch(() => {});
  const back = JSON.parse(await page.evaluate("JSON.stringify({ phase: window.__rooms().phase, hidden: document.getElementById('pdcs-loader').hidden })"));
  check('and the overlay goes when the server is back and the link with it', back.phase === 'open' && back.hidden, JSON.stringify(back));
  const restartSamples = await heldSamples();
  check('the whole wait said the server was restarting, not a plain reconnect', restartSamples.length > 0
    && restartSamples.every((s) => s.action === str('loading.held_restart')), [...new Set(restartSamples.map((s) => s.action))].join(' | '));
  const errs = page.errors.filter((x) => !x.startsWith('network:') && !/WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource/.test(x));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await rooms.stop();
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
