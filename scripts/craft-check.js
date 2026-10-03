/*
 * craft-check.js: the drawn aircraft against the hull that sweeps it, and
 * both against the real machine, for every airframe the shell offers.
 *
 * WHY THIS EXISTS SEPARATELY FROM CHECK 15.
 *
 * tests/verify.js check 15 has asserted since it was written that "the
 * collisions hug the graphics", and it does it well, for the five inch: it
 * finds the body's box and the prop discs' cylinders by their five inch
 * sizes, and it is pinned to a baseline measured at one window size with one
 * course seeded. None of that reaches the whoop, which is drawn by a
 * different builder out of ducts and a bumper hoop and has no cylinder over
 * 50 mm on it. So the second aircraft in the project has never had the one
 * check that would catch a scale error on it.
 *
 * WHAT IT MEASURES, and it is deliberately dumb: every VERTEX of every mesh
 * the model draws, transformed into the craft's own frame, minus the
 * outline hulls, which are back sided shells scaled 1.13 and are paint. A
 * bounding box would do for a slab and lies about a torus, whose box corner
 * is 1.41 of its radius; the vertices are the silhouette itself. Out of
 * them come three numbers: how far the machine reaches from its centre
 * across, how far it reaches up, and how far it reaches down.
 *
 * Those go against three things:
 *
 *   the COLLIDER, src/game/collide.js, which sweeps CRAFT_R across and
 *     [-CRAFT_V_DOWN, +CRAFT_V_UP] vertically and is what a gate, a pole and
 *     a wall are tested against;
 *   the PLANT, src/native/plant.c, whose contact hull rests the craft on the
 *     ground and whose numbers configs/airframes.js snapshots; and
 *   the REAL AIRCRAFT, whose published size is in the comments of the model
 *     and the airframe table: a 220 mm five inch, and a 65 mm whoop
 *     with a 65 mm wheelbase across 82.6 mm of frame.
 *
 * Run it with `npm run check:craft`. It boots the shell once per aircraft,
 * so it costs about half a minute.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The published size of each machine, from outside this repository, and the
 * tolerance each one is held to.
 *
 *   sky1800   an 1800 mm twin boom pusher: the span is the manufacturer's,
 *             and the reach is the wingtip, because the tail, 0.77 m aft,
 *             is only 0.23 m out. src/render/skycraft.js draws it.
 *   cub1400   a 1400 mm Piper J-3 Cub: the span is FMS's, and the reach is
 *             the tip, the tail being 0.6 m aft on the centreline.
 *             src/render/cubcraft.js draws it.
 *   nrj1490   OA Composites' 1490 mm NRJ: the span is Lindinger's, and
 *             the reach is the tip's trailing corner, 96 mm aft of the
 *             CG on the straight trailing edge, 751.2 mm; the rudder's
 *             0.70 m aft is short of it. src/render/dlgcraft.js draws it.
 *   radian2000 a 2000 mm E-flite Radian: the span is E-flite's, and the
 *             reach is the tip's trailing corner, 137 mm aft of the CG,
 *             since the fin's is 0.83 m aft on the centreline.
 *             src/render/glidercraft.js draws it.
 *   bramor2300 the C-Astral Bramor C4EYE: the span is C-Astral's, 230 cm,
 *             and the diagonal reach is the winglet's top trailing corner,
 *             at the half span and 557 mm aft of the CG, so the aircraft
 *             reaches 126 mm further from its centre than its half span.
 *             src/render/bramorcraft.js draws it.
 *   slowstick1180  a 1176 mm GWS Slow Stick, whose tail reaches further
 *             from the CG than its tips do: the rudder's trailing edge is
 *             0.632 m aft, GWS's 954 mm length less the CG's 320 mm, and
 *             the tips 0.588 m out. The axis aligned width this file
 *             measures is the larger of the two doubled, so 1264 mm here
 *             rather than GWS's 1176 mm span, which craft-preview.js holds
 *             to 2 mm as the drawn half span. The reach is the elevator's
 *             outer trailing corner, 0.639 m. src/render/slowstickcraft.js
 *             draws it.
 *   timber1500  a 1555 mm E-flite Turbo Timber Evolution: the span is
 *             E-flite's, and the reach is the drooped tip's trailing
 *             corner, 0.778 m out and 0.180 m aft of the CG.
 *             src/render/timbercraft.js draws it.
 *   timber1500f, cub1400f  the same two on their floats: the span and the
 *             reach are the wings', since the floats stay well inside
 *             them. src/render/floatset.js draws the floats.
 *   bombshell1118  BMJR's 44 in (1118 mm) Buzzard Bombshell, whose tail,
 *             like the Slow Stick's, reaches further from the CG than its
 *             tips: the stabiliser's trailing edge is 0.652 m aft, the
 *             Baby Bombshell plan's 30.75 in less the CG's 6.25 in at
 *             44/42, and the tips 0.559 m out, so the width this file
 *             measures is 1304 mm and BMJR's 1118 mm span is held by
 *             craft-preview.js's half span row. The reach is the
 *             elevator's rounded outer trailing corner, 0.673 m.
 *             src/render/bombshellcraft.js draws it.
 *   kadet1981  SIG's 78 in (1981 mm) Kadet Senior, whose tail also
 *             reaches further from the CG than its tips: the rudder's
 *             trailing edge is 1.108 m aft, SIG's 62 in length less the
 *             CG's 17.4 in and the spinner, and the tips 0.991 m out, so
 *             the width this file measures is 2216 mm and SIG's 1981 mm is
 *             held by craft-preview.js's half span row. The reach is the
 *             elevator's rounded outer trailing corner, 1.168 m.
 *             src/render/kadetcraft.js draws it.
 *   f16878    Freewing's F-16 V3, 878 mm over its tip rails, whose pitot
 *             reaches further from the CG than anything else: 0.710 m
 *             ahead, against the rails' 0.439 m out and the fin's tip
 *             0.596 m aft, so the width this file measures is twice the
 *             pitot's reach, 1420 mm, and Freewing's 878 mm span is held
 *             by craft-preview.js's half span row. src/render/f16craft.js
 *             draws it.
 *   p51d1450  FMS's 1450 mm P-51D Mustang, whose rudder's trailing edge,
 *             0.834 m aft of the CG (the kit manual's side view), reaches
 *             further than its tips, 0.725 m out, so the width this file
 *             measures and the reach are both the rudder's, 1667 mm, and
 *             FMS's 1450 mm is held by craft-preview.js's half span row.
 *             src/render/p51craft.js draws it.
 *   zagi1219  Zagi's 48 in Zagi HP, whose winglets' top trailing corners,
 *             0.2675 m aft of the CG at the tips, reach further than the
 *             half span: the width is Zagi's 1219 mm, the reach 1331 mm.
 *             src/render/zagicraft.js draws it.
 *   tigermoth1803 Great Planes' 71 in Tiger Moth, whose rudder's trailing
 *             edge, 1.070 m behind the CG, reaches further than its tips,
 *             0.902 m out, so the width and the reach this file measures
 *             are both the rudder's, 2139 mm, and the kit's 71 in span is
 *             held by src/render/tigermothcraft.js TIGERMOTH_DIMS.
 *   uglystik1567 RCM's 62 in Das Ugly Stik, whose rudder's trailing edge,
 *             0.884 m behind the CG on the plan (station 50.82 against the
 *             CG's 16.00), reaches further than its tips, 0.784 m out, so
 *             the width and the reach this file measures are both the
 *             rudder's, 1769 mm, and the plan's 61.7 in span is held by
 *             src/render/uglystikcraft.js UGLYSTIK_DIMS.
 *   7inch, 10inch  the combat quads of docs/COMBAT-DRONES.md: a 315 mm and
 *             a 420 mm true X under 7 and 10 inch props, so the span is
 *             the motor's axis offset plus the prop's radius, doubled, and
 *             the sweep the arm plus the radius, doubled. The plant's hull
 *             is fixed and sized to the fullest loadout (docs/COMBAT-DRONES.md
 *             section 2.3), so each is seated with it, the deepest payload
 *             and every accessory, and measured against it: the legs reach
 *             the payload's depth and the packs, straps and GPS the top.
 *             src/render/combatcraft.js draws them.
 *   interceptor  the stretched X of docs/COMBAT-DRONES.md section 1a, motors
 *             120 mm fore and aft and 100 mm across of the CG under 7 inch
 *             props: the width this file measures is the larger of the
 *             two, here fore and aft, (120 + 88.9) mm doubled; the sweep
 *             is the motor diagonal's half plus the radius, doubled; seated
 *             as the other two with its fullest loadout.
 *   striker2500 the Striker of docs/COMBAT-DRONES.md section 7, which
 *             src/render/strikercraft.js draws for the war and the shell
 *             draws about its CG (src/render/craft.js): its nose, 1.546 m
 *             ahead of the CG, reaches further than its 2.5 m span, so the
 *             width this file measures is twice the nose's reach, 3092 mm,
 *             and the reach is a fin's top trailing corner, 1.251 m out
 *             and 0.954 m aft, 1573 mm; the span is held by
 *             scripts/combat-models-check.js.
 *
 * `spanMm` is the AXIS ALIGNED width, two ducts about two motors, which is
 * the figure a manufacturer prints; `sweepMm` is the diagonal reach, which
 * is what a collider sweeps. They are different numbers about one machine
 * and both are checked. `wheelbaseMm` is the motor to motor figure a quad
 * is named for; a wing has none.
 */
