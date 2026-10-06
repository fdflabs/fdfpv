/*
 * crashrecord.js: the last crash and the last page errors, kept for F8.
 *
 * bug-484f7119: "I wanted to report a bug after the game crashed and when I
 * pressed F8 to report it the crash disappeared". F8 pauses a flight, and
 * the pause menu and the form cover the wreck and take its banner down, so
 * what the pilot was looking at is gone from the screen at the one moment
 * they want to describe it. The wreck itself was still there under the
 * menu. The report was not: its context carried the rates, the stick and
 * the GPU, and nothing at all about the crash the pilot had just had.
 *
 * So the crash is written down when it happens, not when F8 is pressed:
 * the shell hands every crash it declares to noteCraft, and uncaught page
 * errors are caught here from boot. A report filed a minute later from
 * another screen still carries it, which is how this ticket was filed.
 *
 * Small on purpose. The board takes a context of at most 8000 characters
 * over 32 keys (inspectContext in the board's src/validate.js), and this
 * is one key of it, clipped field by field.
 *
 * Nothing here touches the document at import: scripts import src/ui/ui.js
 * in Node, and it imports this.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* How long a crash or an error still belongs to the next report. Long
 * enough to close the form, look around a menu and press F8 again, which is
 * what the reporter of bug-484f7119 did; short enough that a wreck from the
 * start of the session does not ride along on a report about the menus. */
export const CRASH_RECENT_MS = 300000;
export const MAX_ERRORS = 3;
const MAX_HITS = 4;
const MESSAGE_CHARS = 200;
const WHERE_CHARS = 160;

const clip = (s, n) => String(s ?? '').slice(0, n);
const round1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/* The page's own origin says nothing a report's href does not, and it is
 * most of the length of every stack line. */
function shortWhere(s) {
  return clip(String(s || '').replace(/https?:\/\/[^/\s)]+\//g, ''), WHERE_CHARS);
}

/* The top two frames of a stack, or the file and line an ErrorEvent gives. */
function whereOf(error, filename, line, col) {
  const stack = error && error.stack ? String(error.stack) : '';
  const frames = stack.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('at ') || l.includes('@')).slice(0, 2);
  if (frames.length) {
    return shortWhere(frames.join(' | '));
  }
  return filename ? shortWhere(`${filename}:${line || 0}:${col || 0}`) : '';
}

export function createCrashRecord(now = () => performance.now()) {
  let craft = null;
  const errors = [];

  /*
   * One aircraft crash, as the shell declared it. `fields` is what it knew
   * at that moment: the kind, the aircraft and world, the damage flags, the
   * last few hits (part, what it met, closing speed) and where. Only the
   * latest is kept: a hard ground hit followed by the wreck it caused is
   * one crash, and the wreck is the fuller account of it.
   */
  function noteCraft(fields) {
    const f = fields || {};
    craft = {
      atMs: now(),
      kind: clip(f.kind, 16),
      airframe: clip(f.airframe, 32),
      map: clip(f.map, 32),
      flags: (Array.isArray(f.flags) ? f.flags : []).slice(0, 16).map((x) => clip(x, 24)),
      hits: (Array.isArray(f.hits) ? f.hits : []).slice(-MAX_HITS).map((h) => ({
        part: clip(h.part, 24),
        type: clip(h.type, 16),
        surface: clip(h.surface, 16),
        closing: round1(h.closing),
      })),
      speed: round1(f.speed),
      agl: round1(f.agl),
      at: Array.isArray(f.at) ? f.at.slice(0, 3).map(round1) : null,
    };
  }

  /* An uncaught error or rejection. A frame that throws the same thing
   * every frame is one error with a count, not three copies of it. */
  function noteError(message, where) {
    const m = clip(message, MESSAGE_CHARS);
    const w = clip(where, WHERE_CHARS);
    const t = now();
    const same = errors.find((e) => e.message === m && e.where === w);
    if (same) {
      same.count += 1;
      same.atMs = t;
      return;
    }
    errors.push({ message: m, where: w, count: 1, atMs: t });
    if (errors.length > MAX_ERRORS) {
      errors.shift();
    }
  }

  const ageS = (atMs, t) => Math.round((t - atMs) / 100) / 10;

  /* What goes in the report's context, or null when nothing recent does. */
  function report() {
    const t = now();
    const out = {};
    if (craft && t - craft.atMs <= CRASH_RECENT_MS) {
      const { atMs, ...rest } = craft;
      out.craft = { ageS: ageS(atMs, t), ...rest };
    }
    const recent = errors.filter((e) => t - e.atMs <= CRASH_RECENT_MS);
    if (recent.length) {
      out.errors = recent.map(({ atMs, ...rest }) => ({ ageS: ageS(atMs, t), ...rest }));
    }
    return out.craft || out.errors ? out : null;
  }

  return { noteCraft, noteError, report };
}

/* The one the page uses: boot.js feeds it errors, main.js feeds it crashes,
 * and the bug form reads it. */
export const crashRecord = createCrashRecord();

/*
 * Uncaught errors and rejections, from boot on. Nothing is swallowed: the
 * listeners only read, so the console still shows every one as before. A
 * frame fault is not one of these, because main.js catches it itself and
 * records it on window.__frameFault, which the report already carries.
 */
export function watchPageErrors(win, record = crashRecord) {
  win.addEventListener('error', (e) => {
    record.noteError(e.message || (e.error && e.error.message) || 'error', whereOf(e.error, e.filename, e.lineno, e.colno));
  });
  win.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const message = r && r.message ? r.message : String(r);
    record.noteError(`unhandledrejection: ${message}`, whereOf(r));
  });
}
