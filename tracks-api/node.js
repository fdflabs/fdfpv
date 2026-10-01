/*
 * node.js: the tracks server on plain Node, the VM's adapter.
 *
 *   TRACKS_DB=/var/lib/fdfpv-tracks/tracks.db ADMIN_SECRET=... PORT=8787 node tracks-api/node.js
 *
 * and GOOGLE_CLIENT_ID with ACCOUNTS_SECRET to switch the optional Google
 * sign-in on (accounts.js); without both it answers 503.
 *
 * worker.js is the whole server, unchanged: this serves its fetch handler
 * with node:http (edge/node-http.js) over SQLite in place of D1
 * (d1sqlite.js), applying any migration the file has not had yet. Without
 * ADMIN_SECRET the admin routes refuse everyone, as the Worker's do.
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

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import worker from './worker.js';
import { openD1 } from './d1sqlite.js';
import { listener, readRevision } from '../edge/node-http.js';

/* googleClientId and accountsSecret switch sign-in on (accounts.js);
 * googleJwksUrl is for the selftest's stand in for Google alone.
 * revision: what GET /api/version answers, the deployed REVISION file's
 * (edge/node-http.js readRevision) unless the selftest passes its own. */
export function startTracks({
  db, port, host = '127.0.0.1', adminSecret = '', googleClientId = '', accountsSecret = '', googleJwksUrl = '',
  revision = readRevision(new URL('../REVISION', import.meta.url)),
}) {
  const opened = openD1(db);
  const env = {
    DB: opened.DB, ADMIN_SECRET: adminSecret, GOOGLE_CLIENT_ID: googleClientId, ACCOUNTS_SECRET: accountsSecret,
    REVISION: revision,
    ...(googleJwksUrl ? { GOOGLE_JWKS_URL: googleJwksUrl } : {}),
  };
  const server = http.createServer(listener(worker, env));
  function stop() {
    return new Promise((resolve) => {
      server.close(() => {
        opened.db.close();
        resolve();
      });
      server.closeAllConnections();
    });
  }
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, stop, port: server.address().port }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const running = await startTracks({
    db: process.env.TRACKS_DB || 'tracks.db',
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST || '127.0.0.1',
    adminSecret: process.env.ADMIN_SECRET || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    accountsSecret: process.env.ACCOUNTS_SECRET || '',
  });
  const signIn = process.env.GOOGLE_CLIENT_ID && process.env.ACCOUNTS_SECRET;
  console.log(`fdfpv tracks on ${process.env.HOST || '127.0.0.1'}:${running.port}${process.env.ADMIN_SECRET ? '' : ', no ADMIN_SECRET: admin routes refuse everyone'}${signIn ? ', sign-in on' : ', no GOOGLE_CLIENT_ID or ACCOUNTS_SECRET: sign-in off'}`);
  process.on('SIGTERM', async () => {
    await running.stop();
    process.exit(0);
  });
}
