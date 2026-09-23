/*
 * app.js: the track builder itself. State, keyboard, top bar, and the wiring
 * between the two views and the panels.
 *
 * This module is the ONLY thing in the track builder that holds mutable
 * state, and everything that changes the document goes through edit(), which
 * takes the undo snapshot, runs the mutation, re-derives the faces, clamps
 * the sequence, rebuilds the line if one is showing, refreshes the panels and
 * schedules an autosave. One door in, so no edit can arrive without an undo
 * step or leave a stale racing line behind it.
 *
 * ISOLATION. Nothing here imports from the simulator: not the physics, not
 * the flight controller, not the renderer, not the input path, not the game
 * state. The only thing this tool shares with the game is the track document
 * described in schema.md, and the game does not read it yet.
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

import { ELEMENTS, KIND, elementByKey, trackClassOf } from './elements.js';
import {
  createTrack, createElement, deepClone, deserialize, duplicateTrack,
  elementById, kindOf, isSequenceable, normalize, startPadsOf, touch,
  aperturesOf, toPlain, logosOf, brandingBytes, newLogoId, dressOrder,
  LOGO_SLOTS, BRANDING_MAX_CHARS,
} from './model.js';
import { applyAutoFaces, clearOverride, defaultYawFor, flipFace, setYaw } from './faces.js';
import {
  addToSequence, addNextLevel, clampSequenceToApertures, moveInSequence,
  removeElement, removeFromSequence, setApertureIndex,
} from './sequence.js';
import { applyFigure, defaultFigure, upgradeStackedFigures } from './figures.js';
import { buildPath } from './path.js';
import { collectWarnings, sortWarnings } from './warnings.js';
import { History } from './history.js';
import {
  animationFilename, deleteTrack, downloadBlob, downloadTrack, listTracks,
  loadTrack, makeAutosaver, readAutosave, readFileText, saveTrack, writeAutosave,
} from './storage.js';
import { normaliseLogo, drawBannerPreview, drawGroundPreview } from './logo.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { Panels } from './ui.js';
import { RAD } from './geometry.js';
import {
  boardOrigin, boardPageUrl, publishTrack, setBoardOrigin, adoptShareFromLocation,
  TRACK_TAGS, TRACK_TAGS_MAX, tagLabel, usableTags,
} from '../share/board.js';
import { sendCardAnimation } from '../share/cardgif.js';
import { BOARD_WINDOW, SIM_WINDOW, claimWindowName } from '../share/windows.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import { str } from '../strings/index.js';

/* Static sentences in index.html carry data-str keys; filled here so the
 * markup stays greppable and the copy lives in one table. */
for (const node of document.querySelectorAll('[data-str]')) {
  node.textContent = str(node.dataset.str);
}
import {
  clearShareImport, readBuilderIntent, readEditKey, readShareImport,
  setActiveTrackClass, takeBuilderIntent,
} from '../share/session.js';
import {
  bindOwnedCanvas,
  courseChip,
  flyCanvasWithoutListing,
  forkDocument,
  inspectCourse,
  isEmptyCanvas,
  publishedTags,
  rememberPublish,
  suggestRemixName,
  syncOwnedName,
  syncOwnedIdentity,
  pushOwnedListing,
} from '../share/listing.js';

/*
 * WHICH KIND OF TRACK A NEW ONE IS.
 *
 * A track class is a property of the track, so it has to be decided when a
 * NEW one is made, and the honest source for that decision is which aircraft
 * the pilot has seated: a 65 mm whoop flies a RaceGOW room and a 5 inch
 * flies a sixty metre field.
 *
 * Three sources, in order:
 *
 *   ?class=micro   an explicit answer in the URL. None of the simulator's
 *                  own links carry one; this is for a hand typed address.
 *   the settings   the shell's own blob, read as a STRING KEY rather than by
 *                  importing anything from it. The builder does not import a
 *                  line of the simulator (see schema.md) and this keeps that
 *                  true: the coupling is one localStorage key and one field
 *                  name, both named here, and a change to either shows up as
 *                  the builder defaulting to a field, which is the safe way
 *                  round.
 *   'full'         nobody said, so it is the track this tool has always made.
 *
 * Note what is NOT here: an existing document's own class always wins, and
 * this function is never consulted for one. Opening a RaceGOW track on a 5
 * inch shows you a RaceGOW track.
 */
const SHELL_SETTINGS_KEY = 'webfpv.settings.v3';
const WHOOP_AIRFRAME_ID = 'whoop65';

export function newTrackClass() {
  try {
    const wanted = new URLSearchParams(window.location.search).get('class');
    if (wanted === 'micro' || wanted === 'full') {
      return wanted;
    }
  } catch (e) {
    /* No URL to read. Fall through. */
  }
  try {
    const raw = localStorage.getItem(SHELL_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.airframe === WHOOP_AIRFRAME_ID) {
        return 'micro';
      }
    }
  } catch (e) {
    /* Private mode, or a blob that is not JSON. Fall through. */
  }
  return 'full';
}

export class App {
  constructor(nodes) {
    /* The builder is the simulator's tab, not a tab of its own: the shell
     * navigates here in place and Back to the simulator navigates back.
     * Claiming the same name keeps the board's Fly this track landing on
     * this tab rather than opening a second simulator beside it. */
    claimWindowName(SIM_WINDOW);
    this.nodes = nodes;
    this.doc = createTrack(undefined, newTrackClass());
    this.selection = new Set();
    this.armed = null;
    /* Which of the course's logos an armed ground decal will wear. Set only
     * by armGroundLogo, cleared by everything else that touches `armed`. */
    this.armedLogoId = '';
    this.mode = '2d';
    this.pathVisible = false;
    this.path = null;
    this.warnings = [];
    this.history = new History();
    this.autosaver = makeAutosaver();
    this.drawQueued = false;

    this.view2d = new View2D(nodes.canvas2d, this);
    this.view3d = new View3D(nodes.canvas3d, this);
    this.panels = new Panels(this, nodes);

    this.restore();
    /* The palette is the RESTORED document's class, not the default. Panels
     * builds one in its constructor because it must have something before a
     * document exists, and restore() runs after that, so a reopened RaceGOW
     * session was coming back with a field's tools over a room. */
    this.panels.buildPalette(trackClassOf(this.doc));
    this.buildTopBar();
    this.bindKeys();
    this.bindResize();
    this.bindModalBackdrop();

    this.view2d.resize();
    this.view2d.frameField();
    this.view3d.frameField();
    this.refresh();
  }

  /* ---------------- lifecycle ---------------- */

  restore() {
    /* Start new map is chosen in the simulator before this page loads, so
     * the autosave must not come back as the canvas they asked to leave. */
    const intent = readBuilderIntent();
    if (intent && intent.kind === 'new') {
      this.doc = createTrack(undefined, newTrackClass());
      return;
    }
    const saved = readAutosave();
    if (saved && saved.doc) {
      this.doc = saved.doc;
      /* Same upgrade every other entry point runs. An autosave written
       * before stacked figures existed came back without one, so a reopened
       * session flew a stack differently from the file it was saved to. */
      upgradeStackedFigures(this.doc);
      applyAutoFaces(this.doc);
      if (saved.repairs.length) {
        this.toast(str('app.recovered_the_working_track_thing_needed', { length: saved.repairs.length, v2: saved.repairs.length === 1 ? '' : 's' }));
      }
      return;
    }
    this.doc = createTrack(undefined, newTrackClass());
  }

