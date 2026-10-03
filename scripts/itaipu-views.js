/*
 * itaipu-views.js: the fixed views the Itaipu photorealism loop judges
 * (docs/ITAIPU-LOOP.md, docs/ITAIPU-PLAN.md section 12).
 *
 * WHY A FIXED SET. As scripts/swiss2-views.js for the Swiss valley: a
 * round that claims the dam looks more like a photograph is worth
 * something only if every round is photographed from the same places at
 * the same preset and scored against the same photographs, so the views
 * live here and a round that wants another angle adds one rather than
 * moving one.
 *
 *     SIM_GPU=1 node scripts/itaipu-views.js OUT_DIR [--views=aerial-dam,chute] [--time=night] [--down=yard-right,intake-3] [--gates=shut|gate-5:6,...]
 *
 * --time (default day; morning, noon, golden or night) is the map's own
 * option (src/maps/itaipu.js options.time, look/light.js TIMES): any
 * time but day's files take its name as a suffix (`-night`, `-golden`)
 * so the runs can share one round folder. A night run also
 * shoots the NIGHT views, which judge the lit towns (look/night.js) and
 * have no photograph; a day run never does.
 *
 * --gates shoots a war's spillway (docs/FLOOD.md): `shut` every gate
 * driven shut, or each `gate-N:metres` driven that far over its sill,
 * the map's flood (map.setGateState) stepped on until the leaves have
 * got there at the hoist's rate (src/share/war/hoist.js) and GATES_S
 * seconds more so the chutes have settled: the gate state is dated that
 * far back, and the flood catches up at its budget. Its files take
 * `-gates`.
 *
 * --down (night only) shoots the night after those war targets were hit,
 * long enough ago that every outage they cause is over: the districts
 * src/share/war/grid.js puts out are dark (the map's setPower, as the
 * room's war hands it in a game). Its files take `-out` after `-night`.
 *
 * Writes OUT_DIR/<view>.png and OUT_DIR/stats.json: per view its camera,
 * its reference photograph (a name in ~/Desktop/fdfpv-photoref/itaipu,
 * never in this repository), the frame's draw calls and triangles, the
 * median time between animation frames, the GPU's time for the whole
 * frame and the camera's clearance, each budget of section 13 beside what
 * the view spends. OUT_DIR is a round's folder outside the repository,
 * ~/Desktop/fdfpv-loop/itaipu/round-N.
 *
 * What it checks, and fails the run on:
 *
 *   ground    every camera at least a metre above __heightAt, the ground,
 *             the water and every roof record under it (swiss2's round 0
 *             scored two cameras inside a hill as broken reflections);
 *   solids    every camera at least NEAR_SOLID from every solid, static
 *             and streamed, once the streamed set has refilled round it
 *             (the parked camera is what the map streams round);
 *   budget    section 13 at High: at most 300 draw calls and 2.5 M
 *             triangles, and the GPU's least whole frame time under
 *             12 ms. A view over budget is still shot and written, and
 *             the run fails naming it;
 *   console   no page error but refused network fetches (no board runs
 *             here, see scripts/posters.js);
 *   history   the first view's terrain is the same shot first as it is
 *             shot again after another view: its leaves and triangles
 *             (src/maps/terrain/engine.js keeps a split past its reach
 *             only while a focus moves, never across a jump; yard-west
 *             first drew 16 calls and 140 k triangles more).
 *
 * THE GPU TIME. The whole frame the shell draws, timed with WebGL's timer
 * queries (EXT_disjoint_timer_query_webgl2) round every animation frame
 * callback, over FRAMES frames: the median and the least. The least is
 * the frame with the least of the desktop's own drawing in it, and is an
 * upper bound on scripts/swiss2-perf.js's floor measure (the sum of each
 * pass's least), so a view under 12 ms here is under it there. The
 * median is what the shared card gave while the view was shot.
 *
 * Needs the real GPU: a software rasteriser cannot judge a photoreal look
 * and its timings mean nothing. One headless browser, through
 * tests/lib/page.js, which mutes the page's audio.
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

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { darkFrom, levelAt } from '../src/share/war/grid.js';
import { FREE_OPEN_M, HOIST_M_S } from '../src/share/war/hoist.js';
import { SPILL } from '../src/maps/itaipu/dam/index.js';
import TARGETS from '../src/share/war/itaipu-targets.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Every view through the title camera's 44 degree vertical lens, as
 * swiss2's (see FOV in scripts/swiss2-views.js for why it is pinned). */
