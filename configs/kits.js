/*
 * kits.js: the visual part kits and lights each aircraft family can wear,
 * and the two livery entry keys that store them (docs/KITS.md section 6).
 *
 * A KIT IS PIXELS. Nothing here has grams, drag or a box: this file is
 * imported by configs/liveries.js (to check an entry) and by the renderer,
 * never by the plant, the referee or the journal; scripts/kits-selftest.js
 * walks the physics path's imports to hold that.
 *
 * Every slot's first option is 'stock', what the builder draws today; a
 * slot left out of an entry is stock, so an entry without `kit` is the
 * aircraft exactly as it was.
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

export const KIT_VERSION = 1;
export const LIGHTS_VERSION = 1;

const slot = (id, ...options) => ({ id, options: ['stock', ...options] });

const TRAINER = [
  slot('spinner', 'bullet', 'flat', 'none'),
  slot('wingtips', 'raked', 'drooped', 'winglet'),
  slot('wheels', 'pants', 'tundra'),
  slot('fin', 'swept'),
  slot('canopy', 'smoke', 'gold'),
];
const WARBIRD = [
  slot('spinner', 'twotone', 'striped'),
  slot('exhausts', 'stacks', 'dampers'),
  slot('wheels', 'covered'),
  slot('canopy', 'bubble'),
];
const JET = [slot('nose', 'radome'), slot('fincap', 'chute'), slot('exhaust', 'titanium'), slot('canopy', 'gold')];
const GLIDER = [slot('nose', 'pointed'), slot('wingtips', 'winglet'), slot('canopy', 'smoke')];
const WING = [slot('winglets', 'tall', 'split'), slot('nose', 'bubble')];
const QUAD = [
  slot('arms', 'cutout', 'blade', 'tapered'),
  slot('top', 'vented', 'armoured'),
  slot('mount', 'cage', 'plates'),
  slot('antenna', 'dualt', 'pagoda'),
];
const STRIKER = [slot('nose', 'dome'), slot('fins', 'swept')];

/* By livery key (configs/liveries.js liveryKey), so a float variant wears
 * its plane's kit. */
export const KITS = {
  sky1800: TRAINER, cub1400: TRAINER, kadet1981: TRAINER, slowstick1180: TRAINER,
  uglystik1567: TRAINER, timber1500: TRAINER,
  p51d1450: WARBIRD, tigermoth1803: WARBIRD, bombshell1118: WARBIRD,
  f16878: JET,
  radian2000: GLIDER, nrj1490: GLIDER,
  zagi1219: WING, bramor2300: WING,
  '7inch': QUAD, '10inch': QUAD, interceptor: QUAD,
  striker2500: STRIKER,
};

const QUADS = new Set(['7inch', '10inch', 'interceptor']);
export const LED_PATTERNS = ['solid', 'chase', 'strobe', 'throttle', 'battery'];
export const GLOW_PATTERNS = ['solid', 'breathe'];
const HEX = /^#[0-9a-f]{6}$/;

export function slotsFor(family) {
  return KITS[family] ?? [];
}

/* What lights a family has: arm LEDs on a quad, nav lights and strobes on
 * a plane; underglow on a quad and the F-16. */
export function lightsFor(family) {
  if (!KITS[family]) {
    return { led: false, nav: false, glow: false };
  }
  const quad = QUADS.has(family);
  return { led: quad, nav: !quad, glow: quad || family === 'f16878' };
}

const isRecord = (o) => Boolean(o) && typeof o === 'object' && !Array.isArray(o);

/*
 * entry.kit made safe: { kit, dropped }. A newer `v` than this build knows
 * is kept as it came (the keyed account merge passes it on, a newer
 * computer reads it) and drawn stock by kitParts; a stock option is left
 * out, and null means nothing but stock.
 */
export function checkKit(family, kit) {
  if (kit === undefined) {
    return { kit: null, dropped: 0 };
  }
  if (!isRecord(kit) || !Number.isInteger(kit.v) || kit.v < 1) {
    return { kit: null, dropped: 1 };
  }
  if (kit.v > KIT_VERSION) {
    return { kit, dropped: 0 };
  }
  const slots = slotsFor(family);
  const parts = {};
  let dropped = 0;
  const given = isRecord(kit.parts) ? kit.parts : {};
  if (kit.parts !== undefined && !isRecord(kit.parts)) {
    dropped += 1;
  }
  for (const [id, option] of Object.entries(given)) {
    const s = slots.find((x) => x.id === id);
    if (!s || !s.options.includes(option)) {
      dropped += 1;
    } else if (option !== 'stock') {
      parts[id] = option;
    }
  }
  return { kit: Object.keys(parts).length ? { v: KIT_VERSION, parts } : null, dropped };
}

/* entry.lights made safe, the same way: only the lights this family has. */
export function checkLights(family, lights) {
  if (lights === undefined) {
    return { lights: null, dropped: 0 };
  }
  if (!isRecord(lights) || !Number.isInteger(lights.v) || lights.v < 1) {
    return { lights: null, dropped: 1 };
  }
  if (lights.v > LIGHTS_VERSION) {
    return { lights, dropped: 0 };
  }
  const has = lightsFor(family);
  const out = {};
  let dropped = 0;
  const take = (key, ok) => {
    if (lights[key] === undefined) {
      return;
    }
    if (ok(lights[key])) {
      out[key] = lights[key];
    } else {
      dropped += 1;
    }
  };
  take('led', (v) => has.led && typeof v === 'string' && HEX.test(v));
  take('pattern', (v) => has.led && LED_PATTERNS.includes(v));
  take('nav', (v) => has.nav && typeof v === 'boolean');
  take('strobe', (v) => has.nav && typeof v === 'boolean');
  take('glow', (v) => has.glow && typeof v === 'string' && HEX.test(v));
  take('glowPattern', (v) => has.glow && GLOW_PATTERNS.includes(v));
  for (const key of Object.keys(lights)) {
    if (!['v', 'led', 'pattern', 'nav', 'strobe', 'glow', 'glowPattern'].includes(key)) {
      dropped += 1;
    }
  }
  return { lights: Object.keys(out).length ? { v: LIGHTS_VERSION, ...out } : null, dropped };
}

/* Slot id to option for the renderer: every slot, stock where the entry
 * says nothing or comes from a newer build. */
export function kitParts(family, kit) {
  const parts = kit && kit.v === KIT_VERSION && isRecord(kit.parts) ? kit.parts : {};
  return Object.fromEntries(slotsFor(family).map((s) => [s.id, parts[s.id] ?? 'stock']));
}
