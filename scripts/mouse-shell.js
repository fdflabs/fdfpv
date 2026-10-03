/*
 * mouse-shell.js: mouse flight in the real shell, headless, flown with
 * nothing but the mouse and its wheel.
 *
 * Every input here is a DevTools Input.dispatchMouseEvent, so it reaches
 * the page the way a pilot's mouse does: a click to capture the pointer,
 * wheel notches for the throttle, movement for the stick. No __stick, no
 * key, no poke into the InputManager. The pilot is a small loop in this
 * process reading __craftState and answering with the mouse.
 *
 *   1. A five inch in Track mode, in Acro, where the mouse stick springs
 *      back: wheel it off the start, then hold a hover on the wheel alone,
 *      nudging the attitude level with the mouse.
 *   2. The Timber in Free Flight on swiss2, on its Acro tune, where the stick
 *      stays put: wheel to full,
 *      off the strip, a climb held with the mouse, and a bank to the right.
 *
 * Each asserts on what the aircraft did, not on a stopwatch: headless draws
 * a frame in a large fraction of a second and the sim runs slower than the
 * page's clock. `--shots=DIR` keeps a picture of each in flight.
 *
 *   node scripts/mouse-shell.js [--shots=DIR] [--only=quad|plane]
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
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const SHOTS = arg('shots');
const ONLY = arg('only');
const W = 800;
const H = 450;

let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
};

const SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.mouseFlight = true;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* Storage refused. The run still boots, and the check below says mouse flight is off. */ }`;

/* The pointer, as DevTools sees it. Under pointer lock only the movement
 * between two positions reaches the page, so the cursor is walked, and
 * brought back toward the middle only in steps small enough to be part of
 * a correction rather than a flick of its own. */
function makeMouse(page) {
  let x = W / 2;
  let y = H / 2;
  const send = (params) => page.cdp.send('Input.dispatchMouseEvent', params, page.sessionId);
  return {
    async click() {
      await send({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async move(dx, dy) {
      const nx = Math.round(Math.max(20, Math.min(W - 20, x + dx)));
      const ny = Math.round(Math.max(20, Math.min(H - 20, y + dy)));
      if (nx === x && ny === y) {
        return;
      }
      x = nx;
      y = ny;
      await send({ type: 'mouseMoved', x, y });
    },
    async wheel(notches) {
      for (let i = 0; i < Math.abs(notches); i += 1) {
        await send({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: notches > 0 ? -100 : 100 });
      }
    },
    where: () => ({ x, y }),
  };
}

/* Bank and nose up, degrees, from the frame vectors __craftState reports
 * in three.js space; the same arithmetic scripts/bombshell-shell.js uses. */
function attitude(c) {
  const rightY = c.fwd.z * c.up.x - c.fwd.x * c.up.z;
  const deg = (v) => Math.asin(Math.max(-1, Math.min(1, v))) * 180 / Math.PI;
  return { bank: deg(-rightY), pitch: deg(c.fwd.y) };
}

async function shot(page, name) {
  if (!SHOTS) {
    return;
  }
  await mkdir(SHOTS, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'));
  console.log(`    picture: ${join(SHOTS, name)}`);
}

async function capture(page, mouse) {
  await page.until('window.__mouseLock().wants', 60000);
  await mouse.click();
  let ok = true;
  await page.until('window.__mouseLock().live', 10000).catch(() => { ok = false; });
  if (!ok) {
    console.log(`    not captured: ${await page.evaluate("JSON.stringify({ screen: window.__ui.screen, lock: window.__mouseLock(), banner: window.__craftState().banner })")}`);
  }
  return ok;
}

/* simMs is the module's own clock. Every duration below is counted on it,
 * because a loaded machine can draw a frame in seconds and a wall clock
 * would call a hover held that the aircraft never flew. */
const state = (page) => page.evaluate('(() => { const p = window.__stickPath(); return { c: window.__craftState(), m: window.__mouseLock(), simMs: p.moduleMs, held: p.held.throttle, fps: p.fps }; })()');

async function quad(page) {
  console.log('five inch, Track mode, Acro:');
  await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race';
    ui.settings.airframe = 'interceptor'; ui.settings.flightMode = 'acro'; ui.onAction('fly', ui.settings); return true; })()`);
  await page.until("window.__craftState().mode === 'flight' && window.__craft().run === 'interceptor'", 300000);
  const mouse = makeMouse(page);
  say(await capture(page, mouse), 'one click captures the pointer and the mouse is live');
  let { c, m, simMs, held, fps } = await state(page);
  say(m.source === 'the mouse' && m.centring === 'spring' && Math.abs(m.step - 0.02) < 1e-9 && !m.angle,
    `the mouse is the source, the stick springs back, a notch is 2 percent, and it flies Acro: ${m.source}, ${m.centring}, ${m.step}, angle ${m.angle}`);
  /* Fifteen notches, 30 percent, to start; more below until it leaves the
   * ground, then the wheel holds it near two metres. */
  await mouse.wheel(15);
  const TARGET = 2;
  let lastSim = simMs;
  let airborneMs = 0;
  let groundMs = 0;
  let lookMs = 0;
  let hoverEst = -1;
  const y0 = c.worldY;
  const heldThr = [];
  let hoverMs = 0;
  let bestHoverMs = 0;
  let worstTilt = 0;
  let notchesUp = 15;
  let notchesDown = 0;
  let peakH = 0;
  const t0 = Date.now();
  let shotTaken = false;
  while (Date.now() - t0 < 1200000) {
    ({ c, m, simMs, held, fps } = await state(page));
    if (c.crashed || c.mode !== 'flight') {
      break;
    }
    const dtSim = simMs - lastSim;
    if (dtSim < 50) {
      /* The module has not moved on since the last look: nothing to answer. */
      await page.sleep(100);
      continue;
    }
    /* Height off the start, not over the ground under the quad: a drift
     * across a slope is not a climb. */
    const h = c.worldY - y0;
    const climb = c.vel.y;
    lastSim = simMs;
    peakH = Math.max(peakH, h);
    if (h > 0.3) {
      airborneMs += dtSim;
    }
    if (Math.floor(simMs / 5000) !== Math.floor((simMs - dtSim) / 5000)) {
      console.log(`    sim ${(simMs / 1000).toFixed(1)} s: height ${h.toFixed(2)} m, throttle ${(m.channels.throttle * 100).toFixed(0)} percent (module holds ${(held * 100).toFixed(0)}), ${fps} fps`);
    }
    /* Still down: a notch more each second, the way a pilot feels for
     * the takeoff. Up: the wheel is the collective, one notch a look. */
    if (airborneMs === 0) {
      groundMs += dtSim;
      if (groundMs > 1000) {
        groundMs = 0;
        await mouse.wheel(1);
        notchesUp += 1;
      }
    } else {
      /*
       * Height hold on the wheel: a PI on climb rate. The height error asks
       * for a climb, the climb error moves the throttle about an estimate
       * of hover, and that estimate integrates the error that is left. The
       * answer is rounded to the wheel's 2 percent notches, which is the
       * one thing a thumb cannot do better. Four looks a second of sim.
       */
      lookMs += dtSim;
      if (hoverEst < 0) {
        hoverEst = m.channels.throttle - 0.02;
      }
      if (lookMs >= 250) {
        const dt = lookMs / 1000;
        lookMs = 0;
        const wantClimb = Math.max(-0.8, Math.min(0.8, 0.8 * (TARGET - h)));
        const err = wantClimb - climb;
        hoverEst = Math.max(0.1, Math.min(0.7, hoverEst + 0.006 * err * dt));
        const want = hoverEst + 0.03 * err;
        const notches = Math.max(-3, Math.min(3, Math.round((want - m.channels.throttle) / 0.02)));
        if (notches !== 0) {
          await mouse.wheel(notches);
          if (notches > 0) {
            notchesUp += notches;
          } else {
            notchesDown -= notches;
          }
        }
      }
    }
    /* Acro holds whatever attitude it has, so level is the pilot's job:
     * a few counts of mouse against any bank or pitch it has picked up. */
    const a = attitude(c);
    const tilt = Math.max(Math.abs(a.bank), Math.abs(a.pitch));
    if (h > 0.5) {
      worstTilt = Math.max(worstTilt, tilt);
    }
    const dx = Math.max(-30, Math.min(30, -a.bank * 3));
    const dy = Math.max(-30, Math.min(30, -a.pitch * 3));
    if (Math.abs(a.bank) > 1 || Math.abs(a.pitch) > 1) {
      await mouse.move(Math.round(dx), Math.round(dy));
    }
    /* The hover is the longest UNBROKEN stretch in the band. */
    hoverMs = h > 1 && h < 3.5 ? hoverMs + dtSim : 0;
    if (hoverMs > 0) {
      heldThr.push(m.channels.throttle);
    }
    bestHoverMs = Math.max(bestHoverMs, hoverMs);
    if (!shotTaken && hoverMs > 4000) {
      shotTaken = true;
      await shot(page, 'quad-hover.png');
    }
    if (hoverMs > 12000) {
      break;
    }
    await page.sleep(100);
  }
  ({ c, m } = await state(page));
  const hEnd = c.worldY - y0;
  const hover = heldThr.length ? heldThr.reduce((x, y) => x + y, 0) / heldThr.length : 0;
  console.log(`    hover throttle, the mean held in the band: ${(hover * 100).toFixed(1)} percent`);
  /* What one notch either side of hover does, three seconds of sim each:
   * the number that says whether 2 percent is fine enough for a thumb. */
  if (!c.crashed && c.mode === 'flight') {
    const base = Math.round(hover / 0.02) * 0.02;
    for (const at of [base - 0.02, base, base + 0.02]) {
      ({ m } = await state(page));
      await mouse.wheel(Math.round((at - m.channels.throttle) / 0.02));
      let s0 = null;
      for (;;) {
        ({ c, m, simMs } = await state(page));
        if (s0 === null) {
          s0 = { t: simMs, y: c.worldY };
        }
        if (simMs - s0.t >= 3000 || c.crashed) {
          break;
        }
        const a = attitude(c);
        if (Math.abs(a.bank) > 1 || Math.abs(a.pitch) > 1) {
          await mouse.move(Math.round(Math.max(-30, Math.min(30, -a.bank * 3))), Math.round(Math.max(-30, Math.min(30, -a.pitch * 3))));
        }
        await page.sleep(100);
      }
      console.log(`    held at ${(m.channels.throttle * 100).toFixed(0)} percent for 3 s of sim: ${((c.worldY - s0.y) / ((simMs - s0.t) / 1000)).toFixed(2)} m/s mean climb`);
    }
  }
  console.log(`    height ${hEnd.toFixed(2)} m, peak ${peakH.toFixed(2)} m, throttle ${(m.channels.throttle * 100).toFixed(0)} percent, notches up ${notchesUp} down ${notchesDown}, worst tilt ${worstTilt.toFixed(1)} deg`);
  say(!c.crashed && c.mode === 'flight', 'not crashed');
  say(airborneMs > 0 && peakH > 1, `the wheel took it off the ground: peak ${peakH.toFixed(2)} m`);
  say(bestHoverMs > 12000, `and held it between 1 and 3.5 m on the wheel, unbroken, for 12 s of sim time: ${(bestHoverMs / 1000).toFixed(1)} s`);
  say(Math.abs(m.channels.throttle - Math.round(m.channels.throttle / 0.02) * 0.02) < 1e-9,
    `the throttle sits on a notch: ${m.channels.throttle}`);
  say(worstTilt < 25, `the mouse kept it near level: worst ${worstTilt.toFixed(1)} deg`);
  await page.evaluate("window.__ui.onAction('title', window.__ui.settings); true");
  let freed = true;
  await page.until("window.__craftState().mode !== 'flight' && !window.__mouseLock().locked", 120000).catch(() => { freed = false; });
  say(freed, 'leaving flight lets the pointer go');
}

