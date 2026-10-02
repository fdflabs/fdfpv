/*
 * town-check.js: package F's promises for the Itaipu map, measured
 * (docs/ITAIPU-PLAN.md section 14, row F; section 7).
 *
 * In Node, the whole town built from the data folder's own files
 * (FDFPV_ITAIPU_DATA, by default ~/Desktop/fdfpv-itaipu-data) over the
 * hero's ground read off its tiles as the terrain engine reads them:
 *
 *   counts      every building in osm/buildings.json planned, drawn and
 *               roofed: as many roof records as buildings, one per OSM id;
 *               every tower in osm/power.json stood;
 *   roofs       every wall box of every building is under its roof's
 *               upper face at each of its corners, and every roof is over
 *               its ground;
 *   drape       every road piece's corners on the ground plus its lift,
 *               and at points inside every piece the road is over the
 *               ground and within 0.1 m of it;
 *   budget      the town's streamed colliders at every 250 m of the hero
 *               square, the most printed with where;
 *   same        built twice, the town is the same to the bit.
 *
 * In headless Chromium, on the Itaipu map as a pilot's choice builds it,
 * with the run's crash damage on:
 *
 *   builds      no console error; the part's counts equal Node's; the
 *               Friendship Bridge is drawn in the ring;
 *   drape       road vertices drawn within 0.1 m of the terrain's own
 *               ground (terrain.finestAt), over it;
 *   budget      every streaming part's colliders (the town's and the
 *               vegetation's) at every 500 m of the hero, under 25 000 at
 *               the densest (section 13);
 *   refill      the pilot moved across the town refills the set round it
 *               through the map's own per frame update, and the times are
 *               printed;
 *   walls       a building's wall near the craft is a `wall` to the
 *               shell's sweep (window.__hit), one 500 to 1 000 m off is
 *               one too (its one box), one past 1 000 m is not there;
 *   roofs       a five inch let down on 20 roofs (houses, flat slabs,
 *               sheds) comes to rest on each and breaks nothing;
 *   crash world after a refill renumbers the streamed set, the crash
 *               world (src/main.js declareCrashWorld) is declared again
 *               from the new generation (window.__crash().streamGen);
 *   wires       a Skyhunter flown level into a conductor is a wreck, and
 *               its crash met the surface `wire`;
 *   towers      a Skyhunter flown level into a tower is a wreck;
 *   renumber    a Skyhunter flown into a streamed wall just after a refill
 *               renumbered the set is met by it, with no host contact the
 *               plant did not hold (window.__contacts().unheld).
 *
 *   node scripts/town-check.js [--node | --sky] [--shots=DIR]
 *
 * --node runs the Node half alone, --sky the Node half and the Skyhunter's
 * page. --shots=DIR also leaves pictures of
 * the town in DIR, with the draw calls and triangles each view costs and
 * the town's own share of them (SIM_GPU=1 for the machine's GPU).
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

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import {
  decode, HERO, TILE_CELLS, TILE_SAMPLES,
} from '../src/maps/terrain/frame.js';
import { ITAIPU_FRAME } from '../src/maps/itaipu/terrain/frame.js';
import {
  planTown, WALLS_R, FINE_R, MOVE,
} from '../src/maps/itaipu/town/model.js';
import { roofTop } from '../src/maps/alps/roofs.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const NODE_ONLY = process.argv.includes('--node');
const SKY_ONLY = process.argv.includes('--sky');
const SHOTS = arg('shots', null);

/* Section 14 row F and section 13. */
const DRAPE_TOL = 0.1;
const STREAM_BUDGET = 25000;
/* The town's share of it: the near trees take 12 500 at most (package G,
 * #192), so the town must fit in the rest wherever the pilot is. */
const TOWN_SHARE = STREAM_BUDGET - 12500;
const ROOFS = 20;
const OSM_FILES = ['osm/buildings.json', 'osm/roads.json', 'osm/power.json', 'osm/landuse.json'];

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const ok = (m) => console.log(`  ok   ${m}`);

/* ---------------------------------------------------------------- Node */

/*
 * The ground as the engine reads it (src/maps/terrain/engine.js
 * finestAt and tri): the finest tile's two triangles a cell,
 * on the same tiles the page draws.
 */
