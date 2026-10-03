/*
 * breakage.js: the war's damage drawn (src/share/war/damage.js, decided
 * by the room, edge/rooms/war.js strike). For each damage event the
 * shell hears (src/share/roomwar.js), on a map that has structures
 * (map.structures, map.setChunkGone: the Itaipu dam's):
 *
 *   the chunks   taken out of the drawn structure and its colliders
 *                (map.setChunkGone), so what broke is a hole and a craft
 *                flies through it
 *   the pieces   each removed chunk thrown as a piece of its own size,
 *                flown by src/share/war/debris.js on the room clock, so
 *                every screen has the same rubble; at most PIECES drawn,
 *                the oldest given up first when more come
 *   the edges    where a removed chunk met one still standing, the torn
 *                ends left in the hole: rebar out of a concrete chunk's
 *                face, a steel one's torn plate, EDGES at most
 *   the dust     concrete dust and steel's sparks thrown at each break
 *                and fall, through the shell's own debris (debris.emit),
 *                and the target on fire (onBurn)
 *   the sound    onSound(breach, now) once an event: debris.js breachOf's
 *                { at, position, material, mass }, for the world's sound
 *   the water    each opening (the dam break contract's) to onOpening
 *
 * Three draws however much breaks: the pieces, the edges, and the
 * shell's debris, which is already drawn.
 *
 * A reload or a late joiner hears the match's whole list (war.js join),
 * in order, and applies it the same way, so the holes are the same; the
 * pieces of an event long past are stepped up to now at once.
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
import { SURFACE } from '../../configs/parts.js';
import { advance, breachOf, piecesOf } from '../share/war/debris.js';

export const PIECES = 192;
export const EDGES = 512;
/* Rods an edge of concrete leaves, and their length, metres. */
const REBAR = 5;
const REBAR_M = 1.6;

/* A chunk kind's look: steel or concrete, its linear colour. */
const STEEL = new Set(['skin', 'girder', 'arm', 'brace', 'trunnion', 'hoist', 'leaf', 'shell', 'tank', 'bushing', 'post', 'beam']);
const LOOK = {
  skin: [0.13, 0.042, 0.03],
  leaf: [0.2, 0.2, 0.2],
  shell: [0.28, 0.28, 0.275],
  /* The yard's, as its pieces are drawn standing (town/mesh.js
   * makeBreakable's albedo on war/index.js's tints). */
  bushing: [0.1, 0.045, 0.023],
  tank: [0.135, 0.15, 0.145],
  post: [0.21, 0.21, 0.22],
  beam: [0.21, 0.21, 0.22],
};
const STEEL_COL = [0.4, 0.13, 0.05];
const CONCRETE_COL = [0.42, 0.41, 0.38];
const SCORCH = 0.7;

