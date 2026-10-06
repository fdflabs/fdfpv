/*
 * bug-crash-check.js: F8 after a crash carries the crash, on the real page.
 *
 * bug-484f7119: "I wanted to report a bug after the game crashed and when I
 * pressed F8 to report it the crash disappeared". In headless Chromium, on
 * the Swiss valley, with crash damage on:
 *
 *  1. A five inch thrown into the grass wrecks. F8: the form opens, says
 *     the crash goes with the report, and stays on Wrong behaviour, because
 *     a wreck is the game working. The payload Send would post (fetch is
 *     stubbed, nothing reaches a board) carries context.crash.craft with the
 *     kind, what broke and what it hit.
 *  2. Closed and resumed, the wreck is where it was, as broken as it was:
 *     opening the form froze the moment, it did not reset it.
 *  3. An uncaught error and an unhandled rejection: the next F8 opens on
 *     Crash or freeze, says so, and the payload carries both.
 *  4. Both payloads fit the board's context cap, 8000 characters over 32
 *     keys (inspectContext in fdfpv-leaderboard src/validate.js), with the
 *     five keys the feel form adds on top.
 *
 * Run: npm run bug:crash
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The board's own limits, from its src/validate.js. */
const BOARD_CONTEXT_CHARS = 8000;
const BOARD_CONTEXT_KEYS = 32;
const FEEL_EXTRA_KEYS = 5;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { airframeAsked: true, map: 'swiss2', graphics: 'low', graphicsAuto: false, crashDamage: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`,
/* Send posts here instead of to a board: the check reads the body the
 * board would have been sent, and nothing is filed anywhere. */
`(() => {
  const real = window.fetch.bind(window);
  window.__posted = [];
  window.fetch = (url, opts) => {
    if (String(url).endsWith('/api/bugs') && opts && opts.method === 'POST') {
      window.__posted.push(JSON.parse(opts.body));
      return Promise.resolve(new Response(JSON.stringify({ id: 'bug-00000000' }), { status: 201 }));
    }
    return real(url, opts);
  };
})();`];

const WAIT = 90000;

/* The pilot's side of the form: the kind it opened on, what it says, and
 * the payload Send posts. */
const FORM = `(() => {
  const box = document.querySelector('.name-dialog-box.bug');
  if (!box) { return null; }
  return {
    kind: box.querySelector('select').value,
    ledes: [...box.querySelectorAll('.lede')].map((p) => p.textContent),
  };
})()`;
const SEND = `(async () => {
  const box = document.querySelector('.name-dialog-box.bug');
  const [title] = box.querySelectorAll('input[type=text]');
  const [what] = box.querySelectorAll('textarea');
  title.value = 'bug crash check';
  what.value = 'filed by scripts/bug-crash-check.js, never posted';
  const n = window.__posted.length;
  [...box.querySelectorAll('button')].find((b) => b.classList.contains('on')).click();
  for (let i = 0; i < 100 && window.__posted.length === n; i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return JSON.stringify(window.__posted[n] || null);
})()`;
const WRECK = `JSON.stringify((() => {
  const s = window.__craftState();
  const c = window.__crash();
  return { screen: window.__ui.screen, wrecked: c.wrecked, flags: c.flagNames,
    at: [s.worldX, s.worldY, s.worldZ].map((v) => v.toFixed(2)).join() };
})())`;

async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

async function closeForm(page) {
  await page.evaluate('window.__ui.closeNameDialog(null)');
  await page.until('window.__ui.nameDialog.hidden', WAIT);
  await page.evaluate("window.__ui.onAction('resume')");
  await page.until("window.__ui.screen === 'flight'", WAIT);
}

function fits(name, ctx) {
  const chars = JSON.stringify(ctx).length;
  const keys = Object.keys(ctx).length;
  check(`${name}: ${keys} keys and ${chars} chars, inside the board's ${BOARD_CONTEXT_KEYS} and ${BOARD_CONTEXT_CHARS} with the feel form's ${FEEL_EXTRA_KEYS}`,
    keys + FEEL_EXTRA_KEYS <= BOARD_CONTEXT_KEYS && chars < BOARD_CONTEXT_CHARS, `${keys} keys, ${chars} chars`);
}

async function main() {
  console.log('F8 after a crash, on the real page');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=swiss2', seed });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 180000);
    await frames(page, 3);
    await page.tap('ShiftLeft');
    if ((await page.evaluate('window.__craftState().mode')) !== 'flight') {
      await page.evaluate("window.__ui.onAction('fly')");
      await page.until("window.__craftState().mode === 'flight'", WAIT);
    }
    await frames(page, 5);

    console.log('1. a wreck, then F8');
    const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 25}, z: ${pad.z}, yaw: 0, pitch: -40, vx: 0, vy: -10, vz: -18, showCraft: true }).ok`);
    await page.until('window.__crash().wrecked', WAIT);
    await frames(page, 10);
    const before = JSON.parse(await page.evaluate(WRECK));
    check('the throw wrecked the quad', before.wrecked && before.flags.length > 0, before.flags.join(' '));
    await page.tap('F8');
    await page.until("document.querySelector('.name-dialog-box.bug')", WAIT);
    const form = await page.evaluate(FORM);
    check('F8 opens the form', Boolean(form));
    check('the form says the crash goes with the report', form && form.ledes.some((t) => /^Your crash \d+ s ago goes with this report/.test(t)),
      form && form.ledes.join(' / '));
    check('and stays on Wrong behaviour, because a wreck is the game working', form && form.kind === 'wrong', form && form.kind);
    const posted = JSON.parse(await page.evaluate(SEND));
    const craft = posted && posted.context && posted.context.crash && posted.context.crash.craft;
    check('the payload carries the crash', Boolean(craft), posted ? Object.keys(posted.context).join(',') : 'nothing posted');
    check('with its kind, what broke and what it hit',
      craft && ['wreck', 'ground'].includes(craft.kind) && craft.flags.length > 0 && craft.hits.length > 0 && craft.hits[0].surface,
      JSON.stringify(craft));
    check('and how long before F8 it was', craft && craft.ageS >= 0 && craft.ageS < 120, craft && String(craft.ageS));
    check('with no error attached, because none happened', posted && !(posted.context.crash && posted.context.crash.errors) && !posted.context.fault);
    if (posted) {
      fits('the crash report', posted.context);
    }

    console.log('2. closed and resumed');
    await closeForm(page);
    await frames(page, 10);
    const after = JSON.parse(await page.evaluate(WRECK));
    check('the wreck is still a wreck, as broken as it was',
      after.wrecked && after.flags.join() === before.flags.join(), `${before.flags.join(' ')} -> ${after.flags.join(' ')}`);
    check('and still where it came down', after.at === before.at, `${before.at} -> ${after.at}`);

    console.log('3. an uncaught error and a rejection, then F8');
    await page.evaluate("setTimeout(() => { throw new Error('bug-crash-check thrown'); }, 0); Promise.reject(new Error('bug-crash-check rejected')); true");
    await frames(page, 3);
    await page.tap('F8');
    await page.until("document.querySelector('.name-dialog-box.bug')", WAIT);
    const form2 = await page.evaluate(FORM);
    check('the form opens on Crash or freeze', form2 && form2.kind === 'crash', form2 && form2.kind);
    check('and says the error goes with the report', form2 && form2.ledes.some((t) => /^The error the simulator hit goes with this report: /.test(t)),
      form2 && form2.ledes.join(' / '));
    const posted2 = JSON.parse(await page.evaluate(SEND));
    const errors = posted2 && posted2.context.crash && posted2.context.crash.errors;
    const messages = errors ? errors.map((e) => e.message).join(' / ') : '';
    check('the payload carries the thrown error', /bug-crash-check thrown/.test(messages), messages);
    check('and the rejection, named as one', /unhandledrejection: bug-crash-check rejected/.test(messages), messages);
    check('and still the crash from before', Boolean(posted2 && posted2.context.crash && posted2.context.crash.craft));
    check('and the kind it opened on', posted2 && posted2.kind === 'crash', posted2 && posted2.kind);
    if (posted2) {
      fits('the error report', posted2.context);
    }
    await closeForm(page);

    const unexpected = page.errors.filter((e) => !/bug-crash-check/.test(String(e)));
    check('no page errors beyond the two thrown on purpose', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
  console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
