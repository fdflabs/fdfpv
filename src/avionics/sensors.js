/*
 * sensors.js: the SensorManager, the camera as a sensor (docs/AVIONICS-HUD.md
 * section 5, docs/AVIONICS-SENSORS.md): which mode it looks with, its zoom,
 * exposure, stabilisation, recording, the picture in the picture, and how
 * well the picture it gives lets a detector see (state.detect, what
 * PerceptionAI reads).
 *
 * The picture itself is src/render/sensorview.js's, and the temperatures
 * under the thermal modes src/render/thermal.js's. This file is the state
 * and the decisions: what the main view and the inset show, the smoothed
 * camera the stabilisation draws from, and the numbers a detector needs.
 *
 * Nothing here reaches the plant. The state moves on the sim clock (update),
 * the picture on the frame (render), and the stabilisation's smoothing is
 * the picture's, so it runs on the frame's clock too.
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

import * as THREE from 'three';
import { setWeather, setMotorHeat } from '../render/thermal.js';
import {
  createSensorView, INSET_SIZES, THERMAL_PALETTES, setThermalPalette,
} from '../render/sensorview.js';
import { BAND, DETECTOR_PX } from './bands.js';

export const SENSOR_MODES = ['eo', 'ir_wh', 'ir_bh', 'lowlight', 'fusion', 'contrast'];
export const ZOOM_LEVELS = [1, 2, 4];

/* The modes whose picture is thermal, in whole or in part. */
export function thermalMode(mode) {
  return mode === 'ir_wh' || mode === 'ir_bh' || mode === 'fusion';
}

/* Electronic stabilisation: the smoothed camera's time constant, seconds,
 * and the margin it crops so a turned picture never shows an edge. */
const STAB_TAU = 0.12;
const STAB_CROP = 1.08;

/* The visible light a camera has, day and night: by night the lamps and
 * the moon, about a twentieth of what a detector wants. */
const LIGHT = { day: 1, night: 0.06 };
const ZOOM_NOISE = 0.06;
/* How often the map's clock is read again, seconds: the sun moves over
 * minutes, so once a second is cheap and never late. */
const WEATHER_REREAD_S = 1;

const RED = '#ff3b30';

