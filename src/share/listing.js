/*
 * listing.js: how a track in this browser relates to the public board.
 *
 * The share seat holds the track being flown: a published listing this run
 * can post a time to, or one of the pilot's own that is on no board. This
 * file is the one place that looks at it, plus the edit key, and says what
 * the player can do next: upload a time, or update a name they own.
 *
 * Layout is everything that makes two tracks different races: the world,
 * the elements, the flying order. The title is not layout. The handle is
 * not layout either. The board uses the same split, so renaming an owned
 * course keeps the times, and changing the name this browser flies under
 * updates the author and the times posted under the old handle on courses
 * this browser published.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { trackClassOf } from '../trackbuilder/elements.js';
import { duplicateTrack, isMapTrack, toPlain } from '../trackbuilder/model.js';
import { writeAutosave } from '../trackbuilder/storage.js';
import { boardOrigin, fetchTrackDocument, fetchTrackList, publishTrack } from './board.js';
import { readPilotName } from './pilot.js';
import { str } from '../strings/index.js';
import {
  courseSeatKey,
  readAllEditKeys,
  readBind,
  readEditKey,
  readShareImport,
  writeBind,
  writeEditKey,
  writeShareImport,
} from './session.js';

/*
 * MIRRORS layoutHash in fdfpv-leaderboard/src/validate.js. The
 * board decides when a layout has changed enough to clear a course's times;
 * this is the client's prediction of that answer, used to warn before
 * publishing. They must agree on WHICH KEYS count as the layout, currently
 * field, elements and sequence, and the map on a map track, AND on which
 * element types are dressing
 * rather than layout. Different hashes, same key list and same skip list:
 * change one and change the other, or the warning and the clearing
 * disagree.
 */
/*
 * Element types that are painted on rather than flown through, so changing
 * them cannot change a lap.
 *
 * THIS IS WHY A SPONSOR DOES NOT WIPE A LEADERBOARD. Selling a place on an
 * existing course means adding a mark to a track people have already flown,
 * and if that counted as a layout change every time on the board would be
 * cleared the moment the deal was signed. Paint has no collider and is not
 * in the flying order, so a lap flown before it was painted is the same lap.
 *
 * Written out as a literal rather than derived from the element library,
 * because the board has no element library and the two lists have to be
 * edited together on purpose. MIRRORS LAYOUT_SKIP in the board's
 * validate.js.
 */
const LAYOUT_SKIP = new Set(['groundLogo']);

export function layoutFingerprint(doc) {
  if (!doc || typeof doc !== 'object') {
    return '';
  }
  let plain = doc;
  try {
    if (doc.schemaVersion) {
      plain = toPlain(doc);
    }
  } catch (e) {
    plain = doc;
  }
  /* A MAP TRACK'S WORLD IS LAYOUT. Its positions are absolute in that world
   * (schemaVersion 4), so the same gates on swiss2 and on alps are two
   * different races and a republish onto another world clears the times.
   * Only a version 4 document naming a map carries the key, so every field
   * track fingerprints exactly as it did. MIRRORS the board's layoutHash. */
  const onMap = plain.schemaVersion >= 4 && isMapTrack(plain);
  return JSON.stringify({
    ...(onMap ? { map: plain.map } : {}),
    field: plain.field ?? {},
    elements: (plain.elements ?? []).filter((e) => !LAYOUT_SKIP.has(e?.type)),
    sequence: plain.sequence ?? [],
  });
}


/*
 * THE SAME TRACK, UNDER WHATEVER ID THE BOARD HOLDS IT AT NOW.
 *
 * A board id is minted by the board and a seat remembers it, so a seat is
 * only as good as the listing it came from. Take a track off the board and
 * put it back, which is what scripts/boardpresets.js --replace does and what
 * an admin removal does, and every browser holding a seat for it is left
 * pointing at an id that no longer exists. The pilot is told their track is
 * on the public board, offered Upload, and gets "That track is not on the
 * board." with nowhere to go and a lap they cannot post. That is what this
 * is for, and it was reported from the seat on a shipped RaceGOW room.
 *
 * THE MATCH IS THE LAYOUT, NOT THE NAME. Two tracks with the same name are
 * not the same track and a time on the wrong one is worse than no time at
 * all, so a candidate only counts when layoutFingerprint agrees exactly.
 * That fingerprint reads the field, the elements and the flying order and
 * ignores the id, the name and the credit, which is precisely what survives
 * a republish. The name is used only to decide what to LOOK at first, and
 * the class narrows it before that: a whoop's lap can only belong to a room.
 *
 * The cap is what keeps this from being a crawl of the whole board. In
 * practice the first candidate is the right one, because it is the one whose
 * name matches; the cap is there for the case where it is not.
 *
 * Returns `{ found, sameName }`. `found` is a seat ready to be written.
 * `sameName` is a listing that wears the name but has a different layout,
 * which is a different message: the board's copy is not what was flown, so
 * the time does not belong on it and the pilot needs to know that rather
 * than be told the track is gone.
 */
