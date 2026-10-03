/*
 * combat-preview.js: the stage scripts/combat-models-check.js drives.
 *
 * Builds combat quads with src/render/combatcraft.js and answers, as
 * numbers, what the check asserts: what a build costs in draws and
 * triangles, where its payload hangs against its floor and its props, and
 * a hash of everything it drew, so two builds of one answer can be held
 * to be the same machine. It also costs the aircraft already in the game,
 * which is the budget a new one is held to. And it poses a camera for the
 * pictures.
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
import { buildComposer } from '../../src/render/post.js';
import {
  buildCombatDrone, COMBAT_FRAMES, COMBAT_PAYLOAD_IDS, COMBAT_ACCESSORY_IDS,
} from '../../src/render/combatcraft.js';
import { dressDecals, readDecals } from '../../src/render/decals.js';
import { readFinish } from '../../src/render/finish.js';
import {
  buildStrikerCraft, buildStrikerLauncher, strikerWarGeometry, STRIKER_PROPULSION,
} from '../../src/render/strikercraft.js';
import { STRIKER_RAIL } from '../../configs/airframes.js';
import { attackerGeometry, createAttackers } from '../../src/render/attackers.js';
import { buildSkyCraft } from '../../src/render/skycraft.js';
import { buildCubCraft } from '../../src/render/cubcraft.js';
import { buildGliderCraft } from '../../src/render/glidercraft.js';
import { buildBramorCraft } from '../../src/render/bramorcraft.js';
import { buildSlowStickCraft } from '../../src/render/slowstickcraft.js';
import { buildTimberCraft } from '../../src/render/timbercraft.js';
import { buildBombshellCraft } from '../../src/render/bombshellcraft.js';
import { buildKadetCraft } from '../../src/render/kadetcraft.js';
import { buildF16Craft } from '../../src/render/f16craft.js';
import { buildZagiCraft } from '../../src/render/zagicraft.js';
import { buildP51Craft } from '../../src/render/p51craft.js';
import { buildTigermothCraft } from '../../src/render/tigermothcraft.js';
import { buildUglystikCraft } from '../../src/render/uglystikcraft.js';
import { buildDlgCraft } from '../../src/render/dlgcraft.js';

/* The aircraft already shipped, by the id craft.js seats them under. */
const SHIPPED = {
  sky1800: buildSkyCraft,
  cub1400: buildCubCraft,
  radian2000: buildGliderCraft,
  bramor2300: buildBramorCraft,
  slowstick1180: buildSlowStickCraft,
  timber1500: buildTimberCraft,
  bombshell1118: buildBombshellCraft,
  kadet1981: buildKadetCraft,
  f16878: buildF16Craft,
  zagi1219: buildZagiCraft,
  p51d1450: buildP51Craft,
  tigermoth1803: buildTigermothCraft,
  uglystik1567: buildUglystikCraft,
  nrj1490: buildDlgCraft,
};

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c7cf);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 200);
scene.add(new THREE.HemisphereLight(0xf0e6d0, 0x2a3828, 0.82));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.45);
sun.position.set(0.48, 0.92, -0.52);
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x8e9a7c }),
);
ground.visible = false;
scene.add(ground);
const composer = buildComposer(renderer, scene, camera, null);

function release(root) {
  root.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    if (o.material) {
      o.material.dispose();
    }
  });
}

/* Every visible mesh with triangles in it is a draw. */
function cost(group) {
  let tris = 0;
  let draws = 0;
  group.traverseVisible((o) => {
    if (!o.isMesh) {
      return;
    }
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    if (n === 0) {
      return;
    }
    draws += 1;
    tris += n / 3;
  });
  return { draws, tris };
}

/* FNV-1a over everything a build drew: names, transforms, materials and
 * every vertex attribute byte. Two builds that hash alike drew alike. */
function hashOf(group) {
  let h = 0x811c9dc5;
  const byte = (b) => {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const str = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      byte(s.charCodeAt(i) & 0xff);
    }
  };
  const floats = (arr) => {
    const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < u.length; i += 1) {
      byte(u[i]);
    }
  };
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    str(o.name || '-');
    floats(new Float32Array(o.matrixWorld.elements));
    if (!o.isMesh) {
      return;
    }
    str(o.material.type);
    if (o.material.color) {
      str(o.material.color.getHexString());
    }
    for (const key of Object.keys(o.geometry.attributes).sort()) {
      str(key);
      floats(o.geometry.attributes[key].array);
    }
  });
  return h.toString(16).padStart(8, '0');
}

