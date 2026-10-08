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
import { airframeById } from '../../configs/airframes.js';
import { flightTotals } from '../share/flighttime.js';
import { flightTimeText, sizeText, weightText } from './carousel.js';
import { listClips } from '../replay/store.js';
import { fetchHangar } from '../share/account.js';
import { hubWays } from './ways.js';

/*
 * What each station opens, and its prompt's words. A station whose screen
 * does not exist yet has no action here and gives no prompt; the bench, the shelf and the
 * shop need an aircraft that can be customised, as the hangar does.
 */
const STATIONS = {
  stand: { action: () => 'hangar-aircraft', label: 'walk.stand' },
  bench: { action: (ui) => (customisable(ui.settings.airframe) ? 'customise' : null), label: 'walk.bench' },
  shelf: { action: (ui) => (customisable(ui.settings.airframe) ? 'customise' : null), label: 'walk.shelf' },
  trophies: { action: (ui) => (customisable(ui.settings.airframe) ? 'hangar-trophies' : null), label: 'walk.trophies' },
  /* The TV plays My clips (src/replay/store.js), when there are any. */
  tv: { action: (ui) => (ui.walk.clips > 0 ? 'hangar-tv' : null), label: 'walk.tv' },
  shop: { action: (ui) => (customisable(ui.settings.airframe) ? 'hangar-shop' : null), label: 'walk.shop' },
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
const PHOTO = 'KeyP';
/* Photo mode's zoom: how far a wheel notch moves it, and its range. */
const ZOOM_STEP = 0.0012;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.2;
const LEAVE = new Set(['Escape', 'Backspace']);
/* The lineup before launch: how long the camera holds on the aircraft
 * before the flight starts, s. */
export const LINEUP_S = 2.6;

/* A drag's turn of the camera, radians a pixel, and how fast it swings
 * back behind the pilot once they walk. */
const DRAG_TURN = 0.006;
const ORBIT_RETURN = 1.5;

/* The station the pilot can use now, with its action, or null. */
function usable(ui) {
  const w = ui.walk;
  const s = stationNear(w.stations, w.pose);
  if (w.roomLineup) {
    return null;
  }
  /* Visiting, nothing is used but the door, which goes home. */
  if (w.visit) {
    return s && s.id === 'door' ? { id: 'door', action: 'hangar-walk', label: str('walk.home') } : null;
  }
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
  openWalk(which = 'main', visit = null) {
    const p = this.progress && this.progress.state;
    let tier = which === 'field' ? 'field' : tierFor(levelOf(p ? p.xp : 0), Boolean(p && p.unlockAll));
    if (visit) {
      tier = ROOMS[visit.tier] && visit.tier !== 'field' ? visit.tier : 'garage';
    }
    /* An open hangar shows the aircraft seated when its pilot last walked
     * in (src/share/hangarvisit.js): kept up to date here. */
    const open = this.settings.hangarVisit;
    if (!visit && which === 'main' && open && open.on && open.airframe !== this.settings.airframe) {
      this.settings.hangarVisit = { on: true, airframe: this.settings.airframe };
      this.writeSettings();
    }
    const room = ROOMS[tier];
    const layout = LAYOUTS[tier];
    this.walk = {
      tier,
      hub: tier === 'field' ? 'ops' : 'hangar',
      /* Another pilot's hangar, read only: the server's visit, or null. */
      visit,
      /* The room's lineup: [{ name, airframe, look, parts, own }], or null. */
      roomLineup: null,
      layout,
      room,
      occ: occupancy(room, layout),
      stations: stations(room, layout),
      pose: { ...startPose(room), moving: false },
      orbit: 0,
      held: new Set(),
      pad: null,
      promptKey: null,
      clips: 0,
      /* Photo mode: null, or { yaw, zoom, shoot } while it is on. */
      photo: null,
      /* The lineup before launch: null, or { action, t } while it runs. */
      lineup: null,
    };
    /* How many clips the TV has to play; read once a visit. */
    const w = this.walk;
    listClips().then((rows) => { w.clips = rows.length; w.promptKey = null; }, () => { w.clips = 0; });
    this.show('walk');
    renderPrompt(this);
  },

  closeWalk() {
    this.walk = null;
  },

  /* A key press on the walk screen: use, leave; the walking keys are read
   * held, by walkHeld. */
  walkKey(code) {
    if (this.walk && this.walk.lineup) {
      if (USE.has(code)) {
        this.endLineup(true);
      } else if (code === 'Escape' || code === 'Backspace') {
        this.endLineup(false);
      }
      return true;
    }
    if (code === PHOTO) {
      this.togglePhoto();
    } else if (this.walk && this.walk.photo) {
      if (code === 'Space' || code === 'Enter') {
        this.takePhoto();
      } else if (code === 'KeyT') {
        this.takeTurntable();
      } else if (code === 'Escape' || code === 'Backspace') {
        this.togglePhoto();
      }
    } else if (USE.has(code)) {
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
    if (this.walk && this.walk.photo) {
      if (!this.walk.photo.turntable) {
        this.walk.photo.yaw -= dx * DRAG_TURN;
      }
    } else if (this.walk) {
      this.walk.orbit -= dx * DRAG_TURN;
    }
  },

  walkWheel(dy) {
    const p = this.walk && this.walk.photo;
    if (p && !p.turntable) {
      p.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, p.zoom * (1 + dy * ZOOM_STEP)));
    }
  },

  /* Photo mode on or off: the pilot steps out of the picture, the prompt
   * and the walk stop, and the command bar says the photo keys. */
  togglePhoto() {
    const w = this.walk;
    /* A turntable recording is seen through to its end; a visit takes no
     * pictures of another pilot's hangar, nor the lineup. */
    if (!w || w.visit || w.roomLineup || (w.photo && w.photo.turntable)) {
      return;
    }
    w.photo = w.photo ? null : { yaw: w.pose.heading + Math.PI, zoom: 1, shoot: false };
    this.walkPrompt.hidden = true;
    w.promptKey = null;
    this.screens.walk.classList.toggle('is-photo', Boolean(w.photo));
    this.syncFrame();
  },

  /* The turntable: main.js turns the camera once round the stand over
   * TURNTABLE_S while it records the canvas, then downloads the movie. */
  takeTurntable() {
    const p = this.walk && this.walk.photo;
    if (p && !p.turntable) {
      p.turntable = { want: true };
      this.onUiSound?.('select');
    }
  },

  /*
   * THE ROOM'S LINEUP: every pilot in the room the pilot is in, their
   * aircraft side by side in their own paint in the airfield hangar, and
   * their names in the card in the same order. main.js says who
   * (roomLineupList); Back is the room screen again.
   */
  openRoomLineup() {
    const list = this.roomLineupList ? this.roomLineupList() : [];
    if (!list.length) {
      return;
    }
    this.openWalk('main');
    const w = this.walk;
    w.tier = 'airfield';
    w.room = ROOMS.airfield;
    w.layout = LAYOUTS.airfield;
    w.occ = occupancy(w.room, w.layout);
    w.stations = [];
    w.hub = null;
    w.roomLineup = list;
    this.walkPrompt.hidden = true;
    this.walkLineupName.textContent = str('walk.lineup_room');
    this.walkLineupFacts.textContent = list.map((e) => `${e.name}: ${airframeById(e.airframe).name}`).join('  ·  ');
    this.walkLineup.hidden = false;
    this.syncFrame();
  },

  /* Let other pilots walk round this hangar, or stop; the switch is a
   * synced section the server reads (docs/HANGAR-VISITS.md). */
  toggleVisits() {
    const on = !(this.settings.hangarVisit && this.settings.hangarVisit.on);
    this.settings.hangarVisit = { on, airframe: this.settings.airframe };
    this.writeSettings();
    this.onSyncNow?.();
    this.walkFlash(str(on ? 'walk.visits_opened' : 'walk.visits_closed'));
    this.syncFrame();
  },

  /* Another pilot's hangar: their callsign asked for, the server asked,
   * and the room opened read only, or why not. */
  async visitHangar() {
    const got = await this.askForm({
      title: str('walk.visit_title'),
      detail: str('walk.visit_detail'),
      confirmLabel: str('walk.visit_go'),
      fields: [{ key: 'callsign', label: str('walk.visit_callsign'), maxLength: 24 }],
    });
    if (!got || !got.callsign) {
      return;
    }
    let visit = null;
    try {
      visit = await fetchHangar(got.callsign.trim());
    } catch (err) {
      this.walkFlash(str('walk.visit_failed', { why: err.message }));
      return;
    }
    if (!visit || !visit.airframe) {
      this.walkFlash(str('walk.visit_none', { callsign: got.callsign.trim() }));
      return;
    }
    this.openWalk('main', visit);
  },

  /* A line in the prompt's place for a moment: a photo kept, or why not. */
  walkFlash(text) {
    if (!this.walkPrompt) {
      return;
    }
    this.walkPrompt.hidden = false;
    this.walkPrompt.dataset.station = 'flash';
    this.walkPromptLabel.textContent = text;
    clearTimeout(this.walkFlashTimer);
    this.walkFlashTimer = setTimeout(() => {
      if (this.walk) {
        this.walk.promptKey = null;
        this.walkPrompt.hidden = true;
      }
    }, 1600);
  },

  /* main.js takes the picture on the next frame it draws, keeps it for the
   * photo wall and downloads it. */
  takePhoto() {
    if (this.walk && this.walk.photo) {
      this.walk.photo.shoot = true;
      this.onUiSound?.('select');
    }
  },

  useStation() {
    const near = this.walk && usable(this);
    if (!near) {
      return false;
    }
    this.onUiSound?.('select');
    if (near.id === 'door' && !this.walk.visit) {
      this.startLineup(near.action);
    } else {
      this.act(near.action);
    }
    return true;
  },

  /*
   * THE LINEUP BEFORE LAUNCH (docs/SHOW-IT-OFF.md part 3): the door does
   * not fly at once. The camera sweeps the aircraft on its stand with its
   * card (name, size, weight, time flown on it) for LINEUP_S, then the
   * door's action runs; E or Enter goes now, Escape stays in the room.
   */
  startLineup(action) {
    const id = this.settings.airframe;
    const flown = flightTotals(this.settings.flightTime).byAirframe[id] || 0;
    this.walk.lineup = { action, t: 0 };
    this.walkPrompt.hidden = true;
    this.walkLineupName.textContent = airframeById(id).name;
    this.walkLineupFacts.textContent = [sizeText(id), weightText(id), str('walk.lineup_flown', { time: flightTimeText(flown) })].join('  ·  ');
    this.walkLineup.hidden = false;
  },

  endLineup(go) {
    const w = this.walk;
    const l = w && w.lineup;
    if (!l) {
      return;
    }
    w.lineup = null;
    w.promptKey = null;
    this.walkLineup.hidden = true;
    if (go) {
      this.act(l.action);
    }
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
    if (w.lineup) {
      w.lineup.t += dt;
      if (w.lineup.t >= LINEUP_S) {
        this.endLineup(true);
        return w.pose;
      }
    }
    const input = overlay || w.photo || w.lineup || w.roomLineup ? { forward: 0, turn: 0 } : {
      forward: (has(FORWARD) || pad.up ? 1 : 0) - (has(BACKWARD) || pad.down ? 1 : 0),
      turn: (has(RIGHT) || pad.right ? 1 : 0) - (has(LEFT) || pad.left ? 1 : 0),
    };
    w.pose = walk(w.room, w.occ, w.pose, input, Math.min(dt, 0.05));
    if (w.pose.moving) {
      w.orbit -= w.orbit * Math.min(1, ORBIT_RETURN * dt);
    }
    if (!w.photo && !w.lineup && !w.roomLineup) {
      renderPrompt(this);
    }
    return w.pose;
  },
};