  async adoptIncomingShare() {
    try {
      const intent = takeBuilderIntent();
      if (intent && intent.kind === 'new') {
        clearShareImport();
        this.loadDocument(createTrack(undefined, newTrackClass()), str('app.new_map'));
        return;
      }
      let share = readShareImport();
      const params = new URLSearchParams(window.location.search);
      if (params.get('share')) {
        try {
          share = await adoptShareFromLocation();
        } catch (e) {
          this.toast(str('app.could_not_open_that_published_track', { v1: e.message || e }));
          return;
        }
      }
      if (!share || !share.document) {
        share = readShareImport() || share;
      }
      if (!share || !share.document) {
        return;
      }
      const owned = Boolean(readEditKey(share.id));
      const fromBoard = Boolean(params.get('share'));
      const wantRemix = (intent && intent.kind === 'remix') || (!owned && fromBoard);
      const wantEdit = owned && (fromBoard || (intent && intent.kind === 'edit'));
      if (!wantRemix && !wantEdit) {
        return;
      }
      const incoming = normalize(share.document).doc;
      if (wantEdit) {
        const load = () => {
          this.loadDocument(incoming, str('app.editing_on_the_board', { name: incoming.name }));
        };
        if (!isEmptyCanvas(this.doc) && this.doc.id !== incoming.id) {
          this.confirm(
            str('app.replace_the_track_on_the_canvas'),
            str('app.your_current_canvas_will_be_replaced'),
            load,
          );
        } else {
          load();
        }
        return;
      }
      const { copy, commit } = forkDocument(incoming, {
        sourceId: share.id,
        sourceName: share.name || incoming.name,
        sourceAuthor: share.author || '',
        board: share.board || boardOrigin(),
      });
      const load = () => {
        /* Committed HERE, not in forkDocument: the confirm below can be
         * declined, and a bind for a copy the author never opened is a
         * course this browser claims to own and has never seen. */
        commit();
        clearShareImport();
        this.loadDocument(copy, str('app.this_is_your_copy_of_publish', { v1: share.name || incoming.name }));
      };
      if (!isEmptyCanvas(this.doc) && this.doc.id !== share.id) {
        this.confirm(
          str('app.open_a_copy_of', { v1: share.name || incoming.name }),
          str('app.the_track_on_your_canvas_will'),
          load,
        );
      } else {
        load();
      }
    } finally {
      this.syncBoardIdentity();
    }
  }

  syncBoardIdentity() {
    syncOwnedIdentity().catch(() => {
      /* The board can stay a step behind until they save the name again. */
    });
  }

