/*
 * peermarks-selftest.js: the peer marks' arithmetic, proven in Node.
 *
 * Drives the pure functions in src/ui/peermarks.js with a synthetic camera
 * and synthetic terrain, no browser and no GL: when a peer needs a mark
 * (size on screen, range, the ground behind it, the terrain in front of
 * it), how the mark fades, where an off screen arrow is pinned and how it
 * is kept off the centre and off the readouts at desktop and phone sizes,
 * and whether the seat palette holds its contrasts over the sky and grass
 * the Swiss valley renders.
 *
 * Run: node scripts/peermarks-selftest.js   (npm run marks:selftest)
 * Exit code is the failure count, like the other selftests.
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

import {
  HALO, KIND_EDGE, KIND_OVER, MARK, MARK_CONTRAST, MARK_ROLES, SEAT_COLOURS, SIDE_BOTTOM, SIDE_LEFT, SIDE_RIGHT, SIDE_TOP,
  addRect, clearRects, fadeToward, groundBehind, makeCam, makeMark, makeScreen, markNeed, pinToEdge, planMark,
  rangeKey, rangeText, seatColour, setScreen, spreadEdges, terrainHides,
} from '../src/ui/peermarks.js';
import { PUBLIC_CAP } from '../src/share/roomwire.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/*
 * The backgrounds, sampled from the Swiss valley as the shell draws it at
 * the default quality, headless Chromium with SIM_GPU=1, in the pictures
 * of scripts/peermarks-two-page.js from the parked Cub: the darkest,
 * median and brightest twentieth of the pixels of the sky over the valley
 * (chase and FPV) and of the grass in front of the aircraft.
 */
const SKY = ['#5d718e', '#768ca2', '#b4b39f'];
const GRASS = ['#3e4113', '#5e6f2b', '#868d47'];
/* The next gate's mark (index.html .lock): green on the right side, red
 * on the wrong one. A pilot's colour must never be read as either. */
