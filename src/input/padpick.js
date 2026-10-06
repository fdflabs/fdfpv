/*
 * padpick.js: which joystick is the pilot's, and the picker that asks.
 *
 * The browser lists pads in the operating system's order, which a pilot
 * cannot rearrange and Windows may shuffle on a replug, so the first pad
 * is only a default. The choice is remembered as the device's id plus its
 * index; a pad with the same id on another index still matches when it is
 * the only one with that id.
 *
 * The roster is polled, not trusted to connect events, because Chrome may
 * hide a pad until something on it moves. A single new pad with no choice
 * made is simply taken; two or more, at boot or on a hotplug, queue the
 * picker; the chosen pad vanishing while another is still plugged in
 * queues it too. The shell takes the queue and opens the screen.
 *
 * The picker asks the pilot to move the one they want. Whichever pad moves
 * furthest from where it rested, for long enough, becomes the candidate,
 * and its own buttons answer: B (button 1) says no and starts a short
 * cooldown during which that pad is ignored until it settles; A, X or Y
 * say yes. Buttons already held when the question appears count only
 * after they have been seen released.
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

import { str } from '../strings/index.js';
import { loadPadChoice, savePadChoice } from './stickstore.js';

/* How far an axis must leave rest to count as the pilot moving that pad,
 * for how long, and how long a refused pad is ignored afterwards. */
const MOVED = 0.34;
const MOVED_FOR_MS = 160;
const REFUSED_COOLDOWN_MS = 450;

/* Only the first eight axes are watched anywhere: past that they are
 * switches and pots. */
const AXES_WATCHED = 8;

/* Connected devices with at least four axes; anything less cannot fly. */
export function connectedPads() {
  const reported = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  /* Chrome's list has null holes where a pad was unplugged. */
  const flyable = (gp) => Boolean(gp && gp.connected && gp.axes && gp.axes.length >= 4);
  return Array.from(reported).filter(flyable);
}

export const padKey = (gp) => `${gp.index}\0${gp.id || ''}`;

export function watchedAxes(gp) {
  return Array.from({ length: Math.min(gp.axes.length, AXES_WATCHED) }, (_, i) => gp.axes[i]);
}

/* The largest distance of any axis from its rest, over the axes both have.
 * An axis reading NaN is ignored rather than poisoning the answer. */
export function furthestFromRest(axes, rest) {
  let far = 0;
  for (let i = 0; i < Math.min(axes.length, rest.length); i += 1) {
    const d = Math.abs(axes[i] - rest[i]);
    if (d > far) {
      far = d;
    }
  }
  return far;
}

/* A device id as a person would say it: whitespace tidied, the "(Vendor:
 * ...)" tail dropped unless that leaves almost nothing, and long names
 * shortened. */
