/*
 * boot-loader-check.js: the boot screen is the game's, not a map's, and the
 * key art is the title's.
 *
 * The owner, 2 October: the very first loading screen should not show
 * Itaipu, because it comes back on every load and is not representative of
 * the whole game; sober, no images, no jokes, a game's boot; the key art
 * lives in the main menu instead. This drives the real shell in headless
 * Chromium, a desktop window and an upright phone, and holds both halves:
 *
 * THE BOOT SCREEN. Nothing under #loading is a picture: no image element,
 * and no background image on it, on anything in it, or on their ::before
 * and ::after. A recorder installed before the page's first script logs
 * every change to the screen for the whole load: its text never carries a
 * quotation mark (every joke was quoted) and never a line of the removed
 * jokes, whose keys are gone from every string table and from the source.
 * The bar is a progressbar from 0 to 100 with a label, its value never
 * goes backwards, the number beside it says the same, it reaches 100, and
 * then the screen hides. The status line names only the load's real stages
 * (STAGE_DOING in src/ui/loading.js), at least three of them. The build
 * line is there. At the phone's width nothing scrolls sideways and the
 * status keeps a 16 px gutter. Under reduced motion the sweep is still.
 *
 * THE TITLE. Once the boot screen has gone, the gate carries the key art
 * for the window's shape, over its fallback colour and under a scrim, and
 * the art is not requested before the boot screen has gone.
 *
 * And fail() still makes a readable dead end: the message, the help panel,
 * no number beside a red bar.
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
/* And words from their punchlines, for the screen's own text. */
const JOKE_WORDS = /\b(props|gyro|helicopter parent|chequered|soap|low carb|on a roll|raise|gatekeeping)\b/i;

console.log('the jokes are gone from the source');
const locales = (await readdir(join(root, 'src/strings'))).filter((f) => /^[a-z]{2}\.js$/.test(f));
for (const f of locales) {
  const table = (await import(join(root, 'src/strings', f))).default;
  const left = JOKE_KEYS.filter((k) => Object.hasOwn(table, `loading.${k}`));
  check(`${f} has none of the joke keys`, left.length === 0, left.join(', '));
}
const loadingSrc = await readFile(join(root, 'src/ui/loading.js'), 'utf8');
const uiSrc = await readFile(join(root, 'src/ui/ui.js'), 'utf8');
const html = await readFile(join(root, 'index.html'), 'utf8');
check('loading.js keeps no joke list and no joke timer', !/JOKE|quotedJoke/.test(loadingSrc));
check('ui.js imports no joke', !/JOKE|quotedJoke|waitJoke/.test(uiSrc));
check('index.html has no joke element and no tagline', !/loading-joke|map-reel-wait-joke|loading-tag/.test(html));
check('index.html asks for no picture in its head', !/rel="preload" as="image"/.test(html));

/* The stage lines a load may show, read from loading.js through the string
 * table the same way the page does. */
const { str } = await import(join(root, 'src/strings/index.js'));
const doingBlock = (loadingSrc.match(/const STAGE_DOING = \{([\s\S]*?)\};/) || ['', ''])[1];
const DOING = [...doingBlock.matchAll(/str\('(loading\.[a-z_]+)'\)/g)].map((m) => str(m[1]));
check('loading.js names six stages in words', DOING.length >= 6, DOING.join(' | '));

/*
 * Installed before the page's first script: every change under #loading,
 * as the text, the progressbar's value and the number, with the time. And
 * the moment the screen went, against which the art's request is timed.
 */
const RECORDER = `(() => {
  const log = window.__bootLog = { samples: [], hiddenAt: null, texts: new Set(), art: [] };
  /* An observer, not getEntriesByType: the shell's module graph fills the
   * page's resource timing buffer long before the title has painted. */
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (/assets\\/(keyart|loading)\\//.test(e.name)) {
        log.art.push({ name: e.name.replace(location.origin, ''), start: e.startTime });
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
    new MutationObserver(() => sample(root)).observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
  });
})();`;

/* Every element under #loading, and #loading itself: tag, and the
 * background image of it and of its two pseudo elements. */
const PICTURES = `(() => {
  const root = document.getElementById('loading');
  const all = [root, ...root.querySelectorAll('*')];
  const media = root.querySelectorAll('img, picture, video, canvas, svg image, object, embed, iframe').length;
  const painted = [];
  for (const n of all) {
    for (const pseudo of [null, '::before', '::after']) {
      const bg = getComputedStyle(n, pseudo).backgroundImage;
      if (bg && bg !== 'none' && /url\\(/.test(bg)) {
        painted.push((n.id || n.className || n.tagName) + (pseudo || '') + ' ' + bg.slice(0, 60));
      }
    }
  }
  return JSON.stringify({ media, painted });
})()`;

