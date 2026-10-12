/*
 * servo-derive.js: each aircraft's hinge_hold (plant_wing.c, servo blow
 * back), from its surfaces' geometry, its servos' published stall torque
 * and NACA's plain flap hinge moments (scripts/lib/hinge.js).
 *
 *   node scripts/servo-derive.js           print the table and the speeds
 *   node scripts/servo-derive.js --check   fail when a table's hinge_hold
 *                                          is not what this derives
 *
 * Per surface, one panel: span, its flap chord's root mean square, the
 * chord fraction, the aspect ratio of the surface it hinges on, the
 * table's throw, the servos on the panel and their torque at the voltage
 * it was published at. A torque published at 4.8 V is taken at 4.8 V,
 * though a receiver on a 5 or 6 V BEC gives the servo more: no kit here
 * publishes its BEC's voltage, so the published figure stands (the safe
 * side for the servo, the hard side for the pilot).
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVOS } from '../configs/surfaces.js';
import { hold, blowBackSpeed, hingeSlope, hingeAlpha, shapeDeg, shapeInv } from './lib/hinge.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* A servo by its configs/surfaces.js SERVOS id, with the voltage its
 * torque is published at. */
const servo = (id, volts) => ({ id, kgcm: SERVOS[id].kgcm, volts, source: SERVOS[id].source });

/*
 * The classes a kit that names no servo is given, ESTIMATED by its size,
 * each torque as published. An electric aircraft's receiver runs off its
 * ESC's BEC, taken at the 6.0 V figure where one is published; a glow
 * aircraft's off a 4.8 V NiCd pack, the 4.8 V figure.
 */
const HS311_48 = { id: 'hs311', kgcm: 3.0, volts: 4.8, source: 'Hitec HS-311 class, ESTIMATED for a standard size glow kit naming none: "42.00 oz-in (3.0 kg-cm) at 4.8V" (littlebirdelectronics.com.au/products/hitec-hs311-standard-servo; store.hobbyetc.com/parts/view/44489)' };
const HS311_60 = { id: 'hs311', kgcm: 3.5, volts: 6.0, source: 'Hitec HS-311 class, ESTIMATED for a standard size electric kit naming none: "3.0 ~ 3.5 kg-cm" over 4.8 to 6.0 V (hitecrcd.com, HS-311)' };
const HS55_EST = { ...servo('hs55', 6.0), source: `ESTIMATED for a 9 g class foam kit naming none: ${SERVOS.hs55.source}` };
const FW9 = { id: 'freewing9', kgcm: 1.6, volts: 4.8, source: 'Freewing 9 g digital metal gear MD31092, "1.6 kg/cm (22.21 oz/in)" at 4.8 V (motionrc.com), ESTIMATED for the kit\'s unpublished 9 g servos' };
const FW17 = { id: 'freewing17', kgcm: 2.5, volts: 4.8, source: 'Freewing 17 g digital metal gear MD31172, 2.5 kg-cm at 4.8 V (motionrc.com), ESTIMATED for FMS\'s unpublished 17 g servos, taken on the ailerons' };
const HS81 = { id: 'hs81', kgcm: 3.0, volts: 6.0, source: 'Hitec HS-81, "2.6 kg/cm at 4.8 V and 3 kg/cm at 6 V" (Motion RC HRC31081S; hitecrcd.com "2.6 ~ 3.0"), the servo scripts/zagi-derive.js builds its mass on (ESTIMATED: not Zagi\'s manual)' };
const THETA989 = { id: 'theta989', kgcm: 18.0, volts: 6.0, source: 'EF/Theta 989, docs/CAP580-STAGE1.md "four servos (the sheet\'s EF/Theta 989s)": "22kg/.07 60 deg at 8.4V, 20kg/.08 at 7.4V, 18kg/.09 at 6.0V, 14kg/.10 at 5.0V" (lindinger.at 9797754)' };

/* The root mean square of a linear taper's chord, c0 to c1. */
const rmsTaper = (c0, c1) => Math.sqrt((c0 * c0 + c0 * c1 + c1 * c1) / 3);

