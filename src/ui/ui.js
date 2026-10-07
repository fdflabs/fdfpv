/*
 * ui.js: the product shell. Title, how to fly, credits, settings, pause,
 * results, stick calibration, the flight overlay, and the flight-controller screen.
 *
 * Why this exists: the page used to load straight into a falling quad with
 * a monospace debug dump in the corner. That reads as a tech demo. A
 * player arriving cold needs a title to land on, a way to start, a way to
 * learn the sticks, a way to change the few settings that matter, and a
 * result to read at the end of a run.
 *
 * Every screen is navigable from the keyboard alone and from a radio or
 * gamepad alone, except Settings and the title. On a radio there are no
 * reliable menu buttons, so the sticks drive the other menus: pitch moves
 * the cursor, roll right selects, roll left goes back. Any gamepad button
 * also selects. Title and Settings keep the sticks for the airframe, so
 * those screens are mouse and keyboard for the rows. A radio switch still
 * selects on the title. The screens say so. Rows that hold a value also
 * have a mouse control: up and down arrows for a stepped number, a
 * dropdown for a named list.
 *
 * The DOM is built here rather than in index.html so the markup and the
 * state machine that drives it sit in one file. Styling lives in
 * index.html next to the rest of the page's CSS.
 *
 * Nothing in this file touches the simulation. It reads state that the
 * shell hands it and returns the player's intent as action strings.
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

import { MAPS, mapById } from '../maps/registry.js';
import { duplicateTrack, isMapTrack, normalize, toPlain } from '../trackbuilder/model.js';
import { raceGatesOf } from '../builder/course.js';
import { planesFor } from '../game/verify.js';
import {
  CAL_STEPS, MOUSE_SENS, MOUSE_EXPOS, MOUSE_CENTRES,
} from '../input/input.js';
import {
  STICK_MODES, normaliseStickMode, stickCaption,
} from '../input/stickmode.js';
import { LINK_PRESETS } from '../input/link.js';

import { MENU_TRACKS, trackById, musicIds } from '../render/tracks.js';
import { PERF_MODES } from '../render/dynres.js';
import { CUSTOM_TUNE, TUNES, tuneById } from '../../configs/registry.js';
import { AIRFRAME_IDS, airframeById, currentAirframeId, DEFAULT_AIRFRAME, floatVersionOf, isFloatVersion, landPlaneOf } from '../../configs/airframes.js';
import { POWER, powerChoice } from '../../configs/power.js';
import { PROPS, normaliseParts } from '../../configs/hangar-parts.js';
import { combatChoice } from '../../configs/combat.js';
import { Carousel, cycleCraft, flightTimeText, kindOf } from './carousel.js';
import { Hangar } from './hangar.js';
/* Registers the hangar's Tuning tab, then the Parts tab. */
import './hangar-tuning.js';
import './hangar-parts.js';
import './hangar-combat.js';
/* Registers the Challenges tab, after the tabs that edit the plane. */
import { Progress, bindProgress } from './progress-ui.js';
import { installHangarPolish } from './hangar-polish.js';
import { liveryKey, lookFor, paintable } from '../../configs/liveries.js';
import {
  BUILD_PREFIX, MAX_BUILDS, checkBuildName, customisable, familyFitted, fitBuild, fitOf, fittedBuild, loadBuilds, newBuildId, normaliseFit,
  putFit, saveBuilds, setStockFit, stockFit, unfitFamily,
} from './builds.js';
import {
  RATE_DEFAULTS,
  RATE_FIELDS,
  RATE_TYPES,
  RATE_TYPE_LABEL,
  THROTTLE_CAP_CHOICES,
  THROTTLE_CURVE_FIELDS,
  formatRate,
  fullStickDeg,
  hoverStickPercent,
  normaliseRates,
  profileForType,
  rateField,
  ratesAreDefault,
  ratesSummary,
  throttleSummary,
} from '../../configs/rates.js';
import {
  PRESET_NAME_MAX,
  RATES_STORAGE_WARNING,
  deleteRatePreset,
  listRatePresets,
  presetMatching,
  presetNamed,
  ratePresetById,
  saveRatePreset,
} from '../../configs/ratepresets.js';
import {
  PID_AXES,
  PID_FIELDS,
  PID_FIELD_SPECS,
  SLIDER_KEYS,
  SLIDERS,
  clearPidsFor,
  pidsAdjusted,
  pidsEntry,
  pidsSummary,
  setPidSlider,
  setPidsExpert,
} from '../../configs/pids.js';
import {
  boardConfigured, boardPageUrl, fetchTrackDocument, fetchTrackList, fetchTrackTimes, pickFeaturedTracks,
} from '../share/board.js';
import { TrickFilmPlayer, filmFor, VIEW_LABEL } from './trickfilm.js';
import { BOARD_WINDOW, openNamedWindow } from '../share/windows.js';
import { BUG_KINDS, submitBug } from '../share/bugs.js';
import { crashRecord } from '../share/crashrecord.js';
import { flightTotals } from '../share/flighttime.js';
import { boardFlightSeconds } from '../share/stats.js';
import { createShotTray } from './bugshots.js';
import { watchVersion } from './update.js';
import { nameRules, readAccount, readPilotName, writePilotName } from '../share/pilot.js';
import { accountsAvailable, mayPlay, needSignIn } from '../share/account.js';
import { hasFlyableTrack, inspectCourse } from '../share/listing.js';
import { activeCourseSummary } from '../share/summary.js';
import {
  lapSlot,
  readPendingTime,
  readPostedBest,
  writePendingTime,
  /* My tracks seats the pilot's own tracks (seatLocal) and clears a deleted
   * one out of the seat. A board track's seat is written by main.js, which
   * owns the fetch. */
  clearShareImport,
  readBind,
  readEditKey,
  readShareImport,
  writeShareImport,
} from '../share/session.js';
import {
  clipKeyForMap,
  getClip,
  putClip,
  makeClipElement,
  recordCanvasStream,
  withCaptureLock,
  whenVisible,
  CLIP_MS_MAX,
  CLIP_W,
  CLIP_H,
} from '../share/orbitcache.js';
import {
  GRAPHICS_IDS,
  graphicsLabel,
  graphicsNote,
  normalizeGraphics,
} from '../render/quality.js';
import {
  CAMERA_FOVS,
  CAMERA_FOV_DEFAULT,
  CAMERA_ANGLE_MIN,
  CAMERA_ANGLE_MAX,
  CAMERA_ANGLE_DEFAULT,
  cameraTiltRad,
  clampCameraAngle,
} from '../render/lens.js';
import { ScoreHud } from './scorehud.js';
import { MARK_STYLES } from './peermarks.js';
import { formatScore } from '../game/score.js';
import { fillCredits } from './credits.js';
import { mountRatesPanel } from './ratespanel.js';
import { mountPidsPanel } from './pidspanel.js';
import { touchWanted } from '../input/touchsticks.js';
import {
  downloadCli, drawAttitude, FcSession, paintPageStrip, paintTabStrip,
} from './fc.js';
import { str, plural, LOCALES, LOCALE_NAMES, currentLocale, rememberLocale } from '../strings/index.js';
/* The pilot's own tracks live in this browser's library, and My tracks
 * lists, copies, renames and deletes them there. */
import {
  deleteTrack, listMapTracks, loadMapTrack, readOnlineStates, saveTrack,
} from '../trackbuilder/storage.js';
/* Everybody's tracks, on the tracks server (src/share/cloud.js). */
import {
  TRACK_SYNC_EVENT, fetchAllTracks, fetchTrack, pilotKey, pullOwnTracks, tracksConfigured,
} from '../share/cloud.js';
import {
  SETTINGS_KEY, FLIGHT_MODES, PACK_VOLTAGES, LAP_COUNTS, RENDER_SCALES, FPS_CAPS, LATENCY_MODES, HUD_STYLES,
  hudStyleFor, FLIGHT_STYLES, WEIGHT_MIN, WEIGHT_MAX, WEIGHT_STEP, WEIGHT_STOCK, clampWeight, gravityScaleFor,
  FREESTYLE_SCORING, AVX_INSETS, AVX_LEVELS, AVX_PALETTES, loadSettings, FIRST_AIRFRAME, normaliseFloats, withFloats,
  seatAirframe, DEFAULTS, saveSettings, airHintSeen, markAirHintSeen, detectFirstRun, tuneChoices,
} from './settings.js';
import {
  choice, cycle, fitsAsSegments, number, stampIds, stepper, toggle,
} from './rows.js';
import {
  WAYS, GATE_WAYS, HUBS, OPEN_ACTIONS, hubWays, hubOfAction, seatedWay, wayFilter, boardCraft, craftSvg, reticleSvg,
} from './ways.js';
import { formatDay, formatDelta, formatRunClock, formatTime } from './format.js';
import {
  btn, el, hintWithKeys, keyHowtoRows, makeGimbal, makePadCard, makeWeightSlider, placeNub, placeSticks, thrNote, wordmark,
} from './widgets.js';
import { scoreableTricks, trickStatus } from './trickslist.js';
/* scripts/modes-selftest.js reads the table from here, and the HUDs and
 * main.js read the clock formats. */
export { WAYS, formatRunClock, formatTime };

/* Whether a Flight controller save exists, which is what puts Your edits
 * on the Tune row. Read fresh each time: the pilot can save one two rows
 * away from the row that offers it. */
/*
 * Which actions leave for another tab, and which open another screen. The row
 * grammar reads these to decide a row's kind, so a new action that forgets to
 * appear here renders as a plain action, which is the safe default: it gets no
 * chevron it has not earned.
 */
const LINK_ACTIONS = new Set(['leaderboard']);
const SCREEN_ACTIONS = new Set([
  'courses', 'race', 'freestyle', 'pilot', 'quad', 'launch', 'standings', 'rates', 'pids', 'fc',
  'howto', 'tricks', 'credits', 'trackbuilder', 'remix', 'editown', 'choosepad',
  'calibrate', 'friends', 'rooms', 'roomnew',
]);

/* What the breadcrumb says, per screen. A room is a navigation parent, so a
 * trail rather than a single word: Escape then has one obvious destination
 * instead of the four the return chain currently chooses between. */
/*
 * Screens a room can be opened FROM and returned to. The launch card and
 * My tracks carry doors into Quad and Pilot; the title is not here
 * because it is where Back goes when there is nowhere else to go.
 */
export const ROOM_PARENTS = new Set(['courses', 'freestyle', 'launch', 'quad', 'pilot']);

export const SCREEN_TITLES = {
  title: str('ui.product_name'),
  courses: str('ui.my_tracks'),
  freestyle: 'Freestyle',
  pilot: 'Settings',
  quad: 'Quad',
  launch: str('ui.before_you_fly'),
  standings: 'Standings',
  rates: 'Rates',
  pids: 'PIDs',
  fc: str('ui.firmware_bench'),
  paused: 'Paused',
  results: str('ui.run_complete'),
  howto: str('ui.how_to_fly'),
  tricks: str('ui.trick_list'),
  credits: 'Credits',
  friends: str('friends.title'),
  rooms: str('roombrowser.title'),
  roomnew: str('roombrowser.new_title'),
};
const CRUMBS = {
  courses: [str('ui.track_mode'), str('ui.my_tracks')],
  freestyle: [str('ui.freestyle')],
  pilot: [str('ui.settings')],
  quad: [str('ui.quad')],
  launch: [str('ui.before_you_fly')],
  standings: [str('ui.race'), str('ui.standings')],
  rates: [str('ui.settings'), str('ui.rates')],
  pids: [str('ui.quad'), 'PIDs'],
  fc: [str('ui.quad'), str('ui.firmware_bench')],
  paused: [str('ui.paused')],
  results: [str('ui.run_complete')],
  howto: [str('ui.how_to_fly')],
  tricks: [str('ui.freestyle'), str('ui.trick_list')],
  credits: [str('ui.credits')],
  friends: [str('friends.title')],
  rooms: [str('friends.title'), str('roombrowser.title')],
  roomnew: [str('friends.title'), str('roombrowser.title'), str('roombrowser.new_title')],
  title: [str('ui.product_name')],
};

/*
 * The freestyle world the pilot is SEATED in, or null when the seat is a
 * track. The Map row on the title reads this rather than the remembered id,
 * because a row on the front page has to name what Fly would launch, and
 * those two are not the same thing the moment somebody backs out of the
 * world picker without choosing.
 */
export function seatedFreestyleMap(s) {
  const m = MAPS.find((x) => x.id === (s && s.map));
  return m && m.mode === 'freestyle' ? m : null;
}

/* The profile's fields, choices and rules live in ./settings.js; main.js,
 * accountui.js and the scripts import them from here. */
export {
  SETTINGS_KEY, FLIGHT_MODES, CAMERA_FOVS, CAMERA_FOV_DEFAULT, CAMERA_ANGLE_MIN, CAMERA_ANGLE_MAX, CAMERA_ANGLE_DEFAULT, PACK_VOLTAGES,
  LAP_COUNTS, RENDER_SCALES, FPS_CAPS, LATENCY_MODES, HUD_STYLES, hudStyleFor, FLIGHT_STYLES, WEIGHT_MIN,
  WEIGHT_MAX, WEIGHT_STEP, WEIGHT_STOCK, clampWeight, gravityScaleFor, FREESTYLE_SCORING, AVX_INSETS, AVX_LEVELS,
  AVX_PALETTES, loadSettings, FIRST_AIRFRAME, normaliseFloats, withFloats, seatAirframe,
};

export const FREESTYLE_SCORING_LABEL = { off: 'Off', free: str('ui.free_flight'), scored: str('ui.scored_run') };

/*
 * THE WARNING, and it comes FIRST when scoring is on, because a row wearing
 * row-warn owes the pilot the reason before it offers them anything. The
 * argument for it is at DEFAULTS.freestyleScoring.
 */
const SCORING_WARNING = str('ui.this_is_an_unfinished_feature_and')
  + str('ui.the_recogniser_misses_tricks_it_should')
  + str('ui.the_ones_it_catches_so_read')
  + str('ui.on_your_flying');

const SCORING_HOW = str('ui.off_no_overlay_no_names_and')
  + str('ui.free_flight_tricks_are_named_and')
  + str('ui.board_and_the_run_never_ends')
  + str('ui.scored_run_two_minutes_on_the')
  + str('ui.score_board');

export function scoringNote(mode) {
  return mode === 'off' ? SCORING_HOW : `${SCORING_WARNING} ${SCORING_HOW}`;
}

/*
 * WHO TO NAME ON A TRACK, IN ONE PLACE.
 *
 * A board track's `author` is the account that published it. On a track
 * somebody built themselves those are the same person. On the eight RaceGOW5
 * rooms they are not: six other people designed them and one brought them
 * over, and the designer is in the track's own credit block, which the board
 * passes through now. So the line names the builder where the board knows
 * one, and the publisher otherwise. The detail pane still says both.
 */
export function byLine(t) {
  if (t && t.designer) {
    return str('ui.by', { designer: t.designer });
  }
  return t && t.author ? str('ui.by_2', { author: t.author }) : '';
}

/* A picker card drawn in a fit rather than in the slots, a My Hangar
 * build's or a stock plane's kept aside (src/ui/builds.js), as
 * src/render/carousel3d.js takes it: the model's own key, its look, what
 * it is fitted with and a combat quad's loadout. */
function drawnFit(key, id, fit) {
  const parts = PROPS[id] ? { prop: 'stock', addons: [], damage: null, ...(fit.parts ?? {}) } : null;
  return {
    key,
    look: lookFor(id, fit.livery),
    fit: parts ? { id, entry: parts, option: POWER[id] ? powerChoice(id, { [id]: fit.power }).option : null } : null,
    combat: fit.combat ?? null,
  };
}

/* A menu plus a side column for its note, so the note cannot resize the rows. */
function wrapMenu() {
  const stage = el('div', 'menu-stage');
  const menu = el('div', 'menu');
  /* The rows inside are options, so the box around them has to be the
   * listbox or the role means nothing to a reader. See renderMenu. */
  menu.setAttribute('role', 'listbox');
  const help = el('div', 'menu-help');
  stage.append(menu, help);
  return { stage, menu, help };
}

/*
 * IS THE THING IN THE SEAT A RACE?
 *
 * The launch card is for a measured run: it exists to say what a lap time
 * counts as. Freestyle has no clock, no lap, no ghost and no board, so a
 * card in front of it would be ceremony, and the Freestyle room was built
 * without one for exactly that reason.
 *
 * The predicate is GATE COUNT, which is the same signal the Race and
 * Freestyle rooms split on and the same one the renderer uses: a designed
 * course with no stations is a freestyle flight, no lap and no gate HUD.
 * Not MAPS[].mode, which nothing but a debug hook reads and which would
 * file a gateless published track under Race and then promise it a clock it
 * cannot deliver.
 */
export function seatIsRace(s) {
  const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
  if (m.mode === 'freestyle') {
    return false;
  }
  const seat = activeCourseSummary();
  return Boolean(seat && seat.gates > 0);
}

/*
 * THE RADIO DEAD END, SAID OUT LOUD AND MADE FIXABLE.
 *
 * Two states leave a pilot with a radio they cannot use, and neither of them
 * says anything today: the cursor moves and nothing else happens, which
 * reads as a broken product rather than as a radio that needs a minute.
 *
 * NO BUTTONS. Every switch on this radio arrives as an axis, so
 * padMenuButtons has nothing to read and select is permanently false. It is
 * the harder of the two, because the fix, calibration, is itself a menu row
 * that has to be selected. input.js answers that with a hold, and this row
 * is where a pilot finds out that is the gesture.
 *
 * NOT CALIBRATED. navRaw deliberately gives up and down only, because it
 * cannot tell pitch from roll without a map. So the cursor moves and no
 * value row can be adjusted: half a menu. Calibrating is the whole fix.
 *
 * It is a ROW, not a floating panel, and it is row zero. That gets it first
 * in the focus order for free, gives it the help column, the cursor, the
 * click target and the row grammar without any of them being special cased,
 * and makes Enter on it go to the one screen that fixes the thing it is
 * complaining about. A banner nobody can focus is a banner a radio pilot
 * cannot act on, which would be the same joke twice.
 */
export function padTroubleItem(info) {
  if (!info || !info.count || info.using === 'Keyboard') {
    return null;
  }
  if (!info.buttons && !info.hasSelect) {
    return {
      label: str('ui.your_radio_has_no_buttons_this'),
      action: 'calibrate',
      rowClass: 'row-warn',
      note: str('ui.every_switch_on_it_is_arriving')
        + str('ui.hold_any_stick_away_from_centre')
        + str('ui.which_is_enough_to_get_in')
        + str('ui.to_throw_the_switch_you_want'),
    };
  }
  /*
   * A GUESS THAT IS WORKING IS NOT A PROBLEM, AND THIS USED TO SAY IT WAS.
   *
   * The test was `map.stored`, which records whether somebody has been
   * through the wizard. It is not a fact about the mapping. A pilot with a
   * transmitter in AETR joystick mode, which is what this page's own advice
   * tells them to set, plugs it in, flies the quad correctly with the built
   * in guess, and never opens the wizard because nothing is wrong. They got
   * a red row at the top of the front page, on every visit, telling them
   * their radio was not calibrated. Reported as a bug, and it was one: the
   * row was reporting on a flag rather than on the radio.
   *
   * info.mapUsable is the observation instead, and it is about the machine:
   * a real throttle is parked off centre because it has no centring spring.
   * See noteThrottleParked in src/input/input.js. When it is true the guess
   * has been seen behaving like a radio, the menus let the sticks move left
   * and right, and there is nothing left to warn about.
   *
   * When it is false the warning is EARNED and says what was observed, not
   * what a flag holds: a spring centred axis where the throttle should be is
   * a gamepad or a radio in some other order, and that pilot is about to
   * take off at half power on a stick that springs back.
   *
   * A standard gamepad on its own default is neither: the browser has said
   * where its sticks are and input.js has put the channels there. See
   * standardPadMap. info.mapKnown says so.
   */
  if (!info.calibrated && !info.mapKnown && !info.mapUsable) {
    return {
      label: str('ui.this_browser_is_guessing_your_stick'),
      action: 'calibrate',
      rowClass: 'row-warn',
      note: str('ui.the_axis_it_thinks_is_your')
        + str('ui.throttle_rests_at_one_end_because')
        + str('ui.probably_wrong_and_a_wrong_guess')
        + str('ui.that_springs_back_calibrating_takes_about'),
    };
  }
  /*
   * THE GUESS CAN PASS THE THROTTLE QUESTION AND STILL HAVE NO YAW.
   *
   * The row above is the only thing that was ever asked about the guess,
   * and it asks about one axis. A radio whose throttle is where AETR says
   * and whose yaw is not gets a silent shell and a quad that will not spin,
   * which is three tickets on the board and none of them knew what to call
   * it. input.js watches for it directly: see noteGuessOrder.
   *
   * It comes after the throttle row rather than before it because a quad
   * taking off at half power on its own is the worse surprise of the two,
   * and in practice only one of them can be true at a time anyway.
   */
  if (!info.calibrated && info.guessNoYaw) {
    return {
      label: str('ui.this_browser_cannot_see_your_yaw'),
      action: 'calibrate',
      rowClass: 'row-warn',
      note: str('ui.the_axis_it_guessed_was_yaw')
        + str('ui.know_about_has_been_swept_end')
        + str('ui.in_some_order_other_than_the')
        + str('ui.lost_is_yaw_calibrating_takes_about')
        + str('ui.is_which'),
    };
  }
  return null;
}

function hasLoadedTrack() {
  return hasFlyableTrack();
}

/* Screens whose choices are drawn as cards above the row list. The rows
 * that remain are whatever is not a card.
 *
 * The title is not in here because it is a card screen only SOMETIMES: the
 * gate draws two, the menu behind it draws none and carries a Ghost row
 * whose left and right arrows have to keep adjusting rather than moving.
 * Ui.cardScreen() is the predicate that knows both. */
function isCardScreen(screen) {
  /* Both pickers lay their choices out in a row. */
  return screen === 'courses' || screen === 'freestyle';
}

/* What the seated track is to the board, or null when nothing is seated. */
export function liveListing() {
  try {
    const course = inspectCourse();
    return course && course.kind !== 'none' ? course : null;
  } catch (e) {
    return null;
  }
}

/*
 * The plane a lap by `airframe` on this track is filed under on the board,
 * or '' for every lap that is not a plane's on a track built inside a world
 * (src/game/verify.js planesFor): those go where they always went.
 */
export function lapCraftOf(doc, airframe) {
  const af = airframeById(airframe);
  return af.fixedWing && doc && doc.schemaVersion >= 4 && isMapTrack(doc) ? af.id : '';
}

/*
 * A track card's identity, stable across the rebuilds items() does on every
 * render. The card objects themselves are made fresh each time, so the chosen
 * card is remembered by this key rather than by reference.
 */
export function courseCardKey(card) {
  if (!card || !card.course) {
    return null;
  }
  return `${card.course.kind}:${card.course.track.id}`;
}

/*
 * The world a track stands in, or null when this build no longer has it:
 * a track on a retired world is listed as retired rather than as a card
 * that loads nothing, because mapById answers an unknown id with another
 * world.
 */
export function liveWorld(mapId) {
  const entry = mapById(mapId);
  return entry.id === mapId && entry.build ? entry : null;
}

/*
 * Another pilot's track from the tracks server: fly it, or edit a copy of
 * it, which is the pilot's own from the first save. Editing the original is
 * not offered because it is not theirs: the server would refuse the save.
 */
function cloudCardRows(subject) {
  const t = subject.course.track;
  const name = subject.label;
  const world = liveWorld(t.map);
  const rows = [{ label: name, section: true }];
  if (!world) {
    rows.push({ label: str('cloud.retired_world'), section: true });
  } else {
    rows.push(
      { label: str('ui.play'), action: 'card-fly', note: str('ui.race_it_in', { name, world: world.name }) },
      { label: str('cloud.edit_a_copy'), action: 'card-editcopy', note: str('cloud.edit_a_copy_note', { name }) },
    );
  }
  rows.push({ label: str('ui.back_to_the_list'), action: 'card-back' });
  return rows;
}

/*
 * WHAT ONE TRACK CARD CAN DO, once the player has chosen it.
 *
 * Choosing a card names it and lists what can be done with it, rather than
 * flying it on the spot. Play is first, so the common path is Enter then
 * Enter. One of the pilot's own can be played, edited in the builder,
 * renamed, duplicated and deleted; one from the board can be played, copied
 * into My tracks to build on, and its times read.
 */
export function courseCardRows(subject) {
  if (subject.course.kind === 'cloud') {
    return cloudCardRows(subject);
  }
  const board = subject.course.kind === 'board';
  const name = subject.label;
  const world = mapById(subject.course.track.map).name;
  const rows = [
    /* The list says whose it is. The chosen card is marked as well, but a
     * colour is not a label, and this list sits far enough below the strip
     * that the two want joining in words. Not a cursor stop. */
    { label: name, section: true },
    {
      label: str('ui.play'),
      action: 'card-fly',
      note: board
        ? str('ui.load_from_the_board_and_fly', { name })
        : str('ui.race_it_in', { name, world }),
    },
  ];
  if (board) {
    rows.push({
      label: str('ui.duplicate'),
      action: 'card-duplicate',
      note: str('ui.copy_it_into_my_tracks_board', { name }),
    });
    rows.push({
      label: str('ui.standings'),
      action: 'card-standings',
      note: str('ui.every_time_posted_on_fastest_first', { name }),
    });
    rows.push({
      label: str('ui.open_on_the_web'),
      action: 'card-board',
      note: str('ui.the_public_page_for_a_link', { name }),
    });
  } else {
    rows.push(
      {
        label: str('ui.edit'),
        action: 'card-edit',
        note: str('ui.open_it_in_the_builder_in', { name, world }),
      },
      {
        label: str('ui.rename'),
        action: 'card-rename',
        note: str('ui.give_it_a_name_you_will', { name }),
      },
      {
        label: str('ui.duplicate'),
        action: 'card-duplicate',
        note: str('ui.a_copy_to_change_without_touching', { name }),
      },
      {
        label: str('ui.delete_label'),
        action: 'card-delete',
        note: str('ui.take_it_out_of_this_browser', { name }),
      },
    );
  }
  rows.push({ label: str('ui.back_to_the_list'), action: 'card-back' });
  return rows;
}

