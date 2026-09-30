import { str } from '../strings/index.js';
/*
 * pilot.js: the name a person flies and publishes under.
 *
 * One key, shared by the simulator, the track builder and the public board.
 * A name is not a login. It is a short handle that travels with a published
 * course and with a posted time, and it lives in this browser until they
 * change it. Nothing here talks to the network.
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

const NAME_KEY = 'webfpv.pilot.name';

/*
 * A SIGNED IN PILOT (src/share/account.js) flies under their callsign
 * everywhere, so while this browser is signed in the callsign IS the
 * name: every time, track and room that reads the name gets it. The
 * account's record is { session, callsign, publicKey }, kept here so that
 * everything that only needs to read it does so without the account
 * module's network code.
 */
export const ACCOUNT_KEY = 'webfpv.account.v1';

export function readAccount() {
  try {
    const got = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
    return got && typeof got.session === 'string' ? got : null;
  } catch (e) {
    return null;
  }
}

/* MIRRORS the board's NAME_RE in fdfpv-leaderboard/src/validate.js,
 * which is the one that actually decides. Two repos, so it cannot be
 * imported: change both, or this browser accepts a name the board refuses
 * and the pilot finds out at upload time. */
const NAME_RE = /^[A-Za-z0-9._\- ]{2,24}$/;

export function normaliseName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(name)) {
    return null;
  }
  return name;
}

export function readPilotName() {
  const account = readAccount();
  if (account && account.callsign) {
    return normaliseName(account.callsign);
  }
  try {
    return normaliseName(localStorage.getItem(NAME_KEY) || '');
  } catch (e) {
    return null;
  }
}

export function writePilotName(raw) {
  const name = normaliseName(raw);
  if (!name) {
    return null;
  }
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* Private mode: the name still works for this session. */
  }
  return name;
}

export function nameRules() {
  return str('pilot.two_to_twenty_four_letters_numbers');
}
