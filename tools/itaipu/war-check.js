/*
 * war-check.js: the right bank switchyard on the Itaipu map, measured
 * (docs/WARFARE-PLAN.md section 8, package M; src/maps/itaipu/war/).
 *
 * In Node, on the data folder's own files:
 *
 *   plan        the yard's plan is the same built twice; every transformer
 *               is inside the fence, CLEAR of every gantry, tower and wire
 *               the town stands (town/power.js layOut) and off every
 *               building the town draws; the sphere reaches them all.
 *
 * In headless Chromium, the map built by the shell:
 *
 *   built       the part is Node's plan, its transformers are solid where
 *               they stand, and the static colliders are at most 15 000
 *               (docs/ITAIPU-PLAN.md section 13);
 *   target      map.targets['yard-right'] is this yard's: its sphere, its
 *               transformers' colliders, its fires and outline; every
 *               other target is the dam part's own entry, untouched; and
 *               map.setTargetState('yard-right', state) sets the state
 *               (in the dam's damage where the dam has targets), and
 *               throws on an unknown id or state;
 *   fence       a Timber flown level into the fence at 15 m/s meets it;
 *   bushing     a Timber at 20 m/s, and a five inch at 30 and 45 m/s on a
 *               page of its own, flown level across a transformer's middle
 *               bushing at half and 0.85 of its height, meet it and do not
 *               go on;
 *   shots       with --shots=DIR, the yard from the air and from low, and
 *               the frame's draw calls in each view with and without the
 *               yard: the yard never takes a view over 300 (section 13).
 *               A view already over without it is printed, loud, and is
 *               not this part's to fix.
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node tools/itaipu/war-check.js [--shots=DIR]
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../../src/ui/ui.js';
import { airframeById } from '../../configs/airframes.js';
import { planYard, TANK, KIT } from '../../src/maps/itaipu/war/plan.js';
import { layOut, piecesOf } from '../../src/maps/itaipu/town/power.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? resolve(shotsArg.slice('--shots='.length)) : null;

/* A plinth's corner to anything the town stands, metres: room for a
 * whoop between them. */
