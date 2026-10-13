/*
 * airframes-check.js: every aircraft folder states its `class` and `roles`
 * (docs/redesign/PLAN.md section 2.5), and they agree with the flags the
 * row already has, so the hangar and the picker can sort by data and a new
 * aircraft is one folder. Plain Node. Run with npm run airframes:check.
 *
 * `class` is one of CLASSES, `roles` a list from ROLES in ROLES' order.
 * What the flags prove is held here: a multirotor is exactly the row
 * without `fixedWing`; a row with `noMotor` is a glider (not the other way:
 * the Radian is a motor glider, docs/redesign/TRAINING.md's Glider track);
 * the `combat` role is exactly the rows with a `combat` block (the war's
 * aircraft, configs/airframes.js WAR_AIRFRAMES); `interceptor` is a combat
 * role; a float version is its land plane in both. What the flags cannot
 * prove (a plane or a flying wing, the racer) is the folder's to state.
 * Then the picker's `kindOf` must read the class, and each of the negative
 * controls, one field changed in memory, must fail.
 *
 * THE AIRCRAFT CHECKLIST (docs/redesign/COMPLETENESS.md item 80): what a
 * new aircraft's folder, aircraft/<id>/aircraft.js, must carry before the
 * picker and the hangar can show it. Held here, per folder:
 *
 *   name, blurb   the airframe section's name and long description
 *   facts         the picker's three or four short facts
 *   sizeMm, grams the size and weight lines, positive numbers
 *   cameras       cameraFov (degrees, over 0 and under 180) and
 *                 cameraAngle (degrees, -90 to 90), the FPV camera
 *   class, roles  as above
 *   kit           kit.slots, a list; a float version has none and uses its
 *                 land plane's (`tunesOf`), which must have one
 *   strings       `airframe.blurb.<id>` and `carousel.note.<id>`, in both
 *                 strings.en and strings.es, not empty (aircraft:folder holds
 *                 the folder's strings equal to src/strings)
 *
 * Held elsewhere, and not repeated here: a renderer (src/render/craft.js
 * BUILDERS throws at load for an aircraft with no builder), a crash hull
 * (npm run hulls:check, every airframe's row from dist/sim.wasm), the
 * folder's sections and every assembled table (npm run aircraft:folder).
 * There is no picture field: the picker and the hangar draw the model.
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

import { FOLDERS } from '../configs/aircraft.js';
import { AIRFRAMES, CLASSES, ROLES } from '../configs/airframes.js';
import { kindOf } from '../src/ui/carousel.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed += 1;
}

/* What is wrong with a list of airframe rows, one line each. */
function problems(rows) {
  const out = [];
  const byId = new Map(rows.map((a) => [a.id, a]));
  for (const a of rows) {
    if (!CLASSES.includes(a.class)) out.push(`${a.id}: class ${JSON.stringify(a.class)} is not one of [${CLASSES}]`);
    const roles = Array.isArray(a.roles) ? a.roles : null;
    if (!roles) {
      out.push(`${a.id}: roles is not a list`);
      continue;
    }
    const canonical = ROLES.filter((r) => roles.includes(r));
    if (roles.join() !== canonical.join()) out.push(`${a.id}: roles [${roles}] are not distinct roles in the order [${ROLES}]`);
    if ((a.class === 'multirotor') !== !a.fixedWing) out.push(`${a.id}: class ${a.class} but fixedWing ${a.fixedWing}`);
    if (a.noMotor && a.class !== 'glider') out.push(`${a.id}: noMotor but class ${a.class}`);
    if (roles.includes('combat') !== Boolean(a.combat)) out.push(`${a.id}: combat role ${roles.includes('combat')} but combat block ${Boolean(a.combat)}`);
    if (roles.includes('interceptor') && !roles.includes('combat')) out.push(`${a.id}: interceptor without combat`);
    const land = a.floats && a.tunesOf ? byId.get(a.tunesOf) : null;
    if (land && (land.class !== a.class || JSON.stringify(land.roles) !== JSON.stringify(roles))) {
      out.push(`${a.id}: float version ${a.class} [${roles}] vs its land plane ${land.class} [${land.roles}]`);
    }
  }
  return out;
}

/* The folders state the fields themselves: the row is the folder's
 * airframe section passed through (configs/aircraft.js airframeRow). */
for (const f of FOLDERS) {
  check(`aircraft/${f.id} states class and roles`, Object.hasOwn(f.airframe, 'class') && Object.hasOwn(f.airframe, 'roles'));
}

const text = (v) => typeof v === 'string' && v.trim() !== '';
const positive = (v) => Number.isFinite(v) && v > 0;

/* What is missing from a list of folders against the checklist, one line
 * each. */
function unchecked(folders) {
  const out = [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const f of folders) {
    const a = f.airframe;
    if (!text(a.name)) out.push(`${f.id}: no name`);
    if (!text(a.blurb)) out.push(`${f.id}: no blurb`);
    if (!Array.isArray(a.facts) || a.facts.length < 3 || a.facts.length > 4 || !a.facts.every(text)) {
      out.push(`${f.id}: facts ${JSON.stringify(a.facts)} are not three or four short lines`);
    }
    if (!positive(a.sizeMm) || !positive(a.grams)) out.push(`${f.id}: sizeMm ${a.sizeMm}, grams ${a.grams}`);
    if (!(Number.isFinite(a.cameraFov) && a.cameraFov > 0 && a.cameraFov < 180)) out.push(`${f.id}: cameraFov ${a.cameraFov}`);
    if (!(Number.isFinite(a.cameraAngle) && Math.abs(a.cameraAngle) <= 90)) out.push(`${f.id}: cameraAngle ${a.cameraAngle}`);
    const kitOf = a.floats ? byId.get(a.tunesOf) : f;
    if (!Array.isArray(kitOf?.kit?.slots)) out.push(`${f.id}: no kit${a.floats ? ` on its land plane ${a.tunesOf}` : ''}`);
    for (const lang of ['en', 'es']) {
      for (const key of [`airframe.blurb.${f.id}`, `carousel.note.${f.id}`]) {
        if (!text(f.strings?.[lang]?.[key])) out.push(`${f.id}: no ${lang} ${key}`);
      }
    }
  }
  return out;
}

