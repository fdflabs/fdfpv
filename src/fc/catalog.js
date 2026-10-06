/*
 * catalog.js: what the flight controller screen may do with each
 * Betaflight 4.5.1 setting, and why.
 *
 * Every key gets exactly one status, decided here and only here; the
 * screen has one grey style and asks status(key) without knowing what any
 * setting means.
 *
 *   LIVE           written to a parameter group this build compiles and runs
 *   GATED          written, then ignored by this firmware at a 1 kHz loop
 *   APPLIED_INERT  written, but nothing that flies reads it
 *   INERT          a real 4.5 CLI key whose subsystem is not compiled
 *   ABSENT         Configurator chrome that is not a CLI key at all
 *
 * The keys, types, bounds tokens and lookup values come from the firmware
 * through catalog-data.js (generated). What is decided here is the status
 * of each key, the reason shown for it, where it sits on the screen, and
 * which lookups the screen offers. Reasons are string-table keys.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { FIRMWARE_BOUNDS, FIRMWARE_LOOKUPS, VALUE_TABLE } from './catalog-data.js';
import { str } from '../strings/index.js';

export const STATUS = {
  LIVE: 'LIVE',
  GATED: 'GATED',
  APPLIED_INERT: 'APPLIED_INERT',
  INERT: 'INERT',
  ABSENT: 'ABSENT',
};

const say = (key) => str(`catalog.${key}`);
const reasons = (table) => Object.fromEntries(Object.entries(table).map(([key, why]) => [key, say(why)]));

/*
 * GATED, not grey: Betaflight has these and, at a 1 kHz loop, does
 * exactly what this firmware does with them. A real 8 kHz gyro / 1 kHz PID
 * board has no dynamic notch either, so greying it would teach the wrong
 * thing.
 */
const GATED = reasons({
  dyn_notch_count: 'betaflight_sdft_will_not_arm_below',
  dyn_notch_q: 'betaflight_sdft_will_not_arm_below',
  dyn_notch_min_hz: 'betaflight_sdft_will_not_arm_below',
  dyn_notch_max_hz: 'betaflight_sdft_will_not_arm_below',
  pid_process_denom: 'stored_then_forced_to_1_the',
});

const APPLIED_INERT = reasons({
  motor_kv: 'stored_in_motorconfig_kv_plant_ke',
  gyro_hardware_lpf: 'no_analog_gyro_chip_the_digital',
  min_throttle: 'stored_in_motorconfig_minthrottle_glue_motorinitendpoints',
  max_throttle: 'stored_in_motorconfig_maxthrottle_glue_motorinitendpoints',
  min_command: 'stored_in_motorconfig_mincommand_glue_motorinitendpoints',
  motor_poles: 'stored_in_motorconfig_motorpolecount_rotor_hz',
  fpv_mix_degrees: 'stored_in_rxconfig_fpvcamangledegrees_boxfpvanglemix_is',
  runaway_takeoff_prevention: 'stored_in_the_pid_profile_would',
  gyro_filter_debug_axis: 'stored_only_debug_set_reads_it',
  horizon_level_strength: 'stored_horizon_mode_is_never_raised',
  horizon_limit_sticks: 'stored_horizon_mode_is_never_raised_2',
  horizon_limit_degrees: 'stored_horizon_mode_is_never_raised_3',
  horizon_ignore_sticks: 'stored_horizon_mode_is_never_raised_3',
  horizon_delay_ms: 'stored_horizon_mode_is_never_raised_3',
});

/*
 * Why an INERT key is inert: whole keys first, then the first matching
 * key prefix in this order (a longer prefix that must win sits above the
 * shorter one it would lose to), then the generic reason.
 */
const INERT_BY_KEY = new Map([
  ['name', 'craft_name_lives_in_the_game'],
  ['rpm_filter_weights', 'array_form_is_expanded_to_rpm'],
]);

