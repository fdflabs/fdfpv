/*
 * controller.js: the Controller screen under the Hangar, the one place a
 * pilot sets up what they fly with (redesign phase 7, PLAN section 2.6).
 * It gathers what Settings and the Hangar's cards held apart: which
 * device flies, what the profile library recognised it as and its
 * built-in layout, the calibration wizard and its check, the stick mode,
 * the device's dead zone and (on a gamepad) expo, the rates, the keys and
 * buttons, and mouse flight.
 *
 * The feel rows reach the input through ui.onController, which main.js
 * installs: the dead zone and expo are kept per device beside its
 * calibration (src/input/stickstore.js), not in the settings.
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
import { webSerialAvailable } from '../input/djiremote.js';
import { MOUSE_CENTRES, MOUSE_EXPOS, MOUSE_SENS } from '../input/input.js';
import { DEAD_ZONES, NO_FEEL, PAD_EXPOS } from '../input/padmap.js';
import { STICK_MODES, normaliseStickMode } from '../input/stickmode.js';
import { str } from '../strings/index.js';
import { choice, toggle } from './rows.js';

/* The input's answer to a change, through main.js. */
function tell(ui, change) {
  if (ui.onController) {
    ui.onController(change);
  }
}

function padChooseNote(info) {
  const n = info && typeof info.count === 'number' ? info.count : 0;
  if (n <= 0) {
    return str('ui.plug_in_a_radio_in_joystick');
  }
  return n === 1 ? str('ui.one_device_is_plugged_in_open', { using: info.using }) : str('ui.devices_are_plugged_in_move_the', { n });
}

/* The device in use as the pilot reads it. 'Keyboard' is the pad picker's
 * own sentinel, shown in the pilot's language. */
export function usingLabel(info) {
  return info && info.using && info.using !== 'Keyboard' ? info.using : str('ui.keyboard');
}

/* What the Controller screen's device rows are drawn from: when it
 * changes (a device plugged in or pulled out, another picked, a
 * calibration saved or dropped) the open screen is drawn again. */
export function controllerKey(info) {
  return info ? [info.using, info.count, info.device, info.profile, info.calibrated].join('|') : '';
}

/* What src/input/padprofiles.js recognised, and the built-in layout it
 * stands for: the device's preset. */
function deviceRows(info) {
  const profile = info && info.profile;
  /* String keys spell a profile's hyphen as an underscore. */
  const key = `controller.profile_${(profile || 'none').replace(/-/g, '_')}`;
  const recognised = { label: str('controller.recognised'), value: str(key), note: str(`${key}_note`), info: true };
  if (!profile) {
    return [recognised];
  }
  return [recognised, {
    label: str('controller.builtin'),
    value: str(info.calibrated ? 'controller.builtin_use' : 'controller.builtin_in_use'),
    note: str('controller.builtin_note'),
    action: 'controller-builtin',
    disabled: !info.calibrated,
  }];
}

/* A DJI remote is not a joystick the browser lists by itself: it is
 * connected here, over Web Serial (src/input/djiremote.js). A browser
 * without Web Serial shows the row greyed with the reason. */
function djiRow() {
  const can = webSerialAvailable();
  return {
    label: str('controller.connect_dji'),
    action: 'connect-dji',
    note: str(can ? 'controller.connect_dji_note' : 'controller.connect_dji_unsupported'),
    disabled: !can,
  };
}

/* The device's dead zone, and its expo on a gamepad: a radio shapes its
 * own sticks with its own expo. */
function feelRows(ui, info) {
  if (!info || !info.device) {
    return [];
  }
  const feel = info.feel || NO_FEEL;
  const rows = [
    { label: str('controller.feel'), section: true },
    choice(str('controller.dead_zone'), str('controller.dead_zone_note'), DEAD_ZONES, feel.deadZone,
      (n) => (n === 0 ? str('controller.off') : `${n}%`), (n) => tell(ui, { deadZone: n })),
  ];
  if (info.device === 'gamepad') {
    rows.push(choice(str('controller.expo'), str('controller.expo_note'), PAD_EXPOS, feel.expo,
      (n) => (n === 0 ? str('controller.off') : `${n}%`), (n) => tell(ui, { expo: n })));
  }
  return rows;
}

function mouseRows(s) {
  const flight = toggle(str('ui.mouse_flight'), str('ui.mouse_flight_note'), s.mouseFlight, (v) => { s.mouseFlight = Boolean(v); });
  if (!s.mouseFlight) {
    return [flight];
  }
  return [
    flight,
    choice(str('ui.mouse_sensitivity'), str('ui.mouse_sensitivity_note'), MOUSE_SENS, s.mouseSens, (n) => `${n}%`, (n) => { s.mouseSens = n; }),
    choice(str('ui.mouse_expo'), str('ui.mouse_expo_note'), MOUSE_EXPOS, s.mouseExpo, (n) => `${n}%`, (n) => { s.mouseExpo = n; }),
    toggle(str('ui.mouse_invert'), str('ui.mouse_invert_note'), s.mouseInvert, (v) => { s.mouseInvert = Boolean(v); }),
    choice(str('ui.mouse_centre'), str('ui.mouse_centre_note'), MOUSE_CENTRES, s.mouseCentre, (id) => str(`ui.mouse_centre_${id}`), (id) => { s.mouseCentre = id; }),
  ];
}

/* The Betaflight rates are the seated aircraft class's (src/ui/settings.js
 * swapClassRates); a plane with throws from its manual has its own, and
 * the same row opens them. One section id either way, so the cursor's
 * memory of it holds. */
function ratesRows(s, rates) {
  const section = { id: 'controller:s-rates', section: true };
  if (rates.action !== 'rates') {
    return [{ ...section, label: str('controller.flying_this') }, rates];
  }
  const kind = str(`controller.kind_${airframeById(s.airframe).class}`);
  return [
    { ...section, label: str('controller.flying', { kind }) },
    { ...rates, note: str('controller.rates_note', { kind }) + rates.note },
  ];
}

/* `rates`: the seated aircraft's Rates row (items.js ratesRow). */
export function controllerRows(ui, s, rates) {
  const info = ui.padInfo;
  return [
    { label: str('controller.device'), section: true },
    { label: str('ui.choose_joystick'), value: usingLabel(info), action: 'choosepad', note: padChooseNote(info) },
    djiRow(),
    ...deviceRows(info),
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
    ...feelRows(ui, info),
    ...ratesRows(s, rates),
    { label: str('controller.keys_mouse'), section: true },
    { label: str('keybinds.title'), action: 'controls', note: str('keybinds.open_note') },
    ...mouseRows(s),
    { label: str('ui.back'), action: 'back' },
  ];
}