const FOV = 44;

/*
 * Camera x, y, z, look at x, y, z (world metres, Y up: section 2, x east,
 * z south, y above EGM2008 with no offset), and the reference photograph
 * each is judged against. Y is absolute. Where the plan's table gives a
 * height over the ground, the ground under the camera was read with
 * __heightAt on data v2 and the sum written here; a later data build that
 * raises the ground there fails the ground check rather than moving the
 * view. The poses start from section 12's table and were matched to each
 * photograph in round 0 by rendering and comparing; what was moved and
 * why is in docs/ITAIPU-LOOP.md.
 */
/*
 * The ground and the vegetation away from the dam (round 4, part B): a
 * drone's low pass over the fields at 12 m, a pasture by the right bank's
 * powerlines, the red soil of the clearing south west of the river, a
 * forest edge seen across its field, the riparian forest on the river's
 * east bank, the Atlantic forest's canopy from 100 m, the crop parcels and
 * the forest beside them from 250 m, and a wide aerial up the river to the
 * dam. Their photographs are not in the fdfpv-photoref folder: each `ref`
 * names one in ~/Desktop/fdfpv-loop/itaipu/round-4/refs/ground, whose
 * refs.md gives its source. Every pose was measured under section 13 on
 * main before the round's changes.
 */
const GROUND_VIEWS = [
  { id: 'ground-field-low', cam: [-1500, 186.1, 3800, -1350, 174.3, 4300], ref: 'ground-low-soy-field-red-road-alto-parana-py' },
  { id: 'ground-pasture-low', cam: [300, 189.5, -900, 600, 168.8, -700], ref: 'riparian-forest-rio-monday-pasture-alto-parana-py' },
  { id: 'ground-red-soil', cam: [-1600, 210, 3800, -1950, 185.5, 4200], ref: 'red-dirt-road-forest-terra-roxa-pr' },
  { id: 'ground-forest-edge', cam: [-1650, 191.1, 3850, -1900, 175.7, 3500], ref: 'forest-patch-farmland-dirt-trail-terra-rica-pr' },
  { id: 'ground-riverbank', cam: [-1600, 152.7, 2700, -1050, 181.5, 2350], ref: 'parana-river-shoreline-riparian-ilha-solteira-sp' },
  { id: 'ground-canopy', cam: [1380, 304.7, 380, 1900, 207, 900], ref: 'aerial-iguacu-falls-canopy' },
  { id: 'ground-crops-aerial', cam: [-600, 250, 3300, -1500, 0, 4400], ref: 'elevated-soy-field-red-soil-porto-maua-rs' },
  { id: 'ground-wide', cam: [-1500, 600, 5000, -500, 150, 2000], ref: 'wide-aerial-itaipu-dam-landcover-1' },
];