const INERT_BY_PREFIX = [
  ['osd_', 'no_osd_pixels_in_the_fpv'],
  ['vtx_', 'no_vtx_in_the_sim'],
  ['gps_', 'no_gps_sensor_in_the_plant'],
  ['led_', 'no_led_strip_in_the_plant'],
  ['blackbox_', 'no_blackbox_device_in_this_build'],
  ['failsafe_switch_mode', 'no_aux_channels_until_they_are'],
  ['failsafe_stick_threshold', 'no_gps_sensor_in_the_plant'],
  ['mag_', 'no_magnetometer_in_the_plant'],
  ['baro_', 'no_barometer_in_the_plant'],
  ['acc_', 'simulated_gyro_needs_no_accelerometer_hardware'],
  ['serial', 'no_uart_grid_the_sim_is'],
  ['telemetry_', 'no_telemetry_radio_link'],
  ['beeper_', 'no_buzzer_in_the_plant'],
  ['sdcard_', 'no_sd_card_in_this_build'],
  ['dashboard_', 'no_i2c_display_in_this_build'],
  ['camera_', 'no_runcam_device_in_the_sim'],
  ['cam_', 'no_camera_control_device_in_the'],
  ['esc_', 'esc_protocol_is_not_modelled_rotor'],
  ['dshot_', 'dshot_as_a_protocol_is_not'],
  ['msp_', 'no_msp_link_values_travel_as'],
  ['rssi_', 'no_radio_link_so_no_rssi'],
  ['sbus_', 'no_sbus_receiver_sticks_come_from'],
  ['spektrum_', 'no_spektrum_receiver_sticks_come_from'],
  ['srxl2_', 'no_srxl2_receiver_sticks_come_from'],
  ['crsf_', 'no_crsf_elrs_link_sticks_come'],
  ['rx_', 'receiver_pulse_limits_are_not_a'],
  ['gyro_calib', 'the_simulated_gyro_needs_no_calibration'],
  ['gyro_overflow', 'the_simulated_gyro_needs_no_overflow'],
  ['gyro_offset', 'the_simulated_gyro_needs_no_calibration_2'],
  ['gyro_high_range', 'no_icm_20649_high_range_gyro'],
  ['gyro_to_use', 'one_simulated_gyro_not_a_dual'],
  ['gyro_hardware', 'no_analog_gyro_chip'],
  ['vbat_', 'plant_owns_pack_voltage_use_pack'],
  ['ibat_', 'plant_owns_pack_current_use_pack'],
  ['bat_', 'plant_owns_the_pack_use_pack'],
  ['battery_', 'plant_owns_the_pack_use_pack'],
  ['current_meter', 'plant_owns_pack_current_use_pack'],
  ['use_vbat_alerts', 'plant_owns_pack_voltage_use_pack'],
  ['use_cbat_alerts', 'plant_owns_the_pack_use_pack'],
  ['cbat_', 'plant_owns_the_pack_use_pack'],
  ['force_battery', 'plant_owns_the_pack_use_pack'],
  ['motor_pwm_', 'pwm_protocol_details_are_not_modelled'],
  ['motor_output_reordering', 'motor_output_reordering_is_not_modelled'],
  ['small_angle', 'an_arming_check_the_craft_is'],
  ['gyro_cal_on_first_arm', 'the_simulated_gyro_needs_no_calibration'],
  ['pilot_name', 'pilot_name_lives_in_the_game'],
  ['craft_name', 'craft_name_lives_in_the_game'],
  ['profile_name', 'one_pid_profile_profile_0'],
  ['rateprofile_name', 'one_rate_profile_profile_0'],
  ['board_name', 'board_identity_is_the_wasm_target'],
  ['manufacturer_id', 'board_identity_is_the_wasm_target_2'],
  ['acro_trainer_', 'use_acro_trainer_is_not_built'],
  ['auto_profile_cell_count', 'one_pid_profile_profile_0'],
  ['runaway_takeoff_deactivate', 'runaway_takeoff_is_not_driven_without'],
  ['rpm_limit', 'the_rpm_limiter_needs_an_esc'],
  ['max_aux_channels', 'no_aux_channels_until_they_are'],
  ['mixer_', 'mixer_type_is_live_when_it'],
  ['3d_', 'no_3d_reversible_motors_on_this'],
  ['deadband', 'stick_deadband_is_a_radio_concern'],
  ['yaw_deadband', 'stick_deadband_is_a_radio_concern'],
  ['yaw_control_reversed', 'yaw_direction_is_yaw_motors_reversed'],
  ['align_', 'board_alignment_the_simulated_gyro_needs'],
  ['debug_', 'debug_mode_is_a_blackbox_probe'],
  ['displayport_', 'no_msp_displayport_device'],
  ['frsky_', 'no_frsky_telemetry_device'],
  ['ibata', 'plant_owns_pack_current'],
  ['ibatt', 'plant_owns_pack_current'],
  ['pinio', 'no_pinio_box_in_the_plant'],
  ['usb_', 'no_usb_hid_cdc_settings_in'],
  ['vtx', 'no_vtx_in_the_sim'],
  ['gps', 'no_gps_sensor_in_the_plant'],
  ['servo', 'no_servos_on_this_airframe'],
  ['ledstrip', 'no_led_strip_in_the_plant'],
  ['sdio_', 'no_sdio_device_in_this_build'],
  ['system_', 'target_system_settings_are_not_a'],
  ['scheduler_', 'the_1_khz_step_is_fixed'],
  ['cpu_overclock', 'no_overclock_on_a_wasm_target'],
  ['stats_', 'onboard_stats_are_not_compiled'],
  ['rcdevice_', 'no_runcam_device_in_the_sim'],
  ['rc_smoothing_debug', 'debug_axis_is_a_blackbox_probe'],
  ['rc_smoothing_active', 'read_only_firmware_diagnostic_not_a'],
];