const CLEAR = 4;
const SOLIDS_MAX = 15000;
const CALLS_MAX = 300;
const AIRFRAME = 'timber1500';
const PART = 'window.__mapScene().userData.itaipu.parts.war';

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const check = (ok, good, bad) => {
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${ok ? good : bad}`);
  if (!ok) {
    fail(bad);
  }
};
const js = async (page, expr) => JSON.parse(await page.evaluate(`JSON.stringify(${expr})`));

function seed(airframe = AIRFRAME) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true, map: 'itaipu', graphics: process.env.SIM_GPU === '1' ? 'high' : 'low', graphicsAuto: false, crashDamage: true, sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      c = !c;
    }
  }
  return c;
}

/* Plan distance from (x, z) to segment a b, each [x, z]. */
function segDist(x, z, a, b) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)) : 0;
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
}

/* A plinth's four corners in plan. */
function corners(t) {
  const h = TANK.length / 2 + 0.5;
  const w = TANK.width / 2 + 0.5;
  return [[-h, -w], [h, -w], [h, w], [-h, w]].map(([u, v]) => [t.x + t.ax * u - t.az * v, t.z + t.az * u + t.ax * v]);
}

/* ------------------------------------------------------------------ Node */

async function nodeChecks() {
  console.log('Node, on the data folder\'s own files');
  const power = JSON.parse(await readFile(join(DATA, 'osm', 'power.json'), 'utf8'));
  const buildings = JSON.parse(await readFile(join(DATA, 'osm', 'buildings.json'), 'utf8')).features;
  /* The layout reads the ground only for heights: flat is enough here. */
  const flat = () => 225;
  const a = planYard(power, buildings, flat);
  const b = planYard(power, buildings, flat);
  check(JSON.stringify(a) === JSON.stringify(b), 'plan: built twice, identical', 'plan: two plans of the same data differ');
  console.log(`       plan: ${a.transformers.length} transformers, ${a.fence.length} fence pieces, axis ${((Math.atan2(a.axis[1], a.axis[0]) * 180) / Math.PI).toFixed(1)} degrees from +x, `
    + `${a.wires} spans over it, ${a.houses} buildings in or by it; sphere at (${a.site.at.map((v) => v.toFixed(0)).join(', ')}), r ${a.site.r}`);

  const across = a.transformers.filter((t) => !corners(t).every(([x, z]) => inside(a.outline, x, z)));
  check(a.transformers.length > 0 && !across.length, 'plan: every transformer inside the fence', `plan: ${across.length} transformer(s) cross the fence`);

  /* What the town stands by the yard: its gantries' and towers' pieces
   * and its wires, in plan, each with its radius. */
  const town = layOut(power, flat);
  const near = (x, z) => Math.hypot(x - a.site.at[0], z - a.site.at[2]) < a.site.r + 100;
  const segs = [];
  for (const s of town.structures.filter((st) => near(st.x, st.z))) {
    for (const p of piecesOf(s)) {
      segs.push([[p[0], p[2]], [p[3], p[5]], p[6]]);
    }
  }
  for (const w of town.wires.filter((c) => near(c[0], c[2]))) {
    segs.push([[w[0], w[2]], [w[3], w[5]], 0.1]);
  }
  let worst = Infinity;
  for (const t of a.transformers) {
    for (const [x, z] of [[t.x, t.z], ...corners(t)]) {
      for (const [p, q, r] of segs) {
        worst = Math.min(worst, segDist(x, z, p, q) - r);
      }
    }
  }
  check(worst >= CLEAR, `plan: every plinth ${worst.toFixed(1)} m or more from the ${segs.length} gantry, tower and wire pieces the town stands by the yard`,
    `plan: a plinth ${worst.toFixed(1)} m from something the town stands`);

  const houses = buildings.filter((f) => f.outer.some(([x, z]) => near(x, z)));
  const onHouse = a.transformers.filter((t) => corners(t).some(([x, z]) => houses.some((f) => inside(f.outer, x, z))));
  check(!onHouse.length, `plan: no transformer on any of the ${houses.length} buildings by the yard`, `plan: ${onHouse.length} transformer(s) on a building`);

  const reach = Math.max(...a.transformers.map((t) => Math.hypot(t.x - a.site.at[0], t.z - a.site.at[2]))) + TANK.length / 2;
  check(reach <= a.site.r, `plan: the sphere reaches every transformer (${reach.toFixed(0)} of ${a.site.r} m)`, 'plan: a transformer is outside the sphere');
  return a;
}

/* ------------------------------------------------------------ page side */

async function pageChecks(page, plan) {
  const s = await js(page, `(() => {
    const it = window.__mapScene().userData.itaipu;
    const col = it.parts.dam.survey().colliders;
    const w = ${PART};
    const gaps = w.yard.solids.map((i) => col.gapAt((col.fax[i] + col.fbx[i]) / 2, (col.fay[i] + col.fby[i]) / 2, (col.faz[i] + col.fbz[i]) / 2, 1));
    return { stats: w.stats(), solids: w.yard.solids.length, staticCount: col.staticCount, maxGap: Math.max(...gaps) };
  })()`);
  console.log(`       built: ${s.stats.transformers} transformers, ${s.stats.fence} fence pieces, ${s.stats.solids} solids, `
    + `${s.stats.drawn.meshes} meshes, ${s.stats.drawn.triangles} triangles, in ${s.stats.buildMs} ms`);
  check(s.stats.transformers === plan.transformers.length && s.solids === 3 * plan.transformers.length,
    'built: the page\'s yard is Node\'s, three solids per transformer', `built: the page has ${s.stats.transformers} transformers and ${s.solids} of their solids, Node ${plan.transformers.length}`);
  check(s.maxGap === 0, 'built: every transformer is solid at its middle', `built: a transformer's middle is ${s.maxGap} m from any solid`);
  check(s.staticCount <= SOLIDS_MAX, `built: ${s.staticCount} static colliders, at most ${SOLIDS_MAX}`, `built: ${s.staticCount} static colliders, over ${SOLIDS_MAX}`);
}

