/*
 * boot.js: the page's entry module. It runs first and imports nothing heavy.
 *
 * The loading screen has to be on screen before three.js arrives, and a
 * module graph is fetched whole before any of it runs. If the entry module
 * imported three.js (or main.js, which does), the player would stare at an
 * empty page for as long as the CDN took. So this module pulls in only the
 * loading screen and a few small leaves, puts the bar up, and then brings in
 * three.js, the string table and main.js with dynamic imports it can report.
 *
 * What it decides before main.js exists: which world the page opens on (from
 * ?map= and ?share=), and how the loading bar is weighted for that world.
 * scripts/boot-entry-check.js pins both.
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

import { Loading, planStages } from './ui/loading.js';
import { MAP_BUILD_MS } from './maps/build-cost.js';
import { retiredMap } from './maps/retired.js';
import { SIM_WINDOW, claimWindowName } from './share/windows.js';
import { watchPageErrors } from './share/crashrecord.js';
import { moveIn } from './share/move.js';

/* Time zero for the first-frame figure main.js reports through
 * window.__boot. Taken here because nothing the page does comes earlier. */
const pageT0 = performance.now();

/* Errors from here on can ride along in the next F8 report
 * (share/crashrecord.js). */
watchPageErrors(window);

/* The board's Fly this track looks for the simulator tab by window name,
 * and a tab still loading should already answer to it. */
claimWindowName(SIM_WINDOW);

const loading = new Loading(document.getElementById('pdcs-loader'));
/* Two names, one controller: window.loader for the page, window.__loading
 * for the harness. */
window.loader = loading;
window.__loading = loading;

/* The world the title shows (the photographic Swiss valley with the
 * Skyhunter in it), regardless of what the pilot last flew. Only a link that
 * names a map replaces it; the pilot's stored map is built when they press
 * fly. */
const TITLE_WORLD = 'swiss2';

/* "three.js r160" for an import map entry on three@0.160.0: the release
 * number players and bug reports use. Empty when the page has no import map
 * or the entry does not name a version. */
function rendererLabel() {
  const map = document.querySelector('script[type="importmap"]');
  let spec = '';
  try {
    spec = map ? JSON.parse(map.textContent).imports.three ?? '' : '';
  } catch (e) {
    return '';
  }
  const found = /three@([0-9.]+)/.exec(spec);
  if (!found) {
    return '';
  }
  const parts = found[1].split('.');
  if (parts[0] === '0') {
    parts.shift();
  }
  if (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return `three.js r${parts.join('.')}`;
}

/* The map the page's address asks for, or null for the title's own world.
 * A board link names its track as ?share=, which always means the Track
 * seat. */
function linkedMap() {
  let query;
  try {
    query = new URLSearchParams(window.location.search);
  } catch (e) {
    return null;
  }
  if (query.get('share')) {
    return 'track';
  }
  return query.get('map') || null;
}

/* Where a linked map actually lands. A retired world goes to its
 * replacement, and the caller tells main.js so it can say why. Anything
 * else no map answers to (a typo, a stale bookmark, the old race field ids
 * 'field' and 'custom') is the Track seat, so the Map row never names a
 * world that is not there. MAP_BUILD_MS is keyed by every map id and is
 * already a boot import, unlike the map registry and its loaders. */
function resolveLink(asked) {
  const retired = retiredMap(asked);
  const landed = retired ? retired.to : asked;
  return {
    mapId: landed && !Object.hasOwn(MAP_BUILD_MS, landed) ? 'track' : landed,
    retiredFrom: retired ? asked : null,
  };
}

/* The guest's storage from the old address comes over first, before anything
 * reads it (share/move.js). A failure is logged and the game runs anyway;
 * when moveIn sends the tab to the old address it never settles, so nothing
 * below runs on a page that is leaving. */
async function carryStorage() {
  let outcome;
  try {
    outcome = await moveIn();
  } catch (e) {
    console.warn('moving the guest\'s storage from the old address threw', e);
    outcome = 'failed';
  }
  if (outcome === 'failed') {
    console.warn('moving the guest\'s storage from the old address failed; see localStorage pdcs.move.v1');
  }
}

async function launch() {
  await carryStorage();

  const { mapId, retiredFrom } = resolveLink(linkedMap());
  const titleMap = mapId ? null : TITLE_WORLD;
  /* The Track seat's world is only known once the seat is read, and it is one
   * of the valleys, so it is budgeted as the Swiss one, the slower build. */
  const worldMs = MAP_BUILD_MS[mapId ?? titleMap] ?? MAP_BUILD_MS.swiss2;
  loading.run(planStages(['three', 'board', 'sim', 'module', 'world', 'frame'], worldMs));

  /*
   * The renderer stage shows its name and the release but no byte count, on
   * purpose. Streaming three.js through a reader to count bytes was tried:
   * the browser then fetched the module twice (two resource timing entries
   * for three.module.js), because whether the import reuses the first
   * response depends on the CDN's cache headers. Spending up to 1.2 MB of
   * the player's data on a progress animation is a bad trade, so this stage
   * keeps its stall line and makes no claim about how far along it is. The
   * wasm and the map graph still report real progress.
   */
  loading.start('three');
  loading.detail = rendererLabel();
  await import('three');
  loading.done('three');
  loading.detail = '';

  /* main.js builds titles and menu rows from the string table while it is
   * imported, so the pilot's language has to be loaded before it. */
  const strings = await import('./strings/index.js');
  await strings.useLocale(strings.preferredLocale());

  const shell = await import('./main.js');
  await shell.boot({
    loading, bootStart: pageT0, mapId, titleMap, retiredFrom,
  });
}

launch().catch((err) => {
  loading.fail(err.message ?? String(err));
  /* Also on the console, where checks and bug reports look for it. */
  console.error(err);
});
