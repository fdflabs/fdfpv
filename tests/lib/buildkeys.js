/*
 * buildkeys.js: the in-sim builder's own controls, driven through the page.
 *
 * The builder is a creative mode (src/builder/buildmode.js): the mouse is
 * taken, a left click places, a right click removes, Alt held hangs a
 * piece in the air, the wheel with Ctrl sets how far, 1 to 9 pick from the
 * hotbar and E opens every piece. Every check that builds something
 * (scripts/build-check.js, map-share-check.js, map-plane-check.js) drives
 * it here with real mouse and key events over the DevTools protocol, so a
 * control that stops working fails all of them, and none of them reaches
 * into the builder to place a gate for itself.
 *
 * Only the camera is put in place directly (window.__build.look): flying
 * it there with W A S D on a software rasteriser at a frame a second would
 * be minutes a gate and prove nothing a flight check does not.
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

import { keyInfo } from './page.js';

export const B = (expr) => `window.__build.state()${expr}`;

/* CDP's modifier bits. */
const MOD = { alt: 1, ctrl: 2, shift: 8 };
const MOD_KEYS = {
  alt: { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 },
  ctrl: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
  shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
};

function bits(mods) {
  return Object.keys(MOD).reduce((m, k) => m | (mods[k] ? MOD[k] : 0), 0);
}

/* Wait for n of the page's own frames: the builder reads its keys and
 * paints its hud in the shell's frame, so a reading taken after frames is
 * a reading of the builder's answer, however slow the machine. */
export const frames = (page, n) => page.evaluate(`new Promise((done) => { let k = ${n}; const f = () => { k -= 1; if (k <= 0) { done(true); } else { requestAnimationFrame(f); } }; requestAnimationFrame(f); })`);

async function modsDown(page, mods) {
  let m = 0;
  for (const k of Object.keys(MOD)) {
    if (mods[k]) {
      m |= MOD[k];
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...MOD_KEYS[k], modifiers: m }, page.sessionId);
    }
  }
}

async function modsUp(page, mods) {
  for (const k of Object.keys(MOD)) {
    if (mods[k]) {
      await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...MOD_KEYS[k] }, page.sessionId);
    }
  }
}

/* The brackets, which tests/lib/page.js does not know: the aircraft swap's
 * keys in flight. */
const BRACKETS = {
  BracketLeft: { key: '[', code: 'BracketLeft', windowsVirtualKeyCode: 219, text: '[' },
  BracketRight: { key: ']', code: 'BracketRight', windowsVirtualKeyCode: 221, text: ']' },
};

/* A key with modifiers held the way a keyboard sends them: the modifier's
 * own key first, so the shell's held set sees it as well as the flags. */
export async function key(page, code, mods = {}) {
  await modsDown(page, mods);
  const k = BRACKETS[code] ?? keyInfo(code);
  const m = bits(mods);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k, text: m & (MOD.ctrl | MOD.alt) ? undefined : k.text, modifiers: m }, page.sessionId);
  await page.sleep(30);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, modifiers: m }, page.sessionId);
  await modsUp(page, mods);
}

/* Hold a key down for n frames of the page's, then let it go. */
export async function holdKey(page, code, n) {
  const k = keyInfo(code);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k }, page.sessionId);
  await frames(page, n);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k }, page.sessionId);
}

async function centre(page) {
  return page.evaluate('({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) })');
}

/* A mouse button pressed and let go at (x, y), the page's centre unless
 * said, with modifiers held. `button` is 'left', 'right' or 'middle'. */
export async function click(page, button = 'left', at = {}) {
  const c = at.x == null ? await centre(page) : at;
  const m = bits(at);
  await modsDown(page, at);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button, clickCount: 1, modifiers: m }, page.sessionId);
  await page.sleep(40);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button, clickCount: 1, modifiers: m }, page.sessionId);
  await modsUp(page, at);
}

/* A drag with the left button from one page point to another, in steps,
 * a frame of the page's between each so the drag is seen moving. */
export async function dragMouse(page, from, to, steps = 8) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none' }, page.sessionId);
  await frames(page, 2);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 }, page.sessionId);
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }, page.sessionId);
    await frames(page, 1);
  }
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }, page.sessionId);
}

export async function moveMouse(page, x, y) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, page.sessionId);
}

/* One notch of the wheel, down (1) or up (-1), Ctrl held if asked. */
export async function wheel(page, notch, mods = {}) {
  const c = await centre(page);
  await modsDown(page, mods);
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: 100 * notch, modifiers: bits(mods),
  }, page.sessionId);
  await modsUp(page, mods);
  await frames(page, 1);
}

/* The mouse taken, the way a pilot takes it: a click on the world at the
 * left edge of the page, clear of the hud. */
export async function takeMouse(page) {
  if (await page.evaluate(B('.locked'))) {
    return;
  }
  const y = await page.evaluate('Math.round(innerHeight / 2)');
  await click(page, 'left', { x: 6, y });
  await page.until(B('.locked'), 5000);
}

/* The mouse freed, as Esc frees it (the browser's own key, which a
 * synthetic Esc does not reach), and moved onto the page. */
