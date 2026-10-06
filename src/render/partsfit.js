/*
 * partsfit.js: the hangar's parts on a built plane (configs/hangar-parts.js).
 *
 * dressParts(craft, id, fit) puts on a model what the plane flies with:
 * its prop as the chosen one (blade count, diameter and pitch), the
 * tundra tyres, the camera pod, the light strips and the smoke nozzle, a
 * tape stripe round every taped part and, in the hangar only, a red glow
 * over every part the last crash broke. Everything goes where
 * configs/hangar-parts.js puts its mass. It undoes what it did the last
 * time first, so the same model can be dressed again as a choice changes;
 * dressing with nothing leaves the model exactly as its builder made it.
 *
 * `fit` is { entry, option }: the plane's normalised parts entry and the
 * power option it flies (its own prop is the 'stock' one). The shell sets
 * where it comes from with setPartsSource, as src/render/livery.js does for
 * the paint; with no source a model is the kit's.
 *
 * Render only: nothing here reaches the plant.
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
import { CUB_DIMS } from './cubcraft.js';
import { POWER } from '../../configs/power.js';
import { ANCHORS, TAPE, partSubtree, propShape, tapeBand } from '../../configs/hangar-parts.js';

let source = null;

export function setPartsSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function partsFor(airframeId) {
  return source ? source(airframeId) : null;
}

/* Body frame (x forward, y left, z up) to the craft's frame (x right, y
 * up, z aft), the one every builder draws in. */
function toCraft(b, out = new THREE.Vector3()) {
  return out.set(-b[1], b[2], -b[0]);
}

/* A key for what a dressing shows, so the same fit is not redone. */
function fitKey(fit, hangar) {
  return fit ? JSON.stringify([fit.entry, fit.option && fit.option.id, hangar]) : '';
}

/*
 * Dress `craft` (a builder's return) for plane `id`. `hangar` adds what
 * only the hangar shows: the broken parts' glow. Returns the craft.
 */
export function dressParts(craft, id, fit = partsFor(id), { hangar = false } = {}) {
  if (!craft || !ANCHORS[id]) {
    return craft;
  }
  const key = fitKey(fit, hangar);
  if (craft.partsDress && craft.partsDress.key === key) {
    return craft;
  }
  undress(craft);
  if (!fit) {
    return craft;
  }
  const dress = { key, group: new THREE.Group(), undo: [], nozzle: null, glow: [], lights: [] };
  dress.group.name = 'parts';
  const kitOption = POWER[id] ? POWER[id][0] : null;
  const option = fit.option ?? kitOption;
  if (kitOption && option) {
    fitProp(craft, id, kitOption, propShape(id, option, fit.entry.prop), dress);
  }
  const a = ANCHORS[id];
  for (const add of fit.entry.addons) {
    if (add === 'tundra') {
      fitTundra(dress);
    } else if (add === 'pod') {
      fitPod(a, dress);
    } else if (add === 'lights') {
      fitLights(a, dress);
    } else if (add === 'smoke') {
      fitSmoke(a, dress);
    }
  }
  const damage = fit.entry.damage;
  if (damage) {
    const taped = damage.parts.filter((p) => p.state === 'taped');
    const broken = damage.parts.filter((p) => p.state === 'broken');
    if (taped.length || (hangar && broken.length)) {
      overlayParts(craft, damage, taped, hangar ? broken : [], dress);
    }
  }
  /* Nothing fitted adds nothing: the model stays the builder's own graph. */
  if (dress.group.children.length) {
    craft.group.add(dress.group);
  }
  craft.partsDress = dress;
  /* The shell holds the group, not the builder's return: the trail reads
   * the nozzle from here. */
  craft.group.userData.smokeNozzle = dress.nozzle;
  /* What is on it, for a check: the prop's blades and diameter as drawn,
   * the add-ons, and the taped and glowing parts. */
  craft.group.userData.partsFit = {
    blades: dress.blades ?? null,
    addons: [...fit.entry.addons],
    taped: fit.entry.damage ? fit.entry.damage.parts.filter((p) => p.state === 'taped').map((p) => p.i) : [],
    tapeTris: dress.tapeTris ?? 0,
    glowTris: dress.glowTris ?? 0,
  };
  return craft;
}

