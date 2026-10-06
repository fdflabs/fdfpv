/*
 * life.js: everything alive or moved on the Interior's map, put together:
 * the room's contacts drawn where routes.js puts them (figures.js,
 * vehicles.js), the camp (camp.js) in the state the room gives it, and
 * the ambient life (ambient.js) on the wall clock.
 *
 *   setContacts(list, roomMs)  the contacts a screen draws: [{ id, kind
 *                              ('person' | 'motorcycle' | 'pickup'),
 *                              route, ms (since it started its route),
 *                              tint? }]; or { id, kind, pose } with a pose
 *                              of the scene frame. A route that is over is
 *                              drawn as nothing. roomMs times the strides.
 *   setCamp({ mark, tarp, mast, parked })
 *                              the marked shelter ('shelter-1' to '-3'),
 *                              the side tarp pulled back 0 to 1, the mast
 *                              down 0 to 1, how many of the camp's four
 *                              motorcycles still stand where they were
 *                              parked (the dispersal pushes them away)
 *   demo(roomMs)               every Mission 1 route's people at once,
 *                              the pair on the middle concealment route:
 *                              for the checks' pictures, never a mission
 *
 * VIEW owns which contacts a screen draws and when (the room's registry);
 * this file only draws them where the shared routes say they are.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { makeRoutes } from '../../share/interior/routes.js';
import { CAMP_PROPS } from '../../share/interior/places.js';
import { hash01 } from '../../share/interior/canopy.js';
import { makeFigures } from '../../render/interior/figures.js';
import { makeVehicles } from '../../render/interior/vehicles.js';
import { buildCamp } from '../../render/interior/camp.js';
import { buildAmbient } from '../../render/interior/ambient.js';

/* Shirts, linear: faded olive, khaki and grey work shirts, a washed
 * blue, a white one gone cream, black, a dull red, a camouflage brown. */
const TINTS = [[0.1, 0.12, 0.07], [0.2, 0.17, 0.11], [0.15, 0.15, 0.14], [0.06, 0.1, 0.18], [0.3, 0.28, 0.23], [0.03, 0.03, 0.03], [0.26, 0.07, 0.05], [0.12, 0.1, 0.06]];
/* Paint, linear: an old red, a faded blue, black, a sun bleached white. */
const PAINTS = [[0.3, 0.03, 0.02], [0.04, 0.09, 0.25], [0.025, 0.025, 0.03], [0.45, 0.45, 0.42]];
/* A whole number from a contact's id, so every screen dresses it alike. */
const seedOf = (id) => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const tintOf = (id) => TINTS[Math.floor(hash01(seedOf(id), 3, 61) * TINTS.length)];
const paintOf = (id) => PAINTS[Math.floor(hash01(seedOf(id), 5, 62) * PAINTS.length)];

/*
 * Build it before the colliders are built (camp.js and ambient.js add
 * solids) and before the first compile (the camp's light patches the
 * ground's material, `groundMaterial`, and the people's); returns
 * { group, setContacts, setCamp, setSun(irradiance), demo,
 * update(seconds), stats(), dispose(), routes, camp }.
 */
export function buildLife({
  THREE, scene, world, colliders, roofs, groundMaterial,
}) {
  const routes = makeRoutes(world);
  const figures = makeFigures(THREE);
  const vehicles = makeVehicles(THREE);
  const camp = buildCamp({
    THREE, world, colliders, roofs,
  });
  const ambient = buildAmbient({ THREE, world, colliders });
  const group = new THREE.Group();
  group.name = 'interior-life';
  group.add(figures.group, vehicles.group, camp.group, ambient.group);
  /* The clearing's fill and lamps light its floor, its people and their
   * motorcycles as they light the camp's props (camp.js). */
  const lit = new Set([groundMaterial]);
  for (const g of [figures.group, vehicles.group]) {
    g.traverse((o) => {
      if (o.isMesh) {
        lit.add(o.material);
      }
    });
  }
  lit.forEach((m) => camp.light.patch(m));
  scene.add(group);
  let contacts = [];
  let parked = CAMP_PROPS.motorcycles.length;
  let seconds = 0;
  let roomMs = 0;

  function draw() {
    const people = [];
    const cars = [];
    for (const c of contacts) {
      const p = c.pose || (c.route ? routes.poseOnRoute(c.route, c.ms) : null);
      if (!p) {
        continue;
      }
      const seed = seedOf(c.id);
      if (c.kind === 'motorcycle' || c.kind === 'pickup') {
        cars.push({ ...p, kind: c.kind, tint: c.tint || paintOf(c.id) });
        if (c.kind === 'motorcycle' && p.action === 'drive') {
          people.push({
            ...p, action: 'ride', tint: [0.3, 0.3, 0.32], seed,
          });
        }
      } else {
        people.push({ ...p, tint: c.tint || tintOf(c.id), seed });
        if (p.action === 'pushMotorcycle') {
          cars.push({
            x: p.x + 0.9 * Math.sin(p.heading) - 0.6 * Math.cos(p.heading), y: p.y, z: p.z - 0.9 * Math.cos(p.heading) - 0.6 * Math.sin(p.heading), heading: p.heading, kind: 'motorcycle', tint: PAINTS[0],
          });
        }
      }
    }
    CAMP_PROPS.motorcycles.slice(0, parked).forEach((m, k) => {
      cars.push({
        x: m.at[0], y: world.groundAt(m.at[0], m.at[1]), z: m.at[1], heading: Math.atan2(m.dir[0], -m.dir[1]), kind: 'motorcycle', tint: PAINTS[k % PAINTS.length],
      });
    });
    figures.set([...people, ...ambient.people(seconds)], roomMs);
    vehicles.set(cars);
  }

  return {
    group,
    routes,
    camp,
    setContacts(list, ms) {
      contacts = list;
      roomMs = ms;
      draw();
    },
    setCamp(state) {
      if (state.parked != null) {
        parked = Math.max(0, Math.min(CAMP_PROPS.motorcycles.length, state.parked));
      }
      camp.setCamp(state);
      draw();
    },
    demo(ms) {
      const list = [];
      for (const id of routes.ids) {
        if (/^camp-.*-loop$/.test(id) || /^colonia-civ/.test(id)) {
          list.push({ id, kind: 'person', route: id, ms });
        }
      }
      list.push({ id: 'pair-a', kind: 'person', route: 'conceal-mid-a', ms: ms % routes.total('conceal-mid-a') });
      list.push({ id: 'pair-b', kind: 'person', route: 'conceal-mid-b', ms: ms % routes.total('conceal-mid-b') });
      list.push({ id: 'moto-road', kind: 'motorcycle', route: 'bravo-moto', ms: ms % routes.total('bravo-moto') });
      list.push({ id: 'pickup', kind: 'pickup', route: 'colonia-pickup', ms: 0 });
      contacts = list;
      roomMs = ms;
      draw();
    },
    update(s) {
      seconds = s;
      ambient.update(s);
      camp.update(s);
      draw();
    },
    setSun(irradiance) {
      camp.light.setSun(irradiance);
    },
    stats: () => ({
      people: figures.stats().drawn, vehicles: vehicles.stats().drawn, camp: camp.stats(), ambient: ambient.stats(),
    }),
    dispose() {
      figures.dispose();
      vehicles.dispose();
      camp.dispose();
      ambient.dispose();
      group.removeFromParent();
    },
  };
}
