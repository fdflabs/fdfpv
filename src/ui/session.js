/*
 * The Ui's session side: what the shell pushes in between runs and what
 * floats over the world rather than living on a screen.
 *
 * The shell is the side that knows what can be chased, who is in the room
 * and what the bed is playing, so it pushes rows and views in here
 * (setGhostRow, setLiveRow, setWarLobby, setRoomBar, setMusicNow,
 * setWarState) and the menus read them back as rows (ghostItems,
 * liveItems, friendsItems, roomSeatRows). The chips, the bars and the
 * music dock are redrawn from one place, syncChips, because they share
 * the corner of the screen and which of them is up decides where the
 * others sit. The tutorial column and the handful of predicates the shell
 * asks every frame (flying, isModal, onGate) live here too.
 *
 * Installed on Ui.prototype by ui.js; every method runs with `this` as
 * the Ui. The imports from ui.js are a cycle, so they are read only
 * inside methods, never at this module's top level.
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

import { MAPS, mapById } from '../maps/registry.js';
import { MENU_TRACKS } from '../render/tracks.js';
import { planesFor } from '../game/verify.js';
import { TRACK_SYNC_EVENT } from '../share/cloud.js';
import { airframeById, DEFAULT_AIRFRAME } from '../../configs/airframes.js';
import { normaliseStickMode, stickCaption } from '../input/stickmode.js';
import { accountsAvailable, mayPlay } from '../share/account.js';
import { readAccount } from '../share/pilot.js';
import { activeCourseSummary } from '../share/summary.js';
import { str } from '../strings/index.js';
import { DEFAULTS, saveSettings, seatAirframe } from './settings.js';
import { choice } from './rows.js';
import { el, keyHowtoRows, placeSticks, thrNote } from './widgets.js';
import { SCREEN_TITLES, Ui, craftItem, seatedFreestyleMap } from './ui.js';

/* Both pickers lay their choices out as cards above the rows. The title
 * is not here because it is a card screen only on the gate: Ui.cardScreen
 * is the predicate that knows both. */
export function isCardScreen(screen) {
  return screen === 'courses' || screen === 'freestyle';
}

/* Redraw the menu if the pilot is looking at one of these screens. */
function redrawOn(ui, screens) {
  if (screens.includes(ui.screen)) {
    ui.renderMenu();
  }
}

/* A row the shell pushed as { value, note, cycle }: the arrows cycle it
 * through the shell's own choices. The row may be withdrawn between the
 * menu's build and the press, so the press reads the field again. */
function pushedRow(ui, field, label) {
  const row = ui[field];
  if (!row) {
    return [];
  }
  return [{
    label,
    value: row.value,
    note: row.note,
    adjust: (dir) => {
      if (ui[field]) {
        ui[field].cycle(dir);
      }
    },
  }];
}