async function plane(page) {
  console.log('Timber, Free Flight, swiss2, Acro tune:');
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  await page.evaluate(`(() => { const ui = window.__ui; ui.settings.airframe = 'timber1500'; ui.settings.tune = 'timber-acro';
    ui.settings.wingView = 'fpv'; ui.onAction('fly', ui.settings); return true; })()`);
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__craft().run === 'timber1500'", 400000);
  const mouse = makeMouse(page);
  say(await capture(page, mouse), 'one click captures the pointer');
  let { c, m, simMs } = await state(page);
  say(m.source === 'the mouse' && m.centring === 'hold' && Math.abs(m.step - 0.05) < 1e-9,
    `a plane, even on its Acro tune: the stick stays put and a notch is 5 percent: ${m.centring}, ${m.step}`);
  /* The stick stays put, so the pilot flies it to a position, reading
   * where it is off the gimbal on screen: 300 counts is a full stick. */
  const stickTo = async (x, y) => {
    const clamp = (v) => Math.max(-0.6, Math.min(0.6, v));
    await mouse.move(Math.round((clamp(x) - m.stick.x) * 300), Math.round((clamp(y) - m.stick.y) * 300));
  };
  const rest = c.groundClearance;
  await mouse.wheel(20);
  ({ m } = await state(page));
  say(m.channels.throttle === 1, `twenty notches is full throttle: ${m.channels.throttle}`);
  let phase = 'roll';
  let airMs = 0;
  let lastSim = simMs;
  let tPhase = simMs;
  const events = [];
  const mark = (what, cc) => {
    const a = attitude(cc);
    events.push({
      what, height: cc.groundClearance - rest, speed: cc.speed, bank: a.bank, pitch: a.pitch,
    });
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 1800000 && phase !== 'done') {
    ({ c, m, simMs } = await state(page));
    if (c.crashed || c.mode !== 'flight') {
      mark('crashed', c);
      break;
    }
    const dtSim = simMs - lastSim;
    if (dtSim < 50) {
      await page.sleep(100);
      continue;
    }
    lastSim = simMs;
    const h = c.groundClearance - rest;
    const a = attitude(c);
    const inPhase = (simMs - tPhase) / 1000;
    if (Math.floor(simMs / 5000) !== Math.floor((simMs - dtSim) / 5000)) {
      console.log(`    sim ${(simMs / 1000).toFixed(1)} s: ${phase}, height ${h.toFixed(2)} m, speed ${c.speed.toFixed(1)} m/s, pitch ${a.pitch.toFixed(1)}, bank ${a.bank.toFixed(1)}`);
    }
    if (phase === 'roll') {
      airMs = h < 0.3 ? 0 : airMs + dtSim;
      if (airMs > 1000) {
        mark('airborne', c);
        phase = 'climb';
        tPhase = simMs;
      } else if (inPhase > 60) {
        mark('failed-roll', c);
        break;
      }
    } else if (phase === 'climb') {
      /* A ten degree climb, wings level: back stick for nose up (+y),
       * sideways against any bank. */
      await stickTo(-0.03 * a.bank, 0.03 * (10 - a.pitch));
      if (h > 8) {
        mark('climbed', c);
        await shot(page, 'plane-climb.png');
        phase = 'bank';
        tPhase = simMs;
      } else if (inPhase > 60) {
        mark('failed-climb', c);
        break;
      }
    } else if (phase === 'bank') {
      /* Right, to twenty five degrees, the nose held a little up. */
      await stickTo(0.03 * (25 - a.bank), 0.03 * (5 - a.pitch));
      if (a.bank > 20) {
        mark('banked', c);
        phase = 'done';
      } else if (inPhase > 30) {
        mark('failed-bank', c);
        break;
      }
    }
    await page.sleep(100);
  }
  for (const e of events) {
    console.log(`    ${e.what.padEnd(12)} speed ${e.speed.toFixed(2)} m/s, height ${e.height.toFixed(2)} m, pitch ${e.pitch.toFixed(1)}, bank ${e.bank.toFixed(1)}`);
  }
  const ev = (w) => events.find((e) => e.what === w);
  say(Boolean(ev('airborne')), 'full throttle on the wheel: off the strip');
  say(Boolean(ev('climbed')), `a climb held on the mouse to 8 m${ev('climbed') ? ` at ${ev('climbed').speed.toFixed(1)} m/s` : ''}`);
  say(Boolean(ev('banked')), `and a bank to the right on the mouse: ${ev('banked') ? `${ev('banked').bank.toFixed(1)} deg` : 'never'}`);
  say(!events.some((e) => e.what === 'crashed' || e.what.startsWith('failed')), 'not crashed');
  if (ev('banked')) {
    /* The chase camera for the picture, on C, a key the mouse mode keeps. */
    await page.tap('KeyC');
    await page.until("window.__ui.settings.wingView === 'chase'", 10000).catch(() => {});
    await page.sleep(2500);
    ({ c } = await state(page));
    say(!c.crashed, `C, the plane's view key, still works in mouse flight: ${await page.evaluate('window.__ui.settings.wingView')}`);
    await shot(page, 'plane-chase.png');
  }
}

const page = await openPage({ root, width: W, height: H, seed: [SEED] });
try {
  await page.until('!!window.__shellReady', 240000);
  say(await page.evaluate('window.__ui.settings.mouseFlight === true'), 'Mouse flight is on, from the stored settings');
  if (ONLY !== 'plane') {
    await quad(page);
  }
  if (ONLY !== 'quad') {
    await plane(page);
  }
  const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
  say(uncaught.length === 0, `no uncaught exception${uncaught.length ? `: ${uncaught.slice(0, 2).join(' | ')}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
