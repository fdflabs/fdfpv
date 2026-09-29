/*
 * rooms.js: the socket to a room of friends (edge/rooms/, the wire in
 * src/share/roomwire.js, the design in docs/MULTIPLAYER-PLAN.md).
 *
 * A pilot makes a room, public or private and named if they like, or
 * joins one: a public room from the room browser (src/share/roomlist.js)
 * or a quick join, a private one with the code a friend read out. Every
 * room has a code; a public room's is how the browser joins it and the
 * pilot never sees it. One WebSocket per room, a hello with the
 * picker name and the profile (airframe, paint, add ons, pilot figure,
 * world), then poses out at 30 Hz while flying and batches of everybody
 * else's in. The room's clock is learned on joining (eight pings a
 * quarter second apart, the tightest kept) and tracked every 30 s after,
 * moved at most 2 ms at a time so the peers never jump.
 *
 * A dropped socket is retried with a growing pause and the seat token,
 * which takes the same seat back. The token and the room's code are kept
 * in this tab's sessionStorage only: a reload rejoins, another tab or
 * another day does not. Nothing identifying goes to a room: the browser's
 * pilot key (src/share/identity.js) is a persistent identifier and a room
 * has no use for one, so it is never sent (section 2 of the plan).
 *
 * WHICH SERVER. A ?rooms= query (remembered here, `?rooms=off` forgets
 * it), else the production server when this page is the deployed site. A
 * page served off a loopback address talks to no rooms server unless told
 * to, because the browser checks run there.
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
  CLOSE, CLOSE_REMOVED, NAME_ADJECTIVES, NAME_ANIMALS, NAME_NUMBER_MAX, NAME_NUMBER_MIN, FIGURE_COUNT, PROTO,
  decodeBatch, normaliseCode, validNamePick,
} from './roomwire.js';

/* edge/rooms/node.js on the owner's VM, behind Caddy (deploy/vm/README.md).
 * The Worker it replaced, https://fdfpv-rooms.fdfretes.workers.dev, is
 * still deployed, and putting that address back here is the way back. */
export const PRODUCTION_ROOMS_ORIGIN = 'https://129.151.39.48';
const DEPLOYED_HOSTS = ['fdflabs.github.io'];
const ORIGIN_KEY = 'fdfpv.rooms';
const ROOM_KEY = 'fdfpv.room';
const TOKEN_KEY = 'fdfpv.roomToken';
const PICK_KEY = 'fdfpv.pilotPick';
const FIGURE_KEY = 'fdfpv.pilotFigure';
const RETRY_MS = [1000, 2000, 4000, 8000, 16000];
const SYNC_PINGS = 8;
const SYNC_GAP_MS = 250;
const RESYNC_MS = 30000;
const SLEW_MS = 2;
const KEEPALIVE_MS = 20000;

/* Closes that retrying cannot fix. */
const FINAL = new Map([
  [CLOSE.update, 'update'],
  [CLOSE.full, 'full'],
  [CLOSE.kicked, 'kicked'],
  [CLOSE.nosuch, 'nosuch'],
  [CLOSE.bad, 'bad'],
  [CLOSE.rate, 'rate'],
  [CLOSE_REMOVED, 'removed'],
]);

function store(kind) {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch (e) {
    return null;
  }
}

function read(kind, key) {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch (e) {
    return null;
  }
}

function write(kind, key, value) {
  try {
    if (value == null) {
      store(kind)?.removeItem(key);
    } else {
      store(kind)?.setItem(key, value);
    }
  } catch (e) {
    /* Storage refused: the room still works, a reload just forgets it. */
  }
}

