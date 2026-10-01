/*
 * wire-check.js: every overhead line is a wire a craft crashes into where
 * it is drawn, and not a metre clear of it.
 *
 * Itaipu is the only map with power lines (src/maps/itaipu/town/power.js:
 * 97 lines, 474 towers). The Alps' and swiss2's telegraph poles carry no
 * wire, and Yellowstone has none. On Itaipu it lays the lines out as the
 * map does (power.js layOut, on the war's heightfield for the ground,
 * itaipu-height.bin), takes four spans of the kinds there are (a 500 kV
 * quad bundle, a 765 kV one, a 66 kV single conductor and an earth wire),
 * a chord of each 80 m and more from its towers, and:
 *
 *   counts      the chords, the conductors drawn (drawnWires), the most
 *               chords within the shell's WIRE_REACH of any point on a
 *               wire, which must fit the plant's WIRES_MAX, and that the
 *               module holds WIRES_MAX and refuses one more
 *   damage on   flies a five inch, a Skyhunter, a Cub and an F-16 square
 *               across the chord into the drawn conductor (the CG's own
 *               path found by flying it once with no wire), with the
 *               plant told of the chords near it as the shell tells it
 *               (crashworld.js nearestWires, sim_wire_add): a damage event
 *               on the wire surface, its point within the bundle's radius
 *               of a drawn conductor, and something broken; flown again
 *               a metre clear of the wire's outside (the craft's own hull
 *               included), nothing met at all; and the hit flown twice is
 *               the same trace to the bit
 *   damage off  the host's sweep (collide.js Colliders.hit) along the same
 *               path meets the chord as a `wire`, and a metre clear meets
 *               nothing
 *
 *   node scripts/wire-check.js        exit 1 on any failure
 *
 * It needs the Itaipu data folder (FDFPV_ITAIPU_DATA, by default
 * ~/Desktop/fdfpv-itaipu-data) for osm/power.json, as town-check does.
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

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { Rig } from './lib/crash-scenarios.js';
import { DAMAGE_FLAGS, SURFACES, WIRES_MAX } from '../configs/parts.js';
import { Colliders, KINDS } from '../src/game/collide.js';
import { nearestWires } from '../src/game/crashworld.js';
import { layOut, drawnWires } from '../src/maps/itaipu/town/power.js';
import { loadHeight } from '../edge/rooms/warhunt.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const cfg = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* src/main.js's: the chords declared to the plant are those within this. */
const WIRE_REACH = 40;
/* Where the craft starts, metres short of the wire, and how long it flies. */
const RUN_IN = 10;
const FLY_MS = 1500;
/* A hit's point is the wire's: within the bundle's radius of a drawn
 * conductor, and a few millimetres for the step's travel at 60 m/s past
 * the depth the plant lets a part into it. */
const AT_TOL = 0.08;
/* A metre clear of the wire's outside. */
const CLEAR = 1;
const AIRCRAFT = [
  { id: 0, name: 'five inch', speed: 12, quad: true },
  { id: 3, name: 'Skyhunter', speed: 16 },
  { id: 4, name: 'Cub', speed: 14 },
  { id: 16, name: 'F-16', speed: 60 },
];

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const floor = loadHeight(readFileSync(join(root, 'src/share/war/itaipu-height.bin')));
const power = JSON.parse(await readFile(join(DATA, 'osm', 'power.json'), 'utf8'));
const town = layOut(power, (x, z) => floor.floorAt(x, z));
const wires = town.wires;
const drawn = drawnWires(wires);

