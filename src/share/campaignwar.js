/*
 * campaignwar.js: everything the campaign (src/game/campaign.js,
 * src/ui/campaign.js) says to the war room or reads back from it, in one
 * file, so a change to the war's wire is a change here and nowhere else.
 *
 * Written against the war owner's Act 1 interface (branch war-act1, not
 * yet on main, whose edge/rooms/war.js ignores both fields):
 *
 *   loadout   per seat, { rack 4..6, warhead 'standard'|'wide'|'emp'|
 *             'penetrator', speedMul 1..1.15 }. The host's may ride in
 *             the war's start; any seat's, the host's too, goes as
 *             { type: 'war', op: 'loadout', loadout } before the go, and
 *             one the room will not take comes back as error 'loadout'.
 *             The view echoes every seat's as `loadouts` { seat: loadout },
 *             { 4, 'standard', 1 } by default. The war client applies
 *             speedMul at the go from that echo; the campaign only sends.
 *   result    null while the mission is on, then { won, stars 0..3,
 *             credits, criteria }, the room's (credits are 100 a star and
 *             10 a team kill). Read, never computed; criteria unused.
 *
 * Pure: messages built and views read, no socket and no DOM.
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

/* The host's start of a campaign mission, as the Defend Itaipu start row
 * makes it (src/main.js warStart): `how` is { intro: true }, the briefing's
 * intro first, or { from: 'checkpoint' }, a lost mission again from its
 * lost stage. */
export function startMessage(missionId, loadout, how = { intro: true }) {
  return {
    type: 'war', op: 'start', mission: missionId, ...how, loadout,
  };
}

export function loadoutMessage(loadout) {
  return { type: 'war', op: 'loadout', loadout };
}

/* The war states in which a seat's loadout still counts: before the go. */
const BEFORE_GO = new Set(['lobby', 'briefing', 'countdown']);

/*
 * Whether this seat should say its loadout now: the room echoes loadouts
 * (so it takes them), the war has not gone, and the echo is not already
 * this one. A room that echoes nothing is one that would refuse the op.
 */
export function loadoutDue(view, seat, loadout) {
  if (!view || !BEFORE_GO.has(view.state) || !view.loadouts || typeof view.loadouts !== 'object' || seat == null) {
    return false;
  }
  const echo = view.loadouts[seat];
  return !echo || echo.rack !== loadout.rack || echo.warhead !== loadout.warhead || echo.speedMul !== loadout.speedMul;
}

/* The room's result for the war in `view`, checked, or null while there
 * is none. */
export function resultOf(view) {
  const r = view && view.result;
  if (!r || typeof r !== 'object' || !Number.isFinite(r.stars) || !Number.isFinite(r.credits) || typeof r.won !== 'boolean') {
    return null;
  }
  return { stars: r.stars, credits: r.credits, won: r.won };
}
