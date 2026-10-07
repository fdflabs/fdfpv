/*
 * listing.js: the seated track as the public board sees it, and keeping
 * the board's copy of this browser's own tracks current.
 *
 * Read side: inspectCourse classifies the share seat (nothing, a track of
 * this browser's own, a board listing someone else published, or one this
 * browser published and holds the edit key for) and says what the menus
 * may offer: post a time, or update the listing. Write side: publishing a
 * course, and pushing a retitle or a new pilot handle to the listings this
 * browser owns.
 *
 * A track's layout is what makes it a different race: its world, its
 * elements and its flying order. Its name, id and credit are not, so a
 * renamed listing keeps its times and a republished one can be found again
 * by layout alone.
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
 * Painted-on element types: no collider, not in the flying order, so adding
 * one cannot change a lap. Leaving them out of the layout is what lets a
 * sponsor's mark go onto a course without clearing its board.
 *
 * KEEP IN STEP WITH layoutHash and LAYOUT_SKIP in the board's
 * src/validate.js (fdfpv-leaderboard). The board clears a course's times
 * when its layout changes; layoutFingerprint is this side's forecast of
 * that, used to warn before a publish. The hashes differ, but both sides
 * must read the same keys (map on a map track, field, elements, sequence)
 * and skip the same types. The list is spelled out rather than taken from
 * the element library because the board has no element library.
 */
const PAINT_ONLY = new Set(['groundLogo']);

export function layoutFingerprint(doc) {
  if (!doc || typeof doc !== 'object') {
    return '';
  }
  const src = plainOrSelf(doc);
  const layout = {};
  /* Positions on a version 4 map track are absolute in its world, so the
   * world is part of the race. Older documents never carry the key, which
   * keeps every field track's fingerprint where it was. */
  if (src.schemaVersion >= 4 && isMapTrack(src)) {
    layout.map = src.map;
  }
  layout.field = src.field ?? {};
  const elements = src.elements ?? [];
  layout.elements = elements.filter((el) => !PAINT_ONLY.has(el?.type));
  layout.sequence = src.sequence ?? [];
  return JSON.stringify(layout);
}

/* A versioned document as plain data; anything toPlain will not take is
 * read as it is, since a fingerprint must never throw on a stored blob. */
function plainOrSelf(doc) {
  if (!doc.schemaVersion) {
    return doc;
  }
  try {
    return toPlain(doc);
  } catch (e) {
    return doc;
  }
}

const sameTitle = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/*
 * Board ids are minted by the board, and a seat remembers one. Taking a
 * track off the board and putting it back (scripts/boardpresets.js
 * --replace, an admin removal) gives it a new id and strands every seat on
 * the old one: the pilot is offered Upload for a lap the board then says
 * belongs to no track. This looks the flown layout up on the board again.
 *
 * Only an exact layoutFingerprint match counts, because a lap posted to a
 * different track with the same name is worse than no post. The name only
 * orders the search (same-named listings first, so the usual case is one
 * document fetch), the track class filters it (a whoop lap only fits a
 * room), and at most TWIN_LOOKUPS documents are fetched.
 *
 * Resolves to { found, sameName }: `found` is a seat ready to write;
 * `sameName` is a listing with the flown name but another layout, so the
 * caller can say the board's copy is not what was flown.
 */
const TWIN_LOOKUPS = 6;

export async function findBoardTwin({ doc, name, trackClass, origin } = {}) {
  const want = layoutFingerprint(doc);
  if (!want) {
    return { found: null, sameName: null };
  }
  const fallbackBoard = origin || boardOrigin();
  const listings = await fetchTrackList(fallbackBoard);
  const cls = trackClassOf({ trackClass });
  const named = [];
  const others = [];
  for (const t of listings) {
    if (t.id && t.trackClass === cls) {
      (sameTitle(t.name, name) ? named : others).push(t);
    }
  }
  let sameName = null;
  for (const t of [...named, ...others].slice(0, TWIN_LOOKUPS)) {
    const where = t.board || fallbackBoard;
    /* eslint-disable-next-line no-await-in-loop */
    const payload = await fetchTrackDocument(t.id, where).catch(() => null);
    const held = payload && (payload.document || payload);
    if (held && layoutFingerprint(held) === want) {
      return {
        found: {
          id: payload.id || t.id,
          name: payload.name || t.name,
          author: payload.author || t.author || '',
          board: where,
          document: held,
        },
        sameName: null,
      };
    }
    if (!sameName && sameTitle(t.name, name)) {
      sameName = t;
    }
  }
  return { found: null, sameName };
}

