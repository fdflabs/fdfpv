-- The livery gallery. See tracks-api/gallery.js and docs/LIVERY-GALLERY.md.
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

-- One row per published livery. `code` is the paint shop's own code as it
-- was published (configs/paint.js encodeLivery); `family` and `name` are
-- read out of it once, so the list can filter and show without decoding.
-- `likes` and `reports` are the counts of the two tables below, kept on the
-- row so a sorted page is one indexed read.
CREATE TABLE gallery (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_utc TEXT NOT NULL,
  UNIQUE (account_id, code)
);
CREATE INDEX gallery_new ON gallery (family, hidden, created_utc);
CREATE INDEX gallery_liked ON gallery (family, hidden, likes, created_utc);

-- The primary keys are what make a like and a report count once per account.
CREATE TABLE gallery_likes (
  gallery_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  PRIMARY KEY (gallery_id, account_id)
);
CREATE TABLE gallery_reports (
  gallery_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  PRIMARY KEY (gallery_id, account_id)
);
