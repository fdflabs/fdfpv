/*
 * items.js: what each menu screen lists.
 *
 * Every screen of the shell is a list of rows, and some screens put cards
 * above the rows. items() is the one list the cursor walks, the renderer
 * draws and the checks read: the screen's own rows, with a Back to the
 * title turned into Leave while the pilot is in a room, and the buttons of
 * the update bar and the room bar on the end so a pad can reach them.
 *
 * Each screen is one function here, given the Ui and its settings, and
 * returning plain rows (src/ui/rows.js makes the ones that hold a value).
 * The screens read the Ui's state and the modules behind it; they never
 * draw. The rows they return are rebuilt on every render, so nothing in
 * them is kept between two calls.
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

import { airframeById } from '../../configs/airframes.js';
import {
  PID_AXES, PID_FIELDS, PID_FIELD_SPECS, SLIDER_KEYS, SLIDERS, pidsAdjusted, pidsEntry, pidsSummary, setPidSlider, setPidsExpert,
} from '../../configs/pids.js';
import {
  RATES_STORAGE_WARNING, listRatePresets, presetMatching, ratePresetById,
} from '../../configs/ratepresets.js';
import {
  RATE_DEFAULTS, RATE_FIELDS, RATE_TYPES, RATE_TYPE_LABEL, THROTTLE_CAP_CHOICES, THROTTLE_CURVE_FIELDS,
  formatRate, fullStickDeg, hoverStickPercent, normaliseRates, profileForType, rateField, ratesAreDefault, ratesSummary,
} from '../../configs/rates.js';
import { CUSTOM_TUNE, tuneById } from '../../configs/registry.js';
import { formatScore } from '../game/score.js';
import { MOUSE_CENTRES, MOUSE_EXPOS, MOUSE_SENS } from '../input/input.js';
import { LINK_PRESETS } from '../input/link.js';
import { STICK_MODES, normaliseStickMode } from '../input/stickmode.js';
import { MAPS, mapById } from '../maps/registry.js';
import { PERF_MODES } from '../render/dynres.js';
import {
  CAMERA_ANGLE_DEFAULT, CAMERA_ANGLE_MAX, CAMERA_ANGLE_MIN, CAMERA_FOVS, cameraTiltRad, clampCameraAngle,
} from '../render/lens.js';
import { GRAPHICS_IDS, graphicsLabel, graphicsNote, normalizeGraphics } from '../render/quality.js';
import { musicIds, trackById } from '../render/tracks.js';
import { accountsAvailable } from '../share/account.js';
import { flightTotals } from '../share/flighttime.js';
import { nameRules, readAccount, readPilotName } from '../share/pilot.js';
import { lapSlot, readPendingTime, readPostedBest } from '../share/session.js';
import { activeCourseSummary } from '../share/summary.js';
import {
  LOCALES, LOCALE_NAMES, currentLocale, plural, rememberLocale, str,
} from '../strings/index.js';
import { customisable } from './builds.js';
import { flightTimeText } from './carousel.js';
import { formatTime } from './format.js';
import { MARK_STYLES } from './peermarks.js';
import { choice, number, stampIds, stepper, toggle } from './rows.js';
import {
  AVX_PALETTES, FLIGHT_MODES, FLIGHT_STYLES, FPS_CAPS, FREESTYLE_SCORING, HUD_STYLES, LAP_COUNTS, LATENCY_MODES,
  PACK_VOLTAGES, RENDER_SCALES, WEIGHT_STOCK, clampWeight, hudStyleFor, tuneChoices,
} from './settings.js';
import { VIEW_LABEL } from './trickfilm.js';
import { craftSvg, hubWays } from './ways.js';
/* A cycle: ui.js installs this module. These are read only inside the
 * screen functions, after both modules have run, never at this module's
 * top level. */
import {
  FREESTYLE_SCORING_LABEL, SCREEN_TITLES, YAW_TIP_RATE, courseCardKey, courseCardRows, craftItem, lapCraftOf, liveListing,
  liveWorld, padTroubleItem, scoringNote, seatedFreestyleMap,
} from './ui.js';

/*
 * Read once when the module loads, like every other sentence the shell
 * builds its rows from: a language change reloads the page, so the table
 * cannot change under it.
 */
const MID_RUN_WARNING = str('ui.changing_it_during_a_run_puts');

/* The camera tilt from which the yaw tip is worth offering, and the rate
 * systems whose Max rate column is the number the tip would set. */
const YAW_TIP_TILT = 40;
const YAW_TIP_TYPES = new Set(['ACTUAL', 'QUICK']);

/* ---- rows several screens share ---- */

const backRow = () => ({ label: str('ui.back'), action: 'back' });
const titleRow = () => ({ label: str('ui.back_to_title'), action: 'title' });
const myTracksRow = () => ({ label: str('ui.my_tracks'), action: 'mytracks', note: str('ui.back_to_the_list_of_tracks') });
const creditsRow = () => ({ label: str('ui.credits'), action: 'credits', note: str('ui.who_made_this_who_flew_it') });

/* The flight feel report's door, where a pilot has just been flying. */
const feelRow = () => ({ label: str('ui.flight_feel'), action: 'feel', note: str('ui.tell_the_tune_work_how_the') });

/* Quad or Plane: the machine's door, valued at what it is flying. */
function machineRow(s, note) {
  const af = airframeById(s.airframe);
  const tune = tuneById(s.tune).name;
  return {
    label: af.fixedWing ? str('ui.plane') : str('ui.quad'),
    value: af.fixedWing ? `${af.short}, ${tune}` : tune,
    action: 'quad',
    note,
  };
}

/* The rates room's door, with the whole curve on the row. */
const ratesRow = (s, note) => ({ label: str('ui.rates'), value: ratesSummary(s.rates), action: 'rates', note });

/* The tune row: the PIDs room's door, saying when the quad flies something
 * other than the tune's own numbers. */
function tuneRow(s, midRun) {
  const tune = tuneById(s.tune);
  const adjusted = pidsAdjusted(s.pids, s.tune);
  return {
    label: str('ui.tune'),
    value: adjusted ? `${tune.name}, ${pidsSummary(s.pids, s.tune).toLowerCase()}` : tune.name,
    action: 'pids',
    note: str('ui.opens_where_the_tune_is_chosen', { note: tune.note, pids: SCREEN_TITLES.pids, v3: midRun ? MID_RUN_WARNING : '' }),
  };
}

/* The graphics preset, which forgets the automatic choice once picked. */
function graphicsRow(s) {
  const id = normalizeGraphics(s.graphics);
  return choice(str('ui.graphics'), graphicsNote(id), GRAPHICS_IDS, id, graphicsLabel, (v) => {
    s.graphics = v;
    s.graphicsAuto = false;
  });
}

