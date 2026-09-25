/*
 * boot.js: the entry point, and the only module that runs before three.js.
 *
 * It exists so the loading screen can report the three.js fetch. A page whose
 * entry module imports three at module scope cannot: the browser fetches the
 * whole static graph before a line of that module runs, so the first thing
 * the player would see is a blank page for however long the CDN takes. This
 * file imports only the loading screen, drives the fetch itself with a
 * streamed reader for byte progress, and then dynamically imports main.js,
 * which does import three statically and is served from cache by then.
 *
 * The three.js URL is read out of the page's own import map rather than
 * written down again here, so there is exactly one place it lives.
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

import { Loading, planStages } from './ui/loading.js';
import { MAP_BUILD_MS } from './maps/build-cost.js';
import { SIM_WINDOW, claimWindowName } from './share/windows.js';

/* P6: navigation to the first interactive frame. Stamped in the first module
 * the page runs so it covers every fetch and every module evaluation, and
 * read back through window.__boot. */
const BOOT_START = performance.now();

/* This tab is the simulator, and there is only ever one of it. Claimed in
 * the first module the page runs, so the board's Fly this track finds it
 * even while the shell is still loading. See share/windows.js. */
claimWindowName(SIM_WINDOW);

const loading = new Loading(document.getElementById('loading'));
window.__loading = loading;

/* Read out of the page's own import map so the version lives in one place. */
function threeVersion() {
  const el = document.querySelector('script[type="importmap"]');
  if (!el) {
    return '';
  }
  try {
    const url = JSON.parse(el.textContent).imports.three ?? '';
    const m = url.match(/three@([0-9.]+)/);
    return m ? `three.js r${m[1].replace(/^0\./, '').replace(/\.0$/, '')}` : '';
  } catch (e) {
    return '';
  }
}

/*
 * THE TITLE'S OWN WORLD, the photographic Alps, which main.js shows with
 * the Skyhunter flying them. The owner asked for the title to open on this
 * whatever the pilot last flew, so the stored map is no longer the boot
 * world. The pilot's own map stays theirs: main.js builds it when they
 * press fly and never writes this one into the settings.
 */
const TITLE_MAP = 'swiss2';

async function start() {
  /*
   * A map named in the URL replaces the Alps, and this is the one
   * thing the track builder asks of the game: its Fly this track button links
   * to ?map=custom, so a course goes from the drawing board to the air in one
   * press instead of a press and then a hunt through a menu. main.js takes
   * the mapId and writes it into the settings, so the title is the world the
   * link named and the Map row agrees with it. Harnesses, share links and
   * posters name their world the same way.
   */
  let mapId = null;
  try {
    const params = new URLSearchParams(window.location.search);
    mapId = params.get('map') || null;
    /* A published course arrives as ?share=id. That is a custom map, even
     * when the link omits map=, so the loading screen weights the right
     * world and the title lands on the course the board sent. */
    if (params.get('share')) {
      mapId = 'custom';
    }
  } catch (e) {
    /* No URL to read. The title is the Alps. */
  }
  /*
   * An id no map has is a stale bookmark or a typo, and it used to reach
   * main.js verbatim: the loaders normalise it to the field while the
   * setting kept the bad string, so the Map row named a world that was not
   * there and syncWorld saw a mismatch it could never clear. MAP_BUILD_MS is
   * keyed by map id and is imported here anyway, so the check does not drag
   * the registry, and its loader thunks, into the boot graph.
   */
  /* The race field is gone. A bookmarked field id is the track world,
   * which is the same terrain with a designed layout in it. */
  if (mapId && (mapId === 'field' || !Object.hasOwn(MAP_BUILD_MS, mapId))) {
    mapId = 'custom';
  }
  const titleMap = mapId ? null : TITLE_MAP;
  const worldMs = MAP_BUILD_MS[mapId ?? titleMap];

  loading.run(planStages(['three', 'board', 'sim', 'module', 'world', 'frame'], worldMs));

  /*
   * NO BYTE PROGRESS ON THIS STAGE, AND THAT IS A MEASUREMENT, NOT AN
   * OVERSIGHT.
   *
   * The first version streamed the three.js module itself with a reader so
   * the bar could report kilobytes, on the assumption that the dynamic import
   * a moment later would be served from the HTTP cache. Measured, that
   * assumption is not safe: `performance.getEntriesByType('resource')` came
   * back with TWO entries for three.module.js, so the browser made two
   * requests, and whether the second one costs 1.2 MB over the wire depends
   * entirely on the CDN's cache headers and on the harness, which fulfils
   * jsdelivr from a local cache and returns no caching headers at all.
   *
   * Paying up to 1.2 MB of a player's connection to animate a progress bar is
   * the wrong trade, and a bar that is honest about the network is the whole
   * point of this screen. So the stage keeps its NAME and its elapsed time
   * readout, which is what makes a stall legible, and it does not pretend to
   * know how far through it is. The stages that can measure their progress
   * honestly still do: dist/sim.wasm streams its bytes because the shell
   * needs them anyway, and the map graph counts modules off the browser's own
   * resource timing.
   */
  loading.start('three');
  loading.detail = threeVersion();
  await import('three');
  loading.done('three');
  loading.detail = '';

  /* The locale, before main.js: its module scope builds screen titles and
   * menu rows from the string table at import time, so the table has to be
   * the right one first. Only en ships today; see src/strings/index.js. */
  const strings = await import('./strings/index.js');
  await strings.useLocale(strings.preferredLocale());
  const main = await import('./main.js');
  await main.boot({ loading, bootStart: BOOT_START, mapId, titleMap });
}

start().catch((e) => {
  loading.fail(e.message ?? String(e));
  /* Still report it the way the shell used to, so nothing that reads the
   * console for a failure stops working. */
  console.error(e);
});
