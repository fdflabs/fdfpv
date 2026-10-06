/*
 * render-golden/banners.js: src/art/banners.js. Its palette and sizes,
 * every painter drawn onto a CPU canvas as pictures (the header, both
 * sleeves, both sail accents, the two faced sail sheet, the chequer and the
 * default mark, with and without an uploaded logo of three shapes), and
 * the feather flag's mast and sail outline as numbers.
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

import * as banners from '../../../src/art/banners.js';
import { picture, canvas2d } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);

/* Logos of three shapes, as an uploaded image arrives: wide, tall, square. */
function logo(w, h) {
  const { canvas, ctx } = canvas2d(w, h);
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e9c46a';
  ctx.beginPath();
  ctx.arc(w * 0.35, h * 0.5, Math.min(w, h) * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e76f51';
  ctx.fillRect(w * 0.6, h * 0.2, w * 0.3, h * 0.6);
  return canvas;
}
const LOGOS = { none: undefined, wide: logo(300, 100), tall: logo(80, 240), square: logo(128, 128) };

function paint(fn, w, h, opts) {
  const { canvas, ctx } = canvas2d(w, h);
  /* Something under the paint, so a painter that fails to clear shows. */
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, w, h);
  fn(ctx, w, h, opts);
  return picture(canvas);
}

const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

export function cases() {
  const [hw, hh] = banners.BANNER_SIZE.header;
  const [sw, sh] = banners.BANNER_SIZE.sleeve;
  const [fw, fh] = banners.BANNER_SIZE.sail;
  const [pw, ph] = banners.BANNER_SIZE.sailSheet;
  return {
    constants: () => ({
      exports: Object.keys(banners).sort(),
      BANNER: banners.BANNER,
      FLAG: round(banners.FLAG),
      HEADER_NUMBER_ZONE: banners.HEADER_NUMBER_ZONE,
      GATE_BANNER_H: banners.GATE_BANNER_H,
      BANNER_SIZE: banners.BANNER_SIZE,
      hex: Object.keys(banners.BANNER).map((k) => banners.bannerHex(k)),
      badHex: ['nope', 'toString'].map((k) => {
        try {
          return banners.bannerHex(k);
        } catch (e) {
          return e.message;
        }
      }),
    }),
    canvas: () => {
      const c = banners.bannerCanvas(37, 19);
      return [c.tagName, c.width, c.height, c.isConnected];
    },
    header: () => Object.fromEntries(Object.entries(LOGOS).map(([k, l]) => [k, paint(banners.paintGateHeader, hw, hh, { logo: l })])),
    headerZone: () => [paint(banners.paintGateHeader, hw, hh, { numberZone: 0.05 }), paint(banners.paintGateHeader, 300, 60, { numberZone: 0.3, logo: LOGOS.wide })],
    sleeve: () => Object.fromEntries(Object.entries(LOGOS).flatMap(([k, l]) => [[k, paint(banners.paintGateSleeve, sw, sh, { logo: l })], [`${k}Flip`, paint(banners.paintGateSleeve, sw, sh, { logo: l, flip: true })]])),
    sail: () => Object.fromEntries(Object.entries(LOGOS).flatMap(([k, l]) => [
      [`${k}Navy`, paint(banners.paintFlagSail, fw, fh, { logo: l })],
      [`${k}Red`, paint(banners.paintFlagSail, fw, fh, { logo: l, accent: 'red' })],
      [`${k}Mirror`, paint(banners.paintFlagSail, fw, fh, { logo: l, mirrorMark: true })],
    ])),
    sailSheet: () => [paint(banners.paintFlagSailPair, pw, ph, {}), paint(banners.paintFlagSailPair, pw, ph, { accent: 'red', logo: LOGOS.wide })],
    parts: () => {
      const { canvas, ctx } = canvas2d(200, 120);
      banners.chequer(ctx, 0, 0, 200, 20, 10);
      banners.chequer(ctx, 10, 30, 150, 18, 7, '#000000', '#ffffff');
      banners.chequer(ctx, 0, 55, 50, 10, 0);
      banners.chequerDevice(ctx, 20, 70, 80, 45);
      banners.chequerDevice(ctx, 120, 70, 20, 45);
      return picture(canvas);
    },
    mast: () => [1, 2.43, 3.1].map((h) => {
      const m = banners.flagMast(h);
      const coarse = banners.flagMast(h, 3);
      return round({ points: m.points, bendY: m.bendY, tip: m.tip, width: m.width, foot: m.foot, sailH: m.sailH, arc: [0, 0.25, 0.5, 1].map(m.arcAt), coarse: coarse.points });
    }),
    profile: () => [1, 2.43].map((h) => {
      const p = banners.flagSailProfile(h);
      const q = banners.flagSailProfile(h, 3, 2);
      return round({ rows: p.rows, tBend: p.tBend, mastWidth: p.mast.width, small: q.rows });
    }),
  };
}
