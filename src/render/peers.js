/*
 * peers.js: the other pilots in a room, drawn. Their aircraft, built by
 * the airframe's own builder (src/render/craft.js) in their own paint and
 * add ons, and the pilots themselves standing on the field.
 *
 * AN AIRCRAFT, NOT A GHOST. The ghost (src/render/ghostcraft.js) is a mint
 * hologram on purpose, because it is a recording. A peer is a person
 * flying now, so it is the real model: dressLivery with the peer's own
 * colours, finishes and decals (never the global livery source, which is
 * this pilot's paint), dressParts with the peer's own prop and add ons
 * (never their damage record, which stays at home; a peer's damage in
 * flight is Phase 2's parts frames). Each receiver runs its own
 * normaliseEntry and normalisePlane on what arrived, so a plane or a
 * colour this build does not know is dropped here, not an error.
 *
 * What moves on it comes from the pose (src/share/roomwire.js): the
 * surfaces, the flaps, the retracts, the folding prop, the chute, and the
 * props at the speed the sender's motors turned. The smoke trail is not
 * sent: each peer with the smoke add on gets its own trail, emitted here
 * from the nozzle while the pose says the smoke is on.
 *
 * THE PILOT FIGURE. A low poly person holding a transmitter, in one of
 * FIGURE_LOOKS (a suit colour and a cap colour, nothing more personal than
 * that), standing at its station with its name over it. The head turns to
 * follow its own aircraft: one yaw and one pitch, which is what makes a
 * figure on a flight line read as a pilot.
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
import { craftBuilderFor } from './craft.js';
import { dressLivery } from './livery.js';
import { dressParts } from './partsfit.js';
import { celMaterial } from './celmat.js';
import { createSmoke } from './smoke.js';
import { airframeById } from '../../configs/airframes.js';
import { liveryKey, lookFor, normaliseEntry, paintable } from '../../configs/liveries.js';
import { PROPS, normalisePlane } from '../../configs/hangar-parts.js';
import { FIGURE_COUNT, FLAG_CHUTE, FLAG_GEAR_DOWN, FLAG_QUAD, FLAG_SMOKE } from '../share/roomwire.js';

/* A suit and a cap each. FIGURE_COUNT of them; the wire checks the index. */
export const FIGURE_LOOKS = [
  { suit: 0x2f6fd6, cap: 0xf2c230 },
  { suit: 0xd8432f, cap: 0x1f2a36 },
  { suit: 0x2e9e5b, cap: 0xf4f1e8 },
  { suit: 0xf08a24, cap: 0x2f6fd6 },
  { suit: 0x6b4fc8, cap: 0xf2c230 },
  { suit: 0x1f2a36, cap: 0xd8432f },
  { suit: 0xe9e4d6, cap: 0x2e9e5b },
  { suit: 0x16a3b8, cap: 0xf08a24 },
  { suit: 0xc23b7a, cap: 0xf4f1e8 },
  { suit: 0x7a8a3a, cap: 0x1f2a36 },
  { suit: 0xf2c230, cap: 0x6b4fc8 },
  { suit: 0x8a5a3c, cap: 0x16a3b8 },
];
if (FIGURE_LOOKS.length !== FIGURE_COUNT) {
  throw new Error('peers: FIGURE_LOOKS must have FIGURE_COUNT entries');
}

const TAG_COLOUR = '#ffe7a3';

/* A name over a thing: one canvas, redrawn when the text changes. */
function nameTag(height, width) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, height, 0);
  sprite.scale.set(width, width * (96 / 512), 1);
  sprite.renderOrder = 3;
  let text = '';
  function set(next) {
    next = String(next || '').slice(0, 32);
    if (next === text) {
      return;
    }
    text = next;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(12, 14, 18, 0.85)';
    ctx.fillText(text, canvas.width / 2 + 3, canvas.height / 2 + 3);
    ctx.fillStyle = TAG_COLOUR;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    sprite.visible = Boolean(text);
    texture.needsUpdate = true;
  }
  return { sprite, set, texture };
}

