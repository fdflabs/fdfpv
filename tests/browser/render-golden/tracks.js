/*
 * render-golden/tracks.js: src/render/tracks.js's crates, levels, lookups,
 * picks under a seeded random and media URLs.
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

import * as tracks from '../../../src/render/tracks.js';

function seeded(fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => {
    i += 1;
    return ((i * 0.6180339887498949) % 1);
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

export function cases() {
  const { TRACKS, MENU_TRACKS } = tracks;
  return {
    exports: () => Object.keys(tracks).sort(),
    constants: () => ({ MUSIC_REV: tracks.MUSIC_REV, MUSIC_REF_LUFS: tracks.MUSIC_REF_LUFS }),
    crates: () => ({ TRACKS, MENU_TRACKS }),
    gains: () => [...TRACKS, ...MENU_TRACKS, { lufs: -20 }, { lufs: -17.2 }, { lufs: 0 }].map((t) => tracks.trackGain(t)),
    byId: () => ['prop-wash', 'neon-gate', 'nope', '', undefined, 'tarmac-pulse'].map((id) => {
      const t = tracks.trackById(id);
      return [String(id), t.id, t === TRACKS.find((x) => x.id === t.id)];
    }),
    picks: () => seeded(() => {
      const rows = [];
      for (let i = 0; i < 40; i++) {
        rows.push([tracks.pickTrack().id, tracks.pickMenuTrack().id]);
      }
      return rows;
    }),
    ids: () => tracks.musicIds(),
    /* The page's origin changes run to run; the path and query do not. */
    urls: () => ['tarmac-pulse', 'neon-gate-take-2', 'x y'].flatMap((id) => ['webm', 'mp3'].map((ext) => {
      const u = new URL(tracks.trackUrl(id, ext));
      return [u.origin === location.origin, u.pathname + u.search];
    })),
  };
}
