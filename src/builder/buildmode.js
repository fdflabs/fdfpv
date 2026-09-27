/*
 * buildmode.js: build a track inside a world, and fly it.
 *
 * The owner's ask: "How can I get into a creative mode, builder mode, with
 * the current map, so we can build our tracks and place gates within the
 * actual architecture of the map." And then, of the first builder: "I need
 * a 3D builder where I can go in like creative mode, like Rust or
 * Minecraft, and place the gates and stuff in the 3D map." The keys were
 * too many (six to turn a gate, Tab to select, brackets to order), there
 * was no hotbar, and moving or turning a placed gate was hard. So this is
 * built the way a creative mode is.
 *
 * THREE STATES, AND B MOVES BETWEEN THEM, and a fourth it does not.
 *
 *   off       the pilot is flying the map. B (a pad's Back) starts building,
 *             and so do My tracks' Edit and New track (open).
 *   building  the aircraft is parked where it was and the pilot flies a
 *             free camera the way a creative mode flies: the mouse looks,
 *             W A S D move, Space rises and Shift sinks, with no collision.
 *             A crosshair reads the surface it points at off the GPU
 *             (pick.js) and the piece in hand shows there as a ghost. B
 *             flies the track. P publishes it to the board.
 *   testing   the track's gates are the map's course for a run from the
 *             start gate, on the race's own scoring, lap clock and results.
 *             B goes back to building, to the camera where it was left.
 *   racing    a track seated by the shell (main.js: Play on My tracks, or
 *             a board link) rather than being built here: its gates
 *             stand in the valley and are the map's course exactly as on a
 *             test flight, but the run is the pilot's, the keys are the
 *             flight's, and a published track's laps go to the board with
 *             their ghosts. It lasts until the shell takes the world or the
 *             course away.
 *
 * THE HAND AND THE HOTBAR. Nine slots of pieces (course.js PIECES), 1 to 9
 * or the wheel to pick one, E for every piece. Left click puts the piece
 * in hand where the ghost is, right click takes away the gate under the
 * crosshair, middle click puts that gate's piece in hand. R, T and Y turn,
 * tilt and roll the ghost 15 degrees (Shift the other way). The ghost
 * stands on ground and roofs, out of cliff faces, and in the air with Alt
 * held; G rounds it to a grid. It is red where the gate would be inside
 * rock or a building, the blocked warning's own rule, or inside another
 * gate.
 *
 * MOVING A GATE. F picks up the gate under the crosshair: it follows the
 * crosshair with the same snap and keeps its orientation, R T Y turn it,
 * a click puts it down and F again puts it back. Esc frees the mouse, and
 * the last gate touched (or one clicked) carries a gizmo (gizmo.js): drag
 * an arrow to move it, a ring to turn it. A click on the world takes the
 * mouse back. Ctrl+Z and Ctrl+Y undo and redo any edit, Ctrl+D copies the
 * gate under the crosshair into the hand.
 *
 * THE FLYING ORDER is the order gates were placed in, the start first,
 * shown as a number over every gate. O sets it by clicking the gates in
 * turn, the start first; the ones not clicked follow in their old order.
 * The start gate piece makes the gate it places the start.
 *
 * Escape steps back one thing at a time: close the inventory, finish the
 * order, put back what is carried, free the mouse, drop the selection,
 * then leave building, for the flight that was paused or, when My tracks
 * opened the builder (Edit, New track), for My tracks. What was built is
 * saved into the library on the way out either way, so it is on My tracks.
 *
 * WHAT IT TOUCHES IN THE SHELL, and only through `host` (main.js): the
 * run's mode (a paused run is a frozen plant, which is exactly the parked
 * aircraft this needs), the race (a new Race over the built gates), and the
 * seated map's view. For a test flight the view's course is swapped for the
 * built one: its gates, its target and its spawn, and its mode reads 'race'
 * so the OSD, the lap clock and the results are the race's. Everything is
 * put back when the run returns to building or building ends. That swap is
 * the whole of how "a built track races on the existing race flow" is done,
 * and the reason it is a swap on the view rather than a second map: the
 * valley took most of a minute to build and a test flight should take none.
 *
 * THE RACING LINE AND WHAT IS WRONG WITH THE TRACK (line.js). A ribbon
 * through the gates in flying order, coloured by the speed each corner
 * allows the aircraft it is drawn for, red where it asks more than that
 * aircraft can do, and the geometry warnings listed in the panel and marked
 * in the valley. Both are worked out again on every edit, never per frame.
 * The aircraft is the one being flown until C picks another. The ribbon is
 * drawn faint on a test flight.
 *
 * THE BOARD AND GHOSTS. P publishes the track through the shell's own
 * publish (host.publish, main.js), as a schemaVersion 4 document the board
 * reads; a published one is flown in the racing state above, where a lap
 * records its ghost and a board ghost can be chased. A TEST FLIGHT STILL
 * HAS NO GHOST: the track changes under it between runs, so a lap recorded
 * on one is a lap of a track that may no longer exist.
 *
 * WHAT IT DOES NOT DO YET, by the plan agreed with the owner: the town and
 * Yellowstone.
 *
 * THE GATES ARE SOLID, the way a field gate is: every edit hands the whole
 * built set to the valley's colliders (Colliders.setBuilt), which put it in
 * beside the frozen few thousand, so a test flight into a frame is the
 * shell's own contact and, with crash damage on, the plant's.
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

import * as THREE from 'three';
import { str } from '../strings/index.js';
import { AIRFRAMES, airframeById } from '../../configs/airframes.js';
import { KINDS } from '../game/collide.js';
import { ELEMENTS } from '../trackbuilder/elements.js';
import { elementById, normalize, touch } from '../trackbuilder/model.js';
import { listMapTracks, makeAutosaver, readMapAutosave, saveTrack } from '../trackbuilder/storage.js';
import {
  colourTargetSide, disposeStandaloneGate, dressGate, lightTarget,
} from '../render/scene.js';
import { builtGate } from '../render/pylons.js';
import { createPicker, marchHeight, PICK_RANGE } from './pick.js';
import {
  DEFAULT_HOTBAR, DEFAULT_WING_HOTBAR, HOTBAR_SLOTS, PIECES, PIECE_CATS, TURN_STEP, GRID_STEP, addGate, capsAt, capsOverlap, createHistory,
  gateFlags, gateSpec, gizmoAxes, makeStart, newCourse, openingsOf, orderOf, pieceById, pieceGate, pieceOf, poseOf,
  raceGatesOf, readoutFor, removeGate, setOrder, setPose, snapPose, startFor, stepOf, turnGate, worldCaps,
} from './course.js';
import { craftLimits, lineWarnings, openingBlocked, racingLine } from './line.js';
import { createHud } from './hud.js';
import { pieceIcons } from './icons.js';
import { createGizmo } from './gizmo.js';

/* The fly speeds, metres a second, - and = step through them, and the
 * sprint (W tapped twice and held, or a pad's left stick pressed) is this
 * many times the speed. The slowest puts a gate on a ledge; the fastest,
 * sprinting, crosses the six kilometre valley in under half a minute. */
const SPEEDS = [4, 8, 15, 30, 60];
const SPEED_START = 2;
const SPRINT = 4;
/* How quickly the camera reaches the speed asked of it, seconds: the time
 * constant of the ease in and the ease out. */
const EASE_S = 0.12;
/* Two presses of W this close together, ms, are a sprint. */
const DOUBLE_TAP_MS = 300;
/* How long Shift is down before it sinks the camera, ms. See shiftChord. */
const SHIFT_SINK_MS = 150;
/* Mouse radians a pixel, and a pad's right stick at full throw, radians a
 * second. */
const MOUSE_RATE = 0.0024;
const PAD_LOOK = 2.4;
/* How far in front of the camera an air piece hangs, its limits, and one
 * notch of Ctrl and the wheel, metres. */
const AIR_DEFAULT = 20;
const AIR_MIN = 3;
const AIR_MAX = 150;
const AIR_NOTCH = 2;
/* A stick deflection under this is a stick at rest. */
const DEAD = 0.12;
/* How far a ray has to move, metres at its origin or radians of direction,
 * before the crosshair asks the GPU again. */
const RAY_EPS = 0.02;
/* How long the camera has to be still before the GPU is asked for the
 * exact surface under the crosshair, milliseconds. */
const REST_MS = 150;
/* Escape that arrives this soon after the pointer was released is the
 * release, not a request to step back. Chrome hands the page the key that
 * ended the lock on some builds and not on others. */
const UNLOCK_GRACE_MS = 250;

/* Where My tracks puts the free camera on a track: this high over the
 * ground at the start, metres, looking this far down, radians. */
const OPEN_EYE = 3;
const OPEN_PITCH = -0.15;
/* The ribbon's width, metres, and how opaque it is while building and on a
 * test flight. */
const RIBBON_W = 0.7;
const RIBBON_OPACITY = 0.85;
const RIBBON_FAINT = 0.25;
/* Its colours: the slowest corner, top speed, and more than the aircraft
 * can do. */
const SLOW = new THREE.Color(1.0, 0.55, 0.1);
const FAST = new THREE.Color(0.3, 0.9, 1.0);
const OVER = new THREE.Color(1.0, 0.08, 0.12);
/* A warning's marker, metres across. Drawn through the ground, since a
 * gate inside rock is inside it. */
const MARKER_R = 1.2;
/* How many warnings the panel lists before it says how many more. */
const WARN_LINES = 6;
/* The ghost's two colours: fine, and red for a gate in rock or in a gate. */
const GHOST_OK = new THREE.Color(0x8fe9ff);
const GHOST_BAD = new THREE.Color(0xff3b3b);
/* Two pieces further apart than this, metres between their bases, are not
 * tested for overlap: no piece is half that tall. */
const OVERLAP_NEAR = 30;
/* A gate's number badge: its height as a share of the view's height at
 * any distance (a sprite that does not shrink), and how far above the top
 * of the gate it floats, metres. */
const BADGE_SCALE = 0.05;
const BADGE_LIFT = 0.7;
/*
 * What the geometry warnings count as the map's rock and buildings: every
 * collider build() froze except the forest, which a line threads rather
 * than clips and which would bury every other warning in a valley of
 * trees, and gate frames. The built gates are left out separately
 * (Colliders.gapAt frozenOnly).
 */