async function groundFrom(manifest) {
  const half = manifest.frame.ring[1];
  const tiles = new Map();
  const load = async (level, i, j) => {
    const b = await readFile(join(DATA, level === HERO ? `hero/${i}_${j}.bin` : `${level}/${i}_${j}.bin`));
    tiles.set(`${level}:${i}:${j}`, new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2).slice());
  };
  const jobs = [];
  for (const l of manifest.levels) {
    for (let j = 0; j < l.grid; j += 1) {
      for (let i = 0; i < l.grid; i += 1) {
        jobs.push(load(l.level, i, j));
      }
    }
  }
  for (const [i, j] of manifest.hero.tiles) {
    jobs.push(load(HERO, i, j));
  }
  await Promise.all(jobs);
  const get = (level, i, j) => tiles.get(`${level}:${i}:${j}`) ?? null;
  const extent = 2 * half;
  return (x, z) => {
    for (let level = HERO; level <= ITAIPU_FRAME.coarsest; level += 1) {
      const cell = level === HERO ? 10 : 30 * 2 ** level;
      const gx = (x + half) / cell;
      const gz = (z + half) / cell;
      const ci = Math.floor(gx);
      const cj = Math.floor(gz);
      const ti = Math.floor(Math.min(ci, Math.floor(extent / cell) - 1) / TILE_CELLS);
      const tj = Math.floor(Math.min(cj, Math.floor(extent / cell) - 1) / TILE_CELLS);
      const d = get(level, ti, tj);
      if (!d) {
        continue;
      }
      const lx = Math.min(TILE_CELLS - 1, ci - ti * TILE_CELLS);
      const lz = Math.min(TILE_CELLS - 1, cj - tj * TILE_CELLS);
      const fu = Math.min(1, gx - ti * TILE_CELLS - lx);
      const fv = Math.min(1, gz - tj * TILE_CELLS - lz);
      const k = lz * TILE_SAMPLES + lx;
      const h00 = decode(d[k]);
      const h10 = decode(d[k + 1]);
      const h01 = decode(d[k + TILE_SAMPLES]);
      const h11 = decode(d[k + TILE_SAMPLES + 1]);
      if (fu + fv <= 1) {
        return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
      }
      return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
    }
    throw new Error(`no tile holds (${x}, ${z})`);
  };
}

/* A counting fill: what stream(fill, x, z) adds, counted, indices made up. */
function countingFill() {
  const f = {
    n: 0,
    addBox() {
      f.n += 1;
      return f.n - 1;
    },
    add() {
      f.n += 1;
      return f;
    },
    addPost() {
      f.n += 1;
      return f;
    },
    addSphere() {
      f.n += 1;
      return f;
    },
  };
  return f;
}