const REAL = {
  sky1800: { spanMm: 1800.0, sweepMm: 1800.0, tolMm: 6 },
  cub1400: { spanMm: 1400.0, sweepMm: 1400.0, tolMm: 6 },
  radian2000: { spanMm: 2000.0, sweepMm: 2018.7, tolMm: 6 },
  bramor2300: { spanMm: 2300.0, sweepMm: 2551.0, tolMm: 6 },
  f16878: { spanMm: 1420.0, sweepMm: 1420.0, tolMm: 6 },
  slowstick1180: { spanMm: 1264.0, sweepMm: 1278.1, tolMm: 6 },
  timber1500: { spanMm: 1555.0, sweepMm: 1596.2, tolMm: 6 },
  timber1500f: { spanMm: 1555.0, sweepMm: 1596.2, tolMm: 6 },
  cub1400f: { spanMm: 1400.0, sweepMm: 1400.0, tolMm: 6 },
  bombshell1118: { spanMm: 1304.0, sweepMm: 1346.7, tolMm: 6 },
  kadet1981: { spanMm: 2216.2, sweepMm: 2335.4, tolMm: 6 },
  p51d1450: { spanMm: 1667.2, sweepMm: 1667.2, tolMm: 6 },
  zagi1219: { spanMm: 1219.2, sweepMm: 1331.4, tolMm: 6 },
  uglystik1567: { spanMm: 1768.9, sweepMm: 1768.9, tolMm: 6 },
  nrj1490: { spanMm: 1490.0, sweepMm: 1502.4, tolMm: 6 },
  tigermoth1803: { spanMm: 2139.2, sweepMm: 2139.2, tolMm: 6 },
  '7inch': { spanMm: 400.5, sweepMm: 492.8, tolMm: 6, wheelbaseMm: 315 },
  '10inch': { spanMm: 551.0, sweepMm: 674.0, tolMm: 6, wheelbaseMm: 420 },
  interceptor: { spanMm: 417.8, sweepMm: 490.2, tolMm: 6, wheelbaseMm: 312.4 },
  striker2500: { spanMm: 3092.0, sweepMm: 3146.6, tolMm: 6 },
};

