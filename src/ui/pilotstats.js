/*
 * pilotstats.js: the pilot's numbers on Flight Club's page (the owner,
 * 2026-10-08: "i need prominently to see the game stats, played hours in
 * total etc"). docs/PILOT-STATS.md is the contract.
 *
 * Every number is read from what the settings carry and the account
 * syncs: the time in the air (src/share/flighttime.js, the record the
 * firsts are paid from), the flights and the room games' results
 * (src/share/pilotcounts.js), the XP and medals and tracks lapped
 * (src/game/progress.js), and the war campaign (src/game/campaign.js). So
 * a sync that brings another computer's progress changes these numbers by
 * the same renderMenu that repaints the rest of the page. The tokens are
 * the wallet the server last answered with (src/share/account.js
 * readWallet), handed in: painting never asks the server.
 *
 * Reading it is split from painting it so the panel is rebuilt only when
 * a number it shows has changed: renderMenu runs on every key press.
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

import { AIRFRAME_IDS, airframeById, landPlaneOf, retiredAirframe } from '../../configs/airframes.js';
import { cleanCampaign, MAX_STARS, ACT1, INTERIOR } from '../game/campaign.js';
import { MEDAL_STEPS } from '../game/medals.js';
import { levelInfo } from '../game/progress.js';
import { flightTotals } from '../share/flighttime.js';
import { countTotals } from '../share/pilotcounts.js';
import { currentLocale, plural, str } from '../strings/index.js';
import { flightTimeText } from './carousel.js';
import { el } from './dom.js';

/* The Flight Club modes whose time is shown, each under its card's name.
 * Catch the Ace! and Trick Battle add their matches won and best score. */
const MODE_TIME = [
  ['race', 'ui.track_mode'],
  ['free', 'ui.free_flight_card'],
  ['combat', 'combat.card'],
  ['tag', 'roomtag.section'],
  ['jam', 'jam.card'],
];

/* A float version is the land plane with a toggle on (configs/airframes.js
 * THE FLOAT VERSIONS), so its time is the land plane's. A retired id keeps
 * its own name: the pilot flew that aircraft, not its successor. */
function planeName(id) {
  if (AIRFRAME_IDS.includes(id)) {
    return airframeById(id).name;
  }
  const gone = retiredAirframe(id);
  return gone ? gone.name : null;
}

/* The numbers, from the settings and the wallet last held (null when
 * signed out or never answered). Plain data, so its JSON is the key the
 * panel is rebuilt on. */
export function pilotStats(settings, wallet = null) {
  const s = settings || {};
  const total = flightTotals(s.flightTime);
  const counts = countTotals(s.pilotCounts);
  const byPlane = {};
  for (const [id, secs] of Object.entries(total.byAirframe)) {
    const land = landPlaneOf(id);
    if (secs > 0 && planeName(land)) {
      byPlane[land] = (byPlane[land] || 0) + secs;
    }
  }
  const planes = Object.entries(byPlane).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const progress = s.progress || {};
  const level = levelInfo(Number(progress.xp) || 0);
  const medals = Object.fromEntries(MEDAL_STEPS.map((m) => [m, 0]));
  for (const m of Object.values(progress.medals || {})) {
    if (m in medals) {
      medals[m] += 1;
    }
  }
  const campaign = cleanCampaign(s.campaign);
  const missions = Object.values(campaign.missions);
  return {
    seconds: total.seconds,
    level: level.level,
    xp: level.xp,
    to: level.to,
    frac: progress.unlockAll ? 1 : level.frac,
    planes: planes.length,
    top: planes.length ? { id: planes[0][0], seconds: planes[0][1] } : null,
    medals,
    tracks: Object.keys(progress.courses || {}).length,
    won: missions.filter((m) => m.won).length,
    stars: missions.reduce((n, m) => n + m.stars, 0),
    starsMax: (ACT1.length + INTERIOR.length) * MAX_STARS,
    modes: MODE_TIME.map(([id]) => total.byActivity[id] || 0),
    flights: counts.flights,
    games: { tag: counts.tag, jam: counts.jam },
    tokens: wallet && Number.isFinite(wallet.balance) ? wallet.balance : null,
  };
}

