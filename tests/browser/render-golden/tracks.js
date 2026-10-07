/*
 * render-golden/tracks.js: src/render/tracks.js's crates, levels, lookups
 * and media URLs. The random picks moved into music.js, whose golden
 * seeds them.
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

export function cases() {
  const { TRACKS, MENU_TRACKS } = tracks;
  return {
    exports: () => Object.keys(tracks).sort(),
    constants: () => ({ MUSIC_REV: tracks.MUSIC_REV, MUSIC_REF_LUFS: tracks.MUSIC_REF_LUFS }),
    crates: () => ({ TRACKS, MENU_TRACKS }),
    gains: () => [...TRACKS, ...MENU_TRACKS, { lufs: -20 }, { lufs: -17.2 }, { lufs: 0 }].map((t) => tracks.trackGain(t)),
    /* Since 2026-10-06 an unknown id is null, not the first record. */
    byId: () => ['prop-wash', 'neon-gate', 'nope', '', undefined, 'tarmac-pulse'].map((id) => {
      const t = tracks.trackById(id);
      return [String(id), t ? t.id : null, t === null || t === TRACKS.find((x) => x.id === t.id)];
    }),
    ids: () => tracks.musicIds(),
    /* The page's origin changes run to run; the path and query do not. */
    urls: () => ['tarmac-pulse', 'neon-gate-take-2', 'x y'].flatMap((id) => ['webm', 'mp3'].map((ext) => {
      const u = new URL(tracks.trackUrl(id, ext));
      return [u.origin === location.origin, u.pathname + u.search];
    })),
  };
}
