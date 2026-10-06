/*
 * render-golden-lib.js: plain JSON descriptions of three.js objects, for
 * the cases in tests/browser/render-golden/.
 *
 * A described object is its scene graph: every node's type, name,
 * transform and flags, its geometry's attributes as counts plus a hash of
 * their exact bytes, and its material's settings. Two builds that describe
 * the same are the same geometry to the bit and the same materials, which
 * is what a rewrite of a builder has to preserve. Random uuids and ids are
 * left out; shared objects are named by first appearance so sharing itself
 * is pinned.
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

/*
 * A picture as a golden value: a 2D canvas's pixels as PNG, which
 * scripts/render-golden.js compares pixel by pixel with a small tolerance.
 * Canvases made with willReadFrequently are drawn on the CPU, the same on
 * every machine.
 */
export function picture(canvas) {
  return { image: 'png', w: canvas.width, h: canvas.height, data: canvas.toDataURL('image/png') };
}

/* A CPU drawn 2D canvas of the given size, and its context. */
export function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

/* FNV-1a over the bytes of a typed array, as 8 hex digits. */
export function hashBytes(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const round = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) : v);
const vec = (v) => (v ? v.toArray().map(round) : null);

/* Interns objects (geometries, materials, textures) by first appearance. */
export function makeTable() {
  const seen = new Map();
  return (obj, prefix) => {
    if (!seen.has(obj)) {
      seen.set(obj, `${prefix}${seen.size}`);
      return [seen.get(obj), true];
    }
    return [seen.get(obj), false];
  };
}

export function describeGeometry(g, table) {
  if (!g) {
    return null;
  }
  const [ref, fresh] = table(g, 'g');
  if (!fresh) {
    return ref;
  }
  const attrs = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    attrs[name] = { n: a.count, size: a.itemSize, norm: a.normalized, type: a.array.constructor.name, hash: hashBytes(a.array), inst: Boolean(a.isInstancedBufferAttribute) };
  }
  return {
    ref,
    type: g.type,
    attrs,
    morph: Object.keys(g.morphAttributes || {}),
    index: g.index ? { n: g.index.count, type: g.index.array.constructor.name, hash: hashBytes(g.index.array) } : null,
    groups: g.groups.map((x) => [x.start, x.count, x.materialIndex]),
    drawRange: [g.drawRange.start, g.drawRange.count === Infinity ? 'all' : g.drawRange.count],
    userData: Object.keys(g.userData || {}).sort(),
  };
}

export function describeTexture(t, table) {
  if (!t) {
    return null;
  }
  const [ref, fresh] = table(t, 't');
  if (!fresh) {
    return ref;
  }
  const img = t.image;
  return {
    ref,
    type: t.constructor.name,
    size: img ? [img.width ?? null, img.height ?? null, img.depth ?? null] : null,
    data: img && img.data ? hashBytes(img.data) : null,
    wrap: [t.wrapS, t.wrapT],
    filter: [t.magFilter, t.minFilter],
    mips: t.generateMipmaps,
    format: t.format,
    dataType: t.type,
    colorSpace: t.colorSpace,
    repeat: vec(t.repeat),
    offset: vec(t.offset),
    flipY: t.flipY,
    anisotropy: t.anisotropy,
  };
}

const MATERIAL_KEYS = [
  'type', 'name', 'transparent', 'opacity', 'depthWrite', 'depthTest', 'side', 'fog', 'blending', 'vertexColors',
  'alphaTest', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'colorWrite', 'toneMapped', 'flatShading',
  'wireframe', 'roughness', 'metalness', 'emissiveIntensity', 'shininess', 'size', 'sizeAttenuation', 'linewidth',
  'dithering', 'premultipliedAlpha', 'visible', 'clipping', 'lights', 'stencilWrite', 'alphaToCoverage', 'rotation',
];
const COLOUR_KEYS = ['color', 'emissive', 'specular'];
const MAP_KEYS = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'gradientMap', 'bumpMap', 'envMap', 'lightMap', 'displacementMap', 'specularMap', 'matcap'];