/* Measure the drawn model, in the craft's own frame, from its vertices. */
const MEASURE = `(() => {
  const THREE = window.__three;
  const scene = window.__mapScene();
  let g = null;
  scene.traverse((o) => { if (o.name === 'craft') { g = o; } });
  if (!g) { return { error: 'no craft in the scene' }; }
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let up = -Infinity;
  let down = Infinity;
  let reach = 0;
  let across = 0;
  let verts = 0;
  let meshes = 0;
  /* A pusher's prop turns about a level axis, so where its blades and its
   * disc polygon reach below the hub depends on the phase the frame count
   * has turned it to (src/main.js turns it a step a frame, at rest too).
   * The drawn machine is the prop's whole sweep: measure every extent over
   * a full turn of each 'prop-mount''s spinning children, a degree a step,
   * and put the phase back. A craft without one is measured once. */
  const spinning = [];
  g.traverse((o) => { if (o.name === 'prop-mount') { spinning.push(...o.children); } });
  const phase0 = spinning.map((c) => c.rotation.y);
  const turns = spinning.length ? 360 : 1;
  for (let k = 0; k < turns; k += 1) {
    const first = k === 0;
    spinning.forEach((c, i) => { c.rotation.y = phase0[i] + (k * Math.PI) / 180; });
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.getAttribute) { return; }
      /* An outline hull is a back sided copy scaled 1.13. It is paint and it
       * is not the aircraft: measuring it reports a machine 13 percent big. */
      if (o.material && o.material.userData && o.material.userData.hullColor !== undefined) { return; }
      if (o.visible === false) { return; }
      /* And the antenna is wire, not aircraft. Both models name theirs: it
       * is the tallest thing on either machine, 16 mm over the whoop's
       * camera and 21 mm over the five inch's, and a rigid contact hull that
       * covered it would make a quad bounce off its own aerial. */
      if (o.name === 'antenna' || (o.parent && o.parent.name === 'antenna')) { return; }
      /* Nor is a catapult, which stands under it while it is parked, or
       * the Bramor's parachute: see src/render/bramorcraft.js. */
      let gear = false;
      o.traverseAncestors((p) => { gear = gear || p.name === 'launcher' || p.name === 'chute'; });
      if (gear || o.name === 'chute') { return; }
      const pos = o.geometry.getAttribute('position');
      if (!pos) { return; }
      o.updateMatrixWorld(true);
      m.multiplyMatrices(inv, o.matrixWorld);
      if (first) { meshes += 1; }
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (first) { verts += 1; }
        if (v.y > up) { up = v.y; }
        if (v.y < down) { down = v.y; }
        const r = Math.hypot(v.x, v.z);
        if (r > reach) { reach = r; }
        const a = Math.max(Math.abs(v.x), Math.abs(v.z));
        if (a > across) { across = a; }
      }
    });
  }
  spinning.forEach((c, i) => { c.rotation.y = phase0[i]; });
  const th = window.__craftState().thresholds;
  return {
    up, down, reach, across, verts, meshes,
    worldScale: th.worldScale,
    craftRadius: th.craftRadius,
    craftRadiusTrue: th.craftRadiusTrue,
    craftUpTrue: th.craftUpTrue,
    craftDownTrue: th.craftDownTrue,
  };
})()`;

