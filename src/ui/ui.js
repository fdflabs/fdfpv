/*
 * ui.js: the Ui class, the shell's menus and flight overlay. Title and hubs,
 * the tutorial, settings, pause, results, calibration, the firmware bench
 * and the overlay drawn over a flight all hang off it; the screens' rows,
 * painters and moves live in the modules beside it (items, nav, actions,
 * page, overlay and the rest) and are installed onto this class.
 *
 * Every menu works from the keyboard alone and from a radio or gamepad
 * alone. A radio has no dependable buttons, so its sticks drive the menus:
 * pitch moves the cursor, roll right chooses, roll left goes back, and any
 * pad button also chooses. The title and Settings leave the sticks to the
 * aircraft, so their rows take the mouse and keyboard, with a radio switch
 * still choosing on the title, and each screen says so. Value rows also
 * have mouse controls: arrows for a stepped number, a dropdown for a list.
 *
 * The markup is built in JavaScript beside the state that drives it; the
 * CSS stays in index.html. Nothing here touches the simulation: the shell
 * hands in state and gets back the player's intent as action strings.
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
import './hangar-shop.js';
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

/*
 * Actions that open a screen of their own or another tab. A row whose action
 * is listed draws the chevron that says so; anything missing from the set
 * draws as a plain action, which promises less, so forgetting one is safe.
 */
export const SCREEN_ACTIONS = new Set([
  'courses', 'race', 'freestyle', 'pilot', 'quad', 'launch', 'standings', 'rates', 'pids', 'fc',
  'howto', 'tricks', 'credits', 'trackbuilder', 'remix', 'editown', 'choosepad',
  'calibrate', 'friends', 'rooms', 'roomnew',
]);

/*
 * The screens a room is entered from and returned to on Back. The title is
 * left out: Back reaches it anyway when nothing else is open.
 */
export const ROOM_PARENTS = new Set(['courses', 'freestyle', 'launch', 'quad', 'pilot']);

/* The breadcrumb's word for each screen. */
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
/*
 * The freestyle world in the seat, or null when the seat holds a track. The
 * title's Map row names what Fly would launch, which is the seat, not the
 * last world the picker showed.
 */
export function seatedFreestyleMap(s) {
  const id = s ? s.map : undefined;
  return MAPS.find((world) => world.mode === 'freestyle' && world.id === id) ?? null;
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
 * Scoring is unfinished, so whenever it is switched on the row's note opens
 * with that caveat before describing the modes (see DEFAULTS.freestyleScoring).
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
  const parts = mode === 'off' ? [SCORING_HOW] : [SCORING_WARNING, SCORING_HOW];
  return parts.join(' ');
}

/*
 * The one name a track card credits. The board's `author` is whoever
 * published it; for the imported RaceGOW5 rooms that is not who designed
 * them, and the board passes the designer through, so the designer wins
 * when known. The detail pane shows both.
 */
export function byLine(t) {
  if (!t) {
    return '';
  }
  if (t.designer) {
    return str('ui.by', { designer: t.designer });
  }
  return t.author ? str('ui.by_2', { author: t.author }) : '';
}

/*
 * How src/render/carousel3d.js draws a picker card that is not simply the
 * slots (a My Hangar build, or a stock plane's fit kept beside one): the
 * model key, the livery, the fitted parts and power where the airframe has
 * them, and a combat loadout.
 */
function pickerLook(key, id, fit) {
  let fitted = null;
  if (PROPS[id]) {
    const entry = Object.assign({ prop: 'stock', addons: [], damage: null }, fit.parts);
    const option = POWER[id] ? powerChoice(id, { [id]: fit.power }).option : null;
    fitted = { id, entry, option };
  }
  return { key, look: lookFor(id, fit.livery), fit: fitted, combat: fit.combat ?? null };
}

/*
 * Whether the seat holds a race, which is what earns the launch card: it
 * explains what a lap time counts as, and a flight with no clock has
 * nothing to explain. Decided by gate count, as the rooms and the renderer
 * decide it, so a published track with no gates flies as freestyle whatever
 * world it stands in. A freestyle world is never a race.
 */
