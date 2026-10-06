/*
 * perf-ground-check.js: the swiss2 ground's splat, as this tree draws it,
 * against the splat at a base commit: is the picture the same, and what
 * does each cost the GPU?
 *
 * The ground is the biggest single draw in every swiss2 frame
 * (docs/PERF.md, P3), and a change made to it for speed must not move a
 * pixel. This parks the camera at the swiss2 views, holds the clocks, and
 * draws the scene with each ground material in turn: the tree's own (the
 * candidate, the one the map built) and one built from
 * src/maps/swiss2/ground.js as it is at --base (the base). Both read the
 * very same uniform objects, so the masks, the walls, the craft and the
 * clocks are one set. The base module is the old file's source, its
 * imports pointed at this tree's modules, imported from a blob, so
 * nothing is written into src/.
 *
 * The grass reads the fields through ground.js's MEADOW_GLSL, so the
 * grass materials are swapped to each set's MEADOW_GLSL along with the
 * ground; and the base's grass is this tree's grass shader with
 * vegetation/grass.js's diff from --base turned back in its text, so a
 * change to the grass's own shader is compared as well.
 *
 * WHAT IS COMPARED is the scene pass, the light before any post pass, in a
 * 32 bit float target read back as floats (the post chain's grain and the
 * meter's adaptation move between two draws of one frame; the scene with
 * its clocks held does not). Each material set is drawn twice: what one
 * set drawn twice differs by is the repeat, and the candidate against the
 * base is the change. The lake's mirror is redrawn before each draw, so
 * the ground it reflects is the material under test too. A view is
 *
 *   same  bit for bit the base's picture;
 *   near  not bit for bit (the shader compiler is free to contract a
 *         multiply and an add into one rounding, and does so differently
 *         when the code around them changes) but no pixel's light moved
 *         by 1/255 of itself, which is less than the least step an 8 bit
 *         display can show at any exposure, with draws that repeat
 *         exactly. OUT_DIR/VIEW-diff.png shows where it moved;
 *   FAIL  anything else, or anything not same with --exact.
 *
 * WHAT IS TIMED is the scene draw, with WebGL's timer queries, the
 * shadow maps held, the sets interleaved (candidate, base, candidate,
 * base) over --reps rounds of --frames frames: the whole scene, the
 * ground alone (every other mesh hidden), which is the splat's own cost,
 * and the grass alone. Each number is the median of the rounds' medians.
 *
 * --variant=A,B draws more sets, each built from this tree's ground.js
 * with one edit from VARIANTS below, compared and timed against the base
 * like the candidate. `break-*` variants are deliberate small mistakes,
 * to prove the comparison sees one; `stub-*` variants leave one part of
 * the splat out, to see where its time goes (they change the picture by
 * design). --edits=FILE adds variants from a JSON file of
 * { name: [find, replace] }, and --variant=all-edits draws every one
 * that is not a break or a stub: a change taken apart hunk by hunk.
 * A variant never decides the exit code.
 *
 *     SIM_GPU=1 node scripts/perf-ground-check.js [OUT_DIR] [--base=origin/main]
 *         [--views=meadow-eye,low-south] [--frames=40] [--reps=3]
 *         [--variant=NAME,...] [--edits=FILE] [--notime] [--exact]
 *
 * OUT_DIR gets each view's finished picture (candidate) and its diff map
 * for the eye, and ground-check.json; it stays out of the repository.
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

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-ground-check: run with SIM_GPU=1; it times the GPU');
}
const opts = { base: 'origin/main', views: '', frames: 40, reps: 3, variant: '', edits: '', notime: false, exact: false };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`perf-ground-check: unknown option --${m[1]}`);
  }
  opts[m[1]] = m[2] === undefined ? true : typeof opts[m[1]] === 'number' ? Number(m[2]) : m[2];
}
const outDir = resolve(positional[0] || join(tmpdir(), 'fdfpv-ground-check'));
await mkdir(outDir, { recursive: true });

/*
 * The variants: a find and its replacement in ground.js's source. Each
 * find must be in the file exactly once, or the run stops: a variant
 * whose edit silently missed would be the candidate again.
 */
