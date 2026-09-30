/*
 * war-card-check.js: the title's Defend Itaipu card and Make a room's
 * Defend Itaipu game, driven through the real shell the way a pilot drives
 * them, in one page, against a local rooms server (never the live one):
 *
 *   npm run war:card                       starts its own on port 8819
 *   npm run war:card -- http://127.0.0.1:8797 [outdir]
 *
 * The gate draws six cards, Defend Itaipu last with its picture and its
 * mark, inside the window at 1280x720, 1920x1080, 390x844, 360x640 and
 * 844x390, tags clear of the command bar, no sideways scroll.
 *
 * A click on the card with no consent stored: the consent screen; Back
 * leaves the pilot on the gate with no room; a second click and Continue:
 * a PRIVATE room, this pilot its host, Itaipu seated, the room screen with
 * the war's start row under the cursor. Reloaded (consent now stored),
 * Enter on the card goes to a new private Itaipu room with no consent
 * screen at all.
 *
 * Make a room: the Game row offers Defend Itaipu only for a private room
 * on Itaipu, drops it when the room is made public, and making it asks
 * consent first when it is not stored, then lands the same way.
 *
 * No page error. Pictures in outdir, not in the repository.
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
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[3] || join(root, 'build', 'war-card');

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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* A rooms server of our own unless one is named, on a throwaway database. */
async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'war-card-rooms-'));
  const port = 8819;
  const proc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
    env: { ...process.env, ROOMS_DB: join(dir, 'rooms.db'), PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`${url}/v2/rooms`);
      return { url, stop };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await stop();
  throw new Error(`rooms server did not come up on ${url}`);
}

const NAMES = 'Track mode,Free Flight,Fly with friends,Toilet paper combat,Catch the Ace!,Defend Itaipu';