const TWIN_LOOKUPS = 6;

export async function findBoardTwin({ doc, name, trackClass, origin } = {}) {
  const want = layoutFingerprint(doc);
  if (!want) {
    return { found: null, sameName: null };
  }
  const board = origin || boardOrigin();
  const list = await fetchTrackList(board);
  const cls = trackClassOf({ trackClass });
  const wanted = String(name || '').trim().toLowerCase();
  const pool = list
    .filter((t) => t.id && t.trackClass === cls)
    /* Same name first, so the usual case costs one document fetch. */
    .sort((a, b) => Number(String(b.name || '').trim().toLowerCase() === wanted)
      - Number(String(a.name || '').trim().toLowerCase() === wanted));
  let sameName = null;
  for (const t of pool.slice(0, TWIN_LOOKUPS)) {
    let payload = null;
    try {
      /* eslint-disable-next-line no-await-in-loop */
      payload = await fetchTrackDocument(t.id, t.board || board);
    } catch (e) {
      /* A candidate the board will not hand over is not a match. Carry on:
       * one bad document must not cost the pilot the others. */
      payload = null;
    }
    const held = payload && (payload.document || payload);
    if (held && layoutFingerprint(held) === want) {
      return {
        found: {
          id: (payload && payload.id) || t.id,
          name: (payload && payload.name) || t.name,
          author: (payload && payload.author) || t.author || '',
          board: t.board || board,
          document: held,
        },
        sameName: null,
      };
    }
    if (!sameName && String(t.name || '').trim().toLowerCase() === wanted) {
      sameName = t;
    }
  }
  return { found: null, sameName };
}

export function suggestRemixName(original) {
  const base = String(original || '').trim() || str('ui.untitled_track');
  const tagged = / remix$/i.test(base) ? base : `${base} remix`;
  return tagged.slice(0, 80);
}

/* The track the world should be seated with, from the share seat. */
export function seatedCourseKey() {
  return courseSeatKey(readShareImport());
}

function pick(parts, key, fallback) {
  return Object.prototype.hasOwnProperty.call(parts, key) ? parts[key] : fallback();
}

function summaryOf(doc, extra) {
  return {
    name: extra.name || (doc && doc.name) || str('ui.untitled_track'),
    /* GATES, NOT STEPS. A waypoint is a step in the flying order that
     * pins the line through a point and scores nothing, so counting the
     * order would advertise gates a pilot will never fly through. */
    gates: doc && Array.isArray(doc.sequence)
      ? doc.sequence.filter((s) => {
        const el = (doc.elements || []).find((e) => e.id === s.elementId);
        return Boolean(el) && el.type !== 'waypoint';
      }).length
      : 0,
    elements: doc && Array.isArray(doc.elements) ? doc.elements.length : 0,
    author: extra.author || '',
    shareId: extra.shareId || null,
    board: extra.board || '',
    ...extra,
    doc: doc || null,
  };
}

/*
 * What this browser will fly, and what the menus should offer.
 *
 *   community   a published track opened from the board, not ours
 *   owned       a listing this browser published, edit key in hand
 *   local       one of this browser's own tracks, not on the board
 *   none        nothing to fly
 *
 * `parts` is for tests. The live path reads the share seat and the keys.
 */
