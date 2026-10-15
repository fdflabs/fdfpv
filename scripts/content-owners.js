/*
 * content-owners.js: every content file is registered under its owner, and
 * nothing is orphaned (docs/redesign/COMPLETENESS.md item 78,
 * docs/CONTENT-OWNERS.md). Plain Node. Run with npm run content:owners.
 *
 * One row per place content lives. A row names its owner, the registry
 * module that is the only list of that kind, and pairs what is on disk with
 * what the owner registers:
 *
 *   files     the names found on disk (a folder's entries, or each
 *             module's own id where the file name is not the id)
 *   entries   the names the owner registers
 *   support   names on disk that are not content and why: an index, a
 *             module the content shares, a reference file kept on purpose
 *   complete  true when every entry must have its file (a registered
 *             mission with no file is a broken registry); false where the
 *             owner may register fewer than every id (a livery is per
 *             airframe, and a racing quad has none)
 *
 * A file that is neither an entry nor support is an orphan; an entry with
 * no file, on a complete row, is missing. That one rule is the whole check.
 * What each kind's own checks hold (a folder's checklist, a film's timing,
 * a take's hash) stays in them; docs/CONTENT-OWNERS.md lists them, and each
 * row here names its checks, which must be npm scripts run by a step of
 * .github/workflows/checks.yml, so the table cannot cite a check that is
 * gone. Every row's kind and owner must also be in docs/CONTENT-OWNERS.md,
 * which is the table a person reads. Then the negative controls: one
 * change made to a copy of a row, each of which must fail.
 *
 * Not swept, on purpose: textures, fonts and art under assets/ (a map
 * builds texture names at run time, so a literal search finds none of the
 * Swiss valley's; docs/ASSET-LIBRARY.md owns the families), and string
 * keys nothing reads (keys are built at run time too, `airframe.blurb.<id>`).
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

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FOLDERS } from '../configs/aircraft.js';
import { LIVERIES, liveryKey } from '../configs/liveries.js';
import { TUNES, tunePath } from '../configs/registry.js';
import { MAPS } from '../src/maps/registry.js';
import { LOCALES } from '../src/strings/index.js';
import { MISSIONS as WAR_MISSIONS } from '../src/share/war/missions/index.js';
import { FILMS as WAR_FILMS } from '../src/share/war/films/index.js';
import { MISSIONS as OPS_MISSIONS } from '../src/share/ops/missions.js';
import { FILMS as INTERIOR_FILMS } from '../src/share/interior/films/index.js';
import { COURSES } from './itaipu-courses.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed += 1;
}

const entriesOf = (rel) => readdirSync(join(root, rel), { withFileTypes: true });
const filesIn = (rel, ext = '') => entriesOf(rel).filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => e.name);
const dirsIn = (rel) => entriesOf(rel).filter((e) => e.isDirectory()).map((e) => e.name);

/* A folder of modules each exporting its content as default with an `id`:
 * the file stands for that id, and a file with no id is an orphan under
 * its own name. */
async function idsOf(rel, support) {
  const out = [];
  for (const name of filesIn(rel, '.js')) {
    if (support[name]) {
      out.push(name);
      continue;
    }
    const mod = await import(pathToFileURL(join(root, rel, name)).href);
    out.push(typeof mod.default?.id === 'string' ? mod.default.id : name);
  }
  return out;
}

/* A dynamic import's target, read off the loader: `() => import('./alps.js')`. */
const loaderFile = (load) => /import\('\.\/([^']+)'\)/.exec(String(load))?.[1] ?? null;

const manifest = JSON.parse(readFileSync(join(root, 'assets/audio/war/manifest.json'), 'utf8'));
/* manifest.voice is keyed `<line id>.<lang>`, its files by extension. */
const voiceEntries = Object.entries(manifest.voice).flatMap(([key, v]) => {
  const dot = key.lastIndexOf('.');
  return Object.keys(v.files).map((ext) => `${key.slice(dot + 1)}/${key.slice(0, dot)}.${ext}`);
});
const musicEntries = Object.entries(manifest.music).flatMap(([id, m]) => Object.keys(m.files).map((ext) => `${id}.${ext}`));