const num = (n) => n.toLocaleString(currentLocale());

/* One tile: its bracketed label, the number, and a line under it. */
function tile(key, label, value, sub) {
  const box = el('div', `gate-stat gate-stat-${key}`);
  box.dataset.stat = key;
  box.append(el('span', 'gate-stat-label', label), el('span', 'gate-stat-value', value));
  if (sub) {
    box.append(el('span', 'gate-stat-sub', sub));
  }
  return box;
}

/* The panel into `host`, emptied first. */
export function paintPilotStats(host, st) {
  host.textContent = '';
  const head = el('div', 'gate-stats-head');
  head.dataset.stat = 'time';
  head.append(
    el('span', 'gate-stats-title', str('stats.title')),
    el('span', 'gate-stats-time', st.seconds > 0 ? flightTimeText(st.seconds) : str('stats.zero_time')),
    el('span', 'gate-stats-time-label', str('stats.total_time')),
  );
  const extra = el('span', 'gate-stats-extra');
  const flights = el('span', 'gate-stats-flights', plural('stats.flights', st.flights, { n: num(st.flights) }));
  flights.dataset.stat = 'flights';
  extra.append(flights);
  if (st.tokens !== null) {
    const tokens = el('span', 'gate-stats-tokens', str('shop.tokens', { n: num(st.tokens) }));
    tokens.dataset.stat = 'tokens';
    extra.append(tokens);
  }
  head.append(extra);
  const level = tile('level', str('stats.level'), num(st.level), str('progress.xp_of', { xp: num(st.xp), to: num(st.to) }));
  const bar = el('span', 'gate-stat-bar');
  bar.style.setProperty('--frac', String(Math.max(0, Math.min(1, st.frac))));
  level.append(bar);
  const top = st.top
    ? str('stats.most_flown', { plane: planeName(st.top.id), time: flightTimeText(st.top.seconds) })
    : str('stats.none_yet');
  const medals = MEDAL_STEPS.slice().reverse().map((m) => `${num(st.medals[m])} ${str(`medal.${m}`)}`).join(' · ');
  const tiles = el('div', 'gate-stats-tiles');
  tiles.append(
    level,
    tile('planes', str('stats.aircraft'), num(st.planes), top),
    tile('medals', str('stats.medals'), num(MEDAL_STEPS.reduce((n, m) => n + st.medals[m], 0)), medals),
    tile('tracks', str('stats.tracks'), num(st.tracks), str('stats.tracks_sub')),
    tile('war', str('stats.missions'), num(st.won), str('stats.stars', { n: num(st.stars), max: num(st.starsMax) })),
  );
  /* A pilot with no time sees the nudge where the modes' times go: five
   * zeros say nothing, and the panel keeps one height for the cards. */
  if (st.seconds === 0) {
    host.append(head, tiles, el('div', 'gate-stats-modes gate-stats-nudge', str('stats.nudge')));
    return;
  }
  const modes = el('div', 'gate-stats-modes');
  modes.dataset.stat = 'modes';
  MODE_TIME.forEach(([id, key], i) => {
    const m = el('span', 'gate-stats-mode');
    m.dataset.mode = id;
    m.append(el('span', 'gate-stats-mode-name', str(key)), el('span', 'gate-stats-mode-time', st.modes[i] > 0 ? flightTimeText(st.modes[i]) : '0'));
    const game = st.games[id];
    if (game && game.played > 0) {
      m.append(el('span', 'gate-stats-mode-game', str('stats.game', { won: num(game.won), played: num(game.played), best: num(game.best) })));
    }
    modes.append(m);
  });
  host.append(head, tiles, modes);
}