export function createSensorManager({ renderer = null, scene = () => null, camera = null } = {}) {
  const state = {
    mode: 'eo',
    zoom: 1,
    zoomLevels: ZOOM_LEVELS,
    fovRad: camera ? (camera.fov * Math.PI) / 180 : 1,
    exposure: { auto: true, ev: 0 },
    stab: true,
    rec: { on: false, s: 0 },
    pipMode: 'ir_wh',
    /* A mode the inset keeps whatever the main view's (the camera ball's
     * IR inset under an EO picture), or null: the inset shows the main
     * view's mode. With one set, the inset is drawn under a full screen
     * sensor too. */
    pipOverride: null,
    healthy: true,
    noise: 0,
    /* Additions to section 5.1, docs/AVIONICS-SENSORS.md sections 1 and 4.
     * mainView: 'eo', the pilot's own picture, the map's look at 1x, with
     * the sensor (mode, zoom, exposure, stabilisation) in the inset, as
     * the owner's reference has it; or 'sensor', the sensor full screen. */
    mainView: 'eo',
    /* The inset's size, a key of INSET_SIZES: the pilot's choice (U). */
    inset: 'small',
    /* White hot's palette, a key of THERMAL_PALETTES: the pilot's choice. */
    palette: THERMAL_PALETTES[0],
    timeOfDay: 'day',
    detect: {
      sensor: 'EO', pxPerRad: 0, light: 1, contrast: 0.75, quality: 0.7,
    },
  };
  let lastT = null;
  let snow = 0;
  let tracks = null;
  let weatherScene = null;
  let weatherWallS = 0;
  const view = renderer ? createSensorView(renderer, { onInset: drawBoxes }) : null;

  /* The smoothed camera the stabilisation draws from, and the rotation
   * from it to the real one, in the real camera's frame. */
  const smooth = new THREE.Quaternion();
  let smoothValid = false;
  let lastWall = null;
  const stabMat = new THREE.Matrix3();
  const qa = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const dir = new THREE.Vector3();

  /* The map's time of day and its sun, into the thermal model, when the
   * scene changes (maps swap scenes). Between changes the time of day is
   * read again once a second: the Interior's sun moves, and its scene's
   * userData.timeOfDay moves with it. */
  function weather() {
    const s = scene();
    if (!s) {
      return;
    }
    const wallS = performance.now() / 1000;
    if (s === weatherScene) {
      if (wallS - weatherWallS >= WEATHER_REREAD_S) {
        weatherWallS = wallS;
        state.timeOfDay = s.userData.timeOfDay === 'night' ? 'night' : 'day';
      }
      return;
    }
    weatherScene = s;
    weatherWallS = wallS;
    state.timeOfDay = s.userData.timeOfDay === 'night' ? 'night' : 'day';
    let sun = 1;
    s.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow) {
        sun = o.intensity;
      }
    });
    setWeather(state.timeOfDay, sun);
    if (view) {
      view.reset();
    }
    smoothValid = false;
  }

  function cropOf() {
    return state.stab ? STAB_CROP : 1;
  }

  function detect() {
    const b = BAND[state.mode];
    const k = state.timeOfDay === 'night' ? 1 : 0;
    const hfov = camera ? 2 * Math.atan(Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.aspect) : 1.6;
    const d = state.detect;
    d.sensor = b.tag;
    d.pxPerRad = Math.min(b.native, DETECTOR_PX * state.zoom) / (hfov / cropOf());
    d.light = b.light ? LIGHT[state.timeOfDay] : 1;
    d.contrast = b.contrast[k];
    state.noise = Math.min(1, b.noise[k] + ZOOM_NOISE * (state.zoom - 1) + snow);
    d.quality = state.healthy ? Math.min(1, d.light * 4) * d.contrast * (1 - state.noise) : 0;
  }

  /* Turn the smoothed camera toward the real one by the frame's share,
   * then hold it inside the crop's margin. */
  function stabilise(dt) {
    if (!state.stab || !camera) {
      stabMat.identity();
      smoothValid = false;
      return null;
    }
    if (!smoothValid) {
      smooth.copy(camera.quaternion);
      smoothValid = true;
    }
    smooth.slerp(camera.quaternion, 1 - Math.exp(-dt / STAB_TAU));
    const th = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const maxAngle = Math.atan(th * (1 - 1 / STAB_CROP)) * 0.9;
    const angle = smooth.angleTo(camera.quaternion);
    if (angle > maxAngle) {
      smooth.rotateTowards(camera.quaternion, angle - maxAngle);
    }
    /* Real from smoothed: q_real^-1 q_smooth, turning a ray of the
     * smoothed camera into the real camera's frame. */
    qa.copy(camera.quaternion).invert().multiply(smooth);
    stabMat.setFromMatrix4(m4.makeRotationFromQuaternion(qa));
    return stabMat;
  }

  /*
   * Where a world direction lands in a view of the camera: { x, y } in
   * that view's normalised device coordinates (-1..1, y up), or null
   * behind it. `view` 'main' is the screen's picture, 'pip' the inset's;
   * a view that shows the sensor is drawn through its zoom, crop and
   * smoothed camera, and a box belongs where the pilot sees the target,
   * not where the raw camera would put it. `aspect` is the view's width
   * over height (the camera's for the main view).
   */
  function project(losW, out = { x: 0, y: 0 }, aspect = camera ? camera.aspect : 1, which = 'main') {
    if (!camera) {
      return null;
    }
    const sensorView = which === 'pip' || state.mainView === 'sensor';
    const q = sensorView && state.stab && smoothValid ? smooth : camera.quaternion;
    dir.set(losW[0], losW[1], losW[2]).applyQuaternion(qa.copy(q).invert());
    if (dir.z >= -1e-6) {
      return null;
    }
    const th = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const k = sensorView ? state.zoom * cropOf() : 1;
    const sx = Math.min(1, aspect / camera.aspect);
    const sy = Math.min(1, camera.aspect / aspect);
    out.x = ((dir.x / -dir.z) * k) / (th * camera.aspect) / sx;
    out.y = ((dir.y / -dir.z) * k) / th / sy;
    return out;
  }

  /* The inset's track boxes (docs/AVIONICS-HUD.md section 8.1's grammar),
   * drawn over each inset frame as it arrives: the primary in corner
   * brackets, the rest as thin boxes, dashed under 0.6 confidence, dimmed
   * when stale, lost ones as faint dashed ghosts. */
  const at = { x: 0, y: 0 };
  function drawBoxes(g) {
    if (!tracks || !camera) {
      return;
    }
    const vfov = ((camera.fov * Math.PI) / 180) / (state.zoom * cropOf());
    const pipW = g.canvas.width;
    const pipH = g.canvas.height;
    const box = (t, ghost) => {
      if (!t.losW || !project(t.losW, at, pipW / pipH, 'pip')) {
        return;
      }
      /* On pixel centres, so a one pixel line is one pixel of red. */
      const x = Math.round((at.x * 0.5 + 0.5) * pipW) + 0.5;
      const y = Math.round((0.5 - at.y * 0.5) * pipH) + 0.5;
      if (x < -20 || x > pipW + 20 || y < -20 || y > pipH + 20) {
        return;
      }
      const conf = t.confidence ?? 0;
      const side = Math.max(10, ((t.sizeRad || 0) / vfov) * pipH * (2 - Math.min(1, conf)));
      const h = Math.round(side / 2);
      g.save();
      g.strokeStyle = RED;
      g.lineWidth = 1;
      g.globalAlpha = ghost ? 0.3 : (t.stale ? 0.45 : 1);
      g.setLineDash(ghost || conf < 0.6 ? [3, 3] : []);
      if (!ghost && t.id === tracks.primaryId) {
        const c = Math.max(3, h * 0.45);
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          g.moveTo(x + sx * h, y + sy * (h - c));
          g.lineTo(x + sx * h, y + sy * h);
          g.lineTo(x + sx * (h - c), y + sy * h);
        }
        g.stroke();
      } else {
        g.strokeRect(x - h, y - h, side, side);
      }
      g.restore();
    };
    for (const t of tracks.tracks || []) {
      box(t, false);
    }
    for (const t of tracks.lost || []) {
      box(t, true);
    }
  }

  const mainView = {
    mode: 'eo', zoom: 1, ev: 0, auto: true, stab: null, crop: 1, snow: 0,
  };
  const pipView = { ...mainView };
  const bothViews = [mainView, pipView];
  const PLAIN_EO = {
    mode: 'eo', zoom: 1, ev: 0, auto: true, stab: null, crop: 1,
  };

  const api = {
    state,
    pip: view ? view.canvas : null,
    /*
     * Every flight frame, after the camera is placed. `video` is
     * fpvfail's level ({ snow, lost }) when the shell has it: a lost
     * picture is an unhealthy sensor and its inset goes to snow.
     */
    update(tS, dtS, video = null) {
      weather();
      if (state.rec.on && lastT !== null && tS > lastT) {
        state.rec.s += tS - lastT;
      }
      lastT = tS;
      snow = video ? Math.min(1, Math.max(0, video.snow || 0)) : 0;
      state.healthy = !(video && video.lost);
      state.pipMode = state.pipOverride ?? state.mode;
      if (camera) {
        state.fovRad = (camera.fov * Math.PI) / 180 / (state.zoom * cropOf());
      }
      detect();
    },
    /*
     * Draw the frame: the main view in state.mode to the screen, and the
     * inset when it is due. The shell calls this in place of
     * post.render() while the Avionics HUD is up; `post` is the map's
     * post chain.
     */
    render(post) {
      if (!view || !camera) {
        post.render();
        return;
      }
      weather();
      const now = performance.now();
      const dt = lastWall === null ? 0 : Math.min(0.1, (now - lastWall) / 1000);
      lastWall = now;
      const stab = stabilise(dt);
      const s = scene();
      if (!s) {
        post.render();
        return;
      }
      for (const v of bothViews) {
        v.zoom = state.zoom;
        v.ev = state.exposure.auto ? 0 : state.exposure.ev;
        v.auto = state.exposure.auto;
        v.stab = stab;
        v.crop = cropOf();
      }
      pipView.mode = state.pipMode;
      mainView.mode = state.mode;
      if (state.mainView === 'eo') {
        /* The pilot's picture: exactly the map's own, the composer to
         * the screen. */
        Object.assign(mainView, PLAIN_EO);
      }
      pipView.snow = state.healthy ? snow : 1;
      /* Full screen, the inset would only repeat the main view: it is not
       * drawn, and the HUD hides its slot. */
      view.frame(s, camera, post, mainView, state.mainView === 'sensor' && !state.pipOverride ? null : pipView, dt);
    },
    project,
    setMode(mode) {
      if (!SENSOR_MODES.includes(mode)) {
        throw new Error(`sensors: no mode ${mode}`);
      }
      state.mode = mode;
      state.pipMode = mode;
      detect();
    },
    /* 'eo' (the pilot's picture, the sensor in the inset) or 'sensor'
     * (the sensor full screen). */
    setMainView(v) {
      if (v !== 'eo' && v !== 'sensor') {
        throw new Error(`sensors: no main view ${v}`);
      }
      state.mainView = v;
    },
    setInset(size) {
      if (!INSET_SIZES[size]) {
        throw new Error(`sensors: no inset size ${size}`);
      }
      state.inset = size;
      if (view) {
        view.setInsetSize(...INSET_SIZES[size]);
      }
    },
    setZoom(z) {
      if (!ZOOM_LEVELS.includes(z)) {
        throw new Error(`sensors: no zoom ${z}`);
      }
      state.zoom = z;
      detect();
    },
    /* A manual exposure in stops, or null for auto. */
    setExposure(ev) {
      state.exposure.auto = ev === null;
      state.exposure.ev = ev === null ? 0 : ev;
    },
    /* The inset's own mode, or null to follow the main view's. */
    setPipMode(mode) {
      if (mode !== null && !SENSOR_MODES.includes(mode)) {
        throw new Error(`sensors: no mode ${mode}`);
      }
      state.pipOverride = mode;
      state.pipMode = mode ?? state.mode;
    },
    setStab(on) {
      state.stab = Boolean(on);
    },
    /* TrackManager's snapshot (docs/AVIONICS-HUD.md section 7.1), for the
     * inset's boxes. Kept by reference: the snapshot is written in place. */
    setTracks(snapshot) {
      tracks = snapshot;
    },
    /* The own craft's hottest motor, C (FlightTelemetry's motors[].tempC),
     * for its motors in a thermal picture. */
    setMotorTemp(tempC) {
      setMotorHeat(tempC);
    },
    cycleMode() {
      api.setMode(SENSOR_MODES[(SENSOR_MODES.indexOf(state.mode) + 1) % SENSOR_MODES.length]);
    },
    setPalette(name) {
      if (!THERMAL_PALETTES.includes(name)) {
        throw new Error(`sensors: no thermal palette ${name}`);
      }
      state.palette = name;
      setThermalPalette(name);
    },
    cyclePalette() {
      api.setPalette(THERMAL_PALETTES[(THERMAL_PALETTES.indexOf(state.palette) + 1) % THERMAL_PALETTES.length]);
    },
    cycleZoom() {
      api.setZoom(ZOOM_LEVELS[(ZOOM_LEVELS.indexOf(state.zoom) + 1) % ZOOM_LEVELS.length]);
    },
    toggleRec() {
      state.rec.on = !state.rec.on;
      if (state.rec.on) {
        state.rec.s = 0;
      }
    },
    /* What the last render drew, for the checks and the cost ledger. */
    stats() {
      return view ? { ...view.stats } : null;
    },
    dispose() {
      if (view) {
        view.dispose();
      }
    },
  };
  detect();
  /* Harness only: the checks drive the sensor the shell made. */
  if (typeof window !== 'undefined') {
    window.__sensors = api;
  }
  return api;
}