/*
 * The aircraft row: the top of the Quad screen and the only way to change
 * the answer the first run gate asked.
 *
 * It carries the loudest note on the screen because it is the loudest
 * change on the screen. Everything else here adjusts one machine; this one
 * swaps the machine, and it takes the tune, the pack charge and the camera
 * with it because none of those means anything on the other aircraft. It
 * also changes what a track IS: a whoop flies a 1.22 by 1.83 m RaceGOW room,
 * a five inch flies a sixty metre field and a wing flies an airfield, so
 * the seated track goes with it too.
 */
/*
 * During a run the row SWAPS the aircraft in place (src/main.js hotSwap)
 * rather than seating it for the next one, so it no longer carries the
 * start line warning: `swap` is the shell's, and absent between runs.
 * Enter and a click open the picker (src/ui/carousel.js) through `open`,
 * which the screen adds because it needs the Ui.
 */
export function craftItem(s, swap, shown = s.airframe) {
  const af = airframeById(shown);
  return {
    ...choice(
      str('ui.aircraft'),
      str('ui.changing_it_loads_that_machine_s', { blurb: af.blurb, v3: swap ? ` ${str('carousel.in_place')}` : '' }),
      AIRFRAME_IDS,
      shown,
      (id) => airframeById(id).name,
      (id) => {
        if (swap) {
          swap(id);
        } else {
          seatAirframe(s, id);
        }
      },
    ),
    pickOnly: true,
  };
}

/*
 * Where the camera tilt starts costing enough yaw to be worth a word, and
 * what to offer instead. 40 is where sin(t) passes 0.64, so nearly two
 * thirds of a yaw becomes picture roll; 500 puts a 40 degree mount back to
 * roughly what 30 degrees feels like at the stock rate. Both measured, see
 * PROGRESS.md.
 */
export const YAW_TIP_RATE = 500;

/*
 * `#credits` is a real address. World load, a map swap and the constructor
 * all call show('title'). If those calls are allowed to win, the hash is
 * stripped (replaceState does not fire hashchange) and the visitor lands
 * on Fly. The hash wins until the pilot backs off it.
 */
function locationHashScreen() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return h === 'credits' ? 'credits' : null;
}

/*
 * RACE OR FREESTYLE, WHEN THE LINK ALREADY SAID.
 *
 * The gate is a question, and a question that has been answered must not be
 * asked again: the board's links carry ?share=id, and a chase link carries
 * ?ghost=id. Each is somebody arriving with the thing they want to fly
 * already named, so the gate would be a screen in front of a decision they
 * made on another page.
 *
 * Only the link answers it. A stored setting deliberately does not, which is
 * the whole point of the gate: see the constructor.
 */
function linkedMode() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    /* No URL to read. The gate asks. */
    return null;
  }
  if (params.get('share') || params.get('ghost')) {
    return 'race';
  }
  const wanted = params.get('map');
  const m = wanted ? MAPS.find((x) => x.id === wanted) : null;
  if (!m) {
    return null;
  }
  return m.mode === 'freestyle' ? 'freestyle' : 'race';
}

/*
 * The aircraft, when a link names it. Same rule as linkedMode: somebody
 * arriving from the builder or the board with a whoop track in hand has
 * already answered the question, so asking it would be a screen in front of
 * a decision they made on another page.
 *
 * Returns an airframe id or null. Unknown values are null rather than a
 * fallback, because "the link said something I do not understand" and "the
 * link said nothing" should both end up asking.
 */
function linkedCraft() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return null;
  }
  const wanted = currentAirframeId(params.get('craft'));
  return AIRFRAME_IDS.includes(wanted) ? wanted : null;
}