const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    const img = c.querySelector('.gate-card-shot');
    return {
      name: c.querySelector('.gate-card-name').textContent,
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      mark: Boolean(c.querySelector('.gate-card-mark svg')),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(c.querySelector('.gate-card-facts').getBoundingClientRect().bottom),
    };
  }),
}))()`;

function laidOut(v) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  return c.length === 6 && inside && apart && v.sw <= v.w;
}

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

async function click(page, selector) {
  const at = await page.evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x: at[0], y: at[1], button: 'left', clickCount: 1,
    }, page.sessionId);
  }
}

/* The consent screen, open: its title, or null. */
const DIALOG = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : null; })()";

/* Answer the open dialog from the keyboard, Enter for Continue and
 * Escape for Back, once its deaf period (askConfirm) has passed. */
async function answer(page, label) {
  await page.sleep(700);
  await page.tap(label === 'Back' ? 'Escape' : 'Enter');
}

/* Counts every time the consent screen opens, from now on. */
const WATCH_DIALOG = `(() => {
  window.__warCardDialogs = 0;
  let open = false;
  setInterval(() => {
    const d = document.querySelector('.name-dialog');
    const now = Boolean(d && !d.hidden);
    if (now && !open) { window.__warCardDialogs += 1; }
    open = now;
  }, 20);
  return true;
})()`;

/* Where a pilot who made a room for the war has landed. */
const LANDED = `(() => {
  const ui = window.__ui;
  const r = window.__rooms();
  const items = ui.items();
  const here = items[ui.cursor] || {};
  return {
    phase: r.phase, code: r.code, public: r.public, host: r.host !== null && r.host === r.seat,
    screen: ui.screen, map: ui.settings.map, game: ui.roomGame, consent: ui.settings.warConsent === true,
    here: here.action || here.label || null, primary: Boolean(here.primary),
    heading: (items.find((it) => it.section) || {}).label || null,
    war: items.some((it) => it.action === 'friends-war-start'),
  };
})()`;

function landedWell(v) {
  return v.phase === 'open' && /^[A-Z0-9]{6}$/.test(v.code || '') && !v.public && v.host && v.screen === 'friends'
    && v.map === 'itaipu' && v.game === 'war' && v.consent && v.war && v.here === 'friends-war-start' && v.primary
    && /Defend Itaipu/.test(v.heading || '');
}

async function landed(page) {
  await page.until("window.__rooms().phase === 'open' && window.__ui.items().some((it) => it.action === 'friends-war-start')", 60000).catch(() => {});
  await page.sleep(500);
  return page.evaluate(LANDED);
}

async function toGate(page) {
  await page.evaluate("(() => { location.reload(); return true; })()");
  await page.sleep(500);
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 6", 60000);
}

const server = await roomsServer();
console.log(`the Defend Itaipu card, rooms at ${server.url}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(server.url)}`, width: 1280, height: 720 });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 6", 60000).catch(() => {});
  await page.until(`${LAYOUT}.cards.every((c) => c.loaded)`, 30000).catch(() => {});

  /* SIX CARDS AT EVERY SIZE. */
  const first = await page.evaluate(LAYOUT);
  check('six cards, Defend Itaipu last', first.cards.map((x) => x.name).join() === NAMES, first.cards.map((x) => x.name).join());
  check('each with its picture loaded and its mark drawn', first.cards.every((x) => x.loaded && x.mark));
  for (const [w, h, row] of [[1280, 720, true], [1920, 1080, true], [390, 844, false], [360, 640, false], [844, 390, true]]) {
    await resize(page, w, h);
    const v = await page.evaluate(LAYOUT);
    const tops = v.cards.map((x) => x.box[1]);
    const shape = row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
    check(`${w} by ${h}: six cards ${row ? 'in a row' : 'stacked'}, inside the window, tags clear of the bar, no sideways scroll`,
      laidOut(v) && shape, `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    await shot(page, `gate-${w}x${h}`);
  }
  await resize(page, 1280, 720);

  /* FIRST PRESS, NO CONSENT STORED: the question, and Back is the gate. */
  check('a fresh profile has not consented', await page.evaluate('window.__ui.settings.warConsent !== true'));
  await click(page, '.gate-card-war');
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  check('the card opens the consent screen first', (await page.evaluate(DIALOG)) === 'Defend Itaipu', String(await page.evaluate(DIALOG)));
  await shot(page, 'consent');
  await answer(page, 'Back');
  await page.until(`${DIALOG} === null`, 5000).catch(() => {});
  await page.sleep(800);
  const back = await page.evaluate("({ gate: window.__ui.onGate(), phase: window.__rooms().phase, consent: window.__ui.settings.warConsent === true })");
  check('Back leaves the pilot on the gate, no room, nothing stored', back.gate && back.phase === 'idle' && !back.consent, JSON.stringify(back));

  /* Continue: the private room. */
  await click(page, '.gate-card-war');
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  await answer(page, 'Continue');
  const one = await landed(page);
  check('Continue: a private Itaipu room, this pilot its host, the war start row under the cursor', landedWell(one), JSON.stringify(one));
  await shot(page, 'war-room-host');

  /* SECOND PRESS, CONSENT STORED: straight to a room. */
  await toGate(page);
  check('consent survives a reload', await page.evaluate('window.__ui.settings.warConsent === true'));
  await page.evaluate(WATCH_DIALOG);
  await page.evaluate("(() => { window.__ui.setCursor(window.__ui.items().findIndex((it) => it.card === 'war')); return true; })()");
  await page.tap('Enter');
  const two = await landed(page);
  check('Enter on the card again: a new private Itaipu room, the start row under the cursor', landedWell(two) && two.code !== one.code, JSON.stringify(two));
  check('and no consent screen on the way', (await page.evaluate('window.__warCardDialogs')) === 0, String(await page.evaluate('window.__warCardDialogs')));

  /* MAKE A ROOM'S GAME ROW. */
  await page.evaluate("(() => { window.__ui.act('friends-leave'); window.__ui.roomGame = null; window.__ui.show('roomnew'); return true; })()");
  await page.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  const row = (label) => `(window.__ui.items().find((it) => it.label === ${JSON.stringify(label)}) || null)`;
  const pick = (label, want) => page.evaluate(`(() => {
    const r = ${row(label)};
    const o = r.options.find((x) => x.label === ${JSON.stringify(want)});
    r.pick(o.value);
    return true;
  })()`);
  const games = () => page.evaluate(`${row('Game')}.options.map((o) => o.label)`);
  const worlds = await page.evaluate(`${row('The world')}.options.map((o) => o.label)`);
  const itaipu = worlds.find((x) => x.startsWith('Itaipu'));
  await pick('The world', itaipu);
  const kinds = await page.evaluate(`${row('Who can join')}.options.map((o) => o.label)`);
  const pub = kinds.find((k) => !/code/i.test(k));
  const priv = kinds.find((k) => /code/i.test(k));
  await pick('Who can join', pub);
  check('public on Itaipu: no Defend Itaipu in the Game row', !(await games()).includes('Defend Itaipu'), (await games()).join());
  await pick('Who can join', priv);
  await pick('The world', worlds.find((x) => x !== itaipu));
  check('private on another world: none either', !(await games()).includes('Defend Itaipu'), (await games()).join());
  await pick('The world', itaipu);
  check('private on Itaipu: Defend Itaipu offered', (await games()).includes('Defend Itaipu'), (await games()).join());
  await pick('Game', 'Defend Itaipu');
  await pick('Who can join', pub);
  check('made public, the draft drops it', (await page.evaluate(`${row('Game')}.value`)) !== 'Defend Itaipu', await page.evaluate(`${row('Game')}.value`));
  await pick('Who can join', priv);
  await pick('Game', 'Defend Itaipu');
  await shot(page, 'roomnew-war');

  /* Consent cleared, so making it asks first. */
  await page.evaluate("(() => { window.__ui.settings.warConsent = false; window.__ui.persistSettings(); return true; })()");
  await page.evaluate("(() => { window.__ui.act('friends-make'); return true; })()");
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  check('Make the room with no consent stored: the consent screen first', (await page.evaluate(DIALOG)) === 'Defend Itaipu', String(await page.evaluate(DIALOG)));
  await answer(page, 'Continue');
  const three = await landed(page);
  check('Continue: a private Itaipu room, the start row under the cursor', landedWell(three) && three.code !== two.code, JSON.stringify(three));
  await shot(page, 'war-room-from-form');

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
