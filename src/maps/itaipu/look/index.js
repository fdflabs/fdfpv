/*
 * look/index.js: how Itaipu is drawn. swiss2's photographic style over
 * the terrain engine, src/maps/terrain/ (docs/ITAIPU-PLAN.md section 1,
 * point 5).
 *
 * From swiss2, unchanged and shared: the terrain photographs and the
 * surfaces (src/render/library/surfaces.js), the material kit every part is handed
 * (library/photolook.js makePhotoLook, as ctx.mats), the
 * sun's shadow cascades (library/sun.js makeSun, which takes its
 * direction), the post chain (maps/look/post.js: occlusion, aerial
 * perspective, the metered exposure, AgX, FXAA) and the photographed
 * craft (maps/look/craftlook.js).
 *
 * Itaipu's own: the sun, fixed to the satellite's, and the exposure
 * (light.js); the light injection, without the Alps' terrain shadow and
 * cloud deck, which are baked on the Alps' square (light.js says why); a
 * clear tropical sky, which is the environment too, and the air the post
 * chain is given (sky.js); and the ground, the satellite's colour with
 * swiss2's photographed grain under it (ground.js), finished where the
 * place asks for it: the canyon's basalt, the reservoir's margin and the
 * rockfill dam's faces; and the turf, blades of grass round a camera near
 * the ground (ground.js makeTurf).
 *
 * The low cloud swiss2 marches in its post chain is made and never handed
 * a terrain, so it draws nothing (clouds.js: until setTerrain, "the march
 * draws nothing"): the post chain takes one, and the day was clear.
 *
 * TIME OF DAY: `time`, makeLook's own option ('day', the default;
 * 'morning', 'noon' or 'golden', the other suns of light.js TIMES; or
 * 'night', for mission 4, "Night raid"), read from options.time when the
 * map is built (src/maps/itaipu.js buildMap) and from `?time=` in the
 * address (src/main.js loadMap). It never changes after the map is
 * built but in a war mission's ramp (below): night.js's fixtures go up
 * once, in buildMap, once every part is in. The other days move the sun, its colour and strength, the sky
 * and the air (light.js, sky.js); for whatever draws by the time of day
 * without being handed the look, every one of them is 'day'. What it touches: the sun (dim, cool, standing in for the moon) and
 * the sky (dark and starred, with the towns' glow, sky.js), both
 * light.js's; the lamps, the windows, the light pools every lit material
 * adds and the cities past the map (look/night.js), never the dam's, the
 * town's or the water's own geometry. setPower dims them district by
 * district as the war takes the grid down.
 *
 * A WAR MISSION'S LIGHT MOVES (TECH-NEEDS T1.11): built with `toward` as
 * well (src/main.js, from the room's clock's `to`: src/share/daytime.js
 * missionClock), the look stands at `time` and setLocalTime(hour) takes
 * it toward `toward` without a rebuild, as the room's clock moves (THE
 * RAMP, below).
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { loadSurface, SURFACES } from '../../../render/library/surfaces.js';
import { makeSun } from '../../../render/library/sun.js';
import { makePhotoLook, finishScene } from '../../../render/library/photolook.js';
import { buildPhotoComposer } from '../../look/post.js';
import { makeClouds } from '../../look/clouds.js';
import { photoCraftLook } from '../../look/craftlook.js';
import {
  sunDirection, sunFor, isNight, timeOf, makeNightAmbient, NIGHT_AMBIENT_INTENSITY,
} from './light.js';
import { makeLit } from '../../../render/library/lit.js';
import {
  skyBackdrop, skyEnvironment, airFor, bakeEnvironment, skyOf, gradeFor,
} from './sky.js';
import { TIME_HOUR, sunSinAt, isNightSun } from '../../../share/daytime.js';
import {
  groundMaterial, makeTurf, noiseTexture, loadImage, loadSite, loadGroundArrays,
} from './ground.js';
import { dressNight } from './night.js';
import { thermalKind, thermalShader } from '../../../render/thermal.js';

/* Past the horizon from 500 m (80 km) the apron and the fog have it. */
export const CAMERA_FAR = 90000;

