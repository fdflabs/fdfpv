/*
 * filmroom.js: the operations room a film's handheld shots stand in
 * (docs/campaign/interior/INTROS.md section 0: "a few handheld shots of
 * monitors, a table, at most a hand"): a closed, dim box with a folding
 * table, three portable monitors, the BOARD's big screen on the back
 * wall, cables, a plastic chair's back and a coffee cup. Nothing in it is
 * a person, so no shot of it can show a face (PLAN.md 9 B).
 *
 * buildRoom() returns { group, screens: [{ canvas, texture, role }], dispose }:
 * the group's origin is the floor's centre, the board wall at z = -2
 * (its screen's centre at (0, 1.5, -1.98)), the table along x at z = -0.9
 * at 0.74 m, the player's seat about (0, 1.1, 0.9). Each screen's canvas
 * is drawn by the player every frame ('board' the big one and the first
 * monitor; 'feed' and 'data' the other two) and its texture flagged.
 *
 * Every material is unlit and fogless: the room's dim light and its
 * monitors' glow are its colours, and the sun and fog of the map it is
 * set over (high over Pista Cero, src/share/interior/films/common.js)
 * never reach inside it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

const W = 6;
const H = 2.6;
const BACK = -2;
const FRONT = 2.5;

export function buildRoom() {
  const group = new THREE.Group();
  group.name = 'film-room';
  const owned = [];
  const mat = (color) => {
    const m = new THREE.MeshBasicMaterial({ color, fog: false });
    owned.push(m);
    return m;
  };
  const box = (w, h, d, color, x, y, z, parent = group) => {
    const g = new THREE.BoxGeometry(w, h, d);
    owned.push(g);
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /* The shell, seen from inside: dark walls, a darker floor. */
  const shellGeo = new THREE.BoxGeometry(W, H, FRONT - BACK);
  owned.push(shellGeo);
  const shellMats = [0x1b2024, 0x1b2024, 0x111417, 0x0b0d0f, 0x161a1d, 0x14181b].map((c) => {
    const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, fog: false });
    owned.push(m);
    return m;
  });
  const shell = new THREE.Mesh(shellGeo, shellMats);
  shell.position.set(0, H / 2, (FRONT + BACK) / 2);
  group.add(shell);

  /* A screen: a canvas on a plane, glowing (unlit, full colour). */
  const screens = [];
  const screen = (role, cw, ch, w, h, x, y, z, ry = 0) => {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    owned.push(tex);
    const g = new THREE.PlaneGeometry(w, h);
    owned.push(g);
    const m = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
    owned.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    screens.push({ role, canvas: c, texture: tex, mesh });
  };

  /* The BOARD on the back wall, in a bezel. */
  box(2.56, 1.5, 0.05, 0x050607, 0, 1.5, BACK + 0.01);
  screen('board', 1024, 576, 2.4, 1.35, 0, 1.5, BACK + 0.04);

  /* The folding table: a top, four legs. */
  box(2.4, 0.03, 0.75, 0x6f7275, 0, 0.74, -0.9);
  for (const [x, z] of [[-1.15, -1.22], [1.15, -1.22], [-1.15, -0.58], [1.15, -0.58]]) {
    box(0.03, 0.73, 0.03, 0x2a2c2e, x, 0.365, z);
  }

  /* Three portable monitors on stands, turned a little to the seat. */
  const roles = ['board', 'feed', 'data'];
  [-0.78, 0, 0.78].forEach((x, k) => {
    const ry = -x * 0.25;
    box(0.06, 0.16, 0.06, 0x222426, x, 0.83, -1.1);
    const holder = new THREE.Group();
    holder.position.set(x, 1.08, -1.1);
    holder.rotation.y = ry;
    group.add(holder);
    box(0.62, 0.4, 0.03, 0x0c0d0e, 0, 0, 0, holder);
    const before = screens.length;
    screen(roles[k], 512, 320, 0.56, 0.35, 0, 0, 0.018);
    const s = screens[before];
    group.remove(s.mesh);
    holder.add(s.mesh);
    s.mesh.position.set(0, 0, 0.018);
    s.mesh.rotation.y = 0;
  });

  /* Cables from each monitor down the table's back edge to the floor. */
  const cableMat = mat(0x0a0a0b);
  for (const [x, bend] of [[-0.78, -0.2], [0, 0.15], [0.78, 0.3]]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.9, -1.14),
      new THREE.Vector3(x + bend * 0.3, 0.76, -1.26),
      new THREE.Vector3(x + bend, 0.4, -1.3),
      new THREE.Vector3(x + bend * 1.4, 0.02, -1.0),
      new THREE.Vector3(x + bend * 2, 0.01, -0.4),
    ]);
    const g = new THREE.TubeGeometry(curve, 24, 0.007, 5, false);
    owned.push(g);
    group.add(new THREE.Mesh(g, cableMat));
  }

  /* A plastic chair's back between the seat and the table, a cup. */
  box(0.46, 0.4, 0.04, 0x2b3a46, 0.42, 0.78, -0.25);
  box(0.03, 0.42, 0.03, 0x1e2830, 0.21, 0.42, -0.25);
  box(0.03, 0.42, 0.03, 0x1e2830, 0.63, 0.42, -0.25);
  const cupGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.1, 18);
  owned.push(cupGeo);
  const cup = new THREE.Mesh(cupGeo, mat(0xd9d4c8));
  cup.position.set(0.5, 0.805, -0.72);
  group.add(cup);
  const coffeeGeo = new THREE.CircleGeometry(0.038, 18);
  owned.push(coffeeGeo);
  const coffee = new THREE.Mesh(coffeeGeo, mat(0x2a1a10));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(0.5, 0.851, -0.72);
  group.add(coffee);
  /* A clipboard and a radio on the table: nothing glamorous. */
  box(0.22, 0.012, 0.3, 0xb9b3a4, -0.4, 0.762, -0.7);
  box(0.07, 0.16, 0.04, 0x1a1b1c, -1.0, 0.835, -0.75);

  return {
    group,
    screens,
    dispose() {
      for (const o of owned) {
        o.dispose();
      }
    },
  };
}
