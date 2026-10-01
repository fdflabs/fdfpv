/*
 * warhud.js: the war mode's head up display (docs/WARFARE-PLAN.md section
 * 5.2): the plant's output in megawatts as one big bar that falls red as
 * targets are hit, the wave, the rack of airframes left, this pilot's
 * kills, and short callouts as text under the voice ("STRIKERS LOW OVER THE RESERVOIR", "INTAKE 7 HIT: -700 MW").
 * This pilot's own kill is called big in the middle of the picture
 * ("SPLASH ONE", "SPLASH 3") and fades; a teammate's is one line of the
 * callouts. At the go a line says how a warhead goes off.
 *
 * Styled as a military display over FPV video: monospace capitals, a
 * phosphor green on a dark scrim that holds over snow and sky alike, amber
 * and red kept for what needs the pilot now. WHERE IT SITS is what the
 * rest of the flight screen leaves: the top left corner is the room's
 * (src/ui/peermarks.js draws its notice and a line for each pilot not
 * flying there, eight rows at most in a private room), the top right is
 * the markers' radar, and the markers' edge arrows run round the picture
 * EDGE_PX in with their words inside them (src/ui/warmarkers.js), and
 * with the FPV OSD up its horizon's sidebars stand 0.37 of the height
 * either side of the middle (src/ui/fpvhud.js, the PAL grid kept to the
 * height). So it sits on the left under the room's lines, inside the
 * arrows' band and short of the sidebars;
 * scripts/war-hud-layout.js holds it to that at 1280x720 and 1920x1080.
 * The callouts take the upper middle, the one place nothing else of the
 * flight screen uses.
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
import { allowanceOf, roundOf, spentOf } from './warround.js';
import en from '../strings/en.js';

const GREEN = '#7dff9a';
const AMBER = '#ffb020';
const RED = '#ff4a3a';
const DIM = 'rgba(125, 255, 154, 0.35)';
const SCRIM = 'rgba(4, 10, 6, 0.55)';
const CALL_MS = 4500;
const CALLS_SHOWN = 3;
/* The display's top, under the room's lines at their longest (see the
 * header), and its left, inside the left edge arrows and their words
 * (warmarkers.js EDGE_PX 46, the words 34 further in and up to about 45
 * either side). */
const TOP = 'max(300px, 40vh)';
const LEFT = '132px';
/* Its width, short of the OSD's left sidebar by 10 px (see the header),
 * never under what its lines need. */
const WIDTH = 'clamp(220px, calc(50vw - 37vh - 142px), 380px)';
/* The rack is drawn as pips up to this many, a count past it. */
const PIPS_MAX = 24;
/* A round's own airframes drawn as pips up to this many. */
const PIPS_ROUND = 6;

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

/* The callout for an attacker that flew into a power line: what it was
 * (a decoy is called as the Striker it looks like). */
export function wireCall(ev) {
  const a = ev.agents && ev.agents[0];
  const kind = a && a.kind === 'decoy' ? 'strike' : a && a.kind;
  const key = `war.wire.${kind}`;
  return str(key in en ? key : 'war.wire.other');
}

/* m:ss, for the wave clock. */
function clock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/*
 * What happens next, as { text, s }, whenever a war is on: the go
 * (briefing and countdown), the next wave in a live round, that the
 * round's waves are all out, or the next round after a round's result;
 * s the seconds to it, or null with no clock. Never nothing while a war
 * is on: a next event this screen cannot time (a view without its clock,
 * a mission this build does not have) says so in words, since a blank
 * line read as "nothing is coming" (the owner, 2026-10-01). null only
 * with no war on. roundAt comes from the room's view; a room from before
 * it knows only the first round's.
 */