export function inspectCourse(parts = {}) {
  const share = pick(parts, 'share', readShareImport);
  const editKeyFor = parts.editKeyFor || readEditKey;
  const bindFor = parts.bindFor || readBind;
  const currentName = pick(parts, 'pilotName', () => readPilotName());

  if (!share || !share.document) {
    return summaryOf(null, {
      kind: 'none',
      published: false,
      owned: false,
      canPostTime: false,
      canUpdateListing: false,
      layoutDrift: false,
      nameDrift: false,
      authorDrift: false,
    });
  }

  const doc = share.document;
  if (share.local) {
    /*
     * THE PILOT'S OWN, played from My tracks. Nothing is published, so no
     * time can be posted against it and there is no board ghost; the
     * record key is the track's own, so its laps accumulate against one
     * name however often it is edited.
     */
    return summaryOf(doc, {
      kind: 'local',
      published: false,
      owned: false,
      shareId: null,
      board: '',
      author: '',
      name: share.name || doc.name,
      canPostTime: false,
      canUpdateListing: false,
      layoutDrift: false,
      nameDrift: false,
      authorDrift: false,
    });
  }

  const id = share.id || doc.id;
  const owned = Boolean(editKeyFor(id));
  const bind = bindFor(id);
  const fp = layoutFingerprint(doc);
  const layoutMatch = !bind || !bind.layoutFingerprint || bind.layoutFingerprint === fp;
  const nameOnBoard = bind ? bind.nameOnBoard : (share.name || doc.name);
  const listedAuthor = (bind && bind.author) || share.author || '';
  const authorDrift = Boolean(owned && currentName && listedAuthor && currentName !== listedAuthor);
  return summaryOf(doc, {
    kind: owned ? 'owned' : 'community',
    published: true,
    owned,
    shareId: id,
    board: share.board || (bind && bind.board) || '',
    author: listedAuthor,
    name: share.name || doc.name,
    canPostTime: layoutMatch,
    canUpdateListing: owned && (!layoutMatch || nameOnBoard !== (doc.name || share.name) || authorDrift),
    layoutDrift: Boolean(owned && bind && bind.layoutFingerprint && bind.layoutFingerprint !== fp),
    nameDrift: Boolean(owned && bind && bind.nameOnBoard && bind.nameOnBoard !== (doc.name || share.name)),
    authorDrift,
  });
}

export function hasFlyableTrack() {
  try {
    const listing = inspectCourse();
    return Boolean(listing && listing.doc && listing.gates > 0);
  } catch (e) {
    return false;
  }
}


/*
 * A copy of a track under a new id, and the bind that would make it this
 * browser's: what a publish does when the board already holds this id for
 * another browser.
 *
 * The bind is RETURNED rather than written, so the caller commits it only
 * when the fork actually happens.
 */
function forkDocument(doc, extra = {}) {
  const copy = duplicateTrack(doc, extra.name || suggestRemixName(doc && doc.name));
  const bind = {
    board: extra.board || '',
    author: '',
    nameOnBoard: '',
    layoutFingerprint: '',
    owned: false,
    sourceId: extra.sourceId || (doc && doc.id) || '',
    sourceName: extra.sourceName || (doc && doc.name) || '',
    sourceAuthor: extra.sourceAuthor || '',
  };
  return { copy, commit: () => writeBind(copy.id, bind) };
}

function rememberPublish(doc, posted, origin, author, extra = {}) {
  const plain = toPlain(doc);
  const id = (posted && posted.id) || plain.id;
  if (posted && posted.editKey) {
    writeEditKey(id, posted.editKey);
  }
  const prev = readBind(plain.id) || readBind(id) || {};
  writeBind(id, {
    board: origin || prev.board || '',
    author: author || prev.author || '',
    nameOnBoard: (posted && posted.name) || plain.name || '',
    layoutFingerprint: layoutFingerprint(plain),
    owned: true,
    sourceId: prev.sourceId || '',
    sourceName: prev.sourceName || '',
    sourceAuthor: prev.sourceAuthor || '',
  });
  if (extra.touchShare !== false) {
    writeShareImport({
      id,
      name: (posted && posted.name) || plain.name || '',
      author: author || '',
      board: origin || prev.board || '',
      document: plain,
    });
  }
  return id;
}

