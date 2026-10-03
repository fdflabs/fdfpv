/*
 * tree-impact-check.js: every aircraft into a tree, fast, and what is left
 * of it is a wreck and no faster than it came.
 *
 *   SIM_GPU=1 node scripts/tree-impact-check.js [--maps=swiss2,alps]
 *        [--air=interceptor,f16878] [--speeds=20,40,60]
 *
 * The swiss2 collision audit (scripts/collide-audit-swiss2.js, PR #254)
 * threw an F-16 at 60 m/s into a spruce: at t = 0.300 s its speed went
 * from 57 to 252 m/s, by 0.35 s its state was NaN, and a later throw froze
 * the page. The crown's drag judged each hull point against the spin the
 * step started with, not the spin the points before it had left, so a
 * craft with its wings gone and little inertia left was pushed back and
 * forth harder at every point (crash.c, point_spin); and the trick
 * detector then named the runaway tumble one turn at a time.
 *
 * This throws every aircraft the shell seats, one page a map, through the
 * shell's own path (window.__crashThrow, the plant's trees declared by the
 * crash world as the craft moves), level and along a line clear of every
 * other solid, at 20, 40 and 60 m/s, at three targets on each map:
 *
 *   conifer   through a conifer's crown at the middle of its height to the
 *             trunk inside it, the audit's spruce
 *   trunk     a broadleaf's trunk 1.2 m over the ground, under its leaves
 *   crown     a broadleaf's crown through its trunk, at its largest clump
 *
 * Each throw passes when:
 *   the plant's state is finite and sound throughout: no NaN on the
 *     craft, and window.__crash().plantFaults (main.js, plantFault) did
 *     not move;
 *   it gains no energy: 1/2 v^2 + g h of the craft never rises more than
 *     ENERGY_SLACK past what it was thrown with (the thrust of a quad's
 *     idle and the drawn height's interpolation are in the slack; the
 *     runaway was a factor of 18 by 0.3 s);
 *   it is a wreck: the plant broke, crushed, cracked, bent, chipped or
 *     knocked something, or the tree held it (under a third of its speed
 *     with the tree met);
 * and the run passes when every throw does and the pages logged no error.
 *
 * THE AUDIT'S OWN TREES, with the F-16 seated: the trunks #254 threw it
 * into when it went NaN (AUDIT_TREES), at 60 m/s along a clear line, each
 * judged as above; then the throw that froze the page after them, a fresh
 * one in clear air, which must come back within THROW_MS, finite, and
 * fall as a throw does (scripts/tree-nan-selftest.js is the plant's half,
 * in checks.yml).
 *
 * One browser at a time, through tests/lib/page.js. About five minutes a
 * map on this machine's GPU.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const MAPS = arg('maps', 'swiss2,alps').split(',');
const AIR = arg('air', AIRFRAMES.map((a) => a.id).join(',')).split(',');
const SPEEDS = arg('speeds', '20,40,60').split(',').map(Number);

/* The run up, m: to a trunk, and from outside a crown's edge. Short, so a
 * quad thrown level at 20 m/s with its motors idle has dropped under a
 * metre when it gets there (the audit's 18 m put it on the grass first),
 * and long enough that the plant has the tree declared before it. */
const RUN_TRUNK = 8;
const RUN_OUT = 3;
const ENERGY_SLACK = 0.02;
/* Held by the tree: under this share of the speed it was thrown at. */
const HELD = 1 / 3;
const DAMAGE = ['break', 'crush', 'crack', 'bend', 'chip', 'knock'];
/* A throw that does not come back in this long froze the page. */
const THROW_MS = 30000;
/* #254's item 1: the trunks an F-16 at 60 m/s went NaN at, world x y z. */
const AUDIT_TREES = {
  swiss2: [[1885.7, 445, -1235.3], [1386.8, 675.9, 2071.5], [1596.4, 387.7, -1298.9]],
  alps: [[395.1, 66.7, -2280.1], [615.2, 148.9, -2402.9]],
};

function seeds(map, airframe) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map,
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* ---------- In the page. Each function is sent as its source, so it
 * closes over nothing here. */

/* One target of each kind, nearest the spawn first, on a level line from
 * one of eight headings that is over the ground and 1.5 m clear of every
 * solid but the tree's own post and leaves. */
