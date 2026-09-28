/*
 * smoke.js: prove a running tracks server over HTTP, then clean up after.
 *
 *   ADMIN_SECRET=... node tracks-api/smoke.js http://127.0.0.1:8787
 *   ADMIN_SECRET=... node tracks-api/smoke.js https://fdfpv-tracks.<you>.workers.dev
 *
 * Publish, list, open, update with the right key, a refused update with a
 * wrong key, the word filter, and the rate limit, against whatever origin is
 * named. Every track it saves is deleted through the admin route at the end,
 * which is why it needs the admin secret; without one it refuses to start
 * rather than leave test tracks in everybody's list.
 *
 * THE RATE LIMIT STEP SPENDS THIS ADDRESS'S WRITES for the current window
 * (tracks-api/limits.js), so a pilot saving from the same network in the
 * next ten minutes is refused until the window turns over. Pass --no-rate
 * to skip it on a deployed server somebody is using.
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

import { createIdentity, memoryStorage, trackMessage } from '../src/share/identity.js';
import { newTrackId } from '../src/trackbuilder/model.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { WRITE_LIMIT } from './limits.js';

const origin = String(process.argv[2] || '').replace(/\/+$/, '');
const skipRate = process.argv.includes('--no-rate');
const secret = process.env.ADMIN_SECRET || '';
if (!origin || !secret) {
  console.error('usage: ADMIN_SECRET=... node tracks-api/smoke.js <origin> [--no-rate]');
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (e) {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

let counter = Date.now();
async function save(pilot, doc, author = 'Smoke Test') {
  const ts = (counter += 1);
  const documentText = JSON.stringify(doc);
  const signed = await pilot.signBytes(await trackMessage({ id: doc.id, ts, author, documentText }));
  return call('PUT', `/api/tracks/${doc.id}`, { document: documentText, author, ts, ...signed });
}

const made = new Set();
const a = createIdentity(memoryStorage());
const b = createIdentity(memoryStorage());

try {
  console.log(`tracks server at ${origin}`);
  const doc = mapTrackDocument({ id: newTrackId(), name: 'Smoke test ring', gates: 3 });
  made.add(doc.id);
  let r = await save(a, doc);
  check('publish', r.status === 201, JSON.stringify(r.body));
  r = await call('GET', '/api/tracks?limit=50');
  check('list', r.status === 200 && r.body.tracks.some((t) => t.id === doc.id));
  r = await call('GET', `/api/tracks/${doc.id}`);
  check('get', r.status === 200 && r.body.document && r.body.document.id === doc.id);
  r = await save(a, { ...doc, name: 'Smoke test ring, edited' });
  check('update with the right key', r.status === 200 && r.body.name === 'Smoke test ring, edited', JSON.stringify(r.body));
  r = await save(b, { ...doc, name: 'Not yours' });
  check('update with a wrong key is refused', r.status === 409 && r.body.conflict === true, JSON.stringify(r.body));
  const rude = mapTrackDocument({ id: newTrackId(), name: 'Sh1t track', gates: 3 });
  r = await save(a, rude);
  check('the word filter refuses a rude name', r.status === 422, JSON.stringify(r.body));
  if (r.status < 300) {
    made.add(rude.id);
  }
  if (!skipRate) {
    let limited = null;
    for (let i = 0; i < WRITE_LIMIT + 2 && !limited; i += 1) {
      const s = await save(a, { ...doc, name: `Smoke test ring ${i}` });
      if (s.status === 429) {
        limited = s;
      }
    }
    check('the rate limit refuses a burst', Boolean(limited) && limited.body.retryAfterS > 0);
  }
} finally {
  for (const id of made) {
    const r = await call('DELETE', `/api/admin/tracks/${id}`, undefined, { authorization: `Bearer ${secret}` });
    check(`cleanup ${id}`, r.status === 200 || r.status === 404, JSON.stringify(r.body));
  }
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
