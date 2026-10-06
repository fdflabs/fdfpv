/*
 * budget.js: what one frame of the current view asks of the GPU, read off
 * the live renderer, scene and post chain rather than off a list kept by
 * hand.
 *
 * The hardware contract (a five year old mid range laptop, 1080p, 60 fps)
 * cannot be timed on a software rasteriser, so it is held as proxies that
 * can be counted anywhere: draw calls and triangles, passes drawn at full
 * resolution and the texture fetches each makes per pixel, render target
 * memory, shadow maps and vertex memory. The pass figures come from
 * watching one real frame, because only the frame knows which passes ran
 * and at what size.
 *
 * window.__budget (src/main.js) asks for a ledger on demand, for the
 * capture harness. The frame loop never calls this.
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

import * as THREE from 'three';
import { str } from '../strings/index.js';

/* Texel size is channels times bytes per channel. Anything not listed
 * counts as four one byte channels, the RGBA8 every default target is. */
const CHANNELS_OF = {
  [THREE.RedFormat]: 1,
  [THREE.RGFormat]: 2,
  [THREE.RGBAFormat]: 4,
  [THREE.DepthFormat]: 1,
  [THREE.DepthStencilFormat]: 1,
};
const BYTES_PER_CHANNEL = {
  [THREE.ByteType]: 1,
  [THREE.UnsignedByteType]: 1,
  [THREE.ShortType]: 2,
  [THREE.UnsignedShortType]: 2,
  [THREE.HalfFloatType]: 2,
  [THREE.IntType]: 4,
  [THREE.UnsignedIntType]: 4,
  [THREE.FloatType]: 4,
  [THREE.UnsignedInt248Type]: 4,
};

function texelSize(texture) {
  return (CHANNELS_OF[texture.format] ?? 4) * (BYTES_PER_CHANNEL[texture.type] ?? 1);
}

/*
 * Bytes a render target holds. Multisampled colour is the samples written
 * while rasterising plus the texture they resolve into, both resident: four
 * samples of RGBA16F at 1080p is five copies, the largest line a ledger
 * usually has. A depth buffer with no depth texture is DEPTH_COMPONENT24
 * or DEPTH24_STENCIL8 as three.js allocates it, four bytes a pixel either
 * way, per sample.
 */
function targetCost(rt) {
  const pixels = rt.width * rt.height;
  const samples = rt.samples > 1 ? rt.samples : 1;
  const colourCopies = samples > 1 ? samples + 1 : 1;
  let depth = 0;
  if (rt.depthTexture) {
    depth = pixels * texelSize(rt.depthTexture);
  } else if (rt.depthBuffer) {
    depth = pixels * 4 * samples;
  }
  return { samples, bytes: pixels * texelSize(rt.texture) * colourCopies + depth };
}

