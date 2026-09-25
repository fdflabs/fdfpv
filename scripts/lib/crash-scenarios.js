/*
 * crash-scenarios.js: the plant tests' crash scenarios, for
 * scripts/crash-core-selftest.js. Each builds a module, sets a crash up
 * through the ABI a host has (sim_set_pose, sim_set_velocity,
 * sim_wing_launch, sim_input), flies it, and returns named checks. These
 * are tests of the plant's damage model against the physics it claims,
 * not the crash suite's reference bands, which scripts/crash-suite.js
 * owns.
 *
 * Every scenario records a digest of its whole trace, the state block and
 * every part's state at every step, so a run can be held against itself
 * (determinism) and against the browser's (tests/browser/crash-harness.js).
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

import { DAMAGE_FLAGS, PART_STATE_DOUBLES, SURFACE } from '../../configs/parts.js';
import { readDamageEvents, readMotorDamage, readPartTable, readPartsState } from './crash.js';

const SIM_OK = 0;

/* A digest of doubles: FNV-1a over their bytes, 64 bits in two halves.
 * Only for telling two traces apart; no host maths, only integer ops. */
class Digest {
  constructor() {
    this.a = 0x811c9dc5;
    this.b = 0x01000193;
  }

  add(doubles) {
    const bytes = new Uint8Array(doubles.buffer, doubles.byteOffset, doubles.byteLength);
    let { a, b } = this;
    for (let i = 0; i < bytes.length; i += 1) {
      a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
      b = Math.imul(b ^ bytes[i] ^ (a >>> 7), 0x5bd1e995) >>> 0;
    }
    this.a = a;
    this.b = b;
  }

