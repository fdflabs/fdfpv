/*
 * cloud-selftest.js: the track uploader (src/share/cloud.js), in Node.
 *
 *     node scripts/cloud-selftest.js      (npm run cloud:selftest)
 *
 * A save made while the upload before it is still on the wire goes up too.
 * The uploader used to write "online" for the track when that earlier upload
 * came back, over the "pending" the newer save had written, so the newer
 * save stayed in the browser, was never sent, and the track said online.
 * Found through tracks:e2e, where B renamed its copy and saved while the
 * copy's first upload was in flight, and the server kept the old name.
 *
 * And an edit made while an upload is on the wire is not saved when that
 * upload answers: the builder's Save box reads "Not saved" (course.js
 * saveState over the save mark), and the next save sends the edit. The box
 * used to read "Saved and online" there, because it took an edit in the
 * same whole second as the save for no edit at all (model.js nowUtc).
 *
 * Nothing here touches a network: fetch is a stand in whose answers the
 * test releases, and the page's window and storage are stand ins too.
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

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const win = new EventTarget();
win.location = { search: '', hostname: 'fdflabs.github.io' };
globalThis.window = win;
localStorage.setItem('webfpv.tracks.origin', 'http://tracks.test');
localStorage.setItem('webfpv.pilot.name', 'Ada');

/* Every PUT, held until the test lets it answer. */
const puts = [];
globalThis.fetch = (url, init = {}) => {
  if (!init.method || init.method === 'GET') {
    return Promise.resolve(new Response('{"tracks":[]}', { status: 200 }));
  }
  const body = JSON.parse(init.body);
  return new Promise((resolve) => {
    puts.push({
      url,
      name: JSON.parse(body.document).name,
      answer: () => resolve(new Response(JSON.stringify({ updatedUtc: new Date().toISOString() }), { status: 200 })),
    });
  });
};

const { startTrackSync } = await import('../src/share/cloud.js');
const { readOnlineStates, saveTrack } = await import('../src/trackbuilder/storage.js');
const { createSaveMark, newCourse, saveState } = await import('../src/builder/course.js');
const { touch } = await import('../src/trackbuilder/model.js');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) {
      return false;
    }
    await sleep(10);
  }
  return true;
}

startTrackSync({ publicKey: async () => 'key', signBytes: async () => ({ key: 'key', sig: 'sig' }) });

console.log('A save made while the one before it is uploading');
const doc = newCourse('swiss2', 'Ridge Run');
saveTrack(doc);
check('the first save is sent', await until(() => puts.length === 1) && puts[0].name === 'Ridge Run');
doc.name = 'Ridge Run v2';
saveTrack(doc);
/* Past the uploader's 400 ms debounce, so the second save's pass has asked
 * to run while the first upload is still out. */
await sleep(700);
check('and while it is out, the newer save is pending', readOnlineStates()[doc.id].state === 'pending');
puts[0].answer();
const second = await until(() => puts.length === 2);
check('when the first comes back, the newer save is sent too', second && puts[1].name === 'Ridge Run v2',
  `${puts.length} upload(s): ${puts.map((p) => p.name).join(', ')}`);
if (second) {
  puts[1].answer();
}
check('and only then is the track online', await until(() => readOnlineStates()[doc.id].state === 'online'),
  JSON.stringify(readOnlineStates()[doc.id]));

/* The builder's side of it, as buildmode.js does it: a save marks the
 * revision it wrote, an edit is a new revision. */
console.log('An edit made while an upload is on the wire');
{
  const mark = createSaveMark();
  const track = newCourse('swiss2', 'Valley Loop');
  mark.seat(false);
  const box = () => saveState(mark.dirty, true, readOnlineStates()[track.id]);
  /* At the start of a whole second, so the edit below falls in the same
   * second as the save: the case the old box took for no edit. */
  await sleep(1000 - (Date.now() % 1000) + 5);
  const before = puts.length;
  saveTrack(track);
  mark.saved();
  track.name = 'Valley Loop edited';
  touch(track);
  mark.edited();
  check('the save is sent', await until(() => puts.length === before + 1) && puts[before].name === 'Valley Loop');
  puts[before].answer();
  await until(() => readOnlineStates()[track.id].state === 'online');
  check('when it answers, the server holds the save and the box still says the edit is not saved',
    readOnlineStates()[track.id].state === 'online' && box() === 'unsaved', box());
  saveTrack(track);
  mark.saved();
  const sent = await until(() => puts.length === before + 2);
  check('and the next save sends the edit', sent && puts[before + 1].name === 'Valley Loop edited');
  if (sent) {
    puts[before + 1].answer();
  }
  check('then the box says saved and online', await until(() => box() === 'online'), box());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
