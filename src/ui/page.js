/*
 * page.js: the shell's page, made once when the Ui is constructed. The
 * flight overlay, the two frame bars, every screen, the chips, the bars and
 * the music dock, each node kept on the Ui under the field name main.js,
 * the Ui's own methods and the checks reach it by.
 *
 * Most screens are the same page: a heading, perhaps a lede, perhaps a
 * panel of their own, a menu with its help column, a key hint. Those are
 * rows of PAGES, read by menuPage, so what differs between them is the
 * only thing written down. The screens that are not that shape (the title,
 * the flight controller bench, calibration, choosing a joystick, results)
 * have builders of their own, in the same list, because the list's order
 * is the order of this.screens and so of the screens in the document.
 *
 * Order is a contract here beyond the tree: listeners are attached in the
 * order the old build attached them, and the stages run in the order
 * build() calls them, because some steps read what an earlier one left
 * (bindAirSlider reads osdAir, renderHowto reads the tabs, the quad's
 * showcase takes the canvas the title made). scripts/shell-dom-golden.js
 * pins all of it.
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

import { str } from '../strings/index.js';
import { touchWanted } from '../input/touchsticks.js';
import { tracksConfigured } from '../share/cloud.js';
import { WEIGHT_MIN, WEIGHT_MAX, WEIGHT_STEP } from './settings.js';
import {
  btn, el, hintWithKeys, makeGimbal, makeWeightSlider, wordmark,
} from './widgets.js';
import { ScoreHud } from './scorehud.js';
import { TrickFilmPlayer } from './trickfilm.js';
import { fillCredits } from './credits.js';
import { mountRatesPanel } from './ratespanel.js';
import { mountPidsPanel } from './pidspanel.js';
import { Carousel } from './carousel.js';
import { Hangar } from './hangar.js';
import { Progress, bindProgress } from './progress-ui.js';
import { installHangarPolish } from './hangar-polish.js';
import { watchVersion } from './update.js';

/* Esc's line on most pages: nothing on them needs saving. */
const ESC_STORED = [['Esc'], 'ui.goes_back_changes_are_already_stored'];
const ESC_STILL_MOVE = [['Esc'], 'ui.goes_back_arrow_keys_still_move'];
/* The rates and PIDs pages say what their keys do per row, so the hint's
 * words start empty and the page keeps the span to write them into. */
const EDITOR_KEYS = ['↑↓', '←→', 'Enter', 'Esc'];

/*
 * A menu with a help column beside it. The column is its own box so a long
 * note cannot change the rows' width. The menu is the listbox because the
 * rows inside are its options (see renderMenu).
 */
function menuBlock(scroll) {
  const menu = el('div', 'menu');
  menu.setAttribute('role', 'listbox');
  const help = el('div', 'menu-help');
  const stage = el('div', 'menu-stage');
  stage.append(menu, help);
  if (scroll) {
    menu.classList.add('menu-scroll');
  }
  return { stage, menu, help };
}

/* The block's menu and help land on the shell as <name>Menu and <name>Help. */
function keepMenu(shell, name, block) {
  shell[`${name}Menu`] = block.menu;
  shell[`${name}Help`] = block.help;
}

/* A node the shell keeps a field for, made and stored in one step. */
function keep(shell, field, tag, className, text) {
  const node = el(tag, className, text);
  shell[field] = node;
  return node;
}

/* A button that runs one shell action when clicked. */
function actionButton(shell, className, label, action) {
  const b = btn(className, label);
  b.addEventListener('click', () => shell.act(action));
  return b;
}

