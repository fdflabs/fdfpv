/*
 * war-public-check.js: a public war room, two pilots, through the real
 * shell, against a local rooms server (never the live one):
 *
 *   npm run war:public                     starts its own, on a free port
 *   npm run war:public -- http://127.0.0.1:8797
 *
 * The owner, 2026-10-01: "when i start a mission now, a new room isnt
 * created and made public so my friend cant easily join".
 *
 * Page A has the consent stored and mission 1 won. It plays mission 2
 * from the campaign: a public room, named for A, made for the war and
 * mission 2, its lobby on mission 2.
 *
 * Page B is a fresh profile with no consent. It sees A's room on the
 * title's rooms panel marked War 2, and in Rooms as set up for
 * Defend the Paraná, mission 2. It joins and is asked the consent on arrival:
 * No leaves it out of the room, on the title, and A's room goes on
 * without B. It joins again and says Continue: in A's room. A starts the
 * mission, and both are in mission 2's briefing.
 *
 * No page error on either page.
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

/* A rooms server of this check's own, in this process on a port the
 * system picks (as war-twopage does): a fixed port on a shared host can be
 * another tree's server. Or the one given. */
async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'war-public-rooms-'));
  const { startRooms } = await import('../edge/rooms/node.js');
  const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: async () => {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function click(page, selector) {
  await page.loaded();
  const at = await page.evaluate(`(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) { return null; }
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!at) {
    throw new Error(`nothing to click at ${selector}`);
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x: at[0], y: at[1], button: 'left', clickCount: 1,
    }, page.sessionId);
  }
  await page.sleep(150);
}

/* The open dialog's heading, or null. */
const DIALOG = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : null; })()";

/* Answer it from the keyboard once its deaf period (askConfirm) is over. */
async function answer(page, yes) {
  await page.sleep(700);
  await page.tap(yes ? 'Enter' : 'Escape');
}

/* A: the consent given and mission 1 won, so mission 2 is open. */
const SEED_A = `(() => {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  localStorage.setItem('webfpv.settings.v3', JSON.stringify({
    ...s, warConsent: true, campaign: { v: 1, earned: 0, missions: { 'itaipu-1': { stars: 1, won: true, credits: 100 } } },
  }));
})();`;

const ROOM = `(() => {
  const r = window.__rooms();
  return { phase: r.phase, code: r.code, public: r.public, name: r.name, peers: r.peers.length, screen: window.__ui.screen };
})()`;

const server = await roomsServer();
console.log(`a public war room, rooms at ${server.url}`);
const url = `/index.html?rooms=${encodeURIComponent(server.url)}`;
const a = await openPage({ root, url, width: 1280, height: 720, seed: [SEED_A] });
const b = await openPage({ root, url, width: 1280, height: 720 });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__ui.onGate()', 60000).catch(() => {});
  }

  /* A PLAYS MISSION 2. */
  await a.evaluate('(() => { window.__campaign.open(); return true; })()');
  await a.until("document.querySelector('[data-mission=\"itaipu-2\"] .campaign-play')", 10000).catch(() => {});
  await click(a, '[data-mission="itaipu-2"] .campaign-play');
  await a.until("window.__rooms().phase === 'open' && window.__ui.items().some((it) => it.action === 'friends-war-start')", 60000).catch(() => {});
  await a.sleep(600);
  const room = await a.evaluate(ROOM);
  const code = room.code;
  await a.until("/Mission 2: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')", 10000).catch(() => {});
  const startRow = await a.evaluate("(document.querySelector('.war-lobby-mission') || {}).textContent || null");
  check('A plays mission 2: a public room named for A, its lobby on mission 2', room.phase === 'open' && room.public === true
    && /, Paraná$/.test(room.name || '') && /Mission 2: /.test(startRow || ''), JSON.stringify({ room, startRow }));
  const line = (await (await fetch(`${server.url}/v2/rooms`)).json()).rooms.find((r) => r.code === code);
  check('the room server lists it as the war\'s, mission 2', line && line.game === 'war' && line.mission === 'itaipu-2' && line.name === room.name,
    JSON.stringify(line));

  /* B FINDS IT. */
  const panelAction = `lobby:friends-room-${code}`;
  await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(panelAction)})`, 30000).catch(() => {});
  const chip = await b.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(panelAction)}) || null)`);
  check('B\'s title rooms panel shows it, marked War 2', chip && chip.label === room.name && /^War 2 · /.test(chip.value || ''),
    JSON.stringify(chip && { label: chip.label, value: chip.value }));
  const rowAction = `friends-room-${code}`;
  const openRooms = async () => {
    await b.evaluate("(() => { window.__ui.act('way-friends'); window.__ui.act('rooms'); return true; })()");
    await b.until(`window.__ui.screen === 'rooms' && window.__ui.items().some((it) => it.action === ${JSON.stringify(rowAction)})`, 30000).catch(() => {});
  };
  await openRooms();
  const row = await b.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(rowAction)}) || null)`);
  check('and in Rooms, set up for Defend the Paraná, mission 2', row && row.label === room.name && /Defend the Paraná, mission 2/.test(row.note || ''),
    JSON.stringify(row && { label: row.label, note: row.note }));

  /* B SAYS NO. */
  await b.evaluate(`(() => { window.__ui.act(${JSON.stringify(rowAction)}); return true; })()`);
  await b.until(`${DIALOG} !== null`, 30000).catch(() => {});
  const asked = await b.evaluate(DIALOG);
  check('B joins and is asked the consent on arrival', asked === 'Defend the Paraná', String(asked));
  await answer(b, false);
  await b.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  await b.sleep(1500);
  const out = await b.evaluate("({ phase: window.__rooms().phase, screen: window.__ui.screen, consent: window.__ui.settings.warConsent === true })");
  const aAlone = await a.evaluate(ROOM);
  check('No: B is out of the room, on the title, nothing stored', out.phase === 'idle' && out.screen === 'title' && !out.consent, JSON.stringify(out));
  check('and A\'s room goes on without B', aAlone.phase === 'open' && aAlone.code === code && aAlone.peers === 0, JSON.stringify(aAlone));

  /* B SAYS CONTINUE. */
  await openRooms();
  await b.evaluate(`(() => { window.__ui.act(${JSON.stringify(rowAction)}); return true; })()`);
  await b.until(`${DIALOG} !== null`, 30000).catch(() => {});
  await answer(b, true);
  await b.until(`window.__ui.settings.warConsent === true && window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(code)}`, 30000).catch(() => {});
  await a.until('window.__rooms().peers.length === 1', 30000).catch(() => {});
  const inB = await b.evaluate(ROOM);
  const inA = await a.evaluate(ROOM);
  check('Continue: B is in A\'s room, A sees B', inB.phase === 'open' && inB.code === code && inA.peers === 1, JSON.stringify({ inB, inA }));

  /* A STARTS IT: both in mission 2. */
  await a.evaluate("(() => { window.__ui.act('friends-war-start'); return true; })()");
  const both = "window.__war && window.__war().view.mission === 'itaipu-2' && window.__war().view.state === 'briefing'";
  await a.until(both, 20000).catch(() => {});
  await b.until(both, 20000).catch(() => {});
  const wars = await Promise.all([a, b].map((p) => p.evaluate("(() => { const v = window.__war().view; return { mission: v.mission, state: v.state, id: v.id }; })()")));
  check('A starts it: both pilots in mission 2\'s briefing, the same war', wars[0].mission === 'itaipu-2' && wars[1].mission === 'itaipu-2'
    && wars[0].state === 'briefing' && wars[1].state === 'briefing' && wars[0].id === wars[1].id, JSON.stringify(wars));

  const errs = [a, b].flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