/* What is in the way of the props: any vertex of the machine (but the
 * rotors, the discs and the outlines, which are paint) inside a motor's
 * swept ring, from the bell's edge to the blade tip, within the band the
 * blades and their twist occupy. */
function propIntrusions(craft) {
  const s = craft.combat.size;
  const lo = s.propY - 0.004;
  const hi = s.propY + 0.006;
  const rIn = s.motorR * 1.05;
  const motors = craft.blades.map((r) => r.position);
  const out = [];
  const v = new THREE.Vector3();
  const skip = new Set([...craft.blades, ...craft.discs]);
  craft.group.updateMatrixWorld(true);
  craft.group.traverse((o) => {
    if (!o.isMesh || o.material.userData.hullColor !== undefined) {
      return;
    }
    let inRotor = false;
    o.traverseAncestors((p) => { inRotor = inRotor || skip.has(p); });
    if (inRotor || skip.has(o)) {
      return;
    }
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y < lo || v.y > hi) {
        continue;
      }
      for (const m of motors) {
        const r = Math.hypot(v.x - m.x, v.z - m.z);
        if (r > rIn && r < s.propR) {
          out.push(`${o.name} at ${v.toArray().map((n) => n.toFixed(3)).join(',')}`);
          return;
        }
      }
    }
  });
  return out;
}

/* The box of every vertex under `root` in the craft's frame, outlines
 * left out (they are paint), or null when there is nothing. */
function vertexBox(craft, root) {
  if (!root) {
    return null;
  }
  craft.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(craft.group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.material.userData.hullColor !== undefined) {
      return;
    }
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    if (!pos) {
      return;
    }
    for (let i = 0; i < pos.count; i += 1) {
      box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    }
  });
  if (box.isEmpty()) {
    return null;
  }
  return { min: box.min.toArray(), max: box.max.toArray(), centre: box.getCenter(new THREE.Vector3()).toArray() };
}

/*
 * The outward facing check: each mesh's signed volume, the sum over its
 * triangles of a . (b x c) / 6 about its own box's centre. A closed solid
 * with its faces pointing out has a positive one; a lathe with its profile
 * the wrong way round, drawn inside out and so invisible under front face
 * culling, makes it negative. Every piece the builder makes is closed, so
 * the sum does not depend on where it is taken about.
 */
function insideOut(craft) {
  const bad = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  craft.group.traverse((o) => {
    if (!o.isMesh || o.material.side !== THREE.FrontSide || o.material.userData.hullColor !== undefined) {
      return;
    }
    const g = o.geometry;
    const pos = g.attributes.position;
    if (!pos) {
      return;
    }
    g.computeBoundingBox();
    const centre = g.boundingBox.getCenter(new THREE.Vector3());
    const at = g.index ? (i) => g.index.getX(i) : (i) => i;
    const n = g.index ? g.index.count : pos.count;
    let vol = 0;
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(pos, at(i)).sub(centre);
      b.fromBufferAttribute(pos, at(i + 1)).sub(centre);
      c.fromBufferAttribute(pos, at(i + 2)).sub(centre);
      vol += a.dot(b.cross(c)) / 6;
    }
    if (vol < 0) {
      bad.push(`${o.name}: signed volume ${(vol * 1e6).toFixed(2)} cm^3`);
    }
  });
  return bad;
}

let shown = null;

