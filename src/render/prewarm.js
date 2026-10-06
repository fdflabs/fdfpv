/*
 * prewarm.js: upload a world's hidden textures while it loads, not in the
 * frame that first shows them.
 *
 * three uploads a texture the first time a draw binds it, and a texture
 * made from an HTMLImageElement (THREE.TextureLoader) is decoded then
 * too, on the main thread. On Itaipu the trees' meshes are hidden until
 * the pilot comes within their range, so their bark's two 512 by 512
 * photographs were decoded and uploaded in flight, 6.6 to 7.6 and 3.6 to
 * 3.8 ms in the one frame the trees first came into view (docs/PERF.md
 * P6), and their foliage atlas, a 2048 by 2048 canvas and its eleven
 * mip levels, 18 to 25 ms in that frame (P8). The map calls this in its
 * shaders phase, beside renderer.compile, so that lands under the
 * loading screen.
 *
 * Photographs and canvases, and only those no visible mesh draws with:
 *
 * - a visible mesh's are uploaded by the first frame drawn, under the
 *   loading screen already, as they always were;
 * - a data texture's bytes are the map's own, small, and often written
 *   again before they are drawn.
 *
 * P6 measured the atlas at 170 to 248 ms at load and left it to its first
 * draw. That was the wait behind renderer.compile's programs, which the
 * upload queued after; called before the compile it costs its own 22 to
 * 26 ms, so a map calls this before its compile and again after it.
 *
 * A map should call it only where its hidden meshes are shown later; a
 * texture nothing ever draws would be uploaded for nothing.
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

/* What three would upload from a page element rather than the map's own
 * bytes: a photograph or a canvas. */
const fromElement = (image) => (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement)
  || (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement);

/* The textures a material draws with: its own maps and its uniforms,
 * those an onBeforeCompile added among them (three keeps those with the
 * compiled program, so call this after renderer.compile). */
function texturesOf(renderer, material, out) {
  const add = (v) => {
    if (v && v.isTexture && fromElement(v.image)) {
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

/* Upload the photographs and canvases the hidden meshes under `root` draw
 * with and no visible one does. Returns how many. */
export function uploadHiddenTextures(renderer, root) {
  const shown = new Set();
  const hidden = new Set();
  const walk = (o, visible) => {
    const v = visible && o.visible;
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        texturesOf(renderer, m, v ? shown : hidden);
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
