/*
 * clientreport.js: what a page error or a minute of frame times may say
 * when it leaves the browser, and nothing more.
 *
 * Foundations #10 (owner: anonymous, opt out). Two more kinds of event for
 * the channel src/share/stats.js already runs to the board's
 * /api/stats/events, so they inherit its rules instead of growing a second
 * set: Global Privacy Control and the shared opt out stop them before
 * anything is built into a request, the board stamps the day, and no event
 * names a browser. The board refuses both kinds until its own half lands
 * (FND-10-SURVEY.md slice 2), and nothing here is wired yet (slice 3).
 *
 *   error   a reduced message, up to three repo frames, a count, and a
 *           signature the board can count per day.
 *   frames  a fixed edge histogram of frame block times, the GPU class,
 *           the fps cap and the dynamic resolution scale, as buckets.
 *
 * Reduced, not clipped: an error message is free text, and code puts URLs
 * (share links carry track ids), file paths (a home folder names its
 * user), addresses and quoted values in it. Each of those becomes a
 * placeholder; a stack keeps only frames inside the repo's own folders, so
 * another host, a query string or an extension never rides along. The GPU
 * goes as a class, never the renderer string: that string is what
 * Firefox's fingerprinting resistance hides, and stats.js sends nothing of
 * that grade.
 *
 * Pure: plain inputs in, a plain object or null out, so
 * scripts/clientreport-selftest.js can fuzz it in Node.
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

import { sendEvent } from './stats.js';

/* The longest a reduced message may be; the board takes 2000 bytes per
 * event and an error event must stay far under it. */
export const MESSAGE_CHARS = 120;
export const MAX_FRAMES = 3;
const FRAME_CHARS = 64;
const MAX_COUNT = 999;

/* Upper edges in ms of a frame block: 120, 90, 72, 60, 50, 40, 30, 20 and
 * 10 fps, then everything slower. Fixed, so days add up. */
export const FRAME_EDGES_MS = [8.4, 11.2, 13.9, 16.8, 20, 25, 33.4, 50, 100];
/* More than a minute at 240 fps can hold: a clock jump, not frames. */
const MAX_PER_BUCKET = 15000;
const FPS_CAPS = [0, 30, 60, 90, 120, 144, 240];

/* Order matters: a URL holds a path and maybe an address, an email holds
 * a word, so the widest shapes go first. */
/* Quotes are written as \x22, \x27 and \x60 so no string scanner (lint:copy)
 * mistakes a pattern for words. */
const SCRUB = [
  [/\b[a-z][a-z0-9+.-]*:\/\/?[^\s\x22\x27\x60)]*/gi, '<url>'],
  [/\b(?:blob|data|javascript):[^\s\x22\x27\x60)]*/gi, '<url>'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>'],
  [/\x27[^\x27]*\x27|\x22[^\x22]*\x22|\x60[^\x60]*\x60/g, '<q>'],
  [/(?:[A-Za-z]:\\|~\/|\/)[^\s\x22\x27\x60)]+/g, '<path>'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>'],
  [/\b[0-9a-f:]*:[0-9a-f:]*:[0-9a-f:]+\b/gi, '<ip>'],
  [/[A-Za-z0-9+/_=-]*\d[A-Za-z0-9+/_=-]*/g, (w) => (/^\d{1,5}$/.test(w) ? w : '<n>')],
];

/* Free text down to its shape: what threw, with every value taken out.
 * Words with digits go too, because callsigns and ids carry them. */
export function scrubMessage(raw) {
  let text = String(raw ?? '').replace(/[^\x20-\x7e]+/g, ' ');
  for (const [shape, by] of SCRUB) {
    text = text.replace(shape, by);
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_CHARS);
}

/* Repo frames only: src/, dist/ or vendor/ files with a line, the origin
 * and everything outside them dropped. */
const REPO_FRAME = /\b(?:src|dist|vendor)\/[\w./-]+\.(?:m?js|wasm):\d+(?::\d+)?/g;

export function repoFrames(stack) {
  const found = String(stack ?? '').match(REPO_FRAME) || [];
  return found.slice(0, MAX_FRAMES).map((f) => f.slice(0, FRAME_CHARS));
}

/* FNV-1a, 32 bits: a name for one kind of error to count by, not a
 * secret. It is computed after the scrub, so it carries nothing either. */
function signature(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const whole = (x, max) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));

/* One error event from what crashrecord.js keeps ({ message, where,
 * count }) or a raw Error's message and stack. Null when nothing is left. */
export function errorEvent({ message, stack, count = 1 } = {}) {
  const msg = scrubMessage(message);
  const where = repoFrames(stack);
  if (!msg && where.length === 0) {
    return null;
  }
  return {
    kind: 'error',
    sig: signature(`${msg}|${where.join('|')}`),
    msg,
    where,
    count: Math.max(1, whole(count, MAX_COUNT)),
  };
}

/* The GPU as one of four words, from gpuinfo.js's readGpuInfo. */
export function gpuClass(info) {
  if (!info || !info.usable || info.hidden) {
    return info && info.software ? 'software' : 'hidden';
  }
  if (info.software) {
    return 'software';
  }
  return info.integrated ? 'integrated' : 'discrete';
}

/* Frame block times for one window. add() is a loop over ten numbers and
 * allocates nothing, so it may run every frame. */
export function createFrameHistogram() {
  const counts = new Array(FRAME_EDGES_MS.length + 1).fill(0);
  return {
    add(ms) {
      if (!(ms >= 0)) {
        return;
      }
      let i = 0;
      while (i < FRAME_EDGES_MS.length && ms > FRAME_EDGES_MS[i]) {
        i++;
      }
      counts[i]++;
    },
    /* The window's counts, and a fresh window. */
    take() {
      const out = counts.slice();
      counts.fill(0);
      return out;
    },
  };
}

const nearest = (list, x) => list.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));

/* One frames event, or null for a window with no frames in it. */
export function framesEvent({ counts, gpu, fpsCap = 0, scale = 1 } = {}) {
  const b = Array.from({ length: FRAME_EDGES_MS.length + 1 }, (_, i) => whole(counts && counts[i], MAX_PER_BUCKET));
  if (b.every((n) => n === 0)) {
    return null;
  }
  const s = Number(scale);
  return {
    kind: 'frames',
    b,
    gpu: ['software', 'integrated', 'discrete', 'hidden'].includes(gpu) ? gpu : 'hidden',
    cap: nearest(FPS_CAPS, Number(fpsCap) || 0),
    scale: Number.isFinite(s) ? Math.min(1, Math.max(0.25, Math.round(s * 4) / 4)) : 1,
  };
}

/* Through stats.js's sender, which sends nothing while the pilot has
 * opted out or the browser asks for Global Privacy Control. */
export function sendClientReport(event, send = sendEvent) {
  return event ? send(event) : false;
}