const NOT_ROCK = ['tree', 'canopy', 'gate'].reduce((m, k) => m | (1 << KINDS.indexOf(k)), 0);
/* This browser's own hotbars, one for the quads and one for the fixed
 * wings, and whether the controls card was hidden: conveniences, so a
 * private window that refuses storage just starts from the defaults. */
const HOTBARS = {
  quad: { key: 'webfpv.builder.hotbar.v1', pieces: DEFAULT_HOTBAR },
  wing: { key: 'webfpv.builder.hotbar.wing.v1', pieces: DEFAULT_WING_HOTBAR },
};
const HELP_KEY = 'webfpv.builder.help.v1';
/* The controls card's rows, each a string of keys and meaning. */
const HELP_ROWS = ['look', 'fly', 'speed', 'hotbar', 'place', 'turn', 'air', 'grid', 'carry', 'free', 'undo', 'order', 'line', 'test', 'file', 'pad'];

/* Standard gamepad buttons and axes (the W3C mapping). */
const PAD = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11,
  up: 12, down: 13, left: 14, right: 15,
};

function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    /* Storage refused or the entry unreadable: the default is the answer. */
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* Refused (a private window, a full quota): the hotbar or the card
     * lasts this page instead of the next, and nothing else depends on it. */
    return false;
  }
}

/* The hotbar for the seated aircraft's kind: a plane's opens on pieces
 * it fits. */
function hotbarKind(airframeId) {
  return airframeById(airframeId).fixedWing ? 'wing' : 'quad';
}

/* A kind's hotbar as stored, or its default where a slot is not a piece. */
function loadHotbar(kind) {
  const got = readStore(HOTBARS[kind].key, null);
  return HOTBARS[kind].pieces.map((id, i) => (Array.isArray(got) && pieceById(got[i]) ? got[i] : id));
}

