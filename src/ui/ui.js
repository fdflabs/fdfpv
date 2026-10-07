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
export const SCREEN_ACTIONS = new Set([
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
    const linkedAf = linkedCraft();
    if (linkedAf) {
      seatAirframe(this.settings, linkedAf);
      this.settings.airframeAsked = true;
      saveSettings(this.settings);
    }
    /* The gate is up while either half is unanswered: see onGate. */
    this.craftGate = !linkedAf;
    /* The hub on the gate, null for home and its three hub cards. */
    this.hub = null;
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
    if (this.craftGate || !this.mode) {
      const seated = seatedWay(this.settings, this.mode).id;
      this.cursor = Math.max(0, GATE_WAYS.findIndex((w) => w.id === seated));
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
    this.musicNow = {
      id: MENU_TRACKS[0]?.id ?? '',
      name: MENU_TRACKS[0]?.name ?? '',
      selection: this.settings.musicTrack,
      index: 0,
      context: 'menu',
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

  /*
   * The overlay's three write guards. setOsd runs every flight frame, and
   * assigning a node the string it already holds still replaces its text
   * child and invalidates style, on an overlay composited above the WebGL
   * canvas: 17 mutation records a frame in flight before these, 3 on the
   * title. The last value lives on the node, so no map has to follow a
   * DOM the screens rebuild. scorehud.js keeps the same guard.
   */
  static text(el, value) {
    if (!el) {
      return;
    }
    const next = value == null ? '' : String(value);
    if (el.__lastText === next) {
      return;
    }
    el.__lastText = next;
    el.textContent = next;
  }

  static klass(el, value) {
    if (!el) {
      return;
    }
    const next = value == null ? '' : String(value);
    if (el.__lastClass === next) {
      return;
    }
    el.__lastClass = next;
    el.className = next;
  }

  /* A width in per cent, to one decimal before the compare: a pack that
   * drains a ten thousandth of a per cent a frame would otherwise write
   * every frame and move nothing a pilot can see. */
  static bar(el, frac) {
    if (!el) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, frac));
    const pct = Math.round(clamped * 1000) / 10;
    if (el.__lastBar === pct) {
      return;
    }
    el.__lastBar = pct;
    el.style.width = `${pct}%`;
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

import { buildChrome, buildFlightOverlay, buildFrame, buildScreens, mountPage } from './page.js';

import { itemMethods } from './items.js';
Object.assign(Ui.prototype, itemMethods);

import { navMethods } from './nav.js';
Object.assign(Ui.prototype, navMethods);

import { actionMethods } from './actions.js';
Object.assign(Ui.prototype, actionMethods);

import { sessionMethods, watchSessionEvents, wireFcSession } from './session.js';
Object.assign(Ui.prototype, sessionMethods);
