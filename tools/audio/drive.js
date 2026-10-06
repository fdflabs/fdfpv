/*
 * drive.js: render one scripted flight through the real audio graph, OLD
 * or NEW, on an OfflineAudioContext. A page module: tools/audio/listen.html
 * plays what it returns and tools/audio/render.js measures it, so the
 * owner's comparison and the checks hear the same samples.
 *
 *   OLD  the sound before the engine (tools/audio/old-audio.js, frozen):
 *        the four oscillator chains, the wind loop, the crash cue
 *   NEW  src/render/audio.js as the game plays it: src/render/engine-worklet.js
 *        behind a limiter, fed the extra state the flight carries (body
 *        velocity, current, an off board listener, the impact's surface)
 *
 * Both are fed exactly as src/main.js feeds the live mix, a row per frame
 * at the trace's rate, through update() and the event calls, with the
 * volume at the shell's default (6, so 0.6) and the stems at theirs. The
 * music bed is off in both: an OfflineAudioContext has no media element.
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

import { MotorAudio } from '../../src/render/audio.js';
import { engineSpecFor } from '../../src/render/enginespec.js';
import { MotorAudio as OldAudio } from './old-audio.js';

export const RATE = 48000;
/* The shell's defaults: volume 6 of 10 (src/ui/ui.js DEFAULTS). */
const LEVEL = 0.6;
/* src/main.js IMPACT_FULL: m/s of impact that reads as a full hit. */
const IMPACT_FULL = 12;
/* The listener's ear, metres over the ground, for the ground reflection. */
const EAR_M = 1.7;

/*
 * ROOMS: other pilots heard from this one (MotorAudio.updatePeers). The
 * listener flies `own`; each peer replays one of the plant's flights,
 * moved by `at` (plant frame metres, z up) and started `lag` seconds into
 * it, so a room is real traces, not invented ones. 'room-4' is four pilots
 * near; 'room-32' a full room on a ring from 15 to 320 m, which is what
 * the voice budget is for.
 */
const PEER_FLIGHTS = ['quad-punch', 'quad-dive', '7inch-punch', 'interceptor-punch', '10inch-punch', 'quad-propwash', 'cub1400-flight', 'f16878-flight'];
const PEER_AIRFRAME = { 'quad-punch': 'interceptor', 'quad-dive': 'interceptor', '7inch-punch': '7inch', 'interceptor-punch': 'interceptor', '10inch-punch': '10inch', 'quad-propwash': 'interceptor', 'cub1400-flight': 'cub1400', 'f16878-flight': 'f16878' };
export const SCENES = {
  'room-4': {
    title: 'Room: four pilots near a hovering five inch',
    own: 'quad-hover',
    peers: [
      { flight: 'quad-punch', at: [12, 4, 0], lag: 0 },
      { flight: 'quad-dive', at: [-60, 30, -80], lag: 1 },
      { flight: '7inch-punch', at: [-20, -15, 0], lag: 0.5 },
      { flight: 'interceptor-punch', at: [30, -25, 0], lag: 2 },
    ],
  },
  'room-32': {
    title: 'Room: 32 pilots, the voice budget at work',
    own: 'quad-hover',
    peers: Array.from({ length: 31 }, (_, k) => {
      const r = 15 + 10 * k;
      const a = k * 2.4;
      return { flight: PEER_FLIGHTS[k % PEER_FLIGHTS.length], at: [r * Math.cos(a), r * Math.sin(a), 0], lag: (k * 0.37) % 3 };
    }),
  },
};

let flightsPromise = null;
export function loadFlights() {
  flightsPromise ??= fetch(new URL('./flights.json', import.meta.url)).then((r) => {
    if (!r.ok) {
      throw new Error(`flights.json: ${r.status}`);
    }
    return r.json();
  });
  return flightsPromise;
}

/* The off board listener's view of a row: distance, the ground image's
 * path, and a pan from the side the aircraft is on (listener faces +y,
 * so +x is to the right). `at` is [x, y, the ground's height]; the ear is
 * EAR_M over that ground. */
function listenerView(row, at) {
  const dx = row[7] - at[0];
  const dy = row[8] - at[1];
  const h = Math.hypot(dx, dy);
  const zs = row[9] - at[2];
  const dist = Math.hypot(h, zs - EAR_M);
  const dist2 = Math.hypot(h, zs + EAR_M);
  return { dist, dist2, pan: Math.max(-1, Math.min(1, dx / Math.max(1, dist))) };
}

/*
 * Render `id` from flights.json as 'old' or 'new'. Returns the two channels
 * and what the render cost: the graph's node count and the wall time.
 * `stem` 'engine' or 'air' mutes the other stem's bus, which is how a
 * category's own loudness is measured.
 */
