/*
 * water/index.js: the reservoir and the river, drawn (docs/ITAIPU-PLAN.md
 * section 14, package E, first version): flat planes at each body's level
 * over its outline from water.json, each in a still material of its own
 * colour with the sky in it. The plant has both bodies (src/game/water.js
 * waterFor, map.lakes), so floats, waves and water crashes are real on
 * them; what is drawn is still water. The mirror, the spillway's white
 * water, the tailrace's churn and the shore's foam come next.
 *
 * Past the ring the reservoir and the river do not stop, but the data
 * does. Where a body's outline runs along the ring's edge, a strip of the
 * same water carries on outward over the apron (APRON_REACH deep), which
 * the apron's ground rises out of a few kilometres on, so from the air
 * the lake fades into the haze instead of ending on a ruled line.
 *
 * The part interface, the seam every part is built against:
 *
 *   export async function buildPart(ctx) -> { group, update(stepIndex), dispose(), stats() }
 *
 *   ctx = {
 *     THREE, scene, quality: 'low'|'medium'|'high',
 *     data,          parsed JSON files from the data folder, by name
 *                    ('water.json', 'dam.json', 'osm/roads.json', ...)
 *     base,          the data folder's URL, ending in a slash, for what is
 *                    not JSON (canopy/, masks/, imagery/)
 *     manifest,      the data's manifest.json
 *     ground(x, z),  terrain height, world metres, water beds included
 *     colliders,     the map's Colliders, not yet built
 *     roofs,         the map's roofs record (src/maps/alps/roofs.js)
 *     mats,          swiss2's material kit, shared, never disposed by a part
 *     progress(f),   0 to 1 within the part's share of the bar
 *   }
 *
 * A part adds its colliders and roof records during buildPart and never
 * after; the map calls colliders.build() once, when every part is in.
 * The map adds `group` to the scene, and passes every material in it
 * through the light (look/index.js finish) once all the parts are built.
 * On a swap the scene graph frees every geometry, material and texture
 * in `group` (src/render/shell.js disposeSceneGraph); dispose() frees
 * only what the graph cannot reach (a render target, a worker's buffer).
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

/* How far past the ring a body's water is carried over the apron, and
 * past either end of where it meets the edge. */
const APRON_REACH = 30000;
const APRON_WIDEN = 200;

/* A body's outline as a mesh at its level, holes and all. */
function surface(THREE, body) {
  const pts = body.outline.map(([x, z]) => new THREE.Vector2(x, z));
  const holes = (body.holes || []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const tris = THREE.ShapeUtils.triangulateShape(pts, holes);
  const all = pts.concat(...holes);
  const pos = new Float32Array(all.length * 3);
  all.forEach((p, k) => {
    pos[k * 3] = p.x;
    pos[k * 3 + 1] = body.y;
    pos[k * 3 + 2] = p.y;
  });
  const idx = [];
  for (const [a, b, c] of tris) {
    /* Up facing whichever way the outline winds. */
    const cross = (all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[b].y - all[a].y) * (all[c].x - all[a].x);
    idx.push(...(cross < 0 ? [a, b, c] : [a, c, b]));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* The strips past the ring's edge where `body` meets it. */
function strips(THREE, body, half) {
  const out = [];
  for (const [axis, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
    const along = body.outline.filter((p) => Math.abs((axis === 'x' ? p[0] : p[1]) - sign * half) < 1)
      .map((p) => (axis === 'x' ? p[1] : p[0]));
    if (!along.length) {
      continue;
    }
    const a0 = Math.max(-half, Math.min(...along) - APRON_WIDEN);
    const a1 = Math.min(half, Math.max(...along) + APRON_WIDEN);
    const d0 = sign * half;
    const d1 = sign * (half + APRON_REACH);
    const geo = new THREE.PlaneGeometry(Math.abs(a1 - a0), APRON_REACH);
    geo.rotateX(-Math.PI / 2);
    if (axis === 'x') {
      geo.rotateY(Math.PI / 2);
      geo.translate((d0 + d1) / 2, body.y, (a0 + a1) / 2);
    } else {
      geo.translate((a0 + a1) / 2, body.y, (d0 + d1) / 2);
    }
    out.push(geo);
  }
  return out;
}

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'itaipu-water';
  const half = ctx.manifest.frame.ring[1];
  /* Still water under a high sun, lit by the environment's sky: the
   * reservoir a tropical lake's blue green, which from the air reads
   * blue for the sky it holds, and the river below a greyer green with
   * the sediment the turbines stir (the reference photographs
   * reservoir-dam, aerial-dam, river-below). Linear. */
  const colour = { reservoir: [0.02, 0.075, 0.085], river: [0.035, 0.07, 0.062] };
  const materials = {};
  const materialFor = (name) => {
    if (!materials[name]) {
      const [r, g, b] = colour[name] || colour.reservoir;
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace),
        roughness: name === 'river' ? 0.1 : 0.06,
        metalness: 0,
        envMapIntensity: 1,
      });
      m.name = `itaipu-water-${name}`;
      materials[name] = m;
    }
    return materials[name];
  };
  const bodies = ctx.data['water.json'];
  for (const body of bodies) {
    for (const geo of [surface(THREE, body), ...strips(THREE, body, half)]) {
      const mesh = new THREE.Mesh(geo, materialFor(body.name));
      mesh.name = `itaipu-water-${body.name}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  ctx.progress(1);
  return {
    group,
    update() {},
    dispose() {},
    stats: () => ({ bodies: bodies.map((b) => ({ name: b.name, y: b.y, vertices: b.outline.length })) }),
  };
}
