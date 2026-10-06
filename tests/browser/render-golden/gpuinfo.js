/*
 * render-golden/gpuinfo.js: src/render/gpuinfo.js on renderer strings as
 * browsers report them, and on contexts that answer in every way a real
 * one can (no context, a lost one, the debug extension present, absent or
 * throwing).
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

import { isIntegratedGpu, tidyGpuName, readGpuInfo } from '../../../src/render/gpuinfo.js';

/* Real strings first (Windows ANGLE over D3D, macOS over Metal, Linux
 * over GL, Vulkan and Mesa, phones, the software rasterisers, browsers
 * that hide the chip), then the shapes a parser can trip on. */
const NAMES = [
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) HD Graphics 520, D3D11)',
  'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D9Ex vs_3_0 ps_3_0, igdumdim64.dll)',
  'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics OpenGL Engine, OpenGL 4.1)',
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX Vega 8 Graphics, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.20903.8001)',
  'ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D12 vs_5_1 ps_5_1, D3D12)',
  'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060 Ti/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 595.45.04)',
  'ANGLE (NVIDIA, NVIDIA NVIDIA GeForce RTX 4070, Vulkan 1.3.277)',
  'ANGLE (NVIDIA, Vulkan 1.3.242 (NVIDIA NVIDIA GeForce RTX 3080 (0x00002206)), NVIDIA)',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'ANGLE (Google, SwiftShader Device (Subzero), SwiftShader driver)',
  'ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)',
  'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)',
  'ANGLE (AMD, AMD Radeon Graphics (renoir, LLVM 15.0.7, DRM 3.49, 6.1.0-18-amd64), OpenGL 4.6)',
  'ANGLE (AMD, AMD Custom GPU 0405 (vangogh, LLVM 15.0.7, DRM 3.54), OpenGL 4.6)',
  'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
  'Mesa Intel(R) Xe Graphics (TGL GT2)',
  'AMD Radeon RX 6800 (navi21, LLVM 15.0.7, DRM 3.49, 6.1.0)',
  'NVIDIA GeForce RTX 3060 Ti/PCIe/SSE2',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'softpipe',
  'lavapipe',
  'GDI Generic',
  'Mali-G78',
  'Mali-G715-Immortalis MC11',
  'Adreno (TM) 650',
  'Adreno (TM) 740',
  'PowerVR Rogue GE8320',
  'VideoCore IV HW',
  'V3D 4.2',
  'Apple GPU',
  'Apple M1',
  'WebKit WebGL',
  'WebGL',
  'Mozilla',
  'ANGLE',
  'ANGLE ()',
  'ANGLE (Intel)',
  'ANGLE (Intel, )',
  'ANGLE (A, B)',
  'ANGLE (A, B, C, D)',
  '  ANGLE (NVIDIA, NVIDIA GeForce GTX 980, D3D11)  ',
  'Intel Intel(R) HD Graphics 630',
  'NVIDIA NVIDIA GeForce GTX 970',
  'Qualcomm qualcomm Adreno 630',
  'Radeon (TM) Graphics',
  'AMD Radeon Vega 3 Graphics',
  'Vega10',
  'D3D11 only',
  'OpenGL ES 3.2',
  'Something (0xABCDEF) else',
  '',
  null,
  undefined,
  0,
  42,
];

/* Every chip in every wrapper a browser puts around one, so the cleanup
 * is pinned on combinations nobody listed by hand. */