export function shortPadName(id) {
  const fallback = str('input.joystick_3');
  const raw = String(id || fallback);
  const tidy = raw.replace(/\s+/g, ' ').trim().replace(/\s*\(Vendor:.*$/i, '').trim();
  const name = tidy.length >= 4 ? tidy : (raw.trim() || fallback);
  return name.length > 44 ? `${name.slice(0, 42)}...` : name;
}

export class PadRoster {
  /* `onChoice` runs whenever the chosen device changes, so what was learned
   * about the old one can be forgotten. */
  constructor(onChoice) {
    this.onChoice = onChoice;
    this.choice = loadPadChoice();
    this.seen = new Set();
    this.present = false;
    this.queued = null;
    this.pick = null;
    this.result = null;
  }

  setChoice(choice) {
    this.choice = choice;
    savePadChoice(choice);
    this.onChoice();
  }

  chooseDevice(gp) {
    this.setChoice({ kind: 'pad', id: gp.id, index: gp.index });
  }

  /* The chosen device among `pads`: id and index, else the only pad with
   * that id. */
  match(pads) {
    const c = this.choice;
    if (!c || c.kind !== 'pad') {
      return null;
    }
    const exact = pads.find((gp) => gp.id === c.id && gp.index === c.index);
    if (exact) {
      return exact;
    }
    const sameName = pads.filter((gp) => gp.id === c.id);
    return sameName.length === 1 ? sameName[0] : null;
  }

  /* The pad in use: none when the pilot chose the keyboard or their pad is
   * absent, the first pad when no choice was made. */
  selected() {
    const pads = connectedPads();
    if (!pads.length) {
      return null;
    }
    const kind = this.choice && this.choice.kind;
    if (kind === 'none') {
      return null;
    }
    return kind === 'pad' ? this.match(pads) : pads[0];
  }

  /* What is plugged in when the page opens. */
  seed() {
    const pads = connectedPads();
    this.seen = new Set(pads.map(padKey));
    this.present = Boolean(this.match(pads));
    if (pads.length >= 2) {
      this.queued = 'boot';
    } else if (pads.length === 1 && !this.match(pads)) {
      this.chooseDevice(pads[0]);
      this.present = true;
    }
  }

  /* Every poll: new devices, and whether the chosen one is still here. */
  track() {
    const pads = connectedPads();
    const keys = new Set(pads.map(padKey));
    const arrived = [...keys].filter((k) => !this.seen.has(k)).length;
    const hadAny = this.seen.size > 0;
    this.seen = keys;
    if (this.pick) {
      return;
    }
    if (arrived && pads.length >= 2) {
      this.queued = hadAny ? 'hotplug' : 'boot';
      return;
    }
    if (arrived && pads.length === 1 && !this.match(pads)) {
      this.chooseDevice(pads[0]);
    }
    if (!this.choice || this.choice.kind !== 'pad') {
      return;
    }
    if (this.match(pads)) {
      this.present = true;
      return;
    }
    if (this.present && pads.length >= 1) {
      this.queued = this.queued || 'missing';
    }
    this.present = false;
  }

  /* The reason the picker should open, once. */
  take() {
    const reason = this.queued;
    this.queued = null;
    return reason;
  }

  request(reason) {
    if (!this.pick) {
      this.queued = reason || 'menu';
    }
  }

  start(reason) {
    const pads = connectedPads();
    if (!pads.length) {
      return false;
    }
    this.pick = {
      reason: reason || 'menu',
      phase: 'wiggle',
      candidate: null,
      refused: null,
      quietUntil: 0,
      movedMs: 0,
      armed: false,
      rests: new Map(),
    };
    this.result = null;
    this.learnRests(pads);
    return true;
  }

  backToWiggle() {
    Object.assign(this.pick, {
      phase: 'wiggle', candidate: null, movedMs: 0, armed: false,
    });
  }

  /* A rest for every pad that has none yet (or whose axis count changed),
   * and none for pads that are gone; a candidate that left is dropped. */
  learnRests(pads = connectedPads()) {
    const p = this.pick;
    if (!p) {
      return;
    }
    const here = new Set();
    for (const gp of pads) {
      const key = padKey(gp);
      here.add(key);
      const rest = p.rests.get(key);
      if (!rest || rest.length !== Math.min(gp.axes.length, AXES_WATCHED)) {
        p.rests.set(key, watchedAxes(gp));
      }
    }
    for (const key of [...p.rests.keys()]) {
      if (here.has(key)) {
        continue;
      }
      p.rests.delete(key);
      if (p.candidate === key) {
        this.backToWiggle();
      }
    }
  }

  close(result) {
    this.pick = null;
    this.result = result;
  }

  cancel() {
    this.close('cancelled');
  }

  skip() {
    this.setChoice({ kind: 'none' });
    this.present = false;
    this.close('skipped');
  }

  accept() {
    const p = this.pick;
    if (!p || p.phase !== 'confirm' || !p.candidate) {
      return false;
    }
    const gp = connectedPads().find((g) => padKey(g) === p.candidate);
    if (!gp) {
      return false;
    }
    this.chooseDevice(gp);
    this.present = true;
    this.close('accepted');
    return true;
  }

  refuse() {
    const p = this.pick;
    if (!p) {
      return;
    }
    const refused = p.candidate;
    this.backToWiggle();
    p.refused = refused;
    p.quietUntil = performance.now() + REFUSED_COOLDOWN_MS;
    this.learnRests();
  }

  view() {
    const p = this.pick;
    if (!p) {
      return null;
    }
    const pads = connectedPads();
    this.learnRests(pads);
    const cards = pads.map((gp, i) => {
      const key = padKey(gp);
      const now = watchedAxes(gp);
      const motion = furthestFromRest(now, p.rests.get(key) || now);
      return {
        key,
        title: str('input.joystick', { v1: i + 1 }),
        name: shortPadName(gp.id),
        motion,
        live: motion >= MOVED,
        chosen: p.candidate === key,
        axes: [0, 1, 2, 3].map((a) => gp.axes[a] || 0),
      };
    });
    const chosen = cards.find((c) => c.chosen) || null;
    const asking = p.phase === 'confirm' && Boolean(chosen);
    let prompt = str('ui.move_the_joystick_you_want_to');
    let hint = str('input.each_box_is_one_plugged_in');
    if (!cards.length) {
      prompt = str('input.no_joystick_found');
      hint = str('input.plug_one_in_set_it_to');
    } else if (asking) {
      prompt = str('input.use', { title: chosen.title });
      hint = str('input.yes_keeps_it_no_waits_for');
    }
    return {
      phase: p.phase,
      reason: p.reason,
      prompt,
      hint,
      canAccept: asking,
      skipLabel: p.reason === 'menu' ? str('ui.cancel') : str('ui.use_keyboard_instead'),
      cooling: performance.now() < p.quietUntil,
      pads: cards,
    };
  }

  /* One poll of the open picker, `dtMs` after the last. */
  run(dtMs) {
    const p = this.pick;
    if (!p) {
      return;
    }
    const pads = connectedPads();
    this.learnRests(pads);
    if (p.phase === 'confirm') {
      this.answer(pads.find((g) => padKey(g) === p.candidate));
      return;
    }
    if (performance.now() < p.quietUntil) {
      p.movedMs = 0;
      return;
    }
    let best = null;
    let bestMotion = 0;
    for (const gp of pads) {
      const key = padKey(gp);
      const rest = p.rests.get(key);
      if (!rest) {
        continue;
      }
      const motion = furthestFromRest(watchedAxes(gp), rest);
      if (key === p.refused) {
        if (motion >= MOVED) {
          continue;
        }
        p.refused = null;
      }
      if (motion > bestMotion) {
        best = key;
        bestMotion = motion;
      }
    }
    if (!best || bestMotion < MOVED) {
      p.movedMs = 0;
      return;
    }
    p.movedMs += dtMs;
    if (p.movedMs >= MOVED_FOR_MS) {
      Object.assign(p, {
        phase: 'confirm', candidate: best, movedMs: 0, armed: false,
      });
    }
  }

  /* The candidate's buttons: B refuses, A, X or Y accept, and nothing
   * counts until they have all been seen up. */
  answer(gp) {
    const p = this.pick;
    if (!gp) {
      this.refuse();
      return;
    }
    const pressed = [0, 1, 2, 3].map((i) => Boolean(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed));
    if (!p.armed) {
      p.armed = !pressed.some(Boolean);
      return;
    }
    if (pressed[1]) {
      this.refuse();
    } else if (pressed[0] || pressed[2] || pressed[3]) {
      this.accept();
    }
  }
}
