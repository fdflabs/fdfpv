/*
 * ge-derive.js: where each fixed wing's lifting surfaces sit, for the
 * plant's ground effect (plant_wing.c GROUND EFFECT, FixedWingParams
 * ge_wing and ge_tail), read off the drawn model the crash solver already
 * uses (src/native/crash_parts.h): the wing panels' and the stabiliser and
 * elevator's boxes, body frame from the CG. The wing's point is its quarter
 * chord on the table's mean chord (the panels' leading edge less a quarter
 * of FixedWingParams.chord) at the panels' mid height; the tail's is the
 * stabiliser and elevator's quarter chord at their mid height. A swept
 * wing's boxes run from the root's leading edge to the tip's trailing
 * edge, so its point is ESTIMATED; only a table's height and its tail arm
 * matter to the term. A float plane's are its land plane's raised as
 * crash.c raises its parts over the lower CG.
 *
 * It also checks the term against the reports it comes from: Report 738's
 * worked example (flaps up: the image takes 3.3 of the plain wing's 5.8
 * deg at the tail, 0.57) and TM 77 against Report 738's own sigma.
 *
 * With --check it fails when a table that takes the term differs from
 * what it derives. Run with npm run ge:derive.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sigmaOf, tailR } from './lib/groundeffect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const parts = readFileSync(join(root, 'src/native/crash_parts.h'), 'utf8');
const crashC = readFileSync(join(root, 'src/native/crash.c'), 'utf8');
const wingC = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
const check = process.argv.includes('--check');

/* Each part of a PARTS_ table: its kind and its points, a BOX's eight
 * corners or the points drawn. */
function partsOf(name) {
  const m = new RegExp(`static const PartDef PARTS_${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`).exec(parts);
  if (!m) return null;
  const out = [];
  for (const raw of m[1].split(/\{ \.kind = /).slice(1)) {
    const entry = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const kind = /^SIM_PART_(\w+)/.exec(entry)[1];
    const b = /BOX\(([^)]*)\)/.exec(entry);
    let pts = null;
    if (b) {
      const [x0, x1, y0, y1, z0, z1] = b[1].split(',').map((x) => Number(x.trim()));
      pts = [];
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push([x, y, z]);
    } else {
      const p = /\.pts = \{([\s\S]*)\}\s*\}/.exec(entry);
      if (p) pts = [...p[1].matchAll(/\{([^{}]*)\}/g)].map((t) => t[1].split(',').map((x) => Number(x.trim())));
    }
    if (pts && pts.every((q) => q.length === 3 && q.every(Number.isFinite))) out.push({ kind, pts });
  }
  return out;
}

const num = (body, name) => {
  const m = new RegExp(`\\.${name} = (-?[\\d.]+)`).exec(body);
  return m ? Number(m[1]) : 0;
};
const vec = (body, name) => {
  const m = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(body);
  return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((x) => Number(x.trim())) : null;
};

/* A surface's quarter chord on its mean aerodynamic chord and its mid
 * height: its points taken as one trapezoid per side, the root chord where
 * they are nearest the centre line and the tip's where furthest, and
 * c_bar = 2/3 (cr^2 + cr ct + ct^2) / (cr + ct) at y_bar = (cr + 2 ct) /
 * (3 (cr + ct)) of the way out (any text's planform formulae, e.g.
 * Raymer, Aircraft Design, 1992, fig. 7.3). */
function quarterChord(pts) {
  const ay = pts.map((q) => Math.abs(q[1]));
  const yr = Math.min(...ay), yt = Math.max(...ay);
  const at = (yy) => pts.filter((q, i) => Math.abs(ay[i] - yy) < 1e-9).map((q) => q[0]);
  const rx = at(yr), tx = at(yt);
  const rle = Math.max(...rx), cr = rle - Math.min(...rx), tle = Math.max(...tx), ct = tle - Math.min(...tx);
  const f = (cr + 2 * ct) / (3 * (cr + ct));
  const cbar = 2 / 3 * (cr * cr + cr * ct + ct * ct) / (cr + ct);
  const z = pts.reduce((a, q) => a + q[2], 0) / pts.length;
  return [rle + f * (tle - rle) - cbar / 4, 0, z];
}

/* A float plane's parts are its land plane's raised by the CG's drop
 * (crash.c table_floats, its dz). */
function floatsOf(name) {
  const m = new RegExp(`table_floats\\(&T\\[SIM_AIRFRAME_${name}\\], PARTS_(\\w+), COUNT\\(PARTS_\\w+\\),\\s*SIM_AIRFRAME_\\w+, (-?[\\d.]+),`).exec(crashC);
  if (!m) return null;
  const dz = Number(m[2]);
  return partsOf(m[1]).map((p) => ({ kind: p.kind, pts: p.pts.map((q) => [q[0], q[1], q[2] + dz]) }));
}

/* The surfaces' points for a table whose parts are drawn. A biplane's
 * wing panels are its two wings, told apart by their mid heights: the
 * top wing's (ge_wing) over the panels' mean, the bottom's (ge_wing2)
 * under it. */