function pageTargets(o) {
  const { RUN_TRUNK, RUN_OUT } = o;
  const KINDS = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom', 'train', 'banner', 'pylon', 'hoop'];
  const solids = [];
  for (const k of KINDS) {
    for (const s of window.__crashSolids(0, 0, 1e9, k)) {
      s.kind = k;
      const r = s.box ? 0 : s.r;
      s.lo = [0, 1, 2].map((a) => Math.min(s.a[a], s.b[a]) - r);
      s.hi = [0, 1, 2].map((a) => Math.max(s.a[a], s.b[a]) + r);
      solids.push(s);
    }
  }
  const G = 4;
  const grid = new Map();
  const gk = (i, j) => i * 100000 + j;
  solids.forEach((s, n) => {
    for (let i = Math.floor(s.lo[0] / G); i <= Math.floor(s.hi[0] / G); i += 1) {
      for (let j = Math.floor(s.lo[2] / G); j <= Math.floor(s.hi[2] / G); j += 1) {
        const key = gk(i, j);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(n);
      }
    }
  });
  const dist = (s, x, y, z) => {
    if (s.box) {
      return Math.hypot(Math.max(s.lo[0] - x, 0, x - s.hi[0]), Math.max(s.lo[1] - y, 0, y - s.hi[1]), Math.max(s.lo[2] - z, 0, z - s.hi[2]));
    }
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], dz = s.b[2] - s.a[2];
    const L = dx * dx + dy * dy + dz * dz;
    let t = L > 0 ? ((x - s.a[0]) * dx + (y - s.a[1]) * dy + (z - s.a[2]) * dz) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.max(0, Math.hypot(x - s.a[0] - t * dx, y - s.a[1] - t * dy, z - s.a[2] - t * dz) - s.r);
  };
  /* The nearest solid to (x, y, z) that is not one of `own`. */
  const gap = (x, y, z, own) => {
    let best = Infinity;
    for (let i = Math.floor((x - 2) / G); i <= Math.floor((x + 2) / G); i += 1) {
      for (let j = Math.floor((z - 2) / G); j <= Math.floor((z + 2) / G); j += 1) {
        for (const n of grid.get(gk(i, j)) || []) {
          if (!own.has(solids[n])) best = Math.min(best, dist(solids[n], x, y, z));
        }
      }
    }
    return best;
  };
  const ground = (x, z) => window.__surface(x, z, 1e9);
  const line = (cx, y, cz, own, run) => {
    for (let h = 0; h < 8; h += 1) {
      const ux = Math.cos((h * Math.PI) / 4), uz = Math.sin((h * Math.PI) / 4);
      let clear = true;
      for (let t = -run; t <= 8 && clear; t += 0.5) {
        const x = cx + ux * t, z = cz + uz * t;
        clear = ground(x, z) < y - 0.6 && gap(x, y, z, own) > 1.5;
      }
      if (clear) return { ux, uz, run };
    }
    return null;
  };
  const spawn = window.__map().spawn;
  const posts = solids.filter((s) => s.kind === 'tree' && !s.box && Math.abs(s.a[0] - s.b[0]) < 1e-3 && Math.abs(s.a[2] - s.b[2]) < 1e-3);
  posts.sort((p, q) => Math.hypot(p.a[0] - spawn.x, p.a[2] - spawn.z) - Math.hypot(q.a[0] - spawn.x, q.a[2] - spawn.z));
  /* A broadleaf's leaves: the canopy spheres within its crown's reach. */
  const leaves = (p) => solids.filter((s) => s.kind === 'canopy' && Math.hypot(s.a[0] - p.a[0], s.a[2] - p.a[2]) < 8);
  const out = {};
  /* The audit's trees: the post nearest each point, at the point's height,
   * on a clear line, the trunk's run up. */
  if (o.at) {
    o.at.forEach(([x, y, z], i) => {
      const p = posts.slice().sort((a, b) => Math.hypot(a.a[0] - x, a.a[2] - z) - Math.hypot(b.a[0] - x, b.a[2] - z))[0];
      if (!p || Math.hypot(p.a[0] - x, p.a[2] - z) > 3) {
        return;
      }
      const own = new Set([p, ...leaves(p)]);
      const u = line(p.a[0], y, p.a[2], own, RUN_TRUNK);
      if (u) out[`audit${i + 1}`] = { x: p.a[0], y, z: p.a[2], ...u };
    });
    return JSON.stringify(out);
  }
  for (const p of posts) {
    if (out.conifer && out.trunk && out.crown) break;
    const cx = p.a[0], cz = p.a[2];
    const y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1]);
    if (p.r > 0.6) {
      if (out.conifer) continue;
      const y = (y0 + y1) / 2;
      const u = line(cx, y, cz, new Set([p]), p.r + RUN_OUT);
      if (u) out.conifer = { x: cx, y, z: cz, ...u };
      continue;
    }
    const own = new Set([p, ...leaves(p)]);
    if (own.size < 2) continue;
    const low = Math.min(...[...own].filter((s) => s !== p).map((s) => s.lo[1]));
    if (!out.trunk) {
      const y = ground(cx, cz) + 1.2;
      const u = y < low - 1.5 ? line(cx, y, cz, own, RUN_TRUNK) : null;
      if (u) {
        out.trunk = { x: cx, y, z: cz, ...u };
        continue;
      }
    }
    if (!out.crown) {
      const clumps = [...own].filter((s) => s !== p);
      const big = clumps.sort((s, q) => q.r - s.r)[0];
      const y = big.a[1];
      const reach = Math.max(...clumps.map((s) => Math.hypot(s.a[0] - cx, s.a[2] - cz) + s.r));
      const u = line(cx, y, cz, own, reach + RUN_OUT);
      if (u) out.crown = { x: cx, y, z: cz, ...u };
    }
  }
  return JSON.stringify(out);
}