export function undress(craft) {
  const d = craft && craft.partsDress;
  if (!d) {
    return;
  }
  for (const fn of d.undo.reverse()) {
    fn();
  }
  d.group.removeFromParent();
  craft.group.userData.smokeNozzle = null;
  craft.group.userData.partsFit = null;
  d.group.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    if (o.material && o.material.dispose && !o.material.userData.shared) {
      o.material.dispose();
    }
  });
  craft.partsDress = null;
}

/* The hangar's broken parts pulse; the flown lights flicker nothing. */
export function animateParts(craft, tSeconds) {
  const d = craft && craft.partsDress;
  if (!d) {
    return;
  }
  const k = 0.5 + 0.5 * Math.sin(tSeconds * 4.2);
  for (const m of d.glow) {
    m.opacity = 0.3 + 0.4 * k;
  }
}

/* ------------------------------------------------------------------ */

/*
 * THE PROP. Every builder's rotor carries one merged mesh of N identical
 * blades (one blade and its turns about the spin axis, the rotor's y), so
 * one blade is the first Nth of it. The new prop is that blade scaled out
 * to the new diameter, turned about its own span by the difference in
 * blade angle at three quarters of the radius (atan of the pitch over the
 * circumference there), and repeated for the new count. The blur disc
 * scales with the diameter.
 */
function fitProp(craft, id, kit, want, dress) {
  const rotor = craft.blades && craft.blades[0];
  if (!rotor || (want.propIn === kit.propIn && want.pitchIn === kit.pitchIn && want.blades === kit.blades)) {
    return;
  }
  const mesh = rotor.children.find((c) => c.isMesh && c.geometry.getAttribute('position').count % kit.blades === 0
    && radialReach(c) > 0.6 * (kit.propIn * 0.0127));
  if (!mesh) {
    return;
  }
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const per = pos.count / kit.blades;
  const one = new THREE.BufferGeometry();
  one.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(pos.array.slice(0, per * 3)), 3));
  if (nrm) {
    one.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from(nrm.array.slice(0, per * 3)), 3));
  }
  /* The blade's span direction in the rotor's plane. */
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < per; i += 1) {
    c.add(v.fromBufferAttribute(one.getAttribute('position'), i));
  }
  c.multiplyScalar(1 / per);
  const span = new THREE.Vector3(c.x, 0, c.z).normalize();
  const angle = (p, d) => Math.atan(p / (Math.PI * 0.75 * d));
  const twist = angle(want.pitchIn, want.propIn) - angle(kit.pitchIn, kit.propIn);
  const k = want.propIn / kit.propIn;
  const m = new THREE.Matrix4()
    .makeScale(k, 1, k)
    .multiply(new THREE.Matrix4().makeRotationAxis(span, twist));
  one.applyMatrix4(m);
  const parts = [];
  for (let b = 0; b < want.blades; b += 1) {
    parts.push(one.clone().rotateY((b * 2 * Math.PI) / want.blades));
  }
  const merged = mergeFlat(parts);
  one.dispose();
  for (const p of parts) {
    p.dispose();
  }
  dress.blades = { count: want.blades, diameterIn: want.propIn };
  const blade = new THREE.Mesh(merged, mesh.material);
  blade.castShadow = mesh.castShadow;
  blade.name = 'parts-prop';
  blade.material.userData.shared = true;
  rotor.add(blade);
  mesh.visible = false;
  dress.undo.push(() => {
    mesh.visible = true;
    blade.removeFromParent();
    merged.dispose();
  });
  const disc = craft.discs && craft.discs[0];
  if (disc) {
    const s = disc.scale.clone();
    disc.scale.set(s.x * k, s.y, s.z * k);
    dress.undo.push(() => disc.scale.copy(s));
  }
}

function radialReach(mesh) {
  const p = mesh.geometry.getAttribute('position');
  let r = 0;
  for (let i = 0; i < p.count; i += 1) {
    r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  }
  return r;
}

