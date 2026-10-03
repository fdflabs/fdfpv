/*
 * briefing-selftest.js: Operations' briefing (src/ui/briefing.js) is
 * whole for every campaign mission, in every language.
 *
 * Node only. For each mission of Act 1 (src/game/campaign.js ACT1) and
 * each locale: a title, the campaign's line, the five facts (where, the
 * aircraft, the length, the pilots, the room), each with a value; every
 * campaign mission's definition carrying estimatedMinutes, [low, high]
 * (src/share/war/missions), and the briefing showing it; the room told as public or as private with its code;
 * no difficulty anywhere; no em or en dash in what it says. And the
 * mission whose opening stage has objectives (the stage engine's) shows
 * them.
 *
 * Run with npm run briefing:selftest.
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

import { ACT1 } from '../src/game/campaign.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { LOCALES, useLocale } from '../src/strings/index.js';
import { briefingOf } from '../src/ui/briefing.js';

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

for (const locale of LOCALES) {
  await useLocale(locale);
  console.log(`briefing, ${locale}`);
  for (const m of ACT1) {
    const pub = briefingOf(m.id, { public: true, code: 'ABC123' });
    const priv = briefingOf(m.id, { public: false, code: 'ABC123' });
    check(`${m.id}: a briefing with a title and the campaign's line`, Boolean(pub) && pub.title.length > 0 && pub.line.length > 0, JSON.stringify(pub && [pub.title, pub.line]));
    check(`${m.id}: five facts, each with a value`, pub.facts.length === 5 && pub.facts.every((f) => f.label && f.value), JSON.stringify(pub.facts));
    const est = MISSIONS[m.id].estimatedMinutes;
    check(`${m.id}: its definition carries estimatedMinutes, and the briefing shows it`, Array.isArray(est) && est.length === 2
      && est.every((x) => Number.isInteger(x) && x > 0) && est[0] < est[1] && pub.facts[2].value.includes(String(est[0])), `${JSON.stringify(est)} ${pub.facts[2].value}`);
    check(`${m.id}: the room told as public, or private with its code`, pub.facts[4].value !== priv.facts[4].value && priv.facts[4].value.includes('ABC123'),
      `${pub.facts[4].value} / ${priv.facts[4].value}`);
    const text = JSON.stringify(pub);
    check(`${m.id}: no difficulty, no em or en dash`, !/difficult|dificultad/i.test(text) && !/[\u2013\u2014]/.test(text));
  }
  const withStages = ACT1.filter((m) => (MISSIONS[m.id].stages || []).some((s) => Array.isArray(s.objectives) && s.objectives.length));
  check('a mission whose opening stage has objectives shows them', withStages.length > 0 && withStages.every((m) => briefingOf(m.id).objectives.length > 0),
    withStages.map((m) => m.id).join());
  check('no mission that is not one', briefingOf('no-such-mission') === null);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
