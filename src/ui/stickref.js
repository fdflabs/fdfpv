/*
 * stickref.js: another pilot's sticks, played on the flight overlay's
 * gimbals beside the pilot's own, so a person can lay their thumbs
 * against a recording's. The recording is a control recording
 * (src/share/controlrec.js, docs/CONTROL-RECORDER.md): the pilot's own
 * from the Flight log switch, or the hover probe's person paced pilot
 * (node scripts/hover-probe.js --csv <dir>).
 *
 * The recording plays on the run's sim clock from the first frame the
 * craft is in the air, because neither the probe (which starts nose up at
 * height) nor an earlier flight left the stand at this run's time. A
 * clock that goes back (R, a new run) starts it again. Past its last row
 * it shows nothing rather than a stick held where it stopped.
 *
 * Kept for the session only: a minute of recording is 13 MB, past what
 * the stored profile is for.
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

import { COLUMN as C, parseCsv } from '../share/controlrec.js';
import { logWarn } from '../share/crashrecord.js';

export class StickRef {
  constructor() {
    this.clear();
  }

  clear() {
    this.name = '';
    /* Why nothing is loaded, for the row: '', 'refused' (the last file
     * was not a control recording) or 'click' (see pickStickRef). */
    this.status = '';
    this.t = null;
    this.ch = null;
    this.restart();
  }

  get loaded() {
    return this.t !== null;
  }

  get seconds() {
    return this.loaded ? this.t[this.t.length - 1] : 0;
  }

  /* Rows as parseCsv returns them. Times are kept from the first row, and
   * a recording whose clock does not move forward is refused, since the
   * lookup below bisects on it. */
  load(rows, name) {
    if (rows.length < 2) {
      throw new Error('stickref: a recording needs at least two rows');
    }
    const t = new Float64Array(rows.length);
    const ch = new Float32Array(rows.length * 4);
    const t0 = rows[0][C.t_s];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      t[i] = r[C.t_s] - t0;
      if (!(i === 0 || t[i] > t[i - 1])) {
        throw new Error(`stickref: row ${i + 1}'s time does not follow the row before it`);
      }
      ch[i * 4] = r[C.roll];
      ch[i * 4 + 1] = r[C.pitch];
      ch[i * 4 + 2] = r[C.yaw];
      ch[i * 4 + 3] = r[C.throttle];
    }
    this.name = name;
    this.status = '';
    this.t = t;
    this.ch = ch;
    this.restart();
  }

  loadCsv(text, name) {
    this.load(parseCsv(text), name);
  }

  restart() {
    this.startT = NaN;
    this.lastT = -Infinity;
  }

  /* The recording's channels at this frame, written into `out`, or null
   * before the run is in the air and after the recording ends. simT is
   * the plant's clock (s), air whether the craft is flying. */
  at(simT, air, out) {
    if (!this.loaded) {
      return null;
    }
    if (simT < this.lastT) {
      this.restart();
    }
    this.lastT = simT;
    if (Number.isNaN(this.startT)) {
      if (!air) {
        return null;
      }
      this.startT = simT;
    }
    const t = simT - this.startT;
    const last = this.t.length - 1;
    if (t > this.t[last]) {
      return null;
    }
    /* The newest row at or before t. */
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.t[mid] <= t) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const k = lo * 4;
    out.roll = this.ch[k];
    out.pitch = this.ch[k + 1];
    out.yaw = this.ch[k + 2];
    out.throttle = this.ch[k + 3];
    return out;
  }
}

/* The Compare sticks row: a loaded recording is put away; otherwise a
 * file is asked for and loaded, or marked refused. done() repaints.
 * The browser opens a file chooser only inside a key press or a click,
 * and a radio's button is neither, so from a radio the row says to use
 * one instead of doing nothing. */
export function pickStickRef(ref, done) {
  if (ref.loaded) {
    ref.clear();
    done();
    return;
  }
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    ref.status = 'click';
    done();
    return;
  }
  ref.status = '';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    try {
      ref.loadCsv(await file.text(), file.name.replace(/\.csv$/i, ''));
    } catch (e) {
      logWarn('input', `stickref: ${file.name} refused: ${e.message}`);
      ref.clear();
      ref.status = 'refused';
    }
    done();
  });
  input.click();
}
