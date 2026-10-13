/*
 * wardebug.js: the attackers' debug overlay, for a developer testing a
 * war (docs/redesign/COMPLETENESS.md 33). Over the picture, for every
 * live attacker:
 *
 *   route      where its plan flies it from now, ROUTE_MS ahead
 *              (src/share/war/routes.js poseAt), a cyan line
 *   next       its next waypoint: the end of the leg it is on, an orbit's
 *              centre, a line's end, a parked spot; a magenta cross. A
 *              Hunter, which the room steers, has none
 *   hunts      a Hunter's target seat, as the room said it (HUNTS), a red
 *              line to that pilot where this page draws one
 *   label      its kind and id, and the stage whose spawn it is
 *
 * Drawn only in developer mode (src/share/devhooks.js DEV): set() turns
 * it on only there, and the shell's toggle is a devHooks hook. It paints
 * as the war markers do (src/ui/warmarkers.js), a fixed canvas over the
 * picture, after the frame's render, with the camera as it drew.
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

import { poseAt } from '../share/war/routes.js';
import { stagesOf } from '../share/war/stages.js';
import { DEV } from '../share/devhooks.js';

/* How far ahead a route is drawn, ms, and its step. */
const ROUTE_MS = 60000;
const ROUTE_STEP_MS = 500;
/* Nearer than this in front of the camera, metres, a point is not drawn. */
const NEAR_M = 0.5;
const CROSS_PX = 6;

/*
 * The route clock at room ms t: t less the EMP stalls before it, held at
 * a stall's start during it. poseAt's own rule (routes.js), which keeps
 * it private.
 */
function routeTime(plan, t) {
  let te = t;
  for (const [at, ms] of plan.stalls ?? []) {
    if (t <= at) {
      break;
    }
    if (t < at + ms) {
      return at - (t - te);
    }
    te -= ms;
  }
  return te;
}

/* The next waypoint of a plan at room ms t, scene metres. */
export function nextWaypoint(plan, t) {
  const te = routeTime(plan, t);
  const ph = plan.phases.find((x) => te <= x.t1) ?? plan.phases.at(-1);
  if (ph.k === 'park') {
    return ph.p.slice();
  }
  if (ph.k === 'orbit') {
    return ph.c.slice();
  }
  if (ph.k === 'line') {
    const s = (ph.speed * (ph.t1 - ph.t0)) / 1000;
    return ph.a.map((v, i) => v + ph.d[i] * s);
  }
  const s = Math.min(ph.m, (ph.speed * (Math.max(te, ph.t0) - ph.t0)) / 1000);
  const leg = ph.legs.find((x) => s <= x.s + x.m) ?? ph.legs.at(-1);
  return leg.a.map((v, i) => v + leg.d[i] * leg.m);
}

