/*
 * settings.js: the pilot's stored profile. What it holds and what each
 * field falls back to, how a stored copy is read back and repaired, how
 * an aircraft is seated in it, and the few small rules other modules ask
 * of it (the HUD an aircraft flies with, the weight slider's gravity).
 *
 * Repair is the bulk of it, and the reason it is careful: a profile can be
 * months old, written by a build that had other aircraft, worlds and
 * choices, or hand edited, and loading it must never stop the page or
 * quietly lose the parts that are still good. So every field is taken
 * from storage only when it has the type its default has, every choice is
 * checked against today's list, and anything retired is moved on to its
 * successor.
 *
 * The storage keys keep their old names until the coordinated rename:
 * scripts and other modules read them directly.
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
  AIRFRAMES, AIRFRAME_IDS, airframeById, currentAirframeId, DEFAULT_AIRFRAME,
  floatVersionOf, isFloatVersion, landPlaneOf, retiredAirframe,
} from '../../configs/airframes.js';
import { CUSTOM_TUNE, tunesFor } from '../../configs/registry.js';
import {
  normaliseRates, pitchMatchesRoll, RATE_DEFAULTS, ratesFromLegacy, TOUCH_RATE_DEFAULTS,
} from '../../configs/rates.js';
import { normalisePids } from '../../configs/pids.js';
import { normalizePower, powerChoice } from '../../configs/power.js';
import { normalisePlane, normaliseParts } from '../../configs/hangar-parts.js';
import { normalisePacks } from '../../configs/wear.js';
import { normaliseCombat } from '../../configs/combat.js';
import { normalizeTuning, setupFor } from '../../configs/tuning.js';
import { normaliseLiveries, normaliseSaves, normaliseSwatches } from '../../configs/liveries.js';
import { FC_DUMP_AIRFRAME_KEY, FC_DUMP_KEY } from '../fc/dump.js';
import { PRESET_IDS as WEATHER_PRESETS } from '../game/weather.js';
import { DEFAULT_STICK_MODE, normaliseStickMode } from '../input/stickmode.js';
import { hasKeybinds, normaliseKeybinds } from '../input/keybinds.js';
import { LINK_PRESETS } from '../input/link.js';
import { MOUSE_CENTRES, MOUSE_EXPOS, MOUSE_SENS } from '../input/input.js';
import { touchWanted } from '../input/touchsticks.js';
import {
  CAMERA_ANGLE_DEFAULT, CAMERA_ANGLE_MAX, CAMERA_ANGLE_MIN, CAMERA_FOV_DEFAULT, CAMERA_FOVS,
  clampCameraAngle,
} from '../render/lens.js';
import { PERF_MODES } from '../render/dynres.js';
import { detectDefaultGraphics, normalizeGraphics } from '../render/quality.js';
import { musicIds } from '../render/tracks.js';
import { MARK_STYLES } from './peermarks.js';
import { familyFitted, normaliseBuildFits } from './builds.js';
import { normaliseProgress } from '../game/progress.js';
import { cleanCampaign } from '../game/campaign.js';
import { cleanFlightTime } from '../share/flighttime.js';
import { MAPS } from '../maps/registry.js';
import { retiredMap } from '../maps/retired.js';

/* v3: earlier shapes are deliberately not read (everyone started once on
 * the defaults rather than carry repairs for blobs nothing writes now).
 * src/boot.js writes this string out instead of importing it, so boot
 * does not load the shell's modules before the loading screen: change it
 * there too. */
export const SETTINGS_KEY = 'webfpv.settings.v3';
/* Set once the pilot has seen the in flight hint for the air slider. */
const AIR_HINT_KEY = 'webfpv.airhint.v2';
/* Keys an earlier visit leaves behind even without a profile: a best lap
 * or a track in the builder means this browser has been here. */
const VISITED_PREFIXES = ['webfpv.best', 'webfpv.trackbuilder'];

