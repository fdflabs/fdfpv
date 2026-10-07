/*
 * windows.js: the simulator and the board each live in one tab.
 *
 * Links between the sites used to open a new tab each time, so a session
 * spent going back and forth ended with a row of tabs, several running a
 * physics loop and a WebGL context nobody looked at. A named browsing
 * context fixes that: opening a URL under a name navigates (and focuses)
 * the tab already carrying the name. Two names, both here:
 *
 *   fdfpv-sim     the simulator and the track builder (the simulator goes
 *                 to the builder and back in place, so they are one tab)
 *   fdfpv-board   the leaderboard
 *
 * Two rules follow, and both are easy to break:
 *
 *   - No rel="noopener" on a named link. The HTML spec turns a noopener
 *     target into "_blank" before looking the name up, so such a link
 *     opens a new tab every time. Without it the opened page can reach
 *     back (postMessage, close, set our location), which is acceptable
 *     only because both ends are our own sites: never use a named target
 *     for a link that leaves the product.
 *   - A tab must claim its name to be found: a name set by whoever opened
 *     it is lost when it is not one of our links. Each of the two pages
 *     calls claimWindowName as early as it can; window.name survives same
 *     origin navigation, so the simulator keeps it in the builder.
 *
 * Names do not cross browsing context groups: a board and a simulator
 * opened separately cannot find each other, so the first link between them
 * opens one more tab, and they are a pair from then on. A modifier click
 * still opens a new tab, because the browser honours the player's ask.
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

/* KEEP IN STEP WITH the board repository, which spells these again. */
export const SIM_WINDOW = 'fdfpv-sim';
export const BOARD_WINDOW = 'fdfpv-board';

/*
 * Name this page's tab. Returns the name taken, or '' when none was: a
 * frame takes none (orbit.html runs inside the board's cards, and a
 * thumbnail named like a tab would catch the simulator's links), and
 * neither does a page with no window or one that will not answer.
 */
export function claimWindowName(name) {
  try {
    const framed = window.top !== window.self;
    if (!framed) {
      window.name = name;
    }
    return framed ? '' : name;
  } catch (e) {
    return '';
  }
}

/*
 * Open `url` in the tab named `name`, reusing and focusing it if it is
 * open (a reused tab left unfocused looks like a click that did nothing).
 * Returns the window, or null when the browser blocked the open: the
 * caller's sign that nothing happened. No noopener, for the reason above.
 */
export function openNamedWindow(url, name) {
  let tab;
  try {
    tab = window.open(url, name);
  } catch (e) {
    return null;
  }
  if (!tab) {
    return null;
  }
  try {
    tab.focus();
  } catch (e) {
    /* A cross origin tab the browser will not focus is still open. */
  }
  return tab;
}
