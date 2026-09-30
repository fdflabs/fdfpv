/*
 * peermarks.js: where the other pilots in a room are, when the picture
 * does not already say so.
 *
 * WHAT IT IS FOR. A peer is drawn as its own aircraft with its name over
 * it (src/render/peers.js), and close and clear that is all a pilot needs.
 * Out past a few dozen metres a plane is a few pixels, a quad fewer, and
 * against the valley floor they are gone; behind a hill or behind the
 * camera they are not in the picture at all. So a mark says where they
 * are, and only then:
 *
 *   - Big and clear on screen: nothing but the name tag it already has.
 *   - Small, far, over busy ground, or behind the terrain: a small caret
 *     over the aircraft in the pilot's colour, the name and the range over
 *     it, fading in as the aircraft shrinks or goes behind something and
 *     out as it grows clear again. Hollow while the terrain hides it.
 *   - Out of frame: a small arrow inside the edge of the screen, pointing
 *     the way to turn, with the name and the range beside it.
 *
 * THE STYLE IS BORROWED. Racing games (Forza, Gran Turismo) put a small
 * coloured marker over a rival who is hard to pick out and nothing over one
 * who is not; flight games (Ace Combat) pin an arrow to the frame edge for
 * a target off screen and keep it off the centre, where the pilot is
 * looking. And in the goggles, INAV's radar OSD element draws the other
 * aircraft of a formation as characters with their distance, which is why
 * in the FPV view with the FPV OSD up the type here is the OSD's own:
 * outlined white monospace, upper case, units the way the OSD writes them.
 *
 * NOT INVASIVE, measured rather than promised: the arrows are under half the
 * size of the next gate's chevron and do not breathe, they ride an inset
 * frame and slide off every readout, chip and gimbal on the way (read once
 * a second), they never enter the centre zone (MARK.CENTRE), and the in
 * frame caret is gone once the aircraft is CLEAR_PX_* tall on screen.
 * Settings has Pilot markers: On, Minimal (the shapes, no type) or Off.
 * A game mode can mark one pilot harder with setRole (MARK_ROLES).
 *
 * A PILOT IN THE ROOM WHO IS NOT DRAWN is never simply missing: paused,
 * in a menu, in another world, they are named in a line of their own
 * (away), top left and clear of the readouts, "Brave Turtle 17 is here
 * but not flying". There is nothing to point at, so a line is all it is,
 * and it keeps its type under Minimal, where it would otherwise say
 * nothing; Off turns it off with the rest.
 *
 * COST. One canvas, cleared and drawn once a frame while anything is on
 * it and left alone while nothing is. Everything a frame touches is
 * allocated up front: a record per seat, the keep out rectangles in a
 * typed array, the camera as twelve numbers. A string is made only when a
 * name or a rounded range changes.
 *
 * The arithmetic is the exported functions, pure and in CSS pixels, so
 * scripts/peermarks-selftest.js proves the thresholds, the placement and
 * the fade in Node; the class at the bottom is the canvas around them.
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

import { PUBLIC_CAP } from '../share/roomwire.js';

/* The Settings row's values, in the order the row cycles them. */
export const MARK_STYLES = ['on', 'minimal', 'off'];

/*
 * One colour per seat, so every screen in the room agrees who is which
 * colour: the seat is the server's and the same everywhere, where a livery
 * is often the grass or the sky (and a quad has none). Bright on purpose,
 * because the mark is drawn with a dark halo: the halo carries it over
 * the sky, the colour carries it over the grass. Picked furthest apart
 * first, so a private room's eight seats are the most distinct, with no
 * greens (the grass, and the next gate's own green) and nothing near the
 * gate's red, so a pilot never follows a pilot for a gate. The selftest
 * holds every one to MARK_CONTRAST against the sky and grass the Swiss
 * valley actually renders.
 */
export const SEAT_COLOURS = [
  '#ffd23f', '#00ffff', '#ff4dff', '#bbfbf2',
  '#5e9fed', '#f5a3ab', '#ff7300', '#c299ff',
  '#ffff99', '#ccff00', '#00a6ff', '#55f6de',
  '#ffb8ed', '#ff66c2', '#ffbf00', '#86d6f9',
];
if (SEAT_COLOURS.length !== PUBLIC_CAP) {
  throw new Error('peermarks: SEAT_COLOURS must have one colour per public seat');
}
/* The halo round every shape and every letter. */
export const HALO = '#0c0e12';
/* The label type, the name tags' own cream (src/render/peers.js). */
const LABEL = '#ffe7a3';

export function seatColour(seat) {
  return SEAT_COLOURS[(Math.max(1, seat | 0) - 1) % SEAT_COLOURS.length];
}

/*
 * The thresholds, in CSS pixels, metres and seconds.
 *
 * CLEAR_PX_SKY and CLEAR_PX_GROUND are how big the aircraft has to stand on
 * screen (its largest dimension, projected) before it needs no help: a
 * shape against flat sky is found at a smaller size than the same shape
 * over fields, trees and roofs, so the ground asks for more. The mark
 * fades over the band from CLEAR_BAND of that size up to it.
 *
 * NEAR_M to NEAR_FULL_M: inside NEAR_M the size alone never marks it, it
 * is right there and its name tag is legible; the size test comes in fully
 * by NEAR_FULL_M. Occlusion is not gated by range: a pilot hidden 15 m
 * away behind a ridge is the one most worth knowing about.
 */
