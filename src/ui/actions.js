/*
 * The menu's verbs: what a pressed row, card or button does, and where
 * Escape goes. Installed on Ui.prototype by src/ui/ui.js.
 *
 *   act(action, picked, { keepWorld })   every action name, one table
 *   back()                               Escape and the Back row
 *   select()                             Enter on the row under the cursor
 *   hubCards, hangarCards, openHub       home and its three hubs
 *   continueWay                          home's Continue, the last session
 *   seatMap, flown, seatMatchesMode      the seat and the first flight
 *
 * The shell hears of a press through the on* hooks main.js installs
 * (onAction, onSettings, onUiSound and the rest); nothing here flies or
 * builds a world itself. scripts/actions-golden.js pins every branch.
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

import { KEYBIND_PREFIX, keybindAction } from './controls.js';
import { FLY_WITH_PREFIX, answerFlyWith } from './flywith.js';
import { MAPS } from '../maps/registry.js';
import { AIRFRAME_IDS, airframeById } from '../../configs/airframes.js';
import { clearPidsFor } from '../../configs/pids.js';
import { RATE_DEFAULTS, normaliseRates } from '../../configs/rates.js';
import { deleteRatePreset, presetMatching, saveRatePreset } from '../../configs/ratepresets.js';
import { needSignIn } from '../share/account.js';
import { resetProgress, resetSettings } from '../share/save.js';
import { released } from '../game/campaign.js';
import { MODES } from '../share/modes.js';
import { freshProgress } from '../game/progress.js';
import { str } from '../strings/index.js';
import { customisable } from './builds.js';
import { CAMPAIGN_MISSIONS, wayOfActivity } from './continuity.js';
import { downloadCli } from './fc.js';
import { fitsAsSegments } from './rows.js';
import { pickStickRef } from './stickref.js';
import { saveSettings, seatAirframe } from './settings.js';
import { HUBS, OPEN_ACTIONS, WAYS, craftSvg, hubOfAction, hubWays, reticleSvg } from './ways.js';
/* A cycle: ui.js installs this module. Read inside methods only. */
import { ROOM_PARENTS, seatedFreestyleMap } from './ui.js';
import { logError } from '../share/crashrecord.js';

/* ---- small shared steps ---- */

const sound = (ui, name) => { if (ui.onUiSound) ui.onUiSound(name); };

const tellShell = (ui) => { if (ui.onSettings) ui.onSettings(ui.settings); };

/* Where Back goes after this press: a run paused behind the menus is kept. */
const pauseOrTitle = (ui) => (ui.screen === 'paused' || ui.screen === 'quick' ? 'paused' : 'title');

/* The credits page pins itself in the hash; show() would map the title
 * back onto it, so the pin goes before the screen does. */
function dropHash() {
  const url = new URL(window.location.href);
  if (url.hash) {
    url.hash = '';
    history.replaceState(null, '', url);
  }
}

function dropFcPanel(ui) {
  ui.fc.confirm = null;
  ui.cursor = 0;
  ui.renderMenu();
}

/* The bench asks before a save that would restart a live run. */
function fcSave(ui, exit) {
  if (ui.fc.runActive) {
    ui.fc.confirm = 'save-run';
    ui.fc.exitAfterSave = exit;
    ui.cursor = 0;
    ui.renderMenu();
    return;
  }
  ui.fc.stopMotors();
  if (ui.onFcSave) ui.onFcSave(ui.fc.draft, { restart: false, ...(exit ? { exit: true } : {}), presetId: ui.fc.presetId });
}

function fcLeave(ui) {
  ui.fc.exitAfterSave = false;
  ui.fc.discard();
  ui.leaveFc();
}

/* ---- act(): the table ---- */

/* Screens a plain row opens. Opened from a room, Back returns to that
 * room; opened over a paused run, Back returns to the pause menu. */
const SCREEN_ROWS = ['howto', 'pilot', 'quad', 'credits', 'friends', 'controls'];

