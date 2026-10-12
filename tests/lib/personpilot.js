/*
 * personpilot.js: the person paced pilot's limits, one copy for every
 * probe, figure script and gate that flies like a person
 * (docs/FLIGHTMODEL.md "A hover a person can fly"). A person sees the
 * aircraft 0.2 s late (the effective delay of a trained operator in
 * compensatory tracking, McRuer and Jex, "A Review of Quasi-Linear Pilot
 * Models", IEEE Trans. HFE 8(3), 1967), moves the sticks at a hand's
 * pace and in fiftieths of their travel, and flies by what is visible
 * from the ground. What the person does with what they see (the law) is
 * the caller's: these are the eyes and the hand it is flown through.
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

/* delayMs and steps as above; everyMs, the hand's pace, ten looks a
 * second. pmRad and outer are the crossover's (wingpilot.js, THE PERSON
 * PILOT): the 45 deg phase margin of the bandwidth criterion and the
 * quarter an outer loop crosses below the loop inside it. */
export const PERSON = { delayMs: 200, everyMs: 100, steps: 50, pmRad: Math.PI / 4, outer: 0.25 };

export const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));

/* A stick moved in fiftieths of its travel, never past its stops. */
export const quant = (x) => clamp(Math.round(x * PERSON.steps) / PERSON.steps);

/*
 * The person's eyes on a flight stepped every stepMs: push what is there
 * each step; looks(ms, back) is true on the hand's beat once the eyes
 * have seen delayMs and back steps more; ago(back) is what the person
 * sees now (delayMs old), or back steps before it, for a rate read off
 * two looks. Until then the sticks stay where the flight put them.
 * ms is the time of the last push, from 0; the delay is rounded to whole
 * steps, and a beat that is not one would never come.
 */
export function eyes({ stepMs, delayMs = PERSON.delayMs, everyMs = PERSON.everyMs }) {
  if (!(stepMs > 0) || everyMs % stepMs !== 0) throw new Error(`eyes: the hand's ${everyMs} ms is not whole steps of ${stepMs} ms`);
  const lag = Math.round(delayMs / stepMs);
  const seen = [];
  return {
    lag,
    push(o) {
      seen.push(o);
    },
    looks(ms, back = 0) {
      return seen.length > lag + back && ms % everyMs === 0;
    },
    ago(back = 0) {
      return seen[seen.length - 1 - lag - back];
    },
  };
}