export function seatIsRace(s) {
  const world = MAPS.find(({ id }) => id === s.map) || MAPS[0];
  const gates = world.mode === 'freestyle' ? 0 : (activeCourseSummary()?.gates ?? 0);
  return gates > 0;
}

/*
 * The radio problems that leave a pilot stuck in the menus, most serious
 * first, each with the string keys of its row. Shown as row zero of the
 * menu, not a banner, so a radio can reach it and Enter goes straight to
 * calibration, the fix for all three:
 * - no buttons: every switch reads as an axis, so nothing can select; the
 *   note teaches the hold gesture src/input/input.js accepts instead.
 * - throttle guess looks wrong: an uncalibrated mapping that neither the
 *   browser vouches for (mapKnown, a standard gamepad) nor has been seen
 *   parked off centre the way a real throttle sits (mapUsable, see
 *   noteThrottleParked). Judged on what the axes did, not on whether the
 *   wizard was ever run, because a radio the guess already fits is fine.
 * - yaw missing: the throttle fits but the axis guessed as yaw never moved
 *   (noteGuessOrder). After the throttle row, which is the worse surprise.
 */
const PAD_TROUBLES = [
  {
    applies: (pad) => !pad.buttons && !pad.hasSelect,
    label: 'ui.your_radio_has_no_buttons_this',
    note: ['ui.every_switch_on_it_is_arriving', 'ui.hold_any_stick_away_from_centre', 'ui.which_is_enough_to_get_in',
      'ui.to_throw_the_switch_you_want'],
  },
  {
    applies: (pad) => !pad.calibrated && !pad.mapKnown && !pad.mapUsable,
    label: 'ui.this_browser_is_guessing_your_stick',
    note: ['ui.the_axis_it_thinks_is_your', 'ui.throttle_rests_at_one_end_because', 'ui.probably_wrong_and_a_wrong_guess',
      'ui.that_springs_back_calibrating_takes_about'],
  },
  {
    applies: (pad) => !pad.calibrated && pad.guessNoYaw,
    label: 'ui.this_browser_cannot_see_your_yaw',
    note: ['ui.the_axis_it_guessed_was_yaw', 'ui.know_about_has_been_swept_end', 'ui.in_some_order_other_than_the',
      'ui.lost_is_yaw_calibrating_takes_about', 'ui.is_which'],
  },
];

/* The warning row for the controller in use, or null for none (and always
 * null on the keyboard or with nothing plugged in). */
export function padTroubleItem(info) {
  if (!info || !info.count || info.using === 'Keyboard') {
    return null;
  }
  const trouble = PAD_TROUBLES.find((t) => t.applies(info));
  if (!trouble) {
    return null;
  }
  return {
    label: str(trouble.label),
    action: 'calibrate',
    rowClass: 'row-warn',
    note: trouble.note.map((key) => str(key)).join(''),
  };
}

