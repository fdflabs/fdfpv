/*
 * voice.js: voice chat in a room, pilot to pilot.
 *
 * WebRTC audio in a mesh: one RTCPeerConnection to each other pilot in the
 * room who has voice on, each carrying this pilot's microphone out and that
 * pilot's voice in. The room's socket carries the signalling only, as the
 * JSON type voice (edge/rooms/voice.js says what each op carries), and the
 * audio never touches our server.
 *
 * WHO CALLS WHOM. Nobody keeps a list of who has voice on. Turning it on
 * (or a new seat, after a reconnect) says { op: 'on' } to the room; each
 * pilot with voice on answers by the one rule "the lower seat offers": a
 * lower seat sends its offer, a higher one says { op: 'on', to } back so
 * the lower one offers. An on always starts the link with its sender
 * afresh, and every offer carries a new link number, n, so an answer or a
 * candidate for a link that has since been replaced is dropped. Two pilots
 * turning voice on at once cost one extra round, never a loop: an on sent
 * to one seat is never answered with another.
 *
 * NAT. Each offer and answer goes once, with every candidate gathered by
 * then (GATHER_MS), which keeps a full room's signalling inside the room's
 * allowance; a candidate found later follows as an ice. The first try is
 * through STUN alone, which is how most homes connect; a link that has not
 * connected in LINK_WAIT_MS, or fails, is tried again by its offerer with
 * the TURN relay the room server hands out (edge/rooms/turn.js), when there
 * is one: over UDP on the second try, over TCP and TLS on the third (for a
 * network that blocks UDP), and then no more. Only the links that need the
 * relay use it, and one transport at a time, because every allocation
 * holds one of the relay's 41 ports (deploy/vm/turnserver.conf), and a
 * browser makes one for each of its network interfaces.
 *
 * MUTE AND REPORT. A pilot this pilot has muted (a report mutes too,
 * src/share/roomsafety.js) is never linked: the link is dropped the moment
 * the mute is set, the other side is told off, and the room refuses to
 * pass anything between the two (edge/rooms/voice.js). Unmuted, the link
 * is made again if both still have voice on. Separately, each pilot has a
 * volume here, 0 to VOLUME_MAX, and 0 is this pilot's own voice mute of
 * them, which nobody else sees.
 *
 * THE MICROPHONE is asked for when voice is turned on and let go when it is
 * turned off or the room is left, with the browser's echo cancellation,
 * noise suppression and automatic gain on. Push to talk, the default, sends
 * the track only while PTT_KEY or the pad's PTT_PAD is held; open mic
 * always. Opus is asked for mono at OPUS_BPS with DTX, so a pilot not
 * talking sends almost nothing.
 *
 * THE VOICES ARE KEPT IN REPLAYS (the owner, 2026-10-02; privacy.html
 * says so, and so does the voice row's note). Live, they play through an
 * AudioContext of this module's own, never the game's audio graph. What
 * this page hears from each other pilot is also recorded for the crash
 * cam (setRecorder, src/replay/voicerec.js): the received stream as Opus
 * at OPUS_BPS, in pieces each a file of its own, stamped on
 * the clock the recorder hands in (the room's), and only a piece in which
 * that pilot spoke and was not muted here. This pilot's own microphone is
 * never recorded here; it is kept by the other pilots' pages.
 *
 * TALKING NEEDS THE NOTICE. A pilot who has not said they understand that
 * their voice may be kept in other pilots' replays (src/ui/voiceui.js)
 * has voice on to listen only: links are made with nothing to send
 * (recvonly), and the microphone is not asked for until they do
 * (enableTalk).
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
  RELAY_NONE, RELAY_TCP, RELAY_UDP, VOICE_LINK_MAX,
} from './roomwire.js';

/* The keyboard key and the standard pad button held to talk. Not V: V and
 * the pad's X open the crash replay in flight (src/replay/crashcam.js). The
 * pad's is the left trigger, which nothing in flight reads, and only on a
 * standard pad: a radio reports its switches as buttons, latched. */
export const PTT_KEY = 'KeyN';
export const PTT_PAD = 6;

/* Public STUN, for finding this pilot's own address. */
export const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

/* Signalling messages this page sends in any one second, well under the
 * room's VOICE_PER_S so network jitter bunching them never costs one. */
