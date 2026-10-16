/*
 * war-targets.js: the Itaipu map's war targets as data, for mission 1
 * (docs/WARFARE-PLAN.md sections 4.2 and 8). The room has no map, so the
 * mission (src/share/war/missions/itaipu-1.js) cannot ask map.targets
 * where an intake is: this builds the map in headless Chromium, the dam
 * part's targets and the war part's yard as the shell has them, and
 * writes each one's centre and reach into src/share/war/itaipu-targets.js,
 * which the mission imports.
 *
 * And for the same reason the power lines an attacker can fly into
 * (src/share/war/wires.js): the town part's wire chords as drawn, those
 * of every span within CORRIDOR_M in plan of where some attacker of some
 * mission flies (every wave at one to eight pilots, on every route and as
 * every kind its stage may draw, every attacker of it at no error and
 * both ends of its spread), into
 * src/share/war/itaipu-wires.js.
 *
 *   node scripts/war-targets.js           write the modules
 *   node scripts/war-targets.js --check   exit 1 if a written one differs
 *                                         from the map as built now
 *
 * And for the same reason the targets' structures (src/share/war/damage.js):
 * each target's drawn parts cut into the chunks a warhead breaks, as the
 * dam part and the war part cut them (their `structures`), into
 * src/share/war/itaipu-chunks.js, which the room breaks them by.
 *
 * Run it by hand after the map's targets move (the dam part or the yard),
 * its lines move or a mission's routes change, and commit its output with
 * the change. It needs the Itaipu data folder
 * (FDFPV_ITAIPU_DATA, by default ~/Desktop/fdfpv-itaipu-data), so it is a
 * local check, not a CI one.
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

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS, waveSize } from '../src/share/war/missions/index.js';
import { LAUNCH_DECK_M } from '../edge/rooms/war.js';
import { idsMayBe } from '../src/share/war/stages.js';
import { GANTRIES } from '../src/share/war/contain.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'src', 'share', 'war', 'itaipu-targets.js');
const OUT_WIRES = join(root, 'src', 'share', 'war', 'itaipu-wires.js');
const OUT_CHUNKS = join(root, 'src', 'share', 'war', 'itaipu-chunks.js');
const OUT_TOWERS = join(root, 'src', 'share', 'war', 'itaipu-towers.js');
/* The Itaipu data folder, whose OpenStreetMap power lines say which
 * towers make each corridor (the map builds them from the same file). */
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
/*
 * The two 500 kV corridors of The Corridor (docs/campaign/MISSIONS.md
 * M6, TECH-NEEDS T1.6), each OpenStreetMap's ways in order from the dam
 * out, and where it starts: west from the right bank switchyard, the
 * double circuit line that runs west past Hernandarias (its two ways, the
 * yard's portal to the junction and on west to the hero square's edge;
 * Lights Out's corridor-west flies it); east from the powerhouse, the
 * 60 Hz line IPU 60Hz FI1, the first of the four (FI1 to FI4) that run
 * side by side to the Foz do Iguacu substation. Each corridor's towers
 * are its ways' nodes that OSM tags power=tower, numbered from the dam:
 * from the end of its first way nearer the map's target `anchor`.
 */
const CORRIDORS = [
  { side: 'w', ways: ['w1395855080', 'w163214315'], anchor: 'yard-right' },
  { side: 'e', ways: ['w230690313'], anchor: 'penstock-0' },
];
/* A span is kept when a chord of it lies this near, in plan, to where an
 * attacker flies: past the widest a formation and an error spread it. */
const CORRIDOR_M = 150;
/* A carrier's launches are swept from its pose this often. */
const LAUNCH_EVERY_MS = 5000;

/* Every id mission 1 may aim at, in the order written. */
const IDS = [
  ...Array.from({ length: 20 }, (_, k) => `intake-${k}`),
  ...Array.from({ length: 14 }, (_, k) => `gate-${k}`),
  ...Array.from({ length: 20 }, (_, k) => `penstock-${k}`),
  'yard-right',
];

