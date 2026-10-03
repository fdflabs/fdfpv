/*
 * replay-voice-two-page.js: voices kept in replays, and the notice before
 * a microphone goes live (the owner, 2026-10-02; src/share/voice.js,
 * src/replay/voicerec.js, src/ui/voiceui.js).
 *
 *   SIM_GPU=1 npm run replay:voice
 *
 * Two headless pages of the real shell with Chromium's fake microphone (a
 * tone), in one room on a rooms server this check starts on a port of its
 * own. A has read the notice before; B has not. Both fly. What must hold:
 *
 *   - B turning voice on is asked first, with the notice; answering
 *     Listen only leaves voice on with no microphone: B hears A while A
 *     holds talk, and nothing of B reaches A while B holds it
 *   - B's Microphone row asks again; answering yes turns the microphone
 *     on, B is heard, and the answer is in B's settings
 *   - B's crash cam keeps A's voice (and never B's own), stamped on the
 *     room clock, at about OPUS_BPS; opened on the moment A spoke, the
 *     replay plays it, the live voices are held silent under the replay
 *     and come back when it closes; the movie's plan places it
 *   - A's crash cam keeps B's voice once B talks, and never A's own
 *   - no page error
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyInfo, openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { OPUS_BPS, PTT_KEY } from '../src/share/voice.js';
import { str } from '../src/strings/index.js';
import { SEGMENT_MS } from '../src/replay/voicerec.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* The fake microphone's tone arrives far over this; silence far under. */
const HEARD_RMS = 0.01;
const SILENT_RMS = 0.002;
/* A piece reaches the recorder when it closes: wait one out. */
const SEGMENT_WAIT_MS = SEGMENT_MS + 1500;
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

function seedFor(ack) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.voiceReplayAck = ack;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.voiceSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { voiceSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const DIALOG = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : null; })()";
async function answer(page, yes) {
  await page.sleep(700);
  await page.tap(yes ? 'Enter' : 'Escape');
}
async function hold(page, down) {
  await page.cdp.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', ...keyInfo(PTT_KEY) }, page.sessionId);
}
/* The RMS of what `page` receives from `seat` over `ms`. */
function inbound(page, seat, ms) {
  return page.evaluate(`(async () => {
    const track = window.__voice.track(${seat});
    if (!track) {
      return { max: 0, track: false };
    }
    window.__checkCtx ??= new AudioContext();
    const ctx = window.__checkCtx;
    await ctx.resume();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let max = 0;
    const end = performance.now() + ${ms};
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 50));
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) {
        s += v * v;
      }
      max = Math.max(max, Math.sqrt(s / buf.length));
    }
    src.disconnect();
    return { max, track: true };
  })()`);
}
const linked = (page, other) => page.until(`window.__voice.debug().then((d) => d.links.some((l) => l.seat === ${other} && l.pc === 'connected'))`, 30000).then(() => true, () => false);
/* What a page's crash cam holds of the room's voices, opened. */
const kept = (page) => page.evaluate(`(() => {
  const c = window.__crashCam.h().clip();
  if (!c || !c.voice) {
    return null;
  }
  return c.voice.pieces.map((p) => ({ seat: p.seat, from: p.from, to: p.to, bytes: p.bytes.length, mime: p.mime }));
})()`);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-replay-voice-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const origin = `http://127.0.0.1:${server.port}`;
console.log(`voices kept in replays, two pages, rooms at ${origin}`);
const url = `/index.html?rooms=${encodeURIComponent(origin)}`;
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(true), args: ARGS });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(false), args: ARGS });
const pages = [a, b];