const GATE = ['#39ff8b', '#ff5a5a'];

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex) {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function hue(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 1e-6) {
    return -1;
  }
  let h;
  if (max === r) {
    h = ((g - b) / (max - min)) % 6;
  } else if (max === g) {
    h = (b - r) / (max - min) + 2;
  } else {
    h = (r - g) / (max - min) + 4;
  }
  return (h * 60 + 360) % 360;
}
function rgbDist(a, b) {
  const x = rgb(a);
  const y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

console.log('palette');
check('one colour per public seat', SEAT_COLOURS.length === PUBLIC_CAP, `${SEAT_COLOURS.length}`);
check('seat 1 and seat 16 take the first and last', seatColour(1) === SEAT_COLOURS[0] && seatColour(16) === SEAT_COLOURS[15]);
{
  let worstHalo = Infinity;
  let worstBack = Infinity;
  let worstName = '';
  for (const c of SEAT_COLOURS) {
    worstHalo = Math.min(worstHalo, contrast(c, HALO));
    for (const bg of [...SKY, ...GRASS]) {
      const k = Math.max(contrast(c, bg), contrast(HALO, bg));
      if (k < worstBack) {
        worstBack = k;
        worstName = `${c} on ${bg}`;
      }
    }
  }
  check(`every colour against its halo at ${MARK_CONTRAST.fillHalo}:1 or better`, worstHalo >= MARK_CONTRAST.fillHalo, `worst ${worstHalo.toFixed(2)}:1`);
  check(`on every sky and grass, the colour or its halo at ${MARK_CONTRAST.background}:1 or better`, worstBack >= MARK_CONTRAST.background, `worst ${worstBack.toFixed(2)}:1, ${worstName}`);
}
{
  let near = Infinity;
  let pair = '';
  for (let i = 0; i < SEAT_COLOURS.length; i += 1) {
    for (let j = i + 1; j < SEAT_COLOURS.length; j += 1) {
      const d = rgbDist(SEAT_COLOURS[i], SEAT_COLOURS[j]);
      if (d < near) {
        near = d;
        pair = `${SEAT_COLOURS[i]} ${SEAT_COLOURS[j]}`;
      }
    }
  }
  check('no two seats within 60 of each other in RGB', near >= 60, `nearest ${near.toFixed(0)}, ${pair}`);
  let gate = Infinity;
  let gatePair = '';
  for (const c of SEAT_COLOURS) {
    for (const g of GATE) {
      const hd = Math.min(Math.abs(hue(c) - hue(g)), 360 - Math.abs(hue(c) - hue(g)));
      const d = rgbDist(c, g) + hd;
      if (d < gate) {
        gate = d;
        gatePair = `${c} ~ ${g}`;
      }
    }
  }
  check('none read as the gate mark\'s green or red (RGB distance plus hue degrees, 110 or more)', gate >= 110, `nearest ${gate.toFixed(0)}, ${gatePair}`);
}

console.log('need');
check('big and near: nothing', markNeed(80, 30, 0, false) === 0);
check('big over the ground: nothing', markNeed(80, 30, 0, true) === 0);
check('a few pixels far away: full', markNeed(3, 400, 0, false) === 1);
check('at the clear size over sky: nothing', markNeed(MARK.CLEAR_PX_SKY, 60, 0, false) === 0);
check('the same size over the ground: still marked', markNeed(MARK.CLEAR_PX_SKY, 60, 0, true) > 0.5, markNeed(MARK.CLEAR_PX_SKY, 60, 0, true).toFixed(2));
{
  const mid = markNeed(MARK.CLEAR_PX_SKY * 0.75, 60, 0, false);
  check('halfway through the band: part way', mid > 0.2 && mid < 0.8, mid.toFixed(2));
  let last = 2;
  let monotone = true;
  for (let px = 0; px <= 80; px += 1) {
    const n = markNeed(px, 60, 0, false);
    monotone = monotone && n <= last + 1e-12;
    last = n;
  }
  check('falls monotonically as the aircraft grows', monotone);
}
check('small but inside NEAR_M: nothing, it is right there', markNeed(4, MARK.NEAR_M - 1, 0, false) === 0);
check('hidden: full, however big', markNeed(200, 30, 1, false) === 1);
check('hidden inside NEAR_M: full too', markNeed(200, 5, 1, false) === 1);

console.log('terrain');
const flat = () => 0;
/* A ridge 20 m high across x = 100, 10 m thick. */
const ridge = (x) => (Math.abs(x - 100) < 5 ? 20 : 0);
check('flat ground hides nothing', !terrainHides(flat, 0, 2, 0, 400, 2, 0));
check('a peer parked on the grass is not behind the grass', !terrainHides(flat, 0, 2, 0, 60, 0.1, 0));
check('the ridge hides a peer behind it', terrainHides(ridge, 0, 2, 0, 200, 2, 0));
check('but not one flying over it', !terrainHides(ridge, 0, 2, 0, 200, 60, 0));
check('nor one in front of it', !terrainHides(ridge, 0, 2, 0, 80, 2, 0));
check('looking down at a peer, the ground is behind it', groundBehind(flat, 0, 30, 0, 100, 10, 0));
check('looking up at a peer, the sky is', !groundBehind(flat, 0, 2, 0, 100, 30, 0));

/* A camera at (0, 2, 0) looking down -z, 70 degrees vertical, 16:9. */
function camera(w, h, fovDeg = 70) {
  const cam = makeCam();
  cam.px = 0; cam.py = 2; cam.pz = 0;
  cam.tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  cam.aspect = w / h;
  return cam;
}
function screenOf(w, h) {
  return setScreen(makeScreen(), w, h);
}
/* Run a mark for a second of frames at 60 Hz. */
function settle(m, cam, screen, ground, seconds = 1) {
  for (let t = 0; t < seconds * 60; t += 1) {
    planMark(m, cam, screen, ground, 1 / 60);
  }
  return m;
}

console.log('the four cases');
{
  const W = 1280;
  const H = 720;
  const cam = camera(W, H);
  const screen = screenOf(W, H);
  const a = makeMark(2);
  a.extent = 1.8;
  a.x = 3; a.y = 4; a.z = -15;
  settle(a, cam, screen, flat);
  check('(a) close and clear: in frame and no mark', a.kind === KIND_OVER && a.alpha === 0, `${a.sizePx.toFixed(0)} px, alpha ${a.alpha.toFixed(2)}`);
  const b = makeMark(2);
  b.extent = 1.8;
  b.x = 30; b.y = 20; b.z = -400;
  settle(b, cam, screen, flat);
  check('(b) 400 m away and small: in frame, full mark', b.kind === KIND_OVER && b.alpha === 1, `${b.sizePx.toFixed(1)} px, alpha ${b.alpha.toFixed(2)}`);
  /* A hill across z = -100. */
  const hill = (x, z) => (Math.abs(z + 100) < 15 ? 30 : 0);
  const c = makeMark(2);
  c.extent = 1.8;
  c.x = 0; c.y = 5; c.z = -160;
  settle(c, cam, screen, hill);
  check('(c) behind a hill: in frame, hidden, full mark', c.kind === KIND_OVER && c.hidden && c.alpha === 1, `hidden ${c.hidden}, alpha ${c.alpha.toFixed(2)}`);
  const d = makeMark(2);
  d.extent = 1.8;
  d.x = -2; d.y = 3; d.z = 40;
  settle(d, cam, screen, flat);
  check('(d) behind the camera: an arrow on the bottom edge', d.kind === KIND_EDGE && d.side === SIDE_BOTTOM && d.alpha === 1, `side ${d.side}`);
  check('pointing down, a little left', Math.abs(Math.abs((d.angle * 180) / Math.PI) - 180) < 30 && d.sx < W / 2, `${((d.angle * 180) / Math.PI).toFixed(1)} deg at x ${d.sx.toFixed(0)}`);
  const e = makeMark(2);
  e.x = -40; e.y = 2; e.z = 5;
  settle(e, cam, screen, flat);
  const eDeg = (e.angle * 180) / Math.PI;
  check('off to the left and a little behind: left edge, pointing left and a little down', e.kind === KIND_EDGE && e.side === SIDE_LEFT && eDeg < -90 && eDeg > -110, `${eDeg.toFixed(1)} deg`);
  const f = makeMark(2);
  f.x = 60; f.y = 2; f.z = -20;
  settle(f, cam, screen, flat);
  check('off to the right in front: right edge, pointing right', f.kind === KIND_EDGE && f.side === SIDE_RIGHT && Math.abs((f.angle * 180) / Math.PI - 90) < 5, `${((f.angle * 180) / Math.PI).toFixed(1)} deg`);
  const g = makeMark(2);
  g.x = 0; g.y = 200; g.z = -20;
  settle(g, cam, screen, flat);
  check('high overhead: top edge, pointing up', g.kind === KIND_EDGE && g.side === SIDE_TOP && Math.abs((g.angle * 180) / Math.PI) < 5);
  const ace = makeMark(2);
  ace.role = 'ace';
  ace.scale = MARK_ROLES.ace.scale;
  ace.extent = 1.8;
  ace.x = 3; ace.y = 4; ace.z = -15;
  settle(ace, cam, screen, flat);
  check('a role is marked even close and clear', ace.kind === KIND_OVER && ace.alpha === 1);
}

console.log('fade');
{
  let a = 0;
  let frames = 0;
  while (a < 1 && frames < 1000) {
    a = fadeToward(a, 1, 1 / 60);
    frames += 1;
  }
  check(`fades in over FADE_IN_S (${MARK.FADE_IN_S} s)`, Math.abs(frames / 60 - MARK.FADE_IN_S) <= 1 / 60, `${(frames / 60).toFixed(3)} s`);
  frames = 0;
  while (a > 0 && frames < 1000) {
    a = fadeToward(a, 0, 1 / 60);
    frames += 1;
  }
  check(`fades out over FADE_OUT_S (${MARK.FADE_OUT_S} s)`, Math.abs(frames / 60 - MARK.FADE_OUT_S) <= 1 / 60, `${(frames / 60).toFixed(3)} s`);
  check('a partial target is held, not overshot', fadeToward(0.3, 0.5, 1) === 0.5 && fadeToward(0.9, 0.5, 1) === 0.5);
  /* A peer whose line of sight grazes a ridge line: hidden and clear on
   * alternate frames. The mark must not strobe. */
  const W = 1280;
  const H = 720;
  const cam = camera(W, H);
  const screen = screenOf(W, H);
  const m = makeMark(3);
  m.extent = 1.8;
  m.x = 0; m.y = 4; m.z = -30;
  const flicker = [];
  const on = (x, z) => (Math.abs(z + 15) < 1 ? 20 : 0);
  for (let i = 0; i < 120; i += 1) {
    planMark(m, cam, screen, i % 2 ? on : flat, 1 / 60);
    flicker.push(m.alpha);
  }
  let jump = 0;
  for (let i = 1; i < flicker.length; i += 1) {
    jump = Math.max(jump, Math.abs(flicker[i] - flicker[i - 1]));
  }
  check('a grazing ridge line does not strobe the mark', jump <= 1 / 60 / MARK.FADE_IN_S + 1e-9, `largest step ${jump.toFixed(3)}`);
  /* Clear to far: fades in, not pops. */
  const g = makeMark(4);
  g.extent = 1.8;
  g.x = 0; g.y = 4; g.z = -15;
  settle(g, cam, screen, flat, 0.5);
  g.z = -400;
  planMark(g, cam, screen, flat, 1 / 60);
  check('a peer that jumps far fades in rather than pops', g.alpha > 0 && g.alpha < 0.2, g.alpha.toFixed(3));
}

console.log('arrows');
{
  const rng = (() => {
    let s = 12345;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  })();
  /* Desktop, a phone held landscape and a phone held upright. */
  for (const [W, H, what] of [[1280, 720, 'desktop'], [844, 390, 'phone landscape'], [390, 844, 'phone portrait']]) {
    const screen = screenOf(W, H);
    /* The OSD's corner readouts, the lap clock top centre, the chips top
     * right, and the stick gimbals bottom centre. */
    addRect(screen, 16, H - 110, 200, 94);
    addRect(screen, W - 216, H - 110, 200, 94);
    addRect(screen, W / 2 - 90, 14, 180, 70);
    addRect(screen, W - 150, 12, 138, 34);
    addRect(screen, W / 2 - 130, H - 130, 260, 112);
    const centreR = MARK.CENTRE * Math.min(W, H);
    let worstCentre = Infinity;
    let inRect = 0;
    let offFrame = 0;
    let wrongWay = 0;
    const m = makeMark(5);
    for (let i = 0; i < 720; i += 1) {
      const a = (i / 720) * Math.PI * 2;
      m.labelW = 40 + rng() * 80;
      m.labelH = 26;
      pinToEdge(m, screen, Math.sin(a), -Math.cos(a));
      clearRects(m, screen);
      worstCentre = Math.min(worstCentre, Math.hypot(m.sx - W / 2, m.sy - H / 2));
      const r = screen.rects;
      for (let k = 0; k < screen.nRects * 4; k += 4) {
        if (r[k] < m.sx + m.fx1 && m.sx + m.fx0 < r[k] + r[k + 2] && r[k + 1] < m.sy + m.fy1 && m.sy + m.fy0 < r[k + 1] + r[k + 3]) {
          inRect += 1;
          break;
        }
      }
      if (m.sx < screen.minX - 0.5 || m.sx > screen.maxX + 0.5 || m.sy < screen.minY - 0.5 || m.sy > screen.maxY + 0.5) {
        offFrame += 1;
      }
      const d = Math.abs(((m.angle - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 1e-6) {
        wrongWay += 1;
      }
    }
    check(`${what}: every arrow on the inset frame`, offFrame === 0, `${offFrame} of 720 off it`);
    check(`${what}: none inside the centre zone`, worstCentre >= centreR, `nearest ${worstCentre.toFixed(0)} px, floor ${centreR.toFixed(0)}`);
    check(`${what}: no arrow or label on a readout`, inRect === 0, `${inRect} of 720`);
    check(`${what}: each still points along its bearing`, wrongWay === 0, `${wrongWay} off`);
  }
  /* Three pilots behind the same ridge, on the same bearing. */
  const screen = screenOf(1280, 720);
  const ms = [makeMark(1), makeMark(2), makeMark(3)];
  for (const m of ms) {
    m.used = true;
    m.kind = KIND_EDGE;
    m.labelW = 90;
    m.labelH = 26;
    pinToEdge(m, screen, -1, 0.1);
  }
  spreadEdges(ms, ms.length, screen);
  let overlaps = 0;
  for (let i = 0; i < ms.length; i += 1) {
    for (let j = i + 1; j < ms.length; j += 1) {
      const a = ms[i];
      const b = ms[j];
      if (a.sy + a.fy0 < b.sy + b.fy1 - 0.01 && b.sy + b.fy0 < a.sy + a.fy1 - 0.01) {
        overlaps += 1;
      }
    }
  }
  check('three arrows on one bearing are spread, not stacked', overlaps === 0, ms.map((m) => m.sy.toFixed(0)).join(', '));
}

console.log('range');
check('whole metres under 100', rangeText(rangeKey(42.4), false) === '42 m');
check('tens under a kilometre', rangeText(rangeKey(412), false) === '410 m');
check('tenths of a kilometre past it', rangeText(rangeKey(1234), false) === '1.2 km');
check('the OSD writes it its own way', rangeText(rangeKey(412), true) === '410M' && rangeText(rangeKey(2450), true) === '2.5KM');
check('the key holds still inside a rounding step', rangeKey(401) === rangeKey(404) && rangeKey(42.2) === rangeKey(41.8));

console.log(`\n${failures ? `${failures} FAILED` : 'all passed'}`);
process.exit(failures);