export function waveStatus(v, mission, roomNow) {
  const unknown = { text: str('war.next_unknown'), s: null };
  const at = (key, t) => {
    const s = Math.ceil((t - roomNow) / 1000);
    return { text: str(key, { t: clock(Math.max(0, s)) }), s: Math.max(0, s) };
  };
  if (v.state === 'briefing' || v.state === 'countdown') {
    return Number.isFinite(v.goAt) ? at('war.engage_in', v.goAt) : unknown;
  }
  if (v.state !== 'live') {
    return null;
  }
  if ((v.roundState ?? 'live') === 'result') {
    return Number.isFinite(v.nextRoundAt) ? at('war.next_round', v.nextRoundAt) : unknown;
  }
  if (!mission) {
    return unknown;
  }
  const r = (v.round ?? 1) - 1;
  const roundAt = v.roundAt ?? (r === 0 ? v.goAt : null);
  const next = mission.waves[v.wave];
  if (next && (next.round ?? 0) === r) {
    if (!Number.isFinite(roundAt)) {
      return unknown;
    }
    const s = Math.ceil((roundAt + next.at * 1000 - roomNow) / 1000);
    return s > 0 ? { text: str('war.next_wave', { t: clock(s) }), s } : { text: str('war.wave_inbound'), s: 0 };
  }
  return { text: str(v.alive > 0 ? 'war.last_wave' : 'war.round_clear'), s: null };
}

/*
 * nameOf(seat) is the seat's picker name, or this pilot's own. restart
 * { host(), go(v) }: whether this pilot hosts the room, and what the
 * end banner's button does.
 */