/*
 * The catapult under a parked aircraft, for one that has one: what the
 * shell draws on the pad before the first shot, measured in the world
 * against the rail's numbers (configs/airframes.js `catapult`), which are
 * what the plant is released from. The rail is the launcher's mesh named
 * 'rail', a box whose length is its own z: its slope, where the CG's foot
 * falls on it and how far that is from the low end. Then the launcher's
 * lowest point against the ground under the CG, and its highest point
 * under the aircraft (inside the hull's plan, in the craft's frame)
 * against the lowest point of the hull that does not turn, which is the
 * aircraft sitting on it. In world units; the caller divides.
 */
const MEASURE_LAUNCHER = `(() => {
  const THREE = window.__three;
  const scene = window.__mapScene();
  let g = null;
  scene.traverse((o) => { if (o.name === 'craft') { g = o; } });
  if (!g) { return { error: 'no craft in the scene' }; }
  let launcher = null;
  g.traverse((o) => { if (o.name === 'launcher') { launcher = o; } });
  if (!launcher) { return { launcher: false }; }
  const rail = launcher.getObjectByName('rail');
  if (!rail) { return { launcher: true, rail: false }; }
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const cg = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const paint = (o) => o.material && o.material.userData && o.material.userData.hullColor !== undefined;
  /* The hull that does not turn, in the craft's frame: its lowest point
   * and its plan. A pusher's blade sweeps past the rail; it is the skid or
   * the belly that sits on it. */
  const plan = new THREE.Box3();
  let belly = Infinity;
  g.traverse((o) => {
    if (!o.isMesh || !o.visible || paint(o) || o.name === 'chute') { return; }
    let skip = false;
    o.traverseAncestors((p) => { skip = skip || ['launcher', 'chute', 'antenna', 'prop-mount'].includes(p.name) || !p.visible; });
    const pos = o.geometry.getAttribute('position');
    if (skip || !pos) { return; }
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      plan.expandByPoint(v);
      if (v.y < belly) { belly = v.y; }
    }
  });
  let low = Infinity;
  let top = -Infinity;
  let tris = 0;
  let draws = 0;
  launcher.traverse((o) => {
    if (!o.isMesh || paint(o)) { return; }
    const pos = o.geometry.getAttribute('position');
    draws += 1;
    tris += (o.geometry.index ? o.geometry.index.count : pos.count) / 3;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      w.copy(v).applyMatrix4(o.matrixWorld);
      if (w.y < low) { low = w.y; }
      v.applyMatrix4(m);
      const under = v.x >= plan.min.x && v.x <= plan.max.x && v.z >= plan.min.z && v.z <= plan.max.z;
      if (under && v.y > top) { top = v.y; }
    }
  });
  rail.geometry.computeBoundingBox();
  const bb = rail.geometry.boundingBox;
  const a = new THREE.Vector3(0, 0, bb.min.z).applyMatrix4(rail.matrixWorld);
  const b = new THREE.Vector3(0, 0, bb.max.z).applyMatrix4(rail.matrixWorld);
  const lo = a.y < b.y ? a : b;
  const hi = a.y < b.y ? b : a;
  const u = hi.clone().sub(lo).normalize();
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
  const gr = window.__ground();
  return {
    launcher: true,
    rail: true,
    visible: launcher.visible,
    railPitchDeg: (Math.asin(u.y) * 180) / Math.PI,
    noseOffRailDeg: (Math.acos(Math.min(1, nose.dot(u))) * 180) / Math.PI,
    releaseToLow: cg.clone().sub(lo).dot(u),
    cgOverGround: cg.y - gr.surf,
    lowOverGround: low - gr.surf,
    top,
    belly,
    tris,
    draws,
  };
})()`;