async function nodeChecks(data, ground) {
  console.log('Node, the town on the data folder\'s own files');
  const roads = [];
  let faces = 0;
  const sink = {
    face(key, tint, pts, n, opts = {}) {
      faces += 1;
      if (opts.road) {
        roads.push(pts);
      }
    },
    bar() {
      faces += 6;
    },
  };
  const t0 = Date.now();
  const town = await planTown({ data, ground, sink });
  const ms = Date.now() - t0;
  const c = town.counts;
  console.log(`  built in ${ms} ms: ${c.buildings} buildings (${JSON.stringify(c.roofs)}), ${c.records} ground records, `
    + `${faces} faces, ${c.wallBoxes} wall boxes (most for one building ${c.maxBoxesOneBuilding}), `
    + `${c.fixedBoxes} static boxes, roads ${JSON.stringify(c.roads)}, towers ${c.towers} gantries ${c.portals} poles ${c.poles}, `
    + `${c.powerPieces} tower pieces, ${c.wireChords} wire chords`);

  /* counts */
  const want = data['osm/buildings.json'].features;
  const ids = new Set(town.records.filter((r) => r.kind !== 'bridge').map((r) => r.osm));
  if (c.buildings === want.length && ids.size === want.length && want.every((f) => ids.has(f.id))) {
    ok(`counts: all ${want.length} buildings planned and roofed, one ground record per OSM id`);
  } else {
    fail(`counts: ${want.length} buildings in the data, ${c.buildings} planned, ${ids.size} roofed`);
  }
  const towers = data['osm/power.json'].towers;
  const stood = new Set(town.structures.map((s) => s.id));
  if (towers.every((t) => stood.has(t.id))) {
    ok(`counts: all ${towers.length} towers, gantries and poles in the data stood (${town.structures.length} structures with the line ends)`);
  } else {
    fail(`counts: ${towers.filter((t) => !stood.has(t.id)).length} towers in the data not stood`);
  }

  /* roofs: every wall box under its roof, every roof over its ground */
  let proud = 0;
  let worstProud = 0;
  let sunk = 0;
  for (const b of town.buildings) {
    const bx = b.boxes;
    for (let i = 0; i < bx.length; i += 6) {
      for (const [x, z] of [[bx[i], bx[i + 2]], [bx[i + 3], bx[i + 2]], [bx[i], bx[i + 5]], [bx[i + 3], bx[i + 5]]]) {
        const t = roofTop(b.rec, x, z);
        if (!Number.isNaN(t) && bx[i + 4] > t - 0.019) {
          proud += 1;
          worstProud = Math.max(worstProud, bx[i + 4] - t);
        }
      }
    }
    /* The middle of the roof's first face, which is on it whatever its
     * shape (a flat roof over an L is not over its rectangle's middle). */
    const r = b.rec;
    const f0 = r.faces[0].pts;
    const lx = f0.reduce((a, p) => a + p[0], 0) / f0.length;
    const lz = f0.reduce((a, p) => a + p[1], 0) / f0.length;
    const x = r.c * lx + r.s * lz + r.tx;
    const z = -r.s * lx + r.c * lz + r.tz;
    if (!(roofTop(r, x, z) > ground(x, z) + 2)) {
      sunk += 1;
    }
  }
  if (proud === 0 && sunk === 0) {
    ok('roofs: every wall box is held under its roof at every corner, and every roof stands over its ground');
  } else {
    fail(`roofs: ${proud} wall box corners stand out of their roof (worst ${worstProud.toFixed(3)} m), ${sunk} roofs not 2 m over the ground`);
  }

  /* drape */
  let worstCorner = 0;
  let worstInside = 0;
  let worstAt = null;
  let under = 0;
  let s = 20260929;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let samples = 0;
  for (const pts of roads) {
    /* Corners read a millimetre inside, as roads.js lays them. */
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const mz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
    const lifts = pts.map(([x, y, z]) => {
      const d = Math.hypot(mx - x, mz - z);
      const t = d > 1e-3 ? 1e-3 / d : 0;
      return y - ground(x + (mx - x) * t, z + (mz - z) * t);
    });
    const lift = lifts[0];
    for (const l of lifts) {
      worstCorner = Math.max(worstCorner, Math.abs(l - lift));
    }
    for (let k = 1; k + 1 < pts.length; k += 1) {
      let a = rnd();
      let b = rnd();
      if (a + b > 1) {
        a = 1 - a;
        b = 1 - b;
      }
      const p = [pts[0], pts[k], pts[k + 1]];
      const x = p[0][0] + (p[1][0] - p[0][0]) * a + (p[2][0] - p[0][0]) * b;
      const y = p[0][1] + (p[1][1] - p[0][1]) * a + (p[2][1] - p[0][1]) * b;
      const z = p[0][2] + (p[1][2] - p[0][2]) * a + (p[2][2] - p[0][2]) * b;
      const d = y - ground(x, z);
      if (d > worstInside) {
        worstAt = [x, z, d, pts.length, pts.map((q) => q.map((v) => +v.toFixed(3)))];
      }
      worstInside = Math.max(worstInside, d);
      if (d < 0) {
        under += 1;
      }
      samples += 1;
    }
  }
  if (worstInside <= DRAPE_TOL && under === 0 && worstCorner < 1e-6) {
    ok(`drape: ${roads.length} road pieces, ${samples} points inside them: all over the ground and within `
      + `${worstInside.toFixed(4)} m of it (tolerance ${DRAPE_TOL}); corners one lift over it to ${worstCorner.toExponential(1)} m`);
  } else {
    fail(`drape: worst ${worstInside.toFixed(4)} m over the ground at ${JSON.stringify(worstAt)}, ${under} points under it, corners off their lift by ${worstCorner}`);
  }

  /* budget */
  let most = { n: -1 };
  for (let x = -5000; x <= 5000; x += 250) {
    for (let z = -5000; z <= 5000; z += 250) {
      const f = countingFill();
      for (const _ of town.stream.fill(f, x, z)) {
        /* Every slice. */
      }
      if (f.n > most.n) {
        most = { n: f.n, ...town.stream.near.last };
      }
    }
  }
  console.log(`  budget: the town's streamed colliders are most at (${most.x}, ${most.z}): ${most.n} `
    + `(${most.buildings} buildings, ${most.buildings - most.whole} of them within ${FINE_R} m in columns and ${most.whole} `
    + `to ${WALLS_R} m in one box, ${most.walls} wall boxes; ${most.power} tower pieces and wire chords)`);
  if (most.n <= TOWN_SHARE) {
    ok(`budget: the town streams at most ${most.n} colliders, within its share ${TOWN_SHARE} of ${STREAM_BUDGET}`);
  } else {
    fail(`budget: the town streams ${most.n} colliders at (${most.x}, ${most.z}), its share is ${TOWN_SHARE}`);
  }

  /* same */
  const digest = (t) => {
    const h = createHash('sha256');
    for (const b of t.buildings) {
      h.update(new Uint8Array(b.boxes.buffer));
    }
    for (const r of t.records) {
      h.update(JSON.stringify([r.faces, r.c, r.s, r.tx, r.ty, r.tz]));
    }
    h.update(JSON.stringify([t.fixed, t.wires, t.structures]));
    return h.digest('hex');
  };
  const again = await planTown({ data, ground, sink: { face() {}, bar() {} } });
  const [d1, d2] = [digest(town), digest(again)];
  if (d1 === d2) {
    ok(`same: built twice, walls, roofs, wires and towers identical (sha256 ${d1.slice(0, 16)})`);
  } else {
    fail('same: two builds of the town differ');
  }
  return { town, most };
}

/* ------------------------------------------------------------- browser */

const TOWN = 'window.__mapScene().userData.itaipu.parts.town';
const STREAM = 'window.__mapScene().userData.itaipu.stream';
const NEAR = `${TOWN}.town.stream.near`;

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true, map: 'itaipu', graphics: SHOTS ? 'high' : 'low', graphicsAuto: false, crashDamage: true, sound: false,
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

async function open(airframe) {
  const page = await openPage({
    root, width: 1280, height: 720, url: '/index.html?map=itaipu', seed: seed(airframe),
  });
  const t0 = Date.now();
  await page.until('window.__shellReady && window.__map && window.__map().ready', 600000);
  const id = await page.evaluate('window.__map().id');
  if (id !== 'itaipu') {
    await page.close();
    throw new Error(`the page seated map ${id}, not itaipu`);
  }
  await page.evaluate("(() => { const n = document.getElementById('ui'); if (n) { n.style.display = 'none'; } return 1; })()");
  return { page, loadS: (Date.now() - t0) / 1000 };
}

const js = async (page, src) => JSON.parse(await page.evaluate(`JSON.stringify(${src})`));