export const MARK = {
  CLEAR_PX_SKY: 30,
  CLEAR_PX_GROUND: 52,
  CLEAR_BAND: 0.5,
  NEAR_M: 12,
  NEAR_FULL_M: 22,
  /* Fade rates: in over FADE_IN_S, out over FADE_OUT_S, from full. */
  FADE_IN_S: 0.25,
  FADE_OUT_S: 0.45,
  /* The terrain test's own easing, so a sample landing either side of a
   * ridge line frame to frame does not flicker the mark. */
  OCC_S: 0.3,
  /* Samples along the line of sight, and how far below the terrain the
   * line has to pass to count as hidden: a peer sitting on the grass is
   * not behind the grass. */
  OCC_SAMPLES: 16,
  OCC_TOL_M: 0.6,
  /* The last stretch of the line next to the peer is not tested, for the
   * same reason. */
  OCC_END_M: 3,
  /* Past the peer, where the busy background test looks: the near
   * fields, and out to the valley walls. */
  BACK_M: [40, 120, 400, 1000, 2500],
  /* The inset frame the arrows ride, from each edge. */
  INSET: 26,
  /* An arrow's size: along its heading and across it. */
  ARROW_LEN: 13,
  ARROW_W: 11,
  /* The caret over an aircraft in frame. */
  CARET_W: 9,
  CARET_H: 7,
  /* Air between a mark and whatever it slides off. */
  PAD: 4,
  /* The centre zone no arrow enters, as a share of the short side: the
   * radius of a circle round the middle, where the pilot is looking. */
  CENTRE: 0.2,
  /* Below this alpha nothing is drawn. */
  MIN_ALPHA: 0.02,
};

/*
 * The minimum contrasts the palette is held to, WCAG ratios: the colour
 * against its halo, so the shape reads as a shape, and against any
 * background the better of the colour and the halo, WCAG 1.4.11's 3:1
 * for a graphic, so the mark has an edge that reads on it.
 */
export const MARK_CONTRAST = { fillHalo: 7, background: 3 };

/*
 * ROLES, for a game mode that has a special pilot (the Ace in tag, the
 * streamer in combat). PeerMarks.setRole(seat, 'ace') marks that seat
 * harder: its caret is a crown, larger, and never fades, however big and
 * clear the aircraft is; its arrow is larger too. setRole(seat, null)
 * puts it back. A role is the mode's rule, not a reading aid, so it is
 * drawn under Minimal and Off as well, without the type under Off.
 *
 * THE FREE ORB. While nobody is the Ace in tag (docs/TAG-PLAN.md decision
 * 14) the crown waits in the air for anybody to catch, and orb() points
 * at it as the Ace is pointed at: the ace role, in the crown's gold, on
 * the one mark no seat has, seat 0.
 */
export const MARK_ROLES = { ace: { scale: 1.5 } };
export const ORB_COLOUR = '#ffc64a';

export const KIND_NONE = 0;
export const KIND_OVER = 1;
export const KIND_EDGE = 2;
/* Which frame edge an arrow is on. */
export const SIDE_LEFT = 0;
export const SIDE_RIGHT = 1;
export const SIDE_TOP = 2;
export const SIDE_BOTTOM = 3;

/* Most keep out rectangles read in one go. */
const MAX_RECTS = 24;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* A mark's record. One per seat, made once. */
export function makeMark(seat = 0) {
  return {
    seat,
    colour: seatColour(seat || 1),
    used: false,
    role: null,
    scale: 1,
    x: 0,
    y: 0,
    z: 0,
    extent: 1,
    kind: KIND_NONE,
    side: SIDE_BOTTOM,
    sx: 0,
    sy: 0,
    angle: 0,
    sizePx: 0,
    dist: 0,
    need: 0,
    alpha: 0,
    occ: 0,
    hidden: false,
    ground: false,
    /* The footprint an arrow and its label cover, relative to the arrow's
     * point: x0, y0 up and left of it, x1, y1 down and right. */
    fx0: 0,
    fy0: 0,
    fx1: 0,
    fy1: 0,
    labelW: 0,
    labelH: 0,
    label: '',
    labelIn: null,
    labelOsd: null,
    distKey: -1,
    distOsd: null,
    distText: '',
    /* The away line (PeerMarks.away): this frame's, its words, their width. */
    awayUsed: false,
    awayText: '',
    awayW: 0,
    awayX: 0,
    awayY: 0,
  };
}

/* The camera as numbers: position, its right, up and forward axes, the
 * vertical half angle's tangent and the aspect. Filled once a frame. */
export function makeCam() {
  return { px: 0, py: 0, pz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1, tanHalf: 1, aspect: 1 };
}

/* From a three.js camera, whose matrixWorld columns are right, up, back
 * and position. The caller has updated the matrix. */
export function camFrom(cam, camera) {
  const e = camera.matrixWorld.elements;
  cam.rx = e[0]; cam.ry = e[1]; cam.rz = e[2];
  cam.ux = e[4]; cam.uy = e[5]; cam.uz = e[6];
  cam.fx = -e[8]; cam.fy = -e[9]; cam.fz = -e[10];
  cam.px = e[12]; cam.py = e[13]; cam.pz = e[14];
  cam.tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  cam.aspect = camera.aspect;
  return cam;
}

/*
 * The screen: its size, the inset frame the arrows ride, and the keep out
 * rectangles (x, y, w, h each, CSS pixels) of every readout on it.
 */
export function makeScreen() {
  return { w: 1, h: 1, minX: 0, maxX: 1, minY: 0, maxY: 1, rects: new Float64Array(MAX_RECTS * 4), nRects: 0 };
}