export const SEND_PER_S = 4;
export const GATHER_MS = 1500;
export const GATHER_RELAY_MS = 3000;
export const LINK_WAIT_MS = 12000;
export const TRIES = 3;

/* Opus, mono, at this average bitrate. */
export const OPUS_BPS = 24000;

export const VOLUME_MAX = 1.5;
export const VOLUME_STEP = 0.25;

/* Distance voice: full volume within NEAR_M, falling in a straight line to
 * FLOOR at FAR_M and staying there, so a pilot across the valley is quiet
 * but never silent. */
export const DISTANCE = { NEAR_M: 30, FAR_M: 400, FLOOR: 0.3 };

/* A voice louder than this RMS is speaking; it stays lit for HOLD_MS after
 * it drops, so the light does not flicker between words. */
export const SPEAKING_RMS = 0.015;
export const SPEAKING_HOLD_MS = 350;

export function distanceGain(m) {
  if (m == null || !(m > DISTANCE.NEAR_M)) {
    return 1;
  }
  if (m >= DISTANCE.FAR_M) {
    return DISTANCE.FLOOR;
  }
  const f = (m - DISTANCE.NEAR_M) / (DISTANCE.FAR_M - DISTANCE.NEAR_M);
  return 1 - f * (1 - DISTANCE.FLOOR);
}

/*
 * The SDP with Opus asked for as this module wants it: mono, OPUS_BPS on
 * average, DTX (almost nothing sent in silence) and in band FEC (a lost
 * packet's audio carried in the next). The receiver's fmtp is what the
 * sender honours, so both sides write it into their own description.
 */
export function tuneOpus(sdp) {
  const m = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
  if (!m) {
    return sdp;
  }
  const pt = m[1];
  const want = {
    minptime: '10', useinbandfec: '1', usedtx: '1', stereo: '0', 'sprop-stereo': '0', maxaveragebitrate: String(OPUS_BPS),
  };
  const line = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const had = line.exec(sdp);
  const params = new Map();
  for (const kv of (had ? had[1] : '').split(';')) {
    const [k, v] = kv.split('=');
    if (k && k.trim()) {
      params.set(k.trim(), (v || '').trim());
    }
  }
  for (const [k, v] of Object.entries(want)) {
    params.set(k, v);
  }
  const fmtp = `a=fmtp:${pt}` + String.fromCharCode(32) + [...params].map(([k, v]) => `${k}=${v}`).join(';');
  if (had) {
    return sdp.replace(line, fmtp);
  }
  return sdp.replace(m[0], `${m[0]}\r\n${fmtp}`);
}

function linkNumber() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % VOICE_LINK_MAX;
}

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / buf.length);
}

/*
 * send(obj) puts a message on the room's socket; isMuted(seat) is the
 * safety mute (report included). Returns the controller main.js drives:
 * the room's events in, frame() once a frame, and what the menu shows.
 */
