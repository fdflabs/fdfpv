/*
 * smoke.js: prove a running tracks server over HTTP.
 *
 *   ADMIN_SECRET=... node tracks-api/smoke.js http://127.0.0.1:8787
 *   ADMIN_SECRET=... node tracks-api/smoke.js https://fdfpv-tracks.<you>.workers.dev
 *
 * Health, version, the retired tracks routes (404, the combat-only cut,
 * 2026-10-20), the admin overview with the secret and a refusal without
 * it, against whatever origin is named. It writes nothing; the secret is
 * needed for the overview, and without one it refuses to start.
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

const origin = String(process.argv[2] || '').replace(/\/+$/, '');
const secret = process.env.ADMIN_SECRET || '';
if (!origin || !secret) {
  console.error('usage: ADMIN_SECRET=... node tracks-api/smoke.js <origin>');
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

console.log(`tracks server at ${origin}`);
let r = await call('GET', '/api/health');
check('health', r.status === 200 && r.body && r.body.ok === true, JSON.stringify(r.body));
r = await call('GET', '/api/version');
check('version', r.status === 200 && r.body && 'commit' in r.body, JSON.stringify(r.body));
r = await call('GET', '/api/tracks?limit=1');
check('the retired tracks list is a 404', r.status === 404, `${r.status}`);
r = await call('GET', '/api/admin/overview', undefined, { authorization: `Bearer ${secret}` });
check('the admin overview counts the stored tracks', r.status === 200 && Number.isInteger(r.body.tracks), JSON.stringify(r.body));
r = await call('GET', '/api/admin/overview', undefined, { authorization: 'Bearer wrong' });
check('and refuses a wrong secret', r.status === 401);

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