/* The camera's lens lives in src/render/lens.js; the settings screen is
 * where a pilot meets it, so its limits are offered from here as well. */
export { CAMERA_FOVS, CAMERA_FOV_DEFAULT, CAMERA_ANGLE_MIN, CAMERA_ANGLE_MAX, CAMERA_ANGLE_DEFAULT };

export const FLIGHT_MODES = ['acro', 'angle'];
export const PACK_VOLTAGES = [4.2, 3.8, 3.5];
export const LAP_COUNTS = [1, 3, 5];
/* Percent of the graphics preset's resolution. Fewer pixels is the lever
 * that helps every GPU-bound machine; physics and input never see it. */
export const RENDER_SCALES = [100, 85, 70, 55];
/* Frame caps in Hz, 0 for none. 90 is the frame target, 120 and 144 are
 * for high refresh panels, and 30 stays so a stored 30 survives loading. */
export const FPS_CAPS = [0, 144, 120, 90, 60, 30];
/* How stick samples land on RC frames (main.js): by the time they were
 * read, or the newest sample in each frame. */
export const LATENCY_MODES = ['standard', 'low'];
/* The overlay on the FPV view: the flight controller's OSD
 * (src/ui/fpvhud.js), the game's readout, or the sensor display
 * (src/ui/avionicshud.js). Chase and line of sight views use the game's. */
export const HUD_STYLES = ['osd', 'game', 'avionics'];
/* Expert flies the whole model; arcade turns its imperfections off in the
 * module (sim_set_flight_style). */
export const FLIGHT_STYLES = ['expert', 'arcade'];
/* What a freestyle flight shows: nothing ('off', the default, while the
 * trick recogniser is unfinished), named tricks with no clock ('free'),
 * or a two minute scored run posted to the board ('scored'). The scorer
 * runs underneath in every case; this only decides what is drawn. */
export const FREESTYLE_SCORING = ['off', 'free', 'scored'];
/* The Avionics HUD: inset sizes (src/render/sensorview.js INSET_SIZES),
 * how much it draws, and the thermal palettes (THERMAL_PALETTES there,
 * which scripts/avionics-layout.js checks this list against). */
export const AVX_INSETS = ['small', 'medium', 'large'];
export const AVX_LEVELS = ['full', 'standard', 'minimal'];
export const AVX_PALETTES = ['whitehot', 'ironbow', 'rainbow', 'arctic'];

/*
 * The weight slider, a percentage of the aircraft's stock weight. It
 * scales gravity (configs/airframes.js gravityBase is 100), because
 * pilots asking for "less floaty" meant how fast it comes down, which
 * drag barely moved. Measured on the five inch at its base:
 *
 *   weight 60    0.97 g   hover 26.0, fall 10 m 1.57 s, balloon 4.03 m
 *   weight 100   1.62 g   hover 35.0, fall 10 m 1.20 s, balloon 1.62 m
 *   weight 140   2.27 g   hover 42.7, fall 10 m 1.01 s, balloon 0.67 m
 *
 * The cost: it is a heavier world, not a heavier quad, so a bank pushes
 * it sideways harder than a real heavy quad would; rotation is within
 * 1.5 percent. If that is ever reported, the fix is mass, not this range.
 */
export const WEIGHT_MIN = 60;
export const WEIGHT_MAX = 140;
export const WEIGHT_STEP = 5;
export const WEIGHT_STOCK = 100;

/* Snapped to the slider's step and held in range; anything that is not a
 * number reads as stock. */
export function clampWeight(v) {
  const snapped = WEIGHT_STEP * Math.round(Number(v) / WEIGHT_STEP);
  if (!Number.isFinite(snapped)) return WEIGHT_STOCK;
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, snapped));
}

/* The gravity multiple handed to the module. Three decimals, so one
 * setting is always the same double: the record key hashes it. */
