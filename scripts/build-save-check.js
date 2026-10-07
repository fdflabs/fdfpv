/*
 * build-save-check.js: the builder's Save button, in the real page.
 *
 *   node scripts/build-save-check.js            (npm run builder:save)
 *   SHOTS=dir node scripts/build-save-check.js  and keep two pictures
 *
 * The owner's ask: "inside the track builder, there should be a save track
 * button." A headless page builds in the Swiss valley against a tracks
 * server of its own, tracks-api/node.js on a throwaway SQLite file on a
 * loopback port, so nothing here ever reaches the live server:
 *
 *   A new track's button says it is not saved.
 *   With the mouse freed, a click on the button asks the unnamed track's
 *   name first, because a saved track is public: a name the server's word
 *   filter refuses is refused there and then; once named it is saved into
 *   this browser's library, the builder says so, the button walks to
 *   online and the server holds the track under that name. The click
 *   placed no piece and did not take the mouse.
 *   An edit after that is not saved again, and Ctrl S, the same save, puts
 *   it back online without asking again.
 *   A new track (N) answered blank is saved under the generated name.
 *   With the server gone the button's save stays in the browser and says it
 *   is not online yet, and goes online by itself when the server is back.
 *   A second pilot who has chosen no aircraft, and so flies the Timber,
 *   saves a track of five inch gates the Timber does not fit the same way.
 *   Their My tracks lists it, and the first pilot's, each saying it flies
 *   on the five inch, and Play flies their own on the five inch
 *   (bug-a0b44950: both used to be left out of the list, so the save read
 *   as one that never happened, for the pilot and for everybody else).
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

import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  B, NAME_ASKED, answerName, click, freeMouse, frames, hold, key, leave, placeHere, saveKey, takeMouse,
} from '../tests/lib/buildkeys.js';
import { FIRST_AIRFRAME, SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { startTracks } from '../tracks-api/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const ONLINE_KEY = 'webfpv.trackbuilder.online.v1';
const SHOTS = process.env.SHOTS || '';
const NAME = `Ridge Run ${Date.now().toString(36)}`;
/* A word the server's filter refuses, the first on its list, read rather
 * than written here. */
const BAD = readFileSync(join(root, 'tracks-api/words.js'), 'utf8').match(/const ANYWHERE = \[\s*'([^']+)'/)[1];

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
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
    localStorage.setItem('webfpv.pilot.name', 'Save Check');
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

/* The pilot the ticket came from: nothing chosen, so the shell seats
 * FIRST_AIRFRAME, and no pilot name either. */
