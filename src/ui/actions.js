/*
 * The menu's verbs: what a pressed row, card or button does, and where
 * Escape goes. Installed on Ui.prototype by src/ui/ui.js.
 *
 *   act(action, picked, { keepWorld })   every action name, one table
 *   back()                               Escape and the Back row
 *   select()                             Enter on the row under the cursor
 *   hubCards, hangarCards, openHub       home and its three hubs
 *   seatMap, flown, seatMatchesMode      the seat and the first flight
 *   openBuilder, actOnCard, duplicateCard, storeCardChange,
 *   openBoardCourse                      the rows of a chosen course card
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

import { MAPS } from '../maps/registry.js';
import { airframeById } from '../../configs/airframes.js';
import { clearPidsFor } from '../../configs/pids.js';
import { RATE_DEFAULTS, normaliseRates } from '../../configs/rates.js';
import { deleteRatePreset, presetMatching, saveRatePreset } from '../../configs/ratepresets.js';
import { needSignIn } from '../share/account.js';
import { boardConfigured, boardOrigin, boardPageUrl, fetchCurrentEvent, fetchTrackDocument } from '../share/board.js';
import { tracksConfigured } from '../share/cloud.js';
import { hasFlyableTrack } from '../share/listing.js';
import { clearShareImport, readShareImport } from '../share/session.js';
import { BOARD_WINDOW, openNamedWindow } from '../share/windows.js';
import { str } from '../strings/index.js';
import { duplicateTrack, normalize } from '../trackbuilder/model.js';
import { deleteTrack, loadMapTrack, saveTrack } from '../trackbuilder/storage.js';
import { customisable } from './builds.js';
import { downloadCli } from './fc.js';
import { fitsAsSegments } from './rows.js';
import { saveSettings, seatAirframe } from './settings.js';
import { HUBS, OPEN_ACTIONS, WAYS, boardCraft, craftSvg, hubOfAction, hubWays, reticleSvg } from './ways.js';
/* A cycle: ui.js installs this module. Read inside methods only. */
import { ROOM_PARENTS, courseCardKey, seatIsRace, seatedFreestyleMap } from './ui.js';

/* ---- small shared steps ---- */

const sound = (ui, name) => { if (ui.onUiSound) ui.onUiSound(name); };

const tellShell = (ui) => { if (ui.onSettings) ui.onSettings(ui.settings); };

/* Where Back goes after this press: a run paused behind the menus is kept. */
const pauseOrTitle = (ui) => (ui.screen === 'paused' ? 'paused' : 'title');

const noteOn = (node, text) => { node.textContent = text; };

const boardTab = (ui, board) => openNamedWindow(boardPageUrl(board, boardCraft(ui.settings.airframe)), BOARD_WINDOW);

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
const SCREEN_ROWS = ['howto', 'pilot', 'quad', 'courses', 'freestyle', 'credits', 'friends'];

function openScreen(ui, screen) {
  ui.roomFrom = ROOM_PARENTS.has(ui.screen) && ui.screen !== screen ? ui.screen : null;
  ui.returnTo = pauseOrTitle(ui);
  ui.show(screen);
}

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
  saveSettings(ui.settings);
  tellShell(ui);
  ui.returnTo = 'title';
  ui.roomFrom = null;
  if (way.mode === 'race') {
    ui.show('courses');
    return;
  }
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
  const remembered = worlds.find((m) => m.id === ui.settings.freestyleMap);
  const world = home || remembered || (worlds.length === 1 ? worlds[0] : null);
  if (!world) {
    ui.show('freestyle');
    return;
  }
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

/* What a chosen course card's rows do, by kind of course. A cloud card
 * answers two of them; the rest are the library's and the board's. */