export function gravityScaleFor(weight, airframeId) {
  const scale = airframeById(airframeId).gravityBase * clampWeight(weight) / 100;
  return Math.round(scale * 1000) / 1000;
}

/* The HUD for one aircraft: the pilot's pick for that aircraft if any,
 * Avionics by default on a combat aircraft (owner, 2026-10-01), and the
 * old single setting otherwise, so racing pilots keep theirs. */
export function hudStyleFor(s, airframeId) {
  const picked = s.hudStyleBy && s.hudStyleBy[airframeId];
  if (picked) return picked;
  if (airframeById(airframeId).combat) return 'avionics';
  return s.hudStyle;
}

/* A new profile's aircraft, and the one a profile that never answered
 * the aircraft question is moved to. */
export const FIRST_AIRFRAME = 'timber1500';

/*
 * Every field of the profile and its default. loadSettings takes a stored
 * value only when its typeof matches the default's, which is why ids are
 * strings with '' for "not chosen" and maps are {}: a wrong shape falls
 * back instead of reaching the code that reads it.
 */
export const DEFAULTS = {
  /* World: 'track' is the race seat, any other id a freestyle world. */
  map: 'track',
  /* The freestyle world last chosen, '' if none ever was: the gate sends
   * such a pilot to the picker rather than choosing for them. */
  freestyleMap: '',
  tune: 'betaflight-interceptor',
  airframe: DEFAULT_AIRFRAME,
  /* Whether the aircraft question was ever answered (a ?craft= link
   * answers it too). The flight mode is per visit and never stored. */
  airframeAsked: false,
  /* One time screens read and accepted. */
  warConsent: false,
  interiorConsent: false,
  warAirframe: '',
  voiceReplayAck: false,
  flightTime: {},
  /* The tune last flown on each aircraft, restored when it is seated. */
  tuneFor: {},
  livery: {},
  liverySaves: {},
  /* The pilot's own colours (configs/liveries.js normaliseSwatches). */
  swatches: { list: [] },
  rates: RATE_DEFAULTS,
  ratesSplitPitch: false,
  pids: {},
  /* Tunes whose aircraft PIDs were already put in, so a pilot's own edit
   * is never seeded over. */
  pidsSeeded: {},
  /* Which one time migrations of the wing tunes have run. */
  wingDefaults: 0,
  feelAsked: false,
  touchRatesOffered: false,
  flightMode: 'acro',
  stickMode: DEFAULT_STICK_MODE,
  mouseFlight: false,
  mouseSens: 100,
  mouseExpo: 0,
  mouseInvert: false,
  mouseCentre: 'auto',
  freestyleScoring: 'off',
  /* The landed trick and figure callouts (docs/TRICKS-CATALOG.md), on
   * whether or not the score is shown. */
  trickCallouts: true,
  /* Set once every profile's scoring has been put back to off, after
   * scoring had defaulted on. */
  scoringReset: false,
  flightStyle: 'expert',
  launchControl: false,
  missionGuidance: true,
  crashDamage: true,
  /* The air a solo run flies; in a room the host's is the room's. */
  weather: 'calm',
  ghost: 'best',
  live: 'off',
  cameraAngle: CAMERA_ANGLE_DEFAULT,
  cameraFov: CAMERA_FOV_DEFAULT,
  wingView: 'fpv',
  hudStyle: 'osd',
  hudStyleBy: {},
  peerMarks: 'on',
  avxInset: 'small',
  avxLevel: 'standard',
  avxPalette: 'whitehot',
  renderScale: 100,
  fpsCap: 0,
  perfMode: 'balanced',
  perfOverlay: false,
  latencyMode: 'low',
  packVoltage: 4.2,
  power: {},
  progress: {},
  campaign: {},
  parts: {},
  packs: {},
  combat: {},
  tuning: {},
  floats: {},
  buildFits: {},
  weight: WEIGHT_STOCK,
  laps: 3,
  sound: true,
  volume: 6,
  motorLevel: 5,
  windLevel: 5,
  musicLevel: 5,
  effectsLevel: 5,
  voiceLevel: 5,
  ambientLevel: 5,
  otherLevel: 5,
  musicTrack: 'rotation',
  focusTone: false,
  link: 'perfect',
  flightLog: false,
  /* Replaced on first load by what the device suggests (handhelds low);
   * graphicsAuto says the pilot has not picked one since. */
  graphics: 'high',
  graphicsAuto: true,
};

