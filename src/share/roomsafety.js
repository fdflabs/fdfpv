/*
 * roomsafety.js: the pilot's side of a room's safety controls (Phase 5,
 * docs/MULTIPLAYER-PLAN.md section 9; the room's side is
 * edge/rooms/safety.js).
 *
 * Quick chat and emotes go out as an index into the fixed lists in
 * src/share/roomwire.js and come in the same way; the words are this
 * page's own string table, in this pilot's language, so nothing another
 * pilot wrote is ever shown. Mute is kept here, by seat, and sent to the
 * room whole each time it changes and after every welcome, so the room
 * stops sending a muted pilot's chat at all; here it also hides their
 * name tag. A report sends a reason index and mutes the pilot reported.
 *
 * What arrives is shown in a short feed at the bottom left, built the
 * first time a line arrives, so a pilot who never joins a room never
 * builds it. Lines are set with textContent, never as markup.
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

import {
  CHAT_PRESETS, EMOTES, REPORT_REASONS, ROOM_NAME_REPORT, chatAllowance, takeChat,
} from './roomwire.js';
import { str } from '../strings/index.js';

const FEED_LINES = 4;
/* Long enough for a young reader to get through a line twice. */
const FEED_MS = 10000;

/*
 * send(obj) puts a message on the room's socket; nameOf(seat) is a seat's
 * picker name in this page's language, or null for a seat not here.
 */
export function createRoomSafety(send, nameOf) {
  const muted = new Set();
  const allowance = chatAllowance(performance.now());
  let feed = null;
  const lines = [];
  /* The last lines shown, for the two page check (window.__rooms). */
  const heard = [];
  /* The last line said about this pilot's own doing, for the menu. */
  let note = null;

  function show(text) {
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'room-feed';
      Object.assign(feed.style, {
        position: 'fixed', left: '16px', bottom: '112px', maxWidth: '46vw', zIndex: '40',
        pointerEvents: 'none', font: '600 15px system-ui, sans-serif', color: '#ffe7a3',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)', display: 'flex', flexDirection: 'column', gap: '4px',
      });
      document.body.append(feed);
    }
    heard.push(text);
    if (heard.length > 20) {
      heard.shift();
    }
    const line = document.createElement('div');
    line.textContent = text;
    feed.append(line);
    lines.push(line);
    while (lines.length > FEED_LINES) {
      lines.shift().remove();
    }
    setTimeout(() => {
      const i = lines.indexOf(line);
      if (i >= 0) {
        lines.splice(i, 1);
        line.remove();
      }
    }, FEED_MS);
  }

  function sendMutes() {
    send({ type: 'mute', seats: [...muted] });
  }

  function lineFor(m, name) {
    if (m.kind === 'chat' && CHAT_PRESETS[m.id]) {
      return str('friends.chat_line', { name, phrase: str(`rooms.chat.${CHAT_PRESETS[m.id]}`) });
    }
    if (m.kind === 'emote' && EMOTES[m.id]) {
      return str(`rooms.emote_line.${EMOTES[m.id]}`, { name });
    }
    return null;
  }

  return {
    isMuted: (seat) => muted.has(seat),
    heard: () => heard.slice(),
    note: () => note,
    /* After every welcome: the room may be a fresh one, or this a fresh seat. */
    welcomed() {
      note = null;
      if (muted.size) {
        sendMutes();
      }
    },
    /* A seat that left is somebody else's next time it is taken. */
    left(seat) {
      muted.delete(seat);
    },
    clear() {
      muted.clear();
      note = null;
    },
    setMuted(seat, on) {
      if (on) {
        muted.add(seat);
      } else {
        muted.delete(seat);
      }
      sendMutes();
    },
    /* kind 'chat' or 'emote', id an index into its list. False when the
     * allowance is spent, and nothing is sent. */
    say(kind, id) {
      if (!takeChat(allowance, performance.now())) {
        note = str('friends.wait');
        return false;
      }
      send({ type: 'event', kind, id });
      note = kind === 'chat' ? str('friends.said', { phrase: str(`rooms.chat.${CHAT_PRESETS[id]}`) }) : null;
      return true;
    },
    report(seat, reason) {
      send({ type: 'report', seat, reason });
      muted.add(seat);
      sendMutes();
    },
    /* The room's acknowledgement of this pilot's report: seat 0 for one
     * on the room's name (src/ui/roombrowser.js). */
    reported(seat) {
      note = seat ? str('friends.reported', { name: nameOf(seat) || '' }) : str('friends.reported_room');
    },
    /* A chat or emote from the room: shown unless its sender is muted. */
    event(m) {
      if (muted.has(m.seat)) {
        return;
      }
      const name = nameOf(m.seat);
      const text = name ? lineFor(m, name) : null;
      if (text) {
        show(text);
      }
    },
    /* The menu's rows for saying something. */
    sayRows() {
      return [
        {
          label: str('friends.say'),
          value: note || str('friends.say_value'),
          note: str('friends.say_note'),
          current: '',
          pickOnly: true,
          options: CHAT_PRESETS.map((id, i) => ({ value: String(i), label: str(`rooms.chat.${id}`) })),
          pick: (v) => this.say('chat', Number(v)),
        },
        {
          label: str('friends.emote'),
          value: str('friends.emote_value'),
          note: str('friends.emote_note'),
          current: '',
          pickOnly: true,
          options: EMOTES.map((id, i) => ({ value: String(i), label: str(`rooms.emote.${id}`) })),
          pick: (v) => this.say('emote', Number(v)),
        },
      ];
    },
    /* What can be done about another pilot, as a row's list: mute or
     * unmute, a report for each reason, and a host's kick when kick is
     * given. */
    peerOptions(seat, kick) {
      const opts = [{ value: muted.has(seat) ? 'unmute' : 'mute', label: str(muted.has(seat) ? 'friends.unmute' : 'friends.mute') }];
      REPORT_REASONS.forEach((id, i) => {
        /* The room's name is reported from the room's own row. */
        if (i !== ROOM_NAME_REPORT) {
          opts.push({ value: `report:${i}`, label: str('friends.report', { reason: str(`rooms.report.${id}`) }) });
        }
      });
      if (kick) {
        opts.push({ value: 'kick', label: str('friends.kick') });
      }
      return opts;
    },
    /* A pick from peerOptions; kick is the caller's, so returns 'kick' for it. */
    peerPick(seat, value) {
      if (value === 'mute' || value === 'unmute') {
        this.setMuted(seat, value === 'mute');
        note = value === 'mute' ? str('friends.muted_note', { name: nameOf(seat) || '' }) : null;
        return null;
      }
      const r = /^report:(\d+)$/.exec(value);
      if (r) {
        this.report(seat, Number(r[1]));
        return null;
      }
      return value;
    },
  };
}
