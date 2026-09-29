/*
 * board-live-check.js: every feature of the simulator that needs the board,
 * against a real board, through the real page.
 *
 *     BOARD_ADMIN_FILE=/home/brains/Desktop/fdfpv-loop/online-tracks/BOARD-ADMIN.txt \
 *       npm run board:live [-- --board=https://129.151.39.48/board] [--page=https://fdflabs.github.io/fdfpv/]
 *       [--only=paste]
 *
 * The board is PRODUCTION_BOARD_ORIGIN from src/share/board.js unless
 * --board names another. The page is this checkout served on loopback and
 * told the board with ?board=, unless --page names a deployed simulator,
 * which is then opened as it is, so it finds the board with its own
 * constant. BOARD_ADMIN_FILE is the board admin's sign in, the address on
 * its first line and the password on its second (deploy/vm/README.md);
 * the check signs in with it to read the private bug list and to take its
 * own track down.
 *
 * In order:
 *
 *   1. the board answers, on Postgres, and the bug list is private,
 *   2. F8 files a bug through the real form, the form says Sent with the
 *      ticket's id, and the signed in admin finds that ticket,
 *   3. the flight feel form sends, and the admin finds that ticket too,
 *   3b. a screenshot is pasted into F8's form with a synthetic paste
 *      carrying a File, the way a Ctrl+V with an image on the clipboard
 *      arrives; it shows as the chip [Image 1], goes with the report, and
 *      the admin reads it back as a WebP under the board's cap while an
 *      anonymous read of it is a 401,
 *   4. the builder publishes a track: a ring of a gate and two sky hoops on
 *      the Alps is put in this browser's library, opened in the builder the
 *      way My tracks opens one, and published with P through the shell's
 *      own dialog; the board lists it,
 *   5. a lap of it, synthesised by tests/lib/synthlap.js and signed with a
 *      pilot key the way the shell signs one, is posted, verified by the
 *      board with the simulator's own detector, and listed with its ghost,
 *   6. two pages, the shell and the track's orbit thumbnail, join the
 *      track's live room with src/share/live.js and one sees the other's
 *      frame,
 *   7. the shell's visit reached the statistics counters,
 *   8. the board's own page lists the track and its time, and its bugs page
 *      lists the check's ticket for the signed in admin and shows the
 *      pasted screenshot on its ticket,
 *   9. clean up: the track comes off the board with its time, and both
 *      tickets are closed as wontfix.
 *
 * Everything it makes is named with a "check" prefix. What it cannot take
 * back, it says at the end.
 *
 * --only=paste runs 1, 3b and the screenshot half of 8, then cleans up: the
 * one check to run against production after a board deploy that touched
 * the bug form, without publishing a track or counting a visit twice.
 *
 * On a local page the tracks server is off (src/share/cloud.js asks no
 * tracks server from loopback), so the track saved into the library in
 * step 4 goes nowhere else. A deployed page would sync it to the tracks
 * server too, which this does not clean up, so --page says so and asks for
 * TRACKS_ADMIN_SECRET to delete it there as well.
 *
 * Headless Chromium through tests/lib/page.js, which mutes it.
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

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { B, key } from '../tests/lib/buildkeys.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { syntheticLapBytes } from '../tests/lib/synthlap.js';
import { PRODUCTION_BOARD_ORIGIN } from '../src/share/board.js';
import { PRODUCTION_TRACKS_ORIGIN } from '../src/share/cloud.js';
import { createIdentity, memoryStorage } from '../src/share/identity.js';
import { ghostToBase64 } from '../src/share/ghostdata.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (!m) {
    console.error(`board-live-check: unknown argument ${a}`);
    process.exit(2);
  }
  opts[m[1]] = m[2];
}
if (opts.only && opts.only !== 'paste') {
  console.error(`board-live-check: --only takes paste, not ${opts.only}`);
  process.exit(2);
}
const trim = (v) => String(v || '').trim().replace(/\/+$/, '');
const BOARD = trim(opts.board || PRODUCTION_BOARD_ORIGIN);
const PAGE = opts.page ? String(opts.page) : '';
const MAP = 'alps';
const STAMP = Date.now().toString(36);
const PILOT = `check ${STAMP}`;
const REPORTER = `check ${STAMP}`;

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
  return ok;
}
const left = [];

async function readAdmin() {
  const path = process.env.BOARD_ADMIN_FILE;
  if (!path) {
    throw new Error('BOARD_ADMIN_FILE is not set: the board admin sign in, address then password');
  }
  const [email, password] = (await readFile(path, 'utf8')).split('\n');
  return { email: email.trim(), password: password.trim() };
}

async function board(path, init = {}) {
  const res = await fetch(`${BOARD}${path}`, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  return { status: res.status, body };
}

const json = (token, body) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

/* The five inch, asked for, no gamepad: the same seat every shell check
 * starts from, so no first run question stands between F8 and the form. */
