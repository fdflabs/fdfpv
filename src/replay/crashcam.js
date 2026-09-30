/*
 * crashcam.js: the crash cam. Watch, direct and keep what just happened.
 *
 * The owner's request: "a crash cam. We are going to have lots of funny
 * mishaps where I lose a wing and keep going. When something like that
 * happens and you crash, there should be an option to play back and edit
 * what just happened, reanimate it, and save those shots."
 *
 * Four parts, each its own file:
 *   recorder.js  the last 30 s of what was drawn, always on in flight;
 *   peers.js, peerscene.js  the other pilots in a room, in the same rows,
 *                and drawn again;
 *   journal.js   the plant's copies and calls, for TAKE OVER;
 *   edit.js      the movie: shots, cuts, speeds, and how they map to time;
 *   cameras.js   where the replay's camera is, for a rig or an edit;
 *   file.js, store.js  a replay as bytes, and My clips;
 *   editor.js    the screen.
 * This one joins them to the shell: it records a row a frame, raises the
 * REPLAY prompt after a crash, and while the editor is open it draws the
 * replay with a craft and a wreck of its own (the live ones are hidden and
 * left exactly as they were), points the camera, plays the sound, and
 * writes pictures, movies and replays.
 *
 * THE EDIT CLOCK. A replay always plays an edit (src/replay/edit.js): one
 * Chase shot over the whole clip until the pilot cuts it. While it plays,
 * movie time advances with the wall clock and the picture is the movie
 * frame under it, at the frame rate the movie is exported at. Every frame
 * between the last one drawn and that one is stepped in order, the debris,
 * the smoke and the paper each advanced by exactly that frame's clip time,
 * so a slow display skips pictures and never changes them, and an export,
 * which steps the same frames one by one, draws the same ones.
 *
 * While the editor is open the shell is in mode 'replay': nothing steps
 * the plant. Closing it returns to flight where it was. TAKE OVER puts the
 * plant back at the frame on the playhead (src/replay/journal.js) and the
 * pilot flies on from there, with the momentum the craft had.
 *
 * The shell hands in a `host` of getters and a few actions (src/main.js,
 * where it is made); nothing here reaches into the shell otherwise.
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
import {
  createRecorder, createSample, locate, sampleAt, trimClip, HEAD, HEAD_N, PARTS_MAX, POSE, PART_STATE_STRIDE, SMOKE, SMOKE_N, WINDOW_S,
} from './recorder.js';
import { createPeerRing, peerPose } from './peers.js';
import { createPeerScene } from './peerscene.js';
import { createPaperRing } from './paper.js';
import { createPaperScene } from './paperscene.js';
import { SIZE_MAX } from '../render/explosion.js';
import {
  RIGS, createPose, defaults, evaluate, evaluateEdit, rotate,
} from './cameras.js';
import * as ed from './edit.js';
import {
  decodeReplay, encodeReplay, FILE_EXT, FILE_MAX_BYTES, NAME_MAX, ReplayFileError,
} from './file.js';
import * as store from './store.js';
import { createEditor, EXPORT_PREFS_KEY } from './editor.js';
import { craftBuilderFor } from '../render/craft.js';
import { dressLivery } from '../render/livery.js';
import { createWreck, ROTATION_KINDS, BEND_SHOWN } from '../render/wreck.js';
import { createDebris } from '../render/debris.js';
import { createSmoke, LIFE_S as SMOKE_LIFE_S } from '../render/smoke.js';
import { dressParts } from '../render/partsfit.js';
import { powerOption } from '../../configs/power.js';
import { simPosToThree, simQuatToThree } from '../render/frame.js';
import { partLabel, PART_KINDS } from '../../configs/parts.js';
import { airframeById, retiredAirframe } from '../../configs/airframes.js';
import { str } from '../strings/index.js';

/* The keyboard key and the standard pad button that open the replay. */
export const REPLAY_KEY = 'KeyV';
export const REPLAY_PAD = 2;
/* How long the prompt stays up after a crash, ms. */
const PROMPT_MS = 9000;
/* A crash this long after a part came off is "lost a part and crashed". */
const LOST_PART_S = 30;
const { SPEEDS } = ed;
/* A gap between two times drawn that is still one step forward, s; a
 * bigger one, or any step back, is a jump and the air is rebuilt. */
const FORWARD_S = 0.25;
/* How many movie frames behind the playhead may be stepped through in one
 * display frame before it is a jump instead. */
const CATCH_UP = 6;
/* The wheel, the free camera and a drag not bracketed by the screen end
 * their undo step this long after the last input, ms. */
const GESTURE_IDLE_MS = 400;
/* The letterbox's picture ratio. */
const SCOPE = 2.39;
/* The free camera's speed, m/s, and Shift's multiple; mouse radians per px. */
const FREE_SPEED = 6;
const FREE_FAST = 4;
const LOOK_RATE = 0.004;
const THUMB_W = 320;
const THUMB_H = 180;