async function targetChecks(page) {
  const s = await js(page, `(() => {
    const it = window.__mapScene().userData.itaipu;
    const T = it.targets;
    const y = T && T['yard-right'];
    const w = it.parts.war.yard;
    const dam = it.parts.dam;
    const theirs = dam.targets || null;
    const out = {
      has: Boolean(y),
      same: Boolean(y) && y.r === w.r && y.part === 'yard' && y.at.every((v, i) => v === w.at[i])
        && y.colliders.length === w.solids.length && y.colliders.every((c, i) => c === w.solids[i])
        && y.fires.length === w.fires.length && y.outline.length === w.outline.length,
      r: y ? y.r : null, colliders: y ? y.colliders.length : 0, fires: y ? y.fires.length : 0, outline: y ? y.outline.length : 0,
      frozen: Object.isFrozen(T) && Boolean(y) && Object.isFrozen(y),
      ids: T ? Object.keys(T).length : 0,
      dam: theirs ? Object.keys(theirs).length : 0,
      others: theirs ? Object.keys(theirs).filter((id) => id !== 'yard-right').every((id) => T[id] === theirs[id]) && Object.keys(T).every((id) => id in theirs) : Object.keys(T).length === 1,
      placeholder: theirs && theirs['yard-right'] ? { at: theirs['yard-right'].at, r: theirs['yard-right'].r } : null,
    };
    const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
    out.setOk = !throws(() => it.setTargetState('yard-right', 'fire'));
    /* Where the dam's damage put yard-right's puffs: each on one of this
     * yard's fires, and every fire used. */
    const pts = it.parts.dam.group.children.find((c) => c.name === 'itaipu-dam-damage');
    if (pts && theirs) {
      const k = Object.keys(theirs).sort().indexOf('yard-right');
      const a = pts.geometry.getAttribute('position').array;
      const n = 32;
      const used = new Set();
      let off = 0;
      for (let i = 0; i < n; i += 1) {
        const p = [a[(k * n + i) * 3], a[(k * n + i) * 3 + 1], a[(k * n + i) * 3 + 2]];
        let best = Infinity, bj = -1;
        y.fires.forEach((f, j) => { const d = Math.hypot(p[0] - f[0], p[1] - f[1], p[2] - f[2]); if (d < best) { best = d; bj = j; } });
        off = Math.max(off, best);
        used.add(bj);
      }
      out.puffs = { n, off, used: used.size, visible: pts.visible };
    }
    out.damState = dam.targetState ? dam.targetState('yard-right') : null;
    out.burning = dam.stats().burning ?? null;
    out.badState = throws(() => it.setTargetState('yard-right', 'melted'));
    out.badId = throws(() => it.setTargetState('yard-left', 'fire'));
    it.setTargetState('yard-right', 'ok');
    out.back = dam.targetState ? dam.targetState('yard-right') : null;
    return out;
  })()`);
  check(s.has && s.same && s.frozen,
    `target: yard-right is this yard's, r ${s.r}, ${s.colliders} transformer colliders, ${s.fires} fires, an outline of ${s.outline}, frozen`,
    `target: yard-right is ${s.has ? 'not this yard\'s' : 'missing'} (r ${s.r}, ${s.colliders} colliders, frozen ${s.frozen})`);
  check(s.others, s.dam ? `target: the other ${s.dam - 1} targets are the dam part's own entries, ${s.ids} in all; the dam's placeholder was at (${s.placeholder.at.map((v) => v.toFixed(0)).join(', ')}), r ${s.placeholder.r}`
    : 'target: the dam part names no targets on this tree, so the map holds yard-right alone',
  `target: the map's targets are not the dam's plus yard-right (${s.ids} of them, the dam's ${s.dam})`);
  const damOk = s.damState === null || (s.damState === 'fire' && s.burning === 1 && s.back === 'ok');
  check(s.setOk && damOk && s.badState && s.badId,
    `target: setTargetState('yard-right', 'fire') ${s.damState ? 'is the dam\'s state, 1 burning, and back to ok after' : 'is kept (no dam damage on this tree)'}; an unknown state and an unknown id throw`,
    `target: setTargetState ok ${s.setOk}, dam state ${s.damState}, burning ${s.burning}, back ${s.back}, bad state threw ${s.badState}, bad id threw ${s.badId}`);
  if (s.damState !== null) {
    const p = s.puffs;
    check(p && p.visible && p.off < 0.01 && p.used === s.fires,
      `target: on fire, the dam's ${p.n} puffs for yard-right sit on this yard's fires (worst ${p.off.toFixed(4)} m off), all ${p.used} of them used`,
      `target: yard-right's puffs ${JSON.stringify(p)}, not on its ${s.fires} fires`);
  }
}

/*
 * One level flight from a throw (window.__crashThrow, held, then let go)
 * for 1.5 s of sim time: where it ended and what it met. The first throw
 * of a page pays for the crash world, so `warm` throws there first.
 */
