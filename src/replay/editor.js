/*
 * editor.js: the crash cam's screen, and its prompt in flight.
 *
 * Everything the pilot sees of the crash cam is built here, as DOM over the
 * canvas: the REPLAY prompt after a crash, and while the editor is open a
 * head (the clip's name, its speed, whether the camera is directed), a dock
 * at the bottom (the timeline with its markers and keys, the transport, the
 * cameras, the looks and the ways to keep a shot), a small replay OSD, and
 * My clips. The reference is a console replay editor made casual: every
 * control is one click or one key, and the key is printed on the button.
 *
 * It holds no state of the replay's own. Every frame src/replay/crashcam.js
 * hands it a view ({ t, dur, playing, rig, keys, markers, ... }) and it
 * writes the few numbers that changed; every control calls the api it was
 * made with. The flight's own UI is hidden under it (#ui.cc-open).
 *
 * Every word comes from src/strings.
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

import { str } from '../strings/index.js';
import { HEAD } from './recorder.js';
import { FILE_EXT, NAME_MAX } from './file.js';
import { CRASHCAM_CSS } from './style.js';

const ICONS = {
  play: '<svg viewBox="0 0 20 20"><path d="M6 3.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 20 20"><path d="M5 3.5h3.6v13H5zM11.4 3.5H15v13h-3.6z"/></svg>',
  back: '<svg viewBox="0 0 20 20"><path d="M4 4h2v12H4zM17 4v12L7.5 10z"/></svg>',
  fwd: '<svg viewBox="0 0 20 20"><path d="M14 4h2v12h-2zM3 4v12l9.5-6z"/></svg>',
  prev: '<svg viewBox="0 0 20 20"><path d="M10 4v12L2 10zM18 4v12l-8-6z"/></svg>',
  next: '<svg viewBox="0 0 20 20"><path d="M10 4v12l8-6zM2 4v12l8-6z"/></svg>',
};

/* The rigs, their names and their number keys. */
const RIG_KEYS = { chase: '1', orbit: '2', free: '3', tripod: '4', fpv: '5', follow: '6' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text !== undefined) {
    e.textContent = text;
  }
  return e;
}

function button(cls, label, key, onClick) {
  const b = el('button', cls);
  b.type = 'button';
  b.append(document.createTextNode(label));
  if (key) {
    const k = el('span', 'cc-kbd', key);
    b.append(k);
  }
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
    b.blur();
  });
  return b;
}

function iconButton(cls, icon, title, onClick) {
  const b = el('button', `cc-icon ${cls}`);
  b.type = 'button';
  b.innerHTML = ICONS[icon];
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
    b.blur();
  });
  return b;
}

function fmt(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
}

