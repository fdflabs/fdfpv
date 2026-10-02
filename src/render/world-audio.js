/*
 * world-audio.js: the main thread's side of the world's sound
 * (src/render/world-worklet.js, docs/AUDIO.md section 12). Every frame the
 * shell hands it the listener (the camera) and the sources it knows of,
 * and it posts one frame to the worklet: positions, velocities, kinds.
 * Explosions go the same way, each with its echoes off the walls the map
 * declares.
 *
 * It owns one AudioWorkletNode, made once the MotorAudio's context is up,
 * and puts it on the mix with MotorAudio.attachWorld(node), which connects
 * its three outputs to the other aircraft and vehicles bus, the ambience
 * bus and the effects bus. Until a MotorAudio has that method, the world
 * stays silent and says so once on the console.
 *
 * Positions are scene world metres, y up, the frame the scene is drawn in
 * (src/render/frame.js did the one conversion); the worklet uses them as
 * they come.
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

import { KIND_INDEX, SOURCE_STRIDE } from './world-kinds.js';

/* Ids on the wire: each family of sources in its own range, so a war's
 * attacker 7 and a valley's car 7 are two tracks. */
export const ID_BASE = { war: 0, traffic: 1e6, ambience: 2e6 };
/* A concrete wall's reflection, pressure ratio (the dam's face; an earth
 * dam's slope scatters and is not declared). */
const WALL_GAIN = 0.6;
/* At most this many echoes an explosion: the strongest. */
const ECHOES_MAX = 2;
/* A source's velocity is the difference of its last two positions,
 * smoothed this much a frame: a hunter's pose comes off the room's 20 Hz
 * samples and its difference steps. */
const VEL_SMOOTH = 0.5;

/*
 * The walls an explosion echoes off, from the Itaipu dam's dam.json: every
 * part's axis (world x, z) as a vertical face from its base to its crest,
 * but the embankments, whose slopes of earth and rock scatter rather than
 * reflect, and the whole dam's outline, which is the parts again. Returns
 * [{ ax, az, bx, bz, y0, y1, gain }].
 */
export function damWalls(dam) {
  const SCATTER = new Set(['earth', 'rockfill', 'whole']);
  const out = [];
  for (const p of dam) {
    if (SCATTER.has(p.kind) || !Array.isArray(p.axis) || !Number.isFinite(p.baseY) || !(p.crestY > p.baseY)) {
      continue;
    }
    for (let i = 1; i < p.axis.length; i += 1) {
      const [ax, az] = p.axis[i - 1];
      const [bx, bz] = p.axis[i];
      if (Math.hypot(bx - ax, bz - az) < 5) {
        continue;
      }
      out.push({ ax, az, bx, bz, y0: p.baseY, y1: p.crestY, gain: WALL_GAIN });
    }
  }
  return out;
}

/*
 * The image of p in each wall that both p and the listener face, where the
 * path from the listener to the image crosses the wall within its length
 * and height: [[x, y, z, gain], ...], the ECHOES_MAX nearest.
 */
export function echoImages(p, L, walls) {
  const found = [];
  for (const w of walls) {
    const ux = w.bx - w.ax;
    const uz = w.bz - w.az;
    const len = Math.hypot(ux, uz);
    const nx = -uz / len;
    const nz = ux / len;
    const sp = (p[0] - w.ax) * nx + (p[2] - w.az) * nz;
    const sl = (L[0] - w.ax) * nx + (L[2] - w.az) * nz;
    if (sp * sl <= 0) {
      continue;
    }
    const ix = p[0] - 2 * sp * nx;
    const iz = p[2] - 2 * sp * nz;
    /* Where the listener's line to the image meets the wall. */
    const k = sl / (sl - ((ix - w.ax) * nx + (iz - w.az) * nz));
    const cx = L[0] + (ix - L[0]) * k;
    const cz = L[2] + (iz - L[2]) * k;
    const cy = L[1] + (p[1] - L[1]) * k;
    const along = ((cx - w.ax) * ux + (cz - w.az) * uz) / (len * len);
    if (along < 0 || along > 1 || cy < w.y0 || cy > w.y1) {
      continue;
    }
    found.push([ix, p[1], iz, w.gain, Math.hypot(ix - L[0], p[1] - L[1], iz - L[2])]);
  }
  found.sort((a, b) => a[4] - b[4]);
  return found.slice(0, ECHOES_MAX).map((f) => f.slice(0, 4));
}

/*
 * THE AMBIENCE'S PLACES. Emitters (birds, crickets, frogs, cicadas) sit
 * on a grid of AMB_CELL metre cells round the listener, AMB_REACH cells
 * each way, at most one a cell, where a seeded hash of the cell says, so a
 * tree that sings sings every time the pilot comes back to it. Water and
 * power lines are heard from their nearest point within AMB_FAR metres.
 */
