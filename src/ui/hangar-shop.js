/*
 * hangar-shop.js: the Shop tab in the hangar (docs/ECONOMY.md). The items
 * of src/game/economy.js, the tokens the account holds, and each item
 * tried on the aircraft on show before it is bought: pointing at an item
 * (or the cursor on it) puts it on the plane, choosing it keeps it there
 * (the hangar's `pin`), and Buy asks the server, which is the only one
 * that can say it is owned (tracks-api/wallet.js).
 *
 * A finish is tried on every region that takes one; a quad's paint is the
 * combat drones' own (src/render/combatpaint.js) and wears none of these,
 * so on a quad the shop says so instead. A decal is shown as its picture:
 * where it goes on a plane is the pilot's to choose in Colours, Decals.
 *
 * Wear it (an owned finish) paints every region in it, as the Colours tab
 * would, and the hangar's own Save keeps it.
 *
 *  * This file is part of the Paraguayan Drone Combat Simulator.
 *  *
 *  * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation, either version 3 of the License, or (at
 *  * your option) any later version.
 *  *
 *  * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 *  * WITHOUT ANY WARRANTY, without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  * General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License
 *  * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { ITEMS, itemById } from '../game/economy.js';
import { newDecal } from '../../configs/paint.js';
import { buyItem, fetchWallet, readWallet, signedIn } from '../share/account.js';
import { currentLocale, str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { thumb } from './hangar-paint.js';
import { el } from './dom.js';

/* The tab's state while the hangar is open on one aircraft. */
let st = null;

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function tokens(n) {
  return str('shop.tokens', { n: n.toLocaleString(currentLocale()) });
}

function itemName(it) {
  return str(`hangar.${it.kind}_${it.paint}`);
}

/* Where an item stands for this account: owned, earn (not yet), or buy. */
function standing(it) {
  if (st.wallet && st.wallet.owned[it.id]) {
    return 'owned';
  }
  return it.earn ? 'earn' : 'buy';
}

/* The plane's paint entry with a finish on every region that takes one. */
function withFinishAll(h, entry, finish) {
  let e = entry;
  for (const r of h.regions) {
    if (r.finish !== false) {
      e = h.shop.withFinish(e, r.id, finish);
    }
  }
  return e;
}

function tryable(h, it) {
  return it.kind === 'finish' && !h.quad();
}

/* Ask the server for the wallet, and draw again when it answers. */
function refresh(h) {
  if (!signedIn()) {
    st.status = 'signedout';
    return;
  }
  st.status = st.wallet ? 'ready' : 'loading';
  const seq = st.seq;
  fetchWallet().then((w) => {
    if (st && st.seq === seq) {
      st.wallet = w;
      st.status = 'ready';
      repaint(h);
    }
  }).catch((e) => {
    if (st && st.seq === seq) {
      st.status = st.wallet ? 'ready' : 'error';
      st.msg = str('shop.unreachable', { why: e.message });
      repaint(h);
    }
  });
}

function repaint(h) {
  if (h.isOpen && h.tab === 'shop') {
    h.paint(0);
    h.preview();
  }
}

function select(h, it) {
  st.sel = it.id;
  st.msg = '';
  h.pin = tryable(h, it) ? { entry: withFinishAll(h, h.entry, it.paint) } : null;
  h.changed(`shop-${it.id}`, 'move');
}

async function buy(h, it) {
  const s = st;
  s.busy = true;
  s.msg = '';
  repaint(h);
  let wallet = null;
  let msg;
  try {
    wallet = await buyItem(it.id);
    msg = str('shop.bought', { item: itemName(it) });
  } catch (e) {
    const why = e.body && e.body.why;
    msg = why ? str(`shop.refused_${why}`) : str('shop.unreachable', { why: e.message });
  }
  /* The hangar closed or moved to another plane while the server answered. */
  if (st !== s) {
    return;
  }
  s.busy = false;
  s.msg = msg;
  if (wallet) {
    s.wallet = wallet;
    h.sound('select');
  } else {
    refresh(h);
  }
  repaint(h);
  h.focusKey(`shop-${it.id}`);
}

