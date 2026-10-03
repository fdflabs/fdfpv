/*
 * signin-gate-check.js: nobody plays without a Google account, in the real
 * shell, against local servers with Google stood in for.
 *
 *   npm run signin:gate [/path/to/fdfpv-leaderboard]
 *
 * The board is started from that checkout (or FDFPV_BOARD, or a sibling
 * of this one), because signing in claims the callsign there.
 *
 * The owner, 2026-10-03: "make it so that the login is more obvious, AND
 * that it forces you to login", then "don't make it large... make it non
 * obtrusive but impossible to not do". Starts the tracks server with sign
 * in on and the rooms server checking every seat with it (as the VM runs
 * them), and Google's button replaced by one that hands the page a token
 * a key made here signed (tests/lib/account.js). Then, one browser at a
 * time:
 *
 *   the panel, not a wall     a fresh page shows home and its hubs with
 *                             the sign in panel in the corner: Google's
 *                             button and the line on why, inside the
 *                             window and clear of the name, the cards,
 *                             the rooms panel and the music dock at every
 *                             size from a phone to a big screen.
 *   nothing playable          every way in, tried: a hub activity's link
 *                             clicked, a card chosen with the keys, Fly,
 *                             Play and Restart, the track builder, an
 *                             invite code, a quick join, Make a room, and
 *                             a room link opened in the address. None
 *                             reaches a flight, a picker or a room, and
 *                             each says to sign in.
 *   sign in                   Google's button, then the callsign, right
 *                             after the first sign in; then home with the
 *                             callsign and its initial in the corner, and
 *                             the room the link named is joined.
 *   the guest's progress      what the browser held as a guest, in the
 *                             form move.js carries it from the old
 *                             address, is in the account after its first
 *                             sync; signing out clears it here, so a
 *                             second account signing in on this browser
 *                             gets none of it, and the first gets it back
 *                             on signing in again: merged once.
 *   sign out                  back to the panel, and play asks again.
 *   down                      a pilot signed in on this computer flies
 *                             with the accounts server gone; a pilot who
 *                             is not is told the accounts server, or
 *                             Google, cannot be reached, in words.
 *
 * No page error on any of it.
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import {
  MOCK_GIS, seedTracks, startAccounts, startBoard,
} from '../tests/lib/account.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { BUILDS_KEY } from '../src/ui/builds.js';
import { ACCOUNT_KEY } from '../src/share/pilot.js';
import { decodePack, encodePack, entriesOf } from '../src/share/move.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const SYNCED_KEY = 'webfpv.account.synced.v1';
const GUEST_XP = 4321;
const GUEST_COURSE = 'guest-course-flown';

/* The guest's storage as the old address held it, carried the way
 * src/share/move.js carries it: packed, unpacked, every entry written as
 * it came. moveIn only runs on the game's own domain, so the entries are
 * written here by the seed, the same keys and the same text. */
const oldOrigin = new Map([[SETTINGS_KEY, JSON.stringify({
  graphics: 'low',
  airframeAsked: true,
  progress: {
    v: 1, xp: GUEST_XP, courses: { [GUEST_COURSE]: true }, challenges: {}, seen: {}, casual: {}, unlockAll: false,
  },
})]]);
const asStorage = {
  get length() {
    return oldOrigin.size;
  },
  key: (i) => [...oldOrigin.keys()][i],
  getItem: (k) => oldOrigin.get(k) ?? null,
};
const carried = (await decodePack(await encodePack(entriesOf(asStorage)))).entries;
const seedCarried = `try {
  if (!localStorage.getItem('sim.gate.carried')) {
    localStorage.setItem('sim.gate.carried', '1');
    for (const [k, v] of Object.entries(${JSON.stringify(carried)})) { localStorage.setItem(k, v); }
  }
} catch (e) { /* storage refused */ }`;

const accounts = await startAccounts();
const board = await startBoard(resolve(process.env.FDFPV_BOARD || process.argv[2] || join(root, '..', 'fdfpv-leaderboard')));
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-gate-'));
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, accountsOrigin: accounts.origin });
const R = `http://127.0.0.1:${rooms.port}`;
const B = encodeURIComponent(board.origin);
console.log(`tracks ${accounts.origin}, rooms ${R}, board ${board.origin}`);