/* The flight overlay, the score beside it and nothing else in flight. */
export function buildFlightOverlay(shell) {
  const root = shell.root;
  root.textContent = '';
  shell.osd = el('div', 'osd');

  /* The clock is labelled because it is a lap in a race and an airtime in
   * freestyle. The ghost line is off until the first gate gives it a gap. */
  const head = el('div', 'osd-top');
  head.append(
    keep(shell, 'osdClockLabel', 'div', 'osd-label', 'Lap'),
    keep(shell, 'osdTimer', 'div', 'osd-timer', '--.--'),
    keep(shell, 'osdGate', 'div', 'osd-gate', ''),
    keep(shell, 'osdLast', 'div', 'osd-best', ''),
    keep(shell, 'osdBest', 'div', 'osd-best', ''),
    keep(shell, 'osdGhost', 'div', 'osd-ghost is-off', ''),
  );
  shell.osdTopBlock = head;

  const bar = (field, fillClass) => {
    const track = el('div', 'bar');
    track.append(keep(shell, field, 'div', fillClass));
    return track;
  };
  const left = el('div', 'osd-corner osd-left');
  left.append(
    el('div', 'osd-label', str('ui.pack')),
    keep(shell, 'osdPack', 'div', 'osd-value', ''),
    bar('osdPackBar', 'bar-fill'),
    keep(shell, 'osdHits', 'div', 'osd-sub osd-hits', ''),
  );

  /* Flaps and gear stay empty on an aircraft without them. Launch is not a
   * corner line: it sits on the overlay itself, after the sticks. */
  const right = el('div', 'osd-corner osd-right');
  right.append(
    keep(shell, 'osdSpeed', 'div', 'osd-value', ''),
    keep(shell, 'osdFlight', 'div', 'osd-sub osd-mode', ''),
    keep(shell, 'osdFlaps', 'div', 'osd-sub osd-mode', ''),
    keep(shell, 'osdGear', 'div', 'osd-sub osd-mode', ''),
  );
  const launch = keep(shell, 'osdLaunch', 'div', 'osd-launch is-off', '');
  right.append(
    keep(shell, 'osdAlt', 'div', 'osd-sub', ''),
    el('div', 'osd-label', str('ui.throttle')),
    bar('osdThrBar', 'bar-fill warm'),
  );

  /* The weight slider sits between the two gimbals and is up every flight,
   * so a radio pilot, whose gimbals are hidden, still has it, centred. */
  shell.osdStickLeft = makeGimbal(str('ui.yaw_throttle'));
  shell.osdStickRight = makeGimbal(str('ui.roll_pitch'));
  shell.osdAir = makeWeightSlider({
    min: WEIGHT_MIN,
    max: WEIGHT_MAX,
    step: WEIGHT_STEP,
    value: shell.settings.weight,
    label: str('ui.weight_how_heavy_the_quad_feels'),
  });
  const sticks = el('div', 'osd-sticks is-off');
  sticks.append(shell.osdStickLeft.box, shell.osdAir.box, shell.osdStickRight.box);
  shell.osdSticks = sticks;
  shell.bindAirSlider();

  shell.osd.append(head, left, right, sticks, launch, shell.buildTargetLock());
  root.append(shell.osd);
  /* A sibling of the overlay, not a child: the overlay is hidden off
   * flight and the score has to outlive it into results. */
  shell.scoreHud = new ScoreHud(root);
}

/*
 * The status bar and the command bar, outside every screen so they hold
 * the same pixels on all of them. The primary button runs the screen's
 * declared primary action, never the focused row's: a pointer crossing
 * rows on its way to the button would otherwise change what it does.
 */
export function buildFrame(shell) {
  shell.frameTop = el('div', 'frame-top');
  shell.frameTop.append(
    keep(shell, 'crumb', 'div', 'crumb'),
    keep(shell, 'frameGap', 'div', 'frame-gap'),
    keep(shell, 'frameContext', 'div', 'frame-context'),
  );

  const primary = btn('frame-primary');
  primary.hidden = true;
  primary.addEventListener('click', () => {
    const it = shell.primaryItem();
    if (it && it.action) {
      shell.act(it.action);
    }
  });
  shell.framePrimary = primary;
  shell.frameBot = el('div', 'frame-bot');
  shell.frameBot.append(keep(shell, 'frameLegend', 'div', 'frame-legend'), el('div', 'frame-gap'), primary);
  shell.root.append(shell.frameTop, shell.frameBot);
}

/*
 * THE TITLE. A copy column: the brand and the gate's rooms panel on one
 * row, Flight Club's pilot stats, the gate's cards, and a foot with the key hint and the menu. The
 * cards and the panel are hidden outside the gate, which leaves the column
 * its two children spaced apart. The craft canvas is made here and shown
 * in the quad's showcase.
 */
function titleScreen(shell) {
  const brand = el('div', 'brand');
  brand.append(wordmark(), keep(shell, 'brandSub', 'div', 'brand-sub', ''));
  /* About the software, not the flying, so it sits under the wordmark and
   * is never dismissed: the beta is just as true on the second visit. */
  const beta = el('p', 'beta-note');
  beta.append(el('span', 'beta-tag', str('ui.beta')), el('span', null, str('ui.realistic_drone_combat_inspired_by_paraguay')));
  brand.append(
    beta,
    keep(shell, 'titleBest', 'div', 'brand-best', ''),
    keep(shell, 'keepNote', 'p', 'keep-note', str('ui.tracks_you_build_stay_in_this')),
    keep(shell, 'firstNote', 'p', 'keep-note first-note', str('ui.a_quad_has_no_brakes_and')),
  );
  const top = el('div', 'title-top');
  top.append(brand, keep(shell, 'gateRooms', 'div', 'gate-rooms'));

  /* Scrolls like every list: on a short landscape phone the last row is
   * otherwise out of reach. index.html caps its height. */
  const block = menuBlock(true);
  keepMenu(shell, 'title', block);
  /* Its own field: setTitleHint rewrites the keys for the gate. */
  shell.titleHint = hintWithKeys(['↑↓', 'Enter'], str('ui.arrow_keys_move_enter_selects_a'));
  const foot = el('div', 'title-foot');
  foot.append(shell.titleHint, block.stage);

  const column = el('div', 'title-copy');
  /* Flight Club's pilot stats (src/ui/pilotstats.js) sit in the room
   * between the brand and the cards. Not a menu item: the arrows, a pad
   * and Tab walk past it to the cards exactly as before. */
  column.append(top, keep(shell, 'gateStats', 'div', 'gate-stats'), keep(shell, 'gateCards', 'div', 'gate-cards'), foot);
  shell.craftCanvas = el('canvas', 'craft-view');
  shell.craftCanvas.setAttribute('aria-hidden', 'true');
  const screen = el('div', 'screen screen-title');
  screen.append(column);
  return ['title', screen];
}