/* The flight style, as the launch card and the Freestyle room offer it. */
function flightStyleRow(label, arcadeNote, expertNote, s) {
  const arcade = s.flightStyle === 'arcade';
  return choice(
    label,
    arcade ? arcadeNote : expertNote,
    FLIGHT_STYLES,
    arcade ? 'arcade' : 'expert',
    (id) => (id === 'arcade' ? str('ui.arcade') : str('ui.expert')),
    (id) => { s.flightStyle = id; },
  );
}

const crashDamageRow = (s) => toggle(str('ui.crash_damage'), str('ui.crash_damage_note'), s.crashDamage !== false, (v) => {
  s.crashDamage = Boolean(v);
});

/* The radio link preset, with the figures of the chosen one in the note. */
function linkRow(s, perfectNote, figuresKey) {
  const p = LINK_PRESETS[s.link];
  return choice(
    str('ui.radio_link'),
    s.link === 'perfect' ? perfectNote : str(figuresKey, { hz: p.hz, delayMs: p.delayMs, jitterMs: p.jitterMs }),
    Object.keys(LINK_PRESETS),
    s.link,
    (id) => LINK_PRESETS[id].label,
    (id) => { s.link = id; },
  );
}

/* A sound level, nudged a step at a time between zero and ten. */
function levelRow(label, note, s, key) {
  return stepper(label, note, `${s[key]}`, (d) => {
    s[key] = Math.max(0, Math.min(10, s[key] + d));
  });
}

const padTrouble = (ui) => {
  const row = padTroubleItem(ui.padInfo);
  return row ? [row] : [];
};

/* ---- the title ---- */

function titleRows(ui, s) {
  if (ui.onGate()) {
    return gateRows(ui);
  }
  const map = MAPS.find((m) => m.id === s.map) ?? MAPS[0];
  const seat = map.id === 'track' ? activeCourseSummary() : null;
  const world = seatedFreestyleMap(s);
  /* The guided first flight needs gates under it: race mode with a track. */
  const guided = ui.firstRun && ui.mode === 'race' && ui.seatMatchesMode();
  const fly = guided
    ? {
      label: str('ui.first_flight'),
      action: 'firstflight',
      primary: true,
      note: seat && seat.name
        ? str('ui.levelled_off_with_the_sticks_drawn', { name: seat.name })
        : str('ui.levelled_off_with_the_sticks_drawn_2'),
    }
    : { label: str('ui.fly_label'), action: 'fly', primary: true };
  /* One row for the place: the world in Freestyle, the track in Race. */
  const place = ui.mode === 'freestyle'
    ? {
      label: str('ui.the_world'),
      value: world ? world.name : str('ui.not_loaded'),
      action: 'freestyle',
      note: world ? str('ui.your_quad_and_the_physics_model', { note: world.note }) : str('ui.no_gates_pick_a_valley'),
    }
    : {
      label: str('ui.track'),
      value: seat ? seat.name : str('ui.choose_one'),
      action: 'courses',
      note: seat ? str('ui.and_every_other_track_gated_against', { name: seat.name }) : str('ui.no_track_is_seated_yet_your'),
    };
  return [
    ...padTrouble(ui),
    fly,
    place,
    ...ui.friendsItems(),
    machineRow(s, str('ui.the_machine_tune_pids_camera_angle')),
    /* Labelled Settings and valued with the name: the radio lives here,
     * and that is the room pilots fail to find. */
    { label: str('ui.settings'), value: readPilotName() || str('ui.not_set'), action: 'pilot', note: str('ui.you_and_your_radio_your_name') },
    { label: str('ui.how_to_fly'), action: 'howto', note: str('ui.the_sticks_live_and_what_the') },
    { label: str('ui.tracks_and_statistics'), action: 'leaderboard', note: str('ui.the_public_page_every_published_track') },
    creditsRow(),
    { label: ui.gateLabel(), action: 'mode-gate', note: str('ui.the_three_cards_five_inch_racing') },
  ];
}

/*
 * The gate: cards, then the rooms panel, then the pad trouble row. The
 * renderer places the rows by counting what is not a row, so every card
 * and panel entry has to come before any row.
 */
function gateRows(ui) {
  const rooms = ui.friendsItems().length > 0;
  const panel = rooms && ui.titleRooms ? ui.titleRooms(!ui.hub) : [];
  const trouble = padTrouble(ui);
  if (!ui.hub) {
    return [...ui.hubCards(rooms), ...panel, ...trouble];
  }
  if (ui.hub === 'hangar') {
    return [...ui.hangarCards(), ...trouble];
  }
  const ways = hubWays(ui.hub).filter((w) => rooms || !w.room).map((w) => ({
    label: w.label,
    card: w.id,
    art: w.art,
    svg: w.svg ?? craftSvg(airframeById(w.airframes[0])),
    blurb: w.blurb,
    facts: w.facts,
    action: w.action,
  }));
  return [...ways, ...(ui.hub === 'club' ? panel : []), ...trouble];
}

/* ---- rooms ---- */

function friendsRows(ui) {
  const between = ui.returnTo !== 'paused';
  const row = ui.friendsRow ? ui.friendsRow() : null;
  const inRoom = Boolean(row && row.inRoom);
  const rows = ui.friendsRows ? ui.friendsRows() : [];
  /* Free flight between runs seats the aircraft and the world here too. */
  const seat = between && ui.mode === 'freestyle' ? ui.roomSeatRows(inRoom) : [];
  if (ui.warLobbyOn) {
    /* The war's lobby: its own rows, the aircraft only, and its Leave last. */
    const leave = rows.filter((it) => it.action === 'friends-leave');
    const rest = rows.filter((it) => it.action !== 'friends-leave');
    return [...rest, ...seat.slice(0, 1), ...leave];
  }
  /* A started game's own row is the primary; Fly on top gives it up. */
  const started = rows.some((it) => it.primary);
  const fly = between && inRoom ? [{ label: str('ui.fly_label'), action: 'fly', primary: !started, note: str('friends.fly_note') }] : [];
  return [...fly, ...rows, ...seat, backRow()];
}

function roomRows(ui) {
  return [...(ui.roomRows ? ui.roomRows(ui.screen) : []), backRow()];
}

/* ---- My tracks ---- */