export function suggestRemixName(original) {
  const title = String(original || '').trim() || str('ui.untitled_track');
  const remix = / remix$/i.test(title) ? title : `${title} remix`;
  return remix.slice(0, 80);
}

/* The key the world should be seated under, from the share seat. */
export function seatedCourseKey() {
  return courseSeatKey(readShareImport());
}

/* Race gates in the flying order. A waypoint is a step that only pins the
 * line and scores nothing, so it is not a gate a pilot is promised. */
function raceGateCount(doc) {
  if (!Array.isArray(doc.sequence)) {
    return 0;
  }
  const byId = new Map();
  for (const el of doc.elements || []) {
    if (!byId.has(el.id)) {
      byId.set(el.id, el);
    }
  }
  return doc.sequence.filter((step) => {
    const el = byId.get(step.elementId);
    return Boolean(el) && el.type !== 'waypoint';
  }).length;
}

const NO_RIGHTS = {
  canPostTime: false,
  canUpdateListing: false,
  layoutDrift: false,
  nameDrift: false,
  authorDrift: false,
};

/* The one shape inspectCourse answers in, whatever the kind. */
function courseView(doc, { kind, name, author, shareId, board, published, owned }, rights) {
  return {
    name,
    gates: doc ? raceGateCount(doc) : 0,
    elements: doc && Array.isArray(doc.elements) ? doc.elements.length : 0,
    author,
    shareId,
    board,
    kind,
    published,
    owned,
    canPostTime: rights.canPostTime,
    canUpdateListing: rights.canUpdateListing,
    layoutDrift: rights.layoutDrift,
    nameDrift: rights.nameDrift,
    authorDrift: rights.authorDrift,
    doc,
  };
}

/*
 * What this browser will fly and what the menus may offer, as `kind`:
 *
 *   none        nothing seated
 *   local       one of this browser's own tracks, on no board: no time can
 *               be posted, and its records key on its own id
 *   community   a board listing this browser does not hold the key for
 *   owned       a board listing this browser published
 *
 * `parts` lets a test supply the seat, the key and bind lookups and the
 * pilot name; given as null, a part is null rather than read from storage.
 */
export function inspectCourse(parts = {}) {
  const given = (key) => Object.prototype.hasOwnProperty.call(parts, key);
  const share = given('share') ? parts.share : readShareImport();
  const pilotName = given('pilotName') ? parts.pilotName : readPilotName();
  const editKeyFor = parts.editKeyFor || readEditKey;
  const bindFor = parts.bindFor || readBind;

  if (!share || !share.document) {
    return courseView(null, {
      kind: 'none', name: str('ui.untitled_track'), author: '', shareId: null, board: '', published: false, owned: false,
    }, NO_RIGHTS);
  }
  const doc = share.document;
  /* Shown under the seat's name; compared with the board under the
   * document's own, which is what an edit in the builder changes. */
  const shownName = share.name || doc.name;
  if (share.local) {
    return courseView(doc, {
      kind: 'local', name: shownName, author: '', shareId: null, board: '', published: false, owned: false,
    }, NO_RIGHTS);
  }

  const id = share.id || doc.id;
  const owned = Boolean(editKeyFor(id));
  const bind = bindFor(id);
  const title = doc.name || share.name;
  const boardLayout = bind ? bind.layoutFingerprint : '';
  const layoutMoved = Boolean(boardLayout) && boardLayout !== layoutFingerprint(doc);
  const boardName = bind ? bind.nameOnBoard : shownName;
  const author = (bind && bind.author) || share.author || '';
  const handleMoved = owned && Boolean(pilotName) && Boolean(author) && pilotName !== author;
  return courseView(doc, {
    kind: owned ? 'owned' : 'community',
    name: shownName,
    author,
    shareId: id,
    board: share.board || (bind && bind.board) || '',
    published: true,
    owned,
  }, {
    canPostTime: !layoutMoved,
    canUpdateListing: owned && (layoutMoved || boardName !== title || handleMoved),
    layoutDrift: owned && layoutMoved,
    nameDrift: owned && Boolean(bind && bind.nameOnBoard) && bind.nameOnBoard !== title,
    authorDrift: handleMoved,
  });
}