const HEADER = `/*
 * itaipu-targets.js: where each war target stands on the Itaipu map, as
 * the map builds it (the dam part's targets and the war part's yard,
 * map.targets): its centre \`at\` in scene metres (y up) and its reach \`r\`.
 * GENERATED by scripts/war-targets.js from the built map; do not edit it
 * by hand. \`node scripts/war-targets.js --check\` fails when this file and
 * the map differ. Mission 1 (missions/itaipu-1.js) adds each target's MW.
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
`;

/* Millimetres, as the wire rounds a point. */
const mm = (v) => Math.round(v * 1000) / 1000;

function render(targets) {
  const lines = IDS.map((id) => {
    const t = targets[id];
    return `  '${id}': { at: [${t.at.map(mm).join(', ')}], r: ${mm(t.r)} },`;
  });
  return `${HEADER}\nexport default {\n${lines.join('\n')}\n};\n`;
}

const WIRES_HEADER = `/*
 * itaipu-wires.js: the power lines a scripted attacker can fly into on the
 * Itaipu map (src/share/war/wires.js): every span within ${CORRIDOR_M} m in plan
 * of where an attacker of some mission flies, as [span, then its
 * conductors' and earth wire's chords, ax, ay, az, bx, by, bz each], scene
 * metres (y up), to the centimetre. GENERATED by scripts/war-targets.js
 * from the built map (src/maps/itaipu/town/power.js); do not edit it by
 * hand. \`node scripts/war-targets.js --check\` fails when this file and
 * the map or the missions' routes differ.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */
`;

