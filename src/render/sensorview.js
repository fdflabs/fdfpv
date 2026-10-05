/*
 * sensorview.js: the sensor's picture (docs/AVIONICS-SENSORS.md). What
 * the SensorManager (src/avionics/sensors.js) says the camera is looking
 * with, drawn: the main view in its mode, and the picture in the picture
 * in another, from the same camera.
 *
 * THREE SOURCES, EACH DRAWN AT MOST ONCE A FRAME, shared by whatever needs
 * them:
 *
 *   composed   the map's own post chain (its photographic or cel look),
 *              drawn into its composer's buffer instead of the screen;
 *   radiance   the scene's raw light, linear, at a sensor's resolution,
 *              with mipmaps, for the modes that need the light before
 *              any look is applied to it (low light) or its mipmaps
 *              (acquisition's local mean), and the inset's colour
 *              picture when the composer is not drawn;
 *   thermal    every surface's temperature (src/render/thermal.js), at a
 *              thermal core's resolution, with mipmaps.
 *
 * A main view in plain EO at 1x with stabilisation off is the composer to
 * the screen and nothing else, exactly as before this existed. A thermal
 * main view never draws the composer at all: its picture is the thermal
 * source, so it costs one scene draw at 640 pixels instead of the photo
 * chain's six full resolution passes.
 *
 * DIGITAL ZOOM IS A CROP. The source is drawn at its own resolution over
 * the camera's whole field and the view samples the middle 1/zoom of it,
 * so at 4x a 640 pixel thermal core puts 160 of its pixels across the
 * screen, interpolated, with the camera's sharpening ringing on the
 * edges, as a real one does: bigger, never sharper.
 *
 * STABILISATION IS ELECTRONIC. The view is drawn from a smoothed camera:
 * every output pixel's ray is turned by the rotation between the smoothed
 * and the real camera and looked up in the source the real camera drew,
 * with a margin cropped off so the turned picture never shows an edge.
 * It removes the shake (explosions, a hard landing) and lags a fast turn
 * by its time constant, as a gimbal less EIS does.
 *
 * GAIN. The low light and thermal pictures set their own gain from what
 * they see, as the cameras do: a 1x1 target per source keeps the mean
 * (and for thermal the spread, the most and the least) of an 8x8 grid of
 * the source's mipmaps, moved toward this frame's at the camera's pace.
 * The thermal picture's gain is a FLIR's on top of that: a histogram of
 * the frame and the plateau equalised curve it gives (THE THERMAL CORE'S
 * LOOK, below), with its palettes, noise and optics.
 *
 * THE INSET leaves the GPU through a pixel pack buffer and a fence, read a
 * frame or two later into a 2D canvas, so drawing it never waits on the
 * GPU. A frame whose previous inset is still in flight skips drawing a
 * new one: the inset's rate falls before the main view's does.
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
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { renderThermal, THERMAL, T_SCALE } from './thermal.js';

/* Sensor widths, pixels: an uncooled 640 core, a 1280 low light CMOS, and
 * the colour picture the inset draws when the composer is not drawn. */
const THERMAL_W = 640;
const LOWLIGHT_W = 1280;
const INSET_RADIANCE_W = 480;
/* The inset's own pixels at each size the pilot can pick (U), its
 * panel's 16:10. Small is the size it always had; the larger ones are
 * drawn at their own resolution, not stretched. */
export const INSET_SIZES = {
  small: [320, 200],
  medium: [480, 300],
  large: [640, 400],
};

/* Seconds for the gain to move most of the way to a new scene. */
const AGC_TAU = 0.6;

/*
 * THE THERMAL CORE'S LOOK, as a FLIR Boson or Tau class camera shows it.
 *
 * The gain is plateau histogram equalisation (FLIR's AGC): a histogram of
 * the frame's temperatures in HIST_BINS bins over a robust range (from
 * the mean less 3 sigma, or the least if higher, to the most or the mean
 * plus 4 sigma if higher, at least MIN_SPAN_K wide, so a flat scene's
 * noise is not stretched to full contrast), each bin clipped at PLATEAU times its even
 * share so a sky or a lake that fills half the frame does not take half
 * the grey levels, and raised to at least FLOOR of it so a range of
 * temperatures with nothing in it still takes some grey levels (a
 * camera's linear share), and the counts summed into the curve that maps
 * a temperature to a grey. Without the floor and the range's headroom
 * the warmest broad surface, Itaipu's reservoir at night, went nearly
 * white and the war's engine over it stood out by a sixth of the range
 * (scripts/sensor-check.js, night black hot: 0.160). The curve moves at the gain's pace. EQ_SHARE of
 * the picture is that curve and the rest a plain linear window (mean less
 * 2 sigma to mean plus 3), which keeps a hot thing's brightness telling
 * how hot it is. A manual span (setThermalSpan) replaces both with a
 * fixed linear window.
 *
 * The core: NETD about 50 mK (the temporal noise's standard deviation), a
 * fixed pattern that stays put on the core's own pixels (columns and
 * single pixels, what is left after the camera's flat field correction),
 * the optics' MTF (a little of the neighbouring pixels in each), and a
 * mild halo round anything far hotter than its surroundings, the lens's
 * scatter. Its palettes are FLIR's: white hot, black hot (its own mode),
 * ironbow and rainbow.
 */