/*
 * The fleet. Each `a` is one aileron (or one elevon), `e` the elevator
 * (both halves on one servo unless servosPerPanel says otherwise, one
 * half each), `r` the rudder.
 */
export const FLEET = {
  FW_EXTRA3D1308: {
    /* scripts/extra-derive.js: the ailerons 0.077 to 0.654 m on the 0.366
     * to 0.204 m taper, AR 4.64; the stabiliser 0.0877 m^2 over 0.501 m;
     * the fin and rudder 0.046 m^2 over 0.293 m, its effective AR 2.89;
     * cf configs/surfaces.js. */
    a: { cf: 0.29, ar: 4.636, span: 0.654 - 0.077, chordRms: 0.29 * rmsTaper(0.366 - 0.162 * 0.077 / 0.654, 0.204), servosPerPanel: 1, servo: servo('d89mw', 6.0) },
    e: { cf: 0.45, ar: 0.501 ** 2 / 0.0877, span: 0.501, chordRms: 0.45 * 0.0877 / 0.501, servosPerPanel: 1, servo: servo('d89mw', 6.0) },
    r: { cf: 0.76, ar: 2.893, span: 0.293, chordRms: 0.76 * 0.046 / 0.293, servosPerPanel: 1, servo: servo('d89mw', 6.0) },
  },
  FW_CUB1400: {
    /* scripts/cub-derive.js: the ailerons 0.28 to 0.66 m on the 0.20 m
     * chord, AR 7.0; the stabiliser 0.047 m^2 over 0.38 m; the fin and
     * rudder 0.020 m^2, its AR 1.5, the rudder its full height, 0.168 m
     * (slip_hv); cf configs/surfaces.js. */
    a: { cf: 0.25, ar: 7.0, span: 0.38, chordRms: 0.25 * 0.20, servosPerPanel: 1, servo: servo('hs55', 6.0) },
    e: { cf: 0.40, ar: 0.38 ** 2 / 0.047, span: 0.38, chordRms: 0.40 * 0.047 / 0.38, servosPerPanel: 1, servo: servo('hs55', 6.0) },
    r: { cf: 0.50, ar: 1.5, span: 0.168, chordRms: 0.50 * 0.020 / 0.168, servosPerPanel: 1, servo: servo('hs55', 6.0) },
  },
  FW_SLICK2680: {
    /* scripts/slick-derive.js: the ailerons 0.181 to 1.270 m, 0.136 m of
     * mean flap chord (docs/SURFACES-STAGE1.md; the taper is mild, so
     * taken as the rms), AR 6.25, two servos each; the elevator 0.1407
     * m^2 over the 1.039 m stabiliser, one servo a half; the fin and
     * rudder 0.1436 m^2 over 0.562 m, its effective AR 3.40. */
    a: { cf: 0.32, ar: 2.68 ** 2 / 1.15, span: 1.27 - 0.181, chordRms: 0.136, servosPerPanel: 2, servo: servo('sb2290sg', 6.0) },
    e: { cf: 0.566, ar: 1.039 ** 2 / 0.2484, span: 1.039 / 2, chordRms: 0.1407 / 1.039, servosPerPanel: 1, servo: servo('sb2290sg', 6.0) },
    r: { cf: 0.68, ar: 3.404, span: 0.5617, chordRms: 0.68 * 0.1436 / 0.5617, servosPerPanel: 1, servo: servo('sb2290sg', 6.0) },
  },
  FW_NIGHTTIMBER1200: {
    /* scripts/nighttimber-derive.js: the ailerons 0.319 to 0.563 m on the
     * constant 0.239 m chord, AR 5.02 (the flaperons inboard take the
     * same angle on the same servos and nearly the same panel, 0.226 m
     * against 0.244, so the aileron's hold stands for both); the
     * stabiliser 0.0794 m^2 over 0.495 m; the fin and rudder 0.034 m^2
     * over 0.227 m, its effective AR 2.35; cf configs/surfaces.js. */
    a: { cf: 0.383, ar: 5.025, span: 0.5629 - 0.3191, chordRms: 0.383 * 0.239, servosPerPanel: 1, servo: servo('spmsa332', 4.8) },
    e: { cf: 0.525, ar: 0.495 ** 2 / 0.0794, span: 0.495, chordRms: 0.525 * 0.0794 / 0.495, servosPerPanel: 1, servo: servo('spmsa332', 4.8) },
    r: { cf: 0.60, ar: 2.349, span: 0.227, chordRms: 0.60 * 0.034 / 0.227, servosPerPanel: 1, servo: servo('spmsa332', 4.8) },
  },
  FW_TIMBER1500: {
    /* scripts/timber-derive.js: the ailerons 0.340 to 0.700 m on the
     * 0.240 m chord, AR 6.70; the stabiliser 0.071 m^2 over 0.56 m; the
     * fin and rudder 0.0314 m^2, its AR 1.8, 0.231 m high (slip_hv); cf
     * configs/surfaces.js. The A370's torque is the A332's, ESTIMATED
     * there. */
    a: { cf: 0.27, ar: 1.555 ** 2 / 0.361, span: 0.36, chordRms: 0.27 * 0.24, servosPerPanel: 1, servo: servo('spmsa370', 4.8) },
    e: { cf: 0.44, ar: 0.56 ** 2 / 0.071, span: 0.56, chordRms: 0.44 * 0.071 / 0.56, servosPerPanel: 1, servo: servo('spmsa370', 4.8) },
    r: { cf: 0.46, ar: 1.8, span: 0.231, chordRms: 0.46 * 0.0314 / 0.231, servosPerPanel: 1, servo: servo('spmsa370', 4.8) },
  },
  /*
   * The rest of the fleet: geometry off each derive script and stage
   * document (the line it comes from is the script's own: span, flap
   * chord, chord fraction and the aspect ratio it uses); where a chord
   * fraction is an area share, so marked there, it is taken as the chord
   * fraction (ESTIMATED).
   */
  /* docs/SKYHUNTER-STAGE1.md: ailerons 0.45 to 0.85 m, a fifth of the
   * 0.20 m chord, AR 9; the stabiliser 0.456 by 0.130 m, the elevator 40
   * percent; two fins 0.19 m tall on one servo, the rudder's chord not
   * given, a third of the 0.105 m fin taken (ESTIMATED, tau 0.5 on Nelson
   * fig. 2.20). */
  FW_SKY1800: {
    a: { cf: 0.2, ar: 9, span: 0.4, chordRms: 0.04, servosPerPanel: 1, servo: HS55_EST },
    e: { cf: 0.4, ar: 3.51, span: 0.456, chordRms: 0.052, servosPerPanel: 1, servo: HS55_EST },
    r: { cf: 0.3, ar: 2.7, span: 0.19, chordRms: 0.3 * 0.105, servosPerPanel: 0.5, servo: HS55_EST },
  },
  /* scripts/glider-derive.js: the ailerons 0.55 to 0.95 m, a quarter of
   * the chord, AR 11.27; Sh 0.0476 over 0.477 m, 27 percent; Sv 0.038,
   * 0.218 m high, the rudder 40 mm on the horn's 80 mm (the horn chord
   * over the fin's mean, ESTIMATED). */
  FW_RADIAN2000: {
    a: { cf: 0.25, ar: 11.27, span: 0.4, chordRms: 0.0426, servosPerPanel: 1, servo: HS55_EST },
    e: { cf: 0.27, ar: 4.78, span: 0.477, chordRms: 0.0269, servosPerPanel: 1, servo: HS55_EST },
    r: { cf: 0.46, ar: 1.876, span: 0.218, chordRms: 0.08, servosPerPanel: 1, servo: HS55_EST },
  },
  /* scripts/dlg-derive.js: the flaperons 0.08 to 0.70 m, a quarter of the
   * elliptic chord; Sh 0.020 over 0.30 m, the elevator 9 mm of 30 at the
   * horn; Sv 0.016 over 0.20 m, the rudder 12 of 45 mm. Hyperflight's
   * "four servos 34 g", 8.5 g each, rated as the HS-55 (ESTIMATED; an F3K
   * build's may be stronger). */
  FW_NRJ1490: {
    a: { cf: 0.25, ar: 11.68, span: 0.62, chordRms: 0.0332, servosPerPanel: 1, servo: HS55_EST },
    e: { cf: 0.45, ar: 4.5, span: 0.3, chordRms: 0.03, servosPerPanel: 1, servo: HS55_EST },
    r: { cf: 0.56, ar: 3.75, span: 0.2, chordRms: 0.045, servosPerPanel: 1, servo: HS55_EST },
  },
  /* scripts/bramor-derive.js: each elevon 0.45 to 1.10 m, a quarter of
   * the local chord, AR 8.95, one servo each (C-Astral publishes neither,
   * ESTIMATED); a 4 to 5 kg survey wing's standard size servos. */
  FW_BRAMOR2300: {
    a: { cf: 0.25, ar: 8.95, span: 0.65, chordRms: 0.0461, servosPerPanel: 1, servo: HS311_60 },
  },
  /* docs/SLOWSTICK-STAGE1.md: the flat plate stabiliser 0.44 m at its
   * trailing edge, 0.14 m chord, the aft 45 percent; the half egg fin
   * 0.19 m tall, the rudder its aft half. GWS names no servo. */
  FW_SLOWSTICK1180: {
    e: { cf: 0.45, ar: 3.46, span: 0.44, chordRms: 0.063, servosPerPanel: 1, servo: HS55_EST },
    r: { cf: 0.5, ar: 1.8, span: 0.19, chordRms: 0.0789, servosPerPanel: 1, servo: HS55_EST },
  },
  FW_TIMBER1500F: null,
  FW_CUB1400F: null,
  /* scripts/bombshell-derive.js: Sh 0.0481, elevFrac 0.296 and rudFrac
   * 0.534 area shares; the fin 4.65 plan inches tall. */
  FW_BOMBSHELL1118: {
    e: { cf: 0.296, ar: 3.53, span: 0.4124, chordRms: 0.0345, servosPerPanel: 1, servo: HS55_EST },
    r: { cf: 0.534, ar: 1.483, span: 0.1237, chordRms: 0.0668, servosPerPanel: 1, servo: HS55_EST },
  },
  /* scripts/kadet-derive.js: the elevator the aft 3 in of 8, 30 in of
   * trailing edge less the 1.8 in rudder cut out; the rudder 51.5 of
   * 109.3 sq in (an area share), on the 3.5 in chord. Glow, standard
   * servos. */
  FW_KADET1981: {
    e: { cf: 0.375, ar: 3.9, span: 0.7163, chordRms: 0.0762, servosPerPanel: 1, servo: HS311_48 },
    r: { cf: 0.471, ar: 1.6, span: 0.3737, chordRms: 0.0889, servosPerPanel: 1, servo: HS311_48 },
  },
  /* scripts/p51-derive.js: the ailerons 0.45 to 0.68 m, ailFrac 0.22;
   * elevFrac and rudFrac area shares, the fin 0.18 m tall. FMS lists "(6)
   * 9G Servo, (3) 17G Servo" and no torque nor which surface takes the
   * 17 g; the ailerons taken as 17 g. */
  FW_P51D1450: {
    a: { cf: 0.22, ar: 5.94, span: 0.23, chordRms: 0.0438, servosPerPanel: 1, servo: FW17 },
    e: { cf: 0.469, ar: 6.23, span: 0.516, chordRms: 0.0388, servosPerPanel: 1, servo: FW9 },
    r: { cf: 0.537, ar: 1.66, span: 0.18, chordRms: 0.0873, servosPerPanel: 1, servo: FW9 },
  },
  /* scripts/f16-derive.js: the flaperons 117 to 300 mm, a fifth of the
   * chord, AR 3.09; the rudder an area share on a fin of geometric AR
   * 1.35. The stabilators move whole on a pivot near their quarter chord,
   * where a plain flap's hinge moment does not apply: no hold. Six 9 g
   * servos (the derive's mass list, ESTIMATED). */
  FW_F16878: {
    a: { cf: 0.2, ar: 3.09, span: 0.183, chordRms: 0.05, servosPerPanel: 1, servo: FW9 },
    r: { cf: 0.212, ar: 2.025, span: 0.228, chordRms: 0.0358, servosPerPanel: 1, servo: FW9 },
  },
  /* scripts/zagi-derive.js: each elevon a constant 1.5 in from 2.5 in to
   * the 24 in tip, cf over the mean local chord, AR 5.71. */
  FW_ZAGI1219: {
    a: { cf: 0.187, ar: 5.71, span: 0.5461, chordRms: 0.0381, servosPerPanel: 1, servo: HS81 },
  },
  /* scripts/uglystik-derive.js: strip ailerons 1.2 in on the 13.68 in
   * chord, cf 0.088, under NACA Report 721's smallest, so taken at 0.10
   * (ESTIMATED), both on one servo through bellcranks; the elevator 1.67
   * in of 7.46; the rudder 26 of 71 sq in (an area share), 8.2 in tall.
   * Glow, standard servos. */
  FW_UGLYSTIK1567: {
    a: { cf: 0.1, ar: 4.82, span: 0.6393, chordRms: 0.0305, servosPerPanel: 0.5, servo: HS311_48 },
    e: { cf: 0.224, ar: 3.23, span: 0.5664, chordRms: 0.0424, servosPerPanel: 1, servo: HS311_48 },
    r: { cf: 0.366, ar: 1.41, span: 0.2083, chordRms: 0.0805, servosPerPanel: 1, servo: HS311_48 },
  },
  /* scripts/tigermoth-derive.js: the bottom wing's ailerons 0.35 to 0.89
   * m, a quarter of the chord, each on its own servo (Great Planes'
   * manual); cfE 0.5, cfR 0.8. Glow, standard servos. */
  FW_TIGERMOTH1803: {
    a: { cf: 0.25, ar: 7.41, span: 0.54, chordRms: 0.0671, servosPerPanel: 1, servo: HS311_48 },
    e: { cf: 0.5, ar: 3.75, span: 0.6052, chordRms: 0.0807, servosPerPanel: 1, servo: HS311_48 },
    r: { cf: 0.8, ar: 3.51, span: 0.3268, chordRms: 0.1116, servosPerPanel: 1, servo: HS311_48 },
  },
  /* scripts/hercules-derive.js: the ailerons 0.66 to 0.97 of the half
   * span, cfA 0.25; Sh over 1.222 m, cfE 0.35, on one servo (ESTIMATED:
   * the kit's eight servos are not allocated); cfR 0.35. Electric. */
  FW_HERCULES3077: {
    a: { cf: 0.25, ar: 9.03, span: 0.4769, chordRms: 0.0655, servosPerPanel: 1, servo: HS311_60 },
    e: { cf: 0.35, ar: 7.28, span: 1.2221, chordRms: 0.0588, servosPerPanel: 1, servo: HS311_60 },
    r: { cf: 0.35, ar: 2.76, span: 0.4645, chordRms: 0.0913, servosPerPanel: 1, servo: HS311_60 },
  },
  /* scripts/cap580-derive.js: the ailerons 0.115 m to the tip, cfA 0.43
   * on the 0.435 to 0.217 m taper; the elevator 0.75 m, cfE 0.67 on 0.29
   * to 0.22 m, one servo; the rudder cfR 0.70, Sv 0.067 over 0.352 m. */
  FW_CAP1702: {
    a: { cf: 0.43, ar: 5.22, span: 0.7359, chordRms: 0.1359, servosPerPanel: 1, servo: THETA989 },
    e: { cf: 0.67, ar: 2.94, span: 0.75, chordRms: 0.1714, servosPerPanel: 1, servo: THETA989 },
    r: { cf: 0.7, ar: 2.87, span: 0.352, chordRms: 0.1332, servosPerPanel: 1, servo: THETA989 },
  },
};
/* The floats carry the land aircraft's surfaces and servos. */
FLEET.FW_TIMBER1500F = FLEET.FW_TIMBER1500;
FLEET.FW_CUB1400F = FLEET.FW_CUB1400;

