-- Optional Google sign-in: accounts and their sessions. See tracks-api/accounts.js.
--
-- This file is part of WebFPVSimulator.
--
-- WebFPVSimulator is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or (at
-- your option) any later version.
--
-- WebFPVSimulator is distributed in the hope that it will be useful, but
-- WITHOUT ANY WARRANTY, without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
-- General Public License for more details.
--
-- You should have received a copy of the GNU General Public License
-- along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

-- One row per Google account that has signed in. `sub` is Google's stable
-- account id from the ID token, and the only thing from Google kept: no
-- email, no name, no picture. `callsign_key` is the callsign lowercased, so
-- "Ace" and "ace" are one callsign; null until one is chosen. `identity` is
-- the pilot key (src/share/identity.js) the account carries between
-- computers, sealed with ACCOUNTS_SECRET (AES-GCM), and `public_key` its
-- public half in the clear. `progress` is the synced settings blob
-- (src/share/progressmerge.js) and `progress_rev` counts its writes, so two
-- computers syncing at once cannot lose one another's merge.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL UNIQUE,
  callsign TEXT,
  callsign_key TEXT UNIQUE,
  identity TEXT,
  public_key TEXT,
  progress TEXT,
  progress_rev INTEGER NOT NULL DEFAULT 0,
  created_utc TEXT NOT NULL,
  updated_utc TEXT NOT NULL
);

-- A signed in browser's session. Only the SHA-256 of the token is stored,
-- so the table alone signs nobody in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  created_utc TEXT NOT NULL,
  expires_s INTEGER NOT NULL
);

CREATE INDEX sessions_by_account ON sessions (account_id, expires_s);
