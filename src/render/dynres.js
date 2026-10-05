/*
 * dynres.js: dynamic resolution. Holds the frame budget by lowering the
 * render pixel ratio in steps while the GPU is over it, and gives the
 * pixels back slowly when there is headroom.
 *
 * WHAT IT MOVES. One number, `scale`, which quality.js pixelRatioFor
 * multiplies in after the preset and the pixel budget. Every composer
 * sizes its targets from the renderer's ratio in setSize, so one ratio
 * change moves the whole chain together. Physics never sees any of this:
 * the 1 kHz accumulator does not read frame time, so a resolution step
 * changes nothing about the trajectory.
 *
 * WHAT IT MEASURES. GPU time from EXT_disjoint_timer_query_webgl2 around
 * the world's draw, when the browser offers it. That is the only number
 * that means anything under vsync: on a 60 Hz panel the frame interval is
 * 16.7 ms whether the GPU took 4 ms or 15. Without the extension it falls
 * back to the interval between drawn frames, judged against the display's
 * own interval, because asking a 60 Hz panel for 90 fps would read as
 * permanently over budget and pin the floor.
 *
 * WHY IT DOES NOT OSCILLATE. A drop needs a sustained excess (an EMA over
 * budget for DROP_FRAMES frames in a row), a raise needs a long clean run
 * AND a prediction that the next step up still fits (time scales with
 * pixels, so with scale squared). A raise that is followed by a drop
 * doubles the wait before the next raise, up to 16 times. Resizing
 * reallocates the composer targets, so the frames right after a change
 * are not samples.
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

export const PERF_MODES = ['quality', 'balanced', 'performance'];

/*
 * The owner's target is 90 fps, 11.1 ms a frame, when the pilot has not
 * capped lower. `aim` is the share of that interval the GPU is held to,
 * the rest is headroom for the shell and for a heavy moment: Balanced
 * aims at about 9 ms of an 11.1 ms frame. Performance aims lower and may
 * go further down; rubric F4's pixel floor in quality.js binds either way.
 */
export const TARGET_HZ = 90;
const MODES = {
  quality: null,
  balanced: { aim: 0.81, floor: 0.75 },
  performance: { aim: 0.65, floor: 0.5 },
};

export const STEP = 0.05;
const DROP_FRAMES = 45;
const RAISE_FRAMES = 120;
const SETTLE_FRAMES = 12;
/* A new world compiles its shaders and uploads its textures over its
 * first frames, and those frames are not what the scene costs. */
const WARM_FRAMES = 120;
const MAX_BACKOFF = 16;
const QUERIES = 8;

export function normalizePerfMode(id) {
  return PERF_MODES.includes(id) ? id : 'balanced';
}