/* One throw: the craft its run up short of the target, level, along the
 * line, and every frame until it has had a second past the target. */
async function pageThrow(o) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const g = 9.80665;
  const faults0 = window.__crash().plantFaults;
  const yaw = (Math.atan2(-o.ux, -o.uz) * 180) / Math.PI;
  window.__stick(0, 0, 0, 0);
  const r = window.__crashThrow({
    fresh: true, x: o.x - o.ux * o.run, y: o.y, z: o.z - o.uz * o.run, yaw, pitch: 0,
    vx: o.ux * o.v, vy: 0, vz: o.uz * o.v,
  });
  if (!r || r.ok === false) {
    return JSON.stringify({ error: JSON.stringify(r) });
  }
  const t0 = window.__crash().simT;
  const e0 = 0.5 * o.v * o.v + g * o.y;
  let eMax = e0, vMax = o.v, finite = true, still = 0, end = o.v;
  const wall = performance.now();
  for (let f = 0; f < 1200 && performance.now() - wall < 10000; f += 1) {
    await frame();
    const st = window.__craftState();
    if (!Number.isFinite(st.speed) || !Number.isFinite(st.worldY)) {
      finite = false;
      break;
    }
    end = st.speed;
    eMax = Math.max(eMax, 0.5 * st.speed * st.speed + g * st.worldY);
    vMax = Math.max(vMax, st.speed);
    still = st.speed < 0.2 ? still + 1 : 0;
    if (still >= 5 || window.__crash().simT - t0 > (o.run + 6) / o.v + 1) break;
  }
  window.__stick();
  const log = [...new Set(window.__crashLog().map((e) => e.type))];
  const c = window.__contacts();
  return JSON.stringify({
    finite, faults: window.__crash().plantFaults - faults0, gain: eMax / e0 - 1, vMax, end, log,
    met: log.length > 0 || c.obstacle.length > 0,
    parts: window.__crash().parts.length,
    fault: window.__frameFault ? window.__frameFault.stack || window.__frameFault.message : null,
  });
}

/* ---------- In Node. */