function coursesRows(ui, s) {
  const af = airframeById(s.airframe);
  /* A plane says which cards it does not fit; a track with no gates yet
   * fits anything. */
  const tooTight = (t) => (af.fixedWing && t.gates > 0 && !t.planes.includes(af.id)
    ? [str('ui.too_tight_flies_on_quad', { craft: af.name })]
    : []);
  if (ui.coursesLede) {
    ui.coursesLede.textContent = af.fixedWing
      ? str('ui.the_tracks_the_fits', { craft: af.name })
      : str('ui.every_track_here_is_yours_to');
  }
  const own = (ui.localCourses || []).map((t) => ({
    label: t.name,
    note: [str('ui.yours_in_gate', { world: mapById(t.map).name, gates: t.gates, v3: t.gates === 1 ? '' : 's' }), ...tooTight(t)].join(' '),
    course: { kind: 'local', track: t },
    action: `local:${t.id}`,
  }));
  const cloud = (ui.cloudCourses || []).map((t) => {
    const world = liveWorld(t.map);
    return {
      label: t.name,
      note: world
        ? [str('cloud.card_note', { world: world.name, author: t.author || str('ui.a_pilot') }), ...tooTight(t)].join(' ')
        : str('cloud.retired_world'),
      course: { kind: 'cloud', track: t },
      action: `cloud:${t.id}`,
    };
  });
  const board = (ui.boardCourses || []).map((t) => ({
    label: t.name,
    note: str('ui.hung_in_choosing_it_flies_it_there', { world: mapById(t.map).name, author: t.author || str('ui.a_pilot') }),
    course: { kind: 'board', track: t },
    action: `board:${t.id}`,
  }));
  const cards = [...own, ...cloud, ...board];
  const chosen = ui.cardSubject ? cards.find((c) => courseCardKey(c) === ui.cardSubject) : null;
  if (chosen) {
    return [...cards, ...courseCardRows(chosen)];
  }
  if (ui.newTrackOpen) {
    return [...cards, ...newTrackRows(af)];
  }
  const more = ui.cloudNext ? [{ label: str('cloud.more_tracks'), action: 'cloud-more', note: str('cloud.more_tracks_note') }] : [];
  return [
    ...cards,
    { label: str('ui.new_track'), action: 'newtrack', note: str('ui.build_one_choose_the_world_then') },
    ...more,
    { label: str('ui.tracks_and_statistics_on_the_web'), action: 'leaderboard', note: str('ui.the_public_page_for_sending_somebody') },
    backRow(),
  ];
}

/* Which world a new track is built in; a plane is offered a finished sky
 * course in each as well. */
function newTrackRows(af) {
  const worlds = MAPS.filter((m) => m.build);
  const empty = worlds.map((m) => ({
    label: m.name,
    action: `newtrack:${m.id}`,
    note: str('ui.an_empty_track_in_the_builder', { world: m.name }),
  }));
  const casual = af.fixedWing ? worlds.map((m) => ({
    label: str('ui.casual_sky_course_in', { world: m.name }),
    action: `casualtrack:${m.id}`,
    note: str('ui.casual_sky_course_note', { world: m.name }),
  })) : [];
  return [
    { label: str('ui.new_track_in_which_world'), section: true },
    ...empty,
    ...casual,
    { label: str('ui.back_to_the_list'), action: 'newtrack-back' },
  ];
}

/* ---- the trick list ---- */

function trickRows(ui) {
  return ui.trickRows().map((t) => ({
    label: t.name,
    value: `${formatScore(t.points)}`,
    note: `${t.status.tag}. ${t.difficulty}. ${t.how}` + str('ui.seen', { v1: VIEW_LABEL[t.view].replace('seen ', '') }),
    action: 'noop',
  }));
}

/* ---- Freestyle ---- */

function freestyleRows(ui, s) {
  /* The world cards only once there is more than one world to pick. */
  const worlds = MAPS.filter((m) => m.mode === 'freestyle');
  const cards = worlds.length > 1
    ? worlds.map((m) => ({ label: m.name, note: m.note, map: m, action: `map:${m.id}` }))
    : [];
  return [
    ...cards,
    {
      /* Amber while the unfinished scorer is on, and opened rather than
       * stepped, since the cursor lands here first. */
      ...choice(
        str('ui.scoring'),
        scoringNote(s.freestyleScoring),
        FREESTYLE_SCORING,
        s.freestyleScoring,
        (id) => FREESTYLE_SCORING_LABEL[id],
        (id) => { s.freestyleScoring = id; },
      ),
      rowClass: s.freestyleScoring === 'off' ? undefined : 'row-warn',
      pickOnly: true,
    },
    machineRow(s, str('ui.the_machine_its_tune_row_opens', { pids: SCREEN_TITLES.pids })),
    flightStyleRow(str('ui.physics_model'), str('ui.arcade_the_ideal_quad_no_propwash'), str('ui.expert_the_full_physics_propwash_gyro'), s),
    crashDamageRow(s),
    backRow(),
  ];
}

/* ---- Quad ---- */

