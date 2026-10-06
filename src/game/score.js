/*
 * score.js: the freestyle scorer. It turns landed tricks into points, chains
 * them into combos that bank on a timer, and keeps a two minute run clock.
 *
 * The per trick arithmetic (execution, repeats, back to back, obstacle
 * repeats, streak) is the workbook's and lives in tricks.js. The combo is not
 * in the workbook: it exists so that flying tricks close together pays more
 * than flying the same tricks with pauses between them, and a crash costs the
 * open combo, which gives the pilot something to lose. The multiplier is the
 * count of scoring tricks in the combo, capped, and a combo banks itself at
 * the cap so one long chain cannot run away with the run.
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
  EXECUTION, STREAK_DIVISOR, backToBackFactor, obstacleBonusMultiplier, repeatObstacleFactor,
  repeatTrickFactor, trickPoints,
} from './tricks.js';

export const COMBO_WINDOW_MS = 3000;
export const COMBO_MULT_MAX = 12;
export const RUN_MS = 120000;
export const RUN_READY = 'ready';
export const RUN_FLYING = 'flying';
export const RUN_OVER = 'over';

export class FreestyleScore {
  #windowMs;
  #multMax;
  #runMs;
  #combos;

  #start;
  #end;
  #assisted;
  #banked;
  #netSum;
  #bumps;
  #bestNet;
  #bestCombo;
  #bestChain;

  /* What the next landing is priced against. A crash clears `#since`. */
  #landedByName;
  #since;

  /* null, or { names, points, scoring, deadline }. */
  #combo;
  #queue;

  constructor(opts = {}) {
    this.#windowMs = opts.comboWindowMs ?? COMBO_WINDOW_MS;
    this.#multMax = opts.multMax ?? COMBO_MULT_MAX;
    this.#runMs = opts.runMs ?? RUN_MS;
    this.#combos = opts.comboEnabled !== false;
    this.timed = opts.timed !== false;
    this.reset();
  }

  reset() {
    this.nowMs = 0;
    this.state = RUN_READY;
    this.crashes = 0;
    this.streak = 1;
    this.bonus = 0;
    this.obstacleSwitches = 0;
    this.tricks = [];
    this.#start = 0;
    this.#end = 0;
    this.#assisted = false;
    this.#banked = 0;
    this.#netSum = 0;
    this.#bumps = 0;
    this.#bestNet = 0;
    this.#bestCombo = 0;
    this.#bestChain = 0;
    this.#landedByName = new Map();
    this.#since = null;
    this.#combo = null;
    this.#queue = [];
  }

  over() {
    return this.state === RUN_OVER;
  }

  remainMs() {
    if (!this.timed) return Infinity;
    if (this.state === RUN_READY) return this.#runMs;
    if (this.state === RUN_OVER) return 0;
    return Math.max(0, this.#runMs - (this.nowMs - this.#start));
  }

  land(trick) {
    if (this.state === RUN_OVER) return null;
    const name = trick.name;
    const execution = trick.execution in EXECUTION ? trick.execution : 'CLEAN';
    // Priced first so that an unknown name throws before anything has moved.
    const base = trickPoints(name);
    const grade = EXECUTION[execution];
    const atMs = trick.endMs ?? this.nowMs;
    if (trick.assisted) this.#assisted = true;
    if (this.state === RUN_READY) {
      this.state = RUN_FLYING;
      this.#start = atMs;
    }

    // `#since` is the chain since the last crash or reset; null means a fresh one.
    const prev = this.#since;
    const sameName = prev !== null && prev.name === name;
    const run = sameName ? prev.run + 1 : 1;

    const group = trick.obstacle ?? null;
    let obstacle = 1;
    let group0 = prev ? prev.group : null;
    let onGroup = prev ? prev.onGroup : 0;
    if (group !== null) {
      const stayed = group0 !== null && group0 === group;
      if (group0 !== null && !stayed) this.obstacleSwitches += 1;
      const inARow = stayed ? onGroup : 0;
      obstacle = repeatObstacleFactor(inARow);
      group0 = group;
      onGroup = inARow + 1;
    }

    if (prev === null) {
      this.streak = 1;
    } else if (grade.streak === 'grow') {
      this.streak += prev.raw / STREAK_DIVISOR;
    } else if (grade.streak === 'halve') {
      this.streak += (1 - this.streak) / 2;
    }

    const landed = this.#landedByName.get(name) ?? 0;
    const repeat = repeatTrickFactor(landed);
    const b2b = backToBackFactor(run);
    const raw = base * grade.points * repeat * b2b * obstacle;
    const net = raw * this.streak;
    if (grade.points > 0) this.#landedByName.set(name, landed + 1);
    this.#since = { name, run, group: group0, onGroup, raw };

    const record = {
      name,
      execution,
      base,
      exec: grade.points,
      repeat,
      b2b,
      obstacle,
      streak: this.streak,
      raw,
      net,
      atMs,
      turns: trick.turns ?? 0,
    };
    this.tricks.push(record);
    this.#netSum += net;
    if (execution === 'BUMP') this.#bumps += 1;
    if (net > this.#bestNet) this.#bestNet = net;

    const event = { kind: 'trick', name, points: net, execution };
    if (!this.#combos) {
      this.#banked += net;
      this.#queue.push(event);
      return record;
    }
    if (this.#combo === null) {
      this.#combo = { names: [], points: 0, scoring: 0, deadline: atMs + this.#windowMs };
    }
    const c = this.#combo;
    c.names.push(name);
    c.points += net;
    if (net > 0) {
      c.scoring += 1;
      c.deadline = atMs + this.#windowMs;
    }
    if (c.names.length > this.#bestChain) this.#bestChain = c.names.length;
    this.#queue.push(event);
    if (c.scoring >= this.#multMax) this.bank();
    return record;
  }

  tick(nowMs) {
    this.nowMs = nowMs;
    if (this.state === RUN_OVER) return;
    if (this.timed && this.state === RUN_FLYING && nowMs - this.#start >= this.#runMs) {
      this.finish();
      return;
    }
    if (this.#combo !== null && nowMs >= this.#combo.deadline) this.bank();
  }

  #comboValue() {
    return Math.round(this.#combo.points * this.comboMultiplier());
  }

  bank() {
    if (this.#combo === null) return 0;
    const value = this.#comboValue();
    const mult = this.comboMultiplier();
    this.#banked += value;
    if (value > this.#bestCombo) this.#bestCombo = value;
    this.#queue.push({ kind: 'bank', points: value, mult, names: [...this.#combo.names] });
    this.#combo = null;
    return value;
  }

  crash() {
    this.crashes += 1;
    this.#since = null;
    if (this.#combo === null) return;
    this.#queue.push({ kind: 'bail', points: this.#comboValue(), names: [...this.#combo.names] });
    this.#combo = null;
  }

  finish() {
    if (this.state === RUN_OVER) return this.total();
    this.bank();
    this.state = RUN_OVER;
    this.#end = this.nowMs;
    const mult = obstacleBonusMultiplier(this.obstacleSwitches);
    this.bonus = Math.round((mult - 1) * this.#netSum);
    this.#banked += this.bonus;
    this.#queue.push({
      kind: 'finish', points: this.#banked, bonus: this.bonus, mult, switches: this.obstacleSwitches,
    });
    return this.total();
  }

  comboMultiplier() {
    return this.#combo === null ? 0 : Math.min(this.#combo.scoring, this.#multMax);
  }

  total() {
    return this.#banked;
  }

  view() {
    const c = this.#combo;
    return {
      total: this.#banked,
      streak: this.streak,
      trickCount: this.tricks.length,
      bestCombo: this.#bestCombo,
      bestTrick: Math.round(this.#bestNet),
      crashes: this.crashes,
      state: this.state,
      remainMs: this.remainMs(),
      runMs: this.#runMs,
      // names is the live list on purpose: a HUD holding last frame's view sees it grow.
      combo: c === null ? null : {
        names: c.names,
        points: Math.round(c.points),
        mult: this.comboMultiplier(),
        value: this.#comboValue(),
        remain: Math.max(0, Math.min(1, (c.deadline - this.nowMs) / this.#windowMs)),
      },
    };
  }

  drainEvents() {
    if (this.#queue.length === 0) return null;
    const out = this.#queue;
    this.#queue = [];
    return out;
  }

  summary() {
    const byName = new Map();
    let signature = '';
    let top = 0;
    for (const r of this.tricks) {
      const row = byName.get(r.name);
      if (row) {
        row.count += 1;
        row.points += r.net;
      } else {
        byName.set(r.name, { name: r.name, count: 1, points: r.net });
      }
      if (r.net > top) {
        top = r.net;
        signature = r.name;
      }
    }
    const rows = [...byName.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    for (const row of rows) row.points = Math.round(row.points);
    let durationMs = 0;
    if (this.state !== RUN_READY) {
      durationMs = Math.max(0, (this.state === RUN_OVER ? this.#end : this.nowMs) - this.#start);
    }
    return {
      total: this.#banked,
      tricks: this.tricks.length,
      unique: rows.length,
      bestCombo: this.#bestCombo,
      bestChain: this.#bestChain,
      bestTrick: Math.round(this.#bestNet),
      signature,
      streak: this.streak,
      crashes: this.crashes,
      bumps: this.#bumps,
      obstacles: this.obstacleSwitches,
      bonus: this.bonus,
      state: this.state,
      durationMs,
      assisted: this.#assisted,
      timed: this.timed,
      rows,
    };
  }
}

export function formatScore(n) {
  const neg = n < 0;
  let rest = String(Math.round(neg ? -n : n));
  let out = '';
  while (rest.length > 3) {
    out = `,${rest.slice(-3)}${out}`;
    rest = rest.slice(0, -3);
  }
  return `${neg ? '-' : ''}${rest}${out}`;
}
