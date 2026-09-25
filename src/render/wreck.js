/*
 * wreck.js: the parts of an aircraft that have broken off, drawn where the
 * plant says they are.
 *
 * The crash physics (docs/CRASH-STAGE1.md) makes every airframe a table of
 * rigid parts, each with a hull box in the body frame, and reports every
 * part's pose each step: attached, flying free, at rest. The drawn models
 * (src/render/*craft.js) were never built as those parts. Most are merged
 * by MATERIAL for draw calls, so a Cub's wings, fuselage and tail can be one
 * mesh, and only a few pieces carry names. So the model is cut up by the
 * part table itself: every triangle of every mesh under the craft goes to
 * the part whose hull box it lies in (the smallest box that holds it, since
 * a motor sits inside its arm's box), and to the root when it lies in none.
 * That works for every airframe without a list per model, and it follows a
 * part table the crash core retunes without anything here changing.
 *
 * When a part leaves (or bends, or is knocked askew), its triangles are cut
 * out of the craft's meshes and drawn as a piece of their own at the part's
 * pose. The craft's meshes keep their materials; a piece shares them, so a
 * wing that breaks off is the same paint as the wing that was on. Nothing
 * here reaches the plant: poses are read, never written.
 *
 * Cut once per crash, lazily, when the first part is due: a few thousand
 * triangles against at most 24 boxes, a few milliseconds on the frame the
 * crash happens, and nothing at all for a flight that never breaks.
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

import * as THREE from 'three';
import { simQuatToThree } from './frame.js';
import { PART_STATE_DOUBLES, STATE } from '../game/damage.js';

/* Kinds whose deformation is a rotation (a bend or a knock), which the
 * piece shows by turning; the others' deformation is a crush dent. By
 * configs/parts.js PART_KINDS: arm, camera, antenna, gear, boom. */
const ROTATION_KINDS = new Set([1, 5, 6, 16, 18]);

/* A bend or a knock smaller than this is not worth cutting the model for:
 * about two degrees, under what the eye reads on a part this small. */
const BEND_SHOWN = 0.035;

/* Subtrees that are not the aircraft: the Bramor's catapult and its
 * parachute, which the shell poses on its own. */
const NOT_THE_AIRFRAME = new Set(['launcher', 'chute']);

/* A box grows by this much before a triangle is tested against it: the
 * hulls are contact samplers, drawn a little inside the skin. Metres, plus
 * a share of the box's own size so a wing's box takes its rounded edge. */
const BOX_SLACK = 0.008;
const BOX_SLACK_SHARE = 0.04;

const ATTR_GET = ['getX', 'getY', 'getZ', 'getW'];

/* Body frame (plant, z up) to the craft's local Three.js frame, the one
 * conversion src/render/frame.js does for positions, applied to a body
 * vector: x forward is -z, y left is -x, z up is y. */
function bodyToLocal(v, out) {
  out.set(-v[1], v[2], -v[0]);
  return out;
}

