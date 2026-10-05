/*
 * interior-names.js: the Interior's world names no real place and gives no
 * real coordinate (docs/campaign/interior/PLAN.md section 1, the owner's
 * hard constraint: "no real town, person, armed group, symbol, incident or
 * exact coordinates appears anywhere: strings, textures, HUD, file names").
 *
 *     node scripts/interior-names.js
 *
 * What it checks, over every file of the Interior's world (src/maps/interior,
 * src/share/interior, src/render/interior, tools/interior, the world's
 * scripts and docs/campaign/interior/WORLD.md), tracked or new:
 *
 *   names       every name src/share/interior/places.js gives a player
 *               (its NAMES) is on BIBLE.md section 2's list of invented
 *               places, or is one of the plain descriptions below;
 *   real names  no file names a real place of the region, from the list
 *               below (departments, towns, rivers, protected forests, the
 *               mocks' "CORDILLERA"), in any case, accented or not;
 *   coordinates no file carries what reads as a coordinate of the region:
 *               a decimal degree of its latitudes or longitudes, a
 *               degrees and minutes form, a source tile's name (a
 *               hemisphere letter and degrees, or a UTM zone and band),
 *               or a UTM northing of its band;
 *   file names  the same, in every file's own path.
 *
 * ONE FILE IS EXEMPT: tools/interior/source.py, the only place the source
 * area is written, because the pipeline has to fetch it from somewhere.
 * This file is exempt from the real names check only, because it has to
 * hold the list.
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

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAMES } from '../src/share/interior/places.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SELF = 'scripts/interior-names.js';
const SOURCE = 'tools/interior/source.py';

/* The world's files: these prefixes and these single files. */
const PREFIXES = ['src/maps/interior/', 'src/share/interior/', 'src/render/interior/', 'tools/interior/'];
const FILES = [
  'src/maps/interior.js',
  'docs/campaign/interior/WORLD.md',
  'scripts/interior-views.js',
  'scripts/interior-collide.js',
  'scripts/canopy-los.js',
  'scripts/people-route.js',
  SELF,
];

/* Plain descriptions places.js may name a place by, beside the BIBLE's
 * invented names: the plan's own words (MISSIONS.md M1), none a place. */
const DESCRIPTIONS = new Set([
  'Sector Alpha', 'Sector Bravo', 'Sector Charlie', 'the schoolteacher\'s house', 'the anomaly corridor',
  'the operational boundary', 'the cañada',
]);

/*
 * Real places of the region a careless string could bring in: its
 * departments, its towns and districts, its rivers and its protected
 * forests, and the mocks' area name. Matched as whole words, case and
 * accents ignored. The country's own name is here too: BIBLE.md rule 2,
 * the country is never named inside the world.
 */
const REAL = [
  'Paraguay', 'Paraguayo', 'Paraguaya', 'Concepcion', 'Amambay', 'San Pedro', 'Canindeyu', 'Alto Paraguay',
  'Presidente Hayes', 'Boqueron', 'Asuncion', 'Pedro Juan Caballero', 'Horqueta', 'Belen', 'Yby Yau',
  'Azotey', 'Loreto', 'Vallemi', 'San Lazaro', 'Bella Vista', 'Capitan Bado', 'Zanja Pyta', 'Arroyito',
  'Paso Barreto', 'Sargento Jose Felix Lopez', 'San Carlos del Apa', 'Puerto Casado', 'Fuerte Olimpo',
  'Tacuati', 'Santa Rosa del Aguaray', 'Lima', 'Aquidaban', 'Ypane', 'Rio Apa', 'Jejui', 'Ypane', 'Chaco',
  'Mbaracayu', 'Cerro Cora', 'Serrania de San Luis', 'San Luis', 'Cordillera', 'Amambai', 'Dourados',
  'Corumba', 'Mato Grosso',
];

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const REAL_RE = new RegExp(`(^|[^A-Za-z])(${REAL.map((r) => r.replace(/ /g, '[ _-]')).join('|')})(?![A-Za-z])`, 'i');

/* The region's latitudes (19 to 28 S) and longitudes (54 to 63 W) as
 * decimals of three places or more, a degrees and minutes form, a source
 * tile name, and a UTM northing of the band (7.3 to 7.9 million m). */
const COORD_RES = [
  [/(^|[^\d.])-?(19|2[0-8])\.\d{3,}/, 'a decimal latitude of the region'],
  [/(^|[^\d.])-?(5[4-9]|6[0-3])\.\d{3,}/, 'a decimal longitude of the region'],
  [/\b(19|2[0-8]|5[4-9]|6[0-3])\s*°\s*\d{1,2}\s*['′]/, 'degrees and minutes'],
  [/\b[NS](19|2[0-8])[EW]0?(5[4-9]|6[0-3])\b/i, 'a source tile name'],
  [/_2[01][JK]\b/, 'a UTM zone and band tile name'],
  [/\b7[3-8]\d{5}(\.\d+)?\b/, 'a UTM northing of the band'],
];

function files() {
  const list = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const all = new Set([...list(['ls-files']), ...list(['ls-files', '--others', '--exclude-standard'])]);
  /* uv.lock is the package index's hashes, and bytecode is not source. */
  return [...all].filter((f) => PREFIXES.some((p) => f.startsWith(p)) || FILES.includes(f))
    .filter((f) => !f.endsWith('/uv.lock') && !f.includes('__pycache__/'))
    .sort();
}

/* BIBLE.md section 2.2's names: the bold first cell of each table row. */
function bibleNames() {
  const text = readFileSync(join(root, 'docs/campaign/interior/BIBLE.md'), 'utf8');
  const at = text.indexOf('### 2.2 The invented places');
  const end = text.indexOf('### 2.3', at);
  if (at < 0 || end < 0) {
    throw new Error('interior-names: BIBLE.md has no section 2.2');
  }
  const out = new Set();
  for (const m of text.slice(at, end).matchAll(/^\| \*\*(.+?)\*\* \|/gm)) {
    out.add(m[1]);
  }
  return out;
}

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

const invented = bibleNames();
for (const name of NAMES) {
  if (!invented.has(name) && !DESCRIPTIONS.has(name)) {
    fail(`places.js names "${name}", which is neither on BIBLE.md 2.2's list nor a plain description`);
  }
}

const checked = files();
for (const f of checked) {
  if (f === SOURCE) {
    continue;
  }
  for (const [re, what] of COORD_RES) {
    if (re.test(f)) {
      fail(`${f}: its name carries ${what}`);
    }
  }
  if (REAL_RE.test(fold(f))) {
    fail(`${f}: its name names a real place`);
  }
  if (/\.(bin|png|jpg|webp|ktx2)$/.test(f)) {
    continue;
  }
  const text = readFileSync(join(root, f), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, k) => {
    for (const [re, what] of COORD_RES) {
      const m = line.match(re);
      if (m) {
        fail(`${f}:${k + 1}: ${what}: "${line.trim().slice(0, 100)}"`);
      }
    }
    if (f !== SELF) {
      const m = fold(line).match(REAL_RE);
      if (m) {
        fail(`${f}:${k + 1}: names a real place, "${m[2]}"`);
      }
    }
  });
}

console.log(`interior-names: ${NAMES.length} names against ${invented.size} of the BIBLE's, ${checked.length} files`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log('PASS, every name invented and no coordinate or real place in the Interior\'s files');
}