function seed() {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.feelAsked = true;
    s.fpsCap = 0;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused; the checks below will say so */ }`];
}

async function navigate(page, url) {
  await page.cdp.send('Page.navigate', { url }, page.sessionId);
}

/* A module of the simulator, imported by the page it is in, against the
 * page's own address so a deployed page under /fdfpv/ finds it too. `path`
 * is from the simulator's root; `depth` is how many directories below the
 * root the page is (the orbit thumbnail is two, in src/share/). */
const imp = (path, depth = 0) => `import(new URL(${JSON.stringify('../'.repeat(depth) + path)}, document.baseURI).href)`;

const VISIBLE = (sel) => `(() => { const d = document.querySelector(${JSON.stringify(sel)}); return Boolean(d && d.offsetParent !== null); })()`;

async function fill(page, box, values) {
  await page.evaluate(`(() => {
    const f = [...document.querySelectorAll(${JSON.stringify(`${box} .name-dialog-input`)})];
    const v = ${JSON.stringify(values)};
    v.forEach((value, i) => {
      if (value == null) { return; }
      f[i].value = value;
      f[i].dispatchEvent(new Event('input', { bubbles: true }));
      f[i].dispatchEvent(new Event('change', { bubbles: true }));
    });
    return f.length;
  })()`);
}

/*
 * 3b. A screenshot through F8, pasted. A real PNG larger than the form's
 * 1920 pixel edge, so the downscale has work to do, arrives in a paste
 * event on the textarea the pilot would be typing in. A text paste goes
 * first and must be left alone: no chip, default not prevented, so the
 * browser still inserts the text. Returns the ticket id, or ''.
 */
async function pasteStep(shell, token) {
  console.log('3b. a screenshot pasted into F8');
  await shell.until('!document.querySelector(".name-dialog") || document.querySelector(".name-dialog").hidden', 10000);
  await shell.tap('F8');
  await shell.until(VISIBLE('.name-dialog-box.bug .shot-drop'), 20000);
  const pasted = await shell.evaluate(`(async () => {
    const box = document.querySelector('.name-dialog-box.bug');
    const what = box.querySelector('textarea.name-dialog-input');
    what.focus();
    const words = new DataTransfer();
    words.setData('text/plain', 'words, not a picture');
    const textPaste = new ClipboardEvent('paste', { clipboardData: words, bubbles: true, cancelable: true });
    what.dispatchEvent(textPaste);
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1350;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 2400, 1350);
    grad.addColorStop(0, '#7dffb4');
    grad.addColorStop(1, '#e8a8b8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2400, 1350);
    g.fillStyle = '#141c16';
    g.font = '120px sans-serif';
    g.fillText(${JSON.stringify(`check ${STAMP}`)}, 120, 700);
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    const clip = new DataTransfer();
    clip.items.add(new File([png], 'screenshot.png', { type: 'image/png' }));
    const imagePaste = new ClipboardEvent('paste', { clipboardData: clip, bubbles: true, cancelable: true });
    what.dispatchEvent(imagePaste);
    return {
      textPrevented: textPaste.defaultPrevented,
      imagePrevented: imagePaste.defaultPrevented,
      chips: box.querySelectorAll('.shot-chip').length,
      pngBytes: png.size,
    };
  })()`);
  say(!pasted.textPrevented, 'a text paste into the textarea is left to paste as text');
  say(pasted.imagePrevented && pasted.chips === 1, `an image paste attaches one chip (${pasted.chips}) from a ${pasted.pngBytes} byte PNG`);
  await shell.until("(() => { const t = document.querySelector('.name-dialog-box.bug .shot-chip:not(.pending) .shot-thumb'); return Boolean(t && t.complete && t.naturalWidth); })()", 30000).catch(() => {});
  const chip = await shell.evaluate(`(() => {
    const chip = document.querySelector('.name-dialog-box.bug .shot-chip');
    const thumb = chip && chip.querySelector('.shot-thumb');
    return {
      label: chip ? chip.querySelector('.shot-label').textContent : '',
      pending: chip ? chip.classList.contains('pending') : true,
      type: thumb ? (thumb.src.match(/^data:([^;]+)/) || [])[1] : '',
      w: thumb ? thumb.naturalWidth : 0,
      h: thumb ? thumb.naturalHeight : 0,
    };
  })()`);
  say(chip.label === '[Image 1]' && !chip.pending, `the chip reads ${JSON.stringify(chip.label)} with its thumbnail`);
  say(chip.w === 1920 && chip.h === 1080 && (chip.type === 'image/webp' || chip.type === 'image/jpeg'),
    `and was shrunk to ${chip.w} by ${chip.h}, ${chip.type}`);
  const title = `check: pasted screenshot ${STAMP}`;
  await fill(shell, '.name-dialog-box.bug', [
    'visual', title,
    'Filed by scripts/board-live-check.js to prove a pasted screenshot reaches the board. Not a real report.',
    null, null, REPORTER,
  ]);
  await shell.evaluate("document.querySelector('.name-dialog-box.bug .name-dialog-row .name-dialog-btn.on').click(), true");
  await shell.until("(() => { const h = document.querySelector('.name-dialog-box h2'); return h && /^(Sent|Could)/.test(h.textContent) || document.querySelector('.name-dialog-err')?.textContent; })()", 60000).catch(() => {});
  const sent = await shell.evaluate("({ h: document.querySelector('.name-dialog-box h2')?.textContent || '', lede: document.querySelector('.name-dialog-box .lede')?.textContent || '', err: document.querySelector('.name-dialog-err')?.textContent || '' })");
  const id = (sent.lede.match(/bug-[0-9a-f]{8}/) || [''])[0];
  say(sent.h === 'Sent' && Boolean(id), `the form says ${JSON.stringify(sent.h)}: ${sent.lede || sent.err}`);
  await shell.evaluate("document.querySelector('.name-dialog-box .name-dialog-btn.on')?.click(), true");
  if (!id) {
    return '';
  }
  const one = await board(`/api/bugs/${id}`, { headers: { authorization: `Bearer ${token}` } });
  const img = one.status === 200 && one.body.images ? one.body.images[0] : null;
  say(Boolean(img) && one.body.images.length === 1 && img.size <= 1_000_000,
    `the signed in admin's ticket lists it: ${JSON.stringify(one.body && one.body.images)}`);
  const res = await fetch(`${BOARD}/api/bugs/${id}/images/1`, { headers: { authorization: `Bearer ${token}` } });
  const bytes = Buffer.from(await res.arrayBuffer());
  const webp = bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  say(res.status === 200 && (webp || jpeg) && res.headers.get('content-type') === img.type,
    `and fetches its ${bytes.length} bytes as ${res.headers.get('content-type')}`);
  const anon = await fetch(`${BOARD}/api/bugs/${id}/images/1`);
  say(anon.status === 401, `an anonymous read of the screenshot is a 401: ${anon.status}`);
  return id;
}