/*
 * THE FAR SHADOW MAP IS SIZED TO THE VIEW. The library's makeSun (sun.js) keeps its far
 * map 700 m either side of a point ahead of the camera, which from the
 * craft is the whole shadowed world; from 600 m up (the aerial views) it
 * was a patch near the frame's foot, and the dam's buttresses, the
 * powerhouse and every tree past it cast no shadow at all, where in the
 * photographs from the air the dam's shaded side is the darkest thing in
 * the frame. Once FAR_REACH times the camera's height over the ground
 * passes swiss2's FAR_HALF (from 280 m up), that is the map's half width,
 * to FAR_HALF_MAX; its texel
 * grows with it, so a high view's shadows are softer, as they are at that
 * distance anyway, and its normal bias with the texel so the coarser map
 * does not shade the ground it is cast on.
 */
const FAR_HALF = 700;
const FAR_REACH = 2.5;
const FAR_HALF_MAX = 2500;
const FAR_NORMAL_BIAS = 0.6;
/*
 * A LOW SUN'S SHADOW MAPS ARE SQUASHED ALONG THE SUN. Each map is a square
 * in the light's frame; laid on the ground, its side across the sun's
 * azimuth stays its width, but its side along the azimuth stretches by
 * 1 / sin(elevation): 1.1 at the day's 65.8 degrees, 7.2 at the golden
 * hour's 8, where a 1.4 km map took in a strip 10 km long, every building
 * and tree in it a caster (yard-west drew 2.64 M triangles, over section
 * 13's 2.5 M, the near map 0.2 M of that and the far 0.12 M). Each map's
 * height in the light's frame is scaled by sin(elevation) over the
 * day's, so on the ground it covers what the day's does, and the day's,
 * a square, is unchanged. A caster up the sun's azimuth still throws its
 * long shadow in: the map's depth runs along the sun's ray. Its texel
 * along the azimuth is finer for it.
 */
const DAY_SUN_SIN = sunDirection('day').y;
/* Under this sine of the sun's elevation (about 17 degrees) the near
 * shadow map is put out and the far one, squashed as above, is the whole
 * sun: the town's and the canopy's meshes are drawn into every map whole
 * (they are not frustum culled), and at the golden hour's 8 degrees the
 * second map took yard-west over section 13 (2.64 M triangles). A low
 * sun's shadows are long and soft, which the far map's texel serves; the
 * near map's sharp contact shadow round the craft is what is given up.
 * With one map the cascade blend (light.js) has nothing to hand off. */
const LOW_SUN_ONE_MAP = 0.3;

/* A cascade's frame: `half` across the sun's azimuth, that times its
 * squash (above) along it. The library's makeSun (sun.js) snaps both axes to one texel,
 * so the finer of the two. */
function shape(light, half) {
  const up = half * light.userData.squash;
  const c = light.shadow.camera;
  c.left = -half;
  c.right = half;
  c.top = up;
  c.bottom = -up;
  c.updateProjectionMatrix();
  light.userData.half = half;
  light.userData.texel = (2 * up) / light.shadow.mapSize.x;
}

/*
 * THE RAMP, between two named times one of which is night: dusk into
 * dark (Lights Out, golden to night) or the dawn (The Long Night, night
 * to morning). How far along it the light is, `f`, is the sun's: its
 * sine at the hour (daytime.js sunSinAt, the room's clock's sun) between
 * its sine at the daylight time's hour and DARK_SIN, so the dark holds
 * through the small hours and the light comes with the sun. At f 0 every number is the
 * first time's and at 1 the second's, but one: the sun (or the moon)
 * stands where the daylight time's does all the way, its shadow maps
 * made once for it (updateShadowFocus), since a light swung across the
 * sky in mid flight reads as a fault, not an evening. So a ramp's night
 * has its moon low in the west after Lights Out's sunset, and the dawn's
 * night its moon where the morning's sun will rise.
 *
 * The sun's colour, the sky's zenith and haze, the air's glow and the print's
 * grade (sky.js gradeFor) are
 * mixed; its strength and the meter's target in stops (a geometric mix),
 * as a camera sees the dusk fall; the disc and the stars cross fade; the
 * sky's own fill at night (light.js) comes up with the dark; and the
 * environment is baked again each RAMP_ENV_STEP of f, a few times a
 * ramp. The towns' lights (night.js setNight) are switched by the sun,
 * not by f: on as it goes under, as street lamps' photocells do (LAMPS_ON).
 */
