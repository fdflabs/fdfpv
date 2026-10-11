/*
 * light.js: Itaipu's sun and the light every material is passed through.
 *
 * THE SUN IS THE PHOTOGRAPH'S. The colour under the ground is Sentinel-2's
 * pass of 20 December 2025 at 10:49 local (docs/ITAIPU-PLAN.md section 8):
 * azimuth 90.1 degrees, elevation 65.8. The shadows baked into it fall
 * west, so the renderer's sun stands where the satellite's stood and its
 * shadows fall the same way instead of fighting them. Never retuned.
 *
 * THE INJECTION is the asset library's (src/render/library/lit.js).
 *
 * THE KEY AND THE FILL. Round 1 lit Itaipu with swiss2's photographed
 * Alpine sky, nearly as strong a light as the sun, and every view was
 * overcast: the ground's darkest twentieth at lightness 0.24 where the
 * photographs' is at 0.12 (tools/swiss2-loop/colour.py). The sky is now
 * a clear tropical one (sky.js), and its light on the level is about a
 * fifth of the sun's, as a clear sky's is at this height of sun, so a
 * shadow is two and a half stops under the sunlit ground and blue with
 * the sky it is lit by. The sun is the valley's irradiance, a little
 * warmer: at 65.8 degrees there is little air in the way, and the
 * photographs' sunlit concrete and red earth are warm against the shade.
 *
 * NIGHT (mission 4, "Night raid", docs/ITAIPU-PLAN.md's day stays the
 * default everywhere else): the same directional light stands in the
 * same place, now the moon's, cut to a sliver of the sun's irradiance
 * and cooled toward the sky's own blue, so the dam still reads as a
 * solid shape under it rather than going flat. A dim hemisphere light is
 * the sky's own fill, low enough that the scene depends on the lamps and
 * the windows (look/night.js) to be readable at all, which is the point:
 * a defended dam at night is dark except where it chooses to show a
 * light. Never on by default; look/index.js picks it only when the map
 * is built with `time: 'night'`.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

export const SUN_AZIMUTH_DEG = 90.1;
export const SUN_ELEVATION_DEG = 65.8;

export const SUN_COLOR = new THREE.Color(1.0, 0.93, 0.82);
export const SUN_IRRADIANCE = 3.51;
/* The post chain's base exposure (swiss2/post.js AIR.exposure), before
 * the meter. The valley's 1.45 left the views light under the clear sky:
 * the ground's median lightness 0.51 over eight of the loop's views, the
 * photographs' 0.41 over all of them. At 1.15 it is 0.40 over all 22. */
export const EXPOSURE = 1.15;
/* The meter's target by day (swiss2/post.js air.meterKey; the valley's
 * KEY is 0.09). With the sun counted once on High (THE CASCADES ARE ONE
 * SUN, below) the eight views matched to photographs in round 4 fell from
 * mean lightness 0.47 to 0.43 against the photographs' 0.50. Raising the
 * base exposure instead also raised the floor of the meter's range, where
 * a frame full of sky sits, and war:boom's striker looking up at the
 * cumulus came out at middle third lightness 236 (main's 178), too bright
 * for its fireball to show. The key moves only the frames the meter
 * reaches (a frame of sky is at the floor whatever the key: war:boom's
 * striker read 208 at a key of 0.128 and of 0.1). 0.125 is about the
 * base's 1.5 / 1.15 through the meter's 0.75 adaptation. */
export const METER_KEY = 0.125;

/* The moon, standing where the sun does (sunDirection is shared: a
 * single shadow map serves either), cool and faint: 1.5% of the sun's
 * irradiance, a clear moonlit night's against a clear noon's. The scene's
 * own light past that is the lamps (look/night.js), not this. */
export const NIGHT_SUN_COLOR = new THREE.Color(0.63, 0.71, 0.88);
export const NIGHT_SUN_IRRADIANCE = SUN_IRRADIANCE * 0.015;
/* The meter still runs at night, but toward its own dark target
 * (NIGHT_METER_KEY, swiss2/post.js air.meterKey) rather than the day's
 * KEY: a night sky metered up to a hazy day's average is not night. This
 * is the base it corrects from, close to the day's; the darkness is
 * NIGHT_METER_KEY's job, not this one's. */
