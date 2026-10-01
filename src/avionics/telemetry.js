/*
 * telemetry.js: FlightTelemetry, what the vehicle knows about itself
 * (docs/AVIONICS-HUD.md section 4).
 *
 * It computes nothing the shell has not already computed for the FPV OSD:
 * it is fed the same view and context as src/ui/fpvhud.js feed(), after it,
 * and reads that OSD's Betaflight faithful results (the filtered pack
 * voltage, the battery state, LQ, the ON timer), so the two HUDs can never
 * disagree about the flight controller's numbers. What it adds are the
 * things the plant does not model and the Avionics HUD shows anyway, each a
 * small deterministic model named here and tagged in the HUD so it never
 * pretends:
 *
 *   - GNSS and VIO (section 4.3 of the doc): acquisition after the run
 *     starts and multipath near the ground; VIO from the picture, the
 *     height and the speed. Nothing in play denies either yet; the test
 *     hook window.__avionics.deny('gnss' or 'vio', true) does.
 *   - Motor temperatures (SIM): each motor's share of the pack's power by
 *     rpm cubed, a fixed share of it lost as heat, a first order lag to a
 *     steady rise that falls with airspeed.
 *   - The compute module's temperature (SIM), from PerceptionAI's load.
 *
 * Endurance is not a model: it is the plant's charge left over the plant's
 * current, filtered, and only where the plant counts charge.
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

import { attitudeOf } from '../ui/fpvhud.js';

const DEG = Math.PI / 180;

/* GNSS: satellites in view once acquired, the seconds of flight screen time
 * it takes to get them all, and the counts for a 2D and a 3D fix. */
export const GNSS_SATS = 12;
export const GNSS_ACQUIRE_S = 8;
const GNSS_2D = 4;
const GNSS_3D = 6;
/* Horizontal accuracy with every satellite, m, and the height under which
 * multipath doubles it. */
const GNSS_HDOP_M = 1.0;
export const GNSS_LOW_AGL_M = 3;

/* VIO's envelope: the camera needs texture at a usable depth and a ground
 * that does not smear past it. DEGRADED inside VIO_SOFT times a limit. */
export const VIO_MAX_AGL_M = 150;
export const VIO_MAX_MS = 45;
const VIO_SOFT = 1.25;
const VIO_MAX_SNOW = 0.5;

/* Speed's one sigma by navigation source, m/s, and how fast dead
 * reckoning's grows, m/s per s. */
const SIGMA_GNSS = 0.2;
const SIGMA_VIO = 0.5;
const SIGMA_DR_GROW = 0.3;

/* LQ, Betaflight's percent, at and above which the link is OK. */
export const LINK_OK_LQ = 70;

/* The current's filter for endurance, s: long enough that a stab of
 * throttle does not swing the clock, short enough that a cruise shows. */
const AMPS_TAU_S = 5;
/* Below this the pack is not being drawn on and endurance is unbounded. */
const AMPS_FLOOR = 0.1;

/* Motors (SIM). Ambient for a Paraguayan afternoon, the share of a motor's
 * power that is heat, the thermal resistance in still air (K per W), the
 * airspeed that halves it, and the time constant. A 7 inch at hover sheds
 * about 6 W a motor and sits about 12 K over ambient. */
const AMBIENT_C = 30;
const MOTOR_LOSS = 0.15;
const MOTOR_RTH = 2.0;
const MOTOR_COOL_MS = 10;
const MOTOR_TAU_S = 45;
/* The compute module (SIM): idle rise and the rise at full load, and its
 * time constant. */
const CPU_IDLE_RISE = 8;
const CPU_LOAD_RISE = 40;
const CPU_TAU_S = 30;

function lag(now, target, dt, tau) {
  return now + (target - now) * (dt / (tau + dt));
}