/*
 * HOW TO FLY: a source switch over live gimbals and the keys for that
 * source. main.js feeds the gimbals the same channels it feeds the quad.
 * Touch is offered, first, only on a device with touch points.
 */
function howtoTabs(shell) {
  const sources = [['keyboard', 'Keyboard'], ['mouse', str('ui.mouse')], ['radio', str('ui.radio_or_gamepad')], ['launch', str('ui.launch_control')]];
  if (touchWanted()) {
    sources.unshift(['touch', 'Touch']);
  }
  const row = el('div', 'howto-tabs');
  shell.howtoTabs = {};
  for (const [source, label] of sources) {
    const tab = btn('howto-tab', label);
    tab.addEventListener('click', () => shell.setHowtoSource(source));
    shell.howtoTabs[source] = tab;
    row.append(tab);
  }
  return row;
}

function howtoRig(shell) {
  shell.howtoStickLeft = makeGimbal(str('ui.yaw_throttle'));
  shell.howtoStickRight = makeGimbal(str('ui.roll_pitch'));
  const pair = el('div', 'howto-sticks');
  pair.append(shell.howtoStickLeft.box, shell.howtoStickRight.box);
  const rig = el('div', 'howto-rig');
  rig.append(pair, keep(shell, 'howtoLive', 'div', 'howto-live', ''));
  const body = el('div', 'howto-body');
  body.append(rig, keep(shell, 'howtoKeys', 'dl', 'howto-keys'));
  return body;
}

/* The trick list's film and the words beside it, over the list itself. */
function trickStage(shell) {
  const side = el('div', 'trick-side');
  side.append(
    keep(shell, 'trickName', 'div', 'trick-name', ''),
    keep(shell, 'trickMeta', 'div', 'trick-meta', ''),
    keep(shell, 'trickHow', 'p', 'trick-how', ''),
    keep(shell, 'trickView', 'div', 'trick-view', ''),
  );
  const stage = el('div', 'trick-stage');
  stage.append(keep(shell, 'trickCanvas', 'canvas', 'trick-film'), side);
  return stage;
}

/*
 * My tracks' strip: the pilot's track cards first, the board's after, and
 * one line each for an empty list and for what the board said.
 * mapCardHost is made for the Freestyle room's world cards
 * (renderMapCards) and never placed here.
 */
function courseStrip(shell) {
  shell.mapCardHost = el('div', 'map-cards');
  const strip = keep(shell, 'courseStrip', 'div', 'card-strip');
  strip.append(
    el('div', 'strip-label', tracksConfigured() ? str('cloud.strip_label') : str('ui.yours_first_then_the_board_most')),
    keep(shell, 'courseCardHost', 'div', 'map-cards course-cards'),
    keep(shell, 'localNote', 'div', 'board-note', ''),
    keep(shell, 'boardNote', 'div', 'board-note', ''),
  );
  return strip;
}

/* The airframe showcase, seated in the first column of Quad's menu. */
function quadShowcase(shell) {
  const frame = keep(shell, 'craftQuadFrame', 'div', 'craft-showcase-frame');
  frame.append(shell.craftCanvas);
  const showcase = el('div', 'craft-showcase');
  showcase.append(frame, keep(shell, 'craftCaption', 'div', 'craft-showcase-cap', str('ui.acro_sticks_are_rates_hands_off')));
  return showcase;
}

function warLobby(shell) {
  const lobby = keep(shell, 'warLobbyEl', 'div', 'war-lobby');
  lobby.hidden = true;
  return lobby;
}

/*
 * The menu pages. Fields, all optional but id, classes and menu:
 *   title    string key of the h2
 *   lede     [class, string key or null]; null text is a lede the shell
 *            writes later, kept under ledeField
 *   body     nodes between the lede and the menu
 *   seat     a node put in the menu stage's first column
 *   scroll   the menu scrolls (menu-scroll)
 *   hint     [keys, string key]; hintField keeps its words' span
 *   menu     where the block goes: a name for <name>Menu and <name>Help,
 *            or a function given the block
 *   then     run once the page is made, before the next one
 */
