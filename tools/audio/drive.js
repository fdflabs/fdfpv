/*
 * drive.js: render one scripted flight through the real audio graph, OLD
 * or NEW, on an OfflineAudioContext. A page module: tools/audio/listen.html
 * plays what it returns and tools/audio/render.js measures it, so the
 * owner's comparison and the checks hear the same samples.
 *
 *   OLD  src/render/audio.js as it ships: the four oscillator chains, the
 *        wind loop, the crash cue
 *   NEW  the same class with the audiolab flag: src/render/engine-worklet.js
 *        behind a limiter, fed the extra state the flight carries (body
 *        velocity, current, an off board listener, the impact's surface)
 *
 * Both are fed exactly as src/main.js feeds the live mix, a row per frame
 * at the trace's rate, through update() and the event calls, with the
 * volume at the shell's default (6, so 0.6) and the stems at theirs. The
 * music bed is off in both: an OfflineAudioContext has no media element.
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

import { MotorAudio, labModelForCraft } from '../../src/render/audio.js';

export const RATE = 48000;
/* The shell's defaults: volume 6 of 10 (src/ui/ui.js DEFAULTS). */
const LEVEL = 0.6;
/* src/main.js IMPACT_FULL: m/s of impact that reads as a full hit. */
const IMPACT_FULL = 12;
/* The listener's ear, metres over the ground, for the ground reflection. */
const EAR_M = 1.7;

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
  const f = data.flights[id];
  if (!f) {
    throw new Error(`no flight ${id}`);
  }
  const rows = f.rows;
  const seconds = rows.length / data.rate;
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE);
  const a = new MotorAudio();
  const lab = mode === 'new';
  a.setLab(lab);
  a.setVoice(f.voice);
  if (lab) {
    const [af, prop] = f.craft === '5inch' ? [null, null] : ['striker2500', f.craft.split('-')[1]];
    a.setLabModel(labModelForCraft(af, prop));
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
  const air = { u: 0, v: 0, w: 0, amps: 0, dist: 0, dist2: 0, pan: 0 };
  const events = f.events.slice();
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
    if (f.listener) {
      Object.assign(air, listenerView(r, f.listener));
    }
    a.update(rpm, Math.hypot(r[4], r[5], r[6]), t, air);
    while (events.length && events[0].t <= t + 1e-9) {
      const e = events.shift();
      if (lab) {
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