/*
 * No hold, and why: FW_WING1000, retired; FW_STRIKER_PROP and
 * FW_STRIKER_JET, a Shahed class drone whose servos nothing publishes
 * nor bounds.
 */
export const UNHELD = ['FW_WING1000', 'FW_STRIKER_PROP', 'FW_STRIKER_JET'];

const DEG = 180 / Math.PI;
const r1 = (x) => Math.round(x * 10) / 10;

/* The table's throw for each slot, deg, and its top speed where a
 * comment carries it, read from the C. */
function tableOf(c, name) {
  const i = c.indexOf(`const FixedWingParams ${name} = {`);
  if (i < 0) throw new Error(`servo-derive: no table ${name} in plant_wing.c`);
  const body = c.slice(i, c.indexOf('\n};', i));
  const deg = (f) => {
    const m = new RegExp(`\\.${f} = ([0-9.]+) \\* WING_PI / 180\\.0`).exec(body);
    return m ? Number(m[1]) : 0;
  };
  const h = /\.hinge_hold = \{ ([^}]*) \}/.exec(body);
  const ha = /\.hinge_alpha = \{ ([^}]*) \}/.exec(body);
  return {
    alpha: ha ? ha[1].split(',').map((s) => Number(s.trim())) : [0, 0, 0],
    /* An elevon travels to surface_max, its two sticks' sum. */
    throwDeg: { a: /FW_MIX_ELEVON/.test(body) ? deg('surface_max') : deg('throw_a'), e: deg('throw_e'), r: deg('throw_r') },
    hold: h ? h[1].split(',').map((s) => Number(s.trim())) : [0, 0, 0],
  };
}

