/*
 * briefing.js: Operations' briefing, the head of a war room's lobby
 * (docs/redesign/PLAN.md 2.4: the briefing IS the session).
 *
 * What a pilot is told before Deploy: the mission and its line, what to
 * do first, where, on what, for how long, with how many, and who can
 * join the room. Pure: the screen (src/ui/ui.js setWarLobby) draws what
 * this returns, and scripts/briefing-selftest.js holds it whole in Node.
 *
 * WHAT IS THE MISSION'S AND WHAT IS THE SCREEN'S. The mission data
 * (src/share/war/missions, the stage engine's, not this file's) gives the
 * title, the map, the airframes a pilot has and the objectives of its
 * opening stage, where it has stages. The campaign (src/game/campaign.js
 * ACT1) gives its line. The estimated length is the design's
 * (docs/campaign/MISSIONS.md section 2), held here until the missions
 * carry it; a mission it does not list says so rather than guessing.
 * There is no difficulty: the war scales by its pilots and its seed
 * (docs/PILLARS.md section 3).
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

import { MISSIONS } from '../share/war/missions/index.js';
import { ACT1 } from '../game/campaign.js';
import { str } from '../strings/index.js';

/* Minutes, low and high, from docs/campaign/MISSIONS.md section 2. */
export const MINUTES = {
  'itaipu-1': [9, 13],
  'itaipu-2': [10, 14],
  'itaipu-3': [10, 14],
  'itaipu-4': [12, 16],
};

/* Pilots a mission is built for (docs/campaign/MISSIONS.md 1.6). */
export const PILOTS = [1, 8];

/* The objectives a pilot meets first: the first stage that has any. */
function openingObjectives(mission) {
  const stage = (mission.stages || []).find((s) => Array.isArray(s.objectives) && s.objectives.length);
  return stage ? stage.objectives.map((o) => o.text) : [];
}

/*
 * The briefing of mission `id` for a room, or null for an id that is no
 * mission. `room` is { public, code }: who can join.
 */
export function briefingOf(id, room = { public: true, code: null }) {
  const mission = MISSIONS[id];
  if (!mission) {
    return null;
  }
  const act = ACT1.find((m) => m.id === id);
  const minutes = MINUTES[id];
  return {
    title: str(mission.title),
    line: act ? str(`campaign.m.${act.key}_blurb`) : '',
    objectives: openingObjectives(mission).map((k) => str(k)),
    facts: [
      { label: str('brief.where'), value: str(`brief.map_${mission.map}`) },
      { label: str('brief.aircraft'), value: str('brief.aircraft_value', { n: mission.airframes }) },
      { label: str('brief.length'), value: minutes ? str('brief.minutes', { low: minutes[0], high: minutes[1] }) : str('brief.length_open') },
      { label: str('brief.pilots'), value: str('brief.pilots_value', { low: PILOTS[0], high: PILOTS[1] }) },
      { label: str('brief.room'), value: room.public ? str('brief.room_public') : str('brief.room_private', { code: room.code || '' }) },
    ],
  };
}