function wear(h, it) {
  h.pin = null;
  h.entry = withFinishAll(h, h.entry, it.paint);
  st.msg = str('shop.worn', { item: itemName(it) });
  h.changed('shop-wear');
}

function itemCard(h, it) {
  const now = standing(it);
  const on = st.sel === it.id;
  const b = button(`shop-item ${now}${on ? ' on' : ''}`);
  b.dataset.key = `shop-${it.id}`;
  b.setAttribute('aria-pressed', String(on));
  if (it.kind === 'decal') {
    b.append(thumb(newDecal(it.paint, [0, 0, 0], [0, 1, 0]), 64, 28));
  } else {
    b.append(el('span', `shop-swatch paint-finish-${it.paint}`));
  }
  b.append(el('span', 'shop-item-name', itemName(it)));
  const tag = { owned: str('shop.owned'), earn: str('shop.earned_only'), buy: it.price ? tokens(it.price) : '' }[now];
  b.append(el('span', 'shop-item-tag', tag));
  if (tryable(h, it)) {
    h.trial(b, { entry: withFinishAll(h, h.entry, it.paint) }, `shop-${it.id}`);
  }
  b.addEventListener('click', () => select(h, it));
  return b;
}

function detail(h, it) {
  const box = el('div', 'shop-detail');
  box.append(el('h3', 'hangar-h', itemName(it)));
  if (it.kind === 'finish' && h.quad()) {
    box.append(el('p', 'hangar-source', str('shop.no_preview_quad')));
  } else if (it.kind === 'decal') {
    box.append(el('p', 'hangar-source', str('shop.decal_where')));
  }
  const now = standing(it);
  if (now === 'earn') {
    box.append(el('p', 'hangar-note', str(`shop.earn_${it.earn}`)));
  } else if (now === 'owned') {
    if (tryable(h, it)) {
      const w = button('paint-chip paint-wide shop-wear', str('shop.wear'));
      w.dataset.key = 'shop-wear';
      w.addEventListener('click', () => wear(h, it));
      box.append(w);
    } else {
      box.append(el('p', 'hangar-note', str(it.kind === 'decal' ? 'shop.owned_decal' : 'shop.owned')));
    }
  } else {
    const short = !st.wallet || st.wallet.balance < it.price;
    const b = button('paint-chip paint-wide shop-buy', str('shop.buy', { price: tokens(it.price) }));
    b.dataset.key = 'shop-buy';
    b.disabled = short || st.busy || st.status !== 'ready';
    b.addEventListener('click', () => buy(h, it));
    box.append(b);
    if (short && st.wallet) {
      box.append(el('p', 'hangar-source', str('shop.short', { n: (it.price - st.wallet.balance).toLocaleString(currentLocale()) })));
    }
  }
  return box;
}

function paintTab(h) {
  const box = el('div', 'hangar-tab shop-tab');
  box.append(el('h3', 'hangar-h', str('shop.title')));
  const bal = el('p', 'shop-balance');
  bal.dataset.key = 'shop-balance';
  bal.textContent = {
    ready: st.wallet ? tokens(st.wallet.balance) : '',
    loading: str('shop.loading'),
    signedout: str('shop.signed_out'),
    error: str('shop.error'),
  }[st.status];
  box.append(bal, el('p', 'hangar-source', str('shop.how')));
  const list = el('div', 'shop-items');
  for (const it of ITEMS) {
    list.append(itemCard(h, it));
  }
  box.append(list);
  const it = st.sel ? itemById(st.sel) : null;
  if (it) {
    box.append(detail(h, it));
  }
  const msg = el('p', 'shop-msg', st.msg || '');
  msg.dataset.key = 'shop-msg';
  msg.setAttribute('aria-live', 'polite');
  box.append(msg);
  return box;
}

registerHangarTab({
  id: 'shop',
  focus: 'overview',
  open(h) {
    st = { seq: (st ? st.seq : 0) + 1, wallet: readWallet(), status: 'loading', sel: null, msg: '', busy: false };
    refresh(h);
  },
  close() {
    st = null;
  },
  paint(h) {
    return st ? paintTab(h) : el('div', 'hangar-tab');
  },
});
