/*
 * trackdoc.js: a track builder document read as a course the game can fly.
 *
 * The builder owns the document format: normalisation, aperture maths, the
 * racing line, figure rules and marker squares all live in its pure modules,
 * and this file calls them rather than keeping a second reading of the format
 * that could drift. What is left here is the frame change (document Z up,
 * corner origin, to scene Y up, centred) and the shape the lap checker and the
 * scene read. Pure and synchronous: no rendering, no I/O, no state kept.
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

import {
  ELEMENTS, KIND, GATE_FLAG_POLE_R, flagLeanSign, flagSideOf, flagSideSigns,
  gateFlagHeight, isUnbuilt, trackClassOf, virtualApertureDims,
} from '../trackbuilder/elements.js';
import {
  normalize, elementById, aperturesOf, startPadsOf, logosOf, logoForDecal, dressOrder,
} from '../trackbuilder/model.js';
import { buildPath } from '../trackbuilder/path.js';
import { wrapBetween, figureCueOf, upgradeStackedFigures } from '../trackbuilder/figures.js';
import { gateScaleFor } from './track.js';
import { startBlockLaneOffset, startBlockDims } from '../art/startblock.js';
import { guideFromKnots } from './guide.js';
import { str } from '../strings/index.js';

// How far behind the first gate a course with no start pads parks the craft.
// A wing needs room to get up to speed before its first gate.
const SETBACK_M = { full: 7.5, wing: 40 };

// Below this a marker's pass clearance or a dive gate's sill counts as unset.
const UNSET_M = 0.05;

/*
 * Travel through a gate runs along minus its heading vector, so yaw h means
 * travel along (-sin h, -cos h). Returns the yaw for a horizontal travel
 * vector, or null when the vector has no usable direction.
 */
export function headingForTravel(tx, tz) {
  const n = Math.hypot(tx, tz);
  if (!(n > 1e-9)) {
    return null;
  }
  return Math.atan2(-tx / n, -tz / n);
}

/*
 * The scene frame change. z is written as the negated difference, not
 * depth/2 - y, because the two differ in the sign of zero on the midline and
 * the recorded courses carry that sign.
 */
function scenePoint(field, p) {
  return { x: p.x - field.width / 2, z: -(p.y - field.depth / 2) };
}

function height(z) {
  return z || 0;
}

// A start pad's document yaw is the way the quad sets off, not a plane normal.
function padYaw(yaw) {
  const fx = Math.cos(yaw);
  const fz = -Math.sin(yaw);
  return headingForTravel(fx, fz) ?? 0;
}

/*
 * Imported Velocidrone tracks carry the mesh origin as an elevation: a dive
 * gate floated to its sill height with no sill, a flag lifted half its own
 * height. Folded into the normalised copy before anything reads a position.
 */
function foldImportedHeights(doc) {
  for (const el of doc.elements) {
    const { dims, position } = el;
    if (el.type === 'diveGate' && (dims.sillH || 0) < UNSET_M) {
      if ((position.z || 0) > 0.3) {
        dims.sillH = Math.max(0, position.z - (dims.clearH || 0) / 2);
      }
      if ((dims.sillH || 0) < UNSET_M) {
        dims.sillH = ELEMENTS.diveGate.dims.sillH;
      }
      position.z = 0;
    } else if ((el.type === 'flag' || el.type === 'cone')
        && position.z > 0 && position.z < (dims.height || 2.5)) {
      position.z = 0;
    }
  }
}

function makeStructure(el, def, ctx) {
  const at = scenePoint(ctx.field, el.position);
  const isGate = def.kind === KIND.APERTURE;
  let yaw = el.yaw;
  if (isGate) {
    yaw = el.yaw + Math.PI / 2;
  } else if (def.kind === KIND.START) {
    yaw = padYaw(el.yaw);
  }
  const s = {
    id: el.id,
    type: el.type,
    kind: def.kind,
    name: el.name || def.label,
    x: at.x,
    z: at.z,
    baseY: height(el.position.z),
    yaw,
    pitch: isGate ? el.pitch : 0,
    dims: isGate ? builtDims(el.dims, ctx.scale) : { ...el.dims },
  };
  if (isGate && isUnbuilt(el)) {
    s.unbuilt = true;
  }
  if (def.flagSide) {
    s.flagSigns = flagSideSigns(flagSideOf(el));
    s.flagLeans = s.flagSigns.map(flagLeanSign);
    s.flagH = gateFlagHeight(el.dims) * ctx.scale;
    s.flagPoleR = GATE_FLAG_POLE_R * ctx.scale;
  }
  s.dress = ctx.dress.has(el.id) ? ctx.dress.get(el.id) : null;
  return s;
}