export function deriveAll(c) {
  const out = {};
  for (const [name, surf] of Object.entries(FLEET)) {
    const t = tableOf(c, name);
    const row = { hold: [0, 0, 0], alpha: [0, 0, 0], surfaces: {}, inC: t.hold, alphaInC: t.alpha };
    ['a', 'e', 'r'].forEach((k, i) => {
      const s = surf[k];
      if (!s || !(t.throwDeg[k] > 0)) return;
      const h = r1(hold({ ...s, throwDeg: t.throwDeg[k], kgcm: s.servo.kgcm }));
      row.hold[i] = h;
      row.alpha[i] = Math.round(hingeAlpha(s.cf, s.ar) * 1e4) / 1e4;
      row.surfaces[k] = { throwDeg: t.throwDeg[k], chd: hingeSlope(s.cf, s.ar), hold: h, vBlow: blowBackSpeed(h, t.throwDeg[k]) };
    });
    out[name] = row;
  }
  return out;
}

/* The angle a panel holds at airspeed V, deg. */
export function heldAt(h, throwDeg, V, rho = 1.225) {
  const q = 0.5 * rho * V * V;
  return Math.min(throwDeg, shapeInv(Math.min(shapeDeg(throwDeg), h / q * DEG)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const c = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
  const all = deriveAll(c);
  let bad = 0;
  for (const [name, row] of Object.entries(all)) {
    console.log(`${name.padEnd(20)} hinge_hold ${row.hold.join(', ')} Pa rad; hinge_alpha ${row.alpha.join(', ')}`);
    for (const [k, s] of Object.entries(row.surfaces)) {
      const top = [15, 20, 25, 30, 40].map((V) => `${V}: ${heldAt(s.hold, s.throwDeg, V).toFixed(1)}`).join('  ');
      console.log(`  ${k}  dCh/d delta ${s.chd.toFixed(3)} per rad, full ${s.throwDeg} deg held to ${s.vBlow.toFixed(1)} m/s; held deg at m/s  ${top}`);
    }
    if (row.hold.some((h, i) => h !== row.inC[i]) || row.alpha.some((a, i) => a !== row.alphaInC[i])) {
      bad += 1;
      console.log(`  DIFFERS: plant_wing.c has { ${row.inC.join(', ')} } and { ${row.alphaInC.join(', ')} }`);
    }
  }
  if (process.argv.includes('--check') && bad > 0) {
    console.error(`servo-derive --check: ${bad} table(s) differ from their derivation`);
    process.exit(1);
  }
}