export function createDynRes() {
  const s = {
    mode: 'balanced',
    enabled: false,
    scale: 1,
    budgetMs: 1000 / TARGET_HZ,
    gpu: false,
    gpuMs: 0,
    frameMs: 0,
    displayMs: 1000 / 60,
    over: 0,
    clean: 0,
    settle: 0,
    backoff: 1,
    lastRaise: -1,
    frames: 0,
    changes: 0,
  };
  let gl = null;
  let ext = null;
  const pool = [];
  const pending = [];
  let active = null;
  let lastDraw = -1;

  /* One context, bound once. The software rasteriser is left alone:
   * its frame time is CPU time and says nothing about a GPU, and the
   * screenshot checks run on it at a fixed scale. */
  function bind(context, software) {
    gl = context;
    s.settle = WARM_FRAMES;
    s.enabled = !software && MODES[s.mode] != null;
    ext = gl && typeof gl.getExtension === 'function'
      ? gl.getExtension('EXT_disjoint_timer_query_webgl2')
      : null;
    s.gpu = !!ext;
    if (ext) {
      for (let i = 0; i < QUERIES; i += 1) {
        pool.push(gl.createQuery());
      }
    }
  }

  function setMode(mode, capHz, software) {
    s.mode = normalizePerfMode(mode);
    s.enabled = !software && gl != null && MODES[s.mode] != null;
    const hz = capHz > 0 && capHz < TARGET_HZ ? capHz : TARGET_HZ;
    s.budgetMs = 1000 / hz;
    if (!s.enabled && s.scale !== 1) {
      s.scale = 1;
      return true;
    }
    return false;
  }

  function beginGpu() {
    if (!s.enabled || !ext || active || pool.length === 0) {
      return;
    }
    active = pool.pop();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
  }

  function endGpu() {
    if (!active) {
      return;
    }
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push(active);
    active = null;
  }

  /* Results land a frame or more late; take every one that is ready. */
  function collectGpu() {
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    let got = -1;
    while (pending.length > 0) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        break;
      }
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      pending.shift();
      pool.push(q);
      if (!disjoint) {
        got = ns / 1e6;
      }
    }
    return got;
  }

  /*
   * Once per drawn frame, after the draw. Returns true when `scale`
   * changed and the caller must re-apply the pixel ratio. shellMs is the
   * callback's own work outside the draw: resolution cannot buy that back.
   */
  function observe(nowMs, shellMs) {
    if (!s.enabled) {
      lastDraw = -1;
      return false;
    }
    const interval = lastDraw < 0 ? 0 : nowMs - lastDraw;
    lastDraw = nowMs;
    s.frames += 1;
    if (interval > 0 && interval < 100) {
      s.frameMs += (interval - s.frameMs) * 0.1;
      /* The display interval is the shortest interval seen recently, and
       * it creeps back up so a monitor change is learned. */
      s.displayMs = interval < s.displayMs ? interval : s.displayMs + 0.002;
    }
    let sample = -1;
    let budget = s.budgetMs;
    if (ext) {
      sample = collectGpu();
    } else if (interval > 0 && interval < 100) {
      sample = interval;
      budget = s.displayMs > budget ? s.displayMs * 1.05 : budget;
    }
    if (sample < 0) {
      return false;
    }
    if (s.settle > 0) {
      s.settle -= 1;
      return false;
    }
    s.gpuMs = s.gpuMs === 0 ? sample : s.gpuMs + (sample - s.gpuMs) * 0.1;
    const m = MODES[s.mode];
    const aim = ext ? budget * m.aim : budget;
    if (s.gpuMs > aim && shellMs < budget * 0.8) {
      s.over += 1;
      s.clean = 0;
    } else {
      s.over = 0;
      s.clean += 1;
    }
    if (s.over >= DROP_FRAMES && s.scale > m.floor + 1e-6) {
      if (s.lastRaise >= 0 && s.frames - s.lastRaise < RAISE_FRAMES * s.backoff * 2) {
        s.backoff = Math.min(MAX_BACKOFF, s.backoff * 2);
      }
      return change(Math.max(m.floor, s.scale - STEP));
    }
    if (s.scale >= 1 || s.clean < RAISE_FRAMES * s.backoff) {
      return false;
    }
    const up = Math.min(1, s.scale + STEP);
    /* Without a GPU timer an interval pinned to vsync predicts nothing,
     * so the long clean run is the whole test. */
    const fits = !ext || s.gpuMs * (up * up) / (s.scale * s.scale) < aim * 0.9;
    if (!fits) {
      return false;
    }
    s.lastRaise = s.frames;
    return change(up);
  }

  function change(to) {
    s.scale = Math.round(to * 1000) / 1000;
    s.over = 0;
    s.clean = 0;
    s.gpuMs = 0;
    s.settle = SETTLE_FRAMES;
    s.changes += 1;
    return true;
  }

  /* The caller found the ratio did not move (a floor in quality.js bound
   * first). Take the step back so the scale names what is on screen. */
  function refuse(prev) {
    s.scale = prev;
    s.changes -= 1;
  }

  function reset() {
    s.scale = 1;
    s.over = 0;
    s.clean = 0;
    s.gpuMs = 0;
    s.settle = WARM_FRAMES;
    s.backoff = 1;
    s.lastRaise = -1;
    lastDraw = -1;
  }

  return { state: s, bind, setMode, beginGpu, endGpu, observe, refuse, reset };
}
