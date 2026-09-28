/*
 * node.js: the tracks server on plain Node, the VM's adapter.
 *
 *   TRACKS_DB=/var/lib/fdfpv-tracks/tracks.db ADMIN_SECRET=... PORT=8787 node tracks-api/node.js
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
import { answer, requestFrom, send } from '../edge/node-http.js';

export function startTracks({ db, port, host = '127.0.0.1', adminSecret = '' }) {
  const opened = openD1(db);
  const env = { DB: opened.DB, ADMIN_SECRET: adminSecret };
  const server = http.createServer(async (req, res) => {
    const response = await answer(worker, requestFrom(req), env);
    await send(res, response);
  });
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
  });
  console.log(`fdfpv tracks on ${process.env.HOST || '127.0.0.1'}:${running.port}${process.env.ADMIN_SECRET ? '' : ', no ADMIN_SECRET: admin routes refuse everyone'}`);
  process.on('SIGTERM', async () => {
    await running.stop();
    process.exit(0);
  });
}
