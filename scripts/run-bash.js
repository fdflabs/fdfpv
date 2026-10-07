/*
 * run-bash.js: run one shell script with a real bash, from the repository
 * root, on the caller's terminal, and exit with the script's status.
 * Usage: node scripts/run-bash.js scripts/build-wasm.sh
 *
 * It exists for Windows. npm run build:wasm used to call bash directly,
 * and there that often resolves to the WSL launcher stub
 * (%LOCALAPPDATA%\Microsoft\WindowsApps\bash.exe), which reports "WSL
 * installation appears to be corrupted" and never runs the script. Git
 * Bash is the bash this project actually uses on Windows, so it is
 * preferred, then any other bash that is not that stub.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = process.argv[2];
if (!script) {
  console.error('run-bash: pass a script path, e.g. scripts/build-wasm.sh');
  process.exit(1);
}

const candidates = [
  process.env.SIM_BASH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  join(homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
  '/bin/bash',
  '/usr/bin/bash',
];
const isWslStub = (path) => path.replace(/\\/g, '/').toLowerCase().includes('/windowsapps/bash');
const bash = candidates.find((path) => path && existsSync(path) && !isWslStub(path)) || 'bash';

/*
 * ~/.emshim is a folder of Emscripten shims, searched first so a shim emcc
 * wins. The chosen bash's own folder puts Git Bash's tools on PATH on
 * Windows; a bare `bash` is left to PATH and adds nothing.
 */
const front = [];
const shims = join(homedir(), '.emshim');
if (existsSync(shims)) {
  front.push(shims);
}
if (bash !== 'bash') {
  front.push(dirname(bash));
}
const env = { ...process.env };
if (front.length > 0) {
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PATH = [...front, process.env.PATH || ''].join(sep);
}

const child = spawnSync(bash, [script], { cwd: root, env, stdio: 'inherit' });
process.exit(child.status ?? 1);