export const NIGHT_EXPOSURE = 1.3;
/* A little under a fifth of the day's KEY (swiss2/post.js), about 2.3
 * stops under: dark enough to read as night, bright enough that the
 * dam, the water and a drone are still there to see (the mission's own
 * requirement), the rest of the reading done by the lamps and the
 * windows (look/night.js) against it. */
export const NIGHT_METER_KEY = 0.02;

/* The sky's own fill at night (a HemisphereLight: its sky and ground
 * colour), low enough it never competes with a lamp. */
export const NIGHT_AMBIENT_SKY = new THREE.Color(0.05, 0.08, 0.14);
export const NIGHT_AMBIENT_GROUND = new THREE.Color(0.02, 0.02, 0.03);
export const NIGHT_AMBIENT_INTENSITY = 0.5;

/*
 * THE TIMES OF DAY (round 4): 'day', the default and the satellite's sun
 * above, and three more a map can be built at, each the sun of a late
 * December day at the dam (25.4 S, 54.6 W, the season of the imagery):
 *
 *   morning   about 08:00, the sun 28 degrees up in the east south east,
 *             a little warm; the humid morning's air is thicker (sky.js)
 *   noon      solar noon, the sun 87 degrees up, just south of the
 *             zenith, its whitest and strongest
 *   golden    an hour before sunset, 8 degrees up in the west south west,
 *             orange through the long air and weaker; its colour and
 *             strength are scripts/loading-art.js's sunset's, a little
 *             higher and less red
 *   night     mission 4's moon, standing where the day's sun does
 *
 * Only 'day' agrees with the shadows the satellite's colour has baked in
 * (THE SUN IS THE PHOTOGRAPH'S, above): at the others the ground's own
 * baked shade still falls west, faint at its 10 m. They are for a pilot
 * who asks for them (?time= in the address, src/main.js), never the
 * default.
 */
export const TIMES = {
  day: {
    azimuth: SUN_AZIMUTH_DEG, elevation: SUN_ELEVATION_DEG, color: SUN_COLOR, irradiance: SUN_IRRADIANCE,
  },
  morning: {
    azimuth: 106, elevation: 28, color: new THREE.Color(1.0, 0.86, 0.7), irradiance: 2.9,
  },
  noon: {
    azimuth: 180, elevation: 87, color: new THREE.Color(1.0, 0.95, 0.87), irradiance: 3.65,
  },
  golden: {
    azimuth: 248, elevation: 8, color: new THREE.Color(1.0, 0.58, 0.28), irradiance: 3.2,
  },
  night: {
    azimuth: SUN_AZIMUTH_DEG, elevation: SUN_ELEVATION_DEG, color: NIGHT_SUN_COLOR, irradiance: NIGHT_SUN_IRRADIANCE,
  },
};

/* The look's chosen time, one of TIMES's names; null or undefined is
 * 'day'. Anything else is a caller's mistake. */
export function timeOf(time) {
  if (time == null) {
    return 'day';
  }
  if (!Object.hasOwn(TIMES, time)) {
    throw new Error(`itaipu light: time is one of ${Object.keys(TIMES).join(', ')}, got ${JSON.stringify(time)}`);
  }
  return time;
}

export function isNight(time) {
  return timeOf(time) === 'night';
}

/* Toward the sun (or the moon, at night) at the time picked, azimuth
 * clockwise from north, north -z. With no time, the day's: the water's
 * spray and the trees' impostors read it so. */
export function sunDirection(time) {
  const { azimuth, elevation } = TIMES[timeOf(time)];
  const e = THREE.MathUtils.degToRad(elevation);
  const a = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
}

/* The directional light's colour and irradiance for the time picked. */
export function sunFor(time) {
  const { color, irradiance } = TIMES[timeOf(time)];
  return { color, irradiance };
}

/* The sky's low fill at night, or null: added to the scene only then,
 * and only once (look/index.js owns it, for dispose). */
export function makeNightAmbient() {
  return new THREE.HemisphereLight(NIGHT_AMBIENT_SKY, NIGHT_AMBIENT_GROUND, NIGHT_AMBIENT_INTENSITY);
}
