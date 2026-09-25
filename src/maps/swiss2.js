/*
 * swiss2.js: the Swiss valley, drawn to read as a photograph.
 *
 * The same valley as src/maps/alps.js, not a copy of it: the same
 * heightfield, village, road, strip, lake, stream, traffic and gondola,
 * built by the alps' own builders through alps.js's buildValley, in a
 * second style. The alps are cel shaded and inked; this is physically
 * based: photographed CC0 texture sets on every surface, a photographed
 * sky that also lights the valley, one sun with the shadows real light
 * makes, air that veils the far ridges blue, and a filmic curve instead
 * of a grade. None of it changes a thing the alps draw.
 *
 * The render style is the map's own business and nothing else's. The
 * renderer's session state is untouched (the post chain tone maps and
 * encodes itself, as the cel chain does); the scene, its lights, its
 * environment and its post chain are built here and freed on dispose.
 * The shell, the HUD and the other maps see a MapInstance like any other.
 *
 *   swiss2/assets.js     the photographs: texture arrays, surfaces, sky
 *   swiss2/ground.js     the terrain's splat, and its masks
 *   swiss2/light.js      the sun, its cascades and the mountains' shadow
 *   swiss2/look.js       the material every builder asks for, by name
 *   swiss2/post.js       occlusion, aerial perspective, the camera, AgX, FXAA
 *   swiss2/clouds.js     the low cloud in the valley, marched in the post chain
 *   swiss2/rock/         the carved rock on the walls' cliffs and faces
 *   swiss2/vegetation/   the forests, the boulders and the meadow
 *   swiss2/water/        the lake, the stream, the fall and its headwall
 *
 * Of nature.js's sections swiss2 keeps only what the vegetation and the
 * water do not draw: the jetty, the boats and the shore path, the reeds,
 * and the old snow in the hollows. The hiking paths the cel paint strokes
 * are gravel ribbons here.
 *
 * What the vegetation and the water are handed, and what this map owes
 * them (docs/SWISS2-ASSETS-VEG.md has their side): the scene, the
 * renderer, the quality preset, heightAt, the environment map, a seeded
 * rng each, the colliders, and the village's wall footprints so the
 * meadow keeps off the houses; the sun as the scene's first
 * DirectionalLight; and update(dtMs, camera) on both before every frame,
 * which updateWind does. The vegetation is planted after the village for
 * the footprints, and its trees' colliders go in before the broadphase
 * is built. Their materials are passed through lit() like everything
 * else, and the air is a post pass over depth, so the mountains' shadow,
 * the cascade and the haze reach them without either module knowing.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { buildValley } from './alps.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRng } from './alps/noise.js';
import {
  HALF, CELL, CELLS, terrainGeometry, groundPaths,
} from './alps/terrain.js';
import {
  natureSites, buildShore, buildReeds, buildDrifts,
} from './alps/nature.js';
import { ribbon } from './alps/ribbon.js';
import {
  loadTerrainArrays, loadSurface, loadSky, SURFACES, SKY_K, SKY_SPAN_DEG,
} from './swiss2/assets.js';
import {
  groundMasks, pathMask, groundMaterial, floorUnderTrees, wallUniform, wallMask, craftUniforms, craftFootprint,
} from './swiss2/ground.js';
import {
  sunDirection, makeSun, makeLit, bakeTerrainShadow, SUN_COLOR, SUN_IRRADIANCE,
} from './swiss2/light.js';
import { makePhotoLook, finishScene } from './swiss2/look.js';
import { buildPhotoComposer, AIR } from './swiss2/post.js';
import { makeClouds } from './swiss2/clouds.js';
import { buildVegetation } from './swiss2/vegetation/index.js';
import { buildWater } from './swiss2/water/index.js';
import { swissBuildings } from './swiss2/buildings/index.js';
import { swissVehicles } from './swiss2/vehicles/index.js';
import { buildProps } from './swiss2/props/index.js';
import { buildLakeside } from './swiss2/props/lakeside.js';
import { photoCraftLook } from './swiss2/craftlook.js';
import { buildPeople } from './swiss2/village/people.js';
import { buildCliffs, occupiedCells, trimGround } from './swiss2/rock/index.js';
import { valleyLayout } from './swiss2/vegetation/zones.js';

const CAMERA_FAR = 14000;

/*
 * The photographed sky as the backdrop: a sphere round the camera, as
 * the cel sky dome is, reading the equirect by the same mapping three
 * uses for the environment, so the clouds behind a ridge are the clouds
 * that light it. Radiance, not colour: the post chain exposes it with
 * everything else. The sun's disc is drawn on top, far brighter than the
 * photograph could store, for the bloom to find.
 */
