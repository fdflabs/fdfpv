-- The beta waitlist and its invites. See tracks-api/waitlist.js.
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

-- One row per email address that asked for the beta, or that the owner
-- invited before it asked. `email` is lowercased, and is the one place an
-- email is kept: the accounts table still holds none, so a row here is
-- not tied to an account. `requested_utc` is null for an address the owner
-- invited that never asked; `approved_utc` is null while it waits.
CREATE TABLE waitlist (
  email TEXT PRIMARY KEY,
  requested_utc TEXT,
  approved_utc TEXT
);
