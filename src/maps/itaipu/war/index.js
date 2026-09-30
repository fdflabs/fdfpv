/*
 * war/index.js: Itaipu's right bank switchyard, the war mode's `yard-right`
 * (docs/WARFARE-PLAN.md section 8, package M): its fence and its rows of
 * transformers, fitted round the gantries, wires and buildings the town
 * already draws there (town/power.js, town/plan.js).
 *
 *   plan.js     the yard in numbers, from OpenStreetMap's outline, the
 *               lines that end in it and the buildings in it
 *
 * The part interface is the one every part is built against:
 *
 *   export async function buildPart(ctx) -> { group, update(stepIndex), dispose(), stats() }
 *
 * plus `yard`: the sphere of the target yard-right ({ at, r }), the
 * collider indices of the transformers (`solids`, not the fence, which
 * does not burn), the points a hit yard burns at (`fires`) and the OSM
 * outline. takeYard puts it on the map as map.targets['yard-right'].
 *
 * Everything is in the static set: the yard is one of Itaipu's structures
 * (docs/ITAIPU-PLAN.md section 7). What a craft meets is what is drawn,
 * in the one turned shape the shell has, the capsule: a transformer is
 * three (HOLD), two along the tank stacked so its corners, top and plinth
 * are held, and one along the bushings and the conservator over it; the
 * fence is two capsules stacked along each piece, 2.4 m of it.
 *
 * The data is OpenStreetMap's, ODbL: "(c) OpenStreetMap contributors",
 * credited with the town's (town/index.js).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { makeSink } from '../town/mesh.js';
import { planYard, TANK, FENCE } from './plan.js';

/* Linear tints: galvanised steel, the tanks' grey paint, concrete, and
 * the bushings' brown porcelain. Every piece is in the kit's plain group
 * (the finish keys below), which the town's sink bakes into one mesh: the
 * yard is two draw calls and their shadows, not one per finish. */
const STEEL = [0.46, 0.47, 0.48];
const PAINT = [0.3, 0.33, 0.32];
const CONCRETE = [0.32, 0.31, 0.29];
const PORCELAIN = [0.22, 0.1, 0.05];

/*
 * A transformer as drawn and as collided, metres in its own frame (u
 * along its axis, y over the ground). What stands on the tank:
 * `conservator` a bar of half width r along u from u0 to u1 with its axis
 * `y` over the tank's top, and `bushings` at each u, `height` tall. The
 * colliders (HOLD): two capsules along the tank from -u to u, at each y,
 * radius r, and one on the conservator's axis along it and the bushings.
 *
 * Tuned together, by sampling the drawn plinth, tank, conservator and
 * bushings every 1/16 m2 and the capsules' outsides 5 cm out, as the
 * collision audit judges (scripts/collide-audit-itaipu.js): 99.6 % of the
 * drawn points within 0.3 m of a capsule or of the ground (what is not is
 * the tank's top corners), and no point of a capsule's outside more than
 * 1 m from anything drawn. That is why the bushings are 1.8 m and close
 * together and the conservator is on the top capsule's axis: one capsule
 * over three bushings 3 m tall and 2.4 m apart stood a metre clear of
 * them. The plinth is PLINTH wider than the tank and as high as the
 * ground holds (plan.js TANK.plinth, 0.3 m).
 */