const HIST_BINS = 128;
const HIST_GRID = [48, 27];
const PLATEAU = 2.5;
const FLOOR = 0.2;
const EQ_SHARE = 0.8;
const MIN_SPAN_K = 6;
export const THERMAL_PALETTES = ['whitehot', 'ironbow', 'rainbow'];
const look = { palette: 0, span: null };

/* The white hot mode's palette, a key of THERMAL_PALETTES. Black hot is a
 * mode of its own (ir_bh) and stays grey. */
export function setThermalPalette(name) {
  const k = THERMAL_PALETTES.indexOf(name);
  if (k < 0) {
    throw new Error(`sensorview: no thermal palette ${name}`);
  }
  look.palette = k;
}

/* A manual span, degrees C, lo to hi: the thermal picture a fixed linear
 * window, as a camera's manual gain. null hands the gain back to the AGC. */
export function setThermalSpan(lo, hi) {
  if (lo === null) {
    look.span = null;
    return;
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi - lo >= 0.5)) {
    throw new Error(`sensorview: a thermal span needs lo < hi by half a degree, not ${lo}..${hi}`);
  }
  look.span = [lo, hi];
}

export function thermalLook() {
  return { palette: THERMAL_PALETTES[look.palette], span: look.span ? [...look.span] : null };
}

const MODE_ID = {
  eo: 0, ir_wh: 1, ir_bh: 2, lowlight: 3, fusion: 4, contrast: 5,
};

/* Which sources a mode reads. EO and fusion take the composer as the
 * main view; the inset takes the radiance unless the composer was drawn
 * this frame. Low light and acquisition always take the radiance: one
 * needs the light before any look is applied, the other its mipmaps for
 * the local mean. */
const NEEDS = Object.fromEntries(Object.keys(MODE_ID).map((mode) => [mode, {
  eo: mode === 'eo' || mode === 'fusion',
  raw: mode === 'lowlight' || mode === 'contrast',
  thermal: mode === 'ir_wh' || mode === 'ir_bh' || mode === 'fusion',
}]));
const NEEDS_NOTHING = { eo: false, raw: false, thermal: false };

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const AGC_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform sampler2D tPrev;
  uniform float uLod;
  uniform float uBlend;
  void main() {
    float s1 = 0.0;
    float s2 = 0.0;
    float mx = -1e4;
    float mn = 1e4;
    for (int j = 0; j < 8; j++) {
      for (int i = 0; i < 8; i++) {
        vec2 uv = (vec2(float(i), float(j)) + 0.5) / 8.0;
        vec3 c = textureLod(tSrc, uv, uLod).rgb;
        #ifdef AGC_THERMAL
          float v = c.r * ${T_SCALE.toFixed(1)};
        #else
          float v = log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5));
        #endif
        s1 += v;
        s2 += v * v;
        mx = max(mx, v);
        mn = min(mn, v);
      }
    }
    float mean = s1 / 64.0;
    float sd = sqrt(max(s2 / 64.0 - mean * mean, 0.0));
    vec4 now = vec4(mean, sd, mx, mn);
    vec4 prev = texture2D(tPrev, vec2(0.5));
    gl_FragColor = mix(prev, now, uBlend);
  }
`;

/* The range the thermal histogram spans, from the gain stage's mean,
 * sigma, most and least. Its most and least are of an 8x8 grid of
 * blocks a mipmap has averaged, so a small hot thing never reaches its
 * most: the top of the range is at least 4 sigma over the mean, which
 * leaves grey levels over the scene's warmest bulk for what is hotter. */
const HIST_RANGE = /* glsl */ `
  vec2 histRange(vec4 a) {
    float lo = max(a.a, a.r - 3.0 * a.g);
    float hi = max(a.b, a.r + 4.0 * a.g);
    float mid = 0.5 * (lo + hi);
    float half_ = max(0.5 * (hi - lo), ${(MIN_SPAN_K / 2).toFixed(1)});
    return vec2(mid - half_, mid + half_);
  }
