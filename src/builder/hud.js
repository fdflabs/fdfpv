/*
 * hud.js: what the builder draws over the world, as DOM.
 *
 * A crosshair, a nine slot hotbar along the bottom with the piece in hand
 * named over it, a status line above that (the piece, the snap, the grid,
 * the fly speed, or what the mouse is doing now), a panel in the top left
 * for the track and its warnings, the controls card (H) on the right, the
 * Save button in the bottom left with what became of the last save, and
 * the inventory (E): every piece on its shelf, a click puts it in the slot
 * in hand and a drag puts it in any slot. Nothing here knows what a gate
 * is: buildmode.js hands it names, icons and text, and hears back which
 * slot or piece was picked and when Save was clicked.
 *
 * The Save button is clicked with the mouse free (Esc, or a right click on
 * a gate), the way the hotbar is: while the builder holds the mouse every
 * click goes to the world, so it cannot take a click meant for a piece,
 * and its Ctrl S says how to save without letting go.
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

/* How long the name of a newly picked piece stays over the hotbar, ms. */
const NAME_MS = 1800;
/* A press that moves further than this, px, is a drag and not a click. */
const DRAG_PX = 6;

const CSS = `
.bh { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: var(--ui-font); color: var(--cream); }
.bh-cross { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; }
.bh-cross::before, .bh-cross::after { content: ''; position: absolute; background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55); }
.bh-cross::before { left: 10px; top: 0; width: 2px; height: 22px; }
.bh-cross::after { left: 0; top: 10px; width: 22px; height: 2px; }
.bh-bottom { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-direction: column;
  align-items: center; gap: 6px; max-width: calc(100vw - 32px); }
.bh-name { font: 600 16px/1.2 var(--ui-font); text-shadow: 0 1px 3px #000, 0 0 8px rgba(0, 0, 0, 0.8); opacity: 0;
  transition: opacity 0.25s; white-space: nowrap; }
.bh-name.on { opacity: 1; }
.bh-status { font: 13px/1.3 var(--ui-font); padding: 4px 10px; border-radius: 4px; background: rgba(12, 18, 14, 0.62);
  text-shadow: 0 1px 2px #000; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.bh-status.warn { background: rgba(120, 18, 22, 0.78); }
.bh-bar { display: flex; gap: 3px; padding: 3px; background: rgba(8, 12, 10, 0.72); border: 2px solid rgba(0, 0, 0, 0.6);
  border-radius: 3px; pointer-events: auto; }
.bh-slot { position: relative; width: 56px; height: 56px; background: rgba(243, 234, 212, 0.07);
  border: 2px solid rgba(243, 234, 212, 0.18); box-sizing: border-box; cursor: pointer; }
.bh-slot img { position: absolute; inset: 3px; width: 46px; height: 46px; object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6)); }
.bh-slot b { position: absolute; left: 3px; top: 1px; font: 700 11px/1 var(--ui-font); color: rgba(243, 234, 212, 0.75);
  text-shadow: 0 1px 1px #000; }
.bh-slot.on { border: 3px solid var(--amber); background: rgba(255, 212, 92, 0.16); box-shadow: 0 0 0 1px #000; }
.bh-slot.drop { border-color: var(--mint); }
.bh-panel { position: absolute; left: 16px; top: 56px; max-width: min(460px, calc(100vw - 32px)); padding: 8px 12px;
  white-space: pre-line; background: rgba(12, 18, 14, 0.72); border-radius: 6px; font-size: 13px; line-height: 1.45; }
.bh-help { position: absolute; right: 16px; top: 100px; width: 330px; max-width: calc(100vw - 32px); padding: 8px 11px 7px;
  background: rgba(12, 18, 14, 0.8); border-radius: 6px; font-size: 11.5px; line-height: 1.3; color: rgba(243, 234, 212, 0.9); }
.bh-help h3 { margin: 0 0 6px; font: 700 13px/1.2 var(--ui-font); letter-spacing: 0.08em; color: var(--cream); }
.bh-row { display: grid; grid-template-columns: 92px 1fr; gap: 6px; padding: 1.5px 0; }
.bh-help kbd { font: 700 11px/1.3 var(--ui-font); color: var(--amber); }
.bh-foot { margin-top: 6px; opacity: 0.6; }
.bh-helphint { position: absolute; right: 16px; top: 100px; padding: 4px 9px; border-radius: 4px; font-size: 12px;
  background: rgba(12, 18, 14, 0.62); }
.bh.inv-open .bh-help, .bh.inv-open .bh-helphint, .bh.inv-open .bh-cross { display: none; }
.bh-inv { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); width: 640px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 190px); overflow: auto; padding: 14px 16px; box-sizing: border-box; background: rgba(16, 22, 18, 0.95);
  border: 2px solid rgba(0, 0, 0, 0.7); border-radius: 6px; pointer-events: auto; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); }
.bh-inv h2 { margin: 0; font: 700 17px/1.2 var(--ui-font); }
.bh-invhint { margin: 4px 0 4px; font-size: 12px; opacity: 0.72; }
.bh-shelves { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 4px 14px; }
.bh-inv h4 { margin: 10px 0 6px; font: 600 11px/1 var(--ui-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--slate); }
.bh-shelf { display: flex; flex-wrap: wrap; gap: 6px; }
.bh-tile { width: 92px; padding: 5px 3px 5px; box-sizing: border-box; text-align: center; background: rgba(243, 234, 212, 0.06);
  border: 2px solid rgba(243, 234, 212, 0.14); border-radius: 3px; cursor: grab; user-select: none; }
.bh-tile:hover { border-color: var(--amber); background: rgba(255, 212, 92, 0.1); }
.bh-tile img { width: 60px; height: 60px; object-fit: contain; pointer-events: none; display: block; margin: 0 auto 3px; }
.bh-tile span { display: block; font-size: 11px; line-height: 1.2; pointer-events: none; }
.bh-file { position: absolute; left: 16px; bottom: 14px; display: flex; flex-direction: column; gap: 4px;
  max-width: 260px; pointer-events: auto; }
.bh-save { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 4px; cursor: pointer;
  font: 700 15px/1.2 var(--ui-font); color: var(--cream); background: rgba(8, 12, 10, 0.78);
  border: 2px solid rgba(243, 234, 212, 0.35); }
.bh-save:hover { border-color: var(--amber); background: rgba(40, 34, 14, 0.85); }
.bh-save kbd { font: 700 11px/1.3 var(--ui-font); color: var(--amber); }
.bh-savestate { font: 12px/1.3 var(--ui-font); padding: 3px 8px; border-radius: 4px; background: rgba(12, 18, 14, 0.62);
  text-shadow: 0 1px 2px #000; }
.bh-savestate b { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bh-savestate span::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%;
  background: rgba(243, 234, 212, 0.5); }
.bh-savestate[data-state="online"] span::before { background: var(--mint); }
.bh-savestate[data-state="pending"] span::before, .bh-savestate[data-state="saved"] span::before { background: var(--amber); }
.bh-savestate[data-state="refused"] span::before { background: #e04848; }
.bh.inv-open .bh-file { display: none; }
@media (max-width: 1000px) { .bh-file { bottom: 124px; } }
.bh-drag { position: fixed; width: 56px; height: 56px; pointer-events: none; opacity: 0.85; z-index: 6;
  transform: translate(-50%, -50%); }
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text != null) {
    e.textContent = text;
  }
  return e;
}

/*
 * `onSlot(i)` hears a hotbar slot clicked; `onAssign(pieceId, slot)` hears
 * a piece from the inventory put in a slot; `onSave()` hears Save clicked.
 * All are the builder's to act on: the hotbar is redrawn from what it hands
 * back in setHotbar, and the save's state from setSave.
 */
export function createHud({ onSlot, onAssign, onSave }) {
  if (!document.getElementById('bh-style')) {
    const style = el('style');
    style.id = 'bh-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = el('div', 'bh build-hud');
  const cross = el('div', 'bh-cross');
  const panel = el('div', 'bh-panel');
  const help = el('div', 'bh-help');
  const helpHint = el('div', 'bh-helphint');
  const bottom = el('div', 'bh-bottom');
  const name = el('div', 'bh-name');
  const status = el('div', 'bh-status');
  const bar = el('div', 'bh-bar');
  bottom.append(name, status, bar);
  const file = el('div', 'bh-file');
  const saveButton = el('button', 'bh-save');
  saveButton.type = 'button';
  const saveLabel = el('span');
  const saveKey = el('kbd');
  saveButton.append(saveLabel, saveKey);
  const saveState = el('div', 'bh-savestate');
  const saveName = el('b');
  const saveText = el('span');
  saveState.append(saveName, saveText);
  file.append(saveButton, saveState);
  /* No focus on the press: a focused button would take the builder's
   * Space (rise) as a click of its own. */
  saveButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  saveButton.addEventListener('click', (e) => {
    e.stopPropagation();
    onSave();
  });
  root.append(cross, panel, help, helpHint, bottom, file);
  (document.getElementById('ui') || document.body).append(root);

  const slots = [];
  let nameUntil = 0;
  let inv = null;
  let drag = null;
  const last = {
    panel: null, status: null, warn: null, save: null,
  };

  function setHotbar(items, slot) {
    while (slots.length < items.length) {
      const i = slots.length;
      const s = el('div', 'bh-slot');
      s.dataset.slot = String(i);
      s.append(el('b', '', String(i + 1)), el('img'));
      s.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        onSlot(i);
      });
      bar.append(s);
      slots.push(s);
    }
    items.forEach((it, i) => {
      const img = slots[i].querySelector('img');
      if (img.src !== it.icon) {
        img.src = it.icon;
      }
      slots[i].title = it.name;
      slots[i].classList.toggle('on', i === slot);
    });
  }

  function flashName(text) {
    name.textContent = text;
    name.classList.add('on');
    nameUntil = performance.now() + NAME_MS;
  }

  function setStatus(text, warn = false) {
    if (text !== last.status) {
      last.status = text;
      status.textContent = text;
    }
    if (warn !== last.warn) {
      last.warn = warn;
      status.classList.toggle('warn', warn);
    }
  }

  function setPanel(text) {
    if (text !== last.panel) {
      last.panel = text;
      panel.textContent = text;
    }
  }

  /* The button's words and the last save's state: `state` is a
   * course.js saveState key, `text` what it reads as, `name` the track's. */
  function setSave({
    label, key, tip, name: trackName, state, text,
  }) {
    const k = [label, key, tip, trackName, state, text].join('\n');
    if (k === last.save) {
      return;
    }
    last.save = k;
    saveLabel.textContent = label;
    saveKey.textContent = key;
    saveButton.title = tip;
    saveName.textContent = trackName;
    saveText.textContent = text;
    saveState.dataset.state = state;
  }

  /* rows: [keys, meaning] pairs, or null for the one line hint. */
  function setHelp(title, rows, foot, hint) {
    help.replaceChildren();
    help.style.display = rows ? '' : 'none';
    helpHint.style.display = rows ? 'none' : '';
    helpHint.textContent = hint;
    if (!rows) {
      return;
    }
    help.append(el('h3', '', title));
    for (const [keys, meaning] of rows) {
      const row = el('div', 'bh-row');
      row.append(el('kbd', '', keys), el('span', '', meaning));
      help.append(row);
    }
    help.append(el('div', 'bh-foot', foot));
  }

  function setCrosshair(on) {
    cross.style.display = on ? '' : 'none';
  }

  function tick() {
    if (nameUntil && performance.now() > nameUntil) {
      nameUntil = 0;
      name.classList.remove('on');
    }
  }

  /* The slot under a point on the screen, or -1. */
  function slotAt(x, y) {
    return slots.findIndex((s) => {
      const r = s.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  function endDrag(e) {
    if (!drag) {
      return;
    }
    const d = drag;
    drag = null;
    d.img?.remove();
    slots.forEach((s) => s.classList.remove('drop'));
    window.removeEventListener('mousemove', moveDrag, true);
    window.removeEventListener('mouseup', endDrag, true);
    if (!d.moved) {
      onAssign(d.id, -1);
      return;
    }
    const i = slotAt(e.clientX, e.clientY);
    if (i >= 0) {
      onAssign(d.id, i);
    }
  }

  function moveDrag(e) {
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_PX) {
      drag.moved = true;
      drag.img = el('img', 'bh-drag');
      drag.img.src = drag.icon;
      root.append(drag.img);
    }
    if (drag.moved) {
      drag.img.style.left = `${e.clientX}px`;
      drag.img.style.top = `${e.clientY}px`;
      const i = slotAt(e.clientX, e.clientY);
      slots.forEach((s, k) => s.classList.toggle('drop', k === i));
    }
  }

  /* shelves: [{ title, pieces: [{ id, name, icon }] }]. */
  function openInventory(title, hint, shelves) {
    closeInventory();
    inv = el('div', 'bh-inv');
    const all = el('div', 'bh-shelves');
    inv.append(el('h2', '', title), el('div', 'bh-invhint', hint), all);
    for (const shelf of shelves) {
      const block = el('div');
      block.append(el('h4', '', shelf.title));
      const row = el('div', 'bh-shelf');
      for (const p of shelf.pieces) {
        const tile = el('div', 'bh-tile');
        tile.dataset.piece = p.id;
        const img = el('img');
        img.src = p.icon;
        tile.append(img, el('span', '', p.name));
        tile.addEventListener('mousedown', (e) => {
          if (e.button !== 0) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          drag = { id: p.id, icon: p.icon, x: e.clientX, y: e.clientY, moved: false, img: null };
          window.addEventListener('mousemove', moveDrag, true);
          window.addEventListener('mouseup', endDrag, true);
        });
        row.append(tile);
      }
      block.append(row);
      all.append(block);
    }
    root.append(inv);
    root.classList.add('inv-open');
  }

  function closeInventory() {
    if (inv) {
      inv.remove();
      inv = null;
    }
    root.classList.remove('inv-open');
  }

  function show(on) {
    root.style.display = on ? '' : 'none';
    if (!on) {
      closeInventory();
    }
  }

  function destroy() {
    closeInventory();
    root.remove();
  }

  return {
    setHotbar,
    flashName,
    setStatus,
    setPanel,
    setSave,
    setHelp,
    setCrosshair,
    openInventory,
    closeInventory,
    tick,
    show,
    destroy,
    get inventoryOpen() {
      return Boolean(inv);
    },
    /* Where things are on screen, for scripts/build-check.js. */
    rects() {
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      };
      return {
        slots: slots.map(box),
        tiles: inv ? [...inv.querySelectorAll('.bh-tile')].map((t) => ({ id: t.dataset.piece, ...box(t) })) : [],
        help: help.style.display === 'none' ? null : box(help),
        save: { ...box(saveButton), state: saveState.dataset.state || '', text: saveText.textContent, name: saveName.textContent },
      };
    },
  };
}