const VIEWS = [
  { id: 'aerial-dam', cam: [900, 800, -1150, -400, 150, -2300], ref: 'aerial-dam' },
  { id: 'aerial-dam-wide', cam: [300, 800, 200, -700, 180, -1300], ref: 'aerial-dam-2' },
  { id: 'aerial-spill', cam: [-1300, 704, 900, -982, 210, -1028], ref: 'aerial-spill' },
  { id: 'spill-gates-high', cam: [-800, 290, -900, -982, 215, -1028], ref: 'aerial-spill-2' },
  { id: 'leftbank-high', cam: [900, 700, 300, -300, 180, -1500], ref: 'aerial-leftbank' },
  { id: 'rockfill-high', cam: [500, 650, -2000, 1800, 200, -700], ref: 'aerial-rockfill' },
  { id: 'dam-downstream', cam: [225, 184.2, -1059, 58, 165, -1640], ref: 'dam-downstream' },
  { id: 'dam-downstream-2', cam: [520, 165.5, -1285, -200, 150, -1650], ref: 'dam-downstream-2' },
  { id: 'powerhouse', cam: [500, 215, -1300, -200, 140, -1660], ref: 'powerhouse' },
  { id: 'canyon', cam: [225, 215, -1059, -700, 110, 0], ref: 'canyon' },
  { id: 'river-below', cam: [-1400, 190, 1000, -1800, 104, 4000], ref: 'river-below' },
  { id: 'chute', cam: [-974, 231, -1005, -800, 150, -500], ref: 'chute-running' },
  { id: 'spill-gates', cam: [-931.6, 205, -886.7, -982, 212, -1028], ref: 'spill-gates' },
  { id: 'spill-plume', cam: [-700, 106.5, -200, -820, 150, -560], ref: 'spill-plume' },
  /* Round 2 moved these two (docs/ITAIPU-LOOP.md, round 2): the first
   * stood 7 m upstream of the road on the intake deck and the second at
   * the face's toe in line with the tubes, and neither could frame what
   * its photograph shows. */
  { id: 'penstocks', cam: [95.65, 149.7, -1630.65, -222.6, 158, -1720.2], ref: 'penstocks' },
  { id: 'crest-road', cam: [-313.8, 226.7, -1818.0, 233.9, 224, -1701.5], ref: 'crest-road' },
  { id: 'rockfill-road', cam: [1370, 176.5, -1150, 928, 185, -1556], ref: 'rockfill-road' },
  { id: 'reservoir-dam', cam: [100, 221, -3000, 59, 222, -1746], ref: 'reservoir-dam' },
  { id: 'reservoir-shore', cam: [-4160, 222.7, -3000, -3400, 219.5, -3700], ref: 'reservoir-shore' },
  { id: 'powerlines', cam: [-599, 207.5, -1231, -796, 195, -1457], ref: 'powerlines' },
  { id: 'reservoir-forest', cam: [-2400, 560, -2900, -3600, 225, -4100], ref: 'reservoir-forest-aerial' },
  { id: 'craft-chase', cam: [2142.0, 226.1, -181.8, 2144.35, 225.2, -179.84], ref: 'craft' },
  /* Not a photograph's: the view west of the right bank switchyard that
   * PR #199 measured over the 300 call budget at 303 before the yard,
   * 310 with it (tools/itaipu/war-check.js yard-west: 560 m west, 120 m
   * north and 60 m over the yard's middle, its 60 degree lens). Judged on
   * its budget only, not scored: no photograph was taken there, and the
   * sheet pairs it with powerlines because tools/swiss2-loop/sheet.py
   * wants one. */
  { id: 'yard-west', cam: [-2705.6, 286.4, -551.9, -2145.6, 226.4, -431.9], fov: 60, ref: 'powerlines' },
  /* Where water, ground and concrete meet (the owner, 1 October: "all of
   * the spots where the water meets the river need to be better
   * finished"), judged by eye beside the nearest photograph: over the
   * chute's west training wall looking down the chute, the owner's own
   * view; the plunge pool from its east bank; the powerhouse's east end
   * over the tailrace, where the left bank stands against its roof; the
   * reservoir against the spillway's gates where the right bank's earth
   * dam meets them; and the river's west bank under the town, posed for
   * section 13's triangles (a pose further down, into the town, drew
   * 3.3 M). */
  { id: 'edge-chute-west', cam: [-994.2, 260, -786.5, -1040.9, 165, -663.9], ref: 'chute-running' },
  { id: 'edge-plunge', cam: [-700, 175, -380, -900, 110, -510], ref: 'spill-plume' },
  { id: 'edge-tailrace', cam: [700, 230, -1330, 560, 150, -1480], ref: 'powerhouse' },
  { id: 'edge-reservoir-dam', cam: [-1080, 260, -1060, -1135, 210, -945], ref: 'reservoir-dam' },
  { id: 'edge-river-bank', cam: [-850, 160, 250, -1135, 104, 330], ref: 'river-below' },
  ...GROUND_VIEWS,
];

/*
 * The night's own views (look/night.js): from the crest road toward Foz do
 * Iguacu's lit northern districts, over those districts, 300 m over the
 * gorge below the dam looking down the river to the cities past the map,
 * and Hernandarias across the reservoir's foot. No photograph: judged by
 * eye and on section 13's budget, and paired on the sheet with the
 * nearest day view.
 */