const PAGES = {
  howto: {
    classes: 'screen-page screen-howto',
    title: 'ui.how_to_fly',
    lede: ['howto-lede', 'ui.a_quad_has_no_brakes_and_2'],
    body: (shell) => [howtoTabs(shell), howtoRig(shell), keep(shell, 'howtoMode', 'p', 'howto-mode', '')],
    menu: 'howto',
    hint: ESC_STILL_MOVE,
    then: (shell) => {
      shell.howtoSource = touchWanted() ? 'touch' : (shell.settings.mouseFlight ? 'mouse' : 'keyboard');
      shell.renderHowto();
    },
  },
  /* The catalogue's own patterns, so nothing listed is a trick the scorer
   * would not score. See src/ui/trickfilm.js. */
  tricks: {
    classes: 'screen-page screen-tricks',
    title: 'ui.trick_list',
    lede: ['rates-lede', 'ui.every_trick_the_scorer_is_known'],
    body: (shell) => [trickStage(shell)],
    menu: 'trick',
    scroll: true,
    hint: [['Esc'], 'ui.goes_back_arrow_keys_move_through'],
    then: (shell) => {
      shell.trickPlayer = new TrickFilmPlayer(shell.trickCanvas);
      shell.trickShown = '';
    },
  },
  credits: {
    classes: 'screen-page screen-credits',
    title: 'ui.credits',
    body: (shell) => {
      const roll = keep(shell, 'creditsRoll', 'div', 'credits-roll');
      fillCredits(roll, { assetBase: 'assets/credits' });
      return [roll];
    },
    menu: 'credits',
    hint: ESC_STILL_MOVE,
  },
  /* Which aircraft the list is for is said in the lede, written by
   * items(): a plane sees only the tracks it fits. */
  courses: {
    classes: 'screen-page screen-maps screen-courses',
    title: 'ui.my_tracks',
    lede: ['screen-lede', null],
    ledeField: 'coursesLede',
    body: (shell) => [courseStrip(shell)],
    menu: 'courses',
    scroll: true,
    hint: [['↑↓', 'Enter', 'Esc'], 'ui.arrow_keys_move_enter_chooses_escape'],
  },
  /* The world cards and their rows; nothing here is timed or posted, so
   * there is no publish cluster and no hint line. */
  freestyle: {
    classes: 'screen-page screen-courses screen-freestyle',
    title: 'ui.freestyle',
    lede: ['rates-lede', 'ui.a_whole_valley_and_no_gates'],
    body: (shell) => [keep(shell, 'freestyleCards', 'div', 'map-cards')],
    menu: 'freestyle',
    scroll: true,
  },
  /* Quad holds what survives a change of pilot, Settings (pilot) what
   * survives a change of quad; the run's own choices are the launch card. */
  quad: {
    classes: 'screen-page screen-quad',
    title: 'ui.quad',
    lede: ['rates-lede', 'ui.everything_about_the_machine_carried_with'],
    menu: 'quad',
    scroll: true,
    seat: quadShowcase,
    hint: ESC_STORED,
  },
  /* A plane's rates: the manual's throws and the expo, rows only. */
  planerates: {
    classes: 'screen-page screen-pilot',
    title: 'ui.rates',
    lede: ['rates-lede', 'ui.plane_rates_lede'],
    menu: 'planerates',
    scroll: true,
    hint: ESC_STORED,
  },
  pilot: {
    classes: 'screen-page screen-pilot',
    title: 'ui.settings',
    lede: ['rates-lede', 'ui.you_and_your_sticks_rates_are'],
    menu: 'pilot',
    scroll: true,
    hint: ESC_STORED,
  },
  /* The room's rows are main.js's (friendsRows); the war's lobby sits over
   * them between matches (setWarLobby). */
  friends: {
    classes: 'screen-page screen-friends',
    title: 'friends.title',
    lede: ['rates-lede', 'friends.lede'],
    body: (shell) => [warLobby(shell)],
    menu: 'friends',
    scroll: true,
    hint: ESC_STORED,
  },
  /* The room browser and Make a room, whose rows come from
   * src/ui/roombrowser.js through roomRows; the shell keeps each block. */
  rooms: {
    classes: 'screen-page screen-rooms',
    title: 'roombrowser.title',
    lede: ['rates-lede', 'roombrowser.lede'],
    menu: (shell, block) => { shell.roomPages = { rooms: block }; },
    scroll: true,
    hint: ESC_STORED,
  },
  roomnew: {
    classes: 'screen-page screen-roomnew',
    title: 'roombrowser.new_title',
    lede: ['rates-lede', 'roombrowser.new_lede'],
    menu: (shell, block) => { shell.roomPages.roomnew = block; },
    scroll: true,
    hint: ESC_STORED,
  },
  /* The board's times for a track, from the endpoint the ghost picker
   * already calls, so seeing a record never means leaving the game. */
  standings: {
    classes: 'screen-page screen-standings',
    title: 'ui.standings',
    lede: ['rates-lede', null],
    ledeField: 'standingsLede',
    menu: 'standings',
    scroll: true,
    seat: (shell) => keep(shell, 'standingsTable', 'div', 'standings-table'),
    hint: [['Esc'], 'ui.goes_back_to_the_track_list'],
  },
  /* Laps, pack charge and flight model belong to the run, they are what a
   * lap time means (recordKey), so they are asked here, before a race. */
  launch: {
    classes: 'screen-page screen-launch',
    title: 'ui.before_you_fly',
    lede: ['rates-lede', null],
    ledeField: 'launchLede',
    menu: 'launch',
    scroll: true,
    hint: [['Enter', 'Esc'], 'ui.enter_flies_it_escape_goes_back'],
  },
  /* The rates curve beside the rows, from the numbers Betaflight flies. */
  rates: {
    classes: 'screen-page screen-rates',
    title: 'ui.rates',
    lede: ['rates-lede', 'ui.how_far_the_sticks_go_pick'],
    menu: 'rates',
    scroll: true,
    seat: (shell) => {
      shell.ratesPanel = mountRatesPanel();
      return shell.ratesPanel.root;
    },
    hint: [EDITOR_KEYS, null],
    hintField: 'ratesHint',
  },
  /* Betaflight's tuning sliders and a PID table, with the values read back
   * out of the running module beside them. */
  pids: {
    classes: 'screen-page screen-rates screen-pids',
    title: 'ui.pids',
    lede: ['rates-lede', 'ui.how_hard_the_flight_controller_works'],
    menu: 'pids',
    scroll: true,
    seat: (shell) => {
      shell.pidsPanel = mountPidsPanel();
      return shell.pidsPanel.root;
    },
    hint: [EDITOR_KEYS, null],
    hintField: 'pidsHint',
  },
  paused: {
    classes: 'screen-modal',
    title: 'ui.paused',
    menu: 'paused',
    hint: [['Esc'], 'ui.resumes_resume_is_also_the_first'],
  },
};

