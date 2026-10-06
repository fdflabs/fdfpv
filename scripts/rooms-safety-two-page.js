/*
 * rooms-safety-two-page.js: Phase 5's check in the real shell, two
 * headless pages against a running rooms Worker with public rooms open
 * (docs/MULTIPLAYER-PLAN.md section 9). By hand:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8851 --var PUBLIC_ROOMS:on
 *   node scripts/rooms-safety-two-page.js http://127.0.0.1:8851 [outdir]
 *
 * Page A is in English and flies a Cub, page B in Spanish and flies a
 * P-51. Neither has a code: both press "Join a public room" on the Swiss
 * valley and the lobby must put them in the same public room. Then A says
 * a preset phrase and waves, and B must read both in Spanish under A's
 * Spanish picker name; B mutes A, and A's next phrase and A's name tag
 * must be gone from B's screen while A's aircraft is still drawn; B
 * unmutes, and A is heard again; B says hello and A reads it in English;
 * B reports A from A's row, which asks before anything is sent, and
 * takes the report back with its mute from the Undo row under it.
 * Pictures in outdir, which is not in the repository.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { CHAT_PRESETS, EMOTES } from '../src/share/roomwire.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8851';
const outDir = process.argv[3] || join(root, 'build', 'rooms-safety');

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

function seedFor(id) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const heard = (page) => page.evaluate('window.__rooms().heard');
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const nice = CHAT_PRESETS.indexOf('nice_flying');
const hello = CHAT_PRESETS.indexOf('hello');
const race = CHAT_PRESETS.indexOf('race');
const wave = EMOTES.indexOf('wave');

console.log(`two pages in a public room, rooms at ${rooms}`);
const a = await openPage({ root, url: `${url}&lang=en`, width: 1280, height: 720, seed: seedFor('cub1400') });
const b = await openPage({ root, url: `${url}&lang=es`, width: 1280, height: 720, seed: seedFor('p51d1450') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  await a.evaluate("window.__roomJoinPublic('swiss2'); true");
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate("window.__roomJoinPublic('swiss2'); true");
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const ra = await a.evaluate('window.__rooms()');
  const rb = await b.evaluate('window.__rooms()');
  check('with no code typed, the lobby puts both pages in one public room', ra.public && rb.public && ra.code && ra.code === rb.code,
    `rooms ${ra.code} ${rb.code}`);

  for (const p of [a, b]) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  for (const p of [a, b]) {
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  const nameOfAonB = (await b.evaluate('window.__rooms()')).peers[0].name;
  const nameOfBonA = (await a.evaluate('window.__rooms()')).peers[0].name;

  /* The camera first, so the picture is taken while the lines are up:
   * on a loaded machine every round trip to a page takes seconds. */
  await b.evaluate(`(() => {
    const p = window.__rooms().peers[0].at;
    window.__setCam(p[0] - 6, p[1] + 2.5, p[2] + 5, p[0], p[1] + 0.3, p[2], 50);
    return true;
  })()`);
  await a.evaluate(`window.__roomSay('chat', ${nice})`);
  await b.until(`window.__rooms().heard.length >= 1`, 10000).catch(() => {});
  const want1 = es['friends.chat_line'].replace('{name}', nameOfAonB).replace('{phrase}', es['rooms.chat.nice_flying']);
  check('A says a preset, B reads it in Spanish under A\'s name', (await heard(b)).includes(want1), `${JSON.stringify(await heard(b))} for ${want1}`);
  await a.evaluate(`window.__roomSay('emote', ${wave})`);
  const want2 = es['rooms.emote_line.wave'].replace('{name}', nameOfAonB);
  await b.until(`window.__rooms().heard.includes(${JSON.stringify(want2)})`, 10000).catch(() => {});
  check('A waves, B reads it in Spanish', (await heard(b)).includes(want2), JSON.stringify(await heard(b)));
  const feed = await b.evaluate(`(() => {
    const f = document.querySelector('.room-feed');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { lines: [...f.children].map((c) => c.textContent), x: r.x, y: r.y, w: r.width, h: r.height, z: getComputedStyle(f).zIndex };
  })()`);
  check('and sees both lines on screen, bottom left', feed && feed.lines.includes(want1) && feed.lines.includes(want2) && feed.w > 0 && feed.y + feed.h <= 720,
    JSON.stringify(feed));
  await shot(b, 'b-es-reads-a-chat-and-wave');
  const labelBefore = (await b.evaluate('window.__rooms()')).peers[0].label;
  check('A\'s name tag is over A\'s aircraft on B', labelBefore === nameOfAonB, `${labelBefore}`);

  await b.evaluate(`window.__roomMute(${ra.seat}, true); true`);
  await b.sleep(800);
  const before = (await heard(b)).length;
  await a.sleep(2100);
  await a.evaluate(`window.__roomSay('chat', ${race})`);
  await b.sleep(2000);
  await b.until("(() => { const p = window.__rooms().peers[0]; return p.drawn && p.label === ''; })()", 20000).catch(() => {});
  const mutedPeer = (await b.evaluate('window.__rooms()')).peers[0];
  check('B mutes A: A\'s next phrase never reaches B', (await heard(b)).length === before, JSON.stringify(await heard(b)));
  check('and A\'s name tag is gone, A\'s aircraft still drawn', mutedPeer.muted && mutedPeer.label === '' && mutedPeer.drawn, JSON.stringify({ muted: mutedPeer.muted, label: mutedPeer.label, drawn: mutedPeer.drawn }));
  await b.sleep(600);
  await shot(b, 'b-es-has-muted-a');

  await b.evaluate(`window.__roomMute(${ra.seat}, false); true`);
  await b.sleep(800);
  await a.sleep(2100);
  await a.evaluate(`window.__roomSay('chat', ${race})`);
  const want3 = es['friends.chat_line'].replace('{name}', nameOfAonB).replace('{phrase}', es['rooms.chat.race']);
  await b.until(`window.__rooms().heard.includes(${JSON.stringify(want3)})`, 10000).catch(() => {});
  check('unmuted, B hears A again', (await heard(b)).includes(want3), JSON.stringify(await heard(b)));

  await b.evaluate(`window.__roomSay('chat', ${hello})`);
  const want4 = en['friends.chat_line'].replace('{name}', nameOfBonA).replace('{phrase}', en['rooms.chat.hello']);
  await a.until(`window.__rooms().heard.includes(${JSON.stringify(want4)})`, 10000).catch(() => {});
  check('B says hello, A reads it in English', (await heard(a)).includes(want4), JSON.stringify(await heard(a)));

  /* B reports A from A's row in Fly with friends: the pick asks first,
   * and the report, once sent, is taken back with its mute. */
  await b.evaluate("window.__ui.show('friends'); true");
  await b.sleep(400);
  /* A's row: the only one in a room of two with a pilot's options. */
  const peerRow = "window.__ui.items().findIndex((it) => it.pickOnly && it.options && it.options.some((o) => ['mute', 'unmute', 'confirm'].includes(o.value)))";
  const rowState = `(() => { const rows = window.__ui.items(); const i = ${peerRow}; const it = rows[i]; const next = rows[i + 1];
    return { label: it.label, options: it.options.map((o) => o.value), next: next ? { label: next.label, options: (next.options || []).map((o) => o.value) } : null }; })()`;
  await b.evaluate(`window.__ui.items()[${peerRow}].pick('report:0'); true`);
  await b.sleep(300);
  const asked = await b.evaluate(rowState);
  const question = es['friends.report_confirm'].replace('{name}', nameOfAonB).replace('{reason}', es['rooms.report.ramming']);
  check('B picks a reason on A\'s row: the row asks, Confirm or Cancel, and A is not muted', asked.label === question && asked.options.join() === 'confirm,cancel'
    && !(await b.evaluate('window.__rooms()')).peers[0].muted, JSON.stringify(asked));
  await shot(b, 'b-es-report-asks-first');
  await b.evaluate(`window.__ui.items()[${peerRow}].pick('confirm'); true`);
  const reportedNote = es['friends.reported'].replace('{name}', nameOfAonB);
  await b.until(`window.__rooms().note === ${JSON.stringify(reportedNote)}`, 10000).catch(() => {});
  const sentState = await b.evaluate(rowState);
  check('confirmed, the room counts it, A is muted, and an Undo row sits under A\'s', (await b.evaluate('window.__rooms()')).note === reportedNote
    && (await b.evaluate('window.__rooms()')).peers[0].muted && sentState.next && sentState.next.label === es['friends.undo_row'].replace('{name}', nameOfAonB)
    && sentState.next.options.join() === 'unreport,unreport_unmute', JSON.stringify({ note: (await b.evaluate('window.__rooms()')).note, sentState }));
  /* Found by its words, straight after, since it goes after UNDO_MS and
   * a round trip to a loaded page can take seconds. */
  const undoLabel = es['friends.undo_row'].replace('{name}', nameOfAonB);
  await b.evaluate(`window.__ui.items().find((it) => it.label === ${JSON.stringify(undoLabel)}).pick('unreport_unmute'); true`);
  const undoneNote = es['friends.unreported'].replace('{name}', nameOfAonB);
  await b.until(`window.__rooms().note === ${JSON.stringify(undoneNote)}`, 10000).catch(() => {});
  const after = await b.evaluate('window.__rooms()');
  check('Undo takes the report back in the room, and the mute that came with it', after.note === undoneNote && !after.peers[0].muted,
    JSON.stringify({ note: after.note, muted: after.peers[0].muted }));

  await a.evaluate("window.__ui.show('friends'); true");
  await a.sleep(800);
  await shot(a, 'a-en-friends-menu-in-public-room');
  await b.evaluate("window.__ui.show('friends'); true");
  await b.sleep(800);
  await shot(b, 'b-es-friends-menu-in-public-room');

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