/* Non-indexed geometries with the same attributes, as one. */
function mergeFlat(parts) {
  const names = Object.keys(parts[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = parts[0].getAttribute(n).itemSize;
    const arr = new Float32Array(parts.reduce((s, g) => s + g.getAttribute(n).array.length, 0));
    let at = 0;
    for (const g of parts) {
      arr.set(g.getAttribute(n).array, at);
      at += g.getAttribute(n).array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------------ */

const mats = {};
function mat(name) {
  if (!mats[name]) {
    const m = {
      tyre: () => celMaterial({ color: 0x1d1f21, rim: 0.22, spec: 0.10, specWidth: 0.012 }),
      hub: () => celMaterial({ color: 0xc9ccce, rim: 0.30, spec: 0.60, specWidth: 0.020 }),
      pod: () => celMaterial({ color: 0x2b2e31, rim: 0.30, spec: 0.40, specWidth: 0.018, specColor: 0xdfe6ee }),
      glass: () => celMaterial({ color: 0x0d1117, rim: 0.50, spec: 0.90, specWidth: 0.030, specColor: 0xffffff }),
      ring: () => celMaterial({ color: 0xb58a3a, rim: 0.30, spec: 0.70, specWidth: 0.020 }),
      brass: () => celMaterial({ color: 0xc9a24a, rim: 0.30, spec: 0.80, specWidth: 0.022 }),
      tape: () => celMaterial({ color: 0xa9adb1, rim: 0.34, spec: 0.55, specWidth: 0.026, specColor: 0xf4f6f8 }),
      strip: () => celMaterial({ color: 0x17191b, rim: 0.20, spec: 0.20 }),
    }[name]();
    m.userData.shared = true;
    mats[name] = m;
  }
  return mats[name];
}

/*
 * TUNDRA TYRES: E-flite's 108 mm foam wheels on the Cub's axles, a fat
 * rounded tyre with a row of tread blocks and a grey hub, as the Timber
 * wears them. The kit's 70 mm wheels are inside them.
 */
function fitTundra(dress) {
  const r = 0.054;
  const w = 0.038;
  for (const side of ['mainLeft', 'mainRight']) {
    const wheel = CUB_DIMS.wheels[side];
    const g = new THREE.Group();
    g.position.set(...wheel.axle);
    const tyre = new THREE.Mesh(tundraGeometry(r, w), mat('tyre'));
    tyre.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, w + 0.004, 20), mat('hub'));
    hub.rotation.z = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, w + 0.010, 12), mat('brass'));
    cap.rotation.z = Math.PI / 2;
    g.add(tyre, hub, cap);
    dress.group.add(g);
  }
}

/* A tyre about the x axis: a rounded section swept round, its tread a
 * square wave of blocks 3 mm proud. */
function tundraGeometry(r, w) {
  const around = 56;
  const across = 14;
  const rIn = 0.021;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= around; i += 1) {
    const a = (i / around) * Math.PI * 2;
    const block = Math.floor(i / 2) % 2 === 0 ? 1 : 0;
    for (let j = 0; j <= across; j += 1) {
      const u = j / across;
      /* The section: flat inner band, rounded shoulders, a crowned face. */
      const x = (u - 0.5) * w;
      const t = Math.abs(u - 0.5) * 2;
      const shoulder = Math.sqrt(Math.max(0, 1 - t ** 6));
      let rr = rIn + (r - 0.003 - rIn) * shoulder;
      if (t < 0.8) {
        rr += 0.003 * block;
      }
      pos.push(x, rr * Math.cos(a), rr * Math.sin(a));
    }
  }
  for (let i = 0; i < around; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const p = i * (across + 1) + j;
      const q = p + across + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/*
 * THE CAMERA POD: a faired capsule under the belly on a short pylon, the
 * camera's lens in its nose behind a gold ring, the O3's two whip
 * antennas out of its tail.
 */
function fitPod(a, dress) {
  const g = new THREE.Group();
  toCraft([a.belly[0], 0, a.belly[2] - 0.025], g.position);
  const len = 0.095;
  const rad = 0.020;
  const prof = [];
  for (let i = 0; i <= 16; i += 1) {
    const u = i / 16;
    /* A blunt nose and a long tail cone, a faired body's section. */
    const s = u < 0.25 ? Math.sqrt(1 - ((0.25 - u) / 0.25) ** 2) : 1 - 0.55 * ((u - 0.25) / 0.75) ** 2;
    prof.push(new THREE.Vector2(Math.max(0.0005, rad * s), -len / 2 + u * len));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mat('pod'));
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0022, 8, 20), mat('ring'));
  ring.position.z = -len / 2 + 0.010;
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('glass'));
  lens.rotation.x = -Math.PI / 2;
  lens.position.z = -len / 2 + 0.011;
  g.add(ring, lens);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.050), mat('pod'));
  pylon.position.y = 0.020;
  g.add(pylon);
  for (const s of [-1, 1]) {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.045, 6), mat('strip'));
    whip.position.set(s * 0.010, -0.004, len / 2 + 0.010);
    whip.rotation.set(Math.PI / 2 + 0.35, 0, s * 0.5);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0030, 0.0030, 0.012, 8), mat('strip'));
    tip.position.set(s * 0.021, -0.012, len / 2 + 0.030);
    tip.rotation.copy(whip.rotation);
    g.add(whip, tip);
  }
  dress.group.add(g);
}