/* mm:ss for the lobby's deadline. */
function clockFace(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function lobbyStatus(v) {
  if (v.countdown != null) {
    return str('lobby.starting', { n: v.countdown });
  }
  if (v.deadline != null) {
    return str('lobby.deadline', { t: clockFace(v.deadline) });
  }
  return str('lobby.waiting');
}

/* Operations' briefing (src/ui/briefing.js) over the lobby: its line,
 * what to do first, and the facts as a definition list. The list is
 * always drawn, so a mission with no facts keeps the same shape. */
function lobbyBrief(brief) {
  const box = el('div', 'war-brief');
  if (brief.line) {
    box.append(el('p', 'war-brief-line', brief.line));
  }
  if (brief.objectives.length) {
    const first = el('div', 'war-brief-first');
    first.append(el('span', 'war-brief-label', str('brief.first')));
    first.append(...brief.objectives.map((o) => el('span', 'war-brief-objective', o)));
    box.append(first);
  }
  const facts = el('dl', 'war-brief-facts');
  for (const f of brief.facts) {
    facts.append(el('dt', 'war-brief-label', f.label), el('dd', 'war-brief-value', f.value));
  }
  box.append(facts);
  return box;
}

function lobbyPilot(p) {
  const flags = `${p.ready ? ' ready' : ''}${p.me ? ' me' : ''}`;
  const row = el('div', `war-lobby-pilot${flags}`);
  const who = el('div', 'war-lobby-who');
  who.append(el('span', 'war-lobby-name', p.name));
  if (p.host) {
    who.append(el('span', 'war-lobby-host', str('lobby.host')));
  }
  who.append(el('span', 'war-lobby-craft', p.aircraft));
  row.append(who, el('span', 'war-lobby-flag', str(p.ready ? 'lobby.flag_ready' : 'lobby.flag_waiting')));
  return row;
}

function drawLobby(box, v, status) {
  box.textContent = '';
  const head = el('div', 'war-lobby-head');
  head.append(el('div', 'war-lobby-title', str(v.brief ? 'brief.title' : 'lobby.title')), el('div', 'war-lobby-mission', v.mission));
  box.append(head);
  if (v.brief) {
    box.append(lobbyBrief(v.brief));
  }
  box.append(el('div', `war-lobby-status${v.countdown != null ? ' go' : ''}`, status));
  if (v.last) {
    box.append(el('div', 'war-lobby-last', str(`lobby.last_${v.last.state}`, { stars: v.last.stars ?? 0, kills: v.last.kills })));
  }
  const pilots = el('div', 'war-lobby-pilots');
  pilots.append(...v.pilots.map(lobbyPilot));
  box.append(pilots);
}

/* The world row on the room screen: a choice before there is a room and
 * a fact inside one, because a room is made in one world and flies there
 * (src/main.js seats it on welcome). The choice writes the two fields
 * seatMap writes and nothing else: the pilot stays on this screen, and
 * pick() and adjust() save and hand the shell the settings after it. */
function worldRow(s, inRoom) {
  const world = seatedFreestyleMap(s);
  if (inRoom) {
    return { label: str('ui.the_world'), value: world ? world.name : '', note: str('friends.world_fixed'), info: true };
  }
  const worlds = MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id);
  const seat = (id) => {
    s.freestyleMap = id;
    s.map = id;
  };
  return {
    ...choice(str('ui.the_world'), str('friends.world_note'), worlds, world ? world.id : worlds[0], (id) => mapById(id).name, seat),
    pickOnly: true,
  };
}

/* The tutorial's rows per source, each a [term, what it does]. Every
 * source ends on Turtle, because inverted on the ground is where a first
 * flight ends whichever device flew it. */
