/*
 * banners.js: the printed vinyl a race course is dressed in, painted onto
 * canvases, and the feather flag's shape.
 *
 * Gates wear white vinyl: a header board over the top rail with the
 * event's mark on it, sleeves down the uprights; the course is lined with
 * feather flags in navy or red with a chequered border. This module only
 * paints and measures. It knows nothing of three.js, the physics or the
 * track document, because two consumers must draw exactly the same art:
 * the world (src/render/scene.js) and the track builder's preview
 * (src/trackbuilder/view3d.js), which may not import the simulator. So the
 * art lives in a directory of its own that both draw from.
 *
 * The look follows the form of a club race course (a white header board,
 * sleeved uprights, a chequered border, flags with a coloured sweep), not
 * anyone's marks: the board carries whatever the author uploads, and with
 * nothing uploaded a chequered flag this file draws.
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

/*
 * The palette, as CSS colours. The vinyl is not pure white on purpose:
 * white flags rendered brighter than the sky (horizon 0xf2e3cb) and seventy
 * two pieces of dressing out-shouted the gate being looked for, so the
 * vinyl sits a step under the horizon and still reads white on grass.
 */
export const BANNER = {
  vinyl: '#dcd6ca',
  vinylShade: '#c7c0b3',
  navy: '#1e3566',
  navyDeep: '#152648',
  red: '#b8332c',
  ink: '#1a1f2b',
  chequerDark: '#23272f',
  chequerLight: '#eae6dd',
};

/* A palette colour as 0xRRGGBB for three.js materials; a name that is not
 * a six digit colour throws, once, here. */
export function bannerHex(name) {
  const css = BANNER[name];
  if (typeof css !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(css)) {
    throw new Error(`banners: ${name} is not a six digit colour`);
  }
  return Number.parseInt(css.slice(1), 16);
}

/*
 * A grid of alternating checks, `cols` by `rows` of cw by ch from (x, y),
 * the first check dark. Each check overlaps the next by half a pixel so no
 * seam of background shows between them, which makes the drawing order
 * part of the picture: column by column, or row by row when `byRow`.
 */
function checks(ctx, x, y, cols, rows, cw, ch, byRow, dark = BANNER.chequerDark, light = BANNER.chequerLight) {
  const cell = (i, j) => {
    ctx.fillStyle = (i + j) % 2 === 0 ? dark : light;
    ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
  };
  const outer = byRow ? rows : cols;
  const inner = byRow ? cols : rows;
  for (let a = 0; a < outer; a += 1) {
    for (let b = 0; b < inner; b += 1) {
      if (byRow) {
        cell(b, a);
      } else {
        cell(a, b);
      }
    }
  }
}

/* A racing chequer band: always two checks deep, `cells` across. */
export function chequer(ctx, x, y, w, h, cells, dark = BANNER.chequerDark, light = BANNER.chequerLight) {
  checks(ctx, x, y, cells, 2, w / Math.max(1, cells), h / 2, false, dark, light);
}

/* The same down a sleeve's edge: two checks wide, `cells` down. */
function chequerStrip(ctx, x, y, w, h, cells) {
  checks(ctx, x, y, 2, cells, w / 2, h / Math.max(1, cells), true);
}

/*
 * The mark a course without a logo carries: a chequered flag on a staff,
 * fitted to the box. The flag flies (its fly edge lifts and its foot
 * rises) so it reads as a flag and not a chessboard.
 */
export function chequerDevice(ctx, x, y, w, h) {
  const staff = Math.max(2, w * 0.045);
  ctx.fillStyle = BANNER.ink;
  ctx.fillRect(x, y, staff, h);
  const flag = { x: x + staff * 2.2, y: y + h * 0.06, w: w - staff * 2.2, h: h * 0.62 };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(flag.x, flag.y);
  ctx.lineTo(flag.x + flag.w, flag.y - flag.h * 0.12);
  ctx.lineTo(flag.x + flag.w, flag.y + flag.h * 0.78);
  ctx.lineTo(flag.x, flag.y + flag.h);
  ctx.closePath();
  ctx.clip();
  checks(ctx, flag.x, flag.y - flag.h * 0.14, 6, 4, flag.w / 6, flag.h / 4, false);
  ctx.restore();
}

/* An uploaded mark, as large as fits the box at its own proportions,
 * centred: never stretched, never cropped. An image with no size draws
 * nothing. */
function placeLogo(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!(iw > 0 && ih > 0)) {
    return;
  }
  const s = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) * 0.5, y + (h - ih * s) * 0.5, iw * s, ih * s);
}

/* The logo if there is one, else the chequered device in its share of
 * the same box (as fractions of the box: x, width, and the device's own
 * y and height if they differ). */
function markOrDevice(ctx, logo, box, device) {
  if (logo) {
    placeLogo(ctx, logo, box.x, box.y, box.w, box.h);
  } else {
    chequerDevice(ctx, device.x, device.y, device.w, device.h);
  }
}