/* The rooms server this page talks to, or null for none. */
export function roomsOrigin() {
  let asked = null;
  try {
    asked = new URLSearchParams(window.location.search).get('rooms');
  } catch (e) {
    asked = null;
  }
  if (asked === 'off') {
    write('local', ORIGIN_KEY, null);
    return null;
  }
  if (asked && /^https?:\/\/[^\s/]+$/.test(asked)) {
    write('local', ORIGIN_KEY, asked);
    return asked;
  }
  const kept = read('local', ORIGIN_KEY);
  if (kept) {
    return kept;
  }
  try {
    return DEPLOYED_HOSTS.includes(window.location.hostname) ? PRODUCTION_ROOMS_ORIGIN : null;
  } catch (e) {
    return null;
  }
}

/* The code a link asked to join (?room=K7PZ2M), or the room this tab was
 * in before a reload. */
export function wantedRoom() {
  try {
    const linked = normaliseCode(new URLSearchParams(window.location.search).get('room'));
    if (linked) {
      return linked;
    }
  } catch (e) {
    /* No location: no link. */
  }
  return normaliseCode(read('session', ROOM_KEY));
}

/* The share link for a code: this page with ?room=. */
export function roomLink(code) {
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', code);
    return url.toString();
  } catch (e) {
    return code;
  }
}

function randomInt(n) {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % n;
}

export function randomNamePick() {
  return [randomInt(NAME_ADJECTIVES), randomInt(NAME_ANIMALS), NAME_NUMBER_MIN + randomInt(NAME_NUMBER_MAX - NAME_NUMBER_MIN + 1)];
}

/* This browser's picker name, made the first time it is asked for. */
export function namePick() {
  let pick = null;
  try {
    pick = JSON.parse(read('local', PICK_KEY));
  } catch (e) {
    pick = null;
  }
  if (!validNamePick(pick)) {
    pick = randomNamePick();
    write('local', PICK_KEY, JSON.stringify(pick));
  }
  return pick;
}

export function setNamePick(pick) {
  if (validNamePick(pick)) {
    write('local', PICK_KEY, JSON.stringify(pick));
  }
}

export function figurePick() {
  const n = Number(read('local', FIGURE_KEY));
  if (Number.isInteger(n) && n >= 0 && n < FIGURE_COUNT && read('local', FIGURE_KEY) !== null) {
    return n;
  }
  const f = randomInt(FIGURE_COUNT);
  write('local', FIGURE_KEY, String(f));
  return f;
}

export function setFigurePick(f) {
  if (Number.isInteger(f) && f >= 0 && f < FIGURE_COUNT) {
    write('local', FIGURE_KEY, String(f));
  }
}

/*
 * handlers, all optional: onWelcome(welcome), onJoin(seat, name, profile),
 * onLeave(seat), onProfile(seat, profile), onBatch(batch), onState(state),
 * onRoom() when the room's name changed (reports took it away),
 * onHit(hit) (the referee's mid air contact, src/game/midair.js),
 * onHost(seat) when the room's host changes,
 * onEvent(event) for an event, onReported(seat), onBinary(bytes) for any
 * binary message but a batch, and onMessage(message) for every other text
 * message (a race's, Phase 4).
 * hello() is asked for { name, profile } each time a socket opens, so a
 * reconnect carries what is true then.
 */
