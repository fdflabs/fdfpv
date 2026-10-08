/*
 * carousel3d.js: the aircraft picker's models, drawn into the shell's own
 * canvas.
 *
 * NO SECOND WEBGL CONTEXT. src/render/showcase.js is one, created and torn
 * down with the Quad screen; the picker is opened from the front page,
 * from a menu row and in flight, and a context per opening would upload
 * every model into a fresh context each time and leave the old one's
 * dispose listeners on the cached objects. So it borrows the shell's
 * renderer, which lives for the session, and draws after the world has:
 *
 *   1. a scrim over the whole canvas, which is what dims the world behind
 *      the picker (a DOM scrim would sit OVER the models, which are in the
 *      canvas under the DOM);
 *   2. the models, into a small multisampled target of the stage's size,
 *      because the default framebuffer has no depth buffer (see
 *      buildShell) and a model drawn without one shows its inside;
 *   3. that target into the stage's rectangle, premultiplied, so the models
 *      stand on the dimmed world with nothing drawn round them.
 *
 * The renderer's state is put back exactly as it was found. The picker's
 * scene is its own and holds only what this file builds.
 *
 * MODELS ARE BUILT ONCE, from the builders the shell flies
 * (src/render/craft.js craftBuilderFor), and kept for the session. Each is
 * scaled to one size on the stage: a 65 mm whoop and a 2.3 m Bramor are
 * the same size here and their real sizes are in words underneath. Each
 * wears the pilot's paint (src/render/livery.js), repainted in place when
 * it changes, and the hangar (src/ui/hangar.js) shows its unsaved choices
 * on the same model through repaint().
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
import { craftBuilderFor } from './craft.js';
import { dressLivery, liveryFor } from './livery.js';
import { paintTargets, readDecals } from './decals.js';
import { readFinish, readFinishUniforms, readWear } from './finish.js';
import { animateParts, dressParts } from './partsfit.js';
import { powerOption } from '../../configs/power.js';
import { buildHangarEnv, createHangarRig } from './hangarstage.js';
import { createExploder } from './hangar-exploded.js';
import { dressTuning, undressTuning } from './hangar-tuning3d.js';
import { slotScale, slotX } from '../ui/carousel.js';

/* Vertical field of view, degrees: long, so the models read as objects on
 * a table rather than through a wide lens. */
const FOV = 24;
/* The camera looks down on the row by this much, radians: enough to see
 * the top of a wing, which is most of what tells one plane from another. */
const ELEVATION = 0.5;
/* How far back a neighbour stands per place from the centre, in model
 * radii, along the camera's line of sight so the row stays on one line
 * across the stage however steeply the camera looks down. */
const DEPTH = 0.9;
/* The centre model's footprint radius, which every model is scaled to one
 * of, as a share of the stage's half width and at most of its half height. */
const FILL_WIDTH = 0.56;
/* On a stage taller than it is wide, a phone held upright, the neighbours
 * are close enough to touch the centre one as it turns broadside, so it is
 * drawn smaller there. */
const FILL_WIDTH_NARROW = 0.44;
const FILL_HEIGHT = 0.8;
/* Where every model is turned to when it is not the centre one: three
 * quarters on, nose toward the camera and to its left. Radians of yaw,
 * the nose being -z. */
const REST_YAW = Math.PI - 0.62;
/* The centre model's turn, radians a second, and how fast one that has
 * left the centre turns back to the rest pose. */
const TURN_RATE = (2 * Math.PI) / 14;
const RETURN_RATE = 3;
/* How dark the world goes behind the picker. Over the whole page, darker
 * toward the edges so the eye goes to the middle. In flight, dark only
 * across the band the picker takes and light above it, where the pilot is
 * still looking at where they are: `from` is the band's top edge in the
 * canvas's own 0 to 1 height, bottom up. */