/* The inbox, signed in, opens the pasted ticket and draws its thumbnail,
 * linked to the full size image. The shell is on the board's /bugs page. */
async function pasteInbox(shell, id) {
  const row = `[...document.querySelectorAll('.ticket')].find((b) => b.querySelector('.id')?.textContent === ${JSON.stringify(id)})`;
  await shell.until(`Boolean(${row})`, 30000).catch(() => {});
  await shell.evaluate(`(() => { const r = ${row}; if (r) { r.click(); } return Boolean(r); })()`);
  await shell.until("(() => { const i = document.querySelector('.shot img'); return Boolean(i && i.complete && i.naturalWidth); })()", 30000).catch(() => {});
  const shown = await shell.evaluate(`(() => {
    const i = document.querySelector('.shot img');
    const a = document.querySelector('a.shot');
    return { w: i ? i.naturalWidth : 0, src: i ? i.src.slice(0, 5) : '', href: a ? a.href.slice(0, 5) : '', label: a ? a.textContent : '' };
  })()`);
  say(shown.w === 1920 && shown.src === 'blob:' && shown.href === 'blob:',
    `${BOARD}/bugs shows ${id}'s screenshot, ${shown.w} wide, a thumbnail linking to the full image (${shown.label})`);
}

async function main() {
  console.log(`board ${BOARD}, page ${PAGE || 'this checkout on loopback'}`);
  if (!opts.board) {
    say(BOARD === 'https://129.151.39.48/board', `PRODUCTION_BOARD_ORIGIN is the VM's board: ${PRODUCTION_BOARD_ORIGIN}`);
  }

  /* 1. The board itself. */
  console.log('1. the board');
  const health = await board('/api/health').catch((e) => ({ status: 0, body: String(e) }));
  if (!say(health.status === 200 && health.body.ok === true, `answers /api/health: ${health.status} ${JSON.stringify(health.body)}`)) {
    return;
  }
  say(health.body.store === 'postgres' || Boolean(opts.board), `stores in ${health.body.store}`);
  const admin = await readAdmin();
  const login = await board('/api/admin/login', json('', admin));
  const token = login.body && login.body.token;
  say(login.status === 200 && Boolean(token), `the admin in BOARD_ADMIN_FILE signs in: ${login.status}`);
  const anon = await board('/api/bugs?status=open');
  say(anon.status === 401, `the bug list is private without a token: ${anon.status}`);
  const statsBefore = await board('/api/stats');
  const visitsBefore = statsBefore.body && statsBefore.body.today ? statsBefore.body.today.visits : null;
  say(statsBefore.status === 200 && Number.isFinite(visitsBefore), `site statistics answer, ${visitsBefore} visit(s) today`);

  const pageUrl = (q) => `/index.html?${q}&board=${encodeURIComponent(BOARD)}`;
  const shell = await openPage({ root, width: 1280, height: 720, url: pageUrl(`map=${MAP}`), seed: seed() });
  let orbit = null;
  let trackId = '';
  const tickets = [];
  try {
    if (PAGE) {
      const u = new URL(PAGE);
      u.searchParams.set('map', MAP);
      if (opts.board) {
        u.searchParams.set('board', BOARD);
      }
      await navigate(shell, u.href);
    }
    await shell.until('!!window.__shellReady', 240000);
    await shell.until('window.__map && window.__map().ready', 300000);
    const seen = await shell.evaluate(`${imp('src/share/board.js')}.then((m) => m.boardOrigin())`);
    say(trim(seen) === BOARD, `the page asks the board at ${seen}`);

    if (opts.only === 'paste') {
      const pastedId = await pasteStep(shell, token);
      if (pastedId) {
        tickets.push(pastedId);
        const errorsBefore = shell.errors.length;
        /* The sign in lives in the board origin's sessionStorage, so the
         * tab goes there before it is written. */
        await navigate(shell, `${BOARD}/`);
        await shell.until(`location.href.startsWith(${JSON.stringify(BOARD)}) && document.readyState === 'complete'`, 30000);
        await shell.evaluate(`sessionStorage.setItem('webfpv.board.admin.v1', ${JSON.stringify(token)}), true`);
        await navigate(shell, `${BOARD}/bugs`);
        await pasteInbox(shell, pastedId);
        const pageErrors = shell.errors.slice(errorsBefore);
        say(pageErrors.length === 0, `no errors on the bugs page${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
      }
      return;
    }

    /* 2. A bug, through F8. */
    console.log('2. a bug, through F8');
    await shell.tap('F8');
    await shell.until(VISIBLE('.name-dialog-box.bug'), 20000);
    const bugTitle = `check: board live check ${STAMP}`;
    await fill(shell, '.name-dialog-box.bug', [
      'other', bugTitle,
      'Filed by scripts/board-live-check.js to prove the F8 form reaches the board. Not a real report.',
      null, null, REPORTER,
    ]);
    await shell.evaluate("document.querySelector('.name-dialog-box.bug .name-dialog-btn.on').click(), true");
    await shell.until("(() => { const h = document.querySelector('.name-dialog-box h2'); return h && /^(Sent|Could)/.test(h.textContent) || document.querySelector('.name-dialog-err')?.textContent; })()", 30000).catch(() => {});
    const sent = await shell.evaluate("({ h: document.querySelector('.name-dialog-box h2')?.textContent || '', lede: document.querySelector('.name-dialog-box .lede')?.textContent || '', err: document.querySelector('.name-dialog-err')?.textContent || '' })");
    const bugId = (sent.lede.match(/bug-[0-9a-f]{8}/) || [''])[0];
    say(sent.h === 'Sent' && Boolean(bugId), `the form says ${JSON.stringify(sent.h)}: ${sent.lede || sent.err}`);
    await shell.evaluate("document.querySelector('.name-dialog-box .name-dialog-btn.on')?.click(), true");
    if (bugId) {
      tickets.push(bugId);
      const listed = await board('/api/bugs?status=open', { headers: { authorization: `Bearer ${token}` } });
      const row = listed.status === 200 && listed.body.bugs.find((b) => b.id === bugId);
      say(Boolean(row) && row.title === bugTitle, `the signed in admin finds ${bugId} in the open list`);
      const one = await board(`/api/bugs/${bugId}`, { headers: { authorization: `Bearer ${token}` } });
      say(one.status === 200 && one.body.context && one.body.context.map, `and reads it whole, with the page's context (map ${one.body && one.body.context && one.body.context.map})`);
    }

    /* 3. The flight feel form, through F8's other door. */
    console.log('3. the flight feel form');
    await shell.until('!document.querySelector(".name-dialog") || document.querySelector(".name-dialog").hidden', 10000);
    await shell.tap('F8');
    await shell.until(VISIBLE('.name-dialog-box.bug .name-dialog-door'), 20000);
    await shell.evaluate("document.querySelector('.name-dialog-box.bug .name-dialog-door').click(), true");
    await shell.until(VISIBLE('.name-dialog-box.feel'), 20000);
    await shell.evaluate("document.querySelector('.name-dialog-box.feel .feel-chip').click(), true");
    await shell.evaluate(`(() => {
      const box = document.querySelector('.name-dialog-box.feel');
      const words = box.querySelector('textarea.name-dialog-input');
      words.value = ${JSON.stringify(`Sent by scripts/board-live-check.js ${STAMP}. Not a real report.`)};
      const inputs = [...box.querySelectorAll('input.name-dialog-input')];
      inputs[inputs.length - 1].value = ${JSON.stringify(REPORTER)};
      box.querySelector('.name-dialog-btn.on').click();
      return true;
    })()`);
    await shell.until("(() => { const h = document.querySelector('.name-dialog-box h2'); return h && h.textContent === 'Thanks' || document.querySelector('.name-dialog-err')?.textContent; })()", 30000).catch(() => {});
    const thanks = await shell.evaluate("({ h: document.querySelector('.name-dialog-box h2')?.textContent || '', err: document.querySelector('.name-dialog-err')?.textContent || '' })");
    say(thanks.h === 'Thanks', `the feel form says ${JSON.stringify(thanks.h)}${thanks.err ? `: ${thanks.err}` : ''}`);
    await shell.evaluate("document.querySelector('.name-dialog-box .name-dialog-btn.on')?.click(), true");
    const feels = await board('/api/bugs?kind=feel', { headers: { authorization: `Bearer ${token}` } });
    const feel = feels.status === 200 && feels.body.bugs.find((b) => b.reporter === REPORTER);
    say(Boolean(feel), `the signed in admin finds it among the feel tickets${feel ? `: ${feel.id} ${JSON.stringify(feel.title)}` : ''}`);
    if (feel) {
      tickets.push(feel.id);
    }

    const pastedId = await pasteStep(shell, token);
    if (pastedId) {
      tickets.push(pastedId);
    }

    /* 4. Publish from the builder. */
    console.log('4. publish a track from the builder');
    await shell.until('!document.querySelector(".name-dialog") || document.querySelector(".name-dialog").hidden', 10000);
    const doc = mapTrackDocument({
      map: MAP, name: `check ${STAMP}`, types: ['gate', 'hoop250', 'hoop175'], radius: 40,
    });
    await shell.evaluate(`${imp('src/trackbuilder/storage.js')}.then((m) => m.saveTrack(${JSON.stringify(doc)}))`);
    await shell.evaluate(`window.__ui.onBuild({ map: ${JSON.stringify(MAP)}, id: ${JSON.stringify(doc.id)} }).then(() => true)`);
    await shell.until(`${B('.state')} === 'building' && ${B('.doc.id')} === ${JSON.stringify(doc.id)}`, 120000);
    say(true, `the builder opened ${doc.id}, a gate and two sky hoops on ${MAP}`);
    await key(shell, 'KeyP');
    await shell.until(VISIBLE('.name-dialog-box'), 10000);
    const fields = await shell.evaluate("[...document.querySelectorAll('.name-dialog-input')].map((f) => f.dataset.key)");
    say(fields.join() === 'course,author', `P opens the publish dialog asking for ${fields.join(' and ')}`);
    const trackName = `check ${STAMP}`;
    await shell.evaluate(`(() => {
      const f = [...document.querySelectorAll('.name-dialog-input')];
      f[0].value = ${JSON.stringify(trackName)};
      f[1].value = ${JSON.stringify(PILOT)};
      f[1].focus();
      return true;
    })()`);
    await shell.tap('Enter');
    await shell.until(`/Published|Could not publish/.test(${B('.message')})`, 60000).catch(() => {});
    const message = await shell.evaluate(B('.message'));
    say(/Published/.test(message), `the builder says ${JSON.stringify(message)}`);
    const list = await board('/api/tracks');
    const listed = list.status === 200 && list.body.tracks.find((t) => t.name === trackName);
    say(Boolean(listed) && listed.map === MAP && listed.gates === 3, `the board lists it${listed ? `: ${listed.id} on ${listed.map}, ${listed.gates} gates` : ''}`);
    trackId = listed ? listed.id : '';

    if (trackId) {
      /* 5. A verified lap. */
      console.log('5. a verified lap');
      const stored = await board(`/api/tracks/${trackId}/document`);
      const storedDoc = stored.body && (stored.body.document || stored.body);
      const lap = syntheticLapBytes(storedDoc);
      const ghost = ghostToBase64(lap.bytes);
      const lapMs = Math.round(lap.lapMs);
      const pilotKey = createIdentity(memoryStorage());
      const auth = await pilotKey.signTime({ trackId, lapMs, ghost });
      const posted = await board(`/api/tracks/${trackId}/times`, json('', {
        name: PILOT, lapMs, ghost, key: auth.key, sig: auth.sig,
      }));
      say(posted.status === 201, `a signed lap of ${lapMs} ms is verified and kept: ${posted.status} ${JSON.stringify(posted.body).slice(0, 140)}`);
      const times = await board(`/api/tracks/${trackId}`);
      const time = times.status === 200 && times.body.times.find((t) => t.name === PILOT);
      say(Boolean(time) && time.lapMs === lapMs && time.hasGhost, `the track's board lists ${PILOT} at ${time && time.lapMs} ms with a ghost`);
      if (time) {
        const g = await board(`/api/tracks/${trackId}/times/${time.id}/ghost`);
        say(g.status === 200 && g.body.ghost === ghost, 'and hands the ghost back byte for byte');
      }
      const refused = await board(`/api/tracks/${trackId}/times`, json('', { name: PILOT, lapMs: lapMs - 2000, ghost }));
      say(refused.status === 400, `a lap claiming two seconds less on the same ghost is refused: ${refused.status}`);

      /* 6. A live room from two pages. */
      console.log('6. a live ghost room from two pages');
      orbit = await openPage({
        root, width: 480, height: 270, url: `/src/share/orbit.html?map=custom&share=${trackId}&board=${encodeURIComponent(BOARD)}`,
      });
      if (PAGE) {
        await navigate(orbit, new URL(`src/share/orbit.html?map=custom&share=${trackId}&board=${encodeURIComponent(BOARD)}`, PAGE).href);
      }
      const joinIn = (name, depth) => `${imp('src/share/live.js', depth)}.then((m) => {
        window.__check = { state: '', peers: [], frames: [] };
        window.__checkLink = m.createLiveLink({
          onState: (s) => { window.__check.state = s; },
          onWelcome: (id, peers) => { window.__check.me = id; window.__check.peers.push(...peers.map((p) => p.name)); },
          onJoin: (id, n) => { window.__check.peers.push(n); },
          onFrame: (f) => { window.__check.frames.push(f); },
        });
        window.__checkLink.join({ origin: ${JSON.stringify(BOARD)}, trackId: ${JSON.stringify(trackId)}, name: ${JSON.stringify(name)} });
        return true;
      })`;
      await shell.evaluate(joinIn('check A', 0));
      await orbit.evaluate(joinIn('check B', 2));
      await shell.until("window.__check.state === 'open' && window.__check.peers.includes('check B')", 20000).catch(() => {});
      await orbit.until("window.__check.state === 'open' && window.__check.peers.includes('check A')", 20000).catch(() => {});
      const a = await shell.evaluate('window.__check');
      const b = await orbit.evaluate('window.__check');
      say(a.state === 'open' && b.state === 'open', `both sockets open through Caddy: ${a.state}, ${b.state}`);
      say(a.peers.includes('check B') && b.peers.includes('check A'), `each page sees the other in the room: A sees ${JSON.stringify(a.peers)}, B sees ${JSON.stringify(b.peers)}`);
      await shell.evaluate(`${imp('src/share/ghostdata.js')}.then((m) => { window.__checkLink.send(m.encodeLiveFrame(1234, 1, 2, 3, 0, 0, 0, 1)); return true; })`);
      await orbit.until('window.__check.frames.length > 0', 10000).catch(() => {});
      const frame = await orbit.evaluate('window.__check.frames[0] || null');
      say(Boolean(frame) && frame.peer === a.me && Math.abs(frame.px - 1) < 1e-3, `B receives A's frame, stamped with A's peer id: ${JSON.stringify(frame)}`);
      const drawn = await orbit.evaluate("document.querySelectorAll('canvas').length");
      say(drawn > 0, 'the orbit thumbnail fetched the track from the board and drew it');
      await shell.evaluate('window.__checkLink.leave(), true');
      await orbit.evaluate('window.__checkLink.leave(), true');
    }

    /* 7. The visit the shell sent at boot. The read is cached for twenty
     * seconds, so this waits past that. */
    console.log('7. site statistics');
    let visitsAfter = visitsBefore;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !(visitsAfter > visitsBefore)) {
      await shell.sleep(5000);
      const s = await board('/api/stats');
      visitsAfter = s.body && s.body.today ? s.body.today.visits : visitsAfter;
    }
    say(visitsAfter > visitsBefore, `the shell's visit was counted: ${visitsBefore} then ${visitsAfter} today`);

    /* 8. The board's own pages. */
    console.log('8. the board page and its bugs page');
    const errorsBefore = shell.errors.length;
    await navigate(shell, `${BOARD}/`);
    if (trackId) {
      await shell.until(`document.body && document.body.innerText.includes(${JSON.stringify(trackName)})`, 60000).catch(() => {});
      const onPage = await shell.evaluate(`document.body.innerText.includes(${JSON.stringify(trackName)})`);
      say(onPage, `${BOARD}/ lists ${JSON.stringify(trackName)}`);
      await navigate(shell, `${BOARD}/#track=${trackId}`);
      await shell.until(`document.body && document.body.innerText.includes(${JSON.stringify(PILOT)})`, 60000).catch(() => {});
      say(await shell.evaluate(`document.body.innerText.includes(${JSON.stringify(PILOT)})`), `and the track's sheet shows ${JSON.stringify(PILOT)}'s time`);
      const fly = await shell.evaluate("[...document.querySelectorAll('a')].map((x) => x.href).find((h) => h.includes('share=')) || ''");
      say(fly.startsWith('https://fdflabs.github.io/fdfpv/') || Boolean(opts.board), `its Fly link goes to the simulator on GitHub Pages: ${fly.slice(0, 110)}`);
    }
    await shell.evaluate(`sessionStorage.setItem('webfpv.board.admin.v1', ${JSON.stringify(token)}), true`);
    await navigate(shell, `${BOARD}/bugs`);
    if (tickets[0]) {
      await shell.until(`document.body && document.body.innerText.includes(${JSON.stringify(tickets[0])})`, 30000).catch(() => {});
      say(await shell.evaluate(`document.body.innerText.includes(${JSON.stringify(tickets[0])})`), `${BOARD}/bugs lists ${tickets[0]} for the signed in admin`);
    }
    if (pastedId) {
      await pasteInbox(shell, pastedId);
    }
    const pageErrors = shell.errors.slice(errorsBefore);
    say(pageErrors.length === 0, `no errors on the board's pages${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    /* 9. Clean up whatever was made, whether or not the steps passed. */
    console.log('9. clean up');
    if (trackId) {
      const gone = await board(`/api/tracks/${trackId}/remove`, json(token, {}));
      say(gone.status === 200, `${trackId} is off the board with ${gone.body && gone.body.times} time(s)`);
    }
    for (const id of tickets) {
      const closed = await board(`/api/bugs/${id}`, json(token, {
        status: 'wontfix', resolution: 'Automated live check (scripts/board-live-check.js), not a real report.',
      }));
      say(closed.status === 200, `${id} closed as wontfix`);
      left.push(`ticket ${id}, closed (the board has no way to delete a ticket)`);
    }
    if (!opts.only) {
      left.push(`the pilot name ${JSON.stringify(PILOT)}, filed under a throwaway key`);
    }
    left.push('one visit, and whatever session the shell counted, in the day\'s statistics counters');
    if (PAGE && trackId) {
      left.push(`the library copy of ${trackId} synced to the tracks server at ${PRODUCTION_TRACKS_ORIGIN}; delete it with the tracks admin secret (deploy/vm/README.md)`);
    }
    if (orbit) {
      await orbit.close();
    }
    await shell.close();
  }
}

try {
  await main();
} catch (e) {
  say(false, `stopped: ${e.stack || e.message || e}`);
}
if (left.length) {
  console.log('\nleft on the board:');
  for (const line of left) {
    console.log(`  ${line}`);
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