function quadRows(ui, s) {
  const midRun = ui.returnTo === 'paused';
  const swap = midRun && ui.onHotSwap ? (id) => ui.swapTo(id) : null;
  const tilt = Math.round(Math.sin(cameraTiltRad(s.cameraAngle)) * 100);
  return [
    { label: str('ui.the_machine'), section: true },
    { ...craftItem(s, swap), open: () => ui.openCraftRow(midRun) },
    tuneRow(s, midRun),
    { label: str('ui.firmware_bench'), action: 'fc', note: str('ui.every_betaflight_4_5_1_key', { pids: SCREEN_TITLES.pids }) },
    { label: str('ui.camera'), section: true },
    stepper(
      str('ui.camera_angle'),
      str('ui.how_far_the_camera_tilts_up', {
        CAMERA_ANGLE_MIN, CAMERA_ANGLE_DEFAULT, CAMERA_ANGLE_MAX, cameraAngle: s.cameraAngle, v5: tilt,
      }),
      `${s.cameraAngle} degrees`,
      (d) => {
        const from = s.cameraAngle;
        s.cameraAngle = clampCameraAngle(from + d);
        /* Offered once, on the step up across the threshold, and only when
         * the yaw rate is above what the tip would set it to. */
        const crossed = from < YAW_TIP_TILT && s.cameraAngle >= YAW_TIP_TILT;
        if (crossed && !ui.yawTipAsked && yawTipApplies(s.rates)) {
          ui.offerYawTip();
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
    toggle(str('ui.launch_control'), str('ui.betaflight_race_start_off_by_default'), Boolean(s.launchControl), (v) => {
      s.launchControl = Boolean(v);
    }),
    /* A signpost to the rates, which are the pilot's, not the machine's. */
    ratesRow(s, str('ui.not_the_machine_s_rates_are', { pilot: SCREEN_TITLES.pilot })),
    backRow(),
  ];
}

function yawTipApplies(rates) {
  return fullStickDeg(rates, 'yaw') > YAW_TIP_RATE && YAW_TIP_TYPES.has(normaliseRates(rates).type);
}

/* ---- Settings (the pilot) ---- */

function pilotRows(ui, s) {
  return [
    { label: 'You', section: true },
    choice(str('ui.language'), str('ui.language_note'), LOCALES, currentLocale(), (id) => LOCALE_NAMES[id] || id, (id) => {
      rememberLocale(id);
      window.location.reload();
    }),
    ...identityRows(),
    ...(accountsAvailable() ? [
      { label: str('account.privacy'), action: 'accountprivacy', note: str('account.privacy_note') },
      { label: str('account.terms'), action: 'accountterms', note: str('account.terms_note') },
    ] : []),
    ...flightTimeRows(s.flightTime, ui.everyoneFlight()),
    { label: str('ui.sticks'), section: true },
    ...stickRows(ui, s),
    { label: str('ui.tune_pids_and_the_firmware'), action: 'quad', note: str('ui.those_belong_to_the_machine_not', { quad: SCREEN_TITLES.quad }) },
    { label: str('ui.screen'), section: true },
    ...screenRows(ui, s),
    { label: str('ui.sound'), section: true },
    ...soundRows(s),
    { label: str('ui.diagnostics'), section: true },
    toggle(str('ui.flight_log'), str('ui.record_the_run_for_download_as'), s.flightLog, (v) => { s.flightLog = v; }),
    { label: str('ui.download_flight_log'), action: 'downloadflightlog', note: str('ui.writes_what_was_recorded_as_blackbox') },
    backRow(),
  ];
}

/*
 * Who the pilot is: a signed in account's rows (src/ui/accountui.js acts
 * on them), or the stored name and the pilot key, with a sign in row
 * first where there is a server to sign in to.
 */
function identityRows() {
  const account = accountsAvailable() ? readAccount() : null;
  if (account) {
    return [
      { label: str('account.callsign'), value: account.callsign || str('account.callsign_none'), action: 'accountcallsign', note: str('account.callsign_note') },
      { label: str('account.sign_out'), value: str('account.sign_out_value'), action: 'accountsignout', note: str('account.sign_out_note') },
      { label: str('account.delete'), action: 'accountdelete', note: str('account.delete_note') },
    ];
  }
  const name = readPilotName();
  return [
    ...(accountsAvailable() ? [{ label: str('account.sign_in'), value: str('account.sign_in_value'), action: 'accountsignin', note: str('account.sign_in_note') }] : []),
    {
      label: str('ui.your_name'),
      value: name || str('ui.not_set'),
      action: 'setname',
      note: name ? str('ui.posted_times_and_published_tracks_carry') : str('ui.needed_to_publish_a_track_or', { nameRules: nameRules() }),
    },
    { label: str('ui.pilot_key'), value: str('ui.this_browser'), action: 'exportkey', note: str('ui.on_the_board_your_name_belongs') },
    { label: str('ui.import_pilot_key'), action: 'importkey', note: str('ui.paste_a_key_exported_from_another') },
  ];
}

/* The activities in the order the flight time split reads them, each
 * under its card's name. */
const FLIGHT_SPLIT = [
  ['race', 'ui.track_mode'],
  ['free', 'ui.free_flight_card'],
  ['combat', 'combat.card'],
  ['tag', 'flight.act_tag'],
  ['war', 'hub.ops'],
];

/*
 * This pilot's time in the air over every computer the account flew on,
 * and everybody's from the board once it has answered (null until then,
 * and with no board, so no number is made up).
 */
function flightTimeRows(record, everyone) {
  const total = flightTotals(record);
  const rows = [];
  if (total.seconds > 0) {
    const split = FLIGHT_SPLIT
      .filter(([id]) => total.byActivity[id] > 0)
      .map(([id, key]) => str('flight.split_item', { activity: str(key), time: flightTimeText(total.byActivity[id]) }))
      .join(', ');
    const since = total.first
      ? new Date(`${total.first}T00:00:00Z`).toLocaleDateString(currentLocale(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
      : null;
    rows.push({
      id: 'pilot:flight-time',
      label: str('flight.time'),
      value: flightTimeText(total.seconds),
      note: since ? str('flight.time_note', { since, split }) : split,
      info: true,
    });
  } else {
    rows.push({ id: 'pilot:flight-time', label: str('flight.time'), value: str('flight.none'), note: str('flight.none_note'), info: true });
  }
  if (Number.isFinite(everyone)) {
    const hours = Math.floor(everyone / 3600);
    rows.push({
      id: 'pilot:flight-everyone',
      label: str('flight.everyone'),
      value: plural('count.hours_flown', hours, { n: hours.toLocaleString(currentLocale()) }),
      note: str('flight.everyone_note'),
      info: true,
    });
  }
  return rows;
}

function padChooseNote(info) {
  const n = info && typeof info.count === 'number' ? info.count : 0;
  if (n <= 0) {
    return str('ui.plug_in_a_radio_in_joystick');
  }
  return n === 1 ? str('ui.one_device_is_plugged_in_open', { using: info.using }) : str('ui.devices_are_plugged_in_move_the', { n });
}

function stickRows(ui, s) {
  const info = ui.padInfo;
  /* 'Keyboard' is the pad picker's own sentinel, shown in the pilot's language. */
  const using = info && info.using && info.using !== 'Keyboard' ? info.using : str('ui.keyboard');
  const mouse = s.mouseFlight ? [
    choice(str('ui.mouse_sensitivity'), str('ui.mouse_sensitivity_note'), MOUSE_SENS, s.mouseSens, (n) => `${n}%`, (n) => { s.mouseSens = n; }),
    choice(str('ui.mouse_expo'), str('ui.mouse_expo_note'), MOUSE_EXPOS, s.mouseExpo, (n) => `${n}%`, (n) => { s.mouseExpo = n; }),
    toggle(str('ui.mouse_invert'), str('ui.mouse_invert_note'), s.mouseInvert, (v) => { s.mouseInvert = Boolean(v); }),
    choice(str('ui.mouse_centre'), str('ui.mouse_centre_note'), MOUSE_CENTRES, s.mouseCentre, (id) => str(`ui.mouse_centre_${id}`), (id) => { s.mouseCentre = id; }),
  ] : [];
  return [
    { label: str('ui.choose_joystick'), value: using, action: 'choosepad', note: padChooseNote(info) },
    toggle(str('ui.mouse_flight'), str('ui.mouse_flight_note'), s.mouseFlight, (v) => { s.mouseFlight = Boolean(v); }),
    ...mouse,
    { label: str('ui.calibrate_sticks'), action: 'calibrate', note: str('ui.centre_full_range_then_one_named') },
    {
      label: str('ui.check_sticks'),
      action: 'calibrate-check',
      note: str('ui.your_saved_mapping_live_without_calibrating') + str('ui.if_it_goes_the_wrong_way') + str('ui.moves_on_screen_one_key_puts'),
    },
    choice(
      str('ui.stick_mode'),
      str('ui.which_stick_is_throttle_and_which') + str('ui.mode_2_is_throttle_on_the') + str('ui.mode_1_puts_throttle_on_the')
        + str('ui.this_flies_the_thumb_sticks_and') + str('ui.own_a_radio_already_applies_its') + str('ui.so_for_a_radio_this_only'),
      STICK_MODES,
      s.stickMode,
      (n) => str('ui.mode', { n }),
      (n) => { s.stickMode = normaliseStickMode(n); },
    ),
    /* No mid run warning: rates no longer put the quad on the start line. */
    ratesRow(s, str('ui.how_far_the_sticks_go_and')),
    linkRow(s, str('ui.no_radio_every_frame_arrives_exactly'), 'ui.hz_ms_delay_ms_jitter_records'),
    choice(str('ui.stick_latency'), str('ui.stick_latency_note'), LATENCY_MODES, s.latencyMode, (id) => str(`ui.latency_${id}`), (id) => { s.latencyMode = id; }),
  ];
}

function screenRows(ui, s) {
  const gpu = ui.gpuInfo
    ? { label: str('ui.gpu'), value: ui.gpuInfo.display, note: ui.gpuInfo.note, info: true }
    : { label: str('ui.gpu'), value: str('ui.detecting'), note: str('ui.read_from_the_webgl_context_that'), info: true };
  return [
    graphicsRow(s),
    gpu,
    choice(str('ui.render_scale'), str('ui.fewer_pixels_then_stretched_to_fit'), RENDER_SCALES, s.renderScale, (n) => (n >= 100 ? str('ui.native') : `${n}%`), (n) => { s.renderScale = n; }),
    choice(str('ui.performance_mode'), str('ui.performance_mode_note'), PERF_MODES, s.perfMode, (id) => str(`ui.perf_${id}`), (id) => { s.perfMode = id; }),
    choice(str('ui.frame_cap'), str('ui.caps_how_often_the_world_is'), FPS_CAPS, s.fpsCap, (n) => (n === 0 ? str('ui.uncapped') : `${n} fps`), (n) => { s.fpsCap = n; }),
    toggle(str('ui.frame_readout'), str('ui.frame_readout_note'), s.perfOverlay, (v) => { s.perfOverlay = v; }),
    toggle(str('ui.mission_guidance'), str('ui.mission_guidance_note'), s.missionGuidance, (v) => { s.missionGuidance = Boolean(v); }),
    /* Per aircraft: a combat aircraft defaults to its avionics. */
    choice(str('ui.hud_style'), str('ui.hud_style_note'), HUD_STYLES, hudStyleFor(s, s.airframe), (id) => str(`ui.hud_${id}`), (id) => {
      s.hudStyleBy = { ...s.hudStyleBy, [s.airframe]: id };
    }),
    choice(str('ui.peer_marks'), str('ui.peer_marks_note'), MARK_STYLES, s.peerMarks, (id) => str(`ui.peer_marks_${id}`), (id) => { s.peerMarks = id; }),
    choice(str('ui.thermal_palette'), str('ui.thermal_palette_note'), AVX_PALETTES, s.avxPalette, (id) => str(`avionics.hud.palette.${id}`), (id) => { s.avxPalette = id; }),
  ];
}

function soundRows(s) {
  const tracks = musicIds();
  return [
    toggle(str('ui.sound'), str('ui.all_sound_motors_wind_music_and'), s.sound, (v) => { s.sound = v; }),
    levelRow(str('ui.volume'), str('ui.overall_level_zero_to_ten'), s, 'volume'),
    levelRow(str('ui.motors_and_engines'), str('ui.the_blade_pass_tone_you_fly'), s, 'motorLevel'),
    levelRow(str('ui.wind'), str('ui.air_over_the_airframe_rises_with'), s, 'windLevel'),
    levelRow(str('ui.other_aircraft'), str('ui.other_aircraft_note'), s, 'otherLevel'),
    levelRow(str('ui.effects'), str('ui.effects_note'), s, 'effectsLevel'),
    levelRow(str('ui.ambience'), str('ui.ambience_note'), s, 'ambientLevel'),
    levelRow(str('ui.voice_level'), str('ui.voice_level_note'), s, 'voiceLevel'),
    stepper(str('ui.music'), str('ui.recorded_tracks_in_flight_and_a'), s.musicLevel > 0 ? `${s.musicLevel}` : 'Off', (d) => {
      s.musicLevel = Math.max(0, Math.min(10, s.musicLevel + d));
    }),
    choice(
      str('ui.music_track'),
      s.musicTrack === 'rotation' ? str('ui.what_flies_a_random_start_then') : str('ui.what_flies_this_track_loops_until'),
      tracks,
      s.musicTrack,
      (id) => (id === 'rotation' ? str('ui.rotation') : trackById(id).name),
      (id) => { s.musicTrack = id; },
    ),
    toggle(str('ui.binaural_tone'), str('ui.a_quiet_1000_hz_tone_6'), s.focusTone, (v) => { s.focusTone = v; }),
  ];
}

/* ---- Standings ---- */

function standingsRows(ui) {
  const track = ui.standingsFor;
  if (!track) {
    return [
      { label: str('ui.no_track_chosen'), info: true, disabled: true, note: str('ui.pick_a_track_in_the_race') },
      backRow(),
    ];
  }
  const times = ui.standingsTimes || [];
  const best = times[0] || null;
  /* Only a time that carries a ghost can be raced: older ones predate it. */
  const ghost = times.find((t) => t.hasGhost && t.id) || null;
  return [
    {
      label: str('ui.fly_this_track'),
      action: 'standings-fly',
      primary: true,
      note: best
        ? str('ui.loads_and_takes_you_to_the_2', { name: track.name, formatTime: formatTime(best.lapMs), v3: best.name || str('ui.an_unnamed_pilot') })
        : str('ui.loads_and_takes_you_to_the', { name: track.name }),
    },
    ...(ghost ? [{
      label: str('ui.race_the_record'),
      action: 'standings-ghost',
      note: str('ui.s_flown_as_a_ghost_beside', { v1: ghost.name || str('ui.an_unnamed_pilot_2'), formatTime: formatTime(ghost.lapMs) }),
    }] : []),
    { label: str('ui.open_on_the_web'), action: 'card-board', note: str('ui.the_public_page_for_a_link', { name: track.name }) },
    backRow(),
  ];
}

/* ---- the launch card ---- */

function launchRows(ui, s) {
  const seat = activeCourseSummary();
  const map = MAPS.find((m) => m.id === s.map) ?? MAPS[0];
  const trackName = seat && seat.name ? seat.name : map.name;
  return [
    {
      label: str('ui.track'),
      value: trackName,
      info: true,
      note: seat && seat.gates ? str('ui.gates_this_is_what_your_time', { gates: seat.gates }) : str('ui.this_is_what_your_time_will'),
    },
    machineRow(s, str('ui.the_tune_the_pids_the_camera', { quad: SCREEN_TITLES.quad })),
    { label: str('ui.what_this_run_counts_as'), section: true },
    choice(str('ui.laps'), str('ui.how_many_laps_a_run_lasts'), LAP_COUNTS, s.laps, (n) => `${n}`, (n) => { s.laps = n; }),
    choice(str('ui.pack_charge'), str('ui.a_tired_pack_sags_harder_and'), PACK_VOLTAGES, s.packVoltage, (n) => str('ui.volts_per_cell', { n: n.toFixed(2) }), (n) => { s.packVoltage = n; }),
    flightStyleRow(str('ui.flight_model'), str('ui.arcade_the_ideal_quad_no_propwash_2'), str('ui.expert_the_full_physics_propwash_gyro_2'), s),
    crashDamageRow(s),
    linkRow(s, str('ui.a_perfect_link_is_sharper_than'), 'ui.hz_ms_delay_ms_jitter'),
    ...ui.ghostItems(),
    ...ui.liveItems(),
    { label: str('ui.fly_label'), action: 'launch-go', primary: true, note: recordSentence(s, trackName) },
    backRow(),
  ];
}

/*
 * The record key in English: everything a best lap is filed under, and
 * what keeps it off the public board. The weight goes right behind the
 * physics model when it is not stock, because it is part of the model.
 */
function recordSentence(s, trackName) {
  const arcade = s.flightStyle === 'arcade';
  const weight = clampWeight(s.weight);
  const parts = [
    `${arcade ? str('ui.arcade') : str('ui.expert')} physics`,
    ...(weight !== WEIGHT_STOCK ? [str('ui.weight_at_percent', { weight })] : []),
    str('ui.v_per_cell', { v1: s.packVoltage.toFixed(2) }),
    `${s.laps} lap${s.laps === 1 ? '' : 's'}`,
    str('ui.the_tune', { name: tuneById(s.tune).name }),
  ];
  let standing;
  if (arcade) {
    standing = str('ui.arcade_times_stay_off_the_public');
  } else if (weight !== WEIGHT_STOCK) {
    standing = str('ui.times_flown_at_a_weight_that');
  } else {
    const link = s.link === 'perfect' ? str('ui.a_perfect_link') : LINK_PRESETS[s.link].label;
    standing = str('ui.this_run_is_on', { link });
  }
  return str('ui.your_best_on_is_filed_under', { trackName, v2: parts.join(', ') }) + str('ui.change_any_part_of_it_and') + standing;
}

/* ---- the pause menu ---- */

function pausedRows(ui, s) {
  return [
    { label: str('ui.resume'), action: 'resume', primary: true },
    { label: str('ui.restart_run'), action: 'restart' },
    { label: str('carousel.change_aircraft'), value: airframeById(s.airframe).short, action: 'hotswap', note: str('carousel.row_note') },
    ...(customisable(s.airframe) ? [{ label: str('hangar.customise'), action: 'customise', note: str('hangar.row_note') }] : []),
    ...ui.ghostItems(),
    ...ui.liveItems(),
    ...ui.friendsItems(),
    { label: str('ui.does_it_feel_wrong'), section: true },
    tuneRow(s, true),
    ratesRow(s, str('ui.how_far_the_sticks_go_and_2')),
    feelRow(),
    { label: str('ui.elsewhere'), section: true },
    machineRow(s, str('ui.pids_camera_flight_mode_and_the', { MID_RUN_WARNING })),
    { label: str('ui.settings'), value: ratesSummary(s.rates), action: 'pilot', note: str('ui.rates_your_radio_graphics_and_sound') },
    graphicsRow(s),
    { label: str('ui.how_to_fly'), action: 'howto' },
    creditsRow(),
    ...(s.map === 'track' ? [myTracksRow()] : []),
    { label: str('ui.quit_to_title'), action: 'title' },
  ];
}

/* ---- results ---- */

function resultsRows(ui, s) {
  if (ui.roomResults && ui.roomResultsRows) {
    return ui.roomResultsRows();
  }
  const again = { label: str('ui.fly_again'), action: 'restart', primary: true };
  if (ui.osdMode === 'freestyle') {
    return [
      again,
      postRunRow(ui),
      { label: str('ui.open_tracks_and_statistics'), action: 'leaderboard', note: str('ui.every_published_track_and_the_times') },
      feelRow(),
      titleRow(),
    ];
  }
  /* A free world has no listing; its track rows would all be grey. */
  const listing = s.map === 'track' ? liveListing() : null;
  if (!listing) {
    return [again, feelRow(), titleRow()];
  }
  return [
    again,
    uploadRow(listing, ui.resultsFastest, ui.timePosted, s.airframe),
    {
      label: str('ui.open_tracks_and_statistics'),
      action: 'leaderboard',
      disabled: !listing.published,
      note: listing.name ? str('ui.the_public_page_for', { name: listing.name }) : str('ui.the_public_page_a_track_has'),
    },
    feelRow(),
    myTracksRow(),
    titleRow(),
  ];
}

/* Post a freestyle run, or why it cannot be: greyed with the reason on
 * the row, since the results screen has no notice banner to refuse in. */
function postRunRow(ui) {
  const posted = ui.runPosted;
  if (posted) {
    const stands = posted.improved === false;
    return {
      label: stands ? str('ui.your_best_still_stands') : str('ui.run_posted'),
      action: 'postrun',
      disabled: true,
      note: stands
        ? str('ui.the_board_already_holds_a_better', { formatScore: formatScore(posted.score) })
        : str('ui.the_board_kept_that_run', { v1: posted.rank != null ? str('ui.rank', { rank: posted.rank }) : '' }),
    };
  }
  const run = ui.freestyleRun;
  const empty = !run || !(run.total > 0) || !(run.tricks > 0);
  let note;
  if (empty) {
    note = str('ui.a_run_with_no_tricks_in');
  } else if (run.timed === false) {
    note = str('ui.free_flight_has_no_clock_so');
  } else if (run.assisted) {
    note = str('ui.this_run_used_the_harness_hooks');
  } else {
    note = str('ui.from_tricks_one_entry_per_pilot', { formatScore: formatScore(run.total), tricks: run.tricks });
  }
  return {
    label: str('ui.post_this_run'),
    action: 'postrun',
    disabled: empty || Boolean(run && run.assisted) || (run && run.timed === false),
    note,
  };
}

/*
 * Upload a time. Always a row, greyed with its reason when it does not
 * apply, so the list keeps its shape and the pilot learns why.
 */
function uploadRow(listing, fastestMs, timePosted, airframe) {
  const shareId = listing.shareId;
  const craft = lapCraftOf(listing.doc, airframe);
  const grey = (note) => ({ label: str('ui.upload_a_time'), action: 'posttime', disabled: true, note });
  if (timePosted && shareId) {
    const rank = timePosted.rank != null ? str('ui.rank', { rank: timePosted.rank }) : '';
    return { label: str('ui.time_uploaded'), action: 'posttime', disabled: true, note: str('ui.that_lap_is_on_the_public', { rank }) };
  }
  if (!shareId) {
    return grey(str('ui.only_a_track_on_the_board'));
  }
  if (!listing.canPostTime) {
    return grey(str('ui.the_layout_has_changed_since_it'));
  }
  /* The lap just flown, or the one left waiting for this track and craft. */
  let ms = Number.isFinite(fastestMs) ? fastestMs : null;
  if (ms == null) {
    const pending = readPendingTime();
    if (pending && pending.trackId === shareId && (pending.craft || '') === craft) {
      ms = pending.lapMs;
    }
  }
  if (ms == null) {
    return grey(str('ui.fly_a_clean_lap_on_this'));
  }
  const best = readPostedBest(lapSlot(shareId, craft));
  const faster = best != null && ms < best;
  return {
    label: faster ? str('ui.upload_new_best', { formatTime: formatTime(ms) }) : str('ui.upload', { formatTime: formatTime(ms) }),
    action: 'posttime',
    note: faster ? str('ui.faster_than_the_last_time_you') : str('ui.send_this_lap_to_the_public'),
  };
}

/* ---- Rates ---- */

function ratesRoomRows(ui, s) {
  const r = s.rates;
  const split = Boolean(s.ratesSplitPitch);
  const hover = hoverStickPercent(r.throttleCap, s.airframe).toFixed(1);
  const tilt = Math.sin(cameraTiltRad(s.cameraAngle));
  const presets = listRatePresets();
  const loaded = presetMatching(r);
  const changed = !ratesAreDefault(r);

  /* One firmware field. While roll and pitch are joined, roll writes both. */
  const field = (axis, key) => {
    const spec = rateField(r.type, key);
    const notes = [spec.note];
    if (key !== 'expo') {
      notes.push(str('ui.at_full_stick_this_axis_is', { fullStickDeg: fullStickDeg(r, axis) }));
    }
    if (axis === 'yaw' && key === 'srate') {
      notes.push(str('ui.quads_yaw_slower_than_they_roll', { cameraAngle: s.cameraAngle, v2: Math.round(tilt * 100), v3: Math.round(fullStickDeg(r, 'yaw') * tilt) }));
    }
    return number(spec.label, notes.join(' '), spec, r[axis][key], (v) => {
      r[axis][key] = v;
      if (!split && axis === 'roll') {
        r.pitch[key] = v;
      }
    });
  };
  const axis = (name) => RATE_FIELDS.map((key) => field(name, key));

  /* Which saved profile is flying is worked out from the numbers, never
   * remembered, so it cannot claim a preset the numbers have left. */
  const presetValue = loaded ? loaded.name : (changed ? str('ui.not_saved') : str('ui.stock'));
  const presetRow = presets.length === 0
    ? { label: str('ui.preset'), value: str('ui.none_saved'), info: true, note: str('ui.save_the_numbers_below_under_a', { RATES_STORAGE_WARNING }) }
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

  const stockRc = formatRate(rateField('ACTUAL', 'rcRate'), RATE_DEFAULTS.roll.rcRate);
  const stockMax = formatRate(rateField('ACTUAL', 'srate'), RATE_DEFAULTS.roll.srate);
  return [
    ...ui.stickPathRow(),
    presetRow,
    choice(str('ui.rates_type'), str('ui.which_rate_system_the_numbers_below'), RATE_TYPES, r.type, (t) => RATE_TYPE_LABEL[t], (t) => {
      s.rates = profileForType(t, r);
    }),
    toggle(str('ui.separate_pitch'), split ? str('ui.on_pitch_has_its_own_three') : str('ui.off_roll_and_pitch_share_one'), split, (on) => {
      s.ratesSplitPitch = on;
      if (!on) {
        for (const key of RATE_FIELDS) {
          r.pitch[key] = r.roll[key];
        }
      }
    }),
    { label: split ? str('ratespanel.roll') : str('ui.roll_and_pitch'), section: true },
    ...axis('roll'),
    ...(split ? [{ label: str('ui.pitch'), section: true }, ...axis('pitch')] : []),
    { label: 'Yaw', section: true },
    ...axis('yaw'),
    { label: str('ui.throttle'), section: true },
    choice(
      str('ui.throttle_limit'),
      r.throttleCap >= 100
        ? str('ui.off_this_quad_is_almost_nine', { hover })
        : str('ui.betaflight_scale_limit_full_stick_commands', { throttleCap: r.throttleCap, hover }),
      THROTTLE_CAP_CHOICES,
      r.throttleCap,
      (n) => (n >= 100 ? 'Off' : `${n}%`),
      (n) => { r.throttleCap = n; },
    ),
    number(THROTTLE_CURVE_FIELDS.thrMid.label, str('ui.this_quad_hovers_near_percent_of', { note: THROTTLE_CURVE_FIELDS.thrMid.note, hover }), THROTTLE_CURVE_FIELDS.thrMid, r.thrMid, (v) => { r.thrMid = v; }),
    number(THROTTLE_CURVE_FIELDS.thrExpo.label, THROTTLE_CURVE_FIELDS.thrExpo.note, THROTTLE_CURVE_FIELDS.thrExpo, r.thrExpo, (v) => { r.thrExpo = v; }),
    { label: str('ui.presets'), section: true },
    /* A refused write stays on the screen until the next save or delete. */
    ...(ui.ratesNotice ? [{ label: str('ui.not_saved'), value: '', info: true, rowClass: 'row-warn', note: ui.ratesNotice }] : []),
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
      note: loaded ? str('ui.forget_this_browser_is_the_only', { name: loaded.name }) : str('ui.load_a_preset_first_this_deletes'),
    },
    {
      label: str('ui.revert_to_defaults'),
      action: 'rates-default',
      disabled: !changed,
      note: changed ? str('ui.back_to_what_a_freshly_flashed', { formatRate: stockRc, formatRate2: stockMax }) : str('ui.already_on_the_betaflight_4_5'),
    },
    backRow(),
  ];
}

/* ---- PIDs ---- */

function pidsRows(ui, s) {
  const tuneName = tuneById(s.tune).name;
  /* The readback is only the seated tune's; another tune's is stale. */
  const live = ui.pidsLive && ui.pidsLive.tune === s.tune ? ui.pidsLive : null;
  const tail = [
    { label: str('ui.every_setting'), action: 'fc', note: str('ui.the_full_flight_controller_screen_filters') },
    {
      label: str('ui.back_to_the_tune_s_own'),
      action: 'pids-default',
      disabled: !pidsAdjusted(s.pids, s.tune),
      note: pidsAdjusted(s.pids, s.tune)
        ? str('ui.forgets_every_slider_and_hand_set', { tuneName })
        : str('ui.is_already_flying_its_own_values', { tuneName }),
    },
    backRow(),
  ];
  if (!live) {
    /* Until the tune's own values are read back, no row may edit them. */
    return [
      tunePickRow(s, ui.returnTo === 'paused'),
      { label: str('ui.loading', { tuneName }), info: true, note: str('ui.the_tune_is_being_fetched_and') },
      ...tail,
    ];
  }
  const entry = pidsEntry(s.pids, s.tune);
  const expert = Boolean(entry && entry.mode === 'expert' && entry.pids);
  const rpNote = live.baselineMode === 'RP' ? str('ui.runs_the_sliders_in_rp_mode', { tuneName }).trim() : '';
  const sliderRow = (k) => {
    const spec = SLIDERS[k];
    const tuneVal = live.baseline[k];
    const moved = Boolean(entry && entry.sliders && k in entry.sliders);
    const notes = [spec.note];
    if (moved) {
      notes.push(str('ui.ships_this_at_setting_it_back', { tuneName, tuneVal }));
    }
    if (k === 'master' && rpNote) {
      notes.push(rpNote);
    }
    const row = number(spec.label, notes.join(' '), spec, moved ? entry.sliders[k] : tuneVal, (v) => {
      setPidSlider(s.pids, s.tune, k, v, tuneVal);
    });
    /* Drawn as a real track, as Configurator draws these. */
    row.range = { min: spec.cliMin, max: spec.cliMax };
    return row;
  };
  const pidRow = (axis, f) => number(PID_FIELD_SPECS[f].label, PID_FIELD_SPECS[f].note, PID_FIELD_SPECS[f], entry.pids[axis][f], (v) => {
    entry.pids[axis][f] = v;
  });
  const axisName = { roll: str('ratespanel.roll'), pitch: str('ui.pitch'), yaw: 'Yaw' };
  const table = expert
    ? PID_AXES.flatMap((axis) => [{ label: axisName[axis], section: true }, ...PID_FIELDS.map((f) => pidRow(axis, f))])
    : [{ label: str('ui.betaflight_s_tuning_sliders'), section: true }, ...SLIDER_KEYS.map(sliderRow)];
  return [
    tunePickRow(s, ui.returnTo === 'paused'),
    /* The switch sits above what it switches, so it stays under the cursor. */
    toggle(str('ui.set_pids_directly'), expert ? str('ui.on_the_sliders_are_off_simplified') : str('ui.off_the_sliders_below_drive_the'), expert, (on) => {
      setPidsExpert(s.pids, s.tune, on, live.pids);
    }),
    ...table,
    ...tail,
  ];
}

/* The tune picker, which opens on Enter rather than stepping: a swap
 * costs the lap. With one shipped tune the note says where a second one
 * comes from. */
function tunePickRow(s, midRun) {
  const ids = tuneChoices(s.airframe);
  const door = ids.includes(CUSTOM_TUNE.id) ? '' : str('ui.stock_is_the_only_tune_shipped', { fc: SCREEN_TITLES.fc, name: CUSTOM_TUNE.name });
  return {
    ...choice(
      str('ui.tune'),
      str('ui.everything_below_belongs_to_this_one', { door, v2: midRun ? MID_RUN_WARNING : '' }),
      ids,
      s.tune,
      (id) => tuneById(id).name,
      (id) => { s.tune = id; },
    ),
    pickOnly: true,
  };
}

/* ---- the screens, by name ---- */

const SCREENS = {
  title: titleRows,
  howto: () => [backRow()],
  credits: () => [backRow()],
  friends: friendsRows,
  rooms: roomRows,
  roomnew: roomRows,
  courses: coursesRows,
  tricks: trickRows,
  freestyle: freestyleRows,
  quad: quadRows,
  pilot: pilotRows,
  standings: standingsRows,
  launch: launchRows,
  paused: pausedRows,
  results: resultsRows,
  rates: ratesRoomRows,
  pids: pidsRows,
  fc: (ui) => ui.fc.items(),
};

export const itemMethods = {
  /* The whole list, with ids: the screen's rows, then the bars' buttons. */
  items() {
    return stampIds([...this.buildItems().map((it) => this.roomExit(it)), ...this.barStops()], this.screen);
  },

  /* In a room, a row to the title leaves the room instead, and says so
   * (docs/FLOW-AUDIT.md rule 3: the title is never in a room). */
  roomExit(it) {
    if (it.action !== 'title' || !(this.inRoom && this.inRoom())) {
      return it;
    }
    return { ...it, label: str('friends.leave'), note: str('friends.leave_note'), action: 'friends-leave' };
  },

  /* The bars' buttons as the last stops, while their bar is up, so a pad
   * can press Reload and the room bar's button. The bar draws them. */
  barStops() {
    const stops = [];
    if (this.updateBar && !this.updateBar.hidden) {
      stops.push({ bar: 'update', label: str('update.reload'), note: str('update.new_version'), action: 'update-reload' });
    }
    const room = this.roomBarView;
    if (this.roomBar && !this.roomBar.hidden && room && room.button) {
      stops.push({ bar: 'room', label: room.button, note: room.text, action: 'room-bar' });
    }
    return stops;
  },

  /* Light the bar button the cursor is on. */
  markBars(items = null) {
    const up = (this.updateBar && !this.updateBar.hidden) || (this.roomBar && !this.roomBar.hidden);
    const here = up ? (items || this.items())[this.cursor] : null;
    const on = here ? here.bar : null;
    if (this.updateReload) {
      this.updateReload.classList.toggle('on', on === 'update');
    }
    if (this.roomBarButton) {
      this.roomBarButton.classList.toggle('on', on === 'room');
    }
  },

  buildItems() {
    const build = SCREENS[this.screen];
    return build ? build(this, this.settings) : [];
  },
};
