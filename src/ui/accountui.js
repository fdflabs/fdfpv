/*
 * accountui.js: the Google sign-in's panel and dialogs, and the sync
 * between this computer's settings and the account.
 *
 * THE PANEL (ui.signinPanel, placed and shown by ui.js syncChips). Nobody
 * plays without an account (the owner, 2026-10-03), but the home and the
 * hubs are not walled off: until the pilot is signed in with a callsign,
 * the corner where their callsign will go holds one line on why and
 * Google's own "Sign in with Google" button, on every screen but a flight.
 * Every way into a flight or a room asks src/share/account.js needSignIn
 * first, which lands here (nudge): the panel says what is wanted, and what
 * the pilot pressed runs once they have signed in and picked a callsign,
 * which follows the first sign in as it always has.
 *
 * The Pilot screen's rows (ui.js) come here through main.js: sign in
 * (which points at the panel), pick the callsign, sign out, delete the
 * account, and the privacy and terms pages. The network and the rules are
 * src/share/account.js; this file is what the pilot sees of them.
 *
 * THE BUTTON IS GOOGLE'S. Google Identity Services draws its own button
 * (its branding rules ask for it) into the panel, and its script loads
 * when the panel is first shown: on a page with accounts and nobody
 * signed in, that is at boot. A signed in page never fetches it.
 *
 * WHEN THINGS ARE DOWN. A pilot signed in on this computer keeps playing:
 * the session was checked when it was made, and nothing here asks again
 * before a flight. With Google's script or the accounts server
 * unreachable, a new sign in cannot happen, and the panel says which of
 * the two it is, in words, rather than showing nothing. Rooms need the
 * servers anyway, and a room refused for want of the accounts server says
 * so (friends.failed_accounts).
 *
 * SIGNING OUT, or the session ending, lets this computer's progress go
 * with the account: once a sync has merged it (src/share/account.js
 * SYNCED_KEY), the synced sections and My Hangar's builds are cleared
 * here, so the next account to sign in on this computer starts from
 * nothing of the last one's. A guest's progress, and what move.js carried
 * from the old address, is merged into the first account to sign in and
 * sync, by the rules of src/share/progressmerge.js, and then it is that
 * account's. The page then starts again, signed out.
 *
 * SYNC. After signing in, at boot while signed in, when the tab comes back
 * into view, and once a minute while something synced has changed. What
 * comes back is merged by the server and applied through ui.js
 * loadSettings, so whatever another computer sent is held to the same
 * rules as anything read out of local storage. My Hangar's builds ride
 * along as the section `builds` (syncedView), and come back through
 * src/ui/builds.js normaliseBuilds, the same judge as at boot.
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
  GOOGLE_CLIENT_ID, accountsAvailable, chooseCallsign, deleteAccount, mayPlay, onSignInNeeded, progressChanged, pullProgress,
  settled, signIn, signOut, signedIn, startAccounts, syncProgress,
} from '../share/account.js';
import { SYNCED_SECTIONS } from '../share/progressmerge.js';
import { tracksOrigin } from '../share/cloud.js';
import { SETTINGS_KEY, loadSettings } from './ui.js';
import { mergeFlightTime } from '../share/flighttime.js';
import {
  buildsBlob, buildsFromBlob, fitBuild, saveBuilds, stockView, unfitFamily,
} from './builds.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SYNC_EVERY_MS = 60 * 1000;
const SYNC_GAP_MS = 30 * 1000;
const HEALTH_WAIT_MS = 5000;
const NUDGE_MS = 1400;

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

/* What a sync carries leaves this computer: the synced settings
 * sections, and My Hangar's builds with which plane wears which. What is
 * left is this computer's own: graphics, controls, the world. */
function clearProgress() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const k of Object.keys(SYNCED_SECTIONS)) {
      delete s[k];
    }
    delete s.buildFits;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    /* Private mode: it goes with the page. */
  }
  saveBuilds([]);
}

