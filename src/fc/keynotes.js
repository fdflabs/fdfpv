import { str } from '../strings/index.js';
/*
 * keynotes.js: what a firmware key DOES, in a sentence a pilot can act on.
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

/*
 * WHY THIS EXISTS.
 *
 * fieldNote() ended in `return field.key`, so the help column beside 115
 * typed rows on the firmware bench read the key name back at the pilot who
 * had just moved the cursor onto a row labelled with that key name. The one
 * column in this product that everybody praises, the plain-English
 * explanation beside the row, said "p_roll" next to p_roll.
 *
 * The catalog carries no descriptions: it is generated from Betaflight's own
 * settings table, which has a type, a range and a parameter group and no
 * prose at all. So the prose has to live somewhere, and it lives here rather
 * than in the generator, because the generator's output is regenerated from
 * vendored source and a hand-written sentence would be wiped by the next
 * `npm run gen:catalog`.
 *
 * TWO RULES, and the second one is the important one.
 *
 * A sentence says the CONSEQUENCE, not the expansion. "How hard it corrects
 * the error it can see right now" rather than "proportional gain": a pilot
 * who already knows what P stands for does not need the row, and one who
 * does not is no better off being told.
 *
 * And nothing here claims a meaning it cannot back. Where there is no
 * hand-written sentence the fallback states only what the catalog actually
 * knows, the units and the range and the tab, which is duller than an
 * invented explanation and is the reason to prefer it. A wrong sentence
 * about a filter cutoff costs a pilot an evening.
 *
 * Matched in order, first hit wins, so a specific key can sit above its
 * family.
 */
