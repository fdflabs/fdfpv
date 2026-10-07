/*
 * config-swap-check.js: the shell's clocks and config loads, in the real page.
 *
 *   node scripts/config-swap-check.js
 *
 * Three promises src/main.js makes about the flight controller's config
 * and the clocks that hang off the module, none of which a golden can see
 * because every one of them is about WHEN, not what:
 *
 *   - the shell's step index mirrors the module's on every frame, across a
 *     takeoff, a pause, a rate change, a resume and an R, so a stick sample
 *     is never stamped into the integrator's future;
 *   - a rate change mid run re-inits the module but leaves the run alone:
 *     the craft stays where it was (stationary, the ABI cannot carry its
 *     velocity), the lap clock keeps its time, the record key moves, the
 *     stick queue and the radio start again on the module's new clock;
 *   - tune loads are generation counted: a tune overtaken by a newer pick
 *     is never flown, and Fly waits for the load that is current when it
 *     settles, not for the one that was current when Fly was pressed.
 *
 * Two pages: a five inch on the Swiss valley for the clocks and the rate
 * change, and a fixed wing (three tunes) for the tune loads.
 *
 * Exit 0 when every check passed and neither page logged a console error.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { tunesFor } from '../configs/registry.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WAIT = 60000;

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function seedFor(airframe) {
  const settings = {
    ...seatAirframe({ airframe, rates: airframeById(airframe).rates }, airframe),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: false,
    sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/*
 * Read every animation frame, page side, so no frame is stepped over: the
 * shell's step index against the module's own clock, and the tune and mode
 * whenever either changes. A frame runs to completion before the next rAF
 * callback, so a mismatch here is one a stick sample would have seen.
 */
