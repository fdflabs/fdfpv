/*
 * fpvfail.js: the FPV picture failing the way a real feed does.
 *
 * A pilot in goggles learns what happened to the aircraft from the picture
 * before anything else: a knocked camera tilts the horizon, a torn off
 * video antenna breaks the feed up into snow and rolling tears, a camera
 * that has gone leaves nothing but static, and a pack that has left the
 * aircraft takes the transmitter with it and the goggles go dark. The crash
 * physics reports all four (sim_damage_flags); the tilt is the shell's
 * camera, and this draws the other three over the picture.
 *
 * A small 2D canvas over the world canvas and under the OSD, filled with
 * noise at a fraction of the screen's resolution and stretched, which is
 * what analogue snow looks like anyway and costs a few tens of thousands
 * of pixel writes a frame, and only while a feed is failing. The world
 * canvas itself is nudged sideways on a sync tear. Render only.
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

/* The snow's own resolution: coarse on purpose, stretched to the screen. */
const SNOW_W = 240;
const SNOW_H = 135;

/* How long a feed takes to die, ms: the antenna's breakup worsening into
 * static, and the goggles going dark once the transmitter has no power. */
const BREAKUP_RAMP_MS = 900;
const BLACK_FADE_MS = 180;

/* A lost antenna is not a lost feed at a few metres: a transmitter with no
 * antenna still reaches goggles close by, through heavy snow. */
const ANTENNA_SNOW = 0.62;

export function createFpvFail(viewCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = SNOW_W;
  canvas.height = SNOW_H;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;'
    + 'image-rendering:pixelated;display:none;';
  viewCanvas.after(canvas);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SNOW_W, SNOW_H);
  const px = new Uint32Array(img.data.buffer);
  let seed = 0x9e3779b9;
  let shown = false;
  let tearing = false;

  /* Onsets, wall ms, or -1. */
  const onset = { antenna: -1, camera: -1, battery: -1 };

  function rand() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  }

  /*
   * The feed's state from the damage: which failures are in force. Called
   * every frame with the flags; an onset is stamped the first frame a
   * failure is seen and forgotten when it clears (a reset).
   */
  function set(antennaLost, cameraLost, batteryEjected, nowMs) {
    onset.antenna = antennaLost ? (onset.antenna < 0 ? nowMs : onset.antenna) : -1;
    onset.camera = cameraLost ? (onset.camera < 0 ? nowMs : onset.camera) : -1;
    onset.battery = batteryEjected ? (onset.battery < 0 ? nowMs : onset.battery) : -1;
  }

  /* How far gone the picture is: { snow 0..1, black 0..1 }, and whether
   * there is any picture left to fly by. */
  function level(nowMs) {
    let snow = 0;
    let black = 0;
    if (onset.antenna >= 0) {
      const u = Math.min(1, (nowMs - onset.antenna) / BREAKUP_RAMP_MS);
      snow = Math.max(snow, ANTENNA_SNOW * u);
    }
    if (onset.camera >= 0) {
      snow = 1;
    }
    if (onset.battery >= 0) {
      black = Math.min(1, (nowMs - onset.battery) / BLACK_FADE_MS);
    }
    return { snow, black };
  }

  /* When the feed died for good, or -1: the camera or the power gone. */
  function deadSince() {
    const a = onset.camera;
    const b = onset.battery;
    if (a < 0) {
      return b;
    }
    return b < 0 ? a : Math.min(a, b);
  }

  function hide() {
    if (shown) {
      canvas.style.display = 'none';
      shown = false;
    }
    if (tearing) {
      viewCanvas.style.transform = '';
      tearing = false;
    }
  }

  /*
   * Once a frame. `fpv` is whether the pilot is looking through the
   * aircraft's own camera; any other view is the pilot's eye, which no
   * transmitter can fail.
   */
  function update(nowMs, fpv) {
    const { snow, black } = level(nowMs);
    if (!fpv || (snow <= 0 && black <= 0)) {
      hide();
      return;
    }
    if (!shown) {
      canvas.style.display = 'block';
      shown = true;
    }
    if (black >= 1) {
      /* Nothing on the air at all: the goggles' own black. */
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, SNOW_W, SNOW_H);
      if (tearing) {
        viewCanvas.style.transform = '';
        tearing = false;
      }
      return;
    }
    /* Breakup comes in bursts: the level swings frame to frame, and a
     * band of rows goes to pure snow where the sync is lost. */
    const swing = snow >= 1 ? 1 : snow * (0.35 + 0.75 * (rand() % 1000) / 1000);
    const bandA = rand() % SNOW_H;
    const bandH = snow >= 1 ? SNOW_H : 3 + (rand() % Math.max(4, Math.round(40 * snow)));
    for (let y = 0; y < SNOW_H; y += 1) {
      const inBand = y >= bandA && y < bandA + bandH;
      const rowA = inBand ? 255 : Math.round(255 * swing);
      /* A snow row is grey noise, a little bluish, the way a receiver with
       * no carrier draws it. */
      for (let x = 0; x < SNOW_W; x += 1) {
        const g = rand() & 255;
        const b = Math.min(255, g + 18);
        px[y * SNOW_W + x] = (rowA << 24) | (b << 16) | (g << 8) | g;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
      ctx.fillRect(0, 0, SNOW_W, SNOW_H);
    }
    /* A sync tear shifts the whole picture sideways for a frame. */
    if (snow < 1 && rand() % 100 < 30 * snow) {
      const dx = ((rand() % 21) - 10) * snow;
      viewCanvas.style.transform = `translateX(${dx.toFixed(1)}px)`;
      tearing = true;
    } else if (tearing) {
      viewCanvas.style.transform = '';
      tearing = false;
    }
  }

  function clear() {
    onset.antenna = -1;
    onset.camera = -1;
    onset.battery = -1;
    hide();
  }

  return { set, update, clear, level, deadSince, element: canvas };
}
