/*
 * playground-check.js: the UI playground lists every component, and only
 * what the game's stylesheet really has.
 *
 * Node only, no browser. It reads tests/browser/playground-components.js,
 * the playground's list, and index.html's style block, and holds them to
 * each other and to the design system's component table in
 * docs/redesign/PLAN.md:
 *
 *   - every kind the brief asks for (button, card, heading, dropdown,
 *     lobby slot, status, modal, tooltip, type...) is answered, and every
 *     kind but the tooltip by a component the game draws today;
 *   - every class a component's markup or context carries is a class the
 *     sheet has a rule for, so a rename in the sheet fails here instead of
 *     leaving the playground drawing something that no longer exists;
 *   - every picture it shows is a file in the repository;
 *   - every custom property the sheet defines has a group in the system,
 *     so a token added without a place in it is caught;
 *   - PLAN.md's component table and the playground name the same ids;
 *   - the playground cannot reach a player: Pages leaves tests/browser
 *     out of the site and nothing the site serves links to it;
 *   - none of it carries an em or en dash.
 *
 * Run with npm run ui:playground.
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

import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPONENTS, KINDS, PLAYGROUND_CLASSES, classesIn, classesInSheet, styleOf, tokensIn,
} from '../tests/browser/playground-components.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const read = (p) => readFile(join(root, p), 'utf8');
const exists = (p) => access(join(root, p)).then(() => true, () => false);

console.log('playground: the list');
const ids = COMPONENTS.map((c) => c.id);
check('component ids are unique', new Set(ids).size === ids.length);
const badKinds = COMPONENTS.filter((c) => !c.kinds || !c.kinds.length || c.kinds.some((k) => !KINDS.includes(k)));
check('every component names kinds from KINDS', badKinds.length === 0, badKinds.map((c) => c.id).join(', '));
const drawn = COMPONENTS.filter((c) => !c.gap);
const gaps = COMPONENTS.filter((c) => c.gap);
const malformed = drawn.filter((c) => !c.source || !Array.isArray(c.context) || !Array.isArray(c.states) || !c.states.length
  || c.states.some((s) => !Array.isArray(s) || typeof s[0] !== 'string' || typeof s[1] !== 'string' || !s[1].startsWith('<')));
check('every drawn component has a source, a context and at least one state', malformed.length === 0, malformed.map((c) => c.id).join(', '));
check('a gap is a reason and no markup', gaps.every((c) => typeof c.gap === 'string' && c.gap.length > 20 && !c.states));
for (const kind of KINDS) {
  const any = COMPONENTS.some((c) => c.kinds.includes(kind));
  const real = drawn.some((c) => c.kinds.includes(kind));
  check(`the kind "${kind}" is ${kind === 'tooltip' ? 'listed' : 'drawn from a real component'}`, kind === 'tooltip' ? any : real);
}

console.log('playground: against the sheet');
const page = await read('index.html');
const css = styleOf(page);
const sheet = classesInSheet(css);
check('index.html has a style block with rules', sheet.size > 500, `${sheet.size} classes`);
for (const c of drawn) {
  const used = new Set();
  for (const cls of c.context.flatMap((x) => x.split(/\s+/)).filter(Boolean)) {
    used.add(cls);
  }
  for (const [, html] of c.states) {
    for (const cls of classesIn(html)) {
      used.add(cls);
    }
  }
  const missing = [...used].filter((cls) => !PLAYGROUND_CLASSES.has(cls) && !sheet.has(cls));
  check(`${c.id}: every class is one the sheet styles`, missing.length === 0, missing.join(', '));
}
const pictures = [...new Set(drawn.flatMap((c) => c.states.flatMap(([, html]) => [...html.matchAll(/(?:src="|url\(')([^"']+)/g)].map((m) => m[1]))))];
const lost = [];
for (const p of pictures) {
  if (!(await exists(p))) {
    lost.push(p);
  }
}
check('every picture is a file in the repository', lost.length === 0, lost.join(', '));
check('the pictures are the game\'s renders, from assets/', pictures.every((p) => p.startsWith('assets/')), pictures.join(', '));

const tokens = tokensIn(css);
const loose = tokens.filter((t) => t.group === 'other').map((t) => t.name);
const core = ['--pdcs-bg', '--pdcs-panel', '--pdcs-line', '--pdcs-text', '--pdcs-muted', '--pdcs-blue', '--pdcs-green', '--pdcs-fail', '--pdcs-warn', '--pdcs-mono', '--pdcs-read'];
const absent = core.filter((n) => !tokens.some((t) => t.name === n));
check('the sheet defines the PDCS core tokens', absent.length === 0, absent.join(', '));
check('every token the sheet defines has a group', loose.length === 0, loose.join(', '));

console.log('playground: against the plan');
const plan = await read('docs/redesign/PLAN.md');
const table = plan.split('<!-- components -->')[1]?.split('<!-- /components -->')[0] ?? '';
const planned = [...table.matchAll(/^\|\s*`([a-z0-9-]+)`/gm)].map((m) => m[1]);
check('PLAN.md has its component table', planned.length > 0);
const notDrawn = planned.filter((id) => !ids.includes(id));
const notPlanned = ids.filter((id) => !planned.includes(id));
check('every component in the plan is in the playground', notDrawn.length === 0, notDrawn.join(', '));
check('every component in the playground is in the plan', notPlanned.length === 0, notPlanned.join(', '));

console.log('playground: not for players');
const pages = await read('scripts/stage-site.sh');
check('the staged site (Pages and previews) leaves tests/browser out of the site', /--exclude\s+'tests\/browser'/.test(pages));
const served = ['index.html', 'privacy.html', 'terms.html', 'src/trackbuilder/index.html'];
async function walk(dir) {
  const out = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walk(p));
    } else if (/\.(js|html)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const linking = [];
for (const p of [...served, ...await walk('src')]) {
  if (await exists(p) && /tests\/browser\/playground/.test(await read(p))) {
    linking.push(p);
  }
}
check('nothing the site serves names the playground', linking.length === 0, linking.join(', '));

console.log('playground: copy');
const mine = [
  'tests/browser/playground.html',
  'tests/browser/playground.js',
  'tests/browser/playground-components.js',
  'scripts/playground-check.js',
  ...(await readdir(join(root, 'docs/redesign'))).filter((f) => f.endsWith('.md')).map((f) => `docs/redesign/${f}`),
];
const dashed = [];
for (const p of mine) {
  if (/[\u2013\u2014]/.test(await read(p))) {
    dashed.push(relative(root, join(root, p)));
  }
}
check('no em or en dash in the playground, its check or the redesign docs', dashed.length === 0, dashed.join(', '));
const copyDashes = COMPONENTS.filter((c) => !c.gap && c.states.some(([, html]) => /[\u2013\u2014]/.test(html))).map((c) => c.id);
check('no em or en dash in the copy the components draw', copyDashes.length === 0, copyDashes.join(', '));

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