/*
 * Put the craft at (x, y, z) held still, and wait until the map's own
 * per frame update has streamed the town's walls round it: filled within
 * the refill distance of the craft, and swapped in.
 */
async function hold(page, pose) {
  const r = await js(page, `window.__crashThrow(${JSON.stringify({ ...pose, hold: true })})`);
  if (!r || r.ok === false) {
    throw new Error(`__crashThrow refused ${JSON.stringify(pose)}: ${JSON.stringify(r)}`);
  }
  await page.until(`(() => { const n = ${NEAR};
    return !n.pending && Math.hypot(n.x - ${pose.x}, n.z - ${pose.z}) < ${MOVE}; })()`, 60000);
}

/*
 * Sim seconds from now, waited for on the plant's clock. A craft at rest
 * (landed, or a wreck lying still) stops the plant's clock, so a clock
 * that has not moved for STILL_MS of wall time ends the flight too.
 */
const STILL_MS = 2000;
async function flySim(page, seconds, sample) {
  const t0 = await page.evaluate('window.__crash().simT');
  const log = [];
  let lastT = -1;
  let since = Date.now();
  for (;;) {
    const row = await js(page, sample);
    log.push(row);
    if (row.simT !== lastT) {
      lastT = row.simT;
      since = Date.now();
    }
    if (row.simT - t0 >= seconds || Date.now() - since > STILL_MS) {
      return log;
    }
    await page.sleep(40);
  }
}

const CRAFT = `(() => {
  const s = window.__craftState();
  const c = window.__crash();
  return {
    simT: c.simT, x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, hit: s.lastHitKind, wrecked: c.wrecked,
    events: c.events, flags: c.flagNames.join('|'), unheld: window.__contacts().unheld ?? 0,
    gen: c.streamGen, mapGen: window.__colliders().streamGen, landed: s.landed,
    roof: window.__surface(s.worldX, s.worldZ, 1e9),
    ground: window.__mapScene().userData.itaipu.terrain.finestAt(s.worldX, s.worldZ),
  };
})()`;

/* Buildings from the part's own model, as plain numbers. */
const BUILDINGS = `${TOWN}.town.buildings.map((b, i) => ({
  i, x: b.rec.tx, z: b.rec.tz, kind: b.rec.kind, hw: b.rec.hw, hd: b.rec.hd, c: b.rec.c, s: b.rec.s, plate: b.rec.lift + b.rec.ty,
  base: b.boxes[1], osm: b.rec.osm, n: b.boxes.length / 6,
}))`;