/*
 * THE LIGHTS: a strip under each wing's leading edge, red on the left and
 * green on the right as navigation lights are, lit so they read at dusk,
 * with a soft glow round each LED and a brighter one at the tip.
 */
let glowTex = null;
function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

function fitLights(a, dress) {
  const [from, to] = a.led;
  for (const [side, colour] of [[1, 0xff2a38], [-1, 0x2aff6a]]) {
    const p0 = toCraft([from[0], side * from[1], from[2] - 0.003]);
    const p1 = toCraft([to[0], side * to[1], to[2] - 0.003]);
    const len = p0.distanceTo(p1);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0016, len), mat('strip'));
    const lit = new THREE.MeshBasicMaterial({ color: colour, toneMapped: false });
    const leds = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0022, len * 0.98), lit);
    for (const m of [base, leds]) {
      m.position.copy(mid);
      m.lookAt(p1);
    }
    dress.group.add(base, leds);
    const n = Math.max(4, Math.round(len / 0.06));
    for (let i = 0; i <= n; i += 1) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false,
      }));
      halo.position.lerpVectors(p0, p1, i / n);
      const s = i === n ? 0.09 : 0.045;
      halo.scale.set(s, s, s);
      dress.group.add(halo);
      dress.lights.push(halo);
    }
  }
}

/* THE SMOKE NOZZLE: a brass tube out of the tail, pointing aft. */
function fitSmoke(a, dress) {
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.030, 10), mat('brass'));
  tube.rotation.x = Math.PI / 2;
  toCraft(a.tail, tube.position);
  tube.position.z += 0.010;
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, 0.015, 0);
  tube.add(nozzle);
  dress.group.add(tube);
  dress.nozzle = nozzle;
}

/* ------------------------------------------------------------------ */

/*
 * TAPE AND BREAKS, drawn on the model's own surface. The models were not
 * built as the crash physics' parts, so a part is found on the drawing by
 * its hull box (as src/render/wreck.js finds it): every triangle of the
 * aircraft's meshes is clipped to the box, grown by the same slack. A
 * taped part's piece is clipped again to the band, 50 mm across the box's
 * longest axis a fifth of the way from its joint, and drawn a millimetre
 * proud in tape grey; a broken part's is drawn again in a pulsing red over
 * the paint, its prop's blades with it.
 */