function derive(name, biplane) {
  const ps = partsOf(name) ?? floatsOf(name);
  if (!ps) return null;
  const panels = ps.filter((p) => p.kind === 'WING');
  const tail = ps.filter((p) => p.kind === 'HSTAB' || p.kind === 'ELEVATOR').flatMap((p) => p.pts);
  if (!panels.length) return null;
  const midZ = (p) => p.pts.reduce((a, q) => a + q[2], 0) / p.pts.length;
  const mean = panels.reduce((a, p) => a + midZ(p), 0) / panels.length;
  const top = biplane ? panels.filter((p) => midZ(p) > mean) : panels;
  const out = { wing: quarterChord(top.flatMap((p) => p.pts)), tail: tail.length ? quarterChord(tail) : [0, 0, 0] };
  if (biplane) out.wing2 = quarterChord(panels.filter((p) => midZ(p) <= mean).flatMap((p) => p.pts));
  return out;
}

const r4 = (x) => Math.round(x * 10000) / 10000;
let bad = 0;
console.log('ge:derive, the lifting surfaces over the CG, m (src/native/crash_parts.h)');
console.log('table                 wing x, z          tail x, z          tail arm   ge');
for (const t of wingC.matchAll(/const FixedWingParams (FW_\w+) = \{([\s\S]*?)\n\};/g)) {
  const [, table, body] = t;
  const biplane = (vec(body, 'bip_w') ?? [0])[0] > 0;
  const d = derive(table.slice(3), biplane);
  const on = /\.ground_effect = 1/.test(body);
  if (!d) { console.log(`${table.padEnd(21)} no drawn parts`); continue; }
  const w = d.wing.map(r4), tl = d.tail.map(r4);
  console.log(`${table.padEnd(21)} ${String(w[0]).padStart(8)} ${String(w[2]).padStart(8)}  ${String(tl[0]).padStart(8)} ${String(tl[2]).padStart(8)}  ${(tl[0] ? r4(w[0] - tl[0]) : 0).toString().padStart(8)}   ${on ? 'on' : '-'}`);
  const w2 = d.wing2 && d.wing2.map(r4);
  if (w2) console.log(`  the bottom wing        ${String(w2[0]).padStart(8)} ${String(w2[2]).padStart(8)}  ${''.padStart(17)}  ${r4(w2[0] - tl[0]).toString().padStart(8)}`);
  if (!on) continue;
  const gw = vec(body, 'ge_wing'), gt = vec(body, 'ge_tail') ?? [0, 0, 0];
  const same = (a, b) => a && a.length === 3 && a.every((x, i) => Math.abs(x - b[i]) < 5e-5);
  /* A tail's term reads the table's own d eps / d alpha, and its share of
   * the lift slope over the wing's own (cl_alpha_wing, or ge_cla_wing on a
   * table that stalls on the whole curve). */
  if (tl[0] < 0 && !(num(body, 'tail_deda') > 0 && (num(body, 'cl_alpha_wing') > 0 || num(body, 'ge_cla_wing') > 0))) {
    bad += 1;
    console.log(`  ${table} takes the term with a tail and no tail_deda, or no cl_alpha_wing or ge_cla_wing`);
  }
  /* The linear tail's moment per rad of its angle is its lift share at
   * its arm; a hi_alpha table's is slip_cm_a / (1 - d eps / d alpha): at
   * small angles the two paths should agree. */
  if (/\.hi_alpha = 1/.test(body) && tl[0] < 0) {
    const lin = (num(body, 'cl_alpha') - num(body, 'cl_alpha_wing')) * tl[0] / num(body, 'chord');
    const hi = num(body, 'slip_cm_a');
    const off = Math.abs(lin / hi - 1);
    console.log(`  the tail's moment per rad: the share at its arm ${lin.toFixed(4)}, slip_cm_a ${hi.toFixed(4)}, ${(100 * off).toFixed(1)} percent apart`);
    if (off > 0.05) { bad += 1; console.log('  FAIL more than 5 percent apart'); }
  }
  if (!same(gw, w) || !same(gt, tl)) {
    bad += 1;
    console.log(`  ${table} has ge_wing ${gw} ge_tail ${gt}, derived { ${w.join(', ')} } { ${tl.join(', ')} }`);
  }
  if (w2 && !same(vec(body, 'ge_wing2'), w2)) {
    bad += 1;
    console.log(`  ${table} has ge_wing2 ${vec(body, 'ge_wing2')}, derived { ${w2.join(', ')} }`);
  }
}

/* The term against its sources. */
const ex = tailR(0.68, 0.02, 0.2);
console.log(`Report 738's example, flaps up (x 0.68, m 0.02, z 0.2 semispans): the image takes ${ex.toFixed(3)} of the downwash, the report 3.3 / 5.8 = 0.569`);
const exOk = Math.abs(ex - 0.569) < 0.06;
for (const hb of [0.05, 0.1, 0.25, 0.5]) {
  console.log(`  h/b ${hb}: TM 77 sigma ${sigmaOf(hb).toFixed(3)}, Report 738's exp(-2.48 (2h/b)^0.768) ${Math.exp(-2.48 * Math.pow(2 * hb, 0.768)).toFixed(3)}`);
}
if (!exOk) { bad += 1; console.log('  FAIL the tail term is off Report 738 by more than 0.06'); }
if (check && bad) { console.log(`${bad} disagree`); process.exit(1); }