const AMB_CELL = 60;
const AMB_REACH = 2;
const AMB_FAR = 1500;
/* How many of a grid's cells sing, by the time of day, and with what. The
 * times are src/main.js worldTime's: 'day' and 'night' today, and the
 * presets #344 adds (morning, noon, golden) when they come; an unknown
 * one is day. Birds sing most at dawn and least at noon (the dawn
 * chorus); crickets and frogs at night; cicadas in the subtropical heat
 * of the day only (Itaipu, `subtropical` below). */
const SINGERS = {
  morning: { birds: 0.6, cicada: 0.05 },
  day: { birds: 0.3, cicada: 0.3 },
  noon: { birds: 0.2, cicada: 0.45 },
  golden: { birds: 0.45, cicada: 0.15 },
  night: { crickets: 0.55, frogs: 0.6 },
};
/* Frogs only this near a shore, metres. */
const FROG_SHORE_M = 90;

/* A cell's seeded uniform in [0, 1), the k'th of its draws. */
function cellRand(i, j, k) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k + 1, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* The nearest point to (x, z) on a polyline of {x, z} (and y), closed or
 * not, into out [x, z, distance, y]. */
function nearestOn(pts, closed, x, z, out) {
  out[2] = Infinity;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k += 1) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    const ux = b.x - a.x;
    const uz = b.z - a.z;
    const l2 = ux * ux + uz * uz;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ux + (z - a.z) * uz) / l2)) : 0;
    const px = a.x + ux * u;
    const pz = a.z + uz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < out[2]) {
      out[0] = px;
      out[1] = pz;
      out[2] = d;
      out[3] = a.y === undefined ? 0 : a.y + (b.y - a.y) * u;
    }
  }
  return out;
}

/* Whether (x, z) is inside a polygon of {x, z}. */
function inside(pts, x, z) {
  let c = false;
  for (let k = 0, j = pts.length - 1; k < pts.length; j = k, k += 1) {
    const a = pts[k];
    const b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      c = !c;
    }
  }
  return c;
}

export class WorldAudio {
  constructor() {
    this.node = null;
    this.ctx = null;
    this.ready = null;
    this.warned = false;
    /* This frame's sources, flat, SOURCE_STRIDE each, and how many. */
    this.src = new Float64Array(64 * SOURCE_STRIDE);
    this.count = 0;
    /* Each source's last position and its time (s), for its velocity. */
    this.last = new Map();
    this.walls = [];
    this.booms = 0;
    this.lis = new Float64Array(10);
    this.seed = 1;
    this.frameNo = 0;
    this.trafficT = 0;
    /* The ambience's scratch: a nearest point, and the singers' grid as
     * last built (singers). */
    this.near = new Float64Array(4);
    this.cells = {};
    this.trafficSink = (id, kind, x, y, z) => this.add('traffic', id, kind, x, y, z, this.trafficT);
    /* The worklet's own count, asked for once a second, for the checks:
     * { voiced, bedded, tracks }. */
    this.stats = null;
  }

  /*
   * Make the node on `audio`'s context and hand it to the mix. Idempotent;
   * call every frame, it does nothing until the context exists.
   */
  attach(audio) {
    if (this.ready || !audio.ctx) {
      return;
    }
    if (typeof audio.attachWorld !== 'function') {
      if (!this.warned) {
        this.warned = true;
        console.warn('audio: the world is silent, MotorAudio has no attachWorld');
      }
      return;
    }
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.ready = ctx.audioWorklet.addModule(new URL('./world-worklet.js', import.meta.url)).then(() => {
      const node = new AudioWorkletNode(ctx, 'fdfpv-world', {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
      });
      audio.attachWorld(node);
      node.port.onmessage = (e) => {
        if (e.data && e.data.stats) {
          this.stats = e.data.stats;
        }
      };
      this.node = node;
    });
    this.ready.catch((e) => console.error('audio: the world\'s worklet failed to load', e));
  }

  /* The walls this map's explosions echo off (damWalls). */
  setWalls(walls) {
    this.walls = walls || [];
  }