const FETCH = /\btexture(?:2D|Cube|2DProj|Lod|Grad)?\s*\(/g;
const FOR_LOOP = /\bfor\s*\(/g;
const FUNCTION_START = /\b(?:void|float|int|bool|u?vec[234]|mat[234])\s+(\w+)\s*\([^)]*\)\s*\{/g;

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

/* The text between a function's opening brace (just before `from`) and
 * the brace that closes it. */
function braceBody(code, from) {
  let depth = 1;
  let end = from;
  while (end < code.length && depth > 0) {
    const ch = code[end];
    depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
    end += 1;
  }
  return code.slice(from, end - 1);
}

/*
 * Texture fetches per output pixel of a fragment shader, which is the
 * dynamic count: a helper that fetches twice and is called three times
 * from main costs six, though the source shows two. Each function becomes
 * a node with its own fetches and its calls to the others, and main's total
 * is resolved down that graph. GLSL has no recursion, so the walk ends; a
 * cycle in a malformed source counts as nothing rather than hanging. A loop
 * repeats fetches this cannot count statically, so loops are reported
 * beside the figure instead of folded into it. Comments are dropped first,
 * because a fetch written in a comment costs nothing.
 */
function fetchesPerPixel(fragmentShader) {
  const code = String(fragmentShader || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const nodes = new Map();
  let loops = 0;
  for (const m of code.matchAll(FUNCTION_START)) {
    const body = braceBody(code, m.index + m[0].length);
    loops += count(body, FOR_LOOP);
    nodes.set(m[1], { body, own: count(body, FETCH) });
  }
  if (!nodes.has('main')) {
    return { taps: count(code, FETCH), loops };
  }
  for (const [name, node] of nodes) {
    node.calls = [];
    for (const callee of nodes.keys()) {
      if (callee === name || callee === 'main') {
        continue;
      }
      const n = count(node.body, new RegExp(`\\b${callee}\\s*\\(`, 'g'));
      if (n > 0) {
        node.calls.push([callee, n]);
      }
    }
  }
  const total = new Map();
  const open = new Set();
  const resolve = (name) => {
    if (total.has(name)) {
      return total.get(name);
    }
    if (open.has(name)) {
      return 0;
    }
    open.add(name);
    const node = nodes.get(name);
    const sum = node.calls.reduce((acc, [callee, n]) => acc + n * resolve(callee), node.own);
    open.delete(name);
    total.set(name, sum);
    return sum;
  };
  return { taps: resolve('main'), loops };
}

/*
 * Runs `draw` with the renderer's target binds and draws observed, and
 * hands back every draw (where it went, at what size, and for a full
 * screen quad, which is a Mesh passed as the scene, its fragment cost) and
 * every target bound. Watching the binds is what finds targets nobody
 * listed: three's shadow maps and the bloom mip chain among them. The
 * renderer's own methods, wrappers included, are put back afterwards.
 */
function observeFrame(renderer, draw) {
  const canvas = renderer.domElement;
  const draws = [];
  const bound = new Set();
  const bind = renderer.setRenderTarget;
  const render = renderer.render;
  let into = { target: null, w: canvas.width, h: canvas.height };
  renderer.setRenderTarget = function observedBind(rt, ...rest) {
    if (rt) {
      bound.add(rt);
      into = { target: rt, w: rt.width, h: rt.height };
    } else {
      into = { target: null, w: canvas.width, h: canvas.height };
    }
    return bind.call(renderer, rt, ...rest);
  };
  renderer.render = function observedRender(scene, camera) {
    const quad = scene.isMesh === true;
    const cost = quad ? fetchesPerPixel(scene.material.fragmentShader) : { taps: 0, loops: 0 };
    draws.push({
      ...into,
      quad,
      name: quad ? scene.material.name || scene.material.type : scene.type || 'scene',
      ...cost,
    });
    return render.call(renderer, scene, camera);
  };
  try {
    draw();
  } finally {
    renderer.setRenderTarget = bind;
    renderer.render = render;
  }
  return { draws, bound };
}

const megabytes = (bytes) => +(bytes / 1e6).toFixed(1);

/*
 * The ledger for one frame from where the camera is now. `shell` carries
 * the renderer, `view` the active map's scene and post chain: the maps
 * share one renderer, so the scene and passes must come from the view that
 * is up, not from whichever map built the renderer.
 */
export function measureBudget(shell, view, extra) {
  const { renderer } = shell;
  const { post, scene } = view;
  const canvasW = renderer.domElement.width;
  const canvasH = renderer.domElement.height;

  /* Calls and triangles are read from the same observed frame as the
   * passes, so every figure describes one frame. */
  renderer.info.reset();
  const frame = observeFrame(renderer, () => post.render());
  const fullRes = frame.draws.filter((d) => d.quad && d.w === canvasW && d.h === canvasH);

  /* Each target is named after the first thing drawn into it. The
   * composer's ping pong pair is always resident, bound this frame or not. */
  const firstDraw = new Map();
  for (const d of frame.draws) {
    if (d.target && !firstDraw.has(d.target)) {
      firstDraw.set(d.target, d.name);
    }
  }
  const resident = new Set(frame.bound);
  if (post.composer) {
    resident.add(post.composer.renderTarget1);
    resident.add(post.composer.renderTarget2);
  }

  const castsShadow = [];
  scene.traverse((o) => {
    if (o.isLight && o.castShadow) {
      castsShadow.push(o);
    }
  });
  /* A shadow map is sized by its light, not by the canvas, so it is the one
   * target that stays put when the 1080p figure is derived below. */
  const shadowMaps = new Set(castsShadow.map((l) => l.shadow && l.shadow.map).filter(Boolean));

  const targets = [];
  for (const rt of resident) {
    if (!rt) {
      continue;
    }
    const { samples, bytes } = targetCost(rt);
    targets.push({
      label: str('budget.x', { width: rt.width, height: rt.height, v3: firstDraw.get(rt) || str('budget.allocated_not_bound_this_frame') }),
      w: rt.width,
      h: rt.height,
      samples,
      bytes,
      scales: !shadowMaps.has(rt),
    });
  }

  /* The canvas is a target too, written every frame though it is never
   * passed to setRenderTarget. Its depth and stencil are whatever the
   * context actually granted, which a browser may exceed. */
  const gl = renderer.getContext();
  const granted = gl.getContextAttributes ? gl.getContextAttributes() : {};
  targets.push({
    label: str('budget.x_the_default_framebuffer_rgba', {
      canvasW,
      canvasH,
      v3: granted.depth ? str('budget.depth') : '',
      v4: granted.stencil ? str('budget.stencil') : '',
    }),
    w: canvasW,
    h: canvasH,
    samples: 1,
    bytes: canvasW * canvasH * (4 + (granted.stencil || granted.depth ? 4 : 0)),
    scales: true,
  });
  targets.sort((a, b) => b.bytes - a.bytes);
  const targetTotal = targets.reduce((sum, t) => sum + t.bytes, 0);

  /* Vertex memory counts each geometry once however many meshes draw it.
   * The heaviest geometries are listed with what decides whether they can
   * be skipped: the cull flag, and a bounding radius, since a merged mesh
   * spanning the world is never outside the frustum. */
  const seen = new Set();
  const listed = [];
  let meshes = 0;
  let attributeBytes = 0;
  let indexBytes = 0;
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) {
      return;
    }
    meshes += 1;
    const g = o.geometry;
    if (!g || seen.has(g.uuid)) {
      return;
    }
    seen.add(g.uuid);
    for (const attr of Object.values(g.attributes)) {
      attributeBytes += attr.array.byteLength;
    }
    if (g.index) {
      indexBytes += g.index.array.byteLength;
    }
    const position = g.attributes.position;
    if (!position) {
      return;
    }
    if (!g.boundingSphere) {
      g.computeBoundingSphere();
    }
    listed.push({
      material: o.material?.type || 'unknown',
      triangles: Math.round((g.index ? g.index.count : position.count) / 3),
      frustumCulled: Boolean(o.frustumCulled),
      boundsRadius: g.boundingSphere ? Math.round(g.boundingSphere.radius * 10) / 10 : -1,
    });
  });

  /* The contract is written for 1920 by 1080, so the lines that follow the
   * canvas are scaled to it and the shadow maps are not; scaling the whole
   * total overstates a 900p capture's 1080p figure by about an eighth. */
  const toFullHd = (1920 * 1080) / (canvasW * canvasH);
  const fullHdBytes = targets.reduce((sum, t) => sum + (t.scales === false ? t.bytes : t.bytes * toFullHd), 0);

  return {
    view: extra?.view || 'unnamed',
    canvas: { w: canvasW, h: canvasH, dpr: renderer.getPixelRatio() },
    p1_calls: renderer.info.render.calls,
    p2_triangles: renderer.info.render.triangles,
    p3_fullres_passes: fullRes.length,
    p4_fullres_taps: fullRes.reduce((sum, d) => sum + d.taps, 0),
    p4_fullres_loops: fullRes.reduce((sum, d) => sum + d.loops, 0),
    /* Megabytes and mebibytes both: the ceiling is written in MB, and
     * printing only one unit would let the flattering one pass for it. */
    p5_target_bytes: targetTotal,
    p5_target_MB: megabytes(targetTotal),
    p5_target_MiB: +(targetTotal / 1048576).toFixed(1),
    p5_target_MB_at_1080p: megabytes(fullHdBytes),
    p5_targets: targets,
    p9_shadow_maps: castsShadow.map((l) => ({
      light: l.type,
      size: `${l.shadow.mapSize.x}x${l.shadow.mapSize.y}`,
      allocated: Boolean(l.shadow && l.shadow.map),
    })),
    p10_attribute_bytes: attributeBytes,
    p10_attribute_MB: megabytes(attributeBytes),
    p10_index_bytes: indexBytes,
    meshes,
    geometries: seen.size,
    p2_top_meshes: listed.sort((a, b) => b.triangles - a.triangles).slice(0, 10),
    passes: frame.draws.map((d) => {
      const cost = d.quad ? ` taps=${d.taps}${d.loops ? ` loops=${d.loops}` : ''}` : '';
      return `${d.name} ${d.w}x${d.h}${cost}`;
    }),
  };
}
