-- Tokens and what they bought: the wallet. See tracks-api/wallet.js and docs/ECONOMY.md.
--
-- This file is part of the Paraguayan Drone Combat Simulator.
--
-- The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or (at
-- your option) any later version.
--
-- The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
-- WITHOUT ANY WARRANTY, without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
-- General Public License for more details.
--
-- You should have received a copy of the GNU General Public License
-- along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

-- One row per thing paid, per account: a first, a challenge, a Flight Club
-- event placing (src/game/economy.js keys). The primary key is what makes
-- each pay once, however often a sync asks.
CREATE TABLE grants (
  account_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_utc TEXT NOT NULL,
  PRIMARY KEY (account_id, key)
);

-- One row per item an account owns. `price` is what it cost, 0 when
-- earned; `how` is 'bought' or 'earned'. The balance is the grants' sum
-- less these prices, computed and never stored, so it cannot drift.
CREATE TABLE owned (
  account_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  price INTEGER NOT NULL,
  how TEXT NOT NULL,
  created_utc TEXT NOT NULL,
  PRIMARY KEY (account_id, item)
);
