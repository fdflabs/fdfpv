/*
 * hangar-tuning3d.js: what the hangar's Tuning tab puts on the model.
 *
 * src/ui/hangar-tuning.js says what, through the hangar's frame()
 * (frame().hangar.tabs.tuning); src/render/carousel3d.js calls
 * dressTuning on the hangar's one model before it draws it and
 * undressTuning after, so the picker, which draws the same models, never
 * sees any of it.
 *
 *   BALANCE  a CG mark, the black and yellow quartered roundel, riding a
 *            rail over the plane at its CG, with a plumb line to the
 *            floor: the rail is the CG's reach nose to tail at true
 *            scale, the maker's range lit green, the kit's mark a tick,
 *            and the plumb line turns red past the range.
 *   RATES    the surfaces sweeping through the throws and the expo on
 *            show, and the Timber's flaps where the run starts them.
 *   STAND    the prop turning at the bench's rpm, its disc drawn as in
 *            flight.
 *
 * Everything is in the model's own frame, metres, origin at the CG as
 * every craft builder draws it; the one conversion from the plant's frame
 * is src/render/frame.js's.
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
import { simPosToThree } from './frame.js';

const AMBER = 0xffd45c;
const MINT = 0x7dffb4;
const CREAM = 0xf3ead4;
const WARN = 0xff7a5a;
/* The prop's picture turns at this share of its rpm a frame at 60 Hz,
 * the aliased turn the flight view gives it (src/main.js). */
const SPIN_PER_RPM = 1e-4;
/* Over this rpm the prop is drawn as its disc as well as its blades. */
const DISC_RPM = 400;

const rigs = new WeakMap();

/* The CG roundel, drawn once. */
let roundelTex = null;
function roundel() {
  if (roundelTex) {
    return roundelTex;
  }
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const r = 56;
  g.translate(64, 64);
  g.beginPath();
  g.arc(0, 0, r + 6, 0, 2 * Math.PI);
  g.fillStyle = 'rgba(20, 28, 22, 0.85)';
  g.fill();
  for (let q = 0; q < 4; q += 1) {
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, (q * Math.PI) / 2, ((q + 1) * Math.PI) / 2);
    g.closePath();
    g.fillStyle = q % 2 ? '#ffd45c' : '#141c16';
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, r, 0, 2 * Math.PI);
  g.lineWidth = 6;
  g.strokeStyle = '#ffd45c';
  g.stroke();
  roundelTex = new THREE.CanvasTexture(c);
  roundelTex.colorSpace = THREE.SRGBColorSpace;
  return roundelTex;
}

function flat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/* The model's box in its own frame, from its meshes as built. */
function localBox(group) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  const m = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) {
      return;
    }
    if (!o.geometry.boundingBox) {
      o.geometry.computeBoundingBox();
    }
    m.multiplyMatrices(inv, o.matrixWorld);
    one.copy(o.geometry.boundingBox).applyMatrix4(m);
    box.union(one);
  });
  return box;
}

function rigFor(craft) {
  let rig = rigs.get(craft);
  if (rig) {
    return rig;
  }
  const box = localBox(craft.group);
  const size = box.getSize(new THREE.Vector3());
  const len = Math.max(size.x, size.z);
  const g = new THREE.Group();
  g.name = 'hangar-tuning';
  g.visible = false;

  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: roundel(), depthTest: false, fog: false, transparent: true }));
  const markSize = 0.042 * len;
  mark.scale.set(markSize, markSize, 1);
  mark.renderOrder = 10;
  const top = box.max.y + 0.09 * len;
  const bar = new THREE.BoxGeometry(1, 1, 1);
  const plumb = new THREE.Mesh(bar, flat(AMBER, 0.85));
  const floorY = box.min.y;

  /* The rail the mark rides, over the plane at true scale: the CG's reach
   * with the battery and the lead, the maker's range green on it, and the
   * kit's mark a tick across it. Bars, not flat strips, so it reads from
   * the broadside the Balance page looks from. */
  const base = new THREE.Mesh(bar, flat(CREAM, 0.35));
  const band = new THREE.Mesh(bar, flat(MINT, 0.8));
  const kit = new THREE.Mesh(bar, flat(CREAM, 0.95));
  base.renderOrder = 8;
  band.renderOrder = 9;
  kit.renderOrder = 9;
  g.add(mark, plumb, base, band, kit);
  craft.group.add(g);
  rig = { g, mark, plumb, base, band, kit, top, floorY, len };
  rigs.set(craft, rig);
  return rig;
}