const NIGHT_VIEWS = [
  { id: 'night-crest', cam: [-313.8, 226.7, -1818.0, 1500, 160, 2600], ref: 'crest-road' },
  { id: 'night-foz', cam: [1500, 360, 1500, 3000, 200, 3300], ref: 'aerial-leftbank' },
  { id: 'night-300', cam: [200, 420, -1100, -600, 140, 4000], ref: 'river-below' },
  { id: 'night-hernandarias', cam: [-2800, 420, -1300, -4700, 200, -2400], ref: 'reservoir-forest-aerial' },
];

/* Section 13, at High. */
const BUDGET = { calls: 300, triangles: 2.5e6, gpuMs: 12 };
/* A camera nearer a solid than this sees its inside through the near
 * plane or stands in it. */
const NEAR_SOLID = 0.5;
const FRAMES = 60;

const opts = {
  views: '', time: 'day', down: '', gates: '',
};
/* How long a war's spillway runs before it is shot, s of the map's
 * clock: the chute fills in some 30 s and the river takes a minute more. */
const GATES_S = 90;
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (m) {
    opts[m[1]] = m[2];
  } else {
    positional.push(a);
  }
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('itaipu-views: run with SIM_GPU=1; a software rasteriser can neither judge the look nor time the GPU');
}
if (!positional[0]) {
  throw new Error('itaipu-views: name the round\'s folder, ~/Desktop/fdfpv-loop/itaipu/round-N; renders never go into the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`itaipu-views: ${outDir} is inside the repository; renders go outside it`);
}
const TIMES = ['day', 'morning', 'noon', 'golden', 'night'];
if (!TIMES.includes(opts.time)) {
  throw new Error(`itaipu-views: --time is one of ${TIMES.join(', ')}, got ${opts.time}`);
}
const ALL = opts.time === 'night' ? [...VIEWS, ...NIGHT_VIEWS] : VIEWS;
const wanted = opts.views ? opts.views.split(',') : ALL.map((v) => v.id);
const unknown = wanted.filter((id) => !ALL.some((v) => v.id === id));
if (unknown.length) {
  throw new Error(`itaipu-views: no view ${unknown.join(', ')}${opts.time !== 'night' ? ' (the night views are --time=night only)' : ''}`);
}
const down = opts.down ? opts.down.split(',') : [];
if (down.length && opts.time !== 'night') {
  throw new Error('itaipu-views: --down is a night raid\'s, --time=night');
}
const unknownTargets = down.filter((id) => !(id in TARGETS));
if (unknownTargets.length) {
  throw new Error(`itaipu-views: no war target ${unknownTargets.join(', ')}`);
}
/* Every district's level once the hits' outages are over. */
const power = (() => {
  const from = darkFrom(down.map((target) => ({ target, at: 0 })));
  return Array.from(from, (f, i) => levelAt(f, i, Infinity));
})();
/* Day's own files keep their bare names (every earlier round's tooling
 * reads them); night's take a suffix so a day and a night run can share
 * one round folder without one overwriting the other. */
const gates = opts.gates === 'shut' ? Array.from({ length: SPILL.gates }, (_, g) => ({ gate: `gate-${g}`, open_m: 0 })) : opts.gates ? opts.gates.split(',').map((g) => {
  const [gate, open] = g.split(':');
  if (!/^gate-\d+$/.test(gate) || !(Number(open) >= 0)) {
    throw new Error(`itaipu-views: --gates is shut or gate-N:metres,..., got ${g}`);
  }
  return { gate, open_m: Number(open) };
}) : null;
const suffix = `${opts.time === 'day' ? '' : `-${opts.time}`}${down.length ? '-out' : ''}${gates ? '-gates' : ''}`;
await mkdir(outDir, { recursive: true });

/*
 * The in page half: every animation frame callback inside a timer query,
 * while `on`, and the queries read back as they become available. WebGL
 * has one TIME_ELAPSED query open at a time and a frame runs several
 * callbacks, so a callback that starts while one is open is not wrapped;
 * the callbacks of one frame share its timestamp and their times add.
 */
const INSTALL = /* js */ `(() => {
  const gl = document.getElementById('view').getContext('webgl2');
  const ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  const T = { on: false, open: false, pending: [], frames: new Map(), stamps: [] };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!T.on || T.open) { return cb(t); }
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    T.open = true;
    try { return cb(t); } finally {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      T.open = false;
      T.pending.push([t, q]);
      if (T.stamps[T.stamps.length - 1] !== t) { T.stamps.push(t); }
    }
  });
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  window.__itaipuGpu = async (n) => {
    T.frames = new Map();
    T.stamps = [];
    T.on = true;
    await new Promise((done) => { const tick = () => (T.stamps.length > n ? done() : raf(tick)); raf(tick); });
    T.on = false;
    for (let tries = 0; T.pending.some(([, q]) => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); tries += 1) {
      if (tries > 500) { throw new Error('timer queries never became available'); }
      await new Promise((done) => setTimeout(done, 20));
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (const [t, q] of T.pending) {
      T.frames.set(t, (T.frames.get(t) || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    T.pending = [];
    const gpu = [...T.frames.values()];
    const gaps = T.stamps.slice(1).map((t, k) => t - T.stamps[k]);
    return { disjoint, frames: gpu.length, gpuMs: median(gpu), gpuLeastMs: Math.min(...gpu), frameMs: median(gaps) };
  };
  return true;
})()`;

/* Until the terrain has built what the camera asks for and the streamed
 * colliders have refilled round it: the terrain as scripts/itaipu-check.js
 * settles it, then the streamer idle (it logs a slice each frame of a
 * refill) for ten frames running. */
async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
  }
  await page.until(`(() => {
    const s = window.__mapScene().userData.itaipu.stream;
    const now = s.refills + ':' + s.lastSlicesMs.length;
    const f = window.__boot().frames;
    if (window.__sk !== now) { window.__sk = now; window.__sf = f; }
    return f > window.__sf + 10;
  })()`, 120000);
}

