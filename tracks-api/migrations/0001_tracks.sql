-- The tracks server's store. See tracks-api/worker.js for who reads it.
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

-- One row per track id. `owner` is the base64 P-256 public key that first
-- saved the id (src/share/identity.js) and never changes. `signed_ts` is the
-- counter of the last accepted save, so an older signed save replayed later
-- is refused. `document` is the normalised track JSON; everything beside it
-- is derived from it at save time, so a listing never parses a document.
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  map TEXT NOT NULL,
  gates INTEGER NOT NULL DEFAULT 0,
  planes TEXT NOT NULL DEFAULT '[]',
  document TEXT NOT NULL,
  created_utc TEXT NOT NULL,
  updated_utc TEXT NOT NULL,
  signed_ts INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX tracks_newest ON tracks (hidden, updated_utc DESC, id DESC);
CREATE INDEX tracks_by_owner ON tracks (owner, updated_utc DESC, id DESC);
CREATE INDEX tracks_by_map ON tracks (map, hidden, updated_utc DESC, id DESC);

-- Writes per client address per window, for the rate limit. The address is
-- stored hashed, and a row is dropped once its window is over.
CREATE TABLE write_counts (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  n INTEGER NOT NULL
);
