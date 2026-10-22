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
 * surfaces, the folding prop, the chute, and the
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { craftBuilderFor } from './craft.js';
import { joinPeerHulls, paletteFixed, peerFarModel } from './combatcraft.js';
import { addNavLights } from './navlights.js';
import { dressLivery } from './livery.js';
import { cancelDecals, dressDecalsLater, readDecals } from './decals.js';
import { dressParts } from './partsfit.js';
import { celMaterial } from './celmat.js';
import { createSmoke } from './smoke.js';
import { THERMAL, thermalHide } from './thermal.js';
import { sensorHide } from './sensorview.js';
import { airframeById, currentAirframeId } from '../../configs/airframes.js';
import { liveryKey, lookFor, normaliseEntry, paintable } from '../../configs/liveries.js';
import { unpackEntry } from '../../configs/paint.js';
import { PROPS, normalisePlane } from '../../configs/hangar-parts.js';
import { FIGURE_COUNT, FLAG_CHUTE, FLAG_QUAD, FLAG_SMOKE } from '../share/roomwire.js';

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

/*
 * The pieces of one rigid part of a figure, each [geometry, entry, x, y,
 * z, turn about x], as one palette mesh (celmat.js palette) of
 * `colours`: one draw and one shadow caster where each piece was a mesh
 * of its own. A piece only moved keeps its normals bit for bit; a turned
 * one has them turned here, not by its matrix in the shader.
 */