/* The cells of a CORRIDOR_M grid some attacker flies over. */
function corridor() {
  const cells = new Set();
  for (const m of Object.values(MISSIONS)) {
    if (m.map !== 'itaipu') {
      continue;
    }
    /* A spawn's every way in, as the stage engine may draw it
     * (src/share/war/stages.js): each route of a list or of a sector's
     * family, each kind of a list or a mix. */
    const routesOf = (w) => (w.route && typeof w.route === 'object' && !Array.isArray(w.route)
      ? [w.route.sector].flat().flatMap((sec) => m.sectors[sec]) : [w.route].flat());
    const kindsOf = (w) => (w.mix ? w.mix.map((x) => x[0]) : [w.kind].flat());
    /* A working set's spawn may go for any target the set is drawn from,
     * an { of, not }'s for any of its list. */
    const each = m.waves.flatMap((w) => kindsOf(w).flatMap((kind) => routesOf(w).map((route) => ({ ...w, kind, route }))));
    for (const w of each) {
      if (w.kind === 'hunter') {
        continue;
      }
      for (let pilots = 1; pilots <= 8; pilots += 1) {
        const n = waveSize(w, pilots);
        /* Every target a set or a list may give, whatever n is. */
        const may = idsMayBe(m, w.target);
        const ks = w.target && typeof w.target === 'object' && !Array.isArray(w.target) ? Math.max(n, may.length) : n;
        for (let k = 0; k < ks; k += 1) {
          for (const err of w.spread ? [-w.spread, 0, w.spread] : [0]) {
            const plan = planAgent(m, {
              id: 1, kind: w.kind, route: w.route, t0: 0, k, n, err, target: may.length ? may[k % may.length] : null,
            });
            const end = Number.isFinite(plan.tEnd) ? plan.tEnd : plan.phases[plan.phases.length - 1].t1;
            for (let t = 0; t <= end; t += 250) {
              const p = poseAt(plan, t).p;
              cells.add(`${Math.floor(p[0] / CORRIDOR_M)},${Math.floor(p[2] / CORRIDOR_M)}`);
            }
            /* A carrier's launches (edge/rooms/war.js launch): each child
             * from its pose every LAUNCH_EVERY_MS of its flight and where
             * it parks, its route from there. */
            for (const spec of w.launch ? [w.launch] : []) {
              const parked = plan.phases[plan.phases.length - 1].t0;
              for (let t0 = 0; t0 <= parked + LAUNCH_EVERY_MS; t0 += LAUNCH_EVERY_MS) {
                const deck = poseAt(plan, Math.min(t0, parked)).p;
                for (let c = 0; c < waveSize(spec, pilots); c += 1) {
                  const child = planAgent(m, {
                    id: 1, kind: spec.kind, route: spec.route, from: [deck[0], deck[1] + LAUNCH_DECK_M, deck[2]], t0, k: c, n: waveSize(spec, pilots), err: 0, target: [spec.target].flat()[c % [spec.target].flat().length],
                  });
                  for (let t = t0; t <= child.tEnd; t += 250) {
                    const p = poseAt(child, t).p;
                    cells.add(`${Math.floor(p[0] / CORRIDOR_M)},${Math.floor(p[2] / CORRIDOR_M)}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return cells;
}

/* The chords (layOut's, [ax, ay, az, bx, by, bz, r, k, hx, hz, span]) of
 * every span in the corridor, as the module's text. */
function renderWires(chords) {
  const cells = corridor();
  const near = (x, z) => {
    const i = Math.floor(x / CORRIDOR_M);
    const j = Math.floor(z / CORRIDOR_M);
    for (let a = -1; a <= 1; a += 1) {
      for (let b = -1; b <= 1; b += 1) {
        if (cells.has(`${i + a},${j + b}`)) {
          return true;
        }
      }
    }
    return false;
  };
  const kept = new Set(chords.filter((w) => near(w[0], w[2]) || near(w[3], w[5])).map((w) => w[10]));
  const spans = new Map();
  for (const w of chords) {
    if (!kept.has(w[10])) {
      continue;
    }
    if (!spans.has(w[10])) {
      spans.set(w[10], []);
    }
    spans.get(w[10]).push(...w.slice(0, 6).map(cm));
  }
  const rows = [...spans.entries()].sort((a, b) => a[0] - b[0]).map(([span, flat]) => `    [${span}, ${flat.join(', ')}],`);
  return `${WIRES_HEADER}\nexport default {\n  spans: [\n${rows.join('\n')}\n  ],\n};\n`;
}

const CHUNKS_HEADER = `/*
 * itaipu-chunks.js: the Itaipu war targets' structures, each target's
 * drawn parts cut into the chunks a warhead breaks, in the form
 * src/share/war/damage.js reads (its header says what each field is):
 * centres and half extents to the millimetre, axes to the micrometre.
 * GENERATED by scripts/war-targets.js from the built map (the dam part's
 * and the war part's structures); do not edit it by hand.
 * \`node scripts/war-targets.js --check\` fails when this file and the
 * map differ.
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
`;

/* Micrometres, as a chunk's axes are written. */
const um = (v) => Math.round(v * 1e6) / 1e6;

/* The structures as the module's text, in IDS's order. */
function renderChunks(structures) {
  const list = (a, f = mm) => `[${a.map(f).join(', ')}]`;
  const rows = [];
  for (const id of IDS) {
    const s = structures[id];
    if (!s) {
      continue;
    }
    const f = s.frame;
    rows.push(`  '${id}': {`);
    const bore = f.bore == null ? '' : `, bore: ${mm(f.bore)}`;
    const h = f.hinge;
    const hinge = h ? `,\n      hinge: { p: ${list(h.p)}, a: ${list(h.a, um)}, n: ${list(h.n, um)}, r: ${mm(h.r)}, sill: ${mm(h.sill)}, rest: ${mm(h.rest)}, max: ${mm(h.max)} },\n   ` : '';
    rows.push(`    part: '${s.part}', water: ${s.water == null ? 'null' : mm(s.water)}, frame: { o: ${list(f.o)}, u: ${list(f.u, um)}, n: ${list(f.n, um)}${bore}${hinge} },`);
    rows.push('    chunks: [');
    for (const ch of s.chunks) {
      const r = ch.r ? `, r: ${list(ch.r)}` : '';
      const w = ch.w ? `, w: [${ch.w.join(', ')}]` : '';
      const mv = ch.m ? ', m: 1' : '';
      rows.push(`      { k: '${ch.k}', c: ${list(ch.c)}, e: ${list(ch.e, um)}, h: ${list(ch.h)}, a: ${ch.a}, l: [${ch.l.join(', ')}]${r}${w}${mv} },`);
    }
    rows.push('    ],');
    rows.push('  },');
  }
  return `${CHUNKS_HEADER}\nexport default {\n${rows.join('\n')}\n};\n`;
}

/* Centimetres, as the wires are written. */
const cm = (v) => Math.round(v * 100) / 100;

const TOWERS_HEADER = `/*
 * itaipu-towers.js: the 500 kV towers of The Corridor's two corridors on
 * the Itaipu map (docs/campaign/MISSIONS.md M6, TECH-NEEDS T1.6), each
 * corridor its towers in order from the dam out: \`w\` west from the
 * right bank switchyard (OpenStreetMap's ways w1395855080 then
 * w163214315, the double circuit line), \`e\` east from the powerhouse
 * (w230690313, IPU 60Hz FI1). Each tower: its OSM node, where the map
 * stands it (x, z scene metres, y the ground there, as the town part
 * builds it, src/maps/itaipu/town/power.js layOut), its height h and its
 * base's side, metres. GENERATED by scripts/war-targets.js from the data
 * folder's osm/power.json and the built map; do not edit it by hand.
 * \`node scripts/war-targets.js --check\` fails when this file and the
 * map differ.
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
`;

/*
 * Each corridor's towers in order from the dam: its ways chained end to
 * end, each turned round where it runs the other way (FI1 runs from Foz
 * to the dam), the first from its end nearer the corridor's anchor (a
 * target of the built map, `targets`), the nodes OSM tags power=tower,
 * each where the built map stands it (`built`, the town part's
 * structures by node id).
 */
function corridorTowers(power, built, targets) {
  const kinds = new Map(power.towers.map((t) => [t.id, t.kind]));
  const out = {};
  for (const c of CORRIDORS) {
    const chain = [];
    for (const id of c.ways) {
      const way = power.lines.find((l) => l.id === id);
      if (!way) {
        throw new Error(`osm/power.json has no way ${id}`);
      }
      let nodes = way.nodes.slice();
      const [ax, , az] = targets[c.anchor].at;
      const far = (k) => Math.hypot(way.points[k][0] - ax, way.points[k][1] - az);
      if (chain.length ? nodes.at(-1) === chain.at(-1) : far(nodes.length - 1) < far(0)) {
        nodes.reverse();
      }
      if (chain.length && nodes[0] !== chain.at(-1)) {
        throw new Error(`way ${id} does not go on from ${chain.at(-1)}`);
      }
      chain.push(...(chain.length ? nodes.slice(1) : nodes));
    }
    const towers = chain.filter((n) => kinds.get(n) === 'tower');
    out[c.side] = towers.map((n) => {
      const s = built.find((x) => x.id === n);
      if (!s || s.kind !== 'tower') {
        throw new Error(`the built map stands no tower at ${n}`);
      }
      return {
        osm: n, x: s.x, y: s.y, z: s.z, h: s.size.h, base: s.size.base,
      };
    });
  }
  return out;
}

function renderTowers(corridors) {
  const rows = [];
  for (const c of CORRIDORS) {
    rows.push(`  ${c.side}: [`);
    for (const t of corridors[c.side]) {
      rows.push(`    { osm: '${t.osm}', x: ${mm(t.x)}, y: ${mm(t.y)}, z: ${mm(t.z)}, h: ${mm(t.h)}, base: ${mm(t.base)} },`);
    }
    rows.push('  ],');
  }
  return `${TOWERS_HEADER}\nexport default {\n${rows.join('\n')}\n};\n`;
}

async function readMap() {
  const settings = {
    airframe: 'interceptor', airframeAsked: true, map: 'itaipu', graphics: 'low', graphicsAuto: false, sound: false,
  };
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
  const page = await openPage({
    root, width: 640, height: 360, url: '/index.html?map=itaipu', seed,
  });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
    await page.evaluate('window.__drawOff(true)');
    const json = await page.evaluate(`JSON.stringify(Object.fromEntries(Object.entries(window.__mapScene().userData.itaipu.targets)
      .map(([id, t]) => [id, { at: t.at, r: t.r }])))`);
    const wires = await page.evaluate('JSON.stringify(window.__mapScene().userData.itaipu.parts.town.town.wires)');
    const structures = await page.evaluate(`JSON.stringify(window.__mapScene().userData.itaipu.parts.town.town.structures
      .filter((s) => s.kind === 'tower').map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, z: s.z, size: { h: s.size.h, base: s.size.base } })))`);
    const chunks = await page.evaluate(`JSON.stringify(Object.assign({}, ...Object.values(window.__mapScene().userData.itaipu.parts)
      .map((p) => p.structures ?? {})))`);
    const sites = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const s = window.__mapScene().userData.itaipu.parts.dam.survey().sites;
      return { intakes: s.intakeGantries, spillway: s.spillwayGantry };
    })())`));
    return {
      targets: JSON.parse(json), wires: JSON.parse(wires), chunks: JSON.parse(chunks), sites, structures: JSON.parse(structures),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const { targets, wires, chunks, sites, structures } = await readMap();
  const power = JSON.parse(await readFile(join(DATA, 'osm', 'power.json'), 'utf8'));
  /* The gantries Contain holds (src/share/war/contain.js GANTRIES), written
   * by hand there: each in plan where the dam builds it, to the
   * millimetre. The intakes' is the east one (the last of the survey's). */
  const built = { 'gantry-intakes': sites.intakes && sites.intakes.at(-1), 'gantry-spillway': sites.spillway };
  for (const [id, g] of Object.entries(built)) {
    const at = GANTRIES[id].at;
    const off = g ? Math.hypot(g.x - at[0], g.z - at[2]) : Infinity;
    if (!(off <= 0.001)) {
      console.error(`FAIL, ${id} in contain.js stands ${off.toFixed(3)} m from the gantry the map builds (${g ? `${mm(g.x)}, ${mm(g.z)}` : 'none'})`);
      process.exitCode = 1;
    } else {
      console.log(`PASS, ${id} in contain.js stands on the gantry the map builds (${mm(g.x)}, ${mm(g.z)})`);
    }
  }
  const missing = IDS.filter((id) => !targets[id]);
  if (missing.length) {
    throw new Error(`the built map has no ${missing.join(', ')}`);
  }
  const extra = Object.keys(targets).filter((id) => !IDS.includes(id));
  if (extra.length) {
    throw new Error(`the built map has targets this script does not write: ${extra.join(', ')}`);
  }
  const outputs = [
    { path: OUT, text: render(targets), what: `${IDS.length} targets` },
    { path: OUT_WIRES, text: renderWires(wires), what: 'power lines in the attackers\' way' },
    { path: OUT_CHUNKS, text: renderChunks(chunks), what: 'targets\' structures' },
    { path: OUT_TOWERS, text: renderTowers(corridorTowers(power, structures, targets)), what: 'corridors\' towers' },
  ];
  if (!check) {
    for (const o of outputs) {
      await writeFile(o.path, o.text);
      console.log(`wrote ${o.what} to ${o.path}`);
    }
    return;
  }
  for (const o of outputs) {
    const had = await readFile(o.path, 'utf8').catch(() => '');
    if (had !== o.text) {
      const a = had.split('\n');
      const b = o.text.split('\n');
      const diff = b.map((l, i) => (l !== a[i] ? `  map:  ${l.trim().slice(0, 160)}\n  file: ${(a[i] ?? '').trim().slice(0, 160)}` : null)).filter(Boolean);
      console.error(`FAIL, ${o.path} differs from the built map; run node scripts/war-targets.js and commit it\n${diff.slice(0, 8).join('\n')}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`PASS, the ${o.what} in ${o.path} are the built map's`);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
