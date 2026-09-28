/*
 * crown.js: the Ace's crown in Catch the Ace! (docs/TAG-PLAN.md decision
 * 6). A gold crown drawn over the Ace's aircraft on every screen, the same
 * size on screen near and far, and seen through hills and trees: the one
 * aircraft everybody is hunting must never be lost behind a ridge.
 *
 * It is a sprite in the scene, not a child of the aircraft, so it stays
 * upright over an Ace flying inverted: the shell puts it at the aircraft's
 * position each frame (at). Nothing here touches the flight.
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

const GOLD = '#ffc933';
const EDGE = '#5a3a00';
/* Its height as a share of the view's height, whatever the distance. */
const SCREEN_SIZE = 0.06;
/* How far over the aircraft's centre it stands, metres: over the name tag
 * src/render/peers.js hangs 1.3 m up, 0.4 m tall. The crown is drawn
 * wholly above that point, a third of its own height clear, so it never
 * covers the name however far away the tag has shrunk. */
const ABOVE_M = 1.6;

function drawCrown(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.82);
  ctx.lineTo(w * 0.06, h * 0.28);
  ctx.lineTo(w * 0.3, h * 0.52);
  ctx.lineTo(w * 0.5, h * 0.14);
  ctx.lineTo(w * 0.7, h * 0.52);
  ctx.lineTo(w * 0.94, h * 0.28);
  ctx.lineTo(w * 0.88, h * 0.82);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = w * 0.045;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = EDGE;
  for (const x of [0.06, 0.5, 0.94]) {
    ctx.beginPath();
    ctx.arc(w * x, h * (x === 0.5 ? 0.14 : 0.28), w * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(w * 0.12, h * 0.7, w * 0.76, h * 0.06);
}

/* { sprite, at(position), show(on), dispose } */
export function createCrown() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  drawCrown(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SCREEN_SIZE * (128 / 96), SCREEN_SIZE, 1);
  sprite.center.set(0.5, -0.3);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return {
    sprite,
    at(p) {
      sprite.position.set(p.x, p.y + ABOVE_M, p.z);
    },
    show(on) {
      sprite.visible = Boolean(on);
    },
    dispose() {
      sprite.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}