function menuPage(id) {
  const spec = PAGES[id];
  return (shell) => {
    const page = el('div', `screen ${spec.classes}`);
    page.append(el('h2', null, str(spec.title)));
    if (spec.lede) {
      const [cls, key] = spec.lede;
      const lede = el('p', cls, key ? str(key) : '');
      if (spec.ledeField) {
        shell[spec.ledeField] = lede;
      }
      page.append(lede);
    }
    if (spec.body) {
      page.append(...spec.body(shell));
    }
    /* The seat is made before the menu block: the panels it mounts are
     * the first thing on these pages the old build made. */
    const seat = spec.seat && spec.seat(shell);
    const block = menuBlock(Boolean(spec.scroll));
    if (typeof spec.menu === 'function') {
      spec.menu(shell, block);
    } else {
      keepMenu(shell, spec.menu, block);
    }
    if (seat) {
      block.stage.prepend(seat);
    }
    page.append(block.stage);
    if (spec.hint) {
      const [keys, key] = spec.hint;
      const hint = hintWithKeys(keys, key ? str(key) : '');
      if (spec.hintField) {
        shell[spec.hintField] = hint.querySelector('.hint-copy');
      }
      page.append(hint);
    }
    if (spec.then) {
      spec.then(shell);
    }
    return [id, page];
  };
}

/*
 * THE FLIGHT CONTROLLER BENCH, in Configurator's chrome: the yellow head,
 * the exits, a tab rail and work area, a status strip. Text leaves it
 * through Export only; there is no CLI and no import.
 */