console.log('1. the lines, counted');
{
  const conductors = drawn.length / 7;
  check(`${wires.length} chords, ${conductors} conductors drawn, every chord's radius and bundle set`,
    wires.every((w) => w.length === 11 && w[6] > 0 && [1, 2, 3, 4].includes(w[7])),
    `${wires.filter((w) => w[7] === 4).length} quad, ${wires.filter((w) => w[7] === 2).length} pair, ${wires.filter((w) => w[7] === 1).length} single or earth`);
  /* The most chords within WIRE_REACH of a point on a wire: every chord's
   * ends and middle, on a 40 m grid. */
  const C = 40;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  wires.forEach((w, i) => {
    for (let a = Math.floor(Math.min(w[0], w[3]) / C); a <= Math.floor(Math.max(w[0], w[3]) / C); a += 1) {
      for (let b = Math.floor(Math.min(w[2], w[5]) / C); b <= Math.floor(Math.max(w[2], w[5]) / C); b += 1) {
        const k = key(a, b);
        if (!grid.has(k)) {
          grid.set(k, []);
        }
        grid.get(k).push(i);
      }
    }
  });
  let most = 0;
  let mostAt = null;
  for (const w of wires) {
    for (const t of [0, 0.5]) {
      const p = [w[0] + (w[3] - w[0]) * t, w[1] + (w[4] - w[1]) * t, w[2] + (w[5] - w[2]) * t];
      const seen = new Set();
      const ci = Math.floor(p[0] / C);
      const cj = Math.floor(p[2] / C);
      for (let a = ci - 2; a <= ci + 2; a += 1) {
        for (let b = cj - 2; b <= cj + 2; b += 1) {
          for (const k of grid.get(key(a, b)) ?? []) {
            seen.add(k);
          }
        }
      }
      let n = 0;
      for (const k of seen) {
        if (segDist(wires[k], p) <= WIRE_REACH) {
          n += 1;
        }
      }
      if (n > most) {
        most = n;
        mostAt = p;
      }
    }
  }
  check(`at most ${most} chords within ${WIRE_REACH} m of any wire, inside the plant's ${WIRES_MAX}`, most <= WIRES_MAX,
    `at (${mostAt.map((v) => v.toFixed(0)).join(', ')})`);
  const sim = await loadSim(wasm);
  let k = 0;
  let last = 0;
  for (; k <= WIRES_MAX; k += 1) {
    last = sim.e.sim_wire_add(k, 0, 10, k, 20, 10, 0.1);
    if (last < 0) {
      break;
    }
  }
  check(`the module holds ${WIRES_MAX} chords and refuses the next`, k === WIRES_MAX && last < 0, `${k} held`);
  check('sim_wire_add refuses a radius of 0, a chord under a millimetre and NaN',
    sim.e.sim_wire_clear() === SIM_OK && sim.e.sim_wire_add(0, 0, 0, 1, 0, 0, 0) < 0
      && sim.e.sim_wire_add(0, 0, 0, 0, 0, 0.0005, 0.1) < 0 && sim.e.sim_wire_add(NaN, 0, 0, 1, 0, 0, 0.1) < 0);
}

/* The distance from p to chord w's axis. */
function segDist(w, p) {
  const ux = w[3] - w[0];
  const uy = w[4] - w[1];
  const uz = w[5] - w[2];
  const l2 = ux * ux + uy * uy + uz * uz;
  let t = ((p[0] - w[0]) * ux + (p[1] - w[1]) * uy + (p[2] - w[2]) * uz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((w[0] + ux * t - p[0]) ** 2 + (w[1] + uy * t - p[1]) ** 2 + (w[2] + uz * t - p[2]) ** 2);
}

/* A chord of a span of kind `want` (r, k), `away` m and more from every
 * tower, its middle 15 m and more over the ground. */
function pick(name, want, away = 80) {
  for (const w of wires) {
    if (!want(w)) {
      continue;
    }
    const m = [(w[0] + w[3]) / 2, (w[1] + w[4]) / 2, (w[2] + w[5]) / 2];
    if (m[1] - floor.floorAt(m[0], m[2]) < 15) {
      continue;
    }
    if (town.structures.some((s) => Math.hypot(s.x - m[0], s.z - m[2]) < away)) {
      continue;
    }
    return { name, w, m };
  }
  throw new Error(`wire-check: no span of ${name} ${away} m from its towers`);
}

const SPANS = [
  pick('a 500 kV quad bundle', (w) => w[7] === 4 && isKv(w, 500)),
  /* The 765 kV lines in the hero square run among the Foz do Iguacu
   * converter station's gantries: 25 m. */
  pick('a 765 kV quad bundle', (w) => w[7] === 4 && isKv(w, 765), 25),
  pick('a 66 kV single conductor', (w) => w[7] === 1 && w[6] > 0.015 && isKv(w, 66)),
  pick('an earth wire', (w) => w[7] === 1 && w[6] < 0.015),
];

/* Whether chord w belongs to a line of that many kV: its ends lie on one
 * of the line's spans in plan. */
function isKv(w, kv) {
  for (const line of power.lines) {
    if (Math.round(Number(String(line.voltage ?? '').split(';')[0]) / 1000) !== kv) {
      continue;
    }
    for (let i = 0; i + 1 < line.points.length; i += 1) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const d = planDist(a, b, w[0], w[2]) + planDist(a, b, w[3], w[5]);
      if (d < 30) {
        return true;
      }
    }
  }
  return false;
}