export function hasFlyableTrack() {
  try {
    const course = inspectCourse();
    return Boolean(course.doc) && course.gates > 0;
  } catch (e) {
    return false;
  }
}

/*
 * Record a publish the board accepted: the edit key it returned, the bind
 * (where it is listed, under which author and name, with which layout) and,
 * unless told not to, the share seat. The board may answer under another
 * id or name than was sent, and its answer wins. An earlier bind's source
 * fields (a fork's original) are carried over.
 */
function recordPublished(doc, answer, board, author, { seat = true } = {}) {
  const sent = toPlain(doc);
  const reply = answer || {};
  const id = reply.id || sent.id;
  if (reply.editKey) {
    writeEditKey(id, reply.editKey);
  }
  const before = readBind(sent.id) || readBind(id) || {};
  const where = board || before.board || '';
  const listedName = reply.name || sent.name || '';
  writeBind(id, {
    board: where,
    author: author || before.author || '',
    nameOnBoard: listedName,
    layoutFingerprint: layoutFingerprint(sent),
    owned: true,
    sourceId: before.sourceId || '',
    sourceName: before.sourceName || '',
    sourceAuthor: before.sourceAuthor || '',
  });
  if (seat) {
    writeShareImport({
      id, name: listedName, author: author || '', board: where, document: sent,
    });
  }
}

/* Write a bind that says the board already lists `id` as it should be. */
function confirmBind(id, bind, fields) {
  writeBind(id, { ...bind, ...fields, owned: true });
}

/*
 * Push the course's current name (and the pilot's current handle) to its
 * listing, when this browser owns it. Never republishes a changed layout:
 * that would clear the board's times, which takes the pilot's say-so in
 * the publish flow. Resolves to { ok, posted } or { skipped: reason }.
 */
export async function syncOwnedName(doc, origin) {
  const course = doc && doc.schemaVersion ? toPlain(doc) : doc;
  if (!course || !course.id) {
    return { skipped: 'no-doc' };
  }
  const editKey = readEditKey(course.id);
  if (!editKey) {
    return { skipped: 'not-owned' };
  }
  const bind = readBind(course.id) || {};
  const board = origin || bind.board || boardOrigin();
  const author = readPilotName() || bind.author || '';
  if (!author) {
    return { skipped: 'no-author' };
  }
  const handleMoved = Boolean(bind.author) && bind.author !== author;
  if (bind.nameOnBoard && bind.nameOnBoard === course.name && !handleMoved) {
    return { skipped: 'current' };
  }
  let listedLayout = bind.layoutFingerprint || '';
  if (!listedLayout) {
    /* No layout on record (a bind from before it was kept): ask the board
     * what it holds, and if that already reads right, just remember it. */
    try {
      const payload = await fetchTrackDocument(course.id, board);
      const held = payload.document || payload;
      listedLayout = layoutFingerprint(held);
      const listedName = payload.name || held.name;
      const listedAuthor = payload.author || '';
      if (listedName === course.name && (!listedAuthor || listedAuthor === author)) {
        confirmBind(course.id, bind, {
          board, author: listedAuthor || author, nameOnBoard: listedName, layoutFingerprint: listedLayout,
        });
        return { skipped: 'current' };
      }
    } catch (error) {
      return { skipped: 'offline', error };
    }
  }
  if (listedLayout && listedLayout !== layoutFingerprint(course)) {
    return { skipped: 'layout-changed' };
  }
  const posted = await publishTrack({
    author, document: course, editKey, origin: board,
  });
  recordPublished(course, posted, board, author);
  return { ok: true, posted };
}