/* Storage that throws (private mode, a full quota, a sandbox) reads as
 * empty and drops writes: the profile is a convenience, never a reason
 * for the page to stop. */
function readKey(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/* Whether the profile was stored: a caller that reads it back can skip
 * that when the write was refused. */
export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    /* Not kept; the next visit loads the defaults. */
    return false;
  }
}

export function airHintSeen() {
  return readKey(AIR_HINT_KEY) === '1';
}

export function markAirHintSeen() {
  try {
    localStorage.setItem(AIR_HINT_KEY, '1');
  } catch (e) {
    /* The hint shows again next time. */
  }
}

/* True only for a browser with no trace of an earlier visit. Storage that
 * cannot be read says false: better to skip the welcome than to greet a
 * returning pilot as new. */
export function detectFirstRun() {
  try {
    if (localStorage.getItem(SETTINGS_KEY)) return false;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (VISITED_PREFIXES.some((p) => key.startsWith(p))) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* Whether a pasted Betaflight dump is stored for this aircraft: the dump
 * is stamped with the aircraft it came from, and only that one may fly
 * it. An unstamped dump predates stamping and belongs to the first. */
export function hasFcDump(airframe = AIRFRAME_IDS[0]) {
  if (!readKey(FC_DUMP_KEY)) return false;
  return (readKey(FC_DUMP_AIRFRAME_KEY) || AIRFRAME_IDS[0]) === airframe;
}

/* The tunes an aircraft may fly: its own, plus the custom tune when a
 * dump for it is stored. */
export function tuneChoices(airframe = DEFAULT_AIRFRAME) {
  const ids = tunesFor(airframe).map((t) => t.id);
  if (hasFcDump(airframe)) ids.push(CUSTOM_TUNE.id);
  return ids;
}

/* Floats per land plane, true when the float version is the one flown.
 * Only booleans for planes that have a float version are kept, and a
 * profile seated on a float version always has its plane's entry on. */
export function normaliseFloats(stored, airframe) {
  const floats = {};
  const valid = stored && typeof stored === 'object' && !Array.isArray(stored);
  for (const [id, on] of valid ? Object.entries(stored) : []) {
    if (typeof on === 'boolean' && floatVersionOf(id)) floats[id] = on;
  }
  if (isFloatVersion(airframe)) floats[landPlaneOf(airframe)] = true;
  return floats;
}

/* The id actually flown for a picked aircraft: its float version when the
 * profile has floats on for it. */
export function withFloats(s, id) {
  const floatId = floatVersionOf(id);
  if (floatId && s.floats && s.floats[id]) return floatId;
  return id;
}

/* The three axes of a rates set compared by curve (type, RC rate, super
 * rate, expo): the test for "still the stock rates of that aircraft". */
function sameCurves(have, stock) {
  if (!have || have.type !== stock.type) return false;
  return ['roll', 'pitch', 'yaw'].every((axis) => {
    const a = have[axis];
    const b = stock[axis];
    return Boolean(a) && a.rcRate === b.rcRate && a.srate === b.srate && a.expo === b.expo;
  });
}

/* An aircraft's stock curves, copied so the catalog is never shared. */
function stockCurves(airframe) {
  const { type, roll, pitch, yaw } = airframe.rates;
  return { type, roll: { ...roll }, pitch: { ...pitch }, yaw: { ...yaw } };
}

const limitsWith = (power) => (id) => setupFor(id, powerChoice(id, power)).limits;

/* Puts an aircraft's stock PIDs into its default tune once, the first
 * time the profile meets that tune. Aircraft without stock PIDs are left
 * alone. */
function seedStockPids(s, id) {
  const airframe = airframeById(id);
  const tune = airframe.defaultTune;
  if (!airframe.defaultPids || !tune) return s;
  if (!s.pids || typeof s.pids !== 'object') s.pids = {};
  if (!s.pidsSeeded || typeof s.pidsSeeded !== 'object') s.pidsSeeded = {};
  if (s.pidsSeeded[tune]) return s;
  s.pidsSeeded = { ...s.pidsSeeded, [tune]: true };
  if (!s.pids[tune]) s.pids = { ...s.pids, [tune]: { sliders: { ...airframe.defaultPids } } };
  return s;
}

/*
 * Seats an aircraft in the profile, in place, and returns it.
 *
 * Settings that are the pilot's own stay; settings that were only the old
 * aircraft's stock values become the new one's: rates still at the old
 * stock curves, the old stock throttle cap, and the lens. The tune comes
 * back to what was last flown on the new aircraft. Moving between a plane
 * and its float version carries the build (power, parts, tuning) across
 * unless the target already has one of its own.
 */
export function seatAirframe(s, id) {
  const from = airframeById(s.airframe);
  const to = airframeById(id);

  if (floatVersionOf(to.id) || isFloatVersion(to.id)) {
    const floats = s.floats && typeof s.floats === 'object' ? s.floats : {};
    s.floats = { ...floats, [landPlaneOf(to.id)]: isFloatVersion(to.id) };
  }

  const sameFamily = from.id !== to.id && landPlaneOf(from.id) === landPlaneOf(to.id);
  if (sameFamily && !familyFitted(s, to.id)) {
    const copyAcross = (byId) => (byId && Object.hasOwn(byId, from.id) ? { ...byId, [to.id]: byId[from.id] } : byId);
    s.power = normalizePower(copyAcross(s.power));
    const carried = s.parts && s.parts[from.id];
    if (carried) {
      const existing = s.parts[to.id];
      const plane = normalisePlane(to.id, { ...carried, damage: existing ? existing.damage : null });
      if (plane) s.parts = { ...s.parts, [to.id]: plane };
    }
    s.tuning = normalizeTuning(copyAcross(s.tuning), limitsWith(s.power));
  }

  const lastTunes = { ...(s.tuneFor && typeof s.tuneFor === 'object' ? s.tuneFor : {}), [from.id]: s.tune };
  s.tuneFor = lastTunes;
  s.airframe = to.id;
  const allowed = tuneChoices(to.id);
  if (allowed.includes(lastTunes[to.id])) {
    s.tune = lastTunes[to.id];
  } else if (!allowed.includes(s.tune)) {
    s.tune = to.defaultTune;
  }

  if (!to.packVoltages.includes(s.packVoltage)) s.packVoltage = to.packVoltages[0];
  if (sameCurves(s.rates, from.rates)) s.rates = normaliseRates({ ...s.rates, ...stockCurves(to) });
  if (s.rates && s.rates.throttleCap === from.rates.throttleCap) {
    s.rates = { ...s.rates, throttleCap: to.rates.throttleCap };
  }
  s.cameraFov = to.cameraFov;
  s.cameraAngle = clampCameraAngle(to.cameraAngle);
  seedStockPids(s, to.id);
  return s;
}

/* A loaded profile whose values are some other aircraft's stock settings
 * (a profile from before per aircraft values, or a hand edit) gets the
 * seated aircraft's instead. Values that match no aircraft are the
 * pilot's own and stay. */
function adoptSeatedStock(s) {
  const seated = airframeById(s.airframe);
  const others = AIRFRAMES.filter((a) => a.id !== seated.id);
  if (!tuneChoices(seated.id).includes(s.tune)) s.tune = seated.defaultTune;
  if (!seated.packVoltages.includes(s.packVoltage)) s.packVoltage = seated.packVoltages[0];
  if (others.some((a) => sameCurves(s.rates, a.rates))) {
    s.rates = normaliseRates({ ...s.rates, ...stockCurves(seated) });
  }
  if (s.rates && others.some((a) => a.rates.throttleCap === s.rates.throttleCap)) {
    s.rates = normaliseRates({ ...s.rates, throttleCap: seated.rates.throttleCap });
  }
  if (others.some((a) => a.cameraFov === s.cameraFov)) s.cameraFov = seated.cameraFov;
  if (others.some((a) => clampCameraAngle(a.cameraAngle) === s.cameraAngle)) {
    s.cameraAngle = clampCameraAngle(seated.cameraAngle);
  }
  return s;
}

/* Fields that must be one of a list, and the list. A value not on it
 * takes the default, except the tune, which takes the aircraft's own. */
const ONE_OF = {
  link: () => Object.keys(LINK_PRESETS),
  cameraFov: () => CAMERA_FOVS,
  renderScale: () => RENDER_SCALES,
  fpsCap: () => FPS_CAPS,
  perfMode: () => PERF_MODES,
  latencyMode: () => LATENCY_MODES,
  hudStyle: () => HUD_STYLES,
  peerMarks: () => MARK_STYLES,
  avxInset: () => AVX_INSETS,
  avxLevel: () => AVX_LEVELS,
  avxPalette: () => AVX_PALETTES,
  flightStyle: () => FLIGHT_STYLES,
  laps: () => LAP_COUNTS,
  packVoltage: () => PACK_VOLTAGES,
  musicTrack: () => musicIds(),
  ghost: () => ['off', 'best', 'previous'],
  live: () => ['off', 'on'],
  freestyleScoring: () => FREESTYLE_SCORING,
  weather: () => WEATHER_PRESETS,
  mouseSens: () => MOUSE_SENS,
  mouseExpo: () => MOUSE_EXPOS,
  mouseCentre: () => MOUSE_CENTRES,
};

/* Wing tunes that used to be the stock choice and are not any more: a
 * profile still on one moves to the aircraft's current default once. */
const OLD_WING_STOCK = { bramor2300: 'wing-stab', sky1800: 'sky-stab' };

const WING_VIEWS = ['fpv', 'chase', 'los', 'pilot', 'ball'];

/*
 * The stored profile, every field present and valid. Reading it also
 * updates the dump's aircraft stamp in storage when it names a retired
 * aircraft.
 */
export function loadSettings() {
  let raw;
  try {
    raw = JSON.parse(readKey(SETTINGS_KEY) || '{}');
  } catch (e) {
    raw = {};
  }
  /* A stored null is valid JSON with no fields; reading a field of it
   * would throw and stop the page booting. */
  if (raw === null) raw = {};
  const firstLoadOfGraphics = typeof raw.graphics !== 'string';
  const s = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    s[key] = typeof raw[key] === typeof fallback ? raw[key] : fallback;
  }

  if (s.flightMode !== 'angle') s.flightMode = 'acro';
  if (!WING_VIEWS.includes(s.wingView)) s.wingView = 'fpv';
  s.stickMode = normaliseStickMode(s.stickMode);
  /* Flight keys the pilot moved (src/input/keybinds.js), synced. Absent
   * until one is, so a profile that moved none is stored as before. */
  const keybinds = normaliseKeybinds(raw.keybinds);
  if (hasKeybinds(keybinds)) s.keybinds = keybinds;

  s.airframe = currentAirframeId(s.airframe);
  try {
    const stamp = localStorage.getItem(FC_DUMP_AIRFRAME_KEY);
    if (retiredAirframe(stamp)) localStorage.setItem(FC_DUMP_AIRFRAME_KEY, currentAirframeId(stamp));
  } catch (e) {
    /* The stamp is read again next load. */
  }
  if (!AIRFRAME_IDS.includes(s.airframe)) s.airframe = DEFAULTS.airframe;

  if (!tuneChoices(s.airframe).includes(s.tune)) s.tune = airframeById(s.airframe).defaultTune;
  for (const [key, list] of Object.entries(ONE_OF)) {
    if (!list().includes(s[key])) s[key] = DEFAULTS[key];
  }
  const packs = airframeById(s.airframe).packVoltages;
  if (!packs.includes(s.packVoltage)) s.packVoltage = packs[0];

  s.power = normalizePower(s.power);
  const hudBy = s.hudStyleBy && typeof s.hudStyleBy === 'object' ? s.hudStyleBy : {};
  s.hudStyleBy = Object.fromEntries(Object.entries(hudBy)
    .filter(([id, style]) => AIRFRAME_IDS.includes(id) && HUD_STYLES.includes(style)));
  s.parts = normaliseParts(s.parts);
  s.packs = normalisePacks(s.packs);
  s.combat = normaliseCombat(s.combat, airframeById);
  s.floats = normaliseFloats(s.floats, s.airframe);
  s.tuning = normalizeTuning(s.tuning, limitsWith(s.power));
  s.buildFits = normaliseBuildFits(s.buildFits);
  s.cameraAngle = clampCameraAngle(s.cameraAngle);
  s.weight = clampWeight(s.weight);
  s.livery = normaliseLiveries(s.livery);
  s.progress = normaliseProgress(raw.progress, { existing: Object.keys(raw).length > 0 });
  s.liverySaves = normaliseSaves(s.liverySaves);
  s.swatches = normaliseSwatches(s.swatches);
  s.campaign = cleanCampaign(s.campaign);
  s.flightTime = cleanFlightTime(s.flightTime);

  /* Rates: an object is today's shape; without one, the flat fields of an
   * old profile are converted; a profile with neither on a touch screen
   * starts on the gentler touch rates. */
  const hasRatesObject = Boolean(raw.rates) && typeof raw.rates === 'object';
  const converted = hasRatesObject ? null : ratesFromLegacy(raw);
  if (!converted && !hasRatesObject && touchWanted()) {
    s.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
    s.touchRatesOffered = true;
  } else {
    s.rates = normaliseRates(converted || s.rates);
  }
  s.pids = normalisePids(s.pids);

  if (!(s.wingDefaults >= 1)) {
    if (s.airframe === 'bramor2300' && s.tune === 'wing-manual') s.tune = airframeById('bramor2300').defaultTune;
    s.wingDefaults = 1;
  }
  if (!(s.wingDefaults >= 2)) {
    if (OLD_WING_STOCK[s.airframe] && s.tune === OLD_WING_STOCK[s.airframe]) {
      s.tune = airframeById(s.airframe).defaultTune;
    }
    s.wingDefaults = 2;
  }
  seedStockPids(s, s.airframe);

  for (const key of ['map', 'freestyleMap']) {
    const gone = retiredMap(s[key]);
    if (gone) s[key] = gone.to;
  }
  if (!MAPS.some((m) => m.id === s.map)) s.map = 'track';
  if (!MAPS.some((m) => m.mode === 'freestyle' && m.id === s.freestyleMap)) s.freestyleMap = '';

  adoptSeatedStock(s);
  if (!pitchMatchesRoll(s.rates)) s.ratesSplitPitch = true;
  if (!s.scoringReset) {
    s.freestyleScoring = DEFAULTS.freestyleScoring;
    s.scoringReset = true;
  }
  s.graphics = firstLoadOfGraphics ? detectDefaultGraphics() : normalizeGraphics(s.graphics);
  if (!s.airframeAsked && s.airframe !== FIRST_AIRFRAME) seatAirframe(s, FIRST_AIRFRAME);
  return s;
}
