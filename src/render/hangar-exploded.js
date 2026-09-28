/*
 * hangar-exploded.js: the Power tab's exploded view, for
 * src/render/carousel3d.js.
 *
 * On the Power tab the plane's power system comes apart a little, the way
 * a kit's instructions draw it: the prop slides forward off its shaft (aft
 * on a pusher), the motor or the engine comes out of the nose after it,
 * and the pack or the tank drops out of the fuselage below. A thin mint
 * line runs from each part back to where it lives. Leaving the tab puts
 * everything back.
 *
 * WHAT MOVES IS THE MODEL WHERE THE MODEL HAS IT. Every plane's prop is
 * its own group (the builders' blades, whose parent is the prop mount),
 * the Kadet's and the Bombshell's engines and the Slow Stick's pack are
 * named meshes, and those are moved. What a model does not draw as a part
 * of its own, a motor buried in a cowl or a pack inside a fuselage, is
 * drawn here: a motor can or a finned glow engine sized from the option's
 * thrust, a LiPo sized from its cells and capacity, a fuel tank from its
 * cc (configs/power.js). A new choice rebuilds them with a small pop.
 *
 * Units: the model's own frame, metres, inside the picker's unit scale.
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
import { celMaterial } from './celmat.js';
import { POWER } from '../../configs/power.js';

/* How far each part comes out at full explosion, in footprint radii: the
 * prop along the thrust line, the motor after it, the pack out of the
 * fuselage's side the Power tab's views look at (hangarstage.js)
 * and a little down. */
const PROP_OUT = 0.26;
const MOTOR_OUT = 0.12;
const PACK_SIDE = -0.3;
const PACK_DOWN = 0.06;
/* Where the pack is taken from: this share of the way from the middle
 * to the nose, where a pack sits to balance a plane, tractor or pusher. */
const PACK_AT = 0.4;
/* The explosion's spring, radians a second, and the new part's pop. */
const OMEGA = 6;

const METAL = { color: 0x9aa4a8, rim: 0.3, spec: 0.5, specWidth: 0.02 };
const ANODISED = { color: 0x2c3a44, rim: 0.3, spec: 0.35 };
const BELL = { color: 0xd8483a, rim: 0.3, spec: 0.35 };
const WRAP = { color: 0x1d2226, rim: 0.28, spec: 0.2 };
const LABEL = { color: 0xffd45c, rim: 0.2, spec: 0.1 };

/* Materials are kept for the session, like the picker's models: a new
 * choice rebuilds the parts' geometry, and a fresh material would be a
 * fresh shader program to compile in the very frame the pilot picked. */
const MATS = new Map();
function mat(o) {
  const key = JSON.stringify(o);
  if (!MATS.has(key)) {
    MATS.set(key, celMaterial({ fog: false, cloudShadow: 0, ...o }));
  }
  return MATS.get(key);
}
let tankShell = null;

function option(airframe, id) {
  const list = POWER[airframe];
  if (!list) {
    return null;
  }
  return list.find((o) => o.id === id) ?? list[0];
}

/* An outrunner: the stator can, the bell over it, the shaft. */
function motorPart(d) {
  const g = new THREE.Group();
  const len = d * 0.9;
  const can = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.5, d * 0.5, len * 0.55, 28), mat(ANODISED));
  can.position.y = -len * 0.2;
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.52, d * 0.52, len * 0.5, 28), mat(BELL));
  bell.position.y = len * 0.28;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.06, d * 0.06, len * 0.5, 10), mat(METAL));
  shaft.position.y = len * 0.75;
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.62, d * 0.62, d * 0.06, 4), mat(METAL));
  mount.position.y = -len * 0.5;
  mount.rotation.y = Math.PI / 4;
  g.add(can, bell, shaft, mount);
  return g;
}

/* A glow engine: the crankcase, the finned head over it, the plug. */
function enginePart(d) {
  const g = new THREE.Group();
  const metal = mat(METAL);
  const dark = mat({ ...ANODISED, color: 0x3a3f42 });
  const crank = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.42, d * 0.42, d * 0.9, 24), metal);
  crank.rotation.z = Math.PI / 2;
  g.add(crank);
  const fins = 7;
  for (let i = 0; i < fins; i += 1) {
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.46, d * 0.46, d * 0.035, 24), i % 2 ? metal : dark);
    fin.position.set(0, d * (0.45 + i * 0.075), 0);
    g.add(fin);
  }
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.08, d * 0.08, d * 0.2, 8), mat(LABEL));
  plug.position.y = d * (0.45 + fins * 0.075 + 0.08);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.07, d * 0.07, d * 0.5, 10), metal);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = d * 0.65;
  g.add(plug, shaft);
  /* The shaft is the engine's x here; the part is turned onto the thrust
   * line where it is placed. */
  g.userData.shaftX = true;
  return g;
}

