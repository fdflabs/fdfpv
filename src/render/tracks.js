/*
 * tracks.js: the recorded music, as data. src/render/music.js plays it.
 *
 * Two crates. TRACKS is the flight crate: what plays while flying, and
 * what the Music track setting chooses from. MENU_TRACKS is the bed under
 * every other screen, quieter and re-rolled each time the menus return,
 * because rows being read want something that does not ask for attention.
 * Both live in assets/music and share one namespace of ids, since they
 * share one directory, one URL space and one cache rule.
 *
 * A record is its id: the files are assets/music/<id>.webm and .mp3,
 * written by scripts/music.js, and the displayed name is the id read back
 * as words. One fact cannot disagree with itself, and a slug keeps spaces
 * and brackets out of media URLs. WebM (Opus) averages 2.6 MB a record and
 * the mp3 fallback 3.1 MB; music.js picks by canPlayType and falls back on
 * a load error.
 *
 * Both crates are EMPTY since 2026-10-06. The sixteen records that were
 * here arrived with the upstream on 2026-08-19 with no recorded licence,
 * so they came out of the game until licensed records replace them
 * (NOTICE). An empty crate, an unknown id and a removed id are one case:
 * no record, so no bed, and every reader below says so with null.
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

/*
 * The crate's revision, on every media URL. render.yaml serves
 * /assets/music/* immutable for a year and the file names never change, so
 * this is the only way a returning browser learns that the audio did:
 * bump it whenever the crate is re-encoded. Not when a record is added or
 * dropped: a new id is a URL nobody has cached, and bumping for it would
 * make every returning visitor fetch some forty megabytes again for
 * nothing.
 */
export const MUSIC_REV = 1;

/*
 * Each record's integrated loudness, LUFS (ITU-R BS.1770-4), of its WebM:
 * the figures scripts/music-loudness.js measures from the files (--check
 * compares). Unlevelled they span 4.2 LU, a 4 dB jump on a skip, so each
 * record plays at trackGain(): turned down to the quietest record,
 * MUSIC_REF_LUFS, on the media element's volume, never up past its own
 * master. Where the levelled bed sits in the mix is the bus's business
 * (docs/AUDIO.md). A record without a figure stops the module loading.
 */
export const MUSIC_REF_LUFS = -17.2;

const FLIGHT_CRATE = [];

const MENU_CRATE = [];

/* 'night-run-take-2' would read back as 'Night Run Take 2'. */
const titleOf = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function records(crate) {
  return crate.map(([id, lufs]) => {
    if (!Number.isFinite(lufs) || lufs > 0) {
      throw new Error(`tracks: ${id} has no measured loudness`);
    }
    return { id, name: titleOf(id), lufs };
  });
}

export const TRACKS = records(FLIGHT_CRATE);
export const MENU_TRACKS = records(MENU_CRATE);

/* An id is half a URL and a file name both crates write: a duplicate would
 * make one record overwrite another at encode time, and anything but a
 * lower case slug would 404 in one deploy or another. */
{
  const ids = new Set();
  for (const { id } of [...TRACKS, ...MENU_TRACKS]) {
    if (ids.has(id)) {
      throw new Error(`tracks: duplicate id ${id}`);
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new Error(`tracks: id ${id} is not a slug`);
    }
    ids.add(id);
  }
}

/* The element volume that brings a record down to MUSIC_REF_LUFS: never
 * above 1. */
export function trackGain(t) {
  const decibelsDown = MUSIC_REF_LUFS - t.lufs;
  return Math.min(1, Math.pow(10, decibelsDown / 20));
}

/* A flight record by id, or null: an unknown id is no record, never some
 * other record, so a replay naming a removed record plays no bed rather
 * than somebody else's. */
export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? null;
}

/* The Music track setting's choices: rotation, then the flight crate. The
 * menu bed is not a choice. */
export function musicIds() {
  return ['rotation', ...TRACKS.map((t) => t.id)];
}

/* Resolved against this module, not the site root, so a shell served
 * under a sub path still finds the crate. */
export function trackUrl(id, ext) {
  const url = new URL(`../../assets/music/${id}.${ext}`, import.meta.url);
  url.search = `v=${MUSIC_REV}`;
  return url.href;
}
