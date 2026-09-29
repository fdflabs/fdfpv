/*
 * d1sqlite.js: node:sqlite standing in for D1, for the VM and the selftest.
 *
 * The stand in is the calls worker.js makes (prepare, bind, first, all,
 * run) and nothing else, so the SQL the selftest proves is the SQL the VM
 * runs, and the SQL Cloudflare ran. Migrations are applied the way
 * `wrangler d1 migrations apply` does, recorded in the same d1_migrations
 * table, so a database exported from D1 (`wrangler d1 export`) opens here
 * with its migrations already counted, and a new file in migrations/ is
 * applied once on the next start.
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

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function d1(db) {
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => statement(sql) };
}

/* The database at path (':memory:' for a scratch one) with every migration
 * applied: { db, DB }, DB being what worker.js is handed as env.DB. */
export function openD1(path) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  /* wrangler's own definition, character for character in effect. */
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const done = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((r) => r.name));
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) {
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(MIGRATIONS, name), 'utf8'));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${name} failed: ${e.message}`);
    }
  }
  return { db, DB: d1(db) };
}