export function createBuildMode(host) {
  const { shell, input, ui } = host;
  const renderer = shell.renderer;
  const camera = shell.camera;
  const picker = createPicker(renderer);
  const autosave = makeAutosaver(500);
  const history = createHistory();
  const gizmo = createGizmo();

  let state = 'off';
  let view = null;
  let doc = null;
  /* The gates as built, by element id: { made, group, caps, top }. caps
   * are its solids in the scene, top its highest point. */
  const meshes = new Map();
  let root = null;
  let badges = null;
  let ghost = null;
  let barKind = hotbarKind(ui.settings.airframe);
  let hotbar = loadHotbar(barKind);
  let slot = 0;
  /* The piece being carried: { id, piece, keep, turn }. id is the gate it
   * was picked up from, or null for a copy that is not in the track yet;
   * keep is the orientation it carries. */
  let carry = null;
  /* The gate the gizmo is on while the mouse is free. */
  let selected = null;
  /* The gate under the crosshair, or under the free mouse. */
  let hovered = null;
  /* The flying order being clicked: { picked: [ids] }, or null. */
  let order = null;
  let grid = false;
  let airDistance = AIR_DEFAULT;
  let speedIndex = SPEED_START;
  let sprint = false;
  /* Shift sinks the camera, and turns a piece the other way with R, T or
   * Y. It sinks only once it has been down SHIFT_SINK_MS, time for the
   * turn key to follow it, and once it has turned a piece it is that
   * key's Shift until it is let go: a reverse turn does not drop the
   * camera. */
  let shiftChord = false;
  let shiftAt = 0;
  let lastW = -Infinity;
  const turn = { yaw: 0, pitch: 0, roll: 0 };
  /* The free camera: where it is, where it looks, how fast it moves. */
  const cam = {
    pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector3(),
  };
  let parked = null;
  let tested = false;
  /* Opened from My tracks (open), so leaving goes back there. */
  let fromMenu = false;
  let hit = null;
  let hitAt = -Infinity;
  /* The ray the crosshair's reading was taken along, hit or miss, and
   * whether it is the GPU's exact one. */
  let hitRay = { origin: new THREE.Vector3(Infinity, 0, 0), dir: new THREE.Vector3(), exact: false };
  let asked = false;
  let movedAt = 0;
  const lastRay = { origin: new THREE.Vector3(Infinity, 0, 0), dir: new THREE.Vector3() };
  const mouse = { dx: 0, dy: 0, dragging: false };
  /* Where the free mouse is, client px, and the gizmo drag under way. */
  let cursor = null;
  let drag = null;
  let unlockedAt = -Infinity;
  let padPrev = [];
  let message = { text: '', until: 0 };
  let showHelp = readStore(HELP_KEY, true) !== false;
  let hud = null;
  let icons = new Map();
  let hudText = '';
  let dressKey = '';
  let hidden = [];
  /* The view's own course, put back after a test flight. */
  let patched = null;
  const aim = {
    active: false, sceneIndex: -1, centre: new THREE.Vector3(), travel: { x: 0, y: 0, z: -1 }, clearH: 0, correct: true, distance: 0, virtual: false,
  };
  let courseGates = [];
  /* The racing line: on or off, the aircraft it is drawn for, the line and
   * the warnings as last worked out, and what draws them. */
  let lineOn = true;
  let craftId = null;
  let line = { samples: [], gateAt: [] };
  let warnings = [];
  let lineGroup = null;
  let ribbon = null;
  let markers = null;

  const fwd = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const raycaster = new THREE.Raycaster();
  /* A gate's parts are not all on layer 0 (its glow and a pylon's cone
   * are on layer 1, and src/render/post.js moves layer 1 occluders to a
   * layer of their own), and a ray on layer 0 alone passes through them:
   * the hover ray must meet every part of a gate. */
  raycaster.layers.enableAll();
  const ndc = new THREE.Vector2();

  function say(text, ms = 2600) {
    message = { text, until: performance.now() + ms };
  }

  const locked = () => document.pointerLockElement === shell.canvas;
  /* Whether the crosshair is what aims: the mouse is taken, or it is free
   * but has not moved since (a pad, or the moment after Esc). Once it
   * moves, the cursor aims and the gizmo is up. */
  const aiming = () => locked() || !cursor;

  /* Take the mouse. Only a click or a key may, so this is called from one;
   * a browser that refuses (Chrome does for a moment after the pilot freed
   * it with Esc) leaves it free, and the next click on the world takes it. */
  function lock() {
    if (locked() || !shell.canvas.requestPointerLock) {
      return;
    }
    const p = shell.canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') {
      p.catch(() => say(str('build.click_to_look')));
    }
  }

  function unlock() {
    if (locked()) {
      document.exitPointerLock();
    }
  }

  function snapshot() {
    return JSON.stringify(doc);
  }

  /* ---------------------------------------------------------------- */
  /* Meshes                                                            */
  /* ---------------------------------------------------------------- */

  function makeGate(el, index, isStart, step) {
    const made = builtGate(gateSpec(el, step), index, isStart, gateFlags(el));
    const group = made.group;
    group.userData.elementId = el.id;
    return { made, group, caps: [], top: new THREE.Vector3() };
  }

  const box = new THREE.Box3();

  function place(m, el) {
    const { base, quat } = poseOf(el);
    m.group.position.set(base.x, base.y, base.z);
    m.group.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    m.group.updateMatrixWorld(true);
    box.setFromObject(m.group);
    m.top.set((box.min.x + box.max.x) / 2, box.max.y + BADGE_LIFT, (box.min.z + box.max.z) / 2);
  }

  /* Every gate from the document: numbers follow the lap, so any change to
   * the lap redraws them all. A track is tens of gates, and a redraw is a
   * few milliseconds on the frame the edit happens in. */
  function rebuildAll() {
    for (const m of meshes.values()) {
      m.group.removeFromParent();
      disposeStandaloneGate(m.made);
    }
    meshes.clear();
    doc.sequence.forEach((s, i) => {
      const el = elementById(doc, s.elementId);
      if (!el || meshes.has(el.id)) {
        return;
      }
      const m = makeGate(el, i, i === 0, s);
      place(m, el);
      root.add(m.group);
      meshes.set(el.id, m);
    });
    if (selected && !meshes.has(selected)) {
      selected = null;
    }
    dressKey = '';
    dressAll();
    solidify();
    refreshBadges();
    refreshLine();
  }

  /* The gates as the craft meets them: every frame member, panel and mast
   * of every gate where the document has it now, replacing the last set.
   * The free camera never asks the colliders, so building flies through
   * them all. */
  function solidify() {
    if (!view || !view.colliders) {
      return;
    }
    const caps = [];
    for (const [id, m] of meshes) {
      const el = elementById(doc, id);
      if (el) {
        m.caps = worldCaps(el, m.made.colliders);
        caps.push(...m.caps);
      }
    }
    view.colliders.setBuilt(caps);
  }

  /* While building: every gate's ring on, the one under the crosshair lit,
   * and the selected one while the mouse is free. Only redrawn when one of
   * those changes. */
  function dressAll() {
    const lit = order ? null : (hovered ?? (!aiming() ? selected : null));
    const key = `${lit}|${carry ? carry.id : ''}|${meshes.size}`;
    if (key === dressKey) {
      return;
    }
    dressKey = key;
    for (const [id, m] of meshes) {
      const gt = dressable(m, 0);
      if (id === lit) {
        lightTarget(gt);
        colourTargetSide(gt, true);
      } else {
        dressGate(gt, 'follow');
      }
      m.group.visible = !(carry && carry.id === id);
    }
  }

  /* The shape dressGate and lightTarget read, from a built gate. */
  function dressable(m, apertureIndex) {
    const made = m.made;
    return {
      ringMat: made.ringMat,
      haloMat: made.haloMat,
      glowMat: made.glowMat,
      ringMeshes: made.ringMeshes,
      haloMeshes: made.haloMeshes,
      litApertures: [apertureIndex],
      ringColor: made.ringColor,
      glowMesh: made.glowMesh,
      glowGain: 1,
      cueGroup: made.cueGroup,
      fillMat: made.fillMat,
      aperture: made.apertures[apertureIndex] ?? made.apertures[0],
      trackGlow: made.apertures.length > 1,
      virtual: false,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Number badges                                                     */
  /* ---------------------------------------------------------------- */

  /* One material per look, drawn once: a disc with the gate's number, the
   * start green, a gate already clicked in the flying order amber, one not
   * yet clicked grey. */
  const badgeMats = new Map();
  const BADGE_LOOK = {
    gate: { fill: 'rgba(16, 22, 18, 0.9)', ring: '#ffd45c', ink: '#f3ead4' },
    start: { fill: '#1f9d55', ring: '#f3ead4', ink: '#ffffff' },
    picked: { fill: '#ffd45c', ring: '#141c16', ink: '#141c16' },
    waiting: { fill: 'rgba(60, 64, 60, 0.75)', ring: 'rgba(243, 234, 212, 0.5)', ink: 'rgba(243, 234, 212, 0.7)' },
  };

  function badgeMat(text, look) {
    const key = `${look}:${text}`;
    let mat = badgeMats.get(key);
    if (mat) {
      return mat;
    }
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const s = BADGE_LOOK[look];
    g.beginPath();
    g.arc(32, 32, 27, 0, Math.PI * 2);
    g.fillStyle = s.fill;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = s.ring;
    g.stroke();
    g.fillStyle = s.ink;
    g.font = `700 ${text.length > 2 ? 22 : 28}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
    if (look === 'start') {
      /* A pennant on the disc's shoulder: the start reads as the start
       * before its number is read. */
      g.fillStyle = '#ffffff';
      g.fillRect(47, 4, 2.5, 18);
      g.beginPath();
      g.moveTo(49.5, 4);
      g.lineTo(60, 8.5);
      g.lineTo(49.5, 13);
      g.closePath();
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({
      map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false,
    });
    badgeMats.set(key, mat);
    return mat;
  }

  /* The badge for each gate: its number in the lap, or while the flying
   * order is being clicked, its new number or a grey one. */
  function badgeFor(id, i) {
    if (order) {
      const k = order.picked.indexOf(id);
      return k >= 0 ? { text: String(k + 1), look: k === 0 ? 'start' : 'picked' } : { text: String(i + 1), look: 'waiting' };
    }
    return { text: String(i + 1), look: i === 0 ? 'start' : 'gate' };
  }

  function refreshBadges() {
    if (!badges) {
      badges = new THREE.Group();
      badges.name = 'build-badges';
      root.add(badges);
    }
    badges.clear();
    doc.sequence.forEach((s, i) => {
      const m = meshes.get(s.elementId);
      if (!m) {
        return;
      }
      const b = badgeFor(s.elementId, i);
      const sprite = new THREE.Sprite(badgeMat(b.text, b.look));
      sprite.scale.set(BADGE_SCALE, BADGE_SCALE, 1);
      sprite.position.copy(m.top);
      sprite.renderOrder = 25;
      sprite.userData = { elementId: s.elementId, ...b };
      badges.add(sprite);
    });
    badges.visible = state === 'building';
  }

  function disposeBadges() {
    for (const mat of badgeMats.values()) {
      mat.map.dispose();
      mat.dispose();
    }
    badgeMats.clear();
    badges = null;
  }

  /* ---------------------------------------------------------------- */
  /* The racing line                                                   */
  /* ---------------------------------------------------------------- */

  const ribbonMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: RIBBON_OPACITY, depthWrite: false,
  });
  const markerMat = new THREE.MeshBasicMaterial({
    color: OVER, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
  });
  const markerGeo = new THREE.OctahedronGeometry(MARKER_R);

  function craft() {
    return craftLimits(airframeById(craftId));
  }

  /* The map as the warnings ask it: the ground, and the map's own rock and
   * buildings without the built gates or the forest. */
  const world = {
    heightAt: (x, z) => host.heightAt(x, z),
    solidAt: (x, y, z) => view.colliders.gapAt(x, y, z, 1e-3, true, NOT_ROCK) < 1e-3,
  };

  /* Work the line and the warnings out again, and redraw both. On an edit,
   * never per frame. */
  function refreshLine() {
    if (!root || !view || !view.colliders) {
      return;
    }
    const gates = raceGatesOf(doc);
    const c = craft();
    line = racingLine(gates, c, host.heightAt);
    warnings = lineWarnings(gates, line, c, world);
    drawLine(c);
  }

  function drawLine(c) {
    if (!lineGroup) {
      lineGroup = new THREE.Group();
      lineGroup.name = 'build-line';
      root.add(lineGroup);
    }
    if (ribbon) {
      ribbon.geometry.dispose();
      ribbon.removeFromParent();
      ribbon = null;
    }
    if (markers) {
      markers.removeFromParent();
      markers = null;
    }
    const s = line.samples;
    if (s.length >= 2) {
      const n = s.length + 1;
      const pos = new Float32Array(n * 6);
      const col = new Float32Array(n * 6);
      const index = [];
      const side = new THREE.Vector3();
      const tan = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const colour = new THREE.Color();
      for (let i = 0; i < n; i += 1) {
        const p = s[i % s.length];
        tan.set(p.tangent.x, p.tangent.y, p.tangent.z);
        side.crossVectors(tan, up);
        if (side.lengthSq() < 1e-6) {
          side.set(1, 0, 0);
        }
        side.normalize().multiplyScalar(RIBBON_W / 2);
        pos.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
        if (p.ok) {
          colour.lerpColors(SLOW, FAST, Math.min(1, p.v / c.topSpeed));
        } else {
          colour.copy(OVER);
        }
        col.set([colour.r, colour.g, colour.b, colour.r, colour.g, colour.b], i * 6);
        if (i > 0) {
          const a = (i - 1) * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeBoundingSphere();
      ribbon = new THREE.Mesh(geo, ribbonMat);
      ribbon.name = 'build-ribbon';
      ribbon.renderOrder = 5;
      lineGroup.add(ribbon);
    }
    markers = new THREE.Group();
    for (const w of warnings) {
      const m = new THREE.Mesh(markerGeo, markerMat);
      m.position.set(w.pos.x, w.pos.y, w.pos.z);
      m.renderOrder = 20;
      markers.add(m);
    }
    lineGroup.add(markers);
    showLine();
  }

  /* The line as the state wants it: bright while building, faint on a
   * test flight, and not at all when V hid it. The warnings' markers are
   * for building, and V leaves them: it hides the line, not the problems. */
  function showLine() {
    ribbonMat.opacity = state === 'testing' ? RIBBON_FAINT : RIBBON_OPACITY;
    /* Not on a published track: the line is the author's tool, and a pilot
     * racing somebody's track flies their own line. */
    if (ribbon) {
      ribbon.visible = lineOn && state !== 'racing';
    }
    if (markers) {
      markers.visible = state === 'building';
    }
    if (badges) {
      badges.visible = state === 'building';
    }
  }

  function toggleLine() {
    lineOn = !lineOn;
    showLine();
  }

  /* The next aircraft the line and the warnings are worked out for. */
  function cycleCraft(step) {
    const ids = AIRFRAMES.map((a) => a.id);
    craftId = ids[(ids.indexOf(craftId) + step + ids.length) % ids.length];
    refreshLine();
    say(str('build.line_craft', { craft: airframeById(craftId).short }), 1600);
  }

  /* To the centimetre: a 1.75 m gate against a 1.8 m span is the whole
   * point of one of these, and to the decimetre both read 1.8. */
  function warningText(w) {
    const vars = {
      n: w.gate + 1, m: (w.next ?? 0) + 1, craft: airframeById(craftId).short,
      value: w.value != null ? w.value.toFixed(2) : '', limit: w.limit != null ? w.limit.toFixed(2) : '',
    };
    return str(`build.warn_${w.code}`, vars);
  }

  function lineLines() {
    const c = airframeById(craftId).short;
    const out = [];
    const s = line.samples;
    if (!lineOn) {
      out.push(str('build.line_off', { craft: c }));
    } else if (s.length) {
      let slow = Infinity;
      for (const p of s) {
        slow = Math.min(slow, p.v);
      }
      out.push(str('build.line', { craft: c, slow: Math.round(slow), top: Math.round(craft().topSpeed) }));
    }
    if (!warnings.length) {
      out.push(str('build.warnings_none'));
      return out;
    }
    out.push(str('build.warnings', { n: warnings.length }));
    for (const w of warnings.slice(0, WARN_LINES)) {
      out.push(`  ${warningText(w)}`);
    }
    if (warnings.length > WARN_LINES) {
      const more = str('build.warn_more', { n: warnings.length - WARN_LINES });
      out.push(`  ${more}`);
    }
    return out;
  }

  function disposeLine() {
    if (ribbon) {
      ribbon.geometry.dispose();
    }
    ribbon = null;
    markers = null;
    lineGroup = null;
    line = { samples: [], gateAt: [] };
    warnings = [];
  }

  /* ---------------------------------------------------------------- */
  /* Pieces and the ghost                                              */
  /* ---------------------------------------------------------------- */

  function pieceName(piece) {
    if (piece.start) {
      return str('build.piece_start');
    }
    if (piece.passSide) {
      return str(`build.piece_pylon_${piece.passSide}`);
    }
    return ELEMENTS[piece.type].label;
  }

  /* A piece built as the builder places it, before any document has it:
   * the ghost's and the icons' mesh. */
  function buildPiece(piece) {
    const el = { type: piece.type, dims: ELEMENTS[piece.type].dims, flagSide: ELEMENTS[piece.type].flagSide };
    const step = piece.passSide ? { passSide: piece.passSide } : null;
    const made = builtGate(gateSpec(el, step), 0, Boolean(piece.start), gateFlags(el));
    return { made, el };
  }

  /* The parts of a gate that are its light rather than its structure: the
   * pane across the opening and the glow round it, which in the ghost's
   * one material would fill the hole the ghost is there to show. */
  function lightParts(made) {
    return [made.glowMesh, made.cueGroup, ...(made.haloMeshes || [])].filter(Boolean);
  }

  function handPiece() {
    return carry ? carry.piece : pieceById(hotbar[slot]);
  }

  const ghostMat = new THREE.MeshBasicMaterial({
    color: GHOST_OK, transparent: true, opacity: 0.42, depthWrite: false,
  });

  /* The ghost is a real gate of the piece about to be placed, in one pale
   * see-through material, so what it shows is the size and shape that
   * will land. */
  function ensureGhost() {
    const piece = handPiece();
    const key = carry ? `carry:${carry.id}:${piece.id}` : piece.id;
    if (ghost && ghost.key === key) {
      return;
    }
    if (ghost) {
      ghost.group.removeFromParent();
      disposeStandaloneGate(ghost.made);
    }
    const { made, el } = buildPiece(piece);
    made.group.traverse((o) => {
      if (o.isMesh) {
        o.material = ghostMat;
        o.castShadow = false;
        o.renderOrder = 10;
      }
    });
    for (const part of lightParts(made)) {
      part.visible = false;
    }
    ghost = {
      key, made, group: made.group, centreY: openingsOf(el)[0].centreY, pose: null, poseKey: '', trouble: null,
    };
    root.add(ghost.group);
  }

  /* Why the ghost is red, or null: its opening inside the map's rock or
   * buildings (the blocked warning's rule, line.js), or its frame inside
   * another gate's. */
  function troubleAt(pose) {
    const piece = handPiece();
    if (openingBlocked(pieceGate(piece, pose.base, pose.quat), world)) {
      return { code: 'blocked' };
    }
    const caps = capsAt(pose.base, pose.quat, ghost.made.colliders);
    for (const [id, m] of meshes) {
      if (carry && carry.id === id) {
        continue;
      }
      const p = m.group.position;
      if (Math.hypot(p.x - pose.base.x, p.y - pose.base.y, p.z - pose.base.z) < OVERLAP_NEAR && capsOverlap(caps, m.caps)) {
        return { code: 'overlap', n: orderOf(doc, id) + 1 };
      }
    }
    return null;
  }

  const altHeld = () => input.keys.has('AltLeft') || input.keys.has('AltRight');
  const shiftHeld = () => input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const ctrlHeld = () => input.keys.has('ControlLeft') || input.keys.has('ControlRight');

  function camFrame() {
    forward(fwd);
    return { position: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z }, forward: { x: fwd.x, y: fwd.y, z: fwd.z } };
  }

  function ghostPose(h, air) {
    return snapPose(h, camFrame(), carry ? carry.turn : turn, airDistance, ghost.centreY, {
      air, grid, keep: carry ? carry.keep : null,
    });
  }

  function ghostShown() {
    return state === 'building' && aiming() && !order && !(hud && hud.inventoryOpen);
  }

  /* Where the ghost is right now, and whether it is red, for the frame. */
  function updateGhost() {
    if (!ghostShown()) {
      if (ghost) {
        ghost.group.visible = false;
      }
      return;
    }
    ensureGhost();
    const pose = ghostPose(hit, altHeld());
    ghost.pose = pose;
    ghost.group.visible = true;
    ghost.group.position.set(pose.base.x, pose.base.y, pose.base.z);
    ghost.group.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
    const key = `${pose.base.x},${pose.base.y},${pose.base.z},${pose.quat.x},${pose.quat.y},${pose.quat.z},${meshes.size}`;
    if (key !== ghost.poseKey) {
      ghost.poseKey = key;
      ghost.trouble = troubleAt(pose);
      ghostMat.color.copy(ghost.trouble ? GHOST_BAD : GHOST_OK);
    }
  }

  /* ---------------------------------------------------------------- */
  /* The camera                                                        */
  /* ---------------------------------------------------------------- */

  function cameraFromShell() {
    cam.pos.copy(camera.position);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    cam.yaw = euler.y;
    cam.pitch = Math.max(-1.5, Math.min(1.5, euler.x));
    cam.vel.set(0, 0, 0);
  }

  function forward(out) {
    euler.set(cam.pitch, cam.yaw, 0, 'YXZ');
    return out.set(0, 0, -1).applyEuler(euler);
  }

  function keyAxis(pos, neg) {
    return (input.keys.has(pos) ? 1 : 0) - (input.keys.has(neg) ? 1 : 0);
  }

  function stick(v) {
    return Math.abs(v) < DEAD ? 0 : v;
  }

  const want = new THREE.Vector3();

  /*
   * Creative flight: the keys (or a pad's left stick) ask for a velocity
   * along the level heading, across it and straight up, and the camera
   * eases to it and back to rest over EASE_S. A standard pad's right stick
   * looks and its triggers rise and sink; a radio, whose switches are not
   * buttons anyone can rely on, flies it on its sticks like a drone, the
   * throttle's middle a hover.
   */
  function driveCamera(dtS, gp, padDown) {
    let ahead = keyAxis('KeyW', 'KeyS');
    let side = keyAxis('KeyD', 'KeyA');
    if (!shiftHeld()) {
      shiftChord = false;
    }
    const sink = shiftHeld() && !shiftChord && performance.now() - shiftAt > SHIFT_SINK_MS;
    let rise = (input.keys.has('Space') ? 1 : 0) - (sink ? 1 : 0);
    let yawIn = 0;
    let lookIn = 0;
    if (!input.keys.has('KeyW')) {
      sprint = false;
    }
    let fast = sprint;
    if (gp && gp.mapping === 'standard' && gp.axes.length >= 4) {
      ahead -= stick(gp.axes[1]);
      side += stick(gp.axes[0]);
      yawIn -= stick(gp.axes[2]);
      lookIn -= stick(gp.axes[3]);
      const trig = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      rise += stick(trig(PAD.rt)) - stick(trig(PAD.lt));
      fast = fast || padDown(PAD.ls);
    } else if (gp) {
      const ch = input.channels;
      ahead += stick(ch.pitch);
      side += stick(ch.roll);
      yawIn -= stick(ch.yaw);
      rise += stick((ch.throttle - 0.5) * 2);
    }
    cam.yaw += yawIn * PAD_LOOK * dtS;
    cam.pitch += lookIn * PAD_LOOK * dtS;
    if (locked() || mouse.dragging) {
      cam.yaw -= mouse.dx * MOUSE_RATE;
      cam.pitch -= mouse.dy * MOUSE_RATE;
    }
    mouse.dx = 0;
    mouse.dy = 0;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch));
    const speed = SPEEDS[speedIndex] * (fast ? SPRINT : 1);
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    want.set(-sy * ahead + cy * side, rise, -cy * ahead - sy * side);
    if (want.lengthSq() > 1) {
      want.normalize();
    }
    want.multiplyScalar(speed);
    cam.vel.lerp(want, 1 - Math.exp(-dtS / EASE_S));
    cam.pos.addScaledVector(cam.vel, dtS);
    camera.position.copy(cam.pos);
    euler.set(cam.pitch, cam.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld();
  }

  /* ---------------------------------------------------------------- */
  /* What the crosshair or the mouse is on                             */
  /* ---------------------------------------------------------------- */

  function excluded() {
    const out = [root, shell.quad];
    return out.filter(Boolean);
  }

  /*
   * The crosshair's surface. While the camera moves it is the map's height
   * function, read on the CPU for nothing; once the camera has been still
   * for REST_MS the GPU is asked for the exact surface, the rock and the
   * roofs included, and that answer stands until the camera moves again.
   * Asking every frame cost the main thread a synchronous trip to Chrome's
   * GPU process each time (pick.js), measured at 57 to 75 ms with the GPU
   * busy; asking once per stop costs one.
   */
  function trackCrosshair(now) {
    const got = picker.poll();
    if (got !== undefined) {
      asked = false;
      if (got.origin.equals(lastRay.origin) && got.dir.equals(lastRay.dir)) {
        hit = got.hit;
        hitRay = { origin: got.origin, dir: got.dir, exact: true };
        hitAt = now;
      }
    }
    forward(fwd);
    const moved = lastRay.origin.distanceTo(cam.pos) > RAY_EPS || lastRay.dir.angleTo(fwd) > RAY_EPS * 0.05;
    if (moved) {
      lastRay.origin.copy(cam.pos);
      lastRay.dir.copy(fwd);
      movedAt = now;
      hit = marchHeight(host.heightAt, cam.pos, fwd);
      hitRay = { origin: cam.pos.clone(), dir: fwd.clone(), exact: false };
      hitAt = now;
      return;
    }
    if (!hitRay.exact && !asked && now - movedAt > REST_MS) {
      asked = picker.request(view.scene, lastRay.origin, lastRay.dir, excluded());
    }
  }

  /* The ray the mouse means: the crosshair's while the mouse is taken,
   * through the cursor while it is free. */
  function pointerRay() {
    if (aiming()) {
      raycaster.set(cam.pos, forward(fwd));
    } else {
      const r = shell.canvas.getBoundingClientRect();
      ndc.set(((cursor.x - r.left) / r.width) * 2 - 1, -((cursor.y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }
    raycaster.far = PICK_RANGE;
    return raycaster;
  }

  /* The gate a ray meets, if one is nearer than `far` (the world there). */
  function gateOn(ray, far = PICK_RANGE) {
    ray.far = Math.min(PICK_RANGE, far);
    const visible = [...meshes.values()].map((m) => m.group).filter((g) => g.visible);
    for (const h of ray.intersectObjects(visible, true)) {
      let o = h.object;
      while (o && !o.userData.elementId) {
        o = o.parent;
      }
      if (o) {
        return o.userData.elementId;
      }
    }
    return null;
  }

  function trackHover() {
    const was = hovered;
    if (state !== 'building' || (hud && hud.inventoryOpen) || drag) {
      hovered = null;
    } else if (aiming()) {
      hovered = gateOn(pointerRay(), hit ? hit.distance : PICK_RANGE);
    } else {
      const ray = pointerRay();
      const handle = selected ? gizmo.handleOn(ray) : null;
      gizmo.hover(handle);
      hovered = handle ? null : gateOn(ray);
    }
    if (hovered !== was) {
      dressAll();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Edits                                                             */
  /* ---------------------------------------------------------------- */

  /* Every edit ends here: the document as it was goes on the undo stack,
   * and the gates, their solids, their numbers, the line and the warnings
   * are all built again from the document as it is. */
  function commit(before) {
    history.record(before);
    touch(doc);
    autosave.schedule(doc);
    rebuildAll();
  }

  /* The exact surface for the moment it matters: the crosshair's reading
   * may be a frame old. */
  function exactPose(air) {
    ensureGhost();
    const now = picker.pick(view.scene, cam.pos, forward(fwd), excluded());
    return ghostPose(now, air);
  }

  function placePiece(air) {
    const piece = handPiece();
    const before = snapshot();
    const pose = exactPose(air);
    const el = addGate(doc, piece.type, pose.base, pose.quat, piece.passSide);
    if (piece.start) {
      makeStart(doc, el.id);
    }
    selected = el.id;
    commit(before);
    say(str('build.placed', { piece: pieceName(piece), n: orderOf(doc, el.id) + 1 }));
  }

  function remove(id) {
    const before = snapshot();
    const n = orderOf(doc, id) + 1;
    removeGate(doc, id);
    if (selected === id) {
      selected = null;
    }
    commit(before);
    say(str('build.deleted', { n }));
  }

  /* Middle click: the gate's piece into the hand, from the hotbar if it
   * is there, into the slot in hand if not, the way a creative mode picks
   * a block. */
  function pickPiece(id) {
    const piece = pieceOf(doc, id);
    if (!piece) {
      return;
    }
    const at = hotbar.indexOf(piece.id);
    if (at >= 0) {
      setSlot(at);
      return;
    }
    hotbar[slot] = piece.id;
    writeStore(HOTBARS[barKind].key, hotbar);
    setSlot(slot);
  }

  /* F: pick up the gate aimed at, or put back the one carried. */
  function toggleCarry() {
    if (carry) {
      putBack();
      return;
    }
    const id = aiming() ? hovered : (hovered ?? selected);
    if (!id) {
      say(str('build.aim_first'));
      return;
    }
    startCarry(id, pieceOf(doc, id), id);
    say(str('build.carrying', { n: orderOf(doc, id) + 1 }));
  }

  function startCarry(id, piece, from) {
    const { quat } = poseOf(elementById(doc, from));
    carry = {
      id, piece, keep: quat, turn: { yaw: 0, pitch: 0, roll: 0 },
    };
    lock();
    dressAll();
  }

  function putBack() {
    carry = null;
    dressAll();
  }

  function dropCarry(air) {
    const before = snapshot();
    const pose = exactPose(air);
    const c = carry;
    carry = null;
    let id = c.id;
    if (id) {
      setPose(elementById(doc, id), pose.base, pose.quat);
    } else {
      id = addGate(doc, c.piece.type, pose.base, pose.quat, c.piece.passSide).id;
    }
    selected = id;
    commit(before);
    say(str(c.id ? 'build.moved' : 'build.placed_copy', { n: orderOf(doc, id) + 1 }));
  }

  /* Ctrl+D: a copy of the gate aimed at (or selected) into the hand, as a
   * carried piece that joins the track where it is put down. */
  function duplicate() {
    const id = aiming() ? hovered : (hovered ?? selected);
    if (!id) {
      say(str('build.aim_first'));
      return;
    }
    const piece = pieceOf(doc, id);
    /* A copy of the start is a gate: a track has one start. */
    startCarry(null, piece.start ? pieceById('gate') : piece, id);
    say(str('build.copying', { n: orderOf(doc, id) + 1 }));
  }

  /* R, T and Y: the carried piece, the selected gate while the mouse is
   * free, or the ghost's own turn for the next piece. */
  function rotate(axis, dir) {
    const step = dir * TURN_STEP;
    if (carry) {
      carry.turn[axis] += step;
      return;
    }
    if (selected && !aiming()) {
      const before = snapshot();
      const el = elementById(doc, selected);
      const next = turnGate(el, axis, step);
      setPose(el, next.base, next.quat);
      commit(before);
      return;
    }
    turn[axis] += step;
  }

  function undo(back) {
    const to = back ? history.undo(snapshot()) : history.redo(snapshot());
    if (!to) {
      say(str(back ? 'build.nothing_to_undo' : 'build.nothing_to_redo'), 1400);
      return;
    }
    doc = JSON.parse(to);
    carry = null;
    order = null;
    touch(doc);
    autosave.schedule(doc);
    rebuildAll();
    say(str(back ? 'build.undone' : 'build.redone'), 1400);
  }

  /* O: start clicking the flying order, or finish it. */
  function toggleOrder() {
    if (order) {
      finishOrder();
      return;
    }
    if (!doc.sequence.length) {
      say(str('build.place_first'));
      return;
    }
    carry = null;
    order = { picked: [] };
    refreshBadges();
    dressAll();
  }

  function orderClick(id) {
    if (!id || order.picked.includes(id)) {
      return;
    }
    order.picked.push(id);
    refreshBadges();
    if (order.picked.length === doc.sequence.length) {
      finishOrder();
    }
  }

  function finishOrder() {
    const picked = order.picked;
    order = null;
    const before = snapshot();
    if (setOrder(doc, picked)) {
      commit(before);
      say(str('build.order_set', { n: picked.length }));
      return;
    }
    refreshBadges();
    dressAll();
  }

  /* The left button, or a pad's A, with the mouse taken. */
  function primary(air) {
    if (order) {
      orderClick(hovered);
      return;
    }
    if (carry) {
      dropCarry(air);
      return;
    }
    placePiece(air);
  }

  function setSlot(i) {
    slot = ((i % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
    if (hud) {
      paintHotbar();
      hud.flashName(pieceName(pieceById(hotbar[slot])));
    }
  }

  function setSpeed(i) {
    speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    say(str('build.speed_now', { speed: SPEEDS[speedIndex] }), 1200);
  }

  function setDistance(m) {
    airDistance = Math.max(AIR_MIN, Math.min(AIR_MAX, m));
  }

  /* ---------------------------------------------------------------- */
  /* The gizmo                                                         */
  /* ---------------------------------------------------------------- */

  const gv = {
    o: new THREE.Vector3(), d: new THREE.Vector3(), a: new THREE.Vector3(), p: new THREE.Vector3(), w: new THREE.Vector3(), v: new THREE.Vector3(),
  };

  /* Where the mouse ray is along the drag's axis (a move) or round it (a
   * turn): metres from the pivot along the axis, or a point in the plane
   * the ring lies in. Null where the ray runs along the axis or in the
   * ring's plane, which has no answer worth following. */
  function dragReading(d) {
    const ray = pointerRay().ray;
    gv.o.copy(ray.origin);
    gv.d.copy(ray.direction);
    gv.a.set(d.axis.x, d.axis.y, d.axis.z);
    gv.p.set(d.pivot.x, d.pivot.y, d.pivot.z);
    gv.w.subVectors(gv.p, gv.o);
    const b = gv.a.dot(gv.d);
    if (d.kind === 'move') {
      const den = 1 - b * b;
      if (den < 1e-4) {
        return null;
      }
      return (b * gv.d.dot(gv.w) - gv.a.dot(gv.w)) / den;
    }
    if (Math.abs(b) < 1e-3) {
      return null;
    }
    const t = gv.a.dot(gv.w) / b;
    if (t < 0) {
      return null;
    }
    return gv.o.clone().addScaledVector(gv.d, t).sub(gv.p);
  }

  function startDrag(name) {
    const el = elementById(doc, selected);
    const h = gizmo.kindOf(name);
    const axes = gizmoAxes(el);
    const d = {
      name, kind: h.kind, axisName: h.axis, axis: h.kind === 'move' ? axes.move[h.axis] : axes.turn[h.axis],
      pivot: axes.pivot, pose0: poseOf(el), before: snapshot(), moved: false,
    };
    const start = dragReading(d);
    if (start === null) {
      return;
    }
    d.start = start;
    drag = d;
  }

  function dragMove() {
    const now = dragReading(drag);
    if (now === null) {
      return;
    }
    const el = elementById(doc, selected);
    setPose(el, drag.pose0.base, drag.pose0.quat);
    if (drag.kind === 'move') {
      let s = now - drag.start;
      if (grid) {
        s = Math.round(s / GRID_STEP) * GRID_STEP;
      }
      const a = drag.axis;
      const b = drag.pose0.base;
      setPose(el, { x: b.x + a.x * s, y: b.y + a.y * s, z: b.z + a.z * s }, drag.pose0.quat);
      drag.moved = drag.moved || s !== 0;
    } else {
      gv.a.set(drag.axis.x, drag.axis.y, drag.axis.z);
      gv.v.crossVectors(drag.start, now);
      let angle = Math.atan2(gv.a.dot(gv.v), drag.start.dot(now));
      if (grid) {
        angle = Math.round(angle / TURN_STEP) * TURN_STEP;
      }
      /* The ring's axis is the gate's own up, across or travel, and
       * turnGate turns about its local +y, +x, +z: across and travel point
       * along -x and -z (course.js axesOf). */
      const next = turnGate(el, drag.axisName, drag.axisName === 'yaw' ? angle : -angle);
      setPose(el, next.base, next.quat);
      drag.moved = drag.moved || angle !== 0;
    }
    place(meshes.get(selected), el);
  }

  function endDrag() {
    const d = drag;
    drag = null;
    if (d.moved) {
      commit(d.before);
    }
  }

  function updateGizmo() {
    const el = selected && !aiming() && !order && !carry && state === 'building' ? elementById(doc, selected) : null;
    gizmo.group.visible = Boolean(el);
    if (el) {
      gizmo.place(gizmoAxes(el), camera.position);
    }
  }

  function save() {
    say(saveTrack(doc) ? str('build.saved', { name: doc.name }) : str('build.save_failed'));
  }

  /*
   * Put the track on the public board, through the shell's own publish
   * (host.publish, main.js), a dialog asking the track's name and the
   * pilot's board name. The mouse is let go first, because
   * the dialog is typed into. What comes back is the track as published,
   * which is a new id when the board already held this one from another
   * browser, so the builder carries on editing THAT, not the copy it sent.
   */
  let publishing = false;
  async function publish() {
    if (!raceGatesOf(doc).length) {
      say(str('build.place_first'));
      return;
    }
    if (publishing || !host.publish) {
      return;
    }
    unlock();
    publishing = true;
    try {
      const out = await host.publish(doc);
      if (out && out.text) {
        say(out.text, 4200);
      }
      if (out && out.doc && state === 'building') {
        const next = normalize(out.doc).doc;
        saveTrack(next);
        adopt(next);
      }
    } finally {
      publishing = false;
    }
  }

  /* The next saved track for this map, round the list. */
  function openNext() {
    const list = listMapTracks(view.id);
    if (!list.length) {
      say(str('build.none_saved'));
      return;
    }
    const at = list.findIndex((d) => d.id === doc.id);
    adopt(list[(at + 1) % list.length]);
    say(str('build.opened', { name: doc.name, n: raceGatesOf(doc).length }));
  }

  function fresh() {
    if (doc.elements.length) {
      saveTrack(doc);
    }
    adopt(newCourse(view.id, str('build.untitled')));
    say(str('build.new_track'));
  }

  /* Another track: its own undo, nothing of the last one's in hand. */
  function adopt(next) {
    doc = next;
    selected = null;
    carry = null;
    order = null;
    history.clear();
    autosave.schedule(doc);
    rebuildAll();
  }

  /* ---------------------------------------------------------------- */
  /* States                                                            */
  /* ---------------------------------------------------------------- */

  /* The flight's own overlays, off while building. The music dock goes too:
   * in flight it sits in the top left corner, right over the build panel,
   * and a record's name there read as the name of the track being built.
   * And the aircraft chip: a swap is for a flight, and the test flight
   * (B) has it. */
  function hideShellHud(on) {
    if (on) {
      hidden = [ui.osd, ui.banner, ui.lock, ui.musicDock, ui.swapChip].filter(Boolean).map((el) => [el, el.style.visibility]);
      for (const [el] of hidden) {
        el.style.visibility = 'hidden';
      }
    } else {
      for (const [el, was] of hidden) {
        el.style.visibility = was;
      }
      hidden = [];
    }
  }

  /* Build `next`, or the track left open in this world when B is pressed
   * in a flight, or a new one when there is none. */
  function enter(next) {
    view = host.view();
    craftId = airframeById(ui.settings.airframe).id;
    if (hotbarKind(craftId) !== barKind) {
      barKind = hotbarKind(craftId);
      hotbar = loadHotbar(barKind);
      slot = 0;
    }
    const saved = next === undefined ? readMapAutosave(view.id) : null;
    doc = next || (saved ? saved.doc : newCourse(view.id, str('build.untitled')));
    history.clear();
    root = new THREE.Group();
    root.name = 'build-track';
    view.scene.add(root);
    root.add(gizmo.group);
    state = 'building';
    rebuildAll();
    cameraFromShell();
    tested = false;
    host.hold();
    showLine();
    showHud(true);
    hideShellHud(true);
    lock();
    say(str('build.entered', { n: raceGatesOf(doc).length }), 3600);
  }

  /* The view's course, swapped for the built one for a run. */
  function seatCourse(gates) {
    patched = {
      gates: view.gates, setNextGate: view.setNextGate, targetAim: view.targetAim, approachSide: view.approachSide, spawn: view.spawn, mode: view.mode,
    };
    view.gates = gates;
    view.setNextGate = setNextGate;
    view.targetAim = () => aim;
    view.approachSide = approachSide;
    view.spawn = startFor(gates, host.heightAt);
    view.mode = 'race';
  }

  function unseatCourse() {
    if (!patched) {
      return;
    }
    Object.assign(view, patched);
    patched = null;
    courseGates = [];
    aim.active = false;
  }

  function setNextGate(i) {
    for (const gt of courseGates) {
      dressGate(gt, 'dark');
    }
    const target = courseGates[i];
    if (!target) {
      aim.active = false;
      aim.sceneIndex = -1;
      return;
    }
    lightTarget(target);
    aim.travel = target.axes.travel;
    aim.centre.set(target.centre.x, target.centre.y, target.centre.z);
    aim.clearH = target.aperture.clearH;
    aim.sceneIndex = i;
    aim.active = true;
    sideNow();
  }

  function approachSide(x, y, z) {
    if (!aim.active) {
      return null;
    }
    return (x - aim.centre.x) * aim.travel.x + (y - aim.centre.y) * aim.travel.y + (z - aim.centre.z) * aim.travel.z < 0;
  }

  /* Green from the side the target is flown from, red from behind, every
   * frame, the way the field colours its own target. */
  function sideNow() {
    if (!aim.active) {
      return;
    }
    const p = camera.position;
    aim.distance = p.distanceTo(aim.centre);
    aim.correct = approachSide(p.x, p.y, p.z);
    colourTargetSide(courseGates[aim.sceneIndex], aim.correct);
  }

  /* The race gates with the meshes the race lights, as the view's course. */
  function courseFrom(gates) {
    return gates.map((g) => ({ ...g, ...dressable(meshes.get(g.elementId), 0), aperture: g.aperture, cue: '' }));
  }

  /*
   * A published map track, seated for a race: `plain` is the document as
   * the board serves it. Its gates are built and made solid in the valley
   * and become the view's course, and the shell makes the race over them
   * (main.js seatMapCourse). Returns the course, or null when the document
   * has no gate to race or is not for this world.
   */
  function race(plain) {
    exit(false);
    view = host.view();
    const next = normalize(plain).doc;
    if (next.map !== view.id) {
      view = null;
      return null;
    }
    const gates = raceGatesOf(next);
    if (!gates.length) {
      view = null;
      return null;
    }
    craftId = airframeById(ui.settings.airframe).id;
    doc = next;
    root = new THREE.Group();
    root.name = 'build-track';
    view.scene.add(root);
    state = 'racing';
    rebuildAll();
    courseGates = courseFrom(gates);
    seatCourse(courseGates);
    showLine();
    return courseGates;
  }

  function startTest() {
    if (order) {
      finishOrder();
    }
    const gates = raceGatesOf(doc);
    if (!gates.length) {
      say(str('build.place_first'));
      return;
    }
    carry = null;
    drag = null;
    parked = { pos: cam.pos.clone(), yaw: cam.yaw, pitch: cam.pitch };
    courseGates = courseFrom(gates);
    for (const m of meshes.values()) {
      m.group.visible = true;
    }
    if (ghost) {
      ghost.group.visible = false;
    }
    gizmo.group.visible = false;
    seatCourse(courseGates);
    host.setCourse(courseGates, `.build.${doc.id}`);
    state = 'testing';
    tested = true;
    /* The flight's menus are clicked, so the mouse is the pilot's again. */
    unlock();
    showLine();
    showHud(false);
    hideShellHud(false);
    host.fly();
  }

  function backToBuild() {
    unseatCourse();
    host.setCourse([], '');
    host.hold();
    if (parked) {
      cam.pos.copy(parked.pos);
      cam.yaw = parked.yaw;
      cam.pitch = parked.pitch;
    }
    cam.vel.set(0, 0, 0);
    state = 'building';
    showLine();
    lastRay.origin.set(Infinity, 0, 0);
    hitRay.exact = false;
    dressKey = '';
    dressAll();
    showHud(true);
    hideShellHud(true);
    lock();
  }

  /*
   * My tracks' Edit (`next`, a saved track in this world) and New track
   * (`next` null): build it with the free camera where its test flight
   * starts, or at the world's spawn for a track with no gate yet. Escape out
   * of it goes back to My tracks rather than into a flight (stepBack).
   */
  function open(next) {
    exit(false);
    enter(next ? normalize(next).doc : null);
    fromMenu = true;
    const gates = raceGatesOf(doc);
    const start = gates.length ? startFor(gates, host.heightAt) : null;
    const spot = start || view.spawn;
    const y = start && start.air ? start.air.y : host.heightAt(spot.x, spot.z) + OPEN_EYE;
    cam.pos.set(spot.x, Math.max(y, host.heightAt(spot.x, spot.z) + OPEN_EYE), spot.z);
    cam.yaw = spot.yaw;
    cam.pitch = OPEN_PITCH;
    cam.vel.set(0, 0, 0);
  }

  /*
   * Leave building altogether. `resume` is false when the shell is taking
   * the world away (a map swap, the title): the run is not ours to restart
   * then, only our patches to take back.
   *
   * A track with anything in it goes into the library on the way out, so
   * what was built is on My tracks whichever way the builder was left. A
   * published track seated for a race (racing) is the seat's, not a build.
   */
  function exit(resume = false) {
    if (state === 'off') {
      return;
    }
    const wasTesting = state === 'testing';
    if (state !== 'racing' && doc.elements.length) {
      saveTrack(doc);
    }
    fromMenu = false;
    autosave.flush();
    unseatCourse();
    if (view) {
      host.setCourse([], '');
    }
    for (const m of meshes.values()) {
      disposeStandaloneGate(m.made);
    }
    meshes.clear();
    solidify();
    if (ghost) {
      disposeStandaloneGate(ghost.made);
      ghost = null;
    }
    disposeLine();
    disposeBadges();
    gizmo.group.removeFromParent();
    if (root) {
      root.removeFromParent();
      root = null;
    }
    selected = null;
    hovered = null;
    carry = null;
    order = null;
    drag = null;
    state = 'off';
    showHud(false);
    hideShellHud(false);
    unlock();
    if (resume) {
      /* A test flight moved the aircraft to the track, so free flight
       * starts over from the map's own spawn; otherwise it carries on from
       * where it was parked. */
      if (tested || wasTesting) {
        host.fly();
      } else {
        host.resume();
      }
    }
    view = null;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

  /* The keys, from main.js's key hook. True when the key was building's. */
  function onKey(code, repeat) {
    if (state === 'off') {
      if (code === 'KeyB' && !repeat && host.canBuild()) {
        enter();
        return true;
      }
      return false;
    }
    if (state === 'testing') {
      if (code === 'KeyB' && !repeat && host.onFlightScreen()) {
        backToBuild();
        return true;
      }
      return false;
    }
    /* A published track is the pilot's run: every key is the flight's. */
    if (state === 'racing') {
      return false;
    }
    /* Building owns the keyboard: nothing reaches the flight keys (R would
     * restart a run nobody is flying). F8 still files a bug. */
    if (code === 'F8') {
      return false;
    }
    if (hud && hud.inventoryOpen) {
      if (!repeat && (code === 'KeyE' || code === 'Escape')) {
        closeInventory();
      }
      return true;
    }
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && !repeat) {
      shiftAt = performance.now();
    }
    /* R turns it left, T tips its top away from the pilot (a dive gate,
     * the tilt a track asks for most), Y rolls it; Shift the other way. */
    const turnKeys = { KeyR: ['yaw', 1], KeyT: ['pitch', -1], KeyY: ['roll', 1] };
    if (turnKeys[code] && !ctrlHeld()) {
      const [axis, dir] = turnKeys[code];
      shiftChord = shiftChord || shiftHeld();
      rotate(axis, shiftHeld() ? -dir : dir);
      return true;
    }
    if (repeat) {
      return true;
    }
    if (ctrlHeld()) {
      const withCtrl = {
        KeyZ: () => undo(!shiftHeld()),
        KeyY: () => undo(false),
        KeyD: duplicate,
        KeyS: save,
        KeyO: openNext,
      };
      if (withCtrl[code]) {
        withCtrl[code]();
      }
      return true;
    }
    if (code === 'KeyW') {
      const now = performance.now();
      sprint = now - lastW < DOUBLE_TAP_MS;
      lastW = now;
      return true;
    }
    const at = SLOT_KEYS.indexOf(code);
    if (at >= 0) {
      setSlot(at);
      return true;
    }
    const act = {
      KeyB: startTest,
      KeyE: openInventory,
      KeyF: toggleCarry,
      KeyG: () => {
        grid = !grid;
      },
      KeyO: toggleOrder,
      KeyN: fresh,
      KeyH: () => {
        showHelp = !showHelp;
        writeStore(HELP_KEY, showHelp);
        paintHelp();
      },
      KeyV: toggleLine,
      KeyC: () => cycleCraft(shiftHeld() ? -1 : 1),
      KeyP: publish,
      Minus: () => setSpeed(speedIndex - 1),
      NumpadSubtract: () => setSpeed(speedIndex - 1),
      Equal: () => setSpeed(speedIndex + 1),
      NumpadAdd: () => setSpeed(speedIndex + 1),
      Escape: stepBack,
    };
    if (act[code]) {
      act[code]();
    }
    /* Every other key is swallowed too, for the same reason as R. */
    return true;
  }

  function stepBack() {
    if (performance.now() - unlockedAt < UNLOCK_GRACE_MS) {
      return;
    }
    if (order) {
      finishOrder();
      return;
    }
    if (carry) {
      putBack();
      return;
    }
    if (locked()) {
      unlock();
      return;
    }
    if (selected) {
      selected = null;
      dressAll();
      return;
    }
    /* Opened from My tracks, back to My tracks; from a flight, back into
     * it. */
    const back = fromMenu;
    exit(!back);
    if (back) {
      host.leave();
    }
  }

  /* Browser defaults the builder's keys would otherwise trigger: Ctrl+S,
   * Ctrl+O and Ctrl+D open the browser's own dialogs, Ctrl+Z and Ctrl+Y
   * its undo, a lone Alt its menu on some systems, and P types itself into
   * the dialog it opens. Only while building. */
  function onKeyDownCapture(e) {
    if (state !== 'building') {
      return;
    }
    /* The publish dialog's fields own their keys. */
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
      return;
    }
    /* P opens the publish dialog and focuses its name field on this very
     * keydown, so the key's own character would be typed over the track's
     * name. */
    const mine = e.code === 'AltLeft' || e.code === 'AltRight'
      || ((e.ctrlKey || e.metaKey) && ['KeyS', 'KeyO', 'KeyD', 'KeyZ', 'KeyY'].includes(e.code))
      || (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey);
    if (mine) {
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKeyDownCapture, true);
  window.addEventListener('keyup', (e) => {
    if (state === 'building' && (e.code === 'AltLeft' || e.code === 'AltRight')) {
      e.preventDefault();
    }
  }, true);

  function setCursor(e) {
    cursor = { x: e.clientX, y: e.clientY };
  }

  shell.canvas.addEventListener('mousedown', (e) => {
    if (state !== 'building' || (hud && hud.inventoryOpen)) {
      return;
    }
    if (e.button === 1) {
      /* No autoscroll, no paste. */
      e.preventDefault();
    }
    const air = e.altKey || altHeld();
    if (locked()) {
      trackHover();
      if (e.button === 0) {
        primary(air);
      } else if (e.button === 2 && hovered) {
        remove(hovered);
      } else if (e.button === 1 && hovered) {
        pickPiece(hovered);
      }
      return;
    }
    setCursor(e);
    trackHover();
    const ray = pointerRay();
    if (e.button === 0) {
      const handle = selected ? gizmo.handleOn(ray) : null;
      if (handle) {
        startDrag(handle);
      } else if (hovered && order) {
        orderClick(hovered);
      } else if (hovered) {
        selected = hovered;
        dressKey = '';
        dressAll();
      } else {
        /* The world: back to flying, the way a click takes the mouse back
         * into a game. */
        lock();
      }
    } else if (e.button === 2) {
      if (hovered) {
        remove(hovered);
      } else {
        mouse.dragging = true;
      }
    } else if (e.button === 1 && hovered) {
      pickPiece(hovered);
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      mouse.dragging = false;
    }
    if (e.button === 0 && drag) {
      endDrag();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (state !== 'building') {
      return;
    }
    if (locked() || mouse.dragging) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
      return;
    }
    setCursor(e);
    if (drag) {
      dragMove();
    }
  });
  shell.canvas.addEventListener('wheel', (e) => {
    if (state !== 'building') {
      return;
    }
    /* Ctrl with the wheel would zoom the page. */
    e.preventDefault();
    const notch = Math.sign(e.deltaY);
    if (e.ctrlKey || ctrlHeld()) {
      setDistance(airDistance - notch * AIR_NOTCH);
    } else if (notch) {
      setSlot(slot + notch);
    }
  }, { passive: false });
  shell.canvas.addEventListener('contextmenu', (e) => {
    if (state === 'building') {
      e.preventDefault();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (locked()) {
      cursor = null;
      gizmo.hover(null);
    } else {
      unlockedAt = performance.now();
      /* Freeing the mouse puts back what was carried: a carried gate
       * follows the crosshair, and a free mouse has none. */
      if (carry) {
        putBack();
      }
    }
    dressKey = '';
    dressAll();
  });

  /*
   * The pad's buttons, as edges, and only on a pad the browser maps to the
   * standard layout. A radio in joystick mode reports its SWITCHES as
   * buttons, in whatever order its firmware chose, and one of them landing
   * on Back would throw a pilot into the builder mid flight the moment they
   * flicked it. A radio still drives the camera with its sticks.
   */
  function readPad() {
    const gp = input.firstGamepad();
    const now = [];
    if (gp && gp.buttons && gp.mapping === 'standard') {
      for (let i = 0; i < gp.buttons.length; i += 1) {
        now.push(Boolean(gp.buttons[i] && gp.buttons[i].pressed));
      }
    }
    const was = padPrev;
    padPrev = now;
    return {
      gp,
      down: (i) => Boolean(now[i]),
      pressed: (i) => Boolean(now[i]) && !was[i],
    };
  }

  /* A pad: A places (R3 held hangs it in the air), X removes, Y picks up
   * and puts down, B steps back, the bumpers walk the hotbar, the d-pad
   * turns and tilts, Start saves and Back flies it. */
  function padActions(p) {
    if (p.pressed(PAD.back)) {
      startTest();
      return;
    }
    if (hud && hud.inventoryOpen) {
      if (p.pressed(PAD.b)) {
        closeInventory();
      }
      return;
    }
    if (p.pressed(PAD.a)) {
      primary(p.down(PAD.rs));
    }
    if (p.pressed(PAD.x) && hovered) {
      remove(hovered);
    }
    if (p.pressed(PAD.y)) {
      toggleCarry();
    }
    if (p.pressed(PAD.b) && (carry || order)) {
      stepBack();
    }
    if (p.pressed(PAD.lb)) {
      setSlot(slot - 1);
    }
    if (p.pressed(PAD.rb)) {
      setSlot(slot + 1);
    }
    if (p.pressed(PAD.left)) {
      rotate('yaw', 1);
    }
    if (p.pressed(PAD.right)) {
      rotate('yaw', -1);
    }
    if (p.pressed(PAD.up)) {
      rotate('pitch', -1);
    }
    if (p.pressed(PAD.down)) {
      rotate('pitch', 1);
    }
    if (p.pressed(PAD.start)) {
      save();
    }
  }

  /* ---------------------------------------------------------------- */
  /* The frame                                                         */
  /* ---------------------------------------------------------------- */

  /*
   * Once a frame from main.js, after the shell has placed its own camera
   * and before the world is drawn. Cheap when off: one pad read.
   */
  function frame(dtMs) {
    const p = readPad();
    if (state === 'off') {
      if (p.pressed(PAD.back) && host.canBuild()) {
        enter();
      }
      return;
    }
    /* A published track sits under the title too, between its runs: only a
     * new world takes it away, and the shell unseats it itself when the
     * pilot picks another course in the same one. */
    if (state === 'racing') {
      if (host.view() !== view) {
        exit(false);
        return;
      }
      sideNow();
      return;
    }
    if (host.view() !== view || host.mode() === 'title') {
      /* The shell took the run somewhere else: the title, or a new world. */
      exit(false);
      return;
    }
    if (state === 'testing') {
      if (p.pressed(PAD.back) && host.onFlightScreen()) {
        backToBuild();
        return;
      }
      sideNow();
      return;
    }
    if (host.mode() !== 'paused') {
      /* Something resumed the plant under us (a menu); park it again. */
      host.hold();
    }
    padActions(p);
    if (state !== 'building') {
      return;
    }
    const dtS = Math.min(0.1, dtMs / 1000);
    driveCamera(dtS, p.gp, p.down);
    shell.quad.visible = true;
    trackCrosshair(performance.now());
    trackHover();
    updateGhost();
    updateGizmo();
    updateHud();
  }

  /* ---------------------------------------------------------------- */
  /* The display                                                       */
  /* ---------------------------------------------------------------- */

  function paintHotbar() {
    hud.setHotbar(hotbar.map((id) => ({ icon: icons.get(id), name: pieceName(pieceById(id)) })), slot);
  }

  function paintHelp() {
    const rows = showHelp ? HELP_ROWS.map((k) => str(`build.help_${k}`).split('\t')) : null;
    hud.setHelp(str('build.help_title'), rows, str('build.help_foot'), str('build.help_hidden'));
  }

  function showHud(on) {
    if (on && !hud) {
      hud = createHud({
        onSlot: (i) => setSlot(i),
        onAssign: (id, i) => {
          const at = i >= 0 ? i : slot;
          hotbar[at] = id;
          writeStore(HOTBARS[barKind].key, hotbar);
          setSlot(at);
        },
      });
      icons = pieceIcons(renderer, PIECES, (piece) => {
        const { made } = buildPiece(piece);
        return { group: made.group, hide: lightParts(made), made };
      }, (m) => disposeStandaloneGate(m.made));
      paintHotbar();
      paintHelp();
      hudText = '';
    }
    if (hud) {
      hud.show(on);
    }
  }

  function openInventory() {
    unlock();
    carry = null;
    const shelves = PIECE_CATS.map((cat) => ({
      title: str(`build.cat_${cat}`),
      pieces: PIECES.filter((p) => p.cat === cat).map((p) => ({ id: p.id, name: pieceName(p), icon: icons.get(p.id) })),
    }));
    hud.openInventory(str('build.inventory_title'), str('build.inventory_hint', { n: slot + 1 }), shelves);
  }

  function closeInventory() {
    hud.closeInventory();
    lock();
  }

  function fmtM(m) {
    return m.toFixed(1);
  }

  /* The line along the bottom: what the mouse is doing now, or the piece,
   * the snap, the grid and the speed. Red when the ghost is. */
  function statusLine() {
    const gates = raceGatesOf(doc);
    if (order) {
      return { text: str('build.status_order', { n: order.picked.length + 1, count: gates.length }) };
    }
    if (!aiming()) {
      return { text: str(selected ? 'build.status_free' : 'build.status_free_none') };
    }
    const trouble = ghost && ghost.group.visible ? ghost.trouble : null;
    if (trouble) {
      return { text: str(`build.ghost_${trouble.code}`, { n: trouble.n }), warn: true };
    }
    if (carry) {
      return { text: str(carry.id ? 'build.status_carry' : 'build.status_copy', { n: orderOf(doc, carry.id) + 1 }) };
    }
    const mode = ghost && ghost.pose ? ghost.pose.mode : 'air';
    return {
      text: str('build.status', {
        piece: pieceName(handPiece()),
        snap: str(`build.snap_${mode}`, { distance: Math.round(airDistance) }),
        grid: str(grid ? 'build.grid_on' : 'build.grid_off'),
        speed: SPEEDS[speedIndex],
      }),
    };
  }

  function updateHud() {
    if (!hud) {
      return;
    }
    hud.tick();
    hud.setCrosshair(aiming());
    const gates = raceGatesOf(doc);
    const lines = [str('build.title', { name: doc.name, n: gates.length })];
    if (ghost && ghost.pose && ghost.group.visible) {
      if (!hit && !altHeld()) {
        lines.push(str('build.no_surface'));
      }
      const c = new THREE.Vector3(0, ghost.centreY, 0).applyQuaternion(ghost.group.quaternion).add(ghost.group.position);
      const above = c.y - host.heightAt(c.x, c.z);
      const last = carry ? null : gates[gates.length - 1];
      if (last) {
        const d = Math.hypot(c.x - last.centre.x, c.y - last.centre.y, c.z - last.centre.z);
        lines.push(str('build.ghost_readout_from', {
          height: fmtM(above), n: gates.length, distance: fmtM(d), drop: fmtM(last.centre.y - c.y),
        }));
      } else {
        lines.push(str('build.ghost_readout', { height: fmtM(above) }));
      }
    }
    const about = selected && !aiming() ? selected : null;
    if (about) {
      const i = orderOf(doc, about);
      const r = readoutFor(gates, i, host.heightAt);
      if (r) {
        lines.push(r.next
          ? str('build.selected_readout_next', {
            n: i + 1, count: gates.length, height: fmtM(r.height), next: r.next.order + 1, distance: fmtM(r.next.distance), drop: fmtM(r.next.drop),
          })
          : str('build.selected_readout', { n: i + 1, count: gates.length, height: fmtM(r.height) }));
      }
      const step = stepOf(doc, about);
      if (step && step.passSide) {
        lines.push(str(`build.pass_${step.passSide}`));
      }
    }
    lines.push(...lineLines());
    if (message.text && performance.now() < message.until) {
      lines.push(message.text);
    }
    const s = statusLine();
    hud.setPanel(lines.join('\n'));
    hud.setStatus(s.text, Boolean(s.warn));
    hudText = `${lines.join('\n')}\n${s.text}`;
  }

  /* ---------------------------------------------------------------- */
  /* The harness                                                       */
  /* ---------------------------------------------------------------- */

  /* What scripts/build-check.js reads and drives. Nothing in the product
   * calls it. */
  window.__build = {
    state: () => ({
      state,
      map: view ? view.id : null,
      doc: doc ? JSON.parse(JSON.stringify(doc)) : null,
      selected,
      hovered,
      carry: carry ? { id: carry.id, piece: carry.piece.id } : null,
      order: order ? order.picked.slice() : null,
      locked: locked(),
      grid,
      airDistance,
      speed: SPEEDS[speedIndex],
      sprint,
      velocity: cam.vel.toArray(),
      hotbar: hotbar.slice(),
      slot,
      piece: hotbar[slot],
      type: pieceById(hotbar[slot]).type,
      inventory: Boolean(hud && hud.inventoryOpen),
      help: showHelp,
      history: history.depth,
      hit: hit ? { point: hit.point.toArray(), normal: hit.normal.toArray(), distance: hit.distance } : null,
      /* Where the reading above was taken from, so a harness can wait for
       * the one taken along the camera's current ray. */
      hitRay: { origin: hitRay.origin.toArray(), dir: hitRay.dir.toArray(), exact: hitRay.exact, ageMs: performance.now() - hitAt, asked, restMs: performance.now() - movedAt },
      ghost: ghost && ghost.pose ? {
        base: [ghost.pose.base.x, ghost.pose.base.y, ghost.pose.base.z],
        quat: [ghost.pose.quat.x, ghost.pose.quat.y, ghost.pose.quat.z, ghost.pose.quat.w],
        mode: ghost.pose.mode,
        visible: ghost.group.visible,
        trouble: ghost.trouble,
        colour: `#${ghostMat.color.getHexString()}`,
      } : null,
      gizmo: gizmo.group.visible,
      handle: gizmo.hovered,
      dragging: drag ? drag.name : null,
      badges: badges ? badges.children.map((b) => ({ id: b.userData.elementId, text: b.userData.text, look: b.userData.look })) : [],
      gates: doc ? raceGatesOf(doc).map((g) => ({
        id: g.elementId, centre: [g.centre.x, g.centre.y, g.centre.z], travel: [g.axes.travel.x, g.axes.travel.y, g.axes.travel.z], up: [g.axes.up.x, g.axes.up.y, g.axes.up.z],
      })) : [],
      camera: { pos: cam.pos.toArray(), yaw: cam.yaw, pitch: cam.pitch, forward: forward(new THREE.Vector3()).toArray() },
      hud: hudText,
      /* The last line said to the author, however long ago: on a software
       * rasteriser the frame after a publish can outlast its display. */
      message: message.text,
      line: {
        on: lineOn,
        craft: craftId,
        limits: craftId ? craft() : null,
        samples: line.samples.length,
        gateAt: line.gateAt.slice(),
        slowest: line.samples.reduce((m, p) => Math.min(m, p.v), Infinity),
        over: line.samples.filter((p) => !p.ok).length,
        ribbon: ribbon ? {
          inScene: Boolean(view && ribbon.parent && ribbon.parent.parent === root && root.parent === view.scene),
          visible: ribbon.visible,
          vertices: ribbon.geometry.attributes.position.count,
          opacity: ribbonMat.opacity,
        } : null,
        markers: markers ? markers.children.length : 0,
      },
      warnings: warnings.map((w) => ({
        code: w.code, gate: w.gate, next: w.next ?? null, pos: [w.pos.x, w.pos.y, w.pos.z], value: w.value ?? null, limit: w.limit ?? null,
      })),
    }),
    /* Where a point of the scene is on the page, client px, and whether it
     * is in front of the camera. */
    screenOf(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = shell.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, front: v.z < 1 };
    },
    /* The page point of a gizmo handle, and of a gate's number badge. */
    handleAt(name, deg) {
      const p = gizmo.pointOn(name, deg);
      return window.__build.screenOf(p.x, p.y, p.z);
    },
    badgeAt(id) {
      const m = meshes.get(id);
      return m ? window.__build.screenOf(m.top.x, m.top.y, m.top.z) : null;
    },
    /* The hotbar's slots and the inventory's tiles on the page. */
    rects: () => (hud ? hud.rects() : null),
    /* What working the line and the warnings out again costs, the mean of
     * n, milliseconds. */
    lineMs(n = 5) {
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) {
        refreshLine();
      }
      return { ms: (performance.now() - t0) / n, gates: raceGatesOf(doc).length, samples: line.samples.length };
    },
    /* What the line adds to every frame on the main thread: the panel's
     * lines about it, the mean of n, milliseconds. */
    lineFrameMs(n = 1000) {
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) {
        lineLines();
      }
      return (performance.now() - t0) / n;
    },
    /* What the builder's own work adds to a frame on the main thread, the
     * mean of n, milliseconds: the hover ray, the ghost with its red test
     * forced to run, the gizmo and the panels. */
    buildFrameMs(n = 200) {
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) {
        if (ghost) {
          ghost.poseKey = '';
        }
        trackHover();
        updateGhost();
        updateGizmo();
        updateHud();
      }
      return (performance.now() - t0) / n;
    },
    /* The line's points, every `step`th, [x, y, z, speed, ok]. */
    linePoints(step = 1) {
      return line.samples.filter((_, i) => i % step === 0).map((p) => [p.x, p.y, p.z, p.v, p.ok]);
    },
    /* A solid of the map's own of one kind (none of the forest, none of the
     * built gates), as its centre and size, so a harness can put a gate in
     * it: the nearest to (x, z). */
    findSolid(kind, x, z) {
      const c = view.colliders;
      const k = KINDS.indexOf(kind);
      let best = null;
      for (let i = 0; i < c.baseCount; i += 1) {
        if (c.fkind[i] !== k) {
          continue;
        }
        const cx = (c.fax[i] + c.fbx[i]) / 2;
        const cy = (c.fay[i] + c.fby[i]) / 2;
        const cz = (c.faz[i] + c.fbz[i]) / 2;
        const size = c.fbox[i]
          ? [c.fbx[i] - c.fax[i], c.fby[i] - c.fay[i], c.fbz[i] - c.faz[i]]
          : [2 * c.fr[i], 2 * c.fr[i], 2 * c.fr[i]];
        const d = Math.hypot(cx - x, cz - z);
        if (Math.min(...size) > 4 && (!best || d < best.d)) {
          best = { centre: [cx, cy, cz], size, box: Boolean(c.fbox[i]), d };
        }
      }
      return best;
    },
    /* Put the free camera somewhere, looking along yaw and pitch, at rest. */
    look(x, y, z, yaw, pitch) {
      cam.pos.set(x, y, z);
      cam.yaw = yaw;
      cam.pitch = pitch;
      cam.vel.set(0, 0, 0);
      return true;
    },
    /* The exact pick for the crosshair as it is now. */
    pickNow() {
      const h = picker.pick(view.scene, cam.pos, forward(fwd), excluded());
      return h ? { point: h.point.toArray(), normal: h.normal.toArray(), distance: h.distance } : null;
    },
    library: () => (view ? listMapTracks(view.id).map((d) => ({ id: d.id, name: d.name, gates: d.sequence.length })) : []),
    rename(name) {
      doc.name = String(name);
      touch(doc);
      autosave.schedule(doc);
      return doc.name;
    },
  };

  return {
    onKey,
    frame,
    exit,
    race,
    open,
    get racing() {
      return state === 'racing';
    },
    get active() {
      return state !== 'off';
    },
    get testing() {
      return state === 'testing';
    },
    /* True while the builder's own camera is the one drawn. */
    get cameraLive() {
      return state === 'building';
    },
  };
}
