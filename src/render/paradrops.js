/*
 * paradrops.js: the Hercules' dropped loads as they fall and as they lie
 * (docs/HERCULES-CONTRACT.md). It draws; src/game/paradrop.js decides
 * where. Instanced, so a field at the cap is four draws: the boxes, the
 * open canopies, the collapsed ones and the risers.
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

import * as THREE from 'three';
import { celMaterial } from './celmat.js';
import { LOAD, pathAt } from '../game/paradrop.js';

/* The canopy hangs this far over the load on its rigging, the inflated
 * radius a flat canopy's 0.7 of its nominal one (Knacke). */
const RIG = 0.55;
const INFLATED_R = 0.7 * LOAD.canopyD / 2;
/* A collapsed canopy lies downwind of its load, laid out over 1.5 s. */
const COLLAPSE_S = 1.5;

export function createParadrops(capacity) {
  const group = new THREE.Group();
  group.name = 'paradrops';
  const boxMat = celMaterial({ color: 0x8a7a55, rim: 0.2, spec: 0.1, specWidth: 0.02 });
  const canopyMat = celMaterial({ color: 0x6b7350, rim: 0.3, spec: 0.1, specWidth: 0.02, side: THREE.DoubleSide });
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(LOAD.side, LOAD.side, LOAD.side), boxMat, capacity);
  const domeGeo = new THREE.SphereGeometry(INFLATED_R, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const domes = new THREE.InstancedMesh(domeGeo, canopyMat, capacity);
  const flatGeo = new THREE.CircleGeometry(LOAD.canopyD / 2, 14).rotateX(-Math.PI / 2);
  const flats = new THREE.InstancedMesh(flatGeo, canopyMat, capacity);
  const risers = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3)),
    new THREE.LineBasicMaterial({ color: 0x2b2b26 }),
  );
  for (const m of [boxes, domes, flats]) {
    m.count = 0;
    m.frustumCulled = false;
    group.add(m);
  }
  risers.frustumCulled = false;
  group.add(risers);

  const list = [];
  const at = [0, 0, 0, 0];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /* A drop: { id, f: paradrop.fall()'s result, startS: when it left the
   * ramp on the clock update() is given }. */
  function add(drop) {
    if (list.length >= capacity) {
      return false;
    }
    list.push(drop);
    return true;
  }
  function clear() {
    list.length = 0;
  }

  /* Drops leave the field only with their room (docs/HERCULES-CONTRACT.md). */
  function remove(keep) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (!keep(list[i])) {
        list.splice(i, 1);
      }
    }
  }
  /* nowS: the clock a solo drop's startS is on, roomS a room drop's (the
   * room's clock, null while it has not synced); only the drops on mapId
   * are drawn. */
  function update(nowS, roomS, mapId) {
    let nb = 0;
    let nd = 0;
    let nf = 0;
    let nr = 0;
    const pos = risers.geometry.attributes.position.array;
    for (const d of list) {
      const clock = d.room ? roomS : nowS;
      const tau = clock == null ? Infinity : clock - d.startS;
      if (tau < 0 || d.map !== mapId) {
        continue;
      }
      pathAt(d.f, tau, at);
      const since = tau - d.f.landS;
      p.set(at[0], at[1] + LOAD.side / 2, at[2]);
      m4.compose(p, q.identity(), s.set(1, 1, 1));
      boxes.setMatrixAt(nb, m4);
      nb += 1;
      if (since < 0 || since < COLLAPSE_S) {
        /* Open, or falling over: the dome over the load, scaled as it
         * fills, tipping downwind as it collapses. */
        const open = since < 0 ? at[3] : 1;
        const tip = since < 0 ? 0 : since / COLLAPSE_S;
        const wx = d.f.windAtRest[0];
        const wz = d.f.windAtRest[1];
        const wn = Math.hypot(wx, wz) || 1;
        const lean = tip * Math.PI / 2;
        q.setFromAxisAngle(p.set(wz / wn, 0, -wx / wn), lean);
        const r = 0.15 + 0.85 * open;
        const cx = at[0] + (wx / wn) * RIG * Math.sin(lean);
        const cz = at[2] + (wz / wn) * RIG * Math.sin(lean);
        const cy = at[1] + LOAD.side + RIG * Math.cos(lean);
        m4.compose(p.set(cx, cy, cz), q, s.set(r, r * (1 - 0.6 * tip), r));
        domes.setMatrixAt(nd, m4);
        nd += 1;
        pos[nr * 6] = at[0];
        pos[nr * 6 + 1] = at[1] + LOAD.side;
        pos[nr * 6 + 2] = at[2];
        pos[nr * 6 + 3] = cx;
        pos[nr * 6 + 4] = cy;
        pos[nr * 6 + 5] = cz;
        nr += 1;
      } else {
        const wx = d.f.windAtRest[0];
        const wz = d.f.windAtRest[1];
        const wn = Math.hypot(wx, wz) || 1;
        q.setFromUnitVectors(up, up);
        m4.compose(p.set(at[0] + (wx / wn) * RIG, at[1] + 0.01, at[2] + (wz / wn) * RIG), q, s.set(1, 1, 0.55));
        flats.setMatrixAt(nf, m4);
        nf += 1;
      }
    }
    boxes.count = nb;
    domes.count = nd;
    flats.count = nf;
    for (const m of [boxes, domes, flats]) {
      m.instanceMatrix.needsUpdate = true;
    }
    risers.geometry.setDrawRange(0, nr * 2);
    risers.geometry.attributes.position.needsUpdate = true;
  }

  return { group, add, clear, remove, update, count: () => list.length, list };
}