const HOWTO_ROWS = {
  touch: (mode) => [
    [str('ui.left_thumb'), `${stickCaption(mode, 'left')}.${thrNote(mode, 'left')}`],
    [str('ui.right_thumb'), `${stickCaption(mode, 'right')}.${thrNote(mode, 'right')}`],
    [str('ui.the_whole_corner'), str('ui.the_pad_is_bigger_than_the')],
    ['Landscape', str('ui.turn_the_phone_sideways_the_pads')],
    ['Turtle', str('ui.if_you_end_up_inverted_on')],
    ['Pause', str('ui.the_pause_chip_top_right_hits')],
  ],
  radio: (mode) => [
    [str('ui.left_stick_mode', { normaliseStickMode: normaliseStickMode(mode) }), str('ui.set_the_mode_on_the_radio', { stickCaption: stickCaption(mode, 'left') })],
    [str('ui.right_stick'), `${stickCaption(mode, 'right')}.`],
    [str('ui.before_you_fly'), str('ui.put_the_radio_in_joystick_mode')],
    [str('ui.in_the_menus'), str('ui.pitch_moves_the_cursor_roll_right')],
    ['Acro', str('ui.hands_off_holds_the_attitude_you')],
    ['Turtle', str('ui.if_you_end_up_inverted_on_2')],
  ],
  mouse: () => [
    [str('ui.mouse'), str('ui.howto_mouse_move')],
    [str('ui.howto_mouse_wheel_key'), str('ui.howto_mouse_wheel')],
    [str('ui.howto_mouse_buttons_key'), str('ui.howto_mouse_buttons')],
    [str('ui.howto_mouse_centre_key'), str('ui.howto_mouse_centre')],
    [str('ui.howto_mouse_keys_key'), str('ui.howto_mouse_keys')],
    ['Esc', str('ui.howto_mouse_escape')],
    [str('ui.howto_mouse_on_key'), str('ui.howto_mouse_on', { pilot: SCREEN_TITLES.pilot })],
  ],
  launch: () => [
    [str('ui.what_it_is'), str('ui.betaflight_race_start_pitch_the_quad')],
    [str('ui.turn_it_on'), str('ui.quad_launch_control_on_it_stays')],
    [str('ui.set_the_angle'), str('ui.throttle_at_idle_pitch_forward_until')],
    ['Go', str('ui.punch_throttle_past_about_20_percent')],
    ['Keyboard', str('ui.up_arrow_is_pitch_forward_w')],
    ['Radio', str('ui.same_sequence_as_a_real_board')],
    ['Turtle', str('ui.if_you_tip_over_on_the')],
  ],
  keyboard: (mode) => [
    ...keyHowtoRows(mode),
    ['L', str('ui.launch_control_if_you_turned_it')],
    [str('ui.r_then_escape'), str('ui.back_to_the_start_line_and')],
    ['Turtle', str('ui.if_you_end_up_inverted_on_3')],
    ['F8', str('ui.report_a_bug_or_give_feedback')],
  ],
};

/* The line under the gimbals and the line about the flight mode. */
const HOWTO_LIVE = {
  touch: 'ui.the_pads_appear_in_flight_under',
  radio: 'ui.move_your_sticks_these_follow_the',
  launch: 'ui.l_arms_it_pitch_centre_punch',
  mouse: 'ui.howto_mouse_live',
  keyboard: 'ui.press_the_keys_these_follow_your',
};
const HOWTO_MODE = {
  touch: 'ui.thumb_sticks_are_a_real_proportional',
  radio: 'ui.a_radio_flies_acro_by_default',
  launch: 'ui.off_by_default_because_a_punch',
  mouse: 'ui.howto_mouse_mode',
  keyboard: 'ui.keys_are_on_or_off_so',
};

/*
 * The bars' buttons are the menu's last stops (barStops), so a bar that
 * goes takes a stop with it, and a cursor that sat on it would point past
 * the end of the list, where Enter does nothing. It goes back to the last
 * stop. Only when the number of stops changed: the room bar arrives four
 * times a second, and items() is a whole menu rebuilt.
 */
function repairCursorForBars(ui) {
  const stops = ui.barStops().length;
  if (stops === ui.barStopCount) {
    return;
  }
  ui.barStopCount = stops;
  const items = ui.items();
  if (ui.cursor < items.length) {
    ui.markBars(items);
    return;
  }
  let at = items.length - 1;
  while (at > 0 && !ui.isStop(items[at])) {
    at -= 1;
  }
  ui.cursor = Math.max(0, at);
  ui.syncCursor(false);
}

const dialogUp = (ui) => Boolean(ui.nameDialog) && !ui.nameDialog.hidden;