function openScreen(ui, screen) {
  ui.roomFrom = ROOM_PARENTS.has(ui.screen) && ui.screen !== screen ? ui.screen : null;
  ui.returnTo = pauseOrTitle(ui);
  ui.show(screen);
}

/* The title's rooms panel's way into the room screen: any aircraft, flown
 * free, in a room. The Fly with friends card was this until the
 * combat-only cut (2026-10-20); the panel keeps what pressing it did. */
const ROOMS_PANEL = { airframes: AIRFRAME_IDS, mode: 'freestyle', room: true };

/* The one gate question, answered by a card: aircraft, mode, and the seat
 * the mode flies in, or the room that can choose one. */
function answerGate(ui, way, picked, keepWorld) {
  const want = picked || (way.airframes.includes(ui.settings.airframe) ? ui.settings.airframe : way.airframes[0]);
  /* seatAirframe also resets the camera to the aircraft's stock tilt, so
   * an aircraft already seated is left alone or the pilot's tilt is lost
   * on every visit. */
  if (want !== ui.settings.airframe) seatAirframe(ui.settings, want);
  ui.settings.airframeAsked = true;
  ui.craftGate = false;
  ui.mode = way.mode;
  ui.roomGame = way.game ?? null;
  /* Every session's card passes here (src/main.js openSession acts it),
   * so this is the activity home's Continue reopens. A way the registry
   * has no card for (the rooms panel's friends, the war's own) leaves the
   * last one standing. A campaign's Play records its own
   * (src/ui/continuity.js). */
  const activity = MODES.find((m) => m.card.way === way.id);
  if (activity) ui.settings.lastActivity = activity.id;
  saveSettings(ui.settings);
  tellShell(ui);
  ui.returnTo = 'title';
  ui.roomFrom = null;
  const worlds = MAPS.filter((m) => m.mode === 'freestyle');
  const home = way.home && !keepWorld ? worlds.find((m) => m.id === way.home) : null;
  const seated = seatedFreestyleMap(ui.settings);
  const seatAgrees = home ? Boolean(seated) && seated.id === home.id : Boolean(seated);
  if (seatAgrees) {
    ui.setCursor(ui.titleStop());
    ui.renderMenu();
    if (way.room) ui.show('friends');
    return;
  }
  /* No world picker since free flight left (the combat-only cut,
   * 2026-10-20): the remembered world, else the first. */
  const remembered = worlds.find((m) => m.id === ui.settings.freestyleMap);
  const world = home || remembered || worlds[0];
  ui.setCursor(ui.titleStop());
  if (way.room) {
    /* The room screen is up before the seat changes, so the world swap
     * comes back to it rather than to the title. */
    ui.show('friends');
    ui.seatMap(world.id, { stay: true });
  } else {
    ui.seatMap(world.id);
  }
}

/* Exact action names. Each handler ends the press unless it returns
 * FALL_THROUGH, which hands the action on to the shell's onAction. */
const FALL_THROUGH = Symbol('fall through');

/* Reset settings or progress (src/share/save.js) after a confirm, then
 * reload, as the language row does: modules hold the live settings, so
 * the page starts again from what was stored. */
function askReset(ui, half, reset) {
  ui.askConfirm({
    title: str(`ui.reset_${half}_ask`),
    detail: str(`ui.reset_${half}_detail`),
    yes: str(`ui.reset_${half}`),
    no: str('ui.keep_it'),
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    try {
      reset();
    } catch (e) {
      ui.resetNotice = str('ui.reset_failed');
      ui.renderMenu();
      return;
    }
    window.location.reload();
  });
}

