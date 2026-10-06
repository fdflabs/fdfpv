/*
 * prewarm.js: decode a world's hidden photographs while it loads, not in
 * the frame that first shows them.
 *
 * three uploads a texture the first time a draw binds it, and a texture
 * made from an HTMLImageElement (THREE.TextureLoader) is decoded then
 * too, on the main thread. On Itaipu the trees' meshes are hidden until
 * the pilot comes within their range, so their bark's two 512 by 512
 * photographs were decoded and uploaded in flight, 6.6 to 7.6 and 3.6 to
 * 3.8 ms in the one frame the trees first came into view (docs/PERF.md
 * P6). The map calls this in its shaders phase, beside renderer.compile,
 * so that lands under the loading screen.
 *
 * Only photographs, and only those no visible mesh draws with:
 *
 * - a visible mesh's are uploaded by the first frame drawn, under the
 *   loading screen already, as they always were;
 * - a canvas, an ImageBitmap or a data texture has nothing to decode.
 *   Itaipu's foliage atlas, a 2048 by 2048 canvas on the same hidden
 *   trees, was measured: its upload cost 170 to 248 ms here at load and
 *   18 ms at its first draw in flight, so it is left to that draw.
 *
 * A map should call it only where its hidden meshes are shown later; a
 * photograph nothing ever draws would be decoded for nothing.
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

/* The photographs a material draws with: its own maps and its uniforms,
 * those an onBeforeCompile added among them (three keeps those with the
 * compiled program, so call this after renderer.compile). */
function photosOf(renderer, material, out) {
  const add = (v) => {
    if (v && v.isTexture && typeof HTMLImageElement !== 'undefined' && v.image instanceof HTMLImageElement) {
      out.add(v);
    }
  };
  Object.values(material).forEach(add);
  for (const u of [material.uniforms, renderer.properties.get(material).uniforms]) {
    if (u) {
      Object.values(u).forEach((x) => add(x && x.value));
    }
  }
}

/* Decode and upload the photographs the hidden meshes under `root` draw
 * with and no visible one does. Returns how many. */
export function decodeHiddenPhotos(renderer, root) {
  const shown = new Set();
  const hidden = new Set();
  const walk = (o, visible) => {
    const v = visible && o.visible;
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        photosOf(renderer, m, v ? shown : hidden);
      }
    }
    for (const c of o.children) {
      walk(c, v);
    }
  };
  walk(root, true);
  let n = 0;
  for (const t of hidden) {
    if (!shown.has(t)) {
      renderer.initTexture(t);
      n += 1;
    }
  }
  return n;
}