const RAMP_ENV_STEP = 0.05;
/* The grade that changes nothing, for a ramp's ungraded end (sky.js
 * gradeFor: the day and noon). */
const UNGRADED = Object.freeze({ saturation: 1, white: [1, 1, 1], lift: [0, 0, 0] });
/*
 * The sine of the sun's elevation at which the ramp's light is the
 * night's: 12 degrees under the horizon, the end of nautical twilight,
 * past which the sky gives no light a scene is lit by. The night's own
 * hour (TIME_HOUR.night, 22:00) has the sun 47 degrees under; ramped to
 * that, Lights Out's dusk at the sun 5 degrees under (18:36) still had a
 * third of the golden hour's sun on the dam and the cumulus lit white
 * over towns whose lamps were on, and its dark came only at the hold's
 * end. Now the dusk falls with the sun and the night holds after it.
 */
const DARK_SIN = Math.sin(THREE.MathUtils.degToRad(-12));
/* The sine of the sun's elevation over which the lamps come on, from
 * nothing to full: the sun 3 degrees up to 8.6 under, the civil dusk. */
const LAMPS_ON = [0.05, -0.15];

function rampOf(from, to) {
  if (isNight(from) === isNight(to)) {
    throw new Error(`itaipu look: a ramp is between night and a daylight time, got ${from} to ${to}`);
  }
  const h0 = TIME_HOUR[from];
  let h1 = TIME_HOUR[to];
  while (h1 <= h0) {
    h1 += 24;
  }
  const sine = (h, t) => (isNight(t) ? Math.max(sunSinAt(h), DARK_SIN) : sunSinAt(h));
  return {
    from, to, h0, h1, s0: sine(h0, from), s1: sine(h1, to), day: isNight(from) ? to : from,
  };
}

/* The light at f along `ramp`, into `out`. */
function rampLight(ramp, f, out) {
  const a = sunFor(ramp.from);
  const b = sunFor(ramp.to);
  const sa = skyOf(ramp.from);
  const sb = skyOf(ramp.to);
  const lin = (x, y) => x + (y - x) * f;
  const geo = (x, y) => x * (y / x) ** f;
  out.sun.lerpColors(a.color, b.color, f);
  out.irradiance = geo(a.irradiance, b.irradiance);
  out.zenith.lerpColors(sa.zenith, sb.zenith, f);
  out.haze.lerpColors(sa.air.haze, sb.air.haze, f);
  out.mie = lin(sa.air.mie, sb.air.mie);
  out.exposure = lin(sa.air.exposure, sb.air.exposure);
  out.key = geo(sa.air.meterKey, sb.air.meterKey);
  out.contrast = lin(sa.air.contrast, sb.air.contrast);
  out.disc = lin(sa.disc, sb.disc);
  out.stars = lin(sa.stars, sb.stars);
  out.envGain = lin(sa.envGain, sb.envGain);
  out.ambient = NIGHT_AMBIENT_INTENSITY * lin(sa.stars, sb.stars);
  const ga = gradeFor(ramp.from) ?? UNGRADED;
  const gb = gradeFor(ramp.to) ?? UNGRADED;
  out.saturation = lin(ga.saturation, gb.saturation);
  for (let k = 0; k < 3; k += 1) {
    out.white[k] = lin(ga.white[k], gb.white[k]);
    out.lift[k] = lin(ga.lift[k], gb.lift[k]);
  }
  return out;
}

