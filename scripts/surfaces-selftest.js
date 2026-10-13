/*
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

/*
 * The control surface tiers outside the plant, docs/SURFACES-STAGE1.md:
 *
 *   S1  settings.surfaces normalised: unknown aircraft, tiers and surfaces
 *       not offered dropped, stock entries dropped.
 *   S2  what is flown: a tier not yet earned, and every tier in a stock
 *       only room, flies stock; the unlock levels are the plane's + 1/2/3.
 *   S3  the account blob: the section is kept, shaped, counted, and a
 *       bad entry refused or cleaned away.
 *   S4  a My Hangar build carries its tiers through normaliseFit, fitOf
 *       and putFit.
 *   S5  a replay file keeps the tiers it was flown with and cleans what
 *       it does not know.
 *   S6  the tuning's throws: the tier's high throws, low and mid in the
 *       manual's proportion; a stock entry seats the manual's first
 *       flight rate, on a tier the tier's.
 *   S7  the shell's seat on the high rate (src/main.js applyTuning and
 *       applyParts: the block, the tune with the tier's throws, the servos through
 *       addonParams and their spread) flies bit identical to
 *       surfaces-gates.js's.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  SURFACES, flownTiers, normaliseSurfaces, pointsInertia, surfaceGrowth, tierBlock, tierPoints, tierThrowsDeg,
} from '../configs/surfaces.js';
import { blobRefusal, cleanBlob } from '../src/share/progressmerge.js';
import { fitOf, normaliseFit, putFit } from '../src/ui/builds.js';
import { lockOf, levelStart, unlockables } from '../src/game/progress.js';
import { encodeReplay, decodeReplay } from '../src/replay/file.js';
import { createRecorder } from '../src/replay/recorder.js';
import { normalizeEntry, setupFor, throwsFor, tuneBlock, tuningFor } from '../configs/tuning.js';
import { powerChoice } from '../configs/power.js';
import { addonParams } from '../configs/hangar-parts.js';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { fly, must, RC_STEP_MS } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(ok, what, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
}
const json = (o) => JSON.stringify(o);

/* S1 */
{
  const got = normaliseSurfaces({
    cub1400: { a: '3d', e: 'warp', r: 'stock' },
    extra3d1308: { r: 'extreme' },
    timber1500: { a: 'sport' },
    kadet1981: { a: 'sport' },
    nonsense: { a: 'sport' },
  });
  check(json(got) === json({ cub1400: { a: '3d', e: 'stock', r: 'stock' }, timber1500: { a: 'sport', e: 'stock', r: 'stock' } }), 'S1 settings.surfaces normalised', json(got));
  check(json(normaliseSurfaces(['x'])) === '{}' && json(normaliseSurfaces(null)) === '{}', 'S1 not a map is empty');
}

/* S2 */
{
  const fresh = { xp: 0, unlockAll: false };
  const locked = (p) => (af, u) => lockOf(p, 'surface', u, af) !== null;
  const stored = { a: 'extreme', e: 'sport', r: '3d' };
  check(json(flownTiers('cub1400', stored, { locked: locked(fresh) })) === json({ a: 'stock', e: 'stock', r: 'stock' }),
    'S2 a new pilot flies stock whatever is stored');
  const lv3 = { xp: levelStart(3), unlockAll: false };
  check(json(flownTiers('cub1400', stored, { locked: locked(lv3) })) === json({ a: 'stock', e: 'sport', r: '3d' }),
    'S2 at level 3 the Cub flies Sport and 3D, Extreme stays stock', json(flownTiers('cub1400', stored, { locked: locked(lv3) })));
  check(json(flownTiers('cub1400', stored, { stockOnly: true })) === json({ a: 'stock', e: 'stock', r: 'stock' }),
    'S2 a stock only room flies stock');
  const lv = Object.fromEntries(unlockables().filter((i) => i.kind === 'surface').map((i) => [`${i.airframe}:${i.id}`, i.level]));
  check(lv['cub1400:a-sport'] === 2 && lv['cub1400:a-extreme'] === 4 && lv['extra3d1308:e-3d'] === 11 && !('extra3d1308:r-sport' in lv),
    'S2 unlock levels: the plane\'s + 1, 2, 3; none for a surface not offered', json(lv));
}

/* S3 */
{
  const good = { v: 1, data: { surfaces: { cub1400: { a: '3d' } } }, stamps: {} };
  check(blobRefusal(good) === null && json(cleanBlob(good).data.surfaces) === json({ cub1400: { a: '3d' } }), 'S3 a good section is kept');
  const bad = { v: 1, data: { surfaces: { cub1400: { a: 'warp' } } }, stamps: {} };
  const why = blobRefusal(bad);
  check(why && why.section === 'surfaces' && why.why === 'shape' && json(cleanBlob(bad).data.surfaces) === '{}', 'S3 a bad entry is refused and cleaned', json(why));
  const many = { v: 1, data: { surfaces: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`af${i}`, {}])) }, stamps: {} };
  check((blobRefusal(many) || {}).why === 'count', 'S3 more entries than aircraft are refused');
}

/* S4 */
{
  const fit = normaliseFit('cub1400', { surfaces: { a: 'sport', e: 'nope' } });
  check(json(fit.surfaces) === json({ a: 'sport', e: 'stock', r: 'stock' }), 'S4 a build normalises its tiers', json(fit.surfaces));
  check(normaliseFit('cub1400', {}).surfaces === null && normaliseFit('kadet1981', { surfaces: { a: 'sport' } }).surfaces === null,
    'S4 stock and an aircraft without tiers carry none');
  const s = { livery: {}, power: {}, parts: {}, tuning: {}, combat: {}, surfaces: {} };
  putFit(s, 'cub1400', fit);
  check(json(fitOf(s, 'cub1400').surfaces) === json(fit.surfaces), 'S4 putFit then fitOf gives the tiers back');
  putFit(s, 'cub1400', { ...fit, surfaces: null });
  check(!('cub1400' in s.surfaces), 'S4 a stock build clears the slot');
}

