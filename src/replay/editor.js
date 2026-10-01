/*
 * editor.js: the crash cam's screen, and its prompt in flight.
 *
 * Everything the pilot sees of the crash cam is built here, as DOM over the
 * canvas: the REPLAY prompt after a crash, and while the editor is open a
 * head (the clip's name, the shot under the playhead, its camera and speed,
 * the movie's length), a dock at the bottom (the strip of shots with its
 * cuts and moments, the transport, the cameras, the looks and the ways to
 * keep a shot), a small replay OSD, the export dialog and My clips. The
 * reference is a console replay editor made casual: every control is one
 * click or one key, and the key is printed on the button.
 *
 * The replay is an edit (docs/EDITOR-PLAN.md, section 3): shots laid end to
 * end, each a stretch of the clip with one camera. The strip draws each
 * shot as a block in its camera's colour with its camera's name; a cut is
 * a grip between two blocks, drawn by how the shot after it starts. The
 * shot under the playhead is the one every camera, speed and look control
 * acts on, so there is no selection to make first.
 *
 * It holds no state of the replay's own. Every frame src/replay/crashcam.js
 * hands it a view ({ t, dur, playing, edit, shot, movie, markers, ... })
 * and it writes the few things that changed; every control calls the api
 * it was made with (section 4.3 of the plan). What is only about pixels is
 * decided here: where a dragged grip snaps, and whether a block is wide
 * enough for its camera's name. The pad's button edges are handed in by
 * crashcam.js through onPad, which binds them here next to the keys.
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
import { downloadBlob } from './store.js';
import { CRASHCAM_CSS } from './style.js';

const ICONS = {
  play: '<svg viewBox="0 0 20 20"><path d="M6 3.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 20 20"><path d="M5 3.5h3.6v13H5zM11.4 3.5H15v13h-3.6z"/></svg>',
  back: '<svg viewBox="0 0 20 20"><path d="M4 4h2v12H4zM17 4v12L7.5 10z"/></svg>',
  fwd: '<svg viewBox="0 0 20 20"><path d="M14 4h2v12h-2zM3 4v12l9.5-6z"/></svg>',
  prev: '<svg viewBox="0 0 20 20"><path d="M10 4v12L2 10zM18 4v12l-8-6z"/></svg>',
  next: '<svg viewBox="0 0 20 20"><path d="M10 4v12l8-6zM2 4v12l8-6z"/></svg>',
};

/* How a grip draws the way its shot starts: a bar for a cut, a slash for a
 * blend, a tilde for a glide. In and Out are brackets. */
const GRIP_GLYPHS = {
  cut: '<svg viewBox="0 0 12 24"><rect x="4.5" y="2" width="3" height="20" rx="1.5"/></svg>',
  blend: '<svg viewBox="0 0 12 24"><path d="M9.6 2.5 2.4 21.5" stroke-width="3" stroke-linecap="round"/></svg>',
  glide: '<svg viewBox="0 0 12 24"><path d="M1.5 12c1.4-3 3.1-3 4.5 0s3.1 3 4.5 0" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
  in: '<svg viewBox="0 0 12 24"><path d="M9 2.5H4v19h5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  out: '<svg viewBox="0 0 12 24"><path d="M3 2.5h5v19H3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

/* The rigs, their names and their number keys. */
const RIG_KEYS = { chase: '1', orbit: '2', free: '3', tripod: '4', fpv: '5', follow: '6' };
const ENTERS = ['cut', 'blend', 'glide'];
const BLEND_SECONDS = [0.25, 0.5, 1];

/* The owner's cap on an exported movie, in movie seconds (decided
 * 2026-09-29): a 30 s clip at 0.1x would otherwise be five minutes and
 * hundreds of megabytes of chunks. */
export const EXPORT_MAX_S = 120;
/* The export dialog's last choices. crashcam.js reads the frame rate from
 * here for the edit clock, so the preview steps in the movie's frames. */
export const EXPORT_PREFS_KEY = 'webfpv.replay.export.v1';
const EXPORT_DEFAULTS = { size: 1080, fps: 60, format: 'mp4', sound: true };

/* A dragged grip lands on a moment or the playhead within this many
 * pixels. Recorded rows are not snap targets: at up to 120 a second they
 * sit closer together than a pixel of any strip this dock can draw. */
const SNAP_PX = 8;
/* A press on a grip that moves less than this is a click (the transition
 * popover), not a drag. */
const DRAG_PX = 3;
/* A block narrower than this shows its rig's number instead of its name. */
const LABEL_MIN_PX = 64;

/* The standard pad's buttons. */
const PAD = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10,
  up: 12, down: 13, left: 14, right: 15,
};

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

