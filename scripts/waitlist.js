/*
 * waitlist.js: the owner's hand on the beta waitlist
 * (tracks-api/waitlist.js), from the desktop.
 *
 *   node scripts/waitlist.js SECRET_FILE                 who waits, who is in
 *   node scripts/waitlist.js SECRET_FILE approve EMAIL   invite an address
 *   node scripts/waitlist.js SECRET_FILE revoke EMAIL    back to waiting
 *   node scripts/waitlist.js SECRET_FILE remove EMAIL    the row, gone
 *
 * SECRET_FILE is the file deploy/vm/deploy.sh wrote the tracks admin
 * secret to, its first line. The secret is read from the file so it is
 * never typed into a shell's history.
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

import { readFileSync } from 'node:fs';

import { API_ORIGIN } from '../src/share/api.js';

const VERBS = {
  approve: ['POST', { approved: true }],
  revoke: ['POST', { approved: false }],
  remove: ['DELETE', {}],
};

const [secretFile, verb, email] = process.argv.slice(2);
if (!secretFile || (verb && (!VERBS[verb] || !email))) {
  console.error('usage: node scripts/waitlist.js SECRET_FILE [approve|revoke|remove EMAIL]');
  process.exit(2);
}
const secret = readFileSync(secretFile, 'utf8').split('\n')[0].trim();

async function call(method, body) {
  const res = await fetch(`${API_ORIGIN}/api/admin/waitlist`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const got = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${got.error}`);
  }
  return got;
}

if (verb) {
  const [method, body] = VERBS[verb];
  console.log(JSON.stringify(await call(method, { email, ...body })));
}
const { waitlist } = await call('GET');
for (const w of waitlist) {
  console.log(`${w.approvedUtc ? 'invited' : 'waiting'}  ${w.email}  asked ${w.requestedUtc || 'never'}${w.approvedUtc ? `  invited ${w.approvedUtc}` : ''}`);
}
console.log(`${waitlist.length} on the list, ${waitlist.filter((w) => !w.approvedUtc).length} waiting`);