export function createWarHud(nameOf, restart = null) {
  let box = null;
  let outLabel = null;
  let outFill = null;
  let outLost = null;
  let outFloor = null;
  let outText = null;
  let line = null;
  let calls = null;
  let banner = null;
  let status = null;
  let again = null;
  let lastView = null;
  let shown = '';
  let lostOutput = 0;
  const said = [];
  /* The big centred kill call and the start's hint, over the picture's
   * middle, each built when first shown. */
  let splashEl = null;
  /* Under the splash, in rounds: the airframes the kill earned. */
  let earnedEl = null;
  /* This pilot's allowance at the last update, to pulse the pips when a
   * kill grows it; and whether the view plays rounds. */
  let allowWas = null;
  let inRounds = false;
  let pipsPulse = 0;
  let splashSeen = false;
  let hintEl = null;
  let hintTimer = 0;
  let killsPulse = 0;
  /* Every root built, and whether they are drawn: see drawn(). */
  const roots = [];
  let drawnNow = true;

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
    d.style.visibility = drawnNow ? '' : 'hidden';
    roots.push(d);
    document.body.append(d);
    return d;
  }

  /*
   * Whether any of it is drawn: only over the flight screen. The callouts,
   * the kill and the go's hint arrive with the room's events whatever
   * screen is up, and each shows for seconds on its own timer, so without
   * this they were drawn over the pause menu, the room screen and the
   * title. Hidden, not dropped: said() still has them.
   */
  function drawn(on) {
    if (on === drawnNow) {
      return;
    }
    drawnNow = on;
    for (const d of roots) {
      d.style.visibility = on ? '' : 'hidden';
    }
  }

  function build() {
    box = root({
      position: 'fixed', top: TOP, left: LEFT, width: WIDTH, zIndex: '40', pointerEvents: 'none',
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
    status = el({
      background: SCRIM, border: `1px solid ${DIM}`, padding: '4px 10px', fontSize: '18px', fontWeight: '800', display: 'none',
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
    banner.append(document.createTextNode(''));
    again = el({
      marginTop: '16px', fontSize: '20px', letterSpacing: '0.12em', padding: '10px 22px', cursor: 'pointer',
      background: GREEN, color: '#04100a', textShadow: 'none', pointerEvents: 'auto',
    }, banner);
    again.className = 'war-restart';
    again.addEventListener('click', () => {
      if (restart && restart.host() && lastView) {
        restart.go(lastView);
      }
    });
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

  /* This pilot's own kill, big in the middle of the picture, fading:
   * "SPLASH ONE", "SPLASH 3". The KILLS cell pulses with it. */
  function splash(text) {
    if (!splashEl) {
      splashEl = root({
        position: 'fixed', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '43', pointerEvents: 'none',
        fontWeight: '900', fontSize: 'clamp(40px, 7vw, 88px)', letterSpacing: '0.16em', color: AMBER, whiteSpace: 'nowrap',
        textShadow: '0 0 18px rgba(255, 120, 20, 0.85), 0 0 4px rgba(0, 0, 0, 0.95), 0 3px 4px rgba(0, 0, 0, 0.95)',
        opacity: '0',
      });
      splashEl.className = 'war-splash';
    }
    said.push(text);
    if (said.length > 40) {
      said.shift();
    }
    splashSeen = true;
    splashEl.textContent = text;
    splashEl.getAnimations().forEach((a) => a.cancel());
    splashEl.animate([
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.08 },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1.05)' },
    ], { duration: 2600, easing: 'ease-out' });
    killsPulse = performance.now() + 1500;
    shown = '';
  }

  /* "+1 AIRFRAME", "+3 AIRFRAMES" under the splash, with it. */
  function earned(n) {
    if (!earnedEl) {
      earnedEl = root({
        position: 'fixed', top: 'calc(42% + clamp(40px, 7vw, 88px) * 0.75)', left: '50%', transform: 'translateX(-50%)', zIndex: '43',
        pointerEvents: 'none', fontWeight: '900', fontSize: 'clamp(18px, 2.6vw, 30px)', letterSpacing: '0.16em', color: GREEN,
        whiteSpace: 'nowrap', textShadow: '0 0 12px rgba(125, 255, 154, 0.7), 0 0 4px rgba(0, 0, 0, 0.95), 0 2px 3px rgba(0, 0, 0, 0.95)',
        opacity: '0',
      });
      earnedEl.className = 'war-earned';
    }
    earnedEl.textContent = plural('war.earned', n);
    said.push(earnedEl.textContent);
    earnedEl.getAnimations().forEach((a) => a.cancel());
    earnedEl.animate([
      { opacity: 0 },
      { opacity: 1, offset: 0.1 },
      { opacity: 1, offset: 0.7 },
      { opacity: 0 },
    ], { duration: 2600, easing: 'ease-out' });
  }

  /* One centred line for `ms`, as at the go: how a warhead goes off. */
  function hint(text, ms = 6000) {
    if (!hintEl) {
      hintEl = root({
        position: 'fixed', top: '60%', left: '50%', transform: 'translateX(-50%)', zIndex: '41', pointerEvents: 'none',
        fontWeight: '800', fontSize: '20px', letterSpacing: '0.1em', color: GREEN, textAlign: 'center', maxWidth: '86vw',
        background: SCRIM, border: `1px solid ${DIM}`, padding: '6px 16px', textTransform: 'uppercase',
        textShadow: '0 0 6px rgba(0, 0, 0, 0.95)', display: 'none',
      });
      hintEl.className = 'war-hint';
    }
    hintEl.textContent = text;
    hintEl.style.display = 'block';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintEl.style.display = 'none';
    }, ms);
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
        if (ev.mine) {
          splash(plural('war.kill_mine', ev.ids.length));
          if (inRounds) {
            earned(ev.ids.length);
          }
        } else {
          say(plural('war.kill_by', ev.ids.length, { name: nameOf(ev.by) }));
        }
      } else if (ev.type === 'dead' && ev.why === 'wire') {
        say(wireCall(ev));
      } else if (ev.type === 'boom' && ev.mine) {
        say(str('war.boom_mine'), 'warn');
      } else if (ev.type === 'scouts') {
        say(str('war.scouts_down'));
      }
    }
  }

  function endText(v) {
    if (v.state === 'won') {
      return str('war.won');
    }
    if (v.state === 'lost') {
      return str('war.lost_output', { floor: mw(v.floor) });
    }
    return str('war.ended');
  }

  /*
   * A few times a second. v is roomwar's view(), me this pilot's seat,
   * roomNow the room clock, full the mission's output at the go (roomwar
   * mission().output), the bar's whole length; mission roomwar's
   * mission(), for the wave clock.
   */
  function update(v, me, roomNow, full, mission = null) {
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
    /* In rounds (src/ui/warround.js) the round and this pilot's own
     * airframes for it stand where the wave and the team's rack were. */
    const round = roundOf(v);
    inRounds = Boolean(round);
    const allow = allowanceOf(round, me);
    const left = allow != null ? Math.max(0, allow - spentOf(round, me)) : null;
    if (allow != null && allowWas != null && allow > allowWas) {
      pipsPulse = performance.now() + 1500;
    }
    allowWas = allow;
    const next = waveStatus(v, mission, roomNow);
    const host = Boolean(restart && restart.host());
    const key = JSON.stringify([next && next.text, host, v.state, v.output, v.floor, v.wave, v.waves, v.alive, v.rack, v.rackMax, mine && mine.kills, countdown, v.why, full, performance.now() - lostOutput < 1500, round && round.n, round && round.of, left, allow]);
    if (key === shown) {
      return;
    }
    shown = key;
    lastView = v;
    box.style.display = 'flex';
    status.style.display = next ? 'block' : 'none';
    if (next) {
      status.textContent = next.text;
      const soon = next.s != null && next.s <= 10;
      status.style.color = next.s === 0 ? RED : (soon ? AMBER : GREEN);
      status.style.borderColor = soon || next.s === 0 ? status.style.color : DIM;
    }
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
    let phase = str('war.wave', { n: Math.min(v.wave, v.waves), of: v.waves });
    if (countdown != null) {
      phase = str('war.countdown', { s: countdown });
    } else if (round) {
      phase = str('war.round', { n: round.n, of: round.of ?? round.n });
    }
    cell(phase, countdown != null ? AMBER : GREEN);
    cell(str('war.contacts', { n: v.alive ?? 0 }), v.alive > 0 ? AMBER : GREEN);
    if (left != null) {
      /* Past PIPS_ROUND the pips would crowd the line: a count instead. */
      const pips = allow <= PIPS_ROUND ? `${'■'.repeat(left)}${'□'.repeat(allow - left)}` : `■×${left}`;
      cell(`${str('war.airframes')} ${pips}`, left <= 1 ? RED : GREEN);
      if (performance.now() < pipsPulse) {
        line.lastChild.animate([
          { color: '#ffffff', textShadow: `0 0 10px ${GREEN}`, transform: 'scale(1.35)' },
          { color: left <= 1 ? RED : GREEN, transform: 'scale(1)' },
        ], { duration: 1200, easing: 'ease-out' });
        line.lastChild.style.display = 'inline-block';
      }
    } else {
      const pips = v.rackMax <= PIPS_MAX ? ` ${'■'.repeat(v.rack)}${'□'.repeat(Math.max(0, v.rackMax - v.rack))}` : '';
      cell(str('war.rack', { n: v.rack, of: v.rackMax }) + pips, v.rack <= 1 ? RED : GREEN);
    }
    cell(str('war.kills', { n: mine ? mine.kills : 0 }));
    if (performance.now() < killsPulse) {
      line.lastChild.animate([
        { color: '#ffffff', textShadow: `0 0 10px ${AMBER}`, transform: 'scale(1.35)' },
        { color: GREEN, transform: 'scale(1)' },
      ], { duration: 1200, easing: 'ease-out' });
      line.lastChild.style.display = 'inline-block';
    }
    const over = v.state === 'won' || v.state === 'lost' || v.state === 'ended';
    banner.style.display = over ? 'block' : 'none';
    if (over) {
      banner.firstChild.nodeValue = endText(v);
      again.textContent = str(host ? 'war.restart' : 'war.restart_wait');
      again.style.cursor = host ? 'pointer' : 'default';
      again.style.background = host ? GREEN : 'transparent';
      again.style.color = host ? '#04100a' : DIM;
      banner.style.pointerEvents = host ? 'auto' : 'none';
      banner.style.color = v.state === 'won' ? GREEN : RED;
      banner.style.borderColor = banner.style.color;
    }
  }

  return {
    say,
    splash,
    hint,
    events,
    update,
    drawn,
    said: () => said.slice(),
    shown: () => ({
      output: outText ? outText.textContent : '',
      fill: outFill ? outFill.style.width : '',
      line: line ? line.textContent : '',
      calls: calls ? [...calls.children].map((c) => c.textContent) : [],
      banner: banner && banner.style.display !== 'none' ? banner.firstChild.nodeValue : '',
      status: status && status.style.display !== 'none' ? status.textContent : '',
      restart: banner && banner.style.display !== 'none' ? again.textContent : '',
      hint: hintEl && hintEl.style.display !== 'none' ? hintEl.textContent : '',
      splashSeen,
    }),
  };
}
