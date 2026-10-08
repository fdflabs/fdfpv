/*
 * wallet.js: an account's tokens and the items they own, held here and
 * nowhere else (docs/ECONOMY.md; the owner: the server is the truth).
 *
 * GRANTS are paid from what the server already holds: settleWallet reads
 * the account's synced record (accounts.js progress) through
 * src/game/economy.js grantsFrom and earnedFrom, and inserts each grant
 * and each earned item it names, once (the tables' primary keys). It runs
 * after every progress sync and on every wallet read, so a pilot who
 * earned a first offline is paid on the next sync. grantEvent is the
 * Flight Club's (the flightclub lane decides when a placing is final).
 *
 * THE BALANCE is the grants' sum less the prices of what is owned,
 * computed on every read. A purchase is one INSERT whose WHERE holds that
 * sum, so two computers buying at once cannot spend the same tokens.
 *
 *  * This file is part of the Paraguayan Drone Combat Simulator.
 *  *
 *  * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation, either version 3 of the License, or (at
 *  * your option) any later version.
 *  *
 *  * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 *  * WITHOUT ANY WARRANTY, without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  * General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License
 *  * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { earnedFrom, eventGrants, grantsFrom, itemById } from '../src/game/economy.js';
import { nowUtc } from './http.js';

const BALANCE_SQL = '(SELECT COALESCE(SUM(amount), 0) FROM grants WHERE account_id = ?1) - (SELECT COALESCE(SUM(price), 0) FROM owned WHERE account_id = ?1)';

async function insertGrants(env, accountId, grants) {
  const stamp = nowUtc();
  for (const g of grants) {
    /* eslint-disable-next-line no-await-in-loop */
    await env.DB.prepare('INSERT OR IGNORE INTO grants (account_id, key, amount, created_utc) VALUES (?, ?, ?, ?)')
      .bind(accountId, g.key, g.amount, stamp).run();
  }
}

/* { balance, earned, owned: { [item]: 'bought' | 'earned' } } */
export async function walletOf(env, accountId) {
  const sum = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM grants WHERE account_id = ?').bind(accountId).first();
  const { results } = await env.DB.prepare('SELECT item, price, how FROM owned WHERE account_id = ? ORDER BY item').bind(accountId).all();
  const spent = results.reduce((n, r) => n + r.price, 0);
  return { balance: sum.n - spent, earned: sum.n, owned: Object.fromEntries(results.map((r) => [r.item, r.how])) };
}

/* Pays what the account's record (a synced blob, or null) shows and has
 * not been paid, then answers the wallet. */
export async function settleWallet(env, accountId, blob) {
  if (blob) {
    await insertGrants(env, accountId, grantsFrom(blob));
    const stamp = nowUtc();
    for (const id of earnedFrom(blob)) {
      /* eslint-disable-next-line no-await-in-loop */
      await env.DB.prepare("INSERT OR IGNORE INTO owned (account_id, item, price, how, created_utc) VALUES (?, ?, 0, 'earned', ?)")
        .bind(accountId, id, stamp).run();
    }
  }
  return walletOf(env, accountId);
}

/* A Flight Club placing paid: false for an event id or tier that is not
 * one (economy.js EVENT_ID, EVENT_TIERS), else true, paid or already. */
export async function grantEvent(env, accountId, eventId, tier) {
  const grants = eventGrants(eventId, tier);
  if (!grants.length) {
    return false;
  }
  await insertGrants(env, accountId, grants);
  return true;
}

/* { wallet } bought, or { status, why }: 404 no such item, 409 owned or
 * earned only, 402 too few tokens. */
export async function buyItem(env, accountId, id) {
  const it = typeof id === 'string' ? itemById(id) : null;
  if (!it) {
    return { status: 404, why: 'unknown' };
  }
  if (!Number.isInteger(it.price)) {
    return { status: 409, why: 'earned' };
  }
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO owned (account_id, item, price, how, created_utc) SELECT ?1, ?2, ?3, 'bought', ?4 WHERE ${BALANCE_SQL} >= ?3`,
  ).bind(accountId, it.id, it.price, nowUtc()).run();
  if (r.meta.changes) {
    return { wallet: await walletOf(env, accountId) };
  }
  const held = await env.DB.prepare('SELECT 1 AS y FROM owned WHERE account_id = ? AND item = ?').bind(accountId, it.id).first();
  return held ? { status: 409, why: 'owned' } : { status: 402, why: 'short' };
}

export async function deleteWallet(env, accountId) {
  await env.DB.prepare('DELETE FROM grants WHERE account_id = ?').bind(accountId).run();
  await env.DB.prepare('DELETE FROM owned WHERE account_id = ?').bind(accountId).run();
}