const CARD_ROWS = {
  'card-fly'(ui, card) {
    const t = card.course.track;
    ui.cardSubject = null;
    if (card.course.kind === 'cloud') {
      ui.seatCloud(t, () => ui.play());
      return;
    }
    /* In a race lobby the host's choice becomes the room's track and the
     * lobby takes over; otherwise the seat flies. */
    const go = () => { if (!(ui.onTrackChosen && ui.onTrackChosen())) ui.play(); };
    if (card.course.kind === 'board') {
      ui.openBoardCourse(t.id, go);
    } else if (ui.seatLocal(t.id)) {
      go();
    }
  },
  'card-editcopy'(ui, card) {
    if (card.course.kind === 'cloud') ui.editCloudCopy(card.course.track);
  },
  'card-board'(ui, card) {
    boardTab(ui, card.course.track.board);
  },
  'card-standings'(ui, card) {
    if (card.course.kind === 'board') ui.showStandings(card.course.track);
  },
  'card-edit'(ui, card) {
    const t = card.course.track;
    ui.openBuilder({ map: t.map, id: t.id });
  },
  'card-duplicate'(ui, card) {
    ui.duplicateCard(card.course.track, card.course.kind === 'board');
  },
  'card-rename'(ui, card) {
    const t = card.course.track;
    ui.askForm({
      title: str('ui.rename_this_track'),
      confirmLabel: str('ui.rename'),
      fields: [{ key: 'name', label: str('main.track_name'), value: t.name, maxLength: 80, placeholder: str('main.track_name') }],
    }).then((values) => {
      const doc = values && values.name ? loadMapTrack(t.id) : null;
      if (!doc) return;
      doc.name = values.name;
      ui.storeCardChange(saveTrack(doc), `local:${doc.id}`);
    });
  },
  'card-delete'(ui, card) {
    const t = card.course.track;
    ui.askConfirm({
      title: str('ui.delete', { name: t.name }),
      detail: tracksConfigured() ? str('cloud.delete_detail') : str('ui.this_browser_holds_the_only_copy'),
      yes: str('ui.delete_label'),
      no: str('ui.keep_it'),
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      const seat = readShareImport();
      if (seat && seat.id === t.id) {
        clearShareImport();
        ui.setShare(null);
      }
      ui.storeCardChange(deleteTrack(t.id), null);
    });
  },
};
const CLOUD_CARD_ROWS = new Set(['card-fly', 'card-editcopy']);

/* Rows a cloud card does not offer are ignored on it. */
function cardRow(ui, action, card) {
  const row = CARD_ROWS[action];
  if (!row || (card.course.kind === 'cloud' && !CLOUD_CARD_ROWS.has(action))) return;
  row(ui, card);
}

/* The chosen card's rows, dispatched from act(): a subject that has gone
 * (deleted in another tab) closes the card's rows instead. */
function onSubjectCard(ui, action) {
  const card = ui.subjectCard();
  if (!card) {
    ui.cardSubject = null;
    ui.renderMenu();
    return;
  }
  ui.actOnCard(action, card);
}

/* Exact action names. Each handler ends the press unless it returns
 * FALL_THROUGH, which hands the action on to the shell's onAction. */
const FALL_THROUGH = Symbol('fall through');