/* A canvas filled with vinyl after clearing it. */
function vinylSheet(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);
}

/*
 * The share of a gate header's width left clear at each end for the gate
 * number's roundel, which is geometry (one texture serves every gate). The
 * header is printed on both faces and the back is mirrored, so the roundel
 * sits at one end from one side and the other end from the other, and both
 * ends stay clear. Exported so scene.js and the builder place the roundel
 * where this painter left room.
 */
export const HEADER_NUMBER_ZONE = 0.22;

/*
 * The header board: vinyl with darker hems top and bottom (so the sheet
 * does not read as a hole in the sky), a thin chequer border near the
 * foot, and the mark between the two clear ends as large as it fits.
 * opts.logo, opts.numberZone.
 */
export function paintGateHeader(ctx, w, h, opts = {}) {
  const zone = opts.numberZone ?? HEADER_NUMBER_ZONE;
  vinylSheet(ctx, w, h);
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.955, w, h * 0.045);
  chequer(ctx, 0, h * 0.88, w, h * 0.075, Math.round(w / (h * 0.06)));
  const from = w * zone;
  const span = w * (1 - zone) - from;
  const top = h * 0.07;
  const tall = h * 0.79;
  markOrDevice(ctx, opts.logo, { x: from, y: top, w: span, h: tall }, { x: from + span * 0.30, y: top, w: span * 0.40, h: tall });
}

/*
 * An upright's sleeve, painted tall: vinyl, a chequer strip down the outer
 * edge so the white wall keeps a silhouette, and the mark turned a quarter
 * to read up the sleeve. opts.flip mirrors the layout for the far leg so
 * the strip is outside there too. It is mirrored in the paint, not with a
 * negative scale on the mesh, since that turns a one sided panel inside
 * out. The mark is mirrored back inside the flip: a sponsor's mark must
 * never read reversed.
 */
export function paintGateSleeve(ctx, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (opts.flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);
  const strip = w * 0.18;
  chequerStrip(ctx, 0, 0, strip, h, Math.round(h / (strip * 0.5)));
  const open = w - strip;
  ctx.save();
  ctx.translate(strip + open * 0.5, h * 0.48);
  ctx.rotate(-Math.PI / 2);
  /* After the quarter turn, mirroring across the sleeve is along y. */
  if (opts.flip) {
    ctx.scale(1, -1);
  }
  markOrDevice(ctx, opts.logo, { x: -h * 0.34, y: -open * 0.42, w: h * 0.68, h: open * 0.84 }, { x: -h * 0.16, y: -open * 0.34, w: h * 0.32, h: open * 0.68 });
  ctx.restore();
  ctx.restore();
}

/*
 * A feather flag's print. The canvas is the sail's own parameter space: x
 * from the mast seam (0) to the free edge, and the top of the canvas is
 * the head (v = 1, since a CanvasTexture flips v).
 *
 * The accent (navy, or red with opts.accent 'red'; the other colour draws
 * the seams) runs as a band down the mast edge, a little wider toward the
 * head, and fills the head block over the corner the mast's bend sweeps
 * away, where any structured print would visibly bend. Two chequer bands
 * cross the free part; their check count follows from the band's size so
 * the checks stay square. The mark reads up the flag between them.
 * opts.mirrorMark mirrors only the mark, for the cloth's reverse face
 * (paintFlagSailPair).
 */
const HEAD_FROM_V = 0.70;

export function paintFlagSail(ctx, w, h, opts = {}) {
  const red = opts.accent === 'red';
  const accent = red ? BANNER.red : BANNER.navy;
  const seam = red ? BANNER.navy : BANNER.red;
  const yOf = (v) => h * (1 - v);
  vinylSheet(ctx, w, h);

  /* The band's free side: from the top of the canvas down to the foot. */
  const bandEdge = () => ctx.quadraticCurveTo(w * 0.20, h * 0.55, w * 0.26, h);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.30, 0);
  bandEdge();
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0, 0, w, yOf(HEAD_FROM_V));

  ctx.strokeStyle = seam;
  ctx.lineWidth = Math.max(2, w * 0.045);
  ctx.beginPath();
  ctx.moveTo(w * 0.30, yOf(HEAD_FROM_V));
  bandEdge();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, yOf(HEAD_FROM_V));
  ctx.lineTo(w, yOf(HEAD_FROM_V));
  ctx.stroke();

  const band = { x: w * 0.28, w: w * 0.72, h: h * 0.06 };
  const across = Math.max(2, Math.round((2 * band.w) / band.h));
  for (const v of [0.695, 0.135]) {
    chequer(ctx, band.x, yOf(v), band.w, band.h, across);
  }

  const markW = h * 0.44;
  const markH = w * 0.60;
  ctx.save();
  ctx.translate(w * 0.63, yOf(0.385));
  ctx.rotate(-Math.PI / 2);
  if (opts.mirrorMark) {
    ctx.scale(1, -1);
  }
  markOrDevice(ctx, opts.logo, { x: -markW * 0.5, y: -markH * 0.5, w: markW, h: markH }, { x: -markW * 0.28, y: -markH * 0.5, w: markW * 0.56, h: markH });
  ctx.restore();
}