const MAP_SUPPORT = {
  'registry.js': 'the worlds\' registry itself',
  'retired.js': 'the ids of removed worlds, so stored settings resolve',
  'build-cost.js': 'measured build times, read by boot before anything else',
  'README.md': 'the folder\'s notes',
};
const WAR_FILM_SUPPORT = { 'index.js': 'the war films\' registry' };
const INTERIOR_FILM_SUPPORT = {
  'index.js': 'The Interior films\' registry',
  'board.js': 'the operations room BOARD every film draws on',
  'common.js': 'the set and camera points the films share',
  'stills.js': 'the photographs the BOARD shows',
};

/* Each row's checks: what holds the kind beyond being registered. */
const ROWS = [
  {
    kind: 'airframes', where: 'aircraft/', owner: 'configs/aircraft.js',
    files: dirsIn('aircraft'),
    entries: FOLDERS.map((f) => f.id),
    support: {}, complete: true,
    checks: ['aircraft:folder', 'airframes:check', 'hulls:check'],
  },
  {
    kind: 'airframes', where: 'aircraft/<id>/', owner: 'configs/aircraft.js',
    files: FOLDERS.flatMap((f) => filesIn(`aircraft/${f.id}`).map((n) => `${f.id}/${n}`)),
    /* plant.json is exactly the fixed wing's plant table (aircraft:ctable). */
    entries: FOLDERS.flatMap((f) => [`${f.id}/aircraft.js`, ...(f.airframe.fixedWing ? [`${f.id}/plant.json`] : [])]),
    support: {}, complete: true,
    checks: ['aircraft:folder', 'aircraft:ctable'],
  },
  {
    kind: 'worlds', where: 'src/maps/', owner: 'src/maps/registry.js',
    files: filesIn('src/maps'),
    entries: MAPS.map((m) => loaderFile(m.load)).filter(Boolean),
    support: MAP_SUPPORT, complete: true,
    checks: ['registry:selftest'],
  },
  {
    kind: 'worlds', where: 'src/maps/<id>/', owner: 'src/maps/registry.js',
    files: dirsIn('src/maps'),
    entries: MAPS.filter((m) => m.load).map((m) => m.id),
    support: { terrain: 'the terrain engine every world builds on' },
    /* Not every world has a folder of its own: the Swiss valley is one
     * module over the alps' builders and one assets.js. */
    complete: false,
    checks: [],
  },
  {
    kind: 'worlds', where: 'assets/posters/', owner: 'src/maps/registry.js',
    files: filesIn('assets/posters'),
    entries: MAPS.filter((m) => m.poster).map((m) => basename(m.poster)),
    support: {}, complete: true,
    checks: [],
  },
  {
    kind: 'tracks', where: 'docs/itaipu-courses/', owner: 'scripts/itaipu-courses.js',
    files: filesIn('docs/itaipu-courses'),
    entries: COURSES.map((c) => c.file),
    support: {}, complete: true,
    checks: ['itaipu:courses', 'track:golden', 'world:spawns'],
  },
  {
    kind: 'missions', where: 'src/share/war/missions/', owner: 'src/share/war/missions/index.js',
    files: await idsOf('src/share/war/missions', { 'index.js': true }),
    entries: Object.keys(WAR_MISSIONS),
    support: { 'index.js': 'the war missions\' registry' }, complete: true,
    checks: ['campaign:selftest', 'war:stages'],
  },
  {
    kind: 'missions', where: 'src/share/interior/missions/', owner: 'src/share/ops/missions.js',
    files: await idsOf('src/share/interior/missions', {}),
    entries: Object.keys(OPS_MISSIONS),
    support: {}, complete: true,
    checks: ['campaign:selftest'],
  },
  {
    kind: 'films', where: 'src/share/war/films/', owner: 'src/share/war/films/index.js',
    files: await idsOf('src/share/war/films', WAR_FILM_SUPPORT),
    entries: Object.keys(WAR_FILMS),
    support: WAR_FILM_SUPPORT, complete: true,
    checks: ['films:lint'],
  },
  {
    kind: 'films', where: 'src/share/interior/films/', owner: 'src/share/interior/films/index.js',
    files: await idsOf('src/share/interior/films', INTERIOR_FILM_SUPPORT),
    entries: Object.keys(INTERIOR_FILMS),
    support: INTERIOR_FILM_SUPPORT, complete: true,
    checks: [],
  },
  {
    /* A livery entry is stored under its land plane (liveryKey): a float
     * version, or an id no folder has, is an orphan. */
    kind: 'liveries', where: 'configs/liveries.js LIVERIES', owner: 'configs/liveries.js',
    files: Object.keys(LIVERIES),
    entries: FOLDERS.map((f) => f.id).filter((id) => liveryKey(id) === id),
    support: {}, complete: false,
    checks: ['kits:selftest'],
  },
  {
    kind: 'voice lines', where: 'assets/audio/war/voice/', owner: 'assets/audio/war/lines.json',
    files: dirsIn('assets/audio/war/voice').flatMap((lang) => filesIn(`assets/audio/war/voice/${lang}`).map((n) => `${lang}/${n}`)),
    entries: voiceEntries,
    support: {}, complete: true,
    checks: ['voice:check'],
  },
  {
    kind: 'music', where: 'assets/audio/war/music/', owner: 'assets/audio/war/manifest.json',
    files: filesIn('assets/audio/war/music'),
    entries: musicEntries,
    support: {}, complete: true,
    checks: ['voice:check'],
  },
  {
    kind: 'strings', where: 'src/strings/', owner: 'src/strings/en.js',
    files: filesIn('src/strings'),
    entries: LOCALES.map((l) => `${l}.js`),
    support: { 'index.js': 'the lookup, which holds LOCALES' }, complete: true,
    checks: ['strings:selftest', 'lint:copy', 'lint:es-leaks'],
  },
  {
    kind: 'tunes', where: 'configs/*.diff', owner: 'configs/registry.js',
    files: filesIn('configs', '.diff'),
    entries: TUNES.map((t) => basename(fileURLToPath(tunePath(t.id)))),
    support: { 'betaflight-default.diff': 'untouched Betaflight 4.5.1, the benches\' reference (configs/registry.js)' },
    complete: true,
    checks: ['registry:selftest'],
  },
];

