/*
 * reset-check.js: what R, a plant fault, the clip crash's hold and the
 * recovery in place do to the page, through the real page.
 *
 * src/main.js's reset cluster (resetCraft, reset, beginClipCrash,
 * plantFault, finishClipCrash and the recover spot search) is reached from
 * the R and X keys, from the frame loop's fault and clip catches, and from
 * the harness (__crashThrow fresh, __respawn). Two things about it matter
 * to the rest of the project:
 *
 *   - what it calls on the plant, in order and with which arguments, since
 *     recorded flights, contact:golden and every throw start from it;
 *   - what a pilot sees after it: the lap clock, the race and score state,
 *     the craft's pose and flags, the banner.
 *
 * The page's module is wrapped before the shell loads it (as
 * scripts/stand-fault-check.js does), so every export the shell calls is
 * logged while a scenario is being watched, frame by frame. Each scenario
 * is staged so that what it does is fixed: R and X are dispatched as key
 * events inside one evaluate, so nothing runs between them and the read;
 * the fault is handed to the first state read after a held throw is let go.
 *
 * Two kinds of verdict:
 *   - rules, below, which state the behaviour in words and hold on any
 *     correct implementation (lap clock zero after R, held for the hold,
 *     recovered 0.6 m above the fault in open air, and so on);
 *   - a record of the plant calls and the probes' answers, taken from the
 *     old code with --record over RECORD_RUNS runs, keeping as exact only
 *     the values every run agreed on (a value that moved is kept as its
 *     type). A comparison fails on any stable value that changed.
 *
 *   node scripts/reset-check.js            rules, and compare with the record
 *   node scripts/reset-check.js --record   write the record (old code!)
 *
 * The record is tests/fixtures/reset-golden.json. Browser: run it through
 * ~/.cache/run-check.sh.
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

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { CLIP_CRASH_HOLD_MS } from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'reset-golden.json');
const RECORD_RUNS = 3;
const WAIT = 300000;
const recording = process.argv.includes('--record');

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
  };
  return [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* Storage refused; the run boots on defaults and the record says so. */ }`, `(() => {
  /* frames: one list of calls per drawn frame while watching. A frame is
   * a new rAF timestamp, since several callbacks share one. */
  const W = { watching: false, frames: [], ts: -1, nan: 0, stepped: false, faultAt: -1, stopAtStep: false, wrapped: false };
  window.__resetWatch = W;
  const rawRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => rawRaf((ts) => {
    if (W.watching && ts !== W.ts) {
      W.ts = ts;
      W.frames.push([]);
    }
    cb(ts);
  });
  const spell = (v) => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : typeof v);
  const note = (s) => {
    if (W.frames.length === 0) W.frames.push([]);
    W.frames[W.frames.length - 1].push(s);
  };
  const real = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = async (...args) => {
    const res = await real(...args);
    /* instantiate(bytes) resolves to { module, instance }, instantiate(module)
     * to the Instance itself (tests/lib/simmod.js compiles first). */
    const bare = res instanceof WebAssembly.Instance;
    const ex = bare ? res.exports : res && res.instance ? res.instance.exports : null;
    if (!ex || typeof ex.sim_step !== 'function' || W.wrapped) return res;
    W.wrapped = true;
    const out = {};
    for (const key of Object.keys(ex)) {
      const f = ex[key];
      if (typeof f !== 'function' || !key.startsWith('sim_')) {
        out[key] = f;
        continue;
      }
      out[key] = (...a) => {
        if (key === 'sim_step' && W.watching && W.stopAtStep) {
          W.watching = false;
          if (W.atStop) W.stopped = W.atStop();
        }
        const r = f(...a);
        if (key === 'sim_state') {
          if (r === 0 && W.stepped && W.nan > 0) {
            W.nan -= 1;
            new Float64Array(ex.memory.buffer, a[0], 2)[1] = NaN;
            W.faultAt = performance.now();
            W.watching = true;
            W.stopAtStep = true;
            W.frames = [[]];
          }
          W.stepped = false;
          if (W.watching) {
            note('sim_state -> ' + r + ' [' + Array.from(new Float64Array(ex.memory.buffer, a[0], 18)).map(spell).join(' ') + ']');
          }
          return r;
        }
        if (key === 'sim_step') W.stepped = true;
        if (W.watching) note(key + '(' + a.map(spell).join(', ') + ') -> ' + spell(r));
        return r;
      };
    }
    return bare ? { exports: out } : { module: res.module, instance: { exports: out } };
  };
})();`];
}

/* Runs in the page: the probes a pilot's view is drawn from, flattened to
 * path -> spelling, arrays cut to their length and first six entries. */
const SNAP = `(() => {
  const out = {};
  const spell = (v) => {
    if (typeof v === 'number') return Object.is(v, -0) ? 'n:-0' : 'n:' + String(v);
    if (typeof v === 'string') return 's:' + v;
    if (typeof v === 'boolean') return 'b:' + v;
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'fn';
    return null;
  };
  const seen = new WeakSet();
  const walk = (path, v, depth) => {
    const s = spell(v);
    if (s !== null) { out[path] = s; return; }
    if (seen.has(v) || depth > 5) { out[path] = 'deep'; return; }
    seen.add(v);
    if (ArrayBuffer.isView(v)) v = Array.from(v);
    if (Array.isArray(v)) {
      out[path + '.length'] = 'n:' + v.length;
      v.slice(0, 6).forEach((x, i) => walk(path + '[' + i + ']', x, depth + 1));
    } else if (v instanceof Map || v instanceof Set) {
      out[path + '.size'] = 'n:' + v.size;
    } else {
      for (const k of Object.keys(v)) walk(path + '.' + k, v[k], depth + 1);
    }
  };
  const race = window.__race();
  const r = {};
  for (const k of ['next', 'lap', 'lapStartMs', 'lastLapMs', 'prevSimMs', 'splits', 'log', 'laps', 'lapPoints', 'runScore', 'call', 'leaving']) r[k] = race[k];
  /* The banner's text; when it goes is the wall clock's. */
  r.banner = race.banner && race.banner.text;
  walk('race', r, 0);
  /* Less what the last drawn frame derived (the rendered pose, the camera,
   * the up axis it was drawn with): a read in the key's own task sees the
   * frame before, and the drawn pose is read after frames (see drawn). */
  const craft = window.__craftState();
  for (const k of Object.keys(craft)) {
    if (/^(world[XYZ]|cam[A-Z]|fpvY|lastUpz|groundClearance)/.test(k)) delete craft[k];
  }
  walk('craft', craft, 0);
  const c = window.__crash();
  walk('crash', { flags: c.flags, wrecked: c.wrecked, plantFaults: c.plantFaults, motorsHeld: c.motorsHeld, simT: c.simT, debris: c.debris, pieces: c.pieces }, 0);
  walk('score', window.__score(), 0);
  walk('ghost', window.__ghost(), 0);
  walk('lap', window.__traffic().lap, 0);
  walk('mode', window.__mode, 0);
  return out;
})()`;

const watchOn = 'window.__resetWatch.frames = [[]]; window.__resetWatch.ts = -1; window.__resetWatch.stopAtStep = false; window.__resetWatch.watching = true;';
const watchOff = 'window.__resetWatch.watching = false;';
const key = (code) => `window.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: ${JSON.stringify(code)}, bubbles: true }));`;
const FRAMES = 'window.__resetWatch.frames.filter((f) => f.length > 0)';

const rules = [];
const rule = (name, ok, detail) => {
  rules.push({ name, ok: Boolean(ok), detail });
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/* The page's errors less its failed fetches: the check serves no board or
 * rooms server, so those refusals say nothing about the reset. */
const shellErrors = (page) => page.errors.map(String).filter((e) => !/^network: Failed to load resource/.test(e));

async function json(page, expr) {
  return JSON.parse(await page.evaluate(`JSON.stringify(${expr})`));
}

/* The craft as drawn: __craftState's world pose is the rendered one, which
 * a frame refreshes, so a read in the same task as the key is the pose from
 * before it. Two frames later it is the reset's. */
async function drawn(page) {
  return JSON.parse(await page.evaluate(`(async () => {
    for (let i = 0; i < 2; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const c = window.__craftState();
    return JSON.stringify({ x: c.worldX, y: c.worldY, z: c.worldZ, fwd: c.fwd, landed: c.landed });
  })()`));
}

/* A throw at a fixed point in open air over the spawn, held. */
const OPEN_AIR = (hold) => `window.__crashThrow({
  x: window.__map().spawn.x + 6, y: window.__heightAt(window.__map().spawn.x + 6, window.__map().spawn.z + 4) + 12,
  z: window.__map().spawn.z + 4, yaw: 30, pitch: 0, vx: 0, vy: 0, vz: 0, hold: ${hold}, fresh: true, clockMs: 4000, showCraft: true,
})`;

async function quadPage(out) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seed('interceptor') });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__resetWatch.wrapped', WAIT);
    await page.sleep(1000);
    await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()');
    await page.until("window.__mode === 'flight'", 60000);
    const spawn = await json(page, 'window.__map().spawn');

    /* R after a flight with the race and lap clock dirtied. */
    await page.evaluate(OPEN_AIR(false));
    await page.sleep(800);
    await page.evaluate(`(() => {
      const r = window.__race();
      r.banner = { text: 'dirty', untilMs: performance.now() + 60000 };
      r.log.push({ n: 1, ms: 1234, reason: null });
      r.laps.push(1234);
      r.lapStartMs = 100;
    })()`);
    const lapBefore = await json(page, 'window.__traffic().lap');
    const r = await json(page, `(() => { ${watchOn} ${key('KeyR')} ${watchOff} return { frames: ${FRAMES}, snap: ${SNAP} }; })()`);
    out['r-after-flight'] = r;
    const s = r.snap;
    rule('R: the lap clock was running before', lapBefore > 0, `${lapBefore}`);
    rule('R: the lap clock is back to zero', s.lap === 'n:0', s.lap);
    rule('R: the race log, laps and lap start are cleared', s['race.log.length'] === 'n:0' && s['race.laps.length'] === 'n:0' && s['race.lapStartMs'] === 'null', `${s['race.log.length']} ${s['race.laps.length']} ${s['race.lapStartMs']}`);
    rule('R: the banner is cleared', s['race.banner'] === 'null', s['race.banner']);
    const rd = await drawn(page);
    rule('R: the craft is parked, landed, on the spawn', s['craft.landed'] === 'b:true' && s['craft.crashed'] === 'b:false'
      && rd.landed && near(rd.x, spawn.x, 0.5) && near(rd.z, spawn.z, 0.5),
    `${s['craft.landed']} ${JSON.stringify(rd)} vs ${spawn.x} ${spawn.z}`);
    rule('R: no damage, no wreck', s['crash.flags'] === 'n:0' && s['crash.wrecked'] === 'b:false');
    rule('R: the score starts from nothing', s['score.total'] === 'n:0' && s['score.crashes'] === 'n:0', `${s['score.total']} ${s['score.crashes']}`);
    rule('R: the plant was reset', r.frames.some((f) => f.some((c) => c.startsWith('sim_reset('))), '');
    await page.sleep(500);

    /* A plant fault in open air: the hold, then the recovery in place. */
    const thrown = await json(page, OPEN_AIR(true));
    await page.sleep(500);
    const at = await json(page, 'window.__craftState()');
    const faults0 = await json(page, 'window.__crash().plantFaults');
    /* The recovered state is read inside the plant's first step after the
     * hold, before it: what finishClipCrash left, whatever the frames did. */
    await page.evaluate(`window.__resetWatch.atStop = () => ${SNAP}; window.__resetWatch.nan = 1; window.__releasePose();`);
    await page.until('window.__craftState().clipCrash', 10000);
    const held = await json(page, `({ snap: ${SNAP}, t: performance.now() - window.__resetWatch.faultAt })`);
    const poses = [];
    while (await page.evaluate('window.__craftState().clipCrash')) {
      poses.push(await json(page, '(() => { const c = window.__craftState(); return [c.worldX, c.worldY, c.worldZ, performance.now() - window.__resetWatch.faultAt]; })()'));
      await page.sleep(40);
    }
    const heldFor = poses.length ? poses[poses.length - 1][3] : 0;
    await page.until('!window.__resetWatch.watching', 5000);
    const after = await json(page, `({ frames: ${FRAMES}, snap: window.__resetWatch.stopped })`);
    /* The lap clock runs through the hold, which is wall time: the rule
     * below says it ran on, the record leaves its value out. */
    const lapHeld = held.snap.lap;
    const lapAfter = after.snap.lap;
    delete held.snap.lap;
    delete after.snap.lap;
    out['fault-held'] = { snap: held.snap };
    out['fault-recovered'] = after;
    const h = held.snap;
    rule('fault: the throw was taken', thrown.ok === true, JSON.stringify(thrown).slice(0, 120));
    rule('fault: counted once', h['crash.plantFaults'] === `n:${faults0 + 1}`, `${h['crash.plantFaults']} after ${faults0}`);
    rule('fault: a clip crash of kind plant', h['craft.clipCrash'] === 'b:true' && h['craft.clipCrashKind'] === 's:plant', `${h['craft.clipCrash']} ${h['craft.clipCrashKind']}`);
    rule('fault: the banner says Crashed', h['race.banner'] === 's:Crashed', h['race.banner']);
    rule('fault: held where it last was sound', poses.length > 2 && poses.every((p) => near(p[0], at.worldX, 1e-6) && near(p[1], at.worldY, 1e-6) && near(p[2], at.worldZ, 1e-6)),
      `${poses.length} samples, first ${JSON.stringify(poses[0])} vs ${at.worldX} ${at.worldY} ${at.worldZ}`);
    rule('fault: held for the clip crash hold', heldFor >= CLIP_CRASH_HOLD_MS - 100 && heldFor <= CLIP_CRASH_HOLD_MS + 1500, `${Math.round(heldFor)} ms, hold ${CLIP_CRASH_HOLD_MS}`);
    const a = after.snap;
    /* Read a few frames after the recovery, so the craft has begun to fall
     * from the spot: straight down, since it was put there at rest. The
     * record pins the spot exactly (the plant pose it was handed). */
    const ad = await drawn(page);
    rule('fault: recovered in place, 0.6 m above in open air', near(ad.x, at.worldX, 0.05) && near(ad.z, at.worldZ, 0.05)
      && ad.y <= at.worldY + 0.61 && ad.y >= at.worldY + 0.3,
    `${JSON.stringify(ad)} vs ${at.worldX} ${at.worldY + 0.6} ${at.worldZ}`);
    rule('fault: airborne, not crashed, run left alone', a['craft.landed'] === 'b:false' && a['craft.clipCrash'] === 'b:false' && Number(lapAfter.slice(2)) >= Number(lapHeld.slice(2)) && Number(lapHeld.slice(2)) >= 4000,
      `${a['craft.landed']} ${a['craft.clipCrash']} lap ${lapHeld} then ${lapAfter}`);
    rule('fault: the recovery set the plant pose', after.frames.some((f) => f.some((c) => /^sim_set_pose\(0, 0, /.test(c))), '');
    await page.sleep(500);

    /* X in open air, straight after a throw: the recovery in place on its own. */
    const x = await json(page, `(() => {
      ${OPEN_AIR(false)};
      const before = window.__craftState();
      ${watchOn} ${key('KeyX')} ${watchOff}
      return { before, frames: ${FRAMES}, snap: ${SNAP} };
    })()`);
    out['x-open-air'] = { frames: x.frames, snap: x.snap };
    const xs = x.snap;
    const xd = await drawn(page);
    rule('X: re-seated 0.6 m up on the same heading', near(xd.y, x.before.worldY + 0.6, 0.05)
      && near(xd.x, x.before.worldX, 0.01) && near(xd.z, x.before.worldZ, 0.01)
      && near(xd.fwd.x, x.before.fwd.x, 0.01) && near(xd.fwd.z, x.before.fwd.z, 0.01) && !xd.landed,
    `${JSON.stringify(xd)} vs ${JSON.stringify([x.before.worldX, x.before.worldY, x.before.worldZ, x.before.fwd])}`);
    rule('X: the lap clock keeps running', xs.lap === 'n:4000', xs.lap);
    await page.sleep(500);

    /* X deep underground: nowhere within reach is clear, so it is R. */
    const deep = await json(page, `(() => {
      const sp = window.__map().spawn;
      const t = window.__crashThrow({ x: sp.x + 6, y: window.__heightAt(sp.x + 6, sp.z + 4) - 20, z: sp.z + 4, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, fresh: true, clockMs: 4000 });
      ${watchOn} ${key('KeyX')} ${watchOff}
      return { t, frames: ${FRAMES}, snap: ${SNAP} };
    })()`);
    out['x-buried'] = { frames: deep.frames, snap: deep.snap };
    rule('X buried: the throw was taken', deep.t && deep.t.ok === true, JSON.stringify(deep.t).slice(0, 120));
    const dd = await drawn(page);
    rule('X buried: falls back to a restart on the spawn', deep.snap.lap === 'n:0' && deep.snap['craft.landed'] === 'b:true'
      && near(dd.x, spawn.x, 0.5) && near(dd.z, spawn.z, 0.5), `${deep.snap.lap} ${deep.snap['craft.landed']} ${JSON.stringify(dd)}`);
    await page.sleep(500);

    /* The harness respawn: the spawn moved and the craft parked there. */
    const re = await json(page, `(() => {
      const sp = window.__map().spawn;
      ${watchOn} window.__respawn(sp.x + 10, sp.z + 5, 1.0); ${watchOff}
      return { frames: ${FRAMES}, snap: ${SNAP} };
    })()`);
    out.respawn = re;
    const red = await drawn(page);
    rule('respawn: parked at the new spot', near(red.x, spawn.x + 10, 0.5) && near(red.z, spawn.z + 5, 0.5) && red.landed,
    `${JSON.stringify(red)}`);

    /* A fresh throw: the plant back to its first step, as contact:golden stages. */
    const fresh = await json(page, `(() => { ${watchOn} const t = ${OPEN_AIR(true)}; ${watchOff} return { t, frames: ${FRAMES}, snap: ${SNAP} }; })()`);
    out['throw-fresh'] = { frames: fresh.frames, snap: fresh.snap };
    rule('fresh throw: the plant was reset first', fresh.frames.length > 0 && fresh.frames[0][0].startsWith('sim_reset('), String((fresh.frames[0] || [])[0]).slice(0, 80));
    out['errors-quad'] = Object.fromEntries(page.errors.map((e, i) => [i, String(e).slice(0, 160)]));
    const quadErrors = shellErrors(page).filter((e) => !/plant fault 1 after/.test(e));
    rule('the quad page logged only the planted fault', quadErrors.length === 0, quadErrors.slice(0, 3).join(' | ').slice(0, 400));
  } finally {
    await page.close();
  }
}

/* A fixed wing: R there may start the run in the air. */
async function wingPage(out) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seed('cub1400') });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__resetWatch.wrapped', WAIT);
    await page.sleep(1000);
    await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()');
    await page.until("window.__mode === 'flight'", 60000);
    await page.sleep(800);
    const r = await json(page, `(() => { ${watchOn} ${key('KeyR')} ${watchOff} return { frames: ${FRAMES}, snap: ${SNAP} }; })()`);
    out['r-wing'] = r;
    rule('wing R: the lap clock is back to zero', r.snap.lap === 'n:0', r.snap.lap);
    out['errors-wing'] = Object.fromEntries(page.errors.map((e, i) => [i, String(e).slice(0, 160)]));
    const wingErrors = shellErrors(page);
    rule('the wing page logged nothing', wingErrors.length === 0, wingErrors.slice(0, 3).join(' | ').slice(0, 400));
  } finally {
    await page.close();
  }
}

/* A frame's calls with each run of one export folded into one line: the
 * water's thousands of channel points are one declaration, and a digest
 * of their arguments pins them as well as the list would. */
function fold(calls) {
  const out = [];
  for (let i = 0; i < calls.length;) {
    const name = calls[i].split(/[ (]/)[0];
    let j = i;
    while (j < calls.length && calls[j].split(/[ (]/)[0] === name) j += 1;
    out.push(j - i === 1 ? calls[i] : `${name} x${j - i} ${createHash('sha256').update(calls.slice(i, j).join('\n')).digest('hex').slice(0, 24)}`);
    i = j;
  }
  return out;
}

/* Each scenario flattened to path -> spelling: its probes by path, and its
 * frames' calls. A scenario that spans frames keeps its first and last
 * frame in full and nothing between: those are the hold's frames, drawn by
 * the frame loop, and which kinds of frame fall inside the hold is the wall
 * clock's business (recording runs disagreed on them), not the reset's. */
function flatten(out) {
  const flat = {};
  for (const [name, sc] of Object.entries(out)) {
    if (name.startsWith('errors-')) {
      continue;
    }
    if (sc.frames) {
      const frames = sc.frames.map((f) => fold(f).join('\n'));
      const parts = frames.length > 1 ? { first: frames[0], last: frames[frames.length - 1] } : { first: frames[0] };
      for (const [part, f] of Object.entries(parts)) {
        f.split('\n').forEach((c, j) => {
          flat[`${name}.frames.${part}[${j}]`] = `s:${c}`;
        });
      }
    }
    for (const [p, v] of Object.entries(sc.snap)) {
      flat[`${name}.${p}`] = v;
    }
  }
  return flat;
}

async function sample() {
  rules.length = 0;
  const out = {};
  await quadPage(out);
  await wingPage(out);
  return out;
}

const typeOf = (spelling) => spelling.split(':')[0];

function report() {
  let bad = 0;
  for (const r of rules) {
    bad += r.ok ? 0 : 1;
    console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`);
  }
  return bad;
}