/* S5 */
{
  const r = createRecorder(4);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < 3; f += 1) {
    const i = r.begin(f / 10, f * 100);
    r.pose(i, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    r.plant(i, new Float64Array(20));
    r.status(i, [0, 0], sp, 0, false, 0, 0, 0);
  }
  const c = r.clip({
    name: 'Tiers', created: 1790000000000, airframe: 'cub1400', livery: null, map: 'swiss2', scale: 1, size: 1.4, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
    fit: { entry: { prop: 'stock', addons: [], damage: null }, option: null, surfaces: { a: 'extreme', e: 'bogus', r: '3d' } },
  });
  c.keys = [];
  const back = decodeReplay(encodeReplay(c));
  check(json(back.meta.fit.surfaces) === json({ a: 'extreme', e: 'stock', r: '3d' }), 'S5 a replay keeps its tiers, cleaned', json(back.meta.fit.surfaces));
  const g = surfaceGrowth('cub1400', back.meta.fit.surfaces);
  check(g && g.a > 1.7 && g.e === 1 && g.r > 1.3, 'S5 and draws them that size', json(g));
}

/* S6 */
{
  const high = tierThrowsDeg('cub1400', { a: 'extreme' });
  const t = tuningFor('cub1400').throws;
  const lo = throwsFor('cub1400', 'low', high);
  check(Math.abs(lo[0] - t.low[0] * high[0] / t.high[0]) < 1e-12 && lo[1] === t.low[1] && json(throwsFor('cub1400', 'high', high)) === json(high),
    'S6 tier throws: high the tier\'s, low in proportion', `${json(high)} low ${json(lo.map((x) => +x.toFixed(2)))}`);
  check(json(throwsFor('cub1400', 'low')) === json(t.low), 'S6 no tier, the manual\'s throws');
  /* The Cub's stock is the manual's first flight rate, low ("On the
   * first flight, fly the model in low rate", configs/tuning.js THE STOCK
   * RATE): a stock entry seats the low throws, on a tier the tier's in
   * the manual's proportion. */
  const set = setupFor('cub1400', powerChoice('cub1400', {}));
  const entry = normalizeEntry('cub1400', undefined, set.limits);
  const seatedDeg = (b) => [3, 4, 5].map((k) => b[k] * 180 / Math.PI);
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  check(near(seatedDeg(tuneBlock('cub1400', entry, set.massKg, set.packKg)), t.low) && near(seatedDeg(tuneBlock('cub1400', entry, set.massKg, set.packKg, high)), lo),
    'S6 a stock entry seats the manual\'s low rate, on a tier the tier\'s low throws');
}

/* S7: the shell's seat against the gates'. */
{
  const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const DEG = 180 / Math.PI;
  async function flight(seat) {
    const sim = await loadSim(wasmBytes);
    if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
    must(sim.e.sim_set_airframe(SURFACES.cub1400.sim), 'sim_set_airframe');
    must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
    seat(sim);
    const h = createHash('sha256');
    const r = fly(sim, { duty: 0.6, speed0: 16, vzTarget: 0, seconds: 4 });
    for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
      must(sim.input((r.endMs + ms) / 1000, 1, 0.5, -1, 0.6), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      h.update(sim.readStateBytes().bytes);
    }
    return h.digest('hex').slice(0, 16);
  }
  const tiers = { a: 'extreme', e: '3d', r: 'sport' };
  /* As src/main.js applyTuning and applyParts seat them, stock power. */
  const shell = await flight((sim) => {
    const block = tierBlock('cub1400', tiers);
    must(sim.setTiers(block), 'sim_wing_set_tiers');
    const set = setupFor('cub1400', powerChoice('cub1400', {}));
    /* On the high rate, the throws surfaces-gates.js flies the tiers on. */
    const entry = normalizeEntry('cub1400', { rate: 'high' }, set.limits);
    must(sim.setTune(tuneBlock('cub1400', entry, set.massKg, set.packKg, tierThrowsDeg('cub1400', tiers))), 'sim_wing_set_tune');
    const pts = tierPoints('cub1400', tiers);
    must(sim.setAddons(addonParams('cub1400', { prop: 'stock', addons: [] }, null, set.massKg, pts)), 'sim_set_addons');
    must(sim.setAddonInertia(Float64Array.from(pointsInertia(pts))), 'sim_set_addon_inertia');
  });
  /* As scripts/surfaces-gates.js seats them. */
  const gates = await flight((sim) => {
    must(sim.setTiers(tierBlock('cub1400', tiers)), 'sim_wing_set_tiers');
    const tune = sim.tune();
    const th = tierThrowsDeg('cub1400', tiers);
    tune[3] = th[0] / DEG;
    tune[4] = th[1] / DEG;
    tune[5] = th[2] / DEG;
    must(sim.setTune(tune), 'sim_wing_set_tune');
    const pts = tierPoints('cub1400', tiers);
    must(sim.setAddons(addonParams('cub1400', { prop: 'stock', addons: [] }, null, 0, pts)), 'sim_set_addons');
    must(sim.setAddonInertia(Float64Array.from(pointsInertia(pts))), 'sim_set_addon_inertia');
  });
  check(shell === gates, 'S7 the shell\'s seat flies as the gates\' does', `${shell} vs ${gates}`);
}

console.log(`\nsurfaces:selftest: ${passed}/${passed + failed} pass`);
process.exit(failed ? 1 : 0);