function paletteMesh(pieces, colours) {
  const geos = pieces.map(([g, k, x, y, z, turn = 0]) => {
    if (turn) {
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(turn).setPosition(x, y, z));
    } else {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        pos.setXYZ(i, pos.getX(i) + x, pos.getY(i) + y, pos.getZ(i) + z);
      }
    }
    g.setAttribute('aCelKey', new THREE.BufferAttribute(new Uint8Array(g.attributes.position.count).fill(k), 1));
    return g;
  });
  const geo = mergeGeometries(geos, false);
  for (const g of geos) {
    g.dispose();
  }
  const mesh = new THREE.Mesh(geo, celMaterial({ palette: colours.map((color) => ({ color })) }));
  mesh.castShadow = true;
  return mesh;
}

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
  /* Drawn, never inked (src/render/post.js, Layers). On layer 0 the ink
   * prepass drew it in its own material, a quad square to the group and
   * not to the camera, writing depth and no normal: whatever stood behind
   * the tag's 2 m rectangle lost its ink, and a room drew it once more a
   * pilot. */
  sprite.layers.set(1);
  /* Nor is it in a thermal picture: a sprite's shader has none of the
   * thermal chunks (src/render/thermal.js), so the IR inset drew the
   * name's colours as temperatures. */
  thermalHide(material);
  /* Nor in a sensor's own colour picture (src/render/sensorview.js). */
  sensorHide(material);
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
    /* A long one ("name: in the hangar") is made smaller to fit, never cut. */
    const wide = ctx.measureText(text).width;
    if (wide > canvas.width - 8) {
      ctx.font = `600 ${Math.floor((52 * (canvas.width - 8)) / wide)}px system-ui, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(12, 14, 18, 0.85)';
    ctx.fillText(text, canvas.width / 2 + 3, canvas.height / 2 + 3);
    ctx.fillStyle = TAG_COLOUR;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    sprite.visible = Boolean(text);
    texture.needsUpdate = true;
  }
  return { sprite, set, texture, get: () => text };
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

/*
 * A peer smaller on screen than this share of its view's height is drawn
 * as its far model (combatcraft.js peerFarModel): its fixed parts, lens,
 * motors and rotors as one mesh, the rotors standing still. 1 % is 9 px
 * of a 900 px view, a 7 inch's props 4 px across: too small for a turning
 * blade to show. Measured (in page A/B against the near model, 2026-10-14,
 * docs/PERF.md, A full room under the contract): the far model drew 0 to
 * 6 pixels differently at 1 % and under, and at most 139 pixels, by at
 * most 4 levels, at 10 %, its props held still in both. A full room's
 * seven peers at 23 to 104 m in a 90 degree view are 0.19 to 0.87 %.
 */
const PEER_FAR_SHARE = 0.01;

/*
 * The choice between a peer's models, made for each camera as three
 * draws with it (the view, the sensor's inset, a mirror): three calls
 * update(camera) on an object marked isLOD as it walks the scene, before
 * what comes after it, so it is the group's first child. Far, a thermal
 * draw (renderThermal, THERMAL.env[0] set) takes the cold far mesh and
 * the motors, every other draw the one mesh. The shadow map is drawn with
 * the view's choice. group.userData.wreckHold(true) keeps the near model,
 * which a wreck cuts (src/render/wreck.js), until false.
 */
function farSwitch(group, model, extent) {
  const lod = new THREE.Object3D();
  lod.name = 'peer-lod';
  lod.isLOD = true;
  lod.autoUpdate = true;
  let held = false;
  const at = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const show = (far, thermal) => {
    model.look.visible = far && !thermal;
    model.cold.visible = far && thermal;
    for (const m of model.near) {
      m.visible = !far;
    }
    for (const m of model.heat) {
      m.visible = !far || thermal;
    }
  };
  lod.update = (camera) => {
    let far = false;
    if (!held && camera.isPerspectiveCamera) {
      at.setFromMatrixPosition(group.matrixWorld);
      eye.setFromMatrixPosition(camera.matrixWorld);
      const view = (2 * at.distanceTo(eye) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / camera.zoom;
      far = extent < PEER_FAR_SHARE * view;
    }
    show(far, THERMAL.env[0] > 0.5);
  };
  group.userData.wreckHold = (on) => {
    held = on;
    if (on) {
      show(false, false);
    }
  };
  group.add(lod);
  group.children.unshift(group.children.pop());
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
  /* A peer on an old tab can still fly an aircraft this build no longer
   * has: it is drawn as that aircraft's successor, a plane for a plane. */
  const id = airframeById(currentAirframeId(profile.airframe)).id;
  /* The peer's visual kit (configs/kits.js) is built into the drawing,
   * so it is read before the build; profileKey already rebuilds on a new
   * livery, which carries it. */
  const paint = paintable(id) ? lookFor(id, normaliseEntry(liveryKey(id), unpackEntry(profile.livery).entry)) : null;
  /* mergeFixed: a combat quad's parts that never move on a peer drawn as
   * one mesh a material (src/render/combatcraft.js); the other builders
   * have no such option and draw as they always did. */
  const craft = craftBuilderFor(id)({
    name: 'peer-craft', fog: true, worldScale: true, kit: paint ? paint.kit : undefined, lights: paint ? paint.lights : undefined, mergeFixed: true,
  });
  if (paint) {
    /* The colours at once, the layers over the next frames
     * (dressDecalsLater), so a full livery joining is no long frame. */
    dressLivery(craft, id, { ...paint, decals: [] });
    addNavLights(craft, paint.lights);
  }
  /* The props, counted before the discs are joined: one disc each. */
  const rotors = Math.min(4, craft.discs.length);
  /* A combat quad's fixed parts as a few palette meshes, in the colours
   * and finishes just put on and before the layers take their targets
   * (src/render/combatcraft.js paletteFixed), then its inks and its blur
   * discs (joinPeerHulls: a joined disc is the four in one, not turned).
   * The Striker carries a combat block too, but its parts are its own
   * and its surfaces move, so only a buildCombatDrone craft, the one with
   * a frame, is joined. */
  const joined = Boolean(craft.combat && craft.combat.frame);
  if (joined) {
    paletteFixed(craft);
    craft.discs = [joinPeerHulls(craft)];
  }
  /* Before the layers take their targets, which it is not one of. */
  const model = joined ? peerFarModel(craft) : null;
  if (paint && paint.decals.length) {
    dressDecalsLater(craft, paint.decals);
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
  /* The model's largest dimension, metres, measured once before the tag
   * goes on: how big it stands on screen is what the peer marks
   * (src/ui/peermarks.js) judge by. */
  const size = new THREE.Box3().setFromObject(craft.group).getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z) || 1;
  if (model) {
    farSwitch(craft.group, model, extent);
  }
  const tag = nameTag(1.3, 2.2);
  craft.group.add(tag.sprite);
  const quad = !airframeById(id).fixedWing;

  let smokeOn = false;
  const nozzle = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const chuteDir = [0, 1, 0];
  const bodyV = new THREE.Vector3();
  const qInv = new THREE.Quaternion();

  /* The moving parts from a sample `p`: the props turned by `spinK` of
   * a live frame's turn. */
  function drive(p, spinK) {
    const speeds = (p.flags & FLAG_QUAD) ? [p.c0, p.c1, p.c2, p.c3] : [p.motor, p.motor, p.motor, p.motor];
    for (let m = 0; m < rotors; m += 1) {
      /* The wire's rad/s, turned back into the rpm this spin was tuned
       * on (60 / 2 pi). */
      const spin = (speeds[m] * 9.549e-4 + (speeds[m] > 0 ? 0.10 : 0)) * spinK;
      if (!joined) {
        craft.discs[m].rotation.y += spin;
      }
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
  }

  /*
   * Put the aircraft at a drawn pose (src/game/peer.js) with the moving
   * parts from the newest sample `p`. simT is the sim clock the smoke's
   * puffs are timed on, dt the frame's seconds.
   */
  function pose(drawn, p, dt, simT, viewHeight, fov) {
    craft.group.position.set(drawn.px, drawn.py, drawn.pz);
    craft.group.quaternion.set(drawn.qx, drawn.qy, drawn.qz, drawn.qw);
    drive(p, 1);
    /* The kit's LEDs and strobes, run on this page's sim clock (the wire
     * carries no clock of the pilot's, so a peer's chase is not in step
     * with their own screen). The wire has no stick or pack either, so
     * a peer's throttle pattern sits at half and its battery one solid
     * (docs/KITS.md section 4). */
    if (craft.group.userData.setLights) {
      craft.group.userData.setLights(simT * 1000, 0.5, 1);
    }
    smokeOn = false;
    if (smoke) {
      const at = craft.group.userData.smokeNozzle;
      smokeOn = Boolean(at) && (p.flags & FLAG_SMOKE) !== 0;
      if (smokeOn) {
        craft.group.updateMatrixWorld(true);
        at.getWorldPosition(nozzle);
        vel.set(p.vx, p.vy, p.vz);
      }
      smoke.update(simT, smokeOn ? nozzle : null, vel, viewHeight, fov);
    }
  }

  /* A recorded frame, for the crash cam's replay (src/replay/peers.js):
   * the pose as it was drawn and the moving parts as they were, the props
   * turned by spinK. Its smoke is fed by the replay, which owns that
   * clock. */
  function replay(drawn, p, spinK) {
    craft.group.position.set(drawn.px, drawn.py, drawn.pz);
    craft.group.quaternion.set(drawn.qx, drawn.qy, drawn.qz, drawn.qw);
    drive(p, spinK);
  }

  return {
    group: craft.group,
    /* The blur discs, which a peer's wreck hides with its props. */
    discs: craft.discs,
    smoke: smoke ? smoke.group : null,
    key: profileKey(profile),
    airframe: id,
    extent,
    pose,
    replay,
    /* What the last pose drew, for the crash cam's recorder: the
     * retracts, 0 down to 1 up, for the clip's PEER.gear column (no kept
     * aircraft has retracts, so always down), and the smoke's nozzle
     * (world) while it trails, else null. */
    gear: () => 0,
    smokeAt: () => (smokeOn ? nozzle : null),
    /* The trail itself (src/render/smoke.js), or null without the add on. */
    trail: smoke,
    setLabel: tag.set,
    label: tag.get,
    /* Each region's colour as drawn, #rrggbb, for a check; null on a quad. */
    paint() {
      if (!craft.livery) {
        return null;
      }
      return Object.fromEntries(Object.entries(craft.livery.read()).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]));
    },
    /* The livery's layers as drawn (src/render/decals.js readDecals), for
     * a check. */
    decals: () => readDecals(craft),
    dispose() {
      cancelDecals(craft);
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

/* m: one stride, two steps, of a person 1.75 m tall walking: a step of
 * 0.41 of stature, 0.72 m, the usual rule of thumb for a comfortable
 * pace. ESTIMATED: drawn, not simulated. */
const STRIDE_M = 2 * 0.41 * 1.75;
/* rad: how far a leg swings fore and aft of straight at a walk's 1.4 m/s,
 * and the most at a run, ESTIMATED from a step that long under a 0.86 m
 * leg (asin(0.36 / 0.86) is 0.43). */
const SWING_WALK = 0.43;
const SWING_MOST = 0.7;
const WALK_MPS = 1.4;
/* s for the swing to grow or settle, about a step. */
const SWING_S = 0.4;

/*
 * A pilot figure, 1.75 m, standing on its feet at the group's origin and
 * facing -z. lookAt(x, y, z) turns the head (and a little of the body) to
 * a world point. stride(metres, dt) walks it that far this frame (0 to
 * stand: the legs settle under it), the legs swinging from the hips, a
 * stride every STRIDE_M. setBodyVisible(false) leaves the name alone, for
 * a pilot gone inside a building.
 */
export function buildPilotFigure(figure) {
  const look = FIGURE_LOOKS[Math.max(0, Math.min(FIGURE_COUNT - 1, figure | 0))];
  const group = new THREE.Group();
  group.name = 'pilot-figure';
  const cap = celMaterial({ color: look.cap });
  const dark = celMaterial({ color: 0x23262b });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const body = new THREE.Group();
  group.add(body);
  /* Each leg hangs from its hip, so it swings there. */
  const leg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.86, 0);
    hip.add(box(0.14, 0.86, 0.16, dark, 0, -0.43, 0));
    body.add(hip);
    return hip;
  };
  const legL = leg(-0.1);
  const legR = leg(0.1);
  /* The torso, the forearms out in front holding the transmitter at the
   * chest, and its antenna: one piece, in the suit and the dark. */
  body.add(paletteMesh([
    [new THREE.BoxGeometry(0.44, 0.6, 0.24), 0, 0, 1.16, 0],
    [new THREE.BoxGeometry(0.1, 0.5, 0.1), 0, -0.26, 1.12, -0.08, 0.9],
    [new THREE.BoxGeometry(0.1, 0.5, 0.1), 0, 0.26, 1.12, -0.08, 0.9],
    [new THREE.BoxGeometry(0.26, 0.16, 0.08), 1, 0, 1.02, -0.3],
    [new THREE.BoxGeometry(0.015, 0.16, 0.015), 1, 0.1, 1.14, -0.3, -0.4],
  ], [look.suit, 0x23262b]));
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  body.add(head);
  /* The face and the cap's peak cast a shadow; the crown never did. */
  head.add(paletteMesh([
    [new THREE.SphereGeometry(0.12, 12, 8), 0, 0, 0.06, 0],
    [new THREE.BoxGeometry(0.2, 0.02, 0.14), 1, 0, 0.1, -0.13],
  ], [0xe0b48f, look.cap]));
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
  crown.position.set(0, 0.08, 0);
  head.add(crown);
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

  let phase = 0;
  let swing = 0;
  function stride(metres, dt) {
    const speed = dt > 0 ? metres / dt : 0;
    const want = metres > 0 ? Math.min(SWING_MOST, (SWING_WALK * speed) / WALK_MPS) : 0;
    swing += (want - swing) * Math.min(1, dt / SWING_S);
    phase = (phase + (2 * Math.PI * metres) / STRIDE_M) % (2 * Math.PI);
    /* Standing, the legs come together at the next pass under the body. */
    if (metres === 0 && swing < 0.01) {
      swing = 0;
      phase = 0;
    }
    legL.rotation.x = swing * Math.sin(phase);
    legR.rotation.x = -legL.rotation.x;
    /* The body is highest over a straight leg, twice a stride. */
    body.position.y = 0.02 * (swing / SWING_WALK) * (Math.abs(Math.cos(phase)) - 1);
    if (metres > 0) {
      body.rotation.y = 0;
      head.rotation.set(0, 0, 0);
    }
  }

  return {
    group,
    setLabel: tag.set,
    label: tag.get,
    lookAt,
    stride,
    swing: () => swing,
    setBodyVisible(on) {
      body.visible = on;
    },
    bodyVisible: () => body.visible,
    dispose() {
      group.removeFromParent();
      release(group);
    },
  };
}
