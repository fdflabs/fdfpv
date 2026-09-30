/*
 * voiceui.js: voice chat on screen (the engine is src/share/voice.js).
 *
 * The room screen's rows: Voice on or off, Talk (push to talk or open
 * mic), Distance voice, and one row a pilot for their volume, where the
 * bottom of the range mutes their voice for this pilot alone. The safety
 * rows above (mute, report) silence a pilot's voice too.
 *
 * Who is speaking: a speaker mark in front of the name wherever it is
 * written over the world (the name tag and the peer marks, which read the
 * tag, src/ui/peermarks.js) and on the pilot's voice row in the room
 * screen. The row's label is marked straight on the page every frame, not
 * by rebuilding the menu, which would close a list the pilot has open. This
 * pilot's own voice going out shows as a small Talking badge.
 *
 * The Talk mode and Distance voice are kept in localStorage; whether voice
 * is on is not, so a reload starts with it off, as a new page does.
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

import { PTT_KEY, PTT_PAD, VOLUME_MAX, VOLUME_STEP } from '../share/voice.js';
import { str } from '../strings/index.js';

const PREFS_KEY = 'fdfpv.voice';
export const SPEAKING_MARK = '\u{1F50A}';
const ROW_PREFIX = 'voice-peer-';
/* A pilot's volume, Muted to VOLUME_MAX in VOLUME_STEPs. */
const LEVELS = Array.from({ length: Math.round(VOLUME_MAX / VOLUME_STEP) + 1 }, (_, i) => i * VOLUME_STEP);
const STATE_KEYS = { connecting: 'voicechat.peer_connecting', failed: 'voicechat.peer_failed', off: 'voicechat.peer_off' };

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch (e) {
    return {};
  }
}

function writePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (e) {
    /* Storage refused: the choice lasts this page. */
  }
}

/* The key's letter as the pilot presses it: KeyN is N. */
function keyName(code) {
  return code.replace(/^Key/, '');
}

/*
 * How often the talk key, the mutes and the levels are read: on a timer of
 * its own rather than the render loop's frame, which stops while a world
 * loads, and a pilot who lets go of the key then must stop sending then.
 */
export const TICK_MS = 50;

/* voice: the engine; input: the shell's (src/input/input.js), for the
 * talk key and the pad; changed(): the room screen should be redrawn. */
