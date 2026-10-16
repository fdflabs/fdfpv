/*
 * briefcard-selftest.js: the mission brief card (src/ui/briefcard.js) for
 * every playable mission, Defend the Paraná's six and The Interior's
 * three, in every locale: a title, every header fact, two situation
 * lines, objectives, three star rules, threats, the role with who is on
 * the radio, a map, and the win and lose lines, none of them empty, a raw
 * string key or an unfilled placeholder; and none for the drill and the
 * practice, which have no film and no briefing. The card in the browser,
 * after a film and after a skip, is scripts/briefcard-check.js.
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

import { readFileSync } from 'node:fs';
import { LOCALES, useLocale } from '../src/strings/index.js';
import { CARD_MISSIONS, cardOf } from '../src/ui/briefcard.js';
import { MISSIONS as WAR } from '../src/share/war/missions/index.js';
import { mw } from '../src/ui/warhud.js';

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

const LINES = JSON.parse(readFileSync(new URL('../assets/audio/war/lines.json', import.meta.url), 'utf8')).lines;
const SPEAKER = new Map(LINES.map((l) => [l.id, l.speaker]));
const speakerOf = (id) => SPEAKER.get(id);

const PLAYABLE = ['itaipu-1', 'itaipu-2', 'itaipu-3', 'itaipu-4', 'itaipu-5', 'itaipu-6', 'interior-1', 'interior-2', 'interior-3'];
check('the card covers every playable mission, Itaipu 1 to 6 and Interior 1 to 3, and nothing else', CARD_MISSIONS.join() === PLAYABLE.join(), CARD_MISSIONS.join());
check('the drill and the practice have none: no film, no briefing', cardOf('itaipu-drill') === null && cardOf('itaipu-practice') === null && cardOf('nope') === null);

/* A shown text: words, never a key or a placeholder left unfilled. */
const KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const shown = (t) => typeof t === 'string' && t.trim().length > 0 && !KEY.test(t) && !/[{}]/.test(t) && !/[–—]/.test(t);

const byLocale = {};
for (const locale of LOCALES) {
  await useLocale(locale);
  console.log(`brief card, ${locale}`);
  byLocale[locale] = {};
  for (const id of PLAYABLE) {
    const c = cardOf(id, { speakerOf });
    byLocale[locale][id] = c;
    check(`${id}: a card with its title`, Boolean(c) && shown(c.title), c && c.title);
    check(`${id}: operation, where, when, length and pilots, each with a value`, c.facts.length === 5 && c.facts.every((f) => shown(f.label) && shown(f.value)), JSON.stringify(c.facts));
    check(`${id}: two situation lines`, c.situation.length === 2 && c.situation.every(shown), JSON.stringify(c.situation));
    check(`${id}: objectives`, c.objectives.length > 0 && c.objectives.every(shown), JSON.stringify(c.objectives));
    check(`${id}: three star rules`, c.stars.length === 3 && c.stars.every(shown), JSON.stringify(c.stars));
    check(`${id}: threats, each with its line`, c.threats.length > 0 && c.threats.every(shown), JSON.stringify(c.threats));
    check(`${id}: the role's rows, the radio naming who supports it`, c.role.length > 0 && c.role.every((r) => shown(r.label) && shown(r.value)), JSON.stringify(c.role));
    check(`${id}: win and lose lines`, shown(c.win) && shown(c.lose), JSON.stringify([c.win, c.lose]));
    const inBox = (p) => p[0] >= 0 && p[1] >= 0 && p[0] <= 100 && p[1] <= 100;
    check(`${id}: a map of its places in a box 100 wide`, c.map.points.length > 0 && c.map.points.every(inBox) && c.map.lines.flat().every(inBox), JSON.stringify(c.map).slice(0, 120));
  }
}

const en = byLocale.en;
const es = byLocale.es;
check('the Spanish card is the Spanish table\'s: every mission\'s situation and threats differ from the English',
  PLAYABLE.every((id) => es[id].situation[0] !== en[id].situation[0] && es[id].threats[0] !== en[id].threats[0]));

await useLocale('en');
/* What the card says is the mission's: a check per source. */
const m1 = en['itaipu-1'];
const turn = WAR['itaipu-1'].stages.find((s) => s.id === 'back-door');
check('Itaipu 1: its seeded turn is one line of its three choices, after the stages that always come', m1.objectives.at(-1).startsWith('One of these turns:')
  && m1.objectives.at(-1).includes('Stop the swarm in the gorge') && Boolean(turn), m1.objectives.at(-1));
check('Itaipu 1: every kind its stages spawn is a threat, the decoy mixed into a wave too', ['SCOUT', 'STRIKER', 'LOITERER', 'DECOY', 'FPV SWARM', 'SEA DRONE', 'HUNTER'].every((k) => m1.threats.some((t) => t.startsWith(`${k}:`)))
  && m1.threats.length === 7, JSON.stringify(m1.threats));
check('Itaipu 1: the third star is its starMw, the lose line its floor', m1.stars[2].includes(mw(11200)) && m1.lose.includes(mw(7700)), `${m1.stars[2]} / ${m1.lose}`);
check('Itaipu 1: CREST, MIRADOR and TALLER on the radio, CREST first', /^CREST,/.test(m1.role[2].value) && /MIRADOR/.test(m1.role[2].value) && /TALLER/.test(m1.role[2].value), m1.role[2].value);
check('Itaipu 5: the carrier is a threat', en['itaipu-5'].threats.some((t) => t.startsWith('CARRIER:')), JSON.stringify(en['itaipu-5'].threats));
check('Itaipu 4: flown at night, and the card says so', en['itaipu-4'].facts[2].value.includes('Night'), en['itaipu-4'].facts[2].value);
const i1 = en['interior-1'];
check('Interior 1: being seen, the ISR aircraft and the light are what end it', i1.threats.length === 3 && i1.threats[0].startsWith('BEING SEEN'), JSON.stringify(i1.threats));
check('Interior 1: its rule is on the card, no engagement', i1.objectives.some((o) => o.startsWith('Rule:')), JSON.stringify(i1.objectives));
check('Interior 1: starts at 16:40, 20 to 30 minutes', i1.facts[2].value.startsWith('16:40') && i1.facts[3].value === '20 to 30 minutes', JSON.stringify(i1.facts));
check('Interior 3: civilian errors and the post are threats too', ['CIVILIAN ERRORS', 'THE POST'].every((k) => en['interior-3'].threats.some((t) => t.startsWith(k))), JSON.stringify(en['interior-3'].threats));
const held = cardOf('interior-3', { speakerOf, role: 'strike', pilots: 3 });
check('a pilot\'s held role and the room\'s pilots replace the dealt roles and the range', held.role[0].value.startsWith('STRIKE, in the') && held.facts[4].value === '3 pilots here',
  `${held.role[0].value} / ${held.facts[4].value}`);
const loaded = cardOf('itaipu-2', { speakerOf, loadout: { rack: 6, warhead: 'emp', speedMul: 1.15 } });
check('the war\'s loadout is this pilot\'s', loaded.role[1].value === 'A rack of 6, EMP warhead, faster airframe', loaded.role[1].value);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
