/*
 * identity-selftest.js: the pilot key in plain Node. Run with
 * npm run identity:selftest.
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

import { createIdentity, memoryStorage, verifyTimeSignature, KEY_STORAGE } from '../src/share/identity.js';

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

console.log('pilot key');
const storeA = memoryStorage();
const a = createIdentity(storeA);
const keyA = await a.publicKey();
check('a key is made on first use and stored', typeof keyA === 'string' && keyA.length === 88 && Boolean(storeA.getItem(KEY_STORAGE)), keyA.length);
check('and the same key comes back next time', (await createIdentity(storeA).publicKey()) === keyA);

const post = { trackId: 'trk-1a2b3c4d', lapMs: 29110.4, ghost: 'RlBWR0hTVDE=' };
const signed = await a.signTime(post);
check('a signed post carries the key', signed.key === keyA);
check('and the board verifies it', await verifyTimeSignature({ ...signed, ...post }) === true);
check('a rounded lap verifies too', await verifyTimeSignature({ ...signed, ...post, lapMs: 29110 }) === true);
check('another track does not', await verifyTimeSignature({ ...signed, ...post, trackId: 'trk-00000000' }) === false);
check('another lap does not', await verifyTimeSignature({ ...signed, ...post, lapMs: 29000 }) === false);
check('another ghost does not', await verifyTimeSignature({ ...signed, ...post, ghost: 'RlBWR0hTVDI=' }) === false);
check('a bent signature does not', await verifyTimeSignature({ ...signed, ...post, sig: `${signed.sig.slice(0, -4)}AAA=` }) === false);
check('junk for a key does not', await verifyTimeSignature({ ...signed, ...post, key: 'not a key' }) === false);

const b = createIdentity(memoryStorage());
const keyB = await b.publicKey();
check('another browser gets another key', keyB !== keyA);
const forged = await b.signTime(post);
check('and its signature does not verify under the first key', await verifyTimeSignature({ key: keyA, sig: forged.sig, ...post }) === false);

const carried = createIdentity(memoryStorage());
const imported = await carried.importText(await a.exportText());
check('an exported key imports as the same pilot', imported === keyA && (await carried.publicKey()) === keyA);
const carriedSig = await carried.signTime(post);
check('and signs as the same pilot', await verifyTimeSignature({ ...carriedSig, ...post }) === true && carriedSig.key === keyA);
let refused = false;
try {
  await carried.importText('{"v":1}');
} catch (e) {
  refused = /pilot key/.test(e.message);
}
check('text that is not a key is refused on import', refused);
a.forget();
check('forgetting makes a new key next time', (await a.publicKey()) !== keyA);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
