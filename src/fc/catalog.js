/*
 * catalog.js: capability catalog for the flight-controller screen.
 *
 * Every Configurator field has one status. The renderer has one disabled
 * style. This file is the only place that decides LIVE versus grey. The UI
 * asks status(key). It does not know what a dyn notch is.
 *
 * Status rules:
 *   LIVE           writes a PG this build compiles, and that code runs
 *   GATED          writes the PG; this firmware then ignores it at 1 kHz
 *   APPLIED_INERT  writes a PG; nothing that flies reads it
 *   INERT          real 4.5 CLI key, subsystem not compiled
 *   ABSENT         Configurator chrome that is not a CLI key here
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

import { VALUE_TABLE } from './catalog-data.js';
import { str } from '../strings/index.js';

export const STATUS = {
  LIVE: 'LIVE',
  GATED: 'GATED',
  APPLIED_INERT: 'APPLIED_INERT',
  INERT: 'INERT',
  ABSENT: 'ABSENT',
};

/*
 * GATED vs INERT is the honesty line. Grey means this simulator does not
 * have that machine. A noted GATED control means Betaflight has it, and at
 * 1 kHz it does what 1 kHz Betaflight does. Greying the dynamic notch would
 * teach the wrong lesson: a real 8 kHz gyro / 1 kHz PID board also has no
 * dyn notch.
 */
const GATED = {
  dyn_notch_count:
    str('catalog.betaflight_sdft_will_not_arm_below'),
  dyn_notch_q:
    str('catalog.betaflight_sdft_will_not_arm_below'),
  dyn_notch_min_hz:
    str('catalog.betaflight_sdft_will_not_arm_below'),
  dyn_notch_max_hz:
    str('catalog.betaflight_sdft_will_not_arm_below'),
  pid_process_denom:
    str('catalog.stored_then_forced_to_1_the'),
};

const APPLIED_INERT = {
  motor_kv:
    str('catalog.stored_in_motorconfig_kv_plant_ke'),
  gyro_hardware_lpf:
    str('catalog.no_analog_gyro_chip_the_digital'),
  min_throttle:
    str('catalog.stored_in_motorconfig_minthrottle_glue_motorinitendpoints'),
  max_throttle:
    str('catalog.stored_in_motorconfig_maxthrottle_glue_motorinitendpoints'),
  min_command:
    str('catalog.stored_in_motorconfig_mincommand_glue_motorinitendpoints'),
  motor_poles:
    str('catalog.stored_in_motorconfig_motorpolecount_rotor_hz'),
  fpv_mix_degrees:
    str('catalog.stored_in_rxconfig_fpvcamangledegrees_boxfpvanglemix_is'),
  runaway_takeoff_prevention:
    str('catalog.stored_in_the_pid_profile_would'),
  gyro_filter_debug_axis:
    str('catalog.stored_only_debug_set_reads_it'),
  horizon_level_strength:
    str('catalog.stored_horizon_mode_is_never_raised'),
  horizon_limit_sticks:
    str('catalog.stored_horizon_mode_is_never_raised_2'),
  horizon_limit_degrees:
    str('catalog.stored_horizon_mode_is_never_raised_3'),
  horizon_ignore_sticks:
    str('catalog.stored_horizon_mode_is_never_raised_3'),
  horizon_delay_ms:
    str('catalog.stored_horizon_mode_is_never_raised_3'),
};