export function describeMaterial(m, table) {
  if (!m) {
    return null;
  }
  if (Array.isArray(m)) {
    return m.map((x) => describeMaterial(x, table));
  }
  const [ref, fresh] = table(m, 'm');
  if (!fresh) {
    return ref;
  }
  const out = { ref };
  for (const k of MATERIAL_KEYS) {
    if (m[k] !== undefined) {
      out[k] = round(m[k]);
    }
  }
  for (const k of COLOUR_KEYS) {
    if (m[k] && m[k].isColor) {
      out[k] = m[k].getHexString();
    }
  }
  for (const k of MAP_KEYS) {
    if (m[k]) {
      out[k] = describeTexture(m[k], table);
    }
  }
  if (m.uniforms) {
    out.uniforms = Object.fromEntries(Object.keys(m.uniforms).sort().map((k) => [k, describeValue(m.uniforms[k].value, table)]));
  }
  if (m.defines) {
    out.defines = m.defines;
  }
  if (m.vertexShader !== undefined && m.type === 'ShaderMaterial') {
    out.vertexShader = hashText(m.vertexShader);
    out.fragmentShader = hashText(m.fragmentShader);
  }
  out.onBeforeCompile = m.onBeforeCompile !== m.constructor.prototype.onBeforeCompile;
  out.cacheKey = m.customProgramCacheKey !== m.constructor.prototype.customProgramCacheKey ? m.customProgramCacheKey() : null;
  out.userData = Object.keys(m.userData || {}).sort();
  return out;
}

export function hashText(s) {
  return hashBytes(new TextEncoder().encode(String(s)));
}

export function describeValue(v, table) {
  if (v === null || v === undefined || typeof v !== 'object') {
    return round(v);
  }
  if (v.isTexture) {
    return describeTexture(v, table);
  }
  if (v.isColor) {
    return `#${v.getHexString()}`;
  }
  if (typeof v.toArray === 'function') {
    return vec(v);
  }
  if (Array.isArray(v)) {
    return v.map((x) => describeValue(x, table));
  }
  return '[object]';
}

/* The whole graph under `root`. */
export function describeObject(root, table = makeTable()) {
  const node = (o) => {
    const out = {
      type: o.type,
      name: o.name,
      visible: o.visible,
      p: vec(o.position),
      q: vec(o.quaternion),
      s: vec(o.scale),
    };
    if (o.renderOrder) {
      out.renderOrder = o.renderOrder;
    }
    if (o.castShadow) {
      out.castShadow = true;
    }
    if (o.receiveShadow) {
      out.receiveShadow = true;
    }
    if (!o.frustumCulled) {
      out.frustumCulled = false;
    }
    if (o.matrixAutoUpdate === false) {
      out.matrixAutoUpdate = false;
    }
    if (o.layers.mask !== 1) {
      out.layers = o.layers.mask;
    }
    const ud = Object.keys(o.userData || {}).sort();
    if (ud.length) {
      out.userData = Object.fromEntries(ud.map((k) => [k, describeValue(o.userData[k], table)]));
    }
    if (o.geometry) {
      out.geometry = describeGeometry(o.geometry, table);
    }
    if (o.material) {
      out.material = describeMaterial(o.material, table);
    }
    if (o.isInstancedMesh) {
      out.instances = { n: o.count, matrices: hashBytes(o.instanceMatrix.array), colors: o.instanceColor ? hashBytes(o.instanceColor.array) : null };
    }
    if (o.isLight) {
      out.light = { color: o.color.getHexString(), intensity: round(o.intensity), distance: round(o.distance), decay: round(o.decay), angle: round(o.angle), penumbra: round(o.penumbra) };
    }
    if (o.onBeforeRender !== o.constructor.prototype.onBeforeRender) {
      out.onBeforeRender = true;
    }
    if (o.children.length) {
      out.children = o.children.map(node);
    }
    return out;
  };
  return node(root);
}