/* What is wrong with one row, one line each. */
function problems(row) {
  const out = [];
  const entries = new Set(row.entries);
  const files = new Set(row.files);
  for (const f of row.files) {
    if (!entries.has(f) && !row.support[f]) out.push(`${row.where}: ${f} is not registered by ${row.owner}`);
  }
  if (row.complete) {
    for (const e of row.entries) {
      if (!files.has(e)) out.push(`${row.where}: ${row.owner} registers ${e}, which has no file`);
    }
  }
  for (const s of Object.keys(row.support)) {
    if (entries.has(s)) out.push(`${row.where}: ${s} is both content and support`);
  }
  if (new Set(row.entries).size !== row.entries.length) out.push(`${row.where}: ${row.owner} registers an id twice`);
  return out;
}

for (const row of ROWS) {
  const found = problems(row);
  check(`${row.kind}, ${row.where}: ${row.files.length} on disk, owned by ${row.owner}`, found.length === 0, found.join('; '));
}

/* Each row's checks are npm scripts that CI runs. */
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
const yml = readFileSync(join(root, '.github/workflows/checks.yml'), 'utf8');
const ran = new Set([...yml.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]));
for (const name of [...new Set(ROWS.flatMap((r) => r.checks))].sort()) {
  check(`check ${name} is an npm script that checks.yml runs`, Boolean(scripts[name]) && ran.has(name));
}