export function createVoiceUi(voice, input, changed) {
  const prefs = readPrefs();
  voice.setMode(prefs.mode === 'open' ? 'open' : 'ptt');
  voice.setDistance(prefs.distance === true);
  let busy = false;
  /* The links' states as last drawn: a change redraws the room screen. */
  let drawn = '';
  let badge = null;
  /* [{ seat, dist }] as the render loop last saw the room. */
  let peers = [];

  function showBadge(on) {
    if (!badge) {
      if (!on) {
        return;
      }
      badge = document.createElement('div');
      badge.className = 'voice-badge';
      Object.assign(badge.style, {
        position: 'fixed', left: '16px', bottom: '84px', zIndex: '40', pointerEvents: 'none',
        font: '700 14px system-ui, sans-serif', color: '#0c0e12', background: '#7ee787',
        borderRadius: '4px', padding: '3px 8px',
      });
      badge.textContent = `${SPEAKING_MARK} ${str('voicechat.talking')}`;
      document.body.append(badge);
    }
    badge.style.display = on ? 'block' : 'none';
  }

  async function setOn(want) {
    if (busy) {
      return voice.isOn();
    }
    busy = true;
    try {
      if (want) {
        await voice.enable();
      } else {
        voice.disable();
      }
    } finally {
      busy = false;
      changed();
    }
    return voice.isOn();
  }

  /* A pilot's voice row's label: their name, and how the link stands
   * while it is not up. */
  function peerLabel(seat, name) {
    const state = voice.linkState(seat);
    return state === 'up' ? str('voicechat.peer', { name }) : str('voicechat.peer_state', { name, state: str(STATE_KEYS[state]) });
  }

  function levelLabel(v) {
    return v > 0 ? str('voicechat.peer_volume', { pct: Math.round(v * 100) }) : str('voicechat.peer_muted');
  }

  const ui = {
    setOn,
    /* The room screen's voice rows, under the room's own. */
    rows() {
      const on = voice.isOn();
      const problem = voice.problem();
      const rows = [
        { label: str('voicechat.section'), section: true },
        {
          id: 'voice-on',
          label: str('voicechat.voice'),
          note: problem ? str(`voicechat.${problem}`) : str('voicechat.voice_note'),
          current: on ? 'on' : 'off',
          options: [{ value: 'off', label: str('voicechat.off') }, { value: 'on', label: str('voicechat.on') }],
          pick: (v) => {
            setOn(v === 'on');
          },
        },
      ];
      if (!on) {
        return rows;
      }
      rows.push({
        id: 'voice-talk',
        label: str('voicechat.talk'),
        note: str('voicechat.talk_note', { key: keyName(PTT_KEY) }),
        current: voice.mode(),
        options: [{ value: 'ptt', label: str('voicechat.ptt') }, { value: 'open', label: str('voicechat.open') }],
        pick: (v) => {
          voice.setMode(v);
          prefs.mode = voice.mode();
          writePrefs(prefs);
        },
      }, {
        id: 'voice-distance',
        label: str('voicechat.distance'),
        note: str('voicechat.distance_note'),
        current: voice.distance() ? 'on' : 'off',
        options: [{ value: 'off', label: str('voicechat.off') }, { value: 'on', label: str('voicechat.on') }],
        pick: (v) => {
          voice.setDistance(v === 'on');
          prefs.distance = voice.distance();
          writePrefs(prefs);
        },
      });
      return rows;
    },
    /* A pilot's voice row, under their own row, while voice is on here. */
    peerRows(seat, name) {
      if (!voice.isOn()) {
        return [];
      }
      /* A list, not a stepper: the stepper's value is three characters
       * wide, and 100% is four. Left and right still step it. */
      return [{
        id: `${ROW_PREFIX}${seat}`,
        label: peerLabel(seat, name),
        note: str('voicechat.peer_note'),
        value: levelLabel(voice.volume(seat)),
        current: String(voice.volume(seat)),
        pickOnly: true,
        options: LEVELS.map((v) => ({ value: String(v), label: levelLabel(v) })),
        pick: (v) => voice.setVolume(seat, Number(v)),
        adjust: (d) => {
          const v = voice.volume(seat) + d * VOLUME_STEP;
          voice.setVolume(seat, Math.round(Math.max(0, Math.min(VOLUME_MAX, v)) / VOLUME_STEP) * VOLUME_STEP);
        },
      }];
    },
    /* A peer's name as it is written over the world. */
    label(seat, text) {
      return text && voice.speaking(seat) ? `${SPEAKING_MARK} ${text}` : text;
    },
    /* Once a frame, from the render loop: the pilots in the room and each
     * one's distance from `me` (this aircraft, drawn; null when not
     * flying), for distance voice. roomPeers are main.js's. */
    frame(me, roomPeers) {
      const list = [];
      for (const p of roomPeers) {
        const flying = me && p.last && p.away == null;
        list.push({ seat: p.seat, dist: flying ? Math.hypot(p.last.px - me.x, p.last.py - me.y, p.last.pz - me.z) : null });
      }
      peers = list;
    },
    /* Every TICK_MS: the talk key or the pad's trigger, then the engine's
     * mutes, levels and gains, then the speaking marks. */
    tick() {
      const gp = input.firstGamepad();
      const pad = Boolean(gp && gp.mapping === 'standard' && gp.buttons && gp.buttons[PTT_PAD] && gp.buttons[PTT_PAD].pressed);
      voice.frame(input.keys.has(PTT_KEY) || pad, peers);
      const states = peers.map((p) => `${p.seat}:${voice.linkState(p.seat)}`).join(',');
      if (states !== drawn) {
        drawn = states;
        changed();
      }
      if (!voice.isOn() && !badge) {
        return;
      }
      showBadge(voice.talking());
      for (const row of document.querySelectorAll(`[data-row-id^="${ROW_PREFIX}"]`)) {
        const seat = Number(row.dataset.rowId.slice(ROW_PREFIX.length));
        const label = row.querySelector('.row-label');
        if (label) {
          label.dataset.base ??= label.textContent;
          const next = ui.label(seat, label.dataset.base);
          if (label.textContent !== next) {
            label.textContent = next;
          }
        }
        row.classList.toggle('voice-speaking', voice.speaking(seat));
      }
    },
  };
  setInterval(() => ui.tick(), TICK_MS);
  return ui;
}
