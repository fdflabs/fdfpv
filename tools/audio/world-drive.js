/*
 * world-drive.js: render one world scene (tools/audio/world-scenes.js)
 * OLD or NEW on an OfflineAudioContext, in the browser, for the listening
 * page (tools/audio/listen.html) and tools/audio/world.js --browser.
 *
 *   OLD  the sound before the engine (tools/audio/old-audio.js, frozen):
 *        the explosions through its boom(), as src/main.js rang it, the
 *        loudest a frame; the attackers silent, because nothing voiced
 *        them
 *   NEW  src/render/audio.js with src/render/world-worklet.js on its
 *        buses through MotorAudio.attachWorld, the scene's whole timeline
 *        handed over before the render starts
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
import { MotorAudio as OldAudio } from './old-audio.js';
import { SCENES } from './world-scenes.js';

export const RATE = 48000;
/* The shell's default volume, 6 of 10 (drive.js). */
const LEVEL = 0.6;

export async function renderWorld(id, mode) {
  const sc = SCENES[id];
  if (!sc) {
    throw new Error(`no scene ${id}`);
  }
  const ctx = new OfflineAudioContext(2, Math.round(sc.seconds * RATE), RATE);
  const a = mode === 'new' ? new MotorAudio() : new OldAudio();
  a.attach(ctx);
  await a.ready;
  a.setLevel(LEVEL);
  a.setMusicContext('flight');
  a.setMusicEnabled(false);
  a.setEnabled(true);
  /* The pilot's own aircraft is not in a world scene: its motors stopped. */
  a.update([0, 0, 0, 0], 0, 0, null);
  if (mode === 'old') {
    for (const b of sc.booms) {
      const L = sc.frames[0].lis;
      const d = b.dist ?? Math.hypot(b.p[0] - L[0], b.p[1] - L[1], b.p[2] - L[2]);
      a.boom(b.level, d, b.t);
    }
  } else {
    await ctx.audioWorklet.addModule(new URL('../../src/render/world-worklet.js', import.meta.url));
    /* The timeline goes in the node's options, which the processor has
     * before its first quantum; a port message would arrive whenever the
     * audio thread got to it, which on an offline render can be after the
     * first quanta are already rendered. The load guard is off: a render
     * is not real time, and it must hear the same samples every run. */
    const node = new AudioWorkletNode(ctx, 'fdfpv-world', {
      numberOfInputs: 0, numberOfOutputs: 3, outputChannelCount: [2, 2, 2],
      processorOptions: { guard: false, timeline: { frames: sc.frames, booms: sc.booms } },
    });
    a.attachWorld(node);
  }
  const nodes = a.nodeCount();
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  return {
    id, mode, rate: buf.sampleRate, seconds: sc.seconds,
    channels: [buf.getChannelData(0), buf.getChannelData(1)], nodes, renderMs,
  };
}

/* For tools/audio/world.js --browser: render and keep the samples. */
export async function renderWorldAndStash(id, mode) {
  const r = await renderWorld(id, mode);
  globalThis.__lab = r.channels;
  return { id, mode, rate: r.rate, seconds: r.seconds, length: r.channels[0].length, nodes: r.nodes, renderMs: r.renderMs };
}