function inertReason(key) {
  if (INERT_BY_KEY.has(key)) return say(INERT_BY_KEY.get(key));
  const hit = INERT_BY_PREFIX.find(([prefix]) => key.startsWith(prefix));
  return say(hit ? hit[1] : 'would_need_the_matching_betaflight_subsystem');
}

// The screen tab for each parameter group.
const TAB_BY_PG = {
  GYRO_CONFIG: 'pid',
  DYN_NOTCH_CONFIG: 'pid',
  RPM_FILTER_CONFIG: 'pid',
  PID: 'pid',
  PID_PROFILE: 'pid',
  PID_CONFIG: 'configuration',
  CONTROL_RATE_PROFILES: 'pid',
  RX_CONFIG: 'receiver',
  RX_SPI_CONFIG: 'receiver',
  PWM_CONFIG: 'receiver',
  MOTOR_CONFIG: 'motors',
  MIXER_CONFIG: 'motors',
  ACCELEROMETER_CONFIG: 'setup',
  COMPASS_CONFIG: 'setup',
  BAROMETER_CONFIG: 'setup',
  BOARD_CONFIG: 'setup',
  OSD: 'osd',
  OSD_CONFIG: 'osd',
  VTX_CONFIG: 'vtx',
  VTX_IO_CONFIG: 'vtx',
  VTX_TABLE_CONFIG: 'vtx',
  LED_STRIP_CONFIG: 'led',
  LEDSTRIP_CONFIG: 'led',
  GPS: 'gps',
  GPS_RESCUE: 'gps',
  FAILSAFE_CONFIG: 'failsafe',
  SERVO_CONFIG: 'servos',
  SERVO_MIXER: 'servos',
  BLACKBOX_CONFIG: 'blackbox',
  BATTERY_CONFIG: 'power',
  CURRENT_SENSOR_ADC_CONFIG: 'power',
  VOLTAGE_SENSOR_ADC_CONFIG: 'power',
  SERIAL_CONFIG: 'ports',
  TELEMETRY_CONFIG: 'ports',
  MSP_CONFIG: 'ports',
  BEEPER_CONFIG: 'configuration',
  MODE_ACTIVATION_PROFILE: 'modes',
  ADJUSTMENT_RANGES: 'adjustments',
};

// The rate profile's keys, which sit on the PID tab's rates page.
const RATE_PREFIXES = ['roll_', 'pitch_', 'yaw_rc', 'yaw_srate', 'yaw_expo', 'yaw_rate_limit', 'rates_', 'thr_mid',
  'thr_expo', 'throttle_limit', 'quickrates'];

// For a key whose parameter group has no tab: the first group of prefixes
// it matches decides, in this order, and anything else is configuration.
const TAB_BY_PREFIX = [
  ['pid', ['p_', 'i_', 'd_', 'f_', 'd_min', 'tpa_', 'iterm_', 'anti_gravity', 'feedforward_', 'simplified_', 'gyro_',
    'dterm_', 'dyn_notch', 'rpm_filter', 'yaw_lowpass', 'pid_', 'crash_', 'angle_', 'horizon_', 'level_',
    'throttle_boost', 'thrust_linear', 'abs_control', 'vbat_sag', 'dyn_idle', 'ez_landing', 'transient_throttle',
    'pidsum_', 'pid_at_min', ...RATE_PREFIXES]],
  ['receiver', ['rc_smoothing', 'mid_rc', 'min_check', 'max_check', 'airmode_start', 'serialrx', 'rssi', 'rx_', 'sbus_',
    'crsf_', 'spektrum_', 'srxl2_', 'fpv_mix']],
  ['osd', ['osd_']],
  ['vtx', ['vtx_']],
  ['led', ['led_']],
  ['gps', ['gps_']],
  ['failsafe', ['failsafe_']],
  ['servos', ['servo']],
  ['blackbox', ['blackbox_']],
  ['power', ['vbat_', 'ibat_', 'bat_', 'battery_', 'current_meter', 'cbat_', 'use_vbat', 'use_cbat', 'force_battery']],
  ['motors', ['motor_', 'dshot_', 'mixer_', 'yaw_motors', 'min_throttle', 'max_throttle', 'min_command', 'crashflip']],
  ['setup', ['acc_', 'mag_', 'baro_', 'align_', 'board_', 'gyro_calib', 'gyro_offset', 'gyro_overflow', 'gyro_to_use']],
  ['ports', ['serial', 'telemetry_', 'msp_']],
];