function clearLocationHash() {
  const url = new URL(window.location.href);
  if (!url.hash) {
    return;
  }
  url.hash = '';
  history.replaceState(null, '', url);
}

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.firstRun = detectFirstRun();
    /*
     * WHAT THIS SESSION IS FOR, which is half of the one question the front
     * door asks. The other half is which aircraft, below, and one card on
     * the gate answers both: see WAYS.
     *
     * 'race', 'freestyle', or null for "not asked yet", which is one of the
     * two ways the gate is up.
     *
     * It is NOT in the settings blob and is deliberately not remembered.
     * The two are not a preference, they are what this session is for: the
     * same pilot races on Tuesday and messes about on Wednesday, and a
     * remembered answer would put whichever they did last in front of them
     * as a fact rather than a choice. It costs one keypress a visit and it
     * buys a front page that is about the thing they came to do.
     *
     * What it buys the menu behind it is the removal of a choice that was
     * being made twice. Race and Freestyle were two rows on the title, each
     * naming a place, so the pilot picked a mode by picking a location and
     * the front page carried both. With the mode already answered there is
     * one row, and it names the track or the map, which is the only part
     * still open.
     *
     * A link that names what to fly answers it without asking: see
     * linkedMode. The gate is up while EITHER half is unanswered, which is
     * what onGate() says, so a link has to answer both to skip it.
     */
    this.mode = linkedMode();
    /*
     * WHICH AIRCRAFT, the other half.
     *
     * It used to be a gate of its own IN FRONT of Race or Freestyle, on the
     * argument that the two questions are not the same shape. They are not,
     * but between them they have three legal answers, and asking twice for
     * three answers cost a press and made what the second screen asked
     * depend on what the first one answered. One gate, three cards: WAYS.
     *
     * The answer IS remembered, in settings.airframe, because the aircraft
     * is a preference rather than a statement about today. What is not
     * remembered is that the question was asked: the gate is the root of the
     * menu and it opens every visit. See craftGate below.
     */
    const linkedAf = linkedCraft();
    if (linkedAf) {
      /*
       * seatAirframe alone, and NOT an assignment to settings.airframe first.
       * It used to be both, and the assignment defeated the seat: seatAirframe
       * reads the aircraft it is moving FROM off settings.airframe to decide
       * whether the rates and the throttle cap are still that machine's stock
       * ones, and with the destination already written in, from and to were
       * the same aircraft. A ?craft=whoop65 link on a five inch profile flew
       * the whoop on 670 degree rates with no cap until the next reload.
       */
      seatAirframe(this.settings, linkedAf);
      this.settings.airframeAsked = true;
      saveSettings(this.settings);
    }
    /*
     * THE GATE IS THE ROOT MENU, every visit and not only the first.
     *
     * The aircraft used to be a first run question: answer it once and it
     * never came back, and the only way to change aircraft after that was
     * three rows deep under Quad. That made the whoop half of this product
     * something a pilot had to already know existed. It is not a setting
     * inside the experience, it IS the experience, so it is on the first
     * thing the title asks and on the thing Escape backs out to.
     *
     * This flag is the aircraft's half of "has the gate been answered". It
     * is false when a link named the aircraft, and the gate still opens
     * unless the mode is answered too, which is what onGate() decides.
     *
     * airframeAsked still matters: it is what lets a LINK carrying ?craft=
     * skip straight past this, and it is what the choice screen writes so
     * the seated aircraft is a real answer rather than a default.
     */
    this.craftGate = !linkedAf;
    /* The hub the gate shows, or null for home (the three hub cards). */
    this.hub = null;
    /* Set while a guided first flight is in the air. main.js reads it. */
    this.guided = false;
    /* The room game a title card preselected; see act()'s ways. */
    this.roomGame = null;
    this.boardCourses = [];
    /* The pilot's own tracks, read off this browser's library on entry to
     * My tracks. This and the board's above are the two things that screen
     * lists. See loadLocalCourses. */
    this.localCourses = [];
    /* Everybody else's tracks on the tracks server, newest save first, a
     * page at a time (loadCloudCourses), and where the next page starts. */
    this.cloudCourses = [];
    this.cloudNext = '';
    /* The standings screen's subject and its times. null means "not asked
     * yet", which paintStandings draws as Reading the board; an empty array
     * means the board answered and there are none. */
    this.standingsFor = null;
    this.standingsTimes = null;
    this.standingsError = '';
    /* The Ghost row's contents, pushed by the shell through setGhostRow,
     * because the shell is the side that knows what can be chased. Null
     * hides the row, which is every freestyle map. */
    this.ghostRow = null;
    this.liveRow = null;
    this.boardLoading = false;
    this.openingBoardCourse = false;
    this.onBoardCourse = null; /* (track) => Promise<boolean> */
    this.screen = 'title';
    /* Which device the pilot last touched, so the command bar prints that
     * device's glyphs. Showing keyboard and pad prompts at once is twice the
     * noise and half the answer.
     *
     * 'none' until something is pressed, and that is not a nicety: it used
     * to start at 'key', so a phone, which never sends a key, was
     * indistinguishable from a keyboard and got told to press Enter. The
     * legend reads this to choose a third voice on a touch screen that has
     * not heard from a keyboard or a pad. Everywhere else treats it exactly
     * as it treated 'key'. */
    this.lastInput = 'none';
    /* Screen id to the label of the row the cursor was on. See restoreCursor. */
    this.cursorMemory = {};
    /* The id of the row the cursor is on. The durable half of the cursor:
     * the index says where the row is right now, this says which row it is.
     * See syncCursor and restoreFocusRow. */
    this.focusId = null;
    this.cursor = 0;
    /*
     * On the gate the cursor starts on the card that is SEATED, so a
     * returning whoop pilot sees their own answer under the cursor and two
     * presses of Enter from a cold start put them back where they were.
     * renderMenu only re-picks when the cursor has fallen off the list, and
     * zero is a valid row here, so the first paint has to be told.
     */
    if (this.craftGate || !this.mode) {
      const at = GATE_WAYS.findIndex((w) => w.id === seatedWay(this.settings, this.mode).id);
      this.cursor = at >= 0 ? at : 0;
    }
    /* Which course card the player has chosen, by courseCardKey, and the
     * last one they were on. The first says whose list is showing; the
     * second is where Back to the list puts the cursor. */
    this.cardSubject = null;
    this.lastCardKey = null;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.onMusicSkip = null; /* (dir) => void, -1 previous, +1 next */
    /* (screen) => void, fired by show(). The shell hangs the music
     * context off this: the flight crate plays on a flight, the menu bed
     * everywhere else, and this file is the only side that knows which of
     * those is up. */
    this.onScreenChange = null;
    {
      /*
       * A placeholder for the dock until main.js pushes the player's real
       * status, which it does before the first gesture. It is a MENU
       * record because a visit opens in the menus and the menu bed is
       * what will be playing; the Music track setting names a flight
       * record, so it is not the answer to this question even when it is
       * pinned. Which of the two is a roll on the player, so this is
       * MENU_TRACKS[0] rather than a second roll that would disagree with
       * it for one frame. An empty menu crate names nothing.
       */
      const tr = MENU_TRACKS[0] ?? { id: '', name: '' };
      this.musicNow = {
        id: tr.id,
        name: tr.name,
        selection: this.settings.musicTrack,
        index: 0,
        context: 'menu',
      };
    }
    /* Where the live sticks are, for the Rates curve. Written by the frame
     * loop through paintRates, read by the panel on every redraw. */
    this.ratesStick = { roll: 0, pitch: 0, yaw: 0 };
    /* Asked at most once a session, so oscillating across 40 does not nag. */
    this.yawTipAsked = false;
    /*
     * Which room a ROOM was opened from, so Escape goes back to it.
     *
     * Same contract as ratesFrom below, and needed for the same reason: the
     * Race and Freestyle rooms both carry a Tune row that is a door into
     * Quad, and act('quad') set returnTo to 'title' from anywhere that was
     * not paused. So changing a tune from Freestyle and pressing Back
     * landed on the title rather than the room you were standing in, which
     * is a one way door dressed as a signpost.
     *
     * Separate from returnTo on purpose: returnTo is where the pause chain
     * came from, and overwriting it here strands a paused run.
     */
    this.roomFrom = null;
    /* Set when Rates was opened FROM Settings, so Escape lands back on the
     * list it was a row of. Separate from returnTo on purpose: returnTo is
     * where Settings itself came from, and overwriting it here would lose a
     * paused origin two screens up. */
    this.ratesFrom = null;
    /* Same contract for the PIDs screen. */
    this.pidsFrom = null;
    /* And for the flight controller: which list its row was on, so Escape
     * lands back there without disturbing the pause chain in returnTo. */
    this.fcFrom = null;
    /* The module readback the PIDs screen draws from; see setPidsLive. */
    this.pidsLive = null;
    /* A refused preset write, shown as one amber row in the Rates room and
     * cleared the moment the room is entered or a write succeeds. Not a
     * setting: it describes this browser's last answer, not the pilot's. */
    this.ratesNotice = null;
    /*
     * The flight-controller editor. The session holds the draft dump and
     * builds the rows; the shell owns what Save means through onFcSave.
     */
    this.onFcOpen = null;    /* (page) => void */
    this.onFcSave = null;    /* (draft, { restart, exit, presetId }) => void */
    this.onFcAngle = null;   /* (on) => void, same sim_set_angle_mode as Settings */
    this.onFcMotor = null;   /* (motor, duty) => void, sim_motor_override */
    this.fc = new FcSession();
    this.fc.getFlightMode = () => (this.settings.flightMode === 'angle' ? 'angle' : 'acro');
    this.fc.setFlightMode = (on) => {
      this.settings.flightMode = on ? 'angle' : 'acro';
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onFcAngle) {
        this.onFcAngle(Boolean(on));
      }
    };
    this.fc.getLaunchControl = () => Boolean(this.settings.launchControl);
    this.fc.setLaunchControl = (on) => {
      this.settings.launchControl = Boolean(on);
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    };
    this.fc.motorTestAllowed = () => !this.fc.runActive && this.fcFrom !== 'paused';
    this.fc.onMotorTest = (motor, duty) => {
      if (this.onFcMotor) {
        this.onFcMotor(motor, duty);
      }
    };
    this.onUiSound = null;   /* (kind) => void: 'move', 'adjust', 'select', 'back' */
    this.share = null;       /* published course this run is flying, or null */
    this.timePosted = null;  /* last successful post on the results screen */
    /* The freestyle run the results screen is showing, and whether it has
     * been sent. Both cleared by resetScore, which every restart calls. */
    this.freestyleRun = null;
    this.runPosted = null;
    this.resultsFastest = null;
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    /* Seed the edges on the next poll rather than acting on them. Set by
     * every screen change; see show(). */
    this.padRearm = true;
    this.dropEl = null;
    this.dropIndex = null;
    this.menuRows = [];
    this.rowOffset = 0;
    this.reelFreezeWorld = false;
    this.gpuInfo = null;
    /* Set by main.js; see setStickProbe. */
    this.stickProbe = null;
    /* The gravity hint is shown at most once per page load even before the
     * localStorage flag is consulted, so a pilot who dismissed it and then
     * paused and resumed does not get it again on the way back into flight. */
    this.airHintDone = false;
    this.airHintTimer = 0;
    this.ptrX = null;
    this.ptrY = null;
    this.build();
    /* A track going online, or failing to, while My tracks is open: its
     * card says so without the pilot leaving and coming back. */
    window.addEventListener(TRACK_SYNC_EVENT, () => {
      if (this.screen === 'courses') {
        this.loadLocalCourses();
        this.renderCourseCards();
      }
    });
    /* Tab is the swap key in flight and a key of the picker's, so there it
     * must not also walk the browser's focus. Everywhere else it still
     * does: the menus' rows and cards are tab stops. */
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && (this.screen === 'flight' || this.carousel.isOpen || this.hangar.isOpen)) {
        e.preventDefault();
      }
    }, true);
    this.root.addEventListener('mousedown', (e) => {
      if (this.dropEl && !this.dropEl.contains(e.target) && !e.target.closest('.drop-btn')) {
        this.closeDrop();
      }
    });
    this.show('title');
    this.bindLocationHash();
  }

  build() {
    const r = this.root;
    r.textContent = '';

    /* Flight overlay: the on screen display a pilot actually reads. */
    this.osd = el('div', 'osd');
    /* The clock is a lap on the race field and an airtime in freestyle, and
     * an unlabelled number that means two different things is how a pilot
     * learns to distrust an instrument. */
    this.osdClockLabel = el('div', 'osd-label', 'Lap');
    this.osdTimer = el('div', 'osd-timer', '--.--');
    this.osdGate = el('div', 'osd-gate', '');
    this.osdBest = el('div', 'osd-best', '');
    this.osdLast = el('div', 'osd-best', '');
    /* The gap to the ghost, lit for a few seconds after each gate. Mint
     * when you are ahead of it, amber when it is ahead of you, the same
     * reading as everything else on this overlay: mint is the good news. */
    this.osdGhost = el('div', 'osd-ghost is-off', '');
    const top = el('div', 'osd-top');
    top.append(this.osdClockLabel, this.osdTimer, this.osdGate, this.osdLast, this.osdBest, this.osdGhost);
    this.osdTopBlock = top;
    this.osdPack = el('div', 'osd-value', '');
    this.osdPackBar = el('div', 'bar-fill');
    const packBar = el('div', 'bar');
    packBar.append(this.osdPackBar);
    const packBlock = el('div', 'osd-corner osd-left');
    packBlock.append(el('div', 'osd-label', str('ui.pack')), this.osdPack, packBar);
    this.osdHits = el('div', 'osd-sub osd-hits', '');
    packBlock.append(this.osdHits);
    this.osdSpeed = el('div', 'osd-value', '');
    this.osdFlight = el('div', 'osd-sub osd-mode', '');
    /* The flaps' notch, on an aircraft that has them; empty on the rest. */
    this.osdFlaps = el('div', 'osd-sub osd-mode', '');
    /* The retracts, on an aircraft that has them; empty on the rest. */
    this.osdGear = el('div', 'osd-sub osd-mode', '');
    this.osdLaunch = el('div', 'osd-launch is-off', '');
    this.osdAlt = el('div', 'osd-sub', '');
    this.osdThrBar = el('div', 'bar-fill warm');
    const thrBar = el('div', 'bar');
    thrBar.append(this.osdThrBar);
    const flightBlock = el('div', 'osd-corner osd-right');
    flightBlock.append(this.osdSpeed, this.osdFlight, this.osdFlaps, this.osdGear, this.osdAlt, el('div', 'osd-label', str('ui.throttle')), thrBar);
    const sticks = el('div', 'osd-sticks is-off');
    this.osdStickLeft = makeGimbal(str('ui.yaw_throttle'));
    this.osdStickRight = makeGimbal(str('ui.roll_pitch'));
    /*
     * BETWEEN THE GIMBALS, which is where the report that asked for it said
     * to put it. The container used to be hidden as a unit whenever a radio
     * was the stick source; now the two gimbals carry their own is-off and
     * the container is up whenever either half has something to show, which
     * for the gravity slider is every flight. A radio pilot therefore gets the
     * slider alone, centred, which is the case the report was filed from.
     */
    this.osdAir = makeWeightSlider({
      min: WEIGHT_MIN,
      max: WEIGHT_MAX,
      step: WEIGHT_STEP,
      value: this.settings.weight,
      label: str('ui.weight_how_heavy_the_quad_feels'),
    });
    sticks.append(this.osdStickLeft.box, this.osdAir.box, this.osdStickRight.box);
    this.osdSticks = sticks;
    this.bindAirSlider();
    this.osd.append(top, packBlock, flightBlock, sticks, this.osdLaunch, this.buildTargetLock());
    r.append(this.osd);

    /*
     * The freestyle score, in its own overlay beside the OSD rather than
     * inside it. Two reasons, and the second is the real one: the OSD is
     * dimmed as a whole when the run is paused, and a score that fades with
     * the instruments is fine, but the OSD is also hidden on every screen
     * that is not flight, and the score wants to survive into the results
     * screen. Keeping it a sibling means each is shown on its own terms.
     */
    this.scoreHud = new ScoreHud(r);

    /* Centre banner: launch prompt, lap splits, crash notice, and the
     * stick calibration prompts, which have to read over a screen, so the
     * banner is appended after the screens rather than before. */
    this.banner = el('div', 'banner', '');
    /*
     * THE ONE THING THAT SPEAKS.
     *
     * Every word this shell says in flight was written into an ordinary div:
     * the banner, the gate cue, the lap time, the results. The only
     * aria-live node in the file was the music dock's track title, so a
     * screen reader user heard the song change and not that the lap had
     * finished. This is one polite region, off screen, fed by setBanner and
     * by showResults, and it is deliberately the only one: two live regions
     * competing is worse than none, because the second interrupts the first.
     *
     * Off screen with a clip rather than display:none, because display:none
     * takes a node out of the accessibility tree entirely, which is the
     * mistake the legacy .hint rule makes and this one must not repeat.
     */
    this.announcer = el('div', 'sr-only', '');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    this.announcer.setAttribute('role', 'status');

    /*
     * THE FRAME. One status bar and one command bar, outside every screen,
     * so they occupy the same pixels whatever the pilot is looking at.
     *
     * Before this, the input legend was a per screen `hint` in a different
     * place on each one, the primary action was a row inside the list, and
     * nothing said which screen you were on or what you were about to fly.
     * The two bars are absolutely positioned and the screens are padded to
     * clear them by --bar-top and --bar-bot, so a bar can never render on
     * top of a row. See the token block in index.html.
     */
    this.frameTop = el('div', 'frame-top');
    this.crumb = el('div', 'crumb');
    this.frameContext = el('div', 'frame-context');
    this.frameGap = el('div', 'frame-gap');
    this.frameTop.append(this.crumb, this.frameGap, this.frameContext);

    this.frameBot = el('div', 'frame-bot');
    this.frameLegend = el('div', 'frame-legend');
    this.framePrimary = document.createElement('button');
    this.framePrimary.type = 'button';
    this.framePrimary.className = 'frame-primary';
    this.framePrimary.hidden = true;
    /* The bar's primary is bound to the SCREEN's declared primary action,
     * never to whatever row the cursor is on. A reviewer found the bug that
     * rule exists for: with the bar acting on the focused row, moving the
     * mouse toward the button crosses every row on the way and changes what
     * the button does before you reach it. */
    this.framePrimary.addEventListener('click', () => {
      const it = this.primaryItem();
      if (it && it.action) {
        this.act(it.action);
      }
    });
    this.frameBot.append(this.frameLegend, el('div', 'frame-gap'), this.framePrimary);
    r.append(this.frameTop, this.frameBot);

    /* Screens. */
    this.screens = {};

    const title = el('div', 'screen screen-title');
    const copy = el('div', 'title-copy');
    const brand = el('div', 'brand');
    this.brandSub = el('div', 'brand-sub', '');
    brand.append(wordmark(), this.brandSub);
    /* Beta notice. The only line on this screen that is about the
     * software rather than about flying, so it wears the blue an
     * instrument wears rather than the mint a record does, and it sits
     * directly under the wordmark: a pilot who is about to meet a bug
     * should have been told before the lap, not after it. It is not
     * dismissible, because the thing it warns about has not stopped
     * being true by the second visit. */
    const beta = el('p', 'beta-note');
    beta.append(
      el('span', 'beta-tag', str('ui.beta')),
      el('span', null, str('ui.realistic_drone_combat_inspired_by_paraguay')),
    );
    brand.append(beta);
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    this.keepNote = el('p', 'keep-note', str('ui.tracks_you_build_stay_in_this'));
    brand.append(this.keepNote);
    /* First run only. Replaced by the keep note once a lap has been flown. */
    this.firstNote = el('p', 'keep-note first-note', str('ui.a_quad_has_no_brakes_and'));
    brand.append(this.firstNote);
    const titleBlock = wrapMenu();
    this.titleMenu = titleBlock.menu;
    /*
     * The title's row list scrolls like every other list.
     *
     * index.html carries two `.screen-title .menu-scroll` height caps, one
     * for a narrow window and one for a short one, and neither had ever
     * applied to anything: this element never carried the class. So on a
     * 844 by 390 phone in landscape the list grew to 614 px inside a 318 px
     * box and Report bug, the last row, could not be reached by any amount
     * of scrolling. Every other menu in the shell adds this on the line
     * after it is built.
     */
    this.titleMenu.classList.add('menu-scroll');
    this.titleHelp = titleBlock.help;
    const titleFoot = el('div', 'title-foot');
    /* Kept, because its keys and its copy change with the state the title
     * is in: the gate has nothing behind it for Escape to reach and the
     * menu does. See setTitleHint. */
    this.titleHint = hintWithKeys(['↑↓', 'Enter'], str('ui.arrow_keys_move_enter_selects_a'));
    titleFoot.append(
      this.titleHint,
      titleBlock.stage,
    );
    /*
     * The gate's two cards.
     *
     * A third child of the copy column, and it is display:none in every
     * state but the gate, so the two child space-between contract the
     * other states rely on is untouched. It sits between the brand and the
     * foot because that is the middle of the column, which is the only
     * part of this screen with room in it: see the measurements in
     * PROGRESS.md.
     */
    this.gateCards = el('div', 'gate-cards');
    /* The gate's rooms panel beside the wordmark: see renderTitleRooms.
     * The brand and the panel share one row so the two child contract
     * above still holds for every other state, where the panel is hidden. */
    this.gateRooms = el('div', 'gate-rooms');
    const titleTop = el('div', 'title-top');
    titleTop.append(brand, this.gateRooms);
    copy.append(titleTop, this.gateCards, titleFoot);
    this.craftCanvas = el('canvas', 'craft-view');
    this.craftCanvas.setAttribute('aria-hidden', 'true');
    title.append(copy);
    this.screens.title = title;

    /*
     * How to fly.
     *
     * A CONTROL YOU OPERATE, not an essay you skim. This screen used to be
     * two definition lists over a two hundred word centred paragraph. It was
     * accurate and nobody read it, and the product already owned the one
     * thing that teaches a stick: makeGimbal, the live gimbal pair the flight
     * overlay and the calibration screen both use. So the sticks here are
     * live. Press W on this screen and the left gimbal climbs, with the same
     * hold ramp the flight path uses, because it IS the flight path: main.js
     * feeds the same channels it feeds the quad.
     *
     * One half at a time. A keyboard pilot and a radio pilot need different
     * sentences and neither needs the other's, so the page has a source
     * switch and shows one column. Whichever the shell says is live is the
     * one it opens on.
     */
    const howto = el('div', 'screen screen-page screen-howto');
    howto.append(el('h2', null, str('ui.how_to_fly')));
    howto.append(el('p', 'howto-lede', str('ui.a_quad_has_no_brakes_and_2')));

    const howtoTabs = el('div', 'howto-tabs');
    this.howtoTabs = {};
    /* The Touch tab exists only on a device with touch points, first in
     * the row because on that device it is the way this page's reader is
     * most likely holding the machine. */
    const tabList = [
      ...(touchWanted() ? [['touch', 'Touch']] : []),
      ['keyboard', 'Keyboard'], ['mouse', str('ui.mouse')], ['radio', str('ui.radio_or_gamepad')], ['launch', str('ui.launch_control')],
    ];
    for (const [id, label] of tabList) {
      const b = btn('howto-tab', label);
      b.addEventListener('click', () => this.setHowtoSource(id));
      howtoTabs.append(b);
      this.howtoTabs[id] = b;
    }
    howto.append(howtoTabs);

    const howtoBody = el('div', 'howto-body');
    const rig = el('div', 'howto-rig');
    this.howtoStickLeft = makeGimbal(str('ui.yaw_throttle'));
    this.howtoStickRight = makeGimbal(str('ui.roll_pitch'));
    const sticksRow = el('div', 'howto-sticks');
    sticksRow.append(this.howtoStickLeft.box, this.howtoStickRight.box);
    this.howtoLive = el('div', 'howto-live', '');
    rig.append(sticksRow, this.howtoLive);
    this.howtoKeys = el('dl', 'howto-keys');
    howtoBody.append(rig, this.howtoKeys);
    howto.append(howtoBody);

    this.howtoMode = el('p', 'howto-mode', '');
    howto.append(this.howtoMode);

    const howtoBlock = wrapMenu();
    this.howtoMenu = howtoBlock.menu;
    this.howtoHelp = howtoBlock.help;
    howto.append(howtoBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_arrow_keys_still_move')));
    this.screens.howto = howto;
    this.howtoSource = touchWanted() ? 'touch' : (this.settings.mouseFlight ? 'mouse' : 'keyboard');
    this.renderHowto();

    /*
     * THE TRICK LIST, and it is the catalogue's own list rather than a
     * written one.
     *
     * Every row here is a PATTERN the recogniser actually matches, priced by
     * the workbook, described from its own steps and animated from them too.
     * Nothing on this screen is typed out by hand, so a trick cannot be
     * advertised that the game will not score, and a film cannot show a
     * shape the scorer does not want. See src/ui/trickfilm.js.
     */
    const tricks = el('div', 'screen screen-page screen-tricks');
    tricks.append(el('h2', null, str('ui.trick_list')));
    tricks.append(el('p', 'rates-lede', str('ui.every_trick_the_scorer_is_known')));
    const trickStage = el('div', 'trick-stage');
    this.trickCanvas = el('canvas', 'trick-film');
    const trickSide = el('div', 'trick-side');
    this.trickName = el('div', 'trick-name', '');
    this.trickMeta = el('div', 'trick-meta', '');
    this.trickHow = el('p', 'trick-how', '');
    this.trickView = el('div', 'trick-view', '');
    trickSide.append(this.trickName, this.trickMeta, this.trickHow, this.trickView);
    trickStage.append(this.trickCanvas, trickSide);
    tricks.append(trickStage);
    const trickBlock = wrapMenu();
    this.trickMenu = trickBlock.menu;
    this.trickMenu.classList.add('menu-scroll');
    this.trickHelp = trickBlock.help;
    tricks.append(trickBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_arrow_keys_move_through')));
    this.screens.tricks = tricks;
    this.trickPlayer = new TrickFilmPlayer(this.trickCanvas);
    this.trickShown = '';

    const credits = el('div', 'screen screen-page screen-credits');
    credits.append(el('h2', null, str('ui.credits')));
    this.creditsRoll = el('div', 'credits-roll');
    fillCredits(this.creditsRoll, { assetBase: 'assets/credits' });
    const creditsBlock = wrapMenu();
    this.creditsMenu = creditsBlock.menu;
    this.creditsHelp = creditsBlock.help;
    credits.append(
      this.creditsRoll,
      creditsBlock.stage,
      hintWithKeys(['Esc'], str('ui.goes_back_arrow_keys_still_move')),
    );
    this.screens.credits = credits;

    /*
     * MY TRACKS, which is Track mode's own screen: a strip of track cards,
     * the pilot's first and the board's after, over the rows that act on
     * the list as a whole. Each card wears the photograph of the world the
     * track stands in (the world's poster, src/maps/registry.js), because
     * where a track is flown is the first thing that tells two apart.
     */
    const courses = el('div', 'screen screen-page screen-maps screen-courses');
    courses.append(el('h2', null, str('ui.my_tracks')));
    /* Which aircraft this list is for, said out loud: a plane sees only the
     * tracks it fits, and a list filtered without saying so reads as tracks
     * that have disappeared. Written by items(). */
    this.coursesLede = el('p', 'screen-lede', '');
    courses.append(this.coursesLede);
    /*
     * mapCardHost is built because the Freestyle room draws its world cards
     * into it through renderMapCards; it is not appended to this screen.
     */
    this.mapCardHost = el('div', 'map-cards');
    this.courseStrip = el('div', 'card-strip');
    /* Two groups, so the caption names both. Yours first, because the track
     * you were last working on is the one you came here to fly; the board's
     * underneath, most flown first. */
    this.courseStrip.append(el('div', 'strip-label', tracksConfigured() ? str('cloud.strip_label') : str('ui.yours_first_then_the_board_most')));
    this.courseCardHost = el('div', 'map-cards course-cards');
    /* What the list holds when it holds nothing of the pilot's, and what
     * the board said, each one line under the strip. */
    this.localNote = el('div', 'board-note', '');
    this.boardNote = el('div', 'board-note', '');
    this.courseStrip.append(this.courseCardHost, this.localNote, this.boardNote);
    const coursesBlock = wrapMenu();
    this.coursesMenu = coursesBlock.menu;
    this.coursesMenu.classList.add('menu-scroll');
    this.coursesHelp = coursesBlock.help;
    courses.append(
      this.courseStrip,
      coursesBlock.stage,
      hintWithKeys(['↑↓', 'Enter', 'Esc'], str('ui.arrow_keys_move_enter_chooses_escape')),
    );
    this.screens.courses = courses;

    /* Freestyle. Same card machinery as Race, different contents, and no
     * publish cluster because nothing here is timed or posted. */
    const freestyle = el('div', 'screen screen-page screen-courses screen-freestyle');
    freestyle.append(el('h2', null, str('ui.freestyle')));
    /*
     * The lede used to end "Pick one and fly it", which was the instruction
     * for a screen that offered four worlds, and it said "no board", which
     * stopped being true when the freestyle high score table went up. Both
     * are fixed here rather than in a card: this is the room's own sentence
     * about what freestyle IS.
     */
    /* The lede promised a scored run, and scoring is no longer what a pilot
     * gets without asking for it. A front page that describes the thing
     * behind the door has to describe the door that is actually open: the
     * town and the quad, with the scoring named as a switch rather than as
     * the point. See DEFAULTS.freestyleScoring. */
    freestyle.append(el('p', 'rates-lede', str('ui.a_whole_valley_and_no_gates')));
    this.freestyleCards = el('div', 'map-cards');
    const freestyleBlock = wrapMenu();
    this.freestyleMenu = freestyleBlock.menu;
    this.freestyleMenu.classList.add('menu-scroll');
    this.freestyleHelp = freestyleBlock.help;
    freestyle.append(this.freestyleCards, freestyleBlock.stage);
    this.screens.freestyle = freestyle;

    /*
     * QUAD, and PILOT, which were one screen called Settings.
     *
     * Thirty rows in one undivided scroll, in an order that grew rather
     * than was chosen: a pilot's name next to a PID editor next to a
     * binaural tone. Headings helped and did not fix it, because the list
     * was two lists. The rule that separates them is what a change
     * SURVIVES. Rates survive changing the quad but are the pilot's, so
     * they are Pilot. The tune, the PIDs and the firmware survive changing
     * the pilot, so they are Quad. Graphics and sound survive both, so they
     * are neither and sit at the bottom of Pilot as a leaf. Laps, pack
     * charge and flight model survive nothing, they define the run, so they
     * are the launch card below.
     *
     * Camera is the one deliberate exception to the rule: it survives both,
     * and it stays in Quad anyway because it is bolted to the airframe and
     * changes what a yaw does to the picture.
     *
     * The airframe showcase moves here with the machine. It was posing a
     * quad above a list of the pilot's sound levels.
     */
    const quad = el('div', 'screen screen-page screen-quad');
    quad.append(el('h2', null, str('ui.quad')));
    quad.append(el('p', 'rates-lede', str('ui.everything_about_the_machine_carried_with')));
    const quadBlock = wrapMenu();
    this.quadMenu = quadBlock.menu;
    this.quadMenu.classList.add('menu-scroll');
    this.quadHelp = quadBlock.help;
    this.craftQuadFrame = el('div', 'craft-showcase-frame');
    this.craftQuadFrame.append(this.craftCanvas);
    this.craftCaption = el('div', 'craft-showcase-cap', str('ui.acro_sticks_are_rates_hands_off'));
    const quadShowcase = el('div', 'craft-showcase');
    quadShowcase.append(this.craftQuadFrame, this.craftCaption);
    quadBlock.stage.prepend(quadShowcase);
    quad.append(quadBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_changes_are_already_stored')));
    this.screens.quad = quad;

    const pilot = el('div', 'screen screen-page screen-pilot');
    pilot.append(el('h2', null, str('ui.settings')));
    pilot.append(el('p', 'rates-lede', str('ui.you_and_your_sticks_rates_are')));
    const pilotBlock = wrapMenu();
    this.pilotMenu = pilotBlock.menu;
    this.pilotMenu.classList.add('menu-scroll');
    this.pilotHelp = pilotBlock.help;
    pilot.append(pilotBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_changes_are_already_stored')));
    this.screens.pilot = pilot;

    /* FLY WITH FRIENDS: a private room, its code and who is in it. The
     * rows are the shell's (src/main.js friendsRows), because the room is
     * the shell's; this is only the page they sit on. */
    const friends = el('div', 'screen screen-page screen-friends');
    friends.append(el('h2', null, str('friends.title')));
    friends.append(el('p', 'rates-lede', str('friends.lede')));
    /* The war's lobby over the rows, in a room made for the war between
     * its matches (setWarLobby). */
    this.warLobbyEl = el('div', 'war-lobby');
    this.warLobbyEl.hidden = true;
    friends.append(this.warLobbyEl);
    const friendsBlock = wrapMenu();
    this.friendsMenu = friendsBlock.menu;
    this.friendsMenu.classList.add('menu-scroll');
    this.friendsHelp = friendsBlock.help;
    friends.append(friendsBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_changes_are_already_stored')));
    this.screens.friends = friends;

    /* THE ROOM BROWSER and MAKE A ROOM, two pages under Fly with friends
     * whose rows are src/ui/roombrowser.js's, through the shell
     * (roomRows), for the same reason as the room screen's. */
    this.roomPages = {};
    for (const [id, title, lede] of [
      ['rooms', str('roombrowser.title'), str('roombrowser.lede')],
      ['roomnew', str('roombrowser.new_title'), str('roombrowser.new_lede')],
    ]) {
      const page = el('div', `screen screen-page screen-${id}`);
      page.append(el('h2', null, title), el('p', 'rates-lede', lede));
      const block = wrapMenu();
      block.menu.classList.add('menu-scroll');
      this.roomPages[id] = block;
      page.append(block.stage, hintWithKeys(['Esc'], str('ui.goes_back_changes_are_already_stored')));
      this.screens[id] = page;
    }

    /*
     * STANDINGS: the board, in the game.
     *
     * "Open the board" was two problems in one row. It is jargon, so it
     * meant nothing to somebody who had never seen the board; and it LEFT,
     * to a page whose own way back reloads the simulator at the title and
     * throws away whatever was seated. A player who wanted to know what the
     * record was had to quit the game to find out.
     *
     * Everything that page shows about a track, the times and who flew
     * them, comes from an endpoint this shell already calls for the ghost
     * picker. So it is a screen here, and the web page stays as one honest
     * link for sending somebody rather than as the only way to see a time.
     */
    const standings = el('div', 'screen screen-page screen-standings');
    standings.append(el('h2', null, str('ui.standings')));
    this.standingsLede = el('p', 'rates-lede', '');
    standings.append(this.standingsLede);
    this.standingsTable = el('div', 'standings-table');
    const standingsBlock = wrapMenu();
    this.standingsMenu = standingsBlock.menu;
    this.standingsMenu.classList.add('menu-scroll');
    this.standingsHelp = standingsBlock.help;
    standingsBlock.stage.prepend(this.standingsTable);
    standings.append(standingsBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_to_the_track_list')));
    this.screens.standings = standings;

    /*
     * THE LAUNCH CARD: the room the first design of this was missing.
     *
     * main.js latches runVoltage, runStyle and runLaps at run start, and
     * recordKey() hashes the config text, the pack voltage and the flight
     * style into one personal-best key. So laps, pack charge and flight
     * model are not settings a pilot carries around, they are properties of
     * the RUN: they are what a lap time means. Filing them under Quad or
     * Pilot put them in a room where neither was true, and produced a
     * concrete failure: a pilot sets Arcade because "the ideal quad" reads
     * like a better quad, beats their best by two seconds, and only the
     * results screen tells them it does not count.
     *
     * They are not a fifth room. They are the content of the moment before
     * you launch, which is exactly where a pilot wants to see them, and the
     * sentence in the help column is the record key rendered in English.
     *
     * Racing only. Freestyle has no clock, no lap, no ghost and no board,
     * so asking would be ceremony, and it already carries its own arcade
     * readout for the one flag that does change a freestyle flight.
     */
    const launch = el('div', 'screen screen-page screen-launch');
    launch.append(el('h2', null, str('ui.before_you_fly')));
    this.launchLede = el('p', 'rates-lede', '');
    launch.append(this.launchLede);
    const launchBlock = wrapMenu();
    this.launchMenu = launchBlock.menu;
    this.launchMenu.classList.add('menu-scroll');
    this.launchHelp = launchBlock.help;
    launch.append(launchBlock.stage, hintWithKeys(['Enter', 'Esc'], str('ui.enter_flies_it_escape_goes_back')));
    this.screens.launch = launch;

    /*
     * Rates.
     *
     * A PICTURE AND A RATEPROFILE, where there used to be a whole Betaflight
     * Configurator. The old flight-controller screen offered eight tabs, a
     * few hundred editable firmware keys, a raw CLI textarea and a file drop
     * that would flash any dump the pilot could find. It was accurate and it
     * was unusable, and none of it was the thing a pilot actually changes.
     * Rates are. So the tune is two named choices on the menus that already
     * carried it, and everything a pilot sets by hand is here: the rates
     * type, three numbers per axis, and the throttle limit. That is
     * Configurator's Rates tab and nothing else from it.
     *
     * The curve is the point. "670 deg/s" means nothing until you can see
     * that a quarter of stick is 55 of it; the graph and the readout beside
     * it are the same numbers Betaflight's own curve will fly, drawn from
     * src/fc/ratescurve.js. The dots on it are the live sticks.
     */
    const rates = el('div', 'screen screen-page screen-rates');
    rates.append(el('h2', null, str('ui.rates')));
    rates.append(el(
      'p',
      'rates-lede',
      str('ui.how_far_the_sticks_go_pick'),
    ));
    this.ratesPanel = mountRatesPanel();
    const ratesBlock = wrapMenu();
    this.ratesMenu = ratesBlock.menu;
    this.ratesMenu.classList.add('menu-scroll');
    this.ratesHelp = ratesBlock.help;
    /* Into the stage's first column, the same seat the quad takes on
     * Settings. The three column grid is what keeps the rows in the middle
     * of the window whatever is beside them. */
    ratesBlock.stage.prepend(this.ratesPanel.root);
    const ratesHint = hintWithKeys(['↑↓', '←→', 'Enter', 'Esc'], '');
    this.ratesHint = ratesHint.querySelector('.hint-copy');
    rates.append(ratesBlock.stage, ratesHint);
    this.screens.rates = rates;

    /*
     * PIDs.
     *
     * THE HALF OF THE FLIGHT-CONTROLLER SCREEN THAT WAS MISSED. Removing
     * the Configurator homage was right, and then a beta tester reported
     * the two shipped tunes floppy and said they used to push the PIDs to
     * 200-300 percent, which is exactly the control the removal took away.
     * So this is that control at the Rates screen's size: Betaflight's own
     * tuning sliders on whichever tune is loaded, an expert table for
     * setting PIDs directly, and nowhere to paste a CLI dump. The sliders
     * are the firmware's simplified_* keys and a real `simplified_tuning
     * apply`; the panel beside the rows draws the values read back OUT of
     * the running module, so what is on this screen is what is flying.
     */
    const pids = el('div', 'screen screen-page screen-rates screen-pids');
    pids.append(el('h2', null, str('ui.pids')));
    pids.append(el(
      'p',
      'rates-lede',
      str('ui.how_hard_the_flight_controller_works'),
    ));
    this.pidsPanel = mountPidsPanel();
    const pidsBlock = wrapMenu();
    this.pidsMenu = pidsBlock.menu;
    this.pidsMenu.classList.add('menu-scroll');
    this.pidsHelp = pidsBlock.help;
    pidsBlock.stage.prepend(this.pidsPanel.root);
    const pidsHint = hintWithKeys(['↑↓', '←→', 'Enter', 'Esc'], '');
    this.pidsHint = pidsHint.querySelector('.hint-copy');
    pids.append(pidsBlock.stage, pidsHint);
    this.screens.pids = pids;

    /*
     * The flight controller, restored. Configurator 10.10 chrome: yellow
     * header, dark left tab rail, PID Tuning pages across the top of the
     * work area, a status strip along the bottom. What did NOT come back
     * from the first version: the CLI tab, its textarea, and the
     * drop-a-diff import. Text leaves through Export; none comes in.
     */
    const fc = el('div', 'screen screen-page screen-fc');
    const fcHead = el('div', 'fc-head');
    const fcBrand = el('div', 'fc-brand');
    fcBrand.append(el('span', 'fc-wordmark', str('ui.fc_wordmark')));
    fcBrand.append(el('span', 'fc-fw', '4.5.1'));
    fcBrand.append(el('span', 'fc-conn', str('ui.wasm')));
    this.fcDirty = el('span', 'fc-dirty', '');
    fcBrand.append(this.fcDirty);
    fcHead.append(fcBrand);
    const homage = el('p', 'fc-homage', str('ui.fc_bench_lede'));
    fcHead.append(homage);
    const fcExit = el('div', 'fc-exit');
    this.fcSaveExit = btn('fc-exit-btn fc-exit-save', str('ui.save_and_exit'));
    this.fcSaveExit.addEventListener('click', (e) => {
      e.stopPropagation();
      this.act('fc-save-exit');
    });
    this.fcLeave = btn('fc-exit-btn fc-exit-leave', str('ui.exit_without_saving'));
    this.fcLeave.addEventListener('click', (e) => {
      e.stopPropagation();
      this.act('fc-back');
    });
    const fcExitHint = el('div', 'fc-exit-hint');
    fcExitHint.append(el('kbd', null, 'Esc'));
    this.fcExitCopy = el('span', 'fc-exit-copy', str('ui.exits_without_saving'));
    fcExitHint.append(this.fcExitCopy);
    fcExit.append(this.fcSaveExit, this.fcLeave, fcExitHint);
    this.fcExit = fcExit;
    const fcBody = el('div', 'fc-body');
    this.fcTabs = el('nav', 'fc-tabs');
    this.fcTabs.setAttribute('aria-label', str('ui.configurator_tabs'));
    const fcWork = el('div', 'fc-work');
    this.fcPages = el('div', 'fc-pages');
    this.fcPages.setAttribute('aria-label', str('ui.pid_tuning_pages'));
    this.fcPages.hidden = true;
    const fcBlock = wrapMenu();
    this.fcMenu = fcBlock.menu;
    this.fcMenu.classList.add('menu-scroll');
    this.fcHelp = fcBlock.help;
    this.fcAttitude = el('canvas', 'fc-attitude');
    this.fcAttitude.width = 220;
    this.fcAttitude.height = 220;
    this.fcAttitude.setAttribute('aria-label', str('ui.attitude'));
    this.fcAttitude.hidden = true;
    fcWork.append(this.fcPages, fcBlock.stage, this.fcAttitude);
    fcBody.append(this.fcTabs, fcWork);
    const fcStatus = el('div', 'fc-status', str('ui.connected_wasm_betaflight_4_5_1'));
    fc.append(fcHead, fcExit, fcBody, fcStatus);
    this.screens.fc = fc;

    const calibrate = el('div', 'screen screen-page screen-calibrate');
    calibrate.append(el('h2', null, str('ui.calibrate_sticks')));
    this.calKicker = el('div', 'cal-kicker', '');
    this.calPrompt = el('p', 'cal-prompt', '');
    this.calHint = el('p', 'cal-hint', '');
    const calSticks = el('div', 'cal-sticks');
    this.calStickLeft = makeGimbal(str('ui.yaw_throttle'));
    this.calStickRight = makeGimbal(str('ui.roll_pitch'));
    calSticks.append(this.calStickLeft.box, this.calStickRight.box);
    /*
     * THE RAW AXES, BECAUSE THE GIMBALS ABOVE CANNOT SHOW AN AXIS THEY HAVE
     * NOT LEARNED ABOUT YET.
     *
     * Two gimbals are four channels, and which four axes those are is the
     * question this whole screen exists to answer. A pilot whose yaw sits
     * on axis 5 moved their yaw stick on the full range step and watched
     * nothing move, and filed it. This strip has no opinion: one cell per
     * axis, the live value as a dot, the travel seen so far as a bar behind
     * it, mint once a channel has claimed it. See calibrationView.
     */
    this.calAxes = el('div', 'cal-axes');
    this.calAxisCells = [];
    this.calList = el('ol', 'cal-steps');
    const calBtns = el('div', 'cal-actions');
    this.calCancelBtn = btn('name-dialog-btn', str('ui.cancel'));
    /* Only ever shown on the menu switch step, and only a radio reporting
     * no buttons is asked that. See skipCalibrationSelect in input.js. */
    this.calSkipBtn = btn('name-dialog-btn', str('ui.no_switch_skip'));
    this.calSkipBtn.hidden = true;
    /* Only on the check step, and only when the throttle is reading high
     * enough to fly the quad with nobody touching it. See zeroThrottleHere
     * in input.js for the radio this exists for. */
    this.calZeroBtn = btn('name-dialog-btn', str('ui.throttle_zero_is_here'));
    this.calZeroBtn.hidden = true;
    /*
     * REVERSE THE CHANNEL UNDER THEIR THUMB, and the label names it rather
     * than saying Reverse, because the whole trick of this control is that
     * the pilot never has to choose from a list: whatever they are moving
     * is what the button is about. See movingChannel in input.js.
     */
    this.calRevBtn = btn('name-dialog-btn', str('ui.reverse'));
    this.calRevBtn.hidden = true;
    /* Only on the check step, where the two drawn gimbals are captioned
     * and a pilot can see that they are on the wrong hands. */
    this.calModeBtn = btn('name-dialog-btn', str('ui.swap_stick_mode'));
    this.calModeBtn.hidden = true;
    this.calSaveBtn = btn('name-dialog-btn on', str('ui.save_mapping'));
    this.calSaveBtn.disabled = true;
    this.calCancelBtn.addEventListener('click', () => this.act('calibrate-cancel'));
    this.calSkipBtn.addEventListener('click', () => this.act('calibrate-skip'));
    this.calZeroBtn.addEventListener('click', () => this.act('calibrate-zero-throttle'));
    this.calRevBtn.addEventListener('click', () => this.act('calibrate-reverse'));
    this.calModeBtn.addEventListener('click', () => this.act('calibrate-stick-mode'));
    this.calSaveBtn.addEventListener('click', () => this.act('calibrate-save'));
    calBtns.append(
      this.calCancelBtn, this.calSkipBtn, this.calZeroBtn,
      this.calRevBtn, this.calModeBtn, this.calSaveBtn,
    );
    calibrate.append(
      this.calKicker,
      this.calPrompt,
      this.calHint,
      calSticks,
      this.calAxes,
      this.calList,
      calBtns,
      hintWithKeys(['Esc'], str('ui.cancels_nothing_is_saved_until_save')),
    );
    this.screens.calibrate = calibrate;
    this.calCanSave = false;
    this.calCanSkip = false;

    const padpick = el('div', 'screen screen-page screen-padpick');
    padpick.append(el('h2', null, str('ui.choose_joystick')));
    this.padKicker = el('div', 'cal-kicker', str('ui.which_device'));
    this.padPrompt = el('p', 'cal-prompt', str('ui.move_the_joystick_you_want_to'));
    this.padHint = el('p', 'cal-hint', '');
    this.padCards = el('div', 'pad-cards');
    const padBtns = el('div', 'cal-actions pad-actions');
    this.padYesBtn = btn('name-dialog-btn on', str('ui.yes_use_this'));
    this.padNoBtn = btn('name-dialog-btn', str('ui.no_not_this_one'));
    this.padSkipBtn = btn('name-dialog-btn', str('ui.use_keyboard_instead'));
    this.padYesBtn.addEventListener('click', () => this.act('padpick-yes'));
    this.padNoBtn.addEventListener('click', () => this.act('padpick-no'));
    this.padSkipBtn.addEventListener('click', () => {
      this.act(this.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
    });
    padBtns.append(this.padYesBtn, this.padNoBtn, this.padSkipBtn);
    padpick.append(
      this.padKicker,
      this.padPrompt,
      this.padHint,
      this.padCards,
      padBtns,
      hintWithKeys(['Enter', 'Esc'], str('ui.enter_uses_the_highlighted_joystick_escape')),
    );
    this.screens.padpick = padpick;
    this.padCardNodes = new Map();
    this.padInfo = { count: 0, using: str('ui.keyboard') };
    this.padPickReason = 'boot';
    this.padPickPhase = 'wiggle';

    const paused = el('div', 'screen screen-modal');
    paused.append(el('h2', null, str('ui.paused')));
    const pausedBlock = wrapMenu();
    this.pausedMenu = pausedBlock.menu;
    this.pausedHelp = pausedBlock.help;
    paused.append(pausedBlock.stage, hintWithKeys(['Esc'], str('ui.resumes_resume_is_also_the_first')));
    this.screens.paused = paused;

    const results = el('div', 'screen screen-results');
    const resultsCopy = el('div', 'results-copy');
    const resultsTop = el('div', 'results-top');
    this.resultsKicker = el('div', 'results-kicker', '');
    this.resultsHead = el('h2', 'results-head', str('ui.run_complete'));
    this.resultsHero = el('div', 'results-hero');
    this.resultsHeroCap = el('div', 'results-hero-cap', str('ui.best_lap'));
    this.resultsHeroTime = el('div', 'results-hero-time', '');
    this.resultsHeroMeta = el('div', 'results-hero-meta', '');
    this.resultsHero.append(this.resultsHeroCap, this.resultsHeroTime, this.resultsHeroMeta);
    this.resultsBody = el('div', 'results');
    this.resultsNote = el('p', 'results-note', '');
    resultsTop.append(
      this.resultsKicker,
      this.resultsHead,
      this.resultsHero,
      this.resultsBody,
      this.resultsNote,
    );
    const resultsBlock = wrapMenu();
    this.resultsMenu = resultsBlock.menu;
    this.resultsHelp = resultsBlock.help;
    const resultsFoot = el('div', 'results-foot');
    resultsFoot.append(resultsBlock.stage, hintWithKeys(['Esc'], str('ui.goes_back_to_the_title_back')));
    resultsCopy.append(resultsTop, resultsFoot);
    results.append(resultsCopy);
    this.screens.results = results;

    this.nameDialog = el('div', 'name-dialog');
    this.nameDialog.hidden = true;
    this.nameDialog.setAttribute('aria-modal', 'true');
    this.nameDialog.setAttribute('role', 'dialog');

    /*
     * REPORT BUG, AND WHERE IT IS NOT.
     *
     * This chip was removed whole and that went too far. The ask was about
     * one screen: the picture that came with it was the title with the
     * three cards on it, and a floating button over the first thing a
     * visitor sees is what was wrong with it. Everywhere else it is the
     * only thing on screen that says how to tell somebody a thing is
     * broken, and taking it off every screen left F8, which a phone does
     * not have.
     *
     * So it is back, and it is hidden on the title. The title is the one
     * screen whose whole job is a first impression, it is the screen the
     * report was about, and it is one press from any screen that has the
     * chip on it.
     */
    this.bugChip = btn('bug-chip', str('ui.report_bug_give_feedback'));
    this.bugChip.title = str('ui.f8_also_opens_this');
    this.bugChip.addEventListener('click', () => this.openBugReport());

    /*
     * PAUSE, for a pointer.
     *
     * A phone has had this button since the thumb sticks shipped, mounted
     * by src/input/touchsticks.js, and a mouse has never had one: the only
     * way out of a flight was the Escape key. That is fine if you know it
     * and invisible if you do not, and the room a pilot wants is usually
     * behind it, because Paused is where Quit to title lives and the title
     * is where a map is chosen. Reported as being stuck in a freestyle map
     * with no way back to a race one.
     *
     * The same two calls the Escape key and the thumb button both make, so
     * there is one way to pause and three ways to ask for it. It hides
     * itself when the thumb sticks are up, because that overlay brings its
     * own and two Pause buttons in one corner is worse than none.
     */
    this.pauseChip = btn('bug-chip pause-chip', str('ui.pause'));
    this.pauseChip.title = str('ui.escape_also_pauses');
    this.pauseChip.addEventListener('click', () => {
      if (this.screen !== 'flight') {
        return;
      }
      this.act('pause');
      this.show('paused');
    });
    /* The swap in place, for a pointer, under Pause and in the same family.
     * The thumb sticks carry their own, like Pause. */
    this.swapChip = btn('bug-chip swap-chip', str('ui.aircraft'));
    this.swapChip.title = str('carousel.tab_also_opens_it');
    this.swapChip.addEventListener('click', () => this.openSwap('flight'));

    /*
     * SIGN IN, WHERE THE BUG CHIP IS NOT.
     *
     * Reported by the owner: the Google sign in (src/share/account.js,
     * src/ui/accountui.js) only ever showed up as a row under Settings, so
     * a pilot who never opened that screen never learned it existed. This
     * chip is the same family as the bug chip and takes its corner, but
     * the two are complements rather than twins: the bug chip is hidden on
     * the title and shown in flight, and this one is the other way round,
     * because the title is exactly the screen a guest should be offered an
     * account on and a flight is exactly the screen nothing should invite
     * a tap away from the sticks. syncChips carries both the label, which
     * flips between the sign in prompt and the callsign, and which corner
     * it sits in: the title has no bug chip to share the first slot with,
     * everywhere else does.
     *
     * Since the owner made an account the price of playing (2026-10-03),
     * the chip is the signed in pilot's: the callsign's initial and the
     * callsign, opening Pilot, where Sign out is. Until then the same slot
     * holds the sign in panel (signinPanel, src/ui/accountui.js fills it):
     * Google's own button and one line on why, never a wall over the page.
     * Neither shows where there are no accounts (accountsAvailable).
     */
    this.signinChip = btn('bug-chip signin-chip', '');
    this.signinChip.addEventListener('click', () => this.act('pilot'));
    this.signinPanel = el('div', 'signin-panel');
    this.signinPanel.hidden = true;

    /* A newer deploy is out. Shown on menus and on Paused, never over a
     * flight: syncChips holds it until the pilot is off the sticks. */
    this.updateReady = false;
    this.barStopCount = 0;
    this.updateBar = el('div', 'update-bar');
    this.updateBar.setAttribute('role', 'status');
    this.updateBar.hidden = true;
    this.updateReload = btn('update-reload', str('update.reload'));
    this.updateReload.addEventListener('click', () => this.act('update-reload'));
    this.updateBar.append(el('span', null, str('update.new_version')), this.updateReload);
    this.checkVersion = watchVersion((stale) => {
      this.updateReady = stale;
      this.syncChips();
    });

    /* The room's word to a pilot off the sticks (src/main.js roomBarView):
     * fly, the others are; alone in a room; too old a build for it. The
     * update bar's look, above it, and like it never over a flight. */
    this.roomBarView = null;
    this.roomBar = el('div', 'update-bar room-bar');
    this.roomBar.setAttribute('role', 'status');
    this.roomBar.hidden = true;
    this.roomBarText = el('span');
    this.roomBarButton = btn('update-reload', '');
    this.roomBarButton.addEventListener('click', () => this.act('room-bar'));
    this.roomBar.append(this.roomBarText, this.roomBarButton);

    this.musicDock = el('div', 'music-dock');
    this.musicDock.setAttribute('role', 'group');
    this.musicDock.setAttribute('aria-label', str('ui.music'));
    this.musicPrev = btn('music-skip', '‹');
    this.musicPrev.setAttribute('aria-label', str('ui.previous_track'));
    this.musicPrev.tabIndex = -1;
    this.musicNext = btn('music-skip', '›');
    this.musicNext.setAttribute('aria-label', str('ui.next_track'));
    this.musicNext.tabIndex = -1;
    /*
     * THE NAME IS THE MUTE, because the dock is already the shape of the
     * control: a chevron, a thing, a chevron. Every media widget anybody
     * has used puts skip on the arrows and the state of the sound in the
     * middle, and this one had the arrows wired and a label in the middle
     * that did nothing. Asked for as "if i click on the music selector, in
     * the middle it mutes".
     *
     * A button rather than a div with a listener, so it has the cursor,
     * the hit box and the role without any of the three being written by
     * hand. tabIndex -1 like the two skips beside it: these are pointer
     * affordances over the world, and a menu whose arrow keys wander into
     * the corner of the screen is worse than a dock nobody can tab to. The
     * keyboard's route to the same setting is the Music row under Pilot.
     *
     * aria-live stays on it and the text stays the track's name, so the
     * name is still what is announced when the bed moves on. What the
     * click does is in the title attribute, which the name needed anyway
     * because it ellipsises at 11em.
     */
    this.musicTitle = btn('music-title', this.musicNow.name);
    this.musicTitle.setAttribute('aria-live', 'polite');
    this.musicTitle.tabIndex = -1;
    this.musicDock.append(this.musicPrev, this.musicTitle, this.musicNext);
    const keepFocusOff = (e) => e.preventDefault();
    this.musicPrev.addEventListener('mousedown', keepFocusOff);
    this.musicNext.addEventListener('mousedown', keepFocusOff);
    this.musicTitle.addEventListener('mousedown', keepFocusOff);
    this.musicTitle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMusicMute();
    });
    this.musicPrev.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipMusic(-1);
    });
    this.musicNext.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipMusic(1);
    });

    for (const s of Object.values(this.screens)) {
      s.style.display = 'none';
      r.append(s);
    }
    r.append(this.announcer, this.banner, this.bugChip, this.pauseChip, this.swapChip, this.signinChip, this.signinPanel, this.musicDock, this.nameDialog);
    /* In the command bar, beside the primary: the screens are padded to
     * clear that bar, so nothing drawn there can cover a card, the rooms
     * panel or a row. Floating over the page, the update bar sat on the
     * title's cards. */
    this.framePrimary.before(this.roomBar, this.updateBar);
    this.carousel = new Carousel(r);
    this.hangar = new Hangar(r);
    this.progress = new Progress(this, r);
    bindProgress(this.progress);
    installHangarPolish();
    this.syncChips();
  }

  setShare(share) {
    this.share = share || null;
    this.timePosted = null;
    if (this.screen === 'title' || this.screen === 'courses' || this.screen === 'results') {
      this.renderMenu();
    }
  }

  setGhostRow(row) {
    this.ghostRow = row || null;
    if (this.screen === 'title' || this.screen === 'paused') {
      this.renderMenu();
    }
  }

  /* The Live row, beside Ghost: the shell pushes { value, note, cycle }
   * the same way, and null when the track has no room. */
  setLiveRow(row) {
    this.liveRow = row || null;
    if (this.screen === 'title' || this.screen === 'paused') {
      this.renderMenu();
    }
  }

  liveItems() {
    if (!this.liveRow) {
      return [];
    }
    return [{
      label: str('ui.live'),
      value: this.liveRow.value,
      note: this.liveRow.note,
      adjust: (d) => {
        if (this.liveRow) {
          this.liveRow.cycle(d);
        }
      },
    }];
  }

  /* The Fly with friends row, where the shell has a rooms server to offer
   * (src/share/rooms.js roomsOrigin): { value, note } from the shell, or
   * nothing at all on a page with no server, rather than a row that can
   * only fail. */
  friendsItems() {
    const row = this.friendsRow ? this.friendsRow() : null;
    if (!row) {
      return [];
    }
    return [{ label: str('friends.title'), value: row.value, note: row.note, action: 'friends' }];
  }

  /*
   * The aircraft and the world, on the room screen between runs. The
   * aircraft is the Quad room's own row. The world is a choice until there
   * is a room and a fact after: a room is made in one world and flies
   * there (src/main.js seats it on welcome), so changing it inside one
   * would only put this pilot somewhere nobody else is.
   */
  /*
   * THE WAR'S LOBBY over the room screen's rows: LOBBY and the mission,
   * when it starts in large, and the pilots, each ready or not. `v` is
   * src/main.js warLobbyView(), or null for no lobby. Drawn again only when
   * what it says changes.
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
    const status = v.countdown != null
      ? str('lobby.starting', { n: v.countdown })
      : v.deadline != null
        ? str('lobby.deadline', { t: `${Math.floor(v.deadline / 60)}:${String(v.deadline % 60).padStart(2, '0')}` })
        : str('lobby.waiting');
    const key = JSON.stringify([v.mission, status, v.pilots, v.last, v.brief]);
    if (key === this.warLobbyKey) {
      return;
    }
    this.warLobbyKey = key;
    const box = this.warLobbyEl;
    box.textContent = '';
    const head = el('div', 'war-lobby-head');
    head.append(el('div', 'war-lobby-title', str(v.brief ? 'brief.title' : 'lobby.title')), el('div', 'war-lobby-mission', v.mission));
    box.append(head);
    /* Operations' briefing (src/ui/briefing.js): its line, what to do
     * first, and the facts, each a label and a value. */
    if (v.brief) {
      const brief = el('div', 'war-brief');
      if (v.brief.line) {
        brief.append(el('p', 'war-brief-line', v.brief.line));
      }
      if (v.brief.objectives.length) {
        const first = el('div', 'war-brief-first');
        first.append(el('span', 'war-brief-label', str('brief.first')));
        for (const o of v.brief.objectives) {
          first.append(el('span', 'war-brief-objective', o));
        }
        brief.append(first);
      }
      const facts = el('dl', 'war-brief-facts');
      for (const f of v.brief.facts) {
        facts.append(el('dt', 'war-brief-label', f.label), el('dd', 'war-brief-value', f.value));
      }
      brief.append(facts);
      box.append(brief);
    }
    box.append(el('div', `war-lobby-status${v.countdown != null ? ' go' : ''}`, status));
    if (v.last) {
      box.append(el('div', 'war-lobby-last', str(`lobby.last_${v.last.state}`, {
        stars: v.last.stars ?? 0, kills: v.last.kills,
      })));
    }
    const list = el('div', 'war-lobby-pilots');
    for (const p of v.pilots) {
      const row = el('div', `war-lobby-pilot${p.ready ? ' ready' : ''}${p.me ? ' me' : ''}`);
      const who = el('div', 'war-lobby-who');
      who.append(el('span', 'war-lobby-name', p.name));
      if (p.host) {
        who.append(el('span', 'war-lobby-host', str('lobby.host')));
      }
      who.append(el('span', 'war-lobby-craft', p.aircraft));
      row.append(who, el('span', 'war-lobby-flag', str(p.ready ? 'lobby.flag_ready' : 'lobby.flag_waiting')));
      list.append(row);
    }
    box.append(list);
  }

  roomSeatRows(inRoom) {
    const s = this.settings;
    const world = seatedFreestyleMap(s);
    const worlds = MAPS.filter((x) => x.mode === 'freestyle').map((x) => x.id);
    const worldRow = inRoom
      ? { label: str('ui.the_world'), value: world ? world.name : '', note: str('friends.world_fixed'), info: true }
      : {
        ...choice(
          str('ui.the_world'),
          str('friends.world_note'),
          worlds,
          world ? world.id : worlds[0],
          (id) => mapById(id).name,
          /* The two fields seatMap writes, without its landing: this row
           * is on the screen the pilot is staying on, and pick() and
           * adjust() save and hand the shell the settings after it. */
          (id) => {
            s.freestyleMap = id;
            s.map = id;
          },
        ),
        pickOnly: true,
      };
    return [
      /* In a war room the row names the aircraft the war will seat (the
       * shell's craftShown), as the room's profile does: seating waits for
       * the briefing, and until then settings.airframe is the last flown. */
      { ...craftItem(s, null, this.craftShown ? this.craftShown(s) : s.airframe), open: () => this.openCraftRow(false) },
      worldRow,
    ];
  }

  /* The shell's room changed: redraw a screen that shows it. */
  refreshFriends() {
    const row = this.friendsRow ? this.friendsRow() : null;
    const inRoom = Boolean(row && row.inRoom);
    const entered = inRoom && !this.friendsInRoom;
    this.friendsInRoom = inRoom;
    /* In a room the lede, which is about making and joining one, gives its
     * height to the rows: see .screen-friends.in-room in index.html. */
    if (this.screens && this.screens.friends) {
      this.screens.friends.classList.toggle('in-room', inRoom);
    }
    if (['title', 'paused', 'friends', 'rooms', 'roomnew'].includes(this.screen)) {
      this.renderMenu();
    }
    /* The row the cursor was on, Make a room or Join, is gone the moment
     * the room opens, so the cursor goes to Fly, the screen's primary
     * between runs: card, Make a room, Fly is three presses of Enter. The
     * remembered row goes too, so the next visit opens on Fly as well
     * (restoreCursor). */
    if (entered) {
      delete this.cursorMemory.friends;
    }
    if (entered && this.screen === 'friends') {
      this.setCursor(this.restoreCursor());
    }
  }

  /* The Ghost row where the shell has provided one, as an array so the two
   * menus that carry it can spread it in place. Cycling steps through off,
   * the session ghosts, and whatever the board holds for this course. */
  ghostItems() {
    if (!this.ghostRow) {
      return [];
    }
    return [{
      label: str('ui.ghost'),
      value: this.ghostRow.value,
      note: this.ghostRow.note,
      adjust: (d) => {
        if (this.ghostRow) {
          this.ghostRow.cycle(d);
        }
      },
    }];
  }

  markTimePosted(posted) {
    this.timePosted = posted || { ok: true };
    if (this.screen === 'title' || this.screen === 'results') {
      this.renderMenu();
    }
  }

  /*
   * The chips that float over the world rather than living on a screen,
   * and the dock that stacks under them.
   *
   * `bug-chip` is the class all three wear and it is a bad name for a base
   * that Pause also uses. It stays anyway: see the stylesheet, where the
   * rule is, for what renaming it cost.
   *
   * Report bug is on every screen but the title. See the comment where it
   * is built: the corner over the three cards is a first impression and
   * the corner over everything else is the only visible way to say that
   * something is broken.
   */
  /* { text, button, act, reload } or null: the room bar (see where it is
   * built). Written only when it changed, as it is set every few frames. */
  setRoomBar(view) {
    const key = view ? `${view.text}\u0000${view.button || ''}` : '';
    this.roomBarView = view;
    if (key !== this.roomBarKey) {
      this.roomBarKey = key;
      Ui.text(this.roomBarText, view ? view.text : '');
      Ui.text(this.roomBarButton, view && view.button ? view.button : '');
      this.roomBarButton.hidden = !(view && view.button);
    }
    this.syncChips();
  }

  syncChips() {
    const dialog = this.nameDialog && !this.nameDialog.hidden;
    const bug = this.bugChip && !dialog && this.screen !== 'title';
    if (this.bugChip) {
      this.bugChip.hidden = !bug;
      this.bugChip.classList.toggle('on-flight', this.screen === 'flight');
    }
    /* Flight only. Paused already has Resume as its first row, and every
     * other screen has somewhere to go on it. */
    if (this.pauseChip) {
      this.pauseChip.hidden = dialog || this.screen !== 'flight';
      this.pauseChip.classList.toggle('on-flight', this.screen === 'flight');
    }
    if (this.swapChip) {
      this.swapChip.hidden = dialog || this.screen !== 'flight' || !this.onHotSwap;
    }
    /* The bug chip's mirror image: shown on the title and every menu,
     * never over a flight, and only where there are accounts. The signed
     * in pilot's chip, or the sign in panel in its place. */
    const corner = Boolean(this.signinChip) && accountsAvailable() && !dialog && this.screen !== 'flight';
    const pilot = corner && mayPlay();
    if (this.signinChip) {
      this.signinChip.hidden = !pilot;
      /* The title has no bug chip to share the first slot with; everywhere
       * else the bug chip has already taken it. */
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
    const roomBar = Boolean(this.roomBarView) && !dialog && this.screen !== 'flight';
    if (this.roomBar) {
      this.roomBar.hidden = !roomBar;
    }
    /* A room bar asking for the reload says it already, for the room. */
    if (this.updateBar) {
      this.updateBar.hidden = dialog || !this.updateReady || this.screen === 'flight' || (roomBar && this.roomBarView.reload);
    }
    /* A bar that goes takes its stop with it (barStops), and a cursor that
     * was on it would point past the end of the list, where Enter does
     * nothing. It goes back to the list's last stop. Only when the stops
     * change: the room bar calls this four times a second, and a whole
     * items() each time is a menu rebuilt four times a second. */
    const stops = this.barStops().length;
    if (stops !== this.barStopCount) {
      this.barStopCount = stops;
      const items = this.items();
      if (this.cursor >= items.length) {
        let i = items.length - 1;
        while (i > 0 && !this.isStop(items[i])) {
          i -= 1;
        }
        this.cursor = Math.max(0, i);
        this.syncCursor(false);
      } else {
        this.markBars(items);
      }
    }
    /* The dock takes the second slot when there is a chip in the first and
     * the corner when there is not, which is the title. Written as a class
     * rather than as a top in pixels here, so the status bar's own offset
     * stays in the stylesheet with the rest of the stacking. The sign in
     * chip takes the title's first slot when it is up, so it counts here
     * too. */
    if (this.musicDock) {
      this.musicDock.classList.toggle('under-chip', Boolean(bug || corner));
    }
    this.syncMusicDock();
  }

  /*
   * Is a flight up. Paused counts, and that is the decision in this
   * predicate rather than an oversight: the pause screen keeps the flight
   * display, the lap clock and the pack on screen behind it, the flight is
   * still there to go back to, and swapping the bed out and back every
   * time somebody taps Escape mid race would be the most obtrusive thing
   * in the mix. One predicate, used by the dock and by the music context,
   * so the dock cannot say flying while the bed says menus.
   */
  flying() {
    return this.screen === 'flight' || this.screen === 'paused';
  }

  skipMusic(dir) {
    if (typeof this.onMusicSkip === 'function') {
      this.onMusicSkip(dir);
    }
  }

  /*
   * Mute, and back to where it was.
   *
   * Zero IS the off state already: the Music stepper under Pilot prints
   * Off at zero, applyMix stops the bed at zero, and the dock has dimmed
   * itself on `musicLevel <= 0` since it was built. So this writes the one
   * number rather than inventing a second flag that could disagree with it.
   *
   * The level it restores is the one it muted, held for this visit only. A
   * pilot who mutes, closes the tab and comes back gets the default rather
   * than their own number, because the alternative is a settings key whose
   * whole job is to remember a number the pilot can see and set in one
   * press on the row it came from.
   *
   * onSettings is what actually stops the sound: applyMix in main.js reads
   * the level and the enable off the settings object. Without it the dock
   * would dim and the bed would play on.
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
    /* The Music row prints Off or a number, and it is one screen away. */
    this.renderMenu();
    this.announce(s.musicLevel > 0 ? str('ui.music_on') : str('ui.music_muted'));
  }

  setMusicNow(st) {
    if (!st) {
      return;
    }
    this.musicNow = st;
    this.syncMusicDock();
  }

  /*
   * The room's war state (the shell, each frame; 'lobby' with none). From
   * the briefing until the room is back in its lobby the dock is not drawn
   * over the war: until the end it named and skipped menu tracks that the
   * war's own music had replaced, and over the end banner it is clutter
   * (the Music row under Pilot still sets the level). And #ui.war-on keeps
   * the freestyle clock off: it counted an airtime over the war whenever
   * the Avionics HUD was not up (a chase camera, a wreck).
   */
  setWarState(state) {
    if (this.warState === state) {
      return;
    }
    this.warState = state;
    this.root.classList.toggle('war-on', state !== 'lobby');
    this.syncMusicDock();
  }

  syncMusicDock() {
    if (!this.musicDock) {
      return;
    }
    const dialog = this.nameDialog && !this.nameDialog.hidden;
    const name = (this.musicNow && this.musicNow.name) || MENU_TRACKS[0]?.name || '';
    /* With no record playing there is nothing to name, skip or mute. */
    const hide = !name
      || dialog
      || this.screen === 'calibrate'
      || this.screen === 'padpick'
      || (this.warState != null && this.warState !== 'lobby')
      || !this.settings.sound;
    this.musicDock.hidden = hide;
    this.musicDock.classList.toggle('on-flight', this.flying());
    const muted = this.settings.musicLevel <= 0;
    this.musicDock.classList.toggle('is-muted', muted);
    this.musicTitle.textContent = name;
    /* The name, because it ellipsises, and then what the click does. */
    this.musicTitle.title = muted ? str('ui.click_to_unmute', { name }) : str('ui.click_to_mute', { name });
  }


  renderMenu() {
    /* Also syncs the music dock: the sign in chip's label is a callsign or
     * a prompt, and either can have just changed without the screen itself
     * changing. */
    this.syncChips();
    if (this.screen === 'standings') {
      this.paintStandings();
    }
    if (this.screen === 'launch' && this.launchLede) {
      const seat = activeCourseSummary();
      const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
      const name = seat && seat.name ? seat.name : m.name;
      const gates = seat && seat.gates ? `${seat.gates} gates` : '';
      const by = byLine(seat);
      this.launchLede.textContent = [name, gates, by].filter(Boolean).join(' \u00b7 ');
    }
    this.closeDrop();
    if (this.screen === 'courses') {
      this.renderMapCards();
      this.renderCourseCards();
    }
    if (this.screen === 'freestyle') {
      this.renderMapCards();
    }
    if (this.screen === 'tricks') {
      this.renderTricks();
    }
    if (this.screen === 'title') {
      this.renderTitleCards();
      this.renderTitleRooms();
    }
    if (this.screens && this.screens.title) {
      /*
       * onGate(), NOT `!this.mode`, and this line was the whole of a bug
       * that made the front page unusable.
       *
       * The gate has two halves, the aircraft and the mode, and
       * `!this.mode` only ever saw one of them. So whenever the mode
       * was already answered while the aircraft still was not, the
       * title dressed itself as the menu: `is-gate` never went on, and with
       * it went the rule that lays the two cards out
       * (`.screen-title.is-gate .gate-cards`), the rules that take the keep
       * note and the best-lap chip off a screen that is
       * asking one question, and the rule that hides an empty menu panel.
       * The pilot got a blank box where the aircraft should be, two
       * paragraphs that belong to a seat they had not chosen, and no way to
       * fly. Reported as "the menu is not populated and i can't fly it".
       *
       * Both routes to it are ordinary. The track builder's Fly this track
       * link is `?map=custom`, which linkedMode reads as race, so every
       * pilot arriving from the builder hit it.
       *
       * onGate() is the one definition, `this.screen === 'title' &&
       * (this.craftGate || !this.mode)`, and it is what cardScreen and the
       * key handling have always used. This line disagreeing with them is
       * what let the screen be a gate for one half of the code and a menu
       * for the other.
       */
      const gate = this.onGate();
      this.screens.title.classList.toggle('is-first', Boolean(this.firstRun));
      /* The gate is one question, so the lines that describe a seat the
       * pilot has not chosen to fly yet come off the screen behind it. */
      this.screens.title.classList.toggle('is-gate', gate);
      this.setTitleHint(gate);
    }
    const host = {
      title: this.titleMenu,
      howto: this.howtoMenu,
      tricks: this.trickMenu,
      credits: this.creditsMenu,
      courses: this.coursesMenu,
      freestyle: this.freestyleMenu,
      pilot: this.pilotMenu,
      friends: this.friendsMenu,
      rooms: this.roomPages.rooms && this.roomPages.rooms.menu,
      roomnew: this.roomPages.roomnew && this.roomPages.roomnew.menu,
      quad: this.quadMenu,
      launch: this.launchMenu,
      standings: this.standingsMenu,
      rates: this.ratesMenu,
      pids: this.pidsMenu,
      fc: this.fcMenu,
      paused: this.pausedMenu,
      results: this.resultsMenu,
    }[this.screen];
    if (!host) {
      return;
    }
    /* The flight controller's Save, Discard, Export and Exit rows group
     * into one Configurator-yellow button bar rather than running down
     * the list. Built on first sight of an fc-btn row. */
    let fcBar = null;
    const items = this.items();
    if (this.cursor >= items.length || !this.isStop(items[this.cursor])) {
      /* titleStop rather than firstStop, so the first paint of the aircraft
       * gate puts the cursor on the aircraft that is seated. Everywhere else
       * the two are the same call. */
      this.cursor = this.titleStop();
    }
    const scroll = host.scrollTop;
    host.textContent = '';
    /* The Courses screen draws its choices as cards above this menu, so the
     * rows here are only what is left over. */
    const drawn = items.filter((it) => !it.bar);
    const rows = this.cardScreen()
      ? drawn.filter((it) => !it.map && !it.course && !it.card && !it.lobby)
      : drawn;
    const offset = drawn.length - rows.length;
    this.rowOffset = offset;
    this.menuRows = [];
    rows.forEach((it, k) => {
      const i = k + offset;
      /* A heading is not a row. It gets no cursor, no hover and no click,
       * and syncCursor never has to think about it. */
      if (it.section) {
        const head = el('div', 'menu-section', it.label);
        host.append(head);
        this.menuRows.push(head);
        return;
      }
      const cls = ['row'];
      /* The kind is a class, so the signature is CSS rather than another
       * branch in here. A value row needs no marker: it already carries its
       * own control on the right. */
      const kind = this.rowKind(it);
      if (kind === 'navigation') {
        cls.push('row-nav');
      } else if (kind === 'link') {
        cls.push('row-link');
      }
      if (it.info) {
        cls.push('row-info');
      }
      if (it.disabled) {
        cls.push('row-grey');
      }
      if (it.primary) {
        cls.push('row-primary');
      }
      if (it.rowClass) {
        cls.push(it.rowClass);
      }
      const row = el('div', cls.join(' '));
      /*
       * ROVING TABINDEX. Exactly one row in the list is reachable by Tab,
       * the one under the cursor, and the rest are focusable only by
       * script. That is the standard listbox contract and it is what makes
       * document.activeElement and this.cursor the same thing rather than
       * two authorities that agree by accident.
       *
       * What it buys, concretely: Tab lands on the row a pilot was last
       * looking at rather than skipping the menu entirely, a screen reader
       * follows the cursor because the cursor IS the focus, and the
       * browser's own focus ring appears exactly where the painted bar is.
       *
       * The role is option-in-a-listbox rather than button-per-row: a row
       * is a thing selected from a set, and calling each one a button would
       * have a reader announce nine buttons with no relationship.
       */
      row.tabIndex = i === this.cursor ? 0 : -1;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === this.cursor));
      if (it.id) {
        row.dataset.rowId = it.id;
      }
      /*
       * Focus arriving from anywhere the shell did not drive it: Tab,
       * shift-Tab, a screen reader's own navigation, a click. The cursor
       * follows, because a focused row that is not the cursor is the two
       * authorities problem again with the roles reversed.
       */
      row.addEventListener('focus', () => {
        if (this.cursor !== i) {
          this.cursor = i;
          this.syncCursor(false);
        }
      });
      row.append(el('span', 'row-label', it.label));
      /* Before the adjust branch: a typed row has arrows too, and the
       * stepper alone would be the old list row without the field that is
       * the whole point of it. */
      if (it.num && it.range) {
        row.append(this.makeSliderControl(it, i));
      } else if (it.num) {
        row.append(this.makeNumber(it, i));
      } else if (it.text) {
        row.append(this.makeSearch(it, i));
      } else if (it.sw) {
        row.append(this.makeSwitch(it, i));
      } else if (fitsAsSegments(it)) {
        row.append(this.makeSegments(it, i));
      } else if (it.options) {
        row.append(this.makeDrop(it, i));
      } else if (it.step || it.adjust) {
        row.append(this.makeStepper(it, i));
      } else if (it.value != null) {
        const val = el('span', 'row-value', it.value);
        if (it.info) {
          val.title = it.value;
        }
        row.append(val);
      }
      /* A browser player reaches for the mouse. A menu that only answers
       * to arrow keys reads as broken, not as keyboard first. */
      /* Hover only when the pointer actually moved. mouseenter fires when
       * a rebuilt row appears under a stationary pointer, and so does
       * mousemove after scrollIntoView: both snapped the cursor back and
       * made the arrow keys look broken. */
      row.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-control')) {
          return;
        }
        this.closeDrop();
        this.cursor = i;
        this.syncCursor(false);
        /* Value rows change through the arrows or the dropdown. Clicking
         * the label only focuses them, except a typed row, where the label
         * is the largest thing to aim at and typing is what it is for.
         * Action rows still fire. */
        if (it.num) {
          this.focusNumber(i);
          return;
        }
        if (!it.adjust && !it.options && !it.step && !it.info) {
          this.select();
        }
      });
      if (this.screen === 'fc' && it.rowClass === 'fc-btn') {
        if (!fcBar) {
          fcBar = el('div', 'fc-bar');
          host.append(fcBar);
        }
        fcBar.append(row);
      } else {
        host.append(row);
      }
      this.menuRows.push(row);
    });
    /*
     * Keeping the scroll position is right when the list is the same list,
     * and wrong when it has been replaced. A confirm panel is three rows
     * where 144 were, so a restored scrollTop of 3600 px hides all three
     * behind the header and the pilot is asked a question they cannot read.
     * Anything shorter than the box gets the top.
     */
    host.scrollTop = host.scrollHeight > host.clientHeight ? scroll : 0;
    /* Before syncCursor paints anything: the cursor belongs to a row, not
     * to an index, and this list may have changed length. */
    this.restoreFocusRow();
    this.syncFrame();
    this.syncCursor(false);
    this.syncRates();
    this.syncPids();
    this.syncFcChrome();
    /* A click that was travelling from one typed field to another, landing
     * now that the rows it was aiming at exist again. See makeNumber. */
    if (this.numberFocusWanted != null) {
      const want = this.numberFocusWanted;
      this.numberFocusWanted = null;
      this.focusNumber(want);
    }
  }

  show(screen) {
    this.closeDrop();
    /* Inside a room the room screen is home, where the title would be
     * (rule 3 and 4 of docs/FLOW-AUDIT.md): whatever ends on the title,
     * a run quit, Escape on the results, a world swap, ends there. */
    if (screen === 'title' && this.inRoom && this.inRoom()) {
      screen = 'friends';
    }
    /*
     * A STICK HELD THROUGH A SCREEN CHANGE IS NOT A GESTURE ON THE SCREEN
     * IT LANDS ON.
     *
     * pollPad is edge triggered off padPrev, which works as long as pollPad
     * saw the stick held on the screen being left. Three screens break that
     * promise, and they break it in the direction that fires: flight resets
     * padPrev to all false on every poll, and the calibrate and joystick
     * picker screens are fed channels that input.js pins to zero while they
     * are up, because the wizard owns the sticks. So the tracker believed
     * every stick was centred, and the first poll on the new screen saw a
     * held stick go from false to true and called it a fresh flick.
     *
     * Found on the check step, where it is not an edge case but the normal
     * way through: the pilot holds a stick to aim the reverse control, and
     * the reverse they just pressed turns their held roll from right into
     * LEFT, which is Back. Save, and the shell threw them out of Settings
     * onto the front page. The same fault pauses a run with roll held and
     * moves the cursor on the pause menu.
     *
     * So the next poll after any screen change SEEDS padPrev instead of
     * acting on it. The cost is that a deliberate flick made in the same
     * two milliseconds as the change is swallowed, which is a cost the edge
     * trigger is already paying everywhere else: let go and flick again.
     */
    this.padRearm = true;
    this.swapPadPrev = null;
    /* A picker belongs to the screen it was opened over, and so does the
     * hangar, whose unsaved paint goes with it. */
    if (this.carousel && this.carousel.isOpen && screen !== this.screen) {
      this.carousel.close();
    }
    if (this.hangar && this.hangar.isOpen && screen !== this.screen) {
      this.hangar.cancel();
    }
    const pinned = locationHashScreen();
    if (pinned && screen === 'title') {
      screen = pinned;
      if (!this.returnTo) {
        this.returnTo = 'title';
      }
    }
    if (this.screen === 'courses' && screen !== 'courses') {
      /* Nothing draws a thumbnail for a screen nobody is looking at. */
      this.stopReels();
      this.mapCards = null;
      this.courseCards = null;
      this.courseCardKey = null;
      this.cardSubject = null;
      this.lastCardKey = null;
      this.newTrackOpen = false;
    }
    /* ratesFrom belongs to one visit to the Rates screen. Leaving that screen
     * for anywhere else drops it, so a later show('rates') that did not come
     * through act('rates'), a world swap keeping the pilot in place, cannot
     * inherit a stale origin and send Escape to the wrong list. Re-showing
     * rates over itself is exactly that case and must NOT clear it. */
    /*
     * roomFrom belongs to one visit. Landing on the title, or on the room
     * it points at, means the trip it described is over; anything else is
     * still inside the same trip and keeps it, which is what lets Quad's
     * Rates signpost come back through Quad to Freestyle.
     */
    if (this.roomFrom && (screen === 'title' || screen === this.roomFrom)) {
      this.roomFrom = null;
    }
    if (this.screen === 'rates' && screen !== 'rates') {
      this.ratesFrom = null;
    }
    /* A storage complaint belongs to the visit that caused it. Walking back
     * in should not meet a warning about a save attempted ten minutes ago. */
    if (screen === 'rates' && this.screen !== 'rates') {
      this.ratesNotice = null;
    }
    /*
     * pidsFrom SURVIVES A TRIP TO THE BENCH, because the bench comes back
     * here: leaveFc names pids as one of its three destinations, the same
     * way fcFrom names pids as one of its three origins.
     *
     * Clearing it on the way out is why Quad, Tune, Every setting, back,
     * back landed on the TITLE. The PIDs room had forgotten it was opened
     * from Quad while the pilot was one room deeper, so Escape fell through
     * to returnTo and threw them out of the machine entirely. Every other
     * exit still drops it, and every other arrival sets it: act('pids') is
     * the only show('pids') in the file.
     */
    if (this.screen === 'pids' && screen !== 'pids' && screen !== 'fc') {
      this.pidsFrom = null;
    }
    if (this.screen === 'fc' && screen !== 'fc') {
      this.fcFrom = null;
    }
    if (this.screen === 'credits' && screen !== 'credits') {
      const url = new URL(window.location.href);
      if ((url.hash || '') === '#credits') {
        url.hash = '';
        history.replaceState(null, '', url);
      }
    }
    /*
     * Remember where the cursor was, keyed by the screen being left.
     *
     * Settings, arrow down to Rates, Enter, Escape used to land on row 0 of
     * 30, twenty rows above the row just left, because show() reset the
     * cursor on every transition including a return. A pilot tuning rates
     * makes that trip dozens of times in a session.
     *
     * The ID is stored, not the index, because the index means nothing once
     * a list changes length, and these lists do: rows appear and vanish
     * with the loaded track, the board and the dirty flag.
     *
     * It used to store the label, which is the same idea done with the only
     * handle a row had at the time. A label is not unique: Back is on nine
     * screens, every section heading repeats, and the bench prints the same
     * `feature` prefix a dozen times, so a restore could land on the first
     * row that happened to read the same. See stampIds.
     */
    const leaving = this.items()[this.cursor];
    if (this.screen && leaving && leaving.id) {
      this.cursorMemory[this.screen] = leaving.id;
    }
    /* Entering a different screen drops the remembered row: its id belongs
     * to the screen being left. Ids are screen prefixed so a stale one
     * could not match anyway, and clearing it says that on purpose rather
     * than relying on the prefix. */
    if (this.screen !== screen) {
      this.focusId = null;
    }
    /* Arriving somewhere is interaction: it stops a preview recorder from
     * starting into the same frame that is still painting the room. */
    this.noteInteraction();
    this.screen = screen;
    /* this.screen is already the new one, so items() describes where we are
     * going. Settings opens on its first real row rather than on a heading. */
    this.cursor = this.restoreCursor();
    if (screen === 'courses') {
      /* Both halves on every entry. The library is read here rather than
       * cached for the session because the builder hands the pilot back
       * here: a track saved there has to be on the list they come back to. */
      this.loadLocalCourses();
      this.loadBoardCourses();
      this.loadCloudCourses();
    }
    if (screen === 'howto') {
      this.renderHowto();
    }
    /* The film is the only thing in this shell that asks for frames outside
     * flight, so it runs on exactly one screen and stops the moment that
     * screen is left. */
    if (this.trickPlayer) {
      if (screen === 'tricks') {
        this.trickShown = '';
        this.renderTricks();
      } else {
        this.trickPlayer.stop();
      }
    }
    if (screen === 'credits') {
      const url = new URL(window.location.href);
      if ((url.hash || '') !== '#credits') {
        url.hash = 'credits';
        history.replaceState(null, '', url);
      }
    }
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    /* Paused keeps the flight display up, dimmed: the lap clock and the
     * pack are what the player paused to look at. */
    this.syncFrame();
    this.osd.style.display = screen === 'flight' || screen === 'paused' ? '' : 'none';
    this.osd.className = screen === 'paused' ? 'osd dim' : 'osd';
    /* The score follows the OSD onto and off the screen, but only in
     * freestyle: a race has no score and an empty Score 0 over a lap timer
     * is a readout that never changes. */
    this.syncScoreVisible();
    this.renderMenu();
    this.syncChips();
    /* Last, and unconditionally. Last because a listener is entitled to
     * read a settled screen; unconditionally because show() is also how
     * a screen is re-entered, and the shell side of this is idempotent by
     * construction rather than by this file guessing what changed. */
    if (typeof this.onScreenChange === 'function') {
      this.onScreenChange(screen);
    }
  }

  bindLocationHash() {
    this.applyLocationHash();
    window.addEventListener('hashchange', () => this.applyLocationHash());
  }

  applyLocationHash() {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (h === 'credits') {
      if (this.screen !== 'credits' && this.screen !== 'flight' && this.screen !== 'paused') {
        this.act('credits');
      }
      return;
    }
    if (this.screen === 'credits') {
      this.back();
    }
  }

  /*
   * Fly a published course, in this tab.
   *
   * The old path for this was Choose new map, which opened the board in a
   * new tab so the player could press its Fly button, which opened a THIRD
   * tab with a second simulator in it. The board hands a course over through
   * one fetch and one storage write, which is what adoptShareFromLocation
   * already does for a Fly link, so the screen can simply do it here.
   */
  /* The card `cardSubject` names, or null. */
  subjectCard() {
    if (!this.cardSubject) {
      return null;
    }
    return this.items().find((it) => it.course && courseCardKey(it) === this.cardSubject) || null;
  }

  /* Where the cursor goes when a chosen card is closed: back onto that card,
   * so going back leaves the player where they were rather than at the top. */
  cardCursor() {
    const items = this.items();
    const i = items.findIndex((it) => it.course && courseCardKey(it) === this.lastCardKey);
    return i < 0 ? this.firstStop(items) : i;
  }

  /*
   * PLAY: fly the track the seat now holds. The seat goes to Track mode and
   * the shell builds the track's world if it is not the one standing, seats
   * the track's gates on it and opens the launch card, where Fly goes
   * (main.js 'play'). The pilot is on the title under the loading screen
   * meanwhile, which is where a world swap always lands.
   */
  play() {
    this.settings.map = 'track';
    this.mode = 'race';
    saveSettings(this.settings);
    this.returnTo = 'title';
    if (this.onAction) {
      this.onAction('play');
    }
  }

  /*
   * Open the builder from My tracks: on one of the pilot's own tracks
   * (`id`, Edit) or on an empty one in a world (`map`, New track), or on
   * the casual sky course laid for it there (`casual`), flying. The
   * shell builds the world if it has to and hands the pilot the builder's
   * camera there; Escape out of the builder comes back to this screen.
   */
  openBuilder({ map, id = null, casual = false }) {
    if (!this.onBuild) {
      return;
    }
    Promise.resolve(this.onBuild({ map, id, casual })).catch((e) => {
      /* A track deleted in another tab since this list was read is the one
       * way in here that is not a bug; the list is read again either way. */
      console.error(e);
      this.localNote.textContent = str('ui.that_track_is_no_longer_saved');
      this.loadLocalCourses();
      this.renderMenu();
    });
  }

  /* What a chosen card's rows do: see courseCardRows. */
  actOnCard(action, card) {
    const t = card.course.track;
    const board = card.course.kind === 'board';
    if (card.course.kind === 'cloud') {
      if (action === 'card-fly') {
        this.cardSubject = null;
        this.seatCloud(t, () => this.play());
      } else if (action === 'card-editcopy') {
        this.editCloudCopy(t);
      }
      return;
    }
    if (action === 'card-fly') {
      this.cardSubject = null;
      /* In a race lobby, the host's choice is the room's track: back to
       * the lobby with it seated (src/main.js onTrackChosen), not up. */
      const go = () => (this.onTrackChosen && this.onTrackChosen() ? null : this.play());
      if (board) {
        this.openBoardCourse(t.id, go);
      } else if (this.seatLocal(t.id)) {
        go();
      }
      return;
    }
    if (action === 'card-board') {
      openNamedWindow(boardPageUrl(t.board, boardCraft(this.settings.airframe)), BOARD_WINDOW);
      return;
    }
    if (action === 'card-standings') {
      if (board) {
        this.showStandings(t);
      }
      return;
    }
    if (action === 'card-edit') {
      this.openBuilder({ map: t.map, id: t.id });
      return;
    }
    if (action === 'card-duplicate') {
      this.duplicateCard(t, board);
      return;
    }
    if (action === 'card-rename') {
      this.askForm({
        title: str('ui.rename_this_track'),
        confirmLabel: str('ui.rename'),
        fields: [{ key: 'name', label: str('main.track_name'), value: t.name, maxLength: 80, placeholder: str('main.track_name') }],
      }).then((values) => {
        const doc = values && values.name ? loadMapTrack(t.id) : null;
        if (!doc) {
          return;
        }
        doc.name = values.name;
        this.storeCardChange(saveTrack(doc), `local:${doc.id}`);
      });
      return;
    }
    if (action === 'card-delete') {
      this.askConfirm({
        title: str('ui.delete', { name: t.name }),
        detail: tracksConfigured() ? str('cloud.delete_detail') : str('ui.this_browser_holds_the_only_copy'),
        yes: str('ui.delete_label'),
        no: str('ui.keep_it'),
        danger: true,
      }).then((ok) => {
        if (!ok) {
          return;
        }
        const seat = readShareImport();
        if (seat && seat.id === t.id) {
          clearShareImport();
          this.setShare(null);
        }
        this.storeCardChange(deleteTrack(t.id), null);
      });
    }
  }

  /*
   * A copy under a new id and a name that says it is one: of one of the
   * pilot's own from the library, of a board track fetched from the board.
   * The copy is the pilot's, so it can be edited, renamed and published.
   */
  duplicateCard(t, board) {
    const copyOf = (doc) => {
      const copy = duplicateTrack(normalize(doc).doc, str('ui.copy_of', { name: t.name }));
      this.storeCardChange(saveTrack(copy), `local:${copy.id}`);
    };
    if (!board) {
      const doc = loadMapTrack(t.id);
      if (doc) {
        copyOf(doc);
      }
      return;
    }
    this.boardNote.textContent = str('ui.loading_2', { name: t.name });
    fetchTrackDocument(t.id, t.board)
      .then((payload) => {
        this.boardNote.textContent = '';
        copyOf(payload.document || payload);
      })
      .catch((err) => {
        this.boardNote.textContent = str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err });
      });
  }

  /* After a card's row wrote the library: say so if the browser refused,
   * read the list again, and put the cursor on the card `key` names (the
   * copy, the renamed track), or on the list's first card when it is gone. */
  storeCardChange(ok, key) {
    this.localNote.textContent = ok ? '' : str('ui.this_browser_would_not_store_that');
    this.loadLocalCourses();
    this.cardSubject = null;
    this.lastCardKey = key;
    this.renderMenu();
    this.renderCourseCards();
    this.setCursor(this.cardCursor());
  }

  openBoardCourse(id, then = null) {
    const track = (this.boardCourses || []).find((t) => t.id === id)
      || (this.standingsFor && this.standingsFor.id === id ? this.standingsFor : null);
    if (!track || this.openingBoardCourse) {
      return;
    }
    this.openingBoardCourse = true;
    this.boardNote.textContent = str('ui.loading_2', { name: track.name });
    if (!this.onBoardCourse) {
      this.openingBoardCourse = false;
      this.boardNote.textContent = str('ui.could_not_be_loaded_from_the', { name: track.name });
      return;
    }
    this.onBoardCourse(track).then((ok) => {
      this.openingBoardCourse = false;
      if (!ok) {
        this.boardNote.textContent = str('ui.could_not_be_loaded_from_the', { name: track.name });
        return;
      }
      this.boardNote.textContent = '';
      if (then) {
        then();
      }
    }).catch((err) => {
      this.openingBoardCourse = false;
      this.boardNote.textContent = str('ui.could_not_be_loaded', { name: track.name, v2: err.message ?? err });
    });
  }

  /*
   * The tutorial's one column, and the sticks above it. Rebuilt rather than
   * toggled because it is six lines of type and a switch nobody flips twice.
   */
  setHowtoSource(id) {
    this.howtoSource = ['radio', 'launch', 'touch', 'mouse'].includes(id) ? id : 'keyboard';
    this.renderHowto();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
  }

  renderHowto() {
    if (!this.howtoKeys) {
      return;
    }
    const source = this.howtoSource;
    for (const [id, b] of Object.entries(this.howtoTabs)) {
      b.classList.toggle('on', id === source);
    }
    this.howtoKeys.textContent = '';
    const rows = source === 'touch'
      ? [
        [str('ui.left_thumb'), `${stickCaption(this.settings.stickMode, 'left')}.${thrNote(this.settings.stickMode, 'left')}`],
        [str('ui.right_thumb'), `${stickCaption(this.settings.stickMode, 'right')}.${thrNote(this.settings.stickMode, 'right')}`],
        [str('ui.the_whole_corner'), str('ui.the_pad_is_bigger_than_the')],
        ['Landscape', str('ui.turn_the_phone_sideways_the_pads')],
        ['Turtle', str('ui.if_you_end_up_inverted_on')],
        ['Pause', str('ui.the_pause_chip_top_right_hits')],
      ]
      : source === 'radio'
      ? [
        [str('ui.left_stick_mode', { normaliseStickMode: normaliseStickMode(this.settings.stickMode) }), str('ui.set_the_mode_on_the_radio', { stickCaption: stickCaption(this.settings.stickMode, 'left') })],
        [str('ui.right_stick'), `${stickCaption(this.settings.stickMode, 'right')}.`],
        [str('ui.before_you_fly'), str('ui.put_the_radio_in_joystick_mode')],
        [str('ui.in_the_menus'), str('ui.pitch_moves_the_cursor_roll_right')],
        ['Acro', str('ui.hands_off_holds_the_attitude_you')],
        ['Turtle', str('ui.if_you_end_up_inverted_on_2')],
      ]
      : source === 'mouse'
        ? [
          [str('ui.mouse'), str('ui.howto_mouse_move')],
          [str('ui.howto_mouse_wheel_key'), str('ui.howto_mouse_wheel')],
          [str('ui.howto_mouse_buttons_key'), str('ui.howto_mouse_buttons')],
          [str('ui.howto_mouse_centre_key'), str('ui.howto_mouse_centre')],
          [str('ui.howto_mouse_keys_key'), str('ui.howto_mouse_keys')],
          ['Esc', str('ui.howto_mouse_escape')],
          [str('ui.howto_mouse_on_key'), str('ui.howto_mouse_on', { pilot: SCREEN_TITLES.pilot })],
        ]
      : source === 'launch'
        ? [
          [str('ui.what_it_is'), str('ui.betaflight_race_start_pitch_the_quad')],
          [str('ui.turn_it_on'), str('ui.quad_launch_control_on_it_stays')],
          [str('ui.set_the_angle'), str('ui.throttle_at_idle_pitch_forward_until')],
          ['Go', str('ui.punch_throttle_past_about_20_percent')],
          ['Keyboard', str('ui.up_arrow_is_pitch_forward_w')],
          ['Radio', str('ui.same_sequence_as_a_real_board')],
          ['Turtle', str('ui.if_you_tip_over_on_the')],
        ]
      : [
        ...keyHowtoRows(this.settings.stickMode),
        ['L', str('ui.launch_control_if_you_turned_it')],
        [str('ui.r_then_escape'), str('ui.back_to_the_start_line_and')],
        ['Turtle', str('ui.if_you_end_up_inverted_on_3')],
        ['F8', str('ui.report_a_bug_or_give_feedback')],
      ];
    for (const [k, v] of rows) {
      this.howtoKeys.append(el('dt', null, k), el('dd', null, v));
    }
    this.howtoLive.textContent = source === 'touch'
      ? str('ui.the_pads_appear_in_flight_under')
      : source === 'radio'
        ? str('ui.move_your_sticks_these_follow_the')
        : source === 'launch'
          ? str('ui.l_arms_it_pitch_centre_punch')
          : source === 'mouse'
            ? str('ui.howto_mouse_live')
            : str('ui.press_the_keys_these_follow_your');
    this.howtoMode.textContent = source === 'touch'
      ? str('ui.thumb_sticks_are_a_real_proportional')
      : source === 'radio'
        ? str('ui.a_radio_flies_acro_by_default')
        : source === 'launch'
          ? str('ui.off_by_default_because_a_punch')
          : source === 'mouse'
            ? str('ui.howto_mouse_mode')
            : str('ui.keys_are_on_or_off_so');
  }

  /* Live channels for the tutorial's gimbals, fed by the shell's loop. */
  setHowtoSticks(ch) {
    if (!this.howtoStickLeft || this.screen !== 'howto') {
      return;
    }
    placeSticks(this.howtoStickLeft, this.howtoStickRight, ch, this.settings.stickMode);
  }

  setCraftCaption(text) {
    /* main.js calls syncAngleMode from the frame loop, on every screen, so
     * this wrote into the Settings caption sixty times a second while the
     * pilot was looking at something else. */
    Ui.text(this.craftCaption, text);
  }

  isModal() {
    return this.screen !== 'flight';
  }

  /* The title while the question of what to fly is still open. Three
   * things behave differently there and nowhere else on this screen: the
   * three choices are cards, the left and right arrows move between them,
   * and a radio's sticks walk them instead of posing the airframe. */
  /* Seat an aircraft that may race the seated track, for Fly: see
   * seatCraftForDoc. */
  seatCraftForCourse() {
    if (this.settings.map !== 'track') {
      return null;
    }
    const seat = activeCourseSummary();
    return seat && seat.doc ? this.seatCraftForDoc(seat.doc) : null;
  }

  /*
   * Seat an aircraft that may race a track, if the one seated may not, and
   * return it, or null when nothing moved. Every quad may, and every fixed
   * wing that fits every gate (src/game/verify.js planesFor); a plane that
   * does not fit gives way to DEFAULT_AIRFRAME, the racer.
   *
   * The boot path calls this with a track that arrived by link, before
   * anything reads a seat, because the link filed it in the seat of the
   * aircraft flying when it arrived, and the pilot has to land in the seat
   * that holds it.
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
  }

  /* What the title's one Escape hint is named for: the screen it lands on.
   * One name now, because there is one gate whatever is seated. Naming the
   * destination rather than saying Back is deliberate, see legendFor, and
   * "what to fly" is what the three cards between them ask. */
  gateLabel() {
    return str('ui.what_to_fly');
  }

  onGate() {
    return this.screen === 'title' && (this.craftGate || !this.mode);
  }

  /* Every screen that draws some of its choices as cards. */
  cardScreen() {
    return isCardScreen(this.screen) || this.onGate();
  }

  /*
   * The title's hint line, which is different on the two states this screen
   * has. Escape is on it once there is a gate behind the menu to go back
   * to, and is off it on the gate, where the key does nothing: a prompt for
   * a key that is a no-op is worse than no prompt at all.
   */
  /*
   * Where the cursor lands when the title's cursor is reset.
   *
   * On the gate it lands on the card that is SEATED, so a returning whoop
   * pilot sees their own answer under the cursor rather than the five inch,
   * and pressing Enter twice from a cold start keeps them where they were.
   * The aircraft is what is remembered, so before the mode is answered the
   * standing answer is that machine's racing card: see seatedWay.
   * Everywhere else it is the first row that can be chosen, which is what it
   * has always been.
   */
  titleStop() {
    const items = this.items();
    if (this.onGate()) {
      /* At home, Flight Club, the first hub (the owner, 2026-10-03); in
       * a hub, the seated aircraft's card. */
      const seated = seatedWay(this.settings, this.mode).action;
      const want = this.hub ? seated : `hub-${HUBS[0].id}`;
      const at = items.findIndex((it) => it.action === want);
      if (at >= 0) {
        return at;
      }
    }
    return this.firstStop(items);
  }

  setTitleHint(gate) {
    if (!this.titleHint) {
      return;
    }
    const keys = this.titleHint.querySelector('.hint-keys');
    const copy = this.titleHint.querySelector('.hint-copy');
    if (!keys || !copy) {
      return;
    }
    /* The gate is the root: nothing behind it, so no Escape key on the
     * line. The menu behind it has somewhere to go back to, and the copy
     * below names it. */
    const want = gate ? ['←→', 'Enter'] : ['↑↓', 'Enter', 'Esc'];
    const have = [...keys.children].map((k) => k.textContent);
    if (have.length !== want.length || want.some((k, i) => have[i] !== k)) {
      keys.textContent = '';
      for (const k of want) {
        keys.append(el('kbd', null, k));
      }
    }
    if (gate) {
      copy.textContent = str('ui.left_and_right_choose_enter_opens');
    } else {
      copy.textContent = str('ui.arrow_keys_move_enter_selects_escape');
    }
  }

  /*
   * WRITE ONLY WHAT CHANGED.
   *
   * These three exist because setOsd runs on every flight frame and used to
   * assign textContent and className to about a dozen nodes whether or not
   * the value had moved. Assigning the string a node already holds still
   * replaces its Text child and still invalidates style, and this overlay is
   * composited above the WebGL canvas, which is the arrangement an
   * integrated GPU pays for most. Measured with a MutationObserver: 17
   * records per frame in flight, 3 per frame sitting on the title.
   *
   * scorehud.js has done it this way since it was written and says why at
   * the top of the file. This is the same guard, in the file that needed it
   * more. The last value is cached on the node itself so nothing has to keep
   * a map in step with a DOM that screens rebuild.
   */
  static text(el, value) {
    if (!el) {
      return;
    }
    const v = value == null ? '' : String(value);
    if (el.__wfText !== v) {
      el.__wfText = v;
      el.textContent = v;
    }
  }

  static klass(el, value) {
    if (!el) {
      return;
    }
    const v = value == null ? '' : String(value);
    if (el.__wfClass !== v) {
      el.__wfClass = v;
      el.className = v;
    }
  }

  /* Bars are a width in per cent. Rounded to one decimal before the compare,
   * because a battery that drains by a ten thousandth of a per cent per frame
   * would otherwise defeat the guard entirely while moving nothing a pilot
   * can see. */
  static bar(el, frac) {
    if (!el) {
      return;
    }
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10;
    if (el.__wfBar !== pct) {
      el.__wfBar = pct;
      el.style.width = `${pct}%`;
    }
  }

  /* Cursor movement and selection, shared by keyboard and sticks. Each
   * lands a small click through onUiSound, and the sound is made HERE, in
   * the one place each gesture funnels through, so the keyboard, the
   * sticks and the mouse all sound the same. */
  /* A group heading is in the list so it renders in the right place, but it
   * is not somewhere the cursor can land. */
  isStop(it) {
    return Boolean(it) && !it.section;
  }

  /*
   * A row the ARROW KEYS step over, and nothing else does.
   *
   * The flight controller renders 542 keys this build does not implement,
   * and every one of them was an arrow stop: the Configuration tab had 141
   * stops and 3 things you could change. Making them non-stops looks like
   * the fix and is not, because the help column is `items[cursor].note` and
   * each of those rows carries a sentence saying which Betaflight subsystem
   * is missing and why. A row the cursor cannot hold is a row whose
   * explanation is gone, so that change would have deleted 542 explanations
   * to save 138 keypresses.
   *
   * So skipping is a property of the TRAVEL, not of the row. Up and Down
   * step over these; PageUp, PageDown, Home, End and a mouse click all
   * still land on them, and the help still speaks.
   */
  isSkip(it) {
    return Boolean(it) && Boolean(it.skip);
  }

  /* The rows Up and Down will actually stop on. Falls back to every stop
   * when a screen is nothing but skipped rows, because a tab with no live
   * key at all must still be walkable rather than inert. */
  arrowStops(items) {
    const walkable = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i]) && !this.isSkip(items[i])) {
        walkable.push(i);
      }
    }
    if (walkable.length) {
      return walkable;
    }
    const all = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        all.push(i);
      }
    }
    return all;
  }

  /* The first row the cursor may land on, at or after `from`. The offset is
   * what lets a chosen course card put the cursor on its own list rather
   * than back on the first card in the strip. */
  firstStop(items, from = 0) {
    for (let i = Math.max(0, from); i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        return i;
      }
    }
    const i = items.findIndex((it) => this.isStop(it));
    return i < 0 ? 0 : i;
  }

  /*
   * THE ROW GRAMMAR. Four kinds of row, and the kind decides what Enter does.
   *
   * A row could navigate, edit a value in place, fire an irreversible action,
   * or leave for another tab, and all four looked identical and all four
   * answered Enter. Driving the shipped build, one press one row below where
   * it was meant silently changed the flight tune, and the only signal that
   * row was different from the one above it was a six pixel caret.
   *
   *   value       has an adjust or a picker. Left and Right change it.
   *   navigation  opens another screen. A chevron says so.
   *   link        leaves for a named tab. An arrow glyph says so.
   *   action      does a thing. Everything else.
   */
  /* The module predicate, reachable from the shell check, so the check and
   * the renderer cannot disagree about which rows draw as a strip. */
  fitsAsSegments(it) {
    return fitsAsSegments(it);
  }

  rowKind(it) {
    if (!it) {
      return 'action';
    }
    if (it.adjust || it.options || it.spec || it.num) {
      return 'value';
    }
    if (it.action && LINK_ACTIONS.has(it.action)) {
      return 'link';
    }
    if (it.action && SCREEN_ACTIONS.has(it.action)) {
      return 'navigation';
    }
    return 'action';
  }

  /* The one action the command bar's button fires. A screen declares it with
   * `primary: true`, which is the flag the mint row already used, so this
   * reads the intent that was always there. */
  primaryItem() {
    return this.items().find((it) => it && it.primary && !it.disabled) || null;
  }


  /*
   * The bars, repainted whenever the screen or the cursor changes.
   *
   * The legend prints what the CURRENT INPUT DEVICE can do, not both at once:
   * showing keyboard and pad prompts side by side is twice the noise and
   * half the answer. lastInput is written by handleKey and pollPad.
   */
  syncFrame() {
    const onFlight = this.screen === 'flight';
    const bench = this.screen === 'fc';
    /* The title already IS the branding: a wordmark, a tagline and the
     * existing chip cluster. A breadcrumb reading the name under a
     * wordmark reading the name is a second answer to a question nobody
     * asked, and its context chips land on top of the bug chip and the
     * music dock. So the top bar sits out the one screen that does not
     * need it. */
    const titleScreen = this.screen === 'title';
    /* The bench is a tool inside its own frame and paints its own chrome in
     * Betaflight yellow. A breadcrumb over the top of that is decoration; the
     * legend is not, so the top bar goes and the bottom one stays. */
    this.frameTop.hidden = onFlight || bench || titleScreen;
    this.frameBot.hidden = onFlight;
    /*
     * And the floating chips move out from under it. The bug chip is
     * pinned to the top right and so is the bar's own context cluster, so
     * on every screen that has a bar the chip sat on top of the one thing
     * a pilot is most likely to want to read there: measured at 1600 and
     * at 1280, it covered 125 px of "Flying 2022 AU Nationals". A width
     * media query used to do this below 860 px, which is not the
     * condition. The condition is whether the bar is there.
     */
    this.root.classList.toggle('bar-shown', !this.frameTop.hidden);
    if (onFlight) {
      this.root.style.setProperty('--bar-top', '0px');
      this.root.style.setProperty('--bar-bot', '0px');
      return;
    }
    this.root.style.setProperty('--bar-top', bench ? '0px' : '48px');
    this.root.style.setProperty('--bar-bot', '52px');

    this.crumb.textContent = '';
    const hubHere = this.screen === 'title' && this.onGate() && this.hub ? HUBS.find((h) => h.id === this.hub) : null;
    const trail = hubHere ? [str('ui.product_name'), str(hubHere.label)] : CRUMBS[this.screen] || [SCREEN_TITLES[this.screen] || this.screen];
    trail.forEach((part, i) => {
      if (i) {
        this.crumb.append(el('span', 'crumb-sep', '/'));
      }
      this.crumb.append(el('span', i === trail.length - 1 ? 'crumb-here' : 'crumb-up', part));
    });

    this.frameContext.textContent = '';
    for (const chip of this.contextChips()) {
      const node = el('span', 'frame-chip');
      node.append(el('span', 'frame-chip-key', chip.label), el('b', null, chip.value));
      this.frameContext.append(node);
    }

    this.frameLegend.textContent = '';
    for (const hint of this.legendFor()) {
      /* A legend entry that carries an action is a BUTTON, not a label: the
       * key it names has to be pressable by whoever is not holding a
       * keyboard. The rest stay <i>, because a legend that looks entirely
       * clickable and mostly is not is worse than one that is not. */
      const i = hint.action ? btn('legend-act', '') : el('i', null);
      for (const k of hint.keys) {
        i.append(el('span', this.lastInput === 'pad' ? 'kbd pad' : 'kbd', k));
      }
      i.append(document.createTextNode(` ${hint.text}`));
      if (hint.action) {
        i.addEventListener('click', () => this.act(hint.action));
      }
      this.frameLegend.append(i);
    }

    const primary = this.primaryItem();
    this.framePrimary.hidden = !primary;
    if (primary) {
      this.framePrimary.textContent = primary.label;
    }
  }

  /* What is loaded, in the top right, so no screen has to be left to find out
   * what the next run will actually fly. */
  contextChips() {
    const out = [];
    if (this.screen === 'flight' || this.screen === 'fc') {
      return out;
    }
    const seat = activeCourseSummary();
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    out.push({ label: str('ui.flying'), value: seat && seat.name ? seat.name : m.name });
    const name = readPilotName();
    if (name) {
      out.push({ label: str('ui.pilot'), value: name });
    }
    return out;
  }

  /* The keys this screen answers. Kept short: a legend nobody reads is a
   * legend that cost vertical space for nothing. */
  legendFor() {
    const pad = this.lastInput === 'pad';
    /*
     * A THIRD VOICE, FOR THE PHONE.
     *
     * The bar had exactly two: a pad voice and a keyboard voice, chosen by
     * whichever spoke last. A phone has neither, so a touch visitor was
     * told to press arrow keys and Enter on a screen with no keys, on the
     * first thing they see. The shell already knows it is on a touch screen,
     * because that is what mounts the thumb sticks.
     *
     * lastInput still wins when it is set: someone with a keyboard attached
     * to a tablet gets the keyboard's words the moment they use it.
     */
    const touch = this.lastInput === 'none'
      && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
    if (touch) {
      const out = [];
      out.push({ keys: [], text: this.cardScreen() ? str('ui.tap_a_card') : str('ui.tap_a_row') });
      if (this.screen !== 'title' || (this.onGate() && this.hub)) {
        out.push({ keys: [], text: str('ui.back'), action: 'back' });
      }
      /* The title's own way out is the last row of its menu now, where a
       * thumb can find it without reading the legend. See titleItems. */
      return out;
    }
    const out = [];
    if (this.cardScreen()) {
      /* Pitch, not roll. pollPad walks a card screen with the pitch axis and
       * treats roll right as choose and roll left as back, which is what the
       * Race room's own hint line has always said; this legend claimed Roll
       * and was simply wrong. */
      out.push({ keys: pad ? ['Pitch'] : ['\u2190', '\u2192'], text: str('ui.move') });
    } else {
      out.push({ keys: pad ? ['Pitch'] : ['\u2191', '\u2193'], text: str('ui.move') });
      const it = this.items()[this.cursor];
      if (this.rowKind(it) === 'value') {
        out.push({ keys: pad ? ['Roll'] : ['\u2190', '\u2192'], text: str('ui.adjust') });
      }
    }
    out.push({ keys: [pad ? 'A' : 'Enter'], text: str('ui.choose') });
    if (this.screen !== 'title') {
      out.push({ keys: [pad ? 'B' : 'Esc'], text: str('ui.back') });
    } else if (this.onGate() && this.hub) {
      /* A hub's way home, a button as well as a key, for the mouse. */
      out.push({ keys: [pad ? 'B' : 'Esc'], text: str('ui.back'), action: 'back' });
    } else if (!this.onGate()) {
      /* NOT ON THE GATE. The gate is the root and Escape does nothing
       * there, so offering the key is a joke. onGate() is the one
       * definition of "is the gate up", and this asks it rather than
       * reading the two flags itself: `this.mode` alone was the proxy once
       * and it stopped being one the moment a link could answer the mode
       * without answering the aircraft. */
      /*
       * The title answers Escape: it reopens the gate, which is the only
       * way to change mode or aircraft without reloading. It is named
       * rather than called Back, because Back on the front page reads like
       * it leaves the game, and because a pilot looking for the other mode
       * or the other machine is looking for the screen that offers both.
       *
       * THIS IS THE KEY HINT AND NOTHING ELSE NOW. It was a hit area as
       * well, because for a while it was the only route: the menu had no
       * room for an eleventh row and a pilot who answered Freestyle could
       * reach the town and could not reach a race track again. A clickable
       * word in the row that reads "Move  Choose  Esc" is a key legend
       * everywhere else in the shell, so nobody could tell it was a
       * button, which is how it was reported a second time. The route is
       * the last row of the menu now and this is back to being what it
       * looks like.
       */
      out.push({ keys: [pad ? 'B' : 'Esc'], text: this.gateLabel() });
    }
    return out;
  }

  /*
   * Where the cursor lands on arriving at a screen: the row it was on last
   * time if that row is still there and still a stop, else the first stop.
   * Matching by label rather than by index is what makes it survive a list
   * that grew or shrank while the pilot was elsewhere.
   */
  restoreCursor() {
    const items = this.items();
    const want = this.cursorMemory[this.screen];
    if (want) {
      const i = items.findIndex((it) => it && it.id === want && this.isStop(it));
      if (i >= 0) {
        return i;
      }
    }
    /*
     * A FIRST VISIT OPENS ON THE ROW THE SCREEN EXISTS FOR.
     *
     * `primary` already marks that row on the four screens that have one:
     * Fly on the title and on the launch card, Fly this track on standings,
     * Resume on pause. Without this the cursor went to the first stop, and
     * on the launch card the first stop is Radio link, which is a dropdown.
     * So a pilot who read "Enter flies it" on the card, pressed Enter, and
     * got a list of ELRS packet rates was doing exactly what the screen told
     * them to. The rows above the primary one are settings for the run; the
     * primary one is the run.
     *
     * Only when nothing is remembered. Someone who walked down to Radio link
     * last time and came back still lands where they left off.
     */
    const p = items.findIndex((it) => it && it.primary && this.isStop(it));
    if (p >= 0) {
      return p;
    }
    return this.firstStop(items);
  }

  move(dir) {
    const items = this.items();
    const n = items.length;
    if (!n) {
      return;
    }
    let next = (this.cursor + dir + n) % n;
    /* Step over headings and skipped rows. Bounded by n so a list of
     * nothing but headings cannot spin here. */
    /* A Set, because this runs inside a bounded loop over a list that is
     * 144 rows on the flight controller and is rebuilt on every keypress. */
    const walkable = new Set(this.arrowStops(items));
    const stopsHere = (i) => walkable.has(i);
    for (let guard = 0; guard < n && !stopsHere(next); guard += 1) {
      next = (next + dir + n) % n;
    }
    this.setCursor(next);
  }

  /*
   * PageUp and PageDown. Travel by a screenful, and unlike the arrows they
   * land on skipped rows, which is what makes a greyed firmware key
   * readable without walking 138 of its neighbours.
   *
   * A page is the number of rows the scroller can show, so the movement
   * matches what the pilot sees rather than a constant somebody picked.
   */
  pageMove(dir) {
    const items = this.items();
    const stops = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        stops.push(i);
      }
    }
    if (!stops.length) {
      return;
    }
    const at = stops.indexOf(this.cursor);
    const from = at < 0 ? 0 : at;
    const next = Math.max(0, Math.min(stops.length - 1, from + dir * this.pageSize()));
    this.setCursor(stops[next]);
  }

  /* How many rows a page is. Measured off the live scroller so a short
   * window pages by less, and clamped so a collapsed or unmeasurable box
   * still moves a sensible distance rather than zero. */
  pageSize() {
    const scroll = this.menuScrollNode();
    const row = 44;
    const visible = scroll && scroll.clientHeight ? Math.floor(scroll.clientHeight / row) : 0;
    return Math.max(5, Math.min(25, visible || 10));
  }

  /* Home and End. Both land on any stop, skipped or not. */
  jumpEdge(dir) {
    const items = this.items();
    const stops = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        stops.push(i);
      }
    }
    if (!stops.length) {
      return;
    }
    this.setCursor(dir < 0 ? stops[0] : stops[stops.length - 1]);
  }

  /* The scrolling box for the screen the cursor is on, or null when the
   * screen has none. Used only for measurement. */
  menuScrollNode() {
    const host = this.screens && this.screens[this.screen];
    if (!host) {
      return null;
    }
    return host.querySelector('.menu-scroll') || host.querySelector('.menu');
  }

  adjust(dir) {
    const it = this.items()[this.cursor];
    if (it && it.adjust) {
      it.adjust(dir);
      this.writeSettings();
    }
  }

  select() {
    const it = this.items()[this.cursor];
    if (!it) {
      return;
    }
    /* A heading is not a row. move() already never lands on one, but
     * setCursor is public and act() dereferences the action, so a cursor
     * put on a heading by anything else threw rather than doing nothing. */
    if (!this.isStop(it)) {
      return;
    }
    if (it.info) {
      return;
    }
    if (it.disabled) {
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    /* A typed row opens for typing. Stepping it with Enter would be the
     * old list row's behaviour and would put the caret nowhere, which is
     * the whole complaint this screen exists to answer. */
    if (it.num) {
      this.focusNumber(this.cursor);
      return;
    }
    /*
     * A SWITCH FLIPS ON ENTER. It is the one value row where that is the
     * idiom rather than the accident: one bit, visibly changed, and the
     * same key puts it back. A radio whose axes are held out of the menus
     * on this screen has nothing but select, so a switch that ignored
     * Enter would be a switch that radio could never throw.
     */
    if (it.sw) {
      if (it.flip) {
        it.flip();
        this.writeSettings();
      }
      return;
    }
    /*
     * EVERY OTHER VALUE ROW: Enter opens the picker, it does not step the
     * value.
     *
     * Enter used to call adjust(1) on any row with an adjust, which is how
     * one press one row below where it was meant silently changed a flight
     * tune from Betaflight default to Karate race 6S, with nothing
     * confirming it and nothing announcing it. Stepping a thirty item list
     * by one is not a thing anybody means to do; picking from it is. A row
     * with a list opens the list, and a row with no list, a stepper or a
     * typed number, keeps the arrows and does nothing on Enter, because
     * there is nothing to open and stepping it is what Left and Right are
     * already for.
     */
    /*
     * `pickOnly` OPTS A ROW OUT OF STEPPING ON ENTER, however short its list.
     *
     * The segmented branch below argues that stepping is safe because every
     * choice is on screen. That is an argument about VISIBILITY and it holds
     * for a row where the three positions are three equivalent answers. It
     * does not hold for a row that switches an unfinished feature on: the
     * Freestyle room draws no cards while there is one world, so Scoring is
     * its first row and the cursor OPENS on it, and the first affirmative
     * press in the room, Enter on a keyboard or roll right on a radio, was
     * stepping it from off to Free flight. A pilot who has not asked for the
     * scorer should not get it from the press they used to walk into a room.
     * See DEFAULTS.freestyleScoring.
     *
     * The list still opens, so the row stays reachable from a radio: roll
     * right opens it, pitch walks it, roll right again confirms. What is
     * gone is the one press that wrote a value nobody read out.
     */
    if (it.options && it.options.length && (it.pickOnly || !fitsAsSegments(it))) {
      this.openDropForCursor();
      return;
    }
    /*
     * A SEGMENTED ROW CYCLES ON ENTER, and that is safe for the reason the
     * long list is not: every choice is on screen, so a press moves between
     * things the pilot can already see, and one more press comes back
     * round. The tune row is the one that bit somebody, and it opts out by
     * hand with `pickOnly` rather than by being long: it is two labels at
     * most now and would otherwise segment, and stepping it re-inits the
     * module and costs the lap.
     *
     * It also has to work: a radio's axes are deliberately held out of the
     * menus on the title, Settings, Rates, PIDs and the bench, so on those
     * screens select is the only thing a pad has. A segmented row that
     * ignored Enter would be a row that radio could never change.
     */
    if (it.options && it.options.length) {
      this.adjust(1);
      return;
    }
    if (it.adjust || it.step) {
      /* Nothing to open and nothing to fire. Say so rather than silently
       * doing nothing, which reads as a dead key. */
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    /*
     * A course card is a thing to choose, not a button to press. Choosing one
     * names it and shows what can be done with it; the card's own action is
     * offered there as Fly it. Worlds are left alone: there is exactly one
     * thing to do with a world, so a list of one would be friction.
     */
    /* Always, not only when nothing is chosen yet: with one card's list open,
     * choosing a different card has to move to that card. Falling through
     * here would have flown it instead, which is the behaviour this whole
     * change exists to remove. */
    if (this.screen === 'courses' && it.course) {
      this.cardSubject = courseCardKey(it);
      if (this.onUiSound) {
        this.onUiSound('select');
      }
      this.renderMenu();
      this.renderCourseCards();
      /* Land on Fly it, so the quick path stays Enter then Enter. */
      this.setCursor(this.firstStop(this.items(), this.rowOffset));
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    /* A hub card opens its hub. */
    if (it.hub && this.onGate()) {
      this.openHub(it.hub);
      return;
    }
    /* An activity card on the gate is half the answer: the other half,
     * which aircraft, is chosen in front of the aircraft. The Hangar's
     * cards are plain actions. */
    if (it.card && this.onGate() && WAYS.some((w) => w.action === it.action)) {
      this.pickForWay(it.action);
      return;
    }
    this.act(it.action);
  }

  /* The three hub cards, each with its activities as links. A hub with
   * nothing to offer here (Operations with no rooms server: the war is a
   * room) is left out rather than shown empty; the Hangar always has the
   * aircraft. */
  hubCards(rooms) {
    return HUBS.map((h) => {
      const links = h.id === 'hangar'
        ? this.hangarCards().map((c) => ({ label: c.label, action: c.action, key: c.card }))
        : hubWays(h.id).filter((w) => rooms || !w.room).map((w) => ({ label: w.label, action: w.action, key: w.id }));
      return {
        label: str(h.label),
        card: `hub-${h.id}`,
        hub: h.id,
        art: h.art,
        svg: h.id === 'ops' ? reticleSvg() : craftSvg(airframeById(this.settings.airframe)),
        blurb: str(h.blurb),
        facts: [],
        links,
        action: `hub-${h.id}`,
      };
    }).filter((it) => it.links.length > 0);
  }

  /* The Hangar's cards: the aircraft, its power, paint and parts, the
   * radio, and how the sticks fly. */
  hangarCards() {
    const s = this.settings;
    const plan = craftSvg(airframeById(s.airframe));
    return [
      {
        label: str('ui.aircraft'), card: 'hangar-aircraft', svg: plan, blurb: str('hub.aircraft_blurb'), facts: [], action: 'hangar-aircraft',
      },
      ...(customisable(s.airframe) ? [{
        label: str('hangar.customise'), card: 'hangar-customise', svg: plan, blurb: str('hangar.row_note'), facts: [], action: 'customise',
      }] : []),
      {
        label: str('ui.calibrate_sticks'), card: 'hangar-sticks', svg: null, blurb: str('hub.sticks_blurb'), facts: [], action: 'calibrate',
      },
      {
        label: str('ui.how_to_fly'), card: 'hangar-howto', svg: null, blurb: str('ui.the_sticks_live_and_what_the'), facts: [], action: 'howto',
      },
    ];
  }

  /* Into a hub from home, the cursor on its first card. */
  openHub(id) {
    this.hub = id;
    this.setCursor(this.firstStop(this.items()));
    this.renderMenu();
  }

  /*
   * Seat a map: the one place a chosen world or track becomes the thing the
   * next flight is in.
   *
   * It writes the setting, hands it to the shell, which is the side that
   * swaps the world, and lands the pilot back where the choice was made
   * from. The gate and both pickers go through here so none of them can
   * leave the seat and the row that names it disagreeing.
   *
   * `stay` keeps the pilot on the screen they are on, for a seat nobody
   * chose on this screen: a room that flies in another world seats it on
   * welcome (src/main.js), which used to throw a pilot who had just typed
   * a code on the room screen out to the title.
   */
  seatMap(id, { stay = false } = {}) {
    const m = MAPS.find((x) => x.id === id);
    if (m && m.mode === 'freestyle') {
      /* So the Map row names the place you were last in rather than the
       * first in the registry, and so the gate can tell a pilot who has
       * chosen a world from one who never has. */
      this.settings.freestyleMap = id;
    }
    this.settings.map = id;
    saveSettings(this.settings);
    if (!stay) {
      this.show(this.returnTo === 'paused' ? 'paused' : 'title');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  /*
   * They have flown, so this is not a first visit any more.
   *
   * The moment is the LAUNCH rather than the dismissal of a screen, because
   * the screen that used to carry that meaning is gone. Written to storage
   * as well as to the flag: detectFirstRun reads a stored settings blob as
   * its first signal, so without the write the guided flight would be
   * offered again on the next load to somebody who has already taken it.
   */
  flown() {
    if (!this.firstRun) {
      return;
    }
    this.firstRun = false;
    saveSettings(this.settings);
    this.renderMenu();
  }

  /* Whether the seat is the kind of place the chosen mode flies in. Race
   * needs a loaded track, freestyle needs one of the gateless worlds. A null
   * mode is the gate itself, which has no Fly row to guard. */
  seatMatchesMode() {
    if (this.mode === 'freestyle') {
      return Boolean(seatedFreestyleMap(this.settings));
    }
    if (this.mode === 'race') {
      return this.settings.map === 'track' && hasLoadedTrack();
    }
    return true;
  }

  back() {
    if (this.dropEl) {
      this.closeDrop();
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    if (this.screen === 'title') {
      /*
       * TWO LEVELS, AND ESCAPE WALKS BOTH.
       *
       * The menu backs out to the gate, and the gate is the root, where
       * Escape stops. It used to be three, because the gate was two screens
       * and a whoop skipped the second one, so how far Escape went depended
       * on what was seated. One screen, one step, whatever is flying.
       *
       * BOTH halves are cleared, because both are what the gate asks.
       */
      if (this.onGate()) {
        /* A hub backs out to home, the hub's card under the cursor; home
         * is the root. */
        if (this.hub) {
          const was = `hub-${this.hub}`;
          this.hub = null;
          if (this.onUiSound) {
            this.onUiSound('back');
          }
          const at = this.items().findIndex((x) => x.card === was);
          this.setCursor(at >= 0 ? at : this.firstStop(this.items()));
          this.renderMenu();
        }
        return;
      }
      this.craftGate = true;
      this.mode = null;
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    if (this.screen === 'flight') {
      return;
    }
    /* The room screen is home inside a room: Back stops there, and Leave
     * is the way out (rule 4 and 5 of docs/FLOW-AUDIT.md). Reached from a
     * paused run, Back is still that run. */
    if (this.screen === 'friends' && this.returnTo !== 'paused' && this.inRoom && this.inRoom()) {
      /* A game's lobby is a card's one press (the owner, 2026-10-02), so
       * Back from it is back to the cards, out of the room, the card it
       * came from under the cursor (src/main.js onLobbyBack). */
      /* Asked of the room (src/main.js inLobby), not of the panel: the
       * panel is drawn on a later tick, and an Escape before it did
       * nothing. */
      if (this.inLobby && this.inLobby() && this.onLobbyBack) {
        this.onLobbyBack();
      }
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('back');
    }
    if (this.screen === 'calibrate') {
      this.act('calibrate-cancel');
      return;
    }
    /* Make a room is inside Rooms, and Rooms inside Fly with friends,
     * whichever way the pilot came in, the pause menu included. */
    if (this.screen === 'rooms' || this.screen === 'roomnew') {
      this.show(this.screen === 'rooms' ? 'friends' : 'rooms');
      return;
    }
    if (this.screen === 'padpick') {
      if (this.padPickPhase === 'confirm') {
        this.act('padpick-no');
      } else {
        this.act(this.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
      }
      return;
    }
    if (this.screen === 'courses' && this.cardSubject) {
      /* Escape backs out of the chosen course first, not off the screen. */
      this.act('card-back');
      return;
    }
    if (this.screen === 'results') {
      this.act('title');
      return;
    }
    if (this.screen === 'paused') {
      /* Escape opened the pause screen, so Escape closes it again. */
      this.act('resume');
      return;
    }
    if (this.screen === 'fc') {
      /* Escape leaves SEARCH before it leaves the bench, for the same
       * reason it cancels a confirm below: the nearest thing the key can
       * undo is the thing it undoes. Leaving search puts the cursor back
       * on the tab strip rather than wherever result 40 happened to be. */
      if (this.fc.search != null) {
        this.fc.search = null;
        this.setCursor(this.firstStop(this.items(), this.rowOffset));
        this.renderMenu();
        return;
      }
      /* Escape cancels a confirm before it leaves the screen, so a pilot
       * asked "restart the run?" is not thrown off the editor for
       * flinching. */
      if (this.fc.confirm) {
        this.fc.confirm = null;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      /*
       * A DRAFT IS NOT THROWN AWAY BY ONE KEY.
       *
       * Escape used to run fc-back, which calls discard() unconditionally:
       * hundreds of edited firmware keys gone, no question asked. The same
       * shell already guards a typed bug report behind a three way "Keep
       * this report?" panel, so the protection existed and was pointed at
       * the cheaper thing. Escape again from the panel cancels, by the
       * branch above.
       */
      if (this.fc.dirty()) {
        this.fc.confirm = 'leave';
        this.cursor = 0;
        this.renderMenu();
        /* The panel replaces 144 rows with three, so the list has to go back
         * to the top or the question is asked off screen. */
        if (this.fcMenu) {
          this.fcMenu.scrollTop = 0;
        }
        return;
      }
      this.act('fc-back');
      return;
    }
    if (this.screen === 'rates' && this.ratesFrom) {
      /* Settings is a page, not a mode: the shell has nothing to do when it
       * comes back up, so show() rather than act(), which would rewrite
       * returnTo and strand a pilot who paused a run to get here. */
      const from = this.ratesFrom;
      this.ratesFrom = null;
      this.show(from);
      return;
    }
    if (this.screen === 'pids' && this.pidsFrom) {
      /* Same contract as Rates above. */
      const from = this.pidsFrom;
      this.pidsFrom = null;
      this.show(from);
      return;
    }
    /* Drop the pin before title, or show() would remap title back onto
     * credits and Back would do nothing. */
    if (this.screen === 'credits') {
      clearLocationHash();
    }
    /*
     * The room this one was opened from, if it was opened from one. A
     * paused run still wins: returnTo is the pause chain and losing it
     * strands a flight. Cleared as it is used, so a second Back from the
     * room we just returned to goes on to the title rather than bouncing
     * between the two.
     */
    if (this.returnTo !== 'paused' && this.roomFrom) {
      const from = this.roomFrom;
      this.roomFrom = null;
      this.show(from);
      return;
    }
    this.act(this.returnTo === 'paused' ? 'paused' : 'title');
  }

  act(action, picked = null, { keepWorld = false } = {}) {
    /* Without an account the menus are for looking at (the owner,
     * 2026-10-04: a visitor "can see the menus, but can't actually go
     * into anything and see how they work"): home, a hub and its cards,
     * and nothing behind a card or a row. The Hangar's cards used to open
     * for anybody. What is asked for runs once the pilot has signed in. */
    if (typeof action === 'string' && !OPEN_ACTIONS.has(action) && !/^(account|calibrate-|padpick-)/.test(action)
      && needSignIn(() => this.act(action, picked, { keepWorld }))) {
      return;
    }
    if (action === 'update-reload') {
      window.location.reload();
      return;
    }
    if (action === 'room-bar') {
      if (this.roomBarView && this.roomBarView.act) {
        this.roomBarView.act();
      }
      return;
    }
    /* The swap in place, from the pause menu's row. */
    if (action === 'hotswap') {
      this.openSwap('paused');
      return;
    }
    if (action === 'hangar-aircraft') {
      this.openCraftRow(false);
      return;
    }
    if (action === 'customise') {
      /* The plane in the air, which is a My Hangar build when it wears one,
       * so a change there is a change to that build. */
      this.openHangar(this.settings.airframe, () => this.renderMenu(), this.wornBuild(this.settings.airframe));
      return;
    }
    /* Leaderboard and Choose new map are the same page. The board opens
     * courses in the simulator, so this tab has to stay put. Navigating
     * away here left the pilot with no sim and a second one from Fly.
     * The board is a named tab: a pilot who has been to the board once
     * goes back to that same tab rather than collecting a row of them.
     * share.board is the board origin when a published course is loaded,
     * otherwise the default board. */
    if (action === 'leaderboard') {
      openNamedWindow(boardPageUrl(this.share && this.share.board, boardCraft(this.settings.airframe)), BOARD_WINDOW);
      return;
    }
    if (action === 'reportbug') {
      this.openBugReport();
      return;
    }
    if (action === 'feel') {
      this.openFeelReport();
      return;
    }
    /*
     * The guided first flight.
     *
     * It launches DIRECTLY rather than through act('fly'), so it skips the
     * launch card: a pilot who has never held a stick does not need to be
     * asked what their lap will count as. The seat is left alone, because
     * the row only appears when there is already a track under it.
     *
     * `skipfirst` was its other half, the row that said "I have flown
     * before" on a screen that no longer exists. Nothing dispatches it now,
     * so it is gone rather than kept as an action with no row.
     */
    if (action === 'firstflight') {
      this.flown();
      this.guided = true;
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      if (this.onAction) {
        this.onAction('fly', this.settings);
      }
      return;
    }
    /*
     * The rows a chosen course card offers. `cardSubject` says which course
     * they belong to, so none of them has to guess at the seat.
     */
    if (action === 'card-back') {
      this.cardSubject = null;
      this.renderMenu();
      this.renderCourseCards();
      this.setCursor(this.cardCursor());
      return;
    }
    /*
     * Standings, from the chosen card. Reads the board listing off the card
     * rather than the seat, because the point is to look at a track WITHOUT
     * loading it: the seat is whatever you are flying.
     */
    if (action === 'card-standings') {
      const card = this.subjectCard();
      if (card && card.course && card.course.kind === 'board') {
        this.showStandings(card.course.track);
      }
      return;
    }
    /*
     * Standings for the seated track. Its listing carries the share id and
     * the board it came from, which is all fetchTrackTimes needs; the name
     * and gates come off the seat so the screen has something to draw
     * before the network answers.
     */
    if (action === 'standings') {
      const listing = liveListing();
      const seat = activeCourseSummary();
      if (!listing || !listing.shareId) {
        return;
      }
      this.showStandings({
        id: listing.shareId,
        name: (seat && seat.name) || listing.name || str('ui.this_track'),
        author: listing.author || '',
        designer: (seat && seat.designer) || listing.designer || '',
        series: (seat && seat.series) || listing.series || '',
        gates: (seat && seat.gates) || 0,
        board: listing.board || '',
        map: listing.doc && isMapTrack(listing.doc) ? listing.doc.map : '',
      });
      return;
    }
    if (action === 'standings-fly') {
      /* Seat it and play it, which is what the row promises. */
      const t = this.standingsFor;
      if (t && t.id) {
        this.openBoardCourse(t.id, () => this.play());
      }
      return;
    }
    /*
     * Race the record: arm the ghost, seat the track, play it.
     *
     * Arming happens FIRST and through main.js, which parks the id the same
     * way a ?ghost= chase link does. The lap itself is fetched when the
     * track's times are read at seat time, so there is one code path for a
     * ghost picked here and a ghost picked from a shared link.
     */
    if (action === 'standings-ghost') {
      const times = this.standingsTimes || [];
      const top = times.find((x) => x.hasGhost && x.id);
      const t = this.standingsFor;
      if (!top || !t || !t.id) {
        return;
      }
      if (this.onStandingsGhost) {
        this.onStandingsGhost(t, top);
      }
      this.openBoardCourse(t.id, () => this.play());
      return;
    }
    /* The standings screen offers the same row and has no card behind it:
     * the track it is showing is the subject. */
    if (action === 'card-board' && this.screen === 'standings') {
      if (this.standingsFor) {
        openNamedWindow(boardPageUrl(this.standingsFor.board, boardCraft(this.settings.airframe)), BOARD_WINDOW);
      }
      return;
    }
    if (action.startsWith('card-')) {
      const card = this.subjectCard();
      if (!card) {
        this.cardSubject = null;
        this.renderMenu();
        return;
      }
      this.actOnCard(action, card);
      return;
    }
    if (action === 'cloud-more') {
      this.loadCloudCourses(true);
      return;
    }
    /* My tracks' New track: which world first, then the builder in it. */
    if (action === 'newtrack' || action === 'newtrack-back') {
      this.newTrackOpen = action === 'newtrack';
      this.renderMenu();
      this.setCursor(this.firstStop(this.items(), this.rowOffset));
      return;
    }
    if (action.startsWith('newtrack:')) {
      this.newTrackOpen = false;
      this.openBuilder({ map: action.slice('newtrack:'.length) });
      return;
    }
    if (action.startsWith('casualtrack:')) {
      this.newTrackOpen = false;
      this.openBuilder({ map: action.slice('casualtrack:'.length), casual: true });
      return;
    }
    /*
     * THE GATE'S TWO ROWS.
     *
     * Answering it is not only setting a flag. The seat has to agree with
     * the answer or the Fly row on the next screen launches the other kind
     * of thing entirely, which is the disagreement the old pair of rows
     * lived with: a Freestyle row naming a world that was not seated, over
     * a Fly that would have launched the track.
     *
     * So Race seats the loaded track, Freestyle seats the world the pilot
     * last flew there, and either of them with nothing to seat opens its
     * own picker, because choosing a place IS the question they have just
     * asked and a menu row saying so would be a screen in the way.
     */
    /*
     * ANSWERING THE GATE, WHICH IS ONE PRESS AND BOTH HALVES OF THE ANSWER.
     *
     * It seats the aircraft, sets the mode, and then does exactly what
     * answering the mode always did: seat what is going to be flown, or
     * open the one room that can seat it. The two used to be two branches
     * for two screens; a card carries both now, so this is one.
     *
     * The aircraft is seated BEFORE anything reads a seat. hasLoadedTrack
     * and activeCourseSummary read the seat of the class that is current,
     * one per class, so asking them first would ask about the machine the
     * pilot has just stopped flying.
     */
    const way = WAYS.find((w) => w.action === action);
    if (way) {
      /*
       * ONLY IF IT MOVED, and this guard is a bug fix rather than a tidy.
       *
       * seatAirframe is the deliberate swap: it takes the tune, the pack,
       * the stock rates and THE CAMERA with it, and the camera lines are
       * unconditional, so calling it with the aircraft that is already
       * seated writes that aircraft's stock cameraFov and cameraAngle over
       * the pilot's own. The gate is answered on every visit, so a pilot who
       * had set 45 degrees of tilt on the Quad screen got it reset to the
       * stock 20 every time they opened the simulator. The old aircraft gate
       * called it unconditionally too, so this is older than the three
       * cards; it is fixed here because this is the line that does it.
       */
      /* `picked` is the aircraft chosen in the carousel the card opens
       * (pickForWay), whichever kind it is; a card answered without one,
       * from a script or a link, keeps the rule it always had. */
      const want = picked
        || (way.airframes.includes(this.settings.airframe) ? this.settings.airframe : way.airframes[0]);
      if (want !== this.settings.airframe) {
        seatAirframe(this.settings, want);
      }
      this.settings.airframeAsked = true;
      this.craftGate = false;
      this.mode = way.mode;
      /* The room game a card preselected, 'combat', 'tag' or 'war', or null: read
       * by the shell's room rows (src/main.js friendsRows) and sent in this
       * pilot's profile, so the room screen leads with it. */
      this.roomGame = way.game ?? null;
      saveSettings(this.settings);
      /* The shell has to hear this before anything is flown: it is the
       * call that swaps the plant in the compiled module and reloads the
       * tune. main.js applies it between runs, which the title is. */
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      this.returnTo = 'title';
      this.roomFrom = null;
      if (way.mode === 'race') {
        /* TRACK MODE OPENS ON MY TRACKS, every time: the pilot's own
         * tracks and the board's, and a new one. Nothing is seated until
         * Play, so a pilot browsing the list never waits on a world. */
        this.show('courses');
        return;
      }
      /*
       * THE CARD'S WORLD WINS (docs/FLOW-AUDIT.md rule 2, the owner's
       * 2026-10-01): a card with a home seats it, whatever world was flown
       * last. After a war every card opened on Itaipu, the Free Flight card
       * saying the Swiss valley over it (D4). The World row still seats any
       * other world, for this visit.
       */
      const worlds = MAPS.filter((x) => x.mode === 'freestyle');
      /* keepWorld: the rooms panel's way in, which goes on to a room
       * whose welcome seats that room's world, so seating the card's first
       * would build a world only to swap it away. */
      const home = way.home && !keepWorld ? worlds.find((x) => x.id === way.home) : null;
      const seated = seatedFreestyleMap(this.settings);
      if (home ? !seated || seated.id !== home.id : !seated) {
        /*
         * NO PICKER WHEN THERE IS NOTHING TO PICK.
         *
         * This used to open the Freestyle room so a first visit could choose
         * among four worlds with the cards in front of it. Three of those
         * worlds were removed on 2026-08-30 and the picker stayed, so
         * answering "Freestyle" put a screen in front of a pilot whose only
         * content was one card saying the name of the only place they could
         * possibly be going. That is a question with one answer, and a
         * question with one answer is a keypress somebody has to make.
         *
         * For a card without a home the remembered world is consulted
         * first, and the picker comes back the moment there is a real
         * choice, which is why this is written as "what is remembered, or
         * the only one" rather than as the id of the town.
         */
        const remembered = MAPS.find(
          (x) => x.id === this.settings.freestyleMap && x.mode === 'freestyle',
        );
        const want = home || remembered || (worlds.length === 1 ? worlds[0] : null);
        if (!want) {
          this.show('freestyle');
          return;
        }
        /* The cursor lands on Fly when the world comes back, for the same
         * reason as below: the fourth card is not the menu's fourth row. */
        this.setCursor(this.titleStop());
        /* A room card's screen is up before the seat changes, so the world
         * swap the seat starts knows to come back to it (main.js
         * syncWorldNow), not to the title it shows while it loads. */
        if (way.room) {
          this.show('friends');
          this.seatMap(want.id, { stay: true });
        } else {
          this.seatMap(want.id);
        }
        return;
      }
      /*
       * The seat already agrees with the answer, so the gate was one
       * keypress and the menu is behind it. The cursor lands on the first
       * row of what the answer opened rather than staying on the index of
       * the card that was pressed: the third card is the third row, so
       * choosing Freestyle would otherwise put the cursor on the menu's
       * third row and the Fly button under it would read as something
       * else's. Same call back() makes for the same reason.
       */
      this.setCursor(this.titleStop());
      this.renderMenu();
      if (way.room) {
        this.show('friends');
      }
      return;
    }
    /*
     * `tricks` BELONGS HERE and was missing, so the Trick list door did
     * nothing. The screen was built, the row was on the Freestyle menu with
     * action 'tricks', and SCREEN_ACTIONS listed it, so every part that
     * announces the room existed; this is the one that walks into it, and
     * it is a hand written list of screen names that the new screen was
     * never added to. Pressing Enter on the row left the pilot exactly
     * where they were, which is the whole feature unreachable.
     *
     * Found by driving the real shell rather than by reading: window.__ui
     * .show('tricks') rendered the screen perfectly, which is what made it
     * look fine, and only pressing the key a pilot presses showed that
     * nothing happened.
     */
    if (typeof action === 'string' && action.startsWith('friends-')) {
      if (this.onFriends) {
        this.onFriends(action);
      }
      return;
    }
    /* The gate's rooms panel: the Fly with friends card's way in, then
     * the room, the lobby or Make a room. */
    if (typeof action === 'string' && action.startsWith('lobby:')) {
      this.act(WAYS.find((w) => w.id === 'friends').action, null, { keepWorld: true });
      this.act(action.slice('lobby:'.length));
      return;
    }
    /* Pages under Fly with friends: show(), not the branch below, which
     * would rewrite returnTo and lose a paused run. */
    if (action === 'rooms' || action === 'roomnew') {
      this.show(action);
      return;
    }
    if (action === 'howto' || action === 'pilot' || action === 'quad'
      || action === 'courses' || action === 'freestyle' || action === 'credits'
      || action === 'tricks' || action === 'friends') {
      /*
       * A room opened FROM another room remembers which, so Back is the way
       * you came rather than a jump to the title. Only from a real room,
       * and never from the pause chain, which returnTo already owns.
       */
      this.roomFrom = ROOM_PARENTS.has(this.screen) && this.screen !== action
        ? this.screen
        : null;
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(action);
      return;
    }
    /*
     * THE LAUNCH CARD, and the one thing on it that is not a setting.
     *
     * `fly` used to launch. It now opens the card, and `launch-go` is what
     * launches, so the verb that starts a run is a different word from the
     * verb that shows you what the run will be. Freestyle keeps the old
     * behaviour and launches directly: it has no clock, no lap, no ghost
     * and no board, so a card in front of it would be ceremony.
     */
    /*
     * FLY WITH NOTHING TO FLY.
     *
     * Reachable: answer Race, land in the track list because nothing is
     * loaded, press Escape without choosing. The row above Fly says Choose
     * one, and this is that row's answer given as a verb. Launching
     * whatever happened to still be seated would be the front page saying
     * one thing and the sim doing another.
     */
    /*
     * THE TRACK DECIDES WHETHER THE AIRCRAFT MAY RACE IT, and it decides
     * here, on the way to the pre-flight card rather than after the world is
     * built: a plane too wide for a track's gates gives way to
     * DEFAULT_AIRFRAME, the racer (seatCraftForDoc). The swap is silent and reversible, and the
     * pre-flight card's own note says which machine the run is filed under.
     */
    if (action === 'fly') {
      this.seatCraftForCourse();
    }
    if (action === 'fly' && !this.seatMatchesMode()) {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(this.mode === 'freestyle' ? 'freestyle' : 'courses');
      return;
    }
    if (action === 'fly' && seatIsRace(this.settings)) {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show('launch');
      return;
    }
    if (action === 'launch-go') {
      /* The card's own button. It falls through to onAction as `fly`,
       * which is the action main.js has always launched on: the card is a
       * screen in front of the verb, not a second verb. */
      this.flown();
      if (this.onAction) {
        this.onAction('fly', this.settings);
      }
      return;
    }
    if (action === 'rates') {
      /* Escape and Back go where the pilot came from, so Rates reached from
       * the pause menu mid-race does not dump them on the title screen.
       * From the flight controller's signpost row, returnTo is left alone:
       * it may be carrying a paused run two screens up, and this row must
       * not be the reason Escape quits it. */
      if (this.screen === 'pilot' || this.screen === 'quad') {
        /* Both rooms carry a Rates row: Settings has the real one, Quad has a
         * signpost saying rates are not the machine's. Escape goes back to
         * whichever one was used, or the signpost is a one way door. */
        this.ratesFrom = this.screen;
      } else {
        this.ratesFrom = null;
        if (this.screen !== 'fc') {
          this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
        }
      }
      this.show('rates');
      return;
    }
    if (action === 'pids') {
      /* Same going-back contract as Rates, for the same reason. */
      if (this.screen === 'quad') {
        this.pidsFrom = 'quad';
      } else {
        this.pidsFrom = null;
        this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      }
      this.show('pids');
      return;
    }
    if (action === 'fc') {
      /* Its own origin pointer, NOT returnTo: returnTo belongs to the
       * pause chain, and overwriting it here stranded a pilot who paused
       * a run, opened PIDs, opened this, and Escaped twice expecting the
       * pause menu back. */
      this.fcFrom = ['paused', 'quad', 'pids'].includes(this.screen)
        ? this.screen
        : 'title';
      if (this.onFcOpen) {
        this.onFcOpen('pid');
      }
      this.show('fc');
      return;
    }
    if (action === 'fc-save') {
      if (!this.fc.dirty()) {
        return;
      }
      if (this.fc.runActive) {
        this.fc.confirm = 'save-run';
        this.fc.exitAfterSave = false;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: false, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-save-exit') {
      if (!this.fc.dirty()) {
        this.leaveFc();
        return;
      }
      if (this.fc.runActive) {
        this.fc.confirm = 'save-run';
        this.fc.exitAfterSave = true;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: false, exit: true, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-save-restart') {
      this.fc.exitAfterSave = false;
      this.fc.confirm = null;
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: true, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-wait') {
      this.fc.exitAfterSave = false;
      this.fc.confirm = null;
      this.cursor = 0;
      this.renderMenu();
      return;
    }
    if (action === 'fc-motors-stop') {
      this.fc.stopMotors();
      this.renderMenu();
      return;
    }
    if (action.startsWith('fc-preset:')) {
      const id = action.slice('fc-preset:'.length);
      this.fc.applyPreset(id).then(() => {
        this.renderMenu();
      }).catch((err) => {
        console.error(err);
      });
      return;
    }
    /* The two answers to the leave panel. Keep stays on the editor with the
     * draft intact; Discard is the old unconditional behaviour, now behind
     * a deliberate press. */
    if (action === 'fc-keep-editing') {
      this.fc.confirm = null;
      this.cursor = 0;
      this.renderMenu();
      return;
    }
    if (action === 'fc-discard-leave') {
      this.fc.confirm = null;
      this.fc.exitAfterSave = false;
      this.fc.discard();
      this.leaveFc();
      return;
    }
    if (action === 'fc-discard') {
      this.fc.discard();
      this.renderMenu();
      return;
    }
    if (action === 'fc-export') {
      downloadCli('flight-controller.diff', this.fc.exportText());
      return;
    }
    if (action === 'fc-back') {
      this.fc.exitAfterSave = false;
      this.fc.discard();
      this.leaveFc();
      return;
    }
    if (action === 'pids-default') {
      /* One tune's adjustment only. The other tunes keep theirs, which is
       * the whole reason the store is keyed. */
      clearPidsFor(this.settings.pids, this.settings.tune);
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      return;
    }
    if (action === 'rates-default') {
      /* normaliseRates rather than the frozen table itself: the rows write
       * into this object, and handing them the defaults by reference would
       * make the first edit change what "revert" means. */
      this.settings.rates = normaliseRates(RATE_DEFAULTS);
      this.settings.ratesSplitPitch = false;
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      return;
    }
    /*
     * SAVE THE NUMBERS UNDER A NAME.
     *
     * The dialog IS the prompt for a name. There is no inline name field on
     * the row and there should not be: the stick menu cannot type, so a name
     * is always this overlay, and a Save that opened it is the same gesture
     * as a Save that demanded it. Leaving the field empty and confirming
     * keeps the dialog open with a line saying so, because askForm refuses
     * an empty required field rather than inventing "Preset 4".
     *
     * Pre-filled with the loaded preset's name when the numbers already
     * match one, so the common "I nudged it, save it again" lands on
     * Replace rather than quietly growing a second copy.
     */
    if (action === 'rates-save') {
      const loaded = presetMatching(this.settings.rates);
      this.askRatePresetName(loaded ? loaded.name : '').then((name) => {
        if (!name) {
          return;
        }
        const res = saveRatePreset(name, this.settings.rates);
        /*
         * SUCCESS NEEDS NO ANNOUNCEMENT, because the Preset row above IS
         * the announcement: it worked out its value by asking the library
         * what matches what is flying, so a save that landed makes the row
         * say the new name on the next render. A toast would be a second
         * copy of a fact already on screen.
         *
         * FAILURE DOES, and it is the whole reason this branch exists. A
         * private window and a full quota both refuse the write, and a
         * pilot who was not told would go back to the other track and find
         * the profile gone. Same words the board uses for the same cause.
         */
        this.ratesNotice = res.ok
          ? null
          : str('ui.this_browser_would_not_store_that_2');
        this.renderMenu();
      });
      return;
    }
    if (action === 'rates-delete') {
      const loaded = presetMatching(this.settings.rates);
      if (!loaded) {
        return;
      }
      this.askConfirm({
        title: str('ui.delete', { name: loaded.name }),
        detail: str('ui.this_browser_is_the_only_copy'),
        yes: 'Delete',
        no: str('ui.keep_it'),
        danger: true,
      }).then((ok) => {
        if (!ok) {
          return;
        }
        const res = deleteRatePreset(loaded.id);
        this.ratesNotice = res.ok
          ? null
          : str('ui.this_browser_would_not_change_stored');
        this.renderMenu();
      });
      return;
    }
    /*
     * Choosing a map. It goes through onSettings rather than onAction
     * because a map change IS a settings change, and the shell's
     * applySettings is the one place that knows a changed map means a swap.
     * Track mode is seated by Play on My tracks, never from here.
     */
    if (action.startsWith('map:')) {
      this.seatMap(action.slice(4));
      return;
    }
    /* back() is the one implementation. This branch used to be a copy of
     * its last three cases and had already drifted: it called show() where
     * back() calls act(), so a Back ROW left main.js unaware of the screen
     * change that the Escape key told it about. */
    if (action === 'back') {
      this.back();
      return;
    }
    if (action === 'mode-gate') {
      /* Exactly what Escape from the title does, and it has to stay exactly
       * that: the gate is the one screen with nothing behind it, so leaving
       * either half answered would show the question with a menu still
       * under it. Both halves, because the one gate asks both. */
      this.mode = null;
      this.craftGate = true;
      /* The cards a lobby's card came from are its hub's. */
      if (this.lobbyCard && hubOfAction(this.lobbyCard)) {
        this.hub = hubOfAction(this.lobbyCard);
      }
      this.show('title');
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    /* Back to My tracks from a run or from the results: the run ends the
     * way quitting to the title ends it, and the list is where a pilot
     * racing goes next. */
    if (action === 'mytracks') {
      this.show('title');
      if (this.onAction) {
        this.onAction('title', this.settings);
      }
      this.returnTo = 'title';
      this.show('courses');
      /* On the list's first card, which is the track just flown or built:
       * the list is newest change first. */
      this.setCursor(this.firstStop(this.items()));
      return;
    }
    if (action === 'title' || action === 'paused') {
      this.show(action);
    }
    /* Freestyle reaches the air through here rather than through the launch
     * card, so this is the other end of the same event. See flown(). */
    if (action === 'fly') {
      this.flown();
    }
    if (this.onAction) {
      this.onAction(action, this.settings);
    }
  }

  /*
   * THE AIRCRAFT PICKER (src/ui/carousel.js), from the three places an
   * aircraft is chosen. Each says what the choice does; the picker only
   * says which.
   */
  pickHint() {
    if (this.lastInput === 'pad') {
      return 'pad';
    }
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return coarse ? 'touch' : 'key';
  }

  /*
   * The picker with its Floats switch, which is the hangar's toggle by
   * another door: the same s.floats, so the two always agree, and Choose
   * seats it through withFloats. A flip is kept when the picker is put
   * away without a choice, except on the seated plane (settleFloats).
   *
   * And with My Hangar beside the stock aircraft (src/ui/builds.js). A
   * choice puts on what was chosen before the opener seats it: a build is
   * fitted, a stock plane gets the pilot's own customisation back. The
   * opener's onChoose is handed the airframe to seat and whether its slots
   * moved, which on the plane already seated is a refit (refitted).
   */
  /* The aircraft the pickers and the cycle may offer: the shell's
   * `craftLimit` (a war room's, configs/airframes.js WAR_AIRFRAMES), or
   * null for every one. */
  craftOnly() {
    return typeof this.craftLimit === 'function' ? this.craftLimit() : null;
  }

  openPicker(opts) {
    const s = this.settings;
    /*
     * The Engine switch on the seated aircraft: its loadout before the
     * first flip and after the last. A flip seated by Choose is a refit;
     * one put away is undone, as settleFloats undoes the Floats switch, so
     * what is flying is what the slots say. Only while nothing else (the
     * Loadout tab's Save, through Customise) has changed it since.
     */
    const seat = s.airframe;
    const flip = { before: null, after: null };
    const flipped = () => Boolean(flip.before) && JSON.stringify(this.stockLoadout(seat)) === JSON.stringify(flip.after)
      && JSON.stringify(flip.after) !== JSON.stringify(flip.before);
    this.carousel.open({
      ...opts,
      only: this.craftOnly(),
      floats: {
        on: (id) => Boolean(s.floats && s.floats[id]),
        set: (id, on) => {
          s.floats = { ...s.floats, [id]: on };
          this.persistSettings();
        },
      },
      engine: {
        of: (id) => this.stockLoadout(id),
        set: (id, propulsion) => {
          const was = this.stockLoadout(id);
          this.setStockLoadout(id, { ...was, propulsion });
          if (id === seat) {
            flip.before = flip.before ?? was;
            flip.after = this.stockLoadout(id);
          }
        },
      },
      builds: this.pickerBuilds(),
      onCustomise: (id, reopen, build) => this.openHangar(id, reopen, build),
      onChoose: (card, build) => {
        const id = build ? build.airframe : withFloats(s, card);
        const moved = build ? this.wearBuild(build) : unfitFamily(s, id);
        if (moved) {
          this.persistSettings();
        }
        /* Refitted as the Loadout tab's Save refits, in the air where it
         * is when a run is up, before the opener's own swap, which is
         * refused for the same aircraft. */
        if (!build && id === seat && flipped()) {
          this.refitted(id).then(() => opts.onChoose(id, moved));
          return;
        }
        opts.onChoose(id, moved);
      },
      onCancel: () => {
        this.settleFloats();
        if (flipped()) {
          this.setStockLoadout(seat, flip.before);
        }
        opts.onCancel();
      },
    });
  }

  /* A combat quad's loadout as its stock card has it (src/ui/builds.js
   * stockFit: in the slots, or kept beside a build the family wears), made
   * valid; null for any other aircraft. The Loadout tab edits the same. */
  stockLoadout(id) {
    const af = airframeById(id);
    return af.combat ? combatChoice(af, stockFit(this.settings, id).combat) : null;
  }

  setStockLoadout(id, choice) {
    const s = this.settings;
    const combat = combatChoice(airframeById(id), choice);
    if (familyFitted(s, id)) {
      setStockFit(s, id, { ...stockFit(s, id), combat });
    } else {
      s.combat = { ...s.combat, [id]: combat };
    }
    this.persistSettings();
  }

  /* The seated plane's toggle back in step with the seat, as seatAirframe
   * keeps it, after a picker flip that seated nothing: put away, or a swap
   * the run refused. Nothing then says floats on a plane on its wheels. */
  settleFloats() {
    const s = this.settings;
    const land = landPlaneOf(s.airframe);
    if (floatVersionOf(land) && Boolean(s.floats && s.floats[land]) !== isFloatVersion(s.airframe)) {
      s.floats = { ...s.floats, [land]: isFloatVersion(s.airframe) };
      this.persistSettings();
    }
  }

  /*
   * MY HANGAR (src/ui/builds.js): the pilot's builds, read once from their
   * own key and written back whole on every change.
   */
  get myBuilds() {
    if (!this.buildList) {
      this.buildList = loadBuilds();
    }
    return this.buildList;
  }

  /* The build an airframe is wearing, as a build, or null. */
  wornBuild(id) {
    const worn = fittedBuild(this.settings, id);
    return this.myBuilds.find((b) => b.id === worn) ?? null;
  }

  /* What the picker needs of them: the list, how a card is drawn when it
   * is not simply the slots, and the Rename and Delete on a build's card. */
  pickerBuilds() {
    const s = this.settings;
    return {
      list: () => this.myBuilds,
      drawn: (card, build) => {
        if (build) {
          return drawnFit(`${BUILD_PREFIX}${build.id}`, build.airframe, build.fit);
        }
        return familyFitted(s, card) ? drawnFit(card, card, stockFit(s, card)) : null;
      },
      rename: (id, name) => this.renameBuild(id, name),
      remove: (id) => this.removeBuild(id),
    };
  }

  /* Put a build on. Whether the slots moved: choosing the build already
   * worn, as it is, moves nothing. */
  wearBuild(build) {
    const s = this.settings;
    if (fittedBuild(s, build.airframe) === build.id && JSON.stringify(fitOf(s, build.airframe)) === JSON.stringify(build.fit)) {
      return false;
    }
    fitBuild(s, build);
    return true;
  }

  /* A build kept, new or changed, and worn again where it is worn. Whether
   * the slots moved. */
  storeBuild(build) {
    const list = this.myBuilds.slice();
    const at = list.findIndex((b) => b.id === build.id);
    if (at >= 0) {
      list[at] = build;
    } else {
      list.push(build);
    }
    this.buildList = list;
    saveBuilds(list);
    const e = (this.settings.buildFits || {})[landPlaneOf(build.airframe)];
    if (!e || e.build !== build.id) {
      return false;
    }
    fitBuild(this.settings, build);
    this.persistSettings();
    return true;
  }

  /* A new build from a fit, named by the pilot (src/ui/hangar.js has
   * checked the name). The new build, or null when My Hangar is full. */
  addBuild(name, airframe, fit) {
    if (this.myBuilds.length >= MAX_BUILDS) {
      return null;
    }
    const now = Date.now();
    const build = { id: newBuildId(now), name, airframe, fit, created: now, updated: now };
    this.storeBuild(build);
    return build;
  }

  /* A name for a new build of this airframe nobody has used: the plane's
   * own and the next number. */
  buildName(airframe) {
    const taken = new Set(this.myBuilds.map((b) => b.name));
    const plane = airframeById(landPlaneOf(airframe)).name;
    let n = this.myBuilds.filter((b) => landPlaneOf(b.airframe) === landPlaneOf(airframe)).length + 1;
    while (taken.has(str('mine.default_name', { plane, n }))) {
      n += 1;
    }
    return str('mine.default_name', { plane, n });
  }

  /* '' when renamed, else the sentence saying why not. */
  renameBuild(id, name) {
    const b = this.myBuilds.find((x) => x.id === id);
    const named = checkBuildName(name);
    if (!b || !named.name) {
      return str(`mine.name_${named.error ?? 'empty'}`);
    }
    this.storeBuild({ ...b, name: named.name, updated: Date.now() });
    return '';
  }

  /* A build gone. One being worn comes off, the pilot's own customisation
   * back on, and the seated plane refits if it was that one. */
  removeBuild(id) {
    const s = this.settings;
    const b = this.myBuilds.find((x) => x.id === id);
    if (!b) {
      return;
    }
    this.buildList = this.myBuilds.filter((x) => x.id !== id);
    saveBuilds(this.buildList);
    const e = (s.buildFits || {})[landPlaneOf(b.airframe)];
    if (e && e.build === id) {
      unfitFamily(s, b.airframe);
      this.persistSettings();
      if (landPlaneOf(s.airframe) === landPlaneOf(b.airframe)) {
        this.refitted(s.airframe);
      }
    }
  }

  /*
   * The slots of the seated plane changed outside the hangar (a build put
   * on or taken off): repainted and refitted by the hangar's own hook, as
   * a save is, so the craft in the air flies what it now wears.
   */
  refitted(id) {
    if (!this.onHangarSave) {
      return Promise.resolve();
    }
    const s = this.settings;
    return Promise.resolve()
      .then(() => this.onHangarSave(id, { powerChanged: true, liveryChanged: true, settings: { parts: s.parts, tuning: s.tuning, combat: s.combat } }))
      .catch((e) => {
        console.error('refit failed', e);
      });
  }

  /* A card on the gate: the aircraft for that way in, then the way in. An
   * aircraft the card does not take, chosen under All, takes the card that
   * does. */
  pickForWay(action) {
    const way = WAYS.find((w) => w.action === action);
    if (!way) {
      return;
    }
    /* Every card is a way into a flight or a room: none without an
     * account (src/share/account.js needSignIn), and the card is pressed
     * again once the pilot has signed in. */
    if (needSignIn(() => this.pickForWay(action))) {
      return;
    }
    /* A room's aircraft is chosen in the room, once it is known who is
     * flying what: the card goes straight to the room screen. */
    /*
     * EVERY CARD, ONE PRESS, into its game's lobby (the owner, 2026-10-02:
     * "every click will take you to the lobby for it, ready to go either
     * single or multi"; src/main.js onGameCard), its aircraft chosen
     * there. With no rooms server the cards fly alone as they always did.
     * Defend the Paraná is the exception: its front door is the campaign's
     * page, the missions with their stars (the owner, 2026-10-03), and a
     * mission's Play makes the room for it, onto its briefing.
     */
    if (way.campaign && this.onCampaignCard) {
      this.onCampaignCard();
      return;
    }
    if (way.opsCampaign && this.onOpsCampaignCard) {
      this.onOpsCampaignCard(way.opsCampaign);
      return;
    }
    if (this.onGameCard && this.friendsRow && this.friendsRow() && Object.hasOwn(way, 'lobby')) {
      this.onGameCard(action, way.lobby, way.home || seatedFreestyleMap(this.settings)?.id || 'swiss2');
      return;
    }
    if (way.game === 'war' && this.onWarCard) {
      this.onWarCard(action);
      return;
    }
    if (way.room) {
      this.act(action);
      return;
    }
    const s = this.settings;
    this.openPicker({
      current: way.airframes.includes(s.airframe) ? s.airframe : way.airframes[0],
      filter: wayFilter(way),
      title: way.label,
      hint: this.pickHint(),
      onChoose: (id, moved) => {
        if (moved && id === s.airframe) {
          this.refitted(id);
        }
        /* The card's own way, whatever was chosen in its picker: a quad
         * chosen from Free Flight flies Free Flight's field. It used to go
         * to the first card that listed it, Track mode, and so to My
         * tracks (the owner, 2026-10-01: "the track selector should only
         * open up when i click on the track mode card"). */
        this.act(way.action, id);
      },
      onCancel: () => this.renderMenu(),
    });
  }

  /* The Aircraft row. Between runs it seats the aircraft for the next one,
   * as the row always has; in a run it swaps it in place. */
  openCraftRow(midRun) {
    const s = this.settings;
    this.openPicker({
      current: s.airframe,
      filter: kindOf(s.airframe),
      hint: this.pickHint(),
      onChoose: (id, moved) => {
        if (id === s.airframe) {
          (moved ? this.refitted(id) : Promise.resolve()).then(() => this.renderMenu());
          return;
        }
        if (midRun && this.onHotSwap) {
          this.swapTo(id).then(() => {
            this.settleFloats();
            this.renderMenu();
          });
          return;
        }
        seatAirframe(s, id);
        s.airframeAsked = true;
        this.writeSettings();
      },
      onCancel: () => this.renderMenu(),
    });
  }

  /*
   * The swap in place, from flight (Tab, the pad's Y, the Aircraft chip, the
   * thumb button) or from the pause menu's row. From flight the run pauses
   * behind it the way Escape pauses it, and going back resumes; from the
   * menu going back is the menu. Choosing flies on from wherever it came.
   */
  openSwap(from) {
    if (!this.onHotSwap || this.carousel.isOpen) {
      return;
    }
    if (from === 'flight') {
      if (this.screen !== 'flight') {
        return;
      }
      this.act('pause');
      this.show('paused');
    }
    const current = this.settings.airframe;
    this.openPicker({
      current,
      filter: kindOf(current),
      compact: true,
      title: str('carousel.change_aircraft'),
      warn: this.swapWarning ? this.swapWarning() : '',
      hint: this.pickHint(),
      onChoose: (id, moved) => {
        /* The same airframe in other clothes is a refit where it is. */
        let go = Promise.resolve();
        if (id !== this.settings.airframe) {
          go = this.swapTo(id);
        } else if (moved) {
          go = this.refitted(id);
        }
        go.then(() => {
          this.settleFloats();
          this.act('resume');
        });
      },
      onCancel: () => {
        if (from === 'flight') {
          this.act('resume');
        } else {
          this.renderMenu();
        }
      },
    });
  }

  /*
   * THE HANGAR (src/ui/hangar.js) for one plane, from the picker's
   * Customise or the pause menu. The shell answers three things through
   * hooks: the power options (hangarPower, null for the stock setup only),
   * what saving will cost here (hangarWarning), and what to repaint or
   * refit once it is saved (onHangarSave); the preview is onHangarPreview,
   * a null look meaning back to what is saved. `after` runs once it is
   * shut either way: the picker opens again on the same plane, the pause
   * menu redraws; after a Save to My Hangar it is handed the new build's
   * card, so the picker opens on that.
   *
   * WHAT IS EDITED (src/ui/builds.js): `build`, a My Hangar build, when
   * one is given, and otherwise the stock plane's customisation, which is
   * in the slots as it always was unless its family wears a build, when
   * it waits beside them. Either can be saved as a new build too.
   */
  openHangar(card, after = null, build = null) {
    const s = this.settings;
    /* A build opens on the airframe it was built on; a stock plane on the
     * version its toggle names, whichever of the two it was asked for. */
    const id = build ? build.airframe : withFloats(s, landPlaneOf(card));
    if (!customisable(id) || this.hangar.isOpen) {
      return;
    }
    /* A combat aircraft opens on what it carries (src/ui/hangar-combat.js);
     * a quad without paint on its motors. */
    const firstTab = airframeById(id).combat ? 'loadout' : paintable(id) ? null : 'power';
    const family = liveryKey(id);
    const inSlots = !build && !familyFitted(s, id);
    const held = build ? build.fit : stockFit(s, id);
    /* The settings as the tabs read them: the slots, or the slots with what
     * is edited put in, on a copy. */
    const view = inSlots ? s : putFit({ ...s }, id, held);
    const preview = (look) => {
      if (this.onHangarPreview) {
        this.onHangarPreview(id, look);
      }
    };
    const done = (next) => {
      if (after) {
        after(next);
      }
    };
    const offered = this.hangarPower ? this.hangarPower(id) : null;
    const power = offered && !inSlots ? { ...offered, chosen: powerChoice(id, view.power) } : offered;
    /*
     * THE FLOATS TOGGLE, beside the span and the weight: remembered for this
     * plane, and when it is the seated one it seats the other version at
     * once, in place in a run as the picker's swap does. The hangar then
     * opens again on the version the toggle names, shut quietly first so
     * `after` waits for that one. On a build the floats are its airframe,
     * so the build moves to the other version; the seated plane goes with
     * it only when it is wearing that build.
     */
    const land = landPlaneOf(id);
    const onFloats = floatVersionOf(land) ? (on) => {
      const to = on ? floatVersionOf(land) : land;
      this.hangar.close();
      preview(null);
      const moved = build ? { ...build, airframe: to, fit: normaliseFit(to, build.fit), updated: Date.now() } : null;
      const flown = landPlaneOf(s.airframe) === land && s.airframe !== to
        && (build ? fittedBuild(s, s.airframe) === build.id : inSlots);
      if (build) {
        this.storeBuild(moved);
      } else {
        s.floats = { ...s.floats, [land]: on };
      }
      const reopen = (ok = true) => this.openHangar(to, after, ok ? moved : build);
      if (!flown) {
        this.persistSettings();
        reopen();
      } else if (this.returnTo === 'paused' && this.onHotSwap) {
        /* A swap the run refuses leaves the plane as it was, and the toggle
         * or the build with it, so the hangar never says floats on a plane
         * on wheels. */
        this.swapTo(to).then((ok) => {
          if (ok !== true) {
            if (build) {
              this.storeBuild(build);
            } else {
              s.floats = { ...s.floats, [land]: !on };
            }
          }
          this.persistSettings();
          reopen(ok === true);
        });
      } else {
        seatAirframe(s, to);
        this.writeSettings();
        reopen();
      }
    } : null;
    this.hangar.open({
      airframe: id,
      tab: firstTab,
      floats: onFloats ? { on: isFloatVersion(id), set: onFloats } : null,
      livery: view.livery[family],
      mine: {
        name: build ? build.name : null,
        suggest: this.buildName(id),
        full: this.myBuilds.length >= MAX_BUILDS,
      },
      onLibrary: (list) => {
        const saves = { ...s.liverySaves };
        if (list.length) {
          saves[family] = list;
        } else {
          delete saves[family];
        }
        s.liverySaves = saves;
        this.persistSettings();
      },
      power,
      warn: this.hangarWarning ? this.hangarWarning(id) : '',
      hint: this.pickHint(),
      settings: view,
      onTry: (choice) => {
        if (this.onHangarTry) {
          this.onHangarTry(id, choice);
        }
      },
      sound: (kind) => {
        if (this.onUiSound) {
          this.onUiSound(kind);
        }
      },
      onPreview: preview,
      onSave: (res) => {
        preview(null);
        if (inSlots && !res.asNew) {
          this.saveSlots(id, power, res).then(() => done());
          return;
        }
        const fit = normaliseFit(id, {
          livery: res.livery,
          power: power ? res.power : held.power,
          parts: res.settings.parts ? res.settings.parts[id] : held.parts,
          tuning: res.settings.tuning ? res.settings.tuning[id] : held.tuning,
          combat: res.settings.combat ? res.settings.combat[id] : held.combat,
        });
        /* A wing taped is the airframe mended, whatever was edited: its
         * damage is the slots'. */
        let refit = this.keepDamage(id, res);
        let next;
        if (res.asNew) {
          const made = this.addBuild(res.asNew.name, id, fit);
          next = made ? `${BUILD_PREFIX}${made.id}` : undefined;
        } else if (build) {
          refit = this.storeBuild({ ...build, fit, updated: Date.now() }) || refit;
        } else {
          setStockFit(s, id, fit);
        }
        (refit ? this.refitAfterSave(id, res) : Promise.resolve(this.persistSettings())).then(() => done(next));
      },
      onCancel: () => {
        preview(null);
        done();
      },
    });
  }

  /* The hangar's Save on the slots themselves, as it has always been. */
  saveSlots(id, power, res) {
    const s = this.settings;
    const family = liveryKey(id);
    const livery = { ...s.livery };
    if (res.livery) {
      livery[family] = res.livery;
    } else {
      delete livery[family];
    }
    s.livery = livery;
    if (power && s.power && typeof s.power === 'object') {
      s.power = { ...s.power, [id]: res.power };
    }
    /* The registered tabs' own (registerHangarTab in src/ui/hangar.js). */
    Object.assign(s, res.settings);
    return this.refitAfterSave(id, res);
  }

  refitAfterSave(id, res) {
    this.persistSettings();
    return Promise.resolve()
      .then(() => (this.onHangarSave ? this.onHangarSave(id, res) : null))
      .catch((e) => {
        console.error('hangar save failed', e);
      });
  }

  /* The Parts tab's damage, which is the airframe's own, into the slots
   * when what was saved was not the slots. Whether it changed. */
  keepDamage(id, res) {
    const s = this.settings;
    if (!res.settings.parts) {
      return false;
    }
    const was = s.parts && s.parts[id];
    const want = res.settings.parts[id] ? res.settings.parts[id].damage ?? null : null;
    if (JSON.stringify((was && was.damage) ?? null) === JSON.stringify(want)) {
      return false;
    }
    s.parts = normaliseParts({ ...s.parts, [id]: { prop: 'stock', addons: [], ...(was ?? {}), damage: want } });
    return true;
  }

  /* The shell's swap, whose failure is a defect and is said out loud. */
  swapTo(id) {
    return Promise.resolve()
      .then(() => this.onHotSwap(id))
      .catch((e) => {
        console.error('aircraft swap failed', e);
      });
  }

  /* [ and ], and the pad's shoulders: the next aircraft without the picker. */
  cycleSwap(dir) {
    if (this.onHotSwap && this.screen === 'flight') {
      this.swapTo(withFloats(this.settings, cycleCraft(this.settings.airframe, dir, this.craftOnly())));
    }
  }
}

/*
 * Ui methods kept in modules of their own. Each module exports a plain
 * object of methods, installed on the prototype here so every caller
 * still writes ui.method(). One line per module, a blank line between,
 * so modules split in parallel merge without touching each other's line.
 */
import { dialogMethods } from './dialogs.js';
Object.assign(Ui.prototype, dialogMethods);

import { menuControlMethods } from './menucontrols.js';
Object.assign(Ui.prototype, menuControlMethods);

import { cardMethods } from './cards.js';
Object.assign(Ui.prototype, cardMethods);

import { overlayMethods } from './overlay.js';
import { resultsMethods } from './results.js';
Object.assign(Ui.prototype, overlayMethods, resultsMethods);

import { keyMethods } from './keys.js';
Object.assign(Ui.prototype, keyMethods);

import { itemMethods } from './items.js';
Object.assign(Ui.prototype, itemMethods);

/* slot: menu render and navigation */

/* slot: actions */

/* slot: session rows, music dock and howto */