export function createRoomLink(handlers = {}, hello = () => ({})) {
  let ws = null;
  let code = null;
  let attempt = 0;
  let retry = null;
  let phase = 'idle'; /* idle, connecting, open, failed */
  let reason = null;
  let welcome = null;
  let offset = null;
  let bestRtt = Infinity;
  let pings = 0;
  let syncTimer = null;
  let keepTimer = null;
  /* A quick join asks for a public room by map, not code (edge/rooms/front.js);
   * once the room answers, its code is this tab's and a reconnect uses it. */
  let publicMap = null;
  let fullRetried = false;

  function setPhase(next, why = null) {
    phase = next;
    reason = why;
    if (handlers.onState) {
      handlers.onState({ phase, reason, code, publicMap });
    }
  }

  function stopTimers() {
    clearTimeout(syncTimer);
    clearInterval(keepTimer);
    syncTimer = null;
    keepTimer = null;
  }

  function sendText(obj) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  }

  function ping() {
    pings += 1;
    sendText({ type: 't', c: performance.now() });
    syncTimer = setTimeout(ping, pings < SYNC_PINGS ? SYNC_GAP_MS : RESYNC_MS);
  }

  function onClock(m) {
    const recv = performance.now();
    const rtt = recv - m.c;
    if (!(rtt >= 0)) {
      return;
    }
    const est = m.s + rtt / 2 - recv;
    if (pings <= SYNC_PINGS) {
      if (rtt < bestRtt) {
        bestRtt = rtt;
        offset = est;
      }
      return;
    }
    offset += Math.max(-SLEW_MS, Math.min(SLEW_MS, est - offset));
  }

  function open() {
    const origin = roomsOrigin();
    if ((!code && !publicMap) || !origin || typeof WebSocket === 'undefined') {
      setPhase('failed', 'noserver');
      return;
    }
    let socket;
    try {
      const path = publicMap ? `public/${publicMap}` : `room/${code}`;
      socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/${path}`);
    } catch (e) {
      setPhase('failed', 'noserver');
      return;
    }
    socket.binaryType = 'arraybuffer';
    ws = socket;
    setPhase('connecting');
    socket.onopen = () => {
      if (ws !== socket) {
        return;
      }
      const h = hello();
      const token = read('session', TOKEN_KEY);
      /* The seat held before a drop, so a room that was restarted and
       * forgot the token can put the pilot back in the same slot. */
      const seat = welcome && welcome.code === code ? { seat: welcome.seat } : {};
      sendText({ type: 'hello', proto: PROTO, build: 'fdfpv', name: h.name, profile: h.profile, ...(token ? { token } : {}), ...seat });
    };
    socket.onmessage = (ev) => {
      if (ws !== socket) {
        return;
      }
      if (typeof ev.data !== 'string') {
        const bytes = new Uint8Array(ev.data);
        const batch = decodeBatch(bytes);
        if (batch) {
          handlers.onBatch?.(batch);
        } else {
          /* Every other binary type is a later phase's (roomwire.js). */
          handlers.onBinary?.(bytes);
        }
        return;
      }
      if (ev.data === 'pong') {
        return;
      }
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m.type === 'welcome') {
        welcome = m;
        attempt = 0;
        write('session', TOKEN_KEY, m.token);
        if (publicMap) {
          code = normaliseCode(m.code);
          publicMap = null;
          fullRetried = false;
        }
        write('session', ROOM_KEY, code);
        pings = 0;
        bestRtt = Infinity;
        stopTimers();
        ping();
        keepTimer = setInterval(() => {
          if (ws && ws.readyState === 1) {
            ws.send('ping');
          }
        }, KEEPALIVE_MS);
        setPhase('open');
        if (handlers.onWelcome) {
          handlers.onWelcome(m);
        }
      } else if (m.type === 't') {
        onClock(m);
      } else if (m.type === 'join') {
        if (welcome) {
          welcome.host = m.host ?? welcome.host;
        }
        handlers.onJoin?.(m.seat, m.name, m.profile);
      } else if (m.type === 'leave') {
        if (welcome && m.host) {
          welcome.host = m.host;
        }
        handlers.onLeave?.(m.seat);
      } else if (m.type === 'host') {
        /* The room's host changed (edge/rooms/core.js settleHost): a
         * restart, the host leaving or coming back. */
        if (welcome && Number.isInteger(m.seat)) {
          welcome.host = m.seat;
        }
        handlers.onHost?.(m.seat);
      } else if (m.type === 'profile') {
        handlers.onProfile?.(m.seat, m.profile);
      } else if (m.type === 'hit') {
        handlers.onHit?.(m);
      } else if (m.type === 'event') {
        handlers.onEvent?.(m);
      } else if (m.type === 'reported') {
        handlers.onReported?.(m.seat);
      } else if (m.type === 'room') {
        if (welcome) {
          welcome.name = m.name;
          welcome.hidden = m.hidden;
        }
        handlers.onRoom?.();
      } else {
        handlers.onMessage?.(m);
      }
    };
    socket.onclose = (ev) => {
      if (ws !== socket) {
        return;
      }
      ws = null;
      stopTimers();
      const final = FINAL.get(ev.code);
      if (!code && !publicMap) {
        setPhase('idle');
        return;
      }
      /* A public room that filled between the lobby's count and this
       * quick join: ask the lobby again, once, for another. */
      if (final === 'full' && publicMap && !fullRetried) {
        fullRetried = true;
        setPhase('connecting', 'retrying');
        retry = setTimeout(() => {
          retry = null;
          open();
        }, 1000);
        return;
      }
      if (final) {
        forget();
        setPhase('failed', final);
        return;
      }
      if (attempt >= RETRY_MS.length) {
        setPhase('failed', 'lost');
        return;
      }
      setPhase('connecting', 'retrying');
      retry = setTimeout(() => {
        retry = null;
        open();
      }, RETRY_MS[attempt]);
      attempt += 1;
    };
    socket.onerror = () => {};
  }

  /* The code and token this tab keeps, dropped when the room is over. */
  function forget() {
    write('session', ROOM_KEY, null);
    write('session', TOKEN_KEY, null);
  }

  function leave() {
    code = null;
    publicMap = null;
    fullRetried = false;
    welcome = null;
    offset = null;
    clearTimeout(retry);
    retry = null;
    stopTimers();
    forget();
    if (ws) {
      const socket = ws;
      ws = null;
      try {
        socket.close(1000, 'leave');
      } catch (e) {
        /* Already closed. */
      }
    }
    setPhase('idle');
  }

  return {
    /* Make a room in `map`, private unless room.public; room.name is the
     * typed name or null, room.mode the game it is set up for or null.
     * Resolves to its code; throws Error('name') for a name the server
     * refused. */
    async create(map, friendly = false, room = {}) {
      const origin = roomsOrigin();
      if (!origin) {
        throw new Error('noserver');
      }
      const res = await fetch(`${origin}/v2/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          map, friendly: Boolean(friendly), public: room.public === true, name: room.name ?? null, mode: room.mode ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !normaliseCode(body.code)) {
        throw new Error(body.error || `http ${res.status}`);
      }
      return body.code;
    },
    join(wanted) {
      const next = normaliseCode(wanted);
      if (!next) {
        setPhase('failed', 'nosuch');
        return;
      }
      if (next !== code) {
        leave();
        /* A token belongs to one room. */
        if (normaliseCode(read('session', ROOM_KEY)) !== next) {
          write('session', TOKEN_KEY, null);
        }
      }
      if (ws || retry) {
        return;
      }
      publicMap = null;
      code = next;
      attempt = 0;
      open();
    },
    /* A public room on `map`, wherever the lobby has a seat. */
    joinPublic(map) {
      leave();
      write('session', TOKEN_KEY, null);
      publicMap = map;
      attempt = 0;
      open();
    },
    leave,
    state() {
      return { phase, reason, code, publicMap, welcome };
    },
    available() {
      return Boolean(roomsOrigin());
    },
    /* The room clock now, ms, or null before it is known. */
    roomNow() {
      return offset == null ? null : performance.now() + offset;
    },
    sendPose(bytes) {
      if (ws && ws.readyState === 1 && phase === 'open') {
        ws.send(bytes);
      }
    },
    /* A later phase's binary message (roomwire.js), while in a room. */
    sendBinary(bytes) {
      if (ws && ws.readyState === 1 && phase === 'open') {
        ws.send(bytes);
      }
    },
    /* { kind, ... }, sent as an event (roomwire.js names each kind). */
    sendEvent(event) {
      sendText({ ...event, type: 'event' });
    },
    sendProfile(profile) {
      sendText({ type: 'profile', profile });
    },
    kick(seat) {
      sendText({ type: 'kick', seat });
    },
    /* The messages the room's modules own: the safety messages
     * (src/share/roomsafety.js) and the race's (src/share/roomrace.js). */
    send(obj) {
      sendText(obj);
    },
  };
}
