/*
 * warmarkers.js: where the attackers are, drawn over the picture for a
 * war (docs/WARFARE-PLAN.md section 5.2). An attacker is a metre or two
 * across, so past a few hundred metres it is under a pixel; this is how a
 * pilot finds one to hunt:
 *
 *   on screen   corner brackets round every live attacker in view, a down
 *               arrow over them, its kind above and its distance below;
 *               the one nearest the middle of the picture drawn heavier
 *   in range    the distance is the fuze's: from the nearest part box of
 *               this aircraft (its last pose sent to the room) to the
 *               attacker's centre, src/game/midair.js hullDistance, the
 *               room's own measure (edge/rooms/war.js), to the metre
 *               under FINE_M. Within the seat's fuze radius (the room's
 *               view, src/share/war/fuze.js) the brackets and the label
 *               go red and read IN RANGE: the room would go off now
 *   off screen  an arrow on the edge for every attacker out of view,
 *               behind, above or below, placed where the pilot has to
 *               turn: at the angle of its direction in the camera's own
 *               plane, so dead ahead of the edge is the way round. A
 *               direction within BEHIND_RAD of straight behind has no
 *               stable angle and goes to the bottom edge. Arrows in one
 *               BIN_RAD sector merge into one with a count
 *   radar       a heading up disc on the right, under the flight
 *               screen's buttons (its bottom right is the speed readout): the view's
 *               direction is up, north a tick on the rim, rings at 500 m
 *               and 1.5 km, this aircraft at the centre, attackers as
 *               dots (past RADAR_M on the rim), the dam's intake line and
 *               the switchyard, and a target an attacker is going for
 *               blinking
 *   hunted      a Hunter that has picked this pilot: a red frame round
 *               the picture and an arrow from the middle toward it
 *
 * Colour is threat: Hunters, which chase pilots, red and pulsing; what
 * goes for the dam (Strikers, Loiterers, the FPV swarm) orange; Scouts
 * and sea drones yellow. A kind this build has no tag for (a later
 * mission's) is drawn yellow with no tag. The chrome is the war HUD's
 * green, and nothing here says anything about the link.
 *
 * WHICH HUNTER HAS PICKED YOU. The room says: HUNTS (0xA1,
 * src/share/roomwire.js) carries each hunter's target seat, roomwar's
 * `hunts`. From a room that does not send it yet (one from before HUNTS)
 * it is read off the pose instead: a hunter flies pure pursuit at its
 * target, so one within TARGET_RANGE_M whose nose is within HUNTED_RAD of
 * the line to this aircraft is taken to be on it. Two pilots close
 * together can both be warned that way; that errs toward the warning.
 *
 * WHEN IT DRAWS. update() runs in the shell's room frame, before the
 * camera has been put where this frame draws from, so the projection is
 * deferred to a microtask: that runs when the frame's task returns, after
 * the render and before the browser paints, with the camera exactly as it
 * drew. Whatever the view (FPV, chase, line of sight, a harness camera),
 * the markers are where the picture is.
 *
 * COST. Nothing is allocated per frame: typed arrays hold the per attacker
 * numbers, the labels are cached strings, and the one microtask callback
 * is bound once. update() plus the paint is timed, and shown().cost says
 * the mean and worst over the last COST_FRAMES frames.
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

import { str } from '../strings/index.js';
import { hullDistance } from '../game/midair.js';

const GREEN = '#7dff9a';
const DIM = 'rgba(125, 255, 154, 0.35)';
const SCRIM = 'rgba(4, 10, 6, 0.55)';
const INK = 'rgba(0, 0, 0, 0.8)';
const RED = '#ff4a3a';
const ORANGE = '#ff8a1f';
const YELLOW = '#ffe040';
/* The war HUD's monospace (src/ui/warhud.js), in a canvas font's form. */
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

/* Threat by kind (src/share/war/routes.js KINDS): 2 comes for pilots, 1
 * for the dam, 0 for neither directly. */