const CHIPS = [
  ['Intel', 'Intel(R) UHD Graphics 770'],
  ['Intel', 'Intel(R) Iris(R) Xe Graphics'],
  ['Intel', 'Intel(R) Arc(TM) A380 Graphics'],
  ['AMD', 'AMD Radeon(TM) Graphics'],
  ['AMD', 'AMD Radeon RX 6700 XT'],
  ['AMD', 'AMD Radeon Vega 11 Graphics'],
  ['NVIDIA', 'NVIDIA GeForce RTX 2070 SUPER'],
  ['NVIDIA', 'NVIDIA GeForce MX350'],
  ['Apple', 'Apple M2 Max'],
  ['Qualcomm', 'Adreno (TM) 730'],
  ['ARM', 'Mali-G610 MC6'],
  ['Google', 'SwiftShader Device (Subzero)'],
];
const WRAPS = [
  (v, c) => `ANGLE (${v}, ${c} Direct3D11 vs_5_0 ps_5_0, D3D11)`,
  (v, c) => `ANGLE (${v}, ${c} (0x00001234) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
  (v, c) => `ANGLE (${v}, ${c} Direct3D12 vs_5_1 ps_5_1, D3D12-31.0.101.4502)`,
  (v, c) => `ANGLE (${v}, ${c}, OpenGL ES 3.2)`,
  (v, c) => `ANGLE (${v}, ${c} OpenGL 4.6.0 Core Profile, OpenGL 4.6)`,
  (v, c) => `ANGLE (${v}, Vulkan 1.3.260 (${c} (0x00005678)), ${v} driver)`,
  (v, c) => `ANGLE (${v}, ANGLE Metal Renderer: ${c}, Unspecified Version)`,
  (v, c) => `ANGLE (${v}, ${v} ${c}, D3D11)`,
  (v, c) => `${c} (LLVM 16.0.6, DRM 3.54, 6.5.0)`,
  (v, c) => `${c} (rembrandt, LLVM 16.0.6)`,
  (v, c) => `${c} (ADL-S GT1)`,
  (v, c) => `${v} ${c}`,
  (v, c) => `  ${c}   ps_5_0  `,
];
for (const [v, c] of CHIPS) {
  for (const wrap of WRAPS) {
    NAMES.push(wrap(v, c));
  }
}

/* A WebGL context that answers from a table. `debug` is the extension's
 * pair, or 'throws', or absent; `basic` is RENDERER and VENDOR. */
function fakeGl({ debug, basic = ['', ''], lost = false, webgl2 = false }) {
  const UNMASKED_VENDOR_WEBGL = 0x9245;
  const UNMASKED_RENDERER_WEBGL = 0x9246;
  const RENDERER = 0x1f01;
  const VENDOR = 0x1f00;
  const gl = webgl2 ? Object.create(WebGL2RenderingContext.prototype) : {};
  const values = {
    [RENDERER]: basic[0],
    [VENDOR]: basic[1],
    [UNMASKED_RENDERER_WEBGL]: debug && debug !== 'throws' ? debug[0] : undefined,
    [UNMASKED_VENDOR_WEBGL]: debug && debug !== 'throws' ? debug[1] : undefined,
  };
  Object.defineProperties(gl, {
    RENDERER: { value: RENDERER },
    VENDOR: { value: VENDOR },
    isContextLost: { value: () => lost },
    getExtension: {
      value: (name) => {
        if (name !== 'WEBGL_debug_renderer_info' || !debug) {
          return null;
        }
        if (debug === 'throws') {
          throw new Error('blocked');
        }
        return { UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL };
      },
    },
    getParameter: { value: (p) => values[p] },
  });
  return gl;
}

const CONTEXTS = {
  none: null,
  noGetParameter: {},
  lost: fakeGl({ lost: true, debug: ['NVIDIA GeForce RTX 3060', 'NVIDIA'] }),
  discrete: fakeGl({ debug: ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (NVIDIA)'], basic: ['WebKit WebGL', 'WebKit'] }),
  discrete2: fakeGl({ webgl2: true, debug: ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (NVIDIA)'] }),
  integrated: fakeGl({ webgl2: true, debug: ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (Intel)'] }),
  software: fakeGl({ webgl2: true, debug: ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'Google Inc. (Google)'] }),
  softwareBare: fakeGl({ debug: ['SwiftShader', ''] }),
  appleGpu: fakeGl({ webgl2: true, debug: ['Apple GPU', 'Apple Inc.'] }),
  hidden: fakeGl({ webgl2: true, basic: ['WebKit WebGL', 'WebKit'] }),
  hiddenMozilla: fakeGl({ basic: ['Mozilla', 'Mozilla'] }),
  nothing: fakeGl({}),
  vendorOnly: fakeGl({ debug: ['', 'Qualcomm'] }),
  debugThrows: fakeGl({ debug: 'throws', basic: ['Adreno (TM) 650', 'Qualcomm'] }),
  basicFallback: fakeGl({ basic: ['Mali-G78', 'ARM'] }),
  mesa: fakeGl({ debug: ['Mesa Intel(R) Xe Graphics (TGL GT2)', 'Intel'] }),
};

export function cases() {
  return {
    integrated: () => NAMES.map((n) => [String(n), isIntegratedGpu(n)]),
    tidy: () => NAMES.map((n) => [String(n), tidyGpuName(n)]),
    /* Through a renderer as the shell passes it, and as a raw context. */
    read: () => Object.fromEntries(Object.entries(CONTEXTS).map(([k, gl]) => [k, readGpuInfo(gl)])),
    readRenderer: () => readGpuInfo({ getContext: () => CONTEXTS.integrated }),
    readNothing: () => [readGpuInfo(), readGpuInfo(null), readGpuInfo(undefined)],
  };
}
