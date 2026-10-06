/*
 * roomsserver.js: a rooms server of a check's own, on a free port and a
 * throwaway database, or the one named on the command line. Node only.
 *
 * A fixed port collided across sessions running the same check: the second
 * one's fetch found the first one's server up, and drove that instead of
 * its own (or failed to bind and never said so).
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

import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/* Free the moment it is closed, so another process could take it before
 * the server binds; the server then fails to start, and that is loud.
 * Also for a check's child server of another kind (the board), which
 * cannot be asked for port 0 and say which it got. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/* `named` is the url given on the command line, or empty for our own.
 * devMissions: our own starts the campaign's missions in development too
 * (edge/rooms/node.js DEV_MISSIONS); a named one is as it was started.
 * accountsOrigin and devAccounts: our own checks every hello's session
 * against that accounts server (tests/lib/account.js startAccounts) and
 * reads DEV_ACCOUNTS as those ids, as the VM's does. */
export async function roomsServer(named, label, { devMissions = false, accountsOrigin = '', devAccounts = '' } = {}) {
  if (named) {
    return { url: named, stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), `${label}-rooms-`));
  const port = await freePort();
  const proc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
    env: {
      ...process.env, ROOMS_DB: join(dir, 'rooms.db'), PORT: String(port), HOST: '127.0.0.1', DEV_MISSIONS: devMissions ? 'on' : '',
      ACCOUNTS_ORIGIN: accountsOrigin, DEV_ACCOUNTS: devAccounts,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let exited = null;
  proc.on('exit', (code) => {
    exited = code;
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100 && exited === null; i += 1) {
    try {
      await fetch(`${url}/v2/rooms`);
      return { url, stop };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await stop();
  throw new Error(`rooms server did not come up on ${url}${exited === null ? '' : `: it exited ${exited}`}`);
}
