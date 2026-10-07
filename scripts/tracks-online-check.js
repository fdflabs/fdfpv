/*
 * tracks-online-check.js: the owner's acceptance test, in two browsers.
 *
 *   TRACKS_ORIGIN=http://127.0.0.1:8787 ADMIN_SECRET=... node scripts/tracks-online-check.js
 *   (npm run tracks:e2e)
 *
 * "I create a track, then I go home on another computer and log into the
 * same website and I can't see the track." Two headless Chromium profiles
 * stand in for the two computers, each with its own storage and so its own
 * pilot key, against a running tracks server (tracks-api/, wrangler dev
 * --local or the deployed one):
 *
 *   A  builds a ring of three gates in the Swiss valley and saves it with
 *      Ctrl S. It goes online, under A's key.
 *   B  with nothing in its storage, finds it in My tracks among everybody's
 *      tracks, plays it, and is flying it in the world it was built in.
 *   B  edits a copy: the copy is B's own new track, and A's is untouched.
 *   B  saving A's id itself is refused by the server and becomes a copy.
 *   A  renames its track and saves: the same id, updated, still A's.
 *   A  offline: the save stays in the browser, says it is waiting, and goes
 *      up by itself when the connection is back.
 *   B  a track on a world this build no longer has is listed as retired.
 *
 * Every track it put on the server is deleted through the admin route at
 * the end, which is why it needs the admin secret.
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
import {
  B, hold, key, leave, lookAlong, placeHere, takeMouse,
} from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { createIdentity, memoryStorage, trackMessage } from '../src/share/identity.js';
import { newTrackId } from '../src/trackbuilder/model.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACKS = String(process.env.TRACKS_ORIGIN || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const SECRET = process.env.ADMIN_SECRET || '';
const ONLINE_KEY = 'webfpv.trackbuilder.online.v1';
const RUN = Date.now().toString(36);

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}

const made = new Set();

async function server(path) {
  const res = await fetch(`${TRACKS}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

function seed() {
  const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('fdfpv.pilot.name', ${JSON.stringify(`Pilot ${RUN}`)});
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

async function open(name) {
  const page = await openPage({
    root, width: 1280, height: 720, url: `/index.html?map=swiss2&tracks=${encodeURIComponent(TRACKS)}`, seed: seed(),
  });
  await page.until('!!window.__shellReady', 240000);
  await page.until('window.__map && window.__map().ready', 300000);
  console.log(`profile ${name} is up`);
  return page;
}

const onlineState = (page, id) => page.evaluate(`((JSON.parse(localStorage.getItem('${ONLINE_KEY}') || '{}'))[${JSON.stringify(id)}] || {}).state || ''`);

/* Into the builder from a flight in the Swiss valley, and a ring of three
 * gates hung in the air in front of the spawn. */
async function buildRing(page) {
  await page.until('!!window.__build', 60000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight'", 120000);
  await page.sleep(600);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 20000);
  await takeMouse(page);
  const here = await page.evaluate('window.__craftState()');
  const cx = here.worldX;
  const cz = here.worldZ - 60;
  const ground = await page.evaluate(`Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => window.__heightAt(${cx} + 40 * Math.cos(k * Math.PI / 4), ${cz} + 40 * Math.sin(k * Math.PI / 4))), window.__heightAt(${cx}, ${cz}))`);
  await hold(page, 'gate');
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const P = [cx + 30 * Math.cos(a), ground + 45, cz + 30 * Math.sin(a)];
    const T = [-Math.sin(a), 0, Math.cos(a)];
    await lookAlong(page, P.map((v, j) => v - T[j] * 20), Math.atan2(-T[0], -T[2]), 0);
    await placeHere(page, { air: true });
  }
  return page.evaluate(B('.gates.length'));
}

/* Ctrl S, then the builder's own word on whether it went up. */
async function saveAndWait(page, want) {
  await key(page, 'KeyS', { ctrl: true });
  await page.until(`${want.test ? `${want}.test(${B('.message')})` : 'false'}`, 60000).catch(() => {});
  return page.evaluate(B('.message'));
}