const v = new THREE.Vector3();
/* The model's z of a CG shift forward of the kit's, m. */
function zOf(shift) {
  simPosToThree(shift, 0, 0, v);
  return v.z;
}

/* A bar along the model's length between two shifts, at height y. */
function railBar(mesh, a, b, y, thick) {
  const z0 = zOf(a);
  const z1 = zOf(b);
  mesh.position.set(0, y, 0.5 * (z0 + z1));
  mesh.scale.set(thick, thick, Math.max(1e-4, Math.abs(z1 - z0)));
}

/*
 * Put the tab's state on the model, `tab` being frame().hangar.tabs.tuning
 * (null or missing takes it all off), dt seconds since the last frame.
 */
export function dressTuning(craft, tab, dt) {
  if (!craft || !craft.group) {
    return;
  }
  if (!tab) {
    undressTuning(craft);
    return;
  }
  const rig = rigFor(craft);
  const cg = tab.cg;
  rig.g.visible = Boolean(cg);
  if (cg) {
    const z = zOf(cg.shift);
    rig.mark.position.set(0, rig.top, z);
    const h = rig.top - rig.floorY;
    rig.plumb.position.set(0, rig.floorY + 0.5 * h, z);
    rig.plumb.scale.set(0.004 * rig.len, h, 0.004 * rig.len);
    const t = 0.006 * rig.len;
    railBar(rig.base, cg.reach[0], cg.reach[1], rig.top, t);
    rig.band.visible = Boolean(cg.range);
    if (cg.range) {
      railBar(rig.band, Math.max(cg.reach[0], cg.range[1]), Math.min(cg.reach[1], cg.range[0]), rig.top, 1.5 * t);
    }
    rig.kit.position.set(0, rig.top, zOf(0));
    rig.kit.scale.set(0.8 * t, 6 * t, 0.8 * t);
    rig.plumb.material.color.setHex(cg.warn ? WARN : AMBER);
  }
  if (craft.setSurfaces) {
    const s = tab.surfaces;
    if (s) {
      craft.setSurfaces(s[0], s[1], s[2], s[3]);
    } else {
      craft.setSurfaces(0, 0, 0, 0);
    }
  }
  if (craft.setFlaps) {
    craft.setFlaps(tab.flaps || 0);
  }
  const rpm = tab.rpm || 0;
  const turn = rpm * SPIN_PER_RPM * dt * 60;
  if (craft.blades && craft.blades[0]) {
    const dir = craft.propSpin ? craft.propSpin[0] : 1;
    craft.blades[0].rotation.y += turn * dir;
  }
  if (craft.discs && craft.discs[0]) {
    craft.discs[0].visible = rpm > DISC_RPM;
    craft.discs[0].rotation.y += turn;
  }
  /* A folding prop opens with the motor and folds when it stops, on the
   * stand only, so the other pages leave it as it stood. */
  if (craft.setProp && tab.section === 'stand') {
    craft.setProp(rpm);
  }
}

/* Everything back as the picker draws it. */
export function undressTuning(craft) {
  const rig = rigs.get(craft);
  if (rig) {
    rig.g.visible = false;
  }
  if (craft.setSurfaces) {
    craft.setSurfaces(0, 0, 0, 0);
  }
  if (craft.setFlaps) {
    craft.setFlaps(0);
  }
  for (const d of craft.discs || []) {
    d.visible = false;
  }
}
