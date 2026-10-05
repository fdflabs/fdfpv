/*
 * contacts.js: the room's contact registry for ops missions (docs/campaign/
 * interior/TECH-NEEDS.md N13, CONTRACT-P0.md section 4.3). One record per
 * authored contact a mission has put on the map: a person, a vehicle, an
 * aircraft. The room owns every record, so every pilot sees one picture;
 * a screen draws each contact from its route and its record and never
 * decides anything about it.
 *
 * A mission's CONTACT is { id, kind, group?, size?, faction?, track? }:
 *   kind     'person', 'vehicle', 'aircraft', 'site'
 *   size     metres across, for whether it is big enough in a picture to
 *            be noticed (SIZE below by kind without one)
 *   faction  its hidden truth: read by the mission's data, never sent
 *   track    { soft, hard } seconds (MISSIONS.md 1.7), and the alternate
 *            route a hard threshold moves it to, given at its spawn
 *
 * A RECORD (plain data, the room's match holds the list):
 *   id, kind, group, size, route, t0 (room ms its route began), alt
 *   state      'undiscovered' | 'seen' | 'lost' | 'vanished'
 *   cls, clsAt, label, evidence [{ t, cls, why }]
 *   lkp        [x, y, z] where it was last in a frame
 *   seenAt     room ms the sighting in force (or the last) began
 *   firstAt    room ms of its first sighting, its discovery
 *   lostSince  room ms it left the last frame, while lost
 *   reacqAt    room ms of its last reacquisition after a soft loss
 *   inSince    room ms it entered a frame, before SEEN_MS have passed
 *   lastIn     the last grid ms it was in a frame
 *   by         seats whose frames hold it
 *   hards      hard threshold moves since the stage began
 *   next       { route, t0, alt } a scripted move waiting for its time
 *   reached    { point: room ms it first came within the point }
 *   vanishedAt, watched (in a frame in its last WATCH_MS)
 *
 * The room steps the registry on a fixed grid of room ms (step), so the
 * same poses and camera reports give the same records whenever they
 * arrive. A class changes only through classify(), which the mission's
 * scripted cues call: no pilot's message reaches it.
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

import { sight } from './sight.js';

/* In a frame this long before it counts as seen (MISSIONS.md 1.2). */
export const SEEN_MS = 500;
/* Its size over the frame's width at least this to be noticed: about six
 * pixels across a 1920 pixel picture, so a person a kilometre off needs
 * the zoom. */
export const NOTICE = 0.003;
/* A route that ends with its contact in a frame in this long before is
 * watched to the end (a distant visual held until it disappears). The
 * Interior's dispersal routes give their last glimpse from overhead up to
 * 22 s before they end under the crowns (measured on canopyBlocks). */
export const WATCH_MS = 30000;
/* Metres across, by kind, for a contact whose data gives none. */
export const SIZE = Object.freeze({
  person: 1.7, vehicle: 4.5, aircraft: 2, site: 10,
});

/* A contact's record, new on the map at room ms t on `route`. */
export function spawn(def, route, t, alt = null) {
  return {
    id: def.id,
    kind: def.kind,
    group: def.group ?? null,
    size: def.size ?? SIZE[def.kind] ?? 2,
    route,
    t0: t,
    alt,
    state: 'undiscovered',
    cls: null,
    clsAt: null,
    label: null,
    evidence: [],
    lkp: null,
    seenAt: null,
    firstAt: null,
    lostSince: null,
    reacqAt: null,
    inSince: null,
    lastIn: null,
    by: [],
    hards: 0,
    movedFor: null,
    next: null,
    reached: {},
    vanishedAt: null,
    watched: false,
  };
}

/* The records a selection names: a contact's id or a group's name. */
export function membersOf(list, sel) {
  return list.filter((c) => c.id === sel || c.group === sel);
}

/* Where a contact is at room ms t, its centre (half its size up, a metre
 * at most), or null once its route is over. */
export function centreOf(c, world, t) {
  const p = world.poseOnRoute(c.route, t - c.t0);
  if (!p || p.action === 'gone') {
    return null;
  }
  return [p.x, p.y, p.z + Math.min(1, c.size / 2)];
}

/* The seats whose pictures hold point `at` of size `size` at grid ms t:
 * inside the frame, big enough to notice, not behind crowns. pilots: [{
 * seat, p, cam }] at t, cam null for a seat with no fresh report. */
