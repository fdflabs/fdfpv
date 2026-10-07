/*
 * device-check.js: the menus work on phones and tablets, not only a laptop.
 * On five real viewport sizes with touch emulation on, every listed screen
 * is shown and asserted for sideways overflow, for whether its first and
 * last rows and its help column can be reached, and for touch target height.
 *
 *     node scripts/device-check.js      (npm run lint:devices)
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
 * Separate from shell-check.js, which measures one 1600 by 900 window
 * against per-screen overflow budgets: the right shape for "did this change
 * cost layout", and blind to everything here, all of which is invisible at
 * 1600 by 900. The first run found four real defects: the Race room's rows
 * 8 px off the right of every phone and tablet (a stage sized in vw is wider
 * than the padded box holding it); the help column, the one place a person
 * learns an FPV sim here, wholly below the fold on a phone on Quad, Pilot
 * and Paused; the title's row list with no height cap on a narrow window, so
 * Report bug could not be reached by any scrolling; and the pause menu
 * putting Quit to title 242 px below a 720 px window with no scroller, so a
 * paused pilot could not quit.
 *
 * Reachability, not position: content may sit below the fold if a person
 * can scroll to it (the Freestyle room's world cards do on a phone, and that
 * is fine). So each assertion scrolls the thing into view as a person would
 * and only then asks whether it is visible.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* 390x844 is an iPhone 14, 820x1180 an iPad Air, 360x640 the floor: below
 * that a menu is not the problem. */
const DEVICES = [
  ['phone portrait', 390, 844],
  ['phone landscape', 844, 390],
  ['tablet portrait', 820, 1180],
  ['tablet landscape', 1180, 820],
  ['small phone', 360, 640],
];

const SCREENS = [
  'title', 'courses', 'freestyle', 'quad', 'pilot', 'launch', 'rates', 'pids', 'fc', 'paused',
  'results', 'howto', 'credits',
];

/* 44 px is where Apple's and Google's touch guidance agree. The FC bench
 * keeps its denser rows on purpose. */
const MIN_TAP_PX = 44;
const TAP_EXEMPT = ['fc'];

const seed = `try {
  const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
} catch (e) {}`;

/*
 * Runs in the page. The first-run gate is answered by state, not by a
 * press: this is about a returning pilot's menus, a press would navigate
 * while the walk shows every screen itself, and clearing it makes the
 * primary row Fly rather than the guided First flight. The cursor goes on a
 * row with a note, or the help column is empty and its position proves
 * nothing. No horizontal overflow is ever allowed: a phone has no
 * horizontal scrollbar to find it with.
 */
function probe(screens, minTap, tapExempt) {
  const ui = window.__ui;
  ui.firstRun = false;
  if (!ui.mode) {
    ui.mode = 'race';
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lost = (box) => box.top >= H - 4 || box.bottom > H + 4;

  const checkScreen = (name) => {
    const out = [];
    ui.show(name);
    const items = ui.items();
    const noted = items.findIndex((it) => it.note && ui.isStop(it));
    if (noted >= 0) {
      ui.setCursor(noted);
    }
    const visible = [...ui.menuRows].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 || b.height > 0;
    });
    if (visible.some((el) => {
      const b = el.getBoundingClientRect();
      return b.right > W + 1 || b.left < -1;
    })) {
      out.push('a row is off the side of the window');
    }
    if (document.documentElement.scrollWidth > W + 1) {
      out.push('the page scrolls sideways');
    }
    const stops = visible.filter((el) => el.classList.contains('row'));
    const ends = stops.length ? [stops[0], stops[stops.length - 1]] : [];
    for (const el of ends) {
      el.scrollIntoView({ block: 'nearest' });
      if (lost(el.getBoundingClientRect())) {
        out.push(`a row cannot be scrolled into view: ${el.textContent.trim().slice(0, 30)}`);
        break;
      }
    }
    const help = ui.screens[name].querySelector('.menu-help');
    if (help && help.textContent.trim()) {
      help.scrollIntoView({ block: 'nearest' });
      const b = help.getBoundingClientRect();
      if (b.top >= H - 4) {
        out.push('the help column cannot be reached');
      } else if (b.bottom > H + 4) {
        out.push(`the help column is cut off by ${Math.round(b.bottom - H)}px after scrolling`);
      }
    }
    if (!tapExempt.includes(name)) {
      let smallest = null;
      for (const el of stops) {
        const h = Math.round(el.getBoundingClientRect().height);
        if (h > 0 && (smallest === null || h < smallest.h)) {
          smallest = { h, text: el.textContent.trim().slice(0, 24) };
        }
      }
      if (smallest && smallest.h < minTap) {
        out.push(`a ${smallest.h}px tap target: ${smallest.text}`);
      }
    }
    return out;
  };

  const result = {};
  for (const name of screens) {
    try {
      result[name] = checkScreen(name);
    } catch (e) {
      result[name] = [`threw: ${e && e.message ? e.message : e}`];
    }
  }
  ui.show('title');
  return JSON.stringify({ coarse, screens: result });
}

async function walk([label, width, height]) {
  const page = await openPage({ root, width, height, touch: true, seed: [seed] });
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    const args = [SCREENS, MIN_TAP_PX, TAP_EXEMPT].map((a) => JSON.stringify(a)).join(', ');
    return JSON.parse(await page.evaluate(`(${probe.toString()})(${args})`));
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('device check: every screen, on a phone and a tablet');
  console.log('');
  const failures = [];
  for (const device of DEVICES) {
    const where = `${device[0]} ${device[1]}x${device[2]}`;
    const { coarse, screens } = await walk(device);
    if (!coarse) {
      failures.push(`${where}: pointer: coarse did not match, so the touch rules were not exercised`);
    }
    const bad = SCREENS.filter((name) => screens[name].length);
    console.log(`  ${where.padEnd(26)} ${bad.length ? `${bad.length} screen(s) with problems` : 'all clear'}`);
    for (const name of bad) {
      failures.push(...screens[name].map((p) => `${where} ${name}: ${p}`));
    }
  }
  console.log('');
  if (failures.length) {
    console.log(`FAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('PASS, every row and every note is reachable on every device');
  return 0;
}

process.exit(await main());