/* A LiPo: a wrapped block, a label band, the leads. */
function packPart(cells, mAh) {
  const g = new THREE.Group();
  const l = Math.min(0.2, 0.07 + 0.022 * (mAh / 1000));
  const w = Math.min(0.07, 0.03 + 0.003 * (mAh / 1000));
  const h = 0.0085 * cells;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(WRAP));
  const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 1.01, l * 0.34), mat(LABEL));
  const red = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, l * 0.4, 8), mat({ color: 0xd8483a, rim: 0.2 }));
  red.rotation.x = Math.PI / 2;
  red.position.set(w * 0.2, h * 0.2, -l * 0.66);
  const black = red.clone();
  black.material = mat({ color: 0x141414, rim: 0.2 });
  black.position.x = -w * 0.2;
  g.add(body, band, red, black);
  return g;
}

/* A fuel tank: a clear capsule of glow fuel with its clunk line. */
function tankPart(cc) {
  const g = new THREE.Group();
  const a = Math.cbrt(cc) * 0.01;
  const r = a * 0.42;
  const len = a * 1.35;
  tankShell = tankShell ?? new THREE.MeshStandardMaterial({
    color: 0xeef4f0, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 20), tankShell);
  shell.rotation.x = Math.PI / 2;
  const fuel = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.86, len * 0.96, 6, 20), mat({ color: 0xc9e27a, rim: 0.25, spec: 0.3 }));
  fuel.rotation.x = Math.PI / 2;
  fuel.scale.set(1, 1, 0.8);
  fuel.position.y = -r * 0.14;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, r * 0.25, 16), mat(METAL));
  cap.rotation.x = Math.PI / 2;
  cap.position.z = -(len / 2 + r);
  g.add(fuel, shell, cap);
  return g;
}

function disposeGeometry(o) {
  o.traverse((n) => {
    if (n.geometry) {
      n.geometry.dispose();
    }
  });
}

/*
 * One per picker. update() is called once a frame for the hangar's model
 * with the Power tab's choice (null off the tab) and eases the parts out
 * or back; rest() snaps a model back when the picker draws it.
 */
