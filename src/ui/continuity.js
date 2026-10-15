/*
 * continuity.js: what home's Continue holds (docs/redesign/COMPLETENESS.md
 * item 57): the activity whose session this pilot last opened, and for a
 * campaign the mission it goes on with.
 *
 * THE ACTIVITY is settings.lastActivity, synced whole
 * (src/share/progressmerge.js): a registry id (src/share/modes.js), or the
 * id of a card with a page of its own and no registry row (OWN_ACTIVITIES,
 * The Interior's). A build that does not know an id shows no Continue
 * (src/ui/actions.js continueWay), so an older build on another computer
 * reads the wider set safely and nothing needs migrating.
 *
 * THE MISSION is not stored. It is derived from the campaign progress,
 * which is synced already (settings.campaign, src/game/campaign.js), so a
 * reload, a sign in and another computer agree on it with nothing more to
 * keep or merge: the first mission, in the campaign's order, that this
 * page may play and the pilot has not won. A mission lost is still the
 * next one; with every playable one won there is none, and Continue opens
 * the campaign's page as its card does.
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

import { ACT1, INTERIOR } from '../game/campaign.js';
import { modeById } from '../share/modes.js';

/* The cards Continue may hold that have no registry row: their way's id
 * (src/ui/ways.js) is their activity's. */
const OWN_ACTIVITIES = ['interior'];

/* The activities that are campaigns, with their missions in order. */
export const CAMPAIGN_MISSIONS = { war: ACT1, interior: INTERIOR };

/* The way of activity `id`, or null: unknown to this build, or hidden. */
export function wayOfActivity(id) {
  const mode = modeById(id);
  if (mode) {
    return mode.hidden ? null : mode.card.way;
  }
  return OWN_ACTIVITIES.includes(id) ? id : null;
}

/* The mission Continue goes on with: the first of `missions` (in order,
 * each { id }) that `playable(id)` and `state` (cleanCampaign's) has not
 * won, or null. */
export function nextMission(missions, state, playable) {
  return missions.find((m) => playable(m.id) && state.missions[m.id]?.won !== true) ?? null;
}
