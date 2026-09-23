/*
 * live.js: the socket to a live room on the board.
 *
 * One WebSocket per room, at {board}/api/live/{trackId}?name=, opened when
 * the pilot turns Live on for a board track and closed when they turn it
 * off or leave the track. Binary frames go out as the sender makes them
 * (src/game/ghost.js LiveSender) and come in with the peer id in front
 * (src/share/ghostdata.js decodeLiveFrame). Text frames are the room's
 * JSON: welcome, join, leave. A dropped socket is retried with a growing
 * pause, a handful of times, while the pilot still wants the room; the
 * board's free tier sleeps, and the first joiner pays its cold start.
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

import { decodeLiveFrame } from './ghostdata.js';

const RETRY_MS = [1000, 2000, 4000, 8000, 16000];

function socketUrl(origin, trackId, name) {
  const base = String(origin || '').replace(/\/+$/, '').replace(/^http/, 'ws');
  return `${base}/api/live/${encodeURIComponent(trackId)}?name=${encodeURIComponent(name || '')}`;
}

/*
 * handlers: { onWelcome(id, peers), onJoin(id, name), onLeave(id),
 * onFrame(frame, wallMs), onState(state) } where state is one of
 * 'connecting', 'open', 'closed', 'failed'. All optional.
 */
export function createLiveLink(handlers = {}) {
  let ws = null;
  let wanted = null; /* { origin, trackId, name } while a room is wanted */
  let attempt = 0;
  let timer = null;
  let state = 'closed';

  function setState(next) {
    if (state !== next) {
      state = next;
      if (handlers.onState) {
        handlers.onState(next);
      }
    }
  }

  function open() {
    if (!wanted || typeof WebSocket === 'undefined') {
      return;
    }
    const target = wanted;
    let socket;
    try {
      socket = new WebSocket(socketUrl(target.origin, target.trackId, target.name));
    } catch (e) {
      setState('failed');
      return;
    }
    socket.binaryType = 'arraybuffer';
    ws = socket;
    setState('connecting');
    socket.onopen = () => {
      if (ws !== socket) {
        return;
      }
      attempt = 0;
      setState('open');
    };
    socket.onmessage = (ev) => {
      if (ws !== socket) {
        return;
      }
      if (typeof ev.data === 'string') {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (msg.type === 'welcome' && handlers.onWelcome) {
          handlers.onWelcome(msg.id, Array.isArray(msg.peers) ? msg.peers : []);
        } else if (msg.type === 'join' && handlers.onJoin) {
          handlers.onJoin(msg.id, String(msg.name || 'Pilot'));
        } else if (msg.type === 'leave' && handlers.onLeave) {
          handlers.onLeave(msg.id);
        }
        return;
      }
      const frame = decodeLiveFrame(new Uint8Array(ev.data));
      if (frame && handlers.onFrame) {
        handlers.onFrame(frame, typeof performance !== 'undefined' ? performance.now() : Date.now());
      }
    };
    socket.onclose = () => {
      if (ws !== socket) {
        return;
      }
      ws = null;
      if (!wanted) {
        setState('closed');
        return;
      }
      if (attempt >= RETRY_MS.length) {
        setState('failed');
        return;
      }
      setState('connecting');
      timer = setTimeout(() => {
        timer = null;
        open();
      }, RETRY_MS[attempt]);
      attempt += 1;
    };
    socket.onerror = () => {};
  }

  return {
    /* Want this room. Reconnects if the room changed. */
    join({ origin, trackId, name }) {
      const same = wanted && wanted.origin === origin && wanted.trackId === trackId && wanted.name === name;
      if (same && (ws || timer)) {
        return;
      }
      this.leave();
      wanted = { origin, trackId, name };
      attempt = 0;
      open();
    },
    leave() {
      wanted = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (ws) {
        const socket = ws;
        ws = null;
        try {
          socket.close();
        } catch (e) {
        }
      }
      setState('closed');
    },
    send(bytes) {
      if (ws && ws.readyState === 1) {
        ws.send(bytes);
      }
    },
    state() {
      return state;
    },
    wanted() {
      return wanted;
    },
  };
}