export function setScreen(screen, w, h) {
  screen.w = w;
  screen.h = h;
  screen.minX = MARK.INSET;
  screen.maxX = w - MARK.INSET;
  screen.minY = MARK.INSET;
  screen.maxY = h - MARK.INSET;
  return screen;
}

export function addRect(screen, x, y, w, h) {
  if (screen.nRects >= MAX_RECTS || !(w > 0 && h > 0)) {
    return;
  }
  const i = screen.nRects * 4;
  screen.rects[i] = x;
  screen.rects[i + 1] = y;
  screen.rects[i + 2] = w;
  screen.rects[i + 3] = h;
  screen.nRects += 1;
}

/*
 * Whether the terrain stands between the camera and a point: the line of
 * sight sampled at OCC_SAMPLES points, none in the last OCC_END_M, each
 * against the ground under it. heightAt(x, z) is the top surface.
 */
export function terrainHides(heightAt, cx, cy, cz, px, py, pz) {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const len = Math.hypot(dx, dy, dz);
  if (len <= MARK.OCC_END_M) {
    return false;
  }
  const end = 1 - MARK.OCC_END_M / len;
  const n = MARK.OCC_SAMPLES;
  for (let i = 1; i <= n; i += 1) {
    const t = (end * i) / (n + 1);
    const x = cx + dx * t;
    const z = cz + dz * t;
    if (heightAt(x, z) > cy + dy * t + MARK.OCC_TOL_M) {
      return true;
    }
  }
  return false;
}

/*
 * Whether what is behind the peer, along the line of sight, is ground
 * rather than sky: the line carried on past it BACK_M and tested there.
 * A peer seen against the valley floor needs a mark at a size one against
 * the sky does not.
 */
export function groundBehind(heightAt, cx, cy, cz, px, py, pz) {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    return false;
  }
  for (const k of MARK.BACK_M) {
    const t = 1 + k / len;
    if (heightAt(cx + dx * t, cz + dz * t) > cy + dy * t) {
      return true;
    }
  }
  return false;
}

/*
 * How much an aircraft in frame needs a mark, 0 to 1, before fading: its
 * projected size against the clear size for its background, gated by the
 * range, or its occlusion, whichever asks for more.
 */
export function markNeed(sizePx, dist, occ, ground) {
  const clear = ground ? MARK.CLEAR_PX_GROUND : MARK.CLEAR_PX_SKY;
  const small = 1 - smoothstep(clear * MARK.CLEAR_BAND, clear, sizePx);
  const far = smoothstep(MARK.NEAR_M, MARK.NEAR_FULL_M, dist);
  return Math.max(small * far, occ);
}

/* A value eased toward a target at the fade rates: in over FADE_IN_S from
 * nothing, out over FADE_OUT_S from full. */
export function fadeToward(value, target, dt) {
  if (target > value) {
    return Math.min(target, value + dt / MARK.FADE_IN_S);
  }
  return Math.max(target, value - dt / MARK.FADE_OUT_S);
}

/*
 * The arrow's footprint, relative to its point: the arrow itself and the
 * label laid inward of it. On a side edge the label is beside the arrow
 * and centred on it; on the top or bottom edge it is under or over it.
 */
export function footprint(m) {
  const r = Math.max(MARK.ARROW_LEN, MARK.ARROW_W) * 0.5 * m.scale + MARK.PAD;
  const w = m.labelW;
  const h = m.labelH;
  const gap = r + 2;
  m.fx0 = -r;
  m.fy0 = -r;
  m.fx1 = r;
  m.fy1 = r;
  if (!(w > 0 && h > 0)) {
    return m;
  }
  if (m.side === SIDE_LEFT) {
    m.fx1 = gap + w + MARK.PAD;
    m.fy0 = Math.min(m.fy0, -h / 2 - MARK.PAD);
    m.fy1 = Math.max(m.fy1, h / 2 + MARK.PAD);
  } else if (m.side === SIDE_RIGHT) {
    m.fx0 = -(gap + w + MARK.PAD);
    m.fy0 = Math.min(m.fy0, -h / 2 - MARK.PAD);
    m.fy1 = Math.max(m.fy1, h / 2 + MARK.PAD);
  } else if (m.side === SIDE_TOP) {
    m.fy1 = gap + h + MARK.PAD;
    m.fx0 = Math.min(m.fx0, -w / 2 - MARK.PAD);
    m.fx1 = Math.max(m.fx1, w / 2 + MARK.PAD);
  } else {
    m.fy0 = -(gap + h + MARK.PAD);
    m.fx0 = Math.min(m.fx0, -w / 2 - MARK.PAD);
    m.fx1 = Math.max(m.fx1, w / 2 + MARK.PAD);
  }
  return m;
}

/*
 * Pin an arrow to the inset frame along a bearing from the screen's
 * centre: (bx, by) in screen axes, x right and y down, any length. The
 * point is where that ray leaves the frame, the side is the edge it
 * leaves by, and the angle is the bearing, clockwise from up, which is
 * how the arrow is drawn.
 */
export function pinToEdge(m, screen, bx, by) {
  const midX = screen.w * 0.5;
  const midY = screen.h * 0.5;
  let dx = bx;
  let dy = by;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    /* Dead behind: six o'clock, turn round either way. */
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const tx = dx > 1e-9 ? (screen.maxX - midX) / dx : dx < -1e-9 ? (screen.minX - midX) / dx : Infinity;
  const ty = dy > 1e-9 ? (screen.maxY - midY) / dy : dy < -1e-9 ? (screen.minY - midY) / dy : Infinity;
  const t = Math.min(tx, ty);
  m.sx = midX + dx * t;
  m.sy = midY + dy * t;
  if (tx <= ty) {
    m.side = dx > 0 ? SIDE_RIGHT : SIDE_LEFT;
  } else {
    m.side = dy > 0 ? SIDE_BOTTOM : SIDE_TOP;
  }
  m.angle = Math.atan2(dx, -dy);
  footprint(m);
  return m;
}

