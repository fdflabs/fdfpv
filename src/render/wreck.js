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
 * A triangle that reaches from one part's box into another's is halved
 * first, so a long face breaks where the parts do.
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

/* A triangle reaching from one part into another is halved until its
 * edges are this short, metres, or this many times. At 3 cm a piece's
 * farthest vertex stands a few centimetres past its part and the Slow
 * Stick's 6588 triangles become 9889; at 5 mm they became 24611, on the
 * one frame the cut runs. */
const SPLIT_EDGE = 0.03;
const SPLIT_DEPTH = 14;

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
  const meshBox = new THREE.Box3();

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
          c.hidden.dispose();
          c.hidden = null;
        }
        if (c.geometry !== c.original && !c.inherited) {
          c.geometry.dispose();
        }
        c.mesh.geometry = c.original;
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

  /* Only what is drawn is cut. Every model carries a hidden measurement box
   * as wide as its span and as long as its fuselage (check 15's contract,
   * herocraft.js), and a piece is always drawn: cut with the rest, that box's
   * faces landed on whichever part held their centres and were drawn as
   * slabs across the whole aircraft. The blur discs are hidden and shown by
   * the prop's speed, so they are cut whatever they are now, to leave with
   * their prop. The craft's own visibility is the FPV view, not the model. */
  function isAirframe(o) {
    for (let p = o; p && p !== craft; p = p.parent) {
      if (NOT_THE_AIRFRAME.has(p.name)) {
        return false;
      }
      if (!p.visible && !skip.has(p)) {
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

  /* Which part's box holds a point, the root's own box counted, or -1 for
   * none: the test for a triangle that reaches from one part into another. */
  function holderOf(v) {
    let best = -1;
    let bestVol = Infinity;
    for (let p = 0; p < boxes.length; p += 1) {
      if (boxes[p].box.containsPoint(v) && boxes[p].volume < bestVol) {
        bestVol = boxes[p].volume;
        best = p;
      }
    }
    return best;
  }

  function crosses(a, b, c) {
    const ha = holderOf(a);
    const hb = holderOf(b);
    const hc = holderOf(c);
    const first = ha >= 0 ? ha : hb >= 0 ? hb : hc;
    return (ha >= 0 && ha !== first) || (hb >= 0 && hb !== first) || (hc >= 0 && hc !== first);
  }

  /*
   * The mesh's geometry with every triangle that reaches from one part's
   * box into another's cut in two along its longest edge, again and again,
   * until each half lies in one part or is too small to matter; null when no
   * triangle crosses. Models are built from long primitives: the Slow
   * Stick's fuselage is one box from the gearbox to the tail, whose side
   * faces are two triangles each, and whichever part held a face's centre
   * took the whole stick with it. A vertex in no box is not a vote, so a
   * wing's rounded tip past its hull box stays whole with the wing.
   * Non indexed, every attribute interpolated, the normals renormalised, and
   * the material groups kept, so the craft draws the same until it breaks.
   */
  function bisected(geo, mat4, multi) {
    const pa = geo.attributes.position;
    const n = triCount(geo);
    /* Most meshes (a motor, a wheel, a servo) lie in one box with none
     * smaller reaching into them, and nothing in them can cross. */
    if (!geo.boundingBox) {
      geo.computeBoundingBox();
    }
    meshBox.copy(geo.boundingBox).applyMatrix4(mat4);
    let inside = -1;
    for (let p = 0; p < boxes.length; p += 1) {
      if (boxes[p].box.containsBox(meshBox) && (inside < 0 || boxes[p].volume < boxes[inside].volume)) {
        inside = p;
      }
    }
    if (inside >= 0 && !boxes.some((b) => b.volume < boxes[inside].volume && b.box.intersectsBox(meshBox))) {
      return null;
    }
    /* The part holding each vertex, once per vertex: a mesh of thousands of
     * triangles is cut on the frame of the crash. */
    const held = new Int8Array(pa.count);
    for (let v = 0; v < pa.count; v += 1) {
      held[v] = holderOf(va.fromBufferAttribute(pa, v).applyMatrix4(mat4));
    }
    const crossing = [];
    for (let t = 0; t < n; t += 1) {
      const ha = held[vertexOf(geo, t, 0)];
      const hb = held[vertexOf(geo, t, 1)];
      const hc = held[vertexOf(geo, t, 2)];
      const first = ha >= 0 ? ha : hb >= 0 ? hb : hc;
      if ((ha >= 0 && ha !== first) || (hb >= 0 && hb !== first) || (hc >= 0 && hc !== first)) {
        crossing.push(t);
      }
    }
    if (crossing.length === 0) {
      return null;
    }
    const names = Object.keys(geo.attributes);
    const src = names.map((name) => geo.attributes[name]);
    const stride = src.reduce((s, a) => s + a.itemSize, 0);
    let posAt = 0;
    let normalAt = -1;
    for (let j = 0, o = 0; j < names.length; o += src[j].itemSize, j += 1) {
      if (names[j] === 'position') {
        posAt = o;
      } else if (names[j] === 'normal') {
        normalAt = o;
      }
    }
    const read = (v) => {
      const r = new Float64Array(stride);
      let o = 0;
      for (const a of src) {
        for (let k = 0; k < a.itemSize; k += 1) {
          r[o] = a[ATTR_GET[k]](v);
          o += 1;
        }
      }
      return r;
    };
    const mid = (a, b) => {
      const r = new Float64Array(stride);
      for (let i = 0; i < stride; i += 1) {
        r[i] = (a[i] + b[i]) / 2;
      }
      if (normalAt >= 0) {
        const l = Math.hypot(r[normalAt], r[normalAt + 1], r[normalAt + 2]) || 1;
        r[normalAt] /= l;
        r[normalAt + 1] /= l;
        r[normalAt + 2] /= l;
      }
      return r;
    };
    const pt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const edge2 = (a, b) => a.distanceToSquared(b);
    /* The halves of one crossing triangle, in order, as vertex records. */
    const split = (v, depth, into) => {
      for (let k = 0; k < 3; k += 1) {
        pt[k].set(v[k][posAt], v[k][posAt + 1], v[k][posAt + 2]).applyMatrix4(mat4);
      }
      const e = [edge2(pt[0], pt[1]), edge2(pt[1], pt[2]), edge2(pt[2], pt[0])];
      const longest = e.indexOf(Math.max(e[0], e[1], e[2]));
      if (depth >= SPLIT_DEPTH || e[longest] < SPLIT_EDGE * SPLIT_EDGE || !crosses(pt[0], pt[1], pt[2])) {
        into.push(v[0], v[1], v[2]);
        return;
      }
      /* Turned so the longest edge is the first, which keeps the winding. */
      const x = v[longest];
      const y = v[(longest + 1) % 3];
      const z = v[(longest + 2) % 3];
      const mxy = mid(x, y);
      split([x, mxy, z], depth + 1, into);
      split([mxy, y, z], depth + 1, into);
    };
    const halves = new Map();
    let total = n - crossing.length;
    for (const t of crossing) {
      const into = [];
      split([read(vertexOf(geo, t, 0)), read(vertexOf(geo, t, 1)), read(vertexOf(geo, t, 2))], 0, into);
      halves.set(t, into);
      total += into.length / 3;
    }
    const groupOf = new Int16Array(n).fill(-1);
    if (multi) {
      for (const g of geo.groups) {
        for (let t = g.start / 3; t < Math.min(n, (g.start + g.count) / 3); t += 1) {
          groupOf[t] = g.materialIndex;
        }
      }
    }
    const arrs = src.map((a) => new Float32Array(total * 3 * a.itemSize));
    /* The plain arrays, read directly: a crash frame copies every vertex. */
    const raw = src.map((a) => (a.isInterleavedBufferAttribute || a.normalized ? null : a.array));
    const mats = new Int16Array(total);
    let w = 0;
    for (let t = 0; t < n; t += 1) {
      const part = halves.get(t);
      const count = part ? part.length / 3 : 1;
      for (let k = 0; k < count * 3; k += 1) {
        const at = w * 3 + k;
        if (part) {
          for (let j = 0, o = 0; j < src.length; o += src[j].itemSize, j += 1) {
            for (let q = 0; q < src[j].itemSize; q += 1) {
              arrs[j][at * src[j].itemSize + q] = part[k][o + q];
            }
          }
        } else {
          const v = vertexOf(geo, t, k);
          for (let j = 0; j < src.length; j += 1) {
            for (let q = 0; q < src[j].itemSize; q += 1) {
              const size = src[j].itemSize;
              arrs[j][at * size + q] = raw[j] ? raw[j][v * size + q] : src[j][ATTR_GET[q]](v);
            }
          }
        }
      }
      mats.fill(groupOf[t], w, w + count);
      w += count;
    }
    const out = new THREE.BufferGeometry();
    names.forEach((name, j) => out.setAttribute(name, new THREE.BufferAttribute(arrs[j], src[j].itemSize)));
    if (multi) {
      let start = 0;
      for (let t = 1; t <= total; t += 1) {
        if (t === total || mats[t] !== mats[start]) {
          if (mats[start] >= 0) {
            out.addGroup(start * 3, (t - start) * 3, mats[start]);
          }
          start = t;
        }
      }
    }
    out.boundingSphere = geo.boundingSphere;
    out.boundingBox = geo.boundingBox;
    return out;
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
      const original = mesh.geometry;
      /* An outline hull is a scaled copy of its parent on the parent's own
       * geometry (src/render/celmat.js outlineHull), so it takes its
       * parent's cut: cut on its own, the scale would move a triangle near a
       * seam into the next part and leave its outline behind. */
      const inherited = mesh.parent && mesh.parent.isMesh && byGeometry.has(original)
        && byGeometry.get(original).mesh === mesh.parent
        ? byGeometry.get(original)
        : null;
      let tri = null;
      let owner = -1;
      let geo = original;
      if (inherited) {
        ({ tri, owner, geo } = inherited);
        mesh.geometry = geo;
      } else {
        localMatrix(mesh, m);
        geo = bisected(original, m, Array.isArray(mesh.material) && original.groups.length > 0) || original;
        mesh.geometry = geo;
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
        byGeometry.set(original, { tri, owner, geo, mesh });
      }
      cut.push({ mesh, owner, tri, geometry: geo, original, inherited: Boolean(inherited), hidden: null });
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
      mesh.name = c.mesh.name || (c.mesh.parent && c.mesh.parent.name) || '';
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
      /* The craft was posed this frame and not yet drawn, so its meshes'
       * world matrices are last frame's: a piece baked from them on a later
       * break than the first sat a frame's travel off its part, 14 cm on a
       * tumbling Skyhunter's aileron, standing in the grass. */
      craft.updateMatrixWorld(true);
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

  /* For the harness: per piece, how far its farthest vertex stands outside
   * its part's grown hull box, metres, and from which mesh. A triangle
   * goes to the part holding its centre, so a vertex may reach past the box
   * by up to about a triangle's own size at a seam; a triangle that belongs
   * to no part, stretched across the aircraft, reads as metres. */
  function audit() {
    const out = [];
    for (const [i, piece] of pieces) {
      const b = boxes[i].box;
      const origin = bodyToLocal(table[i].cg, new THREE.Vector3());
      let worst = 0;
      let where = '';
      let tris = 0;
      for (const mesh of piece.children) {
        const p = mesh.geometry.attributes.position;
        tris += p.count / 3;
        for (let v = 0; v < p.count; v += 1) {
          va.fromBufferAttribute(p, v).add(origin);
          const d = b.distanceToPoint(va);
          if (d > worst) {
            worst = d;
            where = mesh.name || mesh.material.type;
          }
        }
      }
      /* The lowest corner of the part's own hull box where the piece is
       * drawn, world: what the plant rests on, for a check that a piece
       * drawn in the ground is the plant's pose and not the drawing's. */
      piece.updateMatrixWorld(true);
      let low = null;
      const lo = table[i].boxMin;
      const hi = table[i].boxMax;
      for (let k = 0; k < 8; k += 1) {
        bodyToLocal([k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]], vb)
          .sub(origin).applyMatrix4(piece.matrixWorld);
        if (!low || vb.y < low[1]) {
          low = [vb.x, vb.y, vb.z];
        }
      }
      out.push({ part: i, kind: table[i].kindName, tris, overhang: worst, mesh: where, hullLow: low });
    }
    return out;
  }

  return { group, attach, reset, update, setCraftVisible, summary, audit, pieceCount: () => pieces.size };
}
