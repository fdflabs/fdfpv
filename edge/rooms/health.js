/*
 * health.js: what the rooms server costs the VM, and the valve that stops
 * new public rooms before the rooms already flying degrade
 * (docs/MULTIPLAYER-PLAN.md section 12, Phase 6).
 *
 * The VM (deploy/vm/README.md) is one core, and a room ticks every 33 ms
 * on that core's one event loop, next to Caddy's TLS. What degrades first
 * when the core is short is the loop: ticks start late, batches bunch up,
 * and every pilot in every room sees peers stutter together. So the valve
 * watches the loop's delay and this process's share of the core, and
 * while either stays high, front.js refuses new public rooms (quick joins
 * into a room with a seat still go ahead): a pilot is told the servers
 * are full now rather than everyone flying worse.
 *
 * Counters, per room and for the server: pilots, rooms, messages and
 * bytes a second each way, the process's CPU and the host's, the loop's
 * delay, memory, and the day's totals (UTC): the cost of the day in
 * egress, messages, pilot hours and room hours. front.js serves them at
 * GET /v2/admin/health with the admin secret, and never to anyone else.
 *
 * Valve is the rule alone, fed one sample a second, for rooms:selftest.
 * Health is Node's wiring around it (edge/rooms/node.js): Cloudflare has
 * none of this, and there front.js finds no env.HEALTH and never refuses.
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

import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const SAMPLE_MS = 1000;
/* The loop delay histogram's own period, taken off what it reports. */
const LAG_RESOLUTION_MS = 10;
/* Samples kept: a minute. */
const KEEP = 60;

/*
 * The valve. Closes when, over the last BUSY_S seconds, this process used
 * BUSY_CPU of the core or more on average, or the loop's p99 delay
 * averaged BUSY_LAG_MS or more; opens again once CALM_S seconds in a row
 * were under CALM_CPU and CALM_LAG_MS. A mean, not the worst second, so a
 * garbage collection does not close it. From rooms:load (the numbers are
 * in docs/MULTIPLAYER-PLAN.md section 12, as built): near peers started
 * to arrive late (under 29 Hz, a p99 gap past two ticks) when a room's
 * loop p99 averaged between 15 and 29 ms; and Caddy's TLS costs the core
 * about 0.6 of what this process does, so BUSY_CPU, 0.5, is the core
 * about 80% full.
 */
export const BUSY_S = 10;
export const BUSY_CPU = 0.5;
export const BUSY_LAG_MS = 20;
export const CALM_S = 30;
export const CALM_CPU = 0.35;
export const CALM_LAG_MS = 10;
/* Past this resident size the valve closes too: the unit's MemoryMax is
 * 256 MB (deploy/vm/fdfpv-rooms.service). */
export const BUSY_RSS = 200 * 1024 * 1024;

export class Valve {
  constructor() {
    this.samples = []; /* { cpu, lag, rss }, newest last */
    this.busy = false;
    this.since = null; /* ms the valve last changed */
    this.closings = 0;
  }

  /* One second's sample: cpu a fraction of one core, lag the p99 loop
   * delay in ms, rss bytes. Returns whether the valve is closed. */
  feed(sample, now) {
    this.samples.push(sample);
    if (this.samples.length > KEEP) {
      this.samples.shift();
    }
    const last = (n) => this.samples.slice(-n);
    const mean = (list, k) => list.reduce((a, s) => a + s[k], 0) / list.length;
    if (!this.busy) {
      const w = last(BUSY_S);
      const high = w.length >= BUSY_S && (mean(w, 'cpu') >= BUSY_CPU || mean(w, 'lag') >= BUSY_LAG_MS);
      if (high || sample.rss >= BUSY_RSS) {
        this.busy = true;
        this.since = now;
        this.closings += 1;
      }
    } else {
      const w = last(CALM_S);
      const calm = w.length >= CALM_S && w.every((s) => s.cpu < CALM_CPU && s.lag < CALM_LAG_MS && s.rss < BUSY_RSS);
      if (calm) {
        this.busy = false;
        this.since = now;
      }
    }
    return this.busy;
  }
}

/* The UTC day of `ms`, 'YYYY-MM-DD'. */
function dayOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function round(x, places = 1) {
  const k = 10 ** places;
  return Math.round(x * k) / k;
}

/* A room's counters, cumulative; node.js adds to them. */
export function roomCounters() {
  return { inMsgs: 0, inBytes: 0, outMsgs: 0, outBytes: 0 };
}

/*
 * rooms() is the server's rooms: [{ counters, pilots, meta, activity }],
 * meta null for a room object with nothing loaded. Owns its timer and the
 * loop delay histogram; stop() ends both.
 */
export class Health {
  constructor(rooms, { now = () => Date.now() } = {}) {
    this.rooms = rooms;
    this.now = now;
    this.valve = new Valve();
    this.started = now();
    this.refused = 0;
    this.history = []; /* one entry a second, newest last */
    this.lag = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
    this.lag.enable();
    this.cpuAt = process.cpuUsage();
    this.hostAt = hostTimes();
    this.wallAt = now();
    this.prev = new Map(); /* room -> counters a second ago */
    this.day = this.freshDay(this.started);
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.timer.unref();
  }

  freshDay(ms) {
    return { day: dayOf(ms), inMsgs: 0, inBytes: 0, outMsgs: 0, outBytes: 0, pilotSeconds: 0, roomSeconds: 0, peakPilots: 0, refused: 0 };
  }