function fcScreen(shell) {
  const brand = el('div', 'fc-brand');
  brand.append(
    el('span', 'fc-wordmark', str('ui.fc_wordmark')),
    el('span', 'fc-fw', '4.5.1'),
    el('span', 'fc-conn', str('ui.wasm')),
    keep(shell, 'fcDirty', 'span', 'fc-dirty', ''),
  );
  const head = el('div', 'fc-head');
  head.append(brand, el('p', 'fc-homage', str('ui.fc_bench_lede')));

  /* The exit buttons stop the click there: the bench's own handlers
   * underneath would otherwise read it as a press on the page. */
  const exitButton = (field, className, label, action) => {
    const b = btn(`fc-exit-btn ${className}`, str(label));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      shell.act(action);
    });
    shell[field] = b;
    return b;
  };
  const escNote = el('div', 'fc-exit-hint');
  const exits = el('div', 'fc-exit');
  exits.append(
    exitButton('fcSaveExit', 'fc-exit-save', 'ui.save_and_exit', 'fc-save-exit'),
    exitButton('fcLeave', 'fc-exit-leave', 'ui.exit_without_saving', 'fc-back'),
    escNote,
  );
  escNote.append(el('kbd', null, 'Esc'), keep(shell, 'fcExitCopy', 'span', 'fc-exit-copy', str('ui.exits_without_saving')));
  shell.fcExit = exits;

  const labelled = (field, tag, className, label) => {
    const node = keep(shell, field, tag, className);
    node.setAttribute('aria-label', str(label));
    return node;
  };
  const tabs = labelled('fcTabs', 'nav', 'fc-tabs', 'ui.configurator_tabs');
  const pages = labelled('fcPages', 'div', 'fc-pages', 'ui.pid_tuning_pages');
  pages.hidden = true;
  const block = menuBlock(true);
  keepMenu(shell, 'fc', block);
  const attitude = el('canvas', 'fc-attitude');
  attitude.width = 220;
  attitude.height = 220;
  attitude.setAttribute('aria-label', str('ui.attitude'));
  attitude.hidden = true;
  shell.fcAttitude = attitude;
  const work = el('div', 'fc-work');
  work.append(pages, block.stage, attitude);
  const body = el('div', 'fc-body');
  body.append(tabs, work);

  const screen = el('div', 'screen screen-page screen-fc');
  screen.append(head, exits, body, el('div', 'fc-status', str('ui.connected_wasm_betaflight_4_5_1')));
  return ['fc', screen];
}

/*
 * CALIBRATE STICKS. Gimbals for the four channels already learned, and a
 * raw strip with one cell per axis for the ones not learned yet (see
 * calibrationView). Every button but Cancel and Save is hidden until the
 * step that needs it: skip for a radio with no buttons on the menu switch
 * step, zero throttle and swap stick mode on the check step, reverse for
 * whatever channel is moving (movingChannel in input.js).
 */
const CAL_BUTTONS = [
  ['calCancelBtn', 'ui.cancel', 'calibrate-cancel'],
  ['calSkipBtn', 'ui.no_switch_skip', 'calibrate-skip', 'hidden'],
  ['calZeroBtn', 'ui.throttle_zero_is_here', 'calibrate-zero-throttle', 'hidden'],
  ['calRevBtn', 'ui.reverse', 'calibrate-reverse', 'hidden'],
  ['calModeBtn', 'ui.swap_stick_mode', 'calibrate-stick-mode', 'hidden'],
  ['calSaveBtn', 'ui.save_mapping', 'calibrate-save', 'disabled'],
];

function calibrateScreen(shell) {
  const screen = el('div', 'screen screen-page screen-calibrate');
  screen.append(el('h2', null, str('ui.calibrate_sticks')));
  const words = [
    keep(shell, 'calKicker', 'div', 'cal-kicker', ''),
    keep(shell, 'calPrompt', 'p', 'cal-prompt', ''),
    keep(shell, 'calHint', 'p', 'cal-hint', ''),
  ];
  shell.calStickLeft = makeGimbal(str('ui.yaw_throttle'));
  shell.calStickRight = makeGimbal(str('ui.roll_pitch'));
  const sticks = el('div', 'cal-sticks');
  sticks.append(shell.calStickLeft.box, shell.calStickRight.box);
  const axes = keep(shell, 'calAxes', 'div', 'cal-axes');
  shell.calAxisCells = [];
  const steps = keep(shell, 'calList', 'ol', 'cal-steps');

  /* All six are made before any is wired, then wired in the same order. */
  const made = CAL_BUTTONS.map(([field, label, action, start]) => {
    const b = btn(start === 'disabled' ? 'name-dialog-btn on' : 'name-dialog-btn', str(label));
    if (start) {
      b[start] = true;
    }
    shell[field] = b;
    return [b, action];
  });
  for (const [b, action] of made) {
    b.addEventListener('click', () => shell.act(action));
  }
  const actions = el('div', 'cal-actions');
  actions.append(...made.map(([b]) => b));

  screen.append(...words, sticks, axes, steps, actions, hintWithKeys(['Esc'], str('ui.cancels_nothing_is_saved_until_save')));
  shell.calCanSave = false;
  shell.calCanSkip = false;
  return ['calibrate', screen];
}

/* CHOOSE JOYSTICK. The third button backs out to the menu when the pick
 * was opened from one, and settles for the keyboard on the boot pick. */
