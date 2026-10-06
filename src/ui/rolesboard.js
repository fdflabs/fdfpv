/*
 * rolesboard.js: the role board of an ops mission (docs/campaign/interior/
 * TECH-NEEDS.md N16, MISSIONS.md 1.5; the room's half is
 * src/share/ops/roles.js). Roles are dealt at random by the room; this is
 * where a pilot sees theirs and changes them:
 *
 *   - your roles, each with its guide's name, the one you fly marked, and
 *     a button to fly another of yours
 *   - the free roles: an unheld core role, or a new copy of a scaling
 *     role, each with TAKE
 *   - the other pilots and their roles, each with ASK TO SWAP (your role
 *     flown now for theirs)
 *   - swap requests: yours waiting, theirs with ACCEPT and DECLINE
 *   - the host's lock, and why changes are refused now (a briefing, a
 *     locked stage, the host)
 *
 * It decides nothing: every button sends the room a message
 * (CONTRACT-P0.md 3) and the board redraws from the room's next view.
 * Campaign agnostic: roles and guides are the mission's ids, their words
 * string keys (`ops.role.<id>`, `ops.guide.<id>`).
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

import { str } from '../strings/index.js';
import { skey } from './opshud.js';

const CSS = `
.roles { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: none;
  font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace; z-index: 40; }
.roles.open { display: flex; }
.roles-box { pointer-events: auto; background: rgba(6, 10, 12, 0.88); border: 1px solid rgba(236, 244, 240, 0.35);
  color: rgba(236, 244, 240, 0.92); padding: 1em 1.2em; width: min(36em, calc(100vw - 32px)); max-height: calc(100vh - 32px);
  overflow-y: auto; box-sizing: border-box; font-size: clamp(11px, 1.7vh, 15px); letter-spacing: 0.06em; }
.roles-box h2 { font-size: 1.05em; letter-spacing: 0.24em; margin: 0 0 0.6em; font-weight: normal; }
.roles-h { color: rgba(236, 244, 240, 0.5); letter-spacing: 0.18em; font-size: 0.82em; margin: 0.9em 0 0.3em; }
.roles-row { display: flex; align-items: center; justify-content: space-between; gap: 0.8em; padding: 0.3em 0;
  border-top: 1px solid rgba(236, 244, 240, 0.08); }
.roles-row .roles-sub { color: rgba(236, 244, 240, 0.55); font-size: 0.85em; }
.roles-row.active .roles-name::before { content: '\\203a  '; }
.roles-btn { font: inherit; letter-spacing: 0.12em; font-size: 0.85em; color: rgba(236, 244, 240, 0.95);
  background: transparent; border: 1px solid rgba(236, 244, 240, 0.45); padding: 0.45em 0.8em; min-height: 44px;
  min-width: 44px; cursor: pointer; }
.roles-btn:hover, .roles-btn:focus-visible { border-color: #fff; outline: none; }
.roles-btn:disabled { opacity: 0.35; cursor: default; }
.roles-why { color: #ffc04a; margin: 0.4em 0; font-size: 0.9em; }
.roles-foot { display: flex; justify-content: space-between; gap: 0.8em; margin-top: 1em; }
.roles-open { position: absolute; right: max(16px, env(safe-area-inset-right)); top: calc(24% + 14em); display: none;
  pointer-events: auto; font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace; font-size: clamp(10px, 1.4vh, 13px);
  letter-spacing: 0.16em; color: rgba(236, 244, 240, 0.9); background: rgba(6, 10, 12, 0.45);
  border: 1px solid rgba(236, 244, 240, 0.4); min-height: 44px; min-width: 44px; padding: 0.4em 0.9em; cursor: pointer; z-index: 39; }
.roles-open.on { display: block; }
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text != null) {
    e.textContent = text;
  }
  if (parent) {
    parent.append(e);
  }
  return e;
}

const roleOf = (key) => String(key).split(':')[0];
const copyOf = (key) => {
  const n = String(key).split(':')[1];
  return n ? Number(n) : null;
};

function word(key, vars) {
  try {
    return str(key, vars);
  } catch {
    return key;
  }
}

/* A role key's name: the role's word, and its copy's number for a
 * scaling role. */
export function roleName(key) {
  const n = copyOf(key);
  const name = word(`ops.role.${skey(roleOf(key))}`);
  return n == null ? name : str('ops.roles.copy', { name, n });
}

/*
 * What the board offers, from the room's roles view (CONTRACT-P0.md 5)
 * and this seat: pure, so a check reads it without a page.
 */
export function boardOf(roles, seat) {
  const held = roles.held || {};
  const mine = held[seat] || [];
  const heldKeys = new Set(Object.values(held).flat());
  const defs = roles.defs || [];
  const free = defs.filter((d) => !d.core || !heldKeys.has(d.id)).filter((d) => !(d.core && mine.includes(d.id)));
  const others = Object.entries(held).map(([s, keys]) => ({ seat: Number(s), keys })).filter((o) => o.seat !== seat);
  const swaps = (roles.swaps || []).filter((x) => x.from === seat || x.to === seat);
  return {
    mine: mine.map((key) => ({ key, guide: (defs.find((d) => d.id === roleOf(key)) || {}).guide ?? null, active: roles.active && roles.active[seat] === key })),
    free: free.map((d) => ({ id: d.id, core: Boolean(d.core), guide: d.guide ?? null })),
    others,
    incoming: swaps.filter((x) => x.to === seat),
    outgoing: swaps.filter((x) => x.from === seat),
    locked: Boolean(roles.locked) || Boolean(roles.beat),
    why: roles.beat || (roles.locked ? 'host' : null),
  };
}

