/*
 * pilot.js: the handle a pilot flies, publishes and posts under.
 *
 * A handle is not a login: it is a short name that travels with a
 * published course and a posted lap and stays in this browser until the
 * pilot changes it. The simulator, the builder and the board read the same
 * stored name. Nothing here touches the network.
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

import { str } from '../strings/index.js';
import { carryRenamedKeys } from './oldkeys.js';

const HANDLE_KEY = 'fdfpv.pilot.name';

/*
 * The signed in account's record, { session, callsign, publicKey, ... },
 * written by src/share/account.js and read here so that everything that
 * only needs the name avoids the account module's network code. While a
 * browser is signed in, the callsign is the pilot's name everywhere.
 */
export const ACCOUNT_KEY = 'fdfpv.account.v1';

/* Both were webfpv.* before the project took its own name; moved once at
 * load (src/share/oldkeys.js). */
carryRenamedKeys([['webfpv.pilot.name', HANDLE_KEY], ['webfpv.account.v1', ACCOUNT_KEY]]);

export function readAccount() {
  let record;
  try {
    record = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
  } catch (e) {
    return null;
  }
  return record && typeof record.session === 'string' ? record : null;
}

/* The handles the board accepts. KEEP IN STEP WITH NAME_RE in the board's
 * src/validate.js, which decides: a name this allows and the board refuses
 * is only found out at upload. */
const HANDLE = /^[A-Za-z0-9._\- ]{2,24}$/;

/* `raw` trimmed with runs of whitespace made one space, or null when that
 * is not a handle the board takes. */
export function normaliseName(raw) {
  const tidy = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return HANDLE.test(tidy) ? tidy : null;
}

/* The name to fly under: a signed in account's callsign (null if it is not
 * a valid handle), otherwise the stored handle. */
export function readPilotName() {
  const account = readAccount();
  if (account && account.callsign) {
    return normaliseName(account.callsign);
  }
  try {
    return normaliseName(localStorage.getItem(HANDLE_KEY) || '');
  } catch (e) {
    return null;
  }
}

/* Keep a new handle and return it tidied, or null for one the board would
 * refuse. A refused write still returns the name: it works for this page. */
export function writePilotName(raw) {
  const handle = normaliseName(raw);
  if (handle) {
    try {
      localStorage.setItem(HANDLE_KEY, handle);
    } catch (e) {
      /* Private mode: kept for this page only. */
    }
  }
  return handle;
}

export function nameRules() {
  return str('pilot.two_to_twenty_four_letters_numbers');
}