  hex() {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

const halfTurn = (deg, axis) => {
  const h = (deg * Math.PI) / 360;
  const q = [Math.cos(h), 0, 0, 0];
  q[1 + axis] = Math.sin(h);
  return q;
};
const roll = (deg) => halfTurn(deg, 0);
const pitch = (deg) => halfTurn(deg, 1);
const upOf = (s) => 1 - 2 * (s[8] * s[8] + s[9] * s[9]);
const speedOf = (s) => Math.hypot(s[4], s[5], s[6]);
const bankOf = (s) => Math.atan2(2 * (s[7] * s[8] + s[9] * s[10]), 1 - 2 * (s[8] * s[8] + s[9] * s[9])) * 180 / Math.PI;

/* One module, set up. */
export class Rig {
  static async create(loadSim, wasmBytes, configText, { id = 0, damage = 1, ground = 'grass', mu = 1.4, e = 0, volts = 4.1 } = {}) {
    const sim = await loadSim(wasmBytes);
    const must = (c, w) => { if (c !== SIM_OK) throw new Error(`${w}: ${c}`); };
    must(sim.init(configText), 'init');
    must(sim.e.sim_set_airframe(id), 'airframe');
    must(sim.reset(), 'reset');
    must(sim.setCellVoltage(volts), 'volts');
    must(sim.e.sim_set_damage(damage), 'damage');
    if (ground !== null) {
      must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'ground');
      must(sim.e.sim_set_ground_material(SURFACE[ground]), 'material');
    }
    return new Rig(sim);
  }

  constructor(sim) {
    this.sim = sim;
    /* The plant's own trace, and the plant's with every part's readback. */
    this.plant = new Digest();
    this.digest = new Digest();
    this.events = [];
    this.peakG = 0;
    this.parts = readPartTable(sim);
    this.n = this.parts.length;
    this.partsPtr = sim.e.malloc(this.n * PART_STATE_DOUBLES * 8);
    /* Steps in which some part's damage rose before any event had said
     * so: a flight with no event must be a flight nothing was written in. */
    this.silent = 0;
    this.damageSum = 0;
    this.prev = this.state();
  }

  state() {
    return this.sim.readState().state;
  }

  pose(p, q) {
    this.sim.e.sim_set_pose(p[0], p[1], p[2], q[0], q[1], q[2], q[3]);
    this.prev = this.state();
  }

  launch(speed) {
    this.sim.e.sim_wing_launch(speed);
    this.prev = this.state();
  }

  velocity(v, w = [0, 0, 0]) {
    this.sim.e.sim_set_velocity(v[0], v[1], v[2], w[0], w[1], w[2]);
    this.prev = this.state();
  }

  /* Step ms milliseconds, sticks a function of the state or an array. */
  run(ms, sticks = [0, 0, 0, 0], each = null) {
    const { sim } = this;
    for (let i = 0; i < ms; i += 1) {
      const t = this.prev[0];
      const st = typeof sticks === 'function' ? sticks(this.prev) : sticks;
      sim.input(t + 0.0001, st[0], st[1], st[2], st[3]);
      sim.step(1);
      const s = this.state();
      const a = Math.hypot(s[4] - this.prev[4], s[5] - this.prev[5], s[6] - this.prev[6] + 9.80665e-3) / 0.001;
      if (a / 9.80665 > this.peakG) {
        this.peakG = a / 9.80665;
      }
      sim.e.sim_parts_state(this.partsPtr);
      this.plant.add(s);
      this.digest.add(s);
      const ps = new Float64Array(sim.e.memory.buffer, this.partsPtr, this.n * PART_STATE_DOUBLES);
      this.digest.add(ps);
      let dsum = 0;
      for (let k = 0; k < this.n; k += 1) {
        dsum += ps[k * PART_STATE_DOUBLES + 1];
      }
      for (const ev of readDamageEvents(sim)) {
        this.events.push(ev);
      }
      if (dsum > this.damageSum && this.events.length === 0) {
        this.silent += 1;
      }
      this.damageSum = dsum;
      if (each) {
        each(s, i);
      }
      this.prev = s;
    }
    return this.prev;
  }

  partsState() {
    return readPartsState(this.sim);
  }

  flags() {
    return this.sim.e.sim_damage_flags();
  }

  motors() {
    return readMotorDamage(this.sim);
  }

  index(kind, pick = () => true) {
    return this.parts.findIndex((p) => p.kindName === kind && pick(p));
  }

  broke(kind) {
    const st = this.partsState();
    return this.parts.some((p, i) => p.kindName === kind && st[i].status !== 0);
  }

  count(type) {
    return this.events.filter((e) => e.typeName === type).length;
  }

  summary() {
    return this.events.filter((e) => e.typeName !== 'settle')
      .map((e) => `${e.typeName} ${this.parts[e.part].label}`).join(', ') || 'nothing';
  }
}

/* The five inch hovering: throttle near its hover, angle mode off, the
 * sticks centred. What it takes to hold height here is not the point; a
 * crash is. */
const HOVER = 0.33;

/* A Slow Stick in cruise met from below by a face closing at 5 cm/s, as
 * scripts/crash-shell-identity.js's gate member does. mat -1 is the plain
 * sim_contact_at with a gate's mu and e. */
function grazeFromBelow(r, mat) {
  r.pose([0, 0, 40], [1, 0, 0, 0]);
  r.velocity([14, 0, 0]);
  r.run(2600, [0, 0, 0, 0.5]);
  const s = r.state();
  const at = [s[1], s[2], s[3] - 0.05, s[4], s[5], s[6] + 0.05, 0, 0, -0.05];
  if (mat < 0) {
    r.sim.e.sim_contact_at(0, 0, 1, 0.22, 0.3, ...at);
  } else {
    r.sim.e.sim_contact_at_mat(0, 0, 1, mat, ...at);
  }
  r.run(1000, [0, 0, 0, 0.5]);
}

export const CRASH_SCENARIOS = [
  {
    name: 'under every limit, crash physics changes nothing',
    async run(mk) {
      const checks = [];
      const cases = [
        ['a five inch settling onto grass at 1 m/s', { id: 0 }, (r) => { r.pose([0, 0, 0.3], [1, 0, 0, 0]); r.velocity([0, 0, -1]); r.run(1500, [0, 0, 0, 0.2]); }],
        ['a five inch dropped flat from 1.5 m onto grass', { id: 0 }, (r) => { r.pose([0, 0, 1.5], [1, 0, 0, 0]); r.run(1500); }],
        ['a five inch taps a wall at 2 m/s', { id: 0 }, (r) => {
          r.pose([0, 0, 1], [1, 0, 0, 0]); r.velocity([2, 0, 0]);
          const s = r.state();
          r.sim.e.sim_contact_at(-1, 0, 0, 0.15, 0.4, s[1], s[2], s[3], 0, 0, 0, 0.09, 0.0, 0.0);
          r.run(800, [0, 0, 0, HOVER]);
        }],
        ['a Cub lands on its wheels at 9 m/s', { id: 4 }, (r) => { r.pose([0, 0, 0.3], [1, 0, 0, 0]); r.launch(9); r.run(6000); }],
        ['a Timber lands on its wheels at 9 m/s', { id: 7 }, (r) => { r.pose([0, 0, 0.35], [1, 0, 0, 0]); r.launch(9); r.run(6000); }],
        ['a Radian belly lands at 8 m/s', { id: 6 }, (r) => { r.pose([0, 0, 0.3], [1, 0, 0, 0]); r.launch(8); r.run(4000); }],
        /* A graze from below at 5 cm/s in cruise, which lands on the
         * turning prop's lowest tip: under the blade's impact limit on any
         * face, so nothing at all, whatever the face is made of. */
        ['a Slow Stick grazed from below at 5 cm/s, prop turning', { id: 5 }, (r) => grazeFromBelow(r, -1)],
        ['the same graze on a pvc gate', { id: 5 }, (r) => grazeFromBelow(r, SURFACE.pvc)],
      ];
      for (const [name, opts, fly] of cases) {
        const on = await mk({ ...opts, damage: 1 });
        const off = await mk({ ...opts, damage: 0 });
        fly(on);
        fly(off);
        checks.push({ name: `${name}: trace identical with it on and off`, ok: on.plant.hex() === off.plant.hex() && on.events.length === 0 && on.damageSum === 0, detail: `${on.plant.hex()} ${on.summary()}, damage ${on.damageSum.toExponential(1)}` });
      }
      return checks;
    },
  },
  {
    name: 'a five inch tip first onto concrete at 8 m/s',
    async run(mk) {
      const r = await mk({ id: 0, ground: 'concrete' });
      r.pose([0, 0, 0.3], roll(45));
      r.velocity([0, 0, -8]);
      r.run(3000);
      const g = await mk({ id: 0, ground: 'grass' });
      g.pose([0, 0, 0.3], roll(45));
      g.velocity([0, 0, -8]);
      g.run(3000);
      const armOrProp = r.broke('arm') || r.broke('prop');
      const peakC = Math.max(0, ...r.events.filter((e) => e.typeName === 'break').map((e) => e.force));
      const peakGr = Math.max(0, ...g.events.filter((e) => e.typeName === 'break').map((e) => e.force));
      const settled = r.partsState().every((p) => p.status !== 1);
      return [
        { name: 'breaks an arm or a prop', ok: armOrProp, detail: r.summary() },
        { name: 'the frame stays whole', ok: r.partsState()[0].status === 0 },
        { name: 'every broken part comes to rest', ok: settled, detail: `${r.sim.e.sim_free_bodies_active()} moving` },
        { name: 'grass takes less than concrete', ok: g.events.filter((e) => e.typeName === 'break').length <= r.events.filter((e) => e.typeName === 'break').length && peakGr <= peakC, detail: `concrete ${r.summary()} peak ${peakC.toFixed(0)} N; grass ${g.summary()} peak ${peakGr.toFixed(0)} N` },
      ];
    },
  },
  {
    name: 'a five inch under power lowered onto concrete, tilted',
    async run(mk) {
      const r = await mk({ id: 0, ground: 'concrete' });
      /* Steep: until past about 60 degrees the reconciled hull's corner,
       * not a prop, is what the ground meets. */
      r.pose([0, 0, 0.13], roll(65));
      r.velocity([0, 0, -0.5]);
      r.run(400, [0, 0, 0, 0.25]);
      const chips = r.count('chip') + r.count('break');
      const m = r.motors();
      const worst = Math.min(...m.map((x) => x.thrust));
      /* The same on grass: a blade tip meeting grass is far under its
       * impact limit at any speed, so the props come back unmarked. */
      const g = await mk({ id: 0, ground: 'grass' });
      g.pose([0, 0, 0.13], roll(65));
      g.velocity([0, 0, -0.5]);
      g.run(400, [0, 0, 0, 0.25]);
      const grassChips = g.events.filter((e) => e.typeName === 'chip' && g.parts[e.part].kindName === 'prop').length;
      return [
        { name: 'the blades that touch are chipped or lost', ok: chips > 0 && (r.flags() & (DAMAGE_FLAGS.propChipped | DAMAGE_FLAGS.propLost)) !== 0, detail: r.summary() },
        { name: 'a chipped prop keeps less thrust and shakes more', ok: worst < 1 && m.some((x) => x.imbalance > 1 || x.thrust === 0), detail: m.map((x) => `${x.thrust.toFixed(2)}/${x.imbalance.toFixed(1)}`).join(' ') },
        { name: 'on grass the same blades are not chipped', ok: grassChips === 0 && (g.flags() & DAMAGE_FLAGS.propChipped) === 0, detail: g.summary() },
        { name: 'no damage is written before an event says so', ok: r.silent === 0 && g.silent === 0, detail: `${r.silent} and ${g.silent} silent steps` },
      ];
    },
  },
  {
    name: 'a five inch loses a prop in flight',
    async run(mk) {
      const r = await mk({ id: 0 });
      r.pose([0, 0, 10], [1, 0, 0, 0]);
      r.run(1000, [0, 0, 0, HOVER]);
      const prop = r.index('prop', (p) => p.motor === 0);
      const before = r.state();
      r.sim.e.sim_part_break(prop);
      let maxYaw = 0;
      let tGround = null;
      r.run(9000, [0, 0, 0, HOVER], (s) => {
        maxYaw = Math.max(maxYaw, Math.abs(s[13]));
        if (tGround === null && s[3] < 0.2) tGround = s[0] - before[0];
      });
      const m = r.motors();
      const ps = r.partsState();
      return [
        { name: 'motor 0 reads no thrust', ok: m[0].thrust === 0, detail: m.map((x) => x.thrust.toFixed(2)).join(' ') },
        { name: 'the flags say a prop is gone', ok: (r.flags() & DAMAGE_FLAGS.propLost) !== 0 },
        { name: 'it yaws into a spin Betaflight cannot stop', ok: maxYaw > 10, detail: `${maxYaw.toFixed(1)} rad/s` },
        { name: 'it comes down within 5 s', ok: tGround !== null && tGround < 5, detail: `${tGround === null ? 'never' : tGround.toFixed(2)} s` },
        { name: 'the prop flutters down and comes to rest on the grass', ok: ps[prop].status === 2 && Math.abs(ps[prop].pos[2]) < 0.05, detail: `status ${ps[prop].statusName}, z ${ps[prop].pos[2].toFixed(3)}` },
      ];
    },
  },
  {
    name: 'a bent arm tilts its thrust',
    async run(mk) {
      const fly = async (bend) => {
        const r = await mk({ id: 0, ground: null });
        r.pose([0, 0, 20], [1, 0, 0, 0]);
        if (bend) r.sim.e.sim_part_set_damage(r.index('arm', (p) => p.motor === 3), 1.0);
        let drift = 0;
        r.run(3000, [0, 0, 0, HOVER], (s) => { drift = Math.max(drift, Math.hypot(s[1], s[2])); });
        return { r, drift };
      };
      const a = await fly(false);
      const b = await fly(true);
      const m = b.r.motors();
      return [
        { name: 'the motor reads its tilt', ok: Math.hypot(m[3].tiltX, m[3].tiltY) > 0.05, detail: `${m[3].tiltX.toFixed(3)}, ${m[3].tiltY.toFixed(3)} rad` },
        { name: 'the flags say an arm is bent', ok: (b.r.flags() & DAMAGE_FLAGS.armBent) !== 0 },
        { name: 'the trace moves off the intact one', ok: a.r.plant.hex() !== b.r.plant.hex(), detail: `drift intact ${a.drift.toFixed(2)} m, bent ${b.drift.toFixed(2)} m` },
      ];
    },
  },
  {
    name: 'a chipped prop shakes the gyro',
    async run(mk) {
      const fly = async (chip) => {
        const r = await mk({ id: 0, ground: null });
        r.pose([0, 0, 20], [1, 0, 0, 0]);
        if (chip) r.sim.e.sim_part_set_damage(r.index('prop', (p) => p.motor === 1), 0.4);
        let sum = 0;
        let n = 0;
        r.run(3000, [0, 0, 0, 0.45], (s, i) => {
          if (i < 500) return;
          const g = r.sim.e.sim_bf_debug(71) - s[11] * 180 / Math.PI;
          sum += g * g;
          n += 1;
        });
        return Math.sqrt(sum / n);
      };
      const a = await fly(false);
      const b = await fly(true);
      return [
        { name: 'the gyro reads more shake than a sound prop gives', ok: b > 1.5 * a, detail: `${a.toFixed(2)} deg/s RMS sound, ${b.toFixed(2)} chipped` },
      ];
    },
  },
  {
    name: 'a Cub loses its left wing panel in level flight',
    async run(mk) {
      const r = await mk({ id: 4, ground: null });
      r.sim.e.sim_wing_set_stab(1);
      r.pose([0, 0, 100], [1, 0, 0, 0]);
      r.launch(15);
      r.run(1500, [0, 0, 0, 0.6]);
      r.sim.e.sim_part_break(r.index('wing', (p) => p.cg[1] > 0));
      let minBank = 0;
      r.run(1500, [0, 0, 0, 0.6], (s) => { minBank = Math.min(minBank, bankOf(s)); });
      return [
        { name: 'the flags say a wing is gone', ok: (r.flags() & DAMAGE_FLAGS.wingLost) !== 0 },
        { name: 'it rolls toward the lost side past 45 deg in 1.5 s', ok: minBank < -45, detail: `bank reached ${minBank.toFixed(0)} deg (right positive)` },
      ];
    },
  },
  {
    name: 'a Cub loses an aileron',
    async run(mk) {
      const rate = async (lose) => {
        const r = await mk({ id: 4, ground: null });
        r.pose([0, 0, 100], [1, 0, 0, 0]);
        r.launch(15);
        r.run(800, [0, 0, 0, 0.6]);
        if (lose) r.sim.e.sim_part_break(r.index('aileron', (p) => p.cg[1] > 0));
        let pmax = 0;
        r.run(400, [1, 0, 0, 0.6], (s) => { pmax = Math.max(pmax, s[11]); });
        return { r, pmax };
      };
      const a = await rate(false);
      const b = await rate(true);
      return [
        { name: 'the flags say a surface is gone', ok: (b.r.flags() & DAMAGE_FLAGS.surfaceLost) !== 0 },
        { name: 'full stick rolls it at half the rate or less', ok: b.pmax < 0.6 * a.pmax, detail: `${a.pmax.toFixed(2)} rad/s whole, ${b.pmax.toFixed(2)} with one` },
      ];
    },
  },
  {
    name: 'a Cub noses in at 10 m/s',
    async run(mk) {
      const r = await mk({ id: 4, ground: 'grass' });
      r.pose([0, 0, 1.0], pitch(45));
      r.launch(10);
      r.run(3000);
      const ps = r.partsState();
      const nose = r.parts.findIndex((p) => p.crushStress > 0 && ps[r.parts.indexOf(p)].energy > 0);
      const dent = nose >= 0 ? Math.hypot(...ps[nose].deform) : 0;
      return [
        { name: 'the nose crushes', ok: r.count('crush') > 0 && (r.flags() & DAMAGE_FLAGS.crushed) !== 0, detail: `${r.parts[nose]?.label ?? 'none'} dented ${(dent * 1000).toFixed(0)} mm` },
        { name: 'the crush makes the contact last: under 400 g at the CG', ok: r.peakG < 400, detail: `${r.peakG.toFixed(0)} g` },
        { name: 'the prop goes', ok: r.broke('prop'), detail: r.summary() },
      ];
    },
  },
  {
    name: 'a Cub noses in hard, and its pack leaves',
    async run(mk) {
      const r = await mk({ id: 4, ground: 'dirt' });
      r.pose([0, 0, 1.5], pitch(70));
      r.launch(18);
      r.run(3000, [0, 0, 0, 1]);
      const s = r.state();
      return [
        { name: 'the flags say the pack is out', ok: (r.flags() & DAMAGE_FLAGS.batteryEjected) !== 0, detail: r.summary() },
        { name: 'power gone: no volts, no current, no thrust', ok: s[18] === 0 && s[19] === 0 && r.motors()[0].thrust === 0, detail: `${s[18]} V ${s[19]} A` },
      ];
    },
  },
  {
    name: 'a camera and an antenna knocked',
    async run(mk) {
      /* The props stand further out than the camera every way but up, so
       * a camera is knocked by the stop, not by being struck: a flat drop
       * from 3 m onto concrete, some 500 g on the pack. */
      const r = await mk({ id: 0, ground: 'concrete' });
      r.pose([0, 0, 3], [1, 0, 0, 0]);
      const cam = r.index('camera');
      r.run(1500);
      const f = r.flags();
      const q = r.partsState()[cam].quat;
      const s = r.state();
      const turned = Math.abs(q[0] * s[7] + q[1] * s[8] + q[2] * s[9] + q[3] * s[10]) < 0.9998;
      const t = await mk({ id: 0 });
      t.sim.e.sim_part_break(t.index('antenna'));
      return [
        { name: 'a hard stop knocks the camera and breaks nothing', ok: (f & DAMAGE_FLAGS.cameraKnocked) !== 0 && r.count('break') === 0, detail: r.summary() },
        { name: 'a knocked camera part is turned against the craft', ok: (f & DAMAGE_FLAGS.cameraLost) !== 0 || turned },
        { name: 'an antenna off is the flag the feed reads', ok: (t.flags() & DAMAGE_FLAGS.antennaLost) !== 0 },
      ];
    },
  },
  {
    name: 'free bodies: a budget, and every one at rest',
    async run(mk) {
      const r = await mk({ id: 8 });
      r.pose([0, 0, 3], [1, 0, 0, 0]);
      r.velocity([10, 0, 0], [3, 2, 1]);
      let most = 0;
      for (let i = r.n - 1; i > 0; i -= 1) {
        r.sim.e.sim_part_break(i);
        most = Math.max(most, r.sim.e.sim_free_bodies_active());
      }
      r.run(8000, [0, 0, 0, 0], () => { most = Math.max(most, r.sim.e.sim_free_bodies_active()); });
      const ps = r.partsState();
      const moving = ps.filter((p) => p.status === 1).length;
      const under = ps.filter((p) => p.status !== 0 && p.pos[2] < -0.05).length;
      return [
        { name: `no more than 12 move at once`, ok: most <= 12, detail: `${most} at most of ${r.n - 1} broken off` },
        { name: 'all at rest within 8 s', ok: moving === 0, detail: `${moving} still moving` },
        { name: 'none under the ground', ok: under === 0, detail: `${under} under` },
      ];
    },
  },
  {
    name: 'the same crash twice is byte identical',
    async run(mk) {
      const fly = async () => {
        const r = await mk({ id: 0, ground: 'concrete' });
        r.pose([0, 0, 0.5], roll(50));
        r.velocity([6, 0, -8], [0, 0, 4]);
        r.run(2500, [0, 0, 0, 0.4]);
        return r;
      };
      const a = await fly();
      const b = await fly();
      return [{ name: 'digest', ok: a.digest.hex() === b.digest.hex() && a.events.length > 0, detail: `${a.digest.hex()} (${a.summary()})` }];
    },
  },
  {
    name: 'a Cub into a tree, and a five inch through it',
    async run(mk) {
      const tree = (r) => r.sim.e.sim_tree_add(20, 0, 0, 0.15, 3, 9, 3);
      const c = await mk({ id: 4 });
      tree(c);
      c.pose([0, 0, 6], [1, 0, 0, 0]);
      c.launch(12);
      c.run(4000, [0, 0, 0, 0.5]);
      const q = await mk({ id: 0 });
      tree(q);
      q.pose([0, 0, 6], [1, 0, 0, 0]);
      q.velocity([15, 0, 0]);
      let qOut = 0;
      q.run(2500, [0, 0, 0, HOVER], (s) => { if (s[1] > 23) qOut = Math.max(qOut, speedOf(s)); });
      const cs = c.state();
      return [
        { name: 'the Cub is held in the crown', ok: cs[3] > 2.5 && speedOf(cs) < 0.5, detail: `z ${cs[3].toFixed(2)} m, ${speedOf(cs).toFixed(2)} m/s` },
        { name: 'the five inch punches through', ok: qOut > 3, detail: `${qOut.toFixed(1)} m/s out the far side` },
      ];
    },
  },
  {
    name: 'into water and into a crown, an event even when nothing breaks',
    async run(mk) {
      const damaging = (r) => r.events.filter((e) => !['water', 'tree', 'settle'].includes(e.typeName));
      /* A five inch let down onto a lake at 1 m/s, motors idle. */
      const w = await mk({ id: 0, ground: null });
      w.sim.e.sim_water_add(0, 0, 0);
      w.pose([0, 0, 0.3], [1, 0, 0, 0]);
      w.velocity([0, 0, -1]);
      w.run(1500);
      /* A Slow Stick, the lightest plane, flown slowly into a crown. */
      const t = await mk({ id: 5 });
      t.sim.e.sim_tree_add(8, 0, 0, 0.15, 3, 9, 3);
      t.pose([0, 0, 6], [1, 0, 0, 0]);
      t.launch(7);
      t.run(3000, [0, 0, 0, 0.3]);
      const wet = w.events.filter((e) => e.typeName === 'water');
      const leaves = t.events.filter((e) => e.typeName === 'tree');
      return [
        { name: 'the five inch reads one water entry, at the surface', ok: wet.length === 1 && Math.abs(wet[0].point[2]) < 0.02 && wet[0].closing > 0.5 && wet[0].surface === SURFACE.water, detail: wet.map((e) => `${w.parts[e.part].label} z ${e.point[2].toFixed(3)} at ${e.closing.toFixed(2)} m/s`).join(', ') || 'none' },
        { name: 'and nothing in it is damage', ok: damaging(w).length === 0 && w.damageSum === 0, detail: w.summary() },
        { name: 'the Slow Stick reads one crown entry', ok: leaves.length === 1 && leaves[0].surface === SURFACE.foliage, detail: leaves.map((e) => `${t.parts[e.part].label} at (${e.point.map((v) => v.toFixed(2)).join(', ')}) ${e.closing.toFixed(1)} m/s`).join(', ') || 'none' },
        { name: 'and it breaks nothing', ok: damaging(t).length === 0, detail: t.summary() },
      ];
    },
  },
  {
    name: 'wind: still air by default, and every craft flies through it',
    async run(mk) {
      const hover = (r) => { r.pose([0, 0, 50], [1, 0, 0, 0]); r.run(2000, [0, 0, 0, HOVER]); };
      const plain = await mk({ id: 0, damage: 0, ground: null });
      hover(plain);
      const zero = await mk({ id: 0, damage: 0, ground: null });
      const rc0 = zero.sim.e.sim_set_wind(0, 0, 0);
      hover(zero);
      const refused = [[31, 0, 0], [0, NaN, 0], [0, 0, 11], [0, 0, -1]]
        .every(([x, y, g]) => zero.sim.e.sim_set_wind(x, y, g) !== SIM_OK);
      /* A five inch falling with its motors at idle in a 5 m/s crosswind
       * is carried along it by its body's drag. */
      const fall = async (wind) => {
        const r = await mk({ id: 0, damage: 0, ground: null });
        r.sim.e.sim_set_wind(0, wind, 0);
        r.pose([0, 0, 300], [1, 0, 0, 0]);
        return r.run(4000);
      };
      const qs = await fall(5);
      const q0 = await fall(0);
      /* A Cub at cruise into a 5 m/s headwind: the same airspeed, 5 m/s
       * less over the ground. */
      const cub = async (wind) => {
        const r = await mk({ id: 4, damage: 0, ground: null });
        r.sim.e.sim_set_wind(-wind, 0, 0);
        r.pose([0, 0, 100], [1, 0, 0, 0]);
        r.launch(14 - wind);
        let air = 0;
        let ground = 0;
        r.run(6000, [0, 0, 0, 0.6], (s, i) => {
          if (i >= 4000) {
            air += Math.hypot(s[4] + wind, s[5], s[6]) / 2000;
            ground += s[4] / 2000;
          }
        });
        return { air, ground };
      };
      const still = await cub(0);
      const head = await cub(5);
      /* The Bramor under its canopy in a 6 m/s wind drifts with it. */
      const b = await mk({ id: 8, damage: 0, ground: null });
      b.sim.e.sim_set_wind(6, 0, 0);
      b.pose([0, 0, 300], [1, 0, 0, 0]);
      b.launch(18);
      b.run(500, [0, 0, 0, 0]);
      b.sim.e.sim_wing_chute(1);
      let drift = 0;
      b.run(15000, [0, 0, 0, 0], (s, i) => { if (i >= 12000) drift += s[4] / 3000; });
      /* Gusts: their RMS per axis is what was asked, about the mean, and
       * the same twice. */
      const gust = async () => {
        const r = await mk({ id: 0, damage: 0, ground: null });
        r.sim.e.sim_set_wind(4, 0, 2);
        const buf = r.sim.e.malloc(16);
        let sx = 0, sy = 0, sxx = 0, syy = 0, n = 0;
        for (let k = 0; k < 1200; k += 1) {
          r.sim.step(100);
          r.sim.e.sim_wind(buf);
          const w = new Float64Array(r.sim.e.memory.buffer, buf, 2);
          sx += w[0]; sy += w[1]; sxx += w[0] * w[0]; syy += w[1] * w[1]; n += 1;
        }
        r.sim.e.free(buf);
        const mx = sx / n, my = sy / n;
        return { mx, my, rx: Math.sqrt(sxx / n - mx * mx), ry: Math.sqrt(syy / n - my * my) };
      };
      const g1 = await gust();
      const g2 = await gust();
      return [
        { name: 'sim_set_wind(0, 0, 0) is the flight without it, to the bit', ok: rc0 === SIM_OK && zero.plant.hex() === plain.plant.hex(), detail: plain.plant.hex() },
        { name: 'out of range is refused', ok: refused },
        { name: 'a five inch falling at idle is carried down a 5 m/s crosswind', ok: qs[5] > 1 && qs[5] < 5 && Math.abs(q0[5]) < 0.1, detail: `${qs[5].toFixed(2)} m/s along it after 4 s, ${q0[5].toFixed(2)} in still air` },
        { name: 'a Cub launched into a 5 m/s headwind at 14 m/s through the air flies as in still air, 5 m/s less over the ground', ok: Math.abs(still.air - head.air) < 1e-9 && Math.abs(still.ground - head.ground - 5) < 1e-9, detail: `airspeed ${still.air.toFixed(3)} still, ${head.air.toFixed(3)} into it; over the ground ${still.ground.toFixed(3)} and ${head.ground.toFixed(3)}` },
        { name: 'the Bramor under its canopy drifts at the wind\'s 6 m/s', ok: Math.abs(drift - 6) < 0.5, detail: `${drift.toFixed(2)} m/s` },
        { name: 'gusts of 2 m/s RMS about a 4 m/s mean', ok: Math.abs(g1.mx - 4) < 0.5 && Math.abs(g1.my) < 0.5 && g1.rx > 1.6 && g1.rx < 2.4 && g1.ry > 1.6 && g1.ry < 2.4, detail: `mean ${g1.mx.toFixed(2)}, ${g1.my.toFixed(2)}; RMS ${g1.rx.toFixed(2)}, ${g1.ry.toFixed(2)} over 120 s` },
        { name: 'and the same gusts twice', ok: g1.mx === g2.mx && g1.rx === g2.rx && g1.ry === g2.ry },
      ];
    },
  },
  {
    name: 'floats: added mass slows the bob, and a nose low touchdown digs in and goes over',
    async run(mk) {
      const REST = { 9: { z: 0.2074, pitch: 2.52, mass: 1.934, beam: 0.085, heave: 0.288 }, 10: { z: 0.1765, pitch: 0.64, mass: 1.532, beam: 0.080, heave: 0.294 } };
      const VS = { 9: 7.1, 10: 8.7 };
      const pitchOf = (s) => Math.asin(Math.max(-1, Math.min(1, 2 * (s[8] * s[10] - s[7] * s[9]))));
      const onWater = async (id, damage) => {
        const r = await mk({ id, damage, ground: null });
        r.sim.e.sim_water_add(0, 0, 0);
        r.sim.e.sim_wing_set_stab(0);
        return r;
      };
      /* Let down 3 cm above its rest: the period between the first two
       * lows of its heave, against the derivation's without added mass
       * scaled by sqrt((m + m_a) / m), m_a the strips' (pi/2) rho c^2 over
       * the wetted length it rests on. */
      const bob = async (id, damage) => {
        const c = REST[id];
        const r = await onWater(id, damage);
        r.pose([0, 0, c.z + 0.03], pitch(-c.pitch));
        const zs = [];
        r.run(2000, [0, 0, 0, 0], (s) => zs.push(s[3]));
        const lows = [];
        for (let i = 1; i < zs.length - 1; i += 1) {
          if (zs[i] < zs[i - 1] && zs[i] <= zs[i + 1]) lows.push(i);
        }
        const fs = r.sim.e.malloc(80);
        r.sim.e.sim_float_state(fs);
        const f = new Float64Array(r.sim.e.memory.buffer, fs, 10);
        const ma = Math.PI / 2 * 1000 * (c.beam / 2) ** 2 * (f[4] + f[5]);
        r.sim.e.free(fs);
        const want = c.heave * Math.sqrt((c.mass + ma) / c.mass);
        return { period: lows.length > 1 ? (lows[1] - lows[0]) / 1000 : NaN, want, ma };
      };
      /* The suite's nose dig: 12 deg nose low at 1.6 times the stall, held
       * there until the floats touch, hands off after. And a normal one:
       * 3 deg nose up at 1.1 times the stall. */
      const touchdown = async (id, pitchDeg, vmul) => {
        const r = await onWater(id, 1);
        r.pose([0, 0, REST[id].z + 0.5], pitch(-pitchDeg));
        r.launch(vmul * VS[id]);
        let wet = false;
        let minUp = 1;
        const fs = r.sim.e.malloc(80);
        r.run(8000, (s) => {
          if (wet) return [0, 0, 0, 0];
          const a = pitchOf(s);
          return [Math.max(-1, Math.min(1, -1.2 * bankOf(s) * Math.PI / 180 - 0.12 * s[11])), Math.max(-1, Math.min(1, 2.5 * (pitchDeg * Math.PI / 180 - a) + 0.25 * s[12])), 0, 0];
        }, (s) => {
          r.sim.e.sim_float_state(fs);
          wet = wet || new Float64Array(r.sim.e.memory.buffer, fs, 10)[0] > 0;
          minUp = Math.min(minUp, upOf(s));
        });
        r.sim.e.free(fs);
        return { minUp, endUp: upOf(r.state()) };
      };
      const checks = [];
      for (const id of [9, 10]) {
        const name = id === 9 ? 'Timber' : 'Cub';
        const off = await bob(id, 0);
        const on = await bob(id, 1);
        checks.push({ name: `${name}: with the added mass the heave period is the derivation's, carried by m_a`, ok: Math.abs(on.period / on.want - 1) < 0.1, detail: `${(on.period * 1000).toFixed(0)} ms against ${(on.want * 1000).toFixed(0)} (m_a ${on.ma.toFixed(2)} kg); ${(off.period * 1000).toFixed(0)} ms with the mode off` });
        const dig = await touchdown(id, -12, 1.6);
        const soft = await touchdown(id, 3, 1.1);
        checks.push({ name: `${name}: 12 deg nose low at 1.6 Vs digs in and goes over`, ok: dig.minUp < -0.7 && dig.endUp < 0, detail: `up axis down to ${dig.minUp.toFixed(2)}, ${dig.endUp.toFixed(2)} at the end` });
        checks.push({ name: `${name}: 3 deg nose up at 1.1 Vs stays upright`, ok: soft.minUp > 0.9, detail: `up axis at least ${soft.minUp.toFixed(2)}` });
      }
      return checks;
    },
  },
  {
    name: 'a Timber on floats catches a wing tip in the water',
    async run(mk) {
      /* Rolled onto its right float at speed, as in a hard turn on the
       * water: the tip goes in. FLOATS-STAGE1 flagged that nothing could
       * catch there; with the parts in the water the tip drags. */
      const fly = async (damage) => {
        const r = await mk({ id: 9, damage, ground: null });
        const b = r.sim.e.sim_water_add(0, 0, 0);
        r.sim.e.sim_water_wind(b, 0, 1, 0, 0);
        r.pose([0, 0, 0.12], roll(28));
        r.launch(10);
        let yawRight = 0;
        let wet = false;
        r.run(1500, [0, 0, 0, 0.3], (s) => {
          yawRight = Math.max(yawRight, -s[13]);
          wet = wet || (r.flags() & DAMAGE_FLAGS.inWater) !== 0;
        });
        return { r, yawRight, wet };
      };
      const off = await fly(0);
      const on = await fly(1);
      return [
        { name: 'the tip reads wet', ok: on.wet },
        { name: 'and drags the nose round toward it', ok: on.yawRight > off.yawRight + 0.5, detail: `yaw rate right ${on.yawRight.toFixed(2)} rad/s, ${off.yawRight.toFixed(2)} without crash physics; ${on.r.summary()}` },
      ];
    },
  },
  {
    name: 'the shell\'s whoop, the five inch in a room 3.43 times life size',
    async run(mk) {
      const L = 0.1735 / 0.0506;
      const whoop = async (ground) => {
        const r = await mk({ id: 0, ground });
        r.sim.e.sim_set_part_table(1);
        r.parts = (await import('./crash.js')).readPartTable(r.sim);
        return r;
      };
      /* A brisk walk into a wall, head height onto the floor, and full
       * speed into a gate's side, a real whoop's speeds times the room's
       * scale as the suite flies them. */
      const w = await whoop('concrete');
      w.pose([0, 0, 1.0], [1, 0, 0, 0]);
      w.velocity([1.5 * L, 0, 0]);
      let s = w.state();
      w.sim.e.sim_contact_at_mat(-1, 0, 0, SURFACE.concrete, s[1], s[2], s[3], 0, 0, 0, 0.14, 0, 0);
      w.run(1000, [0, 0, 0, HOVER]);
      const f = await whoop('concrete');
      f.pose([0, 0, 1.7 * L], [1, 0, 0, 0]);
      f.run(3000);
      const g = await whoop('grass');
      g.pose([0, 0, 1.0], [1, 0, 0, 0]);
      g.velocity([8 * L, 0, 0]);
      s = g.state();
      g.sim.e.sim_contact_at_mat(-1, 0, 0, SURFACE.pvc, s[1], s[2], s[3], 0, 0, 0, 0.12, 0.08, 0);
      g.run(2000);
      const whole = (r, kinds) => kinds.every((k) => !r.broke(k));
      return [
        { name: 'it is the whoop\'s own parts', ok: w.parts.some((p) => p.kindName === 'canopy') && !w.parts.some((p) => p.kindName === 'arm'), detail: `${w.parts.length} parts, mass ${w.parts.reduce((a, p) => a + p.mass, 0).toFixed(3)} kg` },
        { name: 'a wall at a brisk walk breaks nothing', ok: w.events.filter((e) => e.typeName === 'break').length === 0, detail: w.summary() },
        { name: 'head height onto a hard floor breaks nothing', ok: f.events.filter((e) => e.typeName === 'break').length === 0, detail: f.summary() },
        { name: 'full speed into a gate side: frame and motors whole', ok: whole(g, ['motor']), detail: g.summary() },
      ];
    },
  },
];

export async function runScenario(loadSim, wasmBytes, configText, sc) {
  const rigs = [];
  const mk = async (opts) => {
    const r = await Rig.create(loadSim, wasmBytes, configText, opts);
    rigs.push(r);
    return r;
  };
  const checks = await sc.run(mk);
  /* Every module the scenario flew, in the order it made them: the
   * digests the Node and Chrome runs are held to. */
  return { checks, digests: rigs.map((r) => r.digest.hex()) };
}

/* Every scenario's digests, one string, for the Node and Chrome runs. */
export async function allDigests(loadSim, wasmBytes, configText) {
  const out = [];
  for (const sc of CRASH_SCENARIOS) {
    const r = await runScenario(loadSim, wasmBytes, configText, sc);
    out.push(`${sc.name}: ${r.digests.join(' ')}`);
  }
  return out;
}