const ACTIONS = {
  'update-reload'() { window.location.reload(); },
  'room-bar'(ui) { if (ui.roomBarView && ui.roomBarView.act) ui.roomBarView.act(); },
  hotswap(ui) { ui.openSwap('paused'); },
  comparesticks(ui) { pickStickRef(ui.stickRef, () => ui.renderMenu()); },
  /* The pause menu's Flight panel. Escape into the pause menu leaves
   * returnTo where the run found it, so the panel names its way back. */
  quick(ui) {
    ui.returnTo = pauseOrTitle(ui);
    ui.show('quick');
  },
  'hangar-aircraft'(ui) { ui.openCraftRow(false); },
  'hangar-walk'(ui) { ui.openWalk('main'); },
  'field-walk'(ui) { ui.openWalk('field'); },
  'walk-photo'(ui) { ui.togglePhoto(); },
  'walk-photo-take'(ui) { ui.takePhoto(); },
  'walk-turntable'(ui) { ui.takeTurntable(); },
  'walk-visit'(ui) { ui.visitHangar(); },
  'walk-visits'(ui) { ui.toggleVisits(); },
  'room-lineup'(ui) { ui.openRoomLineup(); },
  /* The walkable hangar's shop counter: the hangar opened on its Shop tab
   * (src/ui/hangar-shop.js), for the seated aircraft. */
  /* The trophy wall: the hangar on its Challenges tab, which lists the
   * firsts the wall's trophies stand for (src/ui/progress-ui.js). */
  'hangar-trophies'(ui) {
    ui.openHangar(ui.settings.airframe, () => ui.renderMenu(), ui.wornBuild(ui.settings.airframe), 'challenges');
  },
  /* The war's shop (src/ui/campaign.js), its Upgrades, under the Hangar
   * as well as in Operations. */
  'campaign-shop'(ui) {
    if (ui.onCampaignShop) {
      ui.onCampaignShop();
    }
  },
  'hangar-shop'(ui) {
    ui.openHangar(ui.settings.airframe, () => ui.renderMenu(), ui.wornBuild(ui.settings.airframe), 'shop');
  },
  customise(ui) {
    /* The aircraft in the air may be a My Hangar build; a change in the
     * hangar is then a change to that build. */
    ui.openHangar(ui.settings.airframe, () => ui.renderMenu(), ui.wornBuild(ui.settings.airframe));
  },
  feel(ui) { ui.openFeelReport(); },
  rooms(ui) { ui.show('rooms'); },
  roomnew(ui) { ui.show('roomnew'); },
  fly(ui) {
    if (!ui.seatMatchesMode()) {
      /* Free flight has no world picker since it left (the combat-only
       * cut, 2026-10-20): a seat that is no world is put on the first.
       * Nothing else can miss its seat (seatMatchesMode). */
      ui.seatMap(MAPS.find((m) => m.mode === 'freestyle').id);
      return undefined;
    }
    return FALL_THROUGH;
  },
  rates(ui) {
    /* Reached from the Controller, Settings or Quad, Back returns there;
     * from the bench, returnTo is left to the pause chain it may be
     * carrying. */
    if (['pilot', 'quad', 'quick', 'controller'].includes(ui.screen)) {
      ui.ratesFrom = ui.screen;
    } else {
      ui.ratesFrom = null;
      if (ui.screen !== 'fc') ui.returnTo = pauseOrTitle(ui);
    }
    ui.show('rates');
  },
  /* A plane's rates, from the same rows: Back as the quad's Rates. */
  planerates(ui) {
    if (['pilot', 'quad', 'quick', 'controller'].includes(ui.screen)) {
      ui.ratesFrom = ui.screen;
    } else {
      ui.ratesFrom = null;
      ui.returnTo = pauseOrTitle(ui);
    }
    ui.show('planerates');
  },
  /* The Controller screen, from Settings (Back returns there) or the
   * Hangar's card. */
  controller(ui) {
    ui.controllerFrom = ui.screen === 'pilot' ? 'pilot' : null;
    if (!ui.controllerFrom) ui.returnTo = pauseOrTitle(ui);
    ui.show('controller');
  },
  'controller-builtin'(ui) {
    if (ui.onController) ui.onController({ builtIn: true });
  },
  pids(ui) {
    if (ui.screen === 'quad' || ui.screen === 'quick') {
      ui.pidsFrom = ui.screen;
    } else {
      ui.pidsFrom = null;
      ui.returnTo = pauseOrTitle(ui);
    }
    ui.show('pids');
  },
  fc(ui) {
    ui.fcFrom = ['paused', 'quad', 'pids'].includes(ui.screen) ? ui.screen : 'title';
    if (ui.onFcOpen) ui.onFcOpen('pid');
    ui.show('fc');
  },
  'fc-save'(ui) { if (ui.fc.dirty()) fcSave(ui, false); },
  'fc-save-exit'(ui) {
    if (ui.fc.dirty()) {
      fcSave(ui, true);
    } else {
      ui.leaveFc();
    }
  },
  'fc-save-restart'(ui) {
    ui.fc.exitAfterSave = false;
    ui.fc.confirm = null;
    ui.fc.stopMotors();
    if (ui.onFcSave) ui.onFcSave(ui.fc.draft, { restart: true, presetId: ui.fc.presetId });
  },
  'fc-wait'(ui) {
    ui.fc.exitAfterSave = false;
    dropFcPanel(ui);
  },
  'fc-motors-stop'(ui) {
    ui.fc.stopMotors();
    ui.renderMenu();
  },
  'fc-keep-editing'(ui) { dropFcPanel(ui); },
  'fc-discard-leave'(ui) {
    ui.fc.confirm = null;
    fcLeave(ui);
  },
  'fc-discard'(ui) {
    ui.fc.discard();
    ui.renderMenu();
  },
  'fc-export'(ui) { downloadCli('flight-controller.diff', ui.fc.exportText()); },
  'fc-back'(ui) { fcLeave(ui); },
  /* One tune's adjustment; the store is keyed so the others keep theirs. */
  'pids-default'(ui) {
    clearPidsFor(ui.settings.pids, ui.settings.tune);
    saveSettings(ui.settings);
    ui.renderMenu();
    tellShell(ui);
  },
  'rates-default'(ui) {
    /* A fresh copy: the rows edit this object in place, and the frozen
     * table must not be what they edit. */
    ui.settings.rates = normaliseRates(RATE_DEFAULTS);
    ui.settings.ratesSplitPitch = false;
    saveSettings(ui.settings);
    ui.renderMenu();
    tellShell(ui);
  },
  /* The name dialog is the save. Pre-filled with the matching preset's
   * name so a nudged preset lands on Replace. Only a refused write is
   * announced; the Preset row shows a landed one. */
  'rates-save'(ui) {
    const loaded = presetMatching(ui.settings.rates);
    ui.askRatePresetName(loaded ? loaded.name : '').then((name) => {
      if (!name) return;
      ui.ratesNotice = saveRatePreset(name, ui.settings.rates).ok ? null : str('ui.this_browser_would_not_store_that_2');
      ui.renderMenu();
    });
  },
  'rates-delete'(ui) {
    const loaded = presetMatching(ui.settings.rates);
    if (!loaded) return;
    ui.askConfirm({
      title: str('ui.delete', { name: loaded.name }),
      detail: str('ui.this_browser_is_the_only_copy'),
      yes: 'Delete',
      no: str('ui.keep_it'),
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      ui.ratesNotice = deleteRatePreset(loaded.id).ok ? null : str('ui.this_browser_would_not_change_stored');
      ui.renderMenu();
    });
  },
  resetsettings(ui) { askReset(ui, 'settings', () => resetSettings()); },
  resetprogress(ui) { askReset(ui, 'progress', () => resetProgress({ progress: freshProgress(false) })); },
  back(ui) { ui.back(); },
  /* Escape from the title, as a row: both halves of the gate cleared. A
   * lobby's card came from a hub, and the gate reopens on that hub. */
  'mode-gate'(ui) {
    ui.mode = null;
    ui.craftGate = true;
    const hub = ui.lobbyCard && hubOfAction(ui.lobbyCard);
    if (hub) ui.hub = hub;
    ui.show('title');
    ui.setCursor(ui.titleStop());
    ui.renderMenu();
  },
  title(ui) {
    ui.show('title');
    return FALL_THROUGH;
  },
  paused(ui) {
    ui.show('paused');
    return FALL_THROUGH;
  },
  /* However the pause menu opens (Escape, the tab hidden, the controller
   * lost), a lesson in flight is held and says so (TRAINING.md 10). */
  pause(ui) {
    if (ui.progress) ui.progress.lessonPaused();
    return FALL_THROUGH;
  },
  /* Continue on a campaign: its next mission's Play, the campaign's
   * consent and room as that Play's, asked again now rather than kept
   * from the render, so a result paid since is counted. */
  'continue-mission'(ui) {
    const last = ui.continueWay();
    if (!last) return;
    if (!last.mission) {
      ui.pickForWay(last.way.action);
      return;
    }
    ui.campaigns[ui.settings.lastActivity].playMission(last.mission.id);
  },
};
for (const screen of SCREEN_ROWS) {
  ACTIONS[screen] = (ui) => openScreen(ui, screen);
}