window.__combat = {
  frames: Object.keys(COMBAT_FRAMES),
  /* The payloads each frame carries, 'none' first, in the table's order. */
  payloads: Object.fromEntries(Object.entries(COMBAT_FRAMES).map(([id, f]) => [id, COMBAT_PAYLOAD_IDS.filter((p) => p === 'none' || f.payloads[p])])),
  /* The accessories each frame offers, in the doc's order. */
  accessories: Object.fromEntries(Object.entries(COMBAT_FRAMES).map(([id, f]) => [id, COMBAT_ACCESSORY_IDS.filter((a) => f.accessories[a])])),
  spec: (frame) => COMBAT_FRAMES[frame],
  /* What every shipped aircraft costs, full and lite. */
  reference() {
    const out = {};
    for (const [id, build] of Object.entries(SHIPPED)) {
      const full = build({ name: id, fog: false });
      const lite = build({ name: id, fog: false, lite: true });
      out[id] = { full: cost(full.group), lite: cost(lite.group) };
      release(full.group);
      release(lite.group);
    }
    return out;
  },
  /* One answer built twice, measured, released. */
  audit(choice) {
    const a = buildCombatDrone({ ...choice, name: 'combat', fog: false });
    const b = buildCombatDrone({ ...choice, name: 'combat', fog: false });
    const lite = buildCombatDrone({ ...choice, name: 'combat', fog: false, lite: true });
    const s = a.combat.size;
    const r = {
      full: cost(a.group),
      lite: cost(lite.group),
      hashA: hashOf(a.group),
      hashB: hashOf(b.group),
      intrusions: propIntrusions(a),
      payload: vertexBox(a, a.combat.parts.payload),
      payloadBody: vertexBox(a, a.combat.parts.payloadBody),
      legs: vertexBox(a, a.combat.parts.legs),
      whole: vertexBox(a, a.group),
      insideOut: insideOut(a),
      size: s,
      spec: a.combat.payload === 'none' ? null : COMBAT_FRAMES[a.combat.frame].payloads[a.combat.payload],
      built: { frame: a.combat.frame, payload: a.combat.payload, accessories: a.combat.accessories },
    };
    release(a.group);
    release(b.group);
    release(lite.group);
    return r;
  },
  /*
   * The garage's hook on one build: a star on every decal surface must
   * print on the skin there (decals.js projects it onto what is under the
   * point, facing the normal), every finish and a full wear must change
   * what the regions are drawn in, and set() with nothing must put back
   * exactly the colours the model was built in.
   */
  paintAudit(choice, which = 'quad') {
    const build = which === 'striker' ? buildStrikerCraft : buildCombatDrone;
    const craft = build({ ...choice, name: 'combat', fog: false });
    const paint = craft.combat.paint;
    const out = { regions: paint.regions, surfaces: [], finishes: {}, restored: false };
    for (const sf of paint.surfaces) {
      dressDecals(craft, [{ k: 'star', p: sf.p, n: sf.n, s: sf.size * 0.9, a: 1, r: 0, m: false, c: 0xffffff, c2: 0x101010 }]);
      out.surfaces.push({ id: sf.id, triangles: readDecals(craft).triangles });
      dressDecals(craft, []);
    }
    const stock = JSON.stringify(craft.livery.stock());
    for (const f of paint.finishes) {
      paint.set({ finish: f, wear: 1 });
      out.finishes[f] = { colours: craft.livery.read(), finish: readFinish(craft) };
    }
    paint.set({});
    out.restored = JSON.stringify(craft.livery.read()) === stock;
    out.stock = craft.livery.stock();
    let threw = 0;
    for (const bad of [{ finish: 'chrome-ish' }, { wear: 1.5 }, { colours: { nope: 0 } }]) {
      try {
        paint.set(bad);
      } catch {
        threw += 1;
      }
    }
    out.refused = threw;
    release(craft.group);
    return out;
  },
  propulsions: STRIKER_PROPULSION,
  /*
   * The Striker, both drawings. The war's: one geometry (what
   * attackers.js instances, asked of attackers.js itself), its triangles,
   * its prop's vertices marked to spin, its size. The garage's: built
   * twice and hashed, costed, weighed for inside out solids, its rotor
   * turned to see that it turns the prop about the fore and aft axis.
   */
  strikerAudit(choice) {
    const war = choice.propulsion === 'prop' && !choice.antenna ? attackerGeometry('strike') : strikerWarGeometry(choice);
    war.computeBoundingBox();
    const spinFlags = war.attributes.aSpin ? war.attributes.aSpin.array : [];
    const a = buildStrikerCraft({ ...choice, fog: false });
    const b = buildStrikerCraft({ ...choice, fog: false });
    const lite = buildStrikerCraft({ ...choice, fog: false, lite: true });
    /* And parked on its launch rail, the launcher shown, as the shell
     * draws it on the pad. */
    const railed = buildStrikerCraft({ ...choice, fog: false });
    buildStrikerLauncher(railed, STRIKER_RAIL, { fog: false });
    railed.launcher.visible = true;
    const rotor = a.blades[0];
    let turns = null;
    if (rotor.children.length) {
      a.group.updateMatrixWorld(true);
      const probe = (angle) => {
        rotor.rotation.y = angle;
        a.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rotor);
        return { min: box.min.toArray(), max: box.max.toArray() };
      };
      const p0 = probe(0);
      const p1 = probe(Math.PI / 2);
      rotor.rotation.y = 0;
      turns = { p0, p1 };
    }
    /* The surfaces' convention as numbers, as scripts/craft-preview.js
     * holds every flying wing's: +0.35 rad on a left elevon lifts its
     * trailing edge and leaves the right one; on the rudder it moves both
     * trailing edges left. */
    const boxOf = (name) => {
      a.group.updateMatrixWorld(true);
      const b3 = new THREE.Box3().setFromObject(a.combat.parts[name]);
      return { min: b3.min.toArray(), max: b3.max.toArray() };
    };
    const still = { el: boxOf('elevon-left'), er: boxOf('elevon-right'), rl: boxOf('rudder-left'), rr: boxOf('rudder-right') };
    a.setSurfaces(0.35, 0, 0, 0);
    const leftUp = { el: boxOf('elevon-left'), er: boxOf('elevon-right') };
    a.setSurfaces(0, 0, 0, 0.35);
    const rudderLeft = { rl: boxOf('rudder-left'), rr: boxOf('rudder-right') };
    a.setSurfaces(0, 0, 0, 0);
    const surfaces = {
      elevonUpMm: (leftUp.el.max[1] - still.el.max[1]) * 1000,
      otherElevonMm: Math.abs(leftUp.er.max[1] - still.er.max[1]) * 1000,
      rudderLeftMm: Math.min(still.rl.min[0] - rudderLeft.rl.min[0], still.rr.min[0] - rudderLeft.rr.min[0]) * 1000,
    };
    const r = {
      surfaces,
      war: {
        tris: (war.index ? war.index.count : war.attributes.position.count) / 3,
        spin: spinFlags.reduce((n, f) => n + (f > 0.5 ? 1 : 0), 0),
        min: war.boundingBox.min.toArray(),
        max: war.boundingBox.max.toArray(),
        attrs: Object.keys(war.attributes).sort(),
      },
      full: cost(a.group),
      lite: cost(lite.group),
      railed: cost(railed.group),
      hashA: hashOf(a.group),
      hashB: hashOf(b.group),
      insideOut: insideOut(a),
      whole: vertexBox(a, a.group),
      parts: Object.keys(a.combat.parts).sort(),
      turns,
      slots: [a.blades.length, a.discs.length, a.propSpin.join(',')],
    };
    war.dispose();
    for (const c of [a, b, lite, railed]) {
      release(c.group);
    }
    return r;
  },
  /* A Striker on the stage: the war's drawing through the war's own layer
   * (src/render/attackers.js), or the garage's model. */
  showStriker(choice, { war = false, frames = 1 } = {}) {
    if (shown) {
      scene.remove(shown.group);
      if (shown.dispose) {
        shown.dispose();
      } else {
        release(shown.group);
      }
    }
    if (war) {
      const layer = createAttackers();
      for (let i = 0; i < frames; i += 1) {
        layer.update([{ id: 1, kind: 'strike', p: [0, 0, 0], q: [0, 0, 0, 1] }], null);
      }
      shown = { group: layer.group, dispose: () => layer.dispose(), drawn: layer.drawn() };
      scene.add(layer.group);
      ground.visible = false;
      return shown.drawn;
    }
    shown = buildStrikerCraft({ ...choice, fog: false });
    shown.blades[0].rotation.y = 0.5;
    scene.add(shown.group);
    ground.visible = false;
    return cost(shown.group);
  },
  /* Put one build on the stage, replacing the last. */
  show(choice, { spin = 0.6, blur = false, onGround = false } = {}) {
    if (shown) {
      scene.remove(shown.group);
      if (shown.dispose) {
        shown.dispose();
      } else {
        release(shown.group);
      }
    }
    shown = buildCombatDrone({ ...choice, name: 'combat', fog: false });
    for (let m = 0; m < 4; m += 1) {
      shown.blades[m].rotation.y = spin * (m + 1);
      shown.blades[m].visible = !blur;
      shown.discs[m].visible = blur;
    }
    scene.add(shown.group);
    ground.visible = onGround;
    /* A payload hangs lowest; stand the machine on it. */
    const box = new THREE.Box3().setFromObject(shown.group);
    ground.position.y = box.min.y - 0.001;
    return cost(shown.group);
  },
  /* Camera by azimuth and elevation in degrees about a target, at dist
   * metres. Azimuth 0 looks at the nose from ahead, 90 from the right. */
  view(az, el, dist, tx = 0, ty = 0, tz = 0, fov = 30) {
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(
      tx + dist * Math.cos(e) * Math.sin(a),
      ty + dist * Math.sin(e),
      tz - dist * Math.cos(e) * Math.cos(a),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, ty, tz);
    composer.render();
    return true;
  },
};
window.__combatReady = true;
