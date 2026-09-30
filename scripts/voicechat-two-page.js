/*
 * voicechat-two-page.js: two headless pages of the real shell in one room,
 * talking. The check for voice chat (src/share/voice.js):
 *
 *   node scripts/voicechat-two-page.js            (npm run voicechat:twopage)
 *   node scripts/voicechat-two-page.js http://127.0.0.1:8797
 *
 * With no origin it starts edge/rooms/node.js itself on a port of its own
 * (never the default 8797), on a scratch SQLite file. Each page has
 * Chromium's fake microphone (a tone) and its permission granted, through
 * tests/lib/page.js's args. Page A makes a room, B joins it, both turn
 * voice on, and then, measured on B with Web Audio on the track B receives
 * from A (its RMS, B's own analyser, not the module's):
 *
 *   - the link comes up, peer to peer,
 *   - nothing arrives while A does not press talk (push to talk is the
 *     default),
 *   - A's voice arrives while A holds N, B shows A speaking, A shows
 *     itself talking, and it stops when A lets go,
 *   - B's volume for A at 0 puts B's gain for A at 0,
 *   - B mutes A (the safety mute): the link goes on both sides, and A
 *     holding N reaches B with nothing; unmuted, the link comes back and A
 *     is heard again,
 *   - open mic sends without the key,
 *
 * and prints what A's voice costs on the wire, from A's own RTP counters,
 * talking and not. When the rooms server hands out a TURN relay (the VM
 * after deploy/vm/deploy-turn.sh, or a local one: TURN_SECRET and
 * TURN_URLS in this check's environment go to the server it starts), A
 * also gathers a relay candidate through it with the credential the room
 * minted, over UDP and over TCP or TLS: the relay answers, the ports are
 * open and the secret is the one coturn holds. Without one that is said,
 * and nothing is counted for it. Nothing is kept: the pages go and the
 * server with them.
 *
 * One headless browser check at a time, as every two page check here: two
 * Chromiums on the software rasteriser are most of the machine.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyInfo, openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { PTT_KEY } from '../src/share/voice.js';
import { SPEAKING_MARK } from '../src/ui/voiceui.js';
import { RELAY_TCP, RELAY_UDP } from '../src/share/roomwire.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const given = String(process.argv[2] || '').replace(/\/+$/, '');

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

/* Received RMS under which a track is silent, and over which it carries
 * the fake microphone's tone. Measured on this check's first runs: silence
 * reads 0 exactly (a disabled track sends digital silence), the tone well
 * over 0.05. */
const SILENT_RMS = 0.002;
const HEARD_RMS = 0.01;

/* Chromium's fake capture device and its permission, and audio that may
 * start without a click, since nobody clicks a headless page. */
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