const FILTER_PREFIXES = ['simplified_dterm_filter', 'simplified_gyro_filter', 'gyro_', 'dterm_', 'dyn_notch', 'rpm_filter',
  'yaw_lowpass', 'yaw_spin'];

const startsWithAny = (key, prefixes) => prefixes.some((p) => key.startsWith(p));

function tabOf(row) {
  if (row.pg && TAB_BY_PG[row.pg]) return TAB_BY_PG[row.pg];
  const hit = TAB_BY_PREFIX.find(([, prefixes]) => startsWithAny(row.key, prefixes));
  return hit ? hit[0] : 'configuration';
}

// The PID tab is split into filters, rates and the PID page itself.
function pageOf(key, tabId) {
  if (tabId !== 'pid') return '';
  if (startsWithAny(key, FILTER_PREFIXES)) return 'filters';
  return startsWithAny(key, RATE_PREFIXES) ? 'rates' : 'pid';
}

function unitsOf(key) {
  if (key.endsWith('_hz')) return 'Hz';
  if (key.endsWith('_ms')) return 'ms';
  if (key.includes('percent')) return '%';
  return key.endsWith('_q') ? 'Q' : '';
}

function verdict(row) {
  if (Object.hasOwn(GATED, row.key)) return { status: STATUS.GATED, reason: GATED[row.key] };
  if (Object.hasOwn(APPLIED_INERT, row.key)) return { status: STATUS.APPLIED_INERT, reason: APPLIED_INERT[row.key] };
  if (row.live) return { status: STATUS.LIVE, reason: '' };
  return { status: STATUS.INERT, reason: inertReason(row.key) };
}

function catalogued(row) {
  const tabId = tabOf(row);
  return {
    key: row.key,
    type: row.type,
    lookup: row.lookup,
    pg: row.pg,
    min: row.min,
    max: row.max,
    array: row.array,
    live: row.live,
    tab: tabId,
    page: pageOf(row.key, tabId),
    units: unitsOf(row.key),
    ...verdict(row),
  };
}

const screenTab = (id, label, grey, reason) => ({ id, label, grey, reason });
const CHROME = 'configurator_chrome_not_a_cli_key';

export const TABS = [
  screenTab('setup', say('setup'), false, say('attitude_is_live_from_the_plant')),
  screenTab('ports', say('ports'), true, say('no_uart_grid_the_sim_is')),
  screenTab('configuration', say('configuration'), false, ''),
  screenTab('pid', say('pid_tuning'), false, ''),
  screenTab('receiver', say('receiver'), false, ''),
  screenTab('modes', say('modes'), false, say('angle_and_launch_control_are_on')),
  screenTab('adjustments', say('adjustments'), true, say('no_aux_channels_so_in_flight')),
  screenTab('servos', say('servos'), true, say('no_servos_on_this_airframe')),
  screenTab('motors', say('motors'), false, ''),
  screenTab('osd', say('osd'), true, say('no_osd_pixels_in_the_fpv')),
  screenTab('vtx', say('vtx'), true, say('no_vtx_in_the_sim')),
  screenTab('led', say('led_strip'), true, say('no_led_strip_in_the_plant')),
  screenTab('gps', say('gps'), true, say('no_gps_sensor_in_the_plant')),
  screenTab('failsafe', say('failsafe'), false, ''),
  screenTab('blackbox', say('blackbox'), true, say('no_blackbox_device_in_this_build')),
  screenTab('blackbox-viewer', say('blackbox_viewer'), true, say('no_blackbox_device_in_this_build')),
  screenTab('power', say('power'), true, say('plant_owns_pack_voltage_use_pack')),
  screenTab('presets', str('ui.presets'), false, say('registry_tunes_firmware_presets_fetch_is')),
  screenTab('cli', say('cli'), false, say('same_tokenizer_as_bridge_c_save')),
  screenTab('flasher', say('firmware_flasher'), true, say(CHROME)),
  screenTab('autotune', say('autotune'), true, say(CHROME)),
  screenTab('flight-plan', say('flight_plan'), true, say(CHROME)),
  screenTab('cloud-profile', say('user_cloud_profile'), true, say(CHROME)),
  screenTab('cloud-backups', say('backups_to_cloud'), true, say(CHROME)),
];

