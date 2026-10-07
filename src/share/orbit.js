/*
 * orbit.js: the page behind every world thumbnail (orbit.html), the title
 * screen's attract camera with nothing else around it.
 *
 * Map cards and the public board frame this page. The first time a world
 * is asked for, it builds that world, flies the title's camera round it
 * (with the airframe on the line), records one whole camera loop through
 * src/share/orbitcache.js and keeps it; every later visit just plays the
 * kept clip, with no WebGL, no world, no physics and no WASM.
 *
 * ?map= names the world. ?share= names a board course instead: the page
 * fetches it (without touching the pilot's share seat, so a board page of
 * cards can show many courses at once) and records the world it stands
 * in. The clip is the world's, the same one the Freestyle room shows; the
 * course's gates are not in it. A course drawn for the old race field has
 * no world, and the page says so.
 *
 * In a frame the page tells its parent: fdfpv-orbit-ready { map, cached,
 * key } once there is something to see, then fdfpv-orbit-clip { key, map,
 * mime, buffer } with the clip's bytes, which ui.js keeps. Checks read the
 * __orbit* flags on its window; ?capture=1 records even when a clip is
 * kept and leaves the recording's base64 in __orbitCapture.
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

import { mapById } from '../maps/registry.js';
import { isMapTrack } from '../trackbuilder/model.js';
import { CAMERA_FOV_DEFAULT } from '../render/lens.js';
import { fetchTrackDocument } from './board.js';
import { ghostToBase64 } from './ghostdata.js';
import { str } from '../strings/index.js';
import {
  CLIP_W,
  CLIP_H,
  clipKeyForMap,
  clipDurationMs,
  getClip,
  putClip,
  makeClipElement,
  recordCanvasStream,
  withCaptureLock,
  whenVisible,
} from './orbitcache.js';

const view = document.getElementById('view');
const statusLine = document.getElementById('status');
const query = new URLSearchParams(window.location.search);
const forceCapture = query.get('capture') === '1';

function say(text) {
  if (!statusLine) {
    return;
  }
  statusLine.textContent = text || '';
  statusLine.classList.toggle('gone', !text);
}

/* The world to record: the one a ?share= course stands in, else ?map=.
 * An id with no loader of its own (the Track seat, map=custom or
 * map=track, or an id no world has) records its home, the title's
 * valley. */
async function chosenWorld() {
  let mapId = query.get('map');
  const shareId = query.get('share');
  if (shareId) {
    const payload = await fetchTrackDocument(shareId);
    const course = payload.document || payload;
    if (!isMapTrack(course)) {
      throw new Error(str('orbit.no_world_for_this_track'));
    }
    document.title = payload.name || course.name || str('orbit.fdfpv_orbit');
    mapId = course.map;
  }
  const world = mapById(mapId);
  return world.load ? world.id : world.home;
}

const framed = window.parent !== window;

function tellParent(type, fields) {
  try {
    window.parent.postMessage({ type, ...fields }, '*');
  } catch (e) {
    /* No parent to tell. */
  }
}

async function handClipToParent(key, mapId, blob) {
  if (!framed) {
    return;
  }
  tellParent('fdfpv-orbit-clip', {
    key, map: mapId, mime: blob.type, buffer: await blob.arrayBuffer(),
  });
}

let shownUrl = null;

/* Put the clip on screen in place of the canvas (or a clip shown before). */
function show(blob) {
  say('');
  if (view) {
    view.remove();
  }
  document.body.querySelector('.orbit-clip')?.remove();
  if (shownUrl) {
    URL.revokeObjectURL(shownUrl);
  }
  const { node, url } = makeClipElement(blob, 'orbit-clip');
  shownUrl = url;
  /* Here the clip is the page's whole content, not a decoration. */
  node.removeAttribute('aria-hidden');
  document.body.append(node);
}

function markReady(mapId, extra = {}) {
  window.__orbitReady = true;
  window.__orbitMap = mapId;
  Object.assign(window, extra);
}

async function playKept(mapId, key, blob) {
  show(blob);
  markReady(mapId, { __orbitCached: true });
  tellParent('fdfpv-orbit-ready', { map: mapId, cached: true, key });
  await handClipToParent(key, mapId, blob);
}

/* The renderer at the clip's own size whatever the frame's size, the
 * canvas stretched over the frame. */
function fitToClip(shell, scene) {
  shell.renderer.setPixelRatio(1);
  shell.renderer.setSize(CLIP_W, CLIP_H, false);
  if (view) {
    view.style.width = '100%';
    view.style.height = '100%';
  }
  shell.camera.aspect = CLIP_W / CLIP_H;
  shell.camera.updateProjectionMatrix();
  if (scene && scene.post && scene.post.setSize) {
    scene.post.setSize(CLIP_W, CLIP_H);
  }
}

/* Shadow maps a thumbnail can afford. */
function cheapShadows(scene) {
  scene.scene?.traverse((obj) => {
    if (obj.isLight && obj.shadow && obj.shadow.mapSize) {
      obj.shadow.mapSize.set(512, 512);
    }
  });
}

/* Free the GPU now rather than whenever the frame goes. */
function dropRenderer(shell) {
  try {
    shell.renderer.dispose();
  } catch (e) {
    /* Already disposed. */
  }
  try {
    shell.renderer.getContext()?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) {
    /* Already lost. */
  }
}

const untilFrames = (counter, n) => new Promise((resolve) => {
  const look = () => (counter() > n ? resolve() : requestAnimationFrame(look));
  look();
});