export function viewers(pilots, world, at, size) {
  const by = [];
  for (const q of pilots) {
    if (!q.cam) {
      continue;
    }
    const s = sight(q.p, q.cam, at, size);
    if (s && s.inside && s.size >= NOTICE && !world.canopyBlocks(q.p, at)) {
      by.push(q.seat);
    }
  }
  return by;
}

/*
 * The registry at grid ms t: each contact moved along its route (vanished
 * when it is over), looked for in every picture, and its state, last
 * known position and thresholds moved on. `track(c)` is the contact's
 * { soft, hard } in seconds, or null. points: the mission's named places
 * { name: { at: [x, y], r } } for `reached`. Returns the records whose
 * state, route or class changed (for the room to tell), so a quiet step
 * tells nothing.
 */
export function step(list, t, pilots, world, { track = () => null, points = {} } = {}) {
  const changed = new Set();
  for (const c of list) {
    if (c.next && t >= c.next.t0) {
      move(c, c.next.route, c.next.t0, c.next.alt);
      c.next = null;
      changed.add(c);
    }
    if (c.state === 'vanished' || t < c.t0) {
      continue;
    }
    const at = centreOf(c, world, t);
    if (!at) {
      c.state = 'vanished';
      c.vanishedAt = t;
      c.watched = c.lastIn != null && t - c.lastIn <= WATCH_MS;
      c.by = [];
      changed.add(c);
      continue;
    }
    for (const [name, pt] of Object.entries(points)) {
      if (c.reached[name] == null && pt.r != null && (at[0] - pt.at[0]) ** 2 + (at[1] - pt.at[1]) ** 2 <= pt.r * pt.r) {
        c.reached[name] = t;
      }
    }
    /* Who holds it in a frame is told with the next change, not as one:
     * it moves at the grid's rate and would send the view ten times a
     * second. */
    const by = viewers(pilots, world, at, c.size);
    c.by = by;
    const tr = track(c);
    if (by.length) {
      c.inSince ??= t;
      c.lastIn = t;
      c.lkp = at.map((v) => Math.round(v * 100) / 100);
      if (c.state !== 'seen' && t - c.inSince >= SEEN_MS) {
        if (c.state === 'lost' && tr && t - c.lostSince >= tr.soft * 1000) {
          c.reacqAt = t;
        }
        c.state = 'seen';
        c.seenAt = t;
        c.lostSince = null;
        c.firstAt ??= t;
        changed.add(c);
      }
      continue;
    }
    c.inSince = null;
    if (c.state === 'seen') {
      c.state = 'lost';
      c.lostSince = c.lastIn;
      changed.add(c);
    }
    if (c.state === 'lost' && tr && tr.hard != null && c.alt && c.movedFor !== c.lostSince && t - c.lostSince >= tr.hard * 1000) {
      c.movedFor = c.lostSince;
      c.route = c.alt;
      c.t0 = t;
      c.hards += 1;
      changed.add(c);
    }
  }
  return [...changed];
}

/* Discovery gives a contact the campaign's first class (its unknown). */
export function discover(c, classes) {
  if (c.cls == null && c.firstAt != null) {
    c.cls = classes[0];
    c.clsAt = c.firstAt;
    c.evidence.push({ t: c.firstAt, cls: c.cls, why: 'discovered' });
  }
}

/* Scripted evidence: contact c is class `cls` from room ms t, `why` a
 * string key for the debrief, `label` a group label key or undefined to
 * keep its own. Refuses a class the campaign has not got. */
export function classify(c, cls, t, classes, why = null, label = undefined) {
  if (!classes.includes(cls)) {
    throw new Error(`contacts: no class ${cls}`);
  }
  if (label !== undefined) {
    c.label = label;
  }
  if (c.cls === cls) {
    return false;
  }
  c.cls = cls;
  c.clsAt = t;
  c.evidence.push({ t, cls, why });
  return true;
}

/* A contact sent somewhere else from room ms t: a scripted move (a
 * dispersal), its next route starting there. */
export function move(c, route, t, alt = undefined) {
  c.route = route;
  c.t0 = t;
  if (alt !== undefined) {
    c.alt = alt;
  }
}

/* What every screen is told of the registry: never the truth. */
export function contactsView(list) {
  return list.map((c) => ({
    id: c.id,
    kind: c.kind,
    group: c.group,
    route: c.route,
    t0: c.t0,
    state: c.state,
    cls: c.cls,
    label: c.label,
    lkp: c.lkp,
    seenAt: c.seenAt,
    lostSince: c.lostSince,
    by: c.by.slice(),
    hards: c.hards,
  }));
}
