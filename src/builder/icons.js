/*
 * icons.js: a picture of every piece, drawn from the piece itself.
 *
 * The hotbar and the inventory show each piece as the mesh the builder
 * places, so the icon cannot drift from the gate: each is built the way
 * the builder builds it (the caller's `make`), drawn once into a small
 * target on the shell's own renderer from three quarters in front and a
 * little above, read back and kept as a data URL for the life of the page.
 * A few milliseconds a piece, once, the first time building starts.
 *
 * A render target is drawn without the shell's tone mapping and output
 * encoding (three applies both only to the screen), so the read back is
 * linear light: it is encoded to sRGB here, and its alpha, which the
 * multisample resolve leaves premultiplied at the edges, divided out.
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

/* The icon's side, px, drawn at twice that and halved for its edges. */
const SIZE = 96;
const DRAW = SIZE * 2;
/* Where the camera looks from, relative to the piece: in front of its
 * opening (+z, the side it is flown from), to its right and above. */
const VIEW = new THREE.Vector3(0.95, 0.55, 1.7).normalize();
const FOV = 28;

/* How much of the picture's half width the piece reaches to. */
const FILL = 0.9;

const cache = new Map();
const corner = new THREE.Vector3();

function aimAt(camera, sphere, dist) {
  camera.position.copy(sphere.center).addScaledVector(VIEW, dist);
  camera.near = Math.max(0.01, dist - sphere.radius * 2);
  camera.far = dist + sphere.radius * 2;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/* The start gate is a gate, and at icon size its green ring is a pixel:
 * the same green disc and pennant its number badge wears in the valley
 * (buildmode.js badgeMat), in the icon's corner. */
function startMark(g) {
  g.beginPath();
  g.arc(SIZE - 17, 17, 14, 0, Math.PI * 2);
  g.fillStyle = '#1f9d55';
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = '#f3ead4';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.fillRect(SIZE - 23, 8, 2.5, 18);
  g.beginPath();
  g.moveTo(SIZE - 20.5, 8);
  g.lineTo(SIZE - 9, 12.5);
  g.lineTo(SIZE - 20.5, 17);
  g.closePath();
  g.fill();
}

/* The two pylon pieces are one mesh: an arrow past the cone on the side
 * it is flown past tells them apart. */
function sideMark(g, side) {
  const s = side === 'left' ? -1 : 1;
  const x = SIZE / 2 + s * 30;
  g.beginPath();
  g.moveTo(x, SIZE - 30);
  g.lineTo(x - 8, SIZE - 16);
  g.lineTo(x + 8, SIZE - 16);
  g.closePath();
  g.fillStyle = '#ffd45c';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = '#141c16';
  g.stroke();
}

function encode(c) {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - 0.055;
}

/*
 * The data URL for every piece in `pieces`, built with `make(piece)`, which
 * hands back { group, hide } (the parts that are light rather than
 * structure, to leave out) and `dispose(made)` frees. Pieces drawn once
 * are not drawn again.
 */
export function pieceIcons(renderer, pieces, make, dispose) {
  const todo = pieces.filter((p) => !cache.has(p.id));
  if (todo.length) {
    drawAll(renderer, todo, make, dispose);
  }
  return new Map(pieces.map((p) => [p.id, cache.get(p.id)]));
}

function drawAll(renderer, pieces, make, dispose) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a4a3c, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 500);
  const target = new THREE.WebGLRenderTarget(DRAW, DRAW, { samples: 4 });
  const px = new Uint8Array(DRAW * DRAW * 4);
  const canvas = document.createElement('canvas');
  canvas.width = DRAW;
  canvas.height = DRAW;
  const ctx = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = SIZE;
  small.height = SIZE;
  const sctx = small.getContext('2d');
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();

  const prevTarget = renderer.getRenderTarget();
  const prevAlpha = renderer.getClearAlpha();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const shadow = renderer.shadowMap;
  const prevAuto = shadow.autoUpdate;
  const prevNeeds = shadow.needsUpdate;
  /* The frame's shadow maps are the sun's for the pilot's camera; this
   * pass must not redraw them (see pick.js, the same guard). */
  shadow.autoUpdate = false;
  shadow.needsUpdate = false;
  try {
    for (const piece of pieces) {
      const made = make(piece);
      for (const part of made.hide) {
        part.visible = false;
      }
      scene.add(made.group);
      made.group.updateMatrixWorld(true);
      /* Framed on what is drawn: a gate's scoring pane and glow reach well
       * past its frame and would shrink it in its own icon. */
      box.makeEmpty();
      made.group.traverseVisible((o) => {
        if (o.isMesh) {
          box.expandByObject(o, true);
        }
      });
      box.getBoundingSphere(sphere);
      /* Framed on the sphere first, then pulled in until the box's corners
       * fill FILL of the picture: a tall thin tower in a sphere's frame is
       * a sliver in the middle of its slot. */
      let dist = sphere.radius / Math.sin((FOV * Math.PI) / 360);
      aimAt(camera, sphere, dist);
      let reach = 0;
      for (let k = 0; k < 8; k += 1) {
        corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera);
        reach = Math.max(reach, Math.abs(corner.x), Math.abs(corner.y));
      }
      dist *= Math.max(0.35, reach / FILL);
      aimAt(camera, sphere, dist);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, DRAW, DRAW, px);
      scene.remove(made.group);
      dispose(made);

      const img = ctx.createImageData(DRAW, DRAW);
      for (let y = 0; y < DRAW; y += 1) {
        /* GL rows run bottom up. */
        const src = (DRAW - 1 - y) * DRAW * 4;
        const dst = y * DRAW * 4;
        for (let x = 0; x < DRAW * 4; x += 4) {
          const a = px[src + x + 3] / 255;
          const k = a > 0 ? 1 / a : 0;
          img.data[dst + x] = Math.round(255 * encode((px[src + x] / 255) * k));
          img.data[dst + x + 1] = Math.round(255 * encode((px[src + x + 1] / 255) * k));
          img.data[dst + x + 2] = Math.round(255 * encode((px[src + x + 2] / 255) * k));
          img.data[dst + x + 3] = px[src + x + 3];
        }
      }
      ctx.putImageData(img, 0, 0);
      sctx.clearRect(0, 0, SIZE, SIZE);
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, SIZE, SIZE);
      if (piece.start) {
        startMark(sctx);
      }
      if (piece.passSide) {
        sideMark(sctx, piece.passSide);
      }
      cache.set(piece.id, small.toDataURL('image/png'));
    }
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    shadow.autoUpdate = prevAuto;
    shadow.needsUpdate = prevNeeds;
    target.dispose();
  }
}