const rows = [];
let fails = 0;
function report(id, pass, measured, extra = '') {
  rows.push({ id, pass, measured, extra });
  if (!pass) {
    fails += 1;
  }
}
/* How far a drawn launcher may sit from its rail's numbers. The Bramor's
 * catapult, drawn first, is a box rail whose centre line meets the ground
 * 11 mm short of its foot, so its lower corner is 12 mm into it. */
const LAUNCHER_TOL_MM = 20;
const LAUNCHER_TOL_DEG = 0.5;
function near(id, got, want, tolMm, unit = 'mm') {
  const off = Math.abs(got - want);
  report(id, off <= tolMm,
    `${got.toFixed(1)} ${unit}`,
    `against ${want.toFixed(1)}, ${off.toFixed(1)} off, tolerance ${tolMm}`);
}

/*
 * A MISMATCH THAT IS KNOWN, MEASURED AND CANNOT BE FIXED FROM HERE.
 *
 * The five inch's contact hull reaches 45 mm below the CG and the lowest
 * thing the model draws is 30 mm below it, so a parked five inch floats
 * 15 mm: the plant rests the craft on a hull that is deeper than the
 * aircraft on screen. It is plant.c's `hull_hz_down`, which is compiled
 * into dist/sim.wasm, and configs/airframes.js snapshots it precisely so
 * that the collider and the plant agree about where the bottom of the quad
 * is. Changing it means changing the C and rebuilding the module, which
 * needs an Emscripten toolchain this container does not have, and it moves
 * the machine every threshold in tests/ was fitted against. So it is
 * recorded rather than adjusted, here and in PROGRESS.md.
 *
 * PINNED, not excused: the gap is allowed to be what it measured today and
 * no more, so the day somebody rebuilds the module, or the model grows a
 * battery that reaches further down, this says so.
 */
function pinned(id, got, want, pinMm, why) {
  const off = Math.abs(got - want);
  report(id, off <= pinMm + 0.5,
    `${got.toFixed(1)} mm`,
    `against ${want.toFixed(1)}, ${off.toFixed(1)} off, a known ${pinMm.toFixed(1)}: ${why}`);
}

/* A combat quad's fullest loadout: the payload that hangs deepest and
 * every accessory, which is what its fixed hull is sized to. */
function fullest(af) {
  const low = (p) => p.cgOffset_m[2] - p.dims.d / 2;
  const deepest = af.combat.payloads.reduce((a, p) => (low(p) < low(a) ? p : a));
  return { payload: deepest.id, accessories: af.combat.accessories.map((a) => a.id) };
}