function hitRect(screen, m) {
  const x0 = m.sx + m.fx0;
  const y0 = m.sy + m.fy0;
  const x1 = m.sx + m.fx1;
  const y1 = m.sy + m.fy1;
  const r = screen.rects;
  for (let i = 0; i < screen.nRects; i += 1) {
    const k = i * 4;
    if (r[k] < x1 && x0 < r[k] + r[k + 2] && r[k + 1] < y1 && y0 < r[k + 1] + r[k + 3]) {
      return k;
    }
  }
  return -1;
}

/* Whether an arrow's footprint comes inside the centre zone, a circle of
 * CENTRE of the screen's short side round its middle. */
function inCentre(screen, m) {
  const cx = screen.w * 0.5;
  const cy = screen.h * 0.5;
  const nx = Math.max(m.sx + m.fx0, Math.min(cx, m.sx + m.fx1));
  const ny = Math.max(m.sy + m.fy0, Math.min(cy, m.sy + m.fy1));
  return Math.hypot(nx - cx, ny - cy) < MARK.CENTRE * Math.min(screen.w, screen.h);
}

function onFrame(screen, m) {
  return m.sx >= screen.minX && m.sx <= screen.maxX && m.sy >= screen.minY && m.sy <= screen.maxY;
}

/* One candidate place: on side `side`, at (x, y). Kept if clear and nearer
 * than the best so far. */
function tryPlace(m, screen, side, x, y, ox, oy, best) {
  const d = Math.abs(x - ox) + Math.abs(y - oy);
  if (d >= best.d) {
    return;
  }
  m.side = side;
  m.sx = x;
  m.sy = y;
  footprint(m);
  if (onFrame(screen, m) && hitRect(screen, m) < 0 && !inCentre(screen, m)) {
    best.d = d;
    best.side = side;
    best.x = x;
    best.y = y;
  }
}

/* Along one side: its own spot, and just either side of each rectangle.
 * `x` or `y` is the inward position the side is held at. */
function tryAlong(m, screen, side, x, y, ox, oy, best) {
  const r = screen.rects;
  const vertical = side === SIDE_LEFT || side === SIDE_RIGHT;
  tryPlace(m, screen, side, x, y, ox, oy, best);
  m.side = side;
  footprint(m);
  const fx0 = m.fx0;
  const fx1 = m.fx1;
  const fy0 = m.fy0;
  const fy1 = m.fy1;
  for (let k = 0; k < screen.nRects * 4; k += 4) {
    if (vertical) {
      tryPlace(m, screen, side, x, r[k + 1] - fy1 - 0.5, ox, oy, best);
      tryPlace(m, screen, side, x, r[k + 1] + r[k + 3] - fy0 + 0.5, ox, oy, best);
    } else {
      tryPlace(m, screen, side, r[k] - fx1 - 0.5, y, ox, oy, best);
      tryPlace(m, screen, side, r[k] + r[k + 2] - fx0 + 0.5, y, ox, oy, best);
    }
  }
}

const bestPlace = { d: 0, side: 0, x: 0, y: 0 };

/*
 * Move a pinned arrow off every keep out rectangle and out of the centre
 * zone, to the nearest place that is clear: along its own edge either
 * side of whatever is in the way; round the corner onto the next edge
 * (the bottom of a phone in landscape is readouts end to end, and the
 * arrow for a pilot below goes up the side instead); or, last, inward
 * just past a rectangle. The arrow keeps its bearing wherever it lands.
 * None clear leaves it where it was, over a readout, rather than not
 * drawn: a pilot who cannot be found is worse than a readout partly
 * covered. Tried only while something is actually in the way.
 */
export function clearRects(m, screen) {
  if (hitRect(screen, m) < 0 && !inCentre(screen, m)) {
    return true;
  }
  const ox = m.sx;
  const oy = m.sy;
  const side = m.side;
  const best = bestPlace;
  best.d = Infinity;
  best.side = side;
  best.x = ox;
  best.y = oy;
  tryAlong(m, screen, side, ox, oy, ox, oy, best);
  const vertical = side === SIDE_LEFT || side === SIDE_RIGHT;
  if (vertical) {
    tryAlong(m, screen, SIDE_TOP, ox, screen.minY, ox, oy, best);
    tryAlong(m, screen, SIDE_BOTTOM, ox, screen.maxY, ox, oy, best);
  } else {
    tryAlong(m, screen, SIDE_LEFT, screen.minX, oy, ox, oy, best);
    tryAlong(m, screen, SIDE_RIGHT, screen.maxX, oy, ox, oy, best);
  }
  const r = screen.rects;
  for (let k = 0; k < screen.nRects * 4; k += 4) {
    m.side = side;
    footprint(m);
    if (side === SIDE_LEFT) {
      tryAlong(m, screen, side, Math.max(ox, r[k] + r[k + 2] - m.fx0 + 0.5), oy, ox, oy, best);
    } else if (side === SIDE_RIGHT) {
      tryAlong(m, screen, side, Math.min(ox, r[k] - m.fx1 - 0.5), oy, ox, oy, best);
    } else if (side === SIDE_TOP) {
      tryAlong(m, screen, side, ox, Math.max(oy, r[k + 1] + r[k + 3] - m.fy0 + 0.5), ox, oy, best);
    } else {
      tryAlong(m, screen, side, ox, Math.min(oy, r[k + 1] - m.fy1 - 0.5), ox, oy, best);
    }
  }
  m.side = best.side;
  m.sx = best.x;
  m.sy = best.y;
  footprint(m);
  return best.d < Infinity;
}