function cardOf(page, id) {
  return `window.__ui.items().find((it) => it.course && it.course.track.id === ${JSON.stringify(id)})`;
}

async function main() {
  const health = await fetch(`${TRACKS}/api/health`).then((r) => r.ok).catch(() => false);
  say(health, `a tracks server answers at ${TRACKS}`);
  if (!health || !SECRET) {
    say(Boolean(SECRET), 'ADMIN_SECRET is set, so the test tracks can be cleaned up');
    return;
  }

  /* A. */
  const a = await open('A');
  const name = `Ring ${RUN}`;
  let id = '';
  try {
    const gates = await buildRing(a);
    say(gates === 3, `A built a ring of ${gates} gates in the Swiss valley`);
    await a.evaluate(`window.__build.rename(${JSON.stringify(name)})`);
    id = await a.evaluate(B('.doc.id'));
    made.add(id);
    const said = await saveAndWait(a, /is online/);
    say(/is online for everybody/.test(said), `Ctrl S saves it and the builder says it went up: ${JSON.stringify(said)}`);
    say(await onlineState(a, id) === 'online', 'A\'s library marks it online');
    const got = await server(`/api/tracks/${id}`);
    say(got.status === 200 && got.body.name === name && got.body.map === 'swiss2' && got.body.gates === 3
      && got.body.author === `Pilot ${RUN}`, `the server holds ${id}: ${JSON.stringify(got.body && { name: got.body.name, map: got.body.map, gates: got.body.gates, author: got.body.author })}`);
    const aKey = got.body && got.body.owner;

    /* B, the other computer. */
    const b = await open('B');
    try {
      const bKey = await b.evaluate("JSON.parse(localStorage.getItem('fdfpv.pilot.key.v1') || 'null')");
      say(!bKey || bKey.publicRaw !== aKey, 'B has a pilot key of its own, not A\'s');
      say(await b.evaluate(`!(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}'))[${JSON.stringify(id)}]`), 'and B\'s own library does not hold the track');
      await b.evaluate("window.__ui.show('courses'), true");
      await b.until(`Boolean(${cardOf(b, id)})`, 60000).catch(() => {});
      const card = await b.evaluate(`(() => { const c = ${cardOf(b, id)}; return c ? { kind: c.course.kind, label: c.label, note: c.note } : null; })()`);
      say(Boolean(card) && card.kind === 'cloud' && card.label === name, `B's My tracks lists it among everybody's: ${JSON.stringify(card)}`);
      const shown = await b.evaluate(`[...document.querySelectorAll('.course-card')].some((c) => c.textContent.includes(${JSON.stringify(name)}) && c.textContent.includes('Swiss'))`);
      say(shown, 'as a card on screen with its world and pilot');
      /* Play seats it and the world builds round it; Fly on the launch
       * card is the pilot's next key, as in scripts/map-share-check.js. */
      await b.evaluate(`window.__ui.actOnCard('card-fly', ${cardOf(b, id)}), true`);
      await b.until(`(JSON.parse(localStorage.getItem('fdfpv.share.import.v1') || 'null') || {}).id === ${JSON.stringify(id)} && window.__map().ready && window.__map().id === 'swiss2' && window.__map().mode === 'race' && window.__race().gates.length === 3`, 300000).catch(() => {});
      const seated = await b.evaluate("({ seat: (JSON.parse(localStorage.getItem('fdfpv.share.import.v1') || 'null') || {}).id, map: window.__map().id, mode: window.__map().mode, gates: window.__race().gates.length, key: window.__race().key })");
      say(seated.seat === id && seated.map === 'swiss2' && seated.mode === 'race' && seated.gates === 3 && String(seated.key).endsWith(id),
        `B's Play seats it as a race in the Swiss valley over its 3 gates: ${JSON.stringify(seated)}`);
      const startGate = (await b.evaluate(B('.gates')))[0].centre;
      await b.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
      await b.until("window.__craftState().mode === 'flight'", 120000).catch(() => {});
      /* Fly plays the pad shot and holds the craft at its start through the
       * countdown; then the sticks move it, as in map-share-check.js. */
      await b.until(`(() => { const c = window.__craftState(); const g = ${JSON.stringify(startGate)}; return Math.hypot(c.worldX - g[0], c.worldY - g[1], c.worldZ - g[2]) < 10; })()`, 120000).catch(() => {});
      const c0 = await b.evaluate('window.__craftState()');
      const off = Math.hypot(c0.worldX - startGate[0], c0.worldY - startGate[1], c0.worldZ - startGate[2]);
      /* Drawing off, so a frame is the plant's step and not the software
       * rasteriser's second, and the countdown passes in wall time. */
      await b.evaluate('window.__drawOff(true), window.__stick(0, 0, 0, 0.6), true');
      await b.until(`(() => { const c = window.__craftState(); return Math.hypot(c.worldX - ${c0.worldX}, c.worldY - ${c0.worldY}, c.worldZ - ${c0.worldZ}) > 1; })()`, 90000).catch(() => {});
      const c1 = await b.evaluate('window.__craftState()');
      await b.evaluate('window.__stick(), window.__drawOff(false), true');
      const moved = Math.hypot(c1.worldX - c0.worldX, c1.worldY - c0.worldY, c1.worldZ - c0.worldZ);
      say(c1.mode === 'flight' && off < 10 && moved > 1,
        `and flies it: started ${off.toFixed(1)} m before its start gate, and the sticks moved it ${moved.toFixed(1)} m`);

      /* B edits a copy. */
      await b.evaluate("window.__ui.show('courses'), true");
      await b.until(`Boolean(${cardOf(b, id)})`, 60000).catch(() => {});
      await b.evaluate(`window.__ui.actOnCard('card-editcopy', ${cardOf(b, id)}), true`);
      await b.until(`window.__build && ${B('.state')} === 'building' && ${B('.doc.id')} !== ${JSON.stringify(id)}`, 240000).catch(() => {});
      const copyId = await b.evaluate(B('.doc.id'));
      made.add(copyId);
      say(copyId && copyId !== id && (await b.evaluate(B('.gates.length'))) === 3, `Edit a copy opens B's builder on a copy under a new id: ${copyId}`);
      await b.evaluate(`window.__build.rename(${JSON.stringify(`${name} by B`)})`);
      const bSaid = await saveAndWait(b, /by B is online/);
      say(/by B is online/.test(bSaid), `B saves the copy and it goes up: ${JSON.stringify(bSaid)}`);
      const copy = await server(`/api/tracks/${copyId}`);
      const orig = await server(`/api/tracks/${id}`);
      say(copy.status === 200 && copy.body.owner !== aKey && copy.body.name === `${name} by B`, 'the copy is B\'s own track online');
      say(orig.body && orig.body.name === name && orig.body.owner === aKey, 'and A\'s track is untouched');

      /* B saving A's id itself: refused, and becomes a copy. */
      const forced = await b.evaluate(`(async () => {
        const s = await import('/src/trackbuilder/storage.js');
        const r = await fetch(${JSON.stringify(`${TRACKS}/api/tracks/${id}`)});
        const doc = (await r.json()).document;
        doc.name = ${JSON.stringify(`${name} hijacked`)};
        s.saveTrack(doc);
        return true;
      })()`);
      await b.until(`!(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}'))[${JSON.stringify(id)}]`, 60000).catch(() => {});
      const fork = await b.evaluate(`(() => {
        const lib = JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}');
        const forks = JSON.parse(localStorage.getItem('webfpv.trackbuilder.forks.v1') || '{}');
        const to = forks[${JSON.stringify(id)}];
        return { to, inLib: Boolean(to && lib[to]), oldInLib: Boolean(lib[${JSON.stringify(id)}]) };
      })()`);
      if (fork.to) {
        made.add(fork.to);
      }
      await b.until(`((JSON.parse(localStorage.getItem('${ONLINE_KEY}') || '{}'))[${JSON.stringify(fork.to || 'none')}] || {}).state === 'online'`, 60000).catch(() => {});
      const after = await server(`/api/tracks/${id}`);
      const forkOnline = fork.to ? await server(`/api/tracks/${fork.to}`) : { status: 0 };
      say(forced && fork.inLib && !fork.oldInLib && after.body.name === name && after.body.owner === aKey
        && forkOnline.status === 200 && forkOnline.body.name === `${name} hijacked`,
      `B saving A's id is refused by the server and becomes B's copy ${fork.to}; A's stays "${after.body && after.body.name}"`);

      /* A track on a retired world. */
      const pilot = createIdentity(memoryStorage());
      const old = mapTrackDocument({ id: newTrackId(), name: `Downtown ${RUN}`, map: 'city', gates: 3 });
      const text = JSON.stringify(old);
      const ts = Date.now();
      const sig = await pilot.signBytes(await trackMessage({ id: old.id, ts, author: '', documentText: text }));
      const put = await fetch(`${TRACKS}/api/tracks/${old.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document: text, author: '', ts, ...sig }) });
      made.add(old.id);
      await b.evaluate("window.__ui.show('title'), window.__ui.show('courses'), true");
      await b.until(`Boolean(${cardOf(b, old.id)})`, 60000).catch(() => {});
      const retired = await b.evaluate(`(() => {
        const c = ${cardOf(b, old.id)};
        if (!c) { return null; }
        window.__ui.cardSubject = 'cloud:' + c.course.track.id;
        const rows = window.__ui.items().filter((it) => !it.course).map((it) => it.action || it.label);
        window.__ui.cardSubject = null;
        return { note: c.note, rows };
      })()`);
      say(put.status === 201 && Boolean(retired) && /retired/i.test(retired.note) && !retired.rows.includes('card-fly'),
        `a track on a retired world is listed as retired, with no Play: ${JSON.stringify(retired)}`);
      /* The one 409 is the refusal the hijack step above asked for; Chrome
       * logs any failed response as a resource error. */
      const bErrors = b.errors.filter((e) => !/status of 409\b/.test(e));
      say(bErrors.length === 0, `B: no page errors beyond the refused save${bErrors.length ? `: ${JSON.stringify(bErrors.slice(0, 5))}` : ''}`);
    } finally {
      await b.close();
    }

    /* A updates its own. */
    await a.evaluate(`window.__build.rename(${JSON.stringify(`${name} v2`)})`);
    const aSaid = await saveAndWait(a, /v2 is online/);
    const upd = await server(`/api/tracks/${id}`);
    say(/is online/.test(aSaid) && upd.body.name === `${name} v2` && upd.body.owner === aKey, `A's edit updates its own track in place: "${upd.body && upd.body.name}"`);

    /* A offline. */
    await a.cdp.send('Network.enable', {}, a.sessionId);
    await a.cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, a.sessionId);
    await a.evaluate(`window.__build.rename(${JSON.stringify(`${name} v3`)})`);
    const offSaid = await saveAndWait(a, /connection is back/);
    const pending = await onlineState(a, id);
    const kept = await a.evaluate(`(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}'))[${JSON.stringify(id)}].name`);
    say(/connection is back/.test(offSaid) && pending === 'pending' && kept === `${name} v3`,
      `offline, the save stays in the browser and says it is waiting: ${JSON.stringify(offSaid)}, state ${pending}`);
    await a.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, a.sessionId);
    await a.evaluate("window.dispatchEvent(new Event('online')), true");
    await a.until(`((JSON.parse(localStorage.getItem('${ONLINE_KEY}') || '{}'))[${JSON.stringify(id)}] || {}).state === 'online'`, 60000).catch(() => {});
    const back = await server(`/api/tracks/${id}`);
    say(back.body && back.body.name === `${name} v3`, `back online, it goes up by itself: "${back.body && back.body.name}"`);
    say(a.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e)).length === 0,
      `A: no page errors beyond the offline fetches${a.errors.length ? `: ${JSON.stringify(a.errors.slice(0, 5))}` : ''}`);
    await leave(a);
  } finally {
    await a.close();
  }
}

try {
  await main();
} finally {
  for (const id of made) {
    const res = await fetch(`${TRACKS}/api/admin/tracks/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${SECRET}` } }).catch(() => null);
    say(Boolean(res) && (res.status === 200 || res.status === 404), `cleaned up ${id}`);
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
