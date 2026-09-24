/*
 * swiss2-nature-preview.js: pictures of swiss2's vegetation and water,
 * headless, on this machine's GPU, without the shell.
 *
 * Loads tests/browser/swiss2-nature-preview.html (the alps heightfield
 * under a Poly Haven HDRI, with buildVegetation and buildWater as the
 * map calls them), stands the camera at each named view, takes a picture,
 * and prints what the frame cost: draw calls, triangles, and the median
 * and 90th percentile frame time over thirty frames each finished on the
 * GPU. The HDRI is fetched once and cached with the CDN's files.
 *
 *   node scripts/swiss2-nature-preview.js [outDir] [--q=high|medium|low]
 *        [--views=name,name] [--size=1600x900] [--bench] [--water=0] [--veg=0]
 *
 * Renders on the GPU (SIM_GPU=1) unless SIM_GPU=0 is set: a software
 * rasteriser cannot say whether a forest looks real. Pictures go to
 * outDir, by default under the system temp, and are not committed
 * (CLAUDE.md).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

if (process.env.SIM_GPU === undefined) {
  process.env.SIM_GPU = '1';
}
const { openPage } = await import('../tests/lib/page.js');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const flag = (name, def) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outDir = args[0] ?? join(tmpdir(), 'swiss2-nature-preview');
const q = flag('q', 'high');
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const bench = process.argv.includes('--bench');

/*
 * The views, as expressions run in the page against window.__preview
 * (P) and the vegetation's layout (L). eye(x, z, heightOverGround, tx,
 * tz, targetHeightOverGround, fov); view(x, y, z, tx, ty, tz, fov).
 */
const VIEWS = {
  /* The east wall's forest edge from the meadow, at eye height. */
  'forest-edge': 'P.eye(260, -700, 1.7, 520, -640, 14, 55)',
  /* The same wall's forest from three hundred metres over it. */
  'forest-300m': 'P.view(420, P.heightAt(560, -900) + 300, -1150, 700, P.heightAt(700, -700), -650, 60)',
  /* One open grown spruce, close. */
  'spruce-close': 'P.closeTree("spruce-open", 18, 9)',
  /* The meadow west of the strip, at eye height, looking up the valley. */
  'meadow-eye': 'P.eye(-24, 150, 1.6, -40, -60, 1.0, 60)',
  /* The sward at the pilot's feet. */
  'grass-close': 'P.eye(-24, 150, 1.2, -26, 146, 0, 60)',
  /* The strip from its south end, eye height. */
  'strip': 'P.eye(0, 95, 1.7, 0, -80, 1.2, 60)',
  /* The lake from the north shore, and from two hundred metres. */
  'lake-shore': 'P.shoreView()',
  'lake-200m': 'P.view(L.lake.cx - 350, 200, 1750, L.lake.cx, -1.5, 2250, 60)',
  /* The stream across the floor, and in the side valley. */
  'stream': 'P.streamView()',
  /* The torrent in the side valley below the pool. */
  'torrent': 'P.torrentView()',
  /* The fall and its mist, from the pool's rim and from the air. */
  'waterfall': 'P.fallView(70, 8)',
  'waterfall-air': 'P.fallView(220, 90)',
};