/* What the seated track is to the board, or null when nothing is seated. */
export function liveListing() {
  let seated = null;
  try {
    seated = inspectCourse();
  } catch (e) {
    /* Storage that cannot be read holds no seat worth listing. */
  }
  return seated && seated.kind !== 'none' ? seated : null;
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
 * What a track card is remembered by. items() makes new card objects on
 * every render, so the chosen one is kept as this string, never by
 * reference: its kind and its track's id.
 */
export function courseCardKey(card) {
  const course = card ? card.course : null;
  return course ? `${course.kind}:${course.track.id}` : null;
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
 * The list under a chosen track card. Choosing a card does not fly it: it
 * opens this list, Play first, so Enter twice still flies. The pilot's own
 * tracks can be edited, renamed, copied and deleted; a board track can be
 * copied into My tracks, its standings read, or its page opened. Each entry
 * is [label key, action, note key]; every note may name the track and its
 * world.
 */
const OWN_CARD_ENTRIES = [
  ['ui.edit', 'card-edit', 'ui.open_it_in_the_builder_in'],
  ['ui.rename', 'card-rename', 'ui.give_it_a_name_you_will'],
  ['ui.duplicate', 'card-duplicate', 'ui.a_copy_to_change_without_touching'],
  ['ui.delete_label', 'card-delete', 'ui.take_it_out_of_this_browser'],
];
const BOARD_CARD_ENTRIES = [
  ['ui.duplicate', 'card-duplicate', 'ui.copy_it_into_my_tracks_board'],
  ['ui.standings', 'card-standings', 'ui.every_time_posted_on_fastest_first'],
  ['ui.open_on_the_web', 'card-board', 'ui.the_public_page_for_a_link'],
];

export function courseCardRows(subject) {
  if (subject.course.kind === 'cloud') {
    return cloudCardRows(subject);
  }
  const fromBoard = subject.course.kind === 'board';
  const vars = { name: subject.label, world: mapById(subject.course.track.map).name };
  const entry = ([label, action, note]) => ({ label: str(label), action, note: str(note, vars) });
  /* The heading names the track in words, since the highlighted card sits
   * well above this list. A section, so the cursor skips it. */
  return [
    { label: subject.label, section: true },
    entry(['ui.play', 'card-fly', fromBoard ? 'ui.load_from_the_board_and_fly' : 'ui.race_it_in']),
    ...(fromBoard ? BOARD_CARD_ENTRIES : OWN_CARD_ENTRIES).map(entry),
    { label: str('ui.back_to_the_list'), action: 'card-back' },
  ];
}

/*
 * The aircraft row heading the Quad screen. Its note is the loudest on the
 * screen because the change is: a new aircraft brings its own tune, pack and
 * camera, and its own kind of track (a whoop room, a five inch field, an
 * airfield), so the seated track moves too.
 *
 * Given `swap` (the shell's, present only during a run) the choice swaps the
 * aircraft in place via src/main.js hotSwap; otherwise it seats it for the
 * next run. Enter and a click open the picker (src/ui/carousel.js) through an
 * `open` the screen adds, since that needs the Ui.
 */
export function craftItem(s, swap, shown = s.airframe) {
  const inPlace = swap ? ` ${str('carousel.in_place')}` : '';
  const note = str('ui.changing_it_loads_that_machine_s', { blurb: airframeById(shown).blurb, v3: inPlace });
  const nameOf = (id) => airframeById(id).name;
  const take = swap ? (id) => { swap(id); } : (id) => { seatAirframe(s, id); };
  return { ...choice(str('ui.aircraft'), note, AIRFRAME_IDS, shown, nameOf, take), pickOnly: true };
}

/*
 * The yaw rate offered when a steep camera tilt starts eating yaw. Past 40
 * degrees of tilt sin(t) exceeds 0.64, so about two thirds of a yaw input
 * shows as roll in the picture; 500 deg/s makes a 40 degree mount feel
 * roughly like 30 degrees at the stock rate. Both figures measured, see
 * PROGRESS.md.
 */
export const YAW_TIP_RATE = 500;

/* The page's query string, empty where there is no location to read. */
function linkParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch (e) {
    return new URLSearchParams();
  }
}

/*
 * The session's purpose when the link already gives it, so the gate does
 * not ask again: a board link (?share=) or a chase link (?ghost=) means a
 * race, and ?map= a known world's own mode. null when the link says nothing
 * usable. Only links answer this, never stored settings: see the
 * constructor.
 */
function linkedMode() {
  const q = linkParams();
  if (q.get('share') || q.get('ghost')) {
    return 'race';
  }
  const named = q.get('map');
  const world = named ? MAPS.find(({ id }) => id === named) : undefined;
  if (!world) {
    return null;
  }
  return world.mode === 'freestyle' ? world.mode : 'race';
}

/*
 * The aircraft a link names with ?craft=, so someone arriving from the
 * builder or the board with a craft already chosen skips the question.
 * Anything not a known airframe id is null, so an unreadable answer asks
 * just as a missing one does.
 */
function linkedCraft() {
  const id = currentAirframeId(linkParams().get('craft'));
  return AIRFRAME_IDS.includes(id) ? id : null;
}

/*
 * Seat the aircraft a link names, as the gate's answer. Through
 * seatAirframe rather than assigning settings.airframe first, because
 * seatAirframe reads the airframe being left to decide whether the rates and
 * throttle cap are still that machine's stock ones; written first, a whoop
 * link on a five inch profile kept 670 degree rates and no cap. Whether a
 * link seated one.
 */
function seatLinkedCraft(settings) {
  const id = linkedCraft();
  if (!id) {
    return false;
  }
  seatAirframe(settings, id);
  settings.airframeAsked = true;
  saveSettings(settings);
  return true;
}

/* The overlay writes text, class and bar width every frame; a node keeps
 * its last value under `slot` and is touched only when the value moved,
 * because even an equal write replaces children and dirties style. */
function writeChanged(node, slot, value, apply) {
  if (!node || node[slot] === value) {
    return;
  }
  node[slot] = value;
  apply(node, value);
}

const asText = (value) => (value == null ? '' : String(value));

/* The tutorial's input sources; anything else shows the keyboard. */
const HOWTO_SOURCES = new Set(['radio', 'launch', 'touch', 'mouse']);

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.firstRun = detectFirstRun();
    /*
     * The front door asks one question with three cards (WAYS): what is
     * this session for, and in which aircraft. The two halves are held
     * apart because they are remembered differently.
     *
     * The session's purpose, 'race' or 'freestyle', is answered by a link
     * that names what to fly (linkedMode) and by nothing else: it is not
     * in the settings and is never remembered, on purpose. Racing on
     * Tuesday says nothing about Wednesday, and a remembered answer would
     * put last time's choice in front of the pilot as a fact. One keypress
     * a visit buys a front page about the thing they came to do, and it
     * removes a choice the menu behind used to make twice (a mode row per
     * place became one row naming the place). null means not asked yet.
     */
    this.mode = linkedMode();
    /*
     * The aircraft is a preference and IS remembered, in settings.airframe;
     * what is not remembered is that the gate asked, so it opens every
     * visit (craftGate). It used to be a first run question answered once,
     * which hid the whoop half of the product three rows deep.
     *
     * A link naming the aircraft (?craft=) answers this half without the
     * gate. It goes through seatAirframe and NOT through an assignment to
     * settings.airframe first: seatAirframe decides whether the rates and
     * the throttle cap are still the stock ones of the aircraft it is
     * moving FROM, read off settings.airframe, so writing the destination
     * in first made from and to the same machine and a whoop link on a
     * five inch profile flew the whoop on 670 degree rates with no cap.
     * airframeAsked is what lets the link skip the gate and what the
     * choice screen writes so the seat is an answer, not a default.
     */
    const seatedByLink = seatLinkedCraft(this.settings);
    /* The gate is up while either half is unanswered: see onGate. */
    this.craftGate = !seatedByLink;
    /* The hub on the gate, null for home and its three hub cards. */
    this.hub = null;
    /* The walkable hangar, while it is open (src/ui/hangarwalk.js). */
    this.walk = null;
    /* A guided first flight is in the air; main.js reads it. */
    this.guided = false;
    /* The room game a title card preselected; see act()'s ways. */
    this.roomGame = null;
    /* The board's tracks, this browser's own (loadLocalCourses, listed by
     * My tracks together with the board's), and everybody else's on the
     * tracks server a page at a time (loadCloudCourses) with where the
     * next page starts. */
    this.boardCourses = [];
    this.localCourses = [];
    this.cloudCourses = [];
    this.cloudNext = '';
    /* The standings screen's subject and times: null is not asked yet
     * (drawn as Reading the board), an empty array is a board that
     * answered with none. */
    this.standingsFor = null;
    this.standingsTimes = null;
    this.standingsError = '';
    /* The Ghost and Live rows the shell pushes (setGhostRow, setLiveRow),
     * because the shell knows what can be chased; null hides the row. */
    this.ghostRow = null;
    this.liveRow = null;
    this.boardLoading = false;
    this.openingBoardCourse = false;
    this.onBoardCourse = null; /* (track) => Promise<boolean> */
    this.screen = 'title';
    /*
     * The device the pilot last touched, so the command bar prints that
     * device's glyphs and not two sets. 'none' until something is pressed:
     * a phone never sends a key, and starting at 'key' told it to press
     * Enter. The legend reads 'none' to choose a touch voice; everything
     * else treats it as 'key'.
     */
    this.lastInput = 'none';
    /* Screen id to the label of the row the cursor was on (restoreCursor). */
    this.cursorMemory = {};
    /* The cursor's two halves: the id says which row, the index says where
     * that row is right now (syncCursor, restoreFocusRow). */
    this.focusId = null;
    this.cursor = 0;
    /* On the gate the cursor opens on the seated card, so a returning
     * pilot sees their own answer under it and two presses of Enter from
     * cold put them back where they were. renderMenu re-picks only when
     * the cursor fell off the list, and zero is a valid row, so the first
     * paint is told here. */
    const gateOpen = this.craftGate || !this.mode;
    if (gateOpen) {
      const seatedId = seatedWay(this.settings, this.mode).id;
      this.cursor = Math.max(0, GATE_WAYS.findIndex(({ id }) => id === seatedId));
    }
    /* The course card the pilot chose (courseCardKey), whose list is
     * showing, and the last one they stood on, where Back to the list
     * puts the cursor. */
    this.cardSubject = null;
    this.lastCardKey = null;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.onMusicSkip = null; /* (dir) => void, -1 previous, +1 next */
    /* (screen) => void, fired by show(). The shell hangs the music context
     * off it: the flight crate on a flight, the menu bed everywhere else,
     * and only this file knows which is up. */
    this.onScreenChange = null;
    /*
     * The dock's placeholder until main.js pushes the player's real status,
     * which it does before the first gesture. A MENU record, because a
     * visit opens in the menus and the menu bed is what will play; the
     * Music track setting names a flight record and is not the answer
     * even when pinned. MENU_TRACKS[0] rather than a roll of our own that
     * could disagree with the player's for one frame; an empty crate
     * names nothing.
     */
    const firstRecord = MENU_TRACKS[0];
    this.musicNow = {
      id: firstRecord ? firstRecord.id : '', name: firstRecord ? firstRecord.name : '',
      selection: this.settings.musicTrack, index: 0, context: 'menu',
    };
    /* The live sticks for the Rates curve: the frame loop writes them
     * through paintRates, the panel reads them on every redraw. */
    this.ratesStick = { roll: 0, pitch: 0, yaw: 0 };
    /* At most once a session, so oscillating across 40 does not nag. */
    this.yawTipAsked = false;
    /*
     * Where Escape goes back to from a room, from Rates, from PIDs and from
     * the flight controller, each held apart from returnTo on purpose.
     * returnTo is where the pause chain came from, and writing these into
     * it stranded a paused run: act('quad') set returnTo to 'title' from
     * anywhere unpaused, so a tune changed from the Freestyle room's Tune
     * row and Back landed on the title rather than the room, a one way
     * door dressed as a signpost. Rates and PIDs opened from Settings
     * land back on that list the same way without losing a paused origin
     * two screens up.
     */
    this.roomFrom = null;
    this.ratesFrom = null;
    this.pidsFrom = null;
    this.fcFrom = null;
    /* The module readback the PIDs screen draws from; see setPidsLive. */
    this.pidsLive = null;
    /* A refused preset write, one amber row in the Rates room until the
     * room is entered again or a write succeeds. This browser's last
     * answer, not a setting. */
    this.ratesNotice = null;
    /* The flight controller editor: the session holds the draft dump and
     * builds the rows, the shell owns what Save means (onFcSave). */
    this.onFcOpen = null;    /* (page) => void */
    this.onFcSave = null;    /* (draft, { restart, exit, presetId }) => void */
    this.onFcAngle = null;   /* (on) => void, same sim_set_angle_mode as Settings */
    this.onFcMotor = null;   /* (motor, duty) => void, sim_motor_override */
    this.fc = new FcSession();
    wireFcSession(this);
    this.onUiSound = null;   /* (kind) => void: 'move', 'adjust', 'select', 'back' */
    this.share = null;       /* published course this run is flying, or null */
    this.timePosted = null;  /* last successful post on the results screen */
    /* The freestyle run the results screen shows and whether it was sent;
     * resetScore clears both on every restart. */
    this.freestyleRun = null;
    this.runPosted = null;
    this.resultsFastest = null;
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    /* Seed the pad's edges on the next poll rather than acting on them;
     * every screen change sets it (show). */
    this.padRearm = true;
    this.dropEl = null;
    this.dropIndex = null;
    this.menuRows = [];
    this.rowOffset = 0;
    this.reelFreezeWorld = false;
    this.gpuInfo = null;
    /* Set by main.js; see setStickProbe. */
    this.stickProbe = null;
    /* The gravity hint shows at most once a page load, before the stored
     * flag is even read, so a pilot who dismissed it and paused does not
     * meet it again on the way back into flight. */
    this.airHintDone = false;
    this.airHintTimer = 0;
    this.ptrX = null;
    this.ptrY = null;
    this.build();
    watchSessionEvents(this);
    this.show('title');
    this.bindLocationHash();
  }

  /* Made once, from the constructor: the stages are in src/ui/page.js, and
   * each reads what the one before it left on the shell. */
  build() {
    buildFlightOverlay(this);
    buildFrame(this);
    buildScreens(this);
    buildChrome(this);
    mountPage(this);
  }


  /*
   * PLAY: fly the track the seat now holds. The seat goes to Track mode and
   * the shell builds the track's world if it is not the one standing, seats
   * the track's gates on it and opens the launch card, where Fly goes
   * (main.js 'play'). The pilot is on the title under the loading screen
   * meanwhile, which is where a world swap always lands.
   */
  play() {
    this.mode = 'race';
    Object.assign(this.settings, { map: 'track' });
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

  /* Which input the tutorial teaches. The column is rebuilt, not toggled:
   * it is a few lines, and the source rarely changes twice. */
  setHowtoSource(id) {
    this.howtoSource = HOWTO_SOURCES.has(id) ? id : 'keyboard';
    this.renderHowto();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
  }

  /*
   * Where the title's cursor lands when it is reset. On the gate it is the
   * card the pilot already stands on, so two presses of Enter from a cold
   * start put a returning pilot back where they were: at home the first
   * hub, in a hub the seated aircraft's card (seatedWay). Everywhere else
   * the first row that can be chosen.
   */
  titleStop() {
    const items = this.items();
    if (this.onGate()) {
      /* Home opens on the first hub (Flight Club, the owner's call of
       * 2026-10-03); inside a hub, on the seated aircraft's card. */
      const target = this.hub ? seatedWay(this.settings, this.mode).action : `hub-${HUBS[0].id}`;
      const found = items.findIndex(({ action }) => action === target);
      if (found !== -1) {
        return found;
      }
    }
    return this.firstStop(items);
  }

  /* Write guards for the overlay: setOsd runs every flight frame over the
   * WebGL canvas, and unguarded writes cost 17 mutation records a frame
   * (scorehud.js guards the same way). */
  static text(el, value) {
    writeChanged(el, '__lastText', asText(value), (node, text) => { node.textContent = text; });
  }

  static klass(el, value) {
    writeChanged(el, '__lastClass', asText(value), (node, cls) => { node.className = cls; });
  }

  /* A width in per cent rounded to a tenth first, so a pack draining
   * imperceptibly does not rewrite the bar every frame. */
  static bar(el, frac) {
    const tenths = Math.round(1000 * Math.min(1, Math.max(0, frac)));
    writeChanged(el, '__lastBar', tenths / 10, (node, pct) => { node.style.width = `${pct}%`; });
  }

  /* The current screen's scrolling box (its menu when it has no separate
   * scroller), or null. Read only to measure. */
  menuScrollNode() {
    const host = this.screens ? this.screens[this.screen] : null;
    if (!host) {
      return null;
    }
    return host.querySelector('.menu-scroll') || host.querySelector('.menu');
  }

  adjust(dir) {
    const row = this.items()[this.cursor];
    if (!row || !row.adjust) {
      return;
    }
    row.adjust(dir);
    this.writeSettings();
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
          return pickerLook(`${BUILD_PREFIX}${build.id}`, build.airframe, build.fit);
        }
        return familyFitted(s, card) ? pickerLook(card, card, stockFit(s, card)) : null;
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

import { buildChrome, buildFlightOverlay, buildFrame, buildScreens, mountPage } from './page.js';

import { itemMethods } from './items.js';
Object.assign(Ui.prototype, itemMethods);

import { navMethods } from './nav.js';
Object.assign(Ui.prototype, navMethods);

import { actionMethods } from './actions.js';
Object.assign(Ui.prototype, actionMethods);

import { walkMethods } from './hangarwalk.js';
Object.assign(Ui.prototype, walkMethods);

import { sessionMethods, watchSessionEvents, wireFcSession } from './session.js';
Object.assign(Ui.prototype, sessionMethods);