  stop() {
    clearInterval(this.timer);
    this.lag.disable();
  }

  /* Whether new public rooms are refused now. */
  busy() {
    return this.valve.busy;
  }

  /* A public room refused for it, counted. */
  refuse() {
    this.refused += 1;
    this.day.refused += 1;
  }

  sample() {
    const now = this.now();
    const wallUs = Math.max(1, (now - this.wallAt) * 1000);
    this.wallAt = now;
    const cpu = process.cpuUsage(this.cpuAt);
    this.cpuAt = process.cpuUsage();
    const host = hostTimes();
    const hostBusy = host.total > this.hostAt.total ? 1 - (host.idle - this.hostAt.idle) / (host.total - this.hostAt.total) : 0;
    this.hostAt = host;
    const lagOf = (p) => Math.max(0, this.lag.percentile(p) / 1e6 - LAG_RESOLUTION_MS);
    const lag = { p50: lagOf(50), p99: lagOf(99), max: Math.max(0, this.lag.max / 1e6 - LAG_RESOLUTION_MS) };
    this.lag.reset();
    const mem = process.memoryUsage();
    if (dayOf(now) !== this.day.day) {
      this.day = this.freshDay(now);
    }
    const rooms = [];
    const sum = roomCounters();
    const seen = new Map();
    for (const room of this.rooms()) {
      const was = this.prev.get(room.counters) || roomCounters();
      const d = {};
      for (const k of Object.keys(sum)) {
        d[k] = room.counters[k] - was[k];
        sum[k] += d[k];
      }
      seen.set(room.counters, { ...room.counters });
      rooms.push({ ...room, rate: d });
    }
    this.prev = seen;
    const pilots = rooms.reduce((a, r) => a + r.pilots, 0);
    const awake = rooms.filter((r) => r.pilots > 0).length;
    const secs = wallUs / 1e6;
    for (const k of Object.keys(sum)) {
      this.day[k] += sum[k];
    }
    this.day.pilotSeconds += pilots * secs;
    this.day.roomSeconds += awake * secs;
    this.day.peakPilots = Math.max(this.day.peakPilots, pilots);
    const entry = {
      at: now,
      cpu: (cpu.user + cpu.system) / wallUs,
      hostCpu: hostBusy,
      lag,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      pilots,
      awake,
      held: rooms.length,
      perS: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / secs])),
      rooms,
    };
    this.history.push(entry);
    if (this.history.length > KEEP) {
      this.history.shift();
    }
    this.valve.feed({ cpu: entry.cpu, lag: lag.p99, rss: mem.rss }, now);
    return entry;
  }

  /* The admin report: the last second, the last 10 and 60 seconds'
   * means, every room with anyone in it, and the day so far. A private
   * room's code is a key to it, so private rooms are listed without one. */
  report() {
    const h = this.history;
    const last = h[h.length - 1];
    const window = (n) => {
      const w = h.slice(-n);
      if (!w.length) {
        return null;
      }
      const mean = (f) => w.reduce((a, e) => a + f(e), 0) / w.length;
      return {
        seconds: w.length,
        cpu: round(mean((e) => e.cpu), 3),
        hostCpu: round(mean((e) => e.hostCpu), 3),
        lagP50Ms: round(mean((e) => e.lag.p50)),
        lagP99Ms: round(Math.max(...w.map((e) => e.lag.p99))),
        lagMaxMs: round(Math.max(...w.map((e) => e.lag.max))),
        pilots: round(mean((e) => e.pilots)),
        inMsgsPerS: round(mean((e) => e.perS.inMsgs)),
        inBytesPerS: Math.round(mean((e) => e.perS.inBytes)),
        outMsgsPerS: round(mean((e) => e.perS.outMsgs)),
        outBytesPerS: Math.round(mean((e) => e.perS.outBytes)),
      };
    };
    const mem = process.memoryUsage();
    return {
      at: new Date(this.now()).toISOString(),
      uptimeS: Math.round((this.now() - this.started) / 1000),
      node: process.version,
      cores: os.cpus().length,
      busy: this.valve.busy,
      busySince: this.valve.since ? new Date(this.valve.since).toISOString() : null,
      closings: this.valve.closings,
      refused: this.refused,
      pilots: last ? last.pilots : 0,
      rooms: last ? last.awake : 0,
      held: last ? last.held : 0,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
      now: window(1),
      s10: window(10),
      s60: window(60),
      day: { ...this.day, pilotHours: round(this.day.pilotSeconds / 3600, 3), roomHours: round(this.day.roomSeconds / 3600, 3) },
      perRoom: last ? last.rooms.filter((r) => r.pilots > 0).map((r) => ({
        room: r.meta && r.meta.public ? r.meta.code : 'private',
        name: r.meta && r.meta.public ? r.meta.name ?? null : null,
        map: r.meta ? r.meta.map : null,
        pilots: r.pilots,
        game: r.activity ? r.activity.game : null,
        inMsgsPerS: r.rate.inMsgs,
        inBytesPerS: r.rate.inBytes,
        outMsgsPerS: r.rate.outMsgs,
        outBytesPerS: r.rate.outBytes,
      })) : [],
    };
  }
}

/* The host's CPU times summed over its cores, ms. */
function hostTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}