const ACTIONS = {
  'update-reload'() { window.location.reload(); },
  'room-bar'(ui) { if (ui.roomBarView && ui.roomBarView.act) ui.roomBarView.act(); },
  hotswap(ui) { ui.openSwap('paused'); },
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
  'hangar-shop'(ui) {
    ui.openHangar(ui.settings.airframe, () => ui.renderMenu(), ui.wornBuild(ui.settings.airframe), 'shop');
  },
  customise(ui) {
    /* The aircraft in the air may be a My Hangar build; a change in the
     * hangar is then a change to that build. */
    ui.openHangar(ui.settings.airframe, () => ui.renderMenu(), ui.wornBuild(ui.settings.airframe));
  },
  /* One named tab for the board, so it does not multiply and the sim
   * stays where it is. */
  leaderboard(ui) { boardTab(ui, ui.share && ui.share.board); },
  feel(ui) { ui.openFeelReport(); },
  /* The guided first flight launches straight past the launch card. */
  firstflight(ui) {
    ui.flown();
    ui.guided = true;
    tellShell(ui);
    if (ui.onAction) ui.onAction('fly', ui.settings);
  },
  'card-back'(ui) {
    ui.cardSubject = null;
    ui.renderMenu();
    ui.renderCourseCards();
    ui.setCursor(ui.cardCursor());
  },
  'card-standings'(ui) {
    const card = ui.subjectCard();
    if (card && card.course && card.course.kind === 'board') ui.showStandings(card.course.track);
  },
  /* The standings screen has the board row with no card behind it. */
  'card-board'(ui, action) {
    if (ui.screen !== 'standings') {
      onSubjectCard(ui, action);
      return;
    }
    if (ui.standingsFor) boardTab(ui, ui.standingsFor.board);
  },
  'weekly-event'(ui) {
    const e = ui.weeklyEvent;
    /* The event is all the hub has of the track: enough to seat it, since
     * its document is fetched by id. */
    if (e && e.trackId) ui.openBoardCourse(e.trackId, () => ui.play(), { id: e.trackId, name: e.name, map: e.map, author: '', board: boardOrigin() });
  },
  'standings-fly'(ui) {
    const t = ui.standingsFor;
    if (t && t.id) ui.openBoardCourse(t.id, () => ui.play());
  },
  /* Race the record: the ghost is armed through the shell first, then
   * the track is seated and played the way a chase link does it. */
  'standings-ghost'(ui) {
    const top = (ui.standingsTimes || []).find((x) => x.hasGhost && x.id);
    const t = ui.standingsFor;
    if (!top || !t || !t.id) return;
    if (ui.onStandingsGhost) ui.onStandingsGhost(t, top);
    ui.openBoardCourse(t.id, () => ui.play());
  },
  'cloud-more'(ui) { ui.loadCloudCourses(true); },
  newtrack(ui) { toggleNewTrack(ui, true); },
  'newtrack-back'(ui) { toggleNewTrack(ui, false); },
  rooms(ui) { ui.show('rooms'); },
  roomnew(ui) { ui.show('roomnew'); },
  fly(ui) {
    /* A plane too wide for the track's gates gives way to the racer on
     * the way to the card, which says which machine the run counts for. */
    ui.seatCraftForCourse();
    if (!ui.seatMatchesMode()) {
      ui.returnTo = pauseOrTitle(ui);
      ui.show(ui.mode === 'freestyle' ? 'freestyle' : 'courses');
      return undefined;
    }
    if (seatIsRace(ui.settings)) {
      ui.returnTo = pauseOrTitle(ui);
      ui.show('launch');
      return undefined;
    }
    return FALL_THROUGH;
  },
  /* The launch card's own button: the shell has always launched on 'fly'. */
  'launch-go'(ui) {
    ui.flown();
    if (ui.onAction) ui.onAction('fly', ui.settings);
  },
  rates(ui) {
    /* Reached from Settings or Quad, Back returns there; from the bench,
     * returnTo is left to the pause chain it may be carrying. */
    if (ui.screen === 'pilot' || ui.screen === 'quad') {
      ui.ratesFrom = ui.screen;
    } else {
      ui.ratesFrom = null;
      if (ui.screen !== 'fc') ui.returnTo = pauseOrTitle(ui);
    }
    ui.show('rates');
  },
  pids(ui) {
    if (ui.screen === 'quad') {
      ui.pidsFrom = 'quad';
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
  /* My tracks from a run or its results: the run ends as quitting to the
   * title ends it, and the list opens on its newest card. */
  mytracks(ui) {
    ui.show('title');
    if (ui.onAction) ui.onAction('title', ui.settings);
    ui.returnTo = 'title';
    ui.show('courses');
    ui.setCursor(ui.firstStop(ui.items()));
  },
  title(ui) {
    ui.show('title');
    return FALL_THROUGH;
  },
  paused(ui) {
    ui.show('paused');
    return FALL_THROUGH;
  },
};
for (const screen of SCREEN_ROWS) {
  ACTIONS[screen] = (ui) => openScreen(ui, screen);
}

function toggleNewTrack(ui, open) {
  ui.newTrackOpen = open;
  ui.renderMenu();
  ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
}

/* Action families named by prefix, with the rest of the name as the argument. */
const PREFIXES = [
  ['card-', onSubjectCard],
  ['newtrack:', (ui, action, map) => { ui.newTrackOpen = false; ui.openBuilder({ map }); }],
  ['casualtrack:', (ui, action, map) => { ui.newTrackOpen = false; ui.openBuilder({ map, casual: true }); }],
  ['friends-', (ui, action) => { if (ui.onFriends) ui.onFriends(action); }],
  /* The gate's rooms panel: the friends card's way in, then the room,
   * the lobby or Make a room, with the card's world left unbuilt because
   * the room's welcome seats its own. */
  ['lobby:', (ui, action, rest) => {
    ui.act(WAYS.find((w) => w.id === 'friends').action, null, { keepWorld: true });
    ui.act(rest);
  }],
  ['fc-preset:', (ui, action, id) => {
    ui.fc.applyPreset(id).then(() => ui.renderMenu()).catch((err) => console.error(err));
  }],
  ['map:', (ui, action, id) => ui.seatMap(id)],
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
  /* Escape closes the chosen card's rows before it leaves the list. */
  courses(ui) {
    if (!ui.cardSubject) return false;
    ui.act('card-back');
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
  pids(ui) { return backToOrigin(ui, 'pidsFrom'); },
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
  /* A course card is chosen, not pressed: its rows appear, the cursor
   * on Fly it. Choosing another card moves to it. */
  [(ui, it) => ui.screen === 'courses' && it.course, (ui, it) => {
    ui.cardSubject = courseCardKey(it);
    sound(ui, 'select');
    ui.renderMenu();
    ui.renderCourseCards();
    ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
  }],
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
    const linksOf = (hub) => {
      if (hub.id === 'hangar') {
        return this.hangarCards().map((c) => ({ label: c.label, action: c.action, key: c.card }));
      }
      return hub.id === 'ops' ? [...ways(hub.id), field] : ways(hub.id);
    };
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

  /* The Hangar's cards: the aircraft, its customising when it has any,
   * the radio, and how the sticks fly. */
  hangarCards() {
    const plan = craftSvg(airframeById(this.settings.airframe));
    const card = (id, label, svg, blurb, action) => ({ label, card: `hangar-${id}`, svg, blurb, facts: [], action });
    return [
      card('walk', str('walk.card'), null, str('walk.blurb'), 'hangar-walk'),
      card('aircraft', str('ui.aircraft'), plan, str('hub.aircraft_blurb'), 'hangar-aircraft'),
      ...(customisable(this.settings.airframe) ? [card('customise', str('hangar.customise'), plan, str('hangar.row_note'), 'customise')] : []),
      card('sticks', str('ui.calibrate_sticks'), null, str('hub.sticks_blurb'), 'calibrate'),
      card('howto', str('ui.how_to_fly'), null, str('ui.the_sticks_live_and_what_the'), 'howto'),
    ];
  },

  openHub(id) {
    this.hub = id;
    if (id === 'club') {
      this.loadWeeklyEvent();
    }
    this.setCursor(this.firstStop(this.items()));
    this.renderMenu();
  },

  /* This week's event, read each time Flight Club opens so its standings
   * are fresh; until it answers (or with no board) the hub has no card
   * for it. */
  loadWeeklyEvent() {
    if (!boardConfigured()) {
      return;
    }
    fetchCurrentEvent().then((event) => {
      const had = JSON.stringify(this.weeklyEvent || null);
      this.weeklyEvent = event;
      if (had !== JSON.stringify(event) && this.hub === 'club') {
        this.renderMenu();
      }
    }).catch(() => {
      /* No board this time: the hub reads as it did before events. */
    });
  },

  /* The one place a world or track becomes the seat: written, handed to
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

  /* The first launch ends the first visit. Stored, or the guided flight
   * would be offered again next load. */
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
    if (this.mode === 'race') return this.settings.map === 'track' && hasFlyableTrack();
    return true;
  },

  openBuilder({ map, id = null, casual = false }) {
    if (!this.onBuild) return;
    Promise.resolve(this.onBuild({ map, id, casual })).catch((e) => {
      /* The one honest failure: the track was deleted in another tab
       * since the list was read. The list is read again either way. */
      console.error(e);
      noteOn(this.localNote, str('ui.that_track_is_no_longer_saved'));
      this.loadLocalCourses();
      this.renderMenu();
    });
  },

  actOnCard(action, card) {
    cardRow(this, action, card);
  },

  /* A copy under a new id, named as one, of the pilot's own track or of
   * a board track fetched for it; the copy is theirs to edit and publish. */
  duplicateCard(t, board) {
    const keep = (doc) => {
      const copy = duplicateTrack(normalize(doc).doc, str('ui.copy_of', { name: t.name }));
      this.storeCardChange(saveTrack(copy), `local:${copy.id}`);
    };
    if (!board) {
      const doc = loadMapTrack(t.id);
      if (doc) keep(doc);
      return;
    }
    noteOn(this.boardNote, str('ui.loading_2', { name: t.name }));
    fetchTrackDocument(t.id, t.board)
      .then((payload) => {
        noteOn(this.boardNote, '');
        keep(payload.document || payload);
      })
      .catch((err) => noteOn(this.boardNote, str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err })));
  },

  /* After a card's row wrote the library: say if the browser refused,
   * read the list again, and land on the card `key` names (the copy, the
   * renamed track) or on the first card when it is gone. */
  storeCardChange(ok, key) {
    noteOn(this.localNote, ok ? '' : str('ui.this_browser_would_not_store_that'));
    this.loadLocalCourses();
    this.cardSubject = null;
    this.lastCardKey = key;
    this.renderMenu();
    this.renderCourseCards();
    this.setCursor(this.cardCursor());
  },

  /* Seat a board track through the shell, which owns the fetch, then
   * `then`. One at a time: a second press while one loads is ignored. */
  openBoardCourse(id, then = null, known = null) {
    const listed = (this.boardCourses || []).find((t) => t.id === id);
    const track = listed || known || (this.standingsFor && this.standingsFor.id === id ? this.standingsFor : null);
    if (!track || this.openingBoardCourse) return;
    const failed = (why) => {
      this.openingBoardCourse = false;
      noteOn(this.boardNote, why);
    };
    this.openingBoardCourse = true;
    noteOn(this.boardNote, str('ui.loading_2', { name: track.name }));
    if (!this.onBoardCourse) {
      failed(str('ui.could_not_be_loaded_from_the', { name: track.name }));
      return;
    }
    this.onBoardCourse(track).then((ok) => {
      if (!ok) {
        failed(str('ui.could_not_be_loaded_from_the', { name: track.name }));
        return;
      }
      this.openingBoardCourse = false;
      noteOn(this.boardNote, '');
      if (then) then();
    }).catch((err) => failed(str('ui.could_not_be_loaded', { name: track.name, v2: err.message ?? err })));
  },
};