function padpickScreen(shell) {
  const screen = el('div', 'screen screen-page screen-padpick');
  screen.append(el('h2', null, str('ui.choose_joystick')));
  const words = [
    keep(shell, 'padKicker', 'div', 'cal-kicker', str('ui.which_device')),
    keep(shell, 'padPrompt', 'p', 'cal-prompt', str('ui.move_the_joystick_you_want_to')),
    keep(shell, 'padHint', 'p', 'cal-hint', ''),
    keep(shell, 'padCards', 'div', 'pad-cards'),
  ];
  shell.padYesBtn = actionButton(shell, 'name-dialog-btn on', str('ui.yes_use_this'), 'padpick-yes');
  shell.padNoBtn = actionButton(shell, 'name-dialog-btn', str('ui.no_not_this_one'), 'padpick-no');
  shell.padSkipBtn = btn('name-dialog-btn', str('ui.use_keyboard_instead'));
  shell.padSkipBtn.addEventListener('click', () => {
    shell.act(shell.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
  });
  const actions = el('div', 'cal-actions pad-actions');
  actions.append(shell.padYesBtn, shell.padNoBtn, shell.padSkipBtn);
  screen.append(...words, actions, hintWithKeys(['Enter', 'Esc'], str('ui.enter_uses_the_highlighted_joystick_escape')));
  shell.padCardNodes = new Map();
  shell.padInfo = { count: 0, using: str('ui.keyboard') };
  shell.padPickReason = 'boot';
  shell.padPickPhase = 'wiggle';
  return ['padpick', screen];
}

/* RESULTS: the kicker, the head, the best lap as the hero, the table and
 * a note over the menu, in one copy column. */
function resultsScreen(shell) {
  const hero = keep(shell, 'resultsHero', 'div', 'results-hero');
  hero.append(
    keep(shell, 'resultsHeroCap', 'div', 'results-hero-cap', str('ui.best_lap')),
    keep(shell, 'resultsHeroTime', 'div', 'results-hero-time', ''),
    keep(shell, 'resultsHeroMeta', 'div', 'results-hero-meta', ''),
  );
  const top = el('div', 'results-top');
  top.append(
    keep(shell, 'resultsKicker', 'div', 'results-kicker', ''),
    keep(shell, 'resultsHead', 'h2', 'results-head', str('ui.run_complete')),
    hero,
    keep(shell, 'resultsBody', 'div', 'results'),
    keep(shell, 'resultsNote', 'p', 'results-note', ''),
  );
  const block = menuBlock(false);
  keepMenu(shell, 'results', block);
  const foot = el('div', 'results-foot');
  foot.append(block.stage, hintWithKeys(['Esc'], str('ui.goes_back_to_the_title_back')));
  const column = el('div', 'results-copy');
  column.append(top, foot);
  const screen = el('div', 'screen screen-results');
  screen.append(column);
  return ['results', screen];
}

/* The walkable hangar (src/ui/hangarwalk.js): nothing over the room but
 * the prompt of the station in front of the pilot; the keys are in the
 * command bar (nav.js legendFor). A drag
 * on it turns the camera round the pilot. */
function walkScreen(shell) {
  const screen = el('div', 'screen screen-walk');
  const prompt = keep(shell, 'walkPrompt', 'div', 'walk-prompt', '');
  prompt.hidden = true;
  prompt.append(el('kbd', null, 'E'), keep(shell, 'walkPromptLabel', 'span', 'walk-prompt-label', ''));
  screen.append(prompt);
  let from = null;
  screen.addEventListener('pointerdown', (e) => {
    from = e.clientX;
    screen.setPointerCapture(e.pointerId);
  });
  screen.addEventListener('pointermove', (e) => {
    if (from != null) {
      shell.walkDrag(e.clientX - from);
      from = e.clientX;
    }
  });
  screen.addEventListener('wheel', (e) => {
    e.preventDefault();
    shell.walkWheel(e.deltaY);
  }, { passive: false });
  const up = () => { from = null; };
  screen.addEventListener('pointerup', up);
  screen.addEventListener('pointercancel', up);
  return ['walk', screen];
}

/* Every screen, in the order this.screens holds them and the document
 * shows them. */
const SCREENS = [
  titleScreen,
  ...['howto', 'tricks', 'credits', 'courses', 'freestyle', 'quad', 'pilot', 'friends', 'rooms', 'roomnew', 'standings', 'launch', 'rates', 'planerates', 'pids'].map(menuPage),
  fcScreen,
  calibrateScreen,
  padpickScreen,
  menuPage('paused'),
  resultsScreen,
  walkScreen,
];

/* Makes the screens into shell.screens; mountPage puts them in the page. */
export function buildScreens(shell) {
  shell.screens = {};
  for (const make of SCREENS) {
    const [id, node] = make(shell);
    shell.screens[id] = node;
  }
}

/* A chip in the bug chip's family: a pill in a corner over the page. */
function chip(className, label, tip) {
  const b = btn(className, label);
  if (tip) {
    b.title = tip;
  }
  return b;
}

/* A status bar for the command bar: a line of words and one button. */
function statusBar(className, words, button) {
  const bar = el('div', className);
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  bar.append(words, button);
  return bar;
}

/*
 * The music dock: previous, the track's name, next. The name is the mute.
 * None of the three is a tab stop and a press never takes focus, because
 * they are pointer controls over the world and the keyboard's way to the
 * same setting is Pilot's Music row. The name stays the live region, so a
 * new track is still announced.
 */
function musicDock(shell) {
  const skip = (field, glyph, label) => {
    const b = btn('music-skip', glyph);
    b.setAttribute('aria-label', str(label));
    b.tabIndex = -1;
    shell[field] = b;
    return b;
  };
  const dock = el('div', 'music-dock');
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', str('ui.music'));
  const prev = skip('musicPrev', '‹', 'ui.previous_track');
  const next = skip('musicNext', '›', 'ui.next_track');
  const name = btn('music-title', shell.musicNow.name);
  name.setAttribute('aria-live', 'polite');
  name.tabIndex = -1;
  shell.musicTitle = name;
  dock.append(prev, name, next);
  shell.musicDock = dock;

  const noFocus = (e) => e.preventDefault();
  for (const b of [prev, next, name]) {
    b.addEventListener('mousedown', noFocus);
  }
  const press = (b, run) => b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    run();
  });
  press(name, () => shell.toggleMusicMute());
  press(prev, () => shell.skipMusic(-1));
  press(next, () => shell.skipMusic(1));
}