async function openMap(map) {
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${map}`, seed: seeds(map, AIR[0]) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.sleep(1500);
  const id = await page.evaluate('window.__map().id');
  if (id !== map) {
    await page.close();
    throw new Error(`the page seated map ${id}, not ${map}`);
  }
  /* In flight, so a swap is taken (main.js hotSwap). */
  await page.evaluate(`(async () => {
    window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
    for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(r));
  })()`);
  return page;
}

async function seat(page, air) {
  if (await page.evaluate('window.__ui.settings.airframe') === air) {
    return;
  }
  const ok = await page.evaluate(`window.__ui.onHotSwap(${JSON.stringify(air)})`);
  const now = await page.evaluate('window.__ui.settings.airframe');
  if (!ok || now !== air) {
    throw new Error(`the page would not seat ${air} (it has ${now})`);
  }
}

async function throwOnce(page, o) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), THROW_MS);
  });
  const out = await Promise.race([page.evaluate(`(${pageThrow.toString()})(${JSON.stringify(o)})`), limit]);
  clearTimeout(timer);
  return out ? JSON.parse(out) : { frozen: true };
}

function judge(row, v) {
  if (row.frozen) return 'froze the page';
  if (row.error) return row.error;
  if (!row.finite) return 'the state went NaN';
  if (row.faults > 0) return `${row.faults} plant faults`;
  if (row.gain > ENERGY_SLACK) return `gained ${(100 * row.gain).toFixed(1)} percent of its energy`;
  const damaged = row.log.some((t) => DAMAGE.includes(t));
  const held = row.end < HELD * v && row.met;
  if (!damaged && !held) return `no wreck: ${row.end.toFixed(1)} m/s at the end, log ${row.log.join(',') || 'empty'}${row.met ? '' : ', met nothing'}`;
  return '';
}

let failed = 0;
let flown = 0;
for (const map of MAPS) {
  console.log(`=== ${map}`);
  const page = await openMap(map);
  try {
    const targets = JSON.parse(await page.evaluate(`(${pageTargets.toString()})(${JSON.stringify({ RUN_TRUNK, RUN_OUT })})`));
    for (const k of ['conifer', 'trunk', 'crown']) {
      if (!targets[k]) {
        failed += 1;
        console.log(`  FAIL  no ${k} with a clear line on ${map}`);
      } else {
        const t = targets[k];
        console.log(`  ${k.padEnd(8)} (${[t.x, t.y, t.z].map((v) => v.toFixed(1)).join(', ')}) heading (${t.ux.toFixed(2)}, ${t.uz.toFixed(2)})`);
      }
    }
    let frozen = false;
    let faultSeen = false;
    for (const air of AIR) {
      if (frozen) break;
      await seat(page, air);
      for (const [k, t] of Object.entries(targets)) {
        if (frozen) break;
        for (const v of SPEEDS) {
          const row = await throwOnce(page, { ...t, v });
          flown += 1;
          const why = judge(row, v);
          const say = row.frozen || row.error ? '' : `gain ${(100 * row.gain).toFixed(2)}%, top ${row.vMax.toFixed(1)} m/s, end ${row.end.toFixed(1)} m/s, ${row.log.join(',') || (row.met ? 'stopped by a contact, nothing broken' : '')}`;
          console.log(`  ${why ? 'FAIL' : 'pass'}  ${air.padEnd(14)} ${k.padEnd(8)} ${String(v).padStart(2)} m/s  ${why || say}`);
          if (why) failed += 1;
          if (row.fault && !faultSeen) {
            faultSeen = true;
            console.log(`  the frame loop faulted by this throw: ${row.fault.slice(0, 800)}`);
          }
          if (row.frozen) {
            frozen = true;
            break;
          }
        }
      }
    }
    if (!frozen && AIR.includes('f16878') && AUDIT_TREES[map]) {
      await seat(page, 'f16878');
      const at = AUDIT_TREES[map];
      const audit = JSON.parse(await page.evaluate(`(${pageTargets.toString()})(${JSON.stringify({ RUN_TRUNK, RUN_OUT, at })})`));
      at.forEach((p, i) => {
        if (!audit[`audit${i + 1}`]) {
          failed += 1;
          console.log(`  FAIL  no clear line to the audit's tree at (${p.join(', ')})`);
        }
      });
      for (const [k, t] of Object.entries(audit)) {
        if (frozen) break;
        const row = await throwOnce(page, { ...t, v: 60 });
        flown += 1;
        const why = judge(row, 60);
        console.log(`  ${why ? 'FAIL' : 'pass'}  f16878         ${k} (${[t.x, t.y, t.z].map((v) => v.toFixed(1)).join(', ')}) 60 m/s  ${why || `gain ${(100 * row.gain).toFixed(2)}%, top ${row.vMax.toFixed(1)} m/s, end ${row.end.toFixed(1)} m/s, ${row.log.join(',')}`}`);
        if (why) failed += 1;
        frozen = Boolean(row.frozen);
      }
      if (!frozen) {
        /* The audit's freeze: the next throw after them. In clear air 300 m
         * over the spawn, level at 30 m/s, nothing to meet: it comes back,
         * stays finite and falls. */
        const sp = JSON.parse(await page.evaluate('JSON.stringify(window.__map().spawn)'));
        const row = await throwOnce(page, { x: sp.x, y: sp.y + 300, z: sp.z, ux: 1, uz: 0, run: 0, v: 30 });
        flown += 1;
        const why = row.frozen ? 'froze the page' : row.error ? row.error : !row.finite ? 'the state went NaN' : row.faults > 0 ? `${row.faults} plant faults` : '';
        console.log(`  ${why ? 'FAIL' : 'pass'}  f16878         the next throw, in clear air, comes back finite  ${why || `top ${row.vMax.toFixed(1)} m/s, ${row.met ? 'met something' : 'met nothing'}`}`);
        if (why) failed += 1;
      }
    }
    const errors = [...new Set(page.errors)];
    if (errors.length > 0) {
      failed += 1;
      console.log(`  FAIL  the page logged ${errors.length} distinct errors: ${errors.slice(0, 3).join(' | ').slice(0, 600)}`);
    }
  } finally {
    await page.close();
  }
}

console.log(`\n${flown} throws, ${failed} failures`);
console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
