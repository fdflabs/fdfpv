/*
 * perfoverlay.js: the frame readout a pilot can switch on (Settings,
 * Screen, Frame readout, or F3). Off by default.
 *
 * WHY IT IS BACK. The old readout in the top right corner was taken out
 * (src/main.js, THE PERFORMANCE READOUT IS GONE) because it was on for
 * everybody, on the first screen a visitor sees. The owner asked for it
 * again on 2026-10-05, for the 90 fps work: a pilot judging "smoother"
 * wants the number while flying. So it is off unless asked for, small, and
 * it never takes a click. It sits low on the left, over the OSD's pack
 * readout (the bottom 80 px) and under the freestyle combo (index.html
 * .score-combo, 24vh up): the top left has the course chip and the score,
 * the right the flight buttons, the speed and the throttle.
 *
 * WHAT IT SHOWS, from numbers the shell already measures, so the readout
 * and scripts/perf-play.js agree:
 *
 *   fps and 1% low  over the drawn frames' intervals (a frame the cap
 *                   skips is not a frame): fps from the last second, the
 *                   1% low as docs/PERF.md defines it, 1000 over the mean
 *                   of the slowest 1 percent, over the last RING frames;
 *   frame ms        the mean drawn interval over the last second;
 *   CPU             the frame callback's own time (main.js blockMs), the
 *                   mean over the same second;
 *   GPU             dynamic resolution's timer query round the world's
 *                   draw (src/render/dynres.js gpuSeen), or n/a where the
 *                   browser has no timer;
 *   draw calls and triangles  the renderer's counts for the last frame;
 *   render scale and cap      dynres.js's scale and the frame cap.
 *
 * Every frame it takes scalars into a preallocated ring and allocates
 * nothing; the text is rebuilt four times a second.
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

import { str } from '../strings/index.js';

/* About eleven seconds at 90 fps: the slowest 1 percent is ten frames. */
export const RING = 1024;
export const TEXT_MS = 250;
/* An interval this long is a pause, a hidden tab or a world loading, not
 * a frame: it starts the count again. Two seconds, so a machine drawing
 * three frames a second (a software rasteriser) still gets a readout. */
const GAP_MS = 2000;
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

const CSS = `
.perf-ov { position: absolute; left: 16px; bottom: 96px; z-index: 5; pointer-events: none; display: none;
  font-family: ${FONT}; font-size: 11px; line-height: 1.45; color: rgba(238, 247, 250, 0.92);
  background: rgba(6, 12, 18, 0.55); padding: 4px 7px; border-radius: 3px; white-space: pre;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
`;

const fixed = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '-');

export class PerfOverlay {
  constructor(root) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'perf-ov';
    this.el.setAttribute('aria-hidden', 'true');
    root.append(this.el);
    this.on = false;
    this.iv = new Float64Array(RING);
    this.cpu = new Float64Array(RING);
    this.sorted = new Float64Array(RING);
    this.n = 0;
    this.head = 0;
    this.lastMs = -1;
    this.nextTextMs = 0;
    /* The numbers the text was last built from, for scripts/perf-overlay-check.js. */
    this.shown = { fps: 0, low: 0, frameMs: 0, cpuMs: 0, gpuMs: -1, calls: 0, tris: 0, scale: 1, cap: 0, frames: 0 };
  }

  setOn(on) {
    on = Boolean(on);
    if (on === this.on) {
      return;
    }
    this.on = on;
    this.el.style.display = on ? 'block' : 'none';
    this.n = 0;
    this.head = 0;
    this.lastMs = -1;
    this.nextTextMs = 0;
    if (on) {
      this.el.textContent = '';
    }
  }

  /*
   * Once per drawn frame, after the draw. nowMs is the frame's timestamp,
   * cpuMs its callback's own time, gpuMs the world's GPU time or a negative
   * number for none, scale the render scale, capHz the cap or 0.
   */
  frame(nowMs, cpuMs, gpuMs, calls, tris, scale, capHz) {
    if (!this.on) {
      return;
    }
    const d = this.lastMs < 0 ? 0 : nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (d > GAP_MS) {
      this.n = 0;
      this.head = 0;
    } else if (d > 0) {
      this.iv[this.head] = d;
      this.cpu[this.head] = cpuMs;
      this.head = (this.head + 1) % RING;
      if (this.n < RING) {
        this.n += 1;
      }
    }
    if (nowMs < this.nextTextMs) {
      return;
    }
    this.nextTextMs = nowMs + TEXT_MS;
    this.measure(gpuMs, calls, tris, scale, capHz);
    this.draw();
  }

  measure(gpuMs, calls, tris, scale, capHz) {
    const s = this.shown;
    const n = this.n;
    /* The last second, newest back. */
    let sum = 0;
    let cpu = 0;
    let k = 0;
    for (; k < n && sum < 1000; k += 1) {
      const i = (this.head - 1 - k + RING) % RING;
      sum += this.iv[i];
      cpu += this.cpu[i];
    }
    s.frameMs = k > 0 ? sum / k : 0;
    s.cpuMs = k > 0 ? cpu / k : 0;
    s.fps = s.frameMs > 0 ? 1000 / s.frameMs : 0;
    s.low = 0;
    if (n > 0) {
      const sorted = this.sorted.subarray(0, n);
      sorted.set(this.iv.subarray(0, n));
      sorted.sort();
      const worst = Math.max(1, Math.floor(n / 100));
      let w = 0;
      for (let i = n - worst; i < n; i += 1) {
        w += sorted[i];
      }
      s.low = 1000 / (w / worst);
    }
    s.gpuMs = gpuMs;
    s.calls = calls;
    s.tris = tris;
    s.scale = scale;
    s.cap = capHz;
    s.frames = n;
  }

  draw() {
    const s = this.shown;
    this.el.textContent = [
      str('perf.line_fps', { fps: fixed(s.fps, 0), low: s.frames > 0 ? fixed(s.low, 0) : '-' }),
      str('perf.line_ms', { frame: fixed(s.frameMs, 1), cpu: fixed(s.cpuMs, 1), gpu: s.gpuMs >= 0 ? fixed(s.gpuMs, 1) : str('perf.na') }),
      str('perf.line_draw', { calls: s.calls, tris: fixed(s.tris / 1e6, 2) }),
      str('perf.line_scale', { scale: fixed(s.scale, 2), cap: s.cap > 0 ? s.cap : str('perf.cap_off') }),
    ].join('\n');
  }
}