function planDist(a, b, x, z) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)) : 0;
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
}

/* The world (Three.js, y up) about span s as the plant's frame: x the way
 * the craft flies, square across the chord and level, y to its left, z up,
 * the chord's middle at the origin. As src/main.js's worldPosToSim is, a
 * turn and a shift. */
function frameOf(s) {
  const w = s.w;
  const along = [w[3] - w[0], 0, w[5] - w[2]];
  const l = Math.hypot(along[0], along[2]);
  const e1 = [-along[2] / l, 0, along[0] / l];
  const e3 = [0, 1, 0];
  const e2 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]];
  const toPlant = (p) => {
    const d = [p[0] - s.m[0], p[1] - s.m[1], p[2] - s.m[2]];
    return [d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2], d[0] * e3[0] + d[1] * e3[1] + d[2] * e3[2]];
  };
  const toWorld = (p) => [0, 1, 2].map((a) => s.m[a] + p[0] * e1[a] + p[1] * e2[a] + p[2] * e3[a]);
  return { toPlant, toWorld };
}

/* Every chord within 200 m of the span, as the town streams them. */
function collidersOf(s) {
  const col = new Colliders();
  for (const w of wires) {
    if (segDist(w, s.m) < 200) {
      col.add('wire', w[0], w[1], w[2], w[3], w[4], w[5], w[6]);
    }
  }
  col.build();
  return col;
}

/* Craft `a` flown from RUN_IN short of the chord at plant height h, with
 * the wires near it declared (or none); returns the rig. */
async function fly(a, s, h, col, declare) {
  const rig = await Rig.create(loadSim, wasm, cfg, { id: a.id, ground: null });
  const { sim } = rig;
  if (!a.quad) {
    sim.e.sim_wing_set_stab(0);
  }
  if (declare) {
    const pick = [];
    const fr = frameOf(s);
    nearestWires(col, s.m[0], s.m[1], s.m[2], WIRE_REACH, WIRES_MAX, pick);
    for (const { i } of pick) {
      const pa = fr.toPlant([col.fax[i], col.fay[i], col.faz[i]]);
      const pb = fr.toPlant([col.fbx[i], col.fby[i], col.fbz[i]]);
      if (sim.e.sim_wire_add(...pa, ...pb, col.fr[i]) < 0) {
        throw new Error('sim_wire_add refused a chord');
      }
    }
  }
  rig.pose([-RUN_IN, 0, h], [1, 0, 0, 0]);
  if (a.quad) {
    rig.velocity([a.speed, 0, 0]);
  } else {
    rig.launch(a.speed);
  }
  rig.path = [];
  rig.run(FLY_MS, a.quad ? [0, 0, 0, 0.42] : [0, 0, 0, 0.75], (st) => rig.path.push([st[1], st[2], st[3]]));
  return rig;
}

