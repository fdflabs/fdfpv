import { str } from '../strings/index.js';
/*
 * keynotes.js: what a firmware key DOES, in a sentence a pilot can act on.
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

/*
 * The FC screen's help column. Betaflight's settings table, which the
 * catalog is generated from, has types and ranges but no prose, so the
 * sentences live here, where regenerating the catalog cannot wipe them.
 *
 * A sentence states the consequence of the setting ("how hard it corrects
 * the error it sees now"), not the expansion of its name. A key without a
 * sentence gets only what the catalog knows for certain, because a wrong
 * explanation of a filter costs a pilot more than a dull one.
 */

const AXES = ['roll', 'pitch', 'yaw'];

const exact = (...keys) => (key) => keys.includes(key);
const perAxis = (stem) => exact(...AXES.map((axis) => `${stem}_${axis}`));
const startsWith = (...prefixes) => (key) => prefixes.some((p) => key.startsWith(p));
const endsWith = (...suffixes) => (key) => suffixes.some((s) => key.endsWith(s));

// Checked in order and the first match wins, so a specific key sits above
// the family it belongs to. Notes are keynotes.* string keys.
const NOTES = [
  [perAxis('p'), 'how_hard_the_controller_corrects_the'],
  [perAxis('i'), 'how_hard_it_corrects_error_that'],
  [perAxis('d'), 'damping_ceiling_resists_fast_movement_which'],
  [perAxis('d_min'), 'damping_floor_where_d_sits_while'],
  [perAxis('f'), 'feedforward_pushes_on_stick_movement_before'],
  [exact('d_min_advance'), 'how_eagerly_d_climbs_from_its'],
  [exact('d_min_boost_gain'), 'how_much_of_the_gap_between'],

  [exact('iterm_relax'), 'which_axes_stop_accumulating_i_while'],
  [exact('iterm_relax_type'), 'whether_relax_watches_the_gyro_or'],
  [exact('iterm_relax_cutoff'), 'how_quick_a_stick_movement_counts'],
  [exact('iterm_windup'), 'the_motor_saturation_point_past_which'],
  [exact('iterm_limit'), 'a_hard_ceiling_on_how_much'],
  [exact('iterm_rotation'), 'rotates_accumulated_i_with_the_craft'],

  [exact('anti_gravity_gain'), 'how_much_extra_i_is_thrown'],
  [exact('anti_gravity_cutoff_hz', 'anti_gravity_p_gain'), 'shapes_how_anti_gravity_reacts_to'],

  [exact('tpa_rate'), 'how_much_pid_gain_is_taken'],
  [exact('tpa_breakpoint'), 'the_throttle_position_where_that_reduction'],
  [exact('tpa_mode'), 'whether_tpa_reduces_d_only_or'],
  [startsWith('throttle_boost'), 'a_short_kick_of_extra_throttle'],
  [exact('thr_mid'), 'where_the_middle_of_the_throttle'],
  [exact('thr_expo'), 'softens_the_throttle_around_the_middle'],
  [exact('throttle_limit_type', 'throttle_limit_percent'), 'caps_the_throttle_output_either_by'],

  [exact('feedforward_transition'), 'fades_feedforward_in_away_from_centre'],
  [exact('feedforward_smooth_factor'), 'smooths_the_feedforward_signal_more_is'],
  [exact('feedforward_jitter_factor'), 'ignores_the_small_stick_jitter_a'],
  [exact('feedforward_boost'), 'extra_push_on_the_sharpest_part'],
  [exact('feedforward_max_rate_limit'), 'stops_feedforward_asking_for_more_rotation'],
  [exact('feedforward_averaging'), 'averages_feedforward_over_a_number_of'],

  [exact('gyro_lpf1_dyn_min_hz', 'gyro_lpf1_dyn_max_hz'), 'the_ends_of_the_dynamic_gyro'],
  [exact('gyro_lpf1_type', 'gyro_lpf1_static_hz'), 'the_first_gyro_lowpass_lower_is'],
  [startsWith('gyro_lpf2_'), 'the_second_gyro_lowpass_sitting_after'],
  [exact('dterm_lpf1_dyn_min_hz', 'dterm_lpf1_dyn_max_hz'), 'the_ends_of_the_dynamic_d'],
  [startsWith('dterm_lpf1_'), 'the_first_d_term_lowpass_lowering'],
  [startsWith('dterm_lpf2_'), 'the_second_d_term_lowpass_after'],
  [startsWith('dterm_notch_'), 'a_narrow_notch_in_the_d'],
  [exact('dyn_notch_count'), 'how_many_moving_notches_hunt_for'],
  [exact('dyn_notch_q'), 'how_narrow_each_moving_notch_is'],
  [exact('dyn_notch_min_hz', 'dyn_notch_max_hz'), 'the_band_the_moving_notches_are'],
  [exact('rpm_filter_harmonics'), 'how_many_multiples_of_the_motor'],
  [exact('rpm_filter_q'), 'how_narrow_the_rpm_notches_are'],
  [startsWith('rpm_filter_min_hz', 'rpm_filter_fade_range_hz', 'rpm_filter_lpf_hz', 'rpm_filter_weights'),
    'shapes_the_rpm_notch_filter_where'],
  [exact('yaw_lowpass_hz'), 'a_lowpass_on_yaw_only_yaw'],
  [startsWith('simplified_'), 'one_of_betaflight_s_own_simplified'],

  [exact('rates_type'), 'which_rates_curve_shape_the_sticks'],
  [endsWith('_srate', '_rc_rate', '_expo'), 'part_of_the_rates_curve_how'],

  [exact('angle_limit'), 'how_far_angle_mode_will_let'],
  [startsWith('level_'), 'how_hard_angle_and_horizon_pull'],
  [startsWith('horizon_'), 'shapes_horizon_mode_which_is_angle'],

  [exact('motor_output_limit'), 'a_cap_on_how_much_of'],
  [exact('motor_poles'), 'the_magnet_count_on_the_motors'],
  [startsWith('mixer_type', 'thrust_linear'), 'how_the_mixer_turns_the_controller'],
  [exact('idle_min_rpm', 'dshot_idle_value'), 'how_hard_the_motors_idle_enough'],
].map(([matches, note]) => [matches, str(`keynotes.${note}`)]);

const noteFor = (key) => NOTES.find(([matches]) => matches(String(key)))?.[1];

// The note for a key with no sentence: whether it is a named choice or a
// number in a known range, and that nothing more has been written.
export function genericNote(field) {
  const parts = [];
  if (field.lookup) {
    parts.push(str('keynotes.a_named_choice_from_betaflight_s'));
  } else if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    const units = field.units ? ` ${field.units}` : '';
    parts.push(str('keynotes.a_number_from_to', { min: field.min, max: field.max, v3: units }));
  }
  parts.push(str('keynotes.no_plain_english_note_has_been'));
  return parts.join(' ');
}

export function keyNote(field) {
  if (!field || !field.key) return '';
  return noteFor(field.key) ?? genericNote(field);
}

// Whether a key has a written sentence rather than the fallback.
export function hasKeyNote(key) {
  return noteFor(key || '') !== undefined;
}
