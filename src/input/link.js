import { str } from '../strings/index.js';
/*
 * link.js: the radio between the pilot's sticks and sim_input.
 *
 * A real control link does not deliver every stick reading on an exact
 * grid. Packets leave at the link's own rate, take a few milliseconds to
 * cross, wobble by a fraction of that, and now and then never arrive.
 * Betaflight's feedforward and RC smoothing both work from the packet
 * timing, so a link that is too clean flies too clean. This module models
 * the radio as the shell's last step before the flight controller.
 *
 * It sits outside the WASM module on purpose. The module promises a bit
 * identical trace for a given input stream; the link only decides what that
 * stream is. A recording captures what reached sim_input, so it replays
 * exactly whatever link produced it.
 *
 * Randomness is a seeded xorshift32, rewound on every reset, so the same
 * seed and the same sticks give the same packets on any machine. Each slot
 * is decided once, at the moment it is sampled, and then waits in flight
 * until its arrival time falls inside a pumped block; that keeps the stream
 * independent of how the render batches its frames.
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

/*
 * Each preset: packet rate (Hz), mean transport delay (ms), the half width
 * of a uniform jitter band around it (ms), and lost packets per million.
 * 'perfect' is no radio at all, the default, so that a record never moves
 * because somebody shipped a link model.
 */
const preset = (label, hz, delayMs, jitterMs, lossPpm) => ({ label, hz, delayMs, jitterMs, lossPpm });

export const LINK_PRESETS = {
  perfect: preset(str('link.perfect_no_radio'), 250, 0, 0, 0),
  elrs500: preset(str('link.elrs_500_hz'), 500, 3, 0.4, 200),
  elrs250: preset(str('link.elrs_250_hz'), 250, 4, 0.8, 400),
  elrs150: preset(str('link.elrs_150_hz'), 150, 6, 1.4, 800),
  crossfire: preset(str('link.crossfire_150_hz'), 150, 7.5, 1.8, 1200),
};

export const LINK_DEFAULT = 'perfect';

export function linkPreset(id) {
  return LINK_PRESETS[id] ?? LINK_PRESETS[LINK_DEFAULT];
}

const UINT32 = 4294967296;

export class RcLink {
  constructor(presetId = LINK_DEFAULT, seed = 0x9E3779B9) {
    this.startSeed = seed >>> 0;
    this.setPreset(presetId);
    this.sigDelayMs = 0;
    this.sigLossPpm = 0;
    this.failsafeRc = null;
    this.reset(0);
  }

  /* Changes the radio's numbers only. The clock, the generator and any
   * packet already in the air carry on, as they would on a real link that
   * renegotiated its rate. */
  setPreset(presetId) {
    const known = Boolean(LINK_PRESETS[presetId]);
    const { hz, delayMs, jitterMs, lossPpm } = linkPreset(presetId);
    Object.assign(this, { id: known ? presetId : LINK_DEFAULT, hz, delayMs, jitterMs, lossPpm, periodMs: 1000 / hz });
  }

  /*
   * What the radio's reach is doing to the link right now, from
   * src/game/signal.js, set by the shell once a frame:
   *   delayMs     how much older the sticks in each packet are
   *   lossPpm     extra loss on top of the preset's; 1e6 means nothing gets through
   *   failsafeRc  the receiver's own failsafe sticks while the link is down, or null
   *   atMs        the shell's RC slot clock at this moment
   *
   * The delay ages the payload instead of delaying arrival. Delaying arrival
   * would let fresh packets overtake stale ones the moment the delay
   * closed, and the flight controller would end on the stale sticks.
   *
   * While the link is perfect the shell runs its own slot grid and never
   * pumps this one, so on the frame a signal first makes it imperfect the
   * link picks the shell's clock up from atMs. A signal of all zeroes and
   * null changes nothing and draws nothing.
   */
  setSignal(delayMs, lossPpm, failsafeRc, atMs) {
    const shellClock = this.isPerfect();
    this.sigDelayMs = delayMs;
    this.sigLossPpm = lossPpm;
    this.failsafeRc = failsafeRc;
    if (shellClock && !this.isPerfect()) {
      this.nextMs = atMs;
    }
  }

  /* Rewinds to the start of a run at `atMs` on the sim clock. The signal is
   * left alone; the shell sets it again on the next frame. */
  reset(atMs) {
    this.rngState = this.startSeed;
    this.nextMs = atMs;
    this.pending = [];
    this.sent = 0;
    this.dropped = 0;
  }

  /* The shell skips the link entirely when this holds, so it must be exact. */
  isPerfect() {
    return this.delayMs === 0 && this.jitterMs === 0 && this.lossPpm === 0
      && this.sigDelayMs === 0 && this.sigLossPpm === 0 && this.failsafeRc === null;
  }

  /* xorshift32 (13, 17, 5), as a fraction in [0, 1). The middle shift is
   * the sign-propagating one, on the int32 the first xor leaves. That is
   * not textbook xorshift, but it is the stream every preset has always
   * flown and link-trace-selftest pins it, so it stays. */
  draw() {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / UINT32;
  }

  /* Decides one slot: lost, or in the air with its arrival time. Draws are
   * only spent on the parts of the model that are switched on, so a link
   * with no loss and no jitter consumes nothing. The preset's loss and the
   * signal's are independent chances, combined so that with no signal the
   * threshold is the preset's own number exactly. */
  decide(slotMs, pick) {
    this.sent += 1;
    if (this.failsafeRc !== null) {
      this.pending.push({ tMs: slotMs, rc: this.failsafeRc });
      return;
    }
    const a = this.lossPpm;
    const b = this.sigLossPpm;
    const lossPpm = a + b - (a * b) / 1e6;
    if (lossPpm > 0 && this.draw() * 1e6 < lossPpm) {
      this.dropped += 1;
      return;
    }
    const wobble = this.jitterMs > 0 ? (this.draw() * 2 - 1) * this.jitterMs : 0;
    this.pending.push({ tMs: slotMs + this.delayMs + wobble, rc: pick(slotMs - this.sigDelayMs) });
  }

  /*
   * Everything that has arrived by `blockEndMs`, as { tMs, rc } in arrival
   * order, which is the order sim_input requires and the order a receiver
   * hands frames over. `pick(atMs)` answers with the sticks the transmitter
   * held at that moment; under a signal delay it may be asked about a
   * moment before one it already answered and must give what it holds.
   */
  pump(blockEndMs, pick) {
    while (this.nextMs < blockEndMs) {
      this.decide(this.nextMs, pick);
      this.nextMs += this.periodMs;
    }
    this.pending.sort((p, q) => p.tMs - q.tMs);
    let due = 0;
    while (due < this.pending.length && this.pending[due].tMs <= blockEndMs) {
      due += 1;
    }
    return this.pending.splice(0, due);
  }
}
