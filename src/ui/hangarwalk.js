/*
 * hangarwalk.js: the walkable hangar's screen (docs/HANGAR-ROOM.md). The
 * pilot walks the room on held keys or the pad, the camera follows, and
 * the station in front of them is named with its key; using it opens the
 * screen behind it through ui.act, the same door a hub card uses, and
 * that screen's Back lands here again because this screen stays the one
 * shown. The floor plan and the walk are src/game/hangarroom.js's, the
 * drawing src/render/hangarroomview.js's, called from main.js's frame.
 *
 * Mixed into Ui as walkMethods. this.walk is null while the room is shut
 * and owned by this file while it is open.
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

import {
  ROOMS, LAYOUTS, tierFor, occupancy, stations, startPose, walk, stationNear,
} from '../game/hangarroom.js';
import { levelOf } from '../game/progress.js';
import { str } from '../strings/index.js';
import { customisable } from './builds.js';
import { hubWays } from './ways.js';

/*
 * What each station opens, and its prompt's words. A station whose screen
 * does not exist yet has no action here and gives no prompt (the shop,
 * the trophy wall and the TV until their lanes land); the bench and the
 * shelf need an aircraft that can be customised.
 */
const STATIONS = {
  stand: { action: () => 'hangar-aircraft', label: 'walk.stand' },
  bench: { action: (ui) => (customisable(ui.settings.airframe) ? 'customise' : null), label: 'walk.bench' },
  shelf: { action: (ui) => (customisable(ui.settings.airframe) ? 'customise' : null), label: 'walk.shelf' },
  door: { action: (ui) => (ui.walk.tier === 'field' ? warWay(ui) : 'fly'), label: 'walk.door' },
};

/* The field hangar's door goes to the war: the first Operations card the
 * pilot could open from the hub, which needs a rooms server. None, no
 * door. */
function warWay(ui) {
  const rooms = ui.friendsItems().length > 0;
  const way = hubWays('ops').find((w) => rooms || !w.room);
  return way ? way.action : null;
}

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACKWARD = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const USE = new Set(['KeyE', 'Enter', 'Space']);
const LEAVE = new Set(['Escape', 'Backspace']);
/* A drag's turn of the camera, radians a pixel, and how fast it swings
 * back behind the pilot once they walk. */
const DRAG_TURN = 0.006;
const ORBIT_RETURN = 1.5;

/* The station the pilot can use now, with its action, or null. */
function usable(ui) {
  const w = ui.walk;
  const s = stationNear(w.stations, w.pose);
  const def = s && STATIONS[s.id];
  const action = def && def.action(ui);
  const label = s && s.id === 'door' && ui.walk.tier === 'field' ? 'walk.door_war' : def && def.label;
  return action ? { id: s.id, action, label: str(label) } : null;
}

function renderPrompt(ui) {
  const near = usable(ui);
  const key = near ? `${near.id}:${near.label}` : '';
  if (key === ui.walk.promptKey) {
    return;
  }
  ui.walk.promptKey = key;
  if (ui.walkPrompt) {
    ui.walkPrompt.hidden = !near;
    ui.walkPrompt.dataset.station = near ? near.id : '';
    ui.walkPromptLabel.textContent = near ? near.label : '';
  }
}

export const walkMethods = {
  /* Into a room, at the door: the main hangar, as big as the pilot's
   * level has opened (docs/HANGAR-ROOM.md), or the war's field hangar.
   * Back returns to the hub it came from. */
  openWalk(which = 'main') {
    const p = this.progress && this.progress.state;
    const tier = which === 'field' ? 'field' : tierFor(levelOf(p ? p.xp : 0), Boolean(p && p.unlockAll));
    const room = ROOMS[tier];
    const layout = LAYOUTS[tier];
    this.walk = {
      tier,
      hub: tier === 'field' ? 'ops' : 'hangar',
      layout,
      room,
      occ: occupancy(room, layout),
      stations: stations(room, layout),
      pose: { ...startPose(room), moving: false },
      orbit: 0,
      held: new Set(),
      pad: null,
      promptKey: null,
    };
    this.show('walk');
    renderPrompt(this);
  },

  closeWalk() {
    this.walk = null;
  },

  /* A key press on the walk screen: use, leave; the walking keys are read
   * held, by walkHeld. */
  walkKey(code) {
    if (USE.has(code)) {
      this.useStation();
    } else if (LEAVE.has(code)) {
      this.back();
    }
    return true;
  },

  /* The window's key events while the room is open: which walking keys are
   * down. */
  walkHeld(code, down) {
    if (!this.walk) {
      return;
    }
    if (down) {
      this.walk.held.add(code);
    } else {
      this.walk.held.delete(code);
    }
  },

  walkDrag(dx) {
    if (this.walk) {
      this.walk.orbit -= dx * DRAG_TURN;
    }
  },

  useStation() {
    const near = this.walk && usable(this);
    if (!near) {
      return false;
    }
    this.onUiSound?.('select');
    this.act(near.action);
    return true;
  },

  /*
   * One frame of the walk, from main.js: the held keys and the pad's held
   * directions to a step, the camera's drag eased back behind the pilot
   * as they walk, the prompt. Nothing moves while an overlay (the picker,
   * the hangar) is over the room. Returns the pose to draw.
   */
  walkFrame(dt) {
    const w = this.walk;
    if (!w) {
      return null;
    }
    const overlay = this.carousel.isOpen || this.hangar.isOpen;
    const has = (set) => [...w.held].some((c) => set.has(c));
    const pad = w.pad || {};
    const input = overlay ? { forward: 0, turn: 0 } : {
      forward: (has(FORWARD) || pad.up ? 1 : 0) - (has(BACKWARD) || pad.down ? 1 : 0),
      turn: (has(RIGHT) || pad.right ? 1 : 0) - (has(LEFT) || pad.left ? 1 : 0),
    };
    w.pose = walk(w.room, w.occ, w.pose, input, Math.min(dt, 0.05));
    if (w.pose.moving) {
      w.orbit -= w.orbit * Math.min(1, ORBIT_RETURN * dt);
    }
    renderPrompt(this);
    return w.pose;
  },
};