async function captureWorld(mapId, key) {
  await import('three');
  const { buildShell } = await import('../render/shell.js');
  const { makeAttractCamera } = await import('../render/attract.js');
  const world = mapById(mapId);
  say(str('orbit.loading', { name: world.name }));

  const shell = buildShell(view, { pixelRatio: 1, powerPreference: 'low-power' });
  /* The lens the race is flown on, so a course in the clip looks like the
   * course a pilot flies. */
  shell.camera.fov = CAMERA_FOV_DEFAULT;
  shell.resize = () => {
    fitToClip(shell, null);
    return { w: CLIP_W, h: CLIP_H };
  };
  shell.resize();
  shell.camera.updateProjectionMatrix();

  const built = await world.load();
  const scene = await built.buildMap(shell, (fraction) => {
    /* Some builders name a phase without a fraction (src/maps/alps.js). */
    if (fraction !== undefined) {
      say(str('orbit.building_percent', { name: world.name, v2: Math.round(fraction * 100) }));
    }
  }, { quality: 'low' });
  fitToClip(shell, scene);
  cheapShadows(scene);
  shell.quad.visible = true;
  const camera = makeAttractCamera(scene);

  let running = true;
  const onResize = () => {
    if (running) {
      fitToClip(shell, scene);
      cheapShadows(scene);
    }
  };
  window.addEventListener('resize', onResize);

  /* The clip holds one whole camera loop, sped up when the loop is longer
   * than a clip may be: a slice of a long orbit, looped, jumps. */
  const periodMs = camera && camera.periodMs > 0 ? camera.periodMs : 0;
  const loopMs = clipDurationMs(periodMs);
  const speed = (periodMs || loopMs) / loopMs;

  const clock = {
    lastWall: performance.now(), cameraMs: 0, animCarry: 0, animMs: 0, windFrom: 0, frames: 0,
  };
  const restartClocks = () => {
    Object.assign(clock, { cameraMs: 0, animCarry: 0, animMs: 0, windFrom: performance.now() });
  };
  let rafId = 0;
  const drawFrame = (wall) => {
    if (!running) {
      return;
    }
    rafId = requestAnimationFrame(drawFrame);
    /* Clamped to [0, 100] ms. The first rAF time can be earlier than the
     * clock read during setup (the frame began before it), and a negative
     * step would start the recording behind zero; a long step is a hidden
     * tab coming back. */
    const step = Math.min(100, Math.max(0, wall - clock.lastWall));
    clock.lastWall = wall;
    clock.cameraMs += step * speed;
    camera.update(clock.cameraMs, shell.camera, { craft: shell.quad });
    if (shell.blades) {
      for (let m = 0; m < 4; m += 1) {
        shell.blades[m].rotation.y += 0.40 * (shell.propSpin ? shell.propSpin[m] : 1);
        shell.discs[m].rotation.y += 0.40;
      }
    }
    /* World animation advances in whole milliseconds, at most 100 a frame,
     * with the fraction carried. */
    clock.animCarry += step;
    const whole = Math.floor(clock.animCarry);
    clock.animCarry -= whole;
    clock.animMs += Math.min(whole, 100);
    scene.updateAnim(clock.animMs);
    scene.updateShadowFocus(shell.quad.position);
    scene.updateWind((clock.windFrom ? wall - clock.windFrom : wall) * 0.001, shell.quad.position, 0.85);
    scene.post.render();
    clock.frames += 1;
    window.__orbitFrames = clock.frames;
  };
  rafId = requestAnimationFrame(drawFrame);

  markReady(mapId, { __orbitLoopMs: loopMs });
  tellParent('fdfpv-orbit-ready', { map: mapId, cached: false, key });

  let clip;
  try {
    await whenVisible();
    /* Let the first frames settle (shader compiles, first shadow pass)
     * before the clock restarts at the loop's start. */
    await untilFrames(() => clock.frames, 8);
    restartClocks();
    camera.update(0, shell.camera, { craft: shell.quad });
    scene.updateAnim(0);
    scene.updateWind(0, shell.quad.position, 0.85);
    scene.post.render();
    clip = await recordCanvasStream(view, loopMs);
  } catch (e) {
    window.__orbitError = String(e.message || e);
    throw e;
  } finally {
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    try {
      scene.dispose();
    } catch (e) {
      /* Part of the graph may be gone already. */
    }
    dropRenderer(shell);
  }

  await putClip(key, clip);
  if (forceCapture) {
    window.__orbitCapture = ghostToBase64(new Uint8Array(await clip.arrayBuffer()));
    window.__orbitCaptureDone = true;
  }
  show(clip);
  await handClipToParent(key, mapId, clip);
}

async function start() {
  const mapId = await chosenWorld();
  const key = clipKeyForMap(mapId);
  const kept = forceCapture ? null : await getClip(key);
  if (kept) {
    await playKept(mapId, key, kept);
    return;
  }
  await withCaptureLock(async () => {
    /* Another frame may have recorded it while this one waited. */
    const keptMeanwhile = forceCapture ? null : await getClip(key);
    if (keptMeanwhile) {
      await playKept(mapId, key, keptMeanwhile);
      return;
    }
    await captureWorld(mapId, key);
  });
}

start().catch((e) => {
  say(e.message || str('orbit.the_preview_failed'));
  window.__orbitError = String(e.message || e);
  console.error(e);
});
