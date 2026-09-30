/*
 * war-twopage-wire.js: the war client wired into a page of the real shell
 * for scripts/war-twopage.js, without src/main.js, whose wiring is the
 * lead's (docs/WAR-WIRING.md says what main.js calls, and where). Loaded
 * in the page by the check, never by the shell.
 *
 * It hears the room through the check's TAP_SEED, a WebSocket subclass
 * seeded before the shell's first line runs: every frame of the rooms
 * socket is queued until install() drains the queue into a roomwar and
 * listens from then on. It sends on that same socket. Everything else is
 * what main.js will do: the attackers into the map's scene once a frame
 * at the room clock, deaths and warheads to the renderer, the events and
 * the view to the HUD. What it leaves out is the flight side, the
 * warhead breaking this craft, which needs the plant.
 *
 * window.__war() is the check's view of it; window.__warDo(op, arg) acts.
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

import { createRoomWar } from '../src/share/roomwar.js';
import { createAttackers } from '../src/render/attackers.js';
import { createDebris } from '../src/render/debris.js';
import { createWarHud } from '../src/ui/warhud.js';

/* The room clock is read from the shell this often, and run on the wall
 * clock between. */
const CLOCK_MS = 250;

export function install() {
  const tap = window.__warTap;
  const war = createRoomWar((obj) => tap.socket.send(JSON.stringify(obj)));
  const debris = createDebris();
  const attackers = createAttackers({ debris, floorAt: (x, z) => window.__heightAt(x, z) });
  const hud = createWarHud((seat) => `#${seat}`);
  const log = [];

  const hear = (d) => {
    if (typeof d !== 'string') {
      war.onBinary(d);
      return;
    }
    if (d === 'pong') {
      return;
    }
    const m = JSON.parse(d);
    if (m.type === 'welcome') {
      war.onWelcome(m);
    } else {
      war.onMessage(m);
    }
  };
  for (const d of tap.queue) {
    hear(d);
  }
  tap.queue = [];
  tap.on = hear;

  let clock = null;
  let lastFrame = performance.now();
  let drawnAt = null;
  function roomNow(now) {
    if (!clock || now - clock.at > CLOCK_MS) {
      const r = window.__rooms().roomNow;
      clock = r == null ? null : { room: r, at: now };
    }
    return clock ? clock.room + (now - clock.at) : null;
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const scene = window.__mapScene && window.__mapScene();
    if (scene && attackers.group.parent !== scene) {
      scene.add(attackers.group, debris.group);
    }
    const t = roomNow(now);
    for (const ev of war.takeEvents()) {
      log.push({ ...ev, heardAt: t });
      if (ev.type === 'dead') {
        attackers.dead(ev);
      } else if (ev.type === 'boom') {
        attackers.boom(ev.p);
      }
      hud.events([ev]);
    }
    attackers.update(war.attackersAt(t), dt);
    drawnAt = t;
    debris.update(dt);
    const m = war.mission();
    hud.update(war.view(), war.seat(), t, m ? m.output : 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__war = () => ({
    seat: war.seat(),
    view: war.view(),
    error: war.error(),
    drawn: { ...attackers.drawn(), at: drawnAt },
    hud: hud.shown(),
    said: hud.said(),
    log: log.map((e) => ({
      type: e.type, why: e.why, ids: e.ids, seat: e.seat, by: e.by, at: e.at, p: e.p, target: e.target, hit: e.hit, mine: e.mine, to: e.to,
    })),
  });
  window.__warAt = (t) => war.attackersAt(t);
  window.__warDo = (op, arg) => {
    if (op === 'start') {
      war.start(arg);
    } else if (op === 'end') {
      war.end();
    }
    return true;
  };
  return true;
}