async function makeRoom() {
  const res = await fetch(`${R}/v2/create`, { method: 'POST', body: JSON.stringify({ map: 'swiss2' }) });
  return (await res.json()).code;
}

const PANEL = `(() => {
  const n = document.querySelector('.signin-panel');
  const chip = document.querySelector('.signin-chip');
  const st = document.querySelector('.signin-panel-status');
  return {
    shown: Boolean(n) && !n.hidden && n.getBoundingClientRect().width > 0,
    gis: Boolean(document.querySelector('.signin-panel #gis-mock')),
    why: (document.querySelector('.signin-panel-why') || {}).textContent || '',
    status: st && !st.hidden ? st.textContent : '',
    chip: Boolean(chip) && !chip.hidden ? chip.textContent : null,
    initial: chip ? chip.dataset.initial || '' : '',
  };
})()`;
const WHERE = `(() => {
  const r = window.__rooms();
  return {
    screen: window.__ui.screen,
    picker: Boolean(window.__ui.carousel && window.__ui.carousel.isOpen),
    phase: r.phase, code: r.code, seat: r.seat,
    gate: window.__ui.onGate(),
  };
})()`;
const dialogTitle = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : ''; })()";
const readJson = (p, key) => p.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || 'null')`);

/* Nothing of a flight, a picker or a room, and the panel asking. */
async function refused(p, name, act) {
  await p.evaluate(`(() => {
    const st = document.querySelector('.signin-panel-status');
    if (st) { st.textContent = ''; st.hidden = true; }
    return true;
  })()`);
  await act();
  await p.until(`(${PANEL}).status.length > 0`, 5000).catch(() => {});
  await p.sleep(1200);
  const w = await p.evaluate(WHERE);
  const panel = await p.evaluate(PANEL);
  check(`${name}: no flight, no picker, no room, and the panel says to sign in`,
    w.screen !== 'flight' && !w.picker && w.phase !== 'open' && w.phase !== 'connecting' && panel.shown && panel.status === en['account.panel_nudge'],
    JSON.stringify({ ...w, status: panel.status, shown: panel.shown }));
  /* Back home for the next one, whatever this one opened. */
  await p.evaluate("(() => { if (window.__ui.carousel && window.__ui.carousel.isOpen) { window.__ui.carousel.close(); } window.__ui.closeNameDialog && window.__ui.nameWait && window.__ui.closeNameDialog(null); return true; })()");
}

/* Google's button pressed as `sub`, the questions answered yes, and the
 * callsign typed when asked. Resolves to the dialog titles seen. */
async function signIn(p, sub, callsign) {
  await p.evaluate(`window.__credential = ${JSON.stringify(await accounts.idToken(sub))}; true`);
  await p.until("Boolean(document.querySelector('.signin-panel #gis-mock'))", 15000);
  await p.click('.signin-panel #gis-mock');
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    await p.until(`${dialogTitle}.length > 0 || Boolean((JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}') || {}).callsign)`, 15000);
    /* eslint-disable-next-line no-await-in-loop */
    const title = await p.evaluate(dialogTitle);
    if (!title) {
      break;
    }
    seen.push(title);
    if (title === en['account.pick_title']) {
      /* eslint-disable-next-line no-await-in-loop */
      await p.evaluate(`(() => { const f = document.querySelector('.name-dialog-input'); f.value = ${JSON.stringify(callsign)}; document.querySelector('.name-dialog .name-dialog-btn.on').click(); return true; })()`);
    } else {
      /* eslint-disable-next-line no-await-in-loop */
      await p.evaluate("(() => { document.querySelectorAll('.name-dialog .name-dialog-btn')[0].click(); return true; })()");
    }
    /* eslint-disable-next-line no-await-in-loop */
    await p.until(`(${dialogTitle}) !== ${JSON.stringify(title)}`, 15000);
  }
  await p.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}') || {}).callsign === ${JSON.stringify(callsign)}`, 15000)
    .catch(async (e) => {
      console.log('    sign in stuck:', JSON.stringify({ seen, panel: await p.evaluate(PANEL), errors: p.errors.slice(-5) }));
      throw e;
    });
  return seen;
}