const VARIANTS = {
  /* The relief's finest octave dropped one step early: a far only change,
   * the kind a distance LOD gets wrong. */
  'break-relief': ['float keep = 1.0 - smoothstep(0.12, 0.25, dist * 0.00093 * fq);', 'float keep = 1.0 - smoothstep(0.11, 0.25, dist * 0.00093 * fq);'],
  /* A layer skipped at a slightly looser weight. */
  'break-layer': ['if (w < 0.004) {', 'if (w < 0.006) {'],
  /* A field grown back cut a hair shorter: s2Meadow's mown is read by
   * the grass alone, so this moves no pixel of the ground and proves the
   * grass is swapped too. */
  'break-grass': ['mown = 0.55;\n      passes = 0.55;', 'mown = 0.56;\n      passes = 0.55;'],
  /* Parts of the splat left out, for where the time goes. */
  'stub-field': ['if (farm > 0.0) {\n      field = s2Field(', 'if (farm > 2.0) {\n      field = s2Field('],
  'stub-soft': ['if (soft > 0.01) {', 'if (soft > 2.0) {'],
  'stub-relief': ['for (int o = 0; o < 4; o++) {\n      /* A pixel', 'for (int o = 0; o < 0; o++) {\n      /* A pixel'],
  'stub-face': ['if (face > 0.01) {\n      float fpx', 'if (face > 2.0) {\n      float fpx'],
  'stub-layers': ['for (int i = 0; i < 9; i++) {\n      int k = S2_ORDER[i];', 'for (int i = 0; i < 1; i++) {\n      int k = S2_ORDER[8];'],
  'stub-turn': ['col = mix(col, textureGrad(uS2Col, vec3(TURN', 'if (false) col = mix(col, textureGrad(uS2Col, vec3(TURN'],
};
/* More variants from a file, { name: [find, replace] }: to take a change
 * apart hunk by hunk when it moves a picture. */
if (opts.edits) {
  Object.assign(VARIANTS, JSON.parse(await readFile(resolve(opts.edits), 'utf8')));
}
const variantNames = opts.variant === 'all-edits' ? Object.keys(VARIANTS).filter((k) => !/^(break|stub)-/.test(k))
  : opts.variant ? String(opts.variant).split(',') : [];
for (const name of variantNames) {
  if (!VARIANTS[name]) {
    throw new Error(`perf-ground-check: no variant ${name}; there are ${Object.keys(VARIANTS).join(', ')}`);
  }
}