function skyBackdrop(back, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uBack: { value: back },
      uInvK: { value: 1 / SKY_K },
      uSpan: { value: SKY_SPAN_DEG },
      uSun: { value: sunDir.clone() },
      uSunCol: { value: SUN_COLOR.clone().multiplyScalar(4000) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D uBack;
      uniform float uInvK;
      uniform float uSpan;
      uniform vec3 uSun;
      uniform vec3 uSunCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5;
        float elev = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
        float v = clamp((elev + (uSpan - 90.0)) / uSpan, 0.001, 0.999);
        vec3 c = texture2D(uBack, vec2(u, v)).rgb * uInvK;
        /* The sun, a quarter of a degree in radius. */
        float disc = smoothstep(0.99998, 0.999992, dot(d, uSun));
        gl_FragColor = vec4(c + uSunCol * disc, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  return sky;
}

/* A polyline cut into steps no longer than `step` metres, so a ribbon
 * laid on it follows the ground between its points instead of cutting
 * through the hill. */
function densify(points, step) {
  const out = [points[0]];
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1];
    const b = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let q = 1; q <= n; q += 1) {
      out.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  return out;
}

/*
 * The photographic style. A fresh one per build, because its look is
 * made from textures the build loads.
 */
function photoStyle() {
  const owned = [];
  const own = (t) => {
    owned.push(t);
    return t;
  };
  const sunDir = sunDirection();
  const style = {
    id: 'swiss2',
    name: () => str('registry.swiss2'),
    look: null,
    mats: null,
    async stage(shell, q) {
      const renderer = shell.renderer;
      const camera = shell.camera;
      renderer.shadowMap.enabled = q.shadows;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      /* Texture memory is the thing Low and Medium are short of: the
       * terrain's layers go up at half size there. */
      const layerPx = q.id === 'high' ? 1024 : 512;
      const [arrays, sky, ...sets] = await Promise.all([
        loadTerrainArrays(layerPx, aniso),
        loadSky(),
        ...SURFACES.map((n) => loadSurface(n, aniso)),
      ]);
      own(arrays.col);
      own(arrays.nrh);
      own(sky.back);
      const surfaces = {};
      SURFACES.forEach((n, k) => {
        surfaces[n] = sets[k];
        own(sets[k].col);
        own(sets[k].nrm);
        own(sets[k].arm);
      });

      const scene = new THREE.Scene();
      scene.background = AIR.haze.clone();
      scene.add(skyBackdrop(sky.back, sunDir));
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTarget = pmrem.fromEquirectangular(sky.env);
      pmrem.dispose();
      sky.env.dispose();
      scene.environment = envTarget.texture;
      camera.far = CAMERA_FAR;
      camera.updateProjectionMatrix();

      const sun = makeSun(scene, q, sunDir);
      style.clouds = makeClouds({
        sun: { direction: sunDir, color: SUN_COLOR, irradiance: SUN_IRRADIANCE },
        sky: AIR.haze,
        air: AIR,
      });
      const lit = makeLit(style.clouds);
      style.sunAt = lit.sun;
      style.lit = lit;
      const masks = { walls: wallUniform() };
      own(masks.walls.value);
      /* Where the flown craft rests, for the grass and ground under it. */
      const craft = craftUniforms();
      /* Seconds since the valley was first drawn, for the light on the
       * lake's bed. */
      const groundClock = { value: 0 };
      const ground = (opts) => groundMaterial({
        arrays, zones: masks.zones, path: masks.path, walls: masks.walls, lit, craft, clock: groundClock, ...opts,
      });
      const heights = { texture: { value: null }, grid: { value: new THREE.Vector3(HALF, CELL, CELLS + 1) } };
      style.look = makePhotoLook({ surfaces, ground, heights });
      style.look.buildings = swissBuildings(style.look);
      style.look.vehicles = swissVehicles();
      style.mats = style.look.village;
      const stage = {
        scene,
        renderer,
        quality: q,
        footprints: [],
        props: null,
        veg: null,
        water: null,
        lit,
        sunDir,
        sun,
        masks,
        craft,
        groundClock,
        heights,
        ground,
        envTarget,
        updateShadowFocus(target) {
          sun.update(target, camera);
        },
        /* After the scene graph's own dispose: the vegetation and the
         * water also own targets the graph cannot reach (the impostor
         * bake, the lake's mirror). */
        dispose() {
          if (stage.veg) {
            stage.veg.dispose();
          }
          if (stage.props) {
            stage.props.dispose();
          }
          if (stage.lakeside) {
            stage.lakeside.dispose();
          }
          if (stage.water) {
            stage.water.dispose();
          }
          if (stage.cliffs) {
            stage.cliffs.dispose();
          }
          envTarget.dispose();
          style.clouds.dispose();
          for (const t of owned) {
            t.dispose();
          }
          if (stage.shadowTarget) {
            stage.shadowTarget.dispose();
          }
        },
      };
      return stage;
    },
    /* The ground: the alps' own geometry under the splat. The masks are
     * made here because they need the field, and the materials asked for
     * later (the strip, the range beyond) share them. */
    ground(field, stage) {
      stage.masks.zones = groundMasks(field);
      stage.masks.path = pathMask();
      own(stage.masks.zones.zone1);
      own(stage.masks.zones.zone2);
      own(stage.masks.path);
      const mesh = new THREE.Mesh(terrainGeometry(field), stage.ground({}));
      mesh.receiveShadow = true;
      mesh.name = 'ground';
      stage.groundMesh = mesh;
      return mesh;
    },
    /* What nature.js still draws here, the water, and the note of every
     * wall the village is about to put up. The vegetation waits for
     * finish, when those walls exist. */
    async nature(ctx) {
      const { stage, scene, colliders } = ctx;
      /* The village's buildings, as the boxes their wall colliders are,
       * so the meadow can keep off them. The village adds them after this
       * returns; the colliders are this build's own object, so noting
       * them on the way in changes nothing else. */
      const addBox = colliders.addBox.bind(colliders);
      colliders.addBox = (kind, x0, y0, z0, x1, y1, z1) => {
        if (kind === 'wall') {
          stage.footprints.push({ minX: Math.min(x0, x1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxZ: Math.max(z0, z1) });
        }
        return addBox(kind, x0, y0, z0, x1, y1, z1);
      };
      const sites = natureSites(ctx);
      const had = new Set(scene.children);
      buildShore(ctx, sites);
      /* nature.js edges the north shore with a two metre gravel ribbon of
       * one width all the way round, which from the air is a line drawn
       * round the lake. The ground lays a beach there itself (ground.js),
       * so the ribbon goes; the jetty's short track stays. */
      for (const o of scene.children.filter((c) => !had.has(c) && c.isMesh)) {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        if (b.max.x - b.min.x > 100) {
          scene.remove(o);
          o.geometry.dispose();
        }
      }
      const reeds = buildReeds(ctx, sites);
      buildDrifts(ctx, sites);
      /* The hiking paths the cel paint strokes, as gravel ribbons on the
       * worn earth the ground already lays under them. */
      const pathMat = ctx.look.material('path', {});
      for (const line of groundPaths()) {
        scene.add(ribbon(densify(line, 3), 1.4, 0.05, ctx.heightAt, pathMat).mesh);
      }
      await ctx.paint(0.5);
      stage.water = await buildWater({
        scene,
        renderer: ctx.renderer,
        quality: ctx.quality,
        heightAt: ctx.heightAt,
        envMap: scene.environment,
      });
      scene.add(stage.water.group);
      await ctx.paint(0.56);
      const camera = ctx.camera;
      let last = null;
      let first = null;
      /* The shell calls updateWind every drawn frame, before it draws,
       * with the wall clock in seconds: the vegetation's and the water's
       * update(dtMs, camera) ride on it, and so do the clouds, from the
       * first frame drawn, so however long the build took the valley
       * starts under the same sky. */
      return {
        pines: 0,
        broadleaf: 0,
        reeds,
        updateWind(t) {
          const dtMs = last === null ? 0 : Math.max(0, (t - last) * 1000);
          last = t;
          first ??= t;
          stage.lit.setClock(t - first);
          style.clouds.setClock(t - first);
          stage.groundClock.value = t - first;
          if (stage.veg) {
            stage.veg.update(dtMs, camera);
            stage.props.update(camera);
          }
          if (stage.people) {
            stage.people.update(t - first, camera);
          }
          if (stage.cliffs) {
            /* Into the scene on the first frame, after the build's
             * renderer.compile: a BatchedMesh there when it runs cost
             * the page twelve GL_INVALID_VALUE warnings from Chrome
             * (glGetProgramiv, measured with a bare BatchedMesh too), and
             * one first drawn in a frame costs none. */
            if (!stage.cliffs.mesh.parent) {
              scene.add(stage.cliffs.mesh);
            }
            stage.cliffs.update(camera);
          }
          craftFootprint(style.shell && style.shell.quad, stage.craft);
          if (stage.lakeside) {
            stage.lakeside.update(dtMs);
          }
          stage.water.update(dtMs, camera);
        },
      };
    },
    /* After everything is placed: the forests, the mountains' shadow
     * (baked now that the range beyond exists), then metre uvs and the
     * light injection for every material in the scene, the vegetation's
     * and the water's included. The craft is added after this and is
     * not walked here: its cel materials are the session's, and it is
     * dressed apart, reversibly (craftlook.js, from compose). */
    async finish(scene, stage, { field, far, colliders, heightAt, nature }) {
      /* The huts, fences and bales before the forests, so the trees and
       * the meadow keep off the huts, whose wall colliders note them as
       * footprints; the houses noted before them are the gardens. */
      const gardens = stage.footprints.slice();
      /* The farm-low view's farm is walled after the gardens are taken
       * (swiss2/village/farm.js). */
      for (const b of style.look.buildings.farmWalls) {
        colliders.addBox('wall', ...b);
      }
      stage.props = buildProps({
        heightAt,
        rng: makeRng(20260930),
        colliders,
        footprints: gardens,
      });
      scene.add(stage.props.group);
      /* The lake's village, boats and promenade, their footprints the
       * map's before the forests keep off them (swiss2/props/lakeside.js). */
      stage.lakeside = buildLakeside({ heightAt, footprints: stage.footprints, path: style.look.material('path', {}) });
      scene.add(stage.lakeside.group);
      /* The lake draws the wake of the sailing boat on it. */
      stage.water.boat.value = stage.lakeside.boat;
      /* The carved rock on the walls, in place of the ground's own
       * triangles there, before the forests so nothing is planted on
       * ground the rock has moved, and never under anything already
       * standing on the ground (the paths, the stream, the fall, the
       * lift). */
      const layout = valleyLayout(heightAt, stage.footprints);
      const taken = occupiedCells(scene, heightAt, new Set([stage.groundMesh, far.mesh, scene.getObjectByName('sky')]));
      stage.cliffs = buildCliffs({ field, keep: (x, z) => layout.keepOff(x, z) || taken(x, z), material: stage.ground({ carved: 1 }) });
      trimGround(stage.groundMesh.geometry, stage.cliffs.mask);
      stage.veg = await buildVegetation({
        layout,
        carved: stage.cliffs.carved,
        scene,
        renderer: stage.renderer,
        quality: stage.quality,
        heightAt,
        envMap: scene.environment,
        rng: makeRng(20260928),
        colliders,
        footprints: stage.footprints,
        gardens,
        margins: stage.props.margins,
        sunDir: stage.sunDir,
        craft: stage.craft,
      });
      scene.add(stage.veg.group);
      nature.pines = stage.veg.stats.trees;
      floorUnderTrees(stage.masks.zones, stage.veg.forest);
      /* The villagers in the square, drawn the vehicles' way. */
      stage.people = buildPeople({ layout: style.look.buildings.layout, heightAt, material: style.look.vehicles.material });
      scene.add(stage.people.mesh);
      stage.masks.walls.value = own(wallMask(stage.footprints));
      const baked = bakeTerrainShadow(stage.renderer, field, far, stage.sunDir);
      stage.shadowTarget = baked.shadow;
      stage.heights.texture.value = own(baked.height);
      stage.lit.setShadow(stage.shadowTarget.texture);
      style.clouds.setTerrain(baked.height, stage.shadowTarget.texture);
      finishScene(scene, stage.lit);
    },
    compose(shell, map, q) {
      const post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, {
        direction: sunDir, color: SUN_COLOR, irradiance: SUN_IRRADIANCE, at: style.sunAt,
      }, style.clouds);
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
      /* The flown aircraft in the valley's materials, for as long as the
       * valley is seated; the cel craft comes back before the world goes. */
      shell.setCraftLook(photoCraftLook(style.lit));
      style.shell = shell;
      map.dispose = () => {
        shell.setCraftLook(null);
        post.dispose();
        sceneDispose();
      };
      return map;
    },
  };
  return style;
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const style = photoStyle();
  return style.compose(shell, await buildValley(shell, progress, q, style), q);
}
