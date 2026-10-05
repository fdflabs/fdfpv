/*
 * capture.js: the screen's half of a capture (docs/campaign/interior/
 * TECH-NEEDS.md N5; the room's half is src/share/ops/capture.js). Centre,
 * zoom, hold, capture: the pilot frames an item, holds the frame steady,
 * and presses capture; this measures the still from the sensor's own
 * numbers and proposes it to the room, which judges it again from its own
 * and records the lower grade (CONTRACT-P0.md section 7).
 *
 * What is measured, and from what:
 *   size, off  the room's sight() on the pilot's position and camera, the
 *              same function on the same numbers, so a still the screen
 *              calls clean the room does too, short of the latency
 *   occlusion  the map's canopyBlocks, the room's own line of sight
 *   blur       the item's motion across the picture over the last HOLD_MS
 *              (the hold), times the mode's integration time
 *              (src/avionics/bands.js), in the sensor's own pixels: a ball
 *              locked on the item barely smears it, a picture swinging
 *              through a bank smears it to nothing
 * The grade is the room's cut on size and off (gradeOf), lowered by the
 * blur: BLUR_USABLE caps it at usable, BLUR_POOR at poor, and a still
 * smeared past BLUR_NONE is no still at all.
 *
 * Campaign agnostic: items, their sizes and their sets are mission data;
 * nothing here names a campaign. Stills stay on this device: the contract
 * carries the room's record of a capture, never its picture.
 *
 * Pure: no DOM, no three.js, so the checks drive it in Node.
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

import { sight } from '../share/ops/sight.js';
import {
  GRADES, gradeOf, inBand, lower, rank,
} from '../share/ops/capture.js';
import { SIZE, centreOf, membersOf } from '../share/ops/contacts.js';
import { resolve } from '../share/ops/stages.js';
import { BAND, EXPOSURE_S } from './bands.js';
import { basisOf } from './camball.js';

/* The hold: the still's blur is the worst motion over this long before
 * it, so a frame has to be held, not swept through. */
export const HOLD_MS = 500;
/* Sensor pixels of smear that make a still worthless (blur 1). */
export const BLUR_FULL_PX = 12;
/* Blur from which the grade is capped at usable, at poor, and refused. */
export const BLUR_USABLE = 0.3;
export const BLUR_POOR = 0.6;
export const BLUR_NONE = 1;

/* blur 0 to 1 from the picture's motion (frame widths a second), the
 * integration time (s), the sensor's native pixels across the frame and
 * the digital zoom (a crop: fewer of them across it). */
export function blurOf(speedFw, exposureS, nativePx, digital = 1) {
  return Math.min(1, (speedFw * exposureS * nativePx) / digital / BLUR_FULL_PX);
}

/* A framing's grade lowered by its blur, or null for none. */
export function gradeWithBlur(grade, blur) {
  if (!grade || blur >= BLUR_NONE) {
    return null;
  }
  if (blur >= BLUR_POOR) {
    return lower(grade, 'poor');
  }
  if (blur >= BLUR_USABLE) {
    return lower(grade, 'usable');
  }
  return grade;
}

/*
 * Where `to` lands in a picture from `from` looking with cam { dir,
 * tanHalf, aspect }: { x, y } in frame widths from the centre (x right,
 * y up), or null behind the camera. The basis is sight.js's.
 */
export function imageAt(from, cam, to) {
  const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const d = cam.dir;
  const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  if (!(along > 0)) {
    return null;
  }
  const b = basisOf(d);
  const half = along * cam.tanHalf;
  return {
    x: (v[0] * b.right[0] + v[1] * b.right[1]) / (2 * half),
    y: (v[0] * b.up[0] + v[1] * b.up[1] + v[2] * b.up[2]) / (2 * half),
  };
}

/*
 * The screen's capture judge for one mission on one world ({
 * canopyBlocks, poseOnRoute }). Each frame, sample() what the camera sees;
 * on the capture button, still() the best item in frame.
 */