function when(ms) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function createEditor(api) {
  const css = document.createElement('style');
  css.textContent = CRASHCAM_CSS;
  document.head.append(css);

  /* ---- the prompt in flight ---- */
  const prompt = el('div', 'cc-prompt');
  prompt.hidden = true;
  const promptText = el('span', '', str('replay.prompt'));
  const promptKey = el('b', '', 'V');
  prompt.append(promptText, promptKey);
  document.body.append(prompt);

  /* ---- the editor ---- */
  const root = el('div', 'cc');
  root.hidden = true;
  const stage = el('div', 'cc-stage');
  root.append(stage);

  const top = el('div', 'cc-top');
  const headLeft = el('div', '');
  const title = el('div', 'cc-title', str('replay.title'));
  const rec = el('span', 'cc-rec');
  rec.hidden = true;
  title.append(rec);
  const name = el('div', 'cc-name');
  const sub = el('div', 'cc-sub');
  const chipSpeed = el('span', 'cc-chip');
  const chipCam = el('span', 'cc-chip mint');
  const chipLive = el('span', 'cc-chip slate');
  sub.append(chipSpeed, chipCam, chipLive);
  headLeft.append(title, name, sub);
  const headActions = el('div', 'cc-head-actions');
  const clipsBtn = button('cc-btn', str('replay.my_clips'), 'M', () => openClips());
  const closeBtn = button('cc-btn', str('replay.back_to_flight'), 'Esc', () => api.close());
  headActions.append(clipsBtn, closeBtn);
  top.append(headLeft, headActions);
  root.append(top);

  const osd = el('div', 'cc-osd');
  const osdSpeed = el('span', 'v');
  const osdAlt = el('span', 'v');
  const osdThr = el('span', 'cc-thr');
  const osdThrFill = el('i', '');
  osdThr.append(osdThrFill);
  osd.append(el('span', 'k', str('replay.osd_speed')), osdSpeed, el('span', 'k', str('replay.osd_height')), osdAlt,
    el('span', 'k', str('replay.osd_throttle')), osdThr);
  root.append(osd);

  /* With the controls hidden, one quiet line says how to have them back. */
  const bareHint = el('div', 'cc-bare', str('replay.show_controls'));
  bareHint.hidden = true;
  root.append(bareHint);

  const toast = el('div', 'cc-toast');
  toast.hidden = true;
  root.append(toast);

  /* The dock. */
  const dock = el('div', 'cc-dock');
  const timeline = el('div', 'cc-timeline');
  const track = el('div', 'cc-track');
  const range = el('div', 'cc-range');
  const fill = el('div', 'cc-fill');
  const markLayer = el('div', '');
  const keyLayer = el('div', '');
  const headline = el('div', 'cc-headline');
  timeline.append(track, range, fill, keyLayer, markLayer, headline);
  dock.append(timeline);

  const row = el('div', 'cc-row');
  const transport = el('div', 'cc-group');
  const bPrev = iconButton('', 'prev', str('replay.previous_marker'), () => api.prevMarker());
  const bBack = iconButton('', 'back', str('replay.step_back'), () => api.step(-1));
  const bPlay = iconButton('play', 'play', str('replay.play'), () => api.togglePlay());
  const bFwd = iconButton('', 'fwd', str('replay.step_forward'), () => api.step(1));
  const bNext = iconButton('', 'next', str('replay.next_marker'), () => api.nextMarker());
  const time = el('div', 'cc-time');
  const speedSeg = el('div', 'cc-seg speed');
  const speedButtons = api.speeds.map((s) => {
    const b = el('button', '', `${s}x`);
    b.type = 'button';
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      api.setSpeed(s);
    });
    speedSeg.append(b);
    return b;
  });
  transport.append(bPrev, bBack, bPlay, bFwd, bNext, time, speedSeg);

  const camera = el('div', 'cc-group');
  const rigSeg = el('div', 'cc-seg');
  const rigButtons = {};
  for (const rig of api.rigs) {
    const b = el('button', '', str(`replay.rig_${rig}`));
    b.type = 'button';
    b.title = `${str(`replay.rig_${rig}`)} (${RIG_KEYS[rig]})`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      api.setRig(rig);
    });
    rigSeg.append(b);
    rigButtons[rig] = b;
  }
  const partSelect = el('select', 'cc-select');
  partSelect.title = str('replay.follow_which');
  partSelect.addEventListener('change', () => {
    api.follow(Number(partSelect.value));
    partSelect.blur();
  });
  const bKey = button('cc-btn small', str('replay.add_key'), 'K', () => api.addKey());
  const bUnkey = button('cc-btn small', str('replay.remove_key'), 'Del', () => api.removeKey());
  camera.append(el('span', 'cc-label', str('replay.camera')), rigSeg, partSelect, bKey, bUnkey);

  row.append(transport, camera);
  dock.append(row);

  const row2 = el('div', 'cc-row');
  const looks = el('div', 'cc-group');
  const bOsd = button('cc-btn small', str('replay.osd'), 'H', () => api.toggleOsd());
  const bBox = button('cc-btn small', str('replay.letterbox'), 'L', () => api.toggleLetterbox());
  const bIn = button('cc-btn small', str('replay.mark_in'), 'I', () => api.setIn());
  const bOut = button('cc-btn small', str('replay.mark_out'), 'O', () => api.setOut());
  looks.append(el('span', 'cc-label', str('replay.look')), bOsd, bBox, el('span', 'cc-label', str('replay.range')), bIn, bOut);
  const keep = el('div', 'cc-group');
  const bPhoto = button('cc-btn small', str('replay.photo'), 'P', () => api.photo());
  const bVideo = button('cc-btn small', str('replay.video'), 'C', () => api.exportVideo());
  const bSave = button('cc-btn small', str('replay.save'), 'G', () => api.saveReplay());
  const bTake = button('cc-btn primary', str('replay.take_over'), 'Enter', () => api.takeOver());
  keep.append(el('span', 'cc-label', str('replay.keep')), bPhoto, bVideo, bSave, bTake);
  row2.append(looks, keep);
  dock.append(row2);
  const hints = el('div', 'cc-hints');
  hints.innerHTML = str('replay.hints_html');
  dock.append(hints);
  root.append(dock);

  /* My clips. */
  const clips = el('div', 'cc-modal');
  clips.hidden = true;
  const card = el('div', 'cc-card');
  const cardHead = el('div', 'cc-card-head');
  const cardTitleBox = el('div', '');
  cardTitleBox.append(el('div', 'cc-title', str('replay.title')), el('div', 'cc-name', str('replay.my_clips')));
  const cardActions = el('div', 'cc-group');
  const importInput = el('input', '');
  importInput.type = 'file';
  importInput.accept = `${FILE_EXT},application/octet-stream`;
  importInput.hidden = true;
  importInput.addEventListener('change', async () => {
    const f = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!f) {
      return;
    }
    try {
      const nm = await api.importFile(f);
      flash(str('replay.imported', { name: nm }));
      await fillClips();
    } catch (err) {
      flash(str('replay.import_refused', { why: err.message }));
    }
  });
  const bImport = button('cc-btn', str('replay.import'), '', () => importInput.click());
  const bClipsClose = button('cc-btn', str('replay.close'), 'Esc', () => closeClips());
  cardActions.append(importInput, bImport, bClipsClose);
  cardHead.append(cardTitleBox, cardActions);
  const list = el('div', 'cc-list');
  card.append(cardHead, list);
  clips.append(card);
  clips.addEventListener('click', (ev) => {
    if (ev.target === clips) {
      closeClips();
    }
  });
  root.append(clips);

  /* The delete confirmation, which defaults to keeping the clip. */
  const confirmBox = el('div', 'cc-modal');
  confirmBox.hidden = true;
  const confirmCard = el('div', 'cc-confirm');
  const confirmText = el('p', '');
  const confirmRow = el('div', 'cc-group');
  let confirmYes = null;
  const bKeepIt = button('cc-btn primary', str('replay.keep_it'), 'Esc', () => closeConfirm());
  const bDeleteIt = button('cc-btn danger', str('replay.delete'), '', () => {
    const f = confirmYes;
    closeConfirm();
    if (f) {
      f();
    }
  });
  confirmRow.append(bDeleteIt, bKeepIt);
  confirmCard.append(el('div', 'cc-title', str('replay.delete_title')), confirmText, confirmRow);
  confirmBox.append(confirmCard);
  root.append(confirmBox);

  document.body.append(root);

  /* The replay OSD sits above the dock, however tall the dock wraps. */
  function placeOsd() {
    if (!root.hidden) {
      osd.style.bottom = `${dock.offsetHeight + 34}px`;
    }
  }
  window.addEventListener('resize', placeOsd);

  /* ---- the stage: drag to look, wheel to zoom, click the timeline ---- */
  let dragFrom = null;
  stage.addEventListener('pointerdown', (ev) => {
    dragFrom = [ev.clientX, ev.clientY];
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragFrom) {
      return;
    }
    api.drag(ev.clientX - dragFrom[0], ev.clientY - dragFrom[1]);
    dragFrom = [ev.clientX, ev.clientY];
  });
  const endDrag = () => {
    dragFrom = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    api.wheel(ev.deltaY);
  }, { passive: false });

  let scrubbing = false;
  let lastDur = 1;
  const scrubTo = (ev) => {
    const r = track.getBoundingClientRect();
    const a = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
    api.seek(a * lastDur);
  };
  timeline.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.cc-mark')) {
      return;
    }
    scrubbing = true;
    timeline.setPointerCapture(ev.pointerId);
    scrubTo(ev);
  });
  timeline.addEventListener('pointermove', (ev) => {
    if (scrubbing) {
      scrubTo(ev);
    }
  });
  timeline.addEventListener('pointerup', () => {
    scrubbing = false;
  });

  /* ---- keeping the screen level with the view ---- */
  let markSig = '';
  let keySig = '';
  let partSig = '';
  const last = {};
  function set(k, v, write) {
    if (last[k] !== v) {
      last[k] = v;
      write(v);
    }
  }

  function tick(v) {
    lastDur = Math.max(1e-6, v.dur);
    const pct = (x) => `${(100 * Math.max(0, Math.min(1, x / lastDur))).toFixed(3)}%`;
    headline.style.left = pct(v.t);
    fill.style.width = pct(v.t);
    set('range', `${v.in}|${v.out}`, () => {
      range.style.left = pct(v.in);
      range.style.width = `${(100 * (v.out - v.in) / lastDur).toFixed(3)}%`;
    });
    set('time', `${fmt(v.t)}|${fmt(v.dur)}`, () => {
      time.innerHTML = '';
      time.append(document.createTextNode(fmt(v.t)), el('small', '', ` / ${fmt(v.dur)}`));
    });
    set('playing', v.playing, (p) => {
      bPlay.innerHTML = ICONS[p ? 'pause' : 'play'];
      bPlay.title = str(p ? 'replay.pause' : 'replay.play');
    });
    set('speed', v.speed, (s) => {
      speedButtons.forEach((b, i) => b.classList.toggle('on', api.speeds[i] === s));
      chipSpeed.textContent = str('replay.speed_chip', { speed: s });
    });
    set('rig', `${v.rig}|${v.directed}`, () => {
      for (const [rig, b] of Object.entries(rigButtons)) {
        b.classList.toggle('on', rig === v.rig && !v.directed);
      }
      chipCam.textContent = v.directed ? str('replay.directed', { n: v.keys.length }) : str(`replay.rig_${v.rig}`);
    });
    set('live', v.live, (live) => {
      chipLive.textContent = live ? str('replay.last_seconds') : str('replay.saved_clip');
    });
    set('exporting', v.exporting, (x) => {
      rec.hidden = !x;
      bVideo.disabled = x;
    });
    set('take', `${v.canTakeOver}|${v.live}`, () => {
      /* A saved clip is a picture of a flight that is over: no take over
       * at all, rather than a button that never works. */
      bTake.hidden = !v.live;
      bTake.disabled = !v.canTakeOver;
      bTake.title = v.canTakeOver ? '' : str('replay.too_far_back');
    });
    set('bare', v.bare, (bare) => {
      for (const part of [top, dock, osd]) {
        part.classList.toggle('cc-gone', bare);
      }
      bareHint.hidden = !bare;
    });
    set('osd', v.osd, (on) => {
      osd.hidden = !on;
      placeOsd();
      bOsd.classList.toggle('on', on);
    });
    set('box', v.letterbox, (on) => bBox.classList.toggle('on', on));
    set('name', v.name, (n) => {
      name.textContent = n;
    });
    const ms = v.markers.map((m) => `${m.type}${m.t.toFixed(3)}`).join();
    if (ms !== markSig) {
      markSig = ms;
      markLayer.innerHTML = '';
      for (const m of v.markers) {
        const b = el('button', `cc-mark ${m.type}`);
        b.type = 'button';
        b.style.left = pct(m.t);
        b.append(el('i', ''), el('span', '', m.type === 'off' ? str('replay.marker_off', { part: m.label }) : str('replay.marker_impact')));
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          api.jumpTo(Math.max(0, m.t - 0.5));
        });
        markLayer.append(b);
      }
    }
    const ks = v.keys.map((k) => k.t.toFixed(3)).join();
    if (ks !== keySig) {
      keySig = ks;
      keyLayer.innerHTML = '';
      for (const k of v.keys) {
        const d = el('div', 'cc-key');
        d.style.left = pct(k.t);
        keyLayer.append(d);
      }
    }
    const ps = `${v.parts.map((p) => p.part).join()}|${v.target}`;
    if (ps !== partSig) {
      partSig = ps;
      partSelect.innerHTML = '';
      if (!v.parts.length) {
        const o = el('option', '', str('replay.nothing_came_off'));
        o.value = '-1';
        partSelect.append(o);
      }
      for (const p of v.parts) {
        const o = el('option', '', str('replay.follow_part', { part: p.label }));
        o.value = String(p.part);
        partSelect.append(o);
      }
      partSelect.disabled = !v.parts.length;
      rigButtons.follow.disabled = !v.parts.length;
      if (v.target >= 0) {
        partSelect.value = String(v.target);
      }
    }
    const h = v.readout;
    set('osdv', `${Math.round(h[HEAD.speed] * 3.6)}|${h[HEAD.agl].toFixed(1)}|${Math.round(h[HEAD.throttle] * 100)}`, () => {
      osdSpeed.textContent = str('replay.kmh', { v: Math.round(h[HEAD.speed] * 3.6) });
      osdAlt.textContent = str('replay.metres', { v: h[HEAD.agl].toFixed(1) });
      osdThrFill.style.width = `${Math.round(Math.max(0, Math.min(1, h[HEAD.throttle])) * 100)}%`;
    });
    const showToast = v.toast && performance.now() < v.toast.until;
    set('toast', showToast ? v.toast.text : '', (tx) => {
      toast.hidden = !tx;
      toast.textContent = tx;
      if (tx) {
        toast.style.animation = 'none';
        void toast.offsetWidth;
        toast.style.animation = '';
      }
    });
  }

  let flashUntil = 0;
  function flash(text) {
    toast.hidden = false;
    toast.textContent = text;
    last.toast = text;
    flashUntil = performance.now() + 2600;
    setTimeout(() => {
      if (performance.now() >= flashUntil && last.toast === text) {
        toast.hidden = true;
        last.toast = '';
      }
    }, 2700);
  }

  /* ---- My clips ---- */
  async function fillClips() {
    list.innerHTML = '';
    let rows;
    try {
      rows = await api.listClips();
    } catch (err) {
      list.append(el('div', 'cc-empty', str('replay.clips_unavailable', { why: err.message })));
      return;
    }
    if (!rows.length) {
      list.append(el('div', 'cc-empty', str('replay.no_clips_yet')));
      return;
    }
    for (const row of rows) {
      list.append(clipCard(row));
    }
  }

  function clipCard(row) {
    const c = el('div', 'cc-clip');
    c.dataset.id = row.id;
    const th = el('div', 'cc-thumb');
    if (row.thumb instanceof Blob) {
      const url = URL.createObjectURL(row.thumb);
      th.style.backgroundImage = `url("${url}")`;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      th.classList.add('none');
    }
    th.append(el('span', 'cc-dur', fmt(row.duration || 0)));
    const body = el('div', 'cc-clip-body');
    const nm = el('div', 'cc-clip-name', row.name);
    const meta = el('div', 'cc-clip-meta', str('replay.clip_meta', { when: when(row.created), map: api.mapName(row.map) }));
    const acts = el('div', 'cc-clip-actions');
    const bPlayIt = button('cc-btn small primary', str('replay.play'), '', async () => {
      try {
        closeClips();
        await api.playSaved(row.id);
      } catch (err) {
        flash(str('replay.play_refused', { why: err.message }));
      }
    });
    const bRename = button('cc-btn small', str('replay.rename'), '', () => rename(row, nm));
    const bExport = button('cc-btn small', str('replay.export'), '', async () => {
      try {
        await api.exportSaved(row.id);
      } catch (err) {
        flash(err.message);
      }
    });
    const bDel = button('cc-btn small danger', str('replay.delete'), '', () => {
      askDelete(row.name, async () => {
        await api.deleteSaved(row.id);
        await fillClips();
      });
    });
    bPlayIt.dataset.act = 'play';
    bRename.dataset.act = 'rename';
    bExport.dataset.act = 'export';
    bDel.dataset.act = 'delete';
    acts.append(bPlayIt, bRename, bExport, bDel);
    body.append(nm, meta, acts);
    c.append(th, body);
    return c;
  }

  function rename(row, nm) {
    const input = el('input', '');
    input.value = row.name;
    input.maxLength = NAME_MAX;
    nm.innerHTML = '';
    nm.append(input);
    input.focus();
    input.select();
    let done = false;
    const commit = async (save) => {
      if (done) {
        return;
      }
      done = true;
      const v = input.value.trim();
      if (save && v && v !== row.name) {
        await api.renameSaved(row.id, v);
        row.name = v;
      }
      nm.textContent = row.name;
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        commit(true);
      } else if (ev.key === 'Escape') {
        commit(false);
      }
    });
    input.addEventListener('blur', () => commit(true));
  }

  function askDelete(clipName, yes) {
    confirmText.textContent = str('replay.delete_question', { name: clipName });
    confirmYes = yes;
    confirmBox.hidden = false;
    bKeepIt.focus();
  }

  function closeConfirm() {
    confirmBox.hidden = true;
    confirmYes = null;
  }

  function openClips() {
    clips.hidden = false;
    fillClips();
  }

  function closeClips() {
    clips.hidden = true;
  }

  /* ---- keys ---- */
  function onKey(code, repeat) {
    if (code === 'F8') {
      return false;
    }
    if (!confirmBox.hidden) {
      if (code === 'Escape' || code === 'Enter' || code === 'NumpadEnter') {
        closeConfirm();
      }
      return true;
    }
    if (!clips.hidden) {
      if (code === 'Escape' || code === 'KeyM') {
        closeClips();
      }
      return true;
    }
    const shift = api.shiftHeld();
    switch (code) {
      case 'Escape':
      case 'KeyV':
        if (!repeat) {
          api.close();
        }
        break;
      case 'Space':
        if (!repeat) {
          api.togglePlay();
        }
        break;
      case 'ArrowLeft':
        if (shift) {
          api.seekBy(-1);
        } else {
          api.step(-1);
        }
        break;
      case 'ArrowRight':
        if (shift) {
          api.seekBy(1);
        } else {
          api.step(1);
        }
        break;
      case 'ArrowUp':
        api.setSpeed(1);
        break;
      case 'ArrowDown':
        api.setSpeed(-1);
        break;
      case 'Home':
        api.jumpTo(0);
        break;
      case 'End':
        api.jumpTo(1e9);
        break;
      case 'BracketLeft':
        api.prevMarker();
        break;
      case 'BracketRight':
        api.nextMarker();
        break;
      case 'Tab':
        api.nextPart();
        break;
      case 'KeyK':
        if (!repeat) {
          api.addKey();
        }
        break;
      case 'Delete':
      case 'Backspace':
        api.removeKey();
        break;
      case 'KeyH':
        api.toggleOsd();
        break;
      case 'KeyL':
        api.toggleLetterbox();
        break;
      case 'KeyI':
        api.setIn();
        break;
      case 'KeyO':
        api.setOut();
        break;
      case 'KeyP':
        if (!repeat) {
          api.photo();
        }
        break;
      case 'KeyC':
        if (!repeat) {
          api.exportVideo();
        }
        break;
      case 'KeyG':
        if (!repeat) {
          api.saveReplay();
        }
        break;
      case 'KeyM':
        openClips();
        break;
      case 'KeyU':
        api.toggleBare();
        break;
      case 'Enter':
      case 'NumpadEnter':
        if (!repeat) {
          api.takeOver();
        }
        break;
      default: {
        const rig = Object.keys(RIG_KEYS).find((r) => code === `Digit${RIG_KEYS[r]}`);
        if (rig) {
          api.setRig(rig);
        }
        /* Everything else is the editor's too (W A S D Q E fly the free
         * camera), so nothing reaches the flight while it is open. */
      }
    }
    return true;
  }

  return {
    open(clipName) {
      root.hidden = false;
      prompt.hidden = true;
      name.textContent = clipName;
      last.name = clipName;
      requestAnimationFrame(placeOsd);
      const ui = document.getElementById('ui');
      if (ui) {
        ui.classList.add('cc-open');
      }
    },
    close() {
      root.hidden = true;
      clips.hidden = true;
      confirmBox.hidden = true;
      const ui = document.getElementById('ui');
      if (ui) {
        ui.classList.remove('cc-open');
      }
    },
    tick,
    onKey,
    openClips,
    prompt(show, key) {
      if (prompt.hidden === !show && promptKey.textContent === key) {
        return;
      }
      prompt.hidden = !show;
      promptKey.textContent = key;
    },
    root,
  };
}