const NOTES = [
  /* ---- PID, per axis ------------------------------------------------ */
  [/^p_(roll|pitch|yaw)$/, str('keynotes.how_hard_the_controller_corrects_the')],
  [/^i_(roll|pitch|yaw)$/, str('keynotes.how_hard_it_corrects_error_that')],
  [/^d_(roll|pitch|yaw)$/, str('keynotes.damping_ceiling_resists_fast_movement_which')],
  [/^d_min_(roll|pitch|yaw)$/, str('keynotes.damping_floor_where_d_sits_while')],
  [/^f_(roll|pitch|yaw)$/, str('keynotes.feedforward_pushes_on_stick_movement_before')],
  [/^d_min_advance$/, str('keynotes.how_eagerly_d_climbs_from_its')],
  [/^d_min_boost_gain$/, str('keynotes.how_much_of_the_gap_between')],

  /* ---- Iterm -------------------------------------------------------- */
  [/^iterm_relax$/, str('keynotes.which_axes_stop_accumulating_i_while')],
  [/^iterm_relax_type$/, str('keynotes.whether_relax_watches_the_gyro_or')],
  [/^iterm_relax_cutoff$/, str('keynotes.how_quick_a_stick_movement_counts')],
  [/^iterm_windup$/, str('keynotes.the_motor_saturation_point_past_which')],
  [/^iterm_limit$/, str('keynotes.a_hard_ceiling_on_how_much')],
  [/^iterm_rotation$/, str('keynotes.rotates_accumulated_i_with_the_craft')],

  /* ---- Anti gravity -------------------------------------------------- */
  [/^anti_gravity_gain$/, str('keynotes.how_much_extra_i_is_thrown')],
  [/^anti_gravity_(cutoff_hz|p_gain)$/, str('keynotes.shapes_how_anti_gravity_reacts_to')],

  /* ---- TPA and throttle ---------------------------------------------- */
  [/^tpa_rate$/, str('keynotes.how_much_pid_gain_is_taken')],
  [/^tpa_breakpoint$/, str('keynotes.the_throttle_position_where_that_reduction')],
  [/^tpa_mode$/, str('keynotes.whether_tpa_reduces_d_only_or')],
  [/^throttle_boost/, str('keynotes.a_short_kick_of_extra_throttle')],
  [/^thr_mid$/, str('keynotes.where_the_middle_of_the_throttle')],
  [/^thr_expo$/, str('keynotes.softens_the_throttle_around_the_middle')],
  [/^throttle_limit_(type|percent)$/, str('keynotes.caps_the_throttle_output_either_by')],

  /* ---- Feedforward ---------------------------------------------------- */
  [/^feedforward_transition$/, str('keynotes.fades_feedforward_in_away_from_centre')],
  [/^feedforward_smooth_factor$/, str('keynotes.smooths_the_feedforward_signal_more_is')],
  [/^feedforward_jitter_factor$/, str('keynotes.ignores_the_small_stick_jitter_a')],
  [/^feedforward_boost$/, str('keynotes.extra_push_on_the_sharpest_part')],
  [/^feedforward_max_rate_limit$/, str('keynotes.stops_feedforward_asking_for_more_rotation')],
  [/^feedforward_averaging$/, str('keynotes.averages_feedforward_over_a_number_of')],

  /* ---- Filters -------------------------------------------------------- */
  [/^gyro_lpf1_dyn_(min|max)_hz$/, str('keynotes.the_ends_of_the_dynamic_gyro')],
  [/^gyro_lpf1_(type|static_hz)$/, str('keynotes.the_first_gyro_lowpass_lower_is')],
  [/^gyro_lpf2_/, str('keynotes.the_second_gyro_lowpass_sitting_after')],
  [/^dterm_lpf1_dyn_(min|max)_hz$/, str('keynotes.the_ends_of_the_dynamic_d')],
  [/^dterm_lpf1_/, str('keynotes.the_first_d_term_lowpass_lowering')],
  [/^dterm_lpf2_/, str('keynotes.the_second_d_term_lowpass_after')],
  [/^dterm_notch_/, str('keynotes.a_narrow_notch_in_the_d')],
  [/^dyn_notch_count$/, str('keynotes.how_many_moving_notches_hunt_for')],
  [/^dyn_notch_q$/, str('keynotes.how_narrow_each_moving_notch_is')],
  [/^dyn_notch_(min|max)_hz$/, str('keynotes.the_band_the_moving_notches_are')],
  [/^rpm_filter_harmonics$/, str('keynotes.how_many_multiples_of_the_motor')],
  [/^rpm_filter_q$/, str('keynotes.how_narrow_the_rpm_notches_are')],
  [/^rpm_filter_(min_hz|fade_range_hz|lpf_hz|weights)/, str('keynotes.shapes_the_rpm_notch_filter_where')],
  [/^yaw_lowpass_hz$/, str('keynotes.a_lowpass_on_yaw_only_yaw')],
  [/^simplified_/, str('keynotes.one_of_betaflight_s_own_simplified')],

  /* ---- Rates ---------------------------------------------------------- */
  [/^rates_type$/, str('keynotes.which_rates_curve_shape_the_sticks')],
  [/_srate$|_rc_rate$|_expo$/, str('keynotes.part_of_the_rates_curve_how')],

  /* ---- Angle and horizon ---------------------------------------------- */
  [/^angle_limit$/, str('keynotes.how_far_angle_mode_will_let')],
  [/^level_/, str('keynotes.how_hard_angle_and_horizon_pull')],
  [/^horizon_/, str('keynotes.shapes_horizon_mode_which_is_angle')],

  /* ---- Airmode and motors --------------------------------------------- */
  [/^motor_output_limit$/, str('keynotes.a_cap_on_how_much_of')],
  [/^motor_poles$/, str('keynotes.the_magnet_count_on_the_motors')],
  [/^(mixer_type|thrust_linear)/, str('keynotes.how_the_mixer_turns_the_controller')],
  [/^idle_min_rpm$|^dshot_idle_value$/, str('keynotes.how_hard_the_motors_idle_enough')],
];

/*
 * The fallback. Only what the catalog actually knows, which is duller than an
 * invented explanation and is exactly why it is preferred. See the rules
 * above.
 */
export function genericNote(field) {
  const bits = [];
  if (field.lookup) {
    bits.push(str('keynotes.a_named_choice_from_betaflight_s'));
  } else if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    bits.push(str('keynotes.a_number_from_to', { min: field.min, max: field.max, v3: field.units ? ` ${field.units}` : '' }));
  }
  bits.push(str('keynotes.no_plain_english_note_has_been'));
  return bits.join(' ');
}

export function keyNote(field) {
  if (!field || !field.key) {
    return '';
  }
  for (const [re, note] of NOTES) {
    if (re.test(field.key)) {
      return note;
    }
  }
  return genericNote(field);
}

/* How many of the catalog's keys have a written sentence, for the lint that
 * keeps this file honest as the catalog grows. */
export function hasKeyNote(key) {
  return NOTES.some(([re]) => re.test(String(key || '')));
}