  /* One source this frame: `family` an ID_BASE key, `id` its number in
   * it, `kind` a world-kinds.js name, at x, y, z, and `t` seconds of the
   * source's own clock (room or traffic time), for its velocity. A clock
   * that went back (a replay rewound) or jumped a second starts the
   * source afresh rather than drawing a velocity across the jump. */
  add(family, id, kind, x, y, z, t) {
    const k = KIND_INDEX[kind];
    if (k === undefined) {
      throw new Error(`world audio: no kind ${kind}`);
    }
    const key = ID_BASE[family] + id;
    let v = this.last.get(key);
    if (!v || t < v.t || t - v.t > 1) {
      v = { x, y, z, t, vx: 0, vy: 0, vz: 0, seen: 0 };
      this.last.set(key, v);
    } else if (t > v.t) {
      const dt = t - v.t;
      v.vx += VEL_SMOOTH * ((x - v.x) / dt - v.vx);
      v.vy += VEL_SMOOTH * ((y - v.y) / dt - v.vy);
      v.vz += VEL_SMOOTH * ((z - v.z) / dt - v.vz);
      v.x = x;
      v.y = y;
      v.z = z;
      v.t = t;
    }
    v.seen = this.frameNo;
    this.write(key, k, x, y, z, v.vx, v.vy, v.vz);
  }

  /* One source into this frame's list. */
  write(key, k, x, y, z, vx, vy, vz) {
    if ((this.count + 1) * SOURCE_STRIDE > this.src.length) {
      const grown = new Float64Array(this.src.length * 2);
      grown.set(this.src);
      this.src = grown;
    }
    const o = this.count * SOURCE_STRIDE;
    const s = this.src;
    s[o] = key;
    s[o + 1] = k;
    s[o + 2] = x;
    s[o + 3] = y;
    s[o + 4] = z;
    s[o + 5] = vx;
    s[o + 6] = vy;
    s[o + 7] = vz;
    this.count += 1;
  }

  /* A source that does not move this frame (the ambience's beds and
   * singers, the nearest point of a shore): no velocity to draw, so no
   * Doppler from a nearest point sliding along a shore. */
  still(id, kind, x, y, z) {
    const k = KIND_INDEX[kind];
    if (k === undefined) {
      throw new Error(`world audio: no kind ${kind}`);
    }
    this.write(ID_BASE.ambience + id, k, x, y, z, 0, 0, 0);
  }

  /*
   * The ambience round the listener this frame (docs/AUDIO.md section 12):
   * the map's own beds (view.audioBeds: a spillway's plunge pools, a
   * town), its water from the nearest point (view.water: a lake's shore
   * lapping, a river or a stream running, under the listener when it is
   * over the river), its nearest power line (view.audioLines, chords
   * [ax, ay, az, bx, by, bz, ...]), and the singers on the grid round the
   * listener by `time`.
   */
  ambience(view, time) {
    const L = this.lis;
    let id = 0;
    for (const b of view.audioBeds || []) {
      this.still(id, b.kind, b.x, b.y, b.z);
      id += 1;
    }
    const o = this.near;
    (view.water || []).forEach((w, k) => {
      if (w.kind === 'lake') {
        nearestOn(w.outline, true, L[0], L[2], o);
        if (o[2] > AMB_FAR) {
          return;
        }
        const river = w.name === 'river';
        if (river && inside(w.outline, L[0], L[2])) {
          this.still(100 + k, 'river', L[0], w.surfaceY, L[2]);
        } else {
          this.still(100 + k, river ? 'river' : 'lapping', o[0], w.surfaceY, o[1]);
        }
      } else if (w.kind === 'channel') {
        nearestOn(w.line, false, L[0], L[2], o);
        if (o[2] <= AMB_FAR) {
          this.still(100 + k, 'river', o[0], o[3], o[1]);
        }
      }
    });
    const lines = view.audioLines;
    if (lines && lines.length) {
      let best = Infinity;
      let bx = 0;
      let by = 0;
      let bz = 0;
      for (const c of lines) {
        const ux = c[3] - c[0];
        const uz = c[5] - c[2];
        const l2 = ux * ux + uz * uz;
        const u = l2 > 0 ? Math.max(0, Math.min(1, ((L[0] - c[0]) * ux + (L[2] - c[2]) * uz) / l2)) : 0;
        const px = c[0] + ux * u;
        const pz = c[2] + uz * u;
        const d = (L[0] - px) ** 2 + (L[2] - pz) ** 2;
        if (d < best) {
          best = d;
          bx = px;
          by = c[1] + (c[4] - c[1]) * u;
          bz = pz;
        }
      }
      if (best < (AMB_FAR / 3) ** 2) {
        this.still(200, 'powerline', bx, by, bz);
      }
    }
    for (const s of this.singers(view, time)) {
      this.still(s.id, s.kind, s.x, s.y, s.z);
    }
  }