const page = await openPage({ root, width, height, url: '/favicon.ico' });
try {
  /* The HDRI comes through the same cache as three's files. */
  await page.cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*' }, { urlPattern: 'https://dl.polyhaven.org/*' }],
  }, page.sessionId);
  const query = `q=${q}&water=${flag('water', '1')}&veg=${flag('veg', '1')}${flag('extra', '') ? `&${flag('extra', '')}` : ''}`;
  await page.cdp.send('Page.navigate', { url: `${page.origin}/tests/browser/swiss2-nature-preview.html?${query}` }, page.sessionId);
  await page.until('window.__previewReady === true || (window.__previewError !== undefined)', 240000);
  await page.evaluate(`(() => {
    const P = window.__preview;
    P.closeTree = (name, dist, look) => {
      const v = window.__veg;
      const f = v.forest;
      const want = v.variantIndex(name);
      /* The low tree of its kind nearest the strip with nothing else
       * within twenty metres, so the camera stands in the open. */
      const low = [];
      for (let t = 0; t < f.count; t += 1) {
        if (f.v[t] === want && f.y[t] < 200) low.push(t);
      }
      low.sort((a, b) => Math.hypot(f.x[a], f.z[a]) - Math.hypot(f.x[b], f.z[b]));
      let best = low[0];
      for (const t of low) {
        let alone = true;
        for (let o = 0; o < f.count && alone; o += 1) {
          if (o !== t && Math.abs(f.x[o] - f.x[t]) < 20 && Math.abs(f.z[o] - f.z[t]) < 20) alone = false;
        }
        if (alone) { best = t; break; }
      }
      const x = f.x[best], z = f.z[best], y = f.y[best];
      const a = 2.2;
      P.view(x + Math.cos(a) * dist, P.heightAt(x + Math.cos(a) * dist, z + Math.sin(a) * dist) + 1.7, z + Math.sin(a) * dist, x, y + look, z, 60);
    };
    P.streamView = () => {
      const L = window.__water ? window.__water.layout : window.__veg.layout;
      const p = L.lower[40];
      const q = L.lower[44];
      P.eye(p.x + 5, p.z, 2.0, q.x, q.z, 0, 60);
    };
    P.torrentView = () => {
      const L = window.__water ? window.__water.layout : window.__veg.layout;
      const b = L.belowFall;
      const p = b[Math.floor(b.length * 0.55)];
      const q = b[Math.floor(b.length * 0.3)];
      P.eye(p.x - 3, p.z + 6, 2.0, q.x, q.z, 2, 60);
    };
    /* On the lake's west shore, a few metres back from the water,
     * looking across it to the far shore and the wall behind. */
    P.shoreView = () => {
      const lk = window.__water.lake;
      const p = lk.shore.reduce((a, b) => (b.x < a.x ? b : a));
      P.eye(p.x - 4, p.z, 1.7, lk.cx + 400, lk.cz + 150, 0, 60);
    };
    P.fallView = (dist, up) => {
      const L = window.__water ? window.__water.layout : window.__veg.layout;
      P.view(L.pool.x - dist, L.pool.y + up, L.pool.z + dist * 0.25, L.fallX, (L.lipY + L.pool.y) / 2, L.fallZ, 60);
    };
  })()`);
  await mkdir(outDir, { recursive: true });
  const only = flag('views', '');
  const names = only ? only.split(',') : Object.keys(VIEWS);
  const build = await page.evaluate('window.__preview.buildMs');
  console.log(`built in ${build.toFixed(0)} ms (tier ${q})`);
  const parts = await page.evaluate('JSON.stringify(window.__preview.stats().parts)');
  console.log(parts);
  for (const name of names) {
    const expr = VIEWS[name];
    if (!expr) {
      console.log(`no view ${name}`);
      continue;
    }
    await page.evaluate(`(() => { const P = window.__preview; const L = { lake: window.__water ? window.__water.lake : { cx: 50 } }; ${expr}; })()`);
    await page.evaluate('window.__preview.settle(6)');
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const path = join(outDir, `${name}.png`);
    await writeFile(path, Buffer.from(data, 'base64'));
    const s = await page.evaluate('window.__preview.stats()');
    let line = `shot ${path}: ${s.calls} draws, ${(s.triangles / 1000).toFixed(0)}k triangles`;
    if (bench) {
      const b = await page.evaluate('window.__preview.bench(30)');
      line += `, frame ${b.median.toFixed(1)} ms median, ${b.p90.toFixed(1)} ms p90`;
    }
    console.log(line);
  }
  if (page.errors.length) {
    console.log(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await page.close();
}
