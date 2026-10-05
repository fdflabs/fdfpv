/*
 * dynres-check.js: dynamic resolution drops under GPU load, holds without
 * oscillating, and gives the pixels back when the load goes.
 *
 *   SIM_GPU=1 node scripts/dynres-check.js [heavyIterations]
 *
 * SIM_GPU=1 because on the software rasteriser dynamic resolution is off
 * by design (src/render/dynres.js). The load is a full screen quad dropped
 * into the live scene through the harness hooks, whose fragment shader
 * loops a fixed number of times: its cost is per pixel, which is exactly
 * the cost a resolution step buys back. Nothing in the product is changed
 * to make the load. The scale trace is printed, a number per sample, so
 * the evidence is text and not a picture.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iterations = Number(process.argv[2]) || 400;

const LOAD = `(() => {
  const T = window.__three;
  const mat = new T.ShaderMaterial({
    uniforms: { uN: { value: 0 } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: \`
      uniform int uN;
      void main() {
        vec2 p = gl_FragCoord.xy * 0.001;
        float a = 0.0;
        for (int i = 0; i < 4096; i++) {
          if (i >= uN) { break; }
          a += sin(p.x * float(i) + a) * cos(p.y + a * 0.5);
        }
        gl_FragColor = vec4(vec3(a * 1e-6), 0.0);
      }
    \`,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  quad.renderOrder = 1e9;
  window.__mapScene().add(quad);
  window.__load = mat.uniforms.uN;
  return true;
})()`;

const page = await openPage({
  root,
  width: 1920,
  height: 1080,
  url: '/index.html?map=alps',
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    s.perfMode = 'balanced';
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused. The run still boots. */ }`],
});

const trace = [];
let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

async function sample(phase, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await page.sleep(250);
    const d = JSON.parse(await page.evaluate('JSON.stringify(window.__dynres())'));
    trace.push({ phase, t: trace.length * 0.25, ...d });
  }
}

try {
  await page.until('!!window.__dynres && !!window.__boot && window.__boot().frames > 30', 180000);
  const d0 = JSON.parse(await page.evaluate('JSON.stringify(window.__dynres())'));
  console.log(`renderer: ${JSON.stringify(await page.evaluate('window.__gpu.raw'))}`);
  console.log(`timer query: ${d0.gpu ? 'EXT_disjoint_timer_query_webgl2' : 'absent, frame interval fallback'}; enabled ${d0.enabled}; budget ${d0.budgetMs.toFixed(2)} ms`);
  await page.evaluate(LOAD);
  await sample('idle', 6);
  await page.evaluate(`(window.__load.value = ${iterations}, true)`);
  await sample('heavy', 45);
  await page.evaluate('(window.__load.value = 0, true)');
  await sample('light', 50);
} finally {
  await page.close();
}

console.log('phase   t(s)  scale  pixelRatio  gpuMs  frameMs  fps');
for (const r of trace) {
  console.log(`${r.phase.padEnd(6)} ${r.t.toFixed(2).padStart(6)}  ${r.scale.toFixed(3)}  ${r.pixelRatio.toFixed(3).padStart(10)}  ${r.gpuMs.toFixed(2).padStart(5)}  ${r.frameMs.toFixed(2).padStart(7)}  ${String(r.fps).padStart(3)}`);
}

const heavy = trace.filter((r) => r.phase === 'heavy');
const light = trace.filter((r) => r.phase === 'light');
const idle = trace.filter((r) => r.phase === 'idle');
let reversals = 0;
let dir = 0;
for (let i = 1; i < heavy.length; i += 1) {
  const d = Math.sign(heavy[i].scale - heavy[i - 1].scale);
  if (d !== 0 && dir !== 0 && d !== dir) {
    reversals += 1;
  }
  if (d !== 0) {
    dir = d;
  }
}
const minHeavy = Math.min(...heavy.map((r) => r.scale));
check('enabled on a GPU', trace[0].enabled, `gpu timer ${trace[0].gpu}`);
check('idle stays native', idle.every((r) => r.scale === 1), `min ${Math.min(...idle.map((r) => r.scale))}`);
check('heavy load lowers the scale', minHeavy < 1, `min ${minHeavy}`);
check('heavy load does not oscillate', reversals <= 1, `${reversals} direction reversals`);
check('light load returns to native', light[light.length - 1].scale === 1, `final ${light[light.length - 1].scale}`);
process.exit(failed ? 1 : 0);
