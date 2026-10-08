/*
 * hangar-gallery.js: the paint shop's Gallery page (docs/LIVERY-GALLERY.md).
 * The liveries other pilots published for this plane, newest or most
 * liked first: hover one to try it on, press it to wear it (it is added to
 * My liveries, the same road as pasting its code), like it, report it, or
 * remove one's own. The pilot publishes the livery they are wearing under
 * the name it was saved by.
 *
 * Every answer from the tracks server comes back while the pilot may have
 * moved on, so each one checks the page is still this plane's Gallery
 * before it draws.
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

import { encodeLivery } from '../../configs/paint.js';
import { normaliseEntry } from '../../configs/liveries.js';
import {
  accountsAvailable, galleryLike, galleryLiked, galleryList, galleryPublish, galleryRemove, galleryReport,
} from '../share/account.js';
import { readAccount } from '../share/pilot.js';
import { plural, str } from '../strings/index.js';
import { el } from './dom.js';

const SORTS = ['new', 'liked'];

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/* A refusal's sentence: ours when the server said why, a plain one when
 * the server could not be reached. */
function sorry(e) {
  const why = e && e.body && e.body.why;
  if (why === 'code') {
    return str(`hangar.code_${e.body.code}`);
  }
  if (why) {
    return str(`gallery.why_${why}`);
  }
  return str(e && e.status === 429 ? 'gallery.why_busy' : 'gallery.offline');
}

export class Gallery {
  constructor(shop) {
    this.shop = shop;
    this.family = null;
    this.sort = 'new';
    this.items = [];
    this.next = null;
    this.liked = new Set();
    this.loading = false;
    this.note = '';
    this.asked = 0;
  }

  get h() {
    return this.shop.h;
  }

  /* Opened on this plane: the first page asked again each time, so a
   * pilot coming back sees what was published meanwhile. */
  open() {
    this.family = this.h.family;
    this.items = [];
    this.next = null;
    this.note = '';
    this.load(0);
    if (readAccount()) {
      galleryLiked().then((ids) => {
        this.liked = new Set(ids);
        this.redraw();
      }, () => {});
    }
  }

  load(page) {
    const ask = (this.asked += 1);
    const family = this.family;
    this.loading = true;
    galleryList(family, this.sort, page).then((got) => {
      if (ask !== this.asked || family !== this.family) {
        return;
      }
      this.items = page ? [...this.items, ...got.items] : got.items;
      this.next = got.next;
      this.loading = false;
      this.redraw();
    }, (e) => {
      if (ask !== this.asked) {
        return;
      }
      this.loading = false;
      this.note = sorry(e);
      this.redraw();
    });
  }

  redraw(focusKey = null) {
    if (!this.h.isOpen || this.shop.page !== 'gallery' || this.h.family !== this.family) {
      return;
    }
    if (focusKey) {
      this.h.changed(focusKey);
    } else {
      this.h.paint(0);
    }
  }

  setSort(s) {
    if (s === this.sort) {
      return;
    }
    this.sort = s;
    this.items = [];
    this.next = null;
    this.load(0);
    this.h.changed(`sort-${s}`, 'adjust');
  }

  /* On the plane and into My liveries, by the paste's own road: a full
   * list is refused there with its sentence, shown here. */
  wear(item) {
    this.shop.importCode(item.code);
    const form = this.shop.form;
    if (form && form.error) {
      this.shop.form = null;
      this.note = str(`hangar.code_${form.error}`);
    } else {
      this.note = str('gallery.worn', { name: item.name });
    }
    this.redraw(`gwear-${item.id}`);
  }

  publish() {
    const name = this.shop.lastName;
    const entry = normaliseEntry(this.family, this.h.entry) ?? {};
    galleryPublish(encodeLivery(this.family, name, entry)).then((entry) => {
      this.note = str('gallery.published', { name: entry.name });
      this.sort = 'new';
      this.load(0);
    }, (e) => {
      this.note = sorry(e);
      this.redraw();
    });
  }