/*
 * `feature NAME` lines are CLI commands, not valueTable keys, so they are
 * catalogued here rather than in FIELDS, where lint:catalog would look for
 * a firmware setting that does not exist.
 */
const feature = (name, status, why) => ({ name, status, reason: say(why) });

export const FEATURES = [
  feature('AIRMODE', STATUS.LIVE, 'compiled_writes_feature_airmode_or_feature'),
  feature('ANTI_GRAVITY', STATUS.LIVE, 'compiled_writes_feature_anti_gravity_or'),
  feature('GPS', STATUS.INERT, 'no_gps_sensor_in_the_plant'),
  feature('OSD', STATUS.INERT, 'no_osd_pixels_in_the_fpv'),
  feature('LED_STRIP', STATUS.INERT, 'no_led_strip_in_the_plant'),
  feature('TELEMETRY', STATUS.INERT, 'no_telemetry_radio_link'),
  feature('RX_SPI', STATUS.INERT, 'no_spi_receiver_sticks_come_from'),
  feature('3D', STATUS.INERT, 'no_3d_mixer_on_this_airframe'),
  feature('SERVO', STATUS.INERT, 'no_servos_on_this_airframe'),
  feature('SOFTSERIAL', STATUS.INERT, 'no_uart_grid_the_sim_is'),
];

// Configurator screens and widgets with no CLI key behind them, keyed with
// a leading # so they can never collide with a firmware key.
const chrome = (key, onTab, why) => ({ key, tab: onTab, status: STATUS.ABSENT, reason: say(why) });

export const ABSENT_FIELDS = [
  chrome('#flasher', 'flasher', CHROME),
  chrome('#ports_uart', 'ports', 'no_uart_grid_the_sim_is'),
  chrome('#msp_rx', 'receiver', 'no_msp_receiver_sticks_come_from'),
  chrome('#autotune', 'autotune', CHROME),
  chrome('#led_painter', 'led', 'no_led_strip_in_the_plant'),
  chrome('#blackbox_viewer', 'blackbox-viewer', 'no_blackbox_device_in_this_build'),
  chrome('#flight_plan', 'flight-plan', CHROME),
  chrome('#cloud_profile', 'cloud-profile', CHROME),
  chrome('#cloud_backups', 'cloud-backups', CHROME),
  chrome('#aux_ranges', 'modes', 'no_aux_channels_until_they_are'),
];

const chromeField = (f) => ({
  key: f.key,
  type: null,
  lookup: null,
  pg: null,
  min: null,
  max: null,
  array: false,
  live: false,
  tab: f.tab,
  page: '',
  units: '',
  status: f.status,
  reason: f.reason,
});

export const FIELDS = [...VALUE_TABLE.map(catalogued), ...ABSENT_FIELDS.map(chromeField)];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function field(key) {
  return BY_KEY.get(key) ?? null;
}

/*
 * The screen's enablement comes from here. The module's sim_bf_key_status
 * answers 0 for every key in its write table, GATED and APPLIED_INERT
 * included, so it does not say whether a control should be grey.
 */
export function status(key) {
  return BY_KEY.get(key)?.status ?? STATUS.INERT;
}

export function tabFields(tabId) {
  return FIELDS.filter((f) => f.tab === tabId);
}

export function catalogCounts() {
  const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0]));
  for (const f of FIELDS) counts[f.status] += 1;
  return counts;
}

export const GATED_KEYS = Object.keys(GATED);
export const APPLIED_INERT_KEYS = Object.keys(APPLIED_INERT);

/*
 * The lookups the screen offers as a cycle of the firmware's own CLI
 * names (it never invents numeric enums); a lookup not listed gets no
 * picker. FAILSAFE leaves out GPS-RESCUE: no GPS is built, and although
 * the module flies a pasted GPS-RESCUE as DROP, the screen does not offer
 * it.
 */