export async function syncOwnedName(doc, origin) {
  const plain = doc && doc.schemaVersion ? toPlain(doc) : doc;
  if (!plain || !plain.id) {
    return { skipped: 'no-doc' };
  }
  const key = readEditKey(plain.id);
  if (!key) {
    return { skipped: 'not-owned' };
  }
  const bind = readBind(plain.id) || {};
  const board = origin || bind.board || boardOrigin();
  const author = readPilotName() || bind.author || '';
  if (!author) {
    return { skipped: 'no-author' };
  }
  const authorChanged = Boolean(author && bind.author && bind.author !== author);
  if (bind.nameOnBoard && bind.nameOnBoard === plain.name && !authorChanged) {
    return { skipped: 'current' };
  }
  let publishedFp = bind.layoutFingerprint || '';
  if (!publishedFp) {
    try {
      const payload = await fetchTrackDocument(plain.id, board);
      const remote = payload.document || payload;
      publishedFp = layoutFingerprint(remote);
      const remoteName = payload.name || remote.name;
      const remoteAuthor = payload.author || '';
      if (remoteName === plain.name && (!remoteAuthor || remoteAuthor === author)) {
        writeBind(plain.id, {
          ...bind,
          board,
          author: remoteAuthor || author,
          nameOnBoard: remoteName,
          layoutFingerprint: publishedFp,
          owned: true,
        });
        return { skipped: 'current' };
      }
    } catch (e) {
      return { skipped: 'offline', error: e };
    }
  }
  if (publishedFp && publishedFp !== layoutFingerprint(plain)) {
    return { skipped: 'layout-changed' };
  }
  const posted = await publishTrack({
    author,
    document: plain,
    editKey: key,
    origin: board,
  });
  rememberPublish(plain, posted, board, author);
  return { ok: true, posted };
}

/*
 * The handle lives in this browser. Courses and times on the board still
 * carry the name they were sent with, until this browser pushes the new
 * one. Courses this browser published are the ones it can retitle: the
 * author line, and times posted under the old handle on those courses.
 */
export async function syncOwnedIdentity(origin) {
  const author = readPilotName();
  if (!author) {
    return { skipped: 'no-author' };
  }
  const keys = readAllEditKeys();
  const ids = Object.keys(keys).filter((id) => keys[id]);
  if (!ids.length) {
    return { skipped: 'none-owned' };
  }
  const share = readShareImport();
  const results = [];
  for (const id of ids) {
    const bind = readBind(id) || {};
    if (bind.author && bind.author === author) {
      results.push({ id, skipped: 'current' });
      continue;
    }
    const board = origin || bind.board || boardOrigin();
    try {
      const payload = await fetchTrackDocument(id, board);
      const document = payload.document || payload;
      const remoteAuthor = payload.author || '';
      if (remoteAuthor === author) {
        writeBind(id, {
          ...bind,
          board,
          author,
          nameOnBoard: payload.name || document.name || bind.nameOnBoard || '',
          layoutFingerprint: bind.layoutFingerprint || layoutFingerprint(document),
          owned: true,
        });
        results.push({ id, skipped: 'current' });
        continue;
      }
      const posted = await publishTrack({
        author,
        document,
        editKey: keys[id],
        origin: board,
      });
      rememberPublish(document, posted, board, author, {
        touchShare: Boolean(share && share.id === id),
      });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, error: e });
    }
  }
  return { results };
}

export async function pushOwnedListing(doc, origin) {
  let named = null;
  if (doc) {
    named = await syncOwnedName(doc, origin);
  }
  const identity = await syncOwnedIdentity(origin);
  return { named, identity };
}

export async function publishCurrentCourse({ doc, author, origin, courseName }) {
  let working = toPlain(doc);
  if (courseName && courseName !== working.name) {
    working = { ...working, name: courseName };
  }
  const board = origin || readBind(working.id)?.board || boardOrigin();
  const trySend = async (payload) => publishTrack({
    author,
    document: payload,
    editKey: readEditKey(payload.id),
    origin: board,
  });
  try {
    const posted = await trySend(working);
    rememberPublish(working, posted, board, author);
    writeAutosave(working);
    return { posted, doc: working, forked: false };
  } catch (e) {
    if (!e || !e.conflict) {
      throw e;
    }
    const copy = forkDocument(working, {
      name: working.name,
      board,
      sourceId: working.id,
      sourceName: working.name,
      sourceAuthor: '',
    });
    const plain = toPlain(copy);
    const posted = await trySend(plain);
    rememberPublish(plain, posted, board, author);
    writeAutosave(plain);
    return { posted, doc: plain, forked: true };
  }
}