/* Geometry and materials, released; a material another model shares
 * (userData.shared, the parts fitter's) is left alone. */
function release(root) {
  root.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) {
      if (m.userData && m.userData.shared) {
        continue;
      }
      if (m.map && m.map.isCanvasTexture) {
        m.map.dispose();
      }
      m.dispose();
    }
  });
}

/* What a profile draws, as a key: a new key is a rebuild. */
export function profileKey(profile) {
  return JSON.stringify([profile.airframe, profile.livery ?? null, profile.parts ?? null]);
}

/*
 * One peer's aircraft. `look` is the seated map's look put on another
 * craft (shell.lookCraft), or null. Returns { group, smoke, key, pose,
 * setLabel, dispose }; smoke is a trail group for the scene or null.
 */
export function buildPeerCraft(profile, look = null) {
  const id = airframeById(profile.airframe).id;
  const craft = craftBuilderFor(id)({ name: 'peer-craft', fog: true, worldScale: true });
  if (paintable(id)) {
    dressLivery(craft, id, lookFor(id, normaliseEntry(liveryKey(id), profile.livery)));
  }
  let smoke = null;
  if (PROPS[id]) {
    const entry = normalisePlane(id, profile.parts);
    if (entry) {
      dressParts(craft, id, { entry: { ...entry, damage: null }, option: null });
      if (entry.addons.includes('smoke')) {
        smoke = createSmoke();
      }
    }
  }
  const undoLook = look ? look(craft) : null;
  const tag = nameTag(1.3, 2.2);
  craft.group.add(tag.sprite);
  const quad = !airframeById(id).fixedWing;

  let gear = 0;
  const nozzle = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const chuteDir = [0, 1, 0];
  const bodyV = new THREE.Vector3();
  const qInv = new THREE.Quaternion();

  /*
   * Put the aircraft at a drawn pose (src/game/peer.js) with the moving
   * parts from the newest sample `p`. simT is the sim clock the smoke's
   * puffs are timed on, dt the frame's seconds.
   */
  function pose(drawn, p, dt, simT, viewHeight, fov) {
    craft.group.position.set(drawn.px, drawn.py, drawn.pz);
    craft.group.quaternion.set(drawn.qx, drawn.qy, drawn.qz, drawn.qw);
    const rotors = (p.flags & FLAG_QUAD) ? [p.c0, p.c1, p.c2, p.c3] : [p.motor, p.motor, p.motor, p.motor];
    for (let m = 0; m < craft.discs.length && m < 4; m += 1) {
      const spin = rotors[m] * 1e-4 + (rotors[m] > 0 ? 0.10 : 0);
      craft.discs[m].rotation.y += spin;
      if (craft.blades && craft.blades[m]) {
        craft.blades[m].rotation.y += spin * (craft.propSpin ? craft.propSpin[m] : 1);
      }
    }
    if (craft.setProp) {
      craft.setProp(p.motor);
    }
    if (!quad && craft.setSurfaces) {
      craft.setSurfaces(p.c0, p.c1, p.c2, p.c3);
    }
    if (craft.setFlaps) {
      craft.setFlaps(p.flaps);
    }
    if (craft.setGear) {
      /* The retracts travel in about two seconds; the wire says only
       * whether they are down. */
      const want = (p.flags & FLAG_GEAR_DOWN) ? 0 : 1;
      gear += Math.max(-dt * 0.5, Math.min(dt * 0.5, want - gear));
      craft.setGear(gear);
    }
    if (craft.setChute) {
      if (p.flags & FLAG_CHUTE) {
        qInv.copy(craft.group.quaternion).invert();
        bodyV.set(p.vx, p.vy, p.vz).applyQuaternion(qInv);
        const speed = bodyV.length();
        if (speed > 0.3) {
          chuteDir[0] = -bodyV.x / speed;
          chuteDir[1] = -bodyV.y / speed;
          chuteDir[2] = -bodyV.z / speed;
        }
        craft.setChute(1, chuteDir, null, null);
      } else {
        craft.setChute(0);
      }
    }
    if (smoke) {
      const at = craft.group.userData.smokeNozzle;
      const on = Boolean(at) && (p.flags & FLAG_SMOKE) !== 0;
      if (on) {
        craft.group.updateMatrixWorld(true);
        at.getWorldPosition(nozzle);
        vel.set(p.vx, p.vy, p.vz);
      }
      smoke.update(simT, on ? nozzle : null, vel, viewHeight, fov);
    }
  }

  return {
    group: craft.group,
    /* The blur discs, which a peer's wreck hides with its props. */
    discs: craft.discs,
    smoke: smoke ? smoke.group : null,
    key: profileKey(profile),
    airframe: id,
    pose,
    setLabel: tag.set,
    /* Each region's colour as drawn, #rrggbb, for a check; null on a quad. */
    paint() {
      if (!craft.livery) {
        return null;
      }
      return Object.fromEntries(Object.entries(craft.livery.read()).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]));
    },
    dispose() {
      if (undoLook) {
        undoLook();
      }
      craft.group.removeFromParent();
      release(craft.group);
      if (smoke) {
        smoke.group.removeFromParent();
        release(smoke.group);
      }
    },
  };
}