/*
 * What sits over the screens: the banner and the one polite live region
 * (both fed by setBanner and showResults; one region, because a second
 * would interrupt the first), the name dialog, the chips, the two status
 * bars and the music dock. syncChips decides which chips show where: the
 * bug chip everywhere but the title, Sign in on the title and never in
 * flight, Pause and the swap only in flight with no thumb sticks up.
 */
export function buildChrome(shell) {
  shell.banner = el('div', 'banner', '');
  const voice = el('div', 'sr-only', '');
  voice.setAttribute('aria-live', 'polite');
  voice.setAttribute('aria-atomic', 'true');
  voice.setAttribute('role', 'status');
  shell.announcer = voice;

  const dialog = el('div', 'name-dialog');
  dialog.hidden = true;
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');
  shell.nameDialog = dialog;

  shell.bugChip = chip('bug-chip', str('ui.report_bug_give_feedback'), str('ui.f8_also_opens_this'));
  shell.bugChip.addEventListener('click', () => shell.openBugReport());
  /* The same pause the Escape key and the thumb button ask for. */
  shell.pauseChip = chip('bug-chip pause-chip', str('ui.pause'), str('ui.escape_also_pauses'));
  shell.pauseChip.addEventListener('click', () => {
    if (shell.screen === 'flight') {
      shell.act('pause');
      shell.show('paused');
    }
  });
  shell.swapChip = chip('bug-chip swap-chip', str('ui.aircraft'), str('carousel.tab_also_opens_it'));
  shell.swapChip.addEventListener('click', () => shell.openSwap('flight'));
  /* Signed in, the callsign, opening Pilot; until then the panel
   * src/ui/accountui.js fills holds the same corner. */
  shell.signinChip = actionButton(shell, 'bug-chip signin-chip', '', 'pilot');
  shell.signinPanel = el('div', 'signin-panel');
  shell.signinPanel.hidden = true;

  /* A newer deploy is out; held off a flight like every bar here. */
  shell.updateReady = false;
  shell.barStopCount = 0;
  shell.updateReload = actionButton(shell, 'update-reload', str('update.reload'), 'update-reload');
  shell.updateBar = statusBar('update-bar', el('span', null, str('update.new_version')), shell.updateReload);
  shell.checkVersion = watchVersion((stale) => {
    shell.updateReady = stale;
    shell.syncChips();
  });

  /* The room's word to a pilot off the sticks (main.js roomBarView). */
  shell.roomBarView = null;
  shell.roomBarText = el('span');
  shell.roomBarButton = actionButton(shell, 'update-reload', '', 'room-bar');
  shell.roomBar = statusBar('update-bar room-bar', shell.roomBarText, shell.roomBarButton);

  musicDock(shell);
}

/*
 * Puts it all in the page, screens hidden until show() picks one, the
 * overlays after the screens so they read over them, and the two status
 * bars in the command bar beside the primary, where the screens' padding
 * keeps them off every card and row. Then the pickers, which add their
 * own layers to the root.
 */
export function mountPage(shell) {
  const root = shell.root;
  for (const screen of Object.values(shell.screens)) {
    screen.style.display = 'none';
    root.append(screen);
  }
  root.append(
    shell.announcer, shell.banner, shell.bugChip, shell.pauseChip, shell.swapChip,
    shell.signinChip, shell.signinPanel, shell.musicDock, shell.nameDialog,
  );
  shell.framePrimary.before(shell.roomBar, shell.updateBar);
  shell.carousel = new Carousel(root);
  shell.hangar = new Hangar(root);
  shell.progress = new Progress(shell, root);
  bindProgress(shell.progress);
  installHangarPolish();
  shell.syncChips();
}