function freshSeed() {
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.fpsCap = 0;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

const button = 'window.__build.rects().save';
const saveOf = (page) => page.evaluate(`(() => { const s = ${button}; return s ? { ...s } : null; })()`);
const stored = (page, id) => page.evaluate(`Boolean((JSON.parse(localStorage.getItem('${LIBRARY_KEY}') || '{}'))[${JSON.stringify(id)}])`);
const onlineState = (page, id) => page.evaluate(`((JSON.parse(localStorage.getItem('${ONLINE_KEY}') || '{}'))[${JSON.stringify(id)}] || {}).state || ''`);

/* Every state the button shows, as it changes, recorded in the page so a
 * state that lasts a few milliseconds is not missed between two polls. */
const RECORD = `(() => {
  window.__saveSeen = [];
  const tick = () => {
    const s = ${button};
    const v = s ? s.state : '';
    if (v !== window.__saveSeen[window.__saveSeen.length - 1]) {
      window.__saveSeen.push(v);
    }
  };
  clearInterval(window.__saveRec);
  window.__saveRec = setInterval(tick, 10);
  return true;
})()`;

async function picture(page, name) {
  if (!SHOTS) {
    return;
  }
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'));
  console.log(`  picture ${join(SHOTS, name)}`);
}

async function clickSave(page) {
  const s = await saveOf(page);
  await click(page, 'left', { x: Math.round(s.x), y: Math.round(s.y) });
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'save-check-'));
  let tracks = await startTracks({ db: join(dir, 'tracks.db'), port: 0 });
  const port = tracks.port;
  const origin = `http://127.0.0.1:${port}`;
  const server = async (path) => {
    const res = await fetch(`${origin}${path}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  say((await server('/api/health')).status === 200, `a throwaway tracks server answers at ${origin}`);

  let page = await openPage({
    root, width: 1280, height: 720, url: `/index.html?map=swiss2&tracks=${encodeURIComponent(origin)}`, seed: seed(),
  });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until('window.__map && window.__map().ready', 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await frames(page, 3);

    const first = await saveOf(page);
    say(Boolean(first) && first.w > 40 && first.h > 20, `the builder shows a Save button: ${JSON.stringify(first)}`);
    say(first && first.state === 'unsaved', `and a new track's says it is not saved: ${first && first.text}`);

    await takeMouse(page);
    await hold(page, 'gate');
    await placeHere(page, { air: true });
    const id = await page.evaluate(B('.doc.id'));
    const gates = await page.evaluate(B('.gates.length'));
    say(gates === 1, `one gate placed in the valley (${gates})`);

    await freeMouse(page, 640, 300);
    await frames(page, 2);
    await picture(page, '1-before-save.png');
    await page.evaluate(RECORD);
    await clickSave(page);
    await frames(page, 1);
    const dialog = await page.evaluate(`(() => { const f = document.querySelector('.name-dialog-input'); return ${NAME_ASKED} ? { placeholder: f.placeholder, text: document.querySelector('.name-dialog-box').textContent } : null; })()`);
    say(Boolean(dialog) && dialog.placeholder === "Save Check's track 1",
      `the first save of an unnamed track asks for a name, offering ${JSON.stringify(dialog && dialog.placeholder)}`);
    say(!(await stored(page, id)), 'and saves nothing until it is answered');
    await page.evaluate(`(() => { const f = document.querySelector('.name-dialog-input'); f.focus(); f.value = ${JSON.stringify(`the ${BAD} ring`)}; return true; })()`);
    await page.tap('Enter');
    await frames(page, 1);
    say(await page.evaluate(NAME_ASKED) && !(await stored(page, id)),
      `a name the tracks server's word filter refuses keeps the dialog open: ${JSON.stringify(await page.evaluate("(document.querySelector('.name-dialog-err') || {}).textContent"))}`);
    await answerName(page, NAME);
    await page.until(`${button}.state === 'online'`, 60000).catch(() => {});
    const seen = await page.evaluate('window.__saveSeen.slice()');
    const after = await saveOf(page);
    say(await stored(page, id), 'the click saved the track in this browser\'s library');
    say(new RegExp(NAME).test(await page.evaluate(B('.message'))),
      `the builder said so: ${JSON.stringify(await page.evaluate(B('.message')))}`);
    say(after.state === 'online' && after.name === NAME && await onlineState(page, id) === 'online',
      `the button went online: ${seen.join(' > ')}, reads ${JSON.stringify(`${after.name}: ${after.text}`)}`);
    const got = await server(`/api/tracks/${encodeURIComponent(id)}`);
    say(got.status === 200 && got.body && got.body.name === NAME && got.body.map === 'swiss2' && got.body.gates === 1,
      `the local server holds it under its name: ${got.status} ${JSON.stringify(got.body && { name: got.body.name, map: got.body.map, gates: got.body.gates })}`);
    say(await page.evaluate(B('.gates.length')) === 1, 'the click on the button placed no piece');
    say(!(await page.evaluate(B('.locked'))), 'and did not take the mouse');
    await frames(page, 2);
    await picture(page, '2-saved-online.png');

    await takeMouse(page);
    await placeHere(page, { air: true });
    await frames(page, 2);
    const edited = await saveOf(page);
    say(edited.state === 'unsaved', `an edit after the save is not saved: ${edited.text}`);
    const askedAgain = await saveKey(page);
    await page.until(`${button}.state === 'online'`, 60000).catch(() => {});
    const again = await server(`/api/tracks/${encodeURIComponent(id)}`);
    say(!askedAgain && (await saveOf(page)).state === 'online' && again.body && again.body.gates === 2 && again.body.name === NAME,
      `Ctrl S, the same save, does not ask again and puts it back online with ${again.body && again.body.gates} gates`);

    /* N: a new track, and its first save answered blank takes the
     * generated name, never the builder's placeholder. */
    await key(page, 'KeyN');
    await page.until(`${B('.doc.id')} !== ${JSON.stringify(id)}`, 10000);
    const id2 = await page.evaluate(B('.doc.id'));
    await placeHere(page, { air: true });
    await freeMouse(page, 640, 300);
    await clickSave(page);
    const asked2 = await answerName(page, '');
    await page.until(`${button}.state === 'online'`, 60000).catch(() => {});
    const got2 = await server(`/api/tracks/${encodeURIComponent(id2)}`);
    say(asked2 && got2.body && got2.body.name === "Save Check's track 2",
      `a blank name is the generated one: ${JSON.stringify(got2.body && got2.body.name)}`);

    await tracks.stop();
    await placeHere(page, { air: true });
    await freeMouse(page, 640, 300);
    await page.evaluate(RECORD);
    await clickSave(page);
    await page.until(`${button}.state === 'pending' && /online when the connection/.test(${B('.message')})`, 30000).catch(() => {});
    const offline = await saveOf(page);
    say(offline.state === 'pending' && await stored(page, id2),
      `with the server gone it is saved here and says ${JSON.stringify(offline.text)}; the builder: ${JSON.stringify(await page.evaluate(B('.message')))}`);
    tracks = await startTracks({ db: join(dir, 'tracks.db'), port });
    await page.until(`${button}.state === 'online'`, 90000).catch(() => {});
    const back = await server(`/api/tracks/${encodeURIComponent(id2)}`);
    say((await saveOf(page)).state === 'online' && back.body && back.body.gates === 2,
      `and goes online by itself when the server is back: ${(await page.evaluate('window.__saveSeen.slice()')).join(' > ')}, ${back.body && back.body.gates} gates`);

    const errors = page.errors.filter((e) => !/Failed to fetch|ERR_CONNECTION_REFUSED|net::/.test(String(e)));
    say(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await page.close();
    page = null;
    await planePilot(origin, server, id);
  } finally {
    if (page) {
      await page.close();
    }
    await tracks.stop();
    await rm(dir, { recursive: true, force: true });
  }
}

/* Where a card says what it is, from My tracks' own items. */
const cardFor = (id) => `window.__ui.items().find((it) => it.course && it.course.track.id === ${JSON.stringify(id)})`;

async function planePilot(origin, server, firstId) {
  const plane = airframeById(FIRST_AIRFRAME);
  const tight = new RegExp(`Too tight for the ${plane.name}`);
  const page = await openPage({
    root, width: 1280, height: 720, url: `/index.html?map=swiss2&tracks=${encodeURIComponent(origin)}`, seed: freshSeed(),
  });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until('window.__map && window.__map().ready', 300000);
    await page.until('!!window.__build', 60000);
    const seated = await page.evaluate('window.__ui.settings.airframe');
    say(seated === FIRST_AIRFRAME && plane.fixedWing, `a pilot who chose nothing flies the ${plane.name}, a fixed wing: ${seated}`);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await frames(page, 3);
    await takeMouse(page);
    await hold(page, 'gate');
    await placeHere(page, { air: true });
    const id = await page.evaluate(B('.doc.id'));
    const name = `${NAME} on the ${plane.short}`;
    await freeMouse(page, 640, 300);
    await clickSave(page);
    const asked = await answerName(page, name);
    await page.until(`${button}.state === 'online'`, 60000).catch(() => {});
    const got = await server(`/api/tracks/${encodeURIComponent(id)}`);
    say(asked && got.status === 200 && got.body.name === name && got.body.gates === 1,
      `they save a track with the button and a name, and it goes online: ${got.status} ${JSON.stringify(got.body && got.body.name)}`);
    const first = await server(`/api/tracks/${encodeURIComponent(firstId)}`);
    /* Without this the rest proves nothing: a track the plane fits was
     * always listed. */
    say(!got.body.planes.includes(plane.id) && !first.body.planes.includes(plane.id),
      `and neither track fits the ${plane.short}: ${JSON.stringify(got.body.planes)}, ${JSON.stringify(first.body.planes)}`);

    await leave(page);
    await page.evaluate("window.__ui.show('courses'), true");
    await page.until(`Boolean(${cardFor(id)}) && Boolean(${cardFor(firstId)})`, 60000).catch(() => {});
    const own = await page.evaluate(`(() => { const c = ${cardFor(id)}; return c ? { kind: c.course.kind, label: c.label, note: c.note } : null; })()`);
    say(Boolean(own) && own.kind === 'local' && own.label === name && tight.test(own.note),
      `their My tracks lists their own track, and says it flies on the five inch: ${JSON.stringify(own)}`);
    const theirs = await page.evaluate(`(() => { const c = ${cardFor(firstId)}; return c ? { kind: c.course.kind, label: c.label, note: c.note } : null; })()`);
    say(Boolean(theirs) && theirs.kind === 'cloud' && theirs.label === NAME && tight.test(theirs.note),
      `and the other pilot's, from the tracks server: ${JSON.stringify(theirs)}`);

    /* Play on each, from the plane both times: the other pilot's first,
     * then, the plane seated again the way a pilot who never chose one has
     * it, their own. */
    const play = async (cardId, gates) => {
      await page.evaluate("window.__ui.show('courses'), true");
      await page.until(`Boolean(${cardFor(cardId)})`, 60000).catch(() => {});
      await page.evaluate(`window.__ui.actOnCard('card-fly', ${cardFor(cardId)}), true`);
      await page.until(`window.__map().ready && window.__map().mode === 'race' && window.__race().gates.length === ${gates} && window.__ui.settings.airframe === 'interceptor'`, 120000).catch(() => {});
      /* Into the air, because the run is what names the aircraft its lap
       * is filed under (main.js recordKey). */
      await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
      await page.until("window.__craftState().mode === 'flight'", 120000).catch(() => {});
      return page.evaluate("({ airframe: window.__ui.settings.airframe, map: window.__map().id, mode: window.__map().mode, gates: window.__race().gates.length, key: window.__race().key })");
    };
    const onPlay = (f, cardId, gates) => f.airframe === 'interceptor' && f.map === 'swiss2' && f.mode === 'race' && f.gates === gates
      && String(f.key).endsWith(`.map.${cardId}`) && !String(f.key).includes(plane.id);
    if (theirs) {
      const f = await play(firstId, 2);
      say(onPlay(f, firstId, 2), `Play on the other pilot's seats it on the five inch, a race over its 2 gates: ${JSON.stringify(f)}`);
    }
    if (own) {
      await page.evaluate(`(() => {
        const k = ${JSON.stringify(SETTINGS_KEY)};
        const s = JSON.parse(localStorage.getItem(k) || '{}');
        delete s.airframe;
        delete s.airframeAsked;
        localStorage.setItem(k, JSON.stringify(s));
        return true;
      })()`);
      await page.cdp.send('Page.reload', {}, page.sessionId);
      await page.sleep(1000);
      await page.until('!!window.__shellReady', 240000);
      await page.until('window.__map && window.__map().ready', 300000);
      const again = await page.evaluate('window.__ui.settings.airframe');
      const f = await play(id, 1);
      say(again === FIRST_AIRFRAME && onPlay(f, id, 1), `Play on their own, from the ${again} again, seats it on the five inch, a race over its gate: ${JSON.stringify(f)}`);
    }

    const errors = page.errors.filter((e) => !/Failed to fetch|ERR_CONNECTION_REFUSED|net::/.test(String(e)));
    say(!errors.length, `no page errors for the ${plane.short} pilot${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

main().then(() => {
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
