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
import { retiredMap } from '../maps/retired.js';
import { duplicateTrack, isMapTrack, normalize, toPlain } from '../trackbuilder/model.js';
import { raceGatesOf } from '../builder/course.js';
import { planesFor } from '../game/verify.js';
import {
  CAL_STEPS, MOUSE_SENS, MOUSE_EXPOS, MOUSE_CENTRES,
} from '../input/input.js';
import {
  STICK_MODES, DEFAULT_STICK_MODE, normaliseStickMode, stickChannels, stickCaption,
} from '../input/stickmode.js';
import { LINK_PRESETS } from '../input/link.js';

/* Wording for input.js's calibration steps. The order lives there. */
const CAL_LABELS = {
  center: 'Centre',
  sweep: str('ui.full_range'),
  throttle: 'Throttle',
  roll: 'Roll',
  pitch: 'Pitch',
  yaw: 'Yaw',
  /* Only asked of a radio that reports no buttons. See SELECT_STEP in
   * input.js. */
  select: str('ui.menu_switch'),
  confirm: 'Check',
};
import { MENU_TRACKS, trackById, musicIds } from '../render/tracks.js';
import { CUSTOM_TUNE, TUNES, tuneById, tunesFor } from '../../configs/registry.js';
import { AIRFRAMES, AIRFRAME_IDS, airframeById, currentAirframeId, floatVersionOf, isFloatVersion, landPlaneOf, retiredAirframe, WHOOP_TRUE_DIMS } from '../../configs/airframes.js';
import { normalizePower, powerChoice } from '../../configs/power.js';
import { normalizeTuning, setupFor } from '../../configs/tuning.js';
import { normaliseParts, normalisePlane } from '../../configs/hangar-parts.js';
import { Carousel, cycleCraft, kindOf } from './carousel.js';
import { Hangar } from './hangar.js';
/* Registers the hangar's Tuning tab, then the Parts tab. */
import './hangar-tuning.js';
import './hangar-parts.js';
/* Registers the Challenges tab, after the tabs that edit the plane. */
import { Progress, bindProgress } from './progress-ui.js';
import { installHangarPolish } from './hangar-polish.js';
import { liveryKey, normaliseLiveries, normaliseSaves, paintable } from '../../configs/liveries.js';
import { normaliseProgress } from '../game/progress.js';
import {
  RATE_DEFAULTS,
  RATE_FIELDS,
  RATE_TYPES,
  TOUCH_RATE_DEFAULTS,
  RATE_TYPE_LABEL,
  THROTTLE_CAP_CHOICES,
  THROTTLE_CURVE_FIELDS,
  cliOf,
  formatRate,
  fullStickDeg,
  hoverStickPercent,
  normaliseRates,
  pitchMatchesRoll,
  profileForType,
  rateField,
  ratesAreDefault,
  ratesFromLegacy,
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
  normalisePids,
  pidsAdjusted,
  pidsEntry,
  pidsSummary,
  setPidSlider,
  setPidsExpert,
} from '../../configs/pids.js';
import {
  boardConfigured, boardPageUrl, fetchTrackDocument, fetchTrackList, fetchTrackTimes, pickFeaturedTracks, wikiPageUrl,
} from '../share/board.js';
import { PATTERNS } from '../game/trickdetect.js';
import { PROVEN } from '../game/proven.js';
import { trickByName } from '../game/tricks.js';
import { TrickFilmPlayer, filmFor, VIEW_LABEL } from './trickfilm.js';
import { BOARD_WINDOW, WIKI_WINDOW, openNamedWindow } from '../share/windows.js';
import { BUG_KINDS, submitBug } from '../share/bugs.js';
import { crashRecord } from '../share/crashrecord.js';
import { createShotTray } from './bugshots.js';
import { watchVersion } from './update.js';
import { nameRules, readAccount, readPilotName, writePilotName } from '../share/pilot.js';
import { accountsAvailable } from '../share/account.js';
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
  detectDefaultGraphics,
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
import { JOKE_MS, quotedJoke } from './loading.js';
import { fillCredits } from './credits.js';
import { mountRatesPanel } from './ratespanel.js';
import { mountPidsPanel } from './pidspanel.js';
import { touchWanted } from '../input/touchsticks.js';
import {
  downloadCli, drawAttitude, FcSession, paintPageStrip, paintTabStrip,
} from './fc.js';
import { FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY } from '../fc/dump.js';
import { str, plural, LOCALES, LOCALE_NAMES, currentLocale, rememberLocale } from '../strings/index.js';
import { cleanCampaign } from '../game/campaign.js';
/* The pilot's own tracks live in this browser's library, and My tracks
 * lists, copies, renames and deletes them there. */
import {
  deleteTrack, listMapTracks, loadMapTrack, readOnlineStates, saveTrack,
} from '../trackbuilder/storage.js';
/* Everybody's tracks, on the tracks server (src/share/cloud.js). */
import {
  TRACK_SYNC_EVENT, fetchAllTracks, fetchTrack, pilotKey, pullOwnTracks, tracksConfigured,
} from '../share/cloud.js';

/* Whether a Flight controller save exists, which is what puts Your edits
 * on the Tune row. Read fresh each time: the pilot can save one two rows
 * away from the row that offers it. */
/*
 * Which actions leave for another tab, and which open another screen. The row
 * grammar reads these to decide a row's kind, so a new action that forgets to
 * appear here renders as a plain action, which is the safe default: it gets no
 * chevron it has not earned.
 */
const LINK_ACTIONS = new Set(['leaderboard', 'wiki']);
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
/*
 * How long the room has to be untouched before a world preview is allowed
 * to record. Long enough that arrowing down four cards never triggers one,
 * short enough that a pilot who stops to read a note gets their previews.
 * See noteInteraction.
 */
const REEL_QUIET_MS = 900;

const ROOM_PARENTS = new Set(['courses', 'freestyle', 'launch', 'quad', 'pilot']);

const SCREEN_TITLES = {
  title: 'FDFPV',
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
  title: ['FDFPV'],
};

/*
 * The freestyle world the pilot is SEATED in, or null when the seat is a
 * track. The Map row on the title reads this rather than the remembered id,
 * because a row on the front page has to name what Fly would launch, and
 * those two are not the same thing the moment somebody backs out of the
 * world picker without choosing.
 */
function seatedFreestyleMap(s) {
  const m = MAPS.find((x) => x.id === (s && s.map));
  return m && m.mode === 'freestyle' ? m : null;
}

/*
 * Whether there is a saved Flight controller dump FOR THIS AIRCRAFT. A dump
 * is the whole of one machine's configuration, a 6S 2207's or a 1S 0702's,
 * and offering the five inch's as "Your edits" on the whoop was handing a
 * 23 g machine a tune built for thirty times its mass. The dump is stamped
 * with the aircraft it was saved on (src/fc/dump.js); one saved before the
 * stamp existed is the five inch's, because that is all there was.
 */
function hasFcDump(airframe = AIRFRAME_IDS[0]) {
  try {
    if (!localStorage.getItem(FC_DUMP_KEY)) {
      return false;
    }
    const stamped = localStorage.getItem(FC_DUMP_AIRFRAME_KEY) || AIRFRAME_IDS[0];
    return stamped === airframe;
  } catch (e) {
    return false;
  }
}

/* The tune ids the row can offer right now. */
/*
 * The tunes on offer. Airframe aware since the whoop landed: a 6S 5 inch
 * race tune loaded onto a 1S whoop is not a different feel, it is an
 * oscillation, because the whoop's PIDs are a third of the five inch's for
 * the same reason its angular acceleration is three times higher.
 *
 * The argument is optional and defaults to the five inch, because this is
 * called from module scope in the settings allow list where there is no
 * `this` to read a setting off. loadSettings passes the stored airframe.
 */
function tuneChoices(airframe = AIRFRAME_IDS[0]) {
  return [...tunesFor(airframe).map((t) => t.id), ...(hasFcDump(airframe) ? [CUSTOM_TUNE.id] : [])];
}

/* Step through a list with wraparound. Every value row on every screen
 * moves through this, so a left arrow at the start of a list lands on its
 * end rather than doing nothing. */
function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

/*
 * Where the settings live.
 *
 * v3, and the bump IS the migration. v2 blobs could carry a whole captured
 * rateprofile and rate knobs off the offered lists, both written by the
 * flight-controller screen, and reading one back now would either be ignored
 * silently or step to the wrong end of a list. Rather than carry code to
 * repair a shape nothing can produce any more, the old blob is simply not
 * read. Everyone starts on the defaults once; a handful of testers is
 * exactly the moment to do that and never again.
 *
 * Nothing else is lost with it: the pilot name, course documents, stored
 * best laps and the stick mapping are all separate keys.
 *
 * src/boot.js SPELLS THIS STRING OUT rather than importing it, on purpose,
 * so that boot does not drag ui.js's module graph in ahead of the loading
 * screen. Change it there too. scripts/shots.js does import it.
 */
export const SETTINGS_KEY = 'webfpv.settings.v3';

export const FLIGHT_MODES = ['acro', 'angle'];
/* The lens, and the derivation behind it, live in src/render/lens.js. It is
 * re-exported here because the settings screen is where a pilot meets it. */
export {
  CAMERA_FOVS,
  CAMERA_FOV_DEFAULT,
  CAMERA_ANGLE_MIN,
  CAMERA_ANGLE_MAX,
  CAMERA_ANGLE_DEFAULT,
};
export const PACK_VOLTAGES = [4.2, 3.8, 3.5];
export const LAP_COUNTS = [1, 3, 5];
/* Render scale, percent of the preset's resolution, and the frame cap in
 * Hz, 0 meaning uncapped. Both from a board report about lower end
 * machines: fewer pixels is the one lever that always helps a starved
 * GPU, and a steady 30 or 60 reads better than a heaving 47. The input
 * poll and the physics never see either: the cap skips only the draw. */
export const RENDER_SCALES = [100, 85, 70, 55];
export const FPS_CAPS = [0, 90, 60, 30];
/* What the FPV camera view draws over the picture: 'osd' is the flight
 * controller's on screen display (src/ui/fpvhud.js), 'game' the game's own
 * readout. Chase and line of sight always draw the game's. */
export const HUD_STYLES = ['osd', 'game'];
/* Expert is the full model and the default; arcade switches the
 * imperfection terms off in the module via sim_set_flight_style. */
export const FLIGHT_STYLES = ['expert', 'arcade'];

/*
 * WEIGHT: the pilot's answer to "floaty", as a percentage of the weight the
 * airframe is flown at. 100 is normal, and normal is configs/airframes.js
 * gravityBase, 1.62 times 9.80665 on the five inch, which is what the shell
 * hands sim_set_gravity before a pilot touches anything.
 *
 * THIS IS THE THIRD SHAPE OF ONE SLIDER, and each step was a pilot's.
 * First it scaled drag, and the pilot said the difference was hardly
 * discernible. Then it scaled gravity from 70 to 180 percent of 1.0, and the
 * same pilot flew it to the stop and said full Sinky feels about right, then
 * asked for normal to sit at ninety percent of that with headroom either way.
 * So 0.9 times 1.80 is the base, the slider is 60 to 140 around it, and the
 * number a pilot reads is a weight rather than a gravity: "Weight 120" is
 * twenty percent heavier than the machine we ship, whatever the base is.
 *
 * Sinky is not planted. Planted is HORIZONTAL, how far the craft carries.
 * Sinky is VERTICAL, how fast it comes down and how little it hangs, and the
 * drag slider moved the vertical axis by single figures while moving the
 * fall time the wrong way. Gravity moves it fivefold; measured at the base:
 *
 *   weight 60    0.97 g   hover 26.0, fall 10 m 1.57 s, balloon 4.03 m
 *   weight 100   1.62 g   hover 35.0, fall 10 m 1.20 s, balloon 1.62 m
 *   weight 140   2.27 g   hover 42.7, fall 10 m 1.01 s, balloon 0.67 m
 *
 * The floaty end is within half a percent of the 1.0 machine every earlier
 * record was set on, which is deliberate: a pilot who liked the old feel can
 * have it back. The sinky end is heavier than anyone has yet asked for.
 *
 * What it costs, said plainly: scaling gravity is a heavier world rather
 * than a heavier quad. At the base the craft carries 1.62 times the thrust
 * at hover, so every tilt shoves it sideways that much harder, 5.5 to 8.8
 * m/s2 at the same 57 degree bank, where a real heavy quad accelerates at
 * g tan theta whatever it weighs. Rotation is untouched within 1.5 percent.
 * The pilot flew that and called it right; if a later report says it turns
 * too hard, the answer is mass, not this band.
 */
export const WEIGHT_MIN = 60;
export const WEIGHT_MAX = 140;
export const WEIGHT_STEP = 5;
export const WEIGHT_STOCK = 100;

export function clampWeight(v) {
  const n = Math.round(Number(v) / WEIGHT_STEP) * WEIGHT_STEP;
  if (!Number.isFinite(n)) {
    return WEIGHT_STOCK;
  }
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, n));
}

/*
 * The multiple of 9.80665 the module is asked for, from a slider value and
 * the airframe it is flown on. Rounded to three places so the same setting
 * always produces the same double, which is what the record key hashes.
 */
export function gravityScaleFor(weight, airframeId) {
  const base = airframeById(airframeId).gravityBase;
  return Math.round(base * (clampWeight(weight) / 100) * 1000) / 1000;
}
/*
 * WHAT A FREESTYLE FLIGHT IS. Three positions on one row, because they are
 * three answers to the same question and a pilot only ever wants one.
 *
 *   'off'     Nothing is SHOWN. No overlay, no trick names, no run clock
 *             and no board, and the clock slot carries the airtime
 *             instead. THE DEFAULT.
 *   'free'    The overlay is on, with no clock and no board. The run never
 *             ends and nothing is posted, but a trick is named when it
 *             lands.
 *   'scored'  The overlay is on, two minutes on the clock, and the total
 *             goes to the board.
 *
 * Off is a DISPLAY decision. The recogniser and the scorer go on running
 * underneath it, because they are the thing being developed and stopping
 * them would stop them being exercised. What off removes is a number on
 * the screen that the pilot has not asked to be judged by.
 *
 * See DEFAULTS.freestyleScoring for why off is the default.
 */
export const FREESTYLE_SCORING = ['off', 'free', 'scored'];
const FREESTYLE_SCORING_LABEL = { off: 'Off', free: str('ui.free_flight'), scored: str('ui.scored_run') };

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

function scoringNote(mode) {
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
function byLine(t) {
  if (t && t.designer) {
    return str('ui.by', { designer: t.designer });
  }
  return t && t.author ? str('ui.by_2', { author: t.author }) : '';
}

const DEFAULTS = {
  /* Which world. 'track' is Track mode's seat, a track built in the Alps
   * or the Swiss valley flown in the world it names, and any other id is a
   * freestyle world. It is a string so loadSettings' typeof gate accepts it,
   * and an unknown value falls back to the Track seat in
   * src/maps/registry.js rather than throwing, because a stale localStorage
   * entry must not be able to stop the page booting. */
  map: 'track',
  /*
   * The freestyle world the pilot last chose, or '' if they never have.
   *
   * It has a default because that is the only way a key survives a reload:
   * loadSettings copies stored keys by walking DEFAULTS, so this one was
   * written on every pick in the Freestyle room and dropped on the next
   * boot, and the row that names it went back to the first world in the
   * registry however many times the pilot flew another.
   *
   * Empty means never chosen, and that is a signal rather than an absence:
   * the gate sends a pilot with no world of their own to the picker instead
   * of seating one on their behalf.
   */
  freestyleMap: '',
  /* Which Betaflight diff the module is initialised from. A string for the
   * same reason map is: loadSettings only accepts a stored key whose typeof
   * matches the default, and an unknown id falls back to the first tune in
   * configs/registry.js rather than throwing. */
  tune: 'betaflight-default',
  /*
   * WHICH AIRCRAFT. A plant, not a tune: mass, inertia, motors, rotors,
   * pack, drag and ducts, selected in the compiled module by
   * sim_set_airframe. configs/airframes.js is the list.
   *
   * '5inch' is the blank profile's, the aircraft every other default here
   * (the tune, the rates, the camera) is written for, and an unknown id
   * falls back to it rather than throwing, same rule as map and tune,
   * because a stale localStorage entry must not stop the page booting. A
   * profile whose aircraft was never chosen is seated on FIRST_AIRFRAME
   * when it loads.
   */
  airframe: '5inch',
  /*
   * Whether the aircraft question has ever been ANSWERED, which is not the
   * same as whether it is asked. The gate offers all three ways in on every
   * visit, so the question is on screen every time; this flag is what makes
   * the seated aircraft a real answer rather than a default, and it is what
   * a link carrying ?craft= writes so that it can skip the gate. Unlike the
   * mode, which is what this session is for and is never remembered, the
   * aircraft is a PREFERENCE: the seated one is what the cursor opens on,
   * and the Quad screen carries the row for every later change.
   */
  airframeAsked: false,
  /*
   * Whether this profile has read Defend Itaipu's one screen and gone on
   * (docs/WARFARE-PLAN.md section 9): the war mode is the game's first
   * mature content, so a host is told what it is once before starting it.
   */
  warConsent: false,
  /*
   * The tune each aircraft was last flown on, by airframe id, so that
   * changing aircraft and changing back, which a swap in flight makes a
   * matter of seconds, lands on the tune the pilot had rather than the
   * stock one. Read and written by seatAirframe only; an entry that is no
   * longer on that aircraft's Tune row is ignored there.
   */
  tuneFor: {},
  /*
   * Each plane's paint, by configs/liveries.js liveryKey (a float plane
   * wears its land plane's): { scheme, regions }, a preset scheme and the
   * pilot's own colour per region over it. Empty is every plane in its
   * kit's colours. Written by the hangar (src/ui/hangar.js) and made safe
   * by normaliseLiveries on load.
   */
  livery: {},
  /*
   * Each plane's saved liveries, by the same key: a list of { name, entry }
   * the paint shop (src/ui/hangar-paint.js) writes as the pilot saves,
   * duplicates, deletes or imports one. Made safe by normaliseSaves.
   */
  liverySaves: {},
  /*
   * The whole rate profile, owned by the pilot rather than by the tune: a
   * rates type and three firmware fields per axis, plus Betaflight's
   * throttle limit, which lives in the same rate profile in the firmware and
   * so lives in the same object here. Betaflight 4.5.1's own defaults; see
   * configs/rates.js for the units and for why they live here.
   *
   * loadSettings REPLACES this rather than keeping it: the spread that
   * builds a settings object is shallow, so a stored profile has to be
   * normalised into a fresh object or a pilot editing their max rate would
   * be writing through into the frozen defaults above.
   */
  rates: RATE_DEFAULTS,
  /* Whether the rows edit pitch separately from roll. A menu shape rather
   * than a firmware field, which is why it is out here and not in the
   * profile: the firmware has always had three axes and this only decides
   * whether two of them are typed once or twice. */
  ratesSplitPitch: false,
  /*
   * The pilot's PID adjustment, KEYED BY TUNE ID, empty meaning every tune
   * flies its own numbers. Slider overrides and the expert table both live
   * here; configs/pids.js owns the shape, the clamps and the CLI it
   * becomes. Per tune rather than global on purpose: a single override
   * across tunes would make the Tune row meaningless. loadSettings
   * REPLACES this with a normalised fresh object, same as rates.
   */
  pids: {},
  /*
   * Which airframe PID seeds have already been laid down, by tune id. An
   * airframe may ship a starting PID adjustment for its default tune (see
   * defaultPids in configs/airframes.js), and a seed that is only ever
   * conditional on "the pilot has no entry" would come BACK the next time
   * the page loaded after they pressed Reset to stock on it. This is what
   * makes it a one shot: the seed lands once per tune, ever, and after that
   * the adjustment is the pilot's whether they kept it, moved it or threw
   * it away.
   */
  pidsSeeded: {},
  /*
   * Which generation of the whoop's SHIPPED DEFAULTS this profile has been
   * moved to. See SUPERSEDED_WHOOP: when a whoop default changes, a stored
   * copy of the old default has to move with it, and this marker is what
   * makes that move happen ONCE. Without it the move ran on every load, so
   * a pilot who put the superseded value back from the menu had it taken
   * away again at the next boot, which is the opposite of the "one row
   * away" the comment promised. 0 is a profile from before the marker; the
   * migration itself says what each generation moved.
   */
  whoopDefaults: 0,
  /* The same marker for the wing: 0 is a profile from before the wing had
   * a stabiliser, when Manual was its only tune and never a choice. */
  wingDefaults: 0,
  /*
   * Whether the flight feel question has been offered. It offers itself
   * exactly once, after the first finished race, and never again: the
   * moment the dialog opens this flips and is saved, whatever the pilot
   * does with it. The rows on Results and the pause menu are the way back
   * in; an automatic prompt that returns is how feedback dies.
   */
  feelAsked: false,
  /*
   * Whether the thumb-rates hand-off has happened. A fresh profile on a
   * touch device starts on TOUCH_RATE_DEFAULTS directly; an existing
   * profile still flying the stock defaults is switched ONCE, the first
   * time touch actually flies, by adoptTouchRates in src/main.js, with a
   * notice saying where to change them. A pilot with their own rates is
   * never touched, and this flag is what keeps all of it to one offer.
   */
  touchRatesOffered: false,
  /*
   * Betaflight ANGLE_MODE. 'acro' is the default and the radio default.
   *
   * Keyboard flight raises angle over this value ON A RACE TRACK, where
   * holding a line matters more than inverting and a key is a bang bang
   * input. It does NOT in freestyle, where angle holds the craft to about
   * thirty degrees of bank and puts the whole trick catalogue out of reach:
   * see wantAngleMode in src/main.js. This comment used to say "always",
   * which stopped being true when the town arrived.
   */
  flightMode: 'acro',
  /*
   * WHICH STICK CARRIES WHICH CHANNEL. Mode 2 is what this shell has always
   * been and what every record on the board was flown on. It reaches the
   * thumb sticks and the keyboard, which had no mode before this and could
   * not be flown by a Mode 1 pilot at all, and it names the sticks on every
   * screen that draws them. See src/input/stickmode.js.
   */
  stickMode: DEFAULT_STICK_MODE,
  /*
   * MOUSE FLIGHT: the wheel is the throttle and the mouse is the right
   * stick. Off by default, and a pilot who leaves it off meets nothing new
   * but the row. See the note above MOUSE_SENS in src/input/input.js for
   * what each of the other four does. Sensitivity and expo are percents so
   * the typeof gate below keeps them numbers.
   */
  mouseFlight: false,
  mouseSens: 100,
  mouseExpo: 0,
  mouseInvert: false,
  mouseCentre: 'auto',
  /*
   * FREESTYLE IS THREE DIFFERENT ACTIVITIES AND THEY WANT DIFFERENT RULES.
   * See FREESTYLE_SCORING above for what each value does.
   *
   * A scored run is two minutes with a board at the end of it, which is a
   * competition and is the right shape for one. Learning a Powerloop is
   * not: it is forty attempts, and a clock that keeps ending the session
   * turns practice into an interruption. 'free' takes the clock and the
   * board away and leaves the scoring on, so a pilot can still see whether
   * the thing they just flew counted.
   *
   * AND 'off' IS THE DEFAULT, WHICH IS THE POINT OF THIS FIELD. The trick
   * recogniser is not finished, and the whole of what this field does is
   * decide whether a pilot is shown its answers. It still misses shapes it should name and
   * still names some of them wrong, and a wrong name is worse than no name:
   * a pilot flying a Split-S and being paid for a Half Matty learns the
   * wrong thing about their own flying, and one that lands a clean orbit
   * and is told it was nothing concludes the orbit was bad. Freestyle's
   * job today is flight feel, so what a pilot gets without asking is a town
   * and a quad, and the scorer is a thing you switch on knowing what it is.
   *
   * The key is deliberately NOT the old 'freestyleRun'. Settings are saved
   * whole, so every returning pilot has that key holding the old default of
   * 'scored' whether or not they ever chose it, and reading it would mean
   * this default reached nobody who had ever opened the page. A new key has
   * no stored value for anyone, so the default applies once and the pilot's
   * own choice persists after that. It also ends a real ambiguity: Ui's own
   * `this.freestyleRun` is the last run's SUMMARY, not a mode.
   */
  freestyleScoring: 'off',
  /*
   * WHETHER THE ONE TIME SCORING RESET HAS RUN. See the block in
   * loadSettings that reads it, which is the whole of what it is for.
   */
  scoringReset: false,
  flightStyle: 'expert',
  /* Betaflight launch control. Off: ordinary takeoff. On: L on the start
   * line holds attitude at idle until you punch throttle. */
  launchControl: false,
  /*
   * The plant's crash physics (docs/CRASH-PLAN.md): a hit past a part's
   * limit breaks it. ON for play, because a flight that never hits that
   * hard is bit identical either way, so the setting only decides what a
   * real crash costs. The module's own default stays off, which is what
   * every harness replay and gate flies; this is the shell turning it on.
   * A run property like the flight model: it takes effect when a run
   * starts. It does not split the board: a lap that broke something is a
   * lap that did not finish.
   */
  crashDamage: true,
  /*
   * Who the ghost drone chases: 'off', 'best' (your best lap this session)
   * or 'previous' (the lap before this one). Best is the default because a
   * pacer you have to discover in a menu is a pacer nobody meets: the first
   * finished lap quietly becomes the rival on the second, which is the
   * whole loop. A board rival picked off the leaderboard is session state
   * in main.js, not stored here, because it belongs to one course and one
   * visit. Laps record regardless of this setting, so switching it on
   * mid-session has the session to race.
   */
  ghost: 'best',
  /* Live: see the other pilots on a board track as ghost craft, through
   * the board's live room. Off by default: a room is a socket. */
  live: 'off',
  cameraAngle: CAMERA_ANGLE_DEFAULT,
  cameraFov: CAMERA_FOV_DEFAULT,
  /* A fixed wing's view, cycled with C in flight: the FPV lens, a chase
   * camera behind the plane, or line of sight from a pilot at the strip.
   * A quad flies FPV only. */
  wingView: 'fpv',
  hudStyle: 'osd',
  /* The marks that point out the other pilots in a room when their
   * aircraft is small, hidden or off screen (src/ui/peermarks.js): 'on',
   * 'minimal' (the shapes without the names and ranges) or 'off'. */
  peerMarks: 'on',
  renderScale: 100,
  fpsCap: 0,
  packVoltage: 4.2,
  /* Each plane's power system and pack or tank, by airframe id:
   * { option, pack }, configs/power.js. A plane with no entry flies its
   * stock system on its stock pack. */
  power: {},
  /* What the pilot has earned and what it opens, and the Unlock all
   * switch (src/game/progress.js). Made safe by normaliseProgress on load;
   * a profile stored before progression existed starts with everything
   * open, so nobody loses a plane they already flew. */
  progress: {},
  /* Defend the Paraná: stars, credits, owned and equipped upgrades
   * (src/game/campaign.js). Made safe by cleanCampaign on load; synced
   * with the account like progress, merged by mergeCampaign. */
  campaign: {},
  /* Each plane's prop, add-ons and last crash's broken parts, by airframe
   * id: { prop, addons, damage }, configs/hangar-parts.js. A plane with no
   * entry flies as the kit, whole. */
  parts: {},
  /* Each plane's bench setup, by airframe id: the CG (battery and lead),
   * the rates, the expo, the trim and the flaps, configs/tuning.js, only
   * the fields the pilot moved off stock. Written by the hangar's Tuning
   * tab (src/ui/hangar-tuning.js); a plane with no entry flies its table. */
  tuning: {},
  /* The hangar's Floats toggle, by land plane id, true for on: a land plane
   * chosen with it on is seated as its float version
   * (configs/airframes.js floatVersionOf). Kept in step with the seat by
   * seatAirframe; only planes that have a float version have an entry. */
  floats: {},
  /*
   * How heavy the quad is, as a percentage of the weight the airframe is
   * flown at. See WEIGHT_STOCK above. 100 is the shipped machine and the
   * ONLY value that files a record on the public board, which is the same
   * rule the arcade style follows and for the same reason: a lap flown at a
   * different weight is a lap flown on a different aircraft.
   *
   * The key is `weight`. It replaced `gravity`, which was a percentage of
   * 1.0 and is not read: a stored 180 there meant 1.8 times g, which is
   * weight 111 here and not on the step, and carrying the number across
   * would file a pilot on a machine they never chose. `air` before that
   * scaled drag and is not read either.
   */
  weight: WEIGHT_STOCK,
  laps: 3,
  sound: true,
  volume: 6,
  /* Per stem, zero to ten, each dividing by 10 to reach the audio API. The
   * types matter: loadSettings only accepts a stored key whose typeof matches
   * the default, so a level has to stay a number and the focus tone a
   * boolean, or an old localStorage value silently wins. */
  /* 5, down from 6: the owner asked for the motors low, softened and
   * unobtrusive, and the default is where most players leave them. */
  motorLevel: 5,
  windLevel: 5,
  musicLevel: 5,
  /* Which record: 'rotation' starts on a random track each visit then
   * walks the crate, a track id pins one. A string so the typeof gate
   * accepts it, and an unknown id (including the old generated-bed ids)
   * falls back to rotation. */
  musicTrack: 'rotation',
  focusTone: false,
  /*
   * The radio between the sticks and the flight controller. 'perfect' is
   * the behaviour this shell has always had, an exact packet grid with no
   * delay, and it stays the default so a lap time never changes underneath
   * a pilot who did not ask for it. See src/input/link.js.
   */
  link: 'perfect',
  /* Record the flight for download as a blackbox CSV. Off by default: it
   * holds every frame of the run in memory. */
  flightLog: false,
  /* Named preset, not a bag of sliders. 'high' is the authored look and
   * the default on a first run that is not a Steam Deck; see
   * src/render/quality.js. A string so loadSettings' typeof gate accepts
   * it, and an unknown value falls back to high rather than throwing. */
  graphics: 'high',
  /* Whether the graphics value above was DETECTED or CHOSEN. Detection can
   * only guess from the user agent before a context exists, and the thing
   * worth knowing, whether this machine is rasterising on the CPU, is not
   * knowable until the session renderer is up. So boot is allowed to lower
   * a detected value once it can see the renderer, and is never allowed to
   * touch one the pilot picked. Picking any value in Settings clears this
   * for good, including picking the one detection would have chosen. */
  graphicsAuto: true,
};

/*
 * Has this browser been told what the gravity slider is?
 *
 * ITS OWN KEY, not a field in the settings blob, and the reason is
 * detectFirstRun below: that function reads the existence of a saved settings
 * blob as proof that somebody has been here before, so folding this flag into
 * settings would make dismissing a hint promote a brand new visitor to a
 * returning pilot and take the first-run title screen away from them.
 *
 * Nor is it one of the prefixes detectFirstRun scans for, deliberately: a
 * pilot who read a hint and left has still never flown here.
 *
 * v2 because v1's card explained a drag slider, which this control is no
 * longer. The few browsers that dismissed that card were told about a knob
 * that does not exist any more, so they get the new one once. That is what
 * the version in the key is for, and it is cheaper than being wrong quietly.
 */
const AIR_HINT_KEY = 'webfpv.airhint.v2';

function airHintSeen() {
  try {
    return localStorage.getItem(AIR_HINT_KEY) === '1';
  } catch (e) {
    /* Private mode cannot remember, so the hint is shown once per session
     * rather than never: a hint too often beats a control nobody can read. */
    return false;
  }
}

function markAirHintSeen() {
  try {
    localStorage.setItem(AIR_HINT_KEY, '1');
  } catch (e) {
    /* Private mode: dismissed for this session, which is all it can be. */
  }
}

/*
 * Has this browser ever flown here?
 *
 * The shell had this signal all along and threw it away: nothing on the
 * title told visit one from visit one hundred, so somebody who had never
 * held a stick got the same nine row list as somebody chasing a personal
 * best, with the thing they needed sitting seventh.
 *
 * TWO SIGNALS, BOTH HAVE TO BE COLD. A saved settings blob means somebody
 * changed something, and a stored best means somebody finished a lap. Either
 * one is enough to say this is not a first run, because getting one of them
 * wrong in the other direction would put the first-run screen in front of a
 * returning pilot, which is far worse than missing it once.
 */
function detectFirstRun() {
  try {
    if (localStorage.getItem(SETTINGS_KEY)) {
      return false;
    }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('webfpv.best') || key.startsWith('webfpv.trackbuilder')) {
        return false;
      }
    }
    return true;
  } catch (e) {
    /* Private mode cannot tell us, so assume a returning pilot. */
    return false;
  }
}

/* The whoop's id. See the migration in loadSettings. */
const WHOOP_ID = 'whoop65';
/*
 * THE WHOOP'S SHIPPED DEFAULTS THAT HAVE BEEN SUPERSEDED, and the value
 * each one used to hold.
 *
 * reseatIfForeign will not move any of these and should not: its rule is
 * "is this still the OTHER aircraft's stock value", which is what protects a
 * number the pilot actually chose, and none of these is the five inch's. So
 * that rule reads a superseded default as the pilot's own and keeps it, and
 * every pilot who flew the whoop before the change would sit on the old
 * value with no sign that a new one exists.
 *
 * Each entry moves ONCE, only from the exact figure that shipped, and only
 * on the whoop. Once is enforced by the whoopDefaults marker in DEFAULTS:
 * GENERATION is the number a profile carries after this table has been
 * applied to it, and the table is applied only to a profile carrying a
 * smaller one. A pilot who genuinely wants the old value has it on the menu
 * one row away, and it stays after they choose it.
 *
 * The history, because the same value has now shipped twice: the whoop
 * shipped on the stock whoop tune, a 65 percent cap and a 115 degree lens.
 * Generation 1 moved those to the Freestyle at a 150 master, 75 and 95.
 * Generation 2 moves the tune and the cap back, the lens stays at 95, and
 * the Freestyle's seeded master goes with the default it was seeded for.
 * A profile still on the generation 0 values is on today's tune and cap
 * already and only its lens moves.
 */
const SUPERSEDED_WHOOP = {
  GENERATION: 2,
  /* 75 percent, the generation 1 cap. Back to 65 with the stock tune. */
  throttleCap: 75,
  /* The Freestyle preset, the generation 1 tune. Back to the stock tune. */
  tune: 'whoop-freestyle',
  /* 115 degrees, chosen for a 5 by 6 m room. The room is 10 by 12 now. */
  cameraFov: 115,
  /*
   * The PID seed generation 1 laid on the Freestyle: master 150. Taken back
   * out only from a profile that RECEIVED it (pidsSeeded says so) and still
   * holds exactly it, so a pilot who moved that slider, or set the tune by
   * hand, keeps their own numbers.
   */
  pidsSeed: { tune: 'whoop-freestyle', sliders: { master: 150 } },
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (e) {
    stored = {};
  }
  const s = { ...DEFAULTS };
  const hadGraphics = typeof stored.graphics === 'string';
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof stored[k] === typeof DEFAULTS[k]) {
      s[k] = stored[k];
    }
  }
  if (s.flightMode !== 'angle') {
    s.flightMode = 'acro';
  }
  if (!['fpv', 'chase', 'los'].includes(s.wingView)) {
    s.wingView = 'fpv';
  }
  s.stickMode = normaliseStickMode(s.stickMode);
  /*
   * A setting the pilot picks off a LIST has to still be on that list.
   *
   * The typeof gate above is not enough on its own: it accepts any number at
   * all, so a hand edited local storage entry could set the field of view to
   * 5 and the projection would be a telescope with no way back except
   * clearing the site. It also silently keeps a value the list no longer
   * offers, which is how the field of view recalibration would have reached
   * nobody who had ever opened Settings: their stored 100 is not on the new
   * list and was chosen against a different camera model, so it goes back to
   * the default rather than being snapped to the nearest survivor.
   */
  /*
   * A RETIRED AIRFRAME IS RESEATED ON ITS SUCCESSOR (configs/airframes.js
   * retiredAirframe), before the check below would send it to the five
   * inch: a profile seated on the 1000 mm flying wing flies the Bramor that
   * replaced it, keeping the tune, since the three wing tunes moved with
   * it; one seated on a plane removed on 2026-09-29 flies the plane nearest
   * it, on that plane's own default tune, since the tune check below finds
   * the old tune gone. The old plane's paint, power, parts and tuning are
   * dropped by their own normalisers, which know only the planes there are.
   * No generation marker, unlike the migrations below: the old id can never
   * be stored again, so reseating it is the same answer on every load. A
   * Flight controller dump stamped with it goes with it.
   */
  s.airframe = currentAirframeId(s.airframe);
  try {
    const stamped = localStorage.getItem(FC_DUMP_AIRFRAME_KEY);
    if (retiredAirframe(stamped)) {
      localStorage.setItem(FC_DUMP_AIRFRAME_KEY, currentAirframeId(stamped));
    }
  } catch (e) {
    /* Storage refused: the dump stays unoffered, which is what it was. */
  }
  /*
   * The airframe is validated FIRST and on its own, because the tune list
   * below depends on it. A stored airframe the build no longer offers has to
   * become the five inch before the tune is checked, or a pilot on a removed
   * airframe would keep a tune no airframe can load.
   */
  if (!AIRFRAME_IDS.includes(s.airframe)) {
    s.airframe = DEFAULTS.airframe;
  }
  for (const [key, allowed] of [
    ['tune', tuneChoices(s.airframe)],
    ['link', Object.keys(LINK_PRESETS)],
    ['cameraFov', CAMERA_FOVS],
    ['renderScale', RENDER_SCALES],
    ['fpsCap', FPS_CAPS],
    ['hudStyle', HUD_STYLES],
    ['peerMarks', MARK_STYLES],
    ['flightStyle', FLIGHT_STYLES],
    ['laps', LAP_COUNTS],
    ['packVoltage', PACK_VOLTAGES],
    ['musicTrack', musicIds()],
    ['ghost', ['off', 'best', 'previous']],
    ['live', ['off', 'on']],
    ['freestyleScoring', FREESTYLE_SCORING],
    ['mouseSens', MOUSE_SENS],
    ['mouseExpo', MOUSE_EXPOS],
    ['mouseCentre', MOUSE_CENTRES],
  ]) {
    if (!allowed.includes(s[key])) {
      /* The tune's fallback is the AIRFRAME's default tune, not the blob's:
       * a whoop whose stored tune has gone must land on a whoop tune. */
      s[key] = key === 'tune' ? airframeById(s.airframe).defaultTune : DEFAULTS[key];
    }
  }
  /* Pack charge is per airframe too: 6S LiPo runs 4.20 to 3.50 and 1S LiHV
   * runs 4.35 to 3.60, and a stored 3.50 on a whoop is a cell nobody flies. */
  {
    const af = airframeById(s.airframe);
    if (!af.packVoltages.includes(s.packVoltage)) {
      s.packVoltage = af.packVoltages[0];
    }
  }
  /* Power choices name an option and a pack each plane still offers, or
   * are dropped back to stock (configs/power.js). */
  s.power = normalizePower(s.power);
  s.parts = normaliseParts(s.parts);
  s.floats = normaliseFloats(s.floats, s.airframe);
  /* And the tuning, against the limits that power choice gives: a glow
   * engine has no pack to slide. */
  s.tuning = normalizeTuning(s.tuning, (id) => setupFor(id, powerChoice(id, s.power)).limits);
  /* Angle is a range, not a list: a stored 40 from the old six-step menu
   * must survive, a stored 90 must not, and 45 has to be legal now. */
  s.cameraAngle = clampCameraAngle(s.cameraAngle);
  /* Weight is a range too, and the module REFUSES a gravity outside its own
   * band, so a hand edited blob has to be brought back before it reaches
   * sim_set_gravity. */
  s.weight = clampWeight(s.weight);
  s.livery = normaliseLiveries(s.livery);
  s.progress = normaliseProgress(stored.progress, { existing: Object.keys(stored).length > 0 });
  s.liverySaves = normaliseSaves(s.liverySaves);
  s.campaign = cleanCampaign(s.campaign);
  /*
   * The rate profile, from whichever shape this blob was written in.
   *
   * A save from before the rates screen learned the five Betaflight rate
   * systems carries five flat numbers instead: Max rate in deg/s, a yaw
   * copy of it, centre sensitivity, whole expo and the throttle cap. They
   * are read across rather than discarded, because a pilot who chose 900
   * deg/s and 20 expo asked for that and should not be quietly put back on
   * the Betaflight default by an upgrade. Everything else is clamped by
   * normaliseRates, which is also what makes a hand edited localStorage
   * blob unable to put an out of range number into a uint8 field.
   */
  const legacy = typeof stored.rates === 'object' && stored.rates ? null : ratesFromLegacy(stored);
  /* A profile that has never held rates in any shape, on a device with
   * thumbs, starts on the touch profile: the stock 670-no-expo default is
   * calibrated against a gimbal and is unflyable on glass. Only ever a
   * STARTING POINT for a blank profile; a stored rates object of any age
   * takes the ordinary path, and the flag records that the hand-off is
   * done so main.js never re-offers. */
  const neverHadRates = !legacy && !(stored.rates && typeof stored.rates === 'object');
  if (neverHadRates && touchWanted()) {
    s.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
    s.touchRatesOffered = true;
  } else {
    s.rates = normaliseRates(legacy || s.rates);
  }
  /*
   * THE WHOOP'S SHIPPED DEFAULTS MOVED, and a stored copy of the old ones
   * has to move with them. See SUPERSEDED_WHOOP for what and why, and the
   * whoopDefaults marker in DEFAULTS for why this runs once per profile
   * rather than on every load.
   */
  const migrate = !(s.whoopDefaults >= SUPERSEDED_WHOOP.GENERATION);
  if (migrate && s.airframe === WHOOP_ID) {
    const af = airframeById(WHOOP_ID);
    if (s.rates && s.rates.throttleCap === SUPERSEDED_WHOOP.throttleCap) {
      s.rates = { ...s.rates, throttleCap: af.rates.throttleCap };
    }
    if (s.tune === SUPERSEDED_WHOOP.tune) {
      s.tune = af.defaultTune;
    }
    if (s.cameraFov === SUPERSEDED_WHOOP.cameraFov) {
      s.cameraFov = af.cameraFov;
    }
  }
  /* The PID adjustment, clamped onto what the firmware and the menu will
   * take. An unknown tune id, an out-of-range slider or a half-complete
   * expert table cannot survive a localStorage edit into the emitter. */
  s.pids = normalisePids(s.pids);
  /*
   * The seeded slider goes with the default it was seeded for, whatever
   * aircraft is seated, because it is keyed by tune and not by seat: a
   * five inch pilot who once flew the whoop carries it too. Only an entry
   * this shell laid down itself and that has not been touched since.
   */
  if (migrate) {
    const seed = SUPERSEDED_WHOOP.pidsSeed;
    const e = s.pids[seed.tune];
    const seeded = s.pidsSeeded && typeof s.pidsSeeded === 'object' && s.pidsSeeded[seed.tune];
    const untouched = e && e.mode === 'sliders' && !e.pids
      && Object.keys(e.sliders).length === Object.keys(seed.sliders).length
      && Object.keys(seed.sliders).every((k) => e.sliders[k] === seed.sliders[k]);
    if (seeded && untouched) {
      const rest = { ...s.pids };
      delete rest[seed.tune];
      s.pids = rest;
    }
  }
  s.whoopDefaults = SUPERSEDED_WHOOP.GENERATION;
  /*
   * THE WING GREW A STABILISER and became Stabilised by default. A profile
   * that seated the wing before then holds Manual, which was the only row
   * and so was never chosen; it moves to the new default once, and a pilot
   * who then picks Manual keeps it, the same rule as the whoop's.
   */
  if (!(s.wingDefaults >= 1)) {
    if (s.airframe === 'bramor2300' && s.tune === 'wing-manual') {
      s.tune = airframeById('bramor2300').defaultTune;
    }
    s.wingDefaults = 1;
  }
  /*
   * AND THEN ACRO BECAME EVERY FIXED WING'S DEFAULT, at the pilot's word:
   * sticks that ask for a rate and hold the attitude, with no levelling.
   * A profile still on Stabilised only because it was the default moves
   * once; a Stabilised picked after this is kept, the rule above.
   */
  if (!(s.wingDefaults >= 2)) {
    const stock = { bramor2300: 'wing-stab', sky1800: 'sky-stab' }[s.airframe];
    if (stock && s.tune === stock) {
      s.tune = airframeById(s.airframe).defaultTune;
    }
    s.wingDefaults = 2;
  }
  /*
   * The seated aircraft's starting PID adjustment, after normalisePids so it
   * is not stripped as an unknown entry, and after the tune is final so it
   * lands on the tune it was chosen against. One shot: see seedAirframePids.
   */
  seedAirframePids(s, s.airframe);
  /*
   * A RETIRED WORLD MOVES TO THE ONE THAT REPLACED IT, in both slots. The
   * freestyle town and the airfield went on 2026-09-28, and a pilot whose
   * seat was one of them was freestyling: dropping them into the Track seat
   * by the unknown id rule below would change what they fly, not only
   * where. src/maps/retired.js says where each went.
   */
  if (retiredMap(s.map)) {
    s.map = retiredMap(s.map).to;
  }
  if (retiredMap(s.freestyleMap)) {
    s.freestyleMap = retiredMap(s.freestyleMap).to;
  }
  /* The race field and its track world are gone. A stored 'field' or
   * 'custom', a whoop's RaceGOW room among them, or an id no map has, is the
   * Track seat: My tracks, and the Swiss valley behind it until a track is
   * chosen. */
  if (!MAPS.some((m) => m.id === s.map)) {
    s.map = 'track';
  }
  /* The remembered freestyle world, by the same rule: a stale id, or a
   * track id sitting in the freestyle slot, means nothing was chosen. */
  if (!MAPS.some((m) => m.id === s.freestyleMap && m.mode === 'freestyle')) {
    s.freestyleMap = '';
  }
  /*
   * ANYTHING STILL BELONGING TO THE OTHER AIRCRAFT.
   *
   * The seated airframe can be moved from outside this file: the track
   * builder's class toggle writes it, and so does a link. Those writers know
   * which aircraft is wanted and deliberately do not know its tune, its pack,
   * its rates or its camera, because knowing would mean the builder pulling
   * the whole shell in to draw a two button toggle.
   *
   * So the reconciliation is here, on the way in, and it is the SAME rule
   * seatAirframe applies: a setting still holding the other aircraft's stock
   * value is moved, and a setting the pilot has changed is left alone. A
   * whoop on 85 degrees at 30 degrees of tilt with a 6S tune was the state
   * the first version of the shots harness produced, and it is a state a
   * pilot could reach too.
   */
  reseatIfForeign(s);
  /* A profile whose pitch differs from its roll has to show three axes,
   * whatever the stored menu shape says, or the rows would be editing a
   * pitch the pilot cannot see. */
  if (!pitchMatchesRoll(s.rates)) {
    s.ratesSplitPitch = true;
  }
  /*
   * THE ONE TIME SCORING RESET, and it is here because of a bug rather than
   * because of a change of mind.
   *
   * The radio's roll stick used to adjust the row under the cursor on a card
   * screen, which the keyboard's own arrows deliberately do not do. With one
   * freestyle world the Freestyle room draws no cards, so Scoring is its
   * first row and the cursor opens on it, and cycle() wraps: one nudge of
   * roll left, the gesture that means BACK on every other row in the
   * product, took the default 'off' the long way round to 'scored' and
   * saved it. See padMenu, where that is fixed.
   *
   * Nothing in the blob can tell that write apart from a deliberate one, so
   * a pilot carrying 'free' or 'scored' today may never have asked for it,
   * and the argument at DEFAULTS.freestyleScoring reached none of them. The
   * value goes back to the default ONCE.
   *
   * It moves once and it is not a policy: the flag rides in the same blob,
   * so the first save after this load records that it has run, and a pilot
   * who switches scoring back on the same minute keeps it forever after. A
   * pilot who saves nothing at all is a pilot whose value is already the
   * default, so re-running costs them nothing either.
   */
  if (!s.scoringReset) {
    s.freestyleScoring = DEFAULTS.freestyleScoring;
    s.scoringReset = true;
  }
  /* First run, or an older save from before this key existed: pick Low
   * on a Deck so the page is flyable, High everywhere else so the
   * authored look is what a new desktop player sees. A stored choice,
   * even a stale one, wins over detection. */
  if (!hadGraphics) {
    s.graphics = detectDefaultGraphics();
  } else {
    s.graphics = normalizeGraphics(s.graphics);
  }
  /* Seated through seatAirframe, so the tune, the pack, the rates and the
   * camera come with it. Once seated it is the stored aircraft, so this
   * runs once per profile. */
  if (!s.airframeAsked && s.airframe !== FIRST_AIRFRAME) {
    seatAirframe(s, FIRST_AIRFRAME);
  }
  return s;
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    /* private mode: settings simply do not persist */
  }
}

/*
 * Move the settings blob onto an airframe: the things that BELONG TO THE
 * MACHINE and cannot survive a change of it.
 *
 * The rule this follows is the one the Quad screen's own comment states: a
 * setting lives with the machine if it stops meaning anything when the
 * machine changes. Four do.
 *
 *   tune         a Betaflight diff for a 1S 23 gram quad on a 710 gram 6S
 *                one is not a different feel, it is an oscillation.
 *   rates        the maker ships 580 deg/s on a racing whoop against
 *                Betaflight's 670 for a 5 inch, and a track three metres
 *                wide is why.
 *   packVoltage  6S LiPo is 4.20 to 3.50 and 1S LiHV is 4.35 to 3.60. A
 *                stored 3.50 on a whoop is a cell nobody flies.
 *   camera       fov and tilt, which ui.js already keeps in Quad rather
 *                than Pilot precisely because they are bolted to the
 *                airframe.
 *
 * Rates are the one that could be argued the other way, and configs/rates.js
 * says outright that rates are the PILOT'S. They still are: this reseeds
 * them only when they are still the previous airframe's stock profile, so a
 * pilot who has set their own rates keeps them across a change and one who
 * has not gets the new machine's factory numbers instead of the old one's.
 */
/*
 * Move any setting that still belongs to the OTHER aircraft, and leave every
 * setting the pilot has actually chosen.
 *
 * The test for "not chosen" is the same one seatAirframe uses for rates:
 * does it still hold the other machine's stock value. A pilot who set 100
 * degrees of lens on a five inch keeps it on a whoop, because 100 is neither
 * aircraft's default and is therefore theirs. A pilot who never touched it
 * gets the whoop's 115.
 */
function reseatIfForeign(s) {
  const a = airframeById(s.airframe);
  /* Any of the others, not the first one that is not this: with three
   * aircraft, a setting still wearing the wing's stock value is foreign on
   * the five inch whether or not it happens to match the whoop's too. */
  const others = AIRFRAMES.filter((x) => x.id !== a.id);
  if (!tuneChoices(a.id).includes(s.tune)) {
    s.tune = a.defaultTune;
  }
  if (!a.packVoltages.includes(s.packVoltage)) {
    s.packVoltage = a.packVoltages[0];
  }
  if (others.some((o) => ratesMatch(s.rates, o.rates))) {
    s.rates = normaliseRates({ ...s.rates, ...structuredCloneRates(a.rates) });
  }
  if (s.rates && others.some((o) => s.rates.throttleCap === o.rates.throttleCap)) {
    s.rates = normaliseRates({ ...s.rates, throttleCap: a.rates.throttleCap });
  }
  if (others.some((o) => s.cameraFov === o.cameraFov)) {
    s.cameraFov = a.cameraFov;
  }
  if (others.some((o) => s.cameraAngle === clampCameraAngle(o.cameraAngle))) {
    s.cameraAngle = clampCameraAngle(a.cameraAngle);
  }
  return s;
}

/* Exported for scripts/shots.js, which has to seed the answer a pilot gives
 * on the choice screen. A seed that wrote only the airframe would leave the
 * rates and the camera belonging to the other aircraft, and every capture
 * past that point would be a photograph of a state the shell never puts a
 * pilot in. One function, so the seed cannot drift from the answer. */
/*
 * THE AIRCRAFT A PILOT WHO HAS NOT CHOSEN ONE FLIES, in every mode: a
 * fresh visitor, or a profile that never answered the front page. The
 * Timber, chosen 2026-09-27: it takes off in two metres with full flap and
 * races every track built of wide gates. A pilot
 * who has chosen keeps their choice; airframeAsked is what says they did.
 * The title's attract flight is the Skyhunter's regardless (dressCraft in
 * main.js).
 */
export const FIRST_AIRFRAME = 'timber1500';

/*
 * The Floats toggles as loadSettings keeps them: true or false for a land
 * plane that has a float version, nothing else. A profile seated on a
 * float version, as every one that chose the float card before the toggle
 * existed is, has that plane's toggle on.
 */
export function normaliseFloats(stored, airframe) {
  const out = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [id, on] of Object.entries(stored)) {
      if (floatVersionOf(id) && typeof on === 'boolean') {
        out[id] = on;
      }
    }
  }
  if (isFloatVersion(airframe)) {
    out[landPlaneOf(airframe)] = true;
  }
  return out;
}

/* The airframe a picked card seats: the land plane, or its float version
 * when that plane's Floats toggle is on. */
export function withFloats(s, id) {
  const f = floatVersionOf(id);
  return f && s.floats && s.floats[id] ? f : id;
}

export function seatAirframe(s, id) {
  const from = airframeById(s.airframe);
  const to = airframeById(id);
  /*
   * ONE PLANE, ON ITS WHEELS OR ITS FLOATS. Between a land plane and its
   * float version the Floats toggle follows the seat, and the pilot's
   * power, prop and bench setup go across where the other one takes them
   * (paint is already shared, by liveryKey, and the tune by tunesOf). The
   * normalisers are the judges of "takes them", so nothing the other
   * cannot fly is carried.
   */
  if (floatVersionOf(to.id) || isFloatVersion(to.id)) {
    s.floats = { ...(s.floats && typeof s.floats === 'object' ? s.floats : {}), [landPlaneOf(to.id)]: isFloatVersion(to.id) };
  }
  if (from.id !== to.id && landPlaneOf(from.id) === landPlaneOf(to.id)) {
    const carry = (o) => (o && Object.hasOwn(o, from.id) ? { ...o, [to.id]: o[from.id] } : o);
    s.power = normalizePower(carry(s.power));
    /* Not the damage: its parts are indices into the part table it was
     * recorded on, and a float version's is another table (the Timber has
     * 19 parts, on floats 18), so a part broken on one could be past the
     * end of the other's, and the record faulted every frame after
     * (main.js recordBroken). The one it goes to keeps its own. */
    const fromPart = s.parts && s.parts[from.id];
    const own = s.parts && s.parts[to.id];
    const part = fromPart && normalisePlane(to.id, { ...fromPart, damage: own ? own.damage : null });
    if (part) {
      s.parts = { ...s.parts, [to.id]: part };
    }
    s.tuning = normalizeTuning(carry(s.tuning), (x) => setupFor(x, powerChoice(x, s.power)).limits);
  }
  /* The tune goes with the aircraft it was flown on and comes back with it.
   * A fresh object every time: the stored one may be DEFAULTS' own. */
  const tuneFor = { ...(s.tuneFor && typeof s.tuneFor === 'object' ? s.tuneFor : {}), [from.id]: s.tune };
  s.tuneFor = tuneFor;
  s.airframe = to.id;
  if (tuneChoices(to.id).includes(tuneFor[to.id])) {
    s.tune = tuneFor[to.id];
  } else if (!tuneChoices(to.id).includes(s.tune)) {
    s.tune = to.defaultTune;
  }
  if (!to.packVoltages.includes(s.packVoltage)) {
    s.packVoltage = to.packVoltages[0];
  }
  if (ratesMatch(s.rates, from.rates)) {
    s.rates = normaliseRates({ ...s.rates, ...structuredCloneRates(to.rates) });
  }
  /*
   * The throttle limit moves on its own test, not with the rates, because it
   * is not part of a rate profile: configs/rates.js keeps it outside the
   * system on purpose so it survives a type change. It is the aircraft's
   * though, and a whoop wants 65 where a five inch wants the whole stick, so
   * it follows the same "still the other machine's" rule the camera does. A
   * pilot who set 80 keeps 80.
   */
  if (s.rates && s.rates.throttleCap === from.rates.throttleCap) {
    s.rates = { ...s.rates, throttleCap: to.rates.throttleCap };
  }
  s.cameraFov = to.cameraFov;
  s.cameraAngle = clampCameraAngle(to.cameraAngle);
  /* And the aircraft's starting PID adjustment, if it ships one and this
   * profile has never been offered it. The tune moved to the new aircraft's
   * default a few lines up, which is the tune the seed is keyed to. */
  seedAirframePids(s, to.id);
  return s;
}

/* A rate profile object from an airframe row, deep enough that normaliseRates
 * cannot write through into the registry's own literal. */
/*
 * Lay down an airframe's starting PID adjustment for its default tune, once.
 *
 * No airframe ships one today. The whoop did, for a while: the maker's
 * Freestyle preset with the master slider at 150 percent, the owner's
 * setting flown, until the owner flew the machine hard and asked for the
 * the stock tune instead; SUPERSEDED_WHOOP takes that seed back out. The
 * mechanism stays for the next airframe that wants one. It is a SEED and
 * not a setting, so it lands on a profile that has never had an adjustment
 * for that tune and never lands twice; see pidsSeeded above for why once
 * matters.
 *
 * Keyed to the airframe's DEFAULT TUNE rather than to the airframe, because
 * that is what such a number is chosen against. A master chosen for one
 * preset on top of another preset's own master is a figure nobody picked.
 */
function seedAirframePids(s, id) {
  const af = airframeById(id);
  const tune = af.defaultTune;
  if (!af.defaultPids || !tune) {
    return s;
  }
  if (!s.pids || typeof s.pids !== 'object') {
    s.pids = {};
  }
  if (!s.pidsSeeded || typeof s.pidsSeeded !== 'object') {
    s.pidsSeeded = {};
  }
  if (s.pidsSeeded[tune]) {
    return s;
  }
  /* Marked either way. A pilot who has already adjusted this tune owns it,
   * and the seed must not arrive later if they reset it. */
  s.pidsSeeded = { ...s.pidsSeeded, [tune]: true };
  if (!s.pids[tune]) {
    s.pids = { ...s.pids, [tune]: { sliders: { ...af.defaultPids } } };
  }
  return s;
}

function structuredCloneRates(r) {
  return {
    type: r.type,
    roll: { ...r.roll },
    pitch: { ...r.pitch },
    yaw: { ...r.yaw },
  };
}

/* Is this profile still the airframe's stock one? Type and the three axes;
 * the throttle cap and curve are the pilot's on any airframe and are not
 * compared. */
function ratesMatch(have, want) {
  if (!have || have.type !== want.type) {
    return false;
  }
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const a = have[axis];
    const b = want[axis];
    if (!a || a.rcRate !== b.rcRate || a.srate !== b.srate || a.expo !== b.expo) {
      return false;
    }
  }
  return true;
}

/*
 * m:ss, for the freestyle run clock. Whole seconds, rounded UP so the
 * readout reaches 0:00 exactly when the run ends rather than sitting on it
 * for a second first, and no hundredths: this is written every frame and a
 * hundredths readout is sixty style invalidations a second for a number
 * nobody reads at that resolution, and it jitters under the eye.
 *
 * Not formatTime, which is the LAP clock's shape and prints hundredths
 * because a lap is won and lost in them. A run is not.
 */
export function formatRunClock(ms) {
  /* An untimed run reports Infinity, which is not a clock. Nothing in the
   * shell builds one, only the self-test does, but a readout that can print
   * "Infinity:NaN" is one refactor away from being seen. */
  if (!Number.isFinite(ms)) {
    return '--:--';
  }
  const left = Math.ceil((ms > 0 ? ms : 0) / 1000);
  const m = Math.floor(left / 60);
  const sec = left - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '--.--';
  }
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return s.toFixed(2);
}

function formatDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '';
  }
  const core = formatTime(Math.abs(ms));
  if (ms < 0) {
    return `-${core}`;
  }
  if (ms > 0) {
    return `+${core}`;
  }
  return core;
}

function makeGimbal(caption) {
  const box = el('div', 'osd-gimbal');
  const plate = el('div', 'osd-gimbal-plate');
  plate.append(el('div', 'osd-cross-x'), el('div', 'osd-cross-y'));
  const nub = el('div', 'osd-nub');
  plate.append(nub);
  /* The caption is kept because it is not a constant any more: it names the
   * channels this pilot's stick mode put on this plate. See setStickMode. */
  const cap = el('div', 'osd-gimbal-cap', caption);
  box.append(plate, cap);
  return { box, nub, cap };
}

/*
 * THE GRAVITY SLIDER, drawn. Built here rather than inline in build() because
 * it is four elements and a hint card, and build() is already the longest
 * thing in this file.
 *
 * THE CLASS NAMES STILL SAY AIR AND THEY STAY THAT WAY. This control scaled
 * the drag set for one afternoon before the pilot flew it and named the axis
 * they actually meant, and renaming .osd-air to .osd-grav is exactly the move
 * the .corner-chip note further down this file was written in blood about:
 * fdfpv.example serves index.html at max-age=0 and this script at max-age=14400,
 * so for four hours a returning browser pairs the NEW stylesheet with the OLD
 * script. Renamed classes leave that script writing elements no rule matches,
 * which drops an unstyled slider and an unpositioned hint card into the
 * middle of a race. A class name is the contract across that seam. The label
 * a pilot reads is not, so that is what changed.
 *
 * The control is a native input[type=range] wearing .row-range, exactly the
 * one the Rates and PIDs screens use, so drag, touch, and arrow keys on a
 * focused track are the browser's problem in all three places. What differs
 * from those screens is WHEN it commits: there it is on release, because each
 * one re-inits the module and a re-init per drag pixel would stutter. This
 * one calls sim_set_gravity, which is a single store into the plant, so it
 * commits live on 'input' and the pilot feels the weight arrive under the
 * craft mid drag. That is the entire point of putting it here.
 */
function makeWeightSlider({ min, max, step, value, label }) {
  const box = el('div', 'osd-air is-off');

  const hint = el('div', 'osd-air-hint');
  hint.hidden = true;
  hint.append(el('p', 'osd-air-hint-title', str('ui.weight')));
  hint.append(el(
    'p',
    'osd-air-hint-body',
    str('ui.drag_this_if_the_quad_feels')
    + str('ui.so_it_drops_when_you_chop')
    + str('ui.of_a_jump_left_makes_it')
    + str('ui.down_the_stick_with_it_which'),
  ));
  const dismiss = btn('osd-air-hint-btn', str('ui.got_it'));
  hint.append(dismiss);

  const row = el('div', 'osd-air-row');
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'row-range osd-air-range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.setAttribute('aria-label', label);
  row.append(el('span', 'osd-air-end', str('ui.floaty')), range, el('span', 'osd-air-end', str('ui.sinky')));

  const cap = el('div', 'osd-air-cap', '');
  box.append(hint, row, cap);
  return { box, range, cap, hint, dismiss };
}

function makePadCard() {
  const card = el('div', 'pad-card');
  const title = el('div', 'pad-card-title', '');
  const art = el('div', 'pad-card-art');
  const left = makeGimbal('');
  const right = makeGimbal('');
  art.append(left.box, right.box);
  const name = el('div', 'pad-card-name', '');
  const status = el('div', 'pad-card-status', '');
  card.append(title, art, name, status);
  return { card, title, name, status, left, right };
}

function placeNub(nub, x, y) {
  nub.style.left = `${50 + x * 50}%`;
  nub.style.top = `${50 - y * 50}%`;
}

/*
 * Both gimbal plates from a channel set. The clamp, the throttle rescale
 * from 0..1 to -1..1 and the pitch negate were written out twice, in the
 * flight overlay and in the calibration screen, which is two places to get
 * the pitch sign wrong in.
 */
/*
 * The two sentences the touch page carried on FIXED THUMBS: the collective
 * stays where it is left, the springy one comes back. They follow the
 * throttle now rather than the side, because in Mode 1 the throttle is the
 * right thumb and the old text told that pilot the opposite.
 */
function thrNote(mode, side) {
  const map = stickChannels(mode)[side];
  return map.vert === 'throttle'
    ? str('ui.throttle_stays_where_you_leave_it')
    : str('ui.forward_is_nose_down_fly_forward');
}

/*
 * What each key pair does, named for the channel this mode put on it. The
 * four rows used to be constants, which is what a Mode 1 pilot on a keyboard
 * was reading when the arrows turned out to be throttle.
 */
function keyHowtoRows(mode) {
  const c = stickChannels(mode);
  const say = {
    throttle: str('ui.throttle_tap_for_a_nudge_hold'),
    pitch: str('ui.pitch_forward_is_stick_forward_nose'),
    yaw: str('ui.yaw_left_and_right_on_the'),
    roll: 'Roll.',
  };
  return [
    [str('ui.w_and_s'), say[c.left.vert]],
    [str('ui.a_and_d'), say[c.left.horiz]],
    [str('ui.up_and_down'), say[c.right.vert]],
    [str('ui.left_and_right'), say[c.right.horiz]],
  ];
}

function placeSticks(left, right, ch, mode = DEFAULT_STICK_MODE) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const layout = stickChannels(mode);
  for (const side of ['left', 'right']) {
    const map = layout[side];
    const stick = side === 'left' ? left : right;
    const vert = map.vert === 'throttle' ? ch.throttle * 2 - 1 : -ch.pitch;
    placeNub(stick.nub, clamp(ch[map.horiz]), clamp(vert));
  }
}

/* The Pilot screen's rows for a signed in pilot (src/ui/accountui.js
 * handles their actions). */
function accountRows(account) {
  return [
    {
      label: str('account.callsign'),
      value: account.callsign || str('account.callsign_none'),
      action: 'accountcallsign',
      note: str('account.callsign_note'),
    },
    {
      label: str('account.sign_out'),
      value: str('account.sign_out_value'),
      action: 'accountsignout',
      note: str('account.sign_out_note'),
    },
    { label: str('account.delete'), action: 'accountdelete', note: str('account.delete_note') },
  ];
}

/* Signed in or not: what signing in stores, and the terms, one row each. */
function accountPageRows() {
  return [
    { label: str('account.privacy'), action: 'accountprivacy', note: str('account.privacy_note') },
    { label: str('account.terms'), action: 'accountterms', note: str('account.terms_note') },
  ];
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function btn(cls, text) {
  const n = el('button', cls, text);
  n.type = 'button';
  return n;
}

function hintWithKeys(keys, text) {
  const n = el('div', 'hint');
  const ks = el('span', 'hint-keys');
  for (const k of keys) {
    ks.append(el('kbd', null, k));
  }
  n.append(ks, el('span', 'hint-copy', text));
  return n;
}

function wordmark() {
  const h = el('h1', 'wordmark');
  h.append(document.createTextNode('FD'), el('span', 'fpv', 'FPV'));
  return h;
}

/*
 * First-time thumbnail wait. Recording a clip takes several seconds
 * (a valley, longer). A blank card looks like a stall. Same copy as the
 * boot screen: "loading" and a joke. Cached visits never see it.
 */

/* A menu plus a side column for its note, so the note cannot resize the rows. */

/*
 * THE LIST IS THE CATALOGUE'S, NOT A WRITTEN ONE.
 *
 * One row per PATTERN the recogniser matches, so nothing can be advertised
 * that the game will not score and nothing scoreable can be left out. The
 * building blocks (a bare quarter roll and its family) are deliberately
 * skipped: they are what a trick is MADE of and the workbook prices them as
 * consolation rather than as things to go and fly, and a list opening with
 * eleven fragments buries the tricks underneath them.
 */
const BLOCK_NAME = /^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/;

function scoreableTricks() {
  const seen = new Set();
  const out = [];
  for (const pat of PATTERNS) {
    if (seen.has(pat.name) || BLOCK_NAME.test(pat.name)) {
      continue;
    }
    const t = trickByName(pat.name);
    if (!t || t.points == null) {
      continue;
    }
    /*
     * ONLY WHAT IS KNOWN TO SCORE.
     *
     * The list showed all sixty four patterns that carry a name and a price,
     * which promises a pilot sixty four tricks the town will pay for. It
     * will not. Some of them the recogniser has never once named, and a
     * trick you cannot land is worse than one that is missing: the pilot
     * flies it, gets nothing, and concludes the scoring is broken rather
     * than that the trick was never really there.
     *
     * So the gate is evidence. src/game/proven.js is written by the sweep,
     * which flies every pattern from its own steps and records what came
     * back, and a trick earns its place here by having been scored at least
     * once. That also means the list REPAIRS ITSELF: teach the rig to fly a
     * wall and the wall tricks reappear on the next generation, with no
     * hand maintained list to fall out of date.
     *
     * The cost is that a trick the rig cannot fly is hidden even though a
     * pilot may well be able to score it, which is the right way round. A
     * missing trick is a pleasant surprise when it scores. A listed one
     * that never pays is a broken promise.
     */
    const ev = PROVEN[pat.name];
    if (!ev || ev.landed <= 0) {
      continue;
    }
    seen.add(pat.name);
    out.push({
      name: pat.name,
      points: t.points,
      category: t.category || str('bugs.other'),
      difficulty: t.difficulty || '',
      steps: pat.steps,
      /* How reliably the sweep landed it. See trickStatus. */
      proven: ev,
    });
  }
  /* Grouped the way the workbook groups them, and cheapest first inside a
   * group, so the list reads as a ladder rather than as an index. */
  out.sort((a, b) => (a.category === b.category
    ? a.points - b.points
    : a.category.localeCompare(b.category)));
  return out;
}

/*
 * How reliably it scores, in a sentence, for a trick that is already known
 * to score at all: scoreableTricks does not list one that is not.
 *
 * The distinction still earns its place because "scores every time" and
 * "scores when it is flown cleanly" are different promises, and a pilot who
 * has just missed one twice deserves to know which they were sold.
 */
function trickStatus(t) {
  if (t.proven.landed >= t.proven.runs) {
    return {
      tag: str('ui.reliable'),
      line: str('ui.scored_on_all_test_flights_across', { runs: t.proven.runs })
        + str('ui.angles_and_three_degrees_of_overshoot'),
    };
  }
  return {
    tag: str('ui.fussy'),
    line: str('ui.scored_on_of_test_flights_so', { landed: t.proven.landed, runs: t.proven.runs })
      + str('ui.it_wants_flying_cleanly_to_register'),
  };
}

/* The number the Trick list rows carried as their value. Nothing calls it
 * while those rows are withdrawn; it is two lines and it comes back with
 * them, so it stays rather than being rewritten later from memory. */
function countScoreableTricks() {
  return scoreableTricks().length;
}

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
function seatIsRace(s) {
  const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
  if (m.mode === 'freestyle') {
    return false;
  }
  const seat = activeCourseSummary();
  return Boolean(seat && seat.gates > 0);
}

/*
 * THE RECORD KEY, IN ENGLISH.
 *
 * main.js builds a personal-best key by hashing the config text with the
 * pack voltage and the flight style, and latches the lap count at run start.
 * So a best time is not filed under a track: it is filed under a track AND a
 * tune AND a pack AND a physics model AND a lap count, and change any one of
 * them and you are on a different board. Nothing ever said that out loud, so
 * a pilot who nudged pack charge lost their record without being told why.
 *
 * This is that key, written as the sentence a pilot would say. It goes in the
 * help column under the Fly button, which is the last thing read before a
 * run and the only place it can still change anything.
 */
function recordSentence(s, trackName) {
  const style = s.flightStyle === 'arcade' ? str('ui.arcade') : str('ui.expert');
  const link = s.link === 'perfect' ? str('ui.a_perfect_link') : LINK_PRESETS[s.link].label;
  const bits = [
    `${style} physics`,
    str('ui.v_per_cell', { v1: s.packVoltage.toFixed(2) }),
    `${s.laps} lap${s.laps === 1 ? '' : 's'}`,
    str('ui.the_tune', { name: tuneById(s.tune).name }),
  ];
  /* clampWeight rather than s.weight raw, the same guard bugSnapshot uses:
   * every settings object that reaches here has been through loadSettings,
   * and a sentence that can print "weight at undefined percent" if one ever
   * does not is a sentence waiting to embarrass itself in front of a pilot. */
  const weight = clampWeight(s.weight);
  if (weight !== WEIGHT_STOCK) {
    /* Second in the list, right behind the physics model, because it IS the
     * physics model: the slider on the flight screen scales the weight the
     * craft carries. A pilot who nudged it mid flight and forgot has exactly
     * the problem this sentence exists to prevent. */
    bits.splice(1, 0, str('ui.weight_at_percent', { weight }));
  }
  return str('ui.your_best_on_is_filed_under', { trackName, v2: bits.join(', ') })
    + str('ui.change_any_part_of_it_and')
    + (s.flightStyle === 'arcade'
      ? str('ui.arcade_times_stay_off_the_public')
      : weight !== WEIGHT_STOCK
        ? str('ui.times_flown_at_a_weight_that')
        : str('ui.this_run_is_on', { link }));
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
function padTroubleItem(info) {
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

/*
 * HOW MANY CHOICES FIT ON THE ROW ITSELF.
 *
 * Up to four, the whole set is drawn inline as segments and the pilot can
 * see every option and which one is live without pressing anything. Above
 * four there is no width for it, so the row keeps its button and Enter
 * opens the list.
 *
 * The count is not enough on its own, and the shell check said so: the Tune
 * row carried three presets then, so it drew as a strip, and its labels were
 * things like "Betaflight default" and "Karate race 6S", which wrapped to two
 * lines and took the title screen 18 px further past the fold. So the rule is
 * count AND fit, and both are measured rather than guessed. Twenty four
 * characters of labels all told is what a row's control holds at 1280 px
 * beside a label of its own: Off/On is five, Acro/Angle is nine,
 * Low/High/Ultra is twelve, Arcade/Expert is twelve, and those three tunes
 * were forty.
 *
 * The Tune row ships one preset now and no longer needs the fit rule to
 * behave, which is exactly why it stopped relying on it: it carries
 * `pickOnly` instead. The budget is unchanged and stays measured, because it
 * was never about that one row.
 *
 * The line also decides what Enter does, and that is the more important
 * half. See select().
 */
const SEGMENT_MAX = 4;

/* Long enough that a fast typist does not trigger a rebuild per letter,
 * short enough that the list feels live. A bench rebuild is about 57 ms
 * measured on this container, so anything under about 100 would still be
 * one render per keystroke. */
const SEARCH_DEBOUNCE_MS = 120;
const SEGMENT_CHARS = 24;

/* Whether a choice row draws its whole set on the row, or keeps a button
 * and opens a list. One predicate, so the renderer and select() cannot
 * disagree about which kind of row this is. */
function fitsAsSegments(it) {
  if (!it || !it.options || !it.options.length || it.options.length > SEGMENT_MAX) {
    return false;
  }
  const chars = it.options.reduce((n, o) => n + String(o.label || '').length, 0);
  return chars <= SEGMENT_CHARS;
}

/*
 * Slug a label down to something that survives being written into a DOM id
 * and read back. Anything that is not a letter or a digit becomes a hyphen,
 * because a label is prose: it has apostrophes, degrees signs and commas.
 */
function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'row';
}

/*
 * Stamp a stable id onto every row of a freshly built list. See items().
 *
 * The list is mutated in place rather than copied: these objects are made
 * fresh on every render and thrown away on the next one, and the callers
 * that hold on to one, the drop-down and the typed field, are holding the
 * same object this is stamping.
 */
function stampIds(items, screen) {
  const seen = new Map();
  const prefix = screen ? `${screen}:` : '';
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      continue;
    }
    if (it.id) {
      continue;
    }
    let base;
    if (it.action) {
      base = `a-${it.action}`;
    } else if (it.key) {
      base = `k-${it.key}`;
    } else if (it.section) {
      base = `s-${slugify(it.label)}`;
    } else {
      base = slugify(it.label);
    }
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    it.id = n === 1 ? `${prefix}${base}` : `${prefix}${base}~${n}`;
  }
  return items;
}

/* Step a value through a list, wrapping. */
function choice(label, note, choices, current, format, set) {
  const fmt = format || ((v) => String(v));
  return {
    label,
    note,
    value: fmt(current),
    current,
    options: choices.map((c) => ({ value: c, label: fmt(c) })),
    pick: (v) => {
      const hit = choices.find((c) => String(c) === String(v));
      if (hit !== undefined) {
        set(hit);
      }
    },
    adjust: (d) => set(cycle(choices, current, d)),
  };
}

/*
 * A BOOLEAN IS A SWITCH, not a list of two things.
 *
 * This used to be choice() over [true, false], which meant a two item popup
 * opened for every on and off in the product: Sound, Launch control, Flight
 * log, Binaural tone, and every feature row on the bench. Twelve of them. A popup is the control for "which of these many",
 * and a popup listing On and Off asks a pilot to travel to a menu to answer
 * a question the row itself could have answered in place.
 *
 * `sw` is the flag, and there are no `options`, which is what keeps the
 * dropdown from ever opening on one of these. Left, Right and Enter all
 * flip it: a switch is one bit, the same key puts it back, and it is the
 * one value row where Enter changing something is the idiom rather than
 * the accident. See select().
 */
function toggle(label, note, on, set) {
  const current = Boolean(on);
  return {
    label,
    note,
    sw: true,
    on: current,
    value: current ? 'On' : 'Off',
    current,
    /* Left and Right SET a switch rather than cycling it: Right is On,
     * Left is Off. Cycling means a held Right on a radio makes the row
     * blink, and it means the two keys are the same key, which is a waste
     * of the only spatial handle a two state control has. */
    adjust: (d) => set(d > 0),
    /* Enter flips. See select(). */
    flip: () => set(!current),
  };
}

/*
 * A TYPED number, in whatever units the row's field is displayed in.
 *
 * The one row type on these menus that is not a list, and the reason it
 * exists is the rates bug: a value a pilot has in their head, 1500 deg/s or
 * 0.42 of super rate, has to be enterable, and no list of a dozen steps is
 * ever going to carry it. spec comes from configs/rates.js and knows the
 * firmware bounds, the display scale and how the number is written.
 *
 * The arrows still work, and one press is one firmware unit, so the row is
 * still drivable from a radio or the keyboard alone. `typed` is what the
 * text field commits: it clamps rather than refuses, because a pilot who
 * asks for 5000 deg/s means "as much as it will give me".
 */
function number(label, note, spec, cli, set) {
  const clamp = (v) => Math.max(spec.cliMin, Math.min(spec.cliMax, v));
  const text = formatRate(spec, cli);
  return {
    label,
    note,
    /* No `value`: the field IS the value on this row, and renderMenu reads
     * num before it looks for one. */
    num: {
      spec, cli, text, unit: spec.unit,
    },
    adjust: (d) => set(clamp(cli + d)),
    typed: (raw) => {
      const t = String(raw).trim();
      if (t === '') {
        return null;
      }
      return cliOf(spec, Number(t));
    },
    set,
  };
}

function stepper(label, note, value, adjust) {
  return { label, note, value, adjust, step: true };
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

/* The id of the track the seat holds, or null. */
function seatedTrackId() {
  const share = readShareImport();
  return share ? share.id : null;
}

/* The gates a track races through, which is what its card counts. */
function raceGateCount(doc) {
  try {
    return raceGatesOf(doc).length;
  } catch (e) {
    return 0;
  }
}

/* What the seated track is to the board, or null when nothing is seated. */
function liveListing() {
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
 * Upload a time: what a player can do with a lap on the track they are
 * holding.
 *
 * IT ALWAYS RETURNS A ROW. Rows like it used to return null when they did
 * not apply, and the caller pushed only the survivors, so a menu swung
 * between nine and thirteen rows: the row under the cursor moved depending
 * on what the player had done last, and an action that was simply
 * unavailable was indistinguishable from one that does not exist. A greyed
 * row with a reason teaches; a missing row cannot.
 *
 * `disabled` is honoured by select(), and renderMenu paints it as row-grey.
 */
function uploadAction(listing, { fastestMs, timePosted, airframe }) {
  const pending = readPendingTime();
  const shareId = listing && listing.shareId;
  const craft = lapCraftOf(listing && listing.doc, airframe);
  const ms = Number.isFinite(fastestMs)
    ? fastestMs
    : (shareId && pending && pending.trackId === shareId && (pending.craft || '') === craft ? pending.lapMs : null);
  if (timePosted && shareId) {
    const rank = timePosted.rank != null ? str('ui.rank', { rank: timePosted.rank }) : '';
    return {
      label: str('ui.time_uploaded'),
      action: 'posttime',
      disabled: true,
      note: str('ui.that_lap_is_on_the_public', { rank }),
    };
  }
  if (!listing || !shareId) {
    return {
      label: str('ui.upload_a_time'),
      action: 'posttime',
      disabled: true,
      note: str('ui.only_a_track_on_the_board'),
    };
  }
  if (!listing.canPostTime) {
    return {
      label: str('ui.upload_a_time'),
      action: 'posttime',
      disabled: true,
      note: str('ui.the_layout_has_changed_since_it'),
    };
  }
  if (ms == null) {
    return {
      label: str('ui.upload_a_time'),
      action: 'posttime',
      disabled: true,
      note: str('ui.fly_a_clean_lap_on_this'),
    };
  }
  const best = readPostedBest(lapSlot(shareId, craft));
  const isNew = best != null && ms < best;
  return {
    label: isNew ? str('ui.upload_new_best', { formatTime: formatTime(ms) }) : str('ui.upload', { formatTime: formatTime(ms) }),
    action: 'posttime',
    note: isNew
      ? str('ui.faster_than_the_last_time_you')
      : str('ui.send_this_lap_to_the_public'),
  };
}

/*
 * The still a world card wears until its clip exists.
 *
 * A COLD BROWSER MAKES EVERY CLIP FROM SCRATCH, one world at a time and only
 * while nobody is using the room, so a first visit to Freestyle can spend the
 * better part of a minute with nothing to look at. It spent it as four dark
 * rectangles with the word "loading" on them, which is the worst possible
 * moment to say nothing at all about the places somebody is choosing between.
 * The poster is a rendered frame of the world itself: scripts/posters.js
 * makes it, src/maps/registry.js names it.
 *
 * A CUSTOM PROPERTY AND NOT AN <img>, for three reasons that all came out of
 * trying the element first. A background is decorative by construction, so
 * there is no alt text to invent for a picture the card already names in
 * type underneath it. A background survives `replaceChildren`, which the
 * recorder calls on this box in three places and which would otherwise throw
 * the picture away every time a capture started. And a background that fails
 * to load simply does not paint, so a missing file degrades to the dark
 * rectangle the card always was rather than to a broken image icon: a poster
 * is a nicety and must not be able to break the picker.
 *
 * The property is set on the CARD rather than the reel because two rules
 * read it: the reel paints it, and so does the wait panel, which sits over an
 * opaque recorder iframe and would otherwise be a scrim over nothing.
 */
function markPoster(card, map) {
  if (!card || !map || !map.poster) {
    return;
  }
  const href = new URL(`../../${map.poster}`, import.meta.url).href;
  card.style.setProperty('--poster', `url("${href}")`);
  card.classList.add('has-poster');
}

/*
 * A track card's identity, stable across the rebuilds items() does on every
 * render. The card objects themselves are made fresh each time, so the chosen
 * card is remembered by this key rather than by reference.
 */
function courseCardKey(card) {
  if (!card || !card.course) {
    return null;
  }
  return `${card.course.kind}:${card.course.track.id}`;
}

/* The day a track was last saved, in the pilot's own language's order. */
function formatDay(utc) {
  const d = new Date(utc);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
}

/*
 * The world a track stands in, or null when this build no longer has it:
 * a track on a retired world is listed as retired rather than as a card
 * that loads nothing, because mapById answers an unknown id with another
 * world.
 */
function liveWorld(mapId) {
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
function courseCardRows(subject) {
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
 * The tune, as named choices.
 *
 * A tune is P, I, D, feedforward and filtering. One ships, and it is what a
 * freshly flashed quad flies; the other name on this row, when it is there,
 * is the pilot's own saved dump. Neither carries rates, which is why moving
 * between them changes how the quad settles and not how far the sticks go.
 * See configs/registry.js.
 */
/*
 * Changing what the quad flies re-inits the module, and re-initing puts the
 * craft back on the start line with the lap clock at zero.
 *
 * WHY THAT IS RIGHT AND NOT A BUG, even though the deleted flight-controller
 * screen used to defer it behind a Save and restart the run dialog. A lap
 * flown half on one rate profile and half on another is not a lap: the
 * record key in src/main.js hashes the whole composed config precisely so
 * that a time is only ever compared against times flown on the same one. So
 * the choice mid-run is between restarting the run and recording a time that
 * means nothing, and Tune has always taken the first. Rates takes it too.
 *
 * What was wrong was doing it in SILENCE, which is what removing the dialog
 * left behind: an arrow key on the pause menu cost a lap with no warning.
 * The row says so now, and so does the hint on the screen itself.
 */
const MID_RUN_WARNING = str('ui.changing_it_during_a_run_puts');

function tuneItem(s, midRun) {
  const name = tuneById(s.tune).name;
  const adjusted = pidsAdjusted(s.pids, s.tune);
  return {
    label: str('ui.tune'),
    /*
     * THE ADJUSTMENT STAYS ON THE ROW. That was the PIDs row's whole
     * contribution, and dropping it would have been the one thing lost in
     * folding two rows into one: a quad flying something other than its
     * tune's own numbers has to say so without being opened. Stock reads as
     * the tune's name alone, because "Betaflight default, stock" is a row
     * saying the same thing twice.
     */
    value: adjusted ? `${name}, ${pidsSummary(s.pids, s.tune).toLowerCase()}` : name,
    action: 'pids',
    note: str('ui.opens_where_the_tune_is_chosen', { note: tuneById(s.tune).note, pids: SCREEN_TITLES.pids, v3: midRun ? MID_RUN_WARNING : '' }),
  };
}

/*
 * WHICH TUNE THE PIDS ROOM IS ADJUSTING, and the only place it is chosen.
 *
 * It used to be chosen on Quad, one row above a PIDs row that opened this
 * screen. That pair read as two decisions and was never two: with one tune
 * shipped, the upper row had a single answer on it and the lower one was
 * what a pilot had come to open. They are one row on Quad now, and it opens
 * here, so the picker had to come with it. The alternative was a Tune row on
 * Quad opening a screen whose own Tune row pointed back at Quad.
 *
 * ONE SHIPPED TUNE MEANS THE ROW HAS TO SAY WHERE THE SECOND ONE COMES FROM.
 * Karate race 6S and Precision used to sit under the default, so the row was
 * self evidently a list and needed no explaining. It is one name until the
 * pilot saves a dump, and a row offering exactly one answer with nothing
 * said about it reads as broken rather than as stock. So the note carries
 * the door to the bench, and that clause goes away the moment a save gives
 * the row two answers.
 */
function tunePickItem(s, midRun) {
  const ids = tuneChoices(s.airframe);
  const ownTune = ids.includes(CUSTOM_TUNE.id);
  const door = ownTune
    ? ''
    : str('ui.stock_is_the_only_tune_shipped', { fc: SCREEN_TITLES.fc, name: CUSTOM_TUNE.name });
  return {
    ...choice(
      str('ui.tune'),
      str('ui.everything_below_belongs_to_this_one', { door, v2: midRun ? MID_RUN_WARNING : '' }),
      ids,
      s.tune,
      (id) => tuneById(id).name,
      (id) => { s.tune = id; },
    ),
    /*
     * ENTER OPENS THIS ROW, IT NEVER STEPS IT, and that is a decision rather
     * than an accident of arithmetic.
     *
     * This is the row that bit somebody: one Enter a row below where it was
     * meant swapped the flight tune with nothing announcing it, and a tune
     * swap re-inits the module and costs the lap. What kept it safe
     * afterwards was fitsAsSegments saying no, which it said because the
     * labels of three tunes came to forty characters against a budget of
     * twenty four. With two tunes deleted the list is short enough to be
     * segmented, so the guarantee evaporated on a change that had nothing to
     * do with it, and the shell check caught the row going dead in the same
     * breath. A row whose cost is a lap does not get to depend on how long
     * its labels happen to be. See select().
     */
    pickOnly: true,
  };
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
/* The main menu's door to the machine. A plane is not a quad, and it is
 * where a fixed wing pilot changes plane, so for one it says which plane
 * is seated as well as its tune. */
function machineLabel(s) {
  return airframeById(s.airframe).fixedWing ? str('ui.plane') : str('ui.quad');
}

function machineValue(s) {
  const af = airframeById(s.airframe);
  return af.fixedWing ? `${af.short}, ${tuneById(s.tune).name}` : tuneById(s.tune).name;
}

/*
 * During a run the row SWAPS the aircraft in place (src/main.js hotSwap)
 * rather than seating it for the next one, so it no longer carries the
 * start line warning: `swap` is the shell's, and absent between runs.
 * Enter and a click open the picker (src/ui/carousel.js) through `open`,
 * which the screen adds because it needs the Ui.
 */
function craftItem(s, swap) {
  const af = airframeById(s.airframe);
  return {
    ...choice(
      str('ui.aircraft'),
      str('ui.changing_it_loads_that_machine_s', { blurb: af.blurb, v3: swap ? ` ${str('carousel.in_place')}` : '' }),
      AIRFRAME_IDS,
      s.airframe,
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
const YAW_TIP_TILT = 40;
const YAW_TIP_RATE = 500;

/* The rate systems whose Max rate column is the rate at full stick, so
 * "set yaw to 500" is one number and is exactly true. See offerYawTip. */
function yawTipFixable(rates) {
  const type = normaliseRates(rates).type;
  return type === 'ACTUAL' || type === 'QUICK';
}

/* How long a yes or no refuses to be answered after it opens. See askConfirm. */
const CONFIRM_DEAF_MS = 300;

function ratesChanged(s) {
  return !ratesAreDefault(s.rates);
}

/* The way in to the Rates screen, with the whole curve read out on the row
 * so a pilot can see what they are flying without opening it. */
function ratesItem(s, midRun) {
  return {
    label: str('ui.rates'),
    value: ratesSummary(s.rates),
    action: 'rates',
    /*
     * NO MID RUN WARNING ANY MORE, and its absence is the point.
     *
     * It said the quad goes back on the start line, and until this round it
     * did: rates live in the config text, so changing one re-inits the
     * module, and the module's init is a full reset. applySettings in
     * src/main.js now puts the craft back where it stood instead, so the
     * sentence would be a warning about something that does not happen.
     * The tune and the PIDs still carry it, because they still do it.
     */
    note: str('ui.how_far_the_sticks_go_and'),
  };
}

/* The way back into the flight feel question, after its one automatic
 * offer. On Results and the pause menu only: those are the two places a
 * pilot has just been flying, which is when a feel report is worth
 * anything. */
function feelItem() {
  return {
    label: str('ui.flight_feel'),
    action: 'feel',
    note: str('ui.tell_the_tune_work_how_the'),
  };
}

function graphicsItem(s) {
  const id = normalizeGraphics(s.graphics);
  return choice(
    str('ui.graphics'),
    graphicsNote(id),
    GRAPHICS_IDS,
    id,
    graphicsLabel,
    (v) => { s.graphics = v; s.graphicsAuto = false; },
  );
}

function gpuItem(info) {
  if (!info) {
    return {
      label: str('ui.gpu'),
      value: str('ui.detecting'),
      note: str('ui.read_from_the_webgl_context_that'),
      info: true,
    };
  }
  return {
    label: str('ui.gpu'),
    value: info.display,
    note: info.note,
    info: true,
  };
}

function padChooseNote(info) {
  const n = info && typeof info.count === 'number' ? info.count : 0;
  if (n <= 0) {
    return str('ui.plug_in_a_radio_in_joystick');
  }
  if (n === 1) {
    return str('ui.one_device_is_plugged_in_open', { using: info.using });
  }
  return str('ui.devices_are_plugged_in_move_the', { n });
}

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
 * WHETHER FREESTYLE IS OFFERED AT ALL, and on a whoop it is not.
 *
 * Freestyle is one place, a town: roofs, alleys, a level crossing and a works
 * road, laid out for a five inch at forty metres a second and about five
 * hundred metres across. A 65 mm whoop doing five is as wrong in it as a five
 * inch is in a living room, and that is the mismatch this whole class split
 * exists to remove. Offering the card anyway would be offering a pilot a
 * place they will turn round and leave.
 *
 * So on a whoop the mode question has one answer and is not asked: the title
 * goes aircraft, then straight to the menu, and Escape from the menu goes
 * straight back to the aircraft. When there is an indoor freestyle space to
 * fly, this is the one function that has to change.
 */
function freestyleOffered(airframeId) {
  return airframeById(airframeId).trackClass !== 'micro';
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
 * A fixed wing in plan, as a SYMBOL rather than to scale: a metre and more
 * of span cannot share the quads' 300 mm box, and at its own scale the
 * card would only say "bigger". So it says what the X says for a quad,
 * which kind of machine this is: nose up, a straight wing across, a
 * fuselage and a tailplane, in the quads' fills and strokes. One card
 * covers every fixed wing, so it is not either plane's outline.
 */
const PLANE_PARTS = [
  /* Fuselage, nose up. */
  '<rect x="138" y="38" width="24" height="222" rx="12" fill="currentColor" fill-opacity="0.55"'
    + ' stroke="currentColor" stroke-width="4" stroke-opacity="0.9"/>',
  /* Wing, a little taper to the tips. */
  '<path d="M 22 128 L 278 128 L 270 166 L 30 166 Z" fill="currentColor" fill-opacity="0.38"'
    + ' stroke="currentColor" stroke-width="4" stroke-opacity="0.9" stroke-linejoin="round"/>',
  /* Tailplane. */
  '<path d="M 96 226 L 204 226 L 198 250 L 102 250 Z" fill="currentColor" fill-opacity="0.38"'
    + ' stroke="currentColor" stroke-width="4" stroke-opacity="0.9" stroke-linejoin="round"/>',
].join('');

function planeSvg() {
  return '<svg viewBox="0 0 300 300" role="img" aria-hidden="true"'
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + PLANE_PARTS + '</svg>';
}

/*
 * Two of the plane symbol in echelon, for the Fly with friends card: the
 * same symbol, so it reads as the same kind of mark as its neighbours, and
 * two of them because company is what that card offers. Not to any scale,
 * for the reason planeSvg gives.
 */
function pairSvg() {
  return '<svg viewBox="0 0 300 300" role="img" aria-hidden="true"'
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + `<g transform="translate(4 20) scale(0.56)">${PLANE_PARTS}</g>`
    + `<g transform="translate(128 112) scale(0.56)">${PLANE_PARTS}</g>`
    + '</svg>';
}

/* Combat's mark: the plane symbol towing its paper, a streamer in the
 * same strokes waving off the tail. */
function streamerSvg() {
  return '<svg viewBox="0 0 300 300" role="img" aria-hidden="true"'
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + `<g transform="translate(78 4) scale(0.48)">${PLANE_PARTS}</g>`
    + '<path d="M 150 132 C 120 170, 190 190, 150 222 S 110 262, 150 294" fill="none"'
    + ' stroke="currentColor" stroke-width="12" stroke-opacity="0.7" stroke-linecap="round"/>'
    + '</svg>';
}

/* Catch the Ace's mark: the crown the Ace wears (src/ui/peermarks.js). */
function crownSvg() {
  return '<svg viewBox="0 0 300 300" role="img" aria-hidden="true"'
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + '<path d="M 50 210 L 38 96 L 104 150 L 150 70 L 196 150 L 262 96 L 250 210 Z"'
    + ' fill="currentColor" fill-opacity="0.45" stroke="currentColor" stroke-width="8"'
    + ' stroke-opacity="0.9" stroke-linejoin="round"/>'
    + '<rect x="50" y="222" width="200" height="26" rx="6" fill="currentColor" fill-opacity="0.7"/>'
    + '</svg>';
}

/* Defend Itaipu's mark: the plane symbol in a gunsight's ring, which is
 * what every defender is (a warhead flown onto an attacker). No flag and no
 * roundel: the mode names nobody (docs/WARFARE-PLAN.md). */
function reticleSvg() {
  return '<svg viewBox="0 0 300 300" role="img" aria-hidden="true"'
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + '<circle cx="150" cy="150" r="118" fill="none" stroke="currentColor" stroke-width="8" stroke-opacity="0.9"/>'
    + '<path d="M 150 10 V 58 M 150 242 V 290 M 10 150 H 58 M 242 150 H 290" stroke="currentColor"'
    + ' stroke-width="10" stroke-opacity="0.9" stroke-linecap="round"/>'
    + `<g transform="translate(93 93) scale(0.38)">${PLANE_PARTS}</g>`
    + '</svg>';
}

/*
 * The two aircraft in plan, drawn TO ONE SCALE.
 *
 * The viewBox is 300 mm across for both, so the five inch fills it and the
 * whoop sits in the middle of it at a bit over a fifth of the width, which
 * is exactly the relationship the two machines have on a bench. That is the
 * single most useful thing a card can tell somebody who has flown one and
 * not the other, and it is the one thing two cropped photographs cannot say.
 *
 * The five inch is an X: four arms out to four open discs, which is what you
 * see when you look at one. The whoop is a tub: four rings joined by webs,
 * with no arm visible anywhere, because there are none. The silhouettes are
 * the difference between the two designs and they are drawn rather than
 * described.
 *
 * Numbers are millimetres and come from configs/airframes.js, so a change to
 * an airframe's dimensions redraws its card.
 */
function craftSvg(a) {
  if (a.fixedWing) {
    return planeSvg();
  }
  const VB = 300;           /* viewBox side, millimetres */
  const c = VB / 2;
  /*
   * THE REAL PRODUCT, WHICH ON THE WHOOP IS NOT THE AIRFRAME'S `dims`.
   *
   * The whoop flies the five inch's plant, so its `dims` are the five
   * inch's: that is what the collider sweeps and what the world draws,
   * because the world is built MICRO_SCALE times life size to suit. Drawn
   * from those, the whoop's plan would fill this viewBox edge to edge like
   * the five inch's, and the one thing this card exists to say, that the
   * two machines sit on a bench at a fifth of each other's width, would be
   * gone. WHOOP_TRUE_DIMS is the 65 mm machine as the maker publishes it, and
   * it is what a pilot holding one would measure.
   */
  const dims = a.id === 'whoop65' ? WHOOP_TRUE_DIMS : a.dims;
  const arm = dims.arm * 1000;
  const prop = dims.propR * 1000;
  /* The outside of a duct is the hull, not the blade plus a guess at a wall. */
  const hull = (dims.hullR ?? dims.propR) * 1000;
  const off = arm / Math.SQRT2;
  const motors = [[off, off], [off, -off], [-off, off], [-off, -off]];
  const ducted = a.trackClass === 'micro';
  const parts = [];
  if (ducted) {
    /* The tub: the webs first so the rings sit on top of them. */
    parts.push(`<rect x="${c - off}" y="${c - off}" width="${off * 2}" height="${off * 2}"`
      + ` rx="${prop * 0.35}" fill="none" stroke="currentColor" stroke-width="${prop * 0.42}"`
      + ' stroke-opacity="0.30"/>');
    parts.push(`<line x1="${c - off}" y1="${c - off}" x2="${c + off}" y2="${c + off}"`
      + ` stroke="currentColor" stroke-width="${prop * 0.34}" stroke-opacity="0.24"/>`);
    parts.push(`<line x1="${c - off}" y1="${c + off}" x2="${c + off}" y2="${c - off}"`
      + ` stroke="currentColor" stroke-width="${prop * 0.34}" stroke-opacity="0.24"/>`);
  } else {
    for (const [mx, mz] of motors) {
      parts.push(`<line x1="${c}" y1="${c}" x2="${c + mx}" y2="${c + mz}"`
        + ` stroke="currentColor" stroke-width="${prop * 0.20}" stroke-opacity="0.55"/>`);
    }
    parts.push(`<rect x="${c - 22}" y="${c - 38}" width="44" height="76" rx="10"`
      + ' fill="currentColor" fill-opacity="0.30"/>');
  }
  for (const [mx, mz] of motors) {
    if (ducted) {
      /* The duct wall, then the bore, so a ring reads as a ring. */
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${hull}"`
        + ' fill="currentColor" fill-opacity="0.34"/>');
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${prop}"`
        + ' fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.85"/>');
    } else {
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${prop}"`
        + ' fill="currentColor" fill-opacity="0.16"'
        + ' stroke="currentColor" stroke-width="1.4" stroke-opacity="0.8"/>');
    }
  }
  if (ducted) {
    /*
     * The stack and the camera, which are the only things that say which way
     * it is pointing. There is no canopy: a whoop is sold bare, the board
     * IS the top of the aircraft, and the camera standing at the front of it
     * is the tallest thing on the machine. See src/render/whoopcraft.js,
     * which draws the same two parts in the same order. -z is the nose in
     * the craft frame and on this drawing.
     */
    parts.push(`<rect x="${c - 9}" y="${c - 9}" width="18" height="18" rx="2"`
      + ' fill="currentColor" fill-opacity="0.42"/>');
    parts.push(`<rect x="${c - 7}" y="${c - 17}" width="14" height="11" rx="2"`
      + ' fill="currentColor" fill-opacity="0.72"/>');
  }
  return `<svg viewBox="0 0 ${VB} ${VB}" role="img" aria-hidden="true"`
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + parts.join('') + '</svg>';
}

/*
 * THE WAYS IN, and they are the whole of the front door. There were
 * three until the owner retired the five inch's Freestyle card
 * (2026-09-25): the town and the Freestyle menu are still there, but the
 * front door is racing or free flight.
 *
 * This used to be two questions in a row. Which aircraft, five inch or
 * whoop, and then race or freestyle, and the second one was skipped on the
 * whoop because a 65 mm machine has nowhere to freestyle. So a pilot who
 * came to fly pressed twice, and what the second press asked depended on
 * what the first one answered: choosing the five inch produced a question
 * the whoop had not been asked. The owner reported exactly that, and it is
 * the report this table answers.
 *
 * Between the two questions there are three legal answers and no more. The
 * whoop has no freestyle, so the pairs are five inch racing, whoop racing,
 * and freestyle, which is the five inch. One screen, three cards, one press.
 * The objection the old aircraft gate wrote down was that a third card
 * beside Race and Freestyle would pretend racing on a whoop was not a real
 * answer; it is answered by racing on a whoop being one of the three cards
 * rather than by asking twice.
 *
 * A card carries both halves of the answer, so act() seats the aircraft and
 * sets the mode in one go. The AIRCRAFT is remembered in settings and the
 * MODE deliberately is not, which is unchanged: what the cursor opens on is
 * the seated aircraft's card, and every visit still passes through here.
 *
 * The pictures are frames of the real renderer, shipped as files by
 * scripts/gatecards.js, because the screen a first visit opens on has to
 * paint before anything has been flown and with no network. The plan
 * drawing over each one is craftSvg, and the two machines are drawn to ONE
 * scale in one viewBox, so the whoop is a fifth of the width of the five
 * inch on its card because it is a fifth of the width of it on a bench. A
 * photograph of a room and a photograph of a field cannot say that: they
 * are both a picture that fills a card.
 */
const WAYS = [
  {
    /* EVERY AIRCRAFT, ONE CARD: a track built in a world is raced by every
     * quad and by every fixed wing that fits its gates (src/game/verify.js
     * planesFor, #93), so the picker this card opens offers them all and
     * My tracks says which tracks a plane fits. The five inch is what the
     * card seats when nothing is; a pilot on any other aircraft keeps it.
     * The id is the card's and outlived the five inch having it alone. */
    id: 'race-5inch',
    airframes: AIRFRAME_IDS,
    mode: 'race',
    label: str('ui.track_mode'),
    art: 'assets/gate/race.jpg',
    blurb: str('ui.gates_against_the_clock_on_a'),
    facts: [str('ui.gates'), str('ui.the_clock'), str('ui.the_board')],
  },
  {
    /* EVERY FIXED WING, ONE CARD. A card is a kind of flying, not a
     * machine: every one of them is launched, flown long and brought home
     * on a strip, so they share a way in and the Plane row picks
     * between them. The first, the Bramor, which took the 1000 mm flying
     * wing's place, is what the card seats when none is; a pilot already on
     * another keeps it. The id is the card's and outlived the wing. */
    id: 'freestyle-wing1000',
    airframes: ['bramor2300', 'sky1800', 'cub1400', 'radian2000', 'slowstick1180', 'timber1500', 'timber1500f', 'cub1400f', 'bombshell1118', 'kadet1981', 'uglystik1567', 'tigermoth1803', 'p51d1450', 'f16878', 'zagi1219', 'nrj1490'],
    mode: 'freestyle',
    /* The card's own world. A card with a home skips the picker. The
     * photoreal Swiss valley, by the owner's choice (2026-09-27): it has a
     * strip for the wheels, a lake for the floats and room for the rest. The
     * Map row still seats any other world. */
    home: 'swiss2',
    label: str('ui.free_flight_card'),
    art: 'assets/gate/flight.jpg',
    blurb: str('ui.the_fixed_wings'),
    facts: [str('ui.every_plane'), str('ui.the_swiss_valley')],
  },
  {
    /* FLY WITH FRIENDS, the owner's third card (2026-09-28). Free flight
     * in a private room: the same mode and home as the card before it, and
     * every aircraft free flight takes, the five inch as well as the
     * planes. `room` is what makes it a different way in: it opens the
     * room screen (#128, src/main.js friendsRows) instead of the aircraft
     * picker, and the aircraft and the world are chosen there, after the
     * room. Public rooms (Phase 5) are a row on that screen, not a card.
     *
     * AFTER THE TWO SOLO CARDS, with the games after it, because
     * pickForWay's "the card that takes it" and seatedWay's "the card of
     * its kind" are first match reads of this table and neither is meant
     * to land on a room card. On the gate only where there is a
     * rooms server (friendsItems), the same rule as the menu row. */
    id: 'friends',
    airframes: AIRFRAME_IDS.filter(freestyleOffered),
    mode: 'freestyle',
    home: 'swiss2',
    room: true,
    label: str('friends.title'),
    art: 'assets/gate/friends.jpg',
    svg: pairSvg(),
    blurb: str('friends.card_blurb'),
    facts: [str('friends.card_public'), str('friends.card_code'), str('friends.card_craft')],
  },
  /*
   * THE ROOM GAMES, one card each, by the owner's word (2026-09-29): "both
   * modes need their dedicated card on the main menu". Each is the Fly
   * with friends card with its `game` preselected: the same room screen,
   * where a private room's host then finds that game's start row on top
   * and under the cursor (src/main.js friendsRows), and a pilot who joins
   * sees what the room is set up for. Private rooms only, as the games
   * are, so the screen they open does not offer a public room.
   */
  {
    id: 'combat',
    airframes: AIRFRAME_IDS.filter(freestyleOffered),
    mode: 'freestyle',
    home: 'swiss2',
    room: true,
    game: 'combat',
    label: str('combat.card'),
    art: 'assets/gate/combat.jpg',
    svg: streamerSvg(),
    blurb: str('combat.card_blurb'),
    facts: [str('combat.card_cut'), str('combat.card_rounds'), str('friends.card_code')],
  },
  {
    id: 'ace',
    airframes: AIRFRAME_IDS.filter(freestyleOffered),
    mode: 'freestyle',
    home: 'swiss2',
    room: true,
    game: 'tag',
    label: str('roomtag.section'),
    art: 'assets/gate/ace.jpg',
    svg: crownSvg(),
    blurb: str('roomtag.card_blurb'),
    facts: [str('roomtag.card_crown'), str('roomtag.card_touch'), str('friends.card_code')],
  },
  {
    /*
     * DEFEND ITAIPU, by the owner's word (2026-09-29): "id like a new card
     * up front to access this". A room game card like the two before it,
     * but the press goes to the shell first (onWarCard, src/main.js DEFEND
     * ITAIPU), because the war's gate (docs/WARFARE-PLAN.md section 9) asks
     * its one consent question before anything else, and the room has to
     * be private and on the Itaipu map, so the shell makes it rather than
     * offering Make a room. The picture is the map's own poster.
     */
    id: 'war',
    airframes: AIRFRAME_IDS.filter(freestyleOffered),
    mode: 'freestyle',
    home: 'itaipu',
    room: true,
    game: 'war',
    label: str('war.card'),
    art: 'assets/posters/itaipu.jpg',
    svg: reticleSvg(),
    blurb: str('war.card_blurb'),
    facts: [str('war.card_hold'), str('war.card_warhead'), str('friends.card_code')],
  },
  {
    /*
     * DEFEND THE PARANÁ, the campaign: Defend Itaipu's missions in order,
     * with stars, credits and a shop. The press opens the campaign's own
     * screen (onCampaignCard, src/ui/campaign.js), whose Play then goes the
     * Defend Itaipu card's way in. After that card, so the first match
     * reads of this table (seatedWay) still land on it for the war.
     */
    id: 'campaign',
    airframes: AIRFRAME_IDS.filter(freestyleOffered),
    mode: 'freestyle',
    home: 'itaipu',
    room: true,
    game: 'war',
    campaign: true,
    label: str('campaign.card'),
    art: 'assets/posters/itaipu.jpg',
    svg: reticleSvg(),
    blurb: str('campaign.card_blurb'),
    facts: [str('campaign.card_act'), str('campaign.card_missions'), str('campaign.card_shop')],
  },
].map((w) => ({ ...w, action: `way-${w.id}` }));

/* The way that is seated right now, which is what the gate's cursor opens
 * on and what a menu that has been backed out of returns to. The mode is
 * only set once the gate has been answered, so before that the standing
 * answer is the card that is the seated aircraft's own kind: Track mode for
 * a quad, Free Flight for a plane, which may also race. */
function seatedWay(settings, mode) {
  const a = settings.airframe;
  const fits = WAYS.filter((w) => w.airframes.includes(a));
  return fits.find((w) => w.mode === mode)
    || fits.find((w) => w.airframes.every((id) => kindOf(id) === kindOf(a)))
    || fits[0]
    || WAYS[0];
}

/* The carousel tab a card's picker opens on: its aircraft's kind, or every
 * aircraft when the card takes both. */
function wayFilter(way) {
  const kinds = new Set(way.airframes.map(kindOf));
  return kinds.size === 1 ? [...kinds][0] : 'all';
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
/*
 * What a link to the board carries for the seated aircraft. The board takes
 * an airframe id or a track class (src/share/board.js) and knows one
 * airframe per class, which for the wing class is still the retired
 * wing1000, so a fixed wing, any of them, is sent as its class.
 */
function boardCraft(id) {
  const af = airframeById(id);
  return af.fixedWing ? af.trackClass : af.id;
}

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
    /* A link that names the whoop has answered the mode question too, so
     * that pair of link parameters is still one press from the air. */
    if (this.syncMode()) {
      saveSettings(this.settings);
    }
    /* Which aircraft the mode was last made legal for. See writeSettings:
     * the answer only changes when the AIRCRAFT changes. */
    this.modeSyncedFor = this.settings.airframe;
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
      const at = WAYS.findIndex((w) => w.id === seatedWay(this.settings, this.mode).id);
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
       * it for one frame.
       */
      const tr = MENU_TRACKS[0];
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
    this.bindWikiHash();
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
     * software rather than about flying, so it wears the amber an
     * instrument wears rather than the mint a record does, and it sits
     * directly under the wordmark: a pilot who is about to meet a bug
     * should have been told before the lap, not after it. It is not
     * dismissible, because the thing it warns about has not stopped
     * being true by the second visit. */
    const beta = el('p', 'beta-note');
    beta.append(
      el('span', 'beta-tag', str('ui.beta')),
      el('span', null, str('ui.expect_bugs_and_rough_edges_it')),
    );
    brand.append(beta);
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    this.keepNote = el('p', 'keep-note', str('ui.tracks_you_build_stay_in_this'));
    brand.append(this.keepNote);
    /* First run only. Replaced by the keep note once a lap has been flown. */
    this.firstNote = el('p', 'keep-note first-note', str('ui.a_quad_has_no_brakes_and'));
    brand.append(this.firstNote);
    this.wikiTeaser = btn('wiki-teaser', str('ui.simulating_fpv_for_nerds'));
    this.wikiTeaser.setAttribute('aria-label', str('ui.open_the_fpv_wiki'));
    this.wikiTeaser.addEventListener('click', () => this.act('wiki'));
    brand.append(this.wikiTeaser);
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
    copy.append(brand, this.gateCards, titleFoot);
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
    const howtoWiki = btn('howto-wiki', str('ui.why_this_works_the_fpv_wiki'));
    howtoWiki.addEventListener('click', () => this.act('wiki'));
    howto.append(howtoWiki);

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
    fcBrand.append(el('span', 'fc-wordmark', str('ui.betaflight')));
    fcBrand.append(el('span', 'fc-fw', '4.5.1'));
    fcBrand.append(el('span', 'fc-conn', str('ui.wasm')));
    this.fcDirty = el('span', 'fc-dirty', '');
    fcBrand.append(this.fcDirty);
    fcHead.append(fcBrand);
    const homage = el('p', 'fc-homage');
    const cfgLink = el('a', null, str('ui.betaflight_configurator'));
    cfgLink.href = 'https://github.com/betaflight/betaflight-configurator';
    cfgLink.target = '_blank';
    cfgLink.rel = 'noopener noreferrer';
    const bfLink = el('a', null, 'Betaflight');
    bfLink.href = 'https://github.com/betaflight/betaflight';
    bfLink.target = '_blank';
    bfLink.rel = 'noopener noreferrer';
    homage.append(
      document.createTextNode(str('ui.homage_of')),
      cfgLink,
      document.createTextNode(str('ui.10_10_colours_and_tabs_not')),
      bfLink,
      document.createTextNode(str('ui.4_5_1_with_thanks_to')),
    );
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

    /* A newer deploy is out. Shown on menus and on Paused, never over a
     * flight: syncChips holds it until the pilot is off the sticks. */
    this.updateReady = false;
    this.updateBar = el('div', 'update-bar');
    this.updateBar.setAttribute('role', 'status');
    this.updateBar.hidden = true;
    const reload = btn('update-reload', str('update.reload'));
    reload.addEventListener('click', () => window.location.reload());
    this.updateBar.append(el('span', null, str('update.new_version')), reload);
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
    this.roomBarButton.addEventListener('click', () => {
      if (this.roomBarView && this.roomBarView.act) {
        this.roomBarView.act();
      }
    });
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
    r.append(this.announcer, this.banner, this.bugChip, this.pauseChip, this.swapChip, this.updateBar, this.roomBar, this.musicDock, this.nameDialog);
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
      { ...craftItem(s, null), open: () => this.openCraftRow(false) },
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
   * Typed fields. The stick menu cannot enter a name, so this is a small
   * overlay. Resolves to a map of field keys, or null if they cancel.
   */
  askForm({ title, detail, confirmLabel, fields } = {}) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const list = Array.isArray(fields) && fields.length
      ? fields
      : [{
        key: 'name',
        label: '',
        value: readPilotName() || '',
        maxLength: 24,
        placeholder: str('ui.name'),
        rules: nameRules(),
        save: writePilotName,
      }];
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title || str('ui.your_name')));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const inputs = [];
      const err = el('p', 'name-dialog-err', '');
      for (const spec of list) {
        if (spec.label) {
          box.append(el('p', 'name-dialog-label', spec.label));
        }
        if (spec.rules) {
          box.append(el('p', 'lede', spec.rules));
        }
        const field = document.createElement('input');
        field.type = 'text';
        field.className = 'name-dialog-input';
        field.maxLength = spec.maxLength || 80;
        field.autocomplete = spec.autocomplete || 'off';
        field.value = spec.value || '';
        field.placeholder = spec.placeholder || spec.label || '';
        field.dataset.key = spec.key;
        box.append(field);
        inputs.push({ spec, field });
      }
      const row = el('div', 'name-dialog-row');
      const save = btn('name-dialog-btn on', confirmLabel || str('ui.save'));
      const cancel = btn('name-dialog-btn', str('ui.cancel'));
      row.append(save, cancel);
      box.append(err, row);
      this.nameDialog.textContent = '';
      this.nameDialog.append(box);
      this.nameDialog.hidden = false;
      const readValues = () => {
        const out = {};
        for (const { spec, field } of inputs) {
          let value = String(field.value || '').trim();
          if (spec.save) {
            value = spec.save(field.value);
            if (!value) {
              err.textContent = spec.rules || str('ui.that_value_is_not_usable');
              field.focus();
              return null;
            }
          } else if (spec.required !== false && !value) {
            err.textContent = spec.empty || str('ui.that_needs_a_name');
            field.focus();
            return null;
          }
          out[spec.key] = value;
        }
        return out;
      };
      const finish = (value) => {
        this.closeNameDialog(value);
      };
      const onKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const values = readValues();
          if (values) {
            finish(values);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      };
      this.nameKeyHandler = onKey;
      this.nameDialog.addEventListener('keydown', onKey, true);
      save.addEventListener('click', () => {
        const values = readValues();
        if (values) {
          finish(values);
        }
      });
      cancel.addEventListener('click', () => finish(null));
      /*
       * Backdrop cancel. This used to be a `{ once: true }` listener, which
       * spends itself on the FIRST click anywhere in the dialog: one click
       * in the name field and clicking the backdrop no longer closed
       * anything. It also outlived a dialog closed by a button, because
       * `once` only removes the listener when it actually fires, so every
       * open that ended on Save left one behind on a node that is reused.
       * Held and removed in closeNameDialog, next to the key handler.
       */
      this.nameClickHandler = (e) => {
        if (e.target === this.nameDialog) {
          finish(null);
        }
      };
      this.nameDialog.addEventListener('click', this.nameClickHandler);
      inputs[0].field.focus();
      inputs[0].field.select();
    });
  }

  /*
   * NAME THIS PROFILE. The same overlay askName uses, for the same reason:
   * a name is typed, and the stick menu cannot type one.
   *
   * THIS IS THE PROMPT the owner asked for. There is no inline name field
   * anywhere, so "save with no name" cannot reach the store: confirming an
   * empty field leaves the dialog open with the `empty` line under it,
   * because askForm's readValues refuses a required field that is blank and
   * returns null rather than inventing a name.
   *
   * `suggested` is the loaded preset's name when the numbers already match
   * one, so the common case of nudging a saved profile and saving it again
   * lands on that profile instead of quietly growing a second copy of it.
   * The detail carries the storage warning, because this is the moment a
   * pilot decides the profile is worth keeping and therefore the moment it
   * matters that it is kept in one browser and nowhere else.
   */
  askRatePresetName(suggested = '') {
    const taken = presetNamed(suggested);
    return this.askForm({
      title: str('ui.name_this_preset'),
      detail: RATES_STORAGE_WARNING,
      confirmLabel: taken ? str('app.replace') : str('ui.save'),
      fields: [{
        key: 'name',
        label: '',
        value: suggested,
        maxLength: PRESET_NAME_MAX,
        placeholder: str('ui.preset_name'),
        empty: str('ui.a_preset_needs_a_name'),
      }],
    }).then((values) => (values ? values.name : null));
  }

  /*
   * A yes or no, on the same overlay the name form uses.
   *
   * Shares the node deliberately: handleKey already swallows every menu key
   * while `nameDialog` is open, closeNameDialog already tears down the key
   * and backdrop listeners, and a second modal with its own copy of that
   * bookkeeping is how one of them ends up leaking a listener. No field, so
   * the confirming button takes focus instead. Resolves true or false, and
   * a backdrop click or Escape is false.
   *
   * `danger` is for a yes that cannot be undone, a delete. Then the keep
   * button has focus and wears the primary colour, Enter presses whichever
   * button has focus, Y is not a shortcut, and the arrows move between the
   * two: a stray Enter keeps, and deleting is a move onto Delete and then a
   * press.
   */
  askConfirm({
    title, detail, yes, no, danger = false,
  }) {
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const row = el('div', 'name-dialog-row');
      const yesBtn = btn(danger ? 'name-dialog-btn danger' : 'name-dialog-btn on', yes || 'Yes');
      const noBtn = btn(danger ? 'name-dialog-btn on' : 'name-dialog-btn', no || 'No');
      row.append(noBtn, yesBtn);
      box.append(row);
      this.nameDialog.textContent = '';
      this.nameDialog.append(box);
      this.nameDialog.hidden = false;

      /*
       * TWO THINGS THIS DIALOG DOES NOT DO, both reported by a pilot who
       * spammed the camera angle button past 40 and watched the tip vanish
       * before they could read it.
       *
       * NO BACKDROP DISMISSAL. The backdrop is inset 0 with pointer-events
       * auto, so it covers the row the pilot was just clicking: the stepper
       * that opened this sits at x 1183 in a 1600 wide window and the box is
       * centred, so the very next click of a burst landed on the backdrop
       * and answered no. The name form can keep click-beside-to-cancel
       * because a pilot opens it deliberately and it has an obvious Cancel.
       * A question that appears UNDER THE CURSOR uninvited cannot.
       *
       * AND A SHORT DEAF PERIOD. Removing the backdrop handler fixes the
       * clicks that land beside the box, but at another window size the box
       * can be under the cursor and the same burst would hit a BUTTON, which
       * is worse: it would answer for them. Nothing is accepted from any
       * source for 300 ms, which is under the roughly 250 ms floor for
       * reacting to something that just appeared, so it can only ever
       * swallow input that was already queued when the dialog opened.
       */
      const openedAt = performance.now();
      const finish = (v) => {
        if (performance.now() - openedAt < CONFIRM_DEAF_MS) {
          return;
        }
        this.closeNameDialog(v);
      };
      const onKey = (e) => {
        const answer = {
          Enter: danger ? document.activeElement === yesBtn : true,
          y: danger ? undefined : true,
          Y: danger ? undefined : true,
          Escape: false,
          n: false,
          N: false,
        }[e.key];
        if (danger && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          e.stopPropagation();
          (document.activeElement === yesBtn ? noBtn : yesBtn).focus();
          return;
        }
        if (answer === undefined) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        finish(answer);
      };
      this.nameKeyHandler = onKey;
      this.nameDialog.addEventListener('keydown', onKey, true);
      yesBtn.addEventListener('click', () => finish(true));
      noBtn.addEventListener('click', () => finish(false));
      (danger ? noBtn : yesBtn).focus();
    });
  }

  /*
   * The tip that fires when the camera goes past the angle where yaw starts
   * to roll the horizon hard. Offered ONCE per session, only on the way UP
   * across the threshold, and only when the yaw rate is actually above what
   * would be suggested, so a pilot who has already dealt with it is never
   * asked. The numbers in it are this pilot's, not an example.
   *
   * IN DEG/S AT FULL PEDAL, read off the same curve the Rates screen draws,
   * because that is the only number the five rate systems agree on. The one
   * press fix is offered on the two systems where it is exact, Actual and
   * Quick, which are the two whose Max rate column IS the rate at the stop:
   * on Betaflight or KISS the same 500 deg/s is a pair of numbers with no
   * single right answer, so those pilots get the sentence and the screen
   * rather than a button that would have to guess. See yawTipFixable.
   */
  offerYawTip() {
    const s = this.settings;
    this.yawTipAsked = true;
    const pct = Math.round(Math.sin(cameraTiltRad(s.cameraAngle)) * 100);
    const yawNow = fullStickDeg(s.rates, 'yaw');
    const now = Math.round(yawNow * Math.sin(cameraTiltRad(s.cameraAngle)));
    const then = Math.round(YAW_TIP_RATE * Math.sin(cameraTiltRad(s.cameraAngle)));
    this.askConfirm({
      title: str('ui.yaw_will_roll_the_horizon'),
      detail: str('ui.at_degrees_of_tilt_percent_of', { cameraAngle: s.cameraAngle, pct, now, yawNow, YAW_TIP_RATE, then }),
      yes: str('ui.set_yaw_to', { YAW_TIP_RATE }),
      no: str('ui.leave_it_at', { yawNow }),
    }).then((ok) => {
      if (!ok) {
        return;
      }
      /* Max rate is srate in tens of deg/s on both systems this is offered
       * on, which is why the fix is one assignment and not a solver. */
      this.settings.rates.yaw.srate = YAW_TIP_RATE / 10;
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    });
  }

  /*
   * A name is typed, not flown. The stick menu cannot enter one, so this is
   * a small overlay with a field. Resolves to the stored name, or null if
   * they cancel.
   */
  askName({ title, detail } = {}) {
    return this.askForm({
      title: title || str('ui.your_name'),
      detail: detail || str('ui.posted_times_and_published_tracks_carry'),
      confirmLabel: str('ui.save'),
      fields: [{
        key: 'name',
        label: '',
        value: readPilotName() || '',
        maxLength: 24,
        placeholder: str('ui.name'),
        autocomplete: 'nickname',
        rules: nameRules(),
        save: writePilotName,
      }],
    }).then((values) => (values ? values.name : null));
  }

  /*
   * THE UNSAVED GUARD on a report form.
   *
   * Escape, a click on the backdrop and Cancel all used to throw a typed
   * report away the instant they were touched. The backdrop is the one
   * that actually hurt: reaching for a field and missing it by a few
   * pixels destroyed everything the pilot had written, with no warning
   * and nothing to undo. It was reported by somebody who had retyped the
   * same ticket several times before they worked out what was eating it.
   *
   * So a form with anything in it asks first. The form is HIDDEN rather
   * than rebuilt, so its nodes and every value in them stay alive: Keep
   * editing puts the pilot back exactly where they were, mid sentence,
   * with the caret in the field they left. Send it hands them back to the
   * form and then submits, so a draft that fails validation lands on the
   * form's own error line instead of vanishing behind a confirmation.
   * Discard is the only path that loses anything and it takes a
   * deliberate click on a button that says so.
   *
   * An untouched form closes silently. Asking somebody who typed nothing
   * whether they really meant it is how a guard teaches people to click
   * through guards without reading them.
   *
   * Returns true when it asked, false when it let the close through.
   */
  confirmDiscard(box, { dirty, submit, discard }) {
    if (!dirty()) {
      discard();
      return false;
    }
    const panel = el('div', 'name-dialog-box bug');
    panel.append(el('h2', null, str('ui.keep_this_report')));
    panel.append(el(
      'p',
      'lede',
      str('ui.you_have_written_something_that_has'),
    ));
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', str('ui.send_it'));
    const keep = btn('name-dialog-btn', str('ui.keep_editing'));
    const drop = btn('name-dialog-btn danger', str('ui.discard'));
    row.append(send, keep, drop);
    panel.append(row);
    /* Back to the form, untouched. Also what Escape means while this is
     * up: the least destructive reading of "not that". */
    const restore = () => {
      panel.remove();
      box.style.display = '';
      this.discarding = null;
    };
    this.discarding = restore;
    send.addEventListener('click', () => {
      restore();
      submit();
    });
    keep.addEventListener('click', restore);
    drop.addEventListener('click', () => {
      this.discarding = null;
      discard();
    });
    box.style.display = 'none';
    this.nameDialog.append(panel);
    keep.focus();
    return true;
  }

  closeNameDialog(value) {
    if (this.nameKeyHandler) {
      this.nameDialog.removeEventListener('keydown', this.nameKeyHandler, true);
      this.nameKeyHandler = null;
    }
    if (this.nameClickHandler) {
      this.nameDialog.removeEventListener('click', this.nameClickHandler);
      this.nameClickHandler = null;
    }
    this.nameDialog.hidden = true;
    this.nameDialog.textContent = '';
    /* Any route out of the dialog retires the unsaved guard with it, or a
     * stale restore would hide the next form behind a panel that is no
     * longer in the document. */
    this.discarding = null;
    const done = this.nameWait;
    this.nameWait = null;
    this.bugFiling = false;
    if (done) {
      done(value);
    }
    this.syncChips();
    this.renderMenu();
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
    const roomBar = Boolean(this.roomBarView) && !dialog && this.screen !== 'flight';
    if (this.roomBar) {
      this.roomBar.hidden = !roomBar;
    }
    /* A room bar asking for the reload says it already, for the room. */
    if (this.updateBar) {
      this.updateBar.hidden = dialog || !this.updateReady || this.screen === 'flight' || (roomBar && this.roomBarView.reload);
    }
    /* The dock takes the second slot when there is a chip in the first and
     * the corner when there is not, which is the title. Written as a class
     * rather than as a top in pixels here, so the status bar's own offset
     * stays in the stylesheet with the rest of the stacking. */
    if (this.musicDock) {
      this.musicDock.classList.toggle('under-chip', Boolean(bug));
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

  syncMusicDock() {
    if (!this.musicDock) {
      return;
    }
    const dialog = this.nameDialog && !this.nameDialog.hidden;
    const hide = dialog
      || this.screen === 'calibrate'
      || this.screen === 'padpick'
      || !this.settings.sound;
    this.musicDock.hidden = hide;
    this.musicDock.classList.toggle('on-flight', this.flying());
    const muted = this.settings.musicLevel <= 0;
    this.musicDock.classList.toggle('is-muted', muted);
    const name = (this.musicNow && this.musicNow.name) || MENU_TRACKS[0].name;
    this.musicTitle.textContent = name;
    /* The name, because it ellipsises, and then what the click does. */
    this.musicTitle.title = muted ? str('ui.click_to_unmute', { name }) : str('ui.click_to_mute', { name });
  }

  bugSnapshot() {
    const s = this.settings || {};
    const seat = s.map === 'track' ? activeCourseSummary() : null;
    const gpu = this.gpuInfo || {};
    let href = '';
    try {
      href = String(window.location.href || '').slice(0, 300);
    } catch (e) {
      href = '';
    }
    let userAgent = '';
    try {
      userAgent = String(navigator.userAgent || '').slice(0, 180);
    } catch (e) {
      userAgent = '';
    }
    /*
     * THE FAULT THAT STOPPED THE FLIGHT, IF ONE DID.
     *
     * main.js wraps the frame body once and records the first thrown fault
     * on window.__frameFault. The comment beside it says the fault is
     * "recorded for the bug report, which is the one path that carries a
     * fault off this machine". It was not. This function never read it, so
     * the mechanism was built, the banner told the pilot to press F8, and
     * the ticket that arrived looked like every other ticket.
     *
     *   bug-579a663f: "when I really hardly crash the drone the game just
     *   freezes"
     *
     * That is the exact symptom the wrapper was written for, because a
     * frame body that throws at the same line every frame draws nothing:
     * the last picture stays on screen for ever. Whether it is what
     * happened to that pilot is unknowable, because their report could not
     * carry the one field that would have said so. The next one can.
     *
     * Only present when there is a fault, so an ordinary report does not
     * grow an empty field, and clipped hard: the board caps a context at
     * 8000 characters over 32 keys, and a stack is the only thing here
     * with no natural length.
     */
    let fault = null;
    try {
      const f = window.__frameFault;
      if (f && f.message) {
        fault = {
          message: String(f.message).slice(0, 300),
          /* The top frames only. WHERE it threw is the whole question and
           * everything below is the loop that called it. */
          stack: String(f.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400),
          atMs: Number(f.atMs) || 0,
        };
      }
    } catch (e) {
      /* The shell itself is what broke. A report with no fault field is
       * still worth more than no report at all. */
    }
    /* The last aircraft crash and the last uncaught page errors, if either
     * was recent. Written down when they happened rather than read now,
     * because by the time F8 is pressed the wreck is under a menu or
     * already reset (bug-484f7119). One key, only when there is something
     * in it, clipped by share/crashrecord.js to fit the same cap. */
    const crash = crashRecord.report();
    return {
      href,
      screen: this.screen,
      map: s.map || '',
      ...(fault ? { fault } : {}),
      ...(crash ? { crash } : {}),
      courseId: (seat && (seat.shareId || (seat.doc && seat.doc.id))) || '',
      courseName: (seat && seat.name) || '',
      flightMode: s.flightMode || '',
      /* The rate profile, because the report that started this screen's
       * rewrite was about rates and did not carry them: an agent reading
       * "cannot set my rates" had no way to see what the pilot was on. */
      rates: ratesSummary(s.rates || {}),
      /*
       * The throttle curve, spelled out. "Flight feel: throttle is touchy"
       * arrived with a rates line that says nothing about the throttle
       * unless a cap is already on, so the one setting that answers the
       * complaint was the one thing the report could not carry.
       */
      throttle: throttleSummary(s.rates || {}, s.airframe),
      /*
       * THE SLIDER'S POSITION, and it belongs in the report for the same
       * reason the throttle curve does: this is the one field that tells the
       * difference between "the shipped quad is too floaty" and "I have
       * already dragged this to 180 and it is STILL too floaty". The first
       * is an opinion about a default, the second is a measurement of one.
       */
      weight: clampWeight(s.weight),
      /* And the absolute multiple of 9.80665 that weight became on this
       * airframe, because the base has moved once already and "weight 100"
       * in a ticket from before the move and one from after it are
       * different machines. Both numbers, always. */
      gravityScale: gravityScaleFor(s.weight, s.airframe),
      /*
       * HOW THE STICKS GOT HERE, which is the field five feel reports were
       * missing and the reason they read as five opinions about one quad.
       *
       * They were not. Reconstructed from the rate profile and the user
       * agent afterwards, they were a radio, a keyboard and two sets of
       * thumbs, and three of the five words described the transducer rather
       * than the aircraft: "stiff" is what analogMag's 0.34 ceiling does to
       * a keyboard, "floppy" is a sprung thumb on glass. Every one of those
       * numbers was already measured and none of them was written down.
       *
       * padHz is the one to read first. The RC grid handed to Betaflight is
       * a fixed 250 Hz and the consumer side is frame rate independent
       * (measured, PROGRESS.md round 19), so the grid is not the variable.
       * What varies is how fresh the value on each slot is, and that is a
       * property of the browser, the driver and the radio's own USB report
       * rate. A padHz sitting at the frame rate means the browser is
       * rAF-locked on gamepad input and feedforward, which is the
       * derivative of the setpoint, is seeing an impulse train at frame
       * rate. That is twitchy, from code that did not change.
       */
      stick: this.stickProbe ? this.stickProbe() : null,
      graphics: s.graphics || '',
      cameraAngle: s.cameraAngle,
      cameraFov: s.cameraFov,
      packVoltage: s.packVoltage,
      link: s.link || '',
      gpu: gpu.display || gpu.name || '',
      userAgent,
      viewport: {
        w: window.innerWidth || 0,
        h: window.innerHeight || 0,
        dpr: window.devicePixelRatio || 1,
      },
    };
  }

  /*
   * Pause first if they were in the air, so typing does not fly the quad,
   * then open the form. Snapshot the context BEFORE pausing so an F8 from
   * flight still records screen: flight.
   */
  openBugReport() {
    if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
      return;
    }
    this.bugFiling = true;
    const context = this.bugSnapshot();
    if (this.screen === 'flight') {
      this.act('pause');
      this.show('paused');
    }
    this.askBugReport(context);
  }

  askBugReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const box = el('div', 'name-dialog-box bug');
    box.append(el('h2', null, str('ui.report_a_bug')));
    box.append(el(
      'p',
      'lede',
      str('ui.title_and_what_happened_are_enough'),
    ));
    /* The other door. The chip says give feedback as well as report a bug,
     * and a pilot who came to say how the quad flies should not have to
     * dress an opinion up as a defect: this hands them to the flight feel
     * form, which asks the one question they came to answer. */
    const feelDoor = btn('name-dialog-door', str('ui.just_here_to_say_how_it'));
    box.append(feelDoor);

    /*
     * WHAT THE REPORT ALREADY KNOWS, SAID ON THE FORM. A pilot who presses
     * F8 over a wreck sees the pause menu cover it and the banner go, and
     * reads that as the crash being gone (bug-484f7119). It is not, and
     * neither is the record of it: say so, in the form, where they look.
     * Nothing is sent until they press Send. A page error or a frame fault
     * opens the form on Crash or freeze, the kind that names it; an
     * aircraft crash does not, because a wreck is the game working and a
     * report written after one is usually about how it flew or broke.
     */
    const crashNow = context && context.crash;
    const pageFault = Boolean((context && context.fault) || (crashNow && crashNow.errors));
    if (crashNow && crashNow.craft) {
      box.append(el('p', 'lede', str('ui.bug_crash_attached', { age: Math.round(crashNow.craft.ageS) })));
    }
    if (pageFault) {
      const message = context.fault ? context.fault.message : crashNow.errors[crashNow.errors.length - 1].message;
      box.append(el('p', 'lede', str('ui.bug_error_attached', { message })));
    }

    const kindLabel = el('p', 'name-dialog-label', str('ui.kind'));
    const kind = document.createElement('select');
    kind.className = 'name-dialog-input';
    const startKind = pageFault ? 'crash' : 'wrong';
    for (const opt of BUG_KINDS) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === startKind) {
        o.selected = true;
      }
      kind.append(o);
    }

    const titleLabel = el('p', 'name-dialog-label', str('ui.title'));
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'name-dialog-input';
    title.maxLength = 120;
    title.placeholder = str('ui.short_specific');
    title.autocomplete = 'off';

    const whatLabel = el('p', 'name-dialog-label', str('ui.what_happened'));
    const what = document.createElement('textarea');
    what.className = 'name-dialog-input name-dialog-area';
    what.maxLength = 4000;
    what.rows = 4;
    what.placeholder = str('ui.what_you_saw_heard_or_could');

    const expectedLabel = el('p', 'name-dialog-label', str('ui.what_you_expected_optional'));
    const expected = document.createElement('textarea');
    expected.className = 'name-dialog-input name-dialog-area';
    expected.maxLength = 2000;
    expected.rows = 2;

    const stepsLabel = el('p', 'name-dialog-label', str('ui.how_to_reproduce_optional'));
    const steps = document.createElement('textarea');
    steps.className = 'name-dialog-input name-dialog-area';
    steps.maxLength = 2000;
    steps.rows = 2;

    const nameLabel = el('p', 'name-dialog-label', str('ui.your_name_optional'));
    const reporter = document.createElement('input');
    reporter.type = 'text';
    reporter.className = 'name-dialog-input';
    reporter.maxLength = 24;
    reporter.autocomplete = 'nickname';
    reporter.value = readPilotName() || '';
    reporter.placeholder = str('ui.leave_blank_to_stay_anonymous');

    /* Screenshots: Ctrl+V anywhere in this box, a drop, or a file. The
     * tray listens on the box, so a paste into the textareas above counts. */
    const shots = createShotTray(box);

    const err = el('p', 'name-dialog-err', '');
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', str('ui.send'));
    const cancel = btn('name-dialog-btn', str('ui.cancel'));
    row.append(send, cancel);
    box.append(
      kindLabel, kind,
      titleLabel, title,
      whatLabel, what,
      expectedLabel, expected,
      stepsLabel, steps,
      el('p', 'name-dialog-label', str('ui.shots_label')), shots.node,
      nameLabel, reporter,
      err, row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    /* Same in-flight guard the feel dialog carries: a ticket that is still
     * POSTing must not lose its dialog to Escape, the backdrop or Cancel,
     * or it lands twice from a pilot who thought it never left. */
    let sending = false;
    const finish = (value) => {
      this.closeNameDialog(value);
    };
    /* Anything the pilot actually wrote. The name is not in this list: it
     * is prefilled from the stored pilot name, so a form carrying only
     * that is an untouched form.
     *
     * `sent` retires the guard the moment the ticket lands. The success
     * screen replaces the form's children but the input nodes survive
     * detached, values and all, so without this Escape on the Sent screen
     * would ask whether to keep a report that is already on the board. */
    let sent = false;
    const isDirty = () => !sent && Boolean(
      title.value.trim() || what.value.trim() || expected.value.trim() || steps.value.trim()
      || shots.count(),
    );
    /* Every close a pilot can trip goes through the guard, and the guard
     * lets an empty form straight through. See confirmDiscard. */
    const tryClose = (after) => {
      if (sending || this.discarding) {
        return;
      }
      this.confirmDiscard(box, {
        dirty: isDirty,
        submit: () => submit(),
        discard: after,
      });
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (sending) {
        return;
      }
      /* Escape over the guard is Keep editing, not a second answer to a
       * question about losing work. */
      if (this.discarding) {
        this.discarding();
        return;
      }
      tryClose(() => finish(null));
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      /* A stray backdrop click is what loses a report in the first place,
       * so while the guard is up the backdrop does nothing at all. */
      if (e.target === this.nameDialog && !sending && !this.discarding) {
        tryClose(() => finish(null));
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    cancel.addEventListener('click', () => tryClose(() => finish(null)));
    feelDoor.addEventListener('click', () => {
      tryClose(() => {
        finish(null);
        this.openFeelReport();
      });
    });
    const submit = async () => {
      err.textContent = '';
      if (title.value.trim().length < 8) {
        err.textContent = str('ui.a_title_needs_at_least_eight');
        title.focus();
        return;
      }
      if (what.value.trim().length < 20) {
        err.textContent = str('ui.say_what_happened_at_least_a');
        what.focus();
        return;
      }
      sending = true;
      send.disabled = true;
      cancel.disabled = true;
      shots.lock(true);
      send.textContent = str('ui.sending');
      try {
        const payload = {
          kind: kind.value,
          title: title.value,
          what: what.value,
          expected: expected.value,
          steps: steps.value,
          reporter: reporter.value,
          context,
          images: await shots.dataUrls(),
        };
        const posted = await submitBug(payload);
        sending = false;
        sent = true;
        box.textContent = '';
        box.append(el('h2', null, str('ui.sent')));
        box.append(el(
          'p',
          'lede',
          str('ui.ticket_is_on_the_board_thanks', { id: posted.id }),
        ));
        const doneRow = el('div', 'name-dialog-row');
        const close = btn('name-dialog-btn on', str('ui.close'));
        close.addEventListener('click', () => finish(posted));
        doneRow.append(close);
        box.append(doneRow);
        close.focus();
      } catch (e) {
        sending = false;
        send.disabled = false;
        cancel.disabled = false;
        shots.lock(false);
        send.textContent = str('ui.send');
        err.textContent = e.message || str('ui.the_board_could_not_take_that');
      }
    };
    send.addEventListener('click', submit);
    title.focus();
  }

  /*
   * Everything the tune work needs to read a feel report: the bug context
   * plus which tune was flown, what the pilot has done to it, and the PID
   * values the module was actually flying, from the readback rather than
   * the menu. A feel report without its numbers is a mood; with them it is
   * a data point.
   */
  feelSnapshot() {
    const s = this.settings || {};
    return {
      ...this.bugSnapshot(),
      tune: s.tune || '',
      tuneName: tuneById(s.tune).name,
      pids: pidsSummary(s.pids, s.tune),
      pidsLive: this.pidsLive,
      bestLapMs: Number.isFinite(this.resultsFastest) ? this.resultsFastest : null,
    };
  }

  /*
   * The flight feel question. Asks itself ONCE, ever: after the first
   * finished race, from showResults, and the flag flips the moment the
   * dialog opens, whatever is done with it. After that it is a row on
   * Results and on the pause menu, because an automatic prompt that keeps
   * coming back is how a pilot learns to close dialogs without reading
   * them.
   */
  maybeOfferFeel() {
    if (this.settings.feelAsked) {
      return;
    }
    /* Let the results screen land first. A record celebration with a form
     * on top of it is a form remembered as an interruption. */
    setTimeout(() => {
      if (this.settings.feelAsked || this.screen !== 'results') {
        return;
      }
      if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
        return;
      }
      this.openFeelReport();
    }, 1400);
  }

  openFeelReport() {
    if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
      return;
    }
    /* Opened is asked, on either path: the automatic offer never returns,
     * and a pilot who found the row does not need the popup either. */
    if (!this.settings.feelAsked) {
      this.settings.feelAsked = true;
      saveSettings(this.settings);
    }
    /* No pause-first branch like openBugReport's: F8 reaches that one from
     * flight, while this one is only reachable from the paused and results
     * menus and its automatic offer requires the results screen. */
    this.askFeelReport(this.feelSnapshot());
  }

  askFeelReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const FEELS = [
      { id: 'floppy', label: str('ui.floppy') },
      { id: 'soft', label: str('ui.soft') },
      { id: 'right', label: str('ui.about_right') },
      { id: 'stiff', label: str('ui.stiff') },
      { id: 'twitchy', label: str('ui.twitchy') },
    ];
    const ISSUES = [
      { id: 'sluggish', label: str('ui.slow_to_answer_the_stick') },
      { id: 'bounce', label: str('ui.bounces_back_after_a_stop') },
      { id: 'propwash', label: str('ui.wobbles_in_propwash') },
      { id: 'drift', label: str('ui.drifts_off_attitude') },
      { id: 'yaw', label: str('ui.yaw_is_lazy') },
      { id: 'throttle', label: str('ui.throttle_is_touchy') },
      /*
       * FLOATY GETS ITS OWN CHIP, because it kept arriving in the free text
       * box instead. "About right" plus "its much too floaty" typed
       * underneath is a report the chip rows could not carry, and the row
       * below can now answer it on the spot the way the throttle row does.
       */
      { id: 'floaty', label: str('ui.floaty_carries_too_far') },
      { id: 'locked', label: str('ui.locked_in_no_complaints') },
    ];

    const box = el('div', 'name-dialog-box bug feel');
    box.append(el('h2', null, str('ui.how_does_it_fly')));
    box.append(el(
      'p',
      'lede',
      str('ui.one_honest_word_steers_the_tune', { tuneName: context.tuneName }),
    ));

    let feel = null;
    const issues = new Set();
    const chipRow = (options, onPick) => {
      const wrap = el('div', 'feel-chips');
      const chips = new Map();
      for (const opt of options) {
        const chip = btn('feel-chip', opt.label);
        chip.addEventListener('click', () => {
          onPick(opt.id, chips);
        });
        chips.set(opt.id, chip);
        wrap.append(chip);
      }
      return { wrap, chips };
    };
    const feelRow = chipRow(FEELS, (id, chips) => {
      feel = feel === id ? null : id;
      for (const [cid, chip] of chips) {
        chip.classList.toggle('on', cid === feel);
      }
    });
    /*
     * THE ONE COMPLAINT THIS SHELL CAN ANSWER ON THE SPOT.
     *
     * "Throttle is touchy" has been a chip on this form all along, and the
     * setting that answers it has been compiled in, wired up and two screens
     * away all along too, defaulting OFF. A pilot reported it, we read the
     * report a day later and replied with the name of a menu row. That round
     * trip is the bug.
     *
     * So the row is offered here, at the moment the chip is ticked, and only
     * when it would actually do something: a pilot who has already capped
     * their throttle is complaining about something else and must not be
     * told to do the thing they did. The report still sends either way. This
     * is not a substitute for it, it is what the pilot gets to try tonight
     * instead of waiting for us.
     */
    const capHint = el('p', 'lede feel-hint', '');
    capHint.hidden = true;
    /*
     * THE SECOND COMPLAINT THIS SHELL CAN ANSWER ON THE SPOT, on exactly the
     * rule the throttle row above set: offered when the chip is ticked and
     * only when it would still do something. A pilot already sitting at the
     * top of the gravity range is telling us the DEFAULT is wrong, which is a
     * report worth having undisturbed, so they are not told to do the thing
     * they have done.
     */
    const airHint = el('p', 'lede feel-hint', '');
    airHint.hidden = true;
    const refreshAirHint = () => {
      const weight = clampWeight(this.settings.weight);
      const show = issues.has('floaty') && weight < WEIGHT_MAX;
      airHint.hidden = !show;
      if (show) {
        airHint.textContent = str('ui.the_weight_slider_between_the_sticks', { weight });
      }
    };
    const refreshCapHint = () => {
      const r = this.settings.rates || {};
      const cap = normaliseRates(r).throttleCap;
      const show = issues.has('throttle') && cap >= 100;
      capHint.hidden = !show;
      if (show) {
        const eased = hoverStickPercent(75, this.settings.airframe);
        const now = hoverStickPercent(100, this.settings.airframe);
        capHint.textContent = str('ui.this_quad_hovers_at_percent_of', { now: now.toFixed(1), eased: eased.toFixed(1) });
      }
    };
    const issueRow = chipRow(ISSUES, (id, chips) => {
      if (issues.has(id)) {
        issues.delete(id);
      } else {
        issues.add(id);
      }
      chips.get(id).classList.toggle('on', issues.has(id));
      refreshCapHint();
      refreshAirHint();
    });

    const wordsLabel = el('p', 'name-dialog-label', str('ui.in_your_own_words_optional'));
    const words = document.createElement('textarea');
    words.className = 'name-dialog-input name-dialog-area';
    words.maxLength = 2000;
    words.rows = 3;
    words.placeholder = str('ui.what_you_would_tell_the_person');

    const nameLabel = el('p', 'name-dialog-label', str('ui.your_name_optional'));
    const reporter = document.createElement('input');
    reporter.type = 'text';
    reporter.className = 'name-dialog-input';
    reporter.maxLength = 24;
    reporter.autocomplete = 'nickname';
    reporter.value = readPilotName() || '';
    reporter.placeholder = str('ui.leave_blank_to_stay_anonymous');

    const shots = createShotTray(box);

    const err = el('p', 'name-dialog-err', '');
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', str('ui.send'));
    const dismiss = btn('name-dialog-btn', str('ui.not_now'));
    row.append(send, dismiss);
    box.append(
      el('p', 'name-dialog-label', str('ui.the_quad_felt')),
      feelRow.wrap,
      el('p', 'name-dialog-label', str('ui.anything_specific_pick_any')),
      issueRow.wrap,
      capHint,
      airHint,
      wordsLabel, words,
      el('p', 'name-dialog-label', str('ui.shots_label')), shots.node,
      nameLabel, reporter,
      err, row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    /*
     * While the POST is in flight, nothing may close the dialog. Escape or
     * Not now during the await used to leave the report landing on the
     * board while the pilot watched the form vanish, believed nothing was
     * sent, and sent it again: a duplicate ticket per impatient click.
     * Cleared before the Thanks screen so Escape works there again.
     */
    let sending = false;
    const finish = (value) => {
      this.closeNameDialog(value);
    };
    /* A picked chip counts as much as a typed sentence here: this form is
     * meant to be answered in two clicks, so two clicks is a real answer
     * to lose. The name is prefilled and does not count. `sent` retires
     * the guard once it has landed, for the reason the bug form gives. */
    let sent = false;
    const isDirty = () => !sent && Boolean(feel || issues.size || words.value.trim() || shots.count());
    const tryClose = (after) => {
      if (sending || this.discarding) {
        return;
      }
      this.confirmDiscard(box, {
        dirty: isDirty,
        submit: () => submit(),
        discard: after,
      });
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (sending) {
        return;
      }
      if (this.discarding) {
        this.discarding();
        return;
      }
      tryClose(() => finish(null));
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      if (e.target === this.nameDialog && !sending && !this.discarding) {
        tryClose(() => finish(null));
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    dismiss.addEventListener('click', () => tryClose(() => finish(null)));
    const submit = async () => {
      err.textContent = '';
      if (!feel) {
        err.textContent = str('ui.pick_a_word_on_the_first');
        return;
      }
      const feelLabel = FEELS.find((f) => f.id === feel).label.toLowerCase();
      const picked = ISSUES.filter((i) => issues.has(i.id)).map((i) => i.label.toLowerCase());
      const lines = [str('ui.the_quad_felt_this_run', { feelLabel })];
      /*
       * WHERE THE SLIDER WAS, in the sentence and not only in the context
       * blob, because the owner asked for it there and because it is the one
       * number that turns a feel word into a measurement: "floaty at weight
       * 100" is a verdict on the default, and "floaty at 140" is a verdict
       * on the whole band. The absolute multiple rides along so a ticket
       * from before the base moved reads correctly beside one from after.
       */
      lines.push(str('ui.weight_slider_at_percent_which_is', { weight: context.weight, v2: context.gravityScale.toFixed(2) }));
      if (picked.length) {
        lines.push(str('ui.noticed', { v1: picked.join('; ') }));
      }
      if (words.value.trim()) {
        lines.push(words.value.trim());
      }
      sending = true;
      send.disabled = true;
      dismiss.disabled = true;
      shots.lock(true);
      send.textContent = str('ui.sending');
      try {
        const payload = {
          kind: 'feel',
          title: str('ui.flight_feel_2', { feelLabel, v2: picked.length ? `, ${picked[0]}` : '' }),
          what: lines.join('\n'),
          reporter: reporter.value,
          context,
          images: await shots.dataUrls(),
        };
        const posted = await submitBug(payload);
        sending = false;
        sent = true;
        box.textContent = '';
        box.append(el('h2', null, str('ui.thanks')));
        box.append(el(
          'p',
          'lede',
          str('ui.landed_with_your_tune_and_rates'),
        ));
        const doneRow = el('div', 'name-dialog-row');
        const close = btn('name-dialog-btn on', str('ui.close'));
        close.addEventListener('click', () => finish(posted));
        doneRow.append(close);
        box.append(doneRow);
        close.focus();
      } catch (e) {
        sending = false;
        send.disabled = false;
        dismiss.disabled = false;
        shots.lock(false);
        send.textContent = str('ui.send');
        err.textContent = e.message || str('ui.the_board_could_not_take_that');
      }
    };
    send.addEventListener('click', submit);
    /* Keyboard first, like every menu here: the first answer chip takes
     * focus, Tab walks the rest, Enter picks, Escape leaves. Enter cannot
     * fall through to the menu underneath; handleKey swallows everything
     * while a dialog is up. */
    const firstChip = feelRow.chips.values().next().value;
    if (firstChip) {
      firstChip.focus();
    }
  }

  /* Menu definitions are rebuilt on show so values read correctly. */
  /*
   * A STABLE NAME FOR EVERY ROW, so that nothing has to remember an index.
   *
   * items() is rebuilt from scratch on every render, and the lists change
   * length as they go: rows appear and vanish with the loaded track, the
   * board, the dirty flag and, on the bench, four filters. An index means
   * nothing across two of those rebuilds. Focus memory already learned this
   * the expensive way and started storing a label instead, which works until
   * two rows share one, and Save on the bench shares a label with nothing
   * while Back shares it with every screen in the product.
   *
   * The id is DERIVED rather than typed into seven hundred object literals,
   * for the same reason the palette is not repeated in seven hundred places:
   * one rule in one function is checkable, and a hand-stamped id is a thing
   * that can be forgotten on the next row somebody adds. Anything that
   * genuinely needs to name itself can still set `id` and win.
   *
   * The order is what the row already carries, most stable first. `action`
   * is a verb the shell already dispatches on and is stable by construction.
   * `key` is a firmware key on the bench and is unique in the catalog. Only
   * then the label, slugged. A collision gets a counter, which is stable as
   * long as the colliding rows keep their order, and rows that collide are
   * repeated section headings and Back, which do.
   */
  items() {
    return stampIds(this.buildItems(), this.screen);
  }

  buildItems() {
    const s = this.settings;
    if (this.screen === 'title') {
      /*
       * FIRST RUN IS TWO CHOICES AND CREDITS, not nine. Nothing here used
       * to tell visit one from visit one hundred, so a pilot who had never
       * held a stick got the same list as somebody coming back for a personal
       * best, with the one thing they needed sitting seventh. isFirstRun is a
       * signal the product already had and threw away: no stored settings, no
       * lap on record. Credits sits with the two choices so who made this is
       * readable before a lap is flown.
       */
      /*
       * The pad trouble row, above whichever title state is up. A pilot
       * whose radio cannot press anything is the person this row is most
       * for, and the first screen is where they are looking.
       *
       * On the gate it sits UNDER the two cards rather than over them, and
       * that is arithmetic rather than taste: renderMenu computes the row
       * offset as `items.length - rows.length`, so every card has to come
       * before every row or the cursor and the row list disagree by one.
       */
      const trouble = padTroubleItem(this.padInfo);
      /*
       * THE GATE. THREE PICTURES, AND NOTHING ELSE ON THE PAGE TO ANSWER.
       *
       * A pilot arriving does not open a menu wanting "Quad" or "Settings".
       * They want to race or they want to mess about, on one machine or the
       * other, and until that is answered every other row on this screen is
       * furniture. It used to be answered halfway down a list of eleven,
       * twice: once by the Race row and once by the Freestyle row, each of
       * which was really a location picker wearing a mode's name. Then it
       * was two card screens in a row. Now it is one, and WAYS is where the
       * three cards and the argument for them live.
       *
       * WHY CARDS AND NOT ROWS. The difference between these three is a
       * difference between PLACES, and a place is the thing a sentence is
       * worst at. Three menu rows ask somebody who has never flown any of
       * them to choose between words. The picker screens learned this
       * already, which is why the worlds are cards there; this is the same
       * lesson one screen earlier, where it matters most because it is the
       * first thing anybody sees.
       *
       * None of the three is `primary`. The bottom bar's button paints the
       * primary item, and a bar reading "Freestyle" under a card reading
       * "Freestyle" is the same choice drawn twice.
       *
       * No `note` either: the help column would print it floating over the
       * cards, and every word of it is already on the card in a place that
       * says which of the three it belongs to.
       */
      if (this.onGate()) {
        const rooms = this.friendsItems().length > 0;
        return [
          ...WAYS.filter((w) => rooms || !w.room).map((w) => ({
            label: w.label,
            card: w.id,
            art: w.art,
            svg: w.svg ?? craftSvg(airframeById(w.airframes[0])),
            blurb: w.blurb,
            facts: w.facts,
            action: w.action,
          })),
          ...(trouble ? [trouble] : []),
        ];
      }
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      const seat = m.id === 'track' ? activeCourseSummary() : null;
      /*
       * The course actions that used to appear and vanish here live on the
       * Courses screen and on Results, where the course itself is what the
       * player is looking at. FPV wiki opens the landing-site wiki. Report a bug
       * is a stable last row so testers can send a ticket from title.
       */
      /*
       * ONE ROW FOR THE PLACE, BECAUSE THE MODE IS ALREADY ANSWERED.
       *
       * This screen used to carry Race and Freestyle side by side, each
       * naming a location and each really asking the same question the gate
       * above now asks once. A pilot who had decided to race still had to
       * read a Freestyle row to get past it, and the two rows disagreed
       * about what the seat was: Race named the loaded track, Freestyle
       * named a remembered world that was not seated and would not be
       * flown.
       *
       * So there is one row, it belongs to the mode that was chosen, and it
       * names WHAT FLY WOULD LAUNCH rather than what was picked last. Track
       * in Race, Map in Freestyle, and the room behind each of them is the
       * one it always was.
       *
       * Fly stays first and stays the primary. It is the verb, it names what
       * it will launch, and it is never on the room cycle: overshooting into
       * a launch out of an unsaved firmware edit is the failure that rule
       * exists to prevent.
       */
      const world = seatedFreestyleMap(s);
      const modeRow = this.mode === 'freestyle'
        ? {
          label: str('ui.the_world'),
          value: world ? world.name : str('ui.not_loaded'),
          action: 'freestyle',
          /*
           * Labelled for the ROOM rather than for the choice, because there
           * is no longer a choice: the gate seats the only freestyle world
           * and this row is the door to the quad and the physics model. It
           * used to read "Map: Choose one", which sent a pilot into a
           * picker with one option in it.
           */
          note: world
            ? str('ui.your_quad_and_the_physics_model', { note: world.note })
            : str('ui.no_gates_pick_a_valley'),
        }
        : {
          label: str('ui.track'),
          value: seat ? seat.name : str('ui.choose_one'),
          action: 'courses',
          note: seat
            ? str('ui.and_every_other_track_gated_against', { name: seat.name })
            : str('ui.no_track_is_seated_yet_your'),
        };
      /*
       * THREE ROOMS AND A VERB, in place of twelve typographic equals.
       *
       * Tune, PIDs and Rates were built once and spread onto four screens,
       * so "where do I change my rates" had four correct answers with
       * different surrounding context, and only the Pause copies carried
       * the warning that changing mid-run resets you to the start line.
       * They are in exactly one room each now.
       *
       * Each room row carries a MANIFEST of what is inside it. The flat
       * list this replaces was an inventory, and a row of closed doors
       * would be a downgrade: the word "rates" still has to appear on the
       * front page or a pilot who knows what they want cannot see where to
       * go.
       *
       * Fly is the verb and stays first and stays the primary. It is never
       * a room, because overshooting a shoulder detent into a launch out of
       * an unsaved firmware edit is the failure that rule exists to
       * prevent.
       */
      /*
       * THE FIRST FLIGHT, WHICH IS NOW A VERB AND NOT A SCREEN.
       *
       * A pilot's first visit used to be met by its own three row menu:
       * First flight, I have flown before, Credits. That screen asked
       * whether they had flown before in order to decide what to show them,
       * which is a question about the product rather than about flying, and
       * it stood between them and the one question this shell actually
       * needs answered.
       *
       * So it is gone, and the guided flight it existed to offer is the
       * primary row here instead: same action, same three prompts, one
       * screen later and behind a choice they have already made.
       *
       * Race only, and only with a track under them, because the guide is
       * three lines that talk about gates and src/main.js retires it on the
       * first frame of a gateless world. Offering it in Freestyle would be
       * a row that promises a tutorial and delivers silence.
       */
      const guide = this.firstRun && this.mode === 'race' && this.seatMatchesMode();
      const flyRow = guide
        ? {
          label: str('ui.first_flight'),
          action: 'firstflight',
          primary: true,
          note: seat && seat.name
            ? str('ui.levelled_off_with_the_sticks_drawn', { name: seat.name })
            : str('ui.levelled_off_with_the_sticks_drawn_2'),
        }
        : { label: str('ui.fly_label'), action: 'fly', primary: true };
      return [
        ...(trouble ? [trouble] : []),
        flyRow,
        modeRow,
        ...this.friendsItems(),
        /*
         * THE TRICK LIST IS WITHDRAWN UNTIL THE SCORING IS SETTLED.
         *
         * Two rows opened it, this one and its twin in the Freestyle room,
         * and both are gone. The screen, its catalogue, its films and the
         * checks that cover it are all still here and still correct: what
         * was removed is the way in, because a list of what the scorer pays
         * for is a promise about a scorer that is not finished, and the
         * scoring switch one room over still wears a warning colour for the
         * same reason.
         *
         * When it comes back it belongs HERE, on the first screen a
         * freestyle pilot sees, and that is worth keeping written down. It
         * used to live only inside The town, one door further in than
         * anybody looks, and the report from real play was "I can't see the
         * catalogue of tricks, there is no UI element". There was one, behind
         * a door labelled with the name of a place. Restoring it is this
         * comment turned back into a row.
         */
        {
          label: machineLabel(s),
          value: machineValue(s),
          action: 'quad',
          note: str('ui.the_machine_tune_pids_camera_angle'),
        },
        {
          /*
           * "PILOT" IS THE ONE ROOM WHOSE NAME DOES NOT SAY WHAT IS IN IT,
           * and the thing in it is the single most reported subject on the
           * board.
           *
           * A pilot hunting for their radio scans this column and reads
           * Fly, Track, Quad, Settings, How to fly, FPV wiki, Tracks and
           * Times, Credits. Nothing there is a radio. Quad is the closest
           * word and it is the wrong room. So they conclude the product has
           * no calibration, which is what the owner concluded, and what
           * "I cant map my sticks to the correct commands, or cant find the
           * setting" was already saying a day before that.
           *
           * The note has said "your radio, calibration" all along, and a
           * note is only shown for the row under the cursor, so it is read
           * by somebody who has already guessed right. The label is what
           * gets scanned.
           *
           * The row id is built from `action` rather than the label, so
           * this costs no id and nothing that names rows has to move.
           */
          label: str('ui.settings'),
          value: readPilotName() || str('ui.not_set'),
          action: 'pilot',
          note: str('ui.you_and_your_radio_your_name'),
        },
        { label: str('ui.how_to_fly'), action: 'howto', note: str('ui.the_sticks_live_and_what_the') },
        {
          label: str('ui.fpv_wiki'),
          action: 'wiki',
          note: str('ui.the_closed_loop_the_plant_and'),
        },
        {
          label: str('ui.tracks_and_statistics'),
          action: 'leaderboard',
          note: str('ui.the_public_page_every_published_track'),
        },
        {
          label: str('ui.credits'),
          action: 'credits',
          note: str('ui.who_made_this_who_flew_it'),
        },
        /*
         * THE WAY BACK TO THE GATE, AND IT IS A ROW NOW.
         *
         * It was the Escape key and a line of legend text at the foot of
         * the screen. The text was a hit area, which nobody could tell by
         * looking at it: it sits in the row that reads "Move  Choose  Esc",
         * which is a key legend everywhere else in the shell, so a pilot
         * who had answered the gate had one visible route back and it was a
         * key. Reported as exactly that.
         *
         * It goes last, under Credits, because it is the only row that
         * leaves this screen upwards rather than opening something on it.
         * There was no room for an eleventh row here and there still is
         * not: this one is affordable because Report bug, give feedback
         * left the list at the same time. That form is the floating chip
         * again, on every screen except this one, and on F8.
         *
         * Named for where it lands rather than called Back, for the reason
         * legendFor gives: Back on the front page reads like it leaves the
         * game, and a pilot looking for the other mode or the other machine
         * is looking for the screen that offers both.
         */
        { label: this.gateLabel(), action: 'mode-gate', note: str('ui.the_three_cards_five_inch_racing') },
      ];
    }
    if (this.screen === 'howto') {
      return [{ label: str('ui.back'), action: 'back' }];
    }
    if (this.screen === 'friends') {
      /*
       * BETWEEN RUNS THE ROOM SCREEN IS ALSO THE WAY INTO THE AIR: Fly on
       * top once there is a room, the title's own Fly (act('fly'), so Track
       * mode gets its launch card), because the owner sat in a joined room
       * and found no way to start flying from it. In free flight, which is
       * where the card lands, the aircraft and the world go under the
       * room's own rows too. From a paused run the pause menu has all of
       * it, Resume first.
       */
      const between = this.returnTo !== 'paused';
      const seat = between && this.mode === 'freestyle';
      const row = this.friendsRow ? this.friendsRow() : null;
      const inRoom = Boolean(row && row.inRoom);
      const rows = this.friendsRows ? this.friendsRows() : [];
      /* A game's start row is the primary when a game card set the room up
       * (src/main.js friendsRows), and the cursor opens on it; Fly stays on
       * top but gives the screen's one primary up to it. */
      const started = rows.some((it) => it.primary);
      return [
        ...(between && inRoom ? [{ label: str('ui.fly_label'), action: 'fly', primary: !started, note: str('friends.fly_note') }] : []),
        ...rows,
        ...(seat ? this.roomSeatRows(inRoom) : []),
        { label: str('ui.back'), action: 'back' },
      ];
    }
    if (this.screen === 'rooms' || this.screen === 'roomnew') {
      return [...(this.roomRows ? this.roomRows(this.screen) : []), { label: str('ui.back'), action: 'back' }];
    }
    if (this.screen === 'credits') {
      return [{ label: str('ui.back'), action: 'back' }];
    }
    /*
     * MY TRACKS, which is what Track mode is: the tracks the pilot built in
     * the Alps and the Swiss valley, then the board's when there is a board,
     * and a new one. Each card is a thing to choose (courseCardRows says
     * what can be done with it); the rows under the strip are for the list
     * as a whole.
     *
     * A plane is offered only the tracks it fits, by the builder's own rule
     * (src/game/verify.js planesFor); the lede says so, and says where the
     * aircraft is changed, because a list that is filtered without saying
     * so reads as tracks that have disappeared.
     */
    if (this.screen === 'courses') {
      const af = airframeById(this.settings.airframe);
      if (this.coursesLede) {
        this.coursesLede.textContent = af.fixedWing
          ? str('ui.the_tracks_the_fits', { craft: af.name })
          : str('ui.every_track_here_is_yours_to');
      }
      const cards = [];
      for (const t of this.localCourses || []) {
        cards.push({
          label: t.name,
          note: str('ui.yours_in_gate', { world: mapById(t.map).name, gates: t.gates, v3: t.gates === 1 ? '' : 's' }),
          course: { kind: 'local', track: t },
          action: `local:${t.id}`,
        });
      }
      for (const t of this.cloudCourses || []) {
        const world = liveWorld(t.map);
        cards.push({
          label: t.name,
          note: world
            ? str('cloud.card_note', { world: world.name, author: t.author || str('ui.a_pilot') })
            : str('cloud.retired_world'),
          course: { kind: 'cloud', track: t },
          action: `cloud:${t.id}`,
        });
      }
      for (const t of this.boardCourses || []) {
        cards.push({
          label: t.name,
          note: str('ui.hung_in_choosing_it_flies_it_there', { world: mapById(t.map).name, author: t.author || str('ui.a_pilot') }),
          course: { kind: 'board', track: t },
          action: `board:${t.id}`,
        });
      }
      /* A card the player has chosen owns the list until they go back. The
       * cards themselves stay, so the strip still reads as where they are. */
      const chosen = this.cardSubject
        ? cards.find((c) => c.course && courseCardKey(c) === this.cardSubject)
        : null;
      if (chosen) {
        return [...cards, ...courseCardRows(chosen)];
      }
      /* New track asks which world first, in the list's place. */
      if (this.newTrackOpen) {
        return [
          ...cards,
          { label: str('ui.new_track_in_which_world'), section: true },
          ...MAPS.filter((m) => m.build).map((m) => ({
            label: m.name,
            action: `newtrack:${m.id}`,
            note: str('ui.an_empty_track_in_the_builder', { world: m.name }),
          })),
          /* A plane is offered a finished course too, one click from
           * flying it (src/builder/course.js casualCourse). */
          ...(airframeById(this.settings.airframe).fixedWing ? MAPS.filter((m) => m.build).map((m) => ({
            label: str('ui.casual_sky_course_in', { world: m.name }),
            action: `casualtrack:${m.id}`,
            note: str('ui.casual_sky_course_note', { world: m.name }),
          })) : []),
          { label: str('ui.back_to_the_list'), action: 'newtrack-back' },
        ];
      }
      return [
        ...cards,
        {
          label: str('ui.new_track'),
          action: 'newtrack',
          note: str('ui.build_one_choose_the_world_then'),
        },
        ...(this.cloudNext ? [{
          label: str('cloud.more_tracks'),
          action: 'cloud-more',
          note: str('cloud.more_tracks_note'),
        }] : []),
        {
          label: str('ui.tracks_and_statistics_on_the_web'),
          action: 'leaderboard',
          note: str('ui.the_public_page_for_sending_somebody'),
        },
        { label: str('ui.back'), action: 'back' },
      ];
    }
    /*
     * FREESTYLE. One town and no ceremony.
     *
     * There is deliberately no launch card here. Racing is a measured run and
     * earns a moment to check what it is measured as; freestyle has no clock,
     * no lap, no ghost and no board, so asking would be ceremony. The one row
     * under the grid is the quad, because that is the only thing a freestyle
     * pilot changes between flights, and the line under it is a readout:
     * SIM_ARCADE is a plant flag and is not gated on race mode, so arcade
     * changes a freestyle flight too and nothing else was saying so.
     */
    if (this.screen === 'tricks') {
      return this.trickRows().map((t) => ({
        label: t.name,
        value: `${formatScore(t.points)}`,
        note: `${t.status.tag}. ${t.difficulty}. ${t.how}`
          + str('ui.seen', { v1: VIEW_LABEL[t.view].replace('seen ', '') }),
        action: 'noop',
      }));
    }
    if (this.screen === 'freestyle') {
      /*
       * THE CARDS ONLY EXIST IF THERE IS A CHOICE.
       *
       * With one freestyle world this room drew one card, and a grid of one
       * card is not a picker, it is a picture of the place the pilot is
       * already seated in. The gate seats it directly now, so what is left
       * here is what a freestyle pilot actually comes looking for: the quad
       * and the physics model. The card machinery stays because the day a
       * second world lands it is a registry entry and nothing else.
       */
      const worlds = MAPS.filter((x) => x.mode === 'freestyle');
      const cards = worlds.length > 1 ? worlds.map((x) => ({
        label: x.name,
        note: x.note,
        map: x,
        action: `map:${x.id}`,
      })) : [];
      return [
        ...cards,
        /*
         * FIRST, because it is the only choice on this screen that changes
         * what the next two minutes ARE.
         *
         * AND IT WEARS THE WARNING WHEN IT IS SWITCHED ON. row-warn is the
         * amber instrument colour the file already uses for a row that is
         * telling a pilot something about the state of the machine rather
         * than offering them something (see padTroubleItem), and an
         * unfinished scorer is exactly that. It is on the ROW rather than
         * in a popup because a popup is dismissed once and then the pilot
         * flies for an hour: this stays amber for as long as the thing it
         * is warning about is on, and goes quiet the moment it is off.
         */
        {
          ...choice(
            str('ui.scoring'),
            scoringNote(s.freestyleScoring),
            FREESTYLE_SCORING,
            s.freestyleScoring,
            (id) => FREESTYLE_SCORING_LABEL[id],
            (id) => { s.freestyleScoring = id; },
          ),
          rowClass: s.freestyleScoring === 'off' ? undefined : 'row-warn',
          /* Enter opens the list rather than stepping it: this row is the
           * first thing the cursor lands on in this room, and switching an
           * unfinished feature on is a pick, not a nudge. See select(). */
          pickOnly: true,
        },
        /*
         * The Freestyle room's Trick list door, withdrawn with the one on
         * the title until the scoring is settled. See the note there for
         * why, and for where it goes back. It belonged beside the scoring
         * row above it, which is the row it is really about.
         */
        /*
         * A DOOR, not a copy, and it is spelled the way the other two rooms
         * that carry it spell it.
         *
         * It was labelled Tune and opened Quad, which was fine while Tune on
         * Quad was a picker. It stopped being fine when the picker moved:
         * Tune on Quad and on the pause menu opens the PIDs room, so a pilot
         * who had learned that pressed Tune here and landed on a different
         * screen with another Tune row to press. One label, two destinations.
         *
         * Pointing it at the PIDs room instead was the wrong repair and the
         * shell check said so in two lines: this was Freestyle's ONLY way
         * into Quad, so the camera, the flight mode, the aircraft and the
         * bench all went out of reach from here. The title and Before you
         * fly both solve this already with a row called Quad valued at the
         * tune's name, and what this row is IS that row. So it is that row.
         * What you are about to fly is still on it, as the value.
         */
        {
          label: machineLabel(s),
          value: machineValue(s),
          action: 'quad',
          note: str('ui.the_machine_its_tune_row_opens', { pids: SCREEN_TITLES.pids }),
        },
        /*
         * SETTABLE HERE, because there is nowhere else a freestyle pilot
         * can reach it.
         *
         * It was an info row pointing at the launch card, and freestyle
         * deliberately has no launch card: no clock, no lap, no board, so
         * nothing to declare. That left the one flag which DOES change a
         * freestyle flight as a read-only line naming a screen the pilot
         * could not get to. Reported as "physics model doesn't do
         * anything", and it did not.
         *
         * It is the same setting the launch card carries, so a race pilot
         * still meets it in the moment before a run where it decides what
         * the time counts as. This copy is not a duplicate of a value with
         * a home elsewhere: freestyle IS the other home.
         */
        choice(
          str('ui.physics_model'),
          s.flightStyle === 'arcade'
            ? str('ui.arcade_the_ideal_quad_no_propwash')
            : str('ui.expert_the_full_physics_propwash_gyro'),
          FLIGHT_STYLES,
          s.flightStyle === 'arcade' ? 'arcade' : 'expert',
          (id) => (id === 'arcade' ? str('ui.arcade') : str('ui.expert')),
          (id) => { s.flightStyle = id; },
        ),
        toggle(
          str('ui.crash_damage'),
          str('ui.crash_damage_note'),
          s.crashDamage !== false,
          (v) => { s.crashDamage = Boolean(v); },
        ),
        { label: str('ui.back'), action: 'back' },
      ];
    }

    /*
     * QUAD: the machine. Everything that is carried with a posted time.
     *
     * A DEPTH LADDER, not a flat list, and the rungs are numbered on screen
     * because the whole point is that a pilot can stop at the first one. A
     * beginner never leaves rung 1, one choice that sets a whole tune. A
     * tuner lives on rung 2, Betaflight's own simplified sliders. An expert
     * takes the door to rung 3, and it is visibly a door rather than a row
     * in a list.
     */
    if (this.screen === 'quad') {
      /*
       * The mid-run warning travels with the ROOM, not with one screen's
       * copy of a row. Pause used to reach Settings by a route that showed
       * the same Tune row WITHOUT the warning, so whether a pilot was told
       * that changing it resets them to the start line depended on which
       * of four doors they came through. A room reached from a paused run
       * says it, every row, every time.
       */
      const midRun = this.returnTo === 'paused';
      return [
        /*
         * Aircraft sits under the tune's own heading rather than under one
         * of its own, and the heading is renamed to cover both. Two reasons,
         * and the second is the real one. A machine and its tune are one
         * subject: the tune list below is the aircraft's, so a heading that
         * separated them would be drawing a line where the data does not
         * have one. And scripts/shell-check.js records this screen's
         * overflow and fails when it grows, which a heading of its own did:
         * 55 px to 135. The row is what the pilot needs; the heading was
         * decoration, and decoration is what gives way.
         */
        { label: str('ui.the_machine'), section: true },
        {
          ...craftItem(s, midRun && this.onHotSwap ? (id) => this.swapTo(id) : null),
          open: () => this.openCraftRow(midRun),
        },
        tuneItem(s, midRun),
        {
          label: str('ui.firmware_bench'),
          action: 'fc',
          note: str('ui.every_betaflight_4_5_1_key', { pids: SCREEN_TITLES.pids }),
        },
        { label: str('ui.camera'), section: true },
        stepper(
          str('ui.camera_angle'),
          /*
           * The yaw sentence is not a caveat, it is the main thing a pilot
           * needs to know before they crank this up, and the menu never said
           * it. A camera tilted up by t sees a pure yaw as sin(t) of image
           * roll and cos(t) of image yaw, which is geometry and is exactly
           * what a real tilted camera does. At 30 that is half. At 40 it is
           * nearly two thirds, which is the tilt a pilot wrote in about.
           */
          str('ui.how_far_the_camera_tilts_up', { CAMERA_ANGLE_MIN, CAMERA_ANGLE_DEFAULT, CAMERA_ANGLE_MAX, cameraAngle: s.cameraAngle, v5: Math.round(Math.sin(cameraTiltRad(s.cameraAngle)) * 100) }),
          `${s.cameraAngle} degrees`,
          (d) => {
            const before = s.cameraAngle;
            s.cameraAngle = clampCameraAngle(before + d);
            /* On the way UP across the threshold only, and only if the yaw
             * rate is above what would be offered. Stepping back down and up
             * again inside one session does not ask twice. */
            if (before < YAW_TIP_TILT
              && s.cameraAngle >= YAW_TIP_TILT
              && fullStickDeg(s.rates, 'yaw') > YAW_TIP_RATE
              && yawTipFixable(s.rates)
              && !this.yawTipAsked) {
              this.offerYawTip();
            }
          },
        ),
        choice(
          str('ui.field_of_view'),
          str('ui.wider_sees_more_narrower_magnifies_75'),
          CAMERA_FOVS,
          s.cameraFov,
          (n) => `${n} degrees vertical`,
          (n) => { s.cameraFov = n; },
        ),
        { label: str('ui.flight'), section: true },
        choice(
          str('ui.flight_mode'),
          str('ui.acro_sticks_are_rates_hands_off_2'),
          FLIGHT_MODES,
          s.flightMode === 'angle' ? 'angle' : 'acro',
          (id) => (id === 'angle' ? str('ui.angle') : str('ui.acro')),
          (id) => { s.flightMode = id; },
        ),
        toggle(
          str('ui.launch_control'),
          str('ui.betaflight_race_start_off_by_default'),
          Boolean(s.launchControl),
          (v) => { s.launchControl = Boolean(v); },
        ),
        /*
         * A SIGNPOST, not a copy. Rates are the pilot's, and configs/rates.js
         * says so in capitals: no tune here sets rates. Putting the real row
         * here would be the four-copies-of-Tune problem starting again, so
         * this row says where they are and what they are, and goes there.
         *
         * It stays, and one thing about it changed when the Aircraft row
         * landed above: "stay put when you switch tunes" was the whole of
         * the claim and is now only half of it. Rates are still the pilot's,
         * but changing the AIRCRAFT reseeds them if they are still the
         * outgoing machine's stock profile, because the maker ships 580 deg/s
         * on a racing whoop against Betaflight's 670 for a five inch. The
         * note says both.
         *
         * scripts/shell-check.js also walks freestyle to Quad to Rates and
         * back twice and asserts it lands where it started, so this row is
         * load bearing navigation as well as a signpost.
         */
        {
          label: str('ui.rates'),
          value: ratesSummary(s.rates),
          action: 'rates',
          note: str('ui.not_the_machine_s_rates_are', { pilot: SCREEN_TITLES.pilot }),
        },
        { label: str('ui.back'), action: 'back' },
      ];
    }

    /*
     * PILOT: you and your sticks. What survives changing the quad.
     */
    if (this.screen === 'pilot') {
      const ids = musicIds();
      const name = readPilotName();
      /* Signed in (src/share/account.js), the callsign is the name and the
       * account carries the pilot key, so those rows give way to the
       * account's. */
      const account = accountsAvailable() ? readAccount() : null;
      /* Same contract as Quad above. */
      const midRun = this.returnTo === 'paused';
      return [
        { label: 'You', section: true },
        choice(
          str('ui.language'),
          str('ui.language_note'),
          LOCALES,
          currentLocale(),
          (id) => LOCALE_NAMES[id] || id,
          (id) => {
            rememberLocale(id);
            window.location.reload();
          },
        ),
        ...(account ? accountRows(account) : [
          ...(accountsAvailable() ? [{
            label: str('account.sign_in'),
            value: str('account.sign_in_value'),
            action: 'accountsignin',
            note: str('account.sign_in_note'),
          }] : []),
          {
            label: str('ui.your_name'),
            value: name || str('ui.not_set'),
            action: 'setname',
            note: name
              ? str('ui.posted_times_and_published_tracks_carry')
              : str('ui.needed_to_publish_a_track_or', { nameRules: nameRules() }),
          },
          {
            label: str('ui.pilot_key'),
            value: str('ui.this_browser'),
            action: 'exportkey',
            note: str('ui.on_the_board_your_name_belongs'),
          },
          {
            label: str('ui.import_pilot_key'),
            action: 'importkey',
            note: str('ui.paste_a_key_exported_from_another'),
          },
        ]),
        ...(accountsAvailable() ? accountPageRows() : []),
        { label: str('ui.sticks'), section: true },
        {
          label: str('ui.choose_joystick'),
          /* 'Keyboard' is the pad picker's own sentinel, shown in the pilot's language. */
          value: (this.padInfo && this.padInfo.using && this.padInfo.using !== 'Keyboard') ? this.padInfo.using : str('ui.keyboard'),
          action: 'choosepad',
          note: padChooseNote(this.padInfo),
        },
        /*
         * MOUSE FLIGHT, beside the joystick because it is the other answer
         * to "what am I flying with". Its four adjustments appear only
         * while it is on, so the list a keyboard or radio pilot walks is
         * one row longer and no more.
         */
        toggle(
          str('ui.mouse_flight'),
          str('ui.mouse_flight_note'),
          s.mouseFlight,
          (v) => { s.mouseFlight = Boolean(v); },
        ),
        ...(s.mouseFlight ? [
          choice(
            str('ui.mouse_sensitivity'),
            str('ui.mouse_sensitivity_note'),
            MOUSE_SENS,
            s.mouseSens,
            (n) => `${n}%`,
            (n) => { s.mouseSens = n; },
          ),
          choice(
            str('ui.mouse_expo'),
            str('ui.mouse_expo_note'),
            MOUSE_EXPOS,
            s.mouseExpo,
            (n) => `${n}%`,
            (n) => { s.mouseExpo = n; },
          ),
          toggle(
            str('ui.mouse_invert'),
            str('ui.mouse_invert_note'),
            s.mouseInvert,
            (v) => { s.mouseInvert = Boolean(v); },
          ),
          choice(
            str('ui.mouse_centre'),
            str('ui.mouse_centre_note'),
            MOUSE_CENTRES,
            s.mouseCentre,
            (id) => str(`ui.mouse_centre_${id}`),
            (id) => { s.mouseCentre = id; },
          ),
        ] : []),
        { label: str('ui.calibrate_sticks'), action: 'calibrate', note: str('ui.centre_full_range_then_one_named') },
        /*
         * THE WAY BACK TO THE ONLY SCREEN THAT SHOWS A MAPPING.
         *
         * The wizard's check step draws the live gimbals, every axis, and
         * the reverse control, and it used to sit behind six steps. A pilot
         * who found a backwards channel afterwards had to redo the whole
         * calibration to reach it, with the same chance of the same wrong
         * push: "some are inverted and there's no option to change it".
         * This opens that step by itself, against the mapping already
         * saved, so a one channel repair costs one row instead of a minute.
         */
        {
          label: str('ui.check_sticks'),
          action: 'calibrate-check',
          note: str('ui.your_saved_mapping_live_without_calibrating')
            + str('ui.if_it_goes_the_wrong_way')
            + str('ui.moves_on_screen_one_key_puts'),
        },
        /*
         * WHICH STICK CARRIES WHICH CHANNEL, and it sits here because the
         * two rows above are the other two things a pilot does to their
         * sticks before flying.
         *
         * Four options fit inline as segments, which is the whole reason
         * modes 3 and 4 are offered: they are a row in a table rather than
         * a code path, and the strip has room. The note says plainly that a
         * radio does not need this, because a radio pilot who changes it
         * expecting their transmitter to follow would be confused by a
         * setting that only redraws the screen for them.
         */
        choice(
          str('ui.stick_mode'),
          str('ui.which_stick_is_throttle_and_which')
          + str('ui.mode_2_is_throttle_on_the')
          + str('ui.mode_1_puts_throttle_on_the')
          + str('ui.this_flies_the_thumb_sticks_and')
          + str('ui.own_a_radio_already_applies_its')
          + str('ui.so_for_a_radio_this_only'),
          STICK_MODES,
          s.stickMode,
          (n) => str('ui.mode', { n }),
          (n) => { s.stickMode = normaliseStickMode(n); },
        ),
        ratesItem(s, midRun),
        choice(
          str('ui.radio_link'),
          s.link === 'perfect'
            ? str('ui.no_radio_every_frame_arrives_exactly')
            : str('ui.hz_ms_delay_ms_jitter_records', { hz: LINK_PRESETS[s.link].hz, delayMs: LINK_PRESETS[s.link].delayMs, jitterMs: LINK_PRESETS[s.link].jitterMs }),
          Object.keys(LINK_PRESETS),
          s.link,
          (id) => LINK_PRESETS[id].label,
          (id) => { s.link = id; },
        ),
        /* The other half of the split, signposted. When you cut a list in
         * two you owe the reader a line saying where the rest went. */
        {
          label: str('ui.tune_pids_and_the_firmware'),
          action: 'quad',
          note: str('ui.those_belong_to_the_machine_not', { quad: SCREEN_TITLES.quad }),
        },
        { label: str('ui.screen'), section: true },
        graphicsItem(s),
        gpuItem(this.gpuInfo),
        choice(
          str('ui.render_scale'),
          str('ui.fewer_pixels_then_stretched_to_fit'),
          RENDER_SCALES,
          s.renderScale,
          (n) => (n >= 100 ? str('ui.native') : `${n}%`),
          (n) => { s.renderScale = n; },
        ),
        choice(
          str('ui.frame_cap'),
          str('ui.caps_how_often_the_world_is'),
          FPS_CAPS,
          s.fpsCap,
          (n) => (n === 0 ? str('ui.uncapped') : `${n} fps`),
          (n) => { s.fpsCap = n; },
        ),
        choice(
          str('ui.hud_style'),
          str('ui.hud_style_note'),
          HUD_STYLES,
          s.hudStyle,
          (id) => (id === 'osd' ? str('ui.hud_osd') : str('ui.hud_game')),
          (id) => { s.hudStyle = id; },
        ),
        choice(
          str('ui.peer_marks'),
          str('ui.peer_marks_note'),
          MARK_STYLES,
          s.peerMarks,
          (id) => str(`ui.peer_marks_${id}`),
          (id) => { s.peerMarks = id; },
        ),
        { label: str('ui.sound'), section: true },
        toggle(str('ui.sound'), str('ui.all_sound_motors_wind_music_and'), s.sound, (v) => { s.sound = v; }),
        stepper(str('ui.volume'), str('ui.overall_level_zero_to_ten'), `${s.volume}`, (d) => {
          s.volume = Math.max(0, Math.min(10, s.volume + d));
        }),
        stepper(str('catalog.motors'), str('ui.the_blade_pass_tone_you_fly'), `${s.motorLevel}`, (d) => {
          s.motorLevel = Math.max(0, Math.min(10, s.motorLevel + d));
        }),
        stepper(str('ui.wind'), str('ui.air_over_the_airframe_rises_with'), `${s.windLevel}`, (d) => {
          s.windLevel = Math.max(0, Math.min(10, s.windLevel + d));
        }),
        stepper(
          str('ui.music'),
          str('ui.recorded_tracks_in_flight_and_a'),
          s.musicLevel > 0 ? `${s.musicLevel}` : 'Off',
          (d) => { s.musicLevel = Math.max(0, Math.min(10, s.musicLevel + d)); },
        ),
        choice(
          str('ui.music_track'),
          s.musicTrack === 'rotation'
            ? str('ui.what_flies_a_random_start_then')
            : str('ui.what_flies_this_track_loops_until'),
          ids,
          s.musicTrack,
          (id) => (id === 'rotation' ? str('ui.rotation') : trackById(id).name),
          (id) => { s.musicTrack = id; },
        ),
        toggle(
          str('ui.binaural_tone'),
          str('ui.a_quiet_1000_hz_tone_6'),
          s.focusTone,
          (v) => { s.focusTone = v; },
        ),
        { label: str('ui.diagnostics'), section: true },
        toggle(
          str('ui.flight_log'),
          str('ui.record_the_run_for_download_as'),
          s.flightLog,
          (v) => { s.flightLog = v; },
        ),
        {
          label: str('ui.download_flight_log'),
          action: 'downloadflightlog',
          note: str('ui.writes_what_was_recorded_as_blackbox'),
        },
        { label: str('ui.back'), action: 'back' },
      ];
    }

    /*
     * STANDINGS. What the board knows about one track.
     *
     * The rows are the ACTIONS. The table itself is drawn above them by
     * paintStandings, because a leaderboard is a table and pretending forty
     * times are forty menu rows would make the cursor walk them one press at
     * a time to reach Back.
     */
    if (this.screen === 'standings') {
      const t = this.standingsFor;
      if (!t) {
        return [
          {
            label: str('ui.no_track_chosen'),
            info: true,
            disabled: true,
            note: str('ui.pick_a_track_in_the_race'),
          },
          { label: str('ui.back'), action: 'back' },
        ];
      }
      const rows = [];
      const times = this.standingsTimes || [];
      const best = times.length ? times[0] : null;
      rows.push({
        label: str('ui.fly_this_track'),
        action: 'standings-fly',
        primary: true,
        note: best
          ? str('ui.loads_and_takes_you_to_the_2', { name: t.name, formatTime: formatTime(best.lapMs), v3: best.name || str('ui.an_unnamed_pilot') })
          : str('ui.loads_and_takes_you_to_the', { name: t.name }),
      });
      /*
       * Racing a recorded lap is the one thing a standings table is FOR
       * that reading it cannot give you. Only offered on a time that
       * actually carries a ghost: the board stores them per lap and older
       * ones predate the feature.
       */
      const ghosts = times.filter((x) => x.hasGhost && x.id);
      if (ghosts.length) {
        rows.push({
          label: str('ui.race_the_record'),
          action: 'standings-ghost',
          note: str('ui.s_flown_as_a_ghost_beside', { v1: ghosts[0].name || str('ui.an_unnamed_pilot_2'), formatTime: formatTime(ghosts[0].lapMs) }),
        });
      }
      rows.push({
        label: str('ui.open_on_the_web'),
        action: 'card-board',
        note: str('ui.the_public_page_for_a_link', { name: t.name }),
      });
      rows.push({ label: str('ui.back'), action: 'back' });
      return rows;
    }

    /*
     * THE LAUNCH CARD. What this run counts as, before it is flown.
     *
     * Five rows, and every one of them is latched by main.js at run start or
     * hashed into recordKey(). The help column's first sentence is that key
     * rendered in English, because "your personal best is filed under
     * exactly this sentence" is the thing nobody was ever told.
     */
    if (this.screen === 'launch') {
      const seat = activeCourseSummary();
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      const trackName = seat && seat.name ? seat.name : m.name;
      return [
        {
          label: str('ui.track'),
          value: trackName,
          info: true,
          note: seat && seat.gates
            ? str('ui.gates_this_is_what_your_time', { gates: seat.gates })
            : str('ui.this_is_what_your_time_will'),
        },
        {
          label: machineLabel(s),
          value: machineValue(s),
          action: 'quad',
          note: str('ui.the_tune_the_pids_the_camera', { quad: SCREEN_TITLES.quad }),
        },
        { label: str('ui.what_this_run_counts_as'), section: true },
        choice(
          str('ui.laps'),
          str('ui.how_many_laps_a_run_lasts'),
          LAP_COUNTS,
          s.laps,
          (n) => `${n}`,
          (n) => { s.laps = n; },
        ),
        choice(
          str('ui.pack_charge'),
          str('ui.a_tired_pack_sags_harder_and'),
          PACK_VOLTAGES,
          s.packVoltage,
          (n) => str('ui.volts_per_cell', { n: n.toFixed(2) }),
          (n) => { s.packVoltage = n; },
        ),
        choice(
          str('ui.flight_model'),
          s.flightStyle === 'arcade'
            ? str('ui.arcade_the_ideal_quad_no_propwash_2')
            : str('ui.expert_the_full_physics_propwash_gyro_2'),
          FLIGHT_STYLES,
          s.flightStyle === 'arcade' ? 'arcade' : 'expert',
          (id) => (id === 'arcade' ? str('ui.arcade') : str('ui.expert')),
          (id) => { s.flightStyle = id; },
        ),
        toggle(
          str('ui.crash_damage'),
          str('ui.crash_damage_note'),
          s.crashDamage !== false,
          (v) => { s.crashDamage = Boolean(v); },
        ),
        choice(
          str('ui.radio_link'),
          s.link === 'perfect'
            ? str('ui.a_perfect_link_is_sharper_than')
            : str('ui.hz_ms_delay_ms_jitter', { hz: LINK_PRESETS[s.link].hz, delayMs: LINK_PRESETS[s.link].delayMs, jitterMs: LINK_PRESETS[s.link].jitterMs }),
          Object.keys(LINK_PRESETS),
          s.link,
          (id) => LINK_PRESETS[id].label,
          (id) => { s.link = id; },
        ),
        /* The ghost is a property of the run too: it is armed for this
         * launch and it is what you are racing. It was on the title, which
         * is the one screen with no run in front of it. */
        ...this.ghostItems(),
        ...this.liveItems(),
        {
          label: str('ui.fly_label'),
          action: 'launch-go',
          primary: true,
          note: recordSentence(s, trackName),
        },
        { label: str('ui.back'), action: 'back' },
      ];
    }

    if (this.screen === 'paused') {
      /* Resume is the button. The conditional Edit a copy that used to
       * appear here belongs on the Courses screen. Report a bug is the
       * chip in the corner, or F8, so this list stays put. Flight feel
       * sits by the tuning rows because "this feels off" is the moment a
       * pilot pauses, and the report carries the tune and PIDs they are
       * paused on. FPV wiki opens the landing-site wiki so a mid-flight
       * "why did that happen" does not have to quit the run. */
      /*
       * THE ONE COPY THAT EARNS ITS PLACE, and doors for the rest.
       *
       * The pause menu's job is not to be a second Settings screen. It is
       * to answer "what just happened, and does it feel wrong", so the
       * tuning a pilot pauses in order to reach stays one row away and
       * everything else becomes a door to a room rather than a copy of it.
       *
       * Tune keeps its row here because that IS the question, and because
       * this copy carries the mid-run warning that changing it puts the
       * quad back on the start line. PIDs and Rates are doors now: they
       * were the two of the four scattered copies whose surrounding
       * context differed, and the rooms carry the same warning through
       * MID_RUN_WARNING on the way in.
       */
      return [
        { label: str('ui.resume'), action: 'resume', primary: true },
        { label: str('ui.restart_run'), action: 'restart' },
        /* The swap in place, one row down from Resume, because the pause
         * menu is the door a radio and a thumb have to it. */
        {
          label: str('carousel.change_aircraft'),
          value: airframeById(s.airframe).short,
          action: 'hotswap',
          note: str('carousel.row_note'),
        },
        /* The hangar for the plane being flown: its power and its paint,
         * saved into the air where it is. */
        ...(paintable(s.airframe) ? [{
          label: str('hangar.customise'),
          action: 'customise',
          note: str('hangar.row_note'),
        }] : []),
        ...this.ghostItems(),
        ...this.liveItems(),
        ...this.friendsItems(),
        { label: str('ui.does_it_feel_wrong'), section: true },
        tuneItem(s, true),
        /*
         * RATES, ONE PRESS FROM THE PAUSE MENU, because that is when a pilot
         * knows they want them.
         *
         * They were two rooms away: Settings, then Rates. The question this
         * section asks is "does it feel wrong", and how far the sticks go is
         * half of every answer to it, so the row belongs beside the tune.
         * A DOOR, not a copy: the numbers and the curve live in one room and
         * shell-check asserts that they are editable on exactly one screen.
         *
         * No mid-run warning, unlike the Tune row above it. Rates no longer
         * put the quad back on the start line: see applySettings in
         * src/main.js, which re-seats the craft where it was instead of
         * resetting the run.
         */
        {
          label: str('ui.rates'),
          value: ratesSummary(s.rates),
          action: 'rates',
          note: str('ui.how_far_the_sticks_go_and_2'),
        },
        feelItem(),
        { label: str('ui.elsewhere'), section: true },
        {
          label: machineLabel(s),
          value: machineValue(s),
          action: 'quad',
          note: str('ui.pids_camera_flight_mode_and_the', { MID_RUN_WARNING }),
        },
        {
          /* Named for what is in it, as on the title. See there. */
          label: str('ui.settings'),
          value: ratesSummary(s.rates),
          action: 'pilot',
          /* Rates are the first thing in this room and they no longer cost
           * the run, so the blanket warning would be wrong more often than
           * right. The rows that still restart a run carry it themselves. */
          note: str('ui.rates_your_radio_graphics_and_sound'),
        },
        graphicsItem(s),
        { label: str('ui.how_to_fly'), action: 'howto' },
        { label: str('ui.fpv_wiki'), action: 'wiki', note: str('ui.the_plant_the_compiled_controller_and') },
        { label: str('ui.credits'), action: 'credits', note: str('ui.who_made_this_who_flew_it') },
        /* Track mode's own way out: the list the track was played from. */
        ...(s.map === 'track' ? [{ label: str('ui.my_tracks'), action: 'mytracks', note: str('ui.back_to_the_list_of_tracks') }] : []),
        { label: str('ui.quit_to_title'), action: 'title' },
      ];
    }
    /* A room's race has the shell's rows: its results are the room's, and
     * nothing on them posts to a board (src/main.js roomResultsRows). */
    if (this.screen === 'results' && this.roomResults && this.roomResultsRows) {
      return this.roomResultsRows();
    }
    if (this.screen === 'results') {
      /* The same rows on every race, greyed when an action does not apply,
       * and the way back to My tracks, which is where a pilot racing goes
       * next. */
      const listing = this.settings.map === 'track' ? liveListing() : null;
      /*
       * A world flown free has no track and no listing to post to, so the
       * track rows would all be greyed at once, which is rows of noise
       * rather than one useful disabled row. Freestyle is the same for the
       * same reason: no lap, nothing to upload.
       */
      if (this.osdMode === 'freestyle') {
        /*
         * A FREESTYLE RUN HAS SOMETHING TO POST NOW, which it never did
         * before: two minutes, a number at the end of it, and a board with
         * a table waiting for it. The five track actions still mean nothing
         * here, because there is no track, so the run keeps four rows.
         *
         * A run of nothing is not a score. The row says so rather than
         * being offered and refused by the board, which is the difference
         * between a menu that knows what it is doing and one that finds out.
         */
        const run = this.freestyleRun;
        const nothing = !run || !(run.total > 0) || !(run.tricks > 0);
        return [
          { label: str('ui.fly_again'), action: 'restart', primary: true },
          this.runPosted
            ? {
              label: this.runPosted.improved === false ? str('ui.your_best_still_stands') : str('ui.run_posted'),
              action: 'postrun',
              disabled: true,
              note: this.runPosted.improved === false
                ? str('ui.the_board_already_holds_a_better', { formatScore: formatScore(this.runPosted.score) })
                : str('ui.the_board_kept_that_run', { v1: this.runPosted.rank != null ? str('ui.rank', { rank: this.runPosted.rank }) : '' }),
            }
            : {
              label: str('ui.post_this_run'),
              action: 'postrun',
              /*
               * FREE FLIGHT IS REFUSED HERE, on the row, rather than by a
               * notice when the row is pressed. The shell's notice banner
               * only draws in flight, so a refusal raised from the results
               * screen is a press that does nothing at all. A row that says
               * why it is off is the same answer given before it is needed.
               */
              disabled: nothing || Boolean(run && run.assisted)
                || (run && run.timed === false),
              note: nothing
                ? str('ui.a_run_with_no_tricks_in')
                : (run && run.timed === false
                  ? str('ui.free_flight_has_no_clock_so')
                  : (run && run.assisted
                    ? str('ui.this_run_used_the_harness_hooks')
                    : str('ui.from_tricks_one_entry_per_pilot', { formatScore: formatScore(run.total), tricks: run.tricks }))),
            },
          {
            label: str('ui.open_tracks_and_statistics'),
            action: 'leaderboard',
            note: str('ui.every_published_track_and_the_times'),
          },
          feelItem(),
          { label: str('ui.back_to_title'), action: 'title' },
        ];
      }
      if (!listing) {
        return [
          { label: str('ui.fly_again'), action: 'restart', primary: true },
          feelItem(),
          { label: str('ui.back_to_title'), action: 'title' },
        ];
      }
      return [
        { label: str('ui.fly_again'), action: 'restart', primary: true },
        uploadAction(listing, {
          fastestMs: this.resultsFastest,
          timePosted: this.timePosted,
          airframe: this.settings.airframe,
        }),
        {
          label: str('ui.open_tracks_and_statistics'),
          action: 'leaderboard',
          disabled: !(listing && listing.published),
          note: listing && listing.name
            ? str('ui.the_public_page_for', { name: listing.name })
            : str('ui.the_public_page_a_track_has'),
        },
        feelItem(),
        { label: str('ui.my_tracks'), action: 'mytracks', note: str('ui.back_to_the_list_of_tracks') },
        { label: str('ui.back_to_title'), action: 'title' },
      ];
    }
    if (this.screen === 'rates') {
      /*
       * BETAFLIGHT CONFIGURATOR'S RATES TAB, in a menu.
       *
       * A rates TYPE and three numbers per axis, typed rather than picked
       * off a list. The lists were the bug: Max rate stopped at 1400 and
       * centre sensitivity at 140, so a pilot who flies 1500, or 850, or any
       * number the list did not happen to carry, could not enter it at all,
       * and a pilot who thinks in Betaflight RC Rate and Super Rate had no
       * row to put them in. Every range and every default here is
       * Configurator 10.10's own; see configs/rates.js.
       *
       * The numbers are the firmware's, at the firmware's resolution. One
       * arrow press is one uint8 step, which is ten deg/s in the deg/s
       * columns and a hundredth everywhere else, and a typed number that
       * falls between two of them is rounded to the one the quad can
       * actually be given rather than shown back as a rate nothing flies.
       */
      const r = s.rates;
      const split = Boolean(s.ratesSplitPitch);
      const hover = hoverStickPercent(r.throttleCap, this.settings.airframe);
      const tilt = Math.sin(cameraTiltRad(s.cameraAngle));
      const noteFor = (axis, key) => {
        const spec = rateField(r.type, key);
        const bits = [spec.note];
        if (key !== 'expo') {
          bits.push(str('ui.at_full_stick_this_axis_is', { fullStickDeg: fullStickDeg(r, axis) }));
        }
        if (axis === 'yaw' && key === 'srate') {
          bits.push(str('ui.quads_yaw_slower_than_they_roll', { cameraAngle: s.cameraAngle, v2: Math.round(tilt * 100), v3: Math.round(fullStickDeg(r, 'yaw') * tilt) }));
        }
        return bits.join(' ');
      };
      /* One editable field. Roll writes pitch too while the two are joined,
       * which is the only place the joining means anything: the profile
       * itself always carries three axes, exactly as the firmware does. */
      const rateRow = (axis, key) => number(
        rateField(r.type, key).label,
        noteFor(axis, key),
        rateField(r.type, key),
        r[axis][key],
        (v) => {
          r[axis][key] = v;
          if (!split && axis === 'roll') {
            r.pitch[key] = v;
          }
        },
      );
      const axisRows = (axis) => RATE_FIELDS.map((key) => rateRow(axis, key));
      /*
       * WHICH NAMED PROFILE IS FLYING, and it is worked out rather than
       * remembered.
       *
       * The row could have stored "the preset I last loaded" and gone stale
       * the moment a number moved under it. Instead it asks the library
       * whether anything in it flies exactly what is flying now, compared as
       * the CLI text the profile emits, which is the same comparison
       * src/main.js makes to decide whether a change reached the module. So
       * the row cannot claim to be on Bando while flying something else: the
       * instant a stick number moves it stops matching and says so.
       *
       * `pickOnly`, for the reason the Tune row carries it: this is a list
       * whose entries change how the quad flies, and Enter a row below where
       * it was meant must open it rather than step it.
       */
      const presets = listRatePresets();
      const loaded = presetMatching(r);
      const presetValue = loaded
        ? loaded.name
        : (ratesAreDefault(r) ? str('ui.stock') : str('ui.not_saved'));
      const presetRow = presets.length === 0
        ? {
          label: str('ui.preset'),
          value: str('ui.none_saved'),
          info: true,
          note: str('ui.save_the_numbers_below_under_a', { RATES_STORAGE_WARNING }),
        }
        : {
          ...choice(
            str('ui.preset'),
            str('ui.loading_one_sets_every_number_below', { v1: presets.length === 1 ? str('ui.one_saved_profile') : `${presets.length} saved profiles`, RATES_STORAGE_WARNING }),
            presets.map((p) => p.id),
            loaded ? loaded.id : '',
            (id) => (ratePresetById(id) || { name: presetValue }).name,
            (id) => {
              const pick = ratePresetById(id);
              if (pick) {
                s.rates = normaliseRates(pick.rates);
              }
            },
          ),
          pickOnly: true,
        };
      return [
        ...this.stickPathRow(),
        presetRow,
        choice(
          str('ui.rates_type'),
          str('ui.which_rate_system_the_numbers_below'),
          RATE_TYPES,
          r.type,
          (t) => RATE_TYPE_LABEL[t],
          (t) => { s.rates = profileForType(t, r); },
        ),
        toggle(
          str('ui.separate_pitch'),
          split
            ? str('ui.on_pitch_has_its_own_three')
            : str('ui.off_roll_and_pitch_share_one'),
          split,
          (on) => {
            s.ratesSplitPitch = on;
            if (!on) {
              for (const key of RATE_FIELDS) {
                r.pitch[key] = r.roll[key];
              }
            }
          },
        ),
        { label: split ? str('ratespanel.roll') : str('ui.roll_and_pitch'), section: true },
        ...axisRows('roll'),
        ...(split ? [{ label: str('ui.pitch'), section: true }, ...axisRows('pitch')] : []),
        { label: 'Yaw', section: true },
        ...axisRows('yaw'),
        { label: str('ui.throttle'), section: true },
        choice(
          str('ui.throttle_limit'),
          r.throttleCap >= 100
            ? str('ui.off_this_quad_is_almost_nine', { hover: hover.toFixed(1) })
            : str('ui.betaflight_scale_limit_full_stick_commands', { throttleCap: r.throttleCap, hover: hover.toFixed(1) }),
          THROTTLE_CAP_CHOICES,
          r.throttleCap,
          (n) => (n >= 100 ? 'Off' : `${n}%`),
          (n) => { r.throttleCap = n; },
        ),
        /* Betaflight's own throttle curve, thr_mid and thr_expo, the two
         * uint8s fc/rc.c bends the throttle stick with. Compiled and live
         * all along; a board report asked where they were. The hover figure
         * quoted by the limit row above is measured on the straight factory
         * curve, so a bent curve moves where hover sits on the stick. */
        number(
          THROTTLE_CURVE_FIELDS.thrMid.label,
          str('ui.this_quad_hovers_near_percent_of', { note: THROTTLE_CURVE_FIELDS.thrMid.note, hover: hover.toFixed(1) }),
          THROTTLE_CURVE_FIELDS.thrMid,
          r.thrMid,
          (v) => { r.thrMid = v; },
        ),
        number(
          THROTTLE_CURVE_FIELDS.thrExpo.label,
          THROTTLE_CURVE_FIELDS.thrExpo.note,
          THROTTLE_CURVE_FIELDS.thrExpo,
          r.thrExpo,
          (v) => { r.thrExpo = v; },
        ),
        { label: str('ui.presets'), section: true },
        /*
         * ONLY HERE WHEN SOMETHING WENT WRONG. A refused write is state the
         * pilot has to know about and cannot see anywhere else, so it wears
         * row-warn and stays until the next save or delete clears it, which
         * is the same rule the Freestyle room's Scoring row follows. A
         * successful save says so by changing the Preset row's value.
         */
        ...(this.ratesNotice ? [{
          label: str('ui.not_saved'),
          value: '',
          info: true,
          rowClass: 'row-warn',
          note: this.ratesNotice,
        }] : []),
        {
          label: str('ui.save_as_preset'),
          action: 'rates-save',
          note: loaded
            ? str('ui.save_these_numbers_again_under_a', { name: loaded.name, RATES_STORAGE_WARNING })
            : str('ui.name_these_numbers_and_they_come', { RATES_STORAGE_WARNING }),
        },
        {
          label: str('ui.delete_preset'),
          action: 'rates-delete',
          disabled: !loaded,
          rowClass: loaded ? undefined : 'row-grey',
          note: loaded
            ? str('ui.forget_this_browser_is_the_only', { name: loaded.name })
            : str('ui.load_a_preset_first_this_deletes'),
        },
        {
          label: str('ui.revert_to_defaults'),
          action: 'rates-default',
          disabled: !ratesChanged(s),
          note: ratesChanged(s)
            ? str('ui.back_to_what_a_freshly_flashed', { formatRate: formatRate(rateField('ACTUAL', 'rcRate'), RATE_DEFAULTS.roll.rcRate), formatRate2: formatRate(rateField('ACTUAL', 'srate'), RATE_DEFAULTS.roll.srate) })
            : str('ui.already_on_the_betaflight_4_5'),
        },
        { label: str('ui.back'), action: 'back' },
      ];
    }
    if (this.screen === 'pids') {
      /*
       * BETAFLIGHT CONFIGURATOR'S PID TUNING TAB, in a menu, minus the CLI.
       *
       * Two ways in, the same two Configurator offers. The sliders are the
       * firmware's simplified_* keys plus a real `simplified_tuning apply`,
       * so the arithmetic from slider to PID is compiled Betaflight and
       * nothing else, and 100 always means "this tune's own scale". The
       * expert table writes the PIDs themselves with the sliders off,
       * which is Configurator's expert mode. Everything is keyed by the
       * tune on the row above: adjust your own dump and stock stays stock.
       *
       * A slider the pilot has not moved shows the TUNE's value and is not
       * stored, and a slider walked back onto the tune's value forgets it
       * was ever moved, so stock has one spelling and the best-lap record
       * key (a hash of the config text) cannot split on a no-op.
       */
      const live = this.pidsLive && this.pidsLive.tune === s.tune ? this.pidsLive : null;
      const entry = pidsEntry(s.pids, s.tune);
      const expert = Boolean(entry && entry.mode === 'expert' && entry.pids);
      const tuneName = tuneById(s.tune).name;
      const yawNote = live && live.baselineMode === 'RP'
        ? str('ui.runs_the_sliders_in_rp_mode', { tuneName })
        : '';
      /* Only built when `live` is present, per the loading row below, so
       * the tune's baseline is always real and walking a slider back onto
       * it always forgets the override. */
      const sliderRow = (k) => {
        const spec = SLIDERS[k];
        const tuneVal = live.baseline[k];
        const moved = Boolean(entry && entry.sliders && k in entry.sliders);
        const cur = moved ? entry.sliders[k] : tuneVal;
        const bits = [spec.note];
        if (moved) {
          bits.push(str('ui.ships_this_at_setting_it_back', { tuneName, tuneVal }));
        }
        if (k === 'master') {
          bits.push(yawNote.trim());
        }
        const it = number(
          spec.label,
          bits.filter(Boolean).join(' '),
          spec,
          cur,
          (v) => { setPidSlider(s.pids, s.tune, k, v, tuneVal); },
        );
        /* A real track, as Configurator draws these: drag lands on
         * release, arrows still step one percent, the number still
         * types. */
        it.range = { min: spec.cliMin, max: spec.cliMax };
        return it;
      };
      const pidRow = (axis, f) => {
        const spec = PID_FIELD_SPECS[f];
        return number(
          spec.label,
          spec.note,
          spec,
          entry.pids[axis][f],
          (v) => { entry.pids[axis][f] = v; },
        );
      };
      /* The mode switch sits ABOVE the rows it switches, at the same index
       * in both shapes. It was below the sliders, so flipping it rebuilt
       * the menu with the cursor left on an index that no longer held the
       * toggle, the guard in renderMenu sent the cursor to the top, and
       * the next arrow press stepped the Tune row instead. A control must
       * stay under the cursor that just used it. */
      /*
       * NO ROW EDITS A TUNE THAT IS NOT LOADED YET. Between the Tune row
       * moving and swapTune's fetch publishing the readback, `live` is
       * null and every fallback here would be a lie: a slider would show
       * 100 where a saved dump ships 185, an arrow press would store an
       * override computed from that wrong base with no tune value to
       * forget it against, and the expert toggle would seed the table from
       * stock instead of from what is about to fly. So the window shows
       * one info row instead of controls. It lasts one local fetch; on a
       * slow network it is the same honesty the panel caption already has.
       */
      const rows = [
        /*
         * THE PICKER, not a door back to Quad.
         *
         * It was a door, and it had to be: the tune was chosen one row above
         * the PIDs row on Quad, and this screen only needed to SAY which
         * tune it was adjusting. Folding those two Quad rows into one moved
         * the choosing in here, because a Tune row on Quad that opens this
         * screen cannot be answered by a Tune row here that opens Quad.
         *
         * The loading branch below is reachable from both directions now: a
         * swap made here, and a swap followed in from Quad, arrive with
         * `live` null the same way.
         */
        tunePickItem(s, this.returnTo === 'paused'),
      ];
      if (!live) {
        rows.push({
          label: str('ui.loading', { tuneName }),
          info: true,
          note: str('ui.the_tune_is_being_fetched_and'),
        });
      } else {
        rows.push(toggle(
          str('ui.set_pids_directly'),
          expert
            ? str('ui.on_the_sliders_are_off_simplified')
            : str('ui.off_the_sliders_below_drive_the'),
          expert,
          (on) => {
            setPidsExpert(s.pids, s.tune, on, live.pids);
          },
        ));
        if (!expert) {
          rows.push({ label: str('ui.betaflight_s_tuning_sliders'), section: true });
          for (const k of SLIDER_KEYS) {
            rows.push(sliderRow(k));
          }
        }
        if (expert) {
          for (const axis of PID_AXES) {
            rows.push({ label: axis === 'roll' ? str('ratespanel.roll') : axis === 'pitch' ? str('ui.pitch') : 'Yaw', section: true });
            for (const f of PID_FIELDS) {
              rows.push(pidRow(axis, f));
            }
          }
        }
      }
      rows.push(
        {
          label: str('ui.every_setting'),
          action: 'fc',
          note: str('ui.the_full_flight_controller_screen_filters'),
        },
        {
          label: str('ui.back_to_the_tune_s_own'),
          action: 'pids-default',
          disabled: !pidsAdjusted(s.pids, s.tune),
          note: pidsAdjusted(s.pids, s.tune)
            ? str('ui.forgets_every_slider_and_hand_set', { tuneName })
            : str('ui.is_already_flying_its_own_values', { tuneName }),
        },
        { label: str('ui.back'), action: 'back' },
      );
      return rows;
    }
    if (this.screen === 'fc') {
      return this.fc.items();
    }
    return [];
  }

  renderMenu() {
    this.syncMusicDock();
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
       * note, the wiki teaser and the best-lap chip off a screen that is
       * asking one question, and the rule that hides an empty menu panel.
       * The pilot got a blank box where the aircraft should be, two
       * paragraphs that belong to a seat they had not chosen, and no way to
       * fly. Reported as "the menu is not populated and i can't fly it".
       *
       * Both routes to it are ordinary. The track builder's Fly this track
       * link is `?map=custom`, which linkedMode reads as race, so every
       * pilot arriving from the builder hit it. And on a whoop syncMode
       * answers the mode itself, so every whoop pilot hit it from any link.
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
    const rows = this.cardScreen()
      ? items.filter((it) => !it.map && !it.course && !it.card)
      : items;
    const offset = items.length - rows.length;
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

  /* The curve, redrawn from the settings whenever the menu is rebuilt. Every
   * row on this screen writes a setting and then rebuilds, so this is the one
   * place the picture has to be kept honest. */
  syncRates() {
    if (!this.ratesPanel) {
      return;
    }
    if (this.screen !== 'rates') {
      return;
    }
    if (this.ratesHint) {
      /* Same sentence the pause menu's row carries, because a pilot who got
       * here from a paused run needs it on the screen they are editing. */
      this.ratesHint.textContent = this.returnTo === 'paused'
        ? str('ui.arrow_keys_move_left_and_right')
        : str('ui.arrow_keys_move_left_and_right_2');
    }
    this.ratesPanel.paint(this.settings.rates, this.ratesStick, this.settings.airframe);
  }

  /* The live sticks, from the frame loop. Only while the screen is up: the
   * panel draws unconditionally and the caller owns the guard. */
  paintRates(stick) {
    if (stick) {
      this.ratesStick = stick;
    }
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    this.ratesPanel.paintStick(this.ratesStick);
  }

  /* The PID bars, repainted from the module readback whenever the menu is
   * rebuilt. Same contract as syncRates: every row on the screen writes a
   * setting and then rebuilds, so this is where the picture stays honest. */
  syncPids() {
    if (!this.pidsPanel || this.screen !== 'pids') {
      return;
    }
    if (this.pidsHint) {
      this.pidsHint.textContent = this.returnTo === 'paused'
        ? str('ui.arrow_keys_move_left_and_right')
        : str('ui.arrow_keys_move_left_and_right_2');
    }
    const s = this.settings;
    const live = this.pidsLive && this.pidsLive.tune === s.tune ? this.pidsLive : null;
    const entry = pidsEntry(s.pids, s.tune);
    const name = tuneById(s.tune).name;
    let caption;
    if (!live) {
      caption = str('ui.is_loading', { name });
    } else if (entry && entry.mode === 'expert' && entry.pids) {
      caption = str('ui.pids_set_by_hand_read_back', { name });
    } else if (pidsAdjusted(s.pids, s.tune)) {
      caption = str('ui.through_your_sliders_read_back_from', { name });
    } else {
      caption = str('ui.as_it_ships_read_back_from', { name });
    }
    this.pidsPanel.paint(live, caption);
  }

  /*
   * The flight controller's chrome: tab rail, page strip, attitude canvas
   * and the dirty flag, all repainted with the menu because every row
   * edit rebuilds the menu.
   */
  syncFcChrome() {
    if (!this.fcTabs) {
      return;
    }
    const on = this.screen === 'fc';
    if (on) {
      paintTabStrip(this.fcTabs, this.fc, (id) => {
        if (this.fc.confirm) {
          return;
        }
        this.fc.setTab(id);
        this.cursor = 0;
        this.renderMenu();
      });
      paintPageStrip(this.fcPages, this.fc, (id) => {
        if (this.fc.confirm) {
          return;
        }
        this.fc.page = id;
        this.cursor = 0;
        this.renderMenu();
      });
    }
    const confirm = Boolean(this.fc.confirm);
    const setupOn = on && this.fc.tab === 'setup' && !confirm;
    this.fcAttitude.hidden = !setupOn;
    if (setupOn) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
    this.syncFcDirty();
  }

  syncFcDirty() {
    if (this.fcDirty) {
      this.fcDirty.textContent = this.fc.dirty() ? str('ui.unsaved') : '';
    }
    this.syncFcExit();
  }

  syncFcExit() {
    if (!this.fcExit) {
      return;
    }
    const on = this.screen === 'fc';
    /*
     * The save-run confirm hides the exit bar because it is asking whether
     * to restart a live run and an Exit button beside that question is a
     * third answer nobody meant to offer. The leave confirm keeps it: that
     * panel IS the leave question, and hiding the bar collapses the header
     * height under it so the first row renders behind the brand block.
     */
    const confirm = this.fc.confirm === 'save-run';
    const dirty = this.fc.dirty();
    this.fcExit.hidden = !on || confirm;
    if (this.fcSaveExit) {
      this.fcSaveExit.hidden = !dirty;
    }
    if (this.fcLeave) {
      this.fcLeave.textContent = dirty ? str('ui.exit_without_saving') : str('ui.exit');
    }
    if (this.fcExitCopy) {
      this.fcExitCopy.textContent = dirty ? 'exits without saving' : 'returns';
    }
  }

  leaveFc() {
    this.fc.stopMotors();
    this.fc.confirm = null;
    const dest = ['paused', 'quad', 'pids'].includes(this.fcFrom)
      ? this.fcFrom
      : 'title';
    this.show(dest);
  }

  /* The horizon on the Setup tab, fed by the shell's frame loop. */
  paintFcAttitude() {
    if (this.screen === 'fc' && this.fc.tab === 'setup' && !this.fc.confirm) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
  }

  /*
   * The module readback, from the shell after every successful sim_init.
   * The PIDs screen's bars and its slider fallbacks have no other source:
   * nothing on the screen computes a PID from a slider, so a control that
   * stopped reaching Betaflight shows up as a control that moves nothing.
   */
  setPidsLive(live) {
    this.pidsLive = live || null;
    if (this.screen === 'pids') {
      this.renderMenu();
    }
  }

  helpNode() {
    return {
      title: this.titleHelp,
      howto: this.howtoHelp,
      tricks: this.trickHelp,
      credits: this.creditsHelp,
      courses: this.coursesHelp,
      freestyle: this.freestyleHelp,
      pilot: this.pilotHelp,
      friends: this.friendsHelp,
      rooms: this.roomPages.rooms && this.roomPages.rooms.help,
      roomnew: this.roomPages.roomnew && this.roomPages.roomnew.help,
      quad: this.quadHelp,
      launch: this.launchHelp,
      standings: this.standingsHelp,
      rates: this.ratesHelp,
      pids: this.pidsHelp,
      fc: this.fcHelp,
      paused: this.pausedHelp,
      results: this.resultsHelp,
    }[this.screen];
  }

  syncCursor(scroll = true) {
    const items = this.items();
    /*
     * The id of the row the cursor is on, kept so that a REBUILD can put
     * the cursor back on the same row rather than the same index. The
     * bench has four filters now, tab, page, search and only-what-I-
     * changed, and every one of them changes the list's length underneath
     * a cursor that would otherwise stay at 27 and land somewhere else.
     * See restoreFocusRow.
     */
    const here = items[this.cursor];
    if (here && here.id) {
      this.focusId = here.id;
    }
    this.menuRows.forEach((row, k) => {
      const i = k + this.rowOffset;
      const on = i === this.cursor;
      row.classList.toggle('on', on);
      /* Roving tabindex: see renderMenu. Headings are in menuRows too and
       * are not focusable, so they are left alone. */
      if (row.classList.contains('row')) {
        row.tabIndex = on ? 0 : -1;
        row.setAttribute('aria-selected', String(on));
      }
    });
    const help = this.helpNode();
    if (help) {
      const note = items[this.cursor]?.note || '';
      /* A note that scrolls keeps its scroll position when its text is
       * replaced, so the next long note opened part way down if the last
       * one had been read to the end. Only on a change: this runs every
       * cursor move and a scrollTop write is a layout flush. */
      if (help.textContent !== note) {
        help.textContent = note;
        help.scrollTop = 0;
      }
      /*
       * THE TITLE'S NOTE DRAWS OVER THE BRAND COPY, so the brand copy
       * gets out of its way.
       *
       * On the title screen the note is absolutely positioned above the
       * menu and grows UPWARD, out of flow, which means a long note is
       * painted straight on top of the keep note sitting above it. A
       * tester reported it as overlapping text and they were right: at
       * 1536 by 776 the note for the Course row spans 312 to 344 and the
       * keep note spans 279 to 344, so the two are drawn in the same
       * band. Nothing pushed anything because absolute elements do not.
       *
       * Only one of the two is ever being read. The keep note is ambient
       * and always true; the row note is about the thing under the
       * cursor right now. So the ambient one yields, on opacity rather
       * than display, which keeps the layout still and cannot itself
       * shift anything.
       */
      if (this.screens.title) {
        this.screens.title.classList.toggle('has-help', help === this.titleHelp && Boolean(note));
      }
    }
    const on = this.menuRows[this.cursor - this.rowOffset];
    if (scroll && on && typeof on.scrollIntoView === 'function') {
      on.scrollIntoView({ block: 'nearest' });
    }
    /*
     * Move the browser's focus to match, but ONLY if focus is already
     * inside this menu. Two reasons, both learned the hard way elsewhere in
     * this file: a menu that grabs focus on every cursor move takes the
     * caret out of the bench's search field mid-word, and a screen the
     * pilot has not touched yet should not steal focus from the page.
     *
     * preventScroll, because scrollIntoView above has already put the row
     * where it belongs and the browser's own focus scroll would fight it.
     */
    if (on && on !== document.activeElement && this.focusInMenu()) {
      try {
        on.focus({ preventScroll: true });
      } catch (e) {
        /* Older engines take no options. The class is what paints it. */
        on.focus();
      }
    }
  }

  /*
   * Put the browser's focus on the cursor's row whether or not it is
   * already in the menu.
   *
   * syncCursor deliberately will not steal focus from a field, which is
   * what keeps the bench's search typeable. But leaving that field with
   * Down is the one case where the field is being abandoned ON PURPOSE:
   * without this the blur dropped focus to the body and the cursor bar
   * walked the results with nothing focused, so a screen reader followed
   * none of it and Tab restarted from the top of the page.
   */
  focusCursorRow() {
    const on = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    if (!on || !on.classList.contains('row')) {
      return;
    }
    try {
      on.focus({ preventScroll: true });
    } catch (e) {
      on.focus();
    }
  }

  /* Is the browser's focus on something inside the menu the cursor drives?
   * A row, or a control inside a row. Anything else, a field, the bug chip,
   * the page itself, is left alone. */
  focusInMenu() {
    const live = document.activeElement;
    if (!live || live === document.body) {
      return false;
    }
    /* A typed field or a search field owns its own caret. */
    if (live.tagName === 'INPUT' || live.tagName === 'TEXTAREA') {
      return false;
    }
    return this.menuRows.some((row) => row === live || row.contains(live));
  }

  /*
   * After a rebuild, put the cursor back on the ROW it was on rather than
   * the index it was at.
   *
   * A filter that removes rows above the cursor slides everything up under
   * it, so the cursor stays at 27 and is now pointing at a different key.
   * The bench grew four filters in the same turn this landed, and the
   * launch card and the rooms change length with the seat and the board, so
   * this is not hypothetical.
   *
   * Silent when the row is gone: falling back to the index is the least
   * surprising thing left, and the caller has already clamped it.
   */
  restoreFocusRow() {
    if (!this.focusId) {
      return;
    }
    const items = this.items();
    const at = items.findIndex((it) => it && it.id === this.focusId && this.isStop(it));
    if (at >= 0 && at !== this.cursor) {
      this.cursor = at;
    }
  }

  /* True when this event is a real pointer move, not Chromium reporting
   * that the element under a still mouse changed because the list scrolled
   * or was rebuilt. */
  pointerMoved(e) {
    const x = e.clientX;
    const y = e.clientY;
    const moved = this.ptrX != null && (x !== this.ptrX || y !== this.ptrY);
    this.ptrX = x;
    this.ptrY = y;
    return moved;
  }

  hoverCursor(e, i) {
    if (!this.pointerMoved(e) || this.cursor === i) {
      return;
    }
    this.setCursor(i, true);
  }

  /*
   * Move the cursor. `pointer` says the MOUSE did it, and two things that
   * are right for a key press are wrong for a hover.
   *
   * SCROLLING. syncCursor brings the cursor's row into view, which is the
   * whole point when Down walks off the bottom of a scroller. On a hover
   * the row is already in view, by definition: the pointer is on it. Worse,
   * near the ends of a scroller `block: 'nearest'` still shifts the list a
   * few pixels, which slides a DIFFERENT row under a stationary pointer,
   * which fires another mousemove, which moves the cursor again. That
   * feedback loop is what "the menu is laggy following the mouse" is: not
   * slow code, the list moving under the hand.
   *
   * THE CLICK. A move cue per row is right for one key press and is a
   * machine-gun when a mouse sweeps down twenty rows in a third of a second.
   */
  setCursor(i, pointer = false) {
    this.noteInteraction();
    if (i === this.cursor) {
      return;
    }
    this.closeDrop();
    this.cursor = i;
    if (this.screen === 'courses') {
      const here = this.items()[i];
      if (here && here.course) {
        this.lastCardKey = courseCardKey(here);
      }
    }
    /*
     * A card is lit by a class and by nothing else, and the render pass that
     * sets it only runs when the whole menu is rebuilt, which a cursor move
     * deliberately does not do. So the cursor repaints the cards itself.
     *
     * This used to be inside the `courses` branch above, which is why the
     * Freestyle room's four world cards did not follow the arrow keys at
     * all: the highlight only moved when something else forced a full
     * render. Every card screen goes through markCards now.
     */
    if (this.cardScreen()) {
      this.markCards();
    }
    /*
     * THE TRICK FILM IS LIT BY THE CURSOR AND BY NOTHING ELSE, and it had
     * the card bug above, one screen over, unfixed.
     *
     * renderTricks paints the name, the points, the how-to and the
     * animation for whichever row the cursor is on, and it is called from
     * renderMenu. A cursor move deliberately does NOT rebuild the menu,
     * for the reason markCards exists, so walking the list with the arrows
     * or the mouse moved the highlight and left the panel showing the
     * first trick for ever:
     *
     *   bug-f105cf4a, Fernando: "cuando selecciono otro truco no sale solo
     *   se ve el primer truco", when I select another trick it does not
     *   appear, only the first trick is shown.
     *
     * They were trying to learn tricks they had never flown, which is the
     * one thing this screen is for, and it showed them one of them.
     */
    if (this.screen === 'tricks') {
      this.renderTricks();
    }
    this.syncCursor(!pointer);
    if (this.onUiSound && !pointer) {
      this.onUiSound('move');
    }
  }

  /*
   * Two segments, Off and On, with the live one lit. Not a popup, and not a
   * checkbox either: a checkbox says nothing about what the other state is
   * called, and half of these are not really on and off in the pilot's head,
   * they are two named behaviours.
   *
   * Both segments are clickable and both are labelled, so a mouse can go
   * straight to the state it wants rather than pressing a thing to find out.
   */
  /*
   * A TEXT FIELD THAT FILTERS AS YOU TYPE. One row uses it, the firmware
   * bench's search, and it is separate from the typed number row because
   * that one commits on blur, carries stepper arrows and declares a decimal
   * input mode: three things that are wrong for a name typed a letter at a
   * time.
   *
   * DEBOUNCED, because each keystroke rebuilds the list and a full teardown
   * render of the bench costs about 57 ms on this container. Without it,
   * typing `failsafe` is eight renders and the field drops letters. The
   * caret is deliberately NOT restored by the rebuild: the field is rebuilt
   * with the same value, and refocusing it every frame is what made the
   * first draft impossible to type into.
   */
  makeSearch(it, i) {
    const wrap = el('div', 'row-control row-search');
    const field = document.createElement('input');
    field.className = 'row-num row-textfield';
    field.type = 'text';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.text.value || '';
    field.placeholder = it.text.placeholder || '';
    field.setAttribute('aria-label', it.label);
    field.addEventListener('click', (e) => e.stopPropagation());
    field.addEventListener('focus', () => {
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
    });
    field.addEventListener('input', () => {
      const v = field.value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        if (!it.onText) {
          return;
        }
        it.onText(v);
        /* Put the caret back exactly where it was. The rebuild replaces
         * this node, so the position has to be carried across rather than
         * left to the browser, which would drop it to the end. */
        const at = field.selectionStart;
        this.searchCaret = at;
        this.renderMenu();
        this.restoreSearchCaret();
      }, SEARCH_DEBOUNCE_MS);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        /* Up and down belong to the list, so a pilot can type a few letters
         * and then walk into the results without reaching for the mouse. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        this.move(e.key === 'ArrowDown' ? 1 : -1);
        this.focusCursorRow();
        return;
      }
      if (e.key === 'Enter') {
        /* Straight into the results, on the first hit. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        this.move(1);
        this.focusCursorRow();
        return;
      }
      if (e.key === 'Escape') {
        /* Leaves the field, then a second Escape leaves search, which is
         * the same two step contract the typed number row has. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        return;
      }
      /* Everything else is typing, and must not reach the menu: `d` is
       * ArrowRight on this shell and would adjust a row mid-word. */
      e.stopPropagation();
    });
    wrap.append(field);
    return wrap;
  }

  /* After a search rebuild, put the caret back in the freshly built field. */
  restoreSearchCaret() {
    const row = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    const field = row && row.querySelector('.row-textfield');
    if (!field) {
      return;
    }
    field.focus();
    const at = this.searchCaret == null ? field.value.length : this.searchCaret;
    try {
      field.setSelectionRange(at, at);
    } catch (e) {
      /* Some inputs refuse a range. The focus is the part that matters. */
    }
  }

  makeSwitch(it, i) {
    const wrap = el('div', 'row-control row-switch');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', it.label);
    for (const seg of [false, true]) {
      const b = btn(`sw-seg${it.on === seg ? ' on' : ''}`, seg ? 'On' : 'Off');
      b.setAttribute('aria-pressed', String(it.on === seg));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.syncCursor(false);
        /* Clicking the segment already lit is not a flip. A switch that
         * toggles on any click is a button wearing a switch's clothes. */
        if (it.on === seg) {
          return;
        }
        this.setSwitch(it, seg);
      });
      wrap.append(b);
    }
    return wrap;
  }

  /*
   * The same strip, for a row with a handful of NAMED choices rather than
   * two states. Flight mode is Acro or Angle, Flight model is Arcade or
   * Expert, Graphics is Low, High or Ultra. None of those is an on and an
   * off, and all of them fit on the row.
   *
   * Drawing them inline is worth more than the width it costs: a popup
   * hides every option a pilot has not chosen, so the row said "Acro" and
   * nothing said what the alternative was called or that there was one.
   */
  makeSegments(it, i) {
    const wrap = el('div', 'row-control row-switch');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', it.label);
    for (const opt of it.options) {
      const live = String(opt.value) === String(it.current);
      const b = btn(`sw-seg${live ? ' on' : ''}`, opt.label);
      b.setAttribute('aria-pressed', String(live));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.syncCursor(false);
        if (live || it.disabled || it.info) {
          return;
        }
        this.pick(opt.value);
      });
      wrap.append(b);
    }
    return wrap;
  }

  /* One place that writes a switch, so the sound, the repaint and the
   * disabled guard cannot drift between the mouse and the keys. */
  setSwitch(it, on) {
    if (!it || !it.sw || it.disabled || it.info) {
      return;
    }
    if (it.on === Boolean(on)) {
      return;
    }
    it.adjust(on ? 1 : -1);
    /* The same path a Left or Right press takes: save, repaint, sound, and
     * hand the settings to whoever is listening. */
    this.writeSettings();
  }

  makeStepper(it, i) {
    const wrap = el('div', 'row-control');
    const val = el('span', 'row-value', it.value);
    val.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(1);
    });
    const col = el('span', 'step-col');
    const up = btn('step', '▲');
    const down = btn('step', '▼');
    up.setAttribute('aria-label', str('ui.increase', { label: it.label }));
    down.setAttribute('aria-label', str('ui.decrease', { label: it.label }));
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(1);
    });
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(-1);
    });
    col.append(up, down);
    wrap.append(val, col);
    return wrap;
  }

  /*
   * A row with a text field in it.
   *
   * THE COMMIT IS ON BLUR OR ENTER, not on every keystroke, and that is a
   * decision rather than an omission. A field that clamped as you typed
   * would turn the "1" of 1500 into the minimum and then append to it, and
   * a field that re-inited the module on every keystroke would put the quad
   * back on the start line four times for one number. What DOES follow the
   * keystroke is the picture beside the menu: previewNumber draws the curve
   * the half-typed number would fly, so the graph answers before the value
   * is committed.
   *
   * The arrows keep their meaning, one firmware step, and take the typed
   * text as their starting point when there is one, so typing 800 and then
   * pressing up is 810 rather than one step from whatever was stored.
   */
  makeNumber(it, i) {
    const wrap = el('div', 'row-control');
    const field = document.createElement('input');
    field.className = 'row-num';
    field.type = 'text';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.num.text;
    field.setAttribute('aria-label', it.label);
    field.addEventListener('focus', () => {
      /* An open dropdown belongs to the row it was opened on. Clicking into
       * a field is leaving that row, and the field swallows its own clicks,
       * so without this the list stayed on the screen with the caret
       * somewhere else and the cursor no longer on it. */
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
      field.select();
    });
    field.addEventListener('click', (e) => e.stopPropagation());
    /*
     * Clicking from one field straight into another.
     *
     * The browser would do this itself, and it does not survive here: its
     * focus move blurs the field being left, that commit rebuilds the rows,
     * and the node the click was travelling to is gone before the focus
     * lands. So the move is taken over. preventDefault stops the browser
     * competing, the field being left is blurred deliberately so that its
     * value is committed, and renderMenu puts the caret in the freshly built
     * field at the end of the rebuild. A click inside the field that already
     * has the caret is left alone, or the caret could not be placed.
     */
    field.addEventListener('mousedown', (e) => {
      const live = document.activeElement;
      if (live === field) {
        return;
      }
      e.preventDefault();
      if (live && live.classList && live.classList.contains('row-num')) {
        this.numberFocusWanted = i;
        live.blur();
        return;
      }
      field.focus();
    });
    field.addEventListener('input', () => this.previewNumber(it, field.value));
    field.addEventListener('blur', () => {
      /* A field the menu has already rebuilt away has nothing to commit:
       * removing a focused element fires blur, and the value it carries has
       * just been written by whatever removed it. */
      if (!field.isConnected) {
        return;
      }
      this.commitNumber(it, field.value);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.commitNumber(it, field.value);
        return;
      }
      if (e.key === 'Escape') {
        /* Cancel the edit rather than leave the screen. The window listener
         * in src/input/input.js forwards Escape out of a text field on
         * purpose, so this one has to stop it, and a second Escape on the
         * row goes back as it always did. */
        e.preventDefault();
        e.stopPropagation();
        field.value = it.num.text;
        this.syncRates();
        field.blur();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        /* Up and down are the menu's, not the caret's. Without this a pilot
         * who clicked into a field could not leave it with the keyboard. */
        e.preventDefault();
        e.stopPropagation();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        this.commitNumber(it, field.value);
        this.move(dir);
      }
    });
    const col = el('span', 'step-col');
    const up = btn('step', '▲');
    const down = btn('step', '▼');
    up.setAttribute('aria-label', str('ui.increase', { label: it.label }));
    down.setAttribute('aria-label', str('ui.decrease', { label: it.label }));
    for (const [b, dir] of [[up, 1], [down, -1]]) {
      /* Keep the focus where it is: a blur here would rebuild the row and
       * take the button out from under the click that was already on its
       * way, so the first press after typing would do nothing. */
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.stepNumber(it, dir, field.value);
      });
    }
    col.append(up, down);
    wrap.append(field);
    if (it.num.unit) {
      wrap.append(el('span', 'row-num-unit', it.num.unit));
    }
    wrap.append(col);
    return wrap;
  }

  /*
   * A DRAG SLIDER, the control Betaflight Configurator draws for its
   * simplified tuning, plus the number beside it so the value is never a
   * guess. Three ways in, all landing on the same setter: drag the track
   * (native input[type=range], so touch, mouse and a focused arrow key
   * all work for free), arrow keys on the unfocused row through the
   * menu's own adjust path, or click the number and type.
   *
   * THE COMMIT IS ON RELEASE ('change'), not per drag pixel ('input').
   * Every one of these rows re-inits the module when it lands, and a
   * re-init per pixel would both stutter the drag and rebuild the menu
   * out from under the pointer mid-drag. 'input' only repaints the
   * number; letting go applies, exactly one init per gesture.
   */
  makeSliderControl(it, i) {
    const wrap = el('div', 'row-control row-slider');
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'row-range';
    range.min = String(it.range.min);
    range.max = String(it.range.max);
    range.step = '1';
    range.value = String(it.num.cli);
    range.setAttribute('aria-label', it.label);
    range.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
    });
    range.addEventListener('click', (e) => e.stopPropagation());
    range.addEventListener('change', () => {
      const v = Number(range.value);
      if (!Number.isFinite(v) || v === it.num.cli) {
        return;
      }
      it.set(v);
      this.writeSettings();
    });
    /* The number is typed, same contract as makeNumber: commit on Enter
     * or blur, Escape restores. Small on purpose; the track is the star. */
    const field = document.createElement('input');
    field.className = 'row-num row-range-num';
    field.type = 'text';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.num.text;
    field.setAttribute('aria-label', str('ui.value', { label: it.label }));
    field.addEventListener('click', (e) => e.stopPropagation());
    field.addEventListener('pointerdown', (e) => e.stopPropagation());
    field.addEventListener('focus', () => {
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
      field.select();
    });
    field.addEventListener('blur', () => {
      if (!field.isConnected) {
        return;
      }
      this.commitNumber(it, field.value);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.commitNumber(it, field.value);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        field.value = it.num.text;
        field.blur();
      }
    });
    /* The drag repaints the FIELD, live, so the number is never behind
     * the thumb; the commit still waits for release. */
    range.addEventListener('input', () => {
      field.value = formatRate(it.num.spec, Number(range.value));
    });
    wrap.append(range, field);
    if (it.num.unit) {
      wrap.append(el('span', 'row-num-unit', it.num.unit));
    }
    return wrap;
  }

  /* Put the caret in a typed row's field, from a click on the row or from
   * Enter on the keyboard. */
  focusNumber(i) {
    const row = this.menuRows[i - this.rowOffset];
    const field = row && row.querySelector('.row-num');
    if (field) {
      field.focus();
    }
  }

  /*
   * Draw the curve the text in the field would fly, without committing it.
   *
   * The write into the settings is REAL and is undone on the next line. It
   * is done that way because the row's own setter is the only thing that
   * knows where the value goes and whether roll carries pitch with it, and
   * nothing can read the settings between these two statements: no save, no
   * onSettings, no await.
   */
  previewNumber(it, raw) {
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    const next = it.typed(raw);
    if (next == null) {
      return;
    }
    const before = it.num.cli;
    it.set(next);
    try {
      this.ratesPanel.paint(this.settings.rates, this.ratesStick, this.settings.airframe);
    } finally {
      it.set(before);
    }
  }

  commitNumber(it, raw) {
    const next = it.typed(raw);
    if (next == null || next === it.num.cli) {
      /* Nothing to store, but the field may hold "67x" or a number that
       * rounds to what is already there, so the row is rebuilt to put the
       * stored value back on the screen. */
      this.renderMenu();
      return;
    }
    it.set(next);
    this.writeSettings();
  }

  stepNumber(it, dir, raw) {
    const typed = it.typed(raw);
    const base = typed == null ? it.num.cli : typed;
    const spec = it.num.spec;
    const next = Math.max(spec.cliMin, Math.min(spec.cliMax, base + dir));
    if (next === it.num.cli) {
      this.renderMenu();
      return;
    }
    it.set(next);
    this.writeSettings();
  }

  /* Store, redraw, tell the shell. The three things every row that changes
   * a setting does, in one place. */
  writeSettings() {
    /*
     * ONLY WHEN THE AIRCRAFT MOVED, and the comment this replaces explains
     * why it has to be conditional: "The Aircraft row comes through here,
     * so this is where a pilot who swaps to the whoop from inside the town
     * stops being in freestyle." That is the one row it was written for,
     * and EVERY row that changes a setting comes through here.
     *
     * syncMode does not ask what changed. On a whoop, where freestyle is
     * not offered because there is nowhere to fly it, it forces mode to
     * race and the map to custom. So a pilot on the whoop, in the town,
     * who nudged the camera angle was thrown onto the custom track:
     *
     *   bug-4d5b2c51: "when i tried to change the camera angle (on the
     *   65mm) it brought me to a different page. I want to freestyle but
     *   always go to the raceGOW track page as soon as i try to adjust cam
     *   angle." And, in the same ticket, "changing the quad in freestyle
     *   doesn't seem to make a difference", which is the other end of it.
     *
     * Measured before the change: camera angle 25 to 15 on a seated whoop
     * moved mode freestyle to race and map city to custom, touching
     * nothing else. Gating on the aircraft keeps the case it was written
     * for, because swapping aircraft is exactly when the airframe moves,
     * and boot still runs it once for a stale saved pair.
     */
    if (this.settings.airframe !== this.modeSyncedFor) {
      this.modeSyncedFor = this.settings.airframe;
      this.syncMode();
    }
    saveSettings(this.settings);
    this.renderMenu();
    /* The title's freestyle line and the score overlay both read a setting
     * this row may have just changed. See refreshBest. */
    this.refreshBest();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  makeDrop(it, i) {
    const wrap = el('div', 'row-control');
    const b = btn('drop-btn', it.value);
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-label', it.label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropIndex === i) {
        this.closeDrop();
        return;
      }
      this.openDrop(i, b, it);
    });
    wrap.append(b);
    return wrap;
  }

  /*
   * Open the list on the row the cursor is on, from the keyboard.
   *
   * openDrop needs an element to hang the list under and the mouse path
   * hands it the button that was clicked. From the keys there is no such
   * event, so the button is looked up on the row. If the row has no button,
   * which is every row rendered before this list existed, the row itself is
   * a perfectly good thing to hang a list under.
   */
  openDropForCursor() {
    const i = this.cursor;
    const it = this.items()[i];
    const row = this.menuRows && this.menuRows[i - this.rowOffset];
    if (!it || !it.options || !it.options.length || !row) {
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    this.openDrop(i, row.querySelector('.drop-btn') || row, it);
  }

  openDrop(i, anchor, it) {
    this.closeDrop();
    this.cursor = i;
    this.syncCursor();
    /* A row whose list is better chosen from than read, the Aircraft row,
     * opens its own picker in the list's place. */
    if (it.open) {
      it.open();
      return;
    }
    const list = el('div', 'drop-list');
    list.setAttribute('role', 'listbox');
    for (const opt of it.options) {
      const o = btn(`drop-opt${String(opt.value) === String(it.current) ? ' on' : ''}`, opt.label);
      o.setAttribute('role', 'option');
      o.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDrop();
        this.cursor = i;
        this.pick(opt.value);
      });
      list.append(o);
    }
    this.root.append(list);
    const r = anchor.getBoundingClientRect();
    list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 240))}px`;
    list.style.minWidth = `${Math.max(r.width, 148)}px`;
    list.style.top = `${r.bottom + 4}px`;
    const lr = list.getBoundingClientRect();
    if (lr.bottom > window.innerHeight - 8) {
      list.style.top = `${Math.max(8, r.top - lr.height - 4)}px`;
    }
    this.dropEl = list;
    this.dropIndex = i;
    this.dropOpts = [...list.querySelectorAll('.drop-opt')];
    this.dropHi = this.dropOpts.findIndex((o) => o.classList.contains('on'));
    if (this.dropHi < 0) {
      this.dropHi = 0;
    }
    this.markDropHi();
  }

  markDropHi() {
    if (!this.dropOpts) {
      return;
    }
    this.dropOpts.forEach((o, j) => o.classList.toggle('on', j === this.dropHi));
    const on = this.dropOpts[this.dropHi];
    if (on) {
      on.scrollIntoView({ block: 'nearest' });
    }
  }

  moveDrop(dir) {
    if (!this.dropEl || !this.dropOpts || !this.dropOpts.length) {
      return;
    }
    const n = this.dropOpts.length;
    this.dropHi = (this.dropHi + dir + n) % n;
    this.markDropHi();
    if (this.onUiSound) {
      this.onUiSound('move');
    }
  }

  confirmDrop() {
    const it = this.items()[this.cursor];
    const opt = it && it.options && it.options[this.dropHi];
    this.closeDrop();
    if (opt) {
      this.pick(opt.value);
    }
  }

  closeDrop() {
    if (this.dropEl) {
      this.dropEl.remove();
      this.dropEl = null;
    }
    this.dropIndex = null;
    this.dropOpts = null;
    this.dropHi = 0;
  }

  pick(value) {
    const it = this.items()[this.cursor];
    if (!it || !it.pick) {
      return;
    }
    it.pick(value);
    saveSettings(this.settings);
    this.renderMenu();
    /* Same reason as writeSettings: see refreshBest. */
    this.refreshBest();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  /*
   * The world cards, and the flight playing on each of them.
   *
   * BUILT ONCE, then only re-marked. The menu is rebuilt from scratch on
   * every cursor move, which is what keeps it honest everywhere else, and
   * doing that here would throw away three live shots twenty times a
   * second as somebody arrowed along the row.
   */
  /*
   * Which card the cursor is on, painted. One pass for all three card
   * screens, because a card's lit state is a class on an element the render
   * pass built and the cursor moves far more often than the list changes.
   */
  markCards() {
    if (this.screen === 'title') {
      for (const [i, c] of (this.titleCards || []).entries()) {
        const on = i === this.cursor;
        c.card.classList.toggle('on', on);
        /* Roving tab stop, the same shape the rows use. A card is a real
         * control here rather than a picture: it is the only thing on the
         * first screen, so Tab and a screen reader have to find it. */
        c.card.tabIndex = on ? 0 : -1;
        c.card.setAttribute('aria-current', String(on));
      }
      return;
    }
    const worlds = this.mapCards || [];
    worlds.forEach((c, j) => c.card.classList.toggle('on', j === this.cursor));
    (this.courseCards || []).forEach((c, j) => {
      c.card.classList.toggle('on', j + worlds.length === this.cursor);
    });
  }

  /*
   * The gate's three cards.
   *
   * Built from the same items() the rows come from, so there is one list and
   * one cursor over the whole screen, and rebuilt only when the set of cards
   * changes rather than on every cursor move.
   *
   * A div with role=button rather than a real <button>: Enter is already
   * handled by handleKey for whatever the cursor is on, and a native button
   * would ALSO fire a click for the same keypress, which would answer the
   * gate twice and swap the world twice.
   */
  renderTitleCards() {
    const host = this.gateCards;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.card);
    const key = items.map((it) => it.card).join('|');
    if (!this.titleCards || this.titleCardKey !== key) {
      this.titleCardKey = key;
      host.textContent = '';
      /* How many share the row, for the sheet: five cards are laid out
       * tighter than two or three (index.html, THE GATE'S CARDS). */
      host.dataset.count = String(items.length);
      this.titleCards = items.map((it, i) => {
        const card = el('div', `gate-card gate-card-${it.card}`);
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', it.label);
        const art = el('div', 'gate-card-art');
        if (it.art) {
          const img = el('img', 'gate-card-shot');
          img.src = it.art;
          /* The name is right underneath it, so the picture is decoration to
           * anything reading the page aloud. */
          img.alt = '';
          img.decoding = 'async';
          art.append(img);
        }
        if (it.svg) {
          /*
           * A DRAWING OVER THE PHOTOGRAPH, and the two say different things.
           *
           * The photograph answers "what is this place like", and a picture
           * of a town, a field or a room is the only honest answer to that.
           * It cannot answer "how big is the thing I am flying", because
           * whatever is in front of the lens fills the frame: the five inch
           * and the whoop are 220 mm and 65 mm across and both would be a
           * quad on a card.
           *
           * So the plan is drawn over the corner of each, and BOTH ARE DRAWN
           * TO ONE SCALE in one viewBox, which is why the whoop's mark is a
           * fifth of the width of the five inch's. That relationship is the
           * single most useful thing these cards can tell somebody who has
           * flown one and not the other. See craftSvg.
           */
          const mark = el('div', 'gate-card-mark');
          mark.innerHTML = it.svg;
          art.append(mark);
        }
        const body = el('div', 'gate-card-body');
        const name = el('div', 'gate-card-name', it.label);
        const blurb = el('p', 'gate-card-blurb', it.blurb);
        const facts = el('div', 'gate-card-facts');
        for (const f of it.facts || []) {
          facts.append(el('span', 'gate-card-fact', f));
        }
        body.append(name, blurb, facts);
        card.append(art, body);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('focus', () => {
          if (this.cursor !== i) {
            this.setCursor(i);
          }
        });
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return { card };
      });
    }
    this.markCards();
  }


  /*
   * The rows, with each trick's film built once and kept. A film is a handful
   * of closures over numbers; building sixty of them costs nothing and
   * rebuilding one per keypress would.
   */
  trickRows() {
    if (!this.trickList) {
      this.trickList = scoreableTricks().map((t) => {
        const film = filmFor(t.steps);
        return {
          ...t, film, how: film.caption, view: film.view, status: trickStatus(t),
        };
      });
    }
    return this.trickList;
  }

  /*
   * Show whichever trick the cursor is on. Guarded on the NAME having
   * changed, because this runs on every menu render and restarting an
   * animation that is already playing is a visible stutter.
   */
  renderTricks() {
    const rows = this.trickRows();
    if (!rows.length || !this.trickPlayer) {
      return;
    }
    const t = rows[Math.max(0, Math.min(rows.length - 1, this.cursor))] || rows[0];
    if (t.name === this.trickShown) {
      return;
    }
    this.trickShown = t.name;
    Ui.text(this.trickName, t.name);
    Ui.text(this.trickMeta, str('ui.points', { points: plural('count.points', t.points, { n: formatScore(t.points) }), difficulty: t.difficulty })
      + ` \u00b7 ${t.category} \u00b7 ${t.status.tag}`);
    Ui.text(this.trickHow, `${t.how} ${t.status.line}`);
    /* Which way the camera faces, because a roll seen from the side is a
     * craft that does not appear to move at all and the reader has to know
     * they are being shown the one angle it reads from. */
    const view = VIEW_LABEL[t.view].replace('seen ', '');
    Ui.text(this.trickView, str('ui.seen_the_pink_nose_is_the', { view }));
    this.trickPlayer.show(t.film);
  }

  renderMapCards() {
    /* Whichever picker is up. Race holds no world cards any more, so on that
     * screen this paints an empty strip and costs nothing. */
    const host = this.screen === 'freestyle' ? this.freestyleCards : this.mapCardHost;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.map);
    if (!this.mapCards || this.mapCards.length !== items.length) {
      this.stopReels();
      host.textContent = '';
      this.mapCards = items.map((it, i) => {
        const card = el('div', 'map-card');
        markPoster(card, it.map);
        const shot = el('div', 'map-reel');
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const tag = el('div', 'map-card-tag', '');
        const still = el('div', 'map-card-still', '');
        body.append(name, tag);
        card.append(shot, still, body);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return {
          card, shot, tag, still, name, id: it.map.id, liveCanvas: null,
        };
      });
      this.startReels();
    }
    this.mapCards.forEach((c, i) => {
      c.card.classList.toggle('on', i === this.cursor);
      c.tag.textContent = c.id === this.settings.map ? str('ui.flying_now') : '';
    });
  }

  /*
   * The track cards: the pilot's own, then the board's.
   *
   * A TRACK IS SHOWN BY ITS WORLD. A track built in a world stands in that
   * world, and a plan of it floating on nothing says less than the valley it
   * is in, so each card wears the world's poster (markPoster) under the
   * track's name, with its world and gate count beside it.
   */
  renderCourseCards() {
    const host = this.courseCardHost;
    if (!host) {
      return;
    }
    const items = this.items();
    const cards = items.filter((it) => it.course);
    const key = cards.map((it) => `${courseCardKey(it)}:${it.label}:${it.course.track.online || ''}`).join('|');
    if (!this.courseCards || this.courseCardKey !== key) {
      host.textContent = '';
      this.courseCardKey = key;
      this.courseCards = cards.map((it, i) => {
        const t = it.course.track;
        const card = el('div', 'map-card course-card');
        markPoster(card, liveWorld(t.map));
        const shot = el('div', 'map-reel');
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const meta = el('div', 'map-card-meta', '');
        /* The designer where the board knows one, because the author is
         * whoever published it and those can be two different people. */
        const world = liveWorld(t.map);
        const bits = [
          world ? world.name : str('cloud.retired_world_short'),
          it.course.kind === 'board' || it.course.kind === 'cloud' ? byLine(t) : '',
          str('ui.gate_count', { gates: t.gates, v2: t.gates === 1 ? '' : 's' }),
          it.course.kind === 'cloud' && t.updatedUtc ? formatDay(t.updatedUtc) : '',
          t.online ? str(`cloud.state_${t.online}`) : '',
        ];
        if (t.recordMs != null) {
          bits.push(str('ui.record', { formatTime: formatTime(t.recordMs) }));
        }
        meta.textContent = bits.filter(Boolean).join(' · ');
        const tag = el('div', 'map-card-tag', '');
        body.append(name, tag);
        card.append(shot, body, meta);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return { card, tag, key: courseCardKey(it), id: t.id };
      });
    }
    const seated = seatedTrackId();
    this.courseCards.forEach((c, i) => {
      c.card.classList.toggle('on', i === this.cursor);
      /* The list below belongs to one card. Say which, or the screen is back
       * to looking like a strip of cards over an unrelated menu. */
      c.card.classList.toggle('chosen', Boolean(this.cardSubject) && c.key === this.cardSubject);
      c.tag.textContent = c.id === seated && this.settings.map === 'track' ? str('ui.flying_now') : '';
    });
  }

  /*
   * THE PILOT'S OWN TRACKS, read once per visit to My tracks, and again
   * after a card's row changes the library.
   *
   * Once, rather than inside items(), because items() runs on every cursor
   * move and this reads and normalises every saved document. The library
   * only changes in the builder and on this screen, and the builder hands
   * the pilot back here, so a read on entry is as fresh as it can be.
   *
   * Every track built in a world is listed, on any aircraft: a plane sees
   * only the ones it fits, by the rule it would race them under.
   */
  loadLocalCourses() {
    const af = airframeById(this.settings.airframe);
    let docs = [];
    try {
      docs = listMapTracks().filter((doc) => mapById(doc.map).id === doc.map && mapById(doc.map).build);
    } catch (e) {
      /* A library this browser will not hand over, which is private mode or
       * a quota. The board half of the screen is untouched by it, the same
       * way a board that is down leaves this half alone. */
    }
    /* Where each one stands with the tracks server, for its card, when
     * there is a server: online, or not yet and why. */
    const online = tracksConfigured() ? readOnlineStates() : {};
    this.localCourses = docs
      .filter((doc) => !af.fixedWing || planesFor(doc).includes(af.id))
      .map((doc) => ({
        id: doc.id,
        name: doc.name || str('ui.untitled_track'),
        map: doc.map,
        gates: raceGateCount(doc),
        author: '',
        online: online[doc.id] ? online[doc.id].state : '',
        doc,
      }));
    if (this.localNote) {
      this.localNote.textContent = this.localCourses.length ? '' : str('ui.no_tracks_of_your_own_yet');
    }
  }

  /*
   * Seat one of the pilot's own tracks, for Play. It goes in the share
   * seat, marked local, which is where the shell reads every track it flies
   * from, published or not: see writeShareImport in src/share/session.js.
   * One this browser has published is seated as its listing, so a lap on it
   * can still go back to the board.
   */
  seatLocal(id) {
    const doc = loadMapTrack(id);
    if (!doc) {
      this.localNote.textContent = str('ui.that_track_is_no_longer_saved');
      this.loadLocalCourses();
      return false;
    }
    const plain = toPlain(doc);
    const bind = readEditKey(doc.id) ? readBind(doc.id) : null;
    const seat = bind
      ? { id: doc.id, name: doc.name, author: bind.author, board: bind.board, document: plain }
      : { id: doc.id, name: doc.name, document: plain, local: true };
    if (!writeShareImport(seat)) {
      this.localNote.textContent = str('ui.this_browser_would_not_store_that');
      return false;
    }
    this.setShare(bind ? seat : null);
    return true;
  }

  /*
   * The board's tracks, fetched once per visit to My tracks, when there is
   * a board to ask (boardConfigured, src/share/board.js).
   *
   * A NICETY, NOT A DEPENDENCY. A board that is down, blocked or simply not
   * running leaves the pilot's own tracks exactly as they are, with one line
   * saying so.
   */
  loadBoardCourses() {
    if (!boardConfigured()) {
      this.boardCourses = [];
      this.boardNote.textContent = '';
      return;
    }
    if (this.boardLoading) {
      return;
    }
    this.boardLoading = true;
    this.boardNote.textContent = str('ui.reading_the_board');
    fetchTrackList(this.share && this.share.board ? this.share.board : undefined)
      .then((list) => {
        this.boardLoading = false;
        /*
         * ONLY THE TRACKS THIS AIRCRAFT MAY RACE, on a world this build can
         * seat a track in: a track on a world it does not know would be a
         * card that loads nothing, and a track drawn for the old race field
         * is one this simulator no longer flies. Every quad races every
         * track; a fixed wing races the ones whose every gate it fits (the
         * board's `planes`, src/game/verify.js planesFor), and its card
         * carries the plane board's record, since that is the board this
         * pilot's lap would go to.
         */
        const af = airframeById(this.settings.airframe);
        const onWorld = (t) => Boolean(t.map) && mapById(t.map).id === t.map && Boolean(mapById(t.map).build);
        const flyable = (t) => onWorld(t) && (!af.fixedWing || t.planes.includes(af.id));
        const asPlane = (t) => (af.fixedWing
          ? { ...t, recordMs: t.planeRecordMs, recordBy: t.planeRecordBy, times: t.planeTimes }
          : t);
        const rest = list.filter(flyable).map(asPlane);
        /* Every track, most flown first, so the tracks somebody has
         * actually raced are at the top and the long tail is underneath. */
        this.boardCourses = pickFeaturedTracks(rest, rest.length);
        if (this.boardCourses.length) {
          this.boardNote.textContent = '';
        } else if (list.length) {
          /* Say WHICH list came back empty. "Nothing here" in front of a
           * pilot who can see the board has tracks on it reads as broken;
           * "none for this aircraft" is a fact they can act on. */
          this.boardNote.textContent = str('ui.no_tracks_on_the_board_yet', { name: af.name.toLowerCase() });
        } else {
          this.boardNote.textContent = str('ui.no_published_tracks_on_the_board');
        }
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      })
      .catch(() => {
        this.boardLoading = false;
        this.boardCourses = [];
        this.boardNote.textContent = str('ui.the_board_is_not_answering_so');
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      });
  }

  /*
   * THE TRACKS SERVER'S HALF OF MY TRACKS, when there is a server
   * (src/share/cloud.js). Two things, in order: this pilot's own tracks
   * saved on another computer come into the library, so they are listed
   * with the rest of the pilot's; then the first page of everybody else's,
   * newest save first. `more` fetches the next page onto the end instead.
   *
   * Like the board, a nicety and not a dependency: a server that does not
   * answer leaves the pilot's own tracks exactly as they are, with one line
   * saying so.
   */
  loadCloudCourses(more = false) {
    if (!tracksConfigured() || this.cloudLoading) {
      return;
    }
    if (!more) {
      this.cloudCourses = [];
      this.cloudNext = '';
    }
    this.cloudLoading = true;
    this.localNote.textContent = str('cloud.reading');
    const repaint = () => {
      if (this.screen === 'courses') {
        this.renderMenu();
        this.renderCourseCards();
      }
    };
    (async () => {
      if (!more && await pullOwnTracks()) {
        this.loadLocalCourses();
      }
      const mine = await pilotKey();
      const af = airframeById(this.settings.airframe);
      const page = await fetchAllTracks({ before: more ? this.cloudNext : '' });
      /* The pilot's own are already in their list above. A plane is
       * offered only the tracks it fits, by the server's copy of the rule
       * the builder uses (src/game/verify.js planesFor). */
      const theirs = page.tracks.filter((t) => t.owner !== mine && (!af.fixedWing || t.planes.includes(af.id)));
      this.cloudCourses = [...this.cloudCourses, ...theirs];
      this.cloudNext = page.next;
      this.localNote.textContent = this.localCourses.length ? '' : str('ui.no_tracks_of_your_own_yet');
    })().catch(() => {
      this.localNote.textContent = str('cloud.not_answering');
    }).finally(() => {
      this.cloudLoading = false;
      repaint();
    });
  }

  /* Another pilot's track off the server, seated to fly as a track of
   * this browser's own would be: nothing is posted anywhere from it. */
  seatCloud(t, then) {
    this.localNote.textContent = str('ui.loading_2', { name: t.name });
    fetchTrack(t.id).then((got) => {
      const seat = { id: got.id, name: got.name, author: got.author, document: toPlain(got.doc), local: true };
      if (!writeShareImport(seat)) {
        this.localNote.textContent = str('ui.this_browser_would_not_store_that');
        return;
      }
      this.localNote.textContent = '';
      this.setShare(null);
      then();
    }).catch((err) => {
      this.localNote.textContent = str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err });
    });
  }

  /* Edit a copy: the copy is this pilot's from its first save, under a new
   * id, and opens in the builder in the track's world. */
  editCloudCopy(t) {
    this.localNote.textContent = str('ui.loading_2', { name: t.name });
    fetchTrack(t.id).then((got) => {
      const copy = duplicateTrack(got.doc, got.name);
      if (!saveTrack(copy)) {
        this.localNote.textContent = str('ui.this_browser_would_not_store_that');
        return;
      }
      this.localNote.textContent = '';
      this.cardSubject = null;
      this.openBuilder({ map: copy.map, id: copy.id });
    }).catch((err) => {
      this.localNote.textContent = str('ui.could_not_be_loaded', { name: t.name, v2: err.message ?? err });
    });
  }

  /*
   * Open the standings for one track, and go and get them.
   *
   * `track` is a board listing, the same shape loadBoardCourses holds: it
   * already carries the name, the author and the gate count, so the screen
   * has something to draw before the network answers. Only the times need
   * fetching, from the endpoint the ghost picker already calls.
   */
  showStandings(track) {
    if (!track || !track.id) {
      return;
    }
    this.standingsFor = track;
    this.standingsTimes = null;
    this.standingsError = '';
    /*
     * The navigation is done HERE rather than through act('standings').
     *
     * `standings` is also the name of the row that opens this screen for the
     * seated track, and act() would have matched that row's handler, which
     * calls back into here: one name doing two jobs, and the second of them
     * a loop. The screen still records where it was opened from, the same
     * way act() does for a room, so Back is the track list rather than the
     * title.
     */
    this.roomFrom = ROOM_PARENTS.has(this.screen) ? this.screen : null;
    this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
    this.show('standings');
    const key = track.id;
    this.standingsLoading = key;
    fetchTrackTimes(track.id, track.board)
      .then((times) => {
        if (this.standingsLoading !== key) {
          return;
        }
        this.standingsLoading = null;
        /* Fastest first. The board returns them in posting order. On a
         * track built inside a world the quads and the planes are two
         * boards, and the seated aircraft's is the one shown. */
        const plane = Boolean(airframeById(this.settings.airframe).fixedWing);
        const mine = track.map ? times.filter((t) => Boolean(t.craft) === plane) : times.slice();
        this.standingsTimes = mine.sort((a, b) => a.lapMs - b.lapMs);
        if (this.screen === 'standings') {
          this.paintStandings();
          this.renderMenu();
        }
      })
      .catch(() => {
        if (this.standingsLoading !== key) {
          return;
        }
        this.standingsLoading = null;
        this.standingsTimes = [];
        this.standingsError = str('ui.the_board_is_not_answering_so_2');
        if (this.screen === 'standings') {
          this.paintStandings();
          this.renderMenu();
        }
      });
  }

  /*
   * The table. Drawn rather than listed, for the reason in items(): forty
   * times as forty menu rows would make the cursor walk them all to reach
   * Back, and a leaderboard is a thing you read, not a thing you traverse.
   *
   * The pilot's own name is marked, because the one row a person looks for
   * in a leaderboard is their own.
   */
  paintStandings() {
    if (!this.standingsTable) {
      return;
    }
    const t = this.standingsFor;
    const table = this.standingsTable;
    table.textContent = '';
    if (this.standingsLede) {
      this.standingsLede.textContent = t
        ? [t.name, t.gates ? `${t.gates} gates` : '', byLine(t)]
          .filter(Boolean).join(' \u00b7 ')
        : '';
    }
    if (!t) {
      return;
    }
    if (this.standingsTimes == null) {
      table.append(el('div', 'standings-note', str('ui.reading_the_board')));
      return;
    }
    if (this.standingsError) {
      table.append(el('div', 'standings-note', this.standingsError));
      return;
    }
    if (!this.standingsTimes.length) {
      table.append(el('div', 'standings-note', str('ui.no_times_posted_on_this_track')));
      return;
    }
    const me = (readPilotName() || '').trim().toLowerCase();
    const head = el('div', 'standings-row standings-head');
    head.append(el('span', 'standings-rank', ''));
    head.append(el('span', 'standings-pilot', str('ui.pilot')));
    head.append(el('span', 'standings-lap', 'Lap'));
    table.append(head);
    this.standingsTimes.forEach((row, i) => {
      const line = el('div', 'standings-row');
      if (me && String(row.name || '').trim().toLowerCase() === me) {
        line.classList.add('is-me');
      }
      if (i === 0) {
        line.classList.add('is-record');
      }
      line.append(el('span', 'standings-rank', String(i + 1)));
      const who = el('span', 'standings-pilot', row.name || str('ui.unnamed_pilot'));
      if (row.hasGhost) {
        /* A ghost is the difference between reading a time and racing it,
         * so the rows that carry one say so. */
        who.append(el('span', 'standings-ghost', 'ghost'));
      }
      line.append(who);
      line.append(el('span', 'standings-lap', formatTime(row.lapMs)));
      table.append(line);
    });
  }

  /*
   * Start the thumbnails. Cached clips play immediately. A miss records
   * once, one world at a time, then the iframe (or the live copy of the
   * title view) is thrown away.
   */
  startReels() {
    this.stopReels();
    const cards = this.mapCards ?? [];
    const current = this.settings.map;
    const ac = new AbortController();
    const session = { ac, urls: [], unsub: [] };
    this.reelSession = session;
    this.reelFreezeWorld = false;

    const onVis = () => {
      const hide = document.hidden || this.screen !== 'courses';
      for (const c of this.mapCards || []) {
        if (!c.clip || !c.clip.pause) {
          continue;
        }
        if (hide) {
          c.clip.pause();
        } else {
          c.clip.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    session.unsub.push(() => document.removeEventListener('visibilitychange', onVis));

    const pending = [];
    for (const c of cards) {
      c.shot.replaceChildren();
      c.liveCanvas = null;
      c.clip = null;
      c.still.textContent = '';
      pending.push(c);
    }

    const run = async () => {
      const misses = [];
      for (const c of pending) {
        if (this.reelSession !== session) {
          return;
        }
        c.clipKey = clipKeyForMap(c.id);
        try {
          const blob = await getClip(c.clipKey);
          if (blob) {
            this.attachClip(c, blob, session);
            continue;
          }
        } catch (e) {
          /* Cache read failed: record instead. */
        }
        misses.push(c);
      }
      if (misses.length) {
        misses.forEach((c, i) => {
          c.jokeOff = i;
          this.showReelWait(c, session);
        });
        this.startReelJokes(session);
      }
      const currentMiss = misses.filter((c) => c.id === current);
      const otherMiss = misses.filter((c) => c.id !== current);
      /*
       * ONE AT A TIME, AND ONLY WHILE NOBODY IS USING THE ROOM.
       *
       * Each capture builds a Three.js scene in a same origin iframe, on
       * this thread, and blocks it for seconds. The cached clips above are
       * already attached by now, so what is left is only ever the first
       * visit in a given browser. Waiting for quiet before EACH one means
       * a pilot who arrives and immediately picks a world never pays for
       * any of it, and a pilot who stops to read gets them one by one.
       */
      for (const c of currentMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.whenQuiet(session);
        this.reelCapturing = true;
        try {
          await this.captureCurrentCard(c, session);
        } finally {
          this.reelCapturing = false;
        }
      }
      for (const c of otherMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.whenQuiet(session);
        this.reelCapturing = true;
        try {
          await this.captureRemoteCard(c, session);
        } finally {
          this.reelCapturing = false;
        }
      }
    };
    run().catch((e) => {
      if (e && e.name === 'AbortError') {
        return;
      }
      console.warn(e);
    });
  }

  attachClip(c, blob, session) {
    const { node, url } = makeClipElement(blob, 'map-reel-view');
    session.urls.push(url);
    c.liveCanvas = null;
    c.clip = node;
    c.wait = null;
    c.waitJoke = null;
    c.still.textContent = '';
    c.shot.replaceChildren(node);
    if (document.hidden && node.pause) {
      node.pause();
    }
  }

  showReelWait(c, session) {
    let wait = c.wait;
    if (!wait || !c.shot.contains(wait)) {
      wait = el('div', 'map-reel-wait');
      const stage = el('div', 'map-reel-wait-stage', 'loading');
      const joke = el('div', 'map-reel-wait-joke');
      wait.append(stage, joke);
      c.wait = wait;
      c.waitJoke = joke;
      c.shot.append(wait);
    }
    c.waitJoke.textContent = quotedJoke(session.jokeAt, c.jokeOff);
  }

  startReelJokes(session) {
    if (session.jokeTimer != null) {
      return;
    }
    session.jokeAt = 0;
    const tick = () => {
      session.jokeAt += 1;
      for (const c of this.mapCards || []) {
        if (c.waitJoke) {
          c.waitJoke.textContent = quotedJoke(session.jokeAt, c.jokeOff);
        }
      }
    };
    session.jokeTimer = setInterval(tick, JOKE_MS);
    session.unsub.push(() => {
      clearInterval(session.jokeTimer);
      session.jokeTimer = null;
    });
  }

  /*
   * The world already on screen is the title shot. Copy it into a 480p
   * canvas for a few seconds rather than loading the same map a second
   * time, then keep the clip.
   */
  async captureCurrentCard(c, session) {
    const canvas = el('canvas', 'map-reel-view');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = CLIP_W;
    canvas.height = CLIP_H;
    canvas.dataset.clip = '1';
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#1a241c';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    }
    c.shot.append(canvas);
    c.liveCanvas = canvas;
    c.still.textContent = '';
    this.showReelWait(c, session);
    try {
      await withCaptureLock(async () => {
        if (this.reelSession !== session) {
          return;
        }
        const again = await getClip(c.clipKey);
        if (again) {
          this.attachClip(c, again, session);
          return;
        }
        await whenVisible(session.ac.signal);
        const blob = await recordCanvasStream(canvas, CLIP_MS_MAX, session.ac.signal);
        await putClip(c.clipKey, blob);
        if (this.reelSession !== session) {
          return;
        }
        this.attachClip(c, blob, session);
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return;
      }
      c.wait = null;
      c.waitJoke = null;
      c.shot.replaceChildren();
      c.still.textContent = str('ui.preview_unavailable');
    } finally {
      c.liveCanvas = null;
    }
  }

  /*
   * A world that is not loaded: iframe the orbit page, which records,
   * caches, and posts the clip. Then the iframe dies.
   */
  async captureRemoteCard(c, session) {
    c.still.textContent = '';
    const frame = document.createElement('iframe');
    frame.className = 'map-reel-view';
    frame.title = str('ui.world_preview');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    c.shot.append(frame);
    this.showReelWait(c, session);
    this.reelFreezeWorld = true;
    try {
      await whenVisible(session.ac.signal);
      const blob = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, value) => {
          if (settled) {
            return;
          }
          settled = true;
          window.removeEventListener('message', onMsg);
          session.ac.signal.removeEventListener('abort', onAbort);
          clearTimeout(timer);
          if (err) {
            reject(err);
          } else {
            resolve(value);
          }
        };
        const onAbort = () => finish(new DOMException('aborted', 'AbortError'));
        const onMsg = (e) => {
          if (!e.data || e.data.type !== 'fdfpv-orbit-clip') {
            return;
          }
          if (frame.contentWindow !== e.source) {
            return;
          }
          const mime = e.data.mime || 'video/webm';
          const buffer = e.data.buffer;
          if (!buffer) {
            finish(new Error('Preview sent no clip.'));
            return;
          }
          finish(null, new Blob([buffer], { type: mime }));
        };
        const timer = setTimeout(() => finish(new Error('Preview timed out.')), 90000);
        session.ac.signal.addEventListener('abort', onAbort);
        window.addEventListener('message', onMsg);
        if (session.ac.signal.aborted) {
          onAbort();
          return;
        }
        frame.src = new URL(`../share/orbit.html?map=${encodeURIComponent(c.id)}`, import.meta.url).href;
      });
      if (this.reelSession !== session) {
        return;
      }
      await putClip(c.clipKey, blob);
      this.attachClip(c, blob, session);
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return;
      }
      c.wait = null;
      c.waitJoke = null;
      c.shot.replaceChildren();
      c.still.textContent = str('ui.preview_unavailable');
    } finally {
      if (frame.parentNode) {
        frame.remove();
      }
      if (this.reelSession === session) {
        this.reelFreezeWorld = false;
      }
    }
  }

  /*
   * Copy the title view onto the card for the world that is already loaded,
   * and onto the recorder, while a first clip is being made. After that
   * there is nothing to copy: the cards are videos.
   */
  paintMapThumbs(src) {
    if (this.screen !== 'courses' || !this.mapCards) {
      return;
    }
    const sw = src.width;
    const sh = src.height;
    if (!(sw > 0 && sh > 0)) {
      return;
    }
    for (const c of this.mapCards) {
      const dest = c.liveCanvas;
      if (!dest) {
        continue;
      }
      if (dest.dataset.clip !== '1') {
        const dw = Math.max(1, dest.clientWidth);
        const dh = Math.max(1, dest.clientHeight);
        if (dest.width !== dw || dest.height !== dh) {
          dest.width = dw;
          dest.height = dh;
        }
      }
      const dw = dest.width;
      const dh = dest.height;
      const scale = Math.max(dw / sw, dh / sh);
      const cw = dw / scale;
      const ch = dh / scale;
      try {
        dest.getContext('2d').drawImage(
          src,
          (sw - cw) * 0.5, (sh - ch) * 0.5, cw, ch,
          0, 0, dw, dh,
        );
      } catch (e) {
        /* A tainted read would take the frame with it. */
      }
    }
  }

  /*
   * Any input at all, noted so the preview recorder can get out of the way.
   *
   * Recording a world preview loads orbit.html in a same origin iframe,
   * which builds a whole Three.js scene ON THIS THREAD. Measured on arrival
   * at the Freestyle room with a cold cache: 23 frames in 10.4 seconds and
   * a single gap of 5155 ms with no paint at all. Reported as "the
   * freestyle page is unresponsive when I get to it, becomes responsive
   * after a time", which is exactly what four of those in a row is.
   *
   * The recording is worth having: it is cached per browser, so the cost is
   * paid once and every later visit is instant. What is not worth having is
   * paying it WHILE somebody is trying to use the room. So input wins:
   * every cursor move and every key press pushes the recorder back, and it
   * only runs after the room has been quiet.
   */
  noteInteraction() {
    this.lastInteractionAt = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    /*
     * A capture already running is TORN DOWN, not merely delayed.
     *
     * Waiting for quiet before starting one is not enough on its own: a
     * pilot who arrives, reads a card for a second and then reaches for the
     * arrow keys walks straight into the middle of a 4.6 second block that
     * has already begun. Removing the iframe ends its browsing context, so
     * the scene it was building stops there.
     *
     * The work is not lost for good. The room re-arms itself below and the
     * capture starts again the next time the room is quiet, and once it
     * finishes the clip is cached for every later visit.
     */
    if (this.reelCapturing && this.reelSession) {
      this.stopReels();
      this.armReels();
    }
  }

  /* Re-arm the preview recorder after an interaction tore it down. One
   * timer, replaced rather than stacked, so a pilot arrowing down four
   * cards schedules one restart and not four. */
  armReels() {
    if (this.reelRestart != null) {
      clearTimeout(this.reelRestart);
    }
    this.reelRestart = setTimeout(() => {
      this.reelRestart = null;
      if (this.screen === 'courses' || this.screen === 'freestyle') {
        this.startReels();
      }
    }, REEL_QUIET_MS);
  }

  /*
   * Resolve once the room has been untouched for REEL_QUIET_MS, or reject
   * if the session was torn down while waiting. Polled rather than driven
   * by an event, because the thing being waited for is an ABSENCE.
   */
  whenQuiet(session) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!session || this.reelSession !== session || session.ac.signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        const now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now() : Date.now();
        const since = now - (this.lastInteractionAt || 0);
        if (since >= REEL_QUIET_MS) {
          resolve();
          return;
        }
        session.quietTimer = setTimeout(check, Math.max(80, REEL_QUIET_MS - since));
      };
      check();
    });
  }

  stopReels() {
    this.reelFreezeWorld = false;
    this.reelCapturing = false;
    if (this.reelSession && this.reelSession.quietTimer) {
      clearTimeout(this.reelSession.quietTimer);
    }
    if (this.reelSession) {
      try {
        this.reelSession.ac.abort();
      } catch (e) {
        /* Already aborted. */
      }
      if (this.reelSession.unsub) {
        for (const fn of this.reelSession.unsub) {
          fn();
        }
      }
      if (this.reelSession.urls) {
        for (const url of this.reelSession.urls) {
          URL.revokeObjectURL(url);
        }
      }
    }
    this.reelSession = null;
    if (this.reelRaf != null) {
      cancelAnimationFrame(this.reelRaf);
      this.reelRaf = null;
    }
    if (this.mapCards) {
      for (const c of this.mapCards) {
        c.liveCanvas = null;
        c.clip = null;
        if (c.shot) {
          c.shot.replaceChildren();
        }
      }
    }
  }

  show(screen) {
    this.closeDrop();
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

  bindWikiHash() {
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
    if (h.startsWith('wiki/')) {
      window.location.replace(wikiPageUrl(h));
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
      if (board) {
        this.openBoardCourse(t.id, () => this.play());
      } else if (this.seatLocal(t.id)) {
        this.play();
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
   * does not fit gives way to the five inch.
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
    const want = airframeById('5inch');
    seatAirframe(this.settings, want.id);
    this.settings.airframeAsked = true;
    this.writeSettings();
    return want;
  }

  /*
   * Keep the mode legal for the seated aircraft.
   *
   * A whoop has nowhere to freestyle, so on one the mode is not a question:
   * see freestyleOffered. It races, and with no track seated its world is
   * the Track seat's home, the Swiss valley. That covers a leftover
   * 'freestyle' from the five inch and a mode that was never set, and it is
   * what makes a ?craft=whoop65 link one press from the air rather than a
   * card away from it.
   *
   * The gate is the one place this must not run, and craftGate is the half
   * of it that says so. There the mode is deliberately blank and the pilot
   * is one press from seating the OTHER aircraft, so answering the mode on
   * a whoop's behalf while the cards are up would close the gate under a
   * pilot who was about to choose the five inch.
   *
   * The SEAT moves with the mode, because a mode on its own is a word: a
   * pilot who swaps to the whoop from inside the town would otherwise be in
   * race with the town still seated, which is the whoop in the five inch's
   * five hundred metre world, drawn behind the title, and is the exact thing
   * this is here to stop. It is also the state every pilot who flew the town
   * on a whoop before this already has in storage, so the boot call has to
   * repair it and not only the swap. freestyleMap is left alone, so swapping
   * back to the five inch puts them in the town they left.
   *
   * Returns whether it changed anything, because two of the three callers
   * store the settings themselves and one of them stores them once.
   */
  syncMode() {
    if (this.craftGate || freestyleOffered(this.settings.airframe)) {
      return false;
    }
    let moved = false;
    if (this.mode !== 'race') {
      this.mode = 'race';
      moved = true;
    }
    if (this.settings.map !== 'track') {
      this.settings.map = 'track';
      moved = true;
    }
    return moved;
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
      const at = items.findIndex(
        (it) => it.action === seatedWay(this.settings, this.mode).action,
      );
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
   * The track record, and which world we are in. One call because they change
   * together: a freestyle map has no record to show and the title's subtitle
   * has to stop claiming a time trial.
   */
  setBest(ms, mode) {
    if (mode) {
      this.osdMode = mode;
    }
    /* Held so refreshBest can redraw the line without a record in hand. */
    this.lastBestMs = ms;
    /*
     * UNDEFINED IS A SEAT THE SHELL HAS NOT BUILT. The title shows its own
     * world until the first fly (src/main.js), so the line speaks for the
     * seat, which is what Fly will fly, and names no record, because the
     * seat's record is not known until its course is built.
     */
    const unbuilt = ms === undefined;
    const freestyle = unbuilt ? !seatIsRace(this.settings) : this.osdMode === 'freestyle';
    /*
     * The score follows the MODE as well as the screen. show() decides
     * visibility too, and on its own that is an ordering dependency: the
     * mode changes when a map is swapped and the screen does not have to
     * change with it. A custom track with no gates is a freestyle map by
     * scene.js's own definition, so swapping onto one has to light the
     * score up without waiting for the next show().
     */
    this.syncScoreVisible();
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    const seat = this.settings.map === 'track' ? activeCourseSummary() : null;
    const worldName = (seat && seat.name) || m.name;
    if (this.brandSub) {
      /*
       * "no gates" rather than "free flight", which was the strapline and
       * was also the on-screen LABEL of the middle Scoring position: see
       * FREESTYLE_SCORING_LABEL. So the title named a scoring mode the
       * pilot had not picked, in the same words the Scoring row uses to
       * name the one they had, and the two surfaces disagreed using one
       * vocabulary. No gates is true in all three positions and is the
       * Freestyle room's own first sentence about the place.
       */
      this.brandSub.textContent = freestyle ? str('ui.no_gates_2', { worldName }) : str('ui.time_trial', { worldName });
    }
    this.titleBest.textContent = '';
    if (freestyle) {
      /*
       * It had "no clock, no lap" on it, which was true of freestyle until
       * a run became two minutes with a score at the end. There is still no
       * lap and there are still no gates.
       *
       * AND THE TWO MINUTES ARE THE SCORED RUN'S, so they are said only
       * when the pilot has asked for a scored run. This is the first line
       * on the first screen after choosing Freestyle, and with Scoring at
       * its default it was telling a pilot they had a two minute clock
       * while nothing else in the product agreed: no overlay, an OSD slot
       * reading Air, and a run that never ends. Off and free flight have
       * no clock, so they say so. See DEFAULTS.freestyleScoring, and the
       * pre takeoff banner in src/main.js, which is the same sentence in
       * the same trap.
       */
      this.titleBest.textContent = this.settings.freestyleScoring === 'scored'
        ? str('ui.no_gates_no_lap_two_minutes')
        : str('ui.no_gates_no_lap_no_clock');
      this.osdBest.textContent = '';
      return;
    }
    if (unbuilt) {
      this.osdBest.textContent = '';
      return;
    }
    if (ms != null) {
      this.titleBest.append(str('ui.track_record'), el('span', 'brand-best-time', formatTime(ms)));
    } else {
      this.titleBest.textContent = str('ui.no_lap_recorded_yet');
    }
    this.osdBest.textContent = ms != null ? str('ui.record', { formatTime: formatTime(ms) }) : str('ui.no_record_yet');
  }

  /*
   * REDRAW THE TITLE'S RECORD LINE FROM STATE THAT IS ALREADY HERE.
   *
   * setBest writes three things a settings change can invalidate: the
   * freestyle line, which now names the Scoring position, the strapline,
   * and the overlay's visibility. Only src/main.js calls it, and only on a
   * map load or the end of a run, so a pilot who changed Scoring in the
   * Freestyle room and backed out to the title read the PREVIOUS position's
   * sentence until the next world loaded. Every settings commit goes
   * through writeSettings or pick, so both call this.
   */
  refreshBest() {
    if (!this.titleBest) {
      return;
    }
    this.setBest(this.lastBestMs);
  }

  resultsCourseName() {
    if (this.share && this.share.name) {
      return this.share.name;
    }
    if (this.settings.map === 'track') {
      try {
        const listing = inspectCourse();
        if (listing && listing.name) {
          return listing.name;
        }
      } catch (e) {
        /* Fall through to the map name. */
      }
    }
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    return m.name;
  }

  /*
   * log is the race's record of every lap attempted, in order, clean or
   * thrown away. Voided attempts keep their lap number and appear as
   * rows: renumbering the survivors tells the player they flew a
   * different race from the one they remember.
   *
   * recordAtStart is the track record as the run began. The live best
   * may have moved during the run, and the hero line needs the old
   * figure to say whether this lap beat it.
   */
  showResults(log, best, recordAtStart, ghostNote = null) {
    this.roomResults = false;
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    const clean = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
    const fastest = clean.length ? Math.min(...clean) : null;
    const slowest = clean.length ? Math.max(...clean) : null;
    const hadRecord = recordAtStart != null && Number.isFinite(recordAtStart);
    const isRecord = fastest != null && (!hadRecord || fastest < recordAtStart);
    const matched = fastest != null && hadRecord && fastest === recordAtStart;
    const screen = this.screens.results;
    screen.classList.toggle('is-record', Boolean(isRecord));
    screen.classList.toggle('is-empty', !clean.length);
    screen.classList.remove('is-in');
    void screen.offsetWidth;
    screen.classList.add('is-in');

    this.resultsKicker.textContent = this.resultsCourseName();
    if (!clean.length) {
      this.resultsHead.textContent = str('ui.run_ended');
      this.resultsHeroTime.textContent = '';
      this.resultsHeroMeta.textContent = '';
      this.resultsHeroMeta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', str('ui.no_clean_lap_this_run_hitting')));
    } else {
      this.resultsHead.textContent = isRecord
        ? str('ui.new_track_record')
        : (matched ? str('ui.matched_the_record') : str('ui.run_complete'));
      /* The best single lap is the headline, which is what MultiGP's time
       * trial is scored on. */
      this.resultsHeroCap.textContent = clean.length === 1 ? str('ui.lap_time') : str('ui.best_lap');
      this.resultsHeroTime.textContent = formatTime(fastest);
      if (isRecord && hadRecord) {
        this.resultsHeroMeta.textContent = str('ui.previous', { formatDelta: formatDelta(fastest - recordAtStart), formatTime: formatTime(recordAtStart) });
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else if (isRecord) {
        this.resultsHeroMeta.textContent = str('ui.first_record_on_this_track');
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else if (matched) {
        this.resultsHeroMeta.textContent = str('ui.equals_the_record_2', { formatTime: formatTime(best) });
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else {
        this.resultsHeroMeta.textContent = str('ui.off_the_record_to_beat', { formatDelta: formatDelta(fastest - best), formatTime: formatTime(best) });
        this.resultsHeroMeta.className = 'results-hero-meta off';
      }
    }
    log.forEach((entry) => {
      const fastestRow = entry.ms != null && entry.ms === fastest;
      const row = el('div', `result-row${entry.ms == null ? ' void' : ''}${fastestRow ? ' fastest' : ''}`);
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', str('ui.lap', { n: entry.n })));
      if (entry.ms == null) {
        main.append(el('span', 'result-time', 'void'));
        main.append(el('span', 'result-why', (entry.reason || '').replace(/\n/g, ' ').toLowerCase()));
        row.append(main);
      } else {
        main.append(el('span', 'result-time', formatTime(entry.ms)));
        /* A plane's lap is scored (src/game/race.js PLANE_REACH). */
        if (Number.isFinite(entry.score)) {
          main.append(el('span', 'result-tag', plural('count.points', entry.score)));
        }
        if (fastestRow && clean.length > 1) {
          main.append(el('span', 'result-tag', 'fastest'));
        }
        row.append(main);
        if (slowest > 0) {
          const bar = el('div', 'result-bar');
          const fill = el('div', 'result-bar-fill');
          fill.style.width = `${Math.max(10, (entry.ms / slowest) * 100)}%`;
          bar.append(fill);
          row.append(bar);
        }
      }
      this.resultsBody.append(row);
    });
    /* The footing row: the laps added up. */
    const total = clean.length > 1 ? clean.reduce((a, b) => a + b, 0) : null;
    if (total != null) {
      const row = el('div', 'result-row total');
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', clean.length === log.length ? str('ui.total') : str('ui.clean_laps_total')));
      main.append(el('span', 'result-time', formatTime(total)));
      row.append(main);
      this.resultsBody.append(row);
    }
    /* A scored run's points, added up, beside its time. */
    const scores = log.filter((l) => Number.isFinite(l.score)).map((l) => l.score);
    if (scores.length) {
      const row = el('div', 'result-row total');
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', str('ui.run_score')));
      main.append(el('span', 'result-time', plural('count.points', scores.reduce((a, b) => a + b, 0))));
      row.append(main);
      this.resultsBody.append(row);
    }
    /* How the run went against the ghost that was being chased, one line,
     * written by the shell because only it knows who the ghost was. */
    if (ghostNote) {
      this.resultsBody.append(el('p', 'results-ghost', ghostNote));
    }
    /* The note is about the course that was FLOWN. It used to read
     * inspectCourse unconditionally, so a lap on the race field came back
     * with a line about whatever course happened to be on the builder's
     * canvas, named and everything. */
    if (this.settings.map !== 'track') {
      this.resultsNote.textContent = '';
    } else if (this.share && this.share.id) {
      const by = this.share.author ? str('ui.by_4', { author: this.share.author }) : '';
      this.resultsNote.textContent = str('ui.is_on_the_public_board_upload', { v1: this.share.name || str('ui.this_track'), by });
    } else {
      try {
        const listing = inspectCourse();
        if (listing && listing.kind === 'remix') {
          const of = listing.sourceName ? str('ui.of', { sourceName: listing.sourceName }) : '';
          this.resultsNote.textContent = str('ui.is_your_copy_publish_it_under', { name: listing.name, of });
        } else if (listing && listing.kind === 'local' && listing.canPublishNew) {
          this.resultsNote.textContent = str('ui.lives_in_this_browser_publish_it', { name: listing.name });
        } else if (listing && listing.kind === 'owned' && listing.layoutDrift) {
          this.resultsNote.textContent = str('ui.has_a_layout_that_is_not', { name: listing.name });
        }
      } catch (e) {
        /* A summary failure must not hide the times. */
      }
    }
    this.timePosted = null;
    this.resultsFastest = fastest;
    if (fastest != null) {
      try {
        const listing = inspectCourse();
        if (listing && listing.canPostTime && listing.shareId) {
          writePendingTime({
            trackId: listing.shareId,
            lapMs: fastest,
            craft: lapCraftOf(listing.doc, this.settings.airframe),
          });
        }
      } catch (e) {
        /* Keep the results screen even if storage is unavailable. */
      }
    }
    this.show('results');
    /* The one automatic offer of the flight feel question, because this is
     * the only place a first race finishes. */
    this.maybeOfferFeel();
  }

  /*
   * A room's race on the same screen (src/share/roomrace.js): everybody in
   * it in order, one row each, written by the shell because only it knows
   * the pilots' names. v is { kicker, head, heroCap, heroTime, heroMeta,
   * win, rows: [{ label, time, tag, me, out }] }. Called again as the
   * others finish; nothing here is posted anywhere.
   */
  showRoomResults(v) {
    this.roomResults = true;
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    const screen = this.screens.results;
    screen.classList.toggle('is-record', Boolean(v.win));
    screen.classList.remove('is-empty');
    this.resultsKicker.textContent = v.kicker;
    this.resultsHead.textContent = v.head;
    this.resultsHeroCap.textContent = v.heroCap;
    this.resultsHeroTime.textContent = v.heroTime;
    this.resultsHeroMeta.textContent = v.heroMeta;
    this.resultsHeroMeta.className = 'results-hero-meta';
    for (const r of v.rows) {
      const row = el('div', `result-row${r.out ? ' void' : ''}${r.me ? ' fastest' : ''}`);
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', r.label), el('span', 'result-time', r.time));
      if (r.tag) {
        main.append(el('span', 'result-tag', r.tag));
      }
      row.append(main);
      this.resultsBody.append(row);
    }
    if (this.screen !== 'results') {
      screen.classList.remove('is-in');
      void screen.offsetWidth;
      screen.classList.add('is-in');
      this.show('results');
    } else {
      this.renderMenu();
    }
  }

  /* `panelled` true boxes the text in the middle of the frame; 'edge' is
   * one compact line under the OSD's top block, for a message about a
   * craft the camera is looking at (a wreck), which the box would cover. */
  /* The banner's line and the OSD's top block share the top of the screen,
   * and the block is as tall as it wraps: three lines on a desktop, six on a
   * phone held upright, where a fixed offset landed the banner on the last
   * lap and record lines. So a banner on the flight screen stands under the
   * block's measured bottom. One layout read, only while a banner shows, and
   * a write only when the bottom moved. */
  seatBannerUnderOsd(on) {
    const block = this.osdTopBlock;
    const holder = this.banner.offsetParent;
    const bottom = on && block && holder && block.offsetHeight > 0
      ? Math.round(block.getBoundingClientRect().bottom - holder.getBoundingClientRect().top + 10)
      : null;
    if (this.banner.__wfTop !== bottom) {
      this.banner.__wfTop = bottom;
      this.banner.style.top = bottom == null ? '' : `${bottom}px`;
    }
  }

  setBanner(text, panelled = false) {
    /* Called from the frame loop as well as from events, so it is guarded
     * like the OSD. */
    const want = text || '';
    /* For the FPV OSD, which draws the banner itself in its own type
     * (src/ui/fpvhud.js) while the element is hidden. */
    this.bannerText = want;
    Ui.text(this.banner, want);
    const opacity = want ? '1' : '0';
    if (this.banner.__wfOpacity !== opacity) {
      this.banner.__wfOpacity = opacity;
      this.banner.style.opacity = opacity;
    }
    Ui.klass(this.banner, panelled === 'edge' ? 'banner edge' : panelled ? 'banner panel' : 'banner');
    this.seatBannerUnderOsd(want && panelled !== true);
    /* The announcer is the one place a screen reader hears a banner at all;
     * see mountAnnouncer. Only real text, and only when it changes. */
    if (want) {
      this.announce(want);
    }
  }

  /*
   * THE TARGET MARK: the answer to "where is the next one".
   *
   * A lit gate can only be found by a pilot who is already looking at it.
   * The report this exists for is the other case: the target is behind a
   * clubhouse, or off the side of a 117 degree frame, or simply one of
   * fourteen structures in a valley, and there is nothing on screen that
   * says which way to turn. Every racing game solves that on the display
   * rather than in the world, because the display is the one surface that
   * cannot be occluded.
   *
   * Two states, one element. In frame, it is a bracket around the opening,
   * sized to the aperture, so it reads as a lock on that object rather than
   * as a dot near it. Out of frame or behind, it is a chevron pinned inside
   * the edge, pointing the shortest way round. Both carry the range and
   * both take their colour from the same half space test the gate does, so
   * the display and the world can never disagree about which way through.
   *
   * It lets go inside 6 m. By then the gate is most of the frame and a
   * bracket around it is a box drawn on a barn door.
   */
  buildTargetLock() {
    this.lock = el('div', 'lock is-off');
    this.lockBox = el('div', 'lock-box');
    this.lockBox.append(el('i', 'lc tl'), el('i', 'lc tr'), el('i', 'lc bl'), el('i', 'lc br'));
    this.lockArrow = el('div', 'lock-arrow');
    this.lockDist = el('div', 'lock-dist', '');
    this.lock.append(this.lockBox, this.lockArrow, this.lockDist);
    /* Last written values. Every one of these is a style write per frame if
     * it is not cached, and a style write is layout the browser may or may
     * not be able to skip. The mark is on screen for a whole race. */
    this.lockLast = { cls: '', tx: '', bx: '', ax: '', dx: '', text: '', op: '' };
    return this.lock;
  }

  /*
   * `x` and `y` are CSS pixels from the top left of the canvas, already
   * clamped into the frame by the shell, which is the only place that knows
   * the canvas size. `size` is the projected aperture in CSS pixels, `angle`
   * the chevron's heading in degrees clockwise from up.
   */
  setTargetLock({ show, x, y, size, angle, edge, wrong, distance, fade }) {
    if (!this.lock) {
      return;
    }
    const last = this.lockLast;
    const cls = show
      ? `lock${edge ? ' is-edge' : ''}${wrong ? ' is-wrong' : ''}`
      : 'lock is-off';
    if (cls !== last.cls) {
      this.lock.className = cls;
      last.cls = cls;
    }
    if (!show) {
      return;
    }
    const tx = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (tx !== last.tx) {
      this.lock.style.transform = tx;
      last.tx = tx;
    }
    const op = fade < 0.995 ? fade.toFixed(2) : '';
    if (op !== last.op) {
      this.lock.style.opacity = op;
      last.op = op;
    }
    if (edge) {
      const ax = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;
      if (ax !== last.ax) {
        this.lockArrow.style.transform = ax;
        last.ax = ax;
      }
    } else {
      const bx = `${size.toFixed(0)}px`;
      if (bx !== last.bx) {
        this.lockBox.style.width = bx;
        this.lockBox.style.height = bx;
        last.bx = bx;
      }
    }
    /* The label sits under whichever mark is showing, which are two
     * different heights, so it is placed rather than laid out. */
    const drop = (edge ? 15 : size * 0.5) + 11;
    const dx = `translate(-50%, ${drop.toFixed(0)}px)`;
    if (dx !== last.dx) {
      this.lockDist.style.transform = dx;
      last.dx = dx;
    }
    /* Whole metres. A tenth of a metre at 30 m/s is three hundredths of a
     * second and reads as a smear of digits. */
    const text = `${Math.round(distance)} m`;
    if (text !== last.text) {
      this.lockDist.textContent = text;
      last.text = text;
    }
  }

  /*
   * Flight overlay values. Prose and units a pilot reads: seconds, volts,
   * metres, kilometres per hour. No identifiers, no raw state.
   */
  /*
   * The flight display.
   *
   * `mode` is 'race' or 'freestyle', and it is not a cosmetic switch: a
   * freestyle map has no gates, no lap and no record, so a HUD that showed
   * "Gate 1 of 0" and a lap clock counting from a line that does not exist
   * would be reporting three things that are not true. What it shows instead
   * is what a freestyle pilot actually reads.
   *
   *   THE RUN CLOCK, not a lap and no longer an airtime. It was an airtime,
   *   counting up, on the reasoning that freestyle is flown in packs and how
   *   long you have been up decides when to come home. That was right while
   *   nothing was being measured. A freestyle run is two minutes now, with a
   *   score at the end of it that goes on a public board, so the number a
   *   pilot needs is how much of it is LEFT: the last twenty seconds are when
   *   they decide whether to try the big line, and they cannot decide that
   *   without knowing they are the last twenty seconds.
   *
   *   It is in the lap clock's slot, top centre, rather than beside the
   *   score. That is where a pilot already looks for a clock, and it means
   *   there is exactly ONE clock on the screen: an airtime counting up
   *   beside a run counting down is two answers to the same question.
   *   ALTITUDE ABOVE THE GROUND UNDER THE CRAFT. This one is not optional in
   *   a city. Cross one street and the surface under you moves seven metres,
   *   from the road to the overbridge deck; a height measured from the spawn,
   *   which is what this used to show, is a number that means nothing over a
   *   roof. The shell measures it against the surface query the collision
   *   test uses, so the readout and the thing that kills you agree.
   *   Speed, pack and throttle are the same in both, because they are
   *   properties of the machine and not of the game around it.
   */
  /*
   * Say something once, to whoever is listening. The guard is the point: a
   * live region re-reads its contents when they change, and setBanner runs
   * on the frame loop, so an unguarded write would speak the same sentence
   * sixty times a second.
   */
  announce(text) {
    const want = text == null ? '' : String(text);
    if (!this.announcer || this.announcer.__wfSaid === want) {
      return;
    }
    this.announcer.__wfSaid = want;
    this.announcer.textContent = want;
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

  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle, flightMode, flaps = null, gear = null, bounces, launchState, launchPitch, ghostGapMs, ghostFinal, runState, runRemainMs, runTimed, runScored }) {
    const freestyle = mode === 'freestyle';
    /* Before the first gate there is no lap to time, so the clock reads
     * zero and dims rather than showing a row of dashes. */
    const running = lapMs != null && Number.isFinite(lapMs);
    if (freestyle) {
      /*
       * The run has not started until the first trick, so the clock says so
       * rather than showing two minutes that are not counting. Dimmed by
       * the same `waiting` class the lap clock uses before the first gate,
       * which is the same state for the same reason.
       */
      if (runScored === false) {
        /*
         * SCORING OFF MEANS THERE IS NO RUN, so the slot goes back to the
         * airtime it carried before a run was a thing that ends: the sim
         * clock since this flight began, which is what a pilot flying a
         * pack wants beside the pack bar. See the note above about this
         * slot having counted an airtime up in it.
         */
        Ui.text(this.osdClockLabel, 'Air');
        Ui.text(this.osdTimer, running ? formatTime(lapMs) : '0.00');
        Ui.klass(this.osdTimer, running ? 'osd-timer' : 'osd-timer waiting');
      } else if (runTimed === false) {
        /*
         * FREE FLIGHT HAS NO CLOCK, and the slot is not left empty: a blank
         * where a number belongs reads as a fault. It says what it is.
         */
        Ui.text(this.osdClockLabel, 'Run');
        Ui.text(this.osdTimer, 'Free');
        Ui.klass(this.osdTimer, 'osd-timer waiting');
      } else {
        const ready = runState !== 'flying' && runState !== 'over';
        const left = Number.isFinite(runRemainMs) ? runRemainMs : 0;
        Ui.text(this.osdClockLabel, 'Run');
        Ui.text(this.osdTimer, ready ? '2:00' : formatRunClock(left));
        Ui.klass(this.osdTimer, ready
          ? 'osd-timer waiting'
          : (left <= 10_000 ? 'osd-timer is-late' : 'osd-timer'));
      }
    } else {
      Ui.text(this.osdClockLabel, 'Lap');
      Ui.text(this.osdTimer, running ? formatTime(lapMs) : '0.00');
      Ui.klass(this.osdTimer, running ? 'osd-timer' : 'osd-timer waiting');
    }
    if (freestyle) {
      Ui.text(this.osdGate, '');
    } else if (gateCue) {
      Ui.text(this.osdGate, str('ui.gate_of', { gate, gateCount, gateCue }));
    } else {
      Ui.text(this.osdGate, str('ui.gate_of_2', { gate, gateCount }));
    }
    Ui.text(this.osdPack, `${volts.toFixed(1)} volts`);
    Ui.text(this.osdLast, !freestyle && lastLapMs != null ? str('ui.last_lap', { formatTime: formatTime(lastLapMs) }) : '');
    if (this.osdGhost) {
      if (ghostGapMs == null || freestyle) {
        Ui.klass(this.osdGhost, 'osd-ghost is-off');
        Ui.text(this.osdGhost, '');
      } else {
        /* Negative is you ahead of the ghost. The sign is spelled out so
         * the readout cannot be mistaken for a lap time. */
        const ahead = ghostGapMs <= 0;
        const gap = `${ahead ? '-' : '+'}${(Math.abs(ghostGapMs) / 1000).toFixed(2)}`;
        Ui.text(this.osdGhost, `${ghostFinal ? str('ui.ghost_lap') : str('ui.ghost')} ${gap}`);
        Ui.klass(this.osdGhost, `osd-ghost ${ahead ? 'ahead' : 'behind'}`);
      }
    }
    Ui.bar(this.osdPackBar, packFrac);
    Ui.text(this.osdSpeed, str('ui.km_h', { speedKph: speedKph.toFixed(0) }));
    if (this.osdFlight) {
      Ui.text(this.osdFlight, flightMode === 'turtle'
        ? str('ui.turtle')
        : (launchState === 1 || launchState === 2
          ? str('ui.launch_2')
          : ({ angle: str('ui.angle'), stab: str('ui.stabilised'), manual: str('ui.manual') }[flightMode] ?? str('ui.acro'))));
    }
    if (this.osdFlaps) {
      Ui.text(this.osdFlaps, flaps == null ? '' : [str('ui.flaps_up'), str('ui.flaps_half'), str('ui.flaps_full')][flaps]);
    }
    if (this.osdGear) {
      Ui.text(this.osdGear, gear == null ? '' : gear === 'up' ? str('ui.gear_up') : gear === 'down' ? str('ui.gear_down') : str('ui.gear_moving'));
    }
    if (this.osdLaunch) {
      const on = launchState > 0;
      Ui.klass(this.osdLaunch, 'osd-launch'
        + (on ? '' : ' is-off')
        + (launchState === 2 ? ' is-hot' : '')
        + (launchState === 3 ? ' is-go' : ''));
      if (!on) {
        Ui.text(this.osdLaunch, '');
      } else if (launchState === 3) {
        Ui.text(this.osdLaunch, 'GO');
      } else {
        const deg = Math.round(launchPitch || 0);
        Ui.text(this.osdLaunch, deg > 2 ? str('ui.launch', { deg }) : 'LAUNCH');
      }
    }
    Ui.text(this.osdAlt, str('ui.m_above_the_ground', { altitude: altitude.toFixed(1) }));
    Ui.bar(this.osdThrBar, throttle);
    if (this.osdHits) {
      /*
       * IT COUNTS UP NOW, AND IT COSTS NOTHING.
       *
       * This row used to read "Hits left 2 of 3" and it was a durability
       * model: the third firm contact of a lap ended the run. There is no
       * wreck any more, an airframe cannot be spent, and a countdown to a
       * thing that no longer happens is worse than no row at all. What is
       * still worth telling a pilot is how much they are bouncing, so the
       * row says that, in the neutral colour, and it says nothing at all
       * until there is something to say.
       */
      if (!bounces) {
        this.osdHits.textContent = '';
      } else {
        this.osdHits.textContent = bounces === 1 ? '1 bounce' : `${bounces} bounces`;
        this.osdHits.className = 'osd-sub osd-hits';
      }
    }
  }

  /*
   * The freestyle score overlay. Three calls rather than one because they
   * run at three different rates: the view every frame, the events only
   * when something happened, and the visibility only when the screen
   * changes. Folding them into one call would mean handing the HUD a view
   * on frames where it has nothing to do.
   */
  syncScoreVisible() {
    /* setBest can be reached before build() has run in a future caller, and
     * a missing overlay is not worth a crash on a screen change. */
    if (!this.scoreHud) {
      return;
    }
    /* Scoring switched off means there is no overlay at all, not an empty
     * one: a zero sitting on the screen for a run that is not being scored
     * is a readout that cannot ever change, which reads as a fault. */
    this.scoreHud.setVisible(
      this.osdMode === 'freestyle'
      && this.settings.freestyleScoring !== 'off'
      && (this.screen === 'flight' || this.screen === 'paused'),
    );
  }

  setScore(view) {
    this.scoreHud.update(view);
  }

  scoreEvents(list) {
    this.scoreHud.events(list);
  }

  showScore(on) {
    this.scoreHud.setVisible(on);
  }

  resetScore() {
    this.scoreHud.reset();
    /* A new run has nothing posted and nothing to post. Without this a
     * pilot who flew a second run saw the first one's "Run posted" row. */
    this.freestyleRun = null;
    this.runPosted = null;
  }

  /* The freestyle board's answer, so the results row can say what happened
   * rather than staying on the verb. */
  markRunPosted(posted) {
    this.runPosted = posted || { ok: true };
    if (this.screen === 'results') {
      this.renderMenu();
    }
  }

  /*
   * THE HORN. A freestyle run ends the way a race does, on the results
   * screen, and it reuses that screen rather than growing a second one:
   * the shape is the same, a headline number and a list of what made it up,
   * and the screen already knows how to handle a freestyle run's menu.
   *
   * What it does NOT reuse is the lap machinery. A run has no laps, so the
   * rows are the tricks the pilot actually landed, biggest earner first,
   * which is the one sentence a freestyle scorer can say that a pilot
   * cares about: you flew nine flips and they were worth this much.
   */
  showFreestyleResults(summary) {
    this.roomResults = false;
    this.freestyleRun = summary;
    this.runPosted = null;
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    const screen = this.screens.results;
    const clean = summary.crashes === 0 && summary.tricks > 0;
    screen.classList.toggle('is-record', clean);
    screen.classList.toggle('is-empty', !summary.tricks);
    screen.classList.remove('is-in');
    void screen.offsetWidth;
    screen.classList.add('is-in');

    this.resultsKicker.textContent = summary.timed === false
      ? str('ui.freestyle_results_free_flight')
      : str('ui.freestyle_results');
    this.resultsHead.textContent = summary.tricks
      ? (clean ? str('ui.clean_run') : str('ui.run_complete'))
      : str('ui.run_ended');
    this.resultsHeroCap.textContent = str('ui.score');
    this.resultsHeroTime.textContent = formatScore(summary.total);
    if (!summary.tricks) {
      this.resultsHeroMeta.textContent = '';
      this.resultsHeroMeta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', summary.timed === false
        ? str('ui.nothing_the_recogniser_could_name_a')
        : str('ui.two_minutes_and_nothing_the_recogniser')));
    } else {
      const parts = [
        str('ui.tricks_of_them_different', { tricks: summary.tricks, unique: summary.unique }),
        summary.bestCombo > 0 ? `best chain ${formatScore(summary.bestCombo)}` : '',
        summary.bonus > 0 ? `variety bonus ${formatScore(summary.bonus)}` : '',
        summary.crashes === 0 ? str('ui.no_crashes') : `${summary.crashes} crash${summary.crashes === 1 ? '' : 'es'}`,
      ].filter(Boolean);
      this.resultsHeroMeta.textContent = parts.join('  ·  ');
      this.resultsHeroMeta.className = clean ? 'results-hero-meta gain' : 'results-hero-meta';
      /* The rows are the run's own tally, biggest earner first, and the bar
       * is that trick's share of the trick score. Same idiom the lap rows
       * use, which is why they can share the stylesheet. */
      const top = summary.rows.length ? summary.rows[0].points : 0;
      /*
       * TEN, and the container scrolls, so this is a choice rather than a
       * fit. A run can name twenty five kinds of trick and the tail of that
       * list is quarter rolls worth three points each: what a pilot reads a
       * results screen for is what EARNED, and a top ten is the shape that
       * answers it. The note below says how many are not shown, so nothing
       * is hidden without saying so.
       */
      for (const row of summary.rows.slice(0, 10)) {
        const line = el('div', `result-row${row === summary.rows[0] ? ' fastest' : ''}`);
        const main = el('div', 'result-main');
        main.append(el('span', 'result-label', row.count > 1 ? `${row.name} x${row.count}` : row.name));
        main.append(el('span', 'result-time', formatScore(row.points)));
        line.append(main);
        if (top > 0) {
          const bar = el('div', 'result-bar');
          const fill = el('div', 'result-bar-fill');
          fill.style.width = `${Math.max(4, Math.round((row.points / top) * 100))}%`;
          bar.append(fill);
          line.append(bar);
        }
        this.resultsBody.append(line);
      }
      const hidden = summary.rows.length - 10;
      if (hidden > 0) {
        this.resultsNote.textContent = hidden === 1
          ? str('ui.and_one_more_kind_of_trick')
          : str('ui.and_more_kinds_of_trick_further', { hidden });
      }
    }
    this.show('results');
  }

  /*
   * Keyboard stick ghost. Mode 2: left is yaw (x) and throttle (y, idle
   * at the bottom), right is roll (x) and pitch (y, stick forward is up,
   * matching the radio and the up arrow). Hidden when a radio is the
   * stick source.
   *
   * `show` now hides the two GIMBALS rather than the block they sit in,
   * because the air slider sits between them and is not the keyboard's.
   * Whether the block itself is up is setAirSlider's call, which the frame
   * loop makes from the same place with the same flight test.
   */
  setStickOverlay({ show, roll, pitch, yaw, throttle }) {
    if (!this.osdSticks) {
      return;
    }
    const cls = show ? 'osd-gimbal' : 'osd-gimbal is-off';
    Ui.klass(this.osdStickLeft.box, cls);
    Ui.klass(this.osdStickRight.box, cls);
    if (!show) {
      return;
    }
    placeSticks(this.osdStickLeft, this.osdStickRight, { yaw, throttle, roll, pitch }, this.settings.stickMode);
  }

  /*
   * THE AIR SLIDER'S THREE JOBS: commit live, say what it is, and explain
   * itself exactly once.
   *
   * Commit is on 'input', not 'change'. Every other slider in this shell
   * waits for the release because each one re-inits the module; this one
   * stores a single double into the plant, and the whole reason it is on the
   * flight screen instead of in a menu is that the pilot should feel the
   * change arrive while the craft is still in the air.
   *
   * The events are stopped at this element. The OSD sits under nothing while
   * flying, but the shell's own key handling treats the flight screen as the
   * stick, and a focused track that let its arrow keys through would steer
   * the quad as well as the slider.
   */
  bindAirSlider() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    const commit = () => {
      const v = clampWeight(air.range.value);
      if (v === this.settings.weight) {
        /* Still repaint: a drag between two steps snaps back to the value in
         * force, and a caption that did not follow would read as a stuck
         * control. */
        this.paintAir();
        return;
      }
      this.settings.weight = v;
      this.paintAir();
      saveSettings(this.settings);
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    };
    air.range.addEventListener('input', commit);
    /* Touching the track at all answers the question the hint was asking, so
     * the hint retires whether or not the value ends up anywhere new. */
    air.range.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    air.range.addEventListener('click', (e) => e.stopPropagation());
    /*
     * IT NEVER KEEPS FOCUS, and the reason was measured rather than
     * reasoned: a click on the track focused it, and from then on the
     * keyboard pilot's ArrowRight moved gravity 100 to 105 instead of
     * rolling the quad, and Escape no longer paused. Both follow from one
     * fact about src/input/input.js: its key listener is on the window and
     * bails out for any INPUT target, because text fields own their keys.
     * A range is an INPUT. So while this control held focus the sticks were
     * dead, the arrows were retuning the plant, and the one key that would
     * have got the pilot out was swallowed by a stopPropagation that used to
     * sit here.
     *
     * The fix is that focus leaves on release, so the window between press
     * and release is the only one in which a key can reach this element,
     * and tabindex -1 so a stray Tab in flight cannot land here either. In
     * flight this is a pointer control, like the chips, and a screen reader
     * is not flying. The pointer drag itself does not need focus: the
     * browser holds implicit capture on the pressed element until release.
     */
    air.range.tabIndex = -1;
    const release = () => {
      if (document.activeElement === air.range) {
        air.range.blur();
      }
    };
    air.range.addEventListener('pointerup', release);
    air.range.addEventListener('pointercancel', release);
    air.range.addEventListener('change', release);
    air.dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    this.paintAir();
  }

  /*
   * Whether the block is up, and whether the hint is with it. Driven from
   * the frame loop beside setStickOverlay, so the two cannot disagree about
   * what flying means.
   *
   * The hint is shown on the FIRST FLIGHT this browser has ever seen and
   * never again. Not on the title, not in a menu: a tooltip on a control the
   * reader cannot see is a riddle, and the sentence it carries only means
   * anything while there is a quad in the air to try it on.
   */
  setAirSlider(show, ready = true) {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    Ui.klass(air.box, show ? 'osd-air' : 'osd-air is-off');
    Ui.klass(this.osdSticks, show ? 'osd-sticks' : 'osd-sticks is-off');
    if (!show) {
      return;
    }
    /*
     * WHEN THE HINT IS RAISED, and both halves of the test were learned
     * from a picture rather than reasoned out.
     *
     * `ready` is the craft being in the air. A card explaining how the air
     * feels, shown to somebody still sitting on the start block under a
     * banner reading "throttle up to take off", is asking them to read about
     * a thing they cannot try; and it is the takeoff prompt they need first.
     *
     * IT DOES NOT ALSO WAIT FOR THE BANNER, and that was the first draft.
     * On a 390 px tall phone the card and the world note landed on each
     * other, so the hint was told to hold until the banner cleared, and on
     * the field map with nothing built the note NEVER clears: a rule that
     * can silently never fire is worse than the overlap it was fixing. The
     * collision is a layout problem and it is solved in the sheet, where the
     * card flips below the slider on a short screen.
     */
    if (!this.airHintDone && air.hint.hidden && ready && !airHintSeen()) {
      air.hint.hidden = false;
    }
  }

  dismissAirHint() {
    const air = this.osdAir;
    if (!air || this.airHintDone) {
      return;
    }
    this.airHintDone = true;
    air.hint.hidden = true;
    markAirHintSeen();
  }

  /* The track and the caption, from settings. Called on every write so the
   * flight screen agrees with a value changed anywhere else. */
  paintAir() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    const v = this.settings.weight;
    if (Number(air.range.value) !== v) {
      air.range.value = String(v);
    }
    /*
     * SLATE AT STOCK, AMBER OFF IT. Slate is the colour this shell uses for
     * type that should recede, and at 100 there is nothing to say: the pilot
     * is on the machine every record and every board time was set on. Off
     * stock the number is an instrument reading, which is what amber means
     * everywhere else on this overlay.
     *
     * IT USED TO SAY ", off the board" AND THE PILOT HAD IT REMOVED: "this
     * means nothing". They are right about where it belongs. A pilot mid
     * flight is feeling the quad, not filing a time, and the board rule is
     * already said twice in the places somebody is actually deciding about a
     * record: the sentence under the Fly button, read immediately before a
     * run, and the refusal on the upload itself. A third copy riding the
     * instrument all flight is noise, and noise on an overlay is how a pilot
     * learns to stop reading it.
     */
    const stock = v === WEIGHT_STOCK;
    air.cap.textContent = str('ui.weight_2', { v });
    Ui.klass(air.cap, stock ? 'osd-air-cap is-stock' : 'osd-air-cap');
  }

  /*
   * One cell per axis the radio reports, built once per axis count and
   * moved after that. Rebuilding the row every frame would throw away the
   * dot's transition and churn the DOM at the frame rate for a screen whose
   * whole job is to look steady.
   *
   * The dot is the live value on a fixed -1 to 1 track, so a coarse axis
   * steps and a fine one glides, and a pilot can see which of their
   * controls is which without knowing what any of it means yet.
   */
  setCalAxes(axes) {
    if (!this.calAxes) {
      return;
    }
    if (this.calAxisCells.length !== axes.length) {
      this.calAxes.textContent = '';
      this.calAxisCells = axes.map((a) => {
        const cell = el('div', 'cal-axis');
        cell.append(el('span', 'cal-axis-n', String(a.i)));
        const track = el('span', 'cal-axis-track');
        const span = el('i', 'cal-axis-span');
        const dot = el('i', 'cal-axis-dot');
        track.append(span, dot);
        cell.append(track);
        this.calAxes.append(cell);
        return { cell, span, dot };
      });
    }
    /* Nothing to say about a radio that has gone away, and an empty strip
     * says it better than eight stale dots. */
    this.calAxes.hidden = axes.length === 0;
    axes.forEach((a, k) => {
      const cells = this.calAxisCells[k];
      if (!cells) {
        return;
      }
      const pct = (v) => `${Math.max(0, Math.min(100, ((v + 1) / 2) * 100)).toFixed(1)}%`;
      cells.dot.style.left = pct(a.v);
      /* The travel bar is the range seen so far, drawn between its two
       * ends, which is what the full range step is asking the pilot to
       * grow. One axis unit is half the track. */
      const lo = Number.isFinite(a.lo) ? a.lo : a.v;
      const hi = Number.isFinite(a.hi) ? a.hi : a.v;
      cells.span.style.left = pct(lo);
      cells.span.style.width = `${Math.max(0, Math.min(100, (hi - lo) * 50)).toFixed(1)}%`;
      const live = Math.abs(a.v - (a.rest || 0)) > 0.15;
      Ui.klass(cells.cell, `cal-axis${a.mapped ? ' is-mapped' : ''}${live ? ' is-live' : ''}`);
    });
  }

  setCalibration(view) {
    if (!this.calPrompt) {
      return;
    }
    if (!view) {
      this.calCanSave = false;
      this.calCanSkip = false;
      if (this.calSaveBtn) {
        this.calSaveBtn.disabled = true;
      }
      if (this.calSkipBtn) {
        this.calSkipBtn.hidden = true;
      }
      this.calCanZeroThrottle = false;
      if (this.calZeroBtn) {
        this.calZeroBtn.hidden = true;
      }
      this.calCanReverse = false;
      this.calMoving = null;
      this.calOnConfirm = false;
      if (this.calRevBtn) {
        this.calRevBtn.hidden = true;
      }
      if (this.calModeBtn) {
        this.calModeBtn.hidden = true;
      }
      return;
    }
    const n = view.stepIndex + 1;
    this.calKicker.textContent = str('ui.step_of', { n, stepCount: view.stepCount, title: view.title });
    this.calPrompt.textContent = view.prompt;
    this.calHint.textContent = view.hint;
    this.calCanSave = Boolean(view.canSave);
    if (this.calSaveBtn) {
      this.calSaveBtn.disabled = !view.canSave;
    }
    this.calCanSkip = Boolean(view.canSkip);
    if (this.calSkipBtn) {
      this.calSkipBtn.hidden = !view.canSkip;
    }
    this.calCanZeroThrottle = Boolean(view.canZeroThrottle);
    if (this.calZeroBtn) {
      this.calZeroBtn.hidden = !view.canZeroThrottle;
    }
    this.calCanReverse = Boolean(view.canReverse);
    this.calMoving = view.moving || null;
    this.calOnConfirm = view.step === 'confirm';
    if (this.calRevBtn) {
      this.calRevBtn.hidden = !view.canReverse;
      if (view.canReverse) {
        /* Named, and it says which way it is going: a pilot who has already
         * pressed it once needs to know this puts it back. */
        const on = view.reverse && view.reverse[view.moving];
        Ui.text(this.calRevBtn, `${on ? 'Un-reverse' : str('ui.reverse')} ${view.moving}`);
      }
    }
    if (this.calModeBtn) {
      this.calModeBtn.hidden = !this.calOnConfirm;
      Ui.text(this.calModeBtn, str('ui.stick_mode_2', { normaliseStickMode: normaliseStickMode(this.settings.stickMode) }));
    }
    const ch = view.channels || { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    placeSticks(this.calStickLeft, this.calStickRight, ch, this.settings.stickMode);
    this.setCalAxes(view.axes || []);
    /* The ORDER is input.js's CAL_STEPS, imported rather than re-typed:
     * this list used to restate it, so a step added to the calibration
     * would have run without ever appearing in the list beside it. Only the
     * wording is the UI's business. */
    this.calList.textContent = '';
    /* The steps this run actually asked for, which is one longer for a
     * radio with no buttons. Falling back to the constant keeps the list
     * drawn if a view arrives without one. */
    const steps = (view && view.steps && view.steps.length) ? view.steps : CAL_STEPS;
    steps.forEach((id, i) => {
      const li = el('li', null, CAL_LABELS[id] ?? id);
      if (id === view.step) {
        li.className = 'on';
      } else if (i < view.stepIndex) {
        li.className = 'done';
      }
      this.calList.append(li);
    });
  }

  /*
   * The pilot's stick mode, applied to everything on screen that DRAWS or
   * NAMES a pair of sticks. The channels themselves are the input layer's
   * job; this is the captions, which are not constants any more.
   *
   * Called from main.js's applySettings, so it runs at boot and on every
   * change, which is the same hook the camera and the render scale use.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    this.settings.stickMode = m;
    /* applySettings calls this on EVERY settings write, and renderHowto
     * below rebuilds a screen's rows. Same guard as input.setStickMode. */
    if (m === this.stickModeDrawn) {
      return;
    }
    this.stickModeDrawn = m;
    const caps = [
      [this.osdStickLeft, this.osdStickRight],
      [this.howtoStickLeft, this.howtoStickRight],
      [this.calStickLeft, this.calStickRight],
    ];
    for (const [l, r] of caps) {
      if (l && l.cap) {
        Ui.text(l.cap, stickCaption(m, 'left'));
      }
      if (r && r.cap) {
        Ui.text(r.cap, stickCaption(m, 'right'));
      }
    }
    /* The how-to screen's prose names the sticks too, and it is built from
     * a table rather than from the DOM, so it has to be asked again. */
    if (this.howtoKeys) {
      this.renderHowto();
    }
  }

  /*
   * The next stick mode round, for the key and the button on the check
   * step. writeSettings is the same door the Settings row uses, so the
   * keyboard, the thumb sticks, every drawn gimbal and the stored setting
   * all move together and none of it is duplicated here.
   */
  cycleStickMode() {
    const at = STICK_MODES.indexOf(normaliseStickMode(this.settings.stickMode));
    const next = STICK_MODES[(at + 1) % STICK_MODES.length];
    this.settings.stickMode = next;
    this.writeSettings();
    return next;
  }

  setPadInfo(info) {
    const was = padTroubleItem(this.padInfo);
    this.padInfo = info || { count: 0, using: str('ui.keyboard') };
    /*
     * A TROUBLE ROW THAT APPEARS MID SESSION HAS TO ASK FOR THE PAINT.
     *
     * The row is part of the title's item list, and an item list only
     * becomes DOM in renderMenu. Nothing else on the title changes when a
     * radio's story changes, so a row that turns up later than the last
     * render waits for the pilot to leave the screen and come back, which
     * is a warning nobody is going to see.
     *
     * This was survivable while every trouble row was settled by the time
     * the title first painted: a pad with no buttons reports none on the
     * first poll, and a parked throttle is parked on the first poll too.
     * The no-yaw row is not like that. It is decided in the middle of a
     * session, the first time somebody reaches for a stick that is not
     * where the guess says it is. See noteGuessOrder in input.js.
     *
     * Compared on the label rather than on the info, because the info moves
     * every frame (the pad roster, the name) and the row is what is being
     * painted. Unchanged label, no work.
     */
    const now = padTroubleItem(this.padInfo);
    const label = (r) => (r ? r.label : '');
    if (this.screen === 'title' && label(was) !== label(now)) {
      this.renderMenu();
    }
  }

  setPadPick(view) {
    if (!this.padPrompt) {
      return;
    }
    if (!view) {
      this.padCardNodes = new Map();
      if (this.padCards) {
        this.padCards.textContent = '';
      }
      return;
    }
    this.padKicker.textContent = view.pads.length > 1
      ? str('ui.joysticks_plugged_in', { length: view.pads.length })
      : (view.pads.length === 1 ? str('ui.one_joystick_plugged_in') : str('ui.no_joystick'));
    this.padPrompt.textContent = view.prompt;
    this.padHint.textContent = view.hint;
    if (this.padYesBtn) {
      this.padYesBtn.disabled = !view.canAccept;
    }
    if (this.padNoBtn) {
      this.padNoBtn.disabled = !view.canAccept;
    }
    if (this.padSkipBtn) {
      this.padSkipBtn.textContent = view.skipLabel;
    }
    this.padPickPhase = view.phase;
    this.padPickReason = view.reason;
    const keys = view.pads.map((p) => p.key);
    const have = this.padCardNodes || new Map();
    const same = keys.length === have.size && keys.every((k) => have.has(k));
    if (!same) {
      this.padCards.textContent = '';
      this.padCardNodes = new Map();
      for (const pad of view.pads) {
        const node = makePadCard();
        this.padCards.append(node.card);
        this.padCardNodes.set(pad.key, node);
      }
    }
    for (const pad of view.pads) {
      const node = this.padCardNodes.get(pad.key);
      if (!node) {
        continue;
      }
      node.title.textContent = pad.title;
      node.name.textContent = pad.name;
      node.status.textContent = pad.chosen
        ? str('ui.use_this_one')
        : (pad.live ? str('ui.moving') : str('ui.resting'));
      node.card.classList.toggle('is-live', pad.live && !pad.chosen);
      node.card.classList.toggle('is-on', pad.chosen);
      const ax = pad.axes || [0, 0, 0, 0];
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      placeNub(node.left.nub, clamp(ax[0]), clamp(-ax[1]));
      placeNub(node.right.nub, clamp(ax[2]), clamp(-ax[3]));
    }
  }

  persistSettings() {
    saveSettings(this.settings);
  }

  setGpuInfo(info) {
    this.gpuInfo = info || null;
    if (this.screen === 'pilot') {
      this.renderMenu();
    }
  }

  /*
   * How the sticks actually reach the flight controller, as a function
   * rather than as a value, and that is the whole point of it.
   *
   * setGpuInfo above hands over a fact settled at boot. The stick path is
   * not one: padHz is re-counted every 500 ms, the source changes the moment
   * a radio is plugged in or a thumb lands on glass, and the stick
   * resolution is unknown until a stick has moved. A snapshot taken at boot
   * would record "the keyboard, 0 Hz" for every pilot, which is worse than
   * recording nothing because it looks like an answer. main.js registers a
   * probe and bugSnapshot calls it at the moment the report is written.
   */
  setStickProbe(fn) {
    this.stickProbe = typeof fn === 'function' ? fn : null;
  }

  /*
   * ONE ROW ON THE RATES SCREEN SAYING HOW YOUR STICKS REACH THE QUAD.
   *
   * src/main.js explains at length why the performance readout was taken out
   * of the flying corner, and that reasoning stands: those were developer
   * numbers in front of somebody trying to fly. This is not that corner.
   * The Rates screen is where a pilot goes when the feel is wrong, on
   * purpose, having stopped flying, and two of the five feel reports that
   * prompted this row were filed from a pilot who had gone there to fix
   * exactly this and had nothing to read.
   *
   * What it can honestly say differs by transducer, so it says a different
   * thing for each rather than one number for all three. The keyboard's
   * ceiling and the thumb stick's spring are facts about this shell and can
   * be stated flatly. A radio's refresh rate is a fact about the browser and
   * the driver and can only be measured, which is what padHz is.
   *
   * Returns [] rather than a placeholder when there is no probe: a row
   * saying nothing is worse than no row, and the harness mounts this screen
   * without main.js having registered one.
   */
  stickPathRow() {
    const st = this.stickProbe ? this.stickProbe() : null;
    if (!st) {
      return [];
    }
    if (String(st.source).includes('touch')) {
      return [{
        label: str('ui.stick_path'),
        value: str('ui.thumb_sticks'),
        info: true,
        note: str('ui.a_thumb_on_glass_has_about'),
      }];
    }
    if (String(st.source).includes('keyboard')) {
      return [{
        label: str('ui.stick_path'),
        value: str('ui.keyboard'),
        info: true,
        note: str('ui.a_key_is_not_a_stick'),
      }];
    }
    /*
     * A radio. padHz is how often the browser refreshed the Gamepad object,
     * and it is read against the frame rate rather than against 250: a radio
     * that genuinely reports at 100 Hz is a radio, while a padHz sitting on
     * top of the frame rate is the browser handing over one stick value per
     * rendered frame whatever the radio does. Only the second is a fault,
     * and only WebHID fixes it, so only the second gets a warning.
     */
    const padHz = Number(st.padHz) || 0;
    const fps = Number(st.fps) || 0;
    const tracksFrames = padHz > 0 && fps > 0
      && Math.abs(padHz - fps) <= Math.max(6, fps * 0.15);
    const levels = Number(st.stickLevels) || 0;
    const bits = [];
    if (padHz <= 0) {
      bits.push(str('ui.waiting_for_the_radio_to_report'));
    } else {
      bits.push(str('ui.your_radio_is_refreshing_times_a', { padHz }));
    }
    if (tracksFrames) {
      bits.push(str('ui.that_is_your_frame_rate_per', { fps }));
    }
    if (levels > 0 && levels < 512) {
      bits.push(str('ui.this_radio_reports_about_steps_across', { levels }));
    }
    return [{
      label: str('ui.stick_path'),
      value: padHz > 0 ? str('ui.radio_hz', { padHz }) : str('ui.radio'),
      info: true,
      rowClass: tracksFrames ? 'row-warn' : undefined,
      note: bits.join(' '),
    }];
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
     * existing chip cluster. A breadcrumb reading FDFPV under a wordmark
     * reading FDFPV is a second answer to a question nobody asked, and its
     * context chips land on top of the bug chip and the music dock. So the
     * top bar sits out the one screen that does not need it. */
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
    const trail = CRUMBS[this.screen] || [SCREEN_TITLES[this.screen] || this.screen];
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
      if (this.screen !== 'title') {
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
    /* A card on the gate is half the answer: the other half, which
     * aircraft, is chosen in front of the aircraft. */
    if (it.card && this.onGate()) {
      this.pickForWay(it.action);
      return;
    }
    this.act(it.action);
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
       * BOTH halves are cleared, because both are what the gate asks. The
       * mode going null is also what lets syncMode leave it alone while the
       * gate is open: see the comment there.
       */
      if (this.onGate()) {
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

  act(action, picked = null) {
    /* The swap in place, from the pause menu's row. */
    if (action === 'hotswap') {
      this.openSwap('paused');
      return;
    }
    if (action === 'customise') {
      this.openHangar(this.settings.airframe, () => this.renderMenu());
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
    if (action === 'wiki') {
      openNamedWindow(wikiPageUrl(), WIKI_WINDOW);
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
       * (pickForWay); a card answered without one, from a script or a
       * link, keeps the rule it always had. */
      const want = picked && way.airframes.includes(picked) ? picked
        : way.airframes.includes(this.settings.airframe) ? this.settings.airframe : way.airframes[0];
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
      if (!seatedFreestyleMap(this.settings)) {
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
         * The remembered world is still consulted FIRST, and the picker
         * still comes back the moment there is a real choice, which is why
         * this is written as "what is remembered, or the only one" rather
         * than as the id of the town. A second freestyle world costs the
         * registry entry and this branch and nothing else.
         */
        const remembered = MAPS.find(
          (x) => x.id === this.settings.freestyleMap && x.mode === 'freestyle',
        );
        const worlds = MAPS.filter((x) => x.mode === 'freestyle');
        const home = way.home ? worlds.find((x) => x.id === way.home) : null;
        const want = home || remembered || (worlds.length === 1 ? worlds[0] : null);
        if (!want) {
          this.show('freestyle');
          return;
        }
        /* The cursor lands on Fly when the world comes back, for the same
         * reason as below: the fourth card is not the menu's fourth row. */
        this.setCursor(this.titleStop());
        this.seatMap(want.id);
        if (way.room) {
          this.show('friends');
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
     * built: a plane too wide for a track's gates gives way to the five inch
     * (seatCraftForDoc). The swap is silent and reversible, and the
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
      downloadCli('betaflight.diff', this.fc.exportText());
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
      this.show('title');
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    /* Back to My tracks from a run or from the results: the run ends the
     * way quitting to the title ends it, and the list is where a pilot
     * racing goes next. */
    if (action === 'mytracks') {
      this.act('title');
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

  /* A card on the gate: the aircraft for that way in, then the way in. An
   * aircraft the card does not take, chosen under All, takes the card that
   * does. */
  pickForWay(action) {
    const way = WAYS.find((w) => w.action === action);
    if (!way) {
      return;
    }
    /* A room's aircraft is chosen in the room, once it is known who is
     * flying what: the card goes straight to the room screen. */
    if (way.campaign && this.onCampaignCard) {
      this.onCampaignCard();
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
    this.carousel.open({
      current: way.airframes.includes(s.airframe) ? s.airframe : way.airframes[0],
      filter: wayFilter(way),
      title: way.label,
      hint: this.pickHint(),
      onCustomise: (id, reopen) => this.openHangar(id, reopen),
      onChoose: (card) => {
        const id = withFloats(s, card);
        const chosen = way.airframes.includes(id) ? way : (WAYS.find((w) => w.airframes.includes(id)) ?? way);
        this.act(chosen.action, id);
      },
      onCancel: () => this.renderMenu(),
    });
  }

  /* The Aircraft row. Between runs it seats the aircraft for the next one,
   * as the row always has; in a run it swaps it in place. */
  openCraftRow(midRun) {
    const s = this.settings;
    this.carousel.open({
      current: s.airframe,
      filter: kindOf(s.airframe),
      hint: this.pickHint(),
      onCustomise: (id, reopen) => this.openHangar(id, reopen),
      onChoose: (card) => {
        const id = withFloats(s, card);
        if (id === s.airframe) {
          this.renderMenu();
          return;
        }
        if (midRun && this.onHotSwap) {
          this.swapTo(id).then(() => this.renderMenu());
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
    this.carousel.open({
      current,
      filter: kindOf(current),
      compact: true,
      title: str('carousel.change_aircraft'),
      warn: this.swapWarning ? this.swapWarning() : '',
      hint: this.pickHint(),
      onCustomise: (id, reopen) => this.openHangar(id, reopen),
      onChoose: (card) => {
        this.swapTo(withFloats(this.settings, card)).then(() => this.act('resume'));
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
   * menu redraws.
   */
  openHangar(card, after = null) {
    /* A plane with a float version opens on the version its toggle names,
     * whichever of the two it was asked for. */
    const id = withFloats(this.settings, landPlaneOf(card));
    if (!paintable(id) || this.hangar.isOpen) {
      return;
    }
    const s = this.settings;
    const family = liveryKey(id);
    const preview = (look) => {
      if (this.onHangarPreview) {
        this.onHangarPreview(id, look);
      }
    };
    const done = () => {
      if (after) {
        after();
      }
    };
    const power = this.hangarPower ? this.hangarPower(id) : null;
    /*
     * THE FLOATS TOGGLE, beside the span and the weight: remembered for this
     * plane, and when it is the seated one it seats the other version at
     * once, in place in a run as the picker's swap does. The hangar then
     * opens again on the version the toggle names, shut quietly first so
     * `after` waits for that one.
     */
    const land = landPlaneOf(id);
    const onFloats = floatVersionOf(land) ? (on) => {
      const to = on ? floatVersionOf(land) : land;
      s.floats = { ...s.floats, [land]: on };
      this.hangar.close();
      preview(null);
      const reopen = () => this.openHangar(to, after);
      if (landPlaneOf(s.airframe) !== land || s.airframe === to) {
        this.persistSettings();
        reopen();
      } else if (this.returnTo === 'paused' && this.onHotSwap) {
        /* A swap the run refuses leaves the plane as it was, and the toggle
         * with it, so the hangar never says floats on a plane on wheels. */
        this.swapTo(to).then((ok) => {
          if (ok !== true) {
            s.floats = { ...s.floats, [land]: !on };
          }
          this.persistSettings();
          reopen();
        });
      } else {
        seatAirframe(s, to);
        this.writeSettings();
        reopen();
      }
    } : null;
    this.hangar.open({
      airframe: id,
      floats: onFloats ? { on: isFloatVersion(id), set: onFloats } : null,
      livery: s.livery[family],
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
      settings: s,
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
        this.persistSettings();
        preview(null);
        Promise.resolve()
          .then(() => (this.onHangarSave ? this.onHangarSave(id, res) : null))
          .catch((e) => {
            console.error('hangar save failed', e);
          })
          .then(done);
      },
      onCancel: () => {
        preview(null);
        done();
      },
    });
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
      this.swapTo(withFloats(this.settings, cycleCraft(this.settings.airframe, dir)));
    }
  }

  /*
   * A gamepad's swap buttons in flight, as levels: { open, prev, next }.
   * Edge triggered, and the first poll after any screen change only learns
   * what is held, the same promise pollPad makes.
   */
  pollFlightPad(b) {
    const now = { open: Boolean(b && b.open), prev: Boolean(b && b.prev), next: Boolean(b && b.next) };
    const prev = this.swapPadPrev;
    this.swapPadPrev = now;
    if (!prev || this.screen !== 'flight') {
      return;
    }
    if (now.open && !prev.open) {
      this.lastInput = 'pad';
      this.openSwap('flight');
    } else if (now.prev && !prev.prev) {
      this.cycleSwap(-1);
    } else if (now.next && !prev.next) {
      this.cycleSwap(1);
    }
  }

  /* Returns true when the key was a menu key and the shell should not
   * treat it as a flight control. repeat is the browser's key-repeat
   * flag: a held or quickly tapped arrow must step the cursor, but Enter
   * and Escape must not fire again. */
  handleKey(code, repeat = false) {
    /* Any key is somebody using the room, so the preview recorder waits.
     * See noteInteraction. */
    this.noteInteraction();
    if (this.nameDialog && !this.nameDialog.hidden) {
      return true;
    }
    const nav = code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight'
      || code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
    if (this.hangar.isOpen) {
      return repeat && !nav ? true : this.hangar.handleKey(code);
    }
    if (this.carousel.isOpen) {
      return repeat && !nav ? true : this.carousel.handleKey(code);
    }
    if (repeat && !nav) {
      return this.screen !== 'flight';
    }
    if (code === 'F8') {
      this.openBugReport();
      return true;
    }
    if (this.screen === 'flight') {
      if (code === 'Escape') {
        this.act('pause');
        this.show('paused');
        return true;
      }
      /* The swap in place: Tab opens the picker, [ and ] step through the
       * aircraft without it. None of the three flies anything. */
      if (code === 'Tab') {
        this.openSwap('flight');
        return true;
      }
      if (code === 'BracketLeft' || code === 'BracketRight') {
        this.cycleSwap(code === 'BracketLeft' ? -1 : 1);
        return true;
      }
      return false;
    }
    if (this.screen === 'calibrate') {
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.calCanSave) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-save');
        return true;
      }
      /*
       * A KEY IS THE WAY PAST THE ONE STEP A RADIO MIGHT NOT BE ABLE TO
       * ANSWER, and the pilot who reported it asked for exactly this: "A
       * bypass button, just use a key on my keyboard". The button beside
       * Cancel is the same door for a mouse. Deliberately NOT bound to the
       * pad: this step is asking the pilot to hold a switch, and the hold
       * gesture that would carry it is the same gesture, so a pad binding
       * here would skip the step while they were trying to complete it.
       */
      /* T for throttle, named in the hint beside it, because the pilot this
       * is for may have a radio whose only button is a stick hold. */
      if (code === 'KeyT' && this.calCanZeroThrottle) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-zero-throttle');
        return true;
      }
      /*
       * R REVERSES WHAT THEY ARE MOVING, and M puts the drawn sticks on the
       * other hands. Both are only live on the check step, both are named
       * in the hint under the prompt as it changes, and neither is bound to
       * the pad: the pilot is holding a stick to aim these, so a stick
       * gesture would fight the aiming. See bug-b0d085f0 and bug-873a84ec.
       */
      if (code === 'KeyR' && this.calCanReverse) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-reverse');
        return true;
      }
      if (code === 'KeyM' && this.calOnConfirm) {
        if (this.onUiSound) {
          this.onUiSound('adjust');
        }
        this.act('calibrate-stick-mode');
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.calCanSkip) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-skip');
        return true;
      }
      return true;
    }
    if (this.screen === 'padpick') {
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.padPickPhase === 'confirm') {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('padpick-yes');
        return true;
      }
      return true;
    }
    if (this.dropEl) {
      if (code === 'ArrowUp' || code === 'KeyW') {
        this.moveDrop(-1);
        return true;
      }
      if (code === 'ArrowDown' || code === 'KeyS') {
        this.moveDrop(1);
        return true;
      }
      if (code === 'Enter' || code === 'Space') {
        this.confirmDrop();
        return true;
      }
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
    }
    this.lastInput = 'key';
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.move(-1);
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      this.move(1);
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      /* The map screens lay their cards out in a row, so left and right are
       * what a player reaches for. Nothing on them has a value to adjust. */
      if (this.cardScreen()) {
        this.move(-1);
      } else {
        this.adjust(-1);
      }
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      if (this.cardScreen()) {
        this.move(1);
      } else {
        this.adjust(1);
      }
      return true;
    }
    /*
     * `/` OPENS SEARCH ON THE BENCH, which is the key every editor and
     * every browser uses for it, and it is the one screen in the product
     * with enough rows to need one: 696 keys across 23 flat tabs with no
     * grouping and no cross-tab search is a memory test.
     *
     * Nowhere else, because nowhere else has more rows than fit on a
     * screen and a half, and a slash that silently does nothing on nine
     * screens is worse than no slash at all.
     */
    if (code === 'Slash' && this.screen === 'fc' && !this.fc.confirm) {
      if (this.fc.search == null) {
        this.fc.search = '';
        this.renderMenu();
        this.setCursor(this.firstStop(this.items(), this.rowOffset));
        /* Straight into the field. A search you have to press Enter to
         * start typing into is two keys for one intention. */
        this.searchCaret = 0;
        this.restoreSearchCaret();
      }
      return true;
    }
    if (code === 'PageUp') {
      this.pageMove(-1);
      return true;
    }
    if (code === 'PageDown') {
      this.pageMove(1);
      return true;
    }
    if (code === 'Home') {
      this.jumpEdge(-1);
      return true;
    }
    if (code === 'End') {
      this.jumpEdge(1);
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      this.select();
      return true;
    }
    if (code === 'Escape' || code === 'Backspace') {
      this.back();
      return true;
    }
    return true;
  }

  /*
   * Stick navigation. nav is { up, down, left, right, select, back },
   * already resolved by the shell from either the calibrated channels or,
   * when the radio has never been calibrated, from any axis at all. Edge
   * triggered, so a held stick moves one row. Title and Settings do not
   * use pitch and roll for the cursor: those screens pose the airframe.
   */
  pollPad(nav) {
    if (this.hangar.isOpen) {
      this.lastInput = nav.up || nav.down || nav.left || nav.right || nav.select || nav.back ? 'pad' : this.lastInput;
      this.hangar.pollPad(nav);
      this.padRearm = true;
      return;
    }
    if (this.carousel.isOpen) {
      this.lastInput = nav.up || nav.down || nav.left || nav.right || nav.select || nav.back ? 'pad' : this.lastInput;
      this.carousel.pollPad(nav);
      /* Seeded for the screen under it, so the press that closes the
       * picker is not also a press on the menu it closes onto. */
      this.padRearm = true;
      return;
    }
    if (this.screen === 'flight') {
      this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
      return;
    }
    if (nav.up || nav.down || nav.left || nav.right || nav.select || nav.back) {
      this.lastInput = 'pad';
    }
    const now = {
      up: Boolean(nav.up),
      down: Boolean(nav.down),
      right: Boolean(nav.right),
      left: Boolean(nav.left),
      select: Boolean(nav.select),
      back: Boolean(nav.back),
    };
    /* One poll to learn where the sticks already are, acting on nothing.
     * See show(). */
    if (this.padRearm) {
      this.padRearm = false;
      this.padPrev = now;
      return;
    }
    /*
     * A dialog swallows the pad exactly as handleKey swallows the keys.
     * Without this, a radio pilot's select flick landed on the MENU UNDER
     * the dialog: with the feel question auto-opened over Results, the
     * flick they meant for Fly again restarted the run behind the form and
     * left it up over a flight it could no longer describe. The edges are
     * still tracked, so releasing a switch while a dialog closes cannot
     * fire on the screen that comes back.
     */
    if (this.nameDialog && !this.nameDialog.hidden) {
      this.padPrev = now;
      return;
    }
    if (this.screen === 'calibrate') {
      if (now.back && !this.padPrev.back) {
        this.act('calibrate-cancel');
      }
      if (now.select && !this.padPrev.select && this.calCanSave) {
        this.act('calibrate-save');
      }
      this.padPrev = now;
      return;
    }
    if (this.screen === 'padpick') {
      /* Buttons are read from the candidate pad inside input.js. Using
       * firstGamepad() here would let the wrong radio confirm. */
      this.padPrev = now;
      return;
    }
    /*
     * Title, Settings, Rates and PIDs all hold still under a moving stick:
     * the first two pose the airframe, and Rates rides a dot along the
     * curve the stick is about to fly. Pitch and roll that fly it used to
     * step the cursor, which on Rates meant that moving a stick to watch
     * its dot also walked the menu and, on a value row, edited the number
     * it landed on; PIDs is all value rows, so it gets the same rule.
     * Keyboard and mouse own the rows on these four; a radio switch still
     * selects on the title so Fly is one flick away. The pad is tracked so
     * a held stick does not fire an edge the moment the screen closes.
     */
    /* Quad, not Settings: the airframe showcase moved with the machine, so
     * the screen whose sticks pose a quad is the one that has a quad on it.
     * Pilot has no showcase and its sticks are free to drive the cursor,
     * which is the whole point of a room a radio pilot has to reach. */
    /*
     * The GATE is the one part of the title where the sticks drive.
     *
     * The rule above is written for a screen where every choice is one
     * switch press away, and that is true of the title's menu, where Fly is
     * the primary and the bar's button flies it. It is not true of the
     * gate: there are two cards and a radio that cannot move between them
     * can only ever choose the one the cursor happens to be on. Posing the
     * airframe is worth less than being able to answer the question, so on
     * the gate the sticks fall through to the ordinary card walk, pitch to
     * move and roll right to choose, which is what the hint under it says.
     */
    if (this.screen === 'quad' || (this.screen === 'title' && !this.onGate()) || this.screen === 'rates' || this.screen === 'pids' || this.screen === 'fc') {
      /*
       * The STICKS stay out, for the reasons above. The BUTTONS do not.
       *
       * The guard used to swallow everything except select on the title,
       * and the pause menu is fully stick navigable and carries rows into
       * all five of these screens. So a radio pilot could steer into
       * Settings and then have no stick that moved the cursor and no
       * switch that went back: a room you can enter and cannot leave.
       *
       * select and back come from padMenuButtons, which reads buttons 0 to
       * 3 and only after seeing all four released, so a latched arming
       * switch cannot fire them. They are safe on a screen where the axes
       * are not, because they are not the axes.
       */
      if (now.select && !this.padPrev.select) {
        this.select();
      }
      if (now.back && !this.padPrev.back) {
        this.back();
      }
      this.padPrev = now;
      return;
    }
    const it = this.items()[this.cursor];
    /*
     * THE KEYBOARD'S RULE, WHICH THE STICKS DID NOT HAVE.
     *
     * Left and Right on a card screen MOVE the cursor, they do not adjust
     * the row under it: the cards lie in a row and that is what a player
     * reaches for. See the arrow keys above, whose reason for it was that
     * nothing on a card screen has a value to adjust. That stopped being
     * true when the Freestyle room grew a Scoring row and a Physics model
     * row, and with one freestyle world the room draws no cards at all, so
     * Scoring is the FIRST row and the cursor opens on it.
     *
     * On the sticks that made roll LEFT, which everywhere else in the
     * product is BACK, step Scoring backwards instead. cycle() wraps, so
     * one nudge of the gesture a radio pilot uses to leave a room took the
     * default 'off' the long way round to 'scored', and writeSettings
     * saved it: an unfinished scorer switched on, a two minute clock and a
     * public board, for a pilot who thought they had pressed Escape and
     * has no memory of asking for any of it. Roll right was the same bug
     * one position milder, and the hint under the screen tells a radio
     * pilot to roll. See DEFAULTS.freestyleScoring for why off is what a
     * pilot gets without asking.
     *
     * So the sticks get the keyboard's rule. On a card screen roll right
     * chooses and roll left goes back, which is what the hint promises,
     * and a segmented row is still reachable from a radio because select
     * cycles it: see the segmented branch in select().
     */
    const rollAdjusts = Boolean(it && it.adjust) && !this.cardScreen();
    if (this.dropEl) {
      if (now.up && !this.padPrev.up) {
        this.moveDrop(-1);
      }
      if (now.down && !this.padPrev.down) {
        this.moveDrop(1);
      }
      if ((now.right && !this.padPrev.right) || (now.select && !this.padPrev.select)) {
        this.confirmDrop();
      }
      if ((now.left && !this.padPrev.left) || (now.back && !this.padPrev.back)) {
        this.closeDrop();
        if (this.onUiSound) {
          this.onUiSound('back');
        }
      }
      this.padPrev = now;
      return;
    }
    if (now.up && !this.padPrev.up) {
      this.move(-1);
    }
    if (now.down && !this.padPrev.down) {
      this.move(1);
    }
    if (now.right && !this.padPrev.right) {
      if (rollAdjusts) {
        this.adjust(1);
      } else {
        this.select();
      }
    }
    if (now.left && !this.padPrev.left) {
      if (rollAdjusts) {
        this.adjust(-1);
      } else {
        this.back();
      }
    }
    if (now.select && !this.padPrev.select) {
      this.select();
    }
    if (now.back && !this.padPrev.back) {
      this.back();
    }
    this.padPrev = now;
  }
}
