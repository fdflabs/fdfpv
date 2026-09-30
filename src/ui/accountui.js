/*
 * accountui.js: the optional Google sign-in's dialogs, and the sync
 * between this computer's settings and the account.
 *
 * The rows live in the Pilot screen (ui.js), and their actions come here
 * through main.js: sign in, pick the callsign, sign out, delete the
 * account, and the privacy and terms pages. The network and the rules are
 * src/share/account.js; this file is what the pilot sees of them.
 *
 * THE BUTTON IS GOOGLE'S. Google Identity Services draws its own "Sign in
 * with Google" button (its branding rules ask for it) into the same
 * overlay every typed field here uses (ui.nameDialog), and loads only when
 * a pilot opens that dialog, so a guest's page never fetches anything
 * from Google.
 *
 * SYNC. After signing in, at boot while signed in, when the tab comes back
 * into view, and once a minute while something synced has changed. What
 * comes back is merged by the server and applied through ui.js
 * loadSettings, so whatever another computer sent is held to the same
 * rules as anything read out of local storage.
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

import { currentLocale, str } from '../strings/index.js';
import { nameRules, normaliseName, readAccount, readPilotName } from '../share/pilot.js';
import {
  GOOGLE_CLIENT_ID, accountsAvailable, chooseCallsign, deleteAccount, progressChanged, settled, signIn, signOut,
  signedIn, startAccounts, syncProgress,
} from '../share/account.js';
import { SETTINGS_KEY, loadSettings } from './ui.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SYNC_EVERY_MS = 60 * 1000;
const SYNC_GAP_MS = 30 * 1000;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function btn(cls, text) {
  const n = el('button', cls, text);
  n.type = 'button';
  return n;
}

let gisLoad = null;
function loadGis() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (!gisLoad) {
    gisLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('no GIS')));
      s.onerror = () => {
        gisLoad = null;
        reject(new Error('GIS did not load'));
      };
      document.head.append(s);
    });
  }
  return gisLoad;
}

/*
 * A dialog in ui's own overlay, closed the way every other one is
 * (ui.closeNameDialog), so Escape, the backdrop and a second dialog all
 * behave as they do for a typed field. build(box, finish) fills it.
 */
function dialog(ui, { title, detail }, build) {
  if (ui.nameWait) {
    ui.closeNameDialog(null);
  }
  return new Promise((resolve) => {
    ui.nameWait = resolve;
    const box = el('div', 'name-dialog-box account');
    box.append(el('h2', null, title));
    if (detail) {
      box.append(el('p', 'lede', detail));
    }
    const finish = (value) => ui.closeNameDialog(value);
    build(box, finish);
    ui.nameDialog.textContent = '';
    ui.nameDialog.append(box);
    ui.nameDialog.hidden = false;
    ui.nameKeyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      }
    };
    ui.nameDialog.addEventListener('keydown', ui.nameKeyHandler, true);
    ui.nameClickHandler = (e) => {
      if (e.target === ui.nameDialog) {
        finish(null);
      }
    };
    ui.nameDialog.addEventListener('click', ui.nameClickHandler);
  });
}