export function createCrashCam(host) {
  const { shell, audio, input, journal } = host;
  const rec = createRecorder();
  const peerRing = createPeerRing(rec.capacity);
  const paperRing = createPaperRing(rec.capacity);
  /* Harness only: the paper as recorded, by ring row, while switched on. */
  let paperLog = null;
  /* Harness only: the peers as recorded, by ring row, while switched on. */
  let peerLog = null;
  let recording = true;
  let promptUntil = 0;
  /* The prompt's key while it is up, else null: for the OSD to draw. */
  let promptKey = null;
  let lostPartAt = -1e9;
  const prevStatus = new Int8Array(PARTS_MAX);
  const wasStatus = new Int8Array(PARTS_MAX);
  /* The aircraft and the world the ring holds: a replay is one of each. */
  let ringAirframe = null;
  let ringMap = null;
  const spawnScratch = new Float64Array(8);
  const cost = {
    frames: 0, totalMs: 0, maxMs: 0, snapMs: 0, snapMaxMs: 0, snaps: 0, peerFrames: 0, peerMs: 0, peerMaxMs: 0,
    paperFrames: 0, paperMs: 0, paperMaxMs: 0, paperRow: -1, paperRowMs: 0,
  };
  let padPrev = 0;

  /* The editor's session, null while flying. */
  let S = null;
  /* The movie's frame rate: the edit clock's, the export dialog's last
   * choice (src/replay/editor.js keeps it). */
  let clockFps = 60;

  function lastExportFps() {
    try {
      const fps = JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || '{}').fps;
      return fps === 30 || fps === 60 ? fps : 60;
    } catch (err) {
      /* Storage refused or a bad value: the default. */
      return 60;
    }
  }
  const editor = createEditor(api());

  /* ---- recording, once a frame in flight ---- */

  function record(nowWall) {
    peerRing.begin(-1);
    paperRing.begin(-1);
    if (S) {
      return;
    }
    pollFlightPad();
    /* Up for a while after a crash, and for as long as a wreck lies there.
     * With the FPV OSD on screen the OSD draws it in its own type (the
     * shell hands it promptKey), as it draws the game's banners; the chip
     * is the Game HUD's. */
    const up = host.mode() === 'flight' && host.screen() === 'flight' && (nowWall < promptUntil || host.wrecked());
    promptKey = up ? (padConnected() ? 'X' : 'V') : null;
    editor.prompt(up && !host.osdOn(), promptKey || 'V');
    if (!recording || host.mode() !== 'flight') {
      return;
    }
    const st = host.state();
    if (!st) {
      return;
    }
    const t0 = performance.now();
    if (host.airframe() !== ringAirframe || host.mapId() !== ringMap) {
      /* A new aircraft or a new world: what came before cannot be drawn
       * with this one's model and part table, so it is let go. */
      rec.clear();
      peerRing.clear();
      paperRing.clear();
      prevStatus.fill(0);
      ringAirframe = host.airframe();
      ringMap = host.mapId();
    }
    const i = rec.begin(st[0], nowWall);
    if (i < 0) {
      return;
    }
    peerRing.begin(i);
    paperRing.begin(i);
    paperRing.prune(rec.now(), WINDOW_S);
    const quad = shell.quad;
    rec.anim(i, host.animMs());
    rec.pose(i, quad.position, quad.quaternion);
    rec.drive(i, st[14], st[15], st[16], st[17], host.surfaces(), host.flaps(), st[14]);
    rec.plant(i, st);
    const sm = host.smoke();
    rec.smoke(i, Boolean(sm), sm && sm.nozzle, sm && sm.velocity);
    host.spawn(spawnScratch);
    const sp = rec.spawnIndex(spawnScratch[0], spawnScratch[1], spawnScratch[2], spawnScratch[3],
      spawnScratch[4], spawnScratch[5], spawnScratch[6], spawnScratch[7]);
    const flags = host.flags();
    rec.status(i, journal.mark(), sp, flags, host.wrecked(), host.speed(), host.throttle(), host.agl());
    const parts = host.parts();
    const count = parts ? host.partCount() : 0;
    if (parts && count > 1) {
      rec.parts(i, parts, count);
      partsLeaving(parts, count);
    } else {
      prevStatus.fill(0);
    }
    const ms = performance.now() - t0;
    cost.frames += 1;
    cost.totalMs += ms;
    cost.maxMs = Math.max(cost.maxMs, ms);
    /* The journal's copy, once a second, timed on its own: it is not a
     * cost of every frame. It follows the row, so the row's mark is the
     * end of the stretch before it. */
    if (journal.due(st[0])) {
      const s0 = performance.now();
      journal.snapshot(st[0]);
      const sms = performance.now() - s0;
      cost.snapMs += sms;
      cost.snapMaxMs = Math.max(cost.snapMaxMs, sms);
      cost.snaps += 1;
    }
  }

  /*
   * The other pilots in a room, once the room has drawn them this frame
   * (src/main.js calls it after roomFrame), into the row record() began.
   * `peers` is the room's map of them by seat (src/replay/peers.js add
   * says what each carries), and `bubble` Catch the Ace's bubble as the
   * room drew it (src/render/acebubble.js drawn). A frame record() wrote
   * no row for writes nothing, and with nobody in the room nothing is
   * touched.
   */
  function recordPeers(peers, bubble) {
    if (!peers.size || S) {
      return;
    }
    const t0 = performance.now();
    for (const peer of peers.values()) {
      peerRing.add(peer);
      if (peerLog && peer.rig && peer.rig.group.visible && peerRing.row() >= 0) {
        const p = peer.rig.group.position;
        peerLog.push({ row: peerRing.row(), seat: peer.seat, at: [p.x, p.y, p.z] });
      }
    }
    peerRing.bubble(bubble);
    if (peerRing.row() < 0) {
      return;
    }
    const ms = performance.now() - t0;
    cost.peerFrames += 1;
    cost.peerMs += ms;
    cost.peerMaxMs = Math.max(cost.peerMaxMs, ms);
  }

  /* A part that was on last frame and is off now: a marker, named. */
  function partsLeaving(parts, count) {
    const table = host.partTable();
    const quad = !airframeById(host.airframe()).fixedWing;
    wasStatus.set(prevStatus);
    for (let k = 1; k < count && k < PARTS_MAX; k += 1) {
      const status = parts[k * PART_STATE_STRIDE] !== 0 ? 1 : 0;
      if (status && !wasStatus[k]) {
        const p = table[k];
        /* Only the part whose own joint went: its children leave with it. */
        const parent = p ? p.parent : -1;
        if (!(parent > 0 && wasStatus[parent] === 0 && parts[parent * PART_STATE_STRIDE] !== 0)) {
          rec.event('off', { part: k, label: p ? partLabel(p.kind, p.cg[0], p.cg[1], quad) : String(k) });
        }
        lostPartAt = rec.now();
      }
      prevStatus[k] = status;
    }
  }

  /* From the shell, where it declares a crash: a hard hit or a wreck. */
  function noteCrash(kind) {
    if (S || host.mode() !== 'flight') {
      return;
    }
    /* The one funnel every crash the shell declares goes through, so the
     * bug report's record of it is kept from here (share/crashrecord.js). */
    if (host.onCrash) {
      host.onCrash(kind);
    }
    rec.event('impact', { kind });
    const lost = rec.now() - lostPartAt < LOST_PART_S;
    if (kind === 'wreck' || kind === 'ground' || lost) {
      promptUntil = performance.now() + PROMPT_MS;
    }
  }

  /* The debris the shell throws and the sounds it cues, for the replay to
   * throw and cue again. Wrapped here so the shell's calls are unchanged. */
  function tap(debris) {
    const emit = debris.emit;
    debris.emit = (point, normal, speed, surface, shed, floorY, kind) => {
      if (!S && recording && host.mode() === 'flight') {
        rec.event('debris', {
          point: [point.x, point.y, point.z], normal: [normal.x, normal.y, normal.z],
          speed, surface, shed: shed ?? null, floorY, kind,
        });
      }
      return emit(point, normal, speed, surface, shed, floorY, kind);
    };
    if (typeof audio.wreck === 'function') {
      const wreck = audio.wreck.bind(audio);
      audio.wreck = (kind, level, atTime) => {
        if (!S && recording && host.mode() === 'flight') {
          rec.event('cue', { kind, level });
        }
        return wreck(kind, level, atTime);
      };
    }
  }

  /*
   * Combat's streamer layer (src/render/streamers.js), and the SCHWING on
   * the shell's audio: every ribbon it is asked to draw, every cut's burst
   * and every SCHWING, kept for the replay (src/replay/paper.js). Wrapped
   * here, as tap() wraps the debris, so the shell's calls are unchanged;
   * the ribbons go into the row record() began this frame.
   */
  /* What packing the paper cost, per row that had any. */
  function paperCost(row, ms) {
    if (row < 0) {
      return;
    }
    if (row !== cost.paperRow) {
      cost.paperRow = row;
      cost.paperRowMs = 0;
      cost.paperFrames += 1;
    }
    cost.paperRowMs += ms;
    cost.paperMs += ms;
    cost.paperMaxMs = Math.max(cost.paperMaxMs, cost.paperRowMs);
  }

  function tapPaper(layer) {
    const draw = layer.draw;
    layer.draw = (key, cols, id, x, n, t, free, anchor) => {
      if (!S && recording && host.mode() === 'flight') {
        const t0 = performance.now();
        paperRing.draw(key, cols, id, x, n, t, free, anchor);
        paperCost(paperRing.row(), performance.now() - t0);
        if (paperLog && paperRing.row() >= 0 && n > 1) {
          const m = Math.min(n, 101) - 1;
          paperLog.push({
            row: paperRing.row(), key, id, n: m + 1,
            nodes: [0, m >> 1, m].map((i) => [i, x[i * 3], x[i * 3 + 1], x[i * 3 + 2]]),
          });
        }
      }
      return draw(key, cols, id, x, n, t, free, anchor);
    };
    const burst = layer.burst;
    layer.burst = (p, colour, level = 1) => {
      if (!S && recording && host.mode() === 'flight') {
        paperRing.cut(rec.now(), p, colour, level);
      }
      return burst(p, colour, level);
    };
    if (typeof audio.schwing === 'function') {
      const schwing = audio.schwing.bind(audio);
      audio.schwing = (level = 1, atTime) => {
        if (!S && recording && host.mode() === 'flight') {
          paperRing.schwing(rec.now(), level);
        }
        return schwing(level, atTime);
      };
    }
  }

  /*
   * Catch the Ace's crown burst (src/render/acecrown.js) and the coin on
   * the shell's audio, kept beside the paper's events (src/replay/
   * paper.js) the way tapPaper keeps the cuts and the SCHWINGs.
   */
  function tapCrown(fx) {
    const play = fx.play;
    fx.play = (at, from, level = 1, ageS = 0) => {
      if (!S && recording && host.mode() === 'flight') {
        paperRing.crown(rec.now() - ageS, at, from, level);
      }
      return play(at, from, level, ageS);
    };
    if (typeof audio.coin === 'function') {
      const coin = audio.coin.bind(audio);
      audio.coin = (level = 1, atTime) => {
        if (!S && recording && host.mode() === 'flight') {
          paperRing.coin(rec.now(), level);
        }
        return coin(level, atTime);
      };
    }
  }

  /*
   * A war's explosions (src/render/explosion.js), kept beside the paper's
   * events the way tapCrown keeps the crowns, so a replay of a war flight
   * shows each at the moment it went off. Its sound is not kept: the
   * replay rings it from where its own camera is (src/replay/paperscene.js).
   */
  function tapBooms(fx) {
    const play = fx.play;
    fx.play = (p, size = 1, ageS = 0) => {
      if (!S && recording && host.mode() === 'flight') {
        paperRing.boom(rec.now() - ageS, p, Math.min(1, size / SIZE_MAX));
      }
      return play(p, size, ageS);
    };
  }

  /* ---- the pad ---- */

  function standardPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (gp && gp.connected && gp.mapping === 'standard') {
        return gp;
      }
    }
    return null;
  }

  function padConnected() {
    return Boolean(standardPad());
  }

  /* Edges of the pad's buttons as a bit mask. */
  function padEdges() {
    const gp = standardPad();
    let now = 0;
    if (gp) {
      gp.buttons.forEach((b, i) => {
        if (b && b.pressed && i < 31) {
          now |= 1 << i;
        }
      });
    }
    const edges = now & ~padPrev;
    padPrev = now;
    return edges;
  }

  function pollFlightPad() {
    const edges = padEdges();
    if ((edges & (1 << REPLAY_PAD)) && host.mode() === 'flight' && host.screen() === 'flight') {
      open();
    }
  }

  /* ---- the editor's session ---- */

  function metaNow() {
    const af = host.airframe();
    const box = new THREE.Box3().setFromObject(shell.quad);
    const size = box.isEmpty() ? 0.5 : box.getSize(new THREE.Vector3()).length();
    const table = host.partTable().map((p) => ({
      kind: p.kind, kindName: p.kindName, parent: p.parent, material: p.material,
      cg: p.cg.slice(), boxMin: p.boxMin.slice(), boxMax: p.boxMax.slice(),
    }));
    const fpv = host.fpv();
    const d = new Date();
    return {
      name: str('replay.default_name', { aircraft: airframeById(af).name ?? af, time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }).slice(0, NAME_MAX),
      created: Date.now(),
      airframe: af,
      livery: host.livery() ?? null,
      paint: host.paint ? host.paint() : null,
      map: host.mapId(),
      scale: shell.quad.scale.x,
      size,
      parts: table,
      fpv: { fwd: fpv.fwd, up: fpv.up, tilt: fpv.tilt, fov: fpv.fov },
      fit: host.fit(),
      duration: 0,
    };
  }

  /* Open the editor on the recording (live, take over allowed) or on a
   * saved clip, and the My clips row it came from. */
  function open(saved = null, row = null) {
    if (S) {
      return false;
    }
    const clip = saved || rec.clip(metaNow());
    /* The ring row the clip's first frame is, for the harness. */
    let ringFirst = -1;
    if (!saved) {
      const [first, n, t0, t1] = rec.span();
      ringFirst = first;
      const peers = peerRing.clip(first, n);
      if (peers) {
        clip.peers = peers;
      }
      const paper = paperRing.clip(first, n, t0, t1);
      if (paper) {
        clip.paper = paper;
      }
    }
    /* A saved clip of one frame is a still, and plays as one. */
    if (clip.n < (saved ? 1 : 2)) {
      host.notice(str('replay.nothing_recorded_yet'));
      return false;
    }
    clip.meta.duration = clip.time[clip.n - 1];
    host.enter();
    const dur = clip.time[clip.n - 1];
    /* Start a few seconds before the last thing that happened, playing. */
    const lastBang = [...clip.events].reverse().find((e) => e.type === 'impact' || e.type === 'off');
    const t = Math.max(0, (lastBang ? lastBang.t : dur) - 4);
    S = {
      clip,
      live: !saved,
      t,
      playing: true,
      /* The edit, as an undo history of immutable edits: the file's, else
       * the keys an older file kept as the same camera, else one Chase
       * shot over the whole clip. */
      history: ed.createHistory(firstEdit(clip, dur)),
      /* An undo step being gathered: 'screen' between the screen's begin
       * and end, 'auto' for the wheel, the free camera and a bare drag. */
      gesture: null,
      lastInput: 0,
      /* The edit clock: the movie's frames, the movie time of the playhead
       * while playing, and the movie frame last drawn (-1 none). */
      plan: null,
      planOf: null,
      planSig: '',
      m: 0,
      frameI: -1,
      /* The My clips row this session saves over, once it has one. */
      savedId: row ? row.id : null,
      savedCreated: row ? row.created : 0,
      ringFirst,
      /* The framing each rig starts with when a shot is switched to it:
       * the last one given to a shot of that rig. */
      params: Object.fromEntries(RIGS.map((r) => [r, defaults(r, clip.meta.size)])),
      followSized: -1,
      osd: true,
      bare: false,
      sample: createSample(),
      /* The clip's animation clock at the frame drawn (show). */
      animMs: null,
      probe: createSample(),
      pose: createPose(),
      scene: buildScene(clip),
      exporting: null,
      drawnT: -1,
      photo: null,
      toast: null,
      /* Harness only: every movie frame stepped, while switched on. */
      stepLog: null,
    };
    clockFps = lastExportFps();
    startClock();
    S.params.tripod.pos = [shell.camera.position.x, shell.camera.position.y, shell.camera.position.z];
    for (const g of host.liveGroups) {
      g.visible = false;
    }
    editor.open(S.clip.meta.name);
    return true;
  }

  /* The camera a clip's movie starts with: the Chase, sized to the craft. */
  function chaseOf(clip) {
    return { rig: 'chase', target: -1, watch: 0, p: defaults('chase', clip.meta.size) };
  }

  /* The edit a clip opens with. Keys are only in files written before
   * edits; each becomes a shot entering by a glide, the same camera. */
  function firstEdit(clip, dur) {
    const chase = chaseOf(clip);
    if (clip.edit) {
      return clip.edit;
    }
    if (clip.keys && clip.keys.length) {
      return ed.fromKeys(clip.keys, dur, chase);
    }
    return ed.defaultEdit(dur, chase);
  }

  function close() {
    if (!S) {
      return;
    }
    if (S.exporting) {
      cancelExport();
    }
    disposeScene(S.scene);
    for (const g of host.liveGroups) {
      g.visible = true;
    }
    S = null;
    editor.close();
    host.exit();
  }

  /* ---- the replay's own craft, wreck and debris ---- */

  function buildScene(clip) {
    const af = clip.meta.airframe;
    const craft = craftBuilderFor(af)({ name: 'replay-craft', fog: true, worldScale: true });
    dressLivery(craft, af, { colours: clip.meta.livery ?? {}, ...(clip.meta.paint ?? {}) });
    /* In the hangar parts it flew with: the pod, the nozzle, the prop. */
    const fit = clip.meta.fit;
    if (fit && fit.entry) {
      dressParts(craft, af, { entry: fit.entry, option: fit.option ? powerOption(af, fit.option) : null });
    }
    craft.group.scale.setScalar(clip.meta.scale || 1);
    const parent = host.scene();
    parent.add(craft.group);
    const undoLook = host.craftLook ? host.craftLook(craft) : null;
    const wreck = createWreck();
    parent.add(wreck.group);
    wreck.attach(craft.group, clip.meta.parts, craft.discs);
    const debris = createDebris();
    parent.add(debris.group);
    const smoke = createSmoke();
    parent.add(smoke.group);
    /* The others in the room, when the clip has them. */
    const peers = clip.peers ? createPeerScene(clip.peers, clip.time, clip.n, parent, host.craftLook || null) : null;
    /* Combat's paper, when the clip has it. */
    const paper = clip.paper ? createPaperScene(clip.paper, clip.n, parent, audio, host.paperFloor) : null;
    return {
      craft, wreck, debris, smoke, peers, paper, undoLook, sig: 0, state: new Float64Array(11), qSpawn: new THREE.Quaternion(),
    };
  }

  function disposeScene(sc) {
    if (sc.peers) {
      sc.peers.dispose();
    }
    if (sc.paper) {
      sc.paper.dispose();
    }
    sc.wreck.reset();
    if (sc.undoLook) {
      sc.undoLook();
    }
    for (const g of [sc.craft.group, sc.wreck.group, sc.debris.group, sc.smoke.group]) {
      g.removeFromParent();
      g.traverse((o) => {
        if (o.geometry) {
          o.geometry.dispose();
        }
        const m = o.material;
        for (const one of Array.isArray(m) ? m : [m]) {
          if (one && one.dispose) {
            one.dispose();
          }
        }
      });
    }
  }

  /* Plant to world through a recorded spawn, the conversion src/main.js
   * plantToWorld makes, through src/render/frame.js. */
  function toWorldVia(sp) {
    return (px, py, pz, qw, qx, qy, qz, outPos, outQuat) => {
      const q = S.scene.qSpawn.set(sp[3], sp[4], sp[5], sp[6]);
      simPosToThree(px, py, pz + sp[7], outPos);
      outPos.applyQuaternion(q);
      outPos.x += sp[0];
      outPos.y += sp[1];
      outPos.z += sp[2];
      if (outQuat) {
        simQuatToThree(qw, qx, qy, qz, outQuat);
        outQuat.premultiply(q);
      }
      return outPos;
    };
  }

  /* How damaged a sample looks: the parts wreck.js would draw as pieces.
   * It only grows with time, so a smaller number is a scrub back past a
   * break, and the wreck is put back whole before it is drawn again. */
  function damageSig(s) {
    let n = 0;
    for (let i = 1; i < s.count; i += 1) {
      const o = i * PART_STATE_STRIDE;
      if (s.parts[o] !== 0) {
        n += 1;
      } else if (ROTATION_KINDS.has(s.parts[o + 21])) {
        const dx = s.parts[o + 17];
        const dy = s.parts[o + 18];
        const dz = s.parts[o + 19];
        if (dx * dx + dy * dy + dz * dz > BEND_SHOWN * BEND_SHOWN) {
          n += 1;
        }
      }
    }
    return n;
  }

  /* The craft at sample s. dtS is the movie time this frame steps and
   * rate the clip seconds per movie second, both 0 when nothing runs. */
  function poseScene(s, dtS, rate) {
    const sc = S.scene;
    const { craft } = sc;
    craft.group.position.set(s.pose[0], s.pose[1], s.pose[2]);
    craft.group.quaternion.set(s.pose[3], s.pose[4], s.pose[5], s.pose[6]);
    for (let m = 0; m < 4 && m < craft.discs.length; m += 1) {
      const vis = s.pose[POSE.rpm + m] * 1e-4 * rate * Math.min(1, dtS * 60);
      craft.discs[m].rotation.y += vis;
      if (craft.blades && craft.blades[m]) {
        craft.blades[m].rotation.y += vis * (craft.propSpin ? craft.propSpin[m] : 1);
      }
    }
    if (craft.setProp) {
      craft.setProp(s.pose[POSE.prop]);
    }
    if (craft.setSurfaces) {
      craft.setSurfaces(s.pose[POSE.surf], s.pose[POSE.surf + 1], s.pose[POSE.surf + 2], s.pose[POSE.surf + 3]);
    }
    if (craft.setFlaps) {
      craft.setFlaps(s.pose[POSE.flaps]);
    }
    const cam = shownCam();
    const onboard = Boolean(cam) && cam.rig === 'fpv' && !cam.watch;
    craft.group.visible = !onboard;
    const sig = damageSig(s);
    if (sig < sc.sig) {
      sc.wreck.reset();
      sc.wreck.attach(craft.group, S.clip.meta.parts, craft.discs);
      sc.sig = 0;
    }
    if (s.count > 1) {
      const st = sc.state;
      st[1] = s.plant[0];
      st[2] = s.plant[1];
      st[3] = s.plant[2];
      st[7] = s.plant[3];
      st[8] = s.plant[4];
      st[9] = s.plant[5];
      st[10] = s.plant[6];
      const sp = S.clip.spawns[s.head[HEAD.spawn]] || S.clip.spawns[0];
      craft.group.updateMatrixWorld(true);
      sc.wreck.update(s.parts, s.count, st, toWorldVia(sp), host.ground);
      sc.sig = Math.max(sc.sig, sig);
    }
    sc.wreck.setCraftVisible(!onboard);
  }

  /* The clip seen by the cameras. */
  const camCtx = {
    at(t, target, out, watch) {
      if (target < 0 && watched(t, out, null, watch)) {
        return out;
      }
      const s = sampleAt(S.clip, t, S.probe);
      if (target >= 0 && target < s.count) {
        const o = target * PART_STATE_STRIDE;
        const sp = S.clip.spawns[s.head[HEAD.spawn]] || S.clip.spawns[0];
        toWorldVia(sp)(s.parts[o + 2], s.parts[o + 3], s.parts[o + 4], 1, 0, 0, 0, vAt, null);
        out[0] = vAt.x;
        out[1] = vAt.y;
        out[2] = vAt.z;
      } else {
        out[0] = s.pose[0];
        out[1] = s.pose[1];
        out[2] = s.pose[2];
      }
      return out;
    },
    craftQuat(t, out, watch) {
      if (watched(t, vWatch, out, watch)) {
        return out;
      }
      const s = sampleAt(S.clip, t, S.probe);
      out[0] = s.pose[3];
      out[1] = s.pose[4];
      out[2] = s.pose[5];
      out[3] = s.pose[6];
      return out;
    },
    fpv(t, pos, quat, watch) {
      const f = S.clip.meta.fpv;
      /* Aboard a peer: at its centre, this pilot's tilt and lens, since
       * where its camera is mounted is not something a room sends. */
      if (watched(t, pos, qWatch, watch)) {
        qFpv.set(qWatch[0], qWatch[1], qWatch[2], qWatch[3]).multiply(qTilt.setFromAxisAngle(AXIS_X, f.tilt));
        quat[0] = qFpv.x;
        quat[1] = qFpv.y;
        quat[2] = qFpv.z;
        quat[3] = qFpv.w;
        return f.fov;
      }
      const s = sampleAt(S.clip, t, S.probe);
      const q = [s.pose[3], s.pose[4], s.pose[5], s.pose[6]];
      const fwd = rotate(q, [0, 0, -1]);
      const up = rotate(q, [0, 1, 0]);
      for (let i = 0; i < 3; i += 1) {
        pos[i] = s.pose[i] + fwd[i] * f.fwd + up[i] * f.up;
      }
      qFpv.set(q[0], q[1], q[2], q[3]).multiply(qTilt.setFromAxisAngle(AXIS_X, f.tilt));
      quat[0] = qFpv.x;
      quat[1] = qFpv.y;
      quat[2] = qFpv.z;
      quat[3] = qFpv.w;
      return f.fov;
    },
  };
  const vAt = new THREE.Vector3();
  const vNdc = new THREE.Vector3();
  const vWatch = [0, 0, 0];
  const qWatch = [0, 0, 0, 1];
  const qFpv = new THREE.Quaternion();

  const qTilt = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0);

  /* The peer `watch` at t, into pos and quat (either may be null); false
   * when the camera is on this pilot's aircraft (watch 0), or the peer is
   * not drawn at t, and the camera stays on this pilot's then. */
  function watched(t, pos, quat, watch) {
    if (!watch || !S.clip.peers) {
      return false;
    }
    const [k, a] = locate(S.clip, t);
    return peerPose(S.clip.peers, S.clip.n, k, a, watch, pos || vWatch, quat);
  }

  /* The edit being drawn: the export's own while one runs. */
  function drawnEdit() {
    return S.exporting ? S.exporting.edit : S.history.current;
  }

  /* The camera on screen when it is one shot's alone, else null (a blend
   * or a glide under way): an onboard view hides only its own aircraft. */
  function shownCam() {
    const edit = drawnEdit();
    const w = ed.weights(edit, S.t, mixNow);
    if (w.a === w.b || w.w <= 0) {
      return edit.shots[w.a].cam;
    }
    return w.w >= 1 ? edit.shots[w.b].cam : null;
  }
  const mixNow = { a: 0, b: 0, w: 0 };

  function aimCamera() {
    const pose = S.pose;
    evaluateEdit(camCtx, drawnEdit(), S.t, pose);
    const cam = shell.camera;
    cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    cam.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
    cam.up.set(0, 1, 0);
    if (Math.abs(cam.fov - pose.fov) > 0.01) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
  }

  /* ---- once a frame while the editor is open, in the camera chain ---- */

  function frame(dtMs) {
    if (!S) {
      return;
    }
    const dtS = Math.min(dtMs, 100) / 1000;
    padInEditor();
    if (!S) {
      return;
    }
    driveFree(dtS);
    if (S.gesture === 'auto' && performance.now() - S.lastInput > GESTURE_IDLE_MS) {
      endGesture();
    }
    if (S.exporting) {
      exportStep();
    } else if (S.playing) {
      playStep(dtS);
    } else {
      show(S.t, false);
    }
    editor.tick(view());
  }

  /* The movie's frames for the current edit. A new plan only when the
   * shots' times, speeds or the end moved (a camera change keeps it), and
   * then a running clock is set again from the playhead. */
  function planNow() {
    const edit = S.history.current;
    if (S.planOf === edit && S.plan.fps === clockFps) {
      return S.plan;
    }
    S.planOf = edit;
    const sig = `${clockFps}|${edit.out}|${edit.shots.map((s) => `${s.t0}:${s.speed}`).join()}`;
    if (sig !== S.planSig) {
      S.planSig = sig;
      S.plan = ed.planMovie(edit, clockFps);
      startClock();
    }
    return S.plan;
  }

  /* The clock set from the playhead: the first movie frame at or after
   * it, so starting never steps back and clears the air. */
  function startClock() {
    const edit = S.history.current;
    let m = ed.movieTime(edit, S.t);
    if (!Number.isFinite(m)) {
      m = 0;
    }
    S.m = Math.ceil(m * clockFps - 1e-6) / clockFps;
    S.frameI = -1;
  }

  function playStep(dtS) {
    const plan = planNow();
    S.m += dtS;
    let i = Math.floor(S.m * plan.fps + 1e-9);
    const end = i >= plan.n - 1;
    if (end) {
      i = plan.n - 1;
    }
    stepTo(plan, i);
    if (end) {
      /* Stopped at Out, so Play starts again from In. */
      S.playing = false;
      S.t = S.history.current.out;
    }
  }

  /* Movie frame i of `plan` drawn: each frame since the last one drawn
   * stepped in order, or, more than CATCH_UP behind or backwards, a jump
   * that rebuilds the air. The same i again steps nothing. */
  function stepTo(plan, i) {
    const last = S.frameI;
    if (i === last) {
      aimCamera();
      return;
    }
    let j = i;
    if (last >= 0 && i > last && i - last <= CATCH_UP) {
      j = last + 1;
    } else if (last >= 0) {
      S.drawnT = -Infinity;
    }
    for (; j <= i; j += 1) {
      show(plan.clipT[j], true);
      if (S.stepLog) {
        S.stepLog.push({ i: j, t: plan.clipT[j] });
      }
    }
    S.frameI = i;
  }

  /*
   * The replay at clip time t, stepped from the time last drawn: debris
   * thrown and sounds cued in between, the smoke and the paper flown on.
   * `running` is the clock moving forward (the props turn, the debris
   * flies); a step back or a gap past FORWARD_S is a jump, and the air is
   * rebuilt at t instead.
   */
  function show(t, running) {
    /* A resync can land a hair behind the time drawn; that is not a jump. */
    const from = S.drawnT > t && S.drawnT - t < 1e-6 ? t : S.drawnT;
    const speed = speedAt(t);
    const step = t >= from && t - from < FORWARD_S ? t - from : 0;
    const moving = running && step > 0;
    S.t = t;
    const s = sampleAt(S.clip, t, S.sample);
    S.animMs = s.anim;
    events(from, t, speed);
    smokeTo(from, t);
    if (moving) {
      S.scene.debris.update(step);
    }
    poseScene(s, moving ? step / speed : 0, moving ? speed : 0);
    if (S.scene.peers) {
      const cam = shownCam();
      const inside = cam && cam.rig === 'fpv' ? cam.watch : 0;
      S.scene.peers.pose(s.k, s.a, moving ? speed * Math.min(1, (step / speed) * 60) : 0, S.osd, inside);
      S.scene.peers.smokeTo(from, t, shell.canvas.clientHeight || 720, shell.camera.fov);
    }
    aimCamera();
    /* After the camera: the ribbons are never drawn thinner than a few
     * pixels, so they are drawn from where it is this frame. */
    if (S.scene.paper) {
      const ace = S.scene.peers ? S.scene.peers.aceAt() : null;
      S.scene.paper.frame(s.k, s.a, from, t, running, speed, shell.camera, shell.canvas.clientHeight || 720, ace);
    }
    S.drawnT = t;
  }

  /* Clip seconds per movie second at clip time t: its shot's speed. */
  function speedAt(t) {
    const edit = drawnEdit();
    return edit.shots[ed.shotAt(edit, t)].speed;
  }

  /*
   * The smoke trail at t. src/render/smoke.js emits on the clock it is
   * given, so the replay gives it the clip's: played forward, one update a
   * frame with the nozzle where it was; anywhere else (a scrub, a jump, the
   * first frame) the trail is flown again from LIFE_S before t over the
   * recorded rows, so it is the trail that was in the air then.
   */
  function smokeTo(from, to) {
    const sc = S.scene;
    const forward = to >= from && to - from < FORWARD_S;
    if (!forward) {
      sc.smoke.clear();
      const c = S.clip;
      for (let k = 0; k < c.n; k += 1) {
        const tk = c.time[k];
        if (tk < to - SMOKE_LIFE_S || tk >= to) {
          continue;
        }
        const o = k * SMOKE_N;
        smokeFeed(tk, c.smoke[o + SMOKE.on] !== 0, c.smoke, o);
      }
    }
    smokeFeed(to, S.sample.smoke[SMOKE.on] !== 0, S.sample.smoke, 0);
  }

  function smokeFeed(t, on, col, o) {
    if (on) {
      vSmokeAt.set(col[o + SMOKE.nozzle], col[o + SMOKE.nozzle + 1], col[o + SMOKE.nozzle + 2]);
      vSmokeVel.set(col[o + SMOKE.vel], col[o + SMOKE.vel + 1], col[o + SMOKE.vel + 2]);
    }
    S.scene.smoke.update(t, on ? vSmokeAt : null, vSmokeVel, shell.canvas.clientHeight || 720, shell.camera.fov);
  }
  const vSmokeAt = new THREE.Vector3();
  const vSmokeVel = new THREE.Vector3();

  /* Debris thrown and sounds cued between two times played forward; a
   * jump anywhere else clears the air. */
  function events(from, to, speed) {
    const forward = to >= from && to - from < FORWARD_S;
    if (!forward) {
      S.scene.debris.clear();
      return;
    }
    if (to === from) {
      return;
    }
    for (const e of S.clip.events) {
      if (e.t <= from || e.t > to) {
        continue;
      }
      if (e.type === 'debris') {
        vA.set(e.point[0], e.point[1], e.point[2]);
        vB.set(e.normal[0], e.normal[1], e.normal[2]);
        S.scene.debris.emit(vA, vB, e.speed, e.surface, e.shed, e.floorY, e.kind);
      } else if (e.type === 'cue' && typeof audio.wreck === 'function' ) {
        audio.wreck(e.kind, e.level * Math.min(1, speed));
      }
    }
  }
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();

  /* The motors for the mix, slowed with the picture. Returns the speed
   * for the wind, or -1 when the replay is not playing sound. */
  function sound(outRpm) {
    if (!S) {
      return -1;
    }
    const k = S.playing || S.exporting ? speedAt(S.t) : 0;
    for (let m = 0; m < 4; m += 1) {
      outRpm[m] = S.sample.pose[POSE.rpm + m] * k;
    }
    return S.sample.head[HEAD.speed] * k;
  }

  /* After the world is drawn: the letterbox, and a picture if one is due.
   * The canvas keeps no drawing buffer, so this is the one moment its
   * pixels can be read. */
  function afterRender() {
    if (!S) {
      return;
    }
    const r = shell.renderer;
    if (drawnEdit().look.letterbox) {
      const size = r.getSize(vSize);
      const bar = Math.floor((size.y - size.x / SCOPE) / 2);
      if (bar > 0) {
        r.setRenderTarget(null);
        r.getClearColor(cSave);
        const a = r.getClearAlpha();
        r.setScissorTest(true);
        r.setClearColor(0x000000, 1);
        r.setScissor(0, 0, size.x, bar);
        r.clear(true, false, false);
        r.setScissor(0, size.y - bar, size.x, bar);
        r.clear(true, false, false);
        r.setScissorTest(false);
        r.setClearColor(cSave, a);
      }
    }
    if (S.photo) {
      const want = S.photo;
      S.photo = null;
      shell.canvas.toBlob((blob) => want(blob), 'image/png');
    }
    const x = S.exporting;
    if (x && x.pending) {
      x.pending = false;
      try {
        x.job.capture(shell.canvas);
      } catch (err) {
        failExport(err);
      }
    }
  }
  const vSize = new THREE.Vector2();
  const cSave = new THREE.Color();

  /* ---- controls ---- */

  function view() {
    const c = S.clip;
    const edit = S.history.current;
    const shot = ed.shotAt(edit, S.t);
    const cam = edit.shots[shot].cam;
    return {
      t: S.t,
      drawn: S.drawnT,
      dur: c.time[c.n - 1],
      playing: S.playing,
      /* The shot under the playhead: its speed and its camera. */
      speed: edit.shots[shot].speed,
      rig: cam.rig,
      target: cam.target,
      watch: cam.watch,
      markers: c.events.filter((e) => e.type === 'off' || e.type === 'impact'),
      parts: partsOff(),
      osd: S.osd,
      bare: S.bare,
      letterbox: edit.look.letterbox,
      live: S.live,
      canTakeOver: canTakeOver(),
      exporting: S.exporting ? { ...S.exporting.job.progress } : null,
      readout: S.sample.head,
      toast: S.toast,
      name: c.meta.name,
      peers: S.scene.peers ? S.scene.peers.list() : [],
      edit,
      shot,
      movie: { t: ed.movieTime(edit, S.t), dur: ed.movieDuration(edit) },
      canUndo: S.history.canUndo,
      canRedo: S.history.canRedo,
      saved: S.savedId !== null,
      pad: padConnected(),
    };
  }

  function partsOff() {
    const seen = new Set();
    const out = [];
    for (const e of S.clip.events) {
      if (e.type === 'off' && !seen.has(e.part)) {
        seen.add(e.part);
        out.push({ part: e.part, label: e.label, t: e.t });
      }
    }
    return out;
  }

  function frameAt(t) {
    const [k, a] = locateFrame(t);
    return a > 0.5 && k + 1 < S.clip.n ? k + 1 : k;
  }

  function locateFrame(t) {
    const s = sampleAt(S.clip, t, S.probe);
    return [s.k, s.a];
  }

  function canTakeOver() {
    if (!S.live) {
      return false;
    }
    const k = frameAt(S.t);
    const h = k * HEAD_N;
    return journal.canRestore([S.clip.head[h + HEAD.markSeg], S.clip.head[h + HEAD.markPos]]);
  }

  function seek(t) {
    const dur = S.clip.time[S.clip.n - 1];
    S.t = Math.max(0, Math.min(dur, t));
  }

  function step(frames) {
    S.playing = false;
    const k = Math.max(0, Math.min(S.clip.n - 1, frameAt(S.t) + frames));
    S.t = S.clip.time[k];
  }

  /* ---- the edit ---- */

  /* Every change to the edit: a step of its own, or, inside a gesture
   * from the screen, that gesture's step so far. A wheel or a free flight
   * still settling is its own step, ended first. Nothing changes while a
   * movie exports. */
  function change(next) {
    if (S.exporting || next === S.history.current) {
      return false;
    }
    if (S.gesture === 'auto') {
      endGesture();
    }
    if (S.gesture) {
      S.history.preview(next);
    } else {
      S.history.commit(next);
    }
    return true;
  }

  /* An input that is its own gesture until it has been still a while,
   * or part of the screen's gesture when one is open. */
  function touch() {
    if (!S.gesture) {
      S.history.begin();
      S.gesture = 'auto';
    }
    S.lastInput = performance.now();
  }

  function endGesture() {
    if (S.gesture) {
      S.history.end();
      S.gesture = null;
    }
  }

  const clone = (p) => JSON.parse(JSON.stringify(p));

  /* The shot under the playhead: its index and its camera. */
  function shotNow() {
    const edit = S.history.current;
    const i = ed.shotAt(edit, S.t);
    return { edit, i, cam: edit.shots[i].cam };
  }

  /* This shot's camera changed: `fn` edits a copy of its numbers and
   * says whether it did. The framing is kept for the rig's next shot. */
  function tweakCam(fn) {
    const { edit, i, cam } = shotNow();
    const p = clone(cam.p);
    if (S.exporting || !fn(p, cam.rig)) {
      return;
    }
    S.params[cam.rig] = clone(p);
    touch();
    S.history.preview(ed.setCam(edit, i, { ...cam, p }));
  }

  function cut() {
    return change(ed.cut(S.history.current, S.t));
  }

  function removeCut(i) {
    const edit = S.history.current;
    const at = i === undefined ? ed.nearestCut(edit, S.t) : i;
    return at >= 1 && change(ed.removeCut(edit, at));
  }

  function speedBy(dir) {
    const { edit, i } = shotNow();
    const k = SPEEDS.indexOf(edit.shots[i].speed);
    change(ed.setSpeed(edit, i, SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (k < 0 ? 3 : k) + dir))]));
  }

  /* Cut, then a blend of half a second, then a glide, for the cut that
   * starts the shot under the playhead. */
  function cycleEnter() {
    const { edit, i } = shotNow();
    if (i < 1) {
      return;
    }
    const order = ['cut', 'blend', 'glide'];
    const type = order[(order.indexOf(edit.shots[i].enter.type) + 1) % order.length];
    change(ed.setEnter(edit, i, type === 'blend' ? { type, d: 0.5 } : { type }));
  }

  /* The playhead to the previous or the next cut. */
  function jumpCut(dir) {
    const cuts = S.history.current.shots.slice(1).map((s) => s.t0);
    const next = dir > 0 ? cuts.find((t) => t > S.t + 1e-6) : [...cuts].reverse().find((t) => t < S.t - 1e-6);
    if (next !== undefined) {
      seek(next);
      S.playing = false;
    }
  }

  /* In at t from the keyboard: the shots before the one under t go, and
   * that one starts the movie with its camera and speed. A dragged edge
   * (setEdge) stops at the next cut instead. */
  function inAt(edit, t) {
    let e = edit;
    let k = ed.shotAt(e, t);
    if (k + 1 < e.shots.length && e.shots[k + 1].t0 - t < ed.MIN_SHOT_S) {
      k += 1;
    }
    if (k > 0) {
      e = ed.setSpeed(ed.setCam(e, 0, e.shots[k].cam), 0, e.shots[k].speed);
      for (let i = 0; i < k; i += 1) {
        e = ed.removeCut(e, 1);
      }
    }
    return ed.setIn(e, t);
  }

  /* Out at t from the keyboard: the shots after the one under t go. */
  function outAt(edit, t) {
    let e = edit;
    let k = ed.shotAt(e, t);
    if (k > 0 && t - e.shots[k].t0 < ed.MIN_SHOT_S) {
      k -= 1;
    }
    while (e.shots.length - 1 > k) {
      e = ed.removeCut(e, e.shots.length - 1);
    }
    return ed.setOut(e, t);
  }

  /* After an undo or a redo the playhead stays, unless it would be
   * outside the movie. */
  function undoTo(edit) {
    if (S.t < edit.shots[0].t0 || S.t > edit.out) {
      seek(edit.shots[0].t0);
      S.playing = false;
    }
  }

  function undo() {
    if (S.exporting) {
      return;
    }
    endGesture();
    if (S.history.canUndo) {
      S.history.undo();
      undoTo(S.history.current);
    }
  }

  function redo() {
    if (S.exporting) {
      return;
    }
    endGesture();
    if (S.history.canRedo) {
      S.history.redo();
      undoTo(S.history.current);
    }
  }

  /* This shot's camera onto `rig`, aimed at `target` (a part, for follow,
   * orbit and tripod), with the framing that rig had last. */
  function setRig(rig, target) {
    if (!RIGS.includes(rig)) {
      return;
    }
    const { edit, i, cam: now } = shotNow();
    let aim = target === undefined ? now.target : target;
    let watchId = now.watch;
    const cam = shell.camera;
    if (rig === 'free' && now.rig !== 'free') {
      const p = S.params.free;
      p.pos = [cam.position.x, cam.position.y, cam.position.z];
      eFree.setFromQuaternion(cam.quaternion, 'YXZ');
      p.yaw = eFree.y;
      p.pitch = eFree.x;
    }
    if (rig === 'tripod' && now.rig !== 'tripod') {
      S.params.tripod.pos = [cam.position.x, cam.position.y, cam.position.z];
    }
    if (rig === 'follow') {
      const parts = partsOff();
      if (!parts.length) {
        toast(str('replay.nothing_came_off'));
        return;
      }
      /* The parts are this pilot's own: the camera comes back to them. */
      watchId = 0;
      if (!parts.some((p) => p.part === aim)) {
        /* The part that left nearest the playhead: the one in the picture. */
        let best = null;
        for (const e of S.clip.events) {
          if (e.type === 'off' && (!best || Math.abs(e.t - S.t) < Math.abs(best.t - S.t))) {
            best = e;
          }
        }
        aim = best.part;
      }
      if (aim !== S.followSized) {
        /* Framed by the part's own size: a wing panel, not the aircraft. */
        const p = S.clip.meta.parts[aim];
        const size = p ? Math.hypot(p.boxMax[0] - p.boxMin[0], p.boxMax[1] - p.boxMin[1], p.boxMax[2] - p.boxMin[2]) : 0.5;
        S.params.follow = defaults('follow', size);
        S.followSized = aim;
      }
    }
    const aimed = rig === 'follow' || rig === 'tripod' || rig === 'orbit';
    change(ed.setCam(edit, i, {
      rig, target: aimed ? aim : -1, watch: watchId, p: clone(S.params[rig]),
    }));
  }
  const eFree = new THREE.Euler();

  /* This shot onto this pilot's aircraft (0) or a peer's (its id). A part
   * being followed is let go: the shot goes back to the chase. */
  function watch(id) {
    const list = S.scene.peers ? S.scene.peers.list() : [];
    const { edit, i, cam } = shotNow();
    const rig = cam.rig === 'follow' ? 'chase' : cam.rig;
    change(ed.setCam(edit, i, {
      rig, target: -1, watch: list.some((p) => p.id === id) ? id : 0, p: clone(rig === cam.rig ? cam.p : S.params[rig]),
    }));
  }

  /* Follow the next part that came off, from any camera. */
  function nextPart() {
    const parts = partsOff();
    if (!parts.length) {
      toast(str('replay.nothing_came_off'));
      return;
    }
    const { cam } = shotNow();
    const i = parts.findIndex((p) => p.part === cam.target);
    setRig('follow', parts[(i + 1) % parts.length].part);
  }

  function toast(text) {
    S.toast = { text, until: performance.now() + 2200 };
  }

  /* The free camera, from the keys held, when this shot is one. */
  function driveFree(dtS) {
    if (S.exporting || shotNow().cam.rig !== 'free') {
      return;
    }
    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (!f && !r && !u) {
      return;
    }
    const v = FREE_SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? FREE_FAST : 1) * dtS;
    tweakCam((p) => {
      const cy = Math.cos(p.yaw);
      const sy = Math.sin(p.yaw);
      const cp = Math.cos(p.pitch);
      p.pos[0] += (-sy * cp * f + cy * r) * v;
      p.pos[1] += (Math.sin(p.pitch) * f + u) * v;
      p.pos[2] += (-cy * cp * f - sy * r) * v;
      return true;
    });
  }

  function drag(dx, dy) {
    tweakCam((p, rig) => {
      if (rig === 'orbit') {
        p.az -= dx * LOOK_RATE * 1.5;
        p.el = Math.max(-0.2, Math.min(1.45, p.el + dy * LOOK_RATE * 1.5));
      } else if (rig === 'free') {
        p.yaw -= dx * LOOK_RATE;
        p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - dy * LOOK_RATE));
      } else if (rig === 'chase' || rig === 'follow') {
        p.height = Math.max(-2, Math.min(20, p.height + dy * 0.01));
      } else {
        return false;
      }
      return true;
    });
  }

  function wheel(dy) {
    tweakCam((p, rig) => {
      const k = Math.exp(dy * 0.001);
      if (p.dist !== undefined) {
        p.dist = Math.max(0.3, Math.min(200, p.dist * k));
      } else if (rig === 'tripod' || rig === 'free') {
        p.fov = Math.max(8, Math.min(100, p.fov * k));
      } else {
        return false;
      }
      return true;
    });
  }

  /* The standard pad's button edges, for the screen to bind beside the
   * keys (src/replay/editor.js onPad). */
  function padInEditor() {
    editor.onPad(padEdges());
  }

  /* Play from the playhead, or from In when it is outside the movie. */
  function togglePlay() {
    if (S.exporting) {
      return;
    }
    if (!S.playing) {
      const edit = S.history.current;
      if (S.t < edit.shots[0].t0 || S.t >= edit.out - 1e-9) {
        S.t = edit.shots[0].t0;
      }
      planNow();
      startClock();
    }
    S.playing = !S.playing;
  }

  /* ---- keeping what happened ---- */

  function photo() {
    return new Promise((resolve) => {
      S.photo = (blob) => {
        if (!blob) {
          toast(str('replay.photo_failed'));
          resolve(null);
          return;
        }
        store.downloadBlob(store.stampedName(S ? S.clip.meta.map : 'replay', '.png'), blob);
        window.__crashCamLast = { ...(window.__crashCamLast || {}), photo: { size: blob.size, type: blob.type, w: shell.canvas.width, h: shell.canvas.height } };
        if (S) {
          toast(str('replay.photo_saved'));
        }
        resolve(blob);
      };
    });
  }

  /* A small picture of the current frame, for My clips. */
  function thumbnail() {
    return new Promise((resolve) => {
      S.photo = (blob) => {
        if (!blob || typeof createImageBitmap !== 'function') {
          resolve(blob);
          return;
        }
        createImageBitmap(blob).then((bmp) => {
          const c = document.createElement('canvas');
          c.width = THUMB_W;
          c.height = THUMB_H;
          const g = c.getContext('2d');
          const s = Math.max(THUMB_W / bmp.width, THUMB_H / bmp.height);
          g.drawImage(bmp, (THUMB_W - bmp.width * s) / 2, (THUMB_H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
          c.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
        }, () => resolve(null));
      };
    });
  }

  /* ---- the export driver ---- */

  /*
   * A movie is written by a job (src/replay/export.js) driven from the
   * frame loop, since that is where the world is drawn: each display
   * frame asks job.next() for a movie frame, steps the replay to it
   * (stepTo, the same stepping as playback), and once the shell has drawn
   * it, afterRender hands the canvas to job.capture. A frame stepped for
   * the job is never replaced before it is captured, so a display frame
   * the shell skips drawing only delays the movie.
   *
   * job.next(): a frame index, -1 to hold (nothing stepped anew), null
   * after the last. job.capture(canvas) is synchronous. job.progress is
   * { done, total, etaS, realtime }. job.finish() resolves { name, bytes }.
   */
  function runJob(job, plan, edit, abort = null) {
    const session = S;
    return new Promise((resolve, reject) => {
      S.exporting = {
        job, plan, edit, abort, session, resolve, reject, pending: false, finishing: false,
      };
      S.playing = false;
      endGesture();
      S.frameI = -1;
      /* The first frame rebuilds the air, whatever was drawn before. */
      S.drawnT = -Infinity;
    });
  }

  function exportStep() {
    const x = S.exporting;
    if (x.pending || x.finishing) {
      aimCamera();
      return;
    }
    const i = x.job.next();
    if (i === null) {
      x.finishing = true;
      x.job.finish().then((res) => {
        endExport(x);
        x.resolve(res);
      }, (err) => {
        endExport(x);
        x.reject(err);
      });
      return;
    }
    if (i < 0) {
      aimCamera();
      return;
    }
    stepTo(x.plan, i);
    x.pending = true;
  }

  /* The session is back to editing; the playhead stays where the movie
   * stopped. */
  function endExport(x) {
    if (x.session.exporting === x) {
      x.session.exporting = null;
      x.session.frameI = -1;
    }
  }

  /* A capture that threw ends the export; exportMovie rejects with it
   * and the screen says why. */
  function failExport(err) {
    const x = S.exporting;
    x.job.cancel();
    endExport(x);
    x.reject(err);
  }

  function cancelExport() {
    const x = S && S.exporting;
    if (!x) {
      return;
    }
    if (x.abort) {
      x.abort.abort();
    }
    x.job.cancel();
    endExport(x);
    x.resolve(null);
  }

  /* What the export dialog can offer in this browser. */
  async function exportOptions() {
    const { exportCapabilities } = await import('./export.js');
    return exportCapabilities();
  }

  /* The movie of the edit, written frame by frame: { name, bytes } for
   * the screen to hand over, null when cancelled. */
  async function exportMovie({
    size, fps, format, sound,
  }) {
    if (!S || S.exporting) {
      return null;
    }
    const { createExportJob } = await import('./export.js');
    clockFps = fps;
    const edit = S.history.current;
    /* No longer than MOVIE_MAX_S (src/replay/edit.js planMovie). */
    const plan = ed.planMovie(edit, fps);
    const abort = new AbortController();
    const session = S;
    const job = await createExportJob({
      clip: S.clip, edit, plan, size, fps, format, sound, audio, surface: host.exportSurface, signal: abort.signal,
    });
    if (S !== session || S.exporting) {
      job.cancel();
      return null;
    }
    const res = await runJob(job, plan, edit, abort);
    if (res) {
      window.__crashCamLast = { ...(window.__crashCamLast || {}), movie: { name: res.name, size: res.bytes.size, type: res.bytes.type, frames: plan.n } };
    }
    return res;
  }

  /* The clip Save keeps: the edit's In to Out, or all of it, with the
   * edit on the trimmed clip's clock. The keys an older file had are in
   * the edit by now, so none are written; an edit that is only the
   * default is not written either. */
  function rangeClip() {
    const edit = S.history.current;
    const dur = S.clip.time[S.clip.n - 1];
    const tIn = edit.shots[0].t0;
    const trim = tIn > 0 || edit.out < dur;
    const clip = { ...(trim ? trimClip(S.clip, tIn, edit.out) : S.clip), keys: [] };
    /* The row trimClip starts from: the one at or before In. */
    const base = trim ? S.clip.time[locate(S.clip, tIn)[0]] : 0;
    const kept = ed.trimEdit(edit, base, clip.time[clip.n - 1]);
    delete clip.edit;
    if (!ed.isDefault(kept, clip.time[clip.n - 1], chaseOf(clip))) {
      clip.edit = kept;
    }
    return clip;
  }

  /* Save to My clips: over the row this session came from or saved
   * before, else a new one. */
  async function saveReplay(name) {
    const clip = rangeClip();
    clip.meta = { ...clip.meta, name: String(name || S.clip.meta.name).slice(0, NAME_MAX), duration: clip.time[clip.n - 1] };
    const session = S;
    const id = S.savedId || store.newId();
    const created = S.savedId ? S.savedCreated : Date.now();
    /* Everything that can fail inside the try, so the pilot is told: an
     * encode that threw (a misaligned column, once) was a silent no-op. */
    try {
      const bytes = encodeReplay(clip);
      const thumb = await thumbnail();
      const dropped = await store.putClip({
        id, name: clip.meta.name, created, thumb, bytes,
        airframe: clip.meta.airframe, map: clip.meta.map, duration: clip.meta.duration,
      });
      session.savedId = id;
      session.savedCreated = created;
      window.__crashCamLast = {
        ...(window.__crashCamLast || {}), saved: { id, frames: clip.n, bytes: bytes.byteLength, shots: clip.edit ? clip.edit.shots.length : 1 },
      };
      if (S) {
        toast(dropped ? str('replay.saved_oldest_removed', { n: dropped }) : str('replay.saved'));
      }
      return id;
    } catch (err) {
      if (S) {
        toast(str('replay.save_failed', { why: err.message }));
      }
      throw err;
    }
  }

  function known() {
    return { airframe: host.knownAirframe, map: host.knownMap };
  }

  /* A replay from bytes, or an error the pilot can read. */
  function decode(bytes) {
    try {
      return decodeReplay(bytes, known());
    } catch (err) {
      if (err instanceof ReplayFileError) {
        console.warn('replay refused:', err.message);
        const retired = err.map && host.retiredMapName(err.map);
        if (retired) {
          throw new Error(str('replay.map_retired', { map: retired }));
        }
        /* A clip flown on a retired aircraft is refused by its name: the
         * clip holds that aircraft's crash parts, which no other model has. */
        const gone = retiredAirframe(err.airframe);
        throw new Error(gone ? str('replay.aircraft_retired', { aircraft: gone.name }) : str('replay.not_a_replay'));
      }
      throw err;
    }
  }

  async function playSaved(id) {
    const row = await store.getClip(id);
    if (!row) {
      throw new Error('that clip is gone');
    }
    const clip = decode(row.bytes);
    if (clip.meta.map !== host.mapId()) {
      await host.swapMap(clip.meta.map);
    }
    if (S) {
      close();
    }
    return open(clip, row);
  }

  async function exportSaved(id) {
    const row = await store.getClip(id);
    if (!row) {
      throw new Error('that clip is gone');
    }
    const blob = new Blob([row.bytes], { type: 'application/octet-stream' });
    const safe = row.name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-') || 'replay';
    store.downloadBlob(`${safe}${FILE_EXT}`, blob);
    return blob.size;
  }

  async function importFile(file) {
    if (file.size > FILE_MAX_BYTES) {
      throw new Error(str('replay.import_too_big'));
    }
    const bytes = await file.arrayBuffer();
    const clip = decode(bytes);
    await store.putClip({
      id: store.newId(), name: clip.meta.name, created: Date.now(), thumb: null, bytes,
      airframe: clip.meta.airframe, map: clip.meta.map, duration: clip.meta.duration,
    });
    return clip.meta.name;
  }

  /* ---- take over ---- */

  function takeOver() {
    if (!S || !canTakeOver()) {
      toast(str('replay.cannot_take_over'));
      return null;
    }
    const k = frameAt(S.t);
    const h = k * HEAD_N;
    const clip = S.clip;
    const mark = [clip.head[h + HEAD.markSeg], clip.head[h + HEAD.markPos]];
    const drop = clip.n - 1 - k;
    const session = S;
    if (S.exporting) {
      cancelExport();
    }
    disposeScene(session.scene);
    for (const g of host.liveGroups) {
      g.visible = true;
    }
    S = null;
    editor.close();
    const res = host.takeOver(mark, clip.head[h + HEAD.simT], clip.head[h + HEAD.stateHash]);
    if (res && res.ok) {
      rec.dropNewest(drop);
      paperRing.dropAfter(rec.now());
      prevStatus.fill(0);
    }
    window.__crashCamLast = { ...(window.__crashCamLast || {}), takeOver: { ...res, frame: k, clipT: clip.time[k] } };
    return res;
  }

  /* ---- what the editor calls ---- */

  function api() {
    return {
      view: () => view(),
      togglePlay: () => togglePlay(),
      seek: (t) => { seek(t); S.playing = false; },
      step,
      /* This shot's speed: one of SPEEDS, or -1 for a step down. For a step
       * up use speedBy(1), since 1 is a speed. */
      setSpeed: (s) => {
        if (typeof s === 'number' && SPEEDS.includes(s)) {
          const { edit, i } = shotNow();
          change(ed.setSpeed(edit, i, s));
        } else {
          speedBy(s);
        }
      },
      speedBy,
      speeds: SPEEDS,
      rigs: RIGS,
      setRig: (r) => setRig(r),
      follow: (part) => setRig('follow', part),
      nextPart,
      watch: (id) => watch(id),
      nextWatch: () => {
        const list = S.scene.peers ? S.scene.peers.list() : [];
        const ids = [0, ...list.map((p) => p.id)];
        watch(ids[(ids.indexOf(shotNow().cam.watch) + 1) % ids.length]);
      },
      /* The edit. Each returns whether the edit changed. */
      cut,
      removeCut,
      moveCut: (i, t) => change(ed.moveCut(S.history.current, i, t)),
      setIn: () => change(inAt(S.history.current, S.t)),
      setOut: () => change(outAt(S.history.current, S.t)),
      setEdge: (which, t) => {
        const at = Math.max(0, Math.min(S.clip.time[S.clip.n - 1], t));
        return change(which === 'in' ? ed.setIn(S.history.current, at) : ed.setOut(S.history.current, at));
      },
      setEnter: (i, enter) => change(ed.setEnter(S.history.current, i, enter)),
      cycleEnter,
      undo,
      redo,
      /* A gesture from the screen (a grip dragged, a drag on the picture):
       * everything between is one undo step. */
      begin: () => {
        endGesture();
        S.history.begin();
        S.gesture = 'screen';
      },
      end: endGesture,
      jumpCut,
      toggleOsd: () => {
        S.osd = !S.osd;
      },
      toggleLetterbox: () => {
        const edit = S.history.current;
        change(ed.setLook(edit, { ...edit.look, letterbox: !edit.look.letterbox }));
      },
      toggleBare: () => {
        S.bare = !S.bare;
      },
      mapName: (id) => host.mapName(id),
      rangeFrames: () => rangeClip().n,
      photo,
      exportOptions,
      exportMovie,
      cancelExport,
      saveReplay,
      takeOver,
      close,
      drag,
      wheel,
      prevMarker: () => jumpMarker(-1),
      nextMarker: () => jumpMarker(1),
      jumpTo: (t) => {
        seek(t);
        S.playing = false;
      },
      seekBy: (d) => {
        seek(S.t + d);
        S.playing = false;
      },
      shiftHeld: () => input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'),
      ctrlHeld: () => input.keys.has('ControlLeft') || input.keys.has('ControlRight'),
      listClips: () => store.listClips(),
      playSaved,
      renameSaved: (id, name) => store.renameClip(id, String(name).slice(0, NAME_MAX)),
      deleteSaved: (id) => store.deleteClip(id),
      exportSaved,
      importFile,
      clipName: () => (S ? S.clip.meta.name : ''),
      key: REPLAY_KEY,
    };
  }

  function jumpMarker(dir) {
    const ms = S.clip.events.filter((e) => e.type === 'off' || e.type === 'impact').map((e) => e.t);
    const lead = 0.5;
    const cur = S.t + lead;
    const next = dir > 0 ? ms.find((t) => t > cur + 0.05) : [...ms].reverse().find((t) => t < cur - 0.05);
    if (next !== undefined) {
      seek(next - lead);
      S.playing = false;
    }
  }

  /* ---- keys ---- */

  function onKey(code, repeat) {
    if (S) {
      return editor.onKey(code, repeat);
    }
    if (code === REPLAY_KEY && !repeat && host.mode() === 'flight' && host.screen() === 'flight') {
      open();
      return true;
    }
    return false;
  }

  /* For the harness and the memory report. */
  function stats() {
    const j = journal.stats();
    return {
      frames: cost.frames,
      recordMsMean: cost.frames ? cost.totalMs / cost.frames : 0,
      recordMsMax: cost.maxMs,
      snapshots: cost.snaps,
      snapshotMsMean: cost.snaps ? cost.snapMs / cost.snaps : 0,
      snapshotMsMax: cost.snapMaxMs,
      ringBytes: rec.bytes,
      ringFrames: rec.size(),
      journalBytes: j.bytes,
      journalSegments: j.segments,
      journalCalls: j.calls,
      regionBytes: j.region,
      peerFrames: cost.peerFrames,
      peerMsMean: cost.peerFrames ? cost.peerMs / cost.peerFrames : 0,
      peerMsMax: cost.peerMaxMs,
      peerBytes: peerRing.bytes(),
      peerRingBytes: peerRing.ringBytes,
      peersRecorded: peerRing.stats.peers,
      peersDropped: peerRing.stats.dropped,
      piecesDropped: peerRing.stats.piecesDropped,
      peerAllocMs: peerRing.stats.allocMs,
      paperBytes: paperRing.bytes(),
      paperRingBytes: paperRing.ringBytes,
      paperRibbons: paperRing.stats.ribbons,
      paperDropped: paperRing.stats.dropped,
      paperEvents: paperRing.stats.events,
      paperFrames: cost.paperFrames,
      paperMsMean: cost.paperFrames ? cost.paperMs / cost.paperFrames : 0,
      paperMsMax: cost.paperMaxMs,
    };
  }

  return {
    record,
    recordPeers,
    tapPaper,
    tapCrown,
    tapBooms,
    noteCrash,
    promptKey: () => promptKey,
    tap,
    onKey,
    frame,
    afterRender,
    sound,
    stats,
    open: () => open(),
    /* Back to the flight, as the replay's own way out does: a room that
     * starts a game takes a pilot out of the crash cam (src/main.js). */
    close: () => close(),
    get live() {
      return S !== null;
    },
    /* The map's animation clock at the frame on screen, which the shell
     * draws the world at (src/main.js), or null: no replay open, or a
     * clip saved before rows kept it. */
    animMs: () => (S ? S.animMs : null),
    /* Harness only: switch recording and the journal's notes off, for the
     * proof that the flight is the same with them off. */
    setRecording(on) {
      recording = Boolean(on);
      journal.setLogging(Boolean(on));
    },
    harness: () => ({
      api: api(),
      view: () => (S ? view() : null),
      setRig: (r, target) => setRig(r, target),
      speeds: SPEEDS,
      /* The edit clock and the export driver, for scripts/edit-play-check.js. */
      edit: () => (S ? S.history.current : null),
      plan: () => {
        if (!S) {
          return null;
        }
        const plan = planNow();
        return { n: plan.n, fps: plan.fps, clipT: Array.from(plan.clipT) };
      },
      stepLog: (on) => {
        if (S) {
          S.stepLog = on ? [] : null;
        }
      },
      stepped: () => (S && S.stepLog ? S.stepLog : []),
      /* A job of the export driver's shape, run on the current edit. */
      runJob: (job, fps = clockFps) => {
        clockFps = fps;
        const edit = S.history.current;
        return runJob(job, ed.planMovie(edit, fps), edit);
      },
      /* The camera one shot's camera would have at t, and the one on screen. */
      poseOf: (cam, t) => {
        const pose = evaluate(camCtx, cam.rig, cam.p, cam.target, t, createPose(), cam.watch);
        return { pos: pose.pos.slice(), quat: pose.quat.slice(), fov: pose.fov };
      },
      camera: () => {
        const c = shell.camera;
        return { pos: c.position.toArray(), quat: c.quaternion.toArray(), fov: c.fov };
      },
      clip: () => (S ? S.clip : null),
      clipPartKinds: () => (S ? S.clip.meta.parts.map((p) => PART_KINDS[p.kind]) : []),
      smokePuffs: () => (S ? S.scene.smoke.live() : 0),
      smokeFitted: () => Boolean(S && S.clip.meta.fit && S.clip.meta.fit.entry && S.clip.meta.fit.entry.addons.includes('smoke')),
      /* The peers as the replay drew them this frame. */
      peers: () => (S && S.scene.peers ? S.scene.peers.summary().map((p) => ({
        ...p, ndc: vNdc.set(p.at[0], p.at[1], p.at[2]).project(shell.camera).toArray(),
      })) : []),
      /* The clip's row for a ring row logged live, or -1 outside it. */
      clipRow: (ringRow) => {
        if (!S || S.ringFirst < 0) {
          return -1;
        }
        const k = (ringRow - S.ringFirst + rec.capacity) % rec.capacity;
        return k < S.clip.n ? k : -1;
      },
      clipTime: (k) => (S ? S.clip.time[k] : null),
      /* The map's animation clock row k was drawn at, or null. */
      clipAnim: (k) => (S && S.clip.anim ? S.clip.anim[k] : null),
      /* Every peer the recorder takes from now on, with its ring row. */
      peerLog: (on) => {
        peerLog = on ? [] : null;
      },
      peerLogged: () => peerLog || [],
      /* Combat's paper as the replay drew it this frame. */
      paper: () => {
        if (!S || !S.scene.paper) {
          return null;
        }
        const out = S.scene.paper.summary();
        /* How many of each ribbon's nodes are in the picture. */
        for (const r of out.ribbons) {
          r.seen = r.nodes.filter((m) => {
            vNdc.set(m[0], m[1], m[2]).project(shell.camera);
            return Math.abs(vNdc.x) < 1 && Math.abs(vNdc.y) < 1 && vNdc.z < 1;
          }).length;
        }
        return out;
      },
      /* Every ribbon the recorder takes from now on (its head, middle and
       * end nodes as drawn), with its ring row. */
      paperLog: (on) => {
        paperLog = on ? [] : null;
      },
      paperLogged: () => paperLog || [],
      /* The clip's cuts and SCHWINGs, on its clock. */
      paperEvents: () => (S && S.clip.paper ? S.clip.paper.events : []),
      /* A war's explosions in the clip, on its clock, and what the replay
       * drew of them this frame. */
      booms: () => (S && S.clip.paper ? S.clip.paper.events.filter((e) => e.type === 'boom').map((e) => e.t) : []),
      boomFx: () => (S && S.scene.paper ? S.scene.paper.summary().booms : null),
    }),
  };
}

