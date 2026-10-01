/*
 * combat-models-check.js: every combat quad the hangar can put together,
 * built headless and held to numbers.
 *
 * For every frame, every payload (and none) and every set of the
 * accessories that frame offers (docs/COMBAT-DRONES.md, the interface),
 * it builds the machine twice and asserts:
 *
 *   the BUDGET: no more draw calls than the five inch it flies beside
 *     (src/render/herocraft.js, the quad the shell was budgeted around),
 *     full and lite, and no more triangles than the heaviest aircraft
 *     already shipped, both measured live on the same page rather than
 *     typed here;
 *   the PAYLOAD is the doc's: its body exactly d across and len long, its
 *     top on the belly plate's underside, its centre under the body, clear
 *     between the legs, and nothing of it or its straps above the belly;
 *   the LEGS reach the hull's depth and nothing reaches below them, since
 *     the plant parks the machine there with or without a payload;
 *   the PROPS reach the disc the plant spins and are clear: no vertex of
 *     anything but a rotor inside the ring a blade sweeps;
 *   no solid is drawn INSIDE OUT, which a lathe with its profile the
 *     wrong way round is, and which front face culling then hides;
 *   every answer draws something DIFFERENT, and the same answer the SAME
 *     MACHINE both times: one hash over every name, transform, material
 *     and vertex attribute byte. The flown craft, the hangar's preview, a
 *     peer and a replay each build their own, and this is what makes them
 *     one.
 *
 * And the models' copy of the doc's numbers against configs/airframes.js
 * wherever the table has a combat block.
 *
 *   node scripts/combat-models-check.js [--shots[=outDir]]
 *
 * --shots also photographs a few builds from the hangar's camera and the
 * chase camera into outDir (default under the system temp). Pictures are
 * not committed (CLAUDE.md).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { AIRFRAMES } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shotsArg = process.argv.find((a) => a.startsWith('--shots'));
const outDir = shotsArg && shotsArg.includes('=') ? shotsArg.split('=')[1] : join(tmpdir(), 'combat-models');

/* Every subset of a list, the empty one first. */
function subsets(list) {
  const out = [];
  for (let mask = 0; mask < (1 << list.length); mask += 1) {
    out.push(list.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

/*
 * The pictures: the hangar's carousel camera (src/render/carousel3d.js:
 * a 24 degree field, 0.5 rad up, the model turned to its rest yaw), the
 * chase camera (src/main.js: 5 m behind and 0.35 of that up, and nearer),
 * and a low three quarter to hold against the owner's reference
 * photograph.
 */
const HANGAR = { az: -35.5, el: 28.6, fov: 24 };
const SHOTS = [
  ['7in-standard-full', { frame: '7in', payload: 'standard', accessories: ['pack2', 'cage', 'lrantenna'] }],
  ['7in-bare', { frame: '7in', payload: 'none', accessories: [] }],
  ['7in-wide', { frame: '7in', payload: 'wide', accessories: ['lrantenna', 'gps'] }],
  ['7in-penetrator', { frame: '7in', payload: 'penetrator', accessories: ['cage'] }],
  ['10in-emp', { frame: '10in', payload: 'emp', accessories: ['lrantenna', 'gps'] }],
  ['10in-standard', { frame: '10in', payload: 'standard', accessories: ['cage', 'lrantenna'] }],
];

const rows = [];
let fails = 0;
function check(id, pass, detail) {
  rows.push({ id, pass, detail });
  if (!pass) {
    fails += 1;
  }
}

const page = await openPage({ root, width: 1280, height: 800, url: '/tests/browser/combat-preview.html' });
try {
  await page.until('window.__combatReady === true', 60000).catch((e) => {
    /* A module that failed to load leaves only a timeout; say why. */
    throw new Error(`${e.message}\n${page.errors.join('\n')}`);
  });
  const ref = await page.evaluate('window.__combat.reference()');
  const hero = ref['5inch'];
  const heaviest = Object.entries(ref).reduce((m, [id, c]) => (c.full.tris > m.tris ? { id, tris: c.full.tris } : m), { id: '', tris: 0 });
  const budget = { draws: hero.full.draws, liteDraws: hero.lite.draws, tris: heaviest.tris };
  console.log(`budget: ${budget.draws} draws full and ${budget.liteDraws} lite (the five inch), ${budget.tris} triangles (${heaviest.id})`);

  const { frames, payloads, offered } = await page.evaluate('({ frames: window.__combat.frames, payloads: window.__combat.payloads, offered: window.__combat.accessories })');

  /*
   * The models' copy of docs/COMBAT-DRONES.md against the airframe table's,
   * for every airframe that has a combat block: the same frame, the same
   * ids, the same payload sizes and points, the same accessory points, the
   * same arm, prop and hull depth. Until the table has one this says so.
   */
  const combatAirframes = AIRFRAMES.filter((af) => af.combat);
  if (combatAirframes.length === 0) {
    check('configs/airframes.js combat blocks', true, 'none yet: the models\' copy of the doc is all there is to check');
  }
  const near = (x, y) => Math.abs(x - y) < 5e-5;
  const sameAt = (x, y) => Array.isArray(x) && Array.isArray(y) && x.length === 3 && x.every((v, i) => near(v, y[i]));
  for (const af of combatAirframes) {
    const spec = await page.evaluate(`window.__combat.spec(${JSON.stringify(af.combat.frame)})`);
    if (!spec) {
      check(`${af.id}: frame ${af.combat.frame} has a model`, false, 'no COMBAT_FRAMES entry');
      continue;
    }
    const ids = af.combat.payloads.map((p) => p.id).sort();
    check(`${af.id}: payload ids`, JSON.stringify(ids) === JSON.stringify(Object.keys(spec.payloads).sort()), ids.join(' '));
    for (const p of af.combat.payloads) {
      const m = spec.payloads[p.id];
      check(`${af.id}: ${p.id} size and point`, Boolean(m) && near(m.d, p.dims.d) && near(m.len, p.dims.len) && sameAt(m.at, p.cgOffset_m),
        m ? `d ${m.d} len ${m.len} at ${m.at}` : 'not drawn');
    }
    const accIds = af.combat.accessories.map((x) => x.id);
    check(`${af.id}: accessory ids`, JSON.stringify(accIds) === JSON.stringify(offered[af.combat.frame]), accIds.join(' '));
    for (const x of af.combat.accessories) {
      check(`${af.id}: ${x.id} point`, sameAt(spec.accessories[x.id], x.cgOffset_m), String(spec.accessories[x.id]));
    }
    check(`${af.id}: arm, prop and hull depth`, near(spec.arm, af.dims.arm) && near(spec.propR, af.dims.propR) && near(spec.hullDown, af.dims.vHalfDown),
      `arm ${spec.arm} against ${af.dims.arm}, prop ${spec.propR} against ${af.dims.propR}, hull ${spec.hullDown} against ${af.dims.vHalfDown}`);
  }

  let builds = 0;
  let expected = 0;
  const worst = { draws: 0, liteDraws: 0, tris: 0, at: {} };
  const hashes = new Map();
  for (const frame of frames) {
    const sets = subsets(offered[frame]);
    expected += payloads.length * sets.length;
    for (const payload of payloads) {
      for (const acc of sets) {
        const choice = { frame, payload, accessories: acc };
        const name = `${frame}/${payload}/${acc.join('+') || 'bare'}`;
        const r = await page.evaluate(`window.__combat.audit(${JSON.stringify(choice)})`);
        builds += 1;
        for (const [k, v] of [['draws', r.full.draws], ['liteDraws', r.lite.draws], ['tris', r.full.tris]]) {
          if (v > worst[k]) {
            worst[k] = v;
            worst.at[k] = name;
          }
        }
        const quiet = (id, pass, detail) => {
          if (!pass) {
            check(`${name}: ${id}`, false, detail);
          }
        };
        const mm = (v) => `${(v * 1000).toFixed(1)} mm`;
        const s = r.size;
        quiet('draws', r.full.draws <= budget.draws, `${r.full.draws} > ${budget.draws}`);
        quiet('lite draws', r.lite.draws <= budget.liteDraws, `${r.lite.draws} > ${budget.liteDraws}`);
        quiet('triangles', r.full.tris <= budget.tris, `${r.full.tris} > ${budget.tris}`);
        quiet('same machine twice', r.hashA === r.hashB, `${r.hashA} then ${r.hashB}`);
        quiet('props clear', r.intrusions.length === 0, r.intrusions.slice(0, 3).join('; '));
        quiet('nothing inside out', r.insideOut.length === 0, r.insideOut.join('; '));
        quiet('built what was asked', r.built.payload === payload
          && JSON.stringify(r.built.accessories) === JSON.stringify(offered[frame].filter((a) => acc.includes(a))), JSON.stringify(r.built));
        /* The legs stand at the hull's depth, and nothing reaches below
         * them: the plant parks the machine on that depth. */
        quiet('legs reach the hull', Math.abs(r.legs.min[1] + s.hullDown) < 0.0005, `${mm(-r.legs.min[1])} against ${mm(s.hullDown)}`);
        quiet('nothing below the legs', r.whole.min[1] >= -s.hullDown - 0.0005, `${mm(-r.whole.min[1])} below the CG`);
        /* The props reach where the plant spins them. */
        quiet('prop tips at the disc', Math.abs(Math.max(Math.abs(r.whole.min[0]), r.whole.max[0]) - (s.motorAt + s.propR)) < 0.002,
          `${mm(Math.max(Math.abs(r.whole.min[0]), r.whole.max[0]))} against ${mm(s.motorAt + s.propR)}`);
        /* One build an answer: two answers drawing the same thing would be
         * a choice the pilot makes and cannot see. */
        const prior = hashes.get(r.hashA);
        quiet('distinct from every other build', !prior, `draws the same as ${prior}`);
        hashes.set(r.hashA, name);
        if (payload === 'none') {
          quiet('bare frame has no payload', r.payload === null, JSON.stringify(r.payload));
          continue;
        }
        if (!r.payloadBody) {
          quiet('payload drawn', false, 'no payload body');
          continue;
        }
        const [bx0, by0, bz0] = r.payloadBody.min;
        const [bx1, by1, bz1] = r.payloadBody.max;
        quiet('payload is the doc\'s cylinder', Math.abs(bx1 - bx0 - r.spec.d) < 0.001 && Math.abs(by1 - by0 - r.spec.d) < 0.001 && Math.abs(bz1 - bz0 - r.spec.len) < 0.001,
          `${mm(bx1 - bx0)} x ${mm(by1 - by0)} x ${mm(bz1 - bz0)} against d ${mm(r.spec.d)} len ${mm(r.spec.len)}`);
        quiet('payload top on the belly', Math.abs(by1 - s.belly) < 0.0005, `top ${mm(by1)} against the belly at ${mm(s.belly)}`);
        quiet('payload and sling under the belly', r.payload.max[1] <= s.belly + 0.0035, `top ${mm(r.payload.max[1])}`);
        const [cx, , cz] = r.payloadBody.centre;
        quiet('payload under the body', Math.abs(cx) < s.bodyW / 2 && Math.abs(cz - s.bodyZ) < s.bodyL / 2, `centre ${mm(cx)}, ${mm(cz)}`);
        /* Clear of the legs: none of the payload inside a leg's span. */
        const legX = Math.abs(r.legs.min[0]) - 0.03;
        quiet('payload between the legs', Math.max(Math.abs(bx0), Math.abs(bx1)) < legX, `${mm(Math.max(Math.abs(bx0), Math.abs(bx1)))} against the legs from ${mm(legX)}`);
      }
    }
  }
  /* The garage's hook, on the fullest build of each frame and a bare one. */
  for (const frame of frames) {
    for (const choice of [{ frame, payload: 'standard', accessories: offered[frame] }, { frame, payload: 'none', accessories: [] }]) {
      const name = `${frame}/${choice.payload}/${choice.accessories.join('+') || 'bare'}`;
      const r = await page.evaluate(`window.__combat.paintAudit(${JSON.stringify(choice)})`);
      const blank = r.surfaces.filter((sf) => !(sf.triangles > 0));
      check(`${name}: a decal prints on every surface`, r.surfaces.length > 0 && blank.length === 0,
        r.surfaces.map((sf) => `${sf.id} ${sf.triangles}`).join(', '));
      const same = Object.entries(r.finishes).filter(([, v]) => JSON.stringify(v.colours) === JSON.stringify(r.stock));
      check(`${name}: every finish with wear repaints`, same.length === 0, same.map(([f]) => f).join(' ') || r.regions.join(' '));
      check(`${name}: aluminium is a metallic finish`, Object.values(r.finishes.aluminium.finish).every((v) => v === 'metallic'), JSON.stringify(r.finishes.aluminium.finish));
      check(`${name}: an empty set() is the model as built`, r.restored, JSON.stringify(r.stock));
      check(`${name}: an unknown finish, region or wear is refused`, r.refused === 3, `${r.refused} of 3`);
    }
  }
  check(`${builds} builds, every frame x payload x accessory set it offers`, builds === expected && fails === 0, `${fails} failures`);
  check('worst draws, full', worst.draws <= budget.draws, `${worst.draws} of ${budget.draws}, ${worst.at.draws}`);
  check('worst draws, lite', worst.liteDraws <= budget.liteDraws, `${worst.liteDraws} of ${budget.liteDraws}, ${worst.at.liteDraws}`);
  check('worst triangles', worst.tris <= budget.tris, `${worst.tris} of ${budget.tris}, ${worst.at.tris}`);

  if (shotsArg) {
    await mkdir(outDir, { recursive: true });
    for (const [name, choice] of SHOTS) {
      const big = choice.frame === '10in' ? 1.35 : 1;
      await page.evaluate(`window.__combat.show(${JSON.stringify(choice)})`);
      const views = [
        ['hangar', HANGAR.az, HANGAR.el, 1.35 * big, 0, -0.03, 0, HANGAR.fov],
        ['reference', -32, 14, 0.75 * big, 0, -0.02, 0, 30],
        ['side', 90, 2, 0.9 * big, 0, -0.03, 0, 30],
        ['chase', 180, 19.3, 5.3, 0, 0, 0, 70],
        ['chase-near', 180, 19.3, 2.2, 0, 0, 0, 70],
      ];
      for (const [view, az, el, dist, tx, ty, tz, fov] of views) {
        await page.evaluate(`window.__combat.view(${az}, ${el}, ${dist}, ${tx}, ${ty}, ${tz}, ${fov})`);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        const path = join(outDir, `${name}-${view}.png`);
        await writeFile(path, Buffer.from(data, 'base64'));
        console.log(`shot ${path}`);
      }
    }
  }
} finally {
  await page.close();
}

const w = Math.max(...rows.map((r) => r.id.length));
console.log('\ncombat-models-check: every frame, payload and accessory set, built twice\n');
for (const r of rows) {
  console.log(`${r.pass ? ' ok  ' : 'FAIL '} ${r.id.padEnd(w)}  ${r.detail}`);
}
console.log(`\n${rows.length - fails} of ${rows.length} checks pass\n`);
process.exit(fails === 0 ? 0 : 1);