/*
 * Both faces of a sail on one sheet twice its width, so the whole course's
 * flags merge into meshes of one material. The front is the left half; the
 * right half is the same layout mirrored with the mark mirrored back. The
 * reverse faces read the right half from the mast outward, which keeps the
 * accent band on the mast from either side, as on a printed double sided
 * flag. The halves meet at their free edges, where they nearly agree, so no
 * mip level shows the join.
 */
export function paintFlagSailPair(ctx, w, h, opts = {}) {
  const half = w / 2;
  paintFlagSail(ctx, half, h, opts);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  paintFlagSail(ctx, half, h, { ...opts, mirrorMark: true });
  ctx.restore();
}

/*
 * The feather flag: a straight pole for the lower four fifths, then a
 * fibreglass whip sweeping forward through a hundred degrees, past its own
 * apex, with a tall narrow sail hanging from the mast's tip down to a hem
 * above the ground. The apex, not the tip, is the flag's stated height:
 * the collider, the title camera's clearance and the builder all use it.
 * Fractions of the flag's height, and radii as fractions of the butt's.
 */
export const FLAG = {
  bend: 0.80,
  sweep: (100 * Math.PI) / 180,
  foot: 0.16,
  bendRadius: 0.80,
  tipRadius: 0.52,
};

/*
 * The mast's centreline from the butt at (0, 0), x forward and y up in the
 * sail's plane, each point with its radius as a fraction of the butt's.
 * The whip is a circular arc whose radius is the height left above the
 * bend, so it tops out exactly at `h`. Also returns the arc as a function
 * of 0..1, the bend's height, the tip, the sail's width (the tip's reach,
 * since the trailing edge hangs from it), the foot hem's height and the
 * sail's height.
 */
export function flagMast(h, steps = 10) {
  const bendY = h * FLAG.bend;
  const radius = h * (1 - FLAG.bend);
  const arcAt = (a) => {
    const turn = a * FLAG.sweep;
    return { x: radius * (1 - Math.cos(turn)), y: bendY + radius * Math.sin(turn) };
  };
  const points = [{ x: 0, y: 0, r: 1 }, { x: 0, y: bendY, r: FLAG.bendRadius }];
  for (let i = 1; i <= steps; i += 1) {
    const a = i / steps;
    const at = arcAt(a);
    points.push({ x: at.x, y: at.y, r: FLAG.bendRadius + (FLAG.tipRadius - FLAG.bendRadius) * a });
  }
  const tip = arcAt(1);
  const foot = h * FLAG.foot;
  return { points, arcAt, bendY, tip, width: tip.x, foot, sailH: tip.y - foot };
}

/*
 * The sail's outline as rows, each a leading point on the mast's centreline
 * (the renderer adds the mast's radius) and a trailing point on the hanging
 * edge, with t running 0 to 1 up the sail. Below the bend the rows are level
 * and the panel a rectangle; above it they fan from the last level row to
 * the tip across the swept corner. t advances the same metres per step in
 * both, so the print is not stretched at the join.
 */
export function flagSailProfile(h, bodyRows = 8, headRows = 6) {
  const mast = flagMast(h);
  const tBend = mast.sailH > 1e-6 ? (mast.bendY - mast.foot) / mast.sailH : 1;
  const rows = [];
  for (let i = 0; i <= bodyRows; i += 1) {
    const y = mast.foot + (mast.bendY - mast.foot) * (i / bodyRows);
    rows.push({ t: tBend * (i / bodyRows), lx: 0, ly: y, tx: mast.width, ty: y });
  }
  for (let j = 1; j <= headRows; j += 1) {
    const a = j / headRows;
    const lead = mast.arcAt(a);
    rows.push({ t: tBend + (1 - tBend) * a, lx: lead.x, ly: lead.y, tx: mast.width, ty: mast.bendY + (mast.tip.y - mast.bendY) * a });
  }
  return { rows, tBend, mast };
}

/* A canvas of the given size, made one way for both consumers. */
export function bannerCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/* The header board's height in metres; scene.js's mesh and the builder's
 * preview size from it. */
export const GATE_BANNER_H = 0.58;

/*
 * Canvas sizes, each the aspect of the surface it lands on so checks stay
 * square: the header is 2.74 by 0.58 m, a sleeve 0.42 by 1.83, a sail 0.68
 * across by 2.43 up (512 times the sail's width over its height, from
 * flagMast, is 144; change FLAG and this follows). The sail sheet holds
 * both faces side by side.
 */
const SAIL = [144, 512];
export const BANNER_SIZE = {
  header: [512, 112],
  sleeve: [112, 512],
  sail: SAIL,
  sailSheet: [SAIL[0] * 2, SAIL[1]],
};