/* camera and view as createWarMarkers takes them. */
export function createWarDebug(camera, view) {
  let canvas = null;
  let ctx = null;
  let on = false;
  let queued = false;
  let rows = null;
  let drawn = [];
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  const pose = { p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };

  function build() {
    canvas = document.createElement('canvas');
    canvas.className = 'war-debug';
    Object.assign(canvas.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', zIndex: '39', pointerEvents: 'none', display: 'none',
    });
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
  }

  function hide() {
    rows = null;
    drawn = [];
    if (canvas) {
      canvas.style.display = 'none';
    }
  }

  /* A scene point on the picture, CSS px, or null behind the camera. */
  function project(p) {
    const e = camera.matrixWorldInverse.elements;
    const pe = camera.projectionMatrix.elements;
    const vx = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
    const vy = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
    const vz = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
    if (vz > -NEAR_M) {
      return null;
    }
    const w = -vz;
    return [cssW / 2 + ((pe[0] * vx + pe[8] * vz) / w) * (cssW / 2), cssH / 2 - ((pe[5] * vy + pe[9] * vz) / w) * (cssH / 2)];
  }

  function resize() {
    const w = view.clientWidth || window.innerWidth;
    const h = view.clientHeight || window.innerHeight;
    const r = Math.min(2, window.devicePixelRatio || 1);
    if (w === cssW && h === cssH && r === dpr) {
      return;
    }
    cssW = w;
    cssH = h;
    dpr = r;
    canvas.width = Math.round(w * r);
    canvas.height = Math.round(h * r);
  }

  /* A polyline through the points in front of the camera; a point behind
   * breaks it. Returns how many points were on the picture. */
  function line(points) {
    let n = 0;
    let open = false;
    ctx.beginPath();
    for (const p of points) {
      const s = project(p);
      if (!s) {
        open = false;
        continue;
      }
      n += 1;
      if (open) {
        ctx.lineTo(s[0], s[1]);
      } else {
        ctx.moveTo(s[0], s[1]);
        open = true;
      }
    }
    ctx.stroke();
    return n;
  }

  function paint() {
    queued = false;
    if (!on || !rows) {
      return;
    }
    resize();
    canvas.style.display = 'block';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.lineWidth = 1.5;
    ctx.font = '12px monospace';
    for (const d of drawn) {
      ctx.strokeStyle = '#00e5ff';
      d.routePx = line(d.route);
      const w = d.next && project(d.next);
      d.nextShown = Boolean(w);
      if (w) {
        ctx.strokeStyle = '#ff40ff';
        ctx.beginPath();
        ctx.moveTo(w[0] - CROSS_PX, w[1] - CROSS_PX);
        ctx.lineTo(w[0] + CROSS_PX, w[1] + CROSS_PX);
        ctx.moveTo(w[0] + CROSS_PX, w[1] - CROSS_PX);
        ctx.lineTo(w[0] - CROSS_PX, w[1] + CROSS_PX);
        ctx.stroke();
      }
      if (d.huntsAt) {
        ctx.strokeStyle = '#ff3030';
        d.huntPx = line([d.p, d.huntsAt]);
      }
      const s = project(d.p);
      d.labelShown = Boolean(s);
      if (s) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(d.label, s[0] + 8, s[1] - 8);
        if (d.hunts != null) {
          ctx.fillText(`hunts ${d.hunts}`, s[0] + 8, s[1] + 6);
        }
      }
    }
  }

  return {
    /* On or off; on only in developer mode. Returns whether it is on. */
    set(want) {
      on = DEV && Boolean(want);
      if (on && !canvas) {
        build();
      }
      if (!on) {
        hide();
      }
      return on;
    },
    /*
     * Once a frame. list: roomwar debugAt(now), or null outside a live war
     * to hide it; mission roomwar mission(); seatAt(seat) a pilot's scene
     * position, or null where this page has none.
     */
    update(list, now, mission, seatAt) {
      if (!on) {
        return;
      }
      if (!list || !mission) {
        hide();
        return;
      }
      const stages = stagesOf(mission);
      rows = list;
      drawn = list.map((a) => {
        const route = [];
        if (Number.isFinite(a.plan.tEnd)) {
          const end = Math.min(a.plan.tEnd, now + ROUTE_MS);
          for (let t = now; t < end; t += ROUTE_STEP_MS) {
            route.push(poseAt(a.plan, t, pose).p.slice());
          }
          route.push(poseAt(a.plan, end, pose).p.slice());
        }
        const wave = mission.waves?.[a.born.wave];
        const stage = wave ? stages[wave.round]?.id ?? null : null;
        return {
          id: a.id,
          kind: a.kind,
          routeId: a.born.route,
          p: a.p,
          stage,
          label: `${a.kind} ${a.id}${stage ? ` ${stage}` : ''}`,
          route,
          /* A Hunter's plan says only where it was born: the room steers
           * it, and its way on is its target, drawn as hunts. */
          next: a.plan.end === 'steer' ? null : nextWaypoint(a.plan, now),
          hunts: a.hunts ?? null,
          huntsAt: a.hunts != null ? seatAt(a.hunts) : null,
          routePx: 0,
          nextShown: false,
          huntPx: 0,
          labelShown: false,
        };
      });
      if (!queued) {
        queued = true;
        queueMicrotask(paint);
      }
    },
    /* What the last paint drew, for war:markers. */
    shown() {
      return {
        on,
        painted: Boolean(canvas && canvas.style.display === 'block'),
        attackers: drawn.map((d) => ({
          id: d.id, kind: d.kind, routeId: d.routeId, stage: d.stage, next: d.next, hunts: d.hunts, route: d.route.length, routePx: d.routePx, nextShown: d.nextShown, huntPx: d.huntPx, labelShown: d.labelShown,
        })),
      };
    },
    clear() {
      hide();
    },
  };
}
