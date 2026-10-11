/*
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
 * surfaces.js: the hangar's control surface tiers, Stock, Sport, 3D and
 * Extreme, per surface (aileron, elevator, rudder), docs/SURFACES-STAGE1.md.
 *
 * A tier moves a surface's hinge line forward on the same wing, stabiliser
 * or fin (a bigger chord fraction cf) and lets it travel further, as a 3D
 * conversion does. The aircraft's planform, and so its stability terms,
 * stay the table's. What it does is physics, scripts/surfaces-derive.js:
 * thin aerofoil flap effectiveness (Glauert) and Roskam's large deflection
 * K' scale the plant's own control terms; Roskam's plain flap drag adds
 * the drag of the deflected surface; the hinge moment sizes the servo,
 * whose mass goes on as an add-on. That script writes
 * configs/surfaces-tiers.js, which the game reads; this file holds what
 * it is derived from.
 *
 * The tiers' geometry is a ladder from the stock aircraft to the reference
 * below in equal steps, never smaller than stock: Sport a third of the
 * way, 3D two thirds, Extreme the reference.
 */

import { SURFACE_TIERS } from './surfaces-tiers.js';

/* sim_wing_set_tiers, src/native/sim_abi.h. */
export const SIM_TIER = { K_A: 0, K_E: 1, K_R: 2, CD_A: 3, CD_E: 4, CD_R: 5 };
export const SIM_TIER_DOUBLES = 6;

export const TIERS = ['stock', 'sport', '3d', 'extreme'];
export const TIER_STEP = [0, 1 / 3, 2 / 3, 1];
export const SURFACE_KEYS = ['a', 'e', 'r'];

/*
 * The reference: the biggest surfaces measured on a real aircraft in this
 * hangar, and Extreme Flight's 3D throws.
 */
export const REFERENCE = {
  cf: { a: 0.43, e: 0.67, r: 0.80 },
  cfSource: 'aileron 0.43 and elevator 0.67: Extreme Flight 67 in CAP 580, scripts/cap580-derive.js; rudder 0.80: the DH.82 Tiger Moth\'s, scripts/tigermoth-derive.js',
  throwDeg: { a: 40, e: 50, r: 50 },
  throwSource: 'Extreme Flight 60 in Edge 540T data sheet: aileron high 38 to 40, elevator 3D 45 to 50, rudder high 45 to 50 deg (docs/EDGE-STAGE1.md); the top of each range, and 50 deg is where Roskam K\'s fit (scripts/extra-derive.js kPrime) still falls',
};

/*
 * Servos, torque at 6.0 V. The lightest one whose torque covers a tier's
 * hinge moment is fitted.
 */
export const SERVOS = {
  hs55: { kg: 0.0080, kgcm: 1.30, source: 'Hitec HS-55: 8.0 g, 1.30 kg-cm at 6.0 V (servodatabase.com/servo/hitec/hs-55; buddyrc.com 8.0 g, 1.1 to 1.3 kg-cm)' },
  hs65mg: { kg: 0.01247, kgcm: 2.2, source: 'Hitec HS-65MG: 12.47 g, 1.8 / 2.2 kg-cm at 4.8 / 6.0 V (Hitec manual, manuals.plus/asin/B000G6F0A8)' },
  d89mw: { kg: 0.025, kgcm: 6.4, source: 'Hitec D89MW: 25.0 g, 74 / 89 / 118 oz-in in Hitec\'s 4.8 / 6.0 / 7.4 V order, 89 oz-in = 6.4 kg-cm at 6.0 V (hitecrcd.com/products/servos/digital)' },
  d645mw: { kg: 0.060, kgcm: 11.3, source: 'Hitec D645MW: 60.0 g, 11.3 kg-cm at 6.0 V (hitecrcd.com/d645mw-32-bit-high-torque-metal-gear-servo)' },
  d950tw: { kg: 0.068, kgcm: 29.0, source: 'Hitec D950TW: 68 g, 21.0 / 29.0 / 35.0 kg-cm at 4.8 / 6.0 / 7.4 V (motionrc.com HRC36950; shop.multiplex-rc.de 68 g)' },
};
export const SERVO_ORDER = ['hs55', 'hs65mg', 'd89mw', 'd645mw', 'd950tw'];

/*
 * The aircraft. cf: the stock surfaces' chord fractions; throwDeg: the
 * table's throws (configs/tuning.js high rates); flapped: the area each
 * surface runs along over the wing's reference area (both ailerons
 * together), which the deflected surface's drag is taken on; servo: the
 * stock servo's class, and for each surface how many and where (body
 * frame about the table's CG, m), where the bigger servo's mass goes.
 */