export async function renderFlight(id, mode, stem = '') {
  const data = await loadFlights();
  const scene = SCENES[id] || null;
  const f = scene ? { ...data.flights[scene.own], listener: null } : data.flights[id];
  if (!f) {
    throw new Error(`no flight ${id}`);
  }
  const rows = f.rows;
  const seconds = rows.length / data.rate;
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE);
  const lab = mode === 'new';
  const a = lab ? new MotorAudio() : new OldAudio();
  a.setVoice(f.voice);
  if (lab) {
    /* The same spec the shell builds from the same configs. */
    a.setEngineSpec(engineSpecFor(f.airframe, f.power || {}, f.combat || {}));
  }
  a.attach(ctx);
  await a.ready;
  a.setLevel(LEVEL);
  a.setMusicContext('flight');
  a.setMusicEnabled(false);
  if (stem === 'engine') {
    a.setMix({ wind: 0 });
  } else if (stem === 'air') {
    a.setMix({ motors: 0 });
  } else if (stem) {
    throw new Error(`no stem ${stem}`);
  }
  a.setEnabled(true);
  const rpm = [0, 0, 0, 0];
  const air = { u: 0, v: 0, w: 0, amps: 0, dist: 0, dist2: 0, pan: 0, flapsMoving: false, gearMoving: false };
  const events = f.events.slice();
  const heard = [];
  const peerState = scene ? scene.peers.map((sp, k) => ({
    id: k + 1, spec: engineSpecFor(PEER_AIRFRAME[sp.flight], {}, {}), rpm: [0, 0, 0, 0], x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  })) : null;
  /* The flaps and the gear, read as src/main.js reads them off the plant. */
  let flapWas = rows.length ? rows[0][11] : 0;
  let gearWas = rows.length ? rows[0][12] : 0;
  let gearMovingWas = false;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const t = i / data.rate;
    rpm[0] = r[0];
    rpm[1] = r[1];
    rpm[2] = r[2];
    rpm[3] = r[3];
    air.u = r[4];
    air.v = r[5];
    air.w = r[6];
    air.amps = r[10];
    air.flapsMoving = Math.abs(r[11] - flapWas) > 1e-5;
    flapWas = r[11];
    const gearMoving = Math.abs(r[12] - gearWas) > 1e-6;
    if (lab && gearMovingWas && !gearMoving && (r[12] === 0 || r[12] === 1)) {
      a.mechanical('gear', t);
    }
    gearMovingWas = gearMoving;
    gearWas = r[12];
    air.gearMoving = gearMoving;
    if (f.listener) {
      Object.assign(air, listenerView(r, f.listener));
    }
    a.update(rpm, Math.hypot(r[4], r[5], r[6]), t, air);
    if (scene && lab) {
      heard.length = 0;
      for (let k = 0; k < scene.peers.length; k += 1) {
        const sp = scene.peers[k];
        const pf = data.flights[sp.flight];
        const pr = pf.rows[Math.min(pf.rows.length - 1, i + Math.round(sp.lag * data.rate))];
        const pe = peerState[k];
        pe.rpm[0] = pr[0];
        pe.rpm[1] = pr[1];
        pe.rpm[2] = pr[2];
        pe.rpm[3] = pr[3];
        /* Plant (x, y, z up) into the listener's y up frame: (x, z, -y). */
        pe.x = pr[7] + sp.at[0];
        pe.y = pr[9] + sp.at[2];
        pe.z = -(pr[8] + sp.at[1]);
        pe.vx = Math.hypot(pr[4], pr[5], pr[6]);
        pe.vy = 0;
        pe.vz = 0;
        heard.push(pe);
      }
      /* The camera is on the hovering craft, facing +x of the plant, so
       * its right hand is the plant's -y: (0, 0, 1) in the y up frame. */
      a.setListener(r[7], r[9], -r[8], 0, 0, 1, 0);
      a.updatePeers(heard, t);
    }
    while (events.length && events[0].t <= t + 1e-9) {
      const e = events.shift();
      if (e.kind === 'mech') {
        /* OLD had no mechanisms at all. */
        if (lab) {
          a.mechanical(e.what, e.t);
        }
      } else if (e.kind === 'strike') {
        if (lab) {
          a.propStrike(e.level, e.hardness, e.t);
        } else {
          a.wreck('chip', e.level, e.t);
        }
      } else if (lab) {
        a.impact(e.impulse, e.hardness, e.speed, e.t);
      } else {
        /* The shell's call (src/main.js feelImpact): a level off the
         * arrival speed, and the heavier cue past 0.45 of a full hit. */
        const u = Math.min(1, e.speed / IMPACT_FULL);
        a.event(u > 0.45 ? 'crash' : 'clip', e.t, u);
      }
    }
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  return {
    id, mode, rate: buf.sampleRate, seconds,
    channels: [buf.getChannelData(0), buf.getChannelData(1)],
    nodes: a.nodeCount(),
    renderMs,
  };
}

/* For tools/audio/render.js: render and keep the samples on the page for
 * the Node side to pull back in chunks. */
export async function renderAndStash(id, mode, stem = '') {
  const r = await renderFlight(id, mode, stem);
  globalThis.__lab = r.channels;
  return { id, mode, rate: r.rate, seconds: r.seconds, length: r.channels[0].length, nodes: r.nodes, renderMs: r.renderMs };
}