export function createAccountUi({ ui, identity, say }) {
  let lastSync = 0;
  let syncing = null;
  /* What the pilot pressed before signing in, run once they have. */
  let pending = null;

  /* The page starts again, signed out, off the sticks: a session ended
   * by the server mid flight waits for the flight to end. */
  function restart() {
    if (ui.screen !== 'flight') {
      window.location.reload();
      return;
    }
    const wait = setInterval(() => {
      if (ui.screen !== 'flight') {
        clearInterval(wait);
        window.location.reload();
      }
    }, 1000);
  }

  startAccounts(identity, {
    forgotten: (merged) => {
      if (merged) {
        clearProgress();
      }
      restart();
    },
  });

  const panel = ui.signinPanel;
  const why = el('p', 'signin-panel-why');
  const gisSlot = el('div', 'signin-panel-gis');
  const pick = btn('bug-chip signin-panel-pick', str('account.pick_button'));
  const status = el('p', 'signin-panel-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  panel.append(why, gisSlot, pick, status);

  function setStatus(text) {
    status.textContent = text || '';
    status.hidden = !text;
  }

  /* Signed in, with no callsign yet (the form closed): the callsign is
   * all that is missing, and the panel asks for that instead. */
  function halfway() {
    return signedIn() && !readAccount()?.callsign;
  }

  function renderPanel() {
    const half = halfway();
    why.textContent = str(half ? 'account.panel_pick' : 'account.panel_why');
    gisSlot.hidden = half;
    pick.hidden = !half;
  }

  let gisMounted = false;
  function mountGis() {
    if (gisMounted || !accountsAvailable() || mayPlay()) {
      return;
    }
    gisMounted = true;
    loadGis().then((gis) => {
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => {
          if (res && res.credential) {
            withCredential(res.credential);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gis.renderButton(gisSlot, {
        type: 'standard', theme: 'filled_black', size: 'medium', text: 'signin_with', shape: 'rectangular', locale: currentLocale(),
      });
    }).catch(() => {
      gisMounted = false;
      setStatus(str('account.google_unreachable'));
    });
  }

  /* Whether the accounts server answers, said in the panel when it does
   * not: a sign in would only fail. */
  function probeAccounts() {
    fetch(`${tracksOrigin()}/api/health`, { signal: AbortSignal.timeout(HEALTH_WAIT_MS) })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (status.textContent === str('account.server_unreachable')) {
          setStatus('');
        }
      })
      .catch(() => {
        if (!mayPlay()) {
          setStatus(str('account.server_unreachable'));
        }
      });
  }

  /* Signed in with a callsign at last: the pilot goes where they were
   * going. */
  async function finishSignIn() {
    const callsign = readAccount()?.callsign || await pickCallsign();
    renderPanel();
    ui.renderMenu();
    ui.syncChips();
    if (!callsign) {
      return;
    }
    say(str('account.signed_in_as', { callsign }));
    const resume = pending;
    pending = null;
    if (resume) {
      resume();
    }
  }

  async function withCredential(credential) {
    setStatus(str('account.signing_in'));
    try {
      await signIn(credential, (kind) => askChoice(ui, {
        title: str(`account.${kind}_title`),
        detail: str(`account.${kind}_detail`),
        yes: str('account.bring_it'),
        no: str('account.not_mine'),
      }));
    } catch (e) {
      setStatus(str('account.error', { why: whyText(e) }));
      ui.syncChips();
      return;
    }
    setStatus('');
    sync();
    await finishSignIn();
  }

  /*
   * A way into a flight or a room was asked for without an account
   * (src/share/account.js needSignIn). The panel is always up on a menu;
   * this says what it is for, and keeps what was asked for. A pilot only
   * missing the callsign is asked for it there and then.
   */
  function nudge(resume) {
    if (resume) {
      pending = resume;
    }
    renderPanel();
    if (halfway()) {
      finishSignIn();
      return;
    }
    mountGis();
    if (status.hidden) {
      setStatus(str('account.panel_nudge'));
    }
    panel.classList.remove('is-nudged');
    /* Read back so the class's animation starts again on a second ask. */
    void panel.offsetWidth;
    panel.classList.add('is-nudged');
    setTimeout(() => panel.classList.remove('is-nudged'), NUDGE_MS);
    ui.syncChips();
  }
  pick.addEventListener('click', () => finishSignIn());

  /* What a sync carries: the settings as they are with every build taken
   * off, and the builds themselves. */
  function syncedView() {
    return { ...stockView(ui.settings), builds: buildsBlob(ui.myBuilds) };
  }

  /* The merge applied: every synced section put in ui.settings, the whole
   * blob read back through loadSettings, and only the synced sections
   * taken from that, so a plane or a scheme this build does not have is
   * dropped here as it would be at boot.
   *
   * A family wearing a My Hangar build keeps the pilot's own paint, power,
   * parts and tuning aside (src/ui/builds.js), and those are what sync, so
   * a build never reaches another computer as the stock plane's. The
   * builds come off for the merge and go back on over what it brought,
   * each as the merge has it: one deleted on another computer stays off,
   * and its family flies the pilot's own customisation again.
   *
   * No `builds` in the merge leaves this computer's alone: a tracks
   * server from before the builds synced drops the section, and that is
   * not the account having none. */
  function apply(merged) {
    const s = ui.settings;
    const worn = Object.values(s.buildFits || {}).map((e) => e.build);
    const fitsBefore = JSON.stringify(s.buildFits || {});
    for (const land of Object.keys(s.buildFits || {})) {
      unfitFamily(s, land);
    }
    const { builds, ...data } = merged.data;
    /* Flight time grows on this computer while the sync is out, so the
     * merge is merged again with what is here now rather than put over
     * it: put over it, the seconds flown during the round trip would be
     * lost (src/share/flighttime.js). */
    if (data.flightTime !== undefined) {
      data.flightTime = mergeFlightTime(s.flightTime, data.flightTime);
    }
    let changed = false;
    if (builds !== undefined) {
      const list = buildsFromBlob(builds);
      if (JSON.stringify(list) !== JSON.stringify(ui.myBuilds)) {
        ui.buildList = list;
        saveBuilds(list);
        changed = true;
      }
    }
    for (const [k, v] of Object.entries(data)) {
      if (JSON.stringify(s[k]) !== JSON.stringify(v)) {
        s[k] = v;
        changed = true;
      }
    }
    if (changed) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        const fresh = loadSettings();
        for (const k of Object.keys(data)) {
          s[k] = fresh[k];
        }
      } catch (e) {
        /* Private mode: the merge lives in this page. */
      }
    }
    for (const id of worn) {
      const b = ui.myBuilds.find((x) => x.id === id);
      if (b) {
        fitBuild(s, b);
      }
    }
    changed = changed || JSON.stringify(s.buildFits || {}) !== fitsBefore;
    if (changed) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch (e) {
        /* Private mode: the merge lives in this page. */
      }
      ui.renderMenu();
    }
    /* Settled as the account holds it, not as this computer does, so
     * time flown during the round trip still reads as unsent and goes up
     * with the next sync rather than waiting for the next flight. */
    const view = syncedView();
    settled(merged.data.flightTime === undefined ? view : { ...view, flightTime: merged.data.flightTime }, merged);
    return changed;
  }

  /* A pull sends nothing and applies the account merged with this
   * computer's settings (src/share/account.js pullProgress): only for a
   * computer with no change since its last sync, so applying it loses
   * nothing of this computer's and settles nothing it has not sent. One
   * changed while the pull was out is left for the next sync to send. */
  function sync({ loud = false, pull = false } = {}) {
    if (!signedIn() || syncing) {
      return syncing || Promise.resolve(false);
    }
    lastSync = Date.now();
    syncing = (pull ? pullProgress(syncedView()) : syncProgress(syncedView())).then((merged) => {
      if (pull && progressChanged(syncedView())) {
        return false;
      }
      const changed = merged ? apply(merged) : false;
      if (loud || changed) {
        say(str('account.synced'));
      }
      return changed;
    }).catch((e) => {
      /* A pull that fails changed nothing on either side, and offline it
       * would say so every minute: the next sync that sends says it. */
      if (!pull && (signedIn() || loud)) {
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
      /* Lets the account go here too, and the page starts again. */
      await deleteAccount();
    } catch (e) {
      say(str('account.error', { why: whyText(e) }));
      ui.renderMenu();
    }
  }

  const actions = {
    accountsignin: () => nudge(null),
    accountcallsign: pickCallsign,
    /* Lets the account go here, and the page starts again signed out. */
    accountsignout: () => signOut(),
    accountdelete: doDelete,
    accountprivacy: () => window.open('privacy.html', '_blank', 'noopener'),
    accountterms: () => window.open('terms.html', '_blank', 'noopener'),
  };

  onSignInNeeded(nudge);
  if (accountsAvailable()) {
    renderPanel();
    if (!mayPlay()) {
      mountGis();
      probeAccounts();
    }
    if (signedIn()) {
      setTimeout(() => sync(), 1500);
    }
    /* A tab left open hears of another computer's changes within the
     * minute (the owner's home tab, 2026-10-02, waited on the office's
     * builds): sent when this computer changed something, else pulled
     * while it is in view, since a hidden one syncs on coming back. */
    setInterval(() => {
      if (!signedIn()) {
        return;
      }
      if (progressChanged(syncedView())) {
        sync();
      } else if (document.visibilityState === 'visible') {
        sync({ pull: true });
      }
    }, SYNC_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && signedIn() && Date.now() - lastSync > SYNC_GAP_MS) {
        sync();
      }
    });
  }

  return {
    sync,
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
