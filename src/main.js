/*
 * main.js: the shell. Loads dist/sim.wasm, feeds it timestamped stick
 * samples, steps it on a fixed 1 kHz accumulator driven by
 * requestAnimationFrame, renders an interpolated view, and drives the
 * product shell in src/ui/ui.js. The frame delta clocks the accumulator
 * and never reaches the integrator; a dropped frame changes nothing about
 * the trajectory.
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
 * Ground handling is shell side: the physics module has no ground plane
 * (the verification harness measures free air behaviour), so the shell
 * raises sim_set_ground and the plant applies a rigid-body contact every
 * 1 ms step. Grass is a dead thump with a short belly slide. Turtle is
 * a scripted recovery: inverted, seated and still shows TURTLE MODE, and
 * any pitch or roll poke flips the hull upright. Hits bounce. The one
 * exception is a clip-through or a leftover overlap bounce cannot leave:
 * the shell freezes, says Crashed, and puts the quad back on the line.
 * See PROGRESS.md.
 *
 * Keys in flight: Escape pauses, R returns to the start line, L is launch
 * control when that setting is on, F steps the flaps of an aircraft that
 * has them, V opens the crash cam's replay (src/replay/crashcam.js), F8
 * reports a bug.
 * Everything else is a menu choice.
 * Sticks: radio in joystick mode (Gamepad API) or WASD plus arrows.
 * Drop a Betaflight diff file onto the page to fly your own config.
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

import * as THREE from 'three';
import { buildShell } from './render/shell.js';
import { applyPixelRatio, normalizeGraphics, pixelRatioFor } from './render/quality.js';
import { createPace, PACE_COOL } from './render/pace.js';
import { readGpuInfo } from './render/gpuinfo.js';
import { makeAttractCamera } from './render/attract.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree, simLenToWorld, threePosToSim, threeDirToSim, WORLD_SCALE } from './render/frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP, cameraTiltRad, clampCameraAngle, makeLensShake, fpvLensClear } from './render/lens.js';
import { MotorAudio, VOICES } from './render/audio.js';
import { engineSpecFor } from './render/enginespec.js';
import { WorldAudio } from './render/world-audio.js';
import { courseKind } from './game/progress.js';
import { revRpm } from './ui/hangar-polish.js';
import { InputManager, NAV_DEFLECT } from './input/input.js';
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
import { createSensorManager } from './avionics/sensors.js';
import { createPerception } from './avionics/perception.js';
import { createTrackManager } from './avionics/tracks.js';
import { hudStateOf } from './avionics/hudstate.js';
import {
  adoptShareFromLocation, boardPageUrl, fetchGhost, fetchTrackDocument,
  fetchTrackTimes, postFreestyleRun, postTime,
} from './share/board.js';
import { findBoardTwin, inspectCourse, publishCurrentCourse, pushOwnedListing, seatedCourseKey, syncOwnedIdentity } from './share/listing.js';
import { createFlightStats, pingVisit } from './share/stats.js';
import {
  addFlight, createFlightClock, deviceId, mergeFlightTime, stepsAreFlight,
} from './share/flighttime.js';
import { nameRules, readAccount, readPilotName, writePilotName } from './share/pilot.js';
import { createIdentity } from './share/identity.js';
import { createLiveLink } from './share/live.js';
import {
  createRoomLink, figurePick, namePick, ownName, randomNamePick, roomLink, setFigurePick, setNamePick, wantedRoom,
} from './share/rooms.js';
import { createRoomSafety } from './share/roomsafety.js';
import { createVoice } from './share/voice.js';
import { createVoiceUi } from './ui/voiceui.js';
import { createRoomBrowser } from './ui/roombrowser.js';
import { createRoomRace } from './share/roomrace.js';
import { GOALS, GOAL_STEP, createRoomTag, goalOf } from './share/roomtag.js';
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
import { DEATH as WAR_DEATH, createAttackers } from './render/attackers.js';
import { SIZE_MAX as WAR_BOOM_MAX, createExplosions } from './render/explosion.js';
import { createWarHud } from './ui/warhud.js';
import { createWarMarkers } from './ui/warmarkers.js';
import {
  allowanceOf, createWarRoundCard, roundOf, spentOf,
} from './ui/warround.js';
import { createWarCalls } from './render/warradio.js';
import { createCampaignScreen } from './ui/campaign.js';
import { MISSIONS as WAR_MISSIONS, missionTime } from './share/war/missions/index.js';
import {
  ACT1, createCampaignStore, markSeen, seenFilm,
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
import { partsFor, setPartsSource } from './render/partsfit.js';
import { PROPS, addonParams, normaliseParts, partsEntry, partsGear, partsPowerBlock, propShape } from '../configs/hangar-parts.js';
import { combatAddon, combatChoice, combatSimId, payloadForWarhead, propulsionOf, setCombatSource, warPayload } from '../configs/combat.js';
import { liveryKey, lookFor, paintable } from '../configs/liveries.js';
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
import { disposeSceneGraph } from './render/shell.js';
import { normaliseRates, ratesAreDefault, ratesDiff, ratesSummary, TOUCH_RATE_DEFAULTS } from '../configs/rates.js';
import { clearPidsFor, PID_AXES, pidCliKey, pidsDiffFor, SLIDER_KEYS, SLIDERS } from '../configs/pids.js';
import { cliMap, composeConfig, FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY, moduleDump, moduleGet, RATES_KEEP, ratesFromDump, tuneBody } from './fc/dump.js';
import { GATE_SCALE, gateScaleFor } from './game/track.js';
import { planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { FpvOsd } from './ui/fpvhud.js';
import { PeerMarks } from './ui/peermarks.js';
import { loadSim, simErrorName, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';
import { currentLocale, plural, str } from './strings/index.js';
import { declareBodies, floatSpawn, insideWater, surfaceAt, waterFor, wetHeight } from './game/water.js';
import { KINDS, TURNED } from './game/collide.js';
import { createDamageLink, isPowered, isWreck, PART_STATE_DOUBLES, STATE } from './game/damage.js';
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
 * The module's bytes, resolved against this file rather than the site root.
 *
 * It was '/dist/sim.wasm', which is the same URL as long as the shell is the
 * whole site. It is not any more: fdfpv.example serves the landing page at the
 * root and this shell under /sim/, so a leading slash asked the landing page
 * for the physics and got its 404 page back. Every other file the boot path
 * needs moved the same way and for the same reason. Nothing about the module
 * changed, only where the page looks for it, and at the root it still
 * resolves to exactly /dist/sim.wasm.
 *
 * A deployed page loads this module at ?v=<commit> (scripts/stamp-version.js)
 * and the physics has to come from the same deploy as the code that calls
 * it, so the module's own query goes on the wasm too. From a checkout the
 * query is empty and the URL is what it always was.
 */
const WASM_URL = new URL(`../dist/sim.wasm${new URL(import.meta.url).search}`, import.meta.url).href;

/*
 * Metres between sim z = 0 and the ground plane, which is where the craft
 * spawns, and it is the PARKED height, not a hover.
 *
 * It was 0.9 m, a leftover from when the craft spawned hanging in mid air,
 * and it is the number behind the takeoff bug the owner reported: the
 * landed render sat the craft on the grass while the physics state waited
 * 0.9 m up, so every takeoff unfroze 82 cm in the air with dead motors,
 * popped up visually, fell 0.7 m while the motors spooled from zero,
 * arrived at about 3.4 m/s and was judged a crash the pilot never flew. A
 * throttle punch out-spooled the fall, which is why "wiggle and punch"
 * worked and a gentle takeoff did not. The physics now spawns exactly
 * where the parked render has always shown the craft: resting on the
 * ground.
 */
/*
 * AND IT IS THE AIRCRAFT'S OWN NUMBER, not a constant.
 *
 * It was 0.045 for everything, which is the five inch's: plant.c's
 * `hull_hz_down` for that machine, the distance from its centre to the
 * surface it parks on. A 65 mm whoop parks 10 mm off the floor. With the
 * five inch's figure the shell put the ground plane 45 mm under the
 * whoop's centre, so the plant rested it 35 mm in the air after every
 * reset, drew it parked there, and called it grounded while it still had
 * 45 mm of clear floor beneath it. Measured through window.__ground on the
 * shipped build: a parked whoop sat 39.7 mm above the floor under it. That
 * is more than the machine's own height, and it is the "hits the ground
 * too soon, then lifts off the ground a little when it resets" the owner
 * flew.
 *
 * configs/airframes.js carries the figure per airframe as `vHalfDown`,
 * snapshotted from plant.c (the whoop's gates rested the real module on a
 * plane against it until the whoop was removed; scripts/crash-rules-selftest.js
 * still walks the collider onto a slab to prove it reaches exactly that).
 * Seated by syncCraftScale, between runs only, with
 * the collision dimensions and the drawn model: these two are a FRAME, and
 * moving one mid lap would move the floor under a craft that is flying.
 */
let SPAWN_ALT = 0.045;
/* The craft rests with its underside on the ground, not its centre.
 * Identical to SPAWN_ALT so the parked pose, the spawn state and a landing
 * all agree about where the ground holds the craft. */
let REST_HEIGHT = 0.045;
/* One seat for both, so they cannot drift apart. An aircraft on wheels
 * rests where its gear holds it, not on its lowest drawn point; one on
 * floats rests where they float it when it starts on water. */
/* The gear pose an aircraft stands at: the kit's, or the hangar's parts'
 * (bigger tyres stand it higher), set by the shell once it has settings. */
let partsGearOf = () => null;
function gearOf(af) {
  return af ? (partsGearOf(af.id) ?? af.gear ?? null) : null;
}
function seatRestHeight(af, onWater = false) {
  const dims = af && af.dims;
  const h = onWater && af.floats ? af.floats.restHeight
    : gearOf(af) ? gearOf(af).restHeight
    : dims && Number.isFinite(dims.vHalfDown) ? dims.vHalfDown : 0.045;
  SPAWN_ALT = h;
  REST_HEIGHT = h;
}
/* Raising the throttle this far off the ground is a deliberate takeoff. The
 * launch latch uses 0.05, which is right for arming a run from rest but
 * would lift the craft off the instant it landed with any throttle held. */
const TAKEOFF_THROTTLE = 0.25;
/*
 * And the throttle a pilot has to come back BELOW before the craft is
 * allowed to think about sitting down again. One threshold for both edges
 * is a latch with no hysteresis: a stick resting on 0.25, which is where a
 * thumb sits while it decides, took off and sat down on alternate frames
 * and played the two loudest blips in the mix at frame rate. That train
 * measures 19 dB over the bed and 12 dB over a full crash cue, and it is
 * what "a loud noise, like I am stuck to the mesh for a moment" sounds
 * like. The gap is deliberately wide: nothing between 0.18 and 0.25 is a
 * decision, it is a thumb.
 */
const TAKEOFF_RELEASE = 0.18;
/*
 * And a floor on how often the pair may SOUND, whatever the latch does.
 * A genuine touch and go inside a fifth of a second does not deserve two
 * blips, and this is the backstop that means no future path can machine
 * gun them again. It gates the cue only: landed, takingOff and the
 * physics are untouched by it.
 */
const GROUND_CUE_GAP_MS = 220;
/*
 * How long after a takeoff the contact cues stay muted, on the WALL clock.
 *
 * 8ebd6b8 muted them on the `takingOff` flag, and the flag is not a window:
 * it is set at the top of the frame and cleared in the same frame, thirty
 * lines before the branch that judges the frame's contact and calls
 * feelImpact. So the guard covered every frame of a departure except the
 * last one, which is the one with the impulse in it. A frame can be 100 ms
 * long, so a flag cannot bound a window a frame can step over: a clock
 * can.
 */
const TAKEOFF_WINDOW_MS = 250;
/*
 * Bias subtracted from the height query's fromY, metres.
 *
 * The city's multi level height query answers "what is my floor" with a
 * WALKER'S rule: a platform is eligible when its top is within a 0.55 m
 * step of fromY. A quad is not a walker: with the craft's true 0.040 m
 * vertical half extent, the overbridge deck at 7.20 m became an eligible
 * floor for a craft flying UNDER it at 6.69 m, below the deck's own
 * underside, and the round 15b bug came back. Shifting fromY down by this
 * bias turns the walker's 0.55 m step into a 0.15 m landable depth: deep
 * enough that a kerb or a low step still judges contact, shallow enough
 * that a deck can never be your floor from underneath it. The remaining
 * gap under the deck, centre heights 6.91 m and up, is inside the bridge's
 * own structure and the underside slab collider crashes it.
 */
const SURFACE_BIAS = 0.40;
/* The plant reports motor speed in rpm; the rooms' wire carries rad/s. */
const RPM_PER_RAD_S = 60 / (2 * Math.PI);
/*
 * How far the CAMERA is lifted while the craft is sitting on the ground, in
 * world metres. Render only: nothing about the physics, the collision test
 * or the trajectory can see it.
 *
 * A parked quad's lens is 5.6 cm over the surface in this world, and the
 * session's near plane is 0.2 m (src/render/shell.js, chosen for depth
 * precision across a 2.6 km valley). Those two numbers cannot both be
 * honoured: with the camera tilted up 30 degrees and a 100 degree vertical
 * field, the ground in front of a parked craft is nearer than the near plane
 * for most of the lower frame, so it is clipped away and the frame comes
 * back as a flat band of background under a thin strip of grass. That is
 * what the owner saw as clipping through the ground at the start and after a
 * crash, and it is also true of any perch mid course.
 *
 * 0.30 m puts the surface back outside the near plane across the whole
 * frame, and it is not an invention: a race quad starts from a launch pad,
 * and a pad is about this high. It is eased in and out rather than snapped,
 * because a landing that teleported the view up 30 cm would read as a bounce
 * the pilot did not fly.
 */
const PARKED_LIFT = 0.30;
/*
 * Opening shot when a run starts: orbit the quad on the pad, settle
 * behind it, then dolly into the FPV camera. The three spans are wall
 * milliseconds of the same 1 ms accumulator the frame already uses, so
 * a hitch stretches the shot rather than skipping it.
 */
const INTRO_ORBIT = 2200;
const INTRO_APPROACH = 800;
const INTRO_ZOOM = 1000;
const INTRO_FLY = INTRO_ORBIT + INTRO_APPROACH;
const INTRO_TOTAL = INTRO_FLY + INTRO_ZOOM;
/*
 * Hitch frames are capped at 100 ms in the loop. Adding that whole cap to the
 * intro clock burns the pad shot before a single exterior frame is shown.
 *
 * IT WAS 33, WHICH IS 30 FPS, AND THAT CAPPED THE STEADY STATE TOO.
 *
 * A cap on the step is a cap on how fast the shot can play, so a machine
 * running at 25 fps gave 33 of every 40 ms to a 4.0 s shot and took 4.8 s
 * over it; at 20 fps, 6.1 s; measured on this container at about 9 fps the
 * intro ran at 0.3 times speed. That is every run start and every Restart
 * run, on exactly the ordinary laptop this project is for, and the pilot
 * reads it as the simulator being slow before they have touched a stick.
 *
 * 100 matches the physics accumulator's own cap, which is the right shape:
 * a hitch stretches the shot by its own length and no more, and a slow but
 * steady machine plays the shot at the speed it was authored at, in fewer
 * frames. The comment above is why the number is not simply Infinity.
 */
const INTRO_STEP_MAX = 100;
/* Orbit starts on a three-quarter behind the right shoulder and walks
 * 300 degrees, which lands dead astern. Approach then closes from that
 * same point. Radii are world metres, outside the 0.2 m near plane. */
const INTRO_THETA0 = 0.55;
const INTRO_ORBIT_SPAN = (300 * Math.PI) / 180;
const INTRO_ORBIT_RADIUS = 0.72;
const INTRO_ORBIT_HEIGHT = 0.30;
const INTRO_APPROACH_RADIUS = 0.40;
const INTRO_APPROACH_HEIGHT = 0.14;
const INTRO_FOV = 40;
/* How far the intro camera stays above whatever is under it. Smaller than
 * the finish camera's 0.42 because the pad shot is an intimate one and a
 * big clearance would throw it into the air; enough to clear a launch
 * block's deck, which is the thing it was actually falling into. */
const INTRO_FLOOR_CLEAR = 0.12;
/* FPV lens floor lives in lens.js (fpvLensClear). Intro and finish
 * already keep their cameras out of the dirt. */
/* Finish shot. Pulls off the FPV lens onto a three-quarter of the
 * frozen craft, then sways. Radii in world metres. */
const FINISH_FOV = 46;
const FINISH_RADIUS = 2.35;
const FINISH_HEIGHT = 0.88;
const FINISH_PULL_MS = 1050;
const FINISH_SWAY = 0.00055;
function introEase(t) {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}
/* The controller consumes each input sample as one RC frame, so the shell
 * must feed it at a radio's rate rather than the display's. 250 Hz is a
 * typical ELRS link and matches the harness recording rate. */
const RC_HZ = 250;
/*
 * The physics step rate. This MUST equal SIM_STEP_HZ in
 * src/native/sim_abi.h; the ABI does not report it, so the two are kept in
 * step by hand and a mismatch shows up as the shell stepping the module at
 * the wrong speed.
 *
 * The shell's clock is an integer STEP INDEX, not milliseconds. It was
 * milliseconds, which is the same thing only while a step is a
 * millisecond: `steps = Math.floor(acc)` reads an accumulator of
 * milliseconds as a count of steps, and every `simTimeMs += steps` says
 * the same. Raising the rate turns each of those into a silent factor of
 * eight. Counting steps and deriving milliseconds keeps one clock. At
 * 1000 Hz MS_PER_STEP is exactly 1 and every expression below reduces to
 * what it replaced.
 */
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
/*
 * How near a wall a Wall Ride is flown, in metres.
 *
 * The workbook says "just a few inches away from the wall", which is a
 * five inch quad's own width. Two metres is the radius the proximity query
 * is asked with, not the distance a trick demands: the query answers "is
 * anything within two metres", the pattern asks for a great deal closer,
 * and the gap between them is what stops the query missing a wall the craft
 * is about to be beside. See TrickDetector.near.
 */
const WALL_NEAR_M = 2.0;

/* Pack nominal, for the charge bar: 6S between empty and full. */
/* The 6 is PLANT.cells in src/native/plant.c, restated here because the ABI
 * does not report it. These are the HUD gauge's ends only: the physics reads
 * its own constant and never these. Change the plant's cell count and this
 * has to follow, or the bar lies while the flight is right. */
/* Per cell; the airframe says how many cells, so the wing's 4S reads right. */
const PACK_EMPTY_PER_CELL = 3.3;
const PACK_FULL_PER_CELL = 4.2;
/* Full throttle rotor speed on a charged pack, measured off the compiled
 * module at 25,570 RPM. Only the lens shake reads it, to turn motor speed
 * into a 0 to 1 imbalance scale, so a few percent either way is invisible. */
const FULL_THROTTLE_RPM = 25600;

const uiRoot = document.getElementById('ui');

/*
 * Why a dropped tune was refused, in words. The module answers with a
 * code, and a code on screen is developer output: the player wants to
 * know whether to blame the file or the game.
 */
function configFault(code) {
  if (code === -4) {
    return str('main.it_does_not_look_like_a');
  }
  if (code === -2) {
    return str('main.the_file_was_empty_or_too');
  }
  return str('main.the_simulator_refused_it_and_kept');
}

/* Streamed, so the loading screen can report bytes rather than a spinner. */
async function fetchBytes(url, onProgress) {
  const { fetchWithProgress } = await import('./ui/loading.js');
  return fetchWithProgress(url, onProgress);
}

/* Reused rather than allocated at every spawn. */
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/*
 * Bring one map in and make it the world.
 *
 * The module fetch and the world build are separate stages of the loading
 * screen because they fail and stall for entirely different reasons: the
 * first is the network, the second is the main thread. The module counter
 * reports the fetch honestly by watching the browser's own resource timing as
 * it walks the import graph, which needs no cooperation from the map.
 *
 * EXPECTED MODULE COUNTS are a bar weight, nothing more. Getting one wrong
 * makes that stage's bar move at the wrong rate; it cannot break the load,
 * and the stage still ends when the import resolves.
 */
/* swiss2: swiss2.js and the files under src/maps/swiss2/ it imports, 49 in
 * all. The Alps modules it builds through are counted under their own
 * prefix, so they are not in this number, and a pilot who flew the Alps
 * first already has them. Check 16 asserts this count against what the
 * browser actually fetched on choosing the valley, because a bar weight
 * that is wrong cannot break a load and so nothing else would notice: 61
 * sat here for a round for the city while the real count was 63.
 *
 * A map with no entry weighs 4, which is a guess and only a bar's pace.
 * The freestyle town and the airfield were removed on 2026-09-28, and the
 * town's 72 went with it. `npm run lint:memory` prints the fetched count
 * per map beside this number.
 *
 * The prefix a map's modules are counted under is `/src/maps/<id>`, and it
 * stays leading-slash while the rest of the file went relative, which is
 * not an oversight. It is never fetched. moduleCounter matches it as a
 * SUBSTRING of each performance entry's full URL, and a shell mounted at
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
const MAP_MODULE_COUNT = { swiss2: 49, itaipu: 34 };

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

async function loadMap(shell, id, loading, mapOptions) {
  const options = withTimeOption(mapOptions);
  const entry = mapById(id);
  /* Track mode's seat is resolved to a world by worldId before anything
   * asks for one, so a seat reaching here is a caller that skipped it. */
  if (entry.id !== id || !entry.load) {
    throw new Error(`${id} is not a world that can be built`);
  }
  loading.mapInfo({ name: entry.name, poster: entry.poster });
  loading.start('module');
  const counter = moduleCounter(
    `/src/maps/${id}`,
    MAP_MODULE_COUNT[id] ?? 4,
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
  /*
   * FIRST, BEFORE ANYTHING READS THE QUERY.
   *
   * Two things in one call. It takes a sponsor's `utm_source` out of the
   * address and puts it away for thirty days, and it takes every `utm_`
   * parameter OUT of the address bar, which matters here more than
   * anywhere: a simulator URL is how a track travels, so a pilot who sends
   * a friend the link they are looking at must not attribute their friend
   * to a poster they never saw. Everything the shell reads, map, share,
   * board and craft, is left exactly where it was.
   *
   * Then one visit, counted once per browser per UTC day across all three
   * pages. It sends nothing at all if the pilot has switched counting off
   * or their browser sends Global Privacy Control, and nothing waits for
   * it either way.
   */
  pingVisit('sim');
  const canvas = document.getElementById('view');
  /* The flying view wants the shortest path to the glass it can get, and
   * has nothing to read its own frames back for. See shell.js for what the
   * compositor queue costs a pilot.
   *
   * ?gpu=low is a measurement hook: WebGL powerPreference low-power, so a
   * dual-GPU box can bind the iGPU. The flight default stays
   * high-performance. A dual-GPU laptop must not pick the battery chip
   * because a debug URL was opened once; this query is not stored. */
  const gpuQuery = new URLSearchParams(window.location.search).get('gpu');
  const shell = buildShell(canvas, {
    desynchronized: true,
    powerPreference: gpuQuery === 'low' ? 'low-power' : 'high-performance',
  });
  loading.system('input', 'loading');
  const input = new InputManager();
  /*
   * Sample the sticks on their own timer rather than once per rendered frame.
   * See src/input/input.js for what that was costing feedforward.
   */
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
  /* Where the other pilots in a room are, when the picture does not say.
   * See src/ui/peermarks.js; a game mode marks its special pilot with
   * peerMarks.setRole(seat, 'ace'). */
  const peerMarks = new PeerMarks(uiRoot, shell.renderer.domElement);
  const peerMarkGround = (x, z) => view.height(x, z, Infinity);
  /*
   * The thumb sticks, on a device that has thumbs to offer. Mounted after
   * the Ui so the overlay sits ABOVE every screen in the stacking order,
   * which is exactly why the frame loop below only shows it in flight:
   * over a menu its catchment zones would swallow the taps. Pause goes
   * through the same two calls the Escape key makes from flight.
   */
  let touch = null;
  if (touchWanted()) {
    touch = mountTouchSticks({
      onPause: () => {
        if (ui.screen === 'flight') {
          ui.act('pause');
          ui.show('paused');
          /* Hide NOW, not on the next frame: the frame loop confirms this
           * a beat later, and that beat is long enough on a slow phone for
           * the pilot's second tap to land on a stick zone that is sitting
           * over the menu it just opened. */
          touch.setVisible(false);
        }
      },
      /* The aircraft picker over the paused flight, hidden now for the
       * same reason. */
      onSwap: () => {
        if (ui.screen === 'flight') {
          ui.openSwap('flight');
          touch.setVisible(false);
        }
      },
    });
    uiRoot.append(touch.root);
    input.attachTouch(touch);
  }
  /*
   * THE SITE'S COUNTERS.
   *
   * Built HERE, as soon as the input and the shell exist, rather than down
   * beside the frame loop that drives it: the crash handler two thousand
   * lines below calls noteCrash, and a `const` declared after its callers
   * is a temporal dead zone waiting for the day somebody calls one of them
   * a little earlier. Nothing here needs a world, so nothing here has to
   * wait for one.
   *
   * The board's statistics page counts sessions, laps and flight time. This
   * is the only thing in the simulator that reports any of it, and all it
   * ever sends is a few small numbers: see src/share/stats.js for what is
   * NOT in them, which is the part that matters.
   *
   * describe() is a callback rather than three fields, because the aircraft,
   * the map and the input can all change between the first frame and the
   * flush a minute later. It is read at send time so a flush says what the
   * pilot was actually flying, and it is passed in so stats.js never has to
   * import the shell.
   *
   * The input is folded to one of three words HERE, because this is where
   * both halves of the answer live: a radio and a game controller both
   * arrive through the Gamepad API and are the same answer to "did they use
   * sticks", and the board has no business knowing which radio.
   *
   * The craft is the real airframe id; stats.js folds it onto the board's
   * own list at the wire (wireCraft), because the board refuses others.
   */
  const flightStats = createFlightStats({
    describe: () => ({
      craft: ui.settings.airframe,
      /* The board's stats still spell Track mode 'custom', the seat's old
       * name (STATS_MAPS in fdfpv-leaderboard's validate.js). */
      map: ui.settings.map === 'track' ? 'custom' : ui.settings.map,
      input: (() => {
        if (input.firstGamepad()) {
          return 'gamepad';
        }
        if (input.touchSource && input.touchSource.active()) {
          return 'touch';
        }
        return 'keyboard';
      })(),
    }),
  });
  /*
   * The last flush, sent when the page goes away. pagehide rather than
   * unload, because a browser that put this tab in its back/forward cache
   * never fires unload and the minute is lost; visibilitychange covers the
   * mobile case, where a tab being backgrounded is how a session usually
   * ends and pagehide may never come at all.
   *
   * Both may fire for the same departure. That is harmless: the second one
   * finds the counters already cleared and sends a flush of noughts, which
   * costs the board one row it already had.
   */
  window.addEventListener('pagehide', () => {
    flightStats.leaving();
    commitFlightTime();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flightStats.leaving();
      commitFlightTime();
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
  }
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
  /*
   * A machine with no usable GPU hands WebGL to SwiftShader or llvmpipe and
   * keeps drawing, so nothing fails and nothing says why. It just runs at a
   * handful of frames per second, and because the picture is what tells a
   * pilot where the quad is, a slow picture reads as a slow radio. The
   * sticks are not late: they are sampled off their own 2 ms timer and
   * stamped, and the module consumes each one at the moment it was taken.
   * The frame carrying the answer back is what is late.
   *
   * Detection could not know this earlier. loadSettings runs before any
   * context exists and can only read the user agent, which names a Steam
   * Deck and nothing else. This is the first line that has the renderer, so
   * it is the first line that can tell a CPU rasteriser from a GPU.
   *
   * Only a DETECTED value is lowered. Someone who picked High on this
   * machine and meant it keeps it, however it runs.
   */
  if (gpuInfo.software && ui.settings.graphicsAuto && ui.settings.graphics !== 'low') {
    ui.settings.graphics = 'low';
    /* Still detected, not chosen, so this stays set. It costs nothing: the
     * value is already Low, so the test above short circuits on every later
     * boot, and leaving the flag honest is what lets a future round raise a
     * machine back up if it turns out to have had a GPU all along. */
    ui.persistSettings();
    ui.renderMenu();
  } else if (gpuInfo.integrated && ui.settings.graphicsAuto && ui.settings.graphics === 'high') {
    /*
     * THE SAME BRANCH, ONE STEP SMALLER, FOR THE MACHINE MEDIUM IS NAMED
     * FOR.
     *
     * detectDefaultGraphics runs before any context exists and can only read
     * the user agent, which names a Steam Deck, a phone and nothing else.
     * So every laptop booted into High, including the UHD 620 and Iris class
     * parts that quality.js explicitly describes as Medium's target. This is
     * the first line that has the renderer's name, which is the only way to
     * tell an integrated chip from a discrete one, and it is the line the
     * software test above already stands on.
     *
     * Medium and not Low: an iGPU draws perfectly well, it is short of fill
     * rate and memory bandwidth, and Medium is where the shadows come down
     * to 1024 and the bloom pass goes away. Apple Silicon is deliberately
     * not matched, per the note on INTEGRATED_RE.
     */
    ui.settings.graphics = 'medium';
    ui.persistSettings();
    ui.renderMenu();
  }
  let showcase = null;
  /* The aircraft picker's models, in the shell's own renderer. */
  const pickStage = createCarouselStage(shell.renderer);
  /*
   * boot.js read the stored map before any module loaded, so it could weight
   * the loading screen. ui.js is the owner of the setting; if the two ever
   * disagree the ui wins, because it is what the player sees.
   *
   * The menu is rebuilt after the change, not just the value. The Ui builds
   * its rows in its constructor, which has already run by this line, so a
   * map named in the URL used to land in the settings and leave the Map row
   * still reading the map it was not showing.
   */
  if (mapId && ui.settings.map !== mapId) {
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
   * is not built, so the Ui is told that rather than the Alps' mode. */
  function paintBest() {
    if (titleWorld) {
      ui.setBest(undefined);
      return;
    }
    ui.setBest(race.bestMs, view.mode);
  }
  /*
   * THE FLIGHT CONTROLLER'S BYTES ARE ASKED FOR BEFORE THE BOARD IS, AND
   * THIS IS THE ONE PLACE THE TWO OVERLAP.
   *
   * dist/sim.wasm depends on nothing: not the URL, not the board, not the
   * settings. The board fetch below depends on the network reaching another
   * host that may be asleep. They used to run in series, so the wasm request
   * did not leave the browser until both board round trips had come back:
   * measured 1519 ms on a local board, and a cold Render service takes about
   * a minute to wake. Starting it here costs nothing and takes those round
   * trips off the critical path.
   *
   * The progress callback is deliberately gated. loading.report(id) starts
   * that stage if it is not the current one, so an ungated callback would
   * flip the screen to "Flight controller" while it is really waiting on the
   * board, which is the same lie in a new place. Instead the last reading is
   * held and replayed when the sim stage genuinely begins.
   */
  let simProgress = null;
  let simStageLive = false;
  const simBytes = fetchBytes(WASM_URL, (f, got, total) => {
    simProgress = [f, str('main.of_kb', { v1: (got / 1024).toFixed(0), v2: (total / 1024).toFixed(0) })];
    if (simStageLive) {
      loading.report('sim', simProgress[0], simProgress[1]);
    }
  });
  /* A rejection here is handled at the await below, in the stage that owns
   * it. Without this the failure is unhandled for as long as the board takes,
   * and the console gets a promise rejection warning before the screen gets
   * its honest message. */
  simBytes.catch(() => {});
  /*
   * A published track arrives as ?share=id. Fetch it before the world is
   * built so the world built is the one the track the board sent stands in.
   *
   * This is a named stage because it is a network wait on a service that
   * sleeps, and a player who is told "Renderer" while the board wakes up
   * will go looking for the wrong problem.
   */
  loading.start('board');
  loading.system('online', 'loading');
  try {
    const fromUrl = await adoptShareFromLocation();
    /* The board is asked only for a link that names a published track;
     * any other boot makes no connection here. */
    loading.system('online', fromUrl ? 'ready' : 'na');
    if (fromUrl) {
      /*
       * THE AIRCRAFT THAT MAY RACE THE LINKED TRACK, before anything reads
       * a seat. Every quad may, and a plane that fits every gate; a link
       * naming a plane that does not fit gives way to the five inch, and the
       * track moves from the planes' seat to the quads' with it, or the
       * pilot lands with the track they were sent to in the other seat.
       * applySettings runs once below and swaps the plant to match, the
       * same path an aircraft change from the menu takes.
       */
      if (ui.seatCraftForDoc(fromUrl.document)) {
        const stale = readShareImport('wing');
        if (stale && stale.id === fromUrl.id) {
          clearShareImport('wing');
        }
        writeShareImport(fromUrl);
      }
      ui.settings.map = 'track';
      ui.renderMenu();
    }
  } catch (e) {
    loading.system('online', 'fail');
    ui.setBanner(str('main.could_not_open_that_published_track', { v1: e.message ?? e }), true);
  }
  /* Done either way: a board that was down is a board that has finished
   * being asked. Without this the stage records no duration and the bar
   * keeps its weight without ever filling it. */
  loading.done('board');
  /*
   * A board chase link arrives as ?ghost=tm-xxxxxxxx beside the ?share=.
   * The id is only held here; the fetch happens once the course is loaded
   * and its listing known, in ghostCourseChanged, so a slow board cannot
   * stall boot.
   */
  let wantGhostId = '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ghost') || '';
    if (/^tm-[0-9a-f]{8}$/.test(fromUrl)) {
      wantGhostId = fromUrl;
    }
  } catch (e) {
    /* No URL to read. */
  }
  /*
   * The handle lives in this browser. If it has changed since this browser
   * last published, push it to the board so the author line and the times
   * posted under the old handle catch up. A layout change is not sent here:
   * that still asks first, because it clears times.
   */
  (async () => {
    try {
      const listing = inspectCourse();
      await pushOwnedListing(listing && listing.doc ? listing.doc : null);
    } catch (e) {
      /* The board can stay a step behind until they save the name again. */
    }
  })();

  let view = null;
  /*
   * RESIZE IS APPLIED ONCE A FRAME, NOT ONCE AN EVENT.
   *
   * post.setSize reallocates both composer targets, the normal target and
   * every pass including the bloom ladder. Dragging a window edge fires tens
   * of resize events a second, so the old handler turned a drag into a storm
   * of GPU allocations, with the previous set of targets still alive until
   * the collector got to them. Setting a flag and doing the work at the top
   * of the frame collapses a drag into one resize per frame, which is the
   * most a screen can show anyway.
   */
  let resizeDirty = false;
  window.addEventListener('resize', () => {
    resizeDirty = true;
  });
  /* The movie export's surface while one is set, else null: see
   * setExportSurface. A resize waits for it to go. */
  let exportShot = null;
  function applyResizeIfDirty() {
    if (!resizeDirty || exportShot) {
      return;
    }
    resizeDirty = false;
    const d = shell.resize();
    /*
     * The pixel ratio is re-read here, which it never used to be.
     *
     * pixelRatioFor was evaluated at boot, on a preset change and on a
     * settings write, and nowhere else. Browser zoom fires resize and
     * changes devicePixelRatio, so Ctrl-plus left the canvas rendering at
     * the old ratio in fewer CSS pixels, which is a blurry upscale; dragging
     * a window from a 2x laptop panel to a 1x monitor kept rendering four
     * times the pixels the monitor could show. It also matters more now that
     * the ratio depends on the window's area through the field's pixel
     * budget, which by definition changes when the window does.
     */
    const wantPr = pixelRatioFor(ui.settings.graphics, renderScaleOf(ui.settings));
    if (Math.abs(wantPr - shell.pixelRatio) > 0.001) {
      applyPixelRatio(shell, ui.settings.graphics, renderScaleOf(ui.settings));
    }
    /* mapReady as well as view: a swap disposes the old pipeline before it
     * builds the new one, and a resize landing in that window used to call
     * setSize on render targets that had already been freed. mapReady is
     * false for exactly that gap. */
    if (view && view.post && mapReady) {
      view.post.setSize(d.w, d.h);
    }
  }
  /*
   * THE MOVIE EXPORT DRAWS AT THE MOVIE'S SIZE, NOT THE WINDOW'S.
   *
   * src/replay/export.js takes each frame off this canvas, so for an export
   * the drawing buffer is w x h exactly (pixel ratio 1) while the page keeps
   * its CSS size, and the world's own clock (grass, water) is the movie's:
   * clock() is the movie time of the frame being drawn, so a frame held
   * while the encoder catches up does not move the grass. Returns the
   * restore, which re-applies the window's size and ratio, and any resize
   * that arrived meanwhile.
   */
  function setExportSurface(w, h, clock) {
    if (exportShot) {
      throw new Error('an export surface is already set');
    }
    exportShot = { clock, wind0: performance.now() * 0.001, waves0: renderSimT };
    shell.pixelRatio = 1;
    shell.renderer.setPixelRatio(1);
    shell.renderer.setSize(w, h, false);
    shell.camera.aspect = w / h;
    shell.camera.updateProjectionMatrix();
    if (view && view.post && mapReady) {
      view.post.setSize(w, h);
    }
    return () => {
      if (!exportShot) {
        return;
      }
      exportShot = null;
      resizeDirty = true;
      applyResizeIfDirty();
    };
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
  audio.music.onChange = (st) => {
    ui.setMusicNow(st);
  };
  /* The dock names what is playing, and what is playing on the title
   * screen is the menu bed, whose record is a random pick on the player.
   * Push it before the first gesture so the dock is not showing a flight
   * track that nobody is going to hear yet. This is unconditional now:
   * the Music track setting names a FLIGHT record, so a pinned setting is
   * not the answer to what is playing in the menus either. */
  if (typeof audio.musicStatus === 'function') {
    ui.setMusicNow(audio.musicStatus());
  }
  ui.onMusicSkip = (dir) => {
    wakeAudio();
    if (typeof audio.skipMusic !== 'function') {
      return;
    }
    audio.skipMusic(dir);
    const st = audio.musicStatus();
    /*
     * A skip pins the setting only when what was skipped was a FLIGHT
     * record. The dock's buttons skip whatever is playing, which in the
     * menus is the two record bed, and writing one of those ids into
     * musicTrack would leave the setting holding a value its own list
     * does not contain, showing as the first flight track and silently
     * coerced back to rotation on the next read.
     */
    if (st && st.context === 'flight' && ui.settings.musicTrack !== 'rotation') {
      ui.settings.musicTrack = st.id;
      ui.persistSettings();
    }
    if (ui.screen === 'pilot') {
      ui.renderMenu();
    }
  };
  /* Which crate the bed plays, off the screen. ui.flying() is the one
   * predicate for that question; see its comment for why paused is a
   * flight. */
  ui.onScreenChange = () => {
    if (typeof audio.setMusicContext === 'function') {
      audio.setMusicContext(ui.flying() ? 'flight' : 'menu');
    }
  };

  loading.start('sim');
  loading.system('physics', 'loading');
  simStageLive = true;
  if (simProgress) {
    /* Whatever arrived while the board was being asked. Usually all of it. */
    loading.report('sim', simProgress[0], simProgress[1]);
  }
  const sim = await loadSim(await simBytes);
  /* The crash cam's journal stands between the shell and the module from
   * here on, before anything has allocated or captured sim.e: it writes
   * down the calls take over replays, and changes none of them
   * (src/replay/journal.js). */
  const journal = createJournal(sim.e);
  sim.e = journal.exports;
  if (typeof sim.e.sim_deflect !== 'function') {
    throw new Error('sim.wasm does not export sim_deflect');
  }
  if (typeof sim.e.sim_contact !== 'function') {
    throw new Error('sim.wasm does not export sim_contact');
  }
  if (typeof sim.e.sim_set_ground !== 'function') {
    throw new Error('sim.wasm does not export sim_set_ground');
  }
  if (typeof sim.e.sim_set_crashflip !== 'function') {
    throw new Error('sim.wasm does not export sim_set_crashflip');
  }
  if (typeof sim.e.sim_set_pose !== 'function') {
    throw new Error('sim.wasm does not export sim_set_pose');
  }
  if (typeof sim.e.sim_ground_contacts !== 'function') {
    throw new Error('sim.wasm does not export sim_ground_contacts');
  }
  if (typeof sim.e.sim_set_launch_stand !== 'function') {
    throw new Error('sim.wasm does not export sim_set_launch_stand');
  }
  /* The module is in and answers for every entry point the shell calls:
   * the plant is up. The controller is up once its tune is applied, below. */
  loading.system('physics', 'ready');
  loading.system('flight', 'loading');
  /*
   * The flight controller comes entirely from a Betaflight diff, so which
   * diff is chosen IS the tune. The choice is a setting; the boot path and
   * the menu path load it the same way, and a stored id that no longer
   * exists falls back to the first tune rather than failing to boot.
   */
  let configId = tuneById(ui.settings.tune).id;
  /* What the Tune menu item last asked for, which is not the same question
   * as what is loaded: a dropped file changes the second and not the first. */
  let menuTune = ui.settings.tune;
  let configName = `${configId}.diff`;
  /*
   * Async config loads (tune menu, dropped diff) are generation counted.
   * A stale fetch must not call sim_init after a newer choice has already
   * won, and Fly / Resume must not start a run whose RC timestamps will be
   * invalidated by a sim_init still in flight. See adoptSimClock.
   */
  let configGen = 0;
  let configLoadWait = Promise.resolve();
  /*
   * A flown config is a TUNE plus the pilot's PID ADJUSTMENT plus the
   * pilot's RATES, joined only by composeConfig in src/fc/dump.js. No file
   * in configs/ carries a rateprofile any more, and the rate lines are
   * appended last so that even a diff the pilot drops on the page flies on
   * the rates in the menu. See configs/rates.js for why rates were
   * separated: shipping rates inside a tune meant choosing that tune also
   * halved the stick authority, so the tune could never be judged on its
   * own. The PID adjustment sits between the two, keyed by
   * the LOADED tune's id, so each tune keeps its own; see configs/pids.js.
   */
  /* The Flight controller screen's saved dump, the body of the pilot's
   * own "custom" tune. Its rates were stripped on the way in, so it goes
   * through composeConfig like any file in configs/. */
  function readFcDump() {
    try {
      return localStorage.getItem(FC_DUMP_KEY);
    } catch (e) {
      return null;
    }
  }
  function writeFcDump(body) {
    try {
      localStorage.setItem(FC_DUMP_KEY, body);
      /* Stamped with the aircraft it came off, so the Tune row offers it on
       * that aircraft only. See FC_DUMP_AIRFRAME_KEY. */
      localStorage.setItem(FC_DUMP_AIRFRAME_KEY, ui.settings.airframe);
      return true;
    } catch (e) {
      return false;
    }
  }
  let tuneText;
  if (configId === 'custom') {
    tuneText = readFcDump();
    if (tuneText == null) {
      /* A stored choice whose dump is gone. Fall back to the first tune
       * rather than failing to boot; the stale choice must not stop the
       * page. */
      configId = TUNES[0].id;
      ui.settings.tune = configId;
      menuTune = configId;
      configName = `${configId}.diff`;
      ui.persistSettings();
    } else {
      configName = str('main.your_edits');
    }
  }
  if (tuneText == null) {
    tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
  }
  let ratesText = ratesDiff(ui.settings.rates);
  let pidsText = pidsDiffFor(ui.settings.pids, configId);
  let configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP, pidsText);
  if (sim.init(configText) !== SIM_OK) {
    if (configId !== 'custom') {
      throw new Error(`sim_init failed on ${configName}`);
    }
    /* A saved dump the module refuses must not brick the page: boot the
     * default tune instead and keep the dump stored for the pilot to
     * re-edit. */
    configId = TUNES[0].id;
    ui.settings.tune = configId;
    menuTune = configId;
    configName = `${configId}.diff`;
    ui.persistSettings();
    tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
    pidsText = pidsDiffFor(ui.settings.pids, configId);
    configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP, pidsText);
    if (sim.init(configText) !== SIM_OK) {
      throw new Error(`sim_init failed on ${configName}`);
    }
  }
  /*
   * What the controller is actually flying, read back out of the module
   * after every successful init and handed to the PIDs screen. The screen
   * never computes a PID from a slider itself: this readback is the only
   * source its numbers have, so a slider that stopped reaching Betaflight
   * would be visible as a slider that moves nothing.
   */
  function publishPids() {
    const num = (key) => {
      const v = Number(moduleGet(sim, key));
      return Number.isFinite(v) ? v : 0;
    };
    /*
     * The tune's OWN slider positions come from the tune text, not from
     * the module: once an override block has run, the module's stored
     * sliders ARE the override, and "the value this tune ships" would be
     * unrecoverable. The text is the tune, cliMap takes the last write
     * exactly as the CLI does, and a key the tune never sets is the
     * firmware default of 100.
     */
    const map = cliMap(tuneText);
    const baseline = {};
    for (const k of SLIDER_KEYS) {
      const v = Number(map.get(SLIDERS[k].cli));
      baseline[k] = Number.isFinite(v) ? v : 100;
    }
    const pids = {};
    for (const axis of PID_AXES) {
      pids[axis] = {
        p: num(pidCliKey('p', axis)),
        i: num(pidCliKey('i', axis)),
        d: num(pidCliKey('d', axis)),
        dmax: num(pidCliKey('dmax', axis)),
        f: num(pidCliKey('f', axis)),
      };
    }
    ui.setPidsLive({
      tune: configId,
      mode: moduleGet(sim, 'simplified_pids_mode'),
      baselineMode: map.get('simplified_pids_mode') || 'RPY',
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
   * The swap path has fallen back to the previous map on a failed load for
   * a while; boot had nothing, so one map that would not build (a bad
   * asset, a WebGL context the photographs cannot have) took the whole
   * session down before the title screen. The Alps are the floor: the
   * smallest world here, and the one the Swiss valley builds through, so
   * if they cannot build there is nothing to fall back TO and the throw is
   * honest.
   */
  try {
    view = await loadMap(shell, worldId(), loading, {
      quality: ui.settings.graphics,
      renderScale: renderScaleOf(ui.settings),
    });
  } catch (e) {
    if (worldId() === FLOOR_WORLD) {
      throw e;
    }
    console.error(e);
    const failed = mapById(worldId()).name;
    /* A title world that will not build is dropped, and the pilot's seat
     * is left alone: it was not the seat that failed. syncWorld then builds
     * the seat, with its own fallback, once the settings are applied. */
    if (titleWorld) {
      titleWorld = null;
    } else {
      ui.settings.map = FLOOR_WORLD;
    }
    ui.renderMenu();
    view = await loadMap(shell, FLOOR_WORLD, loading, {
      quality: ui.settings.graphics,
      renderScale: renderScaleOf(ui.settings),
    });
    /* The banner, not `notice`: that is declared with the frame loop's own
     * state further down and does not exist yet. This is the same way the
     * share adoption above reports a boot failure. */
    ui.setBanner(str('main.could_not_be_loaded_the_floor', { failed, floor: mapById(FLOOR_WORLD).name }), true);
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
   * Where the run starts, in world space. The map owns this now. It used to be
   * three module scope consts computed from view.gates[0], which is exactly
   * why a gateless map could not boot: the shell dereferenced a gate before
   * the first frame and a freestyle map has none. They are `let` because a map
   * swap changes all three.
   */
  let startX = 0;
  let startZ = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  /*
   * The height of the surface a craft standing at (x, z) rests on.
   *
   * Two calls, not one, and the reason is the city. `height(x, z, fromY)`
   * only offers a platform that is within a step of the height the query is
   * made from, which is what lets a quad fly UNDER the overbridge and land ON
   * its deck. Asking from far below gives the bare ground; asking again from
   * there picks up the footway, the kerb or the forecourt slab actually laid
   * on it. Asking from far above would seat a craft parked in the street on
   * the roof seven metres over it.
   */
  function groundAt(x, z) {
    const bare = view.height(x, z, -1000);
    return view.height(x, z, bare);
  }

  /* The y component of the craft's own up vector, in world space, clamped
   * into the domain of acos. Rotating world up by q leaves 1 - 2(x^2 + z^2),
   * and the clamp is there because a normalised quaternion can still put
   * that a bit outside [-1, 1] in floating point. Reads qCollide, the
   * attitude the ground query and the hit query both use this frame.
   */
  function craftUpY() {
    const qx = qCollide.x;
    const qz = qCollide.z;
    const u = 1 - 2 * (qx * qx + qz * qz);
    if (u > 1) {
      return 1;
    }
    return u < -1 ? -1 : u;
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

  function adoptSpawn() {
    seatRestHeight(airframeById(runAirframe), startsAfloat());
    const sp = runSpawn();
    startX = sp.x;
    startZ = sp.z;
    startYaw = sp.yaw;
    startPitch = sp.pitch || 0;
    /* Terrain here is not at y = 0. Spawning without its height puts the
     * craft underground, looking up at the lit underside of the terrain.
     * spawn.y is a fromY hint so a deck spawn is not the grass under it. */
    startY = sp.y != null
      ? view.height(startX, startZ, sp.y)
      : groundAt(startX, startZ);
    qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
    qSpawnInv.copy(qSpawn).invert();
  }

  /* The race: gate order, lap clock, best lap. On a freestyle map it is a
   * real object with no gates in it and it scores nothing. */
  let race = new Race(view.gates, 'full');
  /* The in-sim builder, once a world it can build in is seated. Declared up
   * here because the ghost below asks whether a run is its test flight. See
   * buildHost. */
  let build = null;
  /*
   * THE FREESTYLE SCORE, and it only ever runs on a freestyle map.
   *
   * The detector is fed one physics step at a time from inside the step
   * loop, not once a frame, because a 360 roll at 900 deg/s is 400 ms and a
   * frame at 30 fps would sample it eleven times: the rate integral has to
   * see every millisecond the plant saw or the turn count is a guess. That
   * is the only thing in the shell that runs at 1 kHz, and it is three
   * multiply-accumulates and a compare, which is why it can.
   *
   * The scorer is the opposite: it is ticked once a frame, off the SIM
   * clock rather than the wall clock, so a dropped frame cannot bank a
   * combo early and a paused game cannot bank one at all.
   */
  /* Set once a frame, read 1000 times: whether this map and this moment
   * are being scored at all. */
  let scoring = false;
  /* Scratch for the per-step world position and heading handed to the
   * detector. Written in place, never allocated in the step loop. */
  const scorePos = new THREE.Vector3();
  const scoreFwd = new THREE.Vector3();
  /* The craft's own up axis, in the obstacles' frame. With the nose it gives
   * the recogniser the whole body frame, which is what lets a lap tell the
   * loop's own turn from the bank it was flown at. See debankLap. */
  const scoreUp = new THREE.Vector3();
  const scoreQuat = new THREE.Quaternion();
  /*
   * The run's shape is the pilot's choice, made on the Freestyle screen and
   * re-read every time a run starts: 'scored' is two minutes and a board,
   * 'free' is neither, and 'off' shows the pilot none of it. See
   * DEFAULTS.freestyleScoring in src/ui/ui.js for why off is the default.
   *
   * OFF IS A DISPLAY DECISION AND NOTHING ELSE. The recogniser still runs
   * and the scorer still keeps its total: what off removes is the overlay
   * and the clock, so the pilot is not shown a number from a system that
   * is still being built. Keeping the engine running is the cheaper change
   * by far, it keeps one code path in the air instead of two, and it means
   * the thing being developed goes on being exercised on real flights.
   * Only 'scored' puts a clock on the run, so 'off' and 'free' alike leave
   * score.timed false and the run never ends.
   */
  const scoredRun = () => ui.settings.freestyleScoring === 'scored';
  const scoringWanted = () => ui.settings.freestyleScoring !== 'off';
  const score = new FreestyleScore({ timed: scoredRun() });
  /*
   * The things in the world worth flying around, derived from the map's own
   * colliders once when the map is built. Null on a map with none, and the
   * detector is then exactly the open-air recogniser it was before.
   */
  let obstacles = null;
  const trickDetector = new TrickDetector((trick) => {
    score.land(trick);
  });
  /*
   * Rebuild the obstacle list for the map now loaded. Freestyle only: a
   * race map has a course, and nothing on a course is a powerloop object.
   * The ground query is the map's own, so a wall that reaches sixty metres
   * underground is measured from the street rather than from its buried
   * bottom edge.
   */
  function rebuildObstacles() {
    if (!view || view.mode !== 'freestyle' || !view.colliders) {
      obstacles = null;
      trickDetector.obstacles = null;
      return;
    }
    obstacles = deriveObstacles(view.colliders, (x, z, fromY) => view.height(x, z, fromY));
    trickDetector.obstacles = obstacles;
    /* And the world itself, as one distance query. The recogniser measures
     * the craft's own path and asks this only whether anything solid was
     * inside the circle it flew, which is a question a wall, a roof edge or
     * a tree can answer as well as a rail can. See TrickDetector.solids. */
    trickDetector.solids = view.colliders
      ? {
        gapAt: (x, y, z, r) => view.colliders.gapAt(x, y, z, r),
        /* The nearest solid's own direction, and the point on its centre
         * line nearest the query. A rail, a coping, a parapet and a roof
         * edge all have one, which is what lets a figure flown over any of
         * them be the same measurement. See TrickDetector.closeTrack. */
        axisAt: (x, y, z, r) => (view.colliders.axisAt(x, y, z, r)
          ? {
            gap: view.colliders.axisGap,
            dx: view.colliders.axisDx,
            dy: view.colliders.axisDy,
            dz: view.colliders.axisDz,
            cx: view.colliders.axisCx,
            cy: view.colliders.axisCy,
            cz: view.colliders.axisCz,
          }
          : null),
      }
      : null;
  }
  /* The map loaded at boot never passes through the swap path above, so it
   * gets its obstacles here. After the consts, not before: rebuildObstacles
   * writes to trickDetector and a call any earlier is a dead zone away. */
  rebuildObstacles();
  const racePrev = new THREE.Vector3();
  let raceHasPrev = false;

  /*
   * THE GHOST: a recorded lap flown back as a translucent pacer.
   *
   * Everything here is downstream of the physics, the same standing as the
   * race itself: the recorder samples the same interpolated world pose the
   * hero craft and the gate scoring already use, and the replay drives a
   * separate session-lived craft that collides with nothing. Timeline zero
   * for both sides is the timing gate crossing, so the chase is one
   * subtraction from the lap clock, and a ghost recorded at any frame rate
   * replays identically at any other.
   *
   * What can be chased: the session's best lap on this course, the previous
   * lap, or a lap somebody posted to the board with a recording attached.
   * Session ghosts live in memory only; the board is where a lap outlives
   * the tab. The pilot's choice is settings.ghost for the two session modes
   * and session state for a board pick, because a board ghost belongs to
   * one course and one visit.
   */
  const ghostRecorder = new GhostRecorder();
  const ghostBook = new GhostBook();
  let ghostRig = buildGhostCraft();
  /*
   * Session lived, like the craft. It is parented into whichever scene
   * holds the hero craft, below, and nothing used to take it out again, so
   * every map swap ran disposeSceneGraph over its geometry, its body and
   * disc materials, its sprite material and its name tag CanvasTexture,
   * which is not in SESSION_TEXTURES. Re-parenting it on the next frame
   * does not undo a free. Saying so here means each map's dispose hands it
   * back without having to know it exists.
   */
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
    let value = 'Off';
    if (on) {
      value = state === 'open'
        ? (livePeers.size ? `${livePeers.size} here` : str('main.alone'))
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
    return str('rooms.name', { adj: str(`rooms.adj.${pick[0]}`), animal: str(`rooms.animal.${pick[1]}`), n: pick[2] });
  }
  function roomProfile() {
    const id = runAirframe;
    const parts = PROPS[id] ? partsEntry(ui.settings.parts, id) : null;
    const status = roomStatus();
    return {
      airframe: id,
      map: view ? view.id : worldId(),
      figure: figurePick(),
      livery: (ui.settings.livery && ui.settings.livery[liveryKey(id)]) || null,
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
  /* Defend Itaipu (src/share/roomwar.js), wired below at DEFEND ITAIPU. */
  const roomWar = createRoomWar((obj) => roomLinkState.send(obj));
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
  const GAME_CARDS = { race: 'roombrowser.mode_race', tag: 'roomtag.section', combat: 'combat.card', war: 'war.card', free: 'ui.free_flight_card' };
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
      roomWar.onWelcome(w);
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
      if (roomRace.onMessage(m) || roomTag.onMessage(m) || roomWar.onMessage(m)) {
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
        roomTagRunId = null;
        roomTagHud.update(null);
        tagMarkPeers();
        roomCombat.clear();
        combatLayer.clear();
        combatHud.update(roomCombat.round(), 0, null, 0, 0);
        roomWar.clear();
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
  ui.titleRooms = () => roomBrowser.titleItems();
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

  /* The teammate to watch this frame, stepped by `step` through the ones
   * drawn in the air here in seat order, or kept while it still flies;
   * null when spectating none. */
  function warWatch(step = 0) {
    if (!warSpectating()) {
      warWatchSeat = -1;
      return null;
    }
    const seats = [...roomPeers.values()]
      .filter((p) => p.drawnPose && p.last && !(p.last.flags & FLAG_CRASHED))
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
      }, { label: str('war.intro.watch'), note: str('war.intro.watch_note'), action: 'friends-war-intro' }];
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
      rows: () => [{ label: str('lobby.campaign'), note: str('lobby.campaign_note'), action: 'friends-lobby-campaign' }],
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
      rows: () => [],
      line: (lobby) => str('lobby.tag_line', { n: lobby.goal }),
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
    const rows = [{
      label: str(ready ? 'lobby.unready' : 'lobby.ready'), note: str(ready ? 'lobby.unready_note' : 'lobby.ready_note'), action: 'friends-lobby-ready', primary: true,
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
        aircraft: airframeById(seat === w.seat ? runAirframe : roomPeers.get(seat).profile.airframe).name,
        ready: Boolean(lobby.ready[seat]),
        host: seat === w.host,
        me: seat === w.seat,
      })),
      last: game === 'war' && v && (v.state === 'won' || v.state === 'lost' || v.state === 'ended') && v.mission === mission ? {
        state: v.state, stars: v.result ? v.result.stars : null, kills: mine ? mine.kills : 0,
      } : null,
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

  /* The start row's press. Consent first, whoever's room this is: a
   * room made by hand never went through warEnter's (FLOW-AUDIT.md D6).
   * Then the mission campaign Play chose for this room, else mission 1. */
  async function warStart() {
    if (await warConsented() && !campaignRef.startSelected()) {
      roomWar.start(roomMission(), { intro: true });
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
   * not take is left to the picked one. Resolves the code of the room it
   * made, or null. */
  ui.onWarCard = async (card, mission = null) => {
    const name = normaliseRoomName(str('war.room_name', { name: roomName(ownName()) })) || null;
    for (;;) {
      try {
        return await warEnter({ mission, public: true, name }, card);
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
   * says the clip's lines, not the live war's. */
  function warSay(items, prio = 'call') {
    if (!items.length || !audio.enabled || mode === 'replay') {
      return;
    }
    const radio = audio.war();
    radio.setLang(currentLocale());
    for (const item of items) {
      radio.say(item, performance.now(), prio);
    }
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
    /* And its water: a flood of the replay's own from the openings, on
     * the clip's clock (map.replayFlood). The mission's gate state is
     * not journalled yet (no war feeds map.setGateState), so none. */
    if (w.openings && typeof view.replayFlood === 'function') {
      view.replayFlood({ openings: w.openings, gates: null, fromMs: w.from ?? w.t ?? 0 });
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
  ui.craftLimit = () => (inWarRoom() ? WAR_AIRFRAMES : null);
  function warSeatCraft() {
    const s = ui.settings;
    if (isWarAirframe(s.airframe)) {
      return;
    }
    const id = isWarAirframe(s.warAirframe) ? s.warAirframe : WAR_DEFAULT;
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
    /* As a swap seats it: the mode that goes with the aircraft waits for
     * the title, and the war's world stays. */
    ui.modeSyncedFor = id;
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

  function warBegin(v, wallMs) {
    warBegunId = roomWar.match();
    warCalls.reset();
    warTargetsClear();
    warBreakage.reset();
    warOpenings.length = 0;
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
    /* Not while the world is being built for the mission (at its time of
     * day, warTimeFrame, at the briefing's start): the film's scenery
     * would go with the old map. It starts once the world is up, where the
     * room is by then, the film's preload span having covered most of it. */
    const worldUp = mapReady && !worldSync && !swapInFlight;
    if (briefing && warIntroShown !== roomWar.match() && worldUp) {
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
    } else if (warIntro && warIntroFor !== 'watch' && !briefing) {
      warIntroStop();
    }
  }

  /* The room link closed. */
  function warLeave() {
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
   * map, which turns its leaves and its water to them on the room clock;
   * none, Free Flight's. Handed again when it changes or the map is new.
   */
  let warGatesKey = null;
  let warGatesView = null;
  function warGatesFrame(v) {
    if (!view || typeof view.setGateState !== 'function') {
      return;
    }
    const gates = Array.isArray(v.gates) && v.gates.length ? v.gates : null;
    const key = gates ? JSON.stringify(gates) : '';
    if (key === warGatesKey && view === warGatesView) {
      return;
    }
    warGatesKey = key;
    warGatesView = view;
    view.setGateState(gates);
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
    warIntroFrame(v);
    warCraftFrame(v);
    if (roomWar.on() && roomWar.match() !== warBegunId) {
      warBegin(v, wallMs);
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

  /* The game running in this room, as this screen knows it, or null. */
  function roomRunning() {
    const r = roomCombat.round();
    if (roomRace.race().state === 'on') {
      return 'race';
    }
    if (roomTag.on()) {
      return 'tag';
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
    if (link.phase !== 'open') {
      return;
    }
    const now = roomLinkState.roomNow();
    if (now == null) {
      return;
    }
    roomRaceFrame(now, wallMs);
    roomTagFrame(now, wallMs);
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
    for (const peer of roomPeers.values()) {
      roomDrawPeer(peer, now, scene, dt, simT);
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
    const free = roomTag.on() || roomWar.on();
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
    roomCall('join');
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
    return roomRunning() != null || roomCombat.round().state === 'over';
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

  function roomDrawPeer(peer, now, scene, dt, simT) {
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
    const drawn = Boolean(scene) && here && peer.last && peer.track.sample(now, nearWeight(Math.hypot(
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
        figure: p.figure ? p.figure.group.position.toArray() : null,
        wreck: p.wreck ? p.wreck.summary() : null,
        status: p.profile.status ?? null,
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
  window.__warIntroWatch = () => warIntroPlay('watch');
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
      return {
        value: st.welcome && st.welcome.public
          ? str('friends.row_in_public', { name: roomBrowser.title(st.welcome), n: roomPeers.size + 1 })
          : str('friends.row_in', { code: st.code, n: roomPeers.size + 1 }),
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
        tag: game === 'tag' ? lead(roomTagRows(host), 'friends-tag-start') : roomTagRows(host),
        combat: combatRows(host, w, game === 'combat'),
        war: warRows(host, w),
      };
      /* Defend Itaipu last, unless the room or its pilot came for it, and
       * only on Itaipu (warRows): a public room there says why not. */
      const first = game || (wanted === 'war' ? 'war' : null);
      const order = first ? [first, ...['race', 'tag', 'combat', 'war'].filter((g) => g !== first)] : ['race', 'tag', 'combat', 'war'];
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
          value: str('friends.here_value', { n: roomPeers.size + 1, cap: w ? w.cap : 8 }),
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
    inBuild: (id) => Object.hasOwn(WAR_MISSIONS, id),
    /* From a war lobby (its Campaign row), Play sets that room's mission,
     * the host's to set, and the pilot is back in the lobby to say ready;
     * from anywhere else, the war's way in. */
    enterWarRoom: async (mission) => {
      if (lobbyGame() !== 'war') {
        return ui.onWarCard('way-war', mission);
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
    leaveToCards();
    delete ui.cursorMemory.friends;
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
    if (action === 'friends-war-private') {
      await warFromPublic();
      return;
    }
    if (action === 'friends-war-stop' || action === 'friends-end-war') {
      roomWar.end();
      return;
    }
    if (action === 'friends-war-intro') {
      warIntroPlay('watch');
      return;
    }
    if (action === 'friends-combat-5' || action === 'friends-combat-3') {
      roomCombat.start(action === 'friends-combat-5' ? 5 : 3);
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
    raceHoldMs = roomRun() ? roomRace.holdMs(now) : roomTagHoldMs(now);
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
  const ghostSample = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
  let ghostLap = null; /* the lap being chased, armed at each lap start */
  let ghostChased = null; /* the lap the last FINISHED lap was chased against */
  let ghostChoice = 'best'; /* off, best, previous, or board:tm-xxxxxxxx */
  let ghostBoardTimes = null; /* this course's posted times, for the picker */
  let ghostBoardLap = null; /* the downloaded board ghost, decoded once */
  let ghostBoardBusy = false;
  let ghostGap = null; /* { deltaMs, final, untilWall } for the OSD */
  /* The ?ghost= a board chase link arrived with, parsed at boot above,
   * armed once the course's times are fetched. */
  let ghostQueryId = wantGhostId;
  /* The previous frame's pose, so a lap start can seed the recorder with
   * the frame BEFORE the crossing and the t = 0 keyframe is interpolated
   * across the line rather than held from the frame after it. */
  const ghostPrev = { valid: false, simMs: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  function normalizeGhostChoice(raw) {
    return raw === 'off' || raw === 'previous' ? raw : 'best';
  }
  ghostChoice = normalizeGhostChoice(ui.settings.ghost);

  /* Ghosts are course-shaped, not tune-shaped: any config's lap can pace
   * any other. The book is keyed accordingly. */
  function ghostCourseKey() {
    /* A seated track is keyed by the track; a world flown free is keyed by
     * the world. */
    const course = loadedCourseKey(view);
    return course ? `custom:${course}${lapCraft() ? '#wing' : ''}` : view.id;
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

  function ghostLabelFor(lap) {
    if (lap.source === 'board') {
      return `${lap.name || str('main.rival')}  ${formatTime(lap.durationMs)}`;
    }
    return `${lap.label === 'Session best' ? str('main.best') : str('main.last')}  ${formatTime(lap.durationMs)}`;
  }

  /* What the current choice resolves to right now, or null. Session slots
   * fill in as laps are flown, so a choice can be ahead of its data: Best
   * with no lap yet simply flies no ghost until there is one. */
  function resolveGhost() {
    /* No ghost on a built track's TEST flight: the track changes under it
     * between runs, so its lap is of a track that may no longer exist. A
     * published map track (build.racing) is a course like any other, and
     * chases and records exactly as the field does. */
    if (race.freestyle || ghostChoice === 'off' || (build && build.testing)) {
      return null;
    }
    if (ghostChoice.startsWith('board:')) {
      return ghostBoardLap && `board:${ghostBoardLap.timeId}` === ghostChoice ? ghostBoardLap : null;
    }
    const key = ghostCourseKey();
    return ghostChoice === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
  }

  function armGhost() {
    ghostLap = resolveGhost();
    if (ghostLap) {
      ghostRig.setLabel(ghostLabelFor(ghostLap));
    }
  }

  /*
   * The Ghost menu row, rebuilt whenever the data behind it moves. The row
   * itself lives in ui.js; this is the one place that knows what can be
   * chased, so it owns the labels, the availability notes and the cycle
   * order: off, session best, previous lap, then every board time that
   * carries a recording.
   */
  function ghostRowChoices() {
    const list = [
      { id: 'off', label: 'Off' },
      { id: 'best', label: str('main.your_best_this_session') },
      { id: 'previous', label: str('main.your_previous_lap') },
    ];
    for (const t of ghostBoardTimes || []) {
      list.push({ id: `board:${t.id}`, label: str('main.text', { name: t.name, formatTime: formatTime(t.lapMs) }) });
    }
    return list;
  }

  function ghostRowNote() {
    if (ghostChoice === 'off') {
      return str('main.nobody_to_chase_laps_still_record');
    }
    if (ghostChoice.startsWith('board:')) {
      if (ghostBoardBusy) {
        return str('main.fetching_that_lap_from_the_board');
      }
      return ghostBoardLap
        ? str('main.a_recorded_lap_from_the_public')
        : str('main.that_lap_could_not_be_fetched');
    }
    const key = ghostCourseKey();
    const have = ghostChoice === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
    if (!have) {
      return str('main.no_lap_on_record_this_session');
    }
    return str('main.a_translucent_pacer_flying_that_lap', { formatTime: formatTime(have.durationMs) });
  }

  function syncGhostRow() {
    if (race.freestyle) {
      ui.setGhostRow(null);
      return;
    }
    const choices = ghostRowChoices();
    const current = choices.find((c) => c.id === ghostChoice) || choices[1];
    ui.setGhostRow({
      value: current.label,
      note: ghostRowNote(),
      cycle: (dir) => pickGhostByStep(dir),
    });
  }

  function pickGhostByStep(dir) {
    const choices = ghostRowChoices();
    const at = Math.max(0, choices.findIndex((c) => c.id === ghostChoice));
    const next = choices[(at + (dir < 0 ? -1 : 1) + choices.length) % choices.length];
    pickGhost(next.id);
  }

  function pickGhost(id) {
    ghostChoice = id;
    if (id === 'off' || id === 'best' || id === 'previous') {
      ui.settings.ghost = id;
      ui.persistSettings();
      armGhost();
      syncGhostRow();
      return;
    }
    /* A board pick fetches the recording once and keeps it decoded. */
    const timeId = id.slice('board:'.length);
    if (ghostBoardLap && ghostBoardLap.timeId === timeId) {
      armGhost();
      syncGhostRow();
      return;
    }
    loadBoardGhost(timeId);
  }

  function adoptBoardGhost(payload, timeId) {
    const lap = new GhostLap(decodeGhost(ghostFromBase64(payload.ghost)), {
      label: str('main.board_lap'),
      name: payload.name || '',
      source: 'board',
    });
    lap.timeId = timeId;
    ghostBoardLap = lap;
    return lap;
  }

  function loadBoardGhost(timeId) {
    const listing = ghostListing();
    if (!listing) {
      return;
    }
    const key = ghostCourseKey();
    ghostBoardBusy = true;
    syncGhostRow();
    (async () => {
      try {
        const payload = await fetchGhost(listing.shareId, timeId, listing.board);
        if (ghostCourseKey() !== key) {
          return; /* The course changed under the fetch. */
        }
        adoptBoardGhost(payload, timeId);
        armGhost();
      } catch (e) {
        if (ghostCourseKey() !== key) {
          return;
        }
        ghostBoardLap = null;
        notice = { text: str('main.could_not_fetch_that_ghost', { v1: e.message ?? e }), untilMs: performance.now() + 3600 };
      } finally {
        if (ghostCourseKey() === key) {
          ghostBoardBusy = false;
          syncGhostRow();
        }
      }
    })();
  }

  function ghostListing() {
    try {
      const listing = inspectCourse();
      return listing && listing.shareId ? listing : null;
    } catch (e) {
      return null;
    }
  }

  /*
   * A course just became current: forget the last course's board data,
   * re-arm the persisted choice, and go looking for what the board holds.
   * The times fetch is a nicety with the same standing as the course list:
   * a board that is down means a picker with the two session modes and
   * nothing else, never a broken menu.
   */
  function ghostCourseChanged() {
    ghostRecorder.abort();
    ghostLap = null;
    ghostChased = null;
    ghostGap = null;
    ghostBoardTimes = null;
    ghostBoardLap = null;
    ghostBoardBusy = false;
    ghostPrev.valid = false;
    ghostRig.setPresence(0);
    ghostChoice = normalizeGhostChoice(ui.settings.ghost);
    syncGhostRow();
    livePeersClear();
    syncLive();
    const listing = ghostListing();
    if (!listing || race.freestyle) {
      return;
    }
    const key = ghostCourseKey();
    (async () => {
      try {
        const times = await fetchTrackTimes(listing.shareId, listing.board);
        if (ghostCourseKey() !== key) {
          return;
        }
        /* The five fastest recorded laps are plenty of rivals for one
         * menu row; the full table lives on the board page. On a map track
         * they are the seated aircraft's board's: the quads' laps for a
         * quad, the planes' for a plane. */
        const plane = Boolean(lapCraft());
        ghostBoardTimes = times.filter((t) => t.hasGhost && t.id && Boolean(t.craft) === plane).slice(0, 5);
        syncGhostRow();
        if (ghostQueryId) {
          const wanted = ghostQueryId;
          ghostQueryId = '';
          if (times.some((t) => t.id === wanted && t.hasGhost)) {
            ghostChoice = `board:${wanted}`;
            loadBoardGhost(wanted);
          }
        }
      } catch (e) {
        /* No board today. The session modes still work. */
      }
    })();
  }

  /*
   * Per frame, after the race has scored the travel. Records the running
   * lap, closes the recording at the line, arms the next chase, and reads
   * the gap at each gate. lapStartBefore and lapsBefore are the race's
   * state from before this frame's update, which is how a lap boundary is
   * seen without the race having to announce one.
   */
  function ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, passedAny) {
    /* The test flight's exception, for resolveGhost's reason. */
    if (race.freestyle || (build && build.testing)) {
      return;
    }
    const lapDone = race.laps.length > lapsBefore;
    /*
     * The gap, read at the gate just crossed, BEFORE any re-arm below:
     * your split against the split of the ghost you were actually chasing
     * this lap. Reading it after the re-arm compared a finishing lap with
     * itself, which is a proud zero every time it sets a best.
     */
    if (passedAny && ghostLap && lapStartBefore != null) {
      let mine = null;
      let theirs = null;
      if (lapDone) {
        mine = race.lastLapMs;
        theirs = ghostLap.durationMs;
      } else if (race.splits.length) {
        const k = race.splits.length - 1;
        mine = race.splits[k];
        theirs = ghostLap.splitMs(k);
      }
      if (mine != null && theirs != null) {
        ghostGap = { deltaMs: mine - theirs, final: lapDone, untilWall: nowWall + 2800 };
      }
    }
    if (lapDone) {
      /* Close the finished lap. Its own clock ran up to lastLapMs; this
       * frame's pose sits just past the line on that clock, and feeding it
       * before finishing is what lets the stored tail cross the line at
       * speed instead of freezing on it. */
      const tOld = (simNow - race.lapStartMs) + race.lastLapMs;
      ghostRecorder.push(tOld, pCurr.x, pCurr.y, pCurr.z, qPrev.x, qPrev.y, qPrev.z, qPrev.w);
      const lapRecord = ghostRecorder.finish(race.lastLapMs, race.lastSplits);
      ghostBook.keep(ghostCourseKey(), lapRecord);
      /* Who this lap was flown against, for the results line. The re-arm
       * below may replace ghostLap with the lap just recorded. */
      ghostChased = ghostLap;
      syncGhostRow();
    }
    if (race.lapStartMs != null && race.lapStartMs !== lapStartBefore) {
      /* A lap just began, at the crossing this frame contains. */
      ghostRecorder.begin();
      if (ghostPrev.valid) {
        ghostRecorder.push(
          ghostPrev.simMs - race.lapStartMs,
          ghostPrev.x, ghostPrev.y, ghostPrev.z,
          ghostPrev.qx, ghostPrev.qy, ghostPrev.qz, ghostPrev.qw,
        );
      }
      ghostRecorder.push(
        simNow - race.lapStartMs,
        pCurr.x, pCurr.y, pCurr.z,
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      );
      armGhost();
    } else if (race.lapStartMs != null) {
      ghostRecorder.push(
        simNow - race.lapStartMs,
        pCurr.x, pCurr.y, pCurr.z,
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      );
    }
  }

  /* The chase itself: pose the rig at the ghost's own lap time, fade it in
   * off the line, out past its finish, and down across a recorded crash
   * recovery. Runs every frame; zero presence parks the whole group. */
  function ghostFrame(simNow) {
    const running = ghostLap && !race.freestyle && race.lapStartMs != null
      && (mode === 'flight' || mode === 'paused');
    if (!running) {
      ghostRig.setPresence(0);
      return;
    }
    const t = simNow - race.lapStartMs;
    const tail = ghostLap.durationMs - t;
    let presence = 1;
    if (t < 400) {
      presence = t / 400;
    }
    if (tail < 0) {
      presence = Math.max(0, 1 + tail / 400);
    }
    if (ghostSampleInto(t)) {
      presence = Math.min(presence, 0.15);
    }
    ghostRig.group.position.set(ghostSample.px, ghostSample.py, ghostSample.pz);
    ghostRig.group.quaternion.set(ghostSample.qx, ghostSample.qy, ghostSample.qz, ghostSample.qw);
    ghostRig.setPresence(presence);
    /* The rig is session lived and the scene is not: whichever scene holds
     * the hero craft holds the ghost, checked here rather than at the swap
     * so no load path can strand it in a disposed world. */
    if (presence > 0 && shell.quad.parent && ghostRig.group.parent !== shell.quad.parent) {
      shell.quad.parent.add(ghostRig.group);
    }
  }

  function ghostSampleInto(t) {
    ghostLap.sample(t, ghostSample);
    return ghostSample.cut;
  }

  /* One sentence for the results screen when a ghost was being chased:
   * whether the run's best lap beat it, and by how much. ghostChased, not
   * ghostLap: by the time results show, the finish line has re-armed the
   * chase, and a run that just set a best would be compared with itself. */
  function ghostResultNote() {
    if (!ghostChased) {
      return null;
    }
    const best = race.bestLapMs();
    if (best == null) {
      return null;
    }
    const who = ghostChased.source === 'board'
      ? (ghostChased.name || str('main.the_board_lap'))
      : ghostChased.label.toLowerCase();
    const d = best - ghostChased.durationMs;
    if (Math.abs(d) < 10) {
      return str('main.level_with_the_ghost_at', { who, formatTime: formatTime(ghostChased.durationMs) });
    }
    if (d < 0) {
      return str('main.you_beat_the_ghost_at_by', { who, formatTime: formatTime(ghostChased.durationMs), v3: (Math.abs(d) / 1000).toFixed(2) });
    }
    return str('main.the_ghost_at_stayed_ahead', { who, formatTime: formatTime(ghostChased.durationMs), v3: (d / 1000).toFixed(2) });
  }

  /* The recording of a finished lap whose time is being uploaded, as wire
   * base64, or null when this session holds no recording of that exact
   * lap. Previous is checked before best: the two can share a duration,
   * and then either encoding is the same lap. */
  function ghostForUpload(lapMs) {
    const key = ghostCourseKey();
    for (const lap of [ghostBook.previous(key), ghostBook.best(key)]) {
      if (lap && Math.round(lap.durationMs) === Math.round(lapMs)) {
        return ghostToBase64(encodeGhost(lap));
      }
    }
    return null;
  }

  /* Best laps are only comparable on the same config, pack voltage and
   * flight style: an arcade lap is flown on a different aircraft and
   * must not sit in an expert record. Expert keeps the bare key so every
   * record set before the style existed stays exactly where it was. */
  function recordKey() {
    let h = 5381;
    for (let i = 0; i < configText.length; i += 1) {
      h = ((h * 33) ^ configText.charCodeAt(i)) >>> 0;
    }
    const style = runStyle === 'arcade' ? '.arcade' : '';
    /*
     * The AIRFRAME is in the key, and it has to be: two aircraft's laps on
     * the same track are not the same record, and the config hash above
     * cannot tell two plants on one tune file apart. The EMPTY suffix was
     * the five inch's, so every record set before the airframe joined the
     * key stayed where it was; the five inch was removed on 2026-10-03 and
     * its records stay under that key, untouched and unread, as the
     * orphaned keys below do.
     */
    const craft = `.${runAirframe}`;
    /*
     * AND THE WEIGHT, on exactly the rule above it, keyed on the multiple of
     * g the plant is holding rather than on the slider, so the key names the
     * machine and not the menu. A lap at a different weight is a lap on a
     * quad that hovers, climbs and drops differently, and filing it beside
     * another would make the record meaningless.
     *
     * THE EMPTY SUFFIX IS THE 1.0 MACHINE AND STAYS THAT WAY. Every record
     * set before the slider existed was flown at exactly 1.0, and the shell's
     * normal is now 1.62, so the normal carries `.g162` and those old records
     * stay under the bare key, untouched and unreachable, because nothing on
     * the new band lands on 1.000 exactly: the floaty end is 0.972. That is
     * the append-only rule applied to a pilot's own bests. The `.grav` and
     * `.air` suffixes that came before were each live for under two hours on
     * a slider with a different meaning and are orphaned the same way.
     */
    const gravPart = runGravityScale === 1 ? '' : `.g${Math.round(runGravityScale * 100)}`;
    return `webfpv.best.${h.toString(16)}.${runVoltage.toFixed(2)}${style}${craft}${gravPart}`;
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
   * Milliseconds the INTEGRATOR has actually stepped since reset: a mirror
   * of the module's own step_index, and the only valid timebase for input
   * timestamps. simTimeMs is the LAP clock and keeps running while the
   * craft sits landed with the integrator frozen, so the two diverge by
   * exactly the time spent parked. Stamping stick samples with the lap
   * clock put them that far into the sim's future, and sim_step consumes a
   * sample only when step_index reaches its timestamp, so every second on
   * the pad became a second of stick lag for the whole rest of the run.
   * The owner reported it as 1 to 2 seconds of input lag, unflyable, and
   * it was: the lag equalled the time between entering flight and pushing
   * the throttle up. Invisible before the takeoff fix, because at 60 fps
   * every takeoff crashed and the crash reset re-zeroed both clocks.
   */
  let simStepIdx = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  /*
   * The radio. Default is 'perfect', which is the behaviour this shell has
   * always had: turning a real link on has to be a choice, so that a lap
   * time never changes underneath a pilot who did not ask for it.
   */
  const rcLink = new RcLink(LINK_DEFAULT);
  /*
   * The flight recorder. Off unless the pilot turns it on, because it holds
   * every frame of the run in memory and nobody should pay for that without
   * asking. Written out as blackbox_decode CSV so a sim flight and a real
   * quad's log go through the same parser and the same report.
   */
  const flightLog = new FlightRecorder();
  /*
   * Stick samples waiting for an RC slot, and the value currently held.
   *
   * The old code took `samples[samples.length - 1]` and used it for every RC
   * frame in the render frame, which threw away every other sample and turned
   * the stick into a staircase at frame rate. Now the pad is polled on its
   * own timer (src/input/input.js) and each sample carries the wall clock time
   * it was taken at, so a slot gets the sample that was actually current when
   * that slot happened. Held between slots, which is what a receiver does.
   */
  const rcPending = [];
  let rcHeld = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
  /*
   * Re-seat the RC grid on the sim clock and throw away stick samples that
   * belong to a stretch of time the integrator never ran. Called wherever the
   * grid is pinned: reset, and the moment a parked craft takes off again.
   * Without the second half, a craft that sat landed for six seconds would
   * hand six seconds of queued samples to the first six milliseconds of
   * flight.
   */
  function pinRcGrid() {
    rcNextMs = simStepIdx * MS_PER_STEP;
    lastTs = rcNextMs / 1000;
    /* The radio restarts with the grid it feeds, so a reset is a reset and
     * a replay of the same session draws the same jitter. */
    rcLink.reset(rcNextMs);
    if (rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
  }

  /*
   * JS RC time follows the module, never the other way around. sim_init and
   * sim_reset restart the input stream at t = 0. Stamping sim.input from a
   * leftover lastTs puts every sample in the queue's future: sim_step only
   * consumes a sample once step_index reaches its timestamp, so the lag
   * equals the leftover. That was round 16b (lap clock) and the tune-swap
   * lag (async sim_init). Read the module every time the stream can restart.
   */
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

  function adoptSimClock() {
    const st = readState();
    simStepIdx = Math.round(st[0] * SIM_HZ);
    pinRcGrid();
  }

  /*
   * PUT THE CRAFT BACK WHERE IT WAS AFTER A CONFIG SWAP, instead of putting
   * the run back on the start line.
   *
   * WHY THIS EXISTS. Rates are part of the config text, so changing one has
   * to go through sim_init, and sim_init is a full reset: "dynamic state
   * zeroed as in sim_reset", per src/native/sim_abi.h. Every rate change
   * therefore used to end in reset(), which zeroes the LAP clock and drops
   * the quad on the start line. That is right for a tune, which changes the
   * machine, and wrong for rates, which change the pilot: the owner asked
   * for a rate change mid run to leave the run alone, and a pilot tuning
   * stick feel against a corner cannot do it if every nudge costs the lap.
   *
   * WHAT IT CAN AND CANNOT CARRY. Position and attitude go back through
   * sim_set_pose, which is the only writer the ABI exposes. VELOCITY,
   * ANGULAR RATE AND MOTOR RPM CANNOT FOLLOW: sim_init zeroes them, no
   * export writes them, and this container has no Emscripten to add one. So
   * the quad resumes stationary where it was rather than carrying its
   * momentum through. That is the honest limit of this change and it is
   * nearly invisible in the path the request describes, where the pilot is
   * on the pause menu and the craft is holding still anyway.
   *
   * WHAT HAS TO BE PUT BACK BY HAND is what sim_init wiped and the shell
   * still believes: the pack, and crashflip. The airframe and the flight
   * style are MODES and survive init by ABI contract; the ground plane is
   * written every frame by the contact loop; angle mode is re-applied by
   * syncAngleMode at the tail of applySettings, which runs after this.
   *
   * The RC grid is re-pinned and the queue dropped for the same reason
   * resetCraft does it: the module's step index went back to zero, and a
   * stick sample stamped on the old clock would land in the integrator's
   * future.
   */
  function reseatAfterConfigSwap(before) {
    sim.setCellVoltage(runVoltage);
    sim.e.sim_set_crashflip(crashflipOn ? 1 : 0);
    const code = sim.e.sim_set_pose(
      before[1], before[2], before[3],
      before[7], before[8], before[9], before[10],
    );
    if (code !== SIM_OK) {
      /* The pose refused, so there is nowhere honest to put the craft back.
       * Fall back to the old behaviour rather than flying from wherever
       * init happened to leave it. */
      reset();
      return;
    }
    acc = 0;
    rcPending.length = 0;
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
  }

  function bumpConfigGen() {
    configGen += 1;
    return configGen;
  }

  function isLiveConfigLoad(gen) {
    return gen === configGen;
  }

  function whenConfigReady(fn) {
    const gen = configGen;
    configLoadWait.then(() => {
      if (configGen !== gen) {
        whenConfigReady(fn);
        return;
      }
      fn();
    }, () => {
      if (configGen !== gen) {
        whenConfigReady(fn);
        return;
      }
      fn();
    });
  }
  let crashed = false;
  let clipCrashUntil = 0;
  let clipCrashKind = '';
  let clipGraceUntil = 0;
  /* Wall clock of the last land or takeoff blip. See GROUND_CUE_GAP_MS. */
  let groundCueAtWall = -1e9;
  /* Wall clock the departure window closes at. See TAKEOFF_WINDOW_MS. */
  let takeoffUntil = 0;
  const clipWatch = makeClipWatch();
  /* Turtle is a shell pose flip, not the crashflip mixer. crashflipOn
   * is true while waiting inverted or while the flip is playing, so OSD
   * and the banner can keep saying Turtle. The mixer stays off. */
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
  /* After the flip, ignore pitch/roll until the stick recentres.
   * Otherwise airmode inherits the poke and yanks the hull. */
  let turtleRecover = false;
  let turtleResumeGate = false;
  /* Obstacle roofs (train, deck) are not sim_ground_contacts. */
  let turtleOnSupport = false;
  /* sim_motor_override(all, 0) while parked, cleared on unpark. rest()
   * does not zero motor_omega, and hot rotors yank when the wait ends. */
  let turtleParkMotors = false;
  /* -1: FPV. 0..INTRO_TOTAL: orbit, approach, then zoom at the start of a run. */
  let introMs = -1;
  /*
   * The craft starts ON THE GROUND, landed, not hanging in mid air.
   *
   * This was a game breaking bug and it deserves the space. The craft used to
   * spawn at SPAWN_ALT with its motors at zero rpm and physics frozen until
   * the throttle passed 0.05. The instant a pilot touched the throttle the
   * integrator unfroze in free air with dead motors, and the quad fell the
   * 0.71 m to the ground and arrived at 3.4 m/s, which is past the 2.0 m/s
   * landing gate, so it crashed. Then resetCraft put it back at 0.9 m in mid
   * air and the same thing happened again, forever. A reviewer measured the
   * whole loop: "crash, 1.4 s lockout, back to 0.9 m in mid air, touch
   * throttle, crash". Anywhere between the launch threshold and hover the
   * quad fell out of the sky.
   *
   * Starting landed hands the craft to the on ground branch below, which
   * already holds it, already keeps the lap clock honest and already gates
   * liftoff on TAKEOFF_THROTTLE. A real quad sits on the ground before a run.
   *
   * There used to be a `launched` flag here as well. It was initialised true
   * and never assigned anything but true, because setting it false on a
   * respawn was what made every recovery repeat the takeoff trap, so every
   * test of it was a constant and the takeoff hint it gated could not
   * appear. What the banner actually wants is "has this run left the ground
   * yet", which is a render question, not a flight one: nothing below reads
   * this, so it cannot gate the integrator or the RC grid the way the old
   * flag could.
   */
  let flownThisRun = false;
  /* On the ground, upright, intact, physics frozen. Position is not
   * writable through the ABI, so the craft is held by not stepping it;
   * sim_rest zeroes the velocity at each judged touchdown so the frozen
   * state is a true rest state rather than a falling one. */
  let landed = true;
  /* landed on the previous frame, for the landing edge that holds a pad's
   * throttle. See input.holdThrottleLow. */
  let landedWas = true;
  /* The run the challenges are judging (progressRun's key), and the
   * hangar's rev while it plays (ui.onHangarTry). */
  let progressKey = '';
  let hangarRev = null;
  /* Capture hold: keep the plant pose and FPV lens as seated, without
   * the parked overlay or the intro orbit. Used by __seatCraft so a
   * camera-down crash can be photographed before the hull tumbles. */
  let poseLock = false;
  /* An air start's countdown, milliseconds of the flight screen still to
   * hold it for, and the wall time its GO leaves the banner. See airStart. */
  let airHoldMs = 0;
  let airGoUntil = 0;
  /*
   * Between committing to a takeoff and getting the collision sphere clear
   * of the surface. While this is set, ground contact does not re-land the
   * craft: the parked pose already sits inside contact (the sphere reaches
   * 17 cm below a centre parked 7.5 cm up), so during the motor spool the
   * contact test fires on EVERY frame, and judging each one flipped the
   * craft landed and flying at frame rate: measured at a simulated 60 fps,
   * 96 to 346 freeze cycles per gentle takeoff, each one a land sound, a
   * takeoff sound and a render pose flick. A takeoff ends the hold by
   * climbing clear; an abort (throttle back below the gate, or sinking
   * 5 cm into the surface because the pack cannot hover this throttle)
   * ends it by resting the craft where it is.
   */
  let takingOff = false;
  let statePrev = null;
  let stateCurr = null;
  /* The sim clock at the drawn pose, between the two states, s: what the
   * water is drawn at, so the waves on screen are the ones under the
   * drawn floats. */
  let renderSimT = 0;
  /* Ground sweep state. groundPrev is where the craft was last frame, so the
   * terrain test can be a segment rather than a point. */
  const groundPrev = new THREE.Vector3();
  let groundHasPrev = false;
  let groundY = 0;
  /* Published through __craftState so a capture can ASSERT a landing rather
   * than describe one. */
  let lastDescent = 0;
  let lastTiltDeg = 0;
  let lastHitKind = 'none';
  /* Which collider that was, so a check can tell a building's own wall
   * from its neighbour's (scripts/roof-check.js). Harness only. */
  let lastHitIndex = -1;
  let lastGroundHits = 0;
  /* Every 1 ms step that ended with the hull on the ground plane or a
   * wheel loaded on it, since the page loaded: a touch too short for a
   * frame's own count to see, and gear rolling, which the hull count does
   * not see at all. Harness only, through window.__ground. */
  let groundContactSteps = 0;
  let wheelPtr = 0;
  let wheelLoads = null;
  function wheelsLoaded() {
    if (typeof sim.e.sim_wheel_loads !== 'function') {
      return false;
    }
    /* A view kept across steps, remade only when the module's memory
     * grows, so the step loop allocates nothing. */
    if (!wheelPtr) {
      wheelPtr = sim.e.malloc(4 * 8);
    }
    if (!wheelLoads || wheelLoads.buffer !== sim.e.memory.buffer) {
      wheelLoads = new Float64Array(sim.e.memory.buffer, wheelPtr, 4);
    }
    sim.e.sim_wheel_loads(wheelPtr);
    return wheelLoads[0] > 0 || wheelLoads[1] > 0 || wheelLoads[2] > 0 || wheelLoads[3] > 0;
  }
  let lastClearance = 1;
  let lastUpz = 1;
  let lastFpvY = 0;
  let lastCamFloor = 0;
  let lastCamClear = 0;
  let lastCamFwdY = 0;
  let lastCamUpY = 0;
  let lastClosing = 0;
  /* How square the last contact was to the craft's disc plane, 0 edge on
   * and 1 belly on. Readback only: the impulse the solver applied is what
   * sizes the sound and the shake now, not a speed threshold. */
  let lastUpDot = 0;
  let speedNow = 0;
  /* How many contacts this run has bounced off, for the readback and for
   * nothing else. It used to be a count DOWN from three lives; there is no
   * damage model any more, so it counts up and costs nothing. */
  let bounceCount = 0;
  let bounceAtWall = 0;
  /* Real Betaflight crashflip, held by the pilot. Distinct from
   * crashflipOn, which belongs to the scripted turtle. */
  let manualFlip = false;
  /*
   * How often the solid world is resolved, in SIM milliseconds.
   *
   * Four is 250 Hz. It is a count of 1 ms plant steps and never a frame
   * delta, so the cadence, and therefore the trajectory, is the same
   * whether the host delivered those steps in one batch of sixteen or in
   * four batches of four. That is the whole point: CLAUDE.md says a
   * dropped frame must change nothing about the trajectory, and while
   * contact ran per frame it changed everything about it.
   *
   * Four rather than one because the query is not free and one buys
   * nothing: the sweep is exact, so it cannot tunnel at 250 Hz any more
   * than at 1000 Hz, and 4 ms of travel at racing speed is 12 cm, well
   * inside the swept test. Four rather than sixteen because the slide
   * continuation and the depenetration both get finer as the step
   * shrinks, and 250 Hz is where that stopped being visible.
   */
  const OBSTACLE_STEP = 4;
  let obsPhase = 0;
  /* Facts the contact pass accumulates for the frame that contains it:
   * the shell reads these once, after stepping, for the clip watch, the
   * sound and the shake. */
  let obsResolved = false;
  let obsContact = false;
  let obsLeftover = false;
  let obsInterior = 0;
  let obsRoof = false;
  let obsImpulse = 0;
  let obsImpulseKind = '';
  /* The collider kind of the contact being resolved, for its material. */
  let obsKindIndex = -1;
  /*
   * THE HULL MET A SOLID, and how fast it was closing when it did.
   *
   * obsImpulse is what the SOLVER changed, and on a vertical face that is
   * not the same question. Measured on the training wall, flown into it
   * head on: a 4.0 m/s approach resolved to a dv of 0.09 m/s and a 9.7
   * m/s approach to nothing at all, because the sweep clamps the travel
   * at the face and there is little normal velocity left by the time
   * sim_contact_at runs. A tap keyed off that number is a tap that never
   * happens, which is why no wall trick in the catalogue could fire.
   *
   * obsTouched is set by the sweep itself, so it is true whenever the hull
   * actually reached a solid, and obsClosing is the approach speed along
   * the face normal, which is the number GRAZE_SPEED_MAX was written
   * about: a deliberate tap is slow, a smack is not.
   */
  let obsTouched = false;
  let obsClosing = 0;
  /*
   * THE CRAFT IS HOLDING ITSELF ON A FACE WITH ITS OWN THRUST.
   *
   * Two counters on the sim clock, both advanced by the contact pass and
   * both in milliseconds. pressHeldMs is how long the hold has run,
   * pressIdleMs is how long since the last contact that had the thrust
   * axis into the face. See PRESS_UP_DOT in collide.js for why a rotor
   * pressed onto masonry has to lose speed, and for the measurements.
   */
  let pressHeldMs = 0;
  let pressIdleMs = 0;
  let pressing = false;
  /* Harness: skip the draw so a probe can fly at frame rate rather than at
   * the town's draw rate. See window.__drawOff. */
  let harnessNoDraw = false;
  /*
   * Its own cooldown, so the recogniser's window is not shared with the
   * audio cue's and one cannot swallow the other.
   *
   * ON THE SIM CLOCK, not the wall clock. Everything downstream of this is a
   * game rule: it decides whether a contact reaches the recogniser at all,
   * and therefore whether a Wall Tap is a Wall Tap. A cooldown measured in
   * wall milliseconds spends a different number of contacts on a machine
   * running at 30 fps and one running at 144, which is exactly the frame
   * rate dependence CLAUDE.md keeps out of the game. The audio cue below
   * stays on the wall clock, because a cue is a cue.
   */
  let trickTouchAtSimMs = -1e9;
  /*
   * WHICH BRANCH OF THE CONTACT PASS A HIT TOOK. Three integers on a path
   * that only runs when something was actually touched. They exist because
   * a craft flown into the training wall at 11 m/s stopped dead and the
   * game saw nothing at all: no bounce, no impulse, no bump, no crash, and
   * therefore no Wall Tap. Telling "never swept the wall" from "swept it
   * and took the buried branch" needs the counters, not a guess.
   */
  /*
   * `inbound` and `outbound` count the sign of the contact normal against the
   * plant's own velocity, in the PLANT's frame, which is the only place the
   * conversion can be checked. A healthy run is nearly all inbound: a normal
   * points out of the solid, so it opposes a craft arriving at it. A run that
   * is mostly outbound is the spawn rotation missing from a direction, which
   * is what welded the craft to the town's walls. See worldDirToSim.
   *
   * `resting` is a contact the plant declined because there was no approach
   * speed left to solve, which is the ordinary state of a hull sliding along
   * a face. It is not a failure and it no longer ends the pass.
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
   * Harness only: the obstacle contacts since the last throw, where each
   * met the craft (the arm, plant body frame, from the CG) and on which
   * part when the hull is a fixed wing's parts (-1 for the discs), so a
   * capture can say what a pole struck. Kept only once a capture has
   * thrown the craft (window.__crashThrow), and bounded, so a pilot's
   * flight allocates nothing for it; window.__contacts().log.
   */
  const contactLog = [];
  const CONTACT_LOG_MAX = 64;
  let contactLogOn = false;
  function logContact(st, arm) {
    if (!contactLogOn || contactLog.length >= CONTACT_LOG_MAX) {
      return;
    }
    const w = st[7];
    const x = st[8];
    const y = st[9];
    const z = st[10];
    contactLog.push({
      t: st[0],
      kind: lastHitKind,
      /* The moving box met (a car, a cabin), or -1 for a static solid. */
      moving: view.colliders.hitMoving,
      part: view.colliders.hitArm ? view.colliders.hitPart : -1,
      arm: [
        (1 - 2 * (y * y + z * z)) * arm.x + 2 * (x * y + w * z) * arm.y + 2 * (x * z - w * y) * arm.z,
        2 * (x * y - w * z) * arm.x + (1 - 2 * (x * x + z * z)) * arm.y + 2 * (y * z + w * x) * arm.z,
        2 * (x * z + w * y) * arm.x + 2 * (y * z - w * x) * arm.y + (1 - 2 * (x * x + y * y)) * arm.z,
      ],
    });
  }
  /*
   * Harness only, kept with the contact log above: the steps on which the
   * plant's parts met a solid it holds (sim_obstacle_contacts), and which
   * held solid was nearest the craft then. Since the plant resolves the
   * solids it holds (#79) the shell's own sweep drops those contacts, so
   * lastHitKind stays empty through a hit the plant took; this is where a
   * capture reads what the craft met instead. window.__contacts().obstacle.
   */
  const obstacleLog = [];
  function logObstacleStep(st) {
    if (!contactLogOn || obstacleLog.length >= CONTACT_LOG_MAX || sim.e.sim_obstacle_contacts() <= 0) {
      return;
    }
    poseFromState(st, pProbe);
    const col = view.colliders;
    let best = -1;
    let bestGap = Infinity;
    for (const i of crashKnownList) {
      let gap;
      if (col.fbox[i]) {
        gap = col.boxGap(i, pProbe.x, pProbe.y, pProbe.z);
      } else {
        col.axisToPoint(i, pProbe.x, pProbe.y, pProbe.z);
        gap = Math.sqrt(col.nx * col.nx + col.ny * col.ny + col.nz * col.nz) - col.fr[i];
      }
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    obstacleLog.push({
      t: st[0],
      parts: sim.e.sim_obstacle_contacts(),
      index: best,
      kind: best >= 0 ? col.kindName(col.fkind[best]) : 'none',
      built: best >= col.baseCount,
      solid: best >= 0 ? {
        a: [col.fax[best], col.fay[best], col.faz[best]], b: [col.fbx[best], col.fby[best], col.fbz[best]], r: col.fr[best], box: Boolean(col.fbox[best]),
      } : null,
      gap: bestGap,
      at: [pProbe.x, pProbe.y, pProbe.z],
    });
  }
  /* The last impulse announced, so a harder hit inside the cooldown is
   * still heard: a graze followed by the wall behind it is two events. */
  let lastImpulse = 0;
  /* Previous frame's sim clock, for anything measured in sim milliseconds
   * rather than wall ones. See the clip watch. */
  let simClockPrevMs = 0;
  /* Wall clock until which a recover-in-place is allowed to settle. */
  let recoverGraceUntil = 0;
  /* The last ground skip, so a craft sliding along the grass reports one
   * bounce rather than one a frame. */
  let groundBounceAtWall = 0;
  let bounceHitIndex = -1;
  let bounceHitKind = '';
  /* The craft's tilt-aware vertical half extent, written by the physics
   * branch each frame and read by the obstacle query later in the same
   * frame. Starts level. */
  let vHalfFrame = craftVerticalHalf(0);
  let airtimeMs = 0;
  /* The freestyle run's clock, as the OSD reads it. Written once a frame
   * from score.view() just above setOsd, so the readout is this frame's
   * rather than the previous one's. */
  let scoreState = 'ready';
  let scoreRemainMs = 0;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  let runVoltage = ui.settings.packVoltage;
  /* The flight style the CURRENT run is flown on. Applied only between
   * runs, same rule as the pack voltage, so a mid run settings visit
   * cannot change the physics under a lap in progress. */
  let runStyle = ui.settings.flightStyle === 'arcade' ? 'arcade' : 'expert';
  /*
   * THE WEIGHT THE RUN IS FLOWN AT, and it is the one setting here that does
   * NOT wait for the next run.
   *
   * Pack charge, flight style and the airframe all wait, because a pilot
   * changing them is in a menu and the run can start again around them. This
   * slider is on the flight screen, under the pilot's hands, for the express
   * purpose of being felt while the craft is in the air: a knob that took
   * effect next time would answer the question it was built for with a shrug.
   * So it applies at once, and the cost is paid where it belongs, on the lap:
   * a lap the change lands in the middle of is voided, because a lap flown
   * at two weights is not a lap flown at either.
   *
   * TWO NUMBERS, because the module and the menu no longer agree at rest.
   * runWeight is the slider value the run is flown at, 100 by default.
   * runGravityScale is the multiple of 9.80665 the module is actually
   * holding, which starts at 1.0 because that is the module's own default
   * and the machine every harness replay flies; the shell's normal is
   * configs/airframes.js gravityBase, 1.62. So at boot the two disagree by
   * construction, applySettings sees it and pushes the base through the ONE
   * path that talks to sim_set_gravity, and the record key is built from the
   * scale the plant is holding rather than from the slider, so it survives
   * the base moving again. Same trick runAirframe below uses for the same
   * reason: boot must not grow a second path of its own.
   */
  let runWeight = WEIGHT_STOCK;
  let runGravityScale = 1;
  /*
   * The aircraft the RUN is on, which starts as the one buildShell drew and
   * NOT as the stored setting. That is deliberate: applySettings below is
   * called once at boot, sees the two disagree, and does the swap through
   * the one code path that swaps an aircraft, instead of boot having a
   * second path of its own that would drift from it. buildShell draws
   * DEFAULT_AIRFRAME; the module starts on plant 0, which no aircraft
   * seats (runSimId), so every boot takes the swap and sim_set_airframe.
   */
  let runAirframe = DEFAULT_AIRFRAME;
  /* The model the scene draws: TITLE_CRAFT on the title, the seated
   * aircraft everywhere else. */
  let drawnCraft = DEFAULT_AIRFRAME;
  let drawnCombat = null;
  /* Where the seated aircraft bolts its camera, in its own frame. The quad's
   * numbers are lens.js's; the wing's are in the nose of its pod. */
  let camMountFwd = CAMERA_MOUNT_FORWARD;
  let camMountUp = CAMERA_MOUNT_UP;
  /* The seated airframe's cell count, for the pack gauge. */
  let runCells = airframeById(runAirframe).cells;
  /* Which aircraft the Settings studio last built, so it is rebuilt when
   * the aircraft changes rather than posing the old one. */
  let showcaseCraft = DEFAULT_AIRFRAME;
  /* Ten doubles for sim_float_state, for the harness's reading, taken once. */
  let floatStatePtr = 0;
  /* Four doubles in the module's heap for sim_plane_surfaces, taken once. */
  let wingSurfPtr = 0;
  /* What the module was last told about the wing's stabiliser. */
  let wingStabApplied = -1;
  /*
   * THE FLAPS' SWITCH, on an aircraft that has them (airframes.js `flaps`):
   * 0 up, 1 half, 2 full, stepped by F in that order and round again, as a
   * radio's three position flap switch is flipped. The plant keeps the
   * notch across resets and moves the flaps there at the servo's own rate;
   * this is the shell's copy for the OSD and the key, and it goes back to
   * up whenever the airframe changes, as the plant's does.
   */
  let flapNotch = 0;
  function setFlapNotch(n) {
    if (typeof sim.e.sim_wing_set_flaps !== 'function' || sim.e.sim_wing_set_flaps(n) !== SIM_OK) {
      return false;
    }
    flapNotch = n;
    return true;
  }
  /*
   * A catapult, once the aircraft has left it: the launcher's
   * world matrix, held so it stays at the spawn while the aircraft it is
   * parented to flies away (it is part of the craft's model, so it is
   * built, swapped and disposed with it and needs no scene of its own).
   * Null while it stands under a parked aircraft.
   */
  let launcherLeft = null;
  const launcherInv = new THREE.Matrix4();
  /* Where the canopy last hung, craft frame, for when the aircraft stops
   * under it and there is no air to say. */
  const chuteDir = [0, 1, 0];
  /* Whether the pilot has been told the aircraft is down under its chute. */
  let chuteDownSaid = false;
  let notice = null; /* { text, untilMs } for one off shell messages */
  /* The seated world's own note, waiting for a flight to be said over. See
   * showCourseNotes. */
  let heldNotes = null;
  let padPickReturn = 'title';
  /* How many laps THIS run lasts. Settings.laps can change from pause, and
   * reading it live used to end a 5 lap run the moment someone dropped the
   * setting to 1. */
  let runLaps = ui.settings.laps;
  race.setRecordKey(recordKey());
  paintBest();

  /*
   * The world's own note, as a timed banner, and NOT OVER A MENU.
   *
   * This is the second go at that rule. The first said not over the GATE,
   * because on a browser with nothing built the note printed "Nothing has
   * been built yet, open the track builder" across the two cards before the
   * pilot had chosen to race at all. Holding it until the gate was answered
   * moved the problem one screen along rather than fixing it: it landed on
   * the title menu, and on the Freestyle picker, in amber, across four world
   * cards. Reported twice, with a screenshot of each.
   *
   * A BANNER IS A FLIGHT MESSAGE. The frame loop already says so and blanks
   * the banner on any screen that is up. Every other thing that reaches the
   * banner is raised BY a pilot doing something on the screen they are
   * looking at, and belongs there: a publish, an upload, a tune that would
   * not load. This one is raised when a WORLD LOADS, which is nobody asking
   * a question, and it was the only thing jumping that queue.
   *
   * So it is held until there is a flight to say it over, and its clock
   * starts then rather than when the world loaded. Held rather than dropped,
   * because the note is worth saying to the pilot about to fly that world
   * and worth nothing at all to the one reading a menu.
   */
  function showCourseNotes() {
    heldNotes = view.notes && view.notes.length ? view.notes.join('\n') : null;
  }
  showCourseNotes();

  function plantUpZ(st) {
    const x = st[8];
    const y = st[9];
    const u = 1 - 2 * (x * x + y * y);
    if (u > 1) {
      return 1;
    }
    return u < -1 ? -1 : u;
  }

  function plantRateMag(st) {
    return Math.sqrt(st[11] * st[11] + st[12] * st[12] + st[13] * st[13]);
  }

  function turtleKeysHeld() {
    return input.keys.has('ArrowUp')
      || input.keys.has('ArrowDown')
      || input.keys.has('ArrowLeft')
      || input.keys.has('ArrowRight');
  }

  function turtleStickHeld(roll, pitch) {
    if (turtleKeysHeld()) {
      return true;
    }
    if (input.isTouchPrimary() && (roll > 0.08 || roll < -0.08 || pitch > 0.08 || pitch < -0.08)) {
      return true;
    }
    return (roll * roll + pitch * pitch) >= TURTLE_STICK_MIN * TURTLE_STICK_MIN;
  }

  function dumpTurtleIterm() {
    sim.e.sim_set_crashflip(1);
    sim.e.sim_set_crashflip(0);
  }

  function turtleSupportY(wx, wy, wz) {
    /* Terrain when the hull is on it or within the clearance halo, so a
     * halo entry seats on the grass instead of freezing on a sliver of
     * air. An obstacle rest (car roof, kerb-height box, deck the height
     * query cannot see) keeps its own height: the street below is not
     * its support, and seating a low-obstacle turtle on the terrain
     * would bury the hull inside the collider it rests on. */
    const hy = view.height(wx, wz, wy - SURFACE_BIAS);
    if (lastGroundHits > 0 || (!turtleOnSupport && wy - hy < turtleClearance())) {
      return hy;
    }
    return wy - REST_HEIGHT;
  }

  function setCrashflip(on) {
    if (on) {
      beginTurtleWait();
      return;
    }
    turtleWait = false;
    turtleFlip.active = false;
    turtleResumeGate = false;
    if (crashflipOn) {
      const ch = input.channels;
      turtleRecover = turtleStickHeld(ch.roll, ch.pitch);
    }
    crashflipOn = false;
    sim.e.sim_set_crashflip(0);
  }

  function setTurtleParkMotors(on) {
    const next = Boolean(on);
    if (next === turtleParkMotors) {
      return;
    }
    turtleParkMotors = next;
    sim.motorOverride(-1, next ? 0 : -1);
  }

  const turtleRcOut = [0, 0];
  function turtleAxes(roll, pitch) {
    /* Keyboard analogMag ramps. A held arrow while waiting is a poke,
     * same as a radio stick at the stop. Touch gets the same once the
     * pad has moved, so a timid thumb still turtles. */
    if (turtleWait || turtleFlip.active) {
      if (input.keys.has('ArrowRight')) {
        roll = 1;
      } else if (input.keys.has('ArrowLeft')) {
        roll = -1;
      } else if (input.isTouchPrimary() && roll > 0.08) {
        roll = 1;
      } else if (input.isTouchPrimary() && roll < -0.08) {
        roll = -1;
      }
      if (input.keys.has('ArrowDown')) {
        pitch = 1;
      } else if (input.keys.has('ArrowUp')) {
        pitch = -1;
      } else if (input.isTouchPrimary() && pitch > 0.08) {
        pitch = 1;
      } else if (input.isTouchPrimary() && pitch < -0.08) {
        pitch = -1;
      }
    }
    turtleRcOut[0] = roll;
    turtleRcOut[1] = pitch;
    return turtleRcOut;
  }

  function turtleHoldStick(roll, pitch) {
    if (!turtleRecover) {
      return false;
    }
    if (!turtleStickHeld(roll, pitch)) {
      turtleRecover = false;
      return false;
    }
    return true;
  }

  function applyTurtleRc(roll, pitch) {
    const ax = turtleAxes(roll, pitch);
    if (turtleHoldStick(ax[0], ax[1])) {
      turtleRcOut[0] = 0;
      turtleRcOut[1] = 0;
    }
    return turtleRcOut;
  }

  /*
   * REAL CRASHFLIP, HELD, at any attitude.
   *
   * Betaflight's flip-over-after-crash is compiled in and the ABI has
   * driven it since the plant learned about the ground, but the pilot has
   * never been able to reach it: setCrashflip(true) starts the SCRIPTED
   * turtle instead, and that only latches from a genuine inverted rest
   * (shouldEnterTurtle wants upz past -0.35, under 1 m/s and under
   * TURTLE_RATE). Wedged on its side, or winding itself up against a
   * wall, the craft satisfies none of those, so the one escape the pilot
   * had was closed exactly where it was needed. That is the second half
   * of the owner's "i can't turtle out nor can i right it".
   *
   * So this is the real thing, on a held key: the mixer path from
   * mixer.c, driven by the pitch and roll sticks, spinning the high
   * motors to walk the machine out of wherever it is. It is not a
   * scripted animation and it does not choose an attitude for you; it is
   * the same control a pilot has on a real quad, and like the real one it
   * does nothing useful in the air.
   *
   * The scripted turtle keeps the ground it already holds: while a wait
   * or a flip is running it owns crashflipOn, and this stays out.
   */
  function setManualFlip(on) {
    if (on === manualFlip) {
      return;
    }
    if (on) {
      if (turtleWait || turtleFlip.active || landed || launchStaging || poseLock || crashed) {
        return;
      }
      manualFlip = true;
      /* I-term is dumped on both edges for the reason the scripted path
       * dumps it: a PID wound up against a wall yanks the craft the
       * moment the mixer hands control back. */
      dumpTurtleIterm();
      sim.e.sim_set_crashflip(1);
      return;
    }
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    dumpTurtleIterm();
  }

  /* Polled rather than edge-triggered so the key behaves as a hold, and so
   * that letting go during a pause or a menu cannot leave the mixer
   * latched. */
  function pollManualFlip() {
    const want = mode === 'flight'
      && ui.screen === 'flight'
      && !turtleWait
      && !turtleFlip.active
      && !landed
      && !launchStaging
      && !poseLock
      && !crashed
      && input.keys.has('KeyT');
    setManualFlip(want);
  }

  function turtleStickMag() {
    const smp = rcPending.length ? rcPending[rcPending.length - 1] : null;
    const roll = smp ? smp.roll : input.channels.roll;
    const pitch = smp ? smp.pitch : input.channels.pitch;
    const ax = turtleAxes(roll, pitch);
    return Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1]);
  }

  /*
   * WHAT A HIT IS NOW, instead of a line of text.
   *
   * The banners are gone on the owner's instruction: "remove all the words
   * on screen that tell me i've hit something, the sound should be enough
   * as well as the feeling of impact." That puts the whole message on the
   * sound and the camera, so both have to carry it, and neither did.
   *
   * The sound was a two-way switch, 'crash' over 18 m/s and 'clip' under
   * it, with everything below 4 m/s silent. As the only channel left that
   * is a poor instrument: a gate brush and a wall at speed picked one of
   * two samples. It is continuous now, from the same number the physics
   * used, so a hard hit sounds hard.
   *
   * The camera did nothing at all. There was no impact kick anywhere in
   * the shell: makeLensShake reads rotor speed and nothing else. A real
   * hit throws the whole airframe, and the FPV camera is bolted to it, so
   * the picture moves. That is `impactKick`, decayed per frame and added
   * to the lens shake where it already lands on the camera.
   *
   * And the blades: a spinning 5 inch that meets a wall does not carry
   * its rotor speed through the contact. sim_prop_strike takes it out, so
   * a wall tap costs a beat of thrust and the pilot feels the sag while
   * the motors spin back up. That is a physics consequence rather than an
   * effect, which is why it is here and not in the renderer.
   *
   * `scale` is metres per second: for an obstacle it is the impulse the
   * solver actually applied, for the ground it is the arrival speed.
   */
  const IMPACT_FULL = 12.0;     /* m/s of impulse that reads as a full hit */
  const IMPACT_KICK_RAD = 0.075;
  const IMPACT_DECAY_HZ = 9;
  const IMPACT_PROP_MAX = 0.28; /* most of the rotor speed a hit can take */
  const impactKick = { x: 0, y: 0, z: 0 };
  let impactSeed = 0;

  function feelImpact(scale, kind) {
    if (!(scale > 0)) {
      return;
    }
    const nowHit = performance.now();
    /*
     * Just respawned, or just recovered: whatever the hull is overlapping is
     * left over from being put there, whether it is the grass, a stand, a
     * pole or a wing it was seated inside. Nothing sounds.
     *
     * The spawn half is gated on `landed`, matching the one the clip watch
     * already uses, because leftover overlap is a property of SITTING in
     * something. Ungated it swallowed half a second of genuine impacts on
     * every restart, which on a short course is a real gate hit gone quiet.
     * The departure itself is covered below, by kind and on a clock.
     */
    if ((nowHit < clipGraceUntil && landed) || nowHit < recoverGraceUntil) {
      return;
    }
    /*
     * On a stand the ground plane is switched off and the module holds the
     * pose, so any impulse at all is the constraint and not a contact.
     */
    if (launchStaging) {
      return;
    }
    /*
     * LEAVING THE GROUND IS STILL GROUND CONTACT, and only ground contact.
     * The plant is touching the pad for tens of milliseconds after the
     * perch lifts and the departure closes faster than GRAZE_SPEED_MAX on
     * those frames: that is a takeoff, not a crash. The window is on the
     * wall clock as well as on the flag because the flag is cleared in the
     * same frame as the branch that calls this, thirty lines earlier.
     *
     * A GATE IS NOT EXEMPT. 8ebd6b8 muted every kind here, so a pilot who
     * punched off the line and put a wing through the first gate heard
     * nothing. The pad is a height field deck, not a collider: the bang
     * this mutes has always been kind 'ground', so that is all it mutes.
     */
    if (kind === 'ground' && (takingOff || nowHit < takeoffUntil)) {
      return;
    }
    let u = scale / IMPACT_FULL;
    if (u > 1) {
      u = 1;
    }
    /*
     * THE SOUND OF THE HIT: what it hit and how hard. A light touch is the
     * graze cue, a race's penalty; a real hit is the engine's impact, at
     * the surface's own hardness (sim_material_info: concrete 1, grass
     * 0.05) and the momentum the hit took, the craft's mass times the
     * closing speed. The ground's material is the one the plant was handed
     * for this spot; an obstacle's is its kind's (crashworld.js
     * kindMaterial).
     */
    const material = kind === 'ground' ? groundMaterialNow : kindMaterial(kind);
    const hardness = materialHardness[material] ?? 0.5;
    if (u > 0.45) {
      audio.impact((airframeById(runAirframe).grams / 1000) * scale, hardness, scale);
    } else {
      audio.event('clip', null, u);
    }
    /* A kick about all three camera axes. The sign walks so two hits in a
     * row do not throw the picture the same way; it is a render effect and
     * touches nothing the plant reads. */
    impactSeed = (impactSeed + 1) & 3;
    const s0 = (impactSeed & 1) ? 1 : -1;
    const s1 = (impactSeed & 2) ? 1 : -1;
    const a = IMPACT_KICK_RAD * u;
    impactKick.x += a * s0;
    impactKick.y += a * 0.7 * s1;
    impactKick.z += a * 0.8 * s0 * s1;
    /* Blades only: the ground already has its own contact model and a
     * belly landing does not spin the props down. */
    if (kind !== 'ground' && typeof sim.e.sim_prop_strike === 'function') {
      sim.e.sim_prop_strike(IMPACT_PROP_MAX * u);
      audio.propStrike(u, hardness);
      stateCurr = readState();
    }
    if (u > 0.25) {
      padRumble(u);
    }
  }

  /* Gamepad haptics, where the browser has them. Guarded to the point of
   * paranoia: vibrationActuator is not in every engine, the shapes differ,
   * and a rejected promise here would take the frame loop with it. */
  function padRumble(u) {
    try {
      const pad = input.firstGamepad();
      const act = pad && pad.vibrationActuator;
      if (!act || typeof act.playEffect !== 'function') {
        return;
      }
      const p = act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.round(60 + 140 * u),
        weakMagnitude: Math.min(1, 0.3 + 0.7 * u),
        strongMagnitude: Math.min(1, u),
      });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (err) {
      void err;
    }
  }

  function decayImpactKick(dtMs) {
    const k = Math.exp(-(dtMs > 0 ? dtMs : 0) / 1000 * 2 * Math.PI * IMPACT_DECAY_HZ);
    impactKick.x *= k;
    impactKick.y *= k;
    impactKick.z *= k;
  }

  function turtleInContact() {
    return lastGroundHits > 0 || turtleOnSupport;
  }

  function turtleCueSource() {
    if (input.isTouchPrimary()) {
      return 'touch';
    }
    /* Every key works in mouse flight, and the keys' cue names them. */
    if (input.isMousePrimary()) {
      return 'keys';
    }
    if (input.isKeyboardPrimary()) {
      return 'keys';
    }
    if (input.firstGamepad()) {
      return 'radio';
    }
    return 'keys';
  }

  function turtleBannerText() {
    if (turtleFlip.active) {
      return 'TURTLE MODE';
    }
    if (turtleRecover && !turtleWait && !turtleFlip.active) {
      const src = turtleCueSource();
      if (src === 'touch') {
        return str('main.let_go_of_the_right_pad');
      }
      if (src === 'radio') {
        return str('main.centre_the_right_stick_then_fly');
      }
      return str('main.let_go_of_the_arrows_then');
    }
    const src = turtleCueSource();
    if (src === 'touch') {
      return str('main.turtle_mode_right_pad_pitch_or');
    }
    if (src === 'radio') {
      return str('main.turtle_mode_right_stick_pitch_or');
    }
    return str('main.turtle_mode_arrow_keys_pitch_or');
  }

  function pollTurtleSupport() {
    if (!stateCurr || launchStaging) {
      turtleOnSupport = false;
      return;
    }
    poseFromState(stateCurr, pProbe);
    lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    turtleOnSupport = lastGroundHits > 0;
    if (turtleOnSupport || !view.colliders || plantUpZ(stateCurr) >= TURTLE_INVERT_UPZ) {
      return;
    }
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
    qCollide.premultiply(qSpawn);
    const k = view.colliders.hit(
      pProbe.x, pProbe.y, pProbe.z,
      pProbe.x, pProbe.y, pProbe.z,
      vHalfFrame,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
      craftVerticalOffset(),
    );
    if (k >= 0 && view.colliders.hitNy > 0.5) {
      turtleOnSupport = true;
    }
  }

  function isTurtleParked() {
    return turtleWait || turtleFlip.active;
  }

  function noteTurtleState(st) {
    lastUpz = plantUpZ(st);
    const uClamp = lastUpz > 1 ? 1 : lastUpz < -1 ? -1 : lastUpz;
    lastTiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
    speedNow = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    return st;
  }

  function plantSpeed(st) {
    return Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
  }

  function applyTurtleFlipPose(u) {
    const e = turtleFlipEase(u);
    turtleSlerpQuat(
      turtleFlip.qw0, turtleFlip.qx0, turtleFlip.qy0, turtleFlip.qz0,
      turtleFlip.qw1, turtleFlip.qx1, turtleFlip.qy1, turtleFlip.qz1,
      e, turtleQ,
    );
    const lift = turtleFlipLift(u);
    worldPosToSim(
      turtleFlip.wx,
      turtleFlip.surfaceY + REST_HEIGHT + lift,
      turtleFlip.wz,
      pSim,
    );
    const code = sim.e.sim_set_pose(
      pSim.x, pSim.y, pSim.z,
      turtleQ[0], turtleQ[1], turtleQ[2], turtleQ[3],
    );
    if (code !== SIM_OK) {
      throw new Error(`sim_set_pose: ${simErrorName(code)}`);
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    return noteTurtleState(stateCurr);
  }

  function beginTurtleFlip() {
    if (!stateCurr || turtleFlip.active) {
      return;
    }
    const st = stateCurr;
    const q1 = uprightPlantQuat(st[7], st[8], st[9], st[10]);
    poseFromState(st, pProbe);
    turtleWait = false;
    turtleFlip.active = true;
    turtleFlip.simMs0 = simTimeMs;
    turtleFlip.qw0 = st[7];
    turtleFlip.qx0 = st[8];
    turtleFlip.qy0 = st[9];
    turtleFlip.qz0 = st[10];
    turtleFlip.qw1 = q1[0];
    turtleFlip.qx1 = q1[1];
    turtleFlip.qy1 = q1[2];
    turtleFlip.qz1 = q1[3];
    turtleFlip.wx = pProbe.x;
    turtleFlip.wz = pProbe.z;
    turtleFlip.surfaceY = turtleSupportY(pProbe.x, pProbe.y, pProbe.z);
    crashflipOn = true;
    turtleRecover = false;
    takingOff = false;
    landed = false;
    dumpTurtleIterm();
    setTurtleParkMotors(true);
    applyTurtleFlipPose(0);
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event('clip');
    }
  }

  function finishTurtleFlip() {
    applyTurtleFlipPose(1);
    turtleWait = false;
    turtleFlip.active = false;
    crashflipOn = false;
    dumpTurtleIterm();
    const ch = input.channels;
    turtleRecover = turtleStickHeld(ch.roll, ch.pitch) || turtleResumeGate;
    turtleResumeGate = false;
    landed = true;
    takingOff = false;
    startPitch = 0;
    groundY = turtleFlip.surfaceY;
    lastClearance = REST_HEIGHT;
    setTurtleParkMotors(true);
    adoptSimClock();
    acc = 0;
    noteTurtleState(stateCurr);
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event('land');
    }
  }

  function beginTurtleWait(hold) {
    if (!stateCurr || poseLock || turtleWait || turtleFlip.active) {
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
    takingOff = false;
    landed = false;
    flownThisRun = true;
    introMs = -1;
    parkedLift = PARKED_LIFT;
    turtleResumeGate = false;
    dumpTurtleIterm();
    rcPending.length = 0;
    poseFromState(stateCurr, pProbe);
    const hy = turtleSupportY(pProbe.x, pProbe.y, pProbe.z);
    worldPosToSim(pProbe.x, hy + REST_HEIGHT, pProbe.z, pSim);
    {
      const st = stateCurr;
      const code = sim.e.sim_set_pose(
        pSim.x, pSim.y, pSim.z, st[7], st[8], st[9], st[10],
      );
      if (code !== SIM_OK) {
        throw new Error(`sim_set_pose: ${simErrorName(code)}`);
      }
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    noteTurtleState(stateCurr);
    setTurtleParkMotors(true);
    /* A crash with the stick already over the poke gate flips immediately.
     * The capture hook passes hold so it can photograph the wait. */
    if (!hold && turtleStickMag() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
  }

  function tryEnterTurtle(st, inContact) {
    if (!st || turtleWait || turtleFlip.active || poseLock) {
      return;
    }
    /* An aircraft that comes home under a parachute lands on its back on
     * purpose, and a flying wing cannot turtle itself over: it lies there
     * until L launches it again or R puts it back on the rail. */
    if (airframeById(runAirframe).chute) {
      return;
    }
    if (launchStaging) {
      if (plantUpZ(st) >= TURTLE_INVERT_UPZ) {
        return;
      }
      endLaunchStaging(false);
    }
    if (shouldEnterTurtle(
      plantUpZ(st),
      plantSpeed(st),
      plantRateMag(st),
      inContact,
      lastClearance,
      false,
    )) {
      beginTurtleWait();
    }
  }

  function stepTurtleFrozen(dt) {
    acc += dt;
    let steps = Math.floor(acc / MS_PER_STEP);
    acc -= steps * MS_PER_STEP;
    simTimeMs += steps * MS_PER_STEP;
    /* Upside down waiting to be turtled over is time passing, and the
     * recogniser has to agree with the sim clock about how much. See
     * TrickDetector.idle. */
    trickDetector.idle(steps * MS_PER_STEP);
    adoptSimClock();
    if (turtleResumeGate) {
      /* Touch overlay is hidden on pause, so poll falls through to
       * keyboard zeros for the first flight frame after Resume. That is
       * not a recentre. isTouchPrimary already requires the overlay, so
       * wait on the overlay itself. */
      const waitingForTouch = Boolean(touch)
        && typeof touch.active === 'function'
        && !input.firstGamepad()
        && !touch.active();
      if (!waitingForTouch && turtleStickMag() < TURTLE_STICK_MIN) {
        turtleResumeGate = false;
      }
    }
    if (!turtleResumeGate && turtleWait && turtleStickMag() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
    if (turtleFlip.active) {
      const u = (simTimeMs - turtleFlip.simMs0) / TURTLE_FLIP_MS;
      if (u >= 1) {
        finishTurtleFlip();
      } else {
        applyTurtleFlipPose(u < 0 ? 0 : u);
      }
    } else if (turtleWait) {
      /* Frozen on whatever we sat on, grass or a car roof. Lost-contact
       * abort used terrain height and dropped object turtles after 80 ms.
       * A moving train is out of scope: they stay until they poke. */
      sim.rest();
      stateCurr = readState();
      statePrev = stateCurr;
      noteTurtleState(stateCurr);
      poseFromState(stateCurr, pProbe);
      lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    }
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
      const motors = motorsBlock(af.id, choice);
      const code = motors ? sim.setMotors(motors) : SIM_OK;
      if (code !== SIM_OK) {
        throw new Error(`sim_set_motors refused ${choice.option} on ${af.id}: ${simErrorName(code)}`);
      }
      const propPack = propPackBlock(af.id, choice);
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
    const block = parts.prop === 'stock' ? own : partsPowerBlock(af.id, option, parts.prop, own ?? powerBlock(af.id, option, pack));
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
  /* Defend Itaipu's attackers (src/render/attackers.js), bursting through
   * the crash debris; into the map's scene from roomWarFrame. */
  const warAttackers = createAttackers({ debris, floorAt: (x, z) => groundAt(x, z) });
  shell.keepAcrossMaps(warAttackers.group);
  const warBooms = createExplosions();
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
   * same solids the sweep lets through (src/maps/alps/roofs.js cover),
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
   * through the plant's ground plane (src/maps/alps/roofs.js), but a free
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
      score.crash();
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
    fpvFail.update(nowWall, runDamage && fpvLensLive && !camOverride && !warIntro);
  }

  function crashSummary() {
    const names = Object.keys(DAMAGE_FLAGS).filter((k) => (crashFlags & DAMAGE_FLAGS[k]) !== 0);
    return {
      available: damage.available,
      mode: damage.mode(),
      runDamage,
      flags: crashFlags,
      flagNames: names,
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
   * Put the craft back at the start line. Hits no longer teleport the
   * craft: R is the pilot asking for a restart, not a recovery from a
   * lockout. `at` reseats the spawn when the map itself moved.
   */
  /* `keepSticks` is for a swap in flight (seatSwap): the pilot is flying
   * the new aircraft on the sticks they were holding, so a keyboard's or a
   * thumb's held throttle is not dropped to zero under it. */
  function resetCraft(at, keepSticks = false) {
    if (at) {
      startX = at.x;
      startZ = at.z;
      startYaw = at.yaw;
      startPitch = 0;
      startY = at.y != null
        ? view.height(startX, startZ, at.y)
        : groundAt(startX, startZ);
      qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
      qSpawnInv.copy(qSpawn).invert();
    }
    /* A war's warhead arrived or changed since the payload was seated (the
     * room's loadout echo, combatSeated): seat it now, between runs, before
     * the reset puts the moved CG at rest. */
    if (airframeById(runAirframe).combat && JSON.stringify(combatSeated(runAirframe)) !== combatSeatKey) {
      applyCombat(airframeById(runAirframe));
    }
    sim.reset();
    plantStarts += 1;
    /* A war began or ended, or a room was joined or left, since the last
     * run: its damage mode now, between runs, since setting it clears the
     * crash state. */
    if (warCrashDue || (damage.available && crashDamageWanted(ui.settings) !== runDamage)) {
      warCrashDue = false;
      applyCrashMode(ui.settings);
    }
    sim.setCellVoltage(runVoltage);
    declareWater();
    crashReset();
    /*
     * THE LAP CLOCK IS NOT TOUCHED, and the two clocks being separate
     * variables is what makes that possible. simStepIdx mirrors the module's
     * own step_index, which sim_reset has just put back to zero, so it MUST
     * follow or every queued stick sample lands in the integrator's future.
     * simTimeMs is the LAP clock and belongs to the race, which is still
     * running: zeroing it here is what used to hand a crashed pilot their
     * lap time back. adoptSimClock reads that zero from the module rather
     * than assuming it, so a future reset that keeps a warmup offset cannot
     * silently desync the RC grid again.
     */
    acc = 0;
    rcPending.length = 0;
    adoptSimClock();
    crashed = false;
    clipCrashUntil = 0;
    clipCrashKind = '';
    clipGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    resetClipWatch(clipWatch);
    setCrashflip(false);
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
    airHoldMs = 0;
    airGoUntil = 0;
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
    /* Back on the ground, landed, exactly as at boot. */
    landed = true;
    takingOff = false;
    launchStaging = false;
    input.forcePadRest = false;
    lcPrevState = 0;
    lcGoUntil = 0;
    lcBoost = false;
    lcAcroUntil = 0;
    if (lcArmed && ui.settings.launchControl) {
      applyLaunchSwitch(true);
    }
    /* Parked again, so the takeoff hint is due again. Render only. */
    flownThisRun = false;
    /* startY is that same query, taken a few lines up by adoptSpawn or by
     * the `at` branch. Asking the terrain twice for one point is how the
     * two drift if one of them ever grows an offset. */
    groundY = startY;
    /* Clear the judgement that produced the last crash. Leaving it behind is
     * how __craftState reports a 2.8 m/s arrival on a craft sitting calmly on
     * the start line, which reads as a landing gate that does not work. */
    lastDescent = 0;
    lastTiltDeg = 0;
    lastClosing = 0;
    lastUpDot = 0;
    lastHitKind = 'none';
    lastHitIndex = -1;
    groundCueAtWall = -1e9;
    takeoffUntil = 0;
    input.drain();
    if (!keepSticks) {
      input.keys.clear();
      input.resetKeyboardSticks();
      /* A spawn: a pad whose throttle rests at half has to show it low
       * before anything leaves the ground. See input.holdThrottleLow. A
       * swap in the air keeps its sticks and is never held. */
      input.holdThrottleLow(TAKEOFF_RELEASE);
    }
    raceHasPrev = false;
    releasePress();
    bounceCount = 0;
    bounceAtWall = 0;
    groundBounceAtWall = 0;
    bounceHitIndex = -1;
    bounceHitKind = '';
    /* The race interpolates a gate crossing between its own previous sim
     * time and this one. A respawn teleports the craft, so the segment
     * either side of it is not a flight path: leaving prevSimMs behind put
     * a crossing time somewhere in the gap. Nulling it makes the first
     * update after a recovery use simMs exactly. */
    race.prevSimMs = null;
    /* The ghost recorder must not interpolate across the same teleport: a
     * recovery mid-lap is a cut in the recording, held on the near side so
     * the replay's cut detector sees one impossible segment, not a glide.
     * The seed pose is stale for the same reason. */
    if (at) {
      ghostRecorder.cutHere();
    }
    ghostPrev.valid = false;
    groundHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }

  /*
   * Clip-through and thrash catch. Freeze on the glitch pose so the banner
   * can say Crashed, then re-seat the craft in place: see finishClipCrash.
   */
  function beginClipCrash(kind, nowWall) {
    if (crashed) {
      return;
    }
    crashed = true;
    /* A bail, in the Tony Hawk sense: the open combo is lost rather than
     * banked, and the workbook's streak multiplier goes back to one. The
     * detector's buffer goes too, or a half roll from before the crash
     * would pair with a half roll after it into a trick nobody flew.
     * Guarded on the mode like the two ground paths, so a race map never
     * touches the scorer at all rather than relying on there being nothing
     * for it to touch. */
    if (view.mode === 'freestyle') {
      trickDetector.reset();
      score.crash();
    }
    clipCrashKind = kind;
    clipCrashUntil = nowWall + CLIP_CRASH_HOLD_MS;
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    acc = 0;
    race.recover('Crashed', nowWall);
    /* One of the two places this shell declares a crash. The other is the
     * hard ground hit at the bounce ceiling in the ground path, which is
     * the one a pilot actually flies into; this one is the glitch catch. */
    flightStats.noteCrash();
    if (crashCam) {
      crashCam.noteCrash('clip');
    }
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* The same departure window feelImpact reads. This cue is the loudest
     * thing in the mix, it plays at full level with no scale, and it sat
     * outside the one guard the launch had. A glitch crash six frames off a
     * launch stand is a leftover overlap, not a crash. */
    if (typeof audio.event === 'function' && nowWall >= takeoffUntil) {
      audio.event('crash');
    }
  }

  /*
   * A PLANT STATE THAT IS NOT A STATE. A step that hands back a number that
   * is not finite, or a spin past the plant's own ceiling (SIM_RATE_MAX in
   * src/native/sim_internal.h, which no rigid body here reaches), is a bug
   * in the plant, and everything downstream of it believes it: the trick
   * detector took an F-16's runaway tumble (crash.c, point_spin) for a run
   * of rolls it went on naming one at a time, 261,823 of them when the
   * page was paused on the next throw, which it never answered. So the
   * state is judged at the boundary, after every step and before anything
   * reads it. A bad one is counted (window.__crash().plantFaults), said on
   * the console, and the craft is wrecked where it last was sound: the
   * plant reset, which is the only thing that clears a non-finite value
   * out of its parts and pieces, put back at that pose at rest, and handed
   * to the clip crash's hold and recovery in place. The run is left alone,
   * as for any other glitch.
   */
  const PLANT_RATE_MAX = 1.0e4;
  let plantFaults = 0;

  function plantStateSound(st) {
    for (let k = 0; k < st.length; k += 1) {
      if (!Number.isFinite(st[k])) {
        return false;
      }
    }
    return st[11] * st[11] + st[12] * st[12] + st[13] * st[13] <= PLANT_RATE_MAX * PLANT_RATE_MAX;
  }

  function plantFault(bad, sound, nowWall) {
    plantFaults += 1;
    /* Position, velocity, attitude and rates, plant frame, as they came back. */
    const got = Array.from(bad.subarray(1, 14)).join(' ');
    console.error(`plant fault ${plantFaults} after t ${sound[0]} s, wrecked where it last was sound: ${got}`);
    resetCraft(null);
    const code = sim.e.sim_set_pose(sound[1], sound[2], sound[3], sound[7], sound[8], sound[9], sound[10]);
    if (code !== SIM_OK) {
      throw new Error(`sim_set_pose after a plant fault: ${simErrorName(code)}`);
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    landed = false;
    flownThisRun = true;
    beginClipCrash('plant', nowWall);
  }

  /*
   * RECOVER IN PLACE, rather than back on the start line.
   *
   * This used to call reset(), which is what R does: adoptSpawn() back to
   * the map's own spawn and race.reset(), which empties `log`, `laps` and
   * the lap clock. So a mesh glitch, which is OUR bug and not a thing the
   * pilot did, cost them every completed lap of the run. The owner's
   * instruction is the other way round: "the system should register this
   * state and just reset the quad in place."
   *
   * So: pick the nearest clear air to where the accident happened, put the
   * craft there upright on its own heading, and leave the run alone. The
   * lap being flown keeps running, which is the right price. Nothing about
   * the race is touched, so `next`, the splits and the clock all carry on.
   *
   * Finding clear air is the whole of the work. Reseating inside the wall
   * the craft was stuck in would trip the same detector on the next frame
   * and put the pilot in a loop, which is worse than the glitch. Rise
   * first, because up is where a quad came from and where it wants to go,
   * and only then try the compass. A point is clear when the collider
   * sweep says so at a level attitude and it is above the terrain.
   */
  const RECOVER_RISE = [0.6, 1.2, 2.0, 3.0, 4.5];
  const RECOVER_OUT = [0, 1.0, 2.0, 3.5];
  const RECOVER_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

  function recoverSpotClear(x, y, z) {
    const surf = view.height(x, z, y - SURFACE_BIAS);
    if (!(y - surf > REST_HEIGHT)) {
      return false;
    }
    if (!view.colliders) {
      return true;
    }
    return view.colliders.hit(
      x, y, z, x, y, z,
      craftVerticalHalf(0),
      0, 0, 0, 1,
      craftVerticalOffset(),
    ) < 0;
  }

  function findRecoverSpot(x, y, z, out) {
    for (let ri = 0; ri < RECOVER_OUT.length; ri += 1) {
      const out_r = RECOVER_OUT[ri];
      for (let li = 0; li < RECOVER_RISE.length; li += 1) {
        const lift = RECOVER_RISE[li];
        if (out_r === 0) {
          if (recoverSpotClear(x, y + lift, z)) {
            out.set(x, y + lift, z);
            return true;
          }
          continue;
        }
        for (let di = 0; di < RECOVER_DIR.length; di += 1) {
          const px = x + RECOVER_DIR[di][0] * out_r;
          const pz = z + RECOVER_DIR[di][1] * out_r;
          if (recoverSpotClear(px, y + lift, pz)) {
            out.set(px, y + lift, pz);
            return true;
          }
        }
      }
    }
    return false;
  }

  function finishClipCrash() {
    clipCrashUntil = 0;
    clipCrashKind = '';
    crashed = false;
    resetClipWatch(clipWatch);
    if (!findRecoverSpot(pCurr.x, pCurr.y, pCurr.z, pProbe)) {
      /* Nowhere within four and a half metres is clear. That is not a
       * glitch any more, it is a craft somewhere it cannot be put back,
       * so fall through to the old behaviour and give them the line. */
      reset();
      return;
    }
    /* Heading is kept: being spun to face north because a wall grabbed an
     * arm is its own disorientation, and the pilot was flying somewhere. */
    const yaw = craftHeadingYaw();
    const spotY = pProbe.y;
    resetCraft({ x: pProbe.x, z: pProbe.z, y: spotY, yaw });
    /*
     * resetCraft seats the spawn frame on the SURFACE under the point and
     * parks the craft on it, which is right on the start line and wrong
     * here: the clear air we found may be a storey above that surface, and
     * the surface itself may be inside whatever the craft was stuck in.
     * Lift the plant to the point that was actually checked. startY is the
     * surface, SPAWN_ALT is the parked offset the spawn already carries,
     * so the plant owes the difference.
     */
    const lift = (spotY - startY) - SPAWN_ALT;
    if (lift > 0) {
      const code = sim.e.sim_set_pose(0, 0, lift, 1, 0, 0, 0);
      if (code !== SIM_OK) {
        throw new Error(`sim_set_pose: ${simErrorName(code)}`);
      }
      sim.rest();
    }
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    /* Airborne, level, at rest, and the pilot has the sticks. */
    landed = false;
    takingOff = false;
    flownThisRun = true;
    groundY = startY;
    obsHasPrev = false;
    raceHasPrev = false;
    simClockPrevMs = simTimeMs;
    /* The watch has to be allowed to settle before it can fire again. The
     * spot was checked clear, but the terrain query and the collider sweep
     * are not the same test, and a recovery that instantly re-triggers is
     * a loop the pilot cannot leave, which is worse than the glitch. */
    recoverGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    if (typeof audio.event === 'function') {
      audio.event('takeoff');
    }
  }

  /* The craft's heading, flattened onto the ground plane, as a spawn yaw.
   * Taken off the rendered attitude so it is the direction the pilot was
   * looking, not a plant axis. */
  function craftHeadingYaw() {
    if (!stateCurr) {
      return startYaw;
    }
    upAxis.set(0, 0, -1).applyQuaternion(qPrev);
    if (Math.abs(upAxis.x) < 1e-6 && Math.abs(upAxis.z) < 1e-6) {
      return startYaw;
    }
    return Math.atan2(-upAxis.x, -upAxis.z);
  }

  /* The first fault the frame loop threw, or null. See the frame boundary
   * for what it is for; it lives here so that reset(), which clears it, is
   * not reaching forward into a dead zone. */
  let frameFault = null;

  function reset() {
    /* A reset is the pilot taking the offer the fault banner made, so the
     * next fault is a new one and deserves to be reported in its turn. See
     * the frame boundary. */
    frameFault = null;
    /* The pack charge a run flies on is fixed when the run starts. It is
     * a setting, and settings are reachable from the pause menu, so
     * without this a player could change packs mid run and have the lap
     * compared against another pack's record. */
    runVoltage = ui.settings.packVoltage;
    /* Back to the MAP's own spawn. A crash recovery moves the spawn offset
     * to a point on the course, and a new run must not begin from wherever
     * the last one happened to end. */
    adoptSpawn();
    /*
     * The LAP clock, which resetCraft deliberately leaves alone: a crash
     * recovery keeps the run going, a fresh run does not. Setting it here,
     * before the craft reset, keeps the two clocks in the same order they
     * were written in. Nothing in resetCraft reads it: adoptSimClock and
     * pinRcGrid follow simStepIdx, which mirrors the module.
     */
    simTimeMs = 0;
    /* Anything that holds a stamp ON that clock has to go back with it, or a
     * fresh run compares a zeroed clock against last run's stamp and stays
     * inside a cooldown that has already expired. */
    trickTouchAtSimMs = -1e9;
    /*
     * Everything else a reset does to the CRAFT is resetCraft's job, and it
     * used to be a verbatim copy of it, comments and all, which is the kind
     * of duplication that survives until the two drift and a crash recovery
     * starts clearing something a restart does not. Passing null keeps the
     * spawn adoptSpawn just set.
     */
    resetCraft(null);
    race.reset();
    /* A new run scores from nothing, and the detector's clock goes back to
     * zero with the sim clock above so the two agree about when a trick
     * happened. */
    /*
     * RE-READ EVERY RUN, not once at boot. A pilot switches between a
     * scored run and free flight from the Freestyle screen and then presses
     * fly, and a shape decided at construction would have kept whichever
     * one happened to be stored when the page loaded.
     */
    score.timed = scoredRun();
    score.reset();
    trickDetector.restart();
    ui.resetScore();
    /* A fresh run records from its own first crossing. The session book
     * keeps what earlier runs flew; only the in-flight recording dies. */
    ghostRecorder.abort();
    ghostGap = null;
    ghostChased = null;
    ghostRig.setPresence(0);
    runLaps = ui.settings.laps;
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* Not on the way to the title: that reset parks the craft for a menu. */
    const sp = runSpawn();
    if (sp && sp.air && mode !== 'title') {
      airStart(sp.air.y);
    }
    progressKey = '';
    /* A run starts on the pilot's own picture, whatever the last one left
     * full screen (I). */
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
    ui.progress.tick({ simMs: simTimeMs, crashed, grounded: onSurface(), power, battery: fpvOsd.batt });
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
  async function hotSwap(id, { refit = false } = {}) {
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
      seatSwap(to, next, text);
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

  function seatSwap(to, next, text) {
    /* Where the old one is, read before anything moves it. */
    const st = readState();
    poseFromState(st, swapAt);
    simPosToThree(st[4], st[5], st[6], swapVel).applyQuaternion(qSpawn);
    const yaw = craftHeadingYaw();
    const from = runAirframe;
    const quadBefore = shell.quad;
    const wasFlying = !onSurface();
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
   * Swap the world.
   *
   * `mapReady` is what keeps the frame loop out of a half built world: the
   * loop keeps running through the swap because stopping and restarting it
   * would lose the accumulator, so it has to be told to skip a frame instead.
   * `swapInFlight` is the lock that used to be the same flag: conflating them
   * meant a failed load left mapReady false forever, so the next map pick
   * was refused and the shell froze on a disposed scene.
   * Disposing BEFORE building is deliberate and it is the whole point of the
   * split: the city's render targets and the field's must never both exist,
   * or P5's 120 MB budget is measured against two worlds.
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

  function adoptLoadedView(keepPlace, stayMode, stayScreen) {
    attractCam = makeAttractCamera(view);
    if (!keepPlace) {
      /* A map track's records are its own (seatMapCourse), not the world's. */
      /* A world adopted fresh is the seat's, whatever a swap held before. */
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
    } else {
      /* Same map, new look. Physics and the lap stay where they were; the
       * new gate meshes just need the current next-gate highlight. */
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
    }
    finishLoadingOnFrame = true;
    /* The world just changed, so what is worth flying around changed with
     * it. Once per map, never per run: it scans every collider. */
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

  function worldMatchesSettings() {
    /* A run that has changed aircraft keeps its world: see worldHold. */
    if (worldHold && view && ui.settings.map === worldHold.map
      && normalizeGraphics(ui.settings.graphics) === worldHold.graphics) {
      return true;
    }
    const wantId = worldId();
    const wantQ = normalizeGraphics(ui.settings.graphics);
    return view
      && wantId === view.id
      && wantQ === view.graphics
      && wantedCourseKey(wantId) === loadedCourseKey(view)
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

  async function syncWorldNow() {
    /* Resolved, not raw: worldId turns the Track seat into a world and an id
     * no map has into the seat's (mapById's fallback), so the tail guard
     * below cannot see a mismatch that never clears: dispose, rebuild,
     * re-enter, forever. ?map= is taken verbatim in boot.js, so an unknown
     * id is reachable from a stale bookmark. */
    const wantId = worldId();
    const wantQ = normalizeGraphics(ui.settings.graphics);
    if (swapInFlight) {
      return;
    }
    if (mapReady && worldMatchesSettings()) {
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
    const keepPlace = mapReady && wantId === view.id && wantedCourseKey(wantId) === loadedCourseKey(view);
    /*
     * Which menu the pilot goes back to after the swap, or null for the
     * title. This is a list of PAGE screens, and it has to name every one a
     * settings change can be made from: 'rates' is here because every arrow
     * key on that screen runs applySettings, which lands here whenever the
     * world no longer matches, and without it a rate nudge would bounce the
     * pilot to the title. The 'fc' it replaces named a screen that no
     * longer exists, and would have failed silently: show() on an unknown
     * name displays no node and leaves the previous screen's rows behind.
     * 'friends' because a card seats its own world on the room screen
     * (ui.js, the card's world wins), and a swap to another world, which
     * otherwise ends on the title, ends back there (adoptLoadedView).
     */
    const STAY_SCREENS = ['pilot', 'quad', 'launch', 'rates', 'paused', 'title', 'credits', 'friends'];
    const stayScreen = STAY_SCREENS.includes(ui.screen) ? ui.screen : null;
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
    /* Paint the loading screen BEFORE disposing a world and building another,
     * because both of those block the main thread and a screen nobody
     * composited is not a screen. */
    await yieldToPaint();
    const previous = view.id;
    const previousGraphics = view.graphics;
    if (build) {
      build.exit(false);
    }
    try {
      view.dispose();
    } catch (e) {
      /* Already gone, or the last swap never produced a world. */
    }
    applyPixelRatio(shell, wantQ, renderScaleOf(ui.settings));
    try {
      view = await loadMap(shell, wantId, loading, {
        quality: wantQ,
        renderScale: renderScaleOf(ui.settings),
        ...worldTimeOptions(),
      });
      worldTime = timeOf(worldTimeOptions());
      await seatMapCourse();
      loading.start('frame');
      adoptLoadedView(keepPlace, stayMode, stayScreen);
    } catch (e) {
      /*
       * The old world is already gone by here, deliberately: disposing before
       * building is what keeps two maps' render targets from ever coexisting.
       * Rebuild the map that was just disposed. A message with no world
       * behind it used to leave mapReady false forever.
       */
      console.error(e);
      /* The title's world is not the pilot's seat, so it is never written
       * there. */
      if (!titleWorld) {
        ui.settings.map = previous;
      }
      ui.settings.graphics = previousGraphics;
      try {
        applyPixelRatio(shell, previousGraphics, renderScaleOf(ui.settings));
        view = await loadMap(shell, previous, loading, {
          quality: previousGraphics,
          renderScale: renderScaleOf(ui.settings),
        });
        worldTime = timeOf({});
        loading.start('frame');
        adoptLoadedView(keepPlace, stayMode, stayScreen);
        notice = {
          text: str('main.could_not_be_loaded', { name: entry.name }),
          untilMs: performance.now() + 4200,
        };
      } catch (e2) {
        console.error(e2);
        loading.fail(str('ui.could_not_be_loaded', { name: entry.name, v2: e.message ?? e }));
      }
    } finally {
      swapInFlight = false;
    }
    /* A change requested DURING the swap was refused by the guard at the top,
     * and ui.js has already saved it, so the setting and the loaded map would
     * otherwise stay diverged with the title screen naming a map that is not
     * there. Honour it now. */
    if (mapReady && !worldMatchesSettings()) {
      await syncWorldNow();
    }
  }
  async function swapMap(id) {
    ui.settings.map = id;
    return syncWorld();
  }

  /*
   * ANGLE MODE is a Betaflight flight-mode flag, not a plant change. The
   * module defaults to acro. Keyboard stick input cannot hold a rate, so
   * it always raises ANGLE_MODE; a radio uses the setting. Changing this
   * does not re-init the module and does not reset the craft.
   */
  let angleModeOn = false;
  /* L-switch for launch control. The Settings row only enables the
   * feature; this is the mode switch, captured at the sitting. */
  let lcArmed = false;
  let launchStaging = false;
  let lcBoost = false;
  let lcAcroUntil = 0;
  let lcPrevState = 0;
  let lcGoUntil = 0;

  function wantAngleMode() {
    if (crashflipOn || turtleRecover) {
      return false;
    }
    if (lcAcroUntil === Infinity || (lcAcroUntil > 0 && performance.now() < lcAcroUntil)) {
      return false;
    }
    /* The thumb sticks are a proportional stick, so they are a RADIO here,
     * not a keyboard: they fly whichever mode the setting says. Keys keep
     * forcing angle because a key is a bang-bang input and acro on one is
     * a crash generator. */
    if (input.isTouchPrimary()) {
      return ui.settings.flightMode === 'angle';
    }
    /* The mouse is a proportional stick too, and for the same reason. */
    if (input.isMousePrimary()) {
      return ui.settings.flightMode === 'angle';
    }
    /*
     * THE HARNESS OVERRIDE IS A GIMBAL, NOT A KEY.
     *
     * window.__stick writes a proportional channel straight into the poll
     * ladder, so it can hold a rate the way a radio does and the reason
     * keys force angle does not apply to it. It was landing on the
     * keyboard branch anyway, and ANGLE MODE CANNOT LOOP: the craft is
     * held to about thirty degrees of bank, so every probe that tried to
     * fly a Powerloop swept eighty three degrees of pitch in three seconds
     * of full back stick and flew away in a climb. That is why no check in
     * this repository had ever flown one of these tricks: every "verified"
     * loop was a path drawn by arithmetic and fed to the recogniser
     * directly, because the only thing that could actually FLY was locked
     * out of acro. A pilot on a radio is unaffected either way.
     */
    if (input.harnessChannels) {
      return ui.settings.flightMode === 'angle';
    }
    /*
     * FREESTYLE IS THE TRICK MODE, AND NO TRICK IS POSSIBLE IN ANGLE.
     *
     * Angle holds the craft to about thirty degrees of bank, so a pilot in
     * it cannot fly a Powerloop, a Split-S, a Matty Flip, an Orbit, a roll
     * or a flip: the entire catalogue is out of reach. Forcing it on the
     * keyboard therefore does not make freestyle safer for a key pilot, it
     * makes freestyle pointless for them, and a scoring system nobody on a
     * keyboard can score in is not a scoring system.
     *
     * IT IS NOT GATED ON freestyleScoring AND MUST NOT BE. The scorer was
     * how the case got made, but the case does not rest on it: a pilot who
     * wants to fly a flip in the town wants to fly a flip whether or not
     * anything is naming it, and scoring is off by default, so gating this
     * would lock every keyboard pilot out of every trick unless they first
     * switched on a feature the product tells them is unfinished. That is
     * the opposite trade. Racing keeps the guard.
     *
     * So in freestyle the SETTING decides, on a keyboard as much as on a
     * radio. Racing keeps the guard, where holding a line matters more than
     * inverting and a key is a bang bang input.
     */
    if (view && view.mode === 'freestyle') {
      return ui.settings.flightMode === 'angle';
    }
    return input.isKeyboardPrimary() || ui.settings.flightMode === 'angle';
  }

  function pitchNoseDownDeg(st) {
    const w = st[7];
    const x = st[8];
    const y = st[9];
    const z = st[10];
    const ux = 2 * (x * z - w * y);
    const uy = 2 * (y * z + w * x);
    const uz = 1 - 2 * (x * x + y * y);
    const horiz = Math.sqrt(uy * uy + uz * uz);
    return Math.atan2(-ux, horiz) * (180 / Math.PI);
  }

  function lcState() {
    return typeof sim.launchControlState === 'function'
      ? sim.launchControlState()
      : 0;
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

  /* Seed the plant with the ramp pitch the parked overlay was drawing,
   * then let the module hold a rear-arm hinge every 1 ms step. Without
   * that seed, launching off a 28 degree block dropped the craft onto a
   * level physics pose and walking the stick walked it off the rails. */
  function enableLaunchStand() {
    const st = readState();
    const h = startPitch * 0.5;
    const code = sim.e.sim_set_launch_stand(
      1, st[1], st[2], st[3],
      Math.cos(h), 0, Math.sin(h), 0,
    );
    if (code === SIM_OK) {
      stateCurr = readState();
      statePrev = stateCurr;
    }
  }

  function beginLaunchStaging() {
    if (!(mode === 'flight' && landed)) {
      return;
    }
    if (stateCurr && plantUpZ(stateCurr) < 0) {
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

  function endLaunchStaging(park) {
    launchStaging = false;
    input.forcePadRest = false;
    lcBoost = false;
    disableLaunchStand();
    if (park && mode === 'flight') {
      sim.rest();
      landed = true;
      takingOff = false;
      stateCurr = readState();
      statePrev = stateCurr;
      acc = 0;
    }
  }

  function syncLaunchControl(nowMs) {
    if (!ui.settings.launchControl && lcArmed) {
      applyLaunchSwitch(false);
      if (launchStaging) {
        endLaunchStaging(true);
      }
      lcAcroUntil = 0;
    }
    const st = lcState();
    if (st === 1 || st === 2) {
      lcAcroUntil = Infinity;
      if (landed && mode === 'flight' && !turtleWait && !turtleFlip.active && !turtleRecover) {
        beginLaunchStaging();
      }
    } else if (st === 3) {
      if (lcPrevState === 1 || lcPrevState === 2) {
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

  function syncAngleMode() {
    const want = wantAngleMode();
    if (want !== angleModeOn) {
      angleModeOn = want;
      sim.setAngleMode(want);
    }
    if (ui.setCraftCaption && !(showcase && showcase.failed)) {
      ui.setCraftCaption(want
        ? str('main.angle_sticks_are_tilt_hands_off')
        : str('ui.acro_sticks_are_rates_hands_off'));
    }
  }

  /* The pilot's render scale as a multiplier, 100 percent being native. */
  function renderScaleOf(s) {
    return (Number(s.renderScale) || 100) / 100;
  }

  /*
   * Everything the shell derived from the OLD plant, re-derived. Four things
   * and they have to move together, which is why this is one function rather
   * than four lines at the call site:
   *
   *   the collision dimensions, which src/game/collide.js publishes as live
   *     module bindings so every importer follows without knowing;
   *   the drawn model, which is a different builder entirely for a whoop;
   *   the ground plane the module holds, because a 23 mm thick machine does
   *     not park 45 mm off the deck; and
   *   the record key, because a whoop lap and a five inch lap on the same
   *     track are not the same record.
   *
   * Between runs only. Every collision query in flight reads the dimensions
   * and swapping them mid lap would move the hull under a craft that is
   * already resolving a contact.
   */
  function syncCraftScale() {
    setCraftAirframe(airframeById(runAirframe).dims);
    seatCraftParts();
    runCells = airframeById(runAirframe).cells;
    /* Where this aircraft's centre sits when it is parked, which is where
     * the shell puts the ground plane, the spawn and the landed test. See
     * SPAWN_ALT at the top of this file. */
    seatRestHeight(airframeById(runAirframe), startsAfloat());
    dressCraft();
    swapGhostRig();
    const isWing = Boolean(airframeById(runAirframe).fixedWing);
    /* An airframe with an engine of its own names its voice; a motor is
     * the fixed wings' or the quads'. */
    setFlownVoice(airframeById(runAirframe).voice ?? (isWing ? 'wing' : 'quad'));
    [camMountFwd, camMountUp] = WING_MOUNTS[runAirframe] ?? [CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP];
    /*
     * The ground PLANE needs no raising here: raiseGroundFromState asserts
     * it from the craft's own pose every step it matters, and the shell
     * does not hold one. This paragraph exists because the first version of
     * this function called a raiseGround() that does not exist.
     *
     * Where that plane goes under the craft is another matter, and it is
     * the line above. worldPosToSim puts the surface at sim z minus
     * SPAWN_ALT, so SPAWN_ALT IS how far the plant's origin stands off the
     * floor, and it has to be this aircraft's parked height or the plant
     * rests the craft in the air. That was the bug: "a 23 mm thick machine
     * does not park 45 mm off the deck" was written here, correctly, while
     * both numbers stayed the five inch's.
     */
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
    drawnCraft = want;
    drawnCombat = combat;
  }

  function applySettings(s) {
    /*
     * The pilot's stick mode, first, because everything below it that draws
     * a stick wants to know. input.setStickMode forwards to the thumb
     * sticks; ui.setStickMode redraws the captions and the how-to prose.
     * Both are no-ops when the mode has not moved.
     */
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
    camTilt = clampCameraAngle(s.cameraAngle);
    s.cameraAngle = camTilt;
    qTilt.setFromAxisAngle(AXIS_X, cameraTiltRad(camTilt));
    /* Vertical field of view. The default 100 keeps every measured budget
     * comparable; the setting exists because how roomy a course feels is a
     * pilot preference on real quads too, set by lens choice. */
    if (shell.camera.fov !== s.cameraFov) {
      shell.camera.fov = s.cameraFov;
      shell.camera.updateProjectionMatrix();
    }
    /* Render scale changes are free, no world rebuild: set the ratio and
     * walk the same guarded resize path a window resize takes, so the
     * composer and every prepass target follow in one place. */
    const userScale = renderScaleOf(s);
    const wantPr = pixelRatioFor(s.graphics, userScale);
    const userChanged = !!(view && view.post && view.post.userScale != null
      && view.post.userScale !== userScale);
    if (view && view.post && view.post.userScale != null) {
      view.post.userScale = userScale;
    }
    /* An export surface re-applies the settings' size when it goes. */
    if (!exportShot && (shell.pixelRatio !== wantPr || userChanged)) {
      if (shell.pixelRatio !== wantPr) {
        applyPixelRatio(shell, s.graphics, userScale);
      }
      const d = shell.resize();
      if (view && view.post && mapReady) {
        view.post.setSize(d.w, d.h);
      }
    }
    if (mode === 'title') {
      /* Between runs the choice takes effect at once. During a run it
       * waits for the next one, so the record it is measured against is
       * the pack it was flown on. */
      runVoltage = s.packVoltage;
      sim.setCellVoltage(runVoltage);
      /* Flight style rides the same rule: the record and the physics a
       * run is flown on are decided when it starts, not mid lap. Guarded
       * because an older dist/sim.wasm predates the export. */
      runStyle = s.flightStyle === 'arcade' ? 'arcade' : 'expert';
      if (typeof sim.e.sim_set_flight_style === 'function') {
        sim.e.sim_set_flight_style(runStyle === 'arcade' ? 1 : 0);
      }
      /*
       * THE AIRFRAME, on the same between-runs rule and for a stronger
       * version of the same reason. Pack charge and flight style change what
       * a run measures; the airframe changes the ENTIRE PLANT, the mass, the
       * inertia, the motors, the rotors, the pack and the collision hull, so
       * applying it mid lap would be swapping the aircraft under the pilot.
       *
       * Guarded because an older dist/sim.wasm predates the export, same as
       * the flight style above. On such a build the shell simply flies the
       * five inch, which is what that build has.
       */
      const wantCraft = airframeById(s.airframe).id;
      /* A propulsion chosen on the Loadout tab is a plant of its own, so it
       * changes the plant as an airframe does, on the same rule. */
      const wantSim = seatedSimId(wantCraft);
      if (wantCraft !== runAirframe || wantSim !== runSimId) {
        runAirframe = wantCraft;
        runSimId = wantSim;
        if (typeof sim.e.sim_set_airframe === 'function') {
          sim.e.sim_set_airframe(runSimId);
        }
        /*
         * The plant changed under a module that is already initialised, so
         * everything the shell derived from the OLD plant has to follow: the
         * craft's own dimensions, its collision hull, its model and the
         * ground plane it sits on. syncCraftScale does all four and is
         * called here rather than left to worldMatchesSettings because the
         * craft is session lived and the world is not.
         */
        syncCraftScale();
        /* The plant raised the old airframe's flaps with it. */
        flapNotch = 0;
      }
      /* Crash damage rides the same rule: a run is flown on one set of
       * physics from its start. After the airframe, whose part table it
       * picks. See THE CRASH SHELL. */
      applyCrashMode(s);
      /* The power system too, after the airframe it belongs to: a fresh
       * pack and a full tank every run. The tuning after the power it is
       * balanced on, and the hangar's parts over both. */
      applyPower(s);
      applyTuning(s);
      applyParts(s);
    }
    /*
     * THE AIR, OUTSIDE THE BETWEEN-RUNS BLOCK ON PURPOSE.
     *
     * See the note at runWeight: this is the one physics setting with a
     * control on the flight screen, and it is there so the pilot can feel it
     * arrive. Waiting for the next run would make the slider a promise
     * instead of a knob.
     *
     * What it costs is paid on the lap rather than hidden: a lap the change
     * lands inside was flown on two different aircraft and is voided, which
     * is the same bookkeeping a gate frame strike gets and shows up the same
     * way on the results screen. Between laps, on the start line, or in
     * freestyle, nothing is interrupted.
     *
     * Guarded because an older dist/sim.wasm predates the export, same as
     * the flight style and the airframe. On such a build the slider moves and
     * the plant does not, so the guard also holds the shell's own idea of the
     * run's air at stock: a record must not be filed under an air the module
     * never flew.
     */
    {
      const wantWeight = clampWeight(s.weight);
      /*
       * The scale follows the airframe as well as the slider, because the
       * base lives on the airframe entry; and the test is on the SCALE, not
       * the weight, so the boot time disagreement between the module's 1.0
       * and the shell's normal is seen, and so an airframe swap that moved
       * the base would be too. The airframe itself only changes between
       * runs, above, so this cannot swap the plant under a lap.
       */
      const wantScale = gravityScaleFor(wantWeight, runAirframe);
      if (wantScale !== runGravityScale) {
        if (typeof sim.e.sim_set_gravity === 'function'
          && sim.e.sim_set_gravity(wantScale) === SIM_OK) {
          /*
           * NOT gated on mode, and the first version was. The slider sits
           * below the pause panel, dimmed but uncovered, so it can be dragged
           * while paused; with `mode === 'flight'` in this test a pilot who
           * paused mid lap, dragged it and resumed finished a lap flown under
           * two gravities that was never voided and then filed under the new
           * key. A running lap is a running lap whichever screen is over it.
           * Title and results have no lap, because reset clears one, so the
           * boot time push of a stored value cannot void anything.
           */
          const midLap = race.currentLapMs(simTimeMs) != null;
          runWeight = wantWeight;
          runGravityScale = wantScale;
          if (midLap) {
            race.voidLap(str('main.weight_changed_lap_voided'), performance.now());
          }
        } else {
          ui.settings.weight = runWeight;
          ui.paintAir();
        }
      } else {
        runWeight = wantWeight;
      }
    }
    race.setRecordKey(recordKey());
    paintBest();
    if (!worldMatchesSettings()) {
      syncWorld();
    }
    /*
     * Only a MOVE of the Tune item swaps the tune. Comparing against what
     * is loaded instead would undo a dropped diff the next time the pilot
     * changed the volume, because a dropped file is not a registry tune.
     */
    if (s.tune !== menuTune) {
      menuTune = s.tune;
      configLoadWait = swapTune(s.tune).catch((e) => {
        console.error(e);
      });
    }
    /*
     * Rates are part of the config text, so changing one re-inits the module.
     * Compared as the CLI text the profile emits rather than field by field,
     * so a change to any of the eleven fields, the rates type included, is
     * one string comparison and none of them can be forgotten here.
     *
     * IT DOES NOT RESET THE RUN, and that is the difference between this
     * branch and the tune and PID branches around it. A tune changes the
     * MACHINE and a lap flown half on each is not a lap. Rates change the
     * PILOT: how far their sticks go. The owner asked for the change to be
     * flyable mid run, and the request is right, because tuning stick feel
     * means tuning it against a corner and you cannot do that if every nudge
     * costs the lap. So the module is re-inited and the craft is put back
     * where it stood by reseatAfterConfigSwap, which also says what it
     * cannot carry across.
     *
     * The record key still changes, because recordKey hashes the whole
     * composed config and the rates are in it. A lap flown across a rate
     * change is therefore compared against its own key and not against the
     * old one's best, which is the protection reset() used to provide by
     * throwing the lap away. Keeping the lap and keying it honestly is the
     * better half of that trade.
     */
    const nextRates = ratesDiff(s.rates);
    if (nextRates !== ratesText) {
      /*
       * Composed into a LOCAL first. A refused sim_init is not a no-op down
       * in the module: bridge_parse_config has already reset every
       * parameter group to its default and applied part of the new text, so
       * the craft is flying a half applied config with the PREVIOUS run's
       * filter and PID init products. The other four init sites recover by
       * re-initing the text that worked; this one did not, and it had
       * already overwritten configText with the rejected text, so every one
       * of those recoveries would have restored the bad config too.
       */
      const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, pidsText);
      /* Read BEFORE the init that zeroes it. */
      const before = readState();
      if (sim.init(nextText) === SIM_OK) {
        ratesText = nextRates;
        configText = nextText;
        race.setRecordKey(recordKey());
        paintBest();
        reseatAfterConfigSwap(before);
      } else if (sim.init(configText) === SIM_OK) {
        /* Back to the config that worked, and put the craft back on it. The
         * failed attempt moved the module underneath the craft, and a
         * refused rate change should cost a pilot nothing at all, so this
         * re-seats rather than resetting too. */
        reseatAfterConfigSwap(before);
      }
      publishPids();
    }
    /*
     * The PID adjustment, same contract as rates: part of the config text,
     * so changing it re-inits the module and resets the craft. Compared as
     * the CLI text configs/pids.js emits for the LOADED tune, so a slider
     * moved on the tune that is flying re-inits, and an adjustment stored
     * for a different tune changes nothing until that tune is chosen.
     * While a tune swap is in flight configId is still the old tune, this
     * comparison stays a no-op, and swapTune adopts the new tune's block
     * itself.
     */
    const nextPids = pidsDiffFor(s.pids, configId);
    if (nextPids !== pidsText) {
      /* A local first, same reason as rates above: a refused sim_init has
       * already half-applied the new text, and recovery must restore the
       * text that worked, not the rejected one. */
      const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, nextPids);
      if (sim.init(nextText) === SIM_OK) {
        pidsText = nextPids;
        configText = nextText;
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        race.setRecordKey(recordKey());
        paintBest();
        reset();
      } else if (sim.init(configText) === SIM_OK) {
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        reset();
      }
      publishPids();
    }
    /* The radio, and the recorder. Both are re-read here so a change in
     * Settings lands without a restart. setPreset on the same id is a
     * no-op, and setEnabled only clears the log when it goes from off to
     * on, so neither re-applies anything on an unrelated settings change. */
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
    syncAngleMode();
  }

  /*
   * Load a different tune. Same path a dropped file takes: fetch the diff,
   * hand the text to sim_init, and reset. A failed fetch or a diff the
   * module rejects puts the old tune back rather than leaving the shell
   * flying something nobody chose, and says so.
   */
  async function swapTune(id) {
    const entry = tuneById(id);
    /* Bump first so switching back to the already loaded tune cancels an
     * in-flight fetch of a different one. The old early return before the
     * bump is how "off a tune and back" loaded the other tune anyway. */
    const gen = bumpConfigGen();
    if (entry.id === configId) {
      return;
    }
    let text;
    if (entry.id === 'custom') {
      /* The pilot's saved dump, from storage rather than a fetch. The row
       * only offers it while the dump exists, but a second tab can clear
       * storage under a first, so absence still has to be survivable. */
      text = readFcDump();
      if (text == null) {
        ui.settings.tune = configId;
        notice = { text: str('main.no_saved_flight_controller_edits_to'), untilMs: performance.now() + 3200 };
        return;
      }
    } else {
      try {
        text = new TextDecoder().decode(await fetchBytes(tunePath(entry.id)));
      } catch (e) {
        if (!isLiveConfigLoad(gen)) {
          return;
        }
        ui.settings.tune = configId;
        notice = { text: str('main.could_not_be_loaded', { name: entry.name }), untilMs: performance.now() + 3200 };
        console.error(e);
        return;
      }
    }
    if (!isLiveConfigLoad(gen)) {
      return;
    }
    /* The NEW tune's own PID adjustment, not the old one's: the adjustment
     * is keyed by tune id, and carrying the old block across would fly one
     * tune with another tune's sliders. */
    const nextPids = pidsDiffFor(ui.settings.pids, entry.id);
    const nextText = composeConfig(text, ui.settings.rates, RATES_KEEP, nextPids);
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      ui.settings.tune = configId;
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      notice = { text: str('main.could_not_be_read', { name: entry.name, configFault: configFault(code) }), untilMs: performance.now() + 3600 };
      return;
    }
    configId = entry.id;
    tuneText = text;
    configText = nextText;
    pidsText = nextPids;
    configName = entry.id === 'custom' ? str('main.your_edits') : `${entry.id}.diff`;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    paintBest();
    publishPids();
    notice = { text: str('main.flying', { name: entry.name }), untilMs: performance.now() + 2400 };
    reset();
  }

  async function submitBoardTime() {
    /* The board is flown on the full model only. An arcade lap is real
     * practice but a different aircraft, and a leaderboard where the two
     * mix is not a leaderboard. */
    if (runStyle === 'arcade') {
      notice = {
        text: str('main.arcade_laps_stay_off_the_public'),
        untilMs: performance.now() + 3600,
      };
      return;
    }
    /* And the weight, for the same reason in a different number: the
     * slider scales the weight the craft carries, so a lap flown off 100 is
     * a lap flown on a quad nobody else on the board is flying. */
    if (runWeight !== WEIGHT_STOCK) {
      notice = {
        text: str('main.laps_flown_at_percent_weight_stay', { runWeight }),
        untilMs: performance.now() + 3600,
      };
      return;
    }
    const listing = inspectCourse();
    const trackId = listing && listing.shareId;
    if (!trackId || !listing.canPostTime) {
      notice = { text: listing && listing.layoutDrift
        ? str('main.update_this_track_on_the_board')
        : str('main.this_track_is_not_on_the'), untilMs: performance.now() + 2800 };
      return;
    }
    /* race owns what a record lap is. This used to re-filter and re-min
     * the log beside it, which is the same answer until one of them
     * changes its mind about a voided lap. */
    const fromRun = race.bestLapMs();
    const pending = readPendingTime();
    /* A plane's lap on a map track goes to the plane board, named. */
    const craft = lapCraft();
    const fastest = fromRun != null
      ? fromRun
      : (pending && pending.trackId === trackId && (pending.craft || '') === craft ? pending.lapMs : null);
    if (fastest == null) {
      notice = { text: str('main.no_clean_lap_to_upload'), untilMs: performance.now() + 2800 };
      return;
    }
    let name = readPilotName();
    if (!name) {
      name = await ui.askName({
        title: str('ui.your_name'),
        detail: str('main.a_time_on_the_public_board'),
      });
    }
    if (!name) {
      return;
    }
    /* The lap's own recording rides along when this session holds one, so
     * the time lands on the board with a ghost anyone can chase. A pending
     * time from an earlier visit has no recording, and posts bare, exactly
     * as before ghosts existed. */
    const ghost = ghostForUpload(fastest);
    /*
     * THE LAP GOES UP UNDER WHATEVER ID THE BOARD HOLDS THIS TRACK AT NOW.
     *
     * A seat remembers the id it was written with, and a track taken off the
     * board and put back gets a new one: scripts/boardpresets.js --replace
     * does exactly that, and so does an admin removal. Every browser holding
     * the old seat is then pointing at an id the board has never heard of,
     * and the pilot gets "That track is not on the board." on a lap they
     * just flew, with the screen above still telling them the track IS on
     * the board. That is the dead end this reaches around, and it was
     * reported from the seat on a shipped RaceGOW room.
     *
     * Only on a 404, and only once. Every other failure is the board saying
     * something the pilot needs to read rather than something to work
     * around, and a retry loop on an upload is how a board ends up with the
     * same lap twice.
     */
    let trackIdNow = trackId;
    let boardNow = listing.board;
    let healed = '';
    /* Signed inside send, because a 404 below can move the post to the
     * board's republished twin, and the signature covers the track id. */
    const send = async () => {
      const auth = await identity.signTime({ trackId: trackIdNow, lapMs: Math.round(fastest), ghost, craft });
      return postTime({
        trackId: trackIdNow,
        name,
        lapMs: Math.round(fastest),
        ghost,
        key: auth.key,
        sig: auth.sig,
        craft,
        origin: boardNow,
      });
    };
    try {
      let posted;
      try {
        posted = await send();
      } catch (e) {
        if (e && e.status === 404 && listing.doc) {
          const twin = await findBoardTwin({
            doc: listing.doc,
            name: listing.name,
            trackClass: 'full',
            origin: listing.board,
          });
          if (!twin.found) {
            throw new Error(twin.sameName
              ? str('main.the_board_s_copy_of_is', { name: twin.sameName.name })
              : str('main.that_track_is_no_longer_on'));
          }
          /* Re-seat before the retry, so the next lap and every screen that
           * reads the seat are on the live listing too rather than healing
           * the same dead id again. */
          writeShareImport(twin.found);
          ui.setShare({
            id: twin.found.id,
            name: twin.found.name,
            author: twin.found.author,
            board: twin.found.board,
          });
          trackIdNow = twin.found.id;
          boardNow = twin.found.board;
          healed = str('main.the_board_had_republished_this_track');
          posted = await send();
        } else {
          throw e;
        }
      }
      writePostedBest(lapSlot(trackIdNow, craft), fastest);
      /* Under the id it was stored against, which is the one the pilot flew
       * it on, and under the live one too when the seat moved: a pending lap
       * left behind a heal would be offered for upload again forever. */
      clearPendingTime(trackId);
      if (trackIdNow !== trackId) {
        clearPendingTime(trackIdNow);
      }
      const rank = posted.rank != null ? str('ui.rank', { rank: posted.rank }) : '';
      const withGhost = ghost ? str('main.ghost_attached_ready_to_be_chased') : '';
      /* formatTime, the same one the menu row that triggered this upload is
       * labelled with. A confirmation that spells the time differently from
       * the button reads as a different number. */
      notice = { text: str('main.uploaded', { name, formatTime: formatTime(fastest), rank, withGhost, healed }), untilMs: performance.now() + 3600 };
      ui.markTimePosted(posted);
    } catch (e) {
      notice = { text: str('main.could_not_upload_that_time', { v1: e.message ?? e }), untilMs: performance.now() + 3600 };
    }
  }

  /*
   * Put the finished freestyle run on the board.
   *
   * Deliberately UNLIKE submitBoardTime in one place: an arcade run is
   * posted, and labelled. A lap flown on the arcade model is a different
   * aircraft on the same track and mixing the two into one ranking makes
   * the ranking meaningless, which is why arcade laps stay off. A freestyle
   * run is not ranked against a track: the board carries the model on every
   * row and gives a reader a filter, so an arcade run can be on the board
   * and be honestly what it is. Refusing it instead would mean a pilot who
   * flies the friendlier machine has no board at all.
   */
  /*
   * Put the results screen up on a run that has ended. ONE function, called
   * by the clock running out and by the harness hook, so a screenshot of
   * this screen is a screenshot of the path a pilot takes rather than of a
   * second copy of it that could drift.
   *
   * The turtle teardown is the race path's, verbatim and for the same
   * reason: a run can end while the craft is upside down waiting to be
   * flipped, and leaving that state armed behind a menu is how the next
   * run starts with the motors parked.
   */
  function endFreestyleRun() {
    leaveFlightForResults();
    ui.showFreestyleResults(score.summary());
  }
  /* A flight put down for a results screen: the freestyle clock's, or a
   * room's match over (roomTagFrame). */
  function leaveFlightForResults() {
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
  }

  async function submitFreestyleRun() {
    const summary = score.summary();
    /*
     * FREE FLIGHT IS NOT A SCORE. It has no clock, so there is nothing for
     * a board to compare it against: a pilot could sit in the town for an
     * hour and out-total any two minute run ever flown. Refused here rather
     * than hidden, so a pilot who meant to post learns why in one sentence.
     */
    if (summary.timed === false) {
      notice = {
        text: str('main.free_flight_has_no_clock_so'),
        untilMs: performance.now() + 4200,
      };
      return;
    }
    if (!summary.tricks || !(summary.total > 0)) {
      notice = { text: str('main.a_run_with_no_tricks_in'), untilMs: performance.now() + 2800 };
      return;
    }
    /*
     * The harness can land a named trick straight into the scorer, which is
     * the only way to photograph this overlay. A run that used it is not a
     * flown run and must not reach a public table as if it were.
     */
    if (summary.assisted) {
      notice = { text: str('main.that_run_used_the_harness_hooks'), untilMs: performance.now() + 3200 };
      return;
    }
    /*
     * AND THE WEIGHT, WHICH IS REFUSED HERE RATHER THAN LABELLED, unlike
     * the arcade style two functions up.
     *
     * The argument for letting an arcade run onto this board is that arcade
     * is a NAMED model the board carries on every row, so a reader can see
     * it and filter it and the pilot who prefers that machine still has a
     * board. This slider is not a model, it is a continuum, and the board
     * has no column for it: a row posted from 140 percent weight would sit
     * beside a stock row looking identical and there would be nothing to
     * read. Putting the column on the board is the better answer and is owed
     * in PROGRESS.md; until it exists, refusing is the honest half.
     */
    if (runWeight !== WEIGHT_STOCK) {
      notice = {
        text: str('main.runs_flown_at_percent_weight_stay', { runWeight }),
        untilMs: performance.now() + 4200,
      };
      return;
    }
    let name = readPilotName();
    if (!name) {
      name = await ui.askName({
        title: str('ui.your_name'),
        detail: str('main.a_run_on_the_public_board'),
      });
    }
    if (!name) {
      return;
    }
    try {
      const posted = await postFreestyleRun({
        name,
        map: view.id,
        style: runStyle === 'arcade' ? 'arcade' : 'expert',
        summary,
      });
      /* The board keeps one run per pilot and only their best, so a worse
       * run is a 200 with improved false rather than an error. Saying
       * "posted" for a score that is not up there would be a lie the pilot
       * would only find by opening the board. */
      notice = posted.improved === false
        ? {
          text: str('main.your_still_stands_only_your_best', { formatScore: formatScore(posted.score) }),
          untilMs: performance.now() + 3600,
        }
        : {
          text: str('main.posted', { name, formatScore: formatScore(summary.total), v3: posted.rank != null ? str('ui.rank', { rank: posted.rank }) : '' }),
          untilMs: performance.now() + 3600,
        };
      ui.markRunPosted(posted);
    } catch (e) {
      notice = { text: str('main.could_not_post_that_run', { v1: e.message ?? e }), untilMs: performance.now() + 3600 };
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
    try {
      const result = await publishCurrentCourse({
        doc,
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

  function isRunActive() {
    return (mode === 'flight' || mode === 'paused') && !landed;
  }
  ui.onFcOpen = (page) => {
    ui.fc.open(moduleDump(sim), { runActive: isRunActive(), page });
  };
  /*
   * The Flight controller's Save. The draft is a full dump of the module;
   * what it becomes is three things, each through the store that already
   * owns it: its rate keys become the pilot's rate profile, its body
   * becomes the "custom" tune under FC_DUMP_KEY, and the PIDs screen's
   * adjustment for that tune is cleared because the dump IS the new
   * baseline. Then one composeConfig and one sim_init, the same join and
   * the same call every other config change makes. No preset shortcut:
   * Save always lands as Your edits, and the Tune row flies the pure
   * registry files.
   */
  ui.onFcSave = (draft, opts) => {
    bumpConfigGen();
    const nextRates = normaliseRates(ratesFromDump(draft));
    const body = tuneBody(draft);
    const nextText = composeConfig(body, nextRates, RATES_KEEP, '');
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      notice = { text: str('main.that_dump_could_not_be_saved', { configFault: configFault(code) }), untilMs: performance.now() + 3600 };
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      ui.renderMenu();
      return;
    }
    if (!writeFcDump(body)) {
      /* Storage refused (private mode). The save still FLIES, it just
       * does not survive a reload, and the pilot is told which. */
      notice = { text: str('main.saved_for_this_session_only_this'), untilMs: performance.now() + 3600 };
    } else {
      notice = { text: str('main.saved_flying_your_edits'), untilMs: performance.now() + 2400 };
    }
    ui.settings.rates = nextRates;
    clearPidsFor(ui.settings.pids, 'custom');
    ui.settings.tune = 'custom';
    menuTune = 'custom';
    ui.persistSettings();
    configId = 'custom';
    configName = str('main.your_edits');
    tuneText = body;
    ratesText = ratesDiff(nextRates);
    pidsText = '';
    configText = nextText;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    paintBest();
    reset();
    publishPids();
    const live = moduleDump(sim);
    ui.fc.snapshot = live;
    ui.fc.draft = live;
    ui.fc.runActive = false;
    if (opts && opts.restart) {
      mode = 'flight';
      ui.show('flight');
      introMs = 0;
      return;
    }
    if (opts && opts.exit) {
      ui.leaveFc();
      return;
    }
    ui.renderMenu();
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
        };
      },
    };
  };
  ui.hangarPower = hangarPower;
  ui.hangarWarning = (id) => (liveryKey(id) === liveryKey(runAirframe) && race.currentLapMs(simTimeMs) != null
    && hangarPower(id) ? str('hangar.power_voids_lap') : '');
  /*
   * The first flight's prompts.
   *
   * THREE LINES, FIRED BY WHAT THE PILOT DOES, not by a clock. The banner
   * already carries the launch prompt and the lap splits, and the guide
   * arrows are already painted on the grass, so a first run needs nothing
   * new: it needs the three sentences that carry somebody from a hover to a
   * gate, and then it needs to get out of the way.
   *
   * It retires itself. Once a lap is on the board, or three gates are behind
   * them, the pilot is flying and the lap splits are the more useful message.
   * Retiring here rather than on a timer means a slow first lap is never cut
   * off mid prompt and a fast one is never nagged.
   */
  /*
   * THE FIRST FLIGHT TOLD EVERY PILOT TO PRESS A KEY THEY MIGHT NOT HAVE.
   *
   * These three lines are the only instruction this simulator ever gives,
   * and they named the up arrow, R and Escape to a pilot who could be
   * holding a radio or a phone. A thumb pilot in landscape has no arrow key
   * and no Escape, so the one screen meant to teach the controls was
   * describing somebody else's.
   *
   * It is the same root as the feel reports that prompted this round: three
   * transducers reach this shell and the shell kept assuming one of them.
   * Read once per prompt rather than cached, because a radio can be plugged
   * in between the line that says "arrow" and the line that says "stick".
   */
  const guidedWords = () => {
    if (input.isTouchPrimary()) {
      return {
        nose: str('main.push_the_right_plate_up_then'),
        again: str('main.pause_then_restart_puts_you_back'),
      };
    }
    if (input.firstGamepad()) {
      return {
        nose: str('main.ease_the_right_stick_forward_then'),
        again: str('main.r_puts_you_back_on_the'),
      };
    }
    return {
      nose: str('main.tip_forward_with_the_up_arrow'),
      again: str('main.r_puts_you_back_on_the'),
    };
  };
  const guidedPrompt = (race) => {
    if (race.freestyle || race.lastLapMs != null || race.next >= 3) {
      ui.guided = false;
      return '';
    }
    const words = guidedWords();
    if (race.next === 0) {
      return str('main.the_green_gate_starts_your_lap', { nose: words.nose });
    }
    if (race.next === 1) {
      return str('main.through_the_next_gate_turns_green');
    }
    return str('main.gate_by_gate', { again: words.again });
  };
  /*
   * A published track chosen from My tracks. This is exactly what a ?share=
   * link does at boot, minus the navigation: fetch the document, write the
   * share seat, tell the shell which track it is now holding. The screen
   * then plays it and the world builds around it.
   */
  ui.onBoardCourse = async (track) => {
    const payload = await fetchTrackDocument(track.id, track.board);
    const doc = payload.document || payload;
    const share = {
      id: payload.id || track.id,
      name: payload.name || track.name || doc.name,
      author: payload.author || track.author || '',
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
  /* Menu clicks. The key handler has already woken the audio context by
   * the time the menu moves, so the first keypress is audible too. */
  ui.onUiSound = (kind) => {
    if (typeof audio.ui === 'function') {
      audio.ui(kind);
    }
  };

  function leavePadPick() {
    const dest = padPickReturn || 'title';
    if (dest === 'paused') {
      mode = 'paused';
    }
    ui.show(dest === 'flight' ? 'paused' : dest);
    const sum = input.padSummary();
    ui.setPadInfo(sum);
    const result = input.padPickResult;
    input.padPickResult = null;
    if (result === 'accepted') {
      notice = { text: str('main.flying_with', { using: sum.using }), untilMs: performance.now() + 2800 };
    } else if (result === 'skipped') {
      notice = { text: str('main.keyboard_sticks_choose_joystick_in_settings'), untilMs: performance.now() + 3200 };
    }
  }

  function openPadPick(reason) {
    if (ui.nameDialog && !ui.nameDialog.hidden) {
      input.requestPadPick(reason);
      return;
    }
    if (ui.screen === 'padpick') {
      return;
    }
    if (!input.startPadPick(reason)) {
      if (reason === 'menu') {
        notice = { text: str('main.no_radio_or_gamepad_found_plug'), untilMs: performance.now() + 3200 };
      }
      return;
    }
    if (ui.screen === 'calibrate') {
      input.cancelCalibration();
    }
    if (mode === 'flight' || ui.screen === 'flight') {
      mode = 'paused';
      padPickReturn = 'paused';
    } else if (ui.screen === 'padpick') {
      padPickReturn = 'title';
    } else {
      padPickReturn = ui.screen || 'title';
    }
    ui.show('padpick');
  }

  /*
   * A ghost armed from the in-game standings screen.
   *
   * It parks the time id exactly where a ?ghost= chase link parks it, so
   * one code path arms both: the lap is downloaded when the seated track's
   * times are read, which the seat change is about to trigger anyway.
   */
  ui.onStandingsGhost = (track, time) => {
    if (!time || !time.id) {
      return;
    }
    ghostQueryId = time.id;
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
  ui.onAction = (action, s) => {
    if (s) {
      applySettings(s);
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
    if (action === 'fly' || action === 'restart') {
      /* A room race this pilot has finished is over for them: flying on
       * is flying alone. */
      if (roomRun() && roomRace.done()) {
        roomRaceRunId = null;
      }
      /* A tune fetch in flight would sim_init under a run whose lastTs had
       * already started climbing. Wait until the load is the current one. */
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
         * THE PAD SHOT IS AN INTRODUCTION, AND A RESTART IS NOT A FIRST
         * MEETING.
         *
         * R already restarts without it: input.onKey calls reset() and
         * leaves introMs at -1. Restart run from the pause menu played the
         * whole orbit, approach and zoom, so the same intention cost four
         * seconds through the menu and nothing through the key, and the
         * menu is the only one of the two a phone has. A racer restarts
         * dozens of times an hour.
         *
         * `fly` keeps the shot: that one IS the first meeting, and it is
         * where the pilot sees the aircraft they are about to be inside of.
         */
        introMs = action === 'restart' ? -1 : 0;
      });
      return;
    }
    if (action === 'resume') {
      whenConfigReady(() => {
        if (turtleWait || turtleFlip.active) {
          turtleResumeGate = true;
        }
        mode = 'flight';
        ui.show('flight');
      });
      return;
    }
    if (action === 'pause') {
      mode = 'paused';
    } else if (action === 'title') {
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
    } else if (action === 'calibrate') {
      if (input.firstGamepad()) {
        input.startCalibration();
        ui.show('calibrate');
      } else {
        notice = { text: str('main.no_radio_or_gamepad_found_plug_2'), untilMs: performance.now() + 3200 };
      }
    } else if (action === 'calibrate-check') {
      /* The check step on its own, against the mapping already saved. Same
       * door as calibrate above, and the same answer when there is nothing
       * plugged in, because a mapping with no radio behind it is nothing to
       * look at. See startCalibrationCheck in input.js. */
      if (input.startCalibrationCheck()) {
        ui.show('calibrate');
      } else {
        notice = { text: str('main.no_radio_or_gamepad_found_plug_2'), untilMs: performance.now() + 3200 };
      }
    } else if (action === 'calibrate-cancel') {
      input.cancelCalibration();
      ui.show('pilot');
    } else if (action === 'calibrate-reverse') {
      /* No notice, for the reason on calibrate-zero-throttle below: the
       * calibrate branch of the frame loop blanks the banner every frame.
       * The feedback is the gimbal they are watching turning round under
       * the stick they are holding, which is the point of doing it here. */
      input.reverseMovingChannel();
    } else if (action === 'calibrate-stick-mode') {
      /* Settings owns the mode and writeSettings pushes it through
       * applySettings, so the keyboard, the thumb sticks and every drawn
       * gimbal follow in one place. See cycleStickMode in ui.js. */
      ui.cycleStickMode();
    } else if (action === 'calibrate-zero-throttle') {
      /* No notice. The calibrate branch of the frame loop blanks the banner
       * every frame, so one set here was never seen; the feedback is the
       * gimbal dropping to zero and the hint changing under it, which is
       * what the pilot is looking at anyway. */
      input.zeroThrottleHere();
    } else if (action === 'calibrate-skip') {
      input.skipCalibrationSelect();
    } else if (action === 'calibrate-save') {
      if (input.acceptCalibration()) {
        ui.show('pilot');
        /*
         * The notice is decided by what localStorage actually did, not by
         * the fact that the wizard finished. See saveMap in input.js: a
         * browser in private mode, or one out of quota, throws, and this
         * used to print "saved" over the top of it.
         */
        notice = input.calResult === 'saved-unstored'
          ? {
            text: str('main.mapping_live_gone_on_reload'),
            untilMs: performance.now() + 5200,
          }
          : { text: str('main.stick_mapping_saved'), untilMs: performance.now() + 2800 };
        input.calResult = null;
      }
    } else if (action === 'choosepad') {
      openPadPick('menu');
    } else if (action === 'padpick-yes') {
      if (input.acceptPadPick()) {
        leavePadPick();
      }
    } else if (action === 'padpick-no') {
      input.rejectPadPick();
    } else if (action === 'padpick-skip') {
      input.skipPadPick();
      leavePadPick();
    } else if (action === 'padpick-cancel') {
      input.cancelPadPick();
      leavePadPick();
    } else if (action === 'downloadflightlog') {
      if (flightLog.count < 2) {
        notice = {
          text: str('main.nothing_recorded_yet_turn_the_flight'),
          untilMs: performance.now() + 3600,
        };
      } else {
        const rows = flightLog.count;
        const secs = flightLog.seconds;
        downloadText(flightLogName(ui.settings.map), flightLog.csv());
        notice = {
          text: str('main.flight_log_saved_rows_over_s', { rows, secs: secs.toFixed(1) }),
          untilMs: performance.now() + 3600,
        };
      }
    } else if (action === 'setname') {
      (async () => {
        const name = await ui.askName({
          title: str('ui.your_name'),
          detail: str('ui.posted_times_and_published_tracks_carry'),
        });
        if (!name) {
          return;
        }
        try {
          const result = await syncOwnedIdentity();
          const updated = Array.isArray(result.results) && result.results.some((r) => r.ok);
          if (updated) {
            notice = { text: str('main.name_on_the_board_is_now', { name }), untilMs: performance.now() + 3200 };
          }
        } catch (e) {
          notice = { text: str('main.name_saved_here_the_board_could', { v1: e.message ?? e }), untilMs: performance.now() + 3600 };
        }
      })();
    } else if (action === 'exportkey') {
      (async () => {
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
      })();
    } else if (action === 'importkey') {
      (async () => {
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
      })();
    } else if (action === 'posttime') {
      submitBoardTime();
    } else if (action === 'postrun') {
      submitFreestyleRun();
    }
  };

  /*
   * Menu intent from a radio. When the sticks have been calibrated the
   * mapped channels drive the cursor, which lets roll adjust a value. When
   * they have not, any axis at all moves the cursor, because the way to
   * calibrate is a menu item and a wrong axis guess would otherwise lock
   * the player out of it. Settings ignores this: the sticks pose the
   * airframe there, and the cursor is mouse and keyboard only.
   */
  function padNav() {
    const btn = input.padMenuButtons();
    /*
     * mapUsable rather than map.stored. A pilot who never opened the wizard
     * because their radio was already in AETR order got up and down only,
     * which is half a menu, and a red row on the front page telling them so.
     * input.js can tell a real radio's parked throttle from a wrong guess,
     * so a guess that is behaving like a radio drives the cursor the same
     * way a wizard mapping does. See noteThrottleParked.
     */
    if (input.mapUsable()) {
      const c = input.channels;
      return {
        up: c.pitch > NAV_DEFLECT,
        down: c.pitch < -NAV_DEFLECT,
        right: c.roll > NAV_DEFLECT,
        left: c.roll < -NAV_DEFLECT,
        select: btn.select,
        back: btn.back,
        alt: input.padAltButton(),
        floats: input.padFloatsButton(),
        look: input.padLookStick(),
      };
    }
    const raw = input.navRaw();
    return {
      up: raw.up, down: raw.down, right: false, left: false, select: btn.select, back: btn.back, alt: input.padAltButton(), floats: input.padFloatsButton(), look: input.padLookStick(),
    };
  }

  /* Any real key or pointer press is the user gesture browsers require
   * before audio can start. */
  /*
   * Per stem levels. Guarded on typeof because the audio module and this file
   * are changed independently and a missing method must not take the whole
   * page down: a silent bed is a defect, a blank screen is a disaster.
   */
  function applyMix(s) {
    if (typeof audio.setMix === 'function') {
      mixArg.motors = s.motorLevel / 10;
      mixArg.wind = s.windLevel / 10;
      mixArg.music = s.musicLevel / 10;
      mixArg.focus = 1;
      mixArg.effects = s.effectsLevel / 10;
      mixArg.voice = s.voiceLevel / 10;
      mixArg.ambience = s.ambientLevel / 10;
      mixArg.other = s.otherLevel / 10;
      audio.setMix(mixArg);
    }
    if (typeof audio.setMusicEnabled === 'function') {
      audio.setMusicEnabled(s.musicLevel > 0);
    }
    if (typeof audio.setMusicTrack === 'function') {
      audio.setMusicTrack(s.musicTrack);
    }
    /* Before reading the status, so the dock names the record the bed is
     * actually on. This is also the only thing that sets the context on a
     * page that has not changed screen since it loaded: the first gesture
     * reaches wakeAudio, not show(). */
    if (typeof audio.setMusicContext === 'function') {
      audio.setMusicContext(ui.flying() ? 'flight' : 'menu');
    }
    if (typeof audio.musicStatus === 'function') {
      ui.setMusicNow(audio.musicStatus());
    }
    if (typeof audio.setFocusEnabled === 'function') {
      audio.setFocusEnabled(Boolean(s.focusTone));
    }
  }

  function wakeAudio() {
    if (ui.settings.sound && !audio.ctx) {
      audio.start();
      audio.setLevel(ui.settings.volume / 10);
    } else if (ui.settings.sound && audio.ctx.state !== 'running') {
      /* A context the browser suspended or another app interrupted: this
       * gesture is what lets it start again (MotorAudio.start). */
      audio.start();
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
      && !(build && build.active && !build.racing);
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
  const AVX_KEYS = new Set(['KeyH', 'KeyJ', 'KeyK', 'KeyI', 'KeyU', 'KeyY']);
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
    /* Flight only keys. */
    if (code === 'KeyR') {
      reset();
      return;
    }
    /*
     * The pilot's own unstick. The thrash watch catches the states we
     * could name, and it needs 700 ms to be sure; this is the backstop for
     * whatever it did not name, at the cost of one keystroke. Same
     * recovery: clear air near where you are, upright, run untouched. It
     * refuses on the ground so it cannot be used as a free reposition
     * between laps.
     */
    if (code === 'KeyX' && ui.screen === 'flight' && mode === 'flight') {
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
      return;
    }
    /* The Avionics HUD's own keys, while it is on screen
     * (docs/AVIONICS-HUD.md section 9): H the AI's tracking, J the camera
     * mode, K the zoom, I the sensor full screen or the pilot's picture, U
     * the inset's size and Y how much is drawn (settings, so kept). */
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
      const views = ['fpv', 'chase', 'los'];
      ui.settings.wingView = views[(views.indexOf(ui.settings.wingView) + 1) % views.length];
      ui.persistSettings();
      chaseValid = false;
      const said = { fpv: str('main.view_fpv'), chase: str('main.view_chase'), los: str('main.view_los') };
      notice = { text: said[ui.settings.wingView], untilMs: performance.now() + 1800 };
      return;
    }
    if (code === 'KeyL' && ui.screen === 'flight') {
      if (!ui.settings.launchControl) {
        notice = {
          text: str('main.launch_control_is_off_turn_it'),
          untilMs: performance.now() + 3200,
        };
        return;
      }
      if (!landed && !launchStaging) {
        notice = {
          text: str('main.launch_control_is_for_the_start'),
          untilMs: performance.now() + 2800,
        };
        return;
      }
      applyLaunchSwitch(!lcArmed);
      if (lcArmed) {
        notice = {
          text: str('main.launch_control_throttle_idle_pitch_forward'),
          untilMs: performance.now() + 2200,
        };
      } else {
        notice = { text: str('main.launch_control_off'), untilMs: performance.now() + 1600 };
      }
      return;
    }
  };
  window.addEventListener('pointerdown', wakeAudio);

  /*
   * Swallow a dropped file, and say why nothing happened.
   *
   * The page used to fly any Betaflight CLI diff dropped on it, and that is
   * gone: the menu offers the registry tunes, the PIDs screen adjusts them,
   * and the rates are the pilot's.
   * The listeners stay because REMOVING them is not neutral. Without a
   * preventDefault the browser navigates to the dropped file, which tears
   * down the simulator and loses the run, and a pilot who read the old
   * README is exactly the person who will try it.
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

  /* Reused, not rebuilt: applySettings runs off a menu keypress, but the
   * same object also keeps the shape of the call obvious in one place. */
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
  /* The craft's own up axis in world space, for the prop plane test. Hoisted
   * because it is written on every contact and budget P8 says the frame loop
   * does not allocate. */
  const upAxis = new THREE.Vector3();
  const nSim = { x: 0, y: 0, z: 0 };
  const pSim = { x: 0, y: 0, z: 0 };
  const vsSim = { x: 0, y: 0, z: 0 };
  /* The contact pass runs on the sim clock, several times a frame, so its
   * working set is hoisted for the same reason upAxis is. */
  const rPatch = { x: 0, y: 0, z: 0 };
  const rSim = { x: 0, y: 0, z: 0 };
  const obsPrev = new THREE.Vector3();
  const obsFrom = new THREE.Vector3();
  const obsTo = new THREE.Vector3();
  const obsPlace = new THREE.Vector3();
  const qObs = new THREE.Quaternion();
  const groundNWorld = new THREE.Vector3(0, 1, 0);
  /* The same normal with the spawn yaw taken out, ready for the plant. */
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
  /* The orbit's own forward: the craft's heading FLATTENED onto the ground
   * plane. See the note where it is filled. */
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
    /* -1: not on the finish shot. 0+: milliseconds into the pull-out. */
    let finishCamMs = -1;
  /* Eased toward PARKED_LIFT while the craft is down and toward zero once it
   * is flying, so the view rises off the pad rather than jumping. */
  let parkedLift = PARKED_LIFT;

  /*
   * World contact, already spawn-offset, back into plant metres. Inverse of
   * the render pose path: subtract the start, undo the spawn yaw, then the
   * frame.js basis change, then SPAWN_ALT. Bounce has to write a plant
   * position or the next sweep starts inside the solid we just hit.
   */
  function worldPosToSim(wx, wy, wz, out) {
    pBounce.set(wx - startX, wy - startY, wz - startZ);
    pBounce.applyQuaternion(qSpawnInv);
    threePosToSim(pBounce.x, pBounce.y, pBounce.z, out);
    out.z -= SPAWN_ALT;
    return out;
  }

  /*
   * A WORLD DIRECTION INTO THE PLANT, and the one seam every direction goes
   * through. The reason it exists is the reason the wall tap stuck.
   *
   * The pose path is qSpawn applied to a basis change: poseFromState turns a
   * plant position into a world one with simPosToThree and then
   * `applyQuaternion(qSpawn)`, and worldPosToSim above undoes both in the
   * right order. A DIRECTION needs the same rotation and no offset, and it
   * was not getting it: the contact pass handed `threeDirToSim` a world space
   * normal, and threeDirToSim is the basis PERMUTATION and nothing else. A
   * permutation cannot undo a rotation.
   *
   * On a level floor that costs nothing, because a yaw about world up leaves
   * a vertical normal alone, which is exactly why this survived: the ground
   * model, the roof test and the race field all read straight. On a VERTICAL
   * face it is the whole answer. Measured through this chain, a craft flying
   * at 10 m/s square into a wall, with the plant's own velocity beside the
   * normal the plant was handed:
   *
   *   spawn yaw    0 deg   n . v  -10.0   approaching, the impulse is applied
   *   spawn yaw   90 deg   n . v   -0.0   PERPENDICULAR: a head on hit reads
   *                                       as a graze along the face
   *   spawn yaw  180 deg   n . v  +10.0   REVERSED: contact_impulse sees a
   *                                       craft leaving and declines it
   *
   * The freestyle city, retired since, spawned at yaw pi, so every
   * vertical face in the town was the third row. sim.c returns 0 without an
   * impulse when vn >= 0 and there is no penetration to push out of, so a
   * wall tap in the town got no restitution, no friction and no separation:
   * the sweep parked the hull 8 mm off the face, the pass broke out on a
   * zero impulse and threw away the tangential travel with it, and the craft
   * sat on the wall. That is the owner's report, and it is a frame error
   * rather than a friction one, which is why walking the materials never
   * fixed it.
   *
   * raiseGroundFromState already carried the fix for the ground plane, with
   * a comment describing this exact class of bug. It is here now instead, so
   * there is ONE path, and frame.js stays the only place the basis change
   * lives. scripts/frame-check.js asserts the round trip at four spawn yaws.
   */
  function worldDirToSim(wx, wy, wz, out) {
    nWorld.set(wx, wy, wz);
    nWorld.applyQuaternion(qSpawnInv);
    threeDirToSim(nWorld.x, nWorld.y, nWorld.z, out);
    return out;
  }

  function poseFromState(st, out) {
    simPosToThree(st[1], st[2], st[3] + SPAWN_ALT, out);
    out.applyQuaternion(qSpawn);
    out.x += startX;
    out.z += startZ;
    out.y += startY;
    return out;
  }

  /*
   * One axis of the slope, from the two one sided differences either side
   * of the craft, limited so a STEP cannot be read as a RAMP.
   *
   * The old sampler took one forward difference over 35 cm and called the
   * answer a slope. On terrain that is honest, because terrain over 35 cm
   * is a slope. On a LAUNCH STAND it is not: a start block is 0.248 m
   * across and 0.38 m along, so the stencil always steps off the block
   * onto the grass, and the "slope" it reported was the block's own height
   * divided by the stencil. Measured at the middle of a default stand that
   * is a 30 degree plane, rising to 43 degrees as the craft moves, leaning
   * toward +x and +z in WORLD space whichever way the grid points. The
   * plant then solved a rigid contact against it: the quad was flicked
   * 0.17 m sideways and 0.19 m upward inside six milliseconds, left the
   * pad at 1 m/s of drift it never asked for, and the impulses that took
   * were the bang at the start line. Muting the cue did not fix it because
   * the cue was telling the truth: something really was hitting the hull.
   *
   * A craft sitting on a small object sits on a LOCAL PEAK, and the two one
   * sided slopes there point opposite ways. That is the signature, and it
   * is the same signature at the edge of the clubhouse terrace, on a pit
   * table, on a map platform and on the city's overbridge deck. So the two
   * sides are combined with a minmod limiter: opposite signs mean a ridge
   * or a step, and the honest local surface is FLAT; matching signs mean a
   * real slope, and the gentler of the two is taken, which is the standard
   * conservative choice. A one in five hill still measures 11.31 degrees,
   * exactly its own angle.
   */
  function limitSlope(a, b) {
    if (a * b <= 0) {
      return 0;
    }
    return (a < 0 ? -a : a) < (b < 0 ? -b : b) ? a : b;
  }

  /*
   * Terrain slope at (x, z), Three.js world space, unit, pointing up.
   * Finite differences, no trig: the physics path may not call JS Math.sin
   * or Math.cos. Sampled a few times per frame, not every 1 ms, because a
   * 35 cm stencil barely moves in 8 ms. Five taps rather than three, so
   * the difference is centred and cannot lean toward +x and +z on ground
   * that is level.
   */
  function sampleGroundNormal(wx, wz, fromY, out) {
    const eps = 0.35;
    const h0 = floorHeight(wx, wz, fromY);
    const nx = limitSlope(
      h0 - floorHeight(wx + eps, wz, fromY),
      floorHeight(wx - eps, wz, fromY) - h0,
    );
    const nz = limitSlope(
      h0 - floorHeight(wx, wz + eps, fromY),
      floorHeight(wx, wz - eps, fromY) - h0,
    );
    const ny = eps;
    const n2 = nx * nx + ny * ny + nz * nz;
    if (!(n2 > 1e-12)) {
      out.set(0, 1, 0);
      return h0;
    }
    const inv = 1 / Math.sqrt(n2);
    out.set(nx * inv, ny * inv, nz * inv);
    return h0;
  }

  function sampleGroundNormalFromState(st) {
    poseFromState(st, pProbe);
    sampleGroundNormal(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, groundNWorld);
    groundNormalAtX = pProbe.x;
    groundNormalAtZ = pProbe.z;
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
    /*
     * The plane's POINT goes through worldPosToSim, which undoes the spawn
     * yaw. Its NORMAL did not, and threeDirToSim is a basis permutation
     * that cannot undo a rotation, so the slope arrived at the plant turned
     * by however far the spawn faced. A 20 degree hillside under a quarter
     * turn spawn reached the plant as a 20 degree ROLL rather than a
     * 20 degree pitch: the craft leaned the wrong way on every slope on
     * every map whose spawn is not aligned with the world axes. It never
     * showed on level ground or on a deck, where the normal is straight up
     * and a yaw about up is the identity, which is why it lasted. A
     * direction takes no offset, so this is the rotation and nothing else.
     *
     * It goes through worldDirToSim now, with every other direction the
     * shell converts. There are four of them: this one, the contact normal,
     * the contact patch arm and a moving collider's surface velocity. This
     * was the first to be fixed and stayed the only one for four days.
     */
    worldDirToSim(groundNWorld.x, groundNWorld.y, groundNWorld.z, nSim);
    const n2 = nSim.x * nSim.x + nSim.y * nSim.y + nSim.z * nSim.z;
    if (!(n2 > 0.97) || !(n2 < 1.03)) {
      nSim.x = 0;
      nSim.y = 0;
      nSim.z = 1;
    } else {
      const inv = 1 / Math.sqrt(n2);
      nSim.x *= inv;
      nSim.y *= inv;
      nSim.z *= inv;
    }
    const code = sim.e.sim_set_ground(
      1, nSim.x, nSim.y, nSim.z, pSim.x, pSim.y, pSim.z, GROUND_MU, GROUND_E,
    );
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
   * How far out of the face to place the craft.
   *
   * This used to add `inward`, the distance the frame's END position had
   * gone past the contact plane, on top of the gap. That is wrong twice
   * over. The contact point is by definition the pose at first touch, so
   * it is already clear of the face and the only thing owing is the gap;
   * and `inward` grows with the frame's own travel, so the same wall hit
   * pushed a 30 fps machine back five times further than a 144 fps one.
   * At 20 m/s that was a third of a metre of teleport away from the wall.
   * An already-inside hit is the one case with real depth to undo, and
   * hitPen is the collider's own nearest-face exit for it.
   */
  function contactSeparation() {
    if (view.colliders.hitT <= 1e-6) {
      /*
       * Whichever depth the collider actually reported. hitPen is the
       * craft's CENTRE through a face, which only a tunnelled hull has;
       * hitOverlap is the hull overlapping a face its centre is still
       * outside of, which is every ordinary contact with a wall. Only the
       * first of the two existed, and only for a capsule and for a centre
       * inside a box, so a hull that arrived at a wall already overlapping,
       * which is what a rotation into a surface produces, was moved the
       * flat 8 mm and met the same face again on the next pass. It leaves
       * in one step now.
       */
      const depth = view.colliders.hitPen > view.colliders.hitOverlap
        ? view.colliders.hitPen
        : view.colliders.hitOverlap;
      if (depth > 0) {
        return depth + BOUNCE_SEPARATION;
      }
    }
    return BOUNCE_SEPARATION;
  }

  /*
   * ONE CONTACT: place the craft on the free side of the face and apply
   * the impulse there.
   *
   * The impulse arm is the four-disc contact patch, not the plant's own
   * hull corner, which is the whole of the difference between a belly slap
   * that pushes off and one that spins the craft up. See contactPatch in
   * collide.js for the measurements that forced this.
   *
   * Returns the impulse's own scale, in metres per second of centre of
   * mass velocity change, so the caller can size the sound and the shake
   * from what actually happened rather than from a speed threshold. Zero
   * means the module refused the contact.
   */
  function resolveContactAt(nx, ny, nz, cx, cy, cz, e, mu, vsx, vsy, vsz) {
    const sep = contactSeparation();
    /*
     * WRITTEN FIRST, because the caller branches on it and it used to
     * survive the call that failed to set it. passStats.code is assigned in
     * one place, after the module returns, and the degenerate-normal path
     * below returns 0 without ever reaching it: the caller then read a code
     * left over from an EARLIER contact, on an earlier collider, possibly in
     * an earlier frame, and decided from it whether this pass had merely
     * found a resting contact or had been refused outright. Seeding it here
     * makes the field mean "what happened to THIS contact".
     */
    passStats.code = SIM_OK;
    worldDirToSim(nx, ny, nz, nSim);
    const nlen = Math.sqrt(nSim.x * nSim.x + nSim.y * nSim.y + nSim.z * nSim.z);
    if (!(nlen > 1e-9)) {
      passStats.code = SIM_ERR_BAD_ARG;
      return 0;
    }
    const inv = 1 / nlen;
    obsPlace.set(cx + nx * sep, cy + ny * sep, cz + nz * sep);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    /* A fixed wing's hull says where on it the contact is; a quad's is the
     * patch of its discs. */
    if (view.colliders.hitArm) {
      rPatch.x = view.colliders.hitArmX;
      rPatch.y = view.colliders.hitArmY;
      rPatch.z = view.colliders.hitArmZ;
    } else {
      contactPatch(nx, ny, nz, qObs.x, qObs.y, qObs.z, qObs.w, rPatch);
    }
    worldDirToSim(rPatch.x, rPatch.y, rPatch.z, rSim);
    const before = stateCurr;
    const vx0 = before[4];
    const vy0 = before[5];
    const vz0 = before[6];
    /*
     * THE GUARD THAT WOULD HAVE CAUGHT THIS, and it stays.
     *
     * The plant only ever sees the plant frame, so a normal turned the wrong
     * way is not something it can refuse: it reads a craft flying INTO a wall
     * as one leaving, declines the contact, and the shell reads that as a
     * refusal rather than as a bug. The one invariant that survives the
     * conversion is the SIGN: a contact normal points out of the solid, so it
     * opposes an inbound craft in whichever frame you ask. Counted here, in
     * the frame the plant actually uses, it costs a dot product per contact
     * and it is the only place the answer can be checked against the plant's
     * own velocity. window.__contacts() reports it.
     */
    const vn = nSim.x * inv * before[4] + nSim.y * inv * before[5] + nSim.z * inv * before[6];
    if (vn > 0.05) {
      passStats.outbound += 1;
    } else if (vn < -0.05) {
      passStats.inbound += 1;
    }
    /* With crash damage on, the obstacle's material rides along where the
     * module's numbers for it are these ones; see THE CRASH SHELL. */
    const surf = obstacleSurfaceFor(obsKindIndex);
    if (runDamage) {
      plantMustHold(view.colliders, cx, cy, cz);
    }
    /* And which part the fixed wing's hull met, so the damage is that
     * part's and not whichever part stands furthest toward the solid. */
    if (runDamage && view.colliders.hitArm) {
      sim.e.sim_contact_part(view.colliders.hitPart);
    }
    const code = surf >= 0
      ? sim.e.sim_contact_at_mat(
        nSim.x * inv, nSim.y * inv, nSim.z * inv,
        surf,
        pSim.x, pSim.y, pSim.z,
        vsx, vsy, vsz,
        rSim.x, rSim.y, rSim.z,
      )
      : sim.e.sim_contact_at(
        nSim.x * inv, nSim.y * inv, nSim.z * inv,
        e, mu,
        pSim.x, pSim.y, pSim.z,
        vsx, vsy, vsz,
        rSim.x, rSim.y, rSim.z,
      );
    passStats.code = code;
    if (code !== SIM_OK) {
      return 0;
    }
    logContact(before, rSim);
    stateCurr = readState();
    const dvx = stateCurr[4] - vx0;
    const dvy = stateCurr[5] - vy0;
    const dvz = stateCurr[6] - vz0;
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
  }

  /* Move onto the free side without an impulse. Only for a hull that is
   * already buried: there is no approach velocity left to solve against,
   * and stacking a second impulse on a depenetration is how a corner
   * starts pumping energy into the craft. */
  function separateAt(nx, ny, nz, cx, cy, cz) {
    const sep = contactSeparation();
    obsPlace.set(cx + nx * sep, cy + ny * sep, cz + nz * sep);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    const st = stateCurr;
    const code = sim.e.sim_set_pose(
      pSim.x, pSim.y, pSim.z, st[7], st[8], st[9], st[10],
    );
    if (code !== SIM_OK) {
      return false;
    }
    stateCurr = readState();
    return true;
  }

  /* Let go of the face: the hold, and the memory of it. */
  function releasePress() {
    pressHeldMs = 0;
    pressIdleMs = 0;
    pressing = false;
  }

  /*
   * THE SOLID WORLD, ON THE SIM CLOCK.
   *
   * Every gate member, tree, rock, cliff tier and city wall is a capsule
   * or a box in view.colliders, and the query is the exact closest
   * distance between the segment the craft travelled and the collider, so
   * nothing tunnels at any frame rate.
   *
   * THIS USED TO RUN ONCE PER RENDERED FRAME, ON THE INTERPOLATED RENDER
   * POSE, AND WRITE THE RESULT BACK INTO THE PLANT. Three things followed
   * from that and all three were felt:
   *
   *   1. the trajectory depended on the frame rate, which CLAUDE.md
   *      forbids in as many words: a dropped frame must change nothing.
   *      Two machines at 60 and 144 fps took different lines off the same
   *      wall, and the leaderboard is scored on that.
   *   2. the pose it solved against was a lerp between two physics states,
   *      so the contact was never resolved against a state the plant had
   *      actually been in.
   *   3. a contact rewound the craft to the touch point and threw away
   *      the rest of the frame's travel, INCLUDING the part along the
   *      surface. In sustained contact hitT is 0 every frame, so the craft
   *      was put back where it started, every frame, and could not slide.
   *      That is the "it sticks a bit" in the owner's report, and it is
   *      not a friction problem: there was no tangential motion left to
   *      apply friction to.
   *
   * So it runs here instead, every OBSTACLE_STEP milliseconds of SIM time,
   * against the plant's own pose, and the leftover travel is projected
   * onto the face and swept again rather than dropped. The cadence is a
   * count of 1 ms steps, so it is identical however the host batched them.
   *
   * Collide and slide, four passes: hit, place on the face, impulse there,
   * carry the remaining travel along the surface, sweep that too. Four is
   * enough for a corner (two faces) with slack; anything still overlapping
   * after that is what the clip watch reads.
   */
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
  function obstacleContactPass(st, atMs) {
    obsResolved = false;
    obsKindIndex = -1;
    if (!view.colliders || mode !== 'flight' || crashed || poseLock || launchStaging) {
      obsHasPrev = false;
      releasePress();
      return st;
    }
    poseFromState(st, obsTo);
    simQuatToThree(st[7], st[8], st[9], st[10], qObs);
    qObs.premultiply(qSpawn);
    if (!obsHasPrev) {
      obsPrev.copy(obsTo);
      obsHasPrev = true;
      return st;
    }
    obsFrom.copy(obsPrev);
    /* Seed the next pass from where this one actually arrived, whatever
     * the contacts below do to it. */
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
     * shell (src/maps/alps/roofs.js). Same fromY as the ground plane. */
    if (view.cover) {
      view.cover(obsTo.x, obsTo.z, obsTo.y - SURFACE_BIAS);
    }

    upAxis.set(0, 1, 0).applyQuaternion(qObs);
    const vh = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - upAxis.y * upAxis.y)));

    const origX = obsFrom.x;
    const origY = obsFrom.y;
    const origZ = obsFrom.z;
    const endX = obsTo.x;
    const endY = obsTo.y;
    const endZ = obsTo.z;
    let punchIndex = -1;
    let punchMoving = -1;
    let punchTravel = false;
    let clean = true;
    let attempts = 0;
    let passPressing = false;

    for (; attempts < 4; attempts += 1) {
      const k = view.colliders.hit(
        obsFrom.x, obsFrom.y, obsFrom.z,
        obsTo.x, obsTo.y, obsTo.z,
        vh, qObs.x, qObs.y, qObs.z, qObs.w,
        craftVerticalOffset(),
      );
      if (k < 0) {
        clean = true;
        break;
      }
      clean = false;
      if (!punchTravel
        && view.colliders.crossedHit(origX, origY, origZ, endX, endY, endZ)) {
        punchIndex = view.colliders.hitIndex;
        punchMoving = view.colliders.hitMoving;
        punchTravel = true;
      }
      const col = view.colliders;
      const nx = col.hitNx;
      const ny = col.hitNy;
      const nz = col.hitNz;
      if (ny > 0.5) {
        obsRoof = true;
      }
      /* The thrust axis pointing INTO this face is the state the rotor
       * bleed below exists for. Noticed on the sweep rather than on the
       * impulse, because a craft already resting on the face has no
       * normal velocity left for the solver to take and the pass reports
       * it as resting: the rotors are against the wall either way. */
      if (thrustIntoFace(nx, ny, nz, upAxis.x, upAxis.y, upAxis.z)) {
        passPressing = true;
      }
      lastHitKind = col.kindName(k);
      lastHitIndex = col.hitIndex;
      ui.progress.touch(lastHitKind);
      lastClosing = speedNow * col.hitNormalDot;
      obsTouched = true;
      if (lastClosing > obsClosing) {
        obsClosing = lastClosing;
      } else if (-lastClosing > obsClosing) {
        obsClosing = -lastClosing;
      }
      lastUpDot = Math.abs(nx * upAxis.x + ny * upAxis.y + nz * upAxis.z);

      const ht = col.hitT < 0 ? 0 : col.hitT > 1 ? 1 : col.hitT;
      const cx = obsFrom.x + (obsTo.x - obsFrom.x) * ht;
      const cy = obsFrom.y + (obsTo.y - obsFrom.y) * ht;
      const cz = obsFrom.z + (obsTo.z - obsFrom.z) * ht;

      /* Buried: no approach left to solve, just get out. */
      if (col.hitT <= 1e-6 && col.hitPen > 0.05) {
        passStats.buried += 1;
        if (!separateAt(nx, ny, nz, cx, cy, cz)) {
          passStats.sepFail += 1;
          break;
        }
        poseFromState(stateCurr, obsFrom);
        obsTo.copy(obsFrom);
        continue;
      }

      const mat = contactMaterial(lastHitKind);
      obsKindIndex = k;
      let vsx = 0;
      let vsy = 0;
      let vsz = 0;
      const moving = col.hitMoving;
      if (moving >= 0) {
        /*
         * The moving centres are a pair one PASS apart, swept above, so
         * the difference is divided by the pass's own OBSTACLE_STEP. They
         * used to be a pair one frame apart, divided by the frame's sim
         * duration, which made the car's speed and where it met the craft
         * a function of the frame rate.
         */
        const dtSurface = OBSTACLE_STEP * 0.001;
        const msx = (col.movingCx[moving] - col.movingPx[moving]) / dtSurface;
        const msy = (col.movingCy[moving] - col.movingPy[moving]) / dtSurface;
        const msz = (col.movingCz[moving] - col.movingPz[moving]) / dtSurface;
        /*
         * A collider that JUMPED has no surface velocity, and the
         * difference of its two centres does not know that: it reports the
         * jump divided by a frame. The map owns not jumping (the retired
         * city's train seated rather than swept across its wrap) and this
         * is the seam that owns not
         * handing the plant an impulse it cannot survive. Zero, not a
         * clamp: a teleport is not slow motion, it is no motion.
         */
        if (msx * msx + msy * msy + msz * msz
          <= SURFACE_SPEED_MAX * SURFACE_SPEED_MAX) {
          /* Through the same door as the normal and the arm. A surface
           * velocity is a direction with a magnitude and takes no offset,
           * and it was turned by the spawn yaw exactly as they were: on a
           * map facing half a turn round, the train's 23.5 m/s reached the
           * plant pointing the other way down the track. */
          worldDirToSim(msx, msy, msz, vsSim);
          vsx = vsSim.x;
          vsy = vsSim.y;
          vsz = vsSim.z;
        }
      }

      /* Leftover travel, with the part that goes into the face removed.
       * What is left is the slide, and it is swept on the next pass so a
       * slide into a second solid cannot tunnel. */
      let rx = (obsTo.x - obsFrom.x) * (1 - ht);
      let ry = (obsTo.y - obsFrom.y) * (1 - ht);
      let rz = (obsTo.z - obsFrom.z) * (1 - ht);
      const dn = rx * nx + ry * ny + rz * nz;
      if (dn < 0) {
        rx -= nx * dn;
        ry -= ny * dn;
        rz -= nz * dn;
      }

      const dv = resolveContactAt(nx, ny, nz, cx, cy, cz, mat.e, mat.mu, vsx, vsy, vsz);
      /*
       * A DECLINED IMPULSE IS NOT A FAILED PASS, and treating it as one is
       * the second half of why the craft sat on the wall.
       *
       * contact_impulse returns without doing anything whenever the patch is
       * already moving away from the face and there is no penetration to push
       * out of, which is the ordinary state of a hull sliding ALONG a
       * surface: the normal component is spent, the tangential one is not.
       * The pass used to `break` there, and the break skipped the one thing
       * that still had work to do, which is committing the slide below. So
       * every millisecond the craft spent against a face threw away that
       * millisecond's travel along it, which is the same "there was no
       * tangential motion left to apply friction to" the collide-and-slide
       * rebuild was written to fix, arriving by a different door.
       *
       * A refusal from the MODULE is different and still ends the pass:
       * SIM_ERR_BAD_ARG means the contact could not be expressed, and
       * sweeping on from an unresolved state is how a corner pumps energy.
       */
      if (dv <= 0) {
        passStats.kind = lastHitKind;
        passStats.e = mat.e;
        passStats.mu = mat.mu;
        if (passStats.code !== SIM_OK) {
          passStats.dvZero += 1;
          break;
        }
        passStats.resting += 1;
        obsContact = true;
        obsResolved = true;
        /* Carry the slide. Position only, so no momentum is invented, and on
         * round the loop so a slide into a second solid still cannot tunnel.
         *
         * A hull pressed against a face with nothing left to carry stops
         * here instead. sim_contact_at writes the pose whether or not it
         * applies an impulse, so going round again on a travel of nothing
         * would ask it to place the craft a further separation off the face
         * every attempt, which is a creep away from the wall rather than a
         * slide along it. */
        poseFromState(stateCurr, obsFrom);
        if (rx * rx + ry * ry + rz * rz <= 1e-12) {
          obsTo.copy(obsFrom);
          break;
        }
        obsTo.set(obsFrom.x + rx, obsFrom.y + ry, obsFrom.z + rz);
        continue;
      }
      passStats.resolved += 1;
      obsResolved = true;
      obsContact = true;
      if (dv > obsImpulse) {
        obsImpulse = dv;
        obsImpulseKind = lastHitKind;
      }
      poseFromState(stateCurr, obsFrom);
      obsTo.set(obsFrom.x + rx, obsFrom.y + ry, obsFrom.z + rz);
    }

    if (clean && attempts > 0
      && (obsTo.x !== obsFrom.x || obsTo.y !== obsFrom.y || obsTo.z !== obsFrom.z)) {
      /* The slide is free. Commit it: this is the frame's own travel being
       * carried along the surface, which is exactly what used to be lost.
       * Position only, so no momentum is invented. */
      worldPosToSim(obsTo.x, obsTo.y, obsTo.z, pSim);
      if (sim.e.sim_set_pose(
        pSim.x, pSim.y, pSim.z, stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10],
      ) === SIM_OK) {
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

    if (!clean) {
      obsLeftover = true;
    } else if (attempts >= 4) {
      obsLeftover = view.colliders.hit(
        obsPrev.x, obsPrev.y, obsPrev.z,
        obsPrev.x, obsPrev.y, obsPrev.z,
        vh, qObs.x, qObs.y, qObs.z, qObs.w,
        craftVerticalOffset(),
      ) >= 0;
    }
    if (obsLeftover) {
      const depth = view.colliders.interiorOfHit(obsPrev.x, obsPrev.y, obsPrev.z);
      if (depth > obsInterior) {
        obsInterior = depth;
      }
      if (!(depth > CLIP_CENTER_EPS) && view.colliders.hitNy > 0.5) {
        obsRoof = true;
      }
    }
    if (punchTravel) {
      const stillThrough = punchMoving >= 0
        ? view.colliders.crossedMoving(punchMoving, origX, origY, origZ, obsPrev.x, obsPrev.y, obsPrev.z)
        : view.colliders.crossedStatic(punchIndex, origX, origY, origZ, obsPrev.x, obsPrev.y, obsPrev.z);
      if (stillThrough) {
        obsLeftover = true;
        if (!(obsInterior >= CLIP_DEEP)) {
          obsInterior = CLIP_DEEP;
        }
      }
    }

    /*
     * AND THE ROTORS, IF THE CRAFT IS HOLDING ITSELF ON THE FACE.
     *
     * The state, the measurements and every threshold here are argued in
     * collide.js beside PRESS_UP_DOT. The short of it: a disc pressed onto
     * masonry has no air to pull through it, so the thrust that was
     * pinning the craft to the wall should not exist, and without this it
     * did. The craft leaves the face on its own now instead of buzzing
     * against it until the pilot restarts.
     *
     * Crashflip is exempt. Turtle's whole method is to drive two rotors
     * against whatever the craft is lying on, and a craft upside down on a
     * roof is indistinguishable from one pinned on a wall by the dot
     * product alone.
     */
    if (passPressing) {
      pressIdleMs = 0;
      pressing = true;
    } else if (pressing) {
      pressIdleMs += OBSTACLE_STEP;
      if (pressIdleMs > PRESS_RELEASE_MS) {
        releasePress();
      }
    }
    if (pressing) {
      pressHeldMs += OBSTACLE_STEP;
      if (pressHeldMs >= PRESS_CONFIRM_MS
        && !sim.e.sim_crashflip_active()
        && typeof sim.e.sim_prop_strike === 'function') {
        sim.e.sim_prop_strike(PRESS_BLEED);
        stateCurr = readState();
      }
    }
    return stateCurr;
  }

  /*
   * The title screen's camera. It belongs to the MAP, because the shot that
   * shows a map off is the map's business: the race field flies its own
   * racing line, the city flies its own streets, and the shell only has to
   * know which frame to ask for. Rebuilt on every swap, below.
   */
  let attractCam = makeAttractCamera(view);
  applySettings(ui.settings);

  const bootPick = input.takePadPickQueue();
  if (bootPick) {
    openPadPick(bootPick);
  }

  /* The spawn's placement in the world. Not fixed for the session any more:
   * the two maps start in different places, so this is re-adopted on every
   * map swap and the crash check reads whatever the current map says. It has
   * to run before the first reset, because reset seats the craft on the
   * ground at the spawn. */
  adoptSpawn();
  reset();
  /* The boot course goes through here rather than adoptLoadedView, so the
   * ghost picker learns about it here: what the board holds for it, and
   * the ?ghost= a chase link may have arrived with. */
  ghostCourseChanged();

  let prevWall = performance.now();
  /* The last frame's wall interval, ms, before FRAME_DT_MAX caps it. */
  let lastWallDt = 0;
  /* Harness camera override, six numbers: position then look at target. */
  let camOverride = null;
  const camLookAt = new THREE.Vector3();

  /*
   * The target mark's arithmetic. Two scratch vectors and a handful of
   * constants, hoisted because this runs every frame of every race and the
   * overlay is not allowed to be the thing that allocates.
   *
   * The margins are how far inside the frame the chevron parks, and they
   * are not one number because the OSD is not one shape. The lap clock
   * stack runs about 140 px down the top of the frame and the pack and
   * flight blocks stand 100 px off the bottom, so a chevron pinned 54 px in
   * from an edge is right on the sides and sits on an instrument top and
   * bottom.
   *
   * AIM_RELEASE and AIM_FADE are the range the lock lets go over. At 6 m a
   * 1.7526 m opening is a fifth of the frame's height at the default lens,
   * so a bracket around it is a box drawn on a barn door; at 13 m it is
   * under a tenth and the bracket is still telling the pilot something. The
   * mark never fades while it is on the frame edge, because a target you
   * cannot see is exactly when the range matters.
   */
  const AIM_MARGIN = 54;
  const AIM_MARGIN_TOP = 100;
  /*
   * 108 CLEARS THE CORNER BLOCKS AND NOTHING ELSE, WHICH IS WHY THE CHEVRON
   * KEPT LANDING ON THE STICKS.
   *
   * The bottom band belongs to whichever readout is in it, and that is not
   * always the two corner instruments this number was sized for. The
   * keyboard stick ghost sits centred at the bottom and stands about 124 px
   * tall: an 18 px offset, a plate that clamps between 64 and 88 px, a
   * caption margin and 10 px of type. On a touch layout the corner blocks
   * themselves move to the bottom centre. A gate below the frame is the
   * normal case straight after takeoff and in every climb, so the chevron
   * and its range were being drawn over the roll and pitch gimbal, and over
   * the speed readout on a phone, exactly when the pilot was reading both.
   *
   * So the margin is what is actually down there, measured the same way in
   * both cases rather than assumed.
   */
  const AIM_MARGIN_BOTTOM = 108;
  /* With the stick ghost or the touch layout up. Measured against the CSS in
   * index.html: 18 px from the bottom, an 88 px plate at its clamp ceiling,
   * a 6 px caption gap and 10 px of caption, plus the same 8 px of air the
   * 108 above leaves over an instrument. */
  const AIM_MARGIN_BOTTOM_STICKS = 130;
  const AIM_RELEASE = 6;
  const AIM_FADE = 13;
  /* The bracket stands this much outside the opening, so it frames the gate
   * instead of covering the ring the pilot aims at. */
  const AIM_BRACKET = 1.45;
  const aimNdc = new THREE.Vector3();
  const aimFwd = new THREE.Vector3();
  /* One argument object each, refilled in place. */
  const LOCK_OFF = { show: false };
  const lockArg = {
    show: true, x: 0, y: 0, size: 0, angle: 0, edge: false, wrong: false, distance: 0, fade: 1,
  };

  /*
   * Put the target mark where the next gate is.
   *
   * The map owns which gate that is and which side of it the pilot is on,
   * because that is the same decision that colours the gate itself; the
   * shell owns the projection, because the canvas size is the shell's.
   * Splitting it the other way is how the mark and the gate would end up
   * disagreeing about which way through.
   */
  function updateTargetLock() {
    if (crashflipOn || turtleRecover) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    const aim = view.targetAim ? view.targetAim() : null;
    if (!aim || !aim.active) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    const el = shell.renderer.domElement;
    /* CSS pixels. The overlay is a DOM layer over the canvas, and the
     * drawing buffer is a different size on any display whose pixel ratio
     * is above one. */
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 2 || vh < 2) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    aimNdc.copy(aim.centre).project(shell.camera);
    /*
     * BEHIND THE CAMERA THE PROJECTION LIES, and it lies plausibly: the
     * divide is by a negative w, so the point reflects through the centre
     * of the frame and lands somewhere a reader would believe. Negating
     * both axes recovers the true bearing.
     *
     * A target DEAD behind lands on the centre of the frame either way, and
     * a chevron at the centre pointing nowhere is worse than none, so a
     * bearing shorter than a pixel is read as straight up: turn round, and
     * either way round is as good as the other.
     */
    const behind = aimNdc.z <= -1 || aimNdc.z >= 1;
    const nx = behind ? -aimNdc.x : aimNdc.x;
    const ny = behind ? -aimNdc.y : aimNdc.y;
    let sx = (nx * 0.5 + 0.5) * vw;
    let sy = (1 - (ny * 0.5 + 0.5)) * vh;
    const midX = vw * 0.5;
    const midY = vh * 0.5;
    if (behind) {
      const ox = sx - midX;
      const oy = sy - midY;
      const len = Math.hypot(ox, oy);
      /* Pushed well outside the frame, so the clamp below always turns it
       * into a chevron rather than a bracket around empty sky. */
      sx = len > 1 ? midX + (ox / len) * vw : midX;
      sy = len > 1 ? midY + (oy / len) * vw : midY - vh;
    }
    const minX = AIM_MARGIN;
    const maxX = vw - AIM_MARGIN;
    const minY = AIM_MARGIN_TOP;
    /* Whichever of the two the frame is currently showing. isTouchPrimary
     * moves the corner blocks to the bottom centre; the keyboard ghost puts
     * the gimbals there. Either way the bottom band is taller than the
     * corner instruments alone. */
    const bottomBand = (input.isKeyboardPrimary() || input.isTouchPrimary() || input.isMousePrimary())
      ? AIM_MARGIN_BOTTOM_STICKS
      : AIM_MARGIN_BOTTOM;
    const maxY = vh - bottomBand;
    const edge = behind || sx < minX || sx > maxX || sy < minY || sy > maxY;
    /* A flag or cone already carries its own light. The in-frame bracket
     * was sized to the scoring square, which is the gate box the owner
     * asked not to draw. Off screen the chevron still points the way. */
    if (aim.virtual && !edge) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    /* The projected aperture, from the camera space depth rather than the
     * range: a gate 55 degrees off axis is the same size on screen as one
     * straight ahead at the same depth, and using the range instead
     * overstates it by most of half again out at the edge of the frame. */
    aimFwd.set(0, 0, -1).applyQuaternion(shell.camera.quaternion);
    const depth = (aim.centre.x - shell.camera.position.x) * aimFwd.x
      + (aim.centre.y - shell.camera.position.y) * aimFwd.y
      + (aim.centre.z - shell.camera.position.z) * aimFwd.z;
    const tanHalf = Math.tan((shell.camera.fov * Math.PI) / 360);
    const raw = depth > 0.2
      ? (vh * aim.clearH * AIM_BRACKET) / (2 * depth * tanHalf)
      : 0;
    lockArg.show = true;
    lockArg.edge = edge;
    lockArg.wrong = !aim.correct;
    lockArg.distance = aim.distance;
    lockArg.size = Math.max(34, Math.min(vh * 0.62, raw));
    lockArg.x = Math.min(maxX, Math.max(minX, sx));
    lockArg.y = Math.min(maxY, Math.max(minY, sy));
    /* Clockwise from up, which is how the chevron is drawn. */
    lockArg.angle = edge
      ? (Math.atan2(sx - midX, midY - sy) * 180) / Math.PI
      : 0;
    lockArg.fade = edge
      ? 1
      : Math.max(0, Math.min(1, (aim.distance - AIM_RELEASE) / (AIM_FADE - AIM_RELEASE)));
    if (lockArg.fade < 0.02) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    ui.setTargetLock(lockArg);
  }

  /*
   * The city's clock. Everything in the town that a quad can hit is a closed
   * form of an integer fixed step count, so the town has to be handed one.
   *
   * During a run that count IS simTimeMs, the physics clock, which is what
   * makes a collision with a level crossing boom reproducible from a recorded
   * input stream at any frame rate. On the title screen the physics does not
   * step at all, and a frozen town behind an attract camera reads as broken,
   * so the title gets its own counter off the same 1 ms accumulator. Nothing
   * collides on the title screen, so nothing is at stake there.
   */
  let titleAcc = 0;
  let titleStepMs = 0;
  /* The clock the last drawn frame's world was animated at. */
  let animDrawnMs = 0;
  /* Wall time of the last frame the cap let through. */
  let capLastDraw = -1e9;

  /*
   * ONE FAULT USED TO FREEZE THE PICTURE AND SAY NOTHING.
   *
   * The next frame is scheduled first, on purpose, so a slow frame does not
   * stop the loop. That also meant a THROWN frame did not stop it: readState
   * throws on any non-OK state code, sim_set_pose throws from the turtle and
   * clip-crash paths, and a height query on a half disposed map throws. The
   * loop kept running, every frame threw at the same line, and what the
   * pilot saw was the last drawn frame, forever, with a stale OSD and no
   * word about why.
   *
   * So the body is separated from the scheduling and wrapped once. The first
   * fault is reported to the pilot in the language of the thing they can do
   * about it, and stored where the F8 bug report can find it. The loop keeps
   * running afterwards because the camera, the menus and the report form all
   * live in it; what stops is the pretence that the flight is still valid.
   *
   * The flag itself is declared beside reset(), which clears it, because a
   * `let` here would be in its temporal dead zone for every line of boot
   * above this one and reset() is reachable from several of them.
   */
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

  function frame(nowWall) {
    requestAnimationFrame(frame);
    try {
      frameBody(nowWall);
    } catch (e) {
      if (!frameFault) {
        frameFault = e;
        const message = (e && e.message) ? e.message : String(e);
        /* Recorded for the bug report, which is the one path that carries a
         * fault off this machine. */
        window.__frameFault = { message, stack: e && e.stack ? String(e.stack) : '', atMs: Math.round(performance.now()) };
        console.error('frame fault', e);
        try {
          ui.setBanner(str('main.the_simulator_hit_a_fault_and', { message }), true);
        } catch (inner) {
          /* The shell itself is the thing that broke. Nothing left to say
           * it with. */
        }
      }
      /* Keep wall time moving, or the frame after a reset steps the physics
       * by however long the pilot spent reading the banner. */
      prevWall = nowWall;
    }
  }

  function frameBody(nowWall) {
    /* Once a frame, whatever the window did since the last one. */
    applyResizeIfDirty();
    if (!mapReady) {
      /* Mid swap. Swallow the elapsed time rather than handing it to the
       * accumulator on the far side, or the first frame of the new map steps
       * the physics by however long the world took to build. */
      prevWall = nowWall;
      lobbyPanelFrame(nowWall);
      return;
    }
    dressCraft();
    alignTraffic();
    const blockStart = performance.now();
    lastWallDt = nowWall - prevWall;
    const dt = Math.min(lastWallDt, FRAME_DT_MAX);
    prevWall = nowWall;
    roomPoseMap = null;
    fps = fps * 0.95 + (dt > 0 ? 1000 / dt : 0) * 0.05;
    let frameSteps = 0;

    /*
     * The site's counters, once a frame, reading state this loop already
     * has rather than announcing anything of its own. `started` is the
     * flag the banner uses for "has this run left the ground", which is
     * exactly what a session is; `flying` is that and airborne and not
     * mid crash; `laps` is the race's own list and the module takes the
     * delta. It cannot reach the integrator: nothing below reads it, and
     * everything it does with the numbers is arithmetic and a beacon.
     */
    flightStats.tick(nowWall, {
      started: flownThisRun,
      /* Airborne, and not on the grass upside down: a minute spent in
       * crashflip waiting to be righted is not a minute of flying, and the
       * two turtle flags are already here to say so. */
      flying: flownThisRun && !landed && !crashed && !wrecked && !turtleWait && !turtleRecover,
      laps: race.laps.length,
    });
    /* The pilot's own flight time, written when enough is held or when
     * the last frame's steps were not flight (THE PILOT'S OWN FLIGHT TIME,
     * above); flightClockFlew is set again by this frame's step block. */
    if (flightClock.held() >= FLIGHT_COMMIT_MS || (!flightClockFlew && flightClock.held() >= 1000)) {
      commitFlightTime();
    }
    flightClockFlew = false;

    /* The seated world's note, released on the first frame of a flight and
     * not one frame earlier. See showCourseNotes. */
    if (heldNotes && ui.screen === 'flight') {
      notice = { text: heldNotes, untilMs: nowWall + 5600 };
      heldNotes = null;
    }

    input.poll(nowWall);
    /* A gamepad's swap buttons, in flight only: see padSwapButtons. Not
     * while the builder is building, on the same flight screen with the run
     * paused under it: there Y carries a gate and the shoulders walk its
     * hotbar. Its test flight is a flight, and swaps like one. */
    if (ui.screen === 'flight' && mode !== 'replay' && !(build && build.cameraLive)) {
      ui.pollFlightPad(input.padSwapButtons());
    }
    /* The title ends the run a swap held the world for. */
    if (worldHold && mode === 'title') {
      releaseWorldHold();
    }
    pollManualFlip();
    const launchNow = syncLaunchControl(nowWall);
    tickAirStart(dt, nowWall);
    input.forcePadRest = launchStaging;
    syncAngleMode();
    const samples = input.drain();
    for (const smp of samples) {
      rcPending.push(smp);
    }
    /* Recover must see a centred stick even while perched: sim.input
     * does not run when landed, and the banner would stick forever. */
    if (turtleRecover && !turtleWait && !turtleFlip.active) {
      const ch = samples.length ? samples[samples.length - 1] : input.channels;
      turtleHoldStick(ch.roll, ch.pitch);
    }
    if (
      mode === 'flight'
      && !crashed
      && !wrecked
      && stateCurr
      && !turtleFlip.active
      && (turtleWait
        || (plantUpZ(stateCurr) < TURTLE_INVERT_UPZ
          && plantSpeed(stateCurr) < TURTLE_SPEED
          && plantRateMag(stateCurr) < TURTLE_RATE))
    ) {
      pollTurtleSupport();
    } else if (!turtleWait && !turtleFlip.active) {
      turtleOnSupport = false;
    }
    if (
      mode === 'flight'
      && !poseLock
      && !crashed
      && !wrecked
      && stateCurr
      && !turtleWait
      && !turtleFlip.active
    ) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    /*
     * A sample taken while the integrator is not running has no RC slot to
     * land in: the title screen, a pause, every second the craft sits
     * perched, and a turtle wait. Keep the newest, so the first flying
     * flying frame starts from where the sticks actually are, and drop
     * the rest. Without this the queue grew for as long as the page was
     * open, at the 100 ms heartbeat alone, and the first frame of flight
     * had to walk all of it.
     */
    const turtleParkedNow = isTurtleParked();
    if (mode === 'flight' && !poseLock) {
      setTurtleParkMotors(turtleParkedNow || turtleRecover);
    }
    if (!(mode === 'flight' && !landed && !turtleParkedNow && !crashed) && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    /* Hard bound, whatever else happens. */
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    /* Every other way onto the ground is a landing (a perch, a caught
     * discus, a turtle righted, a launch stand): the same hold as a spawn,
     * which a perch has already satisfied, since it needs the throttle at
     * TAKEOFF_RELEASE or below. */
    if (landed && !landedWas) {
      input.holdThrottleLow(TAKEOFF_RELEASE);
    }
    landedWas = landed;
    if (mode === 'flight' && landed && !crashed && !wrecked) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      /* Afloat, an aircraft on floats is never parked: water moves, so it
       * is let go onto the water at once and rocks there. */
      if (landed && floatsOnWater()) {
        releaseOnWheels();
      } else if (landed && thr > TAKEOFF_THROTTLE && !(raceHoldMs > 0)) {
        if (airframeById(runAirframe).gear) {
          /* On wheels, throttle up is the takeoff roll. */
          releaseOnWheels();
        } else if (airframeById(runAirframe).fixedWing) {
          /* Throttle up on a wing that is down is the hand throw. */
          throwWing();
        } else if (turtleRecover) {
          /* Recover owns the stick. Throttle is not takeoff until they
           * centre, or the leftover punch flies them out of turtle. */
        } else if (stateCurr && plantUpZ(stateCurr) < 0) {
          /* Props down: throttle is not takeoff. Unfreeze into turtle
           * if they are seated, otherwise let them fall. */
          landed = false;
          takingOff = false;
          flownThisRun = true;
          adoptSimClock();
          tryEnterTurtle(
            stateCurr,
            turtleInContact() || sim.e.sim_ground_contacts() > 0,
          );
        } else {
          /* Off again. The RC frame grid rides the SIM's own clock, which
           * froze with the integrator, so it is already seated; this re-pin
           * is belt and braces against any future path that moves rcNextMs
           * while the craft is down. Stamping the grid from the lap clock
           * here is the bug that made every second spent parked into a
           * second of stick lag. */
          landed = false;
          takingOff = true;
          takeoffUntil = nowWall + TAKEOFF_WINDOW_MS;
          flownThisRun = true;
          adoptSimClock();
          if (typeof audio.event === 'function'
            && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
            groundCueAtWall = nowWall;
            audio.event('takeoff');
          }
        }
      }
    }
    if (mode === 'flight' && crashed && nowWall >= clipCrashUntil) {
      finishClipCrash();
    }
    if (mode === 'flight' && crashed) {
      /* Hold the glitch pose so Crashed can be read, then reset(). */
      acc += dt;
      const holdSteps = Math.floor(acc / MS_PER_STEP);
      acc -= holdSteps * MS_PER_STEP;
    } else if (mode === 'flight' && ui.screen === 'flight' && turtleParkedNow && !poseLock) {
      /* Inverted wait or the scripted flip: do not step the plant.
       * The lap clock still runs. Pause freezes the flip where it is. */
      stepTurtleFrozen(dt);
    } else if (mode === 'flight' && !landed && !poseLock) {
      /* The module is the source of truth. If sim_init ran and JS time was
       * left behind, raising ts to lastTs would stamp every sample seconds
       * into the future. Snap the shell to step_index instead. */
      const moduleIdx = Math.round(readState()[0] * SIM_HZ);
      if (simStepIdx !== moduleIdx) {
        acc = 0;
        simStepIdx = moduleIdx;
        pinRcGrid();
        takingOff = false;
        turtleRecover = false;
        sim.rest();
        stateCurr = readState();
        statePrev = stateCurr;
        if (plantUpZ(stateCurr) < 0) {
          landed = false;
          setCrashflip(false);
        } else {
          landed = true;
          setCrashflip(false);
        }
      } else {
      scoring = view.mode === 'freestyle' && !crashed;
      let peakGroundClosing = 0;
      let peakGroundSpeed = 0;
      let sawGroundHit = false;
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      /* No clamp on steps: dt is already capped at 100 ms where it is
       * read, and acc carries less than 1 ms forward, so this cannot ask
       * for more than 100 steps. The cap belongs on the wall clock, in one
       * place, not on three copies of its consequence. */
      /* Resample the polled stick values onto a fixed RC frame grid. The
       * display runs at whatever rate it runs at; the radio does not, and
       * the controller's feedforward and smoothing read the frame
       * interval directly. */
      const blockEndSim = (simStepIdx + steps) * MS_PER_STEP;
      /*
       * Wall clock to sim clock, re-derived every frame rather than carried:
       * a sample taken (nowWall - wallT) ms ago belongs that many ms before
       * the end of the block this frame is about to step. The sim clock and
       * the wall clock advance together while flying, and this mapping
       * self corrects across the freezes where they do not.
       */
      const wallToSim = blockEndSim - nowWall;
      /* Take every sample whose moment has arrived; hold the last one. This
       * is the receiver holding its last frame, so a lost packet needs no
       * separate handling: it is simply a frame that is never emitted. */
      const pickAt = (atMs) => {
        while (rcPending.length > 0 && rcPending[0].wallT + wallToSim <= atMs) {
          rcHeld = rcPending.shift();
        }
        return rcHeld;
      };
      if (rcLink.isPerfect()) {
        /*
         * No radio. Kept as its own path and not routed through the link so
         * that the default, and every recording made under it, is exactly
         * the code that produced them: an exact grid, one frame per slot.
         */
        const framePeriod = 1000 / RC_HZ;
        while (rcNextMs < blockEndSim) {
          const held = pickAt(rcNextMs);
          /* Stamp the grid, never lastTs. lastTs was the round 16b /
           * tune-swap amplifier: a leftover second became every sample's
           * timestamp. */
          const ts = rcNextMs / 1000;
          lastTs = ts;
          const ax = applyTurtleRc(held.roll, held.pitch);
          traceInput(ts, ax[0], ax[1], held.yaw, held.throttle);
          const inCode = sim.input(ts, ax[0], ax[1], held.yaw, held.throttle);
          if (inCode !== SIM_OK) {
            adoptSimClock();
            break;
          }
          rcNextMs += framePeriod;
        }
      } else {
        /*
         * A radio. The link owns the slot clock while it runs, so its rate
         * rather than RC_HZ decides the cadence, and it hands back packets
         * already sorted into arrival order with their transport delay and
         * jitter applied. sim_input requires non decreasing timestamps and
         * jitter can reorder two adjacent packets, so anything that still
         * lands behind the last stamp is dropped rather than rejected by
         * the module.
         */
        for (const pkt of rcLink.pump(blockEndSim, pickAt)) {
          const ts = pkt.tMs / 1000;
          if (ts < lastTs) {
            continue;
          }
          lastTs = ts;
          const ax = applyTurtleRc(pkt.rc.roll, pkt.rc.pitch);
          traceInput(ts, ax[0], ax[1], pkt.rc.yaw, pkt.rc.throttle);
          const inCode = sim.input(ts, ax[0], ax[1], pkt.rc.yaw, pkt.rc.throttle);
          if (inCode !== SIM_OK) {
            adoptSimClock();
            break;
          }
        }
        rcNextMs = rcLink.nextMs;
      }
      if (steps >= 1) {
        /* A plant fault (plantFault) put the plant back at its first step
         * and the shell's step count with it, part way through the block. */
        let faulted = false;
        if (launchStaging) {
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
          /* The stand is stepped by the same plant, so its state is judged
           * at the same boundary (plantFault): a bad one wrecks the craft
           * where the block began, and the reset in that ends the staging. */
          const bad = plantStateSound(statePrev) ? (plantStateSound(stateCurr) ? null : stateCurr) : statePrev;
          if (bad) {
            plantFault(bad, sound, nowWall);
            faulted = true;
          } else if (plantUpZ(stateCurr) < 0) {
            endLaunchStaging(false);
            takingOff = false;
          }
        } else {
          let stNow = stateCurr;
          /*
           * Inbound closing has to be sampled BEFORE sim_step. Ground
           * contact runs inside the 1 ms step, so by the time the frame
           * ends the hull has already bounced and vz is upward. Using
           * end-of-frame descent for the OSD meant a real hit never
           * announced: the bounce finished inside the same batch.
           */
          peakGroundClosing = 0;
          peakGroundSpeed = 0;
          sawGroundHit = false;
          roomPoseFrame(nowWall, lastWallDt, dt);
          for (let i = 0; i < steps; i += 1) {
            stNow = roomMidairStep(stNow);
            if (groundNormalDue(stNow)) {
              sampleGroundNormalFromState(stNow);
            }
            const vzBefore = stNow[6];
            const spdBefore = Math.sqrt(
              stNow[4] * stNow[4] + stNow[5] * stNow[5] + stNow[6] * stNow[6],
            );
            raiseGroundFromState(stNow);
            if (runDamage) {
              crashBeforeStep(stNow);
            }
            tracePre(stNow);
            const sound = stNow;
            sim.step(1);
            stNow = readState();
            if (!plantStateSound(stNow)) {
              plantFault(stNow, sound, nowWall);
              stNow = stateCurr;
              faulted = true;
              break;
            }
            roomPoseStep(stNow, (steps - 1 - i) * MS_PER_STEP);
            if (roomCombat.out()) {
              combatStep(stNow);
            }
            if (runDamage) {
              crashAfterStep(stNow);
            }
            logObstacleStep(stNow);
            if (scoring) {
              /* Body rates, the two quaternion components the attitude test
               * needs, and speed. Nothing is allocated and nothing is
               * converted: the detector works in the plant's own frame. */
              /*
               * The last three are the craft's position in the WORLD frame,
               * which is where the obstacles are. poseFromState is the
               * shell's own conversion through frame.js, so nothing new
               * crosses the frame boundary here.
               */
              poseFromState(stNow, scorePos);
              /*
               * And where the nose is pointing, in the same frame. An Orbit
               * is defined by keeping the object on the screen, and without
               * a heading the recogniser cannot tell one from an ordinary
               * banked turn that happens to go round twice. Both go through
               * frame.js, so nothing new crosses the frame boundary.
               */
              simQuatToThree(stNow[7], stNow[8], stNow[9], stNow[10], scoreQuat);
              scoreQuat.premultiply(qSpawn);
              scoreFwd.set(0, 0, -1).applyQuaternion(scoreQuat);
              scoreUp.set(0, 1, 0).applyQuaternion(scoreQuat);
              trickDetector.step(
                0.001, stNow[11], stNow[12], stNow[13], stNow[8], stNow[9],
                Math.sqrt(stNow[4] * stNow[4] + stNow[5] * stNow[5] + stNow[6] * stNow[6]),
                scorePos.x, scorePos.y, scorePos.z,
                scoreFwd.x, scoreFwd.y, scoreFwd.z,
                scoreUp.x, scoreUp.y, scoreUp.z,
              );
            }
            /* The solid world, on the sim clock. stateCurr is what the
             * pass reads and writes, so it is kept level with stNow
             * across the call. */
            obsPhase += 1;
            if (obsPhase >= OBSTACLE_STEP) {
              obsPhase = 0;
              stNow = jellyPass(stNow);
              stateCurr = stNow;
              stNow = obstacleContactPass(stNow, trafficMs(simTimeMs + (i + 1) * MS_PER_STEP));
              if (obsResolved) {
                /* The pose moved under the interpolator. Collapse it
                 * rather than lerping the craft back through the wall
                 * it was just taken out of. */
                statePrev = stNow;
              }
            }
            if (i === steps - 2) {
              statePrev = stNow;
            }
            if (sim.e.sim_ground_contacts() > 0 || wheelsLoaded()) {
              groundContactSteps += 1;
            }
            if (sim.e.sim_ground_contacts() > 0) {
              sawGroundHit = true;
              const inbound = -vzBefore;
              if (inbound > peakGroundClosing) {
                peakGroundClosing = inbound;
              }
              if (spdBefore > peakGroundSpeed) {
                peakGroundSpeed = spdBefore;
              }
            }
          }
          if (steps === 1) {
            statePrev = stateCurr;
          }
          stateCurr = stNow;
        }
        simTimeMs += steps * MS_PER_STEP;
        if (!faulted) {
          simStepIdx += steps;
        }
        frameSteps = steps;
        /* The pilot's flight time: the steps the plant just took, if they
         * were flight (src/share/flighttime.js stepsAreFlight). */
        flightClockFlew = stepsAreFlight({
          mode, screen: ui.screen, landed, launchStaging, faulted, crashed, wrecked, turtleWait, turtleRecover,
        });
        flightClock.note(steps * MS_PER_STEP, {
          airborne: flightClockFlew, airframe: runAirframe, activity: flightActivity(),
        });
        /* Launch stand constraint runs inside sim_step. Ground contact
         * runs after plant_step at 1 kHz when the plane is raised. */
        flightLog.push(stateCurr, rcHeld, FULL_THROTTLE_RPM);
      }
      /*
       * Ground is a plane in the plant, not a sphere test after the
       * frame. height() still picks the deck vs the street (fromY is the
       * craft centre minus SURFACE_BIAS, the same rule that stopped the
       * overbridge from becoming a floor for a quad flying under it).
       * Perch freezes the integrator only when the hull is upright, slow
       * and in contact. Everything else keeps stepping: a skip, a slide,
       * a tumble. Turtle waits until inverted, seated and still, then
       * a pitch or roll poke plays a guaranteed flip.
       */
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
      const uClamp = upz > 1 ? 1 : upz < -1 ? -1 : upz;
      const tiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
      const speed = Math.sqrt(
        stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
      );
      const rate = plantRateMag(stateCurr);
      lastDescent = -stateCurr[6];
      lastTiltDeg = tiltDeg;
      lastGroundHits = hits;
      lastClearance = clearance;
      lastUpz = upz;
      speedNow = speed;
      turtleOnSupport = hits > 0;
      if (takingOff) {
        /*
         * A LEAVING TEST, not a height. clearance - REST_HEIGHT > 0.05
         * assumed a level hull: REST_HEIGHT is the level craft's reach
         * below its own centre, and a craft leaving a stand is not level.
         * At 28 degrees the hull reaches 0.10 m down, so the old test
         * called the departure finished while the plant was still
         * reporting contacts, and everything downstream that trusts
         * `takingOff` was reading a craft that had not left. vHalfFrame is
         * this frame's own tilt aware extent, and hits and sawGroundHit
         * are what the plant actually saw across the frame's steps.
         */
        if (hits === 0 && !sawGroundHit && clearance > vHalfFrame + 0.05) {
          takingOff = false;
          lcBoost = false;
        } else if (!lcBoost) {
          const thrNow = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
          /* TAKEOFF_RELEASE, not TAKEOFF_THROTTLE. Coming back down to the
           * same number that sent the craft up is what let one thumb
           * position sit on both sides of the latch. */
          if (thrNow <= TAKEOFF_RELEASE && hits > 0 && canPerch(tiltDeg, speed, rate)) {
            takingOff = false;
          }
        }
      }
      if (
        !launchStaging
        && !takingOff
        && hits > 0
        && canPerch(tiltDeg, speed, rate)
        && !turtleWait
        && !turtleFlip.active
        /* Not while a broken part is still flying: resting the plant
         * would freeze it in the air. Not a wreck with its pack in
         * either: a perch holds the craft by not stepping it, and a
         * wreck may not be released by the throttle, so the sticks would
         * stop moving what is left of it. Read from the plant now, not
         * from crashFrame's copy, which is a frame behind the steps just
         * taken. */
        && !(runDamage && damage.freeBodies() > 0)
        && !(runDamage && liveWreck(damage.flags()))
      ) {
        sim.rest();
        landed = true;
        takingOff = false;
        adoptSimClock();
        groundY = surf;
        stateCurr = readState();
        statePrev = stateCurr;
        acc = 0;
        if (typeof audio.event === 'function'
          && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
          groundCueAtWall = nowWall;
          audio.event('land');
        }
      } else if (
        (hits > 0 || sawGroundHit)
        && nowWall - groundBounceAtWall > BOUNCE_COOLDOWN_MS
      ) {
        const closing = peakGroundClosing;
        /*
         * peakGroundSpeed alone. It floored on `speed`, the END OF FRAME
         * total speed, which no contact in the frame need ever have had: a
         * frame that brushed the grass at 0.1 m/s and finished at 6 m/s
         * scored a 6 m/s hit and played the crash cue for it. Worse, the
         * frame is wall time and dt is capped at 100 ms, so how hard the
         * hit sounded depended on the frame rate, which is the one thing
         * CLAUDE.md says must never reach the game. Both numbers here are
         * now sampled at a step that actually reported contact.
         */
        const hitSpeed = peakGroundSpeed;
        if (closing >= GRAZE_SPEED_MAX || hitSpeed >= GRAZE_SPEED_MAX) {
          bounceCount += 1;
          /*
           * The ground, for scoring, on the line collide.js has already
           * drawn rather than a new one: under BOUNCE_SPEED_MAX the bounce
           * model applies and hitOutcome calls it a bounce, at or over it
           * hitOutcome calls it a crash. So a bounce is a BUMP and a crash
           * bails the combo. No third threshold, because a third threshold
           * is a number nobody can defend six months later.
           */
          const hard = closing >= BOUNCE_SPEED_MAX || hitSpeed >= BOUNCE_SPEED_MAX;
          /*
           * THE SITE'S CRASH COUNT IS THIS LINE, IN EVERY MODE. The shell has
           * exactly one defended definition of a crash, the ceiling collide.js
           * draws at BOUNCE_SPEED_MAX, and the scorer below reads it only in
           * freestyle because a race map never touches the scorer. The
           * statistics are not the scorer: a pilot who puts a five inch into
           * the grass at ten metres a second on a race track has crashed,
           * and the board's counter used to hear only the clip-through
           * catch, which is a glitch recovery, so it read nought for a day
           * of flying. Turtle entry is NOT counted as well, because it is
           * what a hard hit usually leads to and would count the same crash
           * twice. See src/share/stats.js.
           */
          if (hard) {
            flightStats.noteCrash();
            if (crashCam) {
              crashCam.noteCrash('ground');
            }
          }
          if (view.mode === 'freestyle') {
            if (hard) {
              trickDetector.reset();
              score.crash();
            } else {
              /* NOT TAPPABLE: this is the ground. See TrickDetector.bump. */
              trickDetector.bump(undefined, false);
            }
          }
          /* No banner. The owner's instruction: the sound is enough, and
           * so is the feel. Naming the thing you just hit on screen tells
           * a pilot what they already watched happen, and it does it over
           * the top of the next gate. */
          feelImpact(closing > hitSpeed ? closing : hitSpeed, 'ground');
        }
        groundBounceAtWall = nowWall;
      }
      }
    } else if (mode === 'flight' && landed) {
      /*
       * Sitting on the ground. The integrator does NOT step: a perch is
       * rest, so the craft is held by not advancing it. sim_rest zeroed
       * velocity at the judgement, so a takeoff resumes from a true rest
       * state. The lap clock DOES keep running.
       */
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      simTimeMs += steps * MS_PER_STEP;
      /*
       * THE TWO CLOCKS HAVE TO STAY LEVEL.
       *
       * simTimeMs advances here and the recogniser is not stepped, because
       * a quad sitting on the grass must not score a Yaw Spin off the gyro
       * noise. But the SCORER is ticked on simTimeMs and measures its combo
       * window from a trick's endMs, which is on the recogniser's clock, so
       * letting the two drift apart meant that after three seconds on the
       * ground every combo banked on the very next tick at a multiplier of
       * one. Every run starts landed, so every run started with them apart.
       *
       * idle() advances the clock and the stall counter and reads no motion
       * at all, which is the truth about a craft that is not moving.
       */
      trickDetector.idle(steps * MS_PER_STEP);
      adoptSimClock();
      statePrev = stateCurr;
    }

    /* Render: interpolate the two most recent physics states. The sim
     * flies about its own origin; the start gate placement is a render
     * side offset and rotation, so nothing about the trajectory changes. */
    const a = Math.max(0, Math.min(1, acc));
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
    /* The world ground under the spawn, added after the conversion for the
     * same reason as the probe above. */
    pCurr.y += startY;
    qPrev.premultiply(qSpawn);
    if (landed && !poseLock) {
      /* The frozen state's centre is at the surface plus the craft's tilt
       * aware vertical half extent, within millimetres of REST_HEIGHT, but
       * the terrain under it may differ from where contact tripped. Seat
       * the render on the resolved ground so a landing looks like a
       * landing. Render only: the physics state is untouched.
       *
       * On a launch stand the rails are pitched, so the parked pose is too:
       * REST_HEIGHT is along the ramp normal, which is why it is scaled by
       * cos(pitch), and a local nose-down rotation puts the arms on the
       * foam. Crash recovery on grass keeps startPitch at 0 and this
       * reduces to the old seating. */
      pCurr.y = groundY + simLenToWorld(REST_HEIGHT) * Math.cos(startPitch);
      if (startPitch) {
        qPad.setFromAxisAngle(AXIS_X, -startPitch);
        qPrev.multiply(qPad);
      }
      /* A plane on its gear parks tail down, nose up, as it will stand
       * the moment throttle lets it go. */
      const parkedGear = restPose();
      if (parkedGear) {
        qPad.setFromAxisAngle(AXIS_X, parkedGear.restPitch);
        qPrev.multiply(qPad);
      }
      /* One on a catapult waits on the rail, nose up at the rail's angle
       * and the rail's height over the ground, which is where the plant
       * is put the moment it is let go. Only before its first flight of
       * the run: after that it is wherever it came down. */
      const parkedCat = airframeById(runAirframe).catapult;
      if (parkedCat && !flownThisRun) {
        qPad.setFromAxisAngle(AXIS_X, (parkedCat.pitchDeg * Math.PI) / 180);
        qPrev.multiply(qPad);
        pCurr.y += simLenToWorld(parkedCat.height - REST_HEIGHT);
      }
    }
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
    /* Not in the replay editor: the plant is held, and the replay draws a
     * wreck of its own over the live one, which is left as it was. */
    if (mode !== 'replay') {
      crashFrame(nowWall, dt);
    }
    smokeFrame();
    if (crashCam) {
      crashCam.record(nowWall);
    }

    /*
     * The solid world was resolved inside the step loop above, on the sim
     * clock, once every OBSTACLE_STEP milliseconds. See
     * obstacleContactPass. What is left here is reading what it found.
     *
     * A perch or a turtle freeze does not step the plant, so the pass
     * never runs in those states and a hull that sat down inside a wall
     * would go unmeasured. That one case is still queried at frame rate,
     * below, because there is no sim clock advancing to hang it on.
     */
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    let leftoverOverlap = obsLeftover;
    let interiorDepth = obsInterior;
    let roofContact = obsRoof;
    const frameContact = obsContact;
    const frameTouched = obsTouched;
    const frameClosing = obsClosing;
    if (obsRoof) {
      turtleOnSupport = true;
    }
    /*
     * THE RECOGNISER IS TOLD ON CONTACT, not on impulse.
     *
     * Separate from the bounce cue below, which stays on obsImpulse
     * because that is what the pilot hears and feels and changing it would
     * change the feel. A Wall Tap, Wall Ride, Loop Tap and Downtown Tap
     * all need to know the hull touched something; whether the solver had
     * any normal velocity left to solve is not their business. Classified
     * on the closing speed, so GRAZE_SPEED_MAX still separates the
     * deliberate touch from the smack it was written to separate it from.
     */
    if (view.mode === 'freestyle' && frameTouched
      && simTimeMs - trickTouchAtSimMs >= BOUNCE_COOLDOWN_MS) {
      trickTouchAtSimMs = simTimeMs;
      trickDetector.bump(frameClosing);
    }
    if (obsImpulse > 0) {
      /* One cue per frame at the hardest impulse the pass applied, not one
       * per contact: a corner is two faces in the same millisecond and
       * firing twice reads as a stutter rather than as a harder hit. The
       * cooldown that used to gate this is gone with the banner it was
       * really protecting. */
      if (nowWall - bounceAtWall >= BOUNCE_COOLDOWN_MS || obsImpulse > lastImpulse * 1.6) {
        bounceCount += 1;
        feelImpact(obsImpulse, obsImpulseKind);
        /* The workbook's BUMP: "complete trick, but tapped a gate, wall or
         * the ground without disarming". Half the trick's points and half
         * the streak, and the combo survives, because in the air a clipped
         * branch is not a bail. */
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
    if (
      mode === 'flight'
      && !launchStaging
      && !crashed
      && (landed || turtleParkedNow)
    ) {
      /* Level pancake: the last flying vHalfFrame can be a banked fat
       * query. */
      const rest = view.colliders.hit(
        pCurr.x, pCurr.y, pCurr.z,
        pCurr.x, pCurr.y, pCurr.z,
        craftVerticalHalf(0),
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
        craftVerticalOffset(),
      );
      if (rest >= 0) {
        leftoverOverlap = true;
        interiorDepth = view.colliders.interiorOfHit(pCurr.x, pCurr.y, pCurr.z);
        if (!(interiorDepth > CLIP_CENTER_EPS) && view.colliders.hitNy > 0.5) {
          roofContact = true;
        }
      }
    }

    /* Sim milliseconds elapsed since the last frame. Clamped the same way
     * the wall delta is, and never negative, so a reset that puts the lap
     * clock back to zero cannot hand a watch a negative age. */
    let simStepMs = simTimeMs - simClockPrevMs;
    if (!(simStepMs > 0)) {
      simStepMs = 0;
    } else if (simStepMs > 100) {
      simStepMs = 100;
    }
    simClockPrevMs = simTimeMs;

    if (mode === 'flight' && !poseLock) {
      const hy = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS);
      const buriedDepth = hy > pCurr.y ? hy - pCurr.y : 0;
      /* Ticked on the SIM clock, not the wall clock. Every threshold in
       * the watch is a duration, and while it counted frame deltas a
       * stutter aged it as fast as real time did: a machine that dropped
       * to 8 fps could confirm a 180 ms clip in two frames of a craft that
       * had barely moved. frameSteps is the milliseconds the plant
       * actually advanced, which is what those thresholds meant all along.
       * On a perch or a turtle the plant is frozen but the lap clock still
       * runs, and simTimeMs advances with it, so this stays honest there
       * too. */
      const clipKind = clipWatchTick(clipWatch, {
        landed,
        turtle: turtleWait || turtleFlip.active,
        launchStaging,
        /* A wreck is not a glitch to recover from: it lies where it lies. */
        hold: crashed || wrecked,
        poseLock,
        /*
         * `&& landed` used to be here, which switched the spawn grace off
         * at the exact moment it was needed: it exists to ignore leftover
         * overlap with a stand, a pole or a pad, and leftover overlap is
         * what a craft LEAVING one has. The departure window is in for the
         * same reason.
         */
        spawnGrace: nowWall < clipGraceUntil
          || nowWall < recoverGraceUntil
          || nowWall < takeoffUntil,
        takingOff,
        unresolved: leftoverOverlap,
        roofContact,
        interiorDepth,
        buriedDepth,
        contact: frameContact,
        rateMag: plantRateMag(stateCurr),
        throttle: input.channels.throttle,
        x: pCurr.x,
        y: pCurr.y,
        z: pCurr.z,
      }, simStepMs);
      if (clipKind) {
        beginClipCrash(clipKind, nowWall);
      }
    }

    if (
      mode === 'flight'
      && !poseLock
      && !launchStaging
      && !crashed
      && !wrecked
      && stateCurr
      && !turtleWait
      && !turtleFlip.active
    ) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    if (isTurtleParked() && !turtleParkedNow) {
      setTurtleParkMotors(true);
    }

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (mode === 'flight' && !launchStaging && !crashed) {
      if (raceHasPrev) {
        /* The race's state from before this frame's travel is scored, so
         * the ghost bookkeeping can see a lap boundary without the race
         * having to announce one. */
        const lapStartBefore = race.lapStartMs;
        const lapsBefore = race.laps.length;
        const allowPass = shouldScorePass(racePrev, pCurr, {
          upz: lastUpz,
          clearance: lastClearance,
          hits: lastGroundHits,
          heightAt: (x, z, y) => view.height(x, z, y - SURFACE_BIAS),
        });
        const res = race.update(racePrev, pCurr, simNow, nowWall, allowPass);
        if (res.passed != null) {
          roomRacePass(res.passed, lapsBefore, simNow);
          view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
          if (typeof audio.event === 'function') {
            audio.event('gate');
          }
        }
        ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, res.passed != null);
        /* XP and the challenges, never for a builder's test flight but
         * the casual sky track's, which is flown the moment it is made. */
        if (!race.freestyle && (!(build && build.testing) || ui.progress.isCasual(build.docId))) {
          if (res.passed != null) {
            ui.progress.gatePass();
          }
          if (race.laps.length > lapsBefore) {
            ui.progress.lap(progressCourse());
          }
        }
        /* A room's race ends on the room's laps, or when the room says it
         * is over (src/share/roomrace.js); a run alone on runLaps. */
        const roomOver = roomRun() && (roomRace.done() || roomRace.race().state === 'results');
        if (!race.freestyle && (roomRun() ? roomOver : race.lap >= runLaps)) {
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
          if (roomRun()) {
            roomShowResults();
            if (roomRace.race().state === 'results') {
              roomRaceRunId = null;
            }
          } else {
            ui.showResults(race.log, race.bestMs, race.recordAtStart, ghostResultNote());
          }
        }
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
      /* This frame becomes the seed for a lap that starts on the next one. */
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

    /* Airtime, for the freestyle display: the simulation clock since this
     * run began, which is what a pilot flying a pack wants beside the pack
     * bar. It reads on the sim clock for the same reason a lap does, so a
     * frame hitch cannot spend a pilot's battery for them. */
    airtimeMs = simTimeMs;

    /*
     * The world is the title picture, the flight picture, the pause
     * picture, the finish picture and the map-card recorder. Settings
     * and How to fly hide it. The studio on Settings is a second
     * context and must not exist while this one is composing a world
     * the player is flying. visibility:hidden, not display:none: some
     * GPUs drop a context that leaves the document.
     */
    const freezeWorld = Boolean(ui.reelFreezeWorld);
    /*
     * The attract shot runs behind the launch card too.
     *
     * worldLive listed title, courses, flight, paused and results, so the
     * one screen between the title and the flight was the one screen with
     * the canvas hidden: a pilot went from a world, to a flat dark panel,
     * to the same world again, and the card in the middle read as a load
     * rather than as a step. The title already proves a panel can sit over
     * a live field, and this card has less on it than the title does.
     */
    const attractOn = !freezeWorld && mode === 'title'
      && (ui.screen === 'title' || ui.screen === 'launch');
    /* The aircraft picker draws its models into this canvas over the world
     * (src/render/carousel3d.js), so while it is up the world is live
     * whatever screen is under it, and the Quad screen's studio, which is a
     * second context, is put away rather than drawn unseen behind it. */
    const pickerOn = ui.carousel.isOpen || ui.hangar.isOpen;
    const studioOn = ui.screen === 'quad' && !pickerOn;
    const worldLive = !freezeWorld && (
      Boolean(finishLoadingOnFrame)
      || mode === 'flight'
      || mode === 'paused'
      || mode === 'replay'
      || mode === 'results'
      || ui.screen === 'courses'
      || attractOn
      || pickerOn
      || Boolean(camOverride)
      || Boolean(warIntro)
    );
    const wantVis = worldLive ? 'visible' : 'hidden';
    if (shell.canvas.style.visibility !== wantVis) {
      shell.canvas.style.visibility = wantVis;
    }

    /* Prop discs spin at a visibly aliased fraction of true RPM, the way
     * they read on a real FPV feed. The blades follow. On the title the
     * plant is frozen, so a cruise spin stands in for flight; a crawl is
     * left for the pad shot so the model is not frozen there either. */
    const titleSpin = attractOn || (mode === 'title' && worldLive) || mode === 'results';
    for (let m = 0; m < 4; m += 1) {
      const vis = titleSpin
        ? 0.38 + input.channels.throttle * 0.42
        : stateCurr[14 + m] * 1e-4 + (shell.quad.visible ? 0.10 : 0);
      shell.discs[m].rotation.y += vis;
      if (shell.blades) {
        const dir = shell.propSpin ? shell.propSpin[m] : 1;
        shell.blades[m].rotation.y += vis * dir;
      }
    }
    /* A folding prop folds from the plant's motor rate, which the plant
     * sets to exactly zero when it has stopped and folded it; after the
     * spin above, so a folded rotor stays parked whatever it was given. */
    if (shell.setProp) {
      shell.setProp(stateCurr[14]);
    }
    if (shell.cameraMount) {
      shell.cameraMount.rotation.x = cameraTiltRad(camTilt);
    }
    /* The wing's stabiliser follows the seated tune: the mode the tune
     * names, off otherwise. Compared here rather than pushed from every
     * place the tune changes, because there are five of those. */
    if (typeof sim.e.sim_wing_set_stab === 'function') {
      const wantStab = tuneById(configId).wingStab || 0;
      if (wantStab !== wingStabApplied && sim.e.sim_wing_set_stab(wantStab) === SIM_OK) {
        wingStabApplied = wantStab;
      }
    }
    /* A fixed wing's surfaces follow the plant's, read back each frame:
     * left and right aileron (the wing's elevons), elevator, rudder, the
     * convention in src/native/sim_abi.h. Only a craft with surfaces has
     * the setter; the wing's takes the first two. */
    if (shell.setSurfaces) {
      if (!wingSurfPtr) {
        wingSurfPtr = sim.e.malloc(4 * 8);
      }
      if (sim.e.sim_plane_surfaces(wingSurfPtr) === SIM_OK) {
        const out = new Float64Array(sim.e.memory.buffer, wingSurfPtr, 4);
        shell.setSurfaces(out[0], out[1], out[2], out[3]);
      }
    }
    /* And the flaps, where the plant has moved them, trailing edge down. */
    if (shell.setFlaps && typeof sim.e.sim_wing_flaps === 'function') {
      shell.setFlaps(sim.e.sim_wing_flaps());
    }
    /* And the retracts, where the plant has them, 0 down to 1 up. */
    if (shell.setGear && typeof sim.e.sim_wing_gear === 'function') {
      shell.setGear(sim.e.sim_wing_gear());
    }
    poseBramorExtras();
    discusCue(nowWall);
    roomFrame(nowWall, dt / 1000);
    /* The others as the room just drew them, into the row the crash cam
     * began above (src/replay/peers.js). */
    if (crashCam) {
      crashCam.recordPeers(roomPeers, roomTagBubble.drawn());
    }

    /* The lens sits where a quad model bolts it, forward AND up, not at the
     * centre of gravity's height. src/render/lens.js carries both numbers and
     * the reason. camUp is the craft's own up, so the offset rolls with it. */
    camFwd.set(0, 0, -1).applyQuaternion(qPrev);
    camUp.set(0, 1, 0).applyQuaternion(qPrev);
    fpvPos.copy(pCurr)
      .addScaledVector(camFwd, simLenToWorld(camMountFwd))
      .addScaledVector(camUp, simLenToWorld(camMountUp));
    {
      /* Near plane is 0.2 m. Camera-down or inverted on the grass puts
       * the lens inside that band, so the terrain is clipped even when
       * the mount is a centimetre above the mesh. Lift only when the
       * picture looks into the dirt; a high inverted pass stays put. */
      const camFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS)
        + fpvLensClear(camFwd.y, camUp.y);
      if (fpvPos.y < camFloor) {
        fpvPos.y = camFloor;
      }
      lastCamFloor = camFloor;
      lastCamClear = fpvLensClear(camFwd.y, camUp.y);
      lastCamFwdY = camFwd.y;
      lastCamUpY = camUp.y;
    }
    const wantLift = (landed || launchStaging || turtleWait || turtleFlip.active) && !poseLock
      ? PARKED_LIFT
      : 0;
    parkedLift += (wantLift - parkedLift) * Math.min(1, dt * 0.006);
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    lastFpvY = fpvPos.y;
    /* A camera knocked askew in a crash turns on its mount, under the
     * uptilt: the horizon the pilot sees tilts by the knock. */
    fpvQuat.copy(qPrev);
    if (runDamage && cameraKnock(qKnock)) {
      fpvQuat.multiply(qKnock);
    }
    fpvQuat.multiply(qTilt);
    /*
     * Vibration, so the buzz the flight controller is fighting is something
     * the pilot can see. Driven by the motors' own speed out of the state
     * block, scaled the same way the gyro model scales it. Render only: it
     * moves the view, never the craft, so no trajectory depends on it.
     */
    {
      const rpmMean = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
      const shake = lensShake.update(dt, rpmMean / FULL_THROTTLE_RPM);
      /* Plus whatever the last contact threw the airframe by. The camera
       * is bolted to the frame, so a hit moves the picture; with the hit
       * banners gone this and the sound are the whole of what the pilot is
       * told. Decayed on the wall clock and added here, at the one place
       * that already rotates the lens, so it is render only and no
       * trajectory can depend on it. */
      decayImpactKick(dt);
      warShakeFrame(dt);
      qShake.setFromEuler(shakeEuler.set(
        shake.x + impactKick.x + warShake.x,
        shake.y + impactKick.y + warShake.y,
        shake.z + impactKick.z + warShake.z,
        'XYZ',
      ));
      fpvQuat.multiply(qShake);
    }

    if (mode !== 'results' && finishCamMs >= 0) {
      finishCamMs = -1;
    }

    /*
     * ONCE THE QUAD HAS ACTUALLY LEFT THE GROUND, THE PAD SHOT IS OVER.
     *
     * Throttle skipped the orbit and the approach, but it still played the
     * 1 s zoom, and the takeoff branch waits for nothing. So a pilot who
     * throttled up on the pad flew from a third person camera that was
     * still dollying in: measured airborne at 2.87 m with the airframe and
     * both prop discs across the bottom half of the frame. They are flying
     * a quad they cannot see out of, at the one moment they most need to.
     *
     * The test is `landed` rather than a phase of the shot, and that matters:
     * the throttle skip needs the stick to cross TAKEOFF_THROTTLE, and a
     * quad can leave the ground on a stick that never does. A capture found
     * exactly that, flying the whole orbit at 13.7 m. Airborne is airborne.
     *
     * It sits ABOVE the camera chain, not inside the intro's own branch,
     * because ending the shot has to release the camera in the same frame.
     * Inside the branch the next line adds dt and the shot came back to
     * life at 99 ms, which is how this ended up being written twice.
     *
     * A pilot who leaves the throttle down still gets the whole shot.
     */
    if (introMs >= 0 && mode === 'flight' && !landed) {
      introMs = -1;
    }

    fpvLensLive = false;
    const watching = mode === 'flight' || mode === 'paused' ? warWatch() : null;
    /* Done spectating: the chase camera's vectors were the teammate's. */
    if (!watching && watchCamSeat !== -1) {
      watchCamSeat = -1;
      chaseValid = false;
    }
    if (mode === 'replay') {
      /* The crash cam poses its own craft and points the camera. */
      shell.quad.visible = false;
      crashCam.frame(dt);
    } else if (mode === 'title') {
      if (worldLive && !camOverride) {
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
      /* Pull off the FPV lens onto a three-quarter of the frozen craft,
       * then sway. The airframe keeps the attitude it finished with. */
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
      const dist = Math.max(0.8, shell.camera.position.distanceTo(pCurr));
      const narrow = shell.camera.aspect < 0.95;
      shell.camera.translateX((narrow ? 0 : -0.20) * dist * pull);
      shell.camera.translateY((narrow ? -0.14 : -0.04) * dist * pull);
      const fov = ui.settings.cameraFov + (FINISH_FOV - ui.settings.cameraFov) * pull;
      if (Math.abs(shell.camera.fov - fov) > 0.05) {
        shell.camera.fov = fov;
        shell.camera.updateProjectionMatrix();
      }
    } else if (introMs >= 0 && (mode === 'flight' || mode === 'paused') && !camOverride) {
      if (mode === 'flight') {
        /* Punch-out skips the orbit and the approach. TAKEOFF_THROTTLE,
         * not a hair trigger: a resting gamepad axis at 0.08 used to skip
         * the shot entirely. */
        if (input.channels.throttle > TAKEOFF_THROTTLE && introMs < INTRO_FLY) {
          introMs = INTRO_FLY;
        }
        introMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
      }
      const orbitU = introEase(introMs / INTRO_ORBIT);
      const approachU = introEase((introMs - INTRO_ORBIT) / INTRO_APPROACH);
      const zoomU = introEase((introMs - INTRO_FLY) / INTRO_ZOOM);
      const theta = INTRO_THETA0 - INTRO_ORBIT_SPAN * orbitU;
      const radius = INTRO_ORBIT_RADIUS
        + (INTRO_APPROACH_RADIUS - INTRO_ORBIT_RADIUS) * approachU;
      const height = INTRO_ORBIT_HEIGHT
        + (INTRO_APPROACH_HEIGHT - INTRO_ORBIT_HEIGHT) * approachU;

      /*
       * THE ORBIT PLANE HAS TO BE LEVEL, AND IT USED TO INHERIT THE RAMP.
       *
       * This built its basis from camFwd, which is the CRAFT's forward, and
       * a craft parked on a launch block is pitched up the ramp by
       * startBlockDims().tilt, 28 degrees. So the whole orbit plane tilted
       * 28 degrees with it, and the camera dived below the craft for the
       * half of the sweep where sin(theta) is positive. The sweep ENDS at
       * theta = INTRO_THETA0 - 300 degrees, which is almost exactly where
       * sin(theta) = +1, so it ended at its lowest point every single time:
       * the camera finished the pan 0.138 m above the dirt with the block's
       * own deck at 0.247 m, which is inside the launch block, and the zoom
       * then dollied to the FPV lens from in there. That is the report,
       * "as camera pans into launch blocks, disappears into ground". On
       * flat ground camFwd is level, the term is zero and nothing showed.
       *
       * introFwd is the same heading flattened onto the ground plane, so
       * the shot keeps its shape and loses the ramp. introRight comes from
       * it by cross product rather than from qPrev, so the basis is
       * orthonormal and level by construction and a rolled craft cannot
       * tilt it either. On flat ground this is identical to what it was.
       */
      introFwd.copy(camFwd);
      introFwd.y = 0;
      if (introFwd.lengthSq() < 1e-6) {
        /* Nose straight up or down: no heading to flatten, so take the
         * spawn's. */
        introFwd.set(0, 0, -1).applyQuaternion(qSpawn);
        introFwd.y = 0;
      }
      introFwd.normalize();
      introRight.copy(introFwd).cross(introUp);
      introFrom.copy(pCurr)
        .addScaledVector(introRight, Math.cos(theta) * radius)
        .addScaledVector(introFwd, -Math.sin(theta) * radius)
        .addScaledVector(introUp, height);
      /* And the same floor the finish camera keeps, for the same reason:
       * the pad shot is deliberately low and the ground under it is not
       * flat, so a berm, a kerb or the block itself can still swallow the
       * lens. Queried the way every other ground test here is, so the
       * camera and the contact test cannot disagree about where the
       * surface is. */
      const introFloor = view.height(introFrom.x, introFrom.z, introFrom.y)
        + INTRO_FLOOR_CLEAR;
      if (introFrom.y < introFloor) {
        introFrom.y = introFloor;
      }
      /* Orbit looks at the airframe. Approach turns the look down the
       * course so the zoom is a dolly into the FPV camera, not a snap.
       * Level forward here too: aimed along the ramp it pointed at the sky
       * instead of at the course. */
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
      const fov = zoomU > 0
        ? fovMid + (ui.settings.cameraFov - fovMid) * zoomU
        : INTRO_FOV + (fovMid - INTRO_FOV) * approachU;
      if (Math.abs(shell.camera.fov - fov) > 0.05) {
        shell.camera.fov = fov;
        shell.camera.updateProjectionMatrix();
      }

      shell.quad.visible = zoomU < 0.88;
      if (introMs >= INTRO_TOTAL) {
        introMs = -1;
        shell.quad.visible = false;
        shell.camera.position.copy(fpvPos);
        shell.camera.quaternion.copy(fpvQuat);
        shell.camera.fov = ui.settings.cameraFov;
        shell.camera.updateProjectionMatrix();
      }
    } else if (watching) {
      /*
       * A SPECTATOR'S CAMERA: behind the watched teammate along the way it
       * is travelling, as the chase camera is, from the same smoothed
       * vectors; a new teammate snaps rather than sweeping across the map.
       */
      const peer = watching;
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
      shell.quad.visible = true;
      shell.camera.up.set(0, 1, 0);
      shell.camera.position.copy(chasePos);
      shell.camera.lookAt(chaseAnchor);
      if (Math.abs(shell.camera.fov - 70) > 0.05) {
        shell.camera.fov = 70;
        shell.camera.updateProjectionMatrix();
      }
    } else if ((airframeById(runAirframe).fixedWing && ui.settings.wingView !== 'fpv') || wreckWantsChase(nowWall)) {
      /*
       * A FIXED WING'S OTHER TWO VIEWS, both with the plane in the picture
       * and the horizon level. Render only: nothing here reaches the plant.
       *
       * Chase sits behind the plane along the way it is TRAVELLING, not
       * the way its nose points, so a loop or a roll reads as a loop or a
       * roll instead of spinning the camera round the plane, and trails it
       * by a quarter second so a turn has somewhere to go. Its distance
       * is scaled by the span, so the wing and the Skyhunter sit the same
       * size in the frame.
       *
       * Line of sight is a pilot standing beside the strip at eye height,
       * the way a real plane is flown from the ground, turning to keep the
       * plane in view. Beside, not behind: from behind the throw a plane at
       * eye level is edge on, a grey line in grey haze. The view narrows as
       * the plane goes out so it stays about the same size on screen, as an
       * eye does not but a screen of pixels has to.
       */
      shell.quad.visible = true;
      shell.camera.up.set(0, 1, 0);
      const span = airframeById(runAirframe).dims.bodyWidth;
      let fov = ui.settings.cameraFov;
      if (ui.settings.wingView === 'chase' || wreckWantsChase(nowWall)) {
        const k = 1 - Math.exp(-dt / 120);
        const water = craftOnWater();
        const afloat = Boolean(water && water.state[3] > 0);
        /* Eased in over 0.7 s as the floats settle, out over 0.25 s as
         * they leave: a plane climbing away at take off should have the
         * camera with it, not a metre below it catching up. */
        chaseLift += ((afloat ? 1 : 0) - chaseLift) * (1 - Math.exp(-dt / (afloat ? 700 : 250)));
        if (!chaseValid) {
          chaseWaterY = pCurr.y;
        }
        /* The swell's mean under the plane, 1.5 s of it, several swell
         * periods, and held still once the floats leave the water. */
        if (afloat) {
          chaseWaterY += (pCurr.y - chaseWaterY) * (1 - Math.exp(-dt / 1500));
        }
        /* A blend, not a lag: afloat the camera rides the mean, in the air
         * the plane itself, and between them a mix of the two. A filter
         * whose time constant shrank as the plane climbed away let the
         * camera sag behind the climb and then catch up, the small jolt
         * the owner felt at take off. */
        chaseAnchor.copy(pCurr);
        chaseAnchor.y += chaseLift * (chaseWaterY - pCurr.y);
        chaseStep.copy(chaseAnchor).sub(chaseLast);
        chaseStep.y *= 1 - chaseLift;
        if (!chaseValid) {
          chaseDir.copy(camFwd);
        } else if (chaseLift > 0.5 && chaseStep.length() < 0.3e-3 * dt) {
          /* Afloat and slower than 0.3 m/s the plane's track is the swell
           * drifting it about, not where it is going: stand behind its
           * nose instead. */
          introLook.copy(camFwd).setY(0);
          if (introLook.lengthSq() > 1e-6) {
            chaseDir.lerp(introLook.normalize(), 1 - Math.exp(-dt / 600)).normalize();
          }
        } else if (chaseStep.lengthSq() > 1e-6) {
          chaseDir.lerp(chaseStep.normalize(), Math.min(1, 1 - Math.exp(-dt / 120))).normalize();
        }
        chaseLast.copy(chaseAnchor);
        /* A wreck has no way it is travelling: a tumble or a fall would put
         * the camera straight overhead. Stand it off level instead, so the
         * wreck is seen from the side the pilot came from. */
        if (wreckWantsChase(nowWall)) {
          chaseDir.y = 0;
          if (chaseDir.lengthSq() < 1e-6) {
            chaseDir.set(0, 0, -1).applyQuaternion(qSpawn);
          }
          chaseDir.normalize();
        }
        const back = Math.max(2.5, span * 2.4);
        /* A wreck lies in the grass, and swiss2's meadow grass stands a
         * metre tall: from the flying height, 0.28 of the stand off, the
         * pilot looked at blades and not at the wreck. A pilot walking up
         * to a wreck looks down on it. */
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
        fov = 70;
      } else {
        /* 20 m to the right of the throw line and 15 m down it. */
        losBack.set(1, 0, 0).applyQuaternion(qSpawn);
        losBack.y = 0;
        losPos.set(startX, 0, startZ).addScaledVector(losBack.normalize(), 20);
        losBack.set(0, 0, -1).applyQuaternion(qSpawn);
        losBack.y = 0;
        losPos.addScaledVector(losBack.normalize(), 15);
        losPos.y = view.height(losPos.x, losPos.z, Infinity) + 1.7;
        shell.camera.position.copy(losPos);
        shell.camera.lookAt(pCurr);
        const d = Math.max(1, losPos.distanceTo(pCurr));
        fov = Math.min(45, Math.max(12, 2 * Math.atan((span * 5) / d) * 180 / Math.PI));
        chaseValid = false;
      }
      if (Math.abs(shell.camera.fov - fov) > 0.05) {
        shell.camera.fov = fov;
        shell.camera.updateProjectionMatrix();
      }
    } else {
      /* The camera sits inside the airframe, so the quad must be hidden or
       * you fly looking at the inside of its own outline hull. */
      chaseValid = false;
      fpvLensLive = true;
      shell.quad.visible = false;
      shell.camera.position.copy(fpvPos);
      shell.camera.quaternion.copy(fpvQuat);
      if (shell.camera.fov !== ui.settings.cameraFov) {
        shell.camera.fov = ui.settings.cameraFov;
        shell.camera.updateProjectionMatrix();
      }
    }

    /*
     * The title camera frames itself around the menu with a LENS SHIFT, and
     * a lens shift is state that lives on the camera rather than a value
     * recomputed every frame. The shell has one camera, so a shift left on
     * it would follow the pilot into flight and put the horizon off centre
     * for the whole run. The branches above restore the flight fov the same
     * way and for the same reason; this is the other half of it, in one
     * place because every branch that is not the attract camera wants the
     * offset gone. Cheap: a property read on the frames it is already off.
     */
    if (!(mode === 'title' && !camOverride && !warIntro)
        && shell.camera.view && shell.camera.view.enabled) {
      shell.camera.clearViewOffset();
    }

    /* The builder's own camera, when it is building, over whichever the
     * chain above chose; and the builder fetched once a world it can build
     * in is up. */
    if (build) {
      build.frame(dt);
    } else if (mapReady) {
      loadBuild();
    }
    /* The war's intro poses the camera over whatever the chain chose, and
     * under the harness camera. */
    if (warIntro) {
      if (mode === 'replay') {
        warIntroStop();
      } else {
        warIntro.frame(nowWall);
      }
    }
    /* A stage's cutaway over the chain (never over the intro or the crash
     * cam's replay): a cut poses the camera, and its lens goes back after. */
    const cutting = !warIntro && mode !== 'replay' && warCutaway.frame(nowWall);
    if (cutting && warCutFov == null) {
      warCutFov = shell.camera.fov;
    } else if (!cutting && warCutFov != null) {
      shell.camera.fov = warCutFov;
      shell.camera.updateProjectionMatrix();
      warCutFov = null;
    }
    /* Harness camera. The cost ledger has to be published for three views,
     * and two of them are not views the shell puts the camera in: the
     * ledger's mid course view is a point on the racing line, and flying
     * there at this container's frame rate is not a capture. Nothing in
     * the shell writes camOverride, and the check is a property read on a
     * scalar, so it allocates nothing. */
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

    /* Attract clock and scenery only while this context is actually
     * composing a world. Settings skips it. Title and Maps still need
     * it so the flythrough and a first-visit thumbnail stay live. */

    if (worldLive && mode === 'title') {
      titleAcc += dt;
      const ts = Math.floor(titleAcc);
      titleAcc -= ts;
      titleStepMs += ts > 100 ? 100 : ts;
    }
    if (worldLive) {
      let animMs = titleStepMs;
      if (mode === 'replay') {
        /* The clip's own clock at the playhead, so the car under the
         * craft is where it was then; a clip saved before it had one is
         * drawn at the live clock. */
        animMs = crashCam.animMs() ?? trafficMs(simTimeMs);
        /* The live water steps on with the room meanwhile, never past
         * the traffic's clock it is stepped on after (TRAFFIC_SLACK_MS):
         * the map's replay flood is the one on the clip's. */
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
      /* Its traffic, heard (src/render/world-audio.js), where it was just
       * placed. */
      if (view.audioSources) {
        view.audioSources(worldAudio.traffic(animMs));
      }

      const focus = camOverride || warIntro || (build && build.cameraLive) || mode === 'replay'
        ? shell.camera.position
        : (mode === 'title' ? shell.quad.position : pCurr);
      view.updateShadowFocus(focus);
      /* Wash used to drive grass propwash. Blades are not drawn. The
       * argument stays on the call so every map has one updateWind shape. */
      const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
      const wash = (mode === 'title' || mode === 'results')
        ? 0.85
        : Math.min(1.3, meanRpm / 9000);
      view.updateWind(exportShot ? exportShot.wind0 + exportShot.clock() : nowWall * 0.001, focus, wash);
      showWaves();
      if (view.updateWaves) {
        view.updateWaves(exportShot ? exportShot.waves0 + exportShot.clock() : renderSimT, craftOnWater());
      }
    }
    /* info is accumulated across the whole frame (prepass, shadow map,
     * composer passes) and read back through __renderStats. */
    shell.renderer.info.reset();
    const renderStart = performance.now();
    /*
     * The frame cap skips only this draw. Input was polled above, the
     * physics accumulator has already stepped, and the interpolation is
     * ready for whenever the next drawn frame comes, so a capped frame
     * costs the pilot nothing but the picture it deliberately skips. The
     * one millisecond of slack keeps a 60 cap from beating against a
     * 60 Hz display and drawing every other frame.
     */
    const capHz = Number(ui.settings.fpsCap) || 0;
    let drawThis = !harnessNoDraw;
    /* An export draws every iteration: the movie's frame rate is its own. */
    if (capHz > 0 && worldLive && !exportShot) {
      if (nowWall - capLastDraw < 1000 / capHz - 1.0) {
        drawThis = false;
      } else {
        capLastDraw = nowWall;
      }
    }
    /* The hangar covers the whole canvas with its own set, opaque, so the
     * world under it is not drawn at all while it is up. */
    if (worldLive && drawThis && !ui.hangar.isOpen) {
      /* With the Avionics HUD up the camera is a sensor: its picture in
       * picture, and the main view in its mode when the pilot puts the
       * sensor full screen (src/avionics/sensors.js). */
      if (avionicsHud.on) {
        sensors.render(view.post);
      } else {
        view.post.render();
      }
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
    const renderMs = performance.now() - renderStart;
    if (drawThis) {
      renderStats.calls = shell.renderer.info.render.calls;
      renderStats.triangles = shell.renderer.info.render.triangles;
    }
    /* After the world and after its numbers are read, so the world's own
     * budget is measured as it always was. The picker's cost is its own:
     * see window.__carouselStats. */
    {
      const pick = ui.hangar.isOpen ? ui.hangar.frame(dt) : ui.carousel.frame(dt);
      if (drawThis) {
        pickStage.draw(worldLive ? pick : null);
      }
      /* The paint shop's aim, read against the frame just drawn. */
      if (pick && pick.hangar && pick.hangar.aim) {
        ui.hangar.aimed(pickStage.pick(pick.items[0].id, pick.hangar.aim.x, pick.hangar.aim.y));
      }
    }

    /*
     * Settings studio. Own renderer, so the field's draw budget cannot
     * see it. Created when Settings opens, disposed when it closes, so
     * Fly never shares the GPU with a second WebGL context. The title
     * uses the world craft instead.
     */
    if (studioOn) {
      /* The seated aircraft's own model and its own framing. A 65 mm whoop
       * in a stage composed for a 5 inch is a speck; showcase.js scales the
       * whole stage by the sweep ratio. Rebuilt when the aircraft changes,
       * which is why the id is remembered rather than the object alone. */
      if (showcase && showcaseCraft !== runAirframe) {
        try {
          showcase.dispose();
        } catch (e) {
          /* Already gone. */
        }
        showcase = null;
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
      if (!showcase.failed) {
        showcase.setActive(true);
        if (!document.hidden) {
          showcase.update(dt, input.channels, nowWall, ui.settings.cameraAngle, angleModeOn);
          showcase.render();
        }
      }
    } else if (showcase) {
      try {
        showcase.dispose();
      } catch (e) {
        /* Already gone. */
      }
      showcase = null;
    }

    /* The world's sound: the sources added this frame, heard from where
     * the camera is now, over the ground under it. */
    worldAudio.attach(audio);
    worldAudio.setWalls(view && view.audioWalls);
    /* A replay's attackers heard where it drew them, and its pilots, in
     * or out of a room; the live music, radio and voices held silent
     * under it (src/replay/sound.js). */
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
    /* The water through the dam's openings (the map's flood,
     * docs/FLOOD.md), its roar with its discharge. */
    if (view && view.waterFlows) {
      for (const w of view.waterFlows()) {
        worldAudio.flow(w.key, w.x, w.y, w.z, w.q);
      }
    }
    {
      const c = shell.camera.position;
      worldAudio.post(shell.camera, view && view.height ? view.height(c.x, c.z, c.y) : NaN, view, worldTime);
    }

    /* Overlay. */
    const st = stateCurr;
    /* speedNow, not a second square root of the same three numbers: it is
     * assigned unconditionally from this very state block earlier in the
     * frame, and its comment there already claims it is read once. */
    const speed = speedNow;
    /* P13: audio scheduling work on the main thread, worst case, and it has
     * to allocate nothing. Two scalars written in place, and the rpm array
     * is hoisted out of the loop for the same reason. */
    const audioStart = performance.now();
    /*
     * THE MIX IS FED FROM A STATE THE INTEGRATOR IS STILL ADVANCING, or it is
     * fed nothing at all.
     *
     * The physics steps under exactly one condition, `mode === 'flight' &&
     * !landed`, and every other state freezes it: the title
     * screen, the pause menu, the results screen, and
     * every second the craft sits perched. A frozen state still carries the
     * motor RPM of the last step it took, and update() reads that as the
     * honest truth about four turning motors, so the mix went on holding
     * whatever tone the quad was making at the instant the world stopped.
     * Crossing the last gate at speed left the results screen droning on a
     * full throttle chord for as long as the table was up, because nothing
     * steps the plant again on that screen; a wreck droned for the whole
     * 1.4 s lockout on whatever RPM it hit the tree at; and a mid lap
     * landing held the touchdown tone until the pilot took off again,
     * because sim_rest zeroes velocity and omega and leaves the motors
     * exactly where they were. None of those is a motor turning. Zero is,
     * and the RPM path already knows what to do with it: below
     * MOTOR_MUTE_RPM the stem is faded out rather than floored, which is
     * the same fade the start line has always used, where the plant is
     * freshly reset and the RPM really is zero.
     *
     * The airspeed argument gets the same test instead of its old bare
     * `mode === 'flight'`. That was true right through a crash lockout, so
     * the wind was held at the speed of the impact for the whole of it while
     * the wreck lay still on the ground.
     */
    const motorsTurning = mode === 'flight' && !landed && !crashed && !isTurtleParked();
    audioRpm[0] = motorsTurning ? st[14] : 0;
    audioRpm[1] = motorsTurning ? st[15] : 0;
    audioRpm[2] = motorsTurning ? st[16] : 0;
    audioRpm[3] = motorsTurning ? st[17] : 0;
    /* What the hangar plays over the mix: the rev of a motor just picked
     * (ui.onHangarTry), on every motor voice, or else the Tuning tab's
     * test stand, its prop in its motor's voice. The flown craft's voice
     * is put back when neither plays. */
    if (hangarRev) {
      /* The rev's clock starts on the first frame that feeds it, so a
       * hitch in the frame the pilot picked does not eat the sound. */
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
    /* The replay plays its own motors, slowed with its picture. */
    const replayWind = mode === 'replay' ? crashCam.sound(audioRpm) : -1;
    let air = null;
    if (replayWind < 0) {
      /* Body frame velocity, the world's turned back by the attitude
       * (body to world, w x y z): what the engine's wind, sideslip and
       * prop wash read. Zero when the motors are not turning, as speed is. */
      const qw = st[7], qx = st[8], qy = st[9], qz = st[10];
      const vx = motorsTurning ? st[4] : 0, vy = motorsTurning ? st[5] : 0, vz = motorsTurning ? st[6] : 0;
      audioAir.u = (1 - 2 * (qy * qy + qz * qz)) * vx + 2 * (qx * qy + qw * qz) * vy + 2 * (qx * qz - qw * qy) * vz;
      audioAir.v = 2 * (qx * qy - qw * qz) * vx + (1 - 2 * (qx * qx + qz * qz)) * vy + 2 * (qy * qz + qw * qx) * vz;
      audioAir.w = 2 * (qx * qz + qw * qy) * vx + 2 * (qy * qz - qw * qx) * vy + (1 - 2 * (qx * qx + qy * qy)) * vz;
      audioAir.amps = motorsTurning ? st[19] : 0;
      /* The flaps and the gear while they travel, read off the plant, and
       * the gear's clunk when it arrives. */
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
      air = audioAir;
      if (crashCam && mode === 'flight') {
        crashCam.recordAir(air);
      }
    } else {
      /* The clip's air when it kept it, else the wind from its speed. */
      air = crashCam.air();
    }
    audio.update(audioRpm, replayWind >= 0 ? replayWind : (motorsTurning ? speed : 0), undefined, air);
    const audioMs = performance.now() - audioStart;
    if (frames > 2 && audioMs > worstAudioMs) {
      worstAudioMs = audioMs;
    }
    if (mode === 'flight') {
      /*
       * Altitude is measured against the surface UNDER THE CRAFT, through the
       * same query the collision test uses, not against the height of the
       * ground at the spawn. The old readout was `st[3] + SPAWN_ALT`, which
       * is the craft's height above wherever it started: identical on a flat
       * corridor, and wrong by seven metres the moment you cross the
       * overbridge. A pilot reading "3 m" over a roof they are about to land
       * on needs it to mean three metres over that roof.
       */
      /*
       * The score, on the SIM clock. Ticking it on the wall clock would
       * bank a combo through a stall in the render loop and would make the
       * combo window shorter on a slow machine, which is exactly the class
       * of frame-rate dependence CLAUDE.md keeps out of the game.
       */
      /*
       * HOW NEAR THE CRAFT IS TO SOMETHING SOLID, once a frame.
       *
       * A Wall Ride never touches the wall, so no contact fires and the
       * recogniser cannot tell it from banking round a corner. This is the
       * one thing that separates them, and it is affordable because it is a
       * SINGLE broadphase query per frame with an inflated radius, using
       * the same swept test the contact pass already makes sixty times a
       * second. A query per physics step would be sixty times the work for
       * an answer that does not change that fast.
       *
       * A miss means nothing solid within WALL_NEAR_M, which the detector
       * reads as open sky.
       */
      if (view.mode === 'freestyle' && view.colliders) {
        const q = shell.quad.position;
        trickDetector.near(view.colliders.gapAt(q.x, q.y, q.z, WALL_NEAR_M));
      }
      if (view.mode === 'freestyle') {
        const wasOver = score.over();
        score.tick(simTimeMs);
        const scoreView = score.view();
        scoreState = scoreView.state;
        scoreRemainMs = scoreView.remainMs;
        ui.setScore(scoreView);
        ui.scoreEvents(score.drainEvents());
        /*
         * THE HORN.
         *
         * A freestyle run is two minutes and it now ENDS, which is the whole
         * reason a freestyle score can be posted at all: before this the
         * total climbed from the moment the world loaded until something
         * reset it, so the top of any board would have been whoever left the
         * tab open longest.
         *
         * It goes to the same results screen a race ends on. The screen
         * already knew a freestyle run has no lap and no track to publish;
         * it now knows what a run IS, and carries a row to post it.
         *
         * Read off score.over() rather than off the drained event, because
         * the events are the HUD's and draining them here to look for one
         * would take it off the overlay that is meant to show it.
         */
        if (!wasOver && score.over()) {
          endFreestyleRun();
        }
      }
      const p = shell.quad.position;
      const nextGt = view.gates && view.gates[race.nextSceneIndex()];
      const osdView = {
        mode: view.mode,
        lapMs: race.freestyle ? airtimeMs : race.currentLapMs(simNow),
        /* The freestyle clock is the RUN's, counting down, and it is the
         * only clock on the screen: see setOsd. Read straight off the
         * scorer, which is the thing that decides when the run ends, rather
         * than off a second copy that could disagree with it. With scoring
         * off there is no run, and the slot carries the airtime instead. */
        runState: scoreState,
        runTimed: score.timed,
        runScored: scoringWanted(),
        runRemainMs: scoreRemainMs,
        gate: race.next + 1,
        gateCount: race.gates.length,
        /* A scored race's running score has the cue's row: a built track's
         * gates carry no cue. */
        gateCue: race.reach > 0 ? str('osd.score', { n: race.runScore }) : (nextGt && nextGt.cue ? nextGt.cue : ''),
        volts: st[18],
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - PACK_EMPTY_PER_CELL * runCells) / ((PACK_FULL_PER_CELL - PACK_EMPTY_PER_CELL) * runCells),
        /* The same biased fromY every contact query in this file uses, and
         * for the same reason: the city's height walker takes any platform
         * within a step of fromY as the floor, so an unbiased query from the
         * craft's own height finds the deck the quad is UNDER rather than
         * the road it is over, and the readout prints a negative altitude
         * under the overbridge. See SURFACE_BIAS. */
        altitude: p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS),
        speedKph: speed * 3.6,
        throttle: input.channels.throttle,
        /* A fixed wing flies the stabiliser in its plant, not Betaflight, so
         * its mode is the tune's, not the angle switch's, which a wing on
         * Stabilised used to read as Acro. */
        flightMode: airframeById(runAirframe).fixedWing
          ? (['manual', 'stab', 'acro'][tuneById(configId).wingStab || 0])
          : (turtleWait || turtleFlip.active) ? 'turtle' : (angleModeOn ? 'angle' : 'acro'),
        /* The flaps' notch, on an aircraft that has them; null hides it. */
        flaps: airframeById(runAirframe).flaps ? flapNotch : null,
        /* The retracts, on an aircraft that has them: 'up', 'down' or
         * 'moving'; null hides it. */
        gear: airframeById(runAirframe).retracts && typeof sim.e.sim_wing_gear === 'function'
          ? (sim.e.sim_wing_gear() >= 1 ? 'up' : sim.e.sim_wing_gear() <= 0 ? 'down' : 'moving')
          : null,
        /* No damage model, so nothing to count down. How much this run has
         * bounced is still worth telling a pilot, and the OSD says nothing
         * at all until there is something to say. */
        bounces: bounceCount,
        /* Native state 3 latches until the L switch drops. The GO flash
         * is 900 ms; after that the overlay has to hide or it sits on
         * the goggles for the rest of the lap. */
        launchState: (crashflipOn || turtleRecover || crashed) ? 0 : (launchNow === 3 && nowWall >= lcGoUntil ? 0 : launchNow),
        launchPitch: pitchNoseDownDeg(st),
        /* The gap to the ghost at the last gate, while its readout lives.
         * Null the rest of the time, which is how the OSD knows to clear. */
        ghostGapMs: ghostGap && nowWall < ghostGap.untilWall ? ghostGap.deltaMs : null,
        ghostFinal: Boolean(ghostGap && ghostGap.final),
      };
      ui.setOsd(osdView);
      const powerNow = readPower();
      const osdCtx = {
        st,
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
        armed: motorsTurning,
        flown: flownThisRun,
        crashFlip: crashflipOn || turtleWait || turtleFlip.active,
        /* Last frame's, since the banner is chosen further down. */
        banner: ui.bannerText,
        /* The crash cam's REPLAY prompt, its key while it is up. */
        replayKey: crashCam ? crashCam.promptKey() : null,
      };
      fpvOsd.feed(osdView, osdCtx);
      {
        const feed = fpvFail.level(nowWall);
        telemetry.feed(osdView, osdCtx, fpvOsd, { videoSnow: feed.snow, cameraLost: fpvFail.deadSince() >= 0, load: perception.load });
        simPosToThree(st[4], st[5], st[6], avxVel);
        /* The sensor looks from the camera, which a chase view puts
         * behind the craft. */
        avxOwn.p[0] = shell.camera.position.x;
        avxOwn.p[1] = shell.camera.position.y;
        avxOwn.p[2] = shell.camera.position.z;
        avxOwn.v[0] = avxVel.x;
        avxOwn.v[1] = avxVel.y;
        avxOwn.v[2] = avxVel.z;
        avxFed = true;
      }
      progressTick(powerNow);
      const ch = input.channels;
      const vis = turtleAxes(ch.roll, ch.pitch);
      ui.setStickOverlay({
        /* The mouse draws the ghost gimbals too: they are where a pilot
         * sees where the held stick and the wheel's throttle are. */
        show: input.isMousePrimary() || (input.isKeyboardPrimary() && !input.isTouchPrimary()),
        roll: vis[0],
        pitch: vis[1],
        yaw: ch.yaw,
        throttle: ch.throttle,
      });
      /* The air slider rides the same test as the gimbals it sits between,
       * but not the same SOURCE test: it belongs to every pilot, radio,
       * keyboard and thumbs alike, so it is up whenever there is a quad in
       * the air to try it on. This is also where its first-run hint is
       * raised, which is why it is here and not in show(). */
      ui.setAirSlider(true, !landed && !launchStaging && !crashed && !poseLock);
      updateTargetLock();
    } else if (mode !== 'paused') {
      ui.setStickOverlay({ show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 });
      ui.setAirSlider(false);
      ui.setTargetLock(LOCK_OFF);
    }
    /* The OSD belongs to the FPV lens: up in flight and dimmed in pause
     * while that lens is the camera, and never over chase, line of sight,
     * the intro orbit or a menu. */
    const hudStyle = hudStyleFor(ui.settings, runAirframe);
    const fpvHudUp = fpvLensLive && !camOverride && (ui.screen === 'flight' || ui.screen === 'paused');
    fpvOsd.tick(hudStyle === 'osd' && fpvHudUp, ui.screen === 'paused', nowWall);
    avionicsFrame(hudStyle === 'avionics' && fpvHudUp && avxFed, ui.screen === 'paused', nowWall, dt / 1000);
    peerMarks.begin(shell.camera, ui.settings.peerMarks, avionicsHud.on ? avionicsHud : fpvOsd, mode === 'flight' && ui.screen === 'flight', dt / 1000, nowWall);
    for (const peer of roomPeers.values()) {
      if (peer.rig && peer.rig.group.visible) {
        const at = peer.rig.group.position;
        peerMarks.add(peer.seat, peer.rig.label(), at.x, at.y, at.z, peer.rig.extent);
      } else if (peer.away && !roomSafety.isMuted(peer.seat)) {
        /* Not drawn, so named instead; a muted pilot's name is not shown anywhere. */
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
    /* The free orb in Catch the Ace, pointed at as the Ace is. */
    const tagOrb = roomTag.orb();
    if (tagOrb) {
      peerMarks.orb(str('roomtag.orb_mark'), tagOrb.px, tagOrb.py, tagOrb.pz, roomTag.bubble());
    }
    peerMarks.end(peerMarkGround);
    voiceUi.frame(mode === 'flight' ? pCurr : null, roomPeers.values());
    /*
     * The thumb sticks live in FLIGHT and nowhere else. Over any menu
     * their catchment would sit on top of the rows (the overlay is the
     * last child of #ui on purpose, so it beats every screen in flight),
     * and beside a connected radio they would be a second pair of sticks,
     * the same rule the keyboard ghost follows. The OSD corners move in
     * under the timer while they are up; see .touch-fly-on in index.html.
     */
    /* The Setup tab's horizon rides the plant quaternion, live. */
    if (ui.screen === 'fc' && stateCurr) {
      ui.fc.attitude = {
        w: stateCurr[7],
        x: stateCurr[8],
        y: stateCurr[9],
        z: stateCurr[10],
      };
      ui.paintFcAttitude();
    }
    syncMouseLock(nowWall);
    if (touch) {
      const touchOn = mode === 'flight' && ui.screen === 'flight' && !input.firstGamepad() && !input.mouseEnabled;
      /*
       * The one-time thumb-rates hand-off, at the first moment touch is
       * actually about to fly. A fresh touch profile was already seeded
       * by loadSettings; this catches the OTHER pilot, an existing
       * profile still on the stock defaults, whose 670-no-expo is a
       * gimbal calibration and reads as "way too fast" on glass, which
       * is the report this answers. A pilot who chose their own rates is
       * respected: the flag still flips so this never asks again, and
       * their numbers are not touched.
       */
      if (touchOn && !ui.settings.touchRatesOffered) {
        ui.settings.touchRatesOffered = true;
        if (ratesAreDefault(ui.settings.rates)) {
          ui.settings.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
          notice = {
            text: str('main.rates_eased_for_thumb_flying_450'),
            untilMs: performance.now() + 4200,
          };
        }
        ui.persistSettings();
        applySettings(ui.settings);
      }
      touch.setVisible(touchOn);
      uiRoot.classList.toggle('touch-fly-on', touchOn);
      touch.paint();
    }
    uiRoot.classList.toggle('turtle-on', crashflipOn || turtleRecover);

    const cal = input.calibrationView();
    const lapFlash = race.flashText(nowWall);
    /* Computed once: guidedPrompt retires the guided flag as a side effect,
     * so calling it in a condition and again in the body would consume it. */
    const guidedText = (
      ui.guided
      && !crashflipOn
      && !turtleRecover
      && lastUpz >= 0
    ) ? guidedPrompt(race) : '';
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
        ui.show('pilot');
        if (input.calResult === 'saved') {
          notice = { text: str('main.stick_mapping_saved'), untilMs: nowWall + 2800 };
        } else if (input.calResult === 'saved-unstored') {
          notice = {
            text: str('main.mapping_live_gone_on_reload'),
            untilMs: nowWall + 5200,
          };
        }
        input.calResult = null;
      }
      ui.setBanner('');
    } else if (crashed && ui.screen === 'flight') {
      ui.setBanner('Crashed', true);
    } else if (ui.screen === 'flight' && warSpectating()) {
      ui.setBanner(warWatchBanner(), true);
    } else if (ui.screen === 'flight' && roomWar.live() && roundOf(roomWar.view())?.state === 'result') {
      /* The round's result card has the middle, and the next round puts
       * everybody back in the air, so no wreck's R prompt under it. */
      ui.setBanner('');
    } else if (wreckDown(nowWall) && ui.screen === 'flight') {
      ui.setBanner(str('main.wrecked_r_resets'), 'edge');
    } else if (
      (turtleWait || turtleRecover || turtleFlip.active)
      && ui.screen === 'flight'
    ) {
      ui.setBanner(turtleBannerText(), true);
    } else if ((airHoldMs > 0 || raceHoldMs > 0) && !ui.isModal()) {
      ui.setBanner(String(Math.ceil(Math.max(airHoldMs, raceHoldMs) / 1000)));
    } else if (nowWall < airGoUntil && !ui.isModal()) {
      ui.setBanner('GO');
    } else if (notice && nowWall < notice.untilMs && !(launchNow > 0) && !crashflipOn) {
      ui.setBanner(notice.text);
    } else if (ui.isModal()) {
      /* A banner is a flight message. Any screen that is up owns the
       * frame, and a launch prompt printed across a results table is how
       * you find that out. */
      ui.setBanner('');
    } else if (input.throttleWaiting && ui.screen === 'flight') {
      /* A pad's throttle resting at half, held at zero until it has been
       * down. Without this nothing happens and nothing says why. */
      ui.setBanner(str('main.throttle_down_to_start'));
    } else if (launchNow === 3 && nowWall < lcGoUntil) {
      ui.setBanner('GO');
    } else if (launchNow === 1 || launchNow === 2) {
      const deg = Math.round(pitchNoseDownDeg(st));
      ui.setBanner(deg > 8
        ? (launchNow === 2
          ? str('main.launch_punch_throttle', { deg })
          : str('main.launch_centre_the_stick_then_punch', { deg }))
        : str('main.launch_control_pitch_forward_then_centre'));
    } else if (!flownThisRun) {
      /*
       * THE SECOND LINE IS A PROMISE ABOUT WHAT STARTS, and in freestyle it
       * was the SCORED run's promise whatever the pilot had set Scoring to.
       *
       * A pilot with scoring off was told, in amber across the middle of the
       * town, that they had two minutes and that the clock started on their
       * first trick. Nothing else agreed with it: the OSD slot beside it read
       * Air and counted an airtime up, no overlay ever appeared, and the run
       * never ended. It is the one sentence a freestyle pilot reads before
       * they fly, so as far as the seat was concerned the scorer was on and
       * the Scoring row was a lie. See DEFAULTS.freestyleScoring in
       * src/ui/ui.js for why off is what a pilot gets without asking.
       *
       * OFF PROMISES NOTHING, because nothing starts: the line is dropped and
       * the banner is the takeoff prompt on its own. Free flight has no clock
       * and no end either, so it says what it does have rather than borrowing
       * the scored run's sentence. Only a scored run gets the two minutes.
       */
      /* A wing has no throttle to take off on: L throws it. */
      const isWing = Boolean(airframeById(runAirframe).fixedWing);
      const start = startsAfloat()
        ? str('main.throttle_up_on_the_water')
        : airframeById(runAirframe).retracts && airframeById(runAirframe).flaps
        ? str('main.throttle_up_gear_g')
        : airframeById(runAirframe).retracts
        ? str('main.throttle_up_retracts_g')
        : airframeById(runAirframe).flaps
        ? str('main.throttle_up_flaps_f')
        : airframeById(runAirframe).gear
        ? str('main.throttle_up_to_take_off_from')
        : airframeById(runAirframe).catapult && airframeById(runAirframe).chute
        ? str('main.launch_it_off_the_catapult')
        : airframeById(runAirframe).catapult
        ? str('main.launch_it_off_the_rail')
        : isWing
        ? str('main.throw_it_with_l')
        : ui.settings.launchControl
          ? str('main.l_for_launch_control_or_throttle')
          : str('main.throttle_up_to_take_off');
      let second = str('main.the_green_gate_starts_your_lap_2');
      if (race.freestyle) {
        second = scoredRun()
          ? str('main.two_minutes_the_clock_starts_on')
          : (scoringWanted() ? str('main.no_clock_and_no_gates_a') : '');
      }
      ui.setBanner(`${start}${second}`);
    } else if (guidedText) {
      ui.setBanner(guidedText);
    } else if (lapFlash) {
      /* A wreck's "lap over" is about the craft the camera is on. */
      ui.setBanner(lapFlash, wrecked ? 'edge' : false);
    } else {
      ui.setBanner('');
    }

    /* How to fly draws the same gimbals the flight overlay does, from the
     * same channels, so pressing W on the tutorial moves the stick it is
     * describing. It is the only screen outside flight that wants them. */
    if (ui.screen === 'howto') {
      const ch = input.channels;
      ui.setHowtoSticks({
        roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw, throttle: ch.throttle,
      });
    }

    /* Rates draws the curve the sticks are about to fly, with the sticks on
     * it. Same channels the quad gets, for the same reason How to fly reads
     * them: a picture of a control you are holding is worth a paragraph. */
    if (ui.screen === 'rates') {
      const ch = input.channels;
      ui.paintRates({ roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw });
    }

    /*
     * THE PERFORMANCE READOUT IS GONE, and this note is here because the
     * numbers are not.
     *
     * Frame rate, draw calls, triangles, the render scale and the stick
     * rate used to print in the top right corner behind a Settings switch
     * and an F3 key. They were developer output on a page whose first
     * screen is three pictures and a question, and the owner asked for
     * that corner back.
     *
     * Every one of those numbers is still measured and still reachable.
     * `fps` and `renderStats` are live in this scope, `input.stats()`
     * answers the stick rate, and scripts/quality-check.js and
     * scripts/device-check.js read the same figures out of a real browser,
     * which is where a performance number belongs: in a check that can
     * fail, not in a corner nobody reads while flying.
     */
    window.__shellReady = true;
    window.__mode = mode;
    window.__screen = ui.screen;

    /* P7. The whole frame callback is one synchronous block on the main
     * thread, and blockMs is its length. renderMs is the part of it inside
     * view.post.render, split out because in a software rasterised container
     * that part is rasterisation on the CPU and says nothing about a real
     * GPU, while blockMs minus renderMs is the shell's own work and is
     * hardware independent. Two scalars, written not allocated: P8 forbids
     * a new object here. */
    const blockMs = performance.now() - blockStart;
    if (view && view.post && typeof view.post.applyPace === 'function') {
      pace.observe(dt, renderMs, blockMs, view.post);
      if (pace.state.dirty) {
        if (view.post.applyPace(pace.state.want)) {
          pace.state.cool = PACE_COOL;
          pace.state.changes += 1;
        }
        pace.state.dirty = 0;
      }
    }
    if (frames > 2) {
      if (blockMs > worstBlockMs) {
        worstBlockMs = blockMs;
      }
      if (blockMs - renderMs > worstShellMs) {
        worstShellMs = blockMs - renderMs;
      }
    }
    frames += 1;
    if (firstFrameMs < 0) {
      firstFrameMs = performance.now() - BOOT_START;
    }
    if (finishLoadingOnFrame) {
      /* The last stage is the first frame, and this IS the first frame: the
       * world is on screen behind the loading screen at the moment it goes.
       * Marking it done anywhere earlier would be a bar that reaches the end
       * before the thing it measures has happened. */
      finishLoadingOnFrame = false;
      loading.done('frame');
      loading.finish();
    }
  }
  let worstBlockMs = 0;
  let worstShellMs = 0;
  let worstAudioMs = 0;
  /* Hoisted: P8 forbids a new array per frame, and this one used to be a
   * literal in the audio.update call. */
  const audioRpm = [0, 0, 0, 0];
  /* The engine's extra state, the same way: written in place. */
  const audioAir = { u: 0, v: 0, w: 0, amps: 0, dist: 0, dist2: 0, pan: 0, flapsMoving: false, gearMoving: false };
  /*
   * The other way the mix can be left holding a tone, and it is the same
   * defect from the other end: the whole mix is driven from inside frame(),
   * and requestAnimationFrame is not called for a hidden document. The
   * AudioContext keeps its own clock while the tab is in the background, so
   * switching away mid flight used to leave the motors and the wind running
   * on the last values they were handed, for as long as the tab stayed
   * hidden, which is longer than any crash lockout. One update with the
   * motors stopped, scheduled the moment the page goes away, and the fade
   * a parked craft gets takes it down. Coming back, the next frame feeds
   * the live state again and the mix ramps up on the same 30 ms tau.
   */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      return;
    }
    audioRpm[0] = 0;
    audioRpm[1] = 0;
    audioRpm[2] = 0;
    audioRpm[3] = 0;
    audio.update(audioRpm, 0);
    /*
     * A HIDDEN TAB PAUSES, THE WAY EVERY OTHER GAME DOES.
     *
     * Muting the mix was the whole handler. Nothing exploded without this,
     * because rAF stops while hidden and the accumulator caps the return at
     * 100 ms, but the pilot who alt-tabbed mid lap came back to a live FPV
     * view and a quad that resumed at speed in the same frame the window
     * did, with the last 100 ms of stick history behind it. The lap clock
     * kept the time honestly, which made it worse: the run was still
     * running and they were not flying it.
     *
     * These are the two calls Escape makes, and nothing else, so a return
     * lands on the pause menu the pilot already knows how to leave.
     */
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
  /* Render statistics for the harness and the frame budget gate. */
  const renderStats = { calls: 0, triangles: 0 };
  const pace = createPace();
  shell.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
  window.__pace = () => ({
    emaMs: pace.state.emaMs,
    renderEma: pace.state.renderEma,
    shellEma: pace.state.shellEma,
    p95Ms: pace.p95(),
    dtN: pace.state.dtN,
    scale: pace.state.scaleNow,
    ceil: pace.state.ceil,
    floor: pace.state.floor,
    want: pace.state.changes ? pace.state.want : pace.state.ceil,
    cpuBound: pace.state.cpuBound,
    changes: pace.state.changes,
    warm: pace.state.warm,
    rw: pace.state.rw,
    rh: pace.state.rh,
    fps,
    gpu: gpuInfo ? {
      name: gpuInfo.name,
      display: gpuInfo.display,
      software: gpuInfo.software,
      raw: gpuInfo.raw,
    } : null,
  });
  window.__paceReset = () => {
    pace.resetSamples();
    return pace.state.dtN;
  };
  /*
   * What the GPU is holding, for scripts/memory-check.js. Three.js counts
   * live geometries and textures itself, and those two numbers are the ones
   * that say whether a map's dispose actually gave the memory back or only
   * stopped drawing it. A lazy load that never frees is a leak with extra
   * steps, and on a laptop it is the difference between switching maps twice
   * and switching maps until the tab dies.
   */
  window.__gpuMemory = () => ({
    geometries: shell.renderer.info.memory.geometries,
    textures: shell.renderer.info.memory.textures,
    programs: shell.renderer.info.programs ? shell.renderer.info.programs.length : 0,
  });
  /* Handles the screenshot harness uses to reach a screen that would
   * otherwise need a flown lap. Nothing in the shell reads them. */
  window.__ui = ui;
  /* The input layer, for the same reason: the radio dead ends cannot be
   * exercised from the shell alone, because the thing that is broken is
   * what a gamepad reports, and headless Chromium has no gamepad. The
   * checks drive it with a fake pad. */
  window.__input = input;
  /* A function, not a snapshot. Every other handle here reads `view` or
   * `race` at call time; this one captured the object identity at boot, so
   * after a map swap it answered with the previous map's race. */
  window.__race = () => race;
  /* P12 and P13 are audio budgets, and neither can be read while the audio
   * context is null: update() returns immediately and reports a cost of
   * nothing. A capture run has to click the page to satisfy the browser's
   * gesture requirement and then check that the context is real. */
  window.__audio = audio;
  /* The cost ledger. Measured on demand from the harness, never per
   * frame. __setCam parks the camera for a named view; __setCam(null)
   * gives it back to the shell. */
  /*
   * The seated aircraft, as four independent answers rather than one, so a
   * harness can catch the case where the shell and the module disagree about
   * what is flying. That is the failure this feature is most likely to have:
   * the setting says whoop, the model draws a whoop, and the plant is still
   * integrating a 710 gram quad.
   */
  /* The aircraft picker's own cost, measured in its draw: CPU time to
   * submit, draw calls, its target's size. Harness only. */
  window.__carouselStats = () => pickStage.stats();
  window.__lastSwap = () => lastSwap;
  /* The paint on the craft the shell draws: which aircraft, the colour each
   * region's materials are in now, and every colour on its drawn meshes,
   * for scripts/hangar-check.js. */
  window.__craftPaint = () => shell.craftPaint(drawnCraft);
  window.__pickPaint = (id) => pickStage.paint(id);
  /* The hangar's rev (ui.onHangarTry): the voice it speaks on, the one it
   * gives back, and the rpm last fed to the mix. For scripts/progress-check.js. */
  window.__hangarRev = () => ({
    rev: hangarRev ? { voice: hangarRev.voice, was: hangarRev.was, ms: hangarRev.ms ?? null } : null,
    voice: Object.keys(VOICES).find((k) => VOICES[k] === audio.voice) ?? null,
    rpm: audioRpm.slice(),
  });
  window.__pickLook = (id) => pickStage.look(id);
  window.__pickParts = (id) => pickStage.fitted(id);
  window.__pickCombat = (id) => pickStage.combat(id);
  window.__craft = () => ({
    setting: ui.settings.airframe,
    run: runAirframe,
    module: typeof sim.e.sim_airframe === 'function' ? sim.e.sim_airframe() : -1,
    sweepM: CRAFT_R,
    massKg: typeof sim.e.sim_bf_debug === 'function' ? sim.e.sim_bf_debug(51) : 0,
    drawn: shell.quad.name,
    shown: drawnCraft,
    power: readPower(),
    cells: runCells,
    addons: (airframeById(runAirframe).fixedWing || airframeById(runAirframe).combat) && typeof sim.e.sim_addons_state === 'function' ? sim.addonsState() : null,
    /* A combat quad's seated payload and accessories, and its roll
     * inertia, for scripts/combat-shell.js. */
    combat: combatSeatKey && airframeById(runAirframe).combat ? JSON.parse(combatSeatKey) : null,
    ixx: typeof sim.e.sim_bf_debug === 'function' ? sim.e.sim_bf_debug(55) : 0,
    /* A quad's motors, prop and pack as the plant flies them, for
     * scripts/garage-motors-check.js: the loaded torque constant, the
     * resistance and the rotor's inertia, sim_set_motors's three, and the
     * prop's thrust constant and a cell's resistance, sim_set_prop_pack's. */
    motors: hasMotors(runAirframe) && typeof sim.e.sim_bf_debug === 'function'
      ? {
        ke: sim.e.sim_bf_debug(62), r: sim.e.sim_bf_debug(61), j: sim.e.sim_bf_debug(60),
        kt: sim.e.sim_bf_debug(10), rCell: sim.e.sim_bf_debug(63),
      } : null,
    parts: shell.quad.userData.partsFit ?? null,
    smoke: { on: smokeOn, puffs: smoke.live() },
    bladeScale: audio.bladeScale,
    /* The sim_wing_tune block in force and the flap switch, for
     * scripts/hangar-check.js; null on a quad. */
    tune: airframeById(runAirframe).fixedWing && typeof sim.e.sim_wing_tune === 'function' ? Array.from(sim.tune()) : null,
    flapNotch,
    /* The hangar's test stand on the motor's audio: its voice and rpm. */
    standAudio: { voice: standVoiceOn, rpm: standVoiceOn ? audioRpm[0] : 0 },
  });
  /*
   * WHERE THE CRAFT IS AGAINST THE FLOOR UNDER IT, which is the one thing
   * a screenshot argues about and a number settles. The pilot's report
   * that a whoop "hits the ground too soon, then lifts off the ground a
   * little when it resets" is a claim about these five numbers, and there
   * was no way to read them. Harness only.
   */
  window.__ground = () => ({
    y: pCurr.y,
    surf: view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS),
    above: pCurr.y - view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS),
    clearance: lastClearance,
    landed,
    rest: REST_HEIGHT,
    hits: lastGroundHits,
    contactSteps: groundContactSteps,
  });
  /* An optional seventh argument pins the vertical fov as well: without it
   * the parked camera keeps whatever lens the shell last set, which is the
   * title's 44 degrees until the settings are applied and the pilot's lens
   * after, at a moment that depends on the machine's speed. */
  window.__setCam = (a, b, c, d, e, f, fov) => {
    camOverride = a == null ? null : [a, b, c, d, e, f, fov];
  };
  window.__intro = () => ({
    ms: introMs,
    holding: introMs >= 0 && introMs < INTRO_FLY,
    orbiting: introMs >= 0 && introMs < INTRO_ORBIT,
    approaching: introMs >= INTRO_ORBIT && introMs < INTRO_FLY,
    zooming: introMs >= INTRO_FLY && introMs < INTRO_TOTAL,
    quadVisible: shell.quad.visible,
  });
  /* Put the race on a given gate. The ledger and the value measurements
   * park the camera at a point on the racing line, and a pilot at that
   * point has a real next gate, which is not gate 0 just because the run
   * has not started. Without this the glow ladder in a parked capture
   * belongs to a different position on the course than the camera does.
   * Harness only.
   *
   * Setting `race.next` alone leaves the rest of the race inconsistent:
   * `lapStartMs` is only ever set by passing gate 0, so the lap clock never
   * starts, and `race.update` treats a gate frame tap with `next !== 0` and
   * no lap start as a lap to void, which flashes "Gate touched, lap void"
   * across whatever is being captured. So this resets the race first and
   * hands back the previous value for a run to restore.
   */
  window.__setRaceNext = (raceIndex) => {
    const n = race.gates.length;
    const was = race.next;
    race.reset();
    race.next = (((raceIndex | 0) % n) + n) % n;
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    racePrev.copy(shell.quad.position);
    raceHasPrev = true;
    return { raceNext: race.next, sceneIndex: race.nextSceneIndex(), previous: was };
  };
  window.__trackPoint = (u) => {
    if (!view.curve) {
      return null;
    }
    const p = view.curve.getPointAt(u);
    const t = view.curve.getTangentAt(u);
    return { x: p.x, y: p.y, z: p.z, tx: t.x, tz: t.z, ground: view.height(p.x, p.z) };
  };
  /*
   * The freestyle score. A reader and a writer, for the same reason
   * __setRaceNext has both: a screenshot of the score overlay has to be
   * able to put a known score on it, and every other route to one involves
   * flying a Rubik's Cube in a headless browser on a software rasteriser.
   * The writer goes through score.land, so what it captures is the real
   * scoring path and not a mock of it.
   */
  window.__score = () => score.summary();
  /*
   * The recogniser itself, so a probe can watch what it does rather than
   * only what it says. Every "verified" trick in this repo's history was
   * checked against a CONSTRUCTED flight: an exact circle, a constant turn
   * rate, a nose pointed by arithmetic. Those flights pass things a flown
   * one does not, and the gap is where the owner's "not picking up at all"
   * lives. A probe holding this can patch closePath and read the laps a
   * REAL stick input produced. Harness only; nothing in the shell reads it.
   */
  window.__trickDetector = () => trickDetector;
  /* What the map offered up to fly around, for the audit in
   * scripts/obstacle-audit.js and for check 16's eyes. */
  window.__obstacleField = () => obstacles;
  window.__obstacles = () => (obstacles
    ? {
      count: obstacles.count,
      poles: obstacles.countOf(OB_POLE),
      bars: obstacles.countOf(OB_BAR),
    }
    : null);
  window.__scoreTrick = (name, execution) => {
    score.tick(simTimeMs);
    /*
     * MARKED, because this is not flying.
     *
     * The run summary carries the flag out to the results screen and the
     * post path refuses it there, so a screenshot rig cannot put a
     * fabricated score on a public table. It is on the TRICK rather than
     * on the scorer so that score.js needs no knowledge of a harness: it
     * simply records that something it was handed said it was staged.
     */
    const r = score.land({
      name, execution: execution || 'CLEAN', endMs: simTimeMs, assisted: true,
    });
    return r && { name: r.name, net: Math.round(r.net), combo: score.view().combo };
  };
  /* The horn, staged, for the same reason the bail is: a real one is two
   * minutes of flying that a headless browser on a software rasteriser
   * cannot be asked for. Same path as the real one, no mock. */
  window.__scoreFinish = () => {
    score.finish();
    endFreestyleRun();
    return score.summary();
  };
  /* The bail, staged. There is no other way to photograph the one screen
   * that matters most in this mode: a real bail needs a real crash, and a
   * crash in a headless browser on a software rasteriser is a twenty step
   * flight nobody can reproduce. Same path as the real one, no mock. */
  window.__scoreCrash = () => {
    trickDetector.reset();
    score.crash();
    return score.summary();
  };
  /*
   * The gap to the nearest solid at a point, in metres, by exactly the
   * query the freestyle recogniser is fed. Harness only, and it exists
   * because "a Wall Ride was flown near a wall" is a claim about a number
   * nothing else in the shell reports. See WALL_NEAR_M.
   */
  window.__nearSolid = (x, y, z, r = WALL_NEAR_M) => {
    if (!view.colliders) {
      return null;
    }
    return view.colliders.gapAt(x, y, z, r);
  };
  /* What is solid, and how well the broadphase is doing. */
  /*
   * THE CONTACT COUNTERS, so a probe can tell a wall it touched from a wall
   * it stopped short of. The owner's report is that a wall tap "ended in a
   * crash rather than a tap", and the two halves of that are answered by
   * different numbers: bounces says the contact pass saw the wall at all,
   * lastImpulse says how hard, and GRAZE_SPEED_MAX is the line between a
   * tap and a smack. Nothing in the shell reads it.
   */
  /*
   * DRAW NOTHING, FLY EVERYTHING. Harness only.
   *
   * The town costs about two hundred milliseconds a frame under
   * swiftshader, so a probe driving the sticks from requestAnimationFrame
   * moves them FIVE TIMES A SECOND. Nothing can be flown at five hertz: a
   * tracker measured eighteen metres off a straight line it had six seconds
   * to fly, and every trick built on that measurement was measuring the
   * probe. Skipping the draw leaves the frame loop, the accumulator, the
   * fixed timestep and the interpolation exactly as they were, which is the
   * same promise the fps cap already makes one branch below, and hands the
   * probe back a control rate a radio would recognise.
   */
  window.__drawOff = (on = true) => {
    harnessNoDraw = Boolean(on);
    return harnessNoDraw;
  };
  /* Which control mode the plant is actually in. A rig that thinks it is
   * flying acro and is not measures nothing: angle cannot loop. */
  window.__flightMode = () => (angleModeOn ? 'angle' : 'acro');
  /*
   * The air, READ BACK OUT OF THE MODULE rather than out of the menu, which
   * is the same discipline the PIDs panel keeps: a slider that stopped
   * reaching the plant has to be visible as a slider that moves nothing.
   * `run` is what the shell believes the current lap is being flown in and
   * is what the record key is built from, so the two disagreeing is a bug
   * with a name rather than a mystery. Harness only.
   */
  window.__air = () => ({
    setting: ui.settings.weight,
    run: runWeight,
    scale: runGravityScale,
    module: typeof sim.e.sim_gravity === 'function' ? sim.e.sim_gravity() : null,
    key: recordKey(),
  });
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
   * Every solid box within `r` of a point, as plain numbers. Harness only,
   * and it exists because the collider fit is the one thing in this project
   * that cannot be checked by a number alone: "the collisions hug the
   * graphics" is a claim about a picture, and the way to check it is to draw
   * the boxes over the picture and look. scripts/collider-overlay.js does
   * exactly that with what this returns.
   */
  window.__colliderBoxes = (x, z, r) => {
    const c = view.colliders;
    const out = [];
    if (!c.fbox) {
      return out;
    }
    for (let i = 0; i < c.fbox.length; i += 1) {
      if (!c.fbox[i]) {
        continue;
      }
      const cx = (c.fax[i] + c.fbx[i]) * 0.5;
      const cz = (c.faz[i] + c.fbz[i]) * 0.5;
      if (Math.hypot(cx - x, cz - z) > r) {
        continue;
      }
      /* The seventh number is the collider's index, which a roof's
       * `solids` (window.__roofs) name. A turned box is its world
       * bounding box here; __crashSolids has its own frame. */
      out.push([c.fax[i], c.fay[i], c.faz[i], c.fbx[i], c.fby[i], c.fbz[i], i]);
    }
    return out;
  };
  /*
   * A SHAPE CENSUS OF THE WHOLE COLLIDER SET, and the near misses.
   *
   * `__colliderBoxes` above answers "is the collider where the drawing is",
   * which is a question about a picture. This answers a different one that
   * is just as invisible from the outside: of everything solid in this
   * world, how much of it is a shape the freestyle recogniser can fly
   * AROUND, and for the things that nearly are, which test threw them out.
   *
   * It exists because the obstacle field was empty in the real town for a
   * long time and no check could see it: every self-test builds its own
   * constructed field of one bar and one pole, so the derivation was proved
   * against a world that is not this one. See PROGRESS.md, 2026-09-02.
   *
   * `near` is the near misses: a capsule or box that failed exactly one of
   * the pole or bar tests, with the test that rejected it and the number it
   * was judged on, so "the town has no bars" can be told apart from "the
   * town's bars are half a metre too thick".
   */
  window.__colliderShapes = (opts = {}) => {
    const c = view.colliders;
    const out = {
      total: 0, boxes: 0, capsules: 0, byKind: {}, poles: 0, bars: 0, near: [], barList: [],
    };
    if (!c || !c.fbox) {
      return out;
    }
    const KIND = KINDS;
    const limit = opts.near ?? 12;
    for (let i = 0; i < c.fbox.length; i += 1) {
      out.total += 1;
      const kind = KIND[c.fkind[i]] ?? String(c.fkind[i]);
      out.byKind[kind] = (out.byKind[kind] ?? 0) + 1;
      const box = Boolean(c.fbox[i]);
      out[box ? 'boxes' : 'capsules'] += 1;
      const cx = (c.fax[i] + c.fbx[i]) * 0.5;
      const cz = (c.faz[i] + c.fbz[i]) * 0.5;
      let len;
      let thick;
      let upright;
      let lowY;
      if (box) {
        /*
         * MIRRORS deriveObstacles' box branch exactly, and the first draft
         * did not: it took the thickness as the smaller of the footprint
         * and the height, which called a 16 by 11 metre overbridge deck
         * 0.24 m thick and reported six bars in a town that has none. A
         * diagnostic that flatters the thing it is measuring is worse than
         * no diagnostic. A box is a bar only if it is thin in BOTH of the
         * two directions that are not its length.
         */
        /* A turned box by its own sides, not its world bounding box. */
        const turned = c.fbox[i] === TURNED;
        const w = turned ? c.fu1[i] - c.fu0[i] : Math.abs(c.fbx[i] - c.fax[i]);
        const d = turned ? c.fw1[i] - c.fw0[i] : Math.abs(c.fbz[i] - c.faz[i]);
        const h = Math.abs(c.fby[i] - c.fay[i]);
        const foot = w > d ? w : d;
        const thin = w > d ? d : w;
        lowY = Math.min(c.fay[i], c.fby[i]);
        if (h >= foot) {
          len = h;
          thick = foot;
          upright = 1;
        } else {
          len = foot;
          /* Both cross sections, not the smaller of them. */
          thick = thin > h ? thin : h;
          upright = 0;
        }
      } else {
        const ex = c.fbx[i] - c.fax[i];
        const ey = c.fby[i] - c.fay[i];
        const ez = c.fbz[i] - c.faz[i];
        len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        thick = c.fr[i] * 2;
        upright = len > 1e-6 ? Math.abs(ey / len) : 1;
        lowY = Math.min(c.fay[i], c.fby[i]) - c.fr[i];
      }
      /* Below the collider's own base, the same question deriveObstacles
       * asks and for the same reason: the unhinted height is the top of
       * whatever is stacked over the point, so under a deck it reports a
       * support as having negative daylight beneath it. */
      const clear = lowY - view.height(cx, cz, lowY);
      /* The same tests deriveObstacles applies, restated here so a near
       * miss can name the one that failed. They are deliberately a copy:
       * this is a diagnostic and it must be able to disagree. */
      const poleShaped = upright >= 0.9 && thick <= 0.9 && len >= 2.5;
      const barShaped = upright <= 0.1 && thick <= 0.8 && len >= 2 && clear >= 1.5;
      if (poleShaped) {
        out.poles += 1;
      } else if (barShaped) {
        out.bars += 1;
        if (out.barList.length < limit) {
          out.barList.push({
            kind,
            box,
            at: [+cx.toFixed(1), +lowY.toFixed(1), +cz.toFixed(1)],
            len: +len.toFixed(2),
            thick: +thick.toFixed(2),
            clear: +clear.toFixed(2),
            a: [+c.fax[i].toFixed(1), +c.fay[i].toFixed(1), +c.faz[i].toFixed(1)],
            b: [+c.fbx[i].toFixed(1), +c.fby[i].toFixed(1), +c.fbz[i].toFixed(1)],
            r: +c.fr[i].toFixed(2),
          });
        }
      } else if (out.near.length < limit && upright <= 0.3 && len >= 2) {
        /* Horizontal and long, so it wanted to be a bar. Say why it is not. */
        out.near.push({
          kind,
          box,
          at: [+cx.toFixed(1), +lowY.toFixed(1), +cz.toFixed(1)],
          len: +len.toFixed(2),
          thick: +thick.toFixed(2),
          clear: +clear.toFixed(2),
          failed: thick > 0.8 ? 'too thick' : (clear < 1.5 ? str('main.no_daylight_under_it') : 'too short'),
        });
      }
    }
    return out;
  };
  /* How many cel materials the per frame clock walk touches. Check 16
   * asserts this returns to its boot value after a map round trip, which is
   * the measurement that catches a dead uniform kept alive forever. */
  window.__celCount = () => celTimeCount();
  /*
   * The craft's contact state, so a capture can ASSERT a landing instead of
   * describing one. descentRate and tiltDeg are the values the last ground
   * contact was judged on, and the thresholds are published beside them so a
   * reviewer does not have to go and find them.
   */
  /* The radio, for a capture or a pilot comparing links. Returns the id in
   * force so a shot can name it. */
  window.__link = (id) => {
    if (id != null) {
      rcLink.setPreset(id);
      rcLink.reset(rcNextMs);
    }
    return { id: rcLink.id, hz: rcLink.hz, delayMs: rcLink.delayMs,
      jitterMs: rcLink.jitterMs, lossPpm: rcLink.lossPpm,
      sent: rcLink.sent, dropped: rcLink.dropped,
      presets: Object.keys(LINK_PRESETS) };
  };
  /* The recorder, for a capture and for checking a session recorded
   * anything before asking a pilot to download it. */
  window.__flightLog = () => ({
    on: flightLog.on, rows: flightLog.count, seconds: flightLog.seconds,
    csv: flightLog.count > 1 ? flightLog.csv().length : 0,
  });
  /* The recorded CSV itself, so a capture can check the file the download
   * button would write without driving a file dialog. */
  window.__flightLogCsv = () => flightLog.csv();
  /* The ghost, so a capture can ASSERT a chase: what is armed, what the
   * recorder holds, where the rig is and how present it is. */
  window.__ghost = () => {
    const key = ghostCourseKey();
    const best = ghostBook.best(key);
    const previous = ghostBook.previous(key);
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
  /* Arm a ghost from wire base64 directly, the way a board fetch would,
   * so a capture can fly a chase without a board running. */
  window.__ghostLoad = (b64, name) => {
    const lap = new GhostLap(decodeGhost(ghostFromBase64(b64)), {
      label: str('main.board_lap'),
      name: name || 'Harness',
      source: 'board',
    });
    lap.timeId = 'tm-00000000';
    ghostBoardLap = lap;
    ghostChoice = 'board:tm-00000000';
    armGhost();
    syncGhostRow();
    return { armed: Boolean(ghostLap), durationMs: lap.durationMs, splits: lap.splits.length };
  };
  /* Pick a ghost mode by id, as the menu row would. */
  window.__ghostPick = (id) => {
    pickGhost(String(id));
    return ghostChoice;
  };
  /* Light the OSD gap readout as a crossing would, so a capture can look
   * at the element without having to fly two laps first. */
  window.__ghostGapShow = (deltaMs, final) => {
    ghostGap = { deltaMs: Number(deltaMs), final: Boolean(final), untilWall: performance.now() + 2800 };
    return ghostGap;
  };
  /* The session's recorded laps as wire base64, so a capture can prove the
   * record-encode-decode-chase loop end to end. */
  window.__ghostExport = (which) => {
    const key = ghostCourseKey();
    const lap = which === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
    return lap ? ghostToBase64(encodeGhost(lap)) : null;
  };
  window.__craftState = () => ({
    mode,
    wingStab: typeof sim.e.sim_wing_stab === 'function' ? sim.e.sim_wing_stab() : null,
    tune: configId,
    flownThisRun,
    landed,
    crashed,
    clipCrash: crashed,
    clipCrashKind,
    turtle: crashflipOn,
    /* Real Betaflight crashflip held by the pilot, as distinct from the
     * scripted turtle above. Published so a capture can tell the two
     * apart: they drive the same mixer path and look alike from outside. */
    manualFlip,
    crashflipActive: sim.e.sim_crashflip_active() !== 0,
    turtleWait,
    turtleFlip: turtleFlip.active,
    turtleParked: isTurtleParked(),
    turtleRecover,
    turtleResumeGate,
    banner: ui.banner ? ui.banner.textContent : '',
    /* Where the craft IS, world space, so a capture can steer toward a
     * gate instead of describing where it hoped to be. */
    worldX: shell.quad.position.x,
    worldY: shell.quad.position.y,
    worldZ: shell.quad.position.z,
    /* And how far the nose is down, the launch overlay's own reading, so a
     * capture can tell a stick that reached the plant from one that only
     * reached the menu. */
    pitchDeg: stateCurr ? pitchNoseDownDeg(stateCurr) : 0,
    /*
     * ATTITUDE, VELOCITY AND BODY RATES, so a probe can fly the aircraft on
     * feedback rather than on a stopwatch. A trick is a shape the craft
     * makes, and a stick script that cannot see which way up it is has to
     * guess how long to hold the stick. Every guess is a different loop, so
     * a check built on one measures the guess. Same numbers the recogniser
     * is fed at src/main.js's trickDetector.step call, and the same
     * conversion: sim quaternion, spawn premultiplied, in three.js space.
     */
    up: stateCurr ? (() => {
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], scoreQuat);
      scoreQuat.premultiply(qSpawn);
      scoreFwd.set(0, 1, 0).applyQuaternion(scoreQuat);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    fwd: stateCurr ? (() => {
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], scoreQuat);
      scoreQuat.premultiply(qSpawn);
      scoreFwd.set(0, 0, -1).applyQuaternion(scoreQuat);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    speed: stateCurr
      ? Math.sqrt(stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5]
        + stateCurr[6] * stateCurr[6])
      : 0,
    /* An aircraft on floats: what the water did on the last step, the ten
     * numbers of sim_float_state (buoyancy, planing force, drag, volume,
     * the two wetted lengths, the keels' load on land, the water rudders,
     * the wave drag, the water body), and whether it started afloat. */
    floats: airframeById(runAirframe).floats && typeof sim.e.sim_float_state === 'function'
      ? (() => {
        if (!floatStatePtr) {
          floatStatePtr = sim.e.malloc(10 * 8);
        }
        sim.e.sim_float_state(floatStatePtr);
        return { state: Array.from(new Float64Array(sim.e.memory.buffer, floatStatePtr, 10)), onWater: floatsOnWater() };
      })()
      : null,
    /*
     * World velocity, so a guidance law can close a loop on where the craft
     * is GOING as well as where it is.
     *
     * The plant's velocity is already in the world frame, so the axis
     * permutation and the spawn rotation are the whole conversion, the same
     * pair poseFromState uses minus the offset. Turning it by the craft's
     * attitude as well was tried and is wrong: it doubled the tracking
     * error on a straight line and quadrupled it on a circle.
     */
    vel: stateCurr ? (() => {
      simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], scoreFwd);
      scoreFwd.applyQuaternion(qSpawn);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    rates: stateCurr
      ? { p: stateCurr[11], q: stateCurr[12], r: stateCurr[13] }
      : null,
    /* The plant's own clock, s, so a probe times what the aircraft did on
     * the sim's time and not the page's, which headless runs slower. */
    simS: stateCurr ? stateCurr[0] : 0,
    /* The plant's own position, its world frame (z up, the map's spawn at
     * the origin facing +x), where its thermals are placed; the rising air
     * there; the discus launch's phase; and the HUD's notice, so a probe
     * can read what the pilot is told. */
    plantPos: stateCurr ? { x: stateCurr[1], y: stateCurr[2], z: stateCurr[3] } : null,
    airLift: stateCurr && typeof sim.e.sim_air_lift === 'function' ? sim.e.sim_air_lift(stateCurr[1], stateCurr[2], stateCurr[3]) : 0,
    discusPhase: typeof sim.e.sim_wing_discus_phase === 'function' ? sim.e.sim_wing_discus_phase() : 0,
    notice: notice ? notice.text : '',
    descentRate: lastDescent,
    tiltDeg: lastTiltDeg,
    lastHitKind,
    lastHitIndex,
    lastClosingSpeed: lastClosing,
    lastUpDot,
    grazeSpeedMax: GRAZE_SPEED_MAX,
    bounceSpeedMax: BOUNCE_SPEED_MAX,
    bounceCount,
    propPlaneMaxUpDot: PROP_PLANE_MAX_UP_DOT,
    /* Biased like the OSD's altitude and like every contact query. A
     * harness reading this against a flight is reading the same number the
     * pilot is. */
    /* Null while a world swap is under way: the world in `view` is the
     * one being left, already disposed. */
    groundClearance: mapReady ? shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, shell.quad.position.y - SURFACE_BIAS) : null,
    fpvY: lastFpvY,
    camFloor: lastCamFloor,
    camClear: lastCamClear,
    camFwdY: lastCamFwdY,
    camUpY: lastCamUpY,
    lastUpz,
    thresholds: {
      descentMax: LAND_DESCENT_MAX,
      horizontalMax: LAND_HORIZONTAL_MAX,
      tiltMaxDeg: LAND_TILT_MAX_DEG,
      tiltHardDeg: LAND_TILT_HARD_DEG,
      tipSpeedMax: LAND_TIP_SPEED_MAX,
      /* The radius the QUERY sweeps, in world metres, because that is what
       * check 15 compares against the drawn craft's world bounding box. The
       * airframe's true radius and the ratio between them are published
       * beside it so neither can be mistaken for the other. */
      craftRadius: CRAFT_WORLD_R,
      craftRadiusTrue: CRAFT_R,
      /* And the span up and down, the aircraft's own metres, so a check can
       * hold the drawn machine against the hull that sweeps it on every
       * axis rather than only across. scripts/craft-check.js does. */
      craftUpTrue: CRAFT_V_UP,
      craftDownTrue: CRAFT_V_DOWN,
      worldScale: WORLD_SCALE,
    },
    lap: race.lap,
    bestLapMs: race.bestLapMs ? race.bestLapMs() : null,
    bestThreeMs: race.bestThreeMs ? race.bestThreeMs() : null,
  });
  /* Capture hook: seat the plant on the grass under the current xz.
   * cameraDown and invertedHold freeze the integrator (poseLock) so a
   * capture can photograph the lens before the hull tumbles. inverted
   * is the turtle path: wait for pitch or roll, then a guaranteed flip. */
  window.__seatCraft = (kind) => {
    if (!stateCurr) {
      return null;
    }
    poseFromState(stateCurr, pProbe);
    const hy = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    const seatY = kind === 'invertedAir' ? hy + 4 : hy + REST_HEIGHT;
    worldPosToSim(pProbe.x, seatY, pProbe.z, pSim);
    let qw = 1;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    if (kind === 'inverted' || kind === 'invertedHold' || kind === 'invertedAir') {
      qw = 0;
      qx = 1;
    } else if (kind === 'cameraDown') {
      const h = Math.PI / 4;
      qw = Math.cos(h);
      qy = Math.sin(h);
    }
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, qw, qx, qy, qz);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    sim.rest();
    setCrashflip(false);
    turtleRecover = false;
    introMs = -1;
    camOverride = null;
    poseLock = kind === 'cameraDown' || kind === 'invertedHold';
    landed = kind !== 'cameraDown' && kind !== 'inverted' && kind !== 'invertedHold'
      && kind !== 'invertedAir';
    takingOff = false;
    /* Same reason as __placeCraft: a seat is a teleport. */
    obsHasPrev = false;
    obsPhase = 0;
    parkedLift = 0;
    adoptSimClock();
    acc = 0;
    groundY = hy;
    stateCurr = readState();
    statePrev = stateCurr;
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    lastClearance = kind === 'invertedAir' ? 4 : REST_HEIGHT;
    turtleOnSupport = lastGroundHits > 0 && kind !== 'invertedAir';
    if (kind === 'inverted') {
      turtleOnSupport = true;
      beginTurtleWait(true);
    }
    lastUpz = plantUpZ(stateCurr);
    {
      const uClamp = lastUpz > 1 ? 1 : lastUpz < -1 ? -1 : lastUpz;
      lastTiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
    }
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qPrev);
    qPrev.premultiply(qSpawn);
    poseFromState(stateCurr, pCurr);
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
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    lastFpvY = fpvPos.y;
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
    shell.quad.visible = false;
    fpvQuat.copy(qPrev).multiply(qTilt);
    shell.camera.position.copy(fpvPos);
    shell.camera.quaternion.copy(fpvQuat);
    shell.camera.fov = ui.settings.cameraFov;
    shell.camera.updateProjectionMatrix();
    return window.__craftState();
  };
  /* Harness: drop the plant at a world point, airborne, so a capture can
   * prove a clip-through crash without flying there. fromX/Y/Z is last
   * frame's pose when the test is a punch-through chord. */
  window.__placeCraft = (x, y, z, fromX, fromY, fromZ) => {
    if (!stateCurr) {
      return null;
    }
    worldPosToSim(x, y, z, pSim);
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, 1, 0, 0, 0);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    sim.rest();
    setCrashflip(false);
    turtleRecover = false;
    turtleWait = false;
    setTurtleParkMotors(false);
    introMs = -1;
    camOverride = null;
    poseLock = false;
    landed = false;
    takingOff = false;
    launchStaging = false;
    flownThisRun = true;
    crashed = false;
    clipCrashKind = '';
    clipCrashUntil = 0;
    clipGraceUntil = 0;
    mode = 'flight';
    ui.show('flight');
    resetClipWatch(clipWatch);
    /* A place is a teleport. Re-seed the contact pass or its next sweep is
     * the segment from wherever the craft used to be to here, which is a
     * line through half the map and reads as a punch through every solid
     * on it. */
    obsHasPrev = false;
    obsPhase = 0;
    adoptSimClock();
    acc = 0;
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qPrev);
    qPrev.premultiply(qSpawn);
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
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
  window.__stepTrace = () => ({
    n: stepTrace.n,
    pre: Array.from(stepTrace.pre.subarray(0, stepTrace.n)),
    plane: Array.from(stepTrace.plane.subarray(0, stepTrace.n)),
    post: Array.from(stepTrace.post.subarray(0, stepTrace.n)),
    inputs: inputTrace.slice(),
  });
  /*
   * Which tune the module is actually running, read back from the module
   * rather than from the menu, plus the config coverage counters from
   * sim_bf_debug. A tune that is selected and not loaded, or loaded and
   * silently ignored, is the failure this exposes; scripts/preset-lint.js
   * asserts the same numbers headless. Harness only.
   */
  window.__tune = () => ({
    id: configId,
    name: configName,
    menu: ui.settings.tune,
    rates: ratesSummary(ui.settings.rates),
    /* The menu's own roll srate, in the firmware's units, so it sits beside
     * rollSrate below and the two can be compared without converting. */
    rollSrateSet: ui.settings.rates.roll.srate,
    offered: TUNES.map((t) => t.id),
    applied: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(13) : null,
    inert: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(14) : null,
    unknown: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(15) : null,
    pRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(17) : null,
    dMaxRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(21) : null,
    tpaRate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(22) : null,
    rollSrate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(42) : null,
    /*
     * The rate profile as the module holds it, not as the menu remembers
     * it. The Rates screen is now the only way a pilot changes any of
     * these, so this is where a row that writes nothing would show up: the
     * menu would read 900 and the module would still say 67.
     */
    profile: {
      rates_type: moduleGet(sim, 'rates_type'),
      roll_rc_rate: moduleGet(sim, 'roll_rc_rate'),
      roll_srate: moduleGet(sim, 'roll_srate'),
      pitch_srate: moduleGet(sim, 'pitch_srate'),
      yaw_srate: moduleGet(sim, 'yaw_srate'),
      roll_expo: moduleGet(sim, 'roll_expo'),
      throttle_limit_type: moduleGet(sim, 'throttle_limit_type'),
      throttle_limit_percent: moduleGet(sim, 'throttle_limit_percent'),
    },
  });
  window.__setTune = (id) => {
    ui.settings.tune = id;
    applySettings(ui.settings);
  };
  /*
   * The PID picture in one read: what the menu stores, what the composed
   * block says, and what the module is flying, each straight from its own
   * source so a disagreement between them is visible as a disagreement.
   * Harness only; scripts/shots.js asserts against this.
   */
  window.__pids = () => ({
    id: configId,
    menu: JSON.parse(JSON.stringify(ui.settings.pids ?? {})),
    block: pidsText,
    module: {
      mode: moduleGet(sim, 'simplified_pids_mode'),
      master: moduleGet(sim, 'simplified_master_multiplier'),
      p_roll: moduleGet(sim, 'p_roll'),
      i_roll: moduleGet(sim, 'i_roll'),
      d_roll: moduleGet(sim, 'd_roll'),
      d_min_roll: moduleGet(sim, 'd_min_roll'),
      f_roll: moduleGet(sim, 'f_roll'),
      p_pitch: moduleGet(sim, 'p_pitch'),
      p_yaw: moduleGet(sim, 'p_yaw'),
      f_yaw: moduleGet(sim, 'f_yaw'),
    },
  });
  /*
   * The thumb sticks as the overlay believes them, plus what the input
   * ladder and the module made of it: source, angle mode and altitude, so
   * one read answers "did the thumb reach the craft". null on a device
   * with no touch points. Harness only.
   */
  window.__touch = () => (touch ? {
    ...touch.debug(),
    primary: input.isTouchPrimary(),
    source: input.stats().source,
    angle: angleModeOn,
    alt: readState()[3],
  } : null);
  /*
   * What the stick path is ACTUALLY doing, measured rather than assumed.
   * padHz is how often the browser refreshes the Gamepad object, sampleHz how
   * often a changed value reaches the queue, rcHz the fixed grid handed to
   * Betaflight. If padHz sits at the frame rate the browser is rAF-locked on
   * gamepad input and only WebHID will move it. Harness only.
   */
  /*
   * The same numbers, on the path a pilot can actually send us.
   *
   * __stickPath below is a console readback and has been since round 19,
   * which means the one measurement that settles "is this browser rAF-locked
   * on gamepad input" has only ever been reachable by somebody who already
   * knew to open DevTools and type it. Nobody did. Five feel reports later
   * the question was still open, so the probe goes where the reports are
   * written: ui.bugSnapshot calls this at the moment the pilot hits send.
   *
   * fps rides along because it is the number padHz has to be read against.
   * padHz of 60 means nothing on its own; padHz of 60 on a 60 fps display
   * means the browser is handing us one stick value per frame and no amount
   * of polling will move it.
   */
  ui.setStickProbe(() => ({
    ...input.stats(),
    rcHz: RC_HZ,
    fps: Math.round(fps),
  }));
  window.__stickPath = () => ({
    ...input.stats(),
    rcHz: RC_HZ,
    fps: Math.round(fps),
    pending: rcPending.length,
    held: { ...rcHeld },
    simStepIdx,
    lastTs,
    rcNextMs,
    moduleMs: Math.round(readState()[0] * 1000),
    configGen,
  });
  window.__boot = () => ({
    firstFrameMs,
    worstBlockMs,
    worstShellMs,
    worstAudioMs,
    frames,
  });
  /*
   * Which gate the race actually wants, and where it is on screen. G3 says
   * the next gate must be the brightest thing in the frame, and every G3
   * measurement taken so far measured the wrong object: a parked capture
   * camera looks at one gate while the race's next gate is somewhere else
   * entirely, so the bright ring in the frame was some later gate on the
   * glow ladder. A capture that claims anything about the target has to
   * record which gate that is and where it is, and this is that record.
   *
   * Screen coordinates are CSS pixels with the origin top left, matching
   * what scripts/pixels.js reads out of a PNG. Harness only, called on
   * demand, never per frame.
   */
  window.__nextGate = () => {
    /*
     * A FREESTYLE MAP HAS NO GATES, AND THAT IS AN ANSWER, NOT A FAILURE.
     *
     * scripts/shots.js records a harness fault and exits non zero when this
     * handle does not return a gate, which is correct on the race field: a
     * capture that claims anything about the target has to know which gate
     * the race actually wants, and silently capturing without one is how
     * every G3 measurement before it measured the wrong object. On a map with
     * no gates the same rule makes every capture fail even when the frame is
     * perfect.
     *
     * So the opt out is a property of the PAGE, not a flag on the command
     * line. The handle says which map it is and that the map is gateless, and
     * the sidecar accepts that and nothing else. A careless `--nogate` on the
     * race field would have weakened the gate for the map that needs it; this
     * cannot, because the race field can never report gateless true.
     */
    if (view.gates.length === 0) {
      const el0 = shell.renderer.domElement;
      return {
        viewport: { w: el0.width, h: el0.height },
        mapId: view.id,
        mapMode: view.mode,
        gateless: true,
        gates: [],
      };
    }
    /* Device pixels, not CSS pixels. The PNG a capture writes is the drawing
     * buffer, which is clientWidth times the pixel ratio, so a handle that
     * promises PNG coordinates and returns CSS ones is silently half scale
     * on any HiDPI display. `el.width` IS the drawing buffer. */
    const el = shell.renderer.domElement;
    const vw = el.width;
    const vh = el.height;
    const project = (v) => {
      const p = v.clone().project(shell.camera);
      /* Behind the camera, project divides by a negative w, so x and y
       * reflect through the principal point and land somewhere plausible
       * inside the frame. Publishing that as a position is how a consumer
       * that does not also read ndcZ gets a confident wrong answer, so the
       * flag travels with the numbers. */
      const inFront = p.z > -1 && p.z < 1;
      return {
        x: (p.x * 0.5 + 0.5) * vw,
        y: (1 - (p.y * 0.5 + 0.5)) * vh,
        ndcZ: p.z,
        inFront,
        mirrored: !inFront,
      };
    };
    const seq = [];
    for (let step = 0; step < 3; step += 1) {
      const raceIdx = (race.next + step) % race.gates.length;
      const sceneIndex = race.gates[raceIdx].idx;
      const gt = view.gates[sceneIndex];
      const ap = gt.aperture;
      const centre = new THREE.Vector3(gt.position.x, gt.position.y + ap.centreY, gt.position.z);
      const top = new THREE.Vector3(centre.x, centre.y + ap.clearH * 0.5, centre.z);
      const bottom = new THREE.Vector3(centre.x, centre.y - ap.clearH * 0.5, centre.z);
      const distance = shell.camera.position.distanceTo(centre);
      /* Camera space depth, which is what a projected size scales with. The
       * Euclidean distance is not: at 55 degrees off axis the two differ
       * enough to overstate a projected size by 74 percent, and any check of
       * aperturePx against the geometry has to divide by this one. */
      const depth = -centre.clone().applyMatrix4(shell.camera.matrixWorldInverse).z;
      const sc = project(centre);
      const st = project(top);
      const sb = project(bottom);
      /* aperturePx is the pixel distance between two projected points, and
       * that is only the aperture when both points are actually in front of
       * the camera. Without this gate the handle published 17988.1 px for
       * gates 0.45 m BEHIND a zenith pointing camera, and a gate 126 m
       * behind read 14.900 px against 14.910 for the same gate in front,
       * because the sign flip cancels under an absolute value. It is also
       * only ever the VERTICAL chord: a yawed gate is an ellipse on screen
       * and its width is not this number. */
      const apertureValid = st.inFront && sb.inFront;
      seq.push({
        step,
        sceneIndex,
        flyOrder: gt.flyOrder,
        /* A per frame sample of a quantity that pulses on the wall clock,
         * not a property of the gate. */
        glowGainSampled: gt.glowMat.uniforms.uGain.value,
        aperture: ap,
        world: { x: centre.x, y: centre.y, z: centre.z },
        distance,
        depth,
        screen: sc,
        aperturePx: apertureValid ? Math.abs(sb.y - st.y) : null,
        aperturePxAxis: str('main.vertical_chord_only_not_the_width'),
        /* A single point test with no clipping and no occlusion. It answers
         * "is the aperture centre inside the frame", which is NOT "can the
         * pilot see the target": a gate whose ring fills a third of the
         * frame from the side reports false here. Do not use it alone to
         * settle G3. */
        centreInFrame: sc.inFront && sc.x >= 0 && sc.x < vw && sc.y >= 0 && sc.y < vh,
      });
    }
    return {
      viewport: { w: vw, h: vh },
      mapId: view.id,
      mapMode: view.mode,
      gateless: false,
      raceNext: race.next,
      nextSceneIndex: race.nextSceneIndex(),
      lap: race.lap,
      gates: seq,
    };
  };
  /*
   * WHAT EVERY GATE IS WEARING, so the three tier rule is a check and not
   * an impression.
   *
   * "Only the next obstacle is lit" is a claim about fourteen objects, and
   * the only way to read that off a screenshot is to find fourteen gates in
   * the frame first. This reports the tier each one is actually dressed in,
   * off the materials the renderer drives, so a run can assert that exactly
   * one gate is lit, exactly one sits on the middle tier, and the rest are
   * dark. Harness only, called on demand, never per frame.
   */
  /*
   * The PAINT's answer to "is this point on the side the gate is flown
   * from", straight out of the renderer, so a check can hold it against
   * race.js's own scoring frame at a grid of points instead of trusting
   * that two files agree. A dive gate wearing red on the way in was
   * exactly this disagreement, found by a pilot and not by a check.
   * Harness only.
   */
  window.__aimProbe = (x, y, z) => (view.approachSide ? view.approachSide(x, y, z) : null);
  window.__gateTiers = () => {
    const a = view.targetAim ? view.targetAim() : null;
    return {
      next: race.freestyle ? -1 : race.nextSceneIndex(),
      follow: race.freestyle ? -1 : race.followSceneIndex(),
      aim: a ? { active: a.active, correct: a.correct, distance: a.distance } : null,
      gates: view.gates.map((gt, i) => ({
        sceneIndex: i,
        flyOrder: gt.flyOrder,
        virtual: Boolean(gt.virtual),
        /* The tier as the MATERIALS have it, not as the shell believes it
         * handed out. Reading back what the shell wrote asserts nothing. */
        tier: !gt.ringMat.visible
          ? 'dark'
          : (gt.glowMat.visible ? 'target' : 'follow'),
        ring: `#${gt.ringMat.color.getHexString()}`,
        haloOn: gt.haloMat.visible,
        glowOn: gt.glowMat.visible,
        /* Which of a stacked structure's openings is actually lit, read off
         * the meshes rather than off what the shell asked for. A designed
         * stack names one hole and must light exactly that one. */
        litOpenings: gt.ringMeshes
          ? gt.ringMeshes.map((m, k) => (m.visible ? k : -1)).filter((k) => k >= 0)
          : null,
        cueOn: Boolean(gt.cueGroup && gt.cueGroup.visible),
        wrong: gt.fillMat ? gt.fillMat.uniforms.uWrong.value : null,
      })),
    };
  };
  /*
   * The quad on screen, for T6. Reports the projected pixel box of the
   * craft's own world bounding box and, separately, the pixel span a
   * 0.25 m segment subtends at the craft's distance, because a 250 mm quad
   * is quoted on its motor to motor diagonal and the model's box is not
   * the same measurement. Both are published so a reviewer can choose.
   */
  window.__quadScreen = () => {
    const el = shell.renderer.domElement;
    const vw = el.width;
    const vh = el.height;
    /* With the camera inside the airframe the 0.25 m span sits at zero
     * camera space depth, the projection divides by zero, and the result is
     * Infinity, which JSON.stringify launders into null so a reader cannot
     * tell it from "not applicable". Four of the bounding box's eight
     * corners are behind the near plane in the same state, so the projected
     * box brackets a reflection rather than a box. Both are refused here
     * instead of being published and explained. */
    const dist = shell.camera.position.distanceTo(shell.quad.position);
    if (dist < shell.camera.near) {
      return {
        viewport: { w: vw, h: vh },
        visible: shell.quad.visible,
        distance: dist,
        boxPx: null,
        span250mmPx: null,
        refused: str('main.camera_is_m_from_the_craft', { dist: dist.toFixed(3), near: shell.camera.near }),
      };
    }
    const box = new THREE.Box3().setFromObject(shell.quad);
    const size = new THREE.Vector3();
    box.getSize(size);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(shell.camera);
      const px = (corner.x * 0.5 + 0.5) * vw;
      const py = (1 - (corner.y * 0.5 + 0.5)) * vh;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(shell.camera.quaternion);
    const a = shell.quad.position.clone().addScaledVector(right, -0.125).project(shell.camera);
    const b = shell.quad.position.clone().addScaledVector(right, 0.125).project(shell.camera);
    const span = Math.abs((b.x - a.x) * 0.5 * vw);
    return {
      viewport: { w: vw, h: vh },
      visible: shell.quad.visible,
      distance: dist,
      /* An axis aligned bounding box over the whole group INCLUDING the
       * spinning prop discs, so it breathes with prop angle: sampled between
       * 0.282 and 0.320 m across this build's captures. It is not the motor
       * to motor diagonal that a 250 mm class quad is named for, and it must
       * not be quoted as the size of the quad. */
      worldSizeSampled: { x: size.x, y: size.y, z: size.z },
      worldSizeNote: str('main.aabb_of_the_whole_group_including'),
      boxPx: Number.isFinite(maxX - minX) ? { w: maxX - minX, h: maxY - minY, x: minX, y: minY } : null,
      span250mmPx: Number.isFinite(span) ? span : null,
    };
  };
  /* Which world is loaded, what it cost, and what is solid in it. Harness
   * only; nothing in the shell reads these. */
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
  window.__map = () => ({
    id: view.id,
    name: view.name,
    mode: view.mode,
    graphics: view.graphics,
    gates: view.gates.length,
    spawn: { x: startX, y: startY, z: startZ, yaw: startYaw },
    ready: mapReady,
    references: view.references ?? null,
    loading: window.__loading ? window.__loading.timings : null,
    /* The loading bar's module weight for this map, so check 16 can assert
     * the typed number against what the browser actually fetched. */
    expectedModules: MAP_MODULE_COUNT[view.id] ?? null,
    ...(view.stats ? view.stats() : {}),
  });
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
    view.setGateState(list);
    return true;
  };
  window.__animMs = () => animDrawnMs;
  /* The declared departure from MultiGP's published obstacle dimensions, so
   * check 15 can assert the threshold file and the course agree about how big
   * a gate is rather than each believing its own copy. Harness only. */
  window.__gateScale = () => GATE_SCALE;
  /*
   * Drive the active map's animation clock to an arbitrary step, so a capture
   * can put a moving part where it needs it instead of waiting for it.
   *
   * The city's train circles the planet in about 43 s of simulated time and
   * this container renders two frames a second, so waiting for it to reach
   * the crossing is a minute and a half of wall clock that no check can
   * afford. It takes the same step count the frame loop passes, so a capture
   * driving it sees exactly the town a pilot would at that instant. Harness
   * only; nothing in the shell reads it.
   */
  window.__animTo = (step) => {
    view.updateAnim(step);
    return view.stats ? (view.stats().trainOffset ?? null) : null;
  };
  /* The clocks the traffic is drawn on: the one the last frame's world was
   * animated at, the lap clock, and the room's (null out of a room), for
   * scripts/traffic-sync-check.js. Harness only. */
  window.__traffic = () => ({
    drawn: animDrawnMs,
    lap: simTimeMs,
    offset: trafficOffsetMs,
    room: roomLinkState.state().phase === 'open' ? roomLinkState.roomNow() : null,
    /* The world's sound of it: what the worklet last said it voiced
     * (src/render/world-audio.js stats), null before the mix is up. */
    sound: worldAudio.stats,
  });
  /* The active map's scene graph, for measurement. tests/lib/checks.js walks
   * it to assert that reference objects measure what this project claims they
   * measure, which is the only way a scale error gets caught by a check
   * rather than by a reviewer's eye. Harness only. */
  window.__mapScene = () => view.scene;
  /* The three.js namespace, so a measurement in the page can build a Box3
   * without importing a second copy of the library. Harness only. */
  window.__three = THREE;
  /* The roofs (src/maps/alps/roofs.js): each one's frame, plate, wall
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
  /* Set the active map's distance cull radius, for the sweep that chooses it.
   * Null restores the map's own value. Harness only. */
  window.__cullRadius = (r) => (view.setCullRadius ? view.setCullRadius(r) : null);
  /* The active map's contact surface, exactly as the ground sweep queries it.
   * `fromY` is what makes a deck climbable from above and transparent from
   * below, so a capture can assert that rather than describe it. */
  window.__surface = (x, z, fromY) => view.height(x, z, fromY);
  /*
   * Where the camera is, and what is directly under it. The intro camera
   * once ended its pan INSIDE a launch block and the only way to see it was
   * to look at a screenshot and argue about it; this reports the clearance
   * as a number so a capture can assert it. Harness only.
   */
  window.__camGround = () => ({
    x: shell.camera.position.x,
    y: shell.camera.position.y,
    z: shell.camera.position.z,
    /* Where it looks and how wide, so a capture can project a point. */
    quat: shell.camera.quaternion.toArray(),
    fov: shell.camera.fov,
    aspect: shell.camera.aspect,
    ground: view.height(shell.camera.position.x, shell.camera.position.z,
                        shell.camera.position.y),
    clearance: shell.camera.position.y
      - view.height(shell.camera.position.x, shell.camera.position.z,
                    shell.camera.position.y),
    /* The title camera's lens shift, as a fraction of the frame, or null
     * when the lens is centred. Reported here because it is the other half
     * of where the shot is pointed: a check that reads the position alone
     * cannot tell a centred frame from one offset by a fifth of its height,
     * and it is the thing that has to be gone the moment the pilot flies. */
    shift: shell.camera.view && shell.camera.view.enabled
      ? {
        x: shell.camera.view.offsetX / shell.camera.view.fullWidth,
        y: shell.camera.view.offsetY / shell.camera.view.fullHeight,
      }
      : null,
  });
  /*
   * Set the sticks directly, bypassing the keyboard ramp.
   *
   * Holding W is how a player takes off and it is NOT how a capture can. W
   * ramps the throttle while held, and this container renders a city frame in
   * about half a second, so five seconds of held key is ten frames of ramp and
   * the craft never reaches the 0.25 takeoff threshold. A capture that cannot
   * take off cannot assert anything about flight, which is how the 07-inflight
   * capture in round 10's evidence turned out to be a picture of the start
   * line. Harness only; nothing in the shell reads it.
   */
  window.__stick = (roll, pitch, yaw, throttle) => {
    /*
     * A REAL override now, not a poke into the keyboard state. The old
     * form wrote this.kb and the very next poll recomputed roll, pitch and
     * yaw from the held KEYS, so only the throttle survived: a capture
     * could climb and never steer, which several rounds of screenshot
     * work rediscovered the hard way. The override sits at the top of
     * poll()'s ladder and holds like a radio's gimbals until the next
     * write. Call with no arguments to release it back to the keyboard.
     */
    if (roll == null) {
      input.harnessChannels = null;
      input.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      rcPending.length = 0;
      turtleResumeGate = false;
      turtleRecover = false;
      return null;
    }
    input.harnessChannels = { roll, pitch, yaw, throttle };
    return { roll, pitch, yaw, throttle };
  };
  /* Is anything solid on the segment from p to q? Same call the frame loop
   * makes, so a capture can assert what a quad would hit. */
  window.__hit = (px, py, pz, qx, qy, qz, vh = vHalfFrame) => {
    /* The frame loop passes its tilt aware half extent and the craft's
     * world quaternion to every real query. A probe that left those out
     * was asking a different question from the one the game asks. */
    const k = view.colliders.hit(
      px, py, pz, qx, qy, qz, vh,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
      craftVerticalOffset(),
    );
    return {
      kind: k < 0 ? null : view.colliders.kindName(k),
      index: view.colliders.hitIndex,
      t: view.colliders.hitT,
      pen: view.colliders.hitPen,
      nx: view.colliders.hitNx,
      ny: view.colliders.hitNy,
      nz: view.colliders.hitNz,
      /* The fixed wing's part it met, -1 for the discs. */
      part: view.colliders.hitArm ? view.colliders.hitPart : -1,
    };
  };
  /* Harness only: a flat canopy over the whole of the map now loaded, its
   * top at world y `top`, for scripts/canopy-check.js to fly the contact
   * pass's canopy call on a map that has no forest volume of its own. The
   * next map load builds its view afresh without it. */
  window.__canopyTop = (top) => {
    view.canopyAt = () => top;
  };
  /* Shadow pass on or off, so the ledger can attribute draw calls between the
   * colour pass and the shadow pass rather than guessing at the split.
   * Harness only. */
  window.__shadows = (on) => {
    shell.renderer.shadowMap.enabled = !!on;
    shell.renderer.shadowMap.needsUpdate = true;
    return shell.renderer.shadowMap.enabled;
  };
  /* A harness that names a world wants that world at the title, the way
   * ?map= does, so it ends the title's own. */
  window.__setMap = (id) => {
    titleWorld = null;
    paintBest();
    ui.settings.map = id;
    return swapMap(id);
  };
  /*
   * The title camera's own loop, sampled off a clock rather than off the
   * frame rate, so a check can walk a whole attract cycle in one call and
   * ask where the shot goes and what it is pointed at.
   *
   * WHY THIS EXISTS. The attract camera is the only camera in the shell with
   * nothing to stop it: the quad has colliders and the free camera has a
   * pilot, but this one is a spline and it will fly through a wall without
   * complaint. It was doing so in three of the four freestyle worlds, and
   * the only evidence was a thumbnail that looked wrong.
   * scripts/attract-check.js walks these samples through window.__hit and
   * says so instead.
   *
   * A PRIVATE CAMERA AND A PRIVATE COPY OF THE SHOT. Driving the live
   * attract camera would move the title behind whoever is looking at it and
   * would leave its bank filter holding a timestamp from a probe. Harness
   * only.
   */
  window.__attract = (count = 240) => {
    const probe = makeAttractCamera(view);
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    const dir = new THREE.Vector3();
    const period = probe.periodMs > 0 ? probe.periodMs : 1000;
    const n = Math.max(8, Math.min(2000, Math.round(count)));
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const ms = (period * i) / n;
      probe.update(ms, cam, {});
      cam.getWorldDirection(dir);
      out.push({
        ms,
        x: cam.position.x,
        y: cam.position.y,
        z: cam.position.z,
        dx: dir.x,
        dy: dir.y,
        dz: dir.z,
      });
    }
    return { map: view.id, kind: probe.kind, periodMs: period, samples: out };
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
 * There is no boot() call here, and there has not been a working one for a
 * long time.
 *
 * This file used to end with `boot().catch(...)`, called with no argument.
 * boot() destructures its argument, so that threw a TypeError on every
 * single load, and the catch appended a banner reading "The simulator could
 * not start." to #ui. Nobody ever saw it, because boot.js calls
 * main.boot({...}) a moment later and Ui.build() clears #ui before the next
 * paint. A load that failed every time and was hidden by the timing of an
 * unrelated line is worse than one that fails visibly: any change to how the
 * Ui handles its root would have put a false failure banner on the front
 * page.
 *
 * boot.js owns the entry point. It passes the loading screen, the boot
 * timestamp and the map id, and it routes a rejection to loading.fail(),
 * which is the screen that can actually say what went wrong and what to do
 * about it.
 */