const SIZES = [
  { label: 'desktop 1440 by 900', width: 1440, height: 900, art: 'wide.webp' },
  { label: 'phone 390 by 844', width: 390, height: 844, art: 'tall.webp', touch: true },
];

for (const size of SIZES) {
  console.log(`\n${size.label}`);
  const page = await openPage({
    root, width: size.width, height: size.height, touch: Boolean(size.touch), seed: [RECORDER],
  });
  try {
    await page.until("window.__bootLog && window.__bootLog.samples.length > 0", 30000);
    const pictures = JSON.parse(await page.evaluate(PICTURES));
    check('the boot screen holds no image element', pictures.media === 0, `${pictures.media}`);
    check('and paints no background picture anywhere in it', pictures.painted.length === 0, pictures.painted.join(' | '));
    const aria = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const t = document.querySelector('#loading .loading-track');
      return { role: t.getAttribute('role'), min: t.getAttribute('aria-valuemin'), max: t.getAttribute('aria-valuemax'),
        label: t.getAttribute('aria-label') };
    })())`));
    check('the bar is a progressbar from 0 to 100 with a label', aria.role === 'progressbar' && aria.min === '0'
      && aria.max === '100' && Boolean(aria.label), JSON.stringify(aria));

    /* Mid load, at the phone's width: nothing sideways, and the status in
     * from both edges by the gutter. */
    const lay = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const r = document.querySelector('#loading .loading-status').getBoundingClientRect();
      const l = document.querySelector('#loading .lockup').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, w: innerWidth, left: r.left, right: r.right,
        lockLeft: l.left, lockRight: l.right, hidden: document.getElementById('loading').hidden };
    })())`));
    check('mid load, nothing scrolls sideways', lay.sw <= lay.w, `${lay.sw} in ${lay.w}`);
    check('and the status and the name sit inside a 16 px gutter', lay.left >= 16 && lay.right <= lay.w - 16
      && lay.lockLeft >= 16 && lay.lockRight <= lay.w - 16, JSON.stringify(lay));

    await page.until("document.getElementById('loading').hidden", 240000);
    const log = JSON.parse(await page.evaluate(`JSON.stringify({ samples: window.__bootLog.samples,
      hiddenAt: window.__bootLog.hiddenAt, texts: [...window.__bootLog.texts] })`));
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
    const stages = [...new Set(log.samples.map((s) => s.stage))];
    const unknown = stages.filter((s) => s !== 'loading' && !DOING.includes(s) && !/^still /i.test(s));
    check('the status line names only the real stages', unknown.length === 0, unknown.join(' | '));
    check('and at least three of them', stages.filter((s) => DOING.includes(s)).length >= 3, stages.join(' | '));
    const quoted = log.texts.filter((t) => /["“”]/.test(t) || JOKE_WORDS.test(t));
    check('no line on the screen is a joke at any point of the load', quoted.length === 0, quoted.slice(0, 1).join(''));
    const build = await page.evaluate("document.querySelector('#loading .loading-build').textContent");
    check('the build line is there', /build/i.test(build), build);

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
        requests: window.__bootLog.art,
      };
    })())`));
    check('the title is on its gate, with the key art on', art.gate && art.hasArt && art.shown, JSON.stringify([art.gate, art.hasArt, art.shown]));
    check(`the picture is the one for this shape, ${size.art}`, art.picture.includes(`assets/keyart/${size.art}`), art.picture.slice(0, 80));
    check('over the art\'s own dark fallback colour', art.fallback === 'rgb(12, 14, 13)', art.fallback);
    check('under a scrim, under the cards', art.scrim.includes('linear-gradient') && art.copyOver, art.scrim.slice(0, 40));
    const early = art.requests.filter((r) => r.start < log.hiddenAt || /assets\/loading\//.test(r.name));
    check('and nothing of it was asked for while the boot screen was up', art.requests.length >= 1 && early.length === 0,
      JSON.stringify({ hiddenAt: Math.round(log.hiddenAt), requests: art.requests.map((r) => `${r.name}@${Math.round(r.start)}`) }));
    const sw = await page.evaluate('document.documentElement.scrollWidth <= innerWidth');
    check('the gate scrolls nothing sideways', sw);

    /* Reduced motion: the sweep stops. */
    await page.cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    }, page.sessionId);
    const still = await page.evaluate("(() => { const s = getComputedStyle(document.querySelector('#loading .loading-sweep')); return s.animationName === 'none' && s.opacity === '0'; })()");
    check('under reduced motion the sweep is still', still);

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

    const errs = page.errors.filter((x) => !x.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