/* Action families named by prefix, with the rest of the name as the argument. */
const PREFIXES = [
  ['friends-', (ui, action) => { if (ui.onFriends) ui.onFriends(action); }],
  /* A pilot in the room the pilot is in, visited straight from the
   * walkable hangar's command bar (src/ui/hangarwalk.js). */
  ['walk-visit:', (ui, action, callsign) => ui.visitHangar(callsign)],
  /* The gate's rooms panel: the room screen first, then the room, the
   * lobby or Make a room, with the world left unbuilt because the room's
   * welcome seats its own. */
  ['lobby:', (ui, action, rest) => {
    answerGate(ui, ROOMS_PANEL, null, true);
    ui.act(rest);
  }],
  ['fc-preset:', (ui, action, id) => {
    ui.fc.applyPreset(id).then(() => ui.renderMenu()).catch((err) => logError('physics', err));
  }],
  ['map:', (ui, action, id) => ui.seatMap(id)],
  [KEYBIND_PREFIX, keybindAction],
  [FLY_WITH_PREFIX, answerFlyWith],
];

/* Without an account the menus are for looking at: anything behind a card
 * or a row waits for the sign in and runs then. */
const OPEN_PREFIX = /^(account|calibrate-|padpick-)/;
const needsAccount = (action) => typeof action === 'string' && !OPEN_ACTIONS.has(action) && !OPEN_PREFIX.test(action);