`;

/* One bin of the histogram per fragment: the share of a grid of the
 * source's samples that falls in it, the first bin taking all below the
 * range and the last all above. */
const HIST_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform sampler2D tAgc;
  uniform float uLod;
  ${HIST_RANGE}
  void main() {
    vec2 r = histRange(texture2D(tAgc, vec2(0.5)));
    float bin = floor(gl_FragCoord.x);
    float w = (r.y - r.x) / ${HIST_BINS.toFixed(1)};
    float lo = bin < 0.5 ? -1e9 : r.x + w * bin;
    float hi = bin > ${(HIST_BINS - 1.5).toFixed(1)} ? 1e9 : r.x + w * (bin + 1.0);
    float n = 0.0;
    for (int j = 0; j < ${HIST_GRID[1]}; j++) {
      for (int i = 0; i < ${HIST_GRID[0]}; i++) {
        vec2 uv = (vec2(float(i), float(j)) + 0.5) / vec2(${HIST_GRID[0].toFixed(1)}, ${HIST_GRID[1].toFixed(1)});
        float v = textureLod(tSrc, uv, uLod).r * ${T_SCALE.toFixed(1)};
        n += step(lo, v) * step(v, hi - 1e-6);
      }
    }
    gl_FragColor = vec4(n / ${(HIST_GRID[0] * HIST_GRID[1]).toFixed(1)}, 0.0, 0.0, 1.0);
  }
`;

/* The curve: each bin clipped at the plateau and raised to the floor,
 * summed up to this bin's top edge over the whole, moved toward the frame's at the gain's
 * pace. */
const CDF_FRAG = /* glsl */ `
  uniform sampler2D tHist;
  uniform sampler2D tPrev;
  uniform float uBlend;
  void main() {
    float bin = floor(gl_FragCoord.x);
    float cap = ${(PLATEAU / HIST_BINS).toFixed(6)};
    float upTo = 0.0;
    float all_ = 0.0;
    for (int k = 0; k < ${HIST_BINS}; k++) {
      float h = max(min(texelFetch(tHist, ivec2(k, 0), 0).r, cap), ${(FLOOR / HIST_BINS).toFixed(6)});
      all_ += h;
      upTo += float(k) <= bin ? h : 0.0;
    }
    float now = upTo / max(all_, 1e-6);
    gl_FragColor = vec4(mix(texelFetch(tPrev, ivec2(int(bin), 0), 0).r, now, uBlend), 0.0, 0.0, 1.0);
  }
`;