function reportLauncher(tag, cat, c, s) {
  report(`${tag}: launcher drawn, with its rail, shown on the pad`, Boolean(c && c.launcher && c.rail && c.visible),
    c ? `launcher ${c.launcher}, rail ${c.rail}, visible ${c.visible}` : 'no answer',
    c && c.launcher ? `${c.draws} draws, ${c.tris} triangles` : '');
  if (!c || !c.rail) {
    return;
  }
  near(`${tag}: rail pitch`, c.railPitchDeg, cat.pitchDeg, LAUNCHER_TOL_DEG, 'deg');
  near(`${tag}: rail along the nose`, c.noseOffRailDeg, 0, LAUNCHER_TOL_DEG, 'deg');
  near(`${tag}: CG over the ground`, (c.cgOverGround / s) * 1000, cat.height * 1000, LAUNCHER_TOL_MM);
  near(`${tag}: release point to the rail's foot`, (c.releaseToLow / s) * 1000, cat.railLength * 1000, LAUNCHER_TOL_MM);
  near(`${tag}: launcher stands on the ground`, (c.lowOverGround / s) * 1000, 0, LAUNCHER_TOL_MM);
  near(`${tag}: aircraft sits on the launcher`, (c.top / s) * 1000, (c.belly / s) * 1000, LAUNCHER_TOL_MM);
}