export function createVoice({ send, isMuted }) {
  let on = false;
  /* Whether the pilot asked to talk, not only to listen. */
  let wantTalk = true;
  let mode = 'ptt'; /* 'ptt' or 'open' */
  let distanceOn = false;
  /* The crash cam's replay is playing: the room's voices are held silent
   * under it (the links stay up), and come back when it closes. */
  let held = false;
  /* Where heard voices go for the replay: { now() (the clock pieces are
   * stamped on, or null), piece({ seat, from, to, mime, bytes }), mimes
   * (the containers it takes, best first), segmentMs (a piece's length) },
   * or null for none. */
  let recorder = null;
  let problem = null; /* null, 'denied', 'nomic', 'unsupported' */
  let mySeat = null;
  let mic = null; /* the MediaStream */
  let ctx = null;
  let micAnalyser = null;
  let talking = false;
  let turnIce = [];
  let turnAt = -Infinity;
  let turnTtlMs = 0;
  /* seat -> the link; seats whose voice is on, as far as this page knows;
   * seat -> volume; the seats muted as of the last frame. */
  const links = new Map();
  const voiced = new Set();
  const volumes = new Map();
  let mutedSeen = new Set();
  const outbox = [];
  const sentAt = [];
  let pump = null;
  const buf = new Float32Array(1024);

  /* Paced to SEND_PER_S in any one second. */
  function queue(obj) {
    outbox.push(obj);
    drain();
  }

  function drain() {
    clearTimeout(pump);
    pump = null;
    const now = performance.now();
    while (sentAt.length && now - sentAt[0] >= 1000) {
      sentAt.shift();
    }
    while (outbox.length && sentAt.length < SEND_PER_S) {
      sentAt.push(now);
      send({ type: 'voice', ...outbox.shift() });
    }
    if (outbox.length) {
      pump = setTimeout(drain, 1000 - (now - sentAt[0]) + 5);
    }
  }

  function volumeOf(seat) {
    return volumes.has(seat) ? volumes.get(seat) : 1;
  }

  function askTurn() {
    turnAt = performance.now();
    queue({ op: 'turn' });
  }

  function micTrack() {
    return mic ? mic.getAudioTracks()[0] || null : null;
  }

  function closeLink(seat) {
    const l = links.get(seat);
    if (!l) {
      return;
    }
    links.delete(seat);
    clearTimeout(l.timer);
    try {
      l.pc.close();
    } catch (e) {
      /* Already closed. */
    }
    if (l.rec) {
      clearTimeout(l.rec.timer);
      l.rec.stop();
      l.rec = null;
    }
    if (l.audio) {
      l.audio.srcObject = null;
    }
    if (l.src) {
      l.src.disconnect();
    }
    if (l.gain) {
      l.gain.disconnect();
    }
  }

  function closeAll() {
    for (const seat of [...links.keys()]) {
      closeLink(seat);
    }
  }

  /* STUN, and the relay's addresses for this try: RELAY_NONE, RELAY_UDP
   * or RELAY_TCP (TCP and TLS). A relay with no address of that kind is
   * offered whole. */
  function iceServers(relay) {
    if (relay === RELAY_NONE || !turnIce.length) {
      return STUN;
    }
    const udp = relay === RELAY_UDP;
    const pick = turnIce
      .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => /transport=udp/i.test(u) === udp) }))
      .filter((s) => s.urls.length);
    return [...STUN, ...(pick.length ? pick : turnIce)];
  }

  /* A link's peer connection, with its handlers: the far voice into this
   * module's audio graph, and a candidate gathered late sent on. */
  function makeLink(seat, n, offerer, relay, tries) {
    closeLink(seat);
    const pc = new RTCPeerConnection({ iceServers: iceServers(relay) });
    const l = {
      seat, n, pc, offerer, relay, tries, sent: false, up: false, timer: null, pending: [],
      audio: null, src: null, analyser: null, gain: null, level: 0, speakingUntil: 0, state: 'connecting',
    };
    links.set(seat, l);
    const track = micTrack();
    if (track) {
      pc.addTrack(track, mic);
    } else if (offerer) {
      /* Listening only: an audio line to hear on, nothing to send. */
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate && l.sent && links.get(seat) === l) {
        const c = ev.candidate;
        queue({ op: 'ice', to: seat, n, c: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } });
      }
    };
    pc.ontrack = (ev) => {
      if (links.get(seat) !== l || !ctx) {
        return;
      }
      const stream = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      /* Chrome passes a remote stream to Web Audio only while a media
       * element also plays it, so a muted one does, and the graph is
       * what is heard. */
      l.audio = new Audio();
      l.audio.muted = true;
      l.audio.srcObject = stream;
      l.audio.play().catch(() => {});
      l.src = ctx.createMediaStreamSource(stream);
      l.analyser = ctx.createAnalyser();
      l.analyser.fftSize = buf.length * 2;
      l.gain = ctx.createGain();
      l.gain.gain.value = 0;
      l.src.connect(l.analyser);
      l.src.connect(l.gain);
      l.gain.connect(ctx.destination);
      record(l, stream);
    };
    pc.onconnectionstatechange = () => {
      if (links.get(seat) !== l) {
        return;
      }
      if (pc.connectionState === 'connected') {
        l.up = true;
        l.tries = 0;
        l.state = 'up';
        clearTimeout(l.timer);
      } else if (pc.connectionState === 'failed') {
        l.up = false;
        l.state = 'failed';
        if (l.offerer) {
          retry(l);
        }
      }
    };
    return l;
  }

  /*
   * The received stream into pieces for the replay: one MediaRecorder a
   * piece, stopped and replaced every segmentMs so each piece is a file
   * of its own; a piece reaches the recorder only if the pilot spoke in
   * it and was not muted here (frame() marks it).
   */
  function record(l, stream) {
    if (!recorder || typeof MediaRecorder === 'undefined') {
      return;
    }
    const mime = recorder.mimes.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      return;
    }
    const piece = () => {
      if (links.get(l.seat) !== l || !recorder) {
        return;
      }
      let r;
      try {
        r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: OPUS_BPS });
      } catch (e) {
        return;
      }
      const from = recorder.now();
      const chunks = [];
      const rec = {
        spoke: false,
        timer: null,
        stop() {
          if (r.state !== 'inactive') {
            r.stop();
          }
        },
      };
      r.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) {
          chunks.push(ev.data);
        }
      };
      r.onstop = async () => {
        const to = recorder ? recorder.now() : null;
        if (!rec.spoke || !chunks.length || from == null || to == null || !recorder) {
          return;
        }
        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        recorder.piece({
          seat: l.seat, from, to, mime, bytes,
        });
      };
      r.start();
      l.rec = rec;
      rec.timer = setTimeout(() => {
        rec.stop();
        piece();
      }, recorder.segmentMs);
    };
    piece();
  }

  /* The local description once every candidate is in, or GATHER_MS on. */
  function gathered(pc, relay) {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          done();
        }
      };
      const t = setTimeout(done, relay !== RELAY_NONE ? GATHER_RELAY_MS : GATHER_MS);
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  async function offer(seat, tries = 1) {
    if (!on || isMuted(seat)) {
      return;
    }
    const relay = !turnIce.length || tries < 2 ? RELAY_NONE : (tries === 2 ? RELAY_UDP : RELAY_TCP);
    if (relay !== RELAY_NONE && performance.now() - turnAt > turnTtlMs / 2) {
      askTurn();
    }
    const n = linkNumber();
    const l = makeLink(seat, n, true, relay, tries);
    try {
      const desc = await l.pc.createOffer();
      await l.pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(desc.sdp) });
      await gathered(l.pc, relay);
    } catch (e) {
      /* Closed under the await by a newer link to the same seat, or a
       * browser that refused: either way this one is over. */
      if (links.get(seat) === l) {
        closeLink(seat);
      }
      return;
    }
    if (links.get(seat) !== l) {
      return;
    }
    l.sent = true;
    queue({ op: 'offer', to: seat, n, sdp: l.pc.localDescription.sdp, relay });
    l.timer = setTimeout(() => {
      if (links.get(seat) === l && !l.up) {
        retry(l);
      }
    }, LINK_WAIT_MS);
  }

  function retry(l) {
    if (links.get(l.seat) !== l) {
      return;
    }
    if (l.tries >= TRIES) {
      clearTimeout(l.timer);
      l.state = 'failed';
      return;
    }
    offer(l.seat, l.tries + 1);
  }

  async function answer(seat, m) {
    const l = makeLink(seat, m.n, false, m.relay, 0);
    try {
      await l.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      for (const c of l.pending.splice(0)) {
        await l.pc.addIceCandidate(c).catch(() => {});
      }
      const desc = await l.pc.createAnswer();
      await l.pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(desc.sdp) });
      await gathered(l.pc, l.relay);
    } catch (e) {
      if (links.get(seat) === l) {
        closeLink(seat);
      }
      return;
    }
    if (links.get(seat) !== l) {
      return;
    }
    l.sent = true;
    queue({ op: 'answer', to: seat, n: m.n, sdp: l.pc.localDescription.sdp });
  }

  /* Start the link with a seat by the rule: the lower seat offers. */
  function greet(seat) {
    if (mySeat < seat) {
      offer(seat);
    } else {
      queue({ op: 'on', to: seat });
    }
  }

  function onMessage(m) {
    const from = m.from;
    if (m.op === 'turn') {
      turnIce = Array.isArray(m.ice) ? m.ice : [];
      turnTtlMs = (Number(m.ttl) || 0) * 1000;
      return;
    }
    if (!Number.isInteger(from) || from === mySeat) {
      return;
    }
    if (m.op === 'off') {
      voiced.delete(from);
      closeLink(from);
      return;
    }
    voiced.add(from);
    if (!on || isMuted(from)) {
      /* Said to this pilot alone: tell them not to wait. */
      if (m.to !== undefined || m.op === 'offer') {
        queue({ op: 'off', to: from });
      }
      return;
    }
    if (m.op === 'on') {
      closeLink(from);
      if (mySeat < from) {
        offer(from);
      } else if (m.to === undefined) {
        queue({ op: 'on', to: from });
      }
      return;
    }
    if (m.op === 'offer' && typeof m.sdp === 'string') {
      answer(from, m);
      return;
    }
    const l = links.get(from);
    if (!l || l.n !== m.n) {
      return;
    }
    if (m.op === 'answer' && l.offerer && typeof m.sdp === 'string' && l.pc.signalingState === 'have-local-offer') {
      l.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => {
        if (links.get(from) === l) {
          closeLink(from);
        }
      });
    } else if (m.op === 'ice' && m.c) {
      if (l.pc.remoteDescription) {
        l.pc.addIceCandidate(m.c).catch(() => {});
      } else {
        l.pending.push(m.c);
      }
    }
  }

  /* Into the room: the seat is new, so every link starts again. */
  function join() {
    closeAll();
    askTurn();
    queue({ op: 'on' });
  }

  /* The context the voices play in, made when voice goes on, to listen
   * as much as to talk. */
  function listen() {
    ctx ??= new AudioContext();
    ctx.resume().catch(() => {});
  }

  async function openMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      problem = 'unsupported';
      return false;
    }
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
        },
        video: false,
      });
    } catch (e) {
      problem = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'nomic' : 'denied';
      return false;
    }
    problem = null;
    listen();
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = buf.length * 2;
    ctx.createMediaStreamSource(mic).connect(micAnalyser);
    const track = micTrack();
    if (track) {
      track.enabled = mode === 'open';
    }
    return true;
  }

  function closeMic() {
    if (mic) {
      for (const t of mic.getTracks()) {
        t.stop();
      }
    }
    mic = null;
    micAnalyser = null;
    talking = false;
  }

  return {
    PTT_KEY,
    /* Turn voice on: with talk, the microphone first (the browser asks
     * the pilot); without, to listen only. Then the room is told.
     * Resolves to true, or false with problem(). */
    async enable({ talk = true } = {}) {
      if (on) {
        return true;
      }
      on = true;
      wantTalk = talk;
      if (typeof AudioContext === 'undefined' || typeof RTCPeerConnection === 'undefined') {
        problem = 'unsupported';
        on = false;
        return false;
      }
      listen();
      if (mySeat == null) {
        return true;
      }
      if (talk && !(await openMic())) {
        on = false;
        return false;
      }
      if (on && mySeat != null) {
        join();
      }
      return on;
    },
    /* A listener who has now read the notice: the microphone, and every
     * link made again with it. Resolves to true, or false with problem(). */
    async enableTalk() {
      wantTalk = true;
      if (!on || mic || mySeat == null) {
        return on;
      }
      if (!(await openMic())) {
        return false;
      }
      join();
      return true;
    },
    /* Whether this pilot can be heard: voice on with a microphone. */
    canTalk: () => on && Boolean(mic),
    /* Where heard voices go for the replay (src/replay/voicerec.js), or
     * null. */
    setRecorder(r) {
      recorder = r;
    },
    disable() {
      if (!on) {
        return;
      }
      on = false;
      if (mySeat != null) {
        queue({ op: 'off' });
      }
      closeAll();
      closeMic();
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
    isOn: () => on,
    problem: () => problem,
    mode: () => mode,
    setMode(next) {
      mode = next === 'open' ? 'open' : 'ptt';
    },
    distance: () => distanceOn,
    setDistance(v) {
      distanceOn = Boolean(v);
    },
    /* Held silent (a replay plays) or not; applied at the next frame. */
    setHeld(v) {
      held = Boolean(v);
    },
    volume: volumeOf,
    setVolume(seat, v) {
      volumes.set(seat, Math.max(0, Math.min(VOLUME_MAX, v)));
    },
    /* The room said welcome: this pilot's seat, and voice starts over. */
    async welcomed(seat) {
      mySeat = seat;
      voiced.clear();
      if (!on) {
        return;
      }
      if (wantTalk && !mic && !(await openMic())) {
        on = false;
        return;
      }
      if (on && mySeat === seat) {
        join();
      }
    },
    /* The room is gone (left, failed): the links and the microphone go. */
    roomClosed() {
      mySeat = null;
      voiced.clear();
      volumes.clear();
      outbox.length = 0;
      closeAll();
      closeMic();
    },
    peerLeft(seat) {
      voiced.delete(seat);
      volumes.delete(seat);
      closeLink(seat);
    },
    onMessage,
    /*
     * Every tick (src/ui/voiceui.js TICK_MS). ptt: the talk key or button
     * is held. peers: [{ seat, dist }] for every pilot in the room, dist
     * metres or null when not flying here. Applies the mutes, the volumes
     * and the distance, and reads who is speaking.
     */
    frame(ptt, peers) {
      const now = performance.now();
      /* Every seat this page links or knows, the room's as the render loop
       * last saw it (which pauses while a world loads) and the links'. */
      const seats = new Set([...peers.map((p) => p.seat), ...links.keys(), ...voiced]);
      const muted = new Set([...seats].filter((seat) => isMuted(seat)));
      for (const seat of muted) {
        if (!mutedSeen.has(seat) && (links.has(seat) || voiced.has(seat))) {
          closeLink(seat);
          if (on && mySeat != null) {
            queue({ op: 'off', to: seat });
          }
        }
      }
      for (const seat of mutedSeen) {
        if (!muted.has(seat) && on && mic && mySeat != null && seats.has(seat)) {
          greet(seat);
        }
      }
      mutedSeen = muted;
      /* Made outside a click (a welcome after a reconnect), the context
       * waits for the page's next user activation. */
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const track = micTrack();
      if (track) {
        track.enabled = mode === 'open' || Boolean(ptt);
        talking = track.enabled && (mode === 'ptt' || (micAnalyser && rms(micAnalyser, buf) > SPEAKING_RMS));
      }
      const dist = new Map(peers.map((p) => [p.seat, p.dist]));
      for (const [seat, l] of links) {
        if (!l.gain) {
          continue;
        }
        l.level = rms(l.analyser, buf);
        if (l.level > SPEAKING_RMS) {
          l.speakingUntil = now + SPEAKING_HOLD_MS;
          if (l.rec && volumeOf(seat) > 0) {
            l.rec.spoke = true;
          }
        }
        const g = held ? 0 : volumeOf(seat) * (distanceOn ? distanceGain(dist.get(seat)) : 1);
        l.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      }
    },
    /* A pilot heard speaking now: a link, a voice, and not silenced here. */
    speaking(seat) {
      const l = links.get(seat);
      return Boolean(l && l.gain && performance.now() < l.speakingUntil && volumeOf(seat) > 0);
    },
    /* This pilot is sending their voice now. */
    talking: () => on && talking,
    /* 'off' (this pilot's voice is off, or theirs), 'connecting', 'up' or
     * 'failed', for the menu. */
    linkState(seat) {
      if (!on) {
        return 'off';
      }
      const l = links.get(seat);
      return l ? l.state : 'off';
    },
    /* For scripts/voicechat-two-page.js: each link's state, its received
     * track, the level, the gain, and the bytes each way. */
    async debug() {
      const out = [];
      for (const [seat, l] of links) {
        const row = {
          seat, n: l.n, offerer: l.offerer, relay: l.relay, state: l.state, pc: l.pc.connectionState, level: l.level,
          speaking: performance.now() < l.speakingUntil, sdp: l.pc.localDescription ? l.pc.localDescription.sdp.length : 0,
          gain: l.gain ? l.gain.gain.value : null, sent: 0, got: 0, packetsSent: 0, candidate: null,
        };
        const stats = await l.pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'outbound-rtp' && r.kind === 'audio') {
            row.sent = r.bytesSent;
            row.packetsSent = r.packetsSent;
          } else if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            row.got = r.bytesReceived;
          } else if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
            const local = stats.get(r.localCandidateId);
            row.candidate = local ? local.candidateType : null;
          }
        });
        out.push(row);
      }
      return { on, mode, seat: mySeat, talking: on && talking, problem, turn: turnIce.length, links: out };
    },
    /* The ICE servers a try with this relay uses, for the check. */
    iceServers,
    /* The received track from a seat, for the check's own analyser. */
    track(seat) {
      const l = links.get(seat);
      const r = l ? l.pc.getReceivers().find((x) => x.track && x.track.kind === 'audio') : null;
      return r ? r.track : null;
    },
  };
}