  bindResize() {
    const onResize = () => {
      this.view2d.resize();
      this.view3d.resize();
      this.requestDraw();
      this.panels.renderResults();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', () => this.autosaver.flush());
  }

  /* ---------------- the one door ---------------- */

  /*
   * Run a mutation as one undoable step. `mutate` gets the live document and
   * changes it in place.
   */
  edit(label, mutate) {
    const before = deepClone(this.doc);
    mutate(this.doc);
    this.settle();
    this.history.record(before, this.doc, label);
    this.refresh();
  }

  /* Gesture form of the same thing, for drags: begin, many mutations, end. */
  beginEdit(label) {
    this.history.begin(this.doc, label);
  }

  endEdit() {
    this.settle();
    this.history.commit(this.doc);
    this.refresh();
  }

  cancelEdit() {
    this.history.cancel();
    this.refresh();
  }

  /* Everything that has to be true after any change, in the order it has to
   * be true in: apertures first, because a face cannot be derived for a
   * level that no longer exists. */
  settle() {
    clampSequenceToApertures(this.doc);
    applyAutoFaces(this.doc);
    touch(this.doc);
  }

  refresh() {
    /*
     * DERIVE ALWAYS, DRAW ON REQUEST. The line used to be built only while
     * it was being drawn, so the length, the tightest radius, the elevation
     * profile and every warning sat behind a button: an author had to press
     * Create Path to find out whether the course they had just built was
     * valid, and nothing told them there was anything to find out. Deriving
     * is what tells them, so it happens on every edit. pathVisible now means
     * only what it says, whether the line is painted on the canvas.
     */
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
    this.autosaver.schedule(this.doc);
  }

  rebuildPath() {
    this.path = buildPath(this.doc);
    this.warnings = sortWarnings(collectWarnings(this.doc, this.path));
  }

  requestDraw() {
    if (this.drawQueued) {
      return;
    }
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      if (this.mode === '2d') {
        this.view2d.draw();
      } else {
        this.view3d.draw();
      }
    });
  }

  /* ---------------- selection ---------------- */

  setSelection(ids, additive = false) {
    if (!additive) {
      this.selection = new Set(ids);
    } else {
      for (const id of ids) {
        this.selection.add(id);
      }
    }
    this.panels.renderAll();
    this.requestDraw();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }
    this.panels.renderAll();
    this.requestDraw();
  }

  selectionCentroid() {
    const ids = [...this.selection];
    if (!ids.length) {
      return null;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    for (const id of ids) {
      const e = elementById(this.doc, id);
      if (e) {
        x += e.position.x;
        y += e.position.y;
        z += e.position.z;
        n += 1;
      }
    }
    return n ? { x: x / n, y: y / n, z: z / n } : null;
  }

  /* Both views centre on the same thing, which is what makes the 2D and 3D
   * toggle feel like one tool rather than two. */
  focusSelection() {
    const c = this.selectionCentroid();
    if (!c) {
      return;
    }
    this.view2d.centerOn(c);
    this.view3d.focusDoc(c, Math.max(12, this.view3d.orbit.radius * 0.6));
    this.requestDraw();
  }

  focusWarning(w) {
    if (w.elementId) {
      this.setSelection([w.elementId]);
      this.focusSelection();
      return;
    }
    if (w.seqId) {
      const seq = this.doc.sequence.find((s) => s.id === w.seqId);
      if (seq) {
        this.setSelection([seq.elementId]);
        this.focusSelection();
      }
    }
  }

  /* ---------------- placement ---------------- */

  arm(typeId) {
    this.armed = this.armed === typeId ? null : typeId;
    /* A tool armed from the palette carries no logo with it. The decal it
     * places falls back to the course's first logo, which is what
     * createElement has always done. */
    this.armedLogoId = '';
    this.panels.renderPalette();
    this.requestDraw();
  }

  /*
   * Arm the ground decal with a logo already chosen, which is what the
   * Sponsor logos dialog's Paint on the grass button does.
   *
   * A separate entry point rather than an argument to arm(), because arm()
   * TOGGLES: pressing Paint on the grass on two logos in a row would have
   * disarmed the tool on the second press, and the author plainly wants to
   * paint the second one.
   */
  armGroundLogo(logoId) {
    this.armed = 'groundLogo';
    this.armedLogoId = typeof logoId === 'string' ? logoId : '';
    this.panels.renderPalette();
    this.requestDraw();
    this.toast(str('app.click_the_field_where_the_paint'));
  }

  disarm() {
    this.armed = null;
    this.armedLogoId = '';
    this.panels.renderPalette();
    this.requestDraw();
  }

  snap(world, offGrid) {
    if (offGrid) {
      return { x: world.x, y: world.y, z: 0 };
    }
    const g = this.doc.field.gridSize;
    return { x: Math.round(world.x / g) * g, y: Math.round(world.y / g) * g, z: 0 };
  }

  placeAt(world) {
    const type = this.armed;
    if (!type) {
      return;
    }
    const def = ELEMENTS[type];

    /* Exactly one set of start pads per track. A second press moves the
     * existing set rather than refusing, because refusing would look like a
     * broken hotkey. */
    if (def.kind === KIND.START) {
      const existing = startPadsOf(this.doc);
      if (existing) {
        this.edit('move start pads', (d) => {
          const e = elementById(d, existing.id);
          e.position.x = world.x;
          e.position.y = world.y;
        });
        this.setSelection([existing.id]);
        this.toast(str('app.a_track_has_one_set_of'));
        return;
      }
    }

    let newId = null;
    this.edit(`place ${def.label}`, (d) => {
      const yaw = def.kind === KIND.ANNOTATION ? 0 : defaultYawFor(d, world);
      const element = createElement(d, type, world, yaw);
      /* The logo the Sponsor logos dialog armed this with, if it armed it.
       * createElement has already put the course's first logo on a decal, so
       * this only overrides, and only for a logo that is still on the
       * course: removing one between arming and clicking is a real order of
       * events and it must not write a dangling id. */
      if (def.kind === KIND.DECAL && this.armedLogoId
        && logosOf(d).some((l) => l.id === this.armedLogoId)) {
        element.logoId = this.armedLogoId;
      }
      d.elements.push(element);
      newId = element.id;
      if (isSequenceable(element)) {
        addToSequence(d, element.id, 0);
        const fig = defaultFigure(element);
        if (fig !== 'single') {
          applyFigure(d, element.id, fig);
        }
      }
    });
    if (newId) {
      this.setSelection([newId]);
      const placed = elementById(this.doc, newId);
      if (placed && aperturesOf(placed).length > 1) {
        if (!this.pathVisible) {
          this.togglePath();
        }
        this.toast(str('app.each_hole_is_its_own_gate'));
      }
    }
  }

  moveSelected(origin, delta) {
    for (const [id, from] of origin) {
      const element = elementById(this.doc, id);
      if (element) {
        element.position.x = from.x + delta.x;
        element.position.y = from.y + delta.y;
      }
    }
    applyAutoFaces(this.doc);
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.requestDraw();
    this.panels.renderInspector();
  }

  rotateSelected(yaw) {
    for (const id of this.selection) {
      /* setYaw, not the two fields by hand: turning a gate has to pin which
       * way its passes are flown as well as which way it points, or the
       * auto rule takes the direction back the moment the drag ends. */
      setYaw(this.doc, id, yaw);
    }
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* The one edit the 3D view is allowed to make. */
  raiseSelected(origin, dz, fine) {
    for (const [id, fromZ] of origin) {
      const element = elementById(this.doc, id);
      if (!element) {
        continue;
      }
      const wanted = Math.max(0, fromZ + dz);
      element.position.z = fine ? wanted : Math.round(wanted * 4) / 4;
    }
    applyAutoFaces(this.doc);
    if (this.pathVisible) {
      this.rebuildPath();
    }
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  deleteSelection() {
    if (!this.selection.size) {
      return;
    }
    const ids = [...this.selection];
    this.edit(`delete ${ids.length}`, (d) => {
      for (const id of ids) {
        removeElement(d, id);
      }
    });
    this.selection.clear();
    this.panels.renderAll();
  }

  onHoverWorld(world) {
    if (!this.nodes.readout || !world) {
      return;
    }
    this.nodes.readout.textContent = str('app.m', { v1: world.x.toFixed(2), v2: world.y.toFixed(2) });
  }

  /* ---------------- faces and sequence ---------------- */

  flipFace(seqId) {
    this.edit('flip face', (d) => { flipFace(d, seqId); });
  }

  /* The keyboard shortcut works on whatever the selection's first sequence
   * entry is, which is what a user means by "flip that gate". */
  flipSelectedFace() {
    for (const id of this.selection) {
      const seq = this.doc.sequence.find((s) => s.elementId === id);
      if (seq) {
        this.flipFace(seq.id);
        return;
      }
    }
  }

  clearOverride(seqId) {
    this.edit('re-derive face', (d) => { clearOverride(d, seqId); });
  }

  addToSequence(elementId) {
    this.edit(str('app.add_to_the_track'), (d) => { addToSequence(d, elementId, 0); });
  }

  addLevel(elementId) {
    this.edit('fly another level', (d) => { addNextLevel(d, elementId); });
  }

  applyFigure(elementId, figureId) {
    this.edit(`fly ${figureId}`, (d) => { applyFigure(d, elementId, figureId); });
    if (figureId !== 'single' && !this.pathVisible) {
      this.togglePath();
    }
  }

  removeSequenceEntry(seqId) {
    this.edit(str('app.remove_from_the_track'), (d) => { removeFromSequence(d, seqId); });
  }

  setSequenceAperture(seqId, index) {
    this.edit('change level', (d) => { setApertureIndex(d, seqId, index); });
  }

  reorder(from, to) {
    this.edit('reorder', (d) => { moveInSequence(d, from, to); });
  }

  /* ---------------- path ---------------- */

  createPath() {
    this.pathVisible = true;
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  togglePath() {
    if (!this.pathVisible) {
      this.createPath();
      return;
    }
    /* renderAll and updateTopBar, the same pair createPath calls. Only the
     * palette was refreshed, so the top bar's button stayed lit while the
     * line was gone. */
    /* The path stays derived. Only the paint goes away, so the Results
     * panel keeps reporting on the course either way. */
    this.pathVisible = false;
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* ---------------- views ---------------- */

  setMode(mode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.nodes.canvas2d.hidden = mode !== '2d';
    this.nodes.canvas3d.hidden = mode !== '3d';
    /* Three.js arrives on the first press of the 3D button, so this settles
     * later and can fail. The 2D view carries on either way; see the header
     * of view3d.js for why the preview is not allowed to be load bearing. */
    this.view3d.setEnabled(mode === '3d').then((ok) => {
      if (!ok) {
        this.toast(str('app.the_3d_preview_could_not_load', { loadError: this.view3d.loadError }));
        this.setMode('2d');
      }
    });
    if (mode === '2d') {
      this.view2d.resize();
    }
    /* Selection survives the switch, and so does what the camera is looking
     * at. */
    const c = this.selectionCentroid();
    if (c) {
      this.focusSelection();
    }
    this.updateTopBar();
    this.requestDraw();
  }

  frameAll() {
    if (this.mode === '2d') {
      this.view2d.frameField();
    } else {
      this.view3d.frameField();
    }
    this.requestDraw();
  }

  /* ---------------- documents ---------------- */

  loadDocument(doc, message) {
    this.doc = doc;
    /* The palette is the track class's, so it is rebuilt whenever a document
     * arrives rather than once at boot. A RaceGOW room and a sixty metre
     * field are not made of the same parts. */
    this.panels.buildPalette(trackClassOf(this.doc));
    /*
     * THE DOCUMENT GOVERNS THE CLASS, not only the toggle. A room opened from
     * the library, from a board link or as a remix on a five inch builder
     * drew the whoop palette and filed its autosave in the whoop seat, but
     * left the shell seated on the five inch, so Fly this track opened a
     * simulator reading the five inch's seat and the room was not in it.
     * Loading a document of the other class IS choosing that class.
     */
    setActiveTrackClass(trackClassOf(this.doc));
    upgradeStackedFigures(this.doc);
    applyAutoFaces(this.doc);
    this.selection.clear();
    this.history.reset();
    this.path = null;
    this.warnings = [];
    this.pathVisible = false;
    writeAutosave(this.doc);
    this.view2d.frameField();
    this.view3d.frameField();
    this.view3d.markDirty();
    this.refresh();
    if (message) {
      this.toast(message);
    }
  }

  newTrack() {
    this.confirm(str('app.start_a_new_track'), str('app.anything_unsaved_in_the_current_one'), () => {
      this.loadDocument(createTrack(undefined, newTrackClass()), str('app.new_track'));
    });
  }

  save() {
    const ok = saveTrack(this.doc);
    this.toast(ok ? str('app.saved', { name: this.doc.name }) : str('app.could_not_save_local_storage_is'));
    this.updateTopBar();
  }

  duplicate() {
    const copy = duplicateTrack(this.doc);
    saveTrack(copy);
    this.loadDocument(copy, str('app.duplicated_as', { name: copy.name }));
  }

  /* The bar's Delete. Named apart from removeCurrent so the confirm cannot
   * be skipped by a caller reaching for the shorter name. */
  confirmRemove() {
    this.removeCurrent();
  }

  toggleMore() {
    if (!this.moreMenu) {
      return;
    }
    this.moreMenu.hidden = !this.moreMenu.hidden;
    this.moreBtn.classList.toggle('on', !this.moreMenu.hidden);
  }

  closeMore() {
    if (!this.moreMenu || this.moreMenu.hidden) {
      return;
    }
    this.moreMenu.hidden = true;
    this.moreBtn.classList.remove('on');
  }

  removeCurrent() {
    this.confirm(str('app.delete', { name: this.doc.name }), str('app.it_is_removed_from_the_saved'), () => {
      deleteTrack(this.doc.id);
      this.loadDocument(createTrack(undefined, newTrackClass()), 'Deleted.');
    });
  }

  openLoad() {
    const tracks = listTracks(trackClassOf(this.doc));
    const body = document.createElement('div');
    if (!tracks.length) {
      const p = document.createElement('p');
      p.className = 'tb-help';
      p.textContent = str('app.nothing_saved_yet_save_the_current');
      body.append(p);
    }
    for (const t of tracks) {
      const row = document.createElement('div');
      row.className = 'tb-load-row';
      const name = document.createElement('div');
      name.className = 'tb-load-name';
      name.textContent = t.name;
      const meta = document.createElement('div');
      meta.className = 'tb-load-meta';
      meta.textContent = t.preset
        ? str('app.in_the_order', { mix: t.mix, sequence: t.sequence })
        : str('app.in_the_order_changed', { mix: t.mix, sequence: t.sequence, modifiedUtc: t.modifiedUtc });
      name.append(meta);
      /*
       * WHOSE TRACK THIS IS, on the row.
       *
       * A pilot's own tracks carry no credit and get no byline. A track
       * that came from somewhere else does, and keeps it when the pilot
       * saves their own copy, because saving a layout does not make it
       * yours: the DESIGNER is named rather than the series or whoever
       * imported it, because those are three different people and only one
       * of them drew it. textContent, never innerHTML: a credit is data and
       * one day it may not be ours.
       */
      if (t.credit) {
        const by = document.createElement('div');
        by.className = 'tb-load-meta';
        const bits = [];
        if (t.credit.designer) bits.push(str('ui.by', { designer: t.credit.designer }));
        if (t.credit.series) bits.push(t.credit.series);
        if (t.credit.sponsor) bits.push(str('app.sponsored_by', { sponsor: t.credit.sponsor }));
        by.textContent = bits.join(', ');
        name.append(by);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'tb-btn';
      open.textContent = str('app.open');
      open.addEventListener('click', () => {
        const found = loadTrack(t.id);
        this.closeModal();
        if (found) {
          this.loadDocument(found.doc, str('app.opened', { name: found.doc.name }));
        }
      });
      /* No Delete on a shipped track. There is nothing to delete: it is
       * not in the library until the pilot saves their own copy, and a
       * button that does nothing is worse than no button. */
      if (t.preset) {
        row.append(name, open);
      } else {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb-btn tb-danger';
        del.textContent = 'Delete';
        del.addEventListener('click', () => {
          deleteTrack(t.id);
          this.closeModal();
          this.openLoad();
        });
        row.append(name, open, del);
      }
      body.append(row);
    }
    this.modal(str('app.saved_tracks'), body);
  }

  exportFile() {
    downloadTrack(this.doc);
    this.toast('Exported.');
  }

  /*
   * A looping animation of one lap, as a file the pilot can post.
   *
   * The render is minutes of work on a slow machine and seconds on a fast
   * one, so it is behind its own button inside a modal rather than on the
   * menu item: pressing Export animation should open something that explains
   * what is about to happen, not lock the page up for a minute.
   *
   * Three.js and the exporter are imported here and not at the top of the
   * file, the same way view3d.js loads Three, so a pilot who never asks for
   * an animation never pays for the code or for the CDN being up.
   */
  async exportAnimation() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || str('ui.untitled_track');
    }
    /* One element is not a lap, which is the same rule the racing line
     * itself applies, so the refusal says the same thing. */
    if (this.doc.sequence.length < 2) {
      this.toast(str('app.an_animation_needs_at_least_two'));
      return;
    }

    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    /* No duration named any more, because there is no one duration: the
     * quad flies a steady pace and a longer lap simply takes longer to go
     * round. See LAP_SPEED in stage.js. */
    help.textContent = str('app.one_lap_of_the_racing_line')
      + str('app.same_pace_whatever_the_track_so')
      + str('app.it_comes_out_around_1_to')
      + str('app.or_so_and_this_tab_has');
    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(help, status);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'tb-btn tb-primary';
    go.textContent = str('app.render_the_animation');
    go.addEventListener('click', async () => {
      go.disabled = true;
      status.textContent = str('app.loading_the_renderer');
      try {
        const { exportTrackGif } = await import('./animate.js');
        const bytes = await exportTrackGif(this.doc, {
          onProgress: (done, total) => {
            status.textContent = str('app.frame_of', { done, total });
          },
        });
        downloadBlob(bytes, animationFilename(this.doc), 'image/gif');
        const mb = (bytes.length / 1e6).toFixed(2);
        status.textContent = str('app.done_mb_saved_as', { mb, animationFilename: animationFilename(this.doc) });
        go.textContent = str('app.render_it_again');
        go.disabled = false;
      } catch (e) {
        status.textContent = e && e.message ? e.message : String(e);
        go.disabled = false;
      }
    });
    body.append(go);
    this.modal(str('app.export_animation'), body);
  }

  /*
   * The card animation, rendered and sent after a room is published. The
   * rendering and the sending are in src/share/cardgif.js, because the
   * simulator's own Publish does the same thing and the two must not
   * differ. What is here is what to say while it happens.
   *
   * It is sixty frames rather than the export button's three hundred, so it
   * is three or four seconds on real hardware rather than a minute. The
   * author is looking at a dialog that has just said Published, so the wait
   * is paid for by a sentence rather than by a spinner.
   */
  async renderCardForBoard(origin, status) {
    const was = status.textContent;
    const done = await sendCardAnimation(this.doc, {
      origin,
      onProgress: (n, total) => {
        status.textContent = str('app.drawing_its_card_frame_of', { was, n, total });
      },
    });
    if (done.skipped) {
      return;
    }
    /* Said plainly, and said as what it is: the track went up, the picture
     * did not. */
    status.textContent = done.error
      ? str('app.the_track_is_up_but_its', { was, error: done.error })
      : str('app.its_card_on_the_board_is', { was });
  }

  /*
   * Put this course on the public board. The document goes as it is, logo
   * included, so every gate and every flag on the board copy wears the
   * same print the author sees here.
   *
   * Three shapes of this dialog, because they are three different promises:
   * a first publish, an update of a listing this browser owns, and a copy
   * of someone else's course under a new name.
   */
  listingOfCanvas() {
    return inspectCourse({
      share: null,
      autosave: { doc: this.doc },
    });
  }

  openPublish() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || str('ui.untitled_track');
    }
    if (!this.doc.sequence.length) {
      this.toast(str('app.a_published_track_needs_at_least'));
      return;
    }
    this.autosaver.flush();
    const listing = this.listingOfCanvas();
    const remix = listing.kind === 'remix';
    const owned = listing.kind === 'owned';
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    if (remix) {
      const of = listing.sourceName ? str('ui.of', { sourceName: listing.sourceName }) : '';
      const by = listing.sourceAuthor ? str('ui.by_3', { sourceAuthor: listing.sourceAuthor }) : '';
      help.textContent = str('app.this_is_your_copy_it_goes', { of, by });
    } else if (owned && listing.layoutDrift) {
      help.textContent = str('app.the_layout_changed_updating_the_board');
    } else if (owned) {
      help.textContent = str('app.this_track_is_already_on_the');
    } else {
      help.textContent = str('app.the_public_board_keeps_a_copy');
    }
    body.append(help);

    const courseField = document.createElement('div');
    courseField.className = 'tb-field';
    const courseLabel = document.createElement('label');
    courseLabel.className = 'tb-field-label';
    courseLabel.textContent = str('main.track_name');
    const courseInput = document.createElement('input');
    courseInput.type = 'text';
    courseInput.maxLength = 80;
    courseInput.value = remix ? suggestRemixName(this.doc.name) : this.doc.name;
    courseField.append(courseLabel, courseInput);
    body.append(courseField);

    const nameField = document.createElement('div');
    nameField.className = 'tb-field';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'tb-field-label';
    nameLabel.textContent = str('ui.your_name');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = readPilotName() || '';
    nameField.append(nameLabel, nameInput);
    body.append(nameField);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);

    /*
     * WHAT THE TRACK IS FOR, which is the one thing about a published track
     * that nothing else on the board can work out.
     *
     * A gate count says how big it is and a plan drawing says what shape it
     * is, and neither says whether it was built to be raced, to practise
     * one thing, or to find out whether an idea works. That is the question
     * a visitor scrolling a board is actually asking, and only the author
     * can answer it.
     *
     * A CLOSED LIST OF BUTTONS, not a text field. Free text would give the
     * board "race", "racing", "Race Track" and "racetrack" as four separate
     * tags and no filter at all. The vocabulary is mirrored from the board
     * in src/share/board.js, and the board refuses an id it does not know
     * rather than dropping it, so a stale builder is told rather than
     * quietly ignored.
     *
     * Seeded from the BIND rather than from the document, because tags are
     * not in the document: see rememberPublish in src/share/listing.js.
     */
    const chosen = new Set(usableTags(publishedTags(this.doc.id)));
    const tagField = document.createElement('div');
    tagField.className = 'tb-field';
    const tagLabelEl = document.createElement('label');
    tagLabelEl.className = 'tb-field-label';
    tagLabelEl.textContent = str('app.what_it_is_for');
    const tagRow = document.createElement('div');
    tagRow.className = 'tb-tags';
    const tagHelp = document.createElement('p');
    tagHelp.className = 'tb-help';
    const sayTags = () => {
      tagHelp.textContent = chosen.size
        ? str('app.people_filter_the_board_by_these', { v1: [...chosen].map(tagLabel).join(', ') })
        : str('app.optional_and_up_to_people_filter', { TRACK_TAGS_MAX });
    };
    for (const tag of TRACK_TAGS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-tag';
      btn.textContent = tag.label;
      btn.title = tag.note;
      btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (chosen.has(tag.id)) {
          chosen.delete(tag.id);
        } else if (chosen.size >= TRACK_TAGS_MAX) {
          /* Refused rather than silently swapping one out, because a
           * control that quietly drops the thing you ticked first is worse
           * than one that says no. */
          tagHelp.textContent = str('app.that_is_already_untick_one_to', { TRACK_TAGS_MAX });
          return;
        } else {
          chosen.add(tag.id);
        }
        btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
        sayTags();
      });
      tagRow.append(btn);
    }
    sayTags();
    tagField.append(tagLabelEl, tagRow);
    body.append(tagField, tagHelp);

    const boardField = document.createElement('div');
    boardField.className = 'tb-field';
    const boardLabel = document.createElement('label');
    boardLabel.className = 'tb-field-label';
    boardLabel.textContent = str('app.board_address');
    const boardInput = document.createElement('input');
    boardInput.type = 'url';
    boardInput.value = boardOrigin();
    boardField.append(boardLabel, boardInput);
    body.append(boardField);

    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? str('main.update_the_board') : (remix ? str('app.publish_as_yours') : str('ui.publish_this_track'));
    send.addEventListener('click', async () => {
      const author = writePilotName(nameInput.value);
      if (!author) {
        status.textContent = nameRules();
        return;
      }
      const courseName = String(courseInput.value || '').trim() || str('ui.untitled_track');
      this.doc.name = courseName;
      if (this.nameInput) {
        this.nameInput.value = courseName;
      }
      const origin = setBoardOrigin(boardInput.value) || boardOrigin();
      send.disabled = true;
      status.textContent = str('app.sending_the_track_logos_included');
      const tags = usableTags([...chosen]);
      const sendDoc = async (doc) => {
        const posted = await publishTrack({
          author,
          document: toPlain(doc),
          editKey: readEditKey(doc.id),
          origin,
          tags,
        });
        /* The bind is where the tags live on this side, so a second publish
         * pre-ticks what the board is already showing rather than untagging
         * the track. See rememberPublish. */
        rememberPublish(toPlain(doc), posted, origin, author, { tags });
        writeAutosave(doc);
        return posted;
      };
      try {
        let posted;
        try {
          posted = await sendDoc(this.doc);
        } catch (e) {
          if (!e || !e.conflict) {
            throw e;
          }
          const { copy, commit } = forkDocument(this.doc, {
            name: courseName,
            board: origin,
            sourceId: this.doc.id,
            sourceName: this.doc.name,
            sourceAuthor: '',
          });
          commit();
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          status.textContent = str('app.this_id_was_already_on_the', { name: posted.name });
        }
        const cleared = posted.timesCleared
          ? str('app.the_flying_layout_changed_so_the')
          : '';
        /* The taken-id notice, whatever language it is in. */
        if (!status.textContent.startsWith(str('app.this_id_was_already_on_the').slice(0, 12))) {
          status.textContent = str('app.published_as', { name: posted.name, cleared });
        }
        this.toast(str('app.published_to_the_board', { name: posted.name }));
        /*
         * A ROOM'S CARD ON THE BOARD IS ITS ANIMATION, SO IT IS RENDERED
         * HERE, NOW.
         *
         * The board renders nothing and never will, so if this browser does
         * not make the picture nothing does. The moment after a publish is
         * the only moment when the document, the edit key and a live WebGL
         * context are all in one place, which is why it is here and not
         * behind a button the author would have to know to press.
         *
         * Only a room. A field track's plan is drawn by the board from the
         * listing for nothing, and the board refuses an animation for one
         * anyway. See inspectGif in the board's src/validate.js.
         */
        await this.renderCardForBoard(origin, status);
        this.updateTopBar();
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        /* The builder's class goes with the link, so an author on the
         * whoop builder lands on the whoop board. */
        open.href = boardPageUrl(origin, trackClassOf(this.doc) === 'micro' ? 'whoop65' : '5inch');
        /* The board's own tab, reused if it is already open. No rel here:
         * noopener would send this to a fresh tab every time. */
        open.target = BOARD_WINDOW;
        open.textContent = str('ui.open_tracks_and_statistics');
        send.replaceWith(open);
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || str('app.the_board_could_not_take_that');
        this.toast(str('app.could_not_publish', { v1: e.message || e }));
      }
    });
    body.append(send);
    this.modal(owned ? str('ui.update_this_track') : (remix ? str('app.publish_as_yours') : str('ui.publish_this_track')), body);
  }

  /* ---------------- the sponsors' logos ---------------- */

  /*
   * The pictures this course is dressed in: up to five of them.
   *
   * A dialog rather than a field in the inspector, and the reason is what
   * they belong to: a logo is a property of the TRACK, not of any element on
   * it, so putting them beside a gate's dimensions would say the opposite.
   * The inspector's Field section is the other candidate and it is where a
   * field width lives, but that panel is only reachable with nothing
   * selected, which is not where somebody who has just placed ten gates is.
   *
   * FIVE SLOTS, NUMBERED, and the numbers are load bearing. Gate 1 wears
   * logo 1, gate 2 logo 2, round and round, so fifteen gates share five
   * sponsors three apiece; the inspector's picker for a painted footprint
   * counts in the same numbers; and the line under the list says what that
   * works out as for THIS course rather than leaving an author to divide.
   *
   * THE PREVIEWS ARE THE POINT OF THE DIALOG. Uploading an image and then
   * having to load a world to find out it came out square, or too small to
   * read, or half off the board, is the version of this feature nobody would
   * use twice. Each slot shows the gate header it lands on and the grass it
   * lands on, because those are two different shapes and a logo can suit one
   * and not the other.
   *
   * PAINT ON THE GRASS IS A BUTTON HERE, and it is here because it was
   * nowhere. Putting a logo on the turf meant knowing that the palette's
   * Ground logo was the thing that did it, which is a name you only
   * recognise once somebody has told you. The grass preview sitting in this
   * dialog beside every logo made that worse rather than better: it showed
   * an author what paint would look like and then left them no way to ask
   * for any. The button arms the same palette tool with this logo already
   * chosen, so the next click on the field is the decal.
   */
  openLogo() {
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = str('app.up_to_five_sponsors_logos_they');
    body.append(help);

    const list = document.createElement('div');
    body.append(list);

    const summary = document.createElement('p');
    summary.className = 'tb-help';
    body.append(summary);

    /* One image element per data URL, reused across redraws, so repainting
     * the list after a change does not start five fresh decodes. */
    const images = new Map();
    const imageFor = (url, onLoad) => {
      let img = images.get(url);
      if (!img) {
        img = new Image();
        images.set(url, img);
        img.addEventListener('load', onLoad);
        img.src = url;
        return img;
      }
      /* Already asked for, but not decoded yet, and this redraw's canvases
       * still need telling. Two slots holding the same file is the case: one
       * decode, two previews waiting on it. */
      if (!img.complete) {
        img.addEventListener('load', onLoad);
      }
      return img;
    };

    /* One file input, pointed at whichever slot asked for it. Five inputs
     * would be five change handlers disagreeing about which slot they are. */
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    file.style.display = 'none';
    let target = -1;
    body.append(file);

    const redraw = () => {
      list.textContent = '';
      const logos = logosOf(this.doc);
      const spent = brandingBytes(this.doc);
      for (let i = 0; i < LOGO_SLOTS; i += 1) {
        const mark = logos[i] ?? null;
        const row = document.createElement('div');
        row.className = mark ? 'tb-slot' : 'tb-slot empty';
        const num = document.createElement('span');
        num.className = 'tb-num';
        num.textContent = String(i + 1);
        const slot = document.createElement('div');
        slot.className = 'tb-slot-body';
        row.append(num, slot);
        /*
         * In the document BEFORE anything is painted into it. Both preview
         * painters size their bitmap from the canvas's clientWidth, and a
         * canvas that is not laid out yet reports zero: the previews came
         * out at the fallback width and were then stretched by the CSS,
         * which is a blurry picture of somebody's logo in the one dialog
         * whose whole job is showing it sharply.
         */
        list.append(row);

        if (!mark) {
          const note = document.createElement('p');
          note.className = 'tb-help';
          note.textContent = i === logos.length
            ? str('app.empty_add_a_logo_here_and')
            : 'Empty.';
          slot.append(note);
          if (i === logos.length) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'tb-btn';
            add.textContent = str('app.add_a_logo');
            add.addEventListener('click', () => { target = i; file.click(); });
            const btns = document.createElement('div');
            btns.className = 'tb-row-btns';
            btns.append(add);
            slot.append(btns);
          }
          continue;
        }

        /* The two places a logo lands, side by side, because they are two
         * different shapes: a long strip on the gate's header board and a
         * rectangle on the grass. A logo can suit one and not the other. */
        const arts = document.createElement('div');
        arts.className = 'tb-slot-arts';
        const board = document.createElement('canvas');
        board.className = 'tb-logo-preview slot';
        const grass = document.createElement('canvas');
        grass.className = 'tb-ground-preview';
        arts.append(board, grass);
        slot.append(arts);
        /* The grass preview is drawn at the footprint a Ground logo is
         * PLACED with, from the element library, so what an author judges
         * here is the box they will actually get. */
        const foot = ELEMENTS.groundLogo.dims;
        const draw = () => {
          drawBannerPreview(board, mark.image, img);
          drawGroundPreview(grass, img, foot.width, foot.depth);
        };
        const img = imageFor(mark.image, draw);
        draw();

        const caption = document.createElement('p');
        caption.className = 'tb-help';
        caption.textContent = str('app.kb_stored_in_the_track', { v1: mark.name || str('app.logo', { v1: i + 1 }), v2: Math.round(mark.image.length / 1024) });
        slot.append(caption);

        const btns = document.createElement('div');
        btns.className = 'tb-row-btns';
        const swap = document.createElement('button');
        swap.type = 'button';
        swap.className = 'tb-btn';
        swap.textContent = str('app.replace');
        swap.addEventListener('click', () => { target = i; file.click(); });
        /*
         * The one route from a logo to paint on the field. It arms the
         * palette's Ground logo with THIS slot's id and shuts the dialog,
         * because a modal over the canvas cannot be clicked through and the
         * next thing an author has to do is click the canvas.
         */
        const paint = document.createElement('button');
        paint.type = 'button';
        paint.className = 'tb-btn';
        paint.textContent = str('app.paint_on_the_grass');
        paint.title = str('app.put_this_logo_on_the_turf');
        paint.addEventListener('click', () => {
          this.armGroundLogo(mark.id);
          this.closeModal();
        });
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'tb-btn tb-danger';
        drop.textContent = str('app.remove');
        drop.addEventListener('click', () => {
          this.edit('remove logo', (d) => {
            d.branding.logos.splice(i, 1);
          });
          redraw();
          this.toast(str('app.logo_removed_any_grass_painted_with'));
        });
        btns.append(swap, paint, drop);
        slot.append(btns);
      }

      /*
       * What the list works out to on THIS course, which is the question an
       * author actually has: not "how many logos are there" but "how many
       * gates does each sponsor get".
       */
      const gates = dressOrder(this.doc).size;
      const n = logos.length;
      const left = Math.max(0, BRANDING_MAX_CHARS - spent);
      const budget = str('app.kb_of_kb_used_kb_left', { v1: Math.round(spent / 1024), v2: Math.round(BRANDING_MAX_CHARS / 1024), v3: Math.round(left / 1024) });
      if (!n) {
        summary.textContent = str('app.no_logos_yet_the_gates_carry', { budget });
      } else if (!gates) {
        summary.textContent = str('app.nothing_is_in_the_flying_order', { budget });
      } else {
        const base = Math.floor(gates / n);
        const extra = gates % n;
        const share = extra === 0
          ? `${base} gate${base === 1 ? '' : 's'} each`
          : str('app.gates_for_the_first_for_the', { v1: base + 1, extra, base });
        summary.textContent = str('app.gate_in_the_flying_order_logo', { gates, v2: gates === 1 ? '' : 's', n, v4: n === 1 ? '' : 's', share, budget });
      }
    };

    file.addEventListener('change', async () => {
      const chosen = file.files[0];
      const slot = target;
      file.value = '';
      target = -1;
      if (!chosen || slot < 0) {
        return;
      }
      const logos = logosOf(this.doc);
      /* Replacing a slot gets its own bytes back before it is asked to fit,
       * so swapping a 90 kB logo for another 90 kB logo is never refused for
       * a budget the logo it is replacing was spending. */
      const freed = logos[slot] ? logos[slot].image.length : 0;
      const budget = BRANDING_MAX_CHARS - brandingBytes(this.doc) + freed;
      try {
        const logo = await normaliseLogo(chosen, budget);
        this.edit(logos[slot] ? 'replace logo' : 'add logo', (d) => {
          const list2 = d.branding.logos;
          if (list2[slot]) {
            /* The id survives a replacement, so a footprint painted on the
             * grass keeps pointing at this slot rather than going blank
             * because the sponsor sent a new file. */
            list2[slot].image = logo.dataUrl;
            list2[slot].name = logo.name;
          } else {
            list2.push({ id: newLogoId(d), image: logo.dataUrl, name: logo.name });
          }
        });
        redraw();
        this.toast(str('app.logo_set_from_by', { v1: slot + 1, name: logo.name, width: logo.width, height: logo.height }));
      } catch (e) {
        this.toast(str('app.could_not_use_that_image', { message: e.message }));
      }
    });

    this.modal(str('app.sponsor_logos'), body);
    redraw();
  }

  async importFile(file) {
    if (!file) {
      return;
    }
    try {
      const text = await readFileText(file);
      const { doc, repairs, error } = deserialize(text);
      if (error) {
        this.toast(str('app.could_not_import', { error }));
        return;
      }
      this.loadDocument(doc, repairs.length
        ? str('app.imported_with_repair', { name: doc.name, length: repairs.length, v3: repairs.length === 1 ? '' : 's', v4: repairs[0] })
        : str('app.imported', { name: doc.name }));
    } catch (e) {
      this.toast(str('app.could_not_read_the_file', { message: e.message }));
    }
  }

  undo() {
    const doc = this.history.undo(this.doc);
    if (!doc) {
      this.toast(str('app.nothing_to_undo'));
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  redo() {
    const doc = this.history.redo(this.doc);
    if (!doc) {
      this.toast(str('app.nothing_to_redo'));
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  pruneSelection() {
    for (const id of [...this.selection]) {
      if (!elementById(this.doc, id)) {
        this.selection.delete(id);
      }
    }
  }

  /* ---------------- chrome ---------------- */

  /*
   * MOVE THE WHOLE PRODUCT TO A CLASS.
   *
   * Nothing is converted and nothing is lost. Each class has its own canvas,
   * so this puts the current one away, seats the aircraft that flies the
   * other, and opens whatever was left there, or a blank track of that class
   * on a first visit.
   *
   * Converting was the alternative and it is worse in both directions: a 5 ft
   * gate scaled to 28 inches is not a RaceGOW gate, it is a MultiGP gate
   * somebody shrank, and a room's layout stretched onto sixty metres is a
   * track nobody designed. Two canvases is what an author actually has.
   */
  setTrackClass(cls) {
    const want = cls === 'micro' ? 'micro' : 'full';
    if (trackClassOf(this.doc) === want) {
      return;
    }
    /* The canvas being left is written NOW rather than on the debounce, so
     * the last few seconds of editing are still there on the way back. */
    this.autosaver.flush();
    setActiveTrackClass(want);
    /* readAutosave hands back { doc, repairs }, not a document: every other
     * caller in this project reads `.doc` off it and the first version of
     * this one did not, which threw inside loadDocument on the first press
     * of the toggle. */
    const held = readAutosave(want);
    const doc = (held && held.doc) || createTrack(undefined, want);
    this.loadDocument(doc, held && held.doc
      ? str('app.back_on_the_builder_holding', { v1: want === 'micro' ? 'whoop' : 'five inch', name: doc.name })
      : str('app.a_new', { v1: want === 'micro' ? str('app.whoop_track_in_a_ten_by') : str('app.five_inch_track_on_a_sixty') }));
  }

  buildTopBar() {
    const bar = this.nodes.topbar;
    bar.textContent = '';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'tb-name';
    name.value = this.doc.name;
    name.dataset.tbkey = 'track-name';
    name.addEventListener('change', () => {
      this.edit('rename track', (d) => { d.name = name.value || str('ui.untitled_track'); });
      this.syncNameIfOwned();
    });
    this.nameInput = name;

    const group = (...kids) => {
      const g = document.createElement('div');
      g.className = 'tb-bargroup';
      g.append(...kids);
      return g;
    };
    const btn = (label, onClick, title, cls = 'tb-btn') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      if (title) {
        b.title = title;
      }
      b.addEventListener('click', onClick);
      return b;
    };

    this.undoBtn = btn('Undo', () => this.undo(), str('app.control_z'));
    this.redoBtn = btn('Redo', () => this.redo(), str('app.control_shift_z'));
    this.mode2d = btn('2D', () => this.setMode('2d'), str('app.top_down_authoring_view'));
    this.mode3d = btn('3D', () => this.setMode('3d'), str('app.preview_drag_an_element_to_change'));
    /* Plain, not primary. There is one green button on this bar and it is
     * the one that leaves for the air; a second would make neither read as
     * the thing to press. Show line goes amber while a line is showing,
     * which is the state that matters. */
    /* The line is derived on every edit now, so this only paints it. */
    this.pathBtn = btn(str('app.show_line'), () => this.togglePath(), str('app.draw_the_racing_line_on_the'));

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      this.importFile(file.files[0]);
      file.value = '';
    });
    this.fileInput = file;

    /*
     * The whole point of the tool, in one button. It flushes the autosave
     * first and then links to the game with the map named in the URL, so the
     * course on this canvas is the course in the air a moment later. The
     * autosave is what the game reads, not a saved track, because asking
     * somebody to remember to press Save before they fly is asking them to
     * fly the wrong track once.
     */
    this.flyBtn = btn(str('ui.fly_this_track'), () => this.flyThisTrack(), str('app.build_the_world_around_this_track'), 'tb-btn tb-primary');
    this.publishBtn = btn('Publish', () => this.openPublish(), str('app.put_this_track_on_the_public'));
    this.listingChip = document.createElement('span');
    this.listingChip.className = 'tb-listing';

    const back = document.createElement('a');
    back.className = 'tb-btn tb-quiet';
    back.href = '../../index.html';
    back.textContent = str('app.back_to_the_simulator');

    /*
     * THREE ZONES, NOT SEVENTEEN BUTTONS.
     *
     * This bar was one flat row of seventeen controls at a single weight,
     * which wrapped, so on any normal window Publish and Fly this track,
     * the two things this whole tool exists to reach, landed on a second
     * row while Duplicate sat on the first. The zones are what the buttons
     * already were: what the course IS (file), what you are doing to it
     * (canvas), and where it goes (publish and fly).
     *
     * The file zone's rarely used half sits behind More, so Import, Export,
     * Duplicate and Delete stop competing with Save. Delete asks first: it
     * used to sit inline beside Save and remove a course on one click.
     */
    this.moreWrap = document.createElement('div');
    this.moreWrap.className = 'tb-more';
    this.moreBtn = btn('More', () => this.toggleMore(), str('app.import_export_duplicate_delete'));
    this.moreMenu = document.createElement('div');
    this.moreMenu.className = 'tb-more-menu';
    this.moreMenu.hidden = true;
    for (const [label, fn, title, cls] of [
      ['Duplicate', () => this.duplicate(), str('app.copy_this_track_under_a_new'), ''],
      ['Import', () => file.click(), str('app.read_a_json_track_file'), ''],
      ['Export', () => this.exportFile(), str('app.write_a_json_track_file'), ''],
      [str('app.export_animation'), () => this.exportAnimation(), str('app.write_a_looping_gif_of_one'), ''],
      ['Delete', () => this.confirmRemove(), str('app.remove_this_track_from_this_browser'), 'tb-danger'],
    ]) {
      const b = btn(label, () => { this.closeMore(); fn(); }, title, `tb-more-item ${cls}`.trim());
      this.moreMenu.append(b);
    }
    this.moreWrap.append(this.moreBtn, this.moreMenu);
    document.addEventListener('mousedown', (e) => {
      if (this.moreWrap && !this.moreWrap.contains(e.target)) {
        this.closeMore();
      }
    });

    /*
     * THE CLASS TOGGLE, AND IT IS THE FIRST THING ON THE BAR.
     *
     * These are two different tools. A five inch builder is 5 ft gates on a
     * sixty metre field with a grid in metres; a whoop builder is 28 inch
     * gates out of 26.7 mm PVC on a five by six metre floor with a grid in
     * inches, a different palette, different presets and RaceGOW's own rules
     * checking the layout. Everything on this page changes with it, so it
     * cannot be a line of read only text in a side panel where it was: an
     * author who opened the wrong one found out several gates in.
     *
     * It is also the SAME switch the simulator's aircraft choice is, and
     * pressing it here seats that aircraft. That is the whole point: one
     * answer governs the builder, the world behind the title, the track the
     * shell flies and the tracks the board offers.
     *
     * Each class keeps its own canvas, so this never destroys work: the
     * track you were building is still there when you come back. See
     * autosaveKey in storage.js.
     */
    this.classToggle = document.createElement('div');
    this.classToggle.className = 'tb-class';
    this.classToggle.setAttribute('role', 'group');
    this.classToggle.setAttribute('aria-label', str('app.which_builder'));
    this.classBtns = new Map();
    for (const [cls, label, hint] of [
      ['full', '5 inch', str('app.multigp_gates_on_a_sixty_metre')],
      ['micro', 'Whoop', str('app.racegow_gates_in_a_ten_by')],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-class-btn';
      b.textContent = label;
      b.title = hint;
      b.addEventListener('click', () => this.setTrackClass(cls));
      this.classBtns.set(cls, b);
      this.classToggle.append(b);
    }

    const zoneFile = document.createElement('div');
    zoneFile.className = 'tb-zone tb-zone-file';
    zoneFile.append(
      Object.assign(document.createElement('span'), { className: 'tb-title', textContent: str('app.track_builder') }),
      this.classToggle,
      name,
      group(
        btn('New', () => this.newTrack(), str('app.start_a_blank_track')),
        btn('Save', () => this.save(), str('app.control_s')),
        btn('Load', () => this.openLoad()),
      ),
      this.moreWrap,
    );

    const zoneEdit = document.createElement('div');
    zoneEdit.className = 'tb-zone tb-zone-edit';
    zoneEdit.append(
      group(this.undoBtn, this.redoBtn),
      group(this.mode2d, this.mode3d),
      group(
        btn('Fit', () => this.frameAll(), str('app.frame_the_whole_field')),
        this.pathBtn,
        btn(str('app.sponsor_logos'), () => this.openLogo(), str('app.up_to_five_sponsors_logos_shared')),
      ),
    );

    const zoneOut = document.createElement('div');
    zoneOut.className = 'tb-zone tb-zone-out';
    /* The listing chip moved here from beside the track name. It says
     * whether this track is on the board, which is the question the button
     * next to it answers, and the file zone needed the 130 px once the class
     * toggle joined it. */
    zoneOut.append(this.listingChip, this.publishBtn, this.flyBtn, back);

    bar.append(zoneFile, zoneEdit, zoneOut, file);
    this.updateTopBar();
  }

  updateTopBar() {
    if (this.nameInput && document.activeElement !== this.nameInput) {
      this.nameInput.value = this.doc.name;
    }
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
    this.undoBtn.title = this.history.canUndo() ? str('app.undo', { v1: this.history.undoLabel() }) : str('app.nothing_to_undo_2');
    this.redoBtn.title = this.history.canRedo() ? str('app.redo', { v1: this.history.redoLabel() }) : str('app.nothing_to_redo_2');
    this.mode2d.classList.toggle('on', this.mode === '2d');
    this.mode3d.classList.toggle('on', this.mode === '3d');
    if (this.classBtns) {
      const cls = trackClassOf(this.doc);
      for (const [id, b] of this.classBtns) {
        b.classList.toggle('on', id === cls);
        b.setAttribute('aria-pressed', id === cls ? 'true' : 'false');
      }
    }
    this.pathBtn.classList.toggle('on', this.pathVisible);
    if (this.listingChip && this.publishBtn) {
      const listing = this.listingOfCanvas();
      /* The words come from courseChip in src/share/listing.js, which is
       * also what the simulator's course cards read, so the same course
       * cannot be described one way here and another way there. */
      const chip = courseChip(listing);
      this.listingChip.className = 'tb-listing';
      this.listingChip.textContent = chip.label;
      this.listingChip.title = chip.note;
      if (chip.tone === 'live') {
        this.listingChip.classList.add('owned');
      } else if (chip.tone === 'warn') {
        this.listingChip.classList.add('remix');
      }
      if (listing.kind === 'owned') {
        this.publishBtn.textContent = listing.canUpdateListing ? str('app.update_board') : str('listing.on_the_board');
        this.publishBtn.title = listing.layoutDrift
          ? str('main.the_layout_changed_updating_the_board')
          : str('app.this_track_is_on_the_public');
      } else if (listing.kind === 'remix') {
        this.publishBtn.textContent = str('app.publish_as_yours');
        this.publishBtn.title = str('app.put_this_copy_on_the_board');
      } else {
        this.publishBtn.textContent = str('app.publish');
        this.publishBtn.title = str('app.put_this_track_on_the_public');
      }
    }
  }

  async syncNameIfOwned() {
    this.autosaver.flush();
    if (!readEditKey(this.doc.id)) {
      this.updateTopBar();
      return;
    }
    try {
      const result = await syncOwnedName(toPlain(this.doc));
      if (result && result.ok) {
        this.toast(str('app.name_updated_on_the_board', { name: this.doc.name }));
      } else if (result && result.skipped === 'layout-changed') {
        this.toast(str('app.the_layout_changed_too_update_the'));
      }
    } catch (e) {
      this.toast(str('app.could_not_update_the_name_on', { v1: e.message || e }));
    }
    this.updateTopBar();
  }

  async flyThisTrack() {
    this.autosaver.flush();
    if (this.nameInput && this.nameInput.value && this.nameInput.value !== this.doc.name) {
      this.doc.name = this.nameInput.value;
    }
    if (readEditKey(this.doc.id)) {
      try {
        await pushOwnedListing(toPlain(this.doc));
      } catch (e) {
        /* Still fly. The board name can catch up. */
      }
      bindOwnedCanvas(this.doc);
    } else {
      flyCanvasWithoutListing();
    }
    window.location.href = '../../index.html?map=custom';
  }

  toast(message) {
    const node = this.nodes.toast;
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => node.classList.remove('on'), 4200);
  }

  modal(title, body, actions = []) {
    const back = this.nodes.modal;
    back.textContent = '';
    back.hidden = false;
    const box = document.createElement('div');
    box.className = 'tb-modal';
    const h = document.createElement('h2');
    h.textContent = title;
    box.append(h, body);
    const row = document.createElement('div');
    row.className = 'tb-row-btns';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.danger ? 'tb-btn tb-danger' : 'tb-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        this.closeModal();
        a.run();
      });
      row.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-btn';
    close.textContent = actions.length ? 'Cancel' : 'Close';
    close.addEventListener('click', () => this.closeModal());
    row.append(close);
    box.append(row);
    back.append(box);
    /* The backdrop click handler is bound ONCE, in the constructor. It used
     * to be registered per open with { once: true }, which only removes
     * itself when it fires: closing with a button left it attached, so a
     * session that opened five modals through their buttons carried five
     * handlers on a node that is reused. The e.target check already makes
     * it harmless while the modal is hidden. */
  }

  bindModalBackdrop() {
    const back = this.nodes.modal;
    back.addEventListener('click', (e) => {
      if (e.target === back && !back.hidden) {
        this.closeModal();
      }
    });
  }

  confirm(title, detail, run) {
    const body = document.createElement('p');
    body.className = 'tb-help';
    body.textContent = detail;
    this.modal(title, body, [{ label: 'Yes', run, danger: true }]);
  }

  closeModal() {
    this.nodes.modal.hidden = true;
    this.nodes.modal.textContent = '';
  }

  /* ---------------- keyboard ---------------- */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.setSelection(this.doc.elements.map((el) => el.id));
        return;
      }
      if (mod) {
        return;
      }

      if (e.key === 'Escape') {
        if (!this.nodes.modal.hidden) {
          this.closeModal();
        } else if (this.armed) {
          this.disarm();
        } else {
          this.setSelection([]);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelection();
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        this.flipSelectedFace();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        this.setMode(this.mode === '2d' ? '3d' : '2d');
        return;
      }
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        this.nudgeYaw((e.key === 'q' || e.key === 'Q') ? 15 : -15);
        return;
      }
      if (e.key === 'Home') {
        this.frameAll();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        this.togglePath();
        return;
      }

      const def = elementByKey(e.key, trackClassOf(this.doc));
      if (def) {
        this.arm(def.id);
      }
    });
  }

  nudgeYaw(degrees) {
    if (!this.selection.size) {
      return;
    }
    this.edit('rotate', (d) => {
      for (const id of this.selection) {
        const element = elementById(d, id);
        if (element && kindOf(element) !== KIND.ANNOTATION) {
          setYaw(d, id, element.yaw + degrees * RAD);
        }
      }
    });
  }
}

/* Read a track handed in through the URL, so a track can be linked to. Used
 * by index.html at boot and kept here so app.js owns every way a document
 * can arrive. */
export function docFromLocation() {
  try {
    const raw = new URLSearchParams(window.location.search).get('track');
    if (!raw) {
      return null;
    }
    return normalize(JSON.parse(decodeURIComponent(raw))).doc;
  } catch (e) {
    return null;
  }
}