const SCRIM = { centre: 0.66, edge: 0.86 };
/* The hangar's plane: its footprint radius as a share of the stage's half
 * width, and at most of its half height. Larger than the picker's centre
 * model, since it is the only one. */
const HANGAR_FILL = 0.62;
const HANGAR_FILL_HEIGHT = 0.9;
const SCRIM_COMPACT = { below: 0.8, above: 0.18 };

const BLIT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/* The target holds linear, premultiplied colour; the canvas wants sRGB.
 * Converted here by hand rather than left to the renderer's output space,
 * because a map's post chain owns that setting and does its own
 * conversion. */
const BLIT_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec4 c = texture2D(map, vUv);
  vec3 straight = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  gl_FragColor = vec4(toSrgb(clamp(straight, 0.0, 1.0)) * c.a, c.a);
}`;

const SCRIM_FRAG = `
uniform float compact;
uniform float centre;
uniform float edge;
uniform float below;
uniform float above;
uniform float from;
varying vec2 vUv;
void main() {
  float r = length((vUv - 0.5) * vec2(1.3, 1.8));
  float page = mix(centre, edge, smoothstep(0.25, 0.95, r));
  float band = mix(below, above, smoothstep(from - 0.12, from + 0.06, vUv.y));
  float alpha = mix(page, band, compact);
  gl_FragColor = vec4(vec3(0.035, 0.05, 0.04) * alpha, alpha);
}`;

/* The meshes a model is SEEN as: visible all the way up its parents. The
 * Bramor's launcher and parachute are in its group and hidden here, and
 * must not make it look three times its size. */
function visibleBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    for (let p = o; p; p = p.parent) {
      if (!p.visible) {
        return;
      }
    }
    if (!o.geometry.boundingBox) {
      o.geometry.computeBoundingBox();
    }
    one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(one);
  });
  return box;
}

/* The lowest drawn point of a craft in its own frame, y, m: what stands on
 * the hangar's floor once parts hang under it. */
function lowestY(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const one = new THREE.Box3();
  let low = Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    for (let p = o; p && p !== root; p = p.parent) {
      if (!p.visible) {
        return;
      }
    }
    if (!o.geometry.boundingBox) {
      o.geometry.computeBoundingBox();
    }
    one.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    low = Math.min(low, one.min.y);
  });
  return low;
}

export function createCarouselStage(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.layers.enableAll();
  scene.add(new THREE.HemisphereLight(0xf0e6d0, 0x2a3828, 0.95));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.3);
  sun.position.set(-0.5, 1, 0.8);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9db3c8, 1.1);
  rim.position.set(0.6, 0.4, -1);
  scene.add(rim);

  /* A soft shadow under each model, the one thing that puts it on a floor. */
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(2, 2);
  shadowGeo.rotateX(-Math.PI / 2);

  const models = new Map();
  /* The look the hangar is previewing on an airframe as the pilot has it,
   * until it is put back (repaint with none): every model of it built
   * meanwhile, a combat aircraft's on another loadout too, is built in it. */
  const previews = new Map();
  /* The model last drawn for each airframe id, for a check. */
  const lastDrawn = new Map();
  /* The model last drawn for each key (modelFor), whatever its loadout:
   * a combat aircraft has one a loadout, so the key alone does not find
   * it in `models`. What the hangar aims a decal at and the checks read. */
  const lastByKey = new Map();
  /* A model by its key: the airframe id for the aircraft as the pilot has
   * it, or a picker card's own key (a My Hangar build, src/ui/builds.js)
   * for one drawn in a fit of its own, a model of its own. A combat
   * quad's loadout (configs/combat.js combatChoice) is built into its
   * drawing, the Striker's engine above all, so each loadout handed is a
   * model of its own too, kept like the rest. */
  function modelFor(id, key = id, combat = null) {
    const at = combat ? `${key}#${JSON.stringify(combat)}` : key;
    let m = models.get(at);
    if (m) {
      return m;
    }
    /* In the hangar's preview, or the saved paint. */
    const preview = key === id ? previews.get(id) : undefined;
    const kit = (preview ?? liveryFor(id))?.kit ?? undefined;
    const craft = dressParts(dressLivery(craftBuilderFor(id)({ name: `pick-${key}`, fog: false, combat: combat ?? undefined, kit }), id, preview ?? undefined), id);
    if (craft.launcher) {
      craft.launcher.visible = false;
    }
    if (craft.setChute) {
      craft.setChute(0);
    }
    /* The prop discs are the blur of a turning prop; on a parked model they
     * read as a grey plate over the blades. */
    for (const d of craft.discs || []) {
      d.visible = false;
    }
    const box = visibleBox(craft.group);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    /* The FOOTPRINT's radius, what the model sweeps as it turns: a plane
     * and a quad are both flat, and a radius that counted their height
     * would draw them thin. */
    const radius = Math.max(1e-3, 0.5 * Math.hypot(size.x, size.z));
    /* Centred on its box and scaled to a footprint radius of one. */
    const unit = new THREE.Group();
    unit.scale.setScalar(1 / radius);
    craft.group.position.sub(centre);
    unit.add(craft.group);
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, fog: false,
    }));
    shadow.scale.set(0.5 * size.x / radius + 0.15, 1, 0.5 * size.z / radius + 0.15);
    /* Under the model and a little way below it, so it reads as a model
     * held up over a floor rather than a smudge round its edges. */
    shadow.position.y = -0.5 * size.y / radius - 0.3;
    const turn = new THREE.Group();
    turn.add(unit);
    const holder = new THREE.Group();
    holder.add(turn, shadow);
    holder.visible = false;
    scene.add(holder);
    m = {
      holder,
      turn,
      shadow,
      yaw: REST_YAW,
      craft,
      /* For the hangar, in the unit frame: half the model's height, which
       * is where its lowest point stands under its centre, and its nose's
       * and tail's z. */
      halfY: 0.5 * size.y / radius,
      /* Half its span in the unit frame, what reaches lowest as it rolls
       * over on the hangar's Flip. */
      halfX: 0.5 * size.x / radius,
      /* Metres to the unit frame's one, for the hangar's exploded view. */
      radius,
      noseZ: (box.min.z - centre.z) / radius,
      tailZ: (box.max.z - centre.z) / radius,
      /* Where its drawing was centred and scaled, and the half height it
       * was built with, for a part hung under it later (fitParts). */
      centreY: centre.y,
      radius,
      builtHalfY: 0.5 * size.y / radius,
      dressKey: null,
      /* The look a picker card last dressed it in (dressCard), null for
       * the airframe's own from src/render/livery.js. */
      look: null,
      /* The airframe it is as the pilot has it, or null for a build's. */
      own: key === id ? id : null,
    };
    models.set(at, m);
    return m;
  }

  /* A picker card's look on its model: one it brings (`it.look`) or, when
   * it brings none, the airframe's own, dressed again only when that
   * changes. The look is compared as an object, so the picker hands the
   * same one every frame until it means another (src/ui/carousel.js
   * relist). */
  function dressCard(m, it) {
    const look = it.look ?? null;
    if (m.look !== look) {
      dressLivery(m.craft, it.id, look ?? undefined);
      m.look = look;
    }
  }

  /* A model in what it is fitted with: the saved parts, or in the hangar
   * the Parts tab's choice before it is saved (`want`, frame().hangar.tabs
   * .parts). A pod under a plane that stands on its belly reaches the
   * floor, so the half height follows the lowest point. */
  function fitParts(m, id, want = null, hangar = false) {
    const fit = want && want.id === id
      ? { entry: want.entry, option: want.option ? powerOption(id, want.option) : null }
      : undefined;
    dressParts(m.craft, id, fit, { hangar });
    const key = m.craft.partsDress ? m.craft.partsDress.key : '';
    if (key !== m.dressKey) {
      m.dressKey = key;
      const low = lowestY(m.craft.group);
      m.halfY = Math.max(m.builtHalfY, (m.centreY - low) / m.radius);
    }
  }

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scrimMat = new THREE.ShaderMaterial({
    uniforms: {
      compact: { value: 0 },
      centre: { value: SCRIM.centre },
      edge: { value: SCRIM.edge },
      below: { value: SCRIM_COMPACT.below },
      above: { value: SCRIM_COMPACT.above },
      from: { value: 0.5 },
    },
    vertexShader: BLIT_VERT,
    fragmentShader: SCRIM_FRAG,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
  });
  const scrimScene = new THREE.Scene();
  scrimScene.add(new THREE.Mesh(quadGeo, scrimMat));
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null } },
    vertexShader: BLIT_VERT,
    fragmentShader: BLIT_FRAG,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(quadGeo, blitMat));

  /* The hangar's set and camera (src/render/hangarstage.js), in this scene,
   * shown only while the hangar is. */
  const set = buildHangarEnv();
  scene.add(set.group);
  const rig = createHangarRig();
  const exploder = createExploder();

  let target = null;
  let lastMs = 0;
  const stats = { ms: 0, calls: 0, width: 0, height: 0, models: 0, camera: null, exploded: null };
  const buf = new THREE.Vector2();
  const saveViewport = new THREE.Vector4();
  const saveScissor = new THREE.Vector4();
  const saveClear = new THREE.Color();

  function release() {
    if (target) {
      target.dispose();
      target = null;
    }
    for (const m of models.values()) {
      m.holder.visible = false;
    }
  }

  /*
   * One frame of the picker, after the world, from what src/ui/carousel.js
   * frame() said: null draws nothing and frees the target.
   */
  function draw(view) {
    if (!view || !(view.rect.width > 4) || !(view.rect.height > 4)) {
      release();
      lastMs = 0;
      return;
    }
    const t0 = performance.now();
    const dt = lastMs ? Math.min(0.05, (t0 - lastMs) / 1000) : 0;
    lastMs = t0;
    const callsBefore = renderer.info.render.calls;
    if (view.hangar) {
      drawHangar(view, dt, t0, callsBefore);
      return;
    }
    set.group.visible = false;
    stats.camera = null;
    stats.exploded = null;

    /* The renderer's own units, which are CSS pixels: buildShell sizes it
     * to the window. Its viewport counts up from the bottom. */
    renderer.getSize(buf);
    const r = view.rect;
    /* The target is drawn at the device's own density, up to 2, rather than
     * at the world's render scale: the models are the subject here. */
    const dens = Math.min(window.devicePixelRatio || 1, 2);
    const tw = Math.max(1, Math.round(r.width * dens));
    const th = Math.max(1, Math.round(r.height * dens));
    if (!target) {
      target = new THREE.WebGLRenderTarget(tw, th, { samples: 4, depthBuffer: true, stencilBuffer: false });
    } else if (target.width !== tw || target.height !== th) {
      target.setSize(tw, th);
    }

    const aspect = tw / th;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    /* Far enough back that the centre model fills FILL_WIDTH of the width,
     * or FILL_HEIGHT of the height on a tall stage. */
    const fill = aspect < 1.3 ? FILL_WIDTH_NARROW : FILL_WIDTH;
    const dist = Math.max(1 / (fill * aspect * tanHalf), 1 / (FILL_HEIGHT * tanHalf));
    camera.position.set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
    camera.lookAt(0, 0, 0);

    for (const m of models.values()) {
      m.holder.visible = false;
    }
    for (const it of view.items) {
      const m = modelFor(it.id, it.key ?? it.id, it.combat ?? null);
      lastDrawn.set(it.id, m);
      lastByKey.set(it.key ?? it.id, m);
      dressCard(m, it);
      fitParts(m, it.id, it.fit ?? null);
      const a = Math.abs(it.d);
      const back = Math.min(a, 2.5) * DEPTH;
      /* Put the model where slotX says on screen at its own depth. */
      const halfWidth = (dist + back) * tanHalf * aspect;
      m.holder.position.set(slotX(it.d) * halfWidth, -Math.sin(ELEVATION) * back, -Math.cos(ELEVATION) * back);
      m.holder.scale.setScalar(slotScale(it.d));
      m.holder.visible = true;
      exploder.rest(m);
      if (a < 0.5) {
        m.yaw += (view.hold ? 0 : TURN_RATE * dt) + (view.turn ?? 0);
      } else {
        let off = (m.yaw - REST_YAW) % (2 * Math.PI);
        if (off > Math.PI) {
          off -= 2 * Math.PI;
        } else if (off < -Math.PI) {
          off += 2 * Math.PI;
        }
        m.yaw = REST_YAW + off * Math.max(0, 1 - RETURN_RATE * dt);
      }
      m.turn.rotation.set(0, m.yaw, 0);
    }

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevScissorTest = renderer.getScissorTest();
    renderer.getViewport(saveViewport);
    renderer.getScissor(saveScissor);
    renderer.getClearColor(saveClear);
    const prevAlpha = renderer.getClearAlpha();

    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, buf.x, buf.y);
    scrimMat.uniforms.compact.value = view.compact ? 1 : 0;
    scrimMat.uniforms.from.value = 1 - view.top / Math.max(1, buf.y);
    renderer.render(scrimScene, ortho);
    blitMat.uniforms.map.value = target.texture;
    renderer.setViewport(r.left, buf.y - r.top - r.height, r.width, r.height);
    renderer.render(blitScene, ortho);

    renderer.setRenderTarget(prevTarget);
    renderer.setViewport(saveViewport);
    renderer.setScissor(saveScissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.setClearColor(saveClear, prevAlpha);
    renderer.autoClear = prevAutoClear;

    stats.ms = performance.now() - t0;
    stats.calls = renderer.info.render.calls - callsBefore;
    stats.width = tw;
    stats.height = th;
    stats.models = models.size;
  }

  /*
   * THE HANGAR (src/ui/hangar.js): one model on the set, over the whole
   * canvas, opaque, so the world behind is not drawn at all (src/main.js
   * skips it while the hangar is up). The model sits in the stage's
   * rectangle by a lens shift of the projection, so the set runs on under
   * the side panel. Two passes: the backdrop and the model mirrored in the
   * floor, then the floor over that reflection, the model and its rings.
   */
  const cam = new THREE.Vector3();
  const aim = new THREE.Vector3();
  function drawHangar(view, dt, t0, callsBefore) {
    renderer.getSize(buf);
    const r = view.rect;
    const dens = Math.min(window.devicePixelRatio || 1, 2);
    const tw = Math.max(1, Math.round(buf.x * dens));
    const th = Math.max(1, Math.round(buf.y * dens));
    if (!target) {
      target = new THREE.WebGLRenderTarget(tw, th, { samples: 4, depthBuffer: true, stencilBuffer: false });
    } else if (target.width !== tw || target.height !== th) {
      target.setSize(tw, th);
    }
    /* The Loadout tab's choice before it is saved, as the Parts tab's. */
    const loadout = view.hangar.tabs && view.hangar.tabs.loadout;
    const m = modelFor(view.items[0].id, view.items[0].id, loadout && loadout.id === view.items[0].id ? loadout.combat : null);
    lastDrawn.set(view.items[0].id, m);
    lastByKey.set(view.items[0].id, m);
    fitParts(m, view.items[0].id, view.hangar.tabs ? view.hangar.tabs.parts : null, true);
    animateParts(m.craft, t0 / 1000);
    for (const other of models.values()) {
      other.holder.visible = false;
    }
    m.holder.visible = true;
    set.group.visible = true;
    const k = rig.update(dt, { ...view.hangar, prop: exploder.propAlong(m) }, view.turn ?? 0);
    stats.camera = {
      focus: view.hangar.focus, yaw: k.yaw, elev: k.elev, zoom: k.zoom, along: k.along, up: k.up, roll: k.roll, moves: k.moves, lift: k.lift, target: k.target,
    };
    stats.exploded = exploder.update(m, view.hangar.power ?? null, dt);
    /* The Tuning tab's marks, surfaces and prop (src/render/
     * hangar-tuning3d.js), on for this draw only. */
    dressTuning(m.craft, view.hangar.tabs && view.hangar.tabs.tuning, dt);
    const floorY = -m.halfY;
    set.place(floorY, k.reveal, k.pulse);
    /* Set down from a hand's height as it opens. */
    const drop = 0.35 * (1 - k.reveal);
    /* Rolled over on Flip it is lifted so its lowest point, a wing tip
     * half way round, stays on the floor; the turn is about its own nose
     * to tail axis, under the yaw. */
    const rise = Math.abs(Math.cos(k.roll)) * m.halfY + Math.abs(Math.sin(k.roll)) * m.halfX - m.halfY;
    const hold = drop + rise;
    m.holder.position.set(0, hold, 0);
    m.holder.scale.setScalar(k.pop * (0.94 + 0.06 * k.reveal));
    m.yaw = k.yaw;
    m.turn.rotation.set(0, k.yaw, k.roll);
    const shadowY = m.shadow.position.y;
    m.shadow.position.y = floorY + 0.004 - hold;

    const aspect = buf.x / buf.y;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const sw = r.width / buf.x;
    const sh = r.height / buf.y;
    const dist = k.zoom * Math.max(1 / (HANGAR_FILL * tanHalf * aspect * sw), 1 / (HANGAR_FILL_HEIGHT * tanHalf * sh));
    const tz = k.along < 0 ? -k.along * m.noseZ : k.along * m.tailZ;
    aim.set(tz * Math.sin(k.yaw), k.up * m.halfY + hold, tz * Math.cos(k.yaw));
    cam.set(0, Math.sin(k.elev) * dist, Math.cos(k.elev) * dist).add(aim);
    camera.position.copy(cam);
    camera.lookAt(aim);
    /* The lens shift: the stage's middle is the picture's middle. */
    const cx = ((r.left + r.width / 2) / buf.x) * 2 - 1;
    const cy = 1 - ((r.top + r.height / 2) / buf.y) * 2;
    camera.projectionMatrix.elements[8] = -cx;
    camera.projectionMatrix.elements[9] = -cy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevScissorTest = renderer.getScissorTest();
    renderer.getViewport(saveViewport);
    renderer.getScissor(saveScissor);
    renderer.getClearColor(saveClear);
    const prevAlpha = renderer.getClearAlpha();

    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    /* The reflection: the backdrop, and the model turned over the floor. */
    set.floorSet.visible = false;
    m.shadow.visible = false;
    m.holder.position.y = 2 * floorY - hold;
    m.holder.scale.y = -m.holder.scale.y;
    renderer.render(scene, camera);
    m.holder.position.y = hold;
    m.holder.scale.y = -m.holder.scale.y;
    set.floorSet.visible = true;
    m.shadow.visible = true;
    set.backdrop.visible = false;
    renderer.clear(false, true, false);
    renderer.render(scene, camera);
    set.backdrop.visible = true;
    m.shadow.position.y = shadowY;
    set.group.visible = false;
    undressTuning(m.craft);

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, buf.x, buf.y);
    blitMat.uniforms.map.value = target.texture;
    renderer.render(blitScene, ortho);

    renderer.setRenderTarget(prevTarget);
    renderer.setViewport(saveViewport);
    renderer.setScissor(saveScissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.setClearColor(saveClear, prevAlpha);
    renderer.autoClear = prevAutoClear;

    stats.ms = performance.now() - t0;
    stats.calls = renderer.info.render.calls - callsBefore;
    stats.width = tw;
    stats.height = th;
    stats.models = models.size;
  }

  /* Paint an airframe as the pilot has it again, every model of it (one
   * a loadout on a combat aircraft): in `look` (src/render/livery.js) for
   * a preview, or in what the pilot has saved. A model built later is
   * built in the same. */
  function repaint(id, look = null) {
    if (look) {
      previews.set(id, look);
    } else {
      previews.delete(id);
    }
    for (const m of models.values()) {
      if (m.own === id) {
        dressLivery(m.craft, id, look ?? undefined);
        m.look = null;
      }
    }
  }

  /*
   * Where a point on the screen lands on the hangar's model, for placing a
   * decal: the point and the skin's outward normal there in the model's
   * own frame (its craft group's, metres), or null off the model. Read
   * against the camera and the pose of the last hangar frame drawn.
   */
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const ndc = new THREE.Vector2();
  function pick(id, clientX, clientY) {
    const m = lastByKey.get(id);
    if (!m || !m.holder.visible) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
    ray.setFromCamera(ndc, camera);
    const shown = (o) => {
      for (let p = o; p; p = p.parent) {
        if (!p.visible) {
          return false;
        }
      }
      return true;
    };
    const hit = ray.intersectObjects(paintTargets(m.craft), false).find((h) => h.face && shown(h.object));
    if (!hit) {
      return null;
    }
    const g = m.craft.group;
    const toGroup = g.matrixWorld.clone().invert();
    const p = hit.point.clone().applyMatrix4(toGroup);
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(ray.ray.direction) > 0) {
      n.negate();
    }
    n.transformDirection(toGroup);
    /* The paint region the face is in, and whether it looks down, the
     * same test the underside's shader makes (src/render/finish.js), for
     * the workshop's click to paint; null on a part no region owns. */
    const mat = hit.object.material;
    const owner = m.craft.livery
      ? Object.entries(m.craft.livery.materials()).find(([, mats]) => mats.includes(mat))
      : null;
    return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], region: owner ? owner[0] : null, under: n.y < -0.1 };
  }

  /* The exploded part under client pixels on the hangar's model, or
   * null (src/render/hangar-exploded.js partAt). */
  function pickPart(id, clientX, clientY) {
    const m = lastByKey.get(id);
    if (!m || !m.holder.visible) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
    ray.setFromCamera(ndc, camera);
    return exploder.partAt(m, ray);
  }

  /* A model's region colours as #rrggbb, for a check; null if not built.
   * `id` is its key: an airframe id, or a build's card key. */
  function paint(id) {
    const m = lastByKey.get(id);
    if (!m || !m.craft.livery) {
      return null;
    }
    return Object.fromEntries(Object.entries(m.craft.livery.read()).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]));
  }

  /* A model's finishes and decals, for a check; null if not built. */
  function look(id) {
    const m = lastByKey.get(id);
    return m ? { finishes: readFinish(m.craft), decals: readDecals(m.craft), wear: readWear(m.craft), uniforms: readFinishUniforms(m.craft) } : null;
  }

  /* What a model is fitted with (src/render/partsfit.js), for a check. */
  function fitted(id) {
    const m = lastByKey.get(id);
    return m ? m.craft.group.userData.partsFit ?? null : null;
  }

  /* The loadout the model last drawn for an airframe was built on, its
   * drawing's own record ({ propulsion, antenna } on the Striker), for a
   * check; null for one never drawn or with no loadout. */
  function combat(id) {
    const c = lastDrawn.has(id) ? lastDrawn.get(id).craft.combat : null;
    return c ? { propulsion: c.propulsion ?? null, antenna: c.antenna ?? null } : null;
  }

  return { draw, repaint, paint, pick, pickPart, look, fitted, combat, stats: () => ({ ...stats }) };
}
