/*
 * collider-audit.js: every tree that is drawn is a tree a plane can hit.
 *
 *   node scripts/collider-audit.js [--maps=swiss2,alps] [--only=audit|fly] [--shots=DIR]
 *   SIM_GPU=1 for the machine's GPU instead of SwiftShader
 *   --shots=DIR a picture of each flight into a bush, from beside it, into
 *               DIR (outside the repository: pictures are not committed)
 *
 * The owner flew a Zagi at 102 km/h, 1.4 m over the grass, through a bush
 * on the stream's bank in the Swiss valley, and it touched nothing: the
 * trees, the rocks, the fences and the gondola's towers were collided only
 * within 700 m of the strip (the valley was built on "further out the
 * hillside is the first thing a wing hits"), and the valley's floor, its
 * stream and the stream's gallery of bushes run three kilometres. Past
 * 700 m 22 770 of swiss2's 24 994 drawn trees had no collider at all.
 *
 * THE AUDIT (--only=audit): on each map, every drawn tree read off the
 * page (swiss2's impostors, which hold every tree the forest planted, and
 * the alps' instanced stands), and whether the colliders hold it: a 'tree'
 * post standing at its trunk, and for a broadleaf at least one 'canopy'
 * sphere inside its crown's reach, which is what src/game/crashworld.js
 * collectTrees hands the plant as its leaves. Counted by distance from the
 * strip, the missing ones listed.
 *
 * THE FLIGHTS (--only=fly): the owner's flight, on swiss2. A Zagi at
 * 28.3 m/s, level, 1.4 m over the ground, from the stream's side into a
 * bush on its bank, at the bushes nearest four points down the stream past
 * 700 m and one inside it, aimed through the drawn clump of leaves widest
 * at that height (species.js crownClumps placed as the forest places it).
 * It must meet the bush: the plant's tree event on foliage or wood, or its
 * inTree flag, within 1.5 s of the plant's clock.
 *
 * Passes when every drawn tree on every map has its post (and a broadleaf
 * its leaves), and every flight meets its bush.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const MAPS = arg('maps', 'swiss2,alps').split(',');
const only = arg('only', '');
const shotsDir = arg('shots', '');

/* The owner's flight: the replay's 102 km/h at 1.4 m. */
const FLY_AIR = 'zagi1219';
const FLY_V = 102 / 3.6;
const FLY_AGL = 1.4;
/* Where down the stream to look for a bush on its bank, z in metres: four
 * past 700 m from the strip and one inside it. */
const FLY_AT = [-1000, 850, 1150, 1300, 600];
/* A bank bush: an open grown broadleaf under this scale (forest.js bush,
 * 0.16 to 0.38), this near the stream's line. */
const BUSH_S = 0.4;
const BANK = 10;
/* The run in, m, and how long the plant's clock is watched, s. */
const RUN = 14;
const WATCH_S = 1.5;
/* A post is the tree's when it stands this near the drawn trunk, m: the
 * drawing keeps the position as a float. */
const AT = 0.05;

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

/* Every drawn tree on the page's map, world frame: { x, y, z, s, broad,
 * name, reach } with, for a swiss2 broadleaf, its clumps as drawn. */
const DRAWN = `(async () => {
  const sc = window.__mapScene();
  const out = [];
  if (window.__map().id === 'swiss2') {
    const sp = await import('/src/render/library/vegetation/species.js');
    const clumpsOf = sp.VARIANTS.map((v) => (v.kind === 'beech' || v.kind === 'maple' ? sp.crownClumps(v).clumps : null));
    sc.traverse((o) => {
      if (o.name !== 'swiss2-impostors') {
        return;
      }
      const a = o.geometry.attributes.aTree;
      const b = o.geometry.attributes.aTree2;
      for (let k = 0; k < o.geometry.instanceCount; k += 1) {
        const x = a.getX(k), y = a.getY(k), z = a.getZ(k), s = a.getW(k), yaw = b.getX(k), v = b.getY(k);
        const q = clumpsOf[v];
        const t = { x, y, z, s, name: sp.VARIANTS[v].name, broad: Boolean(q), reach: 0 };
        if (q) {
          const c = Math.cos(yaw) * s;
          const sn = Math.sin(yaw) * s;
          t.clumps = q.map((u) => ({ x: x + c * u.c.x + sn * u.c.z, y: y + s * u.c.y, z: z - sn * u.c.x + c * u.c.z, r: u.rc * s * sp.CLUMP_REACH }));
          t.reach = Math.max(...t.clumps.map((u) => Math.hypot(u.x - x, u.z - z) + u.r));
        }
        out.push(t);
      }
    });
  } else {
    sc.traverse((o) => {
      const m = /^(beech|larch|spruceTall|spruceSquat)-[0-9]+$/.exec(o.name);
      if (!m || !o.isInstancedMesh) {
        return;
      }
      const e = o.instanceMatrix.array;
      for (let k = 0; k < o.count; k += 1) {
        const s = Math.hypot(e[k * 16], e[k * 16 + 1], e[k * 16 + 2]);
        out.push({ x: e[k * 16 + 12], y: e[k * 16 + 13], z: e[k * 16 + 14], s, name: m[1], broad: m[1] === 'beech', reach: 8 * s });
      }
    });
  }
  return out;
})()`;