/* The view: one program per mode and source, by defines. */
const VIEW_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tThermal;
  uniform sampler2D tAgcC;
  uniform sampler2D tAgcT;
  uniform vec2 uTanHalf;
  uniform vec2 uOutScale;
  uniform float uZoom;
  uniform float uCrop;
  uniform mat3 uStab;
  uniform float uEv;
  uniform float uAuto;
  uniform float uFrame;
  uniform vec2 uColorTexel;
  uniform vec2 uThermalTexel;
  uniform float uSnow;
  uniform float uAirC;
  uniform sampler2D tCdf;
  uniform float uPalette;
  uniform vec3 uSpan;
  ${HIST_RANGE}

  /* FLIR's palettes from a grey 0..1, as display values. */
  vec3 ramp(float v, vec3 c[8]) {
    float x = clamp(v, 0.0, 1.0) * 7.0;
    int k = int(min(floor(x), 6.0));
    return mix(c[k], c[k + 1], x - float(k));
  }
  vec3 palette(float v) {
    if (uPalette < 0.5) {
      return vec3(v);
    }
    if (uPalette < 1.5) {
      /* Ironbow: black through indigo and magenta to orange and white. */
      vec3 iron[8] = vec3[8](vec3(0.0, 0.0, 0.0), vec3(0.13, 0.0, 0.36), vec3(0.42, 0.0, 0.6), vec3(0.72, 0.05, 0.5),
        vec3(0.9, 0.22, 0.2), vec3(0.98, 0.5, 0.02), vec3(1.0, 0.78, 0.12), vec3(1.0, 1.0, 0.86));
      return ramp(v, iron);
    }
    /* Rainbow: blue through cyan, green and yellow to red and white. */
    vec3 rain[8] = vec3[8](vec3(0.04, 0.0, 0.22), vec3(0.0, 0.1, 0.85), vec3(0.0, 0.62, 0.95), vec3(0.0, 0.8, 0.35),
      vec3(0.7, 0.9, 0.0), vec3(1.0, 0.6, 0.0), vec3(1.0, 0.12, 0.0), vec3(1.0, 0.9, 0.9));
    return ramp(v, rain);
  }

  /* The core's reading at a source place: the optics' spread over the
   * neighbouring pixels and the halo of anything far hotter round it. */
  float coreAt(vec2 suv) {
    vec2 t = uThermalTexel;
    float T = textureLod(tThermal, suv, 0.0).r;
    float nb = 0.25 * (textureLod(tThermal, suv + vec2(t.x, 0.0), 0.0).r + textureLod(tThermal, suv - vec2(t.x, 0.0), 0.0).r
      + textureLod(tThermal, suv + vec2(0.0, t.y), 0.0).r + textureLod(tThermal, suv - vec2(0.0, t.y), 0.0).r);
    T = mix(T, nb, 0.25) * ${T_SCALE.toFixed(1)};
    float around = textureLod(tThermal, suv, 3.0).r * ${T_SCALE.toFixed(1)};
    return T + 0.05 * max(around - T - 20.0, 0.0);
  }

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666667)) - 0.055, step(vec3(0.0031308), c));
  }
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  /* Narkowicz's ACES fit: a camera's shoulder for the raw light. */
  vec3 film(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  /* This output pixel's place in the source the real camera drew: the
   * ray of the smoothed, zoomed, cropped camera, turned into the real
   * one's frame. */
  vec2 srcUv(vec2 uv) {
    vec2 ndc = (uv * 2.0 - 1.0) * uOutScale;
    vec3 ray = uStab * vec3(ndc * uTanHalf / (uZoom * uCrop), -1.0);
    return (ray.xy / -ray.z) / uTanHalf * 0.5 + 0.5;
  }

  /* The auto exposure's gain on the raw light: toward a mid grey, but
   * no more than two stops over a sunlit scene's, which is as far as a
   * day camera's shutter and gain go. Past that a night stays dark. */
  float eoGain() {
    return uAuto > 0.5 ? clamp(0.18 / exp2(texture2D(tAgcC, vec2(0.5)).r), 0.25, 2.0) : 1.0;
  }

  /* The visible picture as display values, from either source. */
  vec3 eoAt(vec2 uv) {
    #ifdef SRC_COMPOSED
      vec3 c = texture2D(tColor, uv).rgb;
      if (uEv != 0.0) {
        c = toSrgb(film(fromSrgb(c) * exp2(uEv)));
      }
      return c;
    #else
      vec3 r = textureLod(tColor, uv, 0.0).rgb;
      return toSrgb(film(r * eoGain() * exp2(uEv)));
    #endif
  }

  void main() {
    vec2 suv = srcUv(vUv);
    /* Noise belongs to the sensor's pixels, not the screen's: a zoomed
     * picture's grain is as coarse as the crop. */
    #if MODE == 1 || MODE == 2 || MODE == 4
      vec2 texel = uThermalTexel;
    #else
      vec2 texel = uColorTexel;
    #endif
    vec2 g = floor(suv / texel) + fract(uFrame * vec2(0.61803, 0.41421)) * 517.0;
    float n = hash(g) + hash(g + 71.3) - 1.0;
    vec3 o;
    #if MODE == 0
      o = eoAt(suv);
      /* The camera's sharpening over an interpolated crop: an unsharp
       * mask that rings on edges and invents nothing. */
      if (uZoom > 1.0) {
        vec2 t = uColorTexel;
        vec3 b = 0.25 * (eoAt(suv + vec2(t.x, 0.0)) + eoAt(suv - vec2(t.x, 0.0)) + eoAt(suv + vec2(0.0, t.y)) + eoAt(suv - vec2(0.0, t.y)));
        o = clamp(o + (o - b) * 0.15 * (uZoom - 1.0), 0.0, 1.0);
      }
      #ifdef SRC_COMPOSED
        o += n * 0.006;
      #else
        o += n * 0.006 * sqrt(eoGain() * exp2(uEv));
      #endif
    #elif MODE == 3
      /* Amplified: the gain that brings the scene's mean to a mid grey,
       * shot noise that grows with it, the colour mostly gone to the
       * phosphor's, and the lamps blooming as they saturate. */
      vec4 agc = texture2D(tAgcC, vec2(0.5));
      float gain = clamp(0.2 / exp2(agc.r), 1.0, 600.0) * exp2(uEv);
      vec3 r = textureLod(tColor, suv, 0.0).rgb * gain;
      vec3 halo = (textureLod(tColor, suv, 3.0).rgb + textureLod(tColor, suv, 5.0).rgb) * 0.5 * gain;
      float L = lum(r) + max(lum(halo) - 0.9, 0.0) * 0.35;
      float sigma = clamp(0.035 * sqrt(gain) / (1.0 + 4.0 * L), 0.02, 0.22);
      L = max(L + n * sigma * 1.6 + (hash(g * 0.37 + uFrame) > 0.9995 ? 1.5 : 0.0) * min(gain / 200.0, 1.0), 0.0);
      float v = L / (1.0 + L);
      vec3 phosphor = vec3(0.86, 1.0, 0.9);
      vec3 tint = mix(vec3(v), r / max(lum(r), 1e-4) * v, 0.12);
      o = toSrgb(mix(tint, phosphor * v, 0.75) * 1.25);
      vec2 q = vUv - 0.5;
      o *= 1.0 - 0.45 * smoothstep(0.18, 0.5, dot(q, q));
    #elif MODE == 1 || MODE == 2 || MODE == 4
      /* The thermal core (THE THERMAL CORE'S LOOK above): its reading,
       * its noise (NETD, 0.12 of a triangular hash is 50 mK of standard
       * deviation) and its fixed pattern, then the gain: the equalised
       * curve over the robust range, a share of the linear window, mean
       * minus 2 sigma to mean plus 3, at least 6 C wide; or the manual
       * span. */
      vec4 agc = texture2D(tAgcT, vec2(0.5));
      float T = coreAt(suv);
      vec2 cell = floor(suv / uThermalTexel);
      float col = hash(vec2(cell.x, 7.0)) - 0.5;
      float fpn = hash(cell + 311.0) - 0.5;
      T += n * 0.12 + col * 0.1 + fpn * 0.08;
      float lo = agc.r - 2.0 * agc.g;
      float span = max(5.0 * agc.g, ${MIN_SPAN_K.toFixed(1)});
      float v = clamp((T - lo) / span, 0.0, 1.0);
      vec2 hr = histRange(agc);
      float u = clamp((T - hr.x) / (hr.y - hr.x), 0.0, 1.0);
      float eq = u * ${HIST_BINS.toFixed(1)} < 1.0 ? u * ${HIST_BINS.toFixed(1)} * texture2D(tCdf, vec2(0.5 / ${HIST_BINS.toFixed(1)}, 0.5)).r
        : texture2D(tCdf, vec2(u - 0.5 / ${HIST_BINS.toFixed(1)}, 0.5)).r;
      v = uSpan.z > 0.5 ? clamp((T - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0) : mix(v, eq, ${EQ_SHARE.toFixed(2)});
      #if MODE == 4
        /* Fusion: the visible picture, its colour drained a little, with
         * what is hot over it and the hot edges drawn. Hot is well over
         * the scene and well over the air both, so sunlit concrete in a
         * frame of water is not painted as a fire. */
        vec3 base = eoAt(suv);
        base = mix(vec3(lum(base)), base, 0.55);
        float hotAt = max(agc.r + 3.0 * agc.g, uAirC + 25.0);
        float hot = smoothstep(hotAt, hotAt + 20.0, T);
        vec2 t = uThermalTexel;
        float gx = textureLod(tThermal, suv + vec2(t.x, 0.0), 0.0).r - textureLod(tThermal, suv - vec2(t.x, 0.0), 0.0).r;
        float gy = textureLod(tThermal, suv + vec2(0.0, t.y), 0.0).r - textureLod(tThermal, suv - vec2(0.0, t.y), 0.0).r;
        float edge = smoothstep(0.04, 0.12, length(vec2(gx, gy)) * ${T_SCALE.toFixed(1)} / max(span, 1.0)) * smoothstep(hotAt, hotAt + 8.0, T);
        vec3 heat = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.95, 0.75), hot);
        o = mix(base, heat, max(hot * 0.85, edge * 0.9));
      #else
        #if MODE == 2
          o = vec3(1.0 - v);
        #else
          o = palette(v);
        #endif
      #endif
    #else
      /* Acquisition: grey, its local mean (the raw light's mipmap a
       * few levels down, some forty source pixels across) taken out and
       * the rest stretched, so a small dark or bright thing stands out of
       * any background. */
      float k = eoGain() * exp2(uEv);
      float L = lum(toSrgb(film(textureLod(tColor, suv, 0.0).rgb * k)));
      float m = lum(toSrgb(film(textureLod(tColor, suv, 5.0 - log2(uZoom)).rgb * k)));
      float v = clamp(0.5 + (L - m) * 2.2 + (L - 0.5) * 0.3, 0.0, 1.0);
      o = vec3(v) + n * 0.01;
    #endif
    if (uSnow > 0.0) {
      o = mix(o, vec3(hash(g * 1.7)), uSnow);
    }
    gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
  }
