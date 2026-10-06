/*
 * api.js: where the deployed page finds its servers, named once.
 *
 * The rooms server (edge/rooms/node.js), the tracks and accounts server
 * (tracks-api/node.js) and the board (fdflabs/fdfpv-leaderboard, mounted at
 * /board) all answer at one origin on the owner's VM, behind Caddy
 * (deploy/vm/Caddyfile). src/share/rooms.js, cloud.js and board.js read it
 * from here; their ?rooms=, ?tracks= and ?board= overrides still outrank it.
 *
 * The game moved to its own domain on 3 October 2026, and the VM answers
 * by name (api.paraguayandronecombatsimulator.com). The page no longer
 * falls back to the VM's bare address: the name's DNS and certificate
 * settled, and a page that cannot reach the name now fails as a server
 * that is down does, which each caller already lives with (rooms retry,
 * uploads retry, the board has deadlines). Caddy still serves the bare
 * address for pages built before the move. The Cloudflare Workers the VM
 * replaced, fdfpv-rooms and fdfpv-tracks on fdfretes.workers.dev, are
 * still deployed, and naming them here is the way back to them.
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

export const API_ORIGIN = 'https://api.paraguayandronecombatsimulator.com';

/* The game's own domain, apex first. The apex is canonical; GitHub Pages
 * sends www to it. */
export const SITE_ORIGIN = 'https://paraguayandronecombatsimulator.com';

/* Every host the simulator is deployed at. fdflabs.github.io stays while
 * the old address is still served or redirected (DEPLOY.md, The move to
 * the game's own domain). */
export const SITE_HOSTS = [
  'paraguayandronecombatsimulator.com',
  'www.paraguayandronecombatsimulator.com',
  'fdflabs.github.io',
];