export const sessionMethods = {
  /* The published course this run is flying, or null. A new course has
   * no posted time yet. */
  setShare(share) {
    this.share = share || null;
    this.timePosted = null;
    redrawOn(this, ['title', 'courses', 'results']);
  },

  /* The Ghost row's contents from the shell, null to hide it. */
  setGhostRow(row) {
    this.ghostRow = row || null;
    redrawOn(this, ['title', 'paused']);
  },

  /* The Live row beside it, pushed the same way; null when the track has
   * no room. */
  setLiveRow(row) {
    this.liveRow = row || null;
    redrawOn(this, ['title', 'paused']);
  },

  liveItems() {
    return pushedRow(this, 'liveRow', str('ui.live'));
  },

  ghostItems() {
    return pushedRow(this, 'ghostRow', str('ui.ghost'));
  },

  /* The Fly with friends row, only where the shell has a rooms server to
   * offer (src/share/rooms.js roomsOrigin): a page with no server gets no
   * row rather than one that can only fail. */
  friendsItems() {
    const row = this.friendsRow ? this.friendsRow() : null;
    if (!row) {
      return [];
    }
    return [{ label: str('friends.title'), value: row.value, note: row.note, action: 'friends' }];
  },

  /*
   * The war's lobby over the room screen's rows: the mission, when it
   * starts, and the pilots, ready or not. `v` is src/main.js
   * warLobbyView(), or null for no lobby. The shell calls this every few
   * frames, so the box is only rebuilt when what it says changes, and the
   * lobby going up or down redraws the menu beneath it.
   */
  setWarLobby(v) {
    const on = Boolean(v);
    if (on !== Boolean(this.warLobbyOn)) {
      this.warLobbyOn = on;
      this.warLobbyEl.hidden = !on;
      this.screens.friends.classList.toggle('war-lobby-on', on);
      this.warLobbyKey = null;
      if (this.screen === 'friends') {
        this.renderMenu();
        if (on) {
          this.setCursor(this.firstStop(this.items()));
        }
      }
    }
    if (!on) {
      return;
    }
    const status = lobbyStatus(v);
    const key = JSON.stringify([v.mission, status, v.pilots, v.last, v.brief]);
    if (key === this.warLobbyKey) {
      return;
    }
    this.warLobbyKey = key;
    drawLobby(this.warLobbyEl, v, status);
  },

  /* The aircraft and the world, on the room screen between runs. In a war
   * room the aircraft row names what the war will seat (the shell's
   * craftShown): seating waits for the briefing, and until then
   * settings.airframe is the last flown. */
  roomSeatRows(inRoom) {
    const s = this.settings;
    const shown = this.craftShown ? this.craftShown(s) : s.airframe;
    return [
      { ...craftItem(s, null, shown), open: () => this.openCraftRow(false) },
      worldRow(s, inRoom),
    ];
  },

  /* The shell's room changed: redraw a screen that shows it. */
  refreshFriends() {
    const row = this.friendsRow ? this.friendsRow() : null;
    const inRoom = Boolean(row && row.inRoom);
    const entered = inRoom && !this.friendsInRoom;
    this.friendsInRoom = inRoom;
    /* In a room the lede, about making and joining one, gives its height
     * to the rows: .screen-friends.in-room in index.html. */
    if (this.screens && this.screens.friends) {
      this.screens.friends.classList.toggle('in-room', inRoom);
    }
    redrawOn(this, ['title', 'paused', 'friends', 'rooms', 'roomnew']);
    /* Make a room and Join are gone the moment the room opens, so the
     * cursor and its memory go to the screen's primary between runs, Fly:
     * card, Make a room, Fly is three presses of Enter. */
    if (entered) {
      delete this.cursorMemory.friends;
      if (this.screen === 'friends') {
        this.setCursor(this.restoreCursor());
      }
    }
  },

  markTimePosted(posted) {
    this.timePosted = posted || { ok: true };
    redrawOn(this, ['title', 'results']);
  },

  /* { text, button, act, reload } or null: the room's word to a pilot off
   * the sticks. Set every few frames, written only when it changed. */
  setRoomBar(view) {
    const key = view ? `${view.text}\u0000${view.button || ''}` : '';
    this.roomBarView = view;
    if (key !== this.roomBarKey) {
      this.roomBarKey = key;
      const button = view && view.button ? view.button : '';
      Ui.text(this.roomBarText, view ? view.text : '');
      Ui.text(this.roomBarButton, button);
      this.roomBarButton.hidden = !button;
    }
    this.syncChips();
  },

  /*
   * The chips over the world, the bars in the command bar and the dock
   * under them, from one place because they share two slots in the
   * corner. Report bug is on every screen but the title, where the corner
   * over the three cards is a first impression. The sign in chip, or the
   * panel in its place, is the bug chip's mirror: the title and every
   * menu, never a flight, only where there are accounts. Pause and swap
   * are flight only. Nothing shows under an open dialog.
   *
   * `bug-chip` is the class all of them wear; the stylesheet says what
   * renaming it would cost.
   */
  syncChips() {
    const dialog = dialogUp(this);
    const flight = this.screen === 'flight';
    const bug = Boolean(this.bugChip) && !dialog && this.screen !== 'title';
    if (this.bugChip) {
      this.bugChip.hidden = !bug;
      this.bugChip.classList.toggle('on-flight', flight);
    }
    if (this.pauseChip) {
      this.pauseChip.hidden = dialog || !flight;
      this.pauseChip.classList.toggle('on-flight', flight);
    }
    if (this.swapChip) {
      this.swapChip.hidden = dialog || !flight || !this.onHotSwap;
    }
    const corner = Boolean(this.signinChip) && accountsAvailable() && !dialog && !flight;
    const pilot = corner && mayPlay();
    if (this.signinChip) {
      this.signinChip.hidden = !pilot;
      /* The first slot is the bug chip's wherever it is up. */
      this.signinChip.classList.toggle('first-slot', pilot && !bug);
      const callsign = pilot ? readAccount().callsign : '';
      Ui.text(this.signinChip, callsign);
      this.signinChip.dataset.initial = callsign ? [...callsign][0].toUpperCase() : '';
      this.signinChip.title = str('account.callsign_note');
    }
    if (this.signinPanel) {
      this.signinPanel.hidden = !corner || pilot;
      this.signinPanel.classList.toggle('first-slot', corner && !pilot && !bug);
    }
    const roomBar = Boolean(this.roomBarView) && !dialog && !flight;
    if (this.roomBar) {
      this.roomBar.hidden = !roomBar;
    }
    /* A room bar asking for the reload has already said it. */
    if (this.updateBar) {
      this.updateBar.hidden = dialog || !this.updateReady || flight || (roomBar && this.roomBarView.reload);
    }
    repairCursorForBars(this);
    /* The dock takes the corner on the title and the second slot under
     * whichever chip has the first. A class rather than a top in pixels,
     * so the stacking stays in the stylesheet. */
    if (this.musicDock) {
      this.musicDock.classList.toggle('under-chip', Boolean(bug || corner));
    }
    this.syncMusicDock();
  },

  /* Is a flight up. Paused counts: the flight display, the lap clock and
   * the pack stay on screen behind the pause menu, and swapping the bed
   * out and back on every Escape mid race would be the loudest thing in
   * the mix. The dock and the music context both read this, so they
   * cannot disagree. */
  flying() {
    return this.screen === 'flight' || this.screen === 'paused';
  },

  skipMusic(dir) {
    if (typeof this.onMusicSkip === 'function') {
      this.onMusicSkip(dir);
    }
  },

  /*
   * Mute, and back to where it was. Zero already is the off state: the
   * Music stepper prints Off there, applyMix stops the bed there, the dock
   * dims there. So this writes that one number rather than a second flag
   * that could disagree with it. The level it restores is the one it
   * muted, kept for this visit only; a fresh visit gets the default,
   * because a settings key whose job is to remember a number the pilot
   * can see on the row it came from is not worth having. onSettings is
   * what stops the sound: applyMix reads the level off the settings.
   */
  toggleMusicMute() {
    const s = this.settings;
    if (s.musicLevel > 0) {
      this.musicLevelWas = s.musicLevel;
      s.musicLevel = 0;
    } else {
      s.musicLevel = this.musicLevelWas || DEFAULTS.musicLevel;
    }
    saveSettings(s);
    if (this.onSettings) {
      this.onSettings(s);
    }
    this.syncMusicDock();
    /* The Music row prints Off or a number, one screen away. */
    this.renderMenu();
    this.announce(str(s.musicLevel > 0 ? 'ui.music_on' : 'ui.music_muted'));
  },

  setMusicNow(st) {
    if (!st) {
      return;
    }
    this.musicNow = st;
    this.syncMusicDock();
  },

  /* The room's war state, from the shell each frame ('lobby' with none).
   * From the briefing until the room is back in its lobby the dock stays
   * down: the war's own music replaced the menu tracks it would name and
   * skip, and over the end banner it is clutter. #ui.war-on also keeps the
   * freestyle clock off the war. */
  setWarState(state) {
    if (this.warState === state) {
      return;
    }
    this.warState = state;
    this.root.classList.toggle('war-on', state !== 'lobby');
    this.syncMusicDock();
  },

  syncMusicDock() {
    if (!this.musicDock) {
      return;
    }
    const name = (this.musicNow && this.musicNow.name) || MENU_TRACKS[0]?.name || '';
    const atWar = this.warState != null && this.warState !== 'lobby';
    /* No record, nothing to name, skip or mute. The pickers that read
     * every key keep it down, and so does a page with the sound off. */
    this.musicDock.hidden = !name
      || dialogUp(this)
      || this.screen === 'calibrate'
      || this.screen === 'padpick'
      || atWar
      || !this.settings.sound;
    this.musicDock.classList.toggle('on-flight', this.flying());
    const muted = this.settings.musicLevel <= 0;
    this.musicDock.classList.toggle('is-muted', muted);
    this.musicTitle.textContent = name;
    /* The name, because it ellipsises, then what the click does. */
    this.musicTitle.title = str(muted ? 'ui.click_to_unmute' : 'ui.click_to_mute', { name });
  },

  /* The tutorial's one column and the two lines under it, for the source
   * on the tabs. Rebuilt rather than toggled: six lines of type and a
   * switch nobody flips twice. An unknown source draws the keyboard's
   * rows and lights no tab. */
  renderHowto() {
    if (!this.howtoKeys) {
      return;
    }
    const source = this.howtoSource;
    const known = source in HOWTO_ROWS ? source : 'keyboard';
    for (const [id, tab] of Object.entries(this.howtoTabs)) {
      tab.classList.toggle('on', id === source);
    }
    this.howtoKeys.textContent = '';
    for (const [term, what] of HOWTO_ROWS[known](this.settings.stickMode)) {
      this.howtoKeys.append(el('dt', null, term), el('dd', null, what));
    }
    this.howtoLive.textContent = str(HOWTO_LIVE[known]);
    this.howtoMode.textContent = str(HOWTO_MODE[known]);
  },

  /* Live channels for the tutorial's gimbals, from the shell's loop. */
  setHowtoSticks(ch) {
    if (!this.howtoStickLeft || this.screen !== 'howto') {
      return;
    }
    placeSticks(this.howtoStickLeft, this.howtoStickRight, ch, this.settings.stickMode);
  },

  /* Guarded, because syncAngleMode calls this from the frame loop on
   * every screen. */
  setCraftCaption(text) {
    Ui.text(this.craftCaption, text);
  },

  isModal() {
    return this.screen !== 'flight';
  },

  /* Seat an aircraft that may race the seated track, for Fly. */
  seatCraftForCourse() {
    if (this.settings.map !== 'track') {
      return null;
    }
    const seat = activeCourseSummary();
    return seat && seat.doc ? this.seatCraftForDoc(seat.doc) : null;
  },

  /*
   * If the seated aircraft may not race this track, seat one that may and
   * return it; null when nothing moved. Every quad may, and every fixed
   * wing that fits every gate (src/game/verify.js planesFor); a plane that
   * does not fit gives way to the racer, DEFAULT_AIRFRAME. The boot path
   * calls this with a track that arrived by link before anything reads a
   * seat, because the link filed it under the aircraft flying when it
   * arrived and the pilot has to land in the seat that holds it.
   */
  seatCraftForDoc(doc) {
    const have = airframeById(this.settings.airframe);
    if (!doc || !have.fixedWing || planesFor(doc).includes(have.id)) {
      return null;
    }
    const want = airframeById(DEFAULT_AIRFRAME);
    seatAirframe(this.settings, want.id);
    this.settings.airframeAsked = true;
    this.writeSettings();
    return want;
  },

  /* What the title's Escape hint names: the gate it lands on. The
   * destination rather than Back, see legendFor. */
  gateLabel() {
    return str('ui.what_to_fly');
  },

  /* The gate is up while either half of what to fly is unanswered. */
  onGate() {
    return this.screen === 'title' && (this.craftGate || !this.mode);
  },

  /* Every screen drawing some of its choices as cards. */
  cardScreen() {
    return isCardScreen(this.screen) || this.onGate();
  },
};

