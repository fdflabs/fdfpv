/*
 * crash-scenarios.js: the plant tests' crash scenarios, each a set up, a
 * run and its checks, for scripts/crash-core-selftest.js. The damage modes'
 * scenarios land with the damage model; the table checks run without them.
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

export const CRASH_SCENARIOS = [];

export async function runScenario() {
  return { checks: [] };
}