export function createWreck() {
  const group = new THREE.Group();
  group.name = 'wreck';

  let craft = null;
  let table = [];
  /* Per part, its hull box in the craft's local frame, grown by the slack. */
  let boxes = [];
  /* The cut: per mesh, { mesh, owner, tri (Uint8Array part per triangle, or
   * null when one part owns it all), original geometry, hidden }. */
  let cut = null;
  /* The parts drawn as pieces now, and each piece's group. */
  const pieces = new Map();
  const split = new Uint8Array(32);
  const free = new Uint8Array(32);
  let skip = new Set();

  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const qi = new THREE.Quaternion();
  const rel = new THREE.Vector3();

  function reset() {
    for (const piece of pieces.values()) {
      piece.removeFromParent();
      piece.traverse((o) => {
        if (o.geometry) {
          o.geometry.dispose();
        }
      });
    }
    pieces.clear();
    split.fill(0);
    free.fill(0);
    if (cut) {
      for (const c of cut) {
        if (c.hidden) {
          c.mesh.geometry.dispose();
          c.mesh.geometry = c.geometry;
          c.hidden = null;
        }
      }
    }
    cut = null;
  }

  /*
   * The aircraft to cut and its part table. Called when the airframe
   * changes and at every reset; `discs` are the spinning blur discs, which
   * belong to a turning prop and are hidden with it but never drawn on a
   * piece, since a prop lying in the grass is not spinning.
   */
  function attach(craftGroup, partTable, discs) {
    reset();
    craft = craftGroup;
    table = partTable || [];
    skip = new Set(discs || []);
    boxes = table.map((p) => {
      const lo = [p.boxMin[0], p.boxMin[1], p.boxMin[2]];
      const hi = [p.boxMax[0], p.boxMax[1], p.boxMax[2]];
      const dx = hi[0] - lo[0];
      const dy = hi[1] - lo[1];
      const dz = hi[2] - lo[2];
      const s = BOX_SLACK + BOX_SLACK_SHARE * Math.sqrt(dx * dx + dy * dy + dz * dz);
      /* Local: x = -body y, y = body z, z = -body x. */
      const box = new THREE.Box3(
        new THREE.Vector3(-hi[1] - s, lo[2] - s, -hi[0] - s),
        new THREE.Vector3(-lo[1] + s, hi[2] + s, -lo[0] + s),
      );
      const size = box.getSize(new THREE.Vector3());
      return {
        box,
        /* A flat box (a prop disc, an antenna whip) still has a volume to
         * rank by. */
        volume: Math.max(size.x, 1e-3) * Math.max(size.y, 1e-3) * Math.max(size.z, 1e-3),
      };
    });
  }

  /* Which part a point in the craft's local frame belongs to. */
  function ownerOf(x, y, z) {
    let best = 0;
    let bestVol = Infinity;
    for (let p = 1; p < boxes.length; p += 1) {
      const b = boxes[p].box;
      if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y || z < b.min.z || z > b.max.z) {
        continue;
      }
      if (boxes[p].volume < bestVol) {
        bestVol = boxes[p].volume;
        best = p;
      }
    }
    return best;
  }

  function isAirframe(o) {
    for (let p = o; p && p !== craft; p = p.parent) {
      if (NOT_THE_AIRFRAME.has(p.name)) {
        return false;
      }
    }
    return true;
  }

  /* The craft's local frame is its pose without its scale: the plant's
   * metres, whatever the model was drawn at. */
  function localMatrix(mesh, out) {
    body.compose(craft.position, craft.quaternion, one);
    inv.copy(body).invert();
    return out.multiplyMatrices(inv, mesh.matrixWorld);
  }

  function triCount(geo) {
    return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  function vertexOf(geo, t, k) {
    return geo.index ? geo.index.getX(t * 3 + k) : t * 3 + k;
  }

  /* Cut every mesh under the craft by the part table, once. */
  function buildCut() {
    craft.updateMatrixWorld(true);
    cut = [];
    const byGeometry = new Map();
    craft.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.geometry || !mesh.geometry.attributes.position) {
        return;
      }
      if (!isAirframe(mesh)) {
        return;
      }
      const geo = mesh.geometry;
      /* An outline hull is a scaled copy of its parent on the parent's own
       * geometry (src/render/celmat.js outlineHull), so it takes its
       * parent's cut: cut on its own, the scale would move a triangle near a
       * seam into the next part and leave its outline behind. */
      const inherited = mesh.parent && mesh.parent.isMesh && mesh.parent.geometry === geo
        ? byGeometry.get(geo)
        : null;
      let tri = null;
      let owner = -1;
      if (inherited) {
        ({ tri, owner } = inherited);
      } else {
        localMatrix(mesh, m);
        const pa = geo.attributes.position;
        const n = triCount(geo);
        tri = new Uint8Array(n);
        let first = -1;
        let uniform = true;
        for (let t = 0; t < n; t += 1) {
          va.fromBufferAttribute(pa, vertexOf(geo, t, 0));
          vb.fromBufferAttribute(pa, vertexOf(geo, t, 1));
          vc.fromBufferAttribute(pa, vertexOf(geo, t, 2));
          va.add(vb).add(vc).multiplyScalar(1 / 3).applyMatrix4(m);
          const p = ownerOf(va.x, va.y, va.z);
          tri[t] = p;
          if (first < 0) {
            first = p;
          } else if (p !== first) {
            uniform = false;
          }
        }
        if (uniform) {
          owner = first < 0 ? 0 : first;
          tri = null;
        }
        byGeometry.set(geo, { tri, owner });
      }
      cut.push({ mesh, owner, tri, geometry: geo, hidden: null });
    });
  }

  /* A geometry holding only the triangles of `mesh` owned by parts in
   * `want` (a predicate on the part), baked into the piece's own frame:
   * the craft's local frame, moved so the part's centre is the origin.
   * Every attribute is carried, non indexed, so the material sees what it
   * saw on the craft. Returns null when there is nothing to draw. */
  function extract(c, part, origin) {
    const geo = c.geometry;
    const n = triCount(geo);
    let count = 0;
    for (let t = 0; t < n; t += 1) {
      if ((c.tri ? c.tri[t] : c.owner) === part) {
        count += 1;
      }
    }
    if (count === 0) {
      return null;
    }
    localMatrix(c.mesh, m);
    const normalM = new THREE.Matrix3().getNormalMatrix(m);
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const src = geo.attributes[name];
      const size = src.itemSize;
      const arr = new Float32Array(count * 3 * size);
      let w = 0;
      for (let t = 0; t < n; t += 1) {
        if ((c.tri ? c.tri[t] : c.owner) !== part) {
          continue;
        }
        for (let k = 0; k < 3; k += 1) {
          const v = vertexOf(geo, t, k);
          if (name === 'position') {
            va.fromBufferAttribute(src, v).applyMatrix4(m).sub(origin);
            arr[w] = va.x;
            arr[w + 1] = va.y;
            arr[w + 2] = va.z;
          } else if (name === 'normal') {
            va.fromBufferAttribute(src, v).applyMatrix3(normalM).normalize();
            arr[w] = va.x;
            arr[w + 1] = va.y;
            arr[w + 2] = va.z;
          } else {
            for (let j = 0; j < size; j += 1) {
              arr[w + j] = src[ATTR_GET[j]](v);
            }
          }
          w += size;
        }
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    /* A mesh with material groups keeps them: a triangle's group is found
     * from where it sat in the original draw order. */
    if (Array.isArray(c.mesh.material) && geo.groups.length) {
      let at = 0;
      for (const g of geo.groups) {
        const t0 = g.start / 3;
        const t1 = Math.min(n, (g.start + g.count) / 3);
        let k = 0;
        for (let t = t0; t < t1; t += 1) {
          if ((c.tri ? c.tri[t] : c.owner) === part) {
            k += 1;
          }
        }
        if (k > 0) {
          out.addGroup(at * 3, k * 3, g.materialIndex);
          at += k;
        }
      }
    }
    out.computeBoundingSphere();
    return out;
  }

  /* The piece for one part: its triangles from every mesh, around its
   * centre of mass. */
  function buildPiece(part) {
    const piece = new THREE.Group();
    piece.name = `wreck-${table[part].kindName}-${part}`;
    const origin = bodyToLocal(table[part].cg, new THREE.Vector3());
    for (const c of cut) {
      if (skip.has(c.mesh) || isUnder(c.mesh, skip)) {
        continue;
      }
      const g = extract(c, part, origin);
      if (!g) {
        continue;
      }
      const mesh = new THREE.Mesh(g, c.mesh.material);
      mesh.castShadow = c.mesh.castShadow;
      mesh.receiveShadow = c.mesh.receiveShadow;
      mesh.renderOrder = c.mesh.renderOrder;
      piece.add(mesh);
    }
    group.add(piece);
    pieces.set(part, piece);
    return piece;
  }

  function isUnder(o, set) {
    for (let p = o.parent; p && p !== craft; p = p.parent) {
      if (set.has(p)) {
        return true;
      }
    }
    return false;
  }

  /* Cut the split parts' triangles out of the craft's own meshes: each
   * affected mesh draws a new index over its own attributes, so nothing is
   * copied but the index, and reset() puts the original back. */
  function hideSplit() {
    for (const c of cut) {
      const geo = c.geometry;
      const n = triCount(geo);
      let kept = 0;
      for (let t = 0; t < n; t += 1) {
        if (!split[c.tri ? c.tri[t] : c.owner]) {
          kept += 1;
        }
      }
      if (kept === n && !c.hidden) {
        continue;
      }
      const index = new Uint32Array(kept * 3);
      let w = 0;
      for (let t = 0; t < n; t += 1) {
        if (split[c.tri ? c.tri[t] : c.owner]) {
          continue;
        }
        index[w] = vertexOf(geo, t, 0);
        index[w + 1] = vertexOf(geo, t, 1);
        index[w + 2] = vertexOf(geo, t, 2);
        w += 3;
      }
      const shown = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) {
        shown.setAttribute(name, geo.attributes[name]);
      }
      shown.setIndex(new THREE.BufferAttribute(index, 1));
      if (Array.isArray(c.mesh.material) && geo.groups.length) {
        /* Rebuilt group by group, so each keeps its material. */
        let at = 0;
        for (const g of geo.groups) {
          const t0 = g.start / 3;
          const t1 = Math.min(n, (g.start + g.count) / 3);
          let k = 0;
          for (let t = t0; t < t1; t += 1) {
            if (!split[c.tri ? c.tri[t] : c.owner]) {
              k += 1;
            }
          }
          shown.addGroup(at * 3, k * 3, g.materialIndex);
          at += k;
        }
      }
      shown.boundingSphere = geo.boundingSphere;
      shown.boundingBox = geo.boundingBox;
      if (c.hidden) {
        c.hidden.dispose();
      }
      c.hidden = shown;
      c.mesh.geometry = shown;
    }
  }

  /*
   * Once a frame. `parts` is the damage link's state view (count parts x
   * PART_STATE_DOUBLES), `craftState` the plant's state block the craft is
   * drawn from, and `toWorld(px, py, pz, qw, qx, qy, qz, outPos, outQuat)`
   * the shell's plant to world conversion. Returns how many pieces are out.
   */
  function update(parts, count, craftState, toWorld) {
    if (!craft || !parts || count <= 1 || count > boxes.length) {
      return pieces.size;
    }
    let changed = false;
    for (let i = 1; i < count; i += 1) {
      const o = i * PART_STATE_DOUBLES;
      let want = parts[o + STATE.status] !== 0;
      if (!want && ROTATION_KINDS.has(parts[o + STATE.kind])) {
        const dx = parts[o + STATE.deform];
        const dy = parts[o + STATE.deform + 1];
        const dz = parts[o + STATE.deform + 2];
        want = dx * dx + dy * dy + dz * dz > BEND_SHOWN * BEND_SHOWN;
      }
      /* A part on a bent parent goes with it: the parent's piece has left
       * the craft's meshes, and this one would hang where the parent was. */
      const parent = parts[o + STATE.parent];
      if (!want && parent > 0 && split[parent]) {
        want = true;
      }
      if (want && !split[i]) {
        split[i] = 1;
        changed = true;
      }
    }
    if (changed) {
      if (!cut) {
        buildCut();
      }
      for (let i = 1; i < count; i += 1) {
        if (split[i] && !pieces.has(i)) {
          buildPiece(i);
        }
      }
      hideSplit();
    }
    if (pieces.size === 0) {
      return 0;
    }
    /* The craft's own plant pose, for the parts still on it: they are drawn
     * relative to the drawn craft, so they ride its interpolation. */
    qc.set(craftState[8], craftState[9], craftState[10], craftState[7]).invert();
    for (const [i, piece] of pieces) {
      const o = i * PART_STATE_DOUBLES;
      const qo = o + STATE.quat;
      if (parts[o + STATE.status] === 0) {
        rel.set(
          parts[o + STATE.pos] - craftState[1],
          parts[o + STATE.pos + 1] - craftState[2],
          parts[o + STATE.pos + 2] - craftState[3],
        ).applyQuaternion(qc);
        bodyToLocal([rel.x, rel.y, rel.z], pos);
        piece.position.copy(pos).applyQuaternion(craft.quaternion).add(craft.position);
        qi.set(parts[qo + 1], parts[qo + 2], parts[qo + 3], parts[qo]).premultiply(qc);
        simQuatToThree(qi.w, qi.x, qi.y, qi.z, quat);
        piece.quaternion.copy(craft.quaternion).multiply(quat);
      } else {
        toWorld(
          parts[o + STATE.pos], parts[o + STATE.pos + 1], parts[o + STATE.pos + 2],
          parts[qo], parts[qo + 1], parts[qo + 2], parts[qo + 3],
          piece.position, piece.quaternion,
        );
      }
      free[i] = parts[o + STATE.status] !== 0 ? 1 : 0;
    }
    return pieces.size;
  }

  /* A piece still on the craft is part of the craft, so it is hidden when
   * the craft is (the FPV view, which sits inside it). A piece that has left
   * is always drawn: it is in the pilot's picture. */
  function setCraftVisible(visible) {
    for (const [i, piece] of pieces) {
      piece.visible = visible || free[i] === 1;
    }
  }

  /* What is out, for the harness: [{ part, kind, x, y, z }], world. */
  function summary() {
    const out = [];
    for (const [i, piece] of pieces) {
      out.push({
        part: i,
        kind: table[i] ? table[i].kindName : 'part',
        x: piece.position.x,
        y: piece.position.y,
        z: piece.position.z,
        meshes: piece.children.length,
      });
    }
    return out;
  }

  return { group, attach, reset, update, setCraftVisible, summary, pieceCount: () => pieces.size };
}