const INERT_REASONS = [
  [/^osd_/, str('catalog.no_osd_pixels_in_the_fpv')],
  [/^vtx_/, str('catalog.no_vtx_in_the_sim')],
  [/^gps_/, str('catalog.no_gps_sensor_in_the_plant')],
  [/^led_/, str('catalog.no_led_strip_in_the_plant')],
  [/^blackbox_/, str('catalog.no_blackbox_device_in_this_build')],
  [/^failsafe_/, str('catalog.would_need_flight_failsafe_c_compiled')],
  [/^mag_/, str('catalog.no_magnetometer_in_the_plant')],
  [/^baro_/, str('catalog.no_barometer_in_the_plant')],
  [/^acc_/, str('catalog.simulated_gyro_needs_no_accelerometer_hardware')],
  [/^serial/, str('catalog.no_uart_grid_the_sim_is')],
  [/^telemetry_/, str('catalog.no_telemetry_radio_link')],
  [/^beeper_/, str('catalog.no_buzzer_in_the_plant')],
  [/^sdcard_/, str('catalog.no_sd_card_in_this_build')],
  [/^dashboard_/, str('catalog.no_i2c_display_in_this_build')],
  [/^camera_/, str('catalog.no_runcam_device_in_the_sim')],
  [/^cam_/, str('catalog.no_camera_control_device_in_the')],
  [/^esc_/, str('catalog.esc_protocol_is_not_modelled_rotor')],
  [/^dshot_/, str('catalog.dshot_as_a_protocol_is_not')],
  [/^msp_/, str('catalog.no_msp_link_values_travel_as')],
  [/^rssi_/, str('catalog.no_radio_link_so_no_rssi')],
  [/^sbus_/, str('catalog.no_sbus_receiver_sticks_come_from')],
  [/^spektrum_/, str('catalog.no_spektrum_receiver_sticks_come_from')],
  [/^srxl2_/, str('catalog.no_srxl2_receiver_sticks_come_from')],
  [/^crsf_/, str('catalog.no_crsf_elrs_link_sticks_come')],
  [/^rx_/, str('catalog.receiver_pulse_limits_are_not_a')],
  [/^gyro_calib/, str('catalog.the_simulated_gyro_needs_no_calibration')],
  [/^gyro_overflow/, str('catalog.the_simulated_gyro_needs_no_overflow')],
  [/^gyro_offset/, str('catalog.the_simulated_gyro_needs_no_calibration_2')],
  [/^gyro_high_range/, str('catalog.no_icm_20649_high_range_gyro')],
  [/^gyro_to_use/, str('catalog.one_simulated_gyro_not_a_dual')],
  [/^gyro_hardware/, str('catalog.no_analog_gyro_chip')],
  [/^vbat_/, str('catalog.plant_owns_pack_voltage_use_pack')],
  [/^ibat_/, str('catalog.plant_owns_pack_current_use_pack')],
  [/^bat_/, str('catalog.plant_owns_the_pack_use_pack')],
  [/^battery_/, str('catalog.plant_owns_the_pack_use_pack')],
  [/^current_meter/, str('catalog.plant_owns_pack_current_use_pack')],
  [/^use_vbat_alerts/, str('catalog.plant_owns_pack_voltage_use_pack')],
  [/^use_cbat_alerts/, str('catalog.plant_owns_the_pack_use_pack')],
  [/^cbat_/, str('catalog.plant_owns_the_pack_use_pack')],
  [/^force_battery/, str('catalog.plant_owns_the_pack_use_pack')],
  [/^motor_pwm_/, str('catalog.pwm_protocol_details_are_not_modelled')],
  [/^motor_output_reordering/, str('catalog.motor_output_reordering_is_not_modelled')],
  [/^motor_pwm_inversion/, str('catalog.motor_output_inversion_is_not_modelled')],
  [/^small_angle/, str('catalog.an_arming_check_the_craft_is')],
  [/^gyro_cal_on_first_arm/, str('catalog.the_simulated_gyro_needs_no_calibration')],
  [/^pilot_name/, str('catalog.pilot_name_lives_in_the_game')],
  [/^craft_name/, str('catalog.craft_name_lives_in_the_game')],
  [/^profile_name/, str('catalog.one_pid_profile_profile_0')],
  [/^rateprofile_name/, str('catalog.one_rate_profile_profile_0')],
  [/^board_name/, str('catalog.board_identity_is_the_wasm_target')],
  [/^manufacturer_id/, str('catalog.board_identity_is_the_wasm_target_2')],
  [/^acro_trainer_/, str('catalog.use_acro_trainer_is_not_built')],
  [/^auto_profile_cell_count/, str('catalog.one_pid_profile_profile_0')],
  [/^runaway_takeoff_deactivate/, str('catalog.runaway_takeoff_is_not_driven_without')],
  [/^rpm_limit/, str('catalog.the_rpm_limiter_needs_an_esc')],
  [/^max_aux_channels/, str('catalog.no_aux_channels_until_they_are')],
  [/^mixer_/, str('catalog.mixer_type_is_live_when_it')],
  [/^3d_/, str('catalog.no_3d_reversible_motors_on_this')],
  [/^deadband/, str('catalog.stick_deadband_is_a_radio_concern')],
  [/^yaw_deadband/, str('catalog.stick_deadband_is_a_radio_concern')],
  [/^yaw_control_reversed/, str('catalog.yaw_direction_is_yaw_motors_reversed')],
  [/^align_/, str('catalog.board_alignment_the_simulated_gyro_needs')],
  [/^debug_/, str('catalog.debug_mode_is_a_blackbox_probe')],
  [/^displayport_/, str('catalog.no_msp_displayport_device')],
  [/^frsky_/, str('catalog.no_frsky_telemetry_device')],
  [/^ibata/, str('catalog.plant_owns_pack_current')],
  [/^ibatt/, str('catalog.plant_owns_pack_current')],
  [/^pinio/, str('catalog.no_pinio_box_in_the_plant')],
  [/^usb_/, str('catalog.no_usb_hid_cdc_settings_in')],
  [/^vtx/, str('catalog.no_vtx_in_the_sim')],
  [/^gps/, str('catalog.no_gps_sensor_in_the_plant')],
  [/^servo/, str('catalog.no_servos_on_this_airframe')],
  [/^ledstrip/, str('catalog.no_led_strip_in_the_plant')],
  [/^sdio_/, str('catalog.no_sdio_device_in_this_build')],
  [/^system_/, str('catalog.target_system_settings_are_not_a')],
  [/^scheduler_/, str('catalog.the_1_khz_step_is_fixed')],
  [/^cpu_overclock/, str('catalog.no_overclock_on_a_wasm_target')],
  [/^stats_/, str('catalog.onboard_stats_are_not_compiled')],
  [/^name$/, str('catalog.craft_name_lives_in_the_game')],
  [/^rcdevice_/, str('catalog.no_runcam_device_in_the_sim')],
  [/^rc_smoothing_debug/, str('catalog.debug_axis_is_a_blackbox_probe')],
  [/^rc_smoothing_active/, str('catalog.read_only_firmware_diagnostic_not_a')],
  [/^rpm_filter_weights$/, str('catalog.array_form_is_expanded_to_rpm')],
];