const THREAT = {
  hunter: 2, strike: 1, loiter: 1, fpv: 1, scout: 0, boat: 0, decoy: 0,
};
/* A decoy is marked as a Striker until it is this close (mission 3). */
const DECOY_M = 300;
const KINDS = Object.keys(THREAT);
/* kindOf's value for a kind not in THREAT: its tag is empty. */
const UNKNOWN = KINDS.length;
const COLOUR = [YELLOW, ORANGE, RED];
const FONT_MARK = `800 12px ${FONT}`;
const FONT_LEAD = `800 14px ${FONT}`;
const FONT_RING = `700 10px ${FONT}`;
const FONT_UP = `800 11px ${FONT}`;
const FONT_HUNT = `900 22px ${FONT}`;
const FONT_HUNT_D = `800 15px ${FONT}`;

/* More live attackers than this are not drawn; a mission has a few dozen. */
const MAX = 256;
/* Off screen arrows: sectors of 12 degrees, so a merged arrow at its
 * sector's middle is within 6 of every attacker in it. */
const BINS = 30;
const BIN_RAD = (2 * Math.PI) / BINS;
/* Straight behind within this (about 6 degrees): the bottom edge. */
const BEHIND_TAN = 0.1;
/* The arrows' inset from the picture's edge, CSS px. */
const EDGE_PX = 46;
/* A marker's centre this close to the edge is an arrow instead. */
const IN_PX = 24;
/* The brackets' half size at least and at most, CSS px, and the size an
 * attacker is taken to be, metres, for the brackets to grow as it nears. */
const BOX_MIN = 15;
const BOX_MAX = 70;
const BODY_M = 2.5;
/* Distances under this are to the metre, and the fuze's (hullDistance);
 * past it by 10 m and from the centre, where a metre says nothing. */
const FINE_M = 30;
/* Markers closer than this on the picture share one label, the
 * nearest's, with a count: a Striker group or the FPV swarm is a few
 * metres apart, one pile of brackets at range. */
const GROUP_PX = 44;
/* Radar: radius CSS px, the rim's range in metres, its rings. */
const RADAR_PX = 86;
const RADAR_M = 2000;
/* The disc's top: below the flight screen's buttons and the OSD's timers, top right. */
const RADAR_TOP_PX = 164;
const RINGS_M = [500, 1500];
/* The hunter rule (edge/rooms/warhunt.js TARGET_RANGE_M) and the cone a
 * hunter's nose is taken to point at this aircraft within (30 degrees). */
const HUNT_RANGE_M = 1500;
const HUNTED_COS = Math.cos(Math.PI / 6);
/* A new hunter lock is reported for the radio no oftener than this. */
const HUNTED_SAY_MS = 15000;
const COST_FRAMES = 120;

/* camera: the shell's one camera, read after it has drawn
 * (matrixWorldInverse, projectionMatrix, both three.js Matrix4). view:
 * the element the picture is drawn in, for its CSS size. */