export const SURFACES = {
  extra3d1308: {
    sim: 29,
    cf: { a: 0.29, e: 0.45, r: 0.76 },
    throwDeg: { a: 36.53, e: 39.67, r: 55.05 },
    /* The ailerons from 0.077 m to the 0.654 m tip on the 0.366 to 0.204 m
     * taper, both sides, over 0.369 m^2; the stabiliser 0.0877 m^2; the
     * rudder three quarters of the 0.046 m^2 fin (scripts/extra-derive.js). */
    flapped: { a: 0.8615, e: 0.0877 / 0.369, r: 0.75 * 0.046 / 0.369 },
    servo: {
      model: 'd89mw',
      a: { n: 2, at: [0.0, 0.25, 0.0] },
      e: { n: 1, at: [-0.05, 0.0, 0.0] },
      r: { n: 1, at: [-0.05, 0.0, 0.0] },
    },
    source: 'cf, flapped area and the tail servos\' place: scripts/extra-derive.js (E-flite\'s dimensioned views); the servo class: FW_EXTRA3D1308.servo_rate (Hitec D89MW for E-flite\'s 23 g EFL11598); the aileron servos 0.25 m out, ESTIMATED (mid aileron)',
  },
  cub1400: {
    sim: 4,
    cf: { a: 0.25, e: 0.40, r: 0.50 },
    throwDeg: { a: 18, e: 15, r: 15 },
    /* The ailerons 0.28 to 0.66 m out on the 0.20 m chord, both sides, over
     * 0.28 m^2; the stabiliser 0.047 m^2; the fin and rudder 0.020 m^2, the
     * rudder its full height (scripts/cub-derive.js). */
    flapped: { a: 2 * 0.20 * (0.66 - 0.28) / 0.28, e: 0.047 / 0.28, r: 0.020 / 0.28 },
    servo: {
      model: 'hs55',
      a: { n: 2, at: [0.0, 0.47, 0.0] },
      e: { n: 1, at: [-0.10, 0.0, 0.0] },
      r: { n: 1, at: [-0.10, 0.0, 0.0] },
    },
    source: 'cf: docs/CUB-STAGE1.md (aileron a quarter of the chord, elevator about 40 percent of the tail chord, rudder about half the fin\'s); flapped area: scripts/cub-derive.js; the servo class: FMS\'s 9 g servos, Hitec HS-55 taken for them; the aileron servos mid aileron and the tail servos 0.10 m behind the CG, ESTIMATED',
  },
};

export const TIERED = Object.keys(SURFACES);

/* The tiers a pilot has fitted on aircraft `id`, { a, e, r } each a
 * TIERS name; anything else, and a surface the aircraft is not offered
 * tiers on, is stock. */
export function normaliseTiers(t, id) {
  const out = { a: 'stock', e: 'stock', r: 'stock' };
  const offered = SURFACE_TIERS[id] ? SURFACE_TIERS[id].offered : null;
  if (!t || typeof t !== 'object' || !offered) {
    return out;
  }
  for (const k of SURFACE_KEYS) {
    if (offered[k] && TIERS.includes(t[k])) {
      out[k] = t[k];
    }
  }
  return out;
}

export function isStock(t, id) {
  const n = normaliseTiers(t, id);
  return SURFACE_KEYS.every((k) => n[k] === 'stock');
}

/*
 * What the game seats for a pilot's tiers, from the derived table. Each
 * returns the stock answer (null, no points, the table's throws) when
 * every surface is stock, so a stock aircraft flies exactly as before.
 */
function rowOf(id, key, tier) {
  const rows = SURFACE_TIERS[id] && SURFACE_TIERS[id][key];
  if (!rows) {
    return null;
  }
  return rows[TIERS.indexOf(tier)];
}

/* The sim_wing_set_tiers block (src/native/sim_abi.h), or null for stock
 * or an aircraft without tiers. */
export function tierBlock(id, tiers) {
  const t = normaliseTiers(tiers, id);
  if (!SURFACE_TIERS[id] || isStock(t, id)) {
    return null;
  }
  const out = new Float64Array(SIM_TIER_DOUBLES);
  SURFACE_KEYS.forEach((k, i) => {
    const row = rowOf(id, k, t[k]);
    out[SIM_TIER.K_A + i] = row.k;
    out[SIM_TIER.CD_A + i] = row.cd;
  });
  return out;
}

/* The throws at full stick, deg, a e r: the tier's, which the pilot's
 * rates scale as they scale the stock ones. */
export function tierThrowsDeg(id, tiers) {
  const t = normaliseTiers(tiers, id);
  return SURFACE_KEYS.map((k) => rowOf(id, k, t[k]).throwDeg);
}

/* The bigger servos' mass over the stock ones', as add-on points
 * (configs/hangar-parts.js addonParams `extra`): a pair of aileron servos
 * goes on as one each side. */
