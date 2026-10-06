/*
 * gpuinfo.js: which GPU this tab is drawing on, as the Settings row and
 * the preset detection need it.
 *
 * A page cannot list the machine's devices. It can only ask the WebGL
 * context it already has, and the WEBGL_debug_renderer_info extension
 * unmasks the renderer and vendor strings: the chip this tab draws on,
 * which on a dual GPU laptop is the one high-performance selected.
 *
 * Browsers may refuse. Firefox resisting fingerprinting, some Safari
 * builds and locked down Chromium answer "WebKit WebGL" or "Apple GPU";
 * the row then says the name is hidden rather than guessing one. Headless
 * Chrome and machines without a usable GPU answer SwiftShader, llvmpipe
 * or Microsoft Basic Render, a CPU rasteriser: the game boots on it and
 * runs badly, and the shell lowers the preset.
 *
 * Everything is read off the session's own renderer. Opening a second
 * context to ask would reserve a second slice of a GPU that the Steam
 * Deck does not have to spare.
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

import { str } from '../strings/index.js';

const CPU_RASTERISER = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|gdi generic|mesa offscreen|software rasterizer|cpu raster/i;

/*
 * Chips that share memory with the CPU, by name, since the name is all a
 * browser reveals. Medium is sized for a 2020 laptop iGPU (quality.js), so
 * a detected High on one of these comes down a step. Apple Silicon is left
 * out on purpose: an M series GPU holds the authored look. The words are
 * bounded so a discrete part sharing one ("Radeon RX 7900", "Arc A770")
 * does not match. A name is a heuristic, which is why it only ever lowers
 * a detected preset, never one the pilot chose.
 */
const SHARED_MEMORY_CHIPS = new RegExp([
  /intel\b[^,)]*\b(hd|uhd|iris|xe)\b/,
  /\b(hd|uhd) graphics\b/,
  /\biris\b/,
  /\bradeon\s*(\(tm\)\s*)?graphics\b/,
  /\bvega\b\s*\d/,
  /\bmali\b/,
  /\badreno\b/,
  /\bpowervr\b/,
  /\bvideocore\b/,
].map((part) => part.source).join('|'), 'i');

/* True when the renderer string names an integrated GPU. The shell lowers
 * a detected preset on it; scripts/quality-check.js pins it on real
 * strings. A CPU rasteriser is not a GPU of any kind. */
export function isIntegratedGpu(raw) {
  const text = String(raw || '');
  return text !== '' && !CPU_RASTERISER.test(text) && SHARED_MEMORY_CHIPS.test(text);
}

/*
 * ANGLE wraps the real renderer as "ANGLE (vendor, renderer, backend)",
 * where the renderer may itself contain commas, so the vendor ends at the
 * first ", " and the backend starts at the last.
 */
function angleRenderer(text) {
  const wrapped = /^ANGLE \(([\s\S]*)\)$/.exec(text);
  if (!wrapped) {
    return null;
  }
  const parts = wrapped[1].split(', ');
  if (parts.length === 1) {
    return parts[0];
  }
  const middle = parts.slice(1, parts.length > 2 ? -1 : undefined).join(', ');
  return middle || parts[0];
}

/* Driver and API decoration that says nothing about the chip, stripped in
 * this order: Metal's prefix, PCI ids, D3D shader models, GL and Vulkan
 * version strings, D3D driver versions. */
const DECORATION = [
  /^ANGLE Metal Renderer:\s*/i,
  /\s*\(0x[0-9a-fA-F]+\)/g,
  /\s*Direct3D1[12][^,]*/gi,
  /\s*vs_[0-9_]+(\s+ps_[0-9_]+)?/gi,
  /\s*ps_[0-9_]+/gi,
  /\s*OpenGL ES [0-9.]+.*/i,
  /\s*OpenGL [0-9.]+.*/i,
  /\s*Vulkan[^,]*/gi,
  /\s*D3D1[12][-0-9.]*/gi,
];

/* Mesa names the chip and then a parenthesised driver soup; a generation
 * tag in parentheses such as (KBL GT2) is worth keeping, the soup is not. */
