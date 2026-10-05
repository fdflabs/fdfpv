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

/* Clothes, linear: faded work shirts, olive and grey for the camp. */
const TINTS = [[0.1, 0.12, 0.07], [0.13, 0.13, 0.12], [0.1, 0.08, 0.06], [0.18, 0.15, 0.1], [0.07, 0.09, 0.13], [0.26, 0.25, 0.22]];
const tintOf = (id) => TINTS[Math.floor(hash01(id.length, id.charCodeAt(0) + id.charCodeAt(id.length - 1), 61) * TINTS.length)];

/*
 * Build it before the colliders are built (camp.js and ambient.js add
 * solids); returns { group, setContacts, setCamp, demo, update(seconds),
 * stats(), dispose(), routes, camp }.
 */
export function buildLife({
  THREE, scene, world, colliders, roofs,
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
      const tint = c.tint || tintOf(c.id);
      if (c.kind === 'motorcycle' || c.kind === 'pickup') {
        cars.push({ ...p, kind: c.kind, tint });
        if (c.kind === 'motorcycle' && p.action === 'drive') {
          people.push({ ...p, y: p.y + 0.35, action: 'sit', tint: [0.3, 0.3, 0.32] });
        }
      } else {
        people.push({ ...p, tint });
        if (p.action === 'pushMotorcycle') {
          cars.push({
            x: p.x + 0.9 * Math.sin(p.heading) - 0.6 * Math.cos(p.heading), y: p.y, z: p.z - 0.9 * Math.cos(p.heading) - 0.6 * Math.sin(p.heading), heading: p.heading, kind: 'motorcycle', tint: [0.4, 0.06, 0.05],
          });
        }
      }
    }
    CAMP_PROPS.motorcycles.slice(0, parked).forEach((m, k) => {
      cars.push({
        x: m.at[0], y: world.groundAt(m.at[0], m.at[1]), z: m.at[1], heading: Math.atan2(m.dir[0], -m.dir[1]), kind: 'motorcycle', tint: TINTS[(k * 2) % TINTS.length],
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
      draw();
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
