/*
 * war-cards-selftest.js: the war HUD's objective cards (src/ui/warhud.js
 * objectiveCards) in Node. npm run war:cards. A stage's opening objectives
 * are not carded; one shown later (a twist's) is PRIMARY OBJECTIVE
 * UPDATED; one settled is COMPLETE or FAILED, once; both languages have
 * the words.
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

import { objectiveCards } from '../src/ui/warhud.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  pass  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const stage = { id: 'back-door', at: 1000 };
let was = { entry: null, states: new Map() };
function step(st, list) {
  const r = objectiveCards(was, st, list);
  was = r.now;
  return r.cards;
}
check('a stage opening is not carded', step(stage, [{ id: 'swarm', state: 'active' }]).length === 0);
check('nothing changed, no card', step(stage, [{ id: 'swarm', state: 'active' }]).length === 0);
let c = step(stage, [{ id: 'swarm', state: 'active' }, { id: 'extra', state: 'active' }]);
check('an objective shown later is PRIMARY OBJECTIVE UPDATED', c.join() === 'card.primary_updated', c.join());
c = step(stage, [{ id: 'swarm', state: 'done' }, { id: 'extra', state: 'active' }]);
check('one done is OBJECTIVE COMPLETE', c.join() === 'card.objective_done', c.join());
check('and only once', step(stage, [{ id: 'swarm', state: 'done' }, { id: 'extra', state: 'active' }]).length === 0);
c = step(stage, [{ id: 'swarm', state: 'done' }, { id: 'extra', state: 'failed' }]);
check('one failed is OBJECTIVE FAILED', c.join() === 'card.objective_failed', c.join());
check('the same stage entered again is a new opening', step({ id: 'back-door', at: 9000 }, [{ id: 'swarm', state: 'active' }]).length === 0);
check('no stage, no card', step(null, []).length === 0);
const keys = ['card.primary_updated', 'card.objective_done', 'card.objective_failed'];
const missing = keys.flatMap((k) => [[en, 'en'], [es, 'es']].filter(([t]) => !t[k]).map(([, l]) => `${l}:${k}`));
check('every card has its words in English and Spanish', missing.length === 0, missing.join());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