const git = spawnSync('git', ['-C', root, 'show', `${opts.base}:src/maps/swiss2/ground.js`], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (git.status !== 0) {
  throw new Error(`perf-ground-check: git show ${opts.base}:src/maps/swiss2/ground.js failed: ${git.stderr}`);
}
const baseSrc = git.stdout;
const candSrc = await readFile(join(root, 'src/maps/swiss2/ground.js'), 'utf8');
const variants = {};
for (const name of variantNames) {
  const [find, repl] = VARIANTS[name];
  if (candSrc.split(find).length !== 2) {
    throw new Error(`perf-ground-check: variant ${name}'s edit is not in ground.js exactly once`);
  }
  variants[name] = candSrc.replace(find, repl);
}
/*
 * The grass's own shader (vegetation/grass.js) as it is at --base: this
 * tree's, with each hunk of the diff from --base to grass.js turned back
 * in the compiled shader's text. A hunk that is not found there whole
 * touched something other than the shader's GLSL, and the run stops:
 * this check cannot stand in for that.
 */
const grassDiff = spawnSync('git', ['-C', root, 'diff', '-U1', opts.base, '--', 'src/maps/swiss2/vegetation/grass.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (grassDiff.status !== 0) {
  throw new Error(`perf-ground-check: the diff from ${opts.base} to grass.js failed: ${grassDiff.stderr}`);
}
const grassEdits = grassDiff.stdout.split('\n@@').slice(1).map((hunk) => {
  const now = [];
  const was = [];
  for (const l of hunk.split('\n').slice(1)) {
    if (l.startsWith(' ')) { now.push(l.slice(1)); was.push(l.slice(1)); }
    if (l.startsWith('+')) { now.push(l.slice(1)); }
    if (l.startsWith('-')) { was.push(l.slice(1)); }
  }
  return [now.join('\n'), was.join('\n')];
});
const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
const threeUrl = (indexHtml.match(/"three":\s*"([^"]+)"/) || [])[1];
if (!threeUrl) {
  throw new Error('perf-ground-check: no "three" in index.html\'s import map');
}

/* scripts/swiss2-views.js's views, read from that file as swiss2-perf.js
 * does, and two low over the valley as perf-play's swiss-low flies it. */
const viewsSrc = await readFile(join(root, 'scripts/swiss2-views.js'), 'utf8');
const listSrc = viewsSrc.match(/const VIEWS = (\[[\s\S]*?\n\]);/);
const fovSrc = viewsSrc.match(/const FOV = ([0-9.]+);/);
if (!listSrc || !fovSrc) {
  throw new Error('perf-ground-check: could not read VIEWS and FOV out of scripts/swiss2-views.js');
}
const FOV = Number(fovSrc[1]);
const ALL_VIEWS = [
  ...new Function(`return ${listSrc[1]};`)(),
  { id: 'low-south', cam: [0, 14, 900, 120, 8, 1600] },
  { id: 'low-southwest', cam: [300, 14, 1100, -100, 8, 1900] },
];
const VIEWS = opts.views ? ALL_VIEWS.filter((v) => String(opts.views).split(',').includes(v.id)) : ALL_VIEWS;
if (!VIEWS.length) {
  throw new Error(`perf-ground-check: no view among ${opts.views}`);
}

/* The in page half. P is swiss2.js's __SWISS2_PERF. */
const INSTALL = /* js */ `(async (sources, threeUrl) => {
  const P = globalThis.__SWISS2_PERF;
  const THREE = window.__three;
  const r = P.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  if (!gl.getExtension('EXT_color_buffer_float')) { throw new Error('no EXT_color_buffer_float'); }
  /* The live ground materials, one per kind (the valley, the strip, a
   * boulder, a drift, the carved rock), and the meshes drawn with them. */
  const live = new Map();
  P.scene.traverse((m) => {
    const mat = m.material;
    if (!mat || Array.isArray(mat) || !mat.userData || !mat.userData.s2Ground) { return; }
    if (!live.has(mat)) { live.set(mat, []); }
    live.get(mat).push(m);
  });
  if (!live.size) { throw new Error('no swiss2 ground material in the scene'); }
  const groundMeshes = [...live.values()].flat();
  /* A module from source: its imports pointed at this tree's modules by
   * absolute URL, so it shares their instances, three included. */
  const here = new URL('/src/maps/swiss2/', location.origin);
  const load = async (src) => {
    const fixed = src
      .replace(/from '(\\.\\.?\\/[^']+)'/g, (all, rel) => "from '" + new URL(rel, here).href + "'")
      .replace(/from 'three'/g, "from '" + threeUrl + "'");
    const url = URL.createObjectURL(new Blob([fixed], { type: 'text/javascript' }));
    try { return await import(url); } finally { URL.revokeObjectURL(url); }
  };
  /*
   * The grass reads the fields too (vegetation/grass.js puts ground.js's
   * MEADOW_GLSL in its vertex shader), so a change to MEADOW_GLSL moves
   * the grass as well as the ground. Which materials carry it is found by
   * handing each material's onBeforeCompile three's own standard shader
   * and looking for the text in what comes back; a hook that cannot take
   * the standard shader is no grass. Those materials are swapped to each
   * set's MEADOW_GLSL alongside the ground.
   */
  const candMeadow = (await import(new URL('ground.js', here).href)).MEADOW_GLSL;
  const meadow = new Map();
  P.scene.traverse((m) => {
    const mat = m.material;
    if (!mat || Array.isArray(mat) || live.has(mat) || typeof mat.onBeforeCompile !== 'function') { return; }
    if (!meadow.has(mat)) {
      const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {}, defines: {} };
      let has = false;
      try {
        mat.onBeforeCompile(sh, r);
        has = sh.vertexShader.includes(candMeadow) || sh.fragmentShader.includes(candMeadow);
      } catch (e) {
        has = false;
      }
      if (!has) { return; }
      meadow.set(mat, []);
    }
    meadow.get(mat).push(m);
  });
  const meadowMeshes = [...meadow.values()].flat();
  const makeSet = (mod, tag) => {
    const set = new Map();
    for (const mat of live.keys()) {
      const u = mat.userData.s2Ground;
      const carved = Boolean(mat.defines && 'S2_CARVED' in mat.defines);
      const m = mod.groundMaterial({
        arrays: { col: null, nrh: null }, zones: { zone1: null, zone2: null }, path: null, walls: u.uS2Walls,
        lit: P.stage.lit, clock: u.uS2Clock, only: u.uS2Only.value, carved: carved ? 1 : 0,
      });
      /* The very same uniform objects as the live material's. */
      Object.assign(m.userData.s2Ground, u);
      /* lit() keys every ground program 's2lit|s2-ground'; without a key
       * of its own this set would be handed the candidate's program. */
      const key = 's2lit|s2-ground-' + tag + (carved ? '-carved' : '');
      set.set(mat, { onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: () => key });
    }
    const setMeadow = mod.MEADOW_GLSL;
    const edits = tag === 'base' ? sources.grassEdits : [];
    for (const mat of meadow.keys()) {
      const hook = mat.onBeforeCompile;
      const keyOf = mat.customProgramCacheKey;
      if (setMeadow === candMeadow && !edits.length) {
        set.set(mat, { onBeforeCompile: hook, customProgramCacheKey: keyOf });
        continue;
      }
      const key = keyOf.call(mat) + '|meadow-' + tag;
      set.set(mat, {
        onBeforeCompile(shader, rr) {
          hook.call(this, shader, rr);
          for (const [now, was] of edits) {
            if (shader.vertexShader.split(now).length !== 2) {
              throw new Error('perf-ground-check: a hunk of grass.js is not in its vertex shader exactly once: ' + now.slice(0, 160));
            }
            shader.vertexShader = shader.vertexShader.replace(now, () => was);
          }
          shader.vertexShader = shader.vertexShader.split(candMeadow).join(setMeadow);
          shader.fragmentShader = shader.fragmentShader.split(candMeadow).join(setMeadow);
        },
        customProgramCacheKey: () => key,
      });
    }
    return set;
  };
  /* A set is swapped in by handing the live material the set's shader
   * (its onBeforeCompile and program key), not by swapping the material:
   * three sorts opaque draws by material id, and a material of another
   * id changed which of two coplanar surfaces lands on top, moving
   * pixels the shader never touched. The live material keeps every
   * program it has used, so swapping back costs no compile. */
  const swapped = [...live.keys(), ...meadow.keys()];
  const sets = { cand: new Map(swapped.map((m) => [m, { onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: m.customProgramCacheKey }])) };
  sets.base = makeSet(await load(sources.base), 'base');
  for (const [name, src] of Object.entries(sources.variants)) { sets[name] = makeSet(await load(src), name); }
  const use = (name) => {
    for (const mat of swapped) {
      const src = sets[name].get(mat);
      if (mat.onBeforeCompile === src.onBeforeCompile) { continue; }
      mat.onBeforeCompile = src.onBeforeCompile;
      mat.customProgramCacheKey = src.customProgramCacheKey;
      mat.needsUpdate = true;
    }
  };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 0 });
  const programsBefore = r.info.programs.length;
  const sm = r.shadowMap;
  const draw = (t) => {
    P.updateWind(t);
    P.stage.water.update(0, P.camera);
    r.setRenderTarget(rt);
    r.render(P.scene, P.camera);
    r.setRenderTarget(null);
  };
  const read = () => {
    const px = new Float32Array(w * h * 4);
    r.setRenderTarget(rt);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);
    r.setRenderTarget(null);
    return px;
  };
  const diff = (a, b) => {
    let max = 0;
    let n = 0;
    let at = -1;
    for (let k = 0; k < a.length; k += 1) {
      if ((k & 3) === 3) { continue; }
      const d = Math.abs(a[k] - b[k]);
      if (d > 0 || Number.isNaN(d)) { n += 1; if (!(d <= max)) { max = d; at = k >> 2; } }
    }
    return { max, channels: n, at: at < 0 ? null : [at % w, h - 1 - Math.floor(at / w)] };
  };
  /* Where two pictures differ, for the eye: the candidate's light dimmed
   * to a quarter, a pixel that moved by less than 1/255 of itself green,
   * one that moved by more red. 1/255 of a value is about the least
   * change an 8 bit display step can show at any exposure, so a picture
   * with no red has no pixel a display could show moving. */
  const diffMap = (a, b) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    let big = 0;
    let relMax = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const k = ((h - 1 - y) * w + x) * 4;
        let rel = 0;
        for (let ch = 0; ch < 3; ch += 1) {
          const d = Math.abs(a[k + ch] - b[k + ch]);
          if (d > 0) { rel = Math.max(rel, d / Math.max(Math.abs(a[k + ch]), Math.abs(b[k + ch]), 1e-4)); }
        }
        relMax = Math.max(relMax, rel);
        const o = (y * w + x) * 4;
        const lum = Math.min(255, 64 * Math.sqrt(Math.max(0, a[k] + a[k + 1] + a[k + 2]) / 3));
        img.data[o] = rel >= 1 / 255 ? 255 : lum;
        img.data[o + 1] = rel > 0 && rel < 1 / 255 ? 255 : lum;
        img.data[o + 2] = lum;
        img.data[o + 3] = 255;
        big += rel >= 1 / 255 ? 1 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { big, relMax, png: c.toDataURL('image/png') };
  };
  const names = Object.keys(sets);
  window.__groundCompare = (t) => {
    /* The shadow maps once, then held, so every set sees the same. */
    sm.needsUpdate = true;
    draw(t);
    const keepAuto = sm.autoUpdate;
    sm.autoUpdate = false;
    try {
      for (const n of names) { use(n); draw(t); }
      const px = {};
      for (const n of names) { use(n); draw(t); px[n] = [read()]; }
      for (const n of names) { use(n); draw(t); px[n].push(read()); }
      use('cand');
      const out = { programs: r.info.programs.length - programsBefore, rows: {} };
      let repeat = 0;
      for (const n of names) { const d = diff(px[n][0], px[n][1]); repeat = Math.max(repeat, d.max); out.rows[n + ' repeat'] = d; }
      out.repeat = repeat;
      for (const n of names) {
        if (n === 'base') { continue; }
        out.rows[n] = diff(px[n][0], px.base[0]);
        const { png, ...m } = diffMap(px[n][0], px.base[0]);
        Object.assign(out.rows[n], m);
        if (n === 'cand') { out.png = png; }
      }
      /* How much of the picture is ground: candidate against no ground. */
      for (const m of groundMeshes) { m.visible = false; }
      draw(t);
      const bare = read();
      for (const m of groundMeshes) { m.visible = true; }
      out.groundShare = diff(px.cand[0], bare).channels / (w * h * 3);
      return out;
    } finally {
      use('cand');
      sm.autoUpdate = keepAuto;
    }
  };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const nextTask = () => new Promise((done) => setTimeout(done, 20));
  const timeRun = async (name, n, t, only) => {
    use(name);
    const hidden = [];
    if (only) {
      const g = new Set(only);
      P.scene.traverse((m) => { if ((m.isMesh || m.isLine || m.isPoints || m.isSprite) && !g.has(m) && m.visible) { m.visible = false; hidden.push(m); } });
    }
    const qs = [];
    try {
      P.updateWind(t);
      r.setRenderTarget(rt);
      r.render(P.scene, P.camera);
      gl.finish();
      for (let k = 0; k < n; k += 1) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        r.render(P.scene, P.camera);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(q);
      }
      r.setRenderTarget(null);
      gl.flush();
      const last = qs[qs.length - 1];
      for (let tries = 0; !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); tries += 1) {
        if (tries > 500) { throw new Error('timer queries never became available'); }
        await nextTask();
      }
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { return null; }
      const ms = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      return { med: median(ms), min: Math.min(...ms) };
    } finally {
      for (const q of qs) { gl.deleteQuery(q); }
      for (const m of hidden) { m.visible = true; }
      use('cand');
    }
  };
  window.__groundTime = async (n, reps, t) => {
    sm.needsUpdate = true;
    draw(t);
    const keepAuto = sm.autoUpdate;
    sm.autoUpdate = false;
    try {
      const acc = {};
      for (let k = 0; k < reps; k += 1) {
        for (const [part, only] of [['scene', null], ['ground', groundMeshes], ['grass', meadowMeshes]]) {
          for (const name of names) {
            const key = name + ' ' + part;
            const v = await timeRun(name, n, t, only);
            (acc[key] ||= []).push(v);
          }
        }
      }
      const out = {};
      for (const [k, v] of Object.entries(acc)) {
        const ok = v.filter(Boolean);
        out[k] = { med: median(ok.map((x) => x.med)), min: Math.min(...ok.map((x) => x.min)), disjoint: v.length - ok.length };
      }
      return out;
    } finally {
      sm.autoUpdate = keepAuto;
    }
  };
  return JSON.stringify({ w, h, quality: P.quality, materials: live.size, meshes: groundMeshes.length, grass: meadow.size, grassMeshes: meadowMeshes.length, sets: names });
})`;

function gpuLoad() {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  return (q.stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split(',').map((s) => s.trim()).join(':') + '%').join(' ');
}

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'sky1800');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)}, { graphics: 'high', graphicsAuto: false, perfMode: 'quality', airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the quality check below fails the run. */ }
  globalThis.__SWISS2_PERF = {};`];

const page = await openPage({ root, width: 1600, height: 900, url: '/index.html?map=swiss2', seed });
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let failed = 0;
const report = { base: opts.base, variant: opts.variant || null, views: [] };
try {
  await page.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 300000);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  const sources = { base: baseSrc, variants, grassEdits };
  const info = JSON.parse(await page.evaluate(`${INSTALL}(${JSON.stringify(sources)}, ${JSON.stringify(threeUrl)})`));
  if (info.quality !== 'high') {
    throw new Error(`perf-ground-check: the map was built at ${info.quality}, not High`);
  }
  console.log(`swiss2 High, ${info.w}x${info.h}, base ${opts.base}, ${info.materials} ground materials on ${info.meshes} meshes, ${info.grass} grass materials on ${info.grassMeshes}, sets ${info.sets.join(' ')}`);
  await page.sleep(2500);
  for (const v of VIEWS) {
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`);
    await page.sleep(2500);
    await page.evaluate('window.__drawOff(true)');
    try {
      const t = await page.evaluate('performance.now() / 1000');
      const c = await page.evaluate(`JSON.stringify(window.__groundCompare(${t}))`).then(JSON.parse);
      if (c.programs < info.sets.length - 1) {
        throw new Error(`perf-ground-check: ${c.programs} new programs for ${info.sets.length} sets; a set was handed another's program`);
      }
      if (c.rows.cand.channels) {
        await writeFile(join(outDir, `${v.id}-diff.png`), Buffer.from(c.png.split(',')[1], 'base64'));
      }
      delete c.png;
      const map = c.rows.cand;
      const row = { id: v.id, compare: c };
      const cand = c.rows.cand;
      /* same: bit for bit. near: some light moved, none by 1/255 of
       * itself (the bound, see diffMap), with draws that repeat exactly. */
      const verdict = (d) => (d.max <= c.repeat ? 'same' : !opts.exact && d.big === 0 && c.repeat === 0 ? 'near' : 'FAIL');
      row.verdict = verdict(cand);
      failed += row.verdict === 'FAIL' ? 1 : 0;
      const where = (d) => (d.at ? ` at ${d.at.join(',')}` : '');
      let line = `${row.verdict} ${v.id.padEnd(18)} ground ${(c.groundShare * 100).toFixed(0).padStart(3)} %  cand vs base: ${cand.channels} ch, max ${cand.max.toPrecision(3)}${where(cand)}, relative max ${map.relMax.toPrecision(3)}, ${map.big} px over 1/255; repeat ${c.repeat}`;
      for (const name of variantNames) {
        const d = c.rows[name];
        line += `\n     ${verdict(d)} variant ${name} vs base: ${d.channels} ch, max ${d.max.toPrecision(3)}${where(d)}, relative max ${d.relMax.toPrecision(3)}, ${d.big} px over 1/255`;
      }
      console.log(line);
      if (!opts.notime) {
        const load = gpuLoad();
        const tm = await page.evaluate(`window.__groundTime(${opts.frames}, ${opts.reps}, ${t}).then(JSON.stringify)`).then(JSON.parse);
        row.time = tm;
        row.gpuLoad = load;
        const f = (k) => (tm[k] ? `${tm[k].med.toFixed(3)}` : '-');
        const sets = info.sets;
        console.log(`     GPU ms (median of medians; GPU load ${load}):  scene ${sets.map((s) => `${s} ${f(s + ' scene')}`).join('  ')} | ground alone ${sets.map((s) => `${s} ${f(s + ' ground')}`).join('  ')} | grass alone ${sets.map((s) => `${s} ${f(s + ' grass')}`).join('  ')}`);
      }
      report.views.push(row);
    } finally {
      await page.evaluate('window.__drawOff(false)');
    }
    const png = await page.evaluate('(window.__SWISS2_PERF.post.render(), window.__SWISS2_PERF.renderer.domElement.toDataURL("image/png"))');
    await writeFile(join(outDir, `${v.id}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}
await writeFile(join(outDir, 'ground-check.json'), JSON.stringify(report, null, 1));
console.log(`-> ${outDir}`);
if (failed) {
  console.error(`perf-ground-check: ${failed} view(s) changed against ${opts.base}`);
  process.exit(1);
}