export function createExploder() {
  const rigs = new Map();
  const tmp = new THREE.Vector3();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x7dffb4, transparent: true, opacity: 0, depthWrite: false, fog: false });

  /* The model's parts, found once: the prop mount and where it rests, the
   * thrust direction out of the model, the named engine and pack, all in
   * the craft group's frame. */
  function rigFor(m) {
    let r = rigs.get(m);
    if (r) {
      return r;
    }
    const craft = m.craft;
    const root = craft.group;
    root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const inRoot = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot);
    const mount = craft.blades && craft.blades[0] ? craft.blades[0].parent : null;
    const { radius } = m;
    const centre = root.position.clone().negate();
    const propAt = mount ? inRoot(mount) : new THREE.Vector3(0, centre.y, centre.z + m.noseZ * radius);
    /* Forward is -z; a prop behind the middle is a pusher, and comes out
     * aft. */
    const dir = new THREE.Vector3(0, 0, propAt.z > centre.z ? 1 : -1);
    const named = (suffix) => {
      const out = [];
      root.traverse((o) => {
        if (o.name && o.name.endsWith(suffix) && o.isMesh) {
          out.push(o);
        }
      });
      return out;
    };
    const movable = (o) => ({
      o,
      rest: o.position.clone(),
      toLocal: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(root.matrixWorld)),
    });
    r = {
      root,
      radius,
      dir,
      propAt,
      packAt: new THREE.Vector3(centre.x, centre.y, centre.z + PACK_AT * m.noseZ * radius),
      prop: mount ? movable(mount) : null,
      engines: [...named('-engine'), ...named('-rocker')].map(movable),
      packs: named('-pack').map(movable),
      e: { x: 0, v: 0 },
      pop: { x: 1, v: 0 },
      key: '',
      group: null,
      parts: [],
    };
    rigs.set(m, r);
    return r;
  }

  /* A movable's rest position moved by `off`, a vector in the craft
   * group's frame. */
  function place(mv, off) {
    mv.o.position.copy(mv.rest).add(tmp.copy(off).applyMatrix3(mv.toLocal));
  }

  function build(r, want) {
    if (r.group) {
      r.root.remove(r.group);
      disposeGeometry(r.group);
    }
    r.group = new THREE.Group();
    r.group.name = 'hangar-exploded';
    r.parts = [];
    const o = option(want.airframe, want.option);
    const glow = o ? o.kind === 'glow' : false;
    const pack = o && o.packs ? (o.packs.find((p) => p.id === want.pack) ?? o.packs[0]) : null;
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    r.lineGeo = lines;
    r.group.add(new THREE.LineSegments(lines, lineMat));
    if (!r.engines.length) {
      const thrust = o ? o.thrustN : 10;
      const d = Math.min(0.07, 0.02 + 0.0008 * thrust);
      const part = glow ? enginePart(d) : motorPart(d);
      /* Onto the thrust line: the can's axis (y) or the engine's shaft
       * (x) along dir. */
      if (part.userData.shaftX) {
        part.rotation.y = r.dir.z > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        part.rotation.x = r.dir.z > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      r.group.add(part);
      r.parts.push({ kind: glow ? 'engine' : 'motor', obj: part });
    }
    if (pack && !r.packs.length) {
      const part = glow ? tankPart(pack.cc) : packPart(pack.cells, pack.mAh);
      r.group.add(part);
      r.parts.push({ kind: glow ? 'tank' : 'pack', obj: part });
    }
    r.root.add(r.group);
    r.key = `${want.airframe}:${want.option}:${want.pack}`;
    r.kind = glow ? 'glow' : 'electric';
  }

  const off = new THREE.Vector3();

  /* The hangar's model `m` this frame; `want` the Power tab's choice or
   * null. Returns what a check reads. */
  function update(m, want, dt) {
    const r = rigFor(m);
    if (want) {
      const key = `${want.airframe}:${want.option}:${want.pack}`;
      if (key !== r.key) {
        build(r, want);
        if (r.e.x > 0.3) {
          r.pop.x = 0.55;
          r.pop.v = 0;
        }
      }
    }
    const to = want ? 1 : 0;
    const x = r.e.x - to;
    r.e.v += (-OMEGA * OMEGA * x - 2 * OMEGA * r.e.v) * dt;
    r.e.x += r.e.v * dt;
    if (!want && Math.abs(r.e.x) < 1e-3 && Math.abs(r.e.v) < 1e-3) {
      r.e.x = 0;
      r.e.v = 0;
    }
    const px = r.pop.x - 1;
    r.pop.v += (-160 * px - 2 * 0.5 * Math.sqrt(160) * r.pop.v) * dt;
    r.pop.x += r.pop.v * dt;
    pose(r);
    return stats(r);
  }

  function pose(r) {
    const e = Math.max(0, r.e.x);
    const R = r.radius;
    if (r.prop) {
      off.copy(r.dir).multiplyScalar(PROP_OUT * R * e);
      place(r.prop, off);
    }
    for (const mv of r.engines) {
      off.copy(r.dir).multiplyScalar(MOTOR_OUT * R * e);
      place(mv, off);
    }
    const packFrom = r.packAt;
    for (const mv of r.packs) {
      off.set(PACK_SIDE * R * e, -PACK_DOWN * R * e, 0);
      place(mv, off);
    }
    const shown = e > 0.02;
    const pts = r.lineGeo ? r.lineGeo.attributes.position : null;
    for (const p of r.parts) {
      p.obj.visible = shown;
      const s = Math.min(1, e * 1.4) * r.pop.x;
      p.obj.scale.setScalar(Math.max(1e-3, s));
      if (p.kind === 'motor' || p.kind === 'engine') {
        p.obj.position.copy(r.propAt).addScaledVector(r.dir, MOTOR_OUT * R * e);
        p.home = r.propAt;
      } else {
        p.obj.position.copy(packFrom).add(off.set(PACK_SIDE * R * e, -PACK_DOWN * R * e, 0));
        p.home = packFrom;
      }
    }
    if (pts) {
      let i = 0;
      for (const p of r.parts.slice(0, 2)) {
        pts.setXYZ(i, p.home.x, p.home.y, p.home.z);
        pts.setXYZ(i + 1, p.obj.position.x, p.obj.position.y, p.obj.position.z);
        i += 2;
      }
      for (; i < 4; i += 1) {
        pts.setXYZ(i, 0, 0, 0);
      }
      pts.needsUpdate = true;
      r.lineGeo.computeBoundingSphere();
    }
    lineMat.opacity = 0.7 * Math.min(1, e);
    if (r.group) {
      r.group.visible = shown;
    }
  }

  function stats(r) {
    const e = Math.max(0, r.e.x);
    return {
      amount: e,
      propOut: r.prop ? r.prop.o.position.distanceTo(r.prop.rest) : 0,
      movedEngines: r.engines.length,
      movedPacks: r.packs.length,
      parts: r.group && r.group.visible ? r.parts.map((p) => p.kind) : [],
      kind: r.kind ?? null,
      key: r.key,
    };
  }

  /* Put a model back together at once: the picker draws it whole. */
  function rest(m) {
    const r = rigs.get(m);
    if (!r || (r.e.x === 0 && r.e.v === 0)) {
      return;
    }
    r.e.x = 0;
    r.e.v = 0;
    pose(r);
  }

  /* Where the model's prop is along it, in the hangar rig's `along`
   * units: shares of the nose's reach forward, negative, or of the tail's
   * aft. */
  function propAlong(m) {
    const r = rigFor(m);
    const z = (r.propAt.z + r.root.position.z) / r.radius;
    return z < 0 ? -z / m.noseZ : z / m.tailZ;
  }

  return { update, rest, propAlong };
}