/* A segmented pill whose buttons each carry a value. */
function segment(cls, items, onPick) {
  const seg = el('div', `cc-seg ${cls}`);
  const buttons = items.map(([value, label]) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.dataset.value = String(value);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onPick(value);
      b.blur();
    });
    seg.append(b);
    return b;
  });
  return { seg, buttons, values: items.map(([value]) => value) };
}

function fmt(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
}

/* Whole seconds, for a time left. */
function fmtShort(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function when(ms) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || '{}');
    return { ...EXPORT_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch (e) {
    /* Storage refused or the entry is not JSON: the defaults are a fine
     * dialog, and the next export writes a good entry over it. */
    return { ...EXPORT_DEFAULTS };
  }
}

function writePrefs(p) {
  try {
    localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(p));
  } catch (e) {
    /* Private mode: the choice lasts this session only, which is all a
     * pilot there expects. */
  }
}

function enterOf(shot) {
  return shot && shot.enter ? shot.enter.type : 'cut';
}

/*
 * The api is crashcam.js's (docs/EDITOR-PLAN.md 4.3). Besides view(), this
 * screen calls: togglePlay, seek, step, seekBy, jumpTo, prevMarker,
 * nextMarker, setSpeed, setRig, follow, watch, nextPart, nextWatch, cut,
 * removeCut, moveCut, setEdge, begin, end, setEnter, cycleEnter, undo, redo,
 * jumpCut, setIn, setOut, toggleOsd, toggleLetterbox, toggleBare, photo,
 * saveReplay, takeOver, close, drag, wheel, exportOptions, exportMovie,
 * cancelExport, shiftHeld, ctrlHeld, listClips, playSaved, renameSaved,
 * deleteSaved, exportSaved, importFile, mapName, and reads speeds and rigs.
 */
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
  const chipShot = el('span', 'cc-chip cream');
  const chipCam = el('span', 'cc-chip mint');
  const chipSpeed = el('span', 'cc-chip');
  const chipMovie = el('span', 'cc-chip slate');
  const chipLive = el('span', 'cc-chip slate');
  sub.append(chipShot, chipCam, chipSpeed, chipMovie, chipLive);
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
  const strip = el('div', 'cc-strip');
  const blockLayer = el('div', 'cc-blocks');
  const hatchIn = el('div', 'cc-hatch');
  const hatchOut = el('div', 'cc-hatch');
  const gripLayer = el('div', 'cc-grips');
  strip.append(blockLayer, hatchIn, hatchOut, gripLayer);
  const markLayer = el('div', '');
  const headline = el('div', 'cc-headline');
  timeline.append(strip, markLayer, headline);
  dock.append(timeline);

  /* The transition of one cut, opened by clicking its grip. */
  const pop = el('div', 'cc-pop');
  pop.hidden = true;
  const popEnter = segment('', ENTERS.map((e) => [e, str(`replay.enter_${e}`)]), (type) => {
    if (popCut < 0) {
      return;
    }
    const cur = lastView && lastView.edit.shots[popCut];
    const d = cur && cur.enter.type === 'blend' ? cur.enter.d : 0.5;
    api.setEnter(popCut, type === 'blend' ? { type, d } : { type });
  });
  const popBlend = segment('', BLEND_SECONDS.map((d) => [d, str('replay.seconds', { v: d })]), (d) => {
    if (popCut >= 0) {
      api.setEnter(popCut, { type: 'blend', d });
    }
  });
  pop.append(popEnter.seg, popBlend.seg);
  pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  dock.append(pop);
  let popCut = -1;

  const row = el('div', 'cc-row');
  const transport = el('div', 'cc-group');
  const bPrev = iconButton('', 'prev', str('replay.previous_marker'), () => api.prevMarker());
  const bBack = iconButton('', 'back', str('replay.step_back'), () => api.step(-1));
  const bPlay = iconButton('play', 'play', str('replay.play'), () => api.togglePlay());
  const bFwd = iconButton('', 'fwd', str('replay.step_forward'), () => api.step(1));
  const bNext = iconButton('', 'next', str('replay.next_marker'), () => api.nextMarker());
  const time = el('div', 'cc-time');
  const speedSeg = segment('speed', api.speeds.map((s) => [s, `${s}x`]), (s) => api.setSpeed(s));
  transport.append(bPrev, bBack, bPlay, bFwd, bNext, time, speedSeg.seg);

  const camera = el('div', 'cc-group');
  const rigSeg = el('div', 'cc-seg rigs');
  const rigButtons = {};
  for (const rig of api.rigs) {
    const b = el('button', `rig-${rig}`, str(`replay.rig_${rig}`));
    b.type = 'button';
    b.title = `${str(`replay.rig_${rig}`)} (${RIG_KEYS[rig]})`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      api.setRig(rig);
      b.blur();
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
  /* Whose aircraft the camera is on: shown when the clip has others in it
   * (src/replay/peers.js). */
  const watchSelect = el('select', 'cc-select');
  watchSelect.title = str('replay.watch_which');
  watchSelect.hidden = true;
  watchSelect.addEventListener('change', () => {
    api.watch(Number(watchSelect.value));
    watchSelect.blur();
  });
  camera.append(el('span', 'cc-label', str('replay.camera')), rigSeg, watchSelect, partSelect);
  row.append(transport, camera);
  dock.append(row);

  const rowEdit = el('div', 'cc-row');
  const editGroup = el('div', 'cc-group');
  const bCut = button('cc-btn small', str('replay.cut'), 'K', () => doCut());
  const bUncut = button('cc-btn small', str('replay.uncut'), 'Del', () => doRemoveCut());
  const bUndo = button('cc-btn small', str('replay.undo'), 'Z', () => api.undo());
  const bRedo = button('cc-btn small', str('replay.redo'), '⇧Z', () => api.redo());
  editGroup.append(el('span', 'cc-label', str('replay.edit')), bCut, bUncut, bUndo, bRedo);
  const looks = el('div', 'cc-group');
  const bOsd = button('cc-btn small', str('replay.osd'), 'H', () => api.toggleOsd());
  const bBox = button('cc-btn small', str('replay.letterbox'), 'L', () => api.toggleLetterbox());
  const bIn = button('cc-btn small', str('replay.mark_in'), 'I', () => api.setIn());
  const bOut = button('cc-btn small', str('replay.mark_out'), 'O', () => api.setOut());
  looks.append(el('span', 'cc-label', str('replay.look')), bOsd, bBox, el('span', 'cc-label', str('replay.range')), bIn, bOut);
  rowEdit.append(editGroup, looks);
  dock.append(rowEdit);

  const row2 = el('div', 'cc-row');
  const keep = el('div', 'cc-group');
  const bPhoto = button('cc-btn small', str('replay.photo'), 'P', () => api.photo());
  const bExport = button('cc-btn small', str('replay.export_movie'), 'C', () => openExport());
  const bSave = button('cc-btn small', str('replay.save'), 'G', () => api.saveReplay());
  keep.append(el('span', 'cc-label', str('replay.keep')), bPhoto, bExport, bSave);
  const bTake = button('cc-btn primary', str('replay.take_over'), 'Enter', () => api.takeOver());
  row2.append(keep, bTake);
  dock.append(row2);
  const hints = el('div', 'cc-hints');
  dock.append(hints);
  root.append(dock);

  /* ---- the export dialog ---- */
  const exp = el('div', 'cc-modal');
  exp.hidden = true;
  const expCard = el('div', 'cc-export');
  const expHead = el('div', 'cc-export-head');
  const expTitle = el('div', 'cc-title', str('replay.export_movie'));
  const expLen = el('div', 'cc-export-len');
  expHead.append(expTitle, expLen);
  const expForm = el('div', 'cc-export-form');
  const pick = (k) => (v) => {
    choice[k] = v;
    drawChoices();
  };
  const segSize = segment('', [[720, '720p'], [1080, '1080p']], pick('size'));
  const segFps = segment('', [[30, '30'], [60, '60']], pick('fps'));
  const segFormat = segment('', [['mp4', 'MP4'], ['webm', 'WebM']], pick('format'));
  const segSound = segment('', [[true, str('replay.export_on')], [false, str('replay.export_off')]], pick('sound'));
  const expSoundNote = el('div', 'cc-export-note', str('replay.export_no_music'));
  const expFormatWhy = el('div', 'cc-export-note warn');
  const formRow = (label, seg, ...notes) => {
    const r = el('div', 'cc-export-row');
    const cell = el('div', '');
    cell.append(seg, ...notes);
    r.append(el('span', 'cc-label', label), cell);
    expForm.append(r);
  };
  formRow(str('replay.export_size'), segSize.seg);
  formRow(str('replay.export_frames'), segFps.seg);
  formRow(str('replay.export_file'), segFormat.seg, expFormatWhy);
  formRow(str('replay.export_sound'), segSound.seg, expSoundNote);
  const expNotes = el('div', 'cc-export-notes');
  const expRealtime = el('p', 'warn', str('replay.export_realtime'));
  const expTooLong = el('p', 'warn');
  const expTab = el('p', '', str('replay.export_keep_tab'));
  expNotes.append(expRealtime, expTooLong, expTab);
  const expProgress = el('div', 'cc-export-progress');
  const expBar = el('div', 'cc-bar');
  const expBarFill = el('i', '');
  expBar.append(expBarFill);
  const expPct = el('span', 'cc-export-pct');
  const expCount = el('div', 'cc-export-note');
  const expBarRow = el('div', 'cc-export-barrow');
  expBarRow.append(expBar, expPct);
  expProgress.append(expBarRow, expCount);
  const expActions = el('div', 'cc-group cc-export-actions');
  const bExpCancel = button('cc-btn', str('replay.cancel'), 'Esc', () => cancelOrCloseExport());
  const bExpGo = button('cc-btn primary', str('replay.export'), 'Enter', () => startExport());
  expActions.append(bExpCancel, bExpGo);
  expCard.append(expHead, expForm, expNotes, expProgress, expActions);
  exp.append(expCard);
  exp.addEventListener('click', (ev) => {
    if (ev.target === exp && !running) {
      closeExport();
    }
  });
  root.append(exp);

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
  window.addEventListener('resize', () => {
    placeOsd();
    stripSig = '';
  });

  /* ---- the stage: drag to look, wheel to zoom ---- */
  let dragFrom = null;
  stage.addEventListener('pointerdown', (ev) => {
    closePop();
    dragFrom = [ev.clientX, ev.clientY];
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('dragging');
    api.begin();
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragFrom) {
      return;
    }
    api.drag(ev.clientX - dragFrom[0], ev.clientY - dragFrom[1]);
    dragFrom = [ev.clientX, ev.clientY];
  });
  const endDrag = () => {
    if (!dragFrom) {
      return;
    }
    dragFrom = null;
    stage.classList.remove('dragging');
    api.end();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    api.wheel(ev.deltaY);
  }, { passive: false });

  /* ---- the strip: scrub anywhere, drag a grip to move it ---- */
  let lastDur = 1;
  let lastView = null;
  const timeAtX = (x) => {
    const r = strip.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * lastDur;
  };
  /* A moment or the playhead within SNAP_PX of where the grip is. */
  function snap(t) {
    if (!lastView) {
      return t;
    }
    const perPx = lastDur / Math.max(1, strip.getBoundingClientRect().width);
    let best = t;
    let bestPx = SNAP_PX;
    for (const c of [lastView.t, ...lastView.markers.map((m) => m.t)]) {
      const px = Math.abs(c - t) / perPx;
      if (px < bestPx) {
        bestPx = px;
        best = c;
      }
    }
    return best;
  }

  /* Only one of these at a time: a scrub or a grip. */
  let scrubbing = false;
  let grip = null;
  timeline.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.cc-mark')) {
      return;
    }
    timeline.setPointerCapture(ev.pointerId);
    const g = ev.target.closest('.cc-grip');
    if (g) {
      grip = { kind: g.dataset.kind, i: Number(g.dataset.i), x0: ev.clientX, moved: false };
      return;
    }
    closePop();
    scrubbing = true;
    api.seek(timeAtX(ev.clientX));
  });
  timeline.addEventListener('pointermove', (ev) => {
    if (scrubbing) {
      api.seek(timeAtX(ev.clientX));
      return;
    }
    if (!grip) {
      return;
    }
    if (!grip.moved) {
      if (Math.abs(ev.clientX - grip.x0) < DRAG_PX) {
        return;
      }
      grip.moved = true;
      closePop();
      api.begin();
    }
    const t = snap(timeAtX(ev.clientX));
    if (grip.kind === 'cut') {
      api.moveCut(grip.i, t);
    } else {
      api.setEdge(grip.kind, t);
    }
  });
  const endStrip = () => {
    scrubbing = false;
    if (!grip) {
      return;
    }
    const g = grip;
    grip = null;
    if (g.moved) {
      api.end();
    } else if (g.kind === 'cut') {
      openPop(g.i);
    }
  };
  timeline.addEventListener('pointerup', endStrip);
  timeline.addEventListener('pointercancel', endStrip);
  root.addEventListener('pointerdown', (ev) => {
    if (!pop.hidden && !ev.target.closest('.cc-pop') && !ev.target.closest('.cc-grip')) {
      closePop();
    }
  });

  function openPop(i) {
    popCut = i;
    pop.hidden = false;
    popSig = '';
  }

  function closePop() {
    popCut = -1;
    pop.hidden = true;
  }

  /* ---- keeping the screen level with the view ---- */
  let markSig = '';
  let stripSig = '';
  let popSig = '';
  let partSig = '';
  let watchSig = '';
  const blocks = [];
  const grips = [];
  const last = {};
  function set(k, v, write) {
    if (last[k] !== v) {
      last[k] = v;
      write(v);
    }
  }
  const pct = (x) => `${(100 * Math.max(0, Math.min(1, x / lastDur))).toFixed(3)}%`;

  /* Grows or shrinks a pool of elements to n, so a grip being dragged is
   * the same element from one frame to the next. */
  function pool(arr, layer, n, make) {
    while (arr.length < n) {
      const e = make();
      layer.append(e);
      arr.push(e);
    }
    while (arr.length > n) {
      arr.pop().remove();
    }
  }

  function drawStrip(v) {
    const { shots, out } = v.edit;
    const sig = `${lastDur}|${out}|${shots.map((s) => `${s.t0}:${s.cam.rig}:${s.speed}:${enterOf(s)}`).join()}`;
    if (sig === stripSig) {
      return;
    }
    stripSig = sig;
    const widthPx = strip.clientWidth || 1;
    pool(blocks, blockLayer, shots.length, () => {
      const b = el('div', 'cc-shot');
      b.append(el('b', ''), el('small', ''));
      return b;
    });
    shots.forEach((s, i) => {
      const t1 = i + 1 < shots.length ? shots[i + 1].t0 : out;
      const b = blocks[i];
      b.className = `cc-shot rig-${s.cam.rig}`;
      b.dataset.rig = s.cam.rig;
      b.style.left = pct(s.t0);
      b.style.width = pct(t1 - s.t0);
      const wide = ((t1 - s.t0) / lastDur) * widthPx >= LABEL_MIN_PX;
      b.firstChild.textContent = wide ? str(`replay.rig_${s.cam.rig}`) : RIG_KEYS[s.cam.rig];
      b.lastChild.textContent = s.speed !== 1 ? str('replay.speed_chip', { speed: s.speed }) : '';
      b.title = str('replay.shot_title', { i: i + 1, n: shots.length, camera: str(`replay.rig_${s.cam.rig}`) });
    });
    hatchIn.style.left = '0';
    hatchIn.style.width = pct(shots[0].t0);
    hatchOut.style.left = pct(out);
    hatchOut.style.width = pct(lastDur - out);
    /* In, every cut, Out: the grips in time order. */
    const marks = [{ kind: 'in', i: 0, t: shots[0].t0 }];
    for (let i = 1; i < shots.length; i += 1) {
      marks.push({ kind: 'cut', i, t: shots[i].t0, enter: enterOf(shots[i]) });
    }
    marks.push({ kind: 'out', i: shots.length, t: out });
    pool(grips, gripLayer, marks.length, () => {
      const g = el('div', 'cc-grip');
      g.append(el('i', ''));
      return g;
    });
    marks.forEach((m, k) => {
      const g = grips[k];
      const glyph = m.kind === 'cut' ? m.enter : m.kind;
      g.className = `cc-grip ${m.kind} ${glyph}`;
      g.dataset.kind = m.kind;
      g.dataset.i = String(m.i);
      g.style.left = pct(m.t);
      if (g.dataset.glyph !== glyph) {
        g.dataset.glyph = glyph;
        g.firstChild.innerHTML = GRIP_GLYPHS[glyph];
      }
      g.title = m.kind === 'cut'
        ? str('replay.grip_cut', { how: str(`replay.enter_${m.enter}`), time: fmt(m.t) })
        : str(`replay.grip_${m.kind}`, { time: fmt(m.t) });
    });
  }

  function drawPop(v) {
    if (popCut < 0) {
      return;
    }
    const s = v.edit.shots[popCut];
    if (!s || popCut < 1) {
      closePop();
      return;
    }
    const sig = `${popCut}|${s.t0}|${s.enter.type}|${s.enter.d}|${lastDur}`;
    if (sig === popSig) {
      return;
    }
    popSig = sig;
    for (const b of popEnter.buttons) {
      b.classList.toggle('on', b.dataset.value === s.enter.type);
    }
    popBlend.seg.hidden = s.enter.type !== 'blend';
    for (const b of popBlend.buttons) {
      b.classList.toggle('on', Number(b.dataset.value) === s.enter.d);
    }
    /* Over its grip, kept inside the dock. */
    const dr = dock.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    const x = sr.left - dr.left + (s.t0 / lastDur) * sr.width;
    const w = pop.offsetWidth || 240;
    pop.style.left = `${Math.max(8, Math.min(dr.width - w - 8, x - w / 2))}px`;
  }

  function tick(v) {
    lastView = v;
    lastDur = Math.max(1e-6, v.dur);
    const shots = v.edit.shots;
    const shot = shots[v.shot];
    const cam = shot.cam;
    headline.style.left = pct(v.t);
    drawStrip(v);
    set('sel', `${v.shot}|${shots.length}`, () => {
      blocks.forEach((b, i) => b.classList.toggle('sel', i === v.shot));
    });
    drawPop(v);
    set('time', `${fmt(v.t)}|${fmt(v.dur)}`, () => {
      time.innerHTML = '';
      time.append(document.createTextNode(fmt(v.t)), el('small', '', ` / ${fmt(v.dur)}`));
    });
    set('playing', v.playing, (p) => {
      bPlay.innerHTML = ICONS[p ? 'pause' : 'play'];
      bPlay.title = str(p ? 'replay.pause' : 'replay.play');
    });
    set('speed', shot.speed, (s) => {
      speedSeg.buttons.forEach((b, i) => b.classList.toggle('on', api.speeds[i] === s));
      chipSpeed.textContent = str('replay.speed_chip', { speed: s });
    });
    set('shot', `${v.shot}|${shots.length}`, () => {
      chipShot.textContent = str('replay.shot_of', { i: v.shot + 1, n: shots.length });
    });
    set('rig', cam.rig, (rig) => {
      for (const [r, b] of Object.entries(rigButtons)) {
        b.classList.toggle('on', r === rig);
      }
      chipCam.textContent = str(`replay.rig_${rig}`);
      chipCam.className = `cc-chip rig rig-${rig}`;
    });
    set('movie', fmt(v.movie.dur), (len) => {
      chipMovie.textContent = str('replay.movie_length', { time: len });
      expLen.textContent = len;
      drawChoices();
    });
    set('live', v.live, (live) => {
      chipLive.textContent = live ? str('replay.last_seconds') : str('replay.saved_clip');
    });
    set('undo', `${v.canUndo}|${v.canRedo}`, () => {
      bUndo.disabled = !v.canUndo;
      bRedo.disabled = !v.canRedo;
    });
    set('uncut', shots.length > 1, (any) => {
      bUncut.disabled = !any;
    });
    set('saved', v.saved, (saved) => {
      bSave.title = saved ? str('replay.save_over') : '';
    });
    set('exporting', Boolean(v.exporting), (x) => {
      rec.hidden = !x;
      bExport.disabled = x;
      drawExport();
    });
    if (v.exporting) {
      drawProgress(v.exporting);
    }
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
    set('pad', Boolean(v.pad), (pad) => {
      hints.innerHTML = str(pad ? 'replay.pad_hints_html' : 'replay.hints_html');
    });
    const ms = v.markers.map((m) => `${m.type}${m.t.toFixed(3)}`).join() + lastDur;
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
    const ps = `${v.parts.map((p) => p.part).join()}|${cam.target}|${cam.rig}`;
    if (ps !== partSig) {
      partSig = ps;
      partSelect.innerHTML = '';
      /* The first line says what the list is for, until a part is chosen. */
      const head = el('option', '', str(v.parts.length ? 'replay.pick_part' : 'replay.nothing_came_off'));
      head.value = '-1';
      head.disabled = v.parts.length > 0;
      partSelect.append(head);
      for (const p of v.parts) {
        const o = el('option', '', str('replay.follow_part', { part: p.label }));
        o.value = String(p.part);
        partSelect.append(o);
      }
      partSelect.disabled = !v.parts.length;
      rigButtons.follow.disabled = !v.parts.length;
      partSelect.value = cam.rig === 'follow' && cam.target >= 0 ? String(cam.target) : '-1';
    }
    const ws = `${v.peers.map((p) => `${p.id}:${p.label}`).join()}|${cam.watch}`;
    if (ws !== watchSig) {
      watchSig = ws;
      watchSelect.innerHTML = '';
      const me = el('option', '', str('replay.watch_me'));
      me.value = '0';
      watchSelect.append(me);
      for (const p of v.peers) {
        const o = el('option', '', p.label || str('replay.watch_seat', { seat: p.seat }));
        o.value = String(p.id);
        watchSelect.append(o);
      }
      watchSelect.hidden = !v.peers.length;
      watchSelect.value = String(cam.watch);
    }
    const h = v.readout;
    set('osdv', `${Math.round(h[HEAD.speed] * 3.6)}|${h[HEAD.agl].toFixed(1)}|${Math.round(h[HEAD.throttle] * 100)}`, () => {
      osdSpeed.textContent = str('replay.kmh', { v: Math.round(h[HEAD.speed] * 3.6) });
      osdAlt.textContent = str('replay.metres', { v: h[HEAD.agl].toFixed(1) });
      osdThrFill.style.width = `${Math.round(Math.max(0, Math.min(1, h[HEAD.throttle])) * 100)}%`;
    });
    /* A word of the screen's own (flash) holds the toast until it is read;
     * the view's toast, usually empty, would otherwise wipe it next frame. */
    if (performance.now() < flashUntil) {
      return;
    }
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

  /* ---- cutting, with the word for what happened ---- */
  function shotCount() {
    return api.view().edit.shots.length;
  }

  function doCut() {
    const n = shotCount();
    api.cut();
    if (shotCount() > n) {
      flash(str('replay.cut_added'));
    }
  }

  function doRemoveCut() {
    const n = shotCount();
    api.removeCut();
    if (shotCount() < n) {
      closePop();
      flash(str('replay.cut_removed'));
    }
  }

  function nextRig() {
    const v = api.view();
    const rig = v.edit.shots[v.shot].cam.rig;
    api.setRig(api.rigs[(api.rigs.indexOf(rig) + 1) % api.rigs.length]);
  }

  /* ---- the export dialog ---- */
  let choice = readPrefs();
  let options = null;
  let running = false;

  function formatOk(id) {
    const f = options && options.formats.find((x) => x.id === id);
    return Boolean(f && f.ok);
  }

  function tooLong() {
    return Boolean(lastView) && lastView.movie.dur > EXPORT_MAX_S;
  }

  /* The choices as the browser can make them: a remembered choice this
   * browser cannot do falls to the first it can. */
  function drawChoices() {
    if (!options) {
      bExpGo.disabled = true;
      return;
    }
    if (!options.sizes.includes(choice.size)) {
      choice.size = options.sizes[options.sizes.length - 1];
    }
    if (!options.fps.includes(choice.fps)) {
      choice.fps = options.fps[options.fps.length - 1];
    }
    if (!formatOk(choice.format)) {
      const ok = options.formats.find((f) => f.ok);
      choice.format = ok ? ok.id : choice.format;
    }
    if (!options.sound.ok) {
      choice.sound = false;
    }
    const mark = (seg, value, allowed) => seg.buttons.forEach((b, k) => {
      const v = seg.values[k];
      b.classList.toggle('on', v === value);
      b.disabled = !allowed(v);
    });
    mark(segSize, choice.size, (v) => options.sizes.includes(v));
    mark(segFps, choice.fps, (v) => options.fps.includes(v));
    mark(segFormat, choice.format, (v) => formatOk(v));
    mark(segSound, choice.sound, (v) => !v || options.sound.ok);
    const why = options.formats.filter((f) => !f.ok && f.why).map((f) => f.why);
    expFormatWhy.textContent = why.join(' ');
    expFormatWhy.hidden = !why.length;
    expSoundNote.textContent = options.sound.ok ? str('replay.export_no_music') : options.sound.why;
    expRealtime.hidden = options.webcodecs;
    expTooLong.hidden = !tooLong();
    expTooLong.textContent = lastView ? str('replay.export_too_long', { time: fmt(lastView.movie.dur), max: fmtShort(EXPORT_MAX_S) }) : '';
    bExpGo.disabled = running || tooLong() || !formatOk(choice.format);
  }

  function drawExport() {
    expTitle.textContent = str(running ? 'replay.exporting' : 'replay.export_movie');
    expForm.hidden = running;
    expNotes.hidden = running;
    expProgress.hidden = !running;
    bExpGo.hidden = running;
    drawChoices();
  }

  function drawProgress(p) {
    const frac = p.total > 0 ? Math.max(0, Math.min(1, p.done / p.total)) : 0;
    const pc = `${Math.floor(frac * 100)}%`;
    set('expPct', pc, () => {
      expBarFill.style.width = pc;
      expPct.textContent = pc;
    });
    const left = Number.isFinite(p.etaS) ? fmtShort(p.etaS) : '';
    set('expCount', `${p.done}|${p.total}|${left}|${p.realtime}`, () => {
      expCount.textContent = str('replay.export_progress', { i: p.done, n: p.total, left })
        + (p.realtime ? ` ${str('replay.export_realtime')}` : '');
    });
  }

  async function openExport() {
    if (!exp.hidden) {
      return;
    }
    closePop();
    exp.hidden = false;
    drawExport();
    if (running) {
      return;
    }
    options = null;
    drawChoices();
    try {
      options = await api.exportOptions();
    } catch (err) {
      closeExport();
      flash(str('replay.export_failed', { why: err.message }));
      return;
    }
    drawChoices();
    bExpGo.focus();
  }

  function closeExport() {
    exp.hidden = true;
  }

  function cancelOrCloseExport() {
    if (running) {
      api.cancelExport();
      return;
    }
    closeExport();
  }

  async function startExport() {
    if (running || exp.hidden || !options || bExpGo.disabled) {
      return;
    }
    writePrefs(choice);
    running = true;
    drawExport();
    let res = null;
    try {
      res = await api.exportMovie({ ...choice });
    } catch (err) {
      running = false;
      drawExport();
      closeExport();
      flash(str('replay.export_failed', { why: err.message }));
      return;
    }
    running = false;
    drawExport();
    closeExport();
    if (!res) {
      flash(str('replay.export_cancelled'));
      return;
    }
    downloadBlob(res.name, res.bytes);
    flash(str('replay.export_saved', { name: res.name }));
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
    const bExportIt = button('cc-btn small', str('replay.export'), '', async () => {
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
    bExportIt.dataset.act = 'export';
    bDel.dataset.act = 'delete';
    acts.append(bPlayIt, bRename, bExportIt, bDel);
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
    closePop();
    clips.hidden = false;
    fillClips();
  }

  function closeClips() {
    clips.hidden = true;
  }

  /* ---- keys ---- */

  /* The export dialog takes every key while it is up: Enter starts, Esc
   * cancels, and nothing reaches the edit under it. */
  function exportKey(code, repeat) {
    if (repeat) {
      return;
    }
    if (code === 'Escape') {
      cancelOrCloseExport();
    } else if (code === 'Enter' || code === 'NumpadEnter') {
      startExport();
    }
  }

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
    if (!exp.hidden) {
      exportKey(code, repeat);
      return true;
    }
    if (code === 'Escape' && !pop.hidden) {
      closePop();
      return true;
    }
    const shift = api.shiftHeld();
    const ctrl = api.ctrlHeld();
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
        api.speedBy(1);
        break;
      case 'ArrowDown':
        api.speedBy(-1);
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
      case 'Comma':
        api.jumpCut(-1);
        break;
      case 'Period':
        api.jumpCut(1);
        break;
      case 'KeyJ':
        api.nextWatch();
        break;
      case 'Tab':
        api.nextPart();
        break;
      case 'KeyK':
        if (!repeat) {
          doCut();
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (!repeat) {
          doRemoveCut();
        }
        break;
      case 'KeyT':
        if (!repeat) {
          api.cycleEnter();
        }
        break;
      case 'KeyZ':
        if (shift) {
          api.redo();
        } else {
          api.undo();
        }
        break;
      case 'KeyY':
        if (ctrl) {
          api.redo();
        }
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
          openExport();
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

  /* ---- the pad (standard mapping), as button edges ---- */
  function onPad(edges) {
    if (!edges) {
      return;
    }
    const b = (i) => (edges & (1 << i)) !== 0;
    if (!confirmBox.hidden || !clips.hidden) {
      if (b(PAD.b)) {
        closeConfirm();
        closeClips();
      }
      return;
    }
    if (!exp.hidden) {
      if (b(PAD.b)) {
        cancelOrCloseExport();
      } else if (b(PAD.a) || b(PAD.start)) {
        startExport();
      }
      return;
    }
    if (b(PAD.a)) {
      api.togglePlay();
    }
    if (b(PAD.b)) {
      api.close();
      return;
    }
    if (b(PAD.x)) {
      nextRig();
    }
    if (b(PAD.y)) {
      doCut();
    }
    if (b(PAD.l3)) {
      doRemoveCut();
    }
    if (b(PAD.lb) || b(PAD.left)) {
      api.step(-1);
    }
    if (b(PAD.rb) || b(PAD.right)) {
      api.step(1);
    }
    if (b(PAD.up)) {
      api.speedBy(1);
    }
    if (b(PAD.down)) {
      api.speedBy(-1);
    }
    if (b(PAD.lt)) {
      api.jumpCut(-1);
    }
    if (b(PAD.rt)) {
      api.jumpCut(1);
    }
    if (b(PAD.back)) {
      api.undo();
    }
    if (b(PAD.start)) {
      openExport();
    }
  }

  return {
    open(clipName) {
      root.hidden = false;
      prompt.hidden = true;
      name.textContent = clipName;
      last.name = clipName;
      stripSig = '';
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
      exp.hidden = true;
      closePop();
      const ui = document.getElementById('ui');
      if (ui) {
        ui.classList.remove('cc-open');
      }
    },
    tick,
    onKey,
    onPad,
    openClips,
    openExport,
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