/* The table a person reads names every kind and owner here. */
const doc = readFileSync(join(root, 'docs/CONTENT-OWNERS.md'), 'utf8');
const tableRows = doc.split('\n').filter((l) => l.startsWith('| '));
for (const row of ROWS) {
  const said = tableRows.some((l) => l.includes(`| ${row.kind} |`) && l.includes(`\`${row.where}\``) && l.includes(`\`${row.owner}\``));
  check(`docs/CONTENT-OWNERS.md has ${row.kind}, ${row.where} under ${row.owner}`, said);
}

/* Each change, made to a copy of a row, must be caught. */
const copyOf = (where) => {
  const row = ROWS.find((r) => r.where === where);
  return { ...row, files: [...row.files], entries: [...row.entries], support: { ...row.support } };
};
const CONTROLS = [
  ['an aircraft folder no registry lists', 'aircraft/', (r) => { r.files.push('harrier900'); }],
  ['a registered aircraft with no folder', 'aircraft/', (r) => { r.files = r.files.filter((f) => f !== 'cub1400'); }],
  ['a stray file in an aircraft folder', 'aircraft/<id>/', (r) => { r.files.push('cub1400/notes.txt'); }],
  ['a quad with a plant table', 'aircraft/<id>/', (r) => { r.files.push('7inch/plant.json'); }],
  ['a world module no loader imports', 'src/maps/', (r) => { r.files.push('yellowstone.js'); }],
  ['a world folder for no world', 'src/maps/<id>/', (r) => { r.files.push('yellowstone'); }],
  ['a poster for no world', 'assets/posters/', (r) => { r.files.push('yellowstone.jpg'); }],
  ['a course the generator does not write', 'docs/itaipu-courses/', (r) => { r.files.push('dam-sprint.json'); }],
  ['a mission file the registry does not import', 'src/share/war/missions/', (r) => { r.files.push('itaipu-5'); }],
  ['a registered mission with no file', 'src/share/interior/missions/', (r) => { r.files = r.files.filter((f) => f !== 'interior-2'); }],
  ['a film the registry does not import', 'src/share/war/films/', (r) => { r.files.push('night-raid'); }],
  ['an Interior film the registry does not import', 'src/share/interior/films/', (r) => { r.files.push('int4-intro'); }],
  ['a livery under a float version', 'configs/liveries.js LIVERIES', (r) => { r.files.push('cub1400f'); }],
  ['a livery for no aircraft', 'configs/liveries.js LIVERIES', (r) => { r.files.push('5inch'); }],
  ['a take the manifest does not list', 'assets/audio/war/voice/', (r) => { r.files.push('en/unheard.mp3'); }],
  ['a listed take with no file', 'assets/audio/war/voice/', (r) => { r.files.shift(); }],
  ['a music file the manifest does not list', 'assets/audio/war/music/', (r) => { r.files.push('lobby.mp3'); }],
  ['a string table for no locale', 'src/strings/', (r) => { r.files.push('pt.js'); }],
  ['a tune diff no tune names', 'configs/*.diff', (r) => { r.files.push('cub-acro.diff'); }],
  ['a tune registered twice', 'configs/*.diff', (r) => { r.entries.push(r.entries[0]); }],
];
for (const [name, where, change] of CONTROLS) {
  const row = copyOf(where);
  change(row);
  check(`negative control: ${name} is caught`, problems(row).length > 0);
}

if (failed) {
  console.log(`content:owners FAILED (${failed})`);
  process.exit(1);
}
console.log(`content:owners ok, ${ROWS.length} places, ${ROWS.reduce((n, r) => n + r.files.length, 0)} files`);