  /* The singers in the grid round the listener, rebuilt when the listener
   * crosses into another cell, the time changes or the map does. */
  singers(view, time) {
    const L = this.lis;
    const ci = Math.floor(L[0] / AMB_CELL);
    const cj = Math.floor(L[2] / AMB_CELL);
    const c = this.cells;
    if (c.i === ci && c.j === cj && c.time === time && c.view === view) {
      return c.list;
    }
    const odds = SINGERS[time] || SINGERS.day;
    const lakes = (view.water || []).filter((w) => w.kind === 'lake');
    const subtropical = view.id === 'itaipu';
    const list = [];
    for (let di = -AMB_REACH; di <= AMB_REACH; di += 1) {
      for (let dj = -AMB_REACH; dj <= AMB_REACH; dj += 1) {
        const i = ci + di;
        const j = cj + dj;
        const x = (i + cellRand(i, j, 1)) * AMB_CELL;
        const z = (j + cellRand(i, j, 2)) * AMB_CELL;
        if (lakes.some((w) => inside(w.outline, x, z))) {
          continue;
        }
        let roll = cellRand(i, j, 0);
        let kind = null;
        for (const [k, p] of Object.entries(odds)) {
          if (k === 'cicada' && !subtropical) {
            continue;
          }
          if (k === 'frogs' && !lakes.some((w) => nearestOn(w.outline, true, x, z, this.near)[2] < FROG_SHORE_M)) {
            continue;
          }
          if (roll < p) {
            kind = k;
            break;
          }
          roll -= p;
        }
        if (!kind) {
          continue;
        }
        const ground = view.height ? view.height(x, z, Infinity) : 0;
        const up = kind === 'birds' || kind === 'cicada' ? 4 : 0.3;
        /* Unique for 512 cells each way, 30 km: a map is smaller. */
        list.push({ id: 1000 + (((i % 512) + 512) % 512) * 512 + (((j % 512) + 512) % 512), kind, x, y: ground + up, z });
      }
    }
    Object.assign(c, { i: ci, j: cj, time, view, list });
    return list;
  }

  /* The war's attackers this frame, roomWar.attackersAt(now)'s list, at
   * room ms `now`. */
  war(live, now) {
    for (const a of live) {
      this.add('war', a.id, a.kind, a.p[0], a.p[1], a.p[2], now / 1000);
    }
  }

  /* The valley's traffic at traffic ms `ms`: the sink a map's
   * audioSources(add) calls, add(id, kind, x, y, z), one per source. Made
   * once, so a frame allocates nothing for it. */
  traffic(ms) {
    this.trafficT = ms / 1000;
    return this.trafficSink;
  }

  /*
   * An explosion at p (null for the pilot's own warhead, on board),
   * `level` 0..1 as the shell rates it (main.js warBoomAt). Heard after
   * its distance's delay, with its echoes. False while the world has no
   * node, for the shell to ring MotorAudio.boom instead.
   */
  boom(p, level) {
    if (!this.node) {
      return false;
    }
    this.booms += 1;
    const L = this.lis;
    const at = p || [L[0], L[1], L[2]];
    this.node.port.postMessage({
      boom: {
        t: this.ctx.currentTime, p: at, level, seed: this.seed++,
        dist: p ? undefined : 0,
        images: p ? echoImages(at, L, this.walls) : [],
      },
    });
    return true;
  }

  /*
   * Post this frame: the listener from `camera` (a THREE camera: its
   * position, forward -z and right +x through its quaternion), the ground
   * under it from groundY, every source added since the last post, and
   * the ambience of `view` (the map) at `time` (src/main.js worldTime)
   * round it.
   */
  post(camera, groundY, view, time) {
    this.frameNo += 1;
    const L = this.lis;
    const p = camera.position;
    const q = camera.quaternion;
    /* -z and +x rotated by q, written out: v' = v + 2w (q x v) + 2 q x (q x v). */
    const rot = (vx, vy, vz, out, o) => {
      const tx = 2 * (q.y * vz - q.z * vy);
      const ty = 2 * (q.z * vx - q.x * vz);
      const tz = 2 * (q.x * vy - q.y * vx);
      out[o] = vx + q.w * tx + (q.y * tz - q.z * ty);
      out[o + 1] = vy + q.w * ty + (q.z * tx - q.x * tz);
      out[o + 2] = vz + q.w * tz + (q.x * ty - q.y * tx);
    };
    L[0] = p.x;
    L[1] = p.y;
    L[2] = p.z;
    rot(0, 0, -1, L, 3);
    rot(1, 0, 0, L, 6);
    L[9] = Number.isFinite(groundY) ? groundY : p.y - 1.7;
    if (view) {
      this.ambience(view, time);
    }
    if (this.node) {
      this.node.port.postMessage({
        frame: { t: this.ctx.currentTime, lis: Array.from(L), src: this.src.slice(0, this.count * SOURCE_STRIDE) },
      });
    }
    this.count = 0;
    /* Forget sources not seen for a second of frames. */
    if (this.frameNo % 60 === 0) {
      if (this.node) {
        this.node.port.postMessage({ stats: true });
      }
      for (const [k, v] of this.last) {
        if (this.frameNo - v.seen > 60) {
          this.last.delete(k);
        }
      }
    }
  }
}
