/*
 * padprofiles.js: which known device a joystick is, from what it reports.
 *
 * One row per device the simulator recognises. A row that is `vouched`
 * names a layout the device is known to send, so its map is trusted and
 * the guess warnings stay off; a row that is not only names the device,
 * and the pilot flies the AETR guess until a calibration. Rows are tried
 * in order and the W3C standard layout comes first, because a browser that
 * remapped a pad to it has already said where every stick is.
 *
 * Every id here has its source in the comment beside it. None is guessed, because a wrong row flies a pilot on the wrong sticks.
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

/* Chromium: "<name> (<STANDARD GAMEPAD >Vendor: 1209 Product: 4f54)",
 * device/gamepad/gamepad_data_fetcher.cc. Firefox on Linux:
 * "1209-4f54-<name>", dom/gamepad/linux/LinuxGamepad.cpp. Both print the
 * ids as four lower case hex digits. */
const CHROMIUM_ID = /^(.*) \(.*?Vendor: ([0-9a-f]{4}) Product: ([0-9a-f]{4})\)$/;
const FIREFOX_ID = /^([0-9a-f]{4})-([0-9a-f]{4})-(.*)$/;

/* The name and USB ids in a Gamepad.id; ids null when it carries none. */
export function parsePadId(id) {
  const text = typeof id === 'string' ? id : '';
  const chromium = CHROMIUM_ID.exec(text);
  if (chromium) {
    return { name: chromium[1], vendor: chromium[2], product: chromium[3] };
  }
  const firefox = FIREFOX_ID.exec(text);
  if (firefox) {
    return { name: firefox[3], vendor: firefox[1], product: firefox[2] };
  }
  return { name: text, vendor: null, product: null };
}

export const PAD_PROFILES = [
  { key: 'standard', vouched: true, match: { standard: true } },
  /* ExpressLRS 3.3 to 3.6 as a Bluetooth joystick: the name is set in
   * src/lib/BLE/devBLE.cpp; its axis order was measured on a RadioMaster
   * Pocket (padmap.js). ExpressLRS 4.0 renamed it "ELRS Joystick" and its
   * BLE library changed the order of setAxes, so 4.x is not this row. */
  { key: 'elrs-bluetooth', vouched: true, match: { name: /^ExpressLRS Joystick/, minAxes: 5 } },
  /* EdgeTX (and OpenTX) in USB joystick mode: pid.codes vendor 1209,
   * product 4f54, radio/src/targets/common/arm/stm32/usbd_desc.c. Its axes
   * follow the radio's own channel order, so the id vouches for nothing. */
  { key: 'edgetx-usb', vouched: false, match: { vendor: '1209', product: '4f54' } },
];

const GUESS = { key: 'aetr', vouched: false };

function fits(match, gp, parsed) {
  if (match.standard) {
    return gp.mapping === 'standard';
  }
  if (match.name && !match.name.test(parsed.name)) {
    return false;
  }
  if (match.vendor && (match.vendor !== parsed.vendor || match.product !== parsed.product)) {
    return false;
  }
  return !match.minAxes || gp.axes.length >= match.minAxes;
}

/* The first row the device fits, or the AETR guess. */
export function profileFor(gp) {
  if (!gp) {
    return GUESS;
  }
  const parsed = parsePadId(gp.id);
  return PAD_PROFILES.find((row) => fits(row.match, gp, parsed)) || GUESS;
}
