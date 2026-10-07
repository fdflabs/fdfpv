/*
 * standgate.js: one five inch gate standing on a world's grass, seated as a
 * track, for the crash scripts that clip a gate post.
 *
 * scripts/crash-feel.js and scripts/crash-shots.js throw a five inch at a
 * race gate's upright. They used the race field's gates until the field was
 * deleted; this stands the same gate, from the in-sim builder at the same
 * scale, 12 m ahead of the world's spawn and square to it, and seats it the
 * way My tracks' Play seats one of the pilot's own, so it is the solid,
 * compliant gate a raced track has.
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

import { addGate, headingOf, newCourse, qAxis } from '../../src/builder/course.js';
import { toPlain } from '../../src/trackbuilder/model.js';

/* `page` is a tests/lib/page.js page with the world `map` built. */
export async function standGate(page, map) {
  const at = await page.evaluate(`(() => {
    const s = window.__map().spawn;
    const x = s.x - Math.sin(s.yaw) * 12;
    const z = s.z - Math.cos(s.yaw) * 12;
    return { x, z, y: window.__heightAt(x, z), tx: -Math.sin(s.yaw), tz: -Math.cos(s.yaw) };
  })()`);
  const doc = newCourse(map, 'Crash gate');
  doc.id = 'trk-c7a5ef00';
  addGate(doc, 'gate', { x: at.x, y: at.y, z: at.z }, qAxis(0, 1, 0, headingOf(at.tx, at.tz)));
  const share = { id: doc.id, name: doc.name, document: toPlain(doc), local: true };
  await page.evaluate(`(() => {
    localStorage.setItem('fdfpv.share.import.v1', ${JSON.stringify(JSON.stringify(share))});
    window.__ui.settings.map = 'track';
    window.__ui.persistSettings();
    window.__ui.onSettings(window.__ui.settings);
    return true;
  })()`);
  await page.until(`window.__map().ready && window.__map().id === ${JSON.stringify(map)} && window.__race().gates.length === 1`, 240000);
}
