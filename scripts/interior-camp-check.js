#!/usr/bin/env node
/*
 * interior-camp-check.js: the camp changes on screen as its people act
 * (MISSIONS.md M1_08 and M1_09, TECH-NEEDS N4): the side tarp comes back
 * as the tarp mover crouches at the marked shelter, the mast comes down
 * as the antenna man works at its foot, and a pushed motorcycle leaves
 * its parking place. The room tells none of this as state: the map reads
 * it off the contacts it draws (their route and how far along it they
 * are, src/maps/interior/life.js campDone), so every screen agrees and a
 * late joiner sees the camp as it is.
 *     SIM_GPU=1 node scripts/interior-camp-check.js
 * In headless Chromium, the map built by the shell, contacts handed to
 * the map as the shell hands them (life.setContacts): the camp's state
 * (camp.state()) and what is drawn (life.stats()) before and after.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { CAMP_PROPS } from '../src/share/interior/places.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* The map's life, its camp's state and what is drawn, after these
 * contacts are handed over at room ms `now`. */
const after = (contacts, now = 0) => `(() => {
  const life = window.__mapScene().userData.interior.life;
  life.setContacts(${JSON.stringify(contacts)}, ${now});
  return { camp: life.camp.state(), stats: life.stats(), total: {
    tarp: life.routes.total('camp-tarp-move-s1'), mast: life.routes.total('out-e-a') } };
})()`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=interior' });
try {
  await page.until('window.__map && window.__map().id === "interior" && window.__map().ready', 180000);
  const quiet = await page.evaluate(after([]));
  check('an empty camp: the tarp hangs, the mast stands, every motorcycle parked',
    quiet.camp.tarp === 0 && quiet.camp.mast === 0 && quiet.stats.parked === CAMP_PROPS.motorcycles.length, JSON.stringify(quiet));
  const bikes0 = quiet.stats.vehicles;

  /* The tarp mover: walking to the marked shelter's corner the tarp still
   * hangs; thirty seconds into the crouch it is back over the roof. */
  const walking = await page.evaluate(after([{ id: 'camp-tarp', kind: 'person', route: 'camp-tarp-move-s1', ms: 1000 }]));
  const crouchStart = quiet.total.tarp - 60000;
  const pulled = await page.evaluate(after([{ id: 'camp-tarp', kind: 'person', route: 'camp-tarp-move-s1', ms: crouchStart + 30000 }]));
  const stayed = await page.evaluate(after([{ id: 'camp-tarp', kind: 'person', route: 'camp-tarp-move-s1', ms: quiet.total.tarp + 600000 }]));
  check('the tarp mover on the way: the tarp still hangs', walking.camp.tarp === 0, JSON.stringify(walking.camp));
  check('thirty seconds into the crouch: the tarp is back', pulled.camp.tarp === 1, JSON.stringify(pulled.camp));
  check('and stays back for good', stayed.camp.tarp === 1, JSON.stringify(stayed.camp));

  /* The antenna man at the mast's foot (out-e-a, a 25 s takeDownAntenna
   * dwell before he walks): half way through, the mast is half down. */
  const half = await page.evaluate(after([{ id: 'camp-mast', kind: 'person', route: 'out-e-a', ms: 12500 }]));
  const down = await page.evaluate(after([{ id: 'camp-mast', kind: 'person', route: 'out-e-a', ms: 60000 }]));
  check('the antenna man half way through his dwell: the mast is half down', Math.abs(half.camp.mast - 0.5) < 1e-9, JSON.stringify(half.camp));
  check('and down once he has walked off', down.camp.mast === 1, JSON.stringify(down.camp));

  /* Two pushers: each takes the parked motorcycle nearest where their
   * route starts; the count drawn holds (two parked gone, two pushed). */
  const pushed = await page.evaluate(after([
    { id: 'camp-moto-1', kind: 'person', route: 'out-s-a', ms: 3000 },
    { id: 'camp-moto-2', kind: 'person', route: 'out-w-a', ms: 3000 },
  ]));
  check('two pushers: two parked motorcycles gone, two under them', pushed.stats.parked === CAMP_PROPS.motorcycles.length - 2 && pushed.stats.vehicles === bikes0, JSON.stringify(pushed.stats));

  /* Everybody gone from the list again: the camp reads as the contacts
   * say, nothing is remembered on its own. */
  const back = await page.evaluate(after([]));
  check('contacts cleared: the camp reads from the contacts alone', back.camp.tarp === 0 && back.camp.mast === 0 && back.stats.parked === CAMP_PROPS.motorcycles.length, JSON.stringify(back));
  const errors = await page.evaluate('(window.__pageErrors || []).length');
  check('no page errors', errors === 0, `${errors}`);
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
