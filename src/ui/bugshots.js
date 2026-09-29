/*
 * bugshots.js: screenshots pasted, dropped or chosen into a report form.
 *
 * The owner asked for the bug form to take a screenshot the way the Claude
 * Code CLI takes one: Ctrl+V with an image on the clipboard, and it shows
 * in the message as a chip, [Image 1], then goes with it. So a paste
 * anywhere in the form attaches every image on the clipboard, including a
 * paste into a textarea while typing, and each one becomes a chip with a
 * thumbnail and an x. Text on the clipboard is left alone: a paste that
 * carries text still pastes the text, and only its image items attach.
 * Dropping a file on the form and choosing one from disk do the same.
 *
 * WHAT GOES TO THE BOARD IS NOT THE PASTE. A 4K screenshot is a PNG of
 * several megabytes, so every image is drawn to a canvas at no more than
 * SHOT_EDGE on its long edge and re-encoded as WebP (JPEG where the browser
 * cannot write WebP) until it is under SHOT_BYTES. The board refuses
 * anything over a mebibyte or that is not PNG, JPEG or WebP by its bytes
 * (inspectBugImages in the board's src/validate.js), so this is what keeps
 * a pilot's report from bouncing, not decoration. The work starts at paste
 * time so the chip can show the thumbnail while the pilot keeps typing,
 * and Send waits for whatever is still being encoded.
 *
 * Nothing here touches the document at import: scripts import src/ui/ui.js
 * in Node.
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

/* The board takes four, a mebibyte each; see its MAX_BUG_IMAGES. */
export const MAX_SHOTS = 4;
export const SHOT_EDGE = 1920;
export const SHOT_BYTES = 1_000_000;
/* Quality steps tried at each size before the size itself comes down. */
const QUALITIES = [0.85, 0.72, 0.6];
/* Below this long edge a screenshot says nothing, so a file that still
 * will not fit is refused rather than sent as a smudge. */
const MIN_EDGE = 480;

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

/*
 * The images on a clipboard or a drop. Items first, because that is where
 * Chrome puts a screenshot; files as the fallback, because a DataTransfer
 * built by hand, or by another browser, may only fill that list. Never
 * both, or the same image would attach twice.
 */
export function imageFilesOf(data) {
  if (!data) {
    return [];
  }
  const fromItems = [...(data.items || [])]
    .filter((item) => item.kind === 'file' && /^image\//.test(item.type))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (fromItems.length) {
    return fromItems;
  }
  return [...(data.files || [])].filter((f) => /^image\//.test(f.type));
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function dataUrlOf(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/*
 * One image, downscaled and re-encoded until it fits. Resolves to a data:
 * URL of WebP or JPEG under SHOT_BYTES, or throws with a message the tray
 * shows.
 */
export async function encodeShot(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    throw new Error(str('ui.shots_unreadable'));
  }
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    let edge = Math.min(SHOT_EDGE, longEdge);
    const canvas = document.createElement('canvas');
    while (edge >= Math.min(MIN_EDGE, longEdge)) {
      const scale = edge / longEdge;
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const q of QUALITIES) {
        let blob = await canvasBlob(canvas, 'image/webp', q);
        /* Safari writes PNG when asked for WebP: the type says so. */
        if (!blob || blob.type !== 'image/webp') {
          blob = await canvasBlob(canvas, 'image/jpeg', q);
        }
        if (blob && blob.size <= SHOT_BYTES) {
          return dataUrlOf(blob);
        }
      }
      if (edge === Math.min(MIN_EDGE, longEdge)) {
        break;
      }
      edge = Math.max(Math.min(MIN_EDGE, longEdge), Math.round(edge * 0.75));
    }
    throw new Error(str('ui.shots_too_big'));
  } finally {
    bitmap.close();
  }
}

/*
 * The tray: the paste target, the chips and the file picker, listening on
 * `form`, the dialog box the tray sits in, so a paste or a drop anywhere
 * in the form lands here. Its listeners die with the box, which the dialog
 * throws away when it closes.
 *
 * `onChange` runs when an image is added or removed, so the form can
 * recount what would be lost on close.
 */
