/*
 * music-loudness.js: the measured loudness src/render/tracks.js levels the
 * crate by, from the encoded files themselves.
 *
 *   node scripts/music-loudness.js [--check]
 *
 * Measures every assets/music/*.webm with ffmpeg's ebur128 (integrated
 * loudness, ITU-R BS.1770-4) and prints the crate rows for tracks.js, one
 * decimal as tracks.js carries them. --check compares the figures with the
 * ones tracks.js has and fails on any that differ or any record without a
 * file; run it after re-encoding the crate (scripts/music.js), together
 * with the MUSIC_REV bump that re-encode needs.
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
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS, MENU_TRACKS } from '../src/render/tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const crate = join(root, 'assets/music');

/* ebur128 prints a running I: per frame; the integrated figure is the one
 * in the block after "Summary:". */
function integratedLufs(file) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  if (run.error) {
    throw new Error(`ffmpeg: ${run.error.message}`);
  }
  const summary = run.stderr.slice(run.stderr.lastIndexOf('Summary:'));
  const m = /I:\s*(-?[\d.]+)\s*LUFS/.exec(summary);
  if (!m) {
    throw new Error(`no integrated loudness in ffmpeg's output for ${file}`);
  }
  return Number(m[1]);
}

const check = process.argv.includes('--check');
/* No directory is no records: the crate has been empty since 2026-10-06. */
const ids = (existsSync(crate) ? readdirSync(crate) : []).filter((f) => f.endsWith('.webm')).map((f) => f.slice(0, -5)).sort();
const measured = new Map(ids.map((id) => [id, integratedLufs(join(crate, `${id}.webm`))]));

if (!check) {
  for (const [id, lufs] of measured) {
    console.log(`  ['${id}', ${lufs.toFixed(1)}],`);
  }
  process.exit(0);
}

let failed = 0;
for (const t of [...TRACKS, ...MENU_TRACKS]) {
  const file = join(crate, `${t.id}.webm`);
  const got = existsSync(file) ? measured.get(t.id) : undefined;
  const ok = got !== undefined && got.toFixed(1) === t.lufs.toFixed(1);
  failed += ok ? 0 : 1;
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${t.id.padEnd(22)} tracks.js ${t.lufs.toFixed(1)}  measured ${got === undefined ? 'no file' : got.toFixed(1)}`);
}
console.log(failed ? `music-loudness: ${failed} FAILED` : 'music-loudness: every record matches its file');
process.exit(failed ? 1 : 0);