export function createCapture(mission, world) {
  /* item id -> [{ t, x, y }] over the last HOLD_MS. */
  const hist = new Map();

  /* Where an item is at room ms t: its spots (several for a selection of
   * contacts, each judged), from the room's view for dials and contacts. */
  function spotsOf(item, view, t) {
    if (item.contact) {
      /* The view's records carry no size (CONTRACT-P0.md 4.3): the
       * kind's, as the room gives a contact whose data has none. */
      return membersOf(view.contacts ?? [], item.contact).map((c) => centreOf({ ...c, size: c.size ?? SIZE[c.kind] ?? 2 }, world, t)).filter(Boolean);
    }
    try {
      const at = resolve(item.at, view.dials ?? {});
      return at ? [at] : [];
    } catch {
      /* A dial the view has not told yet (before the go): not placed. */
      return [];
    }
  }

  function bestOf(item, view) {
    return (view.captures ?? []).filter((c) => c.item === item.id).reduce((b, c) => Math.max(b, rank(c.grade)), -1);
  }

  /* The worst picture speed (frame widths a second) of an item over the
   * hold, from its samples. */
  function speedOf(id) {
    const h = hist.get(id);
    if (!h || h.length < 2) {
      return 0;
    }
    let worst = 0;
    for (let i = 1; i < h.length; i += 1) {
      const dt = (h[i].t - h[i - 1].t) / 1000;
      if (dt > 0) {
        worst = Math.max(worst, Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y) / dt);
      }
    }
    return worst;
  }

  /*
   * Every capturable item's framing now: [{ item, at, size, off, grade
   * (before blur), blocked, band, inside }], for the HUD's framing cue and
   * for still(). from: the pilot's position; cam: { dir, tanHalf, aspect }.
   */
  function framings(view, t, from, cam) {
    const out = [];
    for (const item of mission.items ?? []) {
      if (bestOf(item, view) >= rank('clean')) {
        continue;
      }
      const view2 = item.view ? { ...item.view, dir: resolve(item.view.dir, view.dials ?? {}) } : null;
      for (const at of spotsOf(item, view, t)) {
        const s = sight(from, cam, at, item.size);
        if (!s || !s.inside) {
          continue;
        }
        out.push({
          item,
          at,
          size: s.size,
          off: s.off,
          grade: gradeOf(s.size, s.off),
          blocked: world.canopyBlocks(from, at),
          /* One sided items are seen from any side once the room says
           * their `open` fired (the view's `opened`). */
          band: view2 && !(view.opened ?? []).includes(item.id) ? inBand(view2, at, from) : true,
        });
      }
    }
    return out;
  }

  const api = {
    framings,
    /* Each frame: the picture position of every item in it, for the
     * hold's motion. t is room ms. */
    sample(view, t, from, cam) {
      const seen = new Set();
      for (const f of framings(view, t, from, cam)) {
        const p = imageAt(from, cam, f.at);
        if (!p) {
          continue;
        }
        const key = f.item.id;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const h = hist.get(key) ?? [];
        h.push({ t, x: p.x, y: p.y });
        while (h.length && h[0].t < t - HOLD_MS) {
          h.shift();
        }
        hist.set(key, h);
      }
      for (const key of [...hist.keys()]) {
        if (!seen.has(key)) {
          hist.delete(key);
        }
      }
    },
    /*
     * The still at room ms t: { msg } to send (CONTRACT-P0.md 3 `capture`)
     * with { item, grade, framing }, or { why } when nothing in frame
     * makes one: 'frame' (nothing capturable in the picture or too
     * small), 'blocked' (crowns), 'blur' (smeared past use), 'done'
     * (everything in frame already captured at this grade or better),
     * 'angle' (a one sided item seen from outside its band, which the room
     * would refuse; told only when the view carries `opened`, so a room
     * that does not say is still asked).
     * opts: { mode (a sensor mode), night (bool), digital (the digital
     * zoom) }.
     */
    still(view, t, from, cam, { mode = 'eo', night = false, digital = 1 } = {}) {
      const band = BAND[mode] ?? BAND.eo;
      const exposure = (EXPOSURE_S[mode] ?? EXPOSURE_S.eo)[night ? 1 : 0];
      const all = framings(view, t, from, cam);
      if (!all.length) {
        return { why: 'frame' };
      }
      const graded = all.map((f) => {
        const blur = blurOf(speedOf(f.item.id), exposure, band.native, digital);
        return { ...f, blur, final: f.blocked ? null : gradeWithBlur(f.grade, blur) };
      });
      const predicts = Array.isArray(view.opened);
      const better = graded.filter((f) => f.final && rank(f.final) > bestOf(f.item, view) && (f.band || !predicts));
      if (!better.length) {
        if (predicts && graded.some((f) => f.final && !f.band && rank(f.final) > bestOf(f.item, view))) {
          return { why: 'angle' };
        }
        if (graded.some((f) => f.final)) {
          return { why: 'done' };
        }
        if (graded.some((f) => f.grade && !f.blocked)) {
          return { why: 'blur' };
        }
        if (graded.some((f) => f.grade && f.blocked)) {
          return { why: 'blocked' };
        }
        return { why: 'frame' };
      }
      /* Best grade, then in its viewing band, then nearest the centre. */
      better.sort((a, b) => rank(b.final) - rank(a.final) || Number(b.band) - Number(a.band) || a.off - b.off);
      const f = better[0];
      return {
        item: f.item.id,
        grade: f.final,
        band: f.band,
        framing: { size: round3(f.size), off: round3(f.off), blur: round3(f.blur) },
        msg: {
          type: 'ops', op: 'capture', item: f.item.id, t: Math.round(t), grade: f.final, framing: { size: round3(f.size), off: round3(f.off), blur: round3(f.blur) },
        },
      };
    },
    reset() {
      hist.clear();
    },
  };
  return api;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/*
 * The pilot's own stills, kept for the debrief: in memory only, for the
 * match they were taken in, at most `max` of them (the oldest of a grade
 * already bettered go first). A still is { match, item, grade, t, seat,
 * framing, image } where image is whatever the shell grabbed (a Blob or a
 * data URL). Nothing here is sent anywhere or written to storage.
 */
export function createStillStore({ max = 48 } = {}) {
  let list = [];
  return {
    add(still) {
      list.push(still);
      if (list.length > max) {
        /* Drop the worst still of an item that has a better one, else the
         * oldest. */
        const worse = list.findIndex((s) => list.some((o) => o !== s && o.item === s.item && rank(o.grade) >= rank(s.grade)));
        list.splice(worse >= 0 ? worse : 0, 1);
      }
      return still;
    },
    /* A match's stills, the best of each item first taken. */
    of(match) {
      const best = new Map();
      for (const s of list) {
        if (s.match !== match) {
          continue;
        }
        const b = best.get(s.item);
        if (!b || rank(s.grade) > rank(b.grade)) {
          best.set(s.item, s);
        }
      }
      return [...best.values()];
    },
    all() {
      return list.slice();
    },
    /* Forget every match but this one (a new match keeps none of the
     * last's pictures). */
    keepOnly(match) {
      list = list.filter((s) => s.match === match);
    },
    clear() {
      list = [];
    },
  };
}

export { GRADES };