async function quadChecks(nodeTown) {
  console.log('\nheadless Chromium, the Itaipu map, a five inch with crash damage on');
  const { page, loadS } = await open('5inch');
  try {
    if (!SHOTS) {
      /* The software rasteriser, or a loaded GPU, draws a few frames a
       * second, and the frame loop steps the plant per frame: with the
       * draw off the flights run at the sim's own rate. The per frame
       * update the stream rides on runs either way. */
      await page.evaluate('window.__drawOff(true)');
    }
    const m = await js(page, 'window.__map()');
    const st = m.parts.town;
    console.log(`  loaded in ${loadS.toFixed(1)} s, world stage ${Math.round(m.loading.world)} ms, the town part ${st.buildMs} ms; `
      + `${st.drawn.meshes} meshes and ${st.drawn.lines} wire sets, ${st.drawn.triangles} triangles, ${st.drawn.segments} wire chords`);
    console.log(`  colliders: ${m.colliders.static} static, ${m.colliders.streamed} streamed (gen ${m.colliders.streamGen}); stream ${JSON.stringify(m.stream)}`);
    const nc = nodeTown.counts;
    if (st.buildings === nc.buildings && st.records === nc.records && st.wallBoxes === nc.wallBoxes && st.wireChords === nc.wireChords) {
      ok(`builds: the page's town is Node's: ${st.buildings} buildings, ${st.records} ground records, ${st.wallBoxes} wall boxes, ${st.wireChords} wire chords`);
    } else {
      fail(`builds: the page's town differs from Node's: ${JSON.stringify([st.buildings, st.records, st.wallBoxes, st.wireChords])} vs ${JSON.stringify([nc.buildings, nc.records, nc.wallBoxes, nc.wireChords])}`);
    }
    if (st.attribution !== '(c) OpenStreetMap contributors, ODbL, openstreetmap.org/copyright') {
      fail(`builds: the part carries attribution ${JSON.stringify(st.attribution)}`);
    }

    /* The Friendship Bridge, in the ring. */
    const fr = await js(page, `(() => {
      const T = window.__three;
      const box = new T.Box3();
      let tris = 0;
      window.__mapScene().traverse((o) => {
        if (o.isMesh && o.name.startsWith('itaipu-town-ring')) {
          o.updateWorldMatrix(true, false);
          box.expandByObject(o);
          tris += o.geometry.getAttribute('position').count / 3;
        }
      });
      return { tris, min: box.min.toArray(), max: box.max.toArray() };
    })()`);
    if (fr.tris > 0 && fr.min[0] < -1506 && fr.max[0] > -1506 && fr.min[2] < 9560 && fr.max[2] > 9510) {
      ok(`builds: the Friendship Bridge drawn in the ring, ${fr.tris} triangles, x ${fr.min[0].toFixed(0)} to ${fr.max[0].toFixed(0)}, `
        + `y ${fr.min[1].toFixed(0)} to ${fr.max[1].toFixed(0)}, deck ${st.friendship.deckY.toFixed(1)} m over water at ${st.friendship.water.toFixed(1)}, `
        + `${st.friendship.length.toFixed(0)} m, arch ${st.friendship.span.toFixed(0)} m`);
    } else {
      fail(`builds: no Friendship Bridge drawn at (-1506, 9535): ${JSON.stringify(fr)}`);
    }

    /* Roads, as drawn, on the terrain's own ground. */
    const drape = await js(page, `(() => {
      const t = window.__mapScene().userData.itaipu.terrain;
      let worst = 0; let under = 0; let n = 0;
      window.__mapScene().traverse((o) => {
        if (!o.isMesh || !/-r$/.test(o.name)) { return; }
        /* At triangles' middles: a corner sits on a line where two of
         * the ground's triangles meet, and at the hero's edge two levels. */
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i + 2 < p.count; i += 111) {
          const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 + o.position.x;
          const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 + o.position.z;
          const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
          const d = y - t.finestAt(x, z);
          worst = Math.max(worst, d); if (d < -1e-3) { under += 1; } n += 1;
        }
      });
      return { worst, under, n };
    })()`);
    if (drape.n > 1000 && drape.worst <= DRAPE_TOL && drape.under === 0) {
      ok(`drape: ${drape.n} drawn road triangles' middles, all within ${drape.worst.toFixed(4)} m over the terrain's ground (tolerance ${DRAPE_TOL}; float32 vertices)`);
    } else {
      fail(`drape: ${JSON.stringify(drape)}`);
    }

    /* Budget: every part that streams, at every 500 m of the hero. */
    const budget = await js(page, `(() => {
      const parts = Object.entries(window.__mapScene().userData.itaipu.parts).filter(([, p]) => p.stream);
      let most = { n: -1 };
      for (let x = -5000; x <= 5000; x += 500) {
        for (let z = -5000; z <= 5000; z += 500) {
          const by = {};
          let n = 0;
          for (const [name, p] of parts) {
            const f = { n: 0, addBox() { f.n += 1; return f.n - 1; }, add() { f.n += 1; return f; }, addPost() { f.n += 1; return f; }, addSphere() { f.n += 1; return f; }, ax: [] };
            for (const _ of p.stream.fill(f, x, z)) { /* Every slice. */ }
            by[name] = f.n;
            n += f.n;
          }
          if (n > most.n) { most = { n, x, z, by }; }
        }
      }
      return { most, streamers: parts.map(([n]) => n) };
    })()`);
    const bm = budget.most;
    if (bm.n < STREAM_BUDGET) {
      ok(`budget: the streamed set is most at (${bm.x}, ${bm.z}): ${bm.n} colliders ${JSON.stringify(bm.by)}, under ${STREAM_BUDGET} `
        + `(parts that stream: ${budget.streamers.join(', ')})`);
    } else {
      fail(`budget: ${bm.n} streamed colliders at (${bm.x}, ${bm.z}) ${JSON.stringify(bm.by)}, budget ${STREAM_BUDGET}`);
    }
    /* The dummy fills moved each part's idea of where its set is: the map
     * refills for real on the next frame, as after a teleport. */
    await page.evaluate(`(() => { for (const p of Object.values(window.__mapScene().userData.itaipu.parts)) {
      if (p.stream && p.stream.near) { p.stream.near.x = NaN; } } return 1; })()`);

    /* Refill: the craft put in the densest town, the map's own update. */
    const before = await js(page, STREAM);
    await hold(page, { x: nodeTown.most.x, y: 400, z: nodeTown.most.z, yaw: 0, pitch: 0 });
    const after = await js(page, STREAM);
    const near = await js(page, NEAR);
    const cols = await js(page, 'window.__colliders()');
    console.log(`  refill: round (${near.x.toFixed(0)}, ${near.z.toFixed(0)}) through the map's streamer: ${near.last.colliders} of the town's `
      + `colliders, ${cols.streamed} in the set; ${after.refills - before.refills} refill(s), the last over ${after.frames} frames, `
      + `slices ${JSON.stringify(after.lastSlicesMs)} ms, the worst since load ${after.maxSliceMs.toFixed(2)} ms; gen ${cols.streamGen}`);
    if (after.refills <= before.refills || cols.streamed < near.last.colliders) {
      fail(`refill: the set did not follow the craft: ${JSON.stringify({ after, near, streamed: cols.streamed })}`);
    }

    /* Walls, near, mid and far from the set's centre. */
    const [cx, cz] = [near.x, near.z];
    const all = await js(page, BUILDINGS);
    const dist = (b) => Math.hypot(b.x - cx, b.z - cz);
    const pick = (lo, hi) => all.filter((b) => dist(b) > lo && dist(b) < hi && b.hw > 3 && b.hd > 3).sort((a, b) => dist(a) - dist(b))[0];
    for (const [label, b, want] of [
      [`near (within ${FINE_R} m)`, pick(50, 300), 'wall'],
      [`mid (${FINE_R} to ${WALLS_R} m)`, pick(FINE_R + 50, WALLS_R - 50), 'wall'],
      [`far (past ${WALLS_R} m)`, pick(WALLS_R + 100, 3000), null],
    ]) {
      if (!b) {
        fail(`walls: no building ${label} of (${cx.toFixed(0)}, ${cz.toFixed(0)})`);
        continue;
      }
      /* Level through the middle of the building, from 15 m outside it,
       * 1.5 m over its base, across its long side. */
      const y = b.base + 0.3 + 1.5;
      const ux = b.c;
      const uz = -b.s;
      const reach = b.hw + 15;
      const got = await js(page, `(() => {
        window.__cover(${b.x - ux * reach}, ${y}, ${b.z - uz * reach});
        const h = window.__hit(${b.x - ux * reach}, ${y}, ${b.z - uz * reach}, ${b.x}, ${y}, ${b.z});
        return h && h.kind ? h.kind : null;
      })()`);
      if (got === want) {
        ok(`walls: a building ${label}, OSM ${b.osm} ${dist(b).toFixed(0)} m off, is ${want ? `a ${want}` : 'not there'} to the sweep`);
      } else {
        fail(`walls: the building ${label}, OSM ${b.osm} at ${dist(b).toFixed(0)} m, answered ${got}, want ${want}`);
      }
    }

    /* The crash world follows the refill. */
    await page.evaluate('window.__releasePose()');
    await page.evaluate('window.__stick(0, 0, 0, 0.55)');
    const cw = await flySim(page, 0.3, CRAFT);
    const last = cw[cw.length - 1];
    if (last.gen === last.mapGen) {
      ok(`crash world: declared from the streamed set's generation ${last.gen} after the refill`);
    } else {
      fail(`crash world: declared from generation ${last.gen}, the map's is ${last.mapGen}`);
    }

    /* Roofs: 20, of every kind. */
    const kinds = [['house', 8], ['flat', 8], ['shed', 4]];
    const chosen = [];
    for (const [kind, n] of kinds) {
      /* Clear of other roofs round them, wide enough for a five inch,
       * spread over the town: every 97th of the kind in OSM id order. */
      const list = all.filter((b) => b.kind === kind && b.hw >= 3 && b.hd >= 3).sort((a, b) => (a.osm < b.osm ? -1 : 1));
      const step = Math.max(1, Math.floor(list.length / n));
      for (let k = 0; k < n && k * step < list.length; k += 1) {
        chosen.push(list[k * step]);
      }
    }
    let landed = 0;
    for (const b of chosen) {
      const top = await page.evaluate(`window.__surface(${b.x}, ${b.z}, 1e9)`);
      await hold(page, { x: b.x, y: top + 0.35, z: b.z, yaw: 0, pitch: 0, vx: 0, vy: -0.8, vz: 0 });
      await page.evaluate('window.__stick(0, 0, 0, 0)');
      await page.sleep(300);
      await page.evaluate('window.__releasePose()');
      const log = await flySim(page, 2.5, CRAFT);
      const end = log[log.length - 1];
      const low = Math.min(...log.map((r) => r.y));
      const on = Math.hypot(end.x - b.x, end.z - b.z) < Math.max(b.hw, b.hd) + 1;
      const good = low > top - 0.15 && end.y - top < 0.3 && !end.wrecked && on && end.speed < 0.5;
      console.log(`    roof ${b.kind} OSM ${b.osm}: ${good ? 'rests on it' : 'NOT'} after ${(end.simT - log[0].simT).toFixed(2)} s`);
      if (good) {
        landed += 1;
      } else {
        console.log(`    roof ${b.kind} OSM ${b.osm} at (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) top ${top.toFixed(2)}: lowest ${low.toFixed(2)}, `
          + `end (${end.x.toFixed(1)}, ${end.y.toFixed(2)}, ${end.z.toFixed(1)}) speed ${end.speed.toFixed(2)} wrecked ${end.wrecked} flags ${end.flags}`);
      }
    }
    if (landed === chosen.length && chosen.length === ROOFS) {
      ok(`roofs: a five inch let down at 0.8 m/s rests on all ${ROOFS} roofs (${kinds.map(([k, n]) => `${n} ${k}`).join(', ')}), nothing broken`);
    } else {
      fail(`roofs: ${landed} of ${chosen.length} roofs landed on (want ${ROOFS})`);
    }

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
}

/*
 * A Skyhunter flown level at `speed` from `back` metres off, toward
 * (x, y, z) along (dx, dz), hands off: the flight's log.
 */
async function throwAt(page, target, dir, back = 40, speed = 16) {
  const [x, y, z] = target;
  const [dx, dz] = dir;
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
  await hold(page, {
    x: x - dx * back, y, z: z - dz * back, yaw, pitch: 0, vx: dx * speed, vy: 0, vz: dz * speed, fresh: true,
  });
  await page.evaluate('window.__stick(0, 0, 0, 0.6)');
  await page.sleep(300);
  const c0 = await js(page, CRAFT);
  await page.evaluate('window.__releasePose()');
  const log = await flySim(page, (back / speed) + 1.5, CRAFT);
  return { c0, log, end: log[log.length - 1] };
}

async function skyhunterChecks(nodeTown) {
  console.log('\nheadless Chromium, the Itaipu map, a Skyhunter with crash damage on');
  const { page } = await open('sky1800');
  try {
    await page.evaluate('window.__drawOff(true)');
    /* A conductor: a 500 kV span's middle, 100 m and more from its towers. */
    const span = await js(page, `(() => {
      const t = ${TOWN}.town;
      const ground = (x, z) => window.__mapScene().userData.itaipu.terrain.finestAt(x, z);
      for (const w of t.wires) {
        const mx = (w[0] + w[3]) / 2; const my = (w[1] + w[4]) / 2; const mz = (w[2] + w[5]) / 2;
        const near = t.structures.some((s) => Math.hypot(s.x - mx, s.z - mz) < 100);
        const len = Math.hypot(w[3] - w[0], w[5] - w[2]);
        if (!near && my - ground(mx, mz) > 20 && len > 10) {
          return { x: mx, y: my, z: mz, dx: (w[3] - w[0]) / len, dz: (w[5] - w[2]) / len };
        }
      }
      return null;
    })()`);
    if (!span) {
      fail('wires: no span 100 m from its towers and 20 m over the ground');
    } else {
      /* Square across the wire. */
      const fly = await throwAt(page, [span.x, span.y, span.z], [-span.dz, span.dx]);
      const kinds = [...new Set(fly.log.map((r) => r.hit))].join(',');
      /* The crash names what it met (src/main.js onDamageEvent's log). */
      const met = await js(page, '[...new Set(window.__crashLog().map((e) => e.surface))]');
      if (fly.end.wrecked && met.includes('wire')) {
        ok(`wires: a Skyhunter level into a conductor at (${span.x.toFixed(0)}, ${span.y.toFixed(1)}, ${span.z.toFixed(0)}), 16 m/s, is a wreck on the wire (${fly.end.flags}; crash met ${met.join(',')}; host saw ${kinds})`);
      } else {
        fail(`wires: a Skyhunter level into a conductor at (${span.x.toFixed(0)}, ${span.y.toFixed(1)}, ${span.z.toFixed(0)}) is not a wreck on the wire: ${JSON.stringify(fly.end)}; crash met ${met.join(',')}; host saw ${kinds}`);
      }
    }

    /* A tower: flown at square to the line, so no wire is in the way,
     * into the middle of a face's lowest bay, where its diagonals cross
     * (power.js bracesOf: the legs run from 0.5 m under the base to 1 m
     * under the top, the bays up to the crossarm). */
    const tower = await js(page, `(() => {
      const t = ${TOWN}.town;
      const s = t.structures.find((q) => q.kind === 'tower' && q.kv >= 400
        && !t.structures.some((o) => o !== q && Math.hypot(o.x - q.x, o.z - q.z) < 60));
      if (!s) { return null; }
      const at = (s.size.arm - 1) / (s.size.h - 1) / 6;
      return { x: s.x, y: s.y - 0.5 + at * (s.size.h - 0.5), z: s.z, ax: s.ax, az: s.az, id: s.id };
    })()`);
    if (!tower) {
      fail('towers: no lone 400 kV and over tower');
    } else {
      const fly = await throwAt(page, [tower.x, tower.y, tower.z], [-tower.az, tower.ax]);
      const kinds = [...new Set(fly.log.map((r) => r.hit))].join(',');
      const closest = Math.min(...fly.log.map((r) => Math.hypot(r.x - tower.x, r.z - tower.z)));
      console.log(`  towers: closest ${closest.toFixed(2)} m from the tower's axis, ${fly.end.events - fly.c0.events} damage events`);
      if (fly.end.wrecked) {
        ok(`towers: a Skyhunter level into tower ${tower.id} where a face's diagonals cross, ${tower.y.toFixed(1)} m, 16 m/s, is a wreck (${fly.end.flags}; host saw ${kinds})`);
      } else {
        fail(`towers: a Skyhunter level into tower ${tower.id} flew on: ${JSON.stringify(fly.end)}; host saw ${kinds}`);
      }
    }

    /* Renumbered: into a streamed wall just after a refill moved every
     * streamed index. */
    const all = await js(page, BUILDINGS);
    const b = all.filter((q) => q.kind === 'flat' && q.hw > 8 && q.hd > 8 && q.plate - q.base > 5)
      .sort((p, q) => Math.hypot(p.x - nodeTown.most.x, p.z - nodeTown.most.z) - Math.hypot(q.x - nodeTown.most.x, q.z - nodeTown.most.z))[0];
    const ux = b.c;
    const uz = -b.s;
    const y = b.base + 0.3 + 2.5;
    const back = b.hw + 30;
    await hold(page, {
      x: b.x - ux * back, y, z: b.z - uz * back, yaw: (Math.atan2(-ux, -uz) * 180) / Math.PI, pitch: 0, vx: ux * 16, vy: 0, vz: uz * 16, fresh: true,
    });
    await page.evaluate('window.__stick(0, 0, 0, 0.6)');
    await page.sleep(300);
    const c0 = await js(page, CRAFT);
    await page.evaluate('window.__releasePose()');
    await flySim(page, 0.4, CRAFT);
    /* A refill in flight, through the map's streamer: the town is made to
     * want one, and it is filled round the craft, a few tens of metres
     * from the last, so the set's make up and its numbering change. */
    const gen0 = await page.evaluate('window.__colliders().streamGen');
    const first0 = await page.evaluate(`${TOWN}.town.buildings[${b.i}].rec.solids[0]`);
    await page.evaluate(`${NEAR}.x = NaN`);
    await page.until(`window.__colliders().streamGen > ${gen0}`, 30000);
    const first1 = await page.evaluate(`${TOWN}.town.buildings[${b.i}].rec.solids[0]`);
    console.log(`  renumber: the building's first wall was collider ${first0}, after the refill ${first1}`);
    const log = await flySim(page, 2.5, CRAFT);
    const end = log[log.length - 1];
    const walls = log.filter((r) => r.hit === 'wall').length;
    /* Under a roof, and a metre and more under it: inside a building. */
    const inside = log.filter((r) => r.roof > r.ground + 2 && r.y < r.roof - 1).length;
    const unheld = end.unheld - c0.unheld;
    console.log(`  renumber: OSM ${b.osm}, gen ${gen0} to ${end.mapGen}, crash world at ${end.gen}; wall contacts ${walls}, `
      + `samples inside ${inside}, wrecked ${end.wrecked} (${end.flags}), unheld ${unheld}`);
    if (end.mapGen > gen0 && first0 !== first1 && end.gen === end.mapGen && inside === 0 && unheld === 0 && (end.wrecked || walls > 0)) {
      ok('renumber: after a refill renumbered the set, the wall stops the Skyhunter and every host contact is one the plant holds');
    } else {
      fail('renumber: the crash world did not follow a renumbering refill (see the line above)');
    }
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
  } finally {
    await page.close();
  }
}

/* ----------------------------------------------------------------- shots */

/* [name, camera x, y over ground, z, target x, y, z]. */
const VIEWS = [
  ['foz-aerial', 2600, 380, 1900, 1500, 180, 3200],
  ['foz-street', 1480, 1.7, 3010, 1300, 0, 3000],
  ['hernandarias-aerial', -2600, 420, -300, -4100, 200, -1700],
  ['powerlines', 900, 20, -900, 0, 200, -1650],
  ['switchyard', -1500, 90, 150, -2128, 200, -434],
  ['converter-lines', 3500, 160, 3300, 4659, 200, 4866],
  ['friendship-bridge', -1050, 60, 9250, -1506, 130, 9535],
  ['dam-town-wide', 2600, 700, 1600, 59, 225, -1672],
];

async function shots(page) {
  await mkdir(SHOTS, { recursive: true });
  await page.evaluate('window.__drawOff(false)');
  const rows = [];
  for (const [name, x, h, z, tx, ty, tz] of VIEWS) {
    const gy = await page.evaluate(`window.__mapScene().userData.itaipu.terrain.finestAt(${x}, ${z})`);
    await hold(page, { x, y: gy + h + 30, z, yaw: 0, pitch: 0 });
    /* A street view looks along the street, 1.5 m over its far end. */
    const aimY = h < 5 ? (await page.evaluate(`window.__mapScene().userData.itaipu.terrain.finestAt(${tx}, ${tz})`)) + 1.5 : ty;
    await page.evaluate(`window.__setCam(${x}, ${gy + h}, ${z}, ${tx}, ${aimY}, ${tz}, 60)`);
    const frames = await page.evaluate('window.__boot().frames');
    /* Frames for the terrain, the shadows and the metered exposure to
     * settle on the new view. */
    await page.until(`window.__boot().frames > ${frames + 20}`, 120000);
    await page.sleep(3000);
    const all = await js(page, 'window.__renderStats()');
    await page.evaluate(`${TOWN}.group.visible = false`);
    const f2 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames > ${f2 + 4}`, 60000);
    const without = await js(page, 'window.__renderStats()');
    await page.evaluate(`${TOWN}.group.visible = true`);
    const f3 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames > ${f3 + 4}`, 60000);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    rows.push({
      name, calls: all.calls, triangles: all.triangles, townCalls: all.calls - without.calls, townTriangles: all.triangles - without.triangles,
    });
    console.log(`  shot ${name}: whole frame ${all.calls} calls ${(all.triangles / 1e6).toFixed(2)} M triangles; `
      + `the town's ${all.calls - without.calls} calls ${((all.triangles - without.triangles) / 1e6).toFixed(2)} M`);
  }
  await page.evaluate('window.__setCam()');
  await writeFile(join(SHOTS, 'stats.json'), `${JSON.stringify(rows, null, 1)}\n`);
}

/* ------------------------------------------------------------------ main */

async function main() {
  const manifest = JSON.parse(await readFile(join(DATA, 'manifest.json'), 'utf8'));
  const data = {};
  for (const n of OSM_FILES) {
    data[n] = JSON.parse(await readFile(join(DATA, n), 'utf8'));
  }
  const ground = await groundFrom(manifest);
  const { town, most } = await nodeChecks(data, ground);
  town.most = most;
  if (!NODE_ONLY) {
    if (!SKY_ONLY) {
      await quadChecks(town);
    }
    await skyhunterChecks(town);
  }
  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(NODE_ONLY ? 'PASS (Node half only)' : 'PASS, the town is drawn, roofed, streamed and solid');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