export class RolesBoard {
  /* act: { take(id), active(key), swap(seat, give, take), accept(id),
   * decline(id), lock(on) }; nameOf(seat) the pilot's shown name. */
  constructor(root, act, nameOf) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.act = act;
    this.nameOf = nameOf;
    this.el = el('div', 'roles', root);
    /* The board's button, for a mouse or a thumb; the key is `. */
    this.opener = el('button', 'roles-open', root, str('ops.roles.button'));
    this.opener.type = 'button';
    this.opener.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.box = el('div', 'roles-box', this.el);
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-label', str('ops.roles.title'));
    this.isOpen = false;
    this.key = null;
    this.state = null;
    window.__rolesBoard = () => ({
      open: this.isOpen,
      buttons: [...this.box.querySelectorAll('button')].map((b) => ({ text: b.textContent, act: b.dataset.act, disabled: b.disabled })),
      text: this.box.textContent,
    });
  }

  open() {
    this.isOpen = true;
    this.el.classList.add('open');
    this.key = null;
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
    return this.isOpen;
  }

  /* Each frame while a match has roles: redraws only on a change. */
  update(view, seat, hostSeat, flying = true) {
    this.opener.classList.toggle('on', Boolean(view && view.roles) && flying && !this.isOpen);
    if (!view || !view.roles) {
      if (this.isOpen) {
        this.close();
      }
      return;
    }
    if (!this.isOpen) {
      return;
    }
    const key = JSON.stringify([view.roles, seat, hostSeat]);
    if (key === this.key) {
      return;
    }
    this.key = key;
    this.draw(boardOf(view.roles, seat), view.roles, seat, hostSeat);
  }

  button(parent, text, actName, fn, disabled = false) {
    const b = el('button', 'roles-btn', parent, text);
    b.type = 'button';
    b.dataset.act = actName;
    b.disabled = disabled;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  draw(b, roles, seat, hostSeat) {
    const box = this.box;
    box.textContent = '';
    el('h2', '', box, str('ops.roles.title'));
    if (b.why) {
      el('div', 'roles-why', box, str(`ops.roles.locked_${b.why}`));
    }
    el('div', 'roles-h', box, str('ops.roles.yours'));
    for (const m of b.mine) {
      const row = el('div', `roles-row${m.active ? ' active' : ''}`, box);
      const left = el('div', '', row);
      el('div', 'roles-name', left, roleName(m.key));
      if (m.guide) {
        el('div', 'roles-sub', left, str('ops.roles.guide', { name: word(`ops.guide.${skey(m.guide)}`) }));
      }
      if (m.active) {
        el('span', 'roles-sub', row, str('ops.roles.flying'));
      } else {
        this.button(row, str('ops.roles.fly'), `active:${m.key}`, () => this.act.active(m.key));
      }
    }
    if (!b.mine.length) {
      el('div', 'roles-sub', box, str('ops.roles.none'));
    }
    el('div', 'roles-h', box, str('ops.roles.free'));
    for (const f of b.free) {
      const row = el('div', 'roles-row', box);
      const left = el('div', '', row);
      el('div', 'roles-name', left, word(`ops.role.${skey(f.id)}`));
      el('div', 'roles-sub', left, [f.core ? str('ops.roles.core') : str('ops.roles.scaling'), f.guide ? str('ops.roles.guide', { name: word(`ops.guide.${skey(f.guide)}`) }) : ''].filter(Boolean).join(' · '));
      this.button(row, str('ops.roles.take'), `take:${f.id}`, () => this.act.take(f.id), b.locked);
    }
    const give = roles.active ? roles.active[seat] ?? null : null;
    if (b.others.length) {
      el('div', 'roles-h', box, str('ops.roles.squad'));
    }
    for (const o of b.others) {
      for (const k of o.keys) {
        const row = el('div', 'roles-row', box);
        const left = el('div', '', row);
        el('div', 'roles-name', left, roleName(k));
        el('div', 'roles-sub', left, this.nameOf(o.seat));
        const asked = b.outgoing.some((x) => x.to === o.seat && x.take === k);
        this.button(row, str(asked ? 'ops.roles.asked' : 'ops.roles.ask'), `swap:${o.seat}:${k}`, () => this.act.swap(o.seat, give, k), b.locked || asked);
      }
    }
    if (b.incoming.length) {
      el('div', 'roles-h', box, str('ops.roles.requests'));
    }
    for (const x of b.incoming) {
      const row = el('div', 'roles-row', box);
      el('div', '', row, str('ops.roles.request', {
        name: this.nameOf(x.from), give: x.give ? roleName(x.give) : str('ops.roles.nothing'), take: x.take ? roleName(x.take) : str('ops.roles.nothing'),
      }));
      const btns = el('div', '', row);
      this.button(btns, str('ops.roles.accept'), `accept:${x.id}`, () => this.act.accept(x.id), b.locked);
      this.button(btns, str('ops.roles.decline'), `decline:${x.id}`, () => this.act.decline(x.id));
    }
    const foot = el('div', 'roles-foot', box);
    if (hostSeat === seat) {
      this.button(foot, str(roles.locked ? 'ops.roles.unlock' : 'ops.roles.lock'), 'lock', () => this.act.lock(!roles.locked));
    } else {
      el('span', 'roles-sub', foot, roles.locked ? str('ops.roles.host_locked') : '');
    }
    this.button(foot, str('ops.roles.close'), 'close', () => this.close());
  }
}