async function flyInto(page, throwAt, warm, throttle) {
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ x: warm[0], y: warm[1], z: warm[2], fresh: true })})`);
  await page.sleep(1500);
  const r = await js(page, `window.__crashThrow(${JSON.stringify(throwAt)})`);
  if (!r || r.ok === false) {
    throw new Error(`the throw was refused: ${JSON.stringify(r)}`);
  }
  await page.evaluate(`window.__stick(0, 0, 0, ${throttle})`);
  await page.sleep(300);
  await page.evaluate('window.__releasePose()');
  const t0 = await page.evaluate('window.__crash().simT');
  const until = Date.now() + 30000;
  let last = null;
  const kinds = new Set();
  const path = [];
  while (Date.now() < until) {
    last = await js(page, `(() => { const s = window.__craftState(); const c = window.__crash(); const k = window.__contacts();
      return { simT: c.simT, x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, hit: s.lastHitKind, wrecked: c.wrecked, obstacle: k.obstacle.length }; })()`);
    path.push(last);
    if (last.hit && last.hit !== 'none') {
      kinds.add(last.hit);
    }
    if (last.simT - t0 >= 1.5) {
      break;
    }
    await page.sleep(40);
  }
  return { last, kinds, path };
}

/* The first transformer's middle bushing, flown at level across the
 * transformer from BACK metres out at half and at 0.85 of the bushing's
 * height over the tank, where only the top capsule stands: it is met,
 * and nothing ends more than a metre past the bushing's line. The throw
 * starts a little low, since a craft let go climbs (a quad on its
 * throttle, a wing on its lift), and the height it crossed at is
 * printed. */
const BACK = 6;
async function bushing(page, plan, craft, speeds, throttle) {
  const t = plan.transformers[0];
  const u = KIT.bushings.u[1];
  const bx = t.x + t.ax * u;
  const bz = t.z + t.az * u;
  const gy = await page.evaluate(`window.__mapScene().userData.itaipu.terrain.finestAt(${t.x}, ${t.z})`);
  const top = gy + TANK.plinth + TANK.height;
  /* Across the transformer: its axis turned a quarter. */
  const nx = -t.az;
  const nz = t.ax;
  for (const f of [0.5, 0.85]) {
    for (const v of speeds) {
      const throwAt = {
        x: bx + nx * BACK, y: top + KIT.bushings.height * f - 0.25, z: bz + nz * BACK, yaw: (Math.atan2(nx, nz) * 180) / Math.PI, pitch: 0, vx: -nx * v, vy: 0, vz: -nz * v, hold: true, fresh: true,
      };
      const { last, kinds, path } = await flyInto(page, throwAt, [bx, gy + 400, bz], throttle);
      const along = (p) => -((p.x - bx) * nx + (p.z - bz) * nz);
      const cross = path.filter((p) => along(p) > -1).map((p) => p.y - top)[0];
      const past = along(last);
      const met = kinds.size > 0 || last.obstacle > 0 || last.wrecked;
      const at = cross == null ? 'never reached it' : `${cross.toFixed(1)} m over the tank`;
      check(met && past < 1, `bushing: a ${craft} at ${v} m/s across the middle bushing, ${at}, met it (${[...kinds].join(', ') || 'plant contact'}, wrecked ${last.wrecked}), ended ${(-past).toFixed(1)} m short of its line`,
        `bushing: a ${craft} at ${v} m/s, ${at}, went ${past.toFixed(1)} m past the middle bushing at ${last.speed.toFixed(1)} m/s, met ${[...kinds].join(', ') || 'nothing'}`);
    }
  }
}

/* A Timber level into the middle of the fence's longest piece, from
 * outside the yard. */
async function fence(page, plan) {
  const span = (f) => Math.hypot(f[1][0] - f[0][0], f[1][2] - f[0][2]);
  const [a, b] = plan.fence.reduce((m, f) => (span(f) > span(m) ? f : m));
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[2] + b[2]) / 2;
  const gy = await page.evaluate(`window.__surface(${mx}, ${mz}, -1e9)`);
  const l = span([a, b]);
  let nx = -(b[2] - a[2]) / l;
  let nz = (b[0] - a[0]) / l;
  if (inside(plan.outline, mx + nx * 5, mz + nz * 5)) {
    nx = -nx;
    nz = -nz;
  }
  const back = 12;
  const v = 15;
  const throwAt = {
    x: mx + nx * back, y: gy + 1.2, z: mz + nz * back, yaw: (Math.atan2(nx, nz) * 180) / Math.PI, pitch: 0, vx: -nx * v, vy: 0, vz: -nz * v, hold: true, fresh: true,
  };
  const { last, kinds } = await flyInto(page, throwAt, [mx, gy + 400, mz], 0.6);
  /* How far past the fence's line, toward the yard, it ended. */
  const past = -((last.x - mx) * nx + (last.z - mz) * nz);
  const ok = (kinds.size > 0 || last.obstacle > 0 || last.wrecked) && past < 1;
  check(ok, `fence: a Timber into the fence at ${v} m/s met it (${[...kinds].join(', ') || 'plant contact'}, wrecked ${last.wrecked}), ended ${(-past).toFixed(1)} m short of its line`,
    `fence: a Timber at ${v} m/s ended ${past.toFixed(1)} m past the fence, hits ${[...kinds].join(', ') || 'none'}, wrecked ${last.wrecked}`);
}

/* ----------------------------------------------------------------- shots */

async function shots(page) {
  await mkdir(SHOTS, { recursive: true });
  await page.evaluate('window.__drawOff(false)');
  const at = (await js(page, `${PART}.yard`)).at;
  const views = [
    ['yard-high', [at[0] + 500, at[1] + 260, at[2] + 450, ...at]],
    ['yard-low', [at[0] + 90, at[1] + 30, at[2] + 60, ...at]],
    ['yard-west', [at[0] - 560, at[1] + 60, at[2] - 120, ...at]],
  ];
  const rows = [];
  for (const [name, cam] of views) {
    /* fresh: the checks' own flights before the shots leave their wrecks
     * about, which cost yard-west 177 calls and a shadow pass's worth. */
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ x: cam[0], y: cam[1] + 30, z: cam[2], hold: true, fresh: true })})`);
    await page.evaluate(`window.__setCam(${cam.join(',')}, 60)`);
    const f0 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames > ${f0 + 20}`, 120000);
    await page.sleep(2500);
    const all = await js(page, 'window.__renderStats()');
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    await page.evaluate(`${PART}.group.visible = false`);
    const f1 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames > ${f1 + 4}`, 60000);
    const without = await js(page, 'window.__renderStats()');
    await page.evaluate(`${PART}.group.visible = true`);
    rows.push({
      name, calls: all.calls, triangles: all.triangles, without: without.calls, withoutTriangles: without.triangles,
    });
    const line = `shot ${name}: ${all.calls} calls, ${without.calls} without the yard; ${(all.triangles / 1e6).toFixed(2)} M triangles, ${(without.triangles / 1e6).toFixed(2)} M without`;
    if (without.calls > CALLS_MAX) {
      console.log(`  OVER ${line}: the view is over ${CALLS_MAX} without the yard`);
      continue;
    }
    check(all.calls <= CALLS_MAX, line, `${line}: the yard takes it over ${CALLS_MAX}`);
  }
  await page.evaluate('window.__setCam()');
  await writeFile(join(SHOTS, 'stats.json'), `${JSON.stringify(rows, null, 1)}\n`);
}

/* ------------------------------------------------------------------ main */

async function main() {
  const plan = await nodeChecks();
  console.log('');
  console.log('headless Chromium, the Itaipu map, a Timber with crash damage on');
  const page = await openPage({
    root, width: 1280, height: 720, url: '/index.html?map=itaipu', seed: seed(),
  });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
    await page.evaluate('window.__drawOff(true)');
    await pageChecks(page, plan);
    await targetChecks(page);
    await fence(page, plan);
    await bushing(page, plan, 'Timber', [20], 0.6);
    if (SHOTS) {
      await shots(page);
    }
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
  } finally {
    await page.close();
  }
  console.log('');
  console.log('headless Chromium, the Itaipu map, a five inch with crash damage on');
  const quad = await openPage({
    root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed('5inch'),
  });
  try {
    await quad.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
    await quad.evaluate('window.__drawOff(true)');
    await bushing(quad, plan, 'five inch', [30, 45], 0.5);
    const real = quad.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
  } finally {
    await quad.close();
  }
  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s)`);
    process.exitCode = 1;
    return;
  }
  console.log('PASS, the right bank yard stands fenced and solid round what the town draws');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
