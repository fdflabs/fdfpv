/*
 * warhud.js: the war mode's head up display (docs/WARFARE-PLAN.md section
 * 5.2): the plant's output in megawatts as one big bar that falls red as
 * targets are hit, the wave, the rack of airframes left, this pilot's
 * kills, and short callouts as text under the voice ("STRIKERS LOW OVER THE RESERVOIR", "INTAKE 7 HIT: -700 MW").
 *
 * Styled as a military display over FPV video: monospace capitals, a
 * phosphor green on a dark scrim that holds over snow and sky alike, amber
 * and red kept for what needs the pilot now. It sits where combat's does
 * (src/ui/combathud.js), top left under the world's name; the callouts
 * take the upper middle, the one place nothing else of the flight screen
 * uses.
 *
 * It reads the room's view (src/share/roomwar.js view()) and the events
 * roomwar hands the shell once each.
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

import { plural, str } from '../strings/index.js';
import en from '../strings/en.js';

const GREEN = '#7dff9a';
const AMBER = '#ffb020';
const RED = '#ff4a3a';
const DIM = 'rgba(125, 255, 154, 0.35)';
const SCRIM = 'rgba(4, 10, 6, 0.55)';
const CALL_MS = 4500;
const CALLS_SHOWN = 3;
/* The rack is drawn as pips up to this many, a count past it. */
const PIPS_MAX = 24;