/*
 * The flight controller session's hooks into the shell's settings and
 * hooks. Flight mode and launch control are settings, so the bench reads
 * and writes them through the Ui and the menus redraw; the motor test is
 * refused while a run is live or the bench was opened from the pause
 * menu, because a motor spinning under a paused flight is a flight.
 */
export function wireFcSession(ui) {
  const { fc } = ui;
  fc.getFlightMode = () => (ui.settings.flightMode === 'angle' ? 'angle' : 'acro');
  fc.setFlightMode = (on) => {
    ui.settings.flightMode = on ? 'angle' : 'acro';
    saveSettings(ui.settings);
    ui.renderMenu();
    if (ui.onFcAngle) {
      ui.onFcAngle(Boolean(on));
    }
  };
  fc.getLaunchControl = () => Boolean(ui.settings.launchControl);
  fc.setLaunchControl = (on) => {
    ui.settings.launchControl = Boolean(on);
    saveSettings(ui.settings);
    ui.renderMenu();
    if (ui.onSettings) {
      ui.onSettings(ui.settings);
    }
  };
  fc.motorTestAllowed = () => !fc.runActive && ui.fcFrom !== 'paused';
  fc.onMotorTest = (motor, duty) => {
    if (ui.onFcMotor) {
      ui.onFcMotor(motor, duty);
    }
  };
}