async function measure(airframeId, propulsion = null) {
  const seated = seatAirframe(
    { airframe: 'interceptor', rates: airframeById('interceptor').rates },
    airframeId,
  );
  const af = airframeById(airframeId);
  if (af.combat) {
    seated.combat = { [af.id]: { ...fullest(af), ...(propulsion ? { propulsion } : {}) } };
  }
  const page = await openPage({
    root,
    width: 960,
    height: 540,
    /* The light world, the Alps, rather than the title's own valley
     * (src/boot.js); the model is measured in the scene either way. */
    url: '/index.html?map=alps',
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(seated)});
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* storage refused */ }`],
  });
  try {
    await page.until('!!window.__boot && window.__boot().frames > 2', 30000);
    /* The aircraft is swapped when the settings are applied, which happens
     * on the first frame; give the model a moment to be built. */
    await page.until("window.__craft().run === " + JSON.stringify(airframeId), 20000);
    /* Into a run, because the title draws the Skyhunter whatever is seated
     * (TITLE_CRAFT in src/main.js) and this measures the seated model. */
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight' && window.__craft().shown === "
      + JSON.stringify(airframeId), 20000);
    await page.sleep(500);
    const got = await page.evaluate(MEASURE);
    if (af.catapult) {
      got.catapult = await page.evaluate(MEASURE_LAUNCHER);
    }
    return got;
  } finally {
    await page.close();
  }
}

async function main() {
  for (const af of AIRFRAMES) {
    const real = REAL[af.id];
    const r = await measure(af.id);
    if (!r || r.error) {
      report(`${af.id}: measured`, false, r ? String(r.error) : 'no answer');
      continue;
    }
    /* The drawn model is built at the world's scale; the aircraft's own
     * metres are what everything else here is in. */
    const s = r.worldScale;
    const drawnReach = (r.reach / s) * 1000;
    const drawnAcross = (r.across / s) * 1000 * 2;
    const drawnUp = (r.up / s) * 1000;
    const drawnDown = (-r.down / s) * 1000;
    const dims = af.dims;

    report(`${af.id}: model measured`, r.verts > 100,
      `${r.verts} vertices over ${r.meshes} meshes`, 'outline hulls excluded');

    /* 1. The drawn machine against the real one. */
    near(`${af.id}: drawn span`, drawnAcross, real.spanMm, real.tolMm);
    near(`${af.id}: drawn sweep`, drawnReach, real.sweepMm / 2, real.tolMm);

    /*
     * 2. The collider against the drawn machine. This is the one that
     * matters in flight: the hull that meets a gate has to be the machine
     * the pilot can see, on every axis.
     */
    if (af.id === 'bramor2300') {
      /*
       * A SWEPT WING'S COLLIDER IS ITS HALF SPAN DISC, AND ITS TIPS REACH
       * PAST IT, as the 1000 mm flying wing's did before it (the rule this
       * replaces). The airframe table gives the Bramor a disc of its half
       * span about the CG, which is what meets a gate; the sweep and the
       * winglets carry their trailing corners 557 mm aft of the CG, 126 mm
       * further from it than the half span. Sweeping the disc out to them
       * would make the aircraft a quarter of a metre wider to the world
       * than it is across its own span. Pinned at what was measured.
       */
      pinned(`${af.id}: swept radius vs drawn`, r.craftRadiusTrue * 1000, drawnReach, 125.5,
        'the collider is the half span disc; the swept tips reach past it');
      near(`${af.id}: hull up vs drawn`, r.craftUpTrue * 1000, drawnUp, real.tolMm);
    } else {
      near(`${af.id}: swept radius vs drawn`, r.craftRadiusTrue * 1000, drawnReach, real.tolMm);
      near(`${af.id}: hull up vs drawn`, r.craftUpTrue * 1000, drawnUp, real.tolMm);
    }
    if (af.id === 'striker2500') {
      /* The Striker parks on its belly skid, 251 mm under the CG, which is
       * the plant's hull; the 30 in pusher's lower blade, drawn as its
       * disc, hangs 0.38 m under the hub, 109 mm lower at the bottom of
       * its sweep. It is a crash part (src/native/crash_parts.h) and a
       * landing with it turning breaks it, as docs/COMBAT-DRONES.md
       * section 7 says. Pinned at what it is. It was pinned at 108.0 from
       * one frame's phase of the turning prop, which read 107.1 to 108.5
       * as the frame count moved it; the sweep MEASURE takes is 109.0
       * whatever the phase. */
      pinned(`${af.id}: hull down vs drawn`, r.craftDownTrue * 1000, drawnDown, 109.0,
        'the pusher\'s lower blade hangs under the skid it parks on');
    } else if (af.fixedWing) {
      /* The Skyhunter's belly skid and the Bramor's belly are the lowest
       * drawn things, and each hull reaches about as far. */
      near(`${af.id}: hull down vs drawn`, r.craftDownTrue * 1000, drawnDown, real.tolMm);
    } else if (af.combat) {
      /* A combat quad's legs are drawn to the hull's depth, which the plant
       * parks it on with or without a payload (docs/COMBAT-DRONES.md
       * section 2.3). */
      near(`${af.id}: hull down vs drawn`, r.craftDownTrue * 1000, drawnDown, real.tolMm);
    } else {
      throw new Error(`craft-check: ${af.id} is a quad with no rule for its hull down`);
    }

    /* 3. And the collider against the plant, through the table both read.
     * A drift here is a craft that rests at one height and collides at
     * another. */
    near(`${af.id}: collider vs airframe table`,
      r.craftRadiusTrue * 1000, (dims.arm + dims.hullR) * 1000, 0.001);
    near(`${af.id}: table up`, r.craftUpTrue * 1000, dims.vHalfUp * 1000, 0.001);
    near(`${af.id}: table down`, r.craftDownTrue * 1000, dims.vHalfDown * 1000, 0.001);

    /*
     * 4. An aircraft shot off a rail stands on its launcher on the pad, and
     * the launcher drawn is the rail the plant is released from: the
     * shell's own parked pose, so a launcher the model lacks, the shell
     * fails to show, or that disagrees with the rail's numbers about where
     * the aircraft leaves it, is caught here. The Bramor's rail is held to
     * the same numbers as every other.
     */
    if (af.catapult) {
      reportLauncher(af.id, af.catapult, r.catapult, s);
      /* Every way it is pushed stands on the same rail: the turbojet
       * Striker hangs its skid 10 mm lower than the piston one. */
      for (const pr of (af.combat?.propulsion ?? []).slice(1)) {
        const rp = await measure(af.id, pr.id);
        reportLauncher(`${af.id}/${pr.id}`, af.catapult, rp && rp.catapult, rp ? rp.worldScale : s);
      }
    }

    /* And the wheelbase a manufacturer prints, which is the arm doubled. */
    if (real.wheelbaseMm) {
      near(`${af.id}: wheelbase`, dims.arm * 2000, real.wheelbaseMm, 0.5);
    }
  }

  const w = Math.max(...rows.map((r) => r.id.length));
  console.log('\ncraft-check: the drawn aircraft, the hull that sweeps it, and the real machine\n');
  for (const r of rows) {
    console.log(`${r.pass ? ' ok  ' : 'FAIL '} ${r.id.padEnd(w)}  ${r.measured.padEnd(26)} ${r.extra}`);
  }
  console.log(`\n${rows.length - fails} of ${rows.length} checks pass\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