/*
 * Where an away line of w by h goes at x: the first y from `y` down at
 * which it covers no readout, moved below each one it would.
 */
export function awayRow(screen, x, y, w, h) {
  const r = screen.rects;
  for (let pass = 0; pass <= screen.nRects; pass += 1) {
    let moved = false;
    for (let k = 0; k < screen.nRects * 4; k += 4) {
      if (r[k] < x + w && x < r[k] + r[k + 2] && r[k + 1] < y + h && y < r[k + 1] + r[k + 3]) {
        y = r[k + 1] + r[k + 3] + MARK.PAD;
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  return y;
}

/*
 * Arrows on the same edge whose footprints overlap are spread along it,
 * the later one moved past the earlier, so two pilots behind the same
 * ridge are two arrows and not one arrow drawn twice.
 */
export function spreadEdges(marks, n, screen) {
  for (let i = 0; i < n; i += 1) {
    const a = marks[i];
    if (!a.used || a.kind !== KIND_EDGE) {
      continue;
    }
    for (let j = i + 1; j < n; j += 1) {
      const b = marks[j];
      if (!b.used || b.kind !== KIND_EDGE || b.side !== a.side) {
        continue;
      }
      const along = a.side === SIDE_LEFT || a.side === SIDE_RIGHT;
      if (along) {
        const overlap = Math.min(a.sy + a.fy1, b.sy + b.fy1) - Math.max(a.sy + a.fy0, b.sy + b.fy0);
        if (overlap > 0) {
          const dir = b.sy >= a.sy ? 1 : -1;
          let y = dir > 0 ? a.sy + a.fy1 - b.fy0 : a.sy + a.fy0 - b.fy1;
          if (y > screen.maxY || y < screen.minY) {
            y = dir > 0 ? a.sy + a.fy0 - b.fy1 : a.sy + a.fy1 - b.fy0;
          }
          b.sy = Math.max(screen.minY, Math.min(screen.maxY, y));
        }
      } else {
        const overlap = Math.min(a.sx + a.fx1, b.sx + b.fx1) - Math.max(a.sx + a.fx0, b.sx + b.fx0);
        if (overlap > 0) {
          const dir = b.sx >= a.sx ? 1 : -1;
          let x = dir > 0 ? a.sx + a.fx1 - b.fx0 : a.sx + a.fx0 - b.fx1;
          if (x > screen.maxX || x < screen.minX) {
            x = dir > 0 ? a.sx + a.fx0 - b.fx1 : a.sx + a.fx1 - b.fx0;
          }
          b.sx = Math.max(screen.minX, Math.min(screen.maxX, x));
        }
      }
    }
  }
}

/*
 * One peer, one frame: where on the screen, which kind of mark, and how
 * strongly. m.x, y, z and m.extent are the input (the aircraft's world
 * position and its largest dimension, metres); dt is seconds.
 */
export function planMark(m, cam, screen, heightAt, dt) {
  const dx = m.x - cam.px;
  const dy = m.y - cam.py;
  const dz = m.z - cam.pz;
  const xc = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const yc = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  m.dist = Math.hypot(dx, dy, dz);
  const hidden = heightAt ? terrainHides(heightAt, cam.px, cam.py, cam.pz, m.x, m.y, m.z) : false;
  m.hidden = hidden;
  m.occ = fadeToward(m.occ, hidden ? 1 : 0, dt * (MARK.FADE_IN_S / MARK.OCC_S));
  const w = screen.w;
  const h = screen.h;
  let inFrame = false;
  if (zc > 0.05) {
    const nx = xc / (zc * cam.tanHalf * cam.aspect);
    const ny = yc / (zc * cam.tanHalf);
    m.sx = (nx * 0.5 + 0.5) * w;
    m.sy = (0.5 - ny * 0.5) * h;
    m.sizePx = (h * m.extent) / (2 * zc * cam.tanHalf);
    inFrame = m.sx >= 0 && m.sx <= w && m.sy >= 0 && m.sy <= h;
  } else {
    m.sizePx = 0;
  }
  let target;
  if (inFrame) {
    m.kind = KIND_OVER;
    m.ground = heightAt ? groundBehind(heightAt, cam.px, cam.py, cam.pz, m.x, m.y, m.z) : false;
    m.need = m.role ? 1 : markNeed(m.sizePx, m.dist, m.occ, m.ground);
    target = m.need;
    m.angle = Math.PI;
  } else {
    /* Off the frame, or behind the camera, where the projection is a
     * reflection and only the camera space bearing is true. Screen y is
     * down, camera y is up. */
    m.kind = KIND_EDGE;
    m.need = 1;
    target = 1;
    /* In front, the projected offset from the centre is (xc, -yc)
     * scaled, whatever the aspect. Behind, being behind reads as below:
     * dead behind is six o'clock, behind and to one side comes round that
     * side, and far overhead behind is still up. The two agree as zc
     * crosses zero, so an arrow never jumps. */
    pinToEdge(m, screen, xc, zc > 0 ? -yc : -zc - yc);
    clearRects(m, screen);
  }
  m.alpha = fadeToward(m.alpha, target, dt);
  return m;
}

/* The range as the label says it: whole metres under 100, tens under a
 * kilometre, tenths of a kilometre past it. The key changes only when the
 * words would. */
export function rangeKey(dist) {
  if (dist < 100) {
    return Math.round(dist);
  }
  if (dist < 995) {
    return Math.round(dist / 10) * 10;
  }
  return 10000 + Math.round(dist / 100);
}

export function rangeText(key, osd) {
  if (key < 10000) {
    return osd ? `${key}M` : `${key} m`;
  }
  const km = ((key - 10000) / 10).toFixed(1);
  return osd ? `${km}KM` : `${km} km`;
}

const MAX_DPR = 2;

/*
 * The canvas. main.js hands it the camera once a frame (begin), each peer
 * it draws (add) and then asks for the picture (end).
 */
export class PeerMarks {
  constructor(root, viewEl) {
    this.viewEl = viewEl;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'peer-marks';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    /* First child, so the OSD, banners and menus all paint over it. */
    root.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.marks = [];
    for (let seat = 0; seat <= PUBLIC_CAP; seat += 1) {
      this.marks.push(makeMark(seat));
    }
    this.cam = makeCam();
    this.screen = makeScreen();
    this.style = 'on';
    this.osd = false;
    this.osdPx = 11;
    this.dpr = 1;
    this.painted = false;
    this.keepOutAt = 0;
    this.keepOutKey = '';
    this.uiFont = '';
    this.fontOn = '';
    this.fontOsd = '';
    this.stats = { frames: 0, drawn: 0, over: 0, edge: 0 };
    try {
      const f = getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim();
      if (f) {
        this.uiFont = f;
      }
    } catch (e) {
      /* No computed style (a document being torn down): the fallback font. */
    }
  }

  /*
   * A frame. style is the setting, osd the FPV OSD (its type and its
   * readouts), live whether marks belong on screen at all (flight, the
   * flight screen). dt is seconds.
   */
  begin(camera, style, osd, live, dt, nowMs) {
    this.style = MARK_STYLES.includes(style) ? style : 'on';
    this.live = Boolean(live);
    this.dt = Math.max(0, Math.min(0.1, dt));
    for (const m of this.marks) {
      m.used = false;
      m.awayUsed = false;
    }
    if (!this.live) {
      return;
    }
    const osdOn = Boolean(osd && osd.on);
    const w = this.viewEl.clientWidth;
    const h = this.viewEl.clientHeight;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.painted = false;
      this.keepOutAt = 0;
    }
    this.dpr = dpr;
    if (osdOn !== this.osd) {
      this.osd = osdOn;
      this.keepOutAt = 0;
      this.remeasureAway();
    }
    if (osdOn && osd.textPx && osd.textPx !== this.osdPx) {
      this.osdPx = osd.textPx;
      this.fontOsd = '';
      this.remeasureAway();
    }
    setScreen(this.screen, w, h);
    if (nowMs >= this.keepOutAt) {
      this.readKeepOut(osdOn ? osd : null);
      this.keepOutAt = nowMs + 1000;
    }
    camera.updateMatrixWorld();
    camFrom(this.cam, camera);
  }

  /* The readouts on screen, once a second: the game's HUD blocks and
   * chips, or with the FPV OSD up its placed readouts. */
  readKeepOut(osd) {
    const screen = this.screen;
    screen.nRects = 0;
    const o = this.viewEl.getBoundingClientRect();
    for (const el of document.querySelectorAll('.osd-top, .osd-corner, .osd-sticks, .osd-air, .osd-gimbal, .bug-chip, .music-dock, .banner')) {
      const r = el.getBoundingClientRect();
      addRect(screen, r.left - o.left, r.top - o.top, r.width, r.height);
    }
    if (osd && osd.readoutRects) {
      osd.readoutRects((x, y, w, h) => addRect(screen, x, y, w, h));
    }
  }

  /*
   * A game mode's special pilot: setRole(seat, 'ace'), or null to put the
   * seat back. See MARK_ROLES. Kept until changed, across frames and
   * across the peer leaving; a mode that ends clears what it set.
   */
  setRole(seat, role) {
    if (role != null && !MARK_ROLES[role]) {
      throw new Error(`peermarks: no role ${role}`);
    }
    if (!(seat >= 1 && seat <= PUBLIC_CAP)) {
      throw new Error(`peermarks: no seat ${seat}`);
    }
    const m = this.marks[seat];
    m.role = role || null;
    m.scale = role ? MARK_ROLES[role].scale : 1;
    m.labelW = 0;
  }

  clearRoles() {
    for (const m of this.marks) {
      m.role = null;
      m.scale = 1;
    }
  }

  /* One peer this frame. label is the name as its tag shows it ('' for a
   * muted pilot); x, y, z where it is drawn; extent its size, metres. */
  add(seat, label, x, y, z, extent) {
    if (!this.live || seat < 1 || seat > PUBLIC_CAP) {
      return;
    }
    const m = this.marks[seat];
    if (this.style === 'off' && !m.role) {
      return;
    }
    m.used = true;
    m.x = x;
    m.y = y;
    m.z = z;
    m.extent = extent > 0 ? extent : 1;
    if (label !== m.label) {
      m.label = label;
      m.labelOsd = null;
      m.labelW = 0;
    }
  }

  /* The free orb this frame, on mark 0: labelled, at x, y, z, `extent`
   * metres across. */
  orb(label, x, y, z, extent) {
    if (!this.live) {
      return;
    }
    const m = this.marks[0];
    m.role = 'ace';
    m.scale = MARK_ROLES.ace.scale;
    m.colour = ORB_COLOUR;
    m.used = true;
    m.x = x;
    m.y = y;
    m.z = z;
    m.extent = extent > 0 ? extent : 1;
    if (label !== m.label) {
      m.label = label;
      m.labelOsd = null;
      m.labelW = 0;
    }
  }

  /* The away lines' widths belong to the type they were measured in. */
  remeasureAway() {
    for (const m of this.marks) {
      m.awayW = 0;
    }
  }

  /* A pilot in the room who is not drawn this frame, and why, in words
   * ("... is here but not flying"): a line of its own, see the header. */
  away(seat, text) {
    if (!this.live || this.style === 'off' || seat < 1 || seat > PUBLIC_CAP) {
      return;
    }
    const m = this.marks[seat];
    m.awayUsed = true;
    if (text !== m.awayText) {
      m.awayText = text;
      m.awayW = 0;
    }
  }

  /* The room's own line, over the away lines and without a pilot's dot
   * ("You're alone in room K7PZ2M"). It rides the orb's mark, which has no
   * away line of its own. */
  note(text) {
    if (!this.live || this.style === 'off') {
      return;
    }
    const m = this.marks[0];
    m.awayUsed = true;
    if (text !== m.awayText) {
      m.awayText = text;
      m.awayW = 0;
    }
  }

  /* Plan every mark and draw them. heightAt(x, z) is the terrain's top. */
  end(heightAt) {
    const g = this.g;
    this.stats.frames += 1;
    if (!this.live) {
      for (const m of this.marks) {
        m.alpha = 0;
        m.occ = 0;
      }
      this.clear();
      return;
    }
    const marks = this.marks;
    const n = marks.length;
    const text = this.style === 'on';
    for (let i = 0; i < n; i += 1) {
      const m = marks[i];
      if (!m.used) {
        m.alpha = 0;
        m.kind = KIND_NONE;
        continue;
      }
      this.measure(m, text);
      planMark(m, this.cam, this.screen, heightAt, this.dt);
    }
    spreadEdges(marks, n, this.screen);
    let any = false;
    for (let i = 0; i < n; i += 1) {
      const m = marks[i];
      if (m.used && m.kind === KIND_EDGE) {
        clearRects(m, this.screen);
      }
      any = any || (m.used && m.alpha >= MARK.MIN_ALPHA) || m.awayUsed;
    }
    if (!any) {
      this.clear();
      return;
    }
    const s = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.painted = true;
    let over = 0;
    let edge = 0;
    for (let i = 0; i < n; i += 1) {
      const m = marks[i];
      if (!m.used || m.alpha < MARK.MIN_ALPHA) {
        continue;
      }
      g.globalAlpha = m.alpha;
      if (m.kind === KIND_OVER) {
        this.drawCaret(g, s, m, text);
        over += 1;
      } else if (m.kind === KIND_EDGE) {
        this.drawArrow(g, s, m, text);
        edge += 1;
      }
    }
    g.globalAlpha = 1;
    this.drawAway(g, s);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.stats.drawn += over + edge;
    this.stats.over = over;
    this.stats.edge = edge;
  }

  clear() {
    this.stats.over = 0;
    this.stats.edge = 0;
    if (!this.painted) {
      return;
    }
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.painted = false;
  }

  font() {
    if (this.osd) {
      if (!this.fontOsd) {
        /* The OSD's own type (src/ui/fpvhud.js). */
        this.fontOsd = `bold ${this.osdPx}px ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace`;
      }
      return this.fontOsd;
    }
    if (!this.fontOn) {
      this.fontOn = this.uiFont ? `600 11px ${this.uiFont}` : '600 11px system-ui, sans-serif';
    }
    return this.fontOn;
  }

  /* The label's words and size, remade only when a name, the range's
   * rounding or the type changes. */
  measure(m, text) {
    if (!text) {
      m.labelW = 0;
      m.labelH = 0;
      return;
    }
    const key = rangeKey(m.dist);
    const osd = this.osd;
    let dirty = false;
    if (key !== m.distKey || osd !== m.distOsd) {
      m.distKey = key;
      m.distOsd = osd;
      m.distText = rangeText(key, osd);
      dirty = true;
    }
    if (osd && m.labelOsd === null) {
      m.labelOsd = m.label.toUpperCase();
      dirty = true;
    }
    if (!dirty && m.labelW > 0) {
      return;
    }
    const g = this.g;
    g.font = this.font();
    const name = osd ? m.labelOsd : m.label;
    m.labelW = Math.max(name ? g.measureText(name).width : 0, g.measureText(m.distText).width);
    const line = osd ? this.osdPx * 1.25 : 13;
    m.labelH = name ? line * 2 : line;
  }

  /* Two lines, name over range, with the halo: the OSD's outlined type in
   * the goggles, the name tags' cream otherwise. */
  drawLabel(g, s, m, x, y, align) {
    const osd = this.osd;
    const name = osd ? m.labelOsd : m.label;
    const line = osd ? this.osdPx * 1.25 : 13;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.font = this.font();
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = osd ? 2 : 3;
    g.strokeStyle = HALO;
    g.fillStyle = osd ? '#ffffff' : LABEL;
    let yy = y - (name ? line * 0.5 : 0);
    if (name) {
      g.strokeText(name, x, yy);
      g.fillText(name, x, yy);
      yy += line;
    }
    g.strokeText(m.distText, x, yy);
    g.fillText(m.distText, x, yy);
  }

  /* The away lines, top left under the readouts: a dot in the pilot's
   * colour and the words, one line each, in seat order, under the room's
   * note (seat 0, no dot). */
  drawAway(g, s) {
    const osd = this.osd;
    const line = (osd ? this.osdPx * 1.25 : 13) + MARK.PAD;
    const dot = 4;
    let y = this.screen.minY;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.font = this.font();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (let i = 0; i < this.marks.length; i += 1) {
      const m = this.marks[i];
      if (!m.awayUsed) {
        continue;
      }
      const words = osd ? m.awayText.toUpperCase() : m.awayText;
      if (!m.awayW) {
        m.awayW = g.measureText(words).width;
      }
      const x = this.screen.minX;
      const indent = i > 0 ? dot * 3 : 0;
      y = awayRow(this.screen, x, y, indent + m.awayW, line);
      m.awayX = x;
      m.awayY = y;
      const cy = y + line * 0.5;
      g.strokeStyle = HALO;
      if (i > 0) {
        g.beginPath();
        g.arc(x + dot, cy, dot, 0, Math.PI * 2);
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = m.colour;
        g.fill();
      }
      g.lineWidth = osd ? 2 : 3;
      g.strokeText(words, x + indent, cy);
      g.fillStyle = osd ? '#ffffff' : LABEL;
      g.fillText(words, x + indent, cy);
      y += line;
    }
  }

  /* A small caret pointing down at the aircraft, hollow while the terrain
   * hides it, and the label over it. */
  drawCaret(g, s, m, text) {
    const lift = Math.max(3, m.sizePx * 0.5) + 3;
    const tipY = m.sy - lift;
    const w = MARK.CARET_W * 0.5 * m.scale;
    const h = MARK.CARET_H * m.scale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.beginPath();
    g.moveTo(m.sx, tipY);
    g.lineTo(m.sx - w, tipY - h);
    g.lineTo(m.sx + w, tipY - h);
    g.closePath();
    if (m.role) {
      /* A crown over the caret: a band and three points. */
      const base = tipY - h - 2.5;
      const top = base - h;
      g.moveTo(m.sx - w, base);
      g.lineTo(m.sx - w, top);
      g.lineTo(m.sx - w * 0.5, base - h * 0.5);
      g.lineTo(m.sx, top);
      g.lineTo(m.sx + w * 0.5, base - h * 0.5);
      g.lineTo(m.sx + w, top);
      g.lineTo(m.sx + w, base);
      g.closePath();
    }
    g.lineJoin = 'round';
    g.strokeStyle = HALO;
    g.lineWidth = 3;
    g.stroke();
    if (m.hidden) {
      g.strokeStyle = m.colour;
      g.lineWidth = 1.5;
      g.stroke();
    } else {
      g.fillStyle = m.colour;
      g.fill();
    }
    if (text) {
      const top = tipY - h * (m.role ? 2 : 1) - (m.role ? 5.5 : 3);
      this.drawLabel(g, s, m, m.sx, top - m.labelH * 0.5, 'center');
    }
  }

  /* An arrow on the frame edge, pointing the way, and the label inward. */
  drawArrow(g, s, m, text) {
    const c = Math.cos(m.angle);
    const n = Math.sin(m.angle);
    const L = MARK.ARROW_LEN * 0.5 * m.scale;
    const W = MARK.ARROW_W * 0.5 * m.scale;
    /* Up in the arrow's own frame is its heading. */
    g.setTransform(s * c, s * n, -s * n, s * c, s * m.sx, s * m.sy);
    g.beginPath();
    g.moveTo(0, -L);
    g.lineTo(W, L);
    g.lineTo(0, L * 0.45);
    g.lineTo(-W, L);
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = HALO;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = m.colour;
    g.fill();
    if (!text) {
      return;
    }
    const gap = Math.max(MARK.ARROW_LEN, MARK.ARROW_W) * 0.5 * m.scale + MARK.PAD + 2;
    if (m.side === SIDE_LEFT) {
      this.drawLabel(g, s, m, m.sx + gap, m.sy, 'left');
    } else if (m.side === SIDE_RIGHT) {
      this.drawLabel(g, s, m, m.sx - gap, m.sy, 'right');
    } else if (m.side === SIDE_TOP) {
      this.drawLabel(g, s, m, m.sx, m.sy + gap + m.labelH * 0.5, 'center');
    } else {
      this.drawLabel(g, s, m, m.sx, m.sy - gap - m.labelH * 0.5, 'center');
    }
  }

  /* What the headless check reads: each mark as planned this frame. */
  summary() {
    const out = [];
    for (const m of this.marks) {
      if (!m.used) {
        continue;
      }
      out.push({
        seat: m.seat,
        role: m.role,
        kind: ['none', 'over', 'edge'][m.kind],
        side: ['left', 'right', 'top', 'bottom'][m.side],
        x: m.sx,
        y: m.sy,
        angleDeg: (m.angle * 180) / Math.PI,
        sizePx: m.sizePx,
        dist: m.dist,
        need: m.need,
        alpha: m.alpha,
        hidden: m.hidden,
        ground: m.ground,
        colour: m.colour,
        label: m.label,
        range: m.distText,
        box: m.kind === KIND_EDGE ? [m.sx + m.fx0, m.sy + m.fy0, m.sx + m.fx1, m.sy + m.fy1] : null,
      });
    }
    const away = this.marks.slice(1).filter((m) => m.awayUsed).map((m) => ({ seat: m.seat, text: m.awayText, x: m.awayX, y: m.awayY }));
    const note = this.marks[0].awayUsed ? this.marks[0].awayText : null;
    return {
      live: this.live, style: this.style, osd: this.osd, stats: { ...this.stats }, cam: { ...this.cam }, away, note,
      screen: { w: this.screen.w, h: this.screen.h, rects: Array.from(this.screen.rects.subarray(0, this.screen.nRects * 4)) },
      marks: out,
    };
  }
}