/*
 * The page events the session answers for its whole life. A track going
 * online, or failing to, while My tracks is open redraws its card. Tab is
 * the swap key in flight and a key of the pickers', so there it must not
 * walk the browser's focus; everywhere else the rows and cards are tab
 * stops. A press outside an open drop-down closes it.
 */
export function watchSessionEvents(ui) {
  window.addEventListener(TRACK_SYNC_EVENT, () => {
    if (ui.screen === 'courses') {
      ui.loadLocalCourses();
      ui.renderCourseCards();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && (ui.screen === 'flight' || ui.carousel.isOpen || ui.hangar.isOpen)) {
      e.preventDefault();
    }
  }, true);
  /* The walkable hangar walks on keys held, not pressed. Up is read
   * everywhere, so a key let go over another screen is not held when the
   * room opens again. */
  window.addEventListener('keydown', (e) => {
    if (ui.screen === 'walk' && !ui.carousel.isOpen && !ui.hangar.isOpen) {
      ui.walkHeld(e.code, true);
    }
  });
  window.addEventListener('keyup', (e) => ui.walkHeld(e.code, false));
  window.addEventListener('blur', () => ui.walk && ui.walk.held.clear());
  ui.root.addEventListener('mousedown', (e) => {
    if (ui.dropEl && !ui.dropEl.contains(e.target) && !e.target.closest('.drop-btn')) {
      ui.closeDrop();
    }
  });
}