/*
 * A pilot figure, 1.75 m, standing on its feet at the group's origin and
 * facing -z. lookAt(x, y, z) turns the head (and a little of the body) to
 * a world point.
 */
export function buildPilotFigure(figure) {
  const look = FIGURE_LOOKS[Math.max(0, Math.min(FIGURE_COUNT - 1, figure | 0))];
  const group = new THREE.Group();
  group.name = 'pilot-figure';
  const suit = celMaterial({ color: look.suit });
  const cap = celMaterial({ color: look.cap });
  const skin = celMaterial({ color: 0xe0b48f });
  const dark = celMaterial({ color: 0x23262b });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const body = new THREE.Group();
  group.add(body);
  body.add(box(0.14, 0.86, 0.16, dark, -0.1, 0.43, 0));
  body.add(box(0.14, 0.86, 0.16, dark, 0.1, 0.43, 0));
  body.add(box(0.44, 0.6, 0.24, suit, 0, 1.16, 0));
  /* Forearms out in front, holding the transmitter at the chest. */
  const armL = box(0.1, 0.5, 0.1, suit, -0.26, 1.12, -0.08);
  armL.rotation.x = 0.9;
  const armR = box(0.1, 0.5, 0.1, suit, 0.26, 1.12, -0.08);
  armR.rotation.x = 0.9;
  body.add(armL, armR);
  body.add(box(0.26, 0.16, 0.08, dark, 0, 1.02, -0.3));
  const antenna = box(0.015, 0.16, 0.015, dark, 0.1, 1.14, -0.3);
  antenna.rotation.x = -0.4;
  body.add(antenna);
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), skin);
  skull.position.set(0, 0.06, 0);
  skull.castShadow = true;
  head.add(skull);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
  crown.position.set(0, 0.08, 0);
  head.add(crown);
  head.add(box(0.2, 0.02, 0.14, cap, 0, 0.1, -0.13));
  const tag = nameTag(2.25, 2.4);
  group.add(tag.sprite);

  const at = new THREE.Vector3();
  function lookAt(x, y, z) {
    group.updateMatrixWorld(true);
    at.set(x, y, z);
    group.worldToLocal(at);
    at.y -= 1.62;
    const yaw = Math.atan2(-at.x, -at.z);
    const pitch = Math.atan2(at.y, Math.hypot(at.x, at.z));
    /* The body turns a third of the way, the head the rest, up to a
     * shoulder's reach: a person watching a plane go round turns. */
    body.rotation.y = yaw / 3;
    head.rotation.y = yaw - body.rotation.y;
    head.rotation.x = Math.max(-0.6, Math.min(1.2, pitch));
  }

  return {
    group,
    setLabel: tag.set,
    lookAt,
    dispose() {
      group.removeFromParent();
      release(group);
    },
  };
}
