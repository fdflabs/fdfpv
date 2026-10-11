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
/* 2 since the Night Timber X: `factory`, a family's own lights' switch.
 * A v1 entry has no `factory` and reads as `auto`, so it migrates by
 * taking the new number. */
export const LIGHTS_VERSION = 2;
/* The families with lights built in at the factory, which the lights'
 * `factory` switch sets to auto (on at night), on or off
 * (docs/NIGHTTIMBER-STAGE1.md section 5). */
export const FACTORY_LIGHTS = new Set(['nighttimber1200']);
export const FACTORY_MODES = ['auto', 'on', 'off'];

const slot = (id, ...options) => ({ id, options: ['stock', ...options] });

/*
 * The planes, each its own list (docs/KITS.md section 3): a slot only
 * where the airframe has the part, an option only where it draws
 * differently from stock inside the stock model's box. A canopy that is a
 * paint region already (the Radian's, the F-16's) has no tint slot, since
 * the Paint page colours it.
 */
const CUB = [slot('spinner', 'bullet', 'flat'), slot('wheels', 'tundra')];
/* The Timber stands on tundra tyres already. */
const TIMBER = [slot('spinner', 'bullet', 'flat'), slot('canopy', 'smoke', 'gold')];
const KADET = [slot('spinner', 'bullet', 'flat'), slot('wheels', 'pants'), slot('canopy', 'smoke', 'gold')];
const SLOWSTICK = [slot('spinner', 'bullet'), slot('wheels', 'tundra')];
const UGLYSTIK = [slot('spinner', 'bullet'), slot('wheels', 'pants')];
/* The Skyhunter is a pusher on booms: no wheels, no cabin glass, its
 * fins a pair on the booms. */
const SKY = [slot('spinner', 'bullet'), slot('wingtips', 'winglet')];
/* The Extra's spats are stock, so no wheels slot; side force generators
 * are the aerobatic tip it is known for. */
const EXTRA = [slot('spinner', 'bullet', 'striped'), slot('canopy', 'smoke', 'gold'), slot('wingtips', 'sfg')];
const P51 = [
  slot('spinner', 'twotone', 'striped'),
  slot('exhausts', 'dampers'),
  slot('wheels', 'covered'),
  slot('canopy', 'smoke'),
];
/* The Tiger Moth's cockpits are open, so no canopy slot. */
const TIGERMOTH = [
  slot('spinner', 'twotone', 'striped'),
  slot('exhausts', 'stacks'),
  slot('wheels', 'covered'),
];
/* The Bombshell's Cox spinner nut is too small to band, and its glow
 * engine has no exhaust stacks to change. */
const BOMBSHELL = [slot('spinner', 'bullet'), slot('wheels', 'covered'), slot('canopy', 'smoke')];
/* The F-16's canopy is already gold tinted and a paint region of its own,
 * so a tint slot would only repeat the Paint page. */
const JET = [slot('nose', 'radome'), slot('fincap', 'chute'), slot('exhaust', 'titanium')];
/* The Radian's canopy is a paint region, so no tint slot; the NRJ is a
 * throw glider with no canopy and no tips a winglet belongs on. */
const RADIAN = [slot('nose', 'pointed'), slot('wingtips', 'winglet')];
const NRJ = [slot('nose', 'pointed')];
/* The Zagi's winglets already set its height and its aftmost point, so a
 * taller one would grow the box the referee meets: raked and split keep
 * the stock outline's corners instead. */
const ZAGI = [slot('winglets', 'raked', 'split'), slot('nose', 'bubble')];
/* The Bramor's nose is its gimbal ball, the box's front, so no bubble. */
const BRAMOR = [slot('winglets', 'raked', 'split')];
const QUAD = [
  slot('arms', 'cutout', 'blade', 'tapered'),
  slot('top', 'vented', 'armoured'),
  slot('mount', 'cage', 'plates'),
  slot('antenna', 'dualt', 'pagoda'),
];
/* The interceptor's camera sits in its armoured nose, so no mount slot. */
const ARMOURED_QUAD = QUAD.filter((s) => s.id !== 'mount');
const STRIKER = [slot('nose', 'dome'), slot('fins', 'swept')];

/* By livery key (configs/liveries.js liveryKey), so a float variant wears
 * its plane's kit. */
export const KITS = {
  sky1800: SKY, cub1400: CUB, kadet1981: KADET, slowstick1180: SLOWSTICK,
  uglystik1567: UGLYSTIK, timber1500: TIMBER,
  extra3d1308: EXTRA,
  nighttimber1200: [],
  p51d1450: P51, tigermoth1803: TIGERMOTH, bombshell1118: BOMBSHELL,
  f16878: JET,
  radian2000: RADIAN, nrj1490: NRJ,
  zagi1219: ZAGI, bramor2300: BRAMOR,
  '7inch': QUAD, '10inch': QUAD, interceptor: ARMOURED_QUAD,
  striker2500: STRIKER,
};

/* The families whose builders draw their kit so far (docs/KITS.md section
 * 8); the hangar offers the Kit tab on these only. */
export const DRAWN = new Set(['7inch', '10inch', 'interceptor', 'striker2500', 'f16878',
  'radian2000', 'nrj1490', 'zagi1219', 'bramor2300',
  'p51d1450', 'tigermoth1803', 'bombshell1118',
  'sky1800', 'cub1400', 'kadet1981', 'slowstick1180', 'uglystik1567', 'timber1500', 'extra3d1308']);

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
    return { led: false, nav: false, glow: false, factory: false };
  }
  const quad = QUADS.has(family);
  return { led: quad, nav: !quad, glow: quad || family === 'f16878', factory: FACTORY_LIGHTS.has(family) };
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
  /* auto is the default, so it is not kept: absent means auto. */
  if (lights.factory !== undefined) {
    if (!has.factory || !FACTORY_MODES.includes(lights.factory)) {
      dropped += 1;
    } else if (lights.factory !== 'auto') {
      out.factory = lights.factory;
    }
  }
  for (const key of Object.keys(lights)) {
    if (!['v', 'led', 'pattern', 'nav', 'strobe', 'glow', 'glowPattern', 'factory'].includes(key)) {
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

/* The entry with one slot set; all stock leaves no kit at all. Here, not
 * in src/ui/hangar-kit.js, because hangar-shop.js needs it too: taking it
 * from hangar-kit.js made the two modules a cycle, which ran the Kit tab's
 * registration before the Shop's and the Loadout's and put Kit first. */
export function withSlot(entry, family, slot, option) {
  const parts = { ...kitParts(family, entry.kit), [slot]: option };
  const fitted = Object.fromEntries(Object.entries(parts).filter(([, o]) => o !== 'stock'));
  const out = { ...entry };
  delete out.kit;
  if (Object.keys(fitted).length) {
    out.kit = { v: KIT_VERSION, parts: fitted };
  }
  return out;
}