if (recording) {
  const runs = [];
  let bad = 0;
  for (let i = 0; i < RECORD_RUNS; i += 1) {
    console.log(`recording run ${i + 1} of ${RECORD_RUNS}`);
    runs.push(flatten(await sample()));
    bad += report();
  }
  if (bad > 0) {
    console.log(`reset-check: ${bad} rule(s) FAILED, nothing recorded`);
    process.exit(1);
  }
  const stable = {};
  const moving = {};
  const paths = new Set(runs.flatMap((r) => Object.keys(r)));
  for (const p of [...paths].sort()) {
    const vals = runs.map((r) => r[p]);
    if (vals.some((v) => v === undefined)) {
      continue;
    }
    if (vals.every((v) => v === vals[0])) {
      stable[p] = vals[0];
    } else {
      moving[p] = typeOf(vals[0]);
    }
  }
  writeFileSync(RECORD, `${JSON.stringify({ stable, moving }, null, 1)}\n`);
  console.log(`reset-check: recorded ${RECORD}: ${Object.keys(stable).length} stable, ${Object.keys(moving).length} moving`);
  process.exit(0);
}

const now = flatten(await sample());
let failed = report();
const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const diffs = [];
for (const [p, want] of Object.entries(record.stable)) {
  if (now[p] !== want) diffs.push(`${p}: want ${want}, got ${now[p]}`);
}
for (const [p, want] of Object.entries(record.moving)) {
  if (now[p] === undefined || typeOf(now[p]) !== want) diffs.push(`${p}: want a ${want}, got ${now[p]}`);
}
console.log(`  ${diffs.length === 0 ? 'pass' : 'FAIL'}  record: ${Object.keys(record.stable).length} stable and ${Object.keys(record.moving).length} moving paths${diffs.length ? `, ${diffs.length} differ` : ''}`);
for (const d of diffs.slice(0, 30)) console.log(`        ${d}`);
failed += diffs.length ? 1 : 0;
if (failed > 0) {
  console.log(`reset-check: ${failed} FAILED`);
  process.exit(1);
}
console.log('reset-check: ok');