/* The drawn trees against the colliders: each with its post and, for a
 * broadleaf, a canopy sphere inside its reach. Summarised in the page, so
 * the tens of thousands of trees never cross the socket. */
const AUDIT = `(async () => {
  const drawn = await window.__colliderAudit.drawn();
  const cell = (x, z) => Math.floor(x) + ',' + Math.floor(z);
  const grid = (list) => {
    const g = new Map();
    for (const c of list) {
      const k = cell(c.a[0], c.a[2]);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(c);
    }
    return g;
  };
  const posts = grid(window.__crashSolids(0, 0, 1e6, 'tree').filter((c) => !c.box));
  const leaves = grid(window.__crashSolids(0, 0, 1e6, 'canopy'));
  const near = (g, x, z, r) => {
    const out = [];
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i += 1) {
      for (let j = Math.floor(z - r); j <= Math.floor(z + r); j += 1) {
        for (const c of g.get(i + ',' + j) || []) {
          if (Math.hypot(c.a[0] - x, c.a[2] - z) <= r) out.push(c);
        }
      }
    }
    return out;
  };
  const bands = {};
  const missing = [];
  for (const t of drawn) {
    const post = near(posts, t.x, t.z, ${AT}).length > 0;
    const leaf = !t.broad || near(leaves, t.x, t.z, Math.max(1, t.reach)).length > 0;
    const band = Math.floor(Math.hypot(t.x, t.z) / 500) * 500;
    bands[band] ??= { drawn: 0, missing: 0 };
    bands[band].drawn += 1;
    if (!post || !leaf) {
      bands[band].missing += 1;
      missing.push({ name: t.name, x: +t.x.toFixed(1), z: +t.z.toFixed(1), post, leaf });
    }
  }
  return JSON.stringify({ drawn: drawn.length, missing: missing.length, bands, sample: missing.filter((m, i) => i % Math.max(1, Math.floor(missing.length / 6)) === 0).slice(0, 6) });
})()`;

/* The bushes on the stream's bank nearest each of FLY_AT, and the path
 * through each: level at FLY_AGL over the ground under the bush, through
 * the drawn clump widest at that height, from the stream's side. */
const PICK = `(async () => {
  const drawn = await window.__colliderAudit.drawn();
  const sc = window.__mapScene();
  const line = [];
  sc.traverse((o) => {
    if (o.name !== 'swiss2-stream') return;
    const p = o.geometry.attributes.position;
    for (let i = 2; i < p.count; i += 5) line.push({ x: p.getX(i), z: p.getZ(i) });
  });
  const nearest = (x, z) => {
    let best = null;
    for (const q of line) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (!best || d < best.d) best = { d, x: q.x, z: q.z };
    }
    return best;
  };
  const out = [];
  for (const want of ${JSON.stringify(FLY_AT)}) {
    const bank = drawn.filter((t) => t.broad && t.s < ${BUSH_S} && Math.abs(t.z - want) < 150);
    const picks = [];
    for (const t of bank) {
      const w = nearest(t.x, t.z);
      if (w.d > ${BANK}) continue;
      const g = window.__heightAt(t.x, t.z);
      const y = g + ${FLY_AGL};
      /* The clump widest at y: its half chord there. */
      let best = null;
      for (const c of t.clumps) {
        const dy = y - c.y;
        const half = c.r * c.r > dy * dy ? Math.sqrt(c.r * c.r - dy * dy) : 0;
        if (!best || half > best.half) best = { c, half };
      }
      if (!best || best.half < 0.6) continue;
      picks.push({ t, w, y, g, best, dz: Math.abs(t.z - want) });
    }
    picks.sort((a, b) => a.dz - b.dz);
    const p = picks[0];
    if (!p) {
      out.push({ want, none: true });
      continue;
    }
    /* From the stream's side toward the clump. */
    let ux = p.best.c.x - p.w.x;
    let uz = p.best.c.z - p.w.z;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l;
    uz /= l;
    out.push({ want, x: p.best.c.x, z: p.best.c.z, y: p.y, ground: p.g, ux, uz, bush: { name: p.t.name, x: p.t.x, z: p.t.z, s: p.t.s, h: p.t.s * (p.t.name === 'maple' ? 18 : 17) }, half: p.best.half, r: Math.round(Math.hypot(p.t.x, p.t.z)) });
  }
  return JSON.stringify(out);
})()`;