export function createFlightTelemetry() {
  const att = { pitch: 0, roll: 0, heading: 0 };
  const state = {
    tS: 0,
    armed: false,
    fixedWing: false,
    flightMode: 'acro',
    attitude: { pitch: 0, roll: 0, heading: 0 },
    speed: { ms: 0, sigma: SIGMA_GNSS },
    vs: { ms: 0 },
    agl: { m: 0 },
    battery: { volts: 0, amps: 0, watts: 0, percent: 1, percentFrom: 'voltage', state: 'ok', cells: 1 },
    endurance: null,
    motors: [0, 1, 2, 3].map(() => ({ rpm: 0, tempC: AMBIENT_C })),
    link: { preset: 'perfect', hz: 250, latencyMs: 0, lossPct: 0, lq: 100, state: 'ok' },
    gnss: { sats: 0, fix: 'none', hdopM: 0, state: 'acquiring' },
    vio: { state: 'ok', why: '' },
    nav: { source: 'GNSS', sinceFixS: 0 },
    compute: { load: 0, tempC: AMBIENT_C },
    video: { snow: 0, lost: false },
  };
  const endurance = { remainS: 0, totalS: 0 };
  const denied = { gnss: false, vio: false };
  let lastT = null;
  let lastWall = null;
  let ampsFilt = 0;
  let lastGoodT = 0;

  function reset() {
    lastT = null;
    ampsFilt = 0;
    lastGoodT = 0;
    for (const m of state.motors) {
      m.tempC = AMBIENT_C;
    }
    state.compute.tempC = AMBIENT_C;
  }

  function gnss(onS, aglM) {
    const g = state.gnss;
    g.sats = denied.gnss ? 0 : Math.min(GNSS_SATS, Math.floor((GNSS_SATS * onS) / GNSS_ACQUIRE_S));
    g.fix = g.sats >= GNSS_3D ? '3d' : g.sats >= GNSS_2D ? '2d' : 'none';
    g.hdopM = g.sats > 0 ? (GNSS_HDOP_M * GNSS_SATS) / g.sats * (aglM < GNSS_LOW_AGL_M ? 2 : 1) : 0;
    g.state = denied.gnss ? 'denied' : g.fix === '3d' ? 'ok' : 'acquiring';
  }

  function vio(aglM, ms) {
    const v = state.vio;
    const pic = state.video;
    if (denied.vio) {
      v.state = 'lost';
      v.why = 'denied';
    } else if (pic.lost || pic.snow >= VIO_MAX_SNOW) {
      v.state = 'lost';
      v.why = 'video';
    } else if (aglM > VIO_MAX_AGL_M * VIO_SOFT || ms > VIO_MAX_MS * VIO_SOFT) {
      v.state = 'lost';
      v.why = aglM > VIO_MAX_AGL_M * VIO_SOFT ? 'height' : 'speed';
    } else if (aglM > VIO_MAX_AGL_M || ms > VIO_MAX_MS) {
      v.state = 'degraded';
      v.why = aglM > VIO_MAX_AGL_M ? 'height' : 'speed';
    } else {
      v.state = 'ok';
      v.why = '';
    }
  }

  /*
   * One flight frame, after fpvOsd.feed(v, x). `osd` is that FpvOsd, read
   * for the flight controller's own numbers; `extra` is
   * { videoSnow, cameraLost, load } from fpvfail and PerceptionAI.
   */
  function feed(v, x, osd, extra) {
    const st = x.st;
    const t = st[0];
    if (lastT === null || t < lastT - 1e-9) {
      reset();
      lastT = t;
    }
    const now = performance.now();
    const wallS = lastWall === null ? 0 : Math.min(now - lastWall, 1000) / 1000;
    lastWall = now;
    /* The OSD's own rule: the sim clock while it runs, the wall clock
     * while the craft is parked and the plant is not stepped. */
    const dt = t - lastT > 0 ? t - lastT : wallS;
    lastT = t;
    state.tS = t;
    state.armed = Boolean(x.armed);
    state.fixedWing = Boolean(x.fixedWing);
    state.flightMode = v.flightMode;

    attitudeOf(x.quat, att);
    state.attitude.pitch = att.pitch * DEG;
    state.attitude.roll = att.roll * DEG;
    state.attitude.heading = att.heading * DEG;
    const ms = v.speedKph / 3.6;
    state.speed.ms = ms;
    /* The plant's frame is Z up. */
    state.vs.ms = st[6];
    state.agl.m = v.altitude;

    const b = state.battery;
    const pw = x.power;
    b.cells = x.cells;
    b.volts = osd.vFilt ?? st[18];
    b.amps = x.armed ? st[19] : 0;
    b.watts = b.volts * b.amps;
    b.state = osd.batt;
    const drains = Boolean(pw && pw.capacityC > 0);
    b.percentFrom = drains ? 'charge' : 'voltage';
    b.percent = Math.max(0, Math.min(1, drains ? 1 - pw.chargeC / pw.capacityC : v.packFrac));
    ampsFilt = lag(ampsFilt, b.amps, dt, AMPS_TAU_S);
    if (drains && ampsFilt > AMPS_FLOOR) {
      endurance.remainS = Math.max(0, pw.capacityC - pw.chargeC) / ampsFilt;
      endurance.totalS = pw.capacityC / ampsFilt;
      state.endurance = endurance;
    } else {
      state.endurance = drains ? endurance : null;
      if (drains) {
        endurance.remainS = Infinity;
        endurance.totalS = Infinity;
      }
    }

    /* Motors: rpm from the plant, Betaflight order; heat from each one's
     * share of the pack's power by rpm cubed. */
    let cubes = 0;
    for (let i = 0; i < 4; i += 1) {
      const rpm = x.armed ? st[14 + i] : 0;
      state.motors[i].rpm = rpm;
      cubes += rpm * rpm * rpm;
    }
    const rth = MOTOR_RTH / (1 + ms / MOTOR_COOL_MS);
    for (const m of state.motors) {
      const share = cubes > 0 ? (m.rpm * m.rpm * m.rpm) / cubes : 0;
      const target = AMBIENT_C + b.watts * share * MOTOR_LOSS * rth;
      m.tempC = lag(m.tempC, target, dt, MOTOR_TAU_S);
    }

    const L = state.link;
    const link = x.link;
    L.preset = link ? link.id : 'perfect';
    L.hz = link ? link.hz : 250;
    L.latencyMs = link && !link.isPerfect() ? link.delayMs + link.sigDelayMs : 0;
    L.lq = osd.lq;
    L.lossPct = 100 - osd.lq;
    L.state = L.lq <= 0 ? 'lost' : L.lq < LINK_OK_LQ ? 'weak' : 'ok';

    state.video.snow = extra.videoSnow;
    state.video.lost = extra.cameraLost;
    gnss(osd.onS, state.agl.m);
    vio(state.agl.m, ms);
    const nav = state.nav;
    if (state.gnss.fix === '3d') {
      nav.source = 'GNSS';
      lastGoodT = t;
      state.speed.sigma = SIGMA_GNSS;
    } else if (state.vio.state !== 'lost') {
      nav.source = 'VIO';
      lastGoodT = t;
      state.speed.sigma = SIGMA_VIO;
    } else {
      nav.source = 'DR';
      state.speed.sigma = SIGMA_VIO + SIGMA_DR_GROW * (t - lastGoodT);
    }
    nav.sinceFixS = t - lastGoodT;

    const c = state.compute;
    c.load = extra.load;
    c.tempC = lag(c.tempC, AMBIENT_C + CPU_IDLE_RISE + CPU_LOAD_RISE * c.load, dt, CPU_TAU_S);
  }

  return {
    state,
    feed,
    /* The test hook's: cut a source until put back. */
    deny(what, on) {
      if (!(what in denied)) {
        throw new Error(`telemetry: nothing called ${what} to deny`);
      }
      denied[what] = Boolean(on);
    },
  };
}