/* Signed out from Pilot's row: the page starts again. */
async function signOut(p) {
  /* Off the sticks first: a sign out waits for the flight to end. */
  if (await p.evaluate("window.__ui.screen === 'flight'")) {
    await p.tap('Escape');
    await p.until("window.__ui.screen !== 'flight'", 10000);
  }
  await p.evaluate('window.__beforeSignOut = true; window.__ui.onAction(\'accountsignout\'); true');
  await p.until('!window.__beforeSignOut && window.__shellReady === true', 120000);
  await p.loaded(60000);
}

async function heldProgress(session) {
  return (await accounts.api('GET', '/api/account/progress', undefined, session)).progress;
}
const xpOf = (blob) => (blob && blob.data && blob.data.progress ? blob.data.progress.xp : null);
const courseOf = (blob) => Boolean(blob && blob.data && blob.data.progress && blob.data.progress.courses && blob.data.progress.courses[GUEST_COURSE]);

const box = (sel) => `(() => {
  const n = document.querySelector(${JSON.stringify(sel)});
  if (!n || n.hidden) { return null; }
  const r = n.getBoundingClientRect();
  return r.width > 0 ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
})()`;
const apart = (a, b) => !a || !b || a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];

let errors = [];
const linkCode = await makeRoom();

console.log('a fresh page: the panel, not a wall');
let p = await openPage({
  root, width: 1280, height: 720, url: `/index.html?rooms=${encodeURIComponent(R)}&board=${B}`, seed: [seedTracks(accounts.origin), MOCK_GIS, seedCarried],
});
try {
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  await p.until(`(${PANEL}).gis`, 15000).catch(() => {});
  let panel = await p.evaluate(PANEL);
  let w = await p.evaluate(WHERE);
  check('home is up, with its cards', w.gate && w.screen === 'title' && await p.evaluate("document.querySelectorAll('.screen-title .gate-card').length > 0"),
    JSON.stringify(w));
  check('the sign in panel is up, with Google\'s button and the line on why', panel.shown && panel.gis && panel.why === en['account.panel_why'],
    JSON.stringify(panel));
  check('no pilot chip yet', panel.chip === null, String(panel.chip));
  check('the guest\'s carried progress is in this browser before signing in',
    (await readJson(p, SETTINGS_KEY))?.progress?.xp === GUEST_XP);

  for (const [width, height] of [[1280, 720], [1920, 1080], [1024, 768], [768, 1024], [390, 844], [360, 640], [844, 390]]) {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, p.sessionId);
    await p.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
    for (const hub of [null, 'club']) {
      await p.evaluate(hub ? `window.__ui.openHub(${JSON.stringify(hub)}); true` : "window.__ui.hub = null; window.__ui.renderMenu(); true");
      await p.sleep(500);
      const v = await p.evaluate(`({
        w: window.innerWidth, h: window.innerHeight,
        panel: ${box('.signin-panel')},
        lockup: ${box('.screen-title .lockup')},
        beta: ${box('.screen-title .beta-note')},
        rooms: ${box('.screen-title .gate-rooms')},
        dock: ${box('.music-dock')},
        cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }),
      })`);
      const pb = v.panel;
      check(`${width} by ${height}${hub ? `, ${hub}` : ', home'}: the panel inside the window, clear of the name, the cards, the rooms panel and the dock`,
        Boolean(pb) && pb[0] >= 0 && pb[1] >= 0 && pb[2] <= v.w && pb[3] <= v.h
          && apart(pb, v.lockup) && apart(pb, v.beta) && apart(pb, v.rooms) && apart(pb, v.dock) && v.cards.every((c) => apart(pb, c)),
        JSON.stringify(v));
    }
  }
  await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, p.sessionId);
  await p.evaluate("window.__ui.hub = null; window.__ui.renderMenu(); true");

  console.log('nothing playable before signing in');
  await refused(p, 'a hub activity\'s link on home, clicked', async () => {
    await p.evaluate('window.__ui.hub = null; window.__ui.renderMenu(); true');
    await p.sleep(400);
    check('home has an activity link to click', await p.click('.screen-title .gate-card .gate-link'));
  });
  await refused(p, 'a card chosen with the keys', async () => {
    await p.evaluate("window.__ui.openHub('club'); true");
    await p.sleep(400);
    await p.tap('Enter');
  });
  for (const action of ['fly', 'play', 'restart']) {
    await refused(p, `${action[0].toUpperCase()}${action.slice(1)}`, () => p.evaluate(`window.__ui.onAction(${JSON.stringify(action)}, window.__ui.settings); true`));
  }
  await refused(p, 'the track builder', () => p.evaluate("window.__ui.openBuilder({ map: 'swiss2' }); true"));
  const invite = await makeRoom();
  await refused(p, 'an invite code (Join with a code)', () => p.evaluate(`window.__roomJoin(${JSON.stringify(invite)}); true`));
  await refused(p, 'a quick join', () => p.evaluate("window.__roomJoinPublic('swiss2'); true"));
  let made = null;
  await refused(p, 'Make a room', async () => {
    made = await p.evaluate("window.__roomCreate({ map: 'swiss2' }).then(() => 'made', (e) => e.message)");
  });
  check('Make a room made nothing, and said why', made === 'signin', String(made));
  errors.push(...p.errors);

  console.log('a room link opened in the address');
  await p.evaluate(`window.location.href = '/index.html?rooms=${encodeURIComponent(R)}&board=${B}&room=${linkCode}'; true`);
  await p.sleep(1500);
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  await p.until(`(${PANEL}).status === ${JSON.stringify(en['account.panel_nudge'])}`, 20000).catch(() => {});
  w = await p.evaluate(WHERE);
  panel = await p.evaluate(PANEL);
  check('the link joins nothing, and the panel says to sign in', w.phase !== 'open' && !w.seat && panel.status === en['account.panel_nudge'],
    JSON.stringify({ ...w, status: panel.status }));

  console.log('signing in');
  const asked = await signIn(p, 'pilot-a', 'Alpha');
  check('the callsign is asked right after the first sign in', asked[asked.length - 1] === en['account.pick_title'], JSON.stringify(asked));
  await p.until(`(${PANEL}).chip === 'Alpha'`, 15000).catch(() => {});
  panel = await p.evaluate(PANEL);
  check('then the panel is gone, and the corner holds the callsign and its initial', !panel.shown && panel.chip === 'Alpha' && panel.initial === 'A',
    JSON.stringify(panel));
  await p.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(linkCode)}`, 20000).catch(() => {});
  w = await p.evaluate(WHERE);
  check('and the room the link named is joined, seated by the rooms server', w.phase === 'open' && w.code === linkCode && w.seat > 0, JSON.stringify(w));
  const a = await readJson(p, ACCOUNT_KEY);

  console.log('the guest\'s progress, merged once');
  await p.until(`Boolean(localStorage.getItem(${JSON.stringify(SYNCED_KEY)}))`, 20000).catch(() => {});
  let held = await heldProgress(a.session);
  check('the account holds the guest\'s carried progress after its first sync', xpOf(held) === GUEST_XP && courseOf(held), JSON.stringify(held && held.data && held.data.progress));
  await p.evaluate('window.__roomLeave ? window.__roomLeave() : true');
  await signOut(p);
  panel = await p.evaluate(PANEL);
  const after = await readJson(p, SETTINGS_KEY);
  const builds = await readJson(p, BUILDS_KEY);
  check('signed out: the panel is back, and no pilot chip', panel.shown && panel.chip === null, JSON.stringify(panel));
  check('and this browser no longer holds the progress, nor any build', (after?.progress?.xp ?? 0) !== GUEST_XP && !(after?.progress?.courses || {})[GUEST_COURSE]
    && (!builds || builds.builds.length === 0), JSON.stringify({ progress: after?.progress, builds }));
  check('nor the account', (await readJson(p, ACCOUNT_KEY)) === null);
  await refused(p, 'signed out, Fly', () => p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true"));

  const bSeen = await signIn(p, 'pilot-b', 'Bravo');
  check('a second account on this browser is asked its callsign too', bSeen.includes(en['account.pick_title']), JSON.stringify(bSeen));
  await p.until("window.__ui.screen === 'flight'", 120000).catch(() => {});
  check('and the Fly pressed before signing in flies once it has', await p.evaluate("window.__ui.screen === 'flight'"), JSON.stringify(await p.evaluate(WHERE)));
  const b = await readJson(p, ACCOUNT_KEY);
  await p.until(`Boolean(localStorage.getItem(${JSON.stringify(SYNCED_KEY)}))`, 20000).catch(() => {});
  held = await heldProgress(b.session);
  check('and gets none of the first account\'s progress', xpOf(held) !== GUEST_XP && !courseOf(held), JSON.stringify(held && held.data && held.data.progress));
  await signOut(p);

  const aAgain = await signIn(p, 'pilot-a', 'Alpha');
  check('the first account signing in again is not asked a callsign', !aAgain.includes(en['account.pick_title']), JSON.stringify(aAgain));
  const a2 = await readJson(p, ACCOUNT_KEY);
  await p.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').progress || {}).xp === ${GUEST_XP}`, 30000).catch(() => {});
  held = await heldProgress(a2.session);
  check('and still holds the progress, which comes back to this browser',
    xpOf(held) === GUEST_XP && (await readJson(p, SETTINGS_KEY))?.progress?.xp === GUEST_XP, JSON.stringify(held && held.data && held.data.progress));
  errors.push(...p.errors);
} finally {
  await p.close();
}

