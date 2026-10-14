/*
 * rows.js: every ops campaign mission's place on its campaign's card, as
 * data with no import, so src/game/campaign.js (which the browser's
 * settings and the tracks Worker load) reads it without the mission
 * files' worlds, films and routes. src/share/ops/missions.js imports these
 * rows, never the other way round, and throws at load when a mission file
 * and its row disagree; campaign.js opsCampaignOf throws on a row that
 * does not add up.
 *
 *   campaign  the campaign it is flown in (a mission file's `campaign`)
 *   order     its place, 1 up, flown in that order
 *   key       the card's words, string keys
 *             `ops.campaign.<campaign>.m.<key>` and `..._blurb`
 *   release   the gate (src/game/campaign.js released): 'available' is
 *             offered and started; 'development' is held and only a
 *             developer's room starts it; 'soon' has no mission file yet,
 *             so nothing to fly. A mission is made available here and
 *             nowhere else.
 *   label     the word the card shows instead of the release's own
 *             (cardLabel): the owner asked for Under development on 4 and
 *             5 of The Interior (docs/campaign/interior/PLAN.md section 3,
 *             TECH-NEEDS.md F6)
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

export const ROWS = Object.freeze([
  { id: 'interior-1', campaign: 'interior', order: 1, key: 'oldwar', release: 'development' },
  { id: 'interior-2', campaign: 'interior', order: 2, key: 'forest', release: 'development' },
  { id: 'interior-3', campaign: 'interior', order: 3, key: 'nomansland', release: 'development' },
  { id: 'interior-4', campaign: 'interior', order: 4, key: 'otherwar', release: 'soon', label: 'development' },
  { id: 'interior-5', campaign: 'interior', order: 5, key: 'lastcolumn', release: 'soon', label: 'development' },
]);