const failures = [];
/* The terrain's selection as drawn: its leaves and their triangles. */
const TERRAIN = '(() => { const s = window.__mapScene().userData.itaipu.terrain.stats(); return { leaves: s.leaves, triangles: s.leafTriangles }; })()';
let firstTerrain = null;
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

/* The plane on the rockfill crest's spawn for craft-chase, as swiss2 seats
 * one on its strip. */
const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'sky1800');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the run would shoot the wrong preset, and the check below says so. */ }`];

const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=itaipu${opts.time === 'day' ? '' : `&time=${opts.time}`}`, seed,
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const report = [];
try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`itaipu-views: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await page.evaluate(INSTALL);
  const renderer = await page.evaluate(`(() => { const g = document.getElementById('view').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`);
  console.log(`renderer: ${renderer}`);
  /* The aircraft at the plane's spawn on the rockfill crest, at rest, so
   * every view sees it where craft-chase frames it rather than wherever
   * the title's flight left it when the camera was parked. */
  const spawn = await page.evaluate('window.__map().spawn');
  await page.evaluate(`window.__crashThrow({ x: ${spawn.x}, y: ${spawn.y + 0.5}, z: ${spawn.z}, yaw: ${(spawn.yaw * 180) / Math.PI}, fresh: true })`);
  await page.until('window.__ground().landed', 30000);
  await page.sleep(2500);
  if (down.length) {
    await page.evaluate(`(window.__mapScene().userData.itaipu.look.setPower(${JSON.stringify(power)}), "")`);
    console.log(`down: ${down.join(', ')}; dark: ${power.map((l, i) => (l === 0 ? i : -1)).filter((i) => i >= 0).length} districts`);
  }
  if (gates) {
    const travel = Math.max(...gates.map((g) => Math.abs(g.open_m - FREE_OPEN_M))) / HOIST_M_S;
    const back = Math.ceil(travel + GATES_S) * 1000;
    const at = (await page.evaluate('window.__animMs()')) - back;
    await page.evaluate(`window.__mapGates(${JSON.stringify(gates.map((g) => ({ ...g, at })))})`);
    await page.until(`(() => { const f = window.__map().parts.water.flood;
      return f.mode === 'war' && f.state === 'ready' && f.step * 20 >= ${back} && f.behind <= 5; })()`, (back / 1000 + 120) * 1000);
    const f = await page.evaluate('JSON.stringify(window.__map().parts.water.flood)').then(JSON.parse);
    console.log(`gates: ${opts.gates}; the flood at step ${f.step}, lips ${f.lips.join(',')}`);
  }

  for (const v of ALL.filter((w) => wanted.includes(w.id))) {
    const [x, y, z] = v.cam;
    const ground = await page.evaluate(`window.__heightAt(${x}, ${z})`);
    if (!(ground < y - 1)) {
      fail(`${v.id}: the camera at y ${y} is within a metre of the ground, ${ground} under it`);
      continue;
    }
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${v.fov || FOV}), "")`);
    await settle(page);
    /* The meter and the shadows settle on the new picture. */
    await page.sleep(2500);
    const gap = await page.evaluate(`window.__nearSolid(${x}, ${y}, ${z}, 20)`);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `${v.id}${suffix}.png`), Buffer.from(data, 'base64'));
    const stats = await page.evaluate('window.__renderStats()');
    if (!firstTerrain) {
      firstTerrain = { view: v, ...(await page.evaluate(TERRAIN)) };
    }
    const gpu = await page.evaluate(`window.__itaipuGpu(${FRAMES})`);
    const row = {
      ...v,
      stats,
      frameMs: gpu.frameMs,
      gpuMs: gpu.gpuMs,
      gpuLeastMs: gpu.gpuLeastMs,
      gpuFrames: gpu.frames,
      gpuDisjoint: gpu.disjoint,
      clearance: { ground: y - ground, solid: gap },
    };
    const over = [];
    if (stats.calls > BUDGET.calls) {
      over.push(`${stats.calls} calls`);
    }
    if (stats.triangles > BUDGET.triangles) {
      over.push(`${(stats.triangles / 1e6).toFixed(2)} M triangles`);
    }
    if (gpu.disjoint || !(gpu.gpuLeastMs < BUDGET.gpuMs)) {
      over.push(gpu.disjoint ? 'GPU time disjoint' : `${gpu.gpuLeastMs.toFixed(1)} ms GPU`);
    }
    row.over = over;
    report.push(row);
    console.log(`shot ${v.id.padEnd(18)} ${String(stats.calls).padStart(4)} calls ${(stats.triangles / 1e6).toFixed(2)} M tris `
      + `gpu ${gpu.gpuMs.toFixed(1)} (least ${gpu.gpuLeastMs.toFixed(1)}) ms frame ${gpu.frameMs.toFixed(1)} ms `
      + `clear ${(y - ground).toFixed(1)} m ground, ${Number.isFinite(gap) ? `${gap.toFixed(1)} m` : 'no solid within 20 m'}`);
    if (Number.isFinite(gap) && gap < NEAR_SOLID) {
      fail(`${v.id}: the camera is ${gap.toFixed(2)} m from a solid, under ${NEAR_SOLID}`);
    }
    if (over.length) {
      fail(`${v.id}: over section 13's budget: ${over.join(', ')}`);
    }
  }
  /* The first view again, after another one (craft-chase's, by the craft
   * across the map, when the first was the only one shot). */
  if (firstTerrain) {
    const via = report.length > 1 ? report[report.length - 1] : ALL.find((w) => w.id === 'craft-chase' && w.id !== firstTerrain.view.id);
    if (via && report.length < 2) {
      await page.evaluate(`(window.__setCam(${via.cam.join(',')}, ${via.fov || FOV}), "")`);
      await settle(page);
    }
    const v = firstTerrain.view;
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${v.fov || FOV}), "")`);
    await settle(page);
    const again = await page.evaluate(TERRAIN);
    const same = again.leaves === firstTerrain.leaves && again.triangles === firstTerrain.triangles;
    console.log(`history ${v.id}: first ${firstTerrain.leaves} leaves ${firstTerrain.triangles} triangles, again after ${via ? via.id : 'nothing'} `
      + `${again.leaves} leaves ${again.triangles} triangles`);
    if (!same) {
      fail(`${v.id}: its terrain shot first (${firstTerrain.leaves} leaves, ${firstTerrain.triangles} triangles) is not its terrain after another view (${again.leaves}, ${again.triangles})`);
    }
  }
  const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  for (const e of real) {
    fail(`console: ${e}`);
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}

await writeFile(join(outDir, `stats${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.length} of ${wanted.length} views -> ${outDir}`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log('PASS, every camera clear of the ground and every solid, every view within section 13');
}