/* ---- back(): by screen ---- */

/* Screens with their own step back. True when the step was taken. */
const BACK_FROM = {
  /* A walkable hangar backs out to the cards of the hub it came from. */
  walk(ui) {
    if (ui.walk && ui.walk.roomLineup) {
      ui.show('friends');
      return true;
    }
    /* From a visit, Back is home. */
    if (ui.walk && ui.walk.visit) {
      ui.openWalk('main');
      return true;
    }
    ui.hub = ui.walk ? ui.walk.hub : 'hangar';
    ui.show('title');
    return true;
  },
  calibrate(ui) {
    ui.act('calibrate-cancel');
    return true;
  },
  /* Escape on the controller question is its Skip. */
  flywith(ui) {
    ui.act('flywith:skip');
    return true;
  },
  rooms(ui) {
    ui.show('friends');
    return true;
  },
  roomnew(ui) {
    ui.show('rooms');
    return true;
  },
  padpick(ui) {
    if (ui.padPickPhase === 'confirm') {
      ui.act('padpick-no');
    } else {
      ui.act(ui.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
    }
    return true;
  },
  results(ui) {
    ui.act('title');
    return true;
  },
  paused(ui) {
    ui.act('resume');
    return true;
  },
  /* The bench: the nearest thing Escape can undo is what it undoes.
   * Search, then a confirm panel, then the question whether to drop an
   * edited draft; only a clean draft leaves. */
  fc(ui) {
    if (ui.fc.search != null) {
      ui.fc.search = null;
      ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
      ui.renderMenu();
      return true;
    }
    if (ui.fc.confirm) {
      dropFcPanel(ui);
      return true;
    }
    if (ui.fc.dirty()) {
      ui.fc.confirm = 'leave';
      ui.cursor = 0;
      ui.renderMenu();
      /* Three rows replace a long list: scroll to the top or the
       * question is off screen. */
      if (ui.fcMenu) ui.fcMenu.scrollTop = 0;
      return true;
    }
    ui.act('fc-back');
    return true;
  },
  /* Rates and PIDs are pages: back to the room that opened them, by
   * show() so a paused run's returnTo survives. */
  rates(ui) { return backToOrigin(ui, 'ratesFrom'); },
  planerates(ui) { return backToOrigin(ui, 'ratesFrom'); },
  pids(ui) { return backToOrigin(ui, 'pidsFrom'); },
  controller(ui) { return backToOrigin(ui, 'controllerFrom'); },
  /* Keys and buttons is the Controller screen's. */
  controls(ui) {
    ui.show('controller');
    return true;
  },
};

function backToOrigin(ui, field) {
  const from = ui[field];
  if (!from) return false;
  ui[field] = null;
  ui.show(from);
  return true;
}

/* Escape on the title: a hub backs out to home with its card under the
 * cursor; the menu backs out to the gate; the gate is the root. */
function backOnTitle(ui) {
  if (!ui.onGate()) {
    ui.craftGate = true;
    ui.mode = null;
    sound(ui, 'back');
    ui.setCursor(ui.titleStop());
    ui.renderMenu();
    return;
  }
  if (!ui.hub) return;
  const card = `hub-${ui.hub}`;
  ui.hub = null;
  sound(ui, 'back');
  const at = ui.items().findIndex((it) => it.card === card);
  ui.setCursor(at >= 0 ? at : ui.firstStop(ui.items()));
  ui.renderMenu();
}

/* ---- select(): by row kind, first match wins ---- */

const ROW_KINDS = [
  /* A heading, a note, a cursor put somewhere it cannot act. */
  [(ui, it) => !ui.isStop(it) || it.info, () => {}],
  [(ui, it) => it.disabled, (ui) => sound(ui, 'back')],
  /* A typed row opens for typing. */
  [(ui, it) => it.num, (ui) => ui.focusNumber(ui.cursor)],
  /* A switch flips on Enter: one bit, visibly changed, the same key
   * puts it back, and a radio with its axes held out of the menus has
   * nothing else. */
  [(ui, it) => it.sw, (ui, it) => {
    if (!it.flip) return;
    it.flip();
    ui.writeSettings();
  }],
  /* A list opens rather than steps: one press one row off used to swap
   * a flight tune silently. pickOnly opts a short list out of stepping
   * too, for a row that switches an unfinished feature on. */
  [(ui, it) => it.options && it.options.length && (it.pickOnly || !fitsAsSegments(it)), (ui) => ui.openDropForCursor()],
  /* A segmented row cycles: every choice is on screen, and a radio has
   * no other way to change it. */
  [(ui, it) => it.options && it.options.length, (ui) => ui.adjust(1)],
  /* Nothing to open and nothing to fire: say so rather than read as a
   * dead key. */
  [(ui, it) => it.adjust || it.step, (ui) => sound(ui, 'back')],
  [(ui, it) => it.hub && ui.onGate(), (ui, it) => {
    sound(ui, 'select');
    ui.openHub(it.hub);
  }],
  /* An activity card on the gate is half an answer; the aircraft is
   * chosen in front of it. The Hangar's cards are plain actions. */
  [(ui, it) => it.card && ui.onGate() && WAYS.some((w) => w.action === it.action), (ui, it) => {
    sound(ui, 'select');
    ui.pickForWay(it.action);
  }],
  [() => true, (ui, it) => {
    sound(ui, 'select');
    ui.act(it.action);
  }],
];

/* An activity's hub link as Continue: in its place, its key kept. With a
 * campaign's next mission it presses that mission's Play
 * (continue-mission) rather than opening the campaign's page, and names
 * the mission in its title; the label stays Continue, no longer than any
 * it replaces. */
function continueLink(link, last) {
  const cont = { ...link, label: str('hub.continue'), continue: true };
  if (!last.mission) return cont;
  return { ...cont, action: 'continue-mission', mission: last.mission.id, title: last.mission.name };
}

/* ---- the methods ---- */

export const actionMethods = {
  act(action, picked = null, { keepWorld = false } = {}) {
    if (needsAccount(action) && needSignIn(() => this.act(action, picked, { keepWorld }))) {
      return;
    }
    const exact = ACTIONS[action];
    if (exact) {
      if (exact(this, action) !== FALL_THROUGH) return;
      if (this.onAction) this.onAction(action, this.settings);
      return;
    }
    const way = WAYS.find((w) => w.action === action);
    if (way) {
      answerGate(this, way, picked, keepWorld);
      return;
    }
    const family = PREFIXES.find(([prefix]) => action.startsWith(prefix));
    if (family) {
      family[1](this, action, action.slice(family[0].length));
      return;
    }
    if (action === 'fly') this.flown();
    if (this.onAction) this.onAction(action, this.settings);
  },

  back() {
    if (this.dropEl) {
      this.closeDrop();
      sound(this, 'back');
      return;
    }
    if (this.screen === 'title') {
      backOnTitle(this);
      return;
    }
    if (this.screen === 'flight') return;
    /* The room screen is home inside a room: Back stops there, except
     * that a game's lobby backs out to the cards it came from. A paused
     * run behind it is still the run. */
    if (this.screen === 'friends' && this.returnTo !== 'paused' && this.inRoom && this.inRoom()) {
      if (this.inLobby && this.inLobby() && this.onLobbyBack) this.onLobbyBack();
      return;
    }
    sound(this, 'back');
    const own = BACK_FROM[this.screen];
    if (own && own(this)) return;
    if (this.screen === 'credits') dropHash();
    /* Back to the room this one was opened from, once; a paused run's
     * chain wins over it. */
    if (this.returnTo !== 'paused' && this.roomFrom) {
      const from = this.roomFrom;
      this.roomFrom = null;
      this.show(from);
      return;
    }
    this.act(this.returnTo === 'paused' ? 'paused' : 'title');
  },

  select() {
    const it = this.items()[this.cursor];
    if (!it) return;
    const [, then] = ROW_KINDS.find(([when]) => when(this, it));
    then(this, it);
  },

  /* The three hub cards with their activities as links. A hub with
   * nothing to offer (Operations without a rooms server) is left out. */
  hubCards(rooms) {
    const ways = (id) => hubWays(id).filter((w) => rooms || !w.room).map((w) => ({ label: w.label, action: w.action, key: w.id }));
    /* Operations also holds the war's field hangar, which needs no rooms
     * server to walk round. */
    const field = { label: str('walk.field'), action: 'field-walk', key: 'ops-field' };
    const own = (hub) => {
      if (hub.id === 'hangar') {
        return this.hangarCards().map((c) => ({ label: c.label, action: c.action, key: c.card }));
      }
      return hub.id === 'ops' ? [...ways(hub.id), field] : ways(hub.id);
    };
    /* Continue stands in the last activity's own link, its press that
     * card's (src/ui/cards.js gateLinks, pickForWay), so the session is
     * the one the pilot last chose for it. In its place, not beside it:
     * the label is no longer than any activity's it replaces, in either
     * language, so the links' wrapping never gains a line and the hub no
     * height. It keeps the activity's key, so the link still wears that
     * card's class (src/ui/cards.js gateLinks) and is the same thing at
     * home and in the hub. */
    const last = this.continueWay();
    const linksOf = (hub) => own(hub).map((l) => (last && l.action === last.way.action ? continueLink(l, last) : l));
    return HUBS.map((hub) => ({
      label: str(hub.label),
      card: `hub-${hub.id}`,
      hub: hub.id,
      art: hub.art,
      svg: hub.id === 'ops' ? reticleSvg() : craftSvg(airframeById(this.settings.airframe)),
      blurb: str(hub.blurb),
      facts: [],
      links: linksOf(hub),
      action: `hub-${hub.id}`,
    })).filter((card) => card.links.length > 0);
  },

  /* What home's Continue holds, { way, mission }, or null: none yet, an
   * id this build does not know, a hidden one, or a campaign with no
   * mission this page may play, since its Play would open nothing a
   * pilot may fly. `mission` is the campaign's next one
   * (src/ui/continuity.js), null for any other activity or once every
   * playable mission is won. A campaign's screen, which knows its release
   * gate, its unlocks and the owner's, answers through this.campaigns
   * (main.js installs them); without them, a campaign counts as playable
   * only while one of its missions is released. */
  continueWay() {
    const activity = this.settings.lastActivity;
    const way = WAYS.find((w) => w.id === wayOfActivity(activity));
    if (!way) return null;
    const campaign = this.campaigns ? this.campaigns[activity] : null;
    if (campaign) {
      return campaign.playable().length ? { way, mission: campaign.nextMission() } : null;
    }
    const missions = CAMPAIGN_MISSIONS[activity];
    if (missions && !missions.some((m) => released(m.id))) return null;
    return { way, mission: null };
  },

  /* The Hangar's cards: the aircraft, its customising when it has any,
   * the war's upgrades, the controller (src/ui/controller.js), and how
   * the sticks fly. */
  hangarCards() {
    const plan = craftSvg(airframeById(this.settings.airframe));
    const card = (id, label, svg, blurb, action) => ({ label, card: `hangar-${id}`, svg, blurb, facts: [], action });
    return [
      card('walk', str('walk.card'), null, str('walk.blurb'), 'hangar-walk'),
      card('aircraft', str('ui.aircraft'), plan, str('hub.aircraft_blurb'), 'hangar-aircraft'),
      ...(customisable(this.settings.airframe) ? [card('customise', str('hangar.customise'), plan, str(airframeById(this.settings.airframe).fixedWing ? 'hangar.row_note' : 'hangar.row_note_quad'), 'customise')] : []),
      card('upgrades', str('hub.upgrades'), null, str('hub.upgrades_blurb'), 'campaign-shop'),
      card('controller', str('controller.title'), null, str('controller.card_blurb'), 'controller'),
      card('howto', str('ui.how_to_fly'), null, str('ui.the_sticks_live_and_what_the'), 'howto'),
    ];
  },

  openHub(id) {
    this.hub = id;
    this.setCursor(this.firstStop(this.items()));
    this.renderMenu();
  },

  /* The one place a world becomes the seat: written, handed to
   * the shell (which swaps the world), and the pilot put back where the
   * choice was made, unless `stay` keeps them on the screen a room's
   * welcome seated from. */
  seatMap(id, { stay = false } = {}) {
    const world = MAPS.find((m) => m.id === id);
    /* The last freestyle world is remembered apart from the seat, so the
     * Map row and the gate can tell a chosen world from none. */
    if (world && world.mode === 'freestyle') this.settings.freestyleMap = id;
    this.settings.map = id;
    saveSettings(this.settings);
    if (!stay) this.show(this.returnTo === 'paused' ? 'paused' : 'title');
    tellShell(this);
  },

  /* The first launch ends the first visit. Stored, or the first visit's
   * welcome (the Fly with question, the title's first look) would be
   * offered again next load. */
  flown() {
    if (!this.firstRun) return;
    this.firstRun = false;
    saveSettings(this.settings);
    this.renderMenu();
  },

  /* Whether the seat is a place the mode flies in; the gate itself has
   * no Fly row to guard. */
  seatMatchesMode() {
    if (this.mode === 'freestyle') return Boolean(seatedFreestyleMap(this.settings));
    return true;
  },
};