export function createShotTray(form, onChange = () => {}) {
  const shots = [];
  let locked = false;

  const wrap = node('div', 'shot-tray');
  const drop = node('div', 'shot-drop');
  drop.tabIndex = 0;
  drop.setAttribute('role', 'button');
  drop.append(node('span', 'shot-drop-text', str('ui.shots_drop')));
  const pick = node('button', 'shot-pick', str('ui.shots_choose'));
  pick.type = 'button';
  drop.append(pick);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  const chips = node('div', 'shot-chips');
  const err = node('p', 'shot-err', '');
  wrap.append(drop, input, chips, err);

  const relabel = () => {
    shots.forEach((shot, i) => {
      shot.label.textContent = str('ui.shots_image_n', { n: i + 1 });
      shot.remove.title = str('ui.shots_remove', { n: i + 1 });
      shot.remove.setAttribute('aria-label', shot.remove.title);
    });
  };

  const discard = (shot) => {
    const i = shots.indexOf(shot);
    if (i >= 0) {
      shots.splice(i, 1);
    }
    shot.chip.remove();
    relabel();
    onChange();
  };

  const add = (files) => {
    if (locked || !wrap.isConnected) {
      return;
    }
    err.textContent = '';
    for (const file of files) {
      if (shots.length >= MAX_SHOTS) {
        err.textContent = str('ui.shots_at_most');
        break;
      }
      const chip = node('span', 'shot-chip pending');
      const thumb = document.createElement('img');
      thumb.className = 'shot-thumb';
      thumb.alt = '';
      const label = node('span', 'shot-label', '');
      const remove = node('button', 'shot-x', '×');
      remove.type = 'button';
      chip.append(thumb, label, remove);
      chips.append(chip);
      const shot = { chip, label, remove, dataUrl: '', ready: null };
      remove.addEventListener('click', () => {
        if (!locked) {
          discard(shot);
        }
      });
      shot.ready = encodeShot(file).then((url) => {
        shot.dataUrl = url;
        thumb.src = url;
        chip.classList.remove('pending');
      }, (e) => {
        discard(shot);
        err.textContent = e.message || str('ui.shots_unreadable');
      });
      shots.push(shot);
    }
    relabel();
    onChange();
  };

  /*
   * Only a clipboard carrying images is touched. With no text on it as
   * well, the default is prevented, so nothing odd is inserted where the
   * caret was; with text, the text still pastes where the caret is and the
   * images attach beside it.
   */
  form.addEventListener('paste', (e) => {
    const files = imageFilesOf(e.clipboardData);
    if (!files.length) {
      return;
    }
    const types = [...(e.clipboardData.types || [])];
    if (!types.includes('text/plain')) {
      e.preventDefault();
    }
    add(files);
  });
  /* A file dragged over the form is taken here rather than by the browser,
   * which would otherwise leave the game to show the file. */
  const carriesFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
  form.addEventListener('dragover', (e) => {
    if (carriesFiles(e)) {
      e.preventDefault();
      drop.classList.add('over');
    }
  });
  form.addEventListener('dragleave', (e) => {
    if (e.target === drop) {
      drop.classList.remove('over');
    }
  });
  form.addEventListener('drop', (e) => {
    if (!carriesFiles(e)) {
      return;
    }
    e.preventDefault();
    drop.classList.remove('over');
    add(imageFilesOf(e.dataTransfer));
  });
  drop.addEventListener('click', (e) => {
    if (e.target !== pick) {
      drop.focus();
    }
  });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    add([...(input.files || [])]);
    input.value = '';
  });

  return {
    node: wrap,
    count: () => shots.length,
    /* No paste, drop or removal while the report is in flight. */
    lock(on) {
      locked = Boolean(on);
      wrap.classList.toggle('locked', locked);
    },
    /* Every attached image as a data: URL, in chip order, once the ones
     * still encoding have finished. One that failed has already taken its
     * chip away and said why. */
    async dataUrls() {
      await Promise.all(shots.map((s) => s.ready));
      return shots.filter((s) => s.dataUrl).map((s) => s.dataUrl);
    },
  };
}
