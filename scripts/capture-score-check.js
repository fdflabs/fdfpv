#!/usr/bin/env node
/*
 * capture-score-check.js: `npm run capture:score`, the screen's capture
 * scorer (src/avionics/capture.js; docs/campaign/interior/TECH-NEEDS.md
 * N5). Plain Node, no browser.
 *
 *   1. SYNTHETIC FRAMINGS. An item framed at known sizes and offsets,
 *      still or swept, by day and by night, in EO and thermal, behind
 *      crowns and in the open, gives the grade worked out by hand from the
 *      room's cuts (CONTRACT-P0.md 7) and the blur rule.
 *   2. THE WIRE. A real room (edge/rooms/ops.js through scripts/lib/
 *      opsroom.js) running Mission 1 on the fixture world, the client
 *      module (src/share/roomops.js) on the socket: a still the scorer
 *      calls clean is recorded clean for the squad; a forged one (claiming
 *      an item the camera is not on) is refused `frame`; the mark from
 *      outside its viewing band is refused `angle`; the camera reports
 *      keep to two a second.
 *   3. THE STILLS. Kept in memory for their match only, the best of each
 *      item, never more than the cap.
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

import {
  BLUR_FULL_PX, HOLD_MS, blurOf, createCapture, createStillStore, gradeWithBlur,
} from '../src/avionics/capture.js';
import { EXPOSURE_S, BAND } from '../src/avionics/bands.js';
import { MISSIONS, grounded, worldFor } from '../src/share/ops/missions.js';
import { SHELTERS } from '../src/share/interior/missions/interior-1.js';
import { resolve } from '../src/share/ops/stages.js';
import { createRoomOps, CAM_EVERY_MS } from '../src/share/roomops.js';
import { check, finish, opsRoom } from './lib/opsroom.js';

const unit = (a, b) => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = Math.hypot(...d);
  return d.map((c) => c / n);
};

console.log('synthetic framings');
{
  /* One 10 m item at the origin; the camera 1000 m south, level with it,
   * so the item's share of the frame is 10 / (2 * 1000 * tanHalf). */
  const mission = { items: [{ id: 'thing', set: 'a', at: [0, 0, 0], size: 10 }, { id: 'hidden', set: 'a', at: [1500, 2000, 0], size: 10 }] };
  const open = { canopyBlocks: (from, to) => to[1] > 1000, poseOnRoute: () => null };
  const view = { dials: {}, contacts: [], captures: [] };
  const from = [0, -1000, 0];
  const tanFor = (size) => 10 / (2 * 1000 * size);
  /* A camera rotated so the item sits `off` of the half width right. */
  const camAt = (size, off) => {
    const t = tanFor(size);
    const ang = Math.atan(off * t);
    return { dir: [-Math.sin(ang), Math.cos(ang), 0], tanHalf: t, aspect: 16 / 9 };
  };
  const shoot = (cam, { sweep = 0, mode = 'eo', night = false, digital = 1, v = view } = {}) => {
    const c = createCapture(mission, open);
    /* Held for the hold, the picture turning `sweep` rad/s and arriving
     * on the framing at the still. */
    for (let t = 0; t <= HOLD_MS; t += 20) {
      const a = sweep * ((t - HOLD_MS) / 1000);
      const d = cam.dir;
      const cd = { ...cam, dir: [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a), d[2]] };
      c.sample(v, t, from, cd);
      if (t === HOLD_MS) {
        return c.still(v, t, from, cd, { mode, night, digital });
      }
    }
    return null;
  };
  const rows = [
    ['size 0.12, centred: clean', shoot(camAt(0.12, 0)), 'clean'],
    ['size 0.12, off 0.25: clean (on the cut)', shoot(camAt(0.12, 0.25)), 'clean'],
    ['size 0.12, off 0.4: usable', shoot(camAt(0.12, 0.4)), 'usable'],
    ['size 0.09, centred: usable', shoot(camAt(0.09, 0)), 'usable'],
    ['size 0.05, off 0.45: usable', shoot(camAt(0.05, 0.45)), 'usable'],
    ['size 0.03, centred: poor', shoot(camAt(0.03, 0)), 'poor'],
    ['size 0.05, off 0.8: poor', shoot(camAt(0.05, 0.8)), 'poor'],
    ['size 0.005: nothing (frame)', shoot(camAt(0.005, 0)), null, 'frame'],
    ['off 1.2, outside the frame: nothing', shoot(camAt(0.12, 1.2)), null, 'frame'],
  ];
  for (const [name, got, grade, why] of rows) {
    check(name, grade ? got && got.grade === grade && got.item === 'thing' : got && got.why === why, JSON.stringify(got && (got.grade ?? got.why)));
  }
  /* Blur: speed in frame widths a second is rate / (2 tanHalf) for a
   * small field; EO by day 2 ms on 1920 px: 12 px of smear is 3.125
   * frame widths a second. */
  const t12 = tanFor(0.12);
  const fwPerRad = 1 / (2 * t12);
  const sweepFor = (blur, mode, night = false) => (blur * BLUR_FULL_PX) / (EXPOSURE_S[mode][night ? 1 : 0] * BAND[mode].native) / fwPerRad;
  check('blurOf: 12 px of smear is blur 1', Math.abs(blurOf(BLUR_FULL_PX / (0.002 * 1920), 0.002, 1920) - 1) < 1e-9);
  check('blurOf: a digital crop has fewer pixels to smear across', blurOf(1, 0.01, 640, 2) === blurOf(1, 0.01, 640) / 2);
  check('blur 0.2: grade kept', gradeWithBlur('clean', 0.2) === 'clean');
  check('blur 0.4: clean capped at usable', gradeWithBlur('clean', 0.4) === 'usable');
  check('blur 0.7: capped at poor', gradeWithBlur('usable', 0.7) === 'poor');
  check('blur 1: no still', gradeWithBlur('clean', 1) === null);
  const steady = shoot(camAt(0.12, 0), { sweep: sweepFor(0.15, 'eo') });
  check('EO by day, a slow drift (blur 0.15): clean', steady && steady.grade === 'clean' && Math.abs(steady.framing.blur - 0.15) < 0.02, JSON.stringify(steady.framing));
  const swept = shoot(camAt(0.12, 0), { sweep: sweepFor(0.45, 'eo') });
  check('EO by day, a sweep (blur 0.45): usable', swept && swept.grade === 'usable', JSON.stringify(swept.framing));
  const thermal = shoot(camAt(0.12, 0), { sweep: sweepFor(0.25, 'eo'), mode: 'ir_wh' });
  const eo25 = shoot(camAt(0.12, 0), { sweep: sweepFor(0.25, 'eo') });
  check('a drift EO by day keeps clean (blur 0.25)', eo25 && eo25.grade === 'clean');
  check('the same drift in thermal smears more (10 ms core): usable', thermal && thermal.grade === 'usable' && thermal.framing.blur > 0.3, JSON.stringify(thermal.framing));
  const night = shoot(camAt(0.12, 0), { sweep: sweepFor(0.15, 'eo'), night: true });
  check('the same drift at night in EO (33 ms): no still (blur)', night && night.why === 'blur', JSON.stringify(night));
  /* Behind crowns. */
  const c = createCapture(mission, open);
  const hidCam = { dir: unit(from, [1500, 2000, 0]), tanHalf: 10 / (2 * 3354 * 0.12), aspect: 16 / 9 };
  c.sample(view, 0, from, hidCam);
  check('behind crowns: refused here (blocked), not sent', c.still(view, 0, from, hidCam).why === 'blocked');
  /* Already captured clean: nothing better to send. */
  const done = shoot(camAt(0.12, 0), { v: { ...view, captures: [{ item: 'thing', grade: 'clean' }] } });
  check('already captured clean: nothing sent (frame: no item left to capture)', done && !done.msg, JSON.stringify(done));
  const better = shoot(camAt(0.12, 0), { v: { ...view, captures: [{ item: 'thing', grade: 'usable' }] } });
  check('captured usable before: a clean still is still sent', better && better.grade === 'clean');
  /* An item that is a group of contacts, as the view gives them (no
   * size): each member judged where its route puts it. */
  const people = { items: [{ id: 'crowd', set: 'b', contact: 'grp', size: 1.7 }] };
  const walk = { canopyBlocks: () => false, poseOnRoute: () => ({ x: 0, y: 0, z: 0, heading: 0, action: 'walk' }) };
  const cg = createCapture(people, walk);
  const v2 = { dials: {}, captures: [], contacts: [{ id: 'p1', kind: 'person', group: 'grp', route: 'r', t0: 0, state: 'seen', cls: 'unknown' }] };
  const camP = { dir: [0, 1, 0], tanHalf: 1.7 / (2 * 1000 * 0.12), aspect: 16 / 9 };
  cg.sample(v2, 0, from, camP);
  const crowd = cg.still(v2, 0, from, camP);
  check('a group of contacts from the view (no size there) is capturable', crowd.item === 'crowd' && crowd.grade === 'clean', JSON.stringify(crowd.framing ?? crowd.why));
  const msg = steady.msg;
  check('the message is the contract\'s capture', msg.type === 'ops' && msg.op === 'capture' && msg.item === 'thing' && Number.isInteger(msg.t) && msg.grade === 'clean'
    && ['size', 'off', 'blur'].every((k) => Number.isFinite(msg.framing[k])));
}

