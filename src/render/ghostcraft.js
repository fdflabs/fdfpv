/*
 * ghostcraft.js: a recorded lap's craft drawn as a ghost: the airframe
 * the pilot flew, in translucent mint, with a name tag over it.
 *
 * The model comes from the same builder table the shell flies with
 * (craft.js), in its light variant, so the ghost of a lap is the machine
 * that set it. Every mesh then wears one of two shared translucent
 * materials, the body's or the spinning discs', drawn after the opaque
 * world with depth writes off, so the panels never cut holes in each
 * other or in the scenery. The blades are taken out altogether and their
 * geometry freed: a ghost is always flying, and hidden rotors would sit on
 * the GPU all session drawing nothing. The model's own materials are freed
 * too, so nothing it compiled stays with the cel clock.
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
import { DEFAULT_AIRFRAME } from '../../configs/airframes.js';

const MINT = 0x7dffb4;
const MINT_CSS = '#7dffb4';

/* Opacity of each part at full presence. The discs stay faint, as on the
 * flown craft, so the outline reads as an airframe rather than a coin. */
const FULL = { body: 0.40, disc: 0.10, tag: 0.88 };

/* Draw order: after the opaque world, and the tag after the ghost. */
const GHOST_ORDER = 2;
const TAG_ORDER = 3;

/* The tag texture, and the most characters it shows. */
const TAG_W = 512;
const TAG_H = 96;
const TAG_MAX_CHARS = 32;

function ghostMaterial(opacity) {
  return new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity, depthWrite: false, fog: true });
}

/* Detaches every rotor and returns the geometries they held. */
function pullRotors(blades) {
  const geometries = new Set();
  for (const rotor of blades) {
    rotor.traverse((part) => {
      if (part.geometry) {
        geometries.add(part.geometry);
      }
    });
    rotor.removeFromParent();
  }
  return geometries;
}

/*
 * The name tag: a sprite over the airframe, sized as a caption, which a
 * sprite being world sized turns into a mint spark at distance, the
 * locator a chase wants. Its canvas is redrawn only when the text changes,
 * an ink shadow under the mint so it reads over bright sky and pale field
 * markings alike.
 */
function nameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W;
  canvas.height = TAG_H;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: FULL.tag, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 0.34, 0);
  sprite.scale.set(1.5, 0.28, 1);
  sprite.renderOrder = TAG_ORDER;
  let shown = '';
  function draw(text) {
    const next = String(text || '').slice(0, TAG_MAX_CHARS);
    if (next === shown) {
      return;
    }
    shown = next;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, TAG_W, TAG_H);
    if (next) {
      ctx.font = '600 52px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(12, 18, 14, 0.85)';
      ctx.fillText(next, TAG_W / 2 + 3, TAG_H / 2 + 3);
      ctx.fillStyle = MINT_CSS;
      ctx.fillText(next, TAG_W / 2, TAG_H / 2);
    }
    sprite.visible = next !== '';
    texture.needsUpdate = true;
  }
  return { sprite, material, draw };
}

/*
 * Returns { group, setLabel, setPresence }. setPresence takes 0 to 1 and
 * scales every opacity together, which is how the shell fades a ghost in
 * at the line, out at its finish and across a recorded crash; at zero the
 * whole group is hidden, so a parked ghost costs no draws. It starts at
 * zero.
 */
export function buildGhostCraft(airframeId = DEFAULT_AIRFRAME) {
  const craft = craftBuilderFor(airframeId)({ name: 'ghost-craft', lite: true, fog: true, worldScale: true });
  const { group } = craft;
  const body = ghostMaterial(FULL.body);
  const disc = ghostMaterial(FULL.disc);

  const rotorGeometry = pullRotors(craft.blades);
  const discs = new Set(craft.discs);
  const replaced = new Set();
  group.traverse((part) => {
    if (!part.isMesh) {
      return;
    }
    replaced.add(part.material);
    part.material = discs.has(part) ? disc : body;
    part.castShadow = false;
    part.receiveShadow = false;
    part.renderOrder = GHOST_ORDER;
  });
  replaced.forEach((m) => m.dispose());
  rotorGeometry.forEach((g) => g.dispose());

  const tag = nameTag();
  group.add(tag.sprite);

  function setPresence(a) {
    const k = Math.max(0, Math.min(1, a));
    group.visible = k > 0.004;
    body.opacity = FULL.body * k;
    disc.opacity = FULL.disc * k;
    tag.material.opacity = FULL.tag * k;
  }
  setPresence(0);

  return { group, setLabel: tag.draw, setPresence };
}