const DRIVER_SOUP = /llvm|drm|radeonsi|navi|vangogh|pci/i;

export function tidyGpuName(raw) {
  if (!raw) {
    return '';
  }
  const text = String(raw).trim();
  const inner = angleRenderer(text);
  let name = DECORATION.reduce((s, noise) => s.replace(noise, ''), inner || text)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(NVIDIA|AMD|Intel|Apple|Qualcomm)\s+\1\s+/i, '$1 ');
  const paren = name.indexOf(' (');
  if (paren > 0 && DRIVER_SOUP.test(name.slice(paren))) {
    name = name.slice(0, paren).trim();
  }
  return name;
}

/* What a browser that will not name the chip answers instead. */
function isPlaceholder(name, raw) {
  if (!`${name || ''} ${raw || ''}`.trim()) {
    return true;
  }
  return /^(WebKit WebGL|WebGL|Mozilla|ANGLE)$/i.test(name) || /^Mozilla$/i.test(raw);
}

/* The renderer and vendor strings, unmasked when the browser allows it and
 * the masked pair otherwise. A browser that blocks the extension may throw
 * rather than return null. */
function rendererStrings(gl) {
  let raw = '';
  let vendor = '';
  try {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) {
      raw = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '';
      vendor = gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '';
    }
  } catch (e) {
    raw = '';
  }
  if (raw) {
    return { raw, vendor };
  }
  try {
    raw = gl.getParameter(gl.RENDERER) || '';
    vendor = vendor || gl.getParameter(gl.VENDOR) || '';
  } catch (e) {
    raw = '';
  }
  return { raw, vendor };
}

function describe(info) {
  const api = info.webgl2 ? str('gpuinfo.webgl_2') : 'WebGL';
  if (info.software) {
    return str('gpuinfo.is_running_on_the_cpu_not', { api, v2: info.raw || 'software rasteriser' });
  }
  if (info.hidden) {
    return str('gpuinfo.is_drawing_so_a_gpu_is', { api });
  }
  const key = /^Apple GPU$/i.test(info.name) ? 'gpuinfo.is_drawing_safari_hides_the_chip' : 'gpuinfo.is_drawing_on_this_gpu_on';
  return str(key, { name: info.name, api });
}

/*
 * `renderer` is the session's three.js WebGLRenderer or a bare WebGL
 * context. The result is shown in Settings and kept as window.__gpu;
 * `software` and `integrated` steer the detected preset and dynamic
 * resolution in src/main.js.
 */
export function readGpuInfo(renderer) {
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : renderer || null;
  const unusable = (note) => ({
    raw: '',
    integrated: false,
    vendor: '',
    name: '',
    display: 'Unknown',
    software: false,
    usable: false,
    webgl2: false,
    hidden: true,
    note,
  });
  if (!gl || typeof gl.getParameter !== 'function') {
    return unusable(str('gpuinfo.no_webgl_context_the_world_cannot'));
  }
  if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
    return unusable(str('gpuinfo.the_webgl_context_was_lost_reload'));
  }
  const { raw, vendor } = rendererStrings(gl);
  const name = tidyGpuName(raw) || tidyGpuName(vendor);
  const software = CPU_RASTERISER.test(raw) || CPU_RASTERISER.test(name);
  /* Integrated is reported beside software, not folded into it: an iGPU
   * draws, it is only short of fill rate and bandwidth, so the shell takes
   * it down one step where a CPU rasteriser goes all the way. */
  const hidden = !software && isPlaceholder(name, raw);
  let display = name || str('gpuinfo.gpu_in_use');
  if (software) {
    display = name ? str('gpuinfo.software', { name }) : str('gpuinfo.software_plain');
  } else if (hidden) {
    display = str('gpuinfo.hidden_by_this_browser');
  }
  const info = {
    raw,
    integrated: !software && (isIntegratedGpu(raw) || isIntegratedGpu(name)),
    vendor,
    name,
    display,
    software,
    usable: true,
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    hidden,
    note: '',
  };
  info.note = describe(info);
  return info;
}