export function tierPoints(id, tiers) {
  const t = normaliseTiers(tiers, id);
  const s = SURFACES[id];
  if (!s || isStock(t, id)) {
    return [];
  }
  const pts = [];
  for (const k of SURFACE_KEYS) {
    const row = rowOf(id, k, t[k]);
    if (row.dKg === 0) {
      continue;
    }
    const { n, at } = s.servo[k];
    const each = row.dKg / n;
    if (n === 2) {
      pts.push({ at: [at[0], at[1], at[2]], kg: each, cda: 0 }, { at: [at[0], -at[1], at[2]], kg: each, cda: 0 });
    } else {
      pts.push({ at: at.slice(), kg: row.dKg, cda: 0 });
    }
  }
  return pts;
}

/* The points' own inertia about their lump, kg m^2, Ixx Iyy Izz, for
 * sim_set_addon_inertia: the aileron servos' spread, which a lump at the
 * centreline loses. */
export function pointsInertia(pts) {
  const m = pts.reduce((a, p) => a + p.kg, 0);
  if (m === 0) {
    return [0, 0, 0];
  }
  const c = [0, 1, 2].map((a) => pts.reduce((s, p) => s + p.kg * p.at[a], 0) / m);
  const I = [0, 0, 0];
  for (const p of pts) {
    const r = p.at.map((v, a) => v - c[a]);
    I[0] += p.kg * (r[1] * r[1] + r[2] * r[2]);
    I[1] += p.kg * (r[0] * r[0] + r[2] * r[2]);
    I[2] += p.kg * (r[0] * r[0] + r[1] * r[1]);
  }
  return I;
}

/* The unlockable id of a surface's tier: 'a-sport', 'e-3d', 'r-extreme'.
 * Stock is never locked. A tier opens this many levels after its plane. */
export const unlockId = (key, tier) => `${key}-${tier}`;
export const TIER_LEVEL_STEP = { sport: 1, '3d': 2, extreme: 3 };

/* The lockable tiers, for src/game/progress.js unlockables(): each
 * { id, airframe, step, name } where the plane's level plus `step` is the
 * level it opens at. */
export function tierUnlockables() {
  const out = [];
  for (const id of TIERED) {
    for (const key of SURFACE_KEYS) {
      if (!SURFACE_TIERS[id].offered[key]) {
        continue;
      }
      for (const tier of TIERS.slice(1)) {
        out.push({ id: unlockId(key, tier), airframe: id, step: TIER_LEVEL_STEP[tier], name: `surfaces.unlock_${key}_${tier}` });
      }
    }
  }
  return out;
}

/* What the plant flies for a pilot's stored tiers: each surface the tier
 * stored, or stock where it is not offered, not yet earned (`locked(id,
 * unlockId)` true), or the room flies stock only. */
export function flownTiers(id, stored, { locked = () => false, stockOnly = false } = {}) {
  const t = normaliseTiers(stored, id);
  if (stockOnly) {
    return { a: 'stock', e: 'stock', r: 'stock' };
  }
  for (const k of SURFACE_KEYS) {
    if (t[k] !== 'stock' && locked(id, unlockId(k, t[k]))) {
      t[k] = 'stock';
    }
  }
  return t;
}

/* settings.surfaces, validated: { [airframeId]: { a, e, r } } for the
 * aircraft with tiers, stock entries dropped, so an empty map is every
 * aircraft as it comes. */
export function normaliseSurfaces(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const id of TIERED) {
    const t = normaliseTiers(stored[id], id);
    if (!isStock(t, id)) {
      out[id] = t;
    }
  }
  return out;
}

/* One stored entry's shape, for the account blob (src/share/progressmerge.js):
 * a record whose a, e and r, where present, are tier names. */
export function tiersShape(e) {
  return Boolean(e) && typeof e === 'object' && !Array.isArray(e)
    && Object.keys(e).every((k) => SURFACE_KEYS.includes(k) && TIERS.includes(e[k]));
}

/* How much bigger each surface is drawn, { a, e, r }: the tier's chord
 * fraction over stock, which the craft builders take as `opts.surfaces`
 * and grow each surface's chord by, its hinge line moving forward. Null
 * for stock, so a stock model is built exactly as before. */
export function surfaceGrowth(id, tiers) {
  const t = normaliseTiers(tiers, id);
  if (!SURFACE_TIERS[id] || isStock(t, id)) {
    return null;
  }
  const out = {};
  for (const k of SURFACE_KEYS) {
    const rows = SURFACE_TIERS[id][k];
    out[k] = rows[TIERS.indexOf(t[k])].cf / rows[0].cf;
  }
  return out;
}