function hash(a, b) {
  let h = Math.imul(a + 3, 0x9e3779b1) ^ Math.imul(b + 5, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/*
 * opts: debris (the shell's, for dust and sparks), floorAt(x, z, y) the
 * map's floor for the pieces, and the hooks onOpening(opening, event),
 * onSound(breach, now), onBurn(target).
 */
export function createBreakage(opts = {}) {
  const group = new THREE.Group();
  group.name = 'war-breakage';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1 });
  const pieceMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), mat, PIECES);
  pieceMesh.name = 'war-breakage-pieces';
  pieceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pieceMesh.frustumCulled = false;
  pieceMesh.castShadow = true;
  pieceMesh.receiveShadow = true;
  pieceMesh.count = 0;
  const edgeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1).translate(0, 0.5, 0), mat, EDGES);
  edgeMesh.name = 'war-breakage-edges';
  edgeMesh.frustumCulled = false;
  edgeMesh.castShadow = false;
  edgeMesh.count = 0;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < PIECES; i += 1) {
    pieceMesh.setColorAt(i, white);
  }
  for (let i = 0; i < EDGES; i += 1) {
    edgeMesh.setColorAt(i, white);
  }
  group.add(pieceMesh, edgeMesh);

  let map = null;
  /* Every event applied this match, in order: what a new map (a rebuild
   * of the same one) has applied to it again. */
  let applied = [];
  let pieces = [];
  let edges = 0;
  /* target -> Set of chunk indices taken out, to put back. */
  let gone = new Map();
  let openings = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const floorAt = opts.floorAt ?? (() => -Infinity);

  function colourOf(kind, scorch = 1) {
    const c = LOOK[kind] ?? (STEEL.has(kind) ? STEEL_COL : CONCRETE_COL);
    return col.setRGB(c[0] * scorch, c[1] * scorch, c[2] * scorch, THREE.LinearSRGBColorSpace);
  }

  /* The torn ends where chunk i (gone) met chunk j (standing), on j's
   * side of the face between them. */
  function edgeAt(st, i, j, seq) {
    const a = st.chunks[i];
    const b = st.chunks[j];
    const mid = [(a.c[0] + b.c[0]) / 2, (a.c[1] + b.c[1]) / 2, (a.c[2] + b.c[2]) / 2];
    const dir = new THREE.Vector3(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]).normalize();
    const e0 = new THREE.Vector3(a.e[0], a.e[1], a.e[2]);
    const e1 = new THREE.Vector3(a.e[3], a.e[4], a.e[5]);
    const steel = STEEL.has(b.k);
    const n = steel ? 2 : REBAR;
    for (let k = 0; k < n && edges < EDGES; k += 1) {
      const r0 = hash(seq * 131 + i, j * 7 + k) - 0.5;
      const r1 = hash(seq * 17 + j, i * 3 + k) - 0.5;
      const at = new THREE.Vector3(...mid)
        .addScaledVector(e0, r0 * 2 * Math.min(a.h[0], b.h[0]))
        .addScaledVector(e1, r1 * 2 * Math.min(a.h[1], b.h[1]));
      const len = (steel ? 0.6 : REBAR_M) * (0.5 + hash(k, seq + i + j));
      const bend = new THREE.Vector3(r1, -Math.abs(r0), r0).multiplyScalar(0.8);
      const d = dir.clone().add(bend).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      s.set(steel ? 0.5 : 0.032, len, steel ? 0.06 : 0.032);
      m4.compose(at, q, s);
      edgeMesh.setMatrixAt(edges, m4);
      edgeMesh.setColorAt(edges, steel ? colourOf(b.k, SCORCH) : col.setRGB(0.16, 0.09, 0.06, THREE.LinearSRGBColorSpace));
      edges += 1;
    }
    edgeMesh.count = edges;
    edgeMesh.instanceMatrix.needsUpdate = true;
    edgeMesh.instanceColor.needsUpdate = true;
  }

  function drawPiece(k, pc) {
    q.set(pc.q[0], pc.q[1], pc.q[2], pc.q[3]);
    v.set(pc.p[0], pc.p[1], pc.p[2]);
    s.set(pc.h[0] * 0.92, pc.h[1] * 0.92, pc.h[2] * 0.92);
    m4.compose(v, q, s);
    pieceMesh.setMatrixAt(k, m4);
  }

  function redrawColours() {
    pieces.forEach((pc, k) => pieceMesh.setColorAt(k, colourOf(pc.kind, SCORCH)));
    pieceMesh.instanceColor.needsUpdate = true;
  }

  const api = {
    group,
    /* The map now drawn, or null. A new one (the same map built again)
     * has this match's events applied to it, in order, the pieces where
     * they are and every opening handed to its water, as a pilot who
     * joins late has them. */
    setMap(next, now) {
      if (next === map) {
        return;
      }
      const again = applied;
      api.reset();
      map = next && next.structures && typeof next.setChunkGone === 'function' ? next : null;
      for (const e of again) {
        api.apply(e, now, true);
      }
    },
    /* Everything put back: the next match. */
    reset() {
      if (map) {
        for (const [target, set] of gone) {
          for (const i of set) {
            map.setChunkGone(target, i, false);
          }
        }
      }
      gone = new Map();
      openings = new Map();
      applied = [];
      pieces = [];
      edges = 0;
      pieceMesh.count = 0;
      edgeMesh.count = 0;
    },
    /* One roomwar 'damage' event, at room ms now; `quiet` for one
     * applied again to a rebuilt map, which throws no dust and makes no
     * sound. Its openings go to onOpening either way: a rebuilt map's
     * water starts from nothing and needs every one of them again. */
    apply(e, now, quiet = false) {
      applied.push(e);
      const st = map && map.structures[e.target];
      if (!st) {
        return false;
      }
      let set = gone.get(e.target);
      if (!set) {
        set = new Set();
        gone.set(e.target, set);
      }
      for (const i of e.chunks) {
        set.add(i);
        map.setChunkGone(e.target, i, true);
      }
      for (const i of e.chunks) {
        for (const j of st.chunks[i].l) {
          if (!set.has(j)) {
            edgeAt(st, i, j, e.seq);
          }
        }
      }
      const fresh = piecesOf(e, st);
      for (const pc of fresh) {
        advance(pc, now, floorAt);
      }
      pieces.push(...fresh);
      if (pieces.length > PIECES) {
        pieces.splice(0, pieces.length - PIECES);
      }
      pieceMesh.count = pieces.length;
      redrawColours();
      pieces.forEach((pc, k) => drawPiece(k, pc));
      pieceMesh.instanceMatrix.needsUpdate = true;
      /* Dust and sparks where each broke, only for what is happening now. */
      const recent = !quiet && now - e.at < 3000;
      if (recent && opts.debris) {
        for (const i of e.chunks) {
          const ch = st.chunks[i];
          const steel = STEEL.has(ch.k);
          const at = new THREE.Vector3(...ch.c);
          opts.debris.emit(at, new THREE.Vector3(0, 1, 0), steel ? 25 : 30, steel ? SURFACE.metal : SURFACE.concrete, null, floorAt(ch.c[0], ch.c[2], ch.c[1]), 'hit');
        }
      }
      if (recent && opts.onSound) {
        const b = breachOf(e, st);
        if (b) {
          opts.onSound(b, now);
        }
      }
      if (opts.onBurn) {
        opts.onBurn(e.target, e);
      }
      for (const o of e.openings) {
        openings.set(o.id, o);
        if (opts.onOpening) {
          opts.onOpening(o, e);
        }
      }
      return true;
    },
    /* Once a frame: the pieces on to room ms now. */
    update(now) {
      if (now == null) {
        return;
      }
      let moved = false;
      pieces.forEach((pc, k) => {
        if (pc.asleep || pc.t + 1 > now) {
          return;
        }
        advance(pc, now, floorAt);
        drawPiece(k, pc);
        moved = true;
      });
      if (moved) {
        pieceMesh.instanceMatrix.needsUpdate = true;
      }
    },
    /* For the checks: what is drawn now. */
    stats() {
      return {
        pieces: pieces.length,
        moving: pieces.filter((pc) => !pc.asleep).length,
        edges,
        gone: [...gone.values()].reduce((n, set) => n + set.size, 0),
        openings: [...openings.values()],
        poses: pieces.map((pc) => ({ target: pc.target, chunk: pc.chunk, t: pc.t, p: pc.p.slice(), asleep: pc.asleep })),
      };
    },
  };
  return api;
}