/*
 * Load everything the look needs and make the scene it draws. `base` is
 * the data folder's URL. Returns the stage the map builds into.
 */
export async function makeLook({
  renderer, camera, q, base, manifest, time, toward = null, hour = null,
}) {
  const when = timeOf(time);
  const ramp = toward != null && timeOf(toward) !== when ? rampOf(when, timeOf(toward)) : null;
  /* A ramp through the night builds the night's fixtures, dark until the
   * dusk (setLocalTime). */
  const night = isNight(time) || Boolean(ramp);
  const sunLight = sunFor(time);
  /* A ramp compiles a grade whatever its ends, so it can move one. */
  const grade = gradeFor(time) ?? (ramp ? UNGRADED : null);
  const AIR = grade ? { ...airFor(time), grade } : airFor(time);
  const owned = [];
  const own = (t) => {
    owned.push(t);
    return t;
  };
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const layerPx = q.id === 'high' ? 1024 : 512;
  const im = manifest.imagery;
  const [arrays, site, heroCol, ringCol, heroMask, ringMask, ...sets] = await Promise.all([
    loadGroundArrays(layerPx, aniso),
    loadSite(base, manifest.frame.ring[1]),
    loadImage(`${base}${im.hero.file}`, true, aniso),
    loadImage(`${base}${im.ring.file}`, true, aniso),
    loadImage(`${base}${im.hero.masks}`, false, aniso),
    loadImage(`${base}${im.ring.masks}`, false, aniso),
    ...SURFACES.map((n) => loadSurface(n, aniso)),
  ]);
  for (const t of [arrays.col, arrays.nrh, site.reservoir, heroCol, ringCol, heroMask, ringMask]) {
    own(t);
  }
  const surfaces = {};
  SURFACES.forEach((n, k) => {
    surfaces[n] = sets[k];
    own(sets[k].col);
    own(sets[k].nrm);
    own(sets[k].arm);
  });

  const sunDir = sunDirection(ramp ? ramp.day : when);
  const scene = new THREE.Scene();
  /* For whatever draws by the time of day without being handed the look:
   * the sensor's thermal weather (src/avionics/sensors.js). */
  scene.userData.timeOfDay = isNight(when) ? 'night' : 'day';
  scene.userData.climate = 'itaipu';
  scene.background = AIR.haze.clone();
  const sky = skyBackdrop(sunDir, time);
  const envTarget = skyEnvironment(renderer, sky, when);
  scene.add(sky);
  scene.environment = envTarget.texture;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = makeSun(scene, q, sunDir, sunLight);
  const clouds = makeClouds({
    sun: { direction: sunDir, ...sunLight },
    sky: AIR.haze,
    air: AIR,
  });
  /* Night's own low sky fill (light.js): the day has none, the sky's
   * environment map already carries its share (the module doc, THE
   * LIGHT IS THIS SKY). */
  const nightAmbient = night ? makeNightAmbient() : null;
  if (nightAmbient) {
    scene.add(nightAmbient);
  }
  /* The ramp's light now (rampLight), what the glare reads each frame
   * (post.js PhotoPass.glare) and the environment's last bake. */
  const now = {
    sun: new THREE.Color(), zenith: new THREE.Color(), haze: new THREE.Color(), white: [1, 1, 1], lift: [0, 0, 0],
  };
  const sunState = { direction: sunDir, color: sunLight.color.clone(), irradiance: sunLight.irradiance };
  let envF = 0;
  let post = null;
  let meter = null;
  const lit = makeLit();
  const noise = own(noiseTexture(aniso));
  const ground = groundMaterial({
    tex: {
      heroCol, ringCol, heroMask, ringMask,
    },
    arrays,
    site,
    heroHalf: manifest.frame.hero[1],
    ringHalf: manifest.frame.ring[1],
    white: im.colour.white,
    water: im.colour.water,
    noise,
  });
  /* The ground's heights on the hero's 10 m grid, for the kit's walls,
   * which weather by their height over the ground (library/photolook.js
   * WEATHER_BODY): filled by setHeights once the terrain is in. */
  const heights = { texture: { value: null }, grid: { value: new THREE.Vector3() } };
  /* The blades round the camera (ground.js makeTurf), standing on those
   * heights: drawn once setHeights has them. */
  const turf = makeTurf({
    tex: { heroCol, heroMask },
    site,
    noise,
    heights,
    heroHalf: manifest.frame.hero[1],
    ringHalf: manifest.frame.ring[1],
    white: im.colour.white,
    renderer,
  });
  scene.add(turf.mesh);
  let groundAt = null;
  const look = makePhotoLook({
    surfaces,
    marks: {},
    ground: () => {
      throw new Error('itaipu look: the ground is the terrain\'s own material (look/ground.js), not a kit piece');
    },
    heights,
  });

  let nightFixtures = null;
  let rampF = 0;

  /* The ramp's light at f into everything that draws it. */
  function applyRamp(f) {
    rampLight(ramp, f, now);
    for (const l of sun.lights) {
      l.color.copy(now.sun);
      l.intensity = now.irradiance;
    }
    sunState.color.copy(now.sun);
    sunState.irradiance = now.irradiance;
    const su = sky.material.uniforms;
    su.uSunCol.value.copy(now.sun).multiplyScalar(now.irradiance);
    su.uZenith.value.copy(now.zenith);
    su.uHaze.value.copy(now.haze);
    su.uAirSun.value.copy(now.sun).multiplyScalar(now.mie);
    su.uDisc.value = now.disc;
    su.uStars.value = now.stars;
    scene.background.copy(now.haze);
    nightAmbient.intensity = now.ambient;
    if (Math.abs(f - envF) >= RAMP_ENV_STEP || (f !== envF && (f === 0 || f === 1))) {
      bakeEnvironment(renderer, sky, now.envGain, envTarget);
      envF = f;
    }
    if (post) {
      const g = post.grade.material.uniforms;
      g.uSunCol.value.copy(now.sun);
      g.uHaze.value.copy(now.haze);
      g.uMie.value = now.mie;
      g.uExposure.value = now.exposure;
      g.uKey.value = now.key;
      g.uContrast.value = now.contrast;
      g.uSaturation.value = now.saturation;
      g.uWhite.value.fromArray(now.white);
      g.uLift.value.fromArray(now.lift);
    }
    /* The meter's tap takes the air, not the sun's colour, which it
     * leaves white for every time (post.js MeterPass). */
    if (meter) {
      const m = meter.tapMat.uniforms;
      m.uHaze.value.copy(now.haze);
      m.uMie.value = now.mie;
    }
  }

  /* The hour on the room's clock (src/main.js daytimeFrame): f by the
   * sun's sine (THE RAMP), the night flag where daytime.js puts night,
   * and the lamps by the sun. */
  let lastHour = null;
  function setLocalTime(h) {
    lastHour = h;
    const s = sunSinAt(h);
    const f = Math.min(1, Math.max(0, (ramp.s0 - s) / (ramp.s0 - ramp.s1)));
    scene.userData.timeOfDay = isNightSun(s) ? 'night' : 'day';
    if (nightFixtures) {
      nightFixtures.setNight(THREE.MathUtils.smoothstep(-s, -LAMPS_ON[0], -LAMPS_ON[1]));
    }
    if (f !== rampF) {
      rampF = f;
      applyRamp(f);
    }
  }
  const builtHour = ramp ? (Number.isFinite(hour) ? hour : ramp.h0) : null;
  if (ramp) {
    rampF = -1;
    setLocalTime(builtHour);
  }

  return {
    scene,
    sun,
    sunDir,
    lit,
    ground,
    time: when,
    /* A ramp's: the two times it spans, the hour it was built at, and
     * the hour's light (THE RAMP); null and absent otherwise. */
    span: ramp ? [ramp.from, ramp.to] : null,
    builtHour,
    ...(ramp ? { setLocalTime } : {}),
    /* Mission 4's own fixtures, once every part is in (itaipu.js, after
     * the parts loop): a no-op by day. See look/night.js. The ground's
     * material is lit too, though no terrain chunk may be in the scene's
     * graph yet. */
    dressNight(extras) {
      if (!night) {
        return;
      }
      nightFixtures = dressNight({
        scene, heights, materials: [ground], ...extras,
      });
      if (ramp) {
        setLocalTime(lastHour);
      }
    },
    /* Each power district's level (src/share/war/grid.js), from the
     * room's war: the night's lights dim with them. Nothing by day. */
    setPower(levels) {
      if (nightFixtures) {
        nightFixtures.setPower(levels);
      }
    },
    night: () => nightFixtures,
    /* ctx.mats: the photographic kit, the light every material goes
     * through, the surfaces' texture sets and the environment. */
    mats: {
      look,
      lit,
      surfaces,
      envMap: scene.environment,
      thermal: { kind: thermalKind, shader: thermalShader },
    },
    /* `height(x, z)` over the square [-half, half] at `cell` metres. */
    setHeights(height, half, cell) {
      const n = Math.round((2 * half) / cell) + 1;
      const data = new Float32Array(n * n);
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          data[j * n + i] = height(-half + i * cell, -half + j * cell);
        }
      }
      const t = own(new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType));
      t.needsUpdate = true;
      heights.texture.value = t;
      heights.grid.value.set(half, cell, n);
      groundAt = height;
    },
    /* Every material in the scene through the light, and the kit's
     * textured meshes their metre uvs: once, after every part is in. */
    finish() {
      finishScene(scene, lit);
    },
    updateShadowFocus(target) {
      const [near, far] = sun.lights;
      if (near.userData.squash === undefined) {
        near.userData.squash = Math.min(1, sunDir.y / DAY_SUN_SIN);
        if (near.userData.squash < 1) {
          shape(near, near.userData.half);
        }
        /* A sun this low has the far map alone (LOW_SUN_ONE_MAP). */
        if (far && sunDir.y < LOW_SUN_ONE_MAP) {
          near.visible = false;
        }
      }
      if (far && groundAt) {
        const over = camera.position.y - groundAt(camera.position.x, camera.position.z);
        const half = THREE.MathUtils.clamp(over * FAR_REACH, FAR_HALF, FAR_HALF_MAX);
        far.userData.squash = near.userData.squash;
        const c = far.shadow.camera;
        if (Math.abs(half - c.right) > 25 || Math.abs(half * far.userData.squash - c.top) > 25) {
          shape(far, half);
          far.shadow.normalBias = FAR_NORMAL_BIAS * (half / FAR_HALF);
        }
      }
      sun.update(target, camera);
      sky.updateCube(renderer, camera);
      turf.update(camera, groundAt);
    },
    /* The post chain and the photographed craft, onto a built map. */
    compose(shell, map) {
      sunState.at = lit.sun;
      post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, ramp ? sunState : {
        direction: sunDir, ...sunLight, at: lit.sun,
      }, clouds, AIR);
      if (ramp) {
        meter = post.composer.passes.find((p) => p.tapMat) || null;
        applyRamp(rampF);
      }
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
      /* Rain thickens the air (src/main.js rainFrame, maps/look/post.js setWet). */
      map.setWet = post.setWet;
      /* The post chain that draws this scene, for the sensor checks,
       * which route a frame through the SensorManager with it
       * (scripts/sensor-check.js). */
      map.scene.userData.post = post;
      shell.setCraftLook(photoCraftLook(lit));
      map.dispose = () => {
        shell.setCraftLook(null);
        post.dispose();
        sceneDispose();
      };
      return map;
    },
    /* After the scene graph's own dispose: what the graph cannot reach. */
    dispose() {
      if (nightFixtures) {
        nightFixtures.dispose();
      }
      envTarget.dispose();
      sky.disposeCube();
      clouds.dispose();
      ground.dispose();
      turf.dispose();
      for (const t of owned) {
        t.dispose();
      }
    },
  };
}