const RECORDER = `(() => {
  window.__cfg = { frames: 0, checked: 0, skew: [], trail: [] };
  const tick = () => {
    const c = window.__cfg;
    c.frames += 1;
    const p = window.__stickPath();
    c.checked += 1;
    if (p.simStepIdx !== p.moduleMs && c.skew.length < 20) {
      c.skew.push({ frame: c.frames, mode: window.__craftState().mode, idx: p.simStepIdx, module: p.moduleMs });
    }
    const now = window.__craftState().mode + ' ' + window.__tune().id + ' ' + p.configGen;
    if (c.trail[c.trail.length - 1] !== now) {
      c.trail.push(now);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const json = (page, expr) => page.evaluate(`JSON.stringify(${expr})`).then(JSON.parse);

async function frames(page, n) {
  const f0 = await page.evaluate('window.__cfg.frames');
  await page.until(`window.__cfg.frames >= ${f0 + n}`, WAIT);
}

async function boot(airframe) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seedFor(airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 120000);
  await page.sleep(1000);
  /* Nothing here reads a pixel. On a CI runner, which renders in software
   * on two cores, a drawn frame of the valley takes seconds, and the pad
   * shot (which advances per frame, capped per frame) did not end inside a
   * minute; turtle:check hit the same wall. The draw is skipped with the
   * perf checks' hook; the loop and the plant run as they do with it. */
  await page.evaluate('window.__drawOff(true)');
  await page.evaluate(RECORDER);
  return page;
}

function errorsOf(page) {
  return page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
}

/* The same frame invariant at the end of every scenario. */
async function noSkew(page, what) {
  const c = await json(page, 'window.__cfg');
  check(`${what}: the shell's step index equals the module's on all ${c.checked} frames`, c.checked > 0 && c.skew.length === 0,
    JSON.stringify(c.skew.slice(0, 3)));
}

/* The step index and the RC grid as adoptSimClock leaves them. */
function gridPinned(p) {
  return p.simStepIdx === p.moduleMs && p.rcNextMs === p.simStepIdx && p.lastTs === p.rcNextMs / 1000;
}

async function rateChange(page) {
  console.log('\na five inch: fly, pause in the air, change a rate, resume, restart');
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight' && window.__intro().ms < 0", WAIT);
  /* A real link, so the radio has a frame count for the restart to zero.
   * In the settings as well, or the rate change's applySettings puts the
   * stored one back and the zero would be the preset change's. */
  await page.evaluate("window.__ui.settings.link = 'elrs250'; window.__link('elrs250'); true");
  await page.evaluate('window.__stick(0, 0, 0, 0.75)');
  await page.until('!window.__craftState().landed', WAIT);
  await frames(page, 40);
  await page.evaluate('window.__stick(0, 0, 0, 0.5)');
  await frames(page, 10);
  await page.evaluate("window.__ui.onAction('pause'); true");
  await frames(page, 5);
  const before = await json(page, `({
    s: window.__craftState(), p: window.__stickPath(), link: window.__link(),
    anim: window.__animMs(), srate: window.__tune().rollSrateSet,
  })`);
  check('paused in the air, the link has sent frames', before.s.mode === 'paused' && !before.s.landed && before.s.worldY > 0 && before.link.sent > 0,
    `mode ${before.s.mode} landed ${before.s.landed} sent ${before.link.sent}`);
  check('the lap clock is running', before.anim > 0, String(before.anim));
  check('before the change the grid is on the module clock', before.p.simStepIdx === before.p.moduleMs, `${before.p.simStepIdx} ${before.p.moduleMs}`);
  /* The same tune, so applySettings takes the rates branch and nothing else. */
  const after = await json(page, `(() => {
    window.__ui.settings.rates.roll.srate += 5;
    window.__setTune(window.__tune().id);
    return {
      s: window.__craftState(), p: window.__stickPath(), link: window.__link(),
      srate: window.__tune().rollSrateSet, mode: window.__craftState().mode,
    };
  })()`);
  const at = (v) => `${v.x.toFixed(9)} ${v.y.toFixed(9)} ${v.z.toFixed(9)}`;
  check('the craft stays where it was', after.s.plantPos.x === before.s.plantPos.x && after.s.plantPos.y === before.s.plantPos.y
    && after.s.plantPos.z === before.s.plantPos.z, `${at(before.s.plantPos)} then ${at(after.s.plantPos)}`);
  check('and on the same attitude', Math.abs(after.s.up.x - before.s.up.x) < 1e-12 && Math.abs(after.s.up.y - before.s.up.y) < 1e-12
    && Math.abs(after.s.fwd.z - before.s.fwd.z) < 1e-12, `${at(before.s.up)} then ${at(after.s.up)}`);
  check('stationary, the velocity cannot follow', after.s.speed === 0, String(after.s.speed));
  check('still flying, still paused', !after.s.landed && after.mode === 'paused' && !after.s.crashed);
  check('the module took the rate', after.srate === before.srate + 5, `${before.srate} to ${after.srate}`);
  check('the module clock restarted and the shell followed it', after.p.moduleMs === 0 && gridPinned(after.p), JSON.stringify(after.p));
  check('the stick queue is empty', after.p.pending === 0, String(after.p.pending));
  check('the radio restarted with the grid, on the same link', after.link.id === 'elrs250' && after.link.sent === 0 && after.link.dropped === 0,
    JSON.stringify(after.link));
  check('a rate change is not a config generation', after.p.configGen === before.p.configGen, `${before.p.configGen} ${after.p.configGen}`);
  await frames(page, 5);
  const anim = await page.evaluate('window.__animMs()');
  check('the lap clock kept its time', anim === before.anim, `${before.anim} then ${anim}`);

  await page.evaluate("window.__ui.onAction('resume'); true");
  await page.until("window.__craftState().mode === 'flight'", WAIT);
  await frames(page, 30);
  const flying = await json(page, '({ s: window.__craftState(), p: window.__stickPath(), link: window.__link() })');
  check('resumed, it flies on from there on the new clock', flying.p.moduleMs > 0 && !flying.s.landed && flying.link.sent > 0,
    `module ${flying.p.moduleMs} sent ${flying.link.sent}`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await page.evaluate("window.__ui.onAction('restart', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight' && window.__craftState().landed", WAIT);
  await frames(page, 10);
  const r = await json(page, '({ s: window.__craftState(), p: window.__stickPath() })');
  check('Restart run puts it back on the pad, on the module clock', r.s.landed && r.p.simStepIdx === r.p.moduleMs,
    `landed ${r.s.landed} ${r.p.simStepIdx} ${r.p.moduleMs}`);
  await page.evaluate('window.__stick(0, 0, 0, 0.75)');
  await page.until('!window.__craftState().landed', WAIT);
  await frames(page, 20);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await noSkew(page, 'fly, pause, rate change, resume, restart, take off');
}

async function tuneLoads(page, tunes) {
  const start = await json(page, '({ t: window.__tune().id, g: window.__stickPath().configGen })');
  const [b, c] = tunes.filter((t) => t !== start.t);
  const a = start.t;
  console.log(`\na fixed wing on ${a}, generation ${start.g}: ${b} and ${c} picked in a hurry`);
  await page.evaluate(`(window.__setTune(${JSON.stringify(b)}), window.__setTune(${JSON.stringify(c)}), true)`);
  await page.until(`window.__tune().id === ${JSON.stringify(c)}`, WAIT);
  await frames(page, 10);
  const two = await json(page, '({ t: window.__tune().id, g: window.__stickPath().configGen, trail: window.__cfg.trail })');
  check(`${b} overtaken by ${c}: ${c} flies and ${b} never did`, two.t === c && !two.trail.some((e) => e.split(' ')[1] === b),
    JSON.stringify(two.trail));
  check('two picks are two generations', two.g === start.g + 2, `${start.g} to ${two.g}`);

  /*
   * Fly pressed between two picks. Fly's wait began on the first pick's
   * load, which settles without flying it; the wait has to move on to the
   * second pick's load, so the run starts on that tune and not before.
   */
  console.log(`    then ${b}, Fly, ${a}`);
  const pressed = await json(page, `(() => {
    window.__shown = [];
    const ui = window.__ui;
    const show = ui.show;
    ui.show = function (name, ...rest) {
      if (name === 'flight') {
        window.__shown.push({ tune: window.__tune().id, g: window.__stickPath().configGen });
      }
      return show.call(this, name, ...rest);
    };
    window.__setTune(${JSON.stringify(b)});
    ui.onAction('fly', ui.settings);
    window.__setTune(${JSON.stringify(a)});
    return { mode: window.__craftState().mode, g: window.__stickPath().configGen };
  })()`);
  check('Fly does not start the run in the same task', pressed.mode !== 'flight', pressed.mode);
  await page.until("window.__craftState().mode === 'flight'", WAIT);
  await frames(page, 10);
  const shown = await json(page, '({ shown: window.__shown, t: window.__tune().id, trail: window.__cfg.trail })');
  check(`the run starts once, on ${a}, the pick that was current when the load settled`,
    shown.shown.length === 1 && shown.shown[0].tune === a && shown.shown[0].g === pressed.g && pressed.g === two.g + 2,
    JSON.stringify({ shown: shown.shown, g: pressed.g }));
  check(`${b} was never flown`, !shown.trail.slice(two.trail.length).some((e) => e.split(' ')[1] === b), JSON.stringify(shown.trail));

  /* Nothing loading: Fly still waits a turn, then flies on what is there. */
  await page.evaluate("window.__ui.onAction('title'); true");
  await page.until("window.__craftState().mode === 'title'", WAIT);
  const idle = await page.evaluate("window.__shown = []; window.__ui.onAction('fly', window.__ui.settings); window.__craftState().mode");
  check('with no load pending Fly still answers on the next turn', idle !== 'flight', idle);
  await page.until("window.__craftState().mode === 'flight'", WAIT);
  const again = await json(page, 'window.__shown');
  check('and flies the tune that is loaded', again.length === 1 && again[0].tune === a, JSON.stringify(again));
  await frames(page, 10);
  await noSkew(page, 'tune loads and Fly');
}

let errors = 0;
for (const [airframe, run] of [
  ['interceptor', rateChange],
  ['sky1800', (page) => tuneLoads(page, tunesFor('sky1800').map((t) => t.id))],
]) {
  const page = await boot(airframe);
  try {
    await run(page);
  } finally {
    const errs = errorsOf(page);
    errors += errs.length;
    for (const e of errs) {
      console.log(`  ERR ${e}`);
    }
    await page.close();
  }
}
console.log(`\n${failed} check(s) failed; ${errors} console error(s)`);
process.exit(failed || errors ? 1 : 0);
