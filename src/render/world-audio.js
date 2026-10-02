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
export const ID_BASE = { war: 0, traffic: 1e6 };
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
   * it, `kind` a world-kinds.js name, `p` [x, y, z], `t` seconds of the
   * source's own clock (room or traffic time), for its velocity. */
  add(family, id, kind, p, t) {
    const k = KIND_INDEX[kind];
    if (k === undefined) {
      return;
    }
    const key = ID_BASE[family] + id;
    let v = this.last.get(key);
    if (!v) {
      v = { x: p[0], y: p[1], z: p[2], t, vx: 0, vy: 0, vz: 0, seen: 0 };
      this.last.set(key, v);
    } else if (t > v.t) {
      const dt = t - v.t;
      v.vx += VEL_SMOOTH * ((p[0] - v.x) / dt - v.vx);
      v.vy += VEL_SMOOTH * ((p[1] - v.y) / dt - v.vy);
      v.vz += VEL_SMOOTH * ((p[2] - v.z) / dt - v.vz);
      v.x = p[0];
      v.y = p[1];
      v.z = p[2];
      v.t = t;
    }
    v.seen = this.frameNo;
    if ((this.count + 1) * SOURCE_STRIDE > this.src.length) {
      const grown = new Float64Array(this.src.length * 2);
      grown.set(this.src);
      this.src = grown;
    }
    const o = this.count * SOURCE_STRIDE;
    const s = this.src;
    s[o] = key;
    s[o + 1] = k;
    s[o + 2] = p[0];
    s[o + 3] = p[1];
    s[o + 4] = p[2];
    s[o + 5] = v.vx;
    s[o + 6] = v.vy;
    s[o + 7] = v.vz;
    this.count += 1;
  }

  /* The war's attackers this frame, roomWar.attackersAt(now)'s list, at
   * room ms `now`. */
  war(live, now) {
    for (const a of live) {
      this.add('war', a.id, a.kind, a.p, now / 1000);
    }
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
   * under it from groundY, and every source added since the last post.
   */
  post(camera, groundY) {
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