function overlayParts(craft, damage, taped, broken, dress) {
  const slack = 0.008;
  const boxOf = (i) => {
    const [lo, hi] = damage.boxes[i];
    const s = slack + 0.04 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    return [0, 1, 2].map((a) => [lo[a] - s, hi[a] + s]);
  };
  const jobs = [
    ...taped.map((p) => ({ box: boxOf(p.i), band: tapeBand(p), out: [] })),
    ...broken.flatMap((p) => partSubtree(damage, p.i).map((i) => ({ box: boxOf(i), band: null, out: [] }))),
  ];
  for (const j of jobs) {
    if (j.band) {
      const w = j.band.at[j.band.axis];
      const [lo, hi] = j.box[j.band.axis];
      j.box[j.band.axis] = [Math.max(lo, w - TAPE.width / 2), Math.min(hi, w + TAPE.width / 2)];
      j.centre = toCraft(j.band.at);
    }
  }
  const skip = new Set([dress.group, ...(craft.discs || [])]);
  craft.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(craft.group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  craft.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    for (let p = o; p && p !== craft.group; p = p.parent) {
      if (skip.has(p) || !p.visible || p.name === 'launcher' || p.name === 'chute') {
        return;
      }
    }
    const pos = o.geometry.getAttribute('position');
    if (!pos) {
      return;
    }
    const index = o.geometry.index;
    const count = index ? index.count : pos.count;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        tri[k].fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(m);
      }
      for (const j of jobs) {
        const clipped = clipToBox(tri, j.box);
        if (clipped) {
          j.out.push(...clipped.map((c) => ({ t: c, centre: j.centre ?? null })));
        }
      }
    }
  });
  const tapeTris = jobs.filter((j) => j.band).flatMap((j) => j.out);
  const glowTris = jobs.filter((j) => !j.band).flatMap((j) => j.out);
  dress.tapeTris = tapeTris.length;
  dress.glowTris = glowTris.length;
  if (tapeTris.length) {
    const g = trianglesGeometry(tapeTris, 0.0012);
    const mesh = new THREE.Mesh(g, mat('tape'));
    mesh.name = 'parts-tape';
    dress.group.add(mesh);
  }
  if (glowTris.length) {
    const g = trianglesGeometry(glowTris, 0.0008);
    const red = new THREE.MeshBasicMaterial({
      color: 0xff2d20, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(g, red);
    mesh.name = 'parts-broken';
    mesh.renderOrder = 2;
    dress.group.add(mesh);
    dress.glow.push(red);
  }
}

/* A craft frame point's coordinate along body axis a: x is -craft z, y is
 * -craft x, z is craft y. */
const ALONG = [(v) => -v.z, (v) => -v.x, (v) => v.y];

/* A triangle clipped to a body frame box ([lo, hi] per axis), as
 * triangles, or null. */
function clipToBox(tri, box) {
  let poly = tri;
  for (let a = 0; a < 3; a += 1) {
    const f = ALONG[a];
    for (const [limit, keepAbove] of [[box[a][0], true], [box[a][1], false]]) {
      const next = [];
      for (let i = 0; i < poly.length; i += 1) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const dp = keepAbove ? f(p) - limit : limit - f(p);
        const dq = keepAbove ? f(q) - limit : limit - f(q);
        if (dp >= 0) {
          next.push(p.clone());
        }
        if ((dp >= 0) !== (dq >= 0)) {
          next.push(p.clone().lerp(q, dp / (dp - dq)));
        }
      }
      poly = next;
      if (poly.length < 3) {
        return null;
      }
    }
  }
  const out = [];
  for (let i = 1; i + 1 < poly.length; i += 1) {
    out.push([poly[0], poly[i], poly[i + 1]]);
  }
  return out;
}

/* Triangles as a geometry, each pushed out along its face normal, turned
 * away from `centre` where one is given (a mesh may wind either way). */
function trianglesGeometry(tris, lift) {
  const pos = new Float32Array(tris.length * 9);
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Vector3();
  tris.forEach(({ t, centre }, i) => {
    e1.subVectors(t[1], t[0]);
    e2.subVectors(t[2], t[0]);
    n.crossVectors(e1, e2).normalize();
    if (centre && n.dot(out.copy(t[0]).sub(centre)) < 0) {
      n.negate();
      [t[1], t[2]] = [t[2], t[1]];
    }
    n.multiplyScalar(lift);
    for (let k = 0; k < 3; k += 1) {
      pos[i * 9 + k * 3] = t[k].x + n.x;
      pos[i * 9 + k * 3 + 1] = t[k].y + n.y;
      pos[i * 9 + k * 3 + 2] = t[k].z + n.z;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