// Only the lengths are scaled up to the class; positions never are.
function builtDims(d, scale) {
  return {
    clearW: d.clearW * scale,
    clearH: d.clearH * scale,
    sillH: d.sillH * scale,
    levelPitch: d.levelPitch * scale,
    stack: Math.max(1, Math.round(d.levels)),
  };
}

/*
 * A flag, cone, pole or pylon scores as a virtual square on the side the
 * sequence named. The square's inner edge sits on the pole, so its centre is
 * pushed outward by the class pad the builder computed.
 */
function markerStation(knot, el, s, flyOrder, ctx) {
  const clearance = knot.seq.clearance ?? 0;
  if (el.type === 'waypoint' || clearance < UNSET_M) {
    return null;
  }
  const dims = virtualApertureDims(el, knot.seq, ctx.cls);
  const heading = headingForTravel(knot.tangent.x, -knot.tangent.y);
  const at = scenePoint(ctx.field, knot.pos);
  let ox = at.x - s.x;
  let oz = at.z - s.z;
  const on = Math.hypot(ox, oz);
  if (on > 1e-6) {
    ox /= on;
    oz /= on;
  } else {
    ox = 0;
    oz = 0;
  }
  return {
    elementId: el.id,
    structure: s,
    apertureIndex: 0,
    flyOrder,
    x: at.x + ox * dims.outward,
    z: at.z + oz * dims.outward,
    poleX: s.x,
    poleZ: s.z,
    baseY: height((knot.markerPos ?? knot.pos).z),
    centreY: dims.centerH,
    clearW: dims.clearW,
    clearH: dims.clearH,
    yaw: heading ?? s.yaw,
    pitch: 0,
    name: s.name,
    type: el.type,
    entry: 1,
    cue: '',
    virtual: true,
  };
}

/*
 * The pitch is the climb or dive of the direction of travel, which folds the
 * plane's own pitch and the entry face into one angle.
 */
function gateStation(knot, el, s, flyOrder, ctx) {
  const levels = aperturesOf(el);
  const index = Math.min(Math.max(0, knot.seq.apertureIndex ?? 0), levels.length - 1);
  const ap = levels[index];
  const t = knot.tangent;
  const at = scenePoint(ctx.field, el.position);
  return {
    elementId: el.id,
    structure: s,
    apertureIndex: index,
    flyOrder,
    x: at.x,
    z: at.z,
    baseY: height(el.position.z),
    centreY: ap.centerH * ctx.scale,
    clearW: ap.clearW * ctx.scale,
    clearH: ap.clearH * ctx.scale,
    yaw: headingForTravel(t.x, -t.y) ?? s.yaw,
    pitch: Math.asin(Math.max(-1, Math.min(1, t.z))),
    name: s.name,
    type: el.type,
    entry: knot.seq.entry,
    cue: '',
    virtual: false,
  };
}

const STATION_BY_ROLE = new Map([['marker', markerStation], ['aperture', gateStation]]);

// Stations come off the builder's racing line, so the course flown is the one it drew.
function stationsAlong(knots, doc, byId, ctx) {
  const stations = [];
  for (const knot of knots) {
    const make = knot.seq && STATION_BY_ROLE.get(knot.role);
    const el = make && elementById(doc, knot.seq.elementId);
    const s = el && byId.get(el.id);
    const st = s && make(knot, el, s, stations.length, ctx);
    if (st) {
      stations.push(st);
    }
  }
  return stations;
}

function spawnFor(doc, stations, ctx) {
  const pads = startPadsOf(doc);
  if (pads) {
    const yaw = padYaw(pads.yaw);
    const off = startBlockLaneOffset(pads.dims);
    const at = scenePoint(ctx.field, pads.position);
    return {
      x: at.x + Math.cos(yaw) * off,
      z: at.z - Math.sin(yaw) * off,
      yaw,
      pitch: startBlockDims(pads.dims.padSize).tilt,
    };
  }
  if (!stations.length) {
    return { x: 0, z: 0, yaw: 0 };
  }
  const first = stations[0];
  const back = SETBACK_M[ctx.cls] ?? SETBACK_M.full;
  ctx.warnings.push(str('trackdoc.no_start_pads_in_the_track'));
  return {
    x: first.x + Math.sin(first.yaw) * back,
    z: first.z + Math.cos(first.yaw) * back,
    yaw: first.yaw,
  };
}

function guideKnot(k, field) {
  const at = scenePoint(field, k.pos);
  const g = { role: k.role, x: at.x, z: at.z, y: height(k.pos.z), radius: 0 };
  if (k.role === 'marker' && k.markerPos) {
    const pole = scenePoint(field, k.markerPos);
    g.poleX = pole.x;
    g.poleZ = pole.z;
    g.radius = k.seq && k.seq.clearance != null ? k.seq.clearance : 1.5;
  }
  return g;
}