/*
 * The pilot's handle lives in this browser; the board keeps whatever name a
 * listing was sent under. For every listing this browser holds a key for,
 * resend it under the current handle (the board then retitles the author
 * line and the times posted under the old one). One failure does not stop
 * the rest: each id gets its own result.
 */
export async function syncOwnedIdentity(origin) {
  const author = readPilotName();
  if (!author) {
    return { skipped: 'no-author' };
  }
  const editKeys = readAllEditKeys();
  const owned = Object.entries(editKeys).filter(([, key]) => key);
  if (owned.length === 0) {
    return { skipped: 'none-owned' };
  }
  const seat = readShareImport();
  const results = [];
  for (const [id, editKey] of owned) {
    /* eslint-disable-next-line no-await-in-loop */
    results.push(await resendUnderHandle(id, editKey, author, origin, seat));
  }
  return { results };
}

async function resendUnderHandle(id, editKey, author, origin, seat) {
  const bind = readBind(id) || {};
  if (bind.author && bind.author === author) {
    return { id, skipped: 'current' };
  }
  const board = origin || bind.board || boardOrigin();
  try {
    const payload = await fetchTrackDocument(id, board);
    const held = payload.document || payload;
    if ((payload.author || '') === author) {
      confirmBind(id, bind, {
        board,
        author,
        nameOnBoard: payload.name || held.name || bind.nameOnBoard || '',
        layoutFingerprint: bind.layoutFingerprint || layoutFingerprint(held),
      });
      return { id, skipped: 'current' };
    }
    const posted = await publishTrack({
      author, document: held, editKey, origin: board,
    });
    recordPublished(held, posted, board, author, { seat: Boolean(seat && seat.id === id) });
    return { id, ok: true };
  } catch (error) {
    return { id, error };
  }
}

export async function pushOwnedListing(doc, origin) {
  const named = doc ? await syncOwnedName(doc, origin) : null;
  const identity = await syncOwnedIdentity(origin);
  return { named, identity };
}

/*
 * Publish the course being built, under `courseName` if one is given. When
 * the board answers that the id belongs to another browser (a conflict),
 * publish a copy under a fresh id instead, and record the original as its
 * source once the copy is accepted. Resolves to { posted, doc, forked },
 * `doc` being what was actually published.
 */
export async function publishCurrentCourse({
  doc, author, origin, courseName,
}) {
  const plainDoc = toPlain(doc);
  const course = courseName && courseName !== plainDoc.name ? { ...plainDoc, name: courseName } : plainDoc;
  const board = origin || readBind(course.id)?.board || boardOrigin();
  const publish = async (candidate) => {
    const posted = await publishTrack({
      author, document: candidate, editKey: readEditKey(candidate.id), origin: board,
    });
    return posted;
  };
  const finish = (published, posted, forked) => {
    recordPublished(published, posted, board, author);
    writeAutosave(published);
    return { posted, doc: published, forked };
  };

  let posted;
  try {
    posted = await publish(course);
  } catch (e) {
    if (!e || !e.conflict) {
      throw e;
    }
    const copy = toPlain(duplicateTrack(course, course.name || suggestRemixName(course.name)));
    const postedCopy = await publish(copy);
    writeBind(copy.id, {
      board,
      author: '',
      nameOnBoard: '',
      layoutFingerprint: '',
      owned: false,
      sourceId: course.id || '',
      sourceName: course.name || '',
      sourceAuthor: '',
    });
    return finish(copy, postedCopy, true);
  }
  return finish(course, posted, false);
}