const HELPERS = `window.__colliderAudit = { drawn: () => ${DRAWN} }; 'ok'`;

async function openMap(map, airframe) {
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${map}`, seed: seeds(map, airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.sleep(1500);
  await page.evaluate(HELPERS);
  return page;
}

async function audit(map) {
  const page = await openMap(map, FLY_AIR);
  try {
    const a = JSON.parse(await page.evaluate(AUDIT, 300000));
    const bands = Object.entries(a.bands).sort((u, v) => Number(u[0]) - Number(v[0]))
      .map(([b, n]) => `${b}-${Number(b) + 500} m ${n.missing}/${n.drawn}`).join(', ');
    console.log(`${map}: ${a.missing} of ${a.drawn} drawn trees without their collider (by distance from the strip, missing/drawn: ${bands})`);
    for (const m of a.sample) {
      console.log(`  e.g. ${m.name} at ${m.x}, ${m.z}: ${m.post ? 'post' : 'NO POST'}, ${m.leaf ? 'leaves' : 'NO LEAVES'}`);
    }
    return { name: `every drawn tree on ${map} has its collider`, ok: a.drawn > 0 && a.missing === 0, detail: `${a.missing} of ${a.drawn} missing` };
  } finally {
    await page.close();
  }
}

async function fly() {
  const page = await openMap('swiss2', FLY_AIR);
  const rows = [];
  try {
    const picks = JSON.parse(await page.evaluate(PICK, 300000));
    for (const p of picks) {
      if (p.none) {
        console.log(`no bank bush found near z ${p.want}`);
        rows.push({ ok: false });
        continue;
      }
      const o = {
        fresh: true,
        x: p.x - p.ux * RUN,
        y: p.y,
        z: p.z - p.uz * RUN,
        yaw: (Math.atan2(-p.ux, -p.uz) * 180) / Math.PI,
        pitch: 0,
        vx: p.ux * FLY_V,
        vy: 0,
        vz: p.uz * FLY_V,
      };
      const thrown = JSON.parse(await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify(o)}))`));
      if (!thrown || thrown.ok === false) {
        throw new Error(`throw refused: ${JSON.stringify(thrown)}`);
      }
      const sim0 = await page.evaluate('window.__crash().simT');
      const flags = new Set();
      let st = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        await page.sleep(40);
        st = JSON.parse(await page.evaluate('JSON.stringify({ s: window.__craftState(), f: window.__crash().flagNames, t: window.__crash().simT })'));
        st.f.forEach((f) => flags.add(f));
        if (st.t - sim0 > WATCH_S) {
          break;
        }
      }
      const log = JSON.parse(await page.evaluate('JSON.stringify(window.__crashLog().map((e) => ({ type: e.type, part: e.part, surface: e.surface })))'));
      const tree = log.filter((e) => e.type === 'tree' || e.surface === 'foliage' || e.surface === 'wood');
      const met = tree.length > 0 || flags.has('inTree');
      const row = { ...p, met, speed: st.s.speed, flags: [...flags], events: [...new Set(log.map((e) => `${e.type} ${e.part} on ${e.surface}`))] };
      rows.push({ ok: met });
      console.log(`${FLY_AIR} ${(FLY_V * 3.6).toFixed(0)} km/h ${FLY_AGL} m up into the ${p.bush.name} bush (${p.bush.h.toFixed(1)} m tall) at ${p.bush.x.toFixed(1)}, ${p.bush.z.toFixed(1)},`
        + ` ${p.r} m from the strip, through a clump ${(2 * p.half).toFixed(1)} m across there: ${met ? 'MET it' : 'WENT THROUGH'},`
        + ` ${row.speed.toFixed(1)} m/s after ${WATCH_S} s [${row.flags.join(',')}] ${row.events.slice(0, 5).join('; ')}`);
      if (shotsDir) {
        await page.evaluate(`window.__setCam(${p.bush.x - p.uz * 12 - p.ux * 6}, ${p.ground + 3}, ${p.bush.z + p.ux * 12 - p.uz * 6}, ${p.bush.x}, ${p.ground + 1.5}, ${p.bush.z}, 55)`);
        await page.sleep(800);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(shotsDir, `bush-z${p.want}.png`), Buffer.from(data, 'base64'));
      }
    }
  } finally {
    await page.close();
  }
  return { name: 'a Zagi at 102 km/h, 1.4 m up, meets every stream bank bush it is flown into', ok: rows.length > 0 && rows.every((r) => r.ok), detail: `${rows.filter((r) => r.ok).length} of ${rows.length} met` };
}

if (shotsDir) {
  await mkdir(resolve(shotsDir), { recursive: true });
}
const checks = [];
if (only !== 'fly') {
  for (const map of MAPS) {
    checks.push(await audit(map));
  }
}
if (only !== 'audit') {
  checks.push(await fly());
}
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