const missing = unchecked(FOLDERS);
check(`every folder carries the checklist (${FOLDERS.length} aircraft)`, missing.length === 0, missing.join('; '));

const found = problems(AIRFRAMES);
check('class and roles agree with the flags', found.length === 0, found.join('; '));

const kinds = AIRFRAMES.filter((a) => kindOf(a.id) !== (a.class === 'multirotor' ? 'quad' : 'plane'));
check('the picker reads the class', kinds.length === 0, kinds.map((a) => a.id).join());

const counts = Object.fromEntries(CLASSES.map((c) => [c, AIRFRAMES.filter((a) => a.class === c).map((a) => a.id).join(' ')]));
console.log(`     ${Object.entries(counts).map(([c, ids]) => `${c}: ${ids}`).join('\n     ')}`);

/* Each change, made to a copy of the rows, must be caught. */
const copy = () => AIRFRAMES.map((a) => ({ ...a, roles: [...a.roles] }));
const row = (rows, id) => rows.find((a) => a.id === id);
const CONTROLS = [
  ['an unknown class', (r) => { row(r, 'cub1400').class = 'helicopter'; }],
  ['a missing class', (r) => { delete row(r, 'cub1400').class; }],
  ['a quad called a plane', (r) => { row(r, '7inch').class = 'plane'; }],
  ['a plane called a multirotor', (r) => { row(r, 'cub1400').class = 'multirotor'; }],
  ['a glider without a motor called a plane', (r) => { row(r, 'nrj1490').class = 'plane'; }],
  ['an unknown role', (r) => { row(r, 'cub1400').roles = ['bomber']; }],
  ['a role twice', (r) => { row(r, 'interceptor').roles = ['race', 'combat', 'combat', 'interceptor']; }],
  ['roles out of order', (r) => { row(r, 'interceptor').roles = ['combat', 'race', 'interceptor']; }],
  ['roles not a list', (r) => { row(r, 'cub1400').roles = 'race'; }],
  ['a combat aircraft without the role', (r) => { row(r, 'striker2500').roles = []; }],
  ['the role without a combat block', (r) => { row(r, 'cub1400').roles = ['combat']; }],
  ['an interceptor that is not combat', (r) => { row(r, 'interceptor').roles = ['race', 'interceptor']; delete row(r, 'interceptor').combat; }],
  ['a float version unlike its land plane', (r) => { row(r, 'cub1400f').class = 'wing'; }],
];
for (const [name, change] of CONTROLS) {
  const rows = copy();
  change(rows);
  check(`negative control: ${name} is caught`, problems(rows).length > 0);
}

/* Each change, made to a copy of the folders, must be caught. */
const folderCopy = () => FOLDERS.map((f) => ({
  ...f,
  airframe: { ...f.airframe },
  kit: { ...f.kit },
  strings: { en: { ...f.strings.en }, es: { ...f.strings.es } },
}));
const folder = (fs, id) => fs.find((f) => f.id === id);
const CHECKLIST_CONTROLS = [
  ['a folder without a name', (fs) => { folder(fs, 'cub1400').airframe.name = ''; }],
  ['a folder without a blurb', (fs) => { delete folder(fs, 'cub1400').airframe.blurb; }],
  ['two facts', (fs) => { folder(fs, 'cub1400').airframe.facts = ['3S', '1400 mm']; }],
  ['an empty fact', (fs) => { folder(fs, 'cub1400').airframe.facts = ['3S', '', 'Taildragger']; }],
  ['no weight', (fs) => { delete folder(fs, 'cub1400').airframe.grams; }],
  ['a size of zero', (fs) => { folder(fs, 'cub1400').airframe.sizeMm = 0; }],
  ['no camera field of view', (fs) => { delete folder(fs, '7inch').airframe.cameraFov; }],
  ['a camera tilted past straight up', (fs) => { folder(fs, '7inch').airframe.cameraAngle = 120; }],
  ['no kit', (fs) => { folder(fs, 'cub1400').kit.slots = null; }],
  ['a float version whose land plane has no kit', (fs) => { folder(fs, 'timber1500').kit.slots = null; }],
  ['no Spanish description', (fs) => { delete folder(fs, 'p51d1450').strings.es['airframe.blurb.p51d1450']; }],
  ['an empty English note', (fs) => { folder(fs, 'p51d1450').strings.en['carousel.note.p51d1450'] = ' '; }],
];
for (const [name, change] of CHECKLIST_CONTROLS) {
  const fs = folderCopy();
  change(fs);
  check(`negative control: ${name} is caught`, unchecked(fs).length > 0);
}

if (failed) {
  console.log(`airframes:check FAILED (${failed})`);
  process.exit(1);
}
console.log('airframes:check ok');