export function createWarMarkers(camera, view) {
  let canvas = null;
  let ctx = null;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let on = false;
  let queued = false;

  /* This frame's input, held by reference until the paint. */
  let list = null;
  let at = null;
  let mission = null;
  const me = new Float64Array(3);

  /* Per attacker, in list order. */
  const kindOf = new Uint8Array(MAX);
  const threat = new Uint8Array(MAX);
  const dist = new Float32Array(MAX);
  /* 1 where this aircraft is within its fuze radius of the attacker. */
  const inRange = new Uint8Array(MAX);
  let fuzeR = null;
  const sx = new Float32Array(MAX);
  const sy = new Float32Array(MAX);
  const half = new Float32Array(MAX);
  const ang = new Float32Array(MAX);
  /* -1 on screen, else its sector. */
  const bin = new Int16Array(MAX);
  /* On screen: how many markers this one labels for (itself and those
   * within GROUP_PX of it that are farther), or 0 when a nearer one
   * labels it. */
  const group = new Uint16Array(MAX);
  let n = 0;
  let aim = -1;
  /* Per sector: members, nearest distance, top threat, one member's angle
   * and its kind (for a sector of one), and where its arrow went. */
  const binN = new Uint16Array(BINS);
  const binD = new Float32Array(BINS);
  const binT = new Uint8Array(BINS);
  const binA = new Float32Array(BINS);
  const binK = new Uint8Array(BINS);
  const binX = new Float32Array(BINS);
  const binY = new Float32Array(BINS);
  const binDrawA = new Float32Array(BINS);
  const binIn = new Uint8Array(BINS);

  /* Attacker id -> its target id, from the births; a Hunter has none. */
  const targetOf = new Map();
  /* The radar's centre and heading, for put(). */
  let rcx = 0;
  let rcy = 0;
  let rch = 1;
  let rsh = 0;
  let spotX = 0;
  let spotY = 0;

  let hunted = -1;
  let huntedD = 0;
  let huntedSince = -Infinity;

  const cost = new Float32Array(COST_FRAMES);
  let costAt = 0;
  let costN = 0;
  let updateMs = 0;

  /* Labels: the kinds' tags, and distances by 1 m to FINE_M, by 10 m to
   * 1 km and by 100 m past it, made once a language. */
  let lang = null;
  let tags = [];
  let distLabels = [];
  let rangeLabels = [];
  let counts = [];
  let hunt = '';
  let radarUp = '';
  let north = '';
  function labels() {
    const key = str('war.mark.dist_m');
    if (key === lang) {
      return;
    }
    lang = key;
    tags = KINDS.map((k) => str(`war.mark.${k}`));
    tags.push('');
    distLabels = [];
    rangeLabels = [];
    counts = [];
    hunt = str('war.mark.hunted');
    radarUp = str('war.mark.radar_up');
    north = str('war.mark.north');
  }
  function distLabel(d) {
    const i = d < FINE_M - 0.5 ? Math.round(d) : FINE_M + (d < 995 ? Math.round(d / 10) : 100 + Math.min(400, Math.round(d / 100)));
    let s = distLabels[i];
    if (s === undefined) {
      const j = i - FINE_M;
      s = j < 0 ? str('war.mark.dist_m', { n: i }) : j < 100 ? str('war.mark.dist_m', { n: j * 10 }) : str('war.mark.dist_km', { n: ((j - 100) / 10).toFixed(1) });
      distLabels[i] = s;
    }
    return s;
  }
  function rangeLabel(d) {
    const i = Math.max(0, Math.round(d));
    let s = rangeLabels[i];
    if (s === undefined) {
      s = str('war.mark.in_range', { n: i });
      rangeLabels[i] = s;
    }
    return s;
  }
  /* A group's label: its leader's tag and the count, cached by both. */
  const groupLabels = [];
  function groupLabel(i) {
    const key = kindOf[i] * 1000 + Math.min(999, group[i]);
    let s = groupLabels[key];
    if (s === undefined || lang !== groupLang) {
      if (lang !== groupLang) {
        groupLabels.length = 0;
        groupLang = lang;
      }
      s = `${tags[kindOf[i]]} ${countLabel(group[i])}`;
      groupLabels[key] = s;
    }
    return s;
  }
  let groupLang = null;
  function countLabel(c) {
    let s = counts[c];
    if (s === undefined) {
      s = `×${c}`;
      counts[c] = s;
    }
    return s;
  }

  function build() {
    canvas = document.createElement('canvas');
    canvas.className = 'war-markers';
    Object.assign(canvas.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', zIndex: '39', pointerEvents: 'none', display: 'none',
    });
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
  }

  function hide() {
    on = false;
    list = null;
    hunted = -1;
    n = 0;
    if (canvas) {
      canvas.style.display = 'none';
    }
  }

  function events(evs) {
    for (let i = 0; i < evs.length; i += 1) {
      const ev = evs[i];
      if (ev.type === 'born') {
        for (const a of ev.agents) {
          targetOf.set(a.id, a.target ?? null);
        }
      } else if (ev.type === 'dead') {
        for (const id of ev.ids) {
          targetOf.delete(id);
        }
      }
    }
  }

  /*
   * Once a frame. live: roomwar attackersAt(now), or null outside a live
   * war (and in a replay, and off the flight screen) to hide it all. now
   * the room ms it is for; evs roomwar's takeEvents() of this frame; m
   * the mission (roomwar mission()); x, y, z this aircraft, scene metres;
   * seat this pilot's (roomwar seat()), for a hunter's `hunts`. fuze:
   * { hull (midair.js hullFor), pose (the room's pose of it: px..qw,
   * motor), radius (the room view's fuze for the seat) }, or null when
   * there is none to judge by: the distances are then from x, y, z.
   * Returns true when a Hunter has newly picked this pilot, for the
   * radio's line.
   */
  function update(live, now, evs, m, x, y, z, seat = null, fuze = null) {
    const t0 = performance.now();
    if (evs && evs.length) {
      events(evs);
    }
    if (!live) {
      if (on) {
        hide();
      }
      return false;
    }
    if (!canvas) {
      build();
    }
    labels();
    on = true;
    list = live;
    at = now;
    mission = m;
    me[0] = x;
    me[1] = y;
    me[2] = z;
    n = Math.min(live.length, MAX);
    fuzeR = fuze ? fuze.radius : null;
    const near = fuze ? FINE_M + fuze.hull.hull.reach : 0;
    const was = hunted;
    hunted = -1;
    huntedD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = live[i];
      const dx = x - a.p[0];
      const dy = y - a.p[1];
      const dz = z - a.p[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const kind = a.kind === 'decoy' && d > DECOY_M ? 'strike' : a.kind;
      const k = KINDS.indexOf(kind);
      kindOf[i] = k < 0 ? UNKNOWN : k;
      threat[i] = THREAT[kind] ?? 0;
      dist[i] = d < near ? hullDistance(fuze.hull, fuze.pose, a.p[0], a.p[1], a.p[2]) : d;
      inRange[i] = fuze && dist[i] <= fuze.radius ? 1 : 0;
      if (threat[i] !== 2 || d < 1e-3) {
        continue;
      }
      if (a.hunts !== undefined) {
        if (a.hunts != null && a.hunts === seat && d < huntedD) {
          hunted = i;
          huntedD = d;
        }
        continue;
      }
      if (d > HUNT_RANGE_M) {
        continue;
      }
      /* The nose, -z of the scene frame's craft (src/render/frame.js),
       * turned by q, against the line to this aircraft. */
      const qx = a.q[0];
      const qy = a.q[1];
      const qz = a.q[2];
      const qw = a.q[3];
      const fx = -2 * (qx * qz + qw * qy);
      const fy = -2 * (qy * qz - qw * qx);
      const fz = -(1 - 2 * (qx * qx + qy * qy));
      if ((fx * dx + fy * dy + fz * dz) / d >= HUNTED_COS && d < huntedD) {
        hunted = i;
        huntedD = d;
      }
    }
    let fresh = false;
    if (hunted >= 0 && was < 0 && t0 - huntedSince > HUNTED_SAY_MS) {
      huntedSince = t0;
      fresh = true;
    }
    if (!queued) {
      queued = true;
      queueMicrotask(paintNow);
    }
    updateMs = performance.now() - t0;
    return fresh;
  }

  function paintNow() {
    queued = false;
    if (!on || !list) {
      return;
    }
    const t0 = performance.now();
    paint(t0);
    cost[costAt] = updateMs + performance.now() - t0;
    costAt = (costAt + 1) % COST_FRAMES;
    costN = Math.min(COST_FRAMES, costN + 1);
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

  /* Where every attacker is on the picture, or which way round it. */
  function project() {
    const e = camera.matrixWorldInverse.elements;
    const pe = camera.projectionMatrix.elements;
    const hw = cssW / 2;
    const hh = cssH / 2;
    let best = Infinity;
    aim = -1;
    binN.fill(0);
    binIn.fill(0);
    for (let i = 0; i < n; i += 1) {
      const p = list[i].p;
      const vx = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
      const vy = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
      const vz = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
      if (vz < -0.5) {
        const w = -vz;
        const x = hw + ((pe[0] * vx + pe[8] * vz) / w) * hw;
        const y = hh - ((pe[5] * vy + pe[9] * vz) / w) * hh;
        if (x >= IN_PX && x <= cssW - IN_PX && y >= IN_PX && y <= cssH - IN_PX) {
          sx[i] = x;
          sy[i] = y;
          half[i] = Math.max(BOX_MIN, Math.min(BOX_MAX, (BODY_M * pe[5] * hh) / w));
          bin[i] = -1;
          const c = (x - hw) * (x - hw) + (y - hh) * (y - hh);
          if (c < best) {
            best = c;
            aim = i;
          }
          continue;
        }
      }
      /* Its direction in the camera's plane is the way to turn, in front
       * or behind; straight behind has none, and is the bottom edge. */
      const a = vz > 0 && vx * vx + vy * vy < BEHIND_TAN * BEHIND_TAN * vz * vz ? -Math.PI / 2 : Math.atan2(vy, vx);
      ang[i] = a;
      const b = Math.floor(((a + Math.PI) / BIN_RAD) + 1e-6) % BINS;
      bin[i] = b;
      if (binN[b] === 0 || dist[i] < binD[b]) {
        binD[b] = dist[i];
        binA[b] = a;
        binK[b] = kindOf[i];
      }
      binT[b] = binN[b] === 0 ? threat[i] : Math.max(binT[b], threat[i]);
      binIn[b] |= inRange[i];
      binN[b] += 1;
    }
  }

  /* Every on screen marker's group: labelled by the nearest of those
   * within GROUP_PX, the lower index on a tie. */
  function groups() {
    for (let i = 0; i < n; i += 1) {
      group[i] = bin[i] < 0 ? 1 : 0;
    }
    for (let i = 0; i < n; i += 1) {
      if (bin[i] >= 0) {
        continue;
      }
      let lead = i;
      for (let j = 0; j < n; j += 1) {
        if (bin[j] < 0 && Math.abs(sx[j] - sx[i]) < GROUP_PX && Math.abs(sy[j] - sy[i]) < GROUP_PX
          && (dist[j] < dist[lead] || (dist[j] === dist[lead] && j < lead))) {
          lead = j;
        }
      }
      if (lead !== i) {
        group[i] = 0;
        group[lead] += 1;
      }
    }
  }

  function paint(nowMs) {
    resize();
    canvas.style.display = 'block';
    project();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0126);
    groups();
    /* Under everything: an edge arrow may cross the disc. */
    radar(nowMs);
    /* The least dangerous first, so a Hunter is never under a Scout. */
    for (let level = 0; level <= 2; level += 1) {
      for (let i = 0; i < n; i += 1) {
        if (threat[i] === level && bin[i] < 0) {
          marker(i, pulse);
        }
      }
    }
    for (let b = 0; b < BINS; b += 1) {
      if (binN[b] > 0) {
        arrow(b, pulse);
      }
    }
    if (hunted >= 0) {
      huntedWarning(pulse);
    }
  }

  /* Text with a dark rim, so it reads over snow, sky and water. */
  function label(text, x, y, colour) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  function marker(i, pulse) {
    const x = sx[i];
    const y = sy[i];
    const lead = i === aim;
    const hunter = threat[i] === 2;
    const s = half[i] + (hunter ? pulse * 4 : 0) + (lead ? 4 : 0);
    const c = s * 0.45;
    const colour = inRange[i] ? RED : COLOUR[threat[i]];
    ctx.globalAlpha = hunter ? 0.7 + 0.3 * pulse : 1;
    ctx.beginPath();
    for (let k = 0; k < 4; k += 1) {
      const ux = k & 1 ? 1 : -1;
      const uy = k & 2 ? 1 : -1;
      ctx.moveTo(x + ux * s, y + uy * (s - c));
      ctx.lineTo(x + ux * s, y + uy * s);
      ctx.lineTo(x + ux * (s - c), y + uy * s);
    }
    ctx.lineWidth = lead ? 6 : 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = lead ? 3.5 : 2.5;
    ctx.strokeStyle = colour;
    ctx.stroke();
    if (lead) {
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
    /* One of a group labelled by a nearer one: brackets only. */
    if (group[i] === 0 && !lead) {
      ctx.globalAlpha = 1;
      return;
    }
    /* The down arrow over it, pointing in. */
    const top = y - s - 6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - 9, top - 12);
    ctx.lineTo(x + 9, top - 12);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = lead ? FONT_LEAD : FONT_MARK;
    label(group[i] > 1 ? groupLabel(i) : tags[kindOf[i]], x, top - 16, colour);
    if (inRange[i]) {
      label(rangeLabel(dist[i]), x, y + s + (lead ? 18 : 16), RED);
      return;
    }
    label(distLabel(dist[i]), x, y + s + (lead ? 18 : 16), lead ? '#ffffff' : colour);
  }

  /* An arrow on the edge at the sector's angle (the one attacker's own in
   * a sector of one), pointing out, its distance inside it. */
  function arrow(b, pulse) {
    const one = binN[b] === 1;
    const a = one ? binA[b] : -Math.PI + (b + 0.5) * BIN_RAD;
    const ca = Math.cos(a);
    const sa = -Math.sin(a);
    const hw = cssW / 2 - EDGE_PX;
    const hh = cssH / 2 - EDGE_PX;
    const t = Math.min(Math.abs(ca) > 1e-6 ? hw / Math.abs(ca) : Infinity, Math.abs(sa) > 1e-6 ? hh / Math.abs(sa) : Infinity);
    const x = cssW / 2 + ca * t;
    const y = cssH / 2 + sa * t;
    binX[b] = x;
    binY[b] = y;
    binDrawA[b] = a;
    const colour = binIn[b] ? RED : COLOUR[binT[b]];
    const big = binT[b] === 2 ? 1.15 + 0.15 * pulse : 1;
    const L = 20 * big;
    const W = 13 * big;
    ctx.beginPath();
    ctx.moveTo(x + ca * L, y + sa * L);
    ctx.lineTo(x - sa * W - ca * 4, y + ca * W - sa * 4);
    ctx.lineTo(x - ca * 2, y - sa * 2);
    ctx.lineTo(x + sa * W - ca * 4, y - ca * W - sa * 4);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.globalAlpha = binT[b] === 2 ? 0.75 + 0.25 * pulse : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    /* The words inside the arrow, toward the middle. */
    const lx = x - ca * 34;
    const ly = y - sa * 26;
    ctx.font = FONT_MARK;
    label(one ? tags[binK[b]] : countLabel(binN[b]), lx, ly - 2, colour);
    label(binIn[b] ? rangeLabel(binD[b]) : distLabel(binD[b]), lx, ly + 12, colour);
  }

  function radar(nowMs) {
    const R = RADAR_PX;
    const cx = cssW - R - 18;
    const cy = RADAR_TOP_PX + R;
    /* Heading up: the camera's view, flattened. Scene y is up and -z is
     * north (src/share/war/missions/itaipu-1.js: the reservoir to the
     * north), so the view's bearing is atan2(fx, -fz). */
    const e = camera.matrixWorldInverse.elements;
    /* The view's forward in the world is minus the inverse's third row. */
    const fx = -e[2];
    const fz = -e[10];
    const hdg = Math.atan2(fx, -fz);
    rcx = cx;
    rcy = cy;
    rch = Math.cos(hdg);
    rsh = Math.sin(hdg);
    const k = R / RADAR_M;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = SCRIM;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = GREEN;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = DIM;
    for (let r = 0; r < RINGS_M.length; r += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, RINGS_M[r] * k, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.stroke();
    ctx.font = FONT_RING;
    ctx.fillStyle = DIM;
    ctx.fillText(distLabel(RINGS_M[0]), cx + 4 + RINGS_M[0] * k * 0.72, cy - RINGS_M[0] * k * 0.72);
    ctx.fillText(distLabel(RINGS_M[1]), cx + 4 + RINGS_M[1] * k * 0.72, cy - RINGS_M[1] * k * 0.72);
    /* North on the rim, turning as the view does. */
    const nx = cx - rsh * (R - 10);
    const ny = cy - rch * (R - 10);
    ctx.font = FONT_MARK;
    label(north, nx, ny + 4, GREEN);
    ctx.font = FONT_UP;
    label(radarUp, cx, cy - R - 6, GREEN);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, 2 * Math.PI);
    ctx.clip();
    if (mission && mission.targets) {
      drawTargets(nowMs);
    }
    ctx.restore();
    for (let level = 0; level <= 2; level += 1) {
      for (let i = 0; i < n; i += 1) {
        if (threat[i] !== level) {
          continue;
        }
        const inside = put(list[i].p[0], list[i].p[2], true);
        ctx.beginPath();
        ctx.arc(spotX, spotY, level === 2 ? 4 : 3.2, 0, 2 * Math.PI);
        ctx.fillStyle = COLOUR[level];
        if (inside) {
          ctx.fill();
        } else {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = COLOUR[level];
          ctx.stroke();
        }
      }
    }
    /* This aircraft, pointing up the view. */
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.closePath();
    ctx.fillStyle = GREEN;
    ctx.fill();
  }
  /* A world point onto the radar, into spotX, spotY: east of this
   * aircraft and south of it turned by the heading, clamped to the rim
   * when asked. True when it was inside. */
  function put(wx, wz, clamp) {
    const R = RADAR_PX;
    const k = R / RADAR_M;
    const ex = wx - me[0];
    const sz = wz - me[2];
    let rx = (ex * rch + sz * rsh) * k;
    let ry = (-ex * rsh + sz * rch) * k;
    const r = Math.sqrt(rx * rx + ry * ry);
    if (clamp && r > R - 3) {
      rx *= (R - 3) / r;
      ry *= (R - 3) / r;
    }
    spotX = rcx + rx;
    spotY = rcy + ry;
    return r <= R - 3;
  }

  /* The dam's intake line, the switchyard, and each target something is
   * going for, blinking. */
  function drawTargets(nowMs) {
    const t = mission.targets;
    const w = t['intake-0'];
    const east = t['intake-19'];
    if (w && east) {
      put(w.at[0], w.at[2], false);
      ctx.beginPath();
      ctx.moveTo(spotX, spotY);
      put(east.at[0], east.at[2], false);
      ctx.lineTo(spotX, spotY);
      ctx.lineWidth = 4;
      ctx.strokeStyle = GREEN;
      ctx.stroke();
    }
    if (t['yard-right']) {
      put(t['yard-right'].at[0], t['yard-right'].at[2], false);
      ctx.fillStyle = GREEN;
      ctx.fillRect(spotX - 3, spotY - 3, 6, 6);
    }
    if (Math.floor(nowMs / 300) % 2) {
      return;
    }
    /* A target two attackers go for is drawn twice, the same spot. */
    for (let i = 0; i < n; i += 1) {
      const id = targetOf.get(list[i].id);
      if (!id || !t[id]) {
        continue;
      }
      put(t[id].at[0], t[id].at[2], false);
      ctx.beginPath();
      ctx.arc(spotX, spotY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = RED;
      ctx.fill();
    }
  }

  /* A red frame round the picture and an arrow from the middle toward
   * the Hunter, with its distance. */
  function huntedWarning(pulse) {
    const i = hunted;
    ctx.globalAlpha = 0.35 + 0.55 * pulse;
    ctx.lineWidth = 14;
    ctx.strokeStyle = RED;
    ctx.strokeRect(7, 7, cssW - 14, cssH - 14);
    ctx.globalAlpha = 1;
    /* Toward it on the picture: its marker when in view, else its way
     * round. */
    const a = bin[i] < 0 ? Math.atan2(cssH / 2 - sy[i], sx[i] - cssW / 2) : ang[i];
    const ca = Math.cos(a);
    const sa = -Math.sin(a);
    const cx = cssW / 2;
    const cy = cssH * 0.62;
    const r = 34;
    ctx.beginPath();
    ctx.moveTo(cx + ca * (r + 26), cy + sa * (r + 26));
    ctx.lineTo(cx + ca * r - sa * 14, cy + sa * r + ca * 14);
    ctx.lineTo(cx + ca * r + sa * 14, cy + sa * r - ca * 14);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.font = FONT_HUNT;
    label(hunt, cx, cy + 6, RED);
    ctx.font = FONT_HUNT_D;
    label(distLabel(huntedD), cx, cy + 26, RED);
  }

  /* The nearest attacker this aircraft is within its fuze radius of, as
   * of the last update: its scene position (held by reference), or null. */
  function inRangeAt() {
    if (!on || !list || fuzeR == null) {
      return null;
    }
    let best = -1;
    for (let i = 0; i < n; i += 1) {
      if (inRange[i] && (best < 0 || dist[i] < dist[best])) {
        best = i;
      }
    }
    return best < 0 ? null : list[best].p;
  }

  /* What the last paint showed, for the checks. Allocates; not per frame. */
  function shown() {
    if (!on || !list) {
      return { on: false, at: null, marks: [], arrows: [], hunted: null, fuze: null, inRange: [], cost: costOf() };
    }
    const marks = [];
    const arrows = [];
    const arrowOf = new Map();
    for (let b = 0; b < BINS; b += 1) {
      if (binN[b] > 0) {
        const r = {
          angle: binDrawA[b], x: binX[b], y: binY[b], n: binN[b], ids: [], colour: binIn[b] ? RED : COLOUR[binT[b]], inRange: binIn[b] === 1,
        };
        arrowOf.set(b, r);
        arrows.push(r);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const a = list[i];
      if (bin[i] >= 0) {
        arrowOf.get(bin[i]).ids.push(a.id);
        continue;
      }
      marks.push({
        id: a.id, kind: a.kind, tag: tags[kindOf[i]] ?? '', p: a.p.slice(), x: sx[i], y: sy[i], aim: i === aim, colour: inRange[i] ? RED : COLOUR[threat[i]], dist: dist[i],
        inRange: inRange[i] === 1, label: inRange[i] ? rangeLabel(dist[i]) : distLabel(dist[i]),
      });
    }
    return {
      on: true,
      at,
      w: cssW,
      h: cssH,
      marks,
      arrows,
      hunted: hunted >= 0 ? { id: list[hunted].id, dist: huntedD } : null,
      fuze: fuzeR,
      inRange: list.slice(0, n).filter((_, i) => inRange[i]).map((a) => a.id),
      /* Every attacker under FINE_M, marked or arrowed, with its distance. */
      near: list.slice(0, n).map((a, i) => ({ id: a.id, dist: dist[i], inRange: inRange[i] === 1 })).filter((x) => x.dist < FINE_M),
      cost: costOf(),
    };
  }
  function costOf() {
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < costN; i += 1) {
      sum += cost[i];
      worst = Math.max(worst, cost[i]);
    }
    const sorted = Array.from(cost.subarray(0, costN)).sort((x, y) => x - y);
    return {
      frames: costN, meanMs: costN ? sum / costN : 0, p95Ms: costN ? sorted[Math.floor(costN * 0.95)] : 0, worstMs: worst,
    };
  }

  function clear() {
    hide();
    targetOf.clear();
    hunted = -1;
    huntedSince = -Infinity;
  }

  return {
    update, clear, shown, inRangeAt,
  };
}