`;

function target(w, h, { mip = false, depth = true, float = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: depth,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: mip,
  });
  rt.texture.generateMipmaps = mip;
  return rt;
}

/* A 1x1 gain stage over a mipmapped source, ping ponged so it can move
 * toward each frame's at a pace. */
function makeAgc(thermal) {
  const opts = {
    type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  };
  const ping = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
  const mat = new THREE.ShaderMaterial({
    defines: thermal ? { AGC_THERMAL: '' } : {},
    uniforms: {
      tSrc: { value: null }, tPrev: { value: null }, uLod: { value: 3 }, uBlend: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: AGC_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  let cur = 0;
  let fresh = true;
  return {
    get texture() {
      return ping[cur].texture;
    },
    run(renderer, src, dtS) {
      const u = mat.uniforms;
      u.tSrc.value = src.texture;
      u.tPrev.value = ping[cur].texture;
      /* The mip whose 8x8 grid covers the source: each tap a block. */
      u.uLod.value = Math.max(0, Math.log2(src.width / 8) - 1);
      u.uBlend.value = fresh ? 1 : 1 - Math.exp(-Math.max(dtS, 0) / AGC_TAU);
      fresh = false;
      cur = 1 - cur;
      renderer.setRenderTarget(ping[cur]);
      quad.render(renderer);
    },
    reset() {
      fresh = true;
    },
    dispose() {
      ping.forEach((p) => p.dispose());
      mat.dispose();
    },
  };
}

/*
 * The thermal gain's curve (THE THERMAL CORE'S LOOK): a HIST_BINS by 1
 * histogram of the source, and the clipped cumulative curve over it,
 * ping ponged so it moves at the gain's pace. run() after the gain stage
 * has taken this frame's mean and range.
 */
function makeHist() {
  const opts = {
    type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
  };
  const hist = new THREE.WebGLRenderTarget(HIST_BINS, 1, { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const ping = [new THREE.WebGLRenderTarget(HIST_BINS, 1, opts), new THREE.WebGLRenderTarget(HIST_BINS, 1, opts)];
  const histMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, tAgc: { value: null }, uLod: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: HIST_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const cdfMat = new THREE.ShaderMaterial({
    uniforms: { tHist: { value: hist.texture }, tPrev: { value: null }, uBlend: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: CDF_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const histQuad = new FullScreenQuad(histMat);
  const cdfQuad = new FullScreenQuad(cdfMat);
  let cur = 0;
  let fresh = true;
  return {
    get texture() {
      return ping[cur].texture;
    },
    run(renderer, src, agc, dtS) {
      histMat.uniforms.tSrc.value = src.texture;
      histMat.uniforms.tAgc.value = agc;
      /* The mip whose texels are about the grid's cells. */
      histMat.uniforms.uLod.value = Math.max(0, Math.log2(src.width / HIST_GRID[0]));
      renderer.setRenderTarget(hist);
      histQuad.render(renderer);
      cdfMat.uniforms.tPrev.value = ping[cur].texture;
      cdfMat.uniforms.uBlend.value = fresh ? 1 : 1 - Math.exp(-Math.max(dtS, 0) / AGC_TAU);
      fresh = false;
      cur = 1 - cur;
      renderer.setRenderTarget(ping[cur]);
      cdfQuad.render(renderer);
    },
    reset() {
      fresh = true;
    },
    dispose() {
      hist.dispose();
      ping.forEach((p) => p.dispose());
      histMat.dispose();
      cdfMat.dispose();
    },
  };
}

/*
 * The inset's way out of the GPU when the copy below cannot take it: two
 * pixel pack buffers, each with a fence, read back when the fence has
 * passed. getBufferSubData is still a blocking round trip to Chrome's GPU
 * process, queued behind the frame before (docs/PERF.md). `draw` puts a
 * finished frame into the canvas.
 */
function makeReadback(gl, w, h, draw) {
  const bytes = w * h * 4;
  const slots = [0, 1].map(() => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    return { buf, sync: null };
  });
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const image = new ImageData(w, h);
  const pixels = new Uint8Array(image.data.buffer);
  let next = 0;
  return {
    /* A slot free to read into, or null while both are in flight. */
    free() {
      return slots[next].sync === null;
    },
    /* Read the bound framebuffer into the next slot. */
    read() {
      const s = slots[next];
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      s.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      next = 1 - next;
    },
    /* Every slot whose fence has passed, oldest first, into the canvas. */
    poll() {
      for (let k = 0; k < 2; k += 1) {
        const s = slots[(next + k) % 2];
        if (!s.sync || gl.getSyncParameter(s.sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
          continue;
        }
        gl.deleteSync(s.sync);
        s.sync = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        draw(image);
      }
    },
    dispose() {
      for (const s of slots) {
        if (s.sync) {
          gl.deleteSync(s.sync);
        }
        gl.deleteBuffer(s.buf);
      }
    },
  };
}

/*
 * The inset's other way out, GPU to GPU: the drawing buffer's corner is
 * set aside, the inset blitted into it, the 2D canvas draws that corner,
 * and the corner goes back, so the frame on screen is unchanged. No pixel
 * crosses to the main thread, so nothing waits on the GPU, and the inset
 * is the frame's own rather than one or two behind. Only while the
 * drawing buffer is at least the inset's size (a phone's may not be).
 * `done` runs once the canvas holds the frame.
 */
function makeCopy(gl, w, h, ctx2d, done) {
  const save = gl.createFramebuffer();
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, save);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const blit = (read, draw, flip) => {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
    gl.blitFramebuffer(0, 0, w, h, 0, flip ? h : 0, w, flip ? 0 : h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  };
  return {
    fits() {
      return gl.drawingBufferWidth >= w && gl.drawingBufferHeight >= h;
    },
    /* `src` holds the inset bottom up, as GL draws; the canvas wants it
     * top down, so the blit into the corner flips it. */
    copy(src) {
      blit(null, save, false);
      blit(src, null, true);
      ctx2d.drawImage(gl.canvas, 0, gl.drawingBufferHeight - h, w, h, 0, 0, w, h);
      blit(save, null, false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      done();
    },
    dispose() {
      gl.deleteFramebuffer(save);
      gl.deleteRenderbuffer(rb);
    },
  };
}

const IDENTITY3 = new THREE.Matrix3();

/*
 * The view for one renderer. frame() draws a frame: `main` and `pip` are
 * { mode, zoom, ev, auto, stab (a Matrix3, camera space, or null), crop,
 * snow }, pip null for no inset. Returns what it drew, for the cost
 * ledger: { sources: [...], scenes, inset }.
 */
export function createSensorView(renderer, { onInset } = {}) {
  const gl = renderer.getContext();
  const views = new Map();
  const agcC = makeAgc(false);
  const agcT = makeAgc(true);
  const histT = makeHist();
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d');
  const insetDrawn = () => {
    if (onInset) {
      onInset(ctx2d);
    }
  };
  const drawInset = (image) => {
    ctx2d.putImageData(image, 0, 0);
    insetDrawn();
  };
  let pipTarget = null;
  let readback = null;
  let copy = null;
  /* The inset's target, readback and canvas at w by h. A readback still
   * in flight is dropped with its buffers: its frame was the old size. */
  function insetSize(w, h) {
    if (pipTarget) {
      pipTarget.dispose();
      readback.dispose();
      copy.dispose();
    }
    pipTarget = target(w, h, { depth: false, float: false });
    canvas.width = w;
    canvas.height = h;
    readback = makeReadback(gl, w, h, drawInset);
    copy = makeCopy(gl, w, h, ctx2d, insetDrawn);
  }
  insetSize(...INSET_SIZES.small);
  let radiance = null;
  let thermal = null;
  let frameNo = 0;
  const size = new THREE.Vector2();
  const stats = {
    sources: [], scenes: 0, inset: false, insetsDrawn: 0,
  };

  function viewMat(mode, composed, flip) {
    const key = MODE_ID[mode] * 4 + (composed ? 2 : 0) + (flip ? 1 : 0);
    let v = views.get(key);
    if (!v) {
      const defines = { MODE: MODE_ID[mode] };
      if (composed) {
        defines.SRC_COMPOSED = '';
      }
      const mat = new THREE.ShaderMaterial({
        defines,
        uniforms: {
          tColor: { value: null },
          tThermal: { value: null },
          tAgcC: { value: null },
          tAgcT: { value: null },
          uTanHalf: { value: new THREE.Vector2(1, 1) },
          uOutScale: { value: new THREE.Vector2(1, flip ? -1 : 1) },
          uZoom: { value: 1 },
          uCrop: { value: 1 },
          uStab: { value: new THREE.Matrix3() },
          uEv: { value: 0 },
          uAuto: { value: 1 },
          uFrame: { value: 0 },
          uColorTexel: { value: new THREE.Vector2(1, 1) },
          uThermalTexel: { value: new THREE.Vector2(1, 1) },
          uSnow: { value: 0 },
          uAirC: { value: 25 },
          tCdf: { value: null },
          uPalette: { value: 0 },
          uSpan: { value: new THREE.Vector3() },
        },
        vertexShader: VERT,
        fragmentShader: VIEW_FRAG,
        depthTest: false,
        depthWrite: false,
      });
      v = { mat, quad: new FullScreenQuad(mat) };
      views.set(key, v);
    }
    return v;
  }

  function sized(rt, w, aspect, opts) {
    const h = Math.max(1, Math.round(w / aspect));
    if (!rt) {
      return target(w, h, opts);
    }
    if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h);
    }
    return rt;
  }

  /* One scene draw into `rt`, the shadow maps redrawn only by the frame's
   * first. A thermal draw skips the scene's own onBeforeRender, which is
   * the water's visible mirror (itaipu/water/index.js): water writes its
   * temperature over whatever the mirror would have given it, and the
   * mirror is a whole scene draw. */
  function drawScene(scene, camera, rt, isThermal) {
    const auto = renderer.shadowMap.autoUpdate;
    if (stats.scenes > 0) {
      renderer.shadowMap.autoUpdate = false;
    }
    try {
      if (isThermal) {
        const hook = scene.onBeforeRender;
        scene.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
        try {
          renderThermal(renderer, scene, camera, rt);
        } finally {
          scene.onBeforeRender = hook;
        }
      } else {
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
      }
    } finally {
      renderer.shadowMap.autoUpdate = auto;
    }
    stats.scenes += 1;
  }

  function setView(v, o, color, therm, camera, outAspect) {
    const u = v.mat.uniforms;
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    u.uTanHalf.value.set(th * camera.aspect, th);
    /* The inset's panel is narrower than the camera's frame: its sides
     * are cropped, never squeezed. */
    const sx = Math.min(1, outAspect / camera.aspect);
    u.uOutScale.value.x = sx;
    u.uOutScale.value.y = Math.sign(u.uOutScale.value.y) * Math.min(1, camera.aspect / outAspect);
    u.uZoom.value = o.zoom;
    u.uCrop.value = o.crop;
    u.uStab.value.copy(o.stab || IDENTITY3);
    u.uEv.value = o.ev;
    u.uAuto.value = o.auto ? 1 : 0;
    u.uFrame.value = frameNo % 4096;
    u.uSnow.value = o.snow;
    u.uAirC.value = THERMAL.env[1] * T_SCALE;
    u.tColor.value = color ? color.texture : null;
    u.uColorTexel.value.set(1 / (color ? color.width : 1), 1 / (color ? color.height : 1));
    u.tThermal.value = therm ? therm.texture : null;
    u.uThermalTexel.value.set(1 / (therm ? therm.width : 1), 1 / (therm ? therm.height : 1));
    u.tAgcC.value = agcC.texture;
    u.tAgcT.value = agcT.texture;
    u.tCdf.value = histT.texture;
    u.uPalette.value = look.palette;
    if (look.span) {
      u.uSpan.value.set(look.span[0], look.span[1], 1);
    } else {
      u.uSpan.value.z = 0;
    }
  }

  return {
    canvas,
    stats,
    /* The inset's pixels, w by h (one of INSET_SIZES). */
    setInsetSize(w, h) {
      if (w !== canvas.width || h !== canvas.height) {
        insetSize(w, h);
      }
    },
    /*
     * One frame. `post` is the map's post chain ({ render, composer }),
     * `scene` and `camera` the frame's. Draws the main view to the screen
     * and, when `pip` is given and a way out is free, the inset.
     */
    frame(scene, camera, post, main, pip, dtS) {
      frameNo += 1;
      stats.scenes = 0;
      stats.sources.length = 0;
      stats.inset = false;
      readback.poll();
      renderer.getDrawingBufferSize(size);
      const aspect = size.x / Math.max(1, size.y);
      const plain = main.mode === 'eo' && main.zoom === 1 && !main.stab && main.auto && main.ev === 0 && !main.snow;
      const mainNeeds = NEEDS[main.mode];
      const viaCopy = copy.fits();
      const insetDue = Boolean(pip) && (viaCopy || readback.free());
      const pipNeeds = insetDue ? NEEDS[pip.mode] : NEEDS_NOTHING;

      /* The composer, when the main view is a visible one: it is the
       * map's look and the pilot's picture. */
      let composed = null;
      if (mainNeeds.eo) {
        if (plain) {
          post.render();
        } else {
          post.composer.renderToScreen = false;
          try {
            post.render();
          } finally {
            post.composer.renderToScreen = true;
          }
          composed = post.composer.readBuffer;
        }
        stats.scenes += 1;
        stats.sources.push('composed');
      }
      /* The raw light, visible sources before thermal ones: the water's
       * mirror is drawn by a frame's first visible scene draw. */
      const radW = mainNeeds.raw ? LOWLIGHT_W : INSET_RADIANCE_W;
      if (mainNeeds.raw || pipNeeds.raw || (pipNeeds.eo && !composed)) {
        radiance = sized(radiance, radW, aspect, { mip: true });
        drawScene(scene, camera, radiance, false);
        agcC.run(renderer, radiance, dtS);
        stats.sources.push('radiance');
      }
      if (mainNeeds.thermal || pipNeeds.thermal) {
        thermal = sized(thermal, THERMAL_W, aspect, { mip: true });
        drawScene(scene, camera, thermal, true);
        agcT.run(renderer, thermal, dtS);
        histT.run(renderer, thermal, agcT.texture, dtS);
        stats.sources.push('thermal');
      }

      if (!plain) {
        const comp = Boolean(composed) && !NEEDS[main.mode].raw;
        const v = viewMat(main.mode, comp, false);
        setView(v, main, comp ? composed : radiance, thermal, camera, aspect);
        renderer.setRenderTarget(null);
        v.quad.render(renderer);
      }

      if (insetDue) {
        const comp = Boolean(composed) && !pipNeeds.raw;
        const v = viewMat(pip.mode, comp, true);
        setView(v, pip, comp ? composed : radiance, thermal, camera, canvas.width / canvas.height);
        renderer.setRenderTarget(pipTarget);
        v.quad.render(renderer);
        if (viaCopy) {
          renderer.setRenderTarget(null);
          copy.copy(renderer.properties.get(pipTarget).__webglFramebuffer);
        } else {
          readback.read();
          renderer.setRenderTarget(null);
        }
        stats.inset = true;
        stats.insetsDrawn += 1;
      }
    },
    reset() {
      agcC.reset();
      agcT.reset();
      histT.reset();
    },
    dispose() {
      for (const v of views.values()) {
        v.mat.dispose();
      }
      views.clear();
      agcC.dispose();
      agcT.dispose();
      histT.dispose();
      pipTarget.dispose();
      readback.dispose();
      copy.dispose();
      if (radiance) {
        radiance.dispose();
      }
      if (thermal) {
        thermal.dispose();
      }
    },
  };
}