const KIT = {
  conservator: {
    u0: -3.4, u1: -0.4, y: 1, r: 0.45,
  },
  bushings: { u: [0.4, 1.8, 3.2], height: 1.8, r: 0.18 },
};
const HOLD = {
  tank: { u: 2.7, y: [1.1, 3.4], r: 2.2 },
  top: { u: 3.2, r: 0.6 },
};
const PLINTH = 0.1;

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const t0 = performance.now();
  const yard = planYard(ctx.data['osm/power.json'], ctx.data['osm/buildings.json'].features, ctx.ground);
  const group = new THREE.Group();
  group.name = 'itaipu-yard';
  const sink = makeSink(THREE, ctx.mats.look);
  const solids = [];
  const capsule = (kind, a, b, r) => {
    const i = ctx.colliders.ax.length;
    ctx.colliders.add(kind, a[0], a[1], a[2], b[0], b[1], b[2], r);
    solids.push(i);
  };
  const cast = { cast: true };

  for (const t of yard.transformers) {
    const along = (u, y) => [t.x + t.ax * u, y, t.z + t.az * u];
    const half = TANK.length / 2;
    const w = TANK.width / 2;
    const base = t.y + TANK.plinth;
    /* The plinth, from under the ground, a little wider than the tank. */
    sink.bar('joint', CONCRETE, along(-half - PLINTH, t.y - 0.3), along(half + PLINTH, t.y - 0.3), w + PLINTH, cast, TANK.plinth + 0.3);
    const mid = base + TANK.height / 2;
    sink.bar('flashing', PAINT, along(-half, mid), along(half, mid), w, cast, TANK.height / 2);
    /* The conservator on top and three bushings. */
    const top = base + TANK.height;
    const c = KIT.conservator;
    sink.bar('flashing', PAINT, along(c.u0, top + c.y), along(c.u1, top + c.y), c.r, cast);
    for (const u of KIT.bushings.u) {
      sink.bar('joint', PORCELAIN, along(u, top), along(u, top + KIT.bushings.height), KIT.bushings.r, cast);
    }
    for (const y of HOLD.tank.y) {
      capsule('wall', along(-HOLD.tank.u, t.y + y), along(HOLD.tank.u, t.y + y), HOLD.tank.r);
    }
    capsule('wall', along(-HOLD.top.u, top + c.y), along(HOLD.top.u, top + c.y), HOLD.top.r);
  }
  const equipment = solids.slice();

  /* The fence: a post at each piece's start, three rails, and the chain
   * link between, half seen, in one mesh of its own (the kit's materials
   * are opaque). */
  const fr = FENCE.height / 4;
  const link = [];
  for (const [a, b] of yard.fence) {
    sink.bar('metal', STEEL, [a[0], a[1] - 0.3, a[2]], [a[0], a[1] + FENCE.height, a[2]], 0.05, cast);
    for (const h of [0.1, FENCE.height / 2, FENCE.height]) {
      sink.bar('metal', STEEL, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.025, { cast: true, caps: false });
    }
    const a1 = [a[0], a[1] + FENCE.height, a[2]];
    const b1 = [b[0], b[1] + FENCE.height, b[2]];
    link.push(...a, ...b, ...b1, ...a, ...b1, ...a1);
    for (const k of [1, 3]) {
      capsule('pole', [a[0], a[1] + fr * k, a[2]], [b[0], b[1] + fr * k, b[2]], fr);
    }
  }
  const drawn = sink.build(group, []);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(link, 3));
  linkGeo.computeVertexNormals();
  linkGeo.computeBoundingSphere();
  const linkMesh = new THREE.Mesh(linkGeo, new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(...STEEL, THREE.LinearSRGBColorSpace),
    roughness: 0.6,
    metalness: 0.5,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  linkMesh.name = 'itaipu-yard-fence';
  group.add(linkMesh);
  const buildMs = performance.now() - t0;
  ctx.progress(1);

  return {
    group,
    update() {},
    dispose() {},
    yard: { ...yard.site, solids: equipment, outline: yard.outline },
    stats: () => ({
      transformers: yard.transformers.length,
      fence: yard.fence.length,
      solids: solids.length,
      drawn,
      buildMs: Math.round(buildMs),
    }),
  };
}

/* What a target can be (docs/WARFARE-PLAN.md section 8), as the dam
 * part's TARGET_STATES. */
const STATES = ['ok', 'smoke', 'fire', 'destroyed'];

/*
 * The map's yard-right is this part's yard: called on the built map, it
 * replaces the entry the dam part names (a placeholder at the outline's
 * centroid, no colliders) with { at, r, part, colliders, fires, outline }
 * from the yard as built. The dam part freezes its targets, so this is a
 * new object with the dam's other entries as they are, not an edit of
 * the dam's. map.setTargetState stays the dam's where there is one: it
 * reads the map's entry when a state is set, so yard-right's smoke and
 * fire spread over this yard's `fires`. Where
 * the dam names no targets yet (main before its version 2), the map gets
 * yard-right alone and a setTargetState that keeps the state and throws
 * on an unknown id or state, as the dam's does, and draws nothing. The result is on scene.userData.itaipu for the
 * check (tools/itaipu/war-check.js).
 */
export function takeYard(map) {
  const it = map.scene.userData.itaipu;
  const { yard } = it.parts.war;
  const entry = Object.freeze({
    at: Object.freeze(yard.at.slice()),
    r: yard.r,
    part: 'yard',
    colliders: Object.freeze(yard.solids.slice()),
    fires: Object.freeze(yard.fires.map((p) => Object.freeze(p.slice()))),
    outline: Object.freeze(yard.outline.map((p) => Object.freeze(p.slice()))),
  });
  map.targets = Object.freeze({ ...(map.targets ?? {}), 'yard-right': entry });
  if (!map.setTargetState) {
    const states = { 'yard-right': 'ok' };
    map.setTargetState = (id, state) => {
      if (!(id in states)) {
        throw new Error(`itaipu war: no target ${id}`);
      }
      if (!STATES.includes(state)) {
        throw new Error(`itaipu war: a target is ${STATES.join(', ')}, not ${state}`);
      }
      states[id] = state;
    };
  }
  it.targets = map.targets;
  it.setTargetState = (id, state) => map.setTargetState(id, state);
  return map;
}
