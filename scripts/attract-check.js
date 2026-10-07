/*
 * attract-check.js: for every freestyle world, walk the title (attract)
 * camera's whole loop in the built world and report whether the lens ever
 * passes through anything solid, which is the one fault, plus three readings
 * about the shot that are printed and never gate. Run it after touching a
 * map's `attract` block.
 *
 *     node scripts/attract-check.js [worldId ...]      (npm run lint:attract)
 *     node scripts/attract-check.js alps
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

/*
 * The attract camera is the one camera with nothing to stop it: the quad
 * has colliders, the free camera has a pilot, and this one is a spline
 * through typed numbers that will fly through a wall silently. The only
 * place the damage shows is a world card on the Freestyle screen at 236 px
 * wide, where nobody looks. The first run found it in three of the four
 * freestyle worlds of the time, every one of which had been looked at as a
 * thumbnail and argued about; this makes the next one a command.
 *
 * One fault, no threshold: a camera inside something solid is never the
 * shot. The other readings are judgements. "under 5 m" does not separate
 * good from bad (a shot climbing inside a chimney read 21.9 percent and the
 * best card of the time 22.2), but it says why when the others look fine.
 * "down" is a photograph of the ground; "sky" is the opposite failure, a
 * camera climbing out of a corner that leaves the world behind the frame.
 *
 * The walk runs in the page because the answer depends on the built world:
 * the spline is the map's own and the colliders are the ones a quad would
 * hit. Reimplementing either in Node would be checking a copy.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { MAPS } from '../src/maps/registry.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The measurement. 320 samples is a step well under a metre at the shortest
 * attract period, finer than the colliders resolve. The path's half extent
 * is a camera's, not a craft's: small enough that a deliberate close pass
 * reads as close, big enough that skimming a wall's skin does not read as
 * clear air. Fog in these worlds ends between 46 and 190 m, so past 40 m the
 * answer stops mattering. Close is two arm's lengths; past 25 degrees down
 * the horizon leaves the top of the frame.
 */
const WALK = {
  samples: 320,
  pathHalf: 0.35,
  reach: 40,
  rayHalf: 0.05,
  closeM: 5,
  steepDeg: 25,
  skyDeg: 10,
  keep: 14,
};

/*
 * High, not a preference: the preset decides how much foliage is kept and
 * foliage is planted with its colliders, so a Low run is blind to a share
 * of what the camera could hit on the authored look. A few minutes across
 * the worlds is the right trade for a lint nobody runs on every commit.
 */
const seed = `try {
  const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
  s.graphics = 'high';
  s.graphicsAuto = false;
  localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
} catch (e) {}`;

/* Runs in the page, against the built world. */
function walkLoop(w) {
  const round1 = (v) => Math.round(v * 10) / 10;
  const loop = window.__attract(w.samples);
  const pts = loop.samples;
  const steepSin = Math.sin(w.steepDeg * Math.PI / 180);
  const skySin = Math.sin(w.skyDeg * Math.PI / 180);
  let through = 0;
  let close = 0;
  let steep = 0;
  let sky = 0;
  const kept = [];
  let nearest = null;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const step = window.__hit(p.x, p.y, p.z, q.x, q.y, q.z, w.pathHalf);
    if (step.kind !== null) {
      through += 1;
      if (kept.length < w.keep) {
        kept.push({ ms: Math.round(p.ms), kind: step.kind, at: [round1(p.x), round1(p.y), round1(p.z)] });
      }
    }
    const view = window.__hit(
      p.x, p.y, p.z, p.x + p.dx * w.reach, p.y + p.dy * w.reach, p.z + p.dz * w.reach, w.rayHalf,
    );
    const free = view.kind !== null ? Math.max(0, view.t) * w.reach : w.reach;
    if (free < w.closeM) {
      close += 1;
    }
    if (p.dy < -steepSin) {
      steep += 1;
    }
    if (p.dy > skySin && view.kind === null) {
      sky += 1;
    }
    if (nearest === null || free < nearest.m) {
      nearest = { m: free, at: [round1(p.x), round1(p.y), round1(p.z)] };
    }
  }
  const n = pts.length;
  return JSON.stringify({
    map: loop.map,
    kind: loop.kind,
    periodMs: Math.round(loop.periodMs),
    samples: n,
    through,
    kept,
    close: close / n,
    steep: steep / n,
    sky: sky / n,
    nearest: nearest ? round1(nearest.m) : null,
    nearestAt: nearest ? nearest.at : null,
  });
}

const freestyle = MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id);
const named = process.argv.slice(2);
const targets = named.length ? freestyle.filter((id) => named.includes(id)) : freestyle;
if (!targets.length) {
  console.error(`No world to check. Known: ${freestyle.join(', ')}`);
  process.exit(2);
}

const pct = (f) => `${Math.round(f * 1000) / 10}%`;

function report(r) {
  const where = r.nearestAt ? r.nearestAt.join(', ') : 'nowhere';
  console.log(`${r.map}: ${r.kind} loop, ${Math.round(r.periodMs / 100) / 10} s, through ${r.through}/${r.samples}, `
    + `under ${WALK.closeM} m ${pct(r.close)}, down ${pct(r.steep)}, sky ${pct(r.sky)}, nearest ${r.nearest} m at ${where}`);
  for (const k of r.kept) {
    console.log(`  through ${k.kind} at ${k.ms} ms, ${k.at.join(', ')}`);
  }
}

async function main() {
  const failures = [];
  const page = await openPage({ root, width: 960, height: 540, seed: [seed] });
  try {
    await page.until('!!window.__boot && window.__boot().frames > 2', 120000);
    for (const id of targets) {
      const quoted = JSON.stringify(id);
      await page.evaluate(`window.__setMap(${quoted})`);
      await page.until(`window.__map().id === ${quoted} && window.__map().ready`, 180000);
      const r = JSON.parse(await page.evaluate(`(${walkLoop.toString()})(${JSON.stringify(WALK)})`));
      report(r);
      if (r.through > 0) {
        failures.push(`${r.map}: the title camera passes through something on ${r.through} of ${r.samples} steps`);
      }
    }
  } finally {
    await page.close();
  }
  if (failures.length) {
    console.error('');
    for (const f of failures) {
      console.error(`FAIL ${f}`);
    }
    return 1;
  }
  console.log('attract: no world flies the title camera through anything solid.');
  return 0;
}

process.exit(await main());