console.log('the wire: a real room, the client module');
{
  const W = worldFor('interior');
  /* The mission's heights over WORLD's ground made absolute, as the room
   * flies it (missions.js grounded). */
  const M = grounded(MISSIONS['interior-1'], W);
  const e = opsRoom(M, {
    n: 2, world: W, map: 'interior', devMissions: true,
  });
  const client = createRoomOps((obj) => e.say(0, obj));
  let read = 0;
  const pump = () => {
    const got = e.socks[0].got;
    for (; read < got.length; read += 1) {
      const m = got[read];
      if (m.type === 'welcome') {
        client.onWelcome(m);
      } else {
        client.onMessage(m);
      }
    }
  };
  const bridge = M.items.find((x) => x.id === 'bridge').at;
  const P0 = [bridge[0], bridge[1] - 400, bridge[2] + 500];
  e.paths[0] = () => P0;
  e.paths[1] = () => [0, 0, 300];
  e.fly(200);
  pump();
  check('the client heard the welcome and the view', client.seat() != null && client.view().mission === 'interior-1', client.view().state);
  e.fly(15000);
  pump();
  check('the match is live', client.live(), client.view().state);
  const cam = { dir: unit(P0, bridge), tanHalf: 0.2, aspect: 16 / 9 };
  /* The screen's reports, two a second, as the shell sends them. */
  e.cams[0] = () => ({ aim: bridge, tanHalf: cam.tanHalf, aspect: cam.aspect });
  e.fly(e.clock + 2000);
  pump();
  /* Cam reports through a client of its own: two a second at most. */
  const said = [];
  const tap = createRoomOps((obj) => said.push(obj));
  tap.onWelcome({ seat: 9, ops: client.view() });
  for (let t = 0; t <= 2000; t += 16) {
    tap.cam(t, bridge, cam.tanHalf, cam.aspect);
  }
  const gaps = said.slice(1).map((m, i) => m.t - said[i].t);
  check('camera reports at most two a second, as aim points', said.length === 4 && gaps.every((g) => g >= CAM_EVERY_MS) && said.every((m) => m.op === 'cam' && m.aim.length === 3 && !m.dir),
    `${said.length} in 2 s, gaps ${gaps.join()}`);
  const cap = createCapture(M, W);
  const tStill = e.clock - 300;
  for (let t = tStill - HOLD_MS; t <= tStill; t += 33) {
    cap.sample(client.view(), t, P0, cam);
  }
  const s = cap.still(client.view(), tStill, P0, cam);
  check('the scorer calls the bridge clean', s.item === 'bridge' && s.grade === 'clean', JSON.stringify(s.framing ?? s.why));
  client.capture(s.msg);
  e.fly(e.clock + 400);
  pump();
  const evs = client.takeEvents();
  const rec = client.view().captures.find((x) => x.item === 'bridge');
  check('the room recorded it clean, credited to the seat', rec && rec.grade === 'clean' && rec.seat === client.seat(), JSON.stringify(rec));
  check('the client told it as a capture of its own', evs.some((x) => x.type === 'captured' && x.item === 'bridge' && x.mine));
  /* Forged: the sheds, with the camera on the bridge. */
  client.capture({
    type: 'ops', op: 'capture', item: 'sheds', t: e.clock - 300, grade: 'clean', framing: { size: 0.2, off: 0, blur: 0 },
  });
  e.fly(e.clock + 100);
  pump();
  const refused = client.takeEvents().filter((x) => x.type === 'error');
  check('a forged capture (the camera is not on it) is refused frame', refused.some((x) => x.error === 'capture' && x.why === 'frame'), JSON.stringify(refused));
  /* The mark, from the wrong side of its shelter, by pilot 2. */
  const mark = client.view().dials.mark;
  const sym = resolve(M.items.find((x) => x.id === 'symbol').at, client.view().dials);
  const away = SHELTERS[mark].dir;
  const P1 = [sym[0] - away[0] * 300, sym[1] - away[1] * 300, sym[2] + 120];
  e.paths[1] = () => P1;
  const cam1 = { aim: sym, tanHalf: 0.004, aspect: 16 / 9 };
  e.cams[1] = () => cam1;
  e.fly(e.clock + 1500);
  e.say(1, {
    type: 'ops', op: 'capture', item: 'symbol', t: e.clock - 300, grade: 'clean', framing: { size: 0.2, off: 0, blur: 0 },
  });
  const why = e.errors(1).at(-1);
  check('the mark from outside its band is refused angle', why && why.why === 'angle', JSON.stringify(why));
  const c1 = createCapture(M, W);
  const camDir = { dir: unit(P1, sym), tanHalf: 0.004, aspect: 16 / 9 };
  c1.sample(client.view(), 0, P1, camDir);
  const st1 = c1.still(client.view(), 0, P1, camDir);
  check('the room says what has opened (the view\'s `opened`), and the mark is not yet', Array.isArray(client.view().opened) && !client.view().opened.includes('symbol'), JSON.stringify(client.view().opened));
  check('so the scorer predicts the same refusal and sends nothing (angle)', st1.why === 'angle', JSON.stringify(st1));
  const opened = { ...client.view(), opened: ['symbol'] };
  const c2 = createCapture(M, W);
  c2.sample(opened, 0, P1, camDir);
  const st2 = c2.still(opened, 0, P1, camDir);
  check('once the room says the mark has opened, the same still is proposed', st2.item === 'symbol' && st2.band === true && Boolean(st2.msg), JSON.stringify(st2.framing ?? st2.why));
  const old = { ...client.view() };
  delete old.opened;
  const c3 = createCapture(M, W);
  c3.sample(old, 0, P1, camDir);
  const st3 = c3.still(old, 0, P1, camDir);
  check('a room that does not say what has opened is still asked', st3.item === 'symbol' && st3.band === false && Boolean(st3.msg), JSON.stringify(st3.framing ?? st3.why));
}

console.log('stills');
{
  const st = createStillStore({ max: 3 });
  st.add({ match: 'A:1', item: 'x', grade: 'poor' });
  st.add({ match: 'A:1', item: 'x', grade: 'clean' });
  st.add({ match: 'A:1', item: 'y', grade: 'usable' });
  st.add({ match: 'A:2', item: 'z', grade: 'usable' });
  check('never more than the cap', st.all().length === 3);
  check('a bettered still goes first', !st.all().some((s) => s.item === 'x' && s.grade === 'poor'));
  check('a match\'s stills, the best of each', st.of('A:1').map((s) => `${s.item}:${s.grade}`).sort().join() === 'x:clean,y:usable');
  st.keepOnly('A:2');
  check('a new match keeps none of the last\'s', st.all().length === 1 && st.of('A:1').length === 0);
}

finish();
