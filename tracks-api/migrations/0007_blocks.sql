-- Blocks that outlast a room: one pilot's account blocking another's. See tracks-api/accounts.js.
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

-- One row per pilot an account has blocked, both sides by account id, so a
-- blocked pilot who changes callsign stays blocked. The rooms server reads
-- the blocker's rows with each join (GET /api/account) and never passes
-- their voice or chat to the blocker. A deleted account's rows go on
-- either side.
CREATE TABLE blocks (
  account_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  created_utc TEXT NOT NULL,
  PRIMARY KEY (account_id, blocked_id)
);

CREATE INDEX blocks_by_blocked ON blocks (blocked_id);
