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
 * name tag. A report sends a reason index and mutes the pilot reported,
 * but only once the pilot confirms it: a pick from the list asks first,
 * because a report sent by accident (the owner did it) counts against
 * somebody who did nothing. Sent, it can be taken back: for UNDO_MS from
 * a row of its own under the pilot's, and from the pilot's own row for as
 * long as the room counts it (REPORT_WINDOW_MS). Taking it back can also
 * undo the mute that came with it; a mute set before the report stays
 * until the pilot unmutes.
 *
 * What arrives is shown in a short feed at the bottom left, built the
 * first time a line arrives, so a pilot who never joins a room never
 * builds it. Lines are set with textContent, never as markup.
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
  CHAT_PRESETS, EMOTES, REPORT_REASONS, REPORT_WINDOW_MS, ROOM_NAME_REPORT, chatAllowance, takeChat,
} from './roomwire.js';
import { str } from '../strings/index.js';

const FEED_LINES = 4;
/* Long enough for a young reader to get through a line twice. */
const FEED_MS = 10000;
/* How long the Undo row stays under a pilot just reported. */
export const UNDO_MS = 30000;

/*
 * send(obj) puts a message on the room's socket; nameOf(seat) is a seat's
 * picker name in this page's language, or null for a seat not here;
 * changed() is called when the rows change with nothing picked (the Undo
 * row running out).
 */
export function createRoomSafety(send, nameOf, changed = () => {}) {
  const muted = new Set();
  /* The report picked and not yet confirmed, { seat, reason }, or null. */
  let asking = null;
  /* seat -> { at, mute }: this pilot's reports sent, when, and whether
   * the report is what muted the seat. */
  const sent = new Map();
  let undoTimer = null;
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
      sent.delete(seat);
      if (asking && asking.seat === seat) {
        asking = null;
      }
    },
    clear() {
      muted.clear();
      sent.clear();
      asking = null;
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
      sent.set(seat, { at: performance.now(), mute: !muted.has(seat) });
      muted.add(seat);
      sendMutes();
      clearTimeout(undoTimer);
      undoTimer = setTimeout(changed, UNDO_MS);
    },
    /* Take this pilot's report on seat back, and with unmute the mute
     * that came with it. */
    unreport(seat, unmute) {
      const r = sent.get(seat);
      if (!r) {
        return;
      }
      send({ type: 'unreport', seat });
      sent.delete(seat);
      if (unmute && r.mute) {
        muted.delete(seat);
        sendMutes();
      }
    },
    /* The room's acknowledgement of this pilot's report: seat 0 for one
     * on the room's name (src/ui/roombrowser.js). */
    reported(seat) {
      note = seat ? str('friends.reported', { name: nameOf(seat) || '' }) : str('friends.reported_room');
    },
    /* The room's answer to an unreport: undone false when the report no
     * longer counted, so there was nothing to take back. */
    unreported(seat, undone) {
      note = undone ? str('friends.unreported', { name: nameOf(seat) || '' }) : str('friends.unreported_late');
    },
    /* The question over a pilot's row while their report waits for a
     * yes, or null. */
    question(seat) {
      if (!asking || asking.seat !== seat) {
        return null;
      }
      return str('friends.report_confirm', { name: nameOf(seat) || '', reason: str(`rooms.report.${REPORT_REASONS[asking.reason]}`) });
    },
    /* The Undo row under a pilot this pilot reported less than UNDO_MS
     * ago, as a list: empty, or one row. */
    undoRows(seat) {
      const r = sent.get(seat);
      if (!r || performance.now() - r.at >= UNDO_MS) {
        return [];
      }
      return [{
        label: str('friends.undo_row', { name: nameOf(seat) || '' }),
        note: str('friends.undo_note'),
        current: '',
        pickOnly: true,
        options: this.undoOptions(seat),
        pick: (v) => this.peerPick(seat, v),
      }];
    },
    undoOptions(seat) {
      const r = sent.get(seat);
      if (!r || performance.now() - r.at >= REPORT_WINDOW_MS) {
        return [];
      }
      return [
        { value: 'unreport', label: str('friends.unreport') },
        ...(r.mute && muted.has(seat) ? [{ value: 'unreport_unmute', label: str('friends.unreport_unmute') }] : []),
      ];
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
    /* What can be done about another pilot, as a row's list: confirm or
     * cancel while a report waits; otherwise mute or unmute, a report for
     * each reason or, while one counts, taking it back, and a host's kick
     * when kick is given. */
    peerOptions(seat, kick) {
      if (asking && asking.seat === seat) {
        return [{ value: 'confirm', label: str('friends.report_yes') }, { value: 'cancel', label: str('friends.report_no') }];
      }
      const opts = [{ value: muted.has(seat) ? 'unmute' : 'mute', label: str(muted.has(seat) ? 'friends.unmute' : 'friends.mute') }];
      const undo = this.undoOptions(seat);
      opts.push(...undo);
      REPORT_REASONS.forEach((id, i) => {
        /* The room's name is reported from the room's own row, and a
         * pilot already reported is not reported twice. */
        if (i !== ROOM_NAME_REPORT && !undo.length) {
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
        asking = { seat, reason: Number(r[1]) };
        return null;
      }
      if (value === 'confirm' || value === 'cancel') {
        if (value === 'confirm' && asking && asking.seat === seat) {
          this.report(seat, asking.reason);
        }
        asking = null;
        return null;
      }
      if (value === 'unreport' || value === 'unreport_unmute') {
        this.unreport(seat, value === 'unreport_unmute');
        return null;
      }
      return value;
    },
  };
}