/* A number of megawatts with a thin space every three digits. */
function mw(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* The callout for a wave's birth: its kind, and where it comes from when
 * the strings know the route; a route they do not know says only the
 * kind, so a mission can add routes before it adds their words. */
export function waveCall(agents) {
  const a = agents[0];
  const where = `war.where.${String(a.route).replace(/[^a-z0-9]/g, '_')}`;
  return plural(`war.call.${a.kind}`, agents.length, { where: where in en ? str(where) : str('war.where.none') });
}

/* The callout for an attacker at its target: hit (with the megawatts it
 * took) or off it. */
export function hitCall(ev) {
  if (!ev.hit) {
    return str('war.miss');
  }
  const m = /^(intake|gate|penstock)-(\d+)$/.exec(ev.target);
  if (m) {
    return str(`war.hit.${m[1]}`, { n: m[2], mw: mw(ev.mw) });
  }
  return str(ev.target === 'yard-right' ? 'war.hit.yard' : 'war.hit.other', { mw: mw(ev.mw) });
}

/* nameOf(seat) is the seat's picker name, or this pilot's own. */
export function createWarHud(nameOf) {
  let box = null;
  let outLabel = null;
  let outFill = null;
  let outLost = null;
  let outFloor = null;
  let outText = null;
  let line = null;
  let calls = null;
  let banner = null;
  let shown = '';
  let lostOutput = 0;
  const said = [];

  function el(style, parent) {
    const d = document.createElement('div');
    Object.assign(d.style, style);
    if (parent) {
      parent.append(d);
    }
    return d;
  }

  /* A root of the display, in the display's monospace. */
  function root(style) {
    const d = el(style);
    d.style.fontFamily = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    document.body.append(d);
    return d;
  }

  function build() {
    box = root({
      position: 'fixed', top: '60px', left: '16px', width: 'min(420px, 46vw)', zIndex: '40', pointerEvents: 'none',
      fontWeight: '700', fontSize: '14px', color: GREEN, letterSpacing: '0.08em', textTransform: 'uppercase',
      textShadow: '0 0 4px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.9)',
      display: 'flex', flexDirection: 'column', gap: '6px',
    });
    box.className = 'war-hud';
    const out = el({ background: SCRIM, border: `1px solid ${DIM}`, padding: '6px 10px 8px' }, box);
    const head = el({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }, out);
    outLabel = el({ fontSize: '13px' }, head);
    outText = el({ fontWeight: '800', fontSize: '22px', letterSpacing: '0.02em' }, head);
    const bar = el({
      position: 'relative', height: '18px', marginTop: '4px', background: 'rgba(125, 255, 154, 0.08)', border: `1px solid ${DIM}`,
    }, out);
    outFill = el({ position: 'absolute', left: '0', top: '0', bottom: '0', background: GREEN, transition: 'width 0.6s ease-out' }, bar);
    outLost = el({ position: 'absolute', top: '0', bottom: '0', background: RED, opacity: '0.75', transition: 'left 0.6s ease-out, width 0.6s ease-out' }, bar);
    outFloor = el({ position: 'absolute', top: '-4px', bottom: '-4px', width: '2px', background: AMBER }, bar);
    line = el({
      display: 'flex', gap: '14px', flexWrap: 'wrap', background: SCRIM, border: `1px solid ${DIM}`, padding: '4px 10px',
    }, box);
    calls = root({
      position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: '41', pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '80vw',
      fontWeight: '800', fontSize: '22px', letterSpacing: '0.12em', color: GREEN, textAlign: 'center',
      textShadow: '0 0 6px rgba(0, 0, 0, 0.95), 0 2px 3px rgba(0, 0, 0, 0.95)',
    });
    calls.className = 'war-calls';
    banner = root({
      position: 'fixed', top: '34%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '42', pointerEvents: 'none', display: 'none',
      fontWeight: '900', fontSize: '44px', letterSpacing: '0.14em', color: GREEN, background: 'rgba(4, 10, 6, 0.7)',
      border: `2px solid ${GREEN}`, padding: '14px 30px', textAlign: 'center', whiteSpace: 'pre-line',
    });
    banner.className = 'war-banner';
  }

  /* One callout under the voice, for a while; `tone` 'warn' or 'bad'
   * colours it. */
  function say(text, tone = '') {
    if (!box) {
      build();
    }
    said.push(text);
    if (said.length > 40) {
      said.shift();
    }
    const d = el({ background: 'rgba(4, 10, 6, 0.5)', padding: '2px 12px', color: tone === 'bad' ? RED : (tone === 'warn' ? AMBER : GREEN) }, calls);
    d.textContent = text;
    while (calls.children.length > CALLS_SHOWN) {
      calls.firstChild.remove();
    }
    setTimeout(() => d.remove(), CALL_MS);
  }

  /* roomwar's takeEvents(), in order. */
  function events(list) {
    for (const ev of list) {
      if (ev.type === 'born') {
        say(waveCall(ev.agents), 'warn');
      } else if (ev.type === 'dead' && ev.why === 'arrive' && ev.target) {
        if (ev.hit && ev.mw > 0) {
          lostOutput = performance.now();
        }
        say(hitCall(ev), ev.hit ? 'bad' : '');
      } else if (ev.type === 'dead' && ev.why === 'boom') {
        say(ev.mine ? plural('war.kill_mine', ev.ids.length) : plural('war.kill_by', ev.ids.length, { name: nameOf(ev.by) }));
      } else if (ev.type === 'boom' && ev.mine) {
        say(str('war.boom_mine'), 'warn');
      }
    }
  }

  function endText(v) {
    if (v.state === 'won') {
      return str('war.won');
    }
    if (v.state === 'lost') {
      return v.why === 'rack' ? str('war.lost_rack') : str('war.lost_output', { floor: mw(v.floor) });
    }
    return str('war.ended');
  }

  /*
   * A few times a second. v is roomwar's view(), me this pilot's seat,
   * roomNow the room clock, full the mission's output at the go (roomwar
   * mission().output), the bar's whole length.
   */
  function update(v, me, roomNow, full) {
    if (!v || v.state === 'lobby' || roomNow == null) {
      if (box && shown !== '') {
        box.style.display = 'none';
        banner.style.display = 'none';
        calls.replaceChildren();
        shown = '';
      }
      return;
    }
    if (!box) {
      build();
    }
    const mine = (v.scores || []).find((r) => r.seat === me);
    const countdown = v.state === 'countdown' ? Math.max(0, Math.ceil((v.goAt - roomNow) / 1000)) : null;
    const key = JSON.stringify([v.state, v.output, v.floor, v.wave, v.waves, v.alive, v.rack, v.rackMax, mine && mine.kills, countdown, v.why, full, performance.now() - lostOutput < 1500]);
    if (key === shown) {
      return;
    }
    shown = key;
    box.style.display = 'flex';
    outLabel.textContent = str('war.output');
    outText.textContent = str('war.output_mw', { mw: mw(v.output) });
    const low = v.output < v.floor * 1.25;
    outText.style.color = low ? RED : GREEN;
    const frac = full > 0 ? v.output / full : 0;
    outFill.style.width = `${(frac * 100).toFixed(2)}%`;
    outFill.style.background = low ? AMBER : GREEN;
    outLost.style.left = `${(frac * 100).toFixed(2)}%`;
    outLost.style.width = `${((1 - frac) * 100).toFixed(2)}%`;
    outLost.style.opacity = performance.now() - lostOutput < 1500 ? '1' : '0.55';
    outFloor.style.left = full > 0 ? `${((v.floor / full) * 100).toFixed(2)}%` : '0';
    line.replaceChildren();
    const cell = (text, color = GREEN) => {
      const c = el({ color }, line);
      c.textContent = text;
    };
    cell(countdown != null ? str('war.countdown', { s: countdown }) : str('war.wave', { n: Math.min(v.wave, v.waves), of: v.waves }), countdown != null ? AMBER : GREEN);
    cell(str('war.contacts', { n: v.alive ?? 0 }), v.alive > 0 ? AMBER : GREEN);
    const pips = v.rackMax <= PIPS_MAX ? ` ${'■'.repeat(v.rack)}${'□'.repeat(Math.max(0, v.rackMax - v.rack))}` : '';
    cell(str('war.rack', { n: v.rack, of: v.rackMax }) + pips, v.rack <= 1 ? RED : GREEN);
    cell(str('war.kills', { n: mine ? mine.kills : 0 }));
    const over = v.state === 'won' || v.state === 'lost' || v.state === 'ended';
    banner.style.display = over ? 'block' : 'none';
    if (over) {
      banner.textContent = endText(v);
      banner.style.color = v.state === 'won' ? GREEN : RED;
      banner.style.borderColor = banner.style.color;
    }
  }

  return {
    say,
    events,
    update,
    said: () => said.slice(),
    shown: () => ({
      output: outText ? outText.textContent : '',
      fill: outFill ? outFill.style.width : '',
      line: line ? line.textContent : '',
      calls: calls ? [...calls.children].map((c) => c.textContent) : [],
      banner: banner && banner.style.display !== 'none' ? banner.textContent : '',
    }),
  };
}