try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    await p.tap('KeyZ');
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const seatA = (await a.evaluate('window.__rooms()')).seat;
  const seatB = (await b.evaluate('window.__rooms()')).seat;

  /* Voice on from the room screen, as a pilot does. */
  for (const p of pages) {
    await p.evaluate("window.__ui.show('friends'); true");
    await p.sleep(300);
    await p.evaluate("window.__ui.items().find((it) => it.id === 'voice-on').pick('on'); true");
  }
  await a.until('window.__voice.isOn()', 10000).catch(() => {});
  await b.until(`${DIALOG} != null`, 5000).catch(() => {});
  const asked = await b.evaluate(DIALOG);
  check('B, who has not read it, is shown the notice first; A, who has, is not', asked === str('voicechat.replay_title') && (await a.evaluate(DIALOG)) === null, String(asked));
  await answer(b, false);
  await b.until('window.__voice.isOn()', 10000).catch(() => {});
  const listen = await b.evaluate("({ on: window.__voice.isOn(), talk: window.__voice.canTalk(), ack: window.__ui.settings.voiceReplayAck, ids: window.__ui.items().map((it) => it.id) })");
  check('Listen only: voice on, no microphone, the Microphone row in place of Talk, nothing remembered',
    listen.on && !listen.talk && listen.ack !== true && listen.ids.includes('voice-mic') && !listen.ids.includes('voice-talk'), JSON.stringify(listen));
  check('the link comes up with B listening', (await linked(a, seatB)) && (await linked(b, seatA)));

  /* Into the air, so the crash cams record. */
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  await a.sleep(1500);
  await hold(a, true);
  const heardA = await inbound(b, seatA, 2500);
  await hold(a, false);
  check('listening, B hears A while A holds talk', heardA.track && heardA.max > HEARD_RMS, `max ${heardA.max.toFixed(4)}`);
  await hold(b, true);
  const fromB = await inbound(a, seatB, 1500);
  await hold(b, false);
  check('and nothing of B reaches A while B holds it', fromB.max < SILENT_RMS, `max ${fromB.max.toFixed(4)}, track ${fromB.track}`);

  /* B's own crash cam, opened: A's voice in it, B's own never. */
  await b.sleep(SEGMENT_WAIT_MS);
  const roomAtTalk = await b.evaluate('window.__rooms().roomNow');
  await b.evaluate('window.__crashCam.open(); true');
  await b.until("window.__craftState().mode === 'replay'", 10000);
  const piecesB = await kept(b);
  const fromA = (piecesB || []).filter((p) => p.seat === seatA);
  const secs = fromA.reduce((s, p) => s + (p.to - p.from) / 1000, 0);
  const bytes = fromA.reduce((s, p) => s + p.bytes, 0);
  check('B\'s replay keeps A\'s voice, stamped on the room clock, and never B\'s own', fromA.length > 0 && !(piecesB || []).some((p) => p.seat === seatB)
    && fromA.every((p) => p.to <= roomAtTalk + 1 && p.from > roomAtTalk - 60000), JSON.stringify(piecesB));
  console.log(`  info  ${fromA.length} pieces, ${secs.toFixed(1)} s, ${bytes} bytes: ${(bytes / Math.max(secs, 1e-3) * 8 / 1000).toFixed(1)} kbit/s against ${OPUS_BPS / 1000}`);
  check(`at about ${OPUS_BPS / 1000} kbit/s`, secs > 0 && bytes * 8 / secs < OPUS_BPS * 2, `${(bytes * 8 / secs / 1000).toFixed(1)} kbit/s`);
  /* The playhead on the middle of A's first piece. */
  const t = await b.evaluate(`(() => {
    const c = window.__crashCam.h().clip();
    const p = c.voice.pieces.find((x) => x.seat === ${seatA});
    const mid = (p.from + p.to) / 2;
    for (let k = 0; k < c.n; k += 1) {
      if (c.voice.clock[k] >= mid) {
        return c.time[k];
      }
    }
    return null;
  })()`);
  check('the clip has a row in A\'s speech', t != null, String(t));
  if (t != null) {
    await b.evaluate(`window.__crashCam.h().api.seek(${t}); window.__crashCam.h().api.togglePlay(); true`);
    await b.until(`window.__crashCam.h().voicesPlaying().includes(${seatA})`, 5000).catch(() => {});
    check('opened on it, the replay plays A\'s voice', (await b.evaluate('window.__crashCam.h().voicesPlaying()')).includes(seatA));
  }
  /* The live gain falls on a 50 ms time constant (voice.js frame). */
  await b.until(`window.__voice.debug().then((d) => d.links.find((l) => l.seat === ${seatA}).gain < 0.001)`, 3000).catch(() => {});
  const heldGain = await b.evaluate(`window.__voice.debug().then((d) => d.links.find((l) => l.seat === ${seatA}).gain)`);
  check('the live voices are held silent under the replay', heldGain != null && heldGain < 0.001, String(heldGain));
  const plan = await b.evaluate(`(async () => {
    const { soundPlan } = await import('/src/replay/soundtrack.js');
    const h = window.__crashCam.h();
    return soundPlan(h.clip(), h.view().edit).voices.length;
  })()`);
  check('the movie\'s plan places A\'s voice', plan > 0, `${plan} pieces`);
  await b.evaluate('window.__crashCam.h().api.close(); true');
  await b.until("window.__craftState().mode === 'flight'", 10000);
  await b.sleep(400);
  const backGain = await b.evaluate(`window.__voice.debug().then((d) => d.links.find((l) => l.seat === ${seatA}).gain)`);
  check('closed, the live voices are back', backGain > 0.5, String(backGain));

  /* B's Microphone row: the notice again; yes. */
  await b.evaluate("window.__ui.show('friends'); true");
  await b.sleep(300);
  await b.evaluate("window.__ui.items().find((it) => it.id === 'voice-mic').pick('on'); true");
  await b.until(`${DIALOG} != null`, 5000).catch(() => {});
  await answer(b, true);
  await b.until('window.__voice.canTalk()', 10000).catch(() => {});
  check('yes on the Microphone row: the microphone on, and the answer kept in the settings',
    (await b.evaluate('window.__voice.canTalk()')) && (await b.evaluate('window.__ui.settings.voiceReplayAck')) === true);
  await linked(a, seatB);
  await b.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await b.until("window.__craftState().mode === 'flight'", 400000).catch(() => {});
  await hold(b, true);
  const heardB = await inbound(a, seatB, 2500);
  await hold(b, false);
  check('now A hears B', heardB.max > HEARD_RMS, `max ${heardB.max.toFixed(4)}`);
  await a.sleep(SEGMENT_WAIT_MS);
  await a.evaluate('window.__crashCam.open(); true');
  await a.until("window.__craftState().mode === 'replay'", 10000);
  const piecesA = await kept(a);
  check('A\'s replay keeps B\'s voice, and never A\'s own', (piecesA || []).some((p) => p.seat === seatB) && !(piecesA || []).some((p) => p.seat === seatA), JSON.stringify(piecesA));
  await a.evaluate('window.__crashCam.h().api.close(); true');

  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  for (const p of pages) {
    await p.close();
  }
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