function seedFor(id) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.voiceSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { voiceSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

let scratch = null;
let rooms = null;
let origin = given;
if (!given) {
  const { startRooms } = await import('../edge/rooms/node.js');
  scratch = mkdtempSync(join(tmpdir(), 'voicechat-two-page-'));
  rooms = await startRooms({
    db: join(scratch, 'rooms.db'), port: 0, turnSecret: process.env.TURN_SECRET || '', turnUrls: process.env.TURN_URLS || '',
  });
  origin = `http://127.0.0.1:${rooms.port}`;
}
console.log(`voice chat, two pages, rooms at ${origin}${given ? '' : ' (edge/rooms/node.js, started here)'}`);

/* The RMS of what `page` receives from `seat` over `ms`, sampled every
 * 50 ms by an analyser of the check's own on the received track. */
function inbound(page, seat, ms) {
  return page.evaluate(`(async () => {
    const track = window.__voice.track(${seat});
    if (!track) {
      return { max: 0, mean: 0, track: false };
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
    let sum = 0;
    let n = 0;
    const end = performance.now() + ${ms};
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 50));
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) {
        s += v * v;
      }
      const r = Math.sqrt(s / buf.length);
      max = Math.max(max, r);
      sum += r;
      n += 1;
    }
    src.disconnect();
    return { max, mean: sum / n, track: true };
  })()`);
}

/* VOICECHAT_SHOTS=dir keeps a picture of B's room screen while A talks;
 * a picture is evidence for one round, so it never goes in the repository. */
async function shot(page, name) {
  if (!process.env.VOICECHAT_SHOTS) {
    return;
  }
  await mkdir(process.env.VOICECHAT_SHOTS, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(process.env.VOICECHAT_SHOTS, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const fmt = (r) => `max ${r.max.toFixed(4)}, mean ${r.mean.toFixed(4)}${r.track ? '' : ', no track'}`;
const debug = (page) => page.evaluate('window.__voice.debug()');

/* A's voice as A sends it to `seat`, over `ms`: payload kb/s from bytesSent,
 * packets a second, and the wire's kb/s with each packet's IPv4, UDP, RTP
 * and SRTP headers (20 + 8 + 12 + 10 bytes, plus 8 of RTP header
 * extensions as Chrome sends them for audio). */
async function sending(page, seat, ms) {
  const one = (await debug(page)).links.find((l) => l.seat === seat);
  await page.sleep(ms);
  const two = (await debug(page)).links.find((l) => l.seat === seat);
  const s = ms / 1000;
  const bytes = two.sent - one.sent;
  const packets = two.packetsSent - one.packetsSent;
  return { kbps: (bytes * 8) / s / 1000, pps: packets / s, wire: ((bytes + packets * 58) * 8) / s / 1000 };
}

async function hold(page, code, down) {
  await page.cdp.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', ...keyInfo(code) }, page.sessionId);
}

const url = `/index.html?rooms=${encodeURIComponent(origin)}`;
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400'), args: ARGS });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450'), args: ARGS });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
  }
  const seatA = (await a.evaluate('window.__rooms()')).seat;
  const seatB = (await b.evaluate('window.__rooms()')).seat;
  check('two pilots in one room', /^[A-Z0-9]{6}$/.test(code) && seatA && seatB && seatA !== seatB, `${code} ${seatA} ${seatB}`);

  check('voice is off until the pilot turns it on', (await debug(a)).on === false && (await debug(b)).on === false);
  /* Turned on the way a pilot does: the room screen's Voice row, On. */
  for (const p of [a, b]) {
    await p.evaluate("window.__ui.show('friends'); true");
    await p.sleep(300);
    await p.evaluate("window.__ui.items().find((it) => it.id === 'voice-on').pick('on'); true");
  }
  for (const p of [a, b]) {
    await p.until('window.__voice.isOn()', 10000).catch(() => {});
  }
  const onA = await a.evaluate('window.__voice.isOn()');
  const onB = await b.evaluate('window.__voice.isOn()');
  check('each turns it on from the room screen, the microphone granted', onA === true && onB === true, `${onA} ${onB}`);
  await b.sleep(300);
  const ids = await b.evaluate('window.__ui.items().map((it) => it.id)');
  check('the room screen then has Talk, Distance voice and a row for the other pilot', ['voice-talk', 'voice-distance', `voice-peer-${seatA}`].every((id) => ids.includes(id)),
    ids.filter((id) => /^voice/.test(id)).join(','));
  for (const [p, other] of [[a, seatB], [b, seatA]]) {
    await p.until(`window.__voice.debug().then((d) => d.links.some((l) => l.seat === ${other} && l.pc === 'connected'))`, 30000).catch(() => {});
  }
  const da = await debug(a);
  const db = await debug(b);
  const la = da.links.find((l) => l.seat === seatB);
  const lb = db.links.find((l) => l.seat === seatA);
  check('the link comes up on both sides', la && lb && la.pc === 'connected' && lb.pc === 'connected', JSON.stringify([la, lb]));
  check('the lower seat offered, peer to peer with no relay', la && lb && la.offerer === (seatA < seatB) && lb.offerer === (seatB < seatA)
    && !la.relay && ['host', 'srflx', 'prflx'].includes(la.candidate), la ? `${la.candidate}` : '');
  check('push to talk is the default', da.mode === 'ptt' && db.mode === 'ptt');

  const quiet = await inbound(b, seatA, 2000);
  check('A not pressing talk: B receives silence', quiet.track && quiet.max < SILENT_RMS, fmt(quiet));
  const idle = await sending(a, seatB, 3000);

  await hold(a, PTT_KEY, true);
  await a.sleep(300);
  const heard = await inbound(b, seatA, 3000);
  check('A holding N: B receives A\'s voice', heard.max > HEARD_RMS, fmt(heard));
  const talk = await sending(a, seatB, 3000);
  const shown = await b.evaluate(`window.__voice.debug().then((d) => d.links.find((l) => l.seat === ${seatA}).speaking)`);
  check('B shows A speaking', shown === true || (await b.until(`window.__voice.speaking(${seatA})`, 3000).then(() => true, () => false)));
  const rowMark = `(() => { const l = document.querySelector('[data-row-id="voice-peer-${seatA}"] .row-label'); return l ? l.textContent : null; })()`;
  const marked = await b.until(`(${rowMark} || '').startsWith(${JSON.stringify(SPEAKING_MARK)})`, 3000).then(() => true, () => false);
  check('on A\'s row in B\'s room screen too', marked, await b.evaluate(rowMark));
  if (process.env.VOICECHAT_SHOTS) {
    await b.evaluate(`window.__ui.setCursor(window.__ui.items().findIndex((it) => it.id === 'voice-peer-${seatA}')); true`);
    await b.sleep(300);
    await shot(b, 'b-room-screen-a-speaking');
    await shot(a, 'a-talking');
  }
  check('A shows itself talking', await a.evaluate('window.__voice.talking()'));
  /* The fake microphone beeps rather than talks, so each mark is waited
   * for: it is lit only while a beep is in the last SPEAKING_HOLD_MS. */
  check('and A\'s name over its aircraft carries the speaking mark',
    await b.until(`window.__voiceUi.label(${seatA}, 'A') === ${JSON.stringify(`${SPEAKING_MARK} A`)}`, 3000).then(() => true, () => false));
  await hold(a, PTT_KEY, false);
  await a.sleep(500);
  const after = await inbound(b, seatA, 2000);
  check('A lets go: silence again', after.max < SILENT_RMS, fmt(after));
  check('and A no longer talking', !(await a.evaluate('window.__voice.talking()')));

  /* All the way down on A's row, the way a pilot does: Left, four times. */
  for (let i = 0; i < 4; i += 1) {
    await b.evaluate(`window.__ui.items().find((it) => it.id === 'voice-peer-${seatA}').adjust(-1); true`);
  }
  check('B turns A all the way down on A\'s row: it says muted', (await b.evaluate(`window.__voice.volume(${seatA})`)) === 0);
  /* The gain glides there (a 50 ms time constant, so no click). */
  await b.until(`window.__voice.debug().then((d) => d.links.find((l) => l.seat === ${seatA}).gain < 0.001)`, 3000).catch(() => {});
  const zero = (await debug(b)).links.find((l) => l.seat === seatA);
  check('B turns A all the way down: B\'s gain for A is 0', zero && zero.gain < 0.001, zero ? `${zero.gain}` : '');
  for (let i = 0; i < 4; i += 1) {
    await b.evaluate(`window.__ui.items().find((it) => it.id === 'voice-peer-${seatA}').adjust(1); true`);
  }

  await b.evaluate(`window.__roomMute(${seatA}, true); true`);
  await b.until(`window.__voice.debug().then((d) => !d.links.some((l) => l.seat === ${seatA}))`, 5000).catch(() => {});
  await a.until(`window.__voice.debug().then((d) => !d.links.some((l) => l.seat === ${seatB}))`, 10000).catch(() => {});
  check('B mutes A: B drops the link', !(await debug(b)).links.some((l) => l.seat === seatA));
  check('and A is told, and drops it too', !(await debug(a)).links.some((l) => l.seat === seatB));
  await hold(a, PTT_KEY, true);
  await a.sleep(300);
  const muted = await inbound(b, seatA, 2000);
  check('A holding N reaches the pilot who muted them with nothing', !muted.track || muted.max < SILENT_RMS, fmt(muted));
  await hold(a, PTT_KEY, false);

  await b.evaluate(`window.__roomMute(${seatA}, false); true`);
  for (const [p, other] of [[a, seatB], [b, seatA]]) {
    await p.until(`window.__voice.debug().then((d) => d.links.some((l) => l.seat === ${other} && l.pc === 'connected'))`, 30000).catch(() => {});
  }
  check('unmuted, the link comes back', (await debug(b)).links.some((l) => l.seat === seatA && l.pc === 'connected'));
  await hold(a, PTT_KEY, true);
  await a.sleep(300);
  const back = await inbound(b, seatA, 3000);
  check('and A is heard again', back.max > HEARD_RMS, fmt(back));
  await hold(a, PTT_KEY, false);

  await a.evaluate("window.__voice.setMode('open'); true");
  await a.sleep(300);
  const open = await inbound(b, seatA, 3000);
  check('open mic: heard with no key', open.max > HEARD_RMS, fmt(open));

  const sdpBytes = Math.max(...[...(await debug(a)).links, ...(await debug(b)).links].map((l) => l.sdp));
  console.log('\n  A\'s voice to B, from A\'s RTP counters:');
  console.log(`    push to talk held: ${talk.kbps.toFixed(1)} kb/s Opus payload, ${talk.pps.toFixed(1)} packets/s, ${talk.wire.toFixed(1)} kb/s on the wire`);
  console.log(`    not talking:       ${idle.kbps.toFixed(1)} kb/s Opus payload, ${idle.pps.toFixed(1)} packets/s, ${idle.wire.toFixed(1)} kb/s on the wire`);
  console.log(`    the largest offer or answer: ${sdpBytes} bytes`);

  /* The relay, when there is one: a candidate through it for each try's
   * transport, with the room's credential, and nothing but the relay. */
  if ((await debug(a)).turn > 0) {
    for (const [relay, name] of [[RELAY_UDP, 'UDP'], [RELAY_TCP, 'TCP or TLS']]) {
      const got = await a.evaluate(`(async () => {
        const pc = new RTCPeerConnection({ iceServers: window.__voice.iceServers(${relay}), iceTransportPolicy: 'relay' });
        pc.addTransceiver('audio');
        const found = [];
        pc.onicecandidate = (e) => {
          if (e.candidate && e.candidate.type === 'relay') {
            found.push(e.candidate.relayProtocol || 'relay');
          }
        };
        await pc.setLocalDescription(await pc.createOffer());
        const end = performance.now() + 10000;
        while (pc.iceGatheringState !== 'complete' && performance.now() < end) {
          await new Promise((r) => setTimeout(r, 100));
        }
        pc.close();
        return found;
      })()`);
      check(`the TURN relay gives a relay candidate over ${name}, with the room's credential`, got.length > 0, got.join(',') || 'none');
    }
  } else {
    console.log('  (this rooms server hands out no TURN relay: its checks are not run)');
  }

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  if (rooms) {
    await rooms.stop();
    rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
