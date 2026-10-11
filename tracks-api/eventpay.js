/*
 * eventpay.js: Flight Club's weekly events, paid (docs/FLIGHTCLUB-PROGRESSION.md
 * section 4, docs/ECONOMY.md section 3).
 *
 * The board is where laps are checked and kept, so it is the board that
 * says which tier (finish, bronze, silver, gold) a pilot key reached in
 * each recent event (its GET /api/events/tiers). A tier is absolute and
 * final once the lap is posted, so it is paid whenever the account next
 * reads its wallet or syncs, and wallet.js grantEvent pays each grant
 * once, so asking again pays nothing twice.
 *
 * A board that does not answer pays nothing now and everything later: the
 * board looks back eight weeks, and the next read asks again. That is why
 * a failure here is logged and passed over rather than failing the
 * wallet, which the pilot is reading for other reasons.
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

import { grantEvent } from './wallet.js';

const ASK_MS = 2000;

/* `account` is the accounts row; its public_key is the pilot key every
 * one of its board times is signed with. */
export async function payEvents(env, account) {
  if (!env.BOARD_ORIGIN || !account.public_key) {
    return;
  }
  const url = `${String(env.BOARD_ORIGIN).replace(/\/+$/, '')}/api/events/tiers?key=${encodeURIComponent(account.public_key)}`;
  let tiers;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ASK_MS) });
    if (!res.ok) {
      throw new Error(`board answered ${res.status}`);
    }
    ({ tiers } = await res.json());
  } catch (e) {
    console.warn(`event tiers not read for account ${account.id}: ${e.message}`);
    return;
  }
  for (const t of Array.isArray(tiers) ? tiers : []) {
    /* eslint-disable-next-line no-await-in-loop */
    await grantEvent(env, account.id, t && t.id, t && t.tier);
  }
}