  like(item) {
    const on = !this.liked.has(item.id);
    galleryLike(item.id, on).then((got) => {
      item.likes = got.likes;
      if (got.liked) {
        this.liked.add(item.id);
      } else {
        this.liked.delete(item.id);
      }
      this.redraw(`glike-${item.id}`);
    }, (e) => {
      this.note = sorry(e);
      this.redraw();
    });
  }

  report(item) {
    galleryReport(item.id).then(() => {
      item.reported = true;
      this.note = str('gallery.reported');
      this.redraw(`gwear-${item.id}`);
    }, (e) => {
      this.note = sorry(e);
      this.redraw();
    });
  }

  remove(item) {
    galleryRemove(item.id).then(() => {
      this.items = this.items.filter((x) => x !== item);
      this.note = str('gallery.removed', { name: item.name });
      this.redraw('gallery-publish');
    }, (e) => {
      this.note = sorry(e);
      this.redraw();
    });
  }

  page() {
    const box = el('div', 'hangar-tab paint-body');
    if (!accountsAvailable()) {
      box.append(el('p', 'hangar-source', str('gallery.offline')));
      return box;
    }
    const me = readAccount();
    box.append(el('h3', 'hangar-h', str('gallery.publish_h')));
    if (!me) {
      box.append(el('p', 'hangar-source', str('gallery.sign_in')));
    } else if (!this.shop.lastName) {
      box.append(el('p', 'hangar-source', str('gallery.save_first')));
    } else {
      const pub = button('paint-wide', str('gallery.publish', { name: this.shop.lastName }));
      pub.dataset.key = 'gallery-publish';
      pub.addEventListener('click', () => this.publish());
      box.append(pub);
    }
    if (this.note) {
      box.append(el('p', 'hangar-source gallery-note', this.note));
    }

    const sorts = el('div', 'paint-row');
    for (const s of SORTS) {
      const b = button(`paint-chip${s === this.sort ? ' on' : ''}`, str(`gallery.sort_${s}`));
      b.dataset.key = `sort-${s}`;
      b.addEventListener('click', () => this.setSort(s));
      sorts.append(b);
    }
    box.append(sorts);

    const list = el('div', 'paint-saved gallery-list');
    if (!this.items.length) {
      list.append(el('p', 'hangar-source', str(this.loading ? 'gallery.loading' : 'gallery.none')));
    }
    for (const item of this.items) {
      list.append(this.row(item, me));
    }
    box.append(list);
    if (this.next !== null) {
      const more = button('paint-wide', str('gallery.more'));
      more.dataset.key = 'gallery-more';
      more.addEventListener('click', () => this.load(this.next));
      box.append(more);
    }
    return box;
  }

  row(item, me) {
    const row = el('div', 'paint-saved-row');
    row.dataset.gallery = item.id;
    const wear = button('paint-saved-name paint-wear', item.name || str('hangar.code_imported'));
    wear.dataset.key = `gwear-${item.id}`;
    wear.title = str('gallery.wear');
    const entry = this.shop.tryEntry(item.code);
    if (entry) {
      this.h.trial(wear, { entry }, 'overview');
    }
    wear.addEventListener('click', () => this.wear(item));
    row.append(wear, el('span', 'hangar-source', plural('gallery.by', item.likes, { callsign: item.callsign })));
    const mine = Boolean(me) && me.callsign === item.callsign;
    if (mine) {
      const del = button('paint-chip paint-danger', str('gallery.remove'));
      del.dataset.key = `gremove-${item.id}`;
      del.addEventListener('click', () => this.remove(item));
      row.append(del);
      return row;
    }
    if (!me) {
      return row;
    }
    const liked = this.liked.has(item.id);
    const like = button(`paint-chip${liked ? ' on' : ''}`, str(liked ? 'gallery.liked' : 'gallery.like'));
    like.dataset.key = `glike-${item.id}`;
    like.setAttribute('aria-pressed', String(liked));
    like.addEventListener('click', () => this.like(item));
    row.append(like);
    if (!item.reported) {
      const rep = button('paint-chip', str('gallery.report'));
      rep.dataset.key = `greport-${item.id}`;
      rep.addEventListener('click', () => this.report(item));
      row.append(rep);
    }
    return row;
  }
}
