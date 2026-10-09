/*
 * main.js: the game shell around the physics. It loads dist/sim.wasm,
 * hands it stick samples stamped with their time, and advances it in fixed
 * 1 ms steps; each animation frame only decides how many steps are owed,
 * and the picture is drawn between the last two. The wall clock never
 * becomes a physics timestep, which is why a slow or dropped frame cannot
 * change where the craft goes. It also wires the menus in src/ui/ui.js.
 *
 * The page opens on a title: the loaded map fills the canvas, the Skyhunter
 * flies the map's attract line, and the menu sits on top as a HUD. The map
 * is the photographic Alps until the first flight (see boot.js), unless the
 * address named a world, and from then on the world last flown. Fly builds
 * the pilot's own world first when the title was showing another, and
 * seats the pilot's own aircraft, so the shot is never a second scene.
 * Settings still has its own cheap studio context, created when that
 * screen opens and torn down when flight starts.
 *
 * The physics core knows nothing about terrain, so its free-flight numbers
 * can be verified on their own. This file tells it where the ground is
 * (sim_set_ground) and the core resolves the contact inside every step:
 * grass absorbs a landing with a short slide, an obstacle bounces the
 * craft off. Upside down and at rest is TURTLE MODE, and a pitch or roll
 * input rolls it back over. Only a contact the core cannot resolve, the
 * craft passing through a surface or stuck inside one, ends the run as
 * Crashed and resets to the start line. PROGRESS.md has the history.
 *
 * Flight keys: Escape (pause), R (back to the start line), L (launch
 * control, if enabled), F (next flap setting, on aircraft with flaps),
 * V (crash cam replay, src/replay/crashcam.js), F8 (bug report). All
 * other actions live in the menus. Stick input comes from a radio seen as
 * a Gamepad API joystick, or from WASD and the arrow keys. A Betaflight
 * diff dropped on the page becomes the flight controller config.
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

import * as THREE from 'three';
import { buildShell } from './render/shell.js';
import { applyPixelRatio, normalizeGraphics, pixelRatioFor } from './render/quality.js';
import { createDynRes } from './render/dynres.js';
import { PerfOverlay } from './ui/perfoverlay.js';
import { readGpuInfo } from './render/gpuinfo.js';
import { makeAttractCamera } from './render/attract.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree, simLenToWorld, threePosToSim, threeDirToSim, threePosToDoc, docPosToThree, WORLD_SCALE } from './render/frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP, cameraTiltRad, clampCameraAngle, makeLensShake, fpvLensClear } from './render/lens.js';
import { MotorAudio, VOICES } from './render/audio.js';
import { engineSpecFor } from './render/enginespec.js';
import { WorldAudio } from './render/world-audio.js';
import { courseKind } from './game/progress.js';
import { STRIPS, gateCue, glidePoints, headingOf } from './game/training.js';
import { createGlidePath } from './render/glidepath.js';
import { createGateCue } from './ui/gatecue.js';
import { medalFor, publishMedals } from './game/medals.js';
import { revRpm } from './ui/hangar-polish.js';
import { InputManager, NAV_DEFLECT, throttleKeys } from './input/input.js';
import { mountTouchSticks, touchWanted } from './input/touchsticks.js';
import { RcLink, LINK_DEFAULT, LINK_PRESETS } from './input/link.js';
import { FlightRecorder, downloadText, flightLogName } from './share/flightlog.js';
import { PLANE_REACH, Race } from './game/race.js';
import { planesFor } from './game/verify.js';
import { floatStart } from './builder/course.js';
import { TrickDetector } from './game/trickdetect.js';
import { deriveObstacles, OB_BAR, OB_POLE } from './game/obstacles.js';
import { FreestyleScore, formatScore } from './game/score.js';
import { GhostBook, GhostLap, GhostRecorder, LiveGhost, LiveSender } from './game/ghost.js';
import { buildGhostCraft } from './render/ghostcraft.js';
import { decodeGhost, encodeGhost, encodeLiveFrame, ghostFromBase64, ghostToBase64 } from './share/ghostdata.js';
import { setCraftAirframe, CRAFT_R, CRAFT_WORLD_R, CRAFT_V_UP, CRAFT_V_DOWN, craftVerticalHalf, craftVerticalOffset, contactMaterial, canPerch, PERCH_SPEED, PERCH_RATE, shouldScorePass, shouldEnterTurtle, uprightPlantQuat, turtleFlipEase, turtleFlipLift, turtleSlerpQuat, TURTLE_STICK_MIN, TURTLE_SPEED, TURTLE_RATE, TURTLE_FLIP_MS, TURTLE_INVERT_UPZ, turtleClearance, PROP_PLANE_MAX_UP_DOT, GRAZE_SPEED_MAX, BOUNCE_SPEED_MAX, BOUNCE_COOLDOWN_MS, BOUNCE_SEPARATION, SURFACE_SPEED_MAX, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG, LAND_TIP_SPEED_MAX, GROUND_MU, GROUND_E, PRESS_CONFIRM_MS, PRESS_RELEASE_MS, PRESS_BLEED, thrustIntoFace, makeClipWatch, resetClipWatch, clipWatchTick, CLIP_CENTER_EPS, CLIP_DEEP, CLIP_CRASH_HOLD_MS, CLIP_SPAWN_GRACE_MS, contactPatch, setCraftParts } from './game/collide.js';
import { airframeHull, hullFromPartsState, hullIntact, THREE_BODY } from './game/airframehull.js';
import { Ui, SETTINGS_KEY, AVX_INSETS, AVX_LEVELS, formatTime, WEIGHT_STOCK, clampWeight, gravityScaleFor, hudStyleFor, lapCraftOf, seatAirframe } from './ui/ui.js';
import { AvionicsHud } from './ui/avionicshud.js';
import { createFlightTelemetry } from './avionics/telemetry.js';
import { createSensorManager, thermalMode } from './avionics/sensors.js';
import { createPerception } from './avionics/perception.js';
import { createTrackManager } from './avionics/tracks.js';
import { hudStateOf } from './avionics/hudstate.js';
import {
  adoptShareFromLocation, fetchGhost, fetchTrackDocument,
  fetchTrackTimes, postFreestyleRun, postTime,
} from './share/board.js';
import { findBoardTwin, inspectCourse, layoutFingerprint, publishCurrentCourse, pushOwnedListing, seatedCourseKey, syncOwnedIdentity } from './share/listing.js';
import { createFlightStats, pingVisit } from './share/stats.js';
import {
  addFlight, createFlightClock, deviceId, mergeFlightTime, stepsAreFlight,
} from './share/flighttime.js';
import { nameRules, readAccount, readPilotName, writePilotName } from './share/pilot.js';
import { createIdentity } from './share/identity.js';
import { createLiveLink } from './share/live.js';
import {
  createRoomLink, devAccount, figurePick, namePick, ownName, randomNamePick, roomLink, setFigurePick, setNamePick, wantedRoom,
} from './share/rooms.js';
import { createRoomSafety } from './share/roomsafety.js';
import { createVoice } from './share/voice.js';
import { createVoiceUi } from './ui/voiceui.js';
import { createRoomBrowser } from './ui/roombrowser.js';
import { createRoomRace } from './share/roomrace.js';
import { GOALS, GOAL_STEP, createRoomTag, goalOf } from './share/roomtag.js';
import { createJamRun, createRoomJam } from './share/roomjam.js';
import { jamHudView, jamResultsView, jamTurnShout } from './ui/jamhud.js';
import { MODES, modeById, modeOfRoom, modeOfWire } from './share/modes.js';
import {
  createTagShout, tagHudView, tagResultsView, tagRows,
} from './ui/roomtaghud.js';
import {
  RoomRaceHud, hudView, raceRows, resultsView, trackName,
} from './ui/roomhud.js';
import {
  FIGURE_COUNT, FLAG_AIRBORNE, FLAG_CHUTE, FLAG_CRASHED, FLAG_GEAR_DOWN, FLAG_LIGHTS, FLAG_QUAD, FLAG_SMOKE,
  FLAG_SPAWNING, checkCrashTable, checkWhack, decodePartsRelay, encodePose, normaliseCode, normaliseRoomName, streamerColour,
} from './share/roomwire.js';
import { PeerTrack, nearWeight } from './game/peer.js';
import {
  LATE_MS, applyHit, checkHit, hullFor, roomForcesDamage, sideFor,
} from './game/midair.js';
import { SLOT_RIGHT_M, slotSpawn, stationFor } from './game/slots.js';
import { buildPeerCraft, buildPilotFigure, profileKey } from './render/peers.js';
import { bubbleLevel, createAceBubble } from './render/acebubble.js';
import { createCrownFx } from './render/acecrown.js';
import { createPeerWreck, createWreckSender } from './share/roomwrecks.js';
import { createRoomCombat } from './share/roomcombat.js';
import { createStreamerLayer } from './render/streamers.js';
import { createCombatHud } from './ui/combathud.js';
import { createRoomWar } from './share/roomwar.js';
import { createRoomOps } from './share/roomops.js';
import { grounded } from './share/ops/missions.js';
import { feedSnow } from './share/ops/feed.js';
import { HOLD_BANK, holdOf, holdPose } from './share/ops/hold.js';
import { opsWorldOf } from './share/opsworlds.js';
import { resolve as opsResolve } from './share/ops/stages.js';
import { localHour } from './share/interior/clock.js';
import { FAR_M, ballFor, createBall, groundHit, threeCameraOf } from './avionics/camball.js';
import { createCapture, createStillStore } from './avionics/capture.js';
import { OpsHud, heldRolesOf } from './ui/opshud.js';
import {
  bearingSaid, briefOf, createNudger, focusOf, goalLine, nudgeOf, targetOf,
} from './share/ops/guide.js';
import { RolesBoard, roleName } from './ui/rolesboard.js';
import { playInteriorFilm, filmsFor as opsFilmsFor } from './render/interiorfilms.js';
import { spotFilm } from './share/ops/spotfilm.js';
import { FILMS as OPS_FILMS } from './share/interior/films/index.js';
import { Debrief } from './ui/debrief.js';
import { createOpsCampaignScreen } from './ui/opscampaign.js';
import { createTrainingScreen } from './ui/training.js';
import { INTERIOR, INTERIOR_CAMPAIGN } from './game/campaign.js';
import { SIZE as CONTACT_SIZE, centreOf } from './share/ops/contacts.js';
import { DEATH as WAR_DEATH, createAttackers } from './render/attackers.js';
import { SIZE_MAX as WAR_BOOM_MAX, createExplosions } from './render/explosion.js';
import { createWarHud } from './ui/warhud.js';
import { createWarMarkers } from './ui/warmarkers.js';
import {
  allowanceOf, createWarRoundCard, roundOf, spentOf,
} from './ui/warround.js';
import { BRIEF_LINES, DEBRIEF_LINES, createWarCalls } from './render/warradio.js';
import {
  createNudger as createWarNudger, ground as warGround, headingOf as warHeadingOf, nudgeOf as warNudgeOf, threatOf as warThreatOf,
} from './share/war/nudge.js';
import VOICE_LENGTHS from './share/war/voicelen.js';
import { createCampaignScreen } from './ui/campaign.js';
import { MISSIONS as WAR_MISSIONS, missionTime } from './share/war/missions/index.js';
import { briefingOf } from './ui/briefing.js';
import {
  ACT1, createCampaignStore, markSeen, released, seenFilm,
} from './game/campaign.js';
import { createGrid as createWarGrid } from './share/war/grid.js';
import { burnAt as warBurnAt } from './share/war/world.js';
import { play as playWarIntro } from './render/warintro.js';
import { filmFor } from './share/war/films/index.js';
import { spilling } from './share/war/stages.js';
import { createWarCutaway } from './render/warcutaway.js';
import { startTrackSync } from './share/cloud.js';
import { createAccountUi } from './ui/accountui.js';
import { checkSession, needSignIn } from './share/account.js';

/* The pilot's key for signing posted times and saved tracks, made on first
 * use and kept in this browser. See src/share/identity.js. */
const identity = createIdentity();
/* Saved tracks go online with that key (src/share/cloud.js), from boot on,
 * whether or not the builder is ever opened this visit. */
startTrackSync(identity);
import {
  clearPendingTime,
  clearShareImport,
  readBind,
  readEditKey,
  readPendingTime,
  readShareImport,
  lapSlot,
  writePostedBest,
  writeShareImport,
} from './share/session.js';
import { isMapTrack } from './trackbuilder/model.js';
import { loadMapTrack } from './trackbuilder/storage.js';
import { createShowcase } from './render/showcase.js';
import { createCarouselStage } from './render/carousel3d.js';
import { createRoomView, PHOTO_FRAMES } from './render/hangarroomview.js';
import { listClips, downloadBlob, stampedName } from './replay/store.js';
import { listPhotos, putPhoto } from './ui/photostore.js';
import { qualityFor } from './render/quality.js';
import { dressLivery } from './render/livery.js';
import { dressParts } from './render/partsfit.js';
import { celTimeCount } from './render/celmat.js';
import { MAPS, mapById } from './maps/registry.js';
import { retiredMap } from './maps/retired.js';
import { TUNES, tuneById, tunePath } from '../configs/registry.js';
import { POWER, powerBlock, powerCells, powerChoice, powerOption, powerParams, SIM_POWER } from '../configs/power.js';
import { ESTIMATES } from '../configs/power-estimates.js';
import { MOTORS, choiceKey, hasMotors, motorChoice, motorStats, motorsBlock, propPackBlock, quadChoices } from '../configs/motors.js';
import { MOTOR_ESTIMATES } from '../configs/motor-estimates.js';
import { fullEntry, normalizeEntry, setupFor, tuneBlock, tuningFor } from '../configs/tuning.js';
import { TestStand } from './game/teststand.js';
import { setTuningShell, standSound } from './ui/hangar-tuning.js';
import {
  AIRFRAMES, DEFAULT_AIRFRAME, STRIKER_CAMERA, WAR_AIRFRAMES, WAR_DEFAULT, airStartSpeed, airframeById, isWarAirframe,
} from '../configs/airframes.js';
import { craftBuilderFor } from './render/craft.js';
import { liveryFor, setLiverySource } from './render/livery.js';
import { setAtlasPreset } from './render/decals.js';
import { partsFor, setPartsSource } from './render/partsfit.js';
import { PROPS, addonParams, normaliseParts, partsEntry, partsGear, partsPowerBlock, propShape } from '../configs/hangar-parts.js';
import { accrue, impactsFrom, propulsionHealth, realismFlight, startSortie, wearRecordOf, wornPowerBlock, wornQuadBlocks } from '../configs/wear.js';
import { learnPartTable } from './ui/hangar-parts.js';
import { combatAddon, combatChoice, combatSimId, payloadForWarhead, propulsionOf, setCombatSource, warPayload } from '../configs/combat.js';
import { liveryKey, lookFor, paintable } from '../configs/liveries.js';
import { packEntry } from '../configs/paint.js';
import { SKY_MOUNT_FORWARD, SKY_MOUNT_UP } from './render/skycraft.js';
import { CUB_MOUNT_FORWARD, CUB_MOUNT_UP, CUB_FLOAT_MOUNT_UP, CUB_FLOATS } from './render/cubcraft.js';
import { GLIDER_MOUNT_FORWARD, GLIDER_MOUNT_UP } from './render/glidercraft.js';
import { BRAMOR_MOUNT_FORWARD, BRAMOR_MOUNT_UP } from './render/bramorcraft.js';
import { SLOWSTICK_MOUNT_FORWARD, SLOWSTICK_MOUNT_UP } from './render/slowstickcraft.js';
import { BOMBSHELL_MOUNT_FORWARD, BOMBSHELL_MOUNT_UP } from './render/bombshellcraft.js';
import { KADET_MOUNT_FORWARD, KADET_MOUNT_UP } from './render/kadetcraft.js';
import { F16_MOUNT_FORWARD, F16_MOUNT_UP } from './render/f16craft.js';
import { UGLYSTIK_MOUNT_FORWARD, UGLYSTIK_MOUNT_UP } from './render/uglystikcraft.js';
import { TIGERMOTH_MOUNT_FORWARD, TIGERMOTH_MOUNT_UP } from './render/tigermothcraft.js';
import { EXTRA_MOUNT_FORWARD, EXTRA_MOUNT_UP } from './render/extracraft.js';
import { DLG_MOUNT_FORWARD, DLG_MOUNT_UP } from './render/dlgcraft.js';
import { P51_MOUNT_FORWARD, P51_MOUNT_UP } from './render/p51craft.js';
import { ZAGI_MOUNT_FORWARD, ZAGI_MOUNT_UP } from './render/zagicraft.js';
import { TIMBER_MOUNT_FORWARD, TIMBER_MOUNT_UP, TIMBER_FLOAT_MOUNT_UP, TIMBER_FLOATS } from './render/timbercraft.js';

/* Where each fixed wing carries its FPV camera, forward and up from the CG
 * in the craft frame, from the module that draws it. A quad's comes from
 * src/render/lens.js. */
const WING_MOUNTS = {
  sky1800: [SKY_MOUNT_FORWARD, SKY_MOUNT_UP],
  cub1400: [CUB_MOUNT_FORWARD, CUB_MOUNT_UP],
  radian2000: [GLIDER_MOUNT_FORWARD, GLIDER_MOUNT_UP],
  bramor2300: [BRAMOR_MOUNT_FORWARD, BRAMOR_MOUNT_UP],
  slowstick1180: [SLOWSTICK_MOUNT_FORWARD, SLOWSTICK_MOUNT_UP],
  bombshell1118: [BOMBSHELL_MOUNT_FORWARD, BOMBSHELL_MOUNT_UP],
  f16878: [F16_MOUNT_FORWARD, F16_MOUNT_UP],
  kadet1981: [KADET_MOUNT_FORWARD, KADET_MOUNT_UP],
  uglystik1567: [UGLYSTIK_MOUNT_FORWARD, UGLYSTIK_MOUNT_UP],
  tigermoth1803: [TIGERMOTH_MOUNT_FORWARD, TIGERMOTH_MOUNT_UP],
  extra3d1308: [EXTRA_MOUNT_FORWARD, EXTRA_MOUNT_UP],
  nrj1490: [DLG_MOUNT_FORWARD, DLG_MOUNT_UP],
  p51d1450: [P51_MOUNT_FORWARD, P51_MOUNT_UP],
  zagi1219: [ZAGI_MOUNT_FORWARD, ZAGI_MOUNT_UP],
  striker2500: [STRIKER_CAMERA.forward, STRIKER_CAMERA.up],
  timber1500: [TIMBER_MOUNT_FORWARD, TIMBER_MOUNT_UP],
  /* On floats the CG is lower, so the camera stands higher over it. */
  timber1500f: [TIMBER_MOUNT_FORWARD, TIMBER_FLOAT_MOUNT_UP],
  cub1400f: [CUB_MOUNT_FORWARD, CUB_FLOAT_MOUNT_UP],
};

/* The aircraft the title flies, whatever is seated: the owner's choice, and
 * a wing, so the title never shows a seaplane parked on grass. */
const TITLE_CRAFT = 'sky1800';
import { disposeSceneGraph, shareInstancedDepth } from './render/shell.js';
import { normaliseRates, ratesAreDefault, ratesDiff, ratesSummary, TOUCH_RATE_DEFAULTS } from '../configs/rates.js';
import { clearPidsFor, PID_AXES, pidCliKey, pidsDiffFor, SLIDER_KEYS, SLIDERS } from '../configs/pids.js';
import { cliMap, composeConfig, FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY, moduleDump, moduleGet, RATES_KEEP, ratesFromDump, tuneBody } from './fc/dump.js';
import { GATE_SCALE, gateScaleFor } from './game/track.js';
import { fetchWithProgress, planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { FpvOsd } from './ui/fpvhud.js';
import { PeerMarks } from './ui/peermarks.js';
import { loadSim, simErrorName, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';
import { currentLocale, plural, str } from './strings/index.js';
import { declareBodies, floatSpawn, insideWater, surfaceAt, waterFor, wetHeight } from './game/water.js';
import { makeWeather, MAPS as WEATHER_MAPS, PRESET_IDS as WEATHER_PRESETS } from './game/weather.js';
import { KINDS, TURNED } from './game/collide.js';
import {
  conditionOf, createDamageLink, damagedPart, isPowered, isWreck, PART_STATE_DOUBLES, STATE,
} from './game/damage.js';
import { JELLY_MASK, REACH_OF_SPAN, jellyNear, whack } from './game/jelly.js';
import { collectTrees, groundSurface, kindMaterial, nearestSolids, nearestTrees, nearestWires, obstacleSurfaces, postGive, solidSurfaceAt, turnedBoxPose } from './game/crashworld.js';
import {
  DAMAGE_FLAGS, EVENT, EVENT_TYPES, MATERIALS, OBSTACLES_MAX, PART_KINDS, SURFACE, SURFACES, TREES_MAX, WIRES_MAX, partLabel,
} from '../configs/parts.js';
import { createWreck } from './render/wreck.js';
import { createDebris } from './render/debris.js';
import { createBreakage } from './render/breakage.js';
import { createSmoke } from './render/smoke.js';
import { createFpvFail } from './render/fpvfail.js';
import { createJournal } from './replay/journal.js';
import { createCrashCam } from './replay/crashcam.js';
import { crashRecord } from './share/crashrecord.js';
import { stateHash } from './replay/recorder.js';

/*
 * The physics module's address, beside this file rather than at the site
 * root, because a deploy serves the shell under /sim/ with a landing page
 * at the root, where '/dist/sim.wasm' fetched the landing page's 404.
 *
 * A deployed page loads this module at ?v=<commit> (scripts/stamp-version.js)
 * and the physics has to come from the same deploy as the code that calls
 * it, so the module's own query goes on the wasm too. From a checkout the
 * query is empty and the URL is what it always was.
 */
const WASM_URL = new URL(`../dist/sim.wasm${new URL(import.meta.url).search}`, import.meta.url).href;

/*
 * WHERE THE GROUND HOLDS THE CRAFT, metres from its centre down to the
 * surface it parks on. SPAWN_ALT is where the ground plane sits under the
 * plant's origin (worldPosToSim puts the surface at sim z minus it), and
 * REST_HEIGHT is where the parked render and a landing put the craft;
 * seatRestHeight sets both from the seated airframe so they cannot part.
 * They are each aircraft's own figure: one machine's number under another
 * rests it in the air or in the floor. The spawn is the parked pose, not a
 * hover, so a takeoff starts from the grass the pilot sees. Seated between
 * runs only, with the hull and the model (syncCraftScale), since moving
 * the floor mid lap moves it under a flying craft. 0.045 is the five
 * inch's, the figure before any airframe is seated.
 */
let SPAWN_ALT = 0.045;
let REST_HEIGHT = 0.045;
/* The gear pose an aircraft stands at: the kit's, or the hangar's parts'
 * (bigger tyres stand it higher), set by the shell once it has settings. */
let partsGearOf = () => null;
function gearOf(af) {
  return af ? (partsGearOf(af.id) ?? af.gear ?? null) : null;
}
/* An aircraft on wheels rests where its gear holds it, not on its lowest
 * drawn point; one on floats rests where they float it when it starts on
 * water; anything else on its hull's lower half extent from
 * configs/airframes.js (vHalfDown, snapshotted from plant.c). */
function seatRestHeight(af, onWater = false) {
  const dims = af && af.dims;
  const h = onWater && af.floats ? af.floats.restHeight
    : gearOf(af) ? gearOf(af).restHeight
    : dims && Number.isFinite(dims.vHalfDown) ? dims.vHalfDown : 0.045;
  SPAWN_ALT = h;
  REST_HEIGHT = h;
}

/*
 * TAKING OFF AND SITTING DOWN. A parked craft takes off when the throttle
 * passes TAKEOFF_THROTTLE (the launch latch's 0.05 would lift it the moment
 * it landed with any throttle held) and may only sit down again once the
 * throttle is back under TAKEOFF_RELEASE. The gap between them is the
 * hysteresis a thumb resting near one threshold needs, or the craft lands
 * and leaves on alternate frames with a blip each time. GROUND_CUE_GAP_MS
 * is the least time between two of those blips whatever the latch does (it
 * gates the sound, nothing else). TAKEOFF_WINDOW_MS is how long after a
 * takeoff contact cues stay muted, on the wall clock: a flag cleared in
 * the same frame cannot cover a frame that is 100 ms long.
 */
const TAKEOFF_THROTTLE = 0.25;
const TAKEOFF_RELEASE = 0.18;
const GROUND_CUE_GAP_MS = 220;
const TAKEOFF_WINDOW_MS = 250;

/*
 * Taken off the height query's fromY, metres. The city's multi level query
 * picks a floor by a walker's rule, any platform within a 0.55 m step of
 * fromY, which let a deck above a craft flying under it count as its
 * floor. Lowered by this much, the step becomes a 0.15 m landable depth:
 * a kerb still counts, a deck from underneath never does.
 */
const SURFACE_BIAS = 0.40;
/* The plant reports motor speed in rpm; the rooms' wire carries rad/s. */
const RPM_PER_RAD_S = 60 / (2 * Math.PI);
/*
 * How far the camera rises while the craft sits on the ground, world
 * metres, eased in and out. Render only. A parked lens is 5.6 cm off the
 * surface and the near plane is 0.2 m (src/render/shell.js), so tilted up
 * the ground ahead fell inside the near plane and was clipped away; 0.30 m
 * clears it across the frame, about the height of a launch pad.
 */
const PARKED_LIFT = 0.30;

/*
 * THE OPENING SHOT of a run, in wall milliseconds on the frame's own clock:
 * an orbit round the craft on the pad, an approach that settles behind it,
 * then a zoom into the FPV lens. The orbit starts behind the right shoulder
 * (INTRO_THETA0, radians) and sweeps 300 degrees to dead astern, and the
 * approach closes from there; radii and heights are world metres, outside
 * the near plane. INTRO_FLOOR_CLEAR keeps the camera that far above what is
 * under it, enough for a launch block's deck and smaller than the finish
 * shot's, which would throw this close shot into the air.
 *
 * One frame advances the shot by at most INTRO_STEP_MAX, the physics
 * accumulator's own cap: a hitch stretches the shot by its own length, and
 * a slow but steady machine still plays it at its authored speed. (A 30 fps
 * cap here once ran the shot at a third of its speed on a slow laptop.)
 */
const INTRO_ORBIT = 2200;
const INTRO_APPROACH = 800;
const INTRO_ZOOM = 1000;
const INTRO_FLY = INTRO_ORBIT + INTRO_APPROACH;
const INTRO_TOTAL = INTRO_FLY + INTRO_ZOOM;
const INTRO_STEP_MAX = 100;
const INTRO_THETA0 = 0.55;
const INTRO_ORBIT_SPAN = (300 * Math.PI) / 180;
const INTRO_ORBIT_RADIUS = 0.72;
const INTRO_ORBIT_HEIGHT = 0.30;
const INTRO_APPROACH_RADIUS = 0.40;
const INTRO_APPROACH_HEIGHT = 0.14;
const INTRO_FOV = 40;
const INTRO_FLOOR_CLEAR = 0.12;
/* The closing shot: off the FPV lens to a three-quarter view of the frozen
 * craft, in world metres, then a slow sway. (The FPV lens keeps its own
 * floor, fpvLensClear in src/render/lens.js.) */
const FINISH_FOV = 46;
const FINISH_RADIUS = 2.35;
const FINISH_HEIGHT = 0.88;
const FINISH_PULL_MS = 1050;
const FINISH_SWAY = 0.00055;
/* Smoothstep over 0 to 1, flat outside it: the shots' easing. */
function introEase(t) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/*
 * CLOCKS. The controller takes each stick sample as one RC frame, so the
 * shell feeds it at a radio's rate (RC_HZ, a typical ELRS link and the
 * harness recording rate), not the display's. SIM_HZ is the physics step
 * rate and must equal SIM_STEP_HZ in src/native/sim_abi.h, which the ABI
 * does not report. The shell counts steps and derives milliseconds from
 * them (MS_PER_STEP), so a different step rate cannot turn into a silent
 * factor somewhere a count of steps was read as milliseconds.
 */
const RC_HZ = 250;
const SIM_HZ = 1000;
const MS_PER_STEP = 1000 / SIM_HZ;
/* The most wall time one frame steps the plant, ms: a longer frame (a
 * hitch, or a machine under 10 fps) steps this much and the plant falls
 * behind the wall. */
const FRAME_DT_MAX = 100;
/* Over SLOW_WINDOW_MS, a plant that most frames stepped less than the
 * wall time since the last is slow, and in a room the pilot is told
 * (roomSlowFrame). One hitch is not most frames. */
const SLOW_WINDOW_MS = 2000;
/* The radius the trick detector's wall query asks with, metres. A Wall
 * Ride is flown far closer; the query only has to find the wall before
 * the craft is beside it (TrickDetector.near). */
const WALL_NEAR_M = 2.0;

/* The pack gauge's ends per cell, volts, times the airframe's cell count.
 * The HUD's only: the plant has its own figures. */
const PACK_EMPTY_PER_CELL = 3.3;
const PACK_FULL_PER_CELL = 4.2;
/* Rotor speed at full throttle on a full pack, rpm, as the module measured
 * it (25,570). Only the lens shake reads it, as the top of its scale. */
const FULL_THROTTLE_RPM = 25600;

const uiRoot = document.getElementById('ui');

/* A refused tune file, in words a pilot can act on: whether the file is
 * wrong or the simulator would not take it. */
function configFault(code) {
  const why = {
    [-4]: 'main.it_does_not_look_like_a',
    [-2]: 'main.the_file_was_empty_or_too',
  };
  return str(why[code] ?? 'main.the_simulator_refused_it_and_kept');
}

/* A file's bytes, streamed so the loading screen can count them. */
function fetchBytes(url, onProgress) {
  return fetchWithProgress(url, onProgress);
}

/* World axes for quaternion builds, allocated once. */
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/*
 * How many modules each map's import fetches, which is only the weight of
 * the loading bar's module stage (moduleCounter watches the browser's
 * resource timing for them): a wrong count moves the bar at the wrong pace
 * and cannot break a load. A map with no entry weighs 4.
 *
 * swiss2: swiss2.js and the files under src/maps/swiss2/ it imports, 46 in
 * all. The Alps modules it builds through, and the asset library's
 * (src/render/library/, where its tree models went), are under their own
 * prefixes, so they are not in this number, and a pilot who flew the Alps
 * first already has them. Check 16 asserts this count against what the
 * browser actually fetched on choosing the valley, because a bar weight
 * that is wrong cannot break a load and so nothing else would notice: 61
 * sat here for a round for the city while the real count was 63.
 *
 * The freestyle town and the airfield were removed on 2026-09-28, and the
 * town's 72 went with it. `npm run lint:memory` prints the fetched count
 * per map beside this number.
 *
 * The prefix a map's modules are counted under is `/src/maps/<id>`, and it
 * stays leading-slash while the rest of the file went relative, which is
 * not an oversight. It is never fetched. moduleCounter matches it as a
 * substring of each performance entry's full URL, and a shell mounted at
 * https://fdfpv.example/sim/ still produces names containing
 * /src/maps/swiss2.
 *
 * itaipu: itaipu.js and src/maps/itaipu/, 34 (the town is 9 of them,
 * the vegetation 3, the spawns and the title's flight 2, the war's
 * switchyard 2, look/night.js, mission 4's fixtures, loaded whether
 * the map is built for day or night, water/meet.js, where the water
 * meets the dam, terrain/conform.js, where the ground does, and the
 * flood's water/live.js, surface.js, bed.js and flood.js, whose water
 * Free Flight draws from the map's build on, and breach.js, the water
 * through a hole torn in a gate, drawn with it, docs/FLOOD.md). The
 * terrain engine (src/maps/terrain/) and the swiss2 look it is built
 * with are under their own prefixes, as the Alps' modules are for
 * swiss2. */
const MAP_MODULE_COUNT = { swiss2: 46, itaipu: 34 };

/* The world a boot that could not build its own falls back to: the Alps,
 * the lightest world left and the one the Swiss valley builds through. */
const FLOOR_WORLD = 'alps';

/*
 * `?time=night` (Itaipu's mission 4, "Night raid"; src/maps/itaipu.js
 * options.time), or one of Itaipu's other times of day (`morning`,
 * `noon`, `golden`: src/maps/itaipu/look/light.js TIMES, named here and
 * not imported, so the shell does not load a map's module before the map
 * is picked): read once, here, rather than at every loadMap call site,
 * and left out of `options` entirely unless it names one, so a map with
 * no notion of time sees nothing new. Not stored: a link with it in
 * stays a link into the night, never a standing setting. A caller's own
 * time (the night raid's) wins over the address's. */
const ADDRESS_TIMES = new Set(['night', 'morning', 'noon', 'golden']);
function withTimeOption(options) {
  const time = new URLSearchParams(window.location.search).get('time');
  return ADDRESS_TIMES.has(time) && !(options && options.time) ? { ...options, time } : options;
}

/* The time a world is built at: the night raid's night when a caller
 * asks for it, else the address's ?time=, else day. */
function timeOf(options) {
  return withTimeOption(options).time || 'day';
}

/* The map module's import, as the loading screen's module stage. It is a
 * stage of its own because it fails for network reasons, where the build
 * after it stalls on the main thread. */
async function importMapModule(entry, loading) {
  loading.start('module');
  const counter = moduleCounter(
    `/src/maps/${entry.id}`,
    MAP_MODULE_COUNT[entry.id] ?? 4,
    (f, got, total) => loading.report('module', f, str('main.of_modules', { got, total })),
  );
  let mod;
  try {
    mod = await entry.load();
  } finally {
    counter.stop();
  }
  loading.done('module');
  loading.detail = '';
  return mod;
}

/* Builds world `id` and returns it: its module fetched, its scene built
 * through the loading screen's world stage, its water and the ground over
 * that water attached. */
async function loadMap(shell, id, loading, mapOptions) {
  const options = withTimeOption(mapOptions);
  /* Liveries dressed in this world draw their layers at its preset. */
  setAtlasPreset(options.quality);
  const entry = mapById(id);
  /* Track mode's seat is resolved to a world by worldId before anything
   * asks for one, so a seat reaching here is a caller that skipped it. */
  if (entry.id !== id || !entry.load) {
    throw new Error(`${id} is not a world that can be built`);
  }
  loading.mapInfo({ name: entry.name, poster: entry.poster });
  const mod = await importMapModule(entry, loading);
  loading.mapPhases(mod.PHASES);
  loading.start('world');
  await yieldToPaint();
  /* A builder names each phase as it starts it (its module's PHASES), and
   * the boot screen's rows follow; a phase named without a fraction moves
   * the rows and not the bar. */
  const map = await mod.buildMap(shell, (f, phase) => {
    loading.phase(phase);
    if (f !== undefined) {
      loading.report('world', f);
    }
  }, options);
  /* The builder has returned, so every phase it ran is over (the scene's
   * compile among them). */
  loading.closePhases();
  shareInstancedDepth(map.scene);
  loading.finalSystem('world', 'loading');
  map.graphics = normalizeGraphics(options && options.quality);
  /* The map's water, as the plant is told it: src/game/water.js. */
  map.water = await waterFor(id, map);
  /* The ground over a river or a pool is its water, as over the lake. */
  map.height = wetHeight(map.height, map.water);
  loading.finalSystem('world', 'ready');
  loading.done('world');
  return map;
}

export async function boot({
  loading, bootStart, mapId, titleMap, retiredFrom,
}) {
  const BOOT_START = bootStart ?? performance.now();
  /* Ordering matters: pingVisit strips every utm_ parameter from the
   * address (keeping the sponsor's utm_source aside for thirty days), and
   * that has to happen before any code reads or copies the URL. Pilots
   * share tracks by pasting the address they see, and a pasted campaign tag
   * would credit the friend's visit to a campaign they never saw. Other
   * parameters (map, share, board, craft) are untouched. The visit count
   * itself is daily per browser, honours the opt-out and Global Privacy
   * Control, and is fire and forget, so boot never waits on it. */
  pingVisit('sim');
  const canvas = document.getElementById('view');
  /* desynchronized: input to photon latency is what a pilot feels, and
   * nothing reads the canvas back, so it may bypass the compositor queue
   * (shell.js measures what that queue costs). ?gpu=low exists only to
   * measure the integrated GPU on a dual-GPU machine; it is read per page
   * load and never saved, so one test URL cannot leave a laptop flying on
   * the slow chip. */
  const gpuQuery = new URLSearchParams(window.location.search).get('gpu');
  const shell = buildShell(canvas, {
    desynchronized: true,
    powerPreference: gpuQuery === 'low' ? 'low-power' : 'high-performance',
  });
  loading.system('input', 'loading');
  const input = new InputManager();
  /* The sticks are read on a 2 ms timer of their own: a frame rate read
   * would hand feedforward steps as coarse as the display (src/input/input.js). */
  input.startPolling(2);
  loading.system('input', 'ready');
  const ui = new Ui(uiRoot);
  /* Every model of a plane is built in the pilot's paint for it
   * (src/render/livery.js, configs/liveries.js), read from the settings as
   * they are when it is built. The boot craft, built above, is a quad. */
  setLiverySource((id) => (paintable(id) ? lookFor(id, ui.settings.livery[liveryKey(id)]) : null));
  /* And what it is fitted with (configs/hangar-parts.js), on the power
   * option it flies. */
  setPartsSource((id) => (PROPS[id] ? {
    entry: partsEntry(ui.settings.parts, id),
    option: POWER[id] ? powerOption(id, powerChoice(id, ui.settings.power).option) : null,
  } : null));
  partsGearOf = (id) => (PROPS[id] ? partsGear(id, partsEntry(ui.settings.parts, id)) : null);
  /* The flight controller's OSD over the FPV camera. See src/ui/fpvhud.js. */
  const fpvOsd = new FpvOsd(uiRoot);
  /*
   * THE AVIONICS HUD (docs/AVIONICS-HUD.md): five systems and the state
   * machine, fed from the same frame as the OSD. Only FlightTelemetry runs
   * on every flight frame; the sensor, perception and tracks run while the
   * Avionics HUD is on screen. avxTruth is the war's attackers this frame,
   * handed over by roomWarFrame and taken once. avxHud.ai is the pilot's
   * AI switch (H).
   */
  const avionicsHud = new AvionicsHud(uiRoot);
  avionicsHud.setLevel(ui.settings.avxLevel);
  /* The boot screen's TELEMETRY row is this model being built. */
  loading.system('telemetry', 'loading');
  const telemetry = createFlightTelemetry();
  loading.system('telemetry', 'ready');
  const sensors = createSensorManager({ renderer: shell.renderer, scene: () => shell.quad.parent, camera: shell.camera });
  sensors.setInset(ui.settings.avxInset);
  sensors.setPalette(ui.settings.avxPalette);
  /* The top of the map under a point, for what hides a target. */
  const avxHeightAt = (x, z) => view.height(x, z, Infinity);
  const perception = createPerception({ seed: 0x51ED5EED, heightAt: avxHeightAt });
  const tracks = createTrackManager({ heightAt: avxHeightAt });
  /* The inset boxes the tracks itself (docs/AVIONICS-SENSORS.md). */
  sensors.setTracks(tracks.snapshot);
  /* What the picture is doing, for the sensor: fpvfail's snow and loss. */
  const avxVideo = { snow: 0, lost: false };
  /* Thermal's night advantage: what light the sensors have. */
  const avxEnv = { light: 1 };
  const avxHud = { state: 'MANUAL', reasons: [], ai: false };
  const avxOwn = { p: [0, 0, 0], v: [0, 0, 0], camera: shell.camera };
  const avxVel = new THREE.Vector3();
  const AVX_NO_TRUTH = [];
  let avxTruth = AVX_NO_TRUTH;
  let avxFed = false;
  let avxLastT = -1;
  window.__avionics = {
    deny: (what, on) => telemetry.deny(what, on),
    ai: (on) => { avxHud.ai = Boolean(on); },
    /* The TrackManager's snapshot, for a check to read or to seed. */
    snapshot: () => tracks.snapshot,
    state: () => ({
      hud: { ...avxHud, reasons: [...avxHud.reasons] },
      tel: JSON.parse(JSON.stringify(telemetry.state)),
      sensor: { ...sensors.state },
      tracks: tracks.snapshot.tracks.length,
    }),
  };
  /*
   * THE CAMERA BALL (src/avionics/camball.js, docs/campaign/interior/
   * TECH-NEEDS.md N14) and an ops mission's camera and captures
   * (src/share/roomops.js, src/avionics/capture.js). An aircraft that
   * carries a ball has a fourth view on C: the ball's picture full screen,
   * the screen's camera put where the ball looks, so the sensor's modes
   * and its digital zoom draw it exactly as they draw the pilot's camera.
   * Its quiet HUD is src/ui/opshud.js.
   *
   * Keys while it is the view: Q and E pan, Y and H tilt, = and - (or
   * Page Up and Page Down) the lens's zoom, K the sensor's digital zoom,
   * J the sensor's mode, U locks the ball on the ground under the cross
   * or frees it (B is the track builder's), Space captures. A standard pad: the D-pad slews, the
   * triggers zoom, L3 captures, R3 locks. A mouse: the right button drags
   * the picture, the wheel zooms (with Shift while the mouse flies).
   *
   * In an ops match every screen reports its camera to the room two a
   * second (CONTRACT-P0.md 3 `cam`): the ball's when it is the view, else
   * where the screen camera's axis meets the ground and its own field.
   */
  const opsHud = new OpsHud(uiRoot);
  opsHud.onTouch = { lock: () => ballToggleLock(), capture: () => opsCaptureNow() };
  /* The role board (src/ui/rolesboard.js): ` opens it, and its button. */
  const rolesBoard = new RolesBoard(uiRoot, {
    take: (id) => roomOps.take(id),
    active: (key) => roomOps.active(key),
    swap: (seat, give, take) => roomOps.swap(seat, give, take),
    accept: (id) => roomOps.swapAccept(id),
    decline: (id) => roomOps.swapDecline(id),
    lock: (on) => roomOps.lock(on),
  }, (seat) => opsSeatName(seat));
  opsHud.mount(rolesBoard.opener);
  /* The debrief over the squad's stills (src/ui/debrief.js), when the
   * room ends a match. */
  const debrief = new Debrief(uiRoot, {
    /* Continue ends the run and stands the pilot in the room's screen,
     * where the host may start again; the way a lobby game's round ends
     * (gameLobbyFrame). Closing the card alone left a dead aircraft and
     * no menu. */
    close: () => {
      if (!ui.inRoom()) {
        return;
      }
      if (mode === 'flight' || mode === 'paused') {
        ui.returnTo = 'title';
        ui.show('friends');
        ui.onAction('title');
      } else {
        ui.show('friends');
      }
    },
    again: () => roomOps.start(roomOps.view().mission, { from: 'checkpoint' }),
  }, (seat) => opsSeatName(seat));
  function opsDebrief() {
    const v = roomOps.view();
    const mission = roomOps.mission();
    const match = roomOps.match();
    if (!mission || !match) {
      return;
    }
    rolesBoard.close();
    debrief.show({
      key: match, view: v, mission, seat: roomOps.seat(), host: opsHost() === roomOps.seat(), stills: stills.of(match), next: interiorScreen.next(v.mission),
    });
    interiorScreen.record(match, v);
  }
  /* The room's host seat: the link's, which follows a host change, else
   * the welcome's as the ops client heard it. */
  const opsHost = () => roomLinkState.state().welcome?.host ?? roomOps.hostSeat();
  function opsSeatName(seat) {
    if (seat === roomOps.seat()) {
      return str('ops.roles.you');
    }
    const p = roomPeers.get(seat);
    return p ? roomName(p.name) : str('ops.roles.pilot', { n: seat });
  }
  /* The map's { canopyBlocks, poseOnRoute }; a check may stand one in
   * (window.__ops.useWorld) over a map that is not the mission's. */
  let opsWorldOverride = null;
  const opsWorld = (mission) => opsWorldOverride ?? opsWorldOf(mission.map);
  /* A string key said, or the key itself when this build lacks it (a
   * mission newer than its strings). */
  const opsSay = (key, vars) => {
    try {
      return str(key, vars);
    } catch {
      return key;
    }
  };
  const opsClassWord = (cls) => opsSay(`ops.class.${String(cls).toLowerCase().replace(/[^a-z0-9_.]/g, '_')}`);
  /* The stage's tutorial prompts (mission data `tutorial`): each shown
   * until the screen sees it done, one at a time; the room cannot see a
   * mode switch or a map opened. A prompt's last word names the action. */
  const tutDone = new Set();
  let tutStage = null;
  let tutClimb = Infinity;
  const TUTORIAL = {
    launch: () => !landed,
    climb: () => opsAgl() >= tutClimb,
    eo_thermal: () => thermalMode(sensors.state.mode),
    map: () => opsHud.mapOpen,
  };
  const swapsTold = new Set();
  /* The joiner's consent: being asked now, and the room last asked for. */
  let opsJoinAsking = false;
  let opsJoinAsked = null;
  /* Each campaign that asks a consent: whether it is given, and asking. */
  const OPS_CONSENT = {
    [INTERIOR_CAMPAIGN.id]: { given: () => ui.settings.interiorConsent === true, ask: () => interiorConsented() },
  };
  /* The role key this seat flies now, or null. */
  function opsActiveKey(v) {
    const r = v.roles;
    return r && r.active ? r.active[roomOps.seat()] ?? null : null;
  }
  /* The aircraft of role key `key`, or null. */
  function opsKeyCraft(v, key) {
    const def = key && ((v.roles && v.roles.defs) || []).find((d) => d.id === String(key).split(':')[0]);
    return def && def.platforms && def.platforms[0] ? def.platforms[0] : null;
  }
  /* The aircraft of the role this seat flies now, or null. */
  function opsRoleCraft(v) {
    return opsKeyCraft(v, opsActiveKey(v));
  }

  /*
   * PLATFORM HOLDS (docs/campaign/interior/CONTRACT-HOLDS.md, TECH-NEEDS
   * N15). A pilot holding several roles in a live match keeps one aircraft
   * per role alive: the one flown is the plant, each other is a hold on
   * the room clock (src/share/ops/hold.js), drawn as a model. Changing the
   * active role ([ and ], the pad's shoulders) hands the plant over to
   * the held aircraft where its hold has it, and the one left takes a
   * hold where it was. A role never flown yet in this match is launched
   * where the pilot is, by the hot swap's rules. Outside a live match
   * nothing here runs, and the hot swap is unchanged.
   *
   * opsHolds: role key -> { airframe, hold, yaw, rig }, this page's only.
   * opsFlownKey: the role key the plant is flying now.
   */
  const opsHolds = new Map();
  let opsFlownKey = null;
  let opsHoldBusy = false;
  const holdP = new THREE.Vector3();
  const holdV = new THREE.Vector3();
  const holdDoc = { x: 0, y: 0, z: 0 };
  const holdQ = new THREE.Quaternion();
  const holdE = new THREE.Euler(0, 0, 0, 'YXZ');

  function opsHoldsClear() {
    for (const h of opsHolds.values()) {
      h.rig.group.removeFromParent();
      h.rig.dispose();
    }
    opsHolds.clear();
    opsFlownKey = null;
  }

  /* [ or ]: the next role this seat holds, asked of the room; true when
   * the key was this feature's. */
  function opsHoldCycle(dir) {
    const v = roomOps.on() ? roomOps.view() : null;
    const keys = (v && v.roles && v.roles.held && v.roles.held[roomOps.seat()]) || [];
    if (!roomOps.live() || keys.length < 2) {
      return false;
    }
    const i = keys.indexOf(opsActiveKey(v));
    roomOps.active(keys[(i + dir + keys.length) % keys.length]);
    return true;
  }
  ui.cycleHold = opsHoldCycle;

  /* The room clock in whole ms, or null with no clock (no link yet):
   * a hold is on the room's clock or it is not taken. */
  let opsClockOverride = null;
  function holdRoomMs() {
    const t = opsClockOverride ? opsClockOverride() : roomLinkState.roomNow();
    return Number.isFinite(t) ? Math.floor(t) : null;
  }

  /* Where a hold is now, into holdP and holdV (scene frame), and the yaw
   * it faces. */
  function holdNow(h) {
    const q = holdPose(h.hold, Math.max(h.hold.t0, holdRoomMs() ?? h.hold.t0));
    docPosToThree(q.p[0], q.p[1], q.p[2], holdP);
    docPosToThree(q.v[0], q.v[1], q.v[2], holdV);
    return h.hold.kind === 'orbit' ? Math.atan2(-holdV.x, -holdV.z) : h.yaw;
  }

  /* The other seats' holds, from the room's view: `${seat}:${key}` ->
   * { airframe, hold, yaw, rig }. */
  const peerHolds = new Map();
  function peerHoldsSync(v) {
    const want = new Map();
    const mine = String(roomOps.seat());
    for (const [seat, hs] of Object.entries((roomOps.live() && v && v.holds) || {})) {
      if (seat === mine) {
        continue;
      }
      for (const [key, h] of Object.entries(hs)) {
        want.set(`${seat}:${key}`, { ...h, key });
      }
    }
    for (const [id, h] of peerHolds) {
      const w = want.get(id);
      if (!w || w.airframe !== h.airframe || w.hold.t0 !== h.hold.t0) {
        h.rig.group.removeFromParent();
        h.rig.dispose();
        peerHolds.delete(id);
      }
    }
    for (const [id, w] of want) {
      if (!peerHolds.has(id)) {
        const rig = buildPeerCraft({ airframe: w.airframe, livery: null, parts: null }, (craft) => shell.lookCraft(craft));
        rig.setLabel(roleName(w.key));
        peerHolds.set(id, {
          airframe: w.airframe, hold: w.hold, yaw: 0, rig,
        });
      }
    }
  }

  /* Each held aircraft drawn where its hold has it: level on a hover or
   * parked, banked into the turn on an orbit. */
  function opsHoldsDraw(v) {
    peerHoldsSync(v);
    for (const h of [...opsHolds.values(), ...peerHolds.values()]) {
      const yaw = holdNow(h);
      h.rig.group.position.copy(holdP);
      holdE.set(0, yaw, h.hold.kind === 'orbit' ? HOLD_BANK : 0);
      h.rig.group.quaternion.setFromEuler(holdE);
      if (h.rig.group.parent !== shell.quad.parent) {
        shell.quad.parent.add(h.rig.group);
      }
    }
  }

  async function opsHoldSwitch(v, fromKey, toKey) {
    const toCraft = opsKeyCraft(v, toKey);
    const t = holdRoomMs();
    if (!toCraft || t == null) {
      return;
    }
    opsHoldBusy = true;
    try {
      const st = readState();
      poseFromState(st, holdP);
      simPosToThree(st[4], st[5], st[6], holdV).applyQuaternion(qSpawn);
      const from = airframeById(runAirframe);
      const left = {
        p: Object.values(threePosToDoc(holdP.x, holdP.y, holdP.z, { ...holdDoc })),
        v: Object.values(threePosToDoc(holdV.x, holdV.y, holdV.z, { ...holdDoc })),
        airborne: !onSurface(),
      };
      const leftHold = {
        airframe: from.id, hold: holdOf(left, from, t), yaw: craftHeadingYaw(), rig: null,
      };
      const to = opsHolds.get(toKey);
      let at = null;
      if (to) {
        const yaw = holdNow(to);
        at = {
          pos: holdP.clone(), vel: holdV.clone(), yaw, flying: to.hold.kind !== 'parked',
        };
      }
      const swapped = await hotSwap(toCraft, { refit: toCraft === runAirframe, at });
      if (!swapped) {
        return;
      }
      if (to) {
        to.rig.group.removeFromParent();
        to.rig.dispose();
        opsHolds.delete(toKey);
      }
      /* The room's copy: it makes the same hold from the same pose. The
       * camera ball's ground lock stays on the held aircraft's camera. */
      const lock = ball && ballAirframe === from.id && ball.state.lock ? ball.state.lock.slice() : null;
      roomOps.hold(fromKey, t, left, lock && opsCam ? { aim: lock, tanHalf: opsCam.tanHalf, aspect: opsCam.aspect } : null);
      leftHold.rig = buildPeerCraft({ airframe: from.id, livery: null, parts: null }, (craft) => shell.lookCraft(craft));
      leftHold.rig.setLabel(roleName(fromKey));
      opsHolds.set(fromKey, leftHold);
      opsFlownKey = toKey;
    } finally {
      opsHoldBusy = false;
    }
  }
  /* The start this page owes a room it made for a mission, until its
   * welcome; the match this page has put itself in the air for. */
  let opsPending = null;
  let opsBegunFor = null;
  /* Whether the map draws the room's contacts now, and the mark it was
   * last told. */
  let opsDrawn = false;
  let opsCampMark = null;
  /* Which mission's camps the map shows (mission.camp.world), told once. */
  let opsCampWorld = null;
  /* What the map was last told, for the checks: the hour, the looks. */
  let opsHourTold = null;
  let opsLooksTold = [];
  let ball = null;
  let ballAirframe = null;
  /* Whether the ball is the screen's camera this frame, and was last. */
  let ballOn = false;
  let ballWas = false;
  /* The sensor's settings from before the ball took the screen. */
  let ballSaved = null;
  const ballDoc = { x: 0, y: 0, z: 0 };
  const ballFwd = { x: 0, y: 0, z: 0 };
  const ballHeightAt = (x, y) => view.height(x, -y, Infinity);
  const ballMouse = {
    drag: false, dx: 0, dy: 0, zoom: 1,
  };
  const ballPadWas = { lock: false, capture: false };
  /* The screen's camera for the room this frame: { p, dir, aim, tanHalf,
   * aspect } in the ops frame, or null. */
  let opsCam = null;
  let opsCue = null;
  const stills = createStillStore();
  let opsCapture = null;
  let opsCaptureFor = null;
  let opsMatch = null;
  /* A still to grab from the next drawn frame. */
  let stillWanted = null;
  const stillCanvas = document.createElement('canvas');
  const STILL_W = 640;
  const GRADE_ORDER = ['poor', 'usable', 'clean'];

  function ballOf(id) {
    const spec = ballFor(id);
    if (!spec) {
      return null;
    }
    if (ballAirframe !== id) {
      ball = createBall(spec);
      ballAirframe = id;
    }
    return ball;
  }
  const ballView = () => ui.settings.wingView === 'ball' && Boolean(ballFor(runAirframe));

  function ballPad() {
    const gp = input.firstGamepad();
    if (!gp || gp.mapping !== 'standard' || !gp.buttons) {
      return null;
    }
    const at = (i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value || 0 : 0);
    return {
      pan: Number(at(15)) - Number(at(14)),
      tilt: Number(at(12)) - Number(at(13)),
      zoom: val(7) - val(6),
      capture: at(10),
      lock: at(11),
    };
  }

  function ballInput(b) {
    const k = input.keys;
    const key = (pos, neg) => Number(k.has(pos)) - Number(k.has(neg));
    const out = {
      pan: key('KeyE', 'KeyQ'),
      tilt: key('KeyY', 'KeyH'),
      zoom: key('Equal', 'Minus') + key('PageUp', 'PageDown'),
    };
    /* The ball's touch pad and zoom buttons (src/ui/opshud.js). */
    out.pan += opsHud.touchIn.pan;
    out.tilt += opsHud.touchIn.tilt;
    out.zoom += opsHud.touchIn.zoom;
    const pad = ballPad();
    if (pad) {
      out.pan += pad.pan;
      out.tilt += pad.tilt;
      out.zoom += pad.zoom;
      if (pad.lock && !ballPadWas.lock) {
        ballToggleLock();
      }
      if (pad.capture && !ballPadWas.capture) {
        opsCaptureNow();
      }
      ballPadWas.lock = pad.lock;
      ballPadWas.capture = pad.capture;
    }
    /* The mouse drags the picture: a screen's width of drag is the
     * picture's whole field. */
    const w = Math.max(1, shell.canvas.clientWidth);
    const field = 2 * Math.atan(b.lensTan() / sensors.state.zoom);
    out.panRad = (-ballMouse.dx / w) * field;
    out.tiltRad = (ballMouse.dy / w) * field;
    out.zoomBy = ballMouse.zoom;
    ballMouse.dx = 0;
    ballMouse.dy = 0;
    ballMouse.zoom = 1;
    return out;
  }

  function ballToggleLock() {
    if (!ball || !ballOn) {
      return;
    }
    if (ball.state.lock) {
      ball.unlock();
      notice = { text: str('ops.ball.unlocked'), untilMs: performance.now() + 1400 };
    } else {
      notice = { text: str(ball.lockHere() ? 'ops.ball.locked' : 'ops.ball.no_ground'), untilMs: performance.now() + 1400 };
    }
  }

  {
    const c = shell.renderer.domElement;
    c.addEventListener('pointerdown', (e) => {
      if (ballOn && e.button === 2) {
        ballMouse.drag = true;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) {
        ballMouse.drag = false;
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (ballMouse.drag && ballOn) {
        ballMouse.dx += e.movementX || 0;
        ballMouse.dy += e.movementY || 0;
      }
    });
    c.addEventListener('contextmenu', (e) => {
      if (ballOn) {
        e.preventDefault();
      }
    });
    c.addEventListener('wheel', (e) => {
      if (ballOn && (e.shiftKey || !input.isMousePrimary())) {
        ballMouse.zoom *= 1.15 ** (-Math.sign(e.deltaY || e.deltaX));
        e.preventDefault();
      }
    }, { passive: false });
  }

  /* The ball as the screen's camera, after the craft is placed: pCurr and
   * camFwd are this frame's. */
  function ballFrame(dtS, paused) {
    const b = ballOf(runAirframe);
    threePosToDoc(pCurr.x, pCurr.y, pCurr.z, ballDoc);
    threePosToDoc(camFwd.x, camFwd.y, camFwd.z, ballFwd);
    const p = [ballDoc.x, ballDoc.y, ballDoc.z];
    const heading = Math.atan2(ballFwd.x, ballFwd.y);
    b.step(paused ? 0 : dtS, paused ? {} : ballInput(b), { p, heading }, ballHeightAt);
    if (!ballWas) {
      ballSaved = { mainView: sensors.state.mainView, stab: sensors.state.stab };
      /* The mission's thermal palette, once a match (interior-1.js
       * sensor): the pilot's own choice holds after a period press. */
      const m = roomOps.mission();
      const matchId = roomOps.match();
      if (m && m.sensor && m.sensor.palette && matchId != null && opsPaletteFor !== matchId) {
        opsPaletteFor = matchId;
        sensors.setPalette(m.sensor.palette);
      }
    }
    /* The gimbal is the stabilisation: the picture must be the camera the
     * room is told of, so no electronic turn on top of it. */
    sensors.setMainView('sensor');
    sensors.setStab(false);
    /* The IR inset (BIBLE.md 6): the same camera in the other band. */
    sensors.setPipMode(thermalMode(sensors.state.mode) ? 'eo' : 'ir_wh');
    const cam = threeCameraOf(p, b.state.dir, b.lensTan(), shell.camera.aspect);
    shell.quad.visible = false;
    shell.camera.up.set(0, 1, 0);
    shell.camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    shell.camera.quaternion.set(cam.quaternion[0], cam.quaternion[1], cam.quaternion[2], cam.quaternion[3]);
    if (Math.abs(shell.camera.fov - cam.fov) > 1e-4) {
      shell.camera.fov = cam.fov;
      shell.camera.updateProjectionMatrix();
    }
    ballOn = true;
    opsCam = {
      p, dir: b.state.dir.slice(), aim: b.state.aim.slice(), tanHalf: b.tanHalf(sensors.state.zoom), aspect: shell.camera.aspect,
    };
  }

  /* The sensor back as it was when the ball leaves the screen. */
  function ballLeft() {
    if (ballSaved) {
      sensors.setMainView(ballSaved.mainView);
      sensors.setStab(ballSaved.stab);
      sensors.setPipMode(null);
      ballSaved = null;
    }
  }

  /* Any other view's camera for the room: where its axis meets the
   * ground, its own field. */
  function screenCam() {
    threePosToDoc(pCurr.x, pCurr.y, pCurr.z, ballDoc);
    const p = [ballDoc.x, ballDoc.y, ballDoc.z];
    camLook.set(0, 0, -1).applyQuaternion(shell.camera.quaternion);
    threePosToDoc(camLook.x, camLook.y, camLook.z, ballFwd);
    const dir = [ballFwd.x, ballFwd.y, ballFwd.z];
    const aim = groundHit(p, dir, ballHeightAt);
    const tanHalf = Math.tan((shell.camera.fov * Math.PI) / 360) * shell.camera.aspect;
    return {
      p, dir, aim: aim ?? p.map((c, i) => c + dir[i] * FAR_M), tanHalf, aspect: shell.camera.aspect,
    };
  }
  const camLook = new THREE.Vector3();

  /* An item the HUD may name before it is captured: not one seen from
   * one side only (the angle is the discovery), not contacts the room has
   * not discovered (the quiet HUD's rule). */
  function opsNameable(item, v) {
    if (item.view && !(v.opened || []).includes(item.id)) {
      return false;
    }
    if (item.contact) {
      const members = (v.contacts ?? []).filter((c) => c.id === item.contact || c.group === item.contact);
      return members.length > 0 && members.every((c) => c.cls);
    }
    return true;
  }

  /* Every frame: the room's word on captures; in an ops match's flight,
   * the camera to the room and the capture's hold. */
  function opsFrame(flying) {
    opsCue = null;
    const v = roomOps.view();
    const match = roomOps.match();
    if (match !== opsMatch) {
      opsMatch = match;
      stills.keepOnly(match);
      stillWanted = null;
    }
    for (const e of roomOps.takeEvents()) {
      if (e.type === 'captured' && e.mine) {
        for (const s of stills.all()) {
          if (s.item === e.item && s.t === e.t) {
            s.grade = e.grade;
            s.pending = false;
          }
        }
        opsHud.tell(str('ops.capture.recorded', { item: str(`ops.${v.campaign}.item.${e.item}`), grade: str(`ops.grade.${e.grade}`) }), { grade: e.grade });
      } else if (e.type === 'error' && e.error === 'capture') {
        opsHud.tell(str(`ops.capture.why.${e.why ?? 'item'}`), { warn: true });
      } else if (e.type === 'error' && e.error === 'unwatched') {
        /* Said for a few seconds over the waiting line (opsFilmFrame). */
        opsBriefRefusedUntil = performance.now() + 4000;
      } else if (e.type === 'error' && e.error === 'locked') {
        opsHud.tell(str('ops.roles.refused_locked'), { warn: true });
      } else if (e.type === 'cue') {
        /* The ops room's voices (lines.json's Interior speakers): the
         * room sends each seat only the lines it hears. */
        if (e.radio != null) {
          /* A fixed "from your nose" hour is said off this screen's nose,
           * the same frame as the guide's nudges (opsGuideFrame). */
          threePosToDoc(pCurr.x, pCurr.y, pCurr.z, guideDoc);
          threePosToDoc(camFwd.x, camFwd.y, camFwd.z, guideFwd);
          const bearings = roomOps.mission() && roomOps.mission().bearings;
          warSay([bearingSaid(bearings, e.radio, [guideDoc.x, guideDoc.y], Math.atan2(guideFwd.x, guideFwd.y))], 'story', opsHud);
        }
        /* A classification's card is told with its change, below. A
         * card may be a heading and its line (the script's two line UI). */
        if (e.card && e.card !== 'card.classification_updated') {
          opsHud.cardEvent([e.card].flat().map((k) => opsSay(k)));
        }
        if (e.text) {
          opsHud.stageEntered(opsSay(e.text));
        }
      } else if (e.type === 'stage') {
        if (e.title) {
          opsHud.stageEntered(opsSay(e.title));
        }
      } else if (e.type === 'state' && ['won', 'lost', 'ended'].includes(e.to)) {
        /* Ended by the host too: the squad's captures so far are its
         * record. A win has its outro first (opsFilmFrame), and the
         * debrief when it is over. */
        const m = roomOps.mission();
        /* No outro over another world (a page not on the mission's map):
         * the debrief at once. */
        if (!(e.to === 'won' && opsFilmOf(v.mission, 'outro') && m && opsWorldUp(m.map))) {
          opsDebrief();
        }
      } else if (e.type === 'classified') {
        opsHud.cardEvent([str('card.classification_updated'), str('ops.hud.class_change', { from: opsClassWord(e.from), to: opsClassWord(e.to) })]);
      }
    }
    /* The host's start, once its room's welcome is in. */
    if (opsPending && roomOps.room() === opsPending.code && roomOps.seat() != null && v.state === 'lobby' && opsHost() === roomOps.seat()) {
      roomOps.start(opsPending.mission, { intro: true });
      opsPending = null;
    }
    /*
     * A PILOT WHO JOINED BY CODE OR LINK: a campaign that shows armed
     * conflict asks its consent of every pilot entering a room playing
     * it, as the war's does (roomWarJoinGate; FLOW-AUDIT rule 9 as
     * amended), before they are seated in its match. No sends them out of
     * the room to the title, never half in it. The host who made the room
     * from the card has answered already.
     */
    const ask = v.campaign ? OPS_CONSENT[v.campaign] : null;
    const consentDue = Boolean(ask) && !ask.given();
    if (consentDue && !opsJoinAsking && opsJoinAsked !== roomOps.room()) {
      const room = roomOps.room();
      opsJoinAsking = true;
      opsJoinAsked = room;
      ask.ask().then((ok) => {
        if (!ok && roomOps.room() === room) {
          roomLeave();
          ui.act('title');
        }
      }).finally(() => {
        opsJoinAsking = false;
      });
    }
    /* The aircraft of the role this seat flies (dealt at the start, or
     * taken or swapped since): seated before it is flown, and again when
     * the role changes to another aircraft. */
    const craft = consentDue ? null : opsRoleCraft(v);
    const activeKey = consentDue ? null : opsActiveKey(v);
    if (!roomOps.live() && opsHolds.size) {
      opsHoldsClear();
    }
    if (activeKey && opsFlownKey && activeKey !== opsFlownKey && opsBegunFor === match && swapLive()) {
      if (!opsHoldBusy) {
        opsHoldSwitch(v, opsFlownKey, activeKey).catch((e) => {
          console.error('hold switch failed', e);
          throw e;
        });
      }
    } else if (craft && ui.settings.airframe !== craft) {
      seatAirframe(ui.settings, craft);
      ui.persistSettings();
      if (opsBegunFor === match && mode === 'flight') {
        opsBegunFor = null;
      }
    }
    /* A match begun: into the air, as a war's begins (warBegin). */
    if (!consentDue && match && match !== opsBegunFor && ['briefing', 'countdown', 'live'].includes(v.state)) {
      opsBegunFor = match;
      opsHoldsClear();
      opsFlownKey = activeKey;
      const w = roomLinkState.state().welcome;
      if (mode === 'flight' && w && roomTagWorldReady(w.map)) {
        ui.onAction('restart');
      } else {
        roomCall('game', { restart: true });
      }
    }
    opsFilmFrame(v, match, consentDue);
    opsHoldsDraw(v);
    opsDraw(roomOps.on() ? v : null, roomOps.on() ? roomOps.mission() : null, roomLinkState.roomNow());
    for (const x of (v.roles && v.roles.swaps) || []) {
      if (x.to === roomOps.seat() && !swapsTold.has(x.id)) {
        swapsTold.add(x.id);
        opsHud.cardEvent([str('ops.roles.swap_asked', { name: opsSeatName(x.from) })]);
      }
    }
    if (!roomOps.on() || !flying) {
      return;
    }
    if (!ballOn) {
      opsCam = screenCam();
    }
    const t = roomLinkState.roomNow();
    roomOps.cam(t, opsCam.aim, opsCam.tanHalf, opsCam.aspect);
    const mission = roomOps.mission();
    /* The map's world, built in the background on first use: nothing is
     * framed or captured until it is (src/share/opsworlds.js). */
    const world = mission ? opsWorld(mission) : null;
    if (!roomOps.live() || !mission || !world) {
      return;
    }
    if (opsCaptureFor !== world) {
      opsCaptureFor = world;
      /* The mission's heights over the ground made absolute on it, as the
       * room does (missions.js grounded). */
      opsCapture = createCapture(grounded(mission, world), world);
    }
    opsCapture.sample(v, t, opsCam.p, opsCam);
    let best = null;
    for (const f of opsCapture.framings(v, t, opsCam.p, opsCam)) {
      if (f.grade && !f.blocked && opsNameable(f.item, v) && GRADE_ORDER.indexOf(f.grade) > GRADE_ORDER.indexOf(best)) {
        best = f.grade;
      }
    }
    opsCue = best;
  }

  /* A still's room ms: the last pose this screen sent. The room judges a
   * capture at a pose it holds on both sides of the still's ms, and a
   * pose and a capture go down the one socket in order, so the newest
   * pose sent is the newest ms it can judge; the frame is under one
   * pose interval later. Whole ms, down: the wire carries a pose's ms
   * whole, and a still a fraction past its pose is past every pose. */
  function opsStillT() {
    return Math.floor(roomSentPose && Number.isFinite(roomSentPose.t) ? roomSentPose.t : roomLinkState.roomNow());
  }

  /* The capture button. */
  function opsCaptureNow() {
    if (!roomOps.live() || !opsCapture || !opsCam) {
      opsHud.tell(str('ops.capture.why.off'), { warn: true });
      return;
    }
    const v = roomOps.view();
    const t = opsStillT();
    const r = opsCapture.still(v, t, opsCam.p, opsCam, {
      mode: sensors.state.mode, night: sensors.state.timeOfDay === 'night', digital: ballOn ? sensors.state.zoom : 1,
    });
    if (!r.msg) {
      opsHud.tell(str(`ops.capture.why.${r.why}`), { warn: true });
      return;
    }
    roomOps.capture(r.msg);
    stillWanted = {
      match: roomOps.match(), item: r.item, grade: r.grade, t: r.msg.t, seat: roomOps.seat(), framing: r.framing, pending: true, image: null,
    };
    opsHud.tell(str('ops.capture.sent', { item: str(`ops.${v.campaign}.item.${r.item}`), grade: str(`ops.grade.${r.grade}`) }), { grade: r.grade });
  }

  /* After a drawn frame: the still, from the picture just drawn (the
   * drawing buffer still holds it inside this task), downscaled, kept on
   * this device only. */
  function opsGrabStill() {
    if (!stillWanted) {
      return;
    }
    const rec = stillWanted;
    stillWanted = null;
    const src = shell.canvas;
    stillCanvas.width = STILL_W;
    stillCanvas.height = Math.max(1, Math.round((STILL_W * src.height) / Math.max(1, src.width)));
    stillCanvas.getContext('2d').drawImage(src, 0, 0, stillCanvas.width, stillCanvas.height);
    stills.add(rec);
    stillCanvas.toBlob((blob) => {
      rec.image = blob;
    }, 'image/jpeg', 0.85);
  }

  /*
   * The room's contacts drawn by the map (CONTRACT-P0.md 4.3: every screen
   * draws every contact from its route, discovered or not; people are
   * seen from the air before the room knows them) by their `look` and
   * `size`, the sun on the room's `clock` and the camp's mark on the
   * shelter the room judges (`camp.mark`), each as the view says (#440),
   * else from the mission's own data for a room from before it. A contact
   * with no look is not drawn; no clock keeps the map's hour.
   */
  function opsDraw(v, mission, now) {
    if (!view || typeof view.setContacts !== 'function') {
      return;
    }
    if (!v || !mission || !Number.isFinite(now)) {
      if (opsDrawn) {
        view.setContacts([], 0);
        opsDrawn = false;
        opsCampMark = null;
      }
      return;
    }
    if (opsCampWorld !== mission.id && typeof view.setCamp === 'function') {
      /* A mission's camps as its story has them (Mission 2: Claro Viejo
       * stripped, Claro Nuevo standing); Mission 1's are the default. */
      opsCampWorld = mission.id;
      view.setCamp({
        nuevo: false, mast: 0, parked: Infinity, cold: false, ...(mission.camp && mission.camp.world),
      });
    }
    const defs = new Map((mission.contacts || []).map((c) => [c.id, c]));
    const list = [];
    for (const c of v.contacts || []) {
      const look = 'look' in c ? c.look : ((defs.get(c.id) || {}).look ?? (c.kind === 'person' ? 'person' : null));
      if (look) {
        list.push({
          id: c.id, kind: look, size: c.size ?? CONTACT_SIZE[c.kind] ?? 2, route: c.route, ms: now - c.t0,
        });
      }
    }
    view.setContacts(list, now);
    opsDrawn = true;
    opsLooksTold = list.map((c) => `${c.id}:${c.kind}`);
    const clock = v.clock ?? mission.clock;
    if (clock && v.goAt != null && typeof view.setLocalTime === 'function') {
      opsHourTold = localHour(clock, v.goAt, now);
      view.setLocalTime(opsHourTold);
    }
    const markOfView = v.camp ? v.camp.mark : (mission.camp && mission.camp.mark != null ? opsResolve(mission.camp.mark, v.dials || {}) : null);
    if (markOfView != null && typeof view.setCamp === 'function') {
      const mark = markOfView;
      if (mark !== opsCampMark) {
        opsCampMark = mark;
        view.setCamp({ mark });
      }
    }
  }

  /*
   * THE INTERIOR'S FILMS (docs/campaign/interior/FILMS.md, played by
   * src/render/interiorfilms.js in the war's film slot, warIntro, so the
   * frame loop poses the camera, hides the screens and draws them as it
   * does the war's):
   *   prologue  on this pilot's own screen, the first time they open the
   *             campaign's card: its world stood up, then the page
   *   intro     the room's briefing, on the room's clock from briefAt,
   *             held (the room holds the briefing for its length); a late
   *             joiner starts where the room is; stopped when it ends
   *   outro     on a win, on the room's clock from endAt, with the
   *             squad's stills this device holds; the debrief after it
   * Each only over the mission's own world, standing.
   */
  const opsFilmStore = createCampaignStore(ui.settings, () => ui.persistSettings());
  let opsIntroShown = null;
  /* The match whose mission palette the thermal core has been set to. */
  let opsPaletteFor = null;
  let opsOutroShown = null;
  /* The spotted end scene last played: match, spotter and moment. */
  let opsSpotShown = null;
  /* The prologue owed before the campaign's page: its film id, or null. */
  let opsPrologueDue = null;
  /* Own stills as pictures the film can draw, by item. */
  const opsStillPics = new Map();
  /* The items the outro asked for, and whether it had a picture: checks. */
  const opsFilmAsked = new Map();
  const opsFilmOf = (missionId, moment) => (missionId ? (opsFilmsFor(missionId) || {})[moment] ?? null : null);
  const opsWorldUp = (map) => Boolean(view) && view.id === map && mapReady && !worldSync && !swapInFlight && worldMatchesSettings();

  function opsFilmPlay(id, opts = {}) {
    warIntroStop();
    warIntroFor = `ops:${id}`;
    warIntroFov = shell.camera.fov;
    const film = opts.film ?? OPS_FILMS[id];
    const h = playInteriorFilm(shell.quad.parent || view.scene, shell.camera, id, {
      map: view.id,
      canvas: shell.canvas,
      audio,
      ground: (x, z) => view.height(x, z, Infinity),
      seen: seenFilm(opsFilmStore.load(), id, film.version),
      /* The story flags a film's callback lines read (film.js `or`). */
      flags: opsFilmStore.load().flags,
      onSeen: () => {
        opsFilmStore.save(markSeen(opsFilmStore.load(), id, film.version));
        opsSeenTell();
      },
      ...opts,
    });
    warIntro = h;
    h.done.then(() => {
      if (warIntro === h) {
        warIntroStop();
      }
    });
    return h;
  }
  const opsFilmOn = (id) => warIntro !== null && warIntroFor === `ops:${id}`;
  /* The room told which films this pilot has watched to their end (the
   * films in the synced campaign section, the war's store), once per
   * welcome and on every change: the host's skip waits on everybody's. */
  let opsSeenTold = null;
  /* Until when the room's refusal of the host's skip is said. */
  let opsBriefRefusedUntil = 0;
  function opsSeenTell() {
    const films = opsFilmStore.load().films;
    const key = roomOps.room() != null && roomOps.seat() != null ? `${roomOps.room()}:${roomOps.seat()}:${JSON.stringify(films)}` : null;
    if (key && key !== opsSeenTold) {
      opsSeenTold = key;
      roomOps.seen(films);
    }
  }
  /* Whether every pilot here has seen the briefing's film at its version
   * (the view's `seen`), and how many have not. */
  function opsBriefingSeen(v) {
    const here = Object.keys((v.roles && v.roles.held) || {}).map(Number);
    const seen = new Set(v.seen || []);
    const missing = here.filter((s) => !seen.has(s)).length;
    return { all: here.length > 0 && missing === 0, missing };
  }

  /* The card's press: the prologue first when this pilot has not seen
   * it, over the campaign's world, then the page. */
  function opsCampaignOpen() {
    const id = opsFilmOf(INTERIOR[0].id, 'prologue');
    const film = id ? OPS_FILMS[id] : null;
    if (!film || seenFilm(opsFilmStore.load(), id, film.version)) {
      interiorScreen.open();
      return;
    }
    opsPrologueDue = id;
    const map = roomOps.missionOf(INTERIOR[0].id)?.map;
    if (map && ui.settings.map !== map) {
      ui.seatMap(map, { stay: true });
    }
    /* Stand the campaign's world up now, in place of the title's own (as
     * a war's room does): the film's shots are that map's metres. */
    titleWorld = null;
    buildWorld = null;
    paintBest();
    syncWorld();
  }

  function opsFilmFrame(v, match, consentDue) {
    opsSeenTell();
    /* The host's line over the briefing: holding ends it for everybody
     * once everyone has seen this cut, else who it waits for. */
    const briefingNow = v.state === 'briefing' && v.film && opsHost() === roomOps.seat();
    if (briefingNow) {
      const b = opsBriefingSeen(v);
      opsHud.briefingNote(!b.all && performance.now() < opsBriefRefusedUntil
        ? { text: str('ops.brief.refused'), wait: true }
        : b.all
        ? { text: str('ops.brief.skip_all'), wait: false }
        : { text: plural('count.ops_brief_wait', b.missing), wait: true });
    } else {
      opsHud.briefingNote(null);
    }
    /* The prologue, once its world stands. */
    if (opsPrologueDue && !warIntro) {
      const map = roomOps.missionOf(INTERIOR[0].id)?.map;
      if (map && opsWorldUp(map)) {
        const h = opsFilmPlay(opsPrologueDue);
        opsPrologueDue = null;
        h.done.then(() => interiorScreen.open());
      }
    }
    const mission = roomOps.mission();
    const map = mission ? mission.map : null;
    /* The briefing's film. */
    const intro = opsFilmOf(v.mission, 'intro');
    const briefing = v.state === 'briefing' && v.briefAt != null && mode !== 'replay';
    if (briefing && intro && !consentDue && opsIntroShown !== match && map && opsWorldUp(map)) {
      opsIntroShown = match;
      const briefAt = v.briefAt;
      opsFilmPlay(intro, {
        clock: () => roomLinkState.roomNow() - briefAt,
        hold: true,
        /* A host's hold ends the briefing for everybody when everybody
         * has seen this cut (the room refuses it otherwise); anyone
         * else's, or a host's while someone has not, waits on the orbit. */
        onSkip: () => {
          const now = roomOps.view();
          if (opsHost() === roomOps.seat() && now.state === 'briefing' && opsBriefingSeen(now).all) {
            roomOps.skipIntro();
          }
        },
        title: { key: mission.title, n: INTERIOR.findIndex((m) => m.id === v.mission) + 1 },
      });
    } else if (intro && opsFilmOn(intro) && !briefing) {
      warIntroStop();
    }
    /* Spotted (CONTRACT-SPOTTED.md): the cut to the people scattering,
     * on the room's clock from the moment they saw you, then the fail. */
    const spot = v.state === 'live' && mission && mode !== 'replay' && map && opsWorldUp(map)
      ? (mission.spotters ?? []).find((sp) => v.spot?.[sp.id]?.at.spotted != null) : null;
    const spotKey = spot ? `${match}:${spot.id}:${v.spot[spot.id].at.spotted}` : null;
    if (spot && opsSpotShown !== spotKey) {
      opsSpotShown = spotKey;
      const t0 = v.spot[spot.id].at.spotted;
      const world = opsWorld(mission);
      const ps = (v.contacts || []).filter((c) => (c.id === spot.group || c.group === spot.group) && c.route)
        .map((c) => world.poseOnRoute(c.route, t0 - c.t0)).filter((p) => p && p.action !== 'gone');
      if (ps.length) {
        /* Ops frame (x east, y north) to the world's (x, -z). */
        const at = [ps.reduce((a, p) => a + p.x, 0) / ps.length, -ps.reduce((a, p) => a + p.y, 0) / ps.length];
        const cam = shell.camera.position;
        const from = Math.atan2(cam.x - at[0], cam.z - at[1]);
        opsFilmPlay('spotted', {
          film: spotFilm(map, at, spot.scene, from),
          clock: () => roomLinkState.roomNow() - t0,
          seen: true,
          onSeen: () => {},
        });
      }
    }
    /* The outro on a win, then the debrief. */
    const outro = opsFilmOf(v.mission, 'outro');
    if (v.state === 'won' && outro && opsOutroShown !== match && v.endAt != null && map && opsWorldUp(map)) {
      opsOutroShown = match;
      const endAt = v.endAt;
      /* This device's own stills as pictures first (a second at most):
       * a squadmate's picture is on their device, so its frame is the
       * reconstruction here. */
      opsStillPics.clear();
      opsFilmAsked.clear();
      const jobs = stills.of(match).filter((x) => x.image).map((x) => createImageBitmap(x.image)
        .then((bmp) => opsStillPics.set(x.item, { image: bmp, seat: x.seat }), () => {}));
      Promise.race([Promise.all(jobs), new Promise((r) => { setTimeout(r, 1000); })]).then(() => {
        if (roomOps.match() !== match) {
          return;
        }
        const h = opsFilmPlay(outro, {
          clock: () => roomLinkState.roomNow() - endAt,
          capture: (item) => {
            const pic = opsStillPics.get(item) ?? null;
            opsFilmAsked.set(item, Boolean(pic));
            return pic;
          },
        });
        h.done.then(() => opsDebrief());
      });
    }
  }

  /* The craft's height over the ground under it, m. */
  function opsAgl() {
    return pCurr.y - view.height(pCurr.x, pCurr.z, Infinity);
  }

  function opsTutorial(v, mission) {
    if (!v.stage || v.state !== 'live') {
      return null;
    }
    const st = (mission.stages || []).find((x) => x.id === v.stage.id);
    const list = (st && st.tutorial) || [];
    const at = `${v.id}:${v.stage.id}:${v.stage.at}`;
    if (tutStage !== at) {
      tutStage = at;
      tutDone.clear();
      const up = ((st && st.exits) || []).map((x) => x.when && x.when.above).find((m) => Number.isFinite(m));
      tutClimb = Number.isFinite(up) ? up : Infinity;
    }
    for (const key of list) {
      const what = TUTORIAL[String(key).split('.').pop()];
      /* A prompt this screen cannot see done is not taught. */
      if (!tutDone.has(key) && (!what || what())) {
        tutDone.add(key);
      }
    }
    return list.find((k) => !tutDone.has(k)) ?? null;
  }

  /* An ops frame point to the HUD's CSS px through the screen's camera
   * (and the sensor's digital crop while the ball is the picture), or
   * null behind it or far off screen. */
  const projV = new THREE.Vector3();
  const projC = new THREE.Vector3();
  function opsProject(p) {
    docPosToThree(p[0], p[1], p[2], projV);
    projC.copy(projV).applyMatrix4(shell.camera.matrixWorldInverse);
    if (projC.z > -0.5) {
      return null;
    }
    projV.project(shell.camera);
    const k = ballOn ? sensors.state.zoom : 1;
    const x = projV.x * k;
    const y = projV.y * k;
    if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) {
      return null;
    }
    const cw = shell.canvas.clientWidth || window.innerWidth;
    const ch = shell.canvas.clientHeight || window.innerHeight;
    return { x: ((x + 1) / 2) * cw, y: ((1 - y) / 2) * ch };
  }

  /* The HUD's aircraft strip: each role this seat holds, when it holds
   * more than one in a live match (PLATFORM HOLDS). */
  function opsFleet(v) {
    const keys = (v.roles && v.roles.held && v.roles.held[roomOps.seat()]) || [];
    if (keys.length < 2 || !roomOps.live()) {
      return null;
    }
    return keys.map((key) => {
      const h = opsHolds.get(key);
      const id = opsKeyCraft(v, key);
      let state = 'ready';
      let agl = null;
      if (key === opsFlownKey) {
        state = 'flown';
        agl = opsAgl();
      } else if (h) {
        holdNow(h);
        state = h.hold.kind;
        agl = holdP.y - view.height(holdP.x, holdP.z, Infinity);
      }
      return {
        key, role: roleName(key), craft: id ? airframeById(id).name : '', state, agl,
      };
    });
  }
  opsHud.onFleet = (key) => roomOps.active(key);

  /* What the quiet HUD draws this frame. */
  function opsHudSrc() {
    const raw = roomOps.view();
    const mission = raw.state !== 'lobby' ? roomOps.mission() : null;
    const v = mission ? raw : null;
    const world = mission ? opsWorld(mission) : null;
    const now = roomLinkState.roomNow();
    threePosToDoc(pCurr.x, pCurr.y, pCurr.z, ballDoc);
    threePosToDoc(camFwd.x, camFwd.y, camFwd.z, ballFwd);
    return {
      ball: ballOn ? ball.state : null,
      digital: sensors.state.zoom,
      mode: sensors.state.mode,
      cue: opsCue,
      view: v,
      seat: roomOps.seat(),
      mission,
      now,
      project: opsProject,
      ground: ballHeightAt,
      /* The view's records carry no size: the kind's, as the room's. */
      poseOf: (c) => (world ? centreOf({ ...c, size: c.size ?? CONTACT_SIZE[c.kind] ?? 2 }, world, now) : null),
      craft: {
        p: [ballDoc.x, ballDoc.y, ballDoc.z], heading: Math.atan2(ballFwd.x, ballFwd.y), speed: Math.hypot(stateCurr[4], stateCurr[5], stateCurr[6]), agl: opsAgl(),
      },
      aim: opsCam ? opsCam.aim : null,
      locked: Boolean(ballOn && ball.state.lock),
      inset: ballOn ? sensors.pip : null,
      touch: Boolean(touch),
      insetMode: sensors.state.pipMode,
      tutorial: v ? opsTutorial(v, mission) : null,
      fleet: v ? opsFleet(v) : null,
      /* The guide's line and marks, under the Mission guidance setting. */
      guide: v && ui.settings.missionGuidance && opsGuide.focus ? opsGuide : null,
      edgeDir: opsEdgeDir,
    };
  }

  /* The first flight start's card stays this long unless skipped, ms. */
  const FIRST_MS = 16000;
  /* A key code as its cap says it. */
  const KEY_WORD = (code) => ({
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  })[code] ?? code.replace(/^Key/, '');
  /*
   * The first flight's card from this pilot's own controls: the throttle
   * key of their stick mode on a keyboard, the pad's buttons on a
   * standard gamepad, the touch controls on a touch screen. A radio flies
   * the aircraft and the keyboard still works the ball (ballInput).
   */
  function firstFlightCard() {
    const gp = input.firstGamepad();
    const src = input.stats().source;
    const radio = src === str('input.a_radio') || src === str('input.a_radio_whose_stick_order_is');
    const kind = touch ? 'touch' : radio ? 'radio' : gp && gp.mapping === 'standard' ? 'pad' : 'keys';
    const pick = (keys, pad, tap) => (kind === 'pad' ? pad : kind === 'touch' ? tap : keys);
    const launch = kind === 'keys' ? str('ops.first.launch_keys', { up: KEY_WORD(throttleKeys(ui.settings.stickMode).up) }) : str('ops.first.launch_stick');
    const rows = [
      [str('ops.first.launch'), launch],
      ...(kind === 'touch' ? [] : [[str('ops.first.view'), 'C']]),
      [str('ops.first.pan'), pick('Q E · Y H', str('ops.first.pad_pan'), str('ops.first.touch_pan'))],
      [str('ops.first.zoom'), pick(str('ops.first.keys_zoom'), str('ops.first.pad_zoom'), str('ops.first.touch_zoom'))],
      [str('ops.first.lock'), pick('U', str('ops.first.pad_lock'), str('ops.first.touch_lock'))],
      [str('ops.first.capture'), pick(str('ops.first.space'), str('ops.first.pad_capture'), str('ops.first.touch_capture'))],
      ...(kind === 'touch' ? [] : [[str('ops.first.map'), 'M']]),
    ];
    return {
      title: str('ops.first.title'), rows, look: str('ops.first.look'), skip: str('ops.first.skip'), kind,
    };
  }

  /*
   * THE GUIDE (src/share/ops/guide.js): this screen's objective, where it
   * is, and the ops room's voice for it, per pilot and local; nothing new
   * crosses the wire. Its guide (the mission's role data, Ibarra for the
   * Interior's ISR and TRACKER) says each objective's task once when it
   * becomes this screen's, and nudges with a clock bearing and a distance
   * when nothing has moved for a while or the pilot is far from it. A
   * guide line waits for a quiet radio (a story line outranks it,
   * MISSIONS.md 1.8) and is never started over the pause menu or a film.
   * The marks and the objective line are the Mission guidance setting's;
   * the voice is not.
   */
  const GUIDE_EVERY_MS = 250;
  const opsNudger = createNudger();
  const opsGuide = {
    at: 0, focus: null, target: null, line: '', briefed: null, queue: [], said: [], first: null,
  };
  /* The first flight start: once per pilot per campaign, kept in the
   * synced progress (progress.seen) so a second computer does not show it
   * again. */
  const FIRST_KEY = (campaign) => `guide:first:${campaign}`;
  const firstSeen = (campaign) => Boolean(ui.settings.progress && ui.settings.progress.seen && ui.settings.progress.seen[FIRST_KEY(campaign)]);
  function firstDone(campaign) {
    if (!firstSeen(campaign)) {
      ui.settings.progress.seen[FIRST_KEY(campaign)] = true;
      ui.persistSettings();
    }
    opsHud.firstFlight(null);
    opsGuide.first = null;
  }
  const radioQuiet = () => !audio.warRadio || (!audio.warRadio.current && !audio.warRadio.queue.length);

  function opsGuideFrame(v, mission, flying, nowWall) {
    if (!roomOps.live() || !mission || !flying) {
      opsGuide.focus = null;
      opsGuide.target = null;
      opsGuide.line = '';
      return;
    }
    const held = heldRolesOf(v, roomOps.seat());
    const active = v.roles && v.roles.active ? String(v.roles.active[roomOps.seat()] ?? '').split(':')[0] : '';
    const quietNow = ui.screen === 'paused' || Boolean(warIntro);
    if (nowWall >= opsGuide.at) {
      opsGuide.at = nowWall + GUIDE_EVERY_MS;
      threePosToDoc(pCurr.x, pCurr.y, pCurr.z, guideDoc);
      threePosToDoc(camFwd.x, camFwd.y, camFwd.z, guideFwd);
      const here = [guideDoc.x, guideDoc.y, guideDoc.z];
      here.agl = opsAgl();
      const heading = Math.atan2(guideFwd.x, guideFwd.y);
      const world = opsWorld(mission);
      const now = roomLinkState.roomNow();
      const poseOf = (c) => (world ? centreOf({ ...c, size: c.size ?? CONTACT_SIZE[c.kind] ?? 2 }, world, now) : null);
      const focus = focusOf(mission, v, held.length ? held : [active]);
      const target = targetOf(mission, v, focus, here, poseOf);
      opsGuide.focus = focus;
      opsGuide.target = target;
      opsGuide.line = goalLine(focus, target, here, opsSay);
      /* Progress: a count moved, a card done, a contact told or seen, a
       * search area drawn or cleared, the stage moved on; or the pilot
       * closing on the objective. */
      const dist = target && target.at ? Math.hypot(target.at[0] - here[0], target.at[1] - here[1]) : null;
      opsNudger.progress([
        v.stage && v.stage.id, focus && focus.card.id, focus && JSON.stringify(focus.card.progress ?? null), (v.captures || []).length,
        (v.contacts || []).map((c) => `${c.cls ?? ''}${c.state}`).join(), (v.search || []).map((s) => s.id).join(),
        target && target.kind === 'climb' ? Math.floor(here.agl / 50) : '',
      ].join('|'), nowWall, dist);
      /* The first flight start, before anything else is said. */
      if (mission.campaign && !firstSeen(mission.campaign) && !opsGuide.first) {
        opsGuide.first = { campaign: mission.campaign, until: nowWall + FIRST_MS };
        opsHud.firstFlight(firstFlightCard());
        opsGuide.queue.push(['int-g-first-1', 'int-g-first-2']);
      }
      if (opsGuide.first && nowWall >= opsGuide.first.until) {
        firstDone(opsGuide.first.campaign);
      }
      const key = focus ? `${v.id}:${v.stage.id}:${focus.card.id}:${active}` : null;
      if (key && key !== opsGuide.briefed) {
        opsGuide.briefed = key;
        const brief = briefOf(focus, active);
        /* A brief or nudge still waiting is about an objective that is
         * no longer this pilot's: only the first flight's lines wait on. */
        opsGuide.queue = opsGuide.queue.filter((item) => item[0] === 'int-g-first-1');
        if (brief) {
          opsGuide.queue.push([brief]);
        }
      }
      if (!quietNow && !opsGuide.queue.length && radioQuiet() && opsNudger.due(nowWall)) {
        const said = nudgeOf(target, here, heading, briefOf(focus, active));
        if (said) {
          opsGuide.queue.push(said);
          opsNudger.nudged(nowWall);
        }
      }
    }
    if (!quietNow && opsGuide.queue.length && radioQuiet()) {
      const item = opsGuide.queue.shift();
      opsGuide.said.push(item.join('+'));
      opsNudger.spoke(nowWall);
      warSay([item], 'guide', opsHud);
    }
  }
  const guideDoc = { x: 0, y: 0, z: 0 };
  const guideFwd = { x: 0, y: 0, z: 0 };
  opsHud.onFirstSkip = () => {
    if (opsGuide.first) {
      firstDone(opsGuide.first.campaign);
    }
  };

  /* Which way an ops frame point lies from the screen's middle, as a unit
   * vector in CSS px (y down), in front of the camera or behind it: the
   * guide's edge chevron. */
  function opsEdgeDir(p) {
    docPosToThree(p[0], p[1], p[2], projV);
    projC.copy(projV).applyMatrix4(shell.camera.matrixWorldInverse);
    let x;
    let y;
    if (projC.z < -0.5) {
      projV.project(shell.camera);
      const cw = shell.canvas.clientWidth || window.innerWidth;
      const ch = shell.canvas.clientHeight || window.innerHeight;
      x = projV.x * cw;
      y = -projV.y * ch;
    } else {
      /* Behind: the side it is on, and down when it is straight behind. */
      x = projC.x;
      y = -projC.y;
      if (Math.hypot(x, y) < 1e-3) {
        y = 1;
      }
    }
    const n = Math.hypot(x, y);
    return n > 0 ? { x: x / n, y: y / n } : null;
  }

  const lockV = new THREE.Vector3();
  window.__ops = {
    view: () => roomOps.view(),
    seat: () => roomOps.seat(),
    ball: () => (ball ? {
      ...ball.state, dir: ball.state.dir.slice(), aim: ball.state.aim.slice(), lock: ball.state.lock && ball.state.lock.slice(), on: ballOn,
    } : null),
    cam: () => (opsCam ? JSON.parse(JSON.stringify(opsCam)) : null),
    /* The lock point through the screen's own camera, NDC: the browser
     * half of camera:lock. */
    lockNdc: () => {
      if (!ball || !ball.state.lock) {
        return null;
      }
      const l = ball.state.lock;
      docPosToThree(l[0], l[1], l[2], lockV).project(shell.camera);
      return { x: lockV.x, y: lockV.y };
    },
    toggleLock: () => ballToggleLock(),
    /* Checks only: the campaign card's press (the prologue first). */
    openCampaign: () => opsCampaignOpen(),
    /* Checks only: the host's skip sent as it is, and a start. */
    skipIntro: () => roomOps.skipIntro(),
    start: (mission) => roomOps.start(mission, { intro: true }),
    filmAsked: () => Object.fromEntries(opsFilmAsked),
    /* The aircraft this page flies now. */
    flown: () => runAirframe,
    /* The forward feed's snow on this screen now (src/share/ops/feed.js). */
    feed: () => opsFeedSnow(),
    /* The platform holds: the role flown, and each held aircraft, where
     * its hold has it now and where its model is drawn (scene frame). */
    holds: () => ({
      flown: opsFlownKey,
      held: [...opsHolds].map(([key, h]) => {
        holdNow(h);
        return {
          key, airframe: h.airframe, kind: h.hold.kind, r: h.hold.r ?? null, c: h.hold.c ? h.hold.c.slice() : null, p: holdP.toArray(), drawn: h.rig.group.position.toArray(), shown: h.rig.group.parent != null,
        };
      }),
      peers: [...peerHolds].map(([id, h]) => {
        holdNow(h);
        return {
          id, airframe: h.airframe, kind: h.hold.kind, p: holdP.toArray(), drawn: h.rig.group.position.toArray(), shown: h.rig.group.parent != null,
        };
      }),
    }),
    /* What the map was last told of the room: mark, hour, contacts. */
    drawn: () => ({ mark: opsCampMark, hour: opsHourTold, looks: opsLooksTold.slice() }),
    /* Checks only: the host's end of the match. */
    end: () => roomOps.end(),
    /* Checks only: lock the ball on a point (ops frame). */
    lockOn: (p) => {
      if (ball) {
        ball.lockOn(p);
      }
      return Boolean(ball);
    },
    capture: () => opsCaptureNow(),
    /* Checks only: room messages and a world stood in locally, so the
     * HUD can be shown a view over a map that is not the mission's. */
    welcome: (w) => roomOps.onWelcome(w),
    inject: (m) => roomOps.onMessage(m),
    useWorld: (w) => { opsWorldOverride = w; opsCaptureFor = null; },
    /* Checks only: a room clock (page ms to room ms) with no room. */
    useClock: (f) => { opsClockOverride = f; },
    sent: () => opsSent.slice(),
    /* Checks only: a capture of `item` proposed now, whatever is framed,
     * for the room to judge on this page's real pose and camera. */
    proposeCapture: (item) => roomOps.capture({
      type: 'ops', op: 'capture', item, t: opsStillT(), grade: 'poor', framing: { size: 0.02, off: 0, blur: 0 },
    }),
    project: (p) => opsProject(p),
    /* What the guide works on and has said, for the checks. */
    guide: () => ({
      line: opsGuide.line,
      target: opsGuide.target ? JSON.parse(JSON.stringify(opsGuide.target)) : null,
      card: opsGuide.focus ? opsGuide.focus.card.id : null,
      said: opsGuide.said.slice(),
      queue: opsGuide.queue.map((q) => q.join('+')),
      first: opsGuide.first ? { ...opsGuide.first } : null,
      firstSeen: (c) => firstSeen(c),
      nudger: opsNudger.state(),
    }),
    edgeDir: (p) => opsEdgeDir(p),
    /* The ground under a picture position (NDC), ops frame, or null. */
    groundAtNdc: (x, y) => {
      const k = ballOn ? sensors.state.zoom : 1;
      projV.set(x / k, y / k, 0.5).unproject(shell.camera);
      threePosToDoc(shell.camera.position.x, shell.camera.position.y, shell.camera.position.z, ballDoc);
      const p = [ballDoc.x, ballDoc.y, ballDoc.z];
      threePosToDoc(projV.x, projV.y, projV.z, ballFwd);
      const d = [ballFwd.x - p[0], ballFwd.y - p[1], ballFwd.z - p[2]];
      const n = Math.hypot(d[0], d[1], d[2]);
      return groundHit(p, d.map((c) => c / n), ballHeightAt);
    },
    roles: () => rolesBoard.toggle(),
    /* Checks only: a still of this seat's, as a capture would keep it. */
    addStill: (item, grade, t) => new Promise((done) => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const g = c.getContext('2d');
      g.fillStyle = '#3d5a2a';
      g.fillRect(0, 0, 320, 180);
      g.fillStyle = '#c9b27a';
      g.fillRect(140, 70, 40, 40);
      c.toBlob((image) => {
        done(stills.add({
          match: roomOps.match(), item, grade, t, seat: roomOps.seat(), framing: null, pending: false, image,
        }) && true);
      }, 'image/jpeg', 0.85);
    }),
    stills: () => stills.all().map((s) => ({
      match: s.match, item: s.item, grade: s.grade, t: s.t, pending: s.pending, image: Boolean(s.image),
    })),
  };

  /* Where the other pilots in a room are, when the picture does not say.
   * See src/ui/peermarks.js; a game mode marks its special pilot with
   * peerMarks.setRole(seat, 'ace'). */
  const peerMarks = new PeerMarks(uiRoot, shell.renderer.domElement);
  const peerMarkGround = (x, z) => view.height(x, z, Infinity);
  /*
   * Thumb sticks, built only where the device reports touch points. They go
   * in after the Ui so they sit above every screen it draws, and the frame
   * loop keeps them hidden outside flight: over a menu their catch zones
   * would take the taps meant for it.
   */
  const touch = touchWanted() ? mountTouchSticks({
    onPause: () => leaveFlightFromThumbs(() => {
      ui.act('pause');
      ui.show('paused');
    }),
    onSwap: () => leaveFlightFromThumbs(() => ui.openSwap('flight')),
  }) : null;
  /* Both buttons mean something only in flight, the same two steps the
   * Escape key takes for Pause, and both hide the sticks at once rather
   * than on the frame loop's next pass: on a slow phone the pilot's second
   * tap can land in a stick zone lying over the menu just opened. */
  function leaveFlightFromThumbs(open) {
    if (ui.screen !== 'flight') {
      return;
    }
    open();
    touch.setVisible(false);
  }
  if (touch) {
    uiRoot.append(touch.root);
    input.attachTouch(touch);
  }
  /*
   * Counters for the board's statistics page: sessions, laps and flight
   * time, and nothing else (src/share/stats.js lists what is never sent).
   * Made this early because the crash path far below counts into it, and a
   * const reached before its own line throws. Nothing in it waits on a
   * world.
   */
  const flightStats = createFlightStats({ describe: describeFlight });
  /*
   * The three words every stats event carries, asked when the event is
   * sent, so a flush a minute in names what is flown then and stats.js
   * never imports the shell. The board still spells the Track seat 'custom'
   * (STATS_MAPS in fdfpv-leaderboard's validate.js) and folds airframe ids
   * it does not know itself. Input is only keyboard, touch or gamepad: a
   * radio reaches the browser as a gamepad, and which radio is not the
   * board's business.
   */
  function describeFlight() {
    let how = 'keyboard';
    if (input.firstGamepad()) {
      how = 'gamepad';
    } else if (input.touchSource && input.touchSource.active()) {
      how = 'touch';
    }
    const seat = ui.settings.map;
    return { craft: ui.settings.airframe, map: seat === 'track' ? 'custom' : seat, input: how };
  }
  /*
   * What is still counted goes when the page does. pagehide fires where
   * unload never would (a tab kept in the back/forward cache), and a hidden
   * page covers phones, where backgrounding is how a session usually ends.
   * One exit can fire both: the second finds the counters empty and costs
   * the board a row of zeros.
   */
  const pageLeaving = () => {
    flightStats.leaving();
    commitFlightTime();
  };
  window.addEventListener('pagehide', pageLeaving);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pageLeaving();
    }
  });

  /*
   * THE PILOT'S OWN FLIGHT TIME (src/share/flighttime.js), the record that
   * is theirs rather than the board's counter above. The clock is fed the
   * milliseconds the plant stepped in flight (see the step block in
   * frameBody), so a pause, a menu, a replay, the crash hold, a turtle
   * wait and the launch stand add nothing; it is written into the settings
   * every FLIGHT_COMMIT_MS of flying, when the flying stops, and when the
   * page goes away, never once a frame.
   *
   * The write merges what local storage holds first: a second tab in this
   * browser shares the device slot, and its writes are in storage, not in
   * this page's settings. Larger wins counter by counter, so the two tabs
   * add to the slot rather than overwrite each other.
   */
  const FLIGHT_COMMIT_MS = 10000;
  const flightClock = createFlightClock();
  const flightDevice = deviceId((() => {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  })());
  let flightClockFlew = false;
  function commitFlightTime() {
    const got = flightClock.take();
    if (!got.length) {
      return;
    }
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').flightTime;
    } catch (e) {
      stored = null;
    }
    const day = new Date().toISOString().slice(0, 10);
    let record = mergeFlightTime(ui.settings.flightTime, stored);
    for (const g of got) {
      record = addFlight(record, flightDevice, g.airframe, g.activity, g.seconds, day);
    }
    ui.settings.flightTime = record;
    ui.persistSettings();
    ui.progress.checkFirsts();
  }
  /* A profile from before firsts is paid for what it already holds. */
  ui.progress.checkFirsts();
  /* The activity flown, as the mode registry's id (src/share/modes.js):
   * the room's game in a room, else Track Day on a race map and Free
   * Flight anywhere else. Every game but those two is played in a room,
   * alone or not (LOBBY_GAMES). */
  function flightActivity() {
    const st = roomLinkState.state();
    if (st.phase === 'open' && st.welcome) {
      const id = modeOfWire(st.welcome.mode);
      return modeById(id) ? id : 'free';
    }
    return view && view.mode === 'race' ? 'race' : 'free';
  }

  const gpuInfo = readGpuInfo(shell.renderer);
  ui.setGpuInfo(gpuInfo);
  window.__gpu = gpuInfo;
  const dynres = createDynRes();
  dynres.bind(shell.renderer.getContext(), gpuInfo.software);
  dynres.setMode(ui.settings.perfMode, Number(ui.settings.fpsCap) || 0, gpuInfo.software);
  const perfOverlay = new PerfOverlay(uiRoot);
  perfOverlay.setOn(ui.settings.perfOverlay);
  dynres.setWatch(ui.settings.perfOverlay);
  /* F3 is the readout's key, as it was before the readout went
   * (src/ui/perfoverlay.js). Taken here and not in ui.handleKey because
   * the browser's own F3 (find next) has to be refused on the event. */
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.code !== 'F3' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) {
      return;
    }
    e.preventDefault();
    if (e.repeat) {
      return;
    }
    ui.settings.perfOverlay = !ui.settings.perfOverlay;
    ui.persistSettings();
    perfOverlay.setOn(ui.settings.perfOverlay);
    dynres.setWatch(ui.settings.perfOverlay);
  });
  window.__perfOverlay = () => ({ on: perfOverlay.on, ...perfOverlay.shown, text: perfOverlay.el.textContent });
  /*
   * The first line with a renderer, so the first that can see what really
   * draws. The preset chosen before it (loadSettings, from the user agent
   * alone) cannot tell a CPU rasteriser or a laptop's shared-memory chip
   * from a GPU. A CPU rasteriser keeps drawing at a few frames a second,
   * and since the picture is how the pilot sees the quad, a late picture
   * feels like late sticks (the sticks are sampled on their own timer and
   * are not late), so it goes to Low. An integrated chip draws well but is
   * short of fill rate and bandwidth, so High steps down to Medium, the
   * tier quality.js aims at those chips (Apple Silicon is left alone, see
   * INTEGRATED_RE). Only a preset the shell chose is lowered; one the pilot
   * picked stays. graphicsAuto stays set, because the value is still the
   * shell's, and the next boot finds nothing to lower.
   */
  const gpuPreset = (() => {
    if (!ui.settings.graphicsAuto) {
      return null;
    }
    if (gpuInfo.software) {
      return ui.settings.graphics === 'low' ? null : 'low';
    }
    return gpuInfo.integrated && ui.settings.graphics === 'high' ? 'medium' : null;
  })();
  if (gpuPreset) {
    ui.settings.graphics = gpuPreset;
    ui.persistSettings();
    ui.renderMenu();
  }
  let showcase = null;
  /* The aircraft picker's models, in the shell's own renderer. */
  const pickStage = createCarouselStage(shell.renderer);
  /*
   * THE WALKABLE HANGAR (docs/HANGAR-ROOM.md): made when the room opens,
   * on the shell's renderer, and let go when it shuts. The aircraft on its
   * stand is built again when the seated one changes or the hangar's
   * editor shuts, since a save there may have repainted it.
   */
  /* Where a replay the hangar's TV opened goes back to: { mode, which }. */
  let tvReturn = null;
  const walkRoom = { lastTurntable: null, view: null, graphics: null, craftKey: null, hangarWasOpen: false, ms: 0 };
  /* dtMs is the frame's, in milliseconds as everywhere in the frame loop;
   * the walk and the room's springs take seconds. */
  function walkRoomFrame(dtMs) {
    const dt = dtMs / 1000;
    const pose = ui.walkFrame(dt);
    const graphics = ui.settings.graphics;
    if (walkRoom.view && walkRoom.graphics !== graphics) {
      walkRoom.view.dispose();
      walkRoom.view = null;
    }
    if (!walkRoom.view) {
      walkRoom.view = createRoomView(shell.renderer, { graphics: qualityFor(graphics) });
      walkRoom.view.setRoom(ui.walk.tier, ui.walk.layout);
      walkRoom.graphics = graphics;
      walkRoom.craftKey = null;
      loadPhotoWall(walkRoom.view);
    }
    const id = ui.settings.airframe;
    const shut = walkRoom.hangarWasOpen && !ui.hangar.isOpen;
    walkRoom.hangarWasOpen = ui.hangar.isOpen;
    if (walkRoom.craftKey !== id || shut) {
      walkRoom.view.setCraft(dressParts(dressLivery(craftBuilderFor(id)({ name: 'room-craft', fog: false }), id), id));
      walkRoom.craftKey = id;
    }
    /* The trophy wall: every first paid, in key order so a wall reads the
     * same each visit (src/game/progress.js firsts). */
    const firsts = ui.progress && ui.progress.state.firsts ? ui.progress.state.firsts : {};
    walkRoom.view.setTrophies(Object.keys(firsts).filter((k) => firsts[k]).sort());
    walkRoom.ms += dt * 1000;
    const photo = ui.walk.photo;
    turntableStep(photo);
    walkRoom.view.update(dt, pose, walkRoom.ms, ui.walk.orbit, photo);
    if (photo && photo.shoot) {
      photo.shoot = false;
      const view = walkRoom.view;
      view.capture((blob) => {
        if (!blob) {
          ui.walkFlash(str('walk.photo_none'));
          return;
        }
        downloadBlob(stampedName('hangar', '.jpg'), blob);
        putPhoto(blob, ui.settings.airframe).then(() => {
          ui.walkFlash(str('walk.photo_saved'));
          return loadPhotoWall(view);
        }).catch((err) => ui.walkFlash(str('walk.photo_failed', { why: err.message })));
      });
    }
    return walkRoom.view;
  }
  /*
   * THE TURNTABLE (docs/SHOW-IT-OFF.md part 2): the camera once round the
   * stand in TURNTABLE_S while a MediaRecorder takes the canvas, then the
   * WebM downloaded. Turned by the wall clock, so a slow machine records a
   * slower frame rate, never a shorter turn.
   */
  const TURNTABLE_S = 6;
  function turntableStep(photo) {
    const tt = photo && photo.turntable;
    if (!tt) {
      return;
    }
    if (tt.want) {
      tt.want = false;
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      try {
        tt.chunks = [];
        tt.rec = new MediaRecorder(shell.canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
      } catch (err) {
        photo.turntable = null;
        ui.walkFlash(str('walk.turntable_failed', { why: err.message }));
        return;
      }
      tt.rec.ondataavailable = (e) => e.data.size && tt.chunks.push(e.data);
      tt.rec.onstop = () => {
        const blob = new Blob(tt.chunks, { type: tt.rec.mimeType });
        walkRoom.lastTurntable = { bytes: blob.size, type: blob.type, s: (performance.now() - tt.t0) / 1000 };
        downloadBlob(stampedName('turntable', '.webm'), blob);
        ui.walkFlash(str('walk.turntable_saved'));
        if (ui.walk && ui.walk.photo === photo) {
          photo.turntable = null;
        }
      };
      tt.yaw0 = photo.yaw;
      tt.t0 = performance.now();
      tt.rec.start(500);
      ui.walkFlash(str('walk.turntable_on'));
    }
    const t = (performance.now() - tt.t0) / 1000;
    photo.yaw = tt.yaw0 + (2 * Math.PI * Math.min(t, TURNTABLE_S)) / TURNTABLE_S;
    if (t >= TURNTABLE_S && tt.rec.state === 'recording') {
      tt.rec.stop();
    }
  }

  /* The newest photos onto the room's photo wall, each made small first:
   * the wall's atlas cell is a few hundred pixels wide. */
  async function loadPhotoWall(view) {
    try {
      const rows = (await listPhotos()).slice(0, PHOTO_FRAMES);
      const bitmaps = await Promise.all(rows.map((r) => createImageBitmap(r.blob, { resizeWidth: 512, resizeQuality: 'medium' })));
      if (walkRoom.view === view) {
        view.setPhotos(bitmaps);
      }
    } catch (err) {
      /* No IndexedDB, or a picture that will not decode: the wall stays
       * bare, and the console says why. */
      console.warn('hangar photo wall:', err);
      if (walkRoom.view === view) {
        view.setPhotos([]);
      }
    }
  }
  function walkRoomShut() {
    if (walkRoom.view) {
      walkRoom.view.dispose();
      walkRoom.view = null;
    }
  }
  /*
   * A map named in the address wins over the stored one. boot.js only read
   * it to weight the loading bar; the Ui owns the setting, and it built its
   * rows in its constructor, so they are rebuilt here or the menu would go
   * on naming a map that is not the one shown.
   */
  if (mapId && mapId !== ui.settings.map) {
    ui.settings.map = mapId;
    ui.renderMenu();
  }
  /*
   * THE TITLE'S WORLD, boot.js's Swiss valley, or null when the address
   * named a world. While it is set the title shows it and the pilot's seat
   * waits for Fly; the first fly clears it for the session. Returning to the
   * title after a flight keeps the flown world rather than rebuilding the
   * valley: measured on this machine, the Alps took 9.1 s to rebuild in
   * session (world 6.9 s, first frame 2.2 s), and a quit to the menu is
   * instant today.
   */
  let titleWorld = titleMap;
  /*
   * THE WORLD THE BUILDER IS OPEN IN, when My tracks opened it on a track
   * (Edit) or on a map (New track), or null. While it is set the world is
   * that one with no track seated on it, whatever the seat holds, because
   * what is standing in it is the track being built. Leaving the builder for
   * My tracks clears it, and the next Play seats its track on the world
   * already built when it is the same one.
   */
  let buildWorld = null;
  /*
   * THE TRACK THE PILOT'S SEAT HOLDS, or null.
   *
   * "Track" (map:track) means "fly the seated track", and My tracks, a board
   * link and a publish all seat one the same way. A track is flown in the
   * world it names (schemaVersion 4, src/builder/), with its gates seated on
   * that world's view by the in-sim builder (seatMapCourse below), so the
   * seat decides the world. Only a world this build can build in counts.
   */
  function seatedMapTrack() {
    if (titleWorld || buildWorld) {
      return null;
    }
    return seatShare();
  }
  /* The map track the Track seat holds, whatever the title or the builder
   * is showing, or null. */
  function seatShare() {
    if (ui.settings.map !== 'track') {
      return null;
    }
    let share = null;
    try {
      share = readShareImport();
    } catch (e) {
      return null;
    }
    const doc = share && share.document;
    if (!doc || !isMapTrack(doc)) {
      return null;
    }
    const entry = mapById(doc.map);
    return entry.id === doc.map && entry.build ? share : null;
  }
  /* The world to build: the title's, the builder's, the seated track's, the
   * Track seat's home when no track is seated, or the map the pilot chose. */
  function worldId() {
    if (titleWorld || buildWorld) {
      return titleWorld || buildWorld;
    }
    const seat = mapById(ui.settings.map);
    if (seat.load) {
      return seat.id;
    }
    const seated = seatedMapTrack();
    return seated ? seated.document.map : seat.home;
  }
  /* The record line. While the title shows its own world the seat's course
   * is unbuilt, and an undefined record and mode tell the Ui exactly that. */
  function paintBest() {
    const built = !titleWorld;
    ui.setBest(built ? race.bestMs : undefined, built ? view.mode : undefined);
  }
  /*
   * The flight controller's bytes are fetched now, beside the board, not
   * after it. dist/sim.wasm needs nothing from the address, the board or
   * the settings, and the board can be a sleeping host a minute from
   * waking; in series, the board's round trips sat in front of the wasm
   * (1519 ms against a local board). scripts/boot-check.js holds the order.
   *
   * Progress shows only once the sim stage is the live one. The loading
   * screen opens whatever stage reports, so an early report would claim
   * "Flight controller" while the board is the real wait; the latest
   * reading is kept and shown when the stage opens.
   */
  let simProgress = null;
  let simStageLive = false;
  const simBytes = fetchBytes(WASM_URL, (frac, got, total) => {
    const kb = (bytes) => (bytes / 1024).toFixed(0);
    simProgress = [frac, str('main.of_kb', { v1: kb(got), v2: kb(total) })];
    if (simStageLive) {
      loading.report('sim', ...simProgress);
    }
  });
  /* A failure is reported where the bytes are awaited, by the sim stage.
   * This only keeps the browser from calling the rejection unhandled while
   * the board is still being asked. */
  simBytes.catch(() => {});
  /*
   * A published track's link (?share=id) is fetched before any world is
   * built, so the world built is the one it stands in. It is a stage of its
   * own because the board can be asleep, and a pilot told "Renderer" while
   * it wakes would look for the wrong problem.
   */
  loading.start('board');
  loading.system('online', 'loading');
  try {
    const linked = await adoptShareFromLocation();
    /* Without a link boot asks the board nothing, and the row says so. */
    loading.system('online', linked ? 'ready' : 'na');
    if (linked) {
      seatLinkedTrack(linked);
    }
  } catch (e) {
    loading.system('online', 'fail');
    ui.setBanner(str('main.could_not_open_that_published_track', { v1: e.message ?? e }), true);
  }
  /* Whichever way it went, so the stage has a duration and the bar fills
   * the share it was given. */
  loading.done('board');
  /*
   * The linked track takes the Track seat, after the aircraft question:
   * ui.seatCraftForDoc moves the pilot onto an aircraft that may race it
   * (any quad, a plane that fits every gate, else the five inch) and says
   * whether that moved the track from the planes' seat to the quads', in
   * which case a stale copy of it in the planes' seat goes and it is written
   * to the quads'. Done before anything reads a seat; applySettings, run
   * once below, swaps the plant to match.
   */
  function seatLinkedTrack(linked) {
    if (ui.seatCraftForDoc(linked.document)) {
      const planeSeat = readShareImport('wing');
      if (planeSeat && planeSeat.id === linked.id) {
        clearShareImport('wing');
      }
      writeShareImport(linked);
    }
    ui.settings.map = 'track';
    ui.renderMenu();
  }
  /*
   * A chase link adds ?ghost=tm- and eight hex digits. Only the id is kept
   * here; the ghost is fetched once the course and its board times are
   * known (ghostCourseChanged), so a slow board never holds up the boot.
   */
  const wantGhostId = boardTimeIdIn(window.location.search);
  function boardTimeIdIn(search) {
    let id = '';
    try {
      id = new URLSearchParams(search).get('ghost') || '';
    } catch (e) {
      return '';
    }
    return /^tm-[0-9a-f]{8}$/.test(id) ? id : '';
  }
  /*
   * A handle changed since this browser last published is sent to the
   * board, so the author line and the times posted under the old one catch
   * up. A changed layout is not: that clears times, so it is asked first.
   * Nothing waits on this, and a board that is down catches up the next
   * time the name is saved.
   */
  (async () => {
    const own = inspectCourse();
    await pushOwnedListing(own && own.doc ? own.doc : null);
  })().catch(() => {});

  let view = null;
  /*
   * THE FIRST CRASH USED TO LINK ITS SHADERS MID FLIGHT. The pilot's own
   * aircraft is not drawn from the FPV camera, and the session's effects
   * (debris, explosions, the wreck) join the map's scene on first use, so
   * their programs were linked in the frame the crash first showed them:
   * five to seven on Itaipu, the aircraft's own materials and the
   * debris's, counted in renderer.info.programs. Compiling them against
   * the map's lights while the map loads, or as the aircraft is swapped
   * between runs, moves that cost out of the flight. The composer's target is bound while it runs because a program
   * for the screen and one for a render target differ in their output
   * colour space, and the scene is drawn into the composer.
   */
  function prewarm(roots) {
    if (!view || !view.scene) {
      return;
    }
    const r = shell.renderer;
    const was = r.getRenderTarget();
    r.setRenderTarget(view.post && view.post.composer ? view.post.composer.readBuffer : null);
    for (const g of roots) {
      r.compile(g, shell.camera, view.scene);
    }
    r.setRenderTarget(was);
  }
  /*
   * Resizes are coalesced to one a frame. Sizing the post chain reallocates
   * every composer target and the bloom levels, and a window drag fires
   * dozens of events a second, each of which used to leave a whole set of
   * dead targets for the collector. The event only marks the size stale;
   * the frame applies it.
   */
  let resizeDirty = false;
  window.addEventListener('resize', () => { resizeDirty = true; });
  /* The movie export's surface while one is set (setExportSurface), else
   * null. A resize waits until it goes. */
  let exportShot = null;
  function applyResizeIfDirty() {
    if (exportShot || !resizeDirty) {
      return;
    }
    resizeDirty = false;
    const size = shell.resize();
    /*
     * The pixel ratio is worked out again on every resize. Browser zoom and
     * a move to another screen change devicePixelRatio and fire resize, and
     * the ratio also follows the window's area through the field's pixel
     * budget. A ratio kept from boot renders blurry after Ctrl-plus, or four
     * times the pixels a 1x monitor can show.
     */
    const dyn = dynres.state.scale;
    const scale = renderScaleOf(ui.settings);
    if (Math.abs(pixelRatioFor(ui.settings.graphics, scale, null, dyn) - shell.pixelRatio) > 0.001) {
      applyPixelRatio(shell, ui.settings.graphics, scale, null, dyn);
    }
    /* Not between a map swap tearing down the old post chain and building
     * the new one, which is exactly when mapReady is false: setSize there
     * touches freed targets. */
    if (!view || !view.post || !mapReady) {
      return;
    }
    view.post.setSize(size.w, size.h);
    if (view.post.sharpen) {
      view.post.sharpen.enabled = dyn < 1;
    }
  }
  /*
   * The movie export (src/replay/export.js) reads its frames off this
   * canvas, so while it runs the drawing buffer is exactly w x h at ratio 1,
   * the page's CSS size untouched, and the world's moving parts (grass,
   * water) follow clock(), the movie time of the frame being drawn: a frame
   * held while the encoder catches up holds the grass with it. Returns the
   * restore, which puts the window's size and ratio back and applies any
   * resize that came meanwhile, once.
   */
  function setExportSurface(w, h, clock) {
    if (exportShot) {
      throw new Error('an export surface is already set');
    }
    exportShot = { clock, wind0: performance.now() * 0.001, waves0: renderSimT };
    sizeForMovie(w, h);
    return () => {
      if (!exportShot) {
        return;
      }
      exportShot = null;
      resizeDirty = true;
      applyResizeIfDirty();
    };
  }
  function sizeForMovie(w, h) {
    shell.pixelRatio = 1;
    shell.renderer.setPixelRatio(1);
    shell.renderer.setSize(w, h, false);
    shell.camera.aspect = w / h;
    shell.camera.updateProjectionMatrix();
    if (view && view.post && mapReady) {
      view.post.setSize(w, h);
    }
  }
  const audio = new MotorAudio();
  /* The ground's material where the craft is, as the plant was last told
   * (declareGroundMaterial), for what a hit on it sounds like. */
  let groundMaterialNow = SURFACE.grass;
  /* The flaps' angle and the gear's position last frame, for the sound of
   * them moving, and whether the gear was moving. */
  let flapAngleWas = 0;
  /* Whether the mix was last told a replay plays (audio.setReplaying). */
  let audioReplaying = false;
  let gearWas = 0;
  let gearMovingWas = false;
  /* Everything in the world that sounds and is not this aircraft: the
   * war's attackers and its explosions (src/render/world-audio.js). Fed
   * a frame at a time; silent until the mix gives it a bus. */
  const worldAudio = new WorldAudio();
  /* Built, and silent until the pilot's first press: a browser starts an
   * AudioContext only on a gesture (MotorAudio.start), so the boot screen
   * says standby, not OK. */
  loading.system('audio', 'standby');
  /*
   * The music dock shows what plays now from the first frame. On the title
   * that is the menu bed's random record, so it is pushed before any
   * gesture starts the audio, rather than a flight record nobody hears yet.
   */
  audio.music.onChange = (st) => ui.setMusicNow(st);
  ui.setMusicNow(audio.musicStatus());
  ui.onMusicSkip = (dir) => {
    wakeAudio();
    audio.skipMusic(dir);
    const now = audio.musicStatus();
    /*
     * Only a skip between flight records moves a pinned Music track
     * setting. In the menus the dock skips the menu bed, whose ids are not
     * in the setting's list: stored, one would show as the first flight
     * track and quietly turn back into rotation on the next load.
     */
    const pinned = ui.settings.musicTrack !== 'rotation';
    if (pinned && now && now.context === 'flight') {
      ui.settings.musicTrack = now.id;
      ui.persistSettings();
    }
    if (ui.screen === 'pilot') {
      ui.renderMenu();
    }
  };
  /* Flight bed or menu bed, by ui.flying(), which counts a pause as flight. */
  ui.onScreenChange = () => audio.setMusicContext(ui.flying() ? 'flight' : 'menu');

  loading.start('sim');
  loading.system('physics', 'loading');
  simStageLive = true;
  if (simProgress) {
    /* What came in while the board was being asked: usually all of it. */
    loading.report('sim', ...simProgress);
  }
  const sim = await loadSim(await simBytes);
  /* The crash cam's journal stands between the shell and the module from
   * here on, before anything has allocated or captured sim.e: it writes
   * down the calls take over replays, and changes none of them
   * (src/replay/journal.js). */
  const journal = createJournal(sim.e);
  sim.e = journal.exports;
  /* Every entry point the shell calls, checked once here, so a stale
   * dist/sim.wasm stops the boot by name instead of failing mid flight. */
  for (const entry of [
    'sim_deflect', 'sim_contact', 'sim_set_ground', 'sim_set_crashflip',
    'sim_set_pose', 'sim_ground_contacts', 'sim_set_launch_stand',
  ]) {
    if (typeof sim.e[entry] !== 'function') {
      throw new Error(`sim.wasm does not export ${entry}`);
    }
  }
  /* The module is in and answers for every entry point the shell calls:
   * the plant is up. The controller is up once its tune is applied, below. */
  loading.system('physics', 'ready');
  loading.system('flight', 'loading');
  /*
   * The controller is whatever Betaflight diff the Tune setting names: the
   * tune is the diff. What flies is that diff, then the pilot's PID
   * adjustment for the loaded tune (configs/pids.js), then the pilot's
   * rates last (configs/rates.js), joined by composeConfig in
   * src/fc/dump.js and nowhere else. No file in configs/ carries rates, so
   * choosing a tune never changes stick authority and a tune can be judged
   * on its own, and even a dropped diff flies on the menu's rates. Boot and
   * the menu load a tune the same way, and an id that no longer exists
   * reads as the first tune (tuneById).
   */
  let configId = tuneById(ui.settings.tune).id;
  /* The tune the menu last asked for, kept apart from the one loaded: a
   * dropped file changes what is loaded and not what was asked for. */
  let menuTune = ui.settings.tune;
  let configName = '';
  /*
   * Tune loads after boot (the menu, a dropped diff) are async and
   * numbered: a slow fetch must not sim_init over a newer choice, and Fly
   * or Resume waits on configLoadWait so a run's RC timestamps are not
   * invalidated by an init still on its way (adoptSimClock).
   */
  let configGen = 0;
  let configLoadWait = Promise.resolve();
  /* The pilot's own tune, "custom": the dump the Flight controller screen
   * saved, its rates stripped on the way in, so it is composed like any
   * file in configs/. Null when there is none or storage is shut. */
  function readFcDump() {
    try {
      return localStorage.getItem(FC_DUMP_KEY);
    } catch (e) {
      return null;
    }
  }
  /* Saves the dump stamped with the aircraft it came off, so the Tune row
   * offers it on that aircraft only (FC_DUMP_AIRFRAME_KEY). False when
   * storage refuses either write. */
  function writeFcDump(body) {
    try {
      localStorage.setItem(FC_DUMP_KEY, body);
      localStorage.setItem(FC_DUMP_AIRFRAME_KEY, ui.settings.airframe);
    } catch (e) {
      return false;
    }
    return true;
  }
  const fetchTuneText = async (id) => new TextDecoder().decode(await fetchBytes(tunePath(id)));
  /*
   * The tune boot flies. A shipped tune the module refuses is a broken
   * build and stops the boot. The pilot's own dump, missing or refused,
   * must not brick the page: the first tune is flown instead and saved as
   * the choice, and the dump stays stored for the pilot to fix.
   */
  let tuneText = null;
  let ratesText = ratesDiff(ui.settings.rates);
  let pidsText = '';
  let configText = '';
  for (;;) {
    const own = configId === 'custom';
    tuneText = own ? readFcDump() : await fetchTuneText(configId);
    configName = own ? str('main.your_edits') : `${configId}.diff`;
    if (tuneText != null) {
      pidsText = pidsDiffFor(ui.settings.pids, configId);
      configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP, pidsText);
      if (sim.init(configText) === SIM_OK) {
        break;
      }
      if (!own) {
        throw new Error(`sim_init failed on ${configName}`);
      }
    }
    configId = TUNES[0].id;
    menuTune = configId;
    ui.settings.tune = configId;
    ui.persistSettings();
  }
  /*
   * The PIDs screen is handed what the controller really flies, read back
   * from the module after every init; it never works a PID out from a
   * slider, so a slider that stopped reaching Betaflight shows as one that
   * moves nothing. The tune's own slider positions come from its text, not
   * the module, whose sliders are the override once one has run: cliMap
   * keeps the last write, as the CLI does, and a slider the tune never
   * sets sits at the firmware's 100.
   */
  const PID_TERMS = ['p', 'i', 'd', 'dmax', 'f'];
  function publishPids() {
    const flown = (key) => {
      const v = Number(moduleGet(sim, key));
      return Number.isFinite(v) ? v : 0;
    };
    const shipped = cliMap(tuneText);
    const baseline = Object.fromEntries(SLIDER_KEYS.map((k) => {
      const v = Number(shipped.get(SLIDERS[k].cli));
      return [k, Number.isFinite(v) ? v : 100];
    }));
    const pids = Object.fromEntries(PID_AXES.map((axis) => [
      axis, Object.fromEntries(PID_TERMS.map((term) => [term, flown(pidCliKey(term, axis))])),
    ]));
    ui.setPidsLive({
      tune: configId,
      mode: moduleGet(sim, 'simplified_pids_mode'),
      baselineMode: shipped.get('simplified_pids_mode') || 'RPY',
      baseline,
      pids,
    });
  }
  publishPids();
  loading.system('flight', 'ready');
  loading.done('sim');
  loading.detail = '';

  applyPixelRatio(shell, ui.settings.graphics, renderScaleOf(ui.settings));
  /*
   * A world that will not build (a bad asset, a WebGL context the
   * photographs cannot have) must not end the session before the title, as
   * it did when only the map swap had a fallback. The Alps are the floor:
   * the smallest world, and the one the Swiss valley builds through, so if
   * they fail there is nothing under them and the error stands.
   */
  const worldOptions = () => ({ quality: ui.settings.graphics, renderScale: renderScaleOf(ui.settings) });
  const firstWorld = worldId();
  try {
    view = await loadMap(shell, firstWorld, loading, worldOptions());
  } catch (e) {
    if (firstWorld === FLOOR_WORLD) {
      throw e;
    }
    console.error(e);
    /* A title world that fails is dropped and the seat left alone, since
     * the seat is not what failed (syncWorld builds it later, with its own
     * fallback). A seat that fails moves to the floor. */
    if (titleWorld) {
      titleWorld = null;
    } else {
      ui.settings.map = FLOOR_WORLD;
    }
    ui.renderMenu();
    view = await loadMap(shell, FLOOR_WORLD, loading, worldOptions());
    /* Said on the banner, as a failed board link is: `notice` belongs to the
     * frame loop's state further down and does not exist yet. */
    ui.setBanner(str('main.could_not_be_loaded_the_floor', {
      failed: mapById(firstWorld).name,
      floor: mapById(FLOOR_WORLD).name,
    }), true);
  }
  ui.setShare(view.share || null);
  /*
   * The address named a world that has been retired, and boot.js seated the
   * one that replaced it. Asked in a dialog rather than said on the banner:
   * the banner is a flight message and the title clears it on its first
   * frame, so a link would land the pilot here with nothing said. Staying is
   * the default; the other answer is the freestyle room, where the worlds
   * that are left are cards.
   */
  if (retiredFrom) {
    const gone = retiredMap(retiredFrom);
    ui.askConfirm({
      title: str('main.that_world_was_retired'),
      detail: str('main.that_map_was_retired', { map: str(gone.name), now: mapById(gone.to).name }),
      yes: str('main.stay_here'),
      no: str('main.choose_a_world'),
    }).then((stay) => {
      if (!stay) {
        ui.show('freestyle');
      }
    });
  }
  loading.start('frame');

  /*
   * The run's start in world space, which the map decides. `let`, because
   * a map swap moves it. A gateless world has no first gate to start from,
   * so nothing here may be read off one.
   */
  let startX = 0;
  let startZ = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  /*
   * The surface a craft standing at (x, z) rests on. view.height(x, z,
   * fromY) only offers a platform within a step of fromY, which is how a
   * quad flies under the city's overbridge yet lands on its deck. So the
   * bare ground is asked for from far below, then asked again from that
   * height, which finds the footway, kerb or slab laid on it. Asked from
   * far above, a craft parked in the street would sit on a roof seven
   * metres up.
   */
  function groundAt(x, z) {
    return view.height(x, z, view.height(x, z, -1000));
  }

  /* World y of the craft's own up vector, for acos: world up turned by
   * the attitude has y = 1 - 2(x^2 + z^2), held to [-1, 1] because a
   * normalised quaternion can still land a hair outside it. Uses qCollide,
   * the attitude this frame's ground and hit queries share. */
  function craftUpY() {
    const { x, z } = qCollide;
    return Math.min(1, Math.max(-1, 1 - 2 * (x * x + z * z)));
  }

  /*
   * AN AIRCRAFT ON FLOATS ON A MAP WITH WATER starts afloat on it, at the
   * water's own spawn, and rests at its floats' height; anywhere else it is
   * on the strip on its keels. Everything that asks where the craft rests
   * asks restPose().
   */
  function floatsOnWater() {
    return Boolean(airframeById(runAirframe).floats && view && view.water && view.water.length);
  }
  function restPose() {
    const af = airframeById(runAirframe);
    if (floatsOnWater()) {
      return af.floats;
    }
    return gearOf(af);
  }
  /* The water body under a map point, or null. */
  function waterAt(x, z) {
    return (view && view.water || []).find((b) => insideWater(b, x, z)) || null;
  }
  /*
   * WHERE THE PLANT'S GROUND GOES under an aircraft on floats over water:
   * the lake's bed, since view.height answers the surface there so that
   * everything else rests on the water as it always has, and the floats
   * float on the water the plant was told of instead. Everything else,
   * and the floats anywhere but over water, gets view.height itself.
   */
  function floorHeight(x, z, fromY) {
    const h = view.height(x, z, fromY);
    if (!airframeById(runAirframe).floats) {
      return h;
    }
    const w = waterAt(x, z);
    if (!w || h > surfaceAt(w, x, z) + 1e-6) {
      return h;
    }
    return Math.min(h, w.bed(x, z));
  }
  /*
   * Tell the plant the map's water, in its own frame, which is the spawn's:
   * so at every reset, since a reset can move the spawn. Points go through
   * worldPosToSim like the ground plane's point, the wind's direction
   * through worldDirToSim like its normal (src/game/water.js declareBodies,
   * which throws on anything the plant refuses). A map without water
   * clears whatever the last one declared.
   */
  const waterFrame = { pos: worldPosToSim, dir: worldDirToSim, perMetre: 1 / simLenToWorld(1) };
  function declareWater() {
    if (typeof sim.e.sim_water_clear !== 'function') {
      return;
    }
    sim.e.sim_water_clear();
    handWaves(declareBodies(sim.e, (view && view.water) || [], waterFrame));
  }

  /*
   * THE WAVES, HANDED TO THE MAP: what the plant built from the water just
   * declared, read back with sim_water_components and turned into the
   * map's frame, the inverse of declareWater's path (poseFromState's for
   * the waves' origin and still water height, the same basis change and
   * spawn yaw without the offset for each wave vector). A wave vector is
   * per metre, so it takes the frame's scale the other way round to a
   * length. The map draws its water from these (src/render/lakewaves.js);
   * a map without the hook, or a plant without waves, draws still water.
   *
   * Handed over by showWaves, once a frame, and only while a run is up:
   * the boot's reset declares the water too, but on the title nothing
   * steps the sim clock, so its waves would stand still, and the title's
   * still lake is the one the map was built with (the cel alps' scene
   * fingerprint, the swiss2 loop's views). window.__wavesOn shows them
   * there for a check.
   */
  let wavesPtr = 0;
  const waveO = new THREE.Vector3();
  const waveK = new THREE.Vector3();
  const STILL_WATER = [];
  let wavesMap = STILL_WATER;
  /* The highest the handed waves can stand above still water, m. */
  let waveCrest = 0;
  let wavesHanded = null;
  let wavesHandedTo = null;
  let wavesAtTitle = false;
  function handWaves(bodies) {
    wavesMap = STILL_WATER;
    waveCrest = 0;
    if (typeof sim.e.sim_water_components !== 'function') {
      return;
    }
    if (!wavesPtr) {
      wavesPtr = sim.e.malloc(41 * 8);
    }
    const perLength = 1 / simLenToWorld(1);
    const out = [];
    for (const { w, body: b } of bodies) {
      const code = sim.e.sim_water_components(b, wavesPtr);
      if (code !== SIM_OK) {
        throw new Error(`sim_water_components: ${simErrorName(code)}`);
      }
      const c = new Float64Array(sim.e.memory.buffer, wavesPtr, 41);
      simPosToThree(c[2], c[3], c[1] + SPAWN_ALT, waveO).applyQuaternion(qSpawn);
      const comps = [];
      let crest = 0;
      for (let i = 0; i < c[0]; i += 1) {
        const o = 6 + i * 5;
        simPosToThree(c[o + 1], c[o + 2], 0, waveK).applyQuaternion(qSpawn).multiplyScalar(perLength * perLength);
        comps.push({ a: simLenToWorld(c[o]), kx: waveK.x, kz: waveK.z, omega: c[o + 3], phase: c[o + 4] });
        crest += Math.abs(comps[i].a);
      }
      waveCrest = Math.max(waveCrest, crest);
      w.crest = crest;
      out.push({ y0: waveO.y + startY, ox: waveO.x + startX, oz: waveO.z + startZ, comps });
    }
    wavesMap = out;
  }
  /*
   * What toilet paper is drawn lying on (src/render/streamers.js): the
   * ground, and over the lake the highest its waves can stand, every
   * component's height at once. groundAt answers the still water there,
   * which is where the paper's physics rests it, and the waves are drawn
   * above it as well as below.
   */
  function paperFloorAt(x, z) {
    const h = groundAt(x, z);
    const w = waveCrest > 0 ? waterAt(x, z) : null;
    return w && w.crest > 0 ? h + w.crest : h;
  }
  function showWaves() {
    if (typeof view.setWaves !== 'function') {
      return;
    }
    const want = mode === 'title' && !wavesAtTitle ? STILL_WATER : wavesMap;
    if (want !== wavesHanded || view !== wavesHandedTo) {
      view.setWaves(want);
      wavesHanded = want;
      wavesHandedTo = view;
      /* The scene compiled again, against the composer's target, each
       * time the water changes. Waves and still water are different
       * programs for the water's materials, and the map compiled its
       * scene with still water and with no target bound (the screen's
       * variant, which nothing draws: 42 programs on swiss2 the first
       * time this runs, on the title). Each was linked the first time
       * its mesh came into view, in flight: the lake's bed and the reeds
       * on swiss-low eight seconds in, 27 to 62 ms; Itaipu's canopy and
       * a town ring, 6 to 18 ms (docs/PERF.md P6). compile() ignores the
       * frustum, so the links start here, where a run starts (40 ms on
       * the title the first time, 5 ms at a run's start after), and the
       * driver has them done before the mesh is seen. */
      prewarm([view.scene]);
    }
  }

  /* An aircraft on floats as the water reads it: its drawn pose, which
   * the near patch is laid round, and for its spray and wake (src/render/
   * spray.js) its velocity in the map, what the floats did on the last
   * step, and its floats' geometry. Null for anything else. */
  const FLOAT_GEOMETRY = { timber1500f: TIMBER_FLOATS, cub1400f: CUB_FLOATS };
  const craftWaterVel = new THREE.Vector3();
  let craftWaterState = null;
  function craftOnWater() {
    const floats = FLOAT_GEOMETRY[runAirframe];
    if (!floats || !stateCurr || mode === 'title' || typeof sim.e.sim_float_state !== 'function') {
      return null;
    }
    if (!floatStatePtr) {
      floatStatePtr = sim.e.malloc(10 * 8);
    }
    sim.e.sim_float_state(floatStatePtr);
    if (!craftWaterState || craftWaterState.buffer !== sim.e.memory.buffer) {
      craftWaterState = new Float64Array(sim.e.memory.buffer, floatStatePtr, 10);
    }
    simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], craftWaterVel).applyQuaternion(qSpawn);
    return {
      position: shell.quad.position, quaternion: shell.quad.quaternion, velocity: craftWaterVel, state: craftWaterState, floats,
    };
  }

  /*
   * Where this run starts. The view's spawn, except for an aircraft on
   * floats on a map with water: flown free it starts on the water's own
   * spawn, and on a course built in the world (a start from src/builder/
   * course.js startFor, which carries `lift` or `air`) at the course's own
   * start, on the water when that is on the lake and in the air when it is
   * on land (floatStart).
   */
  function runSpawn() {
    return roomSlotSpawn(mapSpawn());
  }
  /* The water body an aircraft on floats starts on when flown free, an
   * index into view.water: the map's first body on a map that does not
   * choose its own spawns (spawnFor, below). */
  let floatBody = 0;
  /*
   * A map with more than one start (Itaipu: the crest road for the planes
   * and the quads, the reservoir and the river for the floats, and
   * one in the air) answers spawnFor(spawn, kind, wish) with the one for
   * this aircraft, given the view's spawn, which it hands back when that
   * is a course's start rather than its own. `wish` is the page's ?spawn=,
   * the one way a pilot picks among them until the shell has a row for it.
   */
  const spawnWish = new URLSearchParams(window.location.search).get('spawn');
  function mapSpawn() {
    const sp = view.spawn;
    if (sp && sp.lift && floatsOnWater()) {
      return floatStart(sp, (x, z) => Boolean(waterAt(x, z)));
    }
    if (sp && view.spawnFor) {
      const kind = floatsOnWater() ? 'float' : airframeById(runAirframe).fixedWing ? 'plane' : 'quad';
      return view.spawnFor(sp, kind, spawnWish);
    }
    if (!sp || !floatsOnWater()) {
      return sp;
    }
    return sp.air ? sp : floatSpawn(view.water, floatBody);
  }
  /*
   * In a room of friends, each pilot starts at their own seat's slot
   * (src/game/slots.js): on a gateless world, and on the room's own track,
   * where the row is laid across the track's start, so a room's racers
   * line up side by side rather than in one another. Another track's start
   * is the track's. -1 out of a room, and slot 0 is the spawn itself, so a
   * flight alone starts exactly where it always did.
   */
  let roomSlot = -1;
  function roomSlotSpawn(sp) {
    return roomSlot > 0 && (race.freestyle || roomTrackSeated()) ? slotSpawn(sp, roomSlot) : sp;
  }
  /* Whether this run starts afloat, which is where it rests. */
  function startsAfloat() {
    const sp = runSpawn();
    return floatsOnWater() && !(sp && sp.air);
  }

  /* The ground a spawn seats the craft on. A map that draws its ground in
   * levels (Itaipu's terrain engine) first selects round the new spot
   * (map.settleGround), so the height read is the level drawn there from
   * the next frame on, not the coarse node the last place's selection drew.
   * fromY is a spawn's hint, so a deck spawn is not the grass under it. */
  function spawnHeight(x, z, fromY) {
    if (view.settleGround) {
      view.settleGround(x, z);
    }
    return fromY != null ? view.height(x, z, fromY) : groundAt(x, z);
  }

  function adoptSpawn() {
    seatRestHeight(airframeById(runAirframe), startsAfloat());
    const sp = runSpawn();
    startX = sp.x;
    startZ = sp.z;
    startYaw = sp.yaw;
    startPitch = sp.pitch || 0;
    /* The spawn sits on the ground under it, which on these maps is
     * nowhere near zero; at zero the craft starts inside the hill. */
    startY = spawnHeight(startX, startZ, sp.y);
    qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
    qSpawnInv.copy(qSpawn).invert();
  }

  /* Gates, laps and the best lap. A freestyle map gets one too, empty, so
   * the code that asks it questions never has to ask whether it exists. */
  let race = new Race(view.gates, 'full');
  /* The in-sim builder, once a world it can build in is seated. Declared up
   * here because the ghost below asks whether a run is its test flight. See
   * buildHost. */
  let build = null;
  /*
   * Freestyle scoring (freestyle maps only) has two halves on two clocks.
   * TrickDetector integrates body rates, so it must see every 1 ms physics
   * step; sampled per frame, a fast roll would be a handful of points and
   * its rotation count a guess. Its per-step cost is tiny, which is what
   * makes running it at physics rate affordable. FreestyleScore is ticked
   * per frame but on simulation time, so frame drops and pause cannot
   * change when a combo banks.
   */
  /* Decided per frame, consulted every step. */
  let scoring = false;
  /* Reused buffers for the detector's per-step pose: the step loop must
   * not allocate. */
  const scorePos = new THREE.Vector3();
  const scoreFwd = new THREE.Vector3();
  /* Body up in world space. Nose alone cannot separate a loop's rotation
   * from the bank angle it was flown at; nose plus up can (debankLap). */
  const scoreUp = new THREE.Vector3();
  const scoreQuat = new THREE.Quaternion();
  /*
   * settings.freestyleScoring, read at each run start: 'scored' runs a
   * two minute timed run with a leaderboard, 'free' scores without a
   * clock, 'off' (the default, see DEFAULTS in src/ui/ui.js) hides it.
   * 'off' only hides: detection and scoring keep running underneath, so
   * there is a single in-flight code path and real flights keep exercising
   * the scorer while it matures. Timing is on for 'scored' alone.
   */
  const scoredRun = () => ui.settings.freestyleScoring === 'scored';
  const scoringWanted = () => ui.settings.freestyleScoring !== 'off';
  const score = new FreestyleScore({ timed: scoredRun() });
  /* Trick targets (deriveObstacles output) for the current map, or null,
   * in which case the detector recognises open-air tricks only. */
  let obstacles = null;
  /* A Trick Battle run of this pilot's (TRICK BATTLE, below): its own
   * scorer beside the freestyle one, fed the same tricks and crashes. A
   * reader of the detector only, so a recorded flight replays the same. */
  let jamScore = null;
  const trickDetector = new TrickDetector((trick) => {
    score.land(trick);
    if (jamScore) {
      jamScore.land(trick);
    }
  });
  function scoreCrash() {
    score.crash();
    if (jamScore) {
      jamScore.crash();
    }
  }
  /*
   * Called on every map change. Race courses get no trick targets. Heights
   * come from the map's own ground query so a wall modelled deep into the
   * terrain is measured from where it meets the ground.
   *
   * Every exit sets obstacles AND solids: leaving solids from the previous
   * freestyle map would let the detector query a world no longer loaded.
   */
  function rebuildObstacles() {
    const col = view && view.mode === 'freestyle' ? view.colliders : null;
    obstacles = col ? deriveObstacles(col, (x, z, fromY) => view.height(x, z, fromY)) : null;
    trickDetector.obstacles = obstacles;
    trickDetector.solids = col ? solidsQuery(col) : null;
  }
  /* TrickDetector wants plain answers: a gap distance, and an axis record
   * {gap,dx,dy,dz,cx,cy,cz} or null. Colliders.axisAt instead reports a
   * hit as a boolean and leaves the record in its own fields, so it is
   * copied out here. The detector uses these to ask whether anything solid
   * sat inside the figure flown, and along which line. */
  function solidsQuery(col) {
    return {
      gapAt: (x, y, z, r) => col.gapAt(x, y, z, r),
      axisAt(x, y, z, r) {
        if (!col.axisAt(x, y, z, r)) {
          return null;
        }
        return {
          gap: col.axisGap,
          dx: col.axisDx,
          dy: col.axisDy,
          dz: col.axisDz,
          cx: col.axisCx,
          cy: col.axisCy,
          cz: col.axisCz,
        };
      },
    };
  }
  /* The boot map skips swapMap, so it is set up here; this call has to
   * follow the trickDetector const or it hits the temporal dead zone. */
  rebuildObstacles();
  const racePrev = new THREE.Vector3();
  let raceHasPrev = false;

  /*
   * Ghost laps: a semi-transparent replay to race against. It only reads
   * the physics (the recorder samples the interpolated pose that rendering
   * and gate scoring already use; the replay craft has no collisions), so
   * it cannot affect a flight. Both recording and playback measure time
   * from the start gate crossing, so playback is lap clock lookups and
   * frame rate does not matter. Sources: best lap this session, last lap,
   * or a board entry with a recording. Session ghosts are memory only.
   * settings.ghost picks between the session sources; a board ghost is a
   * per-visit choice because it belongs to one course.
   */
  const ghostRecorder = new GhostRecorder();
  const ghostBook = new GhostBook();
  let ghostRig = buildGhostCraft();
  /* The ghost rig outlives maps, but it sits inside the current map's
   * scene, and a map's teardown frees everything in its scene graph,
   * name tag texture included. Registering it here makes teardown detach
   * it instead, since re-adding it after a free would draw freed GPU
   * resources. */
  shell.keepAcrossMaps(ghostRig.group);
  /* The ghost is the seated aircraft again, so it is rebuilt when that
   * changes: a wing chasing a wing's lap, not a quad. Between runs only,
   * from syncCraftScale, the same moment the hero craft swaps. buildShell
   * draws DEFAULT_AIRFRAME's. */
  let ghostRigAirframe = DEFAULT_AIRFRAME;
  function swapGhostRig() {
    if (ghostRigAirframe === runAirframe) {
      return;
    }
    const old = ghostRig;
    const next = buildGhostCraft(runAirframe);
    next.group.position.copy(old.group.position);
    next.group.quaternion.copy(old.group.quaternion);
    next.group.visible = old.group.visible;
    next.setPresence(0);
    if (ghostLap) {
      next.setLabel(ghostLabelFor(ghostLap));
    }
    if (old.group.parent) {
      old.group.parent.add(next.group);
      old.group.parent.remove(old.group);
    }
    shell.keepAcrossMaps(next.group);
    disposeSceneGraph(old.group);
    ghostRig = next;
    ghostRigAirframe = runAirframe;
  }

  /*
   * Live: the other pilots on this board track, each a ghost craft fed from
   * the room's socket. peers is by the room's peer id; the sender resamples
   * this craft's rendered pose onto the ghost rate and the link carries it.
   * See src/share/live.js and LiveGhost in src/game/ghost.js.
   */
  const livePeers = new Map();
  const livePose = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
  const liveLink = createLiveLink({
    onWelcome: (id, peers) => {
      for (const p of peers) {
        livePeerJoin(p.id, p.name);
      }
      syncLiveRow();
    },
    onJoin: (id, name) => {
      livePeerJoin(id, name);
      syncLiveRow();
    },
    onLeave: (id) => {
      livePeerLeave(id);
      syncLiveRow();
    },
    onFrame: (frame, wallMs) => {
      const peer = livePeers.get(frame.peer);
      if (peer) {
        peer.live.push(frame, wallMs);
      }
    },
    onState: () => syncLiveRow(),
  });
  const liveSender = new LiveSender((t, x, y, z, qx, qy, qz, qw) => {
    liveLink.send(encodeLiveFrame(t, x, y, z, qx, qy, qz, qw));
  });

  function livePeerJoin(id, name) {
    if (livePeers.has(id)) {
      livePeers.get(id).rig.setLabel(name);
      return;
    }
    const rig = buildGhostCraft();
    rig.setLabel(name);
    rig.setPresence(0);
    shell.keepAcrossMaps(rig.group);
    livePeers.set(id, { rig, live: new LiveGhost(), name });
  }

  function livePeerLeave(id) {
    const peer = livePeers.get(id);
    if (!peer) {
      return;
    }
    peer.rig.setPresence(0);
    if (peer.rig.group.parent) {
      peer.rig.group.parent.remove(peer.rig.group);
    }
    livePeers.delete(id);
  }

  function livePeersClear() {
    for (const id of [...livePeers.keys()]) {
      livePeerLeave(id);
    }
  }

  /* Whether this track has a room: a board track, not freestyle. */
  function liveListing() {
    const listing = ghostListing();
    return listing && !race.freestyle && listing.shareId ? listing : null;
  }

  function syncLive() {
    const listing = liveListing();
    if (!listing || ui.settings.live !== 'on') {
      liveLink.leave();
      liveSender.reset();
      livePeersClear();
      syncLiveRow();
      return;
    }
    liveLink.join({ origin: listing.board, trackId: listing.shareId, name: readPilotName() || str('ui.pilot') });
    syncLiveRow();
  }

  function syncLiveRow() {
    if (!liveListing()) {
      ui.setLiveRow(null);
      return;
    }
    const on = ui.settings.live === 'on';
    const state = liveLink.state();
    let value = str('main.live_off');
    if (on) {
      value = state === 'open'
        ? (livePeers.size ? str('main.live_here', { n: livePeers.size }) : str('main.alone'))
        : (state === 'failed' ? str('main.no_room') : str('main.joining'));
    }
    ui.setLiveRow({
      value,
      note: on
        ? str('main.other_pilots_flying_this_track_right')
        : str('main.see_the_other_pilots_flying_this'),
      cycle: () => {
        ui.settings.live = ui.settings.live === 'on' ? 'off' : 'on';
        ui.persistSettings();
        syncLive();
      },
    });
  }

  /* Every frame: send this craft, pose the peers. wallMs is the render
   * clock; peers are posed LIVE_DELAY_MS behind their sender. */
  function liveFrame(wallMs) {
    if (liveLink.state() !== 'open') {
      return;
    }
    if (mode === 'flight') {
      liveSender.feed(wallMs, pCurr.x, pCurr.y, pCurr.z, qPrev.x, qPrev.y, qPrev.z, qPrev.w);
    }
    for (const peer of livePeers.values()) {
      const presence = peer.live.sample(wallMs, livePose);
      peer.rig.group.position.set(livePose.px, livePose.py, livePose.pz);
      peer.rig.group.quaternion.set(livePose.qx, livePose.qy, livePose.qz, livePose.qw);
      peer.rig.setPresence(presence);
      if (presence > 0 && shell.quad.parent && peer.rig.group.parent !== shell.quad.parent) {
        shell.quad.parent.add(peer.rig.group);
      }
    }
  }

  /*
   * FLY WITH FRIENDS: a private room on the rooms Worker (edge/rooms/),
   * the socket in src/share/rooms.js, the design in
   * docs/MULTIPLAYER-PLAN.md. Everything here is downstream of the physics,
   * the same standing as the ghost: the sender reads the pose the renderer
   * already drew, the peers are models nothing collides with, and a pilot
   * who never opens a room never builds any of it. The one thing a room
   * changes about a flight is where it starts (roomSlot, above).
   *
   * peers is by seat: { seat, name, profile, track, last, rig, figure,
   * away }, away why it is not drawn (roomDrawPeer), or null.
   * The rig is built when the peer is first drawn and rebuilt when their
   * airframe, paint or add ons change; a peer flying another world is kept
   * and not drawn.
   */
  const roomPeers = new Map();
  const roomDrawn = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  const roomVel = new THREE.Vector3();
  const roomQLast = new THREE.Quaternion();
  const roomQStep = new THREE.Quaternion();
  let roomSeq = 0;
  let roomNextSend = 0;
  let roomLastSendT = null;
  /* The last pose sent to the room, as sent: what it judges the warhead by. */
  let roomSentPose = null;
  /* This frame's plant steps on the room clock (roomPoseFrame), or null
   * when the plant is not flying this frame and the frame sends. */
  let roomPoseMap = null;
  const roomStepPos = new THREE.Vector3();
  const roomStepQuat = new THREE.Quaternion();
  /* The wall ms, frames, and frames over FRAME_DT_MAX since the last
   * SLOW_WINDOW_MS (roomSlowFrame), and how often the pilot was told. */
  const roomSlow = { wall: 0, frames: 0, over: 0, said: 0 };
  let roomProfileSent = '';
  let roomProfileCheckAt = 0;
  let roomNote = null; /* a one off line under the code row */
  let roomRefusal = null; /* { text, untilMs }: why the room refused a host's action */
  let roomNameOffer = null; /* three picker names, while the screen is open */

  /* A picker name's three indices, or a signed in pilot's callsign
   * (src/share/rooms.js shownName), which is shown as it is. */
  function roomName(pick) {
    if (typeof pick === 'string') {
      return pick;
    }
    if (pick && pick.bot) {
      return str('rooms.bot_name', { name: roomName(pick.bot) });
    }
    return str('rooms.name', { adj: str(`rooms.adj.${pick[0]}`), animal: str(`rooms.animal.${pick[1]}`), n: pick[2] });
  }
  /* Whether a peer is an AI pilot the room flies (shownName). */
  function roomBot(peer) {
    return Boolean(peer.name && peer.name.bot);
  }
  /* The people here, this pilot too, and the room's AI pilots apart:
   * "n here" is people, the AI pilots a "+n" after it, since one leaves
   * for every person who comes (edge/rooms/roombots.js). */
  function roomHere() {
    const bots = [...roomPeers.values()].filter(roomBot).length;
    return { n: roomPeers.size + 1 - bots, bots };
  }
  function roomHereText(text, bots) {
    return bots ? `${text}, ${plural('count.ai_pilots_extra', bots)}` : text;
  }
  function roomProfile() {
    const status = roomStatus();
    /* Off the air in a war room (its lobby, its briefing) the aircraft the
     * war will seat this pilot in, so the others' lobby names it and not
     * whatever was flown before; in the air, what flies, which the poses
     * and the room's hull are of. */
    const id = status && inWarRoom() ? warCraftOf(ui.settings) : runAirframe;
    const parts = PROPS[id] ? partsEntry(ui.settings.parts, id) : null;
    return {
      airframe: id,
      map: view ? view.id : worldId(),
      figure: figurePick(),
      /* Packed (configs/paint.js packEntry), so MAX_DECALS layers fit the
       * room's PROFILE_MAX_BYTES. */
      livery: (ui.settings.livery && ui.settings.livery[liveryKey(id)]) ? packEntry(ui.settings.livery[liveryKey(id)]) : null,
      parts: parts ? { prop: parts.prop, addons: parts.addons } : null,
      ...(ui.roomGame ? { game: ui.roomGame } : {}),
      ...(status ? { status } : {}),
    };
  }
  /* Why this pilot sends no poses (ROOM_STATUSES in src/share/roomwire.js),
   * for the others' marks, or null while flying. */
  function roomStatus() {
    if (document.hidden) {
      return 'hidden';
    }
    if (!mapReady || swapInFlight) {
      return 'loading';
    }
    if (mode === 'replay') {
      return 'crashcam';
    }
    if (mode === 'flight' && ui.screen === 'flight') {
      return null;
    }
    /* A run paused under the settings it opened is still a pause. */
    return mode === 'paused' ? 'paused' : 'menu';
  }
  /* The profile to the room if it changed since the room last heard it. */
  function roomTellProfile() {
    if (roomLinkState.state().phase !== 'open') {
      return;
    }
    const p = roomProfile();
    const key = JSON.stringify(p);
    if (key !== roomProfileSent) {
      roomLinkState.sendProfile(p);
      roomProfileSent = key;
    }
  }
  /* The room's race (src/share/roomrace.js), wired below at RACING
   * TOGETHER. Its messages go out on the room's socket. */
  const roomRace = createRoomRace((obj) => roomLinkState.send(obj));
  /* Catch the Ace (src/share/roomtag.js), wired below at CATCH THE ACE. */
  const roomTag = createRoomTag((obj) => roomLinkState.send(obj));
  /* Trick Battle (src/share/roomjam.js, docs/JAM-PLAN.md). */
  const roomJam = createRoomJam((obj) => roomLinkState.send(obj));
  /* Defend Itaipu (src/share/roomwar.js), wired below at DEFEND ITAIPU. */
  const roomWar = createRoomWar((obj) => roomLinkState.send(obj));
  /* Ops missions (src/share/roomops.js), wired below at THE CAMERA BALL. */
  const opsSent = [];
  const roomOps = createRoomOps((obj) => {
    /* The last few, for the checks (window.__ops.sent). */
    opsSent.push(obj);
    if (opsSent.length > 50) {
      opsSent.shift();
    }
    roomLinkState.send(obj);
  });
  /* The night raid's power outages (src/share/war/grid.js): which of the
   * map's lights are out, from the war's events and view, the same on
   * every screen. */
  const warGrid = createWarGrid();
  /*
   * A COMBAT QUAD'S PAYLOAD AND ACCESSORIES (configs/combat.js,
   * docs/COMBAT-DRONES.md): the pilot's choice, except in a war, where the
   * payload is the warhead the room holds for this seat, so what is seen
   * and flown is what goes off. The choice the room is sent is the
   * campaign's poll (src/ui/campaign.js craftWarhead). Null for every
   * other aircraft. The plant reads it at applyParts and the drawing at
   * every build.
   */
  function combatSeated(id) {
    const af = airframeById(id);
    const choice = combatChoice(af, ui.settings.combat ? ui.settings.combat[af.id] : null);
    if (!choice || !roomWar.on()) {
      return choice;
    }
    const l = roomWar.view().loadouts?.[roomWar.seat()];
    return { ...choice, payload: payloadForWarhead(af, l ? l.warhead : 'standard') };
  }
  setCombatSource(combatSeated);
  /* The plant an aircraft seats: its own, or on an aircraft pushed more
   * than one way (the Striker), the one its seated propulsion is
   * (configs/combat.js combatSimId). */
  function seatedSimId(id) {
    const af = airframeById(id);
    return af.combat ? combatSimId(af, combatSeated(af.id)) : af.simId;
  }
  /* The plant seated now, which a propulsion changes without the airframe
   * changing. The module starts on plant 0, the stage 1 verification
   * reference, which no aircraft in configs/airframes.js seats, so the
   * first applySettings always selects the pilot's plant. */
  let runSimId = 0;
  /* Each room game's name, for the room screen's heading when a room is
   * set up for one (a title card or Make a room's Game row). */
  const GAME_CARDS = { race: 'roombrowser.mode_race', tag: 'roomtag.section', combat: 'combat.card', jam: 'jam.card', war: 'war.card', free: 'ui.free_flight_card' };
  /*
   * THE BOOTLOADER OVER A ROOM LINK BEING RETRIED (src/ui/loading.js hold):
   * a room's socket that dropped, or a rooms server that said it was
   * restarting, holds the minimal loader over the menus until the link is
   * back or given up on. Only a link that had a room: a first join that
   * retries is the room browser's to show. Never over flight: a room is
   * peers, the run carries on through an outage on its own, and a pilot
   * under the screen would be flying blind; each retry asks again, so one
   * who takes off under it is let go at the next.
   */
  function roomLinkHold(st) {
    const retrying = st.phase === 'connecting' && (st.reason === 'retrying' || st.reason === 'restart')
      && Boolean(roomLinkState.state().welcome);
    if (retrying && ui.screen !== 'flight') {
      loading.hold(st.reason === 'restart' ? 'restart' : 'reconnect', str('loading.held_attempt', { n: st.attempt, of: st.attempts }));
    } else {
      loading.release();
    }
  }
  const roomLinkState = createRoomLink({
    onWelcome: (w) => {
      roomRace.onWelcome(w);
      roomTag.onWelcome(w);
      roomJam.onWelcome(w);
      roomWar.onWelcome(w);
      roomOps.onWelcome(w);
      roomPeersClear();
      for (const p of w.peers) {
        roomPeerJoin(p.seat, p.name, p.profile);
      }
      roomSlot = w.seat - 1;
      roomSafety.welcomed();
      voice.welcomed(w.seat);
      roomCombat.seated(w.seat, runAirframe);
      if (roomWreckSender) {
        roomWreckSender.resend();
      }
      roomGone.clear();
      roomSessionWelcome(w);
      roomBootLand(w);
      roomWarJoinGate(w);
      /* Crash damage is on in this room: a pilot already flying its world
       * with it off starts again, as a war's does (warBegin). */
      if (mode === 'flight' && damage.available && crashDamageWanted(ui.settings) !== runDamage && roomTagWorldReady(w.map)) {
        ui.onAction('restart');
      }
      ui.checkVersion();
      ui.refreshFriends();
    },
    onJoin: (seat, name, profile) => {
      roomGone.delete(seat);
      roomPeerJoin(seat, name, profile);
      ui.refreshFriends();
    },
    onLeave: (seat, dropped) => {
      const gone = roomPeers.get(seat);
      if (dropped && gone) {
        roomGone.set(seat, { name: gone.name, until: performance.now() + ROOM_GONE_MS });
      }
      roomPeerLeave(seat);
      roomSafety.left(seat);
      voice.peerLeft(seat);
      roomCombat.leave(seat);
      ui.refreshFriends();
    },
    /* Each phase takes the kinds it knows and passes over the rest. */
    onEvent: (ev) => {
      roomSafety.event(ev);
      roomEvent(ev);
      roomRace.onMessage(ev);
      roomCombat.onEvent(ev);
    },
    onReported: (seat) => {
      roomSafety.reported(seat);
      ui.refreshFriends();
    },
    onUnreported: (seat, undone) => {
      roomSafety.unreported(seat, undone);
      ui.refreshFriends();
    },
    onRoom: () => ui.refreshFriends(),
    onLobby: () => ui.refreshFriends(),
    onWorld: () => ui.refreshFriends(),
    onProfile: (seat, profile) => {
      const peer = roomPeers.get(seat);
      if (peer) {
        peer.profile = profile;
        ui.refreshFriends();
      }
    },
    onBatch: (batch) => {
      const now = roomLinkState.roomNow();
      for (const p of batch.poses) {
        const peer = roomPeers.get(p.seat);
        if (peer && now != null) {
          peer.track.push(p, now);
          peer.last = peer.track.newest();
        }
      }
    },
    onHit: (m) => roomHit(m),
    onHost: () => ui.refreshFriends(),
    onMessage: (m) => {
      if (m.type === 'voice') {
        voice.onMessage(m);
        return;
      }
      if (m.type === 'refused') {
        roomRefused(m.why);
        return;
      }
      if (m.type === 'combat') {
        roomCombat.onRound(m);
        ui.refreshFriends();
        return;
      }
      if (roomOps.onMessage(m)) {
        ui.refreshFriends();
        return;
      }
      if (roomRace.onMessage(m) || roomTag.onMessage(m) || roomJam.onMessage(m) || roomWar.onMessage(m)) {
        /* The room's word on this pilot's war start, said like a refusal. */
        /* Not the room's refusal of the aircraft a war just put this pilot
         * out of (warSeatCraft): only one still flown says it. */
        if (m.type === 'war' && m.error && !(m.error === 'airframe' && isWarAirframe(ui.settings.airframe))) {
          roomRefused(m.error === 'private' ? 'private' : `war_${m.error}`);
        }
        ui.refreshFriends();
      }
    },
    onBinary: (bytes) => {
      /* AGENTS first: the one binary the war sends, 30 times a second. */
      if (roomWar.onBinary(bytes) || roomCombat.onBinary(bytes)) {
        return;
      }
      const got = decodePartsRelay(bytes);
      const peer = got ? roomPeers.get(got.seat) : null;
      if (peer) {
        peer.wreckPieces = got.pieces;
        if (peer.wreck) {
          peer.wreck.pieces(got.pieces, performance.now());
        }
      }
    },
    onState: (st) => {
      roomLinkHold(st);
      if (st.phase !== 'open') {
        roomSlot = -1;
      }
      /* The room would not seat this session: one that ended elsewhere is
       * let go by asking the accounts server, and then the sign in is
       * asked for, with this room to rejoin after it. */
      if (st.phase === 'failed' && st.reason === 'signin' && st.code) {
        const code = st.code;
        checkSession().then((standing) => {
          if (standing === false) {
            needSignIn(() => roomLinkState.join(code));
          }
        });
      }
      if (st.phase === 'idle' || st.phase === 'failed') {
        roomPeersClear();
        roomGone.clear();
        roomSummon = null;
        roomSafety.clear();
        voice.roomClosed();
        roomRace.clear();
        roomRaceRunId = null;
        roomRaceHud.update(null);
        roomTag.clear();
        roomJam.clear();
        jamScore = null;
        roomJamRun = null;
        roomJamHud.update(null);
        roomTagRunId = null;
        roomTagHud.update(null);
        tagMarkPeers();
        roomCombat.clear();
        combatLayer.clear();
        combatHud.update(roomCombat.round(), 0, null, 0, 0);
        roomWar.clear();
        roomOps.clear();
        warLeave();
      }
      roomBrowser.watch(roomBrowsing());
      ui.refreshFriends();
    },
    /* No room is made or joined without an account (a link, a code, a
     * reload's rejoin, the lobby's rows): src/share/account.js. */
    gate: (resume) => needSignIn(resume),
  }, () => {
    /* What the room is told on every hello is what roomFrame compares
     * with. Starting that from nothing instead lost the first change: a
     * pilot the welcome seated in the room's world, whose hello had named
     * the world they were leaving, stayed there for the room, and nobody
     * drew them while they drew everybody. */
    const profile = roomProfile();
    roomProfileSent = JSON.stringify(profile);
    return { name: namePick(), profile };
  });
  const roomSafety = createRoomSafety((m) => roomLinkState.send(m), (seat) => {
    const peer = roomPeers.get(seat);
    return peer ? roomName(peer.name) : null;
  }, () => ui.refreshFriends());
  /* VOICE CHAT (src/share/voice.js, src/ui/voiceui.js): off until the pilot
   * turns it on in the room screen, never to a pilot muted or reported. */
  const voice = createVoice({ send: (m) => roomLinkState.send(m), isMuted: (seat) => roomSafety.isMuted(seat) });
  const voiceUi = createVoiceUi(voice, input, () => ui.refreshFriends(), {
    acknowledged: () => ui.settings.voiceReplayAck === true,
    acknowledge: () => {
      ui.settings.voiceReplayAck = true;
      ui.persistSettings();
    },
    confirm: (o) => ui.askConfirm(o),
  });
  /* Harness only, for scripts/voicechat-two-page.js. */
  window.__voice = voice;
  window.__voiceUi = voiceUi;
  /* The room browser and Make a room (src/ui/roombrowser.js), whose list
   * is fetched only while somebody could be reading it. */
  const roomBrowser = createRoomBrowser({
    ui, link: roomLinkState, roomName, here: () => seatWorld(), preset: () => ui.roomGame || null,
    war: (room) => warEnter(room),
    pilots: () => roomPeers.size + 1,
    missions: () => (campaignRef ? campaignRef.playable() : []),
    missionNumber: (id) => Math.max(1, missionNumber(id)),
  });
  /* The title too, for its rooms panel (ui.js renderTitleRooms). */
  const roomBrowsing = () => ui.screen === 'rooms' || ui.screen === 'title' || (ui.screen === 'friends' && roomLinkState.state().phase !== 'open');
  ui.roomRows = (screen) => roomBrowser.rows(screen);
  ui.titleRooms = (home) => roomBrowser.titleItems(home);
  /* The page opens on the title, with no screen change to start the poll. */
  roomBrowser.watch(roomBrowsing());
  const screenChanged = ui.onScreenChange;
  ui.onScreenChange = (screen) => {
    screenChanged(screen);
    roomBrowser.opened(screen);
    roomBrowser.watch(roomBrowsing());
  };

  /*
   * COMBAT (src/share/roomcombat.js, docs/COMBAT-PLAN.md): fifty metres of
   * toilet paper behind every pilot while a round is out. This pilot's is
   * stepped on every plant step (combatStep, in the step loop) with the
   * pose of that step; the plant never sees it. Every streamer is drawn by
   * combatLayer, the round by combatHud.
   */
  const roomCombat = createRoomCombat(roomLinkState);
  const combatLayer = createStreamerLayer(paperFloorAt);
  const combatNameOf = (seat) => {
    if (seat === roomCombat.seat()) {
      return str('friends.you', { name: roomName(ownName()) });
    }
    const peer = roomPeers.get(seat);
    return peer ? roomName(peer.name) : '';
  };
  const combatHud = createCombatHud(combatNameOf);
  const combatPos = new THREE.Vector3();
  const combatQuat = new THREE.Quaternion();
  const combatVel = new THREE.Vector3();
  const combatV = [0, 0, 0];
  let combatStepped = false;
  /* How many times the plant has started again (resetCraft: a new
   * flight, R, a crash recovery), and how many the room has been told of.
   * Read once a frame, not per step, because a craft back on the pad is
   * not stepped until it takes off, and the tail is owed from the
   * restart. A count, not the plant's clock going back: a craft reset
   * before its clock has run (held, or R twice on the pad) is a restart
   * too. */
  let plantStarts = 0;
  let combatStarts = 0;
  function combatStep(st) {
    combatStepped = true;
    poseFromState(st, combatPos);
    simQuatToThree(st[7], st[8], st[9], st[10], combatQuat);
    combatQuat.premultiply(qSpawn);
    simPosToThree(st[4], st[5], st[6], combatVel).applyQuaternion(qSpawn);
    combatV[0] = combatVel.x;
    combatV[1] = combatVel.y;
    combatV[2] = combatVel.z;
    roomCombat.step(combatPos.x, combatPos.y, combatPos.z, combatQuat.x, combatQuat.y, combatQuat.z, combatQuat.w, combatV, groundAt);
  }
  let combatHudAt = 0;
  /* Once a frame in a room: this pilot's paper to the room, every paper
   * drawn, the cuts shown, the round on screen. */
  function combatFrame(now, wallMs, scene, dt) {
    for (const n of roomCombat.news()) {
      if (n.kind === 'cut') {
        /* The owner's SCHWING: on every screen, loudest for the pilot who
         * made the cut, a big +100 on theirs. */
        const me = roomCombat.seat();
        const mine = n.ev.cutter === me;
        const key = n.ev.victim === me ? 'combat.cut_you' : `combat.${mine ? 'you_' : ''}cut_line`;
        combatLayer.burst(n.ev.p, streamerColour(n.ev.victim), mine ? 1 : 0.6);
        audio.schwing(mine ? 1 : 0.35);
        if (mine && n.ev.points > 0) {
          combatHud.shout(str('combat.schwing', { points: n.ev.points }));
        }
        combatHud.say(str(key, { cutter: combatNameOf(n.ev.cutter), victim: combatNameOf(n.ev.victim), points: n.ev.points }));
      } else if (n.state === 'on') {
        combatHud.say(str('combat.go'));
        /* A pilot who came while the round was on (a join, the title's
         * panel) goes up into it; one flying already flies on. */
        roomCall('game');
      } else if (n.state === 'countdown') {
        /* A round's countdown is the time to take off in, so every pilot
         * in the room goes up with it, from wherever they are (roomCall).
         * A pilot already flying the room's world flies on. */
        roomCall('game');
      }
    }
    const paper = roomCombat.paper();
    for (const n of paper ? paper.news.splice(0, paper.news.length) : []) {
      if (n.kind === 'tear') {
        /* The owner's rule, said out loud: over 120 km/h the paper goes. */
        combatHud.shout(str('combat.tore', { speed: Math.round((n.speed || 0) * 3.6) }), 'warn');
      }
    }
    if (wallMs > combatHudAt) {
      combatHudAt = wallMs + 200;
      /* Not over the crash cam's replay, which is another moment. */
      combatHud.update(mode === 'replay' ? { state: 'idle', scores: [] } : roomCombat.round(), roomCombat.seat(), now,
        paper ? paper.length() : 0, paper ? paper.towTension() : 0, speedNow);
    }
    if (!roomCombat.out()) {
      if (combatLayer.count()) {
        combatLayer.clear();
      }
      return;
    }
    if (scene && combatLayer.group.parent !== scene) {
      scene.add(combatLayer.group);
    }
    /* The crash cam's replay draws the room as it was, its paper too
     * (src/replay/paperscene.js), so the paper as it is now is put away
     * with the live peers (roomDrawPeer) until flight resumes. */
    combatLayer.group.visible = mode !== 'replay';
    if (mode === 'flight' && combatStarts !== plantStarts) {
      combatStarts = plantStarts;
      roomCombat.respawned();
    }
    if (!combatStepped) {
      roomCombat.idle(dt * 1000, pCurr.x, pCurr.y, pCurr.z, qPrev.x, qPrev.y, qPrev.z, qPrev.w, groundAt);
    }
    combatStepped = false;
    roomCombat.send(now);
    combatLayer.view(shell.camera, shell.canvas.clientHeight || 720);
    roomCombat.draw(combatLayer, {
      px: pCurr.x, py: pCurr.y, pz: pCurr.z, qx: qPrev.x, qy: qPrev.y, qz: qPrev.z, qw: qPrev.w,
    }, (seat) => {
      const peer = roomPeers.get(seat);
      return peer && peer.drawnPose ? peer.drawnPose : null;
    }, (seat) => {
      const peer = roomPeers.get(seat);
      return peer ? peer.profile.airframe : null;
    }, now, wallMs / 1000);
    combatLayer.update(dt);
  }
  /* The Fly with friends rows: the room's host, public or private, starts
   * and stops a round; everyone sees where it is. `lead` is the room set
   * up for combat, by its title card or at Make a room: the five minute
   * start row is then the screen's primary, under the cursor, one press
   * from a round.
   *
   * friends- actions (#143), because that prefix is what the menu hands
   * to the shell (src/ui/ui.js act). */
  function combatRows(host, w, lead) {
    if (!w) {
      return [];
    }
    const r = roomCombat.round();
    const now = roomLinkState.roomNow();
    /* Continuous play: between rounds the next one is counting down, and
     * the host's row stops it. */
    const next = r.state === 'over' && r.nextAt > 0 && now != null;
    const mmss = (ms) => {
      const sec = Math.max(0, Math.ceil(ms / 1000));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };
    const state = r.state === 'on' && now != null
      ? str('combat.state_on', { minutes: Math.max(0, Math.ceil((r.endsAt - now) / 60000)) })
      : (next ? str('combat.state_next', { time: mmss(r.nextAt - now) }) : str(`combat.state_${r.state}`));
    const head = { label: str('combat.card'), section: true };
    if (host && (r.state === 'idle' || (r.state === 'over' && !next))) {
      return [head, ...[5, 3].map((minutes, i) => ({
        label: str('combat.start', { minutes }),
        note: str('combat.row_note'),
        action: `friends-combat-${minutes}`,
        primary: lead && i === 0,
      }))];
    }
    if (host) {
      return [head, { label: str('combat.stop'), value: state, note: str('combat.stop_note'), action: 'friends-combat-stop' }];
    }
    return [head, {
      label: str('combat.row'), value: state, note: str(r.state === 'idle' ? 'combat.waiting' : 'combat.row_note'), info: true,
    }];
  }

  /* Trick Battle's block on the room screen (docs/JAM-PLAN.md): the host
   * starts one in passing at a run length, or ends the one on. */
  function jamRows(host, w, lead) {
    if (!w) {
      return [];
    }
    const head = { label: str('jam.card'), section: true };
    const on = roomJam.on();
    const err = roomJam.error();
    if (host && !on) {
      return [head, ...modeById('jam').setting.choices.map((seconds, i) => ({
        label: str('jam.start', { s: seconds }),
        note: err ? str(`jam.error_${err}`) : str('jam.row_note'),
        action: `friends-jam-${seconds}`,
        primary: lead && i === 0,
      }))];
    }
    const v = roomJam.view();
    const state = on ? str('jam.state_on', { n: v.round, of: v.rounds }) : '';
    if (host) {
      return [head, { label: str('jam.stop'), value: state, note: str('jam.stop_note'), action: 'friends-jam-end' }];
    }
    return [head, { label: str('jam.card'), value: state, note: str(on ? 'jam.row_note' : 'jam.waiting'), info: true }];
  }

  /*
   * DEFEND ITAIPU (docs/WARFARE-PLAN.md, docs/WAR-WIRING.md): the room's
   * war, the client's half in roomWar. What this shell does with it:
   *
   *   the menu     warRows and warStart: the host's row, in a private room
   *                on the Itaipu map only, behind one screen saying what it
   *                is, read once per profile (section 9)
   *   the frame    roomWarFrame, in roomFrame at the room clock: the
   *                attackers drawn, deaths and warheads burst, targets set
   *                burning, the HUD and Crest Control's radio fed, and the
   *                pilot put in the air when a war begins
   *   the link     untouched: a war flies on the pilot's own link preset,
   *                exactly as outside one (the owner took the signal and
   *                jamming out on 2026-09-29, docs/WARFARE-PLAN.md 6.1)
   *   the plant    warBoomMine breaks this craft on its own warhead; a war
   *                forces crash damage on between runs (applyCrashMode)
   *   rounds       out of airframes for the round: warSpectating, and the
   *                camera follows a teammate (warWatch); the result card
   *                (warRoundCard) and everybody relaunched at the next
   *   the booms    warBoomEvent: every kill, warhead and hit target is an
   *                explosion (src/render/explosion.js) in the scene, so it
   *                is in the FPV feed, the chase view and the crash cam's
   *                replay (crashCam.tapBooms); its sound (audio.boom); and
   *                for this pilot's own warhead a screen flash and a shake,
   *                the goggles held WAR_FEED_HOLD_MS on the fireball before
   *                the camera goes with the rest
   *
   * Everything that reaches the plant goes through sim.e, the crash cam's
   * journal (src/replay/journal.js), so a take over flies it again to the
   * bit; the crash cam's replay draws what it recorded and none of this.
   */
  const WAR_MISSION = 'itaipu-1';
  /* ms of a live war the take-off line stays up for (warTakeoffHintDone). */
  const WAR_TAKEOFF_HINT_MS = 30000;
  /* The one map the war runs on (section 9). */
  const WAR_MAP = 'itaipu';
  const WAR_STATES = ['lobby', 'briefing', 'countdown', 'live', 'won', 'lost', 'ended'];
  /* How long the end banner stands before everybody is back in the lobby. */
  const LOBBY_BACK_MS = 8000;
  /*
   * THE LOADOUT'S SPEED (edge/rooms/war.js parseLoadout): the room echoes
   * each seat's speedMul (1 to 1.15) in the view's loadouts, and this
   * pilot flies its own with the plant's boost while a war counts down or
   * runs, 1 otherwise (between wars, and once the pilot has left the
   * room: the view is then the lobby's). tagBoost sets the plant with it,
   * so the crash cam's journal keeps it like the chase boost.
   */
  /*
   * THE MISSION'S TIME OF DAY (its `time`, TECH-NEEDS T1.11: First Light's
   * morning, the night raid's night): the world is built at that time
   * (src/maps/itaipu.js options.time, through syncWorld) while a pilot
   * waits on the room's lobby with that mission named, so the briefing
   * seldom has to rebuild it (the frame loop stops while a world is
   * built), and from the briefing whatever the lobby; at night the
   * attackers wear nav lights. It stays so over the mission's end and its
   * result, so the banner is not hidden behind a rebuild; the map's own
   * time comes back with a mission that has none, or when the room is
   * left (its view is the lobby's, and there is no lobby). Every pilot's
   * screen does this from the room, so all of them fly the same light.
   */
  let warTime = null;
  /* Each switch, its room ms and when the rebuild was done, for checks. */
  const warTimeLog = [];
  function warTimeFrame() {
    /*
     * A WAR ROOM'S WORLD IS THE ROOM'S (docs/FLOW-AUDIT.md rules 2 and 3):
     * the title's world and the builder's end on entering one, by any way
     * in (Play, a link, Rooms, a reload), and the room's world is built
     * under its lobby. The title's Swiss valley used to stay up through
     * the lobby, so syncWorld rebuilt it at the mission's time and the
     * briefing's film flew over Switzerland (the owner, 2026-10-04).
     */
    if ((lobbyGame() === 'war' || roomWar.view().state !== 'lobby') && (titleWorld || buildWorld)) {
      titleWorld = null;
      buildWorld = null;
      paintBest();
      syncWorld();
    }
    const lobby = ui.screen === 'friends' && lobbyGame() === 'war' ? gameLobby() : null;
    const time = lobby ? missionTime(WAR_MISSIONS[lobby.mission]) : roomWar.view().state !== 'lobby' ? roomWar.time() : null;
    if (time === warTime) {
      return;
    }
    warTime = time;
    const night = time === 'night';
    warAttackers.setNavLights(night);
    const entry = {
      time, night, at: roomLinkState.roomNow(), state: roomWar.view().state, done: null,
    };
    warTimeLog.push(entry);
    syncWorld().then(() => {
      entry.done = roomLinkState.roomNow();
    });
  }

  function warSpeedMul() {
    if (!roomWar.on()) {
      return 1;
    }
    const l = roomWar.view().loadouts?.[roomWar.seat()];
    return l && Number.isFinite(l.speedMul) ? l.speedMul : 1;
  }
  /* The end banner's restart: the host starts the same mission again,
   * straight to the countdown; the room keeps the host's loadout. A host
   * handed the room by a leaving one may never have consented. */
  const warHud = createWarHud(roomSeatName, {
    host: () => roomHost(roomLinkState.state().welcome),
    go: async (v) => {
      if (await warConsented()) {
        /* A lost mission again from the stage it was lost in. */
        roomWar.start(v.mission, { from: v.state === 'lost' && v.checkpoint ? 'checkpoint' : null });
      }
    },
    back: () => (lobbyBackAt != null && gameLobby() ? Math.max(0, Math.ceil((lobbyBackAt - performance.now()) / 1000)) : null),
  });
  /* Off the flight screen at once, not at the next frame (roomWarFrame
   * keeps it after): a frame can be a second long (war-card-check counted
   * one in the pause's first second), and the callouts stood over the
   * pause menu for it. */
  const warScreenChanged = ui.onScreenChange;
  ui.onScreenChange = (screen) => {
    warScreenChanged(screen);
    if (screen !== 'flight') {
      warHud.drawn(false);
    }
  };
  const warRoundCard = createWarRoundCard(roomSeatName);
  const warMarkers = createWarMarkers(shell.camera, shell.renderer.domElement);
  /* One marker an object: the Avionics HUD's boxes, by reference. */
  warMarkers.setClaims(avionicsHud.claims);
  const warCalls = createWarCalls();
  /* The events of each frame as they were taken, for window.__war. */
  const warLog = [];
  const WAR_LOG_MAX = 400;
  /* The war this shell has begun for (warBegin), by roomWar.match(). */
  let warBegunId = null;
  let warHudAt = 0;
  let warDrawnAt = null;
  /* Target id -> the room ms it was last hit, -Infinity for one hit before
   * this screen heard (src/share/war/world.js burnAt says fire or smoke). */
  const warBurning = new Map();
  /* Target id -> the room ms the room's damage first broke something off
   * it (src/render/breakage.js onBurn). */
  const warDamage = new Map();
  /* What the replay has the structures showing ({ seqs, t }), and
   * whether breakage's hooks belong to it (warBreakageAt), else null and
   * false: the live war's. */
  let warBreakageShown = null;
  let warBreakageReplay = false;
  /* The room ms this frame's war is drawn at (roomWarFrame's `now`), for
   * the crash cam's tap: sampling the room clock again would put the
   * map's row a fraction of a ms off the attackers' and the live map's. */
  let warFrameNow = null;
  /* Harness only (window.__warMapLog): each live frame's map, while on. */
  let warMapLog = null;
  const WAR_MAP_LOG_MAX = 20000;
  /* A defender's warhead, and a target hit, as explosion sizes. */
  const WAR_BOOM_SIZE = 1.6;
  const WAR_IMPACT_SIZE = 2.6;
  /* THE GOGGLES OUTLIVE THE WARHEAD BY THIS MUCH. The owner, playing: "i
   * dont see an explosion though?" The warhead broke every part at once,
   * the camera with them, so the feed was snow in the frame the fireball
   * began and black after it, and the chase view came 1.5 s later on a
   * clear sky. The camera, its antenna and the pack (and whatever holds
   * them) now go this long after the rest, so the pilot sees the fireball
   * swallow the picture before it goes to snow. */
  const WAR_FEED_HOLD_MS = 1100;
  const WAR_FEED_KINDS = ['camera', 'antenna', 'battery'];
  /* The feed's parts still to break: { at (wall ms), starts (plantStarts
   * then) }, or null. A reset in between keeps the new craft whole. */
  let warFeedCut = null;
  /* For the checks: how long the last warhead's goggles held, ms, and the
   * largest shake a boom gave the picture, rad. */
  let warFeedHeldMs = 0;
  let warShakePeak = 0;
  /* A boom this close shakes the picture and lights the screen, metres. */
  const WAR_NEAR_M = 120;
  /* How far ahead of the lens the pilot's own fireball is drawn, metres. */
  const WAR_MINE_AHEAD_M = 6;
  const warBoomFwd = new THREE.Vector3();
  const warBoomP = [0, 0, 0];
  /* The picture's shake from a boom: amplitude (rad), its clock, and the
   * rotation it adds this frame. */
  const warShake = {
    a: 0, t: 0, x: 0, y: 0, z: 0,
  };
  /* The loudest explosion heard this frame, rung once: its level over
   * distance, level and metres. */
  const warBoomHeard = { score: 0, level: 0, dist: 0, world: false };
  let warAudioPeak = 0;
  /* The damage mode is due again at the next reset: a war began or
   * ended. See applyCrashMode. */
  let warCrashDue = false;
  /* The teammate the camera follows while this pilot spectates, by seat,
   * or -1. */
  let warWatchSeat = -1;
  /* The round this shell last saw, to put everybody back in the air when
   * the next one starts. */
  let warRoundSeen = null;
  /* Keys that would put a spectator back in the air, or swap its
   * aircraft, and the two that step between teammates instead. */
  const WAR_WATCH_KEYS = new Set(['BracketLeft', 'BracketRight', 'KeyR', 'KeyX', 'Tab']);

  /* THIS PILOT'S AIRFRAMES SPENT FOR THE ROUND (docs/WARFARE-PLAN.md
   * 4.5, src/ui/warround.js): the pilot spectates until the round ends,
   * and the next one puts it back in the air (roomWarFrame). A room
   * without rounds never makes a spectator. */
  function warSpectating() {
    const r = roundOf(roomWar.view());
    const seat = roomWar.seat();
    return roomWar.live() && Boolean(r) && r.state === 'live' && r.airframes != null
      && spentOf(r, seat) >= allowanceOf(r, seat) && (mode === 'flight' || mode === 'paused');
  }

  /* In a room on its watch seat (edge/rooms/core.js watch,
   * docs/FLIGHTCLUB-PROGRESSION.md section 3): the war spectator's camera
   * on whoever flies, its own aircraft never shown or sent. */
  function roomWatching() {
    const st = roomLinkState.state();
    return st.phase === 'open' && Boolean(st.welcome && st.welcome.watch) && (mode === 'flight' || mode === 'paused');
  }

  /* A pilot of a Trick Battle while another flies its run: held on its
   * slot, the camera on the runner (docs/JAM-PLAN.md). */
  function jamWatching() {
    return roomJam.watching() && !roomWatching() && (mode === 'flight' || mode === 'paused');
  }

  /* The teammate to watch this frame, stepped by `step` through the ones
   * drawn in the air here in seat order, or kept while it still flies;
   * null when spectating none. */
  function warWatch(step = 0) {
    if (!warSpectating() && !roomWatching() && !jamWatching()) {
      warWatchSeat = -1;
      return null;
    }
    const runner = jamWatching() ? roomJam.view().runner : null;
    const seats = [...roomPeers.values()]
      .filter((p) => p.drawnPose && p.last && !(p.last.flags & FLAG_CRASHED) && (runner == null || p.seat === runner))
      .map((p) => p.seat)
      .sort((a, b) => a - b);
    if (!seats.length) {
      warWatchSeat = -1;
      return null;
    }
    const i = seats.indexOf(warWatchSeat);
    warWatchSeat = seats[i < 0 ? 0 : (i + step + seats.length) % seats.length];
    return roomPeers.get(warWatchSeat);
  }

  /* What the room judges this aircraft's warhead by (edge/rooms/war.js):
   * its hull, the last pose the room has of it, and the view's radius for
   * its seat; a spectator's is the watched teammate's. Null without them. */
  const warFuze = { hull: null, pose: null, radius: 0 };
  function warFuzeOf(v, watched) {
    const seat = watched ? watched.seat : roomWar.seat();
    const radius = v && v.fuze ? v.fuze[seat] : undefined;
    warFuze.hull = hullFor(watched ? watched.profile.airframe : runAirframe);
    warFuze.pose = watched ? watched.last : roomSentPose;
    warFuze.radius = radius;
    return radius != null && warFuze.hull && warFuze.pose ? warFuze : null;
  }

  /* The room would set this aircraft's warhead off on the primary track's
   * attacker: one is in range (the war markers) and the primary's line of
   * sight is within AVX_FUZE_RAD of it, or of its size where that is more.
   * The track never knows which attacker it is (src/avionics/tracks.js),
   * so the line of sight is the match. */
  const AVX_FUZE_RAD = 0.2;
  function avxFuzeOn(snap) {
    const p = warMarkers.inRangeAt();
    const prim = p && snap.primaryId != null ? snap.tracks.find((t) => t.id === snap.primaryId) : null;
    if (!prim) {
      return false;
    }
    const c = shell.camera.position;
    const dx = p[0] - c.x;
    const dy = p[1] - c.y;
    const dz = p[2] - c.z;
    const d = Math.hypot(dx, dy, dz);
    const cos = (dx * prim.losW[0] + dy * prim.losW[1] + dz * prim.losW[2]) / Math.max(d, 1e-6);
    return cos >= Math.cos(Math.max(AVX_FUZE_RAD, prim.sizeRad));
  }

  function warWatchBanner() {
    const peer = warWatch();
    if (jamWatching()) {
      return peer ? str('jam.watching', { name: roomName(peer.name) }) : str('jam.watching_none');
    }
    if (roomWatching()) {
      return peer ? str('rooms.watching', { name: roomName(peer.name) }) : str('rooms.watching_none');
    }
    return peer ? str('war.out', { name: roomName(peer.name) }) : str('war.out_none');
  }

  /* Set once the campaign screen exists (further down); the start row
   * names the mission Play chose. */
  let campaignRef = null;

  /* The host's row, where the war may run: a private room on the Itaipu
   * map. A public room there gets warPublicRows instead. The title's card and Make a room reach it through warEnter. A
   * room made for the war leads with its start row, as the other games'
   * cards lead with theirs. */
  function warRows(host, w) {
    if (!w || w.map !== WAR_MAP) {
      return [];
    }
    const head = { label: str('war.card'), section: true };
    /* A public room runs the war only when it was made for it. */
    if (w.public && w.mode !== 'war') {
      return [head, ...warPublicRows(host)];
    }
    const v = roomWar.view();
    /* A state this build has no words for (a later build's) says none. */
    const state = WAR_STATES.includes(v.state) ? str(`war.state_${v.state}`) : '';
    if (host && !roomWar.on() && v.state !== 'briefing') {
      return [head, ...warInviteRows(), {
        label: str('war.start', { n: campaignRef ? campaignRef.selectedNumber(missionNumber(roomMission())) : missionNumber(roomMission()) }), ...(state && v.state !== 'lobby' ? { value: state } : {}), note: str('war.row_note'), action: 'friends-war-start',
        primary: ui.roomGame === 'war' || w.mode === 'war',
      }, ...warFreshRows(), { label: str('war.intro.watch'), note: str('war.intro.watch_note'), action: 'friends-war-intro' }];
    }
    if (host) {
      return [head, { label: str('war.stop'), value: state, note: str('war.stop_note'), action: 'friends-war-stop' }];
    }
    return [head, {
      label: str('war.row'), value: state, note: str(v.state === 'lobby' ? 'war.waiting' : 'war.row_note'), info: true,
    }];
  }

  /* Where the war may run, so where a room may say it is set up for it:
   * a private room on its map, or a public one made for it. */
  function warFits(w) {
    return Boolean(w) && w.map === WAR_MAP && (!w.public || w.mode === 'war');
  }

  /* The mission a room made for the war was made for (the welcome's), or
   * mission 1 (a room made by hand, or by a server from before). */
  function roomMission() {
    const w = roomLinkState.state().welcome;
    const id = w && w.lobby && w.lobby.mission ? w.lobby.mission : w && w.mission;
    return typeof id === 'string' && Object.hasOwn(WAR_MISSIONS, id) ? id : WAR_MISSION;
  }
  function missionNumber(id) {
    return Object.keys(WAR_MISSIONS).indexOf(id) + 1;
  }

  /*
   * THE LOBBY of a room made for a game (the war, combat, Catch the Ace),
   * between its rounds (the owner, 2026-10-01: "its not hard to make
   * people join a lobby and then start a mission, its on every single
   * game"; 2026-10-02, of combat and the Ace: "it should take me to the
   * lobby of the room"). It is that room's room screen: the panel over its
   * rows (ui.setWarLobby) says LOBBY, the round, when it starts and who is
   * ready; the rows are Ready, the host's Start now and the round's one
   * setting, the aircraft and Leave, nothing of free flight. The room
   * starts the round when everybody is ready, five seconds on, or 45
   * seconds after enough are ready (edge/rooms/gamelobby.js).
   *
   * LOBBY_GAMES: what the lobby does for each activity of the mode
   * registry (src/share/modes.js), by its id ('free' for free flight, a
   * room made for no game); what each activity IS (its setting's key and
   * values, its consent, whether it ends) is the registry's. on(), whether
   * a round is on as this screen knows it; ended(), whether the last one
   * is over; start, the host's Start now action, or null; begin(lobby),
   * what that Start now sends, or null; setting, the host's row for the
   * room's one setting between rounds (the war's mission, combat's
   * minutes, the Ace's goal): its key on the wire, its choices and its
   * label, or null;
   * rows(host), the game's own rows (the war's campaign, the race's
   * track); line, the panel's line under LOBBY.
   *
   * Every one is played alone as well (the owner, 2026-10-02: "ready to go
   * either single or multi"): Ready with nobody else starts the five
   * seconds (edge/rooms/gamelobby.js).
   */
  const LOBBY_GAMES = {
    war: {
      on: () => roomWar.on(),
      ended: () => ['won', 'lost', 'ended'].includes((roomWar.view() || {}).state),
      start: 'friends-war-start',
      begin: null,
      setting: {
        key: modeById('war').setting.key,
        choices: () => (campaignRef ? campaignRef.playable() : []),
        label: 'lobby.mission',
        note: 'lobby.mission_note',
        value: (id) => String(missionNumber(id)),
      },
      /* After a loss Start now and Deploy go back to the lost stage; the
       * host's way to the mission's start instead is a row of its own. */
      rows: (host) => [
        { label: str('lobby.campaign'), note: str('lobby.campaign_note'), action: 'friends-lobby-campaign' },
        ...(host ? warFreshRows() : []),
      ],
      line: (lobby) => {
        const mission = WAR_MISSIONS[lobby.mission] ? lobby.mission : roomMission();
        return str('lobby.mission_line', { n: missionNumber(mission), name: str(`campaign.m.${missionKey(mission)}`) });
      },
    },
    combat: {
      on: () => ['countdown', 'on'].includes(roomCombat.round().state),
      ended: () => roomCombat.round().state === 'over',
      start: 'friends-lobby-start',
      begin: (lobby) => roomCombat.start(lobby.minutes),
      setting: {
        key: modeById('combat').setting.key,
        choices: () => modeById('combat').setting.choices,
        label: 'lobby.minutes',
        note: 'lobby.minutes_note',
        value: (n) => str('lobby.minutes_value', { n }),
      },
      rows: () => [],
      line: (lobby) => str('lobby.combat_line', { n: lobby.minutes }),
    },
    tag: {
      on: () => roomTag.on(),
      ended: () => roomTag.view().state === 'results',
      start: 'friends-lobby-start',
      begin: (lobby) => roomTag.start(lobby.goal),
      setting: {
        key: modeById('tag').setting.key,
        choices: () => modeById('tag').setting.choices,
        label: 'lobby.goal',
        note: 'lobby.goal_note',
        value: (n) => plural('count.points', n),
      },
      rows: (host) => roomBotRows(host),
      line: (lobby) => str('lobby.tag_line', { n: lobby.goal }),
    },
    jam: {
      on: () => roomJam.on(),
      ended: () => roomJam.view().state === 'results',
      start: 'friends-lobby-start',
      begin: (lobby) => roomJam.start(lobby.seconds),
      setting: {
        key: modeById('jam').setting.key,
        choices: () => modeById('jam').setting.choices,
        label: 'lobby.seconds',
        note: 'lobby.seconds_note',
        value: (n) => str('lobby.seconds_value', { n }),
      },
      rows: () => [],
      line: (lobby) => str('lobby.jam_line', { n: lobby.seconds }),
    },
    /* The race goes off the track the host chose, from My tracks; the
     * pilots in the lobby have it built under the lobby screen, and are on
     * its grid when it goes (edge/rooms/race.js start). */
    race: {
      on: () => roomRace.race().state === 'on',
      ended: () => roomRace.race().state === 'results',
      start: 'friends-lobby-start',
      begin: () => roomLinkState.send({ type: 'race', op: 'start', laps: 3 }),
      setting: null,
      rows: (host) => (host ? [{
        label: str('lobby.track'), value: roomRace.track() ? roomRace.track().name : str('lobby.track_none'), note: str('lobby.track_note'), action: 'friends-lobby-track',
      }] : []),
      line: () => (roomRace.track() ? str('lobby.race_line', { name: roomRace.track().name }) : str('lobby.race_none')),
    },
    /* Free flight's round is just flying, on from the first start until
     * the room is empty: a pilot who comes then flies straight in. */
    free: {
      on: () => Boolean(roomLinkState.state().welcome && roomLinkState.state().welcome.lobby && roomLinkState.state().welcome.lobby.live),
      ended: () => false,
      start: null,
      begin: null,
      setting: null,
      rows: () => [],
      line: () => str('lobby.free_line', { world: mapById(roomLinkState.state().welcome.map).name }),
    },
  };
  /* One lobby per activity of the mode registry, and no other: a mode
   * added there without its rows here fails at load, not in a lobby. */
  {
    const ids = MODES.map((m) => m.id);
    const odd = [...ids.filter((id) => !Object.hasOwn(LOBBY_GAMES, id)), ...Object.keys(LOBBY_GAMES).filter((id) => !ids.includes(id))];
    if (odd.length) {
      throw new Error(`LOBBY_GAMES and src/share/modes.js disagree: ${odd.join(', ')}`);
    }
  }
  /* The room's game when it has a lobby ('free' for free flight), else
   * null: a room from a server before the lobby has none. */
  function lobbyGame() {
    const w = roomLinkState.state().welcome;
    const mode = w ? modeOfWire(w.mode) : null;
    return w && w.lobby && Object.hasOwn(LOBBY_GAMES, mode) ? mode : null;
  }
  /* The lobby, between rounds of the room's game, or null. */
  function gameLobby() {
    const st = roomLinkState.state();
    const game = lobbyGame();
    return st.phase === 'open' && game && st.welcome.lobby && !LOBBY_GAMES[game].on() ? st.welcome.lobby : null;
  }
  function gameLobbyReady(lobby = gameLobby()) {
    const w = roomLinkState.state().welcome;
    return Boolean(lobby && w && lobby.ready[w.seat]);
  }
  function gameLobbyToggle() {
    const lobby = gameLobby();
    if (lobby) {
      roomLinkState.send({ type: 'lobby', op: 'ready', ready: !gameLobbyReady(lobby) });
    }
  }
  function gameLobbyRows(host) {
    const lobby = gameLobby();
    const game = LOBBY_GAMES[lobbyGame()];
    const ready = gameLobbyReady(lobby);
    /* Ready stays first: the cursor lands on it when the room opens, and
     * warFromPublic learns the invite code only after that, so a row added
     * above it would slide under the cursor. The code, where a public
     * room's host made this private one for the war, comes next, above
     * the host's rows. */
    /* Operations' word for Ready is Deploy (docs/redesign/PLAN.md 2.4). */
    const war = lobbyGame() === 'war';
    const readyLabel = ready ? (war ? 'brief.stand_down' : 'lobby.unready') : (war ? 'brief.deploy' : 'lobby.ready');
    const readyNote = ready ? 'lobby.unready_note' : (war ? 'brief.deploy_note' : 'lobby.ready_note');
    const rows = [{
      label: str(readyLabel), note: str(readyNote), action: 'friends-lobby-ready', primary: true,
    }, ...lobbyInviteRows()];
    rows.push(...game.rows(host));
    if (host && game.start) {
      rows.push({ label: str('lobby.start_now'), note: str('lobby.start_now_note'), action: game.start });
    }
    if (host && game.setting) {
      const { key, choices, label, note, value } = game.setting;
      const all = choices();
      if (all.length > 1) {
        const i = Math.max(0, all.indexOf(lobby[key]));
        rows.push({
          label: str(label),
          value: value(lobby[key]),
          note: str(note),
          adjust: (d) => {
            roomLinkState.send({ type: 'lobby', op: key, [key]: all[(i + d + all.length) % all.length] });
          },
        });
      }
    }
    rows.push({ label: str('lobby.watch'), note: str('lobby.watch_note'), action: 'friends-watch' });
    rows.push({ label: str('friends.leave'), note: str('friends.leave_note'), action: 'friends-leave' });
    return rows;
  }
  /* What the panel shows: the round, the time, the pilots, the last
   * mission's result. Null outside a lobby. */
  function gameLobbyView() {
    const lobby = gameLobby();
    if (!lobby) {
      return null;
    }
    const game = lobbyGame();
    const w = roomLinkState.state().welcome;
    const now = roomLinkState.roomNow();
    const secs = (at) => (at == null || now == null ? null : Math.max(0, Math.ceil((at - now) / 1000)));
    const seats = [w.seat, ...[...roomPeers.keys()].sort((a, b) => a - b)];
    const v = roomWar.view();
    const mine = v && Array.isArray(v.scores) ? v.scores.find((x) => x.seat === w.seat) : null;
    const mission = WAR_MISSIONS[lobby.mission] ? lobby.mission : roomMission();
    return {
      mission: LOBBY_GAMES[game].line(lobby),
      countdown: secs(lobby.countdownAt),
      deadline: secs(lobby.deadlineAt),
      pilots: seats.map((seat) => ({
        name: roomSeatName(seat),
        /* This pilot's: in a war room the aircraft the war will seat it in
         * at the briefing (warCraftOf), not whatever it flew before, which
         * only the war's aircraft may be. */
        aircraft: airframeById(seat === w.seat ? (game === 'war' ? warCraftOf(ui.settings) : runAirframe) : roomPeers.get(seat).profile.airframe).name,
        ready: Boolean(lobby.ready[seat]),
        /* An AI pilot (src/share/rooms.js shownName). */
        ai: seat !== w.seat && Boolean(roomPeers.get(seat).name.bot),
        host: seat === w.host,
        me: seat === w.seat,
      })),
      last: game === 'war' && v && (v.state === 'won' || v.state === 'lost' || v.state === 'ended') && v.mission === mission ? {
        state: v.state, stars: v.result ? v.result.stars : null, kills: mine ? mine.kills : 0,
      } : null,
      /* Operations' briefing, the head of a war room's lobby. */
      brief: game === 'war' ? briefingOf(mission, { public: Boolean(w.public), code: roomLinkState.state().code }) : null,
    };
  }
  function missionKey(id) {
    const m = ACT1.find((x) => x.id === id);
    return m ? m.key : ACT1[0].key;
  }

  /*
   * A PUBLIC ROOM ON ITAIPU, where the owner, hosting three pilots, asked
   * "where do i start itaipu war". The war stays out of public rooms
   * (section 9, and the room server refuses it), and the server cannot
   * turn a live room private (edge/rooms/core.js has no such message), so
   * the host's way is a new private room on Itaipu, its invite code shown
   * on top for the others to join by.
   */
  function warPublicRows(host) {
    const why = { label: str('war.public_needs_private'), info: true };
    if (!host) {
      return [why, { label: str('war.public_ask_host'), info: true }];
    }
    return [why, {
      label: str('war.public_make_private'), note: str('war.public_make_private_note'), action: 'friends-war-private',
      primary: ui.roomGame === 'war',
    }];
  }

  /* The code of the room made by warPublicRows' row, shown on top until
   * the war begins, or null. */
  let warInviteCode = null;
  function warInviteRows() {
    const code = roomLinkState.state().code;
    if (!code || code !== warInviteCode) {
      return [];
    }
    return [{
      label: str('war.invite', { code }), note: roomNote || str('war.invite_note'), action: 'friends-copy',
    }];
  }

  /* A private room's lobby gives its code to read to friends (Make a
   * room's private room, a war room made from a public one): Enter copies
   * the link that opens it. A public room is found in Rooms instead. */
  function lobbyInviteRows() {
    const st = roomLinkState.state();
    if (!st.code || !st.welcome || st.welcome.public) {
      return [];
    }
    const war = st.code === warInviteCode;
    return [{
      label: str('war.invite', { code: st.code }), note: roomNote || str(war ? 'war.invite_note' : 'friends.code_note'), action: 'friends-copy',
    }];
  }

  async function warFromPublic() {
    try {
      if (!(await warEnter())) {
        return;
      }
      warInviteCode = roomLinkState.state().code;
    } catch (e) {
      roomRefusal = { text: str('roombrowser.make_failed'), untilMs: performance.now() + 8000 };
    }
    ui.refreshFriends();
  }

  /* The one screen of section 9, asked once per profile: true once the
   * pilot has said Continue, now or before. */
  async function warConsented() {
    if (ui.settings.warConsent) {
      return true;
    }
    const go = await ui.askConfirm({
      title: str('war.consent_title'),
      detail: str('war.consent_detail'),
      yes: str('war.consent_yes'),
      no: str('war.consent_no'),
    });
    if (go) {
      ui.settings.warConsent = true;
      ui.persistSettings();
    }
    return go;
  }

  /* The stage the start row's mission was just lost in (the room's
   * checkpoint, edge/rooms/war.js), or null: none after a win, an end, or
   * a loss of another mission than the one the row starts. */
  function warLostStage() {
    const v = roomWar.view();
    const id = (campaignRef && campaignRef.selectedMission()) ?? roomMission();
    return v && v.state === 'lost' && v.checkpoint && v.mission === id ? v.checkpoint : null;
  }

  /* The host's row back to the mission's start after its loss, beside
   * the start row, which then goes back to the lost stage. */
  function warFreshRows() {
    const lost = warLostStage();
    return lost ? [{ label: str('lobby.restart_fresh'), note: str('lobby.restart_fresh_note', { n: lost.n + 1 }), action: 'friends-war-fresh' }] : [];
  }

  /* The start row's press. Consent first, whoever's room this is: a
   * room made by hand never went through warEnter's (FLOW-AUDIT.md D6).
   * Then the mission campaign Play chose for this room, else mission 1:
   * after its loss from the stage it was lost in, as Deploy does (the
   * owner, 2 Oct: "a lost mission restarts from the lost stage, max 2
   * stars"), else, or with `fresh`, from its start, its film first. */
  async function warStart(fresh = false) {
    if (await warConsented()) {
      const how = !fresh && warLostStage() ? { from: 'checkpoint' } : { intro: true };
      if (!campaignRef.startSelected(how)) {
        roomWar.start(roomMission(), how);
      }
    }
    ui.refreshFriends();
  }

  /*
   * THE WAY IN FROM OUTSIDE A ROOM: the title's Defend Itaipu card
   * (`card`, its action) and Make a room's Game row (`room.name`, the
   * typed name or null). Consent first, then a private room on the Itaipu
   * map with this pilot as host, seated there, on the room screen with the
   * war's start row under the cursor. The room is made without a mode,
   * because 'war' is not one of ROOM_MODES and never reaches the server's
   * public list; ui.roomGame is what leads the room with it, here and, by
   * the host's profile, for whoever joins. Since the owner opened the war
   * to public rooms (2026-10-01) the room is made for the war (mode 'war')
   * and `room.mission`, public when `room.public`, so the room server lists
   * it as the war's. Resolves its code, or null when the pilot said Back;
   * throws what the room server refused.
   */
  async function warEnter(room = {}, card = null) {
    if (!(await warConsented())) {
      return null;
    }
    const code = await roomLinkState.create(WAR_MAP, false, {
      name: room.name ?? null, mode: 'war', mission: room.mission ?? WAR_MISSION, public: room.public === true,
    });
    if (ui.settings.map !== WAR_MAP) {
      ui.seatMap(WAR_MAP, { stay: true });
    }
    if (card) {
      ui.act(card);
    } else {
      ui.roomGame = 'war';
      ui.show('friends');
    }
    roomLinkState.join(code);
    return code;
  }

  /*
   * A ROOM MADE FOR THE WAR asks its consent of every pilot who enters it,
   * by the list, a link or a code (docs/WARFARE-PLAN.md section 9, as the
   * owner opened the war to public rooms on 2026-10-01). The host who made
   * it has answered already. A pilot who says no leaves it for the title,
   * never half in it.
   */
  let warJoinAsking = false;
  async function roomWarJoinGate(w) {
    /* Any game room's lobby, by a link or the title's panel, is where its
     * pilot lands; a round on flies them in (roomHotJoin). */
    if (Object.hasOwn(LOBBY_GAMES, w.mode) && w.lobby && ui.screen === 'title' && !LOBBY_GAMES[w.mode].on()) {
      ui.craftGate = false;
      ui.mode = 'freestyle';
      ui.returnTo = 'title';
      ui.show('friends');
    }
    if (!modeOfRoom(w.mode)?.consent || ui.settings.warConsent || warJoinAsking) {
      return;
    }
    warJoinAsking = true;
    try {
      if (!(await warConsented()) && roomLinkState.state().code === normaliseCode(w.code)) {
        roomLeave();
        ui.act('title');
      }
    } finally {
      warJoinAsking = false;
    }
  }

  /*
   * EVERY CARD, ONE PRESS (the owner, 2026-10-02: "it should take me to
   * the lobby of the room ... one two clicks max", and "every click will
   * take you to the lobby for it, ready to go either single or multi").
   * The card joins the busiest public room made for its game on its world
   * with a seat, into its lobby, or into its round when one is on; with
   * none, it makes one, public, named for this pilot and the game, and
   * lands in its lobby. The war asks its consent first. `game` is null for
   * free flight. A room the server would not make is said, with a second
   * try on offer, and Back leaves the pilot on the title. Resolves the code
   * of the room, or null.
   */
  /* The code of the room a title card's press made or joined, or null
   * (ui.onLobbyBack). */
  let lobbyCardCode = null;
  /* Where that room's Back goes after the cards, or null for the cards:
   * the campaign's page for a room its Play made. */
  let lobbyCardBack = null;
  ui.onGameCard = async (card, game, world) => {
    if (modeOfRoom(game).consent && !(await warConsented())) {
      return null;
    }
    for (;;) {
      try {
        const found = await roomBrowser.bestRoom(game, world);
        const name = normaliseRoomName(str(`lobby.room_name_${game || 'free'}`, { name: roomName(ownName()) })) || null;
        const code = found || await roomLinkState.create(world, false, { name, mode: game, public: true });
        if (ui.settings.map !== world) {
          ui.seatMap(world, { stay: true });
        }
        ui.act(card);
        ui.lobbyCard = card;
        lobbyCardCode = code;
        lobbyCardBack = null;
        /* The lobby, whatever the card's own screen was (Track mode's is
         * My tracks): its track, its aircraft, its world are chosen
         * there. */
        if (ui.screen !== 'friends') {
          ui.returnTo = 'title';
          ui.show('friends');
        }
        roomLinkState.join(code);
        return code;
      } catch (e) {
        const again = await ui.askConfirm({
          title: str(GAME_CARDS[game || 'free']), detail: str('roombrowser.make_failed'), yes: str('loading.try_again'), no: str('war.consent_no'),
        });
        if (!again) {
          return null;
        }
      }
    }
  };

  /* The card's press, campaign Play's way in. A room the server would not
   * make is said, with a second try on offer, and Back leaves the pilot on
   * the title. Its room is public, named for its host, so a friend finds
   * it in Rooms (the owner, 2026-10-01: "a new room isnt created and made
   * public so my friend cant easily join"); a name the room rules would
   * not take is left to the picked one. A mission still in development
   * gets a private room instead: the server makes a public room only for
   * a released mission, and a private one for a mission in development
   * that it then starts only for a DEV_ACCOUNTS host (edge/rooms/front.js
   * create), the owner's way to fly it before release. Resolves the code
   * of the room it made, or null. */
  ui.onWarCard = async (card, mission = null) => {
    const name = normaliseRoomName(str('war.room_name', { name: roomName(ownName()) })) || null;
    const open = released(mission ?? WAR_MISSION);
    for (;;) {
      try {
        return await warEnter({ mission, public: open, name }, card);
      } catch (e) {
        const again = await ui.askConfirm({
          title: str('war.card'), detail: str('roombrowser.make_failed'), yes: str('loading.try_again'), no: str('war.consent_no'),
        });
        if (!again) {
          return null;
        }
      }
    }
  };

  /* Crest Control's lines, in the UI's language, while the sound is on. */
  /* Each item a line id, or a list said as one (warradio.js PRIORITY);
   * prio 'story' for a stage's own radio cue. Under a replay the radio
   * says the clip's lines, not the live war's. `hud` shows the
   * subtitles: the war's, or an ops match's quiet HUD. */
  function warSay(items, prio = 'call', hud = warHud) {
    if (!items.length || mode === 'replay') {
      return;
    }
    /* In an ops match with the sound on, each line's subtitle comes up as
     * the radio starts it, so the words on the screen are the voice in the
     * ear even when the story and the guide take turns; without sound
     * they run on their own measured clock, as the war's do. */
    const followVoice = audio.enabled && hud === opsHud;
    if (!followVoice) {
      warSubtitles(items, prio, hud);
    }
    if (!audio.enabled) {
      return;
    }
    const radio = audio.war();
    radio.onLine = followVoice ? (id) => warSubtitles([id], 'story', opsHud, true) : null;
    radio.setLang(currentLocale());
    for (const item of items) {
      radio.say(item, performance.now(), prio);
    }
  }

  /* The story's lines as subtitles, sound or no sound: a stage's own
   * radio cues, and each mission's briefing and debrief. The calls
   * (bearings, kinds, hits) are the HUD's callouts already. Their words
   * are lines.json's, in the page's language, fetched once. */
  const WAR_SUBTITLED = new Set([...Object.values(BRIEF_LINES).flat(), ...Object.values(DEBRIEF_LINES).flatMap((d) => [d.win, d.lose])]);
  let warLineWords = null;
  function warSubtitles(items, prio, hud, now = false) {
    const ids = items.flat().filter((id) => typeof id === 'string' && (prio === 'story' || prio === 'guide' || WAR_SUBTITLED.has(id)));
    if (!ids.length) {
      return;
    }
    warLineWords ??= fetch(new URL('../assets/audio/war/lines.json', import.meta.url).href)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`lines.json ${r.status}`))))
      .then((j) => new Map(j.lines.map((l) => [l.id, l])));
    warLineWords.then((words) => {
      const lang = currentLocale();
      for (const id of ids) {
        const l = words.get(id);
        const text = l && (l[lang] ?? l.en);
        if (text) {
          hud.subtitle(text, Math.round((VOICE_LENGTHS[id]?.[lang] ?? VOICE_LENGTHS[id]?.en ?? 3) * 1000), now);
        }
      }
    }).catch((e) => {
      /* No words, no subtitles: the voice still plays. Loud in the
       * console, and tried again with the next line. */
      console.warn(`war: no subtitles: ${e.message}`);
      warLineWords = null;
    });
  }

  /* A stage's cue (src/share/war/stages.js), as the room told it: the
   * radio's line, the war bed's track, a cutaway. Its text is the view's
   * and the HUD's. */
  function warCue(ev, wallMs) {
    if (ev.radio) {
      warSay([ev.radio], 'story');
    }
    if (ev.music !== undefined && audio.enabled) {
      audio.setWarBed(ev.music);
    }
    if (ev.cutaway) {
      warCutaway.request(ev.cutaway, wallMs, ev.at);
    }
  }

  /* A target reached at room ms `at`: on fire, smoke later, on the map's
   * own damage (warMapDraw). Another arrival on it lights it again: its
   * fire runs from the latest hit. */
  function warBurn(id, at) {
    if (!(warBurning.get(id) >= at)) {
      warBurning.set(id, at);
    }
  }
  /* A target that lost something to the room's damage at room ms `at`:
   * it smokes from then unless a hit has it burning (world.js). */
  function warDamaged(id, at) {
    if (!(warDamage.get(id) <= at)) {
      warDamage.set(id, at);
    }
  }
  function warTargetsClear() {
    warBurning.clear();
    warDamage.clear();
  }
  /*
   * WHAT THE MAP SHOWS OF A WAR: which targets burn (map.setTargetState)
   * and how bright each district of the night raid's lights is
   * (map.setPower), from `w` { targets: { id: state not ok }, levels },
   * and in a replay what the structures had lost (`damage`, the room's
   * events by then, at room ms `t`: warBreakageAt).
   * Every frame it is the live war's at the room clock (warLiveWorld),
   * or, in the crash cam's replay of a clip that kept the map, the clip's
   * at its playhead (src/replay/warrec.js worldAt), so a replay shows the
   * map as it was then and leaving it shows the map as it is now. A map
   * without targets or lights draws nothing for them.
   */
  function warMapDraw(w) {
    if (!view) {
      return;
    }
    if (typeof view.setTargetState === 'function' && view.targets) {
      for (const id of Object.keys(view.targets)) {
        view.setTargetState(id, w.targets[id] ?? 'ok');
      }
    }
    if (typeof view.setPower === 'function') {
      view.setPower(w.levels);
    }
    if (w.damage) {
      warBreakageAt(w.damage, w.t ?? 0);
    }
    /* And its water: a flood of the replay's own from the openings and
     * the gate state, on the clip's clock (map.replayFlood); and the
     * leaves turned to that gate state (map.replayGates). */
    if (w.openings && typeof view.replayGates === 'function') {
      view.replayGates({ list: w.gates ?? null });
    }
    if (w.openings && typeof view.replayFlood === 'function') {
      view.replayFlood({ openings: w.openings, gates: w.gates ?? null, fromMs: w.from ?? w.t ?? 0 });
    }
  }

  /*
   * THE STRUCTURES IN A REPLAY (src/render/breakage.js): the clip's damage
   * events by the playhead's room ms t applied to the map, the pieces
   * flown to t. Played forward, the events the playhead passes are
   * applied as they come, with their dust and their sound; any other step
   * (back, a jump, another set) puts everything back and applies the set
   * again quietly, which is exact: the pieces are a function of the event
   * and the room clock (src/share/war/debris.js). While the replay draws
   * them nothing reaches the live war: no opening to the water, no smoke
   * recorded (warBreakageReplay). Leaving the replay, warBreakageLive
   * applies the live match's list again at the live clock.
   */
  function warBreakageAt(list, t) {
    warBreakageReplay = true;
    const was = warBreakageShown;
    const grows = was && t >= was.t && list.length >= was.seqs.length && was.seqs.every((s, i) => list[i].seq === s);
    if (!grows) {
      warBreakage.reset();
    }
    const from = grows ? was.seqs.length : 0;
    for (let i = from; i < list.length; i += 1) {
      warBreakage.apply({ type: 'damage', ...list[i] }, t, !grows);
    }
    warBreakage.update(t);
    warBreakageShown = { seqs: list.map((d) => d.seq), t };
  }
  function warBreakageLive(now) {
    if (view && typeof view.replayFlood === 'function') {
      view.replayFlood(null);
    }
    if (view && typeof view.replayGates === 'function') {
      view.replayGates(null);
    }
    if (!warBreakageShown) {
      return;
    }
    warBreakageShown = null;
    warBreakageReplay = false;
    warBreakage.reset();
    for (const e of roomWar.damage()) {
      warBreakage.apply(e, now ?? 0, true);
    }
  }
  function warLiveWorld(v, now) {
    const t = now ?? -Infinity;
    const targets = {};
    for (const [id, at] of warBurning) {
      const s = warBurnAt(at, t);
      if (s !== 'ok') {
        targets[id] = s;
      }
    }
    for (const [id, at] of warDamage) {
      if (at <= t && !(id in targets)) {
        targets[id] = 'smoke';
      }
    }
    return { targets, levels: warGrid.levels(v, t) };
  }

  /* A war this shell has not begun for: at its countdown, or a pilot
   * seated while one is live. Damage mode is forced on at the next reset,
   * so a pilot already flying starts again on the slot (as Catch the Ace
   * does) and one on a room screen takes off. */
  /*
   * THE WAR'S AIRCRAFT (the owner, 3 October: only combat drones fly in
   * wars; configs/airframes.js WAR_AIRFRAMES). In a room made for the war,
   * or one where a war is on, the pickers and the [ ] cycle offer only
   * them, and a pilot coming into a war in another is put in the war
   * aircraft flown last (settings.warAirframe) or the Striker, and told so
   * in one line. The room refuses any other (edge/rooms/war.js flies).
   */
  function inWarRoom() {
    return roomWar.view().state !== 'lobby' || lobbyGame() === 'war';
  }
  /* An ops mission flies the aircraft its role names (the role's
   * platforms, interior-1.js roles: the Bramor carries the camera ball the
   * mission is flown through), so in its room the pickers, the swap and
   * the [ ] cycle offer only those: the owner, 2026-10-07, flew Mission 1
   * in a Shahed with no camera. Before a role is dealt, every role's
   * platforms. */
  function opsCrafts() {
    const mission = roomOps.room() ? roomOps.mission() : null;
    if (!mission) {
      return null;
    }
    const v = roomOps.view();
    const mine = v ? opsRoleCraft(v) : null;
    if (mine) {
      return [mine];
    }
    const all = [...new Set((mission.roles || []).flatMap((r) => r.platforms || []))];
    return all.length ? all : null;
  }
  ui.craftLimit = () => opsCrafts() ?? (inWarRoom() ? WAR_AIRFRAMES : null);
  /* The aircraft a war seats this pilot in: its own when it is the war's,
   * else the war aircraft flown last, else the Striker. */
  function warCraftOf(s) {
    if (isWarAirframe(s.airframe)) {
      return s.airframe;
    }
    return isWarAirframe(s.warAirframe) ? s.warAirframe : WAR_DEFAULT;
  }
  ui.craftShown = (s) => (inWarRoom() ? warCraftOf(s) : s.airframe);
  function warSeatCraft() {
    const s = ui.settings;
    if (isWarAirframe(s.airframe)) {
      return;
    }
    const id = warCraftOf(s);
    seatAirframe(s, id);
    /* Carrying the warhead the pilot's loadout equips (a combat
     * aircraft's payload is its warhead, campaign.js craftWarhead), so
     * the switch does not trade it for the stock one. */
    const af = airframeById(id);
    const equipped = roomWar.view().loadouts?.[roomWar.seat()]?.warhead;
    if (equipped) {
      const had = combatChoice(af, s.combat ? s.combat[id] : null);
      s.combat = { ...(s.combat ?? {}), [id]: { ...had, payload: payloadForWarhead(af, equipped) } };
    }
    s.airframeAsked = true;
    ui.persistSettings();
    warCraftSaid = str('war.craft_switched', { name: airframeById(id).name });
    warCraftLog.push({ id, at: roomLinkState.roomNow(), said: warCraftSaid });
  }
  /* Each time a war put this pilot in another aircraft, for checks; and
   * its line, said once the film is over and the pilot can read it. */
  const warCraftLog = [];
  let warCraftSaid = null;
  /* Said, and the war aircraft flown kept for the next war. */
  function warCraftFrame(v) {
    /* From the briefing, so the pilot is seated in it before the go. */
    if (v.state === 'briefing' || roomWar.on()) {
      warSeatCraft();
    }
    if (warCraftSaid && !warIntro && (v.state === 'countdown' || v.state === 'live')) {
      notice = { text: warCraftSaid, untilMs: performance.now() + 5000 };
      warCraftSaid = null;
    }
    if (roomWar.on() && isWarAirframe(runAirframe) && ui.settings.warAirframe !== runAirframe) {
      ui.settings.warAirframe = runAirframe;
      ui.persistSettings();
    }
  }

  function warBegin(v) {
    warBegunId = roomWar.match();
    warCalls.reset();
    warTargetsClear();
    warBreakage.reset();
    warOpenings.length = 0;
    /* The last match's water goes with its breakage; this one's gates
     * are handed on the next frame. */
    if (view && typeof view.setGateState === 'function') {
      view.setGateState(null);
    }
    warGatesKey = null;
    for (const id of v.down || []) {
      warBurn(id, -Infinity);
    }
    warCrashDue = true;
    /* The intro's music is already on when a briefing came first
     * (warIntroFrame), and runs out into the loop by itself. */
    if (!audio.warRadio || !audio.warRadio.track) {
      /* A pilot seated mid stage hears the stage's own music. */
      const staged = v.stage && v.stage.music != null ? v.stage.music : 'combat';
      audio.setWarBed(v.state === 'countdown' ? 'intro' : staged);
    }
    const w = roomLinkState.state().welcome;
    if (mode === 'flight' && w && roomTagWorldReady(w.map)) {
      ui.onAction('restart');
    } else {
      roomCall('game', { restart: true });
    }
  }

  /* Whether a war has had enough of the take-off line: it is up through
   * the countdown and the war's first WAR_TAKEOFF_HINT_MS, and never over
   * a film or the end banner. A pilot who never took off had it drawn
   * across the whole mission and over the loss. */
  function warTakeoffHintDone() {
    const v = roomWar.view();
    if (v.state === 'lobby' || v.state === 'countdown') {
      return false;
    }
    if (!roomWar.on()) {
      return true;
    }
    const now = roomLinkState.roomNow();
    return now == null || now - v.goAt > WAR_TAKEOFF_HINT_MS;
  }

  /* The war is over, or this pilot left it: the music stops, the dam is
   * whole again, and the pilot's own damage setting is back at the next
   * reset. The last radio call is left to finish. */
  function warFinish() {
    warBegunId = null;
    warTargetsClear();
    warCrashDue = true;
    if (audio.warRadio) {
      audio.setWarBed('');
    }
  }

  /*
   * THE 2030 INTRO (src/render/warintro.js, section 7.1), over a room's
   * briefing for everybody, from where the room is in it, or once more on
   * its own from the host's row ('watch'). It poses shell.camera after the
   * shell's own camera chain (the frame loop calls warIntro.frame), hides
   * the shell's screens while it runs, and never plays in the crash cam's
   * replay. A pilot who skips it circles the dam until the briefing ends;
   * a host who skips it ends the briefing for everybody.
   */
  let warIntro = null;
  let warIntroFor = null;
  /* The war whose briefing this shell has shown (roomWar.match()): once,
   * however long the room stays in it after a skip. */
  let warIntroShown = null;
  let warIntroFov = 0;
  /* The host's Watch intro, pressed while the room's world was still
   * being built: played once it stands (warIntroFrame). */
  let warIntroWatchAsked = false;

  /* The films this pilot has watched to their end (src/game/campaign.js
   * films), in the synced campaign section; and the room told of them, so
   * its host's skip knows who has (edge/rooms/war.js seen). */
  const warFilmStore = createCampaignStore(ui.settings, () => ui.persistSettings());
  let warSeenTold = null;
  function warSeenTell() {
    const w = roomLinkState.state().welcome;
    const films = warFilmStore.load().films;
    const key = w ? `${w.code}:${w.seat}:${JSON.stringify(films)}` : null;
    if (key && key !== warSeenTold) {
      warSeenTold = key;
      roomWar.seen(films);
    }
  }

  /* The room told which world this screen has standing, in a war room,
   * once it is built and again whenever it or the link changes: a
   * briefing's film waits for a rebuild only when some pilot has not
   * said it stands on the mission's world (edge/rooms/war.js worldsUp). */
  let warWorldTold = null;
  let warWorldWelcome = null;
  function warWorldTell() {
    const w = roomLinkState.state().welcome;
    if (!w || (lobbyGame() !== 'war' && roomWar.view().state === 'lobby')) {
      return;
    }
    const up = view && mapReady && !worldSync && !swapInFlight && worldMatchesSettings();
    /* By the welcome too: a link that drops and comes back is a new seat
     * to the room, which forgot what the old one said. A world taken down
     * is said too, so the room never counts on one being rebuilt. */
    const key = up ? `${view.id}:${worldTime}` : null;
    if (key !== warWorldTold || (key && w !== warWorldWelcome)) {
      warWorldTold = key;
      warWorldWelcome = w;
      roomWar.world(up ? view.id : null, up ? worldTime : null);
    }
  }

  /* A mission's film, and its title card's words. */
  function warFilmOf(missionId) {
    const mission = WAR_MISSIONS[missionId] ?? WAR_MISSIONS[WAR_MISSION];
    return { film: filmFor(mission), title: { key: mission.title, n: missionNumber(mission.id) } };
  }

  function warIntroPlay(forWhat, opts = {}) {
    warIntroStop();
    warIntroFor = forWhat;
    warIntroFov = shell.camera.fov;
    const { film, title } = warFilmOf(opts.mission ?? roomMission());
    const h = playWarIntro(shell.quad.parent || view.scene, shell.camera, {
      canvas: shell.canvas,
      audio,
      ground: (x, z) => view.height(x, z, Infinity),
      film,
      title,
      seen: seenFilm(warFilmStore.load(), film.id, film.version),
      onSeen: () => {
        warFilmStore.save(markSeen(warFilmStore.load(), film.id, film.version));
        warSeenTell();
      },
      ...opts,
    });
    warIntro = h;
    h.done.then(() => {
      if (warIntro === h) {
        warIntroStop();
      }
    });
  }

  function warIntroStop() {
    if (!warIntro) {
      return;
    }
    const h = warIntro;
    warIntro = null;
    warIntroFor = null;
    h.dispose();
    if (shell.camera.fov !== warIntroFov) {
      shell.camera.fov = warIntroFov;
      shell.camera.updateProjectionMatrix();
    }
  }

  /* A room's briefing plays its mission's film on the room's clock, from
   * where the room is in it (a pilot joining late starts there, and that
   * viewing does not make it seen); its music and lines are the film's
   * own. A pilot who holds to skip waits on the orbit; a host's skip asks
   * the room to end the briefing, which it does once every pilot there
   * has seen this cut. */
  function warIntroFrame(v) {
    warSeenTell();
    const briefing = v.state === 'briefing' && v.briefAt != null && mode !== 'replay';
    if (warIntroWatchAsked && warFilmWorldUp(roomMission())) {
      warIntroWatchAsked = false;
      warIntroPlay('watch');
    }
    /* Not until the mission's world stands (warFilmWorldUp): not while it
     * is built at the mission's time of day (warTimeFrame, at the
     * briefing's start), nor over another map. It starts once the world
     * is up, where the room is by then, the film's preload span having
     * covered most of it. */
    if (briefing && warIntroShown !== roomWar.match() && warFilmWorldUp(v.mission)) {
      warIntroShown = roomWar.match();
      const briefAt = v.briefAt;
      /* The match's working sets, for a shot that outlines them. */
      const targets = WAR_MISSIONS[v.mission]?.targets ?? {};
      warIntroPlay(v.id, {
        mission: v.mission,
        clock: () => roomLinkState.roomNow() - briefAt,
        hold: true,
        named: Object.values(v.sets ?? {}).flat().filter((id) => targets[id]).map((id) => targets[id].at),
        onSkip: () => {
          const w = roomLinkState.state().welcome;
          if (w && w.host === w.seat) {
            roomWar.skipIntro();
          }
        },
      });
    } else if (warIntro && warIntroFor !== 'watch' && !String(warIntroFor).startsWith('ops:') && !briefing) {
      warIntroStop();
    }
  }

  /* A mission's film plays only in the mission's own world, built and
   * standing: its shots are that map's metres, and over any other map
   * they fly through whatever is there. */
  function warFilmWorldUp(missionId) {
    const map = (WAR_MISSIONS[missionId] ?? WAR_MISSIONS[WAR_MISSION]).map ?? WAR_MAP;
    return view.id === map && mapReady && !worldSync && !swapInFlight && worldMatchesSettings();
  }
  function warIntroWatch() {
    if (warFilmWorldUp(roomMission())) {
      warIntroPlay('watch');
    } else {
      warIntroWatchAsked = true;
    }
  }

  /* The room link closed. */
  function warLeave() {
    warIntroWatchAsked = false;
    if (warIntroFor !== 'watch') {
      warIntroStop();
    }
    warAttackers.clear();
    warBooms.clear();
    warCutaway.dispose();
    warFeedCut = null;
    warHud.update(null);
    warHud.drawn(false);
    warMarkers.clear();
    if (warBegunId != null) {
      warFinish();
    }
  }

  /* sim_part_break on part i unless `parts` (damage.parts()) says it is
   * already off. Damage mode is on in a war (applyCrashMode), so a
   * refusal is a bug. */
  function warBreak(i, parts) {
    if (parts && parts[i * PART_STATE_DOUBLES + STATE.status] !== 0) {
      return;
    }
    const code = sim.e.sim_part_break(i);
    if (code !== SIM_OK) {
      throw new Error(`war boom: sim_part_break(${i}) ${simErrorName(code)}`);
    }
  }

  /* The parts the picture needs (WAR_FEED_KINDS) and every part holding
   * one, since a part leaves with its children. */
  function warFeedParts() {
    const table = damage.table();
    const keep = new Set();
    for (let i = 0; i < table.length; i += 1) {
      if (!WAR_FEED_KINDS.includes(table[i].kindName)) {
        continue;
      }
      for (let j = i; j > 0 && !keep.has(j); j = table[j].parent) {
        keep.add(j);
      }
    }
    return keep;
  }

  /* This pilot's own warhead went off (section 6.3): every part but the
   * root and the picture's breaks, and the next frame's wreck check takes
   * it from there; the picture's parts go WAR_FEED_HOLD_MS later
   * (warFeedFrame). */
  function warBoomMine(wallMs) {
    if (mode !== 'flight') {
      return;
    }
    const keep = warFeedParts();
    const n = sim.e.sim_parts_count();
    for (let i = 1; i < n; i += 1) {
      if (!keep.has(i)) {
        warBreak(i, null);
      }
    }
    warFeedCut = keep.size ? { at: wallMs + WAR_FEED_HOLD_MS, from: wallMs, starts: plantStarts } : null;
  }

  function warFeedFrame(wallMs) {
    if (!warFeedCut || wallMs < warFeedCut.at) {
      return;
    }
    if (warFeedCut.starts !== plantStarts || !runDamage) {
      warFeedCut = null;
      return;
    }
    if (mode !== 'flight') {
      return;
    }
    warFeedHeldMs = wallMs - warFeedCut.from;
    warFeedCut = null;
    const parts = damage.parts();
    const n = sim.e.sim_parts_count();
    /* Children first, so each leaves as its own piece. */
    for (const i of [...warFeedParts()].sort((x, y) => y - x)) {
      if (i > 0 && i < n) {
        warBreak(i, parts);
      }
    }
  }

  /* One explosion: drawn, and heard if it is the loudest this frame.
   * `mine` is this pilot's own warhead. */
  function warBoomAt(p, size, mine) {
    if (!p) {
      return;
    }
    const c = shell.camera.position;
    if (mine) {
      /* The warhead went off against what it hit, in front of the lens:
       * the fireball is drawn a few metres ahead, so the pilot sees it
       * swell into the picture rather than a haze from inside it. */
      warBoomFwd.set(0, 0, -WAR_MINE_AHEAD_M).applyQuaternion(shell.camera.quaternion);
      warBoomP[0] = c.x + warBoomFwd.x;
      warBoomP[1] = c.y + warBoomFwd.y;
      warBoomP[2] = c.z + warBoomFwd.z;
      warBooms.play(warBoomP, size);
    } else {
      warBooms.play(p, size);
    }
    const d = mine ? 0 : Math.hypot(c.x - p[0], c.y - p[1], c.z - p[2]);
    const level = mine ? 1 : Math.min(1, 0.35 + 0.2 * size);
    /* Every explosion is its own sound in the world's voice, from where
     * it went off; without one, the loudest of the frame rings
     * MotorAudio.boom below. */
    if (worldAudio.boom(mine ? null : p, level)) {
      warBoomHeard.world = true;
    }
    const score = level / (1 + d / 250);
    if (score > warBoomHeard.score) {
      warBoomHeard.score = score;
      warBoomHeard.level = level;
      warBoomHeard.dist = d;
    }
    const near = mine ? 1 : Math.max(0, 1 - d / WAR_NEAR_M) * 0.45;
    if (near > 0.02 && mode === 'flight') {
      warBooms.flash(mine ? 0.8 : near, mine ? 0.6 : 0.45);
      warShake.a = Math.max(warShake.a, (mine ? 0.085 : 0.05) * near);
      warShake.t = 0;
      warShakePeak = Math.max(warShakePeak, warShake.a);
    }
  }

  /* A roomwar event's explosions: a warhead where it went off, every
   * attacker killed where it was, a swarm's bigger at the point, a target
   * hit where it was hit. One that flew away just goes. */
  function warBoomEvent(ev) {
    if (ev.type === 'boom') {
      warBoomAt(ev.p, WAR_BOOM_SIZE, ev.mine);
      return;
    }
    if (ev.type !== 'dead' || ev.why === 'leave') {
      return;
    }
    for (const x of ev.agents) {
      warBoomAt(x.p, WAR_DEATH[x.kind] ? WAR_DEATH[x.kind].size : 1, false);
    }
    if (ev.why === 'boom' && ev.agents.length > 1) {
      warBoomAt(ev.p || ev.agents[0].p, Math.min(WAR_BOOM_MAX, 1.2 + 0.5 * ev.agents.length), false);
    }
    if (ev.why === 'arrive' && ev.hit && ev.p) {
      warBoomAt(ev.p, WAR_IMPACT_SIZE, false);
    }
  }

  /* The shake's rotation this frame: a buzz at 17 Hz dying over half a
   * second, added where the lens is already turned (frame). Render only. */
  function warShakeFrame(dtMs) {
    if (warShake.a < 1e-4) {
      warShake.a = 0;
      warShake.x = 0;
      warShake.y = 0;
      warShake.z = 0;
      return;
    }
    const dtS = Math.max(0, dtMs) / 1000;
    warShake.t += dtS;
    warShake.a *= Math.exp(-dtS * 6);
    const w = warShake.t * 2 * Math.PI * 17;
    warShake.x = warShake.a * Math.sin(w);
    warShake.y = warShake.a * 0.8 * Math.sin(w * 1.31 + 1);
    warShake.z = warShake.a * 0.6 * Math.sin(w * 0.77 + 2);
  }

  /* Every frame the room is open, after tag's. In the crash cam's replay
   * the war is not drawn and nothing reaches the plant: its events are
   * taken and logged, so none is applied late to the flight after it. */
  /* The lobby's panel, kept current (its seconds), and the end of a
   * round: its end banner or results a while, then every pilot back in
   * the lobby, never on the title or in free flight. */
  let lobbyPanelAt = 0;
  let lobbyBackAt = null;
  let lobbySeen = null;
  function gameLobbyFrame(wallMs) {
    const game = lobbyGame();
    const seen = !game ? null : LOBBY_GAMES[game].on() ? 'on' : LOBBY_GAMES[game].ended() ? 'over' : 'lobby';
    if (seen !== lobbySeen) {
      if (seen === 'over' && lobbySeen === 'on') {
        lobbyBackAt = wallMs + LOBBY_BACK_MS;
      }
      /* Free flight has no start of its own to put pilots in the air: its
       * lobby's start does, and a pilot who came while it flies goes up. */
      if (seen === 'on' && modeById(game).openEnded) {
        roomCall('game');
      }
      lobbySeen = seen;
    }
    if (lobbyBackAt != null && wallMs >= lobbyBackAt) {
      lobbyBackAt = null;
      if (gameLobby() && (mode === 'flight' || mode === 'paused')) {
        ui.returnTo = 'title';
        ui.show('friends');
        ui.onAction('title');
      } else if (gameLobby() && ui.screen === 'results') {
        ui.show('friends');
      }
    }
    lobbyPanelFrame(wallMs);
  }
  /* The lobby's panel, five times a second; also mid world build (a
   * mission's time of day rebuilds it as its briefing begins, frameBody),
   * so a war ended then is not shown still counting down until the world
   * is up. */
  function lobbyPanelFrame(wallMs) {
    if (wallMs < lobbyPanelAt) {
      return;
    }
    lobbyPanelAt = wallMs + 200;
    ui.setWarLobby(ui.screen === 'friends' ? gameLobbyView() : null);
  }

  /*
   * The match's spillway gates (the war view's `gates`, the stage
   * engine's stored and replayed state: [{ gate, at, open_m }]) to the
   * map, which turns its leaves and its water to them on the room clock.
   * In a war with no gate state, [] (the leaves at Free Flight's opening):
   * null is no war at all, which also takes the war's openings out of
   * the water (water/live.js setGates), so it is handed only out of a
   * war and as a match begins (warBegin). Handed again when it changes or
   * the map is new.
   */
  let warGatesKey = null;
  let warGatesView = null;
  function warGatesFrame(v) {
    if (!view || typeof view.setGateState !== 'function') {
      return;
    }
    const gates = !roomWar.on() ? null : Array.isArray(v.gates) ? v.gates : [];
    const key = gates ? JSON.stringify(gates) : '';
    if (key === warGatesKey && view === warGatesView) {
      return;
    }
    warGatesKey = key;
    warGatesView = view;
    warGatesTo(gates);
  }
  /* The gate state to the map, and to the crash cam's record of it
   * (src/replay/warrec.js THE GATES), so a replay turns the same leaves. */
  function warGatesTo(list) {
    view.setGateState(list);
    if (crashCam) {
      crashCam.recordGates(list);
    }
  }

  function roomWarFrame(now, wallMs, dt) {
    warFrameNow = now;
    const scene = shell.quad.parent;
    if (scene && warAttackers.group.parent !== scene) {
      scene.add(warAttackers.group);
    }
    if (scene && warBooms.group.parent !== scene) {
      scene.add(warBooms.group);
    }
    if (scene && warBreakage.group.parent !== scene) {
      scene.add(warBreakage.group);
    }
    warBreakage.setMap(view, now);
    const replay = mode === 'replay';
    warHud.drawn(mode === 'flight' && ui.screen === 'flight');
    warAttackers.group.visible = !replay;
    /* The replay draws its own, from what the crash cam recorded. */
    warBooms.group.visible = !replay;
    warFeedFrame(wallMs);
    const v = roomWar.view();
    warGatesFrame(v);
    warTimeFrame();
    warWorldTell();
    warIntroFrame(v);
    warCraftFrame(v);
    if (roomWar.on() && roomWar.match() !== warBegunId) {
      warBegin(v);
    } else if (!roomWar.on() && warBegunId != null) {
      warFinish();
    }
    /* A new round: everybody back in the air on its slot, as a war's
     * begin puts them, and the radio says how the last one went. */
    const round = roomWar.live() ? roundOf(v) : null;
    const roundKey = round ? `${roomWar.match()}/${round.n}:${round.state}` : null;
    if (round && roundKey !== warRoundSeen && warRoundSeen && warRoundSeen.startsWith(`${roomWar.match()}/`)) {
      if (round.state === 'live' && mode === 'flight') {
        ui.onAction('restart');
      } else if (round.state === 'result') {
        warSay(warCalls.round(round.result));
      }
    }
    warRoundSeen = roundKey;
    /* A teammate talking on voice chat ducks the radio and the music
     * (src/render/warradio.js duck); this pilot's own voice does not, nor
     * the explosions, which play in the audio graph. */
    if (audio.warRadio) {
      let heard = false;
      for (const seat of roomPeers.keys()) {
        if (voice.speaking(seat)) {
          heard = true;
          break;
        }
      }
      audio.warRadio.duck(heard);
    }
    const events = roomWar.takeEvents();
    warGrid.hear(events, v);
    /* The replay draws the map from its clip (crashCam drawWar). */
    const owned = replay && Boolean(crashCam && crashCam.world());
    for (const ev of events) {
      warLog.push({ ...ev, heardAt: now });
      if (ev.type === 'dead' && ev.why === 'arrive' && ev.hit && ev.target) {
        warBurn(ev.target, ev.at);
      }
      if (ev.type === 'state' && ev.to === 'live' && audio.warRadio && audio.warRadio.track !== 'intro') {
        audio.setWarBed('combat');
      }
      /* At the go, how a warhead goes off: the pilots look for a trigger. */
      if (ev.type === 'state' && ev.to === 'live') {
        warHud.hint(str('war.hint_go', { n: v.fuze && v.fuze[roomWar.seat()] != null ? v.fuze[roomWar.seat()] : v.blast }));
      }
      /* The map is what the room broke; a replay that draws its own
       * (warBreakageAt) has it applied when it closes. */
      if (ev.type === 'damage' && !owned) {
        warBreakage.apply(ev, now);
      }
      if (replay) {
        continue;
      }
      warBoomEvent(ev);
      if (ev.type === 'cue') {
        warCue(ev, wallMs);
      }
      if (ev.type === 'dead') {
        warAttackers.dead(ev);
      } else if (ev.type === 'boom' && ev.mine) {
        warBoomMine(wallMs);
      }
    }
    if (warBoomHeard.score > 0) {
      if (warBoomHeard.world) {
        /* The world rang it; the flight, the music and the ambience
         * still duck under the loudest when it arrives, as boom() ducks
         * them. */
        const lv = warBoomHeard.level / (1 + warBoomHeard.dist / 250);
        if (audio.ctx) {
          const t = audio.ctx.currentTime + Math.min(2.5, warBoomHeard.dist / 343);
          audio.duckFlight(t, 0.35 + 0.35 * (1 - lv), 1.2);
          audio.duckAction(t, 0.4 + 0.4 * (1 - lv), 1.6);
        }
      } else if (audio.enabled && typeof audio.boom === 'function') {
        audio.boom(warBoomHeard.level, warBoomHeard.dist);
      }
      warBoomHeard.score = 0;
      warBoomHeard.world = false;
    }
    warAudioPeak = Math.max(warAudioPeak, typeof audio.nodeCount === 'function' ? audio.nodeCount() : 0);
    warBooms.update(dt);
    if (!owned) {
      warBreakage.update(now);
    }
    if (warLog.length > WAR_LOG_MAX) {
      warLog.splice(0, warLog.length - WAR_LOG_MAX);
    }
    /* The replay draws the map as its clip kept it (crashCam drawWar). */
    if (!owned) {
      const w = warLiveWorld(v, now);
      warMapDraw(w);
      if (warMapLog && warMapLog.length < WAR_MAP_LOG_MAX) {
        warMapLog.push({
          t: now, targets: w.targets, levels: Array.from(w.levels), broken: warBroken(),
        });
      }
    }
    if (replay) {
      warHud.update(null);
      warMarkers.update(null, now, events);
      return;
    }
    warHud.events(events);
    warSay(warCalls.events(events, v));
    const live = roomWar.attackersAt(now);
    warNudgeFrame(v, live, wallMs);
    worldAudio.war(live, now);
    avxTruth = roomWar.live() ? live : AVX_NO_TRUTH;
    warAttackers.update(live, roomWar.live() ? now : null, shell.camera.position);
    warDrawnAt = now;
    /* A Hunter newly on this pilot: Crest Control's hunter line, unless it
     * is already on the air. */
    /* A spectator's markers are the watched teammate's: its distances,
     * and a Hunter on it framed, but not said as on this pilot. */
    const watched = warWatch();
    warMarkers.setNamed(v.sets);
    const eye = watched ? { x: watched.drawnPose.px, y: watched.drawnPose.py, z: watched.drawnPose.pz } : pCurr;
    if (warMarkers.update(roomWar.live() && mode === 'flight' && ui.screen === 'flight' ? live : null, now, events, roomWar.mission(), eye.x, eye.y, eye.z, watched ? watched.seat : roomWar.seat(), warFuzeOf(v, watched), spilling(v.gates, now)) && !watched) {
      const radio = audio.warRadio ? audio.warRadio.status() : null;
      if (!radio || (radio.speaking !== 'wave-hunter' && !radio.queue.includes('wave-hunter'))) {
        warSay(['wave-hunter']);
      }
    }
    if (wallMs < warHudAt) {
      return;
    }
    warHudAt = wallMs + 250;
    const m = roomWar.mission();
    warHud.update(mode === 'flight' && ui.screen === 'flight' ? v : null, roomWar.seat(), now, m ? m.output : 0, m);
    warRoundCard.update(mode === 'flight' && ui.screen === 'flight' ? v : null, now);
  }

  /* The war's guide nudge (src/share/war/nudge.js), for a mission that
   * asks for it: after no progress for a while, and only into a quiet
   * radio, where the attacker nearest the targets is. Progress is the
   * stage moving on, a kill, the nearest threat changing, or closing on
   * it. */
  const warNudger = createWarNudger();
  let warNudgeAt = 0;
  function warNudgeFrame(v, live, wallMs) {
    const m = roomWar.mission();
    if (!m || !m.nudge || !roomWar.live() || mode !== 'flight' || ui.screen !== 'flight' || warIntro || wallMs < warNudgeAt) {
      return;
    }
    warNudgeAt = wallMs + 1000;
    const here = warGround([pCurr.x, pCurr.y, pCurr.z]);
    const threat = warThreatOf(live, m.targets);
    const dist = threat ? Math.hypot(threat.at[0] - here[0], threat.at[1] - here[1]) : null;
    warNudger.progress(`${v.stage ? v.stage.id : ''}|${live.length}|${threat ? threat.id : ''}`, wallMs, dist);
    if (!threat || !radioQuiet() || !warNudger.due(wallMs)) {
      return;
    }
    warSay([warNudgeOf(threat, here, warHeadingOf([camFwd.x, camFwd.y, camFwd.z]))], 'guide');
    warNudger.nudged(wallMs);
  }

  /* The game running in this room, as this screen knows it, or null. */
  function roomRunning() {
    const r = roomCombat.round();
    if (roomRace.race().state === 'on') {
      return 'race';
    }
    if (roomTag.on()) {
      return 'tag';
    }
    if (roomJam.on()) {
      return 'jam';
    }
    if (roomWar.on()) {
      return 'war';
    }
    return r.state === 'countdown' || r.state === 'on' ? 'combat' : null;
  }

  /* The room refused something this pilot asked of it as the host: say
   * why, on the room screen and over the flight. */
  function roomRefused(why) {
    const key = `rooms.refused_${why}`;
    const text = str(key) === key ? str('rooms.refused_host') : str(key);
    roomRefusal = { text, untilMs: performance.now() + 8000 };
    /* On the room screen its own row says it; over a flight, the banner. */
    if (ui.screen === 'flight') {
      notice = { text, untilMs: performance.now() + 4000 };
    }
    ui.refreshFriends();
  }

  /* The top of the room screen: why the last host action was refused. */
  function roomRefusalRows() {
    return roomRefusal && performance.now() < roomRefusal.untilMs ? [{ label: roomRefusal.text, info: true }] : [];
  }

  /* First in the Game section, for the host: a way out of whatever game is
   * running, whatever its own rows show, so no game can leave the room
   * stuck. */
  function roomEndRows(host, w) {
    const running = host && w ? roomRunning() : null;
    return running ? [{ label: str(`rooms.end_${running}`), note: str('rooms.end_note'), action: `friends-end-${running}` }] : [];
  }

  function roomPeerJoin(seat, name, profile) {
    const old = roomPeers.get(seat);
    if (old) {
      roomPeerLeave(seat);
    }
    roomPeers.set(seat, {
      seat, name, profile, track: new PeerTrack(), last: null, rig: null, figure: null, wreck: null, wreckTable: null, wreckPieces: null, frozenUntil: 0, away: null,
    });
  }

  /*
   * PHASE 2, SHARED WRECKS (src/share/roomwrecks.js). A peer's crash
   * arrives as its part table, then its pieces' world poses; the peer's
   * wreck is cut from its drawn aircraft and kept with the peer, rebuilt
   * with the aircraft when that is. Sparks and dust are this screen's own,
   * thrown where the peer is when the news arrives. A whack on a jelly
   * piece wobbles the same piece here, when both fly the same course.
   */
  let roomWreckSender = null;
  function roomEvent(ev) {
    const peer = roomPeers.get(ev.seat);
    if (!peer) {
      return;
    }
    if (ev.kind === 'crash') {
      if (ev.clear) {
        peer.wreckTable = null;
        peer.wreckPieces = null;
        if (peer.wreck) {
          peer.wreck.clear();
        }
        return;
      }
      const table = checkCrashTable(ev.table);
      if (!table) {
        return;
      }
      peer.wreckTable = table;
      peer.wreckPieces = null;
      /* A mid air hit held this peer where it was struck; its own wreck
       * takes over from here. */
      peer.frozenUntil = 0;
      if (peer.wreck) {
        peer.wreck.crash(table);
      }
      if (peer.last && view && peer.profile.map === view.id) {
        const at = new THREE.Vector3(peer.last.px, peer.last.py, peer.last.pz);
        debris.emit(at, AXIS_Y, Math.max(4, Math.hypot(peer.last.vx, peer.last.vy, peer.last.vz)),
          SURFACE.grass, null, groundAt(at.x, at.z), 'hit');
      }
      return;
    }
    if (ev.kind === 'whack') {
      const w = checkWhack(ev);
      if (w && build && view && w.map === view.id && w.course === String(view.courseKey ?? '')) {
        build.jiggle(w.i, new THREE.Vector3(w.n[0], w.n[1], w.n[2]), w.square);
      }
    }
  }
  /* A whack this pilot's plane gave a jelly piece, for the others. */
  function roomWhack(i, n, square) {
    if (roomLinkState.state().phase !== 'open' || !view) {
      return;
    }
    roomLinkState.sendEvent({ kind: 'whack', map: view.id, course: String(view.courseKey ?? ''), i, n: [n.x, n.y, n.z], square });
  }
  /* The peer's wreck on its current drawing, cut again when that changes. */
  function roomPeerWreck(peer, scene) {
    if (!peer.wreckTable) {
      return;
    }
    if (!peer.wreck || peer.wreck.craft !== peer.rig.group) {
      if (peer.wreck) {
        peer.wreck.dispose();
      }
      peer.wreck = createPeerWreck(peer.rig.group, peer.rig.discs);
      peer.wreck.craft = peer.rig.group;
      peer.wreck.crash(peer.wreckTable);
      if (peer.wreckPieces) {
        peer.wreck.pieces(peer.wreckPieces, performance.now() - 1000);
      }
    }
    if (peer.wreck.group.parent !== scene) {
      scene.add(peer.wreck.group);
    }
    peer.wreck.group.visible = true;
    peer.wreck.update(performance.now());
  }
  function roomPeerLeave(seat) {
    const peer = roomPeers.get(seat);
    if (!peer) {
      return;
    }
    if (peer.wreck) {
      peer.wreck.dispose();
    }
    if (peer.rig) {
      peer.rig.dispose();
    }
    if (peer.figure) {
      peer.figure.dispose();
    }
    roomPeers.delete(seat);
  }
  function roomPeersClear() {
    for (const seat of [...roomPeers.keys()]) {
      roomPeerLeave(seat);
    }
  }

  /* Every frame, after the aircraft is posed: send this one, draw the
   * others. wallMs is the render clock. */
  let roomAutoJoined = false;
  /* The code the boot rejoins (a reload, or a ?room= link), until a
   * welcome; null after. */
  let roomBootJoin = null;

  /*
   * A RELOAD KEEPS YOU IN YOUR ROOM, AND ON ITS SCREEN. The owner
   * (2026-10-01) decided a reload must keep the pilot in their room; it
   * did, but the page booted on the gate with nothing saying so, and Free
   * Flight from there flew inside the room (docs/FLOW-AUDIT.md D2). The
   * boot's rejoin lands on the room screen as the Fly with friends card
   * would, without seating anything: the welcome seats the room's world.
   * Only while the title is still up: a pilot who has gone on is left
   * where they went.
   */
  function roomBootLand(w) {
    const wanted = roomBootJoin;
    roomBootJoin = null;
    if (!wanted || normaliseCode(w.code) !== wanted || ui.screen !== 'title') {
      return;
    }
    ui.craftGate = false;
    ui.mode = 'freestyle';
    ui.returnTo = 'title';
    ui.show('friends');
  }
  function roomFrame(wallMs, dt) {
    raceHoldMs = 0;
    /* Put up again below when there is a live match to put it round. */
    roomTagBubble.set(0);
    tagBoost();
    /* A ?room= link, or the room this tab was in before a reload: joined
     * once the shell is up, never during boot, because the hello reads
     * the seated aircraft. */
    if (!roomAutoJoined) {
      roomAutoJoined = true;
      const wanted = wantedRoom();
      if (wanted && roomLinkState.available()) {
        roomBootJoin = wanted;
        roomLinkState.join(wanted);
      }
    }
    roomBarFrame(wallMs);
    gameLobbyFrame(wallMs);
    const link = roomLinkState.state();
    ui.setWarState(link.phase === 'open' ? roomWar.view().state : 'lobby');
    if (link.phase !== 'open') {
      return;
    }
    const now = roomLinkState.roomNow();
    if (now == null) {
      return;
    }
    roomRaceFrame(now, wallMs);
    roomTagFrame(now, wallMs);
    roomJamFrame(now, wallMs);
    roomWarFrame(now, wallMs, dt);
    roomSessionFrame(link.welcome, wallMs);
    if (wallMs > roomProfileCheckAt) {
      roomProfileCheckAt = wallMs + 500;
      roomTellProfile();
    }
    /* Sent from the plant's steps while it flies (roomPoseStep); from the
     * frame while it does not (on the ground, held, on a launcher). An
     * aircraft at rest or held has held its pose since the last frame, so
     * every 30 Hz slot since, as far back as the room still judges
     * (LATE_MS), goes too: a slow frame leaves no gap in it either. */
    if (mode === 'flight' && stateCurr && !roomPoseMap && now >= roomNextSend) {
      const from = Math.max(roomNextSend, (roomLastSendT ?? -Infinity) + 1000 / 30, now - LATE_MS);
      for (let t = from; (landed || poseLock) && t <= now - 1000 / 30; t += 1000 / 30) {
        roomSendPose(Math.round(t), stateCurr, pCurr, qPrev);
      }
      roomNextSend = Math.max(roomNextSend + 1000 / 30, now - 1000 / 30);
      roomSendPose(now, stateCurr, pCurr, qPrev);
    }
    roomSlowFrame(wallMs);
    roomWreckSender ??= createWreckSender(roomLinkState, wreckRig, () => partTable);
    if (mode === 'flight' || roomWreckSender.active()) {
      roomWreckSender.frame(now, wallMs);
    }
    const scene = shell.quad.parent;
    const simT = stateCurr ? stateCurr[0] : 0;
    /* The others are drawn at the frame's own moment, wallMs on the room
     * clock, as this pilot's craft is (its state is the block ending at
     * wallMs) and as the poses this page sends are stamped (roomPoseFrame).
     * `now` is read part way through the frame, as late as the frame's
     * work before this line makes it, and that work changes frame to frame:
     * a peer drawn at it moved on that jitter, not on the display's beat. */
    const drawNow = roomLinkState.roomAt(wallMs) ?? now;
    for (const peer of roomPeers.values()) {
      roomDrawPeer(peer, now, scene, dt, simT, drawNow);
    }
    /* In a replay the pilots are heard from the clip (the frame's sound). */
    if (mode !== 'replay') {
      roomHearPeers();
    }
    tagMarkPeers();
    tagBubble(now, wallMs, scene);
    tagCrownFrame(scene, dt);
    roomCombat.seated(link.welcome ? link.welcome.seat : 0, runAirframe);
    combatFrame(now, wallMs, scene, dt);
  }

  /*
   * THE ROOM IS ONE SESSION. The owner, 2026-09-29, with four pilots in a
   * room and only one of them drawn: "i cant see the 3 people in my room,
   * force everyone in the same game and the same thing".
   *
   * The room's world (welcome.map, which only its host moves: the host's
   * own choice of world is sent as the room's, edge/rooms/core.js world)
   * and its game are where every pilot in it flies. The target is that
   * world, on the room's track when it has one there and no other game is
   * on (roomTarget). A summon (roomCall) is the room putting this pilot
   * there and in the air: on joining and rejoining, whenever the target
   * changes (the host moved the room, loaded a track, a game began or
   * ended over a track), and when a game starts. It is carried out a step
   * a frame from wherever the pilot is: the crash cam, the builder, the
   * hangar or any menu, the pause, another world or a track of their own
   * (roomSessionFrame). Nothing else moves a pilot: a pause, a menu and a
   * results screen never do, so a wreck stays a wreck.
   *
   * Between summons a pilot may sit anywhere. The others see why beside
   * the name (roomStatus, roomAwayText), and this pilot sees the room bar
   * asking them to fly while the others are (roomBarView). A pilot who is
   * not the host and picks another world or a track of their own is put
   * back (roomDrift): that was the one way left to fly alone in a room.
   */
  /* ms a pilot whose socket dropped is still named, as reconnecting. */
  const ROOM_GONE_MS = 30000;
  /* ms the host's move of the room may take to come back before the
   * host is put back in the room's world (a refusal, or a rooms server
   * from before the move existed). */
  const ROOM_ASK_MS = 4000;
  /* seat -> { name, until }: pilots whose socket dropped (onLeave). */
  const roomGone = new Map();
  /* { why, fly, restart } while this pilot is owed a move: fly, into the
   * air at the end; restart, from the slot even when already flying. */
  let roomSummon = null;
  /* The target this pilot was last summoned to, 'world|track id'. */
  let roomSeenTarget = null;
  /* What the host asked the room to take: { map, track, at }. */
  let roomAsked = { map: null, track: null, at: 0 };

  /* A join (a room made or joined, a reload or a dropped socket rejoining)
   * seats the pilot in the room's world and leaves them where they are:
   * the room screen with its code and start rows, the title, the pause.
   * They go up at their own Fly, the room bar's, or a game's start. */
  function roomCall(why, { restart = false } = {}) {
    /* 'track': a race lobby's new track, built under the lobby screen and
     * not flown until its race goes. */
    const fly = why !== 'join' && why !== 'track';
    roomSummon = { why, fly, restart: restart || Boolean(roomSummon && roomSummon.restart) };
  }

  /* Where the room flies now: its world, on its track when it has one
   * there, except in the games played in free flight. Combat is flown
   * wherever the room is, so its rounds never move anybody off a track. */
  function roomTarget(w) {
    const t = roomRace.track();
    const free = roomTag.on() || roomJam.on() || roomWar.on();
    return { world: w.map, track: t && t.map === w.map && !free ? t : null };
  }
  const roomTargetKey = (t) => `${t.world}|${t.track ? t.track.id : ''}`;

  /* The world this pilot's seat builds, the title's and the builder's aside. */
  function seatWorld() {
    if (ui.settings.map !== 'track') {
      return mapById(ui.settings.map).id;
    }
    const seated = seatShare();
    return seated ? seated.document.map : mapById('track').home;
  }
  function seatTrackId() {
    const seated = seatShare();
    return seated ? seated.document.id : null;
  }
  function roomInPlace(target) {
    if (seatWorld() !== target.world) {
      return false;
    }
    return target.track ? ui.settings.map === 'track' && seatTrackId() === target.track.id : ui.settings.map === target.world;
  }
  function roomHost(w) {
    return Boolean(w) && w.host === w.seat;
  }

  function roomLeaveCrashCam() {
    if (mode === 'replay' && crashCam) {
      crashCam.close();
    }
  }

  /* The welcome, a first join or a rejoin: the room's target is taken as
   * seen, and this pilot is summoned to it. A racer is seated too, since
   * #187 kept a pilot on a track of their own: that is a session of one. */
  function roomSessionWelcome(w) {
    const target = roomTarget(w);
    roomSeenTarget = roomTargetKey(target);
    roomAsked = { map: null, track: null, at: 0 };
    if (!roomInPlace(target) && MAPS.some((m) => m.id === target.world && m.mode === 'freestyle')) {
      roomNote = str('friends.other_world', { world: mapById(target.world).name });
    }
    /* A watcher has no lobby and no Fly of its own: it is put in the
     * air at once, where the watch camera takes it (roomWatching). */
    roomCall(w.watch ? 'watch' : 'join');
  }

  /*
   * A seat this pilot chose that is not the room's. The host's is asked of
   * the room (a world, a track), and put back if the room has not taken it
   * in ROOM_ASK_MS; anybody else's is put back at once. Not while the seat
   * is being changed, or while the builder is open, whose world is its own
   * and whose tracks are not flown as the room's until they are seated.
   */
  function roomDrift(w, wallMs) {
    if (roomSummon || swapInFlight || !mapReady || (build && build.active && !build.racing) || !MAPS.some((m) => m.id === w.map && m.mode === 'freestyle')) {
      return;
    }
    const world = seatWorld();
    const track = ui.settings.map === 'track' ? seatTrackId() : null;
    const roomTrack = roomRace.track();
    const offWorld = world !== w.map;
    const offTrack = track != null && (!roomTrack || roomTrack.id !== track);
    if (!offWorld && !offTrack) {
      return;
    }
    /* A public room is listed under its world, so its host moves its
     * track only. */
    if (roomHost(w) && !(offWorld && w.public)) {
      const asked = roomAsked.map === world && roomAsked.track === track;
      if (!asked) {
        roomAsked = { map: world, track, at: wallMs };
        if (offWorld) {
          roomLinkState.sendWorld(world);
        }
        const seated = offTrack ? seatShare() : null;
        if (seated) {
          roomRace.loadTrack(seated.document);
        }
        return;
      }
      if (wallMs - roomAsked.at < ROOM_ASK_MS) {
        return;
      }
    }
    roomSay(str('rooms.put_back', { world: mapById(w.map).name }));
    roomCall('drift');
  }

  /* A line for this pilot, on the room screen and over a flight. */
  function roomSay(text) {
    roomNote = text;
    notice = { text, untilMs: performance.now() + 4000 };
  }

  /* Every frame the room is open: the target watched, and a summon owed
   * carried a step further. */
  function roomSessionFrame(w, wallMs) {
    if (!w) {
      return;
    }
    const target = roomTarget(w);
    const key = roomTargetKey(target);
    if (key !== roomSeenTarget) {
      const moved = roomSeenTarget != null && roomSeenTarget.split('|')[0] !== target.world;
      roomSeenTarget = key;
      roomAsked = { map: null, track: null, at: 0 };
      if (moved && !roomHost(w)) {
        roomSay(str('rooms.world_moved', { world: mapById(target.world).name }));
      }
      roomCall(lobbyGame() === 'race' && gameLobby() ? 'track' : 'target');
    }
    roomDrift(w, wallMs);
    roomSummonStep(target);
  }

  function roomSummonStep(target) {
    const s = roomSummon;
    if (!s || ui.nameWait || (ui.nameDialog && !ui.nameDialog.hidden) || ui.screen === 'padpick' || ui.screen === 'calibrate') {
      return;
    }
    if (swapInFlight || !mapReady) {
      return;
    }
    if (mode === 'replay') {
      roomLeaveCrashCam();
      s.restart = true;
      return;
    }
    /* The builder saves as it goes and again on the way out. A seated map
     * track is the builder's too (build.racing), and stays. */
    if (build && build.active && !build.racing) {
      ui.show('title');
      ui.onAction('title');
      return;
    }
    if (!MAPS.some((m) => m.id === target.world && m.mode === 'freestyle')) {
      /* A world this build does not have (a newer build's room): nothing
       * to seat, and the others name this pilot as elsewhere. */
      roomSummon = null;
      return;
    }
    if (!roomInPlace(target)) {
      roomSeat(target, s.fly);
      return;
    }
    /* Not to be flown (a room just made or joined from the room screen):
     * the seat is the room's, and the world is built at Fly as ever. Built
     * now, the swap would land the pilot on the title, off the room screen
     * and its start rows. */
    if (!s.fly) {
      /* A race lobby's track is built now, on the lobby screen (the swap
       * comes back to it), so its pilots are on the grid when it goes. */
      if (s.why === 'track' && !worldMatchesSettings()) {
        titleWorld = null;
        buildWorld = null;
        syncWorld();
        roomTellProfile();
        return;
      }
      roomSummon = null;
      return;
    }
    titleWorld = null;
    buildWorld = null;
    if (!worldMatchesSettings()) {
      syncWorld();
      roomTellProfile();
      return;
    }
    roomSummon = null;
    if (roomTag.on()) {
      roomTagRunId = roomTag.view().id;
    }
    const flying = mode === 'flight' && ui.screen === 'flight';
    if (flying && !s.restart) {
      return;
    }
    if (flying || mode === 'paused') {
      ui.onAction(s.restart || s.why === 'target' || s.why === 'drift' ? 'restart' : 'resume', ui.settings);
    } else {
      ui.onAction('fly', ui.settings);
    }
  }

  /* This pilot's seat moved to the room's target, which stands its world
   * (syncWorld: the course alone on the world already up, else the
   * loading screen) and lands on the title, to be flown from there. A
   * pilot not to be flown keeps the title's world until their Fly. */
  function roomSeat(target, fly) {
    if (fly) {
      titleWorld = null;
      buildWorld = null;
    }
    const t = target.track;
    if (t) {
      if (seatTrackId() !== t.id) {
        if (!writeShareImport({ id: t.id, name: trackName(t), document: t.doc, local: true })) {
          roomSummon = null;
          return;
        }
        ui.setShare(null);
        notice = { text: str('roomrace.loading', { name: trackName(t) }), untilMs: performance.now() + 3000 };
      }
      ui.settings.map = 'track';
      ui.mode = 'race';
      ui.persistSettings();
      syncWorld();
    } else {
      ui.mode = 'freestyle';
      seatMapOwn(target.world, { stay: true });
    }
    roomTellProfile();
  }

  /* The pickers' way to a world. In a room whose world only its host
   * moves, another world is refused here, before a world is built for
   * nothing; the host's pick is the room's (roomDrift asks it). */
  const seatMapOwn = ui.seatMap.bind(ui);
  ui.seatMap = (id, opts = {}) => {
    const w = roomLinkState.state().phase === 'open' ? roomLinkState.state().welcome : null;
    if (w && id !== w.map && (!roomHost(w) || w.public) && MAPS.some((m) => m.id === w.map && m.mode === 'freestyle')) {
      roomSay(str('rooms.put_back', { world: mapById(w.map).name }));
      return seatMapOwn(w.map, opts);
    }
    return seatMapOwn(id, opts);
  };

  /* The room bar (Ui.setRoomBar), off the sticks: a build too old for the
   * room, the others flying while this pilot is not, or nobody else here. */
  function roomBarView() {
    const st = roomLinkState.state();
    const reload = { text: str('rooms.reload'), button: str('rooms.reload_button'), act: () => window.location.reload(), reload: true };
    if (st.phase === 'failed' && st.reason === 'update') {
      return reload;
    }
    if (st.phase !== 'open' || !st.welcome) {
      return null;
    }
    if (ui.updateReady) {
      return reload;
    }
    /* A game's HUD (the war's, combat's, the Ace's, the race's) owns the
     * screen while it is up: nothing of the room's is drawn over it. The
     * owner's DNSF5B, alone in a war: "ENGAGE IN" under "You are alone". */
    if (roomGameUp()) {
      return null;
    }
    /* Nor on the title, which is never in a room (ui.inRoom). */
    if (ui.screen === 'title') {
      return null;
    }
    const flying = mode === 'flight' && ui.screen === 'flight';
    const now = roomLinkState.roomNow();
    const othersUp = [...roomPeers.values()].some((p) => p.last && now != null && now - p.last.t < 3000);
    if (!flying && othersUp) {
      return {
        text: str('rooms.fly_prompt'),
        button: str('rooms.fly_button'),
        act: () => roomCall('prompt'),
      };
    }
    return roomAloneText(st) ? { text: roomAloneText(st) } : null;
  }
  function roomAloneText(st) {
    return st.phase === 'open' && st.welcome && !st.welcome.public && roomPeers.size === 0 && roomGone.size === 0 && !roomGameUp()
      ? str('rooms.alone', { code: st.code }) : null;
  }
  /* A game on, or combat's card between rounds: its HUD is on screen. */
  function roomGameUp() {
    return roomRunning() != null || roomCombat.round().state === 'over' || roomOps.on();
  }
  let roomBarAt = 0;
  function roomBarFrame(wallMs) {
    if (wallMs < roomBarAt) {
      return;
    }
    roomBarAt = wallMs + 250;
    ui.setRoomBar(roomBarView());
  }

  /*
   * POSES ON THE PLANT'S CLOCK. A pose was sent on a frame, stamped with
   * the frame's time, so a pilot at 5 fps sent five a second and one under
   * 4 fps sent them more than GAP_MS apart (src/game/midair.js), which the
   * referee reads as nobody knowing where they were: a ghost. The audit
   * (scripts/collide-audit-air.js) measured mid airs missed 15 to 56
   * percent at 5 fps and all of them at 3. Now, while the plant flies,
   * the pose is taken from the plant step the room's 30 Hz schedule falls
   * on, stamped with that step's room time, and sent when the frame that
   * stepped it ends: a slow frame sends its poses late, never fewer of
   * them. What is sent is the plant's state at the step, not the drawn
   * one, and the plant's steps never read frame time (CLAUDE.md), so
   * this changes nothing about the flight.
   *
   * A step's room time is the frame's, less the plant time still to run
   * in the block after it: the mapping the radio's samples use (wallToSim
   * in frameBody). Under 10 fps a frame steps at most 100 ms (dt's cap)
   * over a longer wall interval, so the plant falls behind the wall;
   * there the block is spread over the whole interval (k > 1), so the
   * room sees this pilot fly slowly and continuously rather than in bursts
   * with gaps, and the pilot is told the sim is slow (roomSlowFrame).
   */
  function roomPoseFrame(wallMs, wallDt, dt) {
    roomPoseMap = roomLinkState.state().phase === 'open'
      ? { wall: wallMs, k: dt > 0 && wallDt > dt ? wallDt / dt : 1 }
      : null;
  }

  /* One plant step, `ahead` ms of plant time before the block's end. */
  function roomPoseStep(st, ahead) {
    if (!roomPoseMap) {
      return;
    }
    const t = roomLinkState.roomAt(roomPoseMap.wall - ahead * roomPoseMap.k);
    if (t == null || t < roomNextSend) {
      return;
    }
    roomNextSend = Math.max(roomNextSend + 1000 / 30, t - 1000 / 30);
    plantToWorld(st[1], st[2], st[3], st[7], st[8], st[9], st[10], roomStepPos, roomStepQuat);
    /* The wire stamps the whole millisecond (roomwire.js encodePose), and
     * half of one is 3 cm at 65 m/s: the position is carried to the stamp
     * it will have, along the velocity, so the stamp is exact. */
    const stamp = Math.round(t);
    simPosToThree(st[4], st[5], st[6], roomVel).applyQuaternion(qSpawn);
    roomStepPos.addScaledVector(roomVel, (stamp - t) / 1000);
    roomSendPose(stamp, st, roomStepPos, roomStepQuat);
  }

  /*
   * A pilot whose plant cannot keep up with the wall clock is seen by the
   * room in slow motion, and every mid air and bubble is judged on that.
   * Said once every SLOW_WINDOW_MS while it lasts, in flight, in a room.
   */
  function roomSlowFrame(wallMs) {
    roomSlow.wall += lastWallDt;
    roomSlow.over += lastWallDt > FRAME_DT_MAX ? 1 : 0;
    roomSlow.frames += 1;
    if (roomSlow.wall < SLOW_WINDOW_MS) {
      return;
    }
    const fps = (1000 * roomSlow.frames) / roomSlow.wall;
    const slow = 2 * roomSlow.over >= roomSlow.frames;
    roomSlow.wall = 0;
    roomSlow.over = 0;
    roomSlow.frames = 0;
    if (slow && mode === 'flight' && ui.screen === 'flight') {
      notice = { text: str('rooms.sim_slow', { fps: Math.max(1, Math.round(fps)) }), untilMs: wallMs + 4000 };
      roomSlow.said += 1;
    }
  }

  function roomSendPose(now, st, pos, quat) {
    const af = airframeById(runAirframe);
    const quad = !af.fixedWing;
    simPosToThree(st[4], st[5], st[6], roomVel).applyQuaternion(qSpawn);
    /* The turn since the last pose, in the craft's own axes: q_last^-1 q_now
     * as an axis and an angle over the time between them. */
    let wx = 0;
    let wy = 0;
    let wz = 0;
    if (roomLastSendT != null && now > roomLastSendT) {
      roomQStep.copy(roomQLast).invert().multiply(quat);
      if (roomQStep.w < 0) {
        roomQStep.set(-roomQStep.x, -roomQStep.y, -roomQStep.z, -roomQStep.w);
      }
      const sinHalf = Math.hypot(roomQStep.x, roomQStep.y, roomQStep.z);
      if (sinHalf > 1e-9) {
        const k = (2 * Math.atan2(sinHalf, roomQStep.w)) / sinHalf / ((now - roomLastSendT) / 1000);
        wx = roomQStep.x * k;
        wy = roomQStep.y * k;
        wz = roomQStep.z * k;
      }
    }
    roomQLast.copy(quat);
    roomLastSendT = now;
    const surf = !quad && wingSurfPtr ? new Float64Array(sim.e.memory.buffer, wingSurfPtr, 4) : null;
    /* rad/s, the wire's unit (src/share/roomwire.js): the plant reports
     * rpm, and sending rpm in a field of 40 rad/s counts clamped every
     * quad above 5,080 rpm, so hover and every punch went out the same. */
    const rotors = [st[14] / RPM_PER_RAD_S, st[15] / RPM_PER_RAD_S, st[16] / RPM_PER_RAD_S, st[17] / RPM_PER_RAD_S];
    const gear = typeof sim.e.sim_wing_gear === 'function' ? sim.e.sim_wing_gear() : 0;
    const chute = typeof sim.e.sim_wing_chute_open === 'function' ? sim.e.sim_wing_chute_open() : 0;
    const fitted = PROPS[runAirframe] ? partsEntry(ui.settings.parts, runAirframe).addons : [];
    const flags = (landed ? 0 : FLAG_AIRBORNE)
      | (wrecked ? FLAG_CRASHED : 0)
      | (roomSpawning(now) ? FLAG_SPAWNING : 0)
      | (smokeLive ? FLAG_SMOKE : 0)
      | (fitted.includes('lights') ? FLAG_LIGHTS : 0)
      | (chute > 0 ? FLAG_CHUTE : 0)
      | (gear < 0.5 ? FLAG_GEAR_DOWN : 0)
      | (quad ? FLAG_QUAD : 0);
    roomSeq = (roomSeq + 1) & 0xffff;
    roomSentPose = {
      flags,
      seq: roomSeq,
      t: now,
      px: pos.x,
      py: pos.y,
      pz: pos.z,
      qx: quat.x,
      qy: quat.y,
      qz: quat.z,
      qw: quat.w,
      vx: roomVel.x,
      vy: roomVel.y,
      vz: roomVel.z,
      wx,
      wy,
      wz,
      c0: surf ? surf[0] : rotors[0],
      c1: surf ? surf[1] : rotors[1],
      c2: surf ? surf[2] : rotors[2],
      c3: surf ? surf[3] : rotors[3],
      motor: quad ? (rotors[0] + rotors[1] + rotors[2] + rotors[3]) / 4 : rotors[0],
      flaps: typeof sim.e.sim_wing_flaps === 'function' ? sim.e.sim_wing_flaps() : 0,
    };
    roomLinkState.sendPose(encodePose(roomSentPose));
  }

  /* Everything of a peer's that is drawn, put away. */
  function roomHidePeer(peer) {
    if (peer.rig) {
      peer.rig.group.visible = false;
      if (peer.rig.smoke) {
        peer.rig.smoke.visible = false;
      }
    }
    if (peer.figure) {
      peer.figure.group.visible = false;
    }
    if (peer.wreck) {
      peer.wreck.group.visible = false;
    }
  }

  /* The named mark for a pilot in the room who is not drawn here. A world
   * this page does not have (a newer build's) is named as another world. */
  function roomAwayText(peer) {
    const name = roomName(peer.name);
    /* The reason the pilot's own page gave, when it gave one: a pilot
     * loading a world still names the one they are leaving. */
    const status = peer.profile && peer.profile.status;
    if (status) {
      return str(`rooms.away_${status}`, { name });
    }
    if (peer.away === 'idle') {
      return str('rooms.away_idle', { name });
    }
    const world = MAPS.find((m) => m.id === peer.profile.map);
    return world ? str('rooms.away_world', { name, world: world.name }) : str('rooms.away_elsewhere', { name });
  }

  /*
   * THE OTHER PILOTS, HEARD (src/render/audio.js updatePeers): each drawn
   * peer's engine from its aircraft (its profile's, on stock power: the
   * wire does not carry the power option) and the rotor speeds it sends,
   * where it is drawn, from where the camera is. The audio picks the few it
   * has voices for. A crashed or hidden peer is not in the list, so its
   * voice fades.
   */
  const peerHeard = [];
  /* An airframe's engine, for the replay's pilots, made once each. */
  const replaySpecs = new Map();
  const camRight = new THREE.Vector3();
  function roomHearPeers() {
    peerHeard.length = 0;
    if (mode !== 'replay') {
      for (const peer of roomPeers.values()) {
        /* Where it is drawn, and what its newest sample says it is doing
         * (the drawn pose carries position and attitude only). */
        const at = peer.drawnPose;
        const p = peer.last;
        if (!at || !p || (p.flags & FLAG_CRASHED) || !peer.rig || !peer.rig.group.visible) {
          continue;
        }
        if (!peer.audio || peer.audio.key !== peer.profile.airframe) {
          peer.audio = {
            key: peer.profile.airframe,
            id: peer.seat,
            spec: airframeById(peer.profile.airframe) ? engineSpecFor(peer.profile.airframe, {}, {}) : null,
            rpm: [0, 0, 0, 0],
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          };
        }
        const a = peer.audio;
        /* The wire's rotor speeds are rad/s (src/share/roomwire.js). */
        const quad = (p.flags & FLAG_QUAD) !== 0;
        a.rpm[0] = (quad ? p.c0 : p.motor) * RPM_PER_RAD_S;
        a.rpm[1] = quad ? p.c1 * RPM_PER_RAD_S : 0;
        a.rpm[2] = quad ? p.c2 * RPM_PER_RAD_S : 0;
        a.rpm[3] = quad ? p.c3 * RPM_PER_RAD_S : 0;
        a.x = at.px;
        a.y = at.py;
        a.z = at.pz;
        a.vx = p.vx;
        a.vy = p.vy;
        a.vz = p.vz;
        peerHeard.push(a);
      }
    } else if (crashCam) {
      /* The replay's pilots, where and how they flew then. */
      for (const h of crashCam.peersHeard() || []) {
        if (!replaySpecs.has(h.airframe)) {
          replaySpecs.set(h.airframe, h.airframe && airframeById(h.airframe) ? engineSpecFor(h.airframe, {}, {}) : null);
        }
        h.spec = replaySpecs.get(h.airframe);
        peerHeard.push(h);
      }
    }
    const cam = shell.camera;
    camRight.setFromMatrixColumn(cam.matrixWorld, 0);
    audio.setListener(cam.position.x, cam.position.y, cam.position.z, camRight.x, camRight.y, camRight.z,
      groundAt(cam.position.x, cam.position.z));
    audio.updatePeers(peerHeard);
  }

  function roomDrawPeer(peer, now, scene, dt, simT, drawNow) {
    /* The replay draws the room as it was (src/replay/peerscene.js), so
     * the room as it is now is put away until flight resumes. */
    if (mode === 'replay') {
      peer.away = null;
      roomHidePeer(peer);
      return;
    }
    /* Struck: held where it was drawn at the hit until its own stream
     * carries what its plant did about it. */
    if (peer.frozenUntil > now && peer.rig && peer.rig.group.visible) {
      return;
    }
    const here = Boolean(view) && peer.profile && peer.profile.map === view.id;
    const drawn = Boolean(scene) && here && peer.last && peer.track.sample(drawNow, nearWeight(Math.hypot(
      peer.last.px - pCurr.x, peer.last.py - pCurr.y, peer.last.pz - pCurr.z,
    )), roomDrawn);
    peer.drawnPose = drawn ? Object.assign(peer.drawnPose || {}, roomDrawn) : null;
    /* Why a pilot in the room is not drawn, for the named mark on screen
     * (peerMarks.away): in another world, or sending nothing (paused, a
     * menu, a hidden tab). */
    peer.away = drawn ? null : (here ? 'idle' : 'world');
    if (!drawn) {
      if (peer.rig) {
        peer.rig.group.visible = false;
      }
      if (peer.figure) {
        peer.figure.group.visible = false;
      }
      return;
    }
    if (!peer.rig || peer.rig.key !== profileKey(peer.profile)) {
      if (peer.rig) {
        peer.rig.dispose();
      }
      peer.rig = buildPeerCraft(peer.profile, (craft) => shell.lookCraft(craft));
      peer.rig.setLabel(roomName(peer.name));
    }
    if (!peer.figure || peer.figure.look !== peer.profile.figure) {
      if (peer.figure) {
        peer.figure.dispose();
      }
      peer.figure = buildPilotFigure(peer.profile.figure);
      peer.figure.look = peer.profile.figure;
      peer.figure.setLabel(roomName(peer.name));
    }
    if (peer.rig.group.parent !== scene) {
      scene.add(peer.rig.group);
    }
    if (peer.rig.smoke && peer.rig.smoke.parent !== scene) {
      scene.add(peer.rig.smoke);
    }
    if (peer.rig.smoke) {
      peer.rig.smoke.visible = true;
    }
    if (peer.figure.group.parent !== scene) {
      scene.add(peer.figure.group);
    }
    /* A muted pilot's aircraft is still drawn, for everyone's safety in
     * the air, but not their name. */
    const label = roomSafety.isMuted(peer.seat) ? '' : voiceUi.label(peer.seat, roomTagName(peer.seat, roomName(peer.name)));
    peer.rig.setLabel(label);
    peer.figure.setLabel(label);
    peer.rig.group.visible = true;
    peer.rig.pose(roomDrawn, peer.last, dt, simT, shell.canvas.clientHeight || 720, shell.camera.fov);
    roomPeerWreck(peer, scene);
    const st = stationFor(view.spawn || { x: 0, z: 0, yaw: 0 }, peer.seat - 1);
    peer.figure.group.position.set(st.x, groundAt(st.x, st.z), st.z);
    peer.figure.group.rotation.y = (view.spawn && view.spawn.yaw) || 0;
    peer.figure.group.visible = true;
    peer.figure.lookAt(roomDrawn.px, roomDrawn.py, roomDrawn.pz);
  }

  /*
   * MID AIR (docs/MULTIPLAYER-PLAN.md section 6, src/game/midair.js). The
   * room judges contact and sends one `hit` to everyone; the two it names
   * each apply their own side to their own plant at the next 1 ms step
   * (roomMidairStep, in the step loop), through the journaled module, so
   * the crash cam's replay flies it again to the bit. Everyone flashes
   * the contact where it happened and holds the struck aircraft where it
   * was drawn until its crash event brings its shared wreck (Phase 2,
   * roomEvent), or ROOM_FREEZE_MS if it broke nothing that makes one.
   *
   * SPAWNING: for the five seconds after a flight starts, and until 30 m
   * from where it started, this aircraft is flagged untouchable, and the
   * room neither hits it nor lets it hit anyone (section 6.2, rule 5).
   */
  const ROOM_SPAWN_MS = 5000;
  const ROOM_SPAWN_M = 30;
  const ROOM_FREEZE_MS = 600;
  const roomSpawn = { at: -Infinity, x: 0, y: 0, z: 0, clear: true, simT: Infinity };
  let roomMidairSide = null;
  const roomHits = [];
  const roomFlashAt = new THREE.Vector3();
  const roomFlashN = new THREE.Vector3();

  function roomSpawning(now) {
    const simT = stateCurr[0];
    /* A new flight, or R: the sim clock starts again from zero. */
    if (simT < roomSpawn.simT) {
      Object.assign(roomSpawn, { at: now, x: pCurr.x, y: pCurr.y, z: pCurr.z, clear: false });
    }
    roomSpawn.simT = simT;
    if (!roomSpawn.clear && Math.hypot(pCurr.x - roomSpawn.x, pCurr.y - roomSpawn.y, pCurr.z - roomSpawn.z) >= ROOM_SPAWN_M) {
      roomSpawn.clear = true;
    }
    return now - roomSpawn.at < ROOM_SPAWN_MS || !roomSpawn.clear;
  }

  function roomHit(m) {
    if (!checkHit(m)) {
      return;
    }
    const st = roomLinkState.state();
    const me = st.welcome ? st.welcome.seat : null;
    const now = roomLinkState.roomNow();
    const side = sideFor(m, me);
    roomHits.push({ id: m.id, tc: m.tc, a: m.a, b: m.b, p: m.p, mine: Boolean(side), at: now, applied: null });
    if (side && mode === 'flight') {
      roomMidairSide = side;
    }
    /* Held where it was drawn until its crash event (Phase 2's wreck,
     * roomEvent) arrives, at most ROOM_FREEZE_MS; a peer already showing
     * its wreck is left to it. */
    for (const seat of [m.a, m.b]) {
      const peer = roomPeers.get(seat);
      if (peer && !peer.wreckTable) {
        peer.frozenUntil = (now ?? 0) + ROOM_FREEZE_MS;
      }
    }
    const scene = shell.quad.parent;
    if (scene && view && debris.group.parent !== scene) {
      scene.add(debris.group);
    }
    if (view) {
      roomFlashAt.set(m.p[0], m.p[1], m.p[2]);
      roomFlashN.set(m.n[0], m.n[1], m.n[2]);
      const floorY = view.height(m.p[0], m.p[2], m.p[1] + 0.5);
      const closing = Math.hypot(m.va[0] - m.vb[0], m.va[1] - m.vb[1], m.va[2] - m.vb[2]);
      debris.emit(roomFlashAt, roomFlashN, closing, -1, m.B.mat, floorY, 'break');
      debris.emit(roomFlashAt, roomFlashN.negate(), closing, -1, m.A.mat, floorY, 'break');
    }
  }

  /* Before a 1 ms step: this pilot's side of a hit, if one has come. */
  function roomMidairStep(st) {
    if (!roomMidairSide) {
      return st;
    }
    const side = roomMidairSide;
    roomMidairSide = null;
    const r = applyHit(sim.e, side, st);
    const h = roomHits[roomHits.length - 1];
    if (h) {
      h.applied = { rc: r.rc, brk: r.brk, simT: st[0] };
    }
    if (crashCam) {
      crashCam.noteCrash('midair');
    }
    return readState();
  }

  /* Harness only: the peer marks as planned this frame, and a role to
   * try one with, for scripts/peermarks-two-page.js. */
  window.__peerMarks = () => peerMarks.summary();
  window.__peerMarkRole = (seat, role) => peerMarks.setRole(seat, role);
  /* Harness only: the room and what is drawn of it, for
   * scripts/rooms-two-page.js. */
  window.__rooms = () => {
    const st = roomLinkState.state();
    return {
      phase: st.phase,
      reason: st.reason,
      code: st.code,
      seat: st.welcome ? st.welcome.seat : null,
      slot: roomSlot,
      roomNow: roomLinkState.roomNow(),
      slowSaid: roomSlow.said,
      public: Boolean(st.welcome && st.welcome.public),
      name: st.welcome ? st.welcome.name : null,
      /* What the room was made for (null free flight), and its lobby. */
      mode: st.welcome ? st.welcome.mode ?? null : null,
      lobby: st.welcome && st.welcome.lobby ? { ...st.welcome.lobby } : null,
      host: st.welcome ? st.welcome.host : null,
      /* The watch seat: the pilot the camera follows, and how far the
       * camera is from where that pilot is drawn, metres. */
      watch: Boolean(st.welcome && st.welcome.watch),
      watching: fr.watching ? fr.watching.seat : null,
      watchGap: fr.watching ? shell.camera.position.distanceTo(new THREE.Vector3(fr.watching.drawnPose.px, fr.watching.drawnPose.py, fr.watching.drawnPose.pz)) : null,
      heard: roomSafety.heard(),
      note: roomSafety.note(),
      peers: [...roomPeers.values()].map((p) => ({
        seat: p.seat,
        name: roomName(p.name),
        muted: roomSafety.isMuted(p.seat),
        label: p.rig ? p.rig.label() : null,
        airframe: p.profile.airframe,
        map: p.profile.map,
        livery: p.profile.livery,
        drawn: Boolean(p.rig && p.rig.group.visible),
        drawnAirframe: p.rig ? p.rig.airframe : null,
        at: p.rig ? p.rig.group.position.toArray() : null,
        paint: p.rig ? p.rig.paint() : null,
        decals: p.rig ? p.rig.decals() : null,
        figure: p.figure ? p.figure.group.position.toArray() : null,
        wreck: p.wreck ? p.wreck.summary() : null,
        status: p.profile.status ?? null,
        flags: p.last ? p.last.flags : null,
      })),
      /* The session (THE ROOM IS ONE SESSION): the room's world, this
       * pilot's own status, a summon still owed, the room bar's words. */
      world: st.welcome ? st.welcome.map : null,
      status: roomStatus(),
      summon: roomSummon ? { ...roomSummon } : null,
      seatWorld: seatWorld(),
      seatTrack: seatTrackId(),
      target: st.welcome ? roomTargetKey(roomTarget(st.welcome)) : null,
      standing: worldMatchesSettings(),
      bar: ui.roomBarView ? ui.roomBarView.text : null,
      gone: [...roomGone.keys()],
      hits: roomHits.map((h) => ({ ...h })),
      spawning: stateCurr ? roomSpawning(roomLinkState.roomNow() ?? 0) : null,
      /* This pilot's own pieces as drawn here, to hold against a peer's
       * drawing of them. */
      ownWreck: wreckRig.poses(),
    };
  };
  /* Harness only: every slot and station on this map, with the ground
   * under it and the clearance round it, for scripts/rooms-slots-check.js.
   * The water slots are the floats' start's, on the water or not. */
  window.__roomSlots = () => {
    const sp = view.spawn;
    const wet = view.water && view.water[0] ? view.water[0].spawn : null;
    const probe = (p) => {
      const y = groundAt(p.x, p.z);
      return { x: p.x, z: p.z, y, gap: view.colliders ? view.colliders.gapAt(p.x, y + 1, p.z, 6) : Infinity };
    };
    return {
      spawn: probe(sp),
      slots: SLOT_RIGHT_M.map((_, i) => probe(slotSpawn(sp, i))),
      stations: SLOT_RIGHT_M.map((_, i) => probe(stationFor(sp, i))),
      water: wet ? SLOT_RIGHT_M.map((_, i) => {
        const p = slotSpawn(wet, i);
        return { x: p.x, z: p.z, wet: Boolean(waterAt(p.x, p.z)) };
      }) : null,
    };
  };
  /* Harness only: the combat round and what this page draws of it, for
   * scripts/combat-two-page.js. */
  window.__combat = () => {
    const paper = roomCombat.paper();
    const now = roomLinkState.roomNow();
    const chains = (list) => list.map((c) => ({
      id: c.id, n: c.n, low: Math.min(...Array.from({ length: c.n }, (_, i) => c.x[i * 3 + 1])), head: [c.x[0], c.x[1], c.x[2]],
      nodes: Array.from({ length: c.n }, (_, i) => [c.x[i * 3], c.x[i * 3 + 1], c.x[i * 3 + 2]]),
    }));
    return {
      seat: roomCombat.seat(),
      round: roomCombat.round(),
      paper: paper ? { links: paper.length(), pull: paper.towTension(), chains: chains(paper.chains()) } : null,
      peers: [...roomPeers.keys()].map((seat) => ({ seat, chains: chains(roomCombat.peerChains(seat, now)) })),
      cuts: roomCombat.cuts(),
      ribbons: combatLayer.count(),
      /* Each seat's paper as the room holds it, and as this page draws it:
       * colour seats in runs, tow point first, per drawn chain. */
      runs: Object.fromEntries([roomCombat.seat(), ...roomPeers.keys()].map((s) => [s, roomCombat.runs(s)])),
      drawnRuns: Object.fromEntries([roomCombat.seat(), ...roomPeers.keys()].map((s) => [s, combatLayer.colours(s)])),
      effects: combatLayer.effects(),
      /* The SCHWING voice exists once the sound is up, and every cut rings
       * it: how many times it was struck. */
      schwing: { voice: Boolean(audio.schwingVoice), struck: audio.schwings || 0 },
      hud: combatHud.shown(),
      said: combatHud.said(),
    };
  };
  window.__combatStart = (minutes) => roomCombat.start(minutes);
  /* Defend Itaipu for the checks (scripts/war-twopage.js --main), the same
   * three the wire module gave it: the war as this page holds it, where
   * every attacker is at a room ms, and the host's start (or 'brief', the
   * start behind the intro's briefing) and end; and the radio link, which
   * a war must leave as the preset has it. */
  window.__war = () => ({
    fx: warBooms.stats(),
    shake: warShakePeak,
    feedHeldMs: warFeedHeldMs,
    boomSound: { rung: (audio.booms || 0) + worldAudio.booms, world: worldAudio.booms, heard: worldAudio.stats, nodes: typeof audio.nodeCount === 'function' ? audio.nodeCount() : 0, peakNodes: warAudioPeak },
    seat: roomWar.seat(),
    view: roomWar.view(),
    error: roomWar.error(),
    drawn: { ...warAttackers.drawn(), at: warDrawnAt },
    night: warTimeLog.slice(),
    craft: warCraftLog.slice(),
    /* Each power district 'lit', 'flicker' or 'dark' now, and what the
     * map was handed (src/share/war/grid.js). */
    grid: {
      at: roomLinkState.roomNow(),
      state: warGrid.state(roomWar.view(), roomLinkState.roomNow()),
      map: view && view.scene && view.scene.userData.itaipu && view.scene.userData.itaipu.look.night()
        ? view.scene.userData.itaipu.look.night().levels() : null,
    },
    hud: warHud.shown(),
    round: warRoundCard.shown(),
    markers: warMarkers.shown(),
    said: warHud.said(),
    link: {
      perfect: rcLink.isPerfect(), delayMs: rcLink.sigDelayMs, lossPpm: rcLink.sigLossPpm, failsafe: rcLink.failsafeRc !== null,
    },
    radio: audio.warRadio ? audio.warRadio.status() : null,
    watch: {
      on: warSpectating(), seat: warWatchSeat, cam: shell.camera.position.toArray(), wrecked, banner: ui.bannerText,
    },
    damage: runDamage,
    breakage: {
      ...warBreakage.stats(),
      heard: roomWar.damage().length,
      retired: view && view.colliders && view.colliders.retired ? view.colliders.retired() : 0,
      staticColliders: view && view.colliders ? view.colliders.staticCount : 0,
    },
    openings: warOpenings.slice(),
    burning: Object.fromEntries(warBurning),
    log: warLog.map((e) => ({
      type: e.type, why: e.why, ids: e.ids, seat: e.seat, by: e.by, at: e.at, p: e.p, target: e.target, hit: e.hit, mine: e.mine, to: e.to,
    })),
  });
  window.__warAt = (t) => roomWar.attackersAt(t);
  window.__wear = () => ({
    sortie: sortie ? { airframe: sortie.airframe, packId: sortie.packId, fullS: sortie.fullS, flew: sortie.lastTs >= 0 } : null,
    seated: wornSeated,
    delta: ui.wearDelta ?? null,
  });
  /* For scripts/replay-world.js: a room message handed to the war as the
   * room's socket hands it (the check scripts a war's hits and struck
   * lines on a real room's match), what the map shows now (each target
   * not whole, each district's level), and each live frame's map, logged
   * while switched on. */
  window.__warHear = (m) => roomWar.onMessage(m);
  /* What the structures show now, for the checks: the chunks out, and
   * each piece of rubble where it lies, rounded to the millimetre. */
  function warBroken() {
    const b = warBreakage.stats();
    return {
      gone: b.gone, pieces: b.poses.map((pc) => `${pc.target}/${pc.chunk}:${pc.p.map((x) => Math.round(x * 1000)).join(',')}`).join(' '),
    };
  }
  window.__warMap = () => {
    const it = view && view.scene && view.scene.userData.itaipu;
    if (!it) {
      return null;
    }
    const targets = {};
    for (const id of Object.keys(view.targets || {})) {
      const s = it.parts.dam.targetState(id);
      if (s !== 'ok') {
        targets[id] = s;
      }
    }
    return { targets, levels: it.look.night() ? it.look.night().levels() : null, broken: warBroken() };
  };
  window.__warMapLog = (on) => {
    warMapLog = on ? [] : null;
    return true;
  };
  window.__warMapLogged = () => warMapLog || [];
  /* A swarm's worth of explosions at once, 150 m ahead of the camera, for
   * scripts/war-boom.js: the frame's draw calls and time over 40 frames
   * before and during, and whether the pools held. */
  window.__warFxBurst = async (n = 10) => {
    const frames = (k) => new Promise((resolve) => {
      const ms = [];
      let last = performance.now();
      let calls = 0;
      const f = () => {
        const t = performance.now();
        ms.push(t - last);
        last = t;
        calls = Math.max(calls, renderStats.calls);
        if (ms.length >= k) {
          ms.sort((x, y) => x - y);
          resolve({ ms: ms[ms.length >> 1], calls });
        } else {
          requestAnimationFrame(f);
        }
      };
      requestAnimationFrame(f);
    });
    const base = await frames(40);
    const before = warBooms.stats();
    const c = shell.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    for (let i = 0; i < n; i += 1) {
      const side = (i - (n - 1) / 2) * 12;
      warBoomEvent({
        type: 'boom', p: [c.position.x + fwd.x * 150 + side, c.position.y + fwd.y * 150 + 10, c.position.z + fwd.z * 150], mine: false,
      });
    }
    const during = await frames(40);
    const s = warBooms.stats();
    const cpu = [];
    for (let k = 0; k < 20; k += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      cpu.push(warBooms.stats().updateMs);
    }
    cpu.sort((x, y) => x - y);
    return {
      baseCalls: base.calls, calls: during.calls, addedCalls: during.calls - base.calls, baseMs: base.ms, ms: during.ms,
      grown: s.pool - before.pool, dropped: s.dropped - before.dropped, hotLive: s.hotLive, smokeLive: s.smokeLive, updateMs: cpu[cpu.length >> 1],
    };
  };
  /* The intro while it plays (warintro.js state()), or null; and the
   * host's Watch intro, for the checks. Harness only. */
  window.__warIntro = () => (warIntro ? { for: warIntroFor, ...warIntro.state() } : null);
  window.__warCutaway = () => warCutaway.state();
  window.__warCutawayTest = (cue, pip) => warCutaway.request(cue, performance.now(), null, pip);
  window.__warIntroWatch = () => warIntroWatch();
  window.__warDo = (op, arg) => {
    if (op === 'start') {
      roomWar.start(arg || WAR_MISSION);
    } else if (op === 'brief') {
      roomWar.start(arg || WAR_MISSION, { intro: true });
    } else if (op === 'end') {
      roomWar.end();
    }
    return true;
  };
  window.__roomJoin = (code) => roomLinkState.join(code);
  window.__roomJoinPublic = (map) => roomLinkState.joinPublic(map || (view ? view.id : worldId()));
  window.__roomSay = (kind, id) => roomSafety.say(kind, id);
  window.__roomMute = (seat, on) => roomSafety.setMuted(seat, on);
  window.__roomCreate = async (room = {}) => {
    const code = await roomLinkState.create(room.map || (view ? view.id : worldId()), false, room);
    roomLinkState.join(code);
    return code;
  };

  /* The title's and the pause menu's row. Null on a page with no rooms
   * server, so there is no row that can only fail. */
  ui.friendsRow = () => {
    if (!roomLinkState.available()) {
      return null;
    }
    const st = roomLinkState.state();
    if (st.phase === 'open') {
      const here = roomHere();
      return {
        value: roomHereText(st.welcome && st.welcome.public
          ? str('friends.row_in_public', { name: roomBrowser.title(st.welcome), n: here.n })
          : str('friends.row_in', { code: st.code, n: here.n }), here.bots),
        note: str('friends.row_in_note'),
        inRoom: true,
      };
    }
    if (st.phase === 'connecting') {
      const unlisted = !st.publicMap && !roomBrowser.listed(st.code);
      return { value: unlisted ? str('friends.row_joining', { code: st.code }) : str('friends.row_joining_public'), note: str('friends.row_in_note') };
    }
    return { value: '', note: str('friends.row_off') };
  };

  ui.friendsRows = () => {
    const st = roomLinkState.state();
    const pick = namePick();
    if (!roomNameOffer) {
      roomNameOffer = [pick, randomNamePick(), randomNamePick()];
    }
    const offers = roomNameOffer.map((p) => JSON.stringify(p));
    /* Signed in, the room shows the callsign, which is changed in Pilot. */
    const nameRow = readAccount()?.callsign ? {
      label: str('friends.name'), note: str('account.room_name_note'), value: ownName(), info: true,
    } : {
      label: str('friends.name'),
      note: str('friends.name_note'),
      value: roomName(pick),
      current: JSON.stringify(pick),
      options: offers.map((o) => ({ value: o, label: roomName(JSON.parse(o)) })),
      pick: (v) => {
        setNamePick(JSON.parse(v));
        ui.refreshFriends();
      },
      adjust: (d) => {
        const i = offers.indexOf(JSON.stringify(namePick()));
        setNamePick(JSON.parse(offers[(i + d + offers.length) % offers.length]));
        ui.refreshFriends();
      },
    };
    const figure = figurePick();
    const figureRow = {
      label: str('friends.figure'),
      note: str('friends.figure_note'),
      value: str('friends.figure_value', { n: figure + 1, total: FIGURE_COUNT }),
      adjust: (d) => {
        setFigurePick((figurePick() + d + FIGURE_COUNT) % FIGURE_COUNT);
        ui.refreshFriends();
      },
    };
    if (st.phase === 'open' || st.phase === 'connecting') {
      const w = st.welcome;
      /* A public room has a host too, since the room browser: the pilot
       * in longest, who starts its games. Kicking stays a private room's. */
      const host = w && w.host === w.seat;
      const kicks = host && !w.public;
      /* Every other pilot here: mute, report, make host (and kick, a
       * private room's host), and their voice. */
      const peopleRows = () => {
        const out = [];
        for (const peer of roomPeers.values()) {
          const craft = airframeById(peer.profile.airframe).name;
          /* An AI pilot has no voice, says nothing, and cannot be kicked
           * or handed the room: its row only says what it is. */
          if (roomBot(peer)) {
            out.push({ label: roomName(peer.name), value: craft, note: str('friends.bot_note'), info: true });
            continue;
          }
          const muted = roomSafety.isMuted(peer.seat);
          const shown = muted ? str('friends.peer_muted', { name: roomName(peer.name) }) : roomName(peer.name);
          /* A report picked from this row asks here before it is sent. */
          const question = roomSafety.question(peer.seat);
          out.push({
            label: question || (w && peer.seat === w.host ? str('friends.peer_host', { name: shown }) : shown),
            value: craft,
            note: question ? str('friends.report_confirm_note')
              : str(kicks ? 'friends.peer_note_host' : 'friends.peer_note', { craft, world: mapById(peer.profile.map).name }),
            current: '',
            pickOnly: true,
            /* The host hands the room over from any pilot's row. */
            options: [...roomSafety.peerOptions(peer.seat, kicks), ...(host && !question ? [{ value: 'handhost', label: str('friends.make_host') }] : [])],
            pick: (v) => {
              const picked = roomSafety.peerPick(peer.seat, v);
              if (picked === 'kick') {
                roomLinkState.kick(peer.seat);
              } else if (picked === 'handhost') {
                roomLinkState.send({ type: 'handhost', seat: peer.seat });
              }
              ui.refreshFriends();
            },
          });
          out.push(...voiceUi.peerRows(peer.seat, shown));
          out.push(...roomSafety.undoRows(peer.seat).map((row) => ({
            ...row,
            pick: (v) => {
              row.pick(v);
              ui.refreshFriends();
            },
          })));
        }
        return out;
      };
      /* A lobby is a room screen too: under its own rows, the room's name
       * and its report, what to say, voice and every pilot's row, then
       * Leave (the owner's safety rows are every room's). */
      if (gameLobby()) {
        const lobbyRows = gameLobbyRows(host);
        const leave = lobbyRows.filter((it) => it.action === 'friends-leave');
        return [
          ...lobbyRows.filter((it) => it.action !== 'friends-leave'),
          ...roomBrowser.nameRows(w),
          ...roomSafety.sayRows(),
          ...voiceUi.rows(),
          ...peopleRows(),
          ...leave,
        ];
      }
      const world = w ? mapById(w.map).name : '';
      /*
       * A PRIVATE ROOM'S GAMES, ALL THREE, right under the screen's Fly
       * (src/ui/ui.js), under one heading: the race, Catch the Ace and
       * toilet paper combat, each with its start row. Combat used to sit
       * below the pilot rows, and the owner, hosting, saw Catch the Ace
       * and no toilet paper at all. Public rooms have them too, since the
       * room browser gave them a host.
       *
       * A room set up for a game puts that game first, its start row the
       * primary under the host's cursor, and the heading says what the
       * room is for, to everybody in it. The room says so itself when it
       * was made for one (Make a room, welcome.mode); otherwise the host's
       * game is its own card's and a joiner's the host's, from the host's
       * profile.
       */
      const hostPeer = w && !host ? roomPeers.get(w.host) : null;
      const wanted = w ? (w.mode || (host ? ui.roomGame : (hostPeer && hostPeer.profile.game)) || null) : null;
      /* A title card's game outlives the room it was picked for: a pilot
       * who pressed Defend Itaipu and then went into a public room still
       * carries 'war', and the heading said the public room was set up for
       * it. The room says it only where the war may run; elsewhere its
       * block still leads, saying why not. */
      const game = wanted === 'war' && !warFits(w) ? null : wanted;
      const lead = (rows, action) => rows.map((it) => (it.action === action ? { ...it, primary: true } : it));
      const blocks = {
        race: roomRaceRows(host),
        tag: [...(game === 'tag' ? lead(roomTagRows(host), 'friends-tag-start') : roomTagRows(host)), ...roomBotRows(host)],
        combat: combatRows(host, w, game === 'combat'),
        jam: jamRows(host, w, game === 'jam'),
        war: warRows(host, w),
      };
      /* Defend Itaipu last, unless the room or its pilot came for it, and
       * only on Itaipu (warRows): a public room there says why not. */
      const first = game || (wanted === 'war' ? 'war' : null);
      const order = first ? [first, ...['race', 'tag', 'combat', 'jam', 'war'].filter((g) => g !== first)] : ['race', 'tag', 'combat', 'jam', 'war'];
      const games = [
        {
          label: game ? str('friends.games_for', { game: str(GAME_CARDS[game]) }) : str('friends.games'),
          section: true,
        },
        ...roomEndRows(host, w),
        /* Who starts the games, for everybody else: without it a pilot
         * who is not the host sees rows that do nothing and no reason. */
        ...(w && !host ? [{ label: str('friends.host_starts', { name: roomSeatName(w.host) }), info: true }] : []),
        ...order.flatMap((g) => blocks[g]),
        { label: str('roomrace.room_section'), section: true },
      ];
      const rows = [
        ...roomRefusalRows(),
        ...games,
        ...roomBrowser.nameRows(w),
        /* A public room's code is how the browser joins it, never shown. */
        (w ? w.public : st.publicMap)
          ? { label: str('friends.public_row'), value: world, note: str('friends.public_row_note'), info: true }
          : { label: str('friends.code_row'), value: st.code, note: roomNote || str('friends.code_note'), action: 'friends-copy' },
        {
          label: str('friends.here'),
          value: roomHereText(str('friends.here_value', { n: roomHere().n, cap: w ? w.cap : 8 }), roomHere().bots),
          note: str('friends.here_note'),
          info: true,
        },
        { label: str(host ? 'friends.you_host' : 'friends.you', { name: roomName(ownName()) }), value: airframeById(runAirframe).name, info: true },
        ...roomSafety.sayRows(),
        ...voiceUi.rows(),
      ];
      rows.push(...peopleRows());
      rows.push(nameRow, figureRow, { label: str('friends.leave'), note: str('friends.leave_note'), action: 'friends-leave' });
      return rows;
    }
    const failed = st.phase === 'failed' && st.reason ? str(`friends.failed_${st.reason}`) : null;
    /*
     * Rooms first, under the cursor, whether or not the server has public
     * rooms open: the Rooms screen says so, and still makes private ones.
     * A game's title card (ui.roomGame) puts Make a room first instead,
     * its game set up already, under that game's heading.
     */
    const make = { label: str('friends.create'), note: failed || str('friends.create_note'), action: 'roomnew', primary: Boolean(ui.roomGame) };
    const browse = roomBrowser.entryRow(failed);
    return [
      ...(ui.roomGame ? [{ label: str(GAME_CARDS[ui.roomGame]), section: true }, make, { ...browse, primary: false }] : [browse, make]),
      { label: str('friends.join'), note: failed || str('friends.join_note'), action: 'friends-join' },
      nameRow,
      figureRow,
    ];
  };

  /* Defend the Paraná (src/ui/campaign.js): its card opens its screen,
   * its Play goes the Defend Itaipu card's way in, and the start row of
   * the room it made starts the chosen mission. */
  const campaign = createCampaignScreen({
    ui,
    /* ?missions=dev offers the missions in development too, for the
     * checks against their own rooms server (DEV_MISSIONS); the VM's room
     * refuses them whatever this page offers (edge/rooms/war.js). */
    devMissions: new URLSearchParams(window.location.search).get('missions') === 'dev',
    /* The owner skips the win first lock: the rooms server's word for
     * this session, not the page's. */
    devAccount,
    /* From a war lobby (its Campaign row), Play sets that room's mission,
     * the host's to set, and the pilot is back in the lobby to say ready;
     * from anywhere else, the war's way in. */
    enterWarRoom: async (mission) => {
      if (lobbyGame() !== 'war') {
        /* Play is the press that made this room, so its Back undoes it:
         * out of the room, onto this page again. Back on the consent, or
         * on a room the server would not make, is this page too. */
        const code = await ui.onWarCard('way-war', mission);
        if (!code) {
          campaign.open();
          return null;
        }
        ui.lobbyCard = 'way-campaign';
        lobbyCardCode = code;
        lobbyCardBack = () => campaign.open();
        return code;
      }
      if (roomHost(roomLinkState.state().welcome)) {
        roomLinkState.send({ type: 'lobby', op: 'mission', mission });
      }
      ui.show('friends');
      return roomLinkState.state().code;
    },
    send: (obj) => roomLinkState.send(obj),
    view: () => roomWar.view(),
    room: () => {
      const st = roomLinkState.state();
      return { phase: st.phase, code: st.code, seat: roomWar.seat() };
    },
    /* A combat quad's chosen payload is its warhead (configs/combat.js). */
    craftWarhead: (allowed, equipped) => {
      const af = airframeById(ui.settings.airframe);
      const w = warPayload(af, combatChoice(af, ui.settings.combat ? ui.settings.combat[af.id] : null), allowed, equipped);
      return w ? w.warhead : null;
    },
  });
  campaignRef = campaign;
  ui.onCampaignCard = () => campaign.open();
  /*
   * THE INTERIOR'S CARD (src/ui/opscampaign.js): its missions and their
   * states, its consent at Play. The start itself waits for track WORLD's
   * map: a mission whose map this build does not have says so on its page
   * rather than making a room nobody can fly.
   */
  async function interiorConsented() {
    if (ui.settings.interiorConsent) {
      return true;
    }
    const go = await ui.askConfirm({
      title: str('ops.campaign.interior.consent_title'),
      detail: str('ops.campaign.interior.consent_detail'),
      yes: str('ops.campaign.interior.consent_yes'),
      no: str('ops.campaign.interior.consent_no'),
    });
    if (go) {
      ui.settings.interiorConsent = true;
      ui.persistSettings();
    }
    return go;
  }
  const interiorScreen = createOpsCampaignScreen({
    ui,
    campaign: INTERIOR_CAMPAIGN,
    missions: INTERIOR,
    devMissions: new URLSearchParams(window.location.search).get('missions') === 'dev',
    consented: interiorConsented,
    play: (m) => {
      const mission = roomOps.missionOf(m.id);
      if (!mission || !MAPS.some((x) => x.id === mission.map)) {
        interiorScreen.open(str('ops.campaign.no_map'));
        return;
      }
      opsEnter(m.id, mission).catch((e) => interiorScreen.open(str('ops.campaign.no_room', { why: e.message })));
    },
  });
  ui.onOpsCampaignCard = () => opsCampaignOpen();
  /*
   * LEARN TO FLY: a lesson seats its aircraft and its assist (the tune,
   * Stabilised or Acro) and goes in by the card it is flown from, Free
   * Flight on its world or Track mode's tracks; its judge rides on the
   * progress calls (src/ui/progress-ui.js) until another card is pressed.
   */
  const trainingScreen = createTrainingScreen({
    ui,
    passed: (id) => Boolean(ui.settings.progress.lessons[id]),
    fly: (lesson) => {
      const s = ui.settings;
      const craft = lesson.airframe || s.airframe;
      if (craft !== s.airframe) {
        seatAirframe(s, craft);
      }
      if (lesson.tune) {
        s.tune = lesson.tune;
      }
      if (lesson.mode) {
        s.flightMode = lesson.mode;
      }
      ui.progress.startLesson(lesson);
      ui.act(lesson.place ? 'way-freestyle-wing1000' : 'way-race-5inch', craft);
    },
  });
  ui.onTrainingCard = () => trainingScreen.open();
  window.__training = trainingScreen;
  /*
   * A MISSION'S ROOM: private (ops missions run in private rooms only in
   * Phase 0, the lead's call), on the mission's map, the pilot in the
   * first core role's aircraft, seated before the room is joined so every
   * pose carries the room's map (the room drops a pose from another). The
   * host's start goes when the welcome is in (opsFrame).
   */
  async function opsEnter(id, mission) {
    const code = await roomLinkState.create(mission.map, false, { name: null, mode: null, public: false });
    const role = (mission.roles || []).find((r) => r.core) || (mission.roles || [])[0];
    const craft = role && role.platforms ? role.platforms[0] : null;
    if (craft && ui.settings.airframe !== craft) {
      seatAirframe(ui.settings, craft);
      ui.persistSettings();
    }
    if (ui.settings.map !== mission.map) {
      ui.seatMap(mission.map, { stay: true });
    }
    opsPending = { code, mission: id };
    ui.roomGame = null;
    ui.show('friends');
    roomLinkState.join(code);
    return code;
  }
  window.__opsCampaign = interiorScreen;
  ui.onTrackChosen = () => {
    if (lobbyGame() !== 'race' || !roomHost(roomLinkState.state().welcome)) {
      return false;
    }
    /* The track just seated (ui.js seatLocal) is built under the lobby,
     * and the room is sent it, so everybody here has it on their grid. */
    /* The seat is the track (ui.js seatLocal wrote it); ui.seatMap would
     * put a public room's pilot back in the room's world. The room takes
     * it, and everybody in the lobby has its world built under the lobby
     * (roomSessionFrame's 'track' summon). */
    ui.mode = 'race';
    ui.show('friends');
    ui.settings.map = 'track';
    ui.persistSettings();
    titleWorld = null;
    buildWorld = null;
    syncWorld();
    /* The seat, not seatedMapTrack: the title's world is still up. */
    const seated = seatShare();
    if (seated) {
      roomAsked = { map: seated.document.map, track: seated.document.id, at: performance.now() };
      roomRace.loadTrack(seated.document);
    }
    return true;
  };
  window.__campaign = campaign;

  function roomLeave() {
    roomRaceRetire();
    roomLinkState.leave();
    roomNote = null;
  }

  /*
   * THE TITLE IS NEVER IN A ROOM (docs/FLOW-AUDIT.md rule 3, approved by
   * the owner 2026-10-01). The owner (2026-09-30), back on the title from
   * a private war room: "its showing like this, like its showing the empty
   * room thats playing while im here, that shouldnt happen". Inside a room
   * the room screen stands where the title would be (ui.show), Back and
   * Escape stop there, and every row to the title is Leave (ui.roomExit),
   * which leaves first and then goes to the title. So a card on the title
   * never meets a room, and nothing leaves a room by the side effect of
   * a screen.
   */
  ui.inRoom = () => {
    const phase = roomLinkState.state().phase;
    return phase === 'open' || phase === 'connecting';
  };
  /* In a game's lobby, between its rounds, as the room says it now. */
  ui.inLobby = () => Boolean(gameLobby());

  /*
   * OUT OF A ROOM, TO THE TITLE'S CARDS (the owner, 2026-10-02: Escape from
   * a lobby went to the free flight menu over the Swiss valley, not the
   * cards). Leave, and Back from a lobby, leave the room and show the
   * cards, the one the lobby came from under the cursor.
   */
  function leaveToCards() {
    lobbyCardCode = null;
    lobbyCardBack = null;
    roomLeave();
    /* The title first, which ends a run left from the pause, then its
     * cards. */
    ui.act('title');
    ui.act('mode-gate');
    const i = ui.items().findIndex((it) => it.action === ui.lobbyCard);
    if (i >= 0) {
      ui.setCursor(i);
      ui.renderMenu();
    }
  }
  /*
   * Escape in a lobby a CARD opened is back to the cards, out of the room
   * (the owner, 2026-10-02: a card is one press, so its Back undoes it).
   * A room joined any other way (the rooms panel, a link, a code) is not
   * a card's, and Escape stays in it (docs/FLOW-AUDIT.md rule 4); Leave
   * is its way out. Which it is was read from whether the lobby's panel
   * had been drawn yet, a race scripts/war-card-check.js lost on main and
   * on the hub branch alike.
   */
  ui.onLobbyBack = () => {
    if (roomLinkState.state().code !== lobbyCardCode) {
      return;
    }
    const back = lobbyCardBack;
    leaveToCards();
    delete ui.cursorMemory.friends;
    if (back) {
      back();
    }
  };

  /* R says ready or not in a game room's lobby, as the Ready row does. */
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
      && ui.screen === 'friends' && ui.nameDialog.hidden && gameLobby()) {
      e.preventDefault();
      gameLobbyToggle();
    }
  });

  ui.onFriends = async (action) => {
    if (action === 'friends-lobby-ready') {
      gameLobbyToggle();
      return;
    }
    /* The host's Start now in a combat, an Ace or a race lobby: the round
     * the room is set for, its game's begin (the war's is
     * friends-war-start, its consent first; free flight has none). */
    if (action === 'friends-lobby-start') {
      const lobby = gameLobby();
      const begin = lobby && LOBBY_GAMES[lobbyGame()].begin;
      if (begin) {
        begin(lobby);
      }
      return;
    }
    /* A race lobby's host chooses its track in My tracks (ui.onTrackChosen
     * brings them back here); a war lobby's campaign is a row of it. */
    if (action === 'friends-lobby-track') {
      /* Back from My tracks is the lobby again (ui.js back, roomFrom). */
      ui.roomFrom = 'friends';
      ui.show('courses');
      return;
    }
    if (action === 'friends-lobby-campaign') {
      campaign.open();
      return;
    }
    if (action === 'friends-war-start') {
      await warStart();
      return;
    }
    if (action === 'friends-war-fresh') {
      await warStart(true);
      return;
    }
    if (action === 'friends-war-private') {
      await warFromPublic();
      return;
    }
    if (action === 'friends-war-stop' || action === 'friends-end-war') {
      roomWar.end();
      return;
    }
    if (action === 'friends-war-intro') {
      warIntroWatch();
      return;
    }
    if (action === 'friends-combat-5' || action === 'friends-combat-3') {
      roomCombat.start(action === 'friends-combat-5' ? 5 : 3);
      return;
    }
    if (action.startsWith('friends-jam-') && modeById('jam').setting.choices.includes(Number(action.slice('friends-jam-'.length)))) {
      roomJam.start(Number(action.slice('friends-jam-'.length)));
      return;
    }
    if (action === 'friends-jam-end' || action === 'friends-end-jam') {
      roomJam.end();
      return;
    }
    if (action === 'friends-combat-stop') {
      roomCombat.stop();
      return;
    }
    if (action === 'friends-end-race') {
      roomRace.end();
      return;
    }
    if (action === 'friends-end-tag') {
      roomTag.end();
      return;
    }
    if (action === 'friends-end-combat') {
      roomCombat.stop();
      return;
    }
    if (roomBrowser.act(action)) {
      roomNote = null;
      return;
    }
    if (action === 'friends-join') {
      const got = await ui.askForm({
        title: str('friends.join_title'),
        detail: str('friends.join_detail'),
        confirmLabel: str('friends.join_go'),
        fields: [{
          key: 'code', label: str('friends.code'), value: '', maxLength: 8, placeholder: 'K7PZ2M',
          rules: str('friends.bad_code'), save: (v) => normaliseCode(v),
        }],
      });
      if (got && got.code) {
        roomNote = null;
        roomLinkState.join(got.code);
      }
      ui.refreshFriends();
      return;
    }
    /* Give up the seat for the watch seat: the same room, joined again. */
    if (action === 'friends-watch') {
      const { code } = roomLinkState.state();
      if (code) {
        roomLinkState.leave();
        roomLinkState.join(code, { watch: true });
      }
      return;
    }
    if (action === 'friends-leave') {
      leaveToCards();
      /* The row remembered on the room screen was one of the room's, gone
       * with it: the next visit opens on the screen's primary, as entering
       * a room forgets the row from outside one (ui.refreshFriends). */
      delete ui.cursorMemory.friends;
      return;
    }
    if (action === 'friends-copy') {
      const st = roomLinkState.state();
      const link = roomLink(st.code);
      try {
        await navigator.clipboard.writeText(link);
      } catch (e) {
        /* No clipboard here (an insecure page, a refused permission): the
         * note still shows the link to copy by hand. */
      }
      roomNote = str('friends.copied', { link });
      ui.refreshFriends();
      return;
    }
    if (action.startsWith('friends-race-')) {
      roomRaceAction(action.slice('friends-'.length));
      ui.refreshFriends();
    }
    if (action.startsWith('friends-tag-')) {
      roomTagAction(action.slice('friends-'.length));
      ui.refreshFriends();
    }
  };

  /*
   * RACING TOGETHER, Phase 4 of docs/MULTIPLAYER-PLAN.md: the room's race
   * (src/share/roomrace.js, the room's half edge/rooms/race.js). The host
   * sends the track their seat holds (from My tracks, the online tracks or
   * a casual sky course: they are all one kind of document), every pilot's
   * seat takes it and their world stands it up, and each says so. The host
   * starts; every pilot whose world had it is put on their slot on the
   * track's start row (roomSlotSpawn) and held there until the room's
   * goAt, the same instant on every screen; then each flies and scores
   * their own gates exactly as alone, and the room orders what it is told.
   *
   * What a room race changes about a run, and nothing else: the hold on
   * the line (raceHoldMs, read where a parked aircraft takes off and where
   * an air start lets go), which lap count ends the run (roomRace.done
   * instead of runLaps), and the results screen. A wreck is the wreck
   * rules as ever (enterWreck voids the lap in flight); R puts the pilot
   * back on their slot and the laps already flown stay flown. Leaving for
   * the title retires them. A pilot who was not ready when it started
   * flies the track free and watches the order until the next one.
   */
  /* ms the room's countdown still holds this aircraft on the line. */
  let raceHoldMs = 0;
  let raceHoldWas = 0;
  /* The race this run was put on the line for, or null for a run alone. */
  let roomRaceRunId = null;
  let roomRaceLaps = 3;
  let roomRaceCheckAt = 0;
  let roomResultsKey = '';
  let roomGoWall = null;
  let roomHudAt = 0;
  const roomRaceHud = new RoomRaceHud(ui.root);

  /* The room's track is the one this pilot's seat holds. */
  function roomTrackSeated() {
    const t = roomRace.track();
    const seated = t ? seatedMapTrack() : null;
    return Boolean(seated && seated.document.id === t.id);
  }
  /* And it stands in this world, with its gates, for the aircraft seated. */
  function roomTrackReady() {
    return roomTrackSeated() && mapReady && !swapInFlight && worldMatchesSettings()
      && !race.freestyle && seatedFits(seatedMapTrack());
  }
  function roomRun() {
    return roomRaceRunId != null && roomRaceRunId === roomRace.race().id;
  }
  function roomRaceRetire() {
    if (roomRun()) {
      roomRace.retire(roomLinkState.roomNow());
    }
    roomRaceRunId = null;
  }

  /* The screens a room's results are shown over and a match's results
   * wait on. */
  const ROOM_SEAT_SCREENS = ['title', 'paused', 'results', 'launch', 'friends'];

  /* Every frame the room is open, after the aircraft is posed. */
  function roomRaceFrame(now, wallMs) {
    if (wallMs > roomRaceCheckAt) {
      roomRaceCheckAt = wallMs + 500;
      roomRace.ready(roomTrackReady());
    }
    const start = roomRace.takeStart(now);
    if (start) {
      roomLeaveCrashCam();
      if (roomTrackReady()) {
        roomRaceRunId = start.id;
        ui.onAction('restart');
      } else {
        /* Not on the line when it went: out of this race, and up to fly
         * the track and watch it. */
        roomRace.retire(now);
        roomCall('game');
      }
    }
    roomRace.frame(now);
    raceHoldMs = roomRun() ? roomRace.holdMs(now) : Math.max(roomTagHoldMs(now), roomJam.holdMs(now));
    /* An air start lets go when its own countdown runs out (tickAirStart),
     * so the room's is written into it; a parked aircraft is held by
     * raceHoldMs where it would take off, and its GO is shown here. */
    if (raceHoldMs > 0 && airHoldMs > 0) {
      airHoldMs = raceHoldMs;
    }
    if (raceHoldWas > 0 && raceHoldMs === 0) {
      roomGoWall = Date.now();
      if (!(airHoldMs > 0)) {
        airGoUntil = wallMs + AIR_GO_MS;
      }
    }
    raceHoldWas = raceHoldMs;
    /* Four times a second is plenty for an order that moves a gate at a
     * time, and it keeps the names' lookups off every frame. */
    if (wallMs < roomHudAt) {
      return;
    }
    roomHudAt = wallMs + 250;
    roomRaceHud.update(mode === 'flight' && ui.screen === 'flight' ? hudView(roomRace, now, roomSeatName) : null);
    if (mode === 'results' && ui.roomResults && ui.screen === 'results' && roomResultsOf === 'race') {
      roomShowResults();
    }
    /* The race is over and this run's part in it is shown: what is flown
     * next is flown alone until the next start. */
    if (roomRun() && roomRace.race().state === 'results' && mode !== 'flight') {
      roomRaceRunId = null;
    }
  }

  function roomSeatName(seat) {
    if (seat === roomRace.seat()) {
      return str('friends.you', { name: roomName(ownName()) });
    }
    const peer = roomPeers.get(seat);
    return peer ? roomName(peer.name) : str('roomrace.gone');
  }
  /* The results screen, from the room's order; again as it changes. */
  function roomShowResults() {
    const view = resultsView(roomRace, roomSeatName);
    const key = JSON.stringify(view);
    if (key === roomResultsKey && ui.screen === 'results') {
      return;
    }
    roomResultsKey = key;
    roomResultsOf = 'race';
    ui.showRoomResults(view);
  }
  ui.roomResultsRows = () => {
    if (roomResultsOf === 'tag') {
      return roomTagResultsRows();
    }
    if (roomResultsOf === 'jam') {
      return [
        { label: str('roomtag.fly_on'), action: 'restart', note: str('jam.fly_on_note'), primary: true },
        ...ui.friendsItems(),
        { label: str('ui.back_to_title'), action: 'title' },
      ];
    }
    const host = roomLinkState.state().welcome && roomLinkState.state().welcome.host === roomRace.seat();
    return [
      ...(host && roomRace.race().state === 'results'
        ? [{ label: str('roomrace.again'), note: str('roomrace.again_note', { laps: roomRaceLaps }), action: 'friends-race-start', primary: true }]
        : []),
      { label: str('roomrace.fly_on'), action: 'restart', note: str('roomrace.fly_on_note'), primary: !host },
      ...ui.friendsItems(),
      { label: str('ui.back_to_title'), action: 'title' },
    ];
  };

  /* A pass the local race just scored, handed to the room's race. */
  function roomRacePass(passed, lapsBefore, simNow) {
    const now = roomLinkState.roomNow();
    if (!roomRun() || now == null) {
      return;
    }
    const cross = race.lapStartMs + (race.splits.length ? race.splits[race.splits.length - 1] : 0);
    roomRace.pass({
      lapDone: race.laps.length > lapsBefore,
      gate: race.lapStartMs != null ? race.splits.length + 1 : 0,
      gatePoints: race.call && race.call.gate === passed ? race.call.points : 0,
      hoop: Boolean(race.gates[passed].apertures[0].round),
      lagMs: Math.max(0, simNow - cross),
    }, now);
  }

  /* The Fly with friends screen's race rows. */
  function roomRaceRows(host) {
    return raceRows({
      rr: roomRace,
      host,
      nameOf: roomSeatName,
      seated: seatedMapTrack(),
      fits: !roomTrackSeated() || seatedFits(seatedMapTrack()),
      ready: roomTrackReady(),
      craft: airframeById(ui.settings.airframe).short,
      laps: roomRaceLaps,
      here: roomPeers.size + 1,
      onLaps: (d) => {
        roomRaceLaps = Math.max(1, Math.min(10, roomRaceLaps + d));
        ui.refreshFriends();
      },
    });
  }

  function roomRaceAction(action) {
    if (action === 'race-send') {
      const seated = seatedMapTrack();
      if (seated) {
        roomRace.loadTrack(seated.document);
      }
    } else if (action === 'race-start') {
      roomRace.start(roomRaceLaps);
    } else if (action === 'race-end') {
      roomRace.end();
    }
  }

  /* Harness only: the room's race as this page has it, for
   * scripts/rooms-race-two-page.js. goWall is the wall clock (Date.now)
   * at the frame the hold let go, to compare two pages' starts. */
  window.__roomRace = () => {
    const now = roomLinkState.roomNow();
    return {
      role: roomRace.role(now),
      track: roomRace.track() ? { id: roomRace.track().id, name: roomRace.track().name } : null,
      race: roomRace.race(),
      standings: roomRace.standings(),
      laps: roomRace.laps(),
      seated: roomTrackSeated(),
      ready: roomTrackReady(),
      hold: raceHoldMs,
      run: roomRaceRunId,
      goWall: roomGoWall,
      roomNow: now,
      results: ui.roomResults && ui.screen === 'results',
      error: roomRace.error(),
    };
  };
  window.__roomRaceDo = (action, laps) => {
    if (laps) {
      roomRaceLaps = laps;
    }
    roomRaceAction(action);
    return true;
  };

  /*
   * CATCH THE ACE! (¡Atrapa al As!), docs/TAG-PLAN.md: a private room's
   * tag match (src/share/roomtag.js, the room's half edge/rooms/tag.js).
   * The room judges every touch and counts every point; this screen puts
   * the pilot on their slot for the countdown and holds them there (the
   * race's hold, raceHoldMs), crowns the Ace (tagMarkPeers), shows the
   * scoreboard (the race's box: a room runs one game at a time), and at
   * each new crown the owner's "almost gamelike" moment: the coin, a gold
   * burst and ring where it was taken, a crown flying from the old Ace to
   * the new (src/render/acecrown.js), the bubble snapping over with a
   * bright pulse, a big banner and an edge flash (tagShout); and the
   * results when the room says the match is over. A collision in a match
   * is a mid air crash like any other, judged by the room's referee; the
   * one thing here that touches the plant is the chase boost (tagBoost).
   */
  /* The host's goal: a preset of GOALS, or 'custom' with its points. */
  let roomTagPick = { preset: GOALS[0].id, custom: 30 };
  /* The match this flight was put on its slot for, or null. */
  let roomTagRunId = null;
  /* Whose results the results screen shows: 'race' or 'tag'. */
  let roomResultsOf = null;
  let roomTagHudAt = 0;
  /* The last crown banner, for the harness. */
  let roomTagBanner = null;
  const roomTagHud = new RoomRaceHud(ui.root);
  /* The seat the peer marks crown now, or null. */
  let roomTagMarked = null;
  const roomTagBubble = createAceBubble();
  const tagFx = createCrownFx();
  const tagShout = createTagShout();
  /* The newest crown this screen showed: its seat, and the wall ms it
   * came, for the bubble's pulse. The free orb as last seen, for the
   * crown that flies out of it when it is caught. */
  let roomTagCrownSeat = null;
  let roomTagCrownWall = -Infinity;
  let roomTagOrbAt = null;
  const roomTagAt = new THREE.Vector3();
  /* The bubble's pulse at a new crown: up to twice its brightest, gone
   * over a few tenths of a second. 2 is the level a replay file allows. */
  const CROWN_PULSE = 2;
  const CROWN_PULSE_S = 0.2;

  function roomTagHoldMs(now) {
    return roomTagRunId != null && roomTagRunId === roomTag.view().id ? roomTag.holdMs(now) : 0;
  }
  /*
   * THE CHASE BOOST (src/share/roomtag.js CHASE_BOOST): every pilot who is
   * not the Ace flies a live match with the plant's sim_set_boost, set here
   * on the flight frame the role changes on the room clock, and put back to
   * 1 the frame the match or the room is over. A war's loadout speed
   * (warSpeedMul, DEFEND ITAIPU) multiplies it, the same way. A call into the plant, so
   * the crash cam's journal keeps it and a take over flies it again.
   */
  function tagBoost() {
    if (mode !== 'flight' || typeof sim.e.sim_set_boost !== 'function') {
      return;
    }
    const now = roomLinkState.state().phase === 'open' ? roomLinkState.roomNow() : null;
    const want = now == null ? 1 : roomTag.boost(now) * warSpeedMul();
    if (sim.e.sim_boost() === want) {
      return;
    }
    const code = sim.e.sim_set_boost(want);
    if (code !== SIM_OK) {
      throw new Error(`sim_set_boost refused ${want}: ${simErrorName(code)}`);
    }
  }

  /* Where a seat's aircraft is drawn on this screen, or null. */
  function roomTagSeatAt(seat) {
    if (seat == null) {
      return null;
    }
    if (seat === roomTag.seat()) {
      return mode === 'flight' ? shell.quad.position : null;
    }
    const peer = roomPeers.get(seat);
    return peer && peer.rig && peer.rig.group.visible ? peer.rig.group.position : null;
  }

  /*
   * A new crown on this screen: the coin, loudest for the new Ace; the
   * banner; gold round the edge for the new Ace and red for the one it
   * was taken from; the burst where the new Ace is, and the crown flying
   * to it from the old Ace, or from the orb it was caught out of.
   */
  function roomTagCrowned(crown, text, wallMs) {
    const me = roomTag.seat();
    const mine = crown.seat === me;
    roomTagCrownSeat = crown.seat;
    roomTagCrownWall = wallMs;
    if (mode === 'replay') {
      return;
    }
    audio.coin(mine ? 1 : 0.4);
    tagShout.shout(text);
    if (mine) {
      tagShout.flash('gold');
    } else if (crown.from === me && crown.why === 'tag') {
      tagShout.flash('red');
    }
    const at = roomTagSeatAt(crown.seat);
    let from = null;
    if (crown.why === 'catch' && roomTagOrbAt) {
      from = [roomTagOrbAt.px, roomTagOrbAt.py, roomTagOrbAt.pz];
    } else {
      const was = crown.why === 'tag' ? roomTagSeatAt(crown.from) : null;
      from = was ? [was.x, was.y, was.z] : null;
    }
    if (at) {
      tagFx.play([at.x, at.y, at.z], from, mine ? 1 : 0.7);
    } else if (from) {
      tagFx.play(from, null, mine ? 1 : 0.7);
    }
  }

  /* The crown's burst, flown on every frame the room is open, after the
   * bubble: to the new Ace as the bubble is drawn round it. */
  function tagCrownFrame(scene, dt) {
    if (!scene) {
      return;
    }
    if (tagFx.group.parent !== scene) {
      scene.add(tagFx.group);
    }
    tagFx.group.visible = mode !== 'replay';
    const b = roomTagBubble.drawn();
    const at = b.r > 0 && b.seat !== 0 ? roomTagAt.set(b.x, b.y, b.z) : roomTagSeatAt(roomTagCrownSeat);
    tagFx.frame(dt, shell.camera, at);
  }

  /* A pilot's name tag, crowned while they are the Ace. */
  function roomTagName(seat, name) {
    return roomTag.ace() === seat ? str('roomtag.ace_name', { name }) : name;
  }
  /* The room's world standing, in free flight: where a match is played. */
  function roomTagWorldReady(map) {
    return Boolean(view) && view.id === map && race.freestyle && mapReady && !swapInFlight && worldMatchesSettings();
  }

  /* Every frame the room is open, after the race's. */
  let roomTagJoined = null;
  function roomTagFrame(now, wallMs) {
    const w = roomLinkState.state().welcome;
    /* A match live when this pilot came (a join, the title's panel): up
     * into it, once a match, as its countdown would have put them. */
    const live = roomTag.view();
    if (w && live.state === 'live' && roomTagRunId !== live.id && roomTagJoined !== live.id) {
      roomTagJoined = live.id;
      roomCall('game', { restart: true });
    }
    const start = roomTag.takeStart(now);
    if (start && w) {
      roomLeaveCrashCam();
      if (roomTagWorldReady(w.map)) {
        roomTagRunId = start.id;
        ui.onAction('restart');
      } else {
        /* Another world, a track, a menu: seated in the room's world and
         * put on the slot as soon as it stands (roomCall). */
        notice = { text: str('roomtag.other_world', { world: mapById(w.map).name }), untilMs: performance.now() + 3000 };
        roomCall('game', { restart: true });
      }
    }
    const crown = roomTag.takeCrown();
    if (crown) {
      const me = roomTag.seat();
      const caught = crown.why === 'catch';
      let text = str(caught ? 'roomtag.banner_caught' : 'roomtag.banner_other', { name: roomSeatName(crown.seat) });
      if (crown.seat === me) {
        text = str(caught ? 'roomtag.banner_caught_you' : 'roomtag.banner_you');
      } else if (crown.from === me && crown.why === 'tag') {
        text = str('roomtag.banner_lost', { name: roomSeatName(crown.seat) });
      }
      roomTagBanner = { ...crown, text };
      roomTagCrowned(crown, text, wallMs);
    }
    /* A crashed Ace dropped the crown: said big, red round the edge for
     * the pilot who dropped it. */
    const drop = roomTag.takeDrop();
    if (drop && mode !== 'replay') {
      tagShout.shout(str('roomtag.hud_loose'));
      if (drop.from === roomTag.seat()) {
        tagShout.flash('red');
      }
    }
    roomTagOrbAt = roomTag.orb() || (crown ? null : roomTagOrbAt);
    const done = roomTag.takeResults();
    if (done && (mode === 'flight' || ROOM_SEAT_SCREENS.includes(ui.screen))) {
      if (mode === 'flight') {
        leaveFlightForResults();
      }
      roomTagRunId = null;
      roomResultsOf = 'tag';
      ui.showRoomResults(tagResultsView(roomTag, roomSeatName));
    }
    if (wallMs < roomTagHudAt) {
      return;
    }
    roomTagHudAt = wallMs + 250;
    roomTagHud.update(mode === 'flight' && ui.screen === 'flight' ? tagHudView(roomTag, now, roomSeatName) : null);
  }

  /*
   * TRICK BATTLE (src/share/roomjam.js, docs/JAM-PLAN.md). Every new turn
   * puts every pilot of the room back on its slot (the "same spot"); the
   * runner's is held to its go and then flies a run its own scorer counts
   * (jamScore, fed by the detector above) while createJamRun tells the
   * room; everybody else is held all the turn with the camera on the
   * runner (jamWatching). The room's clock ends the run.
   */
  const roomJamHud = new RoomRaceHud(ui.root);
  let roomJamRun = null;
  let roomJamTurn = null;
  let roomJamHudAt = 0;
  function roomJamFrame(now, wallMs) {
    const w = roomLinkState.state().welcome;
    const v = roomJam.view();
    const key = roomJam.on() ? `${v.id}:${v.round}:${v.runner}:${v.goAt}` : null;
    if (w && key && key !== roomJamTurn) {
      roomJamTurn = key;
      roomLeaveCrashCam();
      /* Up from the lobby screen, or back onto the slot from the air. */
      roomCall('game', { restart: true });
      if (mode !== 'replay') {
        tagShout.shout(jamTurnShout(roomJam, roomSeatName));
      }
    }
    const turn = roomJam.takeTurn(now);
    if (turn) {
      jamScore = new FreestyleScore({ timed: false });
      roomJamRun = createJamRun(jamScore, turn.endAt, (m) => roomLinkState.send(m));
    }
    if (roomJamRun && !roomJam.mine()) {
      /* The room closed the run first (the host's end, a reconnect). */
      roomJamRun = null;
      jamScore = null;
    }
    if (roomJamRun) {
      jamScore.tick(simTimeMs);
      if (roomJamRun.frame(wallMs, now)) {
        roomJamRun = null;
      }
    }
    const done = roomJam.takeResults();
    if (done && (mode === 'flight' || ROOM_SEAT_SCREENS.includes(ui.screen))) {
      if (mode === 'flight') {
        leaveFlightForResults();
      }
      jamScore = null;
      roomJamRun = null;
      roomJamHud.update(null);
      roomResultsOf = 'jam';
      ui.showRoomResults(jamResultsView(roomJam, roomSeatName));
    }
    if (!roomJam.on()) {
      roomJamTurn = null;
    }
    if (wallMs < roomJamHudAt) {
      return;
    }
    roomJamHudAt = wallMs + 250;
    const own = roomJamRun && jamScore ? { total: Math.round(jamScore.total()), last: lastJamTrick() } : null;
    roomJamHud.update(mode === 'flight' && ui.screen === 'flight' ? jamHudView(roomJam, now, roomSeatName, own) : null);
  }
  function lastJamTrick() {
    const r = jamScore.tricks.at(-1);
    return r ? { name: r.name, points: Math.max(0, Math.round(r.net)) } : null;
  }
  /* The host's start, for the checks (the lobby's Start now sends it too). */
  window.__roomJamStart = (seconds) => roomJam.start(seconds);
  window.__roomJam = () => {
    const now = roomLinkState.state().phase === 'open' ? roomLinkState.roomNow() : null;
    return {
      view: roomJam.view(),
      seat: roomJam.seat(),
      mine: roomJam.mine(),
      watching: jamWatching(),
      watched: jamWatching() && warWatchSeat >= 0 ? warWatchSeat : null,
      hold: roomJam.holdMs(now),
      run: roomJamRun ? { endAt: roomJamRun.endAt } : null,
      own: jamScore ? { total: jamScore.total(), tricks: jamScore.tricks.length } : null,
      hud: roomJamHud.key ? JSON.parse(roomJamHud.key) : null,
      results: Boolean(ui.roomResults && ui.screen === 'results' && roomResultsOf === 'jam'),
      standings: roomJam.standings(),
    };
  };

  /*
   * The Ace marked for everybody: the peer marks' role (src/ui/peermarks.js),
   * a crown over its aircraft that never fades and a larger arrow at the
   * frame's edge when it is out of the picture. Set when the crown moves,
   * cleared when the match is over or the room is left.
   */
  function tagMarkPeers() {
    const ace = roomTag.ace();
    if (ace === roomTagMarked) {
      return;
    }
    if (roomTagMarked != null) {
      peerMarks.setRole(roomTagMarked, null);
    }
    if (ace != null) {
      peerMarks.setRole(ace, 'ace');
    }
    roomTagMarked = ace;
  }

  /*
   * The Ace's bubble (src/render/acebubble.js), round the Ace as this
   * screen draws it: its own craft for the Ace, the peer's model for
   * everybody else. Only for a room that judges by it (roomTag.bubble),
   * never in a replay, which draws the one it recorded. Brighter as the
   * nearest hunter drawn here closes in, half as bright while the Ace is
   * protected.
   */
  function tagBubble(now, wallMs, scene) {
    const r = roomTag.bubble();
    const ace = roomTag.ace();
    const orb = roomTag.orb();
    const mine = ace != null && ace === roomTag.seat();
    let at = null;
    if (orb) {
      /* Nobody is the Ace: the free orb, where it was dropped, with its
       * crown (seat 0, src/render/acebubble.js). */
      at = roomTagAt.set(orb.px, orb.py, orb.pz);
    } else {
      at = roomTagSeatAt(ace);
    }
    if (!r || !at || !scene || mode === 'replay') {
      return;
    }
    let near = Infinity;
    for (const p of roomPeers.values()) {
      if (p.seat !== ace && p.rig && p.rig.group.visible) {
        near = Math.min(near, p.rig.group.position.distanceTo(at));
      }
    }
    if (!mine && mode === 'flight') {
      near = Math.min(near, shell.quad.position.distanceTo(at));
    }
    if (roomTagBubble.mesh.parent !== scene) {
      scene.add(roomTagBubble.mesh);
    }
    let level = bubbleLevel(r, near, wallMs / 1000, !orb && roomTag.protectedNow(now));
    /* Snapped over to the new Ace, bright, and settling. */
    const since = (wallMs - roomTagCrownWall) / 1000;
    if (!orb && since >= 0) {
      level = Math.max(level, CROWN_PULSE * Math.exp(-since / CROWN_PULSE_S));
    }
    roomTagBubble.set(r, at.x, at.y, at.z, level, orb ? 0 : ace, wallMs / 1000);
  }

  function roomTagResultsRows() {
    const host = roomLinkState.state().welcome && roomLinkState.state().welcome.host === roomTag.seat();
    return [
      ...(host && roomTag.view().state === 'results'
        ? [{ label: str('roomtag.again'), note: str('roomtag.again_note'), action: 'friends-tag-start', primary: true }]
        : []),
      { label: str('roomtag.fly_on'), action: 'restart', note: str('roomtag.fly_on_note'), primary: !host },
      ...ui.friendsItems(),
      { label: str('ui.back_to_title'), action: 'title' },
    ];
  }

  /* The Fly with friends screen's match rows. */
  function roomTagRows(host) {
    const ids = [...GOALS.map((g) => g.id), 'custom'];
    return tagRows({
      rt: roomTag,
      host,
      nameOf: roomSeatName,
      pick: roomTagPick,
      onPreset: (d) => {
        const i = ids.indexOf(roomTagPick.preset);
        roomTagPick = { ...roomTagPick, preset: ids[(i + d + ids.length) % ids.length] };
        ui.refreshFriends();
      },
      onCustom: (d) => {
        roomTagPick = { ...roomTagPick, custom: goalOf(roomTagPick.custom + d * GOAL_STEP) };
        ui.refreshFriends();
      },
    });
  }

  /* The host's say over the room's AI pilots (edge/rooms/roombots.js),
   * where its game has them: off, or how well they fly. A public room
   * starts with them on, a private one off. Everybody else is told what
   * the host chose. */
  const BOT_LEVELS = ['off', 'easy', 'normal', 'hard'];
  function roomBotRows(host) {
    const w = roomLinkState.state().welcome;
    const mode = w ? modeOfRoom(w.mode) : null;
    if (!w || !mode || !mode.allowAI || !BOT_LEVELS.includes(w.bots)) {
      return [];
    }
    const value = str(`lobby.ai_level.${w.bots}`);
    if (!host) {
      return [{ label: str('lobby.ai_pilots'), value, note: str('lobby.ai_pilots_guest_note'), info: true }];
    }
    const set = (level) => roomLinkState.send({ type: 'bots', level });
    return [{
      label: str('lobby.ai_pilots'),
      value,
      note: str('lobby.ai_pilots_note'),
      current: w.bots,
      options: BOT_LEVELS.map((l) => ({ value: l, label: str(`lobby.ai_level.${l}`) })),
      pick: set,
      adjust: (d) => set(BOT_LEVELS[(BOT_LEVELS.indexOf(w.bots) + d + BOT_LEVELS.length) % BOT_LEVELS.length]),
    }];
  }

  function roomTagAction(action) {
    if (action === 'tag-start') {
      roomTag.start(roomTagPick.preset === 'custom' ? roomTagPick.custom : roomTagPick.preset);
    } else if (action === 'tag-end') {
      roomTag.end();
    }
  }

  /* Harness only: the match as this page has it, for
   * scripts/tag-two-page.js. */
  window.__roomTag = () => {
    const now = roomLinkState.roomNow();
    return {
      role: roomTag.role(now),
      view: roomTag.view(),
      standings: roomTag.standings(),
      hold: raceHoldMs,
      run: roomTagRunId,
      marked: roomTagMarked,
      banner: roomTagBanner,
      /* The coin's voice exists once the sound is up, and every crown
       * rings it; the burst played and what of it shows; the banners and
       * edge flashes this page showed. */
      coin: { voice: Boolean(audio.coinVoice), struck: audio.coins || 0 },
      fx: tagFx.stats(),
      shouts: tagShout.said(),
      shout: tagShout.shown(),
      flashes: tagShout.flashes(),
      orb: roomTag.orb(),
      /* The chase boost the plant flies with now. */
      boost: typeof sim.e.sim_boost === 'function' ? sim.e.sim_boost() : null,
      bubble: roomTagBubble.mesh.visible ? { ...roomTagBubble.drawn() } : null,
      hud: roomTagHud.key ? JSON.parse(roomTagHud.key) : null,
      results: Boolean(ui.roomResults && ui.screen === 'results' && roomResultsOf === 'tag'),
      error: roomTag.error(),
      roomNow: now,
    };
  };
  /* Every Ace's bubble in the scene as drawn this frame, the live one or
   * a replay's (src/replay/peerscene.js): where, how big, how bright, and
   * whether it is the free orb. */
  window.__aceBubbles = () => {
    const out = [];
    const scene = shell.quad.parent;
    if (scene) {
      scene.traverse((o) => {
        if (o.name === 'ace-bubble' && o.visible) {
          out.push({
            at: o.position.toArray(), r: o.scale.x, level: o.material.uniforms.uLevel.value,
            /* The free orb's crown showing inside it. */
            orb: o.children.some((c) => c.name === 'ace-orb-crown' && c.visible),
          });
        }
      });
    }
    return out;
  };
  window.__roomTagDo = (action, goal) => {
    if (goal != null) {
      roomTagPick = { preset: 'custom', custom: goalOf(goal) };
    }
    roomTagAction(action);
    return true;
  };
  /*
   * THE GHOST CHASE. src/game/ghost.js records and samples laps; this is the
   * shell's half: what is chased, what the menu row offers, the gap at each
   * gate and the record key. The names below that other parts of boot()
   * read or write (the harness hooks, frameBody, the reset, the rig swap)
   * are that code's contract: ghostLap, ghostChased, ghostGap, ghostChoice,
   * ghostBoardTimes, ghostBoardLap, ghostQueryId and ghostPrev's fields.
   *
   * ghostChoice is 'off', 'best', 'previous' or `board:<time id>`.
   * ghostLap is the lap flown against now and ghostChased the one the last
   * closed lap was flown against: the line re-arms the first before the
   * results read the second. ghostGap is { deltaMs, final, untilWall }.
   */
  /* A chase fades in this long off the line and out this long past the
   * ghost's own finish, and shows faintly across a recorded crash. */
  const CHASE_FADE_MS = 400;
  const CHASE_CUT_PRESENCE = 0.15;
  /* How long the OSD keeps a gate's gap lit, wall clock. */
  const GAP_SHOWN_MS = 2800;
  /* The menu row lists this many board rivals; the board page has the rest. */
  const BOARD_RIVALS = 5;
  const SESSION_MODES = ['off', 'best', 'previous'];
  let ghostChoice = storedGhostChoice();
  let ghostLap = null;
  let ghostChased = null;
  let ghostGap = null;
  let ghostBoardTimes = null;
  let ghostBoardLap = null;
  /* A ?ghost= chase link waits here until the course's board times are in. */
  let ghostQueryId = wantGhostId;
  /* frameBody writes the frame's pose here after the race step, so the next
   * lap start can put a keyframe from before the line into the recording. */
  const ghostPrev = { valid: false, simMs: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  /* The board time being fetched and the course it was asked for, or null. */
  let boardFetch = null;
  /* Scratch for GhostLap.sample, reused every frame. */
  const chasePose = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };

  /* Only the session modes persist. A board pick names one time on one
   * course, so a fresh course starts from the pilot's session mode. */
  function storedGhostChoice() {
    return SESSION_MODES.includes(ui.settings.ghost) ? ui.settings.ghost : 'best';
  }

  /* The session book is keyed by course, not by tune: a lap on any config
   * paces any other. A seated track is its own course, with a plane's laps
   * kept apart from a quad's; a world flown free is keyed by the world. */
  function ghostCourseKey() {
    const track = loadedCourseKey(view);
    if (!track) {
      return view.id;
    }
    return lapCraft() ? `custom:${track}#wing` : `custom:${track}`;
  }

  /*
   * The plane a lap flown now is filed under on the board, or '': a fixed
   * wing's lap on a map track goes to the plane board (src/game/verify.js
   * planesFor) and every other lap where it always went. The session's
   * ghosts are kept per board too, so a plane never chases or uploads a
   * quad's lap as its own.
   */
  function lapCraft() {
    if (!view.courseKey) {
      return '';
    }
    const seated = seatedMapTrack();
    return seated ? lapCraftOf(seated.document, runAirframe) : '';
  }

  /* The book's lap for a session mode on the current course, or null. */
  function sessionLap(choice) {
    const course = ghostCourseKey();
    return choice === 'previous' ? ghostBook.previous(course) : ghostBook.best(course);
  }

  /* No chase while freestyling, nor on a builder's TEST flight, whose track
   * may change before its lap could be flown again. A published map track
   * (build.racing) races like any other course. */
  function chaseAllowed() {
    return !race.freestyle && !(build && build.testing);
  }

  /*
   * The rig's name tag. GhostBook labels its laps in the page's locale,
   * and the locale is fixed for a page's life (a change reloads), so the
   * best is told apart by its label in that same locale. Asking the book
   * which lap is its best instead would mislabel a best that has just been
   * beaten but is still the one armed.
   */
  function ghostLabelFor(lap) {
    let who = lap.name || str('main.rival');
    if (lap.source !== 'board') {
      who = lap.label === str('ghost.session_best') ? str('main.best') : str('main.last');
    }
    return str('main.text', { name: who, formatTime: formatTime(lap.durationMs) });
  }

  /* What the choice points at now, or null. A session mode can be ahead of
   * its data (Best before any lap is closed) and then simply chases nothing
   * until a lap exists. A board choice is armed only once its lap is here. */
  function chosenLap() {
    if (!chaseAllowed() || ghostChoice === 'off') {
      return null;
    }
    if (!ghostChoice.startsWith('board:')) {
      return sessionLap(ghostChoice);
    }
    const loaded = ghostBoardLap ? `board:${ghostBoardLap.timeId}` : '';
    return loaded === ghostChoice ? ghostBoardLap : null;
  }

  function armGhost() {
    ghostLap = chosenLap();
    if (ghostLap) {
      ghostRig.setLabel(ghostLabelFor(ghostLap));
    }
  }

  /* The Ghost row's options, in the order its arrows step through them. */
  function ghostOptions() {
    const rivals = (ghostBoardTimes || []).map((time) => ({
      id: `board:${time.id}`,
      label: str('main.text', { name: time.name, formatTime: formatTime(time.lapMs) }),
    }));
    return [
      { id: 'off', label: 'Off' },
      { id: 'best', label: str('main.your_best_this_session') },
      { id: 'previous', label: str('main.your_previous_lap') },
      ...rivals,
    ];
  }

  /* The row's note: what the current choice will fly, or why nothing. */
  function ghostRowNoteText() {
    if (ghostChoice === 'off') {
      return str('main.nobody_to_chase_laps_still_record');
    }
    if (ghostChoice.startsWith('board:')) {
      if (boardFetch) {
        return str('main.fetching_that_lap_from_the_board');
      }
      return str(ghostBoardLap ? 'main.a_recorded_lap_from_the_public' : 'main.that_lap_could_not_be_fetched');
    }
    const lap = sessionLap(ghostChoice);
    return lap
      ? str('main.a_translucent_pacer_flying_that_lap', { formatTime: formatTime(lap.durationMs) })
      : str('main.no_lap_on_record_this_session');
  }

  /* ui.js draws the row; the shell is what knows its contents, so it pushes
   * them again whenever they change. A board choice not in the list (a
   * harness-loaded lap) shows as the session best's entry. */
  function syncGhostRow() {
    if (race.freestyle) {
      ui.setGhostRow(null);
      return;
    }
    const options = ghostOptions();
    const shown = options.find((o) => o.id === ghostChoice) || options[1];
    ui.setGhostRow({ value: shown.label, note: ghostRowNoteText(), cycle: stepGhost });
  }

  /* The row's arrows: the next option either way round, read when pressed
   * since the list grows as board times arrive. */
  function stepGhost(dir) {
    const options = ghostOptions();
    const at = Math.max(0, options.findIndex((o) => o.id === ghostChoice));
    const step = dir < 0 ? options.length - 1 : 1;
    pickGhost(options[(at + step) % options.length].id);
  }

  function pickGhost(id) {
    ghostChoice = id;
    if (SESSION_MODES.includes(id)) {
      ui.settings.ghost = id;
      ui.persistSettings();
    } else if (!ghostBoardLap || `board:${ghostBoardLap.timeId}` !== id) {
      /* A board lap is fetched once and kept decoded for the course. */
      fetchBoardLap(id.slice('board:'.length));
      return;
    }
    armGhost();
    syncGhostRow();
  }

  /* The course's board listing when it is a shared course, else null. */
  function ghostListing() {
    let listing = null;
    try {
      listing = inspectCourse();
    } catch (e) {
      return null;
    }
    return listing && listing.shareId ? listing : null;
  }

  /* Downloads one board time's recording and arms it, unless the pilot has
   * moved to another course while it was on the way. */
  async function fetchBoardLap(timeId) {
    const listing = ghostListing();
    if (!listing) {
      return;
    }
    const ask = { timeId, course: ghostCourseKey() };
    boardFetch = ask;
    syncGhostRow();
    let lap = null;
    let failure = null;
    try {
      const payload = await fetchGhost(listing.shareId, timeId, listing.board);
      lap = new GhostLap(decodeGhost(ghostFromBase64(payload.ghost)), { label: str('main.board_lap'), name: payload.name || '', source: 'board' });
      lap.timeId = timeId;
    } catch (e) {
      failure = e;
    }
    if (ghostCourseKey() !== ask.course) {
      return;
    }
    if (boardFetch === ask) {
      boardFetch = null;
    }
    if (failure) {
      ghostBoardLap = null;
      notice = { text: str('main.could_not_fetch_that_ghost', { v1: failure.message ?? failure }), untilMs: performance.now() + 3600 };
    } else {
      ghostBoardLap = lap;
      armGhost();
    }
    syncGhostRow();
  }

  /*
   * A new course: drop everything tied to the old one, restore the pilot's
   * session mode, and ask the board for this course's recorded rivals. The
   * board is optional here, as it is for the course list: when it cannot be
   * reached the row offers the session modes and nothing breaks.
   */
  function ghostCourseChanged() {
    ghostRecorder.abort();
    ghostLap = null;
    ghostChased = null;
    ghostGap = null;
    ghostBoardTimes = null;
    ghostBoardLap = null;
    boardFetch = null;
    ghostPrev.valid = false;
    ghostRig.setPresence(0);
    ghostChoice = storedGhostChoice();
    syncGhostRow();
    livePeersClear();
    syncLive();
    const listing = ghostListing();
    if (listing && !race.freestyle) {
      listBoardRivals(listing, ghostCourseKey());
    }
  }

  async function listBoardRivals(listing, course) {
    let times;
    try {
      times = await fetchTrackTimes(listing.shareId, listing.board);
    } catch (e) {
      return;
    }
    if (ghostCourseKey() !== course) {
      return;
    }
    /* On a map track the seated aircraft's board: a quad's laps for a quad,
     * a plane's for a plane. Only times that carry a recording can be
     * chased. */
    const plane = Boolean(lapCraft());
    ghostBoardTimes = times.filter((t) => t.hasGhost && t.id && Boolean(t.craft) === plane).slice(0, BOARD_RIVALS);
    syncGhostRow();
    const linked = ghostQueryId;
    ghostQueryId = '';
    if (linked && times.some((t) => t.id === linked && t.hasGhost)) {
      ghostChoice = `board:${linked}`;
      fetchBoardLap(linked);
    }
  }

  /* One recorder keyframe: a lap time and the craft's pose as drawn. */
  function recordPose(lapMs, at, q) {
    ghostRecorder.push(lapMs, at.x, at.y, at.z, q.x, q.y, q.z, q.w);
  }

  /*
   * Called every frame after the race has scored the frame's travel, with
   * the race's lap start and lap count from BEFORE that update: a change in
   * either is how a lap boundary shows up here.
   *
   * Order matters at a boundary. The gap is read first, against the lap
   * that was armed while it was flown (re-arming first would compare a new
   * best with itself). Then the finished lap is closed, with this frame's
   * pose (just past the line, on the old lap's clock) as its last keyframe
   * so the stored tail runs through the line at speed. Then the next lap's
   * recording opens with the previous frame's pose (just before the line)
   * so its first keyframe straddles t = 0.
   */
  function ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, passedAny) {
    if (!chaseAllowed()) {
      return;
    }
    const closed = race.laps.length > lapsBefore;
    if (passedAny && ghostLap && lapStartBefore != null) {
      noteGap(closed, nowWall);
    }
    if (closed) {
      recordPose(simNow - race.lapStartMs + race.lastLapMs, pCurr, qPrev);
      ghostBook.keep(ghostCourseKey(), ghostRecorder.finish(race.lastLapMs, race.lastSplits));
      ghostChased = ghostLap;
      syncGhostRow();
    }
    if (race.lapStartMs == null) {
      return;
    }
    const opened = race.lapStartMs !== lapStartBefore;
    if (opened) {
      ghostRecorder.begin();
      if (ghostPrev.valid) {
        ghostRecorder.push(ghostPrev.simMs - race.lapStartMs, ghostPrev.x, ghostPrev.y, ghostPrev.z, ghostPrev.qx, ghostPrev.qy, ghostPrev.qz, ghostPrev.qw);
      }
    }
    recordPose(simNow - race.lapStartMs, pCurr, qPrev);
    if (opened) {
      armGhost();
    }
  }

  /* The gap at the gate just passed: the lap time against the ghost's at
   * the line, else the newest split against the ghost's same split. */
  function noteGap(closed, nowWall) {
    const k = race.splits.length - 1;
    const mine = closed ? race.lastLapMs : (k >= 0 ? race.splits[k] : null);
    const theirs = closed ? ghostLap.durationMs : (k >= 0 ? ghostLap.splitMs(k) : null);
    if (mine == null || theirs == null) {
      return;
    }
    ghostGap = { deltaMs: mine - theirs, final: closed, untilWall: nowWall + GAP_SHOWN_MS };
  }

  /* Poses the rig at the ghost's own lap time every frame it can be seen;
   * otherwise parks it (zero presence hides the whole group). */
  function ghostFrame(simNow) {
    const flying = mode === 'flight' || mode === 'paused';
    if (!ghostLap || race.freestyle || race.lapStartMs == null || !flying) {
      ghostRig.setPresence(0);
      return;
    }
    const t = simNow - race.lapStartMs;
    ghostLap.sample(t, chasePose);
    const past = t - ghostLap.durationMs;
    let presence = past > 0 ? Math.max(0, 1 - past / CHASE_FADE_MS) : Math.min(1, t / CHASE_FADE_MS);
    if (chasePose.cut) {
      presence = Math.min(presence, CHASE_CUT_PRESENCE);
    }
    ghostRig.group.position.set(chasePose.px, chasePose.py, chasePose.pz);
    ghostRig.group.quaternion.set(chasePose.qx, chasePose.qy, chasePose.qz, chasePose.qw);
    ghostRig.setPresence(presence);
    /* The rig outlives scenes. It follows the hero craft into whichever
     * scene holds it, here rather than at a swap, so no load path can leave
     * it in a disposed world. */
    const scene = shell.quad.parent;
    if (presence > 0 && scene && ghostRig.group.parent !== scene) {
      scene.add(ghostRig.group);
    }
  }

  /* The results line about the ghost the last lap was flown against, or
   * null: level within 10 ms, else who was ahead and by how much. */
  function ghostResultNote() {
    const best = ghostChased ? race.bestLapMs() : null;
    if (best == null) {
      return null;
    }
    const theirs = ghostChased.durationMs;
    const who = ghostChased.source === 'board'
      ? ghostChased.name || str('main.the_board_lap')
      : ghostChased.label.toLowerCase();
    const vars = { who, formatTime: formatTime(theirs) };
    const margin = best - theirs;
    if (Math.abs(margin) < 10) {
      return str('main.level_with_the_ghost_at', vars);
    }
    const v3 = (Math.abs(margin) / 1000).toFixed(2);
    return str(margin < 0 ? 'main.you_beat_the_ghost_at_by' : 'main.the_ghost_at_stayed_ahead', { ...vars, v3 });
  }

  /* The wire base64 of this session's recording of a lap being posted, or
   * null when the session holds none of that time. The previous lap is
   * tried first; when it ties the best they are the same lap anyway. */
  function ghostForUpload(lapMs) {
    const want = Math.round(lapMs);
    const lap = [sessionLap('previous'), sessionLap('best')].find((l) => l && Math.round(l.durationMs) === want);
    return lap ? ghostToBase64(encodeGhost(lap)) : null;
  }

  /*
   * The localStorage key a best lap is kept under, which is a storage
   * format: changing any part of it hides every pilot's bests. A record is
   * only comparable on the same machine, so the key names the config text
   * (a 32 bit djb2 variant, xor form), the pack voltage, the flight style
   * (arcade only; expert has no suffix), the airframe and the gravity
   * multiple. The empty suffixes are the oldest records' (expert, gravity
   * exactly 1.0), which keep their keys even where nothing can reach them
   * now, like the five inch's.
   */
  function recordKey() {
    let hash = 5381;
    for (let at = 0; at < configText.length; at += 1) {
      hash = (Math.imul(hash, 33) ^ configText.charCodeAt(at)) >>> 0;
    }
    const parts = [
      'webfpv.best',
      hash.toString(16),
      runVoltage.toFixed(2) + (runStyle === 'arcade' ? '.arcade' : ''),
      runAirframe,
    ];
    if (runGravityScale !== 1) {
      parts.push(`g${Math.round(runGravityScale * 100)}`);
    }
    return parts.join('.');
  }

  let mode = 'title'; /* title, flight, paused, results, replay */
  /* The crash cam (src/replay/crashcam.js), made once the shell is. */
  let crashCam = null;
  let simTimeMs = 0;
  /*
   * THE TRAFFIC'S CLOCK. The map's moving things (view.updateAnim: the
   * cars, the PostAuto, the gondola, the geysers) are pure functions of a
   * clock, and alone that clock is the lap clock. In a room every pilot's
   * lap clock is their own, zeroed by their own R, so each saw the cars in
   * different places: one pilot landed on a car the others saw nowhere
   * near. So in a room the traffic runs on the lap clock plus an offset
   * that puts it on the room's clock (src/share/rooms.js roomNow), which
   * every seat shares. It still advances by the steps the lap clock does,
   * so the contact pass meets the cars at a function of the step count
   * (life.js sweepSolids); the offset is only taken up again once the two
   * have drifted TRAFFIC_SLACK_MS apart (an R, a stalled tab, joining).
   * Out of a room the offset is zero and the traffic is the lap clock's,
   * as every check that throws at a lap clock needs.
   */
  let trafficOffsetMs = 0;
  const TRAFFIC_SLACK_MS = 100;
  const trafficMs = (lapMs) => lapMs + trafficOffsetMs;
  function alignTraffic() {
    const room = roomLinkState.state().phase === 'open' ? roomLinkState.roomNow() : null;
    const want = room === null ? 0 : room - simTimeMs;
    if (Math.abs(want - trafficOffsetMs) > TRAFFIC_SLACK_MS) {
      trafficOffsetMs = want;
    }
  }
  /*
   * THE RC GRID, and the step count it hangs off.
   *
   * simStepIdx counts the plant's 1 ms steps since its last sim_init or
   * sim_reset and has to equal the module's own step_index at every frame
   * boundary: Betaflight takes a stick sample only once step_index reaches
   * its timestamp, so a sample stamped ahead of the module is lag, one
   * millisecond for every millisecond of skew. simTimeMs cannot stand in
   * for it, because the lap clock keeps running while a landed craft is
   * held unstepped. acc is the frame time not yet spent on steps, rcNextMs
   * the step the next RC frame is due on and lastTs, in seconds, the stamp
   * of the last sample handed to the module.
   */
  let simStepIdx = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  /* Starts as a perfect link (no radio) so a lap time only moves for a
   * pilot who chose a real one. */
  const rcLink = new RcLink(LINK_DEFAULT);
  /* Off until the pilot turns it on: it keeps every frame of the run. */
  const flightLog = new FlightRecorder();
  /* Stick samples, each stamped with the wall time it was read at, waiting
   * for the RC slot they belong to; rcHeld is the one the receiver holds
   * between slots. */
  const rcPending = [];
  let rcHeld = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
  /*
   * Starts the grid again on the step the plant is on. The radio restarts
   * with it, so the same session replays the same jitter, and the queue
   * keeps only its newest sample: anything older was read while the plant
   * stood still (parked, or before a reset) and would otherwise be fed to
   * the first few steps as if the stick had moved then.
   */
  function pinRcGrid() {
    rcNextMs = simStepIdx * MS_PER_STEP;
    lastTs = rcNextMs / 1000;
    rcLink.reset(rcNextMs);
    rcPending.splice(0, Math.max(0, rcPending.length - 1));
  }

  /*
   * The wing's take off is a hand throw: ten metres a second along its
   * own nose from a metre and a bit up, the way a hand does it. Only from
   * rest, so a wing already flying is left alone. A landed craft is frozen
   * with the integrator until the throttle comes up, which a wing on the
   * grass never does on its own, so the throw is also what releases the
   * pad hold, the way throttle does for a quad. L throws, and so does
   * raising the throttle on a wing that is down.
   */
  function throwWing() {
    const stNow = readState();
    const speedNow = stNow ? Math.hypot(stNow[4], stNow[5], stNow[6]) : 0;
    if (!stNow || speedNow >= 1.0 || typeof sim.e.sim_wing_launch !== 'function') {
      return false;
    }
    if (airframeById(runAirframe).catapult) {
      return catapultLaunch(stNow);
    }
    if (airframeById(runAirframe).discus) {
      return discusLaunch(stNow);
    }
    /* Into the hand first: a hull on the grass is held by friction the
     * moment it moves. Level, too: a wing that came to rest on a wingtip
     * is picked up before it is thrown. */
    const yaw = Math.atan2(2 * (stNow[7] * stNow[10] + stNow[8] * stNow[9]), 1 - 2 * (stNow[9] * stNow[9] + stNow[10] * stNow[10]));
    sim.e.sim_set_pose(stNow[1], stNow[2], stNow[3] + 1.2, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2));
    if (sim.e.sim_wing_launch(10) !== SIM_OK) {
      return false;
    }
    landed = false;
    takingOff = false;
    flownThisRun = true;
    adoptSimClock();
    notice = { text: str('main.thrown_keep_it_flying'), untilMs: performance.now() + 2200 };
    return true;
  }

  /*
   * A CATAPULT LAUNCHED AIRCRAFT IS NOT THROWN EITHER, IT IS SHOT OFF A
   * RAIL: the Bramor and the Striker. Parked, it is drawn on the rail,
   * `catapult.height` over the ground and `catapult.pitchDeg` nose up,
   * facing the way it faced; L, or throttle, puts the plant at exactly that
   * pose and lets it go at the rail's release speed along its nose, which
   * is the end of the shuttle's stroke. The launcher stays where it stood.
   * From anywhere else
   * (it came down under its chute in a field) the same release happens
   * where it lies, the ground crew having carried the rail to it; a chute
   * still out is packed first.
   */
  function catapultLaunch(stNow) {
    const cat = airframeById(runAirframe).catapult;
    const yaw = Math.atan2(2 * (stNow[7] * stNow[10] + stNow[8] * stNow[9]), 1 - 2 * (stNow[9] * stNow[9] + stNow[10] * stNow[10]));
    const cy = Math.cos(yaw / 2);
    const sy = Math.sin(yaw / 2);
    const pitch = (cat.pitchDeg * Math.PI) / 180;
    const cp = Math.cos(pitch / 2);
    const sp = Math.sin(pitch / 2);
    if (typeof sim.e.sim_wing_chute === 'function') {
      sim.e.sim_wing_chute(0);
    }
    const code = sim.e.sim_set_pose(
      stNow[1], stNow[2], stNow[3] - REST_HEIGHT + cat.height,
      cy * cp, sy * sp, -cy * sp, sy * cp,
    );
    if (code !== SIM_OK || sim.e.sim_wing_launch(cat.speed) !== SIM_OK) {
      return false;
    }
    if (shell.launcher && shell.launcher.visible && !flownThisRun) {
      shell.quad.updateMatrixWorld(true);
      launcherLeft = shell.launcher.matrixWorld.clone();
    }
    landed = false;
    takingOff = false;
    flownThisRun = true;
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
    notice = { text: str('main.catapulted_keep_it_flying'), untilMs: performance.now() + 2200 };
    audio.mechanical('catapult');
    return true;
  }

  /*
   * THE DISCUS LAUNCH, on a glider thrown by its wingtip (airframes.js
   * `discus`, the NRJ): L, or the throttle stick up, and the pilot picks
   * it up where it lies, turns once with it by the peg and lets it go
   * there, climbing, facing the way it faced (sim_wing_discus). The turn
   * and the release are the plant's, so a replay throws the same throw.
   * discusCue below says what is happening on the HUD: the spin, the
   * release, and the height the launch reached at the top of the zoom.
   * Where it was thrown from is where the pilot stands, which is where it
   * can be caught.
   */
  let discusAt = null;
  function discusLaunch(stNow) {
    const yaw = Math.atan2(2 * (stNow[7] * stNow[10] + stNow[8] * stNow[9]), 1 - 2 * (stNow[9] * stNow[9] + stNow[10] * stNow[10]));
    const ground = stNow[3] - REST_HEIGHT;
    sim.e.sim_set_pose(stNow[1], stNow[2], stNow[3] + 1.2, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2));
    if (typeof sim.e.sim_wing_discus !== 'function' || sim.e.sim_wing_discus() !== SIM_OK) {
      return false;
    }
    landed = false;
    takingOff = false;
    flownThisRun = true;
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
    discusAt = { x: stNow[1], y: stNow[2], ground, phase: 1, top: -Infinity, releasedMs: null };
    notice = { text: str('main.discus_spin'), untilMs: performance.now() + 1200 };
    return true;
  }

  /*
   * The HUD's cue for the discus launch, every frame, from the plant's
   * phase: the release, and the top of the zoom, where the launch preset
   * lets go and the height the throw reached is said, which is the number
   * a DLG pilot reads off the altimeter after every launch. And THE CATCH:
   * back at the pilot, slow and at hand height, the glider is caught, and
   * held there until the next throw.
   */
  const CATCH_REACH = 1.5;
  const CATCH_LOW = 0.6;
  const CATCH_HIGH = 2.3;
  const CATCH_SPEED = 8;
  const CATCH_AFTER_MS = 5000;
  function discusCue(nowWall) {
    if (!discusAt || !stateCurr || !airframeById(runAirframe).discus || typeof sim.e.sim_wing_discus_phase !== 'function') {
      return;
    }
    const phase = sim.e.sim_wing_discus_phase();
    const h = stateCurr[3] - discusAt.ground;
    if (phase === 2 && discusAt.phase === 1) {
      discusAt.releasedMs = nowWall;
      const v = Math.hypot(stateCurr[4], stateCurr[5], stateCurr[6]);
      notice = { text: str('main.discus_released', { speed: Math.round(v) }), untilMs: performance.now() + 1600 };
    }
    if (phase === 2) {
      discusAt.top = Math.max(discusAt.top, h);
    }
    if (phase === 0 && discusAt.phase === 2) {
      notice = { text: str('main.discus_top', { m: Math.round(Math.max(discusAt.top, h)) }), untilMs: performance.now() + 3000 };
    }
    discusAt.phase = phase;
    if (phase !== 0 || landed || crashed || discusAt.releasedMs === null || nowWall - discusAt.releasedMs < CATCH_AFTER_MS) {
      return;
    }
    const off = Math.hypot(stateCurr[1] - discusAt.x, stateCurr[2] - discusAt.y);
    const v = Math.hypot(stateCurr[4], stateCurr[5], stateCurr[6]);
    if (off <= CATCH_REACH && h >= CATCH_LOW && h <= CATCH_HIGH && v <= CATCH_SPEED) {
      sim.rest();
      landed = true;
      takingOff = false;
      adoptSimClock();
      stateCurr = readState();
      statePrev = stateCurr;
      acc = 0;
      discusAt.releasedMs = null;
      notice = { text: str('main.discus_caught'), untilMs: performance.now() + 2200 };
    }
  }

  /*
   * The recovery parachute, P, on an aircraft that has one. In the air
   * only: on the ground there is nothing for it to do. Once out it stays
   * out until the aircraft is relaunched or reset.
   */
  function pullChute() {
    if (typeof sim.e.sim_wing_chute !== 'function' || !airframeById(runAirframe).chute) {
      return false;
    }
    if (landed) {
      notice = { text: str('main.the_parachute_is_for_the_air'), untilMs: performance.now() + 2200 };
      return false;
    }
    if (sim.e.sim_wing_chute_open() > 0) {
      return false;
    }
    if (sim.e.sim_wing_chute(1) !== SIM_OK) {
      return false;
    }
    notice = { text: str('main.parachute_out_motor_cut'), untilMs: performance.now() + 2600 };
    audio.mechanical('parachute');
    return true;
  }

  /*
   * A PLANE ON WHEELS IS NOT THROWN, IT IS LET GO. Parked, the plant is
   * held, like any craft that is down; throttle releases it onto its gear
   * at the pose the gear holds it in, CG gear.restHeight over the ground
   * and gear.restPitch nose up, facing the way it faced, and the plant's
   * wheels roll it down the strip from there. The wheels are not hull
   * corners, so a plane rolling or sitting on them never trips the perch
   * that parks a craft again.
   */
  function releaseOnWheels() {
    const gear = restPose();
    const stNow = readState();
    if (!gear || !stNow) {
      return false;
    }
    const yaw = Math.atan2(2 * (stNow[7] * stNow[10] + stNow[8] * stNow[9]), 1 - 2 * (stNow[9] * stNow[9] + stNow[10] * stNow[10]));
    const cy = Math.cos(yaw / 2);
    const sy = Math.sin(yaw / 2);
    const cp = Math.cos(gear.restPitch / 2);
    const sp = Math.sin(gear.restPitch / 2);
    /* Yaw about world up, then the nose up pitch about the body's left
     * axis, which is a negative rotation about +y in the plant's frame. */
    const code = sim.e.sim_set_pose(
      stNow[1], stNow[2], stNow[3] - REST_HEIGHT + gear.restHeight,
      cy * cp, sy * sp, -cy * sp, sy * cp,
    );
    if (code !== SIM_OK) {
      return false;
    }
    landed = false;
    takingOff = false;
    flownThisRun = true;
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
    return true;
  }

  /*
   * The Bramor's canopy and its catapult, each frame (its folding prop is
   * the Radian's setProp, above).
   * The canopy hangs from its risers against the air they move through,
   * which is the aircraft's own velocity turned into its body frame and
   * handed to the model in the craft frame through the render boundary's
   * one conversion; stopped, it lies on the grass. The launcher stands
   * under a parked aircraft, stays at the spawn once it has left, and is
   * not drawn otherwise.
   */
  const extraV = new THREE.Vector3();
  const extraD = new THREE.Vector3();
  function bodyOf(st, x, y, z, out) {
    /* q^-1 v q for the plant's body to world quaternion. */
    const w = st[7];
    const qx = -st[8];
    const qy = -st[9];
    const qz = -st[10];
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    return simPosToThree(
      x + w * tx + (qy * tz - qz * ty),
      y + w * ty + (qz * tx - qx * tz),
      z + w * tz + (qx * ty - qy * tx),
      out,
    );
  }
  function poseBramorExtras() {
    const st = stateCurr;
    if (shell.setChute && typeof sim.e.sim_wing_chute_open === 'function') {
      const open = sim.e.sim_wing_chute_open();
      if (!(open > 0)) {
        shell.setChute(0);
        chuteDownSaid = false;
      } else {
        bodyOf(st, st[4], st[5], st[6], extraV);
        bodyOf(st, 0, 0, -1, extraD);
        const speed = extraV.length();
        if (speed > 0.3) {
          extraV.multiplyScalar(-1 / speed);
          chuteDir[0] = extraV.x;
          chuteDir[1] = extraV.y;
          chuteDir[2] = extraV.z;
        }
        const down = [extraD.x, extraD.y, extraD.z];
        const dims = airframeById(runAirframe).dims;
        const rest = plantUpZ(st) < 0 ? dims.vHalfUp : dims.vHalfDown;
        shell.setChute(open, chuteDir, down, speed < 0.3 ? rest : null);
        if (speed < 0.3 && !chuteDownSaid && mode === 'flight') {
          chuteDownSaid = true;
          notice = { text: str('main.down_under_its_parachute'), untilMs: performance.now() + 4000 };
        }
      }
    }
    const launcher = shell.launcher;
    if (!launcher) {
      launcherLeft = null;
      return;
    }
    /* Whatever a run left behind, the title's showpiece flight carries no
     * catapult: the launcher belongs to a seated run's pad. */
    if (mode === 'title') {
      launcherLeft = null;
      launcher.visible = false;
      return;
    }
    /* The title flies the aircraft round the world as a showpiece, and a
     * catapult carried along under a flying aircraft is nonsense: the
     * launcher belongs to the pad, so it stands only once a run is seated. */
    const parked = mode !== 'title' && landed && !flownThisRun
      && Boolean(airframeById(runAirframe).catapult);
    if (parked) {
      launcherLeft = null;
      launcher.position.copy(shell.launcherRest.position);
      launcher.quaternion.copy(shell.launcherRest.quaternion);
      launcher.scale.set(1, 1, 1);
      launcher.visible = true;
    } else if (launcherLeft) {
      shell.quad.updateMatrixWorld(true);
      launcherInv.copy(shell.quad.matrixWorld).invert().multiply(launcherLeft);
      launcherInv.decompose(launcher.position, launcher.quaternion, launcher.scale);
      launcher.visible = true;
    } else {
      launcher.visible = false;
    }
  }

  /*
   * The module owns the clock. sim_init and sim_reset start its step index
   * again from zero, and an async tune load can do that between two
   * frames, so after anything that may have restarted it the shell reads
   * the index back rather than trusting its own count, and puts the RC
   * grid on it. frameBody relies on the two agreeing.
   */
  function adoptSimClock() {
    simStepIdx = Math.round(readState()[0] * SIM_HZ);
    pinRcGrid();
  }

  /*
   * A RATE CHANGE KEEPS THE RUN. Rates live in the config text, so a new
   * rate means sim_init, and sim_init is a full reset of the plant's
   * dynamic state (src/native/sim_abi.h). A tune is a different machine
   * and resets the run; a rate only changes the pilot's sticks, and the
   * owner wants it tunable mid run against the corner it is for. So the
   * craft goes back to the pose read before the init (`before`, a state
   * array: position 1 to 3, attitude 7 to 10). sim_set_pose is the only
   * writer the ABI has, so velocity, body rates and rotor speed stay at
   * the zero init left them: the craft resumes at rest where it was,
   * which from the pause menu, the usual way here, is how it was anyway.
   *
   * Put back by hand: the pack voltage and the crashflip flag, the two
   * things init forgets that the shell still holds. The airframe and the
   * flight style are modes and outlive init; the ground plane is written
   * every frame, and angle mode by applySettings after this. The step
   * index is zero again, so the grid is re-read and the stick queue
   * emptied, as resetCraft does.
   */
  function reseatAfterConfigSwap(before) {
    sim.setCellVoltage(runVoltage);
    sim.e.sim_set_crashflip(crashflipOn ? 1 : 0);
    const [, px, py, pz, , , , qw, qx, qy, qz] = before;
    if (sim.e.sim_set_pose(px, py, pz, qw, qx, qy, qz) !== SIM_OK) {
      /* No pose to give back means no honest place to resume: start over. */
      reset();
      return;
    }
    rcPending.length = 0;
    acc = 0;
    adoptSimClock();
    statePrev = stateCurr = readState();
  }

  /*
   * Config loads are generation counted (configGen, configLoadWait). Each
   * new pick takes the next generation, and a load that finds its
   * generation overtaken when its fetch lands drops its text unflown.
   */
  function bumpConfigGen() {
    return (configGen += 1);
  }

  function isLiveConfigLoad(gen) {
    return configGen === gen;
  }

  /*
   * Runs fn once the config load that is current has settled, so Fly and
   * Resume never start a run that a sim_init still in flight would zero
   * under it. A pick made while waiting replaces configLoadWait and bumps
   * the generation, and the wait moves on to that load. A load that failed
   * counts as settled: the pilot has been told and flies what is loaded.
   * fn always runs in a later microtask, even with nothing loading.
   */
  async function whenConfigReady(fn) {
    let gen;
    do {
      gen = configGen;
      await configLoadWait.catch(() => {});
    } while (gen !== configGen);
    fn();
  }
  let crashed = false;
  let clipCrashUntil = 0;
  let clipCrashKind = '';
  let clipGraceUntil = 0;
  /* Wall times: the last land or takeoff blip (GROUND_CUE_GAP_MS) and the
   * end of the departure window (TAKEOFF_WINDOW_MS). */
  let groundCueAtWall = -1e9;
  let takeoffUntil = 0;
  const clipWatch = makeClipWatch();
  /*
   * The scripted turtle, a pose flip the shell draws. Betaflight's
   * crashflip mixer stays off through it; crashflipOn only says, for the
   * OSD and the banner, that the shell's wait or flip is on. The flip's
   * fields are the start and end attitudes and the surface it turns on.
   */
  let crashflipOn = false;
  let turtleWait = false;
  const turtleFlip = {
    active: false,
    simMs0: 0,
    qw0: 1, qx0: 0, qy0: 0, qz0: 0,
    qw1: 1, qx1: 0, qy1: 0, qz1: 0,
    wx: 0, wz: 0, surfaceY: 0,
  };
  const turtleQ = [0, 0, 0, 0];
  /* Upright again but the poke still held: roll and pitch wait for the
   * stick to centre, or airmode would act on the poke and throw the hull. */
  let turtleRecover = false;
  let turtleResumeGate = false;
  /* Resting on an obstacle roof (a train, a deck), which the plant's own
   * ground contact cannot see. */
  let turtleOnSupport = false;
  /* The rotors held at zero (sim_motor_override) while parked: rest()
   * leaves motor_omega spinning, and the wait would end with a jolt. */
  let turtleParkMotors = false;
  /* The pad shot at the start of a run, ms into it (orbit, approach, zoom
   * up to INTRO_TOTAL); -1 is the pilot's own view. */
  let introMs = -1;
  /* Whether this run has left the ground yet, for the banner. Rendering
   * only: nothing in the integrator or the RC grid reads it. */
  let flownThisRun = false;
  /*
   * Every run starts on the ground. Spawning in the air with the rotors
   * stopped meant the first touch of throttle dropped the craft onto the
   * ground faster than the landing gate allows, a crash, a respawn in the
   * air and the same again. While landed the craft is upright, intact and
   * not stepped at all (the ABI cannot write a position, so holding it is
   * not stepping it), sim_rest having zeroed its velocity at touchdown;
   * TAKEOFF_THROTTLE releases it.
   */
  let landed = true;
  /* Last frame's landed, for the touchdown edge (input.holdThrottleLow). */
  let landedWas = true;
  /* progressRun's key for the run being judged, and the hangar rev on
   * test (ui.onHangarTry). */
  let progressKey = '';
  let hangarRev = null;
  /* __seatCraft's hold: the pose and lens stay as seated, with no parked
   * overlay or intro, so a capture can photograph a seat before it moves. */
  let poseLock = false;
  /* An air start: flight screen ms left on its countdown, and the wall
   * time its GO comes off the banner. */
  let airHoldMs = 0;
  let airGoUntil = 0;
  /*
   * A takeoff under way, its contact sphere not yet clear of the surface.
   * A parked craft already sits inside the sphere's reach, so through the
   * spool up every frame registers ground contact; judged as landings they
   * flickered the craft between landed and flying at frame rate (hundreds
   * of cycles per takeoff at 60 fps, a land and a takeoff sound each). The
   * hold ends when the craft climbs clear, or on an abort (throttle back
   * under the gate, or 5 cm sunk because the pack cannot hover it), which
   * rests the craft where it is.
   */
  let takingOff = false;
  let statePrev = null;
  let stateCurr = null;
  /* The sim time of the drawn pose, between the two states, seconds; the
   * water's waves are drawn at it so they match the drawn floats. */
  let renderSimT = 0;
  /* Last frame's position for the terrain sweep, so ground contact is
   * tested along a segment. */
  const groundPrev = new THREE.Vector3();
  let groundHasPrev = false;
  let groundY = 0;
  /* Readbacks for __craftState: a capture asserts what happened from
   * these. lastHitIndex tells one building's wall from the next
   * (scripts/roof-check.js). */
  let lastDescent = 0;
  let lastTiltDeg = 0;
  let lastHitKind = 'none';
  let lastHitIndex = -1;
  let lastGroundHits = 0;
  /* Harness (__ground): 1 ms steps since load that ended with the hull on
   * the ground plane or a wheel loaded, which catches a touch shorter
   * than a frame and a roll on the gear the hull count misses. */
  let groundContactSteps = 0;
  /* sim_wheel_loads' four doubles in the module heap, and a view of them. */
  let wheelPtr = 0;
  let wheelLoads = null;
  /*
   * Whether any wheel carries weight. Called every step, so it allocates
   * nothing: the heap slot is taken once, and the view is remade only
   * when the module's memory has grown under it. A plant built without
   * the export has no gear to load.
   */
  function wheelsLoaded() {
    const mod = sim.e;
    if (typeof mod.sim_wheel_loads !== 'function') {
      return false;
    }
    if (wheelPtr === 0) {
      wheelPtr = mod.malloc(Float64Array.BYTES_PER_ELEMENT * 4);
    }
    if (wheelLoads === null || wheelLoads.buffer !== mod.memory.buffer) {
      wheelLoads = new Float64Array(mod.memory.buffer, wheelPtr, 4);
    }
    mod.sim_wheel_loads(wheelPtr);
    for (let i = 0; i < wheelLoads.length; i += 1) {
      if (wheelLoads[i] > 0) {
        return true;
      }
    }
    return false;
  }
  let lastClearance = 1;
  let lastUpz = 1;
  let lastFpvY = 0;
  let lastCamFloor = 0;
  let lastCamClear = 0;
  let lastCamFwdY = 0;
  let lastCamUpY = 0;
  let lastClosing = 0;
  /* The last contact's normal against the disc axis, 0 edge on to 1 flat
   * on. A readback: sound and shake follow the solver's impulse. */
  let lastUpDot = 0;
  let speedNow = 0;
  /* Contacts bounced off this run, counted up; a readback, nothing spends
   * it. */
  let bounceCount = 0;
  let bounceAtWall = 0;
  /* T held: Betaflight's own crashflip, not the scripted turtle's flag. */
  let manualFlip = false;
  /*
   * The solid world is resolved every OBSTACLE_STEP plant steps (sim ms),
   * counted in steps and never in frames, so the trajectory does not
   * depend on how a frame batched them (CLAUDE.md: a dropped frame changes
   * nothing). 4 ms is 250 Hz: the sweep is exact, so a finer cadence
   * catches nothing more, and 4 ms at racing speed is about 12 cm, inside
   * the swept test; a coarser one made the slide and the depenetration
   * visibly stepped.
   */
  const OBSTACLE_STEP = 4;
  let obsPhase = 0;
  /* What this frame's contact passes found, read once after stepping by
   * the clip watch, the sound and the shake. */
  let obsResolved = false;
  let obsContact = false;
  let obsLeftover = false;
  let obsInterior = 0;
  let obsRoof = false;
  let obsImpulse = 0;
  let obsImpulseKind = '';
  /* The kind of collider in the contact being resolved, for its material. */
  let obsKindIndex = -1;
  /*
   * The sweep reached a solid, and the closing speed along its normal.
   * Separate from obsImpulse because the sweep stops the craft at a face
   * before the solver sees it, so a head on wall hit can resolve to almost
   * no impulse at all; a wall tap is judged on the approach speed
   * (GRAZE_SPEED_MAX), slow for a tap and fast for a smack.
   */
  let obsTouched = false;
  let obsClosing = 0;
  /* Holding itself on a face with its own thrust (PRESS_UP_DOT in
   * collide.js): sim ms the hold has lasted, and sim ms since a contact
   * last had the thrust axis into the face. */
  let pressHeldMs = 0;
  let pressIdleMs = 0;
  let pressing = false;
  /* __drawOff: skip the draw so a probe runs at frame rate. */
  let harnessNoDraw = false;
  /* The trick recogniser's contact cooldown, apart from the sound's so one
   * cannot swallow the other, and on the sim clock because it decides
   * what counts as a trick, which must not depend on the frame rate. */
  let trickTouchAtSimMs = -1e9;
  /*
   * Per branch counts of the contact pass, read by __contacts, so a hit
   * the game failed to register can be traced to the branch it took. The
   * normal's sign against the plant's velocity is counted in the plant's
   * frame: a sound run is nearly all inbound, and outbound ones mean a
   * frame conversion lost the spawn rotation (worldDirToSim). resting is
   * a contact with no approach speed to solve, a hull sliding on a face.
   */
  const passStats = {
    buried: 0,
    sepFail: 0,
    resolved: 0,
    dvZero: 0,
    /* Host contacts on a solid the plant did not hold, declared to it
     * first (plantMustHold). */
    plantHeld: 0,
    /* And any of those the plant still did not hold after: must stay 0. */
    unheld: 0,
    resting: 0,
    inbound: 0,
    outbound: 0,
    kind: '',
    code: -1,
    e: 0,
    mu: 0,
  };
  let obsHasPrev = false;
  /*
   * Harness logs, __contacts().log and .obstacle: kept only after a
   * capture has thrown the craft (__crashThrow sets contactLogOn) and
   * capped, so a pilot's flight never grows them.
   */
  const contactLog = [];
  const CONTACT_LOG_MAX = 64;
  let contactLogOn = false;

  /* v rotated by the inverse of state st's attitude: world into body. */
  function intoBodyFrame(st, v) {
    const w = st[7];
    const x = st[8];
    const y = st[9];
    const z = st[10];
    const r0 = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
    const r1 = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    const r2 = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    return [r0, r1, r2].map((r) => r[0] * v.x + r[1] * v.y + r[2] * v.z);
  }

  /* A shell contact: when, on what (the moving box met, or -1 for a static
   * solid; the wing part, or -1 for a quad's discs) and where on the
   * craft, `arm` from the CG turned into the body frame. */
  function logContact(st, arm) {
    if (!contactLogOn || contactLog.length >= CONTACT_LOG_MAX) {
      return;
    }
    const col = view.colliders;
    contactLog.push({
      t: st[0],
      kind: lastHitKind,
      moving: col.hitMoving,
      part: col.hitArm ? col.hitPart : -1,
      arm: intoBodyFrame(st, arm),
    });
  }

  /*
   * A step on which the plant's own parts touched a solid it holds
   * (sim_obstacle_contacts). Since #79 the plant resolves those itself and
   * the shell's sweep skips them, so lastHitKind stays empty through such
   * a hit; this log names the held solid nearest the craft instead.
   */
  const obstacleLog = [];
  function nearestHeldSolid(px, py, pz) {
    const col = view.colliders;
    let index = -1;
    let gap = Infinity;
    for (const i of crashKnownList) {
      let d;
      if (col.fbox[i]) {
        d = col.boxGap(i, px, py, pz);
      } else {
        /* axisToPoint leaves the vector from the solid's axis in nx..nz. */
        col.axisToPoint(i, px, py, pz);
        d = Math.sqrt(col.nx * col.nx + col.ny * col.ny + col.nz * col.nz) - col.fr[i];
      }
      if (d < gap) {
        gap = d;
        index = i;
      }
    }
    return { index, gap };
  }
  function logObstacleStep(st) {
    if (!contactLogOn || obstacleLog.length >= CONTACT_LOG_MAX) {
      return;
    }
    const parts = sim.e.sim_obstacle_contacts();
    if (parts <= 0) {
      return;
    }
    poseFromState(st, pProbe);
    const { index, gap } = nearestHeldSolid(pProbe.x, pProbe.y, pProbe.z);
    const col = view.colliders;
    const found = index >= 0;
    obstacleLog.push({
      t: st[0],
      parts,
      index,
      kind: found ? col.kindName(col.fkind[index]) : 'none',
      built: index >= col.baseCount,
      solid: found ? {
        a: [col.fax[index], col.fay[index], col.faz[index]],
        b: [col.fbx[index], col.fby[index], col.fbz[index]],
        r: col.fr[index],
        box: Boolean(col.fbox[index]),
      } : null,
      gap,
      at: [pProbe.x, pProbe.y, pProbe.z],
    });
  }
  /* The impulse last announced, so a harder hit inside the cooldown still
   * sounds: a graze and then the wall behind it are two hits. */
  let lastImpulse = 0;
  /* Last frame's sim clock, for things timed in sim ms (the clip watch). */
  let simClockPrevMs = 0;
  /* Wall time a recover in place may settle until. */
  let recoverGraceUntil = 0;
  /* The last ground skip's wall time: one bounce per skid, not per frame. */
  let groundBounceAtWall = 0;
  /* The craft's vertical half height for its tilt, set by the physics
   * branch and read by the obstacle query in the same frame; level at
   * first. */
  let vHalfFrame = craftVerticalHalf(0);
  let airtimeMs = 0;
  /* The freestyle clock for the OSD, from score.view() just before setOsd,
   * so the readout is this frame's. */
  let scoreState = 'ready';
  let scoreRemainMs = 0;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  /* The pack and the flight style this run flies on. Both change only
   * between runs, so a settings visit mid run leaves the lap's physics
   * alone. */
  let runVoltage = ui.settings.packVoltage;
  let runStyle = ui.settings.flightStyle === 'arcade' ? 'arcade' : 'expert';
  /*
   * The run's weight, the one setting applied mid flight: the slider sits
   * on the flight screen so the pilot can feel it in the air, and a lap it
   * changes under is voided, flown at two weights.
   *
   * runWeight is the slider (100 is stock); runGravityScale is the multiple
   * of 9.80665 the module holds. That starts at the module's own 1.0, the
   * machine every harness replay flies, so at boot it differs from the
   * shell's normal (configs/airframes.js gravityBase) and applySettings
   * sends it through the one path to sim_set_gravity. The record key is
   * built from the module's scale, not the slider, so it survives a new
   * base.
   */
  let runWeight = WEIGHT_STOCK;
  let runGravityScale = 1;
  /*
   * The aircraft this run is on, starting as the one buildShell drew
   * (DEFAULT_AIRFRAME) rather than the stored choice. The module boots on
   * plant 0, which no aircraft seats, so the boot applySettings always
   * finds a mismatch and seats the stored aircraft through the same swap
   * as any later change, with no boot only path to drift.
   */
  let runAirframe = DEFAULT_AIRFRAME;
  /* The model drawn: TITLE_CRAFT on the title, else the seated aircraft. */
  let drawnCraft = DEFAULT_AIRFRAME;
  let drawnCombat = null;
  /* The camera mount in the seated aircraft's frame: lens.js's for the
   * quad, the pod's nose for a wing. */
  let camMountFwd = CAMERA_MOUNT_FORWARD;
  let camMountUp = CAMERA_MOUNT_UP;
  /* The seated pack's cells, for the gauge. */
  let runCells = airframeById(runAirframe).cells;
  /* The aircraft the Settings studio was built for; a new one rebuilds it. */
  let showcaseCraft = DEFAULT_AIRFRAME;
  /* Heap slots taken once: ten doubles for sim_float_state, four for
   * sim_plane_surfaces. */
  let floatStatePtr = 0;
  let wingSurfPtr = 0;
  /* The stabiliser setting last sent to the module. */
  let wingStabApplied = -1;
  /*
   * The flap switch on an aircraft with flaps (airframes.js `flaps`): 0
   * up, 1 half, 2 full, F stepping round them like a three position
   * switch. The plant holds the notch across resets and drives the flaps
   * at servo speed; this copy is for the OSD and the key, and goes back
   * to up with the plant's on a new airframe.
   */
  let flapNotch = 0;
  /* Moves the switch; false, and the copy unchanged, if the plant has no
   * flaps or refused the notch. */
  function setFlapNotch(n) {
    const plantHasFlaps = typeof sim.e.sim_wing_set_flaps === 'function';
    if (plantHasFlaps && sim.e.sim_wing_set_flaps(n) === SIM_OK) {
      flapNotch = n;
      return true;
    }
    return false;
  }
  /*
   * A catapult's world matrix once its aircraft is off it, so the launcher
   * stays at the spawn although it is part of the craft's model (which
   * builds, swaps and disposes it). Null while it stands under a parked
   * aircraft.
   */
  let launcherLeft = null;
  const launcherInv = new THREE.Matrix4();
  /* The canopy's last direction, craft frame, for when the aircraft stops
   * under it and no airflow says where it hangs. */
  const chuteDir = [0, 1, 0];
  /* Whether the pilot has heard the aircraft is down under its chute. */
  let chuteDownSaid = false;
  let notice = null; /* { text, untilMs } for one off shell messages */
  /* The seated world's note, held for the next flight. See showCourseNotes. */
  let heldNotes = null;
  let padPickReturn = 'title';
  /* The laps this run lasts, fixed at its start: settings.laps can change
   * from pause and must not end a run early. */
  let runLaps = ui.settings.laps;
  race.setRecordKey(recordKey());
  paintBest();

  /*
   * The world's note goes in the flight banner, never over a menu. It is
   * raised by a world loading rather than by anything the pilot did on the
   * screen in front of them, and shown at once it landed on the gate, the
   * title and the world picker, across the cards. So it is held here and
   * the frame loop shows it, timed from then, once the pilot is flying
   * that world.
   */
  function showCourseNotes() {
    const notes = view.notes ?? [];
    heldNotes = notes.length > 0 ? notes.join('\n') : null;
  }
  showCourseNotes();

  /*
   * Readings of a plant state array: [7..10] the attitude quaternion
   * (w, x, y, z), [4..6] the velocity, [11..13] the body rates. Each length
   * is summed in index order, as every other reading in this file is, so
   * a gate comparing two of them compares the same bits.
   */
  function stateNorm(st, i) {
    return Math.sqrt(st[i] * st[i] + st[i + 1] * st[i + 1] + st[i + 2] * st[i + 2]);
  }

  /* The body's up axis dotted with world up: 1 skids down, -1 on its back.
   * Clamped because a quaternion a hair off unit length can land outside. */
  function plantUpZ(st) {
    const tip = st[8] * st[8] + st[9] * st[9];
    return Math.min(1, Math.max(-1, 1 - 2 * tip));
  }

  function plantRateMag(st) {
    return stateNorm(st, 11);
  }

  function plantSpeed(st) {
    return stateNorm(st, 4);
  }

  /*
   * THE TURTLE, the shell's scripted recovery for a quad at rest on its
   * back. Its state is the flags declared with the crash state above:
   *
   *   turtleWait        parked inverted, the plant frozen, waiting for a poke
   *   turtleFlip.active the flip playing, the pose driven by the shell
   *   crashflipOn       true through both, for the OSD and the banner
   *   turtleRecover     upright again, pitch and roll ignored until centred
   *   turtleResumeGate  a pause resumed mid turtle: wait for a centred stick
   *                     before a held one counts as a poke
   *
   * Neither the wait nor the flip steps the plant (stepTurtleFrozen keeps
   * the clocks), so the flip lands exactly where the craft lay, every time.
   */

  /* A touch pad's thumb never rests on zero; past this it is a push. */
  const TOUCH_PUSH = 0.08;

  function anyArrowDown() {
    const k = input.keys;
    return k.has('ArrowUp') || k.has('ArrowDown') || k.has('ArrowLeft') || k.has('ArrowRight');
  }

  /* The crash flag edge clears Betaflight's I-term. A PID left wound up
   * against the ground or a wall throws the craft the moment it has the
   * motors back, so every hand over between shell and controller dumps it. */
  function clearIterm() {
    sim.e.sim_set_crashflip(1);
    sim.e.sim_set_crashflip(0);
  }

  /* Whether the pilot is still holding a stick off centre, for recover. */
  function stickOffCentre(roll, pitch) {
    if (anyArrowDown()) {
      return true;
    }
    if (input.isTouchPrimary() && (Math.abs(roll) > TOUCH_PUSH || Math.abs(pitch) > TOUCH_PUSH)) {
      return true;
    }
    return roll * roll + pitch * pitch >= TURTLE_STICK_MIN * TURTLE_STICK_MIN;
  }

  /*
   * The height the craft rests at while turned over. The terrain, when the
   * plant is touching it or the hull hangs within the clearance halo above
   * it; otherwise the craft is on something the height field cannot see (a
   * car roof, a deck, a box), and it keeps the height it lies at, or it
   * would be buried in the thing holding it up.
   */
  function turtleRestY(wx, wy, wz) {
    const terrain = view.height(wx, wz, wy - SURFACE_BIAS);
    const onTerrain = lastGroundHits > 0
      || (!turtleOnSupport && wy - terrain < turtleClearance());
    return onTerrain ? terrain : wy - REST_HEIGHT;
  }

  /* Off ends the turtle wherever it is. A latched turtle hands recover to
   * whatever stick is held at that moment. On starts the wait. */
  function setCrashflip(on) {
    if (on) {
      beginTurtleWait();
      return;
    }
    turtleWait = false;
    turtleFlip.active = false;
    turtleResumeGate = false;
    if (crashflipOn) {
      turtleRecover = stickOffCentre(input.channels.roll, input.channels.pitch);
    }
    crashflipOn = false;
    sim.e.sim_set_crashflip(0);
  }

  /* -1 hands every motor back to the mixer. */
  function setTurtleParkMotors(on) {
    if (Boolean(on) === turtleParkMotors) {
      return;
    }
    turtleParkMotors = Boolean(on);
    sim.motorOverride(-1, turtleParkMotors ? 0 : -1);
  }

  /*
   * Roll and pitch as the turtle reads them, in one pair reused on every
   * call: this runs inside the RC loop, per RC frame. While turned over a
   * key or a touch push is a full deflection, so an arrow tap or a timid
   * thumb is as good a poke as a radio stick at its stop. Otherwise the
   * sticks pass through untouched. Right beats left and down beats up when
   * both are held.
   */
  const turtleStick = [0, 0];
  function pushAxis(v, plus, minus) {
    if (input.keys.has(plus)) {
      return 1;
    }
    if (input.keys.has(minus)) {
      return -1;
    }
    if (input.isTouchPrimary() && Math.abs(v) > TOUCH_PUSH) {
      return v > 0 ? 1 : -1;
    }
    return v;
  }
  function turtleAxes(roll, pitch) {
    const over = turtleWait || turtleFlip.active;
    turtleStick[0] = over ? pushAxis(roll, 'ArrowRight', 'ArrowLeft') : roll;
    turtleStick[1] = over ? pushAxis(pitch, 'ArrowDown', 'ArrowUp') : pitch;
    return turtleStick;
  }

  /* True while recover still owns the stick; a centred stick releases it
   * here, and for good. */
  function turtleHoldStick(roll, pitch) {
    if (turtleRecover && !stickOffCentre(roll, pitch)) {
      turtleRecover = false;
    }
    return turtleRecover;
  }

  /* The roll and pitch the controller is handed for one RC frame. */
  function applyTurtleRc(roll, pitch) {
    const pair = turtleAxes(roll, pitch);
    if (turtleHoldStick(pair[0], pair[1])) {
      pair[0] = 0;
      pair[1] = 0;
    }
    return pair;
  }

  /* How far the newest stick sample is pushed, as the turtle reads it. */
  function turtlePush() {
    const newest = rcPending.length ? rcPending[rcPending.length - 1] : input.channels;
    const pair = turtleAxes(newest.roll, newest.pitch);
    return Math.sqrt(pair[0] * pair[0] + pair[1] * pair[1]);
  }

  /*
   * BETAFLIGHT'S OWN CRASHFLIP ON A HELD T, at any attitude.
   *
   * The scripted turtle only takes a craft at rest on its back. One wedged
   * on its side or grinding against a wall is neither, and the owner's
   * report was that it could be neither turtled out nor righted. A real
   * quad's answer is the crashflip switch: the mixer (mixer.c) spins the
   * motors on the high side, steered by pitch and roll, and the pilot walks
   * it out. That is what T is, held. It picks no attitude and plays no
   * animation, and in the air it is as useless as on a real quad.
   *
   * It stays out of the scripted turtle's way (that one owns crashflipOn),
   * off a perch, off a launch stand, under a frozen pose and in a crash
   * hold.
   */
  function manualFlipBarred() {
    return turtleWait || turtleFlip.active || landed || launchStaging || poseLock || crashed;
  }

  function setManualFlip(on) {
    if (on === manualFlip || (on && manualFlipBarred())) {
      return;
    }
    manualFlip = on;
    if (on) {
      clearIterm();
      sim.e.sim_set_crashflip(1);
    } else {
      sim.e.sim_set_crashflip(0);
      clearIterm();
    }
  }

  /* Read every frame rather than on key events, so T is a hold and a
   * release lost behind a menu or a pause still lets the mixer go. */
  function pollManualFlip() {
    const flying = mode === 'flight' && ui.screen === 'flight';
    setManualFlip(flying && !manualFlipBarred() && input.keys.has('KeyT'));
  }

  /*
   * A HIT, FELT. The owner took the "you hit something" banners out ("the
   * sound should be enough as well as the feeling of impact"), so the hit
   * is carried by three things scaled from the same number the solver
   * used: the sound, a kick of the FPV picture (the camera is bolted to the
   * frame a hit throws), and for anything but the ground the props, which
   * lose part of their speed to the strike and cost a beat of thrust.
   *
   * `scale` is m/s: the impulse the obstacle pass applied, or the speed the
   * craft met the ground at.
   */
  const HIT_FULL_MS = 12.0;     /* this much reads as the hardest hit */
  const HIT_KICK_RAD = 0.075;   /* camera kick at a full hit */
  const HIT_KICK_HZ = 9;        /* how fast the kick dies away */
  const HIT_PROP_LOSS = 0.28;   /* share of rotor speed a full hit takes */
  const HIT_LOUD = 0.45;        /* above: the impact sound, below: a clip */
  const HIT_RUMBLE = 0.25;      /* above: the pad rumbles */
  const impactKick = { x: 0, y: 0, z: 0 };
  /* Two bits that walk on every hit, so two hits in a row throw the
   * picture different ways: bit 0 signs x, bit 1 signs y, both sign z. */
  let kickSigns = 0;

  /* A hit that is no hit: overlap left over from a respawn or a recover,
   * a launch stand's constraint, and a takeoff leaving the pad. */
  function hitIsSilent(kind, now) {
    if ((landed && now < clipGraceUntil) || now < recoverGraceUntil) {
      return true;
    }
    if (launchStaging) {
      return true;
    }
    /* The pad keeps touching the plant for a few milliseconds after the
     * perch lifts, and closes fast enough to read as a hit. Only the ground
     * is muted: a gate clipped off the line is still heard. takingOff is
     * cleared in the frame that calls this, so the wall clock window is
     * what covers that frame. */
    return kind === 'ground' && (takingOff || now < takeoffUntil);
  }

  function feelImpact(scale, kind) {
    if (!(scale > 0) || hitIsSilent(kind, performance.now())) {
      return;
    }
    const u = Math.min(1, scale / HIT_FULL_MS);
    /* Loud hits are the engine's impact at the surface's hardness
     * (sim_material_info) and the momentum, grams times closing speed;
     * light ones the graze cue. The ground's material is the one handed to
     * the plant for this spot, an obstacle's its kind's (crashworld.js). */
    const material = kind === 'ground' ? groundMaterialNow : kindMaterial(kind);
    const hardness = materialHardness[material] ?? 0.5;
    if (u > HIT_LOUD) {
      audio.impact((airframeById(runAirframe).grams / 1000) * scale, hardness, scale);
    } else {
      audio.event('clip', null, u);
    }
    kickSigns = (kickSigns + 1) & 3;
    const sx = kickSigns & 1 ? 1 : -1;
    const sy = kickSigns & 2 ? 1 : -1;
    const kick = HIT_KICK_RAD * u;
    impactKick.x += kick * sx;
    impactKick.y += kick * 0.7 * sy;
    impactKick.z += kick * 0.8 * sx * sy;
    /* The ground has its own contact model, and a belly landing does not
     * slow the props. */
    if (kind !== 'ground' && typeof sim.e.sim_prop_strike === 'function') {
      sim.e.sim_prop_strike(HIT_PROP_LOSS * u);
      audio.propStrike(u, hardness);
      stateCurr = readState();
    }
    if (u > HIT_RUMBLE) {
      padRumble(u);
    }
  }

  /*
   * The gamepad's rumble, where the browser has one. vibrationActuator is
   * missing in some engines and shaped differently in others, and this is
   * called from inside the frame loop, so a throw or a rejected promise
   * here is dropped on purpose: a pad that cannot rumble must not stop the
   * flight.
   */
  function padRumble(u) {
    try {
      const actuator = input.firstGamepad()?.vibrationActuator;
      if (typeof actuator?.playEffect !== 'function') {
        return;
      }
      const effect = actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.round(60 + 140 * u),
        weakMagnitude: Math.min(1, 0.3 + 0.7 * u),
        strongMagnitude: Math.min(1, u),
      });
      if (typeof effect?.catch === 'function') {
        effect.catch(() => {});
      }
    } catch {
      /* Dropped on purpose, see above. */
    }
  }

  function decayImpactKick(dtMs) {
    const dt = dtMs > 0 ? dtMs : 0;
    const keep = Math.exp(-dt / 1000 * 2 * Math.PI * HIT_KICK_HZ);
    impactKick.x *= keep;
    impactKick.y *= keep;
    impactKick.z *= keep;
  }

  function turtleInContact() {
    return turtleOnSupport || lastGroundHits > 0;
  }

  /* The banner's words, by what the pilot flies with: the wait's how-to,
   * then recover's let-go. Mouse flight is flown on the keys' cue. */
  const TURTLE_CUES = {
    touch: ['main.turtle_mode_right_pad_pitch_or', 'main.let_go_of_the_right_pad'],
    radio: ['main.turtle_mode_right_stick_pitch_or', 'main.centre_the_right_stick_then_fly'],
    keys: ['main.turtle_mode_arrow_keys_pitch_or', 'main.let_go_of_the_arrows_then'],
  };
  function turtleCue() {
    if (input.isTouchPrimary()) {
      return TURTLE_CUES.touch;
    }
    if (input.isMousePrimary() || input.isKeyboardPrimary() || !input.firstGamepad()) {
      return TURTLE_CUES.keys;
    }
    return TURTLE_CUES.radio;
  }

  function turtleBannerText() {
    if (turtleFlip.active) {
      return 'TURTLE MODE';
    }
    const letGo = turtleRecover && !turtleWait;
    return str(turtleCue()[letGo ? 1 : 0]);
  }

  function clearanceAt(p) {
    return p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS);
  }

  /*
   * Whether the craft is resting on something, for the turtle to take it.
   * The plant's own ground contacts first; an inverted craft with none may
   * be lying on an obstacle the plant cannot see (a roof, a train), which
   * counts when the collider under it faces up.
   */
  function pollTurtleSupport() {
    if (!stateCurr || launchStaging) {
      turtleOnSupport = false;
      return;
    }
    poseFromState(stateCurr, pProbe);
    lastClearance = clearanceAt(pProbe);
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    turtleOnSupport = lastGroundHits > 0;
    const upright = plantUpZ(stateCurr) >= TURTLE_INVERT_UPZ;
    if (turtleOnSupport || upright || !view.colliders) {
      return;
    }
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
    qCollide.premultiply(qSpawn);
    const found = view.colliders.hit(
      pProbe.x, pProbe.y, pProbe.z,
      pProbe.x, pProbe.y, pProbe.z,
      vHalfFrame,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
      craftVerticalOffset(),
    );
    turtleOnSupport = found >= 0 && view.colliders.hitNy > 0.5;
  }

  function isTurtleParked() {
    return turtleWait || turtleFlip.active;
  }

  /* The OSD's attitude and speed, kept current while the plant is not
   * stepped: plantUpZ is already clamped, so acos takes it as it is. */
  function noteTurtleState(st) {
    lastUpz = plantUpZ(st);
    lastTiltDeg = (Math.acos(lastUpz) * 180) / Math.PI;
    speedNow = plantSpeed(st);
  }

  /* Puts the plant at a world point and attitude, at rest, and takes that
   * as the current and previous state. */
  function seatPlant(wx, wy, wz, qw, qx, qy, qz) {
    worldPosToSim(wx, wy, wz, pSim);
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, qw, qx, qy, qz);
    if (code !== SIM_OK) {
      throw new Error(`sim_set_pose: ${simErrorName(code)}`);
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    noteTurtleState(stateCurr);
  }

  /* The flip at u in [0, 1]: eased from the inverted attitude to the
   * upright one about the spot it lay on, lifted clear in between. */
  function seatFlipAt(u) {
    const f = turtleFlip;
    turtleSlerpQuat(f.qw0, f.qx0, f.qy0, f.qz0, f.qw1, f.qx1, f.qy1, f.qz1, turtleFlipEase(u), turtleQ);
    const y = f.surfaceY + REST_HEIGHT + turtleFlipLift(u);
    seatPlant(f.wx, y, f.wz, turtleQ[0], turtleQ[1], turtleQ[2], turtleQ[3]);
  }

  function flightCue(name) {
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event(name);
    }
  }

  function beginTurtleFlip() {
    if (!stateCurr || turtleFlip.active) {
      return;
    }
    const from = stateCurr;
    const upright = uprightPlantQuat(from[7], from[8], from[9], from[10]);
    poseFromState(from, pProbe);
    turtleWait = false;
    Object.assign(turtleFlip, {
      active: true,
      simMs0: simTimeMs,
      qw0: from[7], qx0: from[8], qy0: from[9], qz0: from[10],
      qw1: upright[0], qx1: upright[1], qy1: upright[2], qz1: upright[3],
      wx: pProbe.x,
      wz: pProbe.z,
      surfaceY: turtleRestY(pProbe.x, pProbe.y, pProbe.z),
    });
    crashflipOn = true;
    turtleRecover = false;
    takingOff = false;
    landed = false;
    clearIterm();
    setTurtleParkMotors(true);
    seatFlipAt(0);
    flightCue('clip');
  }

  /* Upright and perched on the spot, motors still parked. A stick still
   * held (or a resume still waiting for a centred one) goes to recover. */
  function finishTurtleFlip() {
    seatFlipAt(1);
    turtleWait = false;
    turtleFlip.active = false;
    crashflipOn = false;
    clearIterm();
    turtleRecover = stickOffCentre(input.channels.roll, input.channels.pitch) || turtleResumeGate;
    turtleResumeGate = false;
    landed = true;
    takingOff = false;
    startPitch = 0;
    groundY = turtleFlip.surfaceY;
    lastClearance = REST_HEIGHT;
    setTurtleParkMotors(true);
    adoptSimClock();
    acc = 0;
    flightCue('land');
  }

  /*
   * Parks the craft on its back where it lies: off any launch stand, the
   * launch switch dropped, the stick queue emptied, the plant seated at
   * rest height and the motors held. A stick already past the poke gate
   * flips it at once, unless `hold` (the capture hook's way to photograph
   * the wait).
   */
  function beginTurtleWait(hold) {
    if (!stateCurr || poseLock || isTurtleParked()) {
      return;
    }
    if (launchStaging) {
      endLaunchStaging(false);
    }
    if (lcArmed) {
      applyLaunchSwitch(false);
    }
    turtleWait = true;
    crashflipOn = true;
    turtleRecover = false;
    turtleResumeGate = false;
    takingOff = false;
    landed = false;
    flownThisRun = true;
    introMs = -1;
    parkedLift = PARKED_LIFT;
    clearIterm();
    rcPending.length = 0;
    const lying = stateCurr;
    poseFromState(lying, pProbe);
    const y = turtleRestY(pProbe.x, pProbe.y, pProbe.z) + REST_HEIGHT;
    seatPlant(pProbe.x, y, pProbe.z, lying[7], lying[8], lying[9], lying[10]);
    setTurtleParkMotors(true);
    if (!hold && turtlePush() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
  }

  /*
   * Starts the wait when the craft has come to rest on its back
   * (shouldEnterTurtle). An aircraft that lands under a parachute lies on
   * its back by design and a flying wing cannot be turned over by its
   * motors, so a chute airframe never turtles. A craft knocked off a launch
   * stand onto its back leaves the stand first.
   */
  function tryEnterTurtle(st, inContact) {
    if (!st || isTurtleParked() || poseLock || airframeById(runAirframe).chute) {
      return;
    }
    if (launchStaging) {
      if (plantUpZ(st) >= TURTLE_INVERT_UPZ) {
        return;
      }
      endLaunchStaging(false);
    }
    const resting = shouldEnterTurtle(plantUpZ(st), plantSpeed(st), plantRateMag(st), inContact, lastClearance, false);
    if (resting) {
      beginTurtleWait();
    }
  }

  /* After a resume the touch overlay comes back a frame late, and until it
   * does the stick reads as centred though the thumb has not moved. */
  function touchStillHidden() {
    return Boolean(touch) && typeof touch.active === 'function' && !input.firstGamepad() && !touch.active();
  }

  /*
   * A frame of the turtle in place of a plant step. Time still passes on
   * the sim clock (the trick recogniser is told how much), the stick is
   * read for a poke, the flip is played on that clock, and a waiting craft
   * is held where it lies.
   */
  function stepTurtleFrozen(dt) {
    acc += dt;
    const steps = Math.floor(acc / MS_PER_STEP);
    acc -= steps * MS_PER_STEP;
    simTimeMs += steps * MS_PER_STEP;
    trickDetector.idle(steps * MS_PER_STEP);
    adoptSimClock();
    if (turtleResumeGate && !touchStillHidden() && turtlePush() < TURTLE_STICK_MIN) {
      turtleResumeGate = false;
    }
    if (turtleWait && !turtleResumeGate && turtlePush() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
    if (turtleFlip.active) {
      const u = (simTimeMs - turtleFlip.simMs0) / TURTLE_FLIP_MS;
      if (u >= 1) {
        finishTurtleFlip();
      } else {
        seatFlipAt(u < 0 ? 0 : u);
      }
      return;
    }
    if (!turtleWait) {
      return;
    }
    /* Held on whatever it lies on, grass or a roof. A support that moves
     * away (a train) is not followed: the craft waits for its poke. */
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    noteTurtleState(stateCurr);
    poseFromState(stateCurr, pProbe);
    lastClearance = clearanceAt(pProbe);
  }

  function readState() {
    const { code, state } = sim.readState();
    if (code !== SIM_OK) {
      throw new Error(`sim_state: ${simErrorName(code)}`);
    }
    return state;
  }

  /*
   * THE POWER SYSTEM, configs/power.js and docs/POWER-STAGE1.md: the motor
   * or engine, the pack or the tank the pilot chose for the seated plane,
   * seated in the plant with the airframe, on the same between-runs rule
   * and at a hot swap. The stock system on its stock pack is the plant's
   * own table, so it clears rather than sets. The pack's cells and the
   * option's voice follow it. A quad's is its motors, prop and pack
   * (configs/motors.js), on the same rule: the stock choice is the table
   * and clears. The plant keeps each block until a clear, so a swap clears
   * first and seats what the new choice has, or a prop put back to stock
   * would stay seated.
   */
  /*
   * CAREER AND WAR WEAR (configs/wear.js, docs/PARTS-WEAR.md). A sortie
   * is one run of a campaign mission or a war room: at its seat the
   * charger turns packs around, a charged pack is picked, and the plant
   * is seated on that pack's and the airframe's wear; when it ends (a
   * reset, or leaving for the results) what it did is accrued. Every
   * other flight seats exactly the blocks it always has. `sortie` is
   * { airframe, packId, kinds, wear, fullS, lastTs } while one flies,
   * else null; `ui.wearDelta` is the last sortie's delta, for the
   * debrief. The wear record is the parts entry's (settings.parts[id]
   * .wear), by the module's part table, whose kinds say which parts are
   * the motors and props.
   */
  let sortie = null;
  /* The worn blocks last seated, as plain arrays, for the checks. */
  let wornSeated = null;
  const FULL_THROTTLE = 0.95;
  function realismNow() {
    return realismFlight({ mission: Boolean(roomOps.room() && roomOps.mission()), war: roomWar.on() });
  }
  function sortieSeat(airframeId, choice) {
    if (!realismNow()) {
      sortie = null;
      return null;
    }
    if (sortie && sortie.airframe === airframeId) {
      /* Seated again mid sortie (a refit, a settings pass): the same pack
       * and wear; only endSortie ends it. */
      return { wear: sortie.wear, pack: sortie.packId ? ui.settings.packs[sortie.packId] : null };
    }
    /* Another airframe seated mid sortie ends the one flying. */
    endSortie();
    const table = damage.table();
    learnPartTable(airframeId, table);
    const kinds = table.map((t) => t.kind);
    const got = startSortie(ui.settings, airframeId, choice);
    ui.settings.packs = got.packs;
    ui.persistSettings();
    const wear = propulsionHealth(got.record, kinds);
    sortie = { airframe: airframeId, packId: got.packId, kinds, wear, fullS: 0, lastTs: -1 };
    return { wear, pack: got.packId ? got.packs[got.packId] : null };
  }
  /* Seconds at full throttle, from the sticks the plant is fed. */
  function sortieSticks(ts, throttle) {
    if (sortie.lastTs >= 0 && throttle >= FULL_THROTTLE && ts > sortie.lastTs) {
      sortie.fullS += ts - sortie.lastTs;
    }
    sortie.lastTs = ts;
  }
  /* What the sortie did, accrued, before the plant forgets it. True when
   * there was one that flew, so the next run seats afresh. */
  function endSortie() {
    if (!sortie || sortie.lastTs < 0) {
      return false;
    }
    const af = airframeById(sortie.airframe);
    const p = readPower();
    const choice = powerChoice(af.id, ui.settings.power);
    const option = POWER[af.id] ? powerOption(af.id, choice.option) : null;
    const flight = {
      airframe: af.id,
      kinds: sortie.kinds,
      packId: sortie.packId,
      drawnC: p ? p.chargeC : 0,
      capacityC: p ? p.capacityC : 0,
      minCellV: p ? p.cellOcv : 0,
      lvcV: option && option.kind === 'electric' ? option.lvcV : 0,
      fullThrottleS: sortie.fullS,
      impacts: runDamage ? impactsFrom(damage.parts(), sortie.kinds.length) : [],
    };
    const entry = partsEntry(ui.settings.parts, af.id);
    const got = accrue(ui.settings.packs, wearRecordOf(ui.settings, af.id), flight);
    ui.settings.packs = got.packs;
    ui.settings.parts = normaliseParts({ ...ui.settings.parts, [af.id]: { ...entry, wear: got.record } });
    ui.wearDelta = got.delta;
    ui.persistSettings();
    sortie = null;
    return true;
  }

  function applyPower(s) {
    const af = airframeById(runAirframe);
    /* What the engine is heard as: the same choice the plant is built
     * from (src/render/enginespec.js). */
    setFlownSpec(engineSpecFor(af.id, s.power, s.combat));
    if (hasMotors(af.id) && typeof sim.e.sim_set_motors === 'function') {
      const choice = powerChoice(af.id, s.power);
      const cleared = sim.clearPower();
      if (cleared !== SIM_OK) {
        throw new Error(`sim_power_clear refused on ${af.id}: ${simErrorName(cleared)}`);
      }
      const worn = sortieSeat(af.id, choice);
      const blocks = worn
        ? wornQuadBlocks(af.id, choice, motorsBlock(af.id, choice), propPackBlock(af.id, choice), worn.wear, worn.pack)
        : { motors: motorsBlock(af.id, choice), propPack: propPackBlock(af.id, choice) };
      const plain = (b) => (b ? Array.from(b) : null);
      wornSeated = worn ? { motors: plain(blocks.motors), propPack: plain(blocks.propPack) } : null;
      const motors = blocks.motors;
      const code = motors ? sim.setMotors(motors) : SIM_OK;
      if (code !== SIM_OK) {
        throw new Error(`sim_set_motors refused ${choice.option} on ${af.id}: ${simErrorName(code)}`);
      }
      const propPack = blocks.propPack;
      const packed = propPack ? sim.setPropPack(propPack) : SIM_OK;
      if (packed !== SIM_OK) {
        throw new Error(`sim_set_prop_pack refused ${choice.prop} and ${choice.pack} on ${af.id}: ${simErrorName(packed)}`);
      }
      return;
    }
    if (!af.fixedWing || typeof sim.e.sim_set_power !== 'function') {
      return;
    }
    /* No power system at all (airframes.js `noMotor`, the DLG): the
     * plant's own table, its receiver pack's cells, and the wind alone. */
    if (!POWER[af.id]) {
      const none = sim.clearPower();
      if (none !== SIM_OK) {
        throw new Error(`sim_power_clear refused on ${af.id}: ${simErrorName(none)}`);
      }
      runCells = af.cells;
      /* An aircraft pushed more than one way speaks with the engine it has. */
      const pushed = propulsionOf(af, combatSeated(af.id));
      setFlownVoice((pushed && pushed.voice) ?? af.voice ?? 'wing');
      return;
    }
    const { option, pack } = powerChoice(af.id, s.power);
    /* The hangar's prop rides the power block; the stock prop leaves the
     * option's own block, or the table's, exactly as it was. */
    const parts = partsEntry(s.parts, af.id);
    const own = powerParams(af.id, option, pack);
    const fitted = parts.prop === 'stock' ? own : partsPowerBlock(af.id, option, parts.prop, own ?? powerBlock(af.id, option, pack));
    const worn = sortieSeat(af.id, { option, pack });
    const block = worn ? wornPowerBlock(af.id, { option, pack }, fitted, worn.wear, worn.pack) : fitted;
    wornSeated = worn && block ? { power: Array.from(block) } : null;
    const code = block ? sim.setPower(block) : sim.clearPower();
    if (code !== SIM_OK) {
      throw new Error(`sim_set_power refused ${option}/${pack} on ${af.id}: ${simErrorName(code)}`);
    }
    const opt = powerOption(af.id, option);
    runCells = powerCells(af.id, option, pack);
    setFlownVoice(opt.voice);
    /* A prop's own tone is its blade pass: blades times rpm. */
    audio.setBladeScale(propShape(af.id, opt, parts.prop).blades / opt.blades);
  }

  /*
   * THE HANGAR'S PARTS (configs/hangar-parts.js): the add-ons and the
   * tape, seated last, after the power option and the tuning they are laid
   * over, on the same between-runs rule and at a hot swap. Nothing fitted
   * clears them, which is the plant's own table. The smoke is off at every
   * seat.
   */
  function applyParts(s) {
    const af = airframeById(runAirframe);
    smokeOn = false;
    if (af.combat) {
      applyCombat(af);
      return;
    }
    if (!af.fixedWing || typeof sim.e.sim_set_addons !== 'function') {
      return;
    }
    /* A plane with no power system has no hangar parts to fit either. */
    if (!POWER[af.id]) {
      const none = sim.clearAddons();
      if (none !== SIM_OK) {
        throw new Error(`sim_addons_clear refused on ${af.id}: ${simErrorName(none)}`);
      }
      return;
    }
    const { option, pack } = powerChoice(af.id, s.power);
    const parts = partsEntry(s.parts, af.id);
    const block = addonParams(af.id, parts, powerOption(af.id, option), powerBlock(af.id, option, pack)[SIM_POWER.MASS]);
    const code = block ? sim.setAddons(block) : sim.clearAddons();
    if (code !== SIM_OK) {
      throw new Error(`sim_set_addons refused ${JSON.stringify(parts)} on ${af.id}: ${simErrorName(code)}`);
    }
  }

  /* A combat quad's payload and accessories, on the hangar parts' path and
   * rule: one lumped mass and its spread, laid over the table between
   * runs; nothing chosen clears them. */
  let combatSeatKey = null;
  function applyCombat(af) {
    const seated = combatSeated(af.id);
    combatSeatKey = JSON.stringify(seated);
    const add = combatAddon(af, seated);
    if (!add) {
      const none = sim.clearAddons();
      if (none !== SIM_OK) {
        throw new Error(`sim_addons_clear refused on ${af.id}: ${simErrorName(none)}`);
      }
      return;
    }
    const code = sim.setAddons(add.block);
    const spread = code === SIM_OK ? sim.setAddonInertia(add.inertia) : code;
    if (spread !== SIM_OK) {
      throw new Error(`the plant refused ${JSON.stringify(seated)} on ${af.id}: ${simErrorName(spread)}`);
    }
  }

  /*
   * THE PILOT'S TUNING, configs/tuning.js and the hangar's Tuning tab: the
   * CG, the rates, the expo, the trim and the flap mix the pilot set up
   * for the seated plane, on the same rule as the power and after it,
   * since the CG is balanced on the pack the power choice fits. The stock
   * setup clears, so an untuned plane flies its table bit for bit. The
   * flaps a run starts on are the setup's only where the pilot chose them;
   * otherwise the switch stays where it was, as it always did.
   * runTuneKey is what was seated, so a save can tell whether the plane in
   * the air needs a refit.
   */
  let runTuneKey = 'null';
  function applyTuning(s) {
    const af = airframeById(runAirframe);
    if (!af.fixedWing || !tuningFor(af.id) || typeof sim.e.sim_wing_set_tune !== 'function') {
      runTuneKey = 'null';
      return;
    }
    const set = setupFor(af.id, powerChoice(af.id, s.power));
    const entry = normalizeEntry(af.id, s.tuning && s.tuning[af.id], set.limits);
    const block = tuneBlock(af.id, entry, set.massKg, set.packKg);
    const code = block ? sim.setTune(block) : sim.clearTune();
    if (code !== SIM_OK) {
      throw new Error(`sim_wing_set_tune refused ${JSON.stringify(entry)} on ${af.id}: ${simErrorName(code)}`);
    }
    runTuneKey = JSON.stringify(entry);
    if (entry && entry.flapStart) {
      setFlapNotch(fullEntry(af.id, entry).flapStart);
    }
  }

  /*
   * THE TEST STAND the Tuning tab runs a plane's motor on: a second
   * instance of the module, never the one the pilot flies, made the first
   * time the bench is used and kept, initialised on the config the flown
   * one booted on (a fixed wing's plant reads none of it).
   */
  let standPromise = null;
  setTuningShell({
    stand: () => {
      if (!standPromise) {
        standPromise = simBytes.then(loadSim).then((standSim) => {
          if (standSim.init(configText) !== SIM_OK) {
            throw new Error('the test stand could not initialise its module');
          }
          return new TestStand(standSim);
        });
      }
      return standPromise;
    },
  });
  /* The voice the stand has put on the motor's audio, or null while the
   * flown craft's is on; and the flown craft's, to put back. */
  let standVoiceOn = null;
  let flownVoice = 'quad';
  function setFlownVoice(v) {
    flownVoice = v;
    if (!standVoiceOn) {
      audio.setVoice(v);
    }
  }
  /* The flown craft's engine spec, put back after the stand has played its
   * own (the stand plays a voice's model with the model's own numbers). */
  let flownSpec = null;
  function setFlownSpec(spec) {
    flownSpec = spec;
    if (!standVoiceOn) {
      audio.setEngineSpec(spec);
    }
  }

  /* The plant's pack and tank, for the OSD. Null on a quad and on a build
   * that predates the export. */
  function readPower() {
    if (!airframeById(runAirframe).fixedWing || typeof sim.e.sim_power_state !== 'function') {
      return null;
    }
    return sim.powerState();
  }

  /*
   * THE CRASH SHELL (docs/CRASH-PLAN.md, Phase A item 4).
   *
   * With the run's Crash damage setting on, the plant's crash physics
   * decides what breaks (src/native/crash.c), and this section is the whole
   * of the shell's answer to it: it names the world to the plant (the
   * ground's material under the craft, each obstacle's material, the trees
   * near the craft, the solids near the craft for the parts that leave),
   * reads back what broke, draws it (src/render/wreck.js, debris.js,
   * fpvfail.js), plays it (audio.wreck) and applies the rules: a crash that
   * leaves the aircraft unflyable is a wreck, which ends the lap and rests
   * where the physics puts it, until R takes the pilot back to the pad or X
   * respawns them where they are. A wreck never takes the sticks: while its
   * pack is in, every surface and motor still on it answers them, because
   * that is what the receiver, the controller and the servos do (the
   * owner's rule, 2026-09-25). Only the plant cuts control, through the
   * parts that have gone.
   *
   * WHAT REACHES THE PLANT, all of it through the ABI and all of it only
   * with the mode on: sim_set_damage between runs, the ground material with
   * the ground plane, sim_contact_at_mat in place of sim_contact_at where
   * the module's material has the shell's own numbers (so the contact
   * resolves exactly as before and only the judgement learns what was hit),
   * the trees and solids near the craft on the sim clock, and the perch
   * held off while a broken part is still moving or a wreck has power.
   * With the mode off none of it runs, and every flight is the flight it
   * was. With it on, a flight whose contacts stay under every limit is
   * still the same flight on grass, the plant's default ground to the bit;
   * on other ground the friction is the ground's, by design.
   */
  const damage = createDamageLink(sim);
  const wreckRig = createWreck();
  const debris = createDebris();
  shell.keepAcrossMaps(wreckRig.group);
  shell.keepAcrossMaps(debris.group);
  /*
   * A LESSON'S AIDS (src/game/training.js): the glide path to the strip
   * and the next gate's chevron, drawn only while a lesson that names one
   * is in flight. Nothing here reaches the plant.
   */
  const glidePath = createGlidePath();
  shell.keepAcrossMaps(glidePath.group);
  const gateCueHud = createGateCue();
  let glideKey = null;
  let glideAt = null;
  const cueCam = { x: 0, y: 0, z: 0, forward: new THREE.Vector3(), up: new THREE.Vector3() };
  const cueTo = { x: 0, y: 0, z: 0 };
  function aidsFrame() {
    const aid = mode === 'flight' && ui.screen === 'flight' ? ui.progress.lessonAid() : null;
    const strip = aid === 'glide' && view ? STRIPS[ui.settings.map] ?? null : null;
    const scene = shell.quad.parent;
    if (scene && glidePath.group.parent !== scene) {
      scene.add(glidePath.group);
    }
    if (strip && glideKey !== ui.settings.map) {
      glideKey = ui.settings.map;
      glideAt = glidePoints(strip, view.height(strip.x, strip.z, Infinity));
    }
    glidePath.show(strip ? glideAt : null, strip);
    const gate = aid === 'gate' && !race.freestyle ? race.gates[race.next] : null;
    if (!gate) {
      gateCueHud.show(null);
      return;
    }
    const c = shell.camera;
    cueCam.x = c.position.x;
    cueCam.y = c.position.y;
    cueCam.z = c.position.z;
    c.getWorldDirection(cueCam.forward);
    cueCam.up.set(0, 1, 0).applyQuaternion(c.quaternion);
    cueTo.x = gate.x;
    cueTo.y = gate.y + (gate.apertures[0] ? gate.apertures[0].centreY : 0);
    cueTo.z = gate.z;
    gateCueHud.show(gateCue(cueCam, cueTo));
  }
  window.__aids = () => ({ glide: glidePath.group.visible ? glidePath.group.children.map((r) => [r.position.x, r.position.y, r.position.z]) : null, gateCue: gateCueHud.shown() });
  /* Defend Itaipu's attackers (src/render/attackers.js), bursting through
   * the crash debris; into the map's scene from roomWarFrame. */
  const warAttackers = createAttackers({ debris, floorAt: (x, z) => groundAt(x, z) });
  shell.keepAcrossMaps(warAttackers.group);
  const warBooms = createExplosions({ renderer: shell.renderer });
  shell.keepAcrossMaps(warBooms.group);
  /* A stage's cutaways (src/render/warcutaway.js): a picture in picture
   * for a pilot in control, a cut for one who is not. */
  const warCutaway = createWarCutaway({
    renderer: shell.renderer,
    scene: () => shell.quad.parent,
    camera: shell.camera,
    place: (cue) => {
      if (Array.isArray(cue.at)) {
        return cue.at;
      }
      const t = roomWar.mission()?.targets?.[cue.target];
      return t ? t.at : null;
    },
    inControl: () => mode === 'flight' && !warSpectating() && Boolean(roomSentPose) && (roomSentPose.flags & FLAG_AIRBORNE) !== 0
      && (roomSentPose.flags & FLAG_CRASHED) === 0 && (roomWar.view().roundState ?? 'live') === 'live',
  });
  let warCutFov = null;
  /*
   * What the war's warheads broke (src/render/breakage.js, the room's
   * damage events): the map's chunks out, their pieces on the room clock,
   * the torn edges. Each opening goes to the map's water (map.onOpening,
   * the water's to provide under the dam break contract); until a map has
   * one it is logged, and every opening is kept for __war().
   */
  const warOpenings = [];
  const warBreakage = createBreakage({
    debris,
    floorAt: (x, z, y) => (view && typeof view.floorAt === 'function' ? view.floorAt(x, z, y) : groundAt(x, z)),
    /* Kept once each (a rebuilt map is handed them all again), and
     * always handed to the map now drawn. */
    onOpening: (o) => {
      if (warBreakageReplay) {
        return;
      }
      if (!warOpenings.some((x) => x.id === o.id && x.at === o.at)) {
        warOpenings.push(o);
      }
      if (view && typeof view.onOpening === 'function') {
        view.onOpening(o);
      } else {
        console.info(`[war damage] opening ${JSON.stringify(o)}`);
      }
    },
    /* One break heard: the world's sound's breach, by its material and
     * mass, on the room clock (src/render/world-audio.js). */
    onSound: (b, now) => {
      worldAudio.breach(b, now);
    },
    /* A target that lost something smokes from the damage's room ms,
     * unless a hit has it burning (warLiveWorld); a replay's damage is
     * the replay's (warBreakageAt) and changes nothing live. */
    onBurn: (target, e) => {
      if (!warBreakageReplay) {
        warDamaged(target, e.at);
      }
    },
  });
  shell.keepAcrossMaps(warBreakage.group);
  /*
   * THE SMOKE SYSTEM (the Parts tab's 'smoke' add-on): O in flight turns
   * it on and off, and the trail leaves the tail's nozzle on the sim clock
   * (src/render/smoke.js). A picture only; the pump and oil's mass is the
   * plant's whether it is on or not. Off at every seat.
   */
  const smoke = createSmoke();
  shell.keepAcrossMaps(smoke.group);
  /* The session's effects, compiled with each map (prewarm, above). */
  const FX_ROOTS = [wreckRig.group, debris.group, warAttackers.group, warBooms.group, warBreakage.group, smoke.group];
  /* Not the aircraft here: the boot one is replaced before anyone flies,
   * and compiling it cost twelve GL_INVALID_VALUE glGetProgramiv warnings
   * a page (scripts/shots.js), measured. */
  prewarm(FX_ROOTS);
  let smokeOn = false;
  /* Whether the trail was emitting this frame, for the crash cam. */
  let smokeLive = false;
  const smokeAt = new THREE.Vector3();
  const smokeVel = new THREE.Vector3();
  function smokeFitted() {
    return partsEntry(ui.settings.parts, runAirframe).addons.includes('smoke');
  }
  function smokeFrame() {
    /* In the world the craft is in, as the wreck's pieces are. */
    const parent = shell.quad.parent;
    if (parent && smoke.group.parent !== parent) {
      parent.add(smoke.group);
    }
    const nozzle = shell.quad.userData.smokeNozzle;
    const on = smokeOn && nozzle && stateCurr && mode === 'flight';
    smokeLive = Boolean(on);
    if (on) {
      nozzle.getWorldPosition(smokeAt);
      simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], smokeVel).applyQuaternion(qSpawn);
    }
    smoke.update(stateCurr ? stateCurr[0] : 0, on ? smokeAt : null, smokeVel, shell.canvas.clientHeight || 720, shell.camera.fov);
  }
  const fpvFail = createFpvFail(shell.canvas);
  /* Every material's hardness, 0 to 1, as the module has it
   * (sim_material_info [3]): what a hit on it sounds like. A module
   * without the call hears every surface as middling. */
  const materialHardness = (() => {
    const out = new Float64Array(SURFACES.length).fill(0.5);
    if (typeof sim.e.sim_material_info !== 'function') {
      return out;
    }
    const p = sim.e.malloc(4 * 8);
    for (let m = 0; m < SURFACES.length; m += 1) {
      if (sim.e.sim_material_info(m, p) === SIM_OK) {
        out[m] = new Float64Array(sim.e.memory.buffer, p, 4)[3];
      }
    }
    sim.e.free(p);
    return out;
  })();
  /* Collider kind to the module's surface, where the numbers agree. */
  const kindSurface = (() => {
    if (!damage.available || typeof sim.e.sim_material_info !== 'function') {
      return new Int32Array(KINDS.length).fill(-1);
    }
    const p = sim.e.malloc(4 * 8);
    const table = obstacleSurfaces((mat) => {
      if (sim.e.sim_material_info(mat, p) !== SIM_OK) {
        return null;
      }
      const d = new Float64Array(sim.e.memory.buffer, p, 4);
      return [d[0], d[1]];
    });
    sim.e.free(p);
    return table;
  })();
  /* The mode the run flies, fixed when it starts, like the flight style. */
  let runDamage = false;
  let crashFlags = 0;
  let wrecked = false;
  let wreckAtWall = 0;
  /* Since when the wreck has lain still, wall ms, or -1 while it moves. */
  let wreckStillSince = -1;
  /* Since when a tree crown has held the craft still, wall ms, or -1. */
  let treeStillSince = -1;
  let wreckCraft = null;
  let partTable = [];
  let cameraPart = -1;
  let lastParts = null;
  /* The trees and solids declared to the plant, and where from: the
   * collider set and its streamed set's generation (crashWorldStale). */
  let crashTrees = [];
  let crashTreesFrom = null;
  let crashTreesGen = 0;
  let crashStaticGen = 0;
  const treePick = [];
  const wirePick = [];
  const solidPick = [];
  /* The colliders a roof covers, marked for nearestSolids to leave out;
   * made once for the map's collider count. */
  let crashSkip = null;
  /* What coveredAt answered when the solids were declared: the same array
   * for the same roof and extent, which is how a change is seen. */
  let crashCovered = null;
  /* The colliders declared to the plant as solids, marked, and their list.
   * A host contact near a solid the plant holds is dropped by the module
   * (crash_contact_known) whichever solid the host met, so every solid the
   * host meets must be one of these: see plantMustHold. */
  let crashKnown = null;
  const crashKnownList = [];
  const slabPick = [];
  const slabBasis = new THREE.Matrix4();
  const slabQuat = new THREE.Quaternion();
  const slabU = new THREE.Vector3();
  const slabN = new THREE.Vector3();
  const slabV = new THREE.Vector3();
  const passSet = [];
  /* The posts and bars declared to the plant, which the sweep passes
   * (plantHoldsSolid): cleared at every declaration, which the cover watch
   * makes between two refreshes of the trees. */
  const solidPassSet = [];
  let crashWorldPhase = 0;
  let crashWorldX = NaN;
  let crashWorldZ = NaN;
  let chipCueAtWall = -1e9;
  let splashCueAtWall = -1e9;
  let treeCueAtWall = -1e9;
  let crashEvents = 0;
  /* Harness only: the run's damage events and the sounds they cued, for a
   * check that reads what broke, when and how hard (window.__crashLog).
   * Bounded, the oldest kept: a crash's story is how it started. */
  const crashLog = [];
  /* The jelly's whacks this run, newest last, for window.__jelly(), and
   * the jelly pass's own state (jellyPass): reset with the crash log. */
  const jellyLog = [];
  let jellyHasPrev = false;
  let jellyArmed = true;
  const CRASH_LOG_MAX = 400;
  let crashTreesDeclared = 0;
  let crashWiresDeclared = 0;
  let crashSolidsDeclared = 0;
  let fpvLensLive = false;
  /* Harness only: a crash capture's fixed camera stands outside the craft,
   * so the craft is drawn in it. See window.__crashThrow. */
  let crashCamShowsCraft = false;
  const crashAt = new THREE.Vector3();
  const crashNormal = new THREE.Vector3();
  const crashProbe = new THREE.Vector3();
  const qKnock = new THREE.Quaternion();
  const knockAxis = new THREE.Vector3();
  const crashSimA = { x: 0, y: 0, z: 0 };
  const crashSimB = { x: 0, y: 0, z: 0 };
  /* A box's orientation in the plant frame: the spawn's yaw undone,
   * which is how an axis aligned world box stands in the plant. */
  const boxQuat = new THREE.Quaternion();
  /* A turned box's own turn about the vertical (declareSolid). */
  const turnPose = {};
  const turnQuat = new THREE.Quaternion();
  const turnedQuat = new THREE.Quaternion();
  /* Refresh the trees and solids every this many steps, when the craft has
   * moved this far since the last time, and take them from this far. The
   * plant holds 32 trees and 64 solids; 80 m of trees is more than a plane
   * covers between two refreshes, 40 m of solids more than a part flies. */
  const CRASH_WORLD_STEP = 250;
  const CRASH_WORLD_MOVE = 12;
  const TREE_REACH = 80;
  const SOLID_REACH = 40;
  /* An overhead line's chords within this of the craft, as many as the
   * plant holds (WIRES_MAX): 40 m is more than a part flies between two
   * refreshes, as for the solids. */
  const WIRE_REACH = 40;
  /* And the roof cover looked at every this many steps: 10 ms is 0.14 m
   * at 14 m/s, inside the 0.25 m a wall column is wide. */
  const CRASH_COVER_STEP = 10;
  /* How long a dead feed is shown before the chase camera takes over: long
   * enough to see it die, which is how a pilot knows what happened. */
  const FEED_BEAT_MS = 1500;
  /* A chipping prop reports every step it grinds; one tick and one spray of
   * grit per this many ms is what the ear and the eye resolve. */
  const CHIP_CUE_GAP_MS = 45;

  /* The drawn ground a broken piece rests on, or null on water, which a
   * piece may lie in (src/render/wreck.js). */
  function pieceGround(x, z, fromY) {
    const h = view.height(x, z, fromY);
    const w = view.water && view.water.length ? waterAt(x, z) : null;
    return w && h <= surfaceAt(w, x, z) + 1e-6 ? null : h;
  }

  function plantToWorld(px, py, pz, qw, qx, qy, qz, outPos, outQuat) {
    simPosToThree(px, py, pz + SPAWN_ALT, outPos);
    outPos.applyQuaternion(qSpawn);
    outPos.x += startX;
    outPos.y += startY;
    outPos.z += startZ;
    if (outQuat) {
      simQuatToThree(qw, qx, qy, qz, outQuat);
      outQuat.premultiply(qSpawn);
    }
    return outPos;
  }

  /* The damage mode a run starts in: the pilot's setting, forced on in a
   * war (WARFARE-PLAN 6.3) and in any room that judges mid airs
   * (roomForcesDamage). The setting is never written, so it is theirs
   * again once the war is over or they leave the room. */
  function crashDamageWanted(s) {
    return s.crashDamage !== false || roomWar.on() || roomForcesDamage(roomLinkState.state().welcome);
  }

  /* Between runs, from applySettings: the mode this run flies. */
  function applyCrashMode(s) {
    const want = damage.available && crashDamageWanted(s);
    if (want === runDamage) {
      return;
    }
    runDamage = want;
    damage.setMode(want);
    if (!want) {
      clearCrashWorld();
    }
    crashReset();
  }

  /*
   * WHAT BROKE, for the hangar's Parts tab (configs/hangar-parts.js
   * damage): every part that left the aircraft, was destroyed, or a prop
   * that chipped, kept in settings.parts[airframe] with the part table's
   * boxes so the hangar can find them on the model. Written when the set
   * grows, which is a few times a crash. A part already taped and broken
   * again is broken; the rest of an earlier record stays. Only the part a
   * break was at is named, not the parts that went with it.
   */
  const PART_KIND_PROP = PART_KINDS.indexOf('prop');
  function recordBroken(parts) {
    const id = runAirframe;
    if (!PROPS[id] || !partTable.length) {
      return;
    }
    const was = partsEntry(ui.settings.parts, id);
    const old = was.damage ? was.damage.parts : [];
    const broken = new Map(old.map((p) => [p.i, p]));
    let grew = false;
    for (let i = 1; i < partTable.length; i += 1) {
      const o = i * PART_STATE_DOUBLES;
      const t = partTable[i];
      const gone = parts[o + STATE.status] !== 0 || parts[o + STATE.damage] >= 0.999
        || (t.kind === PART_KIND_PROP && parts[o + STATE.damage] > 0);
      if (!gone || (broken.has(i) && broken.get(i).state === 'broken')) {
        continue;
      }
      broken.set(i, { i, kind: t.kind, cg: t.cg, mass: t.mass, joint: t.joint, state: 'broken' });
      grew = true;
    }
    /* A part that left with its parent is the parent's break: the record
     * names the part the break was at, and the hangar draws what hangs
     * off it with it. Parents precede children in the table. */
    for (const i of [...broken.keys()]) {
      for (let q = partTable[i].parent; q > 0; q = partTable[q].parent) {
        if (broken.has(q) && broken.get(q).state === 'broken') {
          broken.delete(i);
          break;
        }
      }
    }
    if (!grew) {
      return;
    }
    const r = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);
    const entry = {
      ...was,
      damage: {
        boxes: partTable.map((t) => [r(t.boxMin), r(t.boxMax)]),
        parents: partTable.map((t) => t.parent),
        parts: [...broken.values()].sort((a, b) => a.i - b.i).map((p) => ({ ...p, cg: r(p.cg), joint: r(p.joint) })),
      },
    };
    ui.settings.parts = normaliseParts({ ...ui.settings.parts, [id]: entry });
    ui.persistSettings();
  }

  /* From resetCraft, after sim_reset has cleared the damage state. */
  function crashReset() {
    wrecked = false;
    wreckStillSince = -1;
    treeStillSince = -1;
    crashFlags = 0;
    lastParts = null;
    crashLog.length = 0;
    jellyLog.length = 0;
    jellyHasPrev = false;
    jellyArmed = true;
    wreckRig.reset();
    debris.clear();
    fpvFail.clear();
    crashWorldX = NaN;
    crashWorldPhase = 0;
    partsLeft = false;
    if (craftHull) {
      hullIntact(craftHull);
    }
  }

  /*
   * A REFILL OF THE STREAMED SET RENUMBERS IT (src/game/collide.js
   * streamFill): after the swap every index from staticCount up names
   * another collider, and the swap has cleared their pass flags. The
   * trees are collected again, and the streamed indices this crash world
   * holds (the flags it set, the solids it declared) are forgotten
   * without touching the flags: clearing one now would clear a flag the
   * roofs' cover has since set on the collider that took its number. The
   * static ones stay, to be cleared as ever. The world is declared again
   * at the next refresh on the sim clock, whatever the craft has done
   * since (crashWorldX NaN); true when it was stale.
   */
  function crashWorldStale(col) {
    if (!col || crashTreesFrom !== col || col.streamGen === crashTreesGen) {
      return false;
    }
    for (const list of [passSet, solidPassSet]) {
      let n = 0;
      for (const i of list) {
        if (i < col.staticCount) {
          list[n] = i;
          n += 1;
        }
      }
      list.length = n;
    }
    for (const i of crashKnownList) {
      crashKnown[i] = 0;
    }
    crashKnownList.length = 0;
    crashTrees = collectTrees(col);
    crashTreesGen = col.streamGen;
    crashWorldX = NaN;
    return true;
  }

  function clearCrashPass() {
    crashWorldStale(view.colliders);
    const pass = crashTreesFrom && crashTreesFrom.pass;
    for (const i of passSet) {
      if (pass) {
        pass[i] = 0;
      }
    }
    passSet.length = 0;
    clearSolidPass();
  }

  function clearSolidPass() {
    crashWorldStale(view.colliders);
    const pass = view.colliders && view.colliders.pass;
    for (const i of solidPassSet) {
      if (pass) {
        pass[i] = 0;
      }
    }
    solidPassSet.length = 0;
  }

  function clearCrashWorld() {
    clearCrashPass();
    if (damage.available) {
      sim.e.sim_tree_clear();
      sim.e.sim_wire_clear();
      sim.e.sim_obstacle_clear();
    }
    crashTreesDeclared = 0;
    crashWiresDeclared = 0;
    crashSolidsDeclared = 0;
    crashWorldX = NaN;
  }

  /* The ground plane's material, with the plane itself. */
  function declareGroundMaterial(wx, wz, hy) {
    const w = view.water && view.water.length ? waterAt(wx, wz) : null;
    const wet = w != null && hy >= surfaceAt(w, wx, wz) - 0.05;
    groundMaterialNow = groundSurface(view, wx, wz, groundNWorld.y, wet, hy);
    sim.e.sim_set_ground_material(groundMaterialNow);
  }

  /* The obstacle contact's material, or -1 for the shell's own numbers. */
  function obstacleSurfaceFor(kindIndex) {
    return runDamage && kindIndex >= 0 && kindIndex < kindSurface.length ? kindSurface[kindIndex] : -1;
  }

  /*
   * A FIXED WING'S HULL IS ITS PARTS (src/game/collide.js setCraftParts):
   * the crash core's own table, seated with the airframe whatever the
   * damage mode, so a pole meets the wing where the wing is. A quad keeps
   * its prop discs, and so does a build without the parts ABI.
   */
  let craftHull = null;
  function seatCraftParts() {
    craftHull = null;
    if (damage.available && airframeById(runAirframe).fixedWing) {
      craftHull = airframeHull(damage.table(), THREE_BODY, simLenToWorld(1));
    }
    setCraftParts(craftHull);
  }

  /* A part that has left is out of the hull: after a step that broke a
   * joint, what is still on the craft, from the plant's own readback. */
  let partsLeft = false;
  function syncCraftParts(st) {
    partsLeft = false;
    const parts = craftHull ? damage.parts() : null;
    if (parts) {
      hullFromPartsState(craftHull, parts, PART_STATE_DOUBLES, STATE.status, STATE.pos, st);
    }
  }

  /*
   * THE STEP TRACE, harness only (window.__stepTrace): from a throw, per sim
   * step, a hash of the plant's state going into the step (after anything
   * the shell did to it), of the ground plane the shell handed it for the
   * step, and of the state coming out. Two stagings of one crash compared
   * step by step say where they part: a step whose inputs hash the same and
   * whose output does not is the plant's; one whose input already differs
   * is the shell's.
   */
  const TRACE_STEPS = 12000;
  const stepTrace = {
    on: false, n: 0, ground: 0,
    pre: new Int32Array(TRACE_STEPS), plane: new Int32Array(TRACE_STEPS), post: new Int32Array(TRACE_STEPS),
  };
  const traceWords = new Int32Array(new Float64Array(1).buffer);
  const traceBits = new Float64Array(traceWords.buffer);
  function traceHash(h, v) {
    traceBits[0] = v;
    h = Math.imul(h ^ traceWords[0], 0x01000193);
    return Math.imul(h ^ traceWords[1], 0x01000193);
  }
  function traceState(st) {
    let h = 0x811c9dc5 | 0;
    for (let k = 0; k < 18; k += 1) {
      h = traceHash(h, st[k]);
    }
    return h;
  }
  /* And every stick frame handed to the plant, [t s, roll, pitch, yaw,
   * throttle]: the one input the step hashes do not carry. */
  const TRACE_INPUTS = 4000;
  const inputTrace = [];
  function traceInput(ts, roll, pitch, yaw, throttle) {
    if (stepTrace.on && inputTrace.length < TRACE_INPUTS) {
      inputTrace.push([ts, roll, pitch, yaw, throttle]);
    }
  }
  function tracePre(st) {
    if (stepTrace.on && stepTrace.n < TRACE_STEPS) {
      stepTrace.pre[stepTrace.n] = traceState(st);
      stepTrace.plane[stepTrace.n] = stepTrace.ground;
    }
  }
  function tracePost(st) {
    if (stepTrace.on && stepTrace.n < TRACE_STEPS) {
      stepTrace.post[stepTrace.n] = traceState(st);
      stepTrace.n += 1;
    }
  }

  /*
   * Before every sim_step(1) with the mode on: the world again when the
   * streamed set has been swapped since it was declared. What streamed in
   * was not declared, and a throw or a respawn that the set refills round
   * declares the world from the set before, round where the craft was:
   * there a building far from the old centre is one box round its whole
   * footprint. An Itaipu dive thrown 6 m over a conductor met it at step
   * 192 of the 250 a refresh waits (collide-audit-itaipu, power
   * conductor, dived onto); a five inch let down on a flat roof whose
   * neighbour's footprint box held it was wrecked in the first step, the
   * one an after-step check let through (town-check, roofs). A swap
   * happens between steps, so before the step is the first it can be.
   */
  function crashBeforeStep(st) {
    if (crashTreesFrom === view.colliders && view.colliders.streamGen !== crashTreesGen) {
      crashWorldPhase = 0;
      refreshCrashWorld(st);
    }
  }

  /* After every sim_step(1) with the mode on: the events, and the world. */
  function crashAfterStep(st) {
    tracePost(st);
    damage.drain(onDamageEvent);
    if (partsLeft) {
      syncCraftParts(st);
    }
    crashWorldPhase += 1;
    if (crashWorldPhase >= CRASH_WORLD_STEP || !(crashWorldX === crashWorldX)) {
      crashWorldPhase = 0;
      refreshCrashWorld(st);
      return;
    }
    /* The solids again when the roof the craft is covered by changes,
     * which happens within a metre of an eave, between two refreshes. */
    if (crashWorldPhase % CRASH_COVER_STEP === 0) {
      refreshCrashCover(st);
    }
  }

  function refreshCrashCover(st) {
    if (!view.coveredAt) {
      return;
    }
    poseFromState(st, crashProbe);
    if (view.coveredAt(crashProbe.x, crashProbe.z, crashProbe.y - SURFACE_BIAS) !== crashCovered) {
      declareCrashSolids();
    }
  }

  /*
   * The trees and solids near the craft, declared on the sim clock so the
   * set is a function of the flight, not of the frame rate.
   */
  function refreshCrashWorld(st) {
    poseFromState(st, crashProbe);
    crashWorldStale(view.colliders);
    /* A static solid broke or moved (collide.js staticGen: the war's
     * damage, a spillway gate's leaf): what was declared from it is
     * declared again, wherever the craft is. */
    const gen = view.colliders ? view.colliders.staticGen : 0;
    if (gen !== crashStaticGen) {
      crashStaticGen = gen;
      crashWorldX = NaN;
    }
    if (crashWorldX === crashWorldX) {
      const dx = crashProbe.x - crashWorldX;
      const dz = crashProbe.z - crashWorldZ;
      if (dx * dx + dz * dz < CRASH_WORLD_MOVE * CRASH_WORLD_MOVE) {
        return;
      }
    }
    declareCrashWorld(-1);
  }

  /* The trees and solids nearest crashProbe, with collider `must` among
   * them when it is not -1. */
  function declareCrashWorld(must) {
    crashWorldX = crashProbe.x;
    crashWorldZ = crashProbe.z;
    const col = view.colliders;
    if (crashTreesFrom !== col) {
      clearCrashPass();
      crashTrees = collectTrees(col);
      crashTreesFrom = col;
      crashTreesGen = col.streamGen;
    }
    clearCrashPass();
    sim.e.sim_tree_clear();
    crashTreesDeclared = 0;
    nearestTrees(crashTrees, crashProbe.x, crashProbe.z, TREE_REACH, TREES_MAX, treePick);
    for (const { i } of treePick) {
      const t = crashTrees[i];
      worldPosToSim(t.x, t.y0, t.z, crashSimA);
      const z0 = crashSimA.z;
      const c0 = worldPosToSim(t.x, t.crownY0, t.z, crashSimB).z;
      const c1 = worldPosToSim(t.x, t.crownY1, t.z, crashSimB).z;
      const k = sim.e.sim_tree_add(crashSimA.x, crashSimA.y, z0, t.trunkR, c0, c1, t.crownR);
      if (k < 0) {
        break;
      }
      /* Its leaves: the crown spheres, each a clump the plant flies the
       * craft into, with the air between them left as air. */
      for (const j of t.crown) {
        worldPosToSim(col.fax[j], col.fay[j], col.faz[j], crashSimB);
        const code = sim.e.sim_tree_clump_add(k, crashSimB.x, crashSimB.y, crashSimB.z, col.fr[j]);
        if (code !== SIM_OK) {
          throw new Error(`sim_tree_clump_add: ${simErrorName(code)} for crown sphere ${j} of a tree with ${t.crown.length}`);
        }
      }
      crashTreesDeclared += 1;
      /* The crown is the plant's now: the sweep flies into it. */
      for (const j of t.crown) {
        col.pass[j] = 1;
        passSet.push(j);
      }
      if (t.post >= 0) {
        col.pass[t.post] = 1;
        passSet.push(t.post);
      }
    }
    declareCrashWires(col, must);
    /* A tree the host met is the plant's now as a tree, passed like the
     * rest (its crown and trunk), not a solid besides. */
    declareCrashSolids(must >= 0 && col.pass[must] ? -1 : must);
  }

  /*
   * THE WIRES ARE THE PLANT'S. Every chord of an overhead line within
   * WIRE_REACH of crashProbe goes to the plant (sim_wire_add), which meets
   * it with the parts' hull edges in every step, and the sweep lets it
   * through, as it does a crown the plant holds. With `must` a wire the
   * host met that was not among them, that one first.
   */
  function declareCrashWires(col, must) {
    sim.e.sim_wire_clear();
    crashWiresDeclared = 0;
    nearestWires(col, crashProbe.x, crashProbe.y, crashProbe.z, WIRE_REACH, WIRES_MAX, wirePick);
    if (must >= 0 && col.fkind[must] === KINDS.indexOf('wire') && !wirePick.some((o) => o.i === must)) {
      wirePick.unshift({ d2: 0, i: must });
      if (wirePick.length > WIRES_MAX) {
        wirePick.length = WIRES_MAX;
      }
    }
    for (const { i } of wirePick) {
      worldPosToSim(col.fax[i], col.fay[i], col.faz[i], crashSimA);
      worldPosToSim(col.fbx[i], col.fby[i], col.fbz[i], crashSimB);
      const k = sim.e.sim_wire_add(crashSimA.x, crashSimA.y, crashSimA.z, crashSimB.x, crashSimB.y, crashSimB.z, col.fr[i]);
      if (k < 0) {
        throw new Error(`sim_wire_add: ${simErrorName(k)} for wire collider ${i}, ${crashWiresDeclared} declared`);
      }
      crashWiresDeclared += 1;
      col.pass[i] = 1;
      passSet.push(i);
    }
  }

  /* The solids near crashProbe for the free bodies. A roof the craft is
   * on stands over the walls under it, and the city's staircase stands up
   * into it: the parts meet the roof, which is the ground, not them. The
   * same solids the sweep lets through (src/render/library/roofs.js cover),
   * chosen from where the plant is, so the set stays a function of the
   * flight. */
  function declareCrashSolids(must = -1) {
    const col = view.colliders;
    /* A plane's soft pieces are not the plant's (jellyPass). */
    col.softKinds = softKindsFor();
    clearSolidPass();
    for (const i of crashKnownList) {
      crashKnown[i] = 0;
    }
    crashKnownList.length = 0;
    sim.e.sim_obstacle_clear();
    crashSolidsDeclared = 0;
    const covered = view.coveredAt
      ? view.coveredAt(crashProbe.x, crashProbe.z, crashProbe.y - SURFACE_BIAS)
      : null;
    crashCovered = covered;
    if (covered && covered.length) {
      if (!crashSkip || crashSkip.length !== col.count) {
        crashSkip = new Uint8Array(col.count);
      }
      for (const i of covered) {
        crashSkip[i] = 1;
      }
    }
    nearestSolids(col, crashProbe.x, crashProbe.y, crashProbe.z, SOLID_REACH, OBSTACLES_MAX, solidPick, covered && covered.length ? crashSkip : null);
    if (covered && covered.length) {
      for (const i of covered) {
        crashSkip[i] = 0;
      }
    }
    if (must >= 0 && !solidPick.some((o) => o.i === must)) {
      solidPick.unshift({ d2: 0, i: must });
      if (solidPick.length > OBSTACLES_MAX) {
        solidPick.length = OBSTACLES_MAX;
      }
    }
    if (view.roofSlabs) {
      view.roofSlabs(crashProbe.x, crashProbe.z, crashProbe.y - SURFACE_BIAS, SOLID_REACH, slabPick);
      slabPick.sort((a, b) => a.d2 - b.d2);
    } else {
      slabPick.length = 0;
    }
    boxQuat.copy(qSpawnInv);
    /* The solids and the roofs, nearest first, as many as the plant holds. */
    let si = 0;
    let ri = 0;
    while (si < solidPick.length || ri < slabPick.length) {
      const roof = ri < slabPick.length && (si >= solidPick.length || slabPick[ri].d2 < solidPick[si].d2);
      if (roof) {
        if (declareSlab(slabPick[ri]) < 0) {
          break;
        }
        ri += 1;
        crashSolidsDeclared += 1;
        continue;
      }
      const i = solidPick[si].i;
      si += 1;
      if (declareSolid(col, i) < 0) {
        break;
      }
      crashSolidsDeclared += 1;
      if (!crashKnown || crashKnown.length !== col.count) {
        crashKnown = new Uint8Array(col.count);
      }
      crashKnown[i] = 1;
      crashKnownList.push(i);
      if (plantHoldsSolid(col, i)) {
        col.pass[i] = 1;
        solidPassSet.push(i);
      }
    }
  }

  /*
   * A ROOF IS A SOLID FOR THE BROKEN PARTS. The craft stands on a roof
   * through the plant's ground plane (src/render/library/roofs.js), but a free
   * part has no ground but that one plane under the craft, and the roof was
   * declared to the plant as nothing: a Cub's aileron that fell on a roof
   * beside the craft went through the tiles and came to rest on the walls'
   * tops at the plate, five metres up inside the house. Each face is a slab
   * under the tiles (roofSlabs), in the roof's own material; the roof the
   * craft stands on is left to the ground plane.
   */
  function declareSlab({ slab, material }) {
    worldPosToSim(slab.c[0], slab.c[1], slab.c[2], crashSimA);
    slabU.set(slab.u[0], slab.u[1], slab.u[2]);
    slabN.set(slab.n[0], slab.n[1], slab.n[2]);
    slabV.set(slab.v[0], slab.v[1], slab.v[2]);
    slabBasis.makeBasis(slabU, slabN, slabV);
    slabQuat.setFromRotationMatrix(slabBasis).premultiply(qSpawnInv);
    /* As declareSolid's boxes: the plant box's x is the slab's v (Three z),
     * its y the slab's u (Three x), its z the slab's normal (Three y). */
    return sim.e.sim_obstacle_box(
      crashSimA.x, crashSimA.y, crashSimA.z,
      slab.hv, slab.hu, slab.hn,
      slabQuat.w, -slabQuat.z, -slabQuat.x, slabQuat.y,
      SURFACE[material] ?? SURFACE.concrete,
    );
  }

  /*
   * A POST OR A BAR THE PLANT HOLDS IS THE PLANT'S ALONE. Its parts meet
   * it through their own springs, so they go into it a little, and the
   * host's sweep read that as a craft buried in a pole: it dropped the
   * contact (crash_contact_known) but then put the craft back out along
   * the pole's radius and carried its travel round the face, a few
   * centimetres sideways every 4 ms. A Cub's wing at 0.3 to 0.6 m out slid
   * round a power pole that way with no damage at all. The sweep lets these
   * through, as it does a tree's crown. A box is still met by both: its top
   * is ground the shell perches on (a deck, a car roof, a roof's walls) and
   * a ball is declared as a cylinder, so neither is the same solid in the
   * plant.
   */
  function plantHoldsSolid(col, i) {
    if (col.fbox[i]) {
      return false;
    }
    const dx = col.fbx[i] - col.fax[i];
    const dy = col.fby[i] - col.fay[i];
    const dz = col.fbz[i] - col.faz[i];
    return dx * dx + dy * dy + dz * dz >= 1e-6;
  }

  /*
   * EVERY SOLID THE HOST MEETS IS ONE THE PLANT HOLDS. The module drops a
   * host's contact when any solid it was told of lies along the contact's
   * normal within the craft's reach (crash_contact_known), since the parts
   * meet that solid with their own springs. It cannot tell which solid the
   * host met. So a host contact on a solid outside the plant's 64 was
   * dropped whenever one inside them stood near: the gondola station's
   * 148 wall columns let a Skyhunter through its wall at 13 m/s, and in
   * Node a wall the plant was not told of, with a plate it was told of
   * 0.4 m behind the face, was passed nine contacts out of nine. Before a
   * contact on a static solid the plant does not hold, the world is
   * declared again from the contact point with that solid in it, so the
   * contact the module drops is one its parts meet. On the sim clock, like
   * every declaration.
   */
  function plantMustHold(col, x, y, z) {
    const i = col.hitIndex;
    crashWorldStale(col);
    if (i < 0 || (crashKnown && crashKnown[i])) {
      return;
    }
    passStats.plantHeld += 1;
    crashProbe.set(x, y, z);
    crashWorldPhase = 0;
    declareCrashWorld(i);
    /* Held now as a solid, or as a tree whose trunk and crown the sweep
     * passes. Anything else breaks the rule above: counted, and loud in
     * window.__contacts(). */
    if (!(crashKnown && crashKnown[i]) && !col.pass[i]) {
      passStats.unheld += 1;
    }
  }

  /* One collider as a solid for the free bodies. Returns the module's
   * answer, negative when it is full. */
  function declareSolid(col, i) {
    const mat = solidSurfaceAt(col, i);
    const ax = col.fax[i];
    const ay = col.fay[i];
    const az = col.faz[i];
    const bx = col.fbx[i];
    const by = col.fby[i];
    const bz = col.fbz[i];
    if (col.fbox[i] === TURNED) {
      /* The box's frame is the spawn's turned by the box's own turn
       * (crashworld.js turnedBoxPose); as the axis aligned box below, the
       * plant box's x is along the box's w, y along its u, z up. */
      const b = turnedBoxPose(col, i, turnPose);
      worldPosToSim(b.cx, b.cy, b.cz, crashSimA);
      turnQuat.set(0, b.qy, 0, b.qw);
      turnedQuat.multiplyQuaternions(boxQuat, turnQuat);
      return sim.e.sim_obstacle_box(
        crashSimA.x, crashSimA.y, crashSimA.z,
        b.hw, b.hu, b.hy,
        turnedQuat.w, -turnedQuat.z, -turnedQuat.x, turnedQuat.y, mat,
      );
    }
    if (col.fbox[i]) {
      worldPosToSim((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, crashSimA);
      /* The box's own frame is the world's turned by the spawn: its x half
       * extent is along world z, y along world x, z along world y. */
      return sim.e.sim_obstacle_box(
        crashSimA.x, crashSimA.y, crashSimA.z,
        Math.abs(bz - az) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2,
        boxQuat.w, -boxQuat.z, -boxQuat.x, boxQuat.y, mat,
      );
    }
    const r = col.fr[i];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-3 || (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3)) {
      /* A post, or a ball: an upright cylinder over its whole height. */
      worldPosToSim(ax, Math.min(ay, by) - r, az, crashSimA);
      const top = worldPosToSim(ax, Math.max(ay, by) + r, az, crashSimB).z;
      const idx = sim.e.sim_obstacle_cylinder(crashSimA.x, crashSimA.y, crashSimA.z, top, r, mat);
      /* A gate's upright gives (crashworld.js postGive). */
      const give = idx >= 0
        ? postGive(col.kindName(col.fkind[i]), r, gateScaleFor('full'), top - crashSimA.z)
        : null;
      if (give && sim.e.sim_obstacle_compliance(idx, give.ei, give.mLine, give.mFree) !== SIM_OK) {
        throw new Error('sim_obstacle_compliance refused a gate post');
      }
      return idx;
    }
    /* A bar at an angle: the box that holds it, along it. */
    worldPosToSim((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, crashSimA);
    worldDirToSim(dx / len, dy / len, dz / len, crashSimB);
    /* The rotation taking the box's x axis onto the bar. */
    let qw = 1 + crashSimB.x;
    let qy = -crashSimB.z;
    let qz = crashSimB.y;
    if (qw < 1e-6) {
      qw = 0;
      qy = 0;
      qz = 1;
    }
    const qn = Math.sqrt(qw * qw + qy * qy + qz * qz);
    return sim.e.sim_obstacle_box(
      crashSimA.x, crashSimA.y, crashSimA.z,
      len / 2 + r, r, r,
      qw / qn, 0, qy / qn, qz / qn, mat,
    );
  }

  /*
   * One damage event, straight out of the module's heap: where, how hard,
   * on what. Render and sound only; the step loop has already moved on.
   */
  function onDamageEvent(ev, o) {
    crashEvents += 1;
    const type = ev[o + EVENT.type];
    if (crashLog.length < CRASH_LOG_MAX) {
      const p = partTable[ev[o + EVENT.part]];
      crashLog.push({
        /* The step it happened in, from the module: the shell's own
         * stateCurr is only refreshed per frame and per contact pass, so
         * two stagings of one crash logged one break 3 ms apart. */
        t: ev[o + EVENT.step] / SIM_HZ,
        part: p ? partLabel(p.kind, p.cg[0], p.cg[1], !airframeById(runAirframe).fixedWing) : String(ev[o + EVENT.part]),
        type: EVENT_TYPES[type] ?? String(type),
        ratio: ev[o + EVENT.ratio],
        force: ev[o + EVENT.force],
        moment: ev[o + EVENT.moment],
        closing: ev[o + EVENT.closing],
        surface: SURFACES[ev[o + EVENT.surface]] ?? String(ev[o + EVENT.surface]),
      });
    }
    if (type === 1) {
      partsLeft = true;
    }
    if (type === 7) {
      return;
    }
    const part = ev[o + EVENT.part];
    const speed = ev[o + EVENT.closing];
    const surface = ev[o + EVENT.surface];
    const nowWall = performance.now();
    plantToWorld(ev[o + EVENT.point], ev[o + EVENT.point + 1], ev[o + EVENT.point + 2], 1, 0, 0, 0, crashAt, null);
    simPosToThree(ev[o + EVENT.normal], ev[o + EVENT.normal + 1], ev[o + EVENT.normal + 2], crashNormal);
    crashNormal.applyQuaternion(qSpawn);
    if (crashNormal.lengthSq() < 1e-6) {
      crashNormal.set(0, 1, 0);
    }
    const info = partTable[part];
    const shed = info ? MATERIALS[info.material] : null;
    const level = Math.min(1, Math.max(speed, 3) / 20);
    const wet = surface === SURFACE.water;
    if (type === 3 && nowWall - chipCueAtWall < CHIP_CUE_GAP_MS) {
      return;
    }
    const floorY = view.height(crashAt.x, crashAt.z, crashAt.y + 0.5);
    const kind = type === 1 ? 'break' : type === 2 ? 'crush' : 'hit';
    /* A part leaving in the air (forced, or a bending moment with no
     * contact) throws only its own pieces, not the ground's. */
    const touching = speed > 0.05;
    if (touching || kind !== 'hit') {
      debris.emit(crashAt, crashNormal, touching ? speed : 4, touching ? surface : -1, shed, floorY, kind);
    }
    if (typeof audio.wreck !== 'function') {
      return;
    }
    if (type === 1) {
      audio.wreck('snap', level);
    } else if (type === 2) {
      audio.wreck('crunch', level);
    } else if (type === 3) {
      chipCueAtWall = nowWall;
      audio.wreck('chip', level);
    }
    if (wet && nowWall - splashCueAtWall > 250) {
      splashCueAtWall = nowWall;
      audio.wreck('splash', level);
    }
  }

  /*
   * Once a frame, right after the craft is posed: read the damage, draw
   * the pieces, judge the wreck. Render and rules; the plant has moved on.
   */
  function crashFrame(nowWall, dt) {
    const parent = shell.quad.parent;
    if (parent && wreckRig.group.parent !== parent) {
      parent.add(wreckRig.group);
      parent.add(debris.group);
    }
    debris.update(dt / 1000);
    if (!runDamage) {
      return;
    }
    if (wreckCraft !== shell.quad) {
      partTable = damage.table();
      cameraPart = partTable.findIndex((p) => p.kindName === 'camera');
      wreckRig.attach(shell.quad, partTable, shell.discs);
      wreckCraft = shell.quad;
    }
    const before = crashFlags;
    crashFlags = damage.flags();
    lastParts = crashFlags ? damage.parts() : null;
    if (lastParts) {
      recordBroken(lastParts);
    }
    crashEntries(crashFlags & ~before, nowWall);
    if (lastParts) {
      wreckRig.update(lastParts, damage.count(), stateCurr, plantToWorld, pieceGround);
    }
    fpvFail.set(
      (crashFlags & DAMAGE_FLAGS.antennaLost) !== 0,
      (crashFlags & DAMAGE_FLAGS.cameraLost) !== 0,
      (crashFlags & DAMAGE_FLAGS.batteryEjected) !== 0,
      nowWall,
    );
    if (!wrecked && mode === 'flight' && isWreck(crashFlags, airframeById(runAirframe).fixedWing)) {
      enterWreck(nowWall);
    }
    /* HUNG UP IN A TREE. A crown that catches a craft whole raises only
     * inTree, and no wreck flag: the owner's Timber hung at 0 m/s in the
     * branches with no banner and no REPLAY prompt, and the frozen FPV
     * picture read as the game hanging. Held by a crown and still for as
     * long as a wreck must lie still is the flight's end. The sticks still
     * answer, so a quad that punches out of the branches flies on. */
    const held = (crashFlags & DAMAGE_FLAGS.inTree) !== 0 && stateCurr
      && plantSpeed(stateCurr) <= PERCH_SPEED && plantRateMag(stateCurr) <= PERCH_RATE;
    if (!held) {
      treeStillSince = -1;
    } else if (treeStillSince < 0) {
      treeStillSince = nowWall;
    } else if (!wrecked && mode === 'flight' && nowWall - treeStillSince >= WRECK_REST_MS) {
      enterWreck(nowWall);
    }
    if (!wrecked || !stateCurr) {
      wreckStillSince = -1;
    } else if (plantSpeed(stateCurr) > PERCH_SPEED || plantRateMag(stateCurr) > PERCH_RATE) {
      wreckStillSince = -1;
    } else if (wreckStillSince < 0) {
      wreckStillSince = nowWall;
    }
  }

  /*
   * WHAT A CONTACT WITHOUT DAMAGE STILL THROWS UP. A crown the craft flies
   * into and water it lands on report no damage event unless something
   * breaks, and both are loud to the eye: leaves and twigs out of the tree,
   * spray off the water. Taken from the flags the plant raises the step
   * the craft is held by a crown or wet, and for an aircraft on floats from
   * its own descent onto the surface. Render only.
   */
  function crashEntries(entered, nowWall) {
    const speed = speedNow;
    if ((entered & DAMAGE_FLAGS.inTree) && nowWall - treeCueAtWall > 300) {
      treeCueAtWall = nowWall;
      crashNormal.set(0, 1, 0);
      debris.emit(pCurr, crashNormal, Math.max(4, speed), SURFACE.foliage, null,
        view.height(pCurr.x, pCurr.z, pCurr.y), 'hit');
    }
    const w = view.water && view.water.length ? waterAt(pCurr.x, pCurr.z) : null;
    if (!w || nowWall - splashCueAtWall < 140 || !stateCurr) {
      return;
    }
    const surfaceY = surfaceAt(w, pCurr.x, pCurr.z);
    const above = pCurr.y - surfaceY;
    const sink = -stateCurr[6];
    const wet = (entered & DAMAGE_FLAGS.inWater) !== 0
      || (above < 0.35 && above > -0.5 && (sink > 1.2 || speed > 7));
    if (!wet) {
      return;
    }
    splashCueAtWall = nowWall;
    crashAt.set(pCurr.x, surfaceY, pCurr.z);
    crashNormal.set(0, 1, 0);
    debris.emit(crashAt, crashNormal, Math.max(sink * 3, speed * 0.6), SURFACE.water, null, surfaceY, 'hit');
    if (crashLog.length < CRASH_LOG_MAX) {
      crashLog.push({ t: stateCurr[0], part: 'craft', type: 'splash', ratio: 0, force: 0, moment: 0, closing: Math.max(sink, speed), surface: 'water' });
    }
    if (sink > 1.5 && typeof audio.wreck === 'function') {
      audio.wreck('splash', Math.min(1, sink / 4));
    }
  }

  /*
   * THE RULES OF A WRECK. The lap it happened in is over (race.voidLap,
   * the same bookkeeping a weight change mid lap gets); in freestyle it is
   * a bail. Nothing is moved and nothing is disarmed: the wreck lies where
   * the physics left it, and a quad with three props and airmode on
   * thrashes on the grass the way a real one does until its pilot lets go
   * of the sticks or resets: control ends when the pack leaves, not when
   * the shell decides the flight is over.
   */
  function enterWreck(nowWall) {
    wrecked = true;
    wreckAtWall = nowWall;
    if (crashCam) {
      crashCam.noteCrash('wreck');
    }
    setCrashflip(false);
    turtleRecover = false;
    if (view.mode === 'freestyle') {
      trickDetector.reset();
      scoreCrash();
    }
    race.voidLap(str('main.wrecked_lap_over'), nowWall);
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
  }

  /* The pack is in: the receiver, the controller and the servos work. */
  function wreckPowered() {
    return isPowered(crashFlags);
  }

  function liveWreck(flags) {
    return isWreck(flags, airframeById(runAirframe).fixedWing) && isPowered(flags);
  }

  /*
   * WHEN A WRECK IS DOWN, for the reset prompt: its pack has gone, or it
   * has lain inside the perch's own speed and rate for WRECK_REST_MS, or
   * WRECK_PROMPT_MS have passed since it became one. Until then it may
   * still be gliding, tumbling or flown, and a banner across the middle of
   * the picture is in the way. The last is for a quad on three props with
   * airmode on, which thrashes on the grass and never lies still, as a real
   * one does until its pilot disarms, and still needs to be told how to
   * get back. Only the prompt reads this; the sticks never do.
   */
  const WRECK_REST_MS = 1500;
  const WRECK_PROMPT_MS = 5000;
  function wreckDown(nowWall) {
    return wrecked && (!wreckPowered()
      || (wreckStillSince >= 0 && nowWall - wreckStillSince >= WRECK_REST_MS)
      || nowWall - wreckAtWall >= WRECK_PROMPT_MS);
  }

  /* Whether the pilot should be looking from the chase camera: the FPV
   * feed has been dead long enough to see it die, or it is breaking up on
   * a wreck that will not fly again. */
  function wreckWantsChase(nowWall) {
    if (!runDamage || (mode !== 'flight' && mode !== 'paused')) {
      return false;
    }
    const dead = fpvFail.deadSince();
    if (dead >= 0 && nowWall - dead >= FEED_BEAT_MS) {
      return true;
    }
    return wrecked && (crashFlags & DAMAGE_FLAGS.antennaLost) !== 0
      && nowWall - wreckAtWall >= FEED_BEAT_MS;
  }

  /* The camera's knock as a rotation in the craft's frame, or false. */
  function cameraKnock(out) {
    if (!lastParts || cameraPart < 0) {
      return false;
    }
    const o = cameraPart * PART_STATE_DOUBLES;
    if (lastParts[o + STATE.status] !== 0) {
      return false;
    }
    const rx = lastParts[o + STATE.deform];
    const ry = lastParts[o + STATE.deform + 1];
    const rz = lastParts[o + STATE.deform + 2];
    const a = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (!(a > 1e-4)) {
      return false;
    }
    /* Body frame to the craft's local Three.js frame, as frame.js does. */
    knockAxis.set(-ry / a, rz / a, -rx / a);
    out.setFromAxisAngle(knockAxis, a);
    return true;
  }

  /* After the camera chain: what the pilot's picture is. */
  function crashFrameLate(nowWall) {
    if (camOverride && crashCamShowsCraft) {
      shell.quad.visible = true;
    }
    wreckRig.setCraftVisible(shell.quad.visible);
    /* An ops mission's forward feed breaking up (src/share/ops/feed.js):
     * the snow is on whatever picture the pilot flies by, FPV or ball. */
    const feed = opsFeedSnow();
    fpvFail.signal(feed);
    fpvFail.update(nowWall, ((runDamage && fpvLensLive) || feed > 0) && !camOverride && !warIntro);
  }
  function opsFeedSnow() {
    const m = roomOps.room() ? roomOps.mission() : null;
    if (!m || !m.feed) {
      return 0;
    }
    threePosToDoc(pCurr.x, pCurr.y, pCurr.z, feedDoc);
    return feedSnow(m, roomOps.view(), roomOps.seat(), [feedDoc.x, feedDoc.y]);
  }
  const feedDoc = { x: 0, y: 0, z: 0 };

  function crashSummary() {
    const names = Object.keys(DAMAGE_FLAGS).filter((k) => (crashFlags & DAMAGE_FLAGS[k]) !== 0);
    return {
      available: damage.available,
      mode: damage.mode(),
      runDamage,
      flags: crashFlags,
      flagNames: names,
      condition: conditionOf(crashFlags, airframeById(runAirframe).fixedWing),
      wrecked,
      powered: wreckPowered(),
      down: wreckDown(performance.now()),
      /* The plant's clock, seconds, for a check that must wait on steps
       * rather than on the wall: under load a frame carries at most 100 ms
       * of sim time, however long it took. */
      simT: stateCurr ? stateCurr[0] : 0,
      /* Steps whose state was not a state (plantFault), since the page
       * loaded. A check counts on this staying 0. */
      plantFaults,
      /* Whether the shell is holding the quad's motors at zero, and what
       * Betaflight made of the sticks, deg/s roll, pitch, yaw: whether the
       * sticks reach the controller, which a tumbling wreck's motor speeds
       * cannot show, because its mixer is saturated. */
      motorsHeld: turtleParkMotors,
      setpoint: airframeById(runAirframe).fixedWing || typeof sim.e.sim_bf_debug !== 'function' ? null
        : [sim.e.sim_bf_debug(5), sim.e.sim_bf_debug(8), sim.e.sim_bf_debug(0)],
      rpm: stateCurr ? [stateCurr[14], stateCurr[15], stateCurr[16], stateCurr[17]] : null,
      surfaces: airframeById(runAirframe).fixedWing && wingSurfPtr ? Array.from(new Float64Array(sim.e.memory.buffer, wingSurfPtr, 4)) : null,
      freeBodies: damage.freeBodies(),
      events: crashEvents,
      pieces: wreckRig.summary(),
      debris: debris.active(),
      trees: crashTreesDeclared,
      wires: crashWiresDeclared,
      treesOnMap: crashTrees.length,
      /* The streamed set's generation the crash world was declared from,
       * which follows the map's own (window.__colliders().streamGen). */
      streamGen: crashTreesGen,
      solids: crashSolidsDeclared,
      feed: fpvFail.level(performance.now()),
      chase: wreckWantsChase(performance.now()),
      parts: partTable.map((p) => p.kindName),
      /* The same parts named with their side, "wing right". */
      partLabels: partTable.map((p) => partLabel(p.kind, p.cg[0], p.cg[1])),
    };
  }

  /*
   * resetCraft parks the craft on the spawn at rest and forgets what the
   * last stretch of flight left behind. It never touches the lap clock
   * (simTimeMs): a recovery in place keeps the run, and only reset() begins
   * a new one. `at` ({ x, y, z, yaw }) moves the spawn first, for a
   * recovery or a map that moved under the craft. `keepSticks` is a swap in
   * the air (seatSwap): the pilot goes on flying the new aircraft on the
   * sticks already held, so they are not dropped to zero under it.
   */
  function resetCraft(at, keepSticks = false) {
    if (at) {
      seatSpawnAt(at);
    }
    restartPlant();
    clearCrashHold();
    forgetContacts();
    parkAtSpawn();
    rearmSticks(keepSticks);
    breakTrails(Boolean(at));
    statePrev = readState();
    stateCurr = statePrev;
  }

  function seatSpawnAt(at) {
    startX = at.x;
    startZ = at.z;
    startYaw = at.yaw;
    startPitch = 0;
    startY = spawnHeight(at.x, at.z, at.y);
    qSpawn.setFromAxisAngle(AXIS_Y, at.yaw);
    qSpawnInv.copy(qSpawn).invert();
  }

  /*
   * THE AIR, docs/WEATHER-CONTRACT.md: null is calm. The plant's wind
   * outlives sim_reset, so a run after a windy one sets still air once (the
   * launch stand steps in it; the first flight step sets the new air); a
   * run after a calm one makes no call at all, which keeps every calm
   * flight's call stream (recorded flights, contact:golden) as it was.
   * In a room the room's air (its welcome, set by the host) on the room's
   * clock, so every pilot meets a front where the others do; the clock is
   * read once per run, which keeps the run's own steps a function of its
   * own clock (docs/WEATHER-CONTRACT.md). Solo, the
   * pilot's setting with one fixed seed, so a solo flight meets the same
   * air every time (window.__weather can name another seed).
   */
  let soloSeed = 1;
  let weather = null;
  let windSet = false;
  const airPos = new THREE.Vector3();
  const airOut = { x: 0, z: 0, gust: 0, up: 0 };
  const airSim = { x: 0, y: 0, z: 0 };
  function setWind(vx, vy, gust, up) {
    const code = sim.e.sim_set_wind(vx, vy, gust);
    if (code !== SIM_OK) {
      throw new Error(`sim_set_wind refused ${vx} ${vy} ${gust}: ${simErrorName(code)}`);
    }
    const codeUp = sim.e.sim_set_air_vertical(up);
    if (codeUp !== SIM_OK) {
      throw new Error(`sim_set_air_vertical refused ${up}: ${simErrorName(codeUp)}`);
    }
  }
  let weatherT0 = 0;
  let weatherFlown = null;
  function seatWeather() {
    const welcome = roomLinkState.state().welcome;
    offerRoomWeather(ui.settings);
    /* Free flight only: a race map's records, a war and a mission are
     * flown in still air, the same for everyone who ever flew them. */
    const free = view.mode === 'freestyle' && !roomWar.on() && !roomOps.on();
    const pick = !free ? null : (welcome ? welcome.weather : { preset: ui.settings.weather, seed: soloSeed });
    /* A room's air is from the network, and may name what this build does
     * not know (a newer server) or a world without weather: still air. */
    const known = pick && WEATHER_PRESETS.includes(pick.preset) && Object.hasOwn(WEATHER_MAPS, view.id);
    weather = known ? makeWeather(view.id, pick.preset, pick.seed) : null;
    /* null until the room's clock has synced: the run's own clock then. */
    const roomMs = welcome ? roomLinkState.roomNow() : null;
    weatherT0 = Number.isFinite(roomMs) ? roomMs / 1000 : 0;
    weatherFlown = weather ? { map: view.id, preset: pick.preset, seed: pick.seed } : null;
    if (windSet) {
      setWind(0, 0, 0, 0);
      windSet = false;
    }
  }
  /* Before a step: the air at the craft, on the plant's own clock. */
  function pushWeather(st) {
    poseFromState(st, airPos);
    weather.at(airPos.x, airPos.y, airPos.z, weatherT0 + st[0], airOut);
    worldDirToSim(airOut.x, 0, airOut.z, airSim);
    setWind(airSim.x, airSim.y, airOut.gust, airOut.up);
    windSet = true;
  }
  /* The air this run flies, { map, preset, seed }, or null for calm. */
  window.__weatherFlown = () => weatherFlown;
  window.__weather = (preset, seed) => {
    makeWeather(view.id, preset, seed);
    ui.settings.weather = preset;
    soloSeed = seed >>> 0;
    return true;
  };
  /* A host's setting is the room's air: told to the room when they differ,
   * which every pilot's next run then flies. */
  function offerRoomWeather(s) {
    const w = roomLinkState.state().welcome;
    if (roomHost(w) && w.weather && w.weather.preset !== s.weather) {
      roomLinkState.sendWeather(s.weather);
    }
  }

  /* The plant's calls here are in the order recorded flights and
   * contact:golden start from, so they stay in it. */
  function restartPlant() {
    const af = airframeById(runAirframe);
    /* A warhead that arrived since the payload was seated (the room's
     * loadout echo) is seated now, between runs, before the reset puts the
     * moved CG at rest. */
    if (af.combat && JSON.stringify(combatSeated(runAirframe)) !== combatSeatKey) {
      applyCombat(af);
    }
    /* A sortie that flew is accrued and the next one seated on its own
     * pack; a flight that left career or war for a casual one goes back
     * to fresh blocks. */
    const wasSortie = sortie !== null;
    if (endSortie() || (wasSortie && !realismNow()) || (!wasSortie && realismNow())) {
      applyPower(ui.settings);
      applyTuning(ui.settings);
      applyParts(ui.settings);
    }
    sim.reset();
    plantStarts += 1;
    /* Setting the damage mode clears the crash state, so a war or room
     * change waits for a reset to apply it. */
    const damageChanged = damage.available && crashDamageWanted(ui.settings) !== runDamage;
    if (warCrashDue || damageChanged) {
      warCrashDue = false;
      applyCrashMode(ui.settings);
    }
    sim.setCellVoltage(runVoltage);
    declareWater();
    seatWeather();
    crashReset();
    /* sim_reset put the module's step counter back to zero; queued stick
     * samples and the leftover step time belong to the old count, and the
     * RC grid must follow the module's clock or samples land in its future. */
    acc = 0;
    rcPending.length = 0;
    adoptSimClock();
  }

  /* Out of the turtle and the crashflip. The plant is told twice on a
   * reset, which the recorded call order carries. */
  function dropTurtle() {
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
  }

  function clearCrashHold() {
    crashed = false;
    clipCrashUntil = 0;
    clipCrashKind = '';
    clipGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    resetClipWatch(clipWatch);
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    dropTurtle();
    poseLock = false;
    airHoldMs = 0;
    airGoUntil = 0;
  }

  /* What the last contact and hit judged. Kept, a craft resting on the
   * start line reports the arrival speed of the crash that sent it there. */
  function forgetContacts() {
    obsHasPrev = false;
    obsContact = false;
    obsTouched = false;
    obsClosing = 0;
    obsLeftover = false;
    obsInterior = 0;
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';
    obsPhase = 0;
    lastImpulse = 0;
    impactKick.x = 0;
    impactKick.y = 0;
    impactKick.z = 0;
    lastDescent = 0;
    lastTiltDeg = 0;
    lastClosing = 0;
    lastUpDot = 0;
    lastHitKind = 'none';
    lastHitIndex = -1;
    groundCueAtWall = -1e9;
    bounceCount = 0;
    bounceAtWall = 0;
    groundBounceAtWall = 0;
    releasePress();
    raceHasPrev = false;
    groundHasPrev = false;
  }

  function parkAtSpawn() {
    landed = true;
    takingOff = false;
    takeoffUntil = 0;
    launchStaging = false;
    input.forcePadRest = false;
    lcPrevState = 0;
    lcGoUntil = 0;
    lcBoost = false;
    lcAcroUntil = 0;
    if (lcArmed && ui.settings.launchControl) {
      applyLaunchSwitch(true);
    }
    /* Parked again, so the takeoff hint is due again. */
    flownThisRun = false;
    /* The terrain under the spawn was asked once, for startY; asking again
     * is how two answers for one point drift apart. */
    groundY = startY;
  }

  function rearmSticks(keepSticks) {
    input.drain();
    if (keepSticks) {
      return;
    }
    input.keys.clear();
    input.resetKeyboardSticks();
    /* A pad whose throttle rests at half has to show it low before the
     * craft may leave the ground (input.holdThrottleLow). */
    input.holdThrottleLow(TAKEOFF_RELEASE);
  }

  /* The craft jumped, so the segment across the jump is not a flight path.
   * The race interpolates gate crossings from prevSimMs and the ghost from
   * its last pose; a moved spawn is also a cut in the ghost recording, so
   * its replay sees one impossible segment rather than a glide. */
  function breakTrails(moved) {
    race.prevSimMs = null;
    if (moved) {
      ghostRecorder.cutHere();
    }
    ghostPrev.valid = false;
  }

  /*
   * The glitch catch (clip-through, thrash, plant fault): the craft is held
   * where it is, frozen, for CLIP_CRASH_HOLD_MS so the pilot can read
   * Crashed, then finishClipCrash puts it back in the air nearby.
   */
  function beginClipCrash(kind, nowWall) {
    if (crashed) {
      return;
    }
    crashed = true;
    clipCrashKind = kind;
    clipCrashUntil = nowWall + CLIP_CRASH_HOLD_MS;
    /* A bail: the open combo is lost and the streak goes back to one. The
     * detector's buffer goes too, or half a roll before the crash would
     * pair with half a roll after it. Race maps never reach the scorer. */
    if (view.mode === 'freestyle') {
      trickDetector.reset();
      scoreCrash();
    }
    dropTurtle();
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    acc = 0;
    race.recover('Crashed', nowWall);
    flightStats.noteCrash();
    if (crashCam) {
      crashCam.noteCrash('clip');
    }
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* Inside the takeoff window this is a launch stand's leftover overlap,
     * not a crash, and the cue is the loudest sound in the mix. */
    if (typeof audio.event === 'function' && nowWall >= takeoffUntil) {
      audio.event('crash');
    }
  }

  /*
   * A plant state that is not finite, or spins past anything a rigid body
   * here reaches (SIM_RATE_MAX in src/native/sim_internal.h), is a plant
   * bug that everything downstream would believe: the trick detector once
   * named a runaway tumble as hundreds of thousands of rolls and hung the
   * page. The frame loop judges each state with plantStateSound and hands
   * a bad one to plantFault: counted (window.__crash().plantFaults), said on
   * the console, and the craft wrecked where it was last sound. Only a
   * plant reset clears a non-finite value out of its parts, so the reset
   * comes first and the sound pose is put back on top of it.
   */
  const PLANT_RATE_MAX = 1.0e4;
  let plantFaults = 0;

  function plantStateSound(st) {
    if (!st.every(Number.isFinite)) {
      return false;
    }
    const spinSq = st[11] * st[11] + st[12] * st[12] + st[13] * st[13];
    return spinSq <= PLANT_RATE_MAX * PLANT_RATE_MAX;
  }

  function plantFault(bad, sound, nowWall) {
    plantFaults += 1;
    /* Plant frame position, velocity, attitude and rates as they came back. */
    const got = Array.from(bad.subarray(1, 14)).join(' ');
    console.error(`plant fault ${plantFaults} after t ${sound[0]} s, wrecked where it last was sound: ${got}`);
    resetCraft(null);
    holdPlantAt([sound[1], sound[2], sound[3], sound[7], sound[8], sound[9], sound[10]], 'plantFault');
    beginClipCrash('plant', nowWall);
  }

  /* Seats the plant at `pose` (position, then quaternion w x y z, plant
   * frame) at rest, or leaves it where it is when pose is null, and takes
   * the craft as airborne from there. */
  function holdPlantAt(pose, caller) {
    if (pose) {
      const code = sim.e.sim_set_pose(...pose);
      if (code !== SIM_OK) {
        throw new Error(`sim_set_pose in ${caller}: ${simErrorName(code)}`);
      }
      sim.rest();
    }
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    landed = false;
    flownThisRun = true;
  }

  /*
   * The recovery in place. A glitch is our bug, not the pilot's, so it must
   * not cost the run (owner: "register this state and just reset the quad
   * in place"): the craft goes to the nearest clear air, upright on its own
   * heading, and the race, its clock and its laps carry on.
   *
   * Clear air is the whole job: put back inside what it was stuck in, the
   * craft trips the same catch next frame and the pilot is in a loop. The
   * tries go out in rings, nearest first, and up before sideways within a
   * ring, since up is where a craft came from. A spot is clear above the
   * surface by more than the rest height and free of colliders at a level
   * attitude.
   */
  const RECOVER_TRIES = (() => {
    const rises = [0.6, 1.2, 2.0, 3.0, 4.5];
    const compass = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    const tries = [];
    for (const ring of [0, 1.0, 2.0, 3.5]) {
      const heads = ring === 0 ? [[0, 0]] : compass;
      for (const up of rises) {
        for (const [dx, dz] of heads) {
          tries.push([dx * ring, up, dz * ring]);
        }
      }
    }
    return tries;
  })();

  function clearAirAt(x, y, z) {
    const surface = view.height(x, z, y - SURFACE_BIAS);
    if (!(y - surface > REST_HEIGHT)) {
      return false;
    }
    if (!view.colliders) {
      return true;
    }
    const hit = view.colliders.hit(x, y, z, x, y, z, craftVerticalHalf(0), 0, 0, 0, 1, craftVerticalOffset());
    return hit < 0;
  }

  function findClearAir(from, out) {
    for (const [dx, up, dz] of RECOVER_TRIES) {
      if (clearAirAt(from.x + dx, from.y + up, from.z + dz)) {
        out.set(from.x + dx, from.y + up, from.z + dz);
        return true;
      }
    }
    return false;
  }

  function finishClipCrash() {
    if (!findClearAir(pCurr, pProbe)) {
      /* Nothing clear within reach: the craft is somewhere it cannot be put
       * back, so the pilot gets the start line instead. */
      reset();
      return;
    }
    /* Facing north after a wall grabbed an arm is its own disorientation;
     * the pilot was flying somewhere. */
    const spot = { x: pProbe.x, y: pProbe.y, z: pProbe.z, yaw: craftHeadingYaw() };
    resetCraft(spot);
    /* resetCraft parks the craft SPAWN_ALT above the surface under the
     * spot, which may be a storey below the air that was checked, or
     * inside whatever the craft was stuck in. The plant owes the rest. */
    const lift = (spot.y - startY) - SPAWN_ALT;
    holdPlantAt(lift > 0 ? [0, 0, lift, 1, 0, 0, 0] : null, 'finishClipCrash');
    simClockPrevMs = simTimeMs;
    /* The terrain query and the collider sweep are different tests, so the
     * catch gets a grace to settle in rather than firing again at once. */
    recoverGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    if (typeof audio.event === 'function') {
      audio.event('takeoff');
    }
  }

  /* The yaw the pilot was looking along: the rendered nose flattened onto
   * the ground plane, or the spawn's when the nose points straight up or
   * down or nothing has been read yet. */
  function craftHeadingYaw() {
    if (!stateCurr) {
      return startYaw;
    }
    const nose = upAxis.set(0, 0, -1).applyQuaternion(qPrev);
    const level = Math.abs(nose.x) >= 1e-6 || Math.abs(nose.z) >= 1e-6;
    return level ? Math.atan2(-nose.x, -nose.z) : startYaw;
  }

  /* The frame loop's first unreported fault (see the frame boundary).
   * Declared here, ahead of reset(), which clears it: the pilot pressing R
   * took the fault banner's offer, so the next fault is reported anew. */
  let frameFault = null;

  /* R: a new run from the map's own spawn. */
  function reset() {
    frameFault = null;
    /* The pack a run flies on is fixed at its start, or a pack changed from
     * the pause menu would compare a lap against another pack's record. */
    runVoltage = ui.settings.packVoltage;
    adoptSpawn();
    /* The lap clock goes back here, and with it every stamp taken on it,
     * or a stale stamp keeps a fresh run inside an expired cooldown. */
    simTimeMs = 0;
    trickTouchAtSimMs = -1e9;
    resetCraft(null);
    race.reset();
    /* Scored or free flight is re-read every run: the pilot switches it on
     * the Freestyle screen between runs. The detector restarts with the
     * clock so the two agree on when a trick happened. */
    score.timed = scoredRun();
    score.reset();
    trickDetector.restart();
    ui.resetScore();
    /* Only the recording in flight dies; the session book keeps its laps. */
    ghostRecorder.abort();
    ghostGap = null;
    ghostChased = null;
    ghostRig.setPresence(0);
    runLaps = ui.settings.laps;
    progressKey = '';
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* A run whose spawn is in the air starts flying, except under the
     * title, where the craft is only parked behind a menu. */
    const sp = runSpawn();
    if (sp && sp.air && mode !== 'title') {
      airStart(sp.air.y);
    }
    /* Whatever the last run left full screen (I), a run starts on the
     * pilot's own picture. */
    sensors.setMainView('eo');
  }

  /*
   * PROGRESSION (src/game/progress.js through ui.progress). What the run is
   * flown on, for the challenges: the plane, its power's kind and whether
   * it is on its smallest pack or tank. A new run, a swap or a refit is a
   * new key, and the judge starts over on it.
   */
  function progressRun() {
    const af = airframeById(runAirframe);
    const { option, pack } = powerChoice(af.id, ui.settings.power);
    const opt = af.fixedWing ? powerOption(af.id, option) : null;
    const packs = opt ? opt.packs : [];
    const size = (p) => p.cc ?? p.mAh;
    const smallest = packs.length > 1 && pack === packs.reduce((a, b) => (size(a) <= size(b) ? a : b)).id;
    return { airframe: af.id, fixedWing: Boolean(af.fixedWing), power: opt ? opt.kind : null, smallestPack: smallest, key: `${af.id}:${option}:${pack}` };
  }
  function progressTick(power) {
    const ctx = progressRun();
    if (ctx.key !== progressKey) {
      progressKey = ctx.key;
      ui.progress.startRun(ctx);
    }
    ui.progress.tick({ simMs: simTimeMs, crashed, grounded: onSurface(), power, battery: fpvOsd.batt, heading: headingOf(stateCurr),
      agl: shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, Infinity), pos: shell.quad.position,
    });
  }
  /* The track a lap closed on: a built track (seated, or the casual sky
   * track's test flight), or the world's own. A built track is keyed by
   * its id alone, so saving an edit is not a new track's first lap. */
  function progressCourse() {
    const seated = seatedMapTrack();
    const id = build && build.testing ? build.docId : (seated && seated.document ? seated.document.id : null);
    return { key: id ? `track:${id}` : ghostCourseKey(), kind: courseKind(id, ui.settings.progress) };
  }

  /*
   * AN AIR START, for a spawn that names a height: the in-sim builder's test
   * flight through a start gate hung in the air (src/builder/course.js
   * startFor). The craft is put at that height over the spawn point,
   * level on the spawn's heading, a quad at rest and a fixed wing at its
   * air start speed along its nose (configs/airframes.js airStartSpeed), and
   * held there for AIR_START_MS of the flight screen while the banner
   * counts down, so the pilot has the sticks before it flies.
   */
  const AIR_START_MS = 3000;
  const AIR_GO_MS = 700;
  function airStart(y) {
    worldPosToSim(startX, y, startZ, pSim);
    if (sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, 1, 0, 0, 0) !== SIM_OK) {
      throw new Error(`air start at ${y} refused`);
    }
    sim.rest();
    const af = airframeById(runAirframe);
    if (af.fixedWing && sim.e.sim_wing_launch(airStartSpeed(af)) !== SIM_OK) {
      throw new Error(`air start: ${af.id} refused its launch`);
    }
    landed = false;
    takingOff = false;
    flownThisRun = true;
    poseLock = true;
    airHoldMs = AIR_START_MS;
    /* Already flying when the countdown lets go: nothing to hold. */
    input.releaseThrottleHold();
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
  }

  /* The countdown, on the flight screen's own time: a pause holds it. */
  function tickAirStart(dt, nowWall) {
    if (!(airHoldMs > 0) || mode !== 'flight' || ui.screen !== 'flight') {
      return;
    }
    airHoldMs -= dt;
    if (airHoldMs > 0) {
      return;
    }
    airHoldMs = 0;
    poseLock = false;
    adoptSimClock();
    acc = 0;
    airGoUntil = nowWall + AIR_GO_MS;
  }

  /*
   * THE HOT SWAP: another aircraft, now, where this one is.
   *
   * Everything else about the airframe waits for the next run (applySettings'
   * between runs block), and for a reason that still holds for a lap: a lap
   * flown on two aircraft is not a lap on either. The owner asked to change
   * aircraft whenever they want, so this pays that cost where it belongs
   * instead of refusing: a lap it lands in is voided (race.voidLap, the rule
   * a weight change already follows), and nothing else about the run stops.
   *
   * THE RULES, in the order a pilot meets them:
   *   - Same place, same heading. The new aircraft is level on the old one's
   *     heading at its position, the spawn frame moved there the way a crash
   *     recovery moves it (finishClipCrash), so the physics state is a fresh
   *     one, set up the same way every time.
   *   - In the air if the old one was. A fixed wing is let go along its nose
   *     at the old speed or at its air start speed, 1.3 times its stall
   *     (configs/airframes.js airStartSpeed, the builder's own rule), which
   *     ever is faster. A quad keeps the old velocity, level, and flies.
   *   - On the ground if the old one was, parked on its own gear, skids or
   *     floats at that spot. Floats on land, or anything else on water,
   *     cannot be parked there, so it starts SWAP_AIR_ABOVE over the spot
   *     instead, by the air rule above.
   *   - A fresh, intact aircraft: whatever the old one had broken, turned
   *     over or dropped stays with it.
   *   - The new aircraft's own tune, the one it was last flown on or its
   *     default (seatAirframe), its pack, its camera and its sound.
   *   - The world is never rebuilt under a run (worldHold), and the track on
   *     it is raced only by an aircraft of its class (swapCourseFits): one
   *     that does not fit flies the world without it and is told, the rule
   *     #93 made for a plane seated on a map track.
   */
  const SWAP_AIR_ABOVE = 3;
  const swapAt = new THREE.Vector3();
  const swapVel = new THREE.Vector3();
  const swapVelAfter = new THREE.Vector3();
  const swapVelSim = { x: 0, y: 0, z: 0 };
  /* Tune files, fetched once each: the second swap to an aircraft is
   * synchronous from here on. */
  const swapTunes = new Map();
  let swapBusy = false;
  let lastSwap = null;
  /*
   * THE WORLD A RUN THAT HAS CHANGED AIRCRAFT KEEPS. The seats are one per
   * track class (src/share/session.js), so the moment the aircraft moves
   * class, every read of "the seated track" answers for the new one and the
   * world no longer matches the settings: the next applySettings, a volume
   * nudge on the pause menu, would rebuild the world and drop the pilot on
   * the title. So the world is held while the run lasts, as long as the map
   * and the graphics setting are the ones it was built for, and let go on
   * the title (releaseWorldHold), where the world follows the seat again as
   * it does for a choice made there. `track` is the map track seated on it
   * when the hold began, and `courseOff` whether that track is off the
   * world because the aircraft flying does not fit it.
   */
  let worldHold = null;

  async function swapTuneText(id) {
    if (id === 'custom') {
      const text = readFcDump();
      if (text == null) {
        throw new Error('the saved flight controller edits are gone');
      }
      return text;
    }
    if (!swapTunes.has(id)) {
      swapTunes.set(id, new TextDecoder().decode(await fetchBytes(tunePath(id))));
    }
    return swapTunes.get(id);
  }

  function swapLive() {
    return mapReady && !swapInFlight && Boolean(stateCurr) && (mode === 'flight' || mode === 'paused');
  }

  /* Resolves true when the aircraft changed, false when there was nothing
   * to do (the same one, no run up, a swap already under way), and rejects
   * on a fault, which is loud by design: a half swapped aircraft is not a
   * state to fly on quietly. */
  /* `refit` swaps the aircraft for itself: the hangar's new motor or pack
   * put in the air where it is, by every rule a swap keeps. */
  /* `at` { pos, vel, yaw, flying } seats the new aircraft there instead
   * of where this one is: a platform hold's hand over (PLATFORM HOLDS). */
  async function hotSwap(id, { refit = false, at = null } = {}) {
    const to = airframeById(id);
    if (swapBusy || to.id !== id || (to.id === runAirframe) !== refit || !swapLive()) {
      return false;
    }
    swapBusy = true;
    try {
      const next = seatAirframe({ ...ui.settings }, to.id);
      const text = await swapTuneText(next.tune);
      if (!swapLive() || (to.id === runAirframe) !== refit) {
        return false;
      }
      seatSwap(to, next, text, at);
      await seatSwapCourse(to);
      return true;
    } finally {
      swapBusy = false;
    }
  }

  /*
   * WHETHER THE AIRCRAFT IS DOWN, which is more than `landed`. The shell
   * parks only a craft that has stopped: a plane rolling on its wheels and
   * a float plane riding the water are handed to the plant and are not
   * `landed`, and a swap there is a swap on the ground, not in the air.
   * Read before the swap touches the plant: these are the last step's.
   */
  function onSurface() {
    if (landed || sim.e.sim_ground_contacts() > 0 || wheelsLoaded()) {
      return true;
    }
    if (!airframeById(runAirframe).floats || typeof sim.e.sim_float_state !== 'function') {
      return false;
    }
    if (!floatStatePtr) {
      floatStatePtr = sim.e.malloc(10 * 8);
    }
    sim.e.sim_float_state(floatStatePtr);
    const f = new Float64Array(sim.e.memory.buffer, floatStatePtr, 10);
    return f[4] + f[5] > 0 || f[6] > 0;
  }

  function seatSwap(to, next, text, at = null) {
    /* Where the old one is, read before anything moves it, or where the
     * caller seats the new one. */
    const st = readState();
    poseFromState(st, swapAt);
    simPosToThree(st[4], st[5], st[6], swapVel).applyQuaternion(qSpawn);
    let yaw = craftHeadingYaw();
    let wasFlying = !onSurface();
    if (at) {
      swapAt.copy(at.pos);
      swapVel.copy(at.vel);
      yaw = at.yaw;
      wasFlying = at.flying;
    }
    const from = runAirframe;
    const quadBefore = shell.quad;
    const midLap = race.currentLapMs(simTimeMs) != null;
    const onWater = Boolean(waterAt(swapAt.x, swapAt.z));
    const inAir = wasFlying || Boolean(to.floats) !== onWater;
    const s = ui.settings;
    if (!worldHold) {
      const track = seatedMapTrack();
      worldHold = {
        map: s.map,
        graphics: normalizeGraphics(s.graphics),
        track,
        courseOff: Boolean(track) && !(build && build.racing),
      };
    }

    /* The seat, then the plant: the mode first, then the config, which
     * sim_init re-reads for that plant and which zeroes the dynamic state
     * the reseat below writes afresh. */
    Object.assign(s, next);
    s.airframeAsked = true;
    ui.persistSettings();
    runAirframe = to.id;
    runSimId = seatedSimId(to.id);
    if (sim.e.sim_set_airframe(runSimId) !== SIM_OK) {
      throw new Error(`sim_set_airframe refused ${to.id} (${runSimId})`);
    }
    bumpConfigGen();
    const nextPids = pidsDiffFor(s.pids, s.tune);
    const nextText = composeConfig(text, s.rates, RATES_KEEP, nextPids);
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      throw new Error(`sim_init refused ${s.tune} on ${to.id}: ${configFault(code)}`);
    }
    configId = tuneById(s.tune).id;
    menuTune = s.tune;
    tuneText = text;
    pidsText = nextPids;
    ratesText = ratesDiff(s.rates);
    configText = nextText;
    configName = configId === 'custom' ? str('main.your_edits') : `${configId}.diff`;
    runVoltage = s.packVoltage;
    runGravityScale = gravityScaleFor(runWeight, to.id);
    if (sim.e.sim_set_gravity(runGravityScale) !== SIM_OK) {
      throw new Error(`sim_set_gravity refused ${runGravityScale} on ${to.id}`);
    }

    /* The shell's copies of the machine, the same calls a choice between
     * runs makes: its size, hull, parts, model, ghost, voice and camera. */
    syncCraftScale();
    flapNotch = 0;
    wingStabApplied = -1;
    applyCrashMode(s);
    applyPower(s);
    applyTuning(s);
    applyParts(s);
    publishPids();
    launcherLeft = null;
    chaseValid = false;
    introMs = -1;
    if (view.mode === 'freestyle') {
      trickDetector.reset();
    }
    seatRestHeight(to, !inAir && onWater);

    if (midLap) {
      race.voidLap(str('carousel.lap_void'), performance.now());
    }

    /* The craft, parked at the spot on its heading, which is also a fresh
     * physics state and a fresh crash state. */
    resetCraft({ x: swapAt.x, z: swapAt.z, y: swapAt.y, yaw }, inAir);
    if (inAir) {
      const floor = startY + SPAWN_ALT;
      const y = wasFlying ? Math.max(swapAt.y, floor + 0.3) : floor + SWAP_AIR_ABOVE;
      if (sim.e.sim_set_pose(0, 0, y - floor, 1, 0, 0, 0) !== SIM_OK) {
        throw new Error(`sim_set_pose refused the swap at ${y.toFixed(2)} m`);
      }
      if (to.fixedWing) {
        const speed = Math.min(60, Math.max(swapVel.length(), airStartSpeed(to)));
        if (sim.e.sim_wing_launch(speed) !== SIM_OK) {
          throw new Error(`${to.id} refused its launch at ${speed.toFixed(1)} m/s`);
        }
      } else if (wasFlying) {
        worldDirToSim(swapVel.x, swapVel.y, swapVel.z, swapVelSim);
        const k = Math.min(1, 150 / Math.max(1e-9, swapVel.length()));
        if (sim.e.sim_set_velocity(swapVelSim.x * k, swapVelSim.y * k, swapVelSim.z * k, 0, 0, 0) !== SIM_OK) {
          throw new Error('sim_set_velocity refused the swap');
        }
      }
      landed = false;
      takingOff = false;
      flownThisRun = true;
      obsHasPrev = false;
      raceHasPrev = false;
      simClockPrevMs = simTimeMs;
      adoptSimClock();
      stateCurr = readState();
      statePrev = stateCurr;
    }
    notice = { text: str('main.flying', { name: to.name }), untilMs: performance.now() + 2400 };
    /* What the swap did, as numbers, for scripts/hotswap-check.js. */
    poseFromState(stateCurr, pProbe);
    simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], swapVelAfter).applyQuaternion(qSpawn);
    lastSwap = {
      from,
      to: to.id,
      module: sim.e.sim_airframe(),
      shown: drawnCraft,
      modelSwapped: shell.quad !== quadBefore,
      rule: !inAir ? 'ground' : wasFlying ? 'air' : 'air-forced',
      onWater,
      voided: midLap,
      tune: configId,
      /* The power system the swap seated, and the pack's cells. */
      power: readPower(),
      cells: runCells,
      before: { x: swapAt.x, y: swapAt.y, z: swapAt.z, yaw, vx: swapVel.x, vy: swapVel.y, vz: swapVel.z },
      after: {
        x: pProbe.x,
        y: pProbe.y,
        z: pProbe.z,
        yaw: startYaw,
        ground: startY,
        rest: SPAWN_ALT,
        landed,
        vx: swapVelAfter.x,
        vy: swapVelAfter.y,
        vz: swapVelAfter.z,
        crashed,
        wrecked,
        crashflip: crashflipOn,
        damage: typeof sim.e.sim_damage_flags === 'function' ? sim.e.sim_damage_flags() : 0,
      },
    };
    /* The lens and the tilt the new aircraft carries, and the record key;
     * everything else it would do is already done, so it does nothing more
     * (the tune, rates and PIDs texts match, the world is held). */
    applySettings(s);
  }

  /*
   * WHO MAY RACE THE TRACK A SWAP LANDS ON: every quad, and every plane that
   * fits its gates (src/game/verify.js planesFor), as #93 made it. The
   * builder's own test flight is the builder's to judge, and a world with
   * nothing seated has nothing to fit.
   */
  function swapCourseFits(af) {
    if (build && build.testing) {
      return true;
    }
    const track = worldHold && worldHold.track;
    if (!track) {
      return true;
    }
    return !af.fixedWing || planesFor(track.document).includes(af.id);
  }

  /* Take the track off the world, or put it back, when the aircraft now
   * flying changed whether it fits. A track that stays is left alone, so
   * the run's laps stay with it; its seat follows the aircraft so a lap
   * goes to that aircraft's board. */
  async function seatSwapCourse(to) {
    if (build && build.testing) {
      return;
    }
    const fits = swapCourseFits(to);
    const track = worldHold.track;
    if (!track) {
      return;
    }
    if (fits) {
      writeShareImport(track);
    }
    if (fits === !worldHold.courseOff) {
      return;
    }
    worldHold.courseOff = !fits;
    /* The builder puts the track's gates on the view, or takes them off it;
     * the race is made from the view, as adoptLoadedView makes it. */
    await seatMapCourse();
    race = new Race(view.gates, 'full', raceOpts(view.recordSuffix ?? ''));
    if (!fits) {
      notice = {
        text: str('main.the_craft_does_not_fit_through_every_gate', { craft: to.short }),
        untilMs: performance.now() + 4000,
      };
    }
    race.setRecordKey(recordKey());
    paintBest();
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    ui.setShare(view.share || null);
    ghostCourseChanged();
  }

  /* The run is over: the world follows the seat again. */
  function releaseWorldHold() {
    worldHold = null;
    if (!worldMatchesSettings()) {
      syncWorld();
    }
  }

  /*
   * A world swap has two flags because it has two questions. mapReady: may
   * the frame loop touch the world this frame? The loop never stops during
   * a swap (that would drop the accumulator), it skips. swapInFlight: is a
   * swap already running? One flag for both left the shell refusing every
   * later map after a load that failed. The old world goes before the new
   * one is built, so two worlds' render targets never coexist against
   * P5's 120 MB budget.
   */
  let mapReady = true;
  let swapInFlight = false;
  let finishLoadingOnFrame = true;

  /* A race's options for the aircraft seated: a plane's course is scored
   * with a reach round every gate (src/game/race.js PLANE_REACH), a quad's
   * threaded. */
  function raceOpts(recordSuffix) {
    return { recordSuffix, reach: airframeById(runAirframe).fixedWing ? PLANE_REACH : 0 };
  }

  /*
   * The world in `view` has just been built and becomes the one flown. With
   * keepPlace it is the same world and course rebuilt for a new look, so
   * the run carries on, paused, where it stood. Otherwise everything tied to
   * the old world starts again on this one, from the title.
   */
  function adoptLoadedView(keepPlace, stayMode, stayScreen) {
    prewarm([...FX_ROOTS, shell.quad]);
    attractCam = makeAttractCamera(view);
    if (keepPlace) {
      /* The new gate meshes need the current next-gate highlight. */
      view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
      ui.setShare(view.share || null);
      paintBest();
      mode = stayMode === 'flight' ? 'paused' : stayMode;
      /* Only if the pilot is still on it: a war lobby builds its mission's
       * world while the pilot waits (warTimeFrame), about 5 s, and one who
       * left the room and opened Make a room meanwhile was thrown back to
       * the room screen, with no room. */
      if (stayScreen && ui.screen === stayScreen) {
        ui.show(stayScreen);
      }
    } else {
      /* A world adopted fresh is the seat's, whatever a swap held before,
       * and a map track's records are its own (seatMapCourse). */
      worldHold = null;
      race = new Race(view.gates, 'full', raceOpts(view.recordSuffix ?? ''));
      race.setRecordKey(recordKey());
      paintBest();
      adoptSpawn();
      ui.setShare(view.share || null);
      reset();
      ghostCourseChanged();
      mode = 'title';
      /* Back to the room screen only if the pilot is still on it: one who
       * left for the title while the world loaded stays there. */
      ui.show(stayScreen === 'friends' && ui.screen === 'friends' ? 'friends' : 'title');
      ui.applyLocationHash();
      showCourseNotes();
    }
    finishLoadingOnFrame = true;
    /* Scanning every collider for what is worth flying round is a once per
     * world job, never a once per run one. */
    rebuildObstacles();
    mapReady = true;
  }

  /* A world is one id and many tracks: one world, and a track that is
   * either seated on it or not, so the world's key alone cannot say which. */
  function wantedCourseKey(mapId) {
    const seated = seatedMapTrack();
    if (!seated || seated.document.map !== mapId) {
      return '';
    }
    /* A plane that does not fit the course's gates has the world without
     * the course, and a key that says so, so choosing a plane that does
     * fit seats it again. */
    return seatedFits(seated) ? seatedCourseKey() : `${seatedCourseKey()}#nofit`;
  }

  /*
   * WHO MAY RACE A TRACK: every quad, and every fixed wing that fits every
   * gate by the builder's own rule (src/game/verify.js planesFor). The
   * seated aircraft, not the one the last run was flown on, because this
   * decides what the next run is.
   */
  function seatedFits(seated) {
    const af = airframeById(ui.settings.airframe);
    return !af.fixedWing || planesFor(seated.document).includes(af.id);
  }

  function loadedCourseKey(map) {
    return (map && map.courseKey) || '';
  }

  /* The builder module, fetched if it is not yet, for a map track to be
   * seated before the world is shown. Null on a world it cannot build in. */
  async function ensureBuild() {
    loadBuild();
    if (buildLoading) {
      await buildLoading;
    }
    return build;
  }

  /*
   * Seat the pilot's track on the world just built, or take one off it, so
   * that the view's course is the one wantedCourseKey asks for. The builder
   * builds the gates, makes them solid and swaps them in as the view's
   * course (buildmode.js race); the view is stamped here with the course
   * key, the listing the menus read (none for one of the pilot's own, which
   * is on no board), and the record suffix that keeps this track's best laps
   * its own.
   */
  async function seatMapCourse() {
    if (build && build.racing) {
      build.exit(false);
    }
    delete view.courseKey;
    view.share = null;
    view.recordSuffix = '';
    const seated = seatedMapTrack();
    if (!seated || seated.document.map !== view.id) {
      return;
    }
    if (!seatedFits(seated)) {
      view.courseKey = wantedCourseKey(view.id);
      notice = {
        text: str('main.the_craft_does_not_fit_through_every_gate', { craft: airframeById(ui.settings.airframe).short }),
        untilMs: performance.now() + 4000,
      };
      return;
    }
    const b = await ensureBuild();
    const course = b ? b.race(seated.document) : null;
    if (!course) {
      notice = { text: str('main.that_track_has_no_gate_to_race'), untilMs: performance.now() + 3600 };
      return;
    }
    view.courseKey = seatedCourseKey();
    view.share = seated.local
      ? null
      : { id: seated.id, name: seated.name || seated.document.name, author: seated.author, board: seated.board };
    view.recordSuffix = `.map.${seated.document.id}`;
  }

  /* Whether the standing world is the one the settings name: its id, its
   * graphics level, the course seated on it and the time it was built at. */
  function worldMatchesSettings() {
    const quality = normalizeGraphics(ui.settings.graphics);
    /* A run that has changed aircraft keeps its world: see worldHold. */
    if (worldHold && view && ui.settings.map === worldHold.map && quality === worldHold.graphics) {
      return true;
    }
    if (!view) {
      return false;
    }
    const id = worldId();
    return id === view.id
      && quality === view.graphics
      && wantedCourseKey(id) === loadedCourseKey(view)
      && worldTime === timeOf(worldTimeOptions());
  }

  /*
   * Build the world the settings name, when it is not the one standing. The
   * swap under way is handed back to a second caller rather than refused,
   * so a caller that acts once the world is right (Play, the builder) can
   * wait on it: a refused call used to resolve at once with the old world
   * still up.
   */
  let worldSync = null;
  /* The time the standing world was built at, and what a build asks for
   * now: the mission's while a war with one is on (warTime). */
  let worldTime = timeOf({});
  function worldTimeOptions() {
    return warTime ? { time: warTime } : {};
  }
  function syncWorld() {
    if (!worldSync) {
      worldSync = syncWorldNow().finally(() => {
        worldSync = null;
      });
    }
    return worldSync;
  }

  /* Builds world `id` at `quality` into `view`. The caller has disposed the
   * old one first, so two worlds' render targets never stand at once. */
  async function loadWorldInto(id, quality, timeOptions) {
    applyPixelRatio(shell, quality, renderScaleOf(ui.settings));
    view = await loadMap(shell, id, loading, { quality, renderScale: renderScaleOf(ui.settings), ...timeOptions });
  }

  async function syncWorldNow() {
    /* Resolved, not raw: worldId turns the Track seat into a world and an
     * unknown id (a stale bookmark's ?map=, which boot.js takes verbatim)
     * into the seat's, so the tail check below cannot chase a mismatch
     * that never clears. */
    const wantId = worldId();
    const wantQ = normalizeGraphics(ui.settings.graphics);
    if (swapInFlight || (mapReady && worldMatchesSettings())) {
      return;
    }
    /*
     * THE SAME WORLD, ANOTHER COURSE. A map track seated or taken off a
     * world already built is a set of gates, not a world: swiss2 takes most
     * of a minute to build and a course a few milliseconds, so the world
     * stays and only the course and the run change. Anything else is a swap.
     */
    if (mapReady && wantId === view.id && wantQ === view.graphics && worldTime === timeOf(worldTimeOptions())) {
      swapInFlight = true;
      mapReady = false;
      try {
        await seatMapCourse();
        adoptLoadedView(false, 'title', null);
      } finally {
        mapReady = true;
        swapInFlight = false;
      }
      if (!worldMatchesSettings()) {
        await syncWorldNow();
      }
      return;
    }
    /* Only the graphics level moved: the same world and course, rebuilt. */
    const keepPlace = mapReady && wantId === view.id && wantedCourseKey(wantId) === loadedCourseKey(view);
    /*
     * The screens a swap hands back to the pilot when it is done, rather
     * than the title: every page a settings change can be made from. 'rates'
     * is one because each arrow on it runs applySettings, which swaps the
     * world whenever it no longer matches. 'friends' because a card seats
     * its own world on the room screen (ui.js, the card's world wins), and
     * the swap should end back there (adoptLoadedView).
     */
    const stayScreens = ['pilot', 'quad', 'launch', 'rates', 'paused', 'title', 'credits', 'friends'];
    const stayScreen = stayScreens.includes(ui.screen) ? ui.screen : null;
    const stayMode = keepPlace ? mode : 'title';
    swapInFlight = true;
    mapReady = false;
    if (!keepPlace) {
      mode = 'title';
      /* The room screen stays up under the loading bar when the swap comes
       * back to it: the title shown for a moment put its rows under a
       * press still going on (a card's mouse up landed on the title's). */
      ui.show(stayScreen === 'friends' ? 'friends' : 'title');
    }
    const entry = mapById(wantId);
    loading.run(planStages(['module', 'world', 'frame'], entry.buildMs));
    /* Disposing and building both hold the main thread, so the loading
     * screen is given a frame to be composited first. */
    await yieldToPaint();
    const before = { id: view.id, graphics: view.graphics };
    if (build) {
      build.exit(false);
    }
    try {
      view.dispose();
    } catch (e) {
      /* Nothing to dispose: the last swap never produced a world. */
    }
    /* A new world starts native: its cost is not the old one's. */
    dynres.reset();
    try {
      await loadWorldInto(wantId, wantQ, worldTimeOptions());
      worldTime = timeOf(worldTimeOptions());
      await seatMapCourse();
      loading.start('frame');
      adoptLoadedView(keepPlace, stayMode, stayScreen);
    } catch (e) {
      /* The old world is gone already, so it is built again, and the
       * settings put back to it, rather than leaving no world at all. The
       * title's own world is not the pilot's seat and never written there. */
      console.error(e);
      if (!titleWorld) {
        ui.settings.map = before.id;
      }
      ui.settings.graphics = before.graphics;
      try {
        await loadWorldInto(before.id, before.graphics, {});
        worldTime = timeOf({});
        loading.start('frame');
        adoptLoadedView(keepPlace, stayMode, stayScreen);
        notice = { text: str('main.could_not_be_loaded', { name: entry.name }), untilMs: performance.now() + 4200 };
      } catch (e2) {
        console.error(e2);
        loading.fail(str('ui.could_not_be_loaded', { name: entry.name, v2: e.message ?? e }));
      }
    } finally {
      swapInFlight = false;
    }
    /* A change made while the swap ran was turned away at the top, and ui.js
     * has saved it, so the settings and the world would stay apart. */
    if (mapReady && !worldMatchesSettings()) {
      await syncWorldNow();
    }
  }

  async function swapMap(id) {
    ui.settings.map = id;
    return syncWorld();
  }

  /*
   * Angle mode is a Betaflight flight mode flag sent to the module as it
   * stands; changing it neither re-inits the module nor resets the craft.
   * angleModeOn mirrors what the module was last told.
   *
   * Launch control: the Settings row only offers the feature, and the L key
   * arms it (lcArmed). While the module reports it holding, the craft sits
   * on the stand (launchStaging); lcAcroUntil keeps the flight mode in acro
   * through the hold and briefly after the release, and lcGoUntil is when
   * the GO banner after a release ends. lcBoost marks a launch in progress
   * and lcPrevState is the module's state on the last frame.
   */
  let angleModeOn = false;
  let lcArmed = false;
  let launchStaging = false;
  let lcBoost = false;
  let lcAcroUntil = 0;
  let lcPrevState = 0;
  let lcGoUntil = 0;

  function wantAngleMode() {
    /* The turtle and its recovery own the mixer. */
    if (crashflipOn || turtleRecover) {
      return false;
    }
    /* A launch is flown in acro, through the hold and just past it. */
    if (lcAcroUntil === Infinity || (lcAcroUntil > 0 && performance.now() < lcAcroUntil)) {
      return false;
    }
    /*
     * A proportional input (the thumb sticks, the mouse, a radio, or the
     * harness's window.__stick, which writes a gimbal's channels) flies the
     * mode the pilot chose. So does anything in freestyle, keys included:
     * angle holds the craft to about thirty degrees of bank, which puts
     * every trick in the catalogue out of reach, and freestyle exists for
     * them whether or not the scorer is on.
     *
     * Keys on a race force angle: a key is all or nothing, and acro on one
     * cannot hold a line.
     */
    const proportional = input.isTouchPrimary() || input.isMousePrimary() || Boolean(input.harnessChannels);
    if (proportional || (view && view.mode === 'freestyle')) {
      return ui.settings.flightMode === 'angle';
    }
    return input.isKeyboardPrimary() || ui.settings.flightMode === 'angle';
  }

  /* The nose's angle below the horizon in degrees, from a state's body
   * quaternion (w, x, y, z at 7 to 10): the body x axis in world terms,
   * against its length in the y, z plane. */
  function pitchNoseDownDeg(st) {
    const [w, x, y, z] = [st[7], st[8], st[9], st[10]];
    const forwardZ = 2 * (x * z - w * y);
    const sideZ = 2 * (y * z + w * x);
    const upZ = 1 - 2 * (x * x + y * y);
    return Math.atan2(-forwardZ, Math.sqrt(sideZ * sideZ + upZ * upZ)) * (180 / Math.PI);
  }

  /* The module's launch control state: 0 idle, 1 and 2 holding, 3
   * released. An older dist/sim.wasm has no launch control and is idle. */
  function lcState() {
    return typeof sim.launchControlState === 'function' ? sim.launchControlState() : 0;
  }

  function applyLaunchSwitch(on) {
    lcArmed = Boolean(on);
    if (typeof sim.setLaunchControl === 'function') {
      sim.setLaunchControl(lcArmed);
    }
  }

  function disableLaunchStand() {
    sim.e.sim_set_launch_stand(0, 0, 0, 0, 1, 0, 0, 0);
  }

  /* The stand holds a hinge at the rear arms every step, seeded with the
   * ramp pitch the parked overlay was drawing; on a level seed a 28 degree
   * block dropped the craft flat and the sticks walked it off the rails. */
  function enableLaunchStand() {
    const st = readState();
    const half = startPitch * 0.5;
    const code = sim.e.sim_set_launch_stand(1, st[1], st[2], st[3], Math.cos(half), 0, Math.sin(half), 0);
    if (code === SIM_OK) {
      stateCurr = readState();
      statePrev = stateCurr;
    }
  }

  /* Onto the stand, from a landed craft that is the right way up. */
  function beginLaunchStaging() {
    const upright = !stateCurr || plantUpZ(stateCurr) >= 0;
    if (mode !== 'flight' || !landed || !upright) {
      return;
    }
    landed = false;
    takingOff = true;
    takeoffUntil = performance.now() + TAKEOFF_WINDOW_MS;
    launchStaging = true;
    adoptSimClock();
    input.forcePadRest = true;
    enableLaunchStand();
  }

  /* Off the stand. With `park`, in flight, the craft is set down landed
   * where it is, as if the launch had never been staged. */
  function endLaunchStaging(park) {
    launchStaging = false;
    input.forcePadRest = false;
    lcBoost = false;
    disableLaunchStand();
    if (!park || mode !== 'flight') {
      return;
    }
    sim.rest();
    landed = true;
    takingOff = false;
    stateCurr = readState();
    statePrev = stateCurr;
    acc = 0;
  }

  /* The module released a held launch: the stand goes and the craft flies,
   * in acro for the first moment, with GO on the banner. */
  function releaseLaunch(nowMs) {
    launchStaging = false;
    input.forcePadRest = false;
    disableLaunchStand();
    lcBoost = true;
    takingOff = true;
    takeoffUntil = nowMs + TAKEOFF_WINDOW_MS;
    flownThisRun = true;
    racePrev.copy(shell.quad.position);
    raceHasPrev = true;
    lcGoUntil = nowMs + 900;
    lcAcroUntil = nowMs + 480;
    if (typeof audio.event === 'function') {
      audio.event('takeoff');
    }
  }

  /* Once a frame: follows the module's launch control state, and drops an
   * armed switch whose Settings row was turned off. Returns the state. */
  function syncLaunchControl(nowMs) {
    if (lcArmed && !ui.settings.launchControl) {
      applyLaunchSwitch(false);
      if (launchStaging) {
        endLaunchStaging(true);
      }
      lcAcroUntil = 0;
    }
    const st = lcState();
    const holding = (s) => s === 1 || s === 2;
    if (holding(st)) {
      lcAcroUntil = Infinity;
      const turtled = turtleWait || turtleFlip.active || turtleRecover;
      if (landed && mode === 'flight' && !turtled) {
        beginLaunchStaging();
      }
    } else if (st === 3) {
      if (holding(lcPrevState)) {
        releaseLaunch(nowMs);
      }
    } else {
      if (launchStaging) {
        endLaunchStaging(true);
      }
      if (lcAcroUntil === Infinity) {
        lcAcroUntil = 0;
      }
    }
    lcPrevState = st;
    return st;
  }

  /* Tells the module the flight mode when it changes, and keeps the craft
   * card's caption on the mode being flown. */
  function syncAngleMode() {
    const want = wantAngleMode();
    if (want !== angleModeOn) {
      angleModeOn = want;
      sim.setAngleMode(want);
    }
    if (!ui.setCraftCaption || (showcase && showcase.failed)) {
      return;
    }
    ui.setCraftCaption(str(want ? 'main.angle_sticks_are_tilt_hands_off' : 'ui.acro_sticks_are_rates_hands_off'));
  }

  /* The Render scale setting as a multiplier of native resolution. */
  function renderScaleOf(s) {
    return (Number(s.renderScale) || 100) / 100;
  }

  /*
   * After the plant changes airframe, everything the shell keeps about the
   * old one follows: the collision dimensions (src/game/collide.js exports
   * them as live bindings), the parts, the cell count, the parked height
   * (which places the ground plane, the spawn and the landed test; see
   * SPAWN_ALT), the drawn model, the ghost's model, the motor voice and the
   * camera mount. Between runs only: a hull swapped mid flight would move
   * under a contact being resolved.
   */
  function syncCraftScale() {
    const craft = airframeById(runAirframe);
    setCraftAirframe(craft.dims);
    seatCraftParts();
    runCells = craft.cells;
    seatRestHeight(craft, startsAfloat());
    dressCraft();
    swapGhostRig();
    /* An airframe with an engine of its own names its voice; a motor is
     * the fixed wings' or the quads'. */
    setFlownVoice(craft.voice ?? (craft.fixedWing ? 'wing' : 'quad'));
    [camMountFwd, camMountUp] = WING_MOUNTS[runAirframe] ?? [CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP];
  }

  /*
   * Draw the Skyhunter on the title and the seated aircraft everywhere
   * else. Only the model: the plant, the hull, the tune and the settings
   * stay the pilot's, so leaving the title swaps the drawing and nothing
   * else. Run once per frame, before anything poses the model, because the
   * mode changes in a dozen places and a missed one would fly a run in the
   * title's aircraft. It swaps only when the mode crosses the title, which
   * is between runs, the rule every craft swap keeps.
   */
  function dressCraft() {
    const want = mode === 'title' ? TITLE_CRAFT : runAirframe;
    /* A combat quad is rebuilt when what hangs on it changes, too: its
     * payload is a model, not a material (configs/combat.js combatFor).
     * The seated aircraft's changes when the plant's does, at applyCombat,
     * which is between runs. */
    const combat = !airframeById(want).combat ? null
      : want === runAirframe ? combatSeatKey : JSON.stringify(combatSeated(want));
    if ((want === drawnCraft && combat === drawnCombat) || typeof shell.swapCraft !== 'function') {
      return;
    }
    shell.swapCraft(want);
    prewarm([shell.quad]);
    drawnCraft = want;
    drawnCombat = combat;
  }

  /*
   * The settings, applied. Called on every change ui.js makes and at boot,
   * so each part below compares and only acts on what moved. The order is
   * load-bearing where the module is concerned: the run's plant first
   * (voltage, style, airframe and what hangs on it), then gravity, the
   * record key, the world, the tune, the rates and the PIDs, and the module
   * receives exactly that sequence.
   */
  function applySettings(s) {
    applyControlSettings(s);
    applyCameraSettings(s);
    applyDisplaySettings(s);
    if (mode === 'title') {
      applyRunSettings(s);
    }
    applyAirSettings(s);
    offerRoomWeather(s);
    race.setRecordKey(recordKey());
    paintBest();
    if (!worldMatchesSettings()) {
      syncWorld();
    }
    /* Only a move of the Tune row swaps the tune. Comparing with the loaded
     * tune instead would throw away a dropped diff, which is no registry
     * tune, on the next unrelated change such as the volume. */
    if (s.tune !== menuTune) {
      menuTune = s.tune;
      configLoadWait = swapTune(s.tune).catch((e) => {
        console.error(e);
      });
    }
    applyRatesSettings(s);
    applyPidSettings(s);
    applyDeviceSettings(s);
    syncAngleMode();
  }

  /* The stick mode first, since every stick drawn after it reads it (both
   * calls do nothing when it has not moved), then the mouse. */
  function applyControlSettings(s) {
    input.setStickMode(s.stickMode);
    if (ui.setStickMode) {
      ui.setStickMode(s.stickMode);
    }
    input.setMouseConfig({
      enabled: s.mouseFlight,
      sens: s.mouseSens,
      expo: s.mouseExpo,
      invert: s.mouseInvert,
      centre: s.mouseCentre,
    });
  }

  /* The FPV camera's uptilt (clamped, and the clamp written back) and its
   * vertical field of view, a lens choice on a real quad. */
  function applyCameraSettings(s) {
    camTilt = clampCameraAngle(s.cameraAngle);
    s.cameraAngle = camTilt;
    qTilt.setFromAxisAngle(AXIS_X, cameraTiltRad(camTilt));
    if (shell.camera.fov !== s.cameraFov) {
      shell.camera.fov = s.cameraFov;
      shell.camera.updateProjectionMatrix();
    }
  }

  /* Render scale, the dynamic resolution mode and the perf overlay. A size
   * change takes the same guarded resize path a window resize does, so the
   * composer and every prepass target follow; no world is rebuilt. */
  function applyDisplaySettings(s) {
    const userScale = renderScaleOf(s);
    if (dynres.setMode(s.perfMode, Number(s.fpsCap) || 0, gpuInfo.software)) {
      resizeDirty = true;
    }
    perfOverlay.setOn(s.perfOverlay);
    dynres.setWatch(s.perfOverlay);
    const wantPr = pixelRatioFor(s.graphics, userScale, null, dynres.state.scale);
    const post = view && view.post && view.post.userScale != null ? view.post : null;
    const scaleMoved = Boolean(post) && post.userScale !== userScale;
    if (post) {
      post.userScale = userScale;
    }
    /* An export surface re-applies the settings' size when it goes. */
    if (exportShot || (shell.pixelRatio === wantPr && !scaleMoved)) {
      return;
    }
    if (shell.pixelRatio !== wantPr) {
      applyPixelRatio(shell, s.graphics, userScale, null, dynres.state.scale);
    }
    const size = shell.resize();
    if (view && view.post && mapReady) {
      view.post.setSize(size.w, size.h);
    }
  }

  /*
   * What a run is flown on, taken only between runs so that a record is
   * measured on one machine from its start: the pack voltage, the flight
   * style, the airframe (the whole plant: mass, inertia, motors, rotors,
   * pack and hull) or a Loadout propulsion, then crash damage, power,
   * tuning and parts, each after the airframe it belongs to. Exports an
   * older dist/sim.wasm lacks are skipped, and that build flies what it has.
   */
  function applyRunSettings(s) {
    runVoltage = s.packVoltage;
    sim.setCellVoltage(runVoltage);
    runStyle = s.flightStyle === 'arcade' ? 'arcade' : 'expert';
    if (typeof sim.e.sim_set_flight_style === 'function') {
      sim.e.sim_set_flight_style(runStyle === 'arcade' ? 1 : 0);
    }
    const craft = airframeById(s.airframe).id;
    const plant = seatedSimId(craft);
    if (craft !== runAirframe || plant !== runSimId) {
      runAirframe = craft;
      runSimId = plant;
      if (typeof sim.e.sim_set_airframe === 'function') {
        sim.e.sim_set_airframe(runSimId);
      }
      /* The craft is session lived and the world is not, so its derived
       * state follows here rather than in a world rebuild. */
      syncCraftScale();
      /* The plant raised the old airframe's flaps with it. */
      flapNotch = 0;
    }
    applyCrashMode(s);
    applyPower(s);
    applyTuning(s);
    applyParts(s);
  }

  /*
   * Weight, the one physics setting that applies mid run: it has a control
   * on the flight screen so the pilot can feel it arrive. A lap it lands in
   * was flown on two aircraft and is voided, paused or not, since the
   * slider stays reachable under the pause panel; at the title there is no
   * lap to void. What reaches the module is the gravity multiple, which
   * follows the airframe's base as well as the slider. On a module without
   * the export, or one that refuses it, the slider goes back to the weight
   * actually flown, so no record is filed under an air never flown.
   */
  function applyAirSettings(s) {
    const weight = clampWeight(s.weight);
    const scale = gravityScaleFor(weight, runAirframe);
    if (scale === runGravityScale) {
      runWeight = weight;
      return;
    }
    const taken = typeof sim.e.sim_set_gravity === 'function' && sim.e.sim_set_gravity(scale) === SIM_OK;
    if (!taken) {
      ui.settings.weight = runWeight;
      ui.paintAir();
      return;
    }
    const midLap = race.currentLapMs(simTimeMs) != null;
    runWeight = weight;
    runGravityScale = scale;
    if (midLap) {
      race.voidLap(str('main.weight_changed_lap_voided'), performance.now());
    }
  }

  /*
   * Rates are part of the config text, so a change re-inits the module,
   * but without resetting the run: rates are the pilot's stick feel, which
   * is tuned against a corner mid run, not the machine. The craft is put
   * back where it stood (reseatAfterConfigSwap), and the record key moves
   * with the text, so the lap is kept and filed honestly.
   *
   * The new text is composed into a local and adopted only if the module
   * takes it. A refused sim_init has already reset the parameter groups and
   * applied part of the text, so the recovery re-inits the text that last
   * worked.
   */
  function applyRatesSettings(s) {
    const nextRates = ratesDiff(s.rates);
    if (nextRates === ratesText) {
      return;
    }
    const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, pidsText);
    /* Read before the init that zeroes the state. */
    const before = readState();
    const taken = sim.init(nextText) === SIM_OK;
    if (taken) {
      ratesText = nextRates;
      configText = nextText;
      race.setRecordKey(recordKey());
      paintBest();
    }
    if (taken || sim.init(configText) === SIM_OK) {
      reseatAfterConfigSwap(before);
    }
    publishPids();
  }

  /*
   * The PID adjustment for the tune that is flying (configs/pids.js), also
   * part of the config text, but a change to the machine, so it resets the
   * run. An adjustment stored for another tune moves nothing until that
   * tune flies; while a swap is in flight configId is still the old tune,
   * and swapTune takes the new tune's block itself.
   */
  function applyPidSettings(s) {
    const nextPids = pidsDiffFor(s.pids, configId);
    if (nextPids === pidsText) {
      return;
    }
    const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, nextPids);
    const taken = sim.init(nextText) === SIM_OK;
    if (taken) {
      pidsText = nextPids;
      configText = nextText;
    }
    if (taken || sim.init(configText) === SIM_OK) {
      adoptSimClock();
      sim.setCellVoltage(runVoltage);
      if (taken) {
        race.setRecordKey(recordKey());
        paintBest();
      }
      reset();
    }
    publishPids();
  }

  /* The radio link, the flight recorder, sound and the mix. setPreset and
   * setEnabled act only on a real change, so an unrelated setting re-applies
   * nothing here. */
  function applyDeviceSettings(s) {
    if (rcLink.id !== s.link) {
      rcLink.setPreset(s.link);
      rcLink.reset(rcNextMs);
    }
    if (flightLog.on !== s.flightLog) {
      flightLog.setEnabled(s.flightLog);
    }
    audio.setLevel(s.volume / 10);
    audio.setEnabled(s.sound);
    applyMix(s);
  }

  /* A one-off line on the flight banner for `ms` of wall clock. */
  function flashNotice(text, ms) {
    notice = { text, untilMs: performance.now() + ms };
  }

  /*
   * The text of a tune, or null after telling the pilot why there is none:
   * the custom tune is the pilot's saved dump (a second tab can have
   * cleared it since the row was drawn), every other tune is fetched. A
   * fetch that a newer swap has overtaken fails silently, since the pilot
   * has already moved on.
   */
  async function readTuneText(entry, gen) {
    if (entry.id === 'custom') {
      const dump = readFcDump();
      if (dump == null) {
        ui.settings.tune = configId;
        flashNotice(str('main.no_saved_flight_controller_edits_to'), 3200);
      }
      return dump;
    }
    try {
      return new TextDecoder().decode(await fetchBytes(tunePath(entry.id)));
    } catch (e) {
      if (isLiveConfigLoad(gen)) {
        ui.settings.tune = configId;
        flashNotice(str('main.could_not_be_loaded', { name: entry.name }), 3200);
        console.error(e);
      }
      return null;
    }
  }

  /*
   * Fly another tune: the same path a dropped file takes, the diff composed
   * with the pilot's rates and this tune's own PID sliders (another tune's
   * sliders would be the wrong numbers), handed to sim_init, and the run
   * reset on it. Whatever goes wrong, the menu goes back to the tune that
   * is still flying and the pilot is told.
   */
  async function swapTune(id) {
    const entry = tuneById(id);
    /* The generation moves even for the tune already flying, which is what
     * cancels a slower fetch of some other tune picked in between. */
    const gen = bumpConfigGen();
    if (entry.id === configId) {
      return;
    }
    const text = await readTuneText(entry, gen);
    if (text == null || !isLiveConfigLoad(gen)) {
      return;
    }
    const pids = pidsDiffFor(ui.settings.pids, entry.id);
    const composed = composeConfig(text, ui.settings.rates, RATES_KEEP, pids);
    const code = sim.init(composed);
    if (code !== SIM_OK) {
      /* The module is left on the refused text, so the old one goes back
       * in before anything else reads it. */
      ui.settings.tune = configId;
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      flashNotice(str('main.could_not_be_read', { name: entry.name, configFault: configFault(code) }), 3600);
      return;
    }
    configId = entry.id;
    configName = entry.id === 'custom' ? str('main.your_edits') : `${entry.id}.diff`;
    tuneText = text;
    configText = composed;
    pidsText = pids;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    paintBest();
    publishPids();
    /* In a war the tune follows the aircraft the war seated, which it
     * says itself (war.craft_switched): "Flying Acro" over its countdown
     * named a choice nobody made. */
    if (!inWarRoom()) {
      flashNotice(str('main.flying', { name: entry.name }), 2400);
    }
    reset();
  }

  /*
   * Why a run of this flight cannot go on a public board, or null. Both are
   * a different machine: arcade is another flight model, and weight off
   * stock is another aircraft, so a time on either is not comparable with
   * the stock rows beside it.
   */
  function boardTimeRefusal() {
    if (runStyle === 'arcade') {
      return str('main.arcade_laps_stay_off_the_public');
    }
    if (runWeight !== WEIGHT_STOCK) {
      return str('main.laps_flown_at_percent_weight_stay', { runWeight });
    }
    return null;
  }

  /* The pilot's board name, asked for once when it has never been given. */
  async function boardName(detailKey) {
    return readPilotName() || ui.askName({ title: str('ui.your_name'), detail: str(detailKey) });
  }

  /* The lap to post on this track: the run's best by race's own reckoning,
   * else a time kept from an earlier visit to the same track on the same
   * craft, else null. */
  function lapToPost(trackId, craft) {
    const flown = race.bestLapMs();
    if (flown != null) {
      return flown;
    }
    const kept = readPendingTime();
    const sameSeat = kept && kept.trackId === trackId && (kept.craft || '') === craft;
    return sameSeat ? kept.lapMs : null;
  }

  /*
   * Post the run's best lap on the seated board track, with this session's
   * recording of it when there is one (a time kept from an earlier visit
   * goes up bare). A plane's lap on a map track goes to the plane board.
   */
  async function submitBoardTime() {
    const refused = boardTimeRefusal();
    if (refused) {
      flashNotice(refused, 3600);
      return;
    }
    const listing = inspectCourse();
    const seatId = listing && listing.shareId;
    if (!seatId || !listing.canPostTime) {
      const why = listing && listing.layoutDrift ? 'main.update_this_track_on_the_board' : 'main.this_track_is_not_on_the';
      flashNotice(str(why), 2800);
      return;
    }
    const craft = lapCraft();
    const lapMs = lapToPost(seatId, craft);
    if (lapMs == null) {
      flashNotice(str('main.no_clean_lap_to_upload'), 2800);
      return;
    }
    const name = await boardName('main.a_time_on_the_public_board');
    if (!name) {
      return;
    }
    const ghost = ghostForUpload(lapMs);
    /* Where the post goes. It can move once, below. */
    const target = { id: seatId, board: listing.board };
    /* The signature covers the track id, so each attempt signs its own. */
    const send = async () => {
      const lap = { trackId: target.id, lapMs: Math.round(lapMs), ghost, craft };
      const auth = await identity.signTime(lap);
      return postTime({ ...lap, name, key: auth.key, sig: auth.sig, origin: target.board });
    };
    let healed = '';
    try {
      let posted;
      try {
        posted = await send();
      } catch (e) {
        /*
         * A 404 means the board took this track down and may have put it
         * back under a new id (scripts/boardpresets.js --replace, an admin
         * removal), leaving this seat on an id it has never heard of. Find
         * the copy with the same layout, move the seat to it so every later
         * screen and lap uses the live id, and post there once. Anything
         * else is the board's own answer, and is not retried: a retried
         * upload is how a board gets the same lap twice.
         */
        if (!(e && e.status === 404 && listing.doc)) {
          throw e;
        }
        const twin = await findBoardTwin({ doc: listing.doc, name: listing.name, trackClass: 'full', origin: listing.board });
        if (!twin.found) {
          throw new Error(twin.sameName
            ? str('main.the_board_s_copy_of_is', { name: twin.sameName.name })
            : str('main.that_track_is_no_longer_on'));
        }
        const live = twin.found;
        writeShareImport(live);
        ui.setShare({ id: live.id, name: live.name, author: live.author, board: live.board });
        target.id = live.id;
        target.board = live.board;
        healed = str('main.the_board_had_republished_this_track');
        posted = await send();
      }
      writePostedBest(lapSlot(target.id, craft), lapMs);
      /* A kept time is cleared under the id it was flown on and, after a
       * move, under the live one, or it would be offered again forever. */
      clearPendingTime(seatId);
      if (target.id !== seatId) {
        clearPendingTime(target.id);
      }
      /* formatTime, as the row that started the upload spells it, so the
       * confirmation reads as the same number. */
      flashNotice(str('main.uploaded', {
        name,
        formatTime: formatTime(lapMs),
        rank: posted.rank != null ? str('ui.rank', { rank: posted.rank }) : '',
        withGhost: ghost ? str('main.ghost_attached_ready_to_be_chased') : '',
        healed,
      }), 3600);
      ui.markTimePosted(posted);
    } catch (e) {
      flashNotice(str('main.could_not_upload_that_time', { v1: e.message ?? e }), 3600);
    }
  }

  /*
   * A results screen over a flight that has ended: the freestyle horn's,
   * through the harness hook as well as the clock so both take the same
   * path, and a room match's end.
   */
  function endFreestyleRun() {
    leaveFlightForResults();
    ui.showFreestyleResults(score.summary());
  }

  /* Puts the flight down. A craft left parked upside down (waiting for the
   * turtle, or mid flip) is set on its wheels first, or the next run would
   * start with its motors still parked. */
  function leaveFlightForResults() {
    endSortie();
    mode = 'results';
    if (isTurtleParked()) {
      if (!turtleFlip.active) {
        beginTurtleFlip();
      }
      finishTurtleFlip();
    }
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
  }

  /*
   * Why a finished freestyle run cannot be posted, or null. Unlike a lap,
   * an arcade run CAN be posted: the freestyle board names the model on
   * every row and lets a reader filter by it. Weight off stock cannot,
   * because the board has no column for it and such a row would look like
   * a stock one.
   */
  function freestyleRefusal(summary) {
    if (summary.timed === false) {
      /* Free flight has no clock, so any total could be beaten by staying
       * out longer. */
      return { text: str('main.free_flight_has_no_clock_so'), ms: 4200 };
    }
    if (!summary.tricks || !(summary.total > 0)) {
      return { text: str('main.a_run_with_no_tricks_in'), ms: 2800 };
    }
    if (summary.assisted) {
      /* A trick landed through the harness is not a flown run. */
      return { text: str('main.that_run_used_the_harness_hooks'), ms: 3200 };
    }
    if (runWeight !== WEIGHT_STOCK) {
      return { text: str('main.runs_flown_at_percent_weight_stay', { runWeight }), ms: 4200 };
    }
    return null;
  }

  async function submitFreestyleRun() {
    const summary = score.summary();
    const refused = freestyleRefusal(summary);
    if (refused) {
      flashNotice(refused.text, refused.ms);
      return;
    }
    const name = await boardName('main.a_run_on_the_public_board');
    if (!name) {
      return;
    }
    try {
      const style = runStyle === 'arcade' ? 'arcade' : 'expert';
      const posted = await postFreestyleRun({ name, map: view.id, style, summary });
      /* The board keeps each pilot's best run only, and answers a worse one
       * with improved false: say that the old score stands, not "posted". */
      if (posted.improved === false) {
        flashNotice(str('main.your_still_stands_only_your_best', { formatScore: formatScore(posted.score) }), 3600);
      } else {
        const rank = posted.rank != null ? str('ui.rank', { rank: posted.rank }) : '';
        flashNotice(str('main.posted', { name, formatScore: formatScore(summary.total), v3: rank }), 3600);
      }
      ui.markRunPosted(posted);
    } catch (e) {
      flashNotice(str('main.could_not_post_that_run', { v1: e.message ?? e }), 3600);
    }
  }

  /*
   * P in the in-sim builder: put the track being built on the public board.
   *
   * The dialog asks for the track's name and the pilot's board name; then
   * publishCurrentCourse, the edit key and the bind, so a track published
   * here is owned by this browser and republishing it updates the listing. The board reads it as the
   * schemaVersion 4 document the builder writes, naming its world.
   *
   * Returns { doc, text }: the track as published, which is a new id when
   * the board already held this one from another browser, and the line the
   * builder shows, because the flight's own notice is hidden while building.
   */
  /* The builder's best test lap, on the layout it was flown on: the gold
   * time the course is published with (src/game/medals.js). */
  let builderBest = null;
  function noteBuilderLap(ms) {
    const doc = build.doc;
    if (!doc || !Number.isFinite(ms)) {
      return;
    }
    const layout = layoutFingerprint(doc);
    const wing = Boolean(airframeById(runAirframe).fixedWing);
    if (!builderBest || builderBest.docId !== doc.id || builderBest.layout !== layout || builderBest.wing !== wing || ms < builderBest.ms) {
      builderBest = { docId: doc.id, layout, ms, wing };
    }
  }

  async function publishBuiltTrack(doc) {
    const owned = Boolean(readEditKey(doc.id));
    const values = await ui.askForm({
      title: owned ? str('ui.update_this_track') : str('ui.publish_this_track'),
      detail: str('main.a_track_built_in_a_world_is', { world: mapById(doc.map).name }),
      confirmLabel: owned ? str('main.update_the_board') : str('app.publish'),
      fields: [
        {
          key: 'course',
          label: str('main.track_name'),
          value: doc.name,
          maxLength: 80,
          placeholder: str('main.track_name'),
        },
        {
          key: 'author',
          label: str('ui.your_name'),
          value: readPilotName() || '',
          maxLength: 24,
          placeholder: str('ui.name'),
          autocomplete: 'nickname',
          rules: nameRules(),
          save: writePilotName,
        },
      ],
    });
    if (!values) {
      return null;
    }
    const layout = layoutFingerprint(doc);
    const medals = publishMedals(doc.medals, layout, (readBind(doc.id) || {}).layoutFingerprint, builderBest && builderBest.docId === doc.id ? builderBest : null);
    const sent = { ...doc };
    delete sent.medals;
    if (medals) {
      sent.medals = medals;
    }
    try {
      const result = await publishCurrentCourse({
        doc: sent,
        author: values.author,
        origin: (readBind(doc.id) || {}).board,
        courseName: values.course,
      });
      const cleared = result.posted.timesCleared ? str('main.old_times_were_cleared_because_the') : '';
      const forked = result.forked ? str('main.published_as_a_new_track') : '';
      return { doc: result.doc, text: str('main.published', { name: result.posted.name, forked, cleared }) };
    } catch (e) {
      return { doc: null, text: str('main.could_not_publish_that_track', { v1: e.message ?? e }) };
    }
  }

  ui.onFcOpen = (page) => {
    /* Off the ground in a flight, paused or not, the FC screen offers a
     * restart with its Save (src/ui/fc.js runActive). */
    const runActive = (mode === 'flight' || mode === 'paused') && !landed;
    ui.fc.open(moduleDump(sim), { runActive, page });
  };
  /*
   * THE FLIGHT CONTROLLER'S SAVE. A draft is a whole module dump, and its
   * parts land in the stores that already own them: the rate keys become
   * the pilot's rate profile, the rest the "custom" tune (FC_DUMP_KEY), and
   * the PIDs screen's adjustment to that tune is dropped because the dump
   * is the new baseline. The module is initialised once, as for any other
   * config change, and the result is always named Your edits; the Tune row
   * keeps flying the registry's own files.
   */
  function refuseFcDraft(code) {
    flashNotice(str('main.that_dump_could_not_be_saved', { configFault: configFault(code) }), 3600);
    /* Back on the config that was flying before the failed init. */
    sim.init(configText);
    adoptSimClock();
    reset();
    publishPids();
    ui.renderMenu();
  }
  function seatFcDraft(body, rates, text) {
    /* Private mode refuses the write: the edits still fly, for this page
     * only, and the notice says which. */
    const kept = writeFcDump(body);
    flashNotice(str(kept ? 'main.saved_flying_your_edits' : 'main.saved_for_this_session_only_this'), kept ? 2400 : 3600);
    Object.assign(ui.settings, { rates, tune: 'custom' });
    clearPidsFor(ui.settings.pids, 'custom');
    menuTune = 'custom';
    ui.persistSettings();
    configId = 'custom';
    configName = str('main.your_edits');
    configText = text;
    tuneText = body;
    ratesText = ratesDiff(rates);
    pidsText = '';
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    paintBest();
    reset();
    publishPids();
    const seated = moduleDump(sim);
    Object.assign(ui.fc, { snapshot: seated, draft: seated, runActive: false });
  }
  ui.onFcSave = (draft, opts) => {
    const after = opts || {};
    bumpConfigGen();
    const rates = normaliseRates(ratesFromDump(draft));
    const body = tuneBody(draft);
    const text = composeConfig(body, rates, RATES_KEEP, '');
    const code = sim.init(text);
    if (code !== SIM_OK) {
      refuseFcDraft(code);
      return;
    }
    seatFcDraft(body, rates, text);
    if (after.restart) {
      mode = 'flight';
      ui.show('flight');
      introMs = 0;
    } else if (after.exit) {
      ui.leaveFc();
    } else {
      ui.renderMenu();
    }
  };
  ui.onFcAngle = (on) => {
    ui.settings.flightMode = on ? 'angle' : 'acro';
    syncAngleMode();
  };
  ui.onFcMotor = (motor, duty) => {
    sim.motorOverride(motor, duty);
  };
  ui.onSettings = applySettings;
  /* The aircraft swap in place, and what it will cost the lap. */
  ui.onHotSwap = hotSwap;
  ui.swapWarning = () => (race.currentLapMs(simTimeMs) != null ? str('carousel.swap_voids_lap') : '');
  /*
   * THE HANGAR'S HOOKS (src/ui/hangar.js through Ui.openHangar).
   *
   * A preview paints the picker's model of that plane, the one the hangar
   * shows, and nothing else; null puts it back in the saved paint.
   *
   * A save repaints every model of the plane's family (a float plane and
   * its land plane wear one paint): the picker's, and the shell's own when
   * it is drawing one, which is the flown craft or the title's aircraft,
   * in place. A new motor or pack for the plane in the air is a refit, a
   * swap of the aircraft for itself where it is (hotSwap), so it flies on
   * the new power now; anywhere else it is the next seat's.
   */
  /*
   * A motor or an engine picked in the hangar speaks: a short rev on its
   * own voice (src/ui/hangar-polish.js revRpm), over whatever the mix
   * would say, and the seated plane's voice back after it.
   */
  ui.onHangarTry = (id, choice) => {
    const o = powerOption(id, choice.option);
    if (!o) {
      return;
    }
    hangarRev = { t0: null, voice: o.voice, was: flownVoice };
  };
  ui.onHangarPreview = (id, look) => {
    pickStage.repaint(id, look);
  };
  ui.onHangarSave = async (id, res) => {
    const family = liveryKey(id);
    for (const af of AIRFRAMES) {
      if (liveryKey(af.id) === family) {
        pickStage.repaint(af.id);
      }
    }
    const partsChanged = Boolean(res.settings && res.settings.parts);
    /* The tuning is the plane's own, not its family's. */
    const tuned = id === runAirframe && res.settings && res.settings.tuning
      && JSON.stringify(res.settings.tuning[id] ?? null) !== runTuneKey;
    /* And a combat quad's loadout is the quad's own (src/ui/hangar-combat.js). */
    const loaded = id === runAirframe && Boolean(res.settings && res.settings.combat)
      && JSON.stringify(combatSeated(id)) !== combatSeatKey;
    if (((res.powerChanged || partsChanged) && liveryKey(runAirframe) === family || tuned || loaded) && swapLive()) {
      await hotSwap(runAirframe, { refit: true });
    }
    if (partsChanged && drawnCraft === id && typeof shell.redressCraft === 'function') {
      shell.redressCraft(id);
    }
    if (liveryKey(drawnCraft) === family) {
      shell.repaintCraft(drawnCraft);
    }
  };
  /*
   * The power options the hangar offers (configs/power.js), in the shape
   * src/ui/hangar.js draws: each option and its packs or tanks by name, the
   * stock choice and the stored one, and the readouts for any choice: the
   * all up weight and thrust to weight from the option's own data, the top
   * speed and the flight time at cruise flown on the plant ahead of time
   * (configs/power-estimates.js). A quad's are its motors, quadPower
   * below; null for an aircraft with neither.
   */
  const hostOf = (url) => {
    const m = /^https?:\/\/(?:www\.)?([^/]+)/.exec(url);
    return m ? m[1] : url;
  };
  /* A quad's motors, props and packs (configs/motors.js) in the same
   * shape: every motor offers the same packs, so the pack row and the
   * pack a motor change keeps work as a plane's do, and `props` is the
   * row a plane has none of. The weight, the thrust to weight, the hover
   * and full throttle times from the static operating point the checks
   * hold (motorStats), and the top speed flown on the plant ahead of time
   * (configs/motor-estimates.js). */
  const quadPower = (id) => {
    const m = MOTORS[id];
    const packs = m.packs.map((p) => ({ id: p.id, name: str(p.name), detail: str('carousel.grams', { n: p.grams }) }));
    return {
      options: m.options.map((o) => ({
        id: o.id, name: str(o.name), detail: o.detail, kind: 'electric', source: hostOf(o.source[0]), packs,
      })),
      props: m.props.map((p) => ({ id: p.id, name: str(p.name), detail: p.detail })),
      stock: quadChoices(id)[0],
      chosen: powerChoice(id, ui.settings.power),
      estimate: (choice) => {
        const c = motorChoice(id, { [id]: choice });
        const st = motorStats(id, c);
        return {
          grams: Math.round(st.massKg * 1000),
          topSpeed: (MOTOR_ESTIMATES[id] || {})[choiceKey(c)] ?? null,
          thrustToWeight: st.tw,
          hoverMinutes: st.hoverMin,
          fullMinutes: st.fullMin,
          responseMs: st.tau * 1000,
        };
      },
    };
  };
  const hangarPower = (id) => {
    if (hasMotors(id)) {
      return quadPower(id);
    }
    const list = POWER[id];
    if (!list) {
      return null;
    }
    const stock = list[0];
    return {
      options: list.map((o) => ({
        id: o.id,
        name: str(o.name),
        kind: o.kind,
        source: o.source && o.source.length ? hostOf(o.source[0]) : null,
        packs: o.packs.map((p) => ({
          id: p.id,
          name: o.kind === 'glow' ? str('power.tank', { cc: p.cc }) : str('power.pack', { cells: p.cells, mah: p.mAh }),
          detail: p.massKg == null ? null : str('carousel.grams', { n: Math.round(p.massKg * 1000) }),
        })),
      })),
      stock: { option: stock.id, pack: stock.pack },
      chosen: powerChoice(id, ui.settings.power),
      estimate: (choice) => {
        const c = powerChoice(id, { [id]: choice });
        const o = powerOption(id, c.option);
        const mass = powerBlock(id, c.option, c.pack)[1];
        const e = ((ESTIMATES[id] || {})[c.option] || {})[c.pack] || {};
        return {
          grams: Math.round(mass * 1000),
          topSpeed: e.topSpeed ?? null,
          minutes: e.minutes ?? null,
          thrustToWeight: o.thrustN / (mass * 9.80665),
          /* Handling, as one number the plant flies: grams on each dm^2
           * of the plant's wing. */
          wingLoading: (mass * 1000) / (tuningFor(id).area * 100),
        };
      },
    };
  };
  ui.hangarPower = hangarPower;
  ui.hangarWarning = (id) => (liveryKey(id) === liveryKey(runAirframe) && race.currentLapMs(simTimeMs) != null
    && hangarPower(id) ? str('hangar.power_voids_lap') : '');
  /*
   * THE FIRST RUN'S COACHING: three lines, each moved on by the pilot
   * reaching the next gate rather than by a clock, so a slow first lap is
   * never cut off and a quick one never nagged. Once a lap is posted or
   * three gates are behind them the lap splits say more, so it retires for
   * good (ui.guided goes false and the frame loop stops asking).
   *
   * The lines name the controls of whatever the pilot is holding: a thumb
   * pilot in landscape has no arrow key and no Escape. The device is read
   * on every call, since a radio can be plugged in between two lines.
   */
  const guidedControls = () => {
    if (input.isTouchPrimary()) {
      return { nose: str('main.push_the_right_plate_up_then'), again: str('main.pause_then_restart_puts_you_back') };
    }
    const again = str('main.r_puts_you_back_on_the');
    return input.firstGamepad()
      ? { nose: str('main.ease_the_right_stick_forward_then'), again }
      : { nose: str('main.tip_forward_with_the_up_arrow'), again };
  };
  const guidedPrompt = (race) => {
    const coaching = !race.freestyle && race.lastLapMs == null && race.next < 3;
    if (!coaching) {
      ui.guided = false;
      return '';
    }
    const { nose, again } = guidedControls();
    switch (race.next) {
      case 0: return str('main.the_green_gate_starts_your_lap', { nose });
      case 1: return str('main.through_the_next_gate_turns_green');
      default: return str('main.gate_by_gate', { again });
    }
  };
  /*
   * A published track picked from My tracks seats the way a ?share= link
   * does at boot, without the navigation: fetch it, write the share seat,
   * and tell the shell which track it holds. The world builds around it
   * from there.
   */
  ui.onBoardCourse = async (track) => {
    const fetched = await fetchTrackDocument(track.id, track.board);
    /* A board answers with the document inside its listing, or bare. */
    const doc = fetched.document || fetched;
    const share = {
      id: fetched.id || track.id,
      name: fetched.name || track.name || doc.name,
      author: fetched.author || track.author || '',
      board: track.board,
      document: doc,
    };
    if (!writeShareImport(share)) {
      throw new Error('This browser would not store that track.');
    }
    ui.setShare(share);
    return true;
  };
  /*
   * THE BUILDER, FROM MY TRACKS: Edit opens it on one of the pilot's own
   * tracks (`id`), New track on an empty one in a world (`map`). The world
   * is built if it is not the one standing, with nothing seated on it
   * (buildWorld), the aircraft is parked at the world's spawn, and the
   * builder takes the view. Escape out of the builder lands back on My
   * tracks (buildHost.leave). A world that will not build leaves the pilot
   * on My tracks with syncWorld's own notice.
   */
  ui.onBuild = async ({ map, id, casual = false }) => {
    if (needSignIn(() => ui.onBuild({ map, id, casual }))) {
      return;
    }
    const entry = mapById(map);
    const doc = id ? loadMapTrack(id) : null;
    if (entry.id !== map || !entry.build || (id && !doc)) {
      throw new Error(`the builder cannot open ${id || 'a new track'} in ${map}`);
    }
    titleWorld = null;
    buildWorld = map;
    if (!worldMatchesSettings()) {
      await syncWorld();
    }
    const b = view.id === map ? await ensureBuild() : null;
    if (!b) {
      buildWorld = null;
      ui.show('courses');
      return;
    }
    whenConfigReady(() => {
      reset();
      mode = 'flight';
      ui.show('flight');
      b.open(doc, { casual });
      /* The generator marks nothing in the document, whose format is
       * shared with the board; progression keeps the id instead. */
      if (casual && b.docId) {
        ui.progress.markCasual(b.docId);
      }
    });
  };
  /* The menu's own clicks and ticks. The audio module ships on its own
   * schedule, so a build without ui() stays silent rather than throwing. */
  ui.onUiSound = (kind) => {
    if (typeof audio.ui === 'function') {
      audio.ui(kind);
    }
  };

  /*
   * THE JOYSTICK PICKER (src/input/padpick.js) as a screen. It remembers
   * where the pilot came from and puts them back there; a run that was in
   * the air comes back paused rather than live, because the device under
   * the pilot's thumbs may have just changed.
   */
  const PICK_OUTCOME = new Map([
    ['accepted', (summary) => [str('main.flying_with', { using: summary.using }), 2800]],
    ['skipped', () => [str('main.keyboard_sticks_choose_joystick_in_settings'), 3200]],
  ]);
  function leavePadPick() {
    if (padPickReturn === 'paused') {
      mode = 'paused';
    }
    ui.show(padPickReturn);
    const summary = input.padSummary();
    ui.setPadInfo(summary);
    /* Read only: the roster owns the outcome and clears it when the next
     * pick starts. */
    const outcome = PICK_OUTCOME.get(input.padPickResult);
    if (outcome) {
      flashNotice(...outcome(summary));
    }
  }

  function openPadPick(reason) {
    /* A name being typed owns the keyboard; input.js holds the pick until
     * the dialog closes and the frame loop asks again. */
    if (ui.nameDialog && !ui.nameDialog.hidden) {
      input.requestPadPick(reason);
      return;
    }
    if (ui.screen === 'padpick') {
      return;
    }
    if (!input.startPadPick(reason)) {
      /* Only a pilot who chose the row is told. The picks the roster
       * queues by itself, at boot or on a hotplug, stay quiet. */
      if (reason === 'menu') {
        flashNotice(str('main.no_radio_or_gamepad_found_plug'), 3200);
      }
      return;
    }
    if (ui.screen === 'calibrate') {
      input.cancelCalibration();
    }
    const fromRun = mode === 'flight' || ui.screen === 'flight';
    if (fromRun) {
      mode = 'paused';
    }
    padPickReturn = fromRun ? 'paused' : ui.screen || 'title';
    ui.show('padpick');
  }

  /*
   * A standings row's ghost is armed the way a ?ghost= link arms one: the
   * time id waits in ghostQueryId, and the lap downloads when the seated
   * track's times are read, which the seat change does next anyway.
   */
  ui.onStandingsGhost = (track, time) => {
    if (time && time.id) {
      ghostQueryId = time.id;
    }
  };

  /* The optional Google sign-in's dialogs and progress sync
   * (src/ui/accountui.js), its rows in Pilot. */
  const accountUi = createAccountUi({
    ui,
    identity,
    say: (text) => {
      notice = { text, untilMs: performance.now() + 4200 };
    },
  });
  /* One sync now, resolving to whether it changed anything here, for
   * scripts/account-browser-check.js, which cannot wait out the minute. */
  window.__accountSync = () => accountUi.sync();
  /*
   * Fly and Restart start a run the same way once the loaded config is the
   * current one: a tune still being fetched would sim_init underneath a run
   * whose clock had already started.
   */
  function startRun(action) {
    /* A room race this pilot has finished is over for them: flying on
     * is flying alone. */
    if (roomRun() && roomRace.done()) {
      roomRaceRunId = null;
    }
    whenConfigReady(() => {
      reset();
      mode = 'flight';
      /* Fly from the title: reset() ran with the title still up, where it
       * parks the craft rather than air start it, so a published map
       * track whose start gate hangs in the air started on the ground
       * under it. A restart from the pause menu has already had its air
       * start, and its countdown is running. */
      const sp = runSpawn();
      if (sp && sp.air && !(airHoldMs > 0)) {
        airStart(sp.air.y);
      }
      ui.show('flight');
      /*
       * The pad shot plays on Fly only, where the pilot first sees the
       * aircraft. A restart skips it, through the menu as through R, since
       * a racer restarts many times an hour and a phone has only the menu.
       * A war skips it too: its film was the introduction, and the shot's
       * radii are a quad's, so round a Striker it sat inside the fuselage
       * for the first four seconds of the countdown.
       */
      introMs = action === 'restart' || roomWar.on() ? -1 : 0;
    });
  }

  function resumeRun() {
    whenConfigReady(() => {
      /* Back into a turtle wait or a flip, the sticks must recentre
       * before they count, or a stick still held from before the pause
       * starts a flip the moment the run resumes. */
      if (turtleWait || turtleFlip.active) {
        turtleResumeGate = true;
      }
      mode = 'flight';
      ui.show('flight');
    });
  }

  function quitToTitle() {
    /* A builder session ends with the run: its test course comes off the
     * view, and the world goes back to following the seat. A seated
     * track's race (build.racing) is the seat's and stays. */
    if (build && build.active && !build.racing) {
      build.exit(false);
    }
    buildWorld = null;
    roomRaceRetire();
    mode = 'title';
    /* Not while a world swap is in flight: the old world is already
     * disposed (syncWorldNow), its terrain gone under adoptSpawn, and the
     * swap resets the run on the world it brings. Leave goes to the title
     * at once now, so a Leave during a swap reached this. */
    if (!swapInFlight) {
      reset();
    }
    /* Now, not on the next frame: a choice made on the title before a
     * frame has run must meet the world as the seat has it. */
    if (worldHold) {
      releaseWorldHold();
    }
  }

  const sayNoRadio = () => flashNotice(str('main.no_radio_or_gamepad_found_plug_2'), 3200);

  /* The calibrate screen's rows. Its frame loop branch blanks the banner
   * every frame, so the wizard's own steps say nothing here: the gimbals
   * moving under the pilot's sticks are the answer. */
  const CALIBRATE_ACTIONS = [
    ['calibrate', () => {
      if (!input.firstGamepad()) {
        sayNoRadio();
        return;
      }
      input.startCalibration();
      ui.show('calibrate');
    }],
    /* The check step alone, against the saved mapping, refused the same
     * way when nothing is plugged in: a mapping with no radio behind it
     * has nothing to show. */
    ['calibrate-check', () => {
      if (!input.startCalibrationCheck()) {
        sayNoRadio();
        return;
      }
      ui.show('calibrate');
    }],
    ['calibrate-cancel', () => {
      input.cancelCalibration();
      ui.show('pilot');
    }],
    ['calibrate-reverse', () => input.reverseMovingChannel()],
    /* Settings owns the stick mode (ui.cycleStickMode writes it and
     * applySettings fans it out to every gimbal and the keyboard). */
    ['calibrate-stick-mode', () => ui.cycleStickMode()],
    ['calibrate-zero-throttle', () => input.zeroThrottleHere()],
    ['calibrate-skip', () => input.skipCalibrationSelect()],
    ['calibrate-save', () => {
      if (!input.acceptCalibration()) {
        return;
      }
      ui.show('pilot');
      /* What storage did, not that the wizard ended: a private window or
       * a full quota keeps the mapping for this page only (saveMap). */
      const kept = input.calResult !== 'saved-unstored';
      flashNotice(str(kept ? 'main.stick_mapping_saved' : 'main.mapping_live_gone_on_reload'), kept ? 2800 : 5200);
      input.calResult = null;
    }],
  ];

  const PAD_PICK_ACTIONS = [
    ['choosepad', () => openPadPick('menu')],
    ['padpick-yes', () => {
      if (input.acceptPadPick()) {
        leavePadPick();
      }
    }],
    ['padpick-no', () => input.rejectPadPick()],
    ['padpick-skip', () => {
      input.skipPadPick();
      leavePadPick();
    }],
    ['padpick-cancel', () => {
      input.cancelPadPick();
      leavePadPick();
    }],
  ];

  function saveFlightLog() {
    if (flightLog.count < 2) {
      flashNotice(str('main.nothing_recorded_yet_turn_the_flight'), 3600);
      return;
    }
    const rows = flightLog.count;
    const secs = flightLog.seconds.toFixed(1);
    downloadText(flightLogName(ui.settings.map), flightLog.csv());
    flashNotice(str('main.flight_log_saved_rows_over_s', { rows, secs }), 3600);
  }

  async function renamePilot() {
    const name = await ui.askName({
      title: str('ui.your_name'),
      detail: str('ui.posted_times_and_published_tracks_carry'),
    });
    if (!name) {
      return;
    }
    /* The name is already kept here; this only carries it to the boards
     * the pilot has posted on, and says so when one took it. */
    try {
      const sync = await syncOwnedIdentity();
      if (Array.isArray(sync.results) && sync.results.some((r) => r.ok)) {
        flashNotice(str('main.name_on_the_board_is_now', { name }), 3200);
      }
    } catch (e) {
      flashNotice(str('main.name_saved_here_the_board_could', { v1: e.message ?? e }), 3600);
    }
  }

  async function exportPilotKey() {
    const text = await identity.exportText();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (e) {
    }
    if (copied) {
      notice = { text: str('main.pilot_key_copied_paste_it_into'), untilMs: performance.now() + 5200 };
      return;
    }
    await ui.askForm({
      title: str('main.your_pilot_key'),
      detail: str('main.copy_this_line_paste_it_into'),
      confirmLabel: str('main.done'),
      fields: [{ key: 'key', label: '', value: text, maxLength: 4000, placeholder: '', save: (v) => v }],
    });
  }

  async function importPilotKey() {
    const values = await ui.askForm({
      title: str('ui.import_pilot_key'),
      detail: str('main.paste_the_line_that_pilot_key'),
      confirmLabel: str('main.import'),
      fields: [{ key: 'key', label: '', value: '', maxLength: 4000, placeholder: str('ui.pilot_key'), save: (v) => v }],
    });
    if (!values || !values.key) {
      return;
    }
    try {
      await identity.importText(values.key);
      notice = { text: str('main.pilot_key_imported_times_you_post'), untilMs: performance.now() + 3600 };
    } catch (e) {
      notice = { text: str('main.that_key_was_not_imported', { v1: e.message ?? e }), untilMs: performance.now() + 3600 };
    }
  }

  /*
   * What each menu action does once ui.onAction's gates (account, sign in,
   * Play, the title's world, a spectator) have let it through, keyed by the
   * name ui.js sends. A name not here only carried its settings. The async
   * ones are fired and not awaited: ui.act does not wait on a dialog.
   */
  const MENU_ACTIONS = new Map([
    ['fly', startRun],
    ['restart', startRun],
    ['resume', resumeRun],
    ['pause', () => {
      mode = 'paused';
    }],
    ['title', quitToTitle],
    ...CALIBRATE_ACTIONS,
    ...PAD_PICK_ACTIONS,
    ['downloadflightlog', saveFlightLog],
    ['setname', () => {
      renamePilot();
    }],
    ['exportkey', () => {
      exportPilotKey();
    }],
    ['importkey', () => {
      importPilotKey();
    }],
    ['posttime', () => submitBoardTime()],
    ['postrun', () => submitFreestyleRun()],
  ]);

  ui.onAction = (action, s) => {
    if (s) {
      applySettings(s);
    }
    /* The hangar's TV: the newest of My clips in the replay viewer, whose
     * own My clips lists the rest; leaving it is the hangar again. */
    if (action === 'hangar-tv' && ui.walk) {
      const which = ui.walk.tier === 'field' ? 'field' : 'main';
      listClips().then((rows) => {
        if (!rows.length) {
          return undefined;
        }
        const newest = rows.reduce((a, b) => (b.created > a.created ? b : a));
        tvReturn = { mode, which };
        return crashCam.playSaved(newest.id);
      }).catch((err) => {
        tvReturn = null;
        notice = { text: str('walk.tv_refused', { why: err.message }), untilMs: performance.now() + 2400 };
      });
      return;
    }
    if (accountUi.handle(action)) {
      return;
    }
    /* No flight without an account (src/share/account.js): Fly, Play
     * and Restart wait for the sign in, and then go. Resume is only ever
     * a flight already under way. */
    if ((action === 'fly' || action === 'play' || action === 'restart') && needSignIn(() => ui.onAction(action))) {
      return;
    }
    /*
     * PLAY, FROM MY TRACKS: the seat holds the track, so build its world if
     * it is not the one standing, seat its gates, and open the launch card
     * the way Fly does. The title's world and the builder's end here, as
     * they end at the first Fly.
     */
    if (action === 'play') {
      titleWorld = null;
      buildWorld = null;
      paintBest();
      const launch = () => {
        if (worldMatchesSettings()) {
          ui.act('fly');
        }
      };
      if (worldMatchesSettings()) {
        launch();
      } else {
        syncWorld().then(launch);
      }
      return;
    }
    if (action === 'fly' && titleWorld) {
      /*
       * THE TITLE'S WORLD ENDS AT THE FIRST FLY. The pilot flies their own
       * world: when the seat is another map it is built behind the loading
       * screen first, then this action runs again with the world in place.
       * A swap that did not land leaves the pilot on the title with
       * syncWorld's own notice, rather than flying the wrong world.
       */
      titleWorld = null;
      paintBest();
      if (!worldMatchesSettings()) {
        syncWorld().then(() => {
          if (worldMatchesSettings()) {
            ui.onAction('fly');
          }
        });
        return;
      }
    }
    /* A spectator has no airframe to restart in. */
    if (action === 'restart' && warSpectating()) {
      return;
    }
    const run = MENU_ACTIONS.get(action);
    if (run) {
      run(action);
    }
  };

  /*
   * The menu cursor from a radio or a pad, handed to ui.pollPad every frame
   * (Settings ignores it: there the sticks pose the aircraft). A mapping
   * input.js trusts, the wizard's or a guess whose throttle sits parked the
   * way a real radio's does (noteThrottleParked), steers with pitch and
   * roll, so roll can step a value. Anything else moves the cursor up and
   * down off whichever axis moves, because the wizard that would fix the
   * mapping is itself a menu row and has to stay reachable.
   */
  function padNav() {
    const buttons = input.padMenuButtons();
    const intent = {
      up: false,
      down: false,
      right: false,
      left: false,
      select: buttons.select,
      back: buttons.back,
      alt: input.padAltButton(),
      floats: input.padFloatsButton(),
      flip: input.padLookClick(),
      look: input.padLookStick(),
    };
    if (input.mapUsable()) {
      const { pitch, roll } = input.channels;
      intent.up = pitch > NAV_DEFLECT;
      intent.down = pitch < -NAV_DEFLECT;
      intent.right = roll > NAV_DEFLECT;
      intent.left = roll < -NAV_DEFLECT;
    } else {
      /* With no mapping to trust, a standard pad's left stick steers the
       * four ways; anything else moves up and down off whichever axis
       * moves, the radio's rule. */
      const pad = input.padDirections();
      const raw = pad ? pad.stick : input.navRaw();
      intent.up = raw.up;
      intent.down = raw.down;
      intent.left = Boolean(raw.left);
      intent.right = Boolean(raw.right);
    }
    /* A standard pad's d-pad steers whatever the flight mapping says: it
     * flies nothing. */
    const ways = input.padDirections();
    if (ways) {
      for (const k of ['up', 'down', 'left', 'right']) {
        intent[k] = intent[k] || ways.dpad[k];
      }
    }
    return intent;
  }

  /*
   * THE MIX, from Settings' 0 to 10 sliders to the audio engine. The engine
   * ships on its own schedule, so a method this build lacks is skipped
   * rather than called: a missing bed is a defect, a page that throws on
   * every slider is an outage.
   */
  const MIX_STEMS = [
    ['motors', 'motorLevel'], ['wind', 'windLevel'], ['music', 'musicLevel'], ['effects', 'effectsLevel'],
    ['voice', 'voiceLevel'], ['ambience', 'ambientLevel'], ['other', 'otherLevel'],
  ];
  const hasAudio = (method) => typeof audio[method] === 'function';
  function applyMix(s) {
    if (hasAudio('setMix')) {
      for (const [stem, level] of MIX_STEMS) {
        mixArg[stem] = s[level] / 10;
      }
      mixArg.focus = 1;
      audio.setMix(mixArg);
    }
    if (hasAudio('setMusicEnabled')) {
      audio.setMusicEnabled(s.musicLevel > 0);
    }
    if (hasAudio('setMusicTrack')) {
      audio.setMusicTrack(s.musicTrack);
    }
    /* The context goes first so the status read after it names the record
     * that is really playing. On a page that has not changed screen since
     * it loaded, nothing but the first gesture's call here sets it. */
    if (hasAudio('setMusicContext')) {
      audio.setMusicContext(ui.flying() ? 'flight' : 'menu');
    }
    if (hasAudio('musicStatus')) {
      ui.setMusicNow(audio.musicStatus());
    }
    if (hasAudio('setFocusEnabled')) {
      audio.setFocusEnabled(Boolean(s.focusTone));
    }
  }

  /*
   * A key or a pointer press is the user gesture a browser wants before it
   * lets audio start, so both land here. The same gesture restarts a
   * context the browser suspended or another app interrupted
   * (MotorAudio.start).
   */
  function wakeAudio() {
    if (ui.settings.sound) {
      const first = !audio.ctx;
      if (first || audio.ctx.state !== 'running') {
        audio.start();
      }
      if (first) {
        audio.setLevel(ui.settings.volume / 10);
      }
    }
    audio.setEnabled(ui.settings.sound);
    applyMix(ui.settings);
  }

  /*
   * THE IN-SIM BUILDER (src/builder/buildmode.js). B in a flight on a world
   * the registry marks `build` parks the aircraft and flies a free camera
   * that places gates against the world itself; B again flies the track on
   * the race's own scoring. The module is fetched the first time such a
   * world is seated, so no other map pays for it, and all it does to the run
   * goes through this host: the menu's own pause, resume and restart, and a
   * new Race over the gates it hands in.
   */
  let buildLoading = null;
  const buildHost = {
    shell,
    input,
    ui,
    view: () => view,
    mode: () => mode,
    canBuild: () => mapReady && mode === 'flight' && ui.screen === 'flight' && Boolean(mapById(view.id).build),
    onFlightScreen: () => ui.screen === 'flight',
    heightAt: (x, z) => view.height(x, z, Infinity),
    hold: () => ui.onAction('pause'),
    resume: () => ui.onAction('resume'),
    fly: () => ui.onAction('restart'),
    setCourse(gates, recordSuffix) {
      race = new Race(gates, 'full', raceOpts(recordSuffix));
      race.setRecordKey(recordKey());
      paintBest();
      view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    },
    publish: (doc) => publishBuiltTrack(doc),
    /* Out of a builder My tracks opened, back to My tracks. */
    leave: () => ui.act('mytracks'),
  };
  function loadBuild() {
    if (build || buildLoading || !mapById(view.id).build) {
      return;
    }
    buildLoading = import('./builder/buildmode.js')
      .then((m) => {
        build = m.createBuildMode(buildHost);
      })
      .catch((e) => {
        /* Loud, once, and not retried every frame after: a builder that
         * failed to load is a missing B key, not a broken flight. */
        console.error('build mode failed to load', e);
      });
  }

  /*
   * MOUSE FLIGHT'S POINTER LOCK. The mouse flies only while the pointer is
   * captured, and it is captured only on the flight screen, never in the
   * builder's editor, which has its own use for a mouse. Everywhere else
   * the pointer is the menus' and is released.
   *
   * Capture needs a click or a key the browser counts as the pilot's, so
   * it is asked for when flight begins, which usually follows the Enter or
   * the click that started it, and again on any click in flight. A request
   * the browser refuses is not an error to report: the banner asking for a
   * click stays up, which is the answer to it.
   *
   * ESCAPE. The browser spends Escape on releasing the pointer, and a lost
   * capture in flight is a pause, the way a hidden tab is: the same two
   * calls Escape makes. Chrome may ALSO hand the page that Escape, which
   * would then land on the pause menu and resume straight back into
   * flight, so an Escape just after a capture was lost is swallowed.
   *
   * Only a capture the BROWSER took away pauses. The change event says
   * nothing about who asked, and the one for the release this file asks
   * for on leaving flight can arrive after the next flight has begun, where
   * it paused a run the pilot had just started. mouseExitAsked marks ours.
   *
   * AND ONLY A CAPTURE MOUSE FLIGHT TOOK IS ITS TO RELEASE. The builder
   * captures the same canvas for its own camera (src/builder/buildmode.js),
   * and releasing every capture off the flight screen took that away from
   * every builder, mouse flight on or off; lint trackmode:check caught it.
   * mouseLockMine is set when a capture this file asked for arrives.
   */
  let mouseLockAsked = false;
  /* Asks not yet answered. A count, not a flag: the resume's ask and a
   * click's can both be in flight, and one refused before the other is
   * granted must not leave the granted capture unowned. */
  let mouseLockAsks = 0;
  let mouseLockMine = false;
  let mouseExitAsked = false;
  let mouseEscGuardUntil = 0;
  const MOUSE_ESC_GUARD_MS = 300;
  const mouseLocked = () => document.pointerLockElement === shell.canvas;
  function mouseWantsLock() {
    return input.mouseEnabled && mode === 'flight' && ui.screen === 'flight'
      && !(build && build.active && !build.racing) && !debrief.isOpen;
  }
  function askMouseLock() {
    mouseLockAsks += 1;
    const req = shell.canvas.requestPointerLock();
    if (req && typeof req.catch === 'function') {
      req.catch(() => {});
    }
  }
  function syncMouseLock(nowWall) {
    const want = mouseWantsLock();
    const locked = mouseLocked();
    input.setMouseLive(want && locked);
    const wing = Boolean(airframeById(runAirframe).fixedWing);
    input.setMouseCraft(wing, ui.settings.flightMode !== 'angle');
    if (!want) {
      mouseLockAsked = false;
      if (locked && mouseLockMine) {
        mouseExitAsked = true;
        document.exitPointerLock();
      }
      return;
    }
    if (locked) {
      return;
    }
    if (!mouseLockAsked) {
      mouseLockAsked = true;
      askMouseLock();
    }
    if (!notice || notice.mouse || nowWall >= notice.untilMs) {
      notice = { text: str('main.mouse_click_to_fly'), untilMs: nowWall + 250, mouse: true };
    }
  }
  window.addEventListener('mousedown', (e) => {
    if (!mouseWantsLock() || mouseLocked()) {
      return;
    }
    const t = e.target;
    if (t && t.closest && t.closest('button,input,select,textarea,a')) {
      return;
    }
    askMouseLock();
  });
  document.addEventListener('pointerlockerror', () => {
    mouseLockAsks = Math.max(0, mouseLockAsks - 1);
  });
  document.addEventListener('pointerlockchange', () => {
    if (mouseLocked()) {
      /* Two asks granted each fire a change; the second must not disown
       * the capture the first one took. */
      mouseLockMine = mouseLockMine || mouseLockAsks > 0;
      mouseLockAsks = 0;
      return;
    }
    const mine = mouseLockMine;
    const ours = mouseExitAsked;
    mouseLockMine = false;
    mouseExitAsked = false;
    input.setMouseLive(false);
    if (mine && !ours && input.mouseEnabled && mode === 'flight' && ui.screen === 'flight') {
      mouseEscGuardUntil = performance.now() + MOUSE_ESC_GUARD_MS;
      ui.act('pause');
      ui.show('paused');
    }
  });
  window.__mouseLock = () => ({
    enabled: input.mouseEnabled,
    live: input.mouseLive,
    locked: mouseLocked(),
    mine: mouseLockMine,
    wants: mouseWantsLock(),
    centring: input.mouseCentring(),
    step: input.mouseThrottleStep(),
    stick: { ...input.mouse },
    channels: { ...input.channels },
    source: input.stats().source,
    angle: angleModeOn,
  });

  /* The Avionics HUD's keys (docs/AVIONICS-HUD.md section 9). */
  /* Every letter is taken in flight, so the thermal palette sits beside
   * J and K on the punctuation row: the key that reads . (period). */
  const PALETTE_KEY = 'Period';
  const AVX_KEYS = new Set(['KeyH', 'KeyJ', 'KeyK', 'KeyI', 'KeyU', 'KeyY', PALETTE_KEY]);
  const BALL_KEYS = new Set(['KeyU', 'Space', 'KeyJ', 'KeyK', PALETTE_KEY]);
  /*
   * X: the pilot's own way out of a stuck state the thrash watch cannot
   * name, recovered the way the watch recovers (clear air near here,
   * upright, the run untouched). Refused on the ground and while the
   * launch is staged, so it is never a free reposition between laps.
   */
  function unstickInPlace() {
    /* A wreck may be respawned in place whether or not it came to rest
     * upright: its lap is already over, so this is the pilot choosing to
     * fly on from here rather than from the pad. */
    if ((landed && !wrecked) || launchStaging || poseLock || crashed) {
      return;
    }
    setManualFlip(false);
    setCrashflip(false);
    turtleRecover = false;
    finishClipCrash();
  }

  /* L on a quad: launch control, which Settings must have on and which
   * only arms from the pad or a staged start. */
  function toggleLaunchControl() {
    if (!ui.settings.launchControl) {
      flashNotice(str('main.launch_control_is_off_turn_it'), 3200);
      return;
    }
    if (!landed && !launchStaging) {
      flashNotice(str('main.launch_control_is_for_the_start'), 2800);
      return;
    }
    applyLaunchSwitch(!lcArmed);
    if (lcArmed) {
      flashNotice(str('main.launch_control_throttle_idle_pitch_forward'), 2200);
    } else {
      flashNotice(str('main.launch_control_off'), 1600);
    }
  }

  input.onKey = (code, repeat) => {
    wakeAudio();
    if (code === 'Escape' && performance.now() < mouseEscGuardUntil) {
      return;
    }
    if (build && build.onKey(code, repeat)) {
      return;
    }
    if (crashCam && crashCam.onKey(code, repeat)) {
      return;
    }
    /* A watcher: J (a replay's key) and the brackets step through the
     * pilots, Escape leaves the room, and nothing else flies. */
    if (ui.screen === 'flight' && roomWatching() && (code === 'Escape' || code === 'KeyJ' || WAR_WATCH_KEYS.has(code))) {
      if (repeat) {
        return;
      }
      if (code === 'Escape') {
        ui.onFriends('friends-leave');
      } else if (code !== 'KeyR' && code !== 'KeyX' && code !== 'Tab') {
        warWatch(code === 'BracketLeft' ? -1 : 1);
      }
      return;
    }
    if (ui.screen === 'flight' && WAR_WATCH_KEYS.has(code) && warSpectating()) {
      if (!repeat && (code === 'BracketLeft' || code === 'BracketRight')) {
        warWatch(code === 'BracketLeft' ? -1 : 1);
      }
      return;
    }
    if (ui.handleKey(code, repeat)) {
      return;
    }
    if (repeat) {
      return;
    }
    if (code === 'KeyR') {
      reset();
      return;
    }
    if (code === 'KeyX' && ui.screen === 'flight' && mode === 'flight') {
      unstickInPlace();
      return;
    }
    function cycleThermalPalette() {
      sensors.cyclePalette();
      ui.settings.avxPalette = sensors.state.palette;
      ui.persistSettings();
      notice = { text: str('avionics.hud.notice_palette', { palette: str(`avionics.hud.palette.${sensors.state.palette}`) }), untilMs: performance.now() + 1600 };
    }
    /* The Avionics HUD's own keys, while it is on screen
     * (docs/AVIONICS-HUD.md section 9): H the AI's tracking, J the camera
     * mode, K the zoom, I the sensor full screen or the pilot's picture, U
     * the inset's size and Y how much is drawn (settings, so kept). */
    /* The camera ball's keys while its picture is the view (THE CAMERA
     * BALL); its slew and zoom are held keys, read every frame. */
    if (ui.screen === 'flight' && ballOn && BALL_KEYS.has(code)) {
      if (code === 'KeyU') {
        ballToggleLock();
      } else if (code === 'Space') {
        opsCaptureNow();
      } else if (code === 'KeyJ') {
        sensors.cycleMode();
        notice = { text: str('avionics.hud.notice_cam', { mode: str(`avionics.hud.cam_mode.${sensors.state.mode}`) }), untilMs: performance.now() + 1600 };
      } else if (code === PALETTE_KEY) {
        cycleThermalPalette();
      } else {
        sensors.cycleZoom();
        notice = { text: str('avionics.hud.notice_zoom', { z: sensors.state.zoom }), untilMs: performance.now() + 1600 };
      }
      return;
    }
    if (ui.screen === 'flight' && opsGuide.first && code === 'Enter') {
      firstDone(opsGuide.first.campaign);
      return;
    }
    /* The quiet HUD's own: M the tactical map, ` the role board. */
    if (ui.screen === 'flight' && opsHud.on && code === 'KeyM') {
      opsHud.toggleMap();
      return;
    }
    if (ui.screen === 'flight' && roomOps.on() && code === 'Backquote') {
      rolesBoard.toggle();
      return;
    }
    if (ui.screen === 'flight' && avionicsHud.on && AVX_KEYS.has(code)) {
      if (code === 'KeyY') {
        ui.settings.avxLevel = AVX_LEVELS[(AVX_LEVELS.indexOf(ui.settings.avxLevel) + 1) % AVX_LEVELS.length];
        ui.persistSettings();
        avionicsHud.setLevel(ui.settings.avxLevel);
        notice = { text: str('avionics.hud.notice_level', { level: str(`avionics.hud.level.${ui.settings.avxLevel}`) }), untilMs: performance.now() + 1600 };
      } else if (code === 'KeyU') {
        ui.settings.avxInset = AVX_INSETS[(AVX_INSETS.indexOf(ui.settings.avxInset) + 1) % AVX_INSETS.length];
        ui.persistSettings();
        sensors.setInset(ui.settings.avxInset);
        notice = { text: str('avionics.hud.notice_inset', { size: str(`avionics.hud.inset.${ui.settings.avxInset}`) }), untilMs: performance.now() + 1600 };
      } else if (code === 'KeyI') {
        sensors.setMainView(sensors.state.mainView === 'eo' ? 'sensor' : 'eo');
        notice = {
          text: sensors.state.mainView === 'sensor'
            ? str('avionics.hud.notice_view_sensor', { mode: str(`avionics.hud.cam_mode.${sensors.state.mode}`) })
            : str('avionics.hud.notice_view_pilot'),
          untilMs: performance.now() + 1600,
        };
      } else if (code === 'KeyH') {
        avxHud.ai = !avxHud.ai;
        notice = { text: str(avxHud.ai ? 'avionics.hud.notice_ai_on' : 'avionics.hud.notice_ai_off'), untilMs: performance.now() + 1600 };
      } else if (code === 'KeyJ') {
        sensors.cycleMode();
        notice = { text: str('avionics.hud.notice_cam', { mode: str(`avionics.hud.cam_mode.${sensors.state.mode}`) }), untilMs: performance.now() + 1600 };
      } else if (code === PALETTE_KEY) {
        cycleThermalPalette();
      } else {
        sensors.cycleZoom();
        notice = { text: str('avionics.hud.notice_zoom', { z: sensors.state.zoom }), untilMs: performance.now() + 1600 };
      }
      return;
    }
    if (code === 'KeyL' && ui.screen === 'flight' && airframeById(runAirframe).fixedWing) {
      if (!wrecked) {
        throwWing();
      }
      return;
    }
    if (code === 'KeyP' && ui.screen === 'flight' && airframeById(runAirframe).chute) {
      pullChute();
      return;
    }
    if (code === 'KeyF' && ui.screen === 'flight' && airframeById(runAirframe).flaps) {
      if (setFlapNotch((flapNotch + 1) % 3)) {
        /* Parked, the plant is held by not stepping it, and the servos
         * would have moved the flaps in the time it sat there. */
        if (landed && typeof sim.e.sim_wing_flaps_settle === 'function') {
          sim.e.sim_wing_flaps_settle();
        }
        const said = [str('ui.flaps_up'), str('ui.flaps_half'), str('ui.flaps_full')];
        notice = { text: said[flapNotch], untilMs: performance.now() + 1600 };
      }
      return;
    }
    /* THE RETRACTS' SWITCH, on an aircraft that has them (airframes.js
     * `retracts`): G flips it, and the plant moves the gear at its own
     * rate. The switch is the plant's, which a reset puts down, so it is
     * read back rather than kept here. Up on the ground puts the aircraft
     * on its belly, as a real one's would. */
    if (code === 'KeyG' && ui.screen === 'flight' && airframeById(runAirframe).retracts
      && typeof sim.e.sim_wing_set_gear === 'function') {
      const up = sim.e.sim_wing_gear_selected() ? 0 : 1;
      if (sim.e.sim_wing_set_gear(up) === SIM_OK) {
        notice = { text: up ? str('ui.gear_up') : str('ui.gear_down'), untilMs: performance.now() + 1600 };
      }
      return;
    }
    if (code === 'KeyO' && ui.screen === 'flight' && airframeById(runAirframe).fixedWing && smokeFitted()) {
      smokeOn = !smokeOn;
      notice = { text: str(smokeOn ? 'main.smoke_on' : 'main.smoke_off'), untilMs: performance.now() + 1400 };
      return;
    }
    if (code === 'KeyC' && ui.screen === 'flight' && airframeById(runAirframe).fixedWing) {
      /* A ball carried adds its picture as a fourth view (THE CAMERA BALL). */
      const views = ballFor(runAirframe) ? ['fpv', 'chase', 'los', 'pilot', 'ball'] : ['fpv', 'chase', 'los', 'pilot'];
      ui.settings.wingView = views[(views.indexOf(ui.settings.wingView) + 1) % views.length];
      ui.persistSettings();
      chaseValid = false;
      const said = {
        fpv: str('main.view_fpv'), chase: str('main.view_chase'), los: str('main.view_los'), pilot: str('main.view_pilot'), ball: str('main.view_ball'),
      };
      notice = { text: said[ui.settings.wingView], untilMs: performance.now() + 1800 };
      return;
    }
    if (code === 'KeyL' && ui.screen === 'flight') {
      toggleLaunchControl();
      return;
    }
  };
  window.addEventListener('pointerdown', wakeAudio);

  /*
   * A file dropped on the page is refused with a notice. Dropping a CLI diff
   * to fly it is no longer a feature (tunes come from the registry and the
   * PIDs screen), but the handlers must stay: with no preventDefault the
   * browser opens the dropped file in place of the page and the run is lost.
   */
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) {
      return;
    }
    notice = {
      text: str('main.this_page_does_not_fly_a'),
      untilMs: performance.now() + 3600,
    };
  });

  /* One object for every applyMix call, filled in place; its keys are the
   * mixer's stems. */
  const mixArg = { motors: 1, wind: 1, music: 1, focus: 1, effects: 1, voice: 1, ambience: 1, other: 1 };
  const pPrev = new THREE.Vector3();
  const pCurr = new THREE.Vector3();
  const qPrev = new THREE.Quaternion();
  const qCurr = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qSpawn = new THREE.Quaternion();
  const qSpawnInv = new THREE.Quaternion();
  const qPad = new THREE.Quaternion();
  const qCollide = new THREE.Quaternion();
  const pProbe = new THREE.Vector3();
  const pBounce = new THREE.Vector3();
  /* World space up of the craft for the prop disc test, written on every
   * contact; held here because the loop may not allocate (P8). */
  const upAxis = new THREE.Vector3();
  const nSim = { x: 0, y: 0, z: 0 };
  const pSim = { x: 0, y: 0, z: 0 };
  const vsSim = { x: 0, y: 0, z: 0 };
  /* Scratch for the contact pass, which runs several times per frame. */
  const rPatch = { x: 0, y: 0, z: 0 };
  const rSim = { x: 0, y: 0, z: 0 };
  const obsPrev = new THREE.Vector3();
  const obsFrom = new THREE.Vector3();
  const obsTo = new THREE.Vector3();
  const obsPlace = new THREE.Vector3();
  const qObs = new THREE.Quaternion();
  const groundNWorld = new THREE.Vector3(0, 1, 0);
  /* groundNWorld turned into the plant's frame (spawn yaw removed). */
  const nWorld = new THREE.Vector3(0, 1, 0);
  const camFwd = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const qShake = new THREE.Quaternion();
  const shakeEuler = new THREE.Euler();
  const lensShake = makeLensShake();
  const introFrom = new THREE.Vector3();
  const introLook = new THREE.Vector3();
  const introRight = new THREE.Vector3();
  const introUp = new THREE.Vector3(0, 1, 0);
  /* The pad shot's level forward (padShot says why it is level). */
  const introFwd = new THREE.Vector3();
  const introQuat = new THREE.Quaternion();
    const fpvPos = new THREE.Vector3();
    const fpvQuat = new THREE.Quaternion();
    /* The chase camera's own smoothed position and travel direction, and
     * the craft position it last saw, so the direction comes from where
     * the plane is going rather than where its nose points. chaseValid
     * false means the next frame snaps rather than sweeping in. */
    const chasePos = new THREE.Vector3();
    const chaseDir = new THREE.Vector3(0, 0, -1);
    const chaseLast = new THREE.Vector3();
    const chaseAim = new THREE.Vector3();
    const chaseStep = new THREE.Vector3();
    const chaseHead = new THREE.Vector3();
    /* The point the chase camera follows and looks at: the plane itself,
     * except that on water its height is slowed to the swell's mean. A
     * floatplane rides every wave up and down, and a camera tied to it
     * pitched and bobbed with each one; a real chase camera boat or
     * drone holds its own line. chaseLift is how far the damping has
     * eased in, 0 in the air and 1 afloat, so a take off or a landing
     * does not jump the camera. */
    const chaseAnchor = new THREE.Vector3();
    let chaseLift = 0;
    let chaseWaterY = 0;
    let chaseValid = false;
    /* The seat the spectator's camera last framed, so a new one snaps. */
    let watchCamSeat = -1;
    const watchQ = new THREE.Quaternion();
    const losPos = new THREE.Vector3();
    const losBack = new THREE.Vector3();
    const finishFpvPos = new THREE.Vector3();
    const finishFpvQuat = new THREE.Quaternion();
    /* Milliseconds into the results camera's pull, or -1 when it is off. */
    let finishCamMs = -1;
  /* How far the FPV lens sits raised while parked; placeLens eases it in
   * and out so taking off is a glide, not a step. */
  let parkedLift = PARKED_LIFT;

  /*
   * THE SPAWN FRAME. A map places its spawn at (startX, startY, startZ)
   * turned by qSpawn, and the plant flies in its own frame with the spawn at
   * its origin (SPAWN_ALT below the craft's start height). These are the
   * shell's only crossings between the two, so frame.js stays the only
   * place the axis change itself is written:
   *
   *   worldPosToSim   a world point into plant metres: take the spawn's
   *                   offset off, turn back by the spawn, change axes,
   *                   lower by SPAWN_ALT;
   *   worldDirToSim   a world direction: the turn and the axis change, no
   *                   offset;
   *   poseFromState   a plant state's position out into the world.
   *
   * Every direction the shell hands the plant (the ground normal, a contact
   * normal, a contact arm, a moving solid's velocity) goes through
   * worldDirToSim. The axis change alone cannot undo the spawn's turn: with
   * it alone, a craft flying square into a wall on a map whose spawn faces
   * the other way reaches the plant as one flying out of it, the plant
   * declines the contact, and the craft parks on the face (the old town,
   * spawned at yaw pi, did exactly that). scripts/frame-check.js holds the
   * round trip at four spawn yaws and refuses a bare threeDirToSim call
   * anywhere else in this file.
   */
  function worldPosToSim(wx, wy, wz, out) {
    const local = pBounce.set(wx - startX, wy - startY, wz - startZ).applyQuaternion(qSpawnInv);
    threePosToSim(local.x, local.y, local.z, out);
    out.z -= SPAWN_ALT;
    return out;
  }
  function worldDirToSim(wx, wy, wz, out) {
    const unturned = nWorld.set(wx, wy, wz).applyQuaternion(qSpawnInv);
    return threeDirToSim(unturned.x, unturned.y, unturned.z, out);
  }
  function poseFromState(st, out) {
    simPosToThree(st[1], st[2], st[3] + SPAWN_ALT, out).applyQuaternion(qSpawn);
    out.x += startX;
    out.y += startY;
    out.z += startZ;
    return out;
  }

  /*
   * One axis of the ground's slope from the drops on either side of the
   * craft, with a minmod limiter: drops of opposite sign mean the craft sits
   * on a ridge or the edge of something (a start block, a terrace, a deck),
   * and the honest local surface there is flat; drops of the same sign are
   * a real slope, and the gentler one is kept. A plain one sided difference
   * across a 25 cm start block read the block's own height as a 30 to 43
   * degree ramp, and the plant duly flicked the quad off the pad at the
   * start; a 1 in 5 hill still measures its own 11.31 degrees.
   */
  function limitSlope(a, b) {
    if (a * b <= 0) {
      return 0;
    }
    return Math.abs(a) < Math.abs(b) ? a : b;
  }

  /*
   * The ground's unit normal at (wx, wz) in three.js space, written to out,
   * from five height samples 35 cm apart (centred, so level ground never
   * leans toward +x or +z). Finite differences on purpose: the physics path
   * may not use JS trigonometry. Returns the height under the point.
   */
  function sampleGroundNormal(wx, wz, fromY, out) {
    const STENCIL = 0.35;
    const here = floorHeight(wx, wz, fromY);
    const slopeX = limitSlope(
      here - floorHeight(wx + STENCIL, wz, fromY),
      floorHeight(wx - STENCIL, wz, fromY) - here,
    );
    const slopeZ = limitSlope(
      here - floorHeight(wx, wz + STENCIL, fromY),
      floorHeight(wx, wz - STENCIL, fromY) - here,
    );
    const lenSq = slopeX * slopeX + STENCIL * STENCIL + slopeZ * slopeZ;
    if (lenSq > 1e-12) {
      const scale = 1 / Math.sqrt(lenSq);
      out.set(slopeX * scale, STENCIL * scale, slopeZ * scale);
    } else {
      out.set(0, 1, 0);
    }
    return here;
  }

  function sampleGroundNormalFromState(st) {
    const at = poseFromState(st, pProbe);
    sampleGroundNormal(at.x, at.z, at.y - SURFACE_BIAS, groundNWorld);
    groundNormalAtX = at.x;
    groundNormalAtZ = at.z;
  }

  /*
   * WHEN THE SLOPE IS SAMPLED IS THE SIM CLOCK'S, not the frame's. It was
   * the first step of every frame and every eighth step after it, so the
   * plane the plant stood on changed at steps that depended on how the
   * frames fell: two stagings of one crash on the swiss2 grass handed the
   * plant different ground from the 34th step on (scripts/crash-feel.js
   * --repeat). Every eighth step of the plant's own count now, and at once
   * when the craft has been put somewhere else (a throw, a reset) or is
   * over on its side, where the old rule sampled every step too.
   */
  let groundNormalAtX = NaN;
  let groundNormalAtZ = NaN;
  function groundNormalDue(st) {
    if (Math.round(st[0] * SIM_HZ) % 8 === 0 || plantUpZ(st) < 0.5) {
      return true;
    }
    poseFromState(st, pProbe);
    const dx = pProbe.x - groundNormalAtX;
    const dz = pProbe.z - groundNormalAtZ;
    return !(dx * dx + dz * dz < 1);
  }

  /*
   * WATER WHOSE LEVEL IS NOT ONE HEIGHT (a body with levelAt, Itaipu's
   * flood, docs/FLOOD.md): the plant is told its level at the aircraft
   * with the ground, at the same steps, the map's water clock set to the
   * room's time of this step first, so the floats sit on the water drawn
   * and the level depends on where and when, never on how frames fell.
   */
  const waterLevelSim = { x: 0, y: 0, z: 0 };
  function feedWaterLevels(x, z) {
    const bodies = (view && view.water) || [];
    if (typeof sim.e.sim_water_level !== 'function') {
      return;
    }
    bodies.forEach((w, k) => {
      if (!w.levelAt) {
        return;
      }
      const y = w.levelAt(x, z);
      if (y == null || !insideWater(w, x, z)) {
        return;
      }
      worldPosToSim(x, y, z, waterLevelSim);
      sim.e.sim_water_level(k, waterLevelSim.z);
      if (stepTrace.on) {
        stepTrace.water = traceHash(0x811c9dc5 | 0, waterLevelSim.z);
      }
    });
  }

  function raiseGroundFromState(st) {
    poseFromState(st, pProbe);
    if (view.setWaterClock) {
      view.setWaterClock(trafficMs(simTimeMs));
    }
    feedWaterLevels(pProbe.x, pProbe.z);
    const hy = floorHeight(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    worldPosToSim(pProbe.x, hy, pProbe.z, pSim);
    /* The slope's normal takes the spawn's turn out like any direction (on
     * its own the axis change turned a hillside into a roll on every map
     * whose spawn is not square to the world). A normal that comes out far
     * from unit length is a sampling fault, and the plant gets level ground. */
    const n = worldDirToSim(groundNWorld.x, groundNWorld.y, groundNWorld.z, nSim);
    const lenSq = n.x * n.x + n.y * n.y + n.z * n.z;
    if (lenSq > 0.97 && lenSq < 1.03) {
      const scale = 1 / Math.sqrt(lenSq);
      n.x *= scale;
      n.y *= scale;
      n.z *= scale;
    } else {
      n.x = 0;
      n.y = 0;
      n.z = 1;
    }
    const code = sim.e.sim_set_ground(1, n.x, n.y, n.z, pSim.x, pSim.y, pSim.z, GROUND_MU, GROUND_E);
    if (stepTrace.on) {
      let h = traceHash(0x811c9dc5 | 0, nSim.x);
      h = traceHash(traceHash(h, nSim.y), nSim.z);
      stepTrace.ground = traceHash(traceHash(traceHash(h, pSim.x), pSim.y), pSim.z);
    }
    if (runDamage) {
      declareGroundMaterial(pProbe.x, pProbe.z, hy);
    }
    return code;
  }

  /*
   * How far off the face a contact places the craft: the fixed gap, plus,
   * for a hull that starts the sweep already in the solid, whichever depth
   * the collider measured (hitPen for a centre through a face, hitOverlap
   * for a hull overlapping a face its centre is outside of, which is what a
   * rotation into a wall gives). Only the gap otherwise: the contact point
   * is the pose at first touch, already clear, and adding the frame's own
   * travel past the face once pushed slow machines five times further back
   * than fast ones.
   */
  function contactSeparation() {
    const col = view.colliders;
    let depth = 0;
    if (col.hitT <= 1e-6) {
      depth = col.hitPen > col.hitOverlap ? col.hitPen : col.hitOverlap;
    }
    return depth > 0 ? depth + BOUNCE_SEPARATION : BOUNCE_SEPARATION;
  }

  /*
   * Resolve one contact: put the craft on the free side of the face at the
   * contact point and have the plant apply the impulse there, its arm the
   * contact patch of the four discs (a quad) or the point the hull reports
   * (a fixed wing); see contactPatch in collide.js for why the arm is the
   * patch and not the hull corner. (vsx, vsy, vsz) is the surface's own
   * velocity in the plant frame, zero unless the solid moves.
   *
   * Answers the change in the centre of mass's velocity, m/s, so sound and
   * shake follow what happened; 0 when the module declined or refused.
   * passStats.code always ends as this contact's outcome, never an earlier
   * one's (the caller branches on it).
   *
   * The sign check is the one invariant left after the frame change: a face
   * normal opposes an inbound craft in any frame, so counting the sign
   * against the plant's own velocity (inbound/outbound in __contacts) is
   * how a normal turned the wrong way would show.
   */
  function resolveContactAt(nx, ny, nz, cx, cy, cz, e, mu, vsx, vsy, vsz) {
    const gap = contactSeparation();
    passStats.code = SIM_OK;
    const n = worldDirToSim(nx, ny, nz, nSim);
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    if (!(len > 1e-9)) {
      passStats.code = SIM_ERR_BAD_ARG;
      return 0;
    }
    const inv = 1 / len;
    const ux = n.x * inv;
    const uy = n.y * inv;
    const uz = n.z * inv;
    obsPlace.set(cx + nx * gap, cy + ny * gap, cz + nz * gap);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    const col = view.colliders;
    if (col.hitArm) {
      rPatch.x = col.hitArmX;
      rPatch.y = col.hitArmY;
      rPatch.z = col.hitArmZ;
    } else {
      contactPatch(nx, ny, nz, qObs.x, qObs.y, qObs.z, qObs.w, rPatch);
    }
    const arm = worldDirToSim(rPatch.x, rPatch.y, rPatch.z, rSim);
    const before = stateCurr;
    const approach = ux * before[4] + uy * before[5] + uz * before[6];
    if (approach > 0.05) {
      passStats.outbound += 1;
    } else if (approach < -0.05) {
      passStats.inbound += 1;
    }
    /* With crash damage on, the obstacle's material rides along where the
     * module's numbers for it are these ones; see THE CRASH SHELL. */
    const surf = obstacleSurfaceFor(obsKindIndex);
    if (runDamage) {
      plantMustHold(col, cx, cy, cz);
    }
    /* And which part the fixed wing's hull met, so the damage is that
     * part's and not whichever part stands furthest toward the solid. */
    if (runDamage && col.hitArm) {
      sim.e.sim_contact_part(col.hitPart);
    }
    const code = surf >= 0
      ? sim.e.sim_contact_at_mat(ux, uy, uz, surf, pSim.x, pSim.y, pSim.z, vsx, vsy, vsz, arm.x, arm.y, arm.z)
      : sim.e.sim_contact_at(ux, uy, uz, e, mu, pSim.x, pSim.y, pSim.z, vsx, vsy, vsz, arm.x, arm.y, arm.z);
    passStats.code = code;
    if (code !== SIM_OK) {
      return 0;
    }
    logContact(before, rSim);
    const after = readState();
    stateCurr = after;
    speedNow = Math.sqrt(after[4] * after[4] + after[5] * after[5] + after[6] * after[6]);
    const dx = after[4] - before[4];
    const dy = after[5] - before[5];
    const dz = after[6] - before[6];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* Move a buried hull onto the free side with no impulse: there is no
   * approach left to solve against, and an impulse stacked on a push out is
   * how a corner pumps energy into the craft. False if the module refused
   * the pose. */
  function separateAt(nx, ny, nz, cx, cy, cz) {
    const gap = contactSeparation();
    obsPlace.set(cx + nx * gap, cy + ny * gap, cz + nz * gap);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    const q = stateCurr;
    if (sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, q[7], q[8], q[9], q[10]) !== SIM_OK) {
      return false;
    }
    stateCurr = readState();
    return true;
  }

  /* Forget the craft was pressing itself onto a face. */
  function releasePress() {
    pressing = false;
    pressHeldMs = 0;
    pressIdleMs = 0;
  }
  /*
   * THE SOFT PIECES, FOR A PLANE (src/game/jelly.js): a pylon and a sky
   * hoop's rim are jelly to a fixed wing. The sweep and the crash world
   * pass through them (softKinds, set here for the aircraft seated) and
   * this pass, on the obstacle pass's own sim cadence, whacks the plane
   * instead: a speed loss into the piece and a kick on its rates, written
   * onto the plant, once per meeting. It re-arms once the plane is clear
   * of every soft piece by JELLY_REARM. The builder wobbles the piece
   * (buildmode.js jiggle). Returns the state, read again after a whack.
   */
  const JELLY_REARM = 2;
  const jellyA = new THREE.Vector3();
  const jellyB = new THREE.Vector3();
  const jellyQ = new THREE.Quaternion();
  const jellyV = new THREE.Vector3();
  const jellyRight = new THREE.Vector3();
  const jellyUp = new THREE.Vector3();
  const jellyVSim = { x: 0, y: 0, z: 0 };
  const jellyHit = { i: -1, gap: 0, n: null };
  function softKindsFor() {
    return airframeById(runAirframe).fixedWing ? JELLY_MASK : 0;
  }
  function jellyPass(st) {
    const col = view.colliders;
    if (col) {
      col.softKinds = softKindsFor();
    }
    if (!col || !col.softKinds || mode !== 'flight' || crashed || poseLock || launchStaging) {
      jellyHasPrev = false;
      return st;
    }
    poseFromState(st, jellyB);
    if (!jellyHasPrev) {
      jellyA.copy(jellyB);
      jellyHasPrev = true;
      return st;
    }
    const af = airframeById(runAirframe);
    const reach = REACH_OF_SPAN * 2 * (af.dims.arm + (af.dims.hullR ?? af.dims.propR));
    const i = jellyNear(col, jellyA, jellyB, reach + JELLY_REARM, jellyHit);
    jellyA.copy(jellyB);
    if (i < 0) {
      jellyArmed = true;
      return st;
    }
    if (!jellyArmed || jellyHit.gap > reach) {
      return st;
    }
    simPosToThree(st[4], st[5], st[6], jellyV).applyQuaternion(qSpawn);
    simQuatToThree(st[7], st[8], st[9], st[10], jellyQ);
    jellyQ.premultiply(qSpawn);
    jellyRight.set(1, 0, 0).applyQuaternion(jellyQ);
    jellyUp.set(0, 1, 0).applyQuaternion(jellyQ);
    const w = whack(jellyV, jellyHit.n, jellyRight, jellyUp);
    if (!w) {
      return st;
    }
    jellyArmed = false;
    worldDirToSim(w.v.x, w.v.y, w.v.z, jellyVSim);
    if (sim.e.sim_set_velocity(jellyVSim.x, jellyVSim.y, jellyVSim.z, st[11] + w.roll, st[12] + w.pitch, st[13]) !== SIM_OK) {
      throw new Error('sim_set_velocity refused a whack');
    }
    jellyLog.push({
      t: st[0], kind: col.kindName(col.fkind[i]), speed: jellyV.length(), after: Math.hypot(w.v.x, w.v.y, w.v.z),
      loss: w.loss, roll: w.roll, pitch: w.pitch, square: w.square,
    });
    if (jellyLog.length > 32) {
      jellyLog.shift();
    }
    if (build) {
      build.jiggle(i, jellyHit.n, w.square);
    }
    roomWhack(i, jellyHit.n, w.square);
    return readState();
  }

  /* `atMs` is the traffic's clock (trafficMs) at the end of the step just
   * taken, the clock the town's traffic runs on (view.updateAnim). */
  /*
   * THE OBSTACLE PASS: walls, poles, roofs, trees and gate members against
   * the plant's own pose, every OBSTACLE_STEP steps of sim time (so the
   * result is the same however the frames batched the steps; it once ran
   * per drawn frame on the interpolated pose, and the line a craft took off
   * a wall depended on the monitor's refresh rate).
   *
   * Collide and slide, up to four rounds (a corner is two faces, with room
   * to spare). Each round sweeps the hull from where it was to where it is
   * going; on a hit the craft is placed on the face and the plant applies
   * the impulse there, and whatever travel is left, minus its part into the
   * face, is swept again in the next round. Keeping that slide is what lets
   * a craft skate along a wall instead of sticking to it. A hull still in a
   * solid afterwards is left for the clip watch (obsLeftover, obsInterior).
   * Returns the state, read again whenever a contact changed it.
   */
  function obstacleContactPass(st, atMs) {
    obsResolved = false;
    obsKindIndex = -1;
    if (!view.colliders || mode !== 'flight' || crashed || poseLock || launchStaging) {
      obsHasPrev = false;
      releasePress();
      return st;
    }
    poseFromState(st, obsTo);
    simQuatToThree(st[7], st[8], st[9], st[10], qObs).premultiply(qSpawn);
    if (!obsHasPrev) {
      obsPrev.copy(obsTo);
      obsHasPrev = true;
      return st;
    }
    obsFrom.copy(obsPrev);
    /* The next pass starts from where this one began its sweep to, whatever
     * the contacts below do to the pose. */
    obsPrev.copy(obsTo);
    /* The moving boxes over this pass's own stretch of the clock, not
     * where the last drawn frame left them (life.js sweepSolids). A map
     * with moving boxes and no sweepSolids throws here, which it should:
     * its traffic would be met at frame times. */
    if (view.colliders.movingCount > 0) {
      view.sweepSolids(atMs - OBSTACLE_STEP, atMs);
    }
    /* A roof that is the craft's ground is its contact, not the walls
     * under it, which the swept hull would otherwise reach through the
     * shell (src/render/library/roofs.js). Same fromY as the ground plane. */
    if (view.cover) {
      view.cover(obsTo.x, obsTo.z, obsTo.y - SURFACE_BIAS);
    }

    upAxis.set(0, 1, 0).applyQuaternion(qObs);
    const halfHeight = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - upAxis.y * upAxis.y)));
    const sweep = slideThroughSolids(halfHeight);

    /* A slide that swept clear is the craft's own travel carried along the
     * face: commit it as a position, which invents no momentum. */
    const slid = obsTo.x !== obsFrom.x || obsTo.y !== obsFrom.y || obsTo.z !== obsFrom.z;
    if (sweep.clean && sweep.rounds > 0 && slid) {
      worldPosToSim(obsTo.x, obsTo.y, obsTo.z, pSim);
      const q = stateCurr;
      if (sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, q[7], q[8], q[9], q[10]) === SIM_OK) {
        stateCurr = readState();
      }
    }

    poseFromState(stateCurr, obsPrev);

    /* THE FOREST AS A VOLUME (docs/ITAIPU-PLAN.md section 9): a map that
     * answers canopyAt(x, z), the top of the canopy there or -Infinity,
     * has forest too dense to give every tree a collider, and a craft below
     * that top is in the trees whether or not a near tree was built there.
     * It is a contact as a collider's is, told to everything that listens
     * for one; it applies no impulse, because the volume has no face. */
    if (view.canopyAt && obsPrev.y < view.canopyAt(obsPrev.x, obsPrev.z)) {
      lastHitKind = 'canopy';
      lastHitIndex = -1;
      ui.progress.touch(lastHitKind);
      obsTouched = true;
    }

    noteStillInside(sweep);
    holdOrBleedPress(sweep.pressing);
    return stateCurr;
  }

  /*
   * THE SLIDE. One obstacle pass may meet more than one face (a corner is
   * two), so the hull is swept from obsFrom toward obsTo in rounds: each
   * round that meets a face resolves it, keeps the travel still owed along
   * that face, and sweeps that remainder next, so the slide cannot tunnel
   * through the second face either. Four rounds is a corner and then some;
   * a slide still meeting faces after that stops where it is.
   *
   * obstacleContactPass reads `clean` (the last round swept clear) and
   * `rounds` (how many rounds resolved a face) and hands the whole record
   * to noteStillInside and `pressing` to holdOrBleedPress. One record,
   * refilled every pass, because nothing keeps it past the pass.
   */
  const SLIDE_ROUNDS_MAX = 4;
  const slide = {
    clean: true,
    rounds: 0,
    pressing: false,
    /* Where the pass's whole travel began, and the first solid that
     * travel crossed outright (a punch through), if it crossed one. */
    startX: 0,
    startY: 0,
    startZ: 0,
    punched: false,
    punchSolid: -1,
    punchMoving: -1,
  };
  /*
   * The face a round met, copied off the collider set's hit scratch once it
   * is final: the set's next query overwrites that scratch, and the punch
   * test above it in the round is such a query.
   */
  const face = {
    solid: -1, index: -1, moving: -1, kind: '', nx: 0, ny: 0, nz: 0, t: 0, pen: 0, normalDot: 0,
  };
  /* Where on the swept segment the face was touched, and the travel owed
   * after the touch with its part into the face taken off. */
  const touchAt = { x: 0, y: 0, z: 0 };
  const owed = { x: 0, y: 0, z: 0 };

  function slideThroughSolids(halfHeight) {
    const col = view.colliders;
    const endX = obsTo.x;
    const endY = obsTo.y;
    const endZ = obsTo.z;
    slide.clean = true;
    slide.rounds = 0;
    slide.pressing = false;
    slide.startX = obsFrom.x;
    slide.startY = obsFrom.y;
    slide.startZ = obsFrom.z;
    slide.punched = false;
    while (slide.rounds < SLIDE_ROUNDS_MAX) {
      const solid = col.hit(
        obsFrom.x, obsFrom.y, obsFrom.z,
        obsTo.x, obsTo.y, obsTo.z,
        halfHeight, qObs.x, qObs.y, qObs.z, qObs.w,
        craftVerticalOffset(),
      );
      slide.clean = solid < 0;
      if (slide.clean) {
        return slide;
      }
      if (!slide.punched && col.crossedHit(slide.startX, slide.startY, slide.startZ, endX, endY, endZ)) {
        slide.punched = true;
        slide.punchSolid = col.hitIndex;
        slide.punchMoving = col.hitMoving;
      }
      readFace(col, solid);
      if (!resolveFace()) {
        return slide;
      }
      slide.rounds += 1;
    }
    return slide;
  }

  function readFace(col, solid) {
    face.solid = solid;
    face.index = col.hitIndex;
    face.moving = col.hitMoving;
    face.kind = col.kindName(solid);
    face.nx = col.hitNx;
    face.ny = col.hitNy;
    face.nz = col.hitNz;
    face.t = col.hitT;
    face.pen = col.hitPen;
    face.normalDot = col.hitNormalDot;
  }

  /* Clamped to [0, 1] with a NaN left as it is, so a bad hit poisons the
   * pose loudly rather than resolving at an invented point. */
  const unitClamp = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));

  /*
   * Everything the shell remembers about a face met (the contact HUD, the
   * crash and roof decisions, the progress touch), then the contact itself.
   * Answers whether the slide goes on to another round.
   */
  function resolveFace() {
    const { nx, ny, nz } = face;
    if (ny > 0.5) {
      obsRoof = true;
    }
    /* The rotors driven into the face count even when the craft already
     * rests on it with no approach left, which is the case they exist for. */
    if (thrustIntoFace(nx, ny, nz, upAxis.x, upAxis.y, upAxis.z)) {
      slide.pressing = true;
    }
    lastHitKind = face.kind;
    lastHitIndex = face.index;
    ui.progress.touch(face.kind);
    obsTouched = true;
    lastClosing = speedNow * face.normalDot;
    if (Math.abs(lastClosing) > obsClosing) {
      obsClosing = Math.abs(lastClosing);
    }
    lastUpDot = Math.abs(nx * upAxis.x + ny * upAxis.y + nz * upAxis.z);

    const t = unitClamp(face.t);
    touchAt.x = obsFrom.x + (obsTo.x - obsFrom.x) * t;
    touchAt.y = obsFrom.y + (obsTo.y - obsFrom.y) * t;
    touchAt.z = obsFrom.z + (obsTo.z - obsFrom.z) * t;

    /* Already inside at the start of the round: no approach to resolve,
     * only a way out, after which the round is swept again from there. */
    if (face.t <= 1e-6 && face.pen > 0.05) {
      passStats.buried += 1;
      if (!separateAt(nx, ny, nz, touchAt.x, touchAt.y, touchAt.z)) {
        passStats.sepFail += 1;
        return false;
      }
      poseFromState(stateCurr, obsFrom);
      obsTo.copy(obsFrom);
      return true;
    }

    const mat = contactMaterial(face.kind);
    obsKindIndex = face.solid;
    const surface = surfaceVelocity(face.moving);
    owed.x = (obsTo.x - obsFrom.x) * (1 - t);
    owed.y = (obsTo.y - obsFrom.y) * (1 - t);
    owed.z = (obsTo.z - obsFrom.z) * (1 - t);
    const inward = owed.x * nx + owed.y * ny + owed.z * nz;
    if (inward < 0) {
      owed.x -= nx * inward;
      owed.y -= ny * inward;
      owed.z -= nz * inward;
    }

    const dv = resolveContactAt(nx, ny, nz, touchAt.x, touchAt.y, touchAt.z, mat.e, mat.mu, surface.x, surface.y, surface.z);
    const pushed = dv > 0;
    if (!pushed) {
      passStats.kind = face.kind;
      passStats.e = mat.e;
      passStats.mu = mat.mu;
      /* The module refused the contact. Sweeping on from a state it could
       * not express is how a corner pumps energy into a craft. */
      if (passStats.code !== SIM_OK) {
        passStats.dvZero += 1;
        return false;
      }
    }
    obsContact = true;
    obsResolved = true;
    poseFromState(stateCurr, obsFrom);
    if (pushed) {
      passStats.resolved += 1;
      if (dv > obsImpulse) {
        obsImpulse = dv;
        obsImpulseKind = face.kind;
      }
    } else {
      /* Declined: a hull sliding along a face with its approach spent. The
       * owed travel still has to be carried or the craft sticks to the wall,
       * but with none owed the slide stops, since every contact call sets
       * the craft a gap off the face and going round again on nothing would
       * walk it away from the wall. */
      passStats.resting += 1;
      if (owed.x * owed.x + owed.y * owed.y + owed.z * owed.z <= 1e-12) {
        obsTo.copy(obsFrom);
        return false;
      }
    }
    obsTo.set(obsFrom.x + owed.x, obsFrom.y + owed.y, obsFrom.z + owed.z);
    return true;
  }

  /*
   * A moving solid's surface velocity in the plant frame (a car, a
   * gondola), zero for a fixed one. Its centre's change over the pass that
   * swept it, so over OBSTACLE_STEP and never a frame. A change faster than
   * SURFACE_SPEED_MAX is a respawn or a wrap, not motion: zero then too.
   */
  function surfaceVelocity(moving) {
    vsSim.x = 0;
    vsSim.y = 0;
    vsSim.z = 0;
    if (moving < 0) {
      return vsSim;
    }
    const col = view.colliders;
    const passS = OBSTACLE_STEP * 0.001;
    const vx = (col.movingCx[moving] - col.movingPx[moving]) / passS;
    const vy = (col.movingCy[moving] - col.movingPy[moving]) / passS;
    const vz = (col.movingCz[moving] - col.movingPz[moving]) / passS;
    if (vx * vx + vy * vy + vz * vz <= SURFACE_SPEED_MAX * SURFACE_SPEED_MAX) {
      worldDirToSim(vx, vy, vz, vsSim);
    }
    return vsSim;
  }

  /*
   * The clip watch's inputs once the slide is done: whether the hull ended
   * the pass inside a solid and how deep, kept as the frame's worst. A
   * punch through (the pass's whole travel crossing a solid it started
   * outside) is deep wherever the slide put the craft, as long as that
   * solid still stands between the start and where the craft is now.
   */
  function noteStillInside(done) {
    const col = view.colliders;
    if (!done.clean) {
      obsLeftover = true;
    }
    if (obsLeftover) {
      const depth = col.interiorOfHit(obsPrev.x, obsPrev.y, obsPrev.z);
      if (depth > obsInterior) {
        obsInterior = depth;
      }
      /* The face that query found, when the craft is not really in it, is
       * a roof it sits on if it faces up. */
      if (!(depth > CLIP_CENTER_EPS) && col.hitNy > 0.5) {
        obsRoof = true;
      }
    }
    if (!done.punched) {
      return;
    }
    const still = done.punchMoving >= 0
      ? col.crossedMoving(done.punchMoving, done.startX, done.startY, done.startZ, obsPrev.x, obsPrev.y, obsPrev.z)
      : col.crossedStatic(done.punchSolid, done.startX, done.startY, done.startZ, obsPrev.x, obsPrev.y, obsPrev.z);
    if (!still) {
      return;
    }
    obsLeftover = true;
    if (!(obsInterior >= CLIP_DEEP)) {
      obsInterior = CLIP_DEEP;
    }
  }

  /*
   * Rotors against a face move no air, so the thrust that would hold a
   * craft pinned there is not real (PRESS_UP_DOT in collide.js has the
   * argument). A press that lasts PRESS_CONFIRM_MS has the plant bleed the
   * rotors every pass after (sim_prop_strike) until the craft drops off;
   * PRESS_RELEASE_MS clear of any face ends it (releasePress). Never during
   * Betaflight's crashflip, which works by driving rotors into the ground.
   * One call per obstacle pass, so every count is in OBSTACLE_STEP.
   */
  function holdOrBleedPress(pressedNow) {
    if (pressedNow) {
      pressing = true;
      pressIdleMs = 0;
    } else if (pressing) {
      pressIdleMs += OBSTACLE_STEP;
      if (pressIdleMs > PRESS_RELEASE_MS) {
        releasePress();
        return;
      }
    } else {
      return;
    }
    pressHeldMs += OBSTACLE_STEP;
    const confirmed = pressHeldMs >= PRESS_CONFIRM_MS;
    if (!confirmed || sim.e.sim_crashflip_active() || typeof sim.e.sim_prop_strike !== 'function') {
      return;
    }
    sim.e.sim_prop_strike(PRESS_BLEED);
    stateCurr = readState();
  }

  /* The title screen's camera move is the current map's to choose (each
   * world shows itself off its own way), so it is made from the view and
   * made again on every swap. */
  let attractCam = makeAttractCamera(view);
  applySettings(ui.settings);

  /* A radio picker asked for before boot finished is opened now. */
  const queuedPadPick = input.takePadPickQueue();
  if (queuedPadPick) {
    openPadPick(queuedPadPick);
  }

  /* Each map starts somewhere else, so the spawn is adopted per map, and it
   * must be before the first reset, which seats the craft on the spawn's
   * ground. The ghost picker hears about the boot course here, since the
   * boot course does not come through adoptLoadedView. */
  adoptSpawn();
  reset();
  ghostCourseChanged();

  let prevWall = performance.now();
  /* The last frame's wall interval, ms, before FRAME_DT_MAX caps it. */
  let lastWallDt = 0;
  /* The harness's parked camera (window.__setCam): eye x y z, target
   * x y z, and an optional lens, or null when the shell owns the camera. */
  let camOverride = null;
  const camLookAt = new THREE.Vector3();

  /*
   * THE TARGET MARK: the next gate's bracket when it is in frame, a chevron
   * on the frame's rim pointing at it when it is not (index.html .lock,
   * drawn by ui.setTargetLock). The view decides which gate and from which
   * side, the same call that colours the gate; the shell only projects it,
   * because the canvas is the shell's.
   *
   * The mark keeps clear of the OSD: in from the sides by `side`, below the
   * lap clock stack by `top`, and above whatever owns the bottom band. That
   * is the two corner instruments for a radio pilot (`bottom`), and the
   * stick ghost or the touch sticks for anyone else, which stand taller
   * (`bottomSticks`: the plate's 18 px offset, its 88 px clamp ceiling, a
   * caption and the same 8 px of air). A gate below the frame is every
   * climb and every takeoff, so the band is where the chevron goes most.
   */
  const MARK_INSET = {
    side: 54, top: 100, bottom: 108, bottomSticks: 130,
  };
  /* Range, m, over which the in-frame mark fades out as the pilot closes:
   * at 13 m a 1.75 m opening is a tenth of the frame and a bracket still
   * says something, at 6 m it is a fifth and a bracket is clutter. A mark
   * on the rim never fades, since that is when the range matters most. */
  const MARK_FADE_FROM = 13;
  const MARK_FADE_TO = 6;
  /* The bracket stands this far outside the opening so the ring the pilot
   * aims through stays visible, and never smaller than MARK_MIN_PX or
   * taller than MARK_MAX_SHARE of the frame. */
  const MARK_BRACKET = 1.45;
  const MARK_MIN_PX = 34;
  const MARK_MAX_SHARE = 0.62;
  const markNdc = new THREE.Vector3();
  const markFwd = new THREE.Vector3();
  const markRel = new THREE.Vector3();
  const LOCK_OFF = { show: false };
  /* Refilled every frame: the mark is up for a whole race and must not
   * allocate. */
  const markOut = {
    show: true, x: 0, y: 0, size: 0, angle: 0, edge: false, wrong: false, distance: 0, fade: 1,
  };

  function updateTargetLock() {
    const aim = crashflipOn || turtleRecover || !view.targetAim ? null : view.targetAim();
    ui.setTargetLock(aim && aim.active && placeTargetMark(aim) ? markOut : LOCK_OFF);
  }

  /*
   * Fill markOut for `aim`, in CSS pixels (the mark is a DOM layer, and the
   * drawing buffer differs from the layout size on any high density
   * display). False when there is nothing to draw.
   */
  function placeTargetMark(aim) {
    const canvas = shell.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) {
      return false;
    }
    const cam = shell.camera;
    const midX = w * 0.5;
    const midY = h * 0.5;
    markNdc.copy(aim.centre).project(cam);
    /*
     * A point behind the lens projects through a negative w, which mirrors
     * it through the frame's centre to a place that looks believable. The
     * mirror undone gives its true bearing, and it is then thrown well past
     * the rim so it always reads as a chevron. Dead behind has no bearing
     * at all; that one points up, since either way round will do.
     */
    const behind = Math.abs(markNdc.z) >= 1;
    const flip = behind ? -1 : 1;
    let px = (flip * markNdc.x * 0.5 + 0.5) * w;
    let py = (0.5 - flip * markNdc.y * 0.5) * h;
    if (behind) {
      const len = Math.hypot(px - midX, py - midY);
      if (len > 1) {
        px = midX + ((px - midX) * w) / len;
        py = midY + ((py - midY) * w) / len;
      } else {
        px = midX;
        py = midY - h;
      }
    }
    const sticksUp = input.isKeyboardPrimary() || input.isTouchPrimary() || input.isMousePrimary();
    const left = MARK_INSET.side;
    const right = w - MARK_INSET.side;
    const top = MARK_INSET.top;
    const bottom = h - (sticksUp ? MARK_INSET.bottomSticks : MARK_INSET.bottom);
    const edge = behind || px < left || px > right || py < top || py > bottom;
    /* A flag or a cone is lit on its own pole; the in-frame bracket would
     * be the scoring square the owner asked not to see. Off frame the
     * chevron still points the way. */
    if (aim.virtual && !edge) {
      return false;
    }
    const fade = edge
      ? 1
      : THREE.MathUtils.clamp((aim.distance - MARK_FADE_TO) / (MARK_FADE_FROM - MARK_FADE_TO), 0, 1);
    if (fade < 0.02) {
      return false;
    }
    /* Sized by the depth along the lens rather than the straight range,
     * because that is what a projection scales with: off axis the range
     * would overstate the opening by up to half again. */
    markFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const depth = markRel.subVectors(aim.centre, cam.position).dot(markFwd);
    const focal = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const opening = depth > 0.2 ? (focal * aim.clearH * MARK_BRACKET) / depth : 0;
    markOut.edge = edge;
    markOut.wrong = !aim.correct;
    markOut.distance = aim.distance;
    markOut.fade = fade;
    markOut.size = Math.max(MARK_MIN_PX, Math.min(h * MARK_MAX_SHARE, opening));
    markOut.x = Math.min(right, Math.max(left, px));
    markOut.y = Math.min(bottom, Math.max(top, py));
    /* Degrees clockwise from up, the way the chevron is drawn. */
    markOut.angle = edge ? THREE.MathUtils.radToDeg(Math.atan2(px - midX, midY - py)) : 0;
    return true;
  }

  /*
   * The town's clock. Everything that moves in a world and can be hit is a
   * closed form of a whole number of 1 ms steps. In a run that number is
   * simTimeMs, so a crossing boom meets a recorded flight at the same step
   * at any frame rate. The title does not step the plant but should not
   * show a frozen town, so it keeps its own count off the same 1 ms
   * accumulator; nothing can collide there.
   */
  let titleAcc = 0;
  let titleStepMs = 0;
  /* The clock the last drawn frame's world was animated at. */
  let animDrawnMs = 0;
  /* When the frame cap last allowed a draw (wall ms). */
  let capLastDraw = -1e9;

  /*
   * The Avionics HUD's systems in their order (docs/AVIONICS-HUD.md): the
   * sensor, perception over the war's attackers, the tracks, the state,
   * then the renderer. After the render, so the camera is where this
   * frame drew from. Nothing here reaches the plant.
   */
  function avionicsFrame(want, paused, nowWall, dtS) {
    const truth = avxTruth;
    avxTruth = AVX_NO_TRUTH;
    if (!want) {
      avionicsHud.tick(false, paused, nowWall, null);
      return;
    }
    const tS = telemetry.state.tS;
    if (tS < avxLastT) {
      perception.reset();
      tracks.reset();
    }
    avxLastT = tS;
    if (!paused) {
      avxVideo.snow = fpvFail.level(nowWall).snow;
      avxVideo.lost = fpvFail.deadSince() >= 0;
      let motorC = -Infinity;
      for (const m of telemetry.state.motors) {
        motorC = Math.max(motorC, m.tempC);
      }
      sensors.setMotorTemp(motorC);
      sensors.update(tS, dtS, avxVideo);
      avxEnv.light = roomWar.night() ? 0.05 : 1;
      perception.update(tS, sensors.state, truth, avxOwn, avxEnv);
      tracks.update(tS, perception.detections, avxOwn);
    }
    hudStateOf(telemetry.state, sensors.state, tracks.snapshot, avxHud.ai, avxHud);
    avionicsHud.tick(true, paused, nowWall, {
      tel: telemetry.state,
      sensor: sensors.state,
      sensors,
      snap: tracks.snapshot,
      hud: avxHud,
      camera: shell.camera,
      radar: roomWar.live() && mode === 'flight',
      fuze: avxFuzeOn(tracks.snapshot),
    });
  }

  /*
   * THE FRAME LOOP.
   *
   * One frame is a fixed sequence of phases, each a function below, run in
   * this order by frameBody: open the frame (wall clock, counters), read
   * the pilot, advance the plant on the accumulator, compose the drawn
   * pose, read back what the solid world did, run the race, dress the
   * world, place the lens, pick the camera, move the scenery, draw, feed
   * the mix, feed the HUD, settle the banner, close the frame. The phases
   * hand each other one record, `fr`, written once per frame and never
   * reallocated (P8: the loop allocates nothing).
   *
   * Only advancePlant touches the integrator, and only through the
   * accumulator: the wall delta is read once in openFrame, capped there,
   * and reaches the plant as whole steps. Everything after advancePlant
   * reads the two most recent states and the sim clock.
   */
  const fr = {
    wall: 0, dt: 0, blockStart: 0, launch: 0, samples: null, parked: false,
    steps: 0, faulted: false,
    /* The hardest ground contact across this frame's steps. */
    groundClosing: 0, groundSpeed: 0, groundHit: false,
    /* The frame's interpolation weight and the sim clock it reads at. */
    a: 0, simNow: 0, simStepMs: 0,
    /* What the solid world reported, read once per frame in readContacts. */
    leftover: false, interior: 0, roof: false,
    /* Screen state the later phases share. */
    worldLive: false, attractOn: false, pickerOn: false, walkOn: false, studioOn: false,
    drawThis: false, renderMs: 0, capHz: 0, watching: null, motorsTurning: false,
  };

  /*
   * The loop schedules its next frame before doing anything, so a slow
   * frame never stalls it, and it runs the body inside one catch, so a
   * frame that throws does not either. Without the catch a fault that
   * repeats every frame (readState on a bad state code, sim_set_pose from
   * the turtle or clip paths, a height query on a half disposed map)
   * leaves the last picture up forever with a stale OSD and no word why.
   * The first fault is put to the pilot on the banner and kept in
   * window.__frameFault for the F8 report, the one path that carries it
   * off the machine; the loop runs on, because the camera, the menus and
   * that report all live in it. frameFault is declared beside reset(),
   * which clears it, since a `let` here would be in its dead zone for
   * every boot line above that can reach reset().
   */
  function frame(nowWall) {
    requestAnimationFrame(frame);
    try {
      frameBody(nowWall);
    } catch (e) {
      if (!frameFault) {
        frameFault = e;
        const message = (e && e.message) ? e.message : String(e);
        /* The bug report is the one path that carries a fault off this
         * machine, so the first one is kept for it. */
        window.__frameFault = { message, stack: e && e.stack ? String(e.stack) : '', atMs: Math.round(performance.now()) };
        console.error('frame fault', e);
        try {
          ui.setBanner(str('main.the_simulator_hit_a_fault_and', { message }), true);
        } catch (inner) {
          /* The shell itself broke; there is nothing left to say it with. */
        }
      }
      /* The clock keeps moving through a fault, or the frame after a reset
       * would step the plant by the time the pilot spent reading the banner. */
      prevWall = nowWall;
    }
  }

  function frameBody(nowWall) {
    if (!openFrame(nowWall)) {
      return;
    }
    readPilot();
    advancePlant();
    composePose();
    readContacts();
    raceFrame();
    dressWorld();
    placeLens();
    pickCamera();
    moveScenery();
    drawFrame();
    mixFrame();
    hudFrame();
    bannerFrame();
    closeFrame();
  }

  /*
   * The wall clock, read once. Mid swap nothing runs and the elapsed time
   * is dropped rather than carried into the new world's first frame.
   */
  function openFrame(nowWall) {
    applyResizeIfDirty();
    if (!mapReady) {
      prevWall = nowWall;
      lobbyPanelFrame(nowWall);
      return false;
    }
    dressCraft();
    alignTraffic();
    fr.blockStart = performance.now();
    fr.wall = nowWall;
    lastWallDt = nowWall - prevWall;
    fr.dt = Math.min(lastWallDt, FRAME_DT_MAX);
    prevWall = nowWall;
    roomPoseMap = null;
    fps = fps * 0.95 + (fr.dt > 0 ? 1000 / fr.dt : 0) * 0.05;
    fr.steps = 0;
    fr.faulted = false;
    /* The site's counters read state this loop already has; nothing they
     * do reaches the integrator. A minute spent inverted waiting to be
     * righted is not a minute of flying. */
    flightStats.tick(nowWall, {
      started: flownThisRun,
      flying: flownThisRun && !landed && !crashed && !wrecked && !turtleWait && !turtleRecover,
      laps: race.laps.length,
    });
    /* The pilot's own flight time is written when enough is held, or when
     * the last frame's steps were not flight; advancePlant sets the flag
     * again for this frame. */
    if (flightClock.held() >= FLIGHT_COMMIT_MS || (!flightClockFlew && flightClock.held() >= 1000)) {
      commitFlightTime();
    }
    flightClockFlew = false;
    /* The seated world's note is released on the first frame of a flight
     * and not one frame earlier (showCourseNotes). */
    if (heldNotes && ui.screen === 'flight') {
      notice = { text: heldNotes, untilMs: nowWall + 5600 };
      heldNotes = null;
    }
    return true;
  }

  /*
   * The pilot: the sticks, the pad's buttons, the keys that act every
   * frame, and the ground handling that reads the throttle (a perched craft
   * leaving the ground, a turtle being righted).
   */
  function readPilot() {
    const nowWall = fr.wall;
    input.poll(nowWall);
    /* A gamepad's swap buttons act in flight only, and not while the
     * builder is building on the same screen, where Y carries a gate. */
    if (ui.screen === 'flight' && mode !== 'replay' && !(build && build.cameraLive)) {
      ui.pollFlightPad(input.padSwapButtons());
    }
    if (worldHold && mode === 'title') {
      releaseWorldHold();
    }
    pollManualFlip();
    fr.launch = syncLaunchControl(nowWall);
    tickAirStart(fr.dt, nowWall);
    input.forcePadRest = launchStaging;
    syncAngleMode();
    const samples = input.drain();
    fr.samples = samples;
    for (const smp of samples) {
      rcPending.push(smp);
    }
    const newest = samples.length ? samples[samples.length - 1] : input.channels;
    /* Recover must see a centred stick even while perched: sim.input does
     * not run when landed, and the banner would otherwise never clear. */
    if (turtleRecover && !turtleWait && !turtleFlip.active) {
      turtleHoldStick(newest.roll, newest.pitch);
    }
    const inFlight = mode === 'flight' && !crashed && !wrecked && stateCurr && !turtleFlip.active;
    const slowAndInverted = stateCurr
      && plantUpZ(stateCurr) < TURTLE_INVERT_UPZ
      && plantSpeed(stateCurr) < TURTLE_SPEED
      && plantRateMag(stateCurr) < TURTLE_RATE;
    if (inFlight && (turtleWait || slowAndInverted)) {
      pollTurtleSupport();
    } else if (!turtleWait && !turtleFlip.active) {
      turtleOnSupport = false;
    }
    if (inFlight && !poseLock && !turtleWait) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    /* A sample taken while the integrator is not running has no RC slot
     * to land in (the title, a pause, a perch, a turtle wait): keep the
     * newest so the first flying frame starts where the sticks are, and
     * drop the rest, or the queue grows for as long as the page is open. */
    fr.parked = isTurtleParked();
    if (mode === 'flight' && !poseLock) {
      setTurtleParkMotors(fr.parked || turtleRecover);
    }
    const stepping = mode === 'flight' && !landed && !fr.parked && !crashed;
    if (!stepping && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }
    /* Every way onto the ground is a landing and gets the spawn's throttle
     * hold, which a perch has already satisfied. */
    if (landed && !landedWas) {
      input.holdThrottleLow(TAKEOFF_RELEASE);
    }
    landedWas = landed;
    if (mode === 'flight' && landed && !crashed && !wrecked) {
      leaveGround(newest.throttle, nowWall);
    }
  }

  /*
   * A perched craft and the throttle. Floats never park; wheels roll; a
   * wing is thrown; props down is not a takeoff, it is a turtle; otherwise
   * the craft lifts off and the RC grid, which rode the frozen sim clock,
   * is re-pinned where it already is.
   */
  function leaveGround(throttle, nowWall) {
    if (floatsOnWater()) {
      releaseOnWheels();
      return;
    }
    if (!(throttle > TAKEOFF_THROTTLE) || raceHoldMs > 0) {
      return;
    }
    const af = airframeById(runAirframe);
    if (af.gear) {
      releaseOnWheels();
      return;
    }
    if (af.fixedWing) {
      throwWing();
      return;
    }
    if (turtleRecover) {
      /* Recover owns the stick: throttle is not takeoff until they centre. */
      return;
    }
    landed = false;
    flownThisRun = true;
    if (stateCurr && plantUpZ(stateCurr) < 0) {
      takingOff = false;
      adoptSimClock();
      tryEnterTurtle(stateCurr, turtleInContact() || sim.e.sim_ground_contacts() > 0);
      return;
    }
    takingOff = true;
    takeoffUntil = nowWall + TAKEOFF_WINDOW_MS;
    adoptSimClock();
    groundCue('takeoff', nowWall);
  }

  /* One ground cue per GROUND_CUE_GAP_MS, whichever way the ground was met. */
  function groundCue(name, nowWall) {
    if (typeof audio.event === 'function' && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
      groundCueAtWall = nowWall;
      audio.event(name);
    }
  }

  /*
   * The accumulator. Wall time becomes whole plant steps here and nowhere
   * else; the fraction carries to the next frame. dt is already capped at
   * FRAME_DT_MAX, so a block never asks for more than 100 steps.
   */
  function takeSteps() {
    acc += fr.dt;
    const steps = Math.floor(acc / MS_PER_STEP);
    acc -= steps * MS_PER_STEP;
    return steps;
  }

  /*
   * The plant, by state. A crash holds the glitch pose on the accumulator
   * so Crashed can be read; a turtle wait or flip freezes the plant and
   * runs the lap clock; a perch is rest, so the plant is not advanced and
   * the recogniser idles on the clock; flight steps the plant.
   */
  function advancePlant() {
    const nowWall = fr.wall;
    if (mode !== 'flight') {
      return;
    }
    if (crashed && nowWall >= clipCrashUntil) {
      finishClipCrash();
    }
    if (crashed) {
      takeSteps();
      return;
    }
    if (ui.screen === 'flight' && fr.parked && !poseLock) {
      stepTurtleFrozen(fr.dt);
      return;
    }
    if (landed || poseLock) {
      if (landed) {
        const steps = takeSteps();
        simTimeMs += steps * MS_PER_STEP;
        /* The scorer ticks on simTimeMs and measures its combo window from
         * the recogniser's clock, so the two have to advance together even
         * while no motion is read. */
        trickDetector.idle(steps * MS_PER_STEP);
        adoptSimClock();
        statePrev = stateCurr;
      }
      return;
    }
    /* The module is the source of truth: if sim_init ran and the shell's
     * step count was left behind, snap to step_index rather than stamping
     * samples into the future. */
    const moduleIdx = Math.round(readState()[0] * SIM_HZ);
    if (simStepIdx !== moduleIdx) {
      resyncToModule(moduleIdx);
      return;
    }
    scoring = view.mode === 'freestyle' && !crashed;
    fr.groundClosing = 0;
    fr.groundSpeed = 0;
    fr.groundHit = false;
    const steps = takeSteps();
    stampSticks((simStepIdx + steps) * MS_PER_STEP, nowWall);
    if (steps >= 1) {
      if (launchStaging) {
        stepOnStand(steps, nowWall);
      } else {
        stepInAir(steps, nowWall);
      }
      simTimeMs += steps * MS_PER_STEP;
      if (!fr.faulted) {
        simStepIdx += steps;
      }
      fr.steps = steps;
      flightClockFlew = stepsAreFlight({
        mode, screen: ui.screen, landed, launchStaging, faulted: fr.faulted, crashed, wrecked, turtleWait, turtleRecover,
      });
      flightClock.note(steps * MS_PER_STEP, {
        airborne: flightClockFlew, airframe: runAirframe, activity: flightActivity(),
      });
      flightLog.push(stateCurr, rcHeld, FULL_THROTTLE_RPM);
    }
    judgeGround(nowWall);
  }

  function resyncToModule(moduleIdx) {
    acc = 0;
    simStepIdx = moduleIdx;
    pinRcGrid();
    takingOff = false;
    turtleRecover = false;
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    landed = !(plantUpZ(stateCurr) < 0);
    setCrashflip(false);
  }

  /*
   * THE RC GRID. The sticks are polled at whatever rate the display runs,
   * the radio does not, and the controller's feedforward and smoothing read
   * the frame interval, so the samples are resampled onto a fixed grid of
   * RC frames up to the end of the block about to be stepped. A slot takes
   * the newest sample whose moment has arrived and holds the last one,
   * which is the receiver holding its last frame: a lost packet needs no
   * handling of its own.
   *
   * Wall to sim: a sample taken (wall - wallT) ms ago belongs that many ms
   * before the block's end, re-derived every frame so the mapping corrects
   * itself across the freezes where the two clocks part. Low latency
   * (Settings, Stick latency) lines the newest reading up with the block's
   * last slot instead of the block's end, so it is in the block it is drawn
   * from (scripts/perf-latency.js measured the frame it saved); it is the
   * same stream re-timed by one RC frame, so a recording replays unchanged.
   *
   * No radio is its own path and not a perfect link routed through the
   * link, so the default, and every recording made under it, is exactly the
   * code that produced them. A radio owns the slot clock while it runs and
   * hands back packets in arrival order with delay and jitter applied;
   * jitter can reorder two neighbours and sim_input wants non decreasing
   * stamps, so a packet behind the last stamp is dropped.
   */
  function stampSticks(blockEndSim, nowWall) {
    const lead = ui.settings.latencyMode === 'low'
      ? (rcLink.isPerfect() ? 1000 / RC_HZ : rcLink.periodMs)
      : 0;
    const wallToSim = lead > 0 ? blockEndSim - lead - input.lastWall : blockEndSim - nowWall;
    const pickAt = (atMs) => {
      while (rcPending.length > 0 && rcPending[0].wallT + wallToSim <= atMs) {
        rcHeld = rcPending.shift();
      }
      return rcHeld;
    };
    const feed = (tMs, rc) => {
      const ts = tMs / 1000;
      lastTs = ts;
      const ax = applyTurtleRc(rc.roll, rc.pitch);
      traceInput(ts, ax[0], ax[1], rc.yaw, rc.throttle);
      if (sortie) {
        sortieSticks(ts, rc.throttle);
      }
      return sim.input(ts, ax[0], ax[1], rc.yaw, rc.throttle) === SIM_OK;
    };
    if (rcLink.isPerfect()) {
      const period = 1000 / RC_HZ;
      while (rcNextMs < blockEndSim) {
        if (!feed(rcNextMs, pickAt(rcNextMs))) {
          adoptSimClock();
          return;
        }
        rcNextMs += period;
      }
      return;
    }
    for (const pkt of rcLink.pump(blockEndSim, pickAt)) {
      if (pkt.tMs / 1000 < lastTs) {
        continue;
      }
      if (!feed(pkt.tMs, pkt.rc)) {
        adoptSimClock();
        break;
      }
    }
    rcNextMs = rcLink.nextMs;
  }

  /*
   * On the launch stand the plant is stepped against level ground in one
   * batch and judged at the block's end like any other block: a bad state
   * wrecks the craft where the block began (plantFault), props down ends
   * the staging.
   */
  function stepOnStand(steps, nowWall) {
    const sound = stateCurr;
    sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0);
    if (steps > 1) {
      sim.step(steps - 1);
      statePrev = readState();
    } else {
      statePrev = stateCurr;
    }
    sim.step(1);
    stateCurr = readState();
    const bad = plantStateSound(statePrev) ? (plantStateSound(stateCurr) ? null : stateCurr) : statePrev;
    if (bad) {
      plantFault(bad, sound, nowWall);
      fr.faulted = true;
    } else if (plantUpZ(stateCurr) < 0) {
      endLaunchStaging(false);
      takingOff = false;
    }
  }

  /*
   * Flight: one step at a time, because between two steps the shell has
   * work of its own on the plant's state. Before a step the ground under
   * the craft is raised into it and the damage model looks; after it the
   * state is judged, the room and the combat see it, the obstacle pass
   * resolves the solids every OBSTACLE_STEP ms, and the recogniser is fed.
   *
   * Inbound closing is sampled BEFORE the step: ground contact runs inside
   * it, so by the step's end the hull has bounced and vz points up, and a
   * real hit read at the end never announced.
   */
  function stepInAir(steps, nowWall) {
    let st = stateCurr;
    roomPoseFrame(nowWall, lastWallDt, fr.dt);
    for (let i = 0; i < steps; i += 1) {
      st = roomMidairStep(st);
      if (groundNormalDue(st)) {
        sampleGroundNormalFromState(st);
      }
      const vzBefore = st[6];
      const speedBefore = plantSpeed(st);
      raiseGroundFromState(st);
      if (runDamage) {
        crashBeforeStep(st);
      }
      tracePre(st);
      if (weather) {
        pushWeather(st);
      }
      const sound = st;
      sim.step(1);
      st = readState();
      if (!plantStateSound(st)) {
        plantFault(st, sound, nowWall);
        st = stateCurr;
        fr.faulted = true;
        break;
      }
      roomPoseStep(st, (steps - 1 - i) * MS_PER_STEP);
      if (roomCombat.out()) {
        combatStep(st);
      }
      if (runDamage) {
        crashAfterStep(st);
      } else {
        /* Without crash physics the shell's own contact pass resolves every
         * hit, and the trace records what it handed over. */
        tracePost(st);
      }
      logObstacleStep(st);
      if (scoring) {
        feedRecogniser(st);
      }
      obsPhase += 1;
      if (obsPhase >= OBSTACLE_STEP) {
        obsPhase = 0;
        st = jellyPass(st);
        stateCurr = st;
        st = obstacleContactPass(st, trafficMs(simTimeMs + (i + 1) * MS_PER_STEP));
        if (obsResolved) {
          /* The pose moved under the interpolator: collapse it rather than
           * lerp the craft back through the wall it was taken out of. */
          statePrev = st;
        }
      }
      if (i === steps - 2) {
        statePrev = st;
      }
      const contacts = sim.e.sim_ground_contacts();
      if (contacts > 0 || wheelsLoaded()) {
        groundContactSteps += 1;
      }
      if (contacts > 0) {
        fr.groundHit = true;
        fr.groundClosing = Math.max(fr.groundClosing, -vzBefore);
        fr.groundSpeed = Math.max(fr.groundSpeed, speedBefore);
      }
    }
    if (steps === 1) {
      statePrev = stateCurr;
    }
    stateCurr = st;
  }

  /*
   * The recogniser works in the plant's own frame: body rates, the two
   * quaternion components the attitude test needs, speed, and the craft's
   * position, nose and up in the WORLD frame, where the obstacles are.
   * Both go through frame.js, so nothing new crosses the frame boundary.
   */
  function feedRecogniser(st) {
    poseFromState(st, scorePos);
    simQuatToThree(st[7], st[8], st[9], st[10], scoreQuat);
    scoreQuat.premultiply(qSpawn);
    scoreFwd.set(0, 0, -1).applyQuaternion(scoreQuat);
    scoreUp.set(0, 1, 0).applyQuaternion(scoreQuat);
    trickDetector.step(
      0.001, st[11], st[12], st[13], st[8], st[9], plantSpeed(st),
      scorePos.x, scorePos.y, scorePos.z,
      scoreFwd.x, scoreFwd.y, scoreFwd.z,
      scoreUp.x, scoreUp.y, scoreUp.z,
    );
  }

  /*
   * THE GROUND, after the block. The plant owns the contact; what is read
   * here is whether the craft has come to rest on it (a perch freezes the
   * integrator: upright, slow, in contact) or hit it (a bump or a crash,
   * scored off the hardest contact a step of this block reported, never
   * off the block's end state, which no contact need ever have had).
   * Every number the HUD and the hooks read about the ground is written
   * here, once a frame.
   */
  function judgeGround(nowWall) {
    poseFromState(stateCurr, pProbe);
    groundPrev.copy(pProbe);
    groundHasPrev = true;
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
    qCollide.premultiply(qSpawn);
    vHalfFrame = craftVerticalHalf(Math.sqrt(1 - craftUpY() * craftUpY()));
    const surf = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    const clearance = pProbe.y - surf;
    const hits = launchStaging ? 0 : sim.e.sim_ground_contacts();
    const upz = plantUpZ(stateCurr);
    const tiltDeg = (Math.acos(Math.max(-1, Math.min(1, upz))) * 180) / Math.PI;
    const speed = plantSpeed(stateCurr);
    const rate = plantRateMag(stateCurr);
    lastDescent = -stateCurr[6];
    lastTiltDeg = tiltDeg;
    lastGroundHits = hits;
    lastClearance = clearance;
    lastUpz = upz;
    speedNow = speed;
    turtleOnSupport = hits > 0;
    if (takingOff) {
      /* A LEAVING TEST, not a height: the hull's reach below its centre
       * depends on its tilt, and a craft leaving a stand is not level, so
       * the departure is over when the plant saw no contact across the
       * block and the clearance beats this frame's own extent. Settling
       * back under TAKEOFF_RELEASE (not the number that sent it up, or
       * one thumb position sits on both sides of the latch) ends it too. */
      if (hits === 0 && !fr.groundHit && clearance > vHalfFrame + 0.05) {
        takingOff = false;
        lcBoost = false;
      } else if (!lcBoost) {
        const throttle = fr.samples.length ? fr.samples[fr.samples.length - 1].throttle : input.channels.throttle;
        if (throttle <= TAKEOFF_RELEASE && hits > 0 && canPerch(tiltDeg, speed, rate)) {
          takingOff = false;
        }
      }
    }
    const mayPerch = !launchStaging && !takingOff && hits > 0 && canPerch(tiltDeg, speed, rate)
      && !turtleWait && !turtleFlip.active
      /* Not while a broken part is still flying, which rest would freeze in
       * the air, and not a wreck with its pack in, which the throttle may
       * not release. Read from the plant now, not from crashFrame's copy. */
      && !(runDamage && damage.freeBodies() > 0)
      && !(runDamage && liveWreck(damage.flags()));
    if (mayPerch) {
      sim.rest();
      landed = true;
      takingOff = false;
      adoptSimClock();
      groundY = surf;
      stateCurr = readState();
      statePrev = stateCurr;
      acc = 0;
      groundCue('land', nowWall);
      return;
    }
    if ((hits > 0 || fr.groundHit) && nowWall - groundBounceAtWall > BOUNCE_COOLDOWN_MS) {
      scoreGroundHit(fr.groundClosing, fr.groundSpeed);
      groundBounceAtWall = nowWall;
    }
  }

  /*
   * One ground hit, on the line collide.js already draws: under
   * GRAZE_SPEED_MAX nothing, under BOUNCE_SPEED_MAX a bump, at or over it a
   * crash. The crash count the site keeps is this one line in every mode;
   * turtle entry is not counted as well, because it is what a hard hit
   * usually leads to. No banner: the sound and the feel are the message.
   */
  function scoreGroundHit(closing, hitSpeed) {
    if (closing < GRAZE_SPEED_MAX && hitSpeed < GRAZE_SPEED_MAX) {
      return;
    }
    bounceCount += 1;
    const hard = closing >= BOUNCE_SPEED_MAX || hitSpeed >= BOUNCE_SPEED_MAX;
    if (hard) {
      flightStats.noteCrash();
      if (crashCam) {
        crashCam.noteCrash('ground');
      }
    }
    if (view.mode === 'freestyle') {
      if (hard) {
        trickDetector.reset();
        scoreCrash();
      } else {
        /* The ground is not tappable (TrickDetector.bump). */
        trickDetector.bump(undefined, false);
      }
    }
    feelImpact(closing > hitSpeed ? closing : hitSpeed, 'ground');
  }

  /*
   * The drawn pose: the two most recent states interpolated by the
   * accumulator's remainder, then moved from the plant's origin to the
   * spawn, which is a render side placement that changes nothing about the
   * trajectory. A perched craft is seated on the resolved ground, pitched
   * with its stand or its gear, so a landing looks like one; render only.
   */
  function composePose() {
    const a = Math.max(0, Math.min(1, acc));
    fr.a = a;
    simPosToThree(statePrev[1], statePrev[2], statePrev[3] + SPAWN_ALT, pPrev);
    simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT, pCurr);
    pCurr.lerpVectors(pPrev, pCurr, a);
    simQuatToThree(statePrev[7], statePrev[8], statePrev[9], statePrev[10], qPrev);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCurr);
    qPrev.slerp(qCurr, a);
    renderSimT = statePrev[0] + (stateCurr[0] - statePrev[0]) * a;
    pCurr.applyQuaternion(qSpawn);
    pCurr.x += startX;
    pCurr.z += startZ;
    pCurr.y += startY;
    qPrev.premultiply(qSpawn);
    if (landed && !poseLock) {
      seatParkedPose();
    }
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
    if (mode !== 'replay') {
      crashFrame(fr.wall, fr.dt);
    }
    smokeFrame();
    if (crashCam) {
      crashCam.record(fr.wall);
    }
  }

  function seatParkedPose() {
    pCurr.y = groundY + simLenToWorld(REST_HEIGHT) * Math.cos(startPitch);
    if (startPitch) {
      qPad.setFromAxisAngle(AXIS_X, -startPitch);
      qPrev.multiply(qPad);
    }
    const gear = restPose();
    if (gear) {
      qPad.setFromAxisAngle(AXIS_X, gear.restPitch);
      qPrev.multiply(qPad);
    }
    const cat = airframeById(runAirframe).catapult;
    if (cat && !flownThisRun) {
      qPad.setFromAxisAngle(AXIS_X, (cat.pitchDeg * Math.PI) / 180);
      qPrev.multiply(qPad);
      pCurr.y += simLenToWorld(cat.height - REST_HEIGHT);
    }
  }

  /*
   * What the solid world did, read once. The obstacle pass ran inside the
   * step loop on the sim clock and left its findings in the obs* flags;
   * this consumes them (the recogniser is told on contact, the cue and the
   * feel on the hardest impulse, one per frame, because a corner is two
   * faces in the same millisecond), clears them, and then runs the one
   * query no step clock can hang on: a hull that sat down inside a wall
   * while perched or turtled, which the pass never sees because the plant
   * is not stepping. The clip watch judges all of it on sim time, so a
   * stutter cannot age a clip faster than real time.
   */
  function readContacts() {
    const nowWall = fr.wall;
    speedNow = plantSpeed(stateCurr);
    fr.leftover = obsLeftover;
    fr.interior = obsInterior;
    fr.roof = obsRoof;
    const touched = obsTouched;
    const closing = obsClosing;
    const contact = obsContact;
    if (obsRoof) {
      turtleOnSupport = true;
    }
    if (view.mode === 'freestyle' && touched && simTimeMs - trickTouchAtSimMs >= BOUNCE_COOLDOWN_MS) {
      trickTouchAtSimMs = simTimeMs;
      trickDetector.bump(closing);
    }
    if (obsImpulse > 0) {
      if (nowWall - bounceAtWall >= BOUNCE_COOLDOWN_MS || obsImpulse > lastImpulse * 1.6) {
        bounceCount += 1;
        feelImpact(obsImpulse, obsImpulseKind);
        bounceAtWall = nowWall;
        view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
      }
      lastImpulse = obsImpulse;
    } else if (nowWall - bounceAtWall > BOUNCE_COOLDOWN_MS) {
      lastImpulse = 0;
    }
    obsContact = false;
    obsTouched = false;
    obsClosing = 0;
    obsLeftover = false;
    obsInterior = 0;
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';
    if (mode === 'flight' && !launchStaging && !crashed && (landed || fr.parked)) {
      restingOverlap();
    }
    fr.simStepMs = Math.min(100, Math.max(0, simTimeMs - simClockPrevMs) || 0);
    simClockPrevMs = simTimeMs;
    if (mode === 'flight' && !poseLock) {
      watchClip(contact, nowWall);
    }
    if (mode === 'flight' && !poseLock && !launchStaging && !crashed && !wrecked
      && stateCurr && !turtleWait && !turtleFlip.active) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    if (isTurtleParked() && !fr.parked) {
      setTurtleParkMotors(true);
    }
  }

  /* A level pancake query where the craft sits: the last flying extent can
   * be a banked fat one. */
  function restingOverlap() {
    const hit = view.colliders.hit(
      pCurr.x, pCurr.y, pCurr.z,
      pCurr.x, pCurr.y, pCurr.z,
      craftVerticalHalf(0),
      qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      craftVerticalOffset(),
    );
    if (hit < 0) {
      return;
    }
    fr.leftover = true;
    fr.interior = view.colliders.interiorOfHit(pCurr.x, pCurr.y, pCurr.z);
    if (!(fr.interior > CLIP_CENTER_EPS) && view.colliders.hitNy > 0.5) {
      fr.roof = true;
    }
  }

  /* The spawn grace covers leftover overlap with a stand, a pole or a pad,
   * which is exactly what a craft LEAVING one has, so it holds through the
   * departure and the recovery too. */
  function watchClip(contact, nowWall) {
    const floor = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS);
    const kind = clipWatchTick(clipWatch, {
      landed,
      turtle: turtleWait || turtleFlip.active,
      launchStaging,
      hold: crashed || wrecked,
      poseLock,
      spawnGrace: nowWall < clipGraceUntil || nowWall < recoverGraceUntil || nowWall < takeoffUntil,
      takingOff,
      unresolved: fr.leftover,
      roofContact: fr.roof,
      interiorDepth: fr.interior,
      buriedDepth: floor > pCurr.y ? floor - pCurr.y : 0,
      contact,
      rateMag: plantRateMag(stateCurr),
      throttle: input.channels.throttle,
      x: pCurr.x,
      y: pCurr.y,
      z: pCurr.z,
    }, fr.simStepMs);
    if (kind) {
      beginClipCrash(kind, nowWall);
    }
  }

  /*
   * The race runs on the drawn position, timed on the sim clock at that
   * state, with gate crossings swept over the frame's travel so speed
   * cannot tunnel a gate. The frame's end becomes the seed of a lap that
   * starts on the next one.
   */
  function raceFrame() {
    const nowWall = fr.wall;
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + fr.a : 0;
    fr.simNow = simNow;
    if (mode === 'flight' && !launchStaging && !crashed) {
      if (raceHasPrev) {
        scoreTravel(simNow, nowWall);
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
      ghostPrev.valid = true;
      ghostPrev.simMs = simNow;
      ghostPrev.x = pCurr.x;
      ghostPrev.y = pCurr.y;
      ghostPrev.z = pCurr.z;
      ghostPrev.qx = qPrev.x;
      ghostPrev.qy = qPrev.y;
      ghostPrev.qz = qPrev.z;
      ghostPrev.qw = qPrev.w;
    }
    ghostFrame(simNow);
    liveFrame(nowWall);
    /* Airtime for the freestyle display is the sim clock since the run
     * began: a frame hitch must not spend a pilot's battery. */
    airtimeMs = simTimeMs;
  }

  function scoreTravel(simNow, nowWall) {
    const lapStartBefore = race.lapStartMs;
    const lapsBefore = race.laps.length;
    const allowPass = shouldScorePass(racePrev, pCurr, {
      upz: lastUpz,
      clearance: lastClearance,
      hits: lastGroundHits,
      heightAt: (x, z, y) => view.height(x, z, y - SURFACE_BIAS),
    });
    const res = race.update(racePrev, pCurr, simNow, nowWall, allowPass);
    const passed = res.passed != null;
    if (passed) {
      roomRacePass(res.passed, lapsBefore, simNow);
      view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
      if (typeof audio.event === 'function') {
        audio.event('gate');
      }
    }
    ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, passed);
    if (!race.freestyle && build && build.testing && race.laps.length > lapsBefore) {
      noteBuilderLap(race.lastLapMs);
    }
    if (!race.freestyle && (!(build && build.testing) || ui.progress.isCasual(build.docId))) {
      if (passed) {
        ui.progress.gatePass();
      }
      if (race.laps.length > lapsBefore) {
        const seated = seatedMapTrack();
        const medals = seated && seated.document && seated.document.medals;
        ui.progress.lap(progressCourse(), {
          ms: race.laps[race.laps.length - 1],
          ghostMs: ghostChased ? ghostChased.durationMs : null,
          medal: medalFor(medals, race.lastLapMs, airframeById(runAirframe).fixedWing),
        });
      }
    }
    const roomOver = roomRun() && (roomRace.done() || roomRace.race().state === 'results');
    if (!race.freestyle && (roomRun() ? roomOver : race.lap >= runLaps)) {
      finishRun();
    }
  }

  /* The run is over: a turtle in progress is played out, the motors let
   * go, and the results shown, the room's or the pilot's own. */
  function finishRun() {
    mode = 'results';
    if (turtleWait || turtleFlip.active) {
      if (turtleWait && !turtleFlip.active) {
        beginTurtleFlip();
      }
      finishTurtleFlip();
    }
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
    paintBest();
    if (!roomRun()) {
      ui.showResults(race.log, race.bestMs, race.recordAtStart, ghostResultNote());
      return;
    }
    roomShowResults();
    if (roomRace.race().state === 'results') {
      roomRaceRunId = null;
    }
  }

  /*
   * The world's visibility and the craft's moving parts. The canvas is
   * hidden (visibility, not display: some GPUs drop a context that leaves
   * the document) on the screens that do not show a world; the launch card
   * keeps the attract shot behind it so the step from the title to the
   * flight is not a flat panel in between. Prop discs spin at a visibly
   * aliased fraction of true RPM; on the title a cruise spin stands in.
   */
  const LED_BATTERY = { ok: 1, warning: 0.4, critical: 0 };
  function dressWorld() {
    const freezeWorld = Boolean(ui.reelFreezeWorld);
    fr.attractOn = !freezeWorld && mode === 'title' && (ui.screen === 'title' || ui.screen === 'launch');
    fr.pickerOn = ui.carousel.isOpen || ui.hangar.isOpen;
    /* A replay the TV opened draws the world in the room's place. */
    fr.walkOn = ui.screen === 'walk' && Boolean(ui.walk) && !crashCam.live;
    fr.studioOn = ui.screen === 'quad' && !fr.pickerOn;
    fr.worldLive = !freezeWorld && (
      Boolean(finishLoadingOnFrame)
      || mode === 'flight'
      || mode === 'paused'
      || mode === 'replay'
      || mode === 'results'
      || ui.screen === 'courses'
      || fr.attractOn
      || fr.pickerOn
      || fr.walkOn
      || Boolean(camOverride)
      || Boolean(warIntro)
    );
    const wantVis = fr.worldLive ? 'visible' : 'hidden';
    if (shell.canvas.style.visibility !== wantVis) {
      shell.canvas.style.visibility = wantVis;
    }
    const titleSpin = fr.attractOn || (mode === 'title' && fr.worldLive) || mode === 'results';
    for (let m = 0; m < 4; m += 1) {
      const spin = titleSpin
        ? 0.38 + input.channels.throttle * 0.42
        : stateCurr[14 + m] * 1e-4 + (shell.quad.visible ? 0.10 : 0);
      shell.discs[m].rotation.y += spin;
      if (shell.blades) {
        shell.blades[m].rotation.y += spin * (shell.propSpin ? shell.propSpin[m] : 1);
      }
    }
    if (shell.setProp) {
      shell.setProp(stateCurr[14]);
    }
    /* The kit's arm LEDs (docs/KITS.md section 4) on the flight clock, so
     * a replay flashes as the flight did; the pack as the OSD bands it. */
    if (shell.quad.userData.setLights) {
      shell.quad.userData.setLights(simTimeMs, input.channels.throttle || 0, LED_BATTERY[fpvOsd.batt] ?? 1);
    }
    if (shell.cameraMount) {
      shell.cameraMount.rotation.x = cameraTiltRad(camTilt);
    }
    dressWing();
    poseBramorExtras();
    discusCue(fr.wall);
    roomFrame(fr.wall, fr.dt / 1000);
    if (crashCam) {
      crashCam.recordPeers(roomPeers, roomTagBubble.drawn());
    }
  }

  /* A wing's stabiliser setting, control surfaces, flaps and gear, each
   * only on a build and a model that has them. */
  function dressWing() {
    if (typeof sim.e.sim_wing_set_stab === 'function') {
      const wantStab = tuneById(configId).wingStab || 0;
      if (wantStab !== wingStabApplied && sim.e.sim_wing_set_stab(wantStab) === SIM_OK) {
        wingStabApplied = wantStab;
      }
    }
    if (shell.setSurfaces) {
      if (!wingSurfPtr) {
        wingSurfPtr = sim.e.malloc(4 * 8);
      }
      if (sim.e.sim_plane_surfaces(wingSurfPtr) === SIM_OK) {
        const out = new Float64Array(sim.e.memory.buffer, wingSurfPtr, 4);
        shell.setSurfaces(out[0], out[1], out[2], out[3]);
      }
    }
    if (shell.setFlaps && typeof sim.e.sim_wing_flaps === 'function') {
      shell.setFlaps(sim.e.sim_wing_flaps());
    }
    if (shell.setGear && typeof sim.e.sim_wing_gear === 'function') {
      shell.setGear(sim.e.sim_wing_gear());
    }
  }

  /*
   * The FPV lens: the mount's offset in the craft's own frame, lifted out
   * of the near plane when the picture looks into the dirt, lifted while
   * parked, knocked by damage, tilted by the camera angle, and shaken by
   * the motors and the last contact. Render only: it moves the view, never
   * the craft. The pad shot is over the moment the quad leaves the ground,
   * decided here so the camera is released in the same frame.
   */
  function placeLens() {
    const dt = fr.dt;
    camFwd.set(0, 0, -1).applyQuaternion(qPrev);
    camUp.set(0, 1, 0).applyQuaternion(qPrev);
    fpvPos.copy(pCurr)
      .addScaledVector(camFwd, simLenToWorld(camMountFwd))
      .addScaledVector(camUp, simLenToWorld(camMountUp));
    const clear = fpvLensClear(camFwd.y, camUp.y);
    const camFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS) + clear;
    if (fpvPos.y < camFloor) {
      fpvPos.y = camFloor;
    }
    lastCamFloor = camFloor;
    lastCamClear = clear;
    lastCamFwdY = camFwd.y;
    lastCamUpY = camUp.y;
    const wantLift = (landed || launchStaging || turtleWait || turtleFlip.active) && !poseLock ? PARKED_LIFT : 0;
    parkedLift += (wantLift - parkedLift) * Math.min(1, dt * 0.006);
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    lastFpvY = fpvPos.y;
    fpvQuat.copy(qPrev);
    if (runDamage && cameraKnock(qKnock)) {
      fpvQuat.multiply(qKnock);
    }
    fpvQuat.multiply(qTilt);
    const rpmMean = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
    const shake = lensShake.update(dt, rpmMean / FULL_THROTTLE_RPM);
    decayImpactKick(dt);
    warShakeFrame(dt);
    qShake.setFromEuler(shakeEuler.set(
      shake.x + impactKick.x + warShake.x,
      shake.y + impactKick.y + warShake.y,
      shake.z + impactKick.z + warShake.z,
      'XYZ',
    ));
    fpvQuat.multiply(qShake);
    if (mode !== 'results' && finishCamMs >= 0) {
      finishCamMs = -1;
    }
    if (introMs >= 0 && mode === 'flight' && !landed) {
      introMs = -1;
    }
  }

  /*
   * THE CAMERA, one of: the replay's own; the attract orbit on the title;
   * the finish pull on results; the pad shot; a chase behind a watched
   * peer; the sensor ball; a wing's chase or line of sight (and a wreck's
   * chase); or the FPV lens. Every branch but the attract orbit clears the
   * title's lens shift, since the shell has one camera and a shift left on
   * it would follow the pilot into flight. The harness camera, when set,
   * overrides whatever was chosen.
   */
  function pickCamera() {
    const nowWall = fr.wall;
    const dt = fr.dt;
    fpvLensLive = false;
    ballOn = false;
    opsCam = null;
    const watching = mode === 'flight' || mode === 'paused' ? warWatch() : null;
    fr.watching = watching;
    if (!watching && watchCamSeat !== -1) {
      watchCamSeat = -1;
      chaseValid = false;
    }
    const wingOut = airframeById(runAirframe).fixedWing && ui.settings.wingView !== 'fpv';
    if (mode === 'replay') {
      shell.quad.visible = false;
      crashCam.frame(dt);
    } else if (mode === 'title') {
      if (fr.worldLive && !camOverride) {
        shell.quad.visible = true;
        attractCam.update(nowWall, shell.camera, {
          craft: shell.quad,
          overlay: ui.screen === 'title',
          roll: input.channels.roll,
          pitch: input.channels.pitch,
          yaw: input.channels.yaw,
        });
      }
    } else if (mode === 'results' && !camOverride) {
      finishCamera(dt);
    } else if (watching) {
      watchCamera(watching, dt);
    } else if (introMs >= 0 && (mode === 'flight' || mode === 'paused') && !camOverride) {
      padShot(dt);
    } else if (ballView() && !wreckWantsChase(nowWall)) {
      ballFrame(dt / 1000, mode === 'paused' || ui.screen === 'paused');
    } else if (wingOut || wreckWantsChase(nowWall)) {
      outsideCamera(dt, nowWall);
    } else {
      chaseValid = false;
      fpvLensLive = true;
      shell.quad.visible = false;
      shell.camera.position.copy(fpvPos);
      shell.camera.quaternion.copy(fpvQuat);
      setFov(ui.settings.cameraFov, true);
    }
    if (!(mode === 'title' && !camOverride && !warIntro) && shell.camera.view && shell.camera.view.enabled) {
      shell.camera.clearViewOffset();
    }
    if (build) {
      build.frame(dt);
    } else if (mapReady) {
      loadBuild();
    }
    if (warIntro) {
      if (mode === 'replay') {
        warIntroStop();
      } else {
        warIntro.frame(nowWall);
      }
    }
    const cutting = !warIntro && mode !== 'replay' && warCutaway.frame(nowWall);
    if (cutting && warCutFov == null) {
      warCutFov = shell.camera.fov;
    } else if (!cutting && warCutFov != null) {
      shell.camera.fov = warCutFov;
      shell.camera.updateProjectionMatrix();
      warCutFov = null;
    }
    if (camOverride) {
      shell.camera.position.set(camOverride[0], camOverride[1], camOverride[2]);
      shell.camera.up.set(0, 1, 0);
      shell.camera.lookAt(camLookAt.set(camOverride[3], camOverride[4], camOverride[5]));
      if (camOverride[6] && shell.camera.fov !== camOverride[6]) {
        shell.camera.fov = camOverride[6];
        shell.camera.updateProjectionMatrix();
      }
    }
    crashFrameLate(nowWall);
    aidsFrame();
  }

  /* The projection is rebuilt only when the fov moves: exactly, when the
   * caller sets it (the FPV lens), or past a twentieth of a degree. */
  function setFov(fov, exact = false) {
    if (exact ? shell.camera.fov !== fov : Math.abs(shell.camera.fov - fov) > 0.05) {
      shell.camera.fov = fov;
      shell.camera.updateProjectionMatrix();
    }
  }

  /* Off the FPV lens onto a three quarter view of the frozen craft, which
   * keeps the attitude it finished with, then a sway. */
  function finishCamera(dt) {
    if (finishCamMs < 0) {
      finishCamMs = 0;
      finishFpvPos.copy(fpvPos);
      finishFpvQuat.copy(fpvQuat);
    }
    finishCamMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
    const pull = introEase(Math.min(1, finishCamMs / FINISH_PULL_MS));
    const sway = 0.62 + Math.sin(finishCamMs * FINISH_SWAY) * 0.28;
    introRight.set(1, 0, 0).applyQuaternion(qPrev);
    introFrom.copy(pCurr)
      .addScaledVector(camFwd, -FINISH_RADIUS * Math.cos(sway))
      .addScaledVector(introRight, FINISH_RADIUS * Math.sin(sway))
      .addScaledVector(introUp, FINISH_HEIGHT);
    const floor = view.height(introFrom.x, introFrom.z, introFrom.y) + 0.42;
    if (introFrom.y < floor) {
      introFrom.y = floor;
    }
    introLook.copy(pCurr).addScaledVector(introUp, 0.06);
    shell.quad.visible = true;
    shell.camera.up.set(0, 1, 0);
    shell.camera.position.copy(introFrom);
    shell.camera.lookAt(introLook);
    introQuat.copy(shell.camera.quaternion);
    shell.camera.position.lerpVectors(finishFpvPos, introFrom, pull);
    shell.camera.quaternion.copy(finishFpvQuat).slerp(introQuat, pull);
    /* The craft sits off centre, to the right and up, so the results table
     * has the left of the frame; a tall screen keeps it centred and low. */
    const dist = Math.max(0.8, shell.camera.position.distanceTo(pCurr));
    const narrow = shell.camera.aspect < 0.95;
    shell.camera.translateX((narrow ? 0 : -0.20) * dist * pull);
    shell.camera.translateY((narrow ? -0.14 : -0.04) * dist * pull);
    setFov(ui.settings.cameraFov + (FINISH_FOV - ui.settings.cameraFov) * pull);
  }

  /*
   * The pad shot: an orbit of the parked craft, an approach that turns the
   * look down the course, and a zoom that dollies into the FPV lens. The
   * orbit plane is LEVEL: its basis is the craft's heading flattened onto
   * the ground (a craft on a launch block is pitched up its ramp, and an
   * orbit that inherited the ramp dived into the block), with the spawn's
   * heading when the nose points straight up or down. Throttle skips to
   * the zoom. The clock runs only in flight, so a pause freezes the shot.
   */
  function padShot(dt) {
    if (mode === 'flight') {
      if (input.channels.throttle > TAKEOFF_THROTTLE && introMs < INTRO_FLY) {
        introMs = INTRO_FLY;
      }
      introMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
    }
    const orbitU = introEase(introMs / INTRO_ORBIT);
    const approachU = introEase((introMs - INTRO_ORBIT) / INTRO_APPROACH);
    const zoomU = introEase((introMs - INTRO_FLY) / INTRO_ZOOM);
    const theta = INTRO_THETA0 - INTRO_ORBIT_SPAN * orbitU;
    const radius = INTRO_ORBIT_RADIUS + (INTRO_APPROACH_RADIUS - INTRO_ORBIT_RADIUS) * approachU;
    const height = INTRO_ORBIT_HEIGHT + (INTRO_APPROACH_HEIGHT - INTRO_ORBIT_HEIGHT) * approachU;
    introFwd.copy(camFwd);
    introFwd.y = 0;
    if (introFwd.lengthSq() < 1e-6) {
      introFwd.set(0, 0, -1).applyQuaternion(qSpawn);
      introFwd.y = 0;
    }
    introFwd.normalize();
    introRight.copy(introFwd).cross(introUp);
    introFrom.copy(pCurr)
      .addScaledVector(introRight, Math.cos(theta) * radius)
      .addScaledVector(introFwd, -Math.sin(theta) * radius)
      .addScaledVector(introUp, height);
    /* The same floor the finish camera keeps: the shot is deliberately low
     * and a berm, a kerb or the block itself can swallow the lens. */
    const floor = view.height(introFrom.x, introFrom.z, introFrom.y) + INTRO_FLOOR_CLEAR;
    if (introFrom.y < floor) {
      introFrom.y = floor;
    }
    introLook.copy(pCurr)
      .addScaledVector(introUp, 0.04 + 0.04 * approachU)
      .addScaledVector(introFwd, 0.08 + 1.4 * approachU);
    shell.camera.up.set(0, 1, 0);
    shell.camera.position.copy(introFrom);
    shell.camera.lookAt(introLook);
    if (zoomU > 0) {
      introQuat.copy(shell.camera.quaternion);
      shell.camera.position.lerpVectors(introFrom, fpvPos, zoomU);
      shell.camera.quaternion.copy(introQuat).slerp(fpvQuat, zoomU);
    }
    const fovMid = 46;
    setFov(zoomU > 0
      ? fovMid + (ui.settings.cameraFov - fovMid) * zoomU
      : INTRO_FOV + (fovMid - INTRO_FOV) * approachU);
    shell.quad.visible = zoomU < 0.88;
    if (introMs >= INTRO_TOTAL) {
      introMs = -1;
      shell.quad.visible = false;
      shell.camera.position.copy(fpvPos);
      shell.camera.quaternion.copy(fpvQuat);
      shell.camera.fov = ui.settings.cameraFov;
      shell.camera.updateProjectionMatrix();
    }
  }

  /* A chase behind a watched peer, following the direction it moves in. */
  function watchCamera(peer, dt) {
    const d = peer.drawnPose;
    if (watchCamSeat !== warWatchSeat) {
      watchCamSeat = warWatchSeat;
      chaseValid = false;
    }
    chaseAnchor.set(d.px, d.py, d.pz);
    chaseStep.copy(chaseAnchor).sub(chaseLast);
    if (!chaseValid) {
      chaseDir.set(0, 0, -1).applyQuaternion(watchQ.set(d.qx, d.qy, d.qz, d.qw));
    } else if (chaseStep.lengthSq() > 1e-6) {
      chaseDir.lerp(chaseStep.normalize(), 1 - Math.exp(-dt / 200)).normalize();
    }
    chaseLast.copy(chaseAnchor);
    const back = Math.max(5, airframeById(peer.profile.airframe).dims.bodyWidth * 3);
    chaseAim.copy(chaseAnchor).addScaledVector(chaseDir, -back);
    chaseAim.y += back * 0.35;
    const floor = view.height(chaseAim.x, chaseAim.z, chaseAim.y) + 0.5;
    chaseAim.y = Math.max(chaseAim.y, floor);
    if (chaseValid) {
      chasePos.lerp(chaseAim, 1 - Math.exp(-dt / 120));
    } else {
      chasePos.copy(chaseAim);
      chaseValid = true;
    }
    shell.quad.visible = !roomWatching();
    shell.camera.up.set(0, 1, 0);
    shell.camera.position.copy(chasePos);
    shell.camera.lookAt(chaseAnchor);
    setFov(70);
  }

  /*
   * A wing from outside, or a wreck: the chase follows the craft's travel
   * (its heading while it drifts on the water, levelled for a wreck), the
   * line of sight stands behind the spawn and zooms to keep the span.
   */
  /* deg: a monitor or a laptop at arm's length subtends about 40 to 55
   * deg of a person's view, ESTIMATED; at 50 the picture is life size. */
  const PILOT_FOV = 50;
  function outsideCamera(dt, nowWall) {
    shell.quad.visible = true;
    shell.camera.up.set(0, 1, 0);
    const span = airframeById(runAirframe).dims.bodyWidth;
    if (ui.settings.wingView === 'chase' || wreckWantsChase(nowWall)) {
      chaseCamera(dt, nowWall, span);
      setFov(70);
      return;
    }
    losBack.set(1, 0, 0).applyQuaternion(qSpawn);
    losBack.y = 0;
    losPos.set(startX, 0, startZ).addScaledVector(losBack.normalize(), 20);
    losBack.set(0, 0, -1).applyQuaternion(qSpawn);
    losBack.y = 0;
    losPos.addScaledVector(losBack.normalize(), 15);
    losPos.y = view.height(losPos.x, losPos.z, Infinity) + 1.7;
    shell.camera.position.copy(losPos);
    shell.camera.lookAt(pCurr);
    /* The pilot's own view: the same spot, the picture as wide as a screen
     * at arm's length is to the eye, so the aircraft is the size it would
     * look from the strip and nothing zooms. Line of sight keeps it large. */
    if (ui.settings.wingView === 'pilot') {
      setFov(PILOT_FOV);
    } else {
      const d = Math.max(1, losPos.distanceTo(pCurr));
      setFov(Math.min(45, Math.max(12, 2 * Math.atan((span * 5) / d) * 180 / Math.PI)));
    }
    chaseValid = false;
  }

  /*
   * How far the chase camera turns toward the craft's travel this frame,
   * and toward what. Slow, it does not turn: a hovering 3D plane travels
   * nowhere, and the few millimetres it drifts a frame, taken as a
   * direction, swung a travel led camera round it at random; under 4 m/s
   * the camera holds its heading, a pilot standing still. And the
   * travel's climb is held under CHASE_STEEP of the direction, its own
   * bearing kept (or the camera's, straight up or down), or a vertical
   * line would put the camera under the plane looking up along world up,
   * where its yaw is undefined. Reads chaseStep, this frame's travel, and
   * chaseDir; returns the lerp's share, the target in chaseHead.
   */
  /* m/s: under CHASE_SLOW the camera holds its heading, a hovering or
   * hanging plane's; it takes the travel back over the next CHASE_RAMP. */
  const CHASE_SLOW = 4;
  const CHASE_RAMP = 2;
  const CHASE_STEEP = 0.8;
  function chaseTurn(dt, k) {
    const travel = chaseStep.length();
    if (!(travel > 0) || !(dt > 0)) {
      return 0;
    }
    const speed = travel / simLenToWorld(1) / (dt / 1000);
    chaseHead.copy(chaseStep).multiplyScalar(1 / travel);
    if (Math.abs(chaseHead.y) > CHASE_STEEP) {
      const up = Math.sign(chaseHead.y);
      chaseHead.y = 0;
      if (chaseHead.lengthSq() < 1e-4) {
        chaseHead.set(chaseDir.x, 0, chaseDir.z);
      }
      if (chaseHead.lengthSq() < 1e-9) {
        chaseHead.set(0, 0, -1);
      }
      chaseHead.normalize().multiplyScalar(Math.sqrt(1 - CHASE_STEEP * CHASE_STEEP));
      chaseHead.y = up * CHASE_STEEP;
    }
    const w = Math.min(1, Math.max(0, (speed - CHASE_SLOW) / CHASE_RAMP));
    return Math.min(1, k) * w;
  }

  function chaseCamera(dt, nowWall, span) {
    const k = 1 - Math.exp(-dt / 120);
    const water = craftOnWater();
    const afloat = Boolean(water && water.state[3] > 0);
    chaseLift += ((afloat ? 1 : 0) - chaseLift) * (1 - Math.exp(-dt / (afloat ? 700 : 250)));
    if (!chaseValid) {
      chaseWaterY = pCurr.y;
    }
    if (afloat) {
      chaseWaterY += (pCurr.y - chaseWaterY) * (1 - Math.exp(-dt / 1500));
    }
    chaseAnchor.copy(pCurr);
    chaseAnchor.y += chaseLift * (chaseWaterY - pCurr.y);
    chaseStep.copy(chaseAnchor).sub(chaseLast);
    chaseStep.y *= 1 - chaseLift;
    if (!chaseValid) {
      chaseDir.copy(camFwd);
    } else if (chaseLift > 0.5 && chaseStep.length() < 0.3e-3 * dt) {
      introLook.copy(camFwd).setY(0);
      if (introLook.lengthSq() > 1e-6) {
        chaseDir.lerp(introLook.normalize(), 1 - Math.exp(-dt / 600)).normalize();
      }
    } else {
      const share = chaseTurn(dt, k);
      if (share > 0) {
        chaseDir.lerp(chaseHead, share).normalize();
      }
    }
    chaseLast.copy(chaseAnchor);
    if (wreckWantsChase(nowWall)) {
      chaseDir.y = 0;
      if (chaseDir.lengthSq() < 1e-6) {
        chaseDir.set(0, 0, -1).applyQuaternion(qSpawn);
      }
      chaseDir.normalize();
    }
    const back = Math.max(2.5, span * 2.4);
    chaseAim.copy(chaseAnchor)
      .addScaledVector(chaseDir, -back)
      .addScaledVector(introUp, back * (wrecked ? 0.7 : 0.28));
    const floor = view.height(chaseAim.x, chaseAim.z, chaseAim.y) + 0.5;
    if (chaseAim.y < floor) {
      chaseAim.y = floor;
    }
    if (chaseValid) {
      chasePos.lerp(chaseAim, k);
    } else {
      chasePos.copy(chaseAim);
      chaseValid = true;
    }
    shell.camera.position.copy(chasePos);
    shell.camera.lookAt(introLook.copy(chaseAnchor).addScaledVector(chaseDir, span));
  }

  /*
   * The scenery's clocks, only while this context composes a world: the
   * attract clock on the title, the traffic on the sim clock in a run, the
   * replay's own clock, the wind on the wall clock (the export's fixed
   * clock when a reel is being written), the waves on the rendered sim time.
   */
  function moveScenery() {
    const nowWall = fr.wall;
    const dt = fr.dt;
    if (fr.worldLive && mode === 'title') {
      titleAcc += dt;
      const ts = Math.floor(titleAcc);
      titleAcc -= ts;
      titleStepMs += ts > 100 ? 100 : ts;
    }
    if (!fr.worldLive) {
      return;
    }
    let animMs = titleStepMs;
    if (mode === 'replay') {
      animMs = crashCam.animMs() ?? trafficMs(simTimeMs);
      if (view.advanceLiveWater && roomLinkState.state().phase === 'open' && roomLinkState.roomNow() != null) {
        view.advanceLiveWater(roomLinkState.roomNow() - TRAFFIC_SLACK_MS);
      }
    } else if (mode === 'results') {
      animMs = trafficMs(simTimeMs + Math.max(0, finishCamMs));
    } else if (mode !== 'title') {
      animMs = trafficMs(simTimeMs);
    }
    view.updateAnim(animMs);
    animDrawnMs = animMs;
    if (view.audioSources) {
      view.audioSources(worldAudio.traffic(animMs));
    }
    const focus = camOverride || warIntro || (build && build.cameraLive) || mode === 'replay'
      ? shell.camera.position
      : (mode === 'title' ? shell.quad.position : pCurr);
    view.updateShadowFocus(focus);
    /* Wash drove grass propwash once; the argument stays so every map has
     * one updateWind shape. */
    const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
    const wash = (mode === 'title' || mode === 'results') ? 0.85 : Math.min(1.3, meanRpm / 9000);
    view.updateWind(exportShot ? exportShot.wind0 + exportShot.clock() : nowWall * 0.001, focus, wash);
    showWaves();
    if (view.updateWaves) {
      view.updateWaves(exportShot ? exportShot.waves0 + exportShot.clock() : renderSimT, craftOnWater());
    }
  }

  /*
   * The draw. The frame cap skips only this: the sticks were polled, the
   * plant stepped and the pose composed, so a capped frame costs the pilot
   * nothing but the picture it skips (one millisecond of slack keeps a 60
   * cap from beating against a 60 Hz display). The renderer's counters
   * accumulate across the whole frame for __renderStats. The Settings
   * studio has its own renderer so the field's draw budget cannot see it,
   * created when Settings opens and disposed when it closes.
   */
  function drawFrame() {
    const nowWall = fr.wall;
    const dt = fr.dt;
    shell.renderer.info.reset();
    const renderStart = performance.now();
    fr.capHz = Number(ui.settings.fpsCap) || 0;
    let drawThis = !harnessNoDraw;
    if (fr.capHz > 0 && fr.worldLive && !exportShot) {
      if (nowWall - capLastDraw < 1000 / fr.capHz - 1.0) {
        drawThis = false;
      } else {
        capLastDraw = nowWall;
      }
    }
    fr.drawThis = drawThis;
    if (fr.worldLive && drawThis && !ui.hangar.isOpen && !fr.walkOn) {
      dynres.beginGpu();
      if (avionicsHud.on || ballOn) {
        sensors.render(view.post);
        opsGrabStill();
      } else {
        view.post.render();
      }
      dynres.endGpu();
      if (mode === 'replay') {
        crashCam.afterRender();
      } else if (warIntro) {
        warIntro.afterDraw(shell.canvas);
      } else {
        warCutaway.drawPip(nowWall);
      }
    }
    if (ui.screen === 'courses') {
      ui.paintMapThumbs(shell.canvas);
    }
    fr.renderMs = performance.now() - renderStart;
    if (drawThis) {
      renderStats.calls = shell.renderer.info.render.calls;
      renderStats.triangles = shell.renderer.info.render.triangles;
    }
    /* The room is drawn in the world's place, and under the picker when
     * one is open over it; the hangar's editor has a set of its own. */
    if (fr.walkOn) {
      const view = walkRoomFrame(dt);
      if (drawThis && !ui.hangar.isOpen) {
        view.draw();
        renderStats.calls = view.stats().calls;
        renderStats.triangles = view.stats().triangles;
      }
    } else {
      walkRoomShut();
    }
    const pick = ui.hangar.isOpen ? ui.hangar.frame(dt) : ui.carousel.frame(dt);
    if (drawThis) {
      pickStage.draw(fr.worldLive ? pick : null);
    }
    if (pick && pick.hangar && pick.hangar.aim) {
      ui.hangar.aimed(pickStage.pick(pick.items[0].id, pick.hangar.aim.x, pick.hangar.aim.y));
    }
    if (ui.hangar.isOpen) {
      const layer = ui.hangar.shop.gizmoLayer();
      ui.hangar.shop.gizmoAt(layer && pick ? pickStage.outline(pick.items[0].id, layer) : null);
    }
    if (pick && pick.hangar) {
      ui.hangar.pointed(pick.hangar.point ? pickStage.pickPart(pick.items[0].id, pick.hangar.point.x, pick.hangar.point.y) : null);
    }
    studioFrame(dt, nowWall);
  }

  function studioFrame(dt, nowWall) {
    if (!fr.studioOn) {
      if (showcase) {
        disposeShowcase();
      }
      return;
    }
    /* The seated aircraft's own model and framing, rebuilt when the
     * aircraft changes: a 65 mm whoop on a stage composed for a 5 inch is
     * a speck, and showcase.js scales the stage by the sweep. */
    if (showcase && showcaseCraft !== runAirframe) {
      disposeShowcase();
    }
    if (!showcase) {
      const af = airframeById(runAirframe);
      showcaseCraft = runAirframe;
      showcase = createShowcase(ui.craftCanvas, {
        sweep: af.dims.arm + (af.dims.hullR ?? af.dims.propR),
        build: craftBuilderFor(af.id),
      });
      if (showcase.failed) {
        ui.setCraftCaption(str('main.the_3d_preview_could_not_start'));
      }
    }
    if (showcase.failed) {
      return;
    }
    showcase.setActive(true);
    if (!document.hidden) {
      showcase.update(dt, input.channels, nowWall, ui.settings.cameraAngle, angleModeOn);
      showcase.render();
    }
  }

  function disposeShowcase() {
    try {
      showcase.dispose();
    } catch (e) {
      /* A context the browser has already dropped throws here; that is done too. */
    }
    showcase = null;
  }

  /*
   * THE MIX IS FED FROM A STATE THE INTEGRATOR IS STILL ADVANCING, or it
   * is fed nothing. A frozen state carries the motor RPM of the last step
   * it took, so the results screen, a crash lockout and a mid lap perch
   * all held whatever tone the quad was making when the world stopped;
   * zero is what a motor that is not turning sounds like, and the RPM
   * path already fades a stem out below MOTOR_MUTE_RPM. The airspeed gets
   * the same test. The hangar's rev and the bench's stand sound take the
   * voice over while they play; a replay hands its own wind back.
   */
  function mixFrame() {
    worldAudio.attach(audio);
    worldAudio.setWalls(view && view.audioWalls);
    if ((mode === 'replay') !== audioReplaying) {
      audioReplaying = mode === 'replay';
      audio.setReplaying(audioReplaying);
      voice.setHeld(audioReplaying);
    }
    if (mode === 'replay' && crashCam) {
      const heard = crashCam.warHeard();
      if (heard) {
        worldAudio.war(heard.list, heard.room);
      }
      roomHearPeers();
    }
    if (view && view.waterFlows) {
      for (const w of view.waterFlows()) {
        worldAudio.flow(w.key, w.x, w.y, w.z, w.q);
      }
    }
    const c = shell.camera.position;
    worldAudio.post(shell.camera, view && view.height ? view.height(c.x, c.z, c.y) : NaN, view, worldTime);
    const st = stateCurr;
    const audioStart = performance.now();
    const motorsTurning = mode === 'flight' && !landed && !crashed && !isTurtleParked();
    fr.motorsTurning = motorsTurning;
    audioRpm[0] = motorsTurning ? st[14] : 0;
    audioRpm[1] = motorsTurning ? st[15] : 0;
    audioRpm[2] = motorsTurning ? st[16] : 0;
    audioRpm[3] = motorsTurning ? st[17] : 0;
    if (hangarRev) {
      if (hangarRev.t0 == null) {
        hangarRev.t0 = performance.now();
      }
      hangarRev.ms = performance.now() - hangarRev.t0;
      hangarRev.rpm = ui.hangar.isOpen ? revRpm(hangarRev.ms, VOICES[hangarRev.voice].rpmFull) : null;
      if (hangarRev.rpm == null) {
        hangarRev = null;
      }
    }
    const bench = hangarRev ? null : (ui.hangar.isOpen ? standSound() : null);
    const over = hangarRev ?? bench;
    if (over) {
      if (standVoiceOn !== over.voice) {
        audio.setVoice(over.voice);
        audio.setEngineSpec(null);
        standVoiceOn = over.voice;
      }
      if (hangarRev) {
        audioRpm.fill(hangarRev.rpm);
      } else {
        audioRpm[0] = bench.rpm;
      }
    } else if (standVoiceOn) {
      audio.setVoice(flownVoice);
      audio.setEngineSpec(flownSpec);
      standVoiceOn = null;
    }
    const replayWind = mode === 'replay' ? crashCam.sound(audioRpm) : -1;
    const air = replayWind < 0 ? airNow(st, motorsTurning) : crashCam.air();
    audio.update(audioRpm, replayWind >= 0 ? replayWind : (motorsTurning ? speedNow : 0), undefined, air);
    const audioMs = performance.now() - audioStart;
    if (frames > 2 && audioMs > worstAudioMs) {
      worstAudioMs = audioMs;
    }
  }

  /* The air over the airframe in its own frame (velocity rotated by the
   * conjugate attitude), the current drawn, and whether the flaps or the
   * gear are moving, for the wind and the mechanical sounds. */
  function airNow(st, motorsTurning) {
    const qw = st[7], qx = st[8], qy = st[9], qz = st[10];
    const vx = motorsTurning ? st[4] : 0, vy = motorsTurning ? st[5] : 0, vz = motorsTurning ? st[6] : 0;
    audioAir.u = (1 - 2 * (qy * qy + qz * qz)) * vx + 2 * (qx * qy + qw * qz) * vy + 2 * (qx * qz - qw * qy) * vz;
    audioAir.v = 2 * (qx * qy - qw * qz) * vx + (1 - 2 * (qx * qx + qz * qz)) * vy + 2 * (qy * qz + qw * qx) * vz;
    audioAir.w = 2 * (qx * qz + qw * qy) * vx + 2 * (qy * qz - qw * qx) * vy + (1 - 2 * (qx * qx + qy * qy)) * vz;
    audioAir.amps = motorsTurning ? st[19] : 0;
    const flap = typeof sim.e.sim_wing_flaps === 'function' ? sim.e.sim_wing_flaps() : 0;
    audioAir.flapsMoving = Math.abs(flap - flapAngleWas) > 1e-5;
    flapAngleWas = flap;
    const gear = typeof sim.e.sim_wing_gear === 'function' ? sim.e.sim_wing_gear() : 0;
    const gearMoving = Math.abs(gear - gearWas) > 1e-6;
    if (gearMovingWas && !gearMoving && (gear === 0 || gear === 1)) {
      audio.mechanical('gear');
    }
    gearMovingWas = gearMoving;
    gearWas = gear;
    audioAir.gearMoving = gearMoving;
    if (crashCam && mode === 'flight') {
      crashCam.recordAir(audioAir);
    }
    return audioAir;
  }

  /*
   * THE HUD. In flight: how near the craft is to something solid (a Wall
   * Ride never touches the wall, so one inflated broadphase query a frame
   * is the one thing that separates it from a banked turn), the score on
   * the sim clock, the readout, the telemetry, the progress, the stick
   * pictures and the next gate mark. Off every other screen but a pause,
   * which keeps what it had.
   */
  function hudFrame() {
    const nowWall = fr.wall;
    if (mode !== 'flight') {
      if (mode !== 'paused') {
        ui.setStickOverlay({ show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 });
        ui.setAirSlider(false);
        ui.setTargetLock(LOCK_OFF);
      }
      hudChrome();
      return;
    }
    if (view.mode === 'freestyle' && view.colliders) {
      const q = shell.quad.position;
      trickDetector.near(view.colliders.gapAt(q.x, q.y, q.z, WALL_NEAR_M));
    }
    if (view.mode === 'freestyle') {
      scoreFrame();
    }
    const osdView = readoutNow(nowWall);
    ui.setOsd(osdView);
    const powerNow = readPower();
    const osdCtx = {
      st: stateCurr,
      sim,
      cells: runCells,
      restVolts: runVoltage * runCells,
      power: powerNow,
      fixedWing: Boolean(airframeById(runAirframe).fixedWing),
      quat: shell.quad.quaternion,
      pos: shell.quad.position,
      camera: shell.camera,
      home: { x: startX, y: startY, z: startZ },
      config: configText,
      link: rcLink,
      bestMs: ui.lastBestMs,
      armed: fr.motorsTurning,
      flown: flownThisRun,
      crashFlip: crashflipOn || turtleWait || turtleFlip.active,
      condition: conditionOf(crashFlags, airframeById(runAirframe).fixedWing),
      damagedPart: damagedPart(crashFlags),
      banner: ui.bannerText,
      replayKey: crashCam ? crashCam.promptKey() : null,
    };
    fpvOsd.feed(osdView, osdCtx);
    const feed = fpvFail.level(nowWall);
    telemetry.feed(osdView, osdCtx, fpvOsd, { videoSnow: feed.snow, cameraLost: fpvFail.deadSince() >= 0, load: perception.load });
    simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], avxVel);
    avxOwn.p[0] = shell.camera.position.x;
    avxOwn.p[1] = shell.camera.position.y;
    avxOwn.p[2] = shell.camera.position.z;
    avxOwn.v[0] = avxVel.x;
    avxOwn.v[1] = avxVel.y;
    avxOwn.v[2] = avxVel.z;
    avxFed = true;
    progressTick(powerNow);
    const ch = input.channels;
    const vis = turtleAxes(ch.roll, ch.pitch);
    ui.setStickOverlay({
      show: input.isMousePrimary() || (input.isKeyboardPrimary() && !input.isTouchPrimary()),
      roll: vis[0],
      pitch: vis[1],
      yaw: ch.yaw,
      throttle: ch.throttle,
    });
    /* The air slider belongs to every pilot, radio, keyboard and thumbs
     * alike, so it is up whenever there is a quad in the air to try it on;
     * its first run hint is raised in there too. */
    ui.setAirSlider(true, !landed && !launchStaging && !crashed && !poseLock);
    updateTargetLock();
    hudChrome();
  }

  /*
   * THE HORN. A scored freestyle run is two minutes and it ENDS, which is
   * why its score can be posted at all; read off score.over() rather than
   * off the drained events, which belong to the overlay.
   */
  function scoreFrame() {
    const wasOver = score.over();
    score.tick(simTimeMs);
    const scoreView = score.view();
    scoreState = scoreView.state;
    scoreRemainMs = scoreView.remainMs;
    ui.setScore(scoreView);
    ui.scoreEvents(score.drainEvents());
    if (!wasOver && score.over()) {
      endFreestyleRun();
    }
  }

  /*
   * The readout. Altitude is measured against the surface UNDER the craft
   * through the same biased query every contact test uses, so a pilot over
   * a roof reads their height over that roof and the deck the quad is
   * under is not taken for the floor (SURFACE_BIAS). The freestyle clock
   * is the run's, read off the scorer, which decides when the run ends.
   */
  function readoutNow(nowWall) {
    const st = stateCurr;
    const af = airframeById(runAirframe);
    const p = shell.quad.position;
    const nextGt = view.gates && view.gates[race.nextSceneIndex()];
    const gearNow = af.retracts && typeof sim.e.sim_wing_gear === 'function' ? sim.e.sim_wing_gear() : null;
    let flightMode;
    if (af.fixedWing) {
      flightMode = ['manual', 'stab', 'acro', 'as3x'][tuneById(configId).wingStab || 0];
    } else if (turtleWait || turtleFlip.active) {
      flightMode = 'turtle';
    } else {
      flightMode = angleModeOn ? 'angle' : 'acro';
    }
    /* Native launch state 3 latches until the L switch drops; the GO flash
     * is 900 ms, after which the overlay hides. */
    const launchState = (crashflipOn || turtleRecover || crashed)
      ? 0
      : (fr.launch === 3 && nowWall >= lcGoUntil ? 0 : fr.launch);
    return {
      mode: view.mode,
      lapMs: race.freestyle ? airtimeMs : race.currentLapMs(fr.simNow),
      runState: scoreState,
      runTimed: score.timed,
      runScored: scoringWanted(),
      runRemainMs: scoreRemainMs,
      gate: race.next + 1,
      gateCount: race.gates.length,
      gateCue: race.reach > 0 ? str('osd.score', { n: race.runScore }) : (nextGt && nextGt.cue ? nextGt.cue : ''),
      volts: st[18],
      lastLapMs: race.lastLapMs,
      packFrac: (st[18] - PACK_EMPTY_PER_CELL * runCells) / ((PACK_FULL_PER_CELL - PACK_EMPTY_PER_CELL) * runCells),
      altitude: p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS),
      speedKph: speedNow * 3.6,
      throttle: input.channels.throttle,
      flightMode,
      flaps: af.flaps ? flapNotch : null,
      gear: gearNow != null
        ? (gearNow >= 1 ? 'up' : gearNow <= 0 ? 'down' : 'moving')
        : null,
      bounces: bounceCount,
      launchState,
      launchPitch: pitchNoseDownDeg(st),
      /* The gap to the ghost at the last gate while its readout lives;
       * null the rest of the time, which is how the OSD knows to clear. */
      ghostGapMs: ghostGap && nowWall < ghostGap.untilWall ? ghostGap.deltaMs : null,
      ghostFinal: Boolean(ghostGap && ghostGap.final),
    };
  }

  /*
   * The HUD's chrome: which overlay is up (the FC's OSD, the avionics, the
   * sensor ball, the ops room's), the peer marks and the voice, the Setup
   * tab's live horizon, the mouse lock, the thumb sticks (in flight and
   * nowhere else: over a menu they would sit on the rows, beside a radio
   * they would be a second pair), and the turtle class.
   */
  function hudChrome() {
    const nowWall = fr.wall;
    const dt = fr.dt;
    const flightScreen = ui.screen === 'flight' || ui.screen === 'paused';
    const hudStyle = hudStyleFor(ui.settings, runAirframe);
    const fpvHudUp = fpvLensLive && !camOverride && flightScreen;
    const opsMatchUp = roomOps.on() && mode === 'flight';
    fpvOsd.tick(hudStyle === 'osd' && fpvHudUp && !opsMatchUp, ui.screen === 'paused', nowWall);
    avionicsFrame(hudStyle === 'avionics' && fpvHudUp && avxFed && !opsMatchUp, ui.screen === 'paused', nowWall, dt / 1000);
    if (ballWas && !ballOn) {
      ballLeft();
    }
    ballWas = ballOn;
    const ballHudUp = ballOn && !camOverride && flightScreen;
    if (ballOn && ui.screen !== 'paused') {
      sensors.update(telemetry.state.tS, dt / 1000, avxVideo);
    }
    opsFrame(mode === 'flight' && flightScreen);
    opsGuideFrame(roomOps.view(), roomOps.on() ? roomOps.mission() : null, (mode === 'flight' || mode === 'paused') && flightScreen, nowWall);
    const opsHudUp = ballHudUp || (roomOps.on() && mode === 'flight' && !camOverride && flightScreen);
    opsHud.tick(opsHudUp, ui.screen === 'paused', nowWall, opsHudUp ? opsHudSrc() : null);
    rolesBoard.update(roomOps.on() ? roomOps.view() : null, roomOps.seat(), opsHost(), opsHudUp);
    markPeers(nowWall, dt);
    voiceUi.frame(mode === 'flight' ? pCurr : null, roomPeers.values());
    if (ui.screen === 'fc' && stateCurr) {
      ui.fc.attitude = { w: stateCurr[7], x: stateCurr[8], y: stateCurr[9], z: stateCurr[10] };
      ui.paintFcAttitude();
    }
    syncMouseLock(nowWall);
    if (touch) {
      const touchOn = mode === 'flight' && ui.screen === 'flight' && !input.firstGamepad() && !input.mouseEnabled;
      if (touchOn && !ui.settings.touchRatesOffered) {
        offerTouchRates();
      }
      touch.setVisible(touchOn);
      uiRoot.classList.toggle('touch-fly-on', touchOn);
      touch.paint();
    }
    uiRoot.classList.toggle('turtle-on', crashflipOn || turtleRecover);
  }

  /*
   * The one time thumb rates hand off, at the first moment touch is about
   * to fly: an existing profile still on the stock defaults, which are a
   * gimbal calibration and read as "way too fast" on glass, is eased. A
   * pilot who chose their own rates keeps them; the flag flips either way
   * so this never asks again.
   */
  function offerTouchRates() {
    ui.settings.touchRatesOffered = true;
    if (ratesAreDefault(ui.settings.rates)) {
      ui.settings.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
      notice = { text: str('main.rates_eased_for_thumb_flying_450'), untilMs: performance.now() + 4200 };
    }
    ui.persistSettings();
    applySettings(ui.settings);
  }

  function markPeers(nowWall, dt) {
    peerMarks.begin(shell.camera, ui.settings.peerMarks, avionicsHud.on ? avionicsHud : fpvOsd, mode === 'flight' && ui.screen === 'flight', dt / 1000, nowWall);
    for (const peer of roomPeers.values()) {
      if (peer.rig && peer.rig.group.visible) {
        const at = peer.rig.group.position;
        peerMarks.add(peer.seat, peer.rig.label(), at.x, at.y, at.z, peer.rig.extent);
      } else if (peer.away && !roomSafety.isMuted(peer.seat)) {
        peerMarks.away(peer.seat, roomAwayText(peer));
      }
    }
    for (const [seat, gone] of roomGone) {
      if (nowWall > gone.until || roomPeers.has(seat)) {
        roomGone.delete(seat);
      } else if (!roomSafety.isMuted(seat)) {
        peerMarks.away(seat, str('rooms.away_reconnecting', { name: roomName(gone.name) }));
      }
    }
    const alone = roomAloneText(roomLinkState.state());
    if (alone) {
      peerMarks.note(alone);
    }
    const tagOrb = roomTag.orb();
    if (tagOrb) {
      peerMarks.orb(str('roomtag.orb_mark'), tagOrb.px, tagOrb.py, tagOrb.pz, roomTag.bubble());
    }
    peerMarks.end(peerMarkGround);
  }

  /*
   * THE BANNER is one line, and the screens and states that want it are
   * ranked: the first claim that holds wins. The pad picker and the
   * calibration wizard own their screens outright; after them the crash,
   * a watched war, the wreck, the turtle, the start counts, a notice, any
   * other screen (which owns the frame and wants no flight message over
   * it), the throttle wait, launch control, the takeoff prompt, the guide
   * and the lap flash, in that order.
   */
  function bannerFrame() {
    const nowWall = fr.wall;
    const cal = input.calibrationView();
    const lapFlash = race.flashText(nowWall);
    /* Read once: guidedPrompt retires the guided flag as a side effect. */
    const guidedText = (ui.guided && !crashflipOn && !turtleRecover && lastUpz >= 0) ? guidedPrompt(race) : '';
    ui.setPadInfo(input.padSummary());
    const queuedPick = input.takePadPickQueue();
    if (queuedPick) {
      openPadPick(queuedPick);
    }
    if (ui.screen === 'padpick') {
      const pick = input.padPickView();
      if (pick) {
        ui.setPadPick(pick);
      } else {
        leavePadPick();
      }
      ui.setBanner('');
    } else if (ui.screen === 'calibrate') {
      if (cal) {
        ui.setCalibration(cal);
      } else {
        leaveCalibration(nowWall);
      }
      ui.setBanner('');
    } else {
      const claim = bannerClaim(nowWall, lapFlash, guidedText);
      ui.setBanner(claim[0], claim[1]);
    }
    /* How to fly and Rates draw the gimbals from the same channels the
     * quad gets: pressing W on the tutorial moves the stick it describes. */
    if (ui.screen === 'howto') {
      const ch = input.channels;
      ui.setHowtoSticks({ roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw, throttle: ch.throttle });
    }
    if (ui.screen === 'rates') {
      const ch = input.channels;
      ui.paintRates({ roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw });
    }
  }

  function leaveCalibration(nowWall) {
    ui.show('pilot');
    if (input.calResult === 'saved') {
      notice = { text: str('main.stick_mapping_saved'), untilMs: nowWall + 2800 };
    } else if (input.calResult === 'saved-unstored') {
      notice = { text: str('main.mapping_live_gone_on_reload'), untilMs: nowWall + 5200 };
    }
    input.calResult = null;
  }

  const NO_BANNER = ['', false];

  function bannerClaim(nowWall, lapFlash, guidedText) {
    const inFlight = ui.screen === 'flight';
    const launch = fr.launch;
    if (crashed && inFlight) {
      return ['Crashed', true];
    }
    if (inFlight && (warSpectating() || roomWatching() || jamWatching())) {
      return [warWatchBanner(), true];
    }
    if (inFlight && roomWar.live() && roundOf(roomWar.view())?.state === 'result') {
      return NO_BANNER;
    }
    if (inFlight && ['won', 'lost', 'ended'].includes(roomWar.view().state)) {
      return NO_BANNER;
    }
    if (wreckDown(nowWall) && inFlight) {
      return [str('main.wrecked_r_resets'), 'edge'];
    }
    if ((turtleWait || turtleRecover || turtleFlip.active) && inFlight) {
      return [turtleBannerText(), true];
    }
    if ((airHoldMs > 0 || raceHoldMs > 0) && !ui.isModal()) {
      return [String(Math.ceil(Math.max(airHoldMs, raceHoldMs) / 1000)), false];
    }
    if (nowWall < airGoUntil && !ui.isModal()) {
      return ['GO', false];
    }
    if (notice && nowWall < notice.untilMs && !(launch > 0) && !crashflipOn) {
      return [notice.text, false];
    }
    if (ui.isModal()) {
      return NO_BANNER;
    }
    if (input.throttleWaiting && inFlight) {
      return [str('main.throttle_down_to_start'), false];
    }
    if (launch === 3 && nowWall < lcGoUntil) {
      return ['GO', false];
    }
    if (launch === 1 || launch === 2) {
      return [launchPrompt(launch), false];
    }
    if (!flownThisRun && warTakeoffHintDone()) {
      return NO_BANNER;
    }
    if (!flownThisRun) {
      return [takeoffPrompt(), false];
    }
    if (guidedText) {
      return [guidedText, false];
    }
    if (lapFlash) {
      return [lapFlash, wrecked ? 'edge' : false];
    }
    return NO_BANNER;
  }

  function launchPrompt(launch) {
    const deg = Math.round(pitchNoseDownDeg(stateCurr));
    if (!(deg > 8)) {
      return str('main.launch_control_pitch_forward_then_centre');
    }
    return launch === 2
      ? str('main.launch_punch_throttle', { deg })
      : str('main.launch_centre_the_stick_then_punch', { deg });
  }

  /*
   * The takeoff prompt, by how this aircraft leaves the ground, and then
   * what starts: the lap on the green gate, or in freestyle the scored
   * run's two minutes. Scoring off promises nothing, because nothing
   * starts; free flight has no clock and no gates and says so.
   */
  function takeoffPrompt() {
    const af = airframeById(runAirframe);
    let start;
    if (startsAfloat()) {
      start = str('main.throttle_up_on_the_water');
    } else if (af.retracts && af.flaps) {
      start = str('main.throttle_up_gear_g');
    } else if (af.retracts) {
      start = str('main.throttle_up_retracts_g');
    } else if (af.flaps) {
      start = str('main.throttle_up_flaps_f');
    } else if (af.gear) {
      start = str('main.throttle_up_to_take_off_from');
    } else if (af.catapult && af.chute) {
      start = str('main.launch_it_off_the_catapult');
    } else if (af.catapult) {
      start = str('main.launch_it_off_the_rail');
    } else if (af.fixedWing) {
      start = str('main.throw_it_with_l');
    } else if (ui.settings.launchControl) {
      start = str('main.l_for_launch_control_or_throttle');
    } else {
      start = str('main.throttle_up_to_take_off');
    }
    let second = str('main.the_green_gate_starts_your_lap_2');
    if (race.freestyle) {
      second = scoredRun()
        ? str('main.two_minutes_the_clock_starts_on')
        : (scoringWanted() ? str('main.no_clock_and_no_gates_a') : '');
    }
    return `${start}${second}`;
  }

  /*
   * The frame's ledger: the hooks that say the shell is up, the block's
   * length (the whole callback, one synchronous block on the main thread;
   * the part inside the draw is split out because in a software rasterised
   * container it is CPU work that says nothing about a GPU), the dynamic
   * resolution's verdict, the worst cases, and the loading screen's last
   * stage, which IS the first frame.
   */
  function closeFrame() {
    const nowWall = fr.wall;
    window.__shellReady = true;
    window.__mode = mode;
    window.__screen = ui.screen;
    const blockMs = performance.now() - fr.blockStart;
    const shellMs = blockMs - fr.renderMs;
    if (fr.drawThis && fr.worldLive && mapReady && !exportShot && !ui.hangar.isOpen) {
      const before = dynres.state.scale;
      if (dynres.observe(performance.now(), shellMs)) {
        const pr = pixelRatioFor(ui.settings.graphics, renderScaleOf(ui.settings), null, dynres.state.scale);
        if (Math.abs(pr - shell.pixelRatio) > 0.001 || dynres.refuse(before)) {
          resizeDirty = true;
        }
      }
    }
    if (fr.drawThis) {
      const ds = dynres.state;
      perfOverlay.frame(nowWall, blockMs, ds.gpu && ds.gpuSeen > 0 ? ds.gpuSeen : -1,
        renderStats.calls, renderStats.triangles, ds.scale, fr.capHz);
    }
    if (frames > 2) {
      worstBlockMs = Math.max(worstBlockMs, blockMs);
      worstShellMs = Math.max(worstShellMs, shellMs);
    }
    frames += 1;
    if (firstFrameMs < 0) {
      firstFrameMs = performance.now() - BOOT_START;
    }
    if (finishLoadingOnFrame) {
      finishLoadingOnFrame = false;
      loading.done('frame');
      loading.finish();
    }
  }
  let worstBlockMs = 0;
  let worstShellMs = 0;
  let worstAudioMs = 0;
  /* Rotor speeds for audio.update, one array for the session: per frame
   * allocation is banned in the hot path (rule P8). */
  const audioRpm = [0, 0, 0, 0];
  /* The engine's extra state, the same way: written in place. */
  const audioAir = { u: 0, v: 0, w: 0, amps: 0, dist: 0, dist2: 0, pan: 0, flapsMoving: false, gearMoving: false };
  /*
   * Audio is fed from frame(), and browsers stop animation frames for a
   * hidden tab while the AudioContext keeps playing, so without this the
   * last motor and wind values would hold for as long as the tab is away.
   * Feeding stopped rotors once lets the normal spool-down fade run; the
   * first frame after return restores the live mix.
   *
   * A flight in progress also pauses, exactly as Escape would, so the
   * pilot returns to the pause menu rather than to a craft already moving
   * and a lap clock still running.
   */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      return;
    }
    audioRpm.fill(0);
    audio.update(audioRpm, 0);
    if (mode === 'flight' && ui.screen === 'flight') {
      ui.act('pause');
      ui.show('paused');
    }
    /* Now, while a hidden tab can still send: its frames, and the room's
     * look at the profile with them, stop until it is back. */
    roomTellProfile();
  });
  let firstFrameMs = -1;
  let frames = 0;
  /*
   * HARNESS PROBES, part one: the craft, the ground under it, the score and
   * the colliders.
   *
   * Everything named window.__* below exists for the checks in scripts/ and
   * for capture rigs. The shell never calls them. Their names and the shape
   * of what they return are a contract with those checks, and
   * scripts/probe-golden.js holds the whole answer of each one in fixed
   * states, so a field cannot quietly go missing.
   *
   * The frame loop copies the renderer's per frame counts into renderStats
   * (autoReset is off so the composer's passes add up into one frame).
   */
  const renderStats = { calls: 0, triangles: 0 };
  shell.renderer.info.autoReset = false;

  /* Scratch for the attitude reads, kept apart from the scorer's own. */
  const probeQuat = new THREE.Quaternion();
  const probeVec = new THREE.Vector3();
  const plain = (v) => ({ x: v.x, y: v.y, z: v.z });

  /* The craft's axes and velocity in three.js world space, the conversion
   * the recogniser uses: sim quaternion, then the spawn rotation. */
  function probeAxis(st, x, y, z) {
    simQuatToThree(st[7], st[8], st[9], st[10], probeQuat);
    probeQuat.premultiply(qSpawn);
    return plain(probeVec.set(x, y, z).applyQuaternion(probeQuat));
  }
  /* World velocity needs no attitude: the plant's velocity is already in
   * its world frame, so the axis swap and the spawn turn are all of it.
   * (Rotating it by the attitude as well was tried once and doubled the
   * tracking error of every guidance law built on it.) */
  function probeVelocity(st) {
    simPosToThree(st[4], st[5], st[6], probeVec);
    return plain(probeVec.applyQuaternion(qSpawn));
  }

  /* The module's optional exports: a probe answers `none` for an aircraft or
   * build that does not have one. */
  const wasm = (name, none, ...args) => (typeof sim.e[name] === 'function' ? sim.e[name](...args) : none);

  window.__renderStats = () => ({ ...renderStats });
  window.__dynres = () => ({ ...dynres.state, pixelRatio: shell.pixelRatio, fps });
  /* Live geometries, textures and shader programs: the numbers that say
   * whether leaving a map gave its memory back (scripts/memory-check.js). */
  window.__gpuMemory = () => {
    const { memory, programs } = shell.renderer.info;
    return { geometries: memory.geometries, textures: memory.textures, programs: programs ? programs.length : 0 };
  };

  /* Live handles. __race is a getter because a map swap replaces the race
   * object; the others live as long as the page. */
  window.__ui = ui;
  window.__input = input;
  window.__race = () => race;
  window.__audio = audio;

  /* The picker and the hangar (scripts/hangar-check.js, progress-check.js). */
  window.__carouselStats = () => pickStage.stats();
  /* The exploded part at client pixels on the hangar's model, for a check. */
  window.__hangarPartAt = (x, y) => (ui.hangar.isOpen ? pickStage.pickPart(ui.hangar.id, x, y) : null);
  window.__walkStats = () => (ui.walk ? {
    pose: ui.walk.pose, tier: ui.walk.tier, stations: ui.walk.stations, prompt: ui.walk.promptKey, turntable: walkRoom.lastTurntable, view: walkRoom.view ? walkRoom.view.stats() : null,
  } : null);
  window.__lastSwap = () => lastSwap;
  window.__craftPaint = () => shell.craftPaint(drawnCraft);
  window.__pickPaint = (id) => pickStage.paint(id);
  window.__pickLook = (id) => pickStage.look(id);
  window.__pickParts = (id) => pickStage.fitted(id);
  window.__pickCombat = (id) => pickStage.combat(id);
  window.__hangarRev = () => {
    const voiceName = Object.keys(VOICES).find((name) => VOICES[name] === audio.voice);
    return {
      rev: hangarRev ? { voice: hangarRev.voice, was: hangarRev.was, ms: hangarRev.ms ?? null } : null,
      voice: voiceName ?? null,
      rpm: audioRpm.slice(),
    };
  };

  /*
   * The seated aircraft as each layer sees it: the setting, what this run
   * flies, what the module integrates and what the scene draws. They are
   * separate on purpose, because the bug worth catching is two of them
   * disagreeing (a whoop drawn, a 700 g quad integrated).
   */
  window.__craft = () => {
    const af = airframeById(runAirframe);
    const motors = hasMotors(runAirframe) && typeof sim.e.sim_bf_debug === 'function'
      ? {
        ke: sim.e.sim_bf_debug(62),
        r: sim.e.sim_bf_debug(61),
        j: sim.e.sim_bf_debug(60),
        kt: sim.e.sim_bf_debug(10),
        rCell: sim.e.sim_bf_debug(63),
      }
      : null;
    return {
      setting: ui.settings.airframe,
      run: runAirframe,
      module: wasm('sim_airframe', -1),
      drawn: shell.quad.name,
      shown: drawnCraft,
      sweepM: CRAFT_R,
      massKg: wasm('sim_bf_debug', 0, 51),
      ixx: wasm('sim_bf_debug', 0, 55),
      power: readPower(),
      cells: runCells,
      motors,
      addons: (af.fixedWing || af.combat) && typeof sim.e.sim_addons_state === 'function' ? sim.addonsState() : null,
      combat: af.combat && combatSeatKey ? JSON.parse(combatSeatKey) : null,
      parts: shell.quad.userData.partsFit ?? null,
      smoke: { on: smokeOn, puffs: smoke.live() },
      bladeScale: audio.bladeScale,
      tune: af.fixedWing && typeof sim.e.sim_wing_tune === 'function' ? Array.from(sim.tune()) : null,
      flapNotch,
      standAudio: { voice: standVoiceOn, rpm: standVoiceOn ? audioRpm[0] : 0 },
    };
  };

  /* The drawn craft against the floor beneath it, the numbers behind any
   * "it sinks into the ground" report. */
  window.__ground = () => {
    const floor = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS);
    return {
      y: pCurr.y,
      surf: floor,
      above: pCurr.y - floor,
      clearance: lastClearance,
      rest: REST_HEIGHT,
      landed,
      hits: lastGroundHits,
      contactSteps: groundContactSteps,
      material: SURFACES[groundMaterialNow],
    };
  };

  /* Park the camera at (a, b, c) looking at (d, e, f); null hands it back.
   * The optional fov pins the lens too, since otherwise a capture gets the
   * title's lens or the pilot's depending on how fast the machine booted. */
  window.__setCam = (a, b, c, d, e, f, fov) => {
    camOverride = a == null ? null : [a, b, c, d, e, f, fov];
  };

  window.__intro = () => {
    const live = introMs >= 0;
    return {
      ms: introMs,
      holding: live && introMs < INTRO_FLY,
      orbiting: live && introMs < INTRO_ORBIT,
      approaching: introMs >= INTRO_ORBIT && introMs < INTRO_FLY,
      zooming: introMs >= INTRO_FLY && introMs < INTRO_TOTAL,
      quadVisible: shell.quad.visible,
    };
  };

  /* A point on the course curve at u (0 to 1), its heading and the ground
   * under it; null on a map without a curve. */
  window.__trackPoint = (u) => {
    if (!view.curve) {
      return null;
    }
    const at = view.curve.getPointAt(u);
    const dir = view.curve.getTangentAt(u);
    return { x: at.x, y: at.y, z: at.z, tx: dir.x, tz: dir.z, ground: view.height(at.x, at.z) };
  };

  /*
   * Freestyle scoring: the run's summary, and the horn without waiting out
   * the clock, which a headless page would take minutes to reach.
   */
  window.__score = () => score.summary();
  window.__scoreFinish = () => {
    score.finish();
    endFreestyleRun();
    return score.summary();
  };

  /* The obstacle field the trick recogniser reads, counted by kind; null
   * on a map without one. */
  window.__obstacles = () => {
    if (!obstacles) {
      return null;
    }
    return { count: obstacles.count, poles: obstacles.countOf(OB_POLE), bars: obstacles.countOf(OB_BAR) };
  };

  /* Distance to the nearest solid by the recogniser's own query (the Wall
   * Ride test, see WALL_NEAR_M); null on a map without colliders. */
  window.__nearSolid = (x, y, z, r = WALL_NEAR_M) => (view.colliders ? view.colliders.gapAt(x, y, z, r) : null);

  /*
   * Skip the draw and keep everything else: frame loop, accumulator, fixed
   * step and interpolation run as before. On a software rasteriser a heavy
   * world draws a few frames a second, and a probe steering from
   * requestAnimationFrame cannot fly anything at that rate.
   */
  window.__drawOff = (on = true) => {
    harnessNoDraw = Boolean(on);
    return harnessNoDraw;
  };

  /* The mode the plant is in, not the one the menu shows: angle cannot loop. */
  window.__flightMode = () => (angleModeOn ? 'angle' : 'acro');

  /* Gravity as the menu, this run and the module each hold it, and the
   * record key built from the run's value. */
  window.__air = () => ({
    setting: ui.settings.weight,
    run: runWeight,
    scale: runGravityScale,
    module: wasm('sim_gravity', null),
    key: recordKey(),
  });

  /* The contact pass's counters: whether a wall was seen at all (bounces),
   * how hard (lastImpulse) and where a tap ends and a smack begins. */
  window.__contacts = () => ({
    ...passStats,
    interior: obsInterior,
    leftover: obsLeftover,
    roof: obsRoof,
    bounces: bounceCount,
    lastImpulse,
    log: contactLog.slice(),
    obstacle: obstacleLog.slice(),
    grazeMax: GRAZE_SPEED_MAX,
    bounceMax: BOUNCE_SPEED_MAX,
  });

  window.__colliders = () => view.colliders.stats();

  /*
   * Solid boxes whose centre lies within r of (x, z), as
   * [ax, ay, az, bx, by, bz, index] (a turned box by its world bounds), for
   * drawing over a screenshot (scripts/collider-overlay.js). The index is
   * what a roof's `solids` list refers to.
   */
  window.__colliderBoxes = (x, z, r) => {
    const set = view.colliders;
    const found = [];
    if (!set.fbox) {
      return found;
    }
    set.fbox.forEach((isBox, i) => {
      if (!isBox) {
        return;
      }
      const mx = (set.fax[i] + set.fbx[i]) * 0.5;
      const mz = (set.faz[i] + set.fbz[i]) * 0.5;
      if (Math.hypot(mx - x, mz - z) > r) {
        return;
      }
      found.push([set.fax[i], set.fay[i], set.faz[i], set.fbx[i], set.fby[i], set.fbz[i], i]);
    });
    return found;
  };

  /*
   * Length, thickness, how upright (1 vertical, 0 flat) and lowest point of
   * collider i, by the rules the obstacle derivation uses. A box is judged
   * by its own sides when turned. An upright box's thickness is its larger
   * footprint side; a lying one's is the larger of its thin side and its
   * height, so a wide flat deck never passes for a thin bar.
   */
  function colliderFigure(set, i) {
    if (!set.fbox[i]) {
      const dx = set.fbx[i] - set.fax[i];
      const dy = set.fby[i] - set.fay[i];
      const dz = set.fbz[i] - set.faz[i];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return {
        len,
        thick: set.fr[i] * 2,
        upright: len > 1e-6 ? Math.abs(dy / len) : 1,
        lowY: Math.min(set.fay[i], set.fby[i]) - set.fr[i],
      };
    }
    const turned = set.fbox[i] === TURNED;
    const sideA = turned ? set.fu1[i] - set.fu0[i] : Math.abs(set.fbx[i] - set.fax[i]);
    const sideB = turned ? set.fw1[i] - set.fw0[i] : Math.abs(set.fbz[i] - set.faz[i]);
    const tall = Math.abs(set.fby[i] - set.fay[i]);
    const aWider = sideA > sideB;
    const wide = aWider ? sideA : sideB;
    const narrow = aWider ? sideB : sideA;
    const lowY = Math.min(set.fay[i], set.fby[i]);
    if (tall >= wide) {
      return { len: tall, thick: wide, upright: 1, lowY };
    }
    return { len: wide, thick: narrow > tall ? narrow : tall, upright: 0, lowY };
  }

  /*
   * A census of every collider by shape, and of the near misses: long
   * horizontal pieces that failed to count as a bar, with the reason. It
   * answers "does this world have bars to fly under" for the real map,
   * where every self-test builds its own tidy field. The pole and bar tests
   * are written out again here rather than imported, so the census can
   * disagree with the derivation when the derivation is wrong.
   */
  window.__colliderShapes = (opts = {}) => {
    const set = view.colliders;
    const census = {
      total: 0, boxes: 0, capsules: 0, byKind: {}, poles: 0, bars: 0, near: [], barList: [],
    };
    if (!set || !set.fbox) {
      return census;
    }
    const keep = opts.near ?? 12;
    const r1 = (v) => +v.toFixed(1);
    const r2 = (v) => +v.toFixed(2);
    for (let i = 0; i < set.fbox.length; i += 1) {
      const kind = KINDS[set.fkind[i]] ?? String(set.fkind[i]);
      const box = Boolean(set.fbox[i]);
      census.total += 1;
      census.byKind[kind] = (census.byKind[kind] ?? 0) + 1;
      if (box) {
        census.boxes += 1;
      } else {
        census.capsules += 1;
      }
      const { len, thick, upright, lowY } = colliderFigure(set, i);
      const mx = (set.fax[i] + set.fbx[i]) * 0.5;
      const mz = (set.faz[i] + set.fbz[i]) * 0.5;
      /* Daylight under the piece, measured below its own base: the plain
       * height query answers with whatever is stacked on top. */
      const clear = lowY - view.height(mx, mz, lowY);
      const summary = { kind, box, at: [r1(mx), r1(lowY), r1(mz)], len: r2(len), thick: r2(thick), clear: r2(clear) };
      if (upright >= 0.9 && thick <= 0.9 && len >= 2.5) {
        census.poles += 1;
      } else if (upright <= 0.1 && thick <= 0.8 && len >= 2 && clear >= 1.5) {
        census.bars += 1;
        if (census.barList.length < keep) {
          census.barList.push({
            ...summary,
            a: [r1(set.fax[i]), r1(set.fay[i]), r1(set.faz[i])],
            b: [r1(set.fbx[i]), r1(set.fby[i]), r1(set.fbz[i])],
            r: r2(set.fr[i]),
          });
        }
      } else if (census.near.length < keep && upright <= 0.3 && len >= 2) {
        let failed = 'too short';
        if (thick > 0.8) {
          failed = 'too thick';
        } else if (clear < 1.5) {
          failed = str('main.no_daylight_under_it');
        }
        census.near.push({ ...summary, failed });
      }
    }
    return census;
  };

  /* Cel materials the per frame clock walks; back to its boot value after a
   * map round trip, or a dead uniform is being kept alive. */
  window.__celCount = () => celTimeCount();

  /* The radio link: switch preset with an id, and read what is in force. */
  window.__link = (id) => {
    if (id != null) {
      rcLink.setPreset(id);
      rcLink.reset(rcNextMs);
    }
    const { hz, delayMs, jitterMs, lossPpm, sent, dropped } = rcLink;
    return { id: rcLink.id, hz, delayMs, jitterMs, lossPpm, sent, dropped, presets: Object.keys(LINK_PRESETS) };
  };

  /* The flight recorder: whether it runs, what it holds, and the length of
   * the CSV the download button would save. */
  window.__flightLog = () => ({
    on: flightLog.on,
    rows: flightLog.count,
    seconds: flightLog.seconds,
    csv: flightLog.count > 1 ? flightLog.csv().length : 0,
  });

  /* The ghost chase: what is armed, what is being recorded, where the rig is. */
  window.__ghost = () => {
    const course = ghostCourseKey();
    const best = ghostBook.best(course);
    const previous = ghostBook.previous(course);
    return {
      choice: ghostChoice,
      armed: Boolean(ghostLap),
      armedLabel: ghostLap ? ghostLap.label : '',
      armedMs: ghostLap ? ghostLap.durationMs : null,
      recording: ghostRecorder.armed,
      recordedFrames: ghostRecorder.pos.length / 3,
      bestMs: best ? best.durationMs : null,
      previousMs: previous ? previous.durationMs : null,
      visible: ghostRig.group.visible,
      position: ghostRig.group.position.toArray(),
      gapMs: ghostGap ? ghostGap.deltaMs : null,
      boardTimes: (ghostBoardTimes || []).length,
    };
  };
  /* Arm a lap from wire base64 as if the board had sent it. */
  window.__ghostLoad = (b64, name) => {
    const lap = new GhostLap(decodeGhost(ghostFromBase64(b64)), {
      label: str('main.board_lap'),
      name: name || 'Harness',
      source: 'board',
    });
    lap.timeId = 'tm-00000000';
    ghostBoardLap = lap;
    ghostChoice = `board:${lap.timeId}`;
    armGhost();
    syncGhostRow();
    return { armed: Boolean(ghostLap), durationMs: lap.durationMs, splits: lap.splits.length };
  };
  window.__ghostPick = (id) => {
    pickGhost(String(id));
    return ghostChoice;
  };
  /* Light the OSD's gap readout for 2.8 s without flying two laps. */
  window.__ghostGapShow = (deltaMs, final) => {
    ghostGap = { deltaMs: Number(deltaMs), final: Boolean(final), untilWall: performance.now() + 2800 };
    return ghostGap;
  };
  /* A session lap as wire base64 ('previous', or the best otherwise). */
  window.__ghostExport = (which) => {
    const course = ghostCourseKey();
    const lap = which === 'previous' ? ghostBook.previous(course) : ghostBook.best(course);
    return lap ? ghostToBase64(encodeGhost(lap)) : null;
  };

  /*
   * The craft's whole state for a probe that flies on feedback: modes and
   * recovery flags, where it is and how it is turned, the last ground
   * contact and the thresholds it was judged on, the lens's clearance, the
   * lap. World figures are three.js space; plantPos is the plant's own frame
   * (z up, spawn at the origin), where thermals live; simS is the plant's
   * clock, which a slow headless page does not stretch.
   */
  window.__craftState = () => {
    const st = stateCurr;
    const af = airframeById(runAirframe);
    let floats = null;
    if (af.floats && typeof sim.e.sim_float_state === 'function') {
      if (!floatStatePtr) {
        floatStatePtr = sim.e.malloc(10 * 8);
      }
      sim.e.sim_float_state(floatStatePtr);
      floats = { state: Array.from(new Float64Array(sim.e.memory.buffer, floatStatePtr, 10)), onWater: floatsOnWater() };
    }
    const at = shell.quad.position;
    return {
      mode,
      tune: configId,
      flownThisRun,
      landed,
      crashed,
      clipCrash: crashed,
      clipCrashKind,
      wingStab: wasm('sim_wing_stab', null),
      /* turtle is the scripted recovery; manualFlip and crashflipActive are
       * Betaflight's own crashflip, which looks the same from outside. */
      turtle: crashflipOn,
      manualFlip,
      crashflipActive: sim.e.sim_crashflip_active() !== 0,
      turtleWait,
      turtleFlip: turtleFlip.active,
      turtleParked: isTurtleParked(),
      turtleRecover,
      turtleResumeGate,
      banner: ui.banner ? ui.banner.textContent : '',
      notice: notice ? notice.text : '',
      worldX: at.x,
      worldY: at.y,
      worldZ: at.z,
      /* Where the shell's camera stands, world space, for a check on how a
       * view frames the craft (extra-owner.js's hover). */
      camera: { x: shell.camera.position.x, y: shell.camera.position.y, z: shell.camera.position.z },
      /* Null mid world swap, when `view` is the world being disposed. */
      groundClearance: mapReady ? at.y - view.height(at.x, at.z, at.y - SURFACE_BIAS) : null,
      pitchDeg: st ? pitchNoseDownDeg(st) : 0,
      up: st ? probeAxis(st, 0, 1, 0) : null,
      fwd: st ? probeAxis(st, 0, 0, -1) : null,
      vel: st ? probeVelocity(st) : null,
      speed: st ? Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]) : 0,
      rates: st ? { p: st[11], q: st[12], r: st[13] } : null,
      simS: st ? st[0] : 0,
      plantPos: st ? { x: st[1], y: st[2], z: st[3] } : null,
      airLift: st && typeof sim.e.sim_air_lift === 'function' ? sim.e.sim_air_lift(st[1], st[2], st[3]) : 0,
      discusPhase: wasm('sim_wing_discus_phase', 0),
      floats,
      descentRate: lastDescent,
      tiltDeg: lastTiltDeg,
      lastHitKind,
      lastHitIndex,
      lastClosingSpeed: lastClosing,
      lastUpDot,
      lastUpz,
      bounceCount,
      grazeSpeedMax: GRAZE_SPEED_MAX,
      bounceSpeedMax: BOUNCE_SPEED_MAX,
      propPlaneMaxUpDot: PROP_PLANE_MAX_UP_DOT,
      fpvY: lastFpvY,
      camFloor: lastCamFloor,
      camClear: lastCamClear,
      camFwdY: lastCamFwdY,
      camUpY: lastCamUpY,
      /* craftRadius is the radius the contact query sweeps, in world metres
       * (what check 15 holds against the drawn model); the airframe's own
       * figures sit beside it so the two are never confused. */
      thresholds: {
        descentMax: LAND_DESCENT_MAX,
        horizontalMax: LAND_HORIZONTAL_MAX,
        tiltMaxDeg: LAND_TILT_MAX_DEG,
        tiltHardDeg: LAND_TILT_HARD_DEG,
        tipSpeedMax: LAND_TIP_SPEED_MAX,
        craftRadius: CRAFT_WORLD_R,
        craftRadiusTrue: CRAFT_R,
        craftUpTrue: CRAFT_V_UP,
        craftDownTrue: CRAFT_V_DOWN,
        worldScale: WORLD_SCALE,
      },
      lap: race.lap,
      bestLapMs: race.bestLapMs ? race.bestLapMs() : null,
      bestThreeMs: race.bestThreeMs ? race.bestThreeMs() : null,
    };
  };

  /*
   * Teleports for capture rigs. Both put the plant at a pose with
   * sim_set_pose, settle it, clear every recovery and launch state that
   * would otherwise act on the new pose, and re-seed the contact pass so its
   * next sweep does not run from the old position to the new one through
   * half the map. Both answer with __craftState(), or { ok: false, code }
   * when the module refuses the pose.
   */
  function teleportPlant(world, qw, qx, qy, qz) {
    worldPosToSim(world.x, world.y, world.z, pSim);
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, qw, qx, qy, qz);
    if (code !== SIM_OK) {
      return code;
    }
    sim.rest();
    setCrashflip(false);
    turtleRecover = false;
    introMs = -1;
    camOverride = null;
    takingOff = false;
    obsHasPrev = false;
    obsPhase = 0;
    return SIM_OK;
  }
  /* The drawn craft onto the plant's current state. */
  function drawPlantPose() {
    poseFromState(stateCurr, pCurr);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qPrev);
    qPrev.premultiply(qSpawn);
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
  }

  /*
   * Seat the craft on the ground under where it is now:
   *   (default)     level on its skids, landed;
   *   cameraDown    on its side with the lens to the ground, pose frozen;
   *   inverted      upside down, which starts the turtle wait;
   *   invertedHold  upside down, pose frozen;
   *   invertedAir   upside down 4 m up.
   * The frozen ones (poseLock) let a capture photograph the lens before the
   * hull falls over; __releasePose lets go. The camera is placed at once,
   * so a capture taken before the next frame sees the seat.
   */
  window.__seatCraft = (kind) => {
    if (!stateCurr) {
      return null;
    }
    const upsideDown = kind === 'inverted' || kind === 'invertedHold' || kind === 'invertedAir';
    const airborne = kind === 'invertedAir';
    poseFromState(stateCurr, pProbe);
    const floorY = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    pProbe.y = floorY + (airborne ? 4 : REST_HEIGHT);
    let turn = [1, 0, 0, 0];
    if (upsideDown) {
      turn = [0, 1, 0, 0];
    } else if (kind === 'cameraDown') {
      turn = [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0];
    }
    const code = teleportPlant(pProbe, ...turn);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    poseLock = kind === 'cameraDown' || kind === 'invertedHold';
    landed = !upsideDown && kind !== 'cameraDown';
    parkedLift = 0;
    adoptSimClock();
    acc = 0;
    groundY = floorY;
    stateCurr = readState();
    statePrev = stateCurr;
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    lastClearance = airborne ? 4 : REST_HEIGHT;
    turtleOnSupport = lastGroundHits > 0 && !airborne;
    if (kind === 'inverted') {
      turtleOnSupport = true;
      beginTurtleWait(true);
    }
    lastUpz = plantUpZ(stateCurr);
    lastTiltDeg = (Math.acos(Math.min(1, Math.max(-1, lastUpz))) * 180) / Math.PI;

    drawPlantPose();
    shell.quad.visible = false;
    camFwd.set(0, 0, -1).applyQuaternion(qPrev);
    camUp.set(0, 1, 0).applyQuaternion(qPrev);
    fpvPos.copy(pCurr)
      .addScaledVector(camFwd, simLenToWorld(camMountFwd))
      .addScaledVector(camUp, simLenToWorld(camMountUp));
    lastCamFwdY = camFwd.y;
    lastCamUpY = camUp.y;
    lastCamClear = fpvLensClear(camFwd.y, camUp.y);
    lastCamFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS) + lastCamClear;
    if (fpvPos.y < lastCamFloor) {
      fpvPos.y = lastCamFloor;
    }
    lastFpvY = fpvPos.y;
    fpvQuat.copy(qPrev).multiply(qTilt);
    shell.camera.position.copy(fpvPos);
    shell.camera.quaternion.copy(fpvQuat);
    shell.camera.fov = ui.settings.cameraFov;
    shell.camera.updateProjectionMatrix();
    return window.__craftState();
  };

  /*
   * Drop the craft level and airborne at a world point, in flight, as if a
   * run were under way. (fromX, fromY, fromZ) is where the race and ground
   * sweeps think the craft was last frame, for a test that needs the chord
   * between the two to cross something; it defaults to the point itself.
   */
  window.__placeCraft = (x, y, z, fromX, fromY, fromZ) => {
    if (!stateCurr) {
      return null;
    }
    const code = teleportPlant({ x, y, z }, 1, 0, 0, 0);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    turtleWait = false;
    setTurtleParkMotors(false);
    poseLock = false;
    landed = false;
    launchStaging = false;
    flownThisRun = true;
    crashed = false;
    clipCrashKind = '';
    clipCrashUntil = 0;
    clipGraceUntil = 0;
    mode = 'flight';
    ui.show('flight');
    resetClipWatch(clipWatch);
    adoptSimClock();
    acc = 0;
    stateCurr = readState();
    statePrev = stateCurr;
    drawPlantPose();
    if (fromX == null) {
      racePrev.copy(pCurr);
    } else {
      racePrev.set(fromX, fromY, fromZ);
    }
    raceHasPrev = true;
    groundHasPrev = true;
    groundPrev.copy(racePrev);
    return window.__craftState();
  };
  window.__releasePose = () => {
    poseLock = false;
    return true;
  };
  /*
   * Crash harness. __crash() is the crash shell's state: the mode, the
   * damage flags by name, whether the craft is a wreck, the pieces drawn
   * and where, the trees and solids declared, the feed. __crashThrow puts
   * the craft at a world point with an attitude (degrees: yaw about up,
   * then pitch, then roll) and a world velocity (m/s), in flight, so a
   * capture can fly a crash without a pilot. __crashBreak and
   * __crashSetDamage are sim_part_break and sim_part_set_damage, for a
   * scenario that starts damaged. All of it goes through the module's ABI.
   */
  window.__crash = () => crashSummary();
  /* The jelly's whacks this run (jellyPass), and whether the seated
   * aircraft meets the soft pieces as jelly. */
  window.__jelly = () => ({ soft: softKindsFor() !== 0, whacks: jellyLog.map((w) => ({ ...w })) });
  window.__crashThrow = (o) => {
    crashCamShowsCraft = o.showCraft !== false;
    /* `fresh` puts the plant back to its first step first, as R does, so
     * the throw starts from the same plant whatever the craft did on the
     * pad before it: an aircraft on floats rocks on the lake from the
     * moment R puts it there, and was thrown after however many steps of
     * that the wall clock allowed. */
    if (o.fresh) {
      resetCraft(null);
    }
    /* `clockMs` sets the lap clock, which resetCraft leaves running and
     * the town's traffic is a function of (view.updateAnim): two throws
     * that are to trace the same meet the same cars only if they start at
     * the same ms of it. Stamps held on that clock go back with it, as in
     * reset(). */
    if (o.clockMs != null) {
      simTimeMs = o.clockMs;
      simClockPrevMs = simTimeMs;
      trickTouchAtSimMs = -1e9;
      race.prevSimMs = null;
    }
    const placed = window.__placeCraft(o.x, o.y, o.z);
    if (!placed || placed.ok === false) {
      return placed;
    }
    const d2r = Math.PI / 180;
    const qWorld = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((o.pitch ?? 0) * d2r, (o.yaw ?? 0) * d2r, (o.roll ?? 0) * d2r, 'YXZ'),
    );
    const qPlant = qWorld.premultiply(qSpawnInv);
    worldPosToSim(o.x, o.y, o.z, pSim);
    let code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, qPlant.w, -qPlant.z, -qPlant.x, qPlant.y);
    if (code !== SIM_OK) {
      return { ok: false, code: simErrorName(code) };
    }
    worldDirToSim(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0, nSim);
    code = sim.e.sim_set_velocity(nSim.x, nSim.y, nSim.z, o.p ?? 0, o.q ?? 0, o.r ?? 0);
    if (code !== SIM_OK) {
      return { ok: false, code: simErrorName(code) };
    }
    obsHasPrev = false;
    obsPhase = 0;
    contactLog.length = 0;
    obstacleLog.length = 0;
    crashLog.length = 0;
    jellyLog.length = 0;
    jellyHasPrev = false;
    jellyArmed = true;
    contactLogOn = true;
    stepTrace.on = true;
    stepTrace.n = 0;
    inputTrace.length = 0;
    stateCurr = readState();
    statePrev = stateCurr;
    /* The attitude every collider query reads, which the frame loop
     * refreshes only while it steps: a held throw would otherwise be
     * probed (window.__hit) at the attitude before it. */
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
    qCollide.premultiply(qSpawn);
    vHalfFrame = craftVerticalHalf(Math.sqrt(1 - craftUpY() * craftUpY()));
    /* A throw is a teleport, and the plant keeps the solids it was told
     * of across sim_reset: its first step would meet the ones declared
     * where the craft was (a quad thrown onto the race field's verandah
     * after one on the pavilion was inside the verandah's roof box, which
     * the pavilion's cover had not taken out). The world is declared
     * where the throw puts it, before that step. */
    if (runDamage) {
      crashWorldX = NaN;
      crashWorldPhase = 0;
      refreshCrashWorld(stateCurr);
    }
    /* `hold` keeps the integrator still until __releasePose, so a capture
     * can photograph the moment before. */
    poseLock = Boolean(o.hold);
    return { ok: true, state: Array.from(stateCurr.slice(0, 11)) };
  };
  /* The solids of one collider kind near a world point, nearest first, for
   * a capture to aim a crash at: { box, a: [x, y, z], b, r }. */
  window.__crashSolids = (x, z, r, kind) => {
    const c = view.colliders;
    const out = [];
    const k = KINDS.indexOf(kind);
    for (let i = 0; c.fkind && i < c.fkind.length; i += 1) {
      if (c.fkind[i] !== k) {
        continue;
      }
      const d = Math.hypot((c.fax[i] + c.fbx[i]) / 2 - x, (c.faz[i] + c.fbz[i]) / 2 - z);
      if (d <= r) {
        /* A turned box's a and b are its world bounding box, and `turned`
         * its own frame: [ux, uz, u0, u1, w0, w1] (collide.js addTurnedBox). */
        out.push({
          d, box: Boolean(c.fbox[i]), a: [c.fax[i], c.fay[i], c.faz[i]], b: [c.fbx[i], c.fby[i], c.fbz[i]], r: c.fr[i],
          turned: c.fbox[i] === TURNED ? [c.fux[i], c.fuz[i], c.fu0[i], c.fu1[i], c.fw0[i], c.fw1[i]] : null,
        });
      }
    }
    return out.sort((u, v) => u.d - v.d);
  };
  /* Every declared solid that gives (sim_obstacle_compliance), with its
   * state: { i, deflection m, at m over its base, freed, gone, moment N m },
   * for a check that a post or a pylon moved when it was met. */
  window.__crashPosts = () => {
    const out = [];
    const n = crashSolidsDeclared;
    const p = sim.e.malloc(6 * 8);
    for (let i = 0; i < n; i += 1) {
      if (sim.e.sim_obstacle_state(i, p) !== SIM_OK) {
        continue;
      }
      const d = new Float64Array(sim.e.memory.buffer, p, 6);
      out.push({ i, deflection: Math.hypot(d[0], d[1]), at: d[2], freed: d[3] === 1, gone: d[4] === 1, moment: d[5] });
    }
    sim.e.free(p);
    return out;
  };
  /* The map's water bodies, where a capture throws an aircraft on floats. */
  window.__crashWater = () => (view.water || []).map((w) => ({
    kind: w.kind, spawn: w.spawn, surfaceY: w.surfaceY, line: w.line, halfWidth: w.halfWidth,
  }));
  window.__crashBreak = (part) => simErrorName(sim.e.sim_part_break(part));
  window.__crashSetDamage = (part, d) => simErrorName(sim.e.sim_part_set_damage(part, d));
  /* Each drawn piece's farthest vertex outside its part's hull box, for a
   * check that no stray triangle rides off with a broken part. */
  window.__wreckAudit = () => wreckRig.audit();
  /* The damage events since the last reset or throw, oldest first: { t sim s, part,
   * type, ratio of the load to its limit, force N, moment N m, closing
   * m/s, surface }. A break cues the snap, a crush the crunch, a chip the
   * chip, water the splash. */
  window.__crashLog = () => crashLog.slice();
  window.__crashTable = () => partTable;
  /* The step trace since the last throw (THE STEP TRACE): per step, the
   * hashes of the state in, the ground plane, the state out. */
  window.__stepTrace = () => {
    const count = stepTrace.n;
    const upTo = (column) => Array.from(column.subarray(0, count));
    return {
      n: count,
      pre: upTo(stepTrace.pre),
      plane: upTo(stepTrace.plane),
      post: upTo(stepTrace.post),
      inputs: inputTrace.slice(),
    };
  };
  /*
   * The tune and the PIDs as each layer holds them: the menu, the composed
   * block, and the module read back through sim_bf_debug and the config
   * getters. A tune picked but never loaded, or loaded and ignored, shows
   * up as two of these disagreeing (scripts/preset-lint.js asserts the
   * same counters headless, scripts/shots.js the PIDs). The debug slots:
   * 13 applied, 14 inert, 15 unknown config lines, 17 roll P, 21 roll D max,
   * 22 TPA rate, 42 roll super rate.
   */
  const bfDebug = (slot) => (sim.e.sim_bf_debug ? sim.e.sim_bf_debug(slot) : null);
  const moduleValues = (names) => Object.fromEntries(names.map((name) => [name, moduleGet(sim, name)]));
  window.__tune = () => ({
    id: configId,
    name: configName,
    menu: ui.settings.tune,
    offered: TUNES.map((t) => t.id),
    rates: ratesSummary(ui.settings.rates),
    /* The menu's roll super rate in firmware units, beside rollSrate. */
    rollSrateSet: ui.settings.rates.roll.srate,
    applied: bfDebug(13),
    inert: bfDebug(14),
    unknown: bfDebug(15),
    pRoll: bfDebug(17),
    dMaxRoll: bfDebug(21),
    tpaRate: bfDebug(22),
    rollSrate: bfDebug(42),
    profile: moduleValues([
      'rates_type', 'roll_rc_rate', 'roll_srate', 'pitch_srate', 'yaw_srate', 'roll_expo',
      'throttle_limit_type', 'throttle_limit_percent',
    ]),
  });
  window.__setTune = (id) => {
    ui.settings.tune = id;
    applySettings(ui.settings);
  };
  window.__pids = () => {
    const m = moduleValues([
      'simplified_pids_mode', 'simplified_master_multiplier', 'p_roll', 'i_roll', 'd_roll',
      'd_min_roll', 'f_roll', 'p_pitch', 'p_yaw', 'f_yaw',
    ]);
    return {
      id: configId,
      menu: JSON.parse(JSON.stringify(ui.settings.pids ?? {})),
      block: pidsText,
      module: {
        mode: m.simplified_pids_mode,
        master: m.simplified_master_multiplier,
        p_roll: m.p_roll,
        i_roll: m.i_roll,
        d_roll: m.d_roll,
        d_min_roll: m.d_min_roll,
        f_roll: m.f_roll,
        p_pitch: m.p_pitch,
        p_yaw: m.p_yaw,
        f_yaw: m.f_yaw,
      },
    };
  };
  /* The thumb sticks as the overlay holds them and what became of them
   * downstream (source, angle mode, altitude); null without touch. */
  window.__touch = () => {
    if (!touch) {
      return null;
    }
    return {
      ...touch.debug(),
      primary: input.isTouchPrimary(),
      source: input.stats().source,
      angle: angleModeOn,
      alt: readState()[3],
    };
  };
  /*
   * The stick path measured: how often the browser refreshes the pad
   * (padHz), how often a change reaches the queue (sampleHz), the fixed rate
   * handed to Betaflight (rcHz), against the display's fps. A padHz pinned to
   * the frame rate means the browser hands one stick value per frame.
   * ui.bugSnapshot reads the short form when a pilot sends a report, which
   * is where this question gets answered; __stickPath adds the queue.
   */
  const stickRates = () => ({ ...input.stats(), rcHz: RC_HZ, fps: Math.round(fps) });
  ui.setStickProbe(stickRates);
  window.__stickPath = () => ({
    ...stickRates(),
    pending: rcPending.length,
    held: { ...rcHeld },
    simStepIdx,
    lastTs,
    rcNextMs,
    moduleMs: Math.round(readState()[0] * 1000),
    configGen,
  });
  /* The page's boot and frame cost figures (P6 and the block budgets). */
  window.__boot = () => ({
    frames,
    firstFrameMs,
    worstBlockMs,
    worstShellMs,
    worstAudioMs,
  });

  /*
   * Where a world point lands in the PNG a capture writes: drawing buffer
   * pixels (CSS pixels times the pixel ratio), origin top left. A point
   * behind the camera projects mirrored through the centre and would look
   * plausible, so `inFront` travels with every position.
   */
  function probeScreen(point) {
    const canvas = shell.renderer.domElement;
    const ndc = point.clone().project(shell.camera);
    const inFront = ndc.z > -1 && ndc.z < 1;
    return {
      x: (ndc.x * 0.5 + 0.5) * canvas.width,
      y: (1 - (ndc.y * 0.5 + 0.5)) * canvas.height,
      ndcZ: ndc.z,
      inFront,
      mirrored: !inFront,
    };
  }

  /*
   * The next three gates the race wants and where each sits on screen, so
   * a capture that claims something about the target measures the right
   * gate (a parked camera often frames a later one). A map with no gates
   * answers gateless: true, which shots.js accepts only from the page
   * itself, so a race map can never opt out of the rule.
   *
   * aperturePx is the vertical chord of the opening on screen, and only
   * when both its ends are in front of the camera; a yawed gate is an
   * ellipse whose width this is not. depth is camera space depth, which a
   * projected size scales with (the straight distance overstates it off
   * axis). centreInFrame is one point test with no occlusion, not "the
   * pilot can see it".
   */
  window.__nextGate = () => {
    const canvas = shell.renderer.domElement;
    const head = { viewport: { w: canvas.width, h: canvas.height }, mapId: view.id, mapMode: view.mode };
    if (view.gates.length === 0) {
      return { ...head, gateless: true, gates: [] };
    }
    const ahead = [0, 1, 2].map((step) => {
      const sceneIndex = race.gates[(race.next + step) % race.gates.length].idx;
      const gate = view.gates[sceneIndex];
      const hole = gate.aperture;
      const centre = new THREE.Vector3(gate.position.x, gate.position.y + hole.centreY, gate.position.z);
      const half = hole.clearH * 0.5;
      const onScreen = probeScreen(centre);
      const topScreen = probeScreen(new THREE.Vector3(centre.x, centre.y + half, centre.z));
      const bottomScreen = probeScreen(new THREE.Vector3(centre.x, centre.y - half, centre.z));
      const chordValid = topScreen.inFront && bottomScreen.inFront;
      return {
        step,
        sceneIndex,
        flyOrder: gate.flyOrder,
        /* Sampled this frame from a glow that pulses on the wall clock. */
        glowGainSampled: gate.glowMat.uniforms.uGain.value,
        aperture: hole,
        world: { x: centre.x, y: centre.y, z: centre.z },
        distance: shell.camera.position.distanceTo(centre),
        depth: -centre.clone().applyMatrix4(shell.camera.matrixWorldInverse).z,
        screen: onScreen,
        aperturePx: chordValid ? Math.abs(bottomScreen.y - topScreen.y) : null,
        aperturePxAxis: str('main.vertical_chord_only_not_the_width'),
        centreInFrame: onScreen.inFront && onScreen.x >= 0 && onScreen.x < canvas.width
          && onScreen.y >= 0 && onScreen.y < canvas.height,
      };
    });
    return {
      ...head,
      gateless: false,
      raceNext: race.next,
      nextSceneIndex: race.nextSceneIndex(),
      lap: race.lap,
      gates: ahead,
    };
  };
  /*
   * Which side of its gate a point is on, as the renderer colours it. The
   * scorer in race.js decides the same thing in its own frame, and a check
   * sweeps a grid comparing the two: they once disagreed, and a pilot met a
   * dive gate lit red on the correct approach before any check did.
   */
  window.__aimProbe = (x, y, z) => (view.approachSide ? view.approachSide(x, y, z) : null);
  /*
   * The tier every gate is dressed in, read off its materials and meshes
   * rather than off what the shell meant to hand out, so "only the next
   * gate is lit, one more is on the middle tier, the rest are dark" is a
   * check (and a stacked structure lights only its named opening).
   */
  window.__gateTiers = () => {
    const aim = view.targetAim ? view.targetAim() : null;
    const tierOf = (gate) => {
      if (!gate.ringMat.visible) {
        return 'dark';
      }
      return gate.glowMat.visible ? 'target' : 'follow';
    };
    return {
      next: race.freestyle ? -1 : race.nextSceneIndex(),
      follow: race.freestyle ? -1 : race.followSceneIndex(),
      aim: aim ? { active: aim.active, correct: aim.correct, distance: aim.distance } : null,
      gates: view.gates.map((gate, sceneIndex) => ({
        sceneIndex,
        flyOrder: gate.flyOrder,
        virtual: Boolean(gate.virtual),
        tier: tierOf(gate),
        ring: `#${gate.ringMat.color.getHexString()}`,
        haloOn: gate.haloMat.visible,
        glowOn: gate.glowMat.visible,
        litOpenings: gate.ringMeshes
          ? gate.ringMeshes.flatMap((mesh, k) => (mesh.visible ? [k] : []))
          : null,
        cueOn: Boolean(gate.cueGroup && gate.cueGroup.visible),
        wrong: gate.fillMat ? gate.fillMat.uniforms.uWrong.value : null,
      })),
    };
  };

  /*
   * The drawn craft on screen: the pixel box of its world bounding box and,
   * apart from it, the pixels a 0.25 m segment across the view covers at
   * the craft (a 250 mm quad is named for its motor diagonal, which the box
   * is not). The box includes the spinning prop discs, so it breathes with
   * prop angle. With the camera closer than the near plane both would be
   * projections through zero depth, so the probe refuses instead.
   */
  window.__quadScreen = () => {
    const canvas = shell.renderer.domElement;
    const viewport = { w: canvas.width, h: canvas.height };
    const cam = shell.camera;
    const craft = shell.quad;
    const distance = cam.position.distanceTo(craft.position);
    if (distance < cam.near) {
      return {
        viewport,
        visible: craft.visible,
        distance,
        boxPx: null,
        span250mmPx: null,
        refused: str('main.camera_is_m_from_the_craft', { dist: distance.toFixed(3), near: cam.near }),
      };
    }
    const bounds = new THREE.Box3().setFromObject(craft);
    const size = bounds.getSize(new THREE.Vector3());
    const xs = [];
    const ys = [];
    const corner = new THREE.Vector3();
    for (const cx of [bounds.min.x, bounds.max.x]) {
      for (const cy of [bounds.min.y, bounds.max.y]) {
        for (const cz of [bounds.min.z, bounds.max.z]) {
          corner.set(cx, cy, cz).project(cam);
          xs.push((corner.x * 0.5 + 0.5) * viewport.w);
          ys.push((1 - (corner.y * 0.5 + 0.5)) * viewport.h);
        }
      }
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const across = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const endA = craft.position.clone().addScaledVector(across, -0.125).project(cam);
    const endB = craft.position.clone().addScaledVector(across, 0.125).project(cam);
    const span = Math.abs((endB.x - endA.x) * 0.5 * viewport.w);
    const boxW = Math.max(...xs) - left;
    return {
      viewport,
      visible: craft.visible,
      distance,
      worldSizeSampled: { x: size.x, y: size.y, z: size.z },
      worldSizeNote: str('main.aabb_of_the_whole_group_including'),
      boxPx: Number.isFinite(boxW) ? { w: boxW, h: Math.max(...ys) - top, x: left, y: top } : null,
      span250mmPx: Number.isFinite(span) ? span : null,
    };
  };
  /* The world probes: the seated map, what loading it cost, and what in it
   * is solid. The shell itself calls none of them. */
  /* The seated map's ground at (x, z), from above everything, so a check
   * can prove what a craft would meet anywhere, not only under itself.
   * Harness only. */
  window.__heightAt = (x, z) => view.height(x, z, Infinity);
  /*
   * The drawn water against the plant's at a map point: the map's lake as
   * the GPU drew it (probeWater, read back off a one texel render of the
   * same displaced mesh), and sim_water_sample at the same point and the
   * same sim clock, both as a map height. Null where the map has no waves
   * hook or the plant no water there. For scripts/water-render.js.
   */
  const probeSim = { x: 0, y: 0, z: 0 };
  const probeMap = new THREE.Vector3();
  window.__water = (x, z) => {
    const drawn = view.probeWater ? view.probeWater(x, z) : null;
    if (!drawn || typeof sim.e.sim_water_sample !== 'function') {
      return null;
    }
    const ptr = sim.e.malloc(7 * 8);
    worldPosToSim(x, 0, z, probeSim);
    const code = sim.e.sim_water_sample(probeSim.x, probeSim.y, drawn.t, ptr);
    const out = Array.from(new Float64Array(sim.e.memory.buffer, ptr, 7));
    sim.e.free(ptr);
    if (code !== SIM_OK || out[0] < 0) {
      return { drawn, plant: null };
    }
    simPosToThree(probeSim.x, probeSim.y, out[1] + SPAWN_ALT, probeMap).applyQuaternion(qSpawn);
    return { t: drawn.t, drawn: drawn.y, patch: drawn.patch, plant: probeMap.y + startY, body: out[0] };
  };
  /* The plant's water under a map point, as a map height, with the body
   * and the shell's own answer beside it: { body, plant, shell }, body
   * -1 and plant null where the plant has none. For
   * scripts/river-page-check.js. */
  window.__waterSample = (x, z) => {
    const ptr = sim.e.malloc(7 * 8);
    worldPosToSim(x, 0, z, probeSim);
    const code = sim.e.sim_water_sample(probeSim.x, probeSim.y, 0, ptr);
    const out = Array.from(new Float64Array(sim.e.memory.buffer, ptr, 7));
    sim.e.free(ptr);
    const w = waterAt(x, z);
    const shell = w ? surfaceAt(w, x, z) : null;
    if (code !== SIM_OK || out[0] < 0) {
      return { body: -1, plant: null, shell };
    }
    simPosToThree(probeSim.x, probeSim.y, out[1] + SPAWN_ALT, probeMap).applyQuaternion(qSpawn);
    return { body: out[0], plant: probeMap.y + startY, shell };
  };
  /* Put the spawn somewhere else, facing another way, as a crash recovery
   * does, and reset there: the water is declared again in the new spawn's
   * frame, which is what a check of the waves' frame needs. `y` is the
   * fromY hint a spawn may carry (a seat on a dam's crest). Harness only. */
  window.__respawn = (x, z, yaw, y) => {
    resetCraft({ x, z, yaw, y });
    return true;
  };
  /* Show the map's waves on the title too, so a parked camera
   * (scripts/swiss2-views.js, swiss2-perf.js with --waves) sees the lake
   * as a pilot on it would, stood still at the sim clock where it is. */
  window.__wavesOn = () => {
    declareWater();
    wavesAtTitle = true;
    return Boolean(view.setWaves);
  };
  /* The world in the shell: which map, its spawn, whether it is built, what
   * its stages cost to load, the module count the loading bar was told to
   * expect (check 16 holds it against what was fetched), and whatever the
   * map reports about itself. */
  window.__map = () => {
    const own = view.stats ? view.stats() : {};
    return {
      id: view.id,
      name: view.name,
      mode: view.mode,
      graphics: view.graphics,
      ready: mapReady,
      gates: view.gates.length,
      spawn: { x: startX, y: startY, z: startZ, yaw: startYaw },
      references: view.references ?? null,
      loading: window.__loading ? window.__loading.timings : null,
      expectedModules: MAP_MODULE_COUNT[view.id] ?? null,
      ...own,
    };
  };
  window.__maps = () => MAPS.map((m) => ({ id: m.id, name: m.name, mode: m.mode }));
  /* An opening in the dam as the war's damage hands one to the map
   * (map.onOpening, docs/FLOOD.md), and the water through every opening
   * this frame (map.waterFlows), for scripts/water-page.js. Harness only. */
  window.__mapOpening = (o) => {
    if (!view || typeof view.onOpening !== 'function') return false;
    view.onOpening(o);
    return true;
  };
  window.__mapFlows = () => (view && view.waterFlows ? view.waterFlows() : null);
  /* How a crash cam replay's water stands (map.replayWater), for
   * scripts/replay-world.js. Harness only. */
  window.__mapReplayWater = () => (view && view.replayWater ? view.replayWater() : null);
  /* A mission's gate state handed to the map (map.setGateState), for
   * scripts/itaipu-views.js --gates. Harness only. */
  window.__mapGates = (list) => {
    if (!view || typeof view.setGateState !== 'function') return false;
    warGatesTo(list);
    return true;
  };
  /* A gate's leaf turn at room ms t as the map would draw it now, a
   * replay's gate state while one plays (map.leafTurnAt), for
   * scripts/replay-world.js. Harness only. */
  window.__mapLeaf = (id, t) => (view && view.leafTurnAt ? view.leafTurnAt(id, t) : null);
  window.__animMs = () => animDrawnMs;
  /* How far this build's gates depart from MultiGP's published sizes, so
   * check 15 compares the threshold file with the course rather than with
   * its own copy of the number. */
  window.__gateScale = () => GATE_SCALE;
  /*
   * Run the map's animation clock to `step` (the frame loop's own step
   * count), so a capture can put a moving part, a train, a gondola, where
   * it needs it instead of waiting minutes of slow headless frames for it.
   * Answers the train's offset where the map has one.
   */
  window.__animTo = (step) => {
    view.updateAnim(step);
    if (!view.stats) {
      return null;
    }
    return view.stats().trainOffset ?? null;
  };
  /* The clocks traffic is drawn on: the last drawn frame's, the lap clock,
   * the offset between them, the room's (null outside a room), and what the
   * world audio last voiced (null before the mix exists). For
   * scripts/traffic-sync-check.js. */
  window.__traffic = () => {
    const inRoom = roomLinkState.state().phase === 'open';
    return {
      drawn: animDrawnMs,
      lap: simTimeMs,
      offset: trafficOffsetMs,
      room: inRoom ? roomLinkState.roomNow() : null,
      sound: worldAudio.stats,
    };
  };
  /* The live scene graph, which tests/lib/checks.js walks to measure the
   * reference objects against the sizes this project claims. */
  window.__mapScene = () => view.scene;
  /* THREE itself, for page side measurements (a Box3, a Vector3) that would
   * otherwise load a second three.js whose classes this scene's objects are
   * not instances of. */
  window.__three = THREE;
  /* The roofs (src/render/library/roofs.js): each one's frame, plate, wall
   * rectangle, covering, what building it is and the collider indices of
   * the walls under it, so a capture can fly at a real roof. Empty where
   * a map has none. Harness only. */
  window.__roofs = () => (view.roofs ?? []).map((r) => ({
    key: r.key, kind: r.kind, open: r.open, material: r.material, c: r.c, s: r.s, x: r.tx, z: r.tz, plate: r.lift + r.ty,
    hw: r.hw, hd: r.hd, dy: r.dy, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, solids: r.solids.slice(),
    eaves: r.eaves.slice(),
  }));
  /* Roof i's own top at a map point, NaN off it: which roof a point is
   * under, where roofs overlap. Harness only. */
  window.__roofTop = (i, x, z) => (view.roofTop ? view.roofTop(i, x, z) : NaN);
  /* The roofs' cover for a craft at a map point, as the obstacle pass
   * sets it for its next sweep (fromY biased as that pass biases it), so
   * a probe's __hit meets what the craft's would. The next frame sets it
   * again from the craft. Harness only. */
  window.__cover = (x, y, z) => {
    if (view.cover) {
      view.cover(x, z, y - SURFACE_BIAS);
    }
  };
  /* The ground the contact pass would meet at (x, z) for a craft at height
   * fromY. Asked from above a deck it answers the deck, from below it the
   * floor beneath, which is the property a capture wants to assert. */
  window.__surface = (x, z, fromY) => view.height(x, z, fromY);
  /* The ground's material name at a point, the one the crash model uses. */
  window.__surfaceMaterial = (x, z, y) => {
    if (!view.surfaceAt) {
      return null;
    }
    return view.surfaceAt(x, z, y);
  };
  /*
   * The camera: where it is, how it is turned and how wide it sees (enough
   * to project a point), the ground straight under it and its height above
   * that (the intro once ended its pan inside a launch block), and the
   * title lens's shift as a fraction of the frame, null when centred, which
   * must be gone the moment the pilot flies.
   */
  window.__camGround = () => {
    const cam = shell.camera;
    const { x, y, z } = cam.position;
    const ground = view.height(x, z, y);
    const lens = cam.view;
    return {
      x,
      y,
      z,
      quat: cam.quaternion.toArray(),
      fov: cam.fov,
      aspect: cam.aspect,
      ground,
      clearance: y - ground,
      shift: lens && lens.enabled
        ? { x: lens.offsetX / lens.fullWidth, y: lens.offsetY / lens.fullHeight }
        : null,
    };
  };
  /*
   * Hold the sticks at these values, as a radio's gimbals would, until the
   * next call; no arguments hands control back to the keyboard and empties
   * the queue. A capture cannot take off on a held W: the key ramps per
   * frame, and a slow headless page draws too few frames to reach takeoff
   * throttle. The override sits at the top of input.poll's ladder, so roll,
   * pitch and yaw stick too, not only the throttle.
   */
  window.__stick = (roll, pitch, yaw, throttle) => {
    if (roll != null) {
      input.harnessChannels = { roll, pitch, yaw, throttle };
      return { roll, pitch, yaw, throttle };
    }
    input.harnessChannels = null;
    input.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    rcPending.length = 0;
    turtleResumeGate = false;
    turtleRecover = false;
    return null;
  };
  /*
   * The first solid on the segment p to q, asked exactly as the frame loop
   * asks: the tilt aware half height and the craft's world attitude ride
   * along, or the probe would be asking a different question. part is the
   * fixed wing's part that met it, -1 for a quad's discs.
   */
  window.__hit = (px, py, pz, qx, qy, qz, vh = vHalfFrame) => {
    const set = view.colliders;
    const found = set.hit(
      px, py, pz, qx, qy, qz, vh,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
      craftVerticalOffset(),
    );
    return {
      kind: found < 0 ? null : set.kindName(found),
      index: set.hitIndex,
      t: set.hitT,
      pen: set.hitPen,
      nx: set.hitNx,
      ny: set.hitNy,
      nz: set.hitNz,
      part: set.hitArm ? set.hitPart : -1,
    };
  };
  /* A flat canopy at world height `top` over the whole loaded map, so
   * scripts/canopy-check.js can exercise the contact pass's canopy call on a
   * map without a forest of its own. Gone with the next map load. */
  window.__canopyTop = (top) => {
    view.canopyAt = () => top;
  };
  /* Load a world as ?map= would at the title, which ends the title's own. */
  window.__setMap = (id) => {
    titleWorld = null;
    paintBest();
    ui.settings.map = id;
    return swapMap(id);
  };
  /*
   * One whole loop of the title's attract camera, sampled on its own clock:
   * `count` positions and view directions (clamped to 8..2000). The attract
   * camera is a spline with nothing to stop it going through a wall, and
   * scripts/attract-check.js walks these samples through __hit to catch
   * that. It flies a private camera on a private copy of the shot, so the
   * title on screen and its bank filter are left alone.
   */
  window.__attract = (count = 240) => {
    const shot = makeAttractCamera(view);
    const eye = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    const look = new THREE.Vector3();
    const periodMs = shot.periodMs > 0 ? shot.periodMs : 1000;
    const n = Math.max(8, Math.min(2000, Math.round(count)));
    const samples = Array.from({ length: n }, (_, i) => {
      const ms = (periodMs * i) / n;
      shot.update(ms, eye, {});
      eye.getWorldDirection(look);
      return { ms, x: eye.position.x, y: eye.position.y, z: eye.position.z, dx: look.x, dy: look.y, dz: look.z };
    });
    return { map: view.id, kind: shot.kind, periodMs, samples };
  };
  window.__budget = (name) => measureBudget(shell, view, { view: name });

  /*
   * TAKE OVER, from the crash cam: the plant put back at a recorded frame
   * (src/replay/journal.js), and the shell's own beliefs about it put
   * level with what it now is. First the proof, the plant's state hashed
   * against the hash the frame recorded; then the modes the shell holds
   * are sent again, since the calls that set them may lie after the frame,
   * and the world is declared again round where the craft now is. The lap
   * it happened in is void: a lap flown from a rewind is not a lap.
   */
  function replayTakeOver(mark, simT, hash) {
    if (!journal.restore(mark, simT)) {
      return { ok: false, match: false };
    }
    /* The restored region holds the recorded frame's wind, so the next run
     * must clear it whatever this run's air was. */
    windSet = true;
    const back = readState();
    const match = stateHash(back) === hash;
    const nowWall = performance.now();
    stateCurr = back;
    statePrev = back;
    acc = 0;
    adoptSimClock();
    /* What __placeCraft puts back for a teleport, which this is. */
    setManualFlip(false);
    setCrashflip(false);
    turtleRecover = false;
    turtleWait = false;
    introMs = -1;
    landed = false;
    takingOff = false;
    launchStaging = false;
    crashed = false;
    poseLock = false;
    flownThisRun = true;
    input.releaseThrottleHold();
    clipCrashKind = '';
    clipCrashUntil = 0;
    clipGraceUntil = 0;
    resetClipWatch(clipWatch);
    turtleParkMotors = false;
    sim.motorOverride(-1, -1);
    sim.setAngleMode(angleModeOn);
    wingStabApplied = -1;
    obsHasPrev = false;
    obsPhase = 0;
    poseFromState(back, pCurr);
    racePrev.copy(pCurr);
    raceHasPrev = true;
    groundPrev.copy(pCurr);
    groundHasPrev = true;
    if (runDamage) {
      wreckRig.reset();
      debris.clear();
      fpvFail.clear();
      crashLog.length = 0;
      crashFlags = damage.flags();
      lastParts = crashFlags ? damage.parts() : null;
      wrecked = isWreck(crashFlags, airframeById(runAirframe).fixedWing);
      wreckAtWall = nowWall;
      wreckStillSince = -1;
      treeStillSince = -1;
      if (craftHull) {
        hullIntact(craftHull);
        syncCraftParts(back);
      }
      crashWorldX = NaN;
      crashWorldPhase = 0;
      refreshCrashWorld(back);
    }
    trickDetector.reset();
    race.voidLap(str('replay.lap_void'), nowWall);
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    mode = 'flight';
    ui.show('flight');
    return { ok: true, match, t: back[0] };
  }

  crashCam = createCrashCam({
    shell,
    audio,
    input,
    journal,
    liveGroups: [wreckRig.group, debris.group, smoke.group],
    mode: () => mode,
    screen: () => ui.screen,
    enter: () => {
      mode = 'replay';
    },
    exit: () => {
      /* A replay the hangar's TV opened goes back to the hangar. */
      if (tvReturn) {
        const back = tvReturn;
        tvReturn = null;
        mode = back.mode;
        ui.openWalk(back.which);
        return;
      }
      mode = 'flight';
      acc = 0;
      /* The map as the war has it now, whatever the replay drew. */
      warMapDraw(warLiveWorld(roomWar.view(), roomLinkState.roomNow()));
      warBreakageLive(roomLinkState.roomNow());
      ui.show('flight');
    },
    drawWar: warMapDraw,
    /* The two beds as they play now, [id, seconds in] ('' for none): the
     * flight's record and the war's music (src/replay/sound.js). */
    beds: () => {
      const m = audio.music;
      const r = audio.warRadio;
      const on = (el) => Boolean(el && !el.paused && !el.ended);
      return {
        music: m && m.enabled && on(m.el) && m.track ? [m.track.id, m.el.currentTime] : ['', 0],
        bed: r && r.track && r.bed && on(r.bed.el) ? [r.track, r.bed.el.currentTime] : ['', 0],
      };
    },
    /* A replayed explosion in the world's voice, from where it went off;
     * false without one. */
    worldBoom: (p, level) => worldAudio.boom(p, level),
    /* How the map's replay water stands (map.replayWater), or null. */
    replayWater: () => (view && typeof view.replayWater === 'function' ? view.replayWater() : null),
    /* The room clock now, or null out of a room: what each row and each
     * voice heard is stamped on (src/replay/voicerec.js). */
    roomNow: () => (roomLinkState.state().phase === 'open' ? roomLinkState.roomNow() : null),
    notice: (text) => {
      notice = { text, untilMs: performance.now() + 2400 };
    },
    state: () => stateCurr,
    /* Every crash, written down for the next F8 while it is still on
     * screen: what broke, the last hits (part, what it met, how fast) and
     * where. See share/crashrecord.js. */
    onCrash: (kind) => crashRecord.noteCraft({
      kind,
      airframe: runAirframe,
      map: view ? view.id : '',
      flags: Object.keys(DAMAGE_FLAGS).filter((k) => (crashFlags & DAMAGE_FLAGS[k]) !== 0),
      hits: crashLog.slice(-4),
      speed: speedNow,
      agl: lastClearance,
      at: [shell.quad.position.x, shell.quad.position.y, shell.quad.position.z],
    }),
    parts: () => lastParts,
    partCount: () => damage.count(),
    flags: () => crashFlags,
    wrecked: () => wrecked,
    partTable: () => partTable,
    airframe: () => runAirframe,
    /* The replay file keeps the colours as it always has, and the paint
     * shop's finishes and decals beside them (src/replay/file.js). */
    livery: () => {
      const look = liveryFor(runAirframe);
      return look ? look.colours : null;
    },
    paint: () => {
      const look = liveryFor(runAirframe);
      return look && (Object.keys(look.finishes).length || look.decals.length || look.wear)
        ? { finishes: look.finishes, decals: look.decals, ...(look.wear ? { wear: look.wear } : {}) } : null;
    },
    mapId: () => view.id,
    /* The clock this frame's world is animated at, for the row. */
    animMs: () => trafficMs(simTimeMs),
    /* What the replay's paper is drawn lying on, as the live paper is. */
    paperFloor: paperFloorAt,
    spawn: (out) => {
      out[0] = startX;
      out[1] = startY;
      out[2] = startZ;
      out[3] = qSpawn.x;
      out[4] = qSpawn.y;
      out[5] = qSpawn.z;
      out[6] = qSpawn.w;
      out[7] = SPAWN_ALT;
    },
    speed: () => speedNow,
    throttle: () => input.channels.throttle,
    agl: () => lastClearance,
    surfaces: () => (shell.setSurfaces && wingSurfPtr ? new Float64Array(sim.e.memory.buffer, wingSurfPtr, 4) : null),
    flaps: () => (shell.setFlaps && typeof sim.e.sim_wing_flaps === 'function' ? sim.e.sim_wing_flaps() : 0),
    fpv: () => ({
      fwd: simLenToWorld(camMountFwd), up: simLenToWorld(camMountUp), tilt: cameraTiltRad(camTilt), fov: ui.settings.cameraFov,
    }),
    ground: pieceGround,
    scene: () => shell.quad.parent,
    takeOver: replayTakeOver,
    exportSurface: setExportSurface,
    swapMap,
    knownAirframe: (id) => AIRFRAMES.some((a) => a.id === id),
    knownMap: (id) => MAPS.some((m) => m.id === id),
    /* A clip flown in a retired world is listed under that world's name and
     * refused by it when played, rather than filed under the Track seat. */
    retiredMapName: (id) => (retiredMap(id) ? str(retiredMap(id).name) : ''),
    mapName: (id) => (retiredMap(id) ? str(retiredMap(id).name) : mapById(id).name),
    craftLook: (craft) => shell.lookCraft(craft),
    osdOn: () => fpvOsd.on,
    /* The trail's nozzle and the aircraft's velocity while it emits. */
    smoke: () => (smokeLive ? { nozzle: smokeAt, velocity: smokeVel } : null),
    /* The hangar parts it flies with, as a saved replay keeps them. */
    fit: () => {
      const f = partsFor(runAirframe);
      return f && f.entry ? { entry: f.entry, option: f.option ? f.option.id : null } : null;
    },
  });
  crashCam.tap(debris);
  /* Combat's paper and its SCHWING, for the replay (src/replay/paper.js). */
  crashCam.tapPaper(combatLayer);
  /* Catch the Ace's crown burst and its coin, the same way. */
  crashCam.tapCrown(tagFx);
  /* A war's explosions, the same way. */
  crashCam.tapBooms(warBooms);
  /* And its attackers, so a replay flies them where they were. */
  crashCam.tapWar(roomWar, warAttackers, () => warFrameNow);
  /* And the voices this page hears, for its replays (src/share/voice.js). */
  voice.setRecorder(crashCam.voiceSink);
  /* Harness: the crash cam's controls, its costs, and a switch for the
   * proof that recording changes nothing. */
  window.__crashCam = {
    stats: () => crashCam.stats(),
    open: () => crashCam.open(),
    live: () => crashCam.live,
    setRecording: (on) => crashCam.setRecording(on),
    h: () => crashCam.harness(),
    exportSurface: setExportSurface,
  };
  requestAnimationFrame(frame);
  /* A map track seated before this page loaded (a board link, or the Track
   * room last visit) is flown in a world boot has just built bare: the
   * course goes on it now, before anyone presses Fly. */
  if (!titleWorld && wantedCourseKey(view.id) !== loadedCourseKey(view)) {
    syncWorld();
  }
}

/*
 * Importing this module starts nothing; do not add a boot() call down here.
 * src/boot.js is the one entry point: it loads the strings, imports this
 * file, calls boot() with the loading screen, the page's start time and the
 * map to seat, and hands any rejection to loading.fail(), the only screen
 * able to tell the pilot what broke. A second call from here would run
 * without those arguments and fail on every load, and whatever it printed
 * would race the real boot for the page.
 */