// A decal naming a logo the course no longer has is dropped, never repainted
// with another sponsor's logo.
function decalsOf(doc, logos, field) {
  const out = [];
  for (const el of doc.elements) {
    if (ELEMENTS[el.type]?.kind !== KIND.DECAL) {
      continue;
    }
    const mark = logoForDecal(doc, el);
    const logo = mark ? logos.indexOf(mark) : -1;
    if (logo < 0) {
      continue;
    }
    const at = scenePoint(field, el.position);
    out.push({
      x: at.x,
      z: at.z,
      yaw: el.yaw,
      w: Math.max(0.1, el.dims.width),
      d: Math.max(0.1, el.dims.depth),
      logo,
    });
  }
  return out;
}

// Consecutive stations on the same element, never wrapping round the lap.
function runsOf(stations) {
  const runs = [];
  for (const st of stations) {
    const run = runs[runs.length - 1];
    if (run && run[0].elementId === st.elementId) {
      run.push(st);
    } else {
      runs.push([st]);
    }
  }
  return runs;
}

/*
 * Writes each station's cue and returns the stacked figures. wrapBetween is
 * called without the track class, so a wing figure wraps at the default
 * class's reach while the path solver used the real one; that is the recorded
 * behaviour and changing it is its own commit.
 */
function figuresOf(doc, stations, field) {
  const figures = [];
  for (const run of runsOf(stations)) {
    const el = elementById(doc, run[0].elementId);
    if (!el) {
      continue;
    }
    const seqs = run.map((st) => ({ apertureIndex: st.apertureIndex, entry: st.entry }));
    for (const st of run) {
      st.cue = figureCueOf(el, { apertureIndex: st.apertureIndex }, seqs);
    }
    if (run.length < 2) {
      continue;
    }
    const points = [];
    run.forEach((st, k) => {
      points.push({ x: st.x, y: st.baseY + st.centreY, z: st.z });
      const nxt = run[k + 1];
      if (!nxt) {
        return;
      }
      const wrap = scenePoint(field, wrapBetween(el, seqs[k], seqs[k + 1]).pos);
      const y = (st.baseY + st.centreY + nxt.baseY + nxt.centreY) * 0.5;
      points.push({ x: wrap.x, y, z: wrap.z });
    });
    figures.push({ flyOrders: run.map((st) => st.flyOrder), points });
  }
  return figures;
}

export function courseFromDocument(raw) {
  const { doc, repairs } = normalize(raw);
  upgradeStackedFigures(doc);
  foldImportedHeights(doc);
  const cls = trackClassOf(doc);
  const ctx = {
    cls,
    scale: gateScaleFor(cls),
    field: doc.field,
    dress: dressOrder(doc),
    warnings: [...repairs],
  };

  const structures = [];
  const byId = new Map();
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (def.kind === KIND.ANNOTATION || def.kind === KIND.DECAL) {
      continue;
    }
    const s = makeStructure(el, def, ctx);
    structures.push(s);
    byId.set(el.id, s);
  }

  const path = buildPath(doc);
  const stations = stationsAlong(path.knots, doc, byId, ctx);
  const spawn = spawnFor(doc, stations, ctx);
  const line = path.samples.map((s) => {
    const at = scenePoint(ctx.field, s.pos);
    return { x: at.x, y: height(s.pos.z), z: at.z };
  });
  const guide = guideFromKnots(path.knots.map((k) => guideKnot(k, ctx.field)));
  if (!stations.length) {
    ctx.warnings.push(str('trackdoc.this_track_has_nothing_to_fly'));
  }

  const logos = logosOf(doc);
  const course = {
    id: 'custom',
    name: doc.name,
    documentId: doc.id,
    logos: logos.map((l) => l.image),
    decals: decalsOf(doc, logos, ctx.field),
    field: { width: ctx.field.width, depth: ctx.field.depth },
    trackClass: cls,
    structures,
    stations,
    spawn,
    line,
    guide,
    figures: figuresOf(doc, stations, ctx.field),
    warnings: ctx.warnings,
    lapLength: path.length,
    closed: path.closed,
  };
  course.samples = corridorSamples(course);
  return course;
}

/*
 * Points the height field keeps flat: the racing line thinned to one point
 * per spacingM (measured from the last point kept), every structure, and the
 * spawn. Never empty, so the terrain always has somewhere to flatten.
 */
export function corridorSamples(course, spacingM = 4) {
  const out = [];
  let last = null;
  for (const p of course.line) {
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= spacingM) {
      out.push({ x: p.x, z: p.z });
      last = p;
    }
  }
  for (const s of course.structures) {
    out.push({ x: s.x, z: s.z });
  }
  if (course.spawn) {
    out.push({ x: course.spawn.x, z: course.spawn.z });
  }
  if (!out.length) {
    out.push({ x: 0, z: 0 });
  }
  return out;
}