const OFFERED_LOOKUPS = ['OFF_ON', 'OFF_ON_AUTO', 'ITERM_RELAX', 'ITERM_RELAX_TYPE', 'TPA_MODE', 'RATES_TYPE',
  'GYRO_LPF_TYPE', 'DTERM_LPF_TYPE', 'MIXER_TYPE', 'THROTTLE_LIMIT_TYPE', 'SIMPLIFIED_TUNING_PIDS_MODE',
  'FEEDFORWARD_AVERAGING', 'CRASH_RECOVERY', 'GYRO_HARDWARE_LPF', 'LAUNCH_CONTROL_MODE', 'FAILSAFE'];
const NOT_OFFERED = { FAILSAFE: ['GPS-RESCUE'] };

function offeredValues(name) {
  const values = FIRMWARE_LOOKUPS[name];
  if (!values) throw new Error(`catalog: the firmware has no lookup table ${name}; regenerate catalog-data.js`);
  const hidden = NOT_OFFERED[name] ?? [];
  return values.filter((v) => !hidden.includes(v));
}

export const LOOKUPS = Object.fromEntries(OFFERED_LOOKUPS.map((name) => [name, offeredValues(name)]));

/*
 * The bound macros the screen resolves to a number; a bound naming any
 * other macro falls back to the type's default range. UINT8_MAX and
 * UINT16_MAX are C's, not the firmware's, so the generated table does not
 * have them.
 */
const RESOLVED_BOUNDS = ['PID_GAIN_MAX', 'D_MIN_GAIN_MAX', 'F_GAIN_MAX', 'TPA_MAX', 'LPF_MAX_HZ', 'DYN_LPF_MAX_HZ',
  'DYN_NOTCH_COUNT_MAX', 'MAX_PID_PROCESS_DENOM', 'SIMPLIFIED_TUNING_PIDS_MIN', 'SIMPLIFIED_TUNING_FILTERS_MIN',
  'SIMPLIFIED_TUNING_MAX', 'CONTROL_RATE_CONFIG_RATE_MAX', 'CONTROL_RATE_CONFIG_RC_EXPO_MAX',
  'CONTROL_RATE_CONFIG_RC_RATES_MAX', 'CONTROL_RATE_CONFIG_RATE_LIMIT_MIN', 'CONTROL_RATE_CONFIG_RATE_LIMIT_MAX',
  'ITERM_ACCELERATOR_GAIN_OFF', 'ITERM_ACCELERATOR_GAIN_MAX', 'PIDSUM_LIMIT_MIN', 'PIDSUM_LIMIT_MAX',
  'MOTOR_OUTPUT_LIMIT_PERCENT_MIN', 'MOTOR_OUTPUT_LIMIT_PERCENT_MAX', 'LAUNCH_CONTROL_THROTTLE_TRIGGER_MAX',
  'PWM_RANGE_MIN', 'PWM_RANGE_MAX', 'PWM_PULSE_MIN', 'PWM_PULSE_MAX'];

function firmwareBound(name) {
  if (!Object.hasOwn(FIRMWARE_BOUNDS, name)) {
    throw new Error(`catalog: the firmware has no integer ${name}; regenerate catalog-data.js`);
  }
  return [name, FIRMWARE_BOUNDS[name]];
}

const BOUND_VALUES = {
  ...Object.fromEntries(RESOLVED_BOUNDS.map(firmwareBound)),
  UINT8_MAX: 255,
  UINT16_MAX: 65535,
};

// A bound token from the value table as a number: an integer literal, a
// resolved macro, or the fallback.
function boundValue(token, fallback) {
  if (token === null || token === undefined || token === '') return fallback;
  if (/^-?\d+$/.test(token)) return Number(token);
  return Object.hasOwn(BOUND_VALUES, token) ? BOUND_VALUES[token] : fallback;
}

export function fieldBounds(field) {
  const wide = field.type === 'UINT16' || field.type === 'INT16';
  const signed = field.type === 'INT8' || field.type === 'INT16';
  return {
    min: boundValue(field.min, signed ? -128 : 0),
    max: boundValue(field.max, wide ? 2000 : 255),
  };
}

export function lookupValues(name) {
  return LOOKUPS[name] ?? null;
}

export function fieldEnabled(field) {
  const s = status(field.key);
  return s === STATUS.LIVE || s === STATUS.GATED;
}