/* Where the CG crosses x = 0, plant frame, on a free flight from height h. */
function crossing(path) {
  for (let i = 1; i < path.length; i += 1) {
    if (path[i - 1][0] < 0 && path[i][0] >= 0) {
      const f = -path[i - 1][0] / (path[i][0] - path[i - 1][0]);
      return [0, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f, path[i - 1][2] + (path[i][2] - path[i - 1][2]) * f];
    }
  }
  return null;
}

/* The nearest drawn conductor of the span to world point p. */
function drawnDist(p) {
  let best = Infinity;
  for (let o = 0; o < drawn.length; o += 7) {
    best = Math.min(best, segDist(drawn.subarray(o, o + 6), p) - drawn[o + 6]);
  }
  return best;
}

console.log('2. damage on: the plant meets the wire where it is drawn');
for (const s of SPANS) {
  const col = collidersOf(s);
  const fr = frameOf(s);
  /* The chord's height at the crossing, plant frame (0 at its middle). */
  const wz = 0;
  for (const a of AIRCRAFT) {
    const H = 20;
    const free = await fly(a, s, H, col, false);
    const cross = crossing(free.path);
    if (!cross) {
      check(`${s.name}, ${a.name}: the free flight crosses the wire's line`, false);
      continue;
    }
    /* Started so its CG crosses the chord's axis; and so its lowest hull
     * point crosses a metre over the wire's outside. */
    const h0 = H + (wz - cross[2]);
    const low = Math.max(...free.parts.map((p) => -p.boxMin[2]));
    const h1 = h0 + s.w[6] + CLEAR + low;
    const hit = await fly(a, s, h0, col, true);
    const onWire = hit.events.filter((e) => SURFACES[e.surface] === 'wire');
    const first = onWire[0];
    const at = first ? drawnDist(fr.toWorld(first.point)) : Infinity;
    const broke = hit.events.some((e) => e.typeName === 'break' || e.typeName === 'crush' || e.typeName === 'chip');
    const flags = Object.entries(DAMAGE_FLAGS).filter(([, b]) => hit.flags() & b).map(([n]) => n).join(' ');
    check(`${s.name}, ${a.name} at ${a.speed} m/s into it: met on the wire surface, at a drawn conductor, and damaged`,
      Boolean(first) && at <= s.w[6] + AT_TOL && broke,
      first ? `${onWire.length} wire events, first ${first.typeName} on ${hit.parts[first.part].label} ${at.toFixed(3)} m outside a drawn conductor; ${flags}` : `no wire event; ${hit.summary().slice(0, 120)}`);
    const again = await fly(a, s, h0, col, true);
    check(`${s.name}, ${a.name}: the hit flown twice is the same trace`, again.digest.hex() === hit.digest.hex(), hit.digest.hex());
    const clear = await fly(a, s, h1, col, true);
    const speed0 = Math.hypot(...free.state().slice(4, 7));
    const speed1 = Math.hypot(...clear.state().slice(4, 7));
    check(`${s.name}, ${a.name}: a metre over it, nothing met`, clear.events.length === 0 && Math.abs(speed1 - speed0) < 0.5,
      `${clear.events.length} events, ${speed1.toFixed(2)} m/s against ${speed0.toFixed(2)} free`);
  }
}

console.log('3. damage off: the host\'s sweep meets the wire as a wire');
{
  const WIRE = KINDS.indexOf('wire');
  for (const s of SPANS) {
    const col = collidersOf(s);
    const fr = frameOf(s);
    const sweep = (z) => {
      const p = fr.toWorld([-RUN_IN, 0, z]);
      const q = fr.toWorld([RUN_IN, 0, z]);
      return col.hit(p[0], p[1], p[2], q[0], q[1], q[2]);
    };
    const k0 = sweep(0);
    const k1 = sweep(s.w[6] + CLEAR + 0.2);
    check(`${s.name}: swept through it, a wire; a metre over, nothing`, k0 === WIRE && k1 < 0,
      `through: ${k0 >= 0 ? KINDS[k0] : 'nothing'}, over: ${k1 >= 0 ? KINDS[k1] : 'nothing'}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