function pageLink(file, label) {
  const a = el('a', null, label);
  a.href = file;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/* Resolves to Google's ID token, or null if the pilot closed the dialog. */
function askGoogle(ui) {
  return dialog(ui, { title: str('account.dialog_title'), detail: str('account.dialog_detail') }, (box, finish) => {
    const slot = el('div', 'account-gis');
    const status = el('p', 'name-dialog-err', str('account.dialog_loading'));
    const links = el('p', 'lede');
    links.append(pageLink('privacy.html', str('account.privacy')), ' · ', pageLink('terms.html', str('account.terms')));
    const row = el('div', 'name-dialog-row');
    const cancel = btn('name-dialog-btn', str('ui.cancel'));
    cancel.addEventListener('click', () => finish(null));
    row.append(cancel);
    box.append(slot, status, links, row);
    loadGis().then((gis) => {
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => finish(res && res.credential ? res.credential : null),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gis.renderButton(slot, {
        type: 'standard', theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: currentLocale(),
      });
      status.textContent = '';
    }).catch(() => {
      status.textContent = str('account.dialog_failed');
    });
  });
}

/* Two buttons; resolves true for the first. Closing it is the second. */
function askChoice(ui, { title, detail, yes, no }) {
  return dialog(ui, { title, detail }, (box, finish) => {
    const row = el('div', 'name-dialog-row');
    const a = btn('name-dialog-btn on', yes);
    const b = btn('name-dialog-btn', no);
    a.addEventListener('click', () => finish(true));
    b.addEventListener('click', () => finish(false));
    row.append(a, b);
    box.append(row);
    setTimeout(() => a.focus(), 0);
  }).then((v) => v === true);
}

/* What a refusal from either server says to the pilot, in their language. */
function whyText(e) {
  if (!e || e.name === 'TimeoutError' || e.name === 'TypeError' || !e.status) {
    return str('account.unreachable');
  }
  if (e.status === 409 || (e.board && e.status === 403)) {
    return str(e.board ? 'account.callsign_taken_board' : 'account.callsign_taken');
  }
  if (e.status === 422) {
    return str('account.callsign_not_allowed');
  }
  if (e.status === 429) {
    return str('account.too_many');
  }
  if (e.status === 413) {
    return str('account.too_big');
  }
  return str('account.server_said', { status: e.status });
}

export function createAccountUi({ ui, identity, say }) {
  startAccounts(identity);
  let lastSync = 0;
  let syncing = null;

  /* The merge applied: every synced section put in ui.settings, the whole
   * blob read back through loadSettings, and only the synced sections
   * taken from that, so a plane or a scheme this build does not have is
   * dropped here as it would be at boot. */
  function apply(merged) {
    const s = ui.settings;
    let changed = false;
    for (const [k, v] of Object.entries(merged.data)) {
      if (JSON.stringify(s[k]) !== JSON.stringify(v)) {
        s[k] = v;
        changed = true;
      }
    }
    if (changed) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        const fresh = loadSettings();
        for (const k of Object.keys(merged.data)) {
          s[k] = fresh[k];
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch (e) {
        /* Private mode: the merge lives in this page. */
      }
      ui.renderMenu();
    }
    settled(s, merged);
    return changed;
  }

  function sync({ loud = false } = {}) {
    if (!signedIn() || syncing) {
      return syncing || Promise.resolve(false);
    }
    lastSync = Date.now();
    syncing = syncProgress(ui.settings).then((merged) => {
      const changed = merged ? apply(merged) : false;
      if (loud || changed) {
        say(str('account.synced'));
      }
      return changed;
    }).catch((e) => {
      if (signedIn() || loud) {
        say(str('account.sync_failed', { why: whyText(e) }));
      }
      return false;
    }).finally(() => {
      syncing = null;
    });
    return syncing;
  }

  async function pickCallsign() {
    let detail = str('account.pick_detail');
    let value = readAccount()?.callsign || readPilotName() || '';
    for (;;) {
      /* eslint-disable-next-line no-await-in-loop */
      const got = await ui.askForm({
        title: str('account.pick_title'),
        detail,
        confirmLabel: str('ui.save'),
        fields: [{
          key: 'callsign', label: '', value, maxLength: 24, placeholder: str('account.callsign'), autocomplete: 'nickname', rules: nameRules(), save: normaliseName,
        }],
      });
      if (!got) {
        return null;
      }
      value = got.callsign;
      try {
        /* eslint-disable-next-line no-await-in-loop */
        const callsign = await chooseCallsign(value);
        ui.renderMenu();
        return callsign;
      } catch (e) {
        detail = whyText(e);
      }
    }
  }

  async function doSignIn() {
    const credential = await askGoogle(ui);
    if (!credential) {
      return;
    }
    let record;
    try {
      record = await signIn(credential, (kind) => askChoice(ui, {
        title: str(`account.${kind}_title`),
        detail: str(`account.${kind}_detail`),
        yes: str('account.bring_it'),
        no: str('account.not_mine'),
      }));
    } catch (e) {
      say(str('account.error', { why: whyText(e) }));
      ui.renderMenu();
      return;
    }
    const callsign = record.callsign || await pickCallsign();
    ui.renderMenu();
    say(callsign ? str('account.signed_in_as', { callsign }) : str('account.signed_in'));
    sync();
  }

  async function doDelete() {
    const word = str('account.delete_word');
    const got = await ui.askForm({
      title: str('account.delete_title'),
      detail: str('account.delete_detail', { word }),
      confirmLabel: str('account.delete_confirm'),
      fields: [{ key: 'word', label: '', value: '', maxLength: 16, placeholder: word }],
    });
    if (!got || got.word.trim().toUpperCase() !== word) {
      return;
    }
    try {
      await deleteAccount();
      say(str('account.deleted'));
    } catch (e) {
      say(str('account.error', { why: whyText(e) }));
    }
    ui.renderMenu();
  }

  const actions = {
    accountsignin: doSignIn,
    accountcallsign: pickCallsign,
    accountsignout: async () => {
      await signOut();
      say(str('account.signed_out'));
      ui.renderMenu();
    },
    accountdelete: doDelete,
    accountprivacy: () => window.open('privacy.html', '_blank', 'noopener'),
    accountterms: () => window.open('terms.html', '_blank', 'noopener'),
  };

  if (accountsAvailable()) {
    if (signedIn()) {
      setTimeout(() => sync(), 1500);
    }
    setInterval(() => {
      if (signedIn() && progressChanged(ui.settings)) {
        sync();
      }
    }, SYNC_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && signedIn() && Date.now() - lastSync > SYNC_GAP_MS) {
        sync();
      }
    });
  }

  return {
    /* True when the action was the account's, and is being handled. */
    handle(action) {
      const fn = actions[action];
      if (!fn) {
        return false;
      }
      fn();
      return true;
    },
  };
}