export async function freeMouse(page, x, y) {
  await page.evaluate('document.exitPointerLock(), true');
  await page.until(`!${B('.locked')}`, 5000);
  const c = x == null ? await centre(page) : { x, y };
  await moveMouse(page, c.x, c.y);
  await frames(page, 2);
}

/* The crosshair asks the GPU once the camera has rested; wait for that
 * exact reading, taken along the ray the camera is on now, hit or miss. */
/* Counted in the page's frames, not in milliseconds: the reading takes
 * the frame the camera stops on, one past REST_MS, the request's and the
 * fence's, a handful in all, and on the software rasteriser a frame of a
 * wide valley view is three or four seconds, so a wall clock wait was a
 * guess at the machine. */
const SETTLE_FRAMES = 12;
export async function settleCrosshair(page) {
  const settled = `(() => {
    const s = window.__build.state();
    if (!s.hitRay.exact) { return false; }
    const o = s.hitRay.origin;
    const c = s.camera.pos;
    const d = s.hitRay.dir;
    const f = s.camera.forward;
    return Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 1e-6 && Math.hypot(d[0] - f[0], d[1] - f[1], d[2] - f[2]) < 1e-6;
  })()`;
  for (let k = 0; !(await page.evaluate(settled)); k += 1) {
    if (k >= SETTLE_FRAMES) {
      const s = await page.evaluate(`(() => { const s = window.__build.state(); return { hitRay: s.hitRay, camera: s.camera, velocity: s.velocity, locked: s.locked, state: s.state }; })()`);
      throw new Error(`the crosshair never settled in ${SETTLE_FRAMES} frames: ${JSON.stringify(s)}, page errors ${JSON.stringify(page.errors.slice(-3))}`);
    }
    await frames(page, 1);
  }
  await frames(page, 2);
}

/* The free camera at `from`, looking along yaw and pitch, and the
 * crosshair's exact reading there. */
export async function lookAlong(page, from, yaw, pitch) {
  await page.evaluate(`window.__build.look(${from.join(',')}, ${yaw}, ${pitch})`);
  await settleCrosshair(page);
}

/* The free camera at `from`, looking at `at`. */
export async function lookAt(page, from, at) {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  const dz = at[2] - from[2];
  await lookAlong(page, from, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
}

/* A piece in hand: its hotbar slot's number if it is on the hotbar, or
 * from the inventory (E) into the slot in hand if it is not. */
export async function hold(page, pieceId) {
  const bar = await page.evaluate(B('.hotbar'));
  const at = bar.indexOf(pieceId);
  if (at >= 0) {
    await key(page, `Digit${at + 1}`);
  } else {
    await key(page, 'KeyE');
    await page.until(B('.inventory'), 5000);
    const tile = (await page.evaluate('window.__build.rects().tiles')).find((t) => t.id === pieceId);
    await click(page, 'left', tile);
    await page.until(`${B('.piece')} === ${JSON.stringify(pieceId)}`, 5000);
    await key(page, 'KeyE');
    await page.until(`!${B('.inventory')}`, 5000);
    await takeMouse(page);
  }
  await page.until(`${B('.piece')} === ${JSON.stringify(pieceId)}`, 5000);
}

/* Left click with the mouse taken, Alt held for the air, and wait for the
 * track to have one more gate. The new gate's race frame. */
export async function placeHere(page, { air = false } = {}) {
  await takeMouse(page);
  const n = await page.evaluate(B('.gates.length'));
  await click(page, 'left', { alt: air });
  await page.until(`${B('.gates.length')} === ${n + 1}`, 10000);
  /* The builder selects what it has just placed. */
  const st = await page.evaluate(B(''));
  return st.gates.find((g) => g.id === st.selected);
}

/* The air distance set with Ctrl and the wheel, a notch at a time, to the
 * nearest notch at or past `metres`. */
export async function airTo(page, metres) {
  for (let i = 0; i < 100; i += 1) {
    const d = await page.evaluate(B('.airDistance'));
    if (Math.abs(d - metres) <= 1) {
      return d;
    }
    await wheel(page, d < metres ? -1 : 1, { ctrl: true });
  }
  return page.evaluate(B('.airDistance'));
}

/* Hang the piece in hand level in the air with its opening centred at p,
 * flown along the horizontal unit t: the camera the air distance back
 * from p, looking along t, Alt held for the click. */
export async function hangAt(page, p, t) {
  const dist = await page.evaluate(B('.airDistance'));
  await lookAlong(page, p.map((v, i) => v - t[i] * dist), Math.atan2(-t[0], -t[2]), 0);
  return placeHere(page, { air: true });
}

/* The builder left: Esc until it is off, the way a pilot backs out. */
export async function leave(page) {
  for (let i = 0; i < 6 && (await page.evaluate(B('.state'))) === 'building'; i += 1) {
    if (await page.evaluate(B('.locked'))) {
      await page.evaluate('document.exitPointerLock(), true');
      await page.sleep(300);
    }
    await key(page, 'Escape');
    await frames(page, 2);
  }
}
