/*
 * readback.js: what broke, read from the module's crash physics ABI
 * (src/native/sim_abi.h, "CRASH PHYSICS"; docs/CRASH-STAGE1.md section 1).
 *
 * The reads go through the shell's own reader (src/game/damage.js
 * createDamageLink), so the suite judges exactly what the shell draws. A
 * reader only reads: every call that writes the module (sim_set_damage,
 * sim_set_part_table, sim_part_break) is the scenario's, made through the
 * Recorder so the cross-host check replays it (tests/crash/program.js).
 *
 * Environment neutral: the Chrome replay runs the same reader on its own
 * module and hands its summary back, so what broke is compared between
 * hosts as well as hashed.
 *
 * THE BANDS' VOCABULARY. Bands name parts by the module's kinds
 * (configs/parts.js PART_KINDS) plus one group, `tail`: the stabiliser,
 * the fin, the boom and their surfaces, which is what a reference means by
 * "the tail". A part is BROKEN when it has left the aircraft (status not
 * attached) or its damage is 1; DAMAGED when its damage is above 0 (a
 * chipped prop, a crushed nose, a bent arm). Those are the definitions
 * docs/CRASH-STAGE1.md gives a reader.
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

import { createDamageLink } from '../../src/game/damage.js';
import {
  DAMAGE_FLAGS, EVENT, EVENT_TYPES, PART_KINDS as MODULE_KINDS, PART_STATE_DOUBLES, STATE,
} from '../../configs/parts.js';

const TAIL_KINDS = new Set(['hstab', 'fin', 'boom', 'elevator', 'rudder']);

/* Every name a band may use. */
export const PART_KINDS = [...MODULE_KINDS, 'tail'];

/* The band names a module kind answers to. */
export function bandNames(kindName) {
  return TAIL_KINDS.has(kindName) ? [kindName, 'tail'] : [kindName];
}

const FLAG_NAMES = Object.keys(DAMAGE_FLAGS);

export function flagNames(flags) {
  return FLAG_NAMES.filter((k) => (flags & DAMAGE_FLAGS[k]) !== 0);
}

/*
 * Returns a reader, or null when the module has no crash ABI.
 *
 *   reader.table()      the part table, read once
 *   reader.sample(ms, keep)  after every step of the live run: drains
 *                       the events and, when `keep`, counts them and keeps
 *                       each part's peak load, the first break and the
 *                       flags seen (the tree and water flags are per step)
 *   reader.read()       the summary the suite judges:
 *     { parts: [{ index, kind, status, broken, detached, damage, energyJ,
 *                 peakLoad, pos }],
 *       broken: [band names], damaged: [band names], flags: [names],
 *       flagsSeen: [names], energyJ (the parts' own tally), eventsEnergyJ
 *       (the events' sum), peakLoad, peakLoadPart, events,
 *       firstBreakMs, freeBodies, motors }
 */
export function damageReader(sim) {
  const link = createDamageLink(sim);
  if (!link.available) {
    return null;
  }
  let table = null;
  const peak = [];
  const events = {};
  let flagsSeen = 0;
  let firstBreakMs = null;
  let dropped = 0;
  let eventsEnergyJ = 0;

  const reader = {
    table() {
      if (!table) {
        table = link.table();
      }
      return table;
    },

    /* The part a scenario wants, by kind and motor: the prop on motor 0 is
     * `find('prop', 0)`. -1 when the table has none. */
    find(kindName, motor = null) {
      const p = reader.table().find((t) => t.kindName === kindName && (motor === null || t.motor === motor));
      return p ? p.index : -1;
    },

    sample(ms, keep = true) {
      link.drain((ev, o) => {
        if (!keep) {
          return;
        }
        const name = EVENT_TYPES[ev[o + EVENT.type]] || 'unknown';
        events[name] = (events[name] ?? 0) + 1;
        /* A part that breaks leaves in the step it was loaded, so its state
         * never shows the load that broke it: the event's ratio does. */
        eventsEnergyJ += ev[o + EVENT.energy];
        const i = ev[o + EVENT.part];
        const r = ev[o + EVENT.ratio];
        if (!(peak[i] >= r)) {
          peak[i] = r;
        }
        if (name === 'break' && firstBreakMs === null) {
          firstBreakMs = ms;
        }
      });
      if (!keep) {
        return;
      }
      flagsSeen |= link.flags();
      const v = link.parts();
      const n = link.count();
      for (let i = 0; i < n; i += 1) {
        const l = v[i * PART_STATE_DOUBLES + STATE.peak];
        if (!(peak[i] >= l)) {
          peak[i] = l;
        }
      }
      if (typeof sim.e.sim_damage_events_dropped === 'function') {
        dropped = sim.e.sim_damage_events_dropped();
      }
    },

    read() {
      const t = reader.table();
      const v = link.parts();
      const parts = [];
      const broken = new Set();
      const damaged = new Set();
      let energyJ = 0;
      let peakLoad = 0;
      let peakLoadPart = null;
      for (let i = 0; i < t.length; i += 1) {
        const o = i * PART_STATE_DOUBLES;
        const status = v[o + STATE.status];
        const damage = v[o + STATE.damage];
        const p = {
          index: i,
          kind: t[i].kindName,
          status,
          detached: status !== 0,
          broken: status !== 0 || damage >= 1,
          damage,
          energyJ: v[o + STATE.energy],
          peakLoad: peak[i] ?? 0,
          pos: [v[o + STATE.pos], v[o + STATE.pos + 1], v[o + STATE.pos + 2]],
        };
        parts.push(p);
        energyJ += p.energyJ;
        if (p.peakLoad > peakLoad) {
          peakLoad = p.peakLoad;
          peakLoadPart = p.kind;
        }
        for (const name of bandNames(p.kind)) {
          if (p.broken) {
            broken.add(name);
          }
          if (damage > 0 || p.broken) {
            damaged.add(name);
          }
        }
      }
      const m = link.motors();
      return {
        parts,
        broken: [...broken],
        damaged: [...damaged],
        flags: flagNames(link.flags()),
        flagsSeen: flagNames(flagsSeen | link.flags()),
        energyJ,
        eventsEnergyJ,
        peakLoad,
        peakLoadPart,
        events: { ...events },
        eventsDropped: dropped,
        firstBreakMs,
        freeBodies: link.freeBodies(),
        motors: m ? Array.from(m) : null,
      };
    },
  };
  return reader;
}