function inertReason(key) {
  for (const [re, reason] of INERT_REASONS) {
    if (re.test(key)) {
      return reason;
    }
  }
  return str('catalog.would_need_the_matching_betaflight_subsystem');
}

const PG_TAB = {
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

function tabFor(row) {
  if (row.pg && PG_TAB[row.pg]) {
    return PG_TAB[row.pg];
  }
  const key = row.key;
  if (/^(p_|i_|d_|f_|d_min|tpa_|iterm_|anti_gravity|feedforward_|simplified_|gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|pid_|crash_|angle_|horizon_|level_|throttle_boost|thrust_linear|abs_control|vbat_sag|dyn_idle|ez_landing|transient_throttle|pidsum_|pid_at_min)/.test(key)) {
    return 'pid';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'pid';
  }
  if (/^(rc_smoothing|mid_rc|min_check|max_check|airmode_start|serialrx|rssi|rx_|sbus_|crsf_|spektrum_|srxl2_|fpv_mix)/.test(key)) {
    return 'receiver';
  }
  if (/^osd_/.test(key)) {
    return 'osd';
  }
  if (/^vtx_/.test(key)) {
    return 'vtx';
  }
  if (/^led_/.test(key)) {
    return 'led';
  }
  if (/^gps_/.test(key)) {
    return 'gps';
  }
  if (/^failsafe_/.test(key)) {
    return 'failsafe';
  }
  if (/^servo/.test(key)) {
    return 'servos';
  }
  if (/^blackbox_/.test(key)) {
    return 'blackbox';
  }
  if (/^(vbat_|ibat_|bat_|battery_|current_meter|cbat_|use_vbat|use_cbat|force_battery)/.test(key)) {
    return 'power';
  }
  if (/^(motor_|dshot_|mixer_|yaw_motors|min_throttle|max_throttle|min_command|crashflip)/.test(key)) {
    return 'motors';
  }
  if (/^(acc_|mag_|baro_|align_|board_|gyro_calib|gyro_offset|gyro_overflow|gyro_to_use)/.test(key)) {
    return 'setup';
  }
  if (/^(serial|telemetry_|msp_)/.test(key)) {
    return 'ports';
  }
  return 'configuration';
}

function pageFor(key, tab) {
  if (tab !== 'pid') {
    return '';
  }
  if (/^simplified_(dterm_filter|gyro_filter)/.test(key)) {
    return 'filters';
  }
  if (/^(gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|yaw_spin)/.test(key)) {
    return 'filters';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'rates';
  }
  return 'pid';
}

function unitsFor(key) {
  if (key.endsWith('_hz')) {
    return 'Hz';
  }
  if (key.endsWith('_ms')) {
    return 'ms';
  }
  if (key.includes('percent')) {
    return '%';
  }
  if (key.endsWith('_q') || key === 'dyn_notch_q' || key === 'rpm_filter_q') {
    return 'Q';
  }
  return '';
}

function classify(row) {
  if (Object.prototype.hasOwnProperty.call(GATED, row.key)) {
    return { status: STATUS.GATED, reason: GATED[row.key] };
  }
  if (Object.prototype.hasOwnProperty.call(APPLIED_INERT, row.key)) {
    return { status: STATUS.APPLIED_INERT, reason: APPLIED_INERT[row.key] };
  }
  if (row.live) {
    return { status: STATUS.LIVE, reason: '' };
  }
  return { status: STATUS.INERT, reason: inertReason(row.key) };
}

function decorate(row) {
  const tab = tabFor(row);
  const { status, reason } = classify(row);
  return {
    key: row.key,
    type: row.type,
    lookup: row.lookup,
    pg: row.pg,
    min: row.min,
    max: row.max,
    array: row.array,
    live: row.live,
    tab,
    page: pageFor(row.key, tab),
    units: unitsFor(row.key),
    status,
    reason,
  };
}

export const TABS = [
  { id: 'setup', label: str('catalog.setup'), grey: false, reason: str('catalog.attitude_is_live_from_the_plant') },
  { id: 'ports', label: str('catalog.ports'), grey: true, reason: str('catalog.no_uart_grid_the_sim_is') },
  { id: 'configuration', label: str('catalog.configuration'), grey: false, reason: '' },
  { id: 'pid', label: str('catalog.pid_tuning'), grey: false, reason: '' },
  { id: 'receiver', label: str('catalog.receiver'), grey: false, reason: '' },
  { id: 'modes', label: str('catalog.modes'), grey: false, reason: str('catalog.angle_and_launch_control_are_on') },
  { id: 'adjustments', label: str('catalog.adjustments'), grey: true, reason: str('catalog.no_aux_channels_so_in_flight') },
  { id: 'servos', label: str('catalog.servos'), grey: true, reason: str('catalog.no_servos_on_this_airframe') },
  { id: 'motors', label: str('catalog.motors'), grey: false, reason: '' },
  { id: 'osd', label: str('catalog.osd'), grey: true, reason: str('catalog.no_osd_pixels_in_the_fpv') },
  { id: 'vtx', label: str('catalog.vtx'), grey: true, reason: str('catalog.no_vtx_in_the_sim') },
  { id: 'led', label: str('catalog.led_strip'), grey: true, reason: str('catalog.no_led_strip_in_the_plant') },
  { id: 'gps', label: str('catalog.gps'), grey: true, reason: str('catalog.no_gps_sensor_in_the_plant') },
  { id: 'failsafe', label: str('catalog.failsafe'), grey: true, reason: str('catalog.would_need_flight_failsafe_c_compiled') },
  { id: 'blackbox', label: str('catalog.blackbox'), grey: true, reason: str('catalog.no_blackbox_device_in_this_build') },
  { id: 'blackbox-viewer', label: str('catalog.blackbox_viewer'), grey: true, reason: str('catalog.no_blackbox_device_in_this_build') },
  { id: 'power', label: str('catalog.power'), grey: true, reason: str('catalog.plant_owns_pack_voltage_use_pack') },
  { id: 'presets', label: str('ui.presets'), grey: false, reason: str('catalog.registry_tunes_firmware_presets_fetch_is') },
  { id: 'cli', label: str('catalog.cli'), grey: false, reason: str('catalog.same_tokenizer_as_bridge_c_save') },
  { id: 'flasher', label: str('catalog.firmware_flasher'), grey: true, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { id: 'autotune', label: str('catalog.autotune'), grey: true, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { id: 'flight-plan', label: str('catalog.flight_plan'), grey: true, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { id: 'cloud-profile', label: str('catalog.user_cloud_profile'), grey: true, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { id: 'cloud-backups', label: str('catalog.backups_to_cloud'), grey: true, reason: str('catalog.configurator_chrome_not_a_cli_key') },
];

/*
 * Features are CLI commands, not valueTable keys. Do not put them in
 * FIELDS or catalog-lint will demand a firmware setting that does not
 * exist. The Configuration tab asks this list the same way it asks
 * status(key) for set lines.
 */
export const FEATURES = [
  { name: 'AIRMODE', status: STATUS.LIVE, reason: str('catalog.compiled_writes_feature_airmode_or_feature') },
  { name: 'ANTI_GRAVITY', status: STATUS.LIVE, reason: str('catalog.compiled_writes_feature_anti_gravity_or') },
  { name: 'GPS', status: STATUS.INERT, reason: str('catalog.no_gps_sensor_in_the_plant') },
  { name: 'OSD', status: STATUS.INERT, reason: str('catalog.no_osd_pixels_in_the_fpv') },
  { name: 'LED_STRIP', status: STATUS.INERT, reason: str('catalog.no_led_strip_in_the_plant') },
  { name: 'TELEMETRY', status: STATUS.INERT, reason: str('catalog.no_telemetry_radio_link') },
  { name: 'RX_SPI', status: STATUS.INERT, reason: str('catalog.no_spi_receiver_sticks_come_from') },
  { name: '3D', status: STATUS.INERT, reason: str('catalog.no_3d_mixer_on_this_airframe') },
  { name: 'SERVO', status: STATUS.INERT, reason: str('catalog.no_servos_on_this_airframe') },
  { name: 'SOFTSERIAL', status: STATUS.INERT, reason: str('catalog.no_uart_grid_the_sim_is') },
];

export const ABSENT_FIELDS = [
  { key: '#flasher', tab: 'flasher', status: STATUS.ABSENT, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { key: '#ports_uart', tab: 'ports', status: STATUS.ABSENT, reason: str('catalog.no_uart_grid_the_sim_is') },
  { key: '#msp_rx', tab: 'receiver', status: STATUS.ABSENT, reason: str('catalog.no_msp_receiver_sticks_come_from') },
  { key: '#autotune', tab: 'autotune', status: STATUS.ABSENT, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { key: '#led_painter', tab: 'led', status: STATUS.ABSENT, reason: str('catalog.no_led_strip_in_the_plant') },
  { key: '#blackbox_viewer', tab: 'blackbox-viewer', status: STATUS.ABSENT, reason: str('catalog.no_blackbox_device_in_this_build') },
  { key: '#flight_plan', tab: 'flight-plan', status: STATUS.ABSENT, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { key: '#cloud_profile', tab: 'cloud-profile', status: STATUS.ABSENT, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { key: '#cloud_backups', tab: 'cloud-backups', status: STATUS.ABSENT, reason: str('catalog.configurator_chrome_not_a_cli_key') },
  { key: '#aux_ranges', tab: 'modes', status: STATUS.ABSENT, reason: str('catalog.no_aux_channels_until_they_are') },
];

export const FIELDS = VALUE_TABLE.map(decorate).concat(
  ABSENT_FIELDS.map((f) => ({
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
  })),
);

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function field(key) {
  return BY_KEY.get(key) ?? null;
}

export function status(key) {
  const f = BY_KEY.get(key);
  return f ? f.status : STATUS.INERT;
}

/*
 * The FC screen asks status(key) here. Do not treat sim_bf_key_status as
 * enablement: native 0 means "in the write table", which includes GATED
 * and APPLIED_INERT. Grey-out is this catalog, not the C int.
 */

export function tabFields(tabId) {
  return FIELDS.filter((f) => f.tab === tabId);
}

export function catalogCounts() {
  const counts = {
    LIVE: 0,
    GATED: 0,
    APPLIED_INERT: 0,
    INERT: 0,
    ABSENT: 0,
  };
  for (const f of FIELDS) {
    counts[f.status] += 1;
  }
  return counts;
}

export const GATED_KEYS = Object.keys(GATED);
export const APPLIED_INERT_KEYS = Object.keys(APPLIED_INERT);

/*
 * CLI lookup names as Betaflight 4.5.1 prints them. The FC screen cycles
 * these strings. It does not invent numeric enums.
 */
export const LOOKUPS = {
  OFF_ON: ['OFF', 'ON'],
  OFF_ON_AUTO: ['OFF', 'ON', 'AUTO'],
  ITERM_RELAX: ['OFF', 'RP', 'RPY', 'RP_INC', 'RPY_INC'],
  ITERM_RELAX_TYPE: ['GYRO', 'SETPOINT'],
  TPA_MODE: ['PD', 'D'],
  RATES_TYPE: ['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK'],
  GYRO_LPF_TYPE: ['PT1', 'BIQUAD', 'PT2', 'PT3'],
  DTERM_LPF_TYPE: ['PT1', 'BIQUAD', 'PT2', 'PT3'],
  MIXER_TYPE: ['LEGACY', 'LINEAR', 'DYNAMIC', 'EZLANDING'],
  THROTTLE_LIMIT_TYPE: ['OFF', 'SCALE', 'CLIP'],
  SIMPLIFIED_TUNING_PIDS_MODE: ['OFF', 'RP', 'RPY'],
  FEEDFORWARD_AVERAGING: ['OFF', '2_POINT', '3_POINT', '4_POINT'],
  CRASH_RECOVERY: ['OFF', 'ON', 'BEEP', 'DISARM'],
  GYRO_HARDWARE_LPF: ['NORMAL', 'OPTION_1', 'OPTION_2', 'EXPERIMENTAL'],
  LAUNCH_CONTROL_MODE: ['NORMAL', 'PITCHONLY', 'FULL'],
};

const MACRO_BOUNDS = {
  PID_GAIN_MAX: 250,
  D_MIN_GAIN_MAX: 250,
  F_GAIN_MAX: 1000,
  TPA_MAX: 100,
  LPF_MAX_HZ: 1000,
  DYN_LPF_MAX_HZ: 1000,
  DYN_NOTCH_COUNT_MAX: 5,
  MAX_PID_PROCESS_DENOM: 16,
  SIMPLIFIED_TUNING_PIDS_MIN: 0,
  SIMPLIFIED_TUNING_FILTERS_MIN: 10,
  SIMPLIFIED_TUNING_MAX: 200,
  CONTROL_RATE_CONFIG_RATE_MAX: 255,
  CONTROL_RATE_CONFIG_RC_EXPO_MAX: 100,
  CONTROL_RATE_CONFIG_RC_RATES_MAX: 255,
  CONTROL_RATE_CONFIG_RATE_LIMIT_MIN: 200,
  CONTROL_RATE_CONFIG_RATE_LIMIT_MAX: 1998,
  ITERM_ACCELERATOR_GAIN_OFF: 0,
  ITERM_ACCELERATOR_GAIN_MAX: 250,
  PIDSUM_LIMIT_MIN: 100,
  PIDSUM_LIMIT_MAX: 1000,
  MOTOR_OUTPUT_LIMIT_PERCENT_MIN: 1,
  MOTOR_OUTPUT_LIMIT_PERCENT_MAX: 100,
  LAUNCH_CONTROL_THROTTLE_TRIGGER_MAX: 90,
  PWM_RANGE_MIN: 1000,
  PWM_RANGE_MAX: 2000,
  UINT8_MAX: 255,
  UINT16_MAX: 65535,
};

function tokenNumber(tok, fallback) {
  if (tok == null || tok === '') {
    return fallback;
  }
  if (/^-?\d+$/.test(tok)) {
    return Number(tok);
  }
  if (Object.prototype.hasOwnProperty.call(MACRO_BOUNDS, tok)) {
    return MACRO_BOUNDS[tok];
  }
  return fallback;
}

export function fieldBounds(field) {
  const fallbackMax = field.type === 'UINT16' || field.type === 'INT16' ? 2000 : 255;
  const fallbackMin = field.type === 'INT8' || field.type === 'INT16' ? -128 : 0;
  return {
    min: tokenNumber(field.min, fallbackMin),
    max: tokenNumber(field.max, fallbackMax),
  };
}

export function lookupValues(name) {
  return LOOKUPS[name] ?? null;
}

export function fieldEnabled(field) {
  const s = status(field.key);
  return s === STATUS.LIVE || s === STATUS.GATED;
}