console.log('down: a signed in pilot keeps flying');
p = await openPage({ root, width: 1280, height: 720, account: 'Charlie', seed: [MOCK_GIS] });
try {
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  await p.accounts.stop();
  await p.evaluate('window.location.reload(); true');
  await p.sleep(1500);
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  const panel = await p.evaluate(PANEL);
  check('with the accounts server gone, the page still knows its pilot', !panel.shown && panel.chip === 'Charlie', JSON.stringify(panel));
  await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await p.until("window.__ui.screen === 'flight'", 120000).catch(() => {});
  check('and Fly flies', await p.evaluate("window.__ui.screen === 'flight'"), JSON.stringify(await p.evaluate(WHERE)));
  errors.push(...p.errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|fetch/i.test(e)));
} finally {
  await p.close();
}

console.log('down: a new sign in cannot happen, and says why');
const dead = await startAccounts();
const deadOrigin = dead.origin;
await dead.stop();
p = await openPage({ root, width: 1280, height: 720, seed: [seedTracks(deadOrigin), MOCK_GIS] });
try {
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  await p.until(`(${PANEL}).status === ${JSON.stringify(en['account.server_unreachable'])}`, 20000).catch(() => {});
  const panel = await p.evaluate(PANEL);
  check('the accounts server unreachable: the panel says so', panel.shown && panel.status === en['account.server_unreachable'], JSON.stringify(panel));
} finally {
  await p.close();
}
p = await openPage({
  root, width: 1280, height: 720, seed: [seedTracks(accounts.origin)], args: ['--host-resolver-rules=MAP accounts.google.com ~NOTFOUND'],
});
try {
  await p.until('window.__shellReady === true', 300000);
  await p.loaded(60000);
  await p.until(`(${PANEL}).status === ${JSON.stringify(en['account.google_unreachable'])}`, 30000).catch(() => {});
  const panel = await p.evaluate(PANEL);
  check('Google\'s script unreachable: the panel says so', panel.shown && panel.status === en['account.google_unreachable'], JSON.stringify(panel));
} finally {
  await p.close();
}

errors = errors.filter((e) => !/accounts\.google\.com|ERR_NAME_NOT_RESOLVED/.test(e));
check('no page error', errors.length === 0, errors.slice(0, 5).join(' | '));

await rooms.stop();
await accounts.stop();
await board.stop();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
